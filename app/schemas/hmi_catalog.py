"""Human-Machine Interface (HMI) Component Catalog — UI payload schemas.

This module defines the complete set of Pydantic response models that drive
the frontend integration for the Eisenhower Portfolio Manager.  Each schema
corresponds to a specific GUI tier component, providing a contract between
the backend API and the frontend rendering layer.

The catalog is organised by UI component:

1. **GanttBarPayload** — Schedule Gantt chart bars showing planned vs. actual
   timelines, baseline comparisons, and blocked status.

2. **JaggedDropLinePayload** — The "jagged drop line" visualisation showing
   the status date frontier across the programme, indicating which work
   packages are ahead or behind schedule.

3. **DailyCockpitSummaryPayload** — The personal landing page ("My Daily
   Cockpit") summary showing active sprint load, blocked items, urgent tasks,
   focus queue, and claimable placeholder tasks.

4. **ClashTriageItemPayload** — Resource and schedule clash triage items
   showing severity, category, conflict window, and proposed resolution.

5. **DisplaySettingsPayload** — Server-side display profile for SCIF hot-desking
   environments, including density, theme, and colour accessibility settings.

Design Principles
~~~~~~~~~~~~~~~~~

- **Frontend-ready**: Every field is serialisable to JSON and maps directly
  to a UI component property.
- **Defence-aware**: Classification markings and redaction flags are included
  so the frontend can apply ABAC masking at the display layer.
- **Baseline-aware**: Gantt bars include both B₀ (original contract baseline)
  and B_curr (current approved baseline) for variance visualisation.
- **Performance-optimised**: Payloads are lean — only the fields the UI
  actually needs, avoiding over-fetching of full model data.

Schema Naming Convention
~~~~~~~~~~~~~~~~~~~~~~~~

All schemas follow the pattern ``<Component>Payload`` to distinguish them
from CRUD schemas (Create/Update/Response) in ``schemas.py``.  Payload
schemas are read-only API responses optimised for UI consumption.
"""
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ============================================================================
# Gantt Chart Bar Payload
# ============================================================================


class BaselineBar(BaseModel):
    """A single baseline comparison bar segment for Gantt overlay.

    In defence programme management, baseline comparisons are critical
    for visualising schedule variance.  The Gantt chart overlays the
    original contract baseline (B₀) and the current approved baseline
    (B_curr) against the live schedule bar.

    Attributes
    ----------
    start_date : date
        Baseline planned start date for this node.
    end_date : date
        Baseline planned end date for this node.
    label : str
        Short label identifying the baseline (e.g., 'B0', 'B1').
    """

    start_date: date
    end_date: date
    label: str = Field(..., description="Baseline identifier, e.g. 'B0' or 'B_curr'")


class GanttBarPayload(BaseModel):
    """Payload for a single Gantt chart bar in the schedule view.

    Each bar represents a PortfolioNode in the WBS hierarchy, displaying
    planned vs. actual timelines, physical progress, blocked status,
    and baseline comparison overlays.

    The frontend renders:

    - **Planned bar**: Blue bar from planned_start to planned_end.
    - **Actual bar**: Grey bar from actual_start to actual_end (if started).
    - **Progress fill**: Darker overlay showing physical_percent_complete.
    - **Blocked indicator**: Red X or warning icon when is_blocked is True.
    - **Cross-hatch shading**: Diagonal pattern when cross_hatch_shading
      is True (indicates procurement-constrained or export-controlled task).
    - **Baseline comparisons**: Thin overlay bars for B₀ and B_curr.

    Attributes
    ----------
    node_id : str
        UUID of the PortfolioNode this bar represents.
    label : str
        Display label shown on the bar (node name or code).
    planned_start : date
        Planned early start date from CPM calculation.
    planned_end : date
        Planned early finish date from CPM calculation.
    actual_start : date or None
        Actual start date (None if task has not started).
    actual_end : date or None
        Actual end date (None if task is not yet complete).
    physical_percent_complete : float
        Physical progress percentage (0.0–100.0).  Drives the progress
        fill overlay on the bar.
    is_blocked : bool
        True if the task has an active blocker (NodeBlocker record).
        Renders a red warning indicator on the bar.
    cross_hatch_shading : bool
        True if the task requires cross-hatch shading to indicate
        procurement constraints, export control restrictions, or
        other special handling.  Renders diagonal pattern overlay.
    baseline_b0 : BaselineBar or None
        Original contract baseline (B₀) comparison bar.  Shows the
        initial planned schedule for variance visualisation.
    baseline_b_curr : BaselineBar or None
        Current approved baseline (B_curr) comparison bar.  Shows
        the most recently approved baseline after BCR changes.
    security_classification : str or None
        Security classification marking for ABAC-aware rendering.
        Frontend may suppress details for unclassified users.
    is_masked : bool
        True if this node's data is redacted due to ABAC clearance.
        Frontend should render a ghost-node placeholder.
    node_type : str
        Visual type hint for the frontend: 'milestone', 'summary',
        or 'task'.  Milestones render as diamonds, summaries as
        bold bars, tasks as standard bars.
    outline_level : int
        WBS hierarchy depth (1 = programme root, 2 = project, etc.).
        Controls indentation in the Gantt row labels.
    """

    node_id: str = Field(..., description="UUID of the PortfolioNode")
    label: str = Field(..., description="Display label on the bar")
    planned_start: date = Field(..., description="CPM planned early start")
    planned_end: date = Field(..., description="CPM planned early finish")
    actual_start: Optional[date] = None
    actual_end: Optional[date] = None
    physical_percent_complete: float = Field(
        0.0, ge=0.0, le=100.0,
        description="Physical progress 0.0–100.0%",
    )
    is_blocked: bool = Field(
        False,
        description="True if task has an active NodeBlocker",
    )
    cross_hatch_shading: bool = Field(
        False,
        description="True for procurement-constrained or export-controlled tasks",
    )
    baseline_b0: Optional[BaselineBar] = None
    baseline_b_curr: Optional[BaselineBar] = None
    security_classification: Optional[str] = None
    is_masked: bool = False
    node_type: str = Field(
        "task",
        description="'milestone', 'summary', or 'task'",
    )
    outline_level: int = Field(1, ge=1, description="WBS hierarchy depth")


