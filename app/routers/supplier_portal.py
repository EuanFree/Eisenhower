"""Supplier Portal API router — Isolated subcontractor boundary tenant.

This module provides the REST API endpoints for the isolated supplier
portal.  External tier-1/tier-2 subcontractors use these endpoints to
manage their contractual work packages, log progress, submit deliverables,
and upload schedule updates — all without exposure to the prime master
schedule, EVM cost rates, or sibling work packages.

Security Model
~~~~~~~~~~~~~~

Every endpoint enforces the Subcontractor ABAC filter:

1. The user must have ``is_subcontractor_user == True``.
2. The user's ``assigned_vendor_cage`` must match the node's
   ``vendor_cage_code`` in ``custom_attributes``.
3. All returned data has prime EVM cost fields replaced with
   ``'[RESTRICTED]'``.
4. Parent programme hierarchy paths are truncated to show only the
   boundary node and below.

Endpoints
~~~~~~~~~

- ``GET /tasks`` — Returns the filtered subset of contractual boundary
  work packages assigned to the supplier's CAGE code.
- ``POST /tasks/{id}/progress`` — Allows suppliers to log progress
  percentage, remaining duration, and notes.
- ``GET /cdrl`` — Returns the deliverable in-tray with statutory
  countdown clocks and customer status dispositions.
- ``POST /cdrl/{id}/submit`` — Allows suppliers to attach SDRL documents
  directly into the DocumentArtifact vault with automated metadata
  sanitization.
- ``POST /schedule/upload`` — Uploads monthly .xer or .xml schedule
  updates, triggering the automated delta-validation engine.
- ``GET /profile`` — Returns the supplier's profile information.

Data Isolation
~~~~~~~~~~~~~~

Subcontractors can never see:

- Parent programme roots or sibling work packages.
- Prime contractor EVM cost rates (BAC, PV, EV, AC).
- ODAC permissions or internal security caveats.
- Tasks assigned to other vendor CAGE codes.
- Full ltree paths above the boundary node.

Usage
~~~~~

.. code-block:: python

    # Get tasks for a subcontractor
    GET /api/v1/supplier-portal/tasks

    # Log progress on a task
    POST /api/v1/supplier-portal/tasks/{task_id}/progress
    {
        "percent_complete": 45.0,
        "remaining_duration_days": 12.0,
        "notes": "Integration testing in progress"
    }

    # Submit a CDRL deliverable
    POST /api/v1/supplier-portal/cdrl/{cdrl_id}/submit
    {
        "file_name": "radar_test_report.pdf",
        "file_size_bytes": 2048000,
        "mime_type": "application/pdf",
        "sha256_checksum": "abc123...",
        "s3_object_key": "supplier/3K9X2/cdrl/abc123.pdf"
    }
"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import Optional
from uuid import UUID, uuid4
from datetime import datetime, timezone, date

from app.database import get_db
from app.models.models import (
    User,
    UniversalBreakdownNode,
    PortfolioNode,
    ContractDeliverable,
    NodeBlocker,
    VerificationTestCase,
    DocumentArtifact,
    ForensicAuditLog,
    SubcontractorSubmission,
    SubcontractorFormat,
    SubmissionStatus,
)
from app.schemas.supplier_schemas import (
    SupplierTaskResponse,
    SupplierTaskListResponse,
    SupplierProgressUpdate,
    SupplierProgressResponse,
    SupplierCDRLSubmission,
    SupplierCDRLResponse,
    SupplierCDRLItem,
    SupplierCDRLListResponse,
    SupplierScheduleUploadResponse,
    SupplierProfileResponse,
)
from app.utils.auth import get_current_user
from app.core.supplier_abac import (
    is_subcontractor_user,
    check_node_access,
    mask_parent_hierarchy,
    get_subcontractor_accessible_nodes,
    get_subcontractor_boundary_nodes,
)

router = APIRouter()


# ============================================================================
# Helper: Enforce subcontractor gate
# ============================================================================

def enforce_subcontractor_gate(user: User) -> None:
    """Verify the user is a subcontractor with a valid CAGE code.

    Parameters
    ----------
    user : User
        The authenticated user.

    Raises
    ------
    HTTPException
        403 if the user is not a subcontractor or lacks a CAGE code.
    """
    if not is_subcontractor_user(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: this endpoint is for authorised subcontractors only.",
        )
    if not user.assigned_vendor_cage:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: no vendor CAGE code assigned to this account.",
        )


# ============================================================================
# GET /tasks — Filtered task list
# ============================================================================

@router.get("/tasks")
def get_supplier_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the filtered subset of contractual boundary work packages.

    Only tasks where ``vendor_cage_code`` matches the user's
    ``assigned_vendor_cage`` are returned.  All prime EVM cost data
    is masked, and parent programme hierarchy paths are truncated.

    Returns
    -------
    SupplierTaskListResponse
        List of masked task nodes accessible to the subcontractor.
    """
    enforce_subcontractor_gate(current_user)

    # Get all accessible nodes with masking
    accessible_nodes = get_subcontractor_accessible_nodes(db, current_user)

    # Build task response list
    tasks: list[SupplierTaskResponse] = []
    for node_data in accessible_nodes:
        # Count active blockers
        node_id = node_data.get("id")
        blockers_count = 0
        has_active_blocker = False
        if node_id:
            try:
                blocker_stmt = select(NodeBlocker).where(
                    NodeBlocker.portfolio_node_id == node_id,
                    NodeBlocker.resolved_at.is_(None),
                )
                blockers = db.execute(blocker_stmt).scalars().all()
                blockers_count = len(blockers)
                has_active_blocker = blockers_count > 0
            except Exception:
                pass

        # Get V&V test summary
        vv_summary = None
        if node_id:
            try:
                vv_stmt = select(VerificationTestCase).where(
                    VerificationTestCase.portfolio_node_id == node_id,
                )
                vv_tests = db.execute(vv_stmt).scalars().all()
                if vv_tests:
                    passed = sum(1 for t in vv_tests if t.status.value == "PASSED" or t.status.value == "WAIVED")
                    vv_summary = {"passed": passed, "total": len(vv_tests)}
            except Exception:
                pass

        # Get linked CDRL
        linked_cdrl_code = None
        if node_id:
            try:
                cdrl_stmt = select(ContractDeliverable).where(
                    ContractDeliverable.portfolio_node_id == node_id,
                )
                cdrl = db.execute(cdrl_stmt).scalars().first()
                if cdrl:
                    linked_cdrl_code = cdrl.cdrl_sequence_number
            except Exception:
                pass

        # Get total float from custom_attributes
        total_float = None
        is_critical = False
        attrs = node_data.get("custom_attributes") or {}
        schedule = attrs.get("schedule", {})
        if isinstance(schedule, dict):
            tf = schedule.get("total_float")
            if tf is not None:
                total_float = int(tf)
                is_critical = total_float <= 0

        task = SupplierTaskResponse(
            id=node_data.get("id"),
            code=node_data.get("code", ""),
            name=node_data.get("name", ""),
            path=node_data.get("path", ""),
            path_masked=node_data.get("path_masked", False),
            security_classification=node_data.get("security_classification", "OFFICIAL"),
            delivery_mode=node_data.get("delivery_mode"),
            planned_start_date=node_data.get("planned_start_date"),
            planned_end_date=node_data.get("planned_end_date"),
            actual_start_date=node_data.get("actual_start_date"),
            actual_end_date=node_data.get("actual_end_date"),
            percent_complete=node_data.get("percent_complete", 0.0) or 0.0,
            total_float=total_float,
            is_critical=is_critical,
            has_active_blocker=has_active_blocker,
            blockers_count=blockers_count,
            vendor_cage_code=current_user.assigned_vendor_cage,
            linked_cdrl_code=linked_cdrl_code,
            vv_test_summary=vv_summary,
            version_id=node_data.get("version_id", 1),
        )
        tasks.append(task)

    return SupplierTaskListResponse(
        tasks=tasks,
        total_count=len(tasks),
        vendor_cage_code=current_user.assigned_vendor_cage,
    )


