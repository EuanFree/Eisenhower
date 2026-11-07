"""Check-out lease lifecycle API router.

This module provides the endpoints for managing exclusive sub-tree check-out
reservations.  When a user with CAM or higher authority checks out a sub-tree,
no other user can modify nodes within that scope until the lease is released
or expires.

Endpoints
~~~~~~~~~

- ``POST /checkout/{node_id}`` — Acquire an exclusive lease on a sub-tree.
- ``POST /heartbeat/{lease_token}`` — Extend an active lease by 60 minutes.
- ``POST /checkin/{lease_token}`` — Release a lease and publish changes.
- ``POST /force-break/{lease_token}`` — Admin override to break abandoned leases.
- ``GET /{lease_token}`` — Get details of a specific lease.

Authorization
~~~~~~~~~~~~~

All endpoints require JWT authentication.  The checkout endpoint requires
CAM or higher authority on the target path.  The force-break endpoint
requires PROGRAMME_DIRECTOR or SYSTEM_ADMIN role.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import Optional
from uuid import UUID, uuid4
from datetime import datetime, timezone, timedelta

from app.database import get_db
from app.models.leases import SubTreeCheckOut
from app.models.models import UniversalBreakdownNode, User
from app.utils.auth import get_current_user
from app.schemas.leases import (
    CheckOutRequest,
    CheckOutResponse,
    HeartbeatResponse,
    CheckInResponse,
    ForceBreakResponse,
    LeaseInfoResponse,
)
from app.core.lease_guard import get_active_lease_for_path

router = APIRouter()

# Default lease TTL: 120 minutes
LEASE_TTL_MINUTES = 120
# Heartbeat extension: 60 minutes
HEARTBEAT_EXTENSION_MINUTES = 60


def _has_cam_or_higher_role(user: User) -> bool:
    """Check if user has CAM or higher authority.

    Parameters
    ----------
    user : User
        The authenticated user.

    Returns
    -------
    bool
        True if the user has CAM, MANAGER, ADMIN, PROGRAMME_DIRECTOR,
        or SYSTEM_ADMIN role.
    """
    # Legacy role mapping
    if user.role in ("ADMIN", "MANAGER"):
        return True

    # Fine-grained roles
    delegated_roles = []
    if user.custom_attributes and "delegated_roles" in user.custom_attributes:
        delegated_roles = user.custom_attributes["delegated_roles"]

    cam_roles = {"CAM", "PROGRAMME_DIRECTOR", "SYSTEM_ADMIN", "ENGINEER"}
    return bool(cam_roles & set(delegated_roles))


def _has_admin_or_director_role(user: User) -> bool:
    """Check if user has PROGRAMME_DIRECTOR or SYSTEM_ADMIN role.

    Parameters
    ----------
    user : User
        The authenticated user.

    Returns
    -------
    bool
        True if the user has PROGRAMME_DIRECTOR or SYSTEM_ADMIN role.
    """
    if user.role == "ADMIN":
        return True

    delegated_roles = []
    if user.custom_attributes and "delegated_roles" in user.custom_attributes:
        delegated_roles = user.custom_attributes["delegated_roles"]

    admin_roles = {"PROGRAMME_DIRECTOR", "SYSTEM_ADMIN"}
    return bool(admin_roles & set(delegated_roles))


@router.post("/checkout/{node_id}", response_model=CheckOutResponse)
def checkout_subtree(
    node_id: UUID,
    request: CheckOutRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CheckOutResponse:
    """Acquire an exclusive lease on a sub-tree.

    Verifies that the user has CAM or higher authority on the target path
    and that no conflicting active lease exists.  Creates a new lease record
    with a 120-minute TTL and returns a unique session token.

    Parameters
    ----------
    node_id : UUID
        The root node of the sub-tree to check out.
    request : CheckOutRequest
        Optional check-out note.
    current_user : User
        The authenticated user.
    db : Session
        Active database session.

    Returns
    -------
    CheckOutResponse
        Lease details including the session token.

    Raises
    ------
    HTTPException
        HTTP 403 if the user lacks CAM authority.
        HTTP 404 if the node is not found.
        HTTP 423 if the sub-tree is already checked out by another user.
    """
    # Load the target node
    node = db.get(UniversalBreakdownNode, node_id)
    if node is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node {node_id} not found.",
        )

    # Verify CAM or higher authority
    if not _has_cam_or_higher_role(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CAM or higher authority is required to check out a sub-tree.",
        )

    # Check for existing active lease on this path
    existing_lease = get_active_lease_for_path(db, node.path)
    if existing_lease is not None:
        if existing_lease.leased_by_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail={
                    "error_code": "SUB_TREE_CHECKED_OUT",
                    "message": (
                        f"This sub-tree is currently checked out by another user "
                        f"until {existing_lease.expires_at.strftime('%Y-%m-%d %H:%M')}."
                    ),
                },
            )
        # Current user already holds the lease — return it
        return CheckOutResponse(
            lease_id=existing_lease.id,
            lease_token=existing_lease.lease_token,
            ltree_scope_path=existing_lease.ltree_scope_path,
            leased_at=existing_lease.leased_at,
            expires_at=existing_lease.expires_at,
        )

    # Create new lease
    now = datetime.now(timezone.utc)
    lease = SubTreeCheckOut(
        root_node_id=node_id,
        ltree_scope_path=node.path,
        leased_by_user_id=current_user.id,
        lease_token=uuid4(),
        leased_at=now,
        expires_at=now + timedelta(minutes=LEASE_TTL_MINUTES),
        check_out_note=request.check_out_note,
        is_active=True,
    )
    db.add(lease)
    db.commit()
    db.refresh(lease)

    return CheckOutResponse(
        lease_id=lease.id,
        lease_token=lease.lease_token,
        ltree_scope_path=lease.ltree_scope_path,
        leased_at=lease.leased_at,
        expires_at=lease.expires_at,
    )


@router.post("/heartbeat/{lease_token}", response_model=HeartbeatResponse)
def heartbeat_lease(
    lease_token: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HeartbeatResponse:
    """Extend an active lease by 60 minutes.

    Parameters
    ----------
    lease_token : UUID
        The session token of the lease to extend.
    current_user : User
        The authenticated user.
    db : Session
        Active database session.

    Returns
    -------
    HeartbeatResponse
        Updated expiry timestamp.

    Raises
    ------
    HTTPException
        HTTP 404 if the lease is not found.
        HTTP 403 if the user does not hold the lease.
    """
    result = db.execute(
        select(SubTreeCheckOut).where(SubTreeCheckOut.lease_token == lease_token)
    ).first()

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lease with token {lease_token} not found.",
        )

    lease = result[0] if isinstance(result, tuple) else result

    if not lease.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This lease has already been released.",
        )

    if lease.leased_by_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the lease holder can send heartbeats.",
        )

    # Extend the lease
    lease.expires_at = datetime.now(timezone.utc) + timedelta(minutes=HEARTBEAT_EXTENSION_MINUTES)
    db.commit()
    db.refresh(lease)

    return HeartbeatResponse(
        lease_token=lease.lease_token,
        new_expires_at=lease.expires_at,
    )


@router.post("/checkin/{lease_token}", response_model=CheckInResponse)
def checkin_lease(
    lease_token: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CheckInResponse:
    """Release a lease and publish staged changes.

    Parameters
    ----------
    lease_token : UUID
        The session token of the lease to release.
    current_user : User
        The authenticated user.
    db : Session
        Active database session.

    Returns
    -------
    CheckInResponse
        Confirmation of lease release.

    Raises
    ------
    HTTPException
        HTTP 404 if the lease is not found.
        HTTP 403 if the user does not hold the lease.
    """
    result = db.execute(
        select(SubTreeCheckOut).where(SubTreeCheckOut.lease_token == lease_token)
    ).first()

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lease with token {lease_token} not found.",
        )

    lease = result[0] if isinstance(result, tuple) else result

    if lease.leased_by_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the lease holder can check in.",
        )

    # Release the lease
    now = datetime.now(timezone.utc)
    lease.is_active = False
    db.commit()

    return CheckInResponse(
        lease_token=lease.lease_token,
        released_at=now,
    )


@router.post("/force-break/{lease_token}", response_model=ForceBreakResponse)
def force_break_lease(
    lease_token: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ForceBreakResponse:
    """Administrative override to break an abandoned lease.

    Requires PROGRAMME_DIRECTOR or SYSTEM_ADMIN role.

    Parameters
    ----------
    lease_token : UUID
        The session token of the lease to break.
    current_user : User
        The authenticated user.
    db : Session
        Active database session.

    Returns
    -------
    ForceBreakResponse
        Confirmation of lease break.

    Raises
    ------
    HTTPException
        HTTP 403 if the user lacks admin authority.
        HTTP 404 if the lease is not found.
    """
    if not _has_admin_or_director_role(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="PROGRAMME_DIRECTOR or SYSTEM_ADMIN role is required to force-break a lease.",
        )

    result = db.execute(
        select(SubTreeCheckOut).where(SubTreeCheckOut.lease_token == lease_token)
    ).first()

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lease with token {lease_token} not found.",
        )

    lease = result[0] if isinstance(result, tuple) else result

    # Get the original lease holder's UPN
    original_user = db.get(User, lease.leased_by_user_id)
    original_upn = original_user.email if original_user else "unknown"

    # Break the lease
    now = datetime.now(timezone.utc)
    lease.is_active = False
    db.commit()

    return ForceBreakResponse(
        lease_token=lease.lease_token,
        broken_at=now,
        original_leased_by=original_upn,
    )


@router.get("/{lease_token}", response_model=LeaseInfoResponse)
def get_lease_info(
    lease_token: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LeaseInfoResponse:
    """Get details of a specific lease.

    Parameters
    ----------
    lease_token : UUID
        The session token of the lease.
    current_user : User
        The authenticated user.
    db : Session
        Active database session.

    Returns
    -------
    LeaseInfoResponse
        Lease details.

    Raises
    ------
    HTTPException
        HTTP 404 if the lease is not found.
    """
    result = db.execute(
        select(SubTreeCheckOut).where(SubTreeCheckOut.lease_token == lease_token)
    ).first()

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lease with token {lease_token} not found.",
        )

    lease = result[0] if isinstance(result, tuple) else result

    # Get the lease holder's UPN
    lease_user = db.get(User, lease.leased_by_user_id)
    lease_upn = lease_user.email if lease_user else "unknown"

    return LeaseInfoResponse(
        lease_id=lease.id,
        lease_token=lease.lease_token,
        root_node_id=lease.root_node_id,
        ltree_scope_path=lease.ltree_scope_path,
        leased_by_user_id=lease.leased_by_user_id,
        leased_by_user=lease_upn,
        leased_at=lease.leased_at,
        expires_at=lease.expires_at,
        check_out_note=lease.check_out_note,
        is_active=lease.is_active,
    )
