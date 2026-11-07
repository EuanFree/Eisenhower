/**
 * Operational Action Definitions
 *
 * Registers all operational actions for the Commercial, Resource, Governance,
 * and Security ribbon tabs with the Action Registry.
 *
 * Categories
 * ----------
 *
 * - **EVM**: Cost profile selection (Linear, Beta, Weibull, Rayleigh distributions).
 * - **GOVERNANCE**: Timesheet coherence audit, delegation authority creation.
 * - **RISK**: 36-month workforce demand forecast.
 * - **SECURITY**: HSM signature verification sweep.
 *
 * Ribbon Injection
 * ----------------
 *
 * These action chunks are dynamically injected into the Ribbon when the
 * Commercial, Resource, or Governance tabs are selected.
 *
 * Usage
 * -----
 *
 * ```ts
 * import { operationalActions } from './definitions/operationalActions';
 * actionRegistry.registerAll(operationalActions);
 * ```
 */

import type { ActionDefinition, ActionContext } from '../types';

// ---------------------------------------------------------------------------
// Helper: Create an operational action definition
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
// Commercial Cost Curve Actions (category: 'EVM')
// ---------------------------------------------------------------------------

/**
 * Cost profile selection action for choosing the distribution model
 * used in cost estimation and spreading calculations.
 */
const commercialActions: ActionDefinition[] = [
  createAction(
    'comm.cost_curve.set',
    'Cost Profile',
    'Select the cost distribution profile for spreading calculations: ' +
      'Linear (uniform), Beta (front-loaded), Weibull (variable failure rate), ' +
      'or Rayleigh (reliability growth).',
    'TrendingUp',
    'EVM',
    (ctx) =>
      ctx.activeViewType === 'COST_SPREADING' ||
      ctx.activeViewType === 'COSTING' ||
      ctx.activeViewType === 'COMMERCIAL',
    (ctx) => true,
    (_ctx, optionValue) => {
      console.log('Action: Set cost profile distribution', optionValue ?? 'Linear');
    },
    {
      preferredSize: 'SPLIT_DROPDOWN',
      viewTypes: ['COST_SPREADING', 'COSTING', 'COMMERCIAL'],
      dropdownOptions: [
        { label: 'Linear', value: 'linear' },
        { label: 'Beta', value: 'beta' },
        { label: 'Weibull', value: 'weibull' },
        { label: 'Rayleigh', value: 'rayleigh' },
      ],
    },
  ),
  createAction(
    'comm.timesheet.coherence',
    'Audit Coherence',
    'Run the timesheet coherence audit to detect divergence between ' +
      'reported hours and WBS task allocations, flagging batches ' +
      'where the variance exceeds the configured threshold.',
    'ClockAlert',
    'GOVERNANCE',
    (ctx) =>
      ctx.activeViewType === 'TIMESHEET_COHERENCE' ||
      ctx.activeViewType === 'COMMERCIAL' ||
      ctx.activeViewType === 'DAILY_COCKPIT',
    (ctx) => true,
    () => console.log('Action: Audit timesheet coherence'),
    {
      preferredSize: 'SMALL_24PX',
      viewTypes: ['TIMESHEET_COHERENCE', 'COMMERCIAL', 'DAILY_COCKPIT'],
    },
  ),
];

// ---------------------------------------------------------------------------
// Resource & Workforce Actions (category: 'RISK')
// ---------------------------------------------------------------------------

/**
 * Workforce demand forecasting actions for long-term capacity planning.
 */
const resourceActions: ActionDefinition[] = [
  createAction(
    'res.workforce.forecast',
    '36M Demand Forecast',
    'Generate a 36-month workforce demand forecast using historical ' +
      'utilization trends, pipeline workload, and leave projections ' +
      'to identify capacity gaps and hiring needs.',
    'LineChart',
    'RISK',
    (ctx) =>
      ctx.activeViewType === 'WORKFORCE_FORECAST' ||
      ctx.activeViewType === 'LINE_MANAGER_DASHBOARD' ||
      ctx.activeViewType === 'DASHBOARD',
    (ctx) => true,
    () => console.log('Action: Generate 36-month workforce demand forecast'),
    {
      preferredSize: 'LARGE_48PX',
      viewTypes: ['WORKFORCE_FORECAST', 'LINE_MANAGER_DASHBOARD', 'DASHBOARD'],
    },
  ),
];

