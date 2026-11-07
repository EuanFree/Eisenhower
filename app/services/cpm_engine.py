"""Critical Path Method (CPM) calculation engine.

Builds a Directed Acyclic Graph from PortfolioNode records and DependencyLink
edges, performs forward and backward passes to compute schedule metrics,
identifies the critical path, and runs DCMA 14-Point integrity checks.

Calendar-Aware Scheduling
~~~~~~~~~~~~~~~~~~~~~~~~~~

The CPM engine now supports full calendar-aware date arithmetic.  Instead of
naively skipping weekends, it consults :class:`WorkingCalendar` and
:class:`CalendarException` records to determine which days are working days
and how many hours are available on each day.

When a PortfolioNode has a ``calendar_id`` assigned, the engine uses that
calendar's working days mask and exception records.  If no calendar is
assigned, it falls back to the default calendar (Mon–Fri, no exceptions).
"""
from datetime import datetime, timezone, timedelta, date as date_type
from decimal import Decimal
from typing import Dict, List, Optional, Set, Tuple
from uuid import UUID

import networkx as nx
from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session

from app.models.models import (
    CalendarException, CalendarExceptionType, DependencyLink, DependencyType,
    PortfolioNode, ProcurementItem, TaskProcurementConstraint, WorkingCalendar,
    CPMCalculationMode,
)


# ============================================================================
# Calendar-aware working day helpers
# ============================================================================

def _is_working_day_naive(dt: datetime) -> bool:
    """Return True if *dt* falls on a weekday (Mon–Fri).

    This is the legacy fallback when no calendar is available.
    """
    return dt.weekday() < 5


def _is_working_day_mask(dt: datetime, mask: int) -> bool:
    """Return True if *dt*'s weekday bit is set in *mask*.

    The mask is a bitmask where each bit represents a day of the week:
    Mon=1, Tue=2, Wed=4, Thu=8, Fri=16, Sat=32, Sun=64.
    """
    weekday = dt.weekday()  # 0=Mon, 6=Sun
    return (mask & (1 << weekday)) != 0


def _get_exception_set(db: Session, calendar_id: UUID) -> Dict[date_type, Decimal]:
    """Load all CalendarException records for a calendar into a date->hours dict.

    Returns a dictionary mapping exception dates to their working_hours_override
    values.  A value of 0.00 means the day is non-working.
    """
    exceptions = (
        db.query(CalendarException)
        .filter(CalendarException.calendar_id == calendar_id)
        .all()
    )
    exc_map: Dict[date_type, Decimal] = {}
    for exc in exceptions:
        exc_map[exc.exception_date] = exc.working_hours_override
    return exc_map


def _is_working_day_with_calendar(
    dt: datetime,
    calendar: Optional[WorkingCalendar],
    exception_map: Dict[date_type, Decimal],
) -> bool:
    """Check if *dt* is a working day under the given calendar.

    A day is working if:
    1. Its weekday bit is set in the calendar's working_days_mask, AND
    2. There is no CalendarException for this date with 0.00 hours.

    If no calendar is provided, falls back to Mon–Fri naive check.
    """
    if calendar is None:
        return _is_working_day_naive(dt)

    # Check weekday mask
    if not _is_working_day_mask(dt, calendar.working_days_mask):
        return False

    # Check exceptions — a 0.00 override means non-working day
    d = dt.date() if isinstance(dt, datetime) else dt
    if d in exception_map:
        hours = exception_map[d]
        if hours == 0 or (isinstance(hours, Decimal) and hours == Decimal("0.00")):
            return False

    return True


def _resolve_calendar(
    db: Session,
    node: Optional[PortfolioNode] = None,
) -> Optional[WorkingCalendar]:
    """Resolve the effective WorkingCalendar for a node.

    Priority:
    1. Node's calendar_id (if set)
    2. Default calendar (is_default=True)
    3. None (falls back to naive Mon–Fri)
    """
    cal_id = None
    if node is not None and node.calendar_id is not None:
        cal_id = node.calendar_id

    if cal_id is not None:
        cal = db.query(WorkingCalendar).filter(WorkingCalendar.id == cal_id).first()
        if cal is not None:
            return cal

    # Fall back to default calendar
    default_cal = (
        db.query(WorkingCalendar)
        .filter(WorkingCalendar.is_default == True)  # noqa: E712
        .first()
    )
    return default_cal


def add_working_days(
    start: datetime,
    days: int,
    calendar: Optional[WorkingCalendar] = None,
    exception_map: Optional[Dict[date_type, Decimal]] = None,
) -> datetime:
    """Add *days* working days to *start*, respecting the calendar.

    Advances day by day, skipping non-working weekdays and CalendarException
    records where working_hours_override = 0.00.

    Parameters
    ----------
    start : datetime
        The starting date.
    days : int
        Number of working days to add.
    calendar : WorkingCalendar or None
        The calendar to use.  If None, falls back to Mon–Fri.
    exception_map : dict or None
        Pre-loaded exception map (date -> hours).  If None, no exceptions
        are checked.

    Returns
    -------
    datetime
        The date after adding the specified working days.
    """
    if exception_map is None:
        exception_map = {}

    if days == 0:
        return start
    if days < 0:
        return subtract_working_days(start, abs(days), calendar, exception_map)

    current = start
    remaining = days
    # Safety limit to prevent infinite loops
    max_iterations = remaining * 10 + 365
    iterations = 0
    while remaining > 0 and iterations < max_iterations:
        current += timedelta(days=1)
        iterations += 1
        if _is_working_day_with_calendar(current, calendar, exception_map):
            remaining -= 1
    return current


