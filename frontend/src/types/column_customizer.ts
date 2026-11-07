/**
 * Column Customizer Type Definitions
 *
 * Types for the interactive Column Customizer modal that allows users to
 * configure column visibility, order, pinning, density, zoom, and Gantt
 * layer visibility.  Presets can be saved, shared, exported as .ppmview.json,
 * and imported from file.
 *
 * Column Categories
 * -----------------
 *
 * The 45-field Master Column Catalogue is organized into 6 categories:
 *
 * 1. **Hierarchy** — Code, name, delivery mode, indent level
 * 2. **CPM Schedule** — Planned/actual dates, early/late dates, float, critical path
 * 3. **Progress** — Percent complete, physical percent
 * 4. **EVM** — BAC, PV, EV, AC, CV, SV, CPI, SPI, EAC, VAC
 * 5. **Security** — Classification, caveats, DAL/SIL level
 * 6. **Logistics** — Resources, blockers, procurement, baseline comparison
 *
 * Preset Sharing
 * --------------
 *
 * Presets support three sharing scopes:
 *
 * - **PRIVATE** — Only the owner can see and use the preset.
 * - **PROJECT_SHARED** — Any user with access to the associated project.
 * - **SYSTEM_GLOBAL** — Visible to all authenticated users.
 *
 * Presets are persisted to PostgreSQL via the GanttViewPreset model and
 * can be exported as `.ppmview.json` files for air-gapped transport.
 */

// ---------------------------------------------------------------------------
// Column Categories
// ---------------------------------------------------------------------------

/**
 * A single column definition from the Master Column Catalogue.
 * Maps a data field to a human-readable label and category.
 */
export interface ColumnDefinition {
  /** Data field name (must exist in the Master Column Catalogue) */
  field: string;
  /** Human-readable column header text */
  label: string;
  /** Category group for the column selection checklist */
  category: ColumnCategory;
  /** Default width in pixels */
  defaultWidth: number;
  /** Whether the column is visible by default */
  defaultVisible: boolean;
  /** Whether the column is frozen (pinned) by default */
  defaultFrozen: boolean;
}

/**
 * Column category groups for the left pane checklist.
 */
export type ColumnCategory =
  | 'Hierarchy'
  | 'CPM Schedule'
  | 'Progress'
  | 'EVM'
  | 'Security'
  | 'Logistics';

/**
 * Column pinning position.
 */
export type ColumnPinPosition = 'left' | 'right' | 'none';

/**
 * User-configured column state.
 */
export interface ColumnConfig {
  field: string;
  label: string;
  width: number;
  visible: boolean;
  pinned: ColumnPinPosition;
  order: number;
}

// ---------------------------------------------------------------------------
// Gantt Layer Settings
// ---------------------------------------------------------------------------

/**
 * Gantt chart layer visibility settings.
 */
export interface GanttLayerSettings {
  /** Show B₀ contract baseline and B_curr approved PMB baseline bars */
  showBaselines: boolean;
  /** Show dependency bezier curves */
  showDependencies: boolean;
  /** Show jagged status-date drop line */
  showDropLine: boolean;
  /** Show presence avatars */
  showPresence: boolean;
}

// ---------------------------------------------------------------------------
// Layout & Viewport Settings
// ---------------------------------------------------------------------------

/**
 * Density tier for the grid and Gantt chart.
 */
export type DensityTier = 'ULTRA_DENSE' | 'BALANCED' | 'COMFORT';

/**
 * Row height in pixels for each density tier.
 */
export const DENSITY_ROW_HEIGHTS: Record<DensityTier, number> = {
  ULTRA_DENSE: 28,
  BALANCED: 36,
  COMFORT: 44,
};

/**
 * Timeline zoom level.
 */
export type ZoomLevel = 'DAYS' | 'WEEKS' | 'MONTHS';

/**
 * Complete layout and viewport settings.
 */
export interface LayoutSettings {
  density: DensityTier;
  zoomLevel: ZoomLevel;
  splitRatio: number;
  ganttLayers: GanttLayerSettings;
}

// ---------------------------------------------------------------------------
// Preset Types
// ---------------------------------------------------------------------------

/**
 * Preset sharing scope (mirrors backend SharingScope enum).
 */