// ---------------------------------------------------------------------------
// Governance & Delegation Actions (category: 'GOVERNANCE')
// ---------------------------------------------------------------------------

/**
 * Authority delegation actions for creating and managing
 * role-based access delegation records.
 */
const governanceOpsActions: ActionDefinition[] = [
  createAction(
    'gov.delegation.create',
    'Delegate Authority',
    'Create a new authority delegation record specifying the delegatee ' +
      'UPN, delegated permissions, and validity window. Requires ' +
      'PROGRAMME_DIRECTOR or SYSTEM_ADMIN role.',
    'UserCheck',
    'GOVERNANCE',
    (ctx) =>
      ctx.activeViewType === 'DELEGATION_MANAGEMENT' ||
      ctx.activeViewType === 'USER_MANAGEMENT',
    (ctx) =>
      ctx.userRoles.includes('PROGRAMME_DIRECTOR') ||
      ctx.userRoles.includes('SYSTEM_ADMIN'),
    () => console.log('Action: Create authority delegation'),
    {
      preferredSize: 'SMALL_24PX',
      viewTypes: ['DELEGATION_MANAGEMENT', 'USER_MANAGEMENT'],
      getDisabledReason: (ctx) =>
        !ctx.userRoles.includes('PROGRAMME_DIRECTOR') &&
        !ctx.userRoles.includes('SYSTEM_ADMIN')
          ? 'Disabled: Requires PROGRAMME_DIRECTOR or SYSTEM_ADMIN role'
          : undefined,
    },
  ),
];

// ---------------------------------------------------------------------------
// Security & HSM Actions (category: 'SECURITY')
// ---------------------------------------------------------------------------

/**
 * Hardware Security Module verification actions for cryptographic
 * signature auditing and enclave integrity checks.
 */
const securityOpsActions: ActionDefinition[] = [
  createAction(
    'sec.hsm.sweep',
    'Verify HSM Signatures',
    'Trigger a full HSM signature verification sweep across all ' +
      'cryptographically sealed artifacts, checking chain-of-trust ' +
      'integrity and reporting any broken or expired signatures.',
    'Key',
    'SECURITY',
    (ctx) =>
      ctx.activeViewType === 'HARDWARE_ENCLAVE' ||
      ctx.activeViewType === 'AUDIT' ||
      ctx.activeViewType === 'ADMIN_SECURITY',
    (ctx) =>
      ctx.userRoles.includes('SYSTEM_ADMIN') ||
      ctx.userClearance === 'TOP_SECRET',
    () => console.log('Action: Verify HSM signatures across all sealed artifacts'),
    {
      preferredSize: 'SMALL_24PX',
      viewTypes: ['HARDWARE_ENCLAVE', 'AUDIT', 'ADMIN_SECURITY'],
      getDisabledReason: (ctx) =>
        !ctx.userRoles.includes('SYSTEM_ADMIN') &&
        ctx.userClearance !== 'TOP_SECRET'
          ? 'Disabled: Requires SYSTEM_ADMIN role or TOP_SECRET clearance'
          : undefined,
    },
  ),
];

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * All operational actions combined for bulk registration.
 *
 * @example
 * ```ts
 * import { operationalActions } from './definitions/operationalActions';
 * actionRegistry.registerAll(operationalActions);
 * ```
 */
export const operationalActions: ActionDefinition[] = [
  ...commercialActions,
  ...resourceActions,
  ...governanceOpsActions,
  ...securityOpsActions,
];

// Individual category exports for selective registration
export {
  commercialActions,
  resourceActions,
  governanceOpsActions,
  securityOpsActions,
};
