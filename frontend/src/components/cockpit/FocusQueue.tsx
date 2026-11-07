/**
 * Focus Queue List Component
 *
 * Ranked card list of the user's active, in-progress, and upcoming assigned tasks.
 * Ordered by CPM critical path status (critical first) then by due date.
 *
 * Each card provides direct inline action buttons:
 * - +5% and +10% physical progress increments
 * - Done button (triggers verification check; alerts if V&V sign-off is missing)
 * - Quick Log Hours: inline input to commit today's hours
 * - Flag Blocker: opens modal to create a NodeBlocker
 *
 * Data source: GET /api/v1/cockpit/focus-queue
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  ShieldAlert,
  TriangleAlert,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../services/api';
import { FocusQueueTask, ProgressUpdateRequest } from '../../types/cockpit';
import { useHoverInspector } from '../../hooks/useHoverInspector';
import { useContextMenu } from '../common/contextmenu/ContextMenuProvider';
import HoverSummaryModal from '../common/HoverSummaryModal';
import PresenceAvatars from '../common/PresenceAvatars';
import { ExportControlBadge } from '../../views/compliance/ExportControlDashboardView';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FocusQueueListProps {
  /** Tasks from the focus queue API */
  tasks: FocusQueueTask[];
  /** Called after a progress update to refresh the queue */
  onRefresh?: () => void;
  /** Opens the blocker modal for a given task */
  onFlagBlocker?: (task: FocusQueueTask) => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Mini progress bar with percentage text.
 */
const ProgressBar: React.FC<{ percent: number; isCritical?: boolean }> = ({
  percent,
  isCritical,
}) => {
  const color =
    percent >= 100
      ? 'bg-emerald-500'
      : isCritical
        ? 'bg-red-500'
        : percent >= 75
          ? 'bg-amber-500'
          : 'bg-sky-500';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-bg-ops-overlay rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-300', color)}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <span className="text-xs font-mono text-text-ops-muted min-w-[3rem] text-right">
        {percent}%
      </span>
    </div>
  );
};

/**
 * Hours logging inline input.
 */
const HoursLogger: React.FC<{
  taskId: string;
  onRefresh?: () => void;
}> = ({ taskId, onRefresh }) => {
  const [hours, setHours] = useState('');
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const h = parseFloat(hours);
      if (isNaN(h) || h <= 0) {
        setError('Enter valid hours');
        return;
      }
      setLogging(true);
      setError(null);
      try {
        await api.post(`/cockpit/tasks/${taskId}/progress`, {
          increment: 0,
          hours_logged: h,
        } as ProgressUpdateRequest);
        setHours('');
        onRefresh?.();
      } catch {
        setError('Failed to log hours');
      } finally {
        setLogging(false);
      }
    },
    [hours, taskId, onRefresh],
  );

  return (
    <form onSubmit={submit} className="flex items-center gap-1">
      <input
        type="number"
        step="0.5"
        min="0"
        max="24"
        value={hours}
        onChange={(e) => setHours(e.target.value)}
        placeholder="hrs"
        className={clsx(
          'w-16 px-2 py-1 text-xs font-mono rounded border',
          'bg-bg-ops-base border-border-ops-subtle text-text-ops-primary',
          'focus:outline-none focus:border-sky-500',
          error && 'border-red-500',
        )}
      />
      <button
        type="submit"
        disabled={logging || !hours}
        className={clsx(
          'px-2 py-1 text-xs rounded border transition-colors',
          'border-border-ops-subtle text-text-ops-muted',
          'hover:bg-bg-ops-overlay hover:text-text-ops-primary',
          'disabled:opacity-30 disabled:cursor-not-allowed',
        )}
      >
        {logging ? '...' : 'Log'}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </form>
  );
};

// ---------------------------------------------------------------------------
// Task Card
// ---------------------------------------------------------------------------