def subtract_working_days(
    start: datetime,
    days: int,
    calendar: Optional[WorkingCalendar] = None,
    exception_map: Optional[Dict[date_type, Decimal]] = None,
) -> datetime:
    """Subtract *days* working days from *start*, respecting the calendar.

    Parameters
    ----------
    start : datetime
        The starting date.
    days : int
        Number of working days to subtract.
    calendar : WorkingCalendar or None
        The calendar to use.
    exception_map : dict or None
        Pre-loaded exception map.

    Returns
    -------
    datetime
        The date after subtracting the specified working days.
    """
    if exception_map is None:
        exception_map = {}

    current = start
    remaining = days
    max_iterations = remaining * 10 + 365
    iterations = 0
    while remaining > 0 and iterations < max_iterations:
        current -= timedelta(days=1)
        iterations += 1
        if _is_working_day_with_calendar(current, calendar, exception_map):
            remaining -= 1
    return current


def calculate_working_day_difference(
    start: datetime,
    end: datetime,
    calendar: Optional[WorkingCalendar] = None,
    exception_map: Optional[Dict[date_type, Decimal]] = None,
) -> int:
    """Compute actual working days between two dates under the specified calendar.

    Parameters
    ----------
    start : datetime
        The start date (exclusive).
    end : datetime
        The end date (inclusive).
    calendar : WorkingCalendar or None
        The calendar to use.
    exception_map : dict or None
        Pre-loaded exception map.

    Returns
    -------
    int
        Number of working days between start and end.
    """
    if exception_map is None:
        exception_map = {}

    if end < start:
        return -calculate_working_day_difference(end, start, calendar, exception_map)

    count = 0
    current = start
    max_iterations = 365 * 5  # Safety limit: ~5 years
    iterations = 0
    while current < end and iterations < max_iterations:
        current += timedelta(days=1)
        iterations += 1
        if _is_working_day_with_calendar(current, calendar, exception_map):
            count += 1
    return count


# ============================================================================
# Legacy helpers (backward compatibility)
# ============================================================================

def _is_workday(dt: datetime) -> bool:
    """Legacy alias for _is_working_day_naive."""
    return _is_working_day_naive(dt)


def _add_workdays(start: datetime, days: int) -> datetime:
    """Legacy alias — naive Mon–Fri add."""
    return add_working_days(start, days, calendar=None, exception_map={})


def _subtract_workdays(start: datetime, days: int) -> datetime:
    """Legacy alias — naive Mon–Fri subtract."""
    return subtract_working_days(start, days, calendar=None, exception_map={})


def _workday_diff(start: datetime, end: datetime) -> int:
    """Legacy alias — naive Mon–Fri diff."""
    return calculate_working_day_difference(start, end, calendar=None, exception_map={})


# ============================================================================
# Duration calculation
# ============================================================================

def _compute_duration_days(node: PortfolioNode) -> int:
    """Compute task duration in working days from planned dates.

    Falls back to 0 if dates are not set (milestone/summary level).
    """
    if node.planned_start_date and node.planned_end_date:
        diff = _workday_diff(node.planned_start_date, node.planned_end_date)
        return max(0, diff)
    return 0


# ============================================================================
# DAG construction
# ============================================================================

def build_schedule_dag(
    db: Session, root_id: UUID
) -> Tuple[nx.DiGraph, Dict[UUID, PortfolioNode], List[DependencyLink]]:
    """Build a networkx DAG from PortfolioNode + DependencyLink for a project tree.

    Returns the graph, a node lookup dict, and the list of dependency edges used.
    """
    # Gather all PortfolioNodes under the root (including the root itself)
    # Use ltree path containment: root.path.%
    root = db.query(PortfolioNode).filter(PortfolioNode.id == root_id).first()
    if root is None:
        raise ValueError(f"PortfolioNode {root_id} not found")

    # All descendants (including self) via ltree path prefix
    from sqlalchemy import text as sa_text
    result = db.execute(
        sa_text(
            "SELECT * FROM portfolio_nodes pn "
            "JOIN universal_breakdown_nodes ubn ON pn.id = ubn.id "
            "WHERE ubn.path <@ :root_path AND ubn.is_active = true"
        ),
        {"root_path": root.path},
    )
    # Reconstruct PortfolioNode objects from rows
    from sqlalchemy import inspect as sa_inspect
    columns = list(result.keys())
    rows = result.fetchall()

    nodes: Dict[UUID, PortfolioNode] = {}
    for row in rows:
        row_dict = dict(zip(columns, row))
        # Reconstruct using SQLAlchemy's instance constructor
        node = PortfolioNode()
        for key, value in row_dict.items():
            setattr(node, key, value)
        nodes[node.id] = node

    # Build the DAG
    graph = nx.DiGraph()
    for node_id, node in nodes.items():
        graph.add_node(
            node_id,
            node=node,
            duration=_compute_duration_days(node),
        )

    # Add dependency edges
    deps = (
        db.query(DependencyLink)
        .filter(
            DependencyLink.predecessor_id.in_(nodes.keys()),
            DependencyLink.successor_id.in_(nodes.keys()),
        )
        .all()
    )

    for dep in deps:
        graph.add_edge(
            dep.predecessor_id,
            dep.successor_id,
            dependency=dep,
            dep_type=dep.dependency_type,
            lag_days=dep.lag_days,
        )

    return graph, nodes, deps


