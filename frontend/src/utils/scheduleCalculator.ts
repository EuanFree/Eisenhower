/**
 * Schedule Calculator & Auto-Scheduling Engine
 *
 * Implements client-side automatic CPM date cascades and working-day arithmetic.
 *
 * Scheduling Modes:
 * - 'AUTO': Dates are driven by predecessor finish dates and task durations.
 *   When a predecessor shifts or duration changes, downstream dates automatically
 *   cascade forward/backward along dependency links.
 * - 'MANUAL': Dates are fixed/pinned to user-specified dates and do not automatically
 *   shift when predecessors move.
 */

import { WBSRow, SchedulingMode } from '../types/wbs';

export interface ScheduleDependencyLink {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: 'FS' | 'SS' | 'FF' | 'SF';
  lag_days: number;
}

/**
 * Add working days (Mon-Fri) to a date string (YYYY-MM-DD).
 */
export function addWorkdays(dateStr: string, days: number): string {
  if (!dateStr) return dateStr;
  const date = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00Z'));
  if (isNaN(date.getTime())) return dateStr;

  if (days === 0) {
    // Ensure it falls on a working day
    let dow = date.getUTCDay();
    while (dow === 0 || dow === 6) {
      date.setUTCDate(date.getUTCDate() + 1);
      dow = date.getUTCDay();
    }
    return date.toISOString().split('T')[0];
  }

  const direction = days > 0 ? 1 : -1;
  let remaining = Math.abs(days);

  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + direction);
    const dow = date.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      remaining--;
    }
  }

  return date.toISOString().split('T')[0];
}

/**
 * Subtract working days from a date string.
 */
export function subtractWorkdays(dateStr: string, days: number): string {
  return addWorkdays(dateStr, -days);
}

/**
 * Calculate working day duration between start and end date (inclusive).
 * E.g., same day = 1 day, Mon to Tue = 2 days.
 */
export function calculateWorkdayDuration(startStr: string | null, endStr: string | null): number {
  if (!startStr || !endStr) return 1;
  const start = new Date(startStr + (startStr.includes('T') ? '' : 'T00:00:00Z'));
  const end = new Date(endStr + (endStr.includes('T') ? '' : 'T00:00:00Z'));
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 1;

  if (start > end) return 1;

  let count = 0;
  const curr = new Date(start);
  while (curr <= end) {
    const dow = curr.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      count++;
    }
    curr.setUTCDate(curr.getUTCDate() + 1);
  }

  return Math.max(1, count);
}

/**
 * Compute finish date given a start date and duration in working days.
 * Optionally includes lag days (idle time within the task).
 * E.g. start Mon, duration 1d, lag 0 -> Mon.
 * start Mon, duration 2d, lag 0 -> Tue.
 * start Mon, duration 2d, lag 1 -> Wed.
 */
export function computeFinishDate(startStr: string, durationDays: number, lagDays: number = 0): string {
  if (!startStr) return startStr;
  const total = Math.max(1, Math.round(durationDays + lagDays));
  if (total <= 1) {
    return addWorkdays(startStr, 0);
  }
  return addWorkdays(startStr, total - 1);
}

/**
 * Compute the duration in workdays between two dates (inclusive).
 * This is the reverse of computeFinishDate: given start and end dates,
 * return the number of working days.
 * E.g. Mon to Mon = 1, Mon to Tue = 2, Mon to Wed = 3.
 */
export function computeDurationFromDates(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0;
  return calculateWorkdayDuration(startStr, endStr);
}

/**
 * Get effective scheduling mode for a node (defaults to 'AUTO').
 */
export function getNodeSchedulingMode(node: { scheduling_mode?: SchedulingMode | null; custom_attributes?: Record<string, unknown> }): SchedulingMode {
  if (node.scheduling_mode === 'MANUAL' || node.scheduling_mode === 'AUTO') {
    return node.scheduling_mode;
  }
  if (node.custom_attributes?.scheduling_mode === 'MANUAL') {
    return 'MANUAL';
  }
  return 'AUTO';
}

/**
 * Automatically recalculate and cascade dates for all AUTO-scheduled nodes
 * based on dependency links, predecessor completion dates, and durations.
 */
export function recalculateAutoSchedule(
  rows: WBSRow[],
  dependencies: ScheduleDependencyLink[],
): WBSRow[] {
  if (rows.length === 0) return rows;

  const nodeMap = new Map<string, WBSRow>();
  for (const r of rows) {
    nodeMap.set(r.id, { ...r });
  }

  // Map of successor_id -> incoming dependency links
  const incomingMap = new Map<string, ScheduleDependencyLink[]>();
  for (const dep of dependencies) {
    if (!incomingMap.has(dep.successor_id)) {
      incomingMap.set(dep.successor_id, []);
    }
    incomingMap.get(dep.successor_id)!.push(dep);
  }

  // Iterate multiple passes until convergence (or max rows passes for DAG propagation)
  let changed = true;
  let iterations = 0;
  const maxIterations = Math.max(10, rows.length * 2);

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (const [nodeId, row] of nodeMap.entries()) {
      const mode = getNodeSchedulingMode(row);
      if (mode !== 'AUTO') {
        // Manual mode: do not shift dates based on predecessors
        continue;
      }

      const incoming = incomingMap.get(nodeId) || [];
      if (incoming.length === 0) {
        continue;
      }

      let latestRequiredStart: string | null = null;

      for (const dep of incoming) {
        const pred = nodeMap.get(dep.predecessor_id);
        if (!pred || !pred.planned_start_date || !pred.planned_end_date) {
          continue;
        }

        const lag = dep.lag_days || 0;
        let candidateStart: string | null = null;

        if (dep.dependency_type === 'FS') {
          // Finish-to-Start: starts after predecessor finishes + lag
          // If pred finishes on date P, next workday is addWorkdays(P, 1 + lag)
          candidateStart = addWorkdays(pred.planned_end_date, 1 + lag);
        } else if (dep.dependency_type === 'SS') {
          // Start-to-Start: starts with predecessor start + lag
          candidateStart = addWorkdays(pred.planned_start_date, lag);
        } else if (dep.dependency_type === 'FF') {
          // Finish-to-Finish: finish >= pred finish + lag
          const duration = calculateWorkdayDuration(row.planned_start_date, row.planned_end_date);
          const reqFinish = addWorkdays(pred.planned_end_date, lag);
          candidateStart = subtractWorkdays(reqFinish, duration - 1);
        } else if (dep.dependency_type === 'SF') {
          // Start-to-Finish: finish >= pred start + lag
          const duration = calculateWorkdayDuration(row.planned_start_date, row.planned_end_date);
          const reqFinish = addWorkdays(pred.planned_start_date, lag);
          candidateStart = subtractWorkdays(reqFinish, duration - 1);
        }

        if (candidateStart) {
          if (!latestRequiredStart || candidateStart > latestRequiredStart) {
            latestRequiredStart = candidateStart;
          }
        }
      }

      if (latestRequiredStart && latestRequiredStart !== row.planned_start_date) {
        const duration = row.duration_days ?? calculateWorkdayDuration(row.planned_start_date, row.planned_end_date);
        const lag = (row.lag_days as number) ?? 0;
        const newStart = latestRequiredStart;
        const newEnd = computeFinishDate(newStart, duration, lag);

        row.planned_start_date = newStart;
        row.planned_end_date = newEnd;
        changed = true;
      }
    }
  }

  return rows.map((r) => nodeMap.get(r.id) || r);
}
