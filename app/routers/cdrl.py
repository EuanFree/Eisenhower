"""Contract Deliverables (CDRL/SDRL) and Verification & Validation (V&V) API router.

This module provides the API endpoints for managing contract deliverables
and V&V test cases within the Eisenhower Portfolio Manager.

Contract Deliverables
---------------------

In defence contracting, every contract specifies a set of formal deliverables
(CDRLs — Contract Data Requirements List, or SDRLs — Supplier Data Requirements
List) that must be produced, submitted, reviewed, and accepted.  Each deliverable
follows a lifecycle from DRAFTING through SUBMITTED, UNDER_REVIEW, and finally
ACCEPTED (or REJECTED).

The review window is a critical tracking metric: once a deliverable is submitted,
the contracting authority has a defined number of days to review it.  These
endpoints expose countdown queries so programme managers can see which reviews
are approaching their deadline.

Verification & Validation
-------------------------

V&V test cases provide objective, physical completion gates.  Before a work
package can be marked as 100% complete, all mandatory test cases must be in
either PASSED or WAIVED status.  The V&V gate check endpoint is used by the
progress update flow to enforce this interlock.

Billing Milestone Interlock
---------------------------

Billing milestones linked to CDRLs cannot transition to complete while the
CDRL status is REJECTED or UNDER_REVIEW.  This check is performed in the
V&V gate check endpoint.

Endpoints
~~~~~~~~~

CDRL Operations:
    GET    /api/v1/cdrl/ — List all deliverables with optional filtering.
    POST   /api/v1/cdrl/ — Create a new deliverable.
    GET    /api/v1/cdrl/{id} — Get a single deliverable.
    PUT    /api/v1/cdrl/{id} — Update a deliverable (status transitions, submission).
    DELETE /api/v1/cdrl/{id} — Delete a deliverable.
    GET    /api/v1/cdrl/countdown — List deliverables with review deadlines approaching.

V&V Test Case Operations:
    GET    /api/v1/cdrl/node/{node_id}/vv-tests — List V&V test cases for a node.
    POST   /api/v1/cdrl/node/{node_id}/vv-tests — Create a V&V test case.
    PUT    /api/v1/cdrl/vv-tests/{id} — Update a V&V test case status.
    DELETE /api/v1/cdrl/vv-tests/{id} — Delete a V&V test case.

V&V Gate Check:
    GET    /api/v1/cdrl/node/{node_id}/vv-gate-check — Check if a node can complete.
"""
from datetime import date, timedelta
from typing import List, Optional
from uuid import UUID as PyUUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import (
    ContractDeliverable,
    VerificationTestCase,
    PortfolioNode,
    CDRLStatus,
    VerificationTestCaseStatus,
    User,
)
from app.schemas.schemas import (
    CDRLCreate,
    CDRLUpdate,
    CDRLResponse,
    CDRLListResponse,
    VVCCreate,
    VVCUpdate,
    VVCResponse,
    VVCListResponse,
    VVCGateCheckResponse,
)
from app.utils.auth import get_current_user
from app.core.abac import is_node_visible

router = APIRouter()


# ============================================================================
# Helper: Convert CDRL model to response schema
# ============================================================================

def _cdrl_to_response(cdrl: ContractDeliverable) -> CDRLResponse:
    """Convert a ContractDeliverable model instance to a CDRLResponse schema.

    Parameters
    ----------
    cdrl : ContractDeliverable
        The deliverable model instance.

    Returns
    -------
    CDRLResponse
        The API response schema with computed review deadline countdown.
    """
    days_until = None
    if cdrl.review_deadline_date:
        delta = cdrl.review_deadline_date - date.today()
        days_until = delta.days

    return CDRLResponse(
        id=cdrl.id,
        portfolio_node_id=cdrl.portfolio_node_id,
        cdrl_sequence_number=cdrl.cdrl_sequence_number,
        title=cdrl.title,
        did_reference=cdrl.did_reference,
        revision=cdrl.revision,
        status=cdrl.status,
        contractual_due_date=cdrl.contractual_due_date,
        actual_submission_date=cdrl.actual_submission_date,
        review_window_days=cdrl.review_window_days,
        review_deadline_date=cdrl.review_deadline_date,
        days_until_review_deadline=days_until,
        created_at=cdrl.created_at,
        updated_at=cdrl.updated_at,
    )


