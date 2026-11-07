/**
 * Gantt Canvas Ghost Layer
 *
 * SVG overlay layer that renders semi-transparent shadow bars (ghost trails)
 * at the projected coordinates for all affected downstream activities during
 * an active Gantt bar drag operation.
 *
 * Visual Design:
 * - Ghost bars are rendered at 40% opacity with dashed borders.
 * - Dynamic offset labels (+3d, -2d) appear above each shadow bar.
 * - When a contractual breach is detected, ghost bars turn red (#EF4444).
 *
 * The layer sits between the dependency edges SVG and the Gantt bars,
 * using absolute positioning within the chart area.
 */

import React, { useMemo } from 'react';
import { CascadeProjection } from '../../hooks/useGanttDragCascade';
import { WBSRow } from '../../types/wbs';

export interface GanttCanvasGhostLayerProps {
  /** Flat row list for index-to-Y mapping */
  rows: WBSRow[];
  /** Map of nodeId → projected cascade data */
  projectedCascadeMap: Map<string, CascadeProjection>;
  /** Convert an ISO date string to pixel X coordinate */
  dateToX: (dateStr: string | null) => number;
  /** Row height in pixels (from CSS --row-height) */
  rowHeight: number;
  /** Bar height in pixels */
  barHeight: number;
  /** Whether any breach is critical (turns bars red) */
  hasCriticalBreach: boolean;
  /** Total timeline width */
  timelineWidth: number;
}

const GHOST_OPACITY = 0.4;
const GHOST_BORDER_COLOR_NORMAL = '#3B82F6'; // Blue for non-breach
const GHOST_BORDER_COLOR_BREACH = '#EF4444'; // Red for breach
const GHOST_FILL_COLOR_NORMAL = 'rgba(59, 130, 246, 0.15)';
const GHOST_FILL_COLOR_BREACH = 'rgba(239, 68, 68, 0.2)';
const OFFSET_LABEL_COLOR_NORMAL = '#3B82F6';
const OFFSET_LABEL_COLOR_BREACH = '#EF4444';

/**
 * Ghost Layer Component
 *
 * Renders an SVG overlay with ghost bars for each projected cascade node.
 * Each ghost bar shows the projected new position as a semi-transparent
 * dashed rectangle with an offset label (+Nd or -Nd).
 */
const GanttCanvasGhostLayer: React.FC<GanttCanvasGhostLayerProps> = ({
  rows,
  projectedCascadeMap,
  dateToX,
  rowHeight,
  barHeight,
  hasCriticalBreach,
  timelineWidth,
}) => {
  // Build a map of nodeId → row index for Y coordinate lookup
  const rowIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, index) => {
      map.set(row.id, index);
    });
    return map;
  }, [rows]);

  // Build ghost bar elements
  const ghostBars = useMemo(() => {
    const bars: React.ReactElement[] = [];

    for (const [nodeId, projection] of projectedCascadeMap.entries()) {
      const rowIndex = rowIndexMap.get(nodeId);
      if (rowIndex === undefined) continue;

      const y = rowIndex * rowHeight + (rowHeight - barHeight) / 2;
      const startX = dateToX(projection.projectedStart);
      const origStartX = dateToX(projection.originalStart);
      const width = dateToX(projection.projectedFinish) - startX;

      if (width <= 0) continue;

      // Calculate offset in days for the label
      const offsetDelta = Math.round((startX - origStartX) / 4); // Approximate days from pixel delta
      const offsetDays = projection.floatConsumed || offsetDelta;
      const offsetLabel = offsetDays > 0 ? `+${offsetDays}d` : offsetDays < 0 ? `${offsetDays}d` : '';

      const isBreach = hasCriticalBreach;
      const borderColor = isBreach ? GHOST_BORDER_COLOR_BREACH : GHOST_BORDER_COLOR_NORMAL;
      const fillColor = isBreach ? GHOST_FILL_COLOR_BREACH : GHOST_FILL_COLOR_NORMAL;
      const labelColor = isBreach ? OFFSET_LABEL_COLOR_BREACH : OFFSET_LABEL_COLOR_NORMAL;

      bars.push(
        <g key={`ghost-${nodeId}`}>
          {/* Ghost bar */}
          <rect
            x={startX}
            y={y}
            width={width}
            height={barHeight}
            rx={3}
            ry={3}
            fill={fillColor}
            stroke={borderColor}
            strokeWidth={1.5}
            strokeDasharray="4 2"
            opacity={GHOST_OPACITY}
          />
          {/* Offset label */}
          {offsetLabel && (
            <text
              x={startX + width / 2}
              y={y - 4}
              textAnchor="middle"
              fill={labelColor}
              fontSize={9}
              fontFamily="var(--font-mono, ui-monospace, monospace)"
              fontWeight="bold"
              opacity={0.9}
            >
              {offsetLabel}
            </text>
          )}
        </g>,
      );
    }

    return bars;
  }, [rows, projectedCascadeMap, rowIndexMap, dateToX, rowHeight, barHeight, hasCriticalBreach]);

  if (projectedCascadeMap.size === 0) return null;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${timelineWidth}px`,
        height: `${rows.length * rowHeight}px`,
        pointerEvents: 'none',
        zIndex: 5,
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {ghostBars}
    </svg>
  );
};

export default GanttCanvasGhostLayer;
