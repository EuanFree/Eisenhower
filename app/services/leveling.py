"""Constrained heuristic resource leveling engine.

Implements the Burgess-Killebrew heuristic for resolving resource
overallocations on top of the CPM DAG produced by :mod:`app.services.cpm_engine`.

Algorithm Overview
------------------

The Burgess-Killebrew method is a greedy, float-based leveling algorithm
that delays non-critical tasks within their available float window to
eliminate resource overallocations.  The key principles are:

1. **Critical tasks are fixed** — Tasks with zero or negative Total Float
   cannot be delayed without extending the project finish date.  They
   remain at their Early Start positions.

2. **Float tasks are delayed** — Tasks with positive Free Float or Total
   Float are candidates for delay.  The algorithm pushes them forward
   within their float window until the resource conflict is resolved.

3. **Proposal Mode** — The algorithm returns *proposed* date shifts without
   committing them to the database.  The programme manager reviews the
   proposal and signs off before dates are applied.

Usage
~~~~~

    from app.services.leveling import compute_leveling_proposal

    proposal = compute_leveling_proposal(db, project_id)
    # proposal contains a list of LevelingShift with original and proposed dates

References
~~~~~~~~~~

- Burgess, R. E. and Killebrew, J. C. (1977). "Project Network
  Grading with Resource Limitations."  AIIE Transactions, 9(2), 69-81.
"""
from datetime import datetime, timezone, timedelta, date
from typing import Dict, List, Optional, Tuple
from uuid import UUID, uuid4

from sqlalchemy.orm import Session
from sqlalchemy import text as sa_text

from app.models.models import (
    PortfolioNode, ResourceAssignment, ResourceNode, DependencyLink, DependencyType,
)


# ============================================================================
# Data structures for leveling results
# ============================================================================

class LevelingShift:
    """A proposed date shift for a single portfolio node.

    Attributes
    ----------
    node_id : UUID
        The portfolio node being shifted.
    code : str
        Human-readable code of the node.
    name : str
        Human-readable name of the node.
    original_start : datetime
        The node's current planned start date.
    original_finish : datetime
        The node's current planned finish date.
    proposed_start : datetime
        The proposed new start date after leveling.
    proposed_finish : datetime
        The proposed new finish date after leveling.
    consumed_float_days : int
        How many days of the node's Total Float are consumed by this shift.
    milestone_breach : bool
        True if the shift would cause a milestone (zero-duration successor)
        to be missed.
    reason : str
        Explanation of why this shift is proposed.
    """

    def __init__(
        self,
        node_id: UUID,
        code: str,
        name: str,
        original_start: datetime,
        original_finish: datetime,
        proposed_start: datetime,
        proposed_finish: datetime,
        consumed_float_days: int,
        milestone_breach: bool,
        reason: str,
    ):
        """Initialize a proposed schedule shift for a WBS node.

        Records the original and proposed dates for a node that the heuristic
        leveling algorithm wants to move to resolve resource overallocation.
        The shift includes metadata about float consumption and milestone
        impact so the user can assess whether to accept it.

        Args
        ----\n        node_id : UUID
            The unique identifier of the WBS node being shifted.
        code : str
            The WBS code of the node (e.g., ``"1.2.3"``).
        name : str
            Human-readable name of the node.
        original_start : datetime
            The node's current planned start date before leveling.
        original_finish : datetime
            The node's current planned finish date before leveling.
        proposed_start : datetime
            The proposed new start date after leveling.
        proposed_finish : datetime
            The proposed new finish date after leveling.
        consumed_float_days : int
            How many days of the node's Total Float are consumed by this shift.
        milestone_breach : bool
            Whether the shift would cause a downstream milestone to be missed.
        reason : str
            Human-readable explanation of why this shift is proposed.
        """
        self.node_id = node_id
        self.code = code
        self.name = name
        self.original_start = original_start
        self.original_finish = original_finish
        self.proposed_start = proposed_start
        self.proposed_finish = proposed_finish
        self.consumed_float_days = consumed_float_days
        self.milestone_breach = milestone_breach
        self.reason = reason

    def to_dict(self) -> dict:
        """Serialize to a dictionary for API responses."""
        return {
            "node_id": str(self.node_id),
            "code": self.code,
            "name": self.name,
            "original_start": self.original_start.isoformat(),
            "original_finish": self.original_finish.isoformat(),
            "proposed_start": self.proposed_start.isoformat(),
            "proposed_finish": self.proposed_finish.isoformat(),
            "consumed_float_days": self.consumed_float_days,
            "milestone_breach": self.milestone_breach,
            "reason": self.reason,
        }