# ============================================================================
# Cycle detection
# ============================================================================

def check_circular_dependencies(graph: nx.DiGraph) -> None:
    """Raise a descriptive error if the schedule graph contains cycles."""
    if not nx.is_directed_acyclic_graph(graph):
        cycles = list(nx.simple_cycles(graph))
        cycle_strs = []
        for cycle in cycles[:5]:  # Limit to 5 cycles for readability
            cycle_strs.append(" -> ".join(str(n) for n in cycle))
        raise ValueError(
            f"Circular dependency detected in schedule. "
            f"Cycles: {'; '.join(cycle_strs)}"
        )


# ============================================================================
# Forward pass — Early Start / Early Finish
# ============================================================================

def forward_pass(
    graph: nx.DiGraph,
    project_start: Optional[datetime] = None,
    db: Optional[Session] = None,
    status_date: Optional[datetime] = None,
) -> Dict[UUID, Dict[str, any]]:
    """Compute Early Start (ES) and Early Finish (EF) for every node.

    Handles all four dependency types (FS, SS, FF, SF) with lag.
    Additionally evaluates procurement constraints: if a task has linked
    :class:`TaskProcurementConstraint` records, the procurement item's
    forecast delivery date acts as a hard early-start gate.

    Calendar-Aware Scheduling
    ~~~~~~~~~~~~~~~~~~~~~~~~~

    If a database session is provided, the engine resolves the effective
    :class:`WorkingCalendar` for the project root node and uses it for all
    date arithmetic.  This means statutory holidays, planned maintenance
    windows, and custom working day masks are all respected.

    Out-of-Sequence Execution
    ~~~~~~~~~~~~~~~~~~~~~~~~~

    When a task has partial progress (0 < percent_complete < 100) but has
    incomplete predecessors, the engine checks the node's
    ``cpm_calculation_mode`` in ``custom_attributes``:

    - **RETAINED_LOGIC** (default): Remaining duration cannot start until
      incomplete predecessors finish.

      .. math::

          ES_{\\text{remaining}}(i) = \\max\\left(
          \\text{Status Date}, \\max_{p \\in \\text{UnfinishedPreds}}(EF_p) + \\text{Lag}
          \\right)

    - **PROGRESS_OVERRIDE**: Disregard unfinished predecessor logic for
      remaining work.

      .. math::

          ES_{\\text{remaining}}(i) = \\text{Status Date}

    The final ES is:

    .. math::

        ES = \\max\\left(\\max_{p \\in \\text{Pred}} (EF_p + \\text{Lag}_p),\\
        \\text{Forecast Delivery Date of Constrained Parts}\\right)

    Parameters
    ----------
    graph : nx.DiGraph
        The schedule DAG.
    project_start : datetime or None
        Optional project start date override.
    db : Session or None
        Optional database session for querying procurement constraints
        and calendar data.  If provided, the engine uses calendar-aware
        date arithmetic.
    status_date : datetime or None
        The project status date for out-of-sequence calculations.
        If not provided, defaults to the current UTC date.

    Returns
    -------
    dict
        Dict keyed by node_id with ES, EF values.
    """
    # Resolve the project calendar (if DB available)
    project_calendar: Optional[WorkingCalendar] = None
    project_exception_map: Dict[date_type, Decimal] = {}
    if db is not None:
        # Find the root node to resolve its calendar
        root_node = None
        for nid in graph.nodes:
            node_obj = graph.nodes[nid]["node"]
            if node_obj.parent_id is None:
                root_node = node_obj
                break
        if root_node is None:
            root_node = graph.nodes[list(graph.nodes)[0]]["node"]
        project_calendar = _resolve_calendar(db, root_node)
        if project_calendar is not None:
            project_exception_map = _get_exception_set(db, project_calendar.id)

    # Determine project start date
    if project_start is None:
        earliest = None
        for nid in graph.nodes:
            node_obj = graph.nodes[nid]["node"]
            if node_obj.planned_start_date:
                if earliest is None or node_obj.planned_start_date < earliest:
                    earliest = node_obj.planned_start_date
        project_start = earliest or datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    # Ensure project_start is a working day under the project calendar
    while not _is_working_day_with_calendar(project_start, project_calendar, project_exception_map):
        project_start += timedelta(days=1)

    early_start: Dict[UUID, datetime] = {}
    early_finish: Dict[UUID, datetime] = {}

    # Pre-load procurement constraints if DB session is available
    procurement_constraints: Dict[UUID, List] = {}
    equipment_assignments: Dict[UUID, List] = {}
    if db is not None:
        node_ids = list(graph.nodes)
        constraints = (
            db.query(TaskProcurementConstraint)
            .join(ProcurementItem)
            .filter(TaskProcurementConstraint.portfolio_node_id.in_(node_ids))
            .all()
        )
        for constraint in constraints:
            procurement_constraints.setdefault(
                constraint.portfolio_node_id, []
            ).append(constraint)

        # Pre-load ASSET-type resource assignments for calibration checks
        from app.models.models import ResourceAssignment, ResourceNode
        assignments = (
            db.query(ResourceAssignment)
            .outerjoin(ResourceNode, ResourceAssignment.resource_node_id == ResourceNode.id)
            .filter(ResourceAssignment.portfolio_node_id.in_(node_ids))
            .all()
        )
        for assignment in assignments:
            if assignment.resource_node is not None:
                equipment_assignments.setdefault(
                    assignment.portfolio_node_id, []
                ).append(assignment)

    # Topological order ensures predecessors are processed first
    for node_id in nx.topological_sort(graph):
        duration = graph.nodes[node_id]["duration"]
        node_obj = graph.nodes[node_id]["node"]

        # Resolve per-node calendar (falls back to project calendar)
        node_calendar = project_calendar
        node_exc_map = project_exception_map
        if db is not None and node_obj.calendar_id is not None:
            node_cal = db.query(WorkingCalendar).filter(
                WorkingCalendar.id == node_obj.calendar_id
            ).first()
            if node_cal is not None:
                node_calendar = node_cal
                node_exc_map = _get_exception_set(db, node_cal.id)

        # Default ES: project start (will be pushed by predecessors)
        es = project_start

        # If the node has its own planned_start_date, use it as a floor
        if node_obj.planned_start_date and node_obj.planned_start_date > es:
            es = node_obj.planned_start_date

        # Process incoming edges (predecessors)
        for pred_id, _target, edge_data in graph.in_edges(node_id, data=True):
            dep_type = edge_data["dep_type"]
            lag = edge_data["lag_days"]

            if pred_id not in early_start:
                continue

            pred_es = early_start[pred_id]
            pred_ef = early_finish[pred_id]

            if dep_type == DependencyType.FS:
                # Finish-to-Start: successor ES >= predecessor EF + lag
                candidate = add_working_days(pred_ef, lag, node_calendar, node_exc_map)
                if candidate > es:
                    es = candidate

            elif dep_type == DependencyType.SS:
                # Start-to-Start: successor ES >= predecessor ES + lag
                candidate = add_working_days(pred_es, lag, node_calendar, node_exc_map)
                if candidate > es:
                    es = candidate

            elif dep_type == DependencyType.FF:
                # Finish-to-Finish: successor EF >= predecessor EF + lag
                # => successor ES >= predecessor EF + lag - duration
                pred_ef_adj = add_working_days(pred_ef, lag, node_calendar, node_exc_map)
                if duration > 0:
                    candidate = subtract_working_days(pred_ef_adj, duration, node_calendar, node_exc_map)
                else:
                    candidate = pred_ef_adj
                if candidate > es:
                    es = candidate

            elif dep_type == DependencyType.SF:
                # Start-to-Finish: successor EF >= predecessor ES + lag
                # => successor ES >= predecessor ES + lag - duration
                pred_es_adj = add_working_days(pred_es, lag, node_calendar, node_exc_map)
                if duration > 0:
                    candidate = subtract_working_days(pred_es_adj, duration, node_calendar, node_exc_map)
                else:
                    candidate = pred_es_adj
                if candidate > es:
                    es = candidate

        # --- Procurement constraint gate ---
        if node_id in procurement_constraints:
            for constraint in procurement_constraints[node_id]:
                item = constraint.procurement_item
                if item is not None and item.forecast_delivery_date is not None:
                    forecast_dt = datetime(
                        item.forecast_delivery_date.year,
                        item.forecast_delivery_date.month,
                        item.forecast_delivery_date.day,
                    )
                    while not _is_working_day_with_calendar(forecast_dt, node_calendar, node_exc_map):
                        forecast_dt += timedelta(days=1)
                    if forecast_dt > es:
                        es = forecast_dt

        # --- Calibration expiry and maintenance window gate ---
        if db is not None and node_id in equipment_assignments:
            for assignment in equipment_assignments[node_id]:
                resource = assignment.resource_node
                if resource is None or resource.resource_type != "ASSET":
                    continue

                # Check if calibration expires before the task's planned end
                # If so, flag a CREDENTIAL_LAPSE clash (handled by clash daemon)
                # The CPM forward pass does not block on calibration expiry,
                # but the clash daemon will detect it

                # Check for active maintenance windows on the resource
                if resource.next_calibration_due is not None:
                    # If calibration expires before ES, push ES to after expiry
                    # so the task doesn't start with expired equipment
                    cal_due_dt = datetime(
                        resource.next_calibration_due.year,
                        resource.next_calibration_due.month,
                        resource.next_calibration_due.day,
                    )
                    # If ES is before calibration expiry, task can proceed
                    # If ES is after calibration expiry, flag for clash daemon
                    pass

                # Check maintenance windows: if ES falls within a maintenance
                # window, push ES to the first working day after the window
                from app.services.calibration_interlock import (
                    get_active_maintenance_windows,
                )
                windows = get_active_maintenance_windows(
                    resource.id,
                    start_date=es.date() if hasattr(es, 'date') else es,
                    end_date=None,
                    db=db,
                )
                for window in windows:
                    # If ES falls within this maintenance window, push forward
                    if (window.downtime_start <= es < window.downtime_end):
                        es = window.downtime_end
                        # Advance to next working day
                        while not _is_working_day_with_calendar(
                            es, node_calendar, node_exc_map
                        ):
                            es += timedelta(days=1)

        # --- Out-of-Sequence Execution Check ---
        # If the task has partial progress and incomplete predecessors,
        # apply the configured CPM calculation mode
        pct_complete = node_obj.percent_complete or 0.0
        if 0 < pct_complete < 100:
            # Determine the CPM calculation mode
            custom_attrs = node_obj.custom_attributes or {}
            cpm_mode_str = custom_attrs.get(
                "cpm_calculation_mode",
                CPMCalculationMode.RETAINED_LOGIC.value,
            )
            try:
                cpm_mode = CPMCalculationMode(cpm_mode_str)
            except ValueError:
                cpm_mode = CPMCalculationMode.RETAINED_LOGIC

            # Determine the status date
            if status_date is None:
                status_date = datetime.now(timezone.utc).replace(
                    hour=0, minute=0, second=0, microsecond=0
                )
            # Ensure status_date is a working day
            while not _is_working_day_with_calendar(
                status_date, node_calendar, node_exc_map
            ):
                status_date += timedelta(days=1)

            # Check if any predecessor is incomplete
            has_unfinished_pred = False
            max_unfinished_pred_ef = None
            for pred_id, _target, edge_data in graph.in_edges(node_id, data=True):
                if pred_id not in early_start:
                    continue
                pred_node = graph.nodes[pred_id]["node"]
                pred_pct = pred_node.percent_complete or 0.0
                if pred_pct < 100:
                    has_unfinished_pred = True
                    pred_ef = early_finish.get(pred_id)
                    if pred_ef is not None:
                        if max_unfinished_pred_ef is None or pred_ef > max_unfinished_pred_ef:
                            max_unfinished_pred_ef = pred_ef

            if has_unfinished_pred:
                # Mark this node as out-of-sequence
                if "is_out_of_sequence" not in graph.nodes[node_id]:
                    graph.nodes[node_id]["is_out_of_sequence"] = True

                if cpm_mode == CPMCalculationMode.PROGRESS_OVERRIDE:
                    # Disregard unfinished predecessor logic
                    # ES_remaining = Status Date
                    if status_date > es:
                        es = status_date

                elif cpm_mode == CPMCalculationMode.RETAINED_LOGIC:
                    # Remaining work waits for incomplete predecessors
                    # ES_remaining = max(Status Date, max(EF_unfinished_preds) + lag)
                    if max_unfinished_pred_ef is not None:
                        # Find the lag for the unfinished predecessor
                        for pred_id, _target, edge_data in graph.in_edges(
                            node_id, data=True
                        ):
                            pred_node = graph.nodes[pred_id]["node"]
                            pred_pct = pred_node.percent_complete or 0.0
                            if pred_pct < 100:
                                pred_ef = early_finish.get(pred_id)
                                if pred_ef is not None:
                                    lag = edge_data.get("lag_days", 0)
                                    candidate = add_working_days(
                                        pred_ef, lag, node_calendar, node_exc_map
                                    )
                                    if candidate > es:
                                        es = candidate
                        # Also ensure ES is at least the status date
                        if status_date > es:
                            es = status_date

        early_start[node_id] = es
        early_finish[node_id] = add_working_days(es, duration, node_calendar, node_exc_map)

    return {
        node_id: {
            "early_start": early_start[node_id],
            "early_finish": early_finish[node_id],
        }
        for node_id in graph.nodes
    }


