"""Developer mock fixtures — reproducible test scenarios for UI integration.

This module provides seed data scenarios that populate the database with
realistic, defence-domain test data for rapid frontend development and
integration testing.  Each scenario is a self-contained programme with
50+ nodes, PDM dependency links, 3-point Monte Carlo estimates, resource
assignments, simulated clashes, and baseline snapshots.

Scenarios are designed to exercise every UI component in the HMI catalog:

- **Gantt chart**: Multi-level WBS with planned/actual dates, progress,
  blockers, cross-hatch shading, and baseline comparisons.
- **Jagged drop line**: Mix of ahead, on-track, behind, and complete tasks.
- **Daily cockpit**: Active sprint load, blocked items, urgent tasks,
  focus queue, and claimable placeholder tasks.
- **Clash triage**: Resource double-bookings, clearance lapses, and
  facility collisions with proposed leveling shifts.
- **Display settings**: Server-side profile hydration on login.

Available Scenarios
~~~~~~~~~~~~~~~~~~~

1. **avionics-radar** — Avionics radar development programme with 50 nodes
   spanning requirements, design, development, integration, and test phases.
   Includes PDM links (FS/SS/FF/SF), 3-point estimates, resource assignments,
   and simulated clashes.

2. **minimal** — Small 10-node scenario for quick smoke testing of the
   Gantt chart and basic cockpit views.

Usage
~~~~~

In development environments, call::

    GET /api/v1/dev/fixtures/avionics-radar

This clears and repopulates the database with the scenario data, returning
a summary of what was seeded.  The endpoint is **only available when
``ENVIRONMENT != 'production'``** to prevent accidental data loss.

Security Warning
~~~~~~~~~~~~~~~~

This endpoint is **DANGEROUS** — it clears existing data.  It is gated
behind the ``ENVIRONMENT`` setting and will **not load** in production.
Never expose this endpoint in a production deployment.
"""
from datetime import date, timezone, datetime, timedelta
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import (
    UniversalBreakdownNode,
    PortfolioNode,
    ResourceNode,
    ResourceAssignment,
    DependencyLink,
    NodeBlocker,
    ActivityDurationDistribution,
    ScheduleClashIssue,
    User,
    SecurityClassification,
    TreeType,
    DependencyType,
    AssignmentStatus,
    BlockerCategory,
    BlockerSeverity,
    ClashCategory,
    ClashSeverity,
    DistributionType,
)
from app.schemas.hmi_catalog import (
    GanttBarPayload,
    BaselineBar,
    GanttChartPayload,
    DropLinePoint,
    JaggedDropLinePayload,
    SprintLoadGauge,
    FocusQueueItem,
    ClaimableTaskItem,
    DailyCockpitSummaryPayload,
    ClashTriageItemPayload,
    ClashTriagePayload,
    DisplaySettingsPayload,
    HMICatalogManifest,
)

router = APIRouter(tags=["dev: mock fixtures"])

# ============================================================================
# Scenario Data Generators
# ============================================================================


def _generate_uuids(count: int) -> List[str]:
    """Generate a list of deterministic UUID strings for reproducible data."""
    return [str(uuid4()) for _ in range(count)]


def _add_days(d: date, days: int) -> date:
    """Add calendar days to a date."""
    return d + timedelta(days=days)


def _workday_add(d: date, workdays: int) -> date:
    """Add workdays (Mon–Fri) to a date, skipping weekends."""
    current = d
    added = 0
    while added < workdays:
        current += timedelta(days=1)
        if current.weekday() < 5:  # Mon=0 .. Fri=4
            added += 1
    return current