class GanttChartPayload(BaseModel):
    """Complete Gantt chart payload for the schedule view.

    Returns the full set of bars, the status date line, and metadata
    for the Gantt chart component.

    Attributes
    ----------
    bars : list[GanttBarPayload]
        List of all Gantt bars to render, ordered by planned start date.
    status_date : date
        The current status date for the programme.  Renders as a
        vertical "today" line on the chart.
    chart_start : date
        Earliest date on the chart x-axis.
    chart_end : date
        Latest date on the chart x-axis.
    total_nodes : int
        Total number of nodes in the chart (for pagination info).
    """

    bars: List[GanttBarPayload] = []
    status_date: date = Field(..., description="Current programme status date")
    chart_start: date = Field(..., description="Earliest x-axis date")
    chart_end: date = Field(..., description="Latest x-axis date")
    total_nodes: int = Field(0, ge=0)


# ============================================================================
# Jagged Drop Line Payload
# ============================================================================


class DropLinePoint(BaseModel):
    """A single coordinate point on the jagged drop line.

    The jagged drop line visualises the schedule frontier across the
    programme.  Each point represents a work package's status relative
    to the status date.

    Attributes
    ----------
    node_id : str
        UUID of the node this point represents.
    label : str
        Short label (node code or name).
    x : float
        X-coordinate (date position, typically day offset from project start).
    y : float
        Y-coordinate (hierarchy level or work package grouping).
    status : str
        Schedule status: 'ahead', 'on-track', 'behind', or 'complete'.
        Determines the colour of the line segment.
    variance_days : float
        Schedule variance in days.  Positive = behind, negative = ahead.
    """

    node_id: str
    label: str
    x: float = Field(..., description="X-coordinate (day offset from project start)")
    y: float = Field(..., description="Y-coordinate (hierarchy level)")
    status: str = Field(
        ...,
        description="'ahead', 'on-track', 'behind', or 'complete'",
    )
    variance_days: float = Field(
        ...,
        description="Positive = behind schedule, negative = ahead",
    )


