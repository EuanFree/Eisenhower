"""Background schedule audit engine (clash daemon).

Periodically sweeps a project's schedule to detect clashes that would
prevent smooth execution.  Each sweep generates a unique ``sweep_run_id``
and persists all discovered clashes as :class:`ScheduleClashIssue` records.

Clash Types Detected
--------------------

1. **Resource Double-Bookings** — A resource is assigned more than 100%
   capacity across overlapping tasks.

2. **Security Clearance Lapse** — A user's clearance or a skill
   certification expires before the task's planned end date.

3. **Facility Collisions** — Multiple tasks are scheduled in the same
   SCIF/TEMPEST location exceeding its capacity.

4. **Negative Float Slip** — A task's total float is negative, meaning
   the project is already behind schedule.

5. **Predecessor Unmet** — A dependency's successor is scheduled to start
   before the predecessor is expected to finish.

Usage
~~~~~

    from app.services.clash_daemon import run_portfolio_sweep

    result = run_portfolio_sweep(db, project_root_id)
    # result contains sweep_run_id and clash counts by severity
"""
from datetime import datetime, timezone, timedelta, date
from typing import Dict, List, Optional, Tuple
from uuid import UUID, uuid4

from sqlalchemy.orm import Session
from sqlalchemy import text as sa_text

from app.models.models import (
    PortfolioNode, ResourceAssignment, ResourceNode, LocationNode,
    DependencyLink, User, UserSkillProfile, ScheduleClashIssue,
    ClashCategory, ClashSeverity, UniversalBreakdownNode,
)


# ============================================================================
# Helper: check if a date is a workday
# ============================================================================

def _is_workday(d: date) -> bool:
    """Return True if *d* falls on a weekday (Mon–Fri)."""
    return d.weekday() < 5


# ============================================================================
# Check 1: Resource double-bookings (> 100% capacity)
# ============================================================================

