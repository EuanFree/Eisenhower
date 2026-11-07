/**
 * Governance Action Definitions
 *
 * Registers all Baseline Management, Earned Value Financials, Contract
 * Deliverable, and Operational Security actions with the Action Registry.
 *
 * Categories
 * ----------
 *
 * - **GOVERNANCE**: Baseline freeze, PMB baseline, BCR creation, CCB review,
 *   CDRL submission, QAR acceptance, customer comment matrix.
 * - **EVM**: IPMR Format 1/5 export, executive briefing deck, TCIF shareline
 *   audit, fiscal year spending cap validation.
 * - **SECURITY**: Forensic audit trail inspection, ledger integrity verification,
 *   emergency classified spillage purge.
 *
 * Role Guards
 * -----------
 *
 * Some actions require specific user roles:
 *
 * - `PROGRAMME_DIRECTOR`: Baseline freeze operations.
 * - `COMMERCIAL_OFFICER` / `QAR_INSPECTOR`: Government QAR acceptance recording.
 * - Two superusers with clearance ≥ SECRET: Emergency spillage purge.
 *
 * Usage
 * -----
 *
 * ```ts
 * import { governanceActions } from './definitions/governanceActions';
 * actionRegistry.registerAll(governanceActions);
 * ```
 */

import type { ActionDefinition, ActionContext } from '../types';

// ---------------------------------------------------------------------------
// Helper: Create a governance action definition
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
// Baseline & Change Control (category: 'GOVERNANCE')
// ---------------------------------------------------------------------------

/**
 * Baseline management actions for freezing contract baselines (B₀),
 * setting approved PMB baselines (B_curr), and raising/reviewing
 * Baseline Change Requests (BCR).
 */
const baselineActions: ActionDefinition[] = [
  createAction(
    'gov.baseline.freeze_b0',
    'Freeze Contract Baseline (B₀)',
    'Freeze the current WBS as the immutable contract baseline snapshot (B₀). ' +
      'Requires intent-typed confirmation (FREEZE-B0) before committing.',
    'ShieldLock',
    'GOVERNANCE',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) =>
      !ctx.isBaselineLocked &&
      ctx.userRoles.includes('PROGRAMME_DIRECTOR'),
    () =>
      console.log(
        'Action: Freeze Contract Baseline (B₀) — prompt intent-typed confirmation',
      ),
    {
      preferredSize: 'LARGE_48PX',
      viewTypes: ['WBS_GANTT'],
      getDisabledReason: (ctx) =>
        ctx.isBaselineLocked
          ? 'Disabled: Baseline is already frozen'
          : !ctx.userRoles.includes('PROGRAMME_DIRECTOR')
          ? 'Disabled: Requires PROGRAMME_DIRECTOR role'
          : undefined,
    },
  ),
  createAction(
    'gov.baseline.freeze_curr',
    'Set PMB Baseline (B_curr)',
    'Capture the current live schedule dates as the active approved ' +
      'Performance Measurement Baseline (B_curr).',
    'Bookmark',
    'GOVERNANCE',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => !ctx.isBaselineLocked,
    () => console.log('Action: Set PMB Baseline (B_curr)'),
    {
      viewTypes: ['WBS_GANTT'],
      getDisabledReason: (ctx) =>
        ctx.isBaselineLocked
          ? 'Disabled: Baseline is already frozen'
          : undefined,
    },
  ),
  createAction(
    'gov.bcr.create',
    'Raise Change Request (BCR)',
    'Launch the Baseline Change Request workflow modal to formally ' +
      'request a change to the approved baseline.',
    'FileText',
    'GOVERNANCE',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => ctx.selectedNodeIds.length > 0,
    () => console.log('Action: Raise Baseline Change Request'),
    {
      viewTypes: ['WBS_GANTT'],
    },
  ),
  createAction(
    'gov.bcr.review',
    'CCB Review Board',
    'Navigate to the Change Control Board view for reviewing and ' +
      'approving/rejecting pending Baseline Change Requests.',
    'Users',
    'GOVERNANCE',
    () => true,
    () => true,
    () => console.log('Action: Navigate to CCB Review Board'),
    {
      viewTypes: ['CCB'],
    },
  ),
];

// ---------------------------------------------------------------------------
// Earned Value & Commercial Financials (category: 'EVM')
// ---------------------------------------------------------------------------

