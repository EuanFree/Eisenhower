/**
 * Preview API Response Types
 *
 * TypeScript interfaces mirroring the backend preview schemas used by the
 * hover summary card endpoints (`/api/v1/previews/*`).  These types define
 * the lightweight data payloads returned for hover inspector modals — just
 * enough context to display a summary without loading full sub-tree payloads.
 *
 * Backend source: `app/schemas/preview.py`
 */

// ---------------------------------------------------------------------------
// Task Hover Preview
// ---------------------------------------------------------------------------

/** A single resource assigned to a task, shown in the hover card */
export interface AssignedResourceItem {
  /** Name or code of the assigned resource */
  name: string;
  /** Allocation percentage (0.0–100.0) */
  allocation_percent: number;
}

/** Verification & Validation test case summary for a task */
export interface VVTestSummary {
  /** Number of mandatory V&V tests passed or waived */
  passed: number;
  /** Total number of mandatory V&V test cases */
  total: number;
}

/** Lightweight preview of a PortfolioNode for hover summary cards */
export interface TaskHoverPreview {
  /** UUID of the portfolio node */
  id: string;
  /** WBS code (e.g., 'WP-101'). Masked if unauthorized */
  code: string;
  /** Task name. Masked if unauthorized */
  name: string;
  /** Security classification level. Masked if unauthorized */
  security_classification: string | null;
  /** Security caveats (e.g., ['UK_EYES_ONLY']). Masked if unauthorized */
  caveats: string[] | null;
  /** Delivery methodology (WATERFALL, AGILE, HYBRID) */
  delivery_mode: string | null;
  /** ISO-formatted planned start date */
  planned_start: string | null;
  /** ISO-formatted planned finish date */
  planned_finish: string | null;
  /** Physical progress percentage (0.0–100.0) */
  percent_complete: number;
  /** Total float in days (CPM result). Null if CPM not calculated */
  total_float: number | null;
  /** Whether the task is on the critical path (TF ≤ 0) */
  is_critical: boolean;
  /** Resources currently assigned to this task */
  assigned_resources: AssignedResourceItem[];
  /** Number of unresolved blockers on this task */
  active_blockers_count: number;
  /** Linked CDRL sequence number (e.g., 'CDRL-A004') */
  linked_cdrl_code: string | null;
  /** V&V test pass/total counts if task requires V&V signoff */
  vv_test_summary: VVTestSummary | null;
  /** True if fields are redacted due to insufficient clearance */
  is_masked: boolean;
}

// ---------------------------------------------------------------------------
// Resource Hover Preview
// ---------------------------------------------------------------------------

/** A single skill entry for a resource's top skills list */
export interface SkillItem {
  /** Name of the skill (e.g., 'Systems Safety Assessment') */
  skill_name: string;
  /** Proficiency rating (1–5: Novice to Master) */
  proficiency_level: number;
  /** Verification status (SELF_ATTESTED, ENDORSED, CERTIFIED) */
  verification_status: string;
}

/** Lightweight preview of a ResourceNode for hover summary cards */
export interface ResourceHoverPreview {
  /** UUID of the resource node */
  id: string;
  /** Resource code. Masked if unauthorized */
  code: string;
  /** Resource name. Masked if unauthorized */
  name: string;
  /** Type of resource (PERSON, FACILITY, ASSET) */
  resource_type: string | null;
  /** Security clearance level. Masked if unauthorized */
  clearance_level: string | null;
  /** ltree path of current physical location */
  current_location_path: string | null;
  /** Hours allocated this week */
  allocated_hours_this_week: number;
  /** Standard weekly capacity hours */
  capacity_hours: number;
  /** Top 3 endorsed skills ranked by proficiency */
  top_skills: SkillItem[];
  /** True if fields are redacted due to insufficient clearance */
  is_masked: boolean;
}

// ---------------------------------------------------------------------------
// Location Hover Preview
// ---------------------------------------------------------------------------

/** Lightweight preview of a LocationNode for hover summary cards */
export interface LocationHoverPreview {
  /** UUID of the location node */
  id: string;
  /** Location code (e.g., 'SITE-WARTON'). Masked if unauthorized */
  code: string;
  /** Location name. Masked if unauthorized */
  name: string;
  /** Hierarchy tier (SITE, FACILITY, ZONE, ROOM, etc.) */
  tier: string | null;
  /** ltree path in the location hierarchy */
  path: string | null;
  /** Whether this is a SCIF or TEMPEST facility */
  is_scif_or_tempest: boolean;
  /** Whether visitors require an escort */
  escort_required: boolean;
  /** Number of assets in this location and sub-locations */
  contained_assets_count: number;
  /** True if fields are redacted due to insufficient clearance */
  is_masked: boolean;
}

// ---------------------------------------------------------------------------
// Union type for any preview payload
// ---------------------------------------------------------------------------

/** Any preview payload returned by the preview API */
export type AnyHoverPreview =
  | TaskHoverPreview
  | ResourceHoverPreview
  | LocationHoverPreview;
