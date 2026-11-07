/**
 * Claimable Queue Component
 *
 * Accordion listing tasks assigned to Generic Placeholders matching the user's
 * functional discipline and clearance. These are tasks that have not yet been
 * assigned to a specific person but are available for claiming.
 *
 * Each item shows the placeholder role, required skill, and a single-click
 * 'Claim Task' action that calls POST /api/v1/cockpit/claimable-tasks/{id}/claim,
 * converting the assignment to the user's ID and reloading the Focus Queue.
 *
 * Data source: GET /api/v1/cockpit/claimable-tasks
 */

import React, { useState, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  UserPlus,
  User,
  Wrench,
  Clock,
  Lock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../services/api';
import { ClaimableTask } from '../../types/cockpit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClaimableQueueProps {
  /** Claimable tasks from the API */
  tasks: ClaimableTask[];
  /** Called after a successful claim to refresh both queues */
  onClaimed?: () => void;
}

// ---------------------------------------------------------------------------
// Proficiency Level Labels
// ---------------------------------------------------------------------------

const PROFICIENCY_LABELS: Record<number, string> = {
  1: 'Novice',
  2: 'Intermediate',
  3: 'Competent',
  4: 'Expert',
  5: 'Master',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Single claimable task item in the accordion.
 */
const ClaimableTaskItem: React.FC<{
  task: ClaimableTask;
  onClaimed?: () => void;
}> = ({ task, onClaimed }) => {
  const [expanded, setExpanded] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMasked = task.is_masked === true;

  const handleClaim = useCallback(async () => {
    setClaiming(true);
    setError(null);
    try {
      await api.post(`/cockpit/claimable-tasks/${task.id}/claim`);
      setClaimed(true);
      onClaimed?.();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to claim task';
      setError(typeof msg === 'string' ? msg : 'Failed to claim task');
    } finally {
      setClaiming(false);
    }
  }, [task.id, onClaimed]);

  if (claimed) {
    return (
      <div
        className={clsx(
          'flex items-center gap-3 p-3 rounded-lg border',
          'bg-bg-ops-surface border-border-ops-subtle opacity-50',
        )}
      >
        <CheckCircle2 size={16} className="text-emerald-400" />
        <span className="text-sm text-text-ops-muted italic">Claimed</span>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'rounded-lg border transition-colors',
        'bg-bg-ops-surface border-border-ops-subtle',
        'hover:border-border-ops-strong',
      )}
    >
      {/* Header row */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        {/* Expand chevron */}
        <span className="text-text-ops-muted">
          {expanded ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronRight size={14} />
          )}
        </span>

        {/* Code */}
        <span className="text-xs font-mono text-text-ops-muted">{task.code}</span>

        {/* Name */}
        {isMasked ? (
          <span className="flex items-center gap-1 text-sm italic text-text-ops-muted">
            <Lock size={12} />
            [RESTRICTED]
          </span>
        ) : (
          <span className="flex-1 text-sm text-text-ops-primary truncate">{task.name}</span>
        )}

        {/* Placeholder badge */}
        <span
          className={clsx(
            'flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded',
            'bg-amber-900/30 text-amber-400 border border-amber-500/30',
          )}
        >
          <User size={10} />
          {task.placeholder_code}
        </span>

        {/* Progress */}
        <span className="text-xs font-mono text-text-ops-muted">
          {task.percent_complete}%
        </span>

        {/* Claim button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleClaim();
          }}
          disabled={claiming}
          className={clsx(
            'flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded transition-colors',
            'bg-sky-600 text-white hover:bg-sky-500',
            'disabled:opacity-30 disabled:cursor-not-allowed',
          )}
        >
          {claiming ? (
            '...'
          ) : (
            <>
              <UserPlus size={12} />
              Claim Task
            </>
          )}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 px-3 pb-2 text-xs text-red-400">
          <AlertCircle size={12} />
          {error}
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border-ops-subtle mt-0">
          <div className="grid grid-cols-2 gap-3 text-xs">
            {/* Placeholder role */}
            <div className="flex items-center gap-2">
              <User size={12} className="text-text-ops-muted" />
              <span className="text-text-ops-muted">Role:</span>
              <span className="text-text-ops-primary">{task.placeholder_name}</span>
            </div>

            {/* Required skill */}
            {task.required_skill && (
              <div className="flex items-center gap-2">
                <Wrench size={12} className="text-text-ops-muted" />
                <span className="text-text-ops-muted">Skill:</span>
                <span className="text-text-ops-primary">{task.required_skill}</span>
              </div>
            )}

            {/* Min proficiency */}
            {task.min_proficiency !== null && (
              <div className="flex items-center gap-2">
                <span className="text-text-ops-muted">Min Level:</span>
                <span className="text-text-ops-primary">
                  {PROFICIENCY_LABELS[task.min_proficiency] || task.min_proficiency}
                </span>
              </div>
            )}

            {/* Due date */}
            {task.planned_end_date && (
              <div className="flex items-center gap-2">
                <Clock size={12} className="text-text-ops-muted" />
                <span className="text-text-ops-muted">Due:</span>
                <span className="text-text-ops-primary font-mono">
                  {task.planned_end_date}
                </span>
              </div>
            )}

            {/* Classification */}
            <div className="flex items-center gap-2">
              <span className="text-text-ops-muted">Classification:</span>
              <span className="text-text-ops-primary">{task.security_classification}</span>
            </div>

            {/* Delivery mode */}
            {task.delivery_mode && (
              <div className="flex items-center gap-2">
                <span className="text-text-ops-muted">Mode:</span>
                <span className="text-text-ops-primary">{task.delivery_mode}</span>
              </div>
            )}
          </div>

          {/* Caveats */}
          {task.caveats && task.caveats.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {task.caveats.map((caveat) => (
                <span
                  key={caveat}
                  className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-red-900/30 text-red-400 border border-red-500/30"
                >
                  {caveat}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const ClaimableQueue: React.FC<ClaimableQueueProps> = ({ tasks, onClaimed }) => {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-text-ops-muted">
        <UserPlus size={28} className="mb-2 opacity-40" />
        <span className="text-sm italic">No claimable tasks available</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-text-ops-primary flex items-center gap-2">
          <UserPlus size={14} />
          Available to Pick Up
          <span className="text-xs font-mono text-text-ops-muted">
            ({tasks.length} tasks)
          </span>
        </h3>
      </div>

      {/* Task accordion */}
      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <ClaimableTaskItem key={task.id} task={task} onClaimed={onClaimed} />
        ))}
      </div>
    </div>
  );
};

export default ClaimableQueue;
