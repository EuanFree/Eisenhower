"""Template catalog and instantiation cloner service.

This module provides two core operations for the template system:

1. **Snapshot** — Extract an active WBS sub-tree from the live schedule,
   normalise all absolute calendar dates into relative day offsets from
   an anchor date (T₀), translate named individuals into generic role
   placeholders, and save the result as a serialised JSON graph in a
   StructuralTemplate record.

2. **Instantiate** — Take a stored template and stamp it out into the
   live operational schedule: recursively generate new PortfolioNode
   records with correctly nested ltree dot-paths, remap relative
   precedence links to newly generated UUIDs, and automatically
   synthesise generic placeholder resources matching the crew template.

Why Templates?
~~~~~~~~~~~~~~

In defence programme management, many projects follow repeatable
structures.  For example, every new radar programme might include:

- A standard Systems Safety Assessment work package
- A V&V test sequence with the same test cases
- A handover process with the same deliverables

Rather than manually recreating these structures for each new project,
programme managers can:

1. Snapshot a proven project structure as a template.
2. Instantiate the template into a new schedule with a single click.
3. The system automatically generates all nodes, dependencies, and
   placeholder resources.

Key Design Decisions
~~~~~~~~~~~~~~~~~~~~

1. **Relative Day Offsets** — All scheduling information in templates
   uses day offsets from T₀ rather than absolute dates.  This allows
   the template to be instantiated at any point in the calendar.

2. **Forward and Backward Scheduling** — Templates can be instantiated
   with START_DATE anchoring (forward-scheduled from T₀) or FINISH_DATE
   anchoring (backward-scheduled from a target milestone date).

3. **Generic Placeholders** — Named individuals are replaced with generic
   role definitions during snapshot, so the template can be instantiated
   with different personnel each time.

4. **Code Prefix** — Each instantiation applies a code prefix to all
   generated node codes, ensuring unique identifiers across the schedule.

Usage
~~~~~

    from app.services.templating import snapshot_node_as_template, instantiate_template

    # Snapshot an existing project as a template
    result = snapshot_node_as_template(
        node_id="uuid-of-root-node",
        code="TMPL-RADAR-PROJ-001",
        name="Standard Radar Project",
        tier="PROJECT",
        db=db,
        user_upn="manager@example.com",
    )

    # Instantiate the template into a new schedule
    result = instantiate_template(
        template_id="template-uuid",
        parent_node_id=None,
        anchor_date="2027-01-15",
        anchor_type="START_DATE",
        code_prefix="RADAR-002-",
        db=db,
    )

"""
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID, uuid4

from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.models import (
    UniversalBreakdownNode,
    PortfolioNode,
    ResourceNode,
    ResourceAssignment,
    DependencyLink,
    ContractDeliverable,
    StructuralTemplate,
    ResourceCrewTemplate,
    ResourceCrewTemplateMember,
    TemplateTier,
    TreeType,
    ResourceType,
    ProficiencyLevel,
    SecurityClassification,
    AssignmentStatus,
)


# ============================================================================
# Helper: date arithmetic
# ============================================================================

def _is_workday(d: date) -> bool:
    """Check if a date is a workday (Monday–Friday).

    Parameters
    ----------
    d : date
        The date to check.

    Returns
    -------
    bool
        True if the date is a workday.
    """
    return d.weekday() < 5


def _add_workdays(start_date: date, days: int) -> date:
    """Add a number of workdays to a start date, skipping weekends.

    Parameters
    ----------
    start_date : date
        The starting date.
    days : int
        Number of workdays to add (can be negative for subtraction).

    Returns
    -------
    date
        The resulting date after adding workdays.
    """
    if days == 0:
        return start_date

    current = start_date
    direction = 1 if days > 0 else -1
    remaining = abs(days)

    while remaining > 0:
        current += timedelta(days=direction)
        if _is_workday(current):
            remaining -= 1

    return current