def seed_avionics_radar(db: Session) -> Dict[str, Any]:
    """Seed the avionics radar development programme scenario.

    This scenario creates a realistic defence avionics radar programme
    with 50 nodes spanning the full development lifecycle:

    - **Level 1**: Programme root (RADAR-X Avionics Development)
    - **Level 2**: 5 work packages (Requirements, Design, Development,
      Integration, Test)
    - **Level 3**: 15 sub-packages (3 per work package)
    - **Level 4**: 30 tasks (2 per sub-package)

    Each node includes:

    - Planned start/end dates with realistic durations
    - PDM dependency links (FS/SS/FF/SF with lags)
    - 3-point Monte Carlo estimates (optimistic, most-likely, pessimistic)
    - Resource assignments with rates
    - Simulated clashes (resource overallocation, facility collisions)
    - Baseline snapshots for B₀ comparison
    - Blockers and procurement constraints

    Parameters
    ----------
    db : Session
        Active database session.

    Returns
    -------
    dict
        Summary of seeded data (node count, link count, etc.).
    """
    # Clear existing data
    db.query(ScheduleClashIssue).delete()
    db.query(ActivityDurationDistribution).delete()
    db.query(NodeBlocker).delete()
    db.query(DependencyLink).delete()
    db.query(ResourceAssignment).delete()
    db.query(PortfolioNode).delete()
    db.query(ResourceNode).delete()
    db.query(UniversalBreakdownNode).delete()

    # Programme start date
    start = date(2026, 11, 1)
    nodes: Dict[str, Dict[str, Any]] = {}
    node_order: List[str] = []

    def create_node(
        code: str,
        name: str,
        parent_id: Optional[str],
        path: str,
        planned_start: date,
        duration_days: int,
        percent_complete: float = 0.0,
        actual_start: Optional[date] = None,
        actual_end: Optional[date] = None,
        classification: SecurityClassification = SecurityClassification.OFFICIAL_SENSITIVE,
        requires_vv: bool = False,
    ) -> str:
        """Create a mock WBS node and store it in the database.

        Args
        ----\n        code : str
            WBS code (e.g., ``"RADAR-X.REQ"``).
        name : str
            Human-readable node name.
        parent_id : str or None
            Parent node UUID or ``None`` for root nodes.
        path : str
            ltree path string (e.g., ``"1.2"``).
        planned_start : date
            Planned start date.
        duration_days : int
            Duration in working days.
        percent_complete : float, optional
            Percent complete 0-100 (default ``0.0``).
        actual_start : date, optional
            Actual start date (default ``None``).
        actual_end : date, optional
            Actual end date (default ``None``).
        classification : SecurityClassification, optional
            Security classification (default ``OFFICIAL_SENSITIVE``).
        requires_vv : bool, optional
            Whether V&V sign-off is required (default ``False``).

        Returns
        -------
        str
            The generated UUID string for the new node.
        """
        node_id = str(uuid4())
        planned_end = _workday_add(planned_start, duration_days)

        ubn = UniversalBreakdownNode(
            id=node_id,
            parent_id=parent_id,
            tree_type=TreeType.WBS,
            code=code,
            name=name,
            path=path,
            security_classification=classification,
            is_active=True,
        )
        pn = PortfolioNode(
            id=node_id,
            planned_start_date=planned_start,
            planned_end_date=planned_end,
            actual_start_date=actual_start,
            actual_end_date=actual_end,
            percent_complete=percent_complete,
            requires_vv_signoff=requires_vv,
            bac_cost=duration_days * 1000.0,  # £1000/day base rate
            evm_technique="PERCENT_COMPLETE",
        )
        db.add(ubn)
        db.add(pn)
        nodes[node_id] = {
            "code": code,
            "name": name,
            "path": path,
            "planned_start": planned_start,
            "planned_end": planned_end,
            "duration_days": duration_days,
            "percent_complete": percent_complete,
            "actual_start": actual_start,
            "actual_end": actual_end,
            "classification": classification,
            "requires_vv": requires_vv,
        }
        node_order.append(node_id)
        return node_id

    # --- Level 1: Programme Root ---
    root_id = create_node(
        code="RADAR-X",
        name="RADAR-X Avionics Development Programme",
        parent_id=None,
        path="1",
        planned_start=start,
        duration_days=600,
        percent_complete=5.0,
        classification=SecurityClassification.SECRET,
    )

    # --- Level 2: Work Packages ---
    wp_ids = []
    wp_data = [
        ("REQ", "Requirements & Analysis", 0, 90),
        ("DES", "System Design", 90, 120),
        ("DEV", "Development & Build", 180, 240),
        ("INT", "Integration & Assembly", 360, 150),
        ("TST", "Test & Evaluation", 420, 180),
    ]
    for i, (code, name, offset, dur) in enumerate(wp_data, 1):
        wp_id = create_node(
            code=f"RADAR-X.{code}",
            name=name,
            parent_id=root_id,
            path=f"1.{i}",
            planned_start=_workday_add(start, offset),
            duration_days=dur,
            percent_complete=15.0 if i == 1 else 0.0,
            actual_start=start if i == 1 else None,
            classification=SecurityClassification.SECRET if i <= 3 else SecurityClassification.OFFICIAL_SENSITIVE,
        )
        wp_ids.append(wp_id)

    # --- Level 3: Sub-packages ---
    sub_wp_data = [
        # Requirements sub-packages
        ("REQ-01", "Stakeholder Needs", "RADAR-X.REQ", 0, 30),
        ("REQ-02", "System Requirements Spec", "RADAR-X.REQ", 30, 30),
        ("REQ-03", "Operational Concept", "RADAR-X.REQ", 60, 30),
        # Design sub-packages
        ("DES-01", "Architecture Definition", "RADAR-X.DES", 0, 40),
        ("DES-02", "Interface Control", "RADAR-X.DES", 40, 40),
        ("DES-03", "Preliminary Design Review", "RADAR-X.DES", 80, 40),
        # Development sub-packages
        ("DEV-01", "RF Front-End", "RADAR-X.DEV", 0, 80),
        ("DEV-02", "Signal Processing", "RADAR-X.DEV", 0, 100),
        ("DEV-03", "Software Firmware", "RADAR-X.DEV", 40, 120),
        ("DEV-04", "Mechanical Enclosure", "RADAR-X.DEV", 0, 60),
        ("DEV-05", "Power & Cooling", "RADAR-X.DEV", 20, 80),
        # Integration sub-packages
        ("INT-01", "Subsystem Integration", "RADAR-X.INT", 0, 60),
        ("INT-02", "System Integration", "RADAR-X.INT", 60, 60),
        ("INT-03", "Environmental Qualification", "RADAR-X.INT", 120, 30),
        # Test sub-packages
        ("TST-01", "Factory Acceptance Test", "RADAR-X.TST", 0, 40),
        ("TST-02", "Range Trials", "RADAR-X.TST", 40, 60),
        ("TST-03", "Operational Evaluation", "RADAR-X.TST", 100, 40),
    ]
    sub_ids: Dict[str, str] = {}
    for code, name, parent_code, offset, dur in sub_wp_data:
        parent_id = next(
            nid for nid, n in nodes.items() if n["code"] == parent_code
        )
        wp_start = nodes[parent_id]["planned_start"]
        sub_id = create_node(
            code=code,
            name=f"{name} Sub-Package",
            parent_id=parent_id,
            path=f"{nodes[parent_id]['path']}.{len([s for s in sub_ids]) + 1}",
            planned_start=_workday_add(wp_start, offset),
            duration_days=dur,
            classification=SecurityClassification.SECRET if "RF" in name or "Signal" in name else SecurityClassification.OFFICIAL_SENSITIVE,
        )
        sub_ids[code] = sub_id

    # --- Level 4: Tasks ---
    task_templates = [
        ("Analysis", 15),
        ("Implementation", 20),
    ]
    task_count = 0
    for sub_code, sub_id in sub_ids.items():
        sub_start = nodes[sub_id]["planned_start"]
        for i, (tname, tdur) in enumerate(task_templates):
            task_id = create_node(
                code=f"{sub_code}-T{i+1}",
                name=f"{tname} - {nodes[sub_id]['name']}",
                parent_id=sub_id,
                path=f"{nodes[sub_id]['path']}.{i+1}",
                planned_start=_workday_add(sub_start, i * tdur),
                duration_days=tdur,
                percent_complete=25.0 if sub_code.startswith("REQ") else 0.0,
                actual_start=sub_start if sub_code.startswith("REQ") else None,
                classification=nodes[sub_id]["classification"],
                requires_vv="TST" in sub_code,
            )
            task_count += 1

    # --- PDM Dependency Links ---
    deps = [
        # WP sequence
        (wp_ids[0], wp_ids[1], DependencyType.FS, 0),
        (wp_ids[1], wp_ids[2], DependencyType.FS, 0),
        (wp_ids[2], wp_ids[3], DependencyType.FS, 0),
        (wp_ids[3], wp_ids[4], DependencyType.FS, 0),
        # SS links for parallel start
        (wp_ids[0], wp_ids[2], DependencyType.SS, 30),
        # FF link for finish alignment
        (wp_ids[2], wp_ids[3], DependencyType.FF, 0),
    ]
    for pred, succ, dtype, lag in deps:
        dep = DependencyLink(
            predecessor_id=pred,
            successor_id=succ,
            dependency_type=dtype,
            lag_days=lag,
        )
        db.add(dep)

    # --- 3-Point Monte Carlo Estimates ---
    for node_id, info in nodes.items():
        dur = info["duration_days"]
        dist = ActivityDurationDistribution(
            portfolio_node_id=node_id,
            optimistic_days=dur * 0.8,
            most_likely_days=dur,
            pessimistic_days=dur * 1.4,
            distribution_type=DistributionType.BETA_PERT,
        )
        db.add(dist)

    # --- Resource Nodes & Assignments ---
    resources = [
        ("RES-ENG-001", "RF Hardware Engineer", "PERSON", 150.0, False),
        ("RES-ENG-002", "Signal Processing Engineer", "PERSON", 145.0, False),
        ("RES-ENG-003", "Systems Safety Assessor", "PERSON", 140.0, False),
        ("RES-GEN-001", "Generic Systems Engineer", "PERSON", 130.0, True),
        ("RES-GEN-002", "Generic Test Technician", "PERSON", 100.0, True),
        ("LOC-SCIF-001", "SCIF Lab Alpha", "FACILITY", 0.0, False),
    ]
    resource_ids: Dict[str, str] = {}
    for code, name, rtype, rate, is_generic in resources:
        rid = str(uuid4())
        ubn = UniversalBreakdownNode(
            id=rid,
            tree_type=TreeType.RBS,
            code=code,
            name=name,
            path=f"RBS.1",
            security_classification=SecurityClassification.OFFICIAL_SENSITIVE,
            is_active=True,
        )
        rn = ResourceNode(
            id=rid,
            resource_type=rtype,
            standard_hourly_rate=rate,
            is_generic_placeholder=is_generic,
        )
        db.add(ubn)
        db.add(rn)
        resource_ids[code] = rid

    # Assign resources to tasks
    eng_codes = ["RES-ENG-001", "RES-ENG-002", "RES-ENG-003"]
    for idx, node_id in enumerate(node_order[:15]):
        res_code = eng_codes[idx % len(eng_codes)]
        info = nodes[node_id]
        ra = ResourceAssignment(
            portfolio_node_id=node_id,
            resource_node_id=resource_ids[res_code],
            allocated_units=0.5 if idx % 3 == 0 else 1.0,
            planned_hours=info["duration_days"] * 8,
            rate_snapshot=150.0,
            status=AssignmentStatus.CONFIRMED,
        )
        db.add(ra)

    # --- Blockers ---
    blocker_target = node_order[10] if len(node_order) > 10 else node_order[-1]
    blocker = NodeBlocker(
        portfolio_node_id=blocker_target,
        category=BlockerCategory.DEPENDENCY_OVERDUE,
        severity=BlockerSeverity.MAJOR,
        impacted_hours=40.0,
    )
    db.add(blocker)

    # --- Simulated Clashes ---
    clash_id_1 = str(uuid4())
    clash1 = ScheduleClashIssue(
        id=clash_id_1,
        sweep_run_id=str(uuid4()),
        category=ClashCategory.RESOURCE_OVERALLOCATION,
        severity=ClashSeverity.CRITICAL,
        portfolio_node_id=node_order[5],
        conflicting_node_id=node_order[6],
        conflicting_resource_id=resource_ids["RES-ENG-001"],
        conflict_window_start=start,
        conflict_window_end=_add_days(start, 30),
        title="Resource Overallocation: RF Hardware Engineer",
        description="RES-ENG-001 is assigned 150% capacity during weeks 1-4.",
        recommended_action="Delay non-critical task by 15 workdays using available float.",
        is_resolved=False,
    )
    db.add(clash1)

    clash_id_2 = str(uuid4())
    clash2 = ScheduleClashIssue(
        id=clash_id_2,
        sweep_run_id=clash1.sweep_run_id,
        category=ClashCategory.FACILITY_CONTRAVENTION,
        severity=ClashSeverity.MAJOR,
        portfolio_node_id=node_order[8],
        conflict_window_start=_add_days(start, 60),
        conflict_window_end=_add_days(start, 90),
        title="SCIF Facility Collision",
        description="Two SECRET tasks scheduled in SCIF Lab Alpha simultaneously.",
        recommended_action="Stagger facility bookings or allocate additional SCIF space.",
        is_resolved=False,
    )
    db.add(clash2)

    clash_id_3 = str(uuid4())
    clash3 = ScheduleClashIssue(
        id=clash_id_3,
        sweep_run_id=clash1.sweep_run_id,
        category=ClashCategory.CALENDAR_EXCEPTION,
        severity=ClashSeverity.ADVISORY,
        portfolio_node_id=node_order[12],
        conflict_window_start=_add_days(start, 120),
        conflict_window_end=_add_days(start, 130),
        title="Calendar Exception: Holiday Period",
        description="Task spans Christmas/New Year holiday with no calendar exclusion.",
        recommended_action="Adjust planned dates to exclude holiday period.",
        is_resolved=False,
    )
    db.add(clash3)

    db.commit()

    return {
        "scenario": "avionics-radar",
        "nodes_created": len(nodes),
        "tasks_created": task_count,
        "dependencies_created": len(deps),
        "resources_created": len(resources),
        "blockers_created": 1,
        "clashes_created": 3,
        "monte_carlo_estimates": len(nodes),
    }


