/**
 * Clash Triage Board Component
 *
 * The main triage list for the Schedule Health view — displays all active
 * (unresolved) clash issues detected by the background sweep daemon.
 *
 * **Features:**
 *
 * 1. **Severity Summary Strip** — Three clickable summary cards showing the
 *    count of CRITICAL, MAJOR, and ADVISORY clashes. Clicking a card toggles
 *    the severity filter for that level.
 *
 * 2. **Filterable Pill Bar** — Delegated to ClashFilterBar, which provides
 *    pill-style filters for both severity and category.
 *
 * 3. **Clash Cards Grid** — Two-column responsive grid of ClashCard components,
 *    each showing the conflict window, affected task code, conflicting entity,
 *    recommended action, and a "Run Leveling Proposal" primary action button.
 *
 * 4. **Empty State** — When no clashes are found (either because the schedule
 *    is healthy or because filters exclude all results), displays a green
 *    checkmark with an appropriate message.
 *
 * 5. **Loading State** — Spinner displayed while the initial clash list is
 *    being fetched from the backend.
 *
 * Data source: ClashIssue[] from GET /api/v1/schedule/clashes/
 *
 * This component is a presentational container — it receives the clash data,
 * filter state, and action callbacks from the parent ScheduleHealthView, which
 * owns the API calls and state management.
 */

import React from 'react';
import { clsx } from 'clsx';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  ClashIssue,
  ClashFilters,
  ClashSeverity,
} from '../../types/clash';
import ClashFilterBar from './ClashFilterBar';
import ClashCard from './ClashCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClashTriageBoardProps {
  /** Active clash issues (already sorted by severity) */
  clashes: ClashIssue[];
  /** Clash counts by severity for the summary strip */
  bySeverity: Record<string, number>;
  /** Total clash count (before client-side filtering) */
  totalClashes: number;
  /** Whether the initial fetch is still in progress */
  isLoading: boolean;
  /** Current filter state */
  filters: ClashFilters;
  /** Called when filters change */
  onFilterChange: (filters: ClashFilters) => void;
  /** Called when the user clicks "Run Leveling Proposal" on a card */
  onRunLeveling: (projectNodeId: string) => void;
  /** Called when the user resolves a clash */
  onResolve: (clashId: string) => void;
  /** Optional project ID — shown to enable sweep button in empty state */
  projectId?: string;
  /** Whether a sweep is currently running */
  isSweeping?: boolean;
  /** Called to trigger a new portfolio sweep */
  onSweep?: () => void;
  /** Whether a leveling proposal is being computed */
  isComputingLeveling?: boolean;
}

// ---------------------------------------------------------------------------
// Severity summary configuration
// ---------------------------------------------------------------------------

const SEVERITY_SUMMARY = [
  {
    severity: 'CRITICAL' as ClashSeverity,
    color: 'red',
    icon: AlertCircle,
    label: 'Critical',
  },
  {
    severity: 'MAJOR' as ClashSeverity,
    color: 'amber',
    icon: AlertTriangle,
    label: 'Major',
  },
  {
    severity: 'ADVISORY' as ClashSeverity,
    color: 'blue',
    icon: Info,
    label: 'Advisory',
  },
];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const ClashTriageBoard: React.FC<ClashTriageBoardProps> = ({
  clashes,
  bySeverity,
  totalClashes,
  isLoading,
  filters,
  onFilterChange,
  onRunLeveling,
  onResolve,
  projectId,
  isSweeping = false,
  onSweep,
  isComputingLeveling = false,
}) => {
  // Client-side category filtering
  const filteredClashes = clashes.filter((clash) => {
    if (filters.category && clash.category !== filters.category) {
      return false;
    }
    return true;
  });

  return (
    <>
      {/* Severity Summary Strip */}
      <div className="grid grid-cols-3 gap-4 px-6 py-3 border-b border-border-ops-subtle bg-bg-ops-surface/50">
        {SEVERITY_SUMMARY.map((item) => {
          const Icon = item.icon;
          const count = bySeverity[item.severity] || 0;
          const isActive = filters.severity === item.severity;

          return (
            <button
              key={item.severity}
              type="button"
              onClick={() =>
                onFilterChange({
                  ...filters,
                  severity: isActive ? null : item.severity,
                })
              }
              className={clsx(
                'flex items-center gap-3 rounded-lg border px-4 py-3 transition-all text-left',
                isActive
                  ? `border-${item.color}-500/60 bg-${item.color}-500/10`
                  : 'border-border-ops-subtle bg-bg-ops-overlay hover:border-border-ops-strong',
              )}
            >
              <div
                className={clsx(
                  'flex h-10 w-10 items-center justify-center rounded-full',
                  `bg-${item.color}-500/20`,
                )}
              >
                <Icon size={20} className={`text-${item.color}-400`} />
              </div>
              <div>
                <div
                  className={clsx(
                    'text-2xl font-bold font-mono',
                    `text-${item.color}-400`,
                  )}
                >
                  {count}
                </div>
                <div className="text-xs text-text-ops-muted uppercase tracking-wider">
                  {item.label}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-6">
        {/* Loading State */}
        {isLoading && clashes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-text-ops-muted">
            <Loader2 size={48} className="mb-4 animate-spin text-blue-400" />
            <p className="text-lg font-semibold">Loading clash issues...</p>
            <p className="text-sm mt-1">Querying the schedule audit engine.</p>
          </div>
        ) : (
          <>
            {/* Filter Bar */}
            <ClashFilterBar
              filters={filters}
              onFilterChange={onFilterChange}
              bySeverity={bySeverity}
            />

            {/* Clash Count */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-text-ops-muted">
                Showing{' '}
                <span className="font-semibold text-text-ops-primary">
                  {filteredClashes.length}
                </span>{' '}
                of{' '}
                <span className="font-semibold text-text-ops-primary">
                  {totalClashes}
                </span>{' '}
                active clash{totalClashes !== 1 ? 'es' : ''}.
              </p>

              {isComputingLeveling && (
                <span className="inline-flex items-center gap-2 text-xs text-blue-400">
                  <Loader2 size={12} className="animate-spin" />
                  Computing leveling proposal...
                </span>
              )}
            </div>

            {/* Clash Cards Grid */}
            {filteredClashes.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredClashes.map((clash) => (
                  <ClashCard
                    key={clash.id}
                    clash={clash}
                    onRunLeveling={onRunLeveling}
                    onResolve={onResolve}
                  />
                ))}
              </div>
            ) : (
              /* Empty State */
              <div className="flex flex-col items-center justify-center py-24 text-text-ops-muted">
                <CheckCircle2 size={64} className="mb-4 text-green-400" />
                <p className="text-xl font-semibold text-text-ops-primary">
                  Schedule is Healthy
                </p>
                <p className="text-sm mt-2 text-center max-w-md">
                  {filters.severity || filters.category
                    ? 'No clashes match the current filters. Try adjusting your filter criteria.'
                    : 'No active schedule conflicts detected. The portfolio is clear of resource overallocations, facility collisions, and credential lapses.'}
                </p>
                {projectId && onSweep && (
                  <button
                    type="button"
                    onClick={onSweep}
                    disabled={isSweeping}
                    className="mt-4 inline-flex items-center gap-2 rounded border border-border-ops-subtle bg-bg-ops-overlay px-4 py-2 text-sm font-medium text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong transition-colors disabled:opacity-50"
                  >
                    {isSweeping ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                    Run New Sweep
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default ClashTriageBoard;
