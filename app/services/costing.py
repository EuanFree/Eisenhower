"""Costing engine for the Cost Breakdown Structure (CBS), indirect rate burdening,
and non-linear time-phased cost distribution.

This module implements the financial calculation layer for the Eisenhower Portfolio
Manager.  It converts direct labour costs into fully-burdened costs using the
Forward Pricing Rate Agreement (FPRA) burdening cascade and provides multi-tier
financial rollups across the WBS hierarchy.

Core Concepts
-------------

1. **Direct Labour Cost** — The raw cost of labour before any indirect rates
   are applied.  Calculated as hours × hourly rate from ResourceAssignment
   records.

2. **FPRA Burdening Cascade** — A four-step multiplicative formula that
   converts direct labour into fully-burdened cost::

       Labor_Burdened = Direct × (1 + Fringe) × (1 + Overhead) × (1 + G&A) × (1 + Fee)

   Each layer builds on the previous one, so the final amount includes
   all indirect costs plus the contractor's fee/profit margin.

3. **Cost Elements** — The CBS taxonomy defines cost types (LABOR_DIRECT,
   SUBCONTRACT, MATERIAL_RAW, ODC_TRAVEL, etc.).  Only LABOR category
   elements receive the full burdening cascade; other categories pass
   through at their direct value.

4. **Task Cost Ledger** — The transactional record of each cost element's
   contribution to each task.  The ledger stores both the direct (unburdened)
   and fully-burdened amounts for audit and reporting.

5. **CBS Rollup** — Using ltree parent-path containment queries, the engine
   recursively aggregates TaskCostLedger entries from leaf-level tasks up
   through Work Package, Project, and Programme levels.

6. **Non-linear Time-phased Cost Distribution** — Instead of flat linear
   spending across a task's duration, cost is distributed using statistical
   curves (Beta, Weibull, Rayleigh) that model real-world spend patterns
   such as ramp-up, peak, and tail-off phases.

Functions
---------

- :func:`apply_burden` — Apply the FPRA burdening cascade to a direct labour amount.
- :func:`calculate_task_burden` — Compute the full cost breakdown for a single task.
- :func:`cbs_rollup` — Recursively roll up costs across the WBS hierarchy.
- :func:`calculate_time_phased_cost` — Distribute a budget across days using
  non-linear statistical curves.
"""

import math
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP, ROUND_HALF_EVEN
from enum import Enum
from typing import List, Dict, Optional, Tuple
from uuid import UUID
from sqlalchemy import select, func
from sqlalchemy.orm import Session, joinedload
from app.models.models import (
    PortfolioNode, ResourceAssignment, CostElement, CostElementCategory,
    IndirectRateStructure, TaskCostLedger,
)
from app.services.currency import convert_ledger_to_base_currency


class CostSpreadMethod(str, Enum):
    """Non-linear cost distribution profiles for time-phased spending.

    Replaces flat linear time-phasing with statistical curves that model
    real-world expenditure patterns across a task's lifecycle.

    Members
    -------
    LINEAR
        Flat rate per day.  The deprecated default; retained for backward
        compatibility.

    BETA_DISTRIBUTION
        Standard NASA/DoD S-curve.  Models programmes that start slowly,
        accelerate through a peak, then taper off.  The probability density
        function is::

            f(t) = C · t^(α-1) · (1-t)^(β-1)

        where ``α`` and ``β`` are derived from ``shape_factor`` and ``C``
        is the normalising constant (1/Beta(α, β)).

    WEIBULL_CURVE
        Models engineering research and build ramp-up with rapid tail-off.
        The PDF is::

            f(t) = (k/λ) · (t/λ)^(k-1) · exp(-(t/λ)^k)

        where ``k`` (shape) is derived from ``shape_factor`` and ``λ``
        (scale) normalises the support to [0, 1].

    RAYLEIGH
        Early-peaked distribution for high-concurrency systems design
        phases.  The PDF is::

            f(t) = t/σ² · exp(-t²/(2σ²))

        where ``σ`` (scale) is derived from ``shape_factor``.
    """

    LINEAR = "LINEAR"
    BETA_DISTRIBUTION = "BETA_DISTRIBUTION"
    WEIBULL_CURVE = "WEIBULL_CURVE"
    RAYLEIGH = "RAYLEIGH"