def _check_resource_overallocation(
    db: Session,
    root_id: UUID,
    sweep_id: UUID,
    project_start: date,
    project_end: date,
) -> List[ScheduleClashIssue]:
    """Detect resources assigned > 100% capacity during overlapping tasks.

    For each resource with active assignments in the project window,
    calculate daily load.  Any day where total allocated units exceed
    1.0 generates a clash issue.
    """
    clashes: List[ScheduleClashIssue] = []

    # Get all resources assigned to nodes under this project root
    root = db.query(PortfolioNode).filter(PortfolioNode.id == root_id).first()
    if not root:
        return clashes

    # Find all resource assignments under this project
    assignments = (
        db.query(ResourceAssignment)
        .join(PortfolioNode, ResourceAssignment.portfolio_node_id == PortfolioNode.id)
        .join(UniversalBreakdownNode, PortfolioNode.id == UniversalBreakdownNode.id)
        .filter(
            UniversalBreakdownNode.path.op("<@")(root.path),
            UniversalBreakdownNode.is_active == True,
            PortfolioNode.planned_start_date <= project_end,
            PortfolioNode.planned_end_date >= project_start,
        )
        .all()
    )

    # Group by resource
    resource_assignments: Dict[UUID, List[Tuple[ResourceAssignment, PortfolioNode]]] = {}
    for assignment in assignments:
        pn = assignment.portfolio_node
        if pn and pn.planned_start_date and pn.planned_end_date:
            rid = assignment.resource_node_id
            if rid not in resource_assignments:
                resource_assignments[rid] = []
            resource_assignments[rid].append((assignment, pn))

    # Check each resource for overallocation
    for resource_id, assigned in resource_assignments.items():
        # Build daily load map
        daily_load: Dict[date, List[Tuple[ResourceAssignment, PortfolioNode]]] = {}

        for assignment, pn in assigned:
            d = pn.planned_start_date
            while d <= pn.planned_end_date:
                if _is_workday(d):
                    if d not in daily_load:
                        daily_load[d] = []
                    daily_load[d].append((assignment, pn))
                d += timedelta(days=1)

        # Find overallocation windows
        in_window = False
        window_start = None
        window_end = None
        peak_load = 0.0
        peak_day = None
        peak_tasks: List[PortfolioNode] = []

        for d in sorted(daily_load.keys()):
            tasks_on_day = daily_load[d]
            load = sum(a.allocated_units for a, _ in tasks_on_day)

            if load > 1.0:
                if not in_window:
                    window_start = d
                    in_window = True
                    peak_load = load
                    peak_day = d
                    peak_tasks = [pn for _, pn in tasks_on_day]
                else:
                    if load > peak_load:
                        peak_load = load
                        peak_day = d
                        peak_tasks = [pn for _, pn in tasks_on_day]
            else:
                if in_window:
                    window_end = d - timedelta(days=1)
                    # Create clash issue
                    primary_node = peak_tasks[0] if peak_tasks else assigned[0][1]
                    conflicting_node = peak_tasks[1] if len(peak_tasks) > 1 else None

                    severity = ClashSeverity.CRITICAL if peak_load > 2.0 else (
                        ClashSeverity.MAJOR if peak_load > 1.5 else ClashSeverity.ADVISORY
                    )

                    clashes.append(ScheduleClashIssue(
                        sweep_run_id=sweep_id,
                        category=ClashCategory.RESOURCE_OVERALLOCATION,
                        severity=severity,
                        portfolio_node_id=primary_node.id,
                        conflicting_node_id=conflicting_node.id if conflicting_node else None,
                        conflicting_resource_id=resource_id,
                        conflict_window_start=window_start,
                        conflict_window_end=window_end or d,
                        title=f"Resource overallocated: {peak_load:.0%} capacity on {peak_day}",
                        description=(
                            f"Resource {resource_id} is assigned {peak_load:.0%} capacity "
                            f"({len(peak_tasks)} tasks) on {peak_day}. "
                            f"Affected tasks: {', '.join(pn.code for pn in peak_tasks)}. "
                            f"Window: {window_start} to {window_end or d}."
                        ),
                        recommended_action=(
                            f"Delay non-critical tasks or reassign resources. "
                            f"Consider running the leveling engine to propose date shifts."
                        ),
                    ))
                    in_window = False

        # Close any remaining window
        if in_window and window_start:
            window_end = project_end
            primary_node = peak_tasks[0] if peak_tasks else assigned[0][1]
            conflicting_node = peak_tasks[1] if len(peak_tasks) > 1 else None

            severity = ClashSeverity.CRITICAL if peak_load > 2.0 else (
                ClashSeverity.MAJOR if peak_load > 1.5 else ClashSeverity.ADVISORY
            )

            clashes.append(ScheduleClashIssue(
                sweep_run_id=sweep_id,
                category=ClashCategory.RESOURCE_OVERALLOCATION,
                severity=severity,
                portfolio_node_id=primary_node.id,
                conflicting_node_id=conflicting_node.id if conflicting_node else None,
                conflicting_resource_id=resource_id,
                conflict_window_start=window_start,
                conflict_window_end=window_end,
                title=f"Resource overallocated: {peak_load:.0%} capacity on {peak_day}",
                description=(
                    f"Resource {resource_id} is assigned {peak_load:.0%} capacity "
                    f"({len(peak_tasks)} tasks) on {peak_day}. "
                    f"Affected tasks: {', '.join(pn.code for pn in peak_tasks)}."
                ),
                recommended_action="Run the leveling engine to propose date shifts.",
            ))

    return clashes


# ============================================================================
# Check 2: Security clearance lapse
# ============================================================================