def seed_minimal(db: Session) -> Dict[str, Any]:
    """Seed a minimal 10-node scenario for quick smoke testing.

    Creates a simple 3-level WBS with 10 nodes, 5 dependencies,
    and basic resource assignments.  Ideal for rapid Gantt chart
    and cockpit view testing.

    Parameters
    ----------
    db : Session
        Active database session.

    Returns
    -------
    dict
        Summary of seeded data.
    """
    db.query(ScheduleClashIssue).delete()
    db.query(ActivityDurationDistribution).delete()
    db.query(NodeBlocker).delete()
    db.query(DependencyLink).delete()
    db.query(ResourceAssignment).delete()
    db.query(PortfolioNode).delete()
    db.query(ResourceNode).delete()
    db.query(UniversalBreakdownNode).delete()

    start = date(2026, 11, 1)
    nodes_created: List[str] = []

    def create_node(code, name, parent_id, path, start_d, dur, pct=0.0):
        """Create a minimal mock WBS node for smoke testing.

        Args
        ----\n        code : str
            WBS code.
        name : str
            Node name.
        parent_id : str or None
            Parent node UUID.
        path : str
            ltree path.
        start_d : date
            Planned start date.
        dur : int
            Duration in working days.
        pct : float, optional
            Percent complete (default ``0.0``).

        Returns
        -------
        str
            The generated UUID string.
        """
        nid = str(uuid4())
        end_d = _workday_add(start_d, dur)
        ubn = UniversalBreakdownNode(
            id=nid, parent_id=parent_id, tree_type=TreeType.WBS,
            code=code, name=name, path=path,
            security_classification=SecurityClassification.OFFICIAL,
            is_active=True,
        )
        pn = PortfolioNode(
            id=nid, planned_start_date=start_d, planned_end_date=end_d,
            percent_complete=pct,
        )
        db.add(ubn)
        db.add(pn)
        nodes_created.append(nid)
        return nid

    root = create_node("PROJ", "Minimal Test Project", None, "1", start, 120, pct=10.0)
    wp1 = create_node("WP-01", "Design Phase", root, "1.1", start, 40, pct=50.0)
    wp2 = create_node("WP-02", "Build Phase", root, "1.2", _workday_add(start, 40), 50, pct=0.0)
    wp3 = create_node("WP-03", "Test Phase", root, "1.3", _workday_add(start, 90), 30, pct=0.0)
    t1 = create_node("T-01", "Requirements", wp1, "1.1.1", start, 20, pct=100.0)
    t2 = create_node("T-02", "Architecture", wp1, "1.1.2", _workday_add(start, 20), 20, pct=25.0)
    t3 = create_node("T-03", "Implementation", wp2, "1.2.1", _workday_add(start, 40), 30, pct=0.0)
    t4 = create_node("T-04", "Code Review", wp2, "1.2.2", _workday_add(start, 70), 20, pct=0.0)
    t5 = create_node("T-05", "Unit Testing", wp3, "1.3.1", _workday_add(start, 90), 15, pct=0.0)
    t6 = create_node("T-06", "Acceptance", wp3, "1.3.2", _workday_add(start, 105), 15, pct=0.0)

    deps = [
        (t1, t2, DependencyType.FS, 0),
        (t2, t3, DependencyType.FS, 0),
        (t3, t4, DependencyType.FS, 0),
        (t4, t5, DependencyType.FS, 0),
        (t5, t6, DependencyType.FS, 0),
    ]
    for pred, succ, dtype, lag in deps:
        db.add(DependencyLink(predecessor_id=pred, successor_id=succ, dependency_type=dtype, lag_days=lag))

    # Resource
    rid = str(uuid4())
    db.add(UniversalBreakdownNode(
        id=rid, tree_type=TreeType.RBS, code="DEV-001", name="Developer",
        path="RBS.1", security_classification=SecurityClassification.OFFICIAL, is_active=True,
    ))
    db.add(ResourceNode(id=rid, resource_type="PERSON", standard_hourly_rate=100.0, is_generic_placeholder=False))
    for nid in nodes_created[4:]:  # tasks only
        db.add(ResourceAssignment(
            portfolio_node_id=nid, resource_node_id=rid,
            allocated_units=1.0, planned_hours=40, rate_snapshot=100.0,
            status=AssignmentStatus.CONFIRMED,
        ))

    db.commit()

    return {
        "scenario": "minimal",
        "nodes_created": len(nodes_created),
        "dependencies_created": len(deps),
        "resources_created": 1,
    }


