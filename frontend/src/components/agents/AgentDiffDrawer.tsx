/**
 * AgentDiffDrawer — Side-by-Side Topological Impact Diff Panel
 *
 * Displays a slide-over drawer showing the current baseline state versus
 * the proposed agent state for each mutation in a proposal session.
 *
 * Features
 * --------
 * - **Left Column**: Current Baseline State (ES, EF, TF, PDM links,
 *   physical progress).
 * - **Right Column**: Proposed Agent State with forward deltas applied.
 * - **Float Impact Telemetry**: Highlights changes in critical path and
 *   float consumption.
 * - **Contractual Warning Badges**: Flags if a proposal touches an
 *   approved Contract Baseline (B₀) milestone.
 *
 * @example
 * ```tsx
 * <AgentDiffDrawer open={isOpen} session={session} onClose={handleClose} />
 * ```
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  ArrowRight,
  AlertTriangle,
  Shield,
  TrendingUp,
  TrendingDown,
  Minus,
  Bot,
  Clock,
  Link,
  Percent,
  Calendar,
  GitCommitHorizontal,
  AlertOctagon,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { AgentProposalSession, AgentMutation } from '../../views/agents/AgentReviewWorkbenchView';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DiffField = 'planned_start_date' | 'planned_end_date' | 'percent_complete' | 'action_type' | string;

interface FieldDiff {
  field: string;
  label: string;
  icon: React.ReactNode;
  baseline: string;
  proposed: string;
  changed: boolean;
  impact: 'critical' | 'warning' | 'neutral';
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AgentDiffDrawerProps {
  open: boolean;
  session: AgentProposalSession | null;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Single field diff row showing baseline vs proposed value.
 */
interface FieldDiffRowProps {
  diff: FieldDiff;
}

