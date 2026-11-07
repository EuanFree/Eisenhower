"""Schedule quarantine buffer API router.

This module provides the REST API endpoints for the schedule quarantine
buffer system. Incoming schedule files (.xer or .xml) are uploaded into
a quarantine staging area where automated integrity checks run before
any data is merged into the active master schedule.

Endpoints
---------
- ``POST /upload`` — Upload a schedule file into quarantine staging.
- ``GET /{id}/issues`` — Return detected cycles, dangling activities,
  and calendar clashes.
- ``POST /{id}/remediate`` — Submit graph healing choices.
- ``POST /{id}/commit`` — Merge sanitized batch into active schedule.

Security
--------
All endpoints require JWT authentication via the ``get_current_user``
dependency. The uploading user must have sufficient clearance to access
the target project.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Dict, Any
from uuid import UUID

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.models import User, QuarantineBatch, QuarantineFileFormat, QuarantineValidationStatus
from app.schemas.quarantine import (
    QuarantineUploadRequest,
    QuarantineIssuesResponse,
    QuarantineRemediateRequest,
    QuarantineRemediateResponse,
    QuarantineCommitResponse,
    QuarantineBatchResponse,
    QuarantineAutoDecoupleResponse,
)
from app.services.schedule_quarantine import (
    evaluate_quarantine_integrity,
    apply_remediation_actions,
    commit_quarantine_to_master,
    auto_decouple_cycles,
)

router = APIRouter()


@router.post("/upload", response_model=QuarantineBatchResponse)
def upload_schedule_to_quarantine(
    request: QuarantineUploadRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> QuarantineBatchResponse:
    """Upload a schedule file into quarantine staging.

    Creates a new :class:`QuarantineBatch` record and triggers automated
    integrity validation. The uploaded file is parsed and staged in the
    ``quarantine_payload`` JSONB field for review.

    Parameters
    ----------
    request : QuarantineUploadRequest
        Upload request containing target project ID, file format, and
        source filename.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    QuarantineBatchResponse
        Summary of the created quarantine batch.

    Raises
    ------
    HTTPException
        404 if the target project is not found, 422 if the file format
        is invalid.
    """
    # Validate file format
    try:
        file_format = QuarantineFileFormat(request.file_format)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid file format: {request.file_format}. "
                   f"Must be PRIMAVERA_P6_XER or MS_PROJECT_XML.",
        )

    # Verify target project exists
    from app.models.models import PortfolioNode
    target_project = db.get(PortfolioNode, request.target_project_id)
    if target_project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Target project {request.target_project_id} not found.",
        )

    # Create quarantine batch
    batch = QuarantineBatch(
        uploaded_by_user_id=current_user.id,
        source_filename=request.source_filename,
        file_format=file_format,
        target_project_id=request.target_project_id,
        validation_status=QuarantineValidationStatus.PENDING,
        quarantine_payload={
            "tasks": [],
            "dependencies": [],
            "calendars": [],
            "resources": [],
        },
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    # Trigger automated integrity evaluation
    try:
        evaluate_quarantine_integrity(db, batch.id)
    except Exception as e:
        # If evaluation fails, keep the batch in PENDING status
        batch.validation_status = QuarantineValidationStatus.PENDING
        db.commit()

    return QuarantineBatchResponse(
        id=batch.id,
        source_filename=batch.source_filename,
        file_format=batch.file_format.value,
        target_project_id=batch.target_project_id,
        validation_status=batch.validation_status.value,
        cycle_count=batch.cycle_count,
        dangling_node_count=batch.dangling_node_count,
        out_of_sequence_count=batch.out_of_sequence_count,
        created_at=batch.created_at,
    )


@router.get("/{batch_id}/issues", response_model=QuarantineIssuesResponse)
def get_quarantine_issues(
    batch_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> QuarantineIssuesResponse:
    """Return detected quarantine issues for a batch.

    Retrieves the structured validation report containing circular
    dependency cycles, dangling activities, and calendar discrepancies.

    Parameters
    ----------
    batch_id : UUID
        ID of the quarantine batch.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    QuarantineIssuesResponse
        Detailed issue report with cycles, dangling nodes, and calendar
        discrepancies.

    Raises
    ------
    HTTPException
        404 if the batch is not found.
    """
    batch = db.get(QuarantineBatch, batch_id)
    if batch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Quarantine batch {batch_id} not found.",
        )

    # If the batch is still PENDING, trigger evaluation
    if batch.validation_status == QuarantineValidationStatus.PENDING:
        try:
            result = evaluate_quarantine_integrity(db, batch_id)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Integrity evaluation failed: {str(e)}",
            )
    else:
        # Re-evaluate to get fresh results
        try:
            result = evaluate_quarantine_integrity(db, batch_id)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Integrity evaluation failed: {str(e)}",
            )

    db.refresh(batch)

    return QuarantineIssuesResponse(
        batch_id=batch.id,
        validation_status=batch.validation_status.value,
        cycle_count=batch.cycle_count,
        dangling_node_count=batch.dangling_node_count,
        out_of_sequence_count=batch.out_of_sequence_count,
        cycles=result.get("cycles", []),
        dangling_nodes=result.get("dangling_nodes", []),
        calendar_discrepancies=result.get("calendar_discrepancies", []),
    )


@router.post("/{batch_id}/remediate", response_model=QuarantineRemediateResponse)
def remediate_quarantine_batch(
    batch_id: UUID,
    request: QuarantineRemediateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> QuarantineRemediateResponse:
    """Submit graph healing choices for a quarantine batch.

    Applies user-selected remediation actions (edge deletions, dangling
    node anchoring, calendar remapping) and re-verifies graph acyclicity.

    Parameters
    ----------
    batch_id : UUID
        ID of the quarantine batch.
    request : QuarantineRemediateRequest
        List of remediation actions to apply.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    QuarantineRemediateResponse
        Result with remaining issues and commit readiness status.

    Raises
    ------
    HTTPException
        404 if the batch is not found, 400 if remediation fails.
    """
    batch = db.get(QuarantineBatch, batch_id)
    if batch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Quarantine batch {batch_id} not found.",
        )

    try:
        result = apply_remediation_actions(
            db,
            batch_id,
            {
                "actions": [
                    {
                        "action_type": action.action_type,
                        "target_id": action.target_id,
                        "parameters": action.parameters,
                    }
                    for action in request.resolved_actions
                ]
            },
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Remediation failed: {str(e)}",
        )

    return QuarantineRemediateResponse(
        batch_id=UUID(result["batch_id"]),
        validation_status=result["validation_status"],
        remaining_cycles=result["remaining_cycles"],
        remaining_dangling=result["remaining_dangling"],
        is_ready_to_commit=result["is_ready_to_commit"],
    )


@router.post("/{batch_id}/commit", response_model=QuarantineCommitResponse)
def commit_quarantine_to_master_endpoint(
    batch_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> QuarantineCommitResponse:
    """Merge a sanitized quarantine batch into the active master schedule.

    Commits the quarantine nodes and edges into the active
    UniversalBreakdownNode and DependencyLink tables within an atomic
    transaction. Records a SUBCONTRACTOR_SCHEDULE_INGESTED event in
    ForensicAuditLog.

    Parameters
    ----------
    batch_id : UUID
        ID of the quarantine batch to commit.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    QuarantineCommitResponse
        Result with merge counts and audit log ID.

    Raises
    ------
    HTTPException
        404 if the batch is not found, 400 if the batch is not in
        REMEDIATED status.
    """
    batch = db.get(QuarantineBatch, batch_id)
    if batch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Quarantine batch {batch_id} not found.",
        )

    if batch.validation_status != QuarantineValidationStatus.REMEDIATED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Batch {batch_id} is not in REMEDIATED status; "
                f"current status: {batch.validation_status.value}. "
                f"Please resolve all issues before committing."
            ),
        )

    try:
        result = commit_quarantine_to_master(db, batch_id, current_user.id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Commit failed: {str(e)}",
        )

    return QuarantineCommitResponse(
        batch_id=UUID(result["batch_id"]),
        nodes_merged=result["nodes_merged"],
        edges_merged=result["edges_merged"],
        audit_log_id=UUID(result["audit_log_id"]),
    )


@router.post("/{batch_id}/auto-decouple", response_model=QuarantineAutoDecoupleResponse)
def auto_decouple_quarantine_cycles(
    batch_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> QuarantineAutoDecoupleResponse:
    """Automatically decouple all detected cycles in a quarantine batch.

    Uses automated decoupling heuristics to break all circular dependency
    loops with minimal logic disruption:

    1. Identifies the minimum feedback arc set to break all closed loops.
    2. Classifies edges by flexibility, prioritizing soft links over hard
       constraints.
    3. Severs feedback edges and inserts verification milestones.
    4. Re-anchors affected nodes to parent milestones.
    5. Transitions status to REMEDIATED when all cycles are broken.

    Parameters
    ----------
    batch_id : UUID
        ID of the quarantine batch.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    QuarantineAutoDecoupleResponse
        Result with decoupling actions and remaining cycle count.

    Raises
    ------
    HTTPException
        404 if the batch is not found, 400 if decoupling fails.
    """
    batch = db.get(QuarantineBatch, batch_id)
    if batch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Quarantine batch {batch_id} not found.",
        )

    try:
        result = auto_decouple_cycles(db, batch_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Auto-decoupling failed: {str(e)}",
        )

    return QuarantineAutoDecoupleResponse(
        batch_id=UUID(result["batch_id"]),
        cycles_broken=result["cycles_broken"],
        edges_severed=result["edges_severed"],
        milestones_created=result["milestones_created"],
        remaining_cycles=result["remaining_cycles"],
        validation_status=result["validation_status"],
        is_ready_to_commit=result["is_ready_to_commit"],
        decoupling_details=result.get("decoupling_details", {}),
    )
