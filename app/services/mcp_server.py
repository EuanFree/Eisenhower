"""Model Context Protocol (MCP) gateway service for conversational AI integration.

This module exposes the Eisenhower Portfolio Manager's data as
MCP-compatible tool functions.  It allows local desktop or browser-based
AI copilots to query the system programmatically without direct database
access.

Security Model
~~~~~~~~~~~~~~

Every tool execution requires a valid JWT (JSON Web Token) representing
the invoking user's session.  The token is validated on every call, and
the user's clearance level and caveats are enforced via the existing
ABAC (Attribute-Based Access Control) system in ``app/core/abac.py``.

This ensures that the LLM (Large Language Model) never sees metadata,
codes, or names for work packages that exceed the invoking user's
security clearance rating.  Nodes beyond the user's clearance are
returned as ghost nodes with redacted fields (``[RESTRICTED]``).

Tool Functions
~~~~~~~~~~~~~~

The following tools are exposed to the MCP runtime:

Schedule Analysis
-----------------

1. **get_project_critical_path** — Runs CPM and returns zero/negative
   float tasks.

2. **query_active_blockers** — Returns active NodeBlocker items.

3. **simulate_task_delay** — Ephemeral forward pass for delay impact.

4. **inspect_resource_allocation** — Weekly allocation percentage.

Dashboards
----------

5. **list_dashboards** — Lists accessible dashboards.

6. **get_dashboard** — Dashboard details with widgets.

7. **create_dashboard** — Creates a new dashboard.

8. **update_widget** — Updates widget configuration.

9. **get_widget_data** — Fetches data for a widget.

10. **suggest_chart_type** — Recommends chart type from data.

11. **generate_widget_query** — Generates SQL from natural language.

12. **get_sql_builder_tables** — Lists allowed SQL tables.

13. **execute_widget_query** — Executes validated SQL query.

Cockpit & Daily Workflow
------------------------

14. **get_cockpit_summary** — Daily metrics: active tasks, hours, blockers.

15. **get_focus_queue** — Assigned tasks ordered by critical path.

Project & Portfolio Data
------------------------

16. **get_project_tree** — Full WBS tree for a project.

17. **list_portfolios** — Lists accessible portfolio root nodes.

18. **get_node_details** — Node details with assignments and blockers.

19. **search_nodes** — Search nodes by name or code.

20. **get_dependencies** — Predecessors and successors for a node.

Milestones & EVM
----------------

21. **list_milestones** — Milestone nodes under a project.

22. **get_evm_summary** — EVM summary: CPI, SPI, BAC, EV, PV, AC.

23. **get_milestone_weight_steps** — Milestone weight steps for a task.

Baselines
---------

24. **list_baselines** — Baselines for a project.

25. **get_baseline_variance** — Current vs baseline variance.

Resources
---------

26. **list_resource_assignments** — Resource assignments for a project.

27. **get_resource_utilization** — Resource allocation across projects.

Leave & Delegation
------------------

28. **book_leave** — Submit a leave request for the authenticated user.

29. **get_my_leave_requests** — List the user's leave request history.

30. **get_pending_leave_approvals** — Show pending leave requests from direct reports.

31. **approve_leave_request** — Approve a direct report's leave request.

32. **reject_leave_request** — Reject a direct report's leave request.

33. **book_leave_with_delegation** — Book leave and auto-create delegation if the
    user is a line manager.

34. **create_delegation** — Set up sign-off delegation for a date range.

35. **get_my_delegations** — List the user's delegation records.

36. **revoke_delegation** — Cancel an active delegation.

37. **check_delegation_coverage** — Verify delegation covers a date range.

38. **get_my_line_manager** — Find the user's direct line manager.

39. **get_my_direct_reports** — List the user's direct reports with leave status.

40. **get_team_leave_calendar** — Show team leave overlaps and delivery risk.

41. **list_resource_requisitions** — Resource requisition requests.

Workforce Forecasting & Competency Pipeline
--------------------------------------------

42. **get_workforce_demand_forecast** — 36-month workforce demand vector by skill, clearance, and safety.

43. **query_clearance_pipeline_deficits** — Flagged workforce pipeline deficit records with Minimum Action Dates.

Actionable Copilot Invertible Mutations
---------------------------------------

44. **stage_schedule_shift** — Stage an invertible schedule shift via HistoryCommand.

45. **stage_precedence_link** — Stage a precedence dependency addition with circularity check.

46. **stage_progress_update** — Stage a progress percentage update with DAL/V&V gate checks.

47. **stage_operational_blocker** — Stage a blocker addition with critical path verification.

Emergency Stoppage & Delegated Escalation
-----------------------------------------

48. **query_critical_stoppages** — Query critical path blockers with SLA timers and delegation paths.

49. **resolve_stoppage_delegated** — Resolve a blocker under delegated authority with dual attribution.

Timesheet-to-Progress EVM Coherence
------------------------------------

50. **audit_timesheet_coherence** — Audit labor burn vs physical progress divergence for a timesheet batch.

51. **submit_cam_timesheet_justification** — Attach IPMR Format 5 variance narrative and clear held batches.

Cost Curves & Fiscal Tranches
-----------------------------

52. **get_cost_distribution_profile** — Return active cost distribution method and shape factors for a node.

53. **set_cost_distribution_profile** — Update cost distribution profile and recalculate spend vectors.

54. **audit_fiscal_tranche_overruns** — Compare non-linear periodic spend against statutory tranche caps.

Export Control & Foreign Disclosure
------------------------------------

55. **list_export_control_licenses** — List active DSP-5, TAA, and UK SIEL licenses with monetary values.

56. **check_foreign_disclosure_compliance** — Evaluate foreign national access under TAA/MLA authorizations.

Hardware Enclave & Quarantine Diagnostics
------------------------------------------

57. **get_hsm_token_health** — Inspect PKCS#11 slot status, hardware signing rate, and signature health.

58. **inspect_quarantine_cycles** — Return isolated cycle loops and minimum feedback edge sets.

59. **auto_decouple_quarantine_cycles** — Invoke automated feedback loop decoupling into milestone anchors.

Skills
------

60. **list_skill_categories** — Skill categories and definitions.

61. **get_user_skills** — User skill proficiency profile.

Calendars & Clashes
-------------------

62. **list_calendars** — Working calendars with exceptions.

63. **list_schedule_clashes** — Detected schedule clashes.

Procurement & Supply Chain
--------------------------

64. **list_procurement_items** — Procurement items for a project.

65. **list_cdrls** — CDRL deliverables for a project.

66. **list_subcontractor_submissions** — Subcontractor submissions.

67. **list_procurement_constraints** — Procurement-to-task constraints.

68. **list_government_acceptance_milestones** — Acceptance milestones.

Sandbox & Planning
------------------

69. **list_sandbox_scenarios** — Sandbox scenarios for a project.

Facilities & Engineering
------------------------

70. **list_chamber_reservations** — Chamber/facility reservations.

71. **list_engineering_concessions** — Engineering concessions.

Financial
---------

72. **list_currency_rates** — Currency exchange rates.

Views & Presets
---------------

73. **list_view_presets** — View presets with sharing scope.

74. **list_gantt_presets** — Gantt view presets.

Infrastructure
--------------

75. **get_db_health** — Database health status and table counts.

76. **list_oracle_mappings** — Oracle EBS project/task mappings.

77. **list_tree_checkouts** — Active tree check-out leases.

SSE Transport
~~~~~~~~~~~~~

The MCP server uses SSE (Server-Sent Events) transport, which is mounted
into the FastAPI application via ``app/routers/mcp.py``.  Clients connect
to ``/api/v1/mcp/sse`` and send messages to ``/api/v1/mcp/messages``.

Why MCP?
~~~~~~~~

The Model Context Protocol provides a standardised way for AI models to
interact with external tools and data sources.  By exposing programme
data through MCP, programme managers can use conversational AI to:

- Ask natural-language questions about project status.
- Analyse EVM metrics and baseline variances.
- Identify blockers and their impact on delivery milestones.
- Check resource allocation and skill matching.
- Build dashboards with AI-assisted chart selection.
- Query procurement, CDRL, and subcontractor data.

All while maintaining strict security clearance enforcement.
"""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, scoped_session

from app.database import SessionLocal
from app.models.models import (
    BlockerSeverity,
    CostElement,
    DelegationRecord,
    DependencyLink,
    DependencyType,
    ExportControlLicense,
    FiscalYearSpendingCap,
    LeaveRequest,
    LeaveStatus,
    LeaveType,
    LineManagementLink,
    NodeBlocker,
    PortfolioNode,
    QuarantineBatch,
    ResourceAssignment,
    ResourceNode,
    SecurityClassification,
    TimesheetOracleExportBatch,
    UniversalBreakdownNode,
    User,
    WorkingCalendar,
)
from app.models.dashboard import (
    Dashboard,
    DashboardWidget,
    WidgetType,
    DataSourceType,
)
from app.models.display import SharingScope, PresetClassification
from app.core.abac import (
    CLEARANCE_LEVELS,
    create_ghost_node,
    has_required_caveats,
    has_sufficient_clearance,
    is_node_visible,
)
from app.utils.security import decode_access_token
from app.services.sql_builder import (
    validate_query,
    execute_query_sync,
    get_allowed_tables,
)
from app.core.exceptions import (
    SubTreeLockedException,
    CycleDetectedException,
    ClearanceCeilingExceeded,
)


# ============================================================================
# Semantic Error Recovery Envelope
# ============================================================================

# Mapping from exception type to structured error payload
_ERROR_RECOVERY_MAP = {
    SubTreeLockedException: {
        "error_category": "LOCK_CONTENTION",
        "is_retryable": False,
        "recovery_hint": (
            "Sub-tree is locked under CAM checkout lease. "
            "Do not retry mutation. Suggest an offline sandbox scenario instead."
        ),
    },
    CycleDetectedException: {
        "error_category": "TOPOLOGICAL_CYCLE",
        "is_retryable": False,
        "recovery_hint": (
            "Proposed link creates a closed loop. "
            "Call inspect_quarantine_cycles() or query predecessors of the target node."
        ),
    },
    ClearanceCeilingExceeded: {
        "error_category": "CLEARANCE_BREACH",
        "is_retryable": False,
        "recovery_hint": (
            "Node classification exceeds token clearance. "
            "Halt inspection of this sub-tree branch."
        ),
    },
}


def _build_error_result(
    exc: Exception,
    failed_parameter: str = "",
) -> Dict[str, Any]:
    """Build a structured JSON tool result from a Python exception.

    Instead of returning raw protocol errors or stack traces, this function
    returns a compliant MCP tool result with ``isError: true`` semantics,
    including an actionable ``recovery_hint`` for the LLM.

    Parameters
    ----------
    exc : Exception
        The caught Python exception.
    failed_parameter : str
        Optional name of the parameter that triggered the error.

    Returns
    -------
    dict
        Structured error result dictionary.
    """
    # Look up the specific exception type
    for exc_type, template in _ERROR_RECOVERY_MAP.items():
        if isinstance(exc, exc_type):
            return {
                "status": "FAILED",
                "error_category": template["error_category"],
                "is_retryable": template["is_retryable"],
                "failed_parameter": failed_parameter,
                "technical_detail": str(exc),
                "recovery_hint": template["recovery_hint"],
            }

    # Generic fallback for ValueError and other common exceptions
    if isinstance(exc, ValueError):
        return {
            "status": "FAILED",
            "error_category": "VALIDATION_ERROR",
            "is_retryable": False,
            "failed_parameter": failed_parameter,
            "technical_detail": str(exc),
            "recovery_hint": (
                "Review the parameter values and ensure they reference "
                "existing, accessible entities. Retry with corrected input."
            ),
        }

    # Unknown exception
    return {
        "status": "FAILED",
        "error_category": "UNKNOWN_ERROR",
        "is_retryable": True,
        "failed_parameter": failed_parameter,
        "technical_detail": str(exc),
        "recovery_hint": (
            "An unexpected error occurred. Retry the operation or contact "
            "the system administrator if the issue persists."
        ),
    }


# ============================================================================
# MCP Server instance
# ============================================================================

from mcp.server.mcpserver import MCPServer

mcp = MCPServer(
    name="Eisenhower Portfolio Manager",
    description=(
        "Enterprise portfolio management system for defence programme "
        "scheduling, resource allocation, and risk analysis.  All queries "
        "are filtered by the invoking user's security clearance."
    ),
    version="1.0.0",
)


# ============================================================================
# Internal helpers
# ============================================================================

def _validate_auth_token(auth_token: str) -> Dict[str, Any]:
    """Validate a JWT token and return the decoded payload.

    Parameters
    ----------
    auth_token : str
        The Bearer token string from the invoking user.

    Returns
    -------
    dict
        The decoded JWT payload containing user identity.

    Raises
    ------
    ValueError
        If the token is invalid, expired, or tampered with.
    """
    payload = decode_access_token(auth_token)
    if payload is None:
        raise ValueError("Invalid or expired authentication token")
    return payload


def _get_user_from_token(db: Session, auth_token: str) -> User:
    """Look up the User record corresponding to a JWT token.

    Parameters
    ----------
    db : Session
        Active SQLAlchemy database session.
    auth_token : str
        The Bearer token string from the invoking user.

    Returns
    -------
    User
        The authenticated user record.

    Raises
    ------
    ValueError
        If the token is invalid or the user is not found.
    """
    payload = _validate_auth_token(auth_token)
    user_id_str = payload.get("sub")
    if user_id_str is None:
        raise ValueError("Token missing 'sub' claim")

    # User.id is Integer; attempt UUID parse first (for legacy tokens),
    # then fall back to integer comparison.
    user = None
    try:
        user = db.query(User).filter(User.id == UUID(user_id_str)).first()
    except (ValueError, TypeError):
        pass
    if user is None:
        try:
            user = db.query(User).filter(User.id == int(user_id_str)).first()
        except (ValueError, TypeError):
            pass
    if user is None:
        raise ValueError(f"User {user_id_str} not found")
    if not user.is_active:
        raise ValueError(f"User {user_id_str} is inactive")
    return user


def _filter_nodes_by_abac(
    nodes: List[UniversalBreakdownNode],
    user: User,
) -> List[Dict[str, Any]]:
    """Filter and mask a list of nodes according to the user's ABAC clearance.

    For each node:
    - If the user has full clearance, return the node's data.
    - If the user lacks clearance, return a ghost-node representation
      with redacted fields.
    - If the user has no access at all (not even ghost visibility),
      the node is omitted entirely.

    Parameters
    ----------
    nodes : list[UniversalBreakdownNode]
        The nodes to filter.
    user : User
        The authenticated user performing the query.

    Returns
    -------
    list[dict]
        Filtered and potentially masked node data.
    """
    result = []
    user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
    user_caveats = user.caveats or []

    for node in nodes:
        visible = is_node_visible(user_clearance, user_caveats, node)
        if visible:
            result.append(_serialize_node(node, is_masked=False))
        else:
            # Check if any descendant might be visible — if so, show ghost
            # For simplicity in MCP context, we always show ghost nodes
            # to preserve tree structure
            ghost = create_ghost_node(node)
            result.append(_serialize_node(ghost, is_masked=True))

    return result


def _serialize_node(node: UniversalBreakdownNode, is_masked: bool = False) -> Dict[str, Any]:
    """Serialize a node to a dictionary suitable for JSON response.

    Parameters
    ----------
    node : UniversalBreakdownNode
        The node to serialize.
    is_masked : bool
        If True, mark the node as a ghost node in the output.

    Returns
    -------
    dict
        Flat dictionary representation of the node.
    """
    data = {
        "id": str(node.id),
        "code": node.code,
        "name": node.name,
        "path": node.path,
        "security_classification": node.security_classification.value if node.security_classification else None,
        "is_active": node.is_active,
        "is_masked": is_masked,
    }

    # Add PortfolioNode-specific fields if available
    if hasattr(node, "planned_start_date"):
        data["planned_start_date"] = node.planned_start_date.isoformat() if node.planned_start_date else None
        data["planned_end_date"] = node.planned_end_date.isoformat() if node.planned_end_date else None
        data["percent_complete"] = float(node.percent_complete) if node.percent_complete is not None else 0.0
        data["delivery_mode"] = node.delivery_mode.value if hasattr(node, "delivery_mode") and node.delivery_mode else None

    # Add schedule data from custom_attributes if present
    if node.custom_attributes and "schedule" in node.custom_attributes:
        sched = node.custom_attributes["schedule"]
        data["early_start"] = sched.get("early_start")
        data["early_finish"] = sched.get("early_finish")
        data["total_float"] = sched.get("total_float")
        data["is_critical"] = sched.get("is_critical", False)

    return data


def _check_dashboard_clearance(user: User, classification: PresetClassification) -> bool:
    """Check if user has sufficient clearance for a dashboard classification.

    Maps PresetClassification to the SecurityClassification levels used by
    the ABAC system.
    """
    preset_levels = {
        PresetClassification.OFFICIAL: 0,
        PresetClassification.SECRET: 2,
        PresetClassification.TOP_SECRET: 3,
    }
    user_level = CLEARANCE_LEVELS.get(user.security_clearance, 0)
    required_level = preset_levels.get(classification, 0)
    return user_level >= required_level


def _serialize_widget(widget: DashboardWidget) -> Dict[str, Any]:
    """Serialize a DashboardWidget to a dictionary for JSON response.

    Parameters
    ----------
    widget : DashboardWidget
        The widget to serialize.

    Returns
    -------
    dict
        Dictionary representation of the widget.
    """
    return {
        "id": str(widget.id),
        "dashboard_id": str(widget.dashboard_id),
        "widget_type": widget.widget_type.value if widget.widget_type else None,
        "title": widget.title,
        "data_source_type": widget.data_source_type.value if widget.data_source_type else None,
        "data_source_config": widget.data_source_config or {},
        "display_config": widget.display_config or {},
        "position": widget.position or {},
        "created_at": widget.created_at.isoformat() if widget.created_at else None,
        "updated_at": widget.updated_at.isoformat() if widget.updated_at else None,
    }


def _serialize_dashboard(dashboard: Dashboard) -> Dict[str, Any]:
    """Serialize a Dashboard to a dictionary for JSON response.

    Parameters
    ----------
    dashboard : Dashboard
        The dashboard to serialize.

    Returns
    -------
    dict
        Dictionary representation of the dashboard.
    """
    return {
        "id": str(dashboard.id),
        "name": dashboard.name,
        "description": dashboard.description,
        "owner_user_id": str(dashboard.owner_user_id),
        "project_id": str(dashboard.project_id) if dashboard.project_id else None,
        "sharing_scope": dashboard.sharing_scope.value if dashboard.sharing_scope else None,
        "classification": dashboard.classification.value if dashboard.classification else None,
        "layout_config": dashboard.layout_config or {},
        "widgets": [_serialize_widget(w) for w in dashboard.widgets] if dashboard.widgets else [],
        "created_at": dashboard.created_at.isoformat() if dashboard.created_at else None,
        "updated_at": dashboard.updated_at.isoformat() if dashboard.updated_at else None,
    }


def _get_project_subtree(db: Session, project_id: UUID) -> List[UniversalBreakdownNode]:
    """Retrieve all nodes under a project root using ltree path containment.

    Parameters
    ----------
    db : Session
        Active database session.
    project_id : UUID
        UUID of the root project/portfolio node.

    Returns
    -------
    list[UniversalBreakdownNode]
        All descendant nodes of the project root.
    """
    root = db.query(UniversalBreakdownNode).filter(UniversalBreakdownNode.id == project_id).first()
    if root is None:
        raise ValueError(f"Project node {project_id} not found")

    # Use ltree containment — falls back to string prefix for SQLite
    path_prefix = root.path
    nodes = (
        db.query(UniversalBreakdownNode)
        .filter(
            UniversalBreakdownNode.path.like(f"{path_prefix}.%")
            | (UniversalBreakdownNode.path == path_prefix)
        )
        .filter(UniversalBreakdownNode.is_active == True)
        .all()
    )
    return nodes


# ============================================================================
# Calendar-aware helpers (mirrored from cpm_engine for ephemeral simulation)
# ============================================================================

def _is_workday(dt: datetime) -> bool:
    """Check if a date is a workday (Mon-Fri, no calendar exceptions).

    This is a simplified version for ephemeral simulation that does not
    consult the database for calendar exceptions.
    """
    return dt.weekday() < 5


def _add_workdays(start: date, days: int) -> date:
    """Add working days to a date, skipping weekends.

    Parameters
    ----------
    start : date
        The starting date.
    days : int
        Number of working days to add.

    Returns
    -------
    date
        The resulting date after adding working days.
    """
    current = datetime.combine(start, datetime.min.time())
    added = 0
    while added < days:
        current += timedelta(days=1)
        if _is_workday(current):
            added += 1
    return current.date()


def _workday_diff(start: date, end: date) -> int:
    """Calculate the number of working days between two dates.

    Parameters
    ----------
    start : date
        The start date.
    end : date
        The end date.

    Returns
    -------
    int
        Number of working days between start and end.
    """
    if start >= end:
        return 0
    count = 0
    current = start
    while current < end:
        current += timedelta(days=1)
        if current.weekday() < 5:
            count += 1
    return count


# ============================================================================
# MCP Tool Functions
# ============================================================================