def _vvc_to_response(vvc: VerificationTestCase) -> VVCResponse:
    """Convert a VerificationTestCase model instance to a VVCResponse schema.

    Parameters
    ----------
    vvc : VerificationTestCase
        The test case model instance.

    Returns
    -------
    VVCResponse
        The API response schema.
    """
    return VVCResponse(
        id=vvc.id,
        portfolio_node_id=vvc.portfolio_node_id,
        test_identifier=vvc.test_identifier,
        title=vvc.title,
        standard_reference=vvc.standard_reference,
        is_mandatory=vvc.is_mandatory,
        status=vvc.status,
        created_at=vvc.created_at,
        updated_at=vvc.updated_at,
    )


# ============================================================================
# CDRL Endpoints
# ============================================================================

@router.get("/", response_model=CDRLListResponse)
def list_cdrls(
    portfolio_node_id: Optional[str] = Query(None, description="Filter by portfolio node"),
    cdrl_status: Optional[CDRLStatus] = Query(None, description="Filter by status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all contract deliverables with optional filtering.

    Parameters
    ----------
    portfolio_node_id : str or None
        Filter deliverables to a specific portfolio node.
    cdrl_status : CDRLStatus or None
        Filter deliverables by lifecycle status.

    Returns
    -------
    CDRLListResponse
        List of deliverables matching the filters.
    """
    query = db.query(ContractDeliverable)

    if portfolio_node_id:
        try:
            node_uuid = PyUUID(portfolio_node_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid portfolio_node_id format",
            )
        query = query.filter(ContractDeliverable.portfolio_node_id == node_uuid)

    if cdrl_status:
        query = query.filter(ContractDeliverable.status == cdrl_status)

    deliverables = query.order_by(ContractDeliverable.contractual_due_date).all()

    return CDRLListResponse(
        deliverables=[_cdrl_to_response(d) for d in deliverables],
        total=len(deliverables),
    )


@router.post("/", response_model=CDRLResponse)
def create_cdrl(
    cdrl_data: CDRLCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new Contract Deliverable.

    Registers a CDRL or SDRL linked to a portfolio node.  The deliverable
    begins in DRAFTING status.

    Parameters
    ----------
    cdrl_data : CDRLCreate
        The deliverable data.

    Returns
    -------
    CDRLResponse
        The newly created deliverable.
    """
    # Verify the portfolio node exists and user has clearance
    node = db.query(PortfolioNode).filter(
        PortfolioNode.id == cdrl_data.portfolio_node_id
    ).first()
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Portfolio node {cdrl_data.portfolio_node_id} not found",
        )

    if not is_node_visible(current_user.clearance_level, current_user.caveats, node):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient clearance to create deliverable on this node",
        )

    cdrl = ContractDeliverable(
        id=uuid4(),
        portfolio_node_id=cdrl_data.portfolio_node_id,
        cdrl_sequence_number=cdrl_data.cdrl_sequence_number,
        title=cdrl_data.title,
        did_reference=cdrl_data.did_reference,
        revision=cdrl_data.revision,
        status=CDRLStatus.DRAFTING,
        contractual_due_date=cdrl_data.contractual_due_date,
        review_window_days=cdrl_data.review_window_days,
    )

    db.add(cdrl)
    db.commit()
    db.refresh(cdrl)

    return _cdrl_to_response(cdrl)


