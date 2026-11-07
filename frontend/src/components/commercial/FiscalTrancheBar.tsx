/**
 * Fiscal Tranche Overrun HUD — Horizontal annual funding bars.
 *
 * Renders horizontal annual funding bars showing approved tranche caps vs.
 * projected non-linear spend. Color-codes allocations:
 * - Green (<90% utilization)
 * - Amber (90%-100% utilization)
 * - Red (>100% breach)
 *
 * If a curve shape shifts expenditure past a fiscal ceiling, displays a
 * floating alert HUD: 'FISCAL OVERRUN: Exceeds FY27 Tranche by £142,500.
 * Required slippage: +22 working days'.
 */

import React, { useMemo, useCallback } from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle2, Clock } from 'lucide-react';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FiscalTranche {
  /** Fiscal year identifier (e.g., 'FY26/27') */
  fiscalYear: string;
  /** Start date of the fiscal year tranche */
  startDate: string;  // ISO date
  /** End date of the fiscal year tranche */
  endDate: string;    // ISO date
  /** Approved funding cap for this tranche */
  allocatedCap: number;
  /** Projected spend for this tranche based on current cost profile */
  projectedSpend: number;
}

export interface FiscalTrancheBarProps {
  /** List of fiscal year tranches with caps and projected spend */
  tranches: FiscalTranche[];
  /** Total Budget at Completion */
  bac: number;
  /** Optional: callback when an overrun is detected */
  onOverrunDetected?: (fiscalYear: string, excessAmount: number) => void;
}