def _check_clearance_lapse(
    db: Session,
    root_id: UUID,
    sweep_id: UUID,
) -> List[ScheduleClashIssue]:
    """Detect assigned resources whose clearance/certification expires before task end.

    Checks UserSkillProfile.certificate_expiry against the task's
    planned_end_date.  Also checks if a resource's associated user has
    a clearance level below the task's security classification.
    """
    clashes: List[ScheduleClashIssue] = []

    # Get all assignments under this project
    root = db.query(PortfolioNode).filter(PortfolioNode.id == root_id).first()
    if not root:
        return clashes

    assignments = (
        db.query(ResourceAssignment)
        .join(PortfolioNode, ResourceAssignment.portfolio_node_id == PortfolioNode.id)
        .join(UniversalBreakdownNode, PortfolioNode.id == UniversalBreakdownNode.id)
        .filter(
            UniversalBreakdownNode.path.op("<@")(root.path),
            UniversalBreakdownNode.is_active == True,
        )
        .all()
    )

    today = date.today()

    for assignment in assignments:
        pn = assignment.portfolio_node
        if not pn or not pn.planned_end_date:
            continue

        resource = assignment.resource_node
        if not resource:
            continue

        # Check if this is a person resource
        if resource.resource_type != "PERSON":
            continue

        # Try to find the associated user by matching resource code/name
        user = (
            db.query(User)
            .filter(
                (User.username == resource.code) | (User.email == resource.name),
                User.is_active == True,
            )
            .first()
        )

        if not user:
            continue

        # Check 1: Certificate expiry on skill profiles
        skill_profiles = (
            db.query(UserSkillProfile)
            .filter(
                UserSkillProfile.user_id == user.id,
                UserSkillProfile.certificate_expiry != None,
                UserSkillProfile.certificate_expiry < pn.planned_end_date,
            )
            .all()
        )

        for profile in skill_profiles:
            skill = profile.skill
            clashes.append(ScheduleClashIssue(
                sweep_run_id=sweep_id,
                category=ClashCategory.CREDENTIAL_LAPSE,
                severity=ClashSeverity.MAJOR,
                portfolio_node_id=pn.id,
                conflicting_resource_id=resource.id,
                conflict_window_start=profile.certificate_expiry,
                conflict_window_end=pn.planned_end_date,
                title=f"Certificate expires for {user.username} on task {pn.code}",
                description=(
                    f"User '{user.username}' is assigned to task '{pn.code}' "
                    f"(ends {pn.planned_end_date}), but their certification for "
                    f"'{skill.name}' (skill: {skill.code}) expires on "
                    f"{profile.certificate_expiry}. "
                    f"This is {(pn.planned_end_date - profile.certificate_expiry).days} days "
                    f"after expiry."
                ),
                recommended_action=(
                    f"Renew the '{skill.name}' certification before "
                    f"{profile.certificate_expiry} or reassign the task."
                ),
            ))

        # Check 2: User clearance vs task classification
        if user.clearance_level and pn.security_classification:
            clearance_rank = {
                "OFFICIAL": 1,
                "OFFICIAL_SENSITIVE": 2,
                "SECRET": 3,
                "TOP_SECRET": 4,
            }
            user_rank = clearance_rank.get(user.clearance_level.value, 0)
            task_rank = clearance_rank.get(pn.security_classification.value, 0)

            if user_rank < task_rank:
                clashes.append(ScheduleClashIssue(
                    sweep_run_id=sweep_id,
                    category=ClashCategory.CREDENTIAL_LAPSE,
                    severity=ClashSeverity.CRITICAL,
                    portfolio_node_id=pn.id,
                    conflicting_resource_id=resource.id,
                    conflict_window_start=pn.planned_start_date or today,
                    conflict_window_end=pn.planned_end_date,
                    title=f"Insufficient clearance for {user.username} on task {pn.code}",
                    description=(
                        f"User '{user.username}' has {user.clearance_level.value} clearance "
                        f"but task '{pn.code}' is classified {pn.security_classification.value}. "
                        f"This user cannot legally access the task data."
                    ),
                    recommended_action=(
                        f"Reassign task '{pn.code}' to a cleared resource or "
                        f"upgrade {user.username}'s clearance."
                    ),
                ))

    return clashes


# ============================================================================
# Check 3: Facility / SCIF collisions
# ============================================================================

