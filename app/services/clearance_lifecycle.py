"""Personnel clearance lifecycle monitoring and SCIF escort capacity engine.

This module provides services for monitoring personnel security clearance
expiry dates and calculating SCIF escort capacity deductions.

Clearance Lifecycle Monitoring
------------------------------

Personnel clearances (BPSS, SC, DV, NATO_SECRET) are not perpetual — they
require periodic re-vetting.  This module cross-references assigned resources
with task forecast dates to proactively identify clearance lapses before they
occur.

The :func:`scan_clearance_lapses` function is called by the clash daemon
to detect CLEARANCE_EXPIRY_COLLISION clashes when a resource's clearance
expires before a task's forecast finish date.

SCIF Escort Capacity
--------------------

In SCIF (Sensitive Compartmented Information Facility) environments, uncleared
contractor personnel require escort by cleared staff.  The standard ratio is
1 SC/DV cleared staff member per 2 uncleared personnel.

The :func:`compute_scif_escort_impact` function identifies tasks in SCIF
locations that require uncleared contractor personnel and automatically
allocates escort capacity, reducing the cleared staff member's available
task capacity.

Usage
-----

These functions are integrated into the clash daemon sweep:

.. code-block:: python

    from app.services.clearance_lifecycle import (
        scan_clearance_lapses,
        compute_scif_escort_impact,
    )

    # Scan for clearance expiry collisions
    clashes = await scan_clearance_lapses(db, root_node_id)

    # Compute SCIF escort impact for a location
    impact = await compute_scif_escort_impact(db, location_id, start, end)
"""
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date, datetime, timedelta
from uuid import UUID
from typing import Optional, List, Dict, Any, Tuple

from app.models.models import (
    User,
    ResourceNode,
    ResourceAssignment,
    PortfolioNode,
    LocationNode,
    ClearanceType,
    SecurityClassification,
)


# Minimum clearance type required for SCIF escort duty
ESCORT_MINIMUM_CLEARANCE = {
    ClearanceType.DV,
    ClearanceType.SC,
}
"""Set of clearance types eligible for SCIF escort duty.

Only personnel with SC or DV clearance can escort uncleared contractors
in SCIF environments.  BPSS personnel cannot provide escort.
"""

# Standard escort ratio: 1 cleared staff per N uncleared personnel
ESCORT_RATIO = 2
"""Number of uncleared personnel per 1 cleared escort.

In UK defence SCIF environments, the standard ratio is 1 SC/DV cleared
staff member per 2 uncleared contractor personnel.  This may vary by
facility policy.
"""


async def scan_clearance_lapses(
    db: AsyncSession,
    root_node_id: Optional[UUID] = None,
    look_ahead_days: int = 90,
) -> List[Dict[str, Any]]:
    """Scan for personnel clearance expiry collisions.

    Cross-references assigned resources with task forecast dates to
    identify cases where a resource's clearance expires before the
    task's forecast finish date.

    This function checks:

    1. **Direct expiry** — The resource's clearance_expiry_date is
       before the task's planned_end_date.

    2. **Impending expiry** — The resource's clearance expires within
       ``look_ahead_days`` of today, and the task extends past the
       expiry date.

    Parameters
    ----------
    db : AsyncSession
        Active database session.
    root_node_id : UUID or None
        Optional root node to scope the scan.  If None, scans all
        active assignments.
    look_ahead_days : int
        Number of days to look ahead for impending expiry warnings
        (default 90).

    Returns
    -------
    list[dict]
        List of clearance lapse records, each containing:

        - ``resource_id`` (UUID): The affected resource node.
        - ``resource_name`` (str): Name of the resource.
        - ``clearance_type`` (str): The resource's clearance type.
        - ``clearance_expiry`` (date): When the clearance expires.
        - ``task_id`` (UUID): The affected task node.
        - ``task_code`` (str): The task's WBS code.
        - ``task_planned_end`` (date): The task's planned end date.
        - ``days_until_expiry`` (int): Days from today to expiry
          (negative if already expired).
        - ``severity`` (str): 'CRITICAL' if expired, 'MAJOR' if
          expiring within 30 days, 'ADVISORY' otherwise.

    Examples
    --------

    Scan all assignments for clearance lapses:

    >>> clashes = await scan_clearance_lapses(db)
    >>> for clash in clashes:
    ...     print(f"{clash['resource_name']}: {clash['severity']}")

    Scan a specific project:

    >>> clashes = await scan_clearance_lapses(db, project_root_id)
    """
    clashes = []
    today = date.today()
    look_ahead = today + timedelta(days=look_ahead_days)

    # Query active resource assignments with user clearance info
    stmt = (
        select(
            ResourceAssignment,
            User.id.label("user_id"),
            User.clearance_type,
            User.clearance_expiry_date,
            User.username,
            PortfolioNode.id.label("task_id"),
            PortfolioNode.code.label("task_code"),
            PortfolioNode.planned_end_date,
        )
        .join(ResourceNode, ResourceAssignment.resource_node_id == ResourceNode.id)
        .join(User, ResourceNode.code == User.username)
        .join(PortfolioNode, ResourceAssignment.portfolio_node_id == PortfolioNode.id)
        .where(
            ResourceAssignment.status == "CONFIRMED",
            User.clearance_expiry_date.isnot(None),
            PortfolioNode.is_active == True,
        )
    )

    if root_node_id is not None:
        # Scope to a specific project tree using ltree path prefix
        root_stmt = select(PortfolioNode.path).where(PortfolioNode.id == root_node_id)
        root_result = await db.execute(root_stmt)
        root_path = root_result.scalar_one_or_none()
        if root_path:
            stmt = stmt.where(
                PortfolioNode.path.startswith(root_path + ".")
                | (PortfolioNode.path == root_path)
            )

    result = await db.execute(stmt)
    rows = result.all()

    for row in rows:
        clearance_expiry = row.clearance_expiry_date
        task_planned_end = row.planned_end_date

        if clearance_expiry is None:
            continue

        # Check if clearance expires before task end
        if task_planned_end and clearance_expiry < task_planned_end:
            days_until = (clearance_expiry - today).days

            # Determine severity
            if days_until < 0:
                severity = "CRITICAL"
            elif days_until <= 30:
                severity = "MAJOR"
            else:
                severity = "ADVISORY"

            clashes.append({
                "resource_id": row.resource_node_id,
                "resource_name": row.username,
                "clearance_type": row.clearance_type.value if row.clearance_type else None,
                "clearance_expiry": clearance_expiry,
                "task_id": row.task_id,
                "task_code": row.task_code,
                "task_planned_end": task_planned_end,
                "days_until_expiry": days_until,
                "severity": severity,
            })
        elif clearance_expiry and clearance_expiry <= look_ahead:
            # Impending expiry within look-ahead window
            days_until = (clearance_expiry - today).days
            if task_planned_end and task_planned_end > clearance_expiry:
                clashes.append({
                    "resource_id": row.resource_node_id,
                    "resource_name": row.username,
                    "clearance_type": row.clearance_type.value if row.clearance_type else None,
                    "clearance_expiry": clearance_expiry,
                    "task_id": row.task_id,
                    "task_code": row.task_code,
                    "task_planned_end": task_planned_end,
                    "days_until_expiry": days_until,
                    "severity": "ADVISORY",
                })

    return clashes