# ============================================================================
# HMI Payload Generators
# ============================================================================


def generate_gantt_payload(db: Session) -> GanttChartPayload:
    """Generate a Gantt chart payload from the current database state.

    Parameters
    ----------
    db : Session
        Active database session.

    Returns
    -------
    GanttChartPayload
        Complete Gantt chart data for frontend rendering.
    """
    wbs_nodes = db.query(UniversalBreakdownNode).join(
        PortfolioNode
    ).filter(
        UniversalBreakdownNode.tree_type == TreeType.WBS,
        UniversalBreakdownNode.is_active == True,
    ).all()

    bars: List[GanttBarPayload] = []
    all_starts = []
    all_ends = []

    for ubn in wbs_nodes:
        pn = db.query(PortfolioNode).filter(PortfolioNode.id == ubn.id).first()
        if not pn:
            continue

        planned_start = pn.planned_start_date or date.today()
        planned_end = pn.planned_end_date or planned_start
        all_starts.append(planned_start)
        all_ends.append(planned_end)

        # Check for blockers
        blocker = db.query(NodeBlocker).filter(
            NodeBlocker.portfolio_node_id == ubn.id,
            NodeBlocker.resolved_at == None,
        ).first()

        # Baseline comparison (mock B₀ shifted by 10 days)
        b0_start = _add_days(planned_start, -10)
        b0_end = _add_days(planned_end, -10)

        # Outline level from path depth
        outline_level = len(ubn.path.split(".")) if ubn.path else 1

        bar = GanttBarPayload(
            node_id=str(ubn.id),
            label=f"{ubn.code}: {ubn.name}",
            planned_start=planned_start,
            planned_end=planned_end,
            actual_start=pn.actual_start_date,
            actual_end=pn.actual_end_date,
            physical_percent_complete=pn.percent_complete or 0.0,
            is_blocked=blocker is not None,
            cross_hatch_shading=ubn.export_control_regime is not None and ubn.export_control_regime != "NOT_CONTROLLED",
            baseline_b0=BaselineBar(
                start_date=b0_start,
                end_date=b0_end,
                label="B0",
            ),
            baseline_b_curr=BaselineBar(
                start_date=planned_start,
                end_date=planned_end,
                label="B_curr",
            ),
            security_classification=ubn.security_classification.value if ubn.security_classification else None,
            is_masked=False,
            node_type="milestone" if pn.percent_complete == 100.0 else "task",
            outline_level=outline_level,
        )
        bars.append(bar)

    # Sort by planned start
    bars.sort(key=lambda b: b.planned_start)

    chart_start = min(all_starts) if all_starts else date.today()
    chart_end = max(all_ends) if all_ends else date.today()

    return GanttChartPayload(
        bars=bars,
        status_date=date.today(),
        chart_start=chart_start,
        chart_end=chart_end,
        total_nodes=len(bars),
    )