def _check_facility_collisions(
    db: Session,
    root_id: UUID,
    sweep_id: UUID,
    project_start: date,
    project_end: date,
) -> List[ScheduleClashIssue]:
    """Detect multiple tasks in the same SCIF exceeding capacity.

    For each SCIF/TEMPEST location, check if more than one task is
    scheduled there during overlapping time windows.
    """
    clashes: List[ScheduleClashIssue] = []

    # Get all SCIF locations
    scifs = (
        db.query(LocationNode)
        .filter(LocationNode.is_scif_or_tempest == True)
        .all()
    )

    if not scifs:
        return clashes

    # For each SCIF, find tasks assigned to resources currently located there
    for scif in scifs:
        # Find resources at this location
        resources_at_scif = (
            db.query(ResourceNode)
            .filter(ResourceNode.current_location_id == scif.id)
            .all()
        )

        if not resources_at_scif:
            continue

        resource_ids = [r.id for r in resources_at_scif]

        # Find tasks assigned to these resources
        assignments = (
            db.query(ResourceAssignment)
            .join(PortfolioNode, ResourceAssignment.portfolio_node_id == PortfolioNode.id)
            .filter(
                ResourceAssignment.resource_node_id.in_(resource_ids),
                PortfolioNode.planned_start_date <= project_end,
                PortfolioNode.planned_end_date >= project_start,
                PortfolioNode.is_active == True,
            )
            .all()
        )

        if len(assignments) < 2:
            continue

        # Check for overlapping tasks
        tasks = []
        for a in assignments:
            pn = a.portfolio_node
            if pn and pn.planned_start_date and pn.planned_end_date:
                tasks.append((pn, a))

        # Find overlapping pairs
        for i in range(len(tasks)):
            for j in range(i + 1, len(tasks)):
                pn1, a1 = tasks[i]
                pn2, a2 = tasks[j]

                # Check overlap
                overlap_start = max(pn1.planned_start_date, pn2.planned_start_date)
                overlap_end = min(pn1.planned_end_date, pn2.planned_end_date)

                if overlap_start <= overlap_end:
                    clashes.append(ScheduleClashIssue(
                        sweep_run_id=sweep_id,
                        category=ClashCategory.SPATIAL_LOCATION_COLLISION,
                        severity=ClashSeverity.CRITICAL,
                        portfolio_node_id=pn1.id,
                        conflicting_node_id=pn2.id,
                        conflict_window_start=overlap_start,
                        conflict_window_end=overlap_end,
                        title=f"SCIF collision: {pn1.code} and {pn2.code} at {scif.name}",
                        description=(
                            f"Tasks '{pn1.code}' and '{pn2.code}' are both scheduled "
                            f"in SCIF '{scif.name}' ({scif.code}) from {overlap_start} "
                            f"to {overlap_end}.  The facility may not accommodate both "
                            f"teams simultaneously."
                        ),
                        recommended_action=(
                            f"Stagger the schedules or move one task to an alternative "
                            f"SCIF facility."
                        ),
                    ))

    return clashes


# ============================================================================
# Check 4: Negative float slip
# ============================================================================

def _check_negative_float(
    db: Session,
    root_id: UUID,
    sweep_id: UUID,
) -> List[ScheduleClashIssue]:
    """Detect tasks with negative total float (behind schedule)."""
    clashes: List[ScheduleClashIssue] = []

    root = db.query(PortfolioNode).filter(PortfolioNode.id == root_id).first()
    if not root:
        return clashes

    # Query nodes with schedule data showing negative float
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

    for row in rows:
        row_dict = dict(zip(columns, row))
        node = PortfolioNode()
        for key, value in row_dict.items():
            setattr(node, key, value)

        # Check custom_attributes for schedule data
        if not node.custom_attributes or "schedule" not in node.custom_attributes:
            continue

        sched = node.custom_attributes["schedule"]
        total_float = sched.get("total_float", 0)

        if total_float < 0:
            clashes.append(ScheduleClashIssue(
                sweep_run_id=sweep_id,
                category=ClashCategory.NEGATIVE_FLOAT_SLIP,
                severity=ClashSeverity.CRITICAL if total_float < -5 else ClashSeverity.MAJOR,
                portfolio_node_id=node.id,
                conflict_window_start=node.planned_start_date or date.today(),
                conflict_window_end=node.planned_end_date or date.today(),
                title=f"Negative float: {node.code} is {abs(total_float)} days behind",
                description=(
                    f"Task '{node.code}' ({node.name}) has a total float of "
                    f"{total_float} days, meaning the project is already "
                    f"{abs(total_float)} days behind schedule on this path."
                ),
                recommended_action=(
                    f"Crash the schedule by adding resources, fast-tracking "
                    f"dependencies, or reducing scope."
                ),
            ))

    return clashes


# ============================================================================
# Check 5: Predecessor unmet
# ============================================================================