export type SharingScope = 'PRIVATE' | 'PROJECT_SHARED' | 'SYSTEM_GLOBAL';

/**
 * Preset classification (mirrors backend PresetClassification enum).
 */
export type PresetClassification = 'OFFICIAL' | 'SECRET' | 'TOP_SECRET';

/**
 * Backend GanttViewPreset response.
 */
export interface GanttViewPreset {
  id: string;
  name: string;
  description: string | null;
  project_id: string | null;
  owner_user_id: string;
  sharing_scope: SharingScope;
  classification: PresetClassification;
  config_payload: ConfigPayload;
  created_at: string;
  updated_at: string;
}

/**
 * Preset category for grouping in the dropdown.
 */
export type PresetCategory = 'Personal' | 'Project Shared' | 'System Standard';

/**
 * Preset with category for display in the management bar.
 */
export interface PresetWithCategory extends GanttViewPreset {
  category: PresetCategory;
}

/**
 * Config payload conforming to the .ppmview.json specification.
 */
export interface ConfigPayload {
  columns: Array<{
    field: string;
    label: string;
    width: number;
    visible: boolean;
    frozen: boolean;
  }>;
  sort?: {
    field: string;
    direction: 'asc' | 'desc';
  };
  density: DensityTier;
  split_ratio: number;
  filter_tokens?: string;
  filter_mode?: 'FILTER' | 'DIM';
  gantt?: {
    zoom_level: 'DAYS' | 'WEEKS' | 'MONTHS';
    show_baselines: boolean;
    show_drop_line: boolean;
    show_dependencies: boolean;
    show_presence: boolean;
  };
}

/**
 * Request to create a new preset.
 */
export interface PresetCreateRequest {
  name: string;
  description?: string;
  project_id?: string | null;
  sharing_scope: SharingScope;
  classification?: PresetClassification;
  config_payload: ConfigPayload;
}

/**
 * Request to update an existing preset.
 */
export interface PresetUpdateRequest {
  name?: string;
  description?: string;
  sharing_scope?: SharingScope;
  config_payload?: ConfigPayload;
}

/**
 * .ppmview.json file format for export/import.
 */
export interface PPMViewExport {
  version: string;
  export_date: string;
  preset_name: string;
  classification?: PresetClassification;
  config: ConfigPayload;
}

// ---------------------------------------------------------------------------
// Master Column Catalogue Definitions
// ---------------------------------------------------------------------------

/**
 * The complete 45-field Master Column Catalogue organized by category.
 * This is the definitive list of columns available in the customizer.
 */