def generate_jagged_drop_line(db: Session) -> JaggedDropLinePayload:
    """Generate a jagged drop line payload from the current database state.

    Parameters
    ----------
    db : Session
        Active database session.

    Returns
    -------
    JaggedDropLinePayload
        Jagged drop line data for frontend rendering.
    """
    wbs_nodes = db.query(UniversalBreakdownNode).join(
        PortfolioNode
    ).filter(
        UniversalBreakdownNode.tree_type == TreeType.WBS,
        UniversalBreakdownNode.is_active == True,
    ).all()

    status_date = date.today()
    points: List[DropLinePoint] = []
    counts = {"ahead": 0, "on-track": 0, "behind": 0, "complete": 0}

    for idx, ubn in enumerate(wbs_nodes):
        pn = db.query(PortfolioNode).filter(PortfolioNode.id == ubn.id).first()
        if not pn or not pn.planned_end_date:
            continue

        # Calculate variance
        days_until_planned = (pn.planned_end_date - status_date).days
        pct = pn.percent_complete or 0.0

        if pct >= 100.0:
            status = "complete"
            variance = 0.0
        elif days_until_planned < 0 and pct < 100.0:
            status = "behind"
            variance = float(days_until_planned)
        elif days_until_planned > 30:
            status = "ahead"
            variance = float(days_until_planned)
        else:
            status = "on-track"
            variance = 0.0

        counts[status] = counts.get(status, 0) + 1

        point = DropLinePoint(
            node_id=str(ubn.id),
            label=ubn.code,
            x=float(days_until_planned),
            y=float(idx),
            status=status,
            variance_days=variance,
        )
        points.append(point)

    return JaggedDropLinePayload(
        status_date=status_date,
        points=points,
        ahead_count=counts.get("ahead", 0),
        on_track_count=counts.get("on-track", 0),
        behind_count=counts.get("behind", 0),
        complete_count=counts.get("complete", 0),
        summary={
            "total_nodes": len(points),
            "health_index": (counts.get("ahead", 0) + counts.get("on-track", 0)) / max(len(points), 1),
        },
    )


