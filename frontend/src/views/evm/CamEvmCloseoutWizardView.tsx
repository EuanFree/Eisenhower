/**
 * CAM EVM Closeout Wizard View
 *
 * Monthly Control Account Manager (CAM) earned value closeout wizard.
 * Multi-step guided workflow for verifying physical progress, auditing
 * labor costs, computing earned value metrics, formulating IPMR Format 5
 * variance narratives, and digitally attesting the monthly closeout.
 *
 * Workflow Steps
 * --------------
 * 1. Physical Progress & Milestones Verification
 * 2. Timesheet Labor & Direct Cost Audit
 * 3. Earned Value Metric Computation (CV, SV, CPI, SPI, TCPI)
 * 4. IPMR Format 5 Variance Narrative Formulation
 * 5. Digital Attestation & Formal Sign-Off
 *
 * Route: /evm/cam-closeout-wizard
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Circle,
  AlertTriangle,
  FileText,
  ClipboardList,
  Calculator,
  PenTool,
  ShieldCheck,
  Download,
  Bot,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Lock,
  User,
  UserCheck,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Wizard step identifiers */
type WizardStep = 'progress' | 'labor' | 'evm' | 'narrative' | 'attestation';

/** Control Account earned value data */
interface ControlAccount {
  id: string;
  name: string;
  cam: string;
  bac: number;           // Budget at Completion
  pv: number;            // Planned Value
  ev: number;            // Earned Value
  ac: number;            // Actual Cost
  physicalProgress: number;  // 0-100%
  milestones: MilestoneItem[];
}

/** Milestone tracking item */
interface MilestoneItem {
  id: string;
  name: string;
  plannedDate: string;
  actualDate?: string;
  status: 'ON_TRACK' | 'AT_RISK' | 'COMPLETE' | 'SLIPPED';
}

/** Labor cost audit entry */
interface LaborEntry {
  id: string;
  employeeName: string;
  role: string;
  plannedHours: number;
  actualHours: number;
  plannedCost: number;
  actualCost: number;
  burnRate: number;  // actual / planned ratio
}

/** EVM computed metrics */
interface EvmMetrics {
  cv: number;          // Cost Variance = EV - AC
  sv: number;          // Schedule Variance = EV - PV
  cpi: number;         // Cost Performance Index = EV / AC
  spi: number;         // Schedule Performance Index = EV / PV
  eac: number;         // Estimate at Completion = BAC / CPI
  etv: number;         // Estimate to Complete = EAC - AC
  tcpi: number;        // To-Complete Performance Index = (BAC - EV) / (BAC - AC)
  cvPct: number;       // |CV| as percentage of BAC
  svPct: number;       // |SV| as percentage of BAC
  flagged: boolean;    // True if any threshold is breached
  flagReasons: string[];
}

/** IPMR Format 5 narrative fields */
interface IpmrNarrative {
  rootCauseTechnical: string;
  rootCauseSchedule: string;
  rootCauseCost: string;
  operationalImpact: string;
  correctiveActionPlan: string;
  mitigationOwner: string;
  targetRecoveryDate: string;
  recoveryMilestones: string;
}

