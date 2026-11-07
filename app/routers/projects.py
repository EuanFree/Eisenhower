"""Projects router for mid-level project container management.

This module provides REST endpoints for creating, reading, updating, and
deleting projects within portfolios.  Projects sit between portfolios and
tasks in the legacy hierarchy, representing discrete work efforts with their
own managers, statuses, and priorities.

.. warning::
   This router uses the legacy relational data model (Project, Portfolio)
   and is **not imported** by the main FastAPI application.  It is retained
   for reference only.  The current system uses the unified
   :class:`~app.models.models.UniversalBreakdownNode` tree structure with the
   WBS router (:mod:`app.routers.wbs`).

Endpoints
---------

+---------------------------+------------------------------------------+
| Method                    | Description                              |
+===========================+==========================================+
| ``GET /projects/``        | List accessible projects.                |
+---------------------------+------------------------------------------+
| ``POST /projects/``       | Create a new project.                    |
+---------------------------+------------------------------------------+
| ``GET /projects/{id}``    | Get a single project by ID.              |
+---------------------------+------------------------------------------+
| ``PUT /projects/{id}``    | Update a project.                        |
+---------------------------+------------------------------------------+
| ``DELETE /projects/{id}`` | Delete a project.                        |
+---------------------------+------------------------------------------+
| ``GET /projects/{id}/stats`` | Get project statistics (task counts). |
+---------------------------+------------------------------------------+

Access Control
~~~~~~~~~~~~~~

Projects are accessible to users who have membership in the containing
portfolio.  Only the portfolio owner, project manager, or non-viewer members
can edit projects.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models.models import User, Project, Portfolio, PortfolioMember, ProjectStatus, ProjectPriority, PortfolioMemberRole
from app.schemas.schemas import ProjectCreate, ProjectUpdate, ProjectResponse
from app.utils.auth import get_current_user

router = APIRouter(prefix="/projects", tags=["Projects"])


def _get_project_or_404(db: Session, project_id: int) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _check_project_access(db: Session, project: Project, user: User):
    """Check if user has access to the project through its portfolio."""
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
        raise HTTPException(status_code=403, detail="Access denied to this project")


def _check_project_edit_access(db: Session, project: Project, user: User):
    """Check if user can edit the project."""
    portfolio = db.query(Portfolio).filter(Portfolio.id == project.portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    
    if portfolio.owner_id == user.id or project.manager_id == user.id:
        return
    member = db.query(PortfolioMember).filter(
        PortfolioMember.portfolio_id == portfolio.id,
        PortfolioMember.user_id == user.id
    ).first()
    if not member or member.role == PortfolioMemberRole.VIEWER:
        raise HTTPException(status_code=403, detail="Edit access denied")


@router.get("/", response_model=List[ProjectResponse])
def list_projects(
    portfolio_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    priority_filter: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List projects accessible to the current user, optionally filtered by portfolio."""
    query = db.query(Project)
    
    if portfolio_id:
        query = query.filter(Project.portfolio_id == portfolio_id)
    
    # Only show projects from portfolios the user has access to
    accessible_portfolios = db.query(Portfolio.id).filter(
        (Portfolio.owner_id == current_user.id) |
        (Portfolio.id.in_(
            db.query(PortfolioMember.portfolio_id).filter(
                PortfolioMember.user_id == current_user.id
            )
        ))
    ).subquery()
    query = query.filter(Project.portfolio_id.in_(select_accessible := accessible_portfolios.select()))
    
    if status_filter:
        query = query.filter(Project.status == status_filter)
    if priority_filter:
        query = query.filter(Project.priority == priority_filter)
    
    return query.offset(skip).limit(limit).all()


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    project_data: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new project within a portfolio."""
    # Check portfolio access
    portfolio = db.query(Portfolio).filter(Portfolio.id == project_data.portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    
    if portfolio.owner_id != current_user.id:
        member = db.query(PortfolioMember).filter(
            PortfolioMember.portfolio_id == portfolio.id,
            PortfolioMember.user_id == current_user.id
        ).first()
        if not member or member.role == PortfolioMemberRole.VIEWER:
            raise HTTPException(status_code=403, detail="Edit access denied")
    
    project = Project(**project_data.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a project by ID."""
    project = _get_project_or_404(db, project_id)
    _check_project_access(db, project, current_user)
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: int,
    project_update: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a project."""
    project = _get_project_or_404(db, project_id)
    _check_project_edit_access(db, project, current_user)
    
    update_data = project_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(project, key, value)
    
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a project."""
    project = _get_project_or_404(db, project_id)
    _check_project_edit_access(db, project, current_user)
    
    db.delete(project)
    db.commit()


@router.get("/{project_id}/stats")
def get_project_stats(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get statistics for a project."""
    from app.models.models import Task, TaskStatus
    
    project = _get_project_or_404(db, project_id)
    _check_project_access(db, project, current_user)
    
    total_tasks = db.query(Task).filter(Task.project_id == project_id).count()
    completed_tasks = db.query(Task).filter(
        Task.project_id == project_id,
        Task.status == TaskStatus.COMPLETED
    ).count()
    in_progress_tasks = db.query(Task).filter(
        Task.project_id == project_id,
        Task.status == TaskStatus.IN_PROGRESS
    ).count()
    blocked_tasks = db.query(Task).filter(
        Task.project_id == project_id,
        Task.status == TaskStatus.BLOCKED
    ).count()
    
    return {
        "project_id": project_id,
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "in_progress_tasks": in_progress_tasks,
        "blocked_tasks": blocked_tasks,
        "completion_percentage": round((completed_tasks / total_tasks * 100), 2) if total_tasks else 0,
    }