class JaggedDropLinePayload(BaseModel):
    """Payload for the jagged drop line schedule frontier visualisation.

    The jagged drop line is a defence-industry-standard visualisation
    that shows the collective schedule health of a programme at a glance.
    It plots each work package's status date position relative to the
    planned schedule, creating a "jagged" frontier line that reveals
    clusters of ahead/behind tasks.

    The frontend renders:

    - **Green segments**: Work packages ahead of schedule.
    - **Blue segments**: Work packages on track.
    - **Red segments**: Work packages behind schedule.
    - **Grey segments**: Completed work packages.
    - **Inflection points**: Sharp turns indicating status changes.

    Attributes
    ----------
    status_date : date
        The status date used to calculate the drop line.  This is the
        reference date against which all variance is measured.
    points : list[DropLinePoint]
        Ordered list of coordinate points forming the jagged line.
        Points are sorted by Y-coordinate (hierarchy level) for
        proper line rendering.
    ahead_count : int
        Number of work packages currently ahead of schedule.
    on_track_count : int
        Number of work packages currently on track.
    behind_count : int
        Number of work packages currently behind schedule.
    complete_count : int
        Number of completed work packages.
    summary : dict
        Additional summary metadata for the UI tooltip.
    """

    status_date: date = Field(..., description="Reference date for variance calculation")
    points: List[DropLinePoint] = []
    ahead_count: int = Field(0, ge=0)
    on_track_count: int = Field(0, ge=0)
    behind_count: int = Field(0, ge=0)
    complete_count: int = Field(0, ge=0)
    summary: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata for UI tooltips",
    )


# ============================================================================
# Daily Cockpit Summary Payload
# ============================================================================


class SprintLoadGauge(BaseModel):
    """Active sprint load gauge for the daily cockpit.

    Shows the user's current workload intensity as a gauge meter,
    helping them assess whether they are over- or under-allocated.

    Attributes
    ----------
    active_task_count : int
        Number of currently active (in-progress) sprint tasks assigned
        to the user.
    total_planned_hours : float
        Total planned hours for the current week across all assignments.
    capacity_hours : float
        User's available capacity hours for the current week (standard
        40-hour work week adjusted for allocated units).
    utilization_percent : float
        Percentage of capacity utilised (0.0–100.0+).  Values above
        100% indicate over-allocation.
    status : str
        Load status: 'underloaded', 'optimal', 'busy', or 'overloaded'.
    """

    active_task_count: int = Field(0, ge=0)
    total_planned_hours: float = Field(0.0, ge=0.0)
    capacity_hours: float = Field(40.0, gt=0.0)
    utilization_percent: float = Field(0.0, ge=0.0)
    status: str = Field(
        "optimal",
        description="'underloaded', 'optimal', 'busy', or 'overloaded'",
    )


class FocusQueueItem(BaseModel):
    """A single task in the user's focus queue.

    The focus queue orders tasks by priority: critical path tasks first,
    then by due date.  This is the user's "what should I work on next?"
    list.

    Attributes
    ----------
    node_id : str
        UUID of the task node.
    label : str
        Task name or code.
    is_critical_path : bool
        True if this task is on the critical path (Total Float ≤ 0).
        Critical tasks are highlighted in red.
    due_date : date or None
        Planned finish date for this task.
    days_until_due : int or None
        Number of calendar days until the task is due.  Negative = overdue.
    percent_complete : float
        Current progress percentage (0.0–100.0).
    status : str
        Task status: 'not_started', 'in_progress', 'blocked', or 'complete'.
    parent_label : str or None
        Name of the parent work package (for context).
    """

    node_id: str
    label: str
    is_critical_path: bool = False
    due_date: Optional[date] = None
    days_until_due: Optional[int] = None
    percent_complete: float = Field(0.0, ge=0.0, le=100.0)
    status: str = Field(
        "not_started",
        description="'not_started', 'in_progress', 'blocked', or 'complete'",
    )
    parent_label: Optional[str] = None


class ClaimableTaskItem(BaseModel):
    """A task available for claim from a generic placeholder resource.

    In defence programmes, tasks are often initially assigned to generic
    placeholder roles (e.g., "Systems Safety Assessor") rather than
    specific individuals.  The claimable queue shows tasks the user
    can claim, filtered by their clearance and skill profile.

    Attributes
    ----------
    node_id : str
        UUID of the task node.
    label : str
        Task name or code.
    placeholder_role : str
        Name of the generic placeholder role (e.g., "RF Hardware Engineer").
    required_clearance : str or None
        Minimum security clearance required to claim this task.
    required_skills : list[str] or None
        List of skill codes required for this task.
    planned_hours : float
        Estimated hours for this task.
    due_date : date or None
        Planned finish date.
    """

    node_id: str
    label: str
    placeholder_role: str
    required_clearance: Optional[str] = None
    required_skills: Optional[List[str]] = None
    planned_hours: float = Field(0.0, ge=0.0)
    due_date: Optional[date] = None