/**
 * EVM reporting and commercial financial actions for generating
 * statutory IPMR/CPR exports, executive briefing decks, and
 * TCIF shareline audits.
 */
const evmFinancialActions: ActionDefinition[] = [
  createAction(
    'evm.report.ipmr_format1',
    'Export IPMR Format 1',
    'Generate a signed WBS time-phased cost spreadsheet (Format 1) ' +
      'with BCWS, BCWP, ACWP, CV, SV, CPI, SPI, EAC, and VAC columns.',
    'FileSpreadsheet',
    'EVM',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => true,
    () => console.log('Action: Export IPMR Format 1 spreadsheet'),
    {
      viewTypes: ['WBS_GANTT', 'EVM_REPORTING'],
    },
  ),
  createAction(
    'evm.report.ipmr_format5',
    'Export IPMR Format 5',
    'Emit the variance analysis narrative report (Format 5) with ' +
      'auto-extracted tasks exceeding variance thresholds and ' +
      'pre-populated Problem/Cause/Impact/Corrective Action text.',
    'FileText',
    'EVM',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => true,
    () => console.log('Action: Export IPMR Format 5 narrative'),
    {
      viewTypes: ['WBS_GANTT', 'EVM_REPORTING'],
    },
  ),
  createAction(
    'evm.briefing.generate',
    'Executive Deck (.pptx)',
    'Generate a classification-stamped executive briefing deck ' +
      'with Programme Health, Gantt snapshot, EVM S-Curve, ' +
      'Monte Carlo tornado chart, and 5×5 risk matrix slides.',
    'Presentation',
    'EVM',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => true,
    () => console.log('Action: Generate executive briefing deck (.pptx)'),
    {
      preferredSize: 'LARGE_48PX',
      viewTypes: ['WBS_GANTT', 'EVM_REPORTING'],
    },
  ),
  createAction(
    'evm.tcif.recalculate',
    'TCIF Shareline Audit',
    'Calculate TCIF fee adjustments using shareline ratios and ' +
      'ceiling price clamping against projected VAC.',
    'Calculator',
    'EVM',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => ctx.selectedNodeIds.length > 0,
    () => console.log('Action: Recalculate TCIF shareline adjustments'),
    {
      viewTypes: ['WBS_GANTT', 'EVM_REPORTING'],
    },
  ),
  createAction(
    'evm.fiscal.validate',
    'Audit FY Spending Caps',
    'Check periodic time-phased spend against UK/US annual funding ' +
      'tranches and flag FISCAL_TRANCHE_OVERRUN if exceeded.',
    'CalendarRange',
    'EVM',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => true,
    () => console.log('Action: Audit fiscal year spending caps'),
    {
      viewTypes: ['WBS_GANTT', 'EVM_REPORTING'],
    },
  ),
];

// ---------------------------------------------------------------------------
// Contract Deliverables & Commercial Acceptance (category: 'GOVERNANCE')
// ---------------------------------------------------------------------------

/**
 * CDRL submission, Government QAR acceptance recording, and
 * customer comment matrix inspection actions.
 */
const cdrlActions: ActionDefinition[] = [
  createAction(
    'cdrl.submit',
    'Submit Deliverable',
    'Upload a contract deliverable artifact to the MinIO vault ' +
      'with SHA-256 checksum verification and ABAC clearance gating.',
    'UploadCloud',
    'GOVERNANCE',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => ctx.selectedNodeIds.length > 0,
    () => console.log('Action: Submit CDRL deliverable to vault'),
    {
      viewTypes: ['WBS_GANTT', 'CDRL'],
    },
  ),
  createAction(
    'cdrl.qar.accept',
    'Record MOD Form 640 / DD-250',
    'Log formal Government QAR acceptance receipt and unblock ' +
      'the linked billing milestone. Requires COMMERCIAL_OFFICER ' +
      'or QAR_INSPECTOR role.',
    'Award',
    'GOVERNANCE',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) =>
      ctx.selectedNodeIds.length > 0 &&
      (ctx.userRoles.includes('COMMERCIAL_OFFICER') ||
        ctx.userRoles.includes('QAR_INSPECTOR')),
    () => console.log('Action: Record Government QAR acceptance'),
    {
      viewTypes: ['WBS_GANTT', 'CDRL'],
      getDisabledReason: (ctx) =>
        !ctx.userRoles.includes('COMMERCIAL_OFFICER') &&
        !ctx.userRoles.includes('QAR_INSPECTOR')
          ? 'Disabled: Requires COMMERCIAL_OFFICER or QAR_INSPECTOR role'
          : undefined,
    },
  ),
  createAction(
    'cdrl.matrix.inspect',
    'Customer Comment Matrix',
    'Open the customer line-item comment disposition slide-out ' +
      'drawer for reviewing and responding to CDRL review comments.',
    'MessageSquare',
    'GOVERNANCE',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => ctx.selectedNodeIds.length > 0,
    () => console.log('Action: Open customer comment matrix'),
    {
      viewTypes: ['WBS_GANTT', 'CDRL'],
    },
  ),
];

