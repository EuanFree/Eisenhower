/**
 * Gantt Viewport Component
 *
 * Dual-axis virtualized container that serves as the master Gantt chart
 * viewport for the Eisenhower Portfolio Manager.
 *
 * Responsibilities:
 * - Synchronize vertical scroll position with WbsTable.tsx so the WBS grid
 *   and Gantt chart always display the same rows side by side.
 * - Synchronize selected row state with useScheduleStore so clicking a bar
 *   highlights the corresponding WBS table row.
 * - Render the horizontal timeline header supporting 3 adaptive zoom scales:
 *
 *   1. Day Mode — Individual date cells with ISO day numbers and weekend
 *      column bands (dimmed background on Saturday/Sunday).
 *   2. Week Mode — Standard ISO calendar weeks (W41, W42) with statutory
 *      holiday bands overlaid where applicable.
 *   3. Month/Quarter Mode — Master programme tracking scale showing month
 *      abbreviations and quarter boundaries.
 *
 * - Manage horizontal scrolling and zoom state (zoom in/out buttons).
 * - Provide date-to-pixel conversion utilities to child components
 *   (GanttBar, GanttDropLine, GanttDependencies).
 *
 * The viewport reads the flat row list from useScheduleStore and computes
 * the timeline width from the earliest start date to the latest finish date
 * across all visible rows, adding 10% padding on each side.
 *
 * Architecture:
 * The viewport is the parent of all Gantt sub-components. It passes down:
 * - dateToX() — converts an ISO date string to a pixel X coordinate.
 * - rowHeight — read from CSS custom property --row-height.
 * - barHeight — derived from rowHeight minus padding.
 * - timelineWidth — total pixel width of the chart area.
 * - startDate / endDate — timeline boundaries.
 *
 * Data source: useScheduleStore (rows, selectedNodeId, selectNode).
 */

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, Calendar } from 'lucide-react';
import { useScheduleStore } from '../../stores/useScheduleStore';
import { useDisplayStore } from '../../stores/useDisplayStore';
import { useSessionStateStore } from '../../stores/useSessionStateStore';
import { getActiveTab } from '../../stores/useWorkspaceStore';
import { useHistoryStore } from '../../stores/useHistoryStore';
import GanttBar, { BaselineComparison } from './GanttBar';
import GanttDropLine from './GanttDropLine';
import GanttDependencies from './GanttDependencies';
import GanttCanvasGhostLayer from './GanttCanvasGhostLayer';
import DragBreachWarningHUD from './DragBreachWarningHUD';
import { useGanttDragCascade } from '../../hooks/useGanttDragCascade';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Zoom level for the timeline header.
 * Determines the pixel-per-day ratio and header granularity.
 */
export type ZoomLevel = 'DAYS' | 'WEEKS' | 'MONTHS';

/**
 * Pixel-per-day ratios for each zoom level.
 * Higher values mean more zoomed-in view.
 */
const PIXELS_PER_DAY: Record<ZoomLevel, number> = {
  DAYS: 4,
  WEEKS: 2,
  MONTHS: 0.5,
};

/**
 * Dependency link between two nodes.
 * Corresponds to the backend DependencyLink model.
 */
export interface DependencyLink {
  predecessor_id: string;
  successor_id: string;
  dependency_type: 'FS' | 'SS' | 'FF' | 'SF';
  lag_days: number;
}

/**
 * Statutory holiday or calendar exception date.
 */
export interface CalendarException {
  date: string; // ISO date YYYY-MM-DD
  description: string;
}

