"""Subcontractor schedule submission API router.

This module provides the REST API endpoints for the subcontractor
schedule ingest pipeline.  It allows defence subcontractors to submit
schedule updates (Primavera P6 .xer or MS Project .xml) for integration
into the prime contractor's master programme.

The ingest pipeline ensures that external schedule data is validated
against contractual boundary gates before being merged into the live
WBS.  This prevents milestone slippage, logic tampering, and negative
float inflation from subcontractor submissions.

Endpoints
~~~~~~~~~

- ``POST /submissions/upload`` — Upload a schedule file and trigger
  automated validation against contractual boundary gates.
- ``GET /submissions/{id}/validation-report`` — Retrieve the automated
  compliance score and boundary breach report for a submission.
- ``POST /submissions/{id}/approve-merge`` — Approve a validated
  submission and merge it into the live WBS.
- ``GET /submissions`` — List all submissions with optional filtering.
- ``GET /submissions/{id}`` — Get a single submission by ID.
- ``POST /submissions/{id}/staging-diff`` — Generate the staging diff
  showing the impact of merging the submission.

Workflow
~~~~~~~~

1. A subcontractor (or prime contractor on their behalf) uploads a
   schedule file via ``POST /submissions/upload``.

2. The system parses the file, extracts tasks and dependencies, and
   runs automated DCMA checks against the contractual boundary gates.

3. The validation report is retrieved via
   ``GET /submissions/{id}/validation-report``.  If critical breaches
   are found, the submission is rejected and cannot be merged.

4. If validation passes, the staging diff is generated via
   ``POST /submissions/{id}/staging-diff`` to show the impact on
   the prime schedule.

5. A human reviewer examines the staging diff and approves the merge
   via ``POST /submissions/{id}/approve-merge``.

6. The merge is recorded in the ForensicAuditLog with action type
   ``SUBCONTRACTOR_MERGE``.

Security
~~~~~~~~

All endpoints require JWT authentication.  The submitting user must
have sufficient security clearance to access the target WBS node
(checked via ABAC).  Submissions can only be merged by users with
Manager or Admin role.
"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID

from app.database import get_db
from app.models.models import (
    SubcontractorSubmission,
    SubcontractorFormat,
    SubmissionStatus,
    PortfolioNode,
    User,
)
from app.schemas.schemas import (
    SubcontractorSubmissionCreate,
    SubcontractorSubmissionResponse,
    SubmissionListResponse,
    SubmissionMergeResponse,
    ValidationReport,
    StagingDiff,
)
from app.utils.auth import get_current_user
from app.core.abac import is_node_visible, has_sufficient_clearance
from app.services.subcontractor_ingest import (
    parse_external_schedule,
    validate_against_contractual_boundary,
    generate_staging_diff,
    merge_submission_to_live,
)

router = APIRouter()


@router.post("/submissions/upload")
def upload_submission(
    vendor_cage_code: str = Form(...),
    subcontract_reference: str = Form(...),
    target_wbs_root_id: str = Form(...),
    file_format: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a subcontractor schedule file and trigger automated validation.

    This endpoint accepts a schedule file (Primavera P6 .xer or MS Project
    .xml) along with metadata identifying the vendor, subcontract reference,
    and target integration boundary work package.

    On upload, the system:

    1. Creates a ``SubcontractorSubmission`` record with status ``RECEIVED``.
    2. Parses the file to extract tasks and dependencies.
    3. Runs automated DCMA checks against the contractual boundary gates.
    4. Updates the submission status to ``STAGED_READY`` (if validation
       passes) or ``REJECTED_BREACH`` (if critical breaches are found).

    Parameters
    ----------
    vendor_cage_code : str
        NATO/CAGE code of the submitting vendor.
    subcontract_reference : str
        Subcontract reference number.
    target_wbs_root_id : str
        UUID of the integration boundary work package in the prime WBS.
    file_format : str
        File format: 'PRIMAVERA_XER' or 'MS_PROJECT_XML'.
    file : UploadFile
        The uploaded schedule file.
    db : Session
        Database session.
    current_user : User
        Authenticated user submitting the file.

    Returns
    -------
    SubcontractorSubmissionResponse
        The created submission with validation results.

    Raises
    ------
    HTTPException
        404 if the target WBS node is not found, 403 if clearance is
        insufficient, 400 if the file format is invalid.
    """
    # Validate file format
    if file_format not in ("PRIMAVERA_XER", "MS_PROJECT_XML"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file format: {file_format}. Must be PRIMAVERA_XER or MS_PROJECT_XML.",
        )

    # Validate target WBS root node exists
    try:
        target_uuid = UUID(target_wbs_root_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid target_wbs_root_id: {target_wbs_root_id}",
        )

    target_node = db.query(PortfolioNode).filter(
        PortfolioNode.id == target_uuid
    ).first()

    if not target_node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Target WBS root node {target_wbs_root_id} not found",
        )

    # Check ABAC clearance for the target node
    if not is_node_visible(
        current_user.clearance_level,
        current_user.caveats or [],
        target_node,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient security clearance for the target WBS node",
        )

    # Read the file content
    file_content = file.file.read()
    file.file.seek(0)

    # Create the submission record
    submission = SubcontractorSubmission(
        vendor_cage_code=vendor_cage_code,
        subcontract_reference=subcontract_reference,
        target_wbs_root_id=target_uuid,
        submitted_filename=file.filename or "unknown",
        format=SubcontractorFormat(file_format),
        status=SubmissionStatus.VALIDATING,
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    # Parse the file
    import io
    try:
        parsed_tasks, parsed_deps = parse_external_schedule(
            io.BytesIO(file_content),
            file_format,
        )
    except ValueError as e:
        submission.status = SubmissionStatus.REJECTED_BREACH
        submission.submission_report = {
            "compliance_score": 0.0,
            "total_tasks": 0,
            "total_dependencies": 0,
            "boundary_breaches": [{
                "breach_type": "PARSE_ERROR",
                "severity": "CRITICAL",
                "description": f"Failed to parse file: {str(e)}",
            }],
            "has_critical_breaches": True,
            "validation_status": "FAILED",
        }
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse file: {str(e)}",
        )

    # Run validation against contractual boundary
    try:
        validation_report = validate_against_contractual_boundary(
            submission.id,
            parsed_tasks,
            parsed_deps,
            db,
        )
    except ValueError as e:
        submission.status = SubmissionStatus.REJECTED_BREACH
        submission.submission_report = {
            "compliance_score": 0.0,
            "total_tasks": len(parsed_tasks),
            "total_dependencies": len(parsed_deps),
            "boundary_breaches": [{
                "breach_type": "VALIDATION_ERROR",
                "severity": "CRITICAL",
                "description": str(e),
            }],
            "has_critical_breaches": True,
            "validation_status": "FAILED",
        }
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Validation error: {str(e)}",
        )

    # Refresh the submission to get the updated status
    db.refresh(submission)

    return _submission_to_response(submission, db)


