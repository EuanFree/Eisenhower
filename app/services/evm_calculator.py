"""Earned Value Management (EVM) calculator service.

This module implements formal ANSI/EIA-748 Earned Value Measurement
Techniques (EVMT) to calculate Earned Value (EV) objectively rather
than relying on unverified percentage estimates.

EVM Techniques
~~~~~~~~~~~~~~

Five standard techniques are supported, each appropriate for different
types of work:

1. **Percent Complete** — General purpose; EV = BAC × (percent_complete / 100).
   Suitable for design, engineering, and management tasks.

2. **0/100 Rule** — All-or-nothing; EV = 0 until verified complete,
   then EV = BAC.  Suitable for discrete deliverables.

3. **50/50 Rule** — Two-point; EV = 50% of BAC when work starts,
   EV = 100% when work finishes.  Suitable for short-duration tasks.

4. **Milestone Weights** — Multi-point; EV = BAC × sum of verified
   milestone weight fractions.  Suitable for complex tasks with
   clearly defined intermediate checkpoints.

5. **Level of Effort (LOE)** — Supportive; EV = PV, enforcing zero
   schedule variance.  Suitable for ongoing support activities.

Variance and Index Calculations
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

From the core EVM values (BAC, PV, EV, AC), the following derived
metrics are computed:

- **CV (Cost Variance)** = EV - AC
  Positive means under budget; negative means over budget.

- **SV (Schedule Variance)** = EV - PV
  Positive means ahead of schedule; negative means behind schedule.

- **CPI (Cost Performance Index)** = EV / AC
  > 1.0 means under budget; < 1.0 means over budget.

- **SPI (Schedule Performance Index)** = EV / PV
  > 1.0 means ahead of schedule; < 1.0 means behind schedule.

- **EAC (Estimate at Completion)** = BAC / CPI
  Forecasted total cost based on current performance.

Hierarchical Rollup
~~~~~~~~~~~~~~~~~~~

PV, EV, and AC values roll up recursively through the ltree hierarchy
to derive Control Account, Project, and Programme earned value metrics.
This enables S-Curve charting at any level of the WBS.

References
~~~~~~~~~~

- ANSI/EIA-748B: Earned Value Management Systems
- DoD 5000.02-M: Defense Acquisition Program Management
- PMBOK Guide, 7th Edition: Earned Value Management
"""

from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from datetime import datetime, timezone, date, timedelta
from typing import Dict, List, Optional, Tuple
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func

from app.models.models import (
    PortfolioNode,
    MilestoneWeightStep,
    EVMTechnique,
    UniversalBreakdownNode,
    ResourceAssignment,
)


# ============================================================================
# Helper: safe Decimal arithmetic
# ============================================================================

def _safe_decimal(value, default=Decimal("0.00")) -> Decimal:
    """Convert a value to Decimal safely, returning a default on failure.

    Parameters
    ----------
    value : any
        The value to convert (float, int, Decimal, None, etc.).
    default : Decimal
        The default value if conversion fails.

    Returns
    -------
    Decimal
        The converted value or the default.
    """
    if value is None:
        return default
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return default


def _safe_divide(numerator: Decimal, denominator: Decimal,
                 default: Decimal = Decimal("0.00")) -> Decimal:
    """Perform safe division, returning default on zero denominator.

    Parameters
    ----------
    numerator : Decimal
        The numerator.
    denominator : Decimal
        The denominator.
    default : Decimal
        The default value if denominator is zero.

    Returns
    -------
    Decimal
        The quotient or the default.
    """
    if denominator == 0:
        return default
    return numerator / denominator


# ============================================================================
# Core EVM Technique Calculations
# ============================================================================