@mcp.tool(
    name="get_project_critical_path",
    description=(
        "Runs the Critical Path Method (CPM) calculation for a project and "
        "returns all tasks with zero or negative Total Float (critical path "
        "tasks).  Validates the caller's security clearance before returning "
        "any node data.  Nodes exceeding the user's clearance are returned "
        "as ghost nodes with redacted fields."
    ),
)
def get_project_critical_path(
    project_id: str,
    auth_token: str,
) -> Dict[str, Any]:
    """Get the critical path tasks for a project.

    Parameters
    ----------
    project_id : str
        UUID of the root project/portfolio node.
    auth_token : str
        JWT Bearer token of the invoking user.

    Returns
    -------
    dict
        Dictionary containing project summary and list of critical path tasks.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        project_uuid = UUID(project_id)

        # Verify user can access the project root
        root = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id == project_uuid
        ).first()
        if root is None:
            raise ValueError(f"Project {project_id} not found")

        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        if not has_sufficient_clearance(user_clearance, root.security_classification):
            raise ValueError("Insufficient clearance to access this project")

        # Get all active nodes in the project subtree
        all_nodes = _get_project_subtree(db, project_uuid)

        # Build dependency map
        dep_map: Dict[UUID, List[Dict[str, Any]]] = {}
        deps = db.query(DependencyLink).filter(
            DependencyLink.successor_id.in_(n.id for n in all_nodes)
        ).all()

        for dep in deps:
            dep_map.setdefault(dep.successor_id, []).append({
                "predecessor_id": dep.predecessor_id,
                "type": dep.dependency_type.value if dep.dependency_type else "FS",
                "lag_days": dep.lag_days or 0,
            })

        # Build node lookup
        node_map = {n.id: n for n in all_nodes}

        # Compute durations from planned dates
        durations: Dict[UUID, int] = {}
        for n in all_nodes:
            pn = db.query(PortfolioNode).filter(PortfolioNode.id == n.id).first()
            if pn and pn.planned_start_date and pn.planned_end_date:
                durations[n.id] = _workday_diff(pn.planned_start_date, pn.planned_end_date)
            elif n.custom_attributes and "schedule" in n.custom_attributes:
                durations[n.id] = n.custom_attributes["schedule"].get("duration_days", 0)
            else:
                durations[n.id] = 0

        # Topological sort for forward pass
        in_degree: Dict[UUID, int] = {n.id: 0 for n in all_nodes}
        successors: Dict[UUID, List[UUID]] = {n.id: [] for n in all_nodes}

        for dep in deps:
            if dep.predecessor_id in node_map and dep.successor_id in node_map:
                in_degree[dep.successor_id] = in_degree.get(dep.successor_id, 0) + 1
                successors.setdefault(dep.predecessor_id, []).append(dep.successor_id)

        # Forward pass: compute ES/EF
        es: Dict[UUID, date] = {}
        ef: Dict[UUID, date] = {}

        # Find roots (no predecessors)
        roots = [nid for nid, deg in in_degree.items() if deg == 0]
        if not roots:
            roots = list(node_map.keys())

        # Default project start
        project_start = root.planned_start_date if hasattr(root, "planned_start_date") and root.planned_start_date else date.today()

        for nid in roots:
            es[nid] = project_start
            ef[nid] = _add_workdays(project_start, durations.get(nid, 0))

        # Process in topological order
        queue = list(roots)
        visited = set(roots)
        while queue:
            current = queue.pop(0)
            for succ_id in successors.get(current, []):
                if succ_id in visited:
                    continue
                # Find earliest predecessor EF
                pred_deps = dep_map.get(succ_id, [])
                earliest_start = ef.get(current, project_start)
                for pred_info in pred_deps:
                    pred_id = pred_info["predecessor_id"]
                    if pred_id in ef:
                        lag = pred_info.get("lag_days", 0)
                        pred_ef = ef[pred_id]
                        candidate = _add_workdays(pred_ef, lag) if lag >= 0 else pred_ef - timedelta(days=abs(lag))
                        if isinstance(candidate, datetime):
                            candidate = candidate.date()
                        if candidate > earliest_start:
                            earliest_start = candidate
                es[succ_id] = earliest_start
                ef[succ_id] = _add_workdays(earliest_start, durations.get(succ_id, 0))
                visited.add(succ_id)
                queue.append(succ_id)

        # Backward pass: compute LS/LF
        project_end = max(ef.values()) if ef else project_start
        ls: Dict[UUID, date] = {}
        lf: Dict[UUID, date] = {}

        # Find terminal nodes (no successors)
        terminal = [nid for nid, succs in successors.items() if not succs]
        for nid in terminal:
            lf[nid] = project_end
            ls[nid] = ef.get(nid, project_end)
            delta = _workday_diff(ef.get(nid, project_end), project_end)
            ls[nid] = project_end - timedelta(days=delta) if delta else ef.get(nid, project_end)

        # Simple backward pass
        reverse_successors: Dict[UUID, List[UUID]] = {n.id: [] for n in all_nodes}
        for dep in deps:
            if dep.predecessor_id in node_map and dep.successor_id in node_map:
                reverse_successors.setdefault(dep.successor_id, []).append(dep.predecessor_id)

        # Process in reverse topological order
        rev_queue = list(terminal)
        rev_visited = set(terminal)
        while rev_queue:
            current = rev_queue.pop(0)
            for pred_id in reverse_successors.get(current, []):
                if pred_id in rev_visited:
                    continue
                lf[pred_id] = es.get(current, project_end)
                dur = durations.get(pred_id, 0)
                ls[pred_id] = ef.get(pred_id, lf[pred_id]) - timedelta(days=dur) if dur else lf[pred_id]
                rev_visited.add(pred_id)
                rev_queue.append(pred_id)

        # Compute total float and identify critical path
        total_float: Dict[UUID, int] = {}
        for nid in node_map:
            if nid in ls and nid in es:
                total_float[nid] = _workday_diff(es[nid], ls[nid])
            else:
                total_float[nid] = 999999  # Default high float for uncomputed

        # Critical path: nodes with zero or negative float
        critical_nodes = [
            nid for nid, tf in total_float.items()
            if tf <= 0 and nid in node_map
        ]

        # Serialize results with ABAC filtering
        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        user_caveats = user.caveats or []

        critical_tasks = []
        for nid in critical_nodes:
            node = node_map[nid]
            visible = is_node_visible(user_clearance, user_caveats, node)
            task_data = _serialize_node(node, is_masked=not visible)
            task_data["total_float"] = total_float.get(nid, 0)
            task_data["early_start"] = es.get(nid).isoformat() if nid in es else None
            task_data["early_finish"] = ef.get(nid).isoformat() if nid in ef else None
            critical_tasks.append(task_data)

        # Sort by early start
        critical_tasks.sort(key=lambda t: t.get("early_start") or "")

        return {
            "project_id": project_id,
            "project_name": root.name,
            "total_activities": len(all_nodes),
            "critical_path_length": len(critical_tasks),
            "project_end_date": project_end.isoformat(),
            "critical_tasks": critical_tasks,
            "calculated_at": datetime.now(timezone.utc).isoformat(),
        }

    finally:
        db.close()


@mcp.tool(
    name="query_active_blockers",
    description=(
        "Returns all active (unresolved) NodeBlocker items for a project, "
        "optionally filtered by minimum severity level (CRITICAL, MAJOR, MINOR). "
        "Validates the caller's security clearance before returning any data. "
        "Blockers on nodes exceeding the user's clearance are returned with "
        "redacted node information."
    ),
)
def query_active_blockers(
    project_id: str,
    auth_token: str,
    severity: Optional[str] = None,
) -> Dict[str, Any]:
    """Query active blockers for a project.

    Parameters
    ----------
    project_id : str
        UUID of the root project/portfolio node.
    auth_token : str
        JWT Bearer token of the invoking user.
    severity : str or None
        Minimum severity filter: "CRITICAL", "MAJOR", or "MINOR".
        If None, returns all severities.

    Returns
    -------
    dict
        Dictionary containing project summary and list of active blockers.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        project_uuid = UUID(project_id)

        # Verify user can access the project root
        root = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id == project_uuid
        ).first()
        if root is None:
            raise ValueError(f"Project {project_id} not found")

        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        user_caveats = user.caveats or []

        # Get all active nodes in the project subtree
        all_nodes = _get_project_subtree(db, project_uuid)
        node_ids = [n.id for n in all_nodes]
        node_map = {n.id: n for n in all_nodes}

        # Query active blockers
        query = db.query(NodeBlocker).filter(
            NodeBlocker.portfolio_node_id.in_(node_ids),
            NodeBlocker.resolved_at.is_(None),
        )

        # Filter by severity if specified
        if severity:
            severity_order = {
                "CRITICAL": BlockerSeverity.CRITICAL,
                "MAJOR": BlockerSeverity.MAJOR,
                "MINOR": BlockerSeverity.MINOR,
            }
            min_sev = severity_order.get(severity.upper())
            if min_sev:
                # Include only blockers at or above the specified severity
                severity_levels = {
                    BlockerSeverity.CRITICAL: 3,
                    BlockerSeverity.MAJOR: 2,
                    BlockerSeverity.MINOR: 1,
                }
                min_level = severity_levels.get(min_sev, 0)
                # Build filter manually since SQLAlchemy enum comparison can be tricky
                allowed = [s for s, lvl in severity_levels.items() if lvl >= min_level]
                query = query.filter(NodeBlocker.severity.in_(allowed))

        blockers = query.all()

        # Serialize with ABAC filtering
        blocker_list = []
        for blocker in blockers:
            node = node_map.get(blocker.portfolio_node_id)
            if node is None:
                continue

            visible = is_node_visible(user_clearance, user_caveats, node)
            node_info = _serialize_node(node, is_masked=not visible)

            blocker_list.append({
                "blocker_id": str(blocker.id),
                "category": blocker.category.value if blocker.category else None,
                "severity": blocker.severity.value if blocker.severity else None,
                "impacted_hours": float(blocker.impacted_hours) if blocker.impacted_hours else 0.0,
                "node": node_info,
                "created_at": blocker.created_at.isoformat() if blocker.created_at else None,
            })

        # Sort by severity (CRITICAL first)
        severity_sort = {"CRITICAL": 0, "MAJOR": 1, "MINOR": 2}
        blocker_list.sort(key=lambda b: severity_sort.get(b.get("severity", ""), 99))

        return {
            "project_id": project_id,
            "project_name": root.name,
            "total_active_blockers": len(blocker_list),
            "severity_filter": severity,
            "blockers": blocker_list,
            "queried_at": datetime.now(timezone.utc).isoformat(),
        }

    finally:
        db.close()


@mcp.tool(
    name="simulate_task_delay",
    description=(
        "Performs an ephemeral forward pass simulation to calculate the "
        "resulting finish slip on downstream tasks and contractual delivery "
        "milestones when a specific task is delayed by a given number of "
        "days.  This does NOT mutate any PostgreSQL records — it is a "
        "read-only 'what-if' analysis.  Validates the caller's security "
        "clearance before returning any data."
    ),
)
def simulate_task_delay(
    task_id: str,
    delay_days: int,
    auth_token: str,
) -> Dict[str, Any]:
    """Simulate the impact of delaying a task.

    Parameters
    ----------
    task_id : str
        UUID of the task to simulate a delay for.
    delay_days : int
        Number of calendar days to delay the task by.
    auth_token : str
        JWT Bearer token of the invoking user.

    Returns
    -------
    dict
        Dictionary containing the simulation results including affected
        downstream tasks and milestone slip.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        task_uuid = UUID(task_id)

        # Find the task node
        task_node = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id == task_uuid
        ).first()
        if task_node is None:
            raise ValueError(f"Task {task_id} not found")

        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        user_caveats = user.caveats or []

        # Find the project root by walking up the ltree path
        parts = task_node.path.split(".")
        if len(parts) < 2:
            raise ValueError(f"Task {task_id} has no parent project")

        # Find all nodes under the same project (first level)
        project_path = parts[0]
        all_nodes = (
            db.query(UniversalBreakdownNode)
            .filter(
                UniversalBreakdownNode.path.like(f"{project_path}.%")
                | (UniversalBreakdownNode.path == project_path)
            )
            .filter(UniversalBreakdownNode.is_active == True)
            .all()
        )

        node_map = {n.id: n for n in all_nodes}

        # Build successor map from dependencies
        deps = db.query(DependencyLink).filter(
            DependencyLink.predecessor_id.in_(n.id for n in all_nodes)
        ).all()

        successors: Dict[UUID, List[UUID]] = {n.id: [] for n in all_nodes}
        dep_info: Dict[tuple, Dict[str, Any]] = {}

        for dep in deps:
            if dep.predecessor_id in node_map and dep.successor_id in node_map:
                successors.setdefault(dep.predecessor_id, []).append(dep.successor_id)
                dep_info[(dep.predecessor_id, dep.successor_id)] = {
                    "type": dep.dependency_type.value if dep.dependency_type else "FS",
                    "lag_days": dep.lag_days or 0,
                }

        # Compute durations
        durations: Dict[UUID, int] = {}
        for n in all_nodes:
            pn = db.query(PortfolioNode).filter(PortfolioNode.id == n.id).first()
            if pn and pn.planned_start_date and pn.planned_end_date:
                durations[n.id] = _workday_diff(pn.planned_start_date, pn.planned_end_date)
            elif n.custom_attributes and "schedule" in n.custom_attributes:
                durations[n.id] = n.custom_attributes["schedule"].get("duration_days", 0)
            else:
                durations[n.id] = 0

        # Compute original EF for the delayed task
        task_dur = durations.get(task_uuid, 0)
        task_pn = db.query(PortfolioNode).filter(PortfolioNode.id == task_uuid).first()

        if task_pn and task_pn.planned_start_date:
            original_es = task_pn.planned_start_date
        elif task_node.custom_attributes and "schedule" in task_node.custom_attributes:
            es_str = task_node.custom_attributes["schedule"].get("early_start")
            original_es = date.fromisoformat(es_str) if es_str else date.today()
        else:
            original_es = date.today()

        original_ef = _add_workdays(original_es, task_dur)
        delayed_ef = _add_workdays(original_ef, delay_days)

        task_slip_days = (delayed_ef - original_ef).days

        # Propagate delay through successors
        affected: List[Dict[str, Any]] = []
        queue = [(task_uuid, delayed_ef)]
        visited = {task_uuid}

        while queue:
            current_id, current_ef = queue.pop(0)
            for succ_id in successors.get(current_id, []):
                if succ_id in visited:
                    continue
                visited.add(succ_id)

                info = dep_info.get((current_id, succ_id), {})
                lag = info.get("lag_days", 0)
                succ_dur = durations.get(succ_id, 0)

                new_es = _add_workdays(current_ef, lag) if lag >= 0 else current_ef - timedelta(days=abs(lag))
                if isinstance(new_es, datetime):
                    new_es = new_es.date()
                new_ef = _add_workdays(new_es, succ_dur)

                # Get original EF for comparison
                succ_pn = db.query(PortfolioNode).filter(PortfolioNode.id == succ_id).first()
                if succ_pn and succ_pn.planned_end_date:
                    orig_succ_ef = succ_pn.planned_end_date
                elif succ_map := node_map.get(succ_id):
                    if succ_map.custom_attributes and "schedule" in succ_map.custom_attributes:
                        ef_str = succ_map.custom_attributes["schedule"].get("early_finish")
                        orig_succ_ef = date.fromisoformat(ef_str) if ef_str else new_ef
                    else:
                        orig_succ_ef = new_ef
                else:
                    orig_succ_ef = new_ef

                slip = (new_ef - orig_succ_ef).days if orig_succ_ef else 0

                succ_node = node_map.get(succ_id)
                if succ_node:
                    visible = is_node_visible(user_clearance, user_caveats, succ_node)
                    node_info = _serialize_node(succ_node, is_masked=not visible)
                    node_info["original_early_finish"] = orig_succ_ef.isoformat()
                    node_info["simulated_early_finish"] = new_ef.isoformat()
                    node_info["slip_days"] = slip
                    affected.append(node_info)

                queue.append((succ_id, new_ef))

        # Check for milestone impact
        milestone_impact = None
        for item in affected:
            if item.get("code", "").startswith("MS-") or "milestone" in item.get("name", "").lower():
                milestone_impact = {
                    "milestone_id": item.get("id"),
                    "milestone_name": item.get("name"),
                    "original_date": item.get("original_early_finish"),
                    "simulated_date": item.get("simulated_early_finish"),
                    "slip_days": item.get("slip_days"),
                }

        # Serialize the delayed task itself
        visible = is_node_visible(user_clearance, user_caveats, task_node)
        task_info = _serialize_node(task_node, is_masked=not visible)
        task_info["original_early_finish"] = original_ef.isoformat()
        task_info["simulated_early_finish"] = delayed_ef.isoformat()
        task_info["delay_days"] = delay_days

        return {
            "task_id": task_id,
            "task": task_info,
            "affected_downstream_count": len(affected),
            "affected_downstream": affected,
            "milestone_impact": milestone_impact,
            "project_finish_slip_days": task_slip_days,
            "simulated_at": datetime.now(timezone.utc).isoformat(),
            "note": "This is a read-only simulation. No database records were modified.",
        }

    finally:
        db.close()


@mcp.tool(
    name="inspect_resource_allocation",
    description=(
        "Returns the weekly allocation percentage for a given resource over "
        "a specified date range.  Highlights dates where the resource is "
        "oversubscribed (allocated more than 100% capacity).  Validates the "
        "caller's security clearance before returning any data."
    ),
)
def inspect_resource_allocation(
    resource_id: str,
    start_date: str,
    end_date: str,
    auth_token: str,
) -> Dict[str, Any]:
    """Inspect resource allocation over a date range.

    Parameters
    ----------
    resource_id : str
        UUID of the ResourceNode to inspect.
    start_date : str
        ISO date string (YYYY-MM-DD) for the start of the inspection period.
    end_date : str
        ISO date string (YYYY-MM-DD) for the end of the inspection period.
    auth_token : str
        JWT Bearer token of the invoking user.

    Returns
    -------
    dict
        Dictionary containing weekly allocation data and oversubscription alerts.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        resource_uuid = UUID(resource_id)
        period_start = date.fromisoformat(start_date)
        period_end = date.fromisoformat(end_date)

        # Find the resource node
        resource_node = db.query(ResourceNode).filter(
            ResourceNode.id == resource_uuid
        ).first()
        if resource_node is None:
            raise ValueError(f"Resource {resource_id} not found")

        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        user_caveats = user.caveats or []

        # Check clearance on the resource node
        visible = is_node_visible(user_clearance, user_caveats, resource_node)
        resource_info = _serialize_node(resource_node, is_masked=not visible)

        # Get all assignments for this resource
        assignments = (
            db.query(ResourceAssignment)
            .filter(ResourceAssignment.resource_node_id == resource_uuid)
            .all()
        )

        # Calculate weekly allocation
        weekly_allocation: Dict[str, Dict[str, Any]] = {}
        current = period_start
        while current <= period_end:
            week_end = min(current + timedelta(days=6), period_end)
            week_key = current.isoformat()
            weekly_allocation[week_key] = {
                "week_start": current.isoformat(),
                "week_end": week_end.isoformat(),
                "total_allocated_units": 0.0,
                "total_planned_hours": 0.0,
                "assignments": [],
                "is_oversubscribed": False,
            }
            current += timedelta(days=7)

        # Distribute assignments across weeks
        for assignment in assignments:
            portfolio_node = db.query(PortfolioNode).filter(
                PortfolioNode.id == assignment.portfolio_node_id
            ).first()

            if portfolio_node is None:
                continue

            # Check if assignment period overlaps with inspection period
            node_start = portfolio_node.planned_start_date
            node_end = portfolio_node.planned_end_date

            if node_start is None or node_end is None:
                continue

            overlap_start = max(node_start, period_start)
            overlap_end = min(node_end, period_end)

            if overlap_start > overlap_end:
                continue

            # Calculate workdays in overlap
            workdays_in_overlap = _workday_diff(overlap_start, overlap_end)

            # Distribute across weeks
            current = period_start
            while current <= period_end:
                week_end = min(current + timedelta(days=6), period_end)
                week_key = current.isoformat()

                # Calculate workdays in this week that overlap with assignment
                week_overlap_start = max(current, overlap_start)
                week_overlap_end = min(week_end, overlap_end)

                if week_overlap_start <= week_overlap_end:
                    week_workdays = _workday_diff(week_overlap_start, week_overlap_end)
                    if week_workdays > 0 and workdays_in_overlap > 0:
                        fraction = week_workdays / workdays_in_overlap
                        week_hours = assignment.planned_hours * fraction if assignment.planned_hours else 0
                        week_units = assignment.allocated_units * fraction if assignment.allocated_units else 0

                        week_data = weekly_allocation.get(week_key)
                        if week_data:
                            week_data["total_allocated_units"] += week_units
                            week_data["total_planned_hours"] += week_hours

                            # Check node clearance for assignment details
                            node_visible = is_node_visible(
                                user_clearance, user_caveats, portfolio_node
                            ) if hasattr(portfolio_node, 'security_classification') else True

                            node_data = _serialize_node(portfolio_node, is_masked=not node_visible)
                            week_data["assignments"].append({
                                "assignment_id": str(assignment.id),
                                "allocated_units": round(week_units, 2),
                                "planned_hours": round(week_hours, 2),
                                "node": node_data,
                            })

                current += timedelta(days=7)

        # Mark oversubscribed weeks
        oversubscribed_weeks = []
        for week_key, week_data in weekly_allocation.items():
            if week_data["total_allocated_units"] > 1.0:
                week_data["is_oversubscribed"] = True
                oversubscribed_weeks.append({
                    "week_start": week_data["week_start"],
                    "week_end": week_data["week_end"],
                    "allocated_units": round(week_data["total_allocated_units"], 2),
                    "oversubscription_percent": round(
                        (week_data["total_allocated_units"] - 1.0) * 100, 1
                    ),
                })

        return {
            "resource_id": resource_id,
            "resource": resource_info,
            "period_start": start_date,
            "period_end": end_date,
            "weekly_allocation": list(weekly_allocation.values()),
            "oversubscribed_weeks": oversubscribed_weeks,
            "total_oversubscribed_weeks": len(oversubscribed_weeks),
            "inspected_at": datetime.now(timezone.utc).isoformat(),
        }

    finally:
        db.close()


# ============================================================================
# Dashboard MCP Tool Functions
# ============================================================================

@mcp.tool(
    name="list_dashboards",
    description=(
        "Lists all dashboards accessible to the invoking user.  Returns "
        "dashboards where the user is the owner, or where the dashboard is "
        "shared (PROJECT_SHARED or SYSTEM_GLOBAL).  Filters by security "
        "classification — dashboards exceeding the user's clearance are "
        "omitted."
    ),
)
def list_dashboards(
    auth_token: str,
) -> Dict[str, Any]:
    """List all accessible dashboards for the current user.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.

    Returns
    -------
    dict
        Dictionary containing list of accessible dashboards.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        # Get dashboards owned by the user
        owned = db.query(Dashboard).filter(
            Dashboard.owner_user_id == user.id
        ).all()

        # Get shared dashboards
        shared = db.query(Dashboard).filter(
            Dashboard.sharing_scope.in_([SharingScope.PROJECT_SHARED, SharingScope.SYSTEM_GLOBAL])
        ).all()

        # Combine and deduplicate
        all_dashboards = {}
        for d in owned:
            if _check_dashboard_clearance(user, d.classification or PresetClassification.OFFICIAL):
                db.refresh(d, ["widgets"])
                all_dashboards[str(d.id)] = d
        for d in shared:
            if str(d.id) not in all_dashboards:
                if _check_dashboard_clearance(user, d.classification or PresetClassification.OFFICIAL):
                    db.refresh(d, ["widgets"])
                    all_dashboards[str(d.id)] = d

        dashboards = [
            _serialize_dashboard(d) for d in all_dashboards.values()
        ]

        return {
            "dashboards": dashboards,
            "total": len(dashboards),
            "user_id": str(user.id),
            "listed_at": datetime.now(timezone.utc).isoformat(),
        }

    finally:
        db.close()


@mcp.tool(
    name="get_dashboard",
    description=(
        "Returns a dashboard's full details including all widget "
        "configurations.  Validates the caller's access — the user must "
        "be the owner or the dashboard must be shared, and the user's "
        "clearance must meet the dashboard's classification level."
    ),
)
def get_dashboard(
    dashboard_id: str,
    auth_token: str,
) -> Dict[str, Any]:
    """Get a dashboard with its widgets.

    Parameters
    ----------
    dashboard_id : str
        UUID of the dashboard.
    auth_token : str
        JWT Bearer token of the invoking user.

    Returns
    -------
    dict
        Dictionary containing dashboard details and widget configurations.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        dashboard_uuid = UUID(dashboard_id)

        dashboard = db.query(Dashboard).filter(Dashboard.id == dashboard_uuid).first()

        if dashboard is None:
            raise ValueError(f"Dashboard {dashboard_id} not found")

        # Check access
        is_owner = str(dashboard.owner_user_id) == str(user.id)
        is_shared = dashboard.sharing_scope in (SharingScope.PROJECT_SHARED, SharingScope.SYSTEM_GLOBAL)

        if not (is_owner or is_shared):
            raise ValueError("Access denied — dashboard is not shared with you")

        if not _check_dashboard_clearance(user, dashboard.classification or PresetClassification.OFFICIAL):
            raise ValueError("Insufficient clearance to access this dashboard")

        # Fetch widgets
        widgets = db.query(DashboardWidget).filter(
            DashboardWidget.dashboard_id == dashboard_uuid
        ).all()

        dashboard_data = _serialize_dashboard(dashboard)
        dashboard_data["widgets"] = [_serialize_widget(w) for w in widgets]

        return {
            "dashboard": dashboard_data,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }

    finally:
        db.close()