@router.get("/submissions/{submission_id}/validation-report")
def get_validation_report(
    submission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve the automated validation report for a submission.

    This endpoint returns the compliance score, boundary breach list,
    and staging diff (if available) for a specific submission.

    The validation report is generated automatically when a file is
    uploaded.  It contains:

    - **Compliance score** (0–100%): Overall compliance with contractual
      boundary gates.  A score of 100% means no breaches were found.
    - **Boundary breaches**: List of contractual boundary violations
      found during validation, with severity and description.
    - **Staging diff**: If available, shows the impact of merging the
      submission on the prime schedule (unchanged, shifted, and newly
      critical tasks).

    Parameters
    ----------
    submission_id : str
        UUID of the submission.
    db : Session
        Database session.
    current_user : User
        Authenticated user requesting the report.

    Returns
    -------
    dict
        The validation report containing compliance score, boundary
        breaches, and optional staging diff.

    Raises
    ------
    HTTPException
        404 if the submission is not found, 403 if clearance is
        insufficient.
    """
    try:
        sub_uuid = UUID(submission_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid submission_id: {submission_id}",
        )

    submission = db.query(SubcontractorSubmission).filter(
        SubcontractorSubmission.id == sub_uuid
    ).first()

    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Submission {submission_id} not found",
        )

    # Check ABAC clearance for the target node
    target_node = db.query(PortfolioNode).filter(
        PortfolioNode.id == submission.target_wbs_root_id
    ).first()

    if target_node and not is_node_visible(
        current_user.clearance_level,
        current_user.caveats or [],
        target_node,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient security clearance for this submission",
        )

    response = _submission_to_response(submission, db)

    return {
        "submission": response,
        "validation_report": (
            ValidationReport(**submission.submission_report)
            if submission.submission_report
            else None
        ),
        "staging_diff": (
            StagingDiff(**submission.submission_report.get("staging_diff", {}))
            if submission.submission_report and "staging_diff" in submission.submission_report
            else None
        ),
    }


@router.post("/submissions/{submission_id}/approve-merge")
def approve_and_merge_submission(
    submission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Approve a validated submission and merge it into the live WBS.

    This endpoint commits the subcontractor's proposed tasks and
    dependencies into the live WBS in a single atomic transaction.
    It records a ForensicAuditLog entry with action type
    ``SUBCONTRACTOR_MERGE``.

    Only submissions in ``STAGED_READY`` status can be merged.  The
    approving user must have Manager or Admin role.

    Parameters
    ----------
    submission_id : str
        UUID of the submission to merge.
    db : Session
        Database session.
    current_user : User
        Authenticated user approving the merge.

    Returns
    -------
    SubmissionMergeResponse
        Merge result with task/dependency counts and audit log ID.

    Raises
    ------
    HTTPException
        404 if the submission is not found, 403 if the user is not
        authorised, 409 if the submission is not in STAGED_READY status.
    """
    # Check user role
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin and Manager roles can approve subcontractor merges",
        )

    try:
        sub_uuid = UUID(submission_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid submission_id: {submission_id}",
        )

    submission = db.query(SubcontractorSubmission).filter(
        SubcontractorSubmission.id == sub_uuid
    ).first()

    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Submission {submission_id} not found",
        )

    # Check ABAC clearance for the target node
    target_node = db.query(PortfolioNode).filter(
        PortfolioNode.id == submission.target_wbs_root_id
    ).first()

    if target_node and not is_node_visible(
        current_user.clearance_level,
        current_user.caveats or [],
        target_node,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient security clearance for this submission",
        )

    # Check submission status
    if submission.status != SubmissionStatus.STAGED_READY:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Submission is in '{submission.status.value}' status; "
                f"only 'STAGED_READY' submissions can be merged."
            ),
        )

    # Perform the merge
    try:
        merge_result = merge_submission_to_live(
            submission_id=sub_uuid,
            user_id=current_user.id,
            user_upn=current_user.email or "unknown",
            db=db,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Merge failed: {str(e)}",
        )

    return SubmissionMergeResponse(**merge_result)