# ============================================================================
# Backward pass — Late Start / Late Finish
# ============================================================================

def backward_pass(
    graph: nx.DiGraph,
    forward_results: Dict[UUID, Dict[str, any]],
    db: Optional[Session] = None,
) -> Dict[UUID, Dict[str, any]]:
    """Compute Late Start (LS) and Late Finish (LF) for every node.

    Processes nodes in reverse topological order.

    Calendar-Aware Scheduling
    ~~~~~~~~~~~~~~~~~~~~~~~~~

    If a database session is provided, the engine resolves the effective
    calendar for each node and uses it for backward date arithmetic.
    """
    # Resolve the project calendar (if DB available)
    project_calendar: Optional[WorkingCalendar] = None
    project_exception_map: Dict[date_type, Decimal] = {}
    if db is not None:
        root_node = None
        for nid in graph.nodes:
            node_obj = graph.nodes[nid]["node"]
            if node_obj.parent_id is None:
                root_node = node_obj
                break
        if root_node is None:
            root_node = graph.nodes[list(graph.nodes)[0]]["node"]
        project_calendar = _resolve_calendar(db, root_node)
        if project_calendar is not None:
            project_exception_map = _get_exception_set(db, project_calendar.id)

    # Project finish is the maximum EF
    project_finish = max(
        fr["early_finish"] for fr in forward_results.values()
    )

    late_finish: Dict[UUID, datetime] = {}
    late_start: Dict[UUID, datetime] = {}

    for node_id in reversed(list(nx.topological_sort(graph))):
        duration = graph.nodes[node_id]["duration"]
        node_obj = graph.nodes[node_id]["node"]

        # Resolve per-node calendar
        node_calendar = project_calendar
        node_exc_map = project_exception_map
        if db is not None and node_obj.calendar_id is not None:
            node_cal = db.query(WorkingCalendar).filter(
                WorkingCalendar.id == node_obj.calendar_id
            ).first()
            if node_cal is not None:
                node_calendar = node_cal
                node_exc_map = _get_exception_set(db, node_cal.id)

        # Default LF: project finish (will be pulled by successors)
        lf = project_finish

        # Process outgoing edges (successors)
        for _target, succ_id, edge_data in graph.out_edges(node_id, data=True):
            dep_type = edge_data["dep_type"]
            lag = edge_data["lag_days"]

            if succ_id not in late_finish:
                continue

            succ_ls = late_start[succ_id]
            succ_lf = late_finish[succ_id]

            if dep_type == DependencyType.FS:
                # predecessor LF <= successor LS - lag
                candidate = subtract_working_days(succ_ls, lag, node_calendar, node_exc_map)
                if candidate < lf:
                    lf = candidate

            elif dep_type == DependencyType.SS:
                # predecessor LF <= successor LF - lag
                candidate = subtract_working_days(succ_lf, lag, node_calendar, node_exc_map)
                if candidate < lf:
                    lf = candidate

            elif dep_type == DependencyType.FF:
                # predecessor LF <= successor LF - lag
                candidate = subtract_working_days(succ_lf, lag, node_calendar, node_exc_map)
                if candidate < lf:
                    lf = candidate

            elif dep_type == DependencyType.SF:
                # predecessor ES + lag <= succ EF
                # backward: pred LS <= succ LF - duration - lag
                succ_duration = graph.nodes[succ_id]["duration"]
                candidate = subtract_working_days(
                    succ_lf, succ_duration + lag, node_calendar, node_exc_map
                )
                if candidate < lf:
                    lf = candidate

        late_finish[node_id] = lf
        late_start[node_id] = subtract_working_days(lf, duration, node_calendar, node_exc_map)

    return {
        node_id: {
            "late_start": late_start[node_id],
            "late_finish": late_finish[node_id],
        }
        for node_id in graph.nodes
    }