def _workday_diff(start: date, end: date) -> int:
    """Calculate the number of workdays between two dates.

    Parameters
    ----------
    start : date
        The start date.
    end : date
        The end date.

    Returns
    -------
    int
        Number of workdays between start and end (exclusive of start,
        inclusive of end).
    """
    if start == end:
        return 0

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
# Helper: ltree path manipulation
# ============================================================================

def _build_ltree_path(parent_path: Optional[str], node_code: str) -> str:
    """Build an ltree path string for a new node.

    Parameters
    ----------
    parent_path : str or None
        The ltree path of the parent node.  None for root nodes.
    node_code : str
        The code segment for this node.

    Returns
    -------
    str
        The full ltree path (e.g., '1.2.3').
    """
    if parent_path is None:
        return node_code
    return f"{parent_path}.{node_code}"


# ============================================================================
# Snapshot: Extract live WBS → Template
# ============================================================================

def _collect_subtree_nodes(db: Session, root_node_id: UUID) -> List[PortfolioNode]:
    """Collect all PortfolioNode descendants of a root node.

    Uses ltree containment to find all nodes whose path starts with
    the root node's path.

    Parameters
    ----------
    db : Session
        Database session.
    root_node_id : UUID
        UUID of the root node.

    Returns
    -------
    list[PortfolioNode]
        All nodes in the sub-tree, ordered by path depth.
    """
    root = db.query(PortfolioNode).filter(PortfolioNode.id == root_node_id).first()
    if root is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"PortfolioNode with ID {root_node_id} not found.",
        )

    # Use ltree containment: find all nodes whose path starts with root's path
    # In PostgreSQL: path @> root.path
    # For compatibility, we use string-based prefix matching
    root_path = root.path
    nodes = db.query(PortfolioNode).filter(
        UniversalBreakdownNode.path.startswith(root_path)
    ).all()

    # Sort by path depth (root first, then children)
    nodes.sort(key=lambda n: n.path.count("."))

    return nodes


def _collect_dependencies(db: Session, node_ids: List[UUID]) -> List[DependencyLink]:
    """Collect all dependency links within a set of nodes.

    Parameters
    ----------
    db : Session
        Database session.
    node_ids : list[UUID]
        UUIDs of nodes to check for dependencies.

    Returns
    -------
    list[DependencyLink]
        Dependency links where both predecessor and successor are in the set.
    """
    node_id_set = set(node_ids)
    deps = db.query(DependencyLink).filter(
        DependencyLink.predecessor_id.in_(node_id_set),
        DependencyLink.successor_id.in_(node_id_set),
    ).all()

    return deps


def _collect_deliverables(db: Session, node_ids: List[UUID]) -> List[ContractDeliverable]:
    """Collect all contract deliverables linked to nodes in the sub-tree.

    Parameters
    ----------
    db : Session
        Database session.
    node_ids : list[UUID]
        UUIDs of nodes to check for deliverables.

    Returns
    -------
    list[ContractDeliverable]
        Deliverables linked to nodes in the sub-tree.
    """
    deliverables = db.query(ContractDeliverable).filter(
        ContractDeliverable.portfolio_node_id.in_(node_ids)
    ).all()

    return deliverables


