/**
 * Programme Scenario Sandtable — Advanced Interactive What-If Simulation
 *
 * Target route: /sandboxes/sandtable
 *
 * Provides a dual-pane split canvas for isolated schedule warping experiments:
 *
 * 1. **Dual-Pane Split Canvas** — Upper pane shows the interactive Master Schedule
 *    (Baseline / Live). Lower pane shows the Sandbox Simulation Branch (isolated
 *    what-if model). Synchronized zoom, panning, and timescale headers across both panes.
 *
 * 2. **Interactive Schedule Warping Controls** — Shock Event Injectors (ribbon chunk):
 *    - 'Inject Supplier Delay': Slips all tasks linked to a specific subcontractor CAGE
 *      by +N days.
 *    - 'Range / Chamber Stoppage': Injects non-working blackout windows across test
 *      facilities.
 *    - 'Budget Cut Truncation': Clamps fiscal year spend to evaluate forced scope
 *      de-commitments.
 *
 * 3. **Comparative Delta HUD** — Floating telemetry bar calculating live deltas:
 *    - Completion Date Slippage (Δdays).
 *    - Total Program EAC Variance (ΔCost).
 *    - Monte Carlo P80 Confidence Shift (e.g., 'P80 slips from 14-Oct-2028 to 22-Jan-2029').
 *    - Milestone Variance Matrix displaying side-by-side dates for key contract gates.
 *
 * 4. **Sandbox Branch Promotion** — Button: [Submit to Change Control Board] formats
 *    the delta into a formal Baseline Change Request (BCR) package ready for formal
 *    governance approval.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  GitBranch,
  GitFork,
  Zap,
  AlertTriangle,
  DollarSign,
  Calendar,
  Clock,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Send,
  RotateCcw,
  Play,
  Pause,
  ChevronRight,
  ChevronDown,
  X,
  Plus,
  Minus,
  Activity,
  Target,
  FileText,
  CheckCircle2,
  AlertOctagon,
  TriangleAlert,
  Info,
  Layers,
  Split,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Settings2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A schedule task node in the sandtable */
interface SandtableTask {
  id: string;
  code: string;
  name: string;
  plannedStart: string; // ISO date
  plannedEnd: string; // ISO date
  baselineStart: string;
  baselineEnd: string;
  duration: number; // days
  percentComplete: number;
  predecessorIds: string[];
  successorIds: string[];
  subcontractorCage?: string;
  isMilestone: boolean;
  isContractGate: boolean;
  milestoneLabel?: string;
  estimatedCost: number;
  actualCost: number;
  budgetedCost: number;
  level: number; // WBS depth
}

/** A shock event applied to the sandbox */
interface ShockEvent {
  id: string;
  type: 'SUPPLIER_DELAY' | 'RANGE_STOPPAGE' | 'BUDGET_CUT';
  label: string;
  timestamp: string;
  parameters: Record<string, unknown>;
  affectedTaskIds: string[];
  deltaDays: number;
  deltaCost: number;
}

/** Delta metrics comparing sandbox vs baseline */
interface DeltaMetrics {
  completionDateSlippage: number; // days
  originalCompletionDate: string;
  sandboxCompletionDate: string;
  eacVariance: number; // currency
  originalEAC: number;
  sandboxEAC: number;
  p80OriginalDate: string;
  p80SandboxDate: string;
  p80Shift: number; // days
  milestoneVariances: MilestoneVariance[];
}

/** Milestone variance entry */
interface MilestoneVariance {
  milestoneId: string;
  milestoneLabel: string;
  baselineDate: string;
  sandboxDate: string;
  varianceDays: number;
  isContractGate: boolean;
  isBreached: boolean;
}

