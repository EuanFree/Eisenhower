"""Line management, leave booking, and resource downtime API router.

This module exposes REST endpoints for:

1. **Line Management** — Setting and querying reporting relationships.
2. **Leave Requests** — Submitting, approving, rejecting, and cancelling leave.
3. **Leave Impact Assessment** — Checking team overlap and delivery risk.
4. **Resource Downtime** — Scheduling and managing physical resource offline periods.
5. **Skills Management** — Querying and managing user skill profiles.

Endpoints
---------

Line Management
~~~~~~~~~~~~~~~
- ``GET /api/v1/line-management/my-manager`` — Get current user's line manager.
- ``GET /api/v1/line-management/my-reports`` — Get direct reports of current user.
- ``GET /api/v1/line-management/all-reports`` — Get all direct and indirect reports.
- ``GET /api/v1/line-management/chain-of-command`` — Get full chain of command.
- ``GET /api/v1/line-management/hierarchy`` — Get nested team hierarchy tree.
- ``PUT /api/v1/line-management/set-manager/{user_id}`` — Set a user's line manager (admin).

Leave Requests
~~~~~~~~~~~~~~
- ``POST /api/v1/leave/requests`` — Submit a new leave request.
- ``GET /api/v1/leave/my-requests`` — Get current user's leave requests.
- ``GET /api/v1/leave/pending`` — Get pending requests for current user's reports.
- ``POST /api/v1/leave/{id}/approve`` — Approve a pending leave request.
- ``POST /api/v1/leave/{id}/reject`` — Reject a pending leave request.
- ``POST /api/v1/leave/{id}/cancel`` — Cancel own pending leave request.
- ``GET /api/v1/leave/overlap-assessment`` — Assess team leave overlap risk.

Resource Downtime
~~~~~~~~~~~~~~~~~
- ``POST /api/v1/downtime`` — Schedule resource offline period.
- ``GET /api/v1/downtime`` — List upcoming downtime records.
- ``GET /api/v1/downtime/{resource_id}`` — Get downtime for a specific resource.
- ``DELETE /api/v1/downtime/{id}`` — Cancel a scheduled downtime.

Skills
~~~~~~
- ``GET /api/v1/skills`` — List all skill definitions.
- ``GET /api/v1/skills/categories`` — List all skill categories.
- ``GET /api/v1/skills/my-skills`` — Get current user's skill profiles.
- ``POST /api/v1/skills/add`` — Add or update a skill for current user.
- ``DELETE /api/v1/skills/{skill_id}`` — Remove a skill from current user.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date
from uuid import UUID

from app.database import get_db
from app.models.models import User
from app.utils.auth import get_current_user, require_admin
from app.services import line_management as lm_service

router = APIRouter(prefix="/v1/line-management", tags=["Line Management"])
leave_router = APIRouter(prefix="/v1/leave", tags=["Leave Management"])
downtime_router = APIRouter(prefix="/v1/downtime", tags=["Resource Downtime"])
skills_router = APIRouter(prefix="/v1/skills", tags=["Skills"])


# ============================================================================
# Line Management Endpoints
# ============================================================================


@router.get("/my-manager")
def get_my_line_manager(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the current user's direct line manager.

    Returns
    -------
    dict
        The line manager's user info, or null if no manager is set.
    """
    manager = lm_service.get_line_manager(db, current_user.id)
    if not manager:
        return {"manager": None}
    return {
        "manager": {
            "id": manager.id,
            "username": manager.username,
            "full_name": manager.full_name,
            "email": manager.email,
        }
    }


