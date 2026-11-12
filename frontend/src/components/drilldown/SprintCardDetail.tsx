/**
 * Sprint Card Detail Panel
 *
 * Opens as an overlay when a Kanban card is double-clicked, allowing quick
 * editing of the most relevant sprint work item fields without leaving the
 * Kanban board context.
 *
 * Editable fields:
 * - Task name
 * - Description / notes
 * - Priority (0-1000, auto-assigned on creation)
 * - Progress (%)
 * - Assignee
 * - Estimated duration (days)
 * - Blocker reason (when blocked)
 * - Predecessors / Successors (read-only, linked to WBS table)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Save, AlertTriangle, Clock, User, Link2, Flag } from 'lucide-react';
import { clsx } from 'clsx';
import { WBSRow } from '../../types/wbs';
import { useScheduleStore } from '../../stores/useScheduleStore';
import { KanbanStatus } from './MiniKanban';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SprintCardDetailProps {
  /** The WBS row being edited */
  row: WBSRow;
  /** Current Kanban status of the card */
  status: KanbanStatus;
  /** Callback to close the detail panel */
  onClose: () => void;
  /** Callback when status changes */
  onStatusChange?: (nodeId: string, newStatus: KanbanStatus) => void;
}

interface FormState {
  name: string;
  description: string;
  priority: number;
  percentComplete: number;
  assignee: string;
  blockerReason: string;
  durationDays: number;
}

import { addWorkdays } from '../../utils/scheduleCalculator';

/** Compute end date from start date + duration in workdays, plus lag */
function getEndDate(startDate: string, durationDays: number, lagDays: number = 0): string {
  const totalWorkdays = durationDays + lagDays;
  return addWorkdays(startDate, Math.max(0, totalWorkdays - 1));
}

/** Get today's date as ISO string */
function getTodayISO(): string {
  return new Date().toISOString().substring(0, 10);
}

// ---------------------------------------------------------------------------
// Helper: extract custom attribute values
// ---------------------------------------------------------------------------