// ---------------------------------------------------------------------------
// Operational Security & Forensics (category: 'SECURITY')
// ---------------------------------------------------------------------------

/**
 * Forensic audit trail inspection, cryptographic ledger integrity
 * verification, and emergency classified data spillage purge actions.
 */
const securityActions: ActionDefinition[] = [
  createAction(
    'sec.audit.inspect',
    'Forensic Audit Trail',
    'Open the SHA-256 tamper-evident ledger inspector for the ' +
      'selected node, showing the complete mutation history with ' +
      'actor, client IP, and security caveats at each mutation.',
    'Binary',
    'SECURITY',
    (ctx) => ctx.activeViewType === 'WBS_GANTT',
    (ctx) => ctx.selectedNodeIds.length === 1,
    () => console.log('Action: Open forensic audit trail inspector'),
    {
      defaultShortcut: 'Alt+A',
      viewTypes: ['WBS_GANTT'],
    },
  ),
  createAction(
    'sec.audit.verify_chain',
    'Verify Ledger Integrity',
    'Trigger a full-chain cryptographic hash audit sweep that ' +
      'iterates through all ForensicAuditLog records in monotonic ' +
      'order, recalculates SHA-256 hashes, and reports any ' +
      'broken links, timestamp inversions, or tampering.',
    'ShieldCheck',
    'SECURITY',
    () => true,
    () => true,
    () => console.log('Action: Verify full audit chain integrity'),
    {
      viewTypes: ['WBS_GANTT'],
    },
  ),
  createAction(
    'sec.spillage.emergency_purge',
    'Emergency Spillage Purge',
    'Launch the multi-signature classified data purge workflow. ' +
      'Requires two superusers with clearance ≥ SECRET. ' +
      'Surgically redacts contaminated content and records ' +
      'cryptographic tombstone mutations in the immutable audit log.',
    'Flame',
    'SECURITY',
    () => true,
    (ctx) => {
      // Requires two superusers with clearance >= SECRET
      const hasSecretClearance =
        ctx.userClearance === 'SECRET' || ctx.userClearance === 'TOP_SECRET';
      const isSuperuser =
        ctx.userRoles.includes('SYSTEM_ADMIN') ||
        ctx.userRoles.includes('ADMIN');
      return hasSecretClearance && isSuperuser;
    },
    () =>
      console.log(
        'Action: Launch emergency spillage purge — requires multi-sig authorization',
      ),
    {
      preferredSize: 'LARGE_48PX',
      getDisabledReason: (ctx) => {
        const hasSecretClearance =
          ctx.userClearance === 'SECRET' || ctx.userClearance === 'TOP_SECRET';
        const isSuperuser =
          ctx.userRoles.includes('SYSTEM_ADMIN') ||
          ctx.userRoles.includes('ADMIN');
        if (!hasSecretClearance)
          return 'Disabled: Requires clearance ≥ SECRET';
        if (!isSuperuser)
          return 'Disabled: Requires superuser role';
        return undefined;
      },
    },
  ),
];

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * All governance actions combined for bulk registration.
 *
 * @example
 * ```ts
 * import { governanceActions } from './definitions/governanceActions';
 * actionRegistry.registerAll(governanceActions);
 * ```
 */
export const governanceActions: ActionDefinition[] = [
  ...baselineActions,
  ...evmFinancialActions,
  ...cdrlActions,
  ...securityActions,
];

// Individual category exports for selective registration
export {
  baselineActions,
  evmFinancialActions,
  cdrlActions,
  securityActions,
};