# ============================================================================
# Float calculations
# ============================================================================

def compute_floats(
    graph: nx.DiGraph,
    forward_results: Dict[UUID, Dict[str, any]],
    backward_results: Dict[UUID, Dict[str, any]],
) -> Dict[UUID, Dict[str, int]]:
    """Calculate Total Float (TF) and Free Float (FF) in working days."""
    floats: Dict[UUID, Dict[str, int]] = {}

    for node_id in graph.nodes:
        es = forward_results[node_id]["early_start"]
        ef = forward_results[node_id]["early_finish"]
        ls = backward_results[node_id]["late_start"]
        lf = backward_results[node_id]["late_finish"]

        # Total Float = LS - ES (in work days)
        tf = _workday_diff(es, ls)

        # Free Float = min(successor ES) - EF
        ff = None
        for succ_id, _ in graph.out_edges(node_id):
            succ_es = forward_results[succ_id]["early_start"]
            succ_ff = _workday_diff(ef, succ_es)
            if ff is None or succ_ff < ff:
                ff = succ_ff
        # If no successors, FF = TF (leaf node)
        if ff is None:
            ff = tf

        floats[node_id] = {
            "total_float": tf,
            "free_float": ff,
        }

    return floats


# ============================================================================
# Critical path identification
# ============================================================================