@router.post("/submissions/{submission_id}/staging-diff")
def generate_staging_diff_endpoint(
    submission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate the staging diff for a submission.

    This endpoint ephemerally injects the subcontractor's proposed DAG
    into a cloned sandbox branch, runs CPM forward/backward passes,
    and calculates the resulting float impact on prime contractual
    delivery dates.

    The staging diff categorises tasks into:

    - **Unchanged**: Tasks whose dates are not affected by the merge.
    - **Shifted**: Tasks whose dates would shift as a result of the merge.
    - **Newly Critical**: Tasks that would become newly critical (TF ≤ 0).

    Parameters
    ----------
    submission_id : str
        UUID of the submission.
    db : Session
        Database session.
    current_user : User
        Authenticated user requesting the diff.

    Returns
    -------
    dict
        The staging diff containing unchanged, shifted, and newly
        critical task lists, plus total float variance.

    Raises
    ------
    HTTPException
        404 if the submission is not found, 403 if clearance is
        insufficient.
    """
    try:
        sub_uuid = UUID(submission_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid submission_id: {submission_id}",
        )

    submission = db.query(SubcontractorSubmission).filter(
        SubcontractorSubmission.id == sub_uuid
    ).first()

    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Submission {submission_id} not found",
        )

    # Check ABAC clearance for the target node
    target_node = db.query(PortfolioNode).filter(
        PortfolioNode.id == submission.target_wbs_root_id
    ).first()

    if target_node and not is_node_visible(
        current_user.clearance_level,
        current_user.caveats or [],
        target_node,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient security clearance for this submission",
        )

    # Generate the staging diff
    try:
        staging_diff = generate_staging_diff(sub_uuid, db)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Staging diff generation failed: {str(e)}",
        )

    return {
        "staging_diff": StagingDiff(**staging_diff),
    }


@router.get("/submissions")
def list_submissions(
    vendor_cage_code: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all subcontractor submissions with optional filtering.

    Parameters
    ----------
    vendor_cage_code : str or None
        Filter by vendor CAGE code.
    status_filter : str or None
        Filter by submission status (e.g., 'STAGED_READY', 'REJECTED_BREACH').
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    SubmissionListResponse
        List of submissions matching the filters.
    """
    query = db.query(SubcontractorSubmission)

    if vendor_cage_code:
        query = query.filter(
            SubcontractorSubmission.vendor_cage_code == vendor_cage_code
        )

    if status_filter:
        query = query.filter(
            SubcontractorSubmission.status == status_filter
        )

    submissions = query.order_by(
        SubcontractorSubmission.submitted_at.desc()
    ).all()

    # Filter by ABAC clearance
    accessible = []
    for sub in submissions:
        target_node = db.query(PortfolioNode).filter(
            PortfolioNode.id == sub.target_wbs_root_id
        ).first()
        if target_node and is_node_visible(
            current_user.clearance_level,
            current_user.caveats or [],
            target_node,
        ):
            accessible.append(_submission_to_response(sub, db))

    return SubmissionListResponse(
        submissions=accessible,
        total_count=len(accessible),
    )


@router.get("/submissions/{submission_id}")
def get_submission(
    submission_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single submission by ID.

    Parameters
    ----------
    submission_id : str
        UUID of the submission.
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    SubcontractorSubmissionResponse
        The submission details.

    Raises
    ------
    HTTPException
        404 if the submission is not found, 403 if clearance is
        insufficient.
    """
    try:
        sub_uuid = UUID(submission_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid submission_id: {submission_id}",
        )

    submission = db.query(SubcontractorSubmission).filter(
        SubcontractorSubmission.id == sub_uuid
    ).first()

    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Submission {submission_id} not found",
        )

    # Check ABAC clearance for the target node
    target_node = db.query(PortfolioNode).filter(
        PortfolioNode.id == submission.target_wbs_root_id
    ).first()

    if target_node and not is_node_visible(
        current_user.clearance_level,
        current_user.caveats or [],
        target_node,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient security clearance for this submission",
        )

    return _submission_to_response(submission, db)


# ============================================================================
# Helper functions
# ============================================================================


def _submission_to_response(
    submission: SubcontractorSubmission,
    db: Session,
) -> SubcontractorSubmissionResponse:
    """Convert a SubcontractorSubmission model to a response schema.

    Parameters
    ----------
    submission : SubcontractorSubmission
        The submission model instance.
    db : Session
        Database session.

    Returns
    -------
    SubcontractorSubmissionResponse
        The response schema instance.
    """
    report = submission.submission_report or {}

    validation_report = None
    if report and "compliance_score" in report:
        validation_report = ValidationReport(**report)

    staging_diff = None
    if report and "staging_diff" in report:
        staging_diff = StagingDiff(**report["staging_diff"])

    return SubcontractorSubmissionResponse(
        id=str(submission.id),
        vendor_cage_code=submission.vendor_cage_code,
        subcontract_reference=submission.subcontract_reference,
        target_wbs_root_id=str(submission.target_wbs_root_id),
        submitted_filename=submission.submitted_filename,
        format=submission.format.value,
        status=submission.status.value,
        submitted_at=submission.submitted_at.isoformat(),
        submission_report=report,
        validation_report=validation_report,
        staging_diff=staging_diff,
    )
