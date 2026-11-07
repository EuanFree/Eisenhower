/**
 * Gantt Drag Cascade Hook
 *
 * Triggers during active Gantt bar dragging or duration resizing to compute
 * the real-time projected impact on all downstream successor activities.
 *
 * Algorithm:
 * 1. On drag start, capture the dragged node's original start/finish dates.
 * 2. On each mouse move, compute delta displacement (Δdays = draggedDate − originalDate).
 * 3. Build a client-side topological sort from the in-memory dependencies array.
 * 4. Recursively calculate projected new start/finish dates for all downstream
 *    driving successors (tasks whose Total Float ≤ threshold).
 * 5. Return a Map of nodeId → projected dates and consumed float.
 *
 * This hook operates entirely in-memory — no server calls are made during
 * the drag.  On drop, the caller commits the shift to useHistoryStore and
 * triggers server-side CPM recalculation.
 *
 * Contractual Breach Detection:
 * The hook also evaluates whether any displaced node in the cascade:
 * - Slips an approved Contract Baseline date (B₀ Finish).
 * - Slips a linked CDRL deliverable statutory due date.
 * - Results in negative Total Float (TF < 0).
 *
 * When a breach is detected, the hook returns breach information so the
 * UI can turn ghost bars red and display the DragBreachWarningHUD.
 */

import { useMemo, useCallback, useState } from 'react';
import { useScheduleStore } from '../stores/useScheduleStore';
import { WBSRow } from '../types/wbs';
import { DependencyLink } from '../components/gantt/GanttViewport';
import { BaselineComparison } from '../components/gantt/GanttBar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Projected date shift for a single node in the cascade.
 */
export interface CascadeProjection {
  /** Projected new start date (ISO string) */
  projectedStart: string;
  /** Projected new finish date (ISO string) */
  projectedFinish: string;
  /** How many days of Total Float are consumed by this shift */
  floatConsumed: number;
  /** Original start date for reference */
  originalStart: string;
  /** Original finish date for reference */
  originalFinish: string;
}

/**
 * Contractual breach detected during cascade projection.
 */
export interface ContractualBreach {
  /** Node ID that is breaching */
  nodeId: string;
  /** Node code (e.g., 'WP-2104') */
  nodeCode: string;
  /** Node name */
  nodeName: string;
  /** Breach type */
  breachType: 'BASELINE_B0' | 'CDRL_DUE_DATE' | 'NEGATIVE_FLOAT';
  /** Description of the contractual milestone or deliverable */
  milestoneDescription: string;
  /** Number of days slipped (positive = behind) */
  slipDays: number;
  /** Total Float after shift (negative = critical) */
  totalFloat: number;
}

/**
 * State returned by the useGanttDragCascade hook.
 */
export interface DragCascadeState {
  /** Whether a drag is currently active */
  isDragging: boolean;
  /** Node ID being dragged */
  draggedNodeId: string | null;
  /** Map of nodeId → projected cascade data */
  projectedCascadeMap: Map<string, CascadeProjection>;
  /** List of contractual breaches detected */
  breaches: ContractualBreach[];
  /** Whether any breach is critical (negative float or baseline slip) */
  hasCriticalBreach: boolean;
  /** Delta displacement in calendar days */
  deltaDays: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse an ISO date string to a Date object.
 */
function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format a Date as YYYY-MM-DD string.
 */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Add calendar days to a date string, returning a new date string.
 * Skips weekends (Saturday/Sunday) for working-day arithmetic.
 */
function addWorkingDays(dateStr: string | null, days: number): string | null {
  const d = parseDate(dateStr);
  if (!d) return null;

  const sign = days >= 0 ? 1 : -1;
  let remaining = Math.abs(days);

  while (remaining > 0) {
    d.setDate(d.getDate() + sign);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      remaining--;
    }
  }

  return formatDate(d);
}

/**
 * Calculate the difference in working days between two dates.
 */
function workingDayDiff(startStr: string | null, endStr: string | null): number {
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  if (!start || !end) return 0;

  const sign = end >= start ? 1 : -1;
  const current = new Date(start);
  let count = 0;

  while (current < end) {
    current.setDate(current.getDate() + sign);
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) {
      count += sign;
    }
  }

  return count;
}

/**
 * Build an adjacency list of successors from the dependencies array.
 * Returns Map<nodeId, { successorId, dependencyType, lagDays }[]>.
 */
function buildSuccessorMap(
  dependencies: DependencyLink[],
): Map<string, { successorId: string; dependencyType: string; lagDays: number }[]> {
  const map = new Map<string, { successorId: string; dependencyType: string; lagDays: number }[]>();

  for (const dep of dependencies) {
    if (!map.has(dep.predecessor_id)) {
      map.set(dep.predecessor_id, []);
    }
    map.get(dep.predecessor_id)!.push({
      successorId: dep.successor_id,
      dependencyType: dep.dependency_type,
      lagDays: dep.lag_days,
    });
  }

  return map;
}