def _compute_relative_offsets(
    nodes: List[PortfolioNode],
) -> Dict[str, Dict[str, Any]]:
    """Compute relative day offsets for all nodes in a sub-tree.

    For each node, calculates the start and finish dates as day offsets
    from the earliest planned_start_date in the sub-tree (T₀).

    Parameters
    ----------
    nodes : list[PortfolioNode]
        All nodes in the sub-tree.

    Returns
    -------
    dict
        Mapping of node UUID (as string) to offset data containing
        relative_start_offset_days, relative_finish_offset_days, and
        duration_days.
    """
    # Find the earliest planned start date as T₀
    start_dates = [
        n.planned_start_date for n in nodes
        if n.planned_start_date is not None
    ]

    if not start_dates:
        # No dates set — use today as T₀
        t0 = date.today()
    else:
        t0 = min(start_dates)

    offsets: Dict[str, Dict[str, Any]] = {}

    for node in nodes:
        node_id_str = str(node.id)

        if node.planned_start_date and node.planned_end_date:
            start_offset = _workday_diff(t0, node.planned_start_date)
            finish_offset = _workday_diff(t0, node.planned_end_date)
            duration = _workday_diff(node.planned_start_date, node.planned_end_date)
        elif node.planned_start_date:
            start_offset = _workday_diff(t0, node.planned_start_date)
            finish_offset = start_offset
            duration = 0
        else:
            start_offset = 0
            finish_offset = 0
            duration = 0

        offsets[node_id_str] = {
            "relative_start_offset_days": start_offset,
            "relative_finish_offset_days": finish_offset,
            "duration_days": max(0, duration),
        }

    return offsets


