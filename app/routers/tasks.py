"""Tasks router for work item management within projects.

This module provides REST endpoints for creating, reading, updating, and
deleting tasks within projects.  Tasks are the lowest-level work items in
the legacy data model, representing individual units of work with assignees,
priorities, statuses, and due dates.

.. warning::
   This router uses the legacy relational data model (Task, Project, Portfolio)
   and is **not imported** by the main FastAPI application.  It is retained for
   reference only.  The current system uses the unified
   :class:`~app.models.models.UniversalBreakdownNode` tree structure with the
   WBS router (:mod:`app.routers.wbs`).

Endpoints
---------

+------------------------+------------------------------------------+
| Method                 | Description                              |
+========================+==========================================+
| ``GET /tasks/``        | List tasks with various filters.         |
+------------------------+------------------------------------------+
| ``POST /tasks/``       | Create a new task.                       |
+------------------------+------------------------------------------+
| ``GET /tasks/{id}``    | Get a single task by ID.                 |
+------------------------+------------------------------------------+
| ``PUT /tasks/{id}``    | Update a task.                           |
+------------------------+------------------------------------------+
| ``DELETE /tasks/{id}`` | Delete a task.                           |
+------------------------+------------------------------------------+

Access Control
~~~~~~~~~~~~~~

Tasks are accessible to users who have membership in the portfolio containing
the task's project, or to the task's direct assignee.  Only the portfolio
owner, project manager, or non-viewer members can create, update, or delete
tasks.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
from app.database import get_db
from app.models.models import (
    User, Task, Project, Portfolio, PortfolioMember,
    TaskStatus, TaskPriority, PortfolioMemberRole
)
from app.schemas.schemas import TaskCreate, TaskUpdate, TaskResponse
from app.utils.auth import get_current_user

router = APIRouter(prefix="/tasks", tags=["Tasks"])


def _get_task_or_404(db: Session, task_id: int) -> Task:
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def _check_task_access(db: Session, task: Task, user: User):
    """Check if user has access to the task through its project's portfolio."""
    project = db.query(Project).filter(Project.id == task.project_id).first()
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
        raise HTTPException(status_code=403, detail="Access denied to this task")


@router.get("/", response_model=List[TaskResponse])
def list_tasks(
    project_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    priority_filter: Optional[str] = None,
    assignee_id: Optional[int] = None,
    parent_task_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List tasks with various filters."""
    query = db.query(Task)
    
    if project_id:
        query = query.filter(Task.project_id == project_id)
    if status_filter:
        query = query.filter(Task.status == status_filter)
    if priority_filter:
        query = query.filter(Task.priority == priority_filter)
    if assignee_id:
        query = query.filter(Task.assignee_id == assignee_id)
    if parent_task_id is not None:
        if parent_task_id == -1:
            # Get only root tasks (no parent)
            query = query.filter(Task.parent_task_id.is_(None))
        else:
            query = query.filter(Task.parent_task_id == parent_task_id)
    
    # Filter by accessible projects
    if project_id:
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            portfolio = db.query(Portfolio).filter(Portfolio.id == project.portfolio_id).first()
            if portfolio and portfolio.owner_id != current_user.id:
                member = db.query(PortfolioMember).filter(
                    PortfolioMember.portfolio_id == portfolio.id,
                    PortfolioMember.user_id == current_user.id
                ).first()
                if not member:
                    return []
    else:
        # Show tasks assigned to current user or from accessible portfolios
        accessible_portfolios = db.query(Portfolio.id).filter(
            (Portfolio.owner_id == current_user.id) |
            (Portfolio.id.in_(
                db.query(PortfolioMember.portfolio_id).filter(
                    PortfolioMember.user_id == current_user.id
                )
            ))
        ).subquery()
        accessible_projects = db.query(Project.id).filter(
            Project.portfolio_id.in_(accessible_portfolios.select())
        ).subquery()
        query = query.filter(
            (Task.project_id.in_(accessible_projects.select())) |
            (Task.assignee_id == current_user.id)
        )
    
    return query.offset(skip).limit(limit).all()


@router.post("/", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    task_data: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new task."""
    # Verify project exists and is accessible
    project = db.query(Project).filter(Project.id == task_data.project_id).first()
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
    
    # Verify parent task if specified
    if task_data.parent_task_id:
        parent = db.query(Task).filter(Task.id == task_data.parent_task_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent task not found")
        if parent.project_id != task_data.project_id:
            raise HTTPException(status_code=400, detail="Parent task must belong to the same project")
    
    task = Task(
        **task_data.model_dump(),
        created_by=current_user.id
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get("/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a task by ID."""
    task = _get_task_or_404(db, task_id)
    _check_task_access(db, task, current_user)
    return task


@router.put("/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int,
    task_update: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a task."""
    task = _get_task_or_404(db, task_id)
    _check_task_access(db, task, current_user)
    
    update_data = task_update.model_dump(exclude_unset=True)
    
    # Auto-set completed_at when status changes to completed
    if "status" in update_data and update_data["status"] == TaskStatus.COMPLETED:
        update_data["completed_at"] = datetime.now(timezone.utc)
    elif "status" in update_data and update_data["status"] != TaskStatus.COMPLETED:
        update_data["completed_at"] = None
    
    for key, value in update_data.items():
        setattr(task, key, value)
    
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a task and its subtasks."""
    task = _get_task_or_404(db, task_id)
    _check_task_access(db, task, current_user)
    
    db.delete(task)
    db.commit()


@router.get("/{task_id}/subtasks", response_model=List[TaskResponse])
def get_task_subtasks(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all subtasks of a task."""
    task = _get_task_or_404(db, task_id)
    _check_task_access(db, task, current_user)
    
    return db.query(Task).filter(Task.parent_task_id == task_id).all()


@router.get("/{task_id}/history")
def get_task_history(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get task update history (basic - returns key timestamps)."""
    task = _get_task_or_404(db, task_id)
    _check_task_access(db, task, current_user)
    
    return {
        "task_id": task_id,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "completed_at": task.completed_at,
        "status": task.status.value,
    }