/** Attestation sign-off record */
interface AttestationRecord {
  camName: string;
  camSignature: string;
  camPin: string;
  projectControlsLeadName: string;
  projectControlsLeadSignature: string;
  projectControlsLeadPin: string;
  signedAt: string;
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_CONTROL_ACCOUNTS: ControlAccount[] = [
  {
    id: 'CA-001',
    name: 'CA-001: Avionics Integration',
    cam: 'J. Smith',
    bac: 2500000,
    pv: 1200000,
    ev: 1050000,
    ac: 1180000,
    physicalProgress: 85,
    milestones: [
      { id: 'M1', name: 'PDR Review', plannedDate: '2026-09-15', actualDate: '2026-09-14', status: 'COMPLETE' },
      { id: 'M2', name: 'Interface Freeze', plannedDate: '2026-10-30', status: 'AT_RISK' },
      { id: 'M3', name: 'CDR Gate', plannedDate: '2026-12-15', status: 'ON_TRACK' },
    ],
  },
  {
    id: 'CA-002',
    name: 'CA-002: Propulsion Subsystem',
    cam: 'A. Patel',
    bac: 4200000,
    pv: 2100000,
    ev: 1950000,
    ac: 2250000,
    physicalProgress: 72,
    milestones: [
      { id: 'M4', name: 'Hot Fire Test', plannedDate: '2026-08-20', actualDate: '2026-09-05', status: 'SLIPPED' },
      { id: 'M5', name: 'Qualification Acceptance', plannedDate: '2026-11-30', status: 'AT_RISK' },
    ],
  },
  {
    id: 'CA-003',
    name: 'CA-003: Ground Support Equipment',
    cam: 'R. Williams',
    bac: 800000,
    pv: 600000,
    ev: 590000,
    ac: 595000,
    physicalProgress: 95,
    milestones: [
      { id: 'M6', name: 'Delivery Acceptance', plannedDate: '2026-10-15', actualDate: '2026-10-18', status: 'SLIPPED' },
      { id: 'M7', name: 'Commissioning', plannedDate: '2026-11-15', status: 'ON_TRACK' },
    ],
  },
  {
    id: 'CA-004',
    name: 'CA-004: Software Development',
    cam: 'L. Chen',
    bac: 3100000,
    pv: 1550000,
    ev: 1520000,
    ac: 1480000,
    physicalProgress: 68,
    milestones: [
      { id: 'M8', name: 'SIL Testing', plannedDate: '2026-10-01', actualDate: '2026-09-28', status: 'COMPLETE' },
      { id: 'M9', name: 'DIL Integration', plannedDate: '2026-12-01', status: 'ON_TRACK' },
    ],
  },
  {
    id: 'CA-005',
    name: 'CA-005: Structural Assembly',
    cam: 'M. O\'Brien',
    bac: 1800000,
    pv: 900000,
    ev: 750000,
    ac: 920000,
    physicalProgress: 55,
    milestones: [
      { id: 'M10', name: 'First Article Inspection', plannedDate: '2026-09-30', status: 'AT_RISK' },
      { id: 'M11', name: 'Assembly Completion', plannedDate: '2027-01-15', status: 'ON_TRACK' },
    ],
  },
];

const MOCK_LABOR_ENTRIES: LaborEntry[] = [
  { id: 'L1', employeeName: 'D. Thompson', role: 'Senior Systems Engineer', plannedHours: 160, actualHours: 185, plannedCost: 28000, actualCost: 32375, burnRate: 1.16 },
  { id: 'L2', employeeName: 'S. Kumar', role: 'Propulsion Analyst', plannedHours: 160, actualHours: 142, plannedCost: 24000, actualCost: 21300, burnRate: 0.89 },
  { id: 'L3', employeeName: 'E. Martinez', role: 'Test Technician', plannedHours: 160, actualHours: 168, plannedCost: 16000, actualCost: 16800, burnRate: 1.05 },
  { id: 'L4', employeeName: 'K. Nakamura', role: 'Software Developer', plannedHours: 160, actualHours: 175, plannedCost: 32000, actualCost: 35000, burnRate: 1.09 },
  { id: 'L5', employeeName: 'P. Dubois', role: 'Quality Assurance', plannedHours: 120, actualHours: 95, plannedCost: 18000, actualCost: 14250, burnRate: 0.79 },
  { id: 'L6', employeeName: 'T. Johansson', role: 'Structural Engineer', plannedHours: 160, actualHours: 190, plannedCost: 26000, actualCost: 30875, burnRate: 1.19 },
  { id: 'L7', employeeName: 'R. Al-Farsi', role: 'Avionics Technician', plannedHours: 160, actualHours: 155, plannedCost: 20000, actualCost: 19375, burnRate: 0.97 },
];

// ---------------------------------------------------------------------------
// EVM Computation Helpers
// ---------------------------------------------------------------------------

/**
 * Compute EVM metrics for a control account.
 * Flag if |CV| > 10% of BAC, |SV| > 10% of BAC, or CPI < 0.90.
 */
function computeEvmMetrics(ca: ControlAccount): EvmMetrics {
  const cv = ca.ev - ca.ac;
  const sv = ca.ev - ca.pv;
  const cpi = ca.ac > 0 ? ca.ev / ca.ac : 0;
  const spi = ca.pv > 0 ? ca.ev / ca.pv : 0;
  const eac = cpi > 0 ? ca.bac / cpi : ca.bac;
  const etv = eac - ca.ac;
  const tcpi = (ca.bac - ca.ac) > 0 ? (ca.bac - ca.ev) / (ca.bac - ca.ac) : 0;
  const cvPct = Math.abs(cv) / ca.bac * 100;
  const svPct = Math.abs(sv) / ca.bac * 100;

  const flagReasons: string[] = [];
  if (cvPct > 10) {
    flagReasons.push(`|CV| = £${Math.abs(cv).toLocaleString()} (${cvPct.toFixed(1)}% of BAC) exceeds 10% threshold`);
  }
  if (svPct > 10) {
    flagReasons.push(`|SV| = £${Math.abs(sv).toLocaleString()} (${svPct.toFixed(1)}% of BAC) exceeds 10% threshold`);
  }
  if (cpi < 0.90) {
    flagReasons.push(`CPI = ${cpi.toFixed(3)} is below 0.90 threshold`);
  }

  return {
    cv, sv, cpi, spi, eac, etv, tcpi, cvPct, svPct,
    flagged: flagReasons.length > 0,
    flagReasons,
  };
}

/** Format currency in GBP */
function formatCurrency(value: number): string {
  if (value < 0) {
    return `-£${Math.abs(value).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return `£${value.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Format percentage */
function formatPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// Step Components
// ---------------------------------------------------------------------------

/**
 * Step 1: Physical Progress & Milestones Verification
 */
function StepProgressVerification({
  accounts,
}: {
  accounts: ControlAccount[];
}) {
  const [selectedAccount, setSelectedAccount] = useState<string>(accounts[0]?.id || '');
  const [verifiedMilestones, setVerifiedMilestones] = useState<Set<string>>(new Set());

  const account = accounts.find((a) => a.id === selectedAccount);
  const unverifiedCount = account ? account.milestones.filter((m) => !verifiedMilestones.has(m.id)).length : 0;

  const handleVerify = useCallback((milestoneId: string) => {
    setVerifiedMilestones((prev) => {
      const next = new Set(prev);
      if (next.has(milestoneId)) {
        next.delete(milestoneId);
      } else {
        next.add(milestoneId);
      }
      return next;
    });
  }, []);

  const milestoneStatusColor = (status: MilestoneItem['status']) => {
    switch (status) {
      case 'COMPLETE': return 'text-green-600 bg-green-50';
      case 'ON_TRACK': return 'text-blue-600 bg-blue-50';
      case 'AT_RISK': return 'text-amber-600 bg-amber-50';
      case 'SLIPPED': return 'text-red-600 bg-red-50';
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Physical Progress & Milestones</h3>
          <p className="text-sm text-gray-500">Verify physical completion percentages and milestone status for each control account</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Accounts:</span>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>

      {account && (
        <div className="flex-1 overflow-auto p-4">
          {/* Progress Overview */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-500 mb-1">Physical Progress</div>
              <div className="text-2xl font-bold text-gray-900">{account.physicalProgress}%</div>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${account.physicalProgress >= 80 ? 'bg-green-500' : account.physicalProgress >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                  style={{ width: `${account.physicalProgress}%` }}
                />
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-500 mb-1">CAM Responsible</div>
              <div className="text-2xl font-bold text-gray-900">{account.cam}</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-sm text-gray-500 mb-1">Unverified Milestones</div>
              <div className={`text-2xl font-bold ${unverifiedCount > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {unverifiedCount}
              </div>
            </div>
          </div>

          {/* Milestone Table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Verified</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Milestone</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Planned Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actual Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {account.milestones.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleVerify(m.id)}
                        className={`p-1 rounded ${verifiedMilestones.has(m.id) ? 'text-green-600 bg-green-50' : 'text-gray-300 hover:text-gray-500'}`}
                      >
                        <CheckCircle2 size={20} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{m.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{m.plannedDate}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{m.actualDate || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${milestoneStatusColor(m.status)}`}>
                        {m.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Step 2: Timesheet Labor & Direct Cost Audit
 */
function StepLaborAudit({
  laborEntries,
}: {
  laborEntries: LaborEntry[];
}) {
  const totalPlannedCost = laborEntries.reduce((sum, e) => sum + e.plannedCost, 0);
  const totalActualCost = laborEntries.reduce((sum, e) => sum + e.actualCost, 0);
  const overallBurnRate = totalPlannedCost > 0 ? totalActualCost / totalPlannedCost : 0;
  const divergence = totalActualCost - totalPlannedCost;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Timesheet Labor & Direct Cost Audit</h3>
        <p className="text-sm text-gray-500">Identify labor burn divergence between planned and actual hours/costs</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 p-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">Planned Labor Cost</div>
          <div className="text-xl font-bold text-gray-900">{formatCurrency(totalPlannedCost)}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">Actual Labor Cost</div>
          <div className="text-xl font-bold text-gray-900">{formatCurrency(totalActualCost)}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">Burn Rate</div>
          <div className={`text-xl font-bold ${overallBurnRate > 1.1 ? 'text-red-600' : overallBurnRate > 1.0 ? 'text-amber-600' : 'text-green-600'}`}>
            {overallBurnRate.toFixed(2)}x
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">Cost Divergence</div>
          <div className={`text-xl font-bold ${divergence > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {divergence > 0 ? '+' : ''}{formatCurrency(divergence)}
          </div>
        </div>
      </div>

      {/* Labor Table */}
      <div className="flex-1 overflow-auto p-4 pt-0">
        <table className="min-w-full bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Planned Hrs</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actual Hrs</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Planned Cost</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actual Cost</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Burn Rate</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {laborEntries.map((entry) => {
              const variance = entry.actualCost - entry.plannedCost;
              return (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{entry.employeeName}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{entry.role}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{entry.plannedHours}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{entry.actualHours}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{formatCurrency(entry.plannedCost)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{formatCurrency(entry.actualCost)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      entry.burnRate > 1.1 ? 'bg-red-100 text-red-700' :
                      entry.burnRate > 1.0 ? 'bg-amber-100 text-amber-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {entry.burnRate.toFixed(2)}x
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-sm font-medium ${variance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {variance > 0 ? '+' : ''}{formatCurrency(variance)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Step 3: Earned Value Metric Computation
 */
function StepEvmComputation({
  accounts,
}: {
  accounts: ControlAccount[];
}) {
  const metricsMap = useMemo(() => {
    const map = new Map<string, EvmMetrics>();
    accounts.forEach((ca) => {
      map.set(ca.id, computeEvmMetrics(ca));
    });
    return map;
  }, [accounts]);

  const flaggedAccounts = accounts.filter((ca) => metricsMap.get(ca.id)?.flagged);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Earned Value Metric Computation</h3>
        <p className="text-sm text-gray-500">
          Evaluate statutory reporting thresholds: |CV| &gt; 10%, |SV| &gt; 10%, CPI &lt; 0.90
        </p>
        {flaggedAccounts.length > 0 && (
          <div className="mt-2 flex items-center gap-2 text-amber-600">
            <AlertTriangle size={16} />
            <span className="text-sm font-medium">
              {flaggedAccounts.length} control account(s) flagged — mandatory narrative required
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* Threshold Legend */}
        <div className="mb-4 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Flagged (threshold breach)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> Warning (approaching threshold)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Within tolerance
          </span>
        </div>

        {/* EVM Metrics Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Control Account</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">BAC</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">PV</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">EV</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">AC</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">CV</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">SV</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">CPI</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">SPI</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">TCPI</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">EAC</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {accounts.map((ca) => {
                const m = metricsMap.get(ca.id)!;
                return (
                  <tr
                    key={ca.id}
                    className={`hover:bg-gray-50 ${m.flagged ? 'bg-red-50' : ''}`}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      <div>{ca.name}</div>
                      <div className="text-xs text-gray-500">CAM: {ca.cam}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600">{formatCurrency(ca.bac)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600">{formatCurrency(ca.pv)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600">{formatCurrency(ca.ev)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600">{formatCurrency(ca.ac)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-medium ${m.cv >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {m.cv >= 0 ? '+' : ''}{formatCurrency(m.cv)}
                      </span>
                      <div className="text-xs text-gray-400">{m.cvPct.toFixed(1)}%</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-medium ${m.sv >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {m.sv >= 0 ? '+' : ''}{formatCurrency(m.sv)}
                      </span>
                      <div className="text-xs text-gray-400">{m.svPct.toFixed(1)}%</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-bold ${m.cpi >= 1.0 ? 'text-green-600' : m.cpi >= 0.9 ? 'text-amber-600' : 'text-red-600'}`}>
                        {m.cpi.toFixed(3)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-bold ${m.spi >= 1.0 ? 'text-green-600' : m.spi >= 0.9 ? 'text-amber-600' : 'text-red-600'}`}>
                        {m.spi.toFixed(3)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm font-medium text-gray-900">
                      {m.tcpi.toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600">
                      {formatCurrency(m.eac)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {m.flagged ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                          <AlertCircle size={12} /> FLAGGED
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                          <CheckCircle2 size={12} /> OK
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Flagged Account Details */}
        {flaggedAccounts.length > 0 && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
              <AlertTriangle size={16} />
              Flagged Accounts Requiring Mandatory Narrative
            </h4>
            <ul className="space-y-2">
              {flaggedAccounts.map((ca) => {
                const m = metricsMap.get(ca.id)!;
                return (
                  <li key={ca.id} className="text-sm text-red-700">
                    <strong>{ca.name}</strong>
                    <ul className="ml-4 mt-1 list-disc space-y-1">
                      {m.flagReasons.map((reason, i) => (
                        <li key={i}>{reason}</li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Step 4: IPMR Format 5 Narrative Builder
 */
function StepIpmrNarrative({
  accounts,
}: {
  accounts: ControlAccount[];
}) {
  const metricsMap = useMemo(() => {
    const map = new Map<string, EvmMetrics>();
    accounts.forEach((ca) => {
      map.set(ca.id, computeEvmMetrics(ca));
    });
    return map;
  }, [accounts]);

  const flaggedAccounts = accounts.filter((ca) => metricsMap.get(ca.id)?.flagged);

  const [selectedAccount, setSelectedAccount] = useState<string>(
    flaggedAccounts[0]?.id || accounts[0]?.id || ''
  );
  const [narratives, setNarratives] = useState<Record<string, IpmrNarrative>>({});
  const [copiloting, setCopiloting] = useState(false);

  const account = accounts.find((a) => a.id === selectedAccount);
  const metrics = metricsMap.get(selectedAccount);
  const narrative = narratives[selectedAccount] || {
    rootCauseTechnical: '',
    rootCauseSchedule: '',
    rootCauseCost: '',
    operationalImpact: '',
    correctiveActionPlan: '',
    mitigationOwner: '',
    targetRecoveryDate: '',
    recoveryMilestones: '',
  };

  const isMandatory = metrics?.flagged || false;

  const updateField = useCallback((field: keyof IpmrNarrative, value: string) => {
    setNarratives((prev) => ({
      ...prev,
      [selectedAccount]: {
        ...(prev[selectedAccount] || narrative),
        [field]: value,
      },
    }));
  }, [selectedAccount, narrative]);

  const handleDraftWithCopilot = useCallback(async () => {
    if (!account || !metrics) return;
    setCopiloting(true);

    // Simulate Copilot drafting based on CPM metrics
    setTimeout(() => {
      const draft: IpmrNarrative = {
        rootCauseTechnical: `Supplier delay on critical component procurement for ${account.name} has impacted downstream integration activities. Vendor lead time exceeded baseline assumption by 3 weeks.`,
        rootCauseSchedule: `Schedule slippage of ${metrics.sv < 0 ? Math.abs(metrics.sv).toLocaleString() : 0} (SV: ${formatCurrency(metrics.sv)}) driven by late delivery of long-lead items. Total float consumed on path to M-04 milestone.`,
        rootCauseCost: `Cost variance of ${formatCurrency(metrics.cv)} (CPI: ${metrics.cpi.toFixed(3)}) attributed to overtime labor required to recover schedule and expedited freight charges for critical components.`,
        operationalImpact: `Downstream impact on critical path activities: Interface Freeze (M-02) at risk of slipping by 2 weeks. CDR Gate (M-03) remains on track with float buffer of 5 days. No impact to System Handover milestone at this time.`,
        correctiveActionPlan: `1. Expedite remaining POs via air freight (cost impact: £15,000). 2. Add weekend shifts to integration team (2 additional FTEs). 3. Fast-track qualification testing where technically permissible.`,
        mitigationOwner: account.cam,
        targetRecoveryDate: '2027-01-15',
        recoveryMilestones: 'Interface Freeze recovery by 2026-11-15. CDR Gate maintained at 2026-12-15.',
      };
      setNarratives((prev) => ({
        ...prev,
        [selectedAccount]: draft,
      }));
      setCopiloting(false);
    }, 1500);
  }, [account, metrics, selectedAccount]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">IPMR Format 5 Variance Narrative</h3>
          <p className="text-sm text-gray-500">
            Structured variance narrative conforming to statutory IPMR guidelines
            {isMandatory && (
              <span className="ml-2 text-red-600 font-medium">
                — MANDATORY for this flagged account
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Account:</span>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* Metrics Summary */}
        {account && metrics && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-sm font-medium text-blue-800 mb-1">CPM Metrics Reference</div>
            <div className="grid grid-cols-4 gap-2 text-xs text-blue-700">
              <div>CV: {formatCurrency(metrics.cv)} ({metrics.cvPct.toFixed(1)}%)</div>
              <div>SV: {formatCurrency(metrics.sv)} ({metrics.svPct.toFixed(1)}%)</div>
              <div>CPI: {metrics.cpi.toFixed(3)}</div>
              <div>SPI: {metrics.spi.toFixed(3)}</div>
            </div>
          </div>
        )}

        {/* Draft with Copilot */}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {isMandatory ? '⚠ Mandatory narrative — complete all fields' : 'Optional narrative for this account'}
          </span>
          <button
            onClick={handleDraftWithCopilot}
            disabled={copiloting}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-md text-sm font-medium hover:bg-purple-200 disabled:opacity-50"
          >
            <Bot size={14} />
            {copiloting ? 'Drafting...' : 'Draft with Copilot'}
          </button>
        </div>

        {/* Root Cause Analysis */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <FileText size={14} /> Root Cause Analysis
            </h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Technical Root Cause</label>
                <textarea
                  value={narrative.rootCauseTechnical}
                  onChange={(e) => updateField('rootCauseTechnical', e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Describe the technical root cause of the variance..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Schedule Root Cause</label>
                <textarea
                  value={narrative.rootCauseSchedule}
                  onChange={(e) => updateField('rootCauseSchedule', e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Describe the schedule root cause..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cost Root Cause</label>
                <textarea
                  value={narrative.rootCauseCost}
                  onChange={(e) => updateField('rootCauseCost', e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Describe the cost root cause..."
                />
              </div>
            </div>
          </div>

          {/* Operational Impact */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <TrendingDown size={14} /> Operational Impact Assessment
            </h4>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Impact on Downstream Critical Path and Testing Gates
            </label>
            <textarea
              value={narrative.operationalImpact}
              onChange={(e) => updateField('operationalImpact', e.target.value)}
              rows={4}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Assess the impact on downstream critical path activities and testing gates..."
            />
          </div>

          {/* Corrective Action Plan */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <TrendingUp size={14} /> Corrective Action Plan
            </h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Recovery Milestones, Mitigation Owner, Target Recovery Date
                </label>
                <textarea
                  value={narrative.correctiveActionPlan}
                  onChange={(e) => updateField('correctiveActionPlan', e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Describe the corrective action plan..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Mitigation Owner</label>
                  <input
                    type="text"
                    value={narrative.mitigationOwner}
                    onChange={(e) => updateField('mitigationOwner', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Name of mitigation owner"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Target Recovery Date</label>
                  <input
                    type="date"
                    value={narrative.targetRecoveryDate}
                    onChange={(e) => updateField('targetRecoveryDate', e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Recovery Milestones</label>
                <textarea
                  value={narrative.recoveryMilestones}
                  onChange={(e) => updateField('recoveryMilestones', e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="List the recovery milestones..."
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Step 5: Digital Attestation & Formal Sign-Off
 */
function StepAttestation({
  accounts,
  onCommit,
}: {
  accounts: ControlAccount[];
  onCommit: (attestation: AttestationRecord) => void;
}) {
  const [camName, setCamName] = useState('');
  const [camSignature, setCamSignature] = useState('');
  const [camPin, setCamPin] = useState('');
  const [pclName, setPclName] = useState('');
  const [pclSignature, setPclSignature] = useState('');
  const [pclPin, setPclPin] = useState('');
  const [camSigned, setCamSigned] = useState(false);
  const [pclSigned, setPclSigned] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);

  const totalBac = accounts.reduce((sum, a) => sum + a.bac, 0);
  const totalEv = accounts.reduce((sum, a) => sum + a.ev, 0);
  const totalAc = accounts.reduce((sum, a) => sum + a.ac, 0);

  const canCamSign = camName.trim().length > 0 && camSignature.trim().length > 0 && camPin.length >= 4;
  const canPclSign = pclName.trim().length > 0 && pclSignature.trim().length > 0 && pclPin.length >= 4 && camSigned;
  const canCommit = camSigned && pclSigned;

  const handleCamSign = useCallback(() => {
    if (canCamSign) setCamSigned(true);
  }, [canCamSign]);

  const handlePclSign = useCallback(() => {
    if (canPclSign) setPclSigned(true);
  }, [canPclSign]);

  const [attestation, setAttestation] = useState<AttestationRecord | null>(null);

  const handleCommit = useCallback(async () => {
    if (!canCommit) return;
    setCommitting(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const record: AttestationRecord = {
      camName,
      camSignature,
      camPin,
      projectControlsLeadName: pclName,
      projectControlsLeadSignature: pclSignature,
      projectControlsLeadPin: pclPin,
      signedAt: new Date().toISOString(),
    };

    setAttestation(record);
    onCommit(record);
    setCommitting(false);
    setCommitted(true);
  }, [canCommit, camName, camSignature, camPin, pclName, pclSignature, pclPin, onCommit]);

  if (committed) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 max-w-lg text-center">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-green-800 mb-2">Monthly Closeout Committed</h3>
          <p className="text-sm text-green-700 mb-4">
            The monthly accounting period has been transitioned to <strong>CLOSED_LOCKED</strong>.
            The signed IPMR Format 1–5 package has been generated and the milestone has been
            logged in the forensic audit ledger.
          </p>
          <div className="text-xs text-green-600 space-y-1">
            <div>CAM: {camName} — Signed</div>
            <div>PCL: {pclName} — Counter-signed</div>
            <div>Timestamp: {attestation?.signedAt}</div>
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-green-600">
            <ShieldCheck size={14} />
            <span>MERKLE_CCB_MERGE_COMMITTED block appended to audit ledger</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Digital Attestation & Formal Sign-Off</h3>
        <p className="text-sm text-gray-500">
          Dual-signoff attestation by CAM and Project Controls Lead required to commit the monthly closeout
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* Summary */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-sm text-gray-500 mb-1">Total BAC</div>
            <div className="text-xl font-bold text-gray-900">{formatCurrency(totalBac)}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-sm text-gray-500 mb-1">Total EV</div>
            <div className="text-xl font-bold text-gray-900">{formatCurrency(totalEv)}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-sm text-gray-500 mb-1">Total AC</div>
            <div className="text-xl font-bold text-gray-900">{formatCurrency(totalAc)}</div>
          </div>
        </div>

        {/* Officer 1: CAM */}
        <div className={`mb-6 bg-white rounded-lg border-2 p-6 ${camSigned ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <User size={18} />
              Officer 1: Control Account Manager (CAM)
            </h4>
            {camSigned && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                <CheckCircle2 size={12} /> Verified & Signed
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Full Name</label>
              <input
                type="text"
                value={camName}
                onChange={(e) => setCamName(e.target.value)}
                disabled={camSigned}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                placeholder="CAM full name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Digital Signature</label>
              <input
                type="text"
                value={camSignature}
                onChange={(e) => setCamSignature(e.target.value)}
                disabled={camSigned}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                placeholder="Type full name as signature"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">PKI PIN</label>
              <input
                type="password"
                value={camPin}
                onChange={(e) => setCamPin(e.target.value)}
                disabled={camSigned}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                placeholder="Enter PKI PIN"
              />
            </div>
          </div>
          <div className="mt-4">
            <button
              onClick={handleCamSign}
              disabled={!canCamSign || camSigned}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {camSigned ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}
              {camSigned ? 'Signed' : 'Verify & Sign'}
            </button>
          </div>
        </div>

        {/* Officer 2: Project Controls Lead */}
        <div className={`mb-6 bg-white rounded-lg border-2 p-6 ${pclSigned ? 'border-green-300 bg-green-50' : !camSigned ? 'border-gray-100 bg-gray-50' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <UserCheck size={18} />
              Officer 2: Project Controls Lead
            </h4>
            {pclSigned && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                <CheckCircle2 size={12} /> Counter-signed
              </span>
            )}
            {!camSigned && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                <Lock size={12} /> Awaiting Officer 1
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Full Name</label>
              <input
                type="text"
                value={pclName}
                onChange={(e) => setPclName(e.target.value)}
                disabled={!camSigned || pclSigned}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                placeholder="PCL full name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Digital Signature</label>
              <input
                type="text"
                value={pclSignature}
                onChange={(e) => setPclSignature(e.target.value)}
                disabled={!camSigned || pclSigned}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                placeholder="Type full name as signature"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">PKI PIN</label>
              <input
                type="password"
                value={pclPin}
                onChange={(e) => setPclPin(e.target.value)}
                disabled={!camSigned || pclSigned}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                placeholder="Enter PKI PIN"
              />
            </div>
          </div>
          <div className="mt-4">
            <button
              onClick={handlePclSign}
              disabled={!canPclSign || pclSigned}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pclSigned ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}
              {pclSigned ? 'Counter-signed' : 'Counter-sign'}
            </button>
          </div>
        </div>

        {/* Commit Button */}
        {canCommit && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-blue-800">Ready to Commit Monthly Closeout</div>
                <div className="text-xs text-blue-600">
                  This will transition the period to CLOSED_LOCKED, generate IPMR Format 1–5, and log to the forensic audit ledger
                </div>
              </div>
              <button
                onClick={handleCommit}
                disabled={committing}
                className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-md text-sm font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {committing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Committing...
                  </>
                ) : (
                  <>
                    <Lock size={16} />
                    Commit Closeout
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Wizard Component
// ---------------------------------------------------------------------------

const CamEvmCloseoutWizardView: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<WizardStep>('progress');
  const [completedSteps, setCompletedSteps] = useState<Set<WizardStep>>(new Set());

  const steps: { id: WizardStep; label: string; icon: React.ElementType }[] = [
    { id: 'progress', label: 'Progress & Milestones', icon: ClipboardList },
    { id: 'labor', label: 'Labor & Cost Audit', icon: FileText },
    { id: 'evm', label: 'EVM Computation', icon: Calculator },
    { id: 'narrative', label: 'IPMR Narrative', icon: PenTool },
    { id: 'attestation', label: 'Attestation', icon: ShieldCheck },
  ];

  const stepOrder: WizardStep[] = ['progress', 'labor', 'evm', 'narrative', 'attestation'];
  const currentIndex = stepOrder.indexOf(currentStep);

  const handleNext = useCallback(() => {
    setCompletedSteps((prev) => new Set(prev).add(currentStep));
    if (currentIndex < stepOrder.length - 1) {
      setCurrentStep(stepOrder[currentIndex + 1]);
    }
  }, [currentStep, currentIndex]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1]);
    }
  }, [currentIndex]);

  const handleGoToStep = useCallback((step: WizardStep) => {
    const stepIdx = stepOrder.indexOf(step);
    // Allow navigating to completed steps or the next available step
    if (stepIdx <= currentIndex || completedSteps.has(step)) {
      setCurrentStep(step);
    }
  }, [currentIndex, completedSteps]);

  const handleCommit = useCallback((attestation: AttestationRecord) => {
    console.log('CAM EVM Closeout committed:', attestation);
    // In production, this would dispatch to POST /api/v1/evm/closeout-commit
    // and log to the forensic audit ledger
  }, []);

  const renderStep = () => {
    switch (currentStep) {
      case 'progress':
        return <StepProgressVerification accounts={MOCK_CONTROL_ACCOUNTS} />;
      case 'labor':
        return <StepLaborAudit laborEntries={MOCK_LABOR_ENTRIES} />;
      case 'evm':
        return <StepEvmComputation accounts={MOCK_CONTROL_ACCOUNTS} />;
      case 'narrative':
        return <StepIpmrNarrative accounts={MOCK_CONTROL_ACCOUNTS} />;
      case 'attestation':
        return <StepAttestation accounts={MOCK_CONTROL_ACCOUNTS} onCommit={handleCommit} />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">CAM EVM Closeout Wizard</h2>
            <p className="text-sm text-gray-500">
              Monthly Control Account Manager earned value closeout — October 2026 reporting period
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Period: Oct 2026</span>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">Draft</span>
          </div>
        </div>
      </div>

      {/* Step Navigation */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-0">
          {steps.map((step, index) => {
            const stepIdx = stepOrder.indexOf(step.id);
            const isActive = step.id === currentStep;
            const isCompleted = completedSteps.has(step.id);
            const isReachable = stepIdx <= currentIndex || isCompleted;

            return (
              <React.Fragment key={step.id}>
                {index > 0 && (
                  <div className={`w-8 flex items-center justify-center ${
                    stepIdx <= currentIndex ? 'text-blue-500' : 'text-gray-300'
                  }`}>
                    <ChevronRight size={16} />
                  </div>
                )}
                <button
                  onClick={() => isReachable && handleGoToStep(step.id)}
                  disabled={!isReachable}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-100 text-blue-700'
                      : isCompleted
                        ? 'text-green-600 hover:bg-green-50'
                        : isReachable
                          ? 'text-gray-700 hover:bg-gray-100'
                          : 'text-gray-300 cursor-not-allowed'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 size={16} />
                  ) : isActive ? (
                    <step.icon size={16} />
                  ) : (
                    <Circle size={16} />
                  )}
                  <span className="hidden sm:inline">{step.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-hidden">
        {renderStep()}
      </div>

      {/* Footer Navigation */}
      <div className="bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between">
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={16} />
          Previous
        </button>

        <div className="text-sm text-gray-500">
          Step {currentIndex + 1} of {stepOrder.length}
        </div>

        {currentIndex < stepOrder.length - 1 ? (
          <button
            onClick={handleNext}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Next
            <ChevronRight size={16} />
          </button>
        ) : (
          <div className="text-sm text-gray-400">Final step</div>
        )}
      </div>
    </div>
  );
};

export default CamEvmCloseoutWizardView;
