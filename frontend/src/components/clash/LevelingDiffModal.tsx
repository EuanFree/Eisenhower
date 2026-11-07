/**
 * Leveling Diff Modal Component
 *
 * Interactive side-by-side comparison modal launched before applying resource
 * leveling. The modal presents two parallel tables:
 *
 * **Left Table (Current):** Shows the current scheduled dates and total float
 * for each task proposed to be shifted.
 *
 * **Right Table (Proposed):** Shows the proposed shifted dates and consumed
 * float days after the Burgess-Killebrew leveling algorithm runs.
 *
 * **Breach Warning:** If shifting a non-critical task exceeds its available
 * float and slips a contractual delivery milestone, a red warning indicator
 * appears on that row.
 *
 * **Action Buttons:**
 * - "Discard Changes" — Closes the modal without committing anything.
 * - "Commit Leveling Plan" — Atomically executes POST /api/v1/schedule/clashes/apply-leveling
 *   to persist the shifts to the database.
 *
 * Data source: LevelingProposalResponse from POST /leveling-proposal/{project_id}
 */

import React, { useState } from 'react';
import { clsx } from 'clsx';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Clock,
  CalendarDays,
  TrendingUp,
  Save,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { LevelingShift, LevelingProposalResponse } from '../../types/clash';
import { showTypedConfirm, CONFIRM_PRESETS } from '../common/TypedConfirmModal';
import api from '../../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LevelingDiffModalProps {
  /** The leveling proposal data */
  proposal: LevelingProposalResponse | null;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Called when the modal closes */
  onClose: () => void;
  /** Called after successfully committing leveling */
  onCommitSuccess?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format an ISO datetime string to a short readable format.
 */
const formatDate = (dateStr: string): string => {
  if (!dateStr) return '—';
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
};

/**
 * Calculate the number of days between two ISO date strings.
 */
