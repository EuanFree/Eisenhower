/**
 * Reporting Workbench Types
 *
 * TypeScript interfaces for the statutory defence reporting (IPMR/CPR Formats 1–5)
 * and executive briefing deck generation workbench.
 *
 * These types mirror the backend IPMR and briefing schemas and support the
 * ReportingWorkbenchView and BriefingExportModal components.
 */

// ---------------------------------------------------------------------------
// IPMR Format 1: Work Breakdown Structure (WBS)
// ---------------------------------------------------------------------------

/**
 * A single row in the Format 1 WBS time-phased EVM matrix.
 *
 * Mirrors backend Format1Row schema.
 */
export interface Format1Row {
  /** WBS element code (e.g., '1.2.3') */
  wbs_element_code: string;
  /** Human-readable name of the WBS element */
  wbs_element_name: string;
  /** Parent Control Account code, if applicable */
  control_account: string | null;
  /** Budget at Completion — total planned budget */
  bac: number;
  /** Planned Value (BCWS) — budgeted cost of scheduled work */
  pv: number;
  /** Earned Value (BCWP) — budgeted cost of work performed */
  ev: number;
  /** Actual Cost (ACWP) — actual cost of work performed */
  ac: number;
  /** Cost Variance = EV - AC. Positive means under budget. */
  cv: number;
  /** Schedule Variance = EV - PV. Positive means ahead of schedule. */
  sv: number;
  /** Cost Performance Index = EV / AC. >1.0 means under budget. */
  cpi: number;
  /** Schedule Performance Index = EV / PV. >1.0 means ahead of schedule. */
  spi: number;
  /** Estimate at Completion = BAC / CPI. Forecasted total cost. */
  eac: number;
  /** Variance at Completion = BAC - EAC. Positive means under budget. */
  vac: number;
  /** Physical percent complete (0.0 to 100.0) */
  percent_complete: number;
  /** Planned start date (ISO format) */
  planned_start: string | null;
  /** Planned finish date (ISO format) */
  planned_finish: string | null;
  /** Actual start date (ISO format) */
  actual_start: string | null;
  /** Actual finish date (ISO format) */
  actual_finish: string | null;
  /** Monthly time-phased breakdown */
  time_phased_data: Record<string, Record<string, number>>;
}

/**
 * Complete Format 1 WBS report.
 *
 * Mirrors backend Format1Report schema.
 */
export interface Format1Report {
  /** Report title */
  report_title: string;
  /** Programme name */
  programme_name: string;
  /** Reporting month (e.g., '2026-10') */
  reporting_period: string;
  /** Status date (ISO format) */
  status_date: string;
  /** Currency code (e.g., 'GBP') */
  currency_code: string;
  /** List of WBS element rows */
  rows: Format1Row[];
  /** Programme-level summary totals */
  summary: Record<string, number>;
}

// ---------------------------------------------------------------------------
// IPMR Format 2: Organizational Breakdown Structure (OBS)
// ---------------------------------------------------------------------------

/**
 * A single row in the Format 2 OBS report.
 *
 * Mirrors backend Format2Row schema.
 */
export interface Format2Row {
  /** Organizational unit code (e.g., 'AVIONICS') */
  org_code: string;
  /** Human-readable department name */
  org_name: string;
  /** Cost center identifier */
  cost_center: string | null;
  /** Total budget allocated to this unit */
  bac: number;
  /** Planned Value for this unit */
  pv: number;
  /** Earned Value for this unit */
  ev: number;
  /** Actual Cost for this unit */
  ac: number;
  /** Cost Variance = EV - AC */
  cv: number;
  /** Schedule Variance = EV - PV */
  sv: number;
  /** Cost Performance Index */
  cpi: number;
  /** Schedule Performance Index */
  spi: number;
  /** Estimate at Completion */
  eac: number;
  /** Number of resources assigned */
  headcount: number;
  /** Total labor hours logged */
  total_hours: number;
}

/**
 * Complete Format 2 OBS report.
 *
 * Mirrors backend Format2Report schema.
 */
export interface Format2Report {
  /** Report title */
  report_title: string;
  /** Programme name */
  programme_name: string;
  /** Reporting month */
  reporting_period: string;
  /** Status date */
  status_date: string;
  /** Currency code */
  currency_code: string;
  /** List of organizational unit rows */
  rows: Format2Row[];
  /** Programme-level summary totals */
  summary: Record<string, number>;
}

// ---------------------------------------------------------------------------
// IPMR Format 3: Baseline Changes
// ---------------------------------------------------------------------------

/**
 * A single baseline change entry in Format 3.
 *
 * Mirrors backend Format3BaselineChange schema.
 */
export interface Format3BaselineChange {
  /** Change request number */
  bcr_number: string;
  /** Change title */
  title: string;
  /** Change tier (TIER_1, TIER_2, TIER_3) */
  tier: string;
  /** Change status */
  status: string;
  /** WBS element affected */
  wbs_element_code: string;
  /** WBS element name */
  wbs_element_name: string;
  /** Cost delta (positive = increase) */
  cost_delta: number;
  /** Schedule slip in days */
  schedule_slip_days: number;
  /** Contingency reserve requested */
  contingency_requested: number;
  /** Justification text */
  justification: string;
  /** Date of change */
  changed_at: string;
  /** User who made the change */
  changed_by: string;
}

/**
 * Complete Format 3 Baseline Changes report.
 *
 * Mirrors backend Format3Report schema.
 */
