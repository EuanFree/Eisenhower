"""Schedule Risk Analysis (SRA) Monte Carlo simulation engine.

This module implements stochastic schedule risk analysis using Monte Carlo
simulation.  Instead of relying on a single deterministic duration for each
activity, the engine samples from probability distributions (Beta-PERT or
Triangular) thousands of times to build a cumulative distribution of possible
project finish dates.

Algorithm Overview
------------------

1. **DAG Construction**: Build the same networkx DAG used by the CPM engine
   from PortfolioNode records and DependencyLink edges.

2. **Topological Sort**: Determine the processing order so that forward and
   backward passes can be executed efficiently.

3. **Monte Carlo Loop**: For each iteration:

   a. Sample a duration for every activity from its configured distribution.
   b. Execute a fast forward pass to compute Early Start (ES) and Early
      Finish (EF) dates, skipping weekends.
   c. Execute a fast backward pass to compute Late Start (LS) and Late
      Finish (LF) dates.
   d. Identify which activities are on the critical path (Total Float ≤ 0)
      in this specific iteration.
   e. Record the project finish date and per-activity critical-path membership.

4. **Percentile Computation**: From the distribution of project finish dates,
   compute P50 (median), P80 (standard defence baseline), and P90 (high
   confidence) completion dates.

5. **Criticality Index**: For each activity, calculate the fraction of
   iterations in which it appeared on the critical path.  A high index
   (e.g., > 0.8) means the activity is persistently critical even if its
   deterministic Total Float is positive.

Beta-PERT Sampling
~~~~~~~~~~~~~~~~~~

For a Beta-PERT distribution with optimistic (O), most-likely (M), and
pessimistic (P) estimates:

    α = 1 + 4 × (M - O) / (P - O)
    β = 1 + 4 × (P - M) / (P - O)
    d = O + Beta(α, β) × (P - O)

This gives the most-likely estimate four times the weight of the extremes,
following the standard PERT convention used in defence programme management.

Triangular Sampling
~~~~~~~~~~~~~~~~~~~

For a Triangular distribution, the engine samples uniformly and applies
the inverse CDF of the triangular distribution defined by (O, M, P).

Dependencies
~~~~~~~~~~~~

The simulation requires CPM to have been calculated first so that the DAG
structure and dependency links are available.  If an activity does not have
an ActivityDurationDistribution record, the engine falls back to using the
deterministic duration from the CPM calculation.
"""
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple
from uuid import UUID

import numpy as np
import networkx as nx
from scipy import stats
from sqlalchemy.orm import Session

from app.models.models import (
    ActivityDurationDistribution,
    DependencyLink,
    DependencyType,
    DistributionType,
    PortfolioNode,
)


# ============================================================================
# Working calendar helpers (mirrored from cpm_engine for independence)
# ============================================================================

def _is_workday(dt: datetime) -> bool:
    """Return True if *dt* falls on a weekday (Mon–Fri)."""
    return dt.weekday() < 5


def _add_workdays(start: datetime, days: float) -> datetime:
    """Add *days* working days to *start*, skipping weekends.

    Parameters
    ----------
    start : datetime
        The starting date.
    days : float
        Number of working days to add (may be fractional).

    Returns
    -------
    datetime
        The resulting date after adding the specified working days.
    """
    if days <= 0:
        return start

    current = start
    remaining = days
    while remaining > 0:
        current += timedelta(days=1)
        if _is_workday(current):
            remaining -= 1
    return current


def _subtract_workdays(start: datetime, days: float) -> datetime:
    """Subtract *days* working days from *start*, skipping weekends.

    Parameters
    ----------
    start : datetime
        The starting date.
    days : float
        Number of working days to subtract.

    Returns
    -------
    datetime
        The resulting date after subtracting the specified working days.
    """
    if days <= 0:
        return start

    current = start
    remaining = days
    while remaining > 0:
        current -= timedelta(days=1)
        if _is_workday(current):
            remaining -= 1
    return current


def _workday_diff(start: datetime, end: datetime) -> int:
    """Count working days between *start* and *end*.

    Parameters
    ----------
    start : datetime
        The start date (exclusive).
    end : datetime
        The end date (inclusive).

    Returns
    -------
    int
        The number of working days between the two dates.
    """
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
# Distribution sampling
# ============================================================================