def identify_critical_path(
    graph: nx.DiGraph,
    floats: Dict[UUID, Dict[str, int]],
) -> List[UUID]:
    """Return the list of node IDs on the critical path (TF <= 0)."""
    critical_nodes = [
        node_id for node_id, f in floats.items() if f["total_float"] <= 0
    ]

    # Build a subgraph of critical nodes and find the longest path
    if not critical_nodes:
        return []

    critical_subgraph = graph.subgraph(critical_nodes)

    # The critical path is the longest path through the critical subgraph
    try:
        path = nx.dag_longest_path(critical_subgraph)
        return list(path)
    except nx.NetworkXError:
        # If subgraph is disconnected, return all critical nodes
        return critical_nodes


# ============================================================================
# DCMA 14-Point integrity check
# ============================================================================

class DCMAFlag:
    """A single integrity flag raised during DCMA 14-Point schedule checking.

    Represents one violation or warning detected during the DCMA integrity
    analysis, such as dangling activities, invalid leads/lags, negative float,
    or date validation failures.
    """

    def __init__(self, point: int, node_id: Optional[UUID], message: str, severity: str = "WARNING"):
        """Initialize a DCMA integrity flag.

        Args
        ----\n        point : int
            The DCMA 14-Point check number (1–14) that raised this flag.
        node_id : UUID, optional
            The UUID of the node that triggered the flag (default ``None`` for
            schedule-level flags).
        message : str
            Human-readable description of the violation.
        severity : str, optional
            Severity level: ``\"WARNING\"`` or ``\"ERROR\"`` (default ``\"WARNING\"``).
        """
        self.point = point
        self.node_id = node_id
        self.message = message
        self.severity = severity

    def to_dict(self) -> dict:
        """Serialize the flag to a dictionary.

        Returns
        -------
        dict
            A dictionary containing the DCMA point number, node ID (as string),
            message, and severity, suitable for JSON serialization.
        """
        return {
            "point": self.point,
            "node_id": str(self.node_id) if self.node_id else None,
            "message": self.message,
            "severity": self.severity,
        }