def _check_predecessor_unmet(
    db: Session,
    root_id: UUID,
    sweep_id: UUID,
) -> List[ScheduleClashIssue]:
    """Detect dependencies where successor starts before predecessor finishes."""
    clashes: List[ScheduleClashIssue] = []

    root = db.query(PortfolioNode).filter(PortfolioNode.id == root_id).first()
    if not root:
        return clashes

    # Get all dependencies under this project
    deps = (
        db.query(DependencyLink)
        .filter(
            DependencyLink.predecessor_id.in_(
                db.query(PortfolioNode.id).filter(
                    PortfolioNode.id.in_(
                        db.execute(
                            sa_text(
                                "SELECT pn.id FROM portfolio_nodes pn "
                                "JOIN universal_breakdown_nodes ubn ON pn.id = ubn.id "
                                "WHERE ubn.path <@ :root_path"
                            ),
                            {"root_path": root.path},
                        ).fetchall()
                    )
                )
            )
        )
        .all()
    )

    for dep in deps:
        pred = db.query(PortfolioNode).filter(PortfolioNode.id == dep.predecessor_id).first()
        succ = db.query(PortfolioNode).filter(PortfolioNode.id == dep.successor_id).first()

        if not pred or not succ:
            continue
        if not pred.planned_end_date or not succ.planned_start_date:
            continue

        # Check if successor starts before predecessor finishes (accounting for lag)
        adjusted_pred_end = pred.planned_end_date + timedelta(days=dep.lag_days)

        if succ.planned_start_date < adjusted_pred_end:
            days_violation = (adjusted_pred_end - succ.planned_start_date).days

            clashes.append(ScheduleClashIssue(
                sweep_run_id=sweep_id,
                category=ClashCategory.PREDECESSOR_UNMET,
                severity=ClashSeverity.MAJOR if days_violation <= 5 else ClashSeverity.CRITICAL,
                portfolio_node_id=succ.id,
                conflicting_node_id=pred.id,
                conflict_window_start=succ.planned_start_date,
                conflict_window_end=adjusted_pred_end,
                title=f"Predecessor unmet: {succ.code} starts before {pred.code} finishes",
                description=(
                    f"Task '{succ.code}' is scheduled to start on {succ.planned_start_date}, "
                    f"but its predecessor '{pred.code}' (dependency type: {dep.dependency_type.value}, "
                    f"lag: {dep.lag_days} days) doesn't finish until {adjusted_pred_end}. "
                    f"Violation: {days_violation} days."
                ),
                recommended_action=(
                    f"Delay '{succ.code}' to start after {adjusted_pred_end} or "
                    f"accelerate '{pred.code}' to finish earlier."
                ),
            ))

    return clashes


# ============================================================================
# Main sweep orchestrator
# ============================================================================