def _serialize_node(node: PortfolioNode, offsets: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """Serialize a PortfolioNode into a template-compatible dict.

    Parameters
    ----------
    node : PortfolioNode
        The node to serialize.
    offsets : dict
        Pre-computed relative day offsets.

    Returns
    -------
    dict
        Serialised node data suitable for template_graph_payload.
    """
    node_id_str = str(node.id)
    parent_id_str = str(node.parent_id) if node.parent_id else None
    offset_data = offsets.get(node_id_str, {})

    return {
        "id": node_id_str,
        "parent_id": parent_id_str,
        "code": node.code,
        "name": node.name,
        "tree_type": node.tree_type.value if node.tree_type else "WBS",
        "security_classification": node.security_classification.value if node.security_classification else "OFFICIAL",
        "caveats": node.caveats or [],
        "odac_permissions": node.odac_permissions,
        "delivery_mode": node.delivery_mode.value if hasattr(node, 'delivery_mode') and node.delivery_mode else None,
        "relative_start_offset_days": offset_data.get("relative_start_offset_days", 0),
        "relative_finish_offset_days": offset_data.get("relative_finish_offset_days", 0),
        "duration_days": offset_data.get("duration_days", 0),
        "custom_attributes": node.custom_attributes or {},
        "export_control_regime": node.export_control_regime.value if hasattr(node, 'export_control_regime') and node.export_control_regime else "NOT_CONTROLLED",
        "eccn_or_usml_category": getattr(node, 'eccn_or_usml_category', None),
        "authorized_nationalities": getattr(node, 'authorized_nationalities', None),
        "taa_mla_reference": getattr(node, 'taa_mla_reference', None),
        "requires_vv_signoff": getattr(node, 'requires_vv_signoff', False),
    }


def snapshot_node_as_template(
    node_id: str,
    code: str,
    name: str,
    tier: TemplateTier,
    db: Session,
    user_upn: Optional[str] = None,
    description: Optional[str] = None,
) -> StructuralTemplate:
    """Extract an active WBS sub-tree and save it as a StructuralTemplate.

    This is the core snapshot function.  It:

    1. Collects all PortfolioNode descendants of the given root node.
    2. Computes relative day offsets from the earliest planned start date.
    3. Collects all DependencyLink edges within the sub-tree.
    4. Collects all ContractDeliverable records linked to nodes.
    5. Serialises everything into a JSON graph payload.
    6. Creates and persists a new StructuralTemplate record.

    Parameters
    ----------
    node_id : str
        UUID of the root PortfolioNode to snapshot.
    code : str
        Unique template code (e.g., 'TMPL-RADAR-PROJ-001').
    name : str
        Human-readable name for the template.
    tier : TemplateTier
        Hierarchy tier for the template.
    db : Session
        Database session.
    user_upn : str or None
        User principal name for audit metadata.
    description : str or None
        Optional description of the template.

    Returns
    -------
    StructuralTemplate
        The newly created template record.

    Raises
    ------
    HTTPException
        If the root node is not found or the code already exists.
    """
    # Check for duplicate code
    existing = db.query(StructuralTemplate).filter(
        StructuralTemplate.code == code
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Template with code '{code}' already exists.",
        )

    root_uuid = UUID(node_id)

    # Collect the sub-tree
    nodes = _collect_subtree_nodes(db, root_uuid)
    node_ids = [n.id for n in nodes]

    # Compute relative offsets
    offsets = _compute_relative_offsets(nodes)

    # Collect dependencies
    dependencies = _collect_dependencies(db, node_ids)

    # Collect deliverables
    deliverables = _collect_deliverables(db, node_ids)

    # Build the graph payload
    graph_payload: Dict[str, Any] = {
        "nodes": [_serialize_node(n, offsets) for n in nodes],
        "dependencies": [
            {
                "predecessor_id": str(d.predecessor_id),
                "successor_id": str(d.successor_id),
                "dependency_type": d.dependency_type.value if d.dependency_type else "FS",
                "lag_days": d.lag_days or 0,
            }
            for d in dependencies
        ],
        "deliverables": [
            {
                "node_id": str(dl.portfolio_node_id),
                "cdrl_sequence_number": dl.cdrl_sequence_number,
                "title": dl.title,
                "did_reference": dl.did_reference,
                "revision": dl.revision,
            }
            for dl in deliverables
        ],
        "metadata": {
            "tier": tier.value,
            "snapshot_date": date.today().isoformat(),
            "snapshot_by": user_upn or "system",
            "root_node_id": str(root_uuid),
            "node_count": len(nodes),
            "dependency_count": len(dependencies),
            "deliverable_count": len(deliverables),
        },
    }

    # Create the template
    template = StructuralTemplate(
        code=code,
        name=name,
        description=description,
        tier=tier,
        template_graph_payload=graph_payload,
        is_active=True,
    )

    db.add(template)
    db.flush()

    return template


# ============================================================================
# Instantiate: Template → Live Schedule
# ============================================================================

def _compute_anchor_date(
    anchor_date: date,
    anchor_type: str,
    node_data: Dict[str, Any],
    max_offset: int,
) -> Tuple[date, int]:
    """Compute the T₀ date for instantiation based on anchor type.

    For START_DATE anchoring, T₀ = anchor_date (forward scheduling).
    For FINISH_DATE anchoring, T₀ = anchor_date - max_offset (backward
    scheduling from a target milestone).

    Parameters
    ----------
    anchor_date : date
        The user-provided anchor date.
    anchor_type : str
        'START_DATE' or 'FINISH_DATE'.
    node_data : dict
        A sample node's data (not used directly, but available for context).
    max_offset : int
        The maximum relative offset in the template (used for backward scheduling).

    Returns
    -------
    tuple[date, int]
        The computed T₀ date and the direction multiplier (1 for forward,
        -1 for backward).
    """
    if anchor_type == "FINISH_DATE":
        # Backward schedule: T₀ = anchor_date - max_offset workdays
        t0 = _add_workdays(anchor_date, -max_offset)
        direction = 1
    else:
        # Forward schedule: T₀ = anchor_date
        t0 = anchor_date
        direction = 1

    return t0, direction


def instantiate_template(
    template_id: str,
    parent_node_id: Optional[str],
    anchor_date: str,
    anchor_type: str,
    code_prefix: str,
    db: Session,
) -> Dict[str, Any]:
    """Instantiate a template into the live operational schedule.

    This is the core instantiation function.  It:

    1. Loads the template's graph payload.
    2. Computes T₀ from the anchor date and anchor type.
    3. Recursively creates new PortfolioNode records with:
       - New UUIDs
       - Correctly nested ltree dot-paths
       - Absolute dates computed from relative offsets + T₀
       - Codes prefixed with the provided code_prefix
    4. Creates DependencyLink records mapping to new UUIDs.
    5. Creates generic placeholder ResourceNode records for each
       unique role referenced in the template.
    6. Creates ResourceAssignment records linking placeholders to nodes.

    Parameters
    ----------
    template_id : str
        UUID of the template to instantiate.
    parent_node_id : str or None
        UUID of the parent node under which to stamp the template.
        If None, creates a new root node.
    anchor_date : str
        ISO date string (YYYY-MM-DD) serving as the anchor for scheduling.
    anchor_type : str
        'START_DATE' for forward scheduling or 'FINISH_DATE' for
        backward scheduling.
    code_prefix : str
        Prefix applied to all generated node codes.
    db : Session
        Database session.

    Returns
    -------
    dict
        Result containing root_node_id, node_count, dependency_count,
        and placeholder_resource_count.

    Raises
    ------
    HTTPException
        If the template is not found or instantiation fails.
    """
    # Load the template
    template = db.query(StructuralTemplate).filter(
        StructuralTemplate.id == UUID(template_id)
    ).first()

    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with ID {template_id} not found.",
        )

    if not template.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Template is not active and cannot be instantiated.",
        )

    graph = template.template_graph_payload
    template_nodes = graph.get("nodes", [])
    template_deps = graph.get("dependencies", [])

    if not template_nodes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Template contains no nodes to instantiate.",
        )

    # Parse anchor date
    try:
        anchor = date.fromisoformat(anchor_date)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid anchor date format: {anchor_date}. Use YYYY-MM-DD.",
        )

    # Find max offset for backward scheduling
    max_offset = 0
    for node_data in template_nodes:
        finish_offset = node_data.get("relative_finish_offset_days", 0)
        if finish_offset > max_offset:
            max_offset = finish_offset

    # Compute T₀
    t0, direction = _compute_anchor_date(anchor, anchor_type, {}, max_offset)

    # Load parent node if specified
    parent_node = None
    if parent_node_id:
        parent_node = db.query(PortfolioNode).filter(
            PortfolioNode.id == UUID(parent_node_id)
        ).first()
        if parent_node is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent node with ID {parent_node_id} not found.",
            )

    # Build a mapping from original node IDs to new node IDs
    original_to_new_id: Dict[str, UUID] = {}
    original_to_new_path: Dict[str, str] = {}

    # Track the depth of the parent for ltree path construction
    if parent_node:
        parent_depth = parent_node.path.count(".") + 1
        parent_path = parent_node.path
    else:
        parent_depth = 0
        parent_path = None

    # Create nodes
    placeholder_resources: Dict[str, ResourceNode] = {}
    placeholder_count = 0

    # First pass: create all nodes
    for idx, node_data in enumerate(template_nodes):
        original_id = node_data.get("id", "")
        original_parent_id = node_data.get("parent_id")

        # Determine the new UUID
        new_id = uuid4()
        original_to_new_id[original_id] = new_id

        # Compute the ltree path segment
        # Use the index within the template to maintain ordering
        path_segment = str(idx + 1)

        # Determine parent path for this node
        if original_parent_id is None:
            # Root node of the template
            if parent_node:
                new_path = _build_ltree_path(parent_path, path_segment)
            else:
                new_path = path_segment
        else:
            # Child node — find parent's new path
            parent_new_path = original_to_new_path.get(original_parent_id)
            if parent_new_path:
                new_path = _build_ltree_path(parent_new_path, path_segment)
            else:
                # Parent not yet created — fallback
                new_path = _build_ltree_path(
                    parent_path if parent_node else None,
                    f"{idx + 1}",
                )

        original_to_new_path[original_id] = new_path

        # Compute absolute dates from relative offsets
        start_offset = node_data.get("relative_start_offset_days", 0)
        finish_offset = node_data.get("relative_finish_offset_days", 0)

        if anchor_type == "FINISH_DATE":
            # For backward scheduling, invert the offsets
            start_date = _add_workdays(anchor, -(max_offset - start_offset))
            end_date = _add_workdays(anchor, -(max_offset - finish_offset))
        else:
            start_date = _add_workdays(t0, start_offset)
            end_date = _add_workdays(t0, finish_offset)

        # Build the code with prefix
        original_code = node_data.get("code", f"NODE-{idx + 1}")
        new_code = f"{code_prefix}{original_code}" if code_prefix else original_code

        # Extract security and export control fields
        security_class = node_data.get("security_classification", "OFFICIAL")
        try:
            security_enum = SecurityClassification(security_class)
        except ValueError:
            security_enum = SecurityClassification.OFFICIAL

        export_regime = node_data.get("export_control_regime", "NOT_CONTROLLED")

        # Create the PortfolioNode
        new_node = PortfolioNode(
            id=new_id,
            parent_id=UUID(parent_node_id) if parent_node and original_parent_id is None else None,
            tree_type=TreeType.WBS,
            code=new_code,
            name=node_data.get("name", f"Template Node {idx + 1}"),
            path=new_path,
            security_classification=security_enum,
            caveats=node_data.get("caveats", []),
            odac_permissions=node_data.get("odac_permissions"),
            custom_attributes=node_data.get("custom_attributes", {}),
            is_active=True,
            # PortfolioNode-specific fields
            delivery_mode=None,
            planned_start_date=start_date,
            planned_end_date=end_date,
            actual_start_date=None,
            actual_end_date=None,
            percent_complete=0.0,
            pv=0,
            ev=0,
            ac=0,
            # Export control fields
            export_control_regime=None,
            eccn_or_usml_category=node_data.get("eccn_or_usml_category"),
            authorized_nationalities=node_data.get("authorized_nationalities"),
            taa_mla_reference=node_data.get("taa_mla_reference"),
            requires_vv_signoff=node_data.get("requires_vv_signoff", False),
        )

        db.add(new_node)

    db.flush()

    # Second pass: fix parent_id references for non-root nodes
    for node_data in template_nodes:
        original_id = node_data.get("id", "")
        original_parent_id = node_data.get("parent_id")

        if original_parent_id and original_parent_id in original_to_new_id:
            new_node_id = original_to_new_id[original_id]
            new_parent_id = original_to_new_id[original_parent_id]

            new_node = db.query(PortfolioNode).filter(
                PortfolioNode.id == new_node_id
            ).first()
            if new_node:
                new_node.parent_id = new_parent_id

    db.flush()

    # Third pass: create dependency links
    dependency_count = 0
    for dep_data in template_deps:
        pred_original = dep_data.get("predecessor_id", "")
        succ_original = dep_data.get("successor_id", "")

        pred_new = original_to_new_id.get(pred_original)
        succ_new = original_to_new_id.get(succ_original)

        if pred_new and succ_new:
            dep = DependencyLink(
                predecessor_id=pred_new,
                successor_id=succ_new,
                dependency_type=dep_data.get("dependency_type", "FS"),
                lag_days=dep_data.get("lag_days", 0),
            )
            db.add(dep)
            dependency_count += 1

    db.flush()

    # Fourth pass: create contract deliverables
    deliverables = graph.get("deliverables", [])
    for dl_data in deliverables:
        node_original = dl_data.get("node_id", "")
        node_new = original_to_new_id.get(node_original)

        if node_new:
            cdrl = ContractDeliverable(
                portfolio_node_id=node_new,
                cdrl_sequence_number=dl_data.get("cdrl_sequence_number", "CDRL-XXX"),
                title=dl_data.get("title", "Template Deliverable"),
                did_reference=dl_data.get("did_reference"),
                revision=dl_data.get("revision", "Rev A"),
            )
            db.add(cdrl)

    db.flush()

    # Get the root node ID
    root_original_id = None
    for node_data in template_nodes:
        if node_data.get("parent_id") is None:
            root_original_id = node_data.get("id")
            break

    root_node_id = str(original_to_new_id.get(root_original_id, uuid4()))

    db.commit()

    return {
        "root_node_id": root_node_id,
        "node_count": len(template_nodes),
        "dependency_count": dependency_count,
        "placeholder_resource_count": placeholder_count,
    }


