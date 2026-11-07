/**
 * Gantt Dependencies Component
 *
 * SVG orthogonal (stepped) line connectors rendering PDM (Precedence
 * Diagramming Method) dependency links between Gantt bars in the style of
 * standard project management software (Microsoft Project, Primavera P6).
 *
 * Supports all four PDM dependency types:
 * - FS (Finish-to-Start): Right edge of predecessor to left edge of successor.
 * - SS (Start-to-Start): Left edge of predecessor to left edge of successor.
 * - FF (Finish-to-Finish): Right edge of predecessor to right edge of successor.
 * - SF (Start-to-Finish): Left edge of predecessor to right edge of successor.
 */

import React, { useMemo, useState } from 'react';
import { WBSRow } from '../../types/wbs';
import { ZoomLevel } from './GanttViewport';
import { useContextMenu } from '../common/contextmenu/ContextMenuProvider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GanttDependenciesProps {
  /** Flat WBS row list */
  rows: WBSRow[];
  /** Dependency links between nodes */
  dependencies: Array<{
    id?: string;
    predecessor_id: string;
    successor_id: string;
    dependency_type: 'FS' | 'SS' | 'FF' | 'SF';
    lag_days: number;
  }>;
  /** Row height in pixels */
  rowHeight: number;
  /** Bar height in pixels */
  barHeight?: number;
  /** Convert an ISO date string to a pixel X coordinate */
  dateToX: (dateStr: string | null) => number;
  /** Total pixel width of the chart area */
  timelineWidth: number;
  /** Timeline start date */
  startDate: Date;
  /** Current zoom level */
  zoom: ZoomLevel;
  /** Whether to render dependency edges */
  visible: boolean;
  /** Currently selected or hovered node ID to highlight connected edges */
  activeNodeId?: string | null;
}

/**
 * A computed dependency edge with orthogonal SVG path data.
 */
interface DependencyEdge {
  id: string;
  predecessorId: string;
  successorId: string;
  predecessorCode: string;
  successorCode: string;
  predX: number;
  predY: number;
  succX: number;
  succY: number;
  labelX: number;
  labelY: number;
  /** SVG path d attribute */
  path: string;
  /** Whether this edge is on the critical path */
  isCritical: boolean;
  /** Whether this edge is connected to the currently selected/hovered task */
  isHighlighted: boolean;
  /** Dependency type label */
  type: 'FS' | 'SS' | 'FF' | 'SF';
  /** Lag days */
  lagDays: number;
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
 * Build an orthogonal polyline path with rounded corners from a sequence of (x, y) points.
 */
function buildRoundedOrthogonalPath(points: Array<{ x: number; y: number }>, radius = 4): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  // Remove consecutive duplicate points
  const pts: Array<{ x: number; y: number }> = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = pts[pts.length - 1];
    if (Math.abs(points[i].x - prev.x) > 0.5 || Math.abs(points[i].y - prev.y) > 0.5) {
      pts.push(points[i]);
    }
  }

  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

  const parts: string[] = [`M ${pts[0].x} ${pts[0].y}`];

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];

    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const len1 = Math.hypot(v1x, v1y);

    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const len2 = Math.hypot(v2x, v2y);

    const r = Math.min(radius, len1 / 2, len2 / 2);
    if (r < 1) {
      parts.push(`L ${curr.x} ${curr.y}`);
      continue;
    }

    const startX = curr.x - (v1x / len1) * r;
    const startY = curr.y - (v1y / len1) * r;
    const endX = curr.x + (v2x / len2) * r;
    const endY = curr.y + (v2y / len2) * r;

    parts.push(`L ${startX.toFixed(1)} ${startY.toFixed(1)}`);
    parts.push(`Q ${curr.x.toFixed(1)} ${curr.y.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`);
  }

  const last = pts[pts.length - 1];
  parts.push(`L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`);
  return parts.join(' ');
}

/**
 * Compute standard project-management orthogonal routing waypoints for a dependency link.
 */