export interface GanttViewportProps {
  /** Reference to the WBS table's scroll container for vertical sync */
  wbsScrollRef?: React.RefObject<HTMLDivElement | null>;
  /** Current status date for the jagged drop line (ISO date string) */
  statusDate: string;
  /** Dependency links for drawing bezier curves */
  dependencies?: DependencyLink[];
  /** Baseline comparison data keyed by node ID */
  baselines?: Record<string, BaselineComparison>;
  /** Statutory holiday / calendar exception dates */
  calendarExceptions?: CalendarException[];
  /** Whether to show baseline comparison bars */
  showBaselines?: boolean;
  /** Whether to show the jagged status-date drop line */
  showJaggedLine?: boolean;
  /** Whether to show dependency edges */
  showDependencies?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse an ISO date string to a Date object.
 * Returns null if the string is empty or invalid.
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
 * Compute the ISO week number for a given date.
 * Used in Week Mode header labels (e.g., "W41").
 */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Generate timeline header date markers for the given zoom level.
 *
 * Day Mode: Every day with ISO day number; weekends flagged.
 * Week Mode: Every Monday with ISO week number (W41, W42).
 * Month Mode: Every 1st of month with month abbreviation.
 */
function generateTimelineDates(
  startDate: Date,
  endDate: Date,
  zoom: ZoomLevel,
  calendarExceptions: CalendarException[],
): { date: Date; label: string; isMajor: boolean; isWeekend: boolean; isHoliday: boolean; holidayDesc?: string }[] {
  const dates: {
    date: Date;
    label: string;
    isMajor: boolean;
    isWeekend: boolean;
    isHoliday: boolean;
    holidayDesc?: string;
  }[] = [];

  // Build a set of exception date strings for quick lookup
  const exceptionSet = new Map<string, string>();
  for (const ex of calendarExceptions) {
    exceptionSet.set(ex.date, ex.description);
  }

  const current = new Date(startDate);
  while (current <= endDate) {
    const dow = current.getDay();
    const day = current.getDate();
    const dateStr = formatDate(current);
    const weekend = dow === 0 || dow === 6;
    const holidayDesc = exceptionSet.get(dateStr);
    const isHoliday = holidayDesc !== undefined;

    let label = '';
    let isMajor = false;

    switch (zoom) {
      case 'DAYS': {
        label = String(day);
        isMajor = dow === 1; // Monday
        break;
      }
      case 'WEEKS': {
        if (dow === 1) { // Monday
          const weekNum = getISOWeek(current);
          const monthName = current.toLocaleString('en-GB', { month: 'short' });
          label = `W${weekNum}`;
          isMajor = day <= 7; // First week of month
        }
        break;
      }
      case 'MONTHS': {
        if (day === 1) {
          const monthName = current.toLocaleString('en-GB', { month: 'short' });
          const year = String(current.getFullYear()).slice(-2);
          label = `${monthName} '${year}`;
          isMajor = true;
        }
        break;
      }
    }

    if (label) {
      dates.push({
        date: new Date(current),
        label,
        isMajor,
        isWeekend: weekend,
        isHoliday,
        holidayDesc,
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return dates;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const GanttViewport: React.FC<GanttViewportProps> = ({
  wbsScrollRef,
  statusDate,
  dependencies: propDependencies,
  baselines = {},
  calendarExceptions = [],
  showBaselines: propShowBaselines = false,
  showJaggedLine: propShowJaggedLine = true,
  showDependencies: propShowDependencies = true,
}) => {
  const {
    rows: allRows,
    dependencies: storeDependencies,
    selectNode,
    filterMode,
    visibleNodeIds,
    matchingNodeIds,
    selectedNodeId,
  } = useScheduleStore();
  const dependencies =
    propDependencies && propDependencies.length > 0 ? propDependencies : storeDependencies;
  // Apply filter identically to WbsTable so row indices always correspond 1:1
  const rows = useMemo(() => {
    if (visibleNodeIds.size === 0) return allRows;
    if (filterMode === 'DIM') return allRows;
    return allRows.filter((r) => visibleNodeIds.has(r.id));
  }, [allRows, visibleNodeIds, filterMode]);
  const isDimmed = filterMode === 'DIM' && visibleNodeIds.size > 0;
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<ZoomLevel>('WEEKS');
  const [scrollX, setScrollX] = useState(0);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [showDependencies, setShowDependencies] = useState<boolean>(propShowDependencies);
  const [showJaggedLine, setShowJaggedLine] = useState<boolean>(propShowJaggedLine);
  const [showBaselines, setShowBaselines] = useState<boolean>(propShowBaselines);

  useEffect(() => {
    setShowDependencies(propShowDependencies);
  }, [propShowDependencies]);

  useEffect(() => {
    setShowJaggedLine(propShowJaggedLine);
  }, [propShowJaggedLine]);

  useEffect(() => {
    setShowBaselines(propShowBaselines);
  }, [propShowBaselines]);

  // Session state persistence for zoom, scroll, and selection
  const saveViewState = useSessionStateStore((s) => s.saveViewState);
  const loadViewState = useSessionStateStore((s) => s.loadViewState);
  const activeTab = getActiveTab();

  // Restore saved zoom and scroll on mount
  useEffect(() => {
    if (!activeTab) return;
    const saved = loadViewState(activeTab.id);
    if (saved?.ganttZoom) setZoom(saved.ganttZoom);
    if (saved?.scrollX !== undefined) setScrollX(saved.scrollX);
  }, [activeTab?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist zoom, scroll, and selected node on change
  useEffect(() => {
    if (!activeTab) return;
    saveViewState(activeTab.id, {
      ganttZoom: zoom,
      scrollX,
      selectedNodeId,
    });
  }, [zoom, scrollX, selectedNodeId, activeTab?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Read row height from display store & CSS tokens so WbsTable and GanttViewport stay in sync
  const displayRowHeight = useDisplayStore((s) => s.settings.rowHeightPx);
  const displayDensity = useDisplayStore((s) => s.settings.density);
  const rowHeight = useMemo(() => {
    if (displayRowHeight && displayRowHeight > 0) return displayRowHeight;
    const root = document.documentElement;
    const computed = getComputedStyle(root);
    const raw = computed.getPropertyValue('--row-height').trim();
    return parseInt(raw, 10) || 36;
  }, [displayRowHeight, displayDensity]);

  const barHeight = Math.max(4, rowHeight - 12); // Leave 6px padding top and bottom for clean centering

  // Responsive container width
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    const el = containerRef.current;
    if (el) observer.observe(el);

    return () => observer.disconnect();
  }, []);

  // Two-way vertical scroll sync between WBS table and Gantt chart
  useEffect(() => {
    const ganttEl = containerRef.current;
    const wbsEl = wbsScrollRef?.current;
    if (!ganttEl || !wbsEl) return;

    let syncingFromGantt = false;
    let syncingFromWbs = false;

    const handleGanttScroll = () => {
      if (syncingFromWbs) return;
      syncingFromGantt = true;
      if (wbsEl.scrollTop !== ganttEl.scrollTop) {
        wbsEl.scrollTop = ganttEl.scrollTop;
      }
      requestAnimationFrame(() => {
        syncingFromGantt = false;
      });
    };

    const handleWbsScroll = () => {
      if (syncingFromGantt) return;
      syncingFromWbs = true;
      if (ganttEl.scrollTop !== wbsEl.scrollTop) {
        ganttEl.scrollTop = wbsEl.scrollTop;
      }
      requestAnimationFrame(() => {
        syncingFromWbs = false;
      });
    };

    ganttEl.addEventListener('scroll', handleGanttScroll, { passive: true });
    wbsEl.addEventListener('scroll', handleWbsScroll, { passive: true });
    return () => {
      ganttEl.removeEventListener('scroll', handleGanttScroll);
      wbsEl.removeEventListener('scroll', handleWbsScroll);
    };
  }, [wbsScrollRef, rows.length]);

  // Compute date range from all visible rows
  const { startDate, endDate, totalDays, timelineWidth } = useMemo(() => {
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    for (const row of rows) {
      const startStr = row.early_start || row.planned_start_date;
      const endStr = row.early_finish || row.planned_end_date;

      const start = parseDate(startStr);
      const end = parseDate(endStr);

      if (start) {
        if (!minDate || start < minDate) minDate = start;
      }
      if (end) {
        if (!maxDate || end > maxDate) maxDate = end;
      }
    }

    if (!minDate || !maxDate) {
      // Fallback: use status date ± 90 days
      const status = parseDate(statusDate);
      if (status) {
        minDate = new Date(status);
        minDate.setDate(minDate.getDate() - 90);
        maxDate = new Date(status);
        maxDate.setDate(maxDate.getDate() + 90);
      } else {
        minDate = new Date();
        maxDate = new Date();
        maxDate.setMonth(maxDate.getMonth() + 3);
      }
    }

    // Add 10% padding on each side
    const padding = (maxDate.getTime() - minDate.getTime()) * 0.1;
    const paddedStart = new Date(minDate.getTime() - padding);
    const paddedEnd = new Date(maxDate.getTime() + padding);

    const days = Math.ceil((paddedEnd.getTime() - paddedStart.getTime()) / (1000 * 60 * 60 * 24));
    const ppx = PIXELS_PER_DAY[zoom];

    return {
      startDate: paddedStart,
      endDate: paddedEnd,
      totalDays: days,
      timelineWidth: days * ppx,
    };
  }, [rows, zoom, statusDate]);

  // Date-to-pixel conversion function
  const dateToX = useCallback(
    (dateStr: string | null): number => {
      const d = parseDate(dateStr);
      if (!d) return 0;

      const diffMs = d.getTime() - startDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      return diffDays * PIXELS_PER_DAY[zoom];
    },
    [startDate, zoom],
  );

  // Timeline header dates
  const timelineDates = useMemo(
    () => generateTimelineDates(startDate, endDate, zoom, calendarExceptions),
    [startDate, endDate, zoom, calendarExceptions],
  );

  // Zoom controls
  const zoomIn = () => {
    setZoom((prev) => {
      if (prev === 'DAYS') return 'DAYS';
      if (prev === 'WEEKS') return 'DAYS';
      return 'WEEKS';
    });
  };

  const zoomOut = () => {
    setZoom((prev) => {
      if (prev === 'MONTHS') return 'MONTHS';
      if (prev === 'WEEKS') return 'MONTHS';
      return 'WEEKS';
    });
  };

  // Listen for custom Ribbon / Keyboard zoom & layer events
  useEffect(() => {
    const handleZoomIn = () => zoomIn();
    const handleZoomOut = () => zoomOut();
    const handleZoomToFit = () => {
      setZoom('WEEKS');
      if (containerRef.current) {
        containerRef.current.scrollLeft = 0;
      }
    };
    const handleToggleDeps = () => setShowDependencies((prev) => !prev);
    const handleToggleDropLine = () => setShowJaggedLine((prev) => !prev);
    const handleToggleBaseline = () => setShowBaselines((prev) => !prev);

    window.addEventListener('gantt:zoom-in', handleZoomIn);
    window.addEventListener('gantt:zoom-out', handleZoomOut);
    window.addEventListener('gantt:zoom-to-fit', handleZoomToFit);
    window.addEventListener('gantt:toggle-dependencies', handleToggleDeps);
    window.addEventListener('gantt:toggle-dropline', handleToggleDropLine);
    window.addEventListener('gantt:toggle-baseline', handleToggleBaseline);
    return () => {
      window.removeEventListener('gantt:zoom-in', handleZoomIn);
      window.removeEventListener('gantt:zoom-out', handleZoomOut);
      window.removeEventListener('gantt:zoom-to-fit', handleZoomToFit);
      window.removeEventListener('gantt:toggle-dependencies', handleToggleDeps);
      window.removeEventListener('gantt:toggle-dropline', handleToggleDropLine);
      window.removeEventListener('gantt:toggle-baseline', handleToggleBaseline);
    };
  }, []);

  // Horizontal scroll handler
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.deltaY === 0) return;

      const container = containerRef.current;
      if (!container) return;

      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        container.scrollLeft += e.deltaX || e.deltaY;
      }
    },
    [],
  );

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollX((e.target as HTMLDivElement).scrollLeft);
  }, []);

  // Bar click handler — broadcasts selection to all subscribers
  const handleBarClick = useCallback(
    (nodeId: string) => {
      selectNode(nodeId);
    },
    [selectNode],
  );

  // -----------------------------------------------------------------------
  // Drag Cascade & Ghost Trail System
  // -----------------------------------------------------------------------

  // Cursor position tracking for breach HUD
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });

