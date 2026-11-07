"""Portfolios router for top-level programme container management.

This module provides REST endpoints for creating, reading, updating, and
deleting portfolios, as well as managing portfolio membership.  Portfolios
are the highest-level containers in the legacy data model, grouping related
projects under a common governance structure.

.. warning::
   This router uses the legacy relational data model (Portfolio, PortfolioMember)
   and is **not imported** by the main FastAPI application.  It is retained for
   reference only.  The current system uses the unified
   :class:`~app.models.models.UniversalBreakdownNode` tree structure with the
   WBS router (:mod:`app.routers.wbs`).

Endpoints
---------

+-----------------------------------+------------------------------------------+
| Method                            | Description                              |
+===================================+==========================================+
| ``GET /portfolios/``              | List accessible portfolios.              |
+-----------------------------------+------------------------------------------+
| ``POST /portfolios/``             | Create a new portfolio.                  |
+-----------------------------------+------------------------------------------+
| ``GET /portfolios/{id}``          | Get a single portfolio by ID.            |
+-----------------------------------+------------------------------------------+
| ``PUT /portfolios/{id}``          | Update a portfolio.                      |
+-----------------------------------+------------------------------------------+
| ``DELETE /portfolios/{id}``       | Delete a portfolio.                      |
+-----------------------------------+------------------------------------------+
| ``GET /portfolios/{id}/members``  | List portfolio members.                  |
+-----------------------------------+------------------------------------------+
| ``POST /portfolios/{id}/members`` | Add a member to a portfolio.             |
+-----------------------------------+------------------------------------------+
| ``PUT /portfolios/{id}/members/{mid}`` | Update a member's role.            |
+-----------------------------------+------------------------------------------+
| ``DELETE /portfolios/{id}/members/{mid}`` | Remove a member.                |
+-----------------------------------+------------------------------------------+

Access Control
~~~~~~~~~~~~~~

Portfolios are accessible to their owner and all members.  Only the owner
or members with edit roles can modify portfolio settings or manage membership.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime
from app.database import get_db
from app.models.models import User, Portfolio, PortfolioMember, PortfolioStatus, PortfolioMemberRole
from app.schemas.schemas import (
    PortfolioCreate, PortfolioUpdate, PortfolioResponse,
    PortfolioMemberBase, PortfolioMemberResponse
)
from app.utils.auth import get_current_user

router = APIRouter(prefix="/portfolios", tags=["Portfolios"])


def _get_portfolio_or_404(db: Session, portfolio_id: int) -> Portfolio:
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio


def _check_portfolio_access(db: Session, portfolio: Portfolio, user: User):
    """Check if user has access to the portfolio."""
    if portfolio.owner_id == user.id:
        return
    member = db.query(PortfolioMember).filter(
        PortfolioMember.portfolio_id == portfolio.id,
        PortfolioMember.user_id == user.id
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Access denied to this portfolio")


def _check_portfolio_edit_access(db: Session, portfolio: Portfolio, user: User):
    """Check if user can edit the portfolio."""
    if portfolio.owner_id == user.id:
        return
    member = db.query(PortfolioMember).filter(
        PortfolioMember.portfolio_id == portfolio.id,
        PortfolioMember.user_id == user.id
    ).first()
    if not member or member.role in (PortfolioMemberRole.VIEWER,):
        raise HTTPException(status_code=403, detail="Edit access denied")


@router.get("/", response_model=List[PortfolioResponse])
def list_portfolios(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List portfolios accessible to the current user."""
    query = db.query(Portfolio).filter(
        (Portfolio.owner_id == current_user.id) |
        (Portfolio.id.in_(
            db.query(PortfolioMember.portfolio_id).filter(
                PortfolioMember.user_id == current_user.id
            )
        ))
    )
    
    if status_filter:
        query = query.filter(Portfolio.status == status_filter)
    
    return query.offset(skip).limit(limit).all()


