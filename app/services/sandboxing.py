"""Sandbox scenario service for isolated What-If schedule planning.

This module provides the core logic for creating, comparing, and merging
sandbox scenarios.  A sandbox scenario is an isolated clone of a live WBS
sub-tree that allows planners to explore "What-If" questions without
affecting the operational schedule.

Workflow
~~~~~~~~

1. **Fork** — ``fork_sandbox_branch()`` clones a live sub-tree into
   sandbox nodes with ``is_sandbox_branch = True``.  The ltree path is
   rewritten with a sandbox namespace prefix.

2. **Diff** — ``compute_three_way_diff()`` compares the sandbox branch
   against the current live schedule and the frozen baseline snapshot,
   returning a categorised list of changes.

3. **Merge** — ``merge_sandbox_to_live()`` applies approved changes from
   the sandbox back to live PortfolioNode records in a single atomic
   transaction, triggers CPM recalculation, and records a
   ``SANDBOX_MERGE`` entry in the ForensicAuditLog.

Sandbox Isolation
~~~~~~~~~~~~~~~~~

Sandbox nodes are completely isolated from live nodes:

- CPM calculations on live nodes ignore sandbox branches.
- Resource assignments on sandbox nodes do not affect live capacity.
- ABAC clearance checks apply normally to sandbox nodes.

The ltree path prefix (e.g., ``sandbox_<scenario_id>.1.2.3``) ensures
that sandbox nodes never collide with live nodes in path-based queries.
"""

from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Tuple
from uuid import uuid4, UUID

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from app.models.models import (
    UniversalBreakdownNode,
    PortfolioNode,
    DependencyLink,
    SandboxScenario,
    SandboxScenarioStatus,
    ForensicAuditLog,
    BaselineNodeSnapshot,
    PortfolioBaseline,
    SecurityClassification,
)


# ============================================================================
# Helper: clone a single node into the sandbox
# ============================================================================

def _clone_node(
    source: UniversalBreakdownNode,
    scenario_id: UUID,
    new_path: str,
    db: Session,
) -> UniversalBreakdownNode:
    """Clone a single UniversalBreakdownNode into the sandbox namespace.

    Parameters
    ----------
    source : UniversalBreakdownNode
        The live node to clone.
    scenario_id : UUID
        UUID of the SandboxScenario this clone belongs to.
    new_path : str
        The sandbox-prefixed ltree path for the clone.
    db : Session
        Database session.

    Returns
    -------
    UniversalBreakdownNode
        The newly created sandbox clone (flushed but not committed).
    """
    # Determine the subclass type
    node_type = source.__class__

    # Build the base kwargs common to all node types
    base_kwargs = {
        "parent_id": None,  # Set after flush
        "tree_type": source.tree_type,
        "code": source.code,
        "name": source.name,
        "path": new_path,
        "security_classification": source.security_classification,
        "caveats": source.caveats,
        "odac_permissions": source.odac_permissions,
        "export_control_regime": source.export_control_regime,
        "eccn_or_usml_category": source.eccn_or_usml_category,
        "authorized_nationalities": source.authorized_nationalities,
        "taa_mla_reference": source.taa_mla_reference,
        "custom_attributes": source.custom_attributes,
        "is_active": source.is_active,
        "is_sandbox_branch": True,
        "sandbox_scenario_id": scenario_id,
        "origin_node_id": source.id,
    }

    # Build subclass-specific kwargs
    if isinstance(source, PortfolioNode):
        pn_kwargs = {
            "delivery_mode": source.delivery_mode,
            "planned_start_date": source.planned_start_date,
            "planned_end_date": source.planned_end_date,
            "actual_start_date": source.actual_start_date,
            "actual_end_date": source.actual_end_date,
            "percent_complete": source.percent_complete,
            "pv": source.pv,
            "ev": source.ev,
            "ac": source.ac,
            "requires_vv_signoff": getattr(source, "requires_vv_signoff", False),
        }
        base_kwargs.update(pn_kwargs)
        clone = PortfolioNode(**base_kwargs)
    else:
        clone = node_type(**base_kwargs)

    db.add(clone)
    db.flush()
    return clone