/** Zoom level for timeline headers */
type ZoomLevel = 'DAYS' | 'WEEKS' | 'MONTHS';

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_TASKS: SandtableTask[] = [
  {
    id: 'task-001', code: '1.0', name: 'Programme Start',
    plannedStart: '2026-01-01', plannedEnd: '2026-01-01',
    baselineStart: '2026-01-01', baselineEnd: '2026-01-01',
    duration: 0, percentComplete: 100, predecessorIds: [], successorIds: ['task-002'],
    isMilestone: true, isContractGate: true, milestoneLabel: 'P01 Programme Start',
    estimatedCost: 0, actualCost: 0, budgetedCost: 0, level: 0,
  },
  {
    id: 'task-002', code: '1.1', name: 'Requirements Definition',
    plannedStart: '2026-01-02', plannedEnd: '2026-04-30',
    baselineStart: '2026-01-02', baselineEnd: '2026-04-30',
    duration: 100, percentComplete: 100, predecessorIds: ['task-001'], successorIds: ['task-003', 'task-004'],
    subcontractorCage: '1A2B3', isMilestone: false, isContractGate: false,
    estimatedCost: 2500000, actualCost: 2450000, budgetedCost: 2500000, level: 1,
  },
  {
    id: 'task-003', code: '1.2', name: 'Design Phase',
    plannedStart: '2026-05-01', plannedEnd: '2026-10-31',
    baselineStart: '2026-05-01', baselineEnd: '2026-10-31',
    duration: 150, percentComplete: 80, predecessorIds: ['task-002'], successorIds: ['task-005'],
    subcontractorCage: '4C5D6', isMilestone: false, isContractGate: false,
    estimatedCost: 5000000, actualCost: 4200000, budgetedCost: 4800000, level: 1,
  },
  {
    id: 'task-004', code: '1.2.1', name: 'Subcontractor Procurement',
    plannedStart: '2026-05-01', plannedEnd: '2026-07-31',
    baselineStart: '2026-05-01', baselineEnd: '2026-07-31',
    duration: 80, percentComplete: 60, predecessorIds: ['task-002'], successorIds: ['task-003'],
    subcontractorCage: '7E8F9', isMilestone: false, isContractGate: false,
    estimatedCost: 1500000, actualCost: 900000, budgetedCost: 1200000, level: 2,
  },
  {
    id: 'task-005', code: '1.3', name: 'Integration Testing',
    plannedStart: '2026-11-01', plannedEnd: '2027-04-30',
    baselineStart: '2026-11-01', baselineEnd: '2027-04-30',
    duration: 170, percentComplete: 20, predecessorIds: ['task-003'], successorIds: ['task-006'],
    subcontractorCage: '4C5D6', isMilestone: false, isContractGate: false,
    estimatedCost: 8000000, actualCost: 1600000, budgetedCost: 2000000, level: 1,
  },
  {
    id: 'task-006', code: '1.3.1', name: 'Range Testing Campaign',
    plannedStart: '2027-01-01', plannedEnd: '2027-03-31',
    baselineStart: '2027-01-01', baselineEnd: '2027-03-31',
    duration: 85, percentComplete: 0, predecessorIds: ['task-005'], successorIds: ['task-007'],
    subcontractorCage: '1A2B3', isMilestone: false, isContractGate: false,
    estimatedCost: 3000000, actualCost: 0, budgetedCost: 0, level: 2,
  },
  {
    id: 'task-007', code: '1.4', name: 'System Acceptance Review',
    plannedStart: '2027-05-01', plannedEnd: '2027-06-30',
    baselineStart: '2027-05-01', baselineEnd: '2027-06-30',
    duration: 55, percentComplete: 0, predecessorIds: ['task-006'], successorIds: ['task-008'],
    isMilestone: false, isContractGate: false,
    estimatedCost: 2000000, actualCost: 0, budgetedCost: 0, level: 1,
  },
  {
    id: 'task-008', code: 'M-01', name: 'Critical Design Review',
    plannedStart: '2027-07-01', plannedEnd: '2027-07-01',
    baselineStart: '2027-07-01', baselineEnd: '2027-07-01',
    duration: 0, percentComplete: 0, predecessorIds: ['task-007'], successorIds: ['task-009'],
    isMilestone: true, isContractGate: true, milestoneLabel: 'M-01 Critical Design Review',
    estimatedCost: 0, actualCost: 0, budgetedCost: 0, level: 1,
  },
  {
    id: 'task-009', code: '1.5', name: 'Production & Deployment',
    plannedStart: '2027-07-02', plannedEnd: '2028-06-30',
    baselineStart: '2027-07-02', baselineEnd: '2028-06-30',
    duration: 350, percentComplete: 0, predecessorIds: ['task-008'], successorIds: ['task-010'],
    subcontractorCage: '7E8F9', isMilestone: false, isContractGate: false,
    estimatedCost: 15000000, actualCost: 0, budgetedCost: 0, level: 1,
  },
  {
    id: 'task-010', code: 'M-04', name: 'System Handover',
    plannedStart: '2028-07-01', plannedEnd: '2028-07-01',
    baselineStart: '2028-07-01', baselineEnd: '2028-07-01',
    duration: 0, percentComplete: 0, predecessorIds: ['task-009'], successorIds: [],
    isMilestone: true, isContractGate: true, milestoneLabel: 'M-04 System Handover',
    estimatedCost: 0, actualCost: 0, budgetedCost: 0, level: 1,
  },
];

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addWorkingDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  const sign = days >= 0 ? 1 : -1;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    d.setDate(d.getDate() + sign);
    if (d.getDay() !== 0 && d.getDay() !== 6) remaining--;
  }
  return formatDate(d);
}

