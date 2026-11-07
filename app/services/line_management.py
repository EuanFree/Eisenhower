"""Line management, leave booking, and resource downtime service.

This module provides the business logic for:

1. **Line Management Hierarchy** — Building the reporting tree from
   User.line_manager_id, traversing up (chain of command) and down
   (direct and indirect reports).

2. **Leave Request Workflow** — Creating leave requests, approving/rejecting
   them via the line manager, and detecting overlapping leave that may
   cause delivery risk.

3. **Resource Downtime** — Scheduling periods when physical resources
   (equipment, facilities) are offline for maintenance, calibration,
   repair, or inspection.

4. **Generic Resource Skills** — Managing skill definitions and linking
   them to ResourceNodes so generic resources can be matched by skill set.

Architecture
------------

The line management hierarchy is stored as a simple self-referencing
foreign key on the User model (line_manager_id).  This forms a tree
where root nodes are senior leaders with no manager, and leaves are
individual contributors.

Leave requests flow through a simple approval workflow:
1. User submits a request (PENDING).
2. Line manager reviews and approves/rejects (APPROVED/REJECTED).
3. The system checks for overlapping leave among team members to
   assess delivery risk.

Resource downtime records are independent of leave but serve a similar
purpose for physical resources — they tell the scheduling engine not
to assign tasks during the offline period.

Functions
---------

- get_line_manager: Find a user's direct line manager.
- get_direct_reports: Find all users reporting directly to a manager.
- get_all_reports: Recursively find all direct and indirect reports.
- get_chain_of_command: Traverse up to find the full chain of command.
- create_leave_request: Submit a new leave request.
- approve_leave_request: Line manager approves a pending request.
- reject_leave_request: Line manager rejects a pending request.
- cancel_leave_request: Requester cancels their own pending request.
- get_pending_leave_for_manager: Find all pending requests for a manager.
- get_team_leave_overlap: Detect overlapping leave among team members.
- create_resource_downtime: Schedule a resource offline period.
- cancel_resource_downtime: Cancel a scheduled downtime window.
- get_resource_downtime: List downtime records for a resource.
"""

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from datetime import date, timezone, datetime
from typing import List, Optional, Dict, Any, Set
from uuid import UUID

from app.models.models import (
    User,
    LineManagementLink,
    LeaveRequest,
    LeaveStatus,
    LeaveType,
    ResourceDowntime,
    DowntimeType,
    ResourceNode,
    SkillDefinition,
    SkillCategory,
    UserSkillProfile,
    ProficiencyLevel,
    VerificationStatus,
)


# ============================================================================
# Line Management Hierarchy
# ============================================================================


