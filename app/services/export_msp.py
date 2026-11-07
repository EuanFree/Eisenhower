"""Microsoft Project schedule export service with defence export sanitization.

This module serialises the live PortfolioNode WBS (Work Breakdown Structure),
activities, DependencyLink precedence records, and resource assignments into
the standard Microsoft Project XML schema.

What is the MS Project XML format?
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Microsoft Project can import/export schedules in an XML format rooted at::

    <Project xmlns="http://schemas.microsoft.com/project">

The schema includes elements for:

- **Calendar** — Working hours and exceptions.
- **Tasks** — Each task with ID, name, outline level, dates, and progress.
- **Predecessors** — Dependency links between tasks.
- **Resources** — Resource definitions.
- **Assignments** — Resource-to-task assignments with units and rates.

This format is widely supported and can be opened directly in MS Project
desktop or Project Online.

Export-Control Sanitization
~~~~~~~~~~~~~~~~~~~~~~~~~~~

In defence environments, schedule exports may be shared with subcontractors
or commercial partners who do not have the same security clearance as the
programme team.  Two sanitization toggles are provided:

1. **redact_classified_descriptions** — When enabled, any node whose
   ``security_classification`` is SECRET or higher has its ``name`` and
   ``code`` replaced with a generic placeholder (e.g., ``[RESTRICTED]``)
   so that classified work package names do not leak into the export.

2. **mask_commercial_labor_rates** — When enabled, all resource assignment
   ``rate_snapshot`` values are set to ``0.00`` in the export output,
   preventing proprietary rate information from reaching subcontractors.

Dependencies
~~~~~~~~~~~~

This service requires a live PostgreSQL instance to query the PortfolioNode
tree via ltree containment queries.  The CPM schedule should ideally be
calculated first so that Early Start/Finish and Late Start/Finish dates
are available in node ``custom_attributes``.
"""

from datetime import datetime, date
from typing import Dict, List, Optional, Tuple
from uuid import UUID, uuid4
import xml.etree.ElementTree as ET
from xml.dom import minidom

from sqlalchemy.orm import Session

from app.models.models import (
    DependencyLink,
    DependencyType,
    ForensicAuditLog,
    PortfolioNode,
    ResourceAssignment,
    ResourceNode,
    SecurityClassification,
    UniversalBreakdownNode,
)


# ============================================================================
# Security classification helpers
# ============================================================================

_SECURITY_RANK = {
    SecurityClassification.OFFICIAL: 0,
    SecurityClassification.OFFICIAL_SENSITIVE: 1,
    SecurityClassification.SECRET: 2,
    SecurityClassification.TOP_SECRET: 3,
}


def _is_classified_for_redaction(
    node: UniversalBreakdownNode,
) -> bool:
    """Return True if a node's classification warrants redaction.

    Nodes classified SECRET or above are redacted when
    ``redact_classified_descriptions`` is enabled.

    Parameters
    ----------
    node : UniversalBreakdownNode
        The node to check.

    Returns
    -------
    bool
        True if the node should be redacted.
    """
    return _SECURITY_RANK.get(node.security_classification, 0) >= _SECURITY_RANK[
        SecurityClassification.SECRET
    ]


def _sanitize_name(name: str, node: UniversalBreakdownNode) -> str:
    """Return the node name, potentially redacted.

    Parameters
    ----------
    name : str
        The original node name.
    node : UniversalBreakdownNode
        The node being exported.

    Returns
    -------
    str
        The name, or ``[RESTRICTED]`` if the node is classified.
    """
    if _is_classified_for_redaction(node):
        return "[RESTRICTED]"
    return name or ""


def _sanitize_code(code: str, node: UniversalBreakdownNode) -> str:
    """Return the node code, potentially redacted.

    Parameters
    ----------
    code : str
        The original node code.
    node : UniversalBreakdownNode
        The node being exported.

    Returns
    -------
    str
        The code, or ``[RESTRICTED]`` if the node is classified.
    """
    if _is_classified_for_redaction(node):
        return "[RESTRICTED]"
    return code or ""


# ============================================================================
# Data collection (shared pattern with export_p6)
# ============================================================================


