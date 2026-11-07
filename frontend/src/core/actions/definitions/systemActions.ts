/**
 * System Action Definitions
 *
 * Registers all Schedule Risk Analysis, Physical Facility, Viewport Canvas,
 * and Administration actions with the Action Registry.
 *
 * Categories
 * ----------
 *
 * - **RISK**: Monte Carlo SRA simulation, tornado sensitivity chart,
 *   5×5 risk matrix modal.
 * - **FACILITY**: Chamber/HIL reservation, cooldown buffer adjustment,
 *   calibration status inspection.
 * - **SYSTEM**: Column customizer, density cycling, dim/filter mode toggle,
 *   preset save/export/import, Gantt zoom fit, jump to status date,
 *   baseline shadows toggle, custom field creation, Merkle sync,
 *   programme archive sealing.
 *
 * Role Guards
 * -----------
 *
 * Some actions require specific user roles:
 *
 * - `SYSTEM_ADMIN` / `PMO_DIRECTOR`: Custom attribute field creation.
 *
 * Usage
 * -----
 *
 * ```ts
 * import { systemActions } from './definitions/systemActions';
 * actionRegistry.registerAll(systemActions);
 * ```
 */

import type { ActionDefinition, ActionContext } from '../types';

// ---------------------------------------------------------------------------
// Helper: Create a system action definition
// ---------------------------------------------------------------------------

function createAction(
  id: string,
  label: string,
  description: string,
  icon: string,
  category: ActionDefinition['category'],
  isAvailable: (ctx: ActionContext) => boolean,
  isEnabled: (ctx: ActionContext) => boolean,
  execute: (ctx: ActionContext, optionValue?: any) => void | Promise<void>,
  options?: Partial<ActionDefinition>,
): ActionDefinition {
  return {
    id,
    label,
    description,
    icon,
    category,
    isAvailable,
    isEnabled,
    execute,
    ...options,
  };
}

// ---------------------------------------------------------------------------
// Schedule Risk Analysis (category: 'RISK')
// ---------------------------------------------------------------------------

/**
 * Monte Carlo SRA simulation, tornado sensitivity filtering,
 * and interactive risk matrix actions.
 */
const riskActions: ActionDefinition[] = [
  createAction(
    'risk.sra.run',
    'Run Monte Carlo SRA',
    'Execute 1,000–10,000 stochastic simulation iterations over ' +
      '3-point Beta-PERT duration estimates to compute P50, P80, ' +
      'and P90 completion dates and criticality indices.',
    'Activity',
    'RISK',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => ctx.selectedNodeIds.length > 0,
    () => console.log('Action: Run Monte Carlo SRA simulation'),
    {
      preferredSize: 'LARGE_48PX',
      viewTypes: ['WBS_GANTT', 'SRA_RISK'],
    },
  ),
  createAction(
    'risk.tornado.filter',
    'Tornado Sensitivity',
    'Filter and rank activities by their Criticality Index — ' +
      'the percentage of simulation iterations where each activity ' +
      'landed on the critical path.',
    'BarChart2',
    'RISK',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => true,
    () => console.log('Action: Filter by tornado sensitivity'),
    {
      viewTypes: ['WBS_GANTT', 'SRA_RISK'],
    },
  ),
  createAction(
    'risk.matrix.toggle',
    '5×5 Risk Matrix',
    'Open the interactive Likelihood × Consequence risk matrix ' +
      'modal, plotting active risks by severity and filtering ' +
      'linked WBS tasks.',
    'Grid',
    'RISK',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => true,
    () => console.log('Action: Toggle 5×5 risk matrix modal'),
    {
      viewTypes: ['WBS_GANTT', 'SRA_RISK'],
    },
  ),
];

// ---------------------------------------------------------------------------
// Facilities & Physical Chambers (category: 'FACILITY')
// ---------------------------------------------------------------------------

/**
 * Chamber reservation, cooldown buffer adjustment, and
 * calibration status inspection actions.
 */
