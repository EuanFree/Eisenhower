/**
 * Filter Toolbar Type Definitions
 *
 * Types for the high-density, multi-faceted schedule query bar.
 * Supports typed filter tokens, dual visualization modes, and
 * named view presets persisted to PostgreSQL.
 *
 * Filter Token Syntax
 * -------------------
 *
 * - tier:WP          — Filter by hierarchy tier (Programme, Project, Control Account, Work Package, Task)
 * - is:critical      — Filter by critical path (TF ≤ 0)
 * - float:<5d        — Filter by total float threshold
 * - dal:DAL_A        — Filter by Design Assurance Level
 * - blocker:any      — Filter by presence of active blockers
 * - owner:j.smith    — Filter by assigned engineer
 *
 * Visualization Modes
 * -------------------
 *
 * - Filter Mode (default): Flattens the visible list to only matching nodes
 *   and their direct ancestors.
 *
 * - Dim / Context Mode: Retains the complete WBS hierarchy; reduces non-matching
 *   rows to 25% opacity while keeping matching nodes at full luminance with
 *   an accent border.
 */

// ---------------------------------------------------------------------------
// Hierarchy Tiers
// ---------------------------------------------------------------------------

/**
 * Hierarchy tier names used in the tier: filter token.
 * Mapped from ltree path depth: 0=Programme, 1=Project, 2=Control Account,
 * 3=Work Package, 4=Task.
 */
export type HierarchyTier =
  | 'PROGRAMME'
  | 'PROJECT'
  | 'CONTROL_ACCOUNT'
  | 'WORK_PACKAGE'
  | 'TASK';

/** Display labels for hierarchy tiers */
export const TIER_LABELS: Record<HierarchyTier, string> = {
  PROGRAMME: 'Programme',
  PROJECT: 'Project',
  CONTROL_ACCOUNT: 'Control Account',
  WORK_PACKAGE: 'Work Package',
  TASK: 'Task',
};

/** Short codes for hierarchy tiers (used in token display) */
export const TIER_SHORT: Record<HierarchyTier, string> = {
  PROGRAMME: 'PGM',
  PROJECT: 'PRJ',
  CONTROL_ACCOUNT: 'CA',
  WORK_PACKAGE: 'WP',
  TASK: 'Task',
};

// ---------------------------------------------------------------------------
// Design Assurance Levels
// ---------------------------------------------------------------------------

/**
 * DAL/SIL levels used in the dal: filter token.
 */
export type DALSILLevel =
  | 'DAL_A'
  | 'DAL_B'
  | 'DAL_C'
  | 'DAL_D'
  | 'DAL_E'
  | 'SIL_1'
  | 'SIL_2'
  | 'SIL_3'
  | 'SIL_4'
  | 'NON_SAFETY';

/** Display labels for DAL/SIL levels */
export const DAL_LABELS: Record<DALSILLevel, string> = {
  DAL_A: 'DAL-A (Highest)',
  DAL_B: 'DAL-B',
  DAL_C: 'DAL-C',
  DAL_D: 'DAL-D',
  DAL_E: 'DAL-E (Lowest)',
  SIL_1: 'SIL-1',
  SIL_2: 'SIL-2',
  SIL_3: 'SIL-3',
  SIL_4: 'SIL-4 (Highest)',
  NON_SAFETY: 'Non-Safety',
};

// ---------------------------------------------------------------------------
// Filter Token Keys
// ---------------------------------------------------------------------------

/**
 * Valid filter token keys that the autocomplete system recognizes.
 */
export type FilterTokenKey =
  | 'tier'
  | 'is'
  | 'float'
  | 'dal'
  | 'blocker'
  | 'owner'
  | 'mode'
  | 'classification'
  | 'progress';

/**
 * Display labels for filter token keys.
 */
export const TOKEN_KEY_LABELS: Record<FilterTokenKey, string> = {
  tier: 'Hierarchy Tier',
  is: 'Schedule Status',
  float: 'Total Float',
  dal: 'Design Assurance Level',
  blocker: 'Active Blockers',
  owner: 'Assigned Engineer',
  mode: 'Delivery Mode',
  classification: 'Security Classification',
  progress: 'Progress Range',
};