def generate_cockpit_payload(db: Session) -> DailyCockpitSummaryPayload:
    """Generate a Daily Cockpit summary payload from the current database state.

    Parameters
    ----------
    db : Session
        Active database session.

    Returns
    -------
    DailyCockpitSummaryPayload
        Complete cockpit data for frontend rendering.
    """
    # Count active assignments
    active_assignments = db.query(ResourceAssignment).filter(
        ResourceAssignment.status == AssignmentStatus.CONFIRMED
    ).all()

    total_hours = sum(ra.planned_hours for ra in active_assignments)
    capacity = 40.0
    utilization = (total_hours / capacity) * 100 if capacity > 0 else 0.0

    if utilization > 120:
        load_status = "overloaded"
    elif utilization > 90:
        load_status = "busy"
    elif utilization > 30:
        load_status = "optimal"
    else:
        load_status = "underloaded"

    sprint_load = SprintLoadGauge(
        active_task_count=len(active_assignments),
        total_planned_hours=total_hours,
        capacity_hours=capacity,
        utilization_percent=utilization,
        status=load_status,
    )

    # Blocked count
    blocked_count = db.query(NodeBlocker).filter(
        NodeBlocker.resolved_at == None
    ).count()

    # Focus queue (tasks with 0% complete, ordered by planned start)
    wbs_tasks = db.query(UniversalBreakdownNode).join(
        PortfolioNode
    ).filter(
        UniversalBreakdownNode.tree_type == TreeType.WBS,
        UniversalBreakdownNode.is_active == True,
        PortfolioNode.percent_complete < 100.0,
    ).order_by(PortfolioNode.planned_start_date).limit(10).all()

    focus_queue: List[FocusQueueItem] = []
    for ubn in wbs_tasks:
        pn = db.query(PortfolioNode).filter(PortfolioNode.id == ubn.id).first()
        if not pn:
            continue

        days_due = (pn.planned_end_date - date.today()).days if pn.planned_end_date else None
        focus_queue.append(FocusQueueItem(
            node_id=str(ubn.id),
            label=f"{ubn.code}: {ubn.name}",
            is_critical_path=days_due is not None and days_due < 7,
            due_date=pn.planned_end_date,
            days_until_due=days_due,
            percent_complete=pn.percent_complete or 0.0,
            status="in_progress" if (pn.percent_complete or 0.0) > 0 else "not_started",
            parent_label=None,
        ))

    # Claimable tasks (assigned to generic placeholders)
    generic_assignments = db.query(ResourceAssignment).join(
        ResourceNode
    ).filter(
        ResourceNode.is_generic_placeholder == True
    ).all()

    claimable_queue: List[ClaimableTaskItem] = []
    for ra in generic_assignments:
        rn = db.query(ResourceNode).filter(ResourceNode.id == ra.resource_node_id).first()
        ubn = db.query(UniversalBreakdownNode).filter(UniversalBreakdownNode.id == ra.portfolio_node_id).first()
        pn = db.query(PortfolioNode).filter(PortfolioNode.id == ra.portfolio_node_id).first()
        if rn and ubn and pn:
            claimable_queue.append(ClaimableTaskItem(
                node_id=str(ubn.id),
                label=f"{ubn.code}: {ubn.name}",
                placeholder_role=rn.name or "Generic Role",
                required_clearance=ubn.security_classification.value if ubn.security_classification else None,
                planned_hours=ra.planned_hours,
                due_date=pn.planned_end_date,
            ))

    return DailyCockpitSummaryPayload(
        sprint_load=sprint_load,
        blocked_count=blocked_count,
        urgent_count=len([f for f in focus_queue if f.days_until_due is not None and f.days_until_due <= 2]),
        focus_queue=focus_queue,
        claimable_queue=claimable_queue,
    )


def generate_clash_payload(db: Session) -> ClashTriagePayload:
    """Generate a clash triage payload from the current database state.

    Parameters
    ----------
    db : Session
        Active database session.

    Returns
    -------
    ClashTriagePayload
        Clash triage data for frontend rendering.
    """
    clashes = db.query(ScheduleClashIssue).filter(
        ScheduleClashIssue.is_resolved == False
    ).all()

    items: List[ClashTriageItemPayload] = []
    counts = {"CRITICAL": 0, "MAJOR": 0, "ADVISORY": 0}

    for clash in clashes:
        entity_name = "Unknown"
        conflicting_name = None

        if clash.portfolio_node_id:
            node = db.query(UniversalBreakdownNode).filter(
                UniversalBreakdownNode.id == clash.portfolio_node_id
            ).first()
            if node:
                entity_name = f"{node.code}: {node.name}"

        if clash.conflicting_node_id:
            node = db.query(UniversalBreakdownNode).filter(
                UniversalBreakdownNode.id == clash.conflicting_node_id
            ).first()
            if node:
                conflicting_name = f"{node.code}: {node.name}"

        item = ClashTriageItemPayload(
            clash_id=str(clash.id),
            severity=clash.severity.value,
            category=clash.category.value,
            conflict_window_start=clash.conflict_window_start,
            conflict_window_end=clash.conflict_window_end,
            entity_name=entity_name,
            conflicting_entity_name=conflicting_name,
            description=clash.description or clash.title or "",
            recommended_action=clash.recommended_action,
            leveling_shift_preview={
                "node_id": str(clash.portfolio_node_id),
                "original_start": str(clash.conflict_window_start),
                "proposed_start": str(_add_days(clash.conflict_window_start, 15)),
                "consumed_float_days": 15,
            } if clash.severity == ClashSeverity.CRITICAL else None,
            is_resolved=clash.is_resolved,
        )
        items.append(item)
        counts[clash.severity.value] = counts.get(clash.severity.value, 0) + 1

    return ClashTriagePayload(
        clashes=items,
        critical_count=counts.get("CRITICAL", 0),
        major_count=counts.get("MAJOR", 0),
        advisory_count=counts.get("ADVISORY", 0),
        last_sweep=datetime.now(timezone.utc) if clashes else None,
    )