def _beta_function(a: float, b: float) -> float:
    """Compute the Beta function B(a, b) using logarithms for numerical stability.

    B(a, b) = Γ(a)·Γ(b) / Γ(a+b)

    Parameters
    ----------
    a, b : float
        Shape parameters (must be positive).

    Returns
    -------
    float
        The Beta function value.
    """
    return math.exp(math.lgamma(a) + math.lgamma(b) - math.lgamma(a + b))


def _beta_pdf(t: float, alpha: float, beta: float) -> float:
    """Evaluate the Beta probability density at normalised time ``t`` in [0, 1].

    Parameters
    ----------
    t : float
        Normalised time position in [0, 1].
    alpha, beta : float
        Shape parameters.

    Returns
    -------
    float
        The un-normalised PDF value at ``t``.
    """
    if t <= 0.0:
        t = 1e-15
    if t >= 1.0:
        t = 1.0 - 1e-15
    return (t ** (alpha - 1.0)) * ((1.0 - t) ** (beta - 1.0)) / _beta_function(alpha, beta)


def _weibull_pdf(t: float, k: float, lam: float) -> float:
    """Evaluate the Weibull probability density at normalised time ``t`` in [0, 1].

    Parameters
    ----------
    t : float
        Normalised time position in [0, 1].
    k : float
        Shape parameter (must be positive).
    lam : float
        Scale parameter (must be positive).

    Returns
    -------
    float
        The PDF value at ``t``.
    """
    if t <= 0.0:
        return 0.0
    ratio = t / lam
    return (k / lam) * (ratio ** (k - 1.0)) * math.exp(-(ratio ** k))


def _rayleigh_pdf(t: float, sigma: float) -> float:
    """Evaluate the Rayleigh probability density at normalised time ``t`` in [0, 1].

    Parameters
    ----------
    t : float
        Normalised time position in [0, 1].
    sigma : float
        Scale parameter (must be positive).

    Returns
    -------
    float
        The PDF value at ``t``.
    """
    if t <= 0.0:
        return 0.0
    return (t / (sigma ** 2)) * math.exp(-(t ** 2) / (2.0 * sigma ** 2))