@router.post("/", response_model=PortfolioResponse, status_code=status.HTTP_201_CREATED)
def create_portfolio(
    portfolio_data: PortfolioCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new portfolio."""
    portfolio = Portfolio(
        **portfolio_data.model_dump(),
        owner_id=current_user.id
    )
    db.add(portfolio)
    db.commit()
    db.refresh(portfolio)
    return portfolio


@router.get("/{portfolio_id}", response_model=PortfolioResponse)
def get_portfolio(
    portfolio_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a portfolio by ID."""
    portfolio = _get_portfolio_or_404(db, portfolio_id)
    _check_portfolio_access(db, portfolio, current_user)
    return portfolio


@router.put("/{portfolio_id}", response_model=PortfolioResponse)
def update_portfolio(
    portfolio_id: int,
    portfolio_update: PortfolioUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a portfolio."""
    portfolio = _get_portfolio_or_404(db, portfolio_id)
    _check_portfolio_edit_access(db, portfolio, current_user)
    
    update_data = portfolio_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(portfolio, key, value)
    
    db.commit()
    db.refresh(portfolio)
    return portfolio


@router.delete("/{portfolio_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_portfolio(
    portfolio_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a portfolio (owner only)."""
    portfolio = _get_portfolio_or_404(db, portfolio_id)
    if portfolio.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can delete a portfolio")
    
    db.delete(portfolio)
    db.commit()


# --- Portfolio Members ---

@router.get("/{portfolio_id}/members", response_model=List[PortfolioMemberResponse])
def list_portfolio_members(
    portfolio_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all members of a portfolio."""
    portfolio = _get_portfolio_or_404(db, portfolio_id)
    _check_portfolio_access(db, portfolio, current_user)
    
    return db.query(PortfolioMember).filter(
        PortfolioMember.portfolio_id == portfolio_id
    ).all()


@router.post("/{portfolio_id}/members", response_model=PortfolioMemberResponse, status_code=status.HTTP_201_CREATED)
def add_portfolio_member(
    portfolio_id: int,
    member_data: PortfolioMemberBase,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add a member to a portfolio."""
    portfolio = _get_portfolio_or_404(db, portfolio_id)
    _check_portfolio_edit_access(db, portfolio, current_user)
    
    # Check if user exists
    user = db.query(User).filter(User.id == member_data.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if already a member
    existing = db.query(PortfolioMember).filter(
        PortfolioMember.portfolio_id == portfolio_id,
        PortfolioMember.user_id == member_data.user_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="User is already a member")
    
    member = PortfolioMember(
        portfolio_id=portfolio_id,
        **member_data.model_dump()
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.put("/{portfolio_id}/members/{member_id}", response_model=PortfolioMemberResponse)
def update_portfolio_member(
    portfolio_id: int,
    member_id: int,
    role: PortfolioMemberRole,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a portfolio member's role."""
    portfolio = _get_portfolio_or_404(db, portfolio_id)
    _check_portfolio_edit_access(db, portfolio, current_user)
    
    member = db.query(PortfolioMember).filter(
        PortfolioMember.id == member_id,
        PortfolioMember.portfolio_id == portfolio_id
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    member.role = role
    db.commit()
    db.refresh(member)
    return member


@router.delete("/{portfolio_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_portfolio_member(
    portfolio_id: int,
    member_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove a member from a portfolio."""
    portfolio = _get_portfolio_or_404(db, portfolio_id)
    _check_portfolio_edit_access(db, portfolio, current_user)
    
    member = db.query(PortfolioMember).filter(
        PortfolioMember.id == member_id,
        PortfolioMember.portfolio_id == portfolio_id
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    db.delete(member)
    db.commit()


@router.get("/{portfolio_id}/stats")
def get_portfolio_stats(
    portfolio_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get statistics for a portfolio."""
    from app.models.models import Project, Task, TaskStatus
    
    portfolio = _get_portfolio_or_404(db, portfolio_id)
    _check_portfolio_access(db, portfolio, current_user)
    
    projects = db.query(Project).filter(Project.portfolio_id == portfolio_id).all()
    project_ids = [p.id for p in projects]
    
    total_tasks = db.query(Task).filter(Task.project_id.in_(project_ids)).count() if project_ids else 0
    completed_tasks = db.query(Task).filter(
        Task.project_id.in_(project_ids),
        Task.status == TaskStatus.COMPLETED
    ).count() if project_ids else 0
    
    return {
        "portfolio_id": portfolio_id,
        "total_projects": len(projects),
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "completion_percentage": round((completed_tasks / total_tasks * 100), 2) if total_tasks else 0,
    }