export interface OverrunAlert {
  /** Fiscal year that is overran */
  fiscalYear: string;
  /** Amount by which projected spend exceeds the cap */
  excessAmount: number;
  /** Estimated working days of slippage needed to bring spend back under cap */
  estimatedSlippageDays: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format currency for display.
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format date for display.
 */
function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/**
 * Calculate the utilization percentage for a tranche.
 */
function utilizationPct(tranche: FiscalTranche): number {
  if (tranche.allocatedCap <= 0) return 0;
  return (tranche.projectedSpend / tranche.allocatedCap) * 100;
}

/**
 * Estimate working days of slippage needed to bring projected spend back
 * under the allocated cap. Uses a simple linear approximation based on
 * the daily burn rate within the tranche.
 */
function estimateSlippageDays(tranche: FiscalTranche): number {
  if (tranche.allocatedCap <= 0) return 0;
  if (tranche.projectedSpend <= tranche.allocatedCap) return 0;

  const start = new Date(tranche.startDate);
  const end = new Date(tranche.endDate);
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

  const dailyBurnRate = tranche.projectedSpend / totalDays;
  if (dailyBurnRate <= 0) return 0;

  const excessAmount = tranche.projectedSpend - tranche.allocatedCap;
  const slippageDays = Math.ceil(excessAmount / dailyBurnRate);

  return slippageDays;
}

// ---------------------------------------------------------------------------
// Overrun Alert HUD Component
// ---------------------------------------------------------------------------

interface OverrunAlertHudProps {
  alert: OverrunAlert;
  onDismiss: () => void;
}

const OverrunAlertHud: React.FC<OverrunAlertHudProps> = ({ alert, onDismiss }) => {
  return (
    <div className="relative mx-4 mt-3 p-4 rounded-xl bg-red-500/10 border-2 border-red-500/40 shadow-lg shadow-red-500/10">
      {/* Pulsing indicator */}
      <div className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-red-500 animate-pulse" />

      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5 p-2 rounded-lg bg-red-500/20 text-red-400">
          <ShieldAlert size={18} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold text-red-400 uppercase tracking-wider">
              FISCAL OVERRUN
            </span>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-500/20 text-red-300">
              CRITICAL
            </span>
          </div>

          <p className="text-sm text-text-ops-primary mb-2">
            Exceeds <span className="font-mono font-semibold">{alert.fiscalYear}</span> Tranche by{' '}
            <span className="font-mono font-bold text-red-400">
              {formatCurrency(alert.excessAmount)}
            </span>
          </p>

          <div className="flex items-center gap-2 text-xs text-text-ops-muted">
            <Clock size={12} />
            <span>
              Required slippage:{' '}
              <span className="font-mono font-semibold text-amber-400">
                +{alert.estimatedSlippageDays} working days
              </span>
            </span>
          </div>

          <div className="mt-2 flex items-center gap-2 text-[11px] text-text-ops-muted">
            <AlertTriangle size={10} className="flex-shrink-0" />
            <span>
              Schedule rescheduling or supplemental appropriation required. CPM and EVM
              recalculation will be triggered on commit.
            </span>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="flex-shrink-0 p-1 rounded text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
          title="Dismiss alert"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Single Tranche Bar Component
// ---------------------------------------------------------------------------

interface TrancheBarRowProps {
  tranche: FiscalTranche;
  utilization: number;
}

const TrancheBarRow: React.FC<TrancheBarRowProps> = ({ tranche, utilization }) => {
  const isGreen = utilization < 90;
  const isAmber = utilization >= 90 && utilization <= 100;
  const isRed = utilization > 100;

  const barColor = isGreen
    ? 'bg-emerald-500'
    : isAmber
    ? 'bg-amber-500'
    : 'bg-red-500';

  const barGlow = isGreen
    ? 'shadow-emerald-500/20'
    : isAmber
    ? 'shadow-amber-500/20'
    : 'shadow-red-500/30';

  const textColor = isGreen
    ? 'text-emerald-400'
    : isAmber
    ? 'text-amber-400'
    : 'text-red-400';

  const statusIcon = isGreen
    ? <CheckCircle2 size={12} />
    : isAmber
    ? <AlertTriangle size={12} />
    : <ShieldAlert size={12} />;

  // Clamp bar width to 100% max for display
  const displayWidth = Math.min(utilization, 100);

  return (
    <div className="group">
      {/* Header row */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className={clsx('flex items-center gap-1 text-xs font-semibold', textColor)}>
            {statusIcon}
            {utilization.toFixed(1)}%
          </span>
          <span className="text-sm font-semibold text-text-ops-primary">
            {tranche.fiscalYear}
          </span>
          <span className="text-xs text-text-ops-muted font-mono">
            {formatDateShort(tranche.startDate)} – {formatDateShort(tranche.endDate)}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-text-ops-muted">
            {formatCurrency(tranche.projectedSpend)}
          </span>
          <span className="text-text-ops-muted">/</span>
          <span className="text-text-ops-primary">
            {formatCurrency(tranche.allocatedCap)}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-6 bg-bg-ops-overlay rounded-full overflow-hidden border border-border-ops-subtle">
        {/* Fill bar */}
        <div
          className={clsx(
            'h-full rounded-full transition-all duration-300 shadow-lg',
            barColor,
            barGlow,
          )}
          style={{ width: `${displayWidth}%` }}
        />

        {/* 100% cap marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white/30"
          style={{ left: '100%' }}
        />

        {/* Overrun overlay */}
        {isRed && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold text-white drop-shadow-lg">
              ⚠ OVERRUN: {formatCurrency(tranche.projectedSpend - tranche.allocatedCap)}
            </span>
          </div>
        )}
      </div>

      {/* Footer details */}
      <div className="flex items-center justify-between mt-1 text-[10px] text-text-ops-muted">
        <span>
          {isGreen
            ? 'Within approved funding envelope'
            : isAmber
            ? 'Approaching fiscal ceiling — monitor closely'
            : 'EXCEEDS allocated cap — action required'}
        </span>
        <span className="font-mono">
          Headroom: {formatCurrency(tranche.allocatedCap - tranche.projectedSpend)}
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main FiscalTrancheBar Component
// ---------------------------------------------------------------------------

const FiscalTrancheBar: React.FC<FiscalTrancheBarProps> = ({
  tranches,
  bac,
  onOverrunDetected,
}) => {
  // Compute utilization and overrun alerts
  const trancheData = useMemo(() => {
    return tranches.map((tranche) => ({
      tranche,
      utilization: utilizationPct(tranche),
    }));
  }, [tranches]);

  const overrunAlerts = useMemo(() => {
    const alerts: OverrunAlert[] = [];
    for (const td of trancheData) {
      if (td.utilization > 100) {
        const excess = td.tranche.projectedSpend - td.tranche.allocatedCap;
        const slippage = estimateSlippageDays(td.tranche);
        alerts.push({
          fiscalYear: td.tranche.fiscalYear,
          excessAmount: excess,
          estimatedSlippageDays: slippage,
        });
        // Notify parent
        if (onOverrunDetected) {
          onOverrunDetected(td.tranche.fiscalYear, excess);
        }
      }
    }
    return alerts;
  }, [trancheData, onOverrunDetected]);

  // Summary statistics
  const summary = useMemo(() => {
    const totalCap = tranches.reduce((sum, t) => sum + t.allocatedCap, 0);
    const totalProjected = tranches.reduce((sum, t) => sum + t.projectedSpend, 0);
    const overranCount = trancheData.filter((td) => td.utilization > 100).length;
    const amberCount = trancheData.filter((td) => td.utilization >= 90 && td.utilization <= 100).length;
    return { totalCap, totalProjected, overranCount, amberCount };
  }, [tranches, trancheData]);

  const [dismissedAlerts, setDismissedAlerts] = React.useState<Set<string>>(new Set());

  const handleDismiss = useCallback((fiscalYear: string) => {
    setDismissedAlerts((prev) => {
      const next = new Set(prev);
      next.add(fiscalYear);
      return next;
    });
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
            <ShieldAlert size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-ops-primary">
              Fiscal Year Tranche Monitoring
            </h3>
            <p className="text-xs text-text-ops-muted">
              {tranches.length} tranches · Total BAC: {formatCurrency(bac)}
            </p>
          </div>
        </div>

        {/* Summary badges */}
        <div className="flex items-center gap-2">
          {summary.overranCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
              <ShieldAlert size={10} />
              {summary.overranCount} Overrun
            </span>
          )}
          {summary.amberCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <AlertTriangle size={10} />
              {summary.amberCount} Warning
            </span>
          )}
          {summary.overranCount === 0 && summary.amberCount === 0 && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 size={10} />
              All Clear
            </span>
          )}
        </div>
      </div>

      {/* Overrun alerts */}
      {overrunAlerts
        .filter((a) => !dismissedAlerts.has(a.fiscalYear))
        .map((alert) => (
          <OverrunAlertHud
            key={alert.fiscalYear}
            alert={alert}
            onDismiss={() => handleDismiss(alert.fiscalYear)}
          />
        ))}

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-bg-ops-overlay/50 border border-border-ops-subtle">
        <div>
          <div className="text-[10px] text-text-ops-muted uppercase tracking-wider mb-0.5">
            Total Allocated
          </div>
          <div className="text-sm font-mono font-semibold text-text-ops-primary">
            {formatCurrency(summary.totalCap)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-text-ops-muted uppercase tracking-wider mb-0.5">
            Total Projected
          </div>
          <div className="text-sm font-mono font-semibold text-text-ops-primary">
            {formatCurrency(summary.totalProjected)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-text-ops-muted uppercase tracking-wider mb-0.5">
            Variance
          </div>
          <div
            className={clsx(
              'text-sm font-mono font-semibold',
              summary.totalProjected > summary.totalCap
                ? 'text-red-400'
                : 'text-emerald-400',
            )}
          >
            {formatCurrency(summary.totalCap - summary.totalProjected)}
          </div>
        </div>
      </div>

      {/* Tranche bars */}
      <div className="space-y-4">
        {trancheData.map(({ tranche, utilization }) => (
          <TrancheBarRow
            key={tranche.fiscalYear}
            tranche={tranche}
            utilization={utilization}
          />
        ))}

        {tranches.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-text-ops-muted">
            <ShieldAlert size={32} className="mb-3 opacity-50" />
            <p className="text-sm">No fiscal year tranches configured</p>
            <p className="text-xs mt-1">
              Configure fiscal caps via the commercial governance panel
            </p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-text-ops-muted pt-2 border-t border-border-ops-subtle">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-500" />
          &lt;90% (Normal)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-500" />
          90%–100% (Warning)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500" />
          &gt;100% (Overrun)
        </span>
      </div>
    </div>
  );
};

export default FiscalTrancheBar;