const daysBetween = (startStr: string, endStr: string): number => {
  try {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const diffMs = end.getTime() - start.getTime();
    return Math.round(diffMs / 86400000);
  } catch {
    return 0;
  }
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Single row in the side-by-side comparison table.
 */
const ShiftRow: React.FC<{
  shift: LevelingShift;
  index: number;
}> = ({ shift, index }) => {
  const startShift = daysBetween(shift.original_start, shift.proposed_start);
  const finishShift = daysBetween(shift.original_finish, shift.proposed_finish);

  return (
    <tr
      className={clsx(
        'border-b border-border-ops-subtle text-xs',
        shift.milestone_breach && 'bg-red-500/10',
        index % 2 === 0 ? 'bg-bg-ops-overlay/30' : '',
      )}
    >
      {/* Node Info (shared) */}
      <td className="px-3 py-2 align-top" rowSpan={2}>
        <div className="font-mono font-semibold text-text-ops-primary">
          {shift.code}
        </div>
        <div className="text-text-ops-muted truncate max-w-48" title={shift.name}>
          {shift.name}
        </div>
        {shift.reason && (
          <div className="mt-1 text-text-ops-muted italic text-[10px]">
            {shift.reason}
          </div>
        )}
      </td>

      {/* Current Start */}
      <td className="px-3 py-2 align-top font-mono text-text-ops-muted">
        {formatDate(shift.original_start)}
      </td>

      {/* Current Finish */}
      <td className="px-3 py-2 align-top font-mono text-text-ops-muted">
        {formatDate(shift.original_finish)}
      </td>

      {/* Current Float */}
      <td className="px-3 py-2 align-top font-mono text-text-ops-muted">
        {shift.consumed_float_days > 0
          ? `${shift.consumed_float_days}d available`
          : '0d'}
      </td>

      {/* Arrow */}
      <td className="px-2 py-2 align-top text-center">
        <ArrowRight size={14} className="text-text-ops-muted" />
      </td>

      {/* Proposed Start */}
      <td className="px-3 py-2 align-top font-mono">
        <span className={clsx(
          startShift !== 0 ? 'text-amber-300 font-bold' : 'text-text-ops-primary',
        )}>
          {formatDate(shift.proposed_start)}
        </span>
        {startShift > 0 && (
          <div className="text-[10px] text-amber-400">+{startShift}d</div>
        )}
      </td>

      {/* Proposed Finish */}
      <td className="px-3 py-2 align-top font-mono">
        <span className={clsx(
          finishShift !== 0 ? 'text-amber-300 font-bold' : 'text-text-ops-primary',
        )}>
          {formatDate(shift.proposed_finish)}
        </span>
        {finishShift > 0 && (
          <div className="text-[10px] text-amber-400">+{finishShift}d</div>
        )}
      </td>

      {/* Consumed Float */}
      <td className="px-3 py-2 align-top font-mono">
        <span className={clsx(
          shift.consumed_float_days > 0 ? 'text-amber-300' : 'text-text-ops-primary',
        )}>
          {shift.consumed_float_days}d
        </span>
      </td>

      {/* Breach Warning */}
      <td className="px-3 py-2 align-top text-center">
        {shift.milestone_breach ? (
          <span className="inline-flex items-center gap-1 rounded bg-red-500/20 border border-red-500/40 px-2 py-0.5 text-[10px] font-bold text-red-300 uppercase">
            <AlertTriangle size={10} />
            Breach
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-green-400">
            <CheckCircle2 size={12} />
          </span>
        )}
      </td>
    </tr>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const LevelingDiffModal: React.FC<LevelingDiffModalProps> = ({
  proposal,
  isOpen,
  onClose,
  onCommitSuccess,
}) => {
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !proposal) return null;

  const hasBreaches = proposal.shifts.some((s) => s.milestone_breach);
  const breachCount = proposal.shifts.filter((s) => s.milestone_breach).length;

  const handleDiscard = () => {
    setError(null);
    onClose();
  };

  const handleCommit = async () => {
    // Typed intent confirmation before committing
    const result = await showTypedConfirm(
      CONFIRM_PRESETS.applyLeveling(proposal.project_id),
    );

    if (!result.confirmed) return;

    setIsCommitting(true);
    setError(null);

    try {
      // Build the shifts payload for the backend
      const shifts = proposal.shifts.map((s) => ({
        node_id: s.node_id,
        proposed_start: s.proposed_start,
        proposed_finish: s.proposed_finish,
      }));

      await api.post(
        `/api/v1/schedule/clashes/apply-leveling/${proposal.project_id}`,
        { shifts },
      );

      onCommitSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to commit leveling plan');
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleDiscard}
      />

      {/* Modal Content */}
      <div
        className="relative w-full max-w-6xl max-h-[90vh] rounded-xl border border-border-ops-subtle bg-bg-ops-base shadow-2xl overflow-hidden flex flex-col"
        style={{ minWidth: '800px' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-surface">
          <div>
            <h2 className="text-lg font-bold text-text-ops-primary flex items-center gap-2">
              <TrendingUp size={20} className="text-blue-400" />
              Leveling Proposal Review
            </h2>
            <p className="text-xs text-text-ops-muted mt-1">
              {proposal.total_shifts} proposed shifts across{' '}
              {proposal.overallocation_windows} overallocation window
              {proposal.overallocation_windows !== 1 ? 's' : ''}.
              {proposal.message && ` ${proposal.message}`}
            </p>
          </div>

          <button
            type="button"
            onClick={handleDiscard}
            className="rounded p-2 text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Breach Warning Banner */}
        {hasBreaches && (
          <div className="flex items-center gap-3 px-6 py-3 bg-red-500/10 border-b border-red-500/30">
            <AlertTriangle size={18} className="text-red-400 flex-shrink-0" />
            <div className="text-sm">
              <span className="font-bold text-red-300">Milestone Breach Warning:</span>{' '}
              <span className="text-red-200">
                {breachCount} of {proposal.total_shifts} proposed shifts will exceed available float
                and slip contractual delivery milestone{breachCount > 1 ? 's' : ''}.
                Review the flagged rows below before committing.
              </span>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4 px-6 py-3 border-b border-border-ops-subtle bg-bg-ops-surface/50">
          <div className="text-center">
            <div className="text-xs text-text-ops-muted uppercase tracking-wider">Total Shifts</div>
            <div className="text-2xl font-bold font-mono text-text-ops-primary">
              {proposal.total_shifts}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-text-ops-muted uppercase tracking-wider">Overallocation Windows</div>
            <div className="text-2xl font-bold font-mono text-amber-300">
              {proposal.overallocation_windows}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-text-ops-muted uppercase tracking-wider">Milestone Breaches</div>
            <div className={clsx(
              'text-2xl font-bold font-mono',
              breachCount > 0 ? 'text-red-400' : 'text-green-400',
            )}>
              {breachCount}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-text-ops-muted uppercase tracking-wider">Computed At</div>
            <div className="text-sm font-mono text-text-ops-muted">
              {formatDate(proposal.computed_at)}
            </div>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="flex-1 overflow-auto p-6">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-border-ops-subtle">
                {/* Current Section */}
                <th className="px-3 py-2 text-left text-text-ops-muted font-semibold uppercase tracking-wider text-[10px]">
                  Node
                </th>
                <th className="px-3 py-2 text-left text-text-ops-muted font-semibold uppercase tracking-wider text-[10px]">
                  <div className="flex items-center gap-1">
                    <Clock size={10} />
                    Current Start
                  </div>
                </th>
                <th className="px-3 py-2 text-left text-text-ops-muted font-semibold uppercase tracking-wider text-[10px]">
                  <div className="flex items-center gap-1">
                    <CalendarDays size={10} />
                    Current Finish
                  </div>
                </th>
                <th className="px-3 py-2 text-left text-text-ops-muted font-semibold uppercase tracking-wider text-[10px]">
                  Float
                </th>

                {/* Arrow Column */}
                <th className="px-2 py-2 text-center text-[10px]"></th>

                {/* Proposed Section */}
                <th className="px-3 py-2 text-left text-amber-300 font-semibold uppercase tracking-wider text-[10px]">
                  <div className="flex items-center gap-1">
                    <Clock size={10} />
                    Proposed Start
                  </div>
                </th>
                <th className="px-3 py-2 text-left text-amber-300 font-semibold uppercase tracking-wider text-[10px]">
                  <div className="flex items-center gap-1">
                    <CalendarDays size={10} />
                    Proposed Finish
                  </div>
                </th>
                <th className="px-3 py-2 text-left text-amber-300 font-semibold uppercase tracking-wider text-[10px]">
                  Consumed Float
                </th>
                <th className="px-3 py-2 text-center text-text-ops-muted font-semibold uppercase tracking-wider text-[10px]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {proposal.shifts.map((shift, index) => (
                <ShiftRow key={shift.node_id} shift={shift} index={index} />
              ))}
            </tbody>
          </table>

          {proposal.shifts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-text-ops-muted">
              <CheckCircle2 size={48} className="mb-4 text-green-400" />
              <p className="text-lg font-semibold">No Shifts Required</p>
              <p className="text-sm mt-1">
                No resource overallocations detected. The schedule is healthy.
              </p>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="px-6 py-3 bg-red-500/10 border-t border-red-500/30 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-ops-subtle bg-bg-ops-surface">
          <div className="text-xs text-text-ops-muted">
            Committing will update planned dates for {proposal.total_shifts} task
            {proposal.total_shifts !== 1 ? 's' : ''} in the database.
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDiscard}
              disabled={isCommitting}
              className="inline-flex items-center gap-2 rounded border border-border-ops-subtle bg-bg-ops-overlay px-4 py-2 text-sm font-medium text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong transition-colors disabled:opacity-50"
            >
              <RotateCcw size={14} />
              Discard Changes
            </button>

            <button
              type="button"
              onClick={handleCommit}
              disabled={isCommitting || proposal.shifts.length === 0}
              className={clsx(
                'inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-medium transition-colors',
                'bg-blue-600 border border-blue-500 text-white hover:bg-blue-700',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                hasBreaches && 'bg-amber-600 border-amber-500 hover:bg-amber-700',
              )}
            >
              {isCommitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Committing...
                </>
              ) : (
                <>
                  <Save size={14} />
                  Commit Leveling Plan
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LevelingDiffModal;
