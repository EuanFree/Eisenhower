/**
 * Built-in Action Definitions
 *
 * Registers all standard UI actions with the ActionRegistry.  Each action
 * is a declarative ActionDefinition that specifies its label, icon, category,
 * keyboard shortcut, availability/enabled predicates, and execute callback.
 *
 * Categories
 * ----------
 *
 * - **STRUCTURE**: Indent, Outdent, Insert, Delete
 * - **SCHEDULE**: Run CPM, Toggle Milestone
 * - **PROGRESS**: Mark Progress, Flag Blocker, Log Hours
 * - **EVM**: Calculate EV, Export IPMR, TCIF shareline audit
 * - **GOVERNANCE**: Baselines, BCRs, CDRLs, commercial acceptance
 * - **RISK**: Monte Carlo SRA, tornado sensitivity, 5×5 risk matrix,
 *   clash sweep, heuristic leveling
 * - **FACILITY**: Chamber reservation, cooldown buffer, calibration status
 * - **SECURITY**: Forensic audit, ledger integrity, spillage purge
 * - **SYSTEM**: Undo/Redo, column customizer, density cycling, dim/filter
 *   mode, preset management, Gantt zoom controls, baseline shadows,
 *   custom field authoring, Merkle sync, programme archive sealing
 *
 * Registration
 * ------------
 *
 * Call `registerBuiltInActions()` at application startup to populate the
 * global action registry.  Actions are wired to console.log placeholders
 * that should be replaced with actual store mutations or API calls.
 */

import { actionRegistry } from './ActionRegistry';
import type { ActionDefinition, ActionContext } from './types';
import {
  governanceActions as governanceActionsDefs,
  baselineActions,
  evmFinancialActions,
  cdrlActions,
  securityActions,
} from './definitions/governanceActions';
import {
  systemActions as systemActionsDefs,
  riskActions as riskActionsDefs,
  facilityActions as facilityActionsDefs,
  viewportActions,
  adminActions,
} from './definitions/systemActions';
import {
  operationalActions as operationalActionsDefs,
  commercialActions,
  resourceActions,
  governanceOpsActions,
  securityOpsActions,
} from './definitions/operationalActions';

// ---------------------------------------------------------------------------
// Helper: Create a basic action definition
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
// STRUCTURE Actions
// ---------------------------------------------------------------------------

const structureActions: ActionDefinition[] = [
  createAction(
    'indent',
    'Indent',
    'Indent selected tasks (reparent under previous sibling)',
    'Indent',
    'STRUCTURE',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => ctx.selectedNodeIds.length > 0 && !ctx.isBaselineLocked,
    () => console.log('Action: Indent selected tasks'),
    {
      defaultShortcut: 'Alt+Shift+→',
      viewTypes: ['WBS_GANTT'],
      getDisabledReason: (ctx) =>
        ctx.isBaselineLocked ? 'Disabled: Task is locked under Baseline 0' : undefined,
    },
  ),
  createAction(
    'outdent',
    'Outdent',
    'Outdent selected tasks (promote to parent\'s level)',
    'Outdent',
    'STRUCTURE',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => ctx.selectedNodeIds.length > 0 && !ctx.isBaselineLocked,
    () => console.log('Action: Outdent selected tasks'),
    {
      defaultShortcut: 'Alt+Shift+←',
      viewTypes: ['WBS_GANTT'],
      getDisabledReason: (ctx) =>
        ctx.isBaselineLocked ? 'Disabled: Task is locked under Baseline 0' : undefined,
    },
  ),
  createAction(
    'insert-above',
    'Insert Above',
    'Insert a new task above the selected item',
    'ArrowUp',
    'STRUCTURE',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => !ctx.isBaselineLocked,
    () => console.log('Action: Insert task above'),
    {
      defaultShortcut: 'Insert',
      viewTypes: ['WBS_GANTT'],
      getDisabledReason: (ctx) =>
        ctx.isBaselineLocked ? 'Disabled: Task is locked under Baseline 0' : undefined,
    },
  ),
  createAction(
    'delete',
    'Delete',
    'Delete selected tasks',
    'Trash2',
    'STRUCTURE',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => ctx.selectedNodeIds.length > 0 && !ctx.isBaselineLocked,
    () => console.log('Action: Delete selected nodes'),
    {
      defaultShortcut: 'Del',
      viewTypes: ['WBS_GANTT'],
      getDisabledReason: (ctx) =>
        ctx.isBaselineLocked ? 'Disabled: Task is locked under Baseline 0' : undefined,
    },
  ),
];

