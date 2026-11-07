"""Requisitions API router for the Eisenhower Portfolio Manager.

This module provides the REST endpoints for the resource requisition workflow.
It allows project managers to request resources, functional leads to review
pending requisitions, and approvers to atomically approve requisitions by
creating confirmed ResourceAssignments.

Endpoints Overview
------------------

The router exposes three endpoints under ``/api/v1/requisitions``:

1. **POST /** — Submit a new resource requisition.
   A project manager uses this to request personnel for a task.  The
   requisition specifies skills, hours, dates, and optionally targets
   a specific resource.

2. **GET /inbox** — Fetch pending requisitions for review.
   A functional lead uses this to see all requisitions awaiting their
   review.  The response includes candidate matches from the matching
   engine to help with decision-making.

3. **POST /{id}/approve** — Approve or reject a requisition.
   An approver uses this to finalise a requisition.  Approval atomically
   creates a confirmed ResourceAssignment linking the resource to the
   portfolio node.  Rejection records the reason for audit trail.

Authentication
~~~~~~~~~~~~~~

All endpoints require a valid JWT token.  The authenticated user's identity
is used to populate the ``requested_by_user_id`` field on new requisitions
and the ``approver_user_id`` field on approvals.

Atomic Approval
~~~~~~~~~~~~~~~

When a requisition is approved, the following operations occur within a
single database transaction:

1. The requisition status is updated to APPROVED.
2. A new ResourceAssignment is created with status CONFIRMED.
3. The approver_user_id is set to the current user.

If any step fails, the entire transaction is rolled back, ensuring
data consistency.

Usage
~~~~~

    # Submit a requisition
    POST /api/v1/requisitions
    {
        "portfolio_node_id": "550e8400-e29b-41d4-a716-446655440000",
        "required_skill_id": 5,
        "min_proficiency": "COMPETENT",
        "requested_hours": 80.0,
        "start_date": "2026-11-01",
        "end_date": "2026-11-30",
        "notes": "Need RF engineer for antenna testing phase"
    }

    # View pending requisitions
    GET /api/v1/requisitions/inbox

    # Approve a requisition
    POST /api/v1/requisitions/{id}/approve
    {
        "status": "APPROVED",
        "target_resource_id": "660e8400-e29b-41d4-a716-446655440001"
    }
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.models import (
    User, ResourceRequisitionRequest, RequisitionStatus,
    ResourceAssignment, AssignmentStatus, UniversalBreakdownNode,
    ResourceNode, SecurityClassification, PortfolioNode,
)
from app.schemas.schemas import (
    RequisitionCreate, RequisitionUpdate, RequisitionResponse,
    CandidateMatchResponse,
)
from app.services.matching import find_candidates
from app.core.abac import is_node_visible
from app.core.export_control import verify_export_control_compliance as verify_foreign_disclosure_compliance


router = APIRouter()


@router.post("/", response_model=RequisitionResponse)
def submit_requisition(
    requisition: RequisitionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Submit a new resource requisition request.

    Creates a requisition in PENDING_REVIEW status.  The authenticated
    user is recorded as the requester.

    Parameters
    ----------
    requisition : RequisitionCreate
        The requisition details including portfolio node, skills,
        hours, and dates.
    current_user : User
        The authenticated user submitting the requisition.
    db : Session
        Database session.

    Returns
    -------
    RequisitionResponse
        The created requisition with generated UUID.

    Raises
    ------
    HTTPException
        404 if the portfolio node is not found.
        403 if the user lacks clearance for the portfolio node.
        400 if the end date is before the start date.
    """
    # Validate dates
    if requisition.end_date < requisition.start_date:
        raise HTTPException(
            status_code=400,
            detail="End date must be on or after start date.",
        )

    # Verify the portfolio node exists
    portfolio_node = db.query(UniversalBreakdownNode).filter(
        UniversalBreakdownNode.id == requisition.portfolio_node_id
    ).first()

    if not portfolio_node:
        raise HTTPException(
            status_code=404,
            detail=f"Portfolio node {requisition.portfolio_node_id} not found.",
        )

    # Check user has access to the portfolio node
    if not is_node_visible(current_user.clearance_level, current_user.caveats, portfolio_node):
        raise HTTPException(
            status_code=403,
            detail="You do not have clearance to requisition resources for this node.",
        )

    # Create the requisition
    db_requisition = ResourceRequisitionRequest(
        portfolio_node_id=requisition.portfolio_node_id,
        requested_by_user_id=current_user.id,
        target_resource_id=requisition.target_resource_id,
        required_skill_id=requisition.required_skill_id,
        min_proficiency=requisition.min_proficiency,
        requested_hours=requisition.requested_hours,
        start_date=requisition.start_date,
        end_date=requisition.end_date,
        status=RequisitionStatus.PENDING_REVIEW,
        notes=requisition.notes,
    )

    db.add(db_requisition)
    db.commit()
    db.refresh(db_requisition)

    return db_requisition