def calculate_time_phased_cost(
    total_budget: Decimal,
    duration_days: int,
    method: CostSpreadMethod,
    shape_factor: float = 2.0,
) -> List[Decimal]:
    """Distribute a total budget across individual days using a non-linear curve.

    Replaces flat linear time-phasing with statistical distributions that
    model real-world spend patterns.  The returned list has exactly
    ``duration_days`` elements whose sum equals ``total_budget`` to cent
    precision (no rounding drift).

    Algorithm
    ---------

    1. Evaluate the chosen PDF at each day's normalised position
       ``t = (i + 0.5) / duration_days`` for ``i`` in ``0 .. duration_days-1``.
       The midpoint rule avoids zero-density at the boundaries.

    2. Compute raw daily fractions as ``pdf(t_i) / sum(pdf(t_j))`` so the
       fractions sum to exactly 1.0.

    3. Multiply each fraction by ``total_budget`` and round to two decimal
       places using ``ROUND_HALF_UP``.

    4. Distribute any remaining rounding residual (at most ±1 cent) to the
       day with the largest unrounded remainder, guaranteeing the integral
       sum matches 100.00 % of BAC without drift.

    Parameters
    ----------
    total_budget : Decimal
        The Budget at Completion (BAC) to distribute.
    duration_days : int
        Number of calendar days spanning the task.
    method : CostSpreadMethod
        The distribution curve to use.
    shape_factor : float
        Curve shape parameter.  Interpretation depends on the method:

        - **BETA_DISTRIBUTION**: Both α and β are set to ``shape_factor``,
          producing a symmetric S-curve when ``shape_factor > 1``.
        - **WEIBULL_CURVE**: ``k = shape_factor``, ``λ = 1.0``.
        - **RAYLEIGH**: ``σ = 1.0 / shape_factor``.
        - **LINEAR**: Ignored.

    Returns
    -------
    list[Decimal]
        A list of length ``duration_days`` containing the daily cost allocation.
        The sum of all elements equals ``total_budget`` exactly.

    Raises
    ------
    ValueError
        If ``duration_days`` is less than 1 or ``total_budget`` is negative.
    """
    budget = Decimal(str(total_budget))
    if budget < 0:
        raise ValueError("total_budget must be non-negative")
    if duration_days < 1:
        raise ValueError("duration_days must be at least 1")

    if duration_days == 1:
        return [budget]

    # Step 1: Evaluate PDF at each day midpoint
    pdf_values: List[float] = []

    for i in range(duration_days):
        t = (i + 0.5) / duration_days

        if method == CostSpreadMethod.LINEAR:
            pdf_values.append(1.0)
        elif method == CostSpreadMethod.BETA_DISTRIBUTION:
            alpha = shape_factor
            beta_param = shape_factor
            pdf_values.append(_beta_pdf(t, alpha, beta_param))
        elif method == CostSpreadMethod.WEIBULL_CURVE:
            k = shape_factor
            lam = 1.0
            pdf_values.append(_weibull_pdf(t, k, lam))
        elif method == CostSpreadMethod.RAYLEIGH:
            sigma = 1.0 / shape_factor
            pdf_values.append(_rayleigh_pdf(t, sigma))
        else:
            pdf_values.append(1.0)

    # Step 2: Normalise so fractions sum to 1.0
    pdf_sum = sum(pdf_values)
    if pdf_sum <= 0.0:
        # Fallback to uniform if all PDF values are zero
        fractions = [1.0 / duration_days] * duration_days
    else:
        fractions = [v / pdf_sum for v in pdf_values]

    # Step 3: Compute unrounded daily amounts using high-precision Decimal
    # Convert fractions to Decimal with full float precision to minimise drift
    unrounded = [Decimal(repr(f)) * budget for f in fractions]

    # Step 4: Round to cents
    rounded = [
        u.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) for u in unrounded
    ]

    # Step 5: Fix rounding drift — distribute residual cent-by-cent to the
    # days with the largest remainders, so the sum matches exactly.
    target = budget.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    current_sum = sum(rounded)
    residual = target - current_sum

    if residual != Decimal("0"):
        # Build (remainder, index) pairs sorted by remainder descending
        remainders = [
            (abs(u - r), i) for i, (u, r) in enumerate(zip(unrounded, rounded))
        ]
        remainders.sort(key=lambda x: x[0], reverse=True)

        one_cent = Decimal("0.01")
        # Distribute the residual one cent at a time
        steps = int(abs(residual) / one_cent)
        sign = 1 if residual > 0 else -1

        for step in range(steps):
            idx = remainders[step % len(remainders)][1]
            rounded[idx] += sign * one_cent

    return rounded


def apply_burden(
    direct_amount: Decimal,
    fringe_rate: Decimal,
    overhead_rate: Decimal,
    ga_rate: Decimal,
    fee_rate: Decimal,
) -> Decimal:
    """Apply the FPRA burdening cascade to a direct labour amount.

    The burdening formula converts direct labour cost into fully-burdened
    cost by applying four multiplicative layers:

    1. Fringe benefits (employer-paid pension, health insurance, holiday pay)
    2. Overhead (department-level indirect costs)
    3. General & Administrative (corporate-level indirect costs)
    4. Fee / Profit (contractor's negotiated margin)

    Parameters
    ----------
    direct_amount : Decimal
        The raw direct labour cost before any indirect rates.
    fringe_rate : Decimal
        Fringe benefit rate as a percentage (e.g., 35.0 for 35%).
    overhead_rate : Decimal
        Overhead rate as a percentage (e.g., 50.0 for 50%).
    ga_rate : Decimal
        General & Administrative rate as a percentage (e.g., 12.0 for 12%).
    fee_rate : Decimal
        Fee / profit margin as a percentage (e.g., 10.0 for 10%).

    Returns
    -------
    Decimal
        The fully-burdened labour cost.

    Example
    -------

    >>> apply_burden(Decimal("100000"), Decimal("35.0"), Decimal("50.0"), Decimal("12.0"), Decimal("10.0"))
    Decimal('249480.000000')

    Step-by-step::

        Step 1: 100,000 × 1.35 = 135,000  (after fringe)
        Step 2: 135,000 × 1.50 = 202,500  (after overhead)
        Step 3: 202,500 × 1.12 = 226,800  (after G&A)
        Step 4: 226,800 × 1.10 = 249,480  (fully burdened)
    """
    amount = Decimal(str(direct_amount))
    amount *= (Decimal("1") + Decimal(str(fringe_rate)) / Decimal("100"))
    amount *= (Decimal("1") + Decimal(str(overhead_rate)) / Decimal("100"))
    amount *= (Decimal("1") + Decimal(str(ga_rate)) / Decimal("100"))
    amount *= (Decimal("1") + Decimal(str(fee_rate)) / Decimal("100"))
    return amount