const facilityActions: ActionDefinition[] = [
  createAction(
    'fac.reserve.create',
    'Book Chamber / HIL',
    'Open the reservation creation modal for a physical test ' +
      'chamber or Hardware-in-the-Loop rig, validating temperature ' +
      'envelopes, RF shielding limits, and calibration expiry dates.',
    'CalendarPlus',
    'FACILITY',
    (ctx) => ctx.activeViewType === 'FACILITY_CHAMBER',
    (ctx) => true,
    () => console.log('Action: Open chamber reservation modal'),
    {
      viewTypes: ['FACILITY_CHAMBER'],
    },
  ),
  createAction(
    'fac.buffer.adjust',
    'Add Cooldown Buffer (+1h)',
    'Insert a post-test thermal stabilization window after the ' +
      'current reservation, automatically flagging a ' +
      'FACILITY_CONTRAVENTION clash if the buffer overlaps ' +
      'another booking.',
    'ThermometerSnowflake',
    'FACILITY',
    (ctx) => ctx.activeViewType === 'FACILITY_CHAMBER',
    (ctx) => ctx.selectedNodeIds.length > 0,
    () => console.log('Action: Add 1-hour cooldown buffer'),
    {
      viewTypes: ['FACILITY_CHAMBER'],
    },
  ),
  createAction(
    'fac.calibration.inspect',
    'Calibration Status',
    'Display test equipment calibration certificates, next ' +
      'calibration due date, and any scheduled maintenance ' +
      'downtime blocks for the selected asset.',
    'Cpu',
    'FACILITY',
    (ctx) => ctx.activeViewType === 'FACILITY_CHAMBER',
    (ctx) => ctx.selectedNodeIds.length > 0,
    () => console.log('Action: Inspect calibration status'),
    {
      viewTypes: ['FACILITY_CHAMBER'],
    },
  ),
];

// ---------------------------------------------------------------------------
// Viewport, Canvas & Customisation (category: 'SYSTEM')
// ---------------------------------------------------------------------------

/**
 * Column customizer, density cycling, dim/filter mode, preset
 * management, Gantt zoom controls, and baseline shadow toggles.
 */
const viewportActions: ActionDefinition[] = [
  createAction(
    'view.column.customizer',
    'Customise Columns...',
    'Open the Column Customiser modal to select, reorder, and pin ' +
      'columns from the 45-field Master Column Catalogue, adjust ' +
      'density, zoom defaults, and Gantt layer toggles.',
    'Sliders',
    'SYSTEM',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => true,
    () => console.log('Action: Open Column Customiser modal'),
    {
      defaultShortcut: 'Ctrl+Shift+C',
      viewTypes: ['WBS_GANTT'],
    },
  ),
  createAction(
    'view.density.cycle',
    'Toggle Density',
    'Cycle the display density between Ultra-Dense (28px row height), ' +
      'Balanced (36px), and Comfort (44px). Persists to PostgreSQL ' +
      'via UserDisplaySettings for SCIF hot-desking.',
    'Rows',
    'SYSTEM',
    () => true,
    () => true,
    () => console.log('Action: Cycle display density'),
    {
      defaultShortcut: 'Ctrl+Shift+D',
    },
  ),
  createAction(
    'view.mode.dim_toggle',
    'Dim / Filter Mode',
    'Toggle between Dim Mode (non-matching rows at 25% opacity) ' +
      'and Filter Mode (non-matching rows hidden). Preserves ' +
      'WBS hierarchy context in Dim Mode.',
    'EyeOff',
    'SYSTEM',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => true,
    () => console.log('Action: Toggle Dim / Filter mode'),
    {
      defaultShortcut: 'Ctrl+Shift+M',
      viewTypes: ['WBS_GANTT'],
    },
  ),
  createAction(
    'view.preset.save',
    'Save Preset...',
    'Open the preset naming and sharing modal to save the current ' +
      'column layout, filter tokens, and Gantt settings as a named ' +
      'preset (Private, Project Shared, or System Global).',
    'Save',
    'SYSTEM',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => true,
    () => console.log('Action: Open Save Preset modal'),
    {
      viewTypes: ['WBS_GANTT'],
    },
  ),
  createAction(
    'view.preset.export',
    'Export View Schema',
    'Download the active view configuration as a .ppmview.json ' +
      'file for offline air-gapped transport or peer-to-peer sharing.',
    'Download',
    'SYSTEM',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => true,
    () => console.log('Action: Export .ppmview.json file'),
    {
      viewTypes: ['WBS_GANTT'],
    },
  ),
  createAction(
    'view.preset.import',
    'Import View Schema',
    'Open a file dropzone to load a .ppmview.json configuration ' +
      'file, validating schema conformance before applying the ' +
      'layout.',
    'Upload',
    'SYSTEM',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => true,
    () => console.log('Action: Import .ppmview.json file'),
    {
      viewTypes: ['WBS_GANTT'],
    },
  ),
  createAction(
    'view.gantt.zoom_fit',
    'Zoom to Fit',
    'Scale the Gantt timeline to fit the entire project duration ' +
      'into the current viewport width.',
    'Maximize2',
    'SYSTEM',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => true,
    () => console.log('Action: Zoom Gantt to fit'),
    {
      defaultShortcut: 'Ctrl+Shift+F',
      viewTypes: ['WBS_GANTT'],
    },
  ),
  createAction(
    'view.gantt.jump_status',
    'Jump to Status Date',
    'Scroll the Gantt timeline to center on the active Earned ' +
      'Value status date, highlighting the jagged drop line.',
    'Crosshair',
    'SYSTEM',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => true,
    () => console.log('Action: Jump to EV status date'),
    {
      defaultShortcut: 'Ctrl+Home',
      viewTypes: ['WBS_GANTT'],
    },
  ),
  createAction(
    'view.gantt.toggle_baselines',
    'Baseline Shadows',
    'Toggle rendering of comparative baseline track lines: ' +
      'B₀ (green outline) for the contract baseline and ' +
      'B_curr (amber outline) for the approved PMB baseline.',
    'Layers',
    'SYSTEM',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => true,
    () => console.log('Action: Toggle baseline shadow rendering'),
    {
      viewTypes: ['WBS_GANTT'],
    },
  ),
];