@router.get("/inbox", response_model=List[RequisitionResponse])
def get_pending_requisitions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch all pending requisitions for functional lead review.

    Returns all requisitions currently in PENDING_REVIEW status.
    In a full implementation, this would filter by the user's
    functional area or management responsibilities.

    Parameters
    ----------
    current_user : User
        The authenticated user viewing the inbox.
    db : Session
        Database session.

    Returns
    -------
    list of RequisitionResponse
        All pending requisitions, ordered by creation date (newest first).
    """
    requisitions = db.query(ResourceRequisitionRequest).filter(
        ResourceRequisitionRequest.status == RequisitionStatus.PENDING_REVIEW
    ).order_by(
        ResourceRequisitionRequest.created_at.desc()
    ).all()

    return requisitions


@router.post("/{requisition_id}/approve", response_model=RequisitionResponse)
def approve_or_reject_requisition(
    requisition_id: UUID,
    update: RequisitionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Approve or reject a resource requisition.

    If the status is set to APPROVED, this endpoint atomically:
    1. Updates the requisition status to APPROVED.
    2. Creates a confirmed ResourceAssignment.
    3. Records the approver's user ID.

    If the status is set to REJECTED, it records the rejection reason.

    Parameters
    ----------
    requisition_id : UUID
        The UUID of the requisition to approve or reject.
    update : RequisitionUpdate
        The new status and optional rejection reason.
    current_user : User
        The authenticated user performing the approval.
    db : Session
        Database session.

    Returns
    -------
    RequisitionResponse
        The updated requisition.

    Raises
    ------
    HTTPException
        404 if the requisition is not found.
        400 if the requisition is not in PENDING_REVIEW status.
        400 if approving without a target resource.
    """
    requisition = db.query(ResourceRequisitionRequest).filter(
        ResourceRequisitionRequest.id == requisition_id
    ).first()

    if not requisition:
        raise HTTPException(
            status_code=404,
            detail=f"Requisition {requisition_id} not found.",
        )

    if requisition.status != RequisitionStatus.PENDING_REVIEW:
        raise HTTPException(
            status_code=400,
            detail=f"Requisition is in {requisition.status.value} status; "
                   f"only PENDING_REVIEW requisitions can be approved/rejected.",
        )

    # Apply status update
    if update.status is not None:
        requisition.status = update.status
    if update.rejection_reason is not None:
        requisition.rejection_reason = update.rejection_reason
    if update.notes is not None:
        requisition.notes = update.notes

    requisition.approver_user_id = current_user.id

    # If approving, create the ResourceAssignment
    if requisition.status == RequisitionStatus.APPROVED:
        # Determine the target resource
        target_resource_id = update.__dict__.get('target_resource_id') or requisition.target_resource_id

        if not target_resource_id:
            raise HTTPException(
                status_code=400,
                detail="Cannot approve requisition without a target resource. "
                       "Please specify target_resource_id.",
            )

        # Verify the target resource exists
        target_resource = db.query(ResourceNode).filter(
            ResourceNode.id == target_resource_id
        ).first()

        if not target_resource:
            raise HTTPException(
                status_code=404,
                detail=f"Target resource {target_resource_id} not found.",
            )

        # Find the portfolio node for export control check
        portfolio_node = db.query(PortfolioNode).filter(
            PortfolioNode.id == requisition.portfolio_node_id
        ).first()

        if not portfolio_node:
            raise HTTPException(
                status_code=404,
                detail=f"Portfolio node {requisition.portfolio_node_id} not found.",
            )

        # Export control compliance check on the approver
        # The approver must be authorised to assign this resource to the task
        verify_foreign_disclosure_compliance(current_user, portfolio_node, db)

        # Create the ResourceAssignment
        assignment = ResourceAssignment(
            portfolio_node_id=requisition.portfolio_node_id,
            resource_node_id=target_resource_id,
            allocated_units=1.0,
            planned_hours=requisition.requested_hours,
            rate_snapshot=target_resource.standard_hourly_rate or 0.0,
            status=AssignmentStatus.CONFIRMED,
        )

        db.add(assignment)

    db.commit()
    db.refresh(requisition)

    return requisition


@router.get("/{requisition_id}/candidates", response_model=List[CandidateMatchResponse])
def get_candidate_matches(
    requisition_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get ranked candidate matches for a requisition.

    Runs the matching engine against the requisition's requirements
    and returns a ranked list of eligible candidates.

    Parameters
    ----------
    requisition_id : UUID
        The UUID of the requisition to find candidates for.
    db : Session
        Database session.
    current_user : User
        The authenticated user requesting candidates.

    Returns
    -------
    list of CandidateMatchResponse
        Ranked candidates sorted by match score (highest first).

    Raises
    ------
    HTTPException
        404 if the requisition is not found.
    """
    requisition = db.query(ResourceRequisitionRequest).filter(
        ResourceRequisitionRequest.id == requisition_id
    ).first()

    if not requisition:
        raise HTTPException(
            status_code=404,
            detail=f"Requisition {requisition_id} not found.",
        )

    # Fetch the portfolio node for security classification
    portfolio_node = db.query(UniversalBreakdownNode).filter(
        UniversalBreakdownNode.id == requisition.portfolio_node_id
    ).first()

    if not portfolio_node:
        raise HTTPException(
            status_code=404,
            detail="Portfolio node for this requisition not found.",
        )

    # Build the skill requirement list
    required_skill_ids: Optional[List[int]] = None
    if requisition.required_skill_id:
        required_skill_ids = [requisition.required_skill_id]

    # Run the matching engine
    candidates = find_candidates(
        db=db,
        portfolio_node_id=str(requisition.portfolio_node_id),
        required_skill_ids=required_skill_ids,
        min_proficiency=requisition.min_proficiency,
        start_date=requisition.start_date,
        end_date=requisition.end_date,
        requested_hours=requisition.requested_hours,
        node_classification=portfolio_node.security_classification,
        node_caveats=portfolio_node.caveats,
    )

    return candidates
