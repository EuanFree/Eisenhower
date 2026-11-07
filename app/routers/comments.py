"""Comments router for task-level discussion threads.

This module provides REST endpoints for creating, reading, updating, and
deleting comments attached to tasks within the portfolio management system.
Comments allow team members to discuss task details, share updates, and
maintain an audit trail of decisions.

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
| ``GET /comments/``     | List comments with optional filters.     |
+------------------------+------------------------------------------+
| ``POST /comments/``    | Create a new comment on a task.          |
+------------------------+------------------------------------------+
| ``GET /comments/{id}`` | Get a single comment by ID.              |
+------------------------+------------------------------------------+
| ``PUT /comments/{id}`` | Update a comment (author only).          |
+------------------------+------------------------------------------+
| ``DELETE /comments/{id}`` | Delete a comment (author or admin).  |
+------------------------+------------------------------------------+
| ``GET /comments/task/{id}`` | Get all comments for a task.       |
+------------------------+------------------------------------------+

Access Control
~~~~~~~~~~~~~~

Comments are accessible only to users who have membership in the portfolio
that contains the task's project.  Only the comment author may edit or
delete their own comments; administrators may delete any comment.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models.models import (
    User, Comment, Task, Project, Portfolio, PortfolioMember,
    PortfolioMemberRole
)
from app.schemas.schemas import CommentCreate, CommentResponse
from app.utils.auth import get_current_user

router = APIRouter(prefix="/comments", tags=["Comments"])


def _get_comment_or_404(db: Session, comment_id: int) -> Comment:
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    return comment


def _check_comment_access(db: Session, comment: Comment, user: User):
    """Check if user has access to the comment through its task's project."""
    task = db.query(Task).filter(Task.id == comment.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
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
        raise HTTPException(status_code=403, detail="Access denied to this comment")


@router.get("/", response_model=List[CommentResponse])
def list_comments(
    task_id: Optional[int] = None,
    user_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List comments with optional filters."""
    query = db.query(Comment)
    
    if task_id:
        query = query.filter(Comment.task_id == task_id)
    if user_id:
        query = query.filter(Comment.user_id == user_id)
    
    return query.offset(skip).limit(limit).order_by(Comment.created_at.desc()).all()


@router.post("/", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
def create_comment(
    comment_data: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new comment on a task."""
    # Verify task exists
    task = db.query(Task).filter(Task.id == comment_data.task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Check access
    project = db.query(Project).filter(Project.id == task.project_id).first()
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
    
    comment = Comment(
        content=comment_data.content,
        task_id=comment_data.task_id,
        user_id=current_user.id
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@router.get("/{comment_id}", response_model=CommentResponse)
def get_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a comment by ID."""
    comment = _get_comment_or_404(db, comment_id)
    _check_comment_access(db, comment, current_user)
    return comment


@router.put("/{comment_id}", response_model=CommentResponse)
def update_comment(
    comment_id: int,
    content: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a comment (only the author can edit)."""
    comment = _get_comment_or_404(db, comment_id)
    
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the author can edit this comment")
    
    comment.content = content
    db.commit()
    db.refresh(comment)
    return comment


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a comment (author or admin)."""
    comment = _get_comment_or_404(db, comment_id)
    
    if comment.user_id != current_user.id and current_user.role.value != "admin":
        raise HTTPException(status_code=403, detail="Only the author or admin can delete this comment")
    
    db.delete(comment)
    db.commit()


@router.get("/task/{task_id}", response_model=List[CommentResponse])
def get_task_comments(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all comments for a specific task."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    project = db.query(Project).filter(Project.id == task.project_id).first()
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
    
    return db.query(Comment).filter(
        Comment.task_id == task_id
    ).order_by(Comment.created_at.asc()).all()