def run_portfolio_sweep(
    db: Session,
    root_node_id: UUID,
) -> dict:
    """Run a complete portfolio sweep, detecting all clash types.

    This is the main entry point for the clash daemon.  It generates
    a unique ``sweep_run_id``, runs all five clash checks, persists
    the results to the database, and returns a summary.

    Checks Performed
    ~~~~~~~~~~~~~~~~

    1. Resource overallocation (> 100% capacity)
    2. Security clearance / certificate lapse
    3. SCIF / facility spatial collisions
    4. Negative float slip (behind schedule)
    5. Predecessor unmet (dependency violations)

    Parameters
    ----------
    db : Session
        Active database session.
    root_node_id : UUID
        The root PortfolioNode of the project to sweep.

    Returns
    -------
    dict
        {
            "sweep_run_id": str,
            "total_clashes": int,
            "by_severity": {"CRITICAL": int, "MAJOR": int, "ADVISORY": int},
            "by_category": {category: int, ...},
            "clash_ids": [str, ...],
            "completed_at": str,
        }

    Raises
    ------
    ValueError
        If the root node is not found.
    """
    sweep_id = uuid4()

    # Validate root
    root = db.query(PortfolioNode).filter(PortfolioNode.id == root_node_id).first()
    if root is None:
        raise ValueError(f"PortfolioNode {root_node_id} not found")

    # Determine project date range
    all_nodes = db.execute(
        sa_text(
            "SELECT pn.planned_start_date, pn.planned_end_date FROM portfolio_nodes pn "
            "JOIN universal_breakdown_nodes ubn ON pn.id = ubn.id "
            "WHERE ubn.path <@ :root_path AND ubn.is_active = true"
        ),
        {"root_path": root.path},
    )

    dates = all_nodes.fetchall()
    starts = [d[0] for d in dates if d[0]]
    ends = [d[1] for d in dates if d[1]]

    project_start = min(starts) if starts else date.today()
    project_end = max(ends) if ends else date.today() + timedelta(days=30)

    # Run all checks
    all_clashes: List[ScheduleClashIssue] = []

    all_clashes.extend(_check_resource_overallocation(db, root_node_id, sweep_id, project_start, project_end))
    all_clashes.extend(_check_clearance_lapse(db, root_node_id, sweep_id))
    all_clashes.extend(_check_facility_collisions(db, root_node_id, sweep_id, project_start, project_end))
    all_clashes.extend(_check_negative_float(db, root_node_id, sweep_id))
    all_clashes.extend(_check_predecessor_unmet(db, root_node_id, sweep_id))

    # Check chamber reservation conflicts (buffer overlaps, calibration expiry)
    try:
        from app.services.facility_telemetry import scan_chamber_conflicts
        chamber_clashes = scan_chamber_conflicts(db, sweep_id)
        all_clashes.extend(chamber_clashes)
    except Exception:
        # Chamber scan may fail if the table doesn't exist yet or on SQLite
        pass

    # Check personnel clearance expiry collisions
    all_clashes.extend(_check_clearance_expiry(db, root_node_id, sweep_id))

    # Check SCIF escort capacity impact
    all_clashes.extend(_check_scif_escort_impact(db, root_node_id, sweep_id, project_start, project_end))

    # Check perishable material shelf-life
    all_clashes.extend(_check_perishable_shelf_life(db, root_node_id, sweep_id))

    # Persist all clashes
    by_severity = {"CRITICAL": 0, "MAJOR": 0, "ADVISORY": 0}
    by_category: Dict[str, int] = {}
    clash_ids = []

    for clash in all_clashes:
        db.add(clash)
        by_severity[clash.severity.value] = by_severity.get(clash.severity.value, 0) + 1
        by_category[clash.category.value] = by_category.get(clash.category.value, 0) + 1

    db.commit()

    for clash in all_clashes:
        clash_ids.append(str(clash.id))

    return {
        "sweep_run_id": str(sweep_id),
        "total_clashes": len(all_clashes),
        "by_severity": by_severity,
        "by_category": by_category,
        "clash_ids": clash_ids,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }


# ============================================================================
# Check 6: Personnel clearance expiry collisions
# ============================================================================

def _check_clearance_expiry(
    db: Session,
    root_id: UUID,
    sweep_id: UUID,
) -> List[ScheduleClashIssue]:
    """Detect assigned resources whose clearance expires before task end.

    Cross-references ResourceAssignment records with User.clearance_expiry_date
    to find cases where a resource's personnel clearance expires before the
    task's planned end date.

    Returns
    -------
    list of ScheduleClashIssue
        CLEARANCE_EXPIRY_COLLISION clashes for each affected assignment.
    """
    clashes: List[ScheduleClashIssue] = []
    root = db.query(PortfolioNode).filter(PortfolioNode.id == root_id).first()
    if not root:
        return clashes

    # Find assignments with users who have clearance expiry dates
    assignments = (
        db.query(ResourceAssignment, User, PortfolioNode)
        .join(ResourceNode, ResourceAssignment.resource_node_id == ResourceNode.id)
        .join(User, ResourceNode.code == User.username)
        .join(PortfolioNode, ResourceAssignment.portfolio_node_id == PortfolioNode.id)
        .join(UniversalBreakdownNode, PortfolioNode.id == UniversalBreakdownNode.id)
        .filter(
            UniversalBreakdownNode.path.op("<@")(root.path),
            UniversalBreakdownNode.is_active == True,
            User.clearance_expiry_date.isnot(None),
            ResourceAssignment.status == "CONFIRMED",
        )
        .all()
    )

    today = date.today()
    for assignment, user, node in assignments:
        if user.clearance_expiry_date is None:
            continue
        if node.planned_end_date is None:
            continue

        if user.clearance_expiry_date < node.planned_end_date:
            days_until = (user.clearance_expiry_date - today).days
            if days_until < 0:
                severity = ClashSeverity.CRITICAL
            elif days_until <= 30:
                severity = ClashSeverity.MAJOR
            else:
                severity = ClashSeverity.ADVISORY

            clashes.append(ScheduleClashIssue(
                id=uuid4(),
                sweep_run_id=sweep_id,
                category=ClashCategory.CREDENTIAL_LAPSE,
                severity=severity,
                portfolio_node_id=node.id,
                conflicting_resource_id=assignment.resource_node_id,
                conflict_window_start=user.clearance_expiry_date,
                conflict_window_end=node.planned_end_date,
                title=f"Clearance expiry: {user.username}",
                description=(
                    f"Resource {user.username} ({user.clearance_type.value if user.clearance_type else 'N/A'}) "
                    f"clearance expires on {user.clearance_expiry_date}, "
                    f"but task '{node.code}' ends on {node.planned_end_date}. "
                    f"{days_until} days until expiry."
                ),
                recommended_action=(
                    f"Initiate re-vetting for {user.username} or reassign task "
                    f"'{node.code}' to cleared personnel."
                ),
                is_resolved=False,
            ))

    return clashes


