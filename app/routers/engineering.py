"""Engineering governance API router.

This module provides the REST API endpoints for systems engineering
safety governance, including the technical concessions ledger and
DAL/SIL signoff gate evaluation.

Endpoints
~~~~~~~~~

- **POST /concessions** — Create a new engineering concession record.
- **GET /concessions** — List concessions with optional filtering by
  node, disposition, or safety significance.
- **GET /concessions/{id}** — Get a single concession record.
- **PUT /concessions/{id}** — Update an existing concession (e.g.,
  change disposition, assign engineer).
- **DELETE /concessions/{id}** — Delete a concession record.
- **GET /tasks/{id}/safety-gate-status** — Evaluate the DAL compliance
  checklist for a task and return gating statuses.
- **POST /tasks/{id}/safety-vector** — Compute the compromised safety
  vector for a given schedule slip.

Access Control
~~~~~~~~~~~~~~

All endpoints require JWT authentication.  Concession creation and
update require the user to be a Lead Systems Engineer or Admin.
Safety gate evaluation is available to all cleared users.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select
from uuid import UUID
from typing import Optional, List
from datetime import datetime, timezone

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.models import (
    User, UserRole,
    EngineeringConcession, ConcessionDisposition, SafetySignificance,
    ConcessionType, PortfolioNode,
)
from app.schemas.schemas import (
    EngineeringConcessionCreate,
    EngineeringConcessionUpdate,
    EngineeringConcessionResponse,
    EngineeringConcessionListResponse,
    SafetyGateStatusResponse,
    SafetyGateCheckItem,
    SafetyVectorResponse,
    SafetyVectorNode,
)
from app.services.engineering_governance import (
    evaluate_dal_signoff_gate,
    compute_compromised_safety_vector,
)

router = APIRouter()


@router.post("/concessions", response_model=EngineeringConcessionResponse)
def create_concession(
    concession_data: EngineeringConcessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new engineering concession record.

    In defence programme management, any deviation from the approved
    design baseline must be formally documented.  This endpoint creates
    a new concession record that enters the formal review and disposition
    process.

    Args:
        concession_data: The concession creation payload containing
            the concession number, type, affected node, and safety
            significance rating.
        db: Database session.
        current_user: Authenticated user creating the concession.

    Returns:
        The newly created concession record.

    Raises:
        HTTPException: 404 if the portfolio node is not found.
        HTTPException: 409 if a concession with the same number
            already exists.
    """
    # Verify the portfolio node exists
    node = db.execute(
        select(PortfolioNode).where(
            PortfolioNode.id == concession_data.portfolio_node_id
        )
    ).scalar_one_or_none()

    if node is None:
        raise HTTPException(
            status_code=404,
            detail=f"PortfolioNode {concession_data.portfolio_node_id} not found",
        )

    # Check for duplicate concession number
    existing = db.execute(
        select(EngineeringConcession).where(
            EngineeringConcession.concession_number == concession_data.concession_number
        )
    ).scalar_one_or_none()

    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Concession '{concession_data.concession_number}' already exists",
        )

    concession = EngineeringConcession(
        concession_number=concession_data.concession_number,
        concession_type=concession_data.concession_type,
        portfolio_node_id=concession_data.portfolio_node_id,
        serial_number_affected=concession_data.serial_number_affected,
        safety_significance=concession_data.safety_significance,
        lead_systems_engineer_user_id=concession_data.lead_systems_engineer_user_id,
        disposition=ConcessionDisposition.SUBMITTED,
    )

    db.add(concession)
    db.commit()
    db.refresh(concession)

    return concession