const FieldDiffRow: React.FC<FieldDiffRowProps> = ({ diff }) => {
  const impactStyles = {
    critical: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    warning: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    neutral: 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800',
  };

  const valueChangedStyles = {
    critical: 'text-red-700 dark:text-red-300 font-semibold',
    warning: 'text-amber-700 dark:text-amber-300 font-semibold',
    neutral: diff.changed
      ? 'text-blue-700 dark:text-blue-300 font-medium'
      : 'text-gray-500 dark:text-gray-400',
  };

  return (
    <div className={clsx('flex items-center rounded-lg border p-2 text-xs', impactStyles[diff.impact])}>
      {/* Label */}
      <div className="flex w-32 shrink-0 items-center gap-1.5 text-gray-500 dark:text-gray-400">
        {diff.icon}
        <span className="font-medium">{diff.label}</span>
      </div>

      {/* Baseline */}
      <div className="flex-1 px-2">
        <div className="text-[10px] uppercase tracking-wider text-gray-400">Baseline</div>
        <div className="font-mono text-gray-700 dark:text-gray-300">{diff.baseline}</div>
      </div>

      {/* Arrow */}
      <div className="px-1 text-gray-400">
        <ArrowRight size={12} />
      </div>

      {/* Proposed */}
      <div className="flex-1 px-2">
        <div className="text-[10px] uppercase tracking-wider text-gray-400">Proposed</div>
        <div className={clsx('font-mono', valueChangedStyles[diff.impact])}>
          {diff.proposed}
        </div>
      </div>

      {/* Impact Badge */}
      {diff.changed && (
        <div className="ml-2 shrink-0">
          {diff.impact === 'critical' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/40 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-300">
              <AlertOctagon size={10} />
              CRITICAL
            </span>
          )}
          {diff.impact === 'warning' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
              <AlertTriangle size={10} />
              WARNING
            </span>
          )}
          {diff.impact === 'neutral' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300">
              <TrendingUp size={10} />
              CHANGED
            </span>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Mutation detail card showing all field diffs for a single mutation.
 */
interface MutationCardProps {
  mutation: AgentMutation;
  index: number;
}

const MutationCard: React.FC<MutationCardProps> = ({ mutation, index }) => {
  const [expanded, setExpanded] = useState(true);

  /** Format a date value for display */
  const formatDate = (value: unknown): string => {
    if (!value) return '—';
    if (typeof value === 'string') {
      try {
        const d = new Date(value);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      } catch {
        return value;
      }
    }
    return String(value);
  };

  /** Format a numeric value for display */
  const formatNumber = (value: unknown): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') return `${value.toFixed(1)}%`;
    return String(value);
  };

  /** Build field diffs from forward/inverse deltas */
  const fieldDiffs: FieldDiff[] = useMemo(() => {
    const fd = mutation.forward_delta || {};
    const inv = mutation.inverse_delta || {};

    const fields: { key: string; label: string; icon: React.ReactNode; formatter: (v: unknown) => string }[] = [
      { key: 'planned_start_date', label: 'Early Start', icon: <Calendar size={12} />, formatter: formatDate },
      { key: 'planned_end_date', label: 'Early Finish', icon: <Calendar size={12} />, formatter: formatDate },
      { key: 'percent_complete', label: 'Progress', icon: <Percent size={12} />, formatter: formatNumber },
    ];

    // Add any additional fields present in the deltas
    const allKeys = new Set([...Object.keys(fd), ...Object.keys(inv)]);
    allKeys.forEach((key) => {
      if (!fields.find((f) => f.key === key)) {
        fields.push({
          key,
          label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          icon: <Minus size={12} />,
          formatter: (v: unknown) => (v === null || v === undefined ? '—' : String(v)),
        });
      }
    });

    return fields.map((f) => {
      const baseline = f.formatter(inv[f.key]);
      const proposed = f.formatter(fd[f.key]);
      const changed = baseline !== proposed;

      // Determine impact level
      let impact: 'critical' | 'warning' | 'neutral' = 'neutral';
      const impactSummary = mutation.topological_impact_summary || {};

      if (impactSummary['critical_path_hit'] || impactSummary['baseline_slip']) {
        impact = 'critical';
      } else if (impactSummary['float_consumed'] || changed) {
        impact = 'warning';
      }

      return {
        field: f.key,
        label: f.label,
        icon: f.icon,
        baseline,
        proposed,
        changed,
        impact,
      };
    });
  }, [mutation]);

  const hasContractBaseline = !!(
    mutation.topological_impact_summary &&
    (mutation.topological_impact_summary['contract_baseline_hit'] ||
      mutation.topological_impact_summary['milestone_impact'])
  );

  const actionTypeColors: Record<string, string> = {
    NODE_SHIFT: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    LINK_CREATE: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    PROGRESS_SET: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
    BLOCKER_RAISE: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  };

  const actionColor = actionTypeColors[mutation.action_type] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      {/* Mutation header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-[10px] font-bold text-gray-600 dark:text-gray-300">
          {index + 1}
        </span>

        <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-bold', actionColor)}>
          {mutation.action_type}
        </span>

        <span className="font-mono text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
          {mutation.target_node_id.slice(0, 8)}…
        </span>

        {hasContractBaseline && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
            <Shield size={12} />
            B₀ IMPACT
          </span>
        )}
      </button>

      {/* Field diffs */}
      {expanded && (
        <div className="border-t border-gray-200 dark:border-gray-800 px-4 py-3 space-y-2">
          {fieldDiffs.map((diff) => (
            <FieldDiffRow key={diff.field} diff={diff} />
          ))}

          {/* Topological impact summary */}
          {mutation.topological_impact_summary && (
            <div className="mt-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3">
              <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-2">
                Topological Impact
              </div>
              <div className="space-y-1 text-xs">
                {!!mutation.topological_impact_summary['affected_successors'] && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <Link size={12} />
                    <span>
                      Affected successors:{' '}
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {String(mutation.topological_impact_summary['affected_successors'])}
                      </span>
                    </span>
                  </div>
                )}
                {mutation.topological_impact_summary['float_consumed'] !== undefined && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <Clock size={12} />
                    <span>
                      Float consumed:{' '}
                      <span className={clsx(
                        'font-semibold',
                        (typeof mutation.topological_impact_summary['float_consumed'] === 'number' &&
                          mutation.topological_impact_summary['float_consumed'] > 5)
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-gray-900 dark:text-gray-100',
                      )}>
                        {String(mutation.topological_impact_summary['float_consumed'])} days
                      </span>
                    </span>
                  </div>
                )}
                {!!mutation.topological_impact_summary['baseline_slip'] && (
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                    <TrendingDown size={12} />
                    <span className="font-semibold">
                      Baseline slip: {String(mutation.topological_impact_summary['baseline_slip'])} days
                    </span>
                  </div>
                )}
                {!!mutation.topological_impact_summary['critical_path_hit'] && (
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                    <AlertOctagon size={12} />
                    <span className="font-semibold">Critical path impact detected</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Drawer
// ---------------------------------------------------------------------------

const AgentDiffDrawer: React.FC<AgentDiffDrawerProps> = ({ open, session, onClose }) => {
  if (!open || !session) return null;

  const mutations = session.mutations || [];
  const hasContractBaseline = mutations.some((m: AgentMutation) => {
    const impact = m.topological_impact_summary;
    return impact && ('contract_baseline_hit' in impact || 'milestone_impact' in impact);
  });

  const hasCriticalPathImpact = mutations.some((m: AgentMutation) => {
    return m.topological_impact_summary?.['critical_path_hit'];
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 h-full w-[60vw] min-w-[600px] max-w-[900px] flex flex-col bg-gray-50 dark:bg-gray-950 shadow-2xl border-l border-gray-200 dark:border-gray-800">
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
              <Bot size={16} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                Proposal Diff
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {session.agent_identifier} &middot; {session.model_name}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Session metadata */}
        <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-gray-400">Session ID</span>
              <div className="font-mono text-gray-700 dark:text-gray-300">
                {session.session_id.slice(0, 16)}…
              </div>
            </div>
            <div>
              <span className="text-gray-400">Weights Hash</span>
              <div className="font-mono text-gray-700 dark:text-gray-300">
                {session.model_weights_hash?.slice(0, 16)}…
              </div>
            </div>
            <div>
              <span className="text-gray-400">Prompt Digest</span>
              <div className="font-mono text-gray-700 dark:text-gray-300">
                {session.prompt_digest?.slice(0, 16)}…
              </div>
            </div>
            <div>
              <span className="text-gray-400">Mutations</span>
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {mutations.length}
              </div>
            </div>
          </div>
        </div>

        {/* Warning banners */}
        {(hasContractBaseline || hasCriticalPathImpact) && (
          <div className="space-y-2 border-b border-gray-200 dark:border-gray-800 px-6 py-3">
            {hasContractBaseline && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
                <Shield size={14} className="text-amber-600" />
                <span className="text-xs font-medium text-amber-800 dark:text-amber-300">
                  Contract Baseline Warning: This proposal affects approved B₀ milestones.
                </span>
              </div>
            )}
            {hasCriticalPathImpact && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
                <AlertOctagon size={14} className="text-red-600" />
                <span className="text-xs font-medium text-red-800 dark:text-red-300">
                  Critical Path Impact: Float consumption may affect project delivery date.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Column headers */}
        <div className="flex items-center border-b border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900 px-6 py-2 text-[10px] uppercase tracking-wider text-gray-400">
          <div className="w-32 shrink-0">Field</div>
          <div className="flex-1 px-2">Current Baseline State</div>
          <div className="px-1">→</div>
          <div className="flex-1 px-2">Proposed Agent State</div>
        </div>

        {/* Mutation list */}
        <div className="flex-1 overflow-auto px-6 py-4 space-y-3">
          {mutations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <GitCommitHorizontal size={32} className="opacity-30 mb-3" />
              <span className="text-sm">No mutations in this session</span>
            </div>
          ) : (
            mutations.map((mutation: AgentMutation, index: number) => (
              <MutationCard key={mutation.mutation_id} mutation={mutation} index={index} />
            ))
          )}
        </div>

        {/* Drawer footer */}
        <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-3">
          <span className="text-xs text-gray-400">
            {mutations.length} mutation{mutations.length !== 1 ? 's' : ''} staged
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
};

export default AgentDiffDrawer;