function computeOrthogonalWaypoints(
  predX: number,
  predY: number,
  succX: number,
  succY: number,
  type: 'FS' | 'SS' | 'FF' | 'SF',
  rowHeight: number,
): Array<{ x: number; y: number }> {
  const stub = 12; // Horizontal stub extending out from bar edge
  const goingDown = succY >= predY;
  const rowBorderY = goingDown
    ? predY + rowHeight / 2
    : predY - rowHeight / 2;

  if (type === 'FS') {
    // Finish-to-Start: exit right from predecessor, enter left into successor
    if (succX >= predX + stub * 1.5) {
      // Forward link: step out horizontally, go vertically to successor row, enter left
      const turnX = Math.min(predX + stub, (predX + succX) / 2);
      return [
        { x: predX, y: predY },
        { x: turnX, y: predY },
        { x: turnX, y: succY },
        { x: succX, y: succY },
      ];
    } else {
      // Overlapping or backward FS link: route out right, drop to row boundary, Detour left before successor start, drop to successor Y, enter left
      const outX = predX + stub;
      const inX = Math.max(4, succX - stub);
      return [
        { x: predX, y: predY },
        { x: outX, y: predY },
        { x: outX, y: rowBorderY },
        { x: inX, y: rowBorderY },
        { x: inX, y: succY },
        { x: succX, y: succY },
      ];
    }
  }

  if (type === 'SS') {
    // Start-to-Start: exit left from predecessor, enter left into successor
    const leftX = Math.max(4, Math.min(predX, succX) - stub);
    return [
      { x: predX, y: predY },
      { x: leftX, y: predY },
      { x: leftX, y: succY },
      { x: succX, y: succY },
    ];
  }

  if (type === 'FF') {
    // Finish-to-Finish: exit right from predecessor, enter right into successor
    const rightX = Math.max(predX, succX) + stub;
    return [
      { x: predX, y: predY },
      { x: rightX, y: predY },
      { x: rightX, y: succY },
      { x: succX, y: succY },
    ];
  }

  // SF (Start-to-Finish): exit left from predecessor, enter right into successor
  const outX = Math.max(4, predX - stub);
  const inX = succX + stub;
  return [
    { x: predX, y: predY },
    { x: outX, y: predY },
    { x: outX, y: rowBorderY },
    { x: inX, y: rowBorderY },
    { x: inX, y: succY },
    { x: succX, y: succY },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const GanttDependencies: React.FC<GanttDependenciesProps> = ({
  rows,
  dependencies,
  rowHeight,
  dateToX,
  timelineWidth,
  visible,
  activeNodeId,
}) => {
  const { openContextMenu } = useContextMenu();
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  // Build dependency edge paths
  const edges: DependencyEdge[] = useMemo(() => {
    if (!visible || dependencies.length === 0) return [];

    // Build a map of node_id → row for quick lookup
    const rowMap = new Map<string, WBSRow & { _index: number }>();
    rows.forEach((row, index) => {
      rowMap.set(row.id, { ...row, _index: index });
    });

    return dependencies
      .map((dep, idx) => {
        const pred = rowMap.get(dep.predecessor_id);
        const succ = rowMap.get(dep.successor_id);

        if (!pred || !succ) return null;

        const predY = pred._index * rowHeight + rowHeight / 2;
        const succY = succ._index * rowHeight + rowHeight / 2;

        // Calculate exact bar left and right coordinates to match GanttBar
        const predStart = parseDate(pred.early_start || pred.planned_start_date);
        const predEnd = parseDate(pred.early_finish || pred.planned_end_date);
        const succStart = parseDate(succ.early_start || succ.planned_start_date);
        const succEnd = parseDate(succ.early_finish || succ.planned_end_date);

        const predLeft = predStart ? Math.max(0, dateToX(formatDate(predStart))) : 0;
        const predRight = predEnd
          ? Math.max(predLeft + 4, dateToX(formatDate(predEnd)))
          : predLeft + 4;

        const succLeft = succStart ? Math.max(0, dateToX(formatDate(succStart))) : 0;
        const succRight = succEnd
          ? Math.max(succLeft + 4, dateToX(formatDate(succEnd)))
          : succLeft + 4;

        let predX: number;
        let succX: number;

        switch (dep.dependency_type) {
          case 'FS': // Finish-to-Start
            predX = predRight;
            succX = succLeft;
            break;
          case 'SS': // Start-to-Start
            predX = predLeft;
            succX = succLeft;
            break;
          case 'FF': // Finish-to-Finish
            predX = predRight;
            succX = succRight;
            break;
          case 'SF': // Start-to-Finish
            predX = predLeft;
            succX = succRight;
            break;
          default:
            predX = predRight;
            succX = succLeft;
        }

        // Determine if this edge is on the critical path
        const predIsCritical =
          pred.is_critical === true || (pred.total_float !== null && pred.total_float <= 0);
        const succIsCritical =
          succ.is_critical === true || (succ.total_float !== null && succ.total_float <= 0);
        const isCritical = predIsCritical && succIsCritical;

        const isHighlighted =
          Boolean(activeNodeId) &&
          (dep.predecessor_id === activeNodeId || dep.successor_id === activeNodeId);

        const waypoints = computeOrthogonalWaypoints(
          predX,
          predY,
          succX,
          succY,
          dep.dependency_type || 'FS',
          rowHeight,
        );
        const path = buildRoundedOrthogonalPath(waypoints, 4);

        const midIdx = Math.floor(waypoints.length / 2);
        const labelX = (waypoints[midIdx - 1].x + waypoints[midIdx].x) / 2;
        const labelY = (waypoints[midIdx - 1].y + waypoints[midIdx].y) / 2;

        return {
          id: dep.id || `dep-${idx}`,
          predecessorId: dep.predecessor_id,
          successorId: dep.successor_id,
          predecessorCode: pred.code,
          successorCode: succ.code,
          predX,
          predY,
          succX,
          succY,
          labelX,
          labelY,
          path,
          isCritical,
          isHighlighted,
          type: dep.dependency_type || 'FS',
          lagDays: dep.lag_days || 0,
        } as DependencyEdge;
      })
      .filter((edge): edge is DependencyEdge => edge !== null);
  }, [rows, dependencies, rowHeight, dateToX, visible, activeNodeId]);

  if (!visible || edges.length === 0) return null;

  const totalHeight = rows.length * rowHeight;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: `${timelineWidth}px`,
        height: `${totalHeight}px`,
        pointerEvents: 'none',
        zIndex: 5,
        overflow: 'visible',
      }}
    >
      {/* Arrowhead marker definitions */}
      <defs>
        {/* Standard sky/slate arrowhead for non-critical dependencies */}
        <marker
          id="arrowhead-default"
          markerWidth="8"
          markerHeight="6"
          refX="7"
          refY="3"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <polygon points="0 0.5, 7.5 3, 0 5.5" fill="#38BDF8" />
        </marker>

        {/* Highlighted arrowhead when hovered or task selected */}
        <marker
          id="arrowhead-highlight"
          markerWidth="9"
          markerHeight="7"
          refX="8"
          refY="3.5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <polygon points="0 0.5, 8.5 3.5, 0 6.5" fill="#FACC15" />
        </marker>

        {/* Red arrowhead for critical path dependencies */}
        <marker
          id="arrowhead-critical"
          markerWidth="8"
          markerHeight="6"
          refX="7"
          refY="3"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <polygon points="0 0.5, 7.5 3, 0 5.5" fill="#F87171" />
        </marker>
      </defs>

      {/* Render each dependency edge */}
      {edges.map((edge) => {
        const isHovered = hoveredEdgeId === edge.id;
        const isActive = isHovered || edge.isHighlighted;
        const strokeColor = isActive
          ? '#FACC15'
          : edge.isCritical
          ? '#F87171'
          : '#38BDF8';
        const markerUrl = isActive
          ? 'url(#arrowhead-highlight)'
          : edge.isCritical
          ? 'url(#arrowhead-critical)'
          : 'url(#arrowhead-default)';
        const lagText =
          edge.lagDays !== 0
            ? `${edge.type}${edge.lagDays > 0 ? `+${edge.lagDays}d` : `${edge.lagDays}d`}`
            : edge.type !== 'FS'
            ? edge.type
            : null;

        return (
          <g key={edge.id}>
            {/* Subtle dark halo behind connector line so it reads cleanly over gridlines and bars */}
            <path
              d={edge.path}
              fill="none"
              stroke="#0F172A"
              strokeWidth={isActive ? 4 : 3}
              strokeOpacity={0.75}
            />

            {/* Invisible wider hit area for hover & right-click context menu */}
            <path
              d={edge.path}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onMouseEnter={() => setHoveredEdgeId(edge.id)}
              onMouseLeave={() => setHoveredEdgeId(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                openContextMenu(e, 'DEPENDENCY_LINK', {
                  linkId: edge.id,
                  predecessorId: edge.predecessorId,
                  successorId: edge.successorId,
                  dependencyType: edge.type,
                  lagDays: edge.lagDays,
                  isCritical: edge.isCritical,
                });
              }}
            />

            {/* Start anchor node dot on predecessor bar edge */}
            <circle
              cx={edge.predX}
              cy={edge.predY}
              r={isActive ? 3.5 : 2.5}
              fill={strokeColor}
              stroke="#0F172A"
              strokeWidth={1}
            />

            {/* Orthogonal stepped connector path with arrowhead */}
            <path
              d={edge.path}
              fill="none"
              stroke={strokeColor}
              strokeWidth={isActive ? 2.2 : edge.isCritical ? 1.75 : 1.5}
              strokeOpacity={isActive ? 1 : edge.isCritical ? 0.95 : 0.85}
              markerEnd={markerUrl}
            />

            {/* Optional lag / non-FS badge */}
            {(lagText || isHovered) && (
              <g transform={`translate(${edge.labelX}, ${edge.labelY - 8})`}>
                <rect
                  x={-20}
                  y={-8}
                  width={40}
                  height={14}
                  rx={3}
                  fill="#0F172A"
                  stroke={strokeColor}
                  strokeWidth={0.8}
                  opacity={0.92}
                />
                <text
                  x={0}
                  y={2}
                  textAnchor="middle"
                  fill={strokeColor}
                  fontSize="9"
                  fontFamily="var(--font-mono, ui-monospace, monospace)"
                >
                  {lagText || edge.type}
                </text>
              </g>
            )}

            <title>
              {`${edge.predecessorCode} → ${edge.successorCode} (${edge.type}${
                edge.lagDays
                  ? edge.lagDays > 0
                    ? ` +${edge.lagDays}d lag`
                    : ` ${edge.lagDays}d lead`
                  : ''
              }) • ${edge.isCritical ? 'Critical Path' : 'Standard Dependency'}`}
            </title>
          </g>
        );
      })}
    </svg>
  );
};

export default GanttDependencies;
