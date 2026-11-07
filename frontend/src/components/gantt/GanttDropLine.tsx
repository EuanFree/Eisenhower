/**
 * Gantt Drop Line Component
 *
 * Dynamic Jagged Status-Date Drop Line for the Eisenhower Portfolio Manager.
 *
 * This component renders an SVG polyline that provides an instant visual
 * frontier of portfolio health at a glance. The line is anchored to the
 * project status date on the timeline header and then "jags" left or right
 * for each task row depending on whether the task is tracking ahead of or
 * behind schedule.
 *
 * Algorithm:
 * For each task row, the component compares the task's Earned Value (EV)
 * against its Planned Value (PV) at the status date:
 *
 * - If EV > PV (ahead of schedule): The line inflects to the RIGHT of the
 *   status date, and a green indicator dot is placed at the inflection point.
 *
 * - If EV < PV (behind schedule): The line zags to the LEFT of the status
 *   date, and a red indicator dot is placed at the inflection point.
 *
 * - If EV ≈ PV (on schedule): The line passes through the status date.
 *
 * If EV/PV data is not available, the component falls back to comparing
 * percent_complete against the expected progress at the status date
 * (elapsed / total_duration × 100).
 *
 * The main status date is shown as a vertical dashed amber line running
 * through all rows, serving as the reference axis for the jagged line.
 *
 * Visual layers (z-index):
 * - z=0: Grid lines and weekend bands
 * - z=1: Dependency edges (GanttDependencies)
 * - z=2: This drop line (GanttDropLine)
 * - z=3: Gantt bars and row highlights
 *
 * Props:
 * - rows: Flat WBS row list from useScheduleStore.
 * - statusDate: ISO date string representing the current project status date.
 * - dateToX: Function to convert ISO date to pixel X coordinate.
 * - rowHeight: Row height in pixels (from CSS --row-height token).
 * - timelineWidth: Total pixel width of the chart area.
 * - visible: Whether to render the drop line (toggleable by the user).
 */

import React, { useMemo } from 'react';
import { WBSRow } from '../../types/wbs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GanttDropLineProps {
  /** Flat WBS row list */
  rows: WBSRow[];
  /** Row height in pixels */
  rowHeight: number;
  /** Current project status date (ISO date string) */
  statusDate: string;
  /** Convert an ISO date string to a pixel X coordinate */
  dateToX: (dateStr: string | null) => number;
  /** Total pixel width of the chart area */
  timelineWidth: number;
  /** Whether to render the drop line */
  visible: boolean;
}

/**
 * A single inflection point on the jagged drop line.
 */
interface DropPoint {
  /** Row Y coordinate (center of the row) */
  y: number;
  /** X coordinate of the status date reference line */
  statusX: number;
  /** X coordinate of the task's actual progress frontier */
  progressX: number;
  /** Whether the task is ahead of schedule (EV > PV or progress > expected) */
  isAhead: boolean;
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const GanttDropLine: React.FC<GanttDropLineProps> = ({
  rows,
  rowHeight,
  statusDate,
  dateToX,
  timelineWidth,
  visible,
}) => {
  // Compute drop line inflection points
  const dropPoints: DropPoint[] = useMemo(() => {
    if (!visible) return [];

    const status = parseDate(statusDate);
    if (!status) return [];

    return rows.map((row, index) => {
      const y = index * rowHeight + rowHeight / 2;
      const statusX = dateToX(statusDate);

      // Calculate progress frontier position
      const startStr = row.early_start || row.planned_start_date;
      const endStr = row.early_finish || row.planned_end_date;
      const start = parseDate(startStr);
      const end = parseDate(endStr);

      let progressX = statusX;
      let isAhead = false;

      if (start && end) {
        // Prefer EV vs PV comparison if available
        if (row.earned_value !== null && row.planned_value !== null) {
          const ev = row.earned_value;
          const pv = row.planned_value;

          if (pv > 0) {
            const evPvRatio = ev / pv;

            if (evPvRatio > 1.05) {
              // Ahead of schedule: inflect right
              const totalDuration = end.getTime() - start.getTime();
              const progressFraction = Math.min(1, row.percent_complete / 100);
              const progressDate = new Date(start.getTime() + totalDuration * progressFraction);
              progressX = dateToX(formatDate(progressDate));
              isAhead = true;
            } else if (evPvRatio < 0.95) {
              // Behind schedule: zag left
              const totalDuration = end.getTime() - start.getTime();
              const progressFraction = Math.min(1, row.percent_complete / 100);
              const progressDate = new Date(start.getTime() + totalDuration * progressFraction);
              progressX = dateToX(formatDate(progressDate));
              isAhead = false;
            }
            // Otherwise on schedule: progressX = statusX
          }
        } else if (row.percent_complete > 0) {
          // Fallback: compare percent_complete against expected progress
          const totalDuration = end.getTime() - start.getTime();
          const elapsed = status.getTime() - start.getTime();
          const expectedProgress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));

          if (row.percent_complete > expectedProgress) {
            // Ahead of schedule
            const progressFraction = row.percent_complete / 100;
            const progressDate = new Date(start.getTime() + totalDuration * progressFraction);
            progressX = dateToX(formatDate(progressDate));
            isAhead = true;
          } else if (row.percent_complete < expectedProgress) {
            // Behind schedule
            const progressFraction = row.percent_complete / 100;
            const progressDate = new Date(start.getTime() + totalDuration * progressFraction);
            progressX = dateToX(formatDate(progressDate));
            isAhead = false;
          }
        }
      }

      return { y, statusX, progressX, isAhead };
    });
  }, [rows, rowHeight, statusDate, dateToX, visible]);

  if (!visible || dropPoints.length === 0) return null;

  // Build polyline points string
  const polylinePoints = dropPoints.map((p) => `${p.progressX},${p.y}`).join(' ');

  const statusX = dropPoints[0]?.statusX ?? 0;
  const totalHeight = dropPoints.length * rowHeight;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${timelineWidth}px`,
        height: `${totalHeight}px`,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      {/* Main status date vertical reference line */}
      <line
        x1={statusX}
        y1={0}
        x2={statusX}
        y2={totalHeight}
        stroke="#FBBF24"
        strokeWidth={1}
        strokeDasharray="4,4"
        opacity={0.6}
      />

      {/* Jagged zig-zag line connecting progress frontiers */}
      <polyline
        points={polylinePoints}
        fill="none"
        stroke="#38BDF8"
        strokeWidth={1.5}
        strokeOpacity={0.8}
      />

      {/* Ahead/Behind indicator dots */}
      {dropPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.progressX}
          cy={p.y}
          r={3}
          fill={p.isAhead ? '#22C55E' : '#EF4444'}
          opacity={0.8}
        />
      ))}
    </svg>
  );
};

export default GanttDropLine;
