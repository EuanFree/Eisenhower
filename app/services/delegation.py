"""Delegation of sign-off authority service.

This module provides the business logic for temporary delegation of
sign-off authority when a line manager is unavailable due to leave,
training, or other commitments.

Architecture
------------

A DelegationRecord links a delegator (the line manager stepping away)
to a delegatee (the colleague taking over sign-off duties) for a
defined date range. During this period, any action that would normally
require the delegator's approval is instead routed to the delegatee.

Key constraints:
- A user can only have one active (non-revoked, date-overlapping) delegation at a time.
- A user cannot delegate to themselves.
- The delegator can revoke a delegation at any time if plans change.

Notification Integration
------------------------

When a leave request for a line manager is approved, the system checks
whether they have an active delegation covering the leave period. If not,
a DELEGATION_REQUIRED notification is dispatched to remind them.

Functions
---------

- create_delegation: Create a new delegation record.
- revoke_delegation: Revoke an active delegation before its end date.
- get_active_delegation: Find the active delegation for a user on a given date.
- get_delegatee_for_date: Resolve who holds sign-off authority on a given date.
- get_delegations_for_user: List all delegations (outgoing and/or incoming).
- check_delegation_coverage: Check if a user has delegation covering a date range.
- get_upcoming_delegations: Find delegations starting soon.
- get_expiring_delegations: Find delegations expiring soon.
"""

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from datetime import date, timezone, datetime, timedelta
from typing import List, Optional, Dict, Any, Tuple

from app.models.models import (
    User,
    DelegationRecord,
    LeaveRequest,
    LeaveStatus,
)


# ============================================================================
# Delegation CRUD
# ============================================================================


def create_delegation(
    db: Session,
    delegator_user_id: int,
    delegatee_user_id: int,
    start_date: date,
    end_date: date,
    reason: Optional[str] = None,
) -> DelegationRecord:
    """Create a new delegation record.

    The delegator temporarily hands over their sign-off authority to the
    delegatee for the specified date range.

    Parameters
    ----------
    db : Session
        Database session.
    delegator_user_id : int
        The user who is delegating their authority.
    delegatee_user_id : int
        The user who receives delegated authority.
    start_date : date
        When the delegation becomes active (inclusive).
    end_date : date
        When the delegation expires (inclusive).
    reason : str or None
        Optional explanation for the delegation.

    Returns
    -------
    DelegationRecord
        The newly created delegation record.

    Raises
    ------
    ValueError
        If delegator and delegatee are the same user.
        If end_date is before start_date.
        If the delegator already has an active, non-revoked delegation
        that overlaps with the requested date range.
    """
    if delegator_user_id == delegatee_user_id:
        raise ValueError("A user cannot delegate to themselves.")

    if end_date < start_date:
        raise ValueError("End date must be on or after start date.")

    # Check for overlapping active delegations
    existing = (
        db.query(DelegationRecord)
        .filter(
            DelegationRecord.delegator_user_id == delegator_user_id,
            DelegationRecord.revoked == False,  # noqa: E712
            DelegationRecord.start_date <= end_date,
            DelegationRecord.end_date >= start_date,
        )
        .first()
    )
    if existing:
        raise ValueError(
            f"An active delegation already exists for the period "
            f"{existing.start_date} to {existing.end_date}. "
            "Revoke it first or choose a non-overlapping date range."
        )

    # Verify both users exist
    delegator = db.query(User).filter(User.id == delegator_user_id).first()
    delegatee = db.query(User).filter(User.id == delegatee_user_id).first()
    if not delegator:
        raise ValueError("Delegator user not found.")
    if not delegatee:
        raise ValueError("Delegatee user not found.")

    delegation = DelegationRecord(
        delegator_user_id=delegator_user_id,
        delegatee_user_id=delegatee_user_id,
        start_date=start_date,
        end_date=end_date,
        reason=reason,
        revoked=False,
    )
    db.add(delegation)
    db.commit()
    db.refresh(delegation)
    return delegation


