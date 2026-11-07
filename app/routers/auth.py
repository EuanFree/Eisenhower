"""Authentication router for user registration and login.

This module handles the initial authentication flow:

- **Registration** — Creates a new user account with a hashed password.
- **Login** — Validates credentials and issues a JWT access token.
- **Profile retrieval** — Returns the current user's information.

Authentication Flow
~~~~~~~~~~~~~~~~~~~

1. User registers with username, email, and password.
2. Password is hashed using bcrypt and stored in the database.
3. User logs in with username and password.
4. Server validates the password and returns a JWT token.
5. Client includes the JWT token in the ``Authorization`` header
   for subsequent requests.

Endpoints
~~~~~~~~~

- ``POST /api/auth/register`` — Create a new user account.
- ``POST /api/auth/login`` — Authenticate and receive a JWT token.
- ``GET /api/auth/me`` — Get the current user's profile.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.models import User
from app.schemas.schemas import UserCreate, UserResponse, UserUpdate
from app.utils.security import verify_password, get_password_hash, create_access_token
from app.utils.auth import get_current_user, require_admin

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user account.

    Creates a new user with the provided username, email, and password.
    The password is hashed using bcrypt before storage.  Username and
    email must be unique.

    Parameters
    ----------
    user_data : UserCreate
        The registration data including username, email, password,
        and optional full name and role.
    db : Session
        Database session.

    Returns
    -------
    UserResponse
        The newly created user's profile (without the password).

    Raises
    ------
    HTTPException
        400 if the username or email is already registered.
    """
    # Check if username already exists
    if db.query(User).filter(User.username == user_data.username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    # Check if email already exists
    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    user = User(
        username=user_data.username,
        email=user_data.email,
        full_name=user_data.full_name,
        hashed_password=get_password_hash(user_data.password),
        role=user_data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login")
def login(username: str, password: str, db: Session = Depends(get_db)):
    """Login and receive a JWT access token."""
    user = db.query(User).filter(User.username == username).first()
    
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    access_token = create_access_token(data={"sub": str(user.id)})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": UserResponse.model_validate(user)
    }


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get the current authenticated user's information."""
    return current_user


# ---------------------------------------------------------------------------
# Re-authentication for SCIF display shield lockout
# ---------------------------------------------------------------------------

from pydantic import BaseModel, Field


class ReAuthRequest(BaseModel):
    """Request body for re-authentication after SCIF idle lockout."""
    password: str = Field(..., min_length=1, description="User password or PIN")


class ReAuthResponse(BaseModel):
    """Response after successful re-authentication."""
    access_token: str
    token_type: str


@router.post("/re-authenticate", response_model=ReAuthResponse)
def re_authenticate(
    body: ReAuthRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Re-authenticate the current user after SCIF idle lockout.

    When a SCIF terminal locks due to inactivity, the frontend calls this
    endpoint to verify the user's password before restoring the workspace.
    The caller must already hold a valid JWT (from the original login), and
    the password must match the stored bcrypt hash.

    On success, returns a fresh JWT access token so the session clock
    resets after the lockout period.

    Parameters
    ----------
    body : ReAuthRequest
        The password submitted by the user on the lock screen.
    current_user : User
        The currently authenticated user (from the existing JWT).
    db : Session
        Database session.

    Returns
    -------
    ReAuthResponse
        A new JWT access token and token type.

    Raises
    ------
    HTTPException
        401 if the password is incorrect.
    """
    if not verify_password(body.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": str(current_user.id)})
    return ReAuthResponse(
        access_token=access_token,
        token_type="bearer",
    )