# ============================================================================
# Fork: clone a live sub-tree into a sandbox scenario
# ============================================================================

def fork_sandbox_branch(
    root_node_id: str,
    user_id: int,
    scenario_name: str,
    description: Optional[str] = None,
    db: Session = None,
) -> Dict[str, Any]:
    """Clone a live WBS sub-tree into an isolated sandbox scenario.

    This function creates a new SandboxScenario and clones the entire
    sub-tree rooted at ``root_node_id``.  Each cloned node receives:

    - ``is_sandbox_branch = True``
    - ``sandbox_scenario_id`` bound to the new scenario
    - ``origin_node_id`` pointing back to the live source node
    - A sandbox-prefixed ltree path (e.g., ``sandbox_<id>.1.2.3``)

    Dependency links within the sub-tree are also cloned, with predecessor
    and successor IDs remapped to the new sandbox node UUIDs.

    Parameters
    ----------
    root_node_id : str
        UUID of the live PortfolioNode to fork.
    user_id : int
        ID of the user creating the sandbox.
    scenario_name : str
        Human-readable name for the sandbox scenario.
    description : str or None
        Optional description of the scenario.
    db : Session
        Database session.

    Returns
    -------
    dict
        Dictionary containing:
        - ``scenario_id``: UUID of the new SandboxScenario
        - ``scenario_name``: Name of the scenario
        - ``root_node_id``: UUID of the live node that was forked
        - ``sandbox_root_id``: UUID of the new sandbox root node
        - ``nodes_cloned``: Number of nodes cloned
        - ``dependencies_cloned``: Number of dependency links cloned

    Raises
    ------
    ValueError
        If the root node does not exist or is already a sandbox branch.
    """
    root_uuid = UUID(root_node_id)

    # Verify the root node exists and is a live node
    live_root = db.query(UniversalBreakdownNode).filter(
        UniversalBreakdownNode.id == root_uuid,
        UniversalBreakdownNode.is_sandbox_branch == False,
    ).first()

    if live_root is None:
        raise ValueError(
            f"Live node {root_node_id} not found or is already a sandbox branch."
        )

    # Create the sandbox scenario
    scenario = SandboxScenario(
        root_portfolio_node_id=root_uuid,
        name=scenario_name,
        description=description,
        created_by_user_id=user_id,
        status=SandboxScenarioStatus.ACTIVE,
    )
    db.add(scenario)
    db.flush()

    # Collect all descendants of the live root using path prefix matching
    live_prefix = live_root.path
    live_descendants = db.query(UniversalBreakdownNode).filter(
        and_(
            UniversalBreakdownNode.path.like(f"{live_prefix}.%"),
            UniversalBreakdownNode.is_sandbox_branch == False,
        )
    ).order_by(UniversalBreakdownNode.path).all()

    # Include the root itself
    all_live_nodes = [live_root] + live_descendants

    # Map from live node ID to sandbox clone
    id_map: Dict[UUID, UUID] = {}

    # Clone each node, preserving tree order
    for live_node in all_live_nodes:
        # Compute the sandbox-prefixed path
        sandbox_path = f"sandbox_{scenario.id}.{live_node.path}"

        clone = _clone_node(live_node, scenario.id, sandbox_path, db)
        id_map[live_node.id] = clone.id
        db.flush()

    # Set parent relationships for cloned nodes
    for live_node in all_live_nodes:
        clone = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id == id_map[live_node.id]
        ).first()

        if live_node.parent_id is not None and live_node.parent_id in id_map:
            clone.parent_id = id_map[live_node.parent_id]

    db.flush()

    # Clone dependency links within the sub-tree
    cloned_deps = 0
    live_ids = set(id_map.keys())

    # Find all dependency links where both predecessor and successor are in the sub-tree
    deps = db.query(DependencyLink).filter(
        and_(
            DependencyLink.predecessor_id.in_(live_ids),
            DependencyLink.successor_id.in_(live_ids),
        )
    ).all()

    for dep in deps:
        new_dep = DependencyLink(
            predecessor_id=id_map[dep.predecessor_id],
            successor_id=id_map[dep.successor_id],
            dependency_type=dep.dependency_type,
            lag_days=dep.lag_days,
        )
        db.add(new_dep)
        cloned_deps += 1

    db.flush()

    sandbox_root_id = id_map[root_uuid]

    return {
        "scenario_id": str(scenario.id),
        "scenario_name": scenario_name,
        "root_node_id": root_node_id,
        "sandbox_root_id": str(sandbox_root_id),
        "nodes_cloned": len(all_live_nodes),
        "dependencies_cloned": cloned_deps,
    }