/**
 * Compute the duration of a node in calendar days.
 */
function getNodeDuration(row: WBSRow): number {
  const start = row.early_start || row.planned_start_date;
  const finish = row.early_finish || row.planned_end_date;
  return workingDayDiff(start, finish);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Custom hook for real-time drag cascade projection on the Gantt chart.
 *
 * Usage:
 * ```tsx
 * const { isDragging, projectedCascadeMap, breaches, hasCriticalBreach } =
 *   useGanttDragCascade(dependencies, baselines, cdrlDueDates);
 *
 * // In GanttBar onMouseDown:
 * const handleMouseDown = (e: React.MouseEvent) => {
 *   startDrag(row.id, e.clientX);
 * };
 *
 * // In GanttViewport onMouseMove:
 * const handleMouseMove = (e: React.MouseEvent) => {
 *   if (isDragging) updateDragPosition(e.clientX, e.clientY);
 * };
 *
 * // In GanttViewport onMouseUp:
 * const handleMouseUp = () => {
 *   endDrag();
 * };
 * ```
 */
export function useGanttDragCascade(
  /** Dependency links for building the successor graph */
  dependencies: DependencyLink[],
  /** Baseline comparison data keyed by node ID */
  baselines: Record<string, BaselineComparison>,
  /** CDRL statutory due dates keyed by node ID (optional) */
  cdrlDueDates?: Record<string, string>,
  /** Float threshold for cascade propagation (default: 5 days) */
  floatThreshold: number = 5,
) {
  const [state, setState] = useState<DragCascadeState>({
    isDragging: false,
    draggedNodeId: null,
    projectedCascadeMap: new Map(),
    breaches: [],
    hasCriticalBreach: false,
    deltaDays: 0,
  });

  const rows = useScheduleStore((s) => s.rows);

  /**
   * Start dragging a Gantt bar.
   * @param nodeId - The node being dragged
   * @param _clientX - Initial mouse X (reserved for future pixel-to-day conversion)
   */
  const startDrag = useCallback(
    (nodeId: string, _clientX: number) => {
      setState((prev) => ({
        ...prev,
        isDragging: true,
        draggedNodeId: nodeId,
        deltaDays: 0,
        projectedCascadeMap: new Map(),
        breaches: [],
        hasCriticalBreach: false,
      }));
    },
    [],
  );

  /**
   * Update drag position during mouse move.
   * @param deltaDays - Number of working days the bar has been shifted
   * @param _clientX - Current mouse X (for HUD positioning)
   * @param _clientY - Current mouse Y (for HUD positioning)
   */
  const updateDragPosition = useCallback(
    (deltaDays: number, _clientX: number, _clientY: number) => {
      if (!state.isDragging || !state.draggedNodeId) return;

      const rowMap = new Map(rows.map((r) => [r.id, r]));
      const draggedRow = rowMap.get(state.draggedNodeId);
      if (!draggedRow) return;

      const successorMap = buildSuccessorMap(dependencies);
      const cascadeMap = new Map<string, CascadeProjection>();
      const breaches: ContractualBreach[] = [];

      // Compute projected dates for the dragged node
      const origStart = draggedRow.early_start || draggedRow.planned_start_date || '';
      const origFinish = draggedRow.early_finish || draggedRow.planned_end_date || '';
      const duration = getNodeDuration(draggedRow);

      const projectedStart = addWorkingDays(origStart, deltaDays) || origStart;
      const projectedFinish = addWorkingDays(projectedStart, duration) || origFinish;

      cascadeMap.set(state.draggedNodeId, {
        projectedStart,
        projectedFinish,
        floatConsumed: deltaDays,
        originalStart: origStart,
        originalFinish: origFinish,
      });

      // Check dragged node for breaches
      checkBreachForNode(
        draggedRow,
        projectedFinish,
        deltaDays,
        baselines,
        cdrlDueDates,
        breaches,
      );

      // Recursive cascade: propagate to all downstream successors
      const visited = new Set<string>();
      const propagate = (nodeId: string, newStart: string) => {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);

        const successors = successorMap.get(nodeId) || [];
        for (const { successorId, dependencyType, lagDays } of successors) {
          const succRow = rowMap.get(successorId);
          if (!succRow) continue;

          // Compute the successor's projected start based on dependency type
          let succProjectedStart: string;

          switch (dependencyType) {
            case 'FS': // Finish-to-Start: successor starts after predecessor finishes
              succProjectedStart = addWorkingDays(newStart, duration + lagDays) || newStart;
              break;
            case 'SS': // Start-to-Start: successor starts with predecessor + lag
              succProjectedStart = addWorkingDays(newStart, lagDays) || newStart;
              break;
            case 'FF': // Finish-to-Finish: successor finishes with predecessor + lag
              // For FF, the start shifts by the same delta
              const succDuration = getNodeDuration(succRow);
              const succOrigFinish = succRow.early_finish || succRow.planned_end_date || '';
              const succNewFinish = addWorkingDays(newStart, lagDays) || newStart;
              succProjectedStart = addWorkingDays(succNewFinish, -succDuration) || succOrigFinish;
              break;
            case 'SF': // Start-to-Finish: rare, successor finishes when predecessor starts
              succProjectedStart = newStart;
              break;
            default:
              succProjectedStart = newStart;
          }

          const succDuration = getNodeDuration(succRow);
          const succProjectedFinish = addWorkingDays(succProjectedStart, succDuration) || succProjectedStart;

          const succOrigStart = succRow.early_start || succRow.planned_start_date || '';
          const succOrigFinish = succRow.early_finish || succRow.planned_end_date || '';

          // Calculate float consumed
          const succFloat = succRow.total_float ?? Infinity;
          const succDelta = workingDayDiff(succOrigStart, succProjectedStart);
          const floatConsumed = Math.max(0, succDelta);

          // Only propagate if the successor's float is within threshold
          // or the shift exceeds available float
          if (succFloat <= floatThreshold || floatConsumed > succFloat) {
            cascadeMap.set(successorId, {
              projectedStart: succProjectedStart,
              projectedFinish: succProjectedFinish,
              floatConsumed,
              originalStart: succOrigStart,
              originalFinish: succOrigFinish,
            });

            // Check for breaches
            checkBreachForNode(
              succRow,
              succProjectedFinish,
              succDelta,
              baselines,
              cdrlDueDates,
              breaches,
            );

            // Recurse
            propagate(successorId, succProjectedFinish);
          }
        }
      };

      // Start propagation from the dragged node
      propagate(state.draggedNodeId, projectedFinish);

      const hasCritical = breaches.some(
        (b) =>
          b.breachType === 'BASELINE_B0' ||
          b.breachType === 'CDRL_DUE_DATE' ||
          b.totalFloat < 0,
      );

      setState({
        isDragging: true,
        draggedNodeId: state.draggedNodeId,
        projectedCascadeMap: cascadeMap,
        breaches,
        hasCriticalBreach: hasCritical,
        deltaDays,
      });
    },
    [state.isDragging, state.draggedNodeId, rows, dependencies, baselines, cdrlDueDates, floatThreshold],
  );

  /**
   * End drag and clear cascade state.
   */
  const endDrag = useCallback(() => {
    setState({
      isDragging: false,
      draggedNodeId: null,
      projectedCascadeMap: new Map(),
      breaches: [],
      hasCriticalBreach: false,
      deltaDays: 0,
    });
  }, []);

  return {
    ...state,
    startDrag,
    updateDragPosition,
    endDrag,
  };
}