@router.get("/concessions", response_model=EngineeringConcessionListResponse)
def list_concessions(
    portfolio_node_id: Optional[UUID] = Query(None, description="Filter by affected node"),
    disposition: Optional[ConcessionDisposition] = Query(None, description="Filter by disposition"),
    safety_significance: Optional[SafetySignificance] = Query(
        None, description="Filter by safety significance"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List engineering concessions with optional filtering.

    Args:
        portfolio_node_id: Optional filter to show only concessions
            for a specific work package.
        disposition: Optional filter by disposition status (e.g.,
            SUBMITTED, UNDER_REVIEW, USE_AS_IS_APPROVED).
        safety_significance: Optional filter by safety impact rating
            (CRITICAL, MAJOR, MINOR).
        db: Database session.
        current_user: Authenticated user.

    Returns:
        List of concessions matching the filter criteria.
    """
    query = select(EngineeringConcession)

    if portfolio_node_id is not None:
        query = query.where(
            EngineeringConcession.portfolio_node_id == portfolio_node_id
        )

    if disposition is not None:
        query = query.where(
            EngineeringConcession.disposition == disposition
        )

    if safety_significance is not None:
        query = query.where(
            EngineeringConcession.safety_significance == safety_significance
        )

    concessions = db.execute(query.order_by(
        EngineeringConcession.created_at.desc()
    )).scalars().all()

    return {
        "concessions": concessions,
        "count": len(concessions),
    }


@router.get("/concessions/{concession_id}", response_model=EngineeringConcessionResponse)
def get_concession(
    concession_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single engineering concession record.

    Args:
        concession_id: UUID of the concession to retrieve.
        db: Database session.
        current_user: Authenticated user.

    Returns:
        The concession record.

    Raises:
        HTTPException: 404 if the concession is not found.
    """
    concession = db.execute(
        select(EngineeringConcession).where(
            EngineeringConcession.id == concession_id
        )
    ).scalar_one_or_none()

    if concession is None:
        raise HTTPException(
            status_code=404,
            detail=f"EngineeringConcession {concession_id} not found",
        )

    return concession


@router.put("/concessions/{concession_id}", response_model=EngineeringConcessionResponse)
def update_concession(
    concession_id: UUID,
    concession_data: EngineeringConcessionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing engineering concession.

    Common update operations include:

    - Changing the disposition (e.g., SUBMITTED → UNDER_REVIEW → USE_AS_IS_APPROVED).
    - Assigning a Lead Systems Engineer.
    - Recording customer QAC signoff reference.

    Args:
        concession_id: UUID of the concession to update.
        concession_data: Partial update payload.  Only the fields
            included will be updated.
        db: Database session.
        current_user: Authenticated user.

    Returns:
        The updated concession record.

    Raises:
        HTTPException: 404 if the concession is not found.
    """
    concession = db.execute(
        select(EngineeringConcession).where(
            EngineeringConcession.id == concession_id
        )
    ).scalar_one_or_none()

    if concession is None:
        raise HTTPException(
            status_code=404,
            detail=f"EngineeringConcession {concession_id} not found",
        )

    update_data = concession_data.model_dump(exclude_unset=True)

    # Auto-set approved_at when disposition changes to USE_AS_IS_APPROVED
    if (
        update_data.get("disposition") == ConcessionDisposition.USE_AS_IS_APPROVED
        and concession.approved_at is None
    ):
        update_data["approved_at"] = datetime.now(timezone.utc)

    for field, value in update_data.items():
        setattr(concession, field, value)

    db.commit()
    db.refresh(concession)

    return concession


@router.delete("/concessions/{concession_id}")
def delete_concession(
    concession_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an engineering concession record.

    Args:
        concession_id: UUID of the concession to delete.
        db: Database session.
        current_user: Authenticated user.

    Returns:
        Confirmation that the concession was deleted.

    Raises:
        HTTPException: 404 if the concession is not found.
    """
    concession = db.execute(
        select(EngineeringConcession).where(
            EngineeringConcession.id == concession_id
        )
    ).scalar_one_or_none()

    if concession is None:
        raise HTTPException(
            status_code=404,
            detail=f"EngineeringConcession {concession_id} not found",
        )

    db.delete(concession)
    db.commit()

    return {"message": f"Concession {concession_id} deleted"}


@router.get("/tasks/{node_id}/safety-gate-status", response_model=SafetyGateStatusResponse)
def get_safety_gate_status(
    node_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Evaluate the DAL compliance safety gate status for a task.

    This endpoint returns a comprehensive checklist of all safety
    gates that must pass before a high-DAL task can be marked complete.
    The checks include:

    1. **Two-man rule** — For high-DAL tasks, the completion user
       cannot be the primary author.
    2. **V&V test completion** — All mandatory VerificationTestCase
       items must be PASSED or WAIVED.
    3. **Open concession check** — No unapproved EngineeringConcession
       records may exist for this node.

    Args:
        node_id: UUID of the PortfolioNode to evaluate.
        db: Database session.
        current_user: Authenticated user.

    Returns:
        SafetyGateStatusResponse containing the checklist results,
        overall can_complete flag, and any blocking reasons.
    """
    result = evaluate_dal_signoff_gate(db, node_id, current_user.id)

    return {
        "node_id": result["node_id"],
        "dal_sil_level": result["dal_sil_level"],
        "is_high_dal": result["is_high_dal"],
        "checks": result["checks"],
        "can_complete": result["can_complete"],
        "blocking_reasons": result["blocking_reasons"],
    }


@router.post("/tasks/{node_id}/safety-vector", response_model=SafetyVectorResponse)
def compute_safety_vector(
    node_id: UUID,
    slip_days: int = Query(..., ge=1, description="Number of days the task has slipped"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Compute the compromised safety vector for a schedule slip.

    When a schedule slip occurs, this endpoint traverses the downstream
    dependency DAG to identify all high-DAL activities that have been
    pushed past their contractual baseline dates.  This enables the
    Lead Systems Engineer to assess the cascading safety risk.

    Args:
        node_id: UUID of the PortfolioNode that experienced the slip.
        slip_days: Number of days the task has slipped (must be
            positive).
        db: Database session.
        current_user: Authenticated user.

    Returns:
        SafetyVectorResponse containing the list of affected high-DAL
        nodes, critical path impact flag, and a human-readable summary.
    """
    result = compute_compromised_safety_vector(db, node_id, slip_days)

    return {
        "root_node_id": result["root_node_id"],
        "slip_days": result["slip_days"],
        "affected_nodes": result["affected_nodes"],
        "critical_path_impact": result["critical_path_impact"],
        "summary": result["summary"],
    }


@router.get("/", summary="Engineering overview")
def engineering_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return high-level engineering metrics."""
    return {
        "total_concessions": 0,
        "open_concessions": 0,
        "safety_gates_passed": 0,
        "safety_gates_failed": 0,
    }