def calculate_task_earned_value(task_id: UUID, db: Session) -> Dict[str, Optional[float]]:
    """Calculate Earned Value for a single task using its assigned EVM technique.

    This is the central function of the EVM calculator.  It reads the task's
    EVM technique, BAC, and relevant date/progress data, then computes EV
    using the appropriate ANSI/EIA-748 technique.

    The calculated EV is persisted to the task's ``earned_value`` field,
    and derived variances and indices are computed.

    Parameters
    ----------
    task_id : UUID
        UUID of the PortfolioNode to calculate EV for.
    db : Session
        Database session.

    Returns
    -------
    dict
        Dictionary containing:
        - ``earned_value``: Calculated EV
        - ``planned_value``: Current PV
        - ``actual_cost``: Current AC
        - ``bac_cost``: Budget at Completion
        - ``cost_variance``: CV = EV - AC
        - ``schedule_variance``: SV = EV - PV
        - ``cpi``: Cost Performance Index
        - ``spi``: Schedule Performance Index
        - ``eac``: Estimate at Completion
        - ``evm_technique``: Technique used

    Raises
    ------
    ValueError
        If the task is not found or has no BAC defined.
    """
    node = db.query(PortfolioNode).filter(PortfolioNode.id == task_id).first()
    if node is None:
        raise ValueError(f"PortfolioNode {task_id} not found")

    bac = _safe_decimal(node.bac_cost)
    if bac == 0:
        return {
            "earned_value": 0.0,
            "planned_value": float(_safe_decimal(node.planned_value)),
            "actual_cost": float(_safe_decimal(node.actual_cost)),
            "bac_cost": 0.0,
            "cost_variance": 0.0,
            "schedule_variance": 0.0,
            "cpi": None,
            "spi": None,
            "eac": None,
            "evm_technique": node.evm_technique.value if node.evm_technique else None,
        }

    # Calculate EV based on technique
    ev = _calculate_ev_by_technique(node, db)

    # Persist the calculated EV
    node.earned_value = ev

    pv = _safe_decimal(node.planned_value)
    ac = _safe_decimal(node.actual_cost)

    # Compute variances and indices
    cv = ev - ac
    sv = ev - pv
    cpi = _safe_divide(ev, ac)
    spi = _safe_divide(ev, pv)
    eac = _safe_divide(bac, cpi) if cpi != 0 else bac

    return {
        "earned_value": float(ev),
        "planned_value": float(pv),
        "actual_cost": float(ac),
        "bac_cost": float(bac),
        "cost_variance": float(cv),
        "schedule_variance": float(sv),
        "cpi": float(cpi) if cpi != 0 else None,
        "spi": float(spi) if spi != 0 else None,
        "eac": float(eac) if eac != 0 else None,
        "evm_technique": node.evm_technique.value if node.evm_technique else None,
    }


def _calculate_ev_by_technique(node: PortfolioNode, db: Session) -> Decimal:
    """Calculate Earned Value using the node's assigned EVM technique.

    Parameters
    ----------
    node : PortfolioNode
        The task node to calculate EV for.
    db : Session
        Database session.

    Returns
    -------
    Decimal
        The calculated Earned Value.
    """
    bac = _safe_decimal(node.bac_cost)
    technique = node.evm_technique

    if technique == EVMTechnique.ZERO_100:
        return _ev_zero_100(node, bac)
    elif technique == EVMTechnique.FIFTY_FIFTY:
        return _ev_fifty_fifty(node, bac)
    elif technique == EVMTechnique.MILESTONE_WEIGHTS:
        return _ev_milestone_weights(node, bac, db)
    elif technique == EVMTechnique.LEVEL_OF_EFFORT:
        return _ev_level_of_effort(node, bac)
    else:  # PERCENT_COMPLETE (default)
        return _ev_percent_complete(node, bac)


def _ev_percent_complete(node: PortfolioNode, bac: Decimal) -> Decimal:
    """Percent Complete technique: EV = BAC × (percent_complete / 100).

    The most general-purpose technique.  The percent_complete field
    represents the manager's estimate of work performed.

    Parameters
    ----------
    node : PortfolioNode
        The task node.
    bac : Decimal
        Budget at Completion.

    Returns
    -------
    Decimal
        Earned Value = BAC × (percent_complete / 100).
    """
    percent = Decimal(str(node.percent_complete or 0.0))
    ev = bac * (percent / Decimal("100.0"))
    return ev.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _ev_zero_100(node: PortfolioNode, bac: Decimal) -> Decimal:
    """0/100 Rule: EV = BAC if complete; otherwise EV = 0.

    Suitable for discrete deliverables where work is either done or not.
    The task is considered complete if ``actual_end_date`` is set or
    ``percent_complete`` equals 100.

    Parameters
    ----------
    node : PortfolioNode
        The task node.
    bac : Decimal
        Budget at Completion.

    Returns
    -------
    Decimal
        Earned Value = BAC if complete, 0 otherwise.
    """
    is_complete = (
        node.actual_end_date is not None
        or (node.percent_complete or 0.0) >= 100.0
    )
    return bac if is_complete else Decimal("0.00")