def generate_display_settings() -> DisplaySettingsPayload:
    """Generate a default display settings payload.

    Returns
    -------
    DisplaySettingsPayload
        Default SCIF-optimised display profile.
    """
    return DisplaySettingsPayload(
        profile_name="DEFAULT",
        density="BALANCED",
        scale_factor=1.0,
        row_height_px=36,
        theme="SCIF_DARK",
        color_accessibility="STANDARD_RAG",
        view_state_overrides={
            "gantt_column_widths": {"name": 300, "start": 120, "end": 120, "duration": 80},
            "hidden_columns": [],
            "split_pane_ratio": 0.3,
        },
        is_active_default=True,
    )


# ============================================================================
# API Endpoints
# ============================================================================

def seed_sovereign_defence_full(db: Session) -> Dict[str, Any]:
    """Seed the full sovereign defence scenario — Project Chimera.

    This scenario creates a complete 5-tier WBS with 250+ nodes:

    - **Tier 1**: Programme root (PROG-CHIMERA)
    - **Tier 2**: Subsystems (AVIONICS_SUITE, PROPULSION_TELEMETRY, TEST_ENVELOPE,
      STRUCTURAL_INTEGRITY, GROUND_SUPPORT_EQUIPMENT)
    - **Tier 3**: Control Accounts (CAM J. Smith, CAM R. Patel, etc.)
    - **Tier 4**: Work Packages with PDM logic links (FS/SS/FF/SF) and lead/lag
    - **Tier 5**: Tasks, Milestones, and statutory CDRL deliverables

    Additionally includes:
    - Mixed security tiers (OFFICIAL … TOP_SECRET // UK EYES ONLY)
    - Systems safety DAL accreditations (DAL_A on flight software, DAL_B on radar DSP)
    - Environmental chamber bookings with 2-hour thermal cooldown buffers
    - Test equipment with active/expiring calibration dates
    - Non-linear cost profiles (Weibull, Beta) on research WPs
    - Active CAM check-out leases (SubTreeLock)
    - Delegation records
    - Intentional DCMA schedule clashes (out-of-sequence, negative float)

    Parameters
    ----------
    db : Session
        Active database session.

    Returns
    -------
    dict
        Summary of seeded data.
    """
    # Import here to avoid circular imports
    from app.cli.seed import SovereignDefenceSeeder

    seeder = SovereignDefenceSeeder(db)
    summary = seeder.seed()
    return summary


SCENARIOS = {
    "avionics-radar": seed_avionics_radar,
    "minimal": seed_minimal,
    "sovereign-defence-full": seed_sovereign_defence_full,
}


@router.get("/fixtures/{scenario_name}")
def load_fixture(
    scenario_name: str,
    db: Session = Depends(get_db),
):
    """Load a reproducible test scenario into the database.

    This endpoint clears the existing data and seeds the database with
    a predefined scenario.  It is intended for **development use only**
    to rapidly populate test data for UI integration testing.

    Available scenarios:

    - **avionics-radar**: Full avionics radar development programme
      with 50 nodes, PDM links, 3-point estimates, and simulated clashes.
    - **minimal**: Small 10-node scenario for quick smoke testing.

    Parameters
    ----------
    scenario_name : str
        Name of the scenario to load (e.g., 'avionics-radar', 'minimal').
    db : Session
        Database session (injected).

    Returns
    -------
    dict
        Summary of seeded data including node counts, dependency counts,
        and generated HMI payloads.

    Raises
    ------
    HTTPException
        404 if the scenario name is not recognised.
    """
    if scenario_name not in SCENARIOS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown scenario '{scenario_name}'. Available: {', '.join(SCENARIOS.keys())}",
        )

    # Seed the scenario
    summary = SCENARIOS[scenario_name](db)

    # Generate HMI payloads
    gantt = generate_gantt_payload(db)
    drop_line = generate_jagged_drop_line(db)
    cockpit = generate_cockpit_payload(db)
    clashes = generate_clash_payload(db)
    display = generate_display_settings()

    return {
        "scenario": summary,
        "hmi_payloads": {
            "gantt_chart": {
                "bar_count": gantt.total_nodes,
                "status_date": str(gantt.status_date),
                "chart_range": f"{gantt.chart_start} to {gantt.chart_end}",
            },
            "jagged_drop_line": {
                "point_count": len(drop_line.points),
                "ahead": drop_line.ahead_count,
                "on_track": drop_line.on_track_count,
                "behind": drop_line.behind_count,
                "complete": drop_line.complete_count,
            },
            "daily_cockpit": {
                "sprint_load": cockpit.sprint_load.status,
                "blocked": cockpit.blocked_count,
                "urgent": cockpit.urgent_count,
                "focus_queue_size": len(cockpit.focus_queue),
                "claimable_queue_size": len(cockpit.claimable_queue),
            },
            "clash_triage": {
                "critical": clashes.critical_count,
                "major": clashes.major_count,
                "advisory": clashes.advisory_count,
                "total_active": len(clashes.clashes),
            },
            "display_settings": {
                "profile": display.profile_name,
                "density": display.density,
                "theme": display.theme,
            },
        },
    }