# ============================================================================
# POST /tasks/{id}/progress — Log progress
# ============================================================================

@router.post("/tasks/{task_id}/progress")
def update_supplier_task_progress(
    task_id: str,
    progress: SupplierProgressUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log progress percentage, remaining duration, and notes.

    Subcontractors can update the physical percent complete, log hours,
    and provide status notes on their assigned work packages.

    The percent_complete cannot decrease — if the new value is less than
    the current value, the update is rejected with HTTP 400.

    Parameters
    ----------
    task_id : str
        UUID of the task being updated.
    progress : SupplierProgressUpdate
        Progress update data.

    Returns
    -------
    SupplierProgressResponse
        Confirmation with previous and new progress values.

    Raises
    ------
    HTTPException
        403 if the user cannot access this task.
        404 if the task does not exist.
        400 if progress would decrease.
    """
    enforce_subcontractor_gate(current_user)

    # Load the node
    node = db.get(UniversalBreakdownNode, task_id)
    if node is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found.",
        )

    # Check access
    if not check_node_access(current_user, node):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: this task is not assigned to your vendor.",
        )

    # Get current progress
    portfolio_node = db.get(PortfolioNode, task_id)
    previous_percent = (portfolio_node.percent_complete or 0.0) if portfolio_node else 0.0

    # Progress cannot decrease
    if progress.percent_complete < previous_percent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Progress cannot decrease from {previous_percent:.1f}% to {progress.percent_complete:.1f}%.",
        )

    # Apply the update
    if portfolio_node:
        portfolio_node.percent_complete = progress.percent_complete

        # Update custom_attributes with progress metadata
        attrs = portfolio_node.custom_attributes or {}
        if progress.remaining_duration_days is not None:
            attrs["remaining_duration_days"] = progress.remaining_duration_days
        if progress.notes:
            attrs["supplier_notes"] = progress.notes
            attrs["supplier_notes_at"] = datetime.now(timezone.utc).isoformat()
        if progress.hours_logged_today is not None:
            today_str = date.today().isoformat()
            hour_logs = attrs.get("hour_logs", {})
            hour_logs[today_str] = progress.hours_logged_today
            attrs["hour_logs"] = hour_logs
        if progress.forecast_finish_date:
            attrs["forecast_finish_date"] = progress.forecast_finish_date.isoformat()

        portfolio_node.custom_attributes = attrs

    db.commit()

    # Record audit log
    ForensicAuditLog.create_entry(
        db=db,
        action_type="UPDATE",
        entity_type="PortfolioNode",
        entity_id=task_id,
        json_diff={
            "progress_update": {
                "previous_percent": previous_percent,
                "new_percent": progress.percent_complete,
                "updated_by": current_user.username,
                "vendor_cage": current_user.assigned_vendor_cage,
            }
        },
        user_upn=current_user.email,
    )

    return SupplierProgressResponse(
        task_id=UUID(task_id),
        previous_percent_complete=previous_percent,
        new_percent_complete=progress.percent_complete,
        updated_at=datetime.now(timezone.utc),
        message=f"Progress updated from {previous_percent:.1f}% to {progress.percent_complete:.1f}%.",
    )


# ============================================================================
# GET /cdrl — Deliverable in-tray
# ============================================================================

@router.get("/cdrl")
def get_supplier_cdrl_list(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the deliverable in-tray for the subcontractor.

    Lists all CDRL/SDRL items linked to the subcontractor's assigned
    work packages, with statutory countdown clocks and customer status
    dispositions.

    Returns
    -------
    SupplierCDRLListResponse
        List of CDRL items with review deadline countdowns.
    """
    enforce_subcontractor_gate(current_user)

    # Get boundary node IDs for this vendor
    boundary_nodes = get_subcontractor_boundary_nodes(db, current_user.assigned_vendor_cage or "")
    boundary_ids = {str(n.id) for n in boundary_nodes}

    # Also include descendants
    boundary_paths = [n.path for n in boundary_nodes]
    stmt = select(UniversalBreakdownNode).where(UniversalBreakdownNode.is_active == True)
    all_nodes = db.execute(stmt).scalars().all()
    accessible_ids = set(boundary_ids)
    for node in all_nodes:
        for bpath in boundary_paths:
            if node.path.startswith(bpath + "."):
                accessible_ids.add(str(node.id))
                break

    # Query CDRLs linked to accessible nodes
    cdrl_stmt = select(ContractDeliverable)
    cdrls = db.execute(cdrl_stmt).scalars().all()

    deliverables: list[SupplierCDRLItem] = []
    for cdrl in cdrls:
        # Check if this CDRL is linked to an accessible node
        if cdrl.portfolio_node_id and str(cdrl.portfolio_node_id) not in accessible_ids:
            continue

        # Calculate days until review deadline
        days_until_review_deadline = None
        if cdrl.review_deadline_date:
            delta = cdrl.review_deadline_date - date.today()
            days_until_review_deadline = delta.days

        item = SupplierCDRLItem(
            id=cdrl.id,
            cdrl_sequence_number=cdrl.cdrl_sequence_number,
            title=cdrl.title,
            did_reference=cdrl.did_reference,
            revision=cdrl.revision,
            status=cdrl.status.value if cdrl.status else "DRAFTING",
            contractual_due_date=cdrl.contractual_due_date,
            actual_submission_date=cdrl.actual_submission_date,
            review_deadline_date=cdrl.review_deadline_date,
            days_until_review_deadline=days_until_review_deadline,
        )
        deliverables.append(item)

    return SupplierCDRLListResponse(
        deliverables=deliverables,
        total_count=len(deliverables),
    )


# ============================================================================
# POST /cdrl/{cdrl_id}/submit — Submit SDRL document
# ============================================================================

@router.post("/cdrl/{cdrl_id}/submit")
def submit_supplier_cdrl(
    cdrl_id: str,
    submission: SupplierCDRLSubmission,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit an SDRL document into the DocumentArtifact vault.

    The submission triggers automated metadata sanitization and records
    the document in the vault.  The CDRL status is updated to SUBMITTED
    and the actual_submission_date is set.

    Parameters
    ----------
    cdrl_id : str
        UUID of the ContractDeliverable being submitted.
    submission : SupplierCDRLSubmission
        Document metadata and S3 storage information.

    Returns
    -------
    SupplierCDRLResponse
        Confirmation with status transition details.

    Raises
    ------
    HTTPException
        403 if the user cannot access this CDRL.
        404 if the CDRL does not exist.
    """
    enforce_subcontractor_gate(current_user)

    # Load the CDRL
    cdrl = db.get(ContractDeliverable, cdrl_id)
    if cdrl is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CDRL {cdrl_id} not found.",
        )

    # Check access via linked portfolio node
    if cdrl.portfolio_node_id:
        node = db.get(UniversalBreakdownNode, cdrl.portfolio_node_id)
        if node and not check_node_access(current_user, node):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: this deliverable is not assigned to your vendor.",
            )

    previous_status = cdrl.status.value if cdrl.status else "DRAFTING"

    # Update CDRL status
    from app.models.models import CDRLStatus
    cdrl.status = CDRLStatus.SUBMITTED
    cdrl.actual_submission_date = date.today()

    # Calculate review deadline
    if cdrl.actual_submission_date:
        cdrl.review_deadline_date = cdrl.actual_submission_date.replace(
            day=cdrl.actual_submission_date.day + cdrl.review_window_days
        ) if cdrl.review_window_days else None

    # Create DocumentArtifact record
    artifact = DocumentArtifact(
        id=uuid4(),
        portfolio_node_id=cdrl.portfolio_node_id,
        cdrl_id=cdrl_id,
        file_name=submission.file_name,
        file_size_bytes=submission.file_size_bytes,
        mime_type=submission.mime_type,
        s3_object_key=submission.s3_object_key,
        sha256_checksum=submission.sha256_checksum,
        security_classification=cdrl.security_classification if hasattr(cdrl, 'security_classification') else "OFFICIAL",
        uploaded_by_user_id=current_user.id,
        is_active=True,
    )
    db.add(artifact)

    # Record audit log
    ForensicAuditLog.create_entry(
        db=db,
        action_type="CDRL_SUBMIT",
        entity_type="ContractDeliverable",
        entity_id=cdrl_id,
        json_diff={
            "cdrl_sequence": cdrl.cdrl_sequence_number,
            "file_name": submission.file_name,
            "submitted_by": current_user.username,
            "vendor_cage": current_user.assigned_vendor_cage,
            "submission_notes": submission.submission_notes,
        },
        user_upn=current_user.email,
    )

    db.commit()

    return SupplierCDRLResponse(
        cdrl_id=UUID(cdrl_id),
        cdrl_sequence_number=cdrl.cdrl_sequence_number,
        title=cdrl.title,
        previous_status=previous_status,
        new_status="SUBMITTED",
        submitted_at=datetime.now(timezone.utc),
        message=f"CDRL {cdrl.cdrl_sequence_number} submitted successfully.",
    )


# ============================================================================
# POST /schedule/upload — Upload schedule file
# ============================================================================

@router.post("/schedule/upload")
async def upload_supplier_schedule(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a monthly .xer or .xml schedule update.

    The upload triggers the automated subcontractor ingest pipeline,
    which validates the schedule against contractual boundary gates.

    Parameters
    ----------
    file : UploadFile
        Schedule file (.xer or .xml).

    Returns
    -------
    SupplierScheduleUploadResponse
        Submission ID and initial status.

    Raises
    ------
    HTTPException
        400 if the file format is not supported.
    """
    enforce_subcontractor_gate(current_user)

    # Determine file format
    filename = file.filename or ""
    if filename.endswith(".xer"):
        file_format = SubcontractorFormat.PRIMAVERA_XER
    elif filename.endswith(".xml"):
        file_format = SubcontractorFormat.MS_PROJECT_XML
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format. Please upload a .xer (Primavera P6) or .xml (MS Project) file.",
        )

    # Read file content
    content = await file.read()

    # Create submission record
    submission = SubcontractorSubmission(
        id=uuid4(),
        vendor_cage_code=current_user.assigned_vendor_cage or "",
        subcontract_reference=f"SC-{current_user.assigned_vendor_cage}-{date.today().strftime('%Y-%m')}",
        submitted_filename=filename,
        format=file_format,
        status=SubmissionStatus.RECEIVED,
        submitted_at=datetime.now(timezone.utc),
        submission_report={
            "uploaded_by": current_user.username,
            "file_size_bytes": len(content),
            "message": "File received and queued for validation.",
        },
    )
    db.add(submission)
    db.commit()

    return SupplierScheduleUploadResponse(
        submission_id=submission.id,
        status="RECEIVED",
        message=f"Schedule file '{filename}' uploaded successfully. Validation will begin shortly.",
    )


# ============================================================================
# GET /profile — Supplier profile
# ============================================================================

@router.get("/profile")
def get_supplier_profile(
    current_user: User = Depends(get_current_user),
):
    """Return the supplier's profile information.

    Returns
    -------
    SupplierProfileResponse
        Profile data including vendor CAGE code and clearance level.
    """
    enforce_subcontractor_gate(current_user)

    return SupplierProfileResponse(
        user_id=current_user.id,
        username=current_user.username,
        full_name=current_user.full_name,
        vendor_cage_code=current_user.assigned_vendor_cage or "",
        employer_legal_entity=current_user.employer_legal_entity,
        clearance_level=current_user.clearance_level.value if current_user.clearance_level else "OFFICIAL",
        caveats=current_user.caveats,
    )