# ============================================================================
# Working calendar helpers (mirrored from cpm_engine for independence)
# ============================================================================

def _is_workday(dt: datetime) -> bool:
    """Return True if *dt* falls on a weekday (Mon–Fri)."""
    return dt.weekday() < 5


def _add_workdays(start: datetime, days: int) -> datetime:
    """Add *days* working days to *start*, skipping weekends."""
    if days == 0:
        return start
    if days < 0:
        return _subtract_workdays(start, abs(days))
    current = start
    remaining = days
    while remaining > 0:
        current += timedelta(days=1)
        if _is_workday(current):
            remaining -= 1
    return current


def _subtract_workdays(start: datetime, days: int) -> datetime:
    """Subtract *days* working days from *start*, skipping weekends."""
    current = start
    remaining = days
    while remaining > 0:
        current -= timedelta(days=1)
        if _is_workday(current):
            remaining -= 1
    return current


def _workday_diff(start: datetime, end: datetime) -> int:
    """Count working days between *start* and *end*."""
    if end < start:
        return -_workday_diff(end, start)
    count = 0
    current = start
    while current < end:
        current += timedelta(days=1)
        if _is_workday(current):
            count += 1
    return count


# ============================================================================
# Resource capacity analysis
# ============================================================================

def _get_resource_daily_load(
    db: Session,
    resource_id: UUID,
    start: date,
    end: date,
) -> Dict[date, float]:
    """Calculate daily allocated units for a resource over a date range.

    Returns a dict mapping each date to the total allocated units.
    Values > 1.0 indicate overallocation.
    """
    # Fetch all active assignments for this resource overlapping the window
    assignments = (
        db.query(ResourceAssignment)
        .join(PortfolioNode, ResourceAssignment.portfolio_node_id == PortfolioNode.id)
        .filter(
            ResourceAssignment.resource_node_id == resource_id,
            PortfolioNode.planned_start_date <= end,
            PortfolioNode.planned_end_date >= start,
            PortfolioNode.is_active == True,
        )
        .all()
    )

    daily_load: Dict[date, float] = {}
    current = start
    while current <= end:
        daily_load[current] = 0.0
        current += timedelta(days=1)

    for assignment in assignments:
        pn = assignment.portfolio_node
        if pn.planned_start_date is None or pn.planned_end_date is None:
            continue

        # Overlap window
        overlap_start = max(pn.planned_start_date, start)
        overlap_end = min(pn.planned_end_date, end)

        d = overlap_start
        while d <= overlap_end:
            if d.weekday() < 5:  # Only count workdays
                daily_load[d] = daily_load.get(d, 0.0) + assignment.allocated_units
            d += timedelta(days=1)

    return daily_load


