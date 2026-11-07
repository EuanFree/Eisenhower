"""Delegation of sign-off authority API router.

This module exposes REST endpoints for managing temporary delegation
of sign-off authority when line managers are unavailable.

Endpoints
---------

Delegation Management
~~~~~~~~~~~~~~~~~~~~~
- ``POST /api/v1/delegation`` — Create a new delegation record.
- ``GET /api/v1/delegation/my-delegations`` — Get current user's delegations.
- ``GET /api/v1/delegation/active`` — Get current user's active delegation.
- ``POST /api/v1/delegation/{id}/revoke`` — Revoke an active delegation.
- ``GET /api/v1/delegation/coverage`` — Check delegation coverage for a date range.
- ``GET /api/v1/delegation/upcoming`` — Get delegations starting soon.
- ``GET /api/v1/delegation/expiring`` — Get delegations expiring soon.
- ``GET /api/v1/delegation/{user_id}/delegatee`` — Resolve who holds authority for a user.

Admin Endpoints
~~~~~~~~~~~~~~~
- ``GET /api/v1/delegation/admin/all`` — List all delegations (admin only).
- ``GET /api/v1/delegation/admin/needs-delegation`` — Find line managers without delegation.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

from app.database import get_db
from app.models.models import User
from app.utils.auth import get_current_user, require_admin
from app.services import delegation as del_service

router = APIRouter(prefix="/v1/delegation", tags=["Delegation"])


# ============================================================================
# Delegation Management Endpoints
# ============================================================================


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_delegation(
    delegatee_user_id: int,
    start_date: date,
    end_date: date,
    reason: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new delegation record.

    The current user (delegator) temporarily hands over their sign-off
    authority to the specified delegatee for the given date range.

    Parameters
    ----------
    delegatee_user_id : int
        The user who will receive delegated authority.
    start_date : date
        When the delegation becomes active (inclusive).
    end_date : date
        When the delegation expires (inclusive).
    reason : str or None
        Optional explanation for the delegation.

    Returns
    -------
    dict
        The created delegation record with user info.

    Raises
    ------
    HTTPException
        400 if validation fails (self-delegation, date range, overlap).
        404 if users not found.
    """
    try:
        delegation = del_service.create_delegation(
            db,
            delegator_user_id=current_user.id,
            delegatee_user_id=delegatee_user_id,
            start_date=start_date,
            end_date=end_date,
            reason=reason,
        )
        delegatee = db.query(User).filter(User.id == delegation.delegatee_user_id).first()
        return {
            "id": delegation.id,
            "delegator": {
                "id": current_user.id,
                "username": current_user.username,
                "full_name": current_user.full_name,
            },
            "delegatee": {
                "id": delegatee.id,
                "username": delegatee.username,
                "full_name": delegatee.full_name,
            }
            if delegatee
            else None,
            "start_date": str(delegation.start_date),
            "end_date": str(delegation.end_date),
            "reason": delegation.reason,
            "revoked": delegation.revoked,
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/my-delegations")
def get_my_delegations(
    direction: str = Query("outgoing", description="outgoing, incoming, or all"),
    include_revoked: bool = Query(False, description="Include revoked delegations"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the current user's delegations.

    Parameters
    ----------
    direction : str
        "outgoing" — delegations where the user is the delegator.
        "incoming" — delegations where the user is the delegatee.
        "all" — both outgoing and incoming.
    include_revoked : bool
        Whether to include revoked delegations.

    Returns
    -------
    dict
        List of delegation records with user info.
    """
    delegations = del_service.get_delegations_for_user(
        db, current_user.id, direction=direction, include_revoked=include_revoked
    )
    return {"delegations": delegations}


@router.get("/active")
def get_active_delegation(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the current user's active delegation, if any.

    Returns the delegation that is currently active (not revoked and
    covering today's date).

    Returns
    -------
    dict
        The active delegation record, or null if none exists.
    """
    delegation = del_service.get_active_delegation(db, current_user.id)
    if not delegation:
        return {"active_delegation": None}

    delegatee = db.query(User).filter(User.id == delegation.delegatee_user_id).first()
    return {
        "active_delegation": {
            "id": delegation.id,
            "delegatee": {
                "id": delegatee.id,
                "username": delegatee.username,
                "full_name": delegatee.full_name,
            }
            if delegatee
            else None,
            "start_date": str(delegation.start_date),
            "end_date": str(delegation.end_date),
            "reason": delegation.reason,
        }
    }


@router.post("/{delegation_id}/revoke")
def revoke_delegation(
    delegation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revoke an active delegation.

    Only the original delegator can revoke their own delegation.
    Once revoked, authority immediately reverts to the delegator.

    Parameters
    ----------
    delegation_id : int
        The ID of the delegation to revoke.

    Returns
    -------
    dict
        The updated delegation record.

    Raises
    ------
    HTTPException
        400 if already revoked or not the delegator.
        404 if delegation not found.
    """
    try:
        delegation = del_service.revoke_delegation(db, delegation_id, current_user.id)
        delegator = db.query(User).filter(User.id == delegation.delegator_user_id).first()
        delegatee = db.query(User).filter(User.id == delegation.delegatee_user_id).first()
        return {
            "id": delegation.id,
            "delegator": {
                "id": delegator.id,
                "username": delegator.username,
                "full_name": delegator.full_name,
            }
            if delegator
            else None,
            "delegatee": {
                "id": delegatee.id,
                "username": delegatee.username,
                "full_name": delegatee.full_name,
            }
            if delegatee
            else None,
            "start_date": str(delegation.start_date),
            "end_date": str(delegation.end_date),
            "reason": delegation.reason,
            "revoked": delegation.revoked,
            "revoked_at": delegation.revoked_at.isoformat() if delegation.revoked_at else None,
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/coverage")
def check_delegation_coverage(
    start_date: date = Query(..., description="Start of the period to check"),
    end_date: date = Query(..., description="End of the period to check"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check if the current user has delegation covering a date range.

    Useful before submitting a leave request to see if delegation is in place.

    Parameters
    ----------
    start_date : date
        Start of the period to check (inclusive).
    end_date : date
        End of the period to check (inclusive).

    Returns
    -------
    dict
        Coverage result with covered status, gaps, and delegatee info.
    """
    coverage = del_service.check_delegation_coverage(
        db, current_user.id, start_date, end_date
    )
    return coverage


@router.get("/upcoming")
def get_upcoming_delegations(
    days_ahead: int = Query(7, description="Days ahead to look"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get delegations starting within the next N days.

    Parameters
    ----------
    days_ahead : int
        How many days ahead to look (default: 7).

    Returns
    -------
    dict
        List of upcoming delegations.
    """
    upcoming = del_service.get_upcoming_delegations(db, days_ahead)
    return {"upcoming": upcoming}


@router.get("/expiring")
def get_expiring_delegations(
    days_ahead: int = Query(7, description="Days ahead to look"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get active delegations expiring within the next N days.

    Parameters
    ----------
    days_ahead : int
        How many days ahead to look (default: 7).

    Returns
    -------
    dict
        List of expiring delegations with days remaining.
    """
    expiring = del_service.get_expiring_delegations(db, days_ahead)
    return {"expiring": expiring}


@router.get("/{user_id}/delegatee")
def get_delegatee_for_user(
    user_id: int,
    on_date: Optional[date] = Query(None, description="Date to check (default: today)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resolve who holds sign-off authority for a user on a given date.

    If the user has an active delegation, returns the delegatee.
    Otherwise indicates the user retains their own authority.

    Parameters
    ----------
    user_id : int
        The user whose authority is being resolved.
    on_date : date or None
        The date to check (default: today).

    Returns
    -------
    dict
        The delegatee info and delegation record, or null if no delegation.
    """
    delegatee, delegation = del_service.get_delegatee_for_date(db, user_id, on_date)
    if not delegatee:
        return {
            "authority_holder": {
                "id": user_id,
                "self": True,
                "message": "User retains their own sign-off authority.",
            },
            "delegation": None,
        }

    return {
        "authority_holder": {
            "id": delegatee.id,
            "username": delegatee.username,
            "full_name": delegatee.full_name,
            "self": False,
        },
        "delegation": {
            "id": delegation.id,
            "start_date": str(delegation.start_date),
            "end_date": str(delegation.end_date),
            "reason": delegation.reason,
        },
    }


# ============================================================================
# Admin Endpoints
# ============================================================================


@router.get("/admin/all")
def get_all_delegations(
    include_revoked: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """List all delegations in the system (admin only).

    Parameters
    ----------
    include_revoked : bool
        Whether to include revoked delegations.

    Returns
    -------
    dict
        List of all delegation records.
    """
    all_delegations = []
    users = db.query(User).all()
    for user in users:
        delegations = del_service.get_delegations_for_user(
            db, user.id, direction="outgoing", include_revoked=include_revoked
        )
        all_delegations.extend(delegations)

    return {"delegations": all_delegations}


@router.get("/admin/needs-delegation")
def get_managers_needing_delegation(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Find line managers who have approved leave but no delegation coverage.

    This endpoint helps admins identify line managers who need to set up
    delegation before their leave starts.

    Returns
    -------
    dict
        List of line managers with approved leave but no delegation.
    """
    from app.models.models import LeaveRequest, LeaveStatus

    # Find all line managers with approved leave
    approved_leaves = (
        db.query(LeaveRequest)
        .filter(
            LeaveRequest.status == LeaveStatus.APPROVED,
            LeaveRequest.start_date >= date.today(),
        )
        .all()
    )

    managers_needing_delegation = []
    for leave in approved_leaves:
        check = del_service.check_leave_needs_delegation(db, leave.id)
        if check["needs_delegation"]:
            managers_needing_delegation.append({
                "user": check["user"],
                "leave_request": check["leave_request"],
                "coverage": check["coverage"],
            })

    return {
        "managers_needing_delegation": managers_needing_delegation,
        "count": len(managers_needing_delegation),
    }