def _sample_beta_pert(
    optimistic: float,
    most_likely: float,
    pessimistic: float,
    rng: np.random.Generator,
) -> float:
    """Sample a duration from a Beta-PERT distribution.

    The Beta-PERT distribution is the standard distribution used in
    Programme Evaluation and Review Technique (PERT) analysis.  It maps
    three-point estimates to a Beta distribution scaled to the
    [optimistic, pessimistic] range.

    Parameters
    ----------
    optimistic : float
        Best-case duration estimate (O).
    most_likely : float
        Most probable duration estimate (M, the mode).
    pessimistic : float
        Worst-case duration estimate (P).
    rng : np.random.Generator
        NumPy random number generator for reproducibility.

    Returns
    -------
    float
        A sampled duration value.

    Notes
    -----
    The shape parameters are computed as::

        α = 1 + 4 × (M - O) / (P - O)
        β = 1 + 4 × (P - M) / (P - O)

    When O == P (zero-range distribution), the function returns O directly.
    """
    # Handle degenerate case where all estimates are the same
    if pessimistic <= optimistic:
        return optimistic

    alpha = 1 + 4 * (most_likely - optimistic) / (pessimistic - optimistic)
    beta = 1 + 4 * (pessimistic - most_likely) / (pessimistic - optimistic)

    # Sample from Beta distribution and scale to [O, P]
    sample = rng.beta(alpha, beta)
    duration = optimistic + sample * (pessimistic - optimistic)
    return duration


def _sample_triangular(
    optimistic: float,
    most_likely: float,
    pessimistic: float,
    rng: np.random.Generator,
) -> float:
    """Sample a duration from a Triangular distribution.

    The triangular distribution is a simple continuous distribution
    defined by three parameters: the lower bound (optimistic), the
    mode (most-likely), and the upper bound (pessimistic).

    Parameters
    ----------
    optimistic : float
        Lower bound of the distribution.
    most_likely : float
        Mode of the distribution.
    pessimistic : float
        Upper bound of the distribution.
    rng : np.random.Generator
        NumPy random number generator.

    Returns
    -------
    float
        A sampled duration value.
    """
    if pessimistic <= optimistic:
        return optimistic

    # Use scipy's triangular distribution
    # scipy.stats.triangular uses a shape parameter 'c' = (mode - loc) / (scale - loc)
    c = (most_likely - optimistic) / (pessimistic - optimistic)
    sample = rng.triangular(c, optimistic, pessimistic - optimistic)
    return optimistic + sample


def sample_duration(
    dist: Optional[ActivityDurationDistribution],
    deterministic_duration: float,
    rng: np.random.Generator,
) -> float:
    """Sample a duration for an activity.

    If the activity has a configured ActivityDurationDistribution, sample
    from it.  Otherwise, fall back to the deterministic duration.

    Parameters
    ----------
    dist : ActivityDurationDistribution or None
        The distribution record for this activity, if available.
    deterministic_duration : float
        Fallback duration from CPM calculation.
    rng : np.random.Generator
        NumPy random number generator.

    Returns
    -------
    float
        The sampled duration in days.
    """
    if dist is None:
        return deterministic_duration

    if dist.distribution_type == DistributionType.BETA_PERT:
        return _sample_beta_pert(
            dist.optimistic_days,
            dist.most_likely_days,
            dist.pessimistic_days,
            rng,
        )
    else:
        return _sample_triangular(
            dist.optimistic_days,
            dist.most_likely_days,
            dist.pessimistic_days,
            rng,
        )


# ============================================================================
# DAG construction (reuses CPM engine pattern)
# ============================================================================