  // Cascade hook for real-time drag projection
  const cascade = useGanttDragCascade(
    dependencies || [],
    baselines || {},
    undefined, // cdrlDueDates — would be fetched from CDRL API
    5, // float threshold: 5 days
  );

  // Global mouse move handler for drag cascade
  useEffect(() => {
    if (!cascade.isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setCursorPos({ x: e.clientX, y: e.clientY });

      // Calculate delta days from pixel displacement
      const draggedRow = rows.find((r) => r.id === cascade.draggedNodeId);
      if (!draggedRow) return;

      const origStartX = dateToX(draggedRow.early_start || draggedRow.planned_start_date);
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      const mouseXInContainer = e.clientX - containerRect.left + (containerRef.current?.scrollLeft || 0);
      const pixelDelta = mouseXInContainer - origStartX;
      const deltaDays = Math.round(pixelDelta / PIXELS_PER_DAY[zoom]);

      cascade.updateDragPosition(deltaDays, e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      // On drop: commit the shift and trigger server-side CPM
      const { draggedNodeId, deltaDays } = cascade;
      if (draggedNodeId && deltaDays !== 0) {
        const draggedRow = rows.find((r) => r.id === draggedNodeId);
        if (draggedRow) {
          // Calculate new dates
          const origStart = draggedRow.early_start || draggedRow.planned_start_date;
          const origFinish = draggedRow.early_finish || draggedRow.planned_end_date;

          // Helper: add working days
          const addWorkingDays = (dateStr: string | null, days: number): string | null => {
            if (!dateStr) return null;
            const d = new Date(dateStr);
            const sign = days >= 0 ? 1 : -1;
            let remaining = Math.abs(days);
            while (remaining > 0) {
              d.setDate(d.getDate() + sign);
              if (d.getDay() !== 0 && d.getDay() !== 6) remaining--;
            }
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
          };

          const newStart = addWorkingDays(origStart, deltaDays);
          const newFinish = addWorkingDays(origFinish, deltaDays);

          // Update local state
          updateRow(draggedNodeId, {
            planned_start_date: newStart,
            planned_end_date: newFinish,
          });

          // Push to history store as an invertible batch command
          const { startBatch, addBatchOperation, commitBatch } = useHistoryStore.getState();
          startBatch('BULK_SHIFT_DATES', `Shifted ${draggedRow.code} by ${deltaDays > 0 ? '+' : ''}${deltaDays} days`);

          // Record the dragged node's own date changes
          addBatchOperation({
            node_id: draggedNodeId,
            field: 'planned_start_date',
            oldValue: origStart,
            newValue: newStart,
          });
          addBatchOperation({
            node_id: draggedNodeId,
            field: 'planned_end_date',
            oldValue: origFinish,
            newValue: newFinish,
          });

          // Record all cascade-affected downstream nodes
          for (const [nodeId, projection] of cascade.projectedCascadeMap.entries()) {
            if (nodeId === draggedNodeId) continue; // Already recorded above
            addBatchOperation({
              node_id: nodeId,
              field: 'planned_start_date',
              oldValue: projection.originalStart,
              newValue: projection.projectedStart,
            });
            addBatchOperation({
              node_id: nodeId,
              field: 'planned_end_date',
              oldValue: projection.originalFinish,
              newValue: projection.projectedFinish,
            });

            // Update cascade-affected rows in the schedule store
            updateRow(nodeId, {
              planned_start_date: projection.projectedStart,
              planned_end_date: projection.projectedFinish,
            });
          }

          commitBatch();
        }
      }

      cascade.endDrag();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [cascade.isDragging, cascade.draggedNodeId, cascade.deltaDays, rows, dateToX, zoom, cascade.updateDragPosition, cascade.endDrag]);

  // Start drag handler passed to GanttBar
  const handleStartDrag = useCallback(
    (nodeId: string, _clientX: number) => {
      cascade.startDrag(nodeId, _clientX);
    },
    [cascade.startDrag],
  );

  // Update row helper
  const updateRow = useCallback(
    (nodeId: string, updates: Record<string, unknown>) => {
      useScheduleStore.getState().updateRow(nodeId, updates);
    },
    [],
  );

  // Header height matches WbsTable headerHeight (rowHeight) so rows align 1:1
  const headerHeight = rowHeight;
  const totalRowsHeight = rows.length * rowHeight;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-ops-base, #0F172A)',
        borderLeft: '1px solid var(--border-ops-subtle, #334155)',
      }}
    >
      {/* Scrollable chart viewport (matches WbsTable scrollRef flex-1 min-h-0 overflow-auto) */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onScroll={handleScroll}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'relative',
            minWidth: `${timelineWidth}px`,
            width: `${timelineWidth}px`,
            height: `${headerHeight + totalRowsHeight}px`,
          }}
        >
          {/* Timeline header — sticky at top, exact same height as WbsTable header */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              height: `${headerHeight}px`,
              width: `${timelineWidth}px`,
              backgroundColor: 'var(--bg-ops-surface, #1E293B)',
              borderBottom: '1px solid var(--border-ops-subtle, #334155)',
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${timelineWidth}px` }}>
              {timelineDates.map((td, i) => {
                const x = dateToX(formatDate(td.date));
                if (x < 0 || x > containerWidth + scrollX + 200) return null;

                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      left: `${x}px`,
                      top: 0,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderLeft: td.isMajor
                        ? '1px solid var(--border-ops-strong, #475569)'
                        : '1px solid var(--border-ops-subtle, #334155)',
                      paddingLeft: '4px',
                      minWidth: zoom === 'DAYS' ? 20 : zoom === 'WEEKS' ? 14 : 10,
                      backgroundColor: td.isHoliday ? 'rgba(248, 113, 113, 0.1)' : undefined,
                    }}
                    title={td.holidayDesc || undefined}
                  >
                    <span
                      style={{
                        fontSize: zoom === 'DAYS' ? '10px' : '9px',
                        color: td.isMajor ? '#F8FAFC' : '#94A3B8',
                        fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {td.label}
                    </span>
                    {td.isHoliday && (
                      <span style={{ fontSize: '7px', color: '#F87171', marginTop: '1px' }}>
                        ★
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Main chart area directly below headerHeight */}
          <div
            style={{
              position: 'relative',
              width: `${timelineWidth}px`,
              height: `${totalRowsHeight}px`,
            }}
          >
            {/* Grid lines and weekend/holiday bands */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 0,
              }}
            >
              {timelineDates.map((td, i) => {
                const x = dateToX(formatDate(td.date));
                if (x < 0) return null;

                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      left: `${x}px`,
                      top: 0,
                      bottom: 0,
                      width: '1px',
                      backgroundColor: td.isMajor
                        ? 'var(--border-ops-strong, #475569)'
                        : td.isHoliday
                        ? 'rgba(248, 113, 113, 0.4)'
                        : td.isWeekend
                        ? 'rgba(100, 116, 139, 0.2)'
                        : 'var(--border-ops-subtle, #334155)',
                      opacity: td.isMajor ? 0.5 : 0.2,
                    }}
                  />
                );
              })}

              {/* Weekend column bands (Day mode only) */}
              {zoom === 'DAYS' &&
                (() => {
                  const bands: React.ReactElement[] = [];
                  let inWeekend = false;
                  let weekendStart = 0;

                  for (let i = 0; i < timelineDates.length; i++) {
                    const td = timelineDates[i];
                    const x = dateToX(formatDate(td.date));

                    if (td.isWeekend && !inWeekend) {
                      inWeekend = true;
                      weekendStart = x;
                    } else if (!td.isWeekend && inWeekend) {
                      inWeekend = false;
                      bands.push(
                        <div
                          key={`we-${i}`}
                          style={{
                            position: 'absolute',
                            left: `${weekendStart}px`,
                            top: 0,
                            bottom: 0,
                            width: `${x - weekendStart + PIXELS_PER_DAY[zoom]}px`,
                            backgroundColor: 'rgba(100, 116, 139, 0.06)',
                            pointerEvents: 'none',
                          }}
                        />,
                      );
                    }
                  }

                  // Close any open weekend band at the end
                  if (inWeekend) {
                    const lastX = dateToX(formatDate(timelineDates[timelineDates.length - 1].date));
                    bands.push(
                      <div
                        key="we-end"
                        style={{
                          position: 'absolute',
                          left: `${weekendStart}px`,
                          top: 0,
                          bottom: 0,
                          width: `${lastX - weekendStart + PIXELS_PER_DAY[zoom] * 2}px`,
                          backgroundColor: 'rgba(100, 116, 139, 0.06)',
                          pointerEvents: 'none',
                        }}
                      />,
                    );
                  }

                  return bands;
                })()}
            </div>

            {/* Row area with bars */}
            <div
              style={{
                position: 'relative',
                height: `${totalRowsHeight}px`,
              }}
            >
              {/* Dependency edges SVG layer */}
              <GanttDependencies
                rows={rows}
                dependencies={dependencies}
                rowHeight={rowHeight}
                barHeight={barHeight}
                dateToX={dateToX}
                timelineWidth={timelineWidth}
                startDate={startDate}
                zoom={zoom}
                visible={showDependencies}
                activeNodeId={hoveredNodeId || selectedNodeId}
              />

              {/* Jagged status-date drop line */}
              <GanttDropLine
                rows={rows}
                rowHeight={rowHeight}
                statusDate={statusDate}
                dateToX={dateToX}
                timelineWidth={timelineWidth}
                visible={showJaggedLine}
              />

              {/* Ghost trail overlay layer */}
              <GanttCanvasGhostLayer
                rows={rows}
                projectedCascadeMap={cascade.projectedCascadeMap}
                dateToX={dateToX}
                rowHeight={rowHeight}
                barHeight={barHeight}
                hasCriticalBreach={cascade.hasCriticalBreach}
                timelineWidth={timelineWidth}
              />

              {/* Gantt bars */}
              {rows.map((row, index) => {
                const y = index * rowHeight;
                const isSelected = row.id === selectedNodeId || row.selected;
                const isHovered = hoveredNodeId === row.id;
                const isDragged = cascade.draggedNodeId === row.id;
                const isCascadeAffected = cascade.projectedCascadeMap.has(row.id);

                return (
                  <div
                    key={row.id}
                    style={{
                      position: 'absolute',
                      top: `${y}px`,
                      left: 0,
                      width: `${timelineWidth}px`,
                      height: `${rowHeight}px`,
                      backgroundColor: isSelected
                        ? 'rgba(56, 189, 248, 0.08)'
                        : isHovered
                        ? 'rgba(56, 189, 248, 0.04)'
                        : 'transparent',
                      borderBottom: '1px solid var(--border-ops-subtle, #334155)',
                      boxSizing: 'border-box',
                      zIndex: 3,
                    }}
                  >
                    <GanttBar
                      row={row}
                      baseline={baselines[row.id]}
                      dateToX={dateToX}
                      rowWidth={timelineWidth}
                      rowHeight={rowHeight}
                      barHeight={barHeight}
                      showBaselines={showBaselines}
                      onClick={handleBarClick}
                      onMouseEnter={setHoveredNodeId}
                      onMouseLeave={() => setHoveredNodeId(null)}
                      isDimmed={isDimmed && !matchingNodeIds.has(row.id)}
                      isMatch={isDimmed && matchingNodeIds.has(row.id)}
                      isDragBreach={cascade.hasCriticalBreach && (isDragged || isCascadeAffected)}
                      pixelsPerDay={PIXELS_PER_DAY[zoom]}
                      onStartDrag={handleStartDrag}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Footer toolbar with zoom controls — matches WbsTable h-8 footer height */}
      <div
        className="h-8 box-border"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '0 12px',
          height: '32px',
          backgroundColor: 'var(--bg-ops-surface, #1E293B)',
          borderTop: '1px solid var(--border-ops-subtle, #334155)',
          flexShrink: 0,
        }}
      >
        <Calendar size={14} color="#94A3B8" />
        <span style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'var(--font-sans)' }}>
          Timeline
        </span>

        <button
          onClick={() => setShowDependencies((prev) => !prev)}
          style={{
            background: showDependencies ? 'rgba(56, 189, 248, 0.14)' : 'none',
            border: `1px solid ${showDependencies ? '#38BDF8' : 'var(--border-ops-subtle, #334155)'}`,
            borderRadius: '4px',
            padding: '1px 8px',
            fontSize: '10px',
            cursor: 'pointer',
            color: showDependencies ? '#38BDF8' : '#94A3B8',
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          }}
          title="Toggle dependency line connectors"
        >
          Links ({dependencies.length})
        </button>

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase' }}>
          {zoom}
        </span>

        <button
          onClick={zoomOut}
          disabled={zoom === 'MONTHS'}
          style={{
            background: 'none',
            border: '1px solid var(--border-ops-subtle, #334155)',
            borderRadius: '4px',
            padding: '2px 6px',
            cursor: zoom === 'MONTHS' ? 'not-allowed' : 'pointer',
            opacity: zoom === 'MONTHS' ? 0.4 : 1,
            color: '#94A3B8',
          }}
          title="Zoom out"
        >
          <ZoomOut size={12} />
        </button>

        <button
          onClick={zoomIn}
          disabled={zoom === 'DAYS'}
          style={{
            background: 'none',
            border: '1px solid var(--border-ops-subtle, #334155)',
            borderRadius: '4px',
            padding: '2px 6px',
            cursor: zoom === 'DAYS' ? 'not-allowed' : 'pointer',
            opacity: zoom === 'DAYS' ? 0.4 : 1,
            color: '#94A3B8',
          }}
          title="Zoom in"
        >
          <ZoomIn size={12} />
        </button>
      </div>

      {/* Breach Warning HUD — floats near cursor during drag */}
      {cascade.hasCriticalBreach && cascade.breaches.length > 0 && (
        <DragBreachWarningHUD
          breaches={cascade.breaches}
          cursorX={cursorPos.x}
          cursorY={cursorPos.y}
        />
      )}
    </div>
  );
};

export default GanttViewport;