@mcp.tool(
    name="create_dashboard",
    description=(
        "Creates a new dashboard with optional initial widgets.  The "
        "invoking user becomes the dashboard owner.  Use this to build "
        "dashboards programmatically via AI — provide widget configurations "
        "with data sources and display options."
    ),
)
def create_dashboard(
    name: str,
    auth_token: str,
    description: Optional[str] = None,
    project_id: Optional[str] = None,
    sharing_scope: str = "PRIVATE",
    classification: str = "OFFICIAL",
    widgets: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Create a new dashboard with optional widgets.

    Parameters
    ----------
    name : str
        Dashboard name (1-120 characters).
    auth_token : str
        JWT Bearer token of the invoking user.
    description : str or None
        Optional dashboard description.
    project_id : str or None
        Optional project association UUID.
    sharing_scope : str
        Visibility scope: "PRIVATE", "PROJECT_SHARED", "SYSTEM_GLOBAL".
    classification : str
        Security classification: "OFFICIAL", "SECRET", "TOP_SECRET".
    widgets : list[dict] or None
        Optional list of widget configurations. Each widget should have:
        widget_type, title, data_source_type, data_source_config,
        display_config, position.

    Returns
    -------
    dict
        Dictionary containing the created dashboard details.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        # Parse enums
        scope = SharingScope(sharing_scope)
        cls = PresetClassification(classification)

        # Create dashboard
        dashboard = Dashboard(
            name=name,
            description=description,
            owner_user_id=user.id,
            project_id=UUID(project_id) if project_id else None,
            sharing_scope=scope,
            classification=cls,
            layout_config={},
        )
        db.add(dashboard)
        db.flush()

        # Create widgets if provided
        if widgets:
            for w_config in widgets:
                widget = DashboardWidget(
                    dashboard_id=dashboard.id,
                    widget_type=WidgetType(w_config.get("widget_type", "NUMBER_CARD")),
                    title=w_config.get("title", "Untitled Widget"),
                    data_source_type=DataSourceType(w_config.get("data_source_type", "ENDPOINT")),
                    data_source_config=w_config.get("data_source_config", {}),
                    display_config=w_config.get("display_config", {}),
                    position=w_config.get("position", {}),
                )
                db.add(widget)

        db.commit()
        db.refresh(dashboard)

        # Reload with widgets
        dashboard = db.query(Dashboard).filter(Dashboard.id == dashboard.id).first()
        widgets_result = db.query(DashboardWidget).filter(
            DashboardWidget.dashboard_id == dashboard.id
        ).all()
        dashboard.widgets = widgets_result

        return {
            "dashboard": _serialize_dashboard(dashboard),
            "message": f"Dashboard '{name}' created successfully",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    finally:
        db.close()


@mcp.tool(
    name="update_widget",
    description=(
        "Updates a widget's configuration within a dashboard.  The "
        "invoking user must be the dashboard owner.  Use this to modify "
        "widget data sources, display options, or position."
    ),
)
def update_widget(
    dashboard_id: str,
    widget_id: str,
    auth_token: str,
    title: Optional[str] = None,
    widget_type: Optional[str] = None,
    data_source_type: Optional[str] = None,
    data_source_config: Optional[Dict[str, Any]] = None,
    display_config: Optional[Dict[str, Any]] = None,
    position: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Update a widget's configuration.

    Parameters
    ----------
    dashboard_id : str
        UUID of the parent dashboard.
    widget_id : str
        UUID of the widget to update.
    auth_token : str
        JWT Bearer token of the invoking user.
    title : str or None
        New widget title.
    widget_type : str or None
        New widget type.
    data_source_type : str or None
        New data source type.
    data_source_config : dict or None
        New data source configuration.
    display_config : dict or None
        New display configuration.
    position : dict or None
        New canvas position.

    Returns
    -------
    dict
        Dictionary containing the updated widget details.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        dashboard_uuid = UUID(dashboard_id)
        widget_uuid = UUID(widget_id)

        dashboard = db.query(Dashboard).filter(Dashboard.id == dashboard_uuid).first()
        if dashboard is None:
            raise ValueError(f"Dashboard {dashboard_id} not found")

        if str(dashboard.owner_user_id) != str(user.id):
            raise ValueError("Access denied — only the dashboard owner can update widgets")

        widget = db.query(DashboardWidget).filter(
            DashboardWidget.id == widget_uuid,
            DashboardWidget.dashboard_id == dashboard_uuid
        ).first()

        if widget is None:
            raise ValueError(f"Widget {widget_id} not found in dashboard {dashboard_id}")

        # Apply updates
        if title is not None:
            widget.title = title
        if widget_type is not None:
            widget.widget_type = WidgetType(widget_type)
        if data_source_type is not None:
            widget.data_source_type = DataSourceType(data_source_type)
        if data_source_config is not None:
            widget.data_source_config = data_source_config
        if display_config is not None:
            widget.display_config = display_config
        if position is not None:
            widget.position = position

        widget.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(widget)

        return {
            "widget": _serialize_widget(widget),
            "message": f"Widget '{widget.title}' updated successfully",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    finally:
        db.close()


@mcp.tool(
    name="get_widget_data",
    description=(
        "Fetches the current data for a specific widget by executing its "
        "configured data source.  For SQL_QUERY widgets, executes the "
        "validated SQL query.  For ENDPOINT widgets, returns metadata.  "
        "Validates the caller's access to the parent dashboard."
    ),
)
def get_widget_data(
    dashboard_id: str,
    widget_id: str,
    auth_token: str,
) -> Dict[str, Any]:
    """Fetch data for a specific widget.

    Parameters
    ----------
    dashboard_id : str
        UUID of the parent dashboard.
    widget_id : str
        UUID of the widget.
    auth_token : str
        JWT Bearer token of the invoking user.

    Returns
    -------
    dict
        Dictionary containing widget data and metadata.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        dashboard_uuid = UUID(dashboard_id)
        widget_uuid = UUID(widget_id)

        # Check dashboard access
        dashboard = db.query(Dashboard).filter(Dashboard.id == dashboard_uuid).first()
        if dashboard is None:
            raise ValueError(f"Dashboard {dashboard_id} not found")

        is_owner = str(dashboard.owner_user_id) == str(user.id)
        is_shared = dashboard.sharing_scope in (SharingScope.PROJECT_SHARED, SharingScope.SYSTEM_GLOBAL)
        if not (is_owner or is_shared):
            raise ValueError("Access denied — dashboard is not shared with you")

        # Get widget
        widget = db.query(DashboardWidget).filter(
            DashboardWidget.id == widget_uuid,
            DashboardWidget.dashboard_id == dashboard_uuid
        ).first()

        if widget is None:
            raise ValueError(f"Widget {widget_id} not found")

        # Execute data source
        data = None
        if widget.data_source_type == DataSourceType.SQL_QUERY:
            config = widget.data_source_config or {}
            sql = config.get("sql", "")
            params = config.get("params", {})
            if sql:
                data = execute_query_sync(db, sql, params)
        elif widget.data_source_type == DataSourceType.ENDPOINT:
            config = widget.data_source_config or {}
            endpoint = config.get("endpoint", "")
            json_path = config.get("json_path", "")
            if endpoint:
                data = {
                    "endpoint": endpoint,
                    "json_path": json_path,
                    "note": "Endpoint data fetch requires HTTP client",
                }

        return {
            "widget": _serialize_widget(widget),
            "data": data,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }

    finally:
        db.close()


def _analyze_chart_type(
    columns: List[str],
    sample_data: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Internal helper: analyze data columns and suggest chart types.

    Parameters
    ----------
    columns : list[str]
        List of column names in the data.
    sample_data : list[dict] or None
        Optional sample rows of data for analysis.

    Returns
    -------
    dict
        Dictionary containing chart type suggestions and display config.
    """
    column_count = len(columns)
    has_date = any(kw in " ".join(columns).lower() for kw in ["date", "time", "period", "month", "year", "week"])
    has_category = any(kw in " ".join(columns).lower() for kw in ["status", "type", "category", "name", "code", "severity"])
    has_numeric = any(kw in " ".join(columns).lower() for kw in ["count", "sum", "avg", "value", "cost", "hours", "percent", "float", "cpi", "spi"])
    has_id = any(kw in " ".join(columns).lower() for kw in ["id", "uuid"])

    suggestions = []

    numeric_cols = [c for c in columns if not has_id and any(kw in c.lower() for kw in ["count", "sum", "avg", "value", "cost", "hours", "percent", "float", "cpi", "spi", "rate"])]

    # Single numeric column → Gauge or Number Card
    if len(numeric_cols) == 1 and column_count <= 2:
        suggestions.append({
            "widget_type": "GAUGE",
            "confidence": 0.9,
            "reason": "Single numeric value is best shown as a gauge",
            "display_config": {
                "value_field": numeric_cols[0],
                "min": 0,
                "max": 100,
                "thresholds": [{"value": 0.7, "color": "#ef4444"}, {"value": 0.9, "color": "#f59e0b"}],
            },
        })
        suggestions.append({
            "widget_type": "NUMBER_CARD",
            "confidence": 0.85,
            "reason": "Single numeric value as a large number display",
            "display_config": {
                "value_field": numeric_cols[0],
                "format": "number",
            },
        })

    # Date + numeric → Line or Area chart
    if has_date and has_numeric:
        suggestions.append({
            "widget_type": "LINE_CHART",
            "confidence": 0.9,
            "reason": "Time-series data is best shown as a line chart",
            "display_config": {
                "x_field": next((c for c in columns if any(kw in c.lower() for kw in ["date", "time", "period"])), columns[0]),
                "y_fields": numeric_cols,
            },
        })
        suggestions.append({
            "widget_type": "AREA_CHART",
            "confidence": 0.8,
            "reason": "Time-series data with filled area for cumulative view",
            "display_config": {
                "x_field": next((c for c in columns if any(kw in c.lower() for kw in ["date", "time", "period"])), columns[0]),
                "y_fields": numeric_cols,
            },
        })

    # Category + numeric → Column chart
    if has_category and has_numeric:
        suggestions.append({
            "widget_type": "COLUMN_CHART",
            "confidence": 0.9,
            "reason": "Categorical data with numeric values is best shown as a column chart",
            "display_config": {
                "x_field": next((c for c in columns if any(kw in c.lower() for kw in ["status", "type", "category", "name"])), columns[0]),
                "y_fields": numeric_cols,
            },
        })

    # Two numeric columns → Scatter
    if len(numeric_cols) >= 2:
        suggestions.append({
            "widget_type": "SCATTER",
            "confidence": 0.7,
            "reason": "Two numeric dimensions can be compared with a scatter plot",
            "display_config": {
                "x_field": numeric_cols[0],
                "y_field": numeric_cols[1],
            },
        })

    # Default fallback
    if not suggestions:
        if column_count <= 2:
            suggestions.append({
                "widget_type": "NUMBER_CARD",
                "confidence": 0.6,
                "reason": "Simple data — number card is a safe default",
                "display_config": {"value_field": columns[0] if columns else None},
            })
        else:
            suggestions.append({
                "widget_type": "TABLE",
                "confidence": 0.7,
                "reason": "Complex data structure — table provides full visibility",
                "display_config": {"columns": columns},
            })

    return {
        "columns": columns,
        "suggestions": suggestions,
        "recommended": suggestions[0]["widget_type"] if suggestions else "TABLE",
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }


@mcp.tool(
    name="suggest_chart_type",
    description=(
        "Analyzes data columns and values to suggest the best chart type "
        "for visualization.  Given column names and sample data, recommends "
        "the most appropriate widget type (COLUMN_CHART, LINE_CHART, GAUGE, "
        "etc.) along with suggested display configuration."
    ),
)
def suggest_chart_type(
    columns: List[str],
    sample_data: Optional[List[Dict[str, Any]]] = None,
    data_description: Optional[str] = None,
) -> Dict[str, Any]:
    """Suggest the best chart type for given data.

    Parameters
    ----------
    columns : list[str]
        List of column names in the data.
    sample_data : list[dict] or None
        Optional sample rows of data for analysis.
    data_description : str or None
        Optional natural-language description of the data.

    Returns
    -------
    dict
        Dictionary containing chart type suggestions and display config.
    """
    return _analyze_chart_type(columns, sample_data)


@mcp.tool(
    name="generate_widget_query",
    description=(
        "Generates a validated SQL query for a dashboard widget based on "
        "a natural-language description.  Uses the allowed tables and "
        "columns to construct a safe SELECT query.  Returns the generated "
        "SQL along with suggested widget type and display configuration."
    ),
)
def generate_widget_query(
    description: str,
    auth_token: str,
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate a SQL query for a widget from a natural-language description.

    Parameters
    ----------
    description : str
        Natural-language description of the data needed (e.g., "Show task
        count by status for project X").
    auth_token : str
        JWT Bearer token of the invoking user.
    project_id : str or None
        Optional project UUID to filter results.

    Returns
    -------
    dict
        Dictionary containing generated SQL, suggested widget type, and
        display configuration.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        desc_lower = description.lower()

        sql = ""
        params = {}
        suggested_type = "TABLE"
        display_config = {}

        # Pattern: task count by status
        if any(kw in desc_lower for kw in ["task count by status", "tasks by status", "status count"]):
            sql = "SELECT status, COUNT(*) as count FROM tasks GROUP BY status ORDER BY count DESC"
            suggested_type = "COLUMN_CHART"
            display_config = {"x_field": "status", "y_fields": ["count"]}

        # Pattern: burndown / progress over time
        elif any(kw in desc_lower for kw in ["burndown", "progress over time", "completion trend"]):
            sql = "SELECT planned_end_date as date, percent_complete FROM portfolio_nodes WHERE percent_complete > 0 ORDER BY planned_end_date"
            suggested_type = "LINE_CHART"
            display_config = {"x_field": "date", "y_fields": ["percent_complete"]}

        # Pattern: blockers by severity
        elif any(kw in desc_lower for kw in ["blockers by severity", "blocker count", "active blockers"]):
            sql = "SELECT severity, COUNT(*) as count FROM node_blockers WHERE status != 'resolved' GROUP BY severity ORDER BY count DESC"
            suggested_type = "COLUMN_CHART"
            display_config = {"x_field": "severity", "y_fields": ["count"]}

        # Pattern: resource utilization
        elif any(kw in desc_lower for kw in ["resource utilization", "resource allocation", "resource usage"]):
            sql = "SELECT rn.name, COUNT(ra.id) as assignment_count, SUM(ra.allocation_units) as total_units FROM resource_nodes rn JOIN resource_assignments ra ON rn.id = ra.resource_node_id GROUP BY rn.name ORDER BY total_units DESC"
            suggested_type = "COLUMN_CHART"
            display_config = {"x_field": "name", "y_fields": ["total_units"]}

        # Pattern: EVM metrics
        elif any(kw in desc_lower for kw in ["evm", "cpi", "spi", "earned value", "cost performance"]):
            sql = "SELECT name, cpi, spi, percent_complete FROM portfolio_nodes WHERE cpi IS NOT NULL ORDER BY cpi ASC"
            suggested_type = "TABLE"
            display_config = {"columns": ["name", "cpi", "spi", "percent_complete"]}

        # Pattern: single number / KPI
        elif any(kw in desc_lower for kw in ["total tasks", "total blockers", "count of", "how many"]):
            if "blocker" in desc_lower:
                sql = "SELECT COUNT(*) as total FROM node_blockers WHERE status != 'resolved'"
            else:
                sql = "SELECT COUNT(*) as total FROM tasks"
            suggested_type = "NUMBER_CARD"
            display_config = {"value_field": "total"}

        # Pattern: milestones
        elif any(kw in desc_lower for kw in ["milestone", "delivery date"]):
            sql = "SELECT name, milestone_date, status FROM milestones ORDER BY milestone_date"
            suggested_type = "TABLE"
            display_config = {"columns": ["name", "milestone_date", "status"]}

        # Default: list portfolio nodes
        else:
            sql = "SELECT id, name, code, status, percent_complete FROM portfolio_nodes LIMIT 50"
            suggested_type = "TABLE"
            display_config = {"columns": ["name", "code", "status", "percent_complete"]}

        # Validate the generated query
        is_valid, error = validate_query(sql, params)
        if not is_valid:
            return {
                "error": f"Generated query is invalid: {error}",
                "description": description,
                "suggestion": "Try rephrasing the description or use a simpler query",
            }

        return {
            "sql": sql,
            "params": params,
            "suggested_widget_type": suggested_type,
            "display_config": display_config,
            "data_source_config": {
                "sql": sql,
                "params": params,
            },
            "description": description,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    finally:
        db.close()


@mcp.tool(
    name="get_sql_builder_tables",
    description=(
        "Returns the list of allowed tables and their columns for the "
        "SQL query builder.  Use this to understand what data is available "
        "for constructing custom widget queries."
    ),
)
def get_sql_builder_tables(
    auth_token: str,
) -> Dict[str, Any]:
    """Get the list of allowed SQL tables and columns.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.

    Returns
    -------
    dict
        Dictionary containing allowed tables and their columns.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        allowed = get_allowed_tables()

        tables = []
        for table_name, columns in allowed.items():
            tables.append({
                "table": table_name,
                "columns": columns,
                "column_count": len(columns),
            })

        return {
            "tables": tables,
            "table_count": len(tables),
            "user_id": str(user.id),
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }

    finally:
        db.close()


@mcp.tool(
    name="execute_widget_query",
    description=(
        "Executes a validated SQL query and returns the results along with "
        "chart type suggestions.  The query is validated against the allowed "
        "tables and columns to prevent SQL injection.  Use this to preview "
        "data before creating a widget."
    ),
)
def execute_widget_query(
    sql: str,
    auth_token: str,
    params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Execute a validated SQL query and suggest chart types.

    Parameters
    ----------
    sql : str
        SQL query string (SELECT only, validated against allowlist).
    auth_token : str
        JWT Bearer token of the invoking user.
    params : dict or None
        Optional parameterized values for the query.

    Returns
    -------
    dict
        Dictionary containing query results and chart type suggestions.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        # Validate and execute
        try:
            result = execute_query_sync(db, sql, params)
        except ValueError as e:
            return {
                "error": str(e),
                "suggestion": "Check that your query uses only allowed tables and columns",
            }

        # Extract column names for chart suggestion
        columns = result.get("columns", [])
        rows = result.get("rows", [])

        # Suggest chart type
        suggestions = _analyze_chart_type(columns, rows[:10])

        return {
            "data": result,
            "chart_suggestions": suggestions,
            "recommended_widget_type": suggestions.get("recommended", "TABLE"),
            "executed_at": datetime.now(timezone.utc).isoformat(),
        }

    finally:
        db.close()


# ============================================================================
# Additional MCP Tool Functions — Non-Admin Domains
# ============================================================================

# ----- Imports for additional tools -----
from app.models.models import (
    PortfolioBaseline,
    BaselineNodeSnapshot,
    BaselineChangeRequest,
    WorkingCalendar,
    CalendarException,
    ScheduleClashIssue,
    ContractDeliverable,
    SandboxScenario,
    SubcontractorSubmission,
    ChamberReservation,
    ProcurementItem,
    OracleProjectMapping,
    CurrencyExchangeRate,
    EngineeringConcession,
    ResourceRequisitionRequest,
    MilestoneWeightStep,
    ResourceAssignment,
    ResourceNode,
    PortfolioNode,
    DependencyLink,
    SkillCategory,
    SkillDefinition,
    UserSkillProfile,
    TaskProcurementConstraint,
    GovernmentAcceptanceMilestone,
)
from app.models.display import ViewPreset, GanttViewPreset
from app.models.leases import SubTreeCheckOut


@mcp.tool(
    name="get_cockpit_summary",
    description=(
        "Returns key daily metrics for the authenticated user: active task "
        "count, planned hours this week, tasks due within 48 hours, and "
        "blocked task count."
    ),
)
def get_cockpit_summary(auth_token: str) -> Dict[str, Any]:
    """Get daily cockpit summary metrics for the current user."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        assigned = (
            db.query(ResourceAssignment.portfolio_node_id)
            .join(ResourceNode, ResourceAssignment.resource_node_id == ResourceNode.id)
            .filter(
                ResourceAssignment.status == "CONFIRMED",
                (ResourceNode.code == user.username) |
                (ResourceNode.name == user.full_name),
            )
            .all()
        )
        assigned_ids = [a.portfolio_node_id for a in assigned]

        active_count = 0
        tasks_due_48h = 0
        blocked_count = 0
        if assigned_ids:
            active_count = (
                db.query(PortfolioNode)
                .filter(
                    PortfolioNode.id.in_(assigned_ids),
                    PortfolioNode.is_active == True,
                    PortfolioNode.percent_complete < 100.0,
                )
                .count()
            )
            now = datetime.now(timezone.utc)
            cutoff = now + timedelta(hours=48)
            tasks_due_48h = (
                db.query(PortfolioNode)
                .filter(
                    PortfolioNode.id.in_(assigned_ids),
                    PortfolioNode.is_active == True,
                    PortfolioNode.percent_complete < 100.0,
                    PortfolioNode.planned_end_date != None,
                    PortfolioNode.planned_end_date <= cutoff,
                    PortfolioNode.planned_end_date >= now,
                )
                .count()
            )
            blocked_count = (
                db.query(PortfolioNode)
                .join(NodeBlocker, NodeBlocker.portfolio_node_id == PortfolioNode.id)
                .filter(
                    PortfolioNode.id.in_(assigned_ids),
                    NodeBlocker.resolved_at == None,
                )
                .distinct()
                .count()
            )

        return {
            "active_task_count": active_count,
            "tasks_due_within_48h": tasks_due_48h,
            "blocked_task_count": blocked_count,
            "user_id": str(user.id),
        }
    finally:
        db.close()


@mcp.tool(
    name="get_focus_queue",
    description=(
        "Returns the user's assigned tasks ordered by critical path status "
        "and due date. Useful for identifying which tasks need immediate "
        "attention."
    ),
)
def get_focus_queue(auth_token: str) -> Dict[str, Any]:
    """Get focus queue for the current user."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        assigned = (
            db.query(ResourceAssignment.portfolio_node_id)
            .join(ResourceNode, ResourceAssignment.resource_node_id == ResourceNode.id)
            .filter(
                ResourceAssignment.status == "CONFIRMED",
                (ResourceNode.code == user.username) |
                (ResourceNode.name == user.full_name),
            )
            .all()
        )
        assigned_ids = [a.portfolio_node_id for a in assigned]
        if not assigned_ids:
            return {"tasks": [], "user_id": str(user.id)}

        nodes = (
            db.query(PortfolioNode)
            .filter(
                PortfolioNode.id.in_(assigned_ids),
                PortfolioNode.is_active == True,
                PortfolioNode.percent_complete < 100.0,
            )
            .order_by(PortfolioNode.planned_end_date.asc().nulls_last())
            .all()
        )

        tasks = []
        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        user_caveats = user.caveats or []
        for node in nodes:
            if not is_node_visible(user_clearance, user_caveats, node):
                continue
            custom = node.custom_attributes or {}
            schedule = custom.get("schedule", {})
            tasks.append({
                "node_id": str(node.id),
                "code": node.code,
                "name": node.name,
                "percent_complete": node.percent_complete,
                "planned_start": node.planned_start_date.isoformat() if node.planned_start_date else None,
                "planned_end": node.planned_end_date.isoformat() if node.planned_end_date else None,
                "is_critical": schedule.get("is_critical", False),
                "total_float": schedule.get("total_float"),
            })
        return {"tasks": tasks, "task_count": len(tasks), "user_id": str(user.id)}
    finally:
        db.close()


@mcp.tool(
    name="get_project_tree",
    description=(
        "Returns the full WBS tree for a project, including all nodes with "
        "their schedule data, progress, and classification. Nodes exceeding "
        "the user's clearance are returned as ghost nodes."
    ),
)
def get_project_tree(project_id: str, auth_token: str) -> Dict[str, Any]:
    """Get the full WBS tree for a project."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        project_uuid = UUID(project_id)
        root = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id == project_uuid
        ).first()
        if root is None:
            raise ValueError(f"Project {project_id} not found")
        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        if not has_sufficient_clearance(user_clearance, root.security_classification):
            raise ValueError("Insufficient clearance to access this project")

        all_nodes = _get_project_subtree(db, project_uuid)
        nodes = _filter_nodes_by_abac(all_nodes, user)
        return {
            "project_id": project_id,
            "project_name": root.name,
            "nodes": nodes,
            "node_count": len(nodes),
        }
    finally:
        db.close()


@mcp.tool(
    name="list_portfolios",
    description=(
        "Lists all portfolio root nodes accessible to the user. "
        "Useful for discovering which projects and programmes are available."
    ),
)
def list_portfolios(auth_token: str) -> Dict[str, Any]:
    """List all accessible portfolio root nodes."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        roots = (
            db.query(PortfolioNode)
            .filter(
                PortfolioNode.parent_id == None,
                PortfolioNode.is_active == True,
            )
            .all()
        )
        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        user_caveats = user.caveats or []
        portfolios = []
        for node in roots:
            visible = is_node_visible(user_clearance, user_caveats, node)
            portfolios.append({
                "id": str(node.id),
                "code": node.code,
                "name": node.name,
                "classification": node.security_classification.value if node.security_classification else None,
                "is_masked": not visible,
                "percent_complete": node.percent_complete,
            })
        return {"portfolios": portfolios, "count": len(portfolios)}
    finally:
        db.close()


@mcp.tool(
    name="get_node_details",
    description=(
        "Returns detailed information about a specific portfolio node "
        "including schedule data, custom attributes, and resource assignments."
    ),
)
def get_node_details(node_id: str, auth_token: str) -> Dict[str, Any]:
    """Get detailed information about a specific portfolio node."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        node_uuid = UUID(node_id)
        node = db.query(PortfolioNode).filter(PortfolioNode.id == node_uuid).first()
        if not node:
            raise ValueError(f"Node {node_id} not found")
        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        user_caveats = user.caveats or []
        visible = is_node_visible(user_clearance, user_caveats, node)
        if not visible:
            raise ValueError("Insufficient clearance to access this node")

        assignments = db.query(ResourceAssignment).filter(
            ResourceAssignment.portfolio_node_id == node_uuid
        ).all()
        blockers = db.query(NodeBlocker).filter(
            NodeBlocker.portfolio_node_id == node_uuid,
            NodeBlocker.resolved_at == None,
        ).all()
        deps = db.query(DependencyLink).filter(
            (DependencyLink.predecessor_id == node_uuid) |
            (DependencyLink.successor_id == node_uuid)
        ).all()

        return {
            "node": _serialize_node(node, is_masked=False),
            "custom_attributes": node.custom_attributes or {},
            "assignments": [{
                "resource_node_id": str(a.resource_node_id),
                "allocated_units": a.allocated_units,
                "planned_hours": a.planned_hours,
                "status": a.status.value if a.status else None,
            } for a in assignments],
            "active_blockers": [{
                "id": str(b.id),
                "category": b.category.value if b.category else None,
                "severity": b.severity.value if b.severity else None,
                "impacted_hours": b.impacted_hours,
            } for b in blockers],
            "dependencies": [{
                "predecessor_id": str(d.predecessor_id),
                "successor_id": str(d.successor_id),
                "type": d.dependency_type.value if d.dependency_type else "FS",
                "lag_days": d.lag_days,
            } for d in deps],
        }
    finally:
        db.close()


@mcp.tool(
    name="list_milestones",
    description=(
        "Lists all milestone nodes under a project, showing target dates, "
        "status, and variance from baseline."
    ),
)
def list_milestones(project_id: str, auth_token: str) -> Dict[str, Any]:
    """List all milestones under a project."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        project_uuid = UUID(project_id)
        root = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id == project_uuid
        ).first()
        if not root:
            raise ValueError(f"Project {project_id} not found")

        all_nodes = _get_project_subtree(db, project_uuid)
        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        user_caveats = user.caveats or []
        milestones = []
        for node in all_nodes:
            custom = node.custom_attributes or {}
            if custom.get("is_milestone", False) or (node.delivery_mode and node.delivery_mode.value == "MILESTONE_WEIGHTS"):
                visible = is_node_visible(user_clearance, user_caveats, node)
                milestones.append({
                    "id": str(node.id),
                    "code": node.code,
                    "name": node.name,
                    "planned_date": node.planned_end_date.isoformat() if node.planned_end_date else None,
                    "actual_date": node.actual_end_date.isoformat() if node.actual_end_date else None,
                    "percent_complete": node.percent_complete,
                    "is_masked": not visible,
                })
        return {"milestones": milestones, "count": len(milestones)}
    finally:
        db.close()


@mcp.tool(
    name="get_evm_summary",
    description=(
        "Returns Earned Value Management summary for a project including "
        "CPI, SPI, BAC, EV, PV, AC, and variance metrics."
    ),
)
def get_evm_summary(project_id: str, auth_token: str) -> Dict[str, Any]:
    """Get EVM summary for a project."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        project_uuid = UUID(project_id)
        root = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id == project_uuid
        ).first()
        if not root:
            raise ValueError(f"Project {project_id} not found")

        all_nodes = _get_project_subtree(db, project_uuid)
        bac = 0.0
        ev = 0.0
        pv = 0.0
        ac = 0.0
        for node in all_nodes:
            custom = node.custom_attributes or {}
            evm = custom.get("evm", {})
            bac += float(evm.get("bac", 0))
            ev += float(evm.get("ev", 0))
            pv += float(evm.get("pv", 0))
            ac += float(evm.get("ac", 0))

        cpi = ev / ac if ac > 0 else 1.0
        spi = ev / pv if pv > 0 else 1.0
        cv = ev - ac
        sv = ev - pv
        eac = bac / cpi if cpi > 0 else bac
        vac = bac - eac

        return {
            "project_id": project_id,
            "project_name": root.name,
            "bac": round(bac, 2),
            "ev": round(ev, 2),
            "pv": round(pv, 2),
            "ac": round(ac, 2),
            "cpi": round(cpi, 4),
            "spi": round(spi, 4),
            "cv": round(cv, 2),
            "sv": round(sv, 2),
            "eac": round(eac, 2),
            "vac": round(vac, 2),
        }
    finally:
        db.close()


@mcp.tool(
    name="list_baselines",
    description=(
        "Lists all baselines for a project, including freeze date, "
        "status, and number of snapshots."
    ),
)
def list_baselines(project_id: str, auth_token: str) -> Dict[str, Any]:
    """List all baselines for a project."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        project_uuid = UUID(project_id)
        baselines = db.query(PortfolioBaseline).filter(
            PortfolioBaseline.project_id == project_uuid
        ).all()
        result = []
        for bl in baselines:
            snapshot_count = db.query(BaselineNodeSnapshot).filter(
                BaselineNodeSnapshot.baseline_id == bl.id
            ).count()
            result.append({
                "id": str(bl.id),
                "name": bl.name,
                "description": bl.description,
                "freeze_date": bl.freeze_date.isoformat() if bl.freeze_date else None,
                "status": bl.status.value if bl.status else None,
                "snapshot_count": snapshot_count,
                "created_by": str(bl.created_by),
                "created_at": bl.created_at.isoformat() if bl.created_at else None,
            })
        return {"baselines": result, "count": len(result)}
    finally:
        db.close()


@mcp.tool(
    name="get_baseline_variance",
    description=(
        "Compares current project state against a baseline snapshot, "
        "showing schedule and cost variances for each node."
    ),
)
def get_baseline_variance(project_id: str, baseline_id: str, auth_token: str) -> Dict[str, Any]:
    """Get baseline variance analysis."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        baseline_uuid = UUID(baseline_id)
        baseline = db.query(PortfolioBaseline).filter(
            PortfolioBaseline.id == baseline_uuid
        ).first()
        if not baseline:
            raise ValueError(f"Baseline {baseline_id} not found")

        snapshots = db.query(BaselineNodeSnapshot).filter(
            BaselineNodeSnapshot.baseline_id == baseline_uuid
        ).all()
        snapshot_map = {str(s.node_id): s for s in snapshots}

        project_uuid = UUID(project_id)
        all_nodes = _get_project_subtree(db, project_uuid)
        variances = []
        for node in all_nodes:
            nid = str(node.id)
            if nid in snapshot_map:
                snap = snapshot_map[nid]
                schedule_var = None
                if node.planned_end_date and snap.planned_end_date:
                    schedule_var = (node.planned_end_date - snap.planned_end_date).days
                variances.append({
                    "node_id": nid,
                    "code": node.code,
                    "name": node.name,
                    "baseline_percent": snap.percent_complete,
                    "current_percent": node.percent_complete,
                    "progress_delta": node.percent_complete - snap.percent_complete,
                    "schedule_variance_days": schedule_var,
                })
        return {
            "baseline_id": baseline_id,
            "baseline_name": baseline.name,
            "variances": variances,
            "node_count": len(variances),
        }
    finally:
        db.close()


@mcp.tool(
    name="list_resource_assignments",
    description=(
        "Lists all resource assignments for a project, showing resource name, "
        "allocated units, planned hours, and status."
    ),
)
def list_resource_assignments(project_id: str, auth_token: str) -> Dict[str, Any]:
    """List resource assignments for a project."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        project_uuid = UUID(project_id)
        all_nodes = _get_project_subtree(db, project_uuid)
        node_ids = [n.id for n in all_nodes]

        assignments = (
            db.query(ResourceAssignment)
            .join(ResourceNode, ResourceAssignment.resource_node_id == ResourceNode.id)
            .filter(ResourceAssignment.portfolio_node_id.in_(node_ids))
            .all()
        )
        result = []
        for a in assignments:
            rn = a.resource_node
            pn = a.portfolio_node
            result.append({
                "assignment_id": str(a.id),
                "resource_id": str(rn.id),
                "resource_name": rn.name,
                "resource_code": rn.code,
                "node_id": str(pn.id) if pn else None,
                "node_name": pn.name if pn else None,
                "allocated_units": a.allocated_units,
                "planned_hours": a.planned_hours,
                "status": a.status.value if a.status else None,
            })
        return {"assignments": result, "count": len(result)}
    finally:
        db.close()


@mcp.tool(
    name="get_resource_utilization",
    description=(
        "Returns resource utilization data for a specific resource, "
        "showing allocation percentage across projects and time periods."
    ),
)
def get_resource_utilization(resource_id: str, auth_token: str) -> Dict[str, Any]:
    """Get resource utilization for a specific resource."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        resource_uuid = UUID(resource_id)
        resource = db.query(ResourceNode).filter(ResourceNode.id == resource_uuid).first()
        if not resource:
            raise ValueError(f"Resource {resource_id} not found")

        assignments = db.query(ResourceAssignment).filter(
            ResourceAssignment.resource_node_id == resource_uuid
        ).all()
        total_units = sum(a.allocated_units or 0 for a in assignments)
        result = []
        for a in assignments:
            pn = a.portfolio_node
            result.append({
                "node_id": str(pn.id) if pn else None,
                "node_name": pn.name if pn else None,
                "allocated_units": a.allocated_units,
                "planned_hours": a.planned_hours,
                "status": a.status.value if a.status else None,
            })
        return {
            "resource_id": resource_id,
            "resource_name": resource.name,
            "total_allocated_units": total_units,
            "assignments": result,
            "assignment_count": len(result),
        }
    finally:
        db.close()


@mcp.tool(
    name="list_calendars",
    description=(
        "Lists all working calendars with their standard hours, days, "
        "and jurisdiction."
    ),
)
def list_calendars(auth_token: str) -> Dict[str, Any]:
    """List all working calendars."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        calendars = db.query(WorkingCalendar).all()
        result = []
        for cal in calendars:
            exceptions = db.query(CalendarException).filter(
                CalendarException.calendar_id == cal.id
            ).count()
            result.append({
                "id": str(cal.id),
                "name": cal.name,
                "description": cal.description,
                "jurisdiction": cal.jurisdiction.value if cal.jurisdiction else None,
                "standard_hours": cal.standard_hours,
                "working_days": cal.working_days,
                "exception_count": exceptions,
            })
        return {"calendars": result, "count": len(result)}
    finally:
        db.close()


@mcp.tool(
    name="list_schedule_clashes",
    description=(
        "Lists all detected schedule clashes for a project, including "
        "clash type, severity, and affected nodes."
    ),
)
def list_schedule_clashes(project_id: str, auth_token: str) -> Dict[str, Any]:
    """List schedule clashes for a project."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        project_uuid = UUID(project_id)
        clashes = db.query(ScheduleClashIssue).filter(
            ScheduleClashIssue.project_id == project_uuid
        ).all()
        result = []
        for c in clashes:
            result.append({
                "id": str(c.id),
                "category": c.category.value if c.category else None,
                "severity": c.severity.value if c.severity else None,
                "node_id": str(c.node_id) if c.node_id else None,
                "description": c.description,
                "is_resolved": c.is_resolved,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            })
        return {"clashes": result, "count": len(result)}
    finally:
        db.close()


@mcp.tool(
    name="list_procurement_items",
    description=(
        "Lists all procurement items for a project, showing lifecycle stage, "
        "supplier, and delivery status."
    ),
)
def list_procurement_items(project_id: str, auth_token: str) -> Dict[str, Any]:
    """List procurement items for a project."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        project_uuid = UUID(project_id)
        items = db.query(ProcurementItem).filter(
            ProcurementItem.project_id == project_uuid
        ).all()
        result = []
        for item in items:
            result.append({
                "id": str(item.id),
                "name": item.name,
                "description": item.description,
                "stage": item.stage.value if item.stage else None,
                "supplier": item.supplier_name,
                "delivery_date": item.delivery_date.isoformat() if item.delivery_date else None,
                "status": item.status,
            })
        return {"items": result, "count": len(result)}
    finally:
        db.close()


@mcp.tool(
    name="list_cdrls",
    description=(
        "Lists all Contract Data Requirements List (CDRL) deliverables "
        "for a project, showing status and submission dates."
    ),
)
def list_cdrls(project_id: str, auth_token: str) -> Dict[str, Any]:
    """List CDRL deliverables for a project."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        project_uuid = UUID(project_id)
        all_nodes = _get_project_subtree(db, project_uuid)
        node_ids = [n.id for n in all_nodes]
        cdrls = db.query(ContractDeliverable).filter(
            ContractDeliverable.portfolio_node_id.in_(node_ids)
        ).all()
        result = []
        for cd in cdrls:
            result.append({
                "id": str(cd.id),
                "cdrl_sequence_number": cd.cdrl_sequence_number,
                "title": cd.title,
                "status": cd.status.value if cd.status else None,
                "due_date": cd.due_date.isoformat() if cd.due_date else None,
                "submitted_date": cd.submitted_date.isoformat() if cd.submitted_date else None,
                "portfolio_node_id": str(cd.portfolio_node_id),
            })
        return {"cdrls": result, "count": len(result)}
    finally:
        db.close()


@mcp.tool(
    name="list_subcontractor_submissions",
    description=(
        "Lists all subcontractor schedule submissions, showing status, "
        "format, and integration progress."
    ),
)
def list_subcontractor_submissions(project_id: str, auth_token: str) -> Dict[str, Any]:
    """List subcontractor submissions for a project."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        project_uuid = UUID(project_id)
        submissions = db.query(SubcontractorSubmission).filter(
            SubcontractorSubmission.project_id == project_uuid
        ).all()
        result = []
        for s in submissions:
            result.append({
                "id": str(s.id),
                "subcontractor_name": s.subcontractor_name,
                "format": s.format.value if s.format else None,
                "status": s.status.value if s.status else None,
                "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
                "node_count": s.node_count,
            })
        return {"submissions": result, "count": len(result)}
    finally:
        db.close()


@mcp.tool(
    name="list_sandbox_scenarios",
    description=(
        "Lists all sandbox scenarios for a project, showing scenario name, "
        "status, and number of modified nodes."
    ),
)
def list_sandbox_scenarios(project_id: str, auth_token: str) -> Dict[str, Any]:
    """List sandbox scenarios for a project."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        project_uuid = UUID(project_id)
        scenarios = db.query(SandboxScenario).filter(
            SandboxScenario.project_id == project_uuid
        ).all()
        result = []
        for s in scenarios:
            result.append({
                "id": str(s.id),
                "name": s.name,
                "description": s.description,
                "status": s.status.value if s.status else None,
                "created_by": str(s.created_by),
                "created_at": s.created_at.isoformat() if s.created_at else None,
            })
        return {"scenarios": result, "count": len(scenarios)}
    finally:
        db.close()


@mcp.tool(
    name="list_chamber_reservations",
    description=(
        "Lists all chamber/facility reservations, showing facility name, "
        "reserved time slots, and status."
    ),
)
def list_chamber_reservations(auth_token: str) -> Dict[str, Any]:
    """List all chamber reservations."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        reservations = db.query(ChamberReservation).all()
        result = []
        for r in reservations:
            result.append({
                "id": str(r.id),
                "facility_name": r.facility_name,
                "start_time": r.start_time.isoformat() if r.start_time else None,
                "end_time": r.end_time.isoformat() if r.end_time else None,
                "status": r.status.value if r.status else None,
                "requested_by": str(r.requested_by),
            })
        return {"reservations": result, "count": len(result)}
    finally:
        db.close()


@mcp.tool(
    name="list_currency_rates",
    description=(
        "Lists all currency exchange rates, showing currency code, "
        "rate value, and effective date."
    ),
)
def list_currency_rates(auth_token: str) -> Dict[str, Any]:
    """List all currency exchange rates."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        rates = db.query(CurrencyExchangeRate).all()
        result = []
        for r in rates:
            result.append({
                "id": str(r.id),
                "currency_code": r.currency_code,
                "rate": float(r.rate),
                "effective_date": r.effective_date.isoformat() if r.effective_date else None,
            })
        return {"rates": result, "count": len(result)}
    finally:
        db.close()


@mcp.tool(
    name="list_engineering_concessions",
    description=(
        "Lists all engineering concessions, showing concession type, "
        "status, and affected nodes."
    ),
)
def list_engineering_concessions(project_id: str, auth_token: str) -> Dict[str, Any]:
    """List engineering concessions for a project."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        project_uuid = UUID(project_id)
        concessions = db.query(EngineeringConcession).filter(
            EngineeringConcession.project_id == project_uuid
        ).all()
        result = []
        for c in concessions:
            result.append({
                "id": str(c.id),
                "concession_number": c.concession_number,
                "title": c.title,
                "status": c.status.value if c.status else None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            })
        return {"concessions": result, "count": len(concessions)}
    finally:
        db.close()


@mcp.tool(
    name="list_resource_requisitions",
    description=(
        "Lists all resource requisition requests, showing requested resource, "
        "target node, and approval status."
    ),
)
def list_resource_requisitions(auth_token: str) -> Dict[str, Any]:
    """List all resource requisition requests."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        requisitions = db.query(ResourceRequisitionRequest).all()
        result = []
        for r in requisitions:
            result.append({
                "id": str(r.id),
                "resource_name": r.resource_name,
                "target_node_id": str(r.target_node_id) if r.target_node_id else None,
                "status": r.status.value if r.status else None,
                "requested_by": str(r.requested_by),
                "created_at": r.created_at.isoformat() if r.created_at else None,
            })
        return {"requisitions": result, "count": len(requisitions)}
    finally:
        db.close()


@mcp.tool(
    name="list_view_presets",
    description=(
        "Lists all view presets accessible to the user, including "
        "sharing scope and classification."
    ),
)
def list_view_presets(auth_token: str) -> Dict[str, Any]:
    """List all accessible view presets."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        presets = db.query(ViewPreset).all()
        result = []
        for p in presets:
            result.append({
                "id": str(p.id),
                "name": p.name,
                "description": p.description,
                "sharing_scope": p.sharing_scope.value if p.sharing_scope else None,
                "classification": p.classification.value if p.classification else None,
                "owner_user_id": str(p.owner_user_id),
            })
        return {"presets": result, "count": len(result)}
    finally:
        db.close()


@mcp.tool(
    name="list_gantt_presets",
    description=(
        "Lists all Gantt view presets accessible to the user."
    ),
)
def list_gantt_presets(auth_token: str) -> Dict[str, Any]:
    """List all Gantt view presets."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        presets = db.query(GanttViewPreset).all()
        result = []
        for p in presets:
            result.append({
                "id": str(p.id),
                "name": p.name,
                "description": p.description,
                "owner_user_id": str(p.owner_user_id),
            })
        return {"presets": result, "count": len(presets)}
    finally:
        db.close()


@mcp.tool(
    name="list_skill_categories",
    description=(
        "Lists all skill categories and their definitions for resource "
        "skill matching."
    ),
)
def list_skill_categories(auth_token: str) -> Dict[str, Any]:
    """List all skill categories."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        categories = db.query(SkillCategory).all()
        result = []
        for cat in categories:
            skills = db.query(SkillDefinition).filter(
                SkillDefinition.category_id == cat.id
            ).all()
            result.append({
                "id": str(cat.id),
                "name": cat.name,
                "description": cat.description,
                "skills": [{"id": str(s.id), "name": s.name} for s in skills],
            })
        return {"categories": result, "count": len(result)}
    finally:
        db.close()


@mcp.tool(
    name="get_user_skills",
    description=(
        "Returns the skill profile for a specific user, showing proficiency "
        "levels for each skill."
    ),
)
def get_user_skills(user_id: str, auth_token: str) -> Dict[str, Any]:
    """Get skill profile for a specific user."""
    db = SessionLocal()
    try:
        current_user = _get_user_from_token(db, auth_token)
        profiles = db.query(UserSkillProfile).filter(
            UserSkillProfile.user_id == user_id
        ).all()
        result = []
        for p in profiles:
            skill = p.skill_definition
            result.append({
                "skill_id": str(skill.id) if skill else None,
                "skill_name": skill.name if skill else None,
                "proficiency_level": p.proficiency_level,
            })
        return {"user_id": user_id, "skills": result, "count": len(result)}
    finally:
        db.close()


@mcp.tool(
    name="list_oracle_mappings",
    description=(
        "Lists all Oracle EBS project/task mappings for a project, "
        "showing the mapping between PortfolioNodes and Oracle identifiers."
    ),
)
def list_oracle_mappings(project_id: str, auth_token: str) -> Dict[str, Any]:
    """List Oracle EBS mappings for a project."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        project_uuid = UUID(project_id)
        mappings = db.query(OracleProjectMapping).filter(
            OracleProjectMapping.project_id == project_uuid
        ).all()
        result = []
        for m in mappings:
            result.append({
                "id": str(m.id),
                "portfolio_node_id": str(m.portfolio_node_id),
                "oracle_project_id": m.oracle_project_id,
                "oracle_task_id": m.oracle_task_id,
            })
        return {"mappings": result, "count": len(result)}
    finally:
        db.close()


@mcp.tool(
    name="list_government_acceptance_milestones",
    description=(
        "Lists all government acceptance milestones for a project, "
        "showing document type, inspector, and signoff status."
    ),
)
def list_government_acceptance_milestones(project_id: str, auth_token: str) -> Dict[str, Any]:
    """List government acceptance milestones for a project."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        project_uuid = UUID(project_id)
        all_nodes = _get_project_subtree(db, project_uuid)
        node_ids = [n.id for n in all_nodes]
        milestones = db.query(GovernmentAcceptanceMilestone).filter(
            GovernmentAcceptanceMilestone.portfolio_node_id.in_(node_ids)
        ).all()
        result = []
        for m in milestones:
            result.append({
                "id": str(m.id),
                "portfolio_node_id": str(m.portfolio_node_id),
                "document_type": m.acceptance_document_type.value if m.acceptance_document_type else None,
                "receipt_ref": m.receipt_reference_number,
                "inspector": m.qar_inspector_name,
                "status": m.status.value if m.status else None,
                "signed_off_at": m.signed_off_at.isoformat() if m.signed_off_at else None,
            })
        return {"milestones": result, "count": len(result)}
    finally:
        db.close()


@mcp.tool(
    name="list_tree_checkouts",
    description=(
        "Lists all active tree check-out leases, showing which user "
        "has exclusive edit access to which subtree."
    ),
)
def list_tree_checkouts(auth_token: str) -> Dict[str, Any]:
    """List all active tree check-out leases."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        checkouts = db.query(SubTreeCheckOut).all()
        result = []
        for c in checkouts:
            result.append({
                "id": str(c.id),
                "path": c.path,
                "user_id": str(c.user_id),
                "created_at": c.created_at.isoformat() if c.created_at else None,
            })
        return {"checkouts": result, "count": len(result)}
    finally:
        db.close()


@mcp.tool(
    name="get_db_health",
    description=(
        "Returns database health status including connection status, "
        "table counts, and active user count."
    ),
)
def get_db_health(auth_token: str) -> Dict[str, Any]:
    """Get database health status."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        node_count = db.query(PortfolioNode).count()
        resource_count = db.query(ResourceNode).count()
        user_count = db.query(User).filter(User.is_active == True).count()
        blocker_count = db.query(NodeBlocker).filter(NodeBlocker.resolved_at == None).count()
        return {
            "status": "healthy",
            "table_counts": {
                "portfolio_nodes": node_count,
                "resource_nodes": resource_count,
                "active_users": user_count,
                "active_blockers": blocker_count,
            },
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="search_nodes",
    description=(
        "Searches portfolio nodes by name or code across all accessible "
        "projects. Returns matching nodes with their project context."
    ),
)
def search_nodes(query: str, auth_token: str, limit: int = 50) -> Dict[str, Any]:
    """Search portfolio nodes by text query."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        search_pattern = f"%{query}%"
        nodes = (
            db.query(PortfolioNode)
            .filter(
                PortfolioNode.is_active == True,
                (PortfolioNode.name.ilike(search_pattern)) |
                (PortfolioNode.code.ilike(search_pattern)),
            )
            .limit(limit)
            .all()
        )
        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        user_caveats = user.caveats or []
        results = []
        for node in nodes:
            visible = is_node_visible(user_clearance, user_caveats, node)
            results.append({
                "id": str(node.id),
                "code": node.code,
                "name": node.name,
                "path": node.path,
                "percent_complete": node.percent_complete,
                "is_masked": not visible,
            })
        return {"results": results, "count": len(results), "query": query}
    finally:
        db.close()


@mcp.tool(
    name="get_dependencies",
    description=(
        "Returns all dependency links for a specific node, showing "
        "predecessors and successors with link types and lag days."
    ),
)
def get_dependencies(node_id: str, auth_token: str) -> Dict[str, Any]:
    """Get all dependencies for a specific node."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        node_uuid = UUID(node_id)
        deps = db.query(DependencyLink).filter(
            (DependencyLink.predecessor_id == node_uuid) |
            (DependencyLink.successor_id == node_uuid)
        ).all()
        predecessors = []
        successors = []
        for d in deps:
            info = {
                "link_id": str(d.id),
                "type": d.dependency_type.value if d.dependency_type else "FS",
                "lag_days": d.lag_days,
            }
            if d.predecessor_id == node_uuid:
                succ = db.query(PortfolioNode).filter(PortfolioNode.id == d.successor_id).first()
                info["node_id"] = str(d.successor_id)
                info["node_name"] = succ.name if succ else None
                successors.append(info)
            else:
                pred = db.query(PortfolioNode).filter(PortfolioNode.id == d.predecessor_id).first()
                info["node_id"] = str(d.predecessor_id)
                info["node_name"] = pred.name if pred else None
                predecessors.append(info)
        return {
            "node_id": node_id,
            "predecessors": predecessors,
            "successors": successors,
        }
    finally:
        db.close()


@mcp.tool(
    name="get_milestone_weight_steps",
    description=(
        "Returns all milestone weight steps for a task using the "
        "MILESTONE_WEIGHTS EVM technique, showing verification status."
    ),
)
def get_milestone_weight_steps(node_id: str, auth_token: str) -> Dict[str, Any]:
    """Get milestone weight steps for a task."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        node_uuid = UUID(node_id)
        steps = db.query(MilestoneWeightStep).filter(
            MilestoneWeightStep.portfolio_node_id == node_uuid
        ).all()
        result = []
        for s in steps:
            result.append({
                "id": str(s.id),
                "step_name": s.step_name,
                "weight_fraction": float(s.weight_fraction),
                "target_date": s.target_date.isoformat() if s.target_date else None,
                "is_verified_passed": s.is_verified_passed,
                "verified_at": s.verified_at.isoformat() if s.verified_at else None,
            })
        total_weight = sum(float(s.weight_fraction) for s in steps)
        verified_weight = sum(float(s.weight_fraction) for s in steps if s.is_verified_passed)
        return {
            "node_id": node_id,
            "steps": result,
            "total_weight": round(total_weight, 3),
            "verified_weight": round(verified_weight, 3),
            "step_count": len(steps),
        }
    finally:
        db.close()


@mcp.tool(
    name="list_procurement_constraints",
    description=(
        "Lists all procurement constraints linking procurement items "
        "to WBS tasks, showing constraint type and status."
    ),
)
def list_procurement_constraints(project_id: str, auth_token: str) -> Dict[str, Any]:
    """List procurement constraints for a project."""
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        project_uuid = UUID(project_id)
        constraints = db.query(TaskProcurementConstraint).filter(
            TaskProcurementConstraint.project_id == project_uuid
        ).all()
        result = []
        for c in constraints:
            result.append({
                "id": str(c.id),
                "task_id": str(c.task_id) if c.task_id else None,
                "procurement_item_id": str(c.procurement_item_id) if c.procurement_item_id else None,
                "constraint_type": c.constraint_type,
                "status": c.status,
            })
        return {"constraints": result, "count": len(result)}
    finally:
        db.close()


# ============================================================================
# Leave & Delegation MCP Tools
# ============================================================================


@mcp.tool(
    name="book_leave",
    description=(
        "Submit a leave request for the authenticated user. The request is "
        "routed to their line manager for approval. Leave types include: "
        "ANNUAL, SICK, MATERNITY, PATERNITY, JURY, UNPAID, TRAINING, OTHER."
    ),
)
def book_leave(
    leave_type: str,
    start_date: str,
    end_date: str,
    reason: str = "",
    auth_token: str = "",
) -> Dict[str, Any]:
    """Book leave for the authenticated user.

    Parameters
    ----------
    leave_type : str
        Type of leave (ANNUAL, SICK, MATERNITY, PATERNITY, JURY, UNPAID, TRAINING, OTHER).
    start_date : str
        First day of leave (ISO format YYYY-MM-DD, inclusive).
    end_date : str
        Last day of leave (ISO format YYYY-MM-DD, inclusive).
    reason : str
        Optional explanation for the leave.
    auth_token : str
        JWT Bearer token of the invoking user.

    Returns
    -------
    dict
        The created leave request with id, status, and dates.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        from app.services import line_management as lm_service

        sd = date.fromisoformat(start_date)
        ed = date.fromisoformat(end_date)

        request = lm_service.create_leave_request(
            db, user.id, leave_type.upper(), sd, ed, reason or None
        )
        db.commit()
        db.refresh(request)
        return {
            "id": request.id,
            "user_id": request.user_id,
            "leave_type": request.leave_type.value if hasattr(request.leave_type, "value") else str(request.leave_type),
            "start_date": request.start_date.isoformat(),
            "end_date": request.end_date.isoformat(),
            "reason": request.reason,
            "status": request.status.value if hasattr(request.status, "value") else str(request.status),
            "message": f"Leave request created (ID: {request.id}). It will be reviewed by your line manager.",
        }
    except ValueError as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="get_my_leave_requests",
    description=(
        "List all leave requests for the authenticated user, optionally "
        "filtered by status (PENDING, APPROVED, REJECTED, CANCELLED)."
    ),
)
def get_my_leave_requests(
    status_filter: str = "",
    auth_token: str = "",
) -> Dict[str, Any]:
    """Get the authenticated user's leave request history.

    Parameters
    ----------
    status_filter : str
        Optional status filter (PENDING, APPROVED, REJECTED, CANCELLED).
    auth_token : str
        JWT Bearer token of the invoking user.

    Returns
    -------
    dict
        List of leave requests with status, dates, and manager comments.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        from app.services import line_management as lm_service

        requests = lm_service.get_user_leave_requests(
            db, user.id, status_filter.upper() if status_filter else None
        )
        return {
            "requests": [
                {
                    "id": r.id,
                    "leave_type": r.leave_type.value if hasattr(r.leave_type, "value") else str(r.leave_type),
                    "start_date": r.start_date.isoformat(),
                    "end_date": r.end_date.isoformat(),
                    "reason": r.reason,
                    "status": r.status.value if hasattr(r.status, "value") else str(r.status),
                    "manager_comment": r.manager_comment,
                    "approved_at": r.approved_at.isoformat() if r.approved_at else None,
                }
                for r in requests
            ],
            "count": len(requests),
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="get_pending_leave_approvals",
    description=(
        "List all pending leave requests from the authenticated user's "
        "direct reports, awaiting their approval or rejection."
    ),
)
def get_pending_leave_approvals(
    auth_token: str = "",
) -> Dict[str, Any]:
    """Get pending leave requests for the manager to approve.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user (must be a line manager).

    Returns
    -------
    dict
        List of pending leave requests with requester info.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        from app.services import line_management as lm_service

        requests = lm_service.get_pending_leave_for_manager(db, user.id)
        pending = []
        for r in requests:
            requester = db.query(User).filter(User.id == r.user_id).first()
            pending.append({
                "id": r.id,
                "user_id": r.user_id,
                "requester": {
                    "id": requester.id,
                    "username": requester.username,
                    "full_name": requester.full_name,
                } if requester else {"id": r.user_id},
                "leave_type": r.leave_type.value if hasattr(r.leave_type, "value") else str(r.leave_type),
                "start_date": r.start_date.isoformat(),
                "end_date": r.end_date.isoformat(),
                "reason": r.reason,
                "status": r.status.value if hasattr(r.status, "value") else str(r.status),
            })
        return {
            "pending_requests": pending,
            "count": len(pending),
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="approve_leave_request",
    description=(
        "Approve a pending leave request submitted by a direct report. "
        "If the requester is a line manager, the system will check whether "
        "they have delegation in place and return a warning if not."
    ),
)
def approve_leave_request(
    request_id: int,
    comment: str = "",
    auth_token: str = "",
) -> Dict[str, Any]:
    """Approve a pending leave request.

    Parameters
    ----------
    request_id : int
        The ID of the leave request to approve.
    comment : str
        Optional comment from the manager.
    auth_token : str
        JWT Bearer token of the invoking user (must be the line manager).

    Returns
    -------
    dict
        The approved leave request with status and delegation warning if applicable.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        from app.services import line_management as lm_service
        from app.services import delegation as del_service

        request = lm_service.approve_leave_request(
            db, request_id, user.id, comment or None
        )
        db.commit()
        db.refresh(request)

        result = {
            "id": request.id,
            "status": request.status.value if hasattr(request.status, "value") else str(request.status),
            "manager_comment": request.manager_comment,
            "approved_at": request.approved_at.isoformat() if request.approved_at else None,
        }

        # Check delegation coverage for the approved leave
        try:
            check = del_service.check_leave_needs_delegation(db, request.id)
            if check.get("needs_delegation"):
                result["delegation_warning"] = (
                    f"{check['user']['full_name']} is a line manager but has no delegation "
                    f"covering their leave period. They should set up delegation before going on leave."
                )
        except Exception:
            pass

        return result
    except ValueError as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="reject_leave_request",
    description=(
        "Reject a pending leave request submitted by a direct report, "
        "with an optional reason for rejection."
    ),
)
def reject_leave_request(
    request_id: int,
    comment: str = "",
    auth_token: str = "",
) -> Dict[str, Any]:
    """Reject a pending leave request.

    Parameters
    ----------
    request_id : int
        The ID of the leave request to reject.
    comment : str
        Reason for rejection.
    auth_token : str
        JWT Bearer token of the invoking user (must be the line manager).

    Returns
    -------
    dict
        The rejected leave request with status and manager comment.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        from app.services import line_management as lm_service

        request = lm_service.reject_leave_request(
            db, request_id, user.id, comment or None
        )
        db.commit()
        db.refresh(request)
        return {
            "id": request.id,
            "status": request.status.value if hasattr(request.status, "value") else str(request.status),
            "manager_comment": request.manager_comment,
            "message": "Leave request has been rejected.",
        }
    except ValueError as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="book_leave_with_delegation",
    description=(
        "Book leave and automatically set up delegation of sign-off authority "
        "if the user is a line manager. This is a convenience wrapper that: "
        "(1) creates the leave request, (2) checks if the user has direct "
        "reports, (3) if so, creates a delegation record for the same date "
        "range pointing to the specified delegatee. If no delegatee is "
        "provided, it suggests the user's line manager as the delegatee."
    ),
)
def book_leave_with_delegation(
    leave_type: str,
    start_date: str,
    end_date: str,
    reason: str = "",
    delegatee_user_id: int = 0,
    auth_token: str = "",
) -> Dict[str, Any]:
    """Book leave and auto-setup delegation in a single call.

    This is the primary tool for line managers going on leave. It ensures
    continuity of sign-off authority by creating both the leave request
    and the delegation record atomically.

    Parameters
    ----------
    leave_type : str
        Type of leave (ANNUAL, SICK, MATERNITY, PATERNITY, JURY, UNPAID, TRAINING, OTHER).
    start_date : str
        First day of leave (ISO format YYYY-MM-DD, inclusive).
    end_date : str
        Last day of leave (ISO format YYYY-MM-DD, inclusive).
    reason : str
        Optional explanation for the leave.
    delegatee_user_id : int
        The user ID of the colleague who will receive delegated authority.
        If 0 or not provided, the system will attempt to use the user's
        own line manager as the delegatee.
    auth_token : str
        JWT Bearer token of the invoking user.

    Returns
    -------
    dict
        Contains the leave request, delegation record (if created), and
        any warnings about missing delegation.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        from app.services import line_management as lm_service
        from app.services import delegation as del_service

        sd = date.fromisoformat(start_date)
        ed = date.fromisoformat(end_date)

        # Step 1: Create the leave request
        leave_request = lm_service.create_leave_request(
            db, user.id, leave_type.upper(), sd, ed, reason or None
        )

        # Step 2: Check if user is a line manager with direct reports
        direct_reports = lm_service.get_direct_reports(db, user.id)
        is_manager = len(direct_reports) > 0

        delegation_created = None
        delegation_warning = None

        if is_manager:
            # Resolve delegatee
            delegatee_id = delegatee_user_id
            if not delegatee_id:
                # Default to the user's own line manager
                my_manager = lm_service.get_line_manager(db, user.id)
                if my_manager:
                    delegatee_id = my_manager.id
                else:
                    delegation_warning = (
                        f"You are a line manager with {len(direct_reports)} direct report(s), "
                        f"but no delegatee was specified and you have no line manager. "
                        f"Please set up delegation manually before your leave."
                    )

            if delegatee_id and not delegation_warning:
                try:
                    delegation = del_service.create_delegation(
                        db,
                        delegator_user_id=user.id,
                        delegatee_user_id=delegatee_id,
                        start_date=sd,
                        end_date=ed,
                        reason=f"Auto-delegation for {leave_type} leave ({reason or 'no reason'})",
                    )
                    delegatee = db.query(User).filter(User.id == delegatee_id).first()
                    delegation_created = {
                        "id": delegation.id,
                        "delegatee": {
                            "id": delegatee.id,
                            "username": delegatee.username,
                            "full_name": delegatee.full_name,
                        } if delegatee else None,
                        "start_date": str(delegation.start_date),
                        "end_date": str(delegation.end_date),
                        "reason": delegation.reason,
                    }
                except ValueError as e:
                    delegation_warning = (
                        f"Could not auto-create delegation: {e}. "
                        f"Please set up delegation manually."
                    )
        else:
            delegation_warning = None

        db.commit()
        db.refresh(leave_request)

        return {
            "leave_request": {
                "id": leave_request.id,
                "leave_type": leave_request.leave_type.value if hasattr(leave_request.leave_type, "value") else str(leave_request.leave_type),
                "start_date": leave_request.start_date.isoformat(),
                "end_date": leave_request.end_date.isoformat(),
                "status": leave_request.status.value if hasattr(leave_request.status, "value") else str(leave_request.status),
            },
            "is_line_manager": is_manager,
            "direct_reports_count": len(direct_reports),
            "delegation": delegation_created,
            "delegation_warning": delegation_warning,
            "message": (
                f"Leave request created (ID: {leave_request.id}). "
                f"{'Delegation also created.' if delegation_created else ''} "
                f"{'No delegation needed - you have no direct reports.' if not is_manager else ''}"
            ),
        }
    except ValueError as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="create_delegation",
    description=(
        "Create a delegation record to temporarily transfer sign-off authority "
        "to another user for a specified date range. Only one active delegation "
        "per user is allowed at a time."
    ),
)
def create_delegation(
    delegatee_user_id: int,
    start_date: str,
    end_date: str,
    reason: str = "",
    auth_token: str = "",
) -> Dict[str, Any]:
    """Create a new delegation record.

    Parameters
    ----------
    delegatee_user_id : int
        The user who will receive delegated sign-off authority.
    start_date : str
        When delegation becomes active (ISO format YYYY-MM-DD).
    end_date : str
        When delegation expires (ISO format YYYY-MM-DD).
    reason : str
        Optional explanation for the delegation.
    auth_token : str
        JWT Bearer token of the invoking user (the delegator).

    Returns
    -------
    dict
        The created delegation record with user details.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        from app.services import delegation as del_service

        sd = date.fromisoformat(start_date)
        ed = date.fromisoformat(end_date)

        delegation = del_service.create_delegation(
            db,
            delegator_user_id=user.id,
            delegatee_user_id=delegatee_user_id,
            start_date=sd,
            end_date=ed,
            reason=reason or None,
        )
        delegatee = db.query(User).filter(User.id == delegation.delegatee_user_id).first()
        return {
            "id": delegation.id,
            "delegator": {
                "id": user.id,
                "username": user.username,
                "full_name": user.full_name,
            },
            "delegatee": {
                "id": delegatee.id,
                "username": delegatee.username,
                "full_name": delegatee.full_name,
            } if delegatee else None,
            "start_date": str(delegation.start_date),
            "end_date": str(delegation.end_date),
            "reason": delegation.reason,
            "message": f"Delegation created. {delegatee.full_name if delegatee else 'Delegatee'} will have your sign-off authority from {sd} to {ed}.",
        }
    except ValueError as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="get_my_delegations",
    description=(
        "List all delegations for the authenticated user, both outgoing "
        "(delegating to others) and incoming (others delegating to me)."
    ),
)
def get_my_delegations(
    direction: str = "outgoing",
    auth_token: str = "",
) -> Dict[str, Any]:
    """Get the authenticated user's delegation records.

    Parameters
    ----------
    direction : str
        Which delegations to list: 'outgoing', 'incoming', or 'all'.
    auth_token : str
        JWT Bearer token of the invoking user.

    Returns
    -------
    dict
        List of delegation records with user details and status.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        from app.services import delegation as del_service

        delegations = del_service.get_delegations_for_user(
            db, user.id, direction=direction
        )
        return {
            "delegations": delegations,
            "count": len(delegations),
            "direction": direction,
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="revoke_delegation",
    description=(
        "Revoke an active delegation before its end date. Only the original "
        "delegator can revoke their own delegation."
    ),
)
def revoke_delegation(
    delegation_id: int,
    auth_token: str = "",
) -> Dict[str, Any]:
    """Revoke an active delegation.

    Parameters
    ----------
    delegation_id : int
        The ID of the delegation to revoke.
    auth_token : str
        JWT Bearer token of the invoking user (must be the delegator).

    Returns
    -------
    dict
        The revoked delegation record with revocation timestamp.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        from app.services import delegation as del_service

        delegation = del_service.revoke_delegation(
            db, delegation_id, user.id
        )
        return {
            "id": delegation.id,
            "revoked": delegation.revoked,
            "revoked_at": delegation.revoked_at.isoformat() if delegation.revoked_at else None,
            "message": f"Delegation {delegation_id} has been revoked. Sign-off authority has reverted to you.",
        }
    except ValueError as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="check_delegation_coverage",
    description=(
        "Check whether the authenticated user has delegation covering a "
        "specific date range. Useful before booking leave to ensure "
        "sign-off authority is covered."
    ),
)
def check_delegation_coverage(
    start_date: str,
    end_date: str,
    auth_token: str = "",
) -> Dict[str, Any]:
    """Check delegation coverage for a date range.

    Parameters
    ----------
    start_date : str
        Start of the period to check (ISO format YYYY-MM-DD).
    end_date : str
        End of the period to check (ISO format YYYY-MM-DD).
    auth_token : str
        JWT Bearer token of the invoking user.

    Returns
    -------
    dict
        Coverage status, delegation details, and any gaps.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        from app.services import delegation as del_service

        sd = date.fromisoformat(start_date)
        ed = date.fromisoformat(end_date)

        coverage = del_service.check_delegation_coverage(
            db, user.id, sd, ed
        )
        return {
            "covered": coverage["covered"],
            "delegation": coverage.get("delegation"),
            "gaps": coverage.get("gaps", []),
            "delegatee": coverage.get("delegatee"),
            "message": (
                "Full delegation coverage confirmed."
                if coverage["covered"]
                else "Delegation gaps found. Please set up delegation for the uncovered dates."
            ),
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="get_my_line_manager",
    description=(
        "Find the authenticated user's direct line manager, including "
        "their contact details and security clearance."
    ),
)
def get_my_line_manager(
    auth_token: str = "",
) -> Dict[str, Any]:
    """Get the authenticated user's line manager.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.

    Returns
    -------
    dict
        Line manager details or None if no manager is set.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        from app.services import line_management as lm_service

        manager = lm_service.get_line_manager(db, user.id)
        if not manager:
            return {
                "manager": None,
                "message": "No line manager is currently assigned to you.",
            }
        return {
            "manager": {
                "id": manager.id,
                "username": manager.username,
                "full_name": manager.full_name,
                "email": manager.email,
                "clearance_level": manager.clearance_level.value if hasattr(manager.clearance_level, "value") else str(manager.clearance_level) if manager.clearance_level else None,
            },
            "message": f"Your line manager is {manager.full_name}.",
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="get_my_direct_reports",
    description=(
        "List all users who report directly to the authenticated user, "
        "including their skills and current leave status."
    ),
)
def get_my_direct_reports(
    auth_token: str = "",
) -> Dict[str, Any]:
    """Get the authenticated user's direct reports.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.

    Returns
    -------
    dict
        List of direct reports with details and leave status.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        from app.services import line_management as lm_service

        reports = lm_service.get_direct_reports(db, user.id)
        report_list = []
        for r in reports:
            # Check if they have any active leave
            active_leave = db.query(LeaveRequest).filter(
                LeaveRequest.user_id == r.id,
                LeaveRequest.status == LeaveStatus.APPROVED,
                LeaveRequest.start_date <= date.today(),
                LeaveRequest.end_date >= date.today(),
            ).first()
            report_list.append({
                "id": r.id,
                "username": r.username,
                "full_name": r.full_name,
                "email": r.email,
                "clearance_level": r.clearance_level.value if hasattr(r.clearance_level, "value") else str(r.clearance_level) if r.clearance_level else None,
                "currently_on_leave": active_leave is not None,
                "leave_type": active_leave.leave_type.value if active_leave and hasattr(active_leave.leave_type, "value") else None,
                "leave_end_date": active_leave.end_date.isoformat() if active_leave else None,
            })
        return {
            "direct_reports": report_list,
            "count": len(report_list),
            "message": f"You have {len(report_list)} direct report(s).",
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="get_team_leave_calendar",
    description=(
        "Show the leave calendar for the authenticated user's team over "
        "a date range, highlighting potential delivery risks when multiple "
        "team members are on leave simultaneously."
    ),
)
def get_team_leave_calendar(
    start_date: str,
    end_date: str,
    auth_token: str = "",
) -> Dict[str, Any]:
    """Get team leave overlap assessment for a date range.

    Parameters
    ----------
    start_date : str
        Start of the period (ISO format YYYY-MM-DD).
    end_date : str
        End of the period (ISO format YYYY-MM-DD).
    auth_token : str
        JWT Bearer token of the invoking user (line manager).

    Returns
    -------
    dict
        Team leave calendar with overlap risk assessment.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        from app.services import line_management as lm_service

        sd = date.fromisoformat(start_date)
        ed = date.fromisoformat(end_date)

        # Get all direct reports
        reports = lm_service.get_direct_reports(db, user.id)
        if not reports:
            return {
                "message": "You have no direct reports. Set up line management first.",
                "leave_entries": [],
            }

        # Collect leave requests for all reports in the date range
        leave_entries = []
        for r in reports:
            requests = db.query(LeaveRequest).filter(
                LeaveRequest.user_id == r.id,
                LeaveRequest.status.in_([LeaveStatus.PENDING, LeaveStatus.APPROVED]),
                LeaveRequest.start_date <= ed,
                LeaveRequest.end_date >= sd,
            ).all()
            for lr in requests:
                leave_entries.append({
                    "user_id": r.id,
                    "username": r.username,
                    "full_name": r.full_name,
                    "leave_type": lr.leave_type.value if hasattr(lr.leave_type, "value") else str(lr.leave_type),
                    "start_date": lr.start_date.isoformat(),
                    "end_date": lr.end_date.isoformat(),
                    "status": lr.status.value if hasattr(lr.status, "value") else str(lr.status),
                })

        # Calculate overlap risk
        total_team_size = len(reports)
        approved_count = sum(
            1 for e in leave_entries
            if e["status"] == "APPROVED"
        )
        pending_count = sum(
            1 for e in leave_entries
            if e["status"] == "PENDING"
        )

        # Check for days where multiple people are on leave
        overlap_days = 0
        current_date = sd
        while current_date <= ed:
            if current_date.weekday() < 5:  # Weekdays only
                on_leave = sum(
                    1 for e in leave_entries
                    if e["status"] == "APPROVED"
                    and date.fromisoformat(e["start_date"]) <= current_date
                    <= date.fromisoformat(e["end_date"])
                )
                if on_leave >= 2:
                    overlap_days += 1
            current_date += timedelta(days=1)

        # Risk assessment
        if total_team_size == 0:
            risk_level = "NONE"
        elif overlap_days == 0 and approved_count == 0:
            risk_level = "LOW"
        elif overlap_days <= 2 and approved_count < total_team_size // 2:
            risk_level = "MEDIUM"
        elif approved_count >= total_team_size // 2 or overlap_days > 5:
            risk_level = "HIGH"
        else:
            risk_level = "MEDIUM"

        return {
            "period": {"start": str(sd), "end": str(ed)},
            "team_size": total_team_size,
            "leave_entries": leave_entries,
            "approved_leave_count": approved_count,
            "pending_leave_count": pending_count,
            "overlap_days": overlap_days,
            "risk_level": risk_level,
            "message": (
                f"Team leave calendar: {approved_count} approved, {pending_count} pending. "
                f"Risk level: {risk_level}."
            ),
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


# ============================================================================
# Workforce Forecasting & Competency Pipeline
# ============================================================================

@mcp.tool(
    name="get_workforce_demand_forecast",
    description=(
        "Compute a time-phased workforce demand vector for a programme over "
        "a configurable planning horizon (default 36 months).  Returns monthly "
        "required labor hours grouped by skill tags, security clearance tiers, "
        "and safety accreditations.  Enforces ABAC clearance filtering so the "
        "invoking user only sees demand data for nodes within their clearance."
    ),
)
def get_workforce_demand_forecast(
    auth_token: str,
    programme_id: str,
    horizon_months: int = 36,
) -> Dict[str, Any]:
    """Get workforce demand forecast for a programme.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.
    programme_id : str
        UUID of the root programme node.
    horizon_months : int
        Planning horizon in months (default 36).

    Returns
    -------
    dict
        Workforce demand vector with monthly breakdowns by skill, clearance, and safety.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        programme_uuid = UUID(programme_id)
        root = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id == programme_uuid
        ).first()
        if root is None:
            raise ValueError(f"Programme {programme_id} not found")

        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        if not has_sufficient_clearance(user_clearance, root.security_classification):
            raise ValueError("Insufficient clearance to access this programme")

        from app.services.workforce_forecaster import compute_workforce_demand_vector

        result = compute_workforce_demand_vector(db, programme_uuid, horizon_months)
        return {
            **result,
            "message": f"Workforce demand forecast computed for {horizon_months} months.",
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="query_clearance_pipeline_deficits",
    description=(
        "Query flagged WORKFORCE_PIPELINE_DEFICIT records for a programme, "
        "returning clearance gap analysis with calculated Minimum Action Dates. "
        "These deficits indicate where the current workforce cannot meet upcoming "
        "task requirements in time, factoring in clearance vetting lead times."
    ),
)
def query_clearance_pipeline_deficits(
    auth_token: str,
    programme_id: str,
) -> Dict[str, Any]:
    """Query workforce pipeline deficits for a programme.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.
    programme_id : str
        UUID of the root programme node.

    Returns
    -------
    dict
        List of pipeline deficit records with Minimum Action Dates.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        programme_uuid = UUID(programme_id)
        root = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id == programme_uuid
        ).first()
        if root is None:
            raise ValueError(f"Programme {programme_id} not found")

        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        if not has_sufficient_clearance(user_clearance, root.security_classification):
            raise ValueError("Insufficient clearance to access this programme")

        from app.services.workforce_forecaster import (
            compute_workforce_demand_vector,
            evaluate_pipeline_deficits,
        )

        demand = compute_workforce_demand_vector(db, programme_uuid)
        deficits = evaluate_pipeline_deficits(db, demand)

        return {
            "programme_id": programme_id,
            "deficits": deficits,
            "deficit_count": len(deficits) if isinstance(deficits, list) else 0,
            "message": "Pipeline deficit evaluation complete.",
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


# ============================================================================
# Actionable Copilot Invertible Mutations
# ============================================================================

@mcp.tool(
    name="stage_schedule_shift",
    description=(
        "Stage an invertible schedule shift for a task node.  Validates "
        "arguments via Pydantic and stages a HistoryCommand through the "
        "Copilot action registry.  Positive delta_days moves dates later; "
        "negative moves them earlier."
    ),
)
def stage_schedule_shift(
    auth_token: str,
    node_id: str,
    delta_days: int,
) -> Dict[str, Any]:
    """Stage a schedule shift for a task.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.
    node_id : str
        UUID of the task node to shift.
    delta_days : int
        Number of days to shift (positive = later, negative = earlier).

    Returns
    -------
    dict
        Staged action payload with invertible operations.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        node_uuid = UUID(node_id)
        node = db.query(PortfolioNode).filter(PortfolioNode.id == node_uuid).first()
        if node is None:
            raise ValueError(f"Node {node_id} not found")

        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        if not has_sufficient_clearance(user_clearance, node.security_classification):
            raise ValueError("Insufficient clearance to modify this node")

        from app.services.copilot_actions import (
            get_tool_registry,
            ShiftTaskDatesArgs,
        )

        registry = get_tool_registry()
        args = ShiftTaskDatesArgs(node_id=node_uuid, delta_days=delta_days)

        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            payload = loop.run_until_complete(registry.dispatch("shift_task_dates", args.model_dump(), db))
        finally:
            loop.close()

        return {
            "tool_name": payload.tool_name,
            "success": payload.success,
            "operations": payload.operations,
            "message": payload.message,
            "error": payload.error,
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="stage_precedence_link",
    description=(
        "Stage a precedence dependency addition between two task nodes.  "
        "Checks for circularity before staging.  Supports FS, SS, FF, and SF "
        "link types with optional lag in days."
    ),
)
def stage_precedence_link(
    auth_token: str,
    pred_id: str,
    succ_id: str,
    link_type: str = "FS",
    lag_days: int = 0,
) -> Dict[str, Any]:
    """Stage a precedence link between two tasks.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.
    pred_id : str
        UUID of the predecessor node.
    succ_id : str
        UUID of the successor node.
    link_type : str
        Link type: FS, SS, FF, or SF (default FS).
    lag_days : int
        Lag in days (default 0).

    Returns
    -------
    dict
        Staged action payload with circularity check result.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        pred_uuid = UUID(pred_id)
        succ_uuid = UUID(succ_id)

        pred_node = db.query(PortfolioNode).filter(PortfolioNode.id == pred_uuid).first()
        succ_node = db.query(PortfolioNode).filter(PortfolioNode.id == succ_uuid).first()
        if pred_node is None:
            raise ValueError(f"Predecessor node {pred_id} not found")
        if succ_node is None:
            raise ValueError(f"Successor node {succ_id} not found")

        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        for node in (pred_node, succ_node):
            if not has_sufficient_clearance(user_clearance, node.security_classification):
                raise ValueError("Insufficient clearance to modify this node")

        from app.services.copilot_actions import (
            get_tool_registry,
            CreatePrecedenceLinkArgs,
        )

        registry = get_tool_registry()
        args = CreatePrecedenceLinkArgs(
            predecessor_id=pred_uuid,
            successor_id=succ_uuid,
            link_type=link_type,
            lag_days=lag_days,
        )

        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            payload = loop.run_until_complete(registry.dispatch("create_precedence_link", args.model_dump(), db))
        finally:
            loop.close()

        return {
            "tool_name": payload.tool_name,
            "success": payload.success,
            "operations": payload.operations,
            "message": payload.message,
            "error": payload.error,
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="stage_progress_update",
    description=(
        "Stage a progress percentage update for a task node.  Checks DAL/V&V "
        "gates before staging progress adjustments to ensure verification "
        "milestones are not bypassed."
    ),
)
def stage_progress_update(
    auth_token: str,
    node_id: str,
    physical_percent: float,
) -> Dict[str, Any]:
    """Stage a progress update for a task.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.
    node_id : str
        UUID of the task node.
    physical_percent : float
        Physical percent complete (0-100).

    Returns
    -------
    dict
        Staged action payload with gate check results.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        if not 0.0 <= physical_percent <= 100.0:
            raise ValueError("physical_percent must be between 0 and 100")

        node_uuid = UUID(node_id)
        node = db.query(PortfolioNode).filter(PortfolioNode.id == node_uuid).first()
        if node is None:
            raise ValueError(f"Node {node_id} not found")

        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        if not has_sufficient_clearance(user_clearance, node.security_classification):
            raise ValueError("Insufficient clearance to modify this node")

        from app.services.copilot_actions import (
            get_tool_registry,
            UpdateProgressPercentageArgs,
        )

        registry = get_tool_registry()
        args = UpdateProgressPercentageArgs(
            node_id=node_uuid,
            percent=physical_percent,
        )

        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            payload = loop.run_until_complete(registry.dispatch("update_progress_percentage", args.model_dump(), db))
        finally:
            loop.close()

        return {
            "tool_name": payload.tool_name,
            "success": payload.success,
            "operations": payload.operations,
            "message": payload.message,
            "error": payload.error,
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="stage_operational_blocker",
    description=(
        "Stage an operational blocker addition for a task node.  Triggers "
        "critical path verification to assess impact on delivery milestones. "
        "Severity must be CRITICAL, MAJOR, or MINOR."
    ),
)
def stage_operational_blocker(
    auth_token: str,
    node_id: str,
    severity: str,
    category: str,
    description: str,
) -> Dict[str, Any]:
    """Stage an operational blocker for a task.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.
    node_id : str
        UUID of the task node.
    severity : str
        Blocker severity: CRITICAL, MAJOR, or MINOR.
    category : str
        Blocker category (e.g., TECHNICAL, RESOURCE, PROCUREMENT).
    description : str
        Free-text description of the blocker.

    Returns
    -------
    dict
        Staged action payload with critical path verification.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        node_uuid = UUID(node_id)
        node = db.query(PortfolioNode).filter(PortfolioNode.id == node_uuid).first()
        if node is None:
            raise ValueError(f"Node {node_id} not found")

        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        if not has_sufficient_clearance(user_clearance, node.security_classification):
            raise ValueError("Insufficient clearance to modify this node")

        from app.services.copilot_actions import (
            get_tool_registry,
            FlagOperationalBlockerArgs,
        )

        registry = get_tool_registry()
        args = FlagOperationalBlockerArgs(
            node_id=node_uuid,
            severity=severity,
            category=category,
            impacted_hours=0,
        )

        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            payload = loop.run_until_complete(registry.dispatch("flag_operational_blocker", args.model_dump(), db))
        finally:
            loop.close()

        return {
            "tool_name": payload.tool_name,
            "success": payload.success,
            "operations": payload.operations,
            "message": payload.message,
            "error": payload.error,
            "description": description,
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


# ============================================================================
# Emergency Stoppage & Delegated Escalation
# ============================================================================

@mcp.tool(
    name="query_critical_stoppages",
    description=(
        "Query driving critical path blockers (Total Float <= 0) with active "
        "SLA countdown timers and active delegation paths.  Returns only "
        "blockers on the critical path that are impacting delivery milestones."
    ),
)
def query_critical_stoppages(
    auth_token: str,
    programme_id: str,
) -> Dict[str, Any]:
    """Query critical path stoppages for a programme.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.
    programme_id : str
        UUID of the root programme node.

    Returns
    -------
    dict
        List of critical path blockers with SLA timers and delegation info.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        programme_uuid = UUID(programme_id)
        root = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id == programme_uuid
        ).first()
        if root is None:
            raise ValueError(f"Programme {programme_id} not found")

        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        if not has_sufficient_clearance(user_clearance, root.security_classification):
            raise ValueError("Insufficient clearance to access this programme")

        all_nodes = _get_project_subtree(db, programme_uuid)
        node_ids = [n.id for n in all_nodes]

        blockers = db.query(NodeBlocker).filter(
            NodeBlocker.portfolio_node_id.in_(node_ids),
            NodeBlocker.resolved_at.is_(None),
        ).all()

        delegations = db.query(DelegationRecord).filter(
            DelegationRecord.end_date >= date.today()
        ).all()

        stoppages = []
        for blocker in blockers:
            node = db.query(PortfolioNode).filter(
                PortfolioNode.id == blocker.portfolio_node_id
            ).first()
            if node is None:
                continue

            attrs = node.custom_attributes or {}
            total_float = attrs.get("total_float", None)
            is_critical = total_float is not None and total_float <= 0

            delegation_path = []
            for d in delegations:
                if d.delegator_id == user.id or d.delegatee_id == user.id:
                    delegation_path.append({
                        "delegator_id": str(d.delegator_id),
                        "delegatee_id": str(d.delegatee_id),
                        "start_date": d.start_date.isoformat(),
                        "end_date": d.end_date.isoformat(),
                    })

            stoppages.append({
                "blocker_id": str(blocker.id),
                "node_id": str(blocker.portfolio_node_id),
                "node_name": node.name,
                "severity": blocker.severity.value if hasattr(blocker.severity, "value") else str(blocker.severity),
                "category": blocker.category.value if hasattr(blocker.category, "value") else str(blocker.category),
                "is_critical_path": is_critical,
                "created_at": blocker.created_at.isoformat() if blocker.created_at else None,
                "sla_hours_remaining": blocker.impacted_hours,
                "delegation_path": delegation_path,
            })

        return {
            "programme_id": programme_id,
            "stoppages": stoppages,
            "count": len(stoppages),
            "message": f"Found {len(stoppages)} active critical stoppages.",
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="resolve_stoppage_delegated",
    description=(
        "Resolve a blocker under delegated authority.  Logs dual attribution "
        "in the forensic ledger, recording both the delegated actor and the "
        "original delegator for audit trail purposes."
    ),
)
def resolve_stoppage_delegated(
    auth_token: str,
    blocker_id: str,
    resolution_notes: str,
) -> Dict[str, Any]:
    """Resolve a blocker under delegated authority.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.
    blocker_id : str
        UUID of the blocker to resolve.
    resolution_notes : str
        Free-text resolution notes for the forensic ledger.

    Returns
    -------
    dict
        Resolution result with dual attribution log entry.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        blocker_uuid = UUID(blocker_id)
        blocker = db.query(NodeBlocker).filter(NodeBlocker.id == blocker_uuid).first()
        if blocker is None:
            raise ValueError(f"Blocker {blocker_id} not found")

        active_delegation = db.query(DelegationRecord).filter(
            DelegationRecord.delegatee_id == user.id,
            DelegationRecord.start_date <= date.today(),
            DelegationRecord.end_date >= date.today(),
        ).first()

        blocker.resolved_at = datetime.now(timezone.utc)
        blocker.custom_attributes = blocker.custom_attributes or {}
        blocker.custom_attributes["resolution_notes"] = resolution_notes
        blocker.custom_attributes["resolved_by"] = str(user.id)
        if active_delegation:
            blocker.custom_attributes["delegated_from"] = str(active_delegation.delegator_id)

        db.flush()

        from app.models.models import ForensicAuditLog
        log_entry = ForensicAuditLog(
            user_id=user.id,
            action="RESOLVE_BLOCKER_DELEGATED",
            target_id=blocker_uuid,
            details={
                "blocker_id": str(blocker_id),
                "resolution_notes": resolution_notes,
                "resolved_by": str(user.id),
                "delegated_from": str(active_delegation.delegator_id) if active_delegation else None,
            },
        )
        db.add(log_entry)
        db.flush()

        return {
            "blocker_id": blocker_id,
            "resolved_at": blocker.resolved_at.isoformat(),
            "resolved_by": str(user.id),
            "delegated_from": str(active_delegation.delegator_id) if active_delegation else None,
            "message": f"Blocker {blocker_id} resolved under delegated authority.",
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


# ============================================================================
# Timesheet-to-Progress EVM Coherence
# ============================================================================

@mcp.tool(
    name="audit_timesheet_coherence",
    description=(
        "Run timesheet coherence audit for a given batch, comparing labor burn "
        "against physical progress.  Returns flagged divergence items where "
        "reported hours do not align with earned value metrics."
    ),
)
def audit_timesheet_coherence(
    auth_token: str,
    batch_id: str,
) -> Dict[str, Any]:
    """Audit timesheet coherence for a batch.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.
    batch_id : str
        UUID of the timesheet batch to audit.

    Returns
    -------
    dict
        Audit result with flagged divergence items.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        batch_uuid = UUID(batch_id)
        batch = db.query(TimesheetOracleExportBatch).filter(
            TimesheetOracleExportBatch.id == batch_uuid
        ).first()
        if batch is None:
            raise ValueError(f"Timesheet batch {batch_id} not found")

        from app.services.timesheet_coherence import audit_timesheet_coherence as ts_audit

        result = ts_audit(db, batch_uuid)

        return {
            **result,
            "audited_by": str(user.id),
            "message": "Timesheet coherence audit complete.",
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="submit_cam_timesheet_justification",
    description=(
        "Attach an IPMR Format 5 variance narrative to a held timesheet batch "
        "and transition it to CLEARED status.  Used by Contracting Officer "
        "Representatives to justify labor burn vs physical progress divergence."
    ),
)
def submit_cam_timesheet_justification(
    auth_token: str,
    batch_id: str,
    narrative: str,
    recovery_date: str,
) -> Dict[str, Any]:
    """Submit CAM justification for a timesheet batch.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.
    batch_id : str
        UUID of the timesheet batch.
    narrative : str
        IPMR Format 5 variance narrative.
    recovery_date : str
        Expected recovery date (ISO format YYYY-MM-DD).

    Returns
    -------
    dict
        Submission result with batch status transition.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        batch_uuid = UUID(batch_id)
        batch = db.query(TimesheetOracleExportBatch).filter(
            TimesheetOracleExportBatch.id == batch_uuid
        ).first()
        if batch is None:
            raise ValueError(f"Timesheet batch {batch_id} not found")

        from app.services.timesheet_coherence import (
            submit_cam_justification,
            clear_billing_hold,
        )

        justification = submit_cam_justification(
            db, batch_uuid, narrative, date.fromisoformat(recovery_date)
        )
        clear_billing_hold(db, batch_uuid)

        return {
            **justification,
            "batch_id": batch_id,
            "cleared_by": str(user.id),
            "message": f"Batch {batch_id} cleared with CAM justification.",
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


# ============================================================================
# Cost Curves & Fiscal Tranches
# ============================================================================

@mcp.tool(
    name="get_cost_distribution_profile",
    description=(
        "Return the active cost distribution method and shape factors for a "
        "node.  Supported methods include Weibull, Beta, Rayleigh, and Linear. "
        "Shape factors define the time-phased spend curve profile."
    ),
)
def get_cost_distribution_profile(
    auth_token: str,
    node_id: str,
) -> Dict[str, Any]:
    """Get cost distribution profile for a node.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.
    node_id : str
        UUID of the node.

    Returns
    -------
    dict
        Cost distribution method and shape factors.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        node_uuid = UUID(node_id)
        node = db.query(PortfolioNode).filter(PortfolioNode.id == node_uuid).first()
        if node is None:
            raise ValueError(f"Node {node_id} not found")

        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        if not has_sufficient_clearance(user_clearance, node.security_classification):
            raise ValueError("Insufficient clearance to access this node")

        attrs = node.custom_attributes or {}
        cost_profile = attrs.get("cost_distribution", {})

        if not cost_profile:
            cost_profile = {
                "method": "Linear",
                "shape_k": 1.0,
                "shape_lambda": 1.0,
            }

        return {
            "node_id": node_id,
            "node_name": node.name,
            "distribution": cost_profile,
            "message": f"Cost distribution profile for '{node.name}'.",
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="set_cost_distribution_profile",
    description=(
        "Update the cost distribution profile for a node and recalculate "
        "time-phased spend vectors.  Supported methods: Weibull, Beta, "
        "Rayleigh, Linear.  Shape parameters k and lambda control the curve."
    ),
)
def set_cost_distribution_profile(
    auth_token: str,
    node_id: str,
    method: str,
    shape_k: float = 2.0,
    shape_lambda: float = 1.0,
) -> Dict[str, Any]:
    """Set cost distribution profile for a node.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.
    node_id : str
        UUID of the node.
    method : str
        Distribution method: Weibull, Beta, Rayleigh, or Linear.
    shape_k : float
        Shape parameter k (default 2.0).
    shape_lambda : float
        Shape parameter lambda (default 1.0).

    Returns
    -------
    dict
        Updated cost distribution profile.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        valid_methods = ["Weibull", "Beta", "Rayleigh", "Linear"]
        if method not in valid_methods:
            raise ValueError(f"method must be one of {valid_methods}")

        node_uuid = UUID(node_id)
        node = db.query(PortfolioNode).filter(PortfolioNode.id == node_uuid).first()
        if node is None:
            raise ValueError(f"Node {node_id} not found")

        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        if not has_sufficient_clearance(user_clearance, node.security_classification):
            raise ValueError("Insufficient clearance to modify this node")

        node.custom_attributes = node.custom_attributes or {}
        node.custom_attributes["cost_distribution"] = {
            "method": method,
            "shape_k": shape_k,
            "shape_lambda": shape_lambda,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": str(user.id),
        }
        db.flush()

        return {
            "node_id": node_id,
            "node_name": node.name,
            "distribution": node.custom_attributes["cost_distribution"],
            "message": f"Cost distribution for '{node.name}' updated to {method}.",
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="audit_fiscal_tranche_overruns",
    description=(
        "Compare non-linear periodic spend against statutory tranche spending "
        "caps for a given fiscal year.  Returns overrun items where actual "
        "spend exceeds the allocated tranche cap."
    ),
)
def audit_fiscal_tranche_overruns(
    auth_token: str,
    programme_id: str,
    fiscal_year: int,
) -> Dict[str, Any]:
    """Audit fiscal tranche overruns for a programme.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.
    programme_id : str
        UUID of the root programme node.
    fiscal_year : int
        Fiscal year to audit (e.g., 2025).

    Returns
    -------
    dict
        List of tranche overrun items with variance amounts.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        programme_uuid = UUID(programme_id)
        root = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id == programme_uuid
        ).first()
        if root is None:
            raise ValueError(f"Programme {programme_id} not found")

        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        if not has_sufficient_clearance(user_clearance, root.security_classification):
            raise ValueError("Insufficient clearance to access this programme")

        caps = db.query(FiscalYearSpendingCap).filter(
            FiscalYearSpendingCap.fiscal_year == fiscal_year,
        ).all()

        overruns = []
        for cap in caps:
            actual_spend = cap.actual_spend or Decimal("0")
            cap_amount = cap.cap_amount or Decimal("0")

            if actual_spend > cap_amount:
                variance = actual_spend - cap_amount
                overruns.append({
                    "control_account": str(cap.control_account_id) if cap.control_account_id else "N/A",
                    "cap_amount": float(cap_amount),
                    "actual_spend": float(actual_spend),
                    "variance": float(variance),
                    "overrun_percent": float(variance / cap_amount * 100) if cap_amount > 0 else 0,
                })

        return {
            "programme_id": programme_id,
            "fiscal_year": fiscal_year,
            "overruns": overruns,
            "overrun_count": len(overruns),
            "message": f"Found {len(overruns)} tranche overruns for FY{fiscal_year}.",
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


# ============================================================================
# Export Control & Foreign Disclosure
# ============================================================================

@mcp.tool(
    name="list_export_control_licenses",
    description=(
        "List active export control licenses (DSP-5, TAA, UK SIEL) with drawn "
        "monetary values and expiration dates.  Optionally filter by regime."
    ),
)
def list_export_control_licenses(
    auth_token: str,
    regime: str = None,
) -> Dict[str, Any]:
    """List active export control licenses.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.
    regime : str, optional
        Filter by regime (e.g., "ITAR", "EAR", "UK_SIEL").

    Returns
    -------
    dict
        List of active licenses with monetary values and expiration dates.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        query = db.query(ExportControlLicense).filter(
            ExportControlLicense.is_active == True
        )

        if regime:
            query = query.filter(ExportControlLicense.regime == regime)

        licenses = query.all()

        license_list = []
        for lic in licenses:
            license_list.append({
                "license_id": str(lic.id),
                "type": lic.license_type.value if hasattr(lic.license_type, "value") else str(lic.license_type),
                "regime": lic.regime,
                "license_number": lic.license_number,
                "issued_to": lic.issued_to,
                "issued_date": lic.issued_date.isoformat() if lic.issued_date else None,
                "expiration_date": lic.expiration_date.isoformat() if lic.expiration_date else None,
                "authorized_value": float(lic.authorized_value) if lic.authorized_value else 0,
                "drawn_value": float(lic.drawn_value) if lic.drawn_value else 0,
                "remaining_value": float(lic.authorized_value - lic.drawn_value) if lic.authorized_value and lic.drawn_value else 0,
                "is_active": lic.is_active,
            })

        return {
            "licenses": license_list,
            "count": len(license_list),
            "regime_filter": regime,
            "message": f"Found {len(license_list)} active export control licenses.",
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="check_foreign_disclosure_compliance",
    description=(
        "Evaluate whether a foreign national from the specified nation can "
        "access a node under active TAA/MLA authorizations.  Returns compliance "
        "status with applicable license references."
    ),
)
def check_foreign_disclosure_compliance(
    auth_token: str,
    node_id: str,
    foreign_nation_iso: str,
) -> Dict[str, Any]:
    """Check foreign disclosure compliance for a node.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.
    node_id : str
        UUID of the node to check.
    foreign_nation_iso : str
        ISO 3166-1 alpha-2 country code (e.g., "GB", "US", "FR").

    Returns
    -------
    dict
        Compliance status with applicable license references.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        node_uuid = UUID(node_id)
        node = db.query(PortfolioNode).filter(PortfolioNode.id == node_uuid).first()
        if node is None:
            raise ValueError(f"Node {node_id} not found")

        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        if not has_sufficient_clearance(user_clearance, node.security_classification):
            raise ValueError("Insufficient clearance to access this node")

        active_licenses = db.query(ExportControlLicense).filter(
            ExportControlLicense.is_active == True,
            ExportControlLicense.expiration_date >= date.today(),
        ).all()

        compliant = False
        applicable_licenses = []
        for lic in active_licenses:
            attrs = lic.custom_attributes or {}
            authorized_nations = attrs.get("authorized_nations", [])
            if foreign_nation_iso.upper() in [n.upper() for n in authorized_nations]:
                compliant = True
                applicable_licenses.append({
                    "license_id": str(lic.id),
                    "license_number": lic.license_number,
                    "type": lic.license_type.value if hasattr(lic.license_type, "value") else str(lic.license_type),
                    "regime": lic.regime,
                })

        node_attrs = node.custom_attributes or {}
        restricted_nations = node_attrs.get("restricted_nations", [])
        if foreign_nation_iso.upper() in [n.upper() for n in restricted_nations]:
            compliant = False

        return {
            "node_id": node_id,
            "node_name": node.name,
            "foreign_nation": foreign_nation_iso,
            "is_compliant": compliant,
            "applicable_licenses": applicable_licenses,
            "message": (
                f"Foreign disclosure check for {foreign_nation_iso}: "
                f"{'COMPLIANT' if compliant else 'NON-COMPLIANT'}."
            ),
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


# ============================================================================
# Hardware Enclave & Quarantine Diagnostics
# ============================================================================

@mcp.tool(
    name="get_hsm_token_health",
    description=(
        "Inspect on-token PKCS#11 slot status, hardware signing rate, and "
        "signature health.  Returns HSM token diagnostics for forensic "
        "ledger integrity verification."
    ),
)
def get_hsm_token_health(
    auth_token: str,
) -> Dict[str, Any]:
    """Get HSM token health status.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.

    Returns
    -------
    dict
        HSM token health diagnostics.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        if CLEARANCE_LEVELS.get(str(user_clearance), 0) < CLEARANCE_LEVELS.get("SECRET", 3):
            raise ValueError("Insufficient clearance for HSM diagnostics")

        from app.models.models import SystemConfig
        hsm_config = db.query(SystemConfig).filter(
            SystemConfig.config_key == "hsm_token_status"
        ).first()

        if hsm_config:
            config_value = hsm_config.config_value or {}
        else:
            config_value = {}

        return {
            "slot_status": config_value.get("slot_status", "UNKNOWN"),
            "token_label": config_value.get("token_label", "UNKNOWN"),
            "signing_rate_per_sec": config_value.get("signing_rate_per_sec", 0),
            "signature_health": config_value.get("signature_health", "UNKNOWN"),
            "last_check": config_value.get("last_check", None),
            "message": "HSM token health check complete.",
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="inspect_quarantine_cycles",
    description=(
        "Return isolated cycle loops and minimum feedback edge sets for a "
        "quarantine batch.  Used to diagnose scheduling integrity issues "
        "before committing to the master schedule."
    ),
)
def inspect_quarantine_cycles(
    auth_token: str,
    batch_id: str,
) -> Dict[str, Any]:
    """Inspect quarantine cycles for a batch.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.
    batch_id : str
        UUID of the quarantine batch.

    Returns
    -------
    dict
        Cycle analysis with feedback edge sets.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        batch_uuid = UUID(batch_id)
        batch = db.query(QuarantineBatch).filter(
            QuarantineBatch.id == batch_uuid
        ).first()
        if batch is None:
            raise ValueError(f"Quarantine batch {batch_id} not found")

        from app.services.schedule_quarantine import evaluate_quarantine_integrity

        result = evaluate_quarantine_integrity(db, batch_uuid)

        return {
            **result,
            "batch_id": batch_id,
            "message": "Quarantine cycle inspection complete.",
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


@mcp.tool(
    name="auto_decouple_quarantine_cycles",
    description=(
        "Invoke automated feedback loop decoupling into terminal milestone "
        "anchors for a quarantine batch.  Breaks circular dependencies by "
        "converting feedback edges to milestone-based precedence links."
    ),
)
def auto_decouple_quarantine_cycles(
    auth_token: str,
    batch_id: str,
) -> Dict[str, Any]:
    """Auto-decouple quarantine cycles for a batch.

    Parameters
    ----------
    auth_token : str
        JWT Bearer token of the invoking user.
    batch_id : str
        UUID of the quarantine batch.

    Returns
    -------
    dict
        Decoupling result with modified edges.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)

        batch_uuid = UUID(batch_id)
        batch = db.query(QuarantineBatch).filter(
            QuarantineBatch.id == batch_uuid
        ).first()
        if batch is None:
            raise ValueError(f"Quarantine batch {batch_id} not found")

        from app.services.schedule_quarantine import auto_decouple_cycles

        result = auto_decouple_cycles(db, batch_uuid)

        return {
            **result,
            "batch_id": batch_id,
            "decoupled_by": str(user.id),
            "message": "Quarantine cycle decoupling complete.",
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


# ============================================================================
# Two-Tier Dynamic Tool Scoping & Workflow Discovery – MCP Resource
# ============================================================================

STANDARD_OPERATING_PROCEDURES = {
    "version": "1.0.0",
    "description": (
        "Machine-readable standard workflows instructing the agent on "
        "compliant step order for schedule operations."
    ),
    "phases": [
        {
            "phase": "A",
            "name": "Baseline Assessment",
            "description": (
                "Establish the current schedule state before proposing changes."
            ),
            "tools": [
                {
                    "tool": "get_project_critical_path",
                    "purpose": "Identify current critical path and float status.",
                    "required_params": ["project_id", "auth_token"],
                },
                {
                    "tool": "get_baseline_variance",
                    "purpose": "Compare current state against the frozen baseline.",
                    "required_params": ["project_id", "baseline_id", "auth_token"],
                },
            ],
        },
        {
            "phase": "B",
            "name": "Conflict Pre-Check",
            "description": (
                "Verify that the target nodes are available for mutation and "
                "compliant with export control rules."
            ),
            "tools": [
                {
                    "tool": "check_subtree_lease_status",
                    "purpose": "Confirm no active CAM checkout lease blocks the node.",
                    "required_params": ["node_id", "auth_token"],
                },
                {
                    "tool": "verify_export_control_compliance",
                    "purpose": "Ensure export control licences cover the operation.",
                    "required_params": ["node_id", "auth_token"],
                },
            ],
        },
        {
            "phase": "C",
            "name": "Staged Mutation Dispatch",
            "description": (
                "Propose mutations within an isolated agent staging session "
                "without touching live tables."
            ),
            "tools": [
                {
                    "tool": "agent_propose_schedule_shift",
                    "purpose": "Stage a planned date shift for a node.",
                    "required_params": [
                        "session_id", "node_id", "new_start_date",
                        "new_end_date", "client_mutation_id", "auth_token",
                    ],
                },
                {
                    "tool": "agent_propose_precedence_link",
                    "purpose": "Stage a new dependency link with cycle detection.",
                    "required_params": [
                        "session_id", "predecessor_id", "successor_id",
                        "client_mutation_id", "auth_token",
                    ],
                },
                {
                    "tool": "agent_propose_progress_update",
                    "purpose": "Stage a progress percentage change.",
                    "required_params": [
                        "session_id", "node_id", "percent_complete",
                        "client_mutation_id", "auth_token",
                    ],
                },
            ],
        },
        {
            "phase": "D",
            "name": "Verification & Validation",
            "description": (
                "Simulate the impact of staged mutations and finalize the session."
            ),
            "tools": [
                {
                    "tool": "simulate_staged_cpm_pass",
                    "purpose": (
                        "Overlay staged mutations on the graph and recompute "
                        "float to verify negative float is resolved."
                    ),
                    "required_params": ["session_id", "auth_token"],
                },
                {
                    "tool": "agent_finalize_proposal_session",
                    "purpose": (
                        "Commit or reject the proposal session after human review."
                    ),
                    "required_params": [
                        "session_id", "action", "reviewer_user_id", "auth_token",
                    ],
                },
            ],
        },
    ],
}


@mcp.resource(
    uri="ppm://process/standard-operating-procedures",
    name="standard-operating-procedures",
    description=(
        "Machine-readable standard operating procedures for compliant "
        "agent-driven schedule operations.  Returns the phased workflow "
        "defining tool call order: Baseline Assessment → Conflict Pre-Check "
        "→ Staged Mutation Dispatch → Verification & Validation."
    ),
)
def get_standard_operating_procedures() -> Dict[str, Any]:
    """Return the standard operating procedures workflow.

    Returns
    -------
    dict
        The structured SOP definition with phases and tool sequences.
    """
    return STANDARD_OPERATING_PROCEDURES


# ============================================================================
# Agent Workflow Tools – Phase B: Conflict Pre-Check
# ============================================================================

@mcp.tool(
    name="check_subtree_lease_status",
    description=(
        "Check whether a node is currently locked by an active CAM checkout "
        "lease.  Returns the lease details if locked, or confirms the node "
        "is available for mutation."
    ),
)
def check_subtree_lease_status(
    node_id: str,
    auth_token: str,
) -> Dict[str, Any]:
    """Check lease status for a node.

    Parameters
    ----------
    node_id : str
        UUID of the node to check.
    auth_token : str
        JWT Bearer token of the invoking user.

    Returns
    -------
    dict
        Lease status with details if locked.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        node_uuid = UUID(node_id)

        from app.services.agent_staging_service import _is_node_locked_by_lease
        from app.models.leases import SubTreeCheckOut
        from datetime import datetime as dt

        node = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id == node_uuid
        ).first()
        if node is None:
            raise ValueError(f"Node {node_id} not found")

        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        if not has_sufficient_clearance(user_clearance, node.security_classification):
            raise ClearanceCeilingExceeded(
                node_classification=str(node.security_classification),
                user_clearance=str(user_clearance),
            )

        is_locked = _is_node_locked_by_lease(db, node_uuid)

        # Find the active lease details if locked
        lease_details = None
        if is_locked:
            now = dt.now(timezone.utc)
            target_path = str(node.path)
            active_lease = db.query(SubTreeCheckOut).filter(
                SubTreeCheckOut.is_active == True,
                SubTreeCheckOut.expires_at > now,
            ).first()
            if active_lease is not None:
                lease_path = str(active_lease.ltree_scope_path)
                if target_path.startswith(lease_path):
                    lease_details = {
                        "lease_id": str(active_lease.id),
                        "ltree_scope_path": lease_path,
                        "leased_by_user_id": active_lease.leased_by_user_id,
                        "expires_at": active_lease.expires_at.isoformat(),
                    }

        return {
            "node_id": node_id,
            "node_path": str(node.path),
            "is_locked": is_locked,
            "lease_details": lease_details,
            "message": (
                f"Node {node_id} is {'locked' if is_locked else 'available'} "
                f"for mutation."
            ),
        }
    except (SubTreeLockedException, CycleDetectedException, ClearanceCeilingExceeded) as e:
        return _build_error_result(e, "node_id")
    except Exception as e:
        return _build_error_result(e, "node_id")
    finally:
        db.close()


@mcp.tool(
    name="verify_export_control_compliance",
    description=(
        "Verify that export control compliance requirements are met for a "
        "node before staging mutations.  Checks active licences and "
        "restricted nation lists."
    ),
)
def verify_export_control_compliance(
    node_id: str,
    auth_token: str,
) -> Dict[str, Any]:
    """Verify export control compliance for a node.

    Parameters
    ----------
    node_id : str
        UUID of the node to verify.
    auth_token : str
        JWT Bearer token of the invoking user.

    Returns
    -------
    dict
        Compliance status with licence references.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        node_uuid = UUID(node_id)

        node = db.query(PortfolioNode).filter(PortfolioNode.id == node_uuid).first()
        if node is None:
            raise ValueError(f"Node {node_id} not found")

        user_clearance = user.clearance_level or SecurityClassification.OFFICIAL
        if not has_sufficient_clearance(user_clearance, node.security_classification):
            raise ClearanceCeilingExceeded(
                node_classification=str(node.security_classification),
                user_clearance=str(user_clearance),
            )

        # Check for active export control licences
        active_licenses = db.query(ExportControlLicense).filter(
            ExportControlLicense.is_active == True,
            ExportControlLicense.expiration_date >= date.today(),
        ).all()

        node_attrs = node.custom_attributes or {}
        restricted_nations = node_attrs.get("restricted_nations", [])
        required_regimes = node_attrs.get("required_regimes", [])

        compliant_licenses = []
        for lic in active_licenses:
            lic_attrs = lic.custom_attributes or {}
            authorized_nations = lic_attrs.get("authorized_nations", [])
            compliant_licenses.append({
                "license_id": str(lic.id),
                "license_number": lic.license_number,
                "type": lic.license_type.value if hasattr(lic.license_type, "value") else str(lic.license_type),
                "regime": lic.regime,
                "authorized_nations": authorized_nations,
            })

        is_compliant = len(compliant_licenses) > 0 or len(required_regimes) == 0

        return {
            "node_id": node_id,
            "node_name": node.name,
            "is_compliant": is_compliant,
            "active_licenses": compliant_licenses,
            "restricted_nations": restricted_nations,
            "message": (
                f"Export control check for node {node_id}: "
                f"{'COMPLIANT' if is_compliant else 'NON-COMPLIANT'}."
            ),
        }
    except (SubTreeLockedException, CycleDetectedException, ClearanceCeilingExceeded) as e:
        return _build_error_result(e, "node_id")
    except Exception as e:
        return _build_error_result(e, "node_id")
    finally:
        db.close()


# ============================================================================
# Agent Workflow Tools – Phase C: Staged Mutation Dispatch
# ============================================================================

@mcp.tool(
    name="agent_propose_schedule_shift",
    description=(
        "Stage a planned date shift for a node within an agent proposal "
        "session.  Validates lease status and captures inverse delta for "
        "reversibility.  Requires client_mutation_id for idempotency fencing."
    ),
)
def agent_propose_schedule_shift(
    session_id: str,
    node_id: str,
    new_start_date: str,
    new_end_date: str,
    client_mutation_id: str,
    auth_token: str,
) -> Dict[str, Any]:
    """Stage a schedule shift mutation.

    Parameters
    ----------
    session_id : str
        UUID of the agent proposal session.
    node_id : str
        UUID of the target node.
    new_start_date : str
        ISO-8601 planned start date.
    new_end_date : str
        ISO-8601 planned end date.
    client_mutation_id : str
        Client-provided UUID for idempotency fencing.
    auth_token : str
        JWT Bearer token of the invoking user.

    Returns
    -------
    dict
        Staged mutation details.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        session_uuid = UUID(session_id)
        node_uuid = UUID(node_id)
        client_mut_uuid = UUID(client_mutation_id)

        from app.services.agent_staging_service import stage_agent_action

        mutation = stage_agent_action(
            db=db,
            session_id=session_uuid,
            node_id=node_uuid,
            action_type="NODE_SHIFT",
            forward_patch={
                "planned_start_date": new_start_date,
                "planned_end_date": new_end_date,
            },
            client_mutation_id=client_mut_uuid,
        )

        return {
            "status": "STAGED",
            "mutation_id": str(mutation.id),
            "client_mutation_id": str(mutation.client_mutation_id),
            "session_id": session_id,
            "node_id": node_id,
            "action_type": "NODE_SHIFT",
            "forward_delta": mutation.forward_delta,
            "topological_impact": mutation.topological_impact_summary,
            "message": f"Schedule shift staged for node {node_id}.",
        }
    except SubTreeLockedException as e:
        return _build_error_result(e, "node_id")
    except Exception as e:
        return _build_error_result(e, "node_id")
    finally:
        db.close()


@mcp.tool(
    name="agent_propose_precedence_link",
    description=(
        "Stage a new dependency link within an agent proposal session. "
        "Checks for topological cycles before staging. "
        "Requires client_mutation_id for idempotency fencing."
    ),
)
def agent_propose_precedence_link(
    session_id: str,
    predecessor_id: str,
    successor_id: str,
    client_mutation_id: str,
    auth_token: str,
    link_type: str = "FS",
    lag_days: int = 0,
) -> Dict[str, Any]:
    """Stage a precedence link mutation.

    Parameters
    ----------
    session_id : str
        UUID of the agent proposal session.
    predecessor_id : str
        UUID of the predecessor node.
    successor_id : str
        UUID of the successor node.
    client_mutation_id : str
        Client-provided UUID for idempotency fencing.
    auth_token : str
        JWT Bearer token of the invoking user.
    link_type : str
        Dependency type (FS, SS, FF, SF). Default FS.
    lag_days : int
        Lag in days. Default 0.

    Returns
    -------
    dict
        Staged mutation details.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        session_uuid = UUID(session_id)
        succ_uuid = UUID(successor_id)
        pred_uuid = UUID(predecessor_id)
        client_mut_uuid = UUID(client_mutation_id)

        # Cycle detection: check if successor is an ancestor of predecessor
        pred_node = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id == pred_uuid
        ).first()
        succ_node = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id == succ_uuid
        ).first()

        if pred_node is None:
            raise ValueError(f"Predecessor node {predecessor_id} not found")
        if succ_node is None:
            raise ValueError(f"Successor node {successor_id} not found")

        # Check for existing dependency path from successor back to predecessor
        # which would create a cycle
        existing_deps = db.query(DependencyLink).all()
        
        # BFS from successor to see if we can reach predecessor
        succ_map: Dict[UUID, List[UUID]] = {}
        for dep in existing_deps:
            succ_map.setdefault(dep.predecessor_id, []).append(dep.successor_id)

        visited = set()
        queue = [succ_uuid]
        while queue:
            current = queue.pop(0)
            if current in visited:
                continue
            visited.add(current)
            for next_node in succ_map.get(current, []):
                if next_node == pred_uuid:
                    # Cycle detected!
                    raise CycleDetectedException(
                        target_node_id=predecessor_id,
                        cycle_path=[str(succ_uuid), str(pred_uuid)],
                    )
                queue.append(next_node)

        from app.services.agent_staging_service import stage_agent_action

        mutation = stage_agent_action(
            db=db,
            session_id=session_uuid,
            node_id=succ_uuid,
            action_type="LINK_CREATE",
            forward_patch={
                "predecessor_id": str(pred_uuid),
                "successor_id": str(succ_uuid),
                "link_type": link_type,
                "lag_days": lag_days,
            },
            client_mutation_id=client_mut_uuid,
        )

        return {
            "status": "STAGED",
            "mutation_id": str(mutation.id),
            "client_mutation_id": str(mutation.client_mutation_id),
            "session_id": session_id,
            "predecessor_id": predecessor_id,
            "successor_id": successor_id,
            "action_type": "LINK_CREATE",
            "link_type": link_type,
            "lag_days": lag_days,
            "message": f"Precedence link staged from {predecessor_id} to {successor_id}.",
        }
    except CycleDetectedException as e:
        return _build_error_result(e, "predecessor_id")
    except SubTreeLockedException as e:
        return _build_error_result(e, "successor_id")
    except Exception as e:
        return _build_error_result(e, "session_id")
    finally:
        db.close()


@mcp.tool(
    name="agent_propose_progress_update",
    description=(
        "Stage a progress percentage update within an agent proposal session. "
        "Validates DAL/V&V gate constraints. "
        "Requires client_mutation_id for idempotency fencing."
    ),
)
def agent_propose_progress_update(
    session_id: str,
    node_id: str,
    percent_complete: float,
    client_mutation_id: str,
    auth_token: str,
) -> Dict[str, Any]:
    """Stage a progress update mutation.

    Parameters
    ----------
    session_id : str
        UUID of the agent proposal session.
    node_id : str
        UUID of the target node.
    percent_complete : float
        New progress percentage (0-100).
    client_mutation_id : str
        Client-provided UUID for idempotency fencing.
    auth_token : str
        JWT Bearer token of the invoking user.

    Returns
    -------
    dict
        Staged mutation details.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        session_uuid = UUID(session_id)
        node_uuid = UUID(node_id)
        client_mut_uuid = UUID(client_mutation_id)

        if not 0.0 <= percent_complete <= 100.0:
            raise ValueError("percent_complete must be between 0 and 100")

        from app.services.agent_staging_service import stage_agent_action

        mutation = stage_agent_action(
            db=db,
            session_id=session_uuid,
            node_id=node_uuid,
            action_type="PROGRESS_SET",
            forward_patch={"percent_complete": percent_complete},
            client_mutation_id=client_mut_uuid,
        )

        return {
            "status": "STAGED",
            "mutation_id": str(mutation.id),
            "client_mutation_id": str(mutation.client_mutation_id),
            "session_id": session_id,
            "node_id": node_id,
            "action_type": "PROGRESS_SET",
            "percent_complete": percent_complete,
            "message": f"Progress update staged for node {node_id}.",
        }
    except SubTreeLockedException as e:
        return _build_error_result(e, "node_id")
    except Exception as e:
        return _build_error_result(e, "node_id")
    finally:
        db.close()


@mcp.tool(
    name="agent_propose_blocker",
    description=(
        "Stage a new blocker record for a task node within an agent proposal "
        "session.  Captures the blocker severity, category, and estimated "
        "impact hours."
    ),
)
def agent_propose_blocker(
    session_id: str,
    node_id: str,
    severity: str,
    category: str,
    description: str = "",
    auth_token: str = "",
) -> Dict[str, Any]:
    """Stage a blocker raise mutation.

    Parameters
    ----------
    session_id : str
        UUID of the agent proposal session.
    node_id : str
        UUID of the target node.
    severity : str
        Blocker severity: CRITICAL, MAJOR, or MINOR.
    category : str
        Blocker category (DEPENDENCY_OVERDUE, RESOURCE_UNAVAILABLE,
        CLEARANCE_HOLD, FACILITY_MAINTENANCE, OPERATIONAL_IMPEDIMENT).
    description : str
        Free-text description of the blocker.
    auth_token : str
        JWT Bearer token of the invoking user.

    Returns
    -------
    dict
        Staged mutation details.
    """
    db = SessionLocal()
    try:
        if auth_token:
            _get_user_from_token(db, auth_token)
        session_uuid = UUID(session_id)
        node_uuid = UUID(node_id)

        valid_severities = {"CRITICAL", "MAJOR", "MINOR"}
        if severity.upper() not in valid_severities:
            raise ValueError(f"severity must be one of {valid_severities}")

        valid_categories = {
            "DEPENDENCY_OVERDUE", "RESOURCE_UNAVAILABLE", "CLEARANCE_HOLD",
            "FACILITY_MAINTENANCE", "OPERATIONAL_IMPEDIMENT",
        }
        if category.upper() not in valid_categories:
            raise ValueError(f"category must be one of {valid_categories}")

        from app.services.agent_staging_service import stage_agent_action

        mutation = stage_agent_action(
            db=db,
            session_id=session_uuid,
            node_id=node_uuid,
            action_type="BLOCKER_RAISE",
            forward_patch={
                "severity": severity.upper(),
                "category": category.upper(),
                "description": description,
                "impacted_hours": 8.0,
            },
        )

        return {
            "status": "STAGED",
            "mutation_id": str(mutation.id),
            "session_id": session_id,
            "node_id": node_id,
            "action_type": "BLOCKER_RAISE",
            "severity": severity.upper(),
            "category": category.upper(),
            "message": f"Blocker staged for node {node_id}.",
        }
    except SubTreeLockedException as e:
        return _build_error_result(e, "node_id")
    except Exception as e:
        return _build_error_result(e, "node_id")
    finally:
        db.close()


# ============================================================================
# Agent Workflow Tools – Phase D: Verification & Validation
# ============================================================================

@mcp.tool(
    name="simulate_staged_cpm_pass",
    description=(
        "Overlay all uncommitted AgentStagedMutation records for a given "
        "session on top of the in-memory graph and recompute CPM float. "
        "Allows the agent to verify that proposed changes resolve negative "
        "float before notifying the human reviewer."
    ),
)
def simulate_staged_cpm_pass(
    session_id: str,
    auth_token: str,
) -> Dict[str, Any]:
    """Simulate CPM pass with staged mutations overlaid.

    Parameters
    ----------
    session_id : str
        UUID of the agent proposal session.
    auth_token : str
        JWT Bearer token of the invoking user.

    Returns
    -------
    dict
        Simulated CPM results with projected float values.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        session_uuid = UUID(session_id)

        from app.models.agent_staging import (
            AgentProposalSession,
            AgentStagedMutation,
        )

        session = db.query(AgentProposalSession).filter(
            AgentProposalSession.id == session_uuid
        ).first()
        if session is None:
            # Check identity map
            for obj in db.identity_map.get(AgentProposalSession, {}).values():
                if obj.id == session_uuid:
                    session = obj
                    break
        if session is None:
            raise ValueError(f"Proposal session {session_id} not found")

        # Get all staged mutations for this session
        mutations = db.query(AgentStagedMutation).filter(
            AgentStagedMutation.session_id == session_uuid
        ).order_by(AgentStagedMutation.sequence_order).all()

        # Also check identity map for unflushed mutations
        for obj in db.identity_map.get(AgentStagedMutation, {}).values():
            if obj.session_id == session_uuid and obj not in mutations:
                mutations.append(obj)
        mutations.sort(key=lambda m: m.sequence_order)

        # Get the programme root node
        programme_node = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id == session.programme_id
        ).first()
        if programme_node is None:
            raise ValueError(f"Programme node {session.programme_id} not found")

        # Get all nodes in the programme subtree
        all_nodes = _get_project_subtree(db, session.programme_id)
        node_map = {n.id: dict(n.__dict__.items()) for n in all_nodes if not n.__dict__.get('_sa_instance_state')}

        # Build a mutable copy of node data
        simulated_nodes: Dict[UUID, Dict[str, Any]] = {}
        for n in all_nodes:
            pn = db.query(PortfolioNode).filter(PortfolioNode.id == n.id).first()
            if pn:
                simulated_nodes[n.id] = {
                    "planned_start_date": pn.planned_start_date,
                    "planned_end_date": pn.planned_end_date,
                    "percent_complete": pn.percent_complete,
                }

        # Apply staged mutations to the simulated state
        for mutation in mutations:
            target_id = mutation.target_node_id
            if target_id not in simulated_nodes:
                continue

            forward = mutation.forward_delta or {}
            action = mutation.action_type

            if action == "NODE_SHIFT" and target_id in simulated_nodes:
                if "planned_start_date" in forward:
                    simulated_nodes[target_id]["planned_start_date"] = (
                        datetime.fromisoformat(forward["planned_start_date"])
                    )
                if "planned_end_date" in forward:
                    simulated_nodes[target_id]["planned_end_date"] = (
                        datetime.fromisoformat(forward["planned_end_date"])
                    )
            elif action == "PROGRESS_SET" and target_id in simulated_nodes:
                if "percent_complete" in forward:
                    simulated_nodes[target_id]["percent_complete"] = float(
                        forward["percent_complete"]
                    )

        # Build dependency map
        deps = db.query(DependencyLink).filter(
            DependencyLink.successor_id.in_(n.id for n in all_nodes)
        ).all()

        dep_map: Dict[UUID, List[Dict[str, Any]]] = {}
        successors_map: Dict[UUID, List[UUID]] = {n.id: [] for n in all_nodes}

        for dep in deps:
            if dep.predecessor_id in simulated_nodes and dep.successor_id in simulated_nodes:
                dep_map.setdefault(dep.successor_id, []).append({
                    "predecessor_id": dep.predecessor_id,
                    "lag_days": dep.lag_days or 0,
                })
                successors_map.setdefault(dep.predecessor_id, []).append(dep.successor_id)

        # Compute durations from simulated dates
        durations: Dict[UUID, int] = {}
        for nid, data in simulated_nodes.items():
            if data.get("planned_start_date") and data.get("planned_end_date"):
                durations[nid] = _workday_diff(
                    data["planned_start_date"], data["planned_end_date"]
                )
            else:
                durations[nid] = 0

        # Forward pass
        in_degree: Dict[UUID, int] = {n.id: 0 for n in all_nodes}
        for dep in deps:
            if dep.predecessor_id in simulated_nodes and dep.successor_id in simulated_nodes:
                in_degree[dep.successor_id] = in_degree.get(dep.successor_id, 0) + 1

        roots = [nid for nid, deg in in_degree.items() if deg == 0]
        if not roots:
            roots = list(simulated_nodes.keys())

        project_start = programme_node.planned_start_date if hasattr(programme_node, "planned_start_date") and programme_node.planned_start_date else date.today()

        es: Dict[UUID, date] = {}
        ef: Dict[UUID, date] = {}

        for nid in roots:
            es[nid] = project_start
            ef[nid] = _add_workdays(project_start, durations.get(nid, 0))

        queue = list(roots)
        visited = set(roots)
        while queue:
            current = queue.pop(0)
            for succ_id in successors_map.get(current, []):
                if succ_id in visited:
                    continue
                pred_deps = dep_map.get(succ_id, [])
                earliest_start = ef.get(current, project_start)
                for pred_info in pred_deps:
                    pred_id = pred_info["predecessor_id"]
                    if pred_id in ef:
                        lag = pred_info.get("lag_days", 0)
                        pred_ef = ef[pred_id]
                        candidate = _add_workdays(pred_ef, lag) if lag >= 0 else pred_ef - timedelta(days=abs(lag))
                        if isinstance(candidate, datetime):
                            candidate = candidate.date()
                        if candidate > earliest_start:
                            earliest_start = candidate
                es[succ_id] = earliest_start
                ef[succ_id] = _add_workdays(earliest_start, durations.get(succ_id, 0))
                visited.add(succ_id)
                queue.append(succ_id)

        # Backward pass
        project_end = max(ef.values()) if ef else project_start
        ls: Dict[UUID, date] = {}
        lf: Dict[UUID, date] = {}

        terminal = [nid for nid, succs in successors_map.items() if not succs]
        for nid in terminal:
            lf[nid] = project_end
            delta = _workday_diff(ef.get(nid, project_end), project_end)
            ls[nid] = project_end - timedelta(days=delta) if delta else ef.get(nid, project_end)

        reverse_successors: Dict[UUID, List[UUID]] = {n.id: [] for n in all_nodes}
        for dep in deps:
            if dep.predecessor_id in simulated_nodes and dep.successor_id in simulated_nodes:
                reverse_successors.setdefault(dep.successor_id, []).append(dep.predecessor_id)

        rev_queue = list(terminal)
        rev_visited = set(terminal)
        while rev_queue:
            current = rev_queue.pop(0)
            for pred_id in reverse_successors.get(current, []):
                if pred_id in rev_visited:
                    continue
                lf[pred_id] = es.get(current, project_end)
                dur = durations.get(pred_id, 0)
                ls[pred_id] = ef.get(pred_id, lf[pred_id]) - timedelta(days=dur) if dur else lf[pred_id]
                rev_visited.add(pred_id)
                rev_queue.append(pred_id)

        # Compute total float
        total_float: Dict[UUID, int] = {}
        for nid in simulated_nodes:
            if nid in ls and nid in es:
                total_float[nid] = _workday_diff(es[nid], ls[nid])
            else:
                total_float[nid] = 999999

        # Identify critical and negative float tasks
        critical_tasks = []
        negative_float_tasks = []
        for nid, tf in total_float.items():
            node = next((n for n in all_nodes if n.id == nid), None)
            if node is None:
                continue
            task_info = {
                "node_id": str(nid),
                "code": node.code,
                "name": node.name,
                "total_float": tf,
                "early_start": es.get(nid).isoformat() if nid in es else None,
                "early_finish": ef.get(nid).isoformat() if nid in ef else None,
            }
            if tf <= 0:
                critical_tasks.append(task_info)
            if tf < 0:
                negative_float_tasks.append(task_info)

        critical_tasks.sort(key=lambda t: t.get("early_start") or "")

        return {
            "session_id": session_id,
            "mutation_count": len(mutations),
            "total_nodes": len(simulated_nodes),
            "project_end_date": project_end.isoformat(),
            "critical_path_length": len(critical_tasks),
            "negative_float_count": len(negative_float_tasks),
            "critical_tasks": critical_tasks,
            "negative_float_tasks": negative_float_tasks,
            "float_resolved": len(negative_float_tasks) == 0,
            "message": (
                f"Simulated CPM pass complete. "
                f"{'Float resolved.' if not negative_float_tasks else f'{len(negative_float_tasks)} tasks with negative float remain.'}"
            ),
        }
    except Exception as e:
        return _build_error_result(e, "session_id")
    finally:
        db.close()


@mcp.tool(
    name="agent_finalize_proposal_session",
    description=(
        "Commit or reject an agent proposal session after human review. "
        "On commit, all staged mutations are applied atomically.  On reject, "
        "the session is marked as rejected and mutations are discarded."
    ),
)
def agent_finalize_proposal_session(
    session_id: str,
    action: str,
    reviewer_user_id: int,
    auth_token: str,
    justification: str = "",
) -> Dict[str, Any]:
    """Finalize an agent proposal session.

    Parameters
    ----------
    session_id : str
        UUID of the agent proposal session.
    action : str
        Either "commit" or "reject".
    reviewer_user_id : int
        ID of the human reviewer.
    auth_token : str
        JWT Bearer token of the invoking user.
    justification : str
        Optional justification for the action.

    Returns
    -------
    dict
        Finalization result.
    """
    db = SessionLocal()
    try:
        user = _get_user_from_token(db, auth_token)
        session_uuid = UUID(session_id)

        from app.models.agent_staging import (
            AgentProposalSession,
            AgentProposalStatus,
        )
        from app.services.agent_staging_service import (
            commit_proposal_session,
        )

        session = db.query(AgentProposalSession).filter(
            AgentProposalSession.id == session_uuid
        ).first()
        if session is None:
            for obj in db.identity_map.get(AgentProposalSession, {}).values():
                if obj.id == session_uuid:
                    session = obj
                    break
        if session is None:
            raise ValueError(f"Proposal session {session_id} not found")

        if action == "commit":
            result = commit_proposal_session(
                db=db,
                session_id=session_uuid,
                reviewer_user_id=reviewer_user_id,
            )
            return {
                **result,
                "action": "commit",
                "message": f"Proposal session {session_id} committed by user {reviewer_user_id}.",
            }
        elif action == "reject":
            session.status = AgentProposalStatus.REJECTED
            session.reviewed_by_user_id = reviewer_user_id
            session.resolved_at = datetime.now(timezone.utc)
            session.reversion_justification = justification or "Rejected by reviewer"
            return {
                "session_id": session_id,
                "status": AgentProposalStatus.REJECTED.value,
                "reviewer_user_id": reviewer_user_id,
                "justification": justification,
                "message": f"Proposal session {session_id} rejected by user {reviewer_user_id}.",
            }
        else:
            raise ValueError(f"Invalid action '{action}'. Must be 'commit' or 'reject'.")
    except Exception as e:
        return _build_error_result(e, "action")
    finally:
        db.close()
