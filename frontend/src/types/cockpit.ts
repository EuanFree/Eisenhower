/**
 * Cockpit Type Definitions
 *
 * These types mirror the backend Pydantic schemas in `app/schemas/schemas.py`
 * for the Daily Cockpit endpoints under `/api/v1/cockpit/`.
 *
 * The Daily Cockpit is the individual contributor's operational landing page,
 * providing quick metrics, a ranked focus queue, claimable generic-placeholder
 * tasks, and a weekly timesheet snapshot.
 */

// ---------------------------------------------------------------------------
// Cockpit Summary
// ---------------------------------------------------------------------------

/**
 * Response from GET /api/v1/cockpit/summary
 *
 * Returns key metrics for the authenticated user:
 * - Active sprint task count
 * - Total planned hours this week
 * - Tasks due within 48 hours
 * - Tasks blocked where the user is an owner/assignee
 */
export interface CockpitSummaryResponse {
  active_sprint_tasks: number;
  total_planned_hours_week: number;
  tasks_due_48h: number;
  blocked_tasks: number;
  /** Count of active blockers where downstream tasks are waiting on the user */
  blocking_others: number;
}

// ---------------------------------------------------------------------------
// Focus Queue
// ---------------------------------------------------------------------------

/**
 * A single task in the user's focus queue.
 * Ordered by CPM critical path status (critical first) then by due date.
 */
export interface FocusQueueTask {
  id: string;
  code: string;
  name: string;
  percent_complete: number;
  planned_start_date: string | null;
  planned_end_date: string | null;
  early_start: string | null;
  early_finish: string | null;
  late_start: string | null;
  late_finish: string | null;
  total_float: number | null;
  free_float: number | null;
  is_critical: boolean | null;
  delivery_mode: string | null;
  requires_vv_signoff: boolean;
  security_classification: string;
  caveats: string[];
  is_masked?: boolean;

  /** Export control regime (ITAR, EAR_ECCN, UK_MILITARY_LIST, etc.) */
  export_control_regime?: string | null;

  /** TAA/MLA reference for export-controlled tasks */
  taa_mla_reference?: string | null;

  /** Active blockers on this task */
  blockers?: NodeBlockerCockpit[];

  /** Whether V&V sign-off is missing (blocks 100% completion) */
  vv_signoff_missing?: boolean;
}

/**
 * Response from GET /api/v1/cockpit/focus-queue
 */
export interface FocusQueueResponse {
  tasks: FocusQueueTask[];
  total: number;
}

// ---------------------------------------------------------------------------
// Claimable Tasks
// ---------------------------------------------------------------------------

/**
 * A task assigned to a generic placeholder resource that the user can claim.
 */
export interface ClaimableTask {
  id: string;
  code: string;
  name: string;
  percent_complete: number;
  planned_start_date: string | null;
  planned_end_date: string | null;
  delivery_mode: string | null;
  security_classification: string;
  caveats: string[];
  is_masked?: boolean;

  /** The generic placeholder resource name */
  placeholder_name: string;
  placeholder_code: string;

  /** Required skill (if any) */
  required_skill: string | null;
  min_proficiency: number | null;
}

/**
 * Response from GET /api/v1/cockpit/claimable-tasks
 */
export interface ClaimableTasksResponse {
  tasks: ClaimableTask[];
  total: number;
}

// ---------------------------------------------------------------------------
// Progress Update
// ---------------------------------------------------------------------------

/**
 * Request body for POST /api/v1/cockpit/tasks/{node_id}/progress
 */
export interface ProgressUpdateRequest {
  /** Increment: +5, +10, or 'complete' to set 100% */
  increment: number | 'complete';

  /** Optional hours logged for today */
  hours_logged?: number;
}

/**
 * Response from POST /api/v1/cockpit/tasks/{node_id}/progress
 */
export interface ProgressUpdateResponse {
  node_id: string;
  code: string;
  name: string;
  percent_complete: number;
  actual_start_date: string | null;
  actual_end_date: string | null;
  vv_signoff_missing?: boolean;
}

// ---------------------------------------------------------------------------
// Blocker Creation
// ---------------------------------------------------------------------------

/**
 * Blocker category for cockpit blocker creation.
 */
export type BlockerCategory =
  | 'DEPENDENCY_OVERDUE'
  | 'RESOURCE_UNAVAILABLE'
  | 'CLEARANCE_HOLD'
  | 'FACILITY_MAINTENANCE'
  | 'OPERATIONAL_IMPEDIMENT';

/**
 * Blocker severity levels.
 */
export type BlockerSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR';

/**
 * Request body for POST /api/v1/cockpit/tasks/{node_id}/blocker
 */
export interface BlockerCreateRequest {
  category: BlockerCategory;
  severity: BlockerSeverity;
  impacted_hours: number;
}

/**
 * Response from POST /api/v1/cockpit/tasks/{node_id}/blocker
 */
export interface BlockerCreateResponse {
  blocker_id: string;
  portfolio_node_id: string;
  category: BlockerCategory;
  severity: BlockerSeverity;
  impacted_hours: number;
}

/**
 * Simplified blocker for cockpit display.
 */
export interface NodeBlockerCockpit {
  id: string;
  category: BlockerCategory;
  severity: BlockerSeverity;
  impacted_hours: number;
  resolved_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Weekly Timesheet
// ---------------------------------------------------------------------------

/**
 * A single day's timesheet entry.
 */
export interface TimesheetDay {
  date: string; // ISO date string YYYY-MM-DD
  day_name: string; // e.g. 'Mon', 'Tue'
  is_weekend: boolean;
  is_today: boolean;
  scheduled_hours: number;
  logged_hours: number;
  task_code: string | null;
  task_name: string | null;
}

/**
 * Weekly timesheet snapshot for the cockpit view.
 */
export interface WeeklyTimesheetSnapshot {
  week_start: string;
  week_end: string;
  days: TimesheetDay[];
  total_scheduled: number;
  total_logged: number;
  weekly_capacity_hours: number;
}