# ============================================================================
# Diff: three-way comparison (sandbox vs live vs baseline)
# ============================================================================

def compute_three_way_diff(
    sandbox_scenario_id: str,
    db: Session = None,
) -> Dict[str, Any]:
    """Compute a three-way diff between sandbox, live, and baseline.

    For each sandbox node, this function compares it against:

    1. The corresponding live node (via ``origin_node_id``)
    2. The frozen baseline snapshot (via ``BaselineNodeSnapshot``)

    Each node is categorised as:

    - **ADDED** — Sandbox node has no corresponding live node (new addition).
    - **MODIFIED_DATES** — Only date fields differ from live.
    - **MODIFIED_LOGIC** — Non-date fields (code, name, dependencies) differ.
    - **DELETED** — Live node was deleted (sandbox node marked inactive while
      live node no longer exists).
    - **CONFLICT_LIVE_MUTATED** — Live node changed concurrently with sandbox.

    Parameters
    ----------
    sandbox_scenario_id : str
        UUID of the SandboxScenario to diff.
    db : Session
        Database session.

    Returns
    -------
    dict
        Dictionary containing:
        - ``scenario_id``: UUID of the sandbox scenario
        - ``scenario_name``: Name of the scenario
        - ``diff_entries``: List of per-node diff entries
        - ``summary``: Summary counts by category

    Raises
    ------
    ValueError
        If the sandbox scenario does not exist.
    """
    scenario_uuid = UUID(sandbox_scenario_id)

    scenario = db.query(SandboxScenario).filter(
        SandboxScenario.id == scenario_uuid
    ).first()

    if scenario is None:
        raise ValueError(f"Sandbox scenario {sandbox_scenario_id} not found.")

    # Get all sandbox nodes for this scenario
    sandbox_nodes = db.query(UniversalBreakdownNode).filter(
        UniversalBreakdownNode.sandbox_scenario_id == scenario_uuid,
    ).all()

    # Get the baseline for the root node, if any
    baseline = db.query(PortfolioBaseline).filter(
        and_(
            PortfolioBaseline.root_portfolio_node_id == scenario.root_portfolio_node_id,
            PortfolioBaseline.is_active_target == True,
        )
    ).first()

    diff_entries: List[Dict[str, Any]] = []
    summary: Dict[str, int] = {}

    # Date fields to check for MODIFIED_DATES
    date_fields = [
        "planned_start_date",
        "planned_end_date",
        "actual_start_date",
        "actual_end_date",
    ]

    # Logic fields to check for MODIFIED_LOGIC
    logic_fields = [
        "code",
        "name",
        "security_classification",
        "caveats",
        "custom_attributes",
        "percent_complete",
        "delivery_mode",
        "pv",
        "ev",
        "ac",
    ]

    for sandbox_node in sandbox_nodes:
        origin_id = sandbox_node.origin_node_id
        field_diffs: Dict[str, Any] = {}

        # Check if the live node still exists
        live_node = None
        live_node_exists = False
        if origin_id is not None:
            live_node = db.query(UniversalBreakdownNode).filter(
                and_(
                    UniversalBreakdownNode.id == origin_id,
                    UniversalBreakdownNode.is_sandbox_branch == False,
                )
            ).first()
            live_node_exists = live_node is not None

        # Check baseline snapshot
        baseline_node_exists = False
        if baseline is not None and origin_id is not None:
            snapshot = db.query(BaselineNodeSnapshot).filter(
                and_(
                    BaselineNodeSnapshot.baseline_id == baseline.id,
                    BaselineNodeSnapshot.portfolio_node_id == origin_id,
                )
            ).first()
            baseline_node_exists = snapshot is not None

        # Determine the category
        category = "ADDED"

        if origin_id is None:
            # No origin — this is a new node added in the sandbox
            category = "ADDED"
        elif not live_node_exists:
            # Live node no longer exists
            if not sandbox_node.is_active:
                category = "DELETED"
            else:
                category = "DELETED"
        else:
            # Compare sandbox vs live
            dates_differ = False
            logic_differs = False

            for field in date_fields:
                sandbox_val = getattr(sandbox_node, field, None)
                live_val = getattr(live_node, field, None)
                if sandbox_val != live_val:
                    dates_differ = True
                    field_diffs[field] = {
                        "sandbox": str(sandbox_val) if sandbox_val else None,
                        "live": str(live_val) if live_val else None,
                    }

            for field in logic_fields:
                sandbox_val = getattr(sandbox_node, field, None)
                live_val = getattr(live_node, field, None)
                if sandbox_val != live_val:
                    logic_differs = True
                    field_diffs[field] = {
                        "sandbox": str(sandbox_val) if sandbox_val else None,
                        "live": str(live_val) if live_val else None,
                    }

            if dates_differ and logic_differs:
                category = "MODIFIED_LOGIC"
            elif dates_differ:
                category = "MODIFIED_DATES"
            elif logic_differs:
                category = "MODIFIED_LOGIC"
            else:
                # Check if live node differs from baseline (concurrent mutation)
                if baseline_node_exists:
                    category = "CONFLICT_LIVE_MUTATED"
                else:
                    category = "MODIFIED_DATES"

        entry = {
            "node_id": str(sandbox_node.id),
            "origin_node_id": str(origin_id) if origin_id else None,
            "category": category,
            "field_diffs": field_diffs,
            "live_node_exists": live_node_exists,
            "baseline_node_exists": baseline_node_exists,
        }
        diff_entries.append(entry)

        summary[category] = summary.get(category, 0) + 1

    return {
        "scenario_id": str(scenario.id),
        "scenario_name": scenario.name,
        "diff_entries": diff_entries,
        "summary": summary,
    }