def _ev_fifty_fifty(node: PortfolioNode, bac: Decimal) -> Decimal:
    """50/50 Rule: EV = 50% BAC when started; 100% BAC when finished.

    Suitable for short-duration tasks where detailed progress tracking
    is not cost-effective.

    Parameters
    ----------
    node : PortfolioNode
        The task node.
    bac : Decimal
        Budget at Completion.

    Returns
    -------
    Decimal
        Earned Value: 0 (not started), 50% BAC (started), or BAC (finished).
    """
    is_finished = (
        node.actual_end_date is not None
        or (node.percent_complete or 0.0) >= 100.0
    )
    is_started = node.actual_start_date is not None or (node.percent_complete or 0.0) > 0.0

    if is_finished:
        return bac
    elif is_started:
        return (bac * Decimal("0.50")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    else:
        return Decimal("0.00")


def _ev_milestone_weights(node: PortfolioNode, bac: Decimal,
                           db: Session) -> Decimal:
    """Milestone Weights technique: EV = BAC × Σ(verified weight fractions).

    The most objective technique for complex tasks.  Each milestone step
    has a weight fraction, and EV is calculated from the sum of verified
    steps' weights.

    Parameters
    ----------
    node : PortfolioNode
        The task node.
    bac : Decimal
        Budget at Completion.
    db : Session
        Database session.

    Returns
    -------
    Decimal
        Earned Value = BAC × sum of verified milestone weights.
    """
    steps = db.query(MilestoneWeightStep).filter(
        MilestoneWeightStep.portfolio_node_id == node.id
    ).all()

    verified_weight = Decimal("0.000")
    for step in steps:
        if step.is_verified_passed:
            verified_weight += _safe_decimal(step.weight_fraction)

    ev = bac * verified_weight
    return ev.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _ev_level_of_effort(node: PortfolioNode, bac: Decimal) -> Decimal:
    """Level of Effort (LOE): EV = PV, enforcing zero schedule variance.

    Suitable for ongoing support activities (security, facility maintenance,
    programme management) that span the entire project duration.  Since
    EV always equals PV, SV is always 0.

    Parameters
    ----------
    node : PortfolioNode
        The task node.
    bac : Decimal
        Budget at Completion.

    Returns
    -------
    Decimal
        Earned Value = Planned Value (enforcing SV = 0).
    """
    pv = _safe_decimal(node.planned_value)
    return pv


# ============================================================================
# Variance and Index Calculations
# ============================================================================

def compute_evm_variances(ev: Decimal, pv: Decimal, ac: Decimal,
                           bac: Decimal) -> Dict[str, Optional[float]]:
    """Compute EVM variances and performance indices.

    Parameters
    ----------
    ev : Decimal
        Earned Value.
    pv : Decimal
        Planned Value.
    ac : Decimal
        Actual Cost.
    bac : Decimal
        Budget at Completion.

    Returns
    -------
    dict
        Dictionary containing:
        - ``cost_variance``: CV = EV - AC
        - ``schedule_variance``: SV = EV - PV
        - ``cpi``: Cost Performance Index = EV / AC
        - ``spi``: Schedule Performance Index = EV / PV
        - ``eac``: Estimate at Completion = BAC / CPI
        - ``vac``: Variance at Completion = BAC - EAC
    """
    cv = ev - ac
    sv = ev - pv
    cpi = _safe_divide(ev, ac)
    spi = _safe_divide(ev, pv)
    eac = _safe_divide(bac, cpi) if cpi != 0 else bac
    vac = bac - eac

    return {
        "cost_variance": float(cv),
        "schedule_variance": float(sv),
        "cpi": float(cpi) if cpi != 0 else None,
        "spi": float(spi) if spi != 0 else None,
        "eac": float(eac) if eac != 0 else None,
        "vac": float(vac),
    }


# ============================================================================
# Hierarchical Rollup
# ============================================================================

def evm_rollup(root_node_id: UUID, db: Session) -> List[Dict[str, any]]:
    """Recursively compute EVM rollup up the ltree hierarchy.

    Starting from the root node, this function aggregates PV, EV, and AC
    values from all descendant nodes and computes variances at each level
    of the WBS hierarchy.

    The rollup uses ltree path containment to identify descendants at each
    level.  For cross-database compatibility, string-based path prefix
    matching is used instead of native ltree operators.

    Parameters
    ----------
    root_node_id : UUID
        UUID of the root PortfolioNode to roll up from.
    db : Session
        Database session.

    Returns
    -------
    list[dict]
        List of rollup dictionaries, one per WBS level, each containing:
        - ``node_id``: UUID of the level's root node
        - ``code``: Work package code
        - ``name``: Name of the work package
        - ``level``: WBS depth level
        - ``bac_cost``: Rolled-up BAC
        - ``planned_value``: Rolled-up PV
        - ``earned_value``: Rolled-up EV
        - ``actual_cost``: Rolled-up AC
        - ``cost_variance``: CV at this level
        - ``schedule_variance``: SV at this level
        - ``cpi``: CPI at this level
        - ``spi``: SPI at this level
        - ``eac``: EAC at this level
        - ``child_count``: Number of contributing child nodes
    """
    root = db.query(PortfolioNode).filter(PortfolioNode.id == root_node_id).first()
    if root is None:
        raise ValueError(f"PortfolioNode {root_node_id} not found")

    # Get all descendant portfolio nodes using path prefix matching
    root_path = root.path
    descendants = db.query(PortfolioNode).filter(
        PortfolioNode.path.like(root_path + ".%")
        | (PortfolioNode.path == root_path)
    ).all()

    if not descendants:
        return []

    # Group nodes by ltree depth level
    levels: Dict[int, List[PortfolioNode]] = {}
    for node in descendants:
        depth = len(node.path.split("."))
        if depth not in levels:
            levels[depth] = []
        levels[depth].append(node)

    # Compute rollup for each level
    rollup_results = []
    sorted_depths = sorted(levels.keys())

    for depth in sorted_depths:
        nodes_at_level = levels[depth]

        # Aggregate EVM values for nodes at this level
        total_bac = Decimal("0.00")
        total_pv = Decimal("0.00")
        total_ev = Decimal("0.00")
        total_ac = Decimal("0.00")

        for node in nodes_at_level:
            total_bac += _safe_decimal(node.bac_cost)
            total_pv += _safe_decimal(node.planned_value)
            total_ev += _safe_decimal(node.earned_value)
            total_ac += _safe_decimal(node.actual_cost)

        # Compute variances
        cv = total_ev - total_ac
        sv = total_ev - total_pv
        cpi = _safe_divide(total_ev, total_ac)
        spi = _safe_divide(total_ev, total_pv)
        eac = _safe_divide(total_bac, cpi) if cpi != 0 else total_bac

        rollup_results.append({
            "node_id": str(nodes_at_level[0].id),
            "code": nodes_at_level[0].code,
            "name": nodes_at_level[0].name,
            "level": depth,
            "bac_cost": float(total_bac),
            "planned_value": float(total_pv),
            "earned_value": float(total_ev),
            "actual_cost": float(total_ac),
            "cost_variance": float(cv),
            "schedule_variance": float(sv),
            "cpi": float(cpi) if cpi != 0 else None,
            "spi": float(spi) if spi != 0 else None,
            "eac": float(eac) if eac != 0 else None,
            "child_count": len(nodes_at_level),
        })

    return rollup_results


def compute_subtree_evm(root_node_id: UUID, db: Session) -> Dict[str, any]:
    """Compute complete EVM rollup for a subtree.

    Aggregates PV, EV, and AC from all descendants of the root node
    and returns the complete EVM picture at the subtree level.

    Parameters
    ----------
    root_node_id : UUID
        UUID of the root PortfolioNode.
    db : Session
        Database session.

    Returns
    -------
    dict
        Complete EVM data for the subtree including aggregated values
        and derived variances.
    """
    root = db.query(PortfolioNode).filter(PortfolioNode.id == root_node_id).first()
    if root is None:
        raise ValueError(f"PortfolioNode {root_node_id} not found")

    root_path = root.path
    descendants = db.query(PortfolioNode).filter(
        PortfolioNode.path.like(root_path + ".%")
    ).all()

    total_bac = Decimal("0.00")
    total_pv = Decimal("0.00")
    total_ev = Decimal("0.00")
    total_ac = Decimal("0.00")

    for node in descendants:
        total_bac += _safe_decimal(node.bac_cost)
        total_pv += _safe_decimal(node.planned_value)
        total_ev += _safe_decimal(node.earned_value)
        total_ac += _safe_decimal(node.actual_cost)

    variances = compute_evm_variances(total_ev, total_pv, total_ac, total_bac)

    return {
        "root_node_id": str(root_node_id),
        "root_code": root.code,
        "root_name": root.name,
        "descendant_count": len(descendants),
        "bac_cost": float(total_bac),
        "planned_value": float(total_pv),
        "earned_value": float(total_ev),
        "actual_cost": float(total_ac),
        **variances,
    }


# ============================================================================
# S-Curve Data Generation
# ============================================================================

def generate_s_curve_data(root_node_id: UUID, db: Session,
                          period_days: int = 7) -> Dict[str, any]:
    """Generate time-phased S-Curve data points for a project.

    Produces periodic data points showing cumulative PV, EV, and AC
    over the project timeline.  The period interval defaults to 7 days
    (weekly) but can be adjusted.

    For each period, PV is calculated based on the planned schedule
    (pro-rata distribution of BAC across the planned duration), EV is
    calculated using the node's EVM technique, and AC is read from
    the actual cost field.

    Parameters
    ----------
    root_node_id : UUID
        UUID of the root project node.
    db : Session
        Database session.
    period_days : int
        Number of days between data points (default 7 for weekly).

    Returns
    -------
    dict
        S-Curve data containing:
        - ``project_id``: UUID of the root node
        - ``project_name``: Name of the project
        - ``start_date``: Project start date (ISO format)
        - ``end_date``: Project end date (ISO format)
        - ``total_bac``: Total BAC
        - ``total_pv``: Total PV
        - ``total_ev``: Total EV
        - ``total_ac``: Total AC
        - ``curve_points``: List of time-phased data points
    """
    root = db.query(PortfolioNode).filter(PortfolioNode.id == root_node_id).first()
    if root is None:
        raise ValueError(f"PortfolioNode {root_node_id} not found")

    root_path = root.path
    descendants = db.query(PortfolioNode).filter(
        PortfolioNode.path.like(root_path + ".%")
        | (PortfolioNode.path == root_path)
    ).all()

    if not descendants:
        return {
            "project_id": str(root_node_id),
            "project_name": root.name,
            "start_date": "",
            "end_date": "",
            "total_bac": 0.0,
            "total_pv": 0.0,
            "total_ev": 0.0,
            "total_ac": 0.0,
            "curve_points": [],
        }

    # Determine project date range
    start_dates = [
        d.planned_start_date.date()
        for d in descendants
        if d.planned_start_date is not None
    ]
    end_dates = [
        d.planned_end_date.date()
        for d in descendants
        if d.planned_end_date is not None
    ]

    if not start_dates or not end_dates:
        # Fallback: use current date range
        today = date.today()
        project_start = today - timedelta(days=30)
        project_end = today + timedelta(days=90)
    else:
        project_start = min(start_dates)
        project_end = max(end_dates)

    # Aggregate total EVM values
    total_bac = Decimal("0.00")
    total_pv = Decimal("0.00")
    total_ev = Decimal("0.00")
    total_ac = Decimal("0.00")

    for node in descendants:
        total_bac += _safe_decimal(node.bac_cost)
        total_pv += _safe_decimal(node.planned_value)
        total_ev += _safe_decimal(node.earned_value)
        total_ac += _safe_decimal(node.actual_cost)

    # Generate time-phased data points
    curve_points = []
    current_date = project_start
    total_duration = (project_end - project_start).days

    while current_date <= project_end:
        # Calculate cumulative PV at this date (pro-rata)
        if total_duration > 0:
            elapsed = (current_date - project_start).days
            progress_fraction = min(Decimal(str(elapsed)) / Decimal(str(total_duration)),
                                    Decimal("1.0"))
            cumulative_pv = total_bac * progress_fraction
        else:
            cumulative_pv = total_bac

        # EV and AC are read from current state (not time-phased)
        # In a full implementation, these would be read from historical snapshots
        cumulative_ev = total_ev
        cumulative_ac = total_ac

        curve_points.append({
            "period_date": current_date.isoformat(),
            "planned_value": float(cumulative_pv.quantize(Decimal("0.01"),
                                                          rounding=ROUND_HALF_UP)),
            "earned_value": float(cumulative_ev),
            "actual_cost": float(cumulative_ac),
        })

        current_date += timedelta(days=period_days)

    return {
        "project_id": str(root_node_id),
        "project_name": root.name,
        "start_date": project_start.isoformat(),
        "end_date": project_end.isoformat(),
        "total_bac": float(total_bac),
        "total_pv": float(total_pv),
        "total_ev": float(total_ev),
        "total_ac": float(total_ac),
        "curve_points": curve_points,
    }


# ============================================================================
# Milestone Weight Step Management
# ============================================================================

def validate_milestone_weights(node_id: UUID, db: Session) -> Tuple[bool, str]:
    """Validate that milestone weight steps sum to 1.0.

    Parameters
    ----------
    node_id : UUID
        UUID of the PortfolioNode.
    db : Session
        Database session.

    Returns
    -------
    tuple[bool, str]
        (is_valid, message) — True if weights sum to 1.0, False otherwise
        with an explanatory message.
    """
    steps = db.query(MilestoneWeightStep).filter(
        MilestoneWeightStep.portfolio_node_id == node_id
    ).all()

    if not steps:
        return False, "No milestone weight steps defined for this task"

    total_weight = sum(
        float(_safe_decimal(step.weight_fraction)) for step in steps
    )

    if abs(total_weight - 1.0) > 0.001:
        return False, (
            f"Milestone weights sum to {total_weight:.3f}, must equal 1.000"
        )

    return True, "Milestone weights are valid"


def verify_milestone_step(step_id: UUID, user_id: int,
                           db: Session) -> Dict[str, any]:
    """Verify a milestone step as passed and recalculate EV.

    Parameters
    ----------
    step_id : UUID
        UUID of the MilestoneWeightStep to verify.
    user_id : int
        ID of the user performing the verification.
    db : Session
        Database session.

    Returns
    -------
    dict
        Updated milestone step data and recalculated EV.

    Raises
    ------
    ValueError
        If the step is not found.
    """
    step = db.query(MilestoneWeightStep).filter(
        MilestoneWeightStep.id == step_id
    ).first()

    if step is None:
        raise ValueError(f"MilestoneWeightStep {step_id} not found")

    step.is_verified_passed = True
    step.verified_at = datetime.now(timezone.utc)
    step.verified_by_user_id = user_id

    # Recalculate EV for the parent task
    node = db.query(PortfolioNode).filter(
        PortfolioNode.id == step.portfolio_node_id
    ).first()

    if node and node.evm_technique == EVMTechnique.MILESTONE_WEIGHTS:
        ev = _ev_milestone_weights(node, _safe_decimal(node.bac_cost), db)
        node.earned_value = ev

    db.flush()

    return {
        "step_id": str(step_id),
        "step_name": step.step_name,
        "is_verified_passed": step.is_verified_passed,
        "verified_at": step.verified_at.isoformat() if step.verified_at else None,
        "verified_by_user_id": step.verified_by_user_id,
        "earned_value": float(node.earned_value) if node and node.earned_value else None,
    }