// ---------------------------------------------------------------------------
// SCHEDULE Actions
// ---------------------------------------------------------------------------

const scheduleActions: ActionDefinition[] = [
  createAction(
    'run-cpm',
    'Run CPM',
    'Recalculate Critical Path Method forward and backward passes',
    'Play',
    'SCHEDULE',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => ctx.selectedNodeIds.length > 0,
    () => console.log('Action: Run CPM'),
    {
      preferredSize: 'LARGE_48PX',
      viewTypes: ['WBS_GANTT'],
    },
  ),
  createAction(
    'toggle-milestone',
    'Toggle Milestone',
    'Toggle milestone status on selected task',
    'Flag',
    'SCHEDULE',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => ctx.selectedNodeIds.length === 1 && !ctx.isBaselineLocked,
    () => console.log('Action: Toggle milestone'),
    {
      defaultShortcut: 'Shift+F2',
      viewTypes: ['WBS_GANTT'],
      getDisabledReason: (ctx) =>
        ctx.isBaselineLocked ? 'Disabled: Task is locked under Baseline 0' : undefined,
    },
  ),
  createAction(
    'link-selected',
    'Link Selected',
    'Create Finish-to-Start links across selected tasks',
    'Link',
    'SCHEDULE',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => ctx.selectedNodeIds.length >= 2 && !ctx.isBaselineLocked,
    () => console.log('Action: Link selected tasks (FS)'),
    {
      defaultShortcut: 'Ctrl+F2',
      viewTypes: ['WBS_GANTT'],
      getDisabledReason: (ctx) =>
        ctx.isBaselineLocked ? 'Disabled: Task is locked under Baseline 0' : undefined,
    },
  ),
  createAction(
    'unlink-selected',
    'Unlink',
    'Remove dependencies between selected tasks',
    'Link2',
    'SCHEDULE',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => ctx.selectedNodeIds.length >= 2 && !ctx.isBaselineLocked,
    () => console.log('Action: Unlink selected tasks'),
    {
      defaultShortcut: 'Ctrl+Shift+F2',
      viewTypes: ['WBS_GANTT'],
      getDisabledReason: (ctx) =>
        ctx.isBaselineLocked ? 'Disabled: Task is locked under Baseline 0' : undefined,
    },
  ),
];

// ---------------------------------------------------------------------------
// PROGRESS Actions
// ---------------------------------------------------------------------------

const progressActions: ActionDefinition[] = [
  createAction(
    'mark-progress',
    'Mark Progress',
    'Set physical progress percentage on selected task',
    'CheckCircle',
    'PROGRESS',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => ctx.selectedNodeIds.length > 0 && !ctx.isBaselineLocked,
    (_ctx, optionValue) => {
      const percent = optionValue ?? 100;
      console.log('Action: Mark progress', percent);
    },
    {
      preferredSize: 'SPLIT_DROPDOWN',
      viewTypes: ['WBS_GANTT'],
      dropdownOptions: [
        { label: '0%', value: 0 },
        { label: '25%', value: 25 },
        { label: '50%', value: 50 },
        { label: '75%', value: 75 },
        { label: '100%', value: 100 },
      ],
      getDisabledReason: (ctx) =>
        ctx.isBaselineLocked ? 'Disabled: Task is locked under Baseline 0' : undefined,
    },
  ),
  createAction(
    'flag-blocker',
    'Flag Blocker',
    'Create a NodeBlocker on the selected task',
    'AlertTriangle',
    'PROGRESS',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => ctx.selectedNodeIds.length === 1,
    () => console.log('Action: Flag blocker'),
    {
      defaultShortcut: 'Ctrl+B',
      viewTypes: ['WBS_GANTT'],
    },
  ),
  createAction(
    'log-hours',
    'Log Hours',
    'Log direct labor hours to today\'s timesheet',
    'Clock',
    'PROGRESS',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => ctx.selectedNodeIds.length === 1,
    () => console.log('Action: Log hours'),
    {
      defaultShortcut: 'Ctrl+T',
      viewTypes: ['WBS_GANTT'],
    },
  ),
];