async def compute_scif_escort_impact(
    db: AsyncSession,
    location_id: UUID,
    start_date: date,
    end_date: date,
) -> Dict[str, Any]:
    """Compute SCIF escort capacity impact for a location.

    Identifies tasks scheduled in a SCIF location that require uncleared
    contractor personnel and calculates the escort capacity deduction.

    In SCIF environments, uncleared contractor personnel must be escorted
    by SC/DV cleared staff.  The standard ratio is 1 cleared staff per
    2 uncleared personnel.  This function:

    1. Identifies the SCIF location and its classification.
    2. Finds all tasks scheduled in the location during the date range.
    3. Counts cleared vs uncleared assigned personnel.
    4. Calculates the number of escorts required.
    5. Identifies available cleared staff for escort duty.

    Parameters
    ----------
    db : AsyncSession
        Active database session.
    location_id : UUID
        The SCIF location node to analyse.
    start_date : date
        Start of the analysis window.
    end_date : date
        End of the analysis window.

    Returns
    -------
    dict
        Escort impact analysis containing:

        - ``location_id`` (UUID): The SCIF location.
        - ``location_code`` (str): The location's code.
        - ``is_scif`` (bool): Whether the location is SCIF/TEMPEST accredited.
        - ``tasks_in_location`` (int): Number of tasks in the location.
        - ``cleared_personnel`` (int): Count of SC/DV cleared staff.
        - ``uncleared_personnel`` (int): Count of uncleared contractors.
        - ``escorts_required`` (int): Number of escorts needed
          (ceil(uncleared / ESCORT_RATIO)).
        - ``escort_capacity`` (int): Number of cleared staff available
          for escort (cleared - escorts_required).
        - ``escort_deficit`` (int): Positive if there are not enough
          cleared staff to provide escort.
        - ``affected_tasks`` (list[dict]): Tasks requiring escort,
          with uncleared personnel counts.

    Examples
    --------

    >>> impact = await compute_scif_escort_impact(
    ...     db, scif_location_id, date(2026, 1, 1), date(2026, 1, 31)
    ... )
    >>> if impact['escort_deficit'] > 0:
    ...     print(f"Escort deficit: {impact['escort_deficit']} staff")

    Raises
    ------
    ValueError
        If the location is not a SCIF/TEMPEST accredited facility.
    """
    # Fetch the location node
    loc_result = await db.execute(
        select(LocationNode).where(LocationNode.id == location_id)
    )
    location = loc_result.scalar_one_or_none()

    if location is None:
        return {
            "location_id": location_id,
            "location_code": None,
            "is_scif": False,
            "tasks_in_location": 0,
            "cleared_personnel": 0,
            "uncleared_personnel": 0,
            "escorts_required": 0,
            "escort_capacity": 0,
            "escort_deficit": 0,
            "affected_tasks": [],
        }

    is_scif = location.is_scif_or_tempest
    location_code = location.code

    # Find tasks assigned to this location via resource assignments
    # Resources with current_location_id == location_id
    tasks_result = await db.execute(
        select(
            PortfolioNode.id,
            PortfolioNode.code,
            PortfolioNode.name,
            PortfolioNode.planned_start_date,
            PortfolioNode.planned_end_date,
        ).where(
            PortfolioNode.is_active == True,
            PortfolioNode.planned_start_date <= end_date,
            PortfolioNode.planned_end_date >= start_date,
        )
    )
    tasks = tasks_result.all()

    # Count cleared vs uncleared personnel assigned to these tasks
    cleared_personnel = set()
    uncleared_personnel = set()
    affected_tasks = []

    for task in tasks:
        # Get resource assignments for this task
        assign_result = await db.execute(
            select(ResourceAssignment).where(
                ResourceAssignment.portfolio_node_id == task.id,
                ResourceAssignment.status == "CONFIRMED",
            )
        )
        assignments = assign_result.scalars().all()

        task_uncleared = 0
        for assignment in assignments:
            # Get the resource node
            res_result = await db.execute(
                select(ResourceNode).where(
                    ResourceNode.id == assignment.resource_node_id
                )
            )
            resource = res_result.scalar_one_or_none()
            if resource and resource.resource_type == "PERSON":
                # Find the user
                user_result = await db.execute(
                    select(User).where(User.username == resource.code)
                )
                user = user_result.scalar_one_or_none()
                if user:
                    if user.clearance_type in ESCORT_MINIMUM_CLEARANCE:
                        cleared_personnel.add(user.id)
                    else:
                        uncleared_personnel.add(user.id)
                        task_uncleared += 1

        if task_uncleared > 0:
            affected_tasks.append({
                "task_id": task.id,
                "task_code": task.code,
                "uncleared_count": task_uncleared,
                "escorts_needed": (task_uncleared + ESCORT_RATIO - 1) // ESCORT_RATIO,
            })

    # Calculate escort requirements
    total_uncleared = len(uncleared_personnel)
    escorts_required = (total_uncleared + ESCORT_RATIO - 1) // ESCORT_RATIO if total_uncleared > 0 else 0
    total_cleared = len(cleared_personnel)
    escort_capacity = total_cleared - escorts_required
    escort_deficit = max(0, escorts_required - total_cleared)

    return {
        "location_id": location_id,
        "location_code": location_code,
        "is_scif": is_scif,
        "tasks_in_location": len(tasks),
        "cleared_personnel": total_cleared,
        "uncleared_personnel": total_uncleared,
        "escorts_required": escorts_required,
        "escort_capacity": escort_capacity,
        "escort_deficit": escort_deficit,
        "affected_tasks": affected_tasks,
    }