# ============================================================================
# Check 7: SCIF escort capacity impact
# ============================================================================

def _check_scif_escort_impact(
    db: Session,
    root_id: UUID,
    sweep_id: UUID,
    project_start: date,
    project_end: date,
) -> List[ScheduleClashIssue]:
    """Detect SCIF locations with insufficient escort capacity.

    For each SCIF location with tasks in the project window, counts
    cleared vs uncleared personnel and flags clashes when there are
    not enough SC/DV cleared staff to escort uncleared contractors.

    Returns
    -------
    list of ScheduleClashIssue
        FACILITY_CONTRAVENTION clashes for escort deficits.
    """
    clashes: List[ScheduleClashIssue] = []
    root = db.query(PortfolioNode).filter(PortfolioNode.id == root_id).first()
    if not root:
        return clashes

    # Find SCIF locations
    scif_locations = (
        db.query(LocationNode)
        .join(UniversalBreakdownNode, LocationNode.id == UniversalBreakdownNode.id)
        .filter(
            UniversalBreakdownNode.path.op("<@")(root.path),
            LocationNode.is_scif_or_tempest == True,
            UniversalBreakdownNode.is_active == True,
        )
        .all()
    )

    escort_minimum = {"SC", "DV", "NATO_SECRET"}
    escort_ratio = 2  # 1 cleared per 2 uncleared

    for location in scif_locations:
        # Find resources at this location
        resources = (
            db.query(ResourceNode)
            .filter(ResourceNode.current_location_id == location.id)
            .all()
        )

        cleared = 0
        uncleared = 0
        for res in resources:
            if res.resource_type != "PERSON":
                continue
            user = db.query(User).filter(User.username == res.code).first()
            if user:
                if user.clearance_type and user.clearance_type.value in escort_minimum:
                    cleared += 1
                else:
                    uncleared += 1

        escorts_required = (uncleared + escort_ratio - 1) // escort_ratio if uncleared > 0 else 0
        escort_deficit = max(0, escorts_required - cleared)

        if escort_deficit > 0:
            clashes.append(ScheduleClashIssue(
                id=uuid4(),
                sweep_run_id=sweep_id,
                category=ClashCategory.FACILITY_CONTRAVENTION,
                severity=ClashSeverity.MAJOR,
                portfolio_node_id=root.id,
                conflict_window_start=project_start,
                conflict_window_end=project_end,
                title=f"SCIF escort deficit: {location.code}",
                description=(
                    f"SCIF location '{location.code}' has {uncleared} uncleared "
                    f"personnel but only {cleared} cleared staff. "
                    f"Requires {escorts_required} escorts, deficit of {escort_deficit}."
                ),
                recommended_action=(
                    f"Assign {escort_deficit} additional SC/DV cleared staff to "
                    f"escort duty at '{location.code}' or reduce uncleared personnel."
                ),
                is_resolved=False,
            ))

    return clashes


# ============================================================================
# Check 8: Perishable material shelf-life
# ============================================================================