class DailyCockpitSummaryPayload(BaseModel):
    """Complete payload for the Daily Cockpit personal landing page.

    The Daily Cockpit is the user's personal dashboard, showing:

    1. **Sprint Load Gauge**: Current workload intensity.
    2. **Blocked Items**: Tasks blocked on the user's action.
    3. **Urgent Tasks**: Tasks due within 48 hours.
    4. **Focus Queue**: Prioritised task list (critical path first).
    5. **Claimable Queue**: Generic placeholder tasks available to claim.

    This payload is designed for a single API call that hydrates the
    entire cockpit view, minimising round-trips.

    Attributes
    ----------
    sprint_load : SprintLoadGauge
        Current workload gauge showing active tasks and capacity.
    blocked_count : int
        Number of tasks blocked where the user is the owner/assignee.
    urgent_count : int
        Number of tasks due within 48 hours.
    focus_queue : list[FocusQueueItem]
        Prioritised list of tasks to work on, ordered by critical path
        status and due date.
    claimable_queue : list[ClaimableTaskItem]
        List of generic placeholder tasks the user can claim.
    last_updated : datetime
        Timestamp when this summary was generated.
    """

    sprint_load: SprintLoadGauge = Field(default_factory=SprintLoadGauge)
    blocked_count: int = Field(0, ge=0)
    urgent_count: int = Field(0, ge=0)
    focus_queue: List[FocusQueueItem] = []
    claimable_queue: List[ClaimableTaskItem] = []
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ============================================================================
# Clash Triage Item Payload
# ============================================================================


class ClashTriageItemPayload(BaseModel):
    """A single clash triage item for the resource/schedule clash dashboard.

    Clash triage items represent conflicts discovered by the portfolio
    sweep engine (clash_daemon.py) — resource double-bookings, security
    clearance lapses, facility collisions, etc.

    The frontend renders each clash as a triage card with:

    - **Severity badge**: Red (CRITICAL), Orange (MAJOR), Yellow (ADVISORY).
    - **Category icon**: Resource, security, facility, calendar, etc.
    - **Conflict window**: Date range of the conflict.
    - **Entity name**: Name of the conflicting node or resource.
    - **Shift preview**: Proposed resolution from the leveling engine.

    Attributes
    ----------
    clash_id : str
        UUID of the ScheduleClashIssue record.
    severity : str
        Severity level: 'CRITICAL', 'MAJOR', or 'ADVISORY'.
        Determines the badge colour.
    category : str
        Clash category (e.g., 'RESOURCE_OVERALLOCATION',
        'FACILITY_CONTRAVENTION').  Determines the icon.
    conflict_window_start : date
        Start date of the conflict window.
    conflict_window_end : date
        End date of the conflict window.
    entity_name : str
        Human-readable name of the primary conflicting entity
        (node name, resource name, or facility name).
    conflicting_entity_name : str or None
        Name of the secondary conflicting entity (if applicable,
        e.g., the other task double-booking the same resource).
    description : str
        Detailed description of the clash for the triage card body.
    recommended_action : str or None
        Suggested resolution action from the clash daemon.
    leveling_shift_preview : dict or None
        Preview of the proposed date shift from the leveling engine.
        Contains node_id, original_start, proposed_start, and
        consumed_float_days.
    is_resolved : bool
        True if this clash has been resolved.
    """

    clash_id: str = Field(..., description="UUID of the ScheduleClashIssue")
    severity: str = Field(
        ...,
        description="'CRITICAL', 'MAJOR', or 'ADVISORY'",
    )
    category: str = Field(
        ...,
        description="Clash category, e.g. 'RESOURCE_OVERALLOCATION'",
    )
    conflict_window_start: date
    conflict_window_end: date
    entity_name: str = Field(..., description="Primary conflicting entity name")
    conflicting_entity_name: Optional[str] = None
    description: str = Field(..., description="Detailed clash description")
    recommended_action: Optional[str] = None
    leveling_shift_preview: Optional[Dict[str, Any]] = None
    is_resolved: bool = False


class ClashTriagePayload(BaseModel):
    """Complete clash triage dashboard payload.

    Returns all active (unresolved) clashes for the programme,
    grouped by severity for prioritised triage.

    Attributes
    ----------
    clashes : list[ClashTriageItemPayload]
        List of all active clash items.
    critical_count : int
        Number of CRITICAL severity clashes.
    major_count : int
        Number of MAJOR severity clashes.
    advisory_count : int
        Number of ADVISORY severity clashes.
    last_sweep : datetime or None
        Timestamp of the last portfolio sweep run.
    """

    clashes: List[ClashTriageItemPayload] = []
    critical_count: int = Field(0, ge=0)
    major_count: int = Field(0, ge=0)
    advisory_count: int = Field(0, ge=0)
    last_sweep: Optional[datetime] = None