// ---------------------------------------------------------------------------
// EVM Actions
// ---------------------------------------------------------------------------

const evmActions: ActionDefinition[] = [
  createAction(
    'calculate-ev',
    'Calculate EV',
    'Recalculate Earned Value for selected tasks',
    'Calculator',
    'EVM',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => ctx.selectedNodeIds.length > 0,
    () => console.log('Action: Calculate Earned Value'),
    {
      viewTypes: ['WBS_GANTT'],
    },
  ),
  createAction(
    'export-ipmr',
    'Export IPMR',
    'Generate IPMR Format 1 WBS time-phased report',
    'FileSpreadsheet',
    'EVM',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => true,
    () => console.log('Action: Export IPMR Format 1'),
    {
      preferredSize: 'LARGE_48PX',
      viewTypes: ['WBS_GANTT'],
    },
  ),
];

// ---------------------------------------------------------------------------
// GOVERNANCE Actions
// (Imported from definitions/governanceActions.ts)
// ---------------------------------------------------------------------------

const governanceActions: ActionDefinition[] = governanceActionsDefs;

// ---------------------------------------------------------------------------
// RISK Actions
// (Imported from definitions/systemActions.ts + additional sweep/leveling)
// ---------------------------------------------------------------------------

const riskActions: ActionDefinition[] = [
  ...riskActionsDefs,
  createAction(
    'run-sweep',
    'Run Sweep',
    'Run background clash daemon sweep',
    'RefreshCw',
    'RISK',
    (ctx) => ctx.activeViewType === 'SCHEDULE_HEALTH',
    (ctx) => true,
    () => console.log('Action: Run Clash Sweep'),
    {
      viewTypes: ['SCHEDULE_HEALTH'],
    },
  ),
  createAction(
    'run-leveling',
    'Run Leveling',
    'Compute resource leveling proposal',
    'SlidersHorizontal',
    'RISK',
    (ctx) => ctx.activeViewType === 'SCHEDULE_HEALTH',
    (ctx) => true,
    () => console.log('Action: Run Heuristic Leveling'),
    {
      viewTypes: ['SCHEDULE_HEALTH'],
    },
  ),
];

// ---------------------------------------------------------------------------
// FACILITY Actions
// (Imported from definitions/systemActions.ts)
// ---------------------------------------------------------------------------

const facilityActions: ActionDefinition[] = facilityActionsDefs;

// ---------------------------------------------------------------------------
// SYSTEM Actions
// (Imported from definitions/systemActions.ts + core undo/redo/display)
// ---------------------------------------------------------------------------

const operationalActions: ActionDefinition[] = operationalActionsDefs;

const systemActions: ActionDefinition[] = [
  ...systemActionsDefs,
  createAction(
    'undo',
    'Undo',
    'Undo last action',
    'Undo',
    'SYSTEM',
    () => true,
    () => true,
    () => console.log('Action: Undo'),
    {
      defaultShortcut: 'Ctrl+Z',
    },
  ),
  createAction(
    'redo',
    'Redo',
    'Redo last undone action',
    'Redo',
    'SYSTEM',
    () => true,
    () => true,
    () => console.log('Action: Redo'),
    {
      defaultShortcut: 'Ctrl+Y',
    },
  ),
  createAction(
    'open-workbench',
    'Workbench',
    'Open drill-down workbench for selected task',
    'PanelBottom',
    'SYSTEM',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => ctx.selectedNodeIds.length === 1,
    () => console.log('Action: Open drill-down workbench'),
    {
      defaultShortcut: 'Shift+F2',
      viewTypes: ['WBS_GANTT'],
    },
  ),
];