export interface Format3Report {
  /** Report title */
  report_title: string;
  /** Programme name */
  programme_name: string;
  /** Reporting period */
  reporting_period: string;
  /** Status date */
  status_date: string;
  /** List of baseline changes */
  changes: Format3BaselineChange[];
  /** Total cost delta */
  total_cost_delta: number;
  /** Total schedule slip */
  total_schedule_slip: number;
}

// ---------------------------------------------------------------------------
// IPMR Format 5: Variance Analysis Narrative
// ---------------------------------------------------------------------------

/**
 * A single variance item in Format 5.
 *
 * Mirrors backend Format5VarianceItem schema.
 */
export interface Format5VarianceItem {
  /** WBS element code */
  wbs_element_code: string;
  /** WBS element name */
  wbs_element_name: string;
  /** Budget at Completion */
  bac: number;
  /** Planned Value */
  pv: number;
  /** Earned Value */
  ev: number;
  /** Actual Cost */
  ac: number;
  /** Cost Variance */
  cv: number;
  /** Schedule Variance */
  sv: number;
  /** Cost Performance Index */
  cpi: number;
  /** Schedule Performance Index */
  spi: number;
  /** Estimate at Completion */
  eac: number;
  /** Variance at Completion */
  vac: number;
  /** Problem description */
  problem: string;
  /** Root cause analysis */
  root_cause: string;
  /** Schedule impact description */
  schedule_impact: string;
  /** Cost impact description */
  cost_impact: string;
  /** Corrective action plan */
  corrective_action: string;
  /** Recommendation */
  recommendation: string;
  /** Active blocker count */
  active_blockers: number;
}

/**
 * Complete Format 5 Variance Analysis report.
 *
 * Mirrors backend Format5Report schema.
 */
export interface Format5Report {
  /** Report title */
  report_title: string;
  /** Programme name */
  programme_name: string;
  /** Reporting period */
  reporting_period: string;
  /** Status date */
  status_date: string;
  /** Currency code */
  currency_code: string;
  /** List of variance items */
  items: Format5VarianceItem[];
  /** Total cost variance */
  total_cv: number;
  /** Total schedule variance */
  total_sv: number;
}

// ---------------------------------------------------------------------------
// Briefing Deck
// ---------------------------------------------------------------------------

/**
 * Request schema for generating an executive briefing deck.
 *
 * Mirrors backend BriefingGenerateRequest schema.
 */
export interface BriefingGenerateRequest {
  /** UUID of the root PortfolioNode for the programme */
  project_id: string;
  /** Reporting cut-off date (ISO format) */
  status_date: string;
  /** Optional list of slide numbers to include (1-5) */
  slide_selection?: number[];
  /** Optional custom title for the briefing deck */
  title_override?: string;
  /** Optional override for the classification marking */
  classification_override?: string;
  /** Whether to include export-control disclaimer */
  include_export_disclaimer?: boolean;
}

/**
 * Metadata about a single generated slide.
 *
 * Mirrors backend BriefingSlideInfo schema.
 */
export interface BriefingSlideInfo {
  /** Slide number (1-5) */
  slide_number: number;
  /** Title of the slide */
  slide_title: string;
  /** Number of data points rendered */
  data_points: number;
}

/**
 * Response schema for briefing deck generation.
 *
 * Mirrors backend BriefingGenerateResponse schema.
 */
export interface BriefingGenerateResponse {
  /** Unique identifier for the generated deck */
  deck_id: string;
  /** Title of the briefing deck */
  title: string;
  /** Number of slides in the deck */
  slide_count: number;
  /** Metadata for each generated slide */
  slides: BriefingSlideInfo[];
  /** Size of the .pptx file in bytes */
  file_size_bytes: number;
  /** Classification marking applied */
  classification: string;
  /** Timestamp when deck was generated */
  generated_at: string;
  /** Human-readable summary */
  message: string;
}

// ---------------------------------------------------------------------------
// Frontend-only types
// ---------------------------------------------------------------------------

/**
 * Slide definitions for the briefing export modal.
 */
export interface BriefingSlideDefinition {
  /** Slide number (1-5) */
  slide_number: number;
  /** Display title */
  title: string;
  /** Description of the slide content */
  description: string;
  /** Icon identifier */
  icon: string;
}

/**
 * Export format options for IPMR reports.
 */
export type ExportFormat = 'xlsx' | 'pdf';

/**
 * IPMR Format card data for the export panel.
 */
export interface IPMRFormatCard {
  /** Format number (1, 2, 3, 5) */
  format_number: number;
  /** Format name */
  format_name: string;
  /** Short description */
  description: string;
  /** Whether preview data is available */
  has_preview: boolean;
  /** Preview data (Format 1, 2, 3, or 5 report) */
  preview_data?: Format1Report | Format2Report | Format3Report | Format5Report;
  /** Whether export is in progress */
  exporting: boolean;
  /** Export error message, if any */
  export_error?: string;
}

/**
 * Reporting period selection state.
 */
export interface ReportingPeriod {
  /** Fiscal month or calendar cut-off date (ISO format) */
  status_date: string;
  /** Reporting period label (e.g., '2026-10') */
  period_label: string;
}

/**
 * WBS scope node for the project scope tree selector.
 */
export interface WBSScopeNode {
  /** Node UUID */
  id: string;
  /** WBS code */
  code: string;
  /** Node name */
  name: string;
  /** ltree path */
  path: string;
  /** Whether this node is selected */
  selected: boolean;
  /** Whether children are expanded */
  expanded: boolean;
  /** Child nodes */
  children: WBSScopeNode[];
}
