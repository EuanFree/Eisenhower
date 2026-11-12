/**
 * WBS (Work Breakdown Structure) Type Definitions
 *
 * These types mirror the backend Pydantic schemas in `app/schemas/schemas.py`
 * and represent the data flowing from the FastAPI WBS endpoints to the frontend.
 *
 * Key concepts:
 * - UniversalBreakdownNode (UBN) is the abstract base for all hierarchy nodes.
 * - PortfolioNode extends UBN with WBS-specific fields (dates, progress, EVM).
 * - ABAC (Attribute-Based Access Control) can mask nodes the user lacks
 *   clearance for, replacing sensitive fields with '[RESTRICTED]'.
 * - NodeBlocker represents active impediments on a task.
 */

// ---------------------------------------------------------------------------
// Security & Classification
// ---------------------------------------------------------------------------

/**
 * Security classification levels, ordered from lowest to highest.
 * Used for ABAC clearance checks and visual classification banners.
 */
export type SecurityClassification =
  | 'OFFICIAL'
  | 'OFFICIAL_SENSITIVE'
  | 'SECRET'
  | 'TOP_SECRET';

/**
 * Tree types for the polymorphic hierarchy.
 * WBS = Work Breakdown Structure (PortfolioNode)
 * RBS = Resource Breakdown Structure (ResourceNode)
 * LBS = Location Breakdown Structure (LocationNode)
 */
export type TreeType = 'WBS' | 'RBS' | 'LBS';

/**
 * Delivery mode for a portfolio work package or task.
 */
export type DeliveryMode = 'WATERFALL' | 'AGILE' | 'HYBRID';

/**
 * Scheduling mode for a WBS task or work package.
 * AUTO = Task dates dynamically recalculate based on predecessors and duration.
 * MANUAL = Task dates are fixed/pinned and do not automatically shift.
 */
export type SchedulingMode = 'AUTO' | 'MANUAL';

// ---------------------------------------------------------------------------
// Universal Breakdown Node (base)
// ---------------------------------------------------------------------------

/**
 * Base interface for all breakdown structure nodes.
 * Corresponds to the backend `UniversalBreakdownNode` SQLAlchemy model.
 */
export interface UBNBase {
  id: string;
  parent_id: string | null;
  /** Optimistic concurrency version counter — incremented on every update */
  version_id: number;
  tree_type: TreeType;
  code: string;
  name: string;
  path: string; // ltree path string, e.g. '1.2.3'
  security_classification: SecurityClassification;
  caveats: string[];
  odac_permissions: Record<string, unknown>;
  custom_attributes: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;

  /** Set by ABAC filtering when user lacks clearance for this node */
  is_masked?: boolean;
}

// ---------------------------------------------------------------------------
// Portfolio Node (WBS subclass)
// ---------------------------------------------------------------------------

/**
 * WBS-specific node extending the base UBN.
 * Corresponds to the backend `PortfolioNode` model.
 *
 * Includes scheduling fields (dates, progress), EVM fields (PV/EV/AC),
 * and delivery mode for the work package.
 */
export interface WBSNode extends UBNBase {
  tree_type: 'WBS';

  /** WATERFALL, AGILE, or HYBRID delivery approach */
  delivery_mode: DeliveryMode | null;

  /** AUTO or MANUAL scheduling mode (defaults to AUTO) */
  scheduling_mode?: SchedulingMode | null;

  /** Planned start date (ISO 8601 date string) */
  planned_start_date: string | null;

  /** Planned end date (ISO 8601 date string) */
  planned_end_date: string | null;

  /** Actual start date, set when work begins */
  actual_start_date: string | null;

  /** Actual end date, set when work completes */
  actual_end_date: string | null;

  /** Planned duration in working days — first-class temporal attribute */
  duration_days: number | null;

  /** Idle time within the task in working days (e.g., curing, approval waits) */
  lag_days: number | null;

  /** Physical percent complete (0–100) */
  percent_complete: number;