def _find_overallocation_windows(
    db: Session,
    start: date,
    end: date,
) -> List[Tuple[UUID, date, date, float]]:
    """Find all (resource, window_start, window_end, peak_load) overallocation windows.

    Returns a list of tuples where peak_load > 1.0 indicates the resource
    is overallocated during that window.
    """
    # Get all resources with active assignments in the window
    resources = (
        db.query(ResourceNode.id)
        .join(ResourceAssignment, ResourceAssignment.resource_node_id == ResourceNode.id)
        .join(PortfolioNode, ResourceAssignment.portfolio_node_id == PortfolioNode.id)
        .filter(
            PortfolioNode.planned_start_date <= end,
            PortfolioNode.planned_end_date >= start,
            PortfolioNode.is_active == True,
        )
        .distinct()
        .all()
    )

    windows: List[Tuple[UUID, date, date, float]] = []
    for (resource_id,) in resources:
        daily_load = _get_resource_daily_load(db, resource_id, start, end)

        # Find contiguous overallocation windows
        in_window = False
        window_start = None
        peak_load = 0.0

        d = start
        while d <= end:
            load = daily_load.get(d, 0.0)
            if load > 1.0:
                if not in_window:
                    window_start = d
                    in_window = True
                    peak_load = load
                else:
                    peak_load = max(peak_load, load)
            else:
                if in_window:
                    windows.append((resource_id, window_start, d - timedelta(days=1), peak_load))
                    in_window = False
            d += timedelta(days=1)

        # Close any open window at the end
        if in_window and window_start is not None:
            windows.append((resource_id, window_start, end, peak_load))

    return windows


# ============================================================================
# Node schedule data extraction
# ============================================================================

def _get_node_schedule_data(
    db: Session,
    node_id: UUID,
) -> Optional[dict]:
    """Extract schedule metrics from a node's custom_attributes.

    Returns a dict with early_start, early_finish, late_start, late_finish,
    total_float, free_float, is_critical, or None if no schedule data.
    """
    node = db.query(PortfolioNode).filter(PortfolioNode.id == node_id).first()
    if node is None or not node.custom_attributes:
        return None

    schedule = node.custom_attributes.get("schedule", {})
    if not schedule:
        return None

    return {
        "node": node,
        "early_start": datetime.fromisoformat(schedule["early_start"]),
        "early_finish": datetime.fromisoformat(schedule["early_finish"]),
        "late_start": datetime.fromisoformat(schedule["late_start"]),
        "late_finish": datetime.fromisoformat(schedule["late_finish"]),
        "total_float": schedule.get("total_float", 0),
        "free_float": schedule.get("free_float", 0),
        "is_critical": schedule.get("is_critical", False),
    }


def _get_all_node_schedule_data(
    db: Session,
    root_id: UUID,
) -> Dict[UUID, dict]:
    """Get schedule data for all active PortfolioNodes under a root.

    Uses ltree path containment to find all descendants.
    """
    root = db.query(PortfolioNode).filter(PortfolioNode.id == root_id).first()
    if root is None:
        return {}

    result = db.execute(
        sa_text(
            "SELECT * FROM portfolio_nodes pn "
            "JOIN universal_breakdown_nodes ubn ON pn.id = ubn.id "
            "WHERE ubn.path <@ :root_path AND ubn.is_active = true"
        ),
        {"root_path": root.path},
    )

    columns = list(result.keys())
    rows = result.fetchall()

    data: Dict[UUID, dict] = {}
    for row in rows:
        row_dict = dict(zip(columns, row))
        node = PortfolioNode()
        for key, value in row_dict.items():
            setattr(node, key, value)

        schedule = None
        if node.custom_attributes and "schedule" in node.custom_attributes:
            sched = node.custom_attributes["schedule"]
            schedule = {
                "early_start": datetime.fromisoformat(sched["early_start"]),
                "early_finish": datetime.fromisoformat(sched["early_finish"]),
                "late_start": datetime.fromisoformat(sched["late_start"]),
                "late_finish": datetime.fromisoformat(sched["late_finish"]),
                "total_float": sched.get("total_float", 0),
                "free_float": sched.get("free_float", 0),
                "is_critical": sched.get("is_critical", False),
            }

        data[node.id] = {
            "node": node,
            "schedule": schedule,
        }

    return data


# ============================================================================
# Burgess-Killebrew Leveling Algorithm
# ============================================================================