# ============================================================================
# Display Settings Payload
# ============================================================================


class DisplaySettingsPayload(BaseModel):
    """Payload for server-side display profile settings.

    In SCIF (Sensitive Compartmented Information Facility) environments,
    browser storage and cookies are prohibited due to hot-desking policies.
    Display preferences are persisted server-side in PostgreSQL and
    returned on each login.

    The frontend applies these settings to configure:

    - **Density**: Row height and spacing (ultra-dense for 1080p,
      balanced for 4K, comfort for large displays).
    - **Scale factor**: Overall UI zoom level (0.80–1.50).
    - **Theme**: Colour scheme (SCIF dark, high contrast, balanced light,
      projector mode).
    - **Colour accessibility**: Colourblind-safe palette (deuteranopia,
      protanopia, tritanopia, monochrome).
    - **View state**: Column widths, hidden columns, split-pane ratios.

    Attributes
    ----------
    profile_name : str
        Name of the active display profile (e.g., 'DEFAULT',
        'LAPTOP_1080P', '4K_OPS_ROOM').
    density : str
        Density profile: 'ULTRA_DENSE' (28px row), 'BALANCED' (36px row),
        or 'COMFORT' (44px row).
    scale_factor : float
        Overall UI scale factor (0.80–1.50).  Applied as CSS transform
        or font-size multiplier.
    row_height_px : int
        Explicit row height in pixels (20–100).  Overrides density
        profile if set.
    theme : str
        Ambient colour theme: 'SCIF_DARK', 'HIGH_CONTRAST_DARK',
        'BALANCED_LIGHT', or 'PROJECTOR'.
    color_accessibility : str
        Colourblind accessibility mode: 'STANDARD_RAG', 'DEUTERANOPIA',
        'PROTANOPIA', 'TRITANOPIA', or 'MONOCHROME_PATTERN'.
    view_state_overrides : dict
        JSONB dictionary of view-specific overrides: column widths,
        hidden columns, split-pane ratios, etc.
    is_active_default : bool
        True if this is the user's active default profile.
    """

    profile_name: str = Field(
        "DEFAULT",
        description="Profile name, e.g. 'DEFAULT', 'LAPTOP_1080P', '4K_OPS_ROOM'",
    )
    density: str = Field(
        "BALANCED",
        description="'ULTRA_DENSE' (28px), 'BALANCED' (36px), or 'COMFORT' (44px)",
    )
    scale_factor: float = Field(
        1.0, ge=0.80, le=1.50,
        description="UI scale factor 0.80–1.50",
    )
    row_height_px: int = Field(
        36, ge=20, le=100,
        description="Row height in pixels, 20–100",
    )
    theme: str = Field(
        "SCIF_DARK",
        description="'SCIF_DARK', 'HIGH_CONTRAST_DARK', 'BALANCED_LIGHT', or 'PROJECTOR'",
    )
    color_accessibility: str = Field(
        "STANDARD_RAG",
        description="'STANDARD_RAG', 'DEUTERANOPIA', 'PROTANOPIA', 'TRITANOPIA', or 'MONOCHROME_PATTERN'",
    )
    view_state_overrides: Dict[str, Any] = Field(
        default_factory=dict,
        description="Column widths, hidden columns, split-pane ratios",
    )
    is_active_default: bool = True


# ============================================================================
# JSON Schema Manifest
# ============================================================================


class HMICatalogManifest(BaseModel):
    """JSON Schema manifest for the complete UI Component Inventory.

    This manifest provides a machine-readable inventory of all HMI
    component payloads, enabling the frontend build system to:

    1. **Validate API contracts**: Ensure the backend returns the
       expected payload structure.
    2. **Generate TypeScript types**: Auto-generate frontend type
       definitions from the schema.
    3. **Drive integration tests**: Use the manifest to verify each
       endpoint returns the correct payload shape.
    4. **Document the UI contract**: Serve as the single source of
       truth for frontend-backend integration.

    To obtain the full JSON schema, call the ``.model_json_schema()``
    method on any payload class.

    Attributes
    ----------
    component_count : int
        Total number of distinct UI component payloads in the catalog.
    components : list[str]
        List of component payload class names.
    version : str
        Schema version for change tracking.
    """

    component_count: int = 5
    components: List[str] = [
        "GanttBarPayload",
        "JaggedDropLinePayload",
        "DailyCockpitSummaryPayload",
        "ClashTriageItemPayload",
        "DisplaySettingsPayload",
    ]
    version: str = "1.0.0"