def build_schedule_dag(
    db: Session, root_id: UUID
) -> Tuple[nx.DiGraph, Dict[UUID, PortfolioNode], Dict[UUID, ActivityDurationDistribution]]:
    """Build a networkx DAG from PortfolioNode + DependencyLink for a project tree.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    root_id : UUID
        The root PortfolioNode ID for the project/programme.

    Returns
    -------
    tuple
        A 3-tuple of (graph, nodes_dict, distributions_dict) where:
        - graph: the networkx DiGraph with nodes and edges
        - nodes_dict: mapping of node_id to PortfolioNode
        - distributions_dict: mapping of node_id to ActivityDurationDistribution
    """
    from sqlalchemy import text as sa_text

    root = db.query(PortfolioNode).filter(PortfolioNode.id == root_id).first()
    if root is None:
        raise ValueError(f"PortfolioNode {root_id} not found")

    # All descendants via ltree path prefix
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

    nodes: Dict[UUID, PortfolioNode] = {}
    for row in rows:
        row_dict = dict(zip(columns, row))
        node = PortfolioNode()
        for key, value in row_dict.items():
            setattr(node, key, value)
        nodes[node.id] = node

    # Fetch duration distributions for all nodes
    dist_map: Dict[UUID, ActivityDurationDistribution] = {}
    if nodes:
        dists = (
            db.query(ActivityDurationDistribution)
            .filter(ActivityDurationDistribution.portfolio_node_id.in_(nodes.keys()))
            .all()
        )
        for d in dists:
            dist_map[d.portfolio_node_id] = d

    # Build the DAG
    graph = nx.DiGraph()
    for node_id, node in nodes.items():
        # Compute deterministic duration from planned dates
        duration = 0
        if node.planned_start_date and node.planned_end_date:
            duration = max(0, _workday_diff(node.planned_start_date, node.planned_end_date))
        graph.add_node(
            node_id,
            node=node,
            duration=duration,
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

    return graph, nodes, dist_map


# ============================================================================
# Fast forward pass (simplified for Monte Carlo — uses sampled durations)
# ============================================================================

def fast_forward_pass(
    graph: nx.DiGraph,
    durations: Dict[UUID, float],
    project_start: datetime,
) -> Dict[UUID, datetime]:
    """Execute a forward pass using sampled durations.

    This is a simplified forward pass that handles all four dependency types
    (FS, SS, FF, SF) with lag days, but operates on pre-computed sampled
    durations rather than querying the database.

    Parameters
    ----------
    graph : nx.DiGraph
        The schedule DAG.
    durations : dict
        Mapping of node_id to sampled duration in days.
    project_start : datetime
        The project start date.

    Returns
    -------
    dict
        Mapping of node_id to Early Finish datetime.
    """
    # Ensure project_start is a workday
    while not _is_workday(project_start):
        project_start += timedelta(days=1)

    early_finish: Dict[UUID, datetime] = {}

    for node_id in nx.topological_sort(graph):
        duration = durations.get(node_id, 0)
        node_obj = graph.nodes[node_id]["node"]

        # Default ES: project start
        es = project_start

        # If the node has its own planned_start_date, use it as a floor
        if node_obj.planned_start_date and node_obj.planned_start_date > es:
            es = node_obj.planned_start_date

        # Process incoming edges (predecessors)
        for pred_id, edge_data in graph.in_edges(node_id, data=True):
            dep_type = edge_data["dep_type"]
            lag = edge_data["lag_days"]

            if pred_id not in early_finish:
                continue

            pred_ef = early_finish[pred_id]

            if dep_type == DependencyType.FS:
                candidate = _add_workdays(pred_ef, lag)
                if candidate > es:
                    es = candidate

            elif dep_type == DependencyType.SS:
                pred_duration = durations.get(pred_id, 0)
                pred_es = _subtract_workdays(pred_ef, pred_duration)
                candidate = _add_workdays(pred_es, lag)
                if candidate > es:
                    es = candidate

            elif dep_type == DependencyType.FF:
                pred_ef_adj = _add_workdays(pred_ef, lag)
                if duration > 0:
                    candidate = _subtract_workdays(pred_ef_adj, duration)
                else:
                    candidate = pred_ef_adj
                if candidate > es:
                    es = candidate

            elif dep_type == DependencyType.SF:
                pred_duration = durations.get(pred_id, 0)
                pred_es = _subtract_workdays(pred_ef, pred_duration)
                pred_es_adj = _add_workdays(pred_es, lag)
                if duration > 0:
                    candidate = _subtract_workdays(pred_es_adj, duration)
                else:
                    candidate = pred_es_adj
                if candidate > es:
                    es = candidate

        early_finish[node_id] = _add_workdays(es, duration)

    return early_finish


# ============================================================================
# Fast backward pass (simplified for Monte Carlo)
# ============================================================================

def fast_backward_pass(
    graph: nx.DiGraph,
    durations: Dict[UUID, float],
    early_finish: Dict[UUID, datetime],
) -> Dict[UUID, datetime]:
    """Execute a backward pass using sampled durations.

    Parameters
    ----------
    graph : nx.DiGraph
        The schedule DAG.
    durations : dict
        Mapping of node_id to sampled duration in days.
    early_finish : dict
        Mapping of node_id to Early Finish datetime (from forward pass).

    Returns
    -------
    dict
        Mapping of node_id to Late Start datetime.
    """
    project_finish = max(early_finish.values())

    late_start: Dict[UUID, datetime] = {}

    for node_id in reversed(list(nx.topological_sort(graph))):
        duration = durations.get(node_id, 0)

        # Default LF: project finish
        lf = project_finish

        # Process outgoing edges (successors)
        for succ_id, edge_data in graph.out_edges(node_id, data=True):
            dep_type = edge_data["dep_type"]
            lag = edge_data["lag_days"]

            if succ_id not in late_start:
                continue

            succ_ls = late_start[succ_id]
            succ_duration = durations.get(succ_id, 0)
            succ_lf = _add_workdays(succ_ls, succ_duration)

            if dep_type == DependencyType.FS:
                candidate = _subtract_workdays(succ_ls, lag)
                if candidate < lf:
                    lf = candidate

            elif dep_type == DependencyType.SS:
                candidate = _subtract_workdays(succ_lf, lag)
                if candidate < lf:
                    lf = candidate

            elif dep_type == DependencyType.FF:
                candidate = _subtract_workdays(succ_lf, lag)
                if candidate < lf:
                    lf = candidate

            elif dep_type == DependencyType.SF:
                candidate = _subtract_workdays(succ_lf, succ_duration + lag)
                if candidate < lf:
                    lf = candidate

        late_start[node_id] = _subtract_workdays(lf, duration)

    return late_start


# ============================================================================
# Critical path identification for a single iteration
# ============================================================================

def identify_critical_in_iteration(
    graph: nx.DiGraph,
    early_finish: Dict[UUID, datetime],
    late_start: Dict[UUID, datetime],
    durations: Dict[UUID, float],
) -> set:
    """Identify which nodes are on the critical path in this iteration.

    A node is critical if its Total Float (LS - ES) is ≤ 0.

    Parameters
    ----------
    graph : nx.DiGraph
        The schedule DAG.
    early_finish : dict
        Early Finish dates from forward pass.
    late_start : dict
        Late Start dates from backward pass.
    durations : dict
        Sampled durations for this iteration.

    Returns
    -------
    set
        Set of node_ids that are on the critical path.
    """
    critical = set()

    for node_id in graph.nodes:
        duration = durations.get(node_id, 0)
        ef = early_finish[node_id]
        ls = late_start[node_id]
        es = _subtract_workdays(ef, duration)

        # Total Float = LS - ES (in calendar days for speed)
        tf_days = (ls - es).total_seconds() / 86400.0

        if tf_days <= 0.5:  # Allow small floating-point tolerance
            critical.add(node_id)

    return critical


# ============================================================================
# Main Monte Carlo simulation
# ============================================================================

def run_schedule_simulation(
    db: Session,
    root_node_id: UUID,
    iterations: int = 2000,
    seed: Optional[int] = None,
) -> dict:
    """Run a Monte Carlo Schedule Risk Analysis simulation.

    This is the main entry point for the SRA engine.  It builds the schedule
    DAG, samples activity durations for each iteration, performs forward and
    backward passes, and computes percentile completion dates and criticality
    indices.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    root_node_id : UUID
        The root PortfolioNode ID for the project/programme to simulate.
    iterations : int, optional
        Number of Monte Carlo iterations (default 2000).  Higher values
        produce more stable percentiles but take longer to compute.
    seed : int or None, optional
        Random seed for reproducibility.  Use a fixed seed when you need
        to reproduce exact results (e.g., for audit purposes).

    Returns
    -------
    dict
        A dictionary containing:
        - project_id: the root node UUID
        - iterations: number of iterations run
        - seed: random seed used
        - percentiles: dict with P50, P80, P90 finish dates (ISO strings)
        - criticality_indices: list of {node_id, code, name, criticality_index}
        - distribution_points: list of (percentile, date) tuples for UI curve plotting
        - project_duration_stats: dict with min, max, mean, std of project durations
        - calculated_at: ISO timestamp of when the simulation completed

    Raises
    ------
    ValueError
        If the root node is not found or if the DAG contains cycles.
    """
    # Step 1: Build DAG
    graph, nodes, dist_map = build_schedule_dag(db, root_node_id)

    if not graph.nodes:
        raise ValueError(f"No active PortfolioNodes found under project {root_node_id}")

    # Check for cycles
    if not nx.is_directed_acyclic_graph(graph):
        cycles = list(nx.simple_cycles(graph))[:3]
        cycle_strs = [" -> ".join(str(n) for n in c) for c in cycles]
        raise ValueError(
            f"Circular dependency detected in schedule. "
            f"Cycles: {'; '.join(cycle_strs)}"
        )

    # Step 2: Topological sort (done once, reused every iteration)
    topo_order = list(nx.topological_sort(graph))

    # Step 3: Determine project start date
    project_start = None
    for nid in graph.nodes:
        node_obj = graph.nodes[nid]["node"]
        if node_obj.planned_start_date:
            if project_start is None or node_obj.planned_start_date < project_start:
                project_start = node_obj.planned_start_date
    if project_start is None:
        project_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    while not _is_workday(project_start):
        project_start += timedelta(days=1)

    # Step 4: Get deterministic durations for fallback
    deterministic_durations = {nid: graph.nodes[nid]["duration"] for nid in graph.nodes}

    # Step 5: Initialize random number generator
    rng = np.random.default_rng(seed)

    # Step 6: Monte Carlo simulation loop
    project_finish_dates: List[datetime] = []
    critical_counts: Dict[UUID, int] = {nid: 0 for nid in graph.nodes}

    for _ in range(iterations):
        # Sample durations for all activities
        sampled_durations: Dict[UUID, float] = {}
        for nid in graph.nodes:
            dist = dist_map.get(nid)
            det_dur = deterministic_durations[nid]
            sampled_durations[nid] = sample_duration(dist, det_dur, rng)

        # Forward pass
        ef = fast_forward_pass(graph, sampled_durations, project_start)

        # Backward pass
        ls = fast_backward_pass(graph, sampled_durations, ef)

        # Record project finish date
        project_finish = max(ef.values())
        project_finish_dates.append(project_finish)

        # Identify critical nodes in this iteration
        critical = identify_critical_in_iteration(graph, ef, ls, sampled_durations)
        for nid in critical:
            critical_counts[nid] += 1

    # Step 7: Compute percentiles
    # Convert finish dates to ordinal for percentile computation
    finish_ordinals = np.array([d.toordinal() for d in project_finish_dates])

    p50_ordinal = int(np.percentile(finish_ordinals, 50))
    p80_ordinal = int(np.percentile(finish_ordinals, 80))
    p90_ordinal = int(np.percentile(finish_ordinals, 90))

    p50_date = datetime.fromordinal(p50_ordinal)
    p80_date = datetime.fromordinal(p80_ordinal)
    p90_date = datetime.fromordinal(p90_ordinal)

    # Adjust to workdays if needed
    for dt in (p50_date, p80_date, p90_date):
        while not _is_workday(dt):
            dt += timedelta(days=1)

    # Step 8: Compute criticality indices
    criticality_indices: List[dict] = []
    for nid in graph.nodes:
        node_obj = nodes[nid]
        ci = critical_counts[nid] / iterations
        criticality_indices.append({
            "node_id": str(nid),
            "code": node_obj.code,
            "name": node_obj.name,
            "criticality_index": round(ci, 4),
        })

    # Sort by criticality index descending
    criticality_indices.sort(key=lambda x: x["criticality_index"], reverse=True)

    # Step 9: Generate distribution points for UI curve plotting
    # Subsample to ~50 points for efficient frontend rendering
    percentiles_for_curve = np.linspace(5, 95, 50)
    distribution_points = []
    for p in percentiles_for_curve:
        ordinal = int(np.percentile(finish_ordinals, p))
        dt = datetime.fromordinal(ordinal)
        while not _is_workday(dt):
            dt += timedelta(days=1)
        distribution_points.append({
            "percentile": round(float(p), 1),
            "date": dt.isoformat(),
        })

    # Step 10: Project duration statistics
    min_finish = min(project_finish_dates)
    max_finish = max(project_finish_dates)
    mean_ordinal = float(np.mean(finish_ordinals))
    std_ordinal = float(np.std(finish_ordinals))

    # Step 11: Update criticality indices in database
    for nid in graph.nodes:
        dist = dist_map.get(nid)
        if dist is not None:
            dist.criticality_index = round(critical_counts[nid] / iterations, 4)

    db.commit()

    return {
        "project_id": str(root_node_id),
        "iterations": iterations,
        "seed": seed,
        "percentiles": {
            "P50": p50_date.isoformat(),
            "P80": p80_date.isoformat(),
            "P90": p90_date.isoformat(),
        },
        "criticality_indices": criticality_indices,
        "distribution_points": distribution_points,
        "project_duration_stats": {
            "min_finish": min_finish.isoformat(),
            "max_finish": max_finish.isoformat(),
            "mean_finish_ordinal": round(mean_ordinal, 2),
            "std_finish_ordinal": round(std_ordinal, 2),
        },
        "calculated_at": datetime.now(timezone.utc).isoformat(),
    }