// ---------------------------------------------------------------------------
// Cockpit Actions
// ---------------------------------------------------------------------------

const cockpitActions: ActionDefinition[] = [
  createAction(
    'claim-task',
    'Claim Task',
    'Claim a generic placeholder task',
    'UserPlus',
    'PROGRESS',
    (ctx) => ctx.activeViewType === 'DAILY_COCKPIT',
    (ctx) => ctx.selectedNodeIds.length === 1,
    () => console.log('Action: Claim task'),
    {
      viewTypes: ['DAILY_COCKPIT'],
    },
  ),
  createAction(
    'submit-timesheet',
    'Submit Timesheet',
    'Submit weekly timesheet for CAM approval',
    'Send',
    'PROGRESS',
    (ctx) => ctx.activeViewType === 'DAILY_COCKPIT',
    (ctx) => true,
    () => console.log('Action: Submit timesheet'),
    {
      viewTypes: ['DAILY_COCKPIT'],
    },
  ),
];

// ---------------------------------------------------------------------------
// Navigation Actions (for Sidebar)
// ---------------------------------------------------------------------------

/**
 * Navigation actions define the sidebar menu items.
 * Each maps a view type to an action definition so the SidebarActionRenderer
 * can render them dynamically from the registry.
 */
const navigationActions: ActionDefinition[] = [
  createAction(
    'nav-wbs-gantt',
    'WBS & Master Gantt',
    'Work Breakdown Structure and Gantt chart master view',
    'LayoutGrid',
    'SYSTEM',
    () => true,
    () => true,
    () => console.log('Navigate: WBS & Master Gantt'),
    { viewTypes: ['WBS_GANTT'] },
  ),
  createAction(
    'nav-daily-cockpit',
    'My Daily Cockpit',
    'Personal operational landing page with focus queue and metrics',
    'Home',
    'SYSTEM',
    () => true,
    () => true,
    () => console.log('Navigate: Daily Cockpit'),
    { viewTypes: ['DAILY_COCKPIT'] },
  ),
  createAction(
    'nav-schedule-health',
    'Schedule Clash & Health',
    'Background clash audit triage center and leveling proposals',
    'Activity',
    'SYSTEM',
    () => true,
    () => true,
    () => console.log('Navigate: Schedule Health'),
    { viewTypes: ['SCHEDULE_HEALTH'] },
  ),
  createAction(
    'nav-dashboard',
    'Dashboard Builder',
    'Custom dashboard builder with draggable widgets and live data',
    'LayoutDashboard',
    'SYSTEM',
    () => true,
    () => true,
    () => console.log('Navigate: Dashboard Builder'),
    { viewTypes: ['DASHBOARD'] },
  ),
  createAction(
    'nav-copilot',
    'CoPilot',
    'AI chat assistant with access to project data via MCP tools',
    'Bot',
    'SYSTEM',
    () => true,
    () => true,
    () => {
      // Import and toggle the CoPilot panel
      import('../../stores/useCopilotStore').then((mod) => {
        mod.useCopilotStore.getState().togglePanel();
      });
    },
  ),
  createAction(
    'nav-sra-risk',
    'Monte Carlo SRA',
    'Schedule Risk Analysis simulation and tornado sensitivity chart',
    'BarChart3',
    'SYSTEM',
    () => true,
    () => true,
    () => console.log('Navigate: SRA Risk'),
    { viewTypes: ['SRA_RISK'] },
  ),
  createAction(
    'nav-evm-reporting',
    'EVM & IPMR Reporting',
    'Earned Value Management reporting and statutory export workbench',
    'FileSpreadsheet',
    'SYSTEM',
    () => true,
    () => true,
    () => console.log('Navigate: EVM Reporting'),
    { viewTypes: ['EVM_REPORTING'] },
  ),
  createAction(
    'nav-facility-chamber',
    'Chamber & HIL Facility',
    'Physical facility reservation and environmental envelope tracking',
    'Thermometer',
    'SYSTEM',
    () => true,
    () => true,
    () => console.log('Navigate: Facility Chamber'),
    { viewTypes: ['FACILITY_CHAMBER'] },
  ),
  createAction(
    'nav-location-explorer',
    'Location Explorer',
    'Physical location tree explorer and asset custody tracking',
    'MapPin',
    'SYSTEM',
    () => true,
    () => true,
    () => console.log('Navigate: Location Explorer'),
    { viewTypes: ['LOCATION_EXPLORER'] },
  ),
  createAction(
    'nav-artifact-vault',
    'Artifact Vault',
    'Classified document vault with ABAC-gated upload and download',
    'Lock',
    'SYSTEM',
    () => true,
    () => true,
    () => console.log('Navigate: Artifact Vault'),
    { viewTypes: ['ARTIFACT_VAULT'] },
  ),
  createAction(
    'nav-cdrl',
    'Contract Deliverables',
    'CDRL/SDRL master register with statutory review window countdowns',
    'FileText',
    'SYSTEM',
    () => true,
    () => true,
    () => console.log('Navigate: CDRL'),
    { viewTypes: ['CDRL'] },
  ),
  createAction(
    'nav-ccb',
    'Change Control Board',
    'Baseline Change Request review and digital signature approval',
    'Shield',
    'SYSTEM',
    () => true,
    () => true,
    () => console.log('Navigate: CCB'),
    { viewTypes: ['CCB'] },
  ),
  createAction(
    'nav-custom-fields',
    'Custom Attribute Registry',
    'Administrative custom field definition management workbench',
    'Database',
    'SYSTEM',
    () => true,
    () => true,
    () => console.log('Navigate: Custom Fields'),
    { viewTypes: ['CUSTOM_FIELDS'] },
  ),
  createAction(
    'nav-merkle-sync',
    'Merkle Sync',
    'Offline multi-site schedule reconciliation wizard',
    'GitMerge',
    'SYSTEM',
    () => true,
    () => true,
    () => console.log('Navigate: Merkle Sync'),
    { viewTypes: ['MERKLE_SYNC'] },
  ),
  createAction(
    'nav-help-center',
    'Help Center',
    'Offline architectural manual and interactive system blueprint',
    'BookOpen',
    'SYSTEM',
    () => true,
    () => true,
    () => console.log('Navigate: Help Center'),
    { viewTypes: ['HELP_CENTER'] },
  ),
  createAction(
    'nav-supplier-portal',
    'Supplier Portal',
    'Isolated subcontractor boundary tenant for deliverable submission',
    'Users',
    'SYSTEM',
    () => true,
    () => true,
    () => console.log('Navigate: Supplier Portal'),
    { viewTypes: ['SUPPLIER_PORTAL'] },
  ),
];

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register all built-in actions with the global action registry.
 *
 * Call this function once at application startup (e.g., in AppShell).
 */
export function registerBuiltInActions(): void {
  actionRegistry.registerAll([
    ...structureActions,
    ...scheduleActions,
    ...progressActions,
    ...evmActions,
    ...governanceActions,
    ...riskActions,
    ...facilityActions,
    ...systemActions,
    ...cockpitActions,
    ...navigationActions,
    ...operationalActions,
  ]);
  console.log(`[ActionRegistry] Registered ${actionRegistry.size} built-in actions`);
}

// Export individual action arrays for testing
export {
  structureActions,
  scheduleActions,
  progressActions,
  evmActions,
  governanceActions,
  baselineActions,
  evmFinancialActions,
  cdrlActions,
  securityActions,
  riskActions,
  facilityActions,
  systemActions,
  viewportActions,
  adminActions,
  cockpitActions,
  navigationActions,
  operationalActions,
  commercialActions,
  resourceActions,
  governanceOpsActions,
  securityOpsActions,
};