def _collect_project_data(
    db: Session,
    root_id: UUID,
) -> Tuple[
    Optional[PortfolioNode],
    Dict[UUID, PortfolioNode],
    List[DependencyLink],
    Dict[UUID, List[ResourceAssignment]],
]:
    """Collect all data needed for the export from the database.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    root_id : UUID
        The root PortfolioNode ID for the project/programme.

    Returns
    -------
    tuple
        A 4-tuple of (root_node, nodes_dict, dependencies, assignments).

    Raises
    ------
    ValueError
        If the root node is not found.
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

    # Dependencies within the tree
    node_ids = list(nodes.keys())
    dependencies: List[DependencyLink] = []
    if node_ids:
        dependencies = (
            db.query(DependencyLink)
            .filter(
                DependencyLink.predecessor_id.in_(node_ids),
                DependencyLink.successor_id.in_(node_ids),
            )
            .all()
        )

    # Resource assignments for nodes in the tree
    assignments: Dict[UUID, List[ResourceAssignment]] = {}
    if node_ids:
        all_assignments = (
            db.query(ResourceAssignment)
            .filter(ResourceAssignment.portfolio_node_id.in_(node_ids))
            .all()
        )
        for assignment in all_assignments:
            assignments.setdefault(assignment.portfolio_node_id, []).append(assignment)

    return root, nodes, dependencies, assignments


# ============================================================================
# XML helpers
# ============================================================================

_NS = "http://schemas.microsoft.com/project"


def _set_text(parent: ET.Element, tag: str, text: str) -> ET.Element:
    """Create a child element with text content.

    Parameters
    ----------
    parent : ET.Element
        The parent XML element.
    tag : str
        The child element tag name.
    text : str
        The text content.

    Returns
    -------
    ET.Element
        The created child element.
    """
    elem = ET.SubElement(parent, f"{{{_NS}}}{tag}")
    elem.text = text
    return elem


def _format_msp_date(dt) -> Optional[str]:
    """Format a datetime or date object as an MS Project-compatible date string.

    MS Project uses the format ``YYYY-MM-DDTHH:MM:SS``.

    Parameters
    ----------
    dt : datetime or date or None
        The date to format.

    Returns
    -------
    str or None
        The formatted date string or None.
    """
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.strftime("%Y-%m-%dT%H:%M:%S")
    return dt.strftime("%Y-%m-%dT00:00:00")


def _compute_outline_level(node: UniversalBreakdownNode) -> int:
    """Compute the outline level from the ltree path.

    The outline level corresponds to the depth in the hierarchy.  A root
    node with path ``'1'`` has level 1, its children with path ``'1.2'``
    have level 2, and so on.

    Parameters
    ----------
    node : UniversalBreakdownNode
        The node to compute the level for.

    Returns
    -------
    int
        The outline level (1-based).
    """
    if node.path is None:
        return 1
    parts = str(node.path).split(".")
    return len(parts)


# ============================================================================
# XML generation
# ============================================================================


def _generate_msp_xml(
    root: PortfolioNode,
    nodes: Dict[UUID, PortfolioNode],
    dependencies: List[DependencyLink],
    assignments: Dict[UUID, List[ResourceAssignment]],
    redact_classified_descriptions: bool = False,
    mask_commercial_labor_rates: bool = False,
) -> str:
    """Generate a complete Microsoft Project XML file content.

    Parameters
    ----------
    root : PortfolioNode
        The root node of the project tree.
    nodes : dict
        All PortfolioNode descendants keyed by UUID.
    dependencies : list
        All DependencyLink records within the tree.
    assignments : dict
        Resource assignments keyed by portfolio_node_id.
    redact_classified_descriptions : bool, optional
        If True, redact names/codes of SECRET+ nodes.
    mask_commercial_labor_rates : bool, optional
        If True, set all rate_snapshot values to 0.00.

    Returns
    -------
    str
        The complete MS Project XML content as a pretty-printed string.
    """
    # Root element
    project = ET.Element("Project", xmlns=_NS)

    # --- Registered Name ---
    _set_text(project, "RegisteredName", "Eisenhower Portfolio Manager")

    # --- Calendar ---
    calendar = ET.SubElement(project, f"{{{_NS}}}Calendar")
    _set_text(calendar, "UID", "0")
    _set_text(calendar, "Name", "Standard")

    weekdefs = ET.SubElement(calendar, f"{{{_NS}}}WeekDefinitions")
    weekdef = ET.SubElement(weekdefs, f"{{{_NS}}}WeekDefinition")
    _set_text(weekdef, "Name", "Standard Week")

    days = ET.SubElement(weekdef, f"{{{_NS}}}Days")

    # Monday–Friday: working days
    for day_name in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]:
        day = ET.SubElement(days, f"{{{_NS}}}Day")
        _set_text(day, "DayType", "Working")
        _set_text(day, "DayWorking", "1")
        day_period = ET.SubElement(day, f"{{{_NS}}}DayWorkingTimes")
        period = ET.SubElement(day_period, f"{{{_NS}}}WorkingTime")
        _set_text(period, "FromTime", "08:00:00")
        _set_text(period, "ToTime", "17:00:00")

    # Saturday and Sunday: non-working
    for day_name in ["Saturday", "Sunday"]:
        day = ET.SubElement(days, f"{{{_NS}}}Day")
        _set_text(day, "DayType", "DayType_None")
        _set_text(day, "DayWorking", "0")

    _set_text(project, "CalendarUID", "0")

    # --- Tasks ---
    tasks_elem = ET.SubElement(project, f"{{{_NS}}}Tasks")

    # Sort nodes by path for proper hierarchy ordering
    sorted_nodes = sorted(nodes.values(), key=lambda n: n.path if n.path else "")

    # Build a mapping from node_id to task_index for predecessor references
    node_to_task_index: Dict[UUID, int] = {}
    task_index = 1

    for node in sorted_nodes:
        task = ET.SubElement(tasks_elem, f"{{{_NS}}}Task")

        _set_text(task, "UID", str(node.id))
        _set_text(task, "ID", str(task_index))

        task_name = _sanitize_name(node.name, node) if redact_classified_descriptions else (node.name or "")
        _set_text(task, "Name", task_name)

        # Outline level based on path depth
        outline_level = _compute_outline_level(node)
        _set_text(task, "OutlineLevel", str(outline_level))

        # Dates
        start = _format_msp_date(node.planned_start_date)
        finish = _format_msp_date(node.planned_end_date)
        if start:
            _set_text(task, "Start", start)
        if finish:
            _set_text(task, "Finish", finish)

        actual_start = _format_msp_date(node.actual_start_date)
        actual_finish = _format_msp_date(node.actual_end_date)
        if actual_start:
            _set_text(task, "ActualStart", actual_start)
        if actual_finish:
            _set_text(task, "ActualFinish", actual_finish)

        # Progress
        pct = int(node.percent_complete or 0)
        _set_text(task, "PercentComplete", str(pct))
        _set_text(task, "PercentWorkComplete", str(pct))

        # Mark summary tasks (nodes with children in the tree)
        has_children = any(
            n.parent_id == node.id for n in sorted_nodes if n.id != node.id
        )
        if has_children:
            _set_text(task, "Summary", "1")
        else:
            _set_text(task, "Summary", "0")

        # EVM fields as custom fields
        if node.pv is not None:
            _set_text(task, "CV", str(node.pv))
        if node.ev is not None:
            _set_text(task, "EV", str(node.ev))
        if node.ac is not None:
            _set_text(task, "AC", str(node.ac))

        node_to_task_index[node.id] = task_index
        task_index += 1

    # --- Predecessors ---
    if dependencies:
        # We need to add Predecessors elements to the corresponding tasks
        # Build a mapping from successor_id to predecessor info
        pred_map: Dict[UUID, List[Tuple[str, int]]] = {}
        for dep in dependencies:
            pred_task_id = node_to_task_index.get(dep.predecessor_id)
            succ_node_id = dep.successor_id
            if pred_task_id is not None:
                # MS Project predecessor format: ID[+/-lag][FS/SS/FF/SF]
                lag = dep.lag_days or 0
                dep_type = dep.dependency_type.value if dep.dependency_type else "FS"
                if lag >= 0:
                    pred_str = f"{pred_task_id}+{lag}{dep_type}"
                else:
                    pred_str = f"{pred_task_id}{lag}{dep_type}"
                pred_map.setdefault(succ_node_id, []).append(pred_str)

        # Add predecessors to tasks
        for node in sorted_nodes:
            preds = pred_map.get(node.id, [])
            if preds:
                # Find the task element by UID
                for task in tasks_elem:
                    uid_elem = task.find(f"{{{_NS}}}UID")
                    if uid_elem is not None and uid_elem.text == str(node.id):
                        pred_elem = ET.SubElement(task, f"{{{_NS}}}Predecessors")
                        pred_elem.text = ",".join(preds)
                        break

    # --- Resources ---
    resources_elem = ET.SubElement(project, f"{{{_NS}}}Resources")

    # Collect unique resources from assignments
    resource_ids: Dict[UUID, ResourceAssignment] = {}
    for node_id, node_assignments in assignments.items():
        for assignment in node_assignments:
            if assignment.resource_node_id not in resource_ids:
                resource_ids[assignment.resource_node_id] = assignment

    resource_index = 1
    for resource_id, assignment in resource_ids.items():
        resource = ET.SubElement(resources_elem, f"{{{_NS}}}Resource")
        _set_text(resource, "UID", str(resource_id))
        _set_text(resource, "ID", str(resource_index))
        _set_text(resource, "Name", f"Resource-{resource_id}")
        _set_text(resource, "Type", "1")  # 1 = Work resource

        # Rate
        rate = 0.00 if mask_commercial_labor_rates else float(assignment.rate_snapshot or 0)
        _set_text(resource, "StandardRate", f"{rate:.2f}")
        _set_text(resource, "StandardRateFormat", "2")  # 2 = Hour

        resource_index += 1

    # --- Assignments ---
    assignments_elem = ET.SubElement(project, f"{{{_NS}}}Assignments")

    for node_id, node_assignments in assignments.items():
        task_uid = node_to_task_index.get(node_id)
        if task_uid is None:
            continue

        for assignment in node_assignments:
            assignment_elem = ET.SubElement(assignments_elem, f"{{{_NS}}}Assignment")
            _set_text(assignment_elem, "UID", str(assignment.id))
            _set_text(assignment_elem, "TaskUID", str(node_id))
            _set_text(assignment_elem, "ResourceUID", str(assignment.resource_node_id))
            _set_text(assignment_elem, "PercentWorkComplete", "0")

            # Units (as percentage)
            units = int((assignment.allocated_units or 0) * 100)
            _set_text(assignment_elem, "Units", str(units))

    # Pretty-print the XML
    rough_string = ET.tostring(project, encoding="unicode", xml_declaration=False)
    dom = minidom.parseString(rough_string)
    pretty_xml = dom.toprettyxml(indent="  ", encoding=None)

    # Add XML declaration
    xml_output = '<?xml version="1.0" encoding="UTF-8"?>\n' + pretty_xml

    return xml_output


# ============================================================================
# Public API
# ============================================================================


def export_to_msp_xml(
    db: Session,
    root_id: UUID,
    user_upn: str = "system",
    redact_classified_descriptions: bool = False,
    mask_commercial_labor_rates: bool = False,
) -> str:
    """Export a project tree to Microsoft Project XML format.

    This is the main entry point for generating a Microsoft Project-compatible
    schedule export.  It collects all PortfolioNode descendants, their
    dependencies, and resource assignments, then serialises them into
    the MS Project XML schema.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    root_id : UUID
        The root PortfolioNode ID for the project/programme to export.
    user_upn : str, optional
        User Principal Name for the audit log entry.
    redact_classified_descriptions : bool, optional
        If True, replace names and codes of nodes classified SECRET or
        higher with ``[RESTRICTED]``.
    mask_commercial_labor_rates : bool, optional
        If True, set all resource rate_snapshot values to ``0.00`` in
        the export.

    Returns
    -------
    str
        The complete MS Project XML content as a pretty-printed string.

    Raises
    ------
    ValueError
        If the root node is not found.

    Notes
    -----
    An entry is written to :class:`ForensicAuditLog` with action type
    ``EXPORT`` to record the export event in the tamper-evident audit trail.
    """
    # Collect all project data
    root, nodes, dependencies, assignments = _collect_project_data(db, root_id)

    # Generate the MS Project XML content
    msp_xml = _generate_msp_xml(
        root,
        nodes,
        dependencies,
        assignments,
        redact_classified_descriptions=redact_classified_descriptions,
        mask_commercial_labor_rates=mask_commercial_labor_rates,
    )

    # Record audit log entry
    transaction_id = uuid4()
    prev_hash_entry = (
        db.query(ForensicAuditLog)
        .order_by(ForensicAuditLog.created_at.desc())
        .first()
    )
    prev_hash = prev_hash_entry.current_hash if prev_hash_entry else ""

    audit_entry = ForensicAuditLog.create_entry(
        transaction_id=transaction_id,
        user_upn=user_upn,
        client_ip=None,
        action_type="EXPORT",
        entity_type="PortfolioNode",
        entity_id=root_id,
        json_diff={
            "export_format": "MSP_XML",
            "node_count": len(nodes),
            "dependency_count": len(dependencies),
            "redact_classified": redact_classified_descriptions,
            "mask_rates": mask_commercial_labor_rates,
        },
        security_marking=f"{root.security_classification.value}",
        prev_hash=prev_hash,
    )
    db.add(audit_entry)
    db.commit()

    return msp_xml