def get_active_rate_structure(db: Session, fiscal_year: int) -> Optional[IndirectRateStructure]:
    """Look up the active FPRA indirect rate structure for a fiscal year.

    Parameters
    ----------
    db : Session
        Active SQLAlchemy database session.
    fiscal_year : int
        The fiscal year to look up (e.g., 2026).

    Returns
    -------
    IndirectRateStructure or None
        The rate structure for the given fiscal year, or None if not found.
    """
    result = db.execute(
        select(IndirectRateStructure)
        .where(IndirectRateStructure.fiscal_year == fiscal_year)
        .order_by(IndirectRateStructure.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def calculate_task_burden(
    task_id: UUID,
    fiscal_year: int,
    db: Session,
) -> Dict:
    """Compute the full cost breakdown for a single task.

    This function reads all ResourceAssignment records for the given task,
    calculates direct labour costs from hours × rate_snapshot, applies the
    fiscal year's active FPRA indirect rate structure, and persists the
    results in the TaskCostLedger table.

    The algorithm:

    1. Look up the active FPRA for the given fiscal year.
    2. Query all ResourceAssignments for the task's PortfolioNode.
    3. For each assignment, compute direct labour cost
       (planned_hours × rate_snapshot).
    4. Apply the burdening cascade to produce the fully-burdened amount.
    5. Upsert the TaskCostLedger entry for the LABOR_DIRECT cost element.
    6. Return the complete cost breakdown with all tiers.

    Parameters
    ----------
    task_id : UUID
        The UUID of the PortfolioNode (task) to calculate.
    fiscal_year : int
        The fiscal year for the FPRA rate lookup.
    db : Session
        Active SQLAlchemy database session.

    Returns
    -------
    dict
        A dictionary containing:

        - ``task_id`` (str): The task UUID.
        - ``task_name`` (str): Human-readable task name.
        - ``fiscal_year`` (int): Fiscal year used.
        - ``currency_code`` (str): Currency code from the FPRA.
        - ``ledger_entries`` (list): Individual cost element breakdown lines.
        - ``total_direct`` (float): Sum of all direct (unburdened) amounts.
        - ``total_burdened`` (float): Sum of all fully-burdened amounts.
        - ``burden_difference`` (float): Total indirect cost added.

    Raises
    ------
    ValueError
        If no FPRA rate structure is found for the given fiscal year.
    """
    # Step 1: Look up the active FPRA
    rate_structure = get_active_rate_structure(db, fiscal_year)
    if rate_structure is None:
        raise ValueError(
            f"No FPRA indirect rate structure found for fiscal year {fiscal_year}"
        )

    # Step 2: Get the task node
    task_node = db.get(PortfolioNode, task_id)
    if task_node is None:
        raise ValueError(f"PortfolioNode {task_id} not found")

    # Step 3: Query all ResourceAssignments for this task
    assignments_result = db.execute(
        select(ResourceAssignment)
        .where(ResourceAssignment.portfolio_node_id == task_id)
    )
    assignments = assignments_result.scalars().all()

    # Step 4: Find or create the LABOR_DIRECT cost element
    labor_element_result = db.execute(
        select(CostElement)
        .where(CostElement.code == "LABOR_DIRECT")
    )
    labor_element = labor_element_result.scalar_one_or_none()

    if labor_element is None:
        labor_element = CostElement(
            code="LABOR_DIRECT",
            name="Direct Labour",
            category=CostElementCategory.LABOR,
        )
        db.add(labor_element)
        db.flush()

    # Step 5: Calculate direct labour from assignments
    total_direct = Decimal("0")
    for assignment in assignments:
        hours = Decimal(str(assignment.planned_hours))
        rate = Decimal(str(assignment.rate_snapshot))
        direct = hours * rate
        total_direct += direct

    # Step 6: Apply burdening cascade
    total_burdened = apply_burden(
        total_direct,
        rate_structure.fringe_rate_percent,
        rate_structure.overhead_rate_percent,
        rate_structure.ga_rate_percent,
        rate_structure.fee_profit_percent,
    )

    # Step 7: Upsert the TaskCostLedger entry
    existing = db.execute(
        select(TaskCostLedger).where(
            TaskCostLedger.portfolio_node_id == task_id,
            TaskCostLedger.cost_element_id == labor_element.id,
            TaskCostLedger.fiscal_year == fiscal_year,
        )
    ).scalar_one_or_none()

    if existing is None:
        ledger_entry = TaskCostLedger(
            portfolio_node_id=task_id,
            cost_element_id=labor_element.id,
            fiscal_year=fiscal_year,
            direct_unburdened_amount=total_direct.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
            fully_burdened_amount=total_burdened.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        )
        db.add(ledger_entry)
    else:
        existing.direct_unburdened_amount = total_direct.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        existing.fully_burdened_amount = total_burdened.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    db.flush()

    # Step 8: Build the response
    ledger_entries = [
        {
            "cost_element_code": labor_element.code,
            "cost_element_name": labor_element.name,
            "category": labor_element.category,
            "direct_unburdened_amount": float(total_direct.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
            "fully_burdened_amount": float(total_burdened.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        }
    ]

    return {
        "task_id": str(task_id),
        "task_name": task_node.name,
        "fiscal_year": fiscal_year,
        "currency_code": rate_structure.currency_code,
        "ledger_entries": ledger_entries,
        "total_direct": float(total_direct.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        "total_burdened": float(total_burdened.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        "burden_difference": float(
            (total_burdened - total_direct).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        ),
    }


def cbs_rollup(
    project_id: UUID,
    fiscal_year: int,
    db: Session,
) -> Dict:
    """Recursively compute multi-tier CBS financial rollups using ltree paths.

    This function aggregates TaskCostLedger entries from all descendants
    of the given root node, grouping costs by WBS hierarchy level and
    by cost element category.

    The algorithm:

    1. Look up the active FPRA for the given fiscal year.
    2. Find the root node and its ltree path.
    3. Query all PortfolioNodes whose path is contained within the root's path
       (ltree containment operator @>).
    4. For each node, query its TaskCostLedger entries for the fiscal year.
    5. Group costs by outline level (depth in the WBS tree).
    6. Within each level, break down costs by category.
    7. Calculate percentage-of-total for each category.

    Parameters
    ----------
    project_id : UUID
        The UUID of the root PortfolioNode (project/programme).
    fiscal_year : int
        The fiscal year for the rollup.
    db : Session
        Active SQLAlchemy database session.

    Returns
    -------
    dict
        A dictionary containing:

        - ``project_id`` (str): Root node UUID.
        - ``project_name`` (str): Root node name.
        - ``fiscal_year`` (int): Fiscal year.
        - ``currency_code`` (str): Currency code from the FPRA.
        - ``levels`` (list): Hierarchical rollup from root to leaf levels.
        - ``grand_total_direct`` (float): Grand total of all direct costs.
        - ``grand_total_burdened`` (float): Grand total of all fully-burdened costs.

    Raises
    ------
    ValueError
        If no FPRA rate structure is found for the given fiscal year.
    """
    # Step 1: Look up the active FPRA
    rate_structure = get_active_rate_structure(db, fiscal_year)
    if rate_structure is None:
        raise ValueError(
            f"No FPRA indirect rate structure found for fiscal year {fiscal_year}"
        )

    # Step 2: Get the root node
    root_node = db.get(PortfolioNode, project_id)
    if root_node is None:
        raise ValueError(f"PortfolioNode {project_id} not found")

    # Step 3: Find all descendant nodes using ltree containment
    # The path column stores the ltree path (e.g., '1.2.3')
    # We use string-based containment since SQLite doesn't support ltree operators
    root_path = root_node.path or ""
    
    # Query all portfolio nodes that are descendants of the root
    all_nodes_result = db.execute(select(PortfolioNode))
    all_nodes = all_nodes_result.scalars().all()

    # Filter to descendants (nodes whose path starts with the root's path)
    descendants = []
    for node in all_nodes:
        if node.path and node.path.startswith(root_path):
            descendants.append(node)

    if not descendants:
        descendants = [root_node]

    # Step 4: Query all TaskCostLedger entries for these nodes
    descendant_ids = [n.id for n in descendants]
    
    if descendant_ids:
        ledger_result = db.execute(
            select(TaskCostLedger)
            .join(CostElement)
            .where(
                TaskCostLedger.portfolio_node_id.in_(descendant_ids),
                TaskCostLedger.fiscal_year == fiscal_year,
            )
        )
        ledgers = ledger_result.scalars().all()
    else:
        ledgers = []

    # Step 5: Build a node lookup map
    node_map = {n.id: n for n in descendants}

    # Step 6: Group by node, then by category
    # node_id -> category -> (direct, burdened)
    # Convert foreign-currency ledger entries to the project's base currency
    node_category_costs: Dict[UUID, Dict[str, Tuple[Decimal, Decimal]]] = {}

    # Determine the project's base currency from the root node
    project_base_currency = root_node.currency_code or "GBP"
    valuation_date = date.today()

    for ledger in ledgers:
        node_id = ledger.portfolio_node_id
        category = ledger.cost_element.category.value

        if node_id not in node_category_costs:
            node_category_costs[node_id] = {}

        if category not in node_category_costs[node_id]:
            node_category_costs[node_id][category] = (Decimal("0"), Decimal("0"))

        # Convert to base currency if the node uses a different currency
        direct_amount, burdened_amount = convert_ledger_to_base_currency(
            ledger, project_base_currency, valuation_date, db
        )

        prev_direct, prev_burdened = node_category_costs[node_id][category]
        node_category_costs[node_id][category] = (
            prev_direct + direct_amount,
            prev_burdened + burdened_amount,
        )

    # Step 7: Group by outline level
    # outline_level -> list of (node, category_costs)
    level_data: Dict[int, List] = {}
    
    for node in descendants:
        outline_level = len(node.path.split(".")) if node.path else 1
        
        if outline_level not in level_data:
            level_data[outline_level] = []
        
        # Aggregate all descendant costs for this node
        category_totals: Dict[str, Tuple[Decimal, Decimal]] = {}
        
        for desc_node in descendants:
            desc_path = desc_node.path or ""
            node_path = node.path or ""
            # Check if desc_node is a descendant of (or equal to) node
            if desc_path.startswith(node_path) and desc_node.id in node_category_costs:
                for cat, (direct, burdened) in node_category_costs[desc_node.id].items():
                    if cat not in category_totals:
                        category_totals[cat] = (Decimal("0"), Decimal("0"))
                    prev_d, prev_b = category_totals[cat]
                    category_totals[cat] = (prev_d + direct, prev_b + burdened)
        
        level_data[outline_level].append({
            "node": node,
            "category_costs": category_totals,
        })

    # Step 8: Calculate grand totals
    grand_direct = Decimal("0")
    grand_burdened = Decimal("0")
    
    for node_entries in level_data.values():
        for entry in node_entries:
            for cat_costs in entry["category_costs"].values():
                grand_direct += cat_costs[0]
                grand_burdened += cat_costs[1]

    # Step 9: Build the response
    levels = []
    for level_num in sorted(level_data.keys()):
        level_entries = level_data[level_num]
        
        for entry in level_entries:
            node = entry["node"]
            category_costs = entry["category_costs"]
            
            # Calculate node totals
            node_direct = sum(d for d, _ in category_costs.values())
            node_burdened = sum(b for _, b in category_costs.values())
            
            # Build category breakdown
            category_breakdown = []
            for cat, (direct, burdened) in sorted(category_costs.items()):
                pct = (
                    (burdened / grand_burdened * Decimal("100"))
                    if grand_burdened > 0
                    else Decimal("0")
                )
                category_breakdown.append({
                    "category": cat,
                    "total_direct": float(direct.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
                    "total_burdened": float(burdened.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
                    "percentage_of_total": float(pct.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
                })
            
            levels.append({
                "node_id": str(node.id),
                "node_name": node.name,
                "node_code": node.code,
                "outline_level": level_num,
                "total_direct": float(node_direct.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
                "total_burdened": float(node_burdened.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
                "category_breakdown": category_breakdown,
            })

    return {
        "project_id": str(project_id),
        "project_name": root_node.name,
        "fiscal_year": fiscal_year,
        "currency_code": rate_structure.currency_code,
        "levels": levels,
        "grand_total_direct": float(grand_direct.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        "grand_total_burdened": float(grand_burdened.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
    }