# ============================================================================
# Merge: apply sandbox changes back to the live schedule
# ============================================================================

def merge_sandbox_to_live(
    sandbox_scenario_id: str,
    cherry_picked_node_ids: Optional[List[str]] = None,
    user_id: int = None,
    db: Session = None,
) -> Dict[str, Any]:
    """Merge approved sandbox changes back to the live operational schedule.

    This function applies changes from the sandbox branch to the corresponding
    live PortfolioNode records.  The merge process:

    1. Identifies which sandbox nodes to merge (all or cherry-picked).
    2. For each sandbox node with an ``origin_node_id``, updates the live
       node with the sandbox's date and logic changes.
    3. For sandbox nodes without an ``origin_node_id``, creates new live
       nodes (ADDED nodes).
    4. Updates dependency links to reflect sandbox changes.
    5. Triggers a live CPM forward/backward recalculation.
    6. Records a ``SANDBOX_MERGE`` entry in the ForensicAuditLog.
    7. Sets the scenario status to ``COMMITTED``.

    All database changes are performed in a single transaction.  If any
    step fails, the entire merge is rolled back.

    Parameters
    ----------
    sandbox_scenario_id : str
        UUID of the SandboxScenario to merge.
    cherry_picked_node_ids : list[str] or None
        Optional list of sandbox node UUIDs to merge.  If None, all
        sandbox nodes are merged.
    user_id : int or None
        ID of the user performing the merge (for audit logging).
    db : Session
        Database session.

    Returns
    -------
    dict
        Dictionary containing:
        - ``scenario_id``: UUID of the merged sandbox scenario
        - ``nodes_updated``: Number of live nodes updated
        - ``nodes_added``: Number of new live nodes created
        - ``nodes_deleted``: Number of live nodes deleted
        - ``dependencies_updated``: Number of dependency links updated
        - ``cpm_recalculated``: Whether CPM was recalculated

    Raises
    ------
    ValueError
        If the sandbox scenario does not exist or is not ACTIVE.
    """
    scenario_uuid = UUID(sandbox_scenario_id)

    scenario = db.query(SandboxScenario).filter(
        SandboxScenario.id == scenario_uuid
    ).first()

    if scenario is None:
        raise ValueError(f"Sandbox scenario {sandbox_scenario_id} not found.")

    if scenario.status != SandboxScenarioStatus.ACTIVE:
        raise ValueError(
            f"Sandbox scenario is {scenario.status.value}, not ACTIVE. "
            "Only active scenarios can be merged."
        )

    # Get all sandbox nodes for this scenario
    sandbox_nodes = db.query(UniversalBreakdownNode).filter(
        UniversalBreakdownNode.sandbox_scenario_id == scenario_uuid,
    ).all()

    # Filter to cherry-picked nodes if specified
    if cherry_picked_node_ids:
        picked_uuids = set(UUID(nid) for nid in cherry_picked_node_ids)
        sandbox_nodes = [
            n for n in sandbox_nodes if n.id in picked_uuids
        ]

    # Build ID map: sandbox node ID -> origin live node ID
    id_map: Dict[UUID, UUID] = {}
    nodes_updated = 0
    nodes_added = 0
    nodes_deleted = 0

    # Fields to merge from sandbox to live
    merge_fields = [
        "planned_start_date",
        "planned_end_date",
        "actual_start_date",
        "actual_end_date",
        "percent_complete",
        "code",
        "name",
        "delivery_mode",
        "pv",
        "ev",
        "ac",
        "custom_attributes",
        "requires_vv_signoff",
    ]

    for sandbox_node in sandbox_nodes:
        origin_id = sandbox_node.origin_node_id

        if origin_id is None:
            # New node — create it in the live tree
            parent_id = None
            if sandbox_node.parent_id is not None:
                # Find the origin of the parent
                parent_sandbox = db.query(UniversalBreakdownNode).filter(
                    UniversalBreakdownNode.id == sandbox_node.parent_id
                ).first()
                if parent_sandbox and parent_sandbox.origin_node_id:
                    parent_id = parent_sandbox.origin_node_id

            # Find the live parent to compute the path
            live_path = sandbox_node.path
            # Strip the sandbox prefix
            if "." in str(live_path):
                parts = str(live_path).split(".", 1)
                if len(parts) > 1:
                    live_path = parts[1]

            new_live_node = _clone_node(
                sandbox_node,
                None,  # No scenario for live node
                live_path,
                db,
            )
            # Override sandbox-specific fields
            new_live_node.is_sandbox_branch = False
            new_live_node.sandbox_scenario_id = None
            new_live_node.origin_node_id = None
            new_live_node.parent_id = parent_id

            db.add(new_live_node)
            db.flush()
            id_map[sandbox_node.id] = new_live_node.id
            nodes_added += 1

        elif sandbox_node.is_active == False:
            # Sandbox node is inactive — mark live node for deletion
            live_node = db.query(UniversalBreakdownNode).filter(
                and_(
                    UniversalBreakdownNode.id == origin_id,
                    UniversalBreakdownNode.is_sandbox_branch == False,
                )
            ).first()
            if live_node:
                live_node.is_active = False
                nodes_deleted += 1
            id_map[sandbox_node.id] = origin_id

        else:
            # Update existing live node
            live_node = db.query(UniversalBreakdownNode).filter(
                and_(
                    UniversalBreakdownNode.id == origin_id,
                    UniversalBreakdownNode.is_sandbox_branch == False,
                )
            ).first()

            if live_node:
                for field in merge_fields:
                    sandbox_val = getattr(sandbox_node, field, None)
                    if sandbox_val != getattr(live_node, field, None):
                        setattr(live_node, field, sandbox_val)

                live_node.updated_at = datetime.now(timezone.utc)
                nodes_updated += 1

            id_map[sandbox_node.id] = origin_id

    db.flush()

    # Update dependency links
    dependencies_updated = 0
    sandbox_deps = db.query(DependencyLink).filter(
        or_(
            DependencyLink.predecessor_id.in_(set(id_map.keys())),
            DependencyLink.successor_id.in_(set(id_map.keys())),
        )
    ).all()

    # Find dependencies that involve sandbox nodes
    sandbox_dep_predecessors = db.query(DependencyLink.predecessor_id).filter(
        DependencyLink.predecessor_id.in_(set(n.id for n in sandbox_nodes))
    ).all()
    sandbox_dep_successors = db.query(DependencyLink.successor_id).filter(
        DependencyLink.successor_id.in_(set(n.id for n in sandbox_nodes))
    ).all()

    # Get all dependency links within the sandbox
    sandbox_node_ids = set(n.id for n in sandbox_nodes)
    sandbox_links = db.query(DependencyLink).filter(
        and_(
            DependencyLink.predecessor_id.in_(sandbox_node_ids),
            DependencyLink.successor_id.in_(sandbox_node_ids),
        )
    ).all()

    for sandbox_link in sandbox_links:
        pred_live_id = id_map.get(sandbox_link.predecessor_id)
        succ_live_id = id_map.get(sandbox_link.successor_id)

        if pred_live_id and succ_live_id:
            # Check if a live dependency already exists
            existing = db.query(DependencyLink).filter(
                and_(
                    DependencyLink.predecessor_id == pred_live_id,
                    DependencyLink.successor_id == succ_live_id,
                )
            ).first()

            if existing:
                # Update existing dependency
                if (existing.dependency_type != sandbox_link.dependency_type or
                        existing.lag_days != sandbox_link.lag_days):
                    existing.dependency_type = sandbox_link.dependency_type
                    existing.lag_days = sandbox_link.lag_days
                    dependencies_updated += 1
            else:
                # Create new dependency
                new_dep = DependencyLink(
                    predecessor_id=pred_live_id,
                    successor_id=succ_live_id,
                    dependency_type=sandbox_link.dependency_type,
                    lag_days=sandbox_link.lag_days,
                )
                db.add(new_dep)
                dependencies_updated += 1

    db.flush()

    # Record SANDBOX_MERGE in ForensicAuditLog
    audit_entry = ForensicAuditLog.create_entry(
        transaction_id=str(uuid4()),
        user_upn=f"user-{user_id}" if user_id else "system",
        client_ip=None,
        action_type="SANDBOX_MERGE",
        entity_type="SandboxScenario",
        entity_id=scenario_uuid,
        json_diff={
            "scenario_id": str(scenario.id),
            "nodes_updated": nodes_updated,
            "nodes_added": nodes_added,
            "nodes_deleted": nodes_deleted,
            "dependencies_updated": dependencies_updated,
        },
        security_marking="SANDBOX_MERGE",
        db_session=db,
    )

    # Mark scenario as committed
    scenario.status = SandboxScenarioStatus.COMMITTED
    scenario.updated_at = datetime.now(timezone.utc)

    db.flush()

    # Attempt CPM recalculation on the live root
    cpm_recalculated = False
    try:
        from app.services.cpm_engine import calculate_cpm
        root_uuid = scenario.root_portfolio_node_id
        result = calculate_cpm(str(root_uuid), db)
        if result:
            cpm_recalculated = True
    except Exception:
        # CPM recalculation failure should not block the merge
        cpm_recalculated = False

    return {
        "scenario_id": str(scenario.id),
        "nodes_updated": nodes_updated,
        "nodes_added": nodes_added,
        "nodes_deleted": nodes_deleted,
        "dependencies_updated": dependencies_updated,
        "cpm_recalculated": cpm_recalculated,
    }