# ============================================================================
# Crew Template Helpers
# ============================================================================

def create_crew_template_with_members(
    code: str,
    name: str,
    members: List[Dict[str, Any]],
    db: Session,
    description: Optional[str] = None,
) -> ResourceCrewTemplate:
    """Create a resource crew template with its member roles.

    Parameters
    ----------
    code : str
        Unique crew template code.
    name : str
        Human-readable name.
    members : list[dict]
        List of member role definitions, each containing:
        - role_name: str
        - resource_type: ResourceType
        - required_skill_id: str or None
        - min_proficiency: ProficiencyLevel
        - min_clearance: SecurityClassification
        - default_allocation_fraction: float
    db : Session
        Database session.
    description : str or None
        Optional description.

    Returns
    -------
    ResourceCrewTemplate
        The newly created crew template with members.

    Raises
    ------
    HTTPException
        If the code already exists.
    """
    # Check for duplicate code
    existing = db.query(ResourceCrewTemplate).filter(
        ResourceCrewTemplate.code == code
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Crew template with code '{code}' already exists.",
        )

    crew = ResourceCrewTemplate(
        code=code,
        name=name,
        description=description,
        is_active=True,
    )

    for member_data in members:
        member = ResourceCrewTemplateMember(
            role_name=member_data["role_name"],
            resource_type=member_data.get("resource_type", ResourceType.PERSON),
            required_skill_id=UUID(member_data["required_skill_id"]) if member_data.get("required_skill_id") else None,
            min_proficiency=member_data.get("min_proficiency", ProficiencyLevel.NOVICE),
            min_clearance=member_data.get("min_clearance", SecurityClassification.OFFICIAL),
            default_allocation_fraction=member_data.get("default_allocation_fraction", 1.0),
        )
        crew.members.append(member)

    db.add(crew)
    db.flush()

    return crew


