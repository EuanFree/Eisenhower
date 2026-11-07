/**
 * Clash & Leveling Type Definitions
 *
 * These types mirror the backend Pydantic schemas in `app/schemas/schemas.py`
 * for the Schedule Clash endpoints under `/api/v1/schedule/clashes/`.
 *
 * The clash audit engine detects resource overallocations, facility collisions,
 * credential lapses, negative float slips, and other scheduling conflicts.
 * The leveling engine proposes date shifts to resolve overallocations.
 */

// ---------------------------------------------------------------------------
// Clash Categories & Severities
// ---------------------------------------------------------------------------

/**
 * Categories of schedule clashes detected by the audit engine.
 */
export type ClashCategory =
  | 'RESOURCE_OVERALLOCATION'
  | 'FACILITY_CONTRAVENTION'
  | 'NEGATIVE_FLOAT_SLIP'
  | 'CALENDAR_EXCEPTION'
  | 'CREDENTIAL_LAPSE'
  | 'PREDECESSOR_UNMET'
  | 'SPATIAL_LOCATION_COLLISION';

/**
 * Severity levels for schedule clashes.
 */
export type ClashSeverity = 'CRITICAL' | 'MAJOR' | 'ADVISORY';

// ---------------------------------------------------------------------------
// Clash Issue
// ---------------------------------------------------------------------------

/**
 * A schedule clash issue detected by the background audit daemon.
 *
 * Corresponds to `ClashIssueResponse` in the backend.
 */
export interface ClashIssue {
  id: string;
  sweep_run_id: string;
  category: ClashCategory;
  severity: ClashSeverity;
  portfolio_node_id: string;
  conflicting_node_id: string | null;
  conflicting_resource_id: string | null;
  conflict_window_start: string; // ISO date
  conflict_window_end: string;   // ISO date
  title: string;
  description: string;
  recommended_action: string;
  is_resolved: boolean;
  created_at: string; // ISO datetime
}

/**
 * Response from GET /api/v1/schedule/clashes/
 */
export interface ClashListResponse {
  total_clashes: number;
  by_severity: Record<string, number>;
  clashes: ClashIssue[];
}

/**
 * Response from POST /api/v1/schedule/clashes/sweep/{project_id}
 */
export interface SweepResultResponse {
  sweep_run_id: string;
  total_clashes: number;
  by_severity: Record<string, number>;
  by_category: Record<string, number>;
  clash_ids: string[];
  completed_at: string;
}

// ---------------------------------------------------------------------------
// Leveling Shift
// ---------------------------------------------------------------------------

/**
 * A proposed date shift for a single portfolio node.
 *
 * Returned by the leveling engine in Proposal Mode — the shift
 * has not yet been committed to the database.
 *
 * Corresponds to `LevelingShiftResponse` in the backend.
 */
export interface LevelingShift {
  node_id: string;
  code: string;
  name: string;
  original_start: string;  // ISO datetime
  original_finish: string; // ISO datetime
  proposed_start: string;  // ISO datetime
  proposed_finish: string; // ISO datetime
  consumed_float_days: number;
  milestone_breach: boolean;
  reason: string;
}

/**
 * Response from POST /api/v1/schedule/clashes/leveling-proposal/{project_id}
 */
export interface LevelingProposalResponse {
  project_id: string;
  total_shifts: number;
  shifts: LevelingShift[];
  overallocation_windows: number;
  milestone_breaches: number;
  computed_at: string;
  message: string | null;
}

/**
 * Response from POST /api/v1/schedule/clashes/apply-leveling/{project_id}
 */
export interface LevelingApplyResponse {
  project_id: string;
  applied: number;
  failed: number;
  details: Record<string, any>[];
  applied_at: string;
}

// ---------------------------------------------------------------------------
// Frontend-only types
// ---------------------------------------------------------------------------

/**
 * Filter state for the clash triage board.
 */
export interface ClashFilters {
  severity: ClashSeverity | null;
  category: ClashCategory | null;
}

/**
 * Extended clash card data with optional node name lookup.
 */
export interface ClashCardData extends ClashIssue {
  /** Human-readable name of the primary node (fetched separately) */
  node_name?: string;
  /** Human-readable name of the conflicting node (fetched separately) */
  conflicting_node_name?: string;
  /** Human-readable name of the conflicting resource (fetched separately) */
  conflicting_resource_name?: string;
}
