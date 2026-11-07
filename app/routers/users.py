"""User management router for administrative operations.

This module provides endpoints for managing user accounts.  Most
operations require admin privileges.

Endpoints
~~~~~~~~~

- ``GET /api/users/`` — List all users (admin only, with filtering).
- ``GET /api/users/{id}`` — Get a specific user's profile.
- ``PUT /api/users/{id}`` — Update a user's details (admin only).
- ``DELETE /api/users/{id}`` — Delete a user account (admin only).
- ``PATCH /api/users/{id}/password`` — Change a user's password.

Access Control
~~~~~~~~~~~~~~

- **List/Update/Delete** — Requires admin role.
- **Get by ID** — Any authenticated user can view any user's profile.
- **Change password** — Users can change their own password; admins
  can change any user's password.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models.models import User, UserRole
from app.schemas.schemas import UserResponse, UserUpdate
from app.utils.auth import get_current_user, require_admin
from app.utils.security import get_password_hash

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/", response_model=List[UserResponse])
def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    role: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """List all users with optional filtering (admin only).

    Supports filtering by role and searching by username, email, or
    full name.  Results are paginated using skip/limit parameters.

    Parameters
    ----------
    skip : int
        Number of records to skip (for pagination).
    limit : int
        Maximum number of records to return (1-500).
    role : str, optional
        Filter by user role (e.g., 'admin', 'manager').
    search : str, optional
        Search term matched against username, email, and full name.
    db : Session
        Database session.
    current_user : User
        Authenticated admin user.

    Returns
    -------
    list of UserResponse
        Paginated list of user profiles matching the filters.
    """
    query = db.query(User)
    
    if role:
        query = query.filter(User.role == role)
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (User.username.ilike(search_pattern)) | 
            (User.email.ilike(search_pattern)) |
            (User.full_name.ilike(search_pattern))
        )
    
    return query.offset(skip).limit(limit).all()


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a user by ID."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Update a user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = user_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(user, key, value)
    
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Delete a user (admin only)."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db.delete(user)
    db.commit()


@router.patch("/{user_id}/password")
def change_password(
    user_id: int,
    new_password: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Change a user's password. Users can change their own, admins can change any."""
    if user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized to change this user's password")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    
    user.hashed_password = get_password_hash(new_password)
    db.commit()
    return {"message": "Password updated successfully"}