/**
 * Valid values for each filter token key (used for autocomplete).
 */
export const TOKEN_KEY_VALUES: Record<FilterTokenKey, string[]> = {
  tier: Object.keys(TIER_LABELS) as HierarchyTier[],
  is: ['critical', 'not-critical', 'blocked', 'complete', 'in-progress'],
  float: ['<5d', '<10d', '<20d', '>=20d', 'any'],
  dal: Object.keys(DAL_LABELS) as DALSILLevel[],
  blocker: ['any', 'none', 'critical', 'major', 'minor'],
  owner: [], // Dynamic — populated from assigned resources
  mode: ['WATERFALL', 'AGILE', 'HYBRID'],
  classification: ['OFFICIAL', 'OFFICIAL_SENSITIVE', 'SECRET', 'TOP_SECRET'],
  progress: ['0%', '0-25%', '25-50%', '50-75%', '75-100%', '100%'],
};

// ---------------------------------------------------------------------------
// Parsed Filter Token
// ---------------------------------------------------------------------------

/**
 * A single parsed filter token with its key, value, and operator.
 */
export interface FilterToken {
  /** Token key (e.g., 'tier', 'is', 'float') */
  key: FilterTokenKey;
  /** Token value (e.g., 'WP', 'critical', '<5d') */
  value: string;
  /** Optional operator for numeric filters ('<', '>=', etc.) */
  operator?: string;
  /** Raw string representation for display */
  raw: string;
  /** Whether this token is currently valid */
  isValid: boolean;
}

// ---------------------------------------------------------------------------
// Visualization Modes
// ---------------------------------------------------------------------------

/**
 * Dual visualization modes for the filter toolbar.
 */
export type FilterVisualizationMode = 'FILTER' | 'DIM';

/**
 * Display labels for visualization modes.
 */
export const VIS_MODE_LABELS: Record<FilterVisualizationMode, string> = {
  FILTER: 'Filter Mode',
  DIM: 'Dim / Context Mode',
};

// ---------------------------------------------------------------------------
// Named View Presets
// ---------------------------------------------------------------------------

/**
 * A saved named view preset containing filter tokens and column configuration.
 * Persisted to PostgreSQL via UserDisplaySettings.view_state_overrides.saved_presets.
 */
export interface ViewPreset {
  /** Unique preset identifier */
  id: string;
  /** Human-readable preset name (e.g., 'CAM Cost Audit') */
  name: string;
  /** Filter token string (e.g., 'tier:WP is:critical float:<10d') */
  tokenString: string;
  /** Visualization mode for this preset */
  visualizationMode: FilterVisualizationMode;
  /** Column width configuration snapshot */
  columnWidths?: Record<string, number>;
  /** Hidden column keys snapshot */
  hiddenColumns?: string[];
  /** Timestamp when the preset was last saved */
  savedAt: number;
}

// ---------------------------------------------------------------------------
// Autocomplete Suggestions
// ---------------------------------------------------------------------------

/**
 * A single autocomplete suggestion returned as the user types.
 */
export interface AutocompleteSuggestion {
  /** The full token text to insert (e.g., 'tier:WP') */
  text: string;
  /** Token key if this is a key suggestion, otherwise null */
  key?: FilterTokenKey | null;
  /** Token value if this is a value suggestion, otherwise null */
  value?: string | null;
  /** Display label for the suggestion */
  label: string;
  /** Description of the suggestion */
  description: string;
  /** Whether this is a key suggestion (vs value) */
  isKey: boolean;
}

// ---------------------------------------------------------------------------
// Filter State
// ---------------------------------------------------------------------------

/**
 * Complete filter state managed by the useFilterTokens hook.
 */
export interface FilterState {
  /** Raw token string from the input field */
  tokenString: string;
  /** Parsed filter tokens */
  tokens: FilterToken[];
  /** Current visualization mode */
  visualizationMode: FilterVisualizationMode;
  /** Set of node IDs that match the current filter */
  matchingNodeIds: Set<string>;
  /** Set of node IDs that should be visible (matching + ancestors in filter mode) */
  visibleNodeIds: Set<string>;
  /** Saved view presets */
  presets: ViewPreset[];
  /** Currently active preset ID (null = no preset active) */
  activePresetId: string | null;
}