  /** Earned Value Management fields */
  evm_technique: string | null;
  bac_cost: number | null;
  planned_value: number | null;
  earned_value: number | null;
  actual_cost: number | null;

  /** CPM-calculated schedule metrics (stored in custom_attributes.schedule) */
  early_start: string | null;
  early_finish: string | null;
  late_start: string | null;
  late_finish: string | null;
  total_float: number | null;
  free_float: number | null;
  is_critical: boolean | null;

  /** Whether this node requires V&V signoff before marking 100% complete */
  requires_vv_signoff: boolean;

  /** Sandbox branching fields */
  is_sandbox_branch: boolean;
  sandbox_scenario_id: string | null;
  origin_node_id: string | null;

  /** Currency and exchange rate for international contracts */
  currency_code: string;
  contract_exchange_rate_id: string | null;

  /** Export control regime */
  export_control_regime: string | null;
  eccn_or_usml_category: string | null;
  authorized_nationalities: string[] | null;
  taa_mla_reference: string | null;

  /** Calendar binding */
  calendar_id: string | null;

  /** T0 relative scheduling */
  is_relative_t0_mode?: boolean;
  relative_start_day_offset?: number | null;
  relative_finish_day_offset?: number | null;
  atp_anchor_date?: string | null;

  /** Cost distribution profile for time-phased spending */
  cost_distribution_profile?: string | null;

  /** DAL/SIL safety criticality */
  dal_sil_level?: string | null;
  engineering_baseline_tier?: string | null;
  linked_requirements_manifest?: unknown[] | null;

  /** Hybrid delivery effort tracking */
  baseline_effort_days?: number | null;
  agile_actual_effort_days?: number | null;
}

// ---------------------------------------------------------------------------
// Node Blocker
// ---------------------------------------------------------------------------

/**
 * Categories of blockers that can impede a task.
 */
export type BlockerCategory =
  | 'DEPENDENCY_OVERDUE'
  | 'RESOURCE_UNAVAILABLE'
  | 'CLEARANCE_HOLD'
  | 'FACILITY_MAINTENANCE'
  | 'OPERATIONAL_IMPEDIMENT';

/**
 * Severity levels for blockers.
 */
export type BlockerSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR';

/**
 * Represents an active impediment on a portfolio node.
 * Corresponds to the backend `NodeBlocker` model.
 */
export interface NodeBlocker {
  id: string;
  portfolio_node_id: string;
  category: BlockerCategory;
  severity: BlockerSeverity;
  impacted_hours: number;
  resolved_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

/**
 * Response from GET /api/v1/wbs/tree/{node_id}
 * Returns a subtree with ABAC filtering applied.
 */
export interface WBSTreeResponse {
  root: WBSNode;
  children: WBSNode[];
  total_descendants: number;
}

/**
 * Response from GET /api/v1/wbs/nodes?root={path}
 * Returns child nodes for a given ltree path prefix.
 */
export interface WBSNodeListResponse {
  nodes: WBSNode[];
  total: number;
}

/**
 * Response from GET /api/v1/cockpit/tasks/{id}/blockers
 * Returns active blockers for a task.
 */
export interface BlockerListResponse {
  blockers: NodeBlocker[];
  total: number;
}

// ---------------------------------------------------------------------------
// Frontend-Only Types
// ---------------------------------------------------------------------------

/**
 * Flattened row used by the virtualized table.
 * Each WBSNode appears once in the flat list, with expansion state
 * and cached blocker data.
 */
export interface WBSRow extends WBSNode {
  /** Computed indent level from ltree dot count */
  indentLevel: number;

  /** Whether this node's children are expanded in the UI */
  expanded: boolean;

  /** Whether children have been fetched from the API */
  childrenLoaded: boolean;

  /** Cached active blockers for this node */
  blockers?: NodeBlocker[];

  /** Whether this row is currently selected */
  selected: boolean;
}

/**
 * Column visibility and width overrides persisted in display settings.
 */
export interface WBSColumnState {
  columnWidths: Record<string, number>;
  hiddenColumns: string[];
}