def get_line_manager(db: Session, user_id: int) -> Optional[User]:
    """Find a user's direct line manager.

    Parameters
    ----------
    db : Session
        Database session.
    user_id : int
        The user whose line manager is being looked up.

    Returns
    -------
    User or None
        The direct line manager, or None if the user has no manager
        (e.g., a root-level programme director).
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.line_manager_id:
        return None
    return db.query(User).filter(User.id == user.line_manager_id).first()


def set_line_manager(
    db: Session, user_id: int, manager_user_id: Optional[int]
) -> Optional[LineManagementLink]:
    """Set or change a user's direct line manager.

    This is an admin-only operation.  It updates both the User.line_manager_id
    convenience column and creates/updates the canonical LineManagementLink record.

    Parameters
    ----------
    db : Session
        Database session.
    user_id : int
        The user whose manager is being set.
    manager_user_id : int or None
        The new manager's user ID, or None to remove the manager.

    Returns
    -------
    LineManagementLink or None
        The created or updated link record.

    Raises
    ------
    ValueError
        If setting the manager would create a circular chain (A manages B,
        B manages A) or if the user is trying to be their own manager.
    """
    if user_id == manager_user_id:
        raise ValueError("A user cannot be their own line manager.")

    # Check for circular references
    if manager_user_id is not None:
        chain = get_chain_of_command(db, manager_user_id)
        if any(u.id == user_id for u in chain):
            raise ValueError(
                "Setting this manager would create a circular reporting chain."
            )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None

    user.line_manager_id = manager_user_id

    # Update or create the canonical link
    existing = (
        db.query(LineManagementLink)
        .filter(LineManagementLink.report_user_id == user_id)
        .first()
    )
    if existing:
        existing.manager_user_id = manager_user_id
    else:
        link = LineManagementLink(
            report_user_id=user_id,
            manager_user_id=manager_user_id,
        )
        db.add(link)

    db.flush()
    return existing or db.query(LineManagementLink).filter(
        LineManagementLink.report_user_id == user_id
    ).first()


def get_direct_reports(db: Session, manager_user_id: int) -> List[User]:
    """Find all users who report directly to a manager.

    Parameters
    ----------
    db : Session
        Database session.
    manager_user_id : int
        The manager whose direct reports are being queried.

    Returns
    -------
    list of User
        All users whose line_manager_id equals the given manager ID.
    """
    return (
        db.query(User)
        .filter(User.line_manager_id == manager_user_id, User.is_active == True)
        .all()
    )


def get_all_reports(db: Session, manager_user_id: int) -> List[User]:
    """Recursively find all direct and indirect reports of a manager.

    Traverses the entire subtree below the manager, collecting all users
    at any depth.  This is useful for assessing the full impact of a
    manager's absence or for bulk operations on a team.

    Parameters
    ----------
    db : Session
        Database session.
    manager_user_id : int
        The root manager whose entire reporting tree is being queried.

    Returns
    -------
    list of User
        All users in the manager's reporting tree (direct and indirect),
        excluding the manager themselves.
    """
    all_reports: List[User] = []
    visited: Set[int] = set()
    to_process = [manager_user_id]

    while to_process:
        current_id = to_process.pop()
        if current_id in visited:
            continue
        visited.add(current_id)

        direct = get_direct_reports(db, current_id)
        for report in direct:
            all_reports.append(report)
            to_process.append(report.id)

    return all_reports


def get_chain_of_command(db: Session, user_id: int) -> List[User]:
    """Traverse up the hierarchy to find the full chain of command.

    Starting from the given user, follows line_manager_id upward until
    reaching a root user (no manager).  The returned list is ordered
    from the user's direct manager to the top of the chain.

    Parameters
    ----------
    db : Session
        Database session.
    user_id : int
        The user whose chain of command is being traced.

    Returns
    -------
    list of User
        Ordered list from direct manager to top-level leader.
        Empty list if the user has no manager.
    """
    chain: List[User] = []
    current = get_line_manager(db, user_id)
    visited: Set[int] = set()

    while current and current.id not in visited:
        visited.add(current.id)
        chain.append(current)
        current = get_line_manager(db, current.id)

    return chain


def get_team_hierarchy(
    db: Session, manager_user_id: int, include_indirect: bool = True
) -> Dict[str, Any]:
    """Build a complete hierarchy tree for a manager's team.

    Returns a nested structure suitable for rendering an org chart
    in the frontend.  Each node contains the user's info and a
    'reports' array of their direct reports.

    Parameters
    ----------
    db : Session
        Database session.
    manager_user_id : int
        The root manager of the hierarchy.
    include_indirect : bool
        If True, recursively include all indirect reports.
        If False, only return direct reports.

    Returns
    -------
    dict
        Nested tree structure with user info and reports arrays.
    """
    manager = db.query(User).filter(User.id == manager_user_id).first()
    if not manager:
        return {}

    def build_node(user_id: int) -> Dict[str, Any]:
        """Recursively build a hierarchy node for a user and their reports.

        Args
        ----\n        user_id : int
            The ID of the user to build the node for.

        Returns
        -------
        Dict[str, Any]
            A dictionary containing the user's info and a nested ``reports``
            array of their direct (and indirect) reports.
        """
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return {}

        node = {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role.value if hasattr(user.role, "value") else str(user.role),
            "clearance_level": (
                user.clearance_level.value
                if hasattr(user.clearance_level, "value")
                else str(user.clearance_level)
            ),
            "is_active": user.is_active,
            "reports": [],
        }

        if include_indirect:
            direct = get_direct_reports(db, user_id)
            node["reports"] = [build_node(r.id) for r in direct]

        return node

    return build_node(manager_user_id)


# ============================================================================
# Leave Request Management
# ============================================================================


def create_leave_request(
    db: Session,
    user_id: int,
    leave_type: str,
    start_date: date,
    end_date: date,
    reason: Optional[str] = None,
) -> LeaveRequest:
    """Submit a new leave request on behalf of a user.

    The request is created with PENDING status and will be reviewed
    by the user's line manager.

    Parameters
    ----------
    db : Session
        Database session.
    user_id : int
        The user requesting leave.
    leave_type : str
        Type of leave (ANNUAL, SICK, MATERNITY, etc.).
    start_date : date
        First day of leave (inclusive).
    end_date : date
        Last day of leave (inclusive).
    reason : str or None
        Optional explanation for the leave.

    Returns
    -------
    LeaveRequest
        The newly created leave request record.

    Raises
    ------
    ValueError
        If end_date is before start_date.
    """
    if end_date < start_date:
        raise ValueError("End date must be on or after start date.")

    request = LeaveRequest(
        user_id=user_id,
        leave_type=leave_type,
        start_date=start_date,
        end_date=end_date,
        reason=reason,
        status=LeaveStatus.PENDING,
    )
    db.add(request)
    db.flush()
    db.refresh(request)
    return request


def approve_leave_request(
    db: Session,
    request_id: int,
    manager_user_id: int,
    comment: Optional[str] = None,
) -> LeaveRequest:
    """Approve a pending leave request.

    Only the line manager of the requesting user (or an admin) can
    approve the request.  The system also checks for overlapping
    leave among team members to assess delivery risk.

    Parameters
    ----------
    db : Session
        Database session.
    request_id : int
        The leave request to approve.
    manager_user_id : int
        The manager approving the request.
    comment : str or None
        Optional comment from the manager.

    Returns
    -------
    LeaveRequest
        The updated leave request with APPROVED status.

    Raises
    ------
    ValueError
        If the request is not PENDING or the user is not the line manager.
    """
    request = db.query(LeaveRequest).filter(LeaveRequest.id == request_id).first()
    if not request:
        raise ValueError("Leave request not found.")

    if request.status != LeaveStatus.PENDING:
        raise ValueError(f"Cannot approve request with status {request.status.value}.")

    # Verify the approver is the line manager
    requester = db.query(User).filter(User.id == request.user_id).first()
    if requester and requester.line_manager_id != manager_user_id:
        # Allow admins to approve any request
        manager = db.query(User).filter(User.id == manager_user_id).first()
        if not manager or (
            hasattr(manager.role, "value")
            and manager.role.value not in ("admin", "SYSTEM_ADMIN")
        ):
            raise ValueError("Only the line manager can approve this request.")

    request.status = LeaveStatus.APPROVED
    request.approved_by_user_id = manager_user_id
    request.approved_at = datetime.now(timezone.utc)
    request.manager_comment = comment
    request.updated_at = datetime.now(timezone.utc)
    db.flush()
    return request


def reject_leave_request(
    db: Session,
    request_id: int,
    manager_user_id: int,
    comment: Optional[str] = None,
) -> LeaveRequest:
    """Reject a pending leave request.

    Parameters
    ----------
    db : Session
        Database session.
    request_id : int
        The leave request to reject.
    manager_user_id : int
        The manager rejecting the request.
    comment : str or None
        Reason for rejection (recommended).

    Returns
    -------
    LeaveRequest
        The updated leave request with REJECTED status.

    Raises
    ------
    ValueError
        If the request is not PENDING or the user is not the line manager.
    """
    request = db.query(LeaveRequest).filter(LeaveRequest.id == request_id).first()
    if not request:
        raise ValueError("Leave request not found.")

    if request.status != LeaveStatus.PENDING:
        raise ValueError(f"Cannot reject request with status {request.status.value}.")

    requester = db.query(User).filter(User.id == request.user_id).first()
    if requester and requester.line_manager_id != manager_user_id:
        manager = db.query(User).filter(User.id == manager_user_id).first()
        if not manager or (
            hasattr(manager.role, "value")
            and manager.role.value not in ("admin", "SYSTEM_ADMIN")
        ):
            raise ValueError("Only the line manager can reject this request.")

    request.status = LeaveStatus.REJECTED
    request.approved_by_user_id = manager_user_id
    request.approved_at = datetime.now(timezone.utc)
    request.manager_comment = comment
    request.updated_at = datetime.now(timezone.utc)
    db.flush()
    return request


def cancel_leave_request(db: Session, request_id: int, user_id: int) -> LeaveRequest:
    """Cancel a pending leave request by the requester.

    Parameters
    ----------
    db : Session
        Database session.
    request_id : int
        The leave request to cancel.
    user_id : int
        The user cancelling their own request.

    Returns
    -------
    LeaveRequest
        The updated leave request with CANCELLED status.

    Raises
    ------
    ValueError
        If the request is not PENDING or the user is not the requester.
    """
    request = db.query(LeaveRequest).filter(LeaveRequest.id == request_id).first()
    if not request:
        raise ValueError("Leave request not found.")

    if request.status != LeaveStatus.PENDING:
        raise ValueError(f"Cannot cancel request with status {request.status.value}.")

    if request.user_id != user_id:
        raise ValueError("Only the requester can cancel this request.")

    request.status = LeaveStatus.CANCELLED
    request.updated_at = datetime.now(timezone.utc)
    db.flush()
    return request


def get_pending_leave_for_manager(
    db: Session, manager_user_id: int
) -> List[LeaveRequest]:
    """Find all pending leave requests from a manager's direct reports.

    Parameters
    ----------
    db : Session
        Database session.
    manager_user_id : int
        The manager whose pending requests are being queried.

    Returns
    -------
    list of LeaveRequest
        All PENDING leave requests from users reporting to this manager.
    """
    direct_reports = get_direct_reports(db, manager_user_id)
    report_ids = [r.id for r in direct_reports]

    if not report_ids:
        return []

    return (
        db.query(LeaveRequest)
        .filter(
            LeaveRequest.user_id.in_(report_ids),
            LeaveRequest.status == LeaveStatus.PENDING,
        )
        .order_by(LeaveRequest.start_date)
        .all()
    )


def get_user_leave_requests(
    db: Session, user_id: int, status: Optional[str] = None
) -> List[LeaveRequest]:
    """Get all leave requests for a specific user.

    Parameters
    ----------
    db : Session
        Database session.
    user_id : int
        The user whose leave requests are being queried.
    status : str or None
        Optional filter by status (PENDING, APPROVED, REJECTED, CANCELLED).

    Returns
    -------
    list of LeaveRequest
        Leave requests matching the user and optional status filter.
    """
    query = db.query(LeaveRequest).filter(
        LeaveRequest.user_id == user_id
    ).order_by(LeaveRequest.start_date.desc())

    if status:
        query = query.filter(LeaveRequest.status == status)

    return query.all()


def get_team_leave_overlap(
    db: Session,
    manager_user_id: int,
    start_date: date,
    end_date: date,
) -> Dict[str, Any]:
    """Assess delivery risk by checking overlapping team leave.

    For a given date range, finds all team members (direct and indirect
    reports) who have approved leave overlapping that period.  Returns
    a risk assessment based on the percentage of the team that would
    be absent.

    Parameters
    ----------
    db : Session
        Database session.
    manager_user_id : int
        The manager whose team is being assessed.
    start_date : date
        Start of the assessment period.
    end_date : date
        End of the assessment period.

    Returns
    -------
    dict
        Dictionary containing:
        - total_team_size: int — Total number of team members.
        - absent_members: list — Users with overlapping approved leave.
        - absence_percentage: float — Percentage of team absent.
        - risk_level: str — "LOW", "MEDIUM", "HIGH", or "CRITICAL".
        - overlapping_requests: list — The leave requests causing overlap.
    """
    all_reports = get_all_reports(db, manager_user_id)
    total_size = len(all_reports)

    if total_size == 0:
        return {
            "total_team_size": 0,
            "absent_members": [],
            "absence_percentage": 0.0,
            "risk_level": "LOW",
            "overlapping_requests": [],
        }

    report_ids = [r.id for r in all_reports]
    report_map = {r.id: r for r in all_reports}

    # Find approved leave overlapping the date range
    overlapping = (
        db.query(LeaveRequest)
        .filter(
            LeaveRequest.user_id.in_(report_ids),
            LeaveRequest.status == LeaveStatus.APPROVED,
            LeaveRequest.start_date <= end_date,
            LeaveRequest.end_date >= start_date,
        )
        .all()
    )

    absent_user_ids = set()
    absent_members = []
    for req in overlapping:
        if req.user_id not in absent_user_ids:
            absent_user_ids.add(req.user_id)
            user = report_map.get(req.user_id)
            if user:
                absent_members.append(
                    {
                        "id": user.id,
                        "username": user.username,
                        "full_name": user.full_name,
                    }
                )

    absence_pct = (len(absent_user_ids) / total_size) * 100 if total_size > 0 else 0

    # Risk assessment thresholds
    if absence_pct >= 75:
        risk_level = "CRITICAL"
    elif absence_pct >= 50:
        risk_level = "HIGH"
    elif absence_pct >= 25:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    return {
        "total_team_size": total_size,
        "absent_members": absent_members,
        "absence_percentage": round(absence_pct, 1),
        "risk_level": risk_level,
        "overlapping_requests": [
            {
                "id": r.id,
                "user_id": r.user_id,
                "leave_type": r.leave_type.value if hasattr(r.leave_type, "value") else str(r.leave_type),
                "start_date": r.start_date.isoformat(),
                "end_date": r.end_date.isoformat(),
            }
            for r in overlapping
        ],
    }


# ============================================================================
# Resource Downtime Management
# ============================================================================


def create_resource_downtime(
    db: Session,
    resource_node_id: UUID,
    downtime_type: str,
    start_date: date,
    end_date: date,
    reason: Optional[str] = None,
    scheduled_by_user_id: Optional[int] = None,
) -> ResourceDowntime:
    """Schedule a period when a physical resource is offline.

    Parameters
    ----------
    db : Session
        Database session.
    resource_node_id : UUID
        The resource being taken offline.
    downtime_type : str
        Reason for downtime (MAINTENANCE, CALIBRATION, REPAIR, etc.).
    start_date : date
        Date the resource goes offline.
    end_date : date
        Expected date the resource returns to service.
    reason : str or None
        Detailed description of the downtime.
    scheduled_by_user_id : int or None
        The user who scheduled this downtime.

    Returns
    -------
    ResourceDowntime
        The newly created downtime record.

    Raises
    ------
    ValueError
        If end_date is before start_date or the resource doesn't exist.
    """
    if end_date < start_date:
        raise ValueError("End date must be on or after start date.")

    resource = db.query(ResourceNode).filter(ResourceNode.id == resource_node_id).first()
    if not resource:
        raise ValueError("Resource not found.")

    downtime = ResourceDowntime(
        resource_node_id=resource_node_id,
        downtime_type=downtime_type,
        start_date=start_date,
        end_date=end_date,
        reason=reason,
        scheduled_by_user_id=scheduled_by_user_id,
    )
    db.add(downtime)

    # Mark the resource as out of service if downtime starts now or in the past
    if start_date <= date.today():
        resource.is_out_of_service = True
        db.flush()

    db.flush()
    db.refresh(downtime)
    return downtime


def cancel_resource_downtime(db: Session, downtime_id: int) -> ResourceDowntime:
    """Cancel a scheduled downtime by removing the record.

    Parameters
    ----------
    db : Session
        Database session.
    downtime_id : int
        The downtime record to cancel.

    Returns
    -------
    ResourceDowntime
        The cancelled downtime record (before deletion).

    Raises
    ------
    ValueError
        If the downtime record doesn't exist.
    """
    downtime = db.query(ResourceDowntime).filter(ResourceDowntime.id == downtime_id).first()
    if not downtime:
        raise ValueError("Downtime record not found.")

    resource_id = downtime.resource_node_id
    db.delete(downtime)
    db.flush()

    # Check if there are other active downtimes for this resource
    active_downtimes = (
        db.query(ResourceDowntime)
        .filter(
            ResourceDowntime.resource_node_id == resource_id,
            ResourceDowntime.end_date >= date.today(),
        )
        .count()
    )

    if active_downtimes == 0:
        resource = db.query(ResourceNode).filter(ResourceNode.id == resource_id).first()
        if resource:
            resource.is_out_of_service = False
            db.flush()

    return downtime


def get_resource_downtime(
    db: Session, resource_node_id: UUID, future_only: bool = True
) -> List[ResourceDowntime]:
    """List downtime records for a specific resource.

    Parameters
    ----------
    db : Session
        Database session.
    resource_node_id : UUID
        The resource whose downtime records are being queried.
    future_only : bool
        If True, only return downtimes that start in the future.
        If False, return all downtimes including past ones.

    Returns
    -------
    list of ResourceDowntime
        Downtime records matching the resource and time filter.
    """
    query = (
        db.query(ResourceDowntime)
        .filter(ResourceDowntime.resource_node_id == resource_node_id)
        .order_by(ResourceDowntime.start_date.desc())
    )

    if future_only:
        query = query.filter(ResourceDowntime.start_date >= date.today())

    return query.all()


def get_all_upcoming_downtime(
    db: Session, days_ahead: int = 30
) -> List[ResourceDowntime]:
    """Get all resource downtimes starting within the next N days.

    Parameters
    ----------
    db : Session
        Database session.
    days_ahead : int
        Number of days to look ahead (default 30).

    Returns
    -------
    list of ResourceDowntime
        All downtime records starting within the look-ahead window.
    """
    from datetime import timedelta, timezone

    end_lookup = date.today() + timedelta(days=days_ahead)

    return (
        db.query(ResourceDowntime)
        .filter(
            ResourceDowntime.start_date >= date.today(),
            ResourceDowntime.start_date <= end_lookup,
        )
        .order_by(ResourceDowntime.start_date)
        .all()
    )


# ============================================================================
# Generic Resource Skills
# ============================================================================


def get_all_skills(db: Session) -> List[SkillDefinition]:
    """List all defined skills.

    Parameters
    ----------
    db : Session
        Database session.

    Returns
    -------
    list of SkillDefinition
        All skill definitions with their categories.
    """
    return (
        db.query(SkillDefinition)
        .join(SkillCategory)
        .order_by(SkillCategory.name, SkillDefinition.name)
        .all()
    )


def get_skills_by_category(
    db: Session, category_id: int
) -> List[SkillDefinition]:
    """List all skills within a specific category.

    Parameters
    ----------
    db : Session
        Database session.
    category_id : int
        The category to filter by.

    Returns
    -------
    list of SkillDefinition
        Skills belonging to the specified category.
    """
    return (
        db.query(SkillDefinition)
        .filter(SkillDefinition.category_id == category_id)
        .order_by(SkillDefinition.name)
        .all()
    )


def get_all_skill_categories(db: Session) -> List[SkillCategory]:
    """List all skill categories.

    Parameters
    ----------
    db : Session
        Database session.

    Returns
    -------
    list of SkillCategory
        All skill categories.
    """
    return db.query(SkillCategory).order_by(SkillCategory.name).all()


def get_user_skills(db: Session, user_id: int) -> List[UserSkillProfile]:
    """Get all skill profiles for a user.

    Parameters
    ----------
    db : Session
        Database session.
    user_id : int
        The user whose skills are being queried.

    Returns
    -------
    list of UserSkillProfile
        All skill profiles with proficiency levels and verification status.
    """
    return (
        db.query(UserSkillProfile)
        .filter(UserSkillProfile.user_id == user_id)
        .join(SkillDefinition)
        .join(SkillCategory)
        .order_by(SkillCategory.name, SkillDefinition.name)
        .all()
    )


def add_user_skill(
    db: Session,
    user_id: int,
    skill_id: int,
    proficiency_level: int = 1,
    verification_status: str = "SELF_ATTESTED",
) -> UserSkillProfile:
    """Add or update a skill for a user.

    Parameters
    ----------
    db : Session
        Database session.
    user_id : int
        The user gaining the skill.
    skill_id : int
        The skill being added.
    proficiency_level : int
        Proficiency level (1-5, mapped to ProficiencyLevel enum).
    verification_status : str
        Verification status (SELF_ATTESTED, ENDORSED, CERTIFIED).

    Returns
    -------
    UserSkillProfile
        The created or updated skill profile.
    """
    existing = (
        db.query(UserSkillProfile)
        .filter(
            UserSkillProfile.user_id == user_id,
            UserSkillProfile.skill_id == skill_id,
        )
        .first()
    )

    if existing:
        existing.proficiency_level = proficiency_level
        existing.verification_status = verification_status
        existing.updated_at = datetime.now(timezone.utc)
        profile = existing
    else:
        profile = UserSkillProfile(
            user_id=user_id,
            skill_id=skill_id,
            proficiency_level=proficiency_level,
            verification_status=verification_status,
        )
        db.add(profile)

    db.flush()
    db.refresh(profile)
    return profile


def remove_user_skill(db: Session, user_id: int, skill_id: int) -> bool:
    """Remove a skill from a user's profile.

    Parameters
    ----------
    db : Session
        Database session.
    user_id : int
        The user losing the skill.
    skill_id : int
        The skill being removed.

    Returns
    -------
    bool
        True if a skill was removed, False if no matching profile existed.
    """
    profile = (
        db.query(UserSkillProfile)
        .filter(
            UserSkillProfile.user_id == user_id,
            UserSkillProfile.skill_id == skill_id,
        )
        .first()
    )

    if profile:
        db.delete(profile)
        db.flush()
        return True

    return False