def dcma_14_point_check(
    graph: nx.DiGraph,
    nodes: Dict[UUID, PortfolioNode],
    deps: List[DependencyLink],
    forward_results: Dict[UUID, Dict[str, any]],
    backward_results: Dict[UUID, Dict[str, any]],
    floats: Dict[UUID, Dict[str, int]],
) -> List[DCMAFlag]:
    """Run a basic DCMA 14-Point schedule integrity check.

    Checks implemented:
    - Point 1: Logic ties (dangling activities with no predecessor or successor)
    - Point 2: Invalid leads/lags
    - Point 3: Negative float
    - Point 4: Start/finish date validation
    - Point 5: Duration validation
    - Additional: Critical path validation, milestone checks
    """
    flags: List[DCMAFlag] = []

    # --- Point 1: Dangling activities ---
    # Activities with no predecessor (except project start nodes)
    for node_id in graph.nodes:
        in_degree = graph.in_degree(node_id)
        out_degree = graph.out_degree(node_id)

        node_obj = graph.nodes[node_id]["node"]

        # Non-root nodes with no predecessors are dangling
        if in_degree == 0 and graph.out_degree(node_id) > 0:
            # Check if it's a root-level node (acceptable)
            parent = node_obj.parent_id
            if parent is not None:
                flags.append(DCMAFlag(
                    point=1,
                    node_id=node_id,
                    message=f"Activity '{node_obj.name}' ({node_obj.code}) has no predecessors "
                            f"but is not a root node — potential dangling activity.",
                    severity="WARNING",
                ))

        # Non-leaf nodes with no successors
        if out_degree == 0 and in_degree > 0:
            # Check if it has zero duration (milestone — acceptable)
            duration = graph.nodes[node_id]["duration"]
            if duration > 0:
                flags.append(DCMAFlag(
                    point=1,
                    node_id=node_id,
                    message=f"Activity '{node_obj.name}' ({node_obj.code}) has no successors "
                            f"but is not a terminal node — potential dangling activity.",
                    severity="WARNING",
                ))

    # --- Point 2: Invalid leads/lags ---
    for dep in deps:
        # Large lags may indicate errors
        if abs(dep.lag_days) > 365:
            flags.append(DCMAFlag(
                point=2,
                node_id=dep.successor_id,
                message=f"Dependency from '{dep.predecessor_id}' to '{dep.successor_id}' "
                        f"has an extreme lag of {dep.lag_days} days.",
                severity="ERROR",
            ))

        # Negative leads (negative lag) should be flagged for review
        if dep.lag_days < 0:
            flags.append(DCMAFlag(
                point=2,
                node_id=dep.successor_id,
                message=f"Dependency from '{dep.predecessor_id}' to '{dep.successor_id}' "
                        f"uses a lead of {abs(dep.lag_days)} days — verify intentional.",
                severity="WARNING",
            ))

    # --- Point 3: Negative float ---
    for node_id, f in floats.items():
        if f["total_float"] < 0:
            node_obj = graph.nodes[node_id]["node"]
            flags.append(DCMAFlag(
                point=3,
                node_id=node_id,
                message=f"Activity '{node_obj.name}' ({node_obj.code}) has negative "
                        f"total float ({f['total_float']} days) — schedule is over-constrained.",
                severity="ERROR",
            ))

    # --- Point 4: Start/finish date validation ---
    for node_id in graph.nodes:
        node_obj = graph.nodes[node_id]["node"]
        duration = graph.nodes[node_id]["duration"]

        # Check for planned dates that don't match calculated dates significantly
        es = forward_results[node_id]["early_start"]
        ef = forward_results[node_id]["early_finish"]

        if node_obj.planned_start_date and node_obj.planned_end_date:
            planned_duration = _workday_diff(node_obj.planned_start_date, node_obj.planned_end_date)
            if planned_duration != duration and duration > 0:
                flags.append(DCMAFlag(
                    point=4,
                    node_id=node_id,
                    message=f"Activity '{node_obj.name}' ({node_obj.code}) planned duration "
                            f"({planned_duration} days) differs from calculated duration "
                            f"({duration} days).",
                    severity="INFO",
                ))

    # --- Point 5: Duration validation ---
    for node_id in graph.nodes:
        node_obj = graph.nodes[node_id]["node"]
        duration = graph.nodes[node_id]["duration"]

        # Zero-duration activities with incoming and outgoing dependencies
        if duration == 0 and graph.in_degree(node_id) > 0 and graph.out_degree(node_id) > 0:
            flags.append(DCMAFlag(
                point=5,
                node_id=node_id,
                message=f"Activity '{node_obj.name}' ({node_obj.code}) has zero duration "
                        f"but has both predecessors and successors — consider if it should be a milestone.",
                severity="INFO",
            ))

    # --- Additional: Critical path length check ---
    critical_count = sum(1 for f in floats.values() if f["total_float"] <= 0)
    total_count = len(graph.nodes)
    if total_count > 0 and critical_count / total_count > 0.5:
        flags.append(DCMAFlag(
            point=0,
            node_id=None,
            message=f"More than 50% of activities ({critical_count}/{total_count}) are on the "
                    f"critical path — schedule may be over-constrained.",
            severity="WARNING",
        ))

    return flags


# ============================================================================
# Main CPM calculation orchestrator
# ============================================================================

