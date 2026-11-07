/**
 * Weekly Micro Timesheet Component
 *
 * Compact 7-day matrix (Mon–Sun) mapping scheduled CPM tasks to logged hours.
 * Each day cell displays:
 * - Day name and date
 * - Scheduled hours (from CPM assignments)
 * - Logged hours (user-entered)
 * - Associated task code/name
 *
 * Weekends are visually dimmed. Today's date is highlighted.
 * Displays total chargeable hours and a 'Submit Week for CAM Approval' action button.
 *
 * Data source: Computed from GET /api/v1/timesheets/oracle/prepopulate
 * and local state for logged hours.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Send,
  AlertCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../services/api';
import { TimesheetDay, WeeklyTimesheetSnapshot } from '../../types/cockpit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WeeklyMicroTimesheetProps {
  /** Weekly timesheet data */
  snapshot: WeeklyTimesheetSnapshot | null;
  /** Called after successful submission */
  onSubmitted?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Single day cell in the timesheet grid.
 */
const DayCell: React.FC<{
  day: TimesheetDay;
  onHoursChange?: (date: string, hours: number) => void;
}> = ({ day, onHoursChange }) => {
  const [editing, setEditing] = useState(false);
  const [localHours, setLocalHours] = useState(day.logged_hours.toString());

  const handleSave = useCallback(() => {
    const h = parseFloat(localHours);
    if (!isNaN(h) && h >= 0) {
      onHoursChange?.(day.date, h);
    }
    setEditing(false);
  }, [localHours, day.date, onHoursChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        setLocalHours(day.logged_hours.toString());
        setEditing(false);
      }
    },
    [handleSave, day.logged_hours],
  );

  const isOverlogged = day.logged_hours > day.scheduled_hours && day.scheduled_hours > 0;
  const isUnderlogged = day.logged_hours < day.scheduled_hours && day.scheduled_hours > 0;

  return (
    <div
      className={clsx(
        'flex flex-col p-2 rounded-lg border transition-colors min-w-[90px]',
        day.is_weekend
          ? 'bg-bg-ops-base/50 border-border-ops-subtle/30 opacity-50'
          : 'bg-bg-ops-surface border-border-ops-subtle',
        day.is_today && !day.is_weekend && 'ring-1 ring-sky-500/40',
      )}
    >
      {/* Day header */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-text-ops-primary">
          {day.day_name}
        </span>
        {day.is_today && (
          <span className="text-[9px] font-bold uppercase tracking-wider text-sky-400">
            Today
          </span>
        )}
      </div>

      {/* Date */}
      <span className="text-[10px] font-mono text-text-ops-muted mb-2">
        {day.date.slice(5)} {/* MM-DD */}
      </span>

      {/* Scheduled hours */}
      {day.scheduled_hours > 0 && (
        <div className="flex items-center gap-1 mb-1">
          <Clock size={10} className="text-text-ops-muted" />
          <span className="text-[10px] text-text-ops-muted">
            {day.scheduled_hours.toFixed(1)}h planned
          </span>
        </div>
      )}

      {/* Logged hours */}
      <div className="flex items-center gap-1 mt-auto">
        {editing ? (
          <input
            type="number"
            step="0.5"
            min="0"
            max="24"
            value={localHours}
            onChange={(e) => setLocalHours(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            autoFocus
            className={clsx(
              'w-16 px-1 py-0.5 text-xs font-mono rounded border',
              'bg-bg-ops-base border-border-ops-subtle text-text-ops-primary',
              'focus:outline-none focus:border-sky-500',
            )}
          />
        ) : (
          <button
            onClick={() => {
              if (!day.is_weekend) {
                setEditing(true);
                setLocalHours(day.logged_hours.toString());
              }
            }}
            disabled={day.is_weekend}
            className={clsx(
              'flex items-center gap-1 px-1.5 py-0.5 text-xs font-mono rounded transition-colors',
              'hover:bg-bg-ops-overlay',
              'disabled:cursor-default',
              isOverlogged && 'text-amber-400',
              isUnderlogged && 'text-sky-400',
              !isOverlogged && !isUnderlogged && 'text-text-ops-primary',
            )}
            title="Click to edit logged hours"
          >
            {day.logged_hours > 0 ? `${day.logged_hours.toFixed(1)}h` : '—'}
          </button>
        )}
      </div>

      {/* Task code */}
      {day.task_code && (
        <span className="text-[9px] font-mono text-text-ops-muted mt-1 truncate" title={day.task_name || day.task_code}>
          {day.task_code}
        </span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const WeeklyMicroTimesheet: React.FC<WeeklyMicroTimesheetProps> = ({ snapshot, onSubmitted }) => {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<TimesheetDay[]>([]);

  // Sync days from snapshot
  React.useEffect(() => {
    if (snapshot) {
      setDays(snapshot.days);
      setSubmitted(false);
    }
  }, [snapshot]);

  // Update a single day's logged hours
  const handleHoursChange = useCallback(
    (date: string, hours: number) => {
      setDays((prev) =>
        prev.map((d) => (d.date === date ? { ...d, logged_hours: hours } : d)),
      );
    },
    [],
  );

  // Computed totals
  const totals = useMemo(() => {
    const totalScheduled = days.reduce((sum, d) => sum + d.scheduled_hours, 0);
    const totalLogged = days.reduce((sum, d) => sum + d.logged_hours, 0);
    return { totalScheduled, totalLogged };
  }, [days]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      // Create an Oracle batch for the week
      await api.post('/timesheets/oracle/batches/create', {
        period_start: snapshot?.week_start,
        period_end: snapshot?.week_end,
      });
      setSubmitted(true);
      onSubmitted?.();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to submit timesheet';
      setError(typeof msg === 'string' ? msg : 'Failed to submit timesheet');
    } finally {
      setSubmitting(false);
    }
  }, [snapshot, onSubmitted]);

  if (!snapshot || days.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-text-ops-muted">
        <Calendar size={28} className="mb-2 opacity-40" />
        <span className="text-sm italic">No timesheet data available</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-ops-primary flex items-center gap-2">
          <Calendar size={14} />
          Weekly Timesheet
          <span className="text-xs font-mono text-text-ops-muted">
            ({snapshot.week_start} → {snapshot.week_end})
          </span>
        </h3>

        {/* Summary stats */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="text-text-ops-muted">
            Scheduled: <span className="text-text-ops-primary">{totals.totalScheduled.toFixed(1)}h</span>
          </span>
          <span className="text-text-ops-muted">
            Logged: <span className="text-text-ops-primary">{totals.totalLogged.toFixed(1)}h</span>
          </span>
          <span className="text-text-ops-muted">
            Capacity: <span className="text-text-ops-primary">{snapshot.weekly_capacity_hours.toFixed(1)}h</span>
          </span>
        </div>
      </div>

      {/* Submitted state */}
      {submitted && (
        <div className="flex items-center gap-2 p-2 rounded bg-emerald-900/30 border border-emerald-500/40 text-emerald-400 text-xs">
          <CheckCircle2 size={14} />
          Timesheet submitted for CAM approval.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-2 rounded bg-red-900/30 border border-red-500/40 text-red-400 text-xs">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* 7-day grid */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => (
          <DayCell key={day.date} day={day} onHoursChange={handleHoursChange} />
        ))}
      </div>

      {/* Capacity bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-bg-ops-overlay rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all duration-300',
              totals.totalLogged > snapshot.weekly_capacity_hours
                ? 'bg-red-500'
                : totals.totalLogged > snapshot.weekly_capacity_hours * 0.85
                  ? 'bg-amber-500'
                  : 'bg-sky-500',
            )}
            style={{
              width: `${Math.min(100, (totals.totalLogged / snapshot.weekly_capacity_hours) * 100)}%`,
            }}
          />
        </div>
        <span className="text-xs font-mono text-text-ops-muted">
          {totals.totalLogged.toFixed(1)} / {snapshot.weekly_capacity_hours.toFixed(1)}h
        </span>
      </div>

      {/* Submit button */}
      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={submitting || submitted || totals.totalLogged === 0}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded transition-colors',
            'bg-sky-600 text-white hover:bg-sky-500',
            'disabled:opacity-30 disabled:cursor-not-allowed',
          )}
        >
          {submitting ? (
            'Submitting...'
          ) : (
            <>
              <Send size={14} />
              Submit for CAM Approval
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default WeeklyMicroTimesheet;