export const MASTER_COLUMN_DEFINITIONS: ColumnDefinition[] = [
  // Hierarchy
  { field: 'code', label: 'Task Code', category: 'Hierarchy', defaultWidth: 120, defaultVisible: true, defaultFrozen: true },
  { field: 'name', label: 'Name & Title', category: 'Hierarchy', defaultWidth: 300, defaultVisible: true, defaultFrozen: false },
  { field: 'delivery_mode', label: 'Delivery Mode', category: 'Hierarchy', defaultWidth: 100, defaultVisible: true, defaultFrozen: false },
  // CPM Schedule
  { field: 'planned_start_date', label: 'Planned Start', category: 'CPM Schedule', defaultWidth: 110, defaultVisible: true, defaultFrozen: false },
  { field: 'planned_end_date', label: 'Planned Finish', category: 'CPM Schedule', defaultWidth: 110, defaultVisible: true, defaultFrozen: false },
  { field: 'actual_start_date', label: 'Actual Start', category: 'CPM Schedule', defaultWidth: 110, defaultVisible: false, defaultFrozen: false },
  { field: 'actual_end_date', label: 'Actual Finish', category: 'CPM Schedule', defaultWidth: 110, defaultVisible: false, defaultFrozen: false },
  { field: 'early_start', label: 'Early Start', category: 'CPM Schedule', defaultWidth: 100, defaultVisible: false, defaultFrozen: false },
  { field: 'early_finish', label: 'Early Finish', category: 'CPM Schedule', defaultWidth: 100, defaultVisible: false, defaultFrozen: false },
  { field: 'late_start', label: 'Late Start', category: 'CPM Schedule', defaultWidth: 100, defaultVisible: false, defaultFrozen: false },
  { field: 'late_finish', label: 'Late Finish', category: 'CPM Schedule', defaultWidth: 100, defaultVisible: false, defaultFrozen: false },
  { field: 'total_float', label: 'Total Float', category: 'CPM Schedule', defaultWidth: 90, defaultVisible: true, defaultFrozen: false },
  { field: 'free_float', label: 'Free Float', category: 'CPM Schedule', defaultWidth: 90, defaultVisible: false, defaultFrozen: false },
  { field: 'is_critical', label: 'Critical Path', category: 'CPM Schedule', defaultWidth: 80, defaultVisible: false, defaultFrozen: false },
  // Progress
  { field: 'percent_complete', label: '% Complete', category: 'Progress', defaultWidth: 100, defaultVisible: true, defaultFrozen: false },
  { field: 'physical_percent', label: 'Physical %', category: 'Progress', defaultWidth: 100, defaultVisible: false, defaultFrozen: false },
  // EVM
  { field: 'bac_cost', label: 'BAC', category: 'EVM', defaultWidth: 100, defaultVisible: false, defaultFrozen: false },
  { field: 'planned_value', label: 'PV', category: 'EVM', defaultWidth: 100, defaultVisible: false, defaultFrozen: false },
  { field: 'earned_value', label: 'EV', category: 'EVM', defaultWidth: 100, defaultVisible: false, defaultFrozen: false },
  { field: 'actual_cost', label: 'AC', category: 'EVM', defaultWidth: 100, defaultVisible: false, defaultFrozen: false },
  { field: 'cv', label: 'CV', category: 'EVM', defaultWidth: 90, defaultVisible: false, defaultFrozen: false },
  { field: 'sv', label: 'SV', category: 'EVM', defaultWidth: 90, defaultVisible: false, defaultFrozen: false },
  { field: 'cpi', label: 'CPI', category: 'EVM', defaultWidth: 80, defaultVisible: false, defaultFrozen: false },
  { field: 'spi', label: 'SPI', category: 'EVM', defaultWidth: 80, defaultVisible: false, defaultFrozen: false },
  { field: 'eac', label: 'EAC', category: 'EVM', defaultWidth: 90, defaultVisible: false, defaultFrozen: false },
  { field: 'vac', label: 'VAC', category: 'EVM', defaultWidth: 90, defaultVisible: false, defaultFrozen: false },
  // Security
  { field: 'security_classification', label: 'Classification', category: 'Security', defaultWidth: 110, defaultVisible: false, defaultFrozen: false },
  { field: 'caveats', label: 'Caveats', category: 'Security', defaultWidth: 100, defaultVisible: false, defaultFrozen: false },
  { field: 'dal_sil_level', label: 'DAL/SIL Level', category: 'Security', defaultWidth: 100, defaultVisible: false, defaultFrozen: false },
  { field: 'engineering_baseline_tier', label: 'Baseline Tier', category: 'Security', defaultWidth: 100, defaultVisible: false, defaultFrozen: false },
  // Logistics
  { field: 'assigned_resources', label: 'Assigned Resources', category: 'Logistics', defaultWidth: 150, defaultVisible: false, defaultFrozen: false },
  { field: 'allocated_units', label: 'Allocation %', category: 'Logistics', defaultWidth: 90, defaultVisible: false, defaultFrozen: false },
  { field: 'planned_hours', label: 'Planned Hours', category: 'Logistics', defaultWidth: 100, defaultVisible: false, defaultFrozen: false },
  { field: 'active_blockers', label: 'Blockers', category: 'Logistics', defaultWidth: 80, defaultVisible: true, defaultFrozen: false },
  { field: 'blocker_severity', label: 'Blocker Severity', category: 'Logistics', defaultWidth: 100, defaultVisible: false, defaultFrozen: false },
  { field: 'procurement_status', label: 'Procurement', category: 'Logistics', defaultWidth: 100, defaultVisible: false, defaultFrozen: false },
  { field: 'forecast_delivery_date', label: 'Forecast Delivery', category: 'Logistics', defaultWidth: 110, defaultVisible: false, defaultFrozen: false },
  { field: 'baseline_b0_start', label: 'B₀ Start', category: 'Logistics', defaultWidth: 100, defaultVisible: false, defaultFrozen: false },
  { field: 'baseline_b0_finish', label: 'B₀ Finish', category: 'Logistics', defaultWidth: 100, defaultVisible: false, defaultFrozen: false },
  { field: 'baseline_bcurr_start', label: 'B_curr Start', category: 'Logistics', defaultWidth: 110, defaultVisible: false, defaultFrozen: false },
  { field: 'baseline_bcurr_finish', label: 'B_curr Finish', category: 'Logistics', defaultWidth: 110, defaultVisible: false, defaultFrozen: false },
  { field: 'presence_users', label: 'Presence', category: 'Logistics', defaultWidth: 80, defaultVisible: false, defaultFrozen: false },
  { field: 'version_id', label: 'Version', category: 'Logistics', defaultWidth: 70, defaultVisible: false, defaultFrozen: false },
  { field: 'updated_at', label: 'Updated At', category: 'Logistics', defaultWidth: 120, defaultVisible: false, defaultFrozen: false },
  { field: 'updated_by', label: 'Updated By', category: 'Logistics', defaultWidth: 120, defaultVisible: false, defaultFrozen: false },
];

