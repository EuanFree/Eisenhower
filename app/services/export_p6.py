"""Primavera P6 schedule export service with defence export sanitization.

This module serialises the live PortfolioNode WBS (Work Breakdown Structure),
activities, DependencyLink precedence records, and working calendars into the
Primavera P6 ``.xer`` batch text format.

What is the .xer format?
~~~~~~~~~~~~~~~~~~~~~~~~

The ``.xer`` format is Primavera P6's native batch-import text format.  It
consists of a series of table blocks, each preceded by a header line that
declares the table name and column definitions.  For example::

    %T PROJWBS
    %O 1
    %K 1 PROJ_WBS_ELEMENT_ID
    %K 2 WBS_NAME
    %D |
    1|Project Root|

    %T TASK
    %O 1
    %K 1 ID
    %K 2 NAME
    %K 3 START_DATE
    %K 4 FINISH_DATE
    ...

Each table block begins with ``%T <table_name>``, followed by column
definitions (``%K`` lines), a delimiter declaration (``%D``), and then
the data rows.

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

from datetime import datetime, timezone, date
from typing import Dict, List, Optional, Tuple
from uuid import UUID, uuid4

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
# Data collection
# ============================================================================


def _collect_project_data(
    db: Session,
    root_id: UUID,
) -> Tuple[
    Optional[PortfolioNode],
    Dict[UUID, PortfolioNode],
    List[DependencyLink],
    Dict[UUID, ResourceAssignment],
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
        A 4-tuple of (root_node, nodes_dict, dependencies, assignments) where:
        - root_node: the root PortfolioNode
        - nodes_dict: mapping of node_id to PortfolioNode (all descendants)
        - dependencies: list of DependencyLink records within the tree
        - assignments: mapping of portfolio_node_id to ResourceAssignment records

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
# XER format generation
# ============================================================================


def _escape_xer_field(value: str) -> str:
    """Escape a field value for the XER format.

    The XER format uses ``|`` as the default delimiter.  Pipe characters
    within field values must be escaped as ``||``.  Newlines are replaced
    with spaces to keep rows on a single line.

    Parameters
    ----------
    value : str
        The raw field value.

    Returns
    -------
    str
        The escaped value safe for XER output.
    """
    if value is None:
        return ""
    value = str(value).replace("\n", " ").replace("\r", " ")
    return value.replace("|", "||")


def _format_xer_date(dt) -> str:
    """Format a datetime or date object as a P6-compatible date string.

    Parameters
    ----------
    dt : datetime or date or None
        The date to format.

    Returns
    -------
    str
        The date as ``YYYY-MM-DD`` or an empty string if None.
    """
    if dt is None:
        return ""
    if isinstance(dt, datetime):
        return dt.strftime("%Y-%m-%d")
    return dt.strftime("%Y-%m-%d")


def _generate_xer(
    root: PortfolioNode,
    nodes: Dict[UUID, PortfolioNode],
    dependencies: List[DependencyLink],
    assignments: Dict[UUID, List[ResourceAssignment]],
    redact_classified_descriptions: bool = False,
    mask_commercial_labor_rates: bool = False,
) -> str:
    """Generate a complete Primavera P6 .xer file content.

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
        The complete .xer file content as a string.
    """
    lines: List[str] = []

    # --- File header ---
    lines.append("%/P6")
    lines.append("%V 8.1")
    lines.append("%C 1")
    lines.append("")

    # --- Project table ---
    project_name = _sanitize_name(root.name, root) if redact_classified_descriptions else (root.name or "")
    lines.append("%T PROJ")
    lines.append("%O 1")
    lines.append("%K 1 PROJECT_ID")
    lines.append("%K 2 PROJECT_NAME")
    lines.append("%K 3 START_DATE")
    lines.append("%K 4 FINISH_DATE")
    lines.append("%K 5 STATUS_DATE")
    lines.append("%D |")
    lines.append(
        "|".join([
            _escape_xer_field(str(root.id)),
            _escape_xer_field(project_name),
            _format_xer_date(root.planned_start_date),
            _format_xer_date(root.planned_end_date),
            _format_xer_field(datetime.now(timezone.utc)),
        ])
    )
    lines.append("")

    # --- WBS table ---
    lines.append("%T PROJWBS")
    lines.append("%O 1")
    lines.append("%K 1 PROJ_WBS_ELEMENT_ID")
    lines.append("%K 2 WBS_NAME")
    lines.append("%K 3 PARENT_WBS_ID")
    lines.append("%K 4 WBS_CODE")
    lines.append("%D |")

    # Sort nodes by path for proper hierarchy ordering
    sorted_nodes = sorted(nodes.values(), key=lambda n: n.path if n.path else "")
    for node in sorted_nodes:
        wbs_id = _sanitize_code(node.code, node) if redact_classified_descriptions else (node.code or str(node.id))
        wbs_name = _sanitize_name(node.name, node) if redact_classified_descriptions else (node.name or "")
        parent_id = str(node.parent_id) if node.parent_id and node.parent_id in nodes else ""
        lines.append(
            "|".join([
                _escape_xer_field(wbs_id),
                _escape_xer_field(wbs_name),
                _escape_xer_field(parent_id),
                _escape_xer_field(wbs_id),
            ])
        )
    lines.append("")

    # --- Activity (Task) table ---
    lines.append("%T ACT")
    lines.append("%O 1")
    lines.append("%K 1 ID")
    lines.append("%K 2 NAME")
    lines.append("%K 3 WBS_ID")
    lines.append("%K 4 START_DATE")
    lines.append("%K 5 FINISH_DATE")
    lines.append("%K 6 ACTUAL_START")
    lines.append("%K 7 ACTUAL_FINISH")
    lines.append("%K 8 PCT_COMPLETE")
    lines.append("%K 9 ACT_TYPE")
    lines.append("%K 10 PV")
    lines.append("%K 11 EV")
    lines.append("%K 12 AC")
    lines.append("%D |")

    for node in sorted_nodes:
        wbs_id = _sanitize_code(node.code, node) if redact_classified_descriptions else (node.code or str(node.id))
        act_name = _sanitize_name(node.name, node) if redact_classified_descriptions else (node.name or "")

        # Determine activity type from completion
        act_type = "Task"
        if node.percent_complete == 100.0:
            act_type = "Task"
        elif node.planned_start_date and node.planned_end_date:
            act_type = "Task"

        # Extract schedule metrics from custom_attributes if available
        pv = node.pv or 0.0
        ev = node.ev or 0.0
        ac = node.ac or 0.0

        lines.append(
            "|".join([
                _escape_xer_field(str(node.id)),
                _escape_xer_field(act_name),
                _escape_xer_field(wbs_id),
                _format_xer_date(node.planned_start_date),
                _format_xer_date(node.planned_end_date),
                _format_xer_date(node.actual_start_date),
                _format_xer_date(node.actual_end_date),
                _escape_xer_field(str(int(node.percent_complete or 0))),
                _escape_xer_field(act_type),
                _escape_xer_field(str(pv)),
                _escape_xer_field(str(ev)),
                _escape_xer_field(str(ac)),
            ])
        )
    lines.append("")

    # --- Activity Predecessors (Dependencies) table ---
    if dependencies:
        lines.append("%T ACTREL")
        lines.append("%O 1")
        lines.append("%K 1 ID")
        lines.append("%K 2 PREDECESSOR_ID")
        lines.append("%K 3 SUCCESSOR_ID")
        lines.append("%K 4 REL_TYPE")
        lines.append("%K 5 LAG")
        lines.append("%D |")

        for dep in dependencies:
            # Map dependency type to P6 format
            rel_type_map = {
                DependencyType.FS: "FS",
                DependencyType.SS: "SS",
                DependencyType.FF: "FF",
                DependencyType.SF: "SF",
            }
            rel_type = rel_type_map.get(dep.dependency_type, "FS")

            lines.append(
                "|".join([
                    _escape_xer_field(str(dep.id)),
                    _escape_xer_field(str(dep.predecessor_id)),
                    _escape_xer_field(str(dep.successor_id)),
                    _escape_xer_field(rel_type),
                    _escape_xer_field(str(dep.lag_days or 0)),
                ])
            )
        lines.append("")

    # --- Resource Assignments table ---
    has_assignments = any(len(v) > 0 for v in assignments.values())
    if has_assignments:
        lines.append("%T ACTRES")
        lines.append("%O 1")
        lines.append("%K 1 ID")
        lines.append("%K 2 ACTIVITY_ID")
        lines.append("%K 3 RESOURCE_ID")
        lines.append("%K 4 UNITS")
        lines.append("%K 5 PLANNED_HOURS")
        lines.append("%K 6 RATE")
        lines.append("%D |")

        for node_id, node_assignments in assignments.items():
            for assignment in node_assignments:
                rate = 0.00 if mask_commercial_labor_rates else float(assignment.rate_snapshot or 0)
                lines.append(
                    "|".join([
                        _escape_xer_field(str(assignment.id)),
                        _escape_xer_field(str(assignment.portfolio_node_id)),
                        _escape_xer_field(str(assignment.resource_node_id)),
                        _escape_xer_field(str(assignment.allocated_units or 0)),
                        _escape_xer_field(str(assignment.planned_hours or 0)),
                        _escape_xer_field(f"{rate:.2f}"),
                    ])
                )
        lines.append("")

    # --- Calendar table (standard 5-day working calendar) ---
    lines.append("%T CALENDAR")
    lines.append("%O 1")
    lines.append("%K 1 ID")
    lines.append("%K 2 NAME")
    lines.append("%K 3 CALENDAR_TYPE")
    lines.append("%D |")
    lines.append("|".join([
        _escape_xer_field("Standard"),
        _escape_xer_field("Standard 5-Day Calendar"),
        _escape_xer_field("Project"),
    ]))
    lines.append("")

    # --- Calendar exceptions (weekends) ---
    lines.append("%T CALENDAR_EXCEPTION")
    lines.append("%O 1")
    lines.append("%K 1 CALENDAR_ID")
    lines.append("%K 2 DAY_OF_WEEK")
    lines.append("%K 3 EXCEPTION_TYPE")
    lines.append("%D |")
    # Saturday = 6, Sunday = 7 (non-working days)
    lines.append("|".join([
        _escape_xer_field("Standard"),
        _escape_xer_field("6"),
        _escape_xer_field("Nonworking"),
    ]))
    lines.append("|".join([
        _escape_xer_field("Standard"),
        _escape_xer_field("7"),
        _escape_xer_field("Nonworking"),
    ]))
    lines.append("")

    # --- Footer ---
    lines.append("%/ACT")
    lines.append("%/P6")

    return "\n".join(lines)


# ============================================================================
# Public API
# ============================================================================


def export_to_xer(
    db: Session,
    root_id: UUID,
    user_upn: str = "system",
    redact_classified_descriptions: bool = False,
    mask_commercial_labor_rates: bool = False,
) -> str:
    """Export a project tree to Primavera P6 .xer format.

    This is the main entry point for generating a Primavera P6-compatible
    schedule export.  It collects all PortfolioNode descendants, their
    dependencies, and resource assignments, then serialises them into
    the .xer batch text format.

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
        The complete .xer file content as a string.

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

    # Generate the XER content
    xer_content = _generate_xer(
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
            "export_format": "XER",
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

    return xer_content