@router.get("/{cdrl_id}", response_model=CDRLResponse)
def get_cdrl(
    cdrl_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single contract deliverable by ID.

    Parameters
    ----------
    cdrl_id : str
        The UUID of the deliverable.

    Returns
    -------
    CDRLResponse
        The deliverable data.
    """
    try:
        cdrl_uuid = PyUUID(cdrl_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cdrl_id format",
        )

    cdrl = db.query(ContractDeliverable).filter(ContractDeliverable.id == cdrl_uuid).first()
    if not cdrl:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Deliverable {cdrl_id} not found",
        )

    # Check clearance on the associated node
    node = db.query(PortfolioNode).filter(PortfolioNode.id == cdrl.portfolio_node_id).first()
    if node and not is_node_visible(current_user.clearance_level, current_user.caveats, node):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient clearance to view this deliverable",
        )

    return _cdrl_to_response(cdrl)


@router.put("/{cdrl_id}", response_model=CDRLResponse)
def update_cdrl(
    cdrl_id: str,
    cdrl_data: CDRLUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing contract deliverable.

    Common updates include changing the status (e.g., DRAFTING -> SUBMITTED),
    setting the actual submission date, or updating the revision.

    When status changes to SUBMITTED and actual_submission_date is set,
    the review_deadline_date is automatically calculated.

    Parameters
    ----------
    cdrl_id : str
        The UUID of the deliverable.
    cdrl_data : CDRLUpdate
        The fields to update.

    Returns
    -------
    CDRLResponse
        The updated deliverable.
    """
    try:
        cdrl_uuid = PyUUID(cdrl_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cdrl_id format",
        )

    cdrl = db.query(ContractDeliverable).filter(ContractDeliverable.id == cdrl_uuid).first()
    if not cdrl:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Deliverable {cdrl_id} not found",
        )

    # Check clearance on the associated node
    node = db.query(PortfolioNode).filter(PortfolioNode.id == cdrl.portfolio_node_id).first()
    if node and not is_node_visible(current_user.clearance_level, current_user.caveats, node):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient clearance to update this deliverable",
        )

    # Apply updates
    update_dict = cdrl_data.dict(exclude_unset=True)

    if "title" in update_dict and update_dict["title"] is not None:
        cdrl.title = update_dict["title"]
    if "revision" in update_dict and update_dict["revision"] is not None:
        cdrl.revision = update_dict["revision"]
    if "status" in update_dict and update_dict["status"] is not None:
        cdrl.status = update_dict["status"]
    if "actual_submission_date" in update_dict:
        cdrl.actual_submission_date = update_dict["actual_submission_date"]
    if "review_window_days" in update_dict and update_dict["review_window_days"] is not None:
        cdrl.review_window_days = update_dict["review_window_days"]

    # Auto-calculate review_deadline_date when submission date is set
    if cdrl.actual_submission_date and cdrl.review_window_days:
        cdrl.review_deadline_date = cdrl.actual_submission_date + timedelta(
            days=cdrl.review_window_days
        )
    elif not cdrl.actual_submission_date:
        cdrl.review_deadline_date = None

    db.commit()
    db.refresh(cdrl)

    return _cdrl_to_response(cdrl)