function daysBetween(dateStr1: string, dateStr2: string): number {
  const d1 = parseDate(dateStr1);
  const d2 = parseDate(dateStr2);
  if (!d1 || !d2) return 0;
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `£${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `£${(value / 1_000).toFixed(0)}K`;
  }
  return `£${value.toFixed(0)}`;
}

function formatShortDate(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

/**
 * Shock Event Injector Ribbon
 *
 * Provides three shock event types that can be applied to the sandbox:
 * - Supplier Delay: Slips tasks linked to a subcontractor CAGE
 * - Range Stoppage: Injects blackout windows
 * - Budget Cut: Clamps fiscal year spend
 */
const ShockEventRibbon: React.FC<{
  tasks: SandtableTask[];
  onApplyShock: (shock: ShockEvent) => void;
  appliedShocks: ShockEvent[];
}> = ({ tasks, onApplyShock, appliedShocks }) => {
  const [supplierCage, setSupplierCage] = useState('');
  const [delayDays, setDelayDays] = useState(14);
  const [stoppageStart, setStoppageStart] = useState('2027-01-15');
  const [stoppageEnd, setStoppageEnd] = useState('2027-02-28');
  const [budgetPercent, setBudgetPercent] = useState(80);
  const [expanded, setExpanded] = useState(false);

  // Collect unique CAGE codes from tasks
  const cageCodes = useMemo(() => {
    const cages = new Set<string>();
    for (const t of tasks) {
      if (t.subcontractorCage) cages.add(t.subcontractorCage);
    }
    return Array.from(cages);
  }, [tasks]);

  const handleSupplierDelay = () => {
    const affectedTasks = tasks.filter(t => t.subcontractorCage === supplierCage);
    if (affectedTasks.length === 0) return;

    const shock: ShockEvent = {
      id: `shock-supplier-${Date.now()}`,
      type: 'SUPPLIER_DELAY',
      label: `Supplier Delay: ${supplierCage} (+${delayDays}d)`,
      timestamp: new Date().toISOString(),
      parameters: { cageCode: supplierCage, delayDays },
      affectedTaskIds: affectedTasks.map(t => t.id),
      deltaDays: delayDays,
      deltaCost: affectedTasks.reduce((sum, t) => sum + t.estimatedCost * 0.05, 0),
    };
    onApplyShock(shock);
  };

  const handleRangeStoppage = () => {
    const stoppageStartD = parseDate(stoppageStart);
    const stoppageEndD = parseDate(stoppageEnd);
    if (!stoppageStartD || !stoppageEndD) return;

    const affectedTasks = tasks.filter(t => {
      const tStart = parseDate(t.plannedStart);
      const tEnd = parseDate(t.plannedEnd);
      if (!tStart || !tEnd) return false;
      return tStart <= stoppageEndD && tEnd >= stoppageStartD;
    });

    const days = daysBetween(stoppageStart, stoppageEnd);
    const shock: ShockEvent = {
      id: `shock-range-${Date.now()}`,
      type: 'RANGE_STOPPAGE',
      label: `Range Stoppage: ${formatShortDate(stoppageStart)} → ${formatShortDate(stoppageEnd)}`,
      timestamp: new Date().toISOString(),
      parameters: { stoppageStart, stoppageEnd, days },
      affectedTaskIds: affectedTasks.map(t => t.id),
      deltaDays: days,
      deltaCost: affectedTasks.reduce((sum, t) => sum + t.estimatedCost * 0.1, 0),
    };
    onApplyShock(shock);
  };

  const handleBudgetCut = () => {
    const affectedTasks = tasks.filter(t => t.estimatedCost > 0);
    const cutAmount = affectedTasks.reduce((sum, t) => {
      return sum + t.estimatedCost * (1 - budgetPercent / 100);
    }, 0);

    const shock: ShockEvent = {
      id: `shock-budget-${Date.now()}`,
      type: 'BUDGET_CUT',
      label: `Budget Cut: ${budgetPercent}% of FY allocation`,
      timestamp: new Date().toISOString(),
      parameters: { budgetPercent, cutAmount },
      affectedTaskIds: affectedTasks.map(t => t.id),
      deltaDays: Math.round(affectedTasks.reduce((sum, t) => sum + t.duration * (1 - budgetPercent / 100) * 0.5, 0)),
      deltaCost: -cutAmount,
    };
    onApplyShock(shock);
  };

  return (
    <div className="border-b border-border-ops-subtle bg-bg-ops-surface">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Zap size={14} className="text-amber-400" />
        <span className="font-medium">Shock Event Injectors</span>
        {appliedShocks.length > 0 && (
          <span className="ml-auto bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-full">
            {appliedShocks.length} active
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Supplier Delay */}
          <div className="p-3 rounded-lg bg-bg-ops-base border border-border-ops-subtle space-y-2">
            <div className="flex items-center gap-2 text-sm text-text-ops-primary">
              <AlertTriangle size={14} className="text-amber-400" />
              <span className="font-medium">Inject Supplier Delay</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={supplierCage}
                onChange={(e) => setSupplierCage(e.target.value)}
                className="flex-1 bg-bg-ops-surface border border-border-ops-subtle rounded px-2 py-1 text-sm text-text-ops-primary"
              >
                <option value="">Select subcontractor CAGE...</option>
                {cageCodes.map(cage => (
                  <option key={cage} value={cage}>CAGE: {cage}</option>
                ))}
              </select>
              <input
                type="number"
                value={delayDays}
                onChange={(e) => setDelayDays(Number(e.target.value))}
                className="w-20 bg-bg-ops-surface border border-border-ops-subtle rounded px-2 py-1 text-sm text-text-ops-primary text-center"
                min={1}
                max={365}
              />
              <span className="text-xs text-text-ops-muted">days</span>
              <button
                onClick={handleSupplierDelay}
                disabled={!supplierCage}
                className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded text-xs font-medium hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Apply
              </button>
            </div>
          </div>

          {/* Range Stoppage */}
          <div className="p-3 rounded-lg bg-bg-ops-base border border-border-ops-subtle space-y-2">
            <div className="flex items-center gap-2 text-sm text-text-ops-primary">
              <Pause size={14} className="text-red-400" />
              <span className="font-medium">Range / Chamber Stoppage</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={stoppageStart}
                onChange={(e) => setStoppageStart(e.target.value)}
                className="flex-1 bg-bg-ops-surface border border-border-ops-subtle rounded px-2 py-1 text-sm text-text-ops-primary"
              />
              <span className="text-xs text-text-ops-muted">→</span>
              <input
                type="date"
                value={stoppageEnd}
                onChange={(e) => setStoppageEnd(e.target.value)}
                className="flex-1 bg-bg-ops-surface border border-border-ops-subtle rounded px-2 py-1 text-sm text-text-ops-primary"
              />
              <button
                onClick={handleRangeStoppage}
                className="px-3 py-1 bg-red-500/20 text-red-400 rounded text-xs font-medium hover:bg-red-500/30"
              >
                Apply
              </button>
            </div>
          </div>

          {/* Budget Cut */}
          <div className="p-3 rounded-lg bg-bg-ops-base border border-border-ops-subtle space-y-2">
            <div className="flex items-center gap-2 text-sm text-text-ops-primary">
              <DollarSign size={14} className="text-emerald-400" />
              <span className="font-medium">Budget Cut Truncation</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={50}
                max={100}
                value={budgetPercent}
                onChange={(e) => setBudgetPercent(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm text-text-ops-primary w-12 text-right">{budgetPercent}%</span>
              <button
                onClick={handleBudgetCut}
                className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs font-medium hover:bg-emerald-500/30"
              >
                Apply
              </button>
            </div>
          </div>

          {/* Applied Shocks List */}
          {appliedShocks.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs text-text-ops-muted font-medium">Applied Shocks:</span>
              {appliedShocks.map(shock => (
                <div key={shock.id} className="flex items-center gap-2 text-xs text-text-ops-muted px-2 py-1 bg-bg-ops-overlay rounded">
                  {shock.type === 'SUPPLIER_DELAY' && <AlertTriangle size={10} className="text-amber-400" />}
                  {shock.type === 'RANGE_STOPPAGE' && <Pause size={10} className="text-red-400" />}
                  {shock.type === 'BUDGET_CUT' && <DollarSign size={10} className="text-emerald-400" />}
                  <span>{shock.label}</span>
                  <span className="ml-auto text-amber-400">+{shock.deltaDays}d</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Gantt-style task bar for sandtable panes
 */
const SandtableBar: React.FC<{
  task: SandtableTask;
  dateToX: (dateStr: string) => number;
  rowHeight: number;
  barHeight: number;
  isBaseline?: boolean;
  isSandbox?: boolean;
  isAffected?: boolean;
}> = React.memo(({
  task, dateToX, rowHeight, barHeight, isBaseline, isSandbox, isAffected,
}) => {
  const xStart = dateToX(task.plannedStart);
  const xEnd = dateToX(task.plannedEnd);
  const width = Math.max(2, xEnd - xStart);
  const y = (rowHeight - barHeight) / 2;

  // Color scheme
  let bgColor = 'bg-sky-500';
  let borderColor = 'border-sky-400';

  if (isBaseline) {
    bgColor = 'bg-slate-500/40';
    borderColor = 'border-slate-400/40';
  } else if (isSandbox) {
    if (isAffected) {
      bgColor = 'bg-amber-500';
      borderColor = 'border-amber-400';
    } else {
      bgColor = 'bg-violet-500';
      borderColor = 'border-violet-400';
    }
  }

  if (task.isMilestone) {
    return (
      <div
        style={{
          position: 'absolute',
          left: `${xStart - 4}px`,
          top: `${y}px`,
          width: '8px',
          height: `${barHeight + 4}px`,
          transform: 'rotate(45deg)',
        }}
        className={clsx(
          'rounded-sm border',
          isBaseline ? 'bg-slate-400/40 border-slate-300/40' :
          isSandbox && isAffected ? 'bg-amber-500 border-amber-400' :
          isSandbox ? 'bg-violet-500 border-violet-400' :
          'bg-sky-500 border-sky-400',
        )}
        title={`${task.code} ${task.name || task.milestoneLabel}`}
      />
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: `${xStart}px`,
        top: `${y}px`,
        width: `${width}px`,
        height: `${barHeight}px`,
      }}
      className={clsx(
        'rounded-sm border',
        bgColor,
        borderColor,
        isBaseline && 'opacity-50',
        isSandbox && isAffected && 'ring-1 ring-amber-300/50',
      )}
      title={`${task.code} ${task.name} (${task.duration}d)`}
    >
      {/* Progress fill */}
      {task.percentComplete > 0 && (
        <div
          style={{ width: `${task.percentComplete}%` }}
          className={clsx(
            'h-full rounded-sm',
            isBaseline ? 'bg-slate-400/30' :
            isSandbox && isAffected ? 'bg-amber-400/40' :
            isSandbox ? 'bg-violet-400/40' :
            'bg-sky-400/40',
          )}
        />
      )}
    </div>
  );
});

/**
 * Mini Gantt pane showing tasks for a given set of tasks
 */
const SandtablePane: React.FC<{
  title: string;
  tasks: SandtableTask[];
  zoom: ZoomLevel;
  startDate: Date;
  endDate: Date;
  dateToX: (dateStr: string) => number;
  affectedTaskIds: Set<string>;
  showBaseline?: boolean;
  isSandbox?: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
}> = React.memo(({
  title, tasks, zoom, startDate, endDate, dateToX, affectedTaskIds,
  showBaseline, isSandbox, onZoomIn, onZoomOut,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowHeight = 32;
  const barHeight = 18;
  const pixelsPerDay = zoom === 'DAYS' ? 4 : zoom === 'WEEKS' ? 2 : 0.5;
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const timelineWidth = totalDays * pixelsPerDay;

  // Generate timeline header dates
  const timelineDates = useMemo(() => {
    const dates: { date: Date; label: string; isMajor: boolean }[] = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      const dow = current.getDay();
      const day = current.getDate();
      let label = '';
      let isMajor = false;

      switch (zoom) {
        case 'DAYS':
          label = String(day);
          isMajor = dow === 1;
          break;
        case 'WEEKS':
          if (dow === 1) {
            const d = new Date(Date.UTC(current.getFullYear(), current.getMonth(), current.getDate()));
            const dayNum = d.getUTCDay() || 7;
            d.setUTCDate(d.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
            label = `W${weekNum}`;
            isMajor = day <= 7;
          }
          break;
        case 'MONTHS':
          if (day === 1) {
            const monthName = current.toLocaleString('en-GB', { month: 'short' });
            const year = String(current.getFullYear()).slice(-2);
            label = `${monthName} '${year}`;
            isMajor = true;
          }
          break;
      }

      if (label) {
        dates.push({ date: new Date(current), label, isMajor });
      }
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }, [startDate, endDate, zoom]);

  return (
    <div ref={containerRef} className="flex flex-col h-full border border-border-ops-subtle rounded-lg overflow-hidden">
      {/* Pane header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-ops-surface border-b border-border-ops-subtle">
        {isSandbox ? <GitFork size={12} className="text-violet-400" /> : <Layers size={12} className="text-sky-400" />}
        <span className="text-xs font-medium text-text-ops-primary">{title}</span>
        <div className="flex-1" />
        <span className="text-[10px] text-text-ops-muted uppercase">{zoom}</span>
        <button onClick={onZoomOut} className="p-0.5 hover:bg-bg-ops-overlay rounded text-text-ops-muted">
          <Minus size={10} />
        </button>
        <button onClick={onZoomIn} className="p-0.5 hover:bg-bg-ops-overlay rounded text-text-ops-muted">
          <Plus size={10} />
        </button>
      </div>

      {/* Timeline header */}
      <div className="h-7 bg-bg-ops-surface border-b border-border-ops-subtle overflow-hidden flex-shrink-0">
        <div style={{ position: 'relative', height: '100%', width: `${timelineWidth}px` }}>
          {timelineDates.map((td, i) => {
            const x = dateToX(formatDate(td.date));
            if (x < 0) return null;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${x}px`,
                  top: 0,
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderLeft: td.isMajor ? '1px solid var(--border-ops-strong, #475569)' : '1px solid var(--border-ops-subtle, #334155)',
                  paddingLeft: '4px',
                  minWidth: zoom === 'DAYS' ? 20 : zoom === 'WEEKS' ? 14 : 10,
                }}
              >
                <span style={{ fontSize: '9px', color: td.isMajor ? '#F8FAFC' : '#94A3B8', fontFamily: 'var(--font-mono, ui-monospace, monospace)', whiteSpace: 'nowrap' }}>
                  {td.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Task bars area */}
      <div className="flex-1 overflow-auto" style={{ minWidth: `${timelineWidth}px` }}>
        <div style={{ position: 'relative', height: `${tasks.length * rowHeight}px`, width: `${timelineWidth}px` }}>
          {/* Grid lines */}
          {timelineDates.map((td, i) => {
            const x = dateToX(formatDate(td.date));
            if (x < 0) return null;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${x}px`,
                  top: 0,
                  bottom: 0,
                  width: '1px',
                  backgroundColor: td.isMajor ? 'var(--border-ops-strong, #475569)' : 'var(--border-ops-subtle, #334155)',
                  opacity: td.isMajor ? 0.5 : 0.2,
                }}
              />
            );
          })}

          {/* Task bars */}
          {tasks.map((task, index) => {
            const y = index * rowHeight;
            const isAffected = affectedTaskIds.has(task.id);

            return (
              <div
                key={task.id}
                style={{
                  position: 'absolute',
                  top: `${y}px`,
                  left: 0,
                  width: `${timelineWidth}px`,
                  height: `${rowHeight}px`,
                  borderBottom: '1px solid var(--border-ops-subtle, #334155)',
                  boxSizing: 'border-box',
                }}
              >
                {/* Baseline bar (shown in sandbox pane for comparison) */}
                {showBaseline && (
                  <SandtableBar
                    task={{ ...task, plannedStart: task.baselineStart, plannedEnd: task.baselineEnd }}
                    dateToX={dateToX}
                    rowHeight={rowHeight}
                    barHeight={barHeight}
                    isBaseline
                  />
                )}

                {/* Current bar */}
                <SandtableBar
                  task={task}
                  dateToX={dateToX}
                  rowHeight={rowHeight}
                  barHeight={barHeight}
                  isSandbox={isSandbox}
                  isAffected={isAffected}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

/**
 * Comparative Delta HUD — Floating telemetry bar
 */
const DeltaHUD: React.FC<{
  metrics: DeltaMetrics;
  visible: boolean;
}> = ({ metrics, visible }) => {
  if (!visible) return null;

  return (
    <div className="border border-border-ops-subtle bg-bg-ops-surface rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2 text-sm text-text-ops-primary">
        <Activity size={14} className="text-sky-400" />
        <span className="font-medium">Comparative Delta Telemetry</span>
      </div>

      {/* Completion Date Slippage */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-2 rounded bg-bg-ops-base border border-border-ops-subtle">
          <div className="flex items-center gap-1.5 text-xs text-text-ops-muted mb-1">
            <Calendar size={10} />
            <span>Completion Date</span>
          </div>
          <div className={clsx(
            'text-lg font-bold font-mono',
            metrics.completionDateSlippage > 0 ? 'text-red-400' :
            metrics.completionDateSlippage < 0 ? 'text-emerald-400' : 'text-text-ops-primary',
          )}>
            {metrics.completionDateSlippage > 0 ? '+' : ''}{metrics.completionDateSlippage}d
          </div>
          <div className="text-[10px] text-text-ops-muted mt-0.5">
            {formatShortDate(metrics.originalCompletionDate)} → {formatShortDate(metrics.sandboxCompletionDate)}
          </div>
        </div>

        {/* EAC Variance */}
        <div className="p-2 rounded bg-bg-ops-base border border-border-ops-subtle">
          <div className="flex items-center gap-1.5 text-xs text-text-ops-muted mb-1">
            <DollarSign size={10} />
            <span>Program EAC</span>
          </div>
          <div className={clsx(
            'text-lg font-bold font-mono',
            metrics.eacVariance > 0 ? 'text-red-400' :
            metrics.eacVariance < 0 ? 'text-emerald-400' : 'text-text-ops-primary',
          )}>
            {metrics.eacVariance > 0 ? '+' : ''}{formatCurrency(metrics.eacVariance)}
          </div>
          <div className="text-[10px] text-text-ops-muted mt-0.5">
            {formatCurrency(metrics.originalEAC)} → {formatCurrency(metrics.sandboxEAC)}
          </div>
        </div>

        {/* Monte Carlo P80 */}
        <div className="p-2 rounded bg-bg-ops-base border border-border-ops-subtle">
          <div className="flex items-center gap-1.5 text-xs text-text-ops-muted mb-1">
            <Target size={10} />
            <span>Monte Carlo P80</span>
          </div>
          <div className={clsx(
            'text-lg font-bold font-mono',
            metrics.p80Shift > 0 ? 'text-amber-400' : 'text-text-ops-primary',
          )}>
            {metrics.p80Shift > 0 ? '+P80' : 'P80'}
          </div>
          <div className="text-[10px] text-text-ops-muted mt-0.5">
            {formatShortDate(metrics.p80OriginalDate)} → {formatShortDate(metrics.p80SandboxDate)}
          </div>
          {metrics.p80Shift > 0 && (
            <div className="text-[10px] text-amber-400 mt-0.5">
              P80 slips by {metrics.p80Shift}d
            </div>
          )}
        </div>
      </div>

      {/* Milestone Variance Matrix */}
      {metrics.milestoneVariances.length > 0 && (
        <div className="border-t border-border-ops-subtle pt-2">
          <div className="text-xs text-text-ops-muted font-medium mb-2">Milestone Variance Matrix</div>
          <div className="space-y-1">
            {metrics.milestoneVariances.map(mv => (
              <div
                key={mv.milestoneId}
                className={clsx(
                  'flex items-center gap-2 text-xs px-2 py-1 rounded',
                  mv.isBreached ? 'bg-red-500/10 border border-red-500/30' :
                  mv.varianceDays !== 0 ? 'bg-amber-500/10 border border-amber-500/30' :
                  'bg-bg-ops-base border border-border-ops-subtle',
                )}
              >
                {mv.isBreached ? <AlertOctagon size={10} className="text-red-400" /> :
                 mv.varianceDays > 0 ? <ArrowDownRight size={10} className="text-amber-400" /> :
                 mv.varianceDays < 0 ? <ArrowUpRight size={10} className="text-emerald-400" /> :
                 <CheckCircle2 size={10} className="text-emerald-400" />}
                <span className="font-medium text-text-ops-primary">{mv.milestoneLabel}</span>
                {mv.isContractGate && <ShieldAlert size={10} className="text-sky-400" />}
                <span className="text-text-ops-muted">{formatShortDate(mv.baselineDate)}</span>
                <span className="text-text-ops-muted">→</span>
                <span className={clsx(
                  mv.isBreached ? 'text-red-400' :
                  mv.varianceDays > 0 ? 'text-amber-400' : 'text-text-ops-primary',
                )}>
                  {formatShortDate(mv.sandboxDate)}
                </span>
                <span className="ml-auto font-mono text-[10px]">
                  {mv.varianceDays > 0 ? '+' : ''}{mv.varianceDays}d
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * BCR (Baseline Change Request) submission modal
 */
const BCRSubmissionModal: React.FC<{
  metrics: DeltaMetrics;
  shockEvents: ShockEvent[];
  onSubmit: () => void;
  onClose: () => void;
}> = ({ metrics, shockEvents, onSubmit, onClose }) => {
  const [officerName, setOfficerName] = useState('');
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    setSubmitting(false);
    onSubmit();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg-ops-surface border border-border-ops-subtle rounded-lg shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-ops-subtle">
          <div className="flex items-center gap-2 text-sm text-text-ops-primary">
            <FileText size={14} className="text-sky-400" />
            <span className="font-medium">Baseline Change Request (BCR) Package</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-bg-ops-overlay rounded text-text-ops-muted">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-4">
          {/* Summary */}
          <div className="p-3 rounded bg-bg-ops-base border border-border-ops-subtle space-y-2">
            <div className="text-xs text-text-ops-muted font-medium">Sandbox Delta Summary</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-text-ops-muted">Completion Slippage:</span>
                <span className={clsx(
                  ' ml-1 font-mono font-bold',
                  metrics.completionDateSlippage > 0 ? 'text-red-400' : 'text-emerald-400',
                )}>
                  {metrics.completionDateSlippage > 0 ? '+' : ''}{metrics.completionDateSlippage}d
                </span>
              </div>
              <div>
                <span className="text-text-ops-muted">EAC Variance:</span>
                <span className={clsx(
                  ' ml-1 font-mono font-bold',
                  metrics.eacVariance > 0 ? 'text-red-400' : 'text-emerald-400',
                )}>
                  {formatCurrency(metrics.eacVariance)}
                </span>
              </div>
              <div>
                <span className="text-text-ops-muted">Shock Events:</span>
                <span className="ml-1 font-mono text-text-ops-primary">{shockEvents.length}</span>
              </div>
              <div>
                <span className="text-text-ops-muted">Breached Gates:</span>
                <span className="ml-1 font-mono text-red-400">
                  {metrics.milestoneVariances.filter(mv => mv.isBreached).length}
                </span>
              </div>
            </div>
          </div>

          {/* Shock Events */}
          {shockEvents.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-text-ops-muted font-medium">Applied Shock Events</div>
              {shockEvents.map(shock => (
                <div key={shock.id} className="text-xs text-text-ops-primary px-2 py-1 bg-bg-ops-overlay rounded">
                  {shock.label}
                </div>
              ))}
            </div>
          )}

          {/* Officer fields */}
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-text-ops-muted mb-1">Officer Name</label>
              <input
                type="text"
                value={officerName}
                onChange={(e) => setOfficerName(e.target.value)}
                placeholder="Enter your name..."
                className="w-full bg-bg-ops-base border border-border-ops-subtle rounded px-3 py-1.5 text-sm text-text-ops-primary placeholder:text-text-ops-muted"
              />
            </div>
            <div>
              <label className="block text-xs text-text-ops-muted mb-1">Justification</label>
              <textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Provide justification for this baseline change..."
                rows={3}
                className="w-full bg-bg-ops-base border border-border-ops-subtle rounded px-3 py-1.5 text-sm text-text-ops-primary placeholder:text-text-ops-muted resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-ops-subtle">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!officerName || !justification || submitting}
            className="px-4 py-1.5 bg-sky-500/20 text-sky-400 rounded text-xs font-medium hover:bg-sky-500/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {submitting ? (
              <>
                <div className="w-3 h-3 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send size={12} />
                Submit to Change Control Board
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const ScenarioSandtableView: React.FC = () => {
  const [tasks, setTasks] = useState<SandtableTask[]>(MOCK_TASKS);
  const [sandboxTasks, setSandboxTasks] = useState<SandtableTask[]>(MOCK_TASKS);
  const [shockEvents, setShockEvents] = useState<ShockEvent[]>([]);
  const [zoom, setZoom] = useState<ZoomLevel>('WEEKS');
  const [showDeltaHUD, setShowDeltaHUD] = useState(true);
  const [showBCRModal, setShowBCRModal] = useState(false);
  const [showBaselineInSandbox, setShowBaselineInSandbox] = useState(true);

  // Compute date range from tasks
  const { startDate, endDate } = useMemo(() => {
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    for (const task of tasks) {
      const start = parseDate(task.plannedStart);
      const end = parseDate(task.plannedEnd);
      if (start && (!minDate || start < minDate)) minDate = start;
      if (end && (!maxDate || end > maxDate)) maxDate = end;
    }

    if (!minDate || !maxDate) {
      minDate = new Date('2026-01-01');
      maxDate = new Date('2028-12-31');
    }

    // Add 10% padding
    const padding = (maxDate.getTime() - minDate.getTime()) * 0.1;
    return {
      startDate: new Date(minDate.getTime() - padding),
      endDate: new Date(maxDate.getTime() + padding),
    };
  }, [tasks]);

  // Date-to-pixel conversion
  const pixelsPerDay = zoom === 'DAYS' ? 4 : zoom === 'WEEKS' ? 2 : 0.5;
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  const dateToX = useCallback((dateStr: string): number => {
    const d = parseDate(dateStr);
    if (!d) return 0;
    const diffMs = d.getTime() - startDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays * pixelsPerDay;
  }, [startDate, pixelsPerDay]);

  // Affected task IDs from shock events
  const affectedTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const shock of shockEvents) {
      for (const id of shock.affectedTaskIds) {
        ids.add(id);
      }
    }
    return ids;
  }, [shockEvents]);

  // Apply shock event to sandbox tasks
  const handleApplyShock = useCallback((shock: ShockEvent) => {
    setShockEvents(prev => [...prev, shock]);

    setSandboxTasks(prev => {
      const updated = [...prev];
      for (const task of updated) {
        if (shock.affectedTaskIds.includes(task.id)) {
          switch (shock.type) {
            case 'SUPPLIER_DELAY': {
              const days = shock.deltaDays;
              task.plannedStart = addWorkingDays(task.plannedStart, days);
              task.plannedEnd = addWorkingDays(task.plannedEnd, days);
              break;
            }
            case 'RANGE_STOPPAGE': {
              const days = shock.deltaDays;
              task.plannedStart = addWorkingDays(task.plannedStart, days);
              task.plannedEnd = addWorkingDays(task.plannedEnd, days);
              break;
            }
            case 'BUDGET_CUT': {
              // Budget cuts reduce scope — shorten duration proportionally
              const percent = (shock.parameters.budgetPercent as number) / 100;
              const newDuration = Math.round(task.duration * percent);
              const newEnd = parseDate(task.plannedStart);
              if (newEnd) {
                let remaining = newDuration;
                while (remaining > 0) {
                  newEnd.setDate(newEnd.getDate() + 1);
                  if (newEnd.getDay() !== 0 && newEnd.getDay() !== 6) remaining--;
                }
                task.plannedEnd = formatDate(newEnd);
                task.duration = newDuration;
              }
              break;
            }
          }
        }
      }
      return updated;
    });
  }, []);

  // Reset sandbox to baseline
  const handleReset = useCallback(() => {
    setSandboxTasks([...MOCK_TASKS]);
    setShockEvents([]);
  }, []);

  // Compute delta metrics
  const deltaMetrics = useMemo((): DeltaMetrics => {
    // Find completion dates
    const baselineTasks = tasks.filter(t => t.successorIds.length === 0 && t.isMilestone);
    const sandboxTasksFiltered = sandboxTasks.filter(t => t.successorIds.length === 0 && t.isMilestone);

    const baselineCompletion = baselineTasks.length > 0
      ? baselineTasks.reduce((max, t) => {
          const d = parseDate(t.plannedEnd);
          return (!d || (max && d < max)) ? max : d;
        }, null as Date | null)
      : null;

    const sandboxCompletion = sandboxTasksFiltered.length > 0
      ? sandboxTasksFiltered.reduce((max, t) => {
          const d = parseDate(t.plannedEnd);
          return (!d || (max && d < max)) ? max : d;
        }, null as Date | null)
      : null;

    const originalCompletionDate = baselineCompletion ? formatDate(baselineCompletion) : '2028-07-01';
    const sandboxCompletionDate = sandboxCompletion ? formatDate(sandboxCompletion) : '2028-07-01';
    const completionDateSlippage = daysBetween(originalCompletionDate, sandboxCompletionDate);

    // EAC calculation
    const originalEAC = tasks.reduce((sum, t) => sum + t.estimatedCost, 0);
    const sandboxEAC = sandboxTasks.reduce((sum, t) => sum + t.estimatedCost, 0) +
      shockEvents.reduce((sum, s) => sum + s.deltaCost, 0);
    const eacVariance = sandboxEAC - originalEAC;

    // Monte Carlo P80 shift (simulated — proportional to completion slippage)
    const p80Shift = Math.round(completionDateSlippage * 1.2);
    const p80OriginalDate = addWorkingDays(originalCompletionDate, 14);
    const p80SandboxDate = addWorkingDays(sandboxCompletionDate, 14 + p80Shift);

    // Milestone variances
    const milestoneVariances: MilestoneVariance[] = tasks
      .filter(t => t.isMilestone && t.isContractGate)
      .map(bt => {
        const st = sandboxTasks.find(t => t.id === bt.id);
        if (!st) return null;
        const varianceDays = daysBetween(bt.plannedEnd, st.plannedEnd);
        return {
          milestoneId: bt.id,
          milestoneLabel: bt.milestoneLabel || bt.name,
          baselineDate: bt.plannedEnd,
          sandboxDate: st.plannedEnd,
          varianceDays,
          isContractGate: true,
          isBreached: varianceDays > 0,
        };
      })
      .filter((mv): mv is MilestoneVariance => mv !== null);

    return {
      completionDateSlippage,
      originalCompletionDate,
      sandboxCompletionDate,
      eacVariance,
      originalEAC,
      sandboxEAC,
      p80OriginalDate,
      p80SandboxDate,
      p80Shift,
      milestoneVariances,
    };
  }, [tasks, sandboxTasks, shockEvents]);

  // Zoom controls
  const zoomIn = () => {
    setZoom(prev => {
      if (prev === 'DAYS') return 'DAYS';
      if (prev === 'WEEKS') return 'DAYS';
      return 'WEEKS';
    });
  };

  const zoomOut = () => {
    setZoom(prev => {
      if (prev === 'MONTHS') return 'MONTHS';
      if (prev === 'WEEKS') return 'MONTHS';
      return 'WEEKS';
    });
  };

  return (
    <div className="flex flex-col h-full bg-bg-ops-base">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-ops-subtle bg-bg-ops-surface">
        <div className="flex items-center gap-3">
          <GitBranch size={18} className="text-violet-400" />
          <div>
            <h1 className="text-base font-semibold text-text-ops-primary">Programme Scenario Sandtable</h1>
            <p className="text-xs text-text-ops-muted">Interactive What-If Simulation Environment</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Baseline toggle */}
          <button
            onClick={() => setShowBaselineInSandbox(!showBaselineInSandbox)}
            className={clsx(
              'flex items-center gap-1.5 px-2 py-1 rounded text-xs',
              showBaselineInSandbox
                ? 'bg-sky-500/20 text-sky-400'
                : 'bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary',
            )}
          >
            {showBaselineInSandbox ? <Eye size={10} /> : <EyeOff size={10} />}
            Baseline Overlay
          </button>

          {/* Delta HUD toggle */}
          <button
            onClick={() => setShowDeltaHUD(!showDeltaHUD)}
            className={clsx(
              'flex items-center gap-1.5 px-2 py-1 rounded text-xs',
              showDeltaHUD
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary',
            )}
          >
            <BarChart3 size={10} />
            Delta HUD
          </button>

          {/* Reset */}
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary"
          >
            <RotateCcw size={10} />
            Reset
          </button>

          {/* Submit to CCB */}
          <button
            onClick={() => setShowBCRModal(true)}
            disabled={shockEvents.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/20 text-sky-400 rounded text-xs font-medium hover:bg-sky-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={10} />
            Submit to Change Control Board
          </button>
        </div>
      </div>

      {/* Shock Event Ribbon */}
      <ShockEventRibbon
        tasks={tasks}
        onApplyShock={handleApplyShock}
        appliedShocks={shockEvents}
      />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Dual-pane split canvas */}
        <div className="flex-1 flex flex-col gap-2 p-3 overflow-hidden">
          {/* Upper Pane — Master Schedule */}
          <div className="flex-1 min-h-0">
            <SandtablePane
              title="Master Schedule (Baseline / Live)"
              tasks={tasks}
              zoom={zoom}
              startDate={startDate}
              endDate={endDate}
              dateToX={dateToX}
              affectedTaskIds={affectedTaskIds}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
            />
          </div>

          {/* Divider */}
          <div className="flex items-center gap-2 py-1">
            <div className="flex-1 h-px bg-border-ops-subtle" />
            <Split size={12} className="text-text-ops-muted" />
            <div className="flex-1 h-px bg-border-ops-subtle" />
          </div>

          {/* Lower Pane — Sandbox Simulation */}
          <div className="flex-1 min-h-0">
            <SandtablePane
              title="Sandbox Simulation Branch"
              tasks={sandboxTasks}
              zoom={zoom}
              startDate={startDate}
              endDate={endDate}
              dateToX={dateToX}
              affectedTaskIds={affectedTaskIds}
              showBaseline={showBaselineInSandbox}
              isSandbox
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
            />
          </div>
        </div>

        {/* Right sidebar — Delta HUD */}
        {showDeltaHUD && (
          <div className="w-80 border-l border-border-ops-subtle bg-bg-ops-surface overflow-auto p-3 space-y-3">
            <DeltaHUD metrics={deltaMetrics} visible={true} />

            {/* Legend */}
            <div className="border-t border-border-ops-subtle pt-3 space-y-2">
              <div className="text-xs text-text-ops-muted font-medium">Legend</div>
              <div className="space-y-1 text-[11px] text-text-ops-muted">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-2 rounded-sm bg-sky-500" />
                  <span>Master Schedule</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-2 rounded-sm bg-slate-500/40" />
                  <span>Baseline Overlay</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-2 rounded-sm bg-violet-500" />
                  <span>Sandbox (Unaffected)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-2 rounded-sm bg-amber-500" />
                  <span>Sandbox (Affected)</span>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="border-t border-border-ops-subtle pt-3 space-y-2">
              <div className="text-xs text-text-ops-muted font-medium">Quick Stats</div>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-text-ops-muted">Total Tasks</span>
                  <span className="text-text-ops-primary font-mono">{sandboxTasks.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-ops-muted">Affected Tasks</span>
                  <span className="text-amber-400 font-mono">{affectedTaskIds.size}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-ops-muted">Shock Events</span>
                  <span className="text-sky-400 font-mono">{shockEvents.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-ops-muted">Breached Gates</span>
                  <span className="text-red-400 font-mono">
                    {deltaMetrics.milestoneVariances.filter(mv => mv.isBreached).length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* BCR Submission Modal */}
      {showBCRModal && (
        <BCRSubmissionModal
          metrics={deltaMetrics}
          shockEvents={shockEvents}
          onSubmit={() => setShowBCRModal(false)}
          onClose={() => setShowBCRModal(false)}
        />
      )}
    </div>
  );
};

export default ScenarioSandtableView;