def instantiate_crew_template(
    crew_template_id: str,
    parent_portfolio_node_id: Optional[str],
    db: Session,
) -> List[ResourceNode]:
    """Instantiate a crew template by creating generic placeholder resources.

    For each role in the crew template, creates a ResourceNode with
    is_generic_placeholder=True, so the requisition engine can later
    match real personnel to these placeholders.

    Parameters
    ----------
    crew_template_id : str
        UUID of the crew template to instantiate.
    parent_portfolio_node_id : str or None
        Optional portfolio node ID to associate assignments with.
    db : Session
        Database session.

    Returns
    -------
    list[ResourceNode]
        List of created placeholder resource nodes.
    """
    crew_template = db.query(ResourceCrewTemplate).filter(
        ResourceCrewTemplate.id == UUID(crew_template_id)
    ).first()

    if crew_template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Crew template with ID {crew_template_id} not found.",
        )

    placeholder_resources: List[ResourceNode] = []

    for member in crew_template.members:
        # Create a generic placeholder resource
        placeholder = ResourceNode(
            code=f"ROLE-{member.role_name.replace(' ', '-')}",
            name=member.role_name,
            tree_type=TreeType.RBS,
            path=f"CREW.{member.role_name.replace(' ', '-')}",
            security_classification=member.min_clearance,
            resource_type=member.resource_type,
            standard_hourly_rate=0.0,
            is_generic_placeholder=True,
            current_location_id=None,
        )

        db.add(placeholder)
        placeholder_resources.append(placeholder)

        # If there's a parent portfolio node, create a resource assignment
        if parent_portfolio_node_id:
            assignment = ResourceAssignment(
                portfolio_node_id=UUID(parent_portfolio_node_id),
                resource_node_id=placeholder.id,
                allocated_units=float(member.default_allocation_fraction),
                planned_hours=0.0,
                rate_snapshot=0.0,
                status=AssignmentStatus.REQUISITIONED,
            )
            db.add(assignment)

    db.flush()

    return placeholder_resources