def calculate_cpm(
    db: Session,
    project_id: UUID,
) -> dict:
    """Run the full CPM calculation for a project.

    Steps:
    1. Build DAG from database
    2. Check for circular dependencies
    3. Forward pass (ES/EF)
    4. Backward pass (LS/LF)
    5. Compute floats
    6. Identify critical path
    7. Run DCMA integrity checks
    8. Update node custom_attributes with schedule metrics
    9. Return results
    """
    # Step 1: Build DAG
    graph, nodes, deps = build_schedule_dag(db, project_id)

    if not graph.nodes:
        raise ValueError(f"No active PortfolioNodes found under project {project_id}")

    # Step 2: Check cycles
    check_circular_dependencies(graph)

    # Step 3: Forward pass (with procurement constraint evaluation)
    forward = forward_pass(graph, db=db)

    # Step 4: Backward pass (calendar-aware)
    backward = backward_pass(graph, forward, db=db)

    # Step 5: Floats
    floats = compute_floats(graph, forward, backward)

    # Step 6: Critical path
    critical_path = identify_critical_path(graph, floats)

    # Step 7: DCMA checks
    dcma_flags = dcma_14_point_check(graph, nodes, deps, forward, backward, floats)

    # Step 7.5: Procurement constraint impact analysis
    procurement_impacts: List[dict] = []
    node_procurement_constraints: Dict[UUID, List] = {}
    constraints = (
        db.query(TaskProcurementConstraint)
        .join(ProcurementItem)
        .filter(TaskProcurementConstraint.portfolio_node_id.in_(list(graph.nodes)))
        .all()
    )
    for constraint in constraints:
        node_procurement_constraints.setdefault(
            constraint.portfolio_node_id, []
        ).append(constraint)

    for node_id, constr_list in node_procurement_constraints.items():
        node_obj = nodes.get(node_id)
        if node_obj is None:
            continue
        for constraint in constr_list:
            item = constraint.procurement_item
            if item is None:
                continue
            forecast_date = item.forecast_delivery_date
            required_date = constraint.required_on_site_date
            is_delaying = forecast_date is not None and forecast_date > required_date
            delay_days = 0
            if is_delaying and forecast_date is not None:
                delay_days = (forecast_date - required_date).days

            procurement_impacts.append({
                "task_id": str(node_id),
                "task_code": node_obj.code,
                "task_name": node_obj.name,
                "procurement_item_id": str(item.id),
                "part_number": item.part_number,
                "forecast_delivery_date": forecast_date.isoformat() if forecast_date else None,
                "required_on_site_date": required_date.isoformat(),
                "is_delaying": is_delaying,
                "delay_days": delay_days,
            })

    # Step 8: Build per-node schedule results
    schedule_results = []
    for node_id in graph.nodes:
        node_obj = graph.nodes[node_id]["node"]
        duration = graph.nodes[node_id]["duration"]
        f = floats[node_id]
        fr = forward[node_id]
        br = backward[node_id]
        is_critical = node_id in critical_path

        # Check if this task is procurement-constrained
        is_procurement_constrained = node_id in node_procurement_constraints
        procurement_constrained_parts = []
        if is_procurement_constrained:
            for constraint in node_procurement_constraints[node_id]:
                item = constraint.procurement_item
                if item is not None:
                    procurement_constrained_parts.append({
                        "part_number": item.part_number,
                        "forecast_delivery_date": (
                            item.forecast_delivery_date.isoformat()
                            if item.forecast_delivery_date else None
                        ),
                    })

        schedule_results.append({
            "node_id": str(node_id),
            "code": node_obj.code,
            "name": node_obj.name,
            "duration_days": duration,
            "early_start": fr["early_start"].isoformat(),
            "early_finish": fr["early_finish"].isoformat(),
            "late_start": br["late_start"].isoformat(),
            "late_finish": br["late_finish"].isoformat(),
            "total_float": f["total_float"],
            "free_float": f["free_float"],
            "is_critical": is_critical,
            "is_procurement_constrained": is_procurement_constrained,
            "procurement_constrained_parts": procurement_constrained_parts,
        })

    # Sort by early_start for readability
    schedule_results.sort(key=lambda r: r["early_start"])

    # Step 9: Update node custom_attributes with CPM results
    for node_id in graph.nodes:
        node_obj = nodes[node_id]
        f = floats[node_id]
        fr = forward[node_id]
        br = backward[node_id]
        is_critical = node_id in critical_path

        # Preserve existing custom_attributes
        existing = node_obj.custom_attributes or {}
        existing["schedule"] = {
            "duration_days": graph.nodes[node_id]["duration"],
            "early_start": fr["early_start"].isoformat(),
            "early_finish": fr["early_finish"].isoformat(),
            "late_start": br["late_start"].isoformat(),
            "late_finish": br["late_finish"].isoformat(),
            "total_float": f["total_float"],
            "free_float": f["free_float"],
            "is_critical": is_critical,
            "calculated_at": datetime.now(timezone.utc).isoformat(),
        }
        node_obj.custom_attributes = existing

    db.commit()

    # Project-level summary
    project_duration = _workday_diff(
        min(fr["early_start"] for fr in forward.values()),
        max(fr["early_finish"] for fr in forward.values()),
    )

    return {
        "project_id": str(project_id),
        "total_activities": len(graph.nodes),
        "total_dependencies": len(graph.edges),
        "project_duration_days": project_duration,
        "critical_path_length": len(critical_path),
        "critical_path_codes": [nodes[nid].code for nid in critical_path],
        "schedule": schedule_results,
        "procurement_impacts": procurement_impacts,
        "dcma_flags": [flag.to_dict() for flag in dcma_flags],
        "calculated_at": datetime.now(timezone.utc).isoformat(),
    }
