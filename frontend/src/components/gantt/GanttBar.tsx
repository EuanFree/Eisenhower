/**
 * Gantt Bar Component
 *
 * Renders a single task's Gantt bar with multiple visual states:
 *
 * 1. Multi-State Bar Fill:
 *    - Solid fill for verified physical progress percentage (percent_complete).
 *    - Diagonal cross-hatch SVG stripe pattern (#blockedPattern) spanning the
 *      unworked duration if has_active_blocker === true.
 *    - Blocker category glyph badge pinned to the bar anchor with tooltip
 *      summary showing the blocker category and severity.
 *
 * 2. Critical Path Highlighting:
 *    - Outer border renders bold red (#F87171) when total_float <= 0.
 *
 * 3. Multi-Track Baseline Rendering:
 *    - When toggled, render slim target bars directly beneath the live bar:
 *      - B₀ (Contract Baseline): Green stroke bar (#34D399).
 *      - B_curr (Approved PMB Baseline): Amber stroke bar (#FBBF24).
 *    - Slip connector: Dashed bracket connecting baseline finish to live
 *      forecast finish with arrowhead.
 *
 * 4. ABAC Masking:
 *    - If is_masked === true, render italicized '[RESTRICTED]' text with a
 *      lock glyph and disable hover actions.
 *
 * The bar is positioned absolutely within a row, with left offset and width
 * calculated from date-to-pixel conversion.
 *
 * Blocker Category Glyphs:
 * Each blocker category has a distinct icon and color:
 * - DEPENDENCY_OVERDUE: Link icon, amber
 * - RESOURCE_UNAVAILABLE: Users icon, red
 * - CLEARANCE_HOLD: Shield icon, purple
 * - FACILITY_MAINTENANCE: Wrench icon, orange
 * - OPERATIONAL_IMPEDIMENT: AlertTriangle icon, red
 *
 * The glyph is pinned to the right edge of the progress fill (or the bar's
 * right edge if progress is 100%) with a tooltip showing the category and
 * severity of the first active blocker.
 */

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  Lock,
  Link,
  Users,
  Shield,
  Wrench,
  AlertTriangle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { WBSRow, BlockerCategory, BlockerSeverity } from '../../types/wbs';
import { useHoverInspector } from '../../hooks/useHoverInspector';
import { useContextMenu } from '../common/contextmenu/ContextMenuProvider';
import HoverSummaryModal from '../common/HoverSummaryModal';
import PresenceAvatars from '../common/PresenceAvatars';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Baseline comparison data for a task.
 * Typically comes from a frozen PortfolioBaseline snapshot.
 */
export interface BaselineComparison {
  /** Baseline 0 (original contract target) planned start */
  baseline0Start: string | null;
  /** Baseline 0 planned end */
  baseline0End: string | null;
  /** Baseline Current (approved PMB) planned start */
  baselineCurrStart: string | null;
  /** Baseline Current planned end */
  baselineCurrEnd: string | null;
}