/**
 * Check a single node for contractual breaches.
 */
function checkBreachForNode(
  row: WBSRow,
  projectedFinish: string,
  deltaDays: number,
  baselines: Record<string, BaselineComparison>,
  cdrlDueDates?: Record<string, string>,
  breaches?: ContractualBreach[],
): void {
  if (!breaches) return;

  // Check B₀ baseline slip
  const baseline = baselines[row.id];
  if (baseline?.baseline0End) {
    const b0End = parseDate(baseline.baseline0End);
    const projFinish = parseDate(projectedFinish);
    if (b0End && projFinish && projFinish > b0End) {
      const slipDays = workingDayDiff(baseline.baseline0End, projectedFinish);
      breaches.push({
        nodeId: row.id,
        nodeCode: row.code,
        nodeName: row.name,
        breachType: 'BASELINE_B0',
        milestoneDescription: `Contract Baseline B₀ (${row.code})`,
        slipDays,
        totalFloat: (row.total_float ?? 0) - slipDays,
      });
    }
  }

  // Check CDRL statutory due date slip
  if (cdrlDueDates?.[row.id]) {
    const cdrlDue = parseDate(cdrlDueDates[row.id]);
    const projFinish = parseDate(projectedFinish);
    if (cdrlDue && projFinish && projFinish > cdrlDue) {
      const slipDays = workingDayDiff(cdrlDueDates[row.id], projectedFinish);
      breaches.push({
        nodeId: row.id,
        nodeCode: row.code,
        nodeName: row.name,
        breachType: 'CDRL_DUE_DATE',
        milestoneDescription: `CDRL Due Date (${row.code})`,
        slipDays,
        totalFloat: (row.total_float ?? 0) - slipDays,
      });
    }
  }

  // Check negative float
  const newFloat = (row.total_float ?? 0) - deltaDays;
  if (newFloat < 0 && row.total_float !== undefined && row.total_float !== null && row.total_float >= 0) {
    breaches.push({
      nodeId: row.id,
      nodeCode: row.code,
      nodeName: row.name,
      breachType: 'NEGATIVE_FLOAT',
      milestoneDescription: `Total Float (${row.code})`,
      slipDays: Math.abs(newFloat),
      totalFloat: newFloat,
    });
  }
}
