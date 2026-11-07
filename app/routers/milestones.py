"""Milestones router for project milestone tracking.

This module provides REST endpoints for creating, reading, updating, and
deleting milestones associated with projects.  Milestones represent key
date-driven checkpoints in a project schedule, such as design reviews,
contractual delivery dates, or phase gate approvals.

.. warning::
   This router uses the legacy relational data model (Milestone, Project,
   Portfolio) and is **not imported** by the main FastAPI application.  It is
   retained for reference only.  The current system uses the unified
   :class:`~app.models.models.UniversalBreakdownNode` tree structure with
   milestone weight steps managed by the EVM router
   (:mod:`app.routers.evm`).

Endpoints
---------

+--------------------------------+------------------------------------------+
| Method                         | Description                              |
+================================+==========================================+
| ``GET /milestones/``           | List milestones with optional filters.   |
+--------------------------------+------------------------------------------+
| ``POST /milestones/``          | Create a new milestone.                  |
+--------------------------------+------------------------------------------+
| ``GET /milestones/{id}``       | Get a single milestone by ID.            |
+--------------------------------+------------------------------------------+
| ``PUT /milestones/{id}``       | Update a milestone.                      |
+--------------------------------+------------------------------------------+
| ``DELETE /milestones/{id}``    | Delete a milestone.                      |
+--------------------------------+------------------------------------------+
| ``GET /milestones/project/{id}`` | Get all milestones for a project.      |
+--------------------------------+------------------------------------------+

Access Control
~~~~~~~~~~~~~~

Milestones are accessible only to users who have membership in the portfolio
that contains the milestone's project.  Viewers cannot create, update, or
delete milestones.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
from app.database import get_db
from app.models.models import (
    User, Milestone, Project, Portfolio, PortfolioMember,
    MilestoneStatus, PortfolioMemberRole
)
from app.schemas.schemas import MilestoneCreate, MilestoneUpdate, MilestoneResponse
from app.utils.auth import get_current_user

router = APIRouter(prefix="/milestones", tags=["Milestones"])


def _get_milestone_or_404(db: Session, milestone_id: int) -> Milestone:
    milestone = db.query(Milestone).filter(Milestone.id == milestone_id).first()
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")
    return milestone


def _check_milestone_access(db: Session, milestone: Milestone, user: User):
    """Check if user has access to the milestone through its project's portfolio."""
    project = db.query(Project).filter(Project.id == milestone.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    portfolio = db.query(Portfolio).filter(Portfolio.id == project.portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    
    if portfolio.owner_id == user.id:
        return
    member = db.query(PortfolioMember).filter(
        PortfolioMember.portfolio_id == portfolio.id,
        PortfolioMember.user_id == user.id
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Access denied to this milestone")


@router.get("/", response_model=List[MilestoneResponse])
def list_milestones(
    project_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List milestones with optional filters."""
    query = db.query(Milestone)
    
    if project_id:
        query = query.filter(Milestone.project_id == project_id)
    if status_filter:
        query = query.filter(Milestone.status == status_filter)
    
    return query.offset(skip).limit(limit).all()


@router.post("/", response_model=MilestoneResponse, status_code=status.HTTP_201_CREATED)
def create_milestone(
    milestone_data: MilestoneCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new milestone."""
    project = db.query(Project).filter(Project.id == milestone_data.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    portfolio = db.query(Portfolio).filter(Portfolio.id == project.portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    
    if portfolio.owner_id != current_user.id:
        member = db.query(PortfolioMember).filter(
            PortfolioMember.portfolio_id == portfolio.id,
            PortfolioMember.user_id == current_user.id
        ).first()
        if not member or member.role == PortfolioMemberRole.VIEWER:
            raise HTTPException(status_code=403, detail="Edit access denied")
    
    milestone = Milestone(**milestone_data.model_dump())
    db.add(milestone)
    db.commit()
    db.refresh(milestone)
    return milestone


@router.get("/{milestone_id}", response_model=MilestoneResponse)
def get_milestone(
    milestone_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a milestone by ID."""
    milestone = _get_milestone_or_404(db, milestone_id)
    _check_milestone_access(db, milestone, current_user)
    return milestone


@router.put("/{milestone_id}", response_model=MilestoneResponse)
def update_milestone(
    milestone_id: int,
    milestone_update: MilestoneUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a milestone."""
    milestone = _get_milestone_or_404(db, milestone_id)
    _check_milestone_access(db, milestone, current_user)
    
    update_data = milestone_update.model_dump(exclude_unset=True)
    
    # Auto-set completed_at when status changes to completed
    if "status" in update_data and update_data["status"] == MilestoneStatus.COMPLETED:
        update_data["completed_at"] = datetime.now(timezone.utc)
    elif "status" in update_data and update_data["status"] != MilestoneStatus.COMPLETED:
        update_data["completed_at"] = None
    
    for key, value in update_data.items():
        setattr(milestone, key, value)
    
    db.commit()
    db.refresh(milestone)
    return milestone


@router.delete("/{milestone_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_milestone(
    milestone_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a milestone."""
    milestone = _get_milestone_or_404(db, milestone_id)
    _check_milestone_access(db, milestone, current_user)
    
    db.delete(milestone)
    db.commit()


@router.get("/project/{project_id}", response_model=List[MilestoneResponse])
def get_project_milestones(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all milestones for a specific project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    portfolio = db.query(Portfolio).filter(Portfolio.id == project.portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    
    if portfolio.owner_id != current_user.id:
        member = db.query(PortfolioMember).filter(
            PortfolioMember.portfolio_id == portfolio.id,
            PortfolioMember.user_id == current_user.id
        ).first()
        if not member:
            raise HTTPException(status_code=403, detail="Access denied")
    
    return db.query(Milestone).filter(
        Milestone.project_id == project_id
    ).order_by(Milestone.due_date).all()