// ---------------------------------------------------------------------------
// Administration & Custom Fields (category: 'SYSTEM')
// ---------------------------------------------------------------------------

/**
 * Custom field authoring, Merkle air-gap synchronization,
 * and programme archive sealing actions.
 */
const adminActions: ActionDefinition[] = [
  createAction(
    'admin.custom_field.create',
    'New Custom Attribute',
    'Open the Field Definition Drawer to author a typed custom ' +
      'field schema with data type, validation rules, enum options, ' +
      'and ABAC security gates. Requires SYSTEM_ADMIN or ' +
      'PMO_DIRECTOR role.',
    'PlusCircle',
    'SYSTEM',
    () => true,
    (ctx) =>
      ctx.userRoles.includes('SYSTEM_ADMIN') ||
      ctx.userRoles.includes('PMO_DIRECTOR'),
    () => console.log('Action: Open Field Definition Drawer'),
    {
      viewTypes: ['CUSTOM_FIELDS'],
      getDisabledReason: (ctx) =>
        !ctx.userRoles.includes('SYSTEM_ADMIN') &&
        !ctx.userRoles.includes('PMO_DIRECTOR')
          ? 'Disabled: Requires SYSTEM_ADMIN or PMO_DIRECTOR role'
          : undefined,
    },
  ),
  createAction(
    'admin.merkle.sync',
    'Merkle Air-Gap Sync',
    'Open the multi-site cryptographic reconciliation wizard to ' +
      'synchronize disconnected air-gapped instances using Merkle ' +
      'tree delta comparison and three-way version tracking.',
    'GitMerge',
    'SYSTEM',
    () => true,
    () => true,
    () => console.log('Action: Open Merkle sync wizard'),
    {
      viewTypes: ['MERKLE_SYNC'],
    },
  ),
  createAction(
    'admin.archive.seal',
    'Seal Programme Archive',
    'Execute final programme closeout: deactivate all sub-tree ' +
      'nodes, export all relational data, generate SHA-256 ' +
      'checksum manifest, and create a WORM cold-storage seal ' +
      'record.',
    'Archive',
    'SYSTEM',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) =>
      !ctx.isBaselineLocked &&
      (ctx.userRoles.includes('SYSTEM_ADMIN') ||
        ctx.userRoles.includes('PROGRAMME_DIRECTOR')),
    () => console.log('Action: Seal programme for cold storage'),
    {
      getDisabledReason: (ctx) =>
        ctx.isBaselineLocked
          ? 'Disabled: Programme is already sealed'
          : !ctx.userRoles.includes('SYSTEM_ADMIN') &&
            !ctx.userRoles.includes('PROGRAMME_DIRECTOR')
          ? 'Disabled: Requires SYSTEM_ADMIN or PROGRAMME_DIRECTOR role'
          : undefined,
    },
  ),
];

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * All system actions combined for bulk registration.
 *
 * @example
 * ```ts
 * import { systemActions } from './definitions/systemActions';
 * actionRegistry.registerAll(systemActions);
 * ```
 */
export const systemActions: ActionDefinition[] = [
  ...riskActions,
  ...facilityActions,
  ...viewportActions,
  ...adminActions,
];

// Individual category exports for selective registration
export {
  riskActions,
  facilityActions,
  viewportActions,
  adminActions,
};