/**
 * Group column definitions by category.
 */
export const COLUMNS_BY_CATEGORY: Record<ColumnCategory, ColumnDefinition[]> = {
  Hierarchy: MASTER_COLUMN_DEFINITIONS.filter((c) => c.category === 'Hierarchy'),
  'CPM Schedule': MASTER_COLUMN_DEFINITIONS.filter((c) => c.category === 'CPM Schedule'),
  Progress: MASTER_COLUMN_DEFINITIONS.filter((c) => c.category === 'Progress'),
  EVM: MASTER_COLUMN_DEFINITIONS.filter((c) => c.category === 'EVM'),
  Security: MASTER_COLUMN_DEFINITIONS.filter((c) => c.category === 'Security'),
  Logistics: MASTER_COLUMN_DEFINITIONS.filter((c) => c.category === 'Logistics'),
};

/**
 * Category display order (determines the order in the left pane checklist).
 */
export const CATEGORY_ORDER: ColumnCategory[] = [
  'Hierarchy',
  'CPM Schedule',
  'Progress',
  'EVM',
  'Security',
  'Logistics',
];

/**
 * Category color classes for visual distinction.
 */
export const CATEGORY_COLORS: Record<ColumnCategory, string> = {
  Hierarchy: 'text-blue-400',
  'CPM Schedule': 'text-amber-400',
  Progress: 'text-green-400',
  EVM: 'text-purple-400',
  Security: 'text-red-400',
  Logistics: 'text-cyan-400',
};

/**
 * Default layout settings.
 */
export const DEFAULT_LAYOUT_SETTINGS: LayoutSettings = {
  density: 'BALANCED',
  zoomLevel: 'WEEKS',
  splitRatio: 0.6,
  ganttLayers: {
    showBaselines: false,
    showDependencies: true,
    showDropLine: true,
    showPresence: true,
  },
};

/**
 * Default config payload built from the Master Column Catalogue.
 */
export function getDefaultConfigPayload(): ConfigPayload {
  return {
    columns: MASTER_COLUMN_DEFINITIONS.map((def) => ({
      field: def.field,
      label: def.label,
      width: def.defaultWidth,
      visible: def.defaultVisible,
      frozen: def.defaultFrozen,
    })),
    sort: { field: 'planned_start_date', direction: 'asc' },
    density: DEFAULT_LAYOUT_SETTINGS.density,
    split_ratio: DEFAULT_LAYOUT_SETTINGS.splitRatio,
    gantt: {
      zoom_level: DEFAULT_LAYOUT_SETTINGS.zoomLevel,
      show_baselines: DEFAULT_LAYOUT_SETTINGS.ganttLayers.showBaselines,
      show_drop_line: DEFAULT_LAYOUT_SETTINGS.ganttLayers.showDropLine,
      show_dependencies: DEFAULT_LAYOUT_SETTINGS.ganttLayers.showDependencies,
      show_presence: DEFAULT_LAYOUT_SETTINGS.ganttLayers.showPresence,
    },
  };
}