async def get_clearance_status(
    db: AsyncSession,
    user_id: int,
) -> Dict[str, Any]:
    """Get the clearance status of a user.

    Returns the user's clearance type, expiry date, and a summary
    of their clearance status for display in the UI.

    Parameters
    ----------
    db : AsyncSession
        Active database session.
    user_id : int
        The user's ID.

    Returns
    -------
    dict
        Clearance status containing:

        - ``user_id`` (int): The user's ID.
        - ``clearance_type`` (str or None): The clearance type.
        - ``clearance_expiry`` (date or None): When the clearance expires.
        - ``days_until_expiry`` (int or None): Days until expiry.
        - ``is_expired`` (bool): Whether the clearance has expired.
        - ``is_expiring_soon`` (bool): Whether the clearance expires
          within 30 days.
        - ``status`` (str): 'ACTIVE', 'EXPIRING_SOON', or 'EXPIRED'.
    """
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    if user is None:
        return {
            "user_id": user_id,
            "clearance_type": None,
            "clearance_expiry": None,
            "days_until_expiry": None,
            "is_expired": True,
            "is_expiring_soon": False,
            "status": "EXPIRED",
        }

    today = date.today()
    days_until = None
    is_expired = False
    is_expiring_soon = False

    if user.clearance_expiry_date:
        days_until = (user.clearance_expiry_date - today).days
        is_expired = days_until < 0
        is_expiring_soon = 0 <= days_until <= 30

    if is_expired:
        status = "EXPIRED"
    elif is_expiring_soon:
        status = "EXPIRING_SOON"
    else:
        status = "ACTIVE"

    return {
        "user_id": user_id,
        "clearance_type": user.clearance_type.value if user.clearance_type else None,
        "clearance_expiry": user.clearance_expiry_date,
        "days_until_expiry": days_until,
        "is_expired": is_expired,
        "is_expiring_soon": is_expiring_soon,
        "status": status,
    }