@router.get("/my-reports")
def get_my_direct_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all users who report directly to the current user.

    Returns
    -------
    dict
        List of direct reports with their user info.
    """
    reports = lm_service.get_direct_reports(db, current_user.id)
    return {
        "direct_reports": [
            {
                "id": r.id,
                "username": r.username,
                "full_name": r.full_name,
                "email": r.email,
                "role": r.role.value if hasattr(r.role, "value") else str(r.role),
                "is_active": r.is_active,
            }
            for r in reports
        ],
        "count": len(reports),
    }


@router.get("/all-reports")
def get_all_my_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all direct and indirect reports of the current user.

    Returns
    -------
    dict
        List of all reports in the user's reporting tree.
    """
    reports = lm_service.get_all_reports(db, current_user.id)
    return {
        "all_reports": [
            {
                "id": r.id,
                "username": r.username,
                "full_name": r.full_name,
                "email": r.email,
                "role": r.role.value if hasattr(r.role, "value") else str(r.role),
                "is_active": r.is_active,
            }
            for r in reports
        ],
        "count": len(reports),
    }


@router.get("/chain-of-command")
def get_my_chain_of_command(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the full chain of command from the current user upward.

    Returns
    -------
    dict
        Ordered list from direct manager to top-level leader.
    """
    chain = lm_service.get_chain_of_command(db, current_user.id)
    return {
        "chain": [
            {
                "id": u.id,
                "username": u.username,
                "full_name": u.full_name,
                "email": u.email,
            }
            for u in chain
        ]
    }


@router.get("/hierarchy")
def get_team_hierarchy(
    include_indirect: bool = Query(True, description="Include indirect reports"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the nested team hierarchy tree rooted at the current user.

    Parameters
    ----------
    include_indirect : bool
        If True, recursively include all indirect reports.

    Returns
    -------
    dict
        Nested tree structure suitable for org chart rendering.
    """
    hierarchy = lm_service.get_team_hierarchy(db, current_user.id, include_indirect)
    return {"hierarchy": hierarchy}


@router.put("/set-manager/{user_id}")
def set_user_line_manager(
    user_id: int,
    manager_user_id: Optional[int] = Query(None, description="New manager user ID, or null to remove"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Set or change a user's direct line manager (admin only).

    Parameters
    ----------
    user_id : int
        The user whose manager is being set.
    manager_user_id : int or None
        The new manager's user ID, or null to remove the manager.

    Returns
    -------
    dict
        Confirmation of the change.

    Raises
    ------
    HTTPException
        400 if circular reference would be created.
        404 if user not found.
    """
    try:
        link = lm_service.set_line_manager(db, user_id, manager_user_id)
        db.commit()
        return {
            "message": f"Line manager for user {user_id} updated.",
            "link": {
                "report_user_id": link.report_user_id,
                "manager_user_id": link.manager_user_id,
            }
            if link
            else None,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# Leave Request Endpoints
# ============================================================================


@leave_router.post("/requests", status_code=status.HTTP_201_CREATED)
def submit_leave_request(
    leave_type: str,
    start_date: date,
    end_date: date,
    reason: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a new leave request.

    Parameters
    ----------
    leave_type : str
        Type of leave (ANNUAL, SICK, MATERNITY, PATERNITY, JURY, UNPAID, TRAINING, OTHER).
    start_date : date
        First day of leave (inclusive).
    end_date : date
        Last day of leave (inclusive).
    reason : str or None
        Optional explanation.

    Returns
    -------
    dict
        The created leave request.

    Raises
    ------
    HTTPException
        400 if dates are invalid.
    """
    try:
        request = lm_service.create_leave_request(
            db, current_user.id, leave_type, start_date, end_date, reason
        )
        db.commit()
        return {
            "id": request.id,
            "user_id": request.user_id,
            "leave_type": request.leave_type.value if hasattr(request.leave_type, "value") else str(request.leave_type),
            "start_date": request.start_date.isoformat(),
            "end_date": request.end_date.isoformat(),
            "reason": request.reason,
            "status": request.status.value if hasattr(request.status, "value") else str(request.status),
            "created_at": request.created_at.isoformat(),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@leave_router.get("/my-requests")
def get_my_leave_requests(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the current user's leave requests.

    Parameters
    ----------
    status_filter : str or None
        Optional filter by status (PENDING, APPROVED, REJECTED, CANCELLED).

    Returns
    -------
    dict
        List of leave requests.
    """
    requests = lm_service.get_user_leave_requests(db, current_user.id, status_filter)
    return {
        "requests": [
            {
                "id": r.id,
                "leave_type": r.leave_type.value if hasattr(r.leave_type, "value") else str(r.leave_type),
                "start_date": r.start_date.isoformat(),
                "end_date": r.end_date.isoformat(),
                "reason": r.reason,
                "status": r.status.value if hasattr(r.status, "value") else str(r.status),
                "manager_comment": r.manager_comment,
                "approved_at": r.approved_at.isoformat() if r.approved_at else None,
                "created_at": r.created_at.isoformat(),
            }
            for r in requests
        ]
    }


@leave_router.get("/pending")
def get_pending_leave_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all pending leave requests from the current user's direct reports.

    Returns
    -------
    dict
        List of pending leave requests with requester info.
    """
    requests = lm_service.get_pending_leave_for_manager(db, current_user.id)
    return {
        "pending_requests": [
            {
                "id": r.id,
                "user_id": r.user_id,
                "requester": _get_user_info(db, r.user_id),
                "leave_type": r.leave_type.value if hasattr(r.leave_type, "value") else str(r.leave_type),
                "start_date": r.start_date.isoformat(),
                "end_date": r.end_date.isoformat(),
                "reason": r.reason,
                "status": r.status.value if hasattr(r.status, "value") else str(r.status),
                "created_at": r.created_at.isoformat(),
            }
            for r in requests
        ]
    }


@leave_router.post("/{request_id}/approve")
def approve_leave(
    request_id: int,
    comment: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Approve a pending leave request.

    Parameters
    ----------
    request_id : int
        The leave request to approve.
    comment : str or None
        Optional comment from the manager.

    Returns
    -------
    dict
        The updated leave request.

    Raises
    ------
    HTTPException
        400 if request is not PENDING or user is not the line manager.
    """
    try:
        request = lm_service.approve_leave_request(db, request_id, current_user.id, comment)
        db.commit()

        # Check if the leave requester is a line manager who needs delegation
        delegation_warning = None
        try:
            from app.services import delegation as del_service
            check = del_service.check_leave_needs_delegation(db, request.id)
            if check["needs_delegation"]:
                delegation_warning = {
                    "message": (
                        f"{check['user']['full_name']} is a line manager but has no delegation "
                        f"covering their leave period ({check['leave_request']['start_date']} to "
                        f"{check['leave_request']['end_date']}). They should set up delegation."
                    ),
                    "user": check["user"],
                    "leave_period": check["leave_request"],
                }
        except Exception:
            # Delegation check failure should not block leave approval
            pass

        result = {
            "id": request.id,
            "status": request.status.value if hasattr(request.status, "value") else str(request.status),
            "manager_comment": request.manager_comment,
            "approved_at": request.approved_at.isoformat() if request.approved_at else None,
        }
        if delegation_warning:
            result["delegation_warning"] = delegation_warning
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@leave_router.post("/{request_id}/reject")
def reject_leave(
    request_id: int,
    comment: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reject a pending leave request.

    Parameters
    ----------
    request_id : int
        The leave request to reject.
    comment : str or None
        Reason for rejection.

    Returns
    -------
    dict
        The updated leave request.

    Raises
    ------
    HTTPException
        400 if request is not PENDING or user is not the line manager.
    """
    try:
        request = lm_service.reject_leave_request(db, request_id, current_user.id, comment)
        db.commit()
        return {
            "id": request.id,
            "status": request.status.value if hasattr(request.status, "value") else str(request.status),
            "manager_comment": request.manager_comment,
            "approved_at": request.approved_at.isoformat() if request.approved_at else None,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@leave_router.post("/{request_id}/cancel")
def cancel_leave(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cancel own pending leave request.

    Parameters
    ----------
    request_id : int
        The leave request to cancel.

    Returns
    -------
    dict
        The updated leave request.

    Raises
    ------
    HTTPException
        400 if request is not PENDING or user is not the requester.
    """
    try:
        request = lm_service.cancel_leave_request(db, request_id, current_user.id)
        db.commit()
        return {
            "id": request.id,
            "status": request.status.value if hasattr(request.status, "value") else str(request.status),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@leave_router.get("/overlap-assessment")
def assess_leave_overlap(
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Assess delivery risk from overlapping team leave.

    For a given date range, finds all team members with approved leave
    and calculates the absence percentage and risk level.

    Parameters
    ----------
    start_date : date
        Start of the assessment period.
    end_date : date
        End of the assessment period.

    Returns
    -------
    dict
        Risk assessment with team size, absent members, and risk level.
    """
    assessment = lm_service.get_team_leave_overlap(
        db, current_user.id, start_date, end_date
    )
    return assessment


# ============================================================================
# Resource Downtime Endpoints
# ============================================================================


@downtime_router.post("/", status_code=status.HTTP_201_CREATED)
def schedule_downtime(
    resource_node_id: UUID,
    downtime_type: str,
    start_date: date,
    end_date: date,
    reason: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Schedule a period when a physical resource is offline.

    Parameters
    ----------
    resource_node_id : UUID
        The resource being taken offline.
    downtime_type : str
        Reason (MAINTENANCE, CALIBRATION, REPAIR, INSPECTION, MODIFICATION, OTHER).
    start_date : date
        Date the resource goes offline.
    end_date : date
        Expected return-to-service date.
    reason : str or None
        Detailed description.

    Returns
    -------
    dict
        The created downtime record.

    Raises
    ------
    HTTPException
        400 if dates are invalid or resource not found.
    """
    try:
        downtime = lm_service.create_resource_downtime(
            db, resource_node_id, downtime_type, start_date, end_date, reason, current_user.id
        )
        db.commit()
        return {
            "id": downtime.id,
            "resource_node_id": str(downtime.resource_node_id),
            "downtime_type": downtime.downtime_type.value if hasattr(downtime.downtime_type, "value") else str(downtime.downtime_type),
            "start_date": downtime.start_date.isoformat(),
            "end_date": downtime.end_date.isoformat(),
            "reason": downtime.reason,
            "scheduled_by_user_id": downtime.scheduled_by_user_id,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@downtime_router.get("/")
def list_upcoming_downtime(
    days_ahead: int = Query(30, ge=1, le=365, description="Days to look ahead"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all upcoming resource downtime records.

    Parameters
    ----------
    days_ahead : int
        Number of days to look ahead (default 30).

    Returns
    -------
    dict
        List of upcoming downtime records.
    """
    downtimes = lm_service.get_all_upcoming_downtime(db, days_ahead)
    return {
        "downtimes": [
            {
                "id": d.id,
                "resource_node_id": str(d.resource_node_id),
                "resource_name": d.resource_node.name if d.resource_node else None,
                "downtime_type": d.downtime_type.value if hasattr(d.downtime_type, "value") else str(d.downtime_type),
                "start_date": d.start_date.isoformat(),
                "end_date": d.end_date.isoformat(),
                "reason": d.reason,
                "scheduled_by": _get_user_info(db, d.scheduled_by_user_id) if d.scheduled_by_user_id else None,
            }
            for d in downtimes
        ]
    }


@downtime_router.get("/{resource_node_id}")
def get_resource_downtime(
    resource_node_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get downtime records for a specific resource.

    Parameters
    ----------
    resource_node_id : UUID
        The resource to query.

    Returns
    -------
    dict
        List of downtime records for the resource.
    """
    downtimes = lm_service.get_resource_downtime(db, resource_node_id)
    return {
        "downtimes": [
            {
                "id": d.id,
                "downtime_type": d.downtime_type.value if hasattr(d.downtime_type, "value") else str(d.downtime_type),
                "start_date": d.start_date.isoformat(),
                "end_date": d.end_date.isoformat(),
                "reason": d.reason,
                "actual_return_date": d.actual_return_date.isoformat() if d.actual_return_date else None,
            }
            for d in downtimes
        ]
    }


@downtime_router.delete("/{downtime_id}")
def cancel_downtime(
    downtime_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cancel a scheduled downtime record.

    Parameters
    ----------
    downtime_id : int
        The downtime record to cancel.

    Returns
    -------
    dict
        Confirmation of cancellation.

    Raises
    ------
    HTTPException
        404 if downtime record not found.
    """
    try:
        downtime = lm_service.cancel_resource_downtime(db, downtime_id)
        db.commit()
        return {
            "message": f"Downtime {downtime_id} cancelled.",
            "resource_node_id": str(downtime.resource_node_id),
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ============================================================================
# Skills Endpoints
# ============================================================================


@skills_router.get("/")
def list_all_skills(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all defined skills with their categories.

    Returns
    -------
    dict
        List of skill definitions.
    """
    skills = lm_service.get_all_skills(db)
    return {
        "skills": [
            {
                "id": s.id,
                "code": s.code,
                "name": s.name,
                "description": s.description,
                "category": s.category.name if s.category else None,
            }
            for s in skills
        ]
    }


@skills_router.get("/categories")
def list_skill_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all skill categories.

    Returns
    -------
    dict
        List of skill categories.
    """
    categories = lm_service.get_all_skill_categories(db)
    return {
        "categories": [
            {
                "id": c.id,
                "code": c.code,
                "name": c.name,
                "description": c.description,
            }
            for c in categories
        ]
    }


@skills_router.get("/my-skills")
def get_my_skills(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the current user's skill profiles.

    Returns
    -------
    dict
        List of skill profiles with proficiency and verification.
    """
    profiles = lm_service.get_user_skills(db, current_user.id)
    return {
        "skills": [
            {
                "id": p.id,
                "skill_id": p.skill_id,
                "skill_name": p.skill.name if p.skill else None,
                "category": p.skill.category.name if p.skill and p.skill.category else None,
                "proficiency_level": p.proficiency_level.value if hasattr(p.proficiency_level, "value") else int(p.proficiency_level),
                "verification_status": p.verification_status.value if hasattr(p.verification_status, "value") else str(p.verification_status),
                "certificate_expiry": p.certificate_expiry.isoformat() if p.certificate_expiry else None,
            }
            for p in profiles
        ]
    }


@skills_router.post("/add")
def add_skill(
    skill_id: int,
    proficiency_level: int = 1,
    verification_status: str = "SELF_ATTESTED",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add or update a skill for the current user.

    Parameters
    ----------
    skill_id : int
        The skill to add.
    proficiency_level : int
        Proficiency level (1-5).
    verification_status : str
        Verification status (SELF_ATTESTED, ENDORSED, CERTIFIED).

    Returns
    -------
    dict
        The created or updated skill profile.
    """
    profile = lm_service.add_user_skill(
        db, current_user.id, skill_id, proficiency_level, verification_status
    )
    db.commit()
    return {
        "id": profile.id,
        "skill_id": profile.skill_id,
        "proficiency_level": profile.proficiency_level.value if hasattr(profile.proficiency_level, "value") else int(profile.proficiency_level),
        "verification_status": profile.verification_status.value if hasattr(profile.verification_status, "value") else str(profile.verification_status),
    }


@skills_router.delete("/{skill_id}")
def remove_skill(
    skill_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a skill from the current user's profile.

    Parameters
    ----------
    skill_id : int
        The skill to remove.

    Returns
    -------
    dict
        Confirmation of removal.
    """
    removed = lm_service.remove_user_skill(db, current_user.id, skill_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Skill not found in profile.")
    db.commit()
    return {"message": f"Skill {skill_id} removed from profile."}


# ============================================================================
# Helpers
# ============================================================================


def _get_user_info(db: Session, user_id: Optional[int]):
    """Helper to serialize user info for API responses."""
    if not user_id:
        return None
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "email": user.email,
    }