@router.delete("/{cdrl_id}")
def delete_cdrl(
    cdrl_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a contract deliverable.

    Parameters
    ----------
    cdrl_id : str
        The UUID of the deliverable.

    Returns
    -------
    dict
        Confirmation message.
    """
    try:
        cdrl_uuid = PyUUID(cdrl_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cdrl_id format",
        )

    cdrl = db.query(ContractDeliverable).filter(ContractDeliverable.id == cdrl_uuid).first()
    if not cdrl:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Deliverable {cdrl_id} not found",
        )

    # Check clearance on the associated node
    node = db.query(PortfolioNode).filter(PortfolioNode.id == cdrl.portfolio_node_id).first()
    if node and not is_node_visible(current_user.clearance_level, current_user.caveats, node):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient clearance to delete this deliverable",
        )

    db.delete(cdrl)
    db.commit()

    return {"message": f"Deliverable {cdrl_id} deleted"}


@router.get("/countdown", response_model=CDRLListResponse)
def cdrl_review_countdown(
    days_threshold: int = Query(14, ge=1, le=90, description="Days until deadline threshold"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List deliverables with review deadlines approaching or overdue.

    Returns deliverables that have been submitted and have a review deadline
    within the specified number of days, or that are already overdue.

    Parameters
    ----------
    days_threshold : int
        Only return deliverables whose review deadline is within this many
        days (or already overdue). Default is 14 days.

    Returns
    -------
    CDRLListResponse
        List of deliverables with approaching or overdue review deadlines,
        ordered by urgency (most overdue first).
    """
    today = date.today()
    threshold_date = today + timedelta(days=days_threshold)

    # Find deliverables with review deadlines within the threshold or overdue
    deliverables = (
        db.query(ContractDeliverable)
        .filter(
            ContractDeliverable.review_deadline_date != None,
            ContractDeliverable.review_deadline_date <= threshold_date,
            ContractDeliverable.status.in_([
                CDRLStatus.SUBMITTED,
                CDRLStatus.UNDER_REVIEW,
            ]),
        )
        .order_by(ContractDeliverable.review_deadline_date.asc())
        .all()
    )

    return CDRLListResponse(
        deliverables=[_cdrl_to_response(d) for d in deliverables],
        total=len(deliverables),
    )


# ============================================================================
# V&V Test Case Endpoints
# ============================================================================

@router.get("/node/{node_id}/vv-tests", response_model=VVCListResponse)
def list_vv_tests(
    node_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all V&V test cases for a portfolio node.

    Returns summary statistics including mandatory count, passed count,
    and whether all mandatory tests are satisfied (can_complete).

    Parameters
    ----------
    node_id : str
        The UUID of the portfolio node.

    Returns
    -------
    VVCListResponse
        List of test cases with completion gate summary.
    """
    try:
        node_uuid = PyUUID(node_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid node_id format",
        )

    # Verify node exists and user has clearance
    node = db.query(PortfolioNode).filter(PortfolioNode.id == node_uuid).first()
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Portfolio node {node_id} not found",
        )

    if not is_node_visible(current_user.clearance_level, current_user.caveats, node):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient clearance to view test cases for this node",
        )

    test_cases = (
        db.query(VerificationTestCase)
        .filter(VerificationTestCase.portfolio_node_id == node_uuid)
        .order_by(VerificationTestCase.test_identifier)
        .all()
    )

    mandatory_count = sum(1 for tc in test_cases if tc.is_mandatory)
    passed_count = sum(
        1 for tc in test_cases
        if tc.is_mandatory and tc.status in (
            VerificationTestCaseStatus.PASSED,
            VerificationTestCaseStatus.WAIVED,
        )
    )
    can_complete = mandatory_count > 0 and mandatory_count == passed_count

    return VVCListResponse(
        test_cases=[_vvc_to_response(tc) for tc in test_cases],
        total=len(test_cases),
        mandatory_count=mandatory_count,
        passed_count=passed_count,
        can_complete=can_complete,
    )


@router.post("/node/{node_id}/vv-tests", response_model=VVCResponse)
def create_vv_test(
    node_id: str,
    vvc_data: VVCCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new V&V test case for a portfolio node.

    The test case begins in NOT_RUN status.

    Parameters
    ----------
    node_id : str
        The UUID of the portfolio node.
    vvc_data : VVCCreate
        The test case data.

    Returns
    -------
    VVCResponse
        The newly created test case.
    """
    try:
        node_uuid = PyUUID(node_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid node_id format",
        )

    # Verify node exists and user has clearance
    node = db.query(PortfolioNode).filter(PortfolioNode.id == node_uuid).first()
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Portfolio node {node_id} not found",
        )

    if not is_node_visible(current_user.clearance_level, current_user.caveats, node):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient clearance to create test case on this node",
        )

    # Ensure portfolio_node_id matches the URL path
    if vvc_data.portfolio_node_id != node_uuid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="portfolio_node_id in request body must match the URL path",
        )

    vvc = VerificationTestCase(
        id=uuid4(),
        portfolio_node_id=node_uuid,
        test_identifier=vvc_data.test_identifier,
        title=vvc_data.title,
        standard_reference=vvc_data.standard_reference,
        is_mandatory=vvc_data.is_mandatory,
        status=VerificationTestCaseStatus.NOT_RUN,
    )

    db.add(vvc)
    db.commit()
    db.refresh(vvc)

    return _vvc_to_response(vvc)


@router.put("/vv-tests/{vvc_id}", response_model=VVCResponse)
def update_vv_test(
    vvc_id: str,
    vvc_data: VVCUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing V&V test case.

    The most common update is changing the status from NOT_RUN to PASSED,
    FAILED, or WAIVED.

    Parameters
    ----------
    vvc_id : str
        The UUID of the test case.
    vvc_data : VVCUpdate
        The fields to update.

    Returns
    -------
    VVCResponse
        The updated test case.
    """
    try:
        vvc_uuid = PyUUID(vvc_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid vvc_id format",
        )

    vvc = db.query(VerificationTestCase).filter(VerificationTestCase.id == vvc_uuid).first()
    if not vvc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"V&V test case {vvc_id} not found",
        )

    # Check clearance on the associated node
    node = db.query(PortfolioNode).filter(
        PortfolioNode.id == vvc.portfolio_node_id
    ).first()
    if node and not is_node_visible(current_user.clearance_level, current_user.caveats, node):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient clearance to update this test case",
        )

    # Apply updates
    update_dict = vvc_data.dict(exclude_unset=True)

    if "title" in update_dict and update_dict["title"] is not None:
        vvc.title = update_dict["title"]
    if "status" in update_dict and update_dict["status"] is not None:
        vvc.status = update_dict["status"]
    if "is_mandatory" in update_dict and update_dict["is_mandatory"] is not None:
        vvc.is_mandatory = update_dict["is_mandatory"]

    db.commit()
    db.refresh(vvc)

    return _vvc_to_response(vvc)


@router.delete("/vv-tests/{vvc_id}")
def delete_vv_test(
    vvc_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a V&V test case.

    Parameters
    ----------
    vvc_id : str
        The UUID of the test case.

    Returns
    -------
    dict
        Confirmation message.
    """
    try:
        vvc_uuid = PyUUID(vvc_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid vvc_id format",
        )

    vvc = db.query(VerificationTestCase).filter(VerificationTestCase.id == vvc_uuid).first()
    if not vvc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"V&V test case {vvc_id} not found",
        )

    # Check clearance on the associated node
    node = db.query(PortfolioNode).filter(
        PortfolioNode.id == vvc.portfolio_node_id
    ).first()
    if node and not is_node_visible(current_user.clearance_level, current_user.caveats, node):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient clearance to delete this test case",
        )

    db.delete(vvc)
    db.commit()

    return {"message": f"V&V test case {vvc_id} deleted"}


