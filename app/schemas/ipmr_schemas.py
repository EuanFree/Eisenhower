"""IPMR/CPR Report Schemas.

This module defines Pydantic schemas for the Integrated Program Management
Report (IPMR) / Cost Performance Report (CPR) export service.  These schemas
represent the data structures for Formats 1 through 5, which are the standard
defence programme reporting formats used in Earned Value Management (EVM).

IPMR Background
~~~~~~~~~~~~~~~

The IPMR is the primary reporting document for defence acquisition programmes.
It provides a standardized view of programme performance across schedule, cost,
and technical dimensions.  The report is structured into multiple formats,
each serving a different analytical purpose:

- **Format 1** (WBS): Time-phased cost data by WBS element.
- **Format 2** (OBS): Performance grouped by organizational department.
- **Format 3** (Baseline Changes): Audits to the Performance Measurement Baseline.
- **Format 4** (Manpower): Labor-hour tracking (not implemented here).
- **Format 5** (Variance Analysis): Narrative explanation of significant variances.

Compliance Standards
~~~~~~~~~~~~~~~~~~~~

These formats follow ANSI/EIA-748B and DoD 5000.02-M requirements for
Earned Value Management Systems in defence acquisition programmes.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import date, datetime


# ============================================================================
# Format 1: Work Breakdown Structure (WBS)
# ============================================================================


class Format1Row(BaseModel):
    """A single row in the Format 1 WBS time-phased matrix.

    Format 1 is the core EVM reporting table.  It presents time-phased
    cost data for each WBS element, showing Budgeted Cost for Work
    Scheduled (BCWS/PV), Budgeted Cost for Work Performed (BCWP/EV),
    and Actual Cost of Work Performed (ACWP/AC).

    Attributes
    ----------
    wbs_element_code : str
        The WBS code for this element (e.g., '1.2.3').
    wbs_element_name : str
        Human-readable name of the WBS element.
    control_account : str
        Parent Control Account code, if applicable.
    bac : float
        Budget at Completion — total planned budget for this element.
    pv : float
        Planned Value (BCWS) — budgeted cost of scheduled work.
    ev : float
        Earned Value (BCWP) — budgeted cost of work performed.
    ac : float
        Actual Cost (ACWP) — actual cost of work performed.
    cv : float
        Cost Variance = EV - AC.  Positive means under budget.
    sv : float
        Schedule Variance = EV - PV.  Positive means ahead of schedule.
    cpi : float
        Cost Performance Index = EV / AC.  >1.0 means under budget.
    spi : float
        Schedule Performance Index = EV / PV.  >1.0 means ahead of schedule.
    eac : float
        Estimate at Completion = BAC / CPI.  Forecasted total cost.
    vac : float
        Variance at Completion = BAC - EAC.  Positive means under budget.
    percent_complete : float
        Physical percent complete (0.0 to 100.0).
    planned_start : str or None
        Planned start date in ISO format.
    planned_finish : str or None
        Planned finish date in ISO format.
    actual_start : str or None
        Actual start date in ISO format, if work has begun.
    actual_finish : str or None
        Actual finish date in ISO format, if work is complete.
    time_phased_data : dict[str, dict]
        Monthly time-phased breakdown with keys for each period
        (e.g., '2026-01') containing pv, ev, ac values.
    """

    wbs_element_code: str
    wbs_element_name: str
    control_account: Optional[str] = None
    bac: float = 0.0
    pv: float = 0.0
    ev: float = 0.0
    ac: float = 0.0
    cv: float = 0.0
    sv: float = 0.0
    cpi: float = 0.0
    spi: float = 0.0
    eac: float = 0.0
    vac: float = 0.0
    percent_complete: float = 0.0
    planned_start: Optional[str] = None
    planned_finish: Optional[str] = None
    actual_start: Optional[str] = None
    actual_finish: Optional[str] = None
    time_phased_data: Dict[str, Dict[str, float]] = {}


class Format1Report(BaseModel):
    """Complete Format 1 WBS report.

    Attributes
    ----------
    report_title : str
        Report title (e.g., 'IPMR Format 1 — Work Breakdown Structure').
    programme_name : str
        Name of the programme.
    reporting_period : str
        Reporting month (e.g., '2026-10').
    status_date : str
        Status date for the report (ISO format).
    currency_code : str
        Currency code (e.g., 'GBP').
    rows : list[Format1Row]
        List of WBS element rows.
    summary : dict
        Programme-level summary totals.
    """

    report_title: str = "IPMR Format 1 — Work Breakdown Structure"
    programme_name: str
    reporting_period: str
    status_date: str
    currency_code: str = "GBP"
    rows: List[Format1Row] = []
    summary: Dict[str, float] = {}


# ============================================================================
# Format 2: Organizational Breakdown Structure (OBS)
# ============================================================================


class Format2Row(BaseModel):
    """A single row in the Format 2 OBS report.

    Format 2 groups Earned Value performance by organizational
    department and RBS cost centers, showing how each functional
    area is performing against its allocated budget.

    Attributes
    ----------
    org_code : str
        Organizational unit code (e.g., 'AVIONICS', 'SYSTEMS_SAFETY').
    org_name : str
        Human-readable department name.
    cost_center : str
        Cost center identifier.
    bac : float
        Total budget allocated to this organizational unit.
    pv : float
        Planned Value for this unit.
    ev : float
        Earned Value for this unit.
    ac : float
        Actual Cost for this unit.
    cv : float
        Cost Variance = EV - AC.
    sv : float
        Schedule Variance = EV - PV.
    cpi : float
        Cost Performance Index.
    spi : float
        Schedule Performance Index.
    eac : float
        Estimate at Completion.
    headcount : int
        Number of resources assigned to this unit.
    total_hours : float
        Total labor hours logged by this unit.
    """

    org_code: str
    org_name: str
    cost_center: Optional[str] = None
    bac: float = 0.0
    pv: float = 0.0
    ev: float = 0.0
    ac: float = 0.0
    cv: float = 0.0
    sv: float = 0.0
    cpi: float = 0.0
    spi: float = 0.0
    eac: float = 0.0
    headcount: int = 0
    total_hours: float = 0.0


class Format2Report(BaseModel):
    """Complete Format 2 OBS report.

    Attributes
    ----------
    report_title : str
        Report title.
    programme_name : str
        Programme name.
    reporting_period : str
        Reporting month.
    status_date : str
        Status date.
    currency_code : str
        Currency code.
    rows : list[Format2Row]
        List of organizational unit rows.
    summary : dict
        Programme-level summary totals.
    """

    report_title: str = "IPMR Format 2 — Organizational Breakdown Structure"
    programme_name: str
    reporting_period: str
    status_date: str
    currency_code: str = "GBP"
    rows: List[Format2Row] = []
    summary: Dict[str, float] = {}


# ============================================================================
# Format 3: Baseline Changes
# ============================================================================


class Format3BaselineChange(BaseModel):
    """A single baseline change entry in Format 3.

    Format 3 audits changes to the Performance Measurement Baseline
    (PMB) between reporting cycles, tracking formal Management Reserve
    draws and customer-authorized scope changes.

    Attributes
    ----------
    change_id : str
        Unique identifier for this change (BCR reference or MR transaction).
    change_type : str
        Type of change: 'MR_DRAWDOWN', 'SCOPE_CHANGE', 'REPLAN', 'CUSTOMER_DIRECTED'.
    wbs_element : str
        WBS element affected by the change.
    description : str
        Description of the change.
    authorized_by : str
        User who authorized the change.
    authorization_date : str
        Date the change was authorized (ISO format).
    bcr_reference : str or None
        Baseline Change Request reference number.
    cost_delta : float
        Change in BAC (positive = increase, negative = decrease).
    schedule_delta_days : int
        Change in planned finish date (days).  Positive = slip.
    reserve_drawn : float
        Amount drawn from Management Reserve, if applicable.
    customer_authorized : bool
        Whether the change was authorized by the customer.
    """

    change_id: str
    change_type: str
    wbs_element: str
    description: str
    authorized_by: str
    authorization_date: str
    bcr_reference: Optional[str] = None
    cost_delta: float = 0.0
    schedule_delta_days: int = 0
    reserve_drawn: float = 0.0
    customer_authorized: bool = False


class Format3Report(BaseModel):
    """Complete Format 3 Baseline Changes report.

    Attributes
    ----------
    report_title : str
        Report title.
    programme_name : str
        Programme name.
    reporting_period : str
        Reporting month.
    status_date : str
        Status date.
    baseline_code : str
        Current active baseline code (e.g., 'B0_CONTRACT').
    changes : list[Format3BaselineChange]
        List of baseline changes during the reporting period.
    total_cost_delta : float
        Sum of all cost deltas.
    total_reserve_drawn : float
        Total Management Reserve drawn during the period.
    """

    report_title: str = "IPMR Format 3 — Baseline Changes"
    programme_name: str
    reporting_period: str
    status_date: str
    baseline_code: str
    changes: List[Format3BaselineChange] = []
    total_cost_delta: float = 0.0
    total_reserve_drawn: float = 0.0


# ============================================================================
# Format 5: Variance Analysis Narrative
# ============================================================================


class Format5VarianceItem(BaseModel):
    """A single variance analysis item in Format 5.

    Format 5 auto-extracts tasks exceeding predefined variance thresholds
    and pre-populates the standard defence variance reporting template
    with Problem/Cause, Impact, and Corrective Action Plan.

    Attributes
    ----------
    wbs_element_code : str
        WBS code of the task with variance.
    wbs_element_name : str
        Name of the task.
    variance_type : str
        Type of variance: 'COST_OVERRUN', 'SCHEDULE_SLIP', 'BOTH'.
    cv : float
        Cost Variance (EV - AC).
    sv : float
        Schedule Variance (EV - PV).
    cpi : float
        Cost Performance Index.
    spi : float
        Schedule Performance Index.
    threshold_exceeded : str
        Which threshold was exceeded (e.g., 'CV < -£25,000').
    problem_description : str
        Problem statement describing the variance.
    root_cause : str
        Root cause analysis.
    impact_on_schedule : str
        Impact on programme schedule.
    impact_on_cost : str
        Impact on programme cost.
    corrective_action : str
        Corrective action plan and recovery forecast.
    active_blockers : list[dict]
        List of active blockers contributing to the variance.
    recommended_action : str
        Recommended next steps.
    """

    wbs_element_code: str
    wbs_element_name: str
    variance_type: str
    cv: float = 0.0
    sv: float = 0.0
    cpi: float = 0.0
    spi: float = 0.0
    threshold_exceeded: str
    problem_description: str
    root_cause: str
    impact_on_schedule: str
    impact_on_cost: str
    corrective_action: str
    active_blockers: List[Dict[str, Any]] = []
    recommended_action: str


class Format5Report(BaseModel):
    """Complete Format 5 Variance Analysis report.

    Attributes
    ----------
    report_title : str
        Report title.
    programme_name : str
        Programme name.
    reporting_period : str
        Reporting month.
    status_date : str
        Status date.
    variance_thresholds : dict
        Thresholds used for variance detection.
    variance_items : list[Format5VarianceItem]
        List of tasks exceeding variance thresholds.
    summary : str
        Executive summary of programme variance status.
    """

    report_title: str = "IPMR Format 5 — Variance Analysis Narrative"
    programme_name: str
    reporting_period: str
    status_date: str
    variance_thresholds: Dict[str, Any] = {}
    variance_items: List[Format5VarianceItem] = []
    summary: str = ""


# ============================================================================
# Export Request/Response Schemas
# ============================================================================


class IPMRExportRequest(BaseModel):
    """Request schema for IPMR report generation.

    Attributes
    ----------
    project_id : str
        UUID of the root PortfolioNode for the programme.
    reporting_period : str
        Reporting month in 'YYYY-MM' format (e.g., '2026-10').
    status_date : str
        Status date for the report in ISO format.
    format_type : str
        Report format: 'FORMAT1', 'FORMAT2', 'FORMAT3', 'FORMAT5'.
    export_format : str
        Export format: 'XLSX' or 'PDF'.
    cost_variance_threshold : float
        Cost variance threshold in absolute amount (e.g., 25000).
    schedule_variance_threshold : float
        Schedule variance threshold in percentage (e.g., 10.0).
    """

    project_id: str
    reporting_period: str
    status_date: str
    format_type: str = "FORMAT1"
    export_format: str = "XLSX"
    cost_variance_threshold: float = 25000.0
    schedule_variance_threshold: float = 10.0


class IPMRExportResponse(BaseModel):
    """Response schema for IPMR report export.

    Attributes
    ----------
    report_id : str
        Unique identifier for the generated report.
    format_type : str
        Report format generated.
    export_format : str
        Export format (XLSX or PDF).
    file_size_bytes : int
        Size of the generated file in bytes.
    row_count : int
        Number of data rows in the report.
    generated_at : str
        Timestamp when the report was generated.
    message : str
        Human-readable summary.
    """

    report_id: str
    format_type: str
    export_format: str
    file_size_bytes: int
    row_count: int
    generated_at: str
    message: str