const TaskCard: React.FC<{
  task: FocusQueueTask;
  onRefresh?: () => void;
  onFlagBlocker?: (task: FocusQueueTask) => void;
}> = ({ task, onRefresh, onFlagBlocker }) => {
  const [updating, setUpdating] = useState<string | null>(null);
  const [vvAlert, setVvAlert] = useState(false);

  // Context menu
  const { openContextMenu } = useContextMenu();

  // Hover inspector for task cards
  const cardRef = useRef<HTMLDivElement>(null);
  const hoverInspector = useHoverInspector({
    targetData: {
      entityType: 'TASK',
      entityId: task.id,
    },
    enterDelayMs: 5000,
    exitDelayMs: 2000,
  });

  // Wire the card ref to the hook for positioning
  useEffect(() => {
    if (hoverInspector.handlers.onRef) {
      hoverInspector.handlers.onRef(cardRef.current);
    }
  }, [hoverInspector.handlers.onRef]);

  const isCritical = task.is_critical === true || (task.total_float !== null && task.total_float <= 0);
  const isMasked = task.is_masked === true;
  const hasBlockers = task.blockers && task.blockers.length > 0;
  const isComplete = task.percent_complete >= 100;

  const updateProgress = useCallback(
    async (increment: number | 'complete') => {
      setUpdating(String(increment));
      try {
        const resp = await api.post<ProgressUpdateRequest, { data: { vv_signoff_missing?: boolean } }>(
          `/cockpit/tasks/${task.id}/progress`,
          { increment },
        );

        // If setting to complete and V&V sign-off is missing, show alert
        if (increment === 'complete' && resp?.data?.vv_signoff_missing) {
          setVvAlert(true);
          setTimeout(() => setVvAlert(false), 5000);
        } else {
          onRefresh?.();
        }
      } catch {
        // Silently fail — API interceptor handles 401
      } finally {
        setUpdating(null);
      }
    },
    [task.id, onRefresh],
  );

  const handleCardMouseEnter = () => {
    hoverInspector.handlers.onMouseEnter();
  };

  const handleCardMouseLeave = () => {
    hoverInspector.handlers.onMouseLeave();
  };

  const handleCardContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu(e, 'KANBAN_CARD', {
      nodeId: task.id,
      code: task.code,
      percentComplete: task.percent_complete,
      isCritical: task.is_critical,
      hasBlockers: !!(task.blockers && task.blockers.length > 0),
    });
  };

  return (
    <>
      <div
        ref={cardRef}
        className={clsx(
          'group relative flex flex-col gap-3 p-4 rounded-lg border transition-all',
          'bg-bg-ops-surface',
          isCritical
            ? 'border-l-4 border-l-red-500 border-y-border-ops-subtle border-r-border-ops-subtle'
            : 'border-border-ops-subtle',
          isComplete && 'opacity-60',
          'hover:border-border-ops-strong',
        )}
        onMouseEnter={handleCardMouseEnter}
        onMouseLeave={handleCardMouseLeave}
        onContextMenu={handleCardContextMenu}
      >
      {/* V&V Alert Banner */}
      {vvAlert && (
        <div className="flex items-center gap-2 p-2 mb-2 rounded bg-red-900/30 border border-red-500/40 text-red-400 text-xs">
          <ShieldAlert size={14} />
          Cannot complete: V&V test sign-off is required. All mandatory verification tests must be PASSED or WAIVED.
          <button onClick={() => setVvAlert(false)} className="ml-auto">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Header: Code + Name + Badges */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-text-ops-muted">{task.code}</span>
            {isCritical && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-red-900/40 text-red-400">
                Critical
              </span>
            )}
            {hasBlockers && (
              <span className="text-amber-400" title={`${task.blockers?.length} active blocker(s)`}>
                <AlertTriangle size={14} />
              </span>
            )}
            {task.requires_vv_signoff && (
              <span className="text-sky-400" title="Requires V&V sign-off">
                <ShieldAlert size={14} />
              </span>
            )}
            {/* Presence Avatars — colleagues inspecting this task */}
            <PresenceAvatars nodeId={task.id} size={18} />
          </div>

          {isMasked ? (
            <div className="flex items-center gap-1 text-sm italic text-text-ops-muted">
              <Lock size={12} />
              [RESTRICTED]
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <div className="text-sm text-text-ops-primary truncate">{task.name}</div>
              <ExportControlBadge
                regime={task.export_control_regime ?? null}
                taaReference={task.taa_mla_reference ?? null}
              />
            </div>
          )}
        </div>

        {/* Due date */}
        {task.planned_end_date && !isMasked && (
          <div className="flex flex-col items-end text-xs font-mono text-text-ops-muted">
            <span className="text-[10px] uppercase">Due</span>
            <span>{task.planned_end_date}</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {!isMasked && (
        <ProgressBar percent={task.percent_complete} isCritical={isCritical} />
      )}

      {/* Action buttons */}
      {!isMasked && !isComplete && (
        <div className="flex items-center gap-2 pt-1">
          {/* Progress increments */}
          <button
            onClick={() => updateProgress(5)}
            disabled={updating !== null}
            className={clsx(
              'px-2 py-1 text-xs rounded border transition-colors',
              'border-border-ops-subtle text-text-ops-muted',
              'hover:bg-sky-900/30 hover:text-sky-400 hover:border-sky-500/40',
              'disabled:opacity-30 disabled:cursor-not-allowed',
            )}
            title="Add 5% progress"
          >
            +5%
          </button>
          <button
            onClick={() => updateProgress(10)}
            disabled={updating !== null}
            className={clsx(
              'px-2 py-1 text-xs rounded border transition-colors',
              'border-border-ops-subtle text-text-ops-muted',
              'hover:bg-sky-900/30 hover:text-sky-400 hover:border-sky-500/40',
              'disabled:opacity-30 disabled:cursor-not-allowed',
            )}
            title="Add 10% progress"
          >
            +10%
          </button>
          <button
            onClick={() => updateProgress('complete')}
            disabled={updating !== null}
            className={clsx(
              'px-2 py-1 text-xs rounded border transition-colors',
              'border-emerald-500/40 text-emerald-400',
              'hover:bg-emerald-900/30',
              'disabled:opacity-30 disabled:cursor-not-allowed',
            )}
            title="Mark as complete"
          >
            <span className="flex items-center gap-1">
              <CheckCircle2 size={12} />
              Done
            </span>
          </button>

          <div className="flex-1" />

          {/* Quick Log Hours */}
          <HoursLogger taskId={task.id} onRefresh={onRefresh} />

          {/* Flag Blocker */}
          <button
            onClick={() => onFlagBlocker?.(task)}
            className={clsx(
              'px-2 py-1 text-xs rounded border transition-colors',
              'border-amber-500/40 text-amber-400',
              'hover:bg-amber-900/30',
            )}
            title="Flag a blocker"
          >
            <span className="flex items-center gap-1">
              <TriangleAlert size={12} />
              Blocker
            </span>
          </button>
        </div>
      )}

      {/* Completed state */}
      {isComplete && (
        <div className="flex items-center gap-1 text-xs text-emerald-400">
          <CheckCircle2 size={12} />
          Complete
        </div>
      )}
    </div>

      {/* Hover Summary Modal — rendered when dwell timer triggers */}
      {hoverInspector.state.isOpen && (
        <HoverSummaryModal
          targetData={{ entityType: 'TASK', entityId: task.id }}
          position={hoverInspector.state.position}
          placement={hoverInspector.state.placement}
          isExiting={hoverInspector.state.isExiting}
          onClose={hoverInspector.close}
          onMouseEnter={hoverInspector.modalCallbacks.onMouseEnter}
          onMouseLeave={hoverInspector.modalCallbacks.onMouseLeave}
          floatingStyles={hoverInspector.floatingStyles}
          floatingRef={hoverInspector.refs?.setFloating}
        />
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const FocusQueue: React.FC<FocusQueueListProps> = ({
  tasks,
  onRefresh,
  onFlagBlocker,
}) => {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-text-ops-muted">
        <Clock size={32} className="mb-3 opacity-40" />
        <span className="text-sm italic">No active tasks in your focus queue</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-text-ops-primary flex items-center gap-2">
          <Clock size={14} />
          Focus Queue
          <span className="text-xs font-mono text-text-ops-muted">
            ({tasks.length} tasks)
          </span>
        </h3>
      </div>

      {/* Task cards */}
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onRefresh={onRefresh}
          onFlagBlocker={onFlagBlocker}
        />
      ))}
    </div>
  );
};

export default FocusQueue;