function extractFormState(row: WBSRow): FormState {
  const ca = row.custom_attributes || {};
  // Use first-class duration_days, falling back to computed dates
  let durationDays = (row.duration_days as number) ?? 1;
  if (durationDays <= 0 && row.planned_start_date && row.planned_end_date) {
    const start = new Date(row.planned_start_date);
    const end = new Date(row.planned_end_date);
    const diffMs = end.getTime() - start.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays > 0) durationDays = diffDays;
  }
  return {
    name: row.name || '',
    description: (ca.description as string) || '',
    priority: (ca.priority as number) ?? 0,
    percentComplete: row.percent_complete ?? 0,
    assignee: (ca.assignee as string) || '',
    blockerReason: (ca.blocker_reason as string) || '',
    durationDays: Math.max(1, durationDays),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SprintCardDetail: React.FC<SprintCardDetailProps> = ({
  row,
  status: initialStatus,
  onClose,
  onStatusChange,
}) => {
  const updateNode = useScheduleStore((s) => s.updateNode);
  const dependencies = useScheduleStore((s) => s.dependencies);
  // Always read the latest row from the store so the popup stays in sync when the card moves
  const liveRow = useScheduleStore((s) => s.rows.find((r) => r.id === row.id) ?? row);

  const formRef = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState<FormState>(extractFormState(row));
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Track the current status locally so the UI updates when the user clicks a different status button
  const [currentStatus, setCurrentStatus] = useState<KanbanStatus>(initialStatus);

  // Sync form and status when the live row changes (e.g., card moved in the board)
  useEffect(() => {
    setForm(extractFormState(liveRow));
    // Derive status from the live row's custom_attributes
    const liveStatus = (liveRow.custom_attributes?.kanban_status as KanbanStatus) || initialStatus;
    setCurrentStatus(liveStatus);
    setIsDirty(false);
  }, [liveRow.id, liveRow.version_id, liveRow.percent_complete, initialStatus]);

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Collect predecessors and successors for this node, resolving codes from rows
  const rows = useScheduleStore((s) => s.rows);
  const preds = dependencies.filter((d) => d.successor_id === liveRow.id);
  const succs = dependencies.filter((d) => d.predecessor_id === liveRow.id);
  const predCodes = preds.map((d) => rows.find((r) => r.id === d.predecessor_id)?.code ?? d.predecessor_id.substring(0, 8));
  const succCodes = succs.map((d) => rows.find((r) => r.id === d.successor_id)?.code ?? d.successor_id.substring(0, 8));

  const handleChange = useCallback(
    (field: keyof FormState, value: string | number | undefined) => {
      setForm((prev) => ({ ...prev, [field]: value as any }));
      setIsDirty(true);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!isDirty) {
      onClose();
      return;
    }
    setIsSaving(true);

    const customAttributes = {
      ...(liveRow.custom_attributes || {}),
      description: form.description,
      priority: form.priority,
      assignee: form.assignee,
      blocker_reason: form.blockerReason,
      kanban_status: currentStatus,
      is_blocked: currentStatus === 'BLOCKED',
    };

    // Compute planned dates from duration if status is IN_PROGRESS
    let plannedStartDate = undefined;
    let plannedEndDate = undefined;
    if (currentStatus === 'IN_PROGRESS') {
      plannedStartDate = liveRow.planned_start_date || getTodayISO();
      const lag = (liveRow.lag_days as number) ?? 0;
      plannedEndDate = getEndDate(plannedStartDate, form.durationDays, lag);
    }

    try {
      const result = await updateNode(liveRow.id, {
        name: form.name,
        percent_complete: form.percentComplete,
        duration_days: form.durationDays,
        planned_start_date: plannedStartDate,
        planned_end_date: plannedEndDate,
        custom_attributes: customAttributes,
      });
      if (!result.success) {
        console.error('Failed to save sprint card:', liveRow.id);
      }
      setIsDirty(false);
      onClose();
    } finally {
      setIsSaving(false);
    }
  }, [form, isDirty, liveRow, currentStatus, updateNode, onClose]);

  const handleStatusChange = useCallback(
    (newStatus: KanbanStatus) => {
      setCurrentStatus(newStatus);
      setIsDirty(true);
      onStatusChange?.(liveRow.id, newStatus);
      // Auto-set start date to today when moving to In Progress
      if (newStatus === 'IN_PROGRESS' && !liveRow.planned_start_date) {
        const today = getTodayISO();
        const lag = (liveRow.lag_days as number) ?? 0;
        const endDate = getEndDate(today, form.durationDays, lag);
        updateNode(liveRow.id, {
          planned_start_date: today,
          planned_end_date: endDate,
        });
      }
      // Update blocker reason field when status changes to blocked
      if (newStatus === 'BLOCKED' && !form.blockerReason) {
        handleChange('blockerReason', 'Flagged on Kanban board');
      } else if (newStatus !== 'BLOCKED') {
        handleChange('blockerReason', '');
      }
    },
    [liveRow.id, liveRow.planned_start_date, onStatusChange, form.blockerReason, form.durationDays, handleChange, updateNode],
  );

  // Status color mapping
  const statusColorMap: Record<KanbanStatus, string> = {
    BACKLOG: 'bg-slate-700 text-slate-200',
    IN_PROGRESS: 'bg-sky-700 text-sky-200',
    BLOCKED: 'bg-rose-700 text-rose-200',
    COMPLETED: 'bg-emerald-700 text-emerald-200',
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${liveRow.code}: ${liveRow.name}`}
    >
      <div className="bg-bg-ops-surface border border-border-ops-subtle rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-ops-subtle bg-bg-ops-overlay/50 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs font-mono font-semibold text-text-ops-muted">{liveRow.code}</span>
            <span className={clsx('px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border', statusColorMap[currentStatus])}>
              {currentStatus}
            </span>
            {currentStatus === 'BLOCKED' && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-rose-400">
                <AlertTriangle size={12} /> BLOCKED
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors"
            title="Close (Escape)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form
          ref={formRef}
          className="flex-1 overflow-y-auto p-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          {/* Task Name */}
          <div>
            <label className="block text-xs font-medium text-text-ops-muted mb-1">
              Task Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full px-3 py-2 bg-bg-ops-base border border-border-ops-subtle rounded-lg text-sm text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500"
              placeholder="Enter task name..."
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-text-ops-muted mb-1">
              Description / Notes
            </label>
            <textarea
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-bg-ops-base border border-border-ops-subtle rounded-lg text-sm text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 resize-none"
              placeholder="As a user, I want..."
            />
          </div>

          {/* Row: Priority, Progress, Assignee */}
          <div className="grid grid-cols-3 gap-3">
            {/* Priority */}
            <div>
              <label className="block text-xs font-medium text-text-ops-muted mb-1 flex items-center gap-1">
                <Flag size={12} /> Priority (0-1000)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={1000}
                  step={10}
                  value={form.priority}
                  onChange={(e) => handleChange('priority', Math.max(0, Math.min(1000, Number(e.target.value))))}
                  className="w-full px-3 py-2 bg-bg-ops-base border border-border-ops-subtle rounded-lg text-sm font-mono text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                />
                <div
                  className={clsx(
                    'w-3 h-3 rounded-full flex-shrink-0',
                    form.priority >= 800 ? 'bg-rose-500' :
                    form.priority >= 500 ? 'bg-amber-500' :
                    'bg-blue-500',
                  )}
                  title={`Priority level: ${form.priority >= 800 ? 'High' : form.priority >= 500 ? 'Medium' : 'Low'}`}
                />
              </div>
            </div>

            {/* Progress */}
            <div>
              <label className="block text-xs font-medium text-text-ops-muted mb-1 flex items-center gap-1">
                <Clock size={12} /> Progress (%)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={form.percentComplete}
                  onChange={(e) => handleChange('percentComplete', Number(e.target.value))}
                  className="flex-1 accent-sky-500"
                />
                <span className="text-xs font-mono text-text-ops-primary w-10 text-right">
                  {form.percentComplete}%
                </span>
              </div>
            </div>

            {/* Assignee */}
            <div>
              <label className="block text-xs font-medium text-text-ops-muted mb-1 flex items-center gap-1">
                <User size={12} /> Assignee
              </label>
              <input
                type="text"
                value={form.assignee}
                onChange={(e) => handleChange('assignee', e.target.value)}
                className="w-full px-3 py-2 bg-bg-ops-base border border-border-ops-subtle rounded-lg text-sm text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500"
                placeholder="Assign to..."
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs font-medium text-text-ops-muted mb-1 flex items-center gap-1">
              <Clock size={12} /> Estimated Duration (days)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={form.durationDays}
              onChange={(e) => handleChange('durationDays', Math.max(1, Number(e.target.value)))}
              className="w-full px-3 py-2 bg-bg-ops-base border border-border-ops-subtle rounded-lg text-sm font-mono text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-sky-500/50"
            />
            {currentStatus === 'IN_PROGRESS' && liveRow.planned_start_date && (
              <div className="mt-1 text-[10px] text-text-ops-muted">
                Start: {liveRow.planned_start_date.substring(0, 10)} → End: {getEndDate(liveRow.planned_start_date, form.durationDays)}
              </div>
            )}
          </div>

          {/* Status Selector */}
          <div>
            <label className="block text-xs font-medium text-text-ops-muted mb-1">
              Status
            </label>
            <div className="flex gap-2">
              {(['BACKLOG', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'] as KanbanStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleStatusChange(s)}
                  className={clsx(
                    'flex-1 px-3 py-2 rounded-lg text-xs font-mono font-bold uppercase border transition-all',
                    currentStatus === s
                      ? `${statusColorMap[s]} border-transparent ring-2 ring-white/20`
                      : 'bg-bg-ops-overlay border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong',
                  )}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Blocker Reason (shown when blocked) */}
          {currentStatus === 'BLOCKED' && (
            <div className="p-3 bg-rose-950/30 border border-rose-700/50 rounded-lg">
              <label className="block text-xs font-medium text-rose-400 mb-1 flex items-center gap-1">
                <AlertTriangle size={12} /> Blocker Reason
              </label>
              <textarea
                value={form.blockerReason}
                onChange={(e) => handleChange('blockerReason', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-bg-ops-base border border-rose-700/50 rounded-lg text-sm text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-rose-500/50 resize-none"
                placeholder="Describe what is blocking this task..."
              />
            </div>
          )}

          {/* Dependencies (read-only) */}
          <div>
            <label className="block text-xs font-medium text-text-ops-muted mb-1 flex items-center gap-1">
              <Link2 size={12} /> Dependencies
            </label>
            <div className="space-y-1">
              {predCodes.length > 0 && (
                <div className="text-xs text-text-ops-muted">
                  <span className="font-medium">Predecessors:</span>{' '}
                  {predCodes.join(', ')}
                </div>
              )}
              {succCodes.length > 0 && (
                <div className="text-xs text-text-ops-muted">
                  <span className="font-medium">Successors:</span>{' '}
                  {succCodes.join(', ')}
                </div>
              )}
              {preds.length === 0 && succs.length === 0 && (
                <div className="text-xs text-text-ops-muted/50 italic">No dependencies</div>
              )}
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border-ops-subtle bg-bg-ops-overlay/30 flex-shrink-0">
          <div className="text-xs text-text-ops-muted">
            {isDirty ? 'Unsaved changes' : 'All changes saved'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-text-ops-muted hover:text-text-ops-primary border border-border-ops-subtle rounded-lg hover:bg-bg-ops-overlay transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty && !isSaving}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors',
                isDirty
                  ? 'bg-sky-600 hover:bg-sky-500 text-white'
                  : 'bg-bg-ops-overlay text-text-ops-muted/50 cursor-not-allowed',
              )}
            >
              {isSaving ? (
                <Clock size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SprintCardDetail;