# ============================================================================
# V&V Gate Check Endpoint
# ============================================================================

@router.get("/node/{node_id}/vv-gate-check", response_model=VVCGateCheckResponse)
def vv_gate_check(
    node_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check whether a portfolio node can be marked as 100% complete.

    This endpoint enforces two completion interlocks:

    1. **V&V Signoff Gate**: If the node has ``requires_vv_signoff = True``,
       all mandatory V&V test cases must be PASSED or WAIVED.

    2. **CDRL Billing Gate**: If the node has any linked CDRLs with status
       REJECTED or UNDER_REVIEW, the node cannot be completed.

    Parameters
    ----------
    node_id : str
        The UUID of the portfolio node.

    Returns
    -------
    VVCGateCheckResponse
        Gate check result indicating whether the node can complete,
        along with any blocking test cases.
    """
    try:
        node_uuid = PyUUID(node_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid node_id format",
        )

    node = db.query(PortfolioNode).filter(PortfolioNode.id == node_uuid).first()
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Portfolio node {node_id} not found",
        )

    if not is_node_visible(current_user.clearance_level, current_user.caveats, node):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient clearance to check this node",
        )

    blocking_tests: List[VVCResponse] = []
    messages: List[str] = []

    # Check 1: V&V signoff gate
    if node.requires_vv_signoff:
        mandatory_tests = (
            db.query(VerificationTestCase)
            .filter(
                VerificationTestCase.portfolio_node_id == node_uuid,
                VerificationTestCase.is_mandatory == True,
                VerificationTestCase.status.notin_(
                    [VerificationTestCaseStatus.PASSED, VerificationTestCaseStatus.WAIVED]
                ),
            )
            .all()
        )

        if mandatory_tests:
            blocking_tests = [_vvc_to_response(tc) for tc in mandatory_tests]
            messages.append(
                f"{len(mandatory_tests)} mandatory V&V test case(s) are not yet PASSED or WAIVED"
            )

    # Check 2: CDRL billing gate
    blocking_cdrls = (
        db.query(ContractDeliverable)
        .filter(
            ContractDeliverable.portfolio_node_id == node_uuid,
            ContractDeliverable.status.in_([
                CDRLStatus.REJECTED,
                CDRLStatus.UNDER_REVIEW,
            ]),
        )
        .all()
    )

    if blocking_cdrls:
        cdrl_names = [d.cdrl_sequence_number for d in blocking_cdrls]
        messages.append(
            f"CDRL(s) {', '.join(cdrl_names)} are REJECTED or UNDER_REVIEW — "
            "cannot complete billing milestone"
        )

    can_complete = len(blocking_tests) == 0 and len(blocking_cdrls) == 0

    if not node.requires_vv_signoff and not blocking_cdrls:
        message = "No completion gates configured — node can be marked complete"
    elif can_complete:
        message = "All completion gates satisfied — node can be marked complete"
    else:
        message = "Cannot complete: " + "; ".join(messages)

    return VVCGateCheckResponse(
        node_id=node_uuid,
        requires_vv_signoff=node.requires_vv_signoff,
        can_complete=can_complete,
        blocking_tests=blocking_tests,
        message=message,
    )