export interface GanttBarProps {
  /** The WBS row data for this task */
  row: WBSRow;
  /** Baseline comparison data (optional) */
  baseline?: BaselineComparison;
  /** Convert a date string to pixel X coordinate */
  dateToX: (dateStr: string | null) => number;
  /** Convert a pixel X coordinate to an ISO date string */
  xToDate?: (x: number) => string | null;
  /** Total pixel width of the bar area */
  rowWidth: number;
  /** Total height of the row container in pixels */
  rowHeight?: number;
  /** Height of the main bar */
  barHeight: number;
  /** Whether to show baseline comparison bars */
  showBaselines: boolean;
  /** Callback when the bar is clicked */
  onClick?: (nodeId: string) => void;
  /** Callback when the bar is hovered */
  onMouseEnter?: (nodeId: string) => void;
  /** Callback when the mouse leaves the bar */
  onMouseLeave?: () => void;
  /** Optional: called when "Jump to Gantt" is clicked from hover modal */
  onJumpToGantt?: (entityId: string) => void;
  /** Optional: called when "Open Full Details" is clicked from hover modal */
  onOpenDetails?: (entityType: string, entityId: string) => void;
  /** Whether this bar should be dimmed (filter context mode) */
  isDimmed?: boolean;
  /** Whether this bar matches the active filter (for accent border) */
  isMatch?: boolean;
  /** Whether a drag cascade is active (for red border on breach) */
  isDragBreach?: boolean;
  /** Pixels-per-day ratio for drag-to-day conversion */
  pixelsPerDay?: number;
  /** Callback to start dragging this bar */
  onStartDrag?: (nodeId: string, clientX: number) => void;
  /** Callback when drag ends */
  onEndDrag?: () => void;
  /** Whether this node is locked by a check-out lease */
  isCheckoutLocked?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine the bar's base color from the node's security classification.
 * Uses the same palette as the classification banners.
 */
function classificationColor(classification: string): string {
  switch (classification) {
    case 'TOP_SECRET':
      return '#C084FC'; // purple
    case 'SECRET':
      return '#F87171'; // red
    case 'OFFICIAL_SENSITIVE':
      return '#22D3EE'; // cyan
    case 'OFFICIAL':
    default:
      return '#38BDF8'; // sky blue
  }
}

/**
 * Calculate progress fill width as a percentage of the bar width.
 */
function progressWidth(percentComplete: number): number {
  return Math.min(100, Math.max(0, percentComplete));
}

// ---------------------------------------------------------------------------
// SVG Pattern Definitions (injected once into the document)
// ---------------------------------------------------------------------------

/**
 * Singleton that ensures SVG pattern definitions are injected only once
 * into the document body. Patterns are reused across all Gantt bars.
 */
let patternsInjected = false;

function ensurePatternsInjected() {
  if (patternsInjected) return;
  patternsInjected = true;

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('style', 'position: absolute; visibility: hidden;');

  // Diagonal cross-hatch pattern for blocked tasks (#blockedPattern)
  const hatchPattern = document.createElementNS(svgNS, 'pattern');
  hatchPattern.setAttribute('id', 'blockedPattern');
  hatchPattern.setAttribute('patternUnits', 'userSpaceOnUse');
  hatchPattern.setAttribute('width', '8');
  hatchPattern.setAttribute('height', '8');

  const hatchRect = document.createElementNS(svgNS, 'rect');
  hatchRect.setAttribute('width', '8');
  hatchRect.setAttribute('height', '8');
  hatchRect.setAttribute('fill', 'rgba(255, 255, 255, 0.1)');
  hatchPattern.appendChild(hatchRect);

  const hatchLine1 = document.createElementNS(svgNS, 'line');
  hatchLine1.setAttribute('x1', '0');
  hatchLine1.setAttribute('y1', '0');
  hatchLine1.setAttribute('x2', '8');
  hatchLine1.setAttribute('y2', '8');
  hatchLine1.setAttribute('stroke', '#F87171');
  hatchLine1.setAttribute('stroke-width', '1.5');
  hatchPattern.appendChild(hatchLine1);

  const hatchLine2 = document.createElementNS(svgNS, 'line');
  hatchLine2.setAttribute('x1', '8');
  hatchLine2.setAttribute('y1', '0');
  hatchLine2.setAttribute('x2', '0');
  hatchLine2.setAttribute('y2', '8');
  hatchLine2.setAttribute('stroke', '#F87171');
  hatchLine2.setAttribute('stroke-width', '1.5');
  hatchPattern.appendChild(hatchLine2);

  svg.appendChild(hatchPattern);
  document.body.appendChild(svg);
}

// ---------------------------------------------------------------------------
// Blocker Category Glyph Configuration
// ---------------------------------------------------------------------------

/**
 * Maps blocker categories to their glyph icon and color.
 */
const BLOCKER_GLYPH_CONFIG: Record<BlockerCategory, {
  icon: React.ComponentType<any>;
  color: string;
  bgColor: string;
  label: string;
}> = {
  DEPENDENCY_OVERDUE: {
    icon: Link,
    color: '#FBBF24',
    bgColor: 'rgba(251, 191, 36, 0.2)',
    label: 'Dependency Overdue',
  },
  RESOURCE_UNAVAILABLE: {
    icon: Users,
    color: '#F87171',
    bgColor: 'rgba(248, 113, 113, 0.2)',
    label: 'Resource Unavailable',
  },
  CLEARANCE_HOLD: {
    icon: Shield,
    color: '#C084FC',
    bgColor: 'rgba(192, 132, 252, 0.2)',
    label: 'Clearance Hold',
  },
  FACILITY_MAINTENANCE: {
    icon: Wrench,
    color: '#FB923C',
    bgColor: 'rgba(251, 146, 60, 0.2)',
    label: 'Facility Maintenance',
  },
  OPERATIONAL_IMPEDIMENT: {
    icon: AlertTriangle,
    color: '#F87171',
    bgColor: 'rgba(248, 113, 113, 0.2)',
    label: 'Operational Impediment',
  },
};

/**
 * Severity color for tooltip badges.
 */
const SEVERITY_COLOR: Record<BlockerSeverity, string> = {
  CRITICAL: '#EF4444',
  MAJOR: '#F59E0B',
  MINOR: '#3B82F6',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const GanttBar: React.FC<GanttBarProps> = ({
  row,
  baseline,
  dateToX,
  xToDate,
  rowWidth,
  rowHeight,
  barHeight,
  showBaselines,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onJumpToGantt,
  onOpenDetails,
  isDimmed = false,
  isMatch = false,
  isDragBreach = false,
  pixelsPerDay = 4,
  onStartDrag,
  onEndDrag,
  isCheckoutLocked = false,
}) => {
  ensurePatternsInjected();

  // Context menu
  const { openContextMenu } = useContextMenu();

  // Hover inspector for Gantt bars
  const barRef = useRef<HTMLDivElement>(null);
  const hoverInspector = useHoverInspector({
    targetData: {
      entityType: 'TASK',
      entityId: row.id,
    },
    enterDelayMs: 5000,
    exitDelayMs: 2000,
  });

  // Wire the bar ref to the hook for positioning
  useEffect(() => {
    if (hoverInspector.handlers.onRef) {
      hoverInspector.handlers.onRef(barRef.current);
    }
  }, [hoverInspector.handlers.onRef]);

  // Compute bar position and dimensions
  const { left, width, baseline0, baselineCurr } = useMemo(() => {
    // Use early_start/early_finish for planned bar, fall back to planned dates
    const startStr = row.early_start || row.planned_start_date;
    const endStr = row.early_finish || row.planned_end_date;

    const x1 = dateToX(startStr);
    const x2 = dateToX(endStr);

    // Clamp to visible area
    const clampedLeft = Math.max(0, x1);
    const clampedWidth = Math.max(4, Math.min(x2 - clampedLeft, rowWidth - clampedLeft));

    // Baseline 0 (B₀ contract target)
    const b0Start = baseline?.baseline0Start ?? null;
    const b0End = baseline?.baseline0End ?? null;
    const b0Left = b0Start ? dateToX(b0Start) : null;
    const b0Width = b0Start && b0End ? Math.max(4, dateToX(b0End) - dateToX(b0Start)) : null;

    // Baseline Current (B_curr approved PMB)
    const bCurrStart = baseline?.baselineCurrStart ?? null;
    const bCurrEnd = baseline?.baselineCurrEnd ?? null;
    const bCurrLeft = bCurrStart ? dateToX(bCurrStart) : null;
    const bCurrWidth = bCurrStart && bCurrEnd
      ? Math.max(4, dateToX(bCurrEnd) - dateToX(bCurrStart))
      : null;

    return {
      left: clampedLeft,
      width: clampedWidth,
      baseline0: b0Left !== null && b0Width !== null ? { left: b0Left, width: b0Width } : null,
      baselineCurr: bCurrLeft !== null && bCurrWidth !== null ? { left: bCurrLeft, width: bCurrWidth } : null,
    };
  }, [row, baseline, dateToX, rowWidth]);

  // Skip rendering if bar is completely off-screen
  if (left > rowWidth || width <= 0) return null;

  // Visual state flags
  const isCritical = row.total_float !== null && row.total_float <= 0;
  const isBlocked = row.blockers && row.blockers.length > 0;
  const isMasked = row.is_masked === true;
  const progressPct = progressWidth(row.percent_complete);

  const baseColor = classificationColor(row.security_classification);
  const verticalOffset =
    rowHeight !== undefined ? Math.max(0, Math.round((rowHeight - barHeight) / 2)) : 4;
  const barStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${left}px`,
    top: `${verticalOffset}px`,
    width: `${width}px`,
    height: `${barHeight}px`,
    borderRadius: '3px',
    backgroundColor: isMasked ? '#475569' : baseColor + '40', // 40 = 25% opacity hex
    border: isDragBreach
      ? '2px solid #EF4444'
      : isMatch
      ? '2px solid #3B82F6'
      : isCritical
      ? '2px solid #F87171'
      : `1px solid ${baseColor}`,
    opacity: isDimmed ? 0.25 : 1,
    cursor: isCheckoutLocked ? 'not-allowed' : 'pointer',
    overflow: 'hidden',
    boxSizing: 'border-box',
    transition: 'opacity 0.2s ease',
  };

  // Progress fill
  const progressStyle: React.CSSProperties = {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${progressPct}%`,
    height: '100%',
    backgroundColor: isMasked ? '#64748B' : baseColor + 'A0', // A0 = 63% opacity
    borderRadius: '2px',
    transition: 'width 0.2s ease',
  };

  // Cross-hatch overlay for blocked tasks
  const hatchStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${progressPct}%`,
    top: '0',
    width: `${100 - progressPct}%`,
    height: '100%',
    backgroundImage: 'url(#blockedPattern)',
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
    borderRadius: '2px',
  };

  // Get the first active blocker for the glyph badge
  const firstBlocker = useMemo(() => {
    if (!row.blockers || row.blockers.length === 0) return null;
    // Sort by severity: CRITICAL > MAJOR > MINOR
    const severityOrder: Record<BlockerSeverity, number> = {
      CRITICAL: 0,
      MAJOR: 1,
      MINOR: 2,
    };
    return [...row.blockers].sort(
      (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3),
    )[0];
  }, [row.blockers]);

  // Baseline bar height (slimmer than main bar)
  const baselineBarHeight = 6;
  const baseline0Offset = barHeight + 2;
  const baselineCurrOffset = barHeight + 2 + baselineBarHeight + 1;

  // Slip connector: connects baseline finish to live forecast finish
  const slipConnector = useMemo(() => {
    if (!showBaselines) return null;

    // Use the most recent baseline for slip calculation
    const baselineEnd = baseline?.baselineCurrEnd || baseline?.baseline0Start;
    if (!baselineEnd) return null;

    const liveEnd = row.early_finish || row.planned_end_date;
    if (!liveEnd) return null;

    const baselineX = dateToX(baselineEnd);
    const liveX = dateToX(liveEnd);

    // Only show slip if there's a meaningful difference
    if (Math.abs(baselineX - liveX) < 2) return null;

    return {
      x1: baselineX,
      x2: liveX,
      y1: baselineCurrOffset + baselineBarHeight,
      y2: baselineCurrOffset + baselineBarHeight,
      isSlipped: liveX > baselineX, // slipped if live finish is after baseline
    };
  }, [showBaselines, baseline, row, dateToX]);

  const handleClick = () => {
    onClick?.(row.id);
  };

  const handleBarMouseEnter = () => {
    onMouseEnter?.(row.id);
    // Start the hover inspector dwell timer
    if (hoverInspector.handlers.onMouseEnter) {
      hoverInspector.handlers.onMouseEnter();
    }
  };

  const handleBarMouseLeave = () => {
    onMouseLeave?.();
    // Trigger the hover inspector exit logic
    if (hoverInspector.handlers.onMouseLeave) {
      hoverInspector.handlers.onMouseLeave();
    }
  };

  const handleBarContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu(e, 'TASK', {
      nodeId: row.id,
      code: row.code,
      name: row.name,
      indentLevel: row.indentLevel,
      percentComplete: row.percent_complete,
      isBaselineLocked: false,
      hasCamPrivileges: true,
      securityClassification: row.security_classification,
      isMasked: row.is_masked,
    });
  };

  // Drag handler: starts the cascade drag operation
  const handleBarMouseDown = (e: React.MouseEvent) => {
    // Only left-click triggers drag
    if (e.button !== 0) return;
    // Middle mouse button or Ctrl+Click is for context menu, not drag
    if (e.ctrlKey || e.metaKey) return;
    // Disable drag for checkout-locked nodes
    if (isCheckoutLocked) return;

    e.stopPropagation();
    onStartDrag?.(row.id, e.clientX);
  };

  // Quick action callbacks for the hover modal
  const handleModalJumpToGantt = useCallback((entityId: string) => {
    onJumpToGantt?.(entityId);
  }, [onJumpToGantt]);

  const handleModalOpenDetails = useCallback((entityType: string, entityId: string) => {
    onOpenDetails?.(entityType, entityId);
  }, [onOpenDetails]);

  return (
    <>
      <div
        ref={barRef}
        style={barStyle}
        onClick={handleClick}
        onMouseDown={handleBarMouseDown}
        onMouseEnter={handleBarMouseEnter}
        onMouseLeave={handleBarMouseLeave}
        onContextMenu={handleBarContextMenu}
        title={
          isMasked
            ? '[RESTRICTED]'
            : `${row.code}: ${row.name} (${row.percent_complete}%)`
        }
      >
      {/* Progress fill */}
      {!isMasked && <div style={progressStyle} />}

      {/* Cross-hatch overlay for blocked tasks */}
      {isBlocked && !isMasked && <div style={hatchStyle} />}

      {/* Masked indicator */}
      {isMasked && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            color: '#94A3B8',
            fontSize: '10px',
            fontStyle: 'italic',
          }}
        >
          <Lock size={10} />
          [RESTRICTED]
        </div>
      )}

      {/* Blocker category glyph badge pinned to bar anchor */}
      {firstBlocker && !isMasked && (
        <div
          style={{
            position: 'absolute',
            right: '-10px',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: BLOCKER_GLYPH_CONFIG[firstBlocker.category]?.bgColor ?? 'rgba(248, 113, 113, 0.2)',
            border: `1.5px solid ${BLOCKER_GLYPH_CONFIG[firstBlocker.category]?.color ?? '#F87171'}`,
            zIndex: 5,
            cursor: 'help',
          }}
          title={`${BLOCKER_GLYPH_CONFIG[firstBlocker.category]?.label ?? firstBlocker.category} (${firstBlocker.severity})`}
        >
          {(() => {
            const GlyphIcon = BLOCKER_GLYPH_CONFIG[firstBlocker.category]?.icon ?? AlertTriangle;
            return <GlyphIcon size={9} color={BLOCKER_GLYPH_CONFIG[firstBlocker.category]?.color ?? '#F87171'} />;
          })()}
        </div>
      )}

      {/* Baseline 0 (B₀ contract target) — Green stroke bar (#34D399) */}
      {showBaselines && baseline0 && (
        <div
          style={{
            position: 'absolute',
            left: `${baseline0.left}px`,
            top: `${baseline0Offset}px`,
            width: `${baseline0.width}px`,
            height: `${baselineBarHeight}px`,
            borderRadius: '2px',
            backgroundColor: 'rgba(52, 211, 153, 0.08)', // #34D399 at 8% opacity
            border: '1.5px solid #34D399',
            boxSizing: 'border-box',
          }}
          title={`B₀ Contract: ${baseline?.baseline0Start} → ${baseline?.baseline0End}`}
        />
      )}

      {/* Baseline Current (B_curr approved PMB) — Amber stroke bar (#FBBF24) */}
      {showBaselines && baselineCurr && (
        <div
          style={{
            position: 'absolute',
            left: `${baselineCurr.left}px`,
            top: `${baselineCurrOffset}px`,
            width: `${baselineCurr.width}px`,
            height: `${baselineBarHeight}px`,
            borderRadius: '2px',
            backgroundColor: 'rgba(251, 191, 36, 0.08)', // #FBBF24 at 8% opacity
            border: '1.5px solid #FBBF24',
            boxSizing: 'border-box',
          }}
          title={`B_curr PMB: ${baseline?.baselineCurrStart} → ${baseline?.baselineCurrEnd}`}
        />
      )}

      {/* Slip connector: dashed line from baseline finish to live forecast finish */}
      {slipConnector && (
        <svg
          style={{
            position: 'absolute',
            left: '0',
            top: '0',
            width: '100%',
            height: `${baselineCurrOffset + baselineBarHeight + 4}px`,
            pointerEvents: 'none',
          }}
        >
          <line
            x1={slipConnector.x1}
            y1={slipConnector.y1}
            x2={slipConnector.x2}
            y2={slipConnector.y2}
            stroke={slipConnector.isSlipped ? '#F87171' : '#FBBF24'}
            strokeWidth={1.5}
            strokeDasharray="4,3"
          />
          {/* Arrow head at live finish end */}
          <polygon
            points={
              slipConnector.isSlipped
                ? `${slipConnector.x2},${slipConnector.y2 - 3} ${slipConnector.x2 + 5},${slipConnector.y2} ${slipConnector.x2},${slipConnector.y2 + 3}`
                : `${slipConnector.x2},${slipConnector.y2 - 3} ${slipConnector.x2 - 5},${slipConnector.y2} ${slipConnector.x2},${slipConnector.y2 + 3}`
            }
            fill={slipConnector.isSlipped ? '#F87171' : '#FBBF24'}
          />
        </svg>
      )}

      {/* Presence Avatars — colleagues inspecting this task */}
      <div
        style={{
          position: 'absolute',
          right: '-30px',
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
        }}
      >
        <PresenceAvatars nodeId={row.id} size={18} />
      </div>
    </div>

      {/* Hover Summary Modal — rendered when dwell timer triggers */}
      {hoverInspector.state.isOpen && (
        <HoverSummaryModal
          targetData={{ entityType: 'TASK', entityId: row.id }}
          position={hoverInspector.state.position}
          placement={hoverInspector.state.placement}
          isExiting={hoverInspector.state.isExiting}
          onClose={hoverInspector.close}
          onMouseEnter={hoverInspector.modalCallbacks.onMouseEnter}
          onMouseLeave={hoverInspector.modalCallbacks.onMouseLeave}
          onJumpToGantt={handleModalJumpToGantt}
          onOpenDetails={handleModalOpenDetails}
          floatingStyles={hoverInspector.floatingStyles}
          floatingRef={hoverInspector.refs?.setFloating}
        />
      )}
    </>
  );
};

export default GanttBar;