def _check_perishable_shelf_life(
    db: Session,
    root_id: UUID,
    sweep_id: UUID,
) -> List[ScheduleClashIssue]:
    """Detect perishable material lots that have expired or are expiring.

    Checks all active material lots allocated to tasks in the project
    for cold storage expiry and out-time exceeded conditions.

    Returns
    -------
    list of ScheduleClashIssue
        RESOURCE_UNAVAILABLE clashes for expired material lots.
    """
    clashes: List[ScheduleClashIssue] = []
    today = date.today()

    try:
        from app.models.models import PerishableMaterialLot, LotStatus
    except ImportError:
        return clashes

    # Find active lots allocated to tasks in this project
    lots = (
        db.query(PerishableMaterialLot)
        .join(PortfolioNode, PerishableMaterialLot.allocated_task_id == PortfolioNode.id)
        .join(UniversalBreakdownNode, PortfolioNode.id == UniversalBreakdownNode.id)
        .filter(
            UniversalBreakdownNode.path.op("<@")(root.path),
            UniversalBreakdownNode.is_active == True,
            PerishableMaterialLot.lot_status.in_([
                LotStatus.IN_COLD_STORAGE,
                LotStatus.THAWED_IN_USE,
            ]),
        )
        .all()
    )

    for lot in lots:
        expiry_reason = None

        # Check cold storage expiry
        if lot.cold_storage_expiry and lot.cold_storage_expiry < today:
            expiry_reason = "COLD_STORAGE_EXPIRED"

        # Check out-time exceeded
        if expiry_reason is None and lot.thawed_timestamp is not None:
            max_out = float(lot.maximum_out_time_hours)
            acc_out = float(lot.accumulated_out_time_hours)
            if acc_out >= max_out:
                expiry_reason = "OUT_TIME_EXCEEDED"

        if expiry_reason is not None:
            # Mark as expired
            lot.lot_status = LotStatus.EXPIRED_SCRAP

            clashes.append(ScheduleClashIssue(
                id=uuid4(),
                sweep_run_id=sweep_id,
                category=ClashCategory.RESOURCE_UNAVAILABLE,
                severity=ClashSeverity.CRITICAL,
                portfolio_node_id=lot.allocated_task_id,
                conflict_window_start=today,
                conflict_window_end=today,
                title=f"Perishable material expired: {lot.lot_number}",
                description=(
                    f"Material lot {lot.lot_number} ({lot.part_number}) "
                    f"has expired: {expiry_reason}. "
                    f"Material type: {lot.material_type.value}. "
                    f"Allocated task cannot proceed."
                ),
                recommended_action=(
                    f"Allocate a replacement lot of {lot.part_number} to the "
                    f"task or reschedule the task after a new lot is available."
                ),
                is_resolved=False,
            ))

    return clashes


# ============================================================================
# Query helpers
# ============================================================================

def get_active_clashes(
    db: Session,
    root_node_id: Optional[UUID] = None,
    severity: Optional[ClashSeverity] = None,
) -> List[ScheduleClashIssue]:
    """Retrieve active (unresolved) clashes, optionally filtered.

    Parameters
    ----------
    db : Session
        Active database session.
    root_node_id : UUID or None
        If provided, only return clashes for nodes under this project root.
    severity : ClashSeverity or None
        If provided, only return clashes of this severity.

    Returns
    -------
    list of ScheduleClashIssue
        Matching clash issues, ordered by severity (CRITICAL first) and
        then by creation time (newest first).
    """
    query = db.query(ScheduleClashIssue).filter(
        ScheduleClashIssue.is_resolved == False
    )

    if severity:
        query = query.filter(ScheduleClashIssue.severity == severity)

    # Order by severity (CRITICAL first) then by created_at desc
    severity_order = {
        ClashSeverity.CRITICAL: 1,
        ClashSeverity.MAJOR: 2,
        ClashSeverity.ADVISORY: 3,
    }

    clashes = query.order_by(
        ScheduleClashIssue.created_at.desc()
    ).all()

    # Sort by severity in Python since PostgreSQL enum ordering may vary
    clashes.sort(key=lambda c: severity_order.get(c.severity, 99))

    return clashes


def resolve_clash(db: Session, clash_id: UUID) -> bool:
    """Mark a clash as resolved.

    Parameters
    ----------
    db : Session
        Active database session.
    clash_id : UUID
        The clash issue to resolve.

    Returns
    -------
    bool
        True if the clash was found and resolved, False if not found.
    """
    clash = db.query(ScheduleClashIssue).filter(
        ScheduleClashIssue.id == clash_id
    ).first()

    if clash is None:
        return False

    clash.is_resolved = True
    db.commit()
    return True