@router.get("/fixtures/list")
def list_scenarios():
    """List available test scenarios.

    Returns
    -------
    dict
        Dictionary mapping scenario names to descriptions.
    """
    return {
        "scenarios": {
            "avionics-radar": {
                "description": "Avionics radar development programme with 50 nodes, PDM links, 3-point estimates, and simulated clashes.",
                "node_count": 50,
                "includes": [
                    "WBS hierarchy (5 levels)",
                    "PDM dependency links (FS/SS/FF/SF)",
                    "3-point Monte Carlo estimates",
                    "Resource assignments",
                    "Simulated clashes (3 types)",
                    "Blockers",
                    "Baseline comparisons",
                ],
            },
            "minimal": {
                "description": "Small 10-node scenario for quick smoke testing of Gantt chart and cockpit views.",
                "node_count": 10,
                "includes": [
                    "Simple 3-level WBS",
                    "Sequential dependencies",
                    "Single resource assignment",
                ],
            },
            "sovereign-defence-full": {
                "description": "Project Chimera — Next-Gen Avionics: 5-tier WBS with 250+ nodes, multi-domain capabilities, and DCMA clashes.",
                "node_count": 250,
                "includes": [
                    "5-tier WBS (Programme → Subsystem → CA → WP → Task/Milestone)",
                    "Mixed security tiers (OFFICIAL to TOP_SECRET // UK EYES ONLY)",
                    "DAL safety accreditations (DAL_A, DAL_B)",
                    "Environmental chamber bookings with 2hr cooldown buffers",
                    "Test equipment with calibration dates",
                    "Non-linear cost profiles (Weibull, Beta)",
                    "CAM check-out leases (SubTreeLock)",
                    "Delegation records",
                    "DCMA schedule clashes (out-of-sequence, negative float)",
                    "PDM dependency links (FS/SS/FF/SF with lead/lag)",
                    "Statutory CDRL deliverables",
                    "3-point Monte Carlo estimates",
                ],
            },
        }
    }


@router.get("/hmi/gantt")
def get_mock_gantt(
    db: Session = Depends(get_db),
):
    """Return a mock Gantt chart payload for UI testing.

    Generates Gantt bar data from the current database state,
    including baseline comparisons and blocker indicators.

    Returns
    -------
    GanttChartPayload
        Complete Gantt chart data.
    """
    return generate_gantt_payload(db)


@router.get("/hmi/drop-line")
def get_mock_drop_line(
    db: Session = Depends(get_db),
):
    """Return a mock jagged drop line payload for UI testing.

    Generates drop line coordinate points from the current database
    state, showing ahead/behind/on-track status for each work package.

    Returns
    -------
    JaggedDropLinePayload
        Jagged drop line data.
    """
    return generate_jagged_drop_line(db)


@router.get("/hmi/cockpit")
def get_mock_cockpit(
    db: Session = Depends(get_db),
):
    """Return a mock Daily Cockpit summary payload for UI testing.

    Generates cockpit data from the current database state,
    including sprint load, focus queue, and claimable tasks.

    Returns
    -------
    DailyCockpitSummaryPayload
        Complete cockpit summary.
    """
    return generate_cockpit_payload(db)


@router.get("/hmi/clashes")
def get_mock_clashes(
    db: Session = Depends(get_db),
):
    """Return a mock clash triage payload for UI testing.

    Generates clash triage data from the current database state,
    including severity badges and proposed leveling shifts.

    Returns
    -------
    ClashTriagePayload
        Clash triage dashboard data.
    """
    return generate_clash_payload(db)


@router.get("/hmi/display-settings")
def get_mock_display_settings():
    """Return a mock display settings payload for UI testing.

    Returns a default SCIF-optimised display profile with
    balanced density, dark theme, and standard colour palette.

    Returns
    -------
    DisplaySettingsPayload
        Default display settings.
    """
    return generate_display_settings()


@router.get("/hmi/manifest")
def get_hmi_manifest():
    """Return the HMI Component Catalog JSON Schema manifest.

    This endpoint provides a machine-readable inventory of all
    HMI component payloads, enabling the frontend build system
    to validate API contracts and generate TypeScript types.

    Returns
    -------
    dict
        The complete JSON schema for all HMI payload types.
    """
    manifest = HMICatalogManifest()

    # Include full JSON schemas for each component
    schemas = {
        "GanttBarPayload": GanttBarPayload.model_json_schema(),
        "GanttChartPayload": GanttChartPayload.model_json_schema(),
        "JaggedDropLinePayload": JaggedDropLinePayload.model_json_schema(),
        "DailyCockpitSummaryPayload": DailyCockpitSummaryPayload.model_json_schema(),
        "ClashTriageItemPayload": ClashTriageItemPayload.model_json_schema(),
        "ClashTriagePayload": ClashTriagePayload.model_json_schema(),
        "DisplaySettingsPayload": DisplaySettingsPayload.model_json_schema(),
    }

    return {
        "manifest": manifest.model_dump(),
        "schemas": schemas,
    }
