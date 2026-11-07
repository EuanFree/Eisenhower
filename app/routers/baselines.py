"""API router for Performance Measurement Baseline (PMB) governance.

This router provides endpoints for freezing baselines, comparing live
WBS state against frozen baselines, and managing Baseline Change Requests
(BCRs).

Endpoints
---------

POST   /api/v1/baselines/freeze          — Freeze a new baseline snapshot.
GET    /api/v1/baselines/compare          — Compare live state against a baseline.
GET    /api/v1/baselines/list             — List baselines for a project.
POST   /api/v1/baselines/bcr              — Create a new Baseline Change Request.
PUT    /api/v1/baselines/bcr/{id}         — Update BCR status (approve/reject).
GET    /api/v1/baselines/bcr/{id}         — Get BCR details.
GET    /api/v1/baselines/bcr              — List BCRs by status/tier.

Sub-Tree Locking
~~~~~~~~~~~~~~~~

The ``POST /freeze`` endpoint acquires a sub-tree lock before cloning
the live WBS sub-tree into baseline snapshot rows.  This prevents
concurrent mutations from changing the source tree during the snapshot.
If a lock is already held, HTTP 423 (Locked) is returned.

Security
~~~~~~~~

All endpoints require JWT authentication.  The authenticated user must
have sufficient clearance to access the portfolio nodes involved.

Usage
~~~~~

    # Freeze a new baseline
    POST /api/v1/baselines/freeze
    {
        "root_node_id": "<uuid>",
        "baseline_code": "B0_CONTRACT",
        "name": "Contract Baseline"
    }

    # Compare live state against a baseline
    GET /api/v1/baselines/compare?root_node_id=<uuid>&baseline_id=<uuid>

    # Create a BCR
    POST /api/v1/baselines/bcr
    {
        "bcr_number": "BCR-2024-001",
        "title": "Extend delivery schedule",
        "justification": "Supply chain delays...",
        "tier": "TIER_2_PROJECT_CCB",
        "schedule_finish_slip_days": 14
    }
"""
from datetime import datetime
from typing import Optional
from uuid import UUID
import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.models import (
    User, PortfolioBaseline, BaselineNodeSnapshot, BaselineChangeRequest,
    BaselineChangeRequestStatus, UniversalBreakdownNode, LockOperationType,
)
from app.schemas.schemas import (
    BaselineFreezeRequest,
    BaselineFreezeResponse,
    BaselineResponse,
    BaselineVarianceResponse,
    BaselineVarianceNodeResponse,
    BCRCreate,
    BCRUpdate,
    BCRResponse,
)
from app.services.baseline_engine import (
    freeze_baseline,
    compute_baseline_variance,
    create_bcr,
    update_bcr_status,
)
from app.services.lock_manager import acquire_subtree_lock

router = APIRouter(prefix="/v1/baselines", tags=["baselines"])