def revoke_delegation(
    db: Session, delegation_id: int, delegator_user_id: int
) -> DelegationRecord:
    """Revoke an active delegation before its end date.

    Only the original delegator can revoke their own delegation.
    Once revoked, authority immediately reverts to the delegator.

    Parameters
    ----------
    db : Session
        Database session.
    delegation_id : int
        The ID of the delegation to revoke.
    delegator_user_id : int
        The user requesting revocation (must be the original delegator).

    Returns
    -------
    DelegationRecord
        The updated delegation record with revoked=True.

    Raises
    ------
    ValueError
        If the delegation doesn't exist, is already revoked, or the
        requesting user is not the original delegator.
    """
    delegation = db.query(DelegationRecord).filter(
        DelegationRecord.id == delegation_id
    ).first()

    if not delegation:
        raise ValueError("Delegation record not found.")

    if delegation.revoked:
        raise ValueError("This delegation has already been revoked.")

    if delegation.delegator_user_id != delegator_user_id:
        raise ValueError("Only the original delegator can revoke this delegation.")

    delegation.revoked = True
    delegation.revoked_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(delegation)
    return delegation


def get_active_delegation(
    db: Session, user_id: int, on_date: Optional[date] = None
) -> Optional[DelegationRecord]:
    """Find the active (non-revoked) delegation for a user on a given date.

    An active delegation is one where:
    - The user is the delegator.
    - The delegation is not revoked.
    - The date falls within the delegation's start_date and end_date range.

    Parameters
    ----------
    db : Session
        Database session.
    user_id : int
        The user whose active delegation is being looked up.
    on_date : date or None
        The date to check. If None, uses today's date.

    Returns
    -------
    DelegationRecord or None
        The active delegation record, or None if no delegation is active.
    """
    check_date = on_date if on_date is not None else date.today()

    return (
        db.query(DelegationRecord)
        .filter(
            DelegationRecord.delegator_user_id == user_id,
            DelegationRecord.revoked == False,  # noqa: E712
            DelegationRecord.start_date <= check_date,
            DelegationRecord.end_date >= check_date,
        )
        .first()
    )


def get_delegatee_for_date(
    db: Session, user_id: int, on_date: Optional[date] = None
) -> Tuple[Optional[User], Optional[DelegationRecord]]:
    """Resolve who holds sign-off authority for a user on a given date.

    If the user has an active delegation covering the date, returns the
    delegatee. Otherwise returns None, indicating the user retains their
    own authority.

    Parameters
    ----------
    db : Session
        Database session.
    user_id : int
        The user whose sign-off authority is being resolved.
    on_date : date or None
        The date to check. If None, uses today's date.

    Returns
    -------
    tuple of (User or None, DelegationRecord or None)
        The delegatee user and the delegation record, or (None, None)
        if no delegation is active.
    """
    delegation = get_active_delegation(db, user_id, on_date)
    if not delegation:
        return None, None

    delegatee = db.query(User).filter(User.id == delegation.delegatee_user_id).first()
    return delegatee, delegation