def compute_leveling_proposal(
    db: Session,
    project_id: UUID,
) -> dict:
    """Compute a resource leveling proposal using the Burgess-Killebrew heuristic.

    This operates in **Proposal Mode**: it returns proposed date shifts
    without committing them to the database.  The programme manager
    reviews the proposal and calls ``POST /apply-leveling`` to commit.

    Algorithm Steps
    ~~~~~~~~~~~~~~~

    1. Gather all PortfolioNodes and their CPM schedule data under the
       project root.
    2. Determine the project date range from planned dates.
    3. Find all resource overallocation windows (> 100% capacity).
    4. For each overallocation window, identify the competing tasks.
    5. Sort competing tasks by priority:
       - Critical path tasks (TF <= 0) are **fixed** — they cannot move.
       - Non-critical tasks are sorted by Total Float ascending (least
         float moved first to minimise schedule impact).
    6. Delay non-critical tasks within their float window until the
       overallocation is resolved.
    7. Check for milestone breaches (delayed task pushes a milestone).
    8. Return the list of proposed shifts.

    Parameters
    ----------
    db : Session
        Active database session.
    project_id : UUID
        The root PortfolioNode of the project to level.

    Returns
    -------
    dict
        {
            "project_id": str,
            "total_shifts": int,
            "shifts": [LevelingShift.to_dict(), ...],
            "overallocation_windows": int,
            "milestone_breaches": int,
            "computed_at": str,
        }

    Raises
    ------
    ValueError
        If the project root is not found or has no schedule data.
    """
    # Step 1: Gather all nodes with schedule data
    all_data = _get_all_node_schedule_data(db, project_id)

    if not all_data:
        raise ValueError(f"No active PortfolioNodes found under project {project_id}")

    # Check that CPM has been calculated
    nodes_without_schedule = [
        v["node"].code for v in all_data.values() if v["schedule"] is None
    ]
    if nodes_without_schedule:
        raise ValueError(
            f"CPM schedule not calculated for nodes: {', '.join(nodes_without_schedule[:5])}. "
            f"Run POST /schedule/{{project_id}}/recalculate-cpm first."
        )

    # Step 2: Determine project date range
    all_starts = []
    all_ends = []
    for v in all_data.values():
        node = v["node"]
        if node.planned_start_date:
            all_starts.append(node.planned_start_date)
        if node.planned_end_date:
            all_ends.append(node.planned_end_date)

    if not all_starts or not all_ends:
        raise ValueError("Project nodes have no planned dates set.")

    project_start = min(all_starts)
    project_end = max(all_ends)

    # Step 3: Find overallocation windows
    overallocation_windows = _find_overallocation_windows(db, project_start, project_end)

    if not overallocation_windows:
        return {
            "project_id": str(project_id),
            "total_shifts": 0,
            "shifts": [],
            "overallocation_windows": 0,
            "milestone_breaches": 0,
            "computed_at": datetime.now(timezone.utc).isoformat(),
            "message": "No resource overallocations detected — schedule is level.",
        }

    # Step 4-6: For each overallocation window, propose delays
    shifts: List[LevelingShift] = []
    shift_map: Dict[UUID, datetime] = {}  # node_id -> proposed new start

    for resource_id, win_start, win_end, peak_load in overallocation_windows:
        # Find tasks assigned to this resource overlapping the window
        competing_assignments = (
            db.query(ResourceAssignment)
            .join(PortfolioNode, ResourceAssignment.portfolio_node_id == PortfolioNode.id)
            .filter(
                ResourceAssignment.resource_node_id == resource_id,
                PortfolioNode.planned_start_date <= win_end,
                PortfolioNode.planned_end_date >= win_start,
                PortfolioNode.is_active == True,
            )
            .all()
        )

        # Build competing task list with schedule data
        competing_tasks = []
        for assignment in competing_assignments:
            node_id = assignment.portfolio_node_id
            if node_id in all_data:
                sched = all_data[node_id]["schedule"]
                if sched:
                    competing_tasks.append({
                        "assignment": assignment,
                        "node": all_data[node_id]["node"],
                        "schedule": sched,
                    })

        # Sort by priority: critical tasks first (fixed), then by total_float ascending
        competing_tasks.sort(key=lambda t: (
            t["schedule"]["is_critical"],  # False (non-critical) first — they can move
            t["schedule"]["total_float"],  # Least float first
        ))

        # Separate fixed (critical) from movable (non-critical)
        fixed_tasks = [t for t in competing_tasks if t["schedule"]["is_critical"]]
        movable_tasks = [t for t in competing_tasks if not t["schedule"]["is_critical"]]

        # Calculate how much capacity the fixed tasks consume
        fixed_capacity = sum(t["assignment"].allocated_units for t in fixed_tasks)
        remaining_capacity = 1.0 - fixed_capacity

        if remaining_capacity <= 0:
            # All capacity consumed by critical tasks — cannot level without
            # extending the project.  Flag as milestone breach.
            for task_info in movable_tasks:
                node = task_info["node"]
                sched = task_info["schedule"]
                shifts.append(LevelingShift(
                    node_id=node.id,
                    code=node.code,
                    name=node.name,
                    original_start=datetime.combine(node.planned_start_date or project_start, datetime.min.time()),
                    original_finish=datetime.combine(node.planned_end_date or project_end, datetime.min.time()),
                    proposed_start=sched["early_start"],  # Cannot shift — already at ES
                    proposed_finish=sched["early_finish"],
                    consumed_float_days=0,
                    milestone_breach=True,
                    reason=(
                        f"Critical tasks consume {fixed_capacity:.0%} of resource capacity. "
                        f"Cannot level without extending project finish. "
                        f"Resource: {resource_id}"
                    ),
                ))
            continue

        # Delay movable tasks one by one until overallocation is resolved
        current_movable_capacity = sum(
            t["assignment"].allocated_units for t in movable_tasks
        )

        for task_info in movable_tasks:
            if current_movable_capacity <= remaining_capacity:
                # No more overallocation — remaining tasks can stay
                break

            node = task_info["node"]
            sched = task_info["schedule"]
            assignment = task_info["assignment"]

            # Calculate how many days to delay
            # Push to the end of the float window
            float_days = sched["total_float"]
            if float_days <= 0:
                # No float available — milestone breach
                orig_start = datetime.combine(
                    node.planned_start_date or project_start,
                    datetime.min.time()
                )
                orig_finish = datetime.combine(
                    node.planned_end_date or project_end,
                    datetime.min.time()
                )
                shifts.append(LevelingShift(
                    node_id=node.id,
                    code=node.code,
                    name=node.name,
                    original_start=orig_start,
                    original_finish=orig_finish,
                    proposed_start=orig_start,
                    proposed_finish=orig_finish,
                    consumed_float_days=0,
                    milestone_breach=True,
                    reason=(
                        f"No float available for '{node.code}'. "
                        f"Delaying would extend project finish. "
                        f"Resource: {resource_id}"
                    ),
                ))
                continue

            # Propose delay by consumed float
            original_start = datetime.combine(
                node.planned_start_date or project_start,
                datetime.min.time()
            )
            original_finish = datetime.combine(
                node.planned_end_date or project_end,
                datetime.min.time()
            )

            # Delay to after the overallocation window
            delay_until = win_end + timedelta(days=1)
            # Ensure it's a workday
            dt_delay = datetime.combine(delay_until, datetime.min.time())
            while not _is_workday(dt_delay):
                dt_delay += timedelta(days=1)

            proposed_start = dt_delay
            duration = _workday_diff(original_start, original_finish)
            proposed_finish = _add_workdays(proposed_start, duration)

            consumed = _workday_diff(original_start, proposed_start)
            consumed = min(consumed, float_days)  # Don't exceed float

            # Check if this delay breaches a milestone
            milestone_breach = consumed >= float_days

            shifts.append(LevelingShift(
                node_id=node.id,
                code=node.code,
                name=node.name,
                original_start=original_start,
                original_finish=original_finish,
                proposed_start=proposed_start,
                proposed_finish=proposed_finish,
                consumed_float_days=consumed,
                milestone_breach=milestone_breach,
                reason=(
                    f"Delayed to resolve overallocation on resource {resource_id} "
                    f"(peak load {peak_load:.0%}). Consumed {consumed} of "
                    f"{float_days} available float days."
                ),
            ))

            current_movable_capacity -= assignment.allocated_units
            shift_map[node.id] = proposed_start

    # Deduplicate shifts (keep the one with the latest proposed_start)
    shift_dict: Dict[UUID, LevelingShift] = {}
    for shift in shifts:
        if shift.node_id not in shift_dict or shift.proposed_start > shift_dict[shift.node_id].proposed_start:
            shift_dict[shift.node_id] = shift

    unique_shifts = list(shift_dict.values())
    milestone_breaches = sum(1 for s in unique_shifts if s.milestone_breach)

    return {
        "project_id": str(project_id),
        "total_shifts": len(unique_shifts),
        "shifts": [s.to_dict() for s in unique_shifts],
        "overallocation_windows": len(overallocation_windows),
        "milestone_breaches": milestone_breaches,
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }


# ============================================================================
# Apply leveling to the database
# ============================================================================

def apply_leveling(
    db: Session,
    project_id: UUID,
    shifts: List[dict],
) -> dict:
    """Commit signed-off leveling shifts to the database.

    This updates the ``planned_start_date`` and ``planned_end_date``
    for each node in the shifts list within a single atomic transaction.

    Parameters
    ----------
    db : Session
        Active database session.
    project_id : UUID
        The root project node (for validation).
    shifts : list of dict
        The shifts returned by ``compute_leveling_proposal``, where each
        dict has ``node_id``, ``proposed_start``, and ``proposed_finish``.

    Returns
    -------
    dict
        {
            "applied": int,
            "failed": int,
            "details": [...],
        }

    Raises
    ------
    ValueError
        If a node in the shifts list is not under the project root.
    """
    # Validate project root exists
    root = db.query(PortfolioNode).filter(PortfolioNode.id == project_id).first()
    if root is None:
        raise ValueError(f"Project {project_id} not found")

    applied = 0
    failed = 0
    details = []

    for shift in shifts:
        node_id = UUID(shift["node_id"])
        proposed_start_str = shift["proposed_start"]
        proposed_finish_str = shift["proposed_finish"]

        proposed_start = datetime.fromisoformat(proposed_start_str).date()
        proposed_finish = datetime.fromisoformat(proposed_finish_str).date()

        node = db.query(PortfolioNode).filter(PortfolioNode.id == node_id).first()
        if node is None:
            failed += 1
            details.append({
                "node_id": str(node_id),
                "status": "failed",
                "reason": "Node not found",
            })
            continue

        # Verify node is under project root via ltree
        if not node.path.startswith(root.path):
            failed += 1
            details.append({
                "node_id": str(node_id),
                "status": "failed",
                "reason": f"Node {node.code} is not under project {root.code}",
            })
            continue

        old_start = node.planned_start_date
        old_finish = node.planned_end_date

        node.planned_start_date = proposed_start
        node.planned_end_date = proposed_finish

        applied += 1
        details.append({
            "node_id": str(node_id),
            "code": node.code,
            "status": "applied",
            "old_start": old_start.isoformat() if old_start else None,
            "old_finish": old_finish.isoformat() if old_finish else None,
            "new_start": proposed_start.isoformat(),
            "new_finish": proposed_finish.isoformat(),
        })

    db.commit()

    return {
        "project_id": str(project_id),
        "applied": applied,
        "failed": failed,
        "details": details,
        "applied_at": datetime.now(timezone.utc).isoformat(),
    }