@router.post("/freeze", response_model=BaselineFreezeResponse)
def freeze_baseline_endpoint(
    request: BaselineFreezeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Freeze a new Performance Measurement Baseline.

    Clones the entire sub-tree rooted at the specified PortfolioNode
    into baseline snapshot rows.  This creates a point-in-time record
    against which future variance can be measured.

    This endpoint acquires a sub-tree lock before cloning to prevent
    concurrent mutations from changing the source tree during the
    snapshot.  If a lock is already held, HTTP 423 (Locked) is returned.

    Parameters
    ----------
    request : BaselineFreezeRequest
        The freeze request containing the root node ID, baseline code,
        and name.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    BaselineFreezeResponse
        Confirmation of the freeze, including the baseline details and
        the number of snapshots created.

    Raises
    ------
    HTTPException
        404 if the root node is not found.
        400 if the baseline code already exists for this root.
        423 if a sub-tree lock is already held.
    """
    # Find the root node to get its ltree path
    root_node = db.query(UniversalBreakdownNode).filter(
        UniversalBreakdownNode.id == request.root_node_id
    ).first()

    if not root_node:
        raise HTTPException(
            status_code=404,
            detail=f"Root node {request.root_node_id} not found",
        )

    root_path = root_node.path

    try:
        # Acquire sub-tree lock and freeze baseline
        loop = asyncio.new_event_loop()
        try:
            baseline, snapshot_count = loop.run_until_complete(
                _freeze_with_lock(
                    db, root_path, request, current_user.id
                )
            )
        finally:
            loop.close()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return BaselineFreezeResponse(
        baseline=BaselineResponse(
            id=baseline.id,
            root_portfolio_node_id=baseline.root_portfolio_node_id,
            baseline_code=baseline.baseline_code,
            name=baseline.name,
            frozen_at=baseline.frozen_at,
            frozen_by_user_id=baseline.frozen_by_user_id,
            bcr_reference=baseline.bcr_reference,
            is_active_target=baseline.is_active_target,
            snapshot_count=snapshot_count,
        ),
        snapshots_created=snapshot_count,
    )


async def _freeze_with_lock(
    db: Session,
    root_path: str,
    request: BaselineFreezeRequest,
    user_id: int,
) -> tuple:
    """Freeze baseline within a sub-tree lock.

    Parameters
    ----------
    db : Session
        Database session.
    root_path : str
        Ltree path of the root node.
    request : BaselineFreezeRequest
        The freeze request.
    user_id : int
        ID of the user initiating the freeze.

    Returns
    -------
    tuple
        (baseline, snapshot_count) from freeze_baseline.
    """
    async with acquire_subtree_lock(
        db, root_path, LockOperationType.BASELINE_FREEZE, user_id, ttl_seconds=60
    ):
        result = freeze_baseline(
            db=db,
            root_node_id=request.root_node_id,
            baseline_code=request.baseline_code,
            name=request.name,
            frozen_by_user_id=user_id,
            bcr_reference=request.bcr_reference,
        )
        return result


@router.get("/compare", response_model=BaselineVarianceResponse)
def compare_baseline_endpoint(
    root_node_id: UUID = Query(..., description="Root portfolio node ID"),
    baseline_id: UUID = Query(..., description="Baseline ID to compare against"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Compare live WBS state against a frozen baseline.

    Returns a side-by-side variance report showing how the live project
    has drifted from the approved baseline.  For each node, the report
    includes schedule variance (days), cost variance (BAC), critical path
    migration status, and scope drift classification.

    Parameters
    ----------
    root_node_id : UUID
        The root portfolio node whose sub-tree to compare.
    baseline_id : UUID
        The baseline to compare against.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    BaselineVarianceResponse
        Complete variance report with aggregate statistics and
        per-node variance details.

    Raises
    ------
    HTTPException
        404 if the baseline is not found.
    """
    try:
        variance = compute_baseline_variance(
            db=db,
            root_node_id=root_node_id,
            baseline_id=baseline_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Convert node_variances dicts to response objects
    node_variances = []
    for nv in variance.get("node_variances", []):
        node_variances.append(BaselineVarianceNodeResponse(**nv))

    return BaselineVarianceResponse(
        baseline_id=variance["baseline_id"],
        baseline_code=variance["baseline_code"],
        root_node_id=variance["root_node_id"],
        total_nodes_compared=variance["total_nodes_compared"],
        nodes_with_variance=variance["nodes_with_variance"],
        total_start_variance_days=variance["total_start_variance_days"],
        total_finish_variance_days=variance["total_finish_variance_days"],
        total_bac_variance=variance["total_bac_variance"],
        nodes_added=variance["nodes_added"],
        nodes_deleted=variance["nodes_deleted"],
        node_variances=node_variances,
        compared_at=variance["compared_at"],
    )


@router.get("/list", response_model=list[BaselineResponse])
def list_baselines_endpoint(
    root_node_id: UUID = Query(..., description="Root portfolio node ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all baselines for a given portfolio project.

    Returns baselines ordered by freeze date (newest first).

    Parameters
    ----------
    root_node_id : UUID
        The root portfolio node whose baselines to list.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    list of BaselineResponse
        All baselines for the specified root node.
    """
    baselines = (
        db.query(PortfolioBaseline)
        .filter(PortfolioBaseline.root_portfolio_node_id == root_node_id)
        .order_by(PortfolioBaseline.frozen_at.desc())
        .all()
    )

    results = []
    for bl in baselines:
        snapshot_count = (
            db.query(BaselineNodeSnapshot)
            .filter(BaselineNodeSnapshot.baseline_id == bl.id)
            .count()
        )
        results.append(BaselineResponse(
            id=bl.id,
            root_portfolio_node_id=bl.root_portfolio_node_id,
            baseline_code=bl.baseline_code,
            name=bl.name,
            frozen_at=bl.frozen_at,
            frozen_by_user_id=bl.frozen_by_user_id,
            bcr_reference=bl.bcr_reference,
            is_active_target=bl.is_active_target,
            snapshot_count=snapshot_count,
        ))

    return results


@router.post("/bcr", response_model=BCRResponse)
def create_bcr_endpoint(
    request: BCRCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new Baseline Change Request.

    A BCR is a formal request to change an approved baseline.  It must
    include a justification, governance tier, and impact assessment.

    Parameters
    ----------
    request : BCRCreate
        The BCR creation request.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    BCRResponse
        The newly created BCR.

    Raises
    ------
    HTTPException
        409 if the BCR number already exists.
    """
    # Check for duplicate BCR number
    existing = (
        db.query(BaselineChangeRequest)
        .filter(BaselineChangeRequest.bcr_number == request.bcr_number)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"BCR number '{request.bcr_number}' already exists",
        )

    try:
        bcr = create_bcr(
            db=db,
            bcr_number=request.bcr_number,
            title=request.title,
            justification=request.justification,
            tier=request.tier.value,
            created_by_user_id=current_user.id,
            cost_delta_amount=request.cost_delta_amount,
            schedule_finish_slip_days=request.schedule_finish_slip_days,
            contingency_reserve_requested=request.contingency_reserve_requested,
        )
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    return BCRResponse(
        id=bcr.id,
        bcr_number=bcr.bcr_number,
        title=bcr.title,
        justification=bcr.justification,
        tier=bcr.tier,
        status=bcr.status,
        cost_delta_amount=float(bcr.cost_delta_amount) if bcr.cost_delta_amount else None,
        schedule_finish_slip_days=bcr.schedule_finish_slip_days,
        contingency_reserve_requested=float(bcr.contingency_reserve_requested) if bcr.contingency_reserve_requested else None,
        created_by_user_id=bcr.created_by_user_id,
        approver_user_id=bcr.approver_user_id,
        rejection_reason=bcr.rejection_reason,
        created_at=bcr.created_at,
        updated_at=bcr.updated_at,
    )


@router.get("/bcr", response_model=list[BCRResponse])
def list_bcrs_endpoint(
    status: Optional[str] = Query(None, description="Filter by status"),
    tier: Optional[str] = Query(None, description="Filter by tier"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List Baseline Change Requests, optionally filtered by status or tier.

    Parameters
    ----------
    status : str or None
        Filter by status (DRAFT, UNDER_REVIEW, APPROVED, REJECTED).
    tier : str or None
        Filter by tier (TIER_1_LOCAL_CAM, TIER_2_PROJECT_CCB, TIER_3_PROGRAMME_BOARD).
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    list of BCRResponse
        Matching BCRs ordered by creation date (newest first).
    """
    query = db.query(BaselineChangeRequest)

    if status:
        query = query.filter(BaselineChangeRequest.status == status)
    if tier:
        query = query.filter(BaselineChangeRequest.tier == tier)

    bcrs = query.order_by(BaselineChangeRequest.created_at.desc()).all()

    return [
        BCRResponse(
            id=bcr.id,
            bcr_number=bcr.bcr_number,
            title=bcr.title,
            justification=bcr.justification,
            tier=bcr.tier,
            status=bcr.status,
            cost_delta_amount=float(bcr.cost_delta_amount) if bcr.cost_delta_amount else None,
            schedule_finish_slip_days=bcr.schedule_finish_slip_days,
            contingency_reserve_requested=float(bcr.contingency_reserve_requested) if bcr.contingency_reserve_requested else None,
            created_by_user_id=bcr.created_by_user_id,
            approver_user_id=bcr.approver_user_id,
            rejection_reason=bcr.rejection_reason,
            created_at=bcr.created_at,
            updated_at=bcr.updated_at,
        )
        for bcr in bcrs
    ]


@router.get("/bcr/{bcr_id}", response_model=BCRResponse)
def get_bcr_endpoint(
    bcr_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get details of a specific Baseline Change Request.

    Parameters
    ----------
    bcr_id : UUID
        The BCR to retrieve.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    BCRResponse
        The BCR details.

    Raises
    ------
    HTTPException
        404 if the BCR is not found.
    """
    bcr = db.query(BaselineChangeRequest).filter(BaselineChangeRequest.id == bcr_id).first()
    if bcr is None:
        raise HTTPException(status_code=404, detail=f"BCR {bcr_id} not found")

    return BCRResponse(
        id=bcr.id,
        bcr_number=bcr.bcr_number,
        title=bcr.title,
        justification=bcr.justification,
        tier=bcr.tier,
        status=bcr.status,
        cost_delta_amount=float(bcr.cost_delta_amount) if bcr.cost_delta_amount else None,
        schedule_finish_slip_days=bcr.schedule_finish_slip_days,
        contingency_reserve_requested=float(bcr.contingency_reserve_requested) if bcr.contingency_reserve_requested else None,
        created_by_user_id=bcr.created_by_user_id,
        approver_user_id=bcr.approver_user_id,
        rejection_reason=bcr.rejection_reason,
        created_at=bcr.created_at,
        updated_at=bcr.updated_at,
    )


@router.put("/bcr/{bcr_id}", response_model=BCRResponse)
def update_bcr_endpoint(
    bcr_id: UUID,
    request: BCRUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update the status of a Baseline Change Request.

    Used to approve or reject a BCR.  The approver's user ID is
    automatically recorded.

    Parameters
    ----------
    bcr_id : UUID
        The BCR to update.
    request : BCRUpdate
        The new status and optional rejection reason.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    BCRResponse
        The updated BCR.

    Raises
    ------
    HTTPException
        404 if the BCR is not found.
        400 if the status transition is invalid.
    """
    if request.status is None:
        raise HTTPException(
            status_code=400,
            detail="Status must be provided when updating a BCR",
        )

    try:
        bcr = update_bcr_status(
            db=db,
            bcr_id=bcr_id,
            new_status=request.status.value,
            approver_user_id=current_user.id,
            rejection_reason=request.rejection_reason,
        )
        db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    return BCRResponse(
        id=bcr.id,
        bcr_number=bcr.bcr_number,
        title=bcr.title,
        justification=bcr.justification,
        tier=bcr.tier,
        status=bcr.status,
        cost_delta_amount=float(bcr.cost_delta_amount) if bcr.cost_delta_amount else None,
        schedule_finish_slip_days=bcr.schedule_finish_slip_days,
        contingency_reserve_requested=float(bcr.contingency_reserve_requested) if bcr.contingency_reserve_requested else None,
        created_by_user_id=bcr.created_by_user_id,
        approver_user_id=bcr.approver_user_id,
        rejection_reason=bcr.rejection_reason,
        created_at=bcr.created_at,
        updated_at=bcr.updated_at,
    )