def check_delegation_coverage(
    db: Session, user_id: int, start_date: date, end_date: date
) -> Dict[str, Any]:
    """Check if a user has delegation covering a specific date range.

    This is used when a line manager's leave is approved to determine
    whether they have arranged for someone to cover their sign-off duties.

    Parameters
    ----------
    db : Session
        Database session.
    user_id : int
        The user whose delegation coverage is being checked.
    start_date : date
        The start of the period to check (inclusive).
    end_date : date
        The end of the period to check (inclusive).

    Returns
    -------
    dict
        A dictionary containing:
        - covered: bool — Whether the entire range is covered.
        - delegation: dict or None — The active delegation if coverage exists.
        - gaps: list — List of date ranges not covered by delegation.
        - delegatee: dict or None — The delegatee user info if coverage exists.
    """
    # Find all active (non-revoked) delegations for this user that overlap
    delegations = (
        db.query(DelegationRecord)
        .filter(
            DelegationRecord.delegator_user_id == user_id,
            DelegationRecord.revoked == False,  # noqa: E712
            DelegationRecord.start_date <= end_date,
            DelegationRecord.end_date >= start_date,
        )
        .all()
    )

    if not delegations:
        return {
            "covered": False,
            "delegation": None,
            "gaps": [{"start": str(start_date), "end": str(end_date)}],
            "delegatee": None,
        }

    # Check if a single delegation covers the entire range
    full_coverage = None
    for d in delegations:
        if d.start_date <= start_date and d.end_date >= end_date:
            full_coverage = d
            break

    if full_coverage:
        delegatee = (
            db.query(User).filter(User.id == full_coverage.delegatee_user_id).first()
        )
        return {
            "covered": True,
            "delegation": {
                "id": full_coverage.id,
                "start_date": str(full_coverage.start_date),
                "end_date": str(full_coverage.end_date),
                "reason": full_coverage.reason,
            },
            "gaps": [],
            "delegatee": {
                "id": delegatee.id,
                "username": delegatee.username,
                "full_name": delegatee.full_name,
            }
            if delegatee
            else None,
        }

    # Partial coverage — calculate gaps
    covered_ranges = []
    for d in delegations:
        # Clip to the requested range
        range_start = max(d.start_date, start_date)
        range_end = min(d.end_date, end_date)
        covered_ranges.append((range_start, range_end))

    # Sort and merge overlapping ranges
    covered_ranges.sort()
    merged = [covered_ranges[0]]
    for start, end in covered_ranges[1:]:
        if start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))

    # Calculate gaps
    gaps = []
    current = start_date
    for range_start, range_end in merged:
        if range_start > current:
            gaps.append({"start": str(current), "end": str(range_start - timedelta(days=1))})
        current = range_end + timedelta(days=1)
    if current <= end_date:
        gaps.append({"start": str(current), "end": str(end_date)})

    # Return info about the first delegation found
    first_d = delegations[0]
    delegatee = db.query(User).filter(User.id == first_d.delegatee_user_id).first()

    return {
        "covered": len(gaps) == 0,
        "delegation": {
            "id": first_d.id,
            "start_date": str(first_d.start_date),
            "end_date": str(first_d.end_date),
            "reason": first_d.reason,
        },
        "gaps": gaps,
        "delegatee": {
            "id": delegatee.id,
            "username": delegatee.username,
            "full_name": delegatee.full_name,
        }
        if delegatee
        else None,
    }


# ============================================================================
# Delegation Listing
# ============================================================================


def get_delegations_for_user(
    db: Session,
    user_id: int,
    direction: str = "outgoing",
    include_revoked: bool = False,
) -> List[Dict[str, Any]]:
    """List all delegations for a user.

    Parameters
    ----------
    db : Session
        Database session.
    user_id : int
        The user whose delegations are being listed.
    direction : str
        "outgoing" — delegations where the user is the delegator.
        "incoming" — delegations where the user is the delegatee.
        "all" — both outgoing and incoming.
    include_revoked : bool
        Whether to include revoked delegations in the results.

    Returns
    -------
    list of dict
        List of delegation records with user info.
    """
    query = db.query(DelegationRecord)

    if direction == "outgoing":
        query = query.filter(DelegationRecord.delegator_user_id == user_id)
    elif direction == "incoming":
        query = query.filter(DelegationRecord.delegatee_user_id == user_id)
    else:  # "all"
        query = query.filter(
            or_(
                DelegationRecord.delegator_user_id == user_id,
                DelegationRecord.delegatee_user_id == user_id,
            )
        )

    if not include_revoked:
        query = query.filter(DelegationRecord.revoked == False)  # noqa: E712

    query = query.order_by(DelegationRecord.start_date.desc())
    delegations = query.all()

    results = []
    for d in delegations:
        delegator = db.query(User).filter(User.id == d.delegator_user_id).first()
        delegatee = db.query(User).filter(User.id == d.delegatee_user_id).first()

        is_active = (
            not d.revoked
            and d.start_date <= date.today()
            and d.end_date >= date.today()
        )

        results.append({
            "id": d.id,
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
            "start_date": str(d.start_date),
            "end_date": str(d.end_date),
            "reason": d.reason,
            "revoked": d.revoked,
            "revoked_at": d.revoked_at.isoformat() if d.revoked_at else None,
            "is_active": is_active,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        })

    return results


