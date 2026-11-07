/**
 * Active Blockers Component
 *
 * Tab D of the drill-down workbench: displays all open (unresolved)
 * impediments affecting the selected task, with quick 'Resolve' buttons
 * and impact hour summaries.
 *
 * Each blocker row shows:
 * - Category icon (dependency overdue, resource unavailable, clearance hold,
 *   facility maintenance, operational impediment)
 * - Severity badge (CRITICAL, MAJOR, MINOR)
 * - Impact hours
 * - Created date
 * - Quick Resolve button that marks the blocker as resolved
 *
 * Corresponds to the backend NodeBlocker model.
 */

import React, { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Ban,
  Shield,
  Wrench,
  Activity,
  XCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { WBSRow, NodeBlocker, BlockerCategory, BlockerSeverity } from '../../types/wbs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Category configuration: icon, label, and color.
 */
const CATEGORY_CONFIG: Record<BlockerCategory, { icon: React.ReactNode; label: string; color: string }> = {
  DEPENDENCY_OVERDUE: {
    icon: <Clock size={14} />,
    label: 'Dependency Overdue',
    color: 'text-amber-400',
  },
  RESOURCE_UNAVAILABLE: {
    icon: <Ban size={14} />,
    label: 'Resource Unavailable',
    color: 'text-red-400',
  },
  CLEARANCE_HOLD: {
    icon: <Shield size={14} />,
    label: 'Clearance Hold',
    color: 'text-purple-400',
  },
  FACILITY_MAINTENANCE: {
    icon: <Wrench size={14} />,
    label: 'Facility Maintenance',
    color: 'text-sky-400',
  },
  OPERATIONAL_IMPEDIMENT: {
    icon: <Activity size={14} />,
    label: 'Operational Impediment',
    color: 'text-orange-400',
  },
};

/**
 * Severity configuration: badge color and border.
 */
const SEVERITY_CONFIG: Record<BlockerSeverity, { color: string; bg: string; border: string }> = {
  CRITICAL: {
    color: 'text-red-400',
    bg: 'bg-red-900/30',
    border: 'border-red-500/50',
  },
  MAJOR: {
    color: 'text-amber-400',
    bg: 'bg-amber-900/30',
    border: 'border-amber-500/50',
  },
  MINOR: {
    color: 'text-sky-400',
    bg: 'bg-sky-900/30',
    border: 'border-sky-500/50',
  },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ActiveBlockersProps {
  /** The currently selected WBS row */
  selectedRow: WBSRow | null;
  /** Active (unresolved) blockers for the selected node */
  blockers: NodeBlocker[];
  /** Callback when a blocker is resolved */
  onResolve?: (blockerId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a date string for display.
 */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format impact hours.
 */
function formatHours(hours: number): string {
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remaining = hours % 24;
    return remaining > 0 ? `${days}d ${remaining}h` : `${days}d`;
  }
  return `${hours}h`;
}

// ---------------------------------------------------------------------------
// Blocker Row
// ---------------------------------------------------------------------------

const BlockerRow: React.FC<{
  blocker: NodeBlocker;
  onResolve: (blockerId: string) => void;
}> = ({ blocker, onResolve }) => {
  const category = CATEGORY_CONFIG[blocker.category] || CATEGORY_CONFIG.OPERATIONAL_IMPEDIMENT;
  const severity = SEVERITY_CONFIG[blocker.severity] || SEVERITY_CONFIG.MINOR;

  return (
    <div
      className={clsx(
        'flex items-center gap-3 px-3 py-3 border-b border-border-ops-subtle',
        'hover:bg-bg-ops-overlay/50 transition-colors',
        severity.bg,
      )}
    >
      {/* Category icon */}
      <div className={clsx('flex-shrink-0', category.color)}>
        {category.icon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-ops-primary">
            {category.label}
          </span>
          {/* Severity badge */}
          <span
            className={clsx(
              'flex-shrink-0 px-1.5 py-0.5 text-xs font-mono font-semibold rounded border',
              severity.color,
              severity.border,
            )}
          >
            {blocker.severity}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-text-ops-muted">
          <span>Created: {formatDate(blocker.created_at)}</span>
          <span className="font-mono text-amber-400">
            Impact: {formatHours(blocker.impacted_hours)}
          </span>
        </div>
      </div>

      {/* Resolve button */}
      <button
        onClick={() => onResolve(blocker.id)}
        className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
        title="Mark this blocker as resolved"
      >
        <CheckCircle2 size={12} />
        Resolve
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Resolved Blocker Row (dimmed)
// ---------------------------------------------------------------------------

const ResolvedBlockerRow: React.FC<{
  blocker: NodeBlocker;
}> = ({ blocker }) => {
  const category = CATEGORY_CONFIG[blocker.category] || CATEGORY_CONFIG.OPERATIONAL_IMPEDIMENT;

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-border-ops-subtle opacity-50">
      {/* Category icon */}
      <div className="flex-shrink-0 text-text-ops-muted">
        {category.icon}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-ops-muted line-through">
            {category.label}
          </span>
          <span className="flex items-center gap-1 text-xs text-emerald-400">
            <CheckCircle2 size={10} />
            Resolved
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-text-ops-muted">
          <span>Resolved: {blocker.resolved_at ? formatDate(blocker.resolved_at) : 'N/A'}</span>
          <span className="font-mono">
            Impact: {formatHours(blocker.impacted_hours)}
          </span>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Summary Bar
// ---------------------------------------------------------------------------

const SummaryBar: React.FC<{
  activeCount: number;
  resolvedCount: number;
  totalImpactHours: number;
  criticalCount: number;
}> = ({ activeCount, resolvedCount, totalImpactHours, criticalCount }) => {
  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-bg-ops-overlay/50 border-b border-border-ops-subtle">
      <span className="text-xs text-text-ops-muted">
        Active: <span className="font-mono font-semibold text-text-ops-primary">{activeCount}</span>
      </span>
      <span className="text-xs text-text-ops-muted">
        Resolved: <span className="font-mono text-emerald-400">{resolvedCount}</span>
      </span>
      <span className="text-xs text-text-ops-muted">
        Total Impact: <span className="font-mono text-amber-400">{formatHours(totalImpactHours)}</span>
      </span>
      {criticalCount > 0 && (
        <span className="flex items-center gap-1 text-xs text-red-400">
          <AlertTriangle size={12} />
          {criticalCount} Critical
        </span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const ActiveBlockers: React.FC<ActiveBlockersProps> = ({
  selectedRow,
  blockers,
  onResolve,
}) => {
  // Separate active and resolved blockers
  const { active, resolved } = useMemo(() => {
    const active: NodeBlocker[] = [];
    const resolved: NodeBlocker[] = [];

    blockers.forEach((b) => {
      if (b.resolved_at) resolved.push(b);
      else active.push(b);
    });

    // Sort active by severity: CRITICAL > MAJOR > MINOR
    active.sort((a, b) => {
      const order: Record<BlockerSeverity, number> = {
        CRITICAL: 0,
        MAJOR: 1,
        MINOR: 2,
      };
      return order[a.severity] - order[b.severity];
    });

    return { active, resolved };
  }, [blockers]);

  // Summary stats
  const totalImpactHours = useMemo(
    () => active.reduce((sum, b) => sum + b.impacted_hours, 0),
    [active],
  );
  const criticalCount = useMemo(
    () => active.filter((b) => b.severity === 'CRITICAL').length,
    [active],
  );

  // No selection
  if (!selectedRow) {
    return (
      <div className="flex items-center justify-center h-full text-text-ops-muted">
        <div className="text-center">
          <AlertTriangle size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Select a task to view its blockers</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-ops-subtle bg-bg-ops-surface">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-text-ops-muted" />
          <span className="text-sm font-semibold text-text-ops-primary">
            Active Blockers
          </span>
          <span className="text-xs font-mono text-text-ops-muted">
            {selectedRow.code}
          </span>
          {criticalCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-red-400">
              <XCircle size={12} />
              {criticalCount} critical
            </span>
          )}
        </div>
      </div>

      {/* Summary */}
      {blockers.length > 0 && (
        <SummaryBar
          activeCount={active.length}
          resolvedCount={resolved.length}
          totalImpactHours={totalImpactHours}
          criticalCount={criticalCount}
        />
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {blockers.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-text-ops-muted">
            <div className="text-center">
              <CheckCircle2 size={24} className="mx-auto mb-2 text-emerald-400 opacity-50" />
              <p className="text-sm text-emerald-400">No blockers — task is clear</p>
            </div>
          </div>
        ) : (
          <>
            {/* Active blockers */}
            {active.map((blocker) => (
              <BlockerRow
                key={blocker.id}
                blocker={blocker}
                onResolve={onResolve ?? (() => {})}
              />
            ))}

            {/* Resolved blockers (collapsed section) */}
            {resolved.length > 0 && (
              <div className="border-t border-border-ops-subtle">
                <div className="px-3 py-1.5 bg-bg-ops-overlay/30 text-xs text-text-ops-muted">
                  Resolved ({resolved.length})
                </div>
                {resolved.map((blocker) => (
                  <ResolvedBlockerRow key={blocker.id} blocker={blocker} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-t border-border-ops-subtle bg-bg-ops-surface text-xs text-text-ops-muted">
        {Object.entries(CATEGORY_CONFIG).map(([category, config]) => (
          <span key={category} className={clsx('flex items-center gap-1', config.color)}>
            {config.icon}
            <span className="hidden sm:inline">{config.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default ActiveBlockers;