def get_upcoming_delegations(
    db: Session, days_ahead: int = 7
) -> List[Dict[str, Any]]:
    """Find all delegations that are starting within the next N days.

    Parameters
    ----------
    db : Session
        Database session.
    days_ahead : int
        How many days ahead to look (default: 7).

    Returns
    -------
    list of dict
        List of upcoming delegations with user info.
    """
    today = date.today()
    future_date = today + timedelta(days=days_ahead)

    delegations = (
        db.query(DelegationRecord)
        .filter(
            DelegationRecord.revoked == False,  # noqa: E712
            DelegationRecord.start_date >= today,
            DelegationRecord.start_date <= future_date,
        )
        .order_by(DelegationRecord.start_date)
        .all()
    )

    results = []
    for d in delegations:
        delegator = db.query(User).filter(User.id == d.delegator_user_id).first()
        delegatee = db.query(User).filter(User.id == d.delegatee_user_id).first()

        results.append({
            "id": d.id,
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
            "start_date": str(d.start_date),
            "end_date": str(d.end_date),
            "reason": d.reason,
        })

    return results


def get_expiring_delegations(
    db: Session, days_ahead: int = 7
) -> List[Dict[str, Any]]:
    """Find all active delegations that are expiring within the next N days.

    Parameters
    ----------
    db : Session
        Database session.
    days_ahead : int
        How many days ahead to look (default: 7).

    Returns
    -------
    list of dict
        List of expiring delegations with user info.
    """
    today = date.today()
    future_date = today + timedelta(days=days_ahead)

    delegations = (
        db.query(DelegationRecord)
        .filter(
            DelegationRecord.revoked == False,  # noqa: E712
            DelegationRecord.start_date <= today,
            DelegationRecord.end_date >= today,
            DelegationRecord.end_date <= future_date,
        )
        .order_by(DelegationRecord.end_date)
        .all()
    )

    results = []
    for d in delegations:
        delegator = db.query(User).filter(User.id == d.delegator_user_id).first()
        delegatee = db.query(User).filter(User.id == d.delegatee_user_id).first()

        results.append({
            "id": d.id,
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
            "start_date": str(d.start_date),
            "end_date": str(d.end_date),
            "reason": d.reason,
            "days_remaining": (d.end_date - today).days,
        })

    return results


# ============================================================================
# Leave-Triggered Delegation Check
# ============================================================================


def check_leave_needs_delegation(
    db: Session, leave_request_id: int
) -> Dict[str, Any]:
    """Check whether an approved leave request has delegation coverage.

    This is called after a leave request is approved. If the user is a
    line manager (has direct reports) and does not have delegation covering
    their leave period, a notification should be sent.

    Parameters
    ----------
    db : Session
        Database session.
    leave_request_id : int
        The ID of the leave request to check.

    Returns
    -------
    dict
        A dictionary containing:
        - needs_delegation: bool — Whether delegation is needed but not in place.
        - is_line_manager: bool — Whether the user has direct reports.
        - coverage: dict — The result of check_delegation_coverage.
        - user: dict — The user's info.
        - leave_request: dict — The leave request info.
    """
    leave_request = (
        db.query(LeaveRequest).filter(LeaveRequest.id == leave_request_id).first()
    )
    if not leave_request:
        raise ValueError("Leave request not found.")

    user = db.query(User).filter(User.id == leave_request.user_id).first()
    if not user:
        raise ValueError("User not found.")

    # Check if this user is a line manager (has direct reports)
    direct_reports = (
        db.query(User)
        .filter(User.line_manager_id == user.id)
        .all()
    )
    is_line_manager = len(direct_reports) > 0

    if not is_line_manager:
        return {
            "needs_delegation": False,
            "is_line_manager": False,
            "coverage": None,
            "user": {
                "id": user.id,
                "username": user.username,
                "full_name": user.full_name,
            },
            "leave_request": {
                "id": leave_request.id,
                "start_date": str(leave_request.start_date),
                "end_date": str(leave_request.end_date),
            },
        }

    # Check delegation coverage for the leave period
    coverage = check_delegation_coverage(
        db, user.id, leave_request.start_date, leave_request.end_date
    )

    needs_delegation = not coverage["covered"]

    return {
        "needs_delegation": needs_delegation,
        "is_line_manager": True,
        "coverage": coverage,
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
        },
        "leave_request": {
            "id": leave_request.id,
            "start_date": str(leave_request.start_date),
            "end_date": str(leave_request.end_date),
        },
    }
