/**
 * WBS Table — Virtualized Work Breakdown Structure Grid
 *
 * High-performance virtualized table component for displaying 1,000+ WBS nodes
 * using @tanstack/react-table. Row height is driven by the CSS `--row-height`
 * variable from the Defence Design Token System, so it automatically adapts
 * to the user's density preference (ULTRA_DENSE / BALANCED / COMFORT).
 *
 * Features:
 * - Virtualized row rendering for smooth scrolling with large datasets.
 * - Code & Hierarchy column with indent level from ltree dot count and
 *   expandable chevron toggle for nodes with children.
 * - Name & Title column with '[RESTRICTED]' masking for ABAC-classified nodes.
 * - Delivery Mode badge (WATERFALL, AGILE, HYBRID).
 * - Start / Finish dates in monospace font.
 * - Total Float with red highlight for critical path (TF ≤ 0).
 * - Progress mini bar + percentage text.
 * - Blocker warning glyphs with tooltips.
 * - Sub-tree expansion with dynamic child loading from the API.
 * - Row selection synchronized with useScheduleStore for Gantt split-pane sync.
 */

import React, { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
} from '@tanstack/react-table';
import {
  ChevronRight,
  ChevronDown,
  Lock,
  AlertTriangle,
  AlertCircle,
  OctagonAlert,
  Loader2,
  User,
  Users,
  Zap,
  Pin,
  Kanban,
} from 'lucide-react';
import { useScheduleStore } from '../../stores/useScheduleStore';
import { useDisplayStore } from '../../stores/useDisplayStore';
import { usePresenceStore, CellFocusRecord } from '../../stores/usePresenceStore';
import { WBSRow, BlockerSeverity, BlockerCategory } from '../../types/wbs';
import { useHoverInspector } from '../../hooks/useHoverInspector';
import { useContextMenu } from '../common/contextmenu/ContextMenuProvider';
import HoverSummaryModal from '../common/HoverSummaryModal';
import PresenceAvatars from '../common/PresenceAvatars';
import { useInlineEdit, addWorkdays, calculateWorkdayDuration } from '../../hooks/useInlineEdit';
import InlineEditCell from './InlineEditCell';
import WbsCellRenderer from './WbsCellRenderer';
import DependencyModal from './DependencyModal';
import BulkOperationsHUD from './BulkOperationsHUD';
import DragFillHandle from './DragFillHandle';
import { EditableField, EDITABLE_COLUMN_IDS } from '../../types/editing';
import { useLeaseState } from '../../hooks/useLeaseState';
import { formatDateForDisplay, formatFinishDateForDisplay, DateFormatConfig } from '../../utils/dateFormatting';
import { useProjectWebSocket } from '../../hooks/useProjectWebSocket';
import { useCellPresence } from '../../hooks/useCellPresence';
import { ExportControlBadge } from '../../views/compliance/ExportControlDashboardView';
import { parseDependencyText, formatDependencyList } from '../../utils/dependencyText';
import { parseDurationToDays, formatDaysToDuration } from '../../utils/durationText';
import { computeDurationFromDates } from '../../utils/scheduleCalculator';
import api from '../../services/api';
import ColumnVisibilityMenu from './ColumnVisibilityMenu';
import ResourcePickerPopup from './ResourcePickerPopup';
import EndEditChoiceModal from '../common/EndEditChoiceModal';
import EffortComparison from './EffortComparison';

// ---------------------------------------------------------------------------
// Tooltip Component
// ---------------------------------------------------------------------------

interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const [visible, setVisible] = React.useState(false);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs rounded bg-bg-ops-overlay text-text-ops-primary whitespace-nowrap shadow-lg border border-border-ops-subtle">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-bg-ops-overlay" />
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Blocker Glyph Mapping
// ---------------------------------------------------------------------------

/**
 * CellFocusIndicator — Colored border and compact avatar chip for a cell
 * actively edited by a peer.
 *
 * Wraps a cell's content and renders:
 * - A colored border matching the editing colleague's display color.
 * - A compact avatar chip (initials) in the top-right corner.
 */
interface CellFocusIndicatorProps {
  cellFocus: CellFocusRecord;
  children: React.ReactNode;
}

const CellFocusIndicator: React.FC<CellFocusIndicatorProps> = ({
  cellFocus,
  children,
}) => {
  const initials = cellFocus.user_upn.split('@')[0].charAt(0).toUpperCase();

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: '3px',
        border: `2px solid ${cellFocus.display_color}`,
        padding: '0 18px',
        minHeight: '20px',
      }}
    >
      {/* Compact avatar chip */}
      <div
        title={`Cell actively edited by ${cellFocus.user_upn}`}
        style={{
          position: 'absolute',
          top: '-8px',
          right: '-8px',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          backgroundColor: cellFocus.display_color,
          border: '2px solid #0F172A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '9px',
          fontWeight: 700,
          color: '#0F172A',
          zIndex: 20,
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        {initials}
      </div>
      {children}
    </div>
  );
};

const blockerGlyphs: Record<BlockerCategory, React.ReactNode> = {
  DEPENDENCY_OVERDUE: <AlertTriangle size={14} className="text-rag-amber" />,
  RESOURCE_UNAVAILABLE: <AlertCircle size={14} className="text-rag-amber" />,
  CLEARANCE_HOLD: <Lock size={14} className="text-cls-secret" />,
  FACILITY_MAINTENANCE: <AlertTriangle size={14} className="text-rag-amber" />,
  OPERATIONAL_IMPEDIMENT: <OctagonAlert size={14} className="text-rag-red" />,
};

const blockerSeverityColors: Record<BlockerSeverity, string> = {
  CRITICAL: 'text-rag-red',
  MAJOR: 'text-rag-amber',
  MINOR: 'text-text-ops-muted',
};

// ---------------------------------------------------------------------------
// Delivery Mode Badge
// ---------------------------------------------------------------------------

const deliveryModeColors: Record<string, string> = {
  WATERFALL: 'bg-blue-900/50 text-blue-300 border-blue-700',
  AGILE: 'bg-green-900/50 text-green-300 border-green-700',
  HYBRID: 'bg-purple-900/50 text-purple-300 border-purple-700',
};

const DeliveryModeBadge: React.FC<{
  mode: string | null;
  backlogName?: string | null;
  onOpenKanban?: () => void;
}> = ({ mode, backlogName, onOpenKanban }) => {
  if (!mode) return <span className="text-text-ops-muted text-xs">—</span>;

  if (mode === 'AGILE' || mode === 'HYBRID') {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenKanban?.();
        }}
        className={clsx(
          'inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded border transition-colors select-none',
          mode === 'AGILE'
            ? 'bg-emerald-950/70 text-emerald-300 border-emerald-600/70 hover:bg-emerald-900 hover:border-emerald-500'
            : 'bg-purple-950/70 text-purple-300 border-purple-600/70 hover:bg-purple-900 hover:border-purple-500',
        )}
        title={backlogName ? `Backlog: ${backlogName} — Click to open Sprint Kanban Board` : 'Agile Task — Click to open Sprint Kanban Board'}
      >
        <Kanban size={11} className={mode === 'AGILE' ? 'text-emerald-400' : 'text-purple-400'} />
        <span>{mode}</span>
        {backlogName && (
          <span className="text-[10px] opacity-80 font-mono truncate max-w-[70px]">
            ({backlogName})
          </span>
        )}
      </button>
    );
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${
        deliveryModeColors[mode] || 'bg-bg-ops-overlay text-text-ops-muted border-border-ops-subtle'
      }`}
    >
      {mode}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Scheduling Mode Badge (Auto vs Manual)
// ---------------------------------------------------------------------------

const SchedulingModeBadge: React.FC<{
  mode?: string | null;
  onToggle?: () => void;
  disabled?: boolean;
}> = ({ mode, onToggle, disabled }) => {
  const isAuto = (mode || 'AUTO') === 'AUTO';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono font-medium transition-colors border select-none',
        isAuto
          ? 'bg-blue-950/60 border-blue-600/60 text-blue-300 hover:bg-blue-900/60 hover:border-blue-500'
          : 'bg-slate-800/80 border-slate-600/60 text-slate-300 hover:bg-slate-700/80 hover:border-slate-500',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
      title={isAuto ? 'Auto Scheduling (click to toggle Manual)' : 'Manual Scheduling (click to toggle Auto)'}
    >
      {isAuto ? (
        <>
          <Zap size={11} className="text-amber-400 fill-amber-400/30" />
          <span>Auto</span>
        </>
      ) : (
        <>
          <Pin size={11} className="text-slate-400" />
          <span>Manual</span>
        </>
      )}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Progress Bar
// ---------------------------------------------------------------------------

const ProgressBar: React.FC<{ percent: number }> = ({ percent }) => {
  const clamped = Math.max(0, Math.min(100, percent));
  const isComplete = clamped >= 100;

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 bg-bg-ops-overlay rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isComplete ? 'bg-rag-green' : clamped > 50 ? 'bg-rag-amber' : 'bg-rag-red'
          }`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs font-mono text-text-ops-muted min-w-[3ch] text-right">
        {Math.round(clamped)}%
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Lock Indicator Component
// ---------------------------------------------------------------------------

/**
 * Renders a lock icon and avatar pill when a node is checked out by another user.
 */
const LockIndicator: React.FC<{ leaseHolderUpn: string; expiresAt: string }> = ({
  leaseHolderUpn,
  expiresAt,
}) => {
  const shortUpn = leaseHolderUpn.split('@')[0];

  return (
    <Tooltip
      content={`Checked out by CAM ${leaseHolderUpn}. Editing restricted. Expires: ${new Date(expiresAt).toLocaleTimeString()}`}
    >
      <div className="flex items-center gap-1 flex-shrink-0">
        <Lock size={12} className="text-amber-500" />
        <div className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-900/30 border border-amber-700/50 rounded-full">
          <User size={10} className="text-amber-500" />
          <span className="text-[10px] text-amber-400 truncate max-w-[60px]">
            {shortUpn}
          </span>
        </div>
      </div>
    </Tooltip>
  );
};

// ---------------------------------------------------------------------------
// Date Formatting (T0-aware)
// ---------------------------------------------------------------------------

/**
 * Format a date for display, using the T0-aware formatter from dateFormatting.ts.
 * The local formatDate is kept for backward compatibility with non-T0 contexts.
 */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length >= 3) {
    return `${parts[0]}-${parts[1]}-${parts[2]}`;
  }
  return dateStr;
}

// ---------------------------------------------------------------------------
// Chevron Toggle
// ---------------------------------------------------------------------------

interface ChevronToggleProps {
  expanded: boolean;
  hasChildren: boolean;
  onClick: () => void;
  indentLevel: number;
}

const ChevronToggle: React.FC<ChevronToggleProps> = ({
  expanded,
  hasChildren,
  onClick,
  indentLevel,
}) => {
  // Base indent for the chevron area
  const chevronWidth = 20;
  const indentPx = indentLevel * 16;

  return (
    <div
      className="flex items-center h-full"
      style={{ paddingLeft: `${indentPx}px` }}
    >
      {hasChildren ? (
        <button
          type="button"
          onClick={onClick}
          className="flex items-center justify-center w-5 h-5 text-text-ops-muted hover:text-text-ops-primary transition-colors"
          aria-label={expanded ? 'Collapse node' : 'Expand node'}
        >
          {expanded ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronRight size={14} />
          )}
        </button>
      ) : (
        <div style={{ width: chevronWidth }} />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Hover Cell Wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps a table cell to enable the dwell-and-hover inspector.
 * When the user hovers for 5 seconds, the HoverSummaryModal opens.
 */
const HoverCell: React.FC<{
  nodeId: string;
  children: React.ReactNode;
  onHoverEnter: (nodeId: string, ref: React.MutableRefObject<HTMLDivElement | null>) => void;
  onHoverLeave: () => void;
}> = ({ nodeId, children, onHoverEnter, onHoverLeave }) => {
  const cellRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
    onHoverEnter(nodeId, cellRef);
  }, [nodeId, onHoverEnter]);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    onHoverLeave();
  }, [onHoverLeave]);

  return (
    <div
      ref={cellRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="h-full w-full"
    >
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Table Component
// ---------------------------------------------------------------------------

interface WbsTableProps {
  /** Root node ID to load the tree for */
  rootNodeId: string;
  /** Optional class for the container */
  className?: string;
  /** Whether to display dates as relative T0 offsets */
  isRelativeMode?: boolean;
  /** ATP anchor date for converting relative offsets to calendar dates */
  atpAnchorDate?: string | null;
  /** Optional external scroll container ref for synchronized scrolling with GanttViewport */
  externalScrollRef?: React.RefObject<HTMLDivElement>;
}

const WbsTable: React.FC<WbsTableProps> = ({
  rootNodeId,
  className = '',
  isRelativeMode = false,
  atpAnchorDate = null,
  externalScrollRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = externalScrollRef || internalScrollRef;
  const [containerHeight, setContainerHeight] = React.useState(600);

  // Context menu
  const { openContextMenu } = useContextMenu();

  // Lease state for check-out management
  const { activeLeases, isNodeLocked, getLeaseHolder } = useLeaseState();

  // WebSocket for real-time collaboration
  const projectWebSocket = useProjectWebSocket(rootNodeId || null);

  // Cell focus state from presence store
  const getCellFocus = usePresenceStore((s) => s.getCellFocus);

  // Cell presence hook — consolidates focus broadcasting and soft-lock checking
  const cellPresence = useCellPresence(rootNodeId || null);

  // Soft-lock warning toast state (server-initiated warnings)
  const [softLockToast, setSoftLockToast] = useState<{
    holderUpn: string;
    visible: boolean;
  } | null>(null);
  const softLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ephemeral hover tooltip state — shown when hovering a soft-locked cell
  const [softLockHover, setSoftLockHover] = useState<{
    holderUpn: string;
    x: number;
    y: number;
  } | null>(null);

  // Set up soft-lock callback for server-initiated warnings
  useEffect(() => {
    projectWebSocket.setSoftLockCallback((holderUpn, _nodeId, _columnKey) => {
      setSoftLockToast({ holderUpn, visible: true });
      if (softLockTimerRef.current) {
        clearTimeout(softLockTimerRef.current);
      }
      softLockTimerRef.current = setTimeout(() => {
        setSoftLockToast(null);
      }, 4000);
    });
    return () => {
      projectWebSocket.setSoftLockCallback(null);
      if (softLockTimerRef.current) {
        clearTimeout(softLockTimerRef.current);
      }
    };
  }, [projectWebSocket]);

  // Store state
  const allRows = useScheduleStore((s) => s.rows);
  const loading = useScheduleStore((s) => s.loading);
  const selectedNodeId = useScheduleStore((s) => s.selectedNodeId);
  const selectedNodeIds = useScheduleStore((s) => s.selectedNodeIds);
  const selectNode = useScheduleStore((s) => s.selectNode);
  const toggleExpand = useScheduleStore((s) => s.toggleExpand);
  const loadTree = useScheduleStore((s) => s.loadTree);
  const toggleRowSelection = useScheduleStore((s) => s.toggleRowSelection);
  const clearRowSelection = useScheduleStore((s) => s.clearRowSelection);
  const dependencies = useScheduleStore((s) => s.dependencies);
  const addDependency = useScheduleStore((s) => s.addDependency);
  const removeDependency = useScheduleStore((s) => s.removeDependency);
  const resourceAssignments = useScheduleStore((s) => s.resourceAssignments);
  const addResourceAssignment = useScheduleStore((s) => s.addResourceAssignment);
  const removeResourceAssignment = useScheduleStore((s) => s.removeResourceAssignment);
  const updateNode = useScheduleStore((s) => s.updateNode);
  const toggleSchedulingMode = useScheduleStore((s) => s.toggleSchedulingMode);
  const insertChildTask = useScheduleStore((s) => s.insertChildTask);
  const insertSiblingTask = useScheduleStore((s) => s.insertSiblingTask);
  const siblingRelationshipMode = useScheduleStore((s) => s.siblingRelationshipMode);
  const setSiblingRelationshipMode = useScheduleStore((s) => s.setSiblingRelationshipMode);
  const hiddenColumns = useScheduleStore((s) => s.columnState.hiddenColumns);
  const updateColumnState = useScheduleStore((s) => s.updateColumnState);

  // Right-click header menu for toggling column visibility
  const [columnMenuPos, setColumnMenuPos] = useState<{ x: number; y: number } | null>(null);

  // Dependency modal state
  const [dependencyModalNode, setDependencyModalNode] = useState<string | null>(null);

  // End date edit choice modal state
  const [showEndEditChoice, setShowEndEditChoice] = useState(false);
  const [endEditInfo, setEndEditInfo] = useState<{
    nodeId: string;
    oldEndDate: string;
    newEndDate: string;
    startDate: string;
  } | null>(null);

  // Resource picker popover state for the filterable checklist
  const [resourcePickerState, setResourcePickerState] = useState<{
    position: { x: number; y: number };
    nodeId: string;
    taskLabel: string;
  } | null>(null);
  const columnVisibility = useMemo(() => {
    const visibility: Record<string, boolean> = {};
    for (const id of hiddenColumns) {
      visibility[id] = false;
    }
    return visibility;
  }, [hiddenColumns]);
  const toggleColumnVisibility = useCallback(
    (columnId: string) => {
      const isHidden = hiddenColumns.includes(columnId);
      const nextHidden = isHidden
        ? hiddenColumns.filter((id) => id !== columnId)
        : [...hiddenColumns, columnId];
      updateColumnState({ hiddenColumns: nextHidden });
    },
    [hiddenColumns, updateColumnState],
  );

  // Filter state
  const filterMode = useScheduleStore((s) => s.filterMode);
  const visibleNodeIds = useScheduleStore((s) => s.visibleNodeIds);
  const matchingNodeIds = useScheduleStore((s) => s.matchingNodeIds);

  // Apply filter: in FILTER mode, show only visible rows; in DIM mode, show all rows
  const rows = useMemo(() => {
    if (visibleNodeIds.size === 0) return allRows;
    if (filterMode === 'DIM') return allRows;
    // FILTER mode: only show visible nodes
    return allRows.filter((r) => visibleNodeIds.has(r.id));
  }, [allRows, visibleNodeIds, filterMode]);

  const isDimMode = filterMode === 'DIM' && visibleNodeIds.size > 0;

  // Code <-> ID lookup maps for resolving Predecessors/Successors text tokens
  // against the full (unfiltered) node set.
  const codeToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of allRows) {
      if (r.code) map.set(r.code.trim().toLowerCase(), r.id);
    }
    return map;
  }, [allRows]);

  const idToCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of allRows) {
      map.set(r.id, r.code);
    }
    return map;
  }, [allRows]);

  // Resource catalogue for the Resources column autocomplete (fetched once on mount).
  const [resourceOptions, setResourceOptions] = useState<{ id: string; code: string; name: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    api
      .get<any>('/resources/')
      .then((resp) => {
        if (cancelled) return;
        const data = resp?.data !== undefined ? resp.data : resp;
        if (Array.isArray(data?.resources)) {
          setResourceOptions(data.resources);
        }
      })
      .catch(() => {
        // Non-fatal — autocomplete simply won't suggest anything
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resourceCodeToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of resourceOptions) {
      if (r.code) map.set(r.code.trim().toLowerCase(), r.id);
    }
    return map;
  }, [resourceOptions]);

  // Handle toggling resource assignment from the filterable checklist popover
  const handleToggleResourceAssignment = useCallback(
    (resourceId: string, resourceCode: string) => {
      if (!resourcePickerState) return;
      const nodeId = resourcePickerState.nodeId;
      const existing = resourceAssignments.find(
        (a) =>
          a.portfolio_node_id === nodeId &&
          (a.resource_node_id === resourceId ||
            (a.resource_code && a.resource_code.toLowerCase() === resourceCode.toLowerCase())),
      );
      if (existing) {
        removeResourceAssignment(existing.id);
      } else {
        addResourceAssignment(nodeId, resourceId, 1.0);
      }
    },
    [resourcePickerState, resourceAssignments, removeResourceAssignment, addResourceAssignment],
  );

  // Commit handler for the Predecessors/Successors/Resources/Duration columns.
  const handleCustomFieldCommit = useCallback(
    (nodeId: string, field: EditableField, newValue: string | number | null): boolean => {
      if (field === 'predecessors' || field === 'successors') {
        const text = newValue != null ? String(newValue) : '';
        const tokens = parseDependencyText(text);

        const resolved = tokens
          .map((t) => ({
            otherId: codeToId.get(t.code.trim().toLowerCase()),
            type: t.type,
            lagDays: t.lagDays,
          }))
          .filter((t): t is { otherId: string; type: typeof t.type; lagDays: number } => !!t.otherId && t.otherId !== nodeId);

        const existing = dependencies.filter((d) =>
          field === 'predecessors' ? d.successor_id === nodeId : d.predecessor_id === nodeId,
        );

        // Remove links no longer present in the typed text
        for (const dep of existing) {
          const otherId = field === 'predecessors' ? dep.predecessor_id : dep.successor_id;
          const stillPresent = resolved.some(
            (r) => r.otherId === otherId && r.type === dep.dependency_type && r.lagDays === (dep.lag_days || 0),
          );
          if (!stillPresent) {
            removeDependency(dep.id);
          }
        }

        // Add/update links for tokens not already represented
        for (const r of resolved) {
          const alreadyExists = existing.some(
            (dep) =>
              (field === 'predecessors' ? dep.predecessor_id : dep.successor_id) === r.otherId &&
              dep.dependency_type === r.type &&
              (dep.lag_days || 0) === r.lagDays,
          );
          if (!alreadyExists) {
            if (field === 'predecessors') {
              addDependency(r.otherId, nodeId, r.type, r.lagDays);
            } else {
              addDependency(nodeId, r.otherId, r.type, r.lagDays);
            }
          }
        }

        return true;
      }

      if (field === 'resources') {
        const text = newValue != null ? String(newValue) : '';
        const typedCodes = text
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean);

        const resolvedIds = typedCodes
          .map((code) => resourceCodeToId.get(code.toLowerCase()))
          .filter((id): id is string => !!id);

        const existing = resourceAssignments.filter((a) => a.portfolio_node_id === nodeId);

        // Remove assignments no longer present in the typed text
        for (const a of existing) {
          if (!resolvedIds.includes(a.resource_node_id)) {
            removeResourceAssignment(a.id);
          }
        }

        // Add assignments for newly typed resource codes
        for (const resourceId of resolvedIds) {
          const alreadyAssigned = existing.some((a) => a.resource_node_id === resourceId);
          if (!alreadyAssigned) {
            addResourceAssignment(nodeId, resourceId, 1.0);
          }
        }

        return true;
      }

      if (field === 'duration') {
        const text = newValue != null ? String(newValue) : '';
        const days = parseDurationToDays(text);
        if (days == null) return true; // Unparseable — ignore the edit

        const node = allRows.find((r) => r.id === nodeId);
        const roundedDays = Math.round(days);
        const todayStr = new Date().toISOString().split('T')[0];
        let startDate = node?.planned_start_date || todayStr;
        const lag = (node?.lag_days as number) ?? 0;
        const totalWorkdays = roundedDays + lag;
        const newEndDate = addWorkdays(startDate, Math.max(0, totalWorkdays - 1));

        // Update duration as a first-class field along with computed dates
        updateNode(nodeId, {
          planned_start_date: startDate,
          planned_end_date: newEndDate,
          duration_days: roundedDays,
        } as any);
        return true;
      }

      if (field === 'planned_end_date') {
        // Show the end-date-edit choice modal
        const node = allRows.find((r) => r.id === nodeId);
        const oldEndDate = node?.planned_end_date as string | null;
        const startDate = (node?.planned_start_date as string) || '';
        const newEndDate = String(newValue || '');
        if (startDate && oldEndDate && newEndDate !== oldEndDate) {
          setEndEditInfo({ nodeId, oldEndDate, newEndDate, startDate });
          setShowEndEditChoice(true);
          return true; // Handled by modal
        }
        // No start date or same value — just update normally
        updateNode(nodeId, { planned_end_date: newEndDate } as any);
        return true;
      }

      return false;
    },
    [
      codeToId,
      dependencies,
      addDependency,
      removeDependency,
      resourceCodeToId,
      resourceAssignments,
      addResourceAssignment,
      removeResourceAssignment,
      allRows,
      updateNode,
    ],
  );

  // Inline editing hook
  const editHook = useInlineEdit({ rows, rowHeight: 36, onCommitField: handleCustomFieldCommit });

  // Keyboard handler for inline editing
  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (editHook.activeCell) {
        cellPresence.clearCellFocus(editHook.activeCell.nodeId, editHook.activeCell.field);
      }
      editHook.moveToNextRow();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (editHook.activeCell) {
        cellPresence.clearCellFocus(editHook.activeCell.nodeId, editHook.activeCell.field);
      }
      if (e.shiftKey) {
        editHook.moveToPrevCell();
      } else {
        editHook.moveToNextCell();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (editHook.activeCell) {
        cellPresence.clearCellFocus(editHook.activeCell.nodeId, editHook.activeCell.field);
      }
      editHook.revertEdit();
    }
  }, [editHook, cellPresence]);

  // Wrapper: start edit and notify server of cell focus
  const startEditWithFocus = useCallback(
    (rowIndex: number, nodeId: string, field: EditableField, value: string | number | null) => {
      cellPresence.setCellFocus(nodeId, field);
      editHook.startEdit(rowIndex, nodeId, field, value);
    },
    [cellPresence, editHook],
  );

  // Wrapper: commit edit and clear cell focus
  const commitEditWithBlur = useCallback(() => {
    if (editHook.activeCell) {
      cellPresence.clearCellFocus(editHook.activeCell.nodeId, editHook.activeCell.field);
    }
    editHook.commitEdit();
  }, [editHook, cellPresence]);

  // Wrapper: revert edit and clear cell focus
  const revertEditWithBlur = useCallback(() => {
    if (editHook.activeCell) {
      cellPresence.clearCellFocus(editHook.activeCell.nodeId, editHook.activeCell.field);
    }
    editHook.revertEdit();
  }, [editHook, cellPresence]);

  // Soft-lock hover tooltip handler — shows ephemeral tooltip on hover
  const handleSoftLockHover = useCallback(
    (e: React.MouseEvent, nodeId: string, field: EditableField) => {
      const holderUpn = cellPresence.getSoftLockHolder(nodeId, field);
      if (holderUpn) {
        setSoftLockHover({
          holderUpn,
          x: e.clientX,
          y: e.clientY,
        });
        // Auto-dismiss after 3 seconds
        setTimeout(() => setSoftLockHover(null), 3000);
      }
    },
    [cellPresence],
  );

  // Guard: check soft-lock before starting edit, show tooltip if locked
  const tryStartEditWithSoftLockCheck = useCallback(
    (e: React.MouseEvent, rowIndex: number, nodeId: string, field: EditableField, value: string | number | null) => {
      e.stopPropagation();
      // Check if cell is soft-locked by a peer
      if (cellPresence.isCellSoftLocked(nodeId, field)) {
        handleSoftLockHover(e, nodeId, field);
        return;
      }
      startEditWithFocus(rowIndex, nodeId, field, value);
    },
    [cellPresence, startEditWithFocus, handleSoftLockHover],
  );

  // Hover inspector state — tracks which cell is being hovered
  const [hoverTarget, setHoverTarget] = useState<{
    nodeId: string;
    elementRef: React.MutableRefObject<HTMLDivElement | null>;
  } | null>(null);

  const hoverInspector = useHoverInspector({
    targetData: {
      entityType: 'TASK',
      entityId: hoverTarget?.nodeId ?? '',
    },
    enterDelayMs: 5000,
    exitDelayMs: 2000,
  });

  // Callbacks for quick actions inside the hover modal
  const handleJumpToGantt = useCallback((entityId: string) => {
    selectNode(entityId);
  }, [selectNode]);

  const handleOpenDetails = useCallback((entityType: string, entityId: string) => {
    if (entityType === 'TASK') {
      selectNode(entityId);
    }
  }, [selectNode]);

  // Hover anchor management — switch which cell is the active hover target
  const handleHoverEnter = useCallback((nodeId: string, ref: React.MutableRefObject<HTMLDivElement | null>) => {
    setHoverTarget({ nodeId, elementRef: ref });
  }, []);

  const handleHoverLeave = useCallback(() => {
    setHoverTarget(null);
  }, []);

  // Wire the anchor ref to the hook so it can compute positioning
  useEffect(() => {
    if (hoverTarget && hoverInspector.handlers.onRef) {
      hoverInspector.handlers.onRef(hoverTarget.elementRef.current);
    }
  }, [hoverTarget, hoverInspector.handlers.onRef]);

  // Read row height from display store & CSS variable so both WbsTable and GanttViewport stay in sync
  const displayRowHeight = useDisplayStore((s) => s.settings.rowHeightPx);
  const displayDensity = useDisplayStore((s) => s.settings.density);
  const rowHeight = useMemo(() => {
    if (displayRowHeight && displayRowHeight > 0) return displayRowHeight;
    const el = document.documentElement;
    const computed = getComputedStyle(el).getPropertyValue('--row-height').trim();
    return parseInt(computed, 10) || 36;
  }, [displayRowHeight, displayDensity]);

  // Load tree on mount or rootNodeId change
  useEffect(() => {
    loadTree(rootNodeId || 'default');
  }, [rootNodeId, loadTree]);

  // Measure scroll container height on resize
  useEffect(() => {
    const target = scrollRef.current || containerRef.current;
    if (!target) return;

    const measure = () => {
      const el = scrollRef.current || containerRef.current;
      if (el) {
        setContainerHeight(el.clientHeight || 600);
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  // -----------------------------------------------------------------------
  // Column Definitions
  // -----------------------------------------------------------------------

  const columns = useMemo<ColumnDef<WBSRow>[]>(
    () => [
      // Column 1: Code & Hierarchy (with hover inspector)
      {
        accessorKey: 'code',
        header: 'Code & Hierarchy',
        size: 160,
        cell: ({ row: reactRow }) => {
          const node = reactRow.original;
          const hasChildren =
            node.childrenLoaded
              ? true // If loaded, we know — even if 0 children, no chevron needed
              : true; // Assume may have children until loaded

          return (
            <HoverCell
              nodeId={node.id}
              onHoverEnter={handleHoverEnter}
              onHoverLeave={handleHoverLeave}
            >
              <div className="flex items-center gap-1 min-w-0">
                <ChevronToggle
                  expanded={node.expanded}
                  hasChildren={hasChildren}
                  onClick={() => toggleExpand(node.id)}
                  indentLevel={node.indentLevel}
                />
                <span className="font-mono text-sm text-text-ops-primary truncate" title={node.code}>
                  {node.is_masked ? (
                    <span className="italic text-text-ops-muted">[RESTRICTED]</span>
                  ) : (
                    node.code
                  )}
                </span>
              </div>
            </HoverCell>
          );
        },
      },

      // Column 2: Name & Title (with hover inspector)
      {
        accessorKey: 'name',
        header: 'Name & Title',
        size: 300,
        cell: ({ row: reactRow }) => {
          const node = reactRow.original;

          return (
            <HoverCell
              nodeId={node.id}
              onHoverEnter={handleHoverEnter}
              onHoverLeave={handleHoverLeave}
            >
              {node.is_masked ? (
                <div className="flex items-center gap-2 min-w-0">
                  <Lock size={12} className="text-cls-secret flex-shrink-0" />
                  <span className="italic text-text-ops-muted truncate" title="Access restricted by classification">
                    [RESTRICTED]
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate" title={node.name}>
                    {node.name}
                  </span>
                  <ExportControlBadge
                    regime={node.export_control_regime}
                    taaReference={node.taa_mla_reference}
                  />
                </div>
              )}
            </HoverCell>
          );
        },
      },

      // Column 2b: Scheduling Mode (Auto vs Manual)
      {
        accessorKey: 'scheduling_mode',
        header: 'Mode',
        size: 85,
        cell: ({ row: reactRow }) => {
          const node = reactRow.original;
          const nodeLocked = isNodeLocked(node.path || '');
          const mode = node.scheduling_mode || (node.custom_attributes?.scheduling_mode as string) || 'AUTO';
          return (
            <div className="flex items-center">
              <SchedulingModeBadge
                mode={mode}
                onToggle={() => toggleSchedulingMode(node.id)}
                disabled={nodeLocked}
              />
            </div>
          );
        },
      },

      // Column 3: Delivery Mode & Backlog Badge
      {
        accessorKey: 'delivery_mode',
        header: 'Delivery Mode',
        size: 130,
        cell: ({ row: reactRow }) => {
          const node = reactRow.original;
          const mode = node.delivery_mode;
          const backlogName = node.custom_attributes?.backlog_name as string | undefined;
          return (
            <DeliveryModeBadge
              mode={mode}
              backlogName={backlogName}
              onOpenKanban={() => {
                selectNode(node.id);
                window.dispatchEvent(
                  new CustomEvent('workbench:open-tab', {
                    detail: { tab: 'KANBAN', nodeId: node.id },
                  }),
                );
              }}
            />
          );
        },
      },

      // Column 4: Start Date (editable, T0-aware)
      {
        accessorKey: 'planned_start_date',
        header: 'Start',
        size: 120,
        cell: ({ row: reactRow }) => {
          const node = reactRow.original;
          const date = node.planned_start_date as string | null;
          const globalIndex = reactRow.index;
          const nodeLocked = isNodeLocked(node.path || '');

          // T0-aware date config
          const dateConfig: DateFormatConfig = {
            isRelativeMode,
            atpAnchorDate,
            relativeStartOffset: (node as any).relative_start_day_offset ?? null,
            relativeFinishOffset: (node as any).relative_finish_day_offset ?? null,
          };

          return (
            <WbsCellRenderer
              nodeId={node.id}
              field="planned_start_date"
              value={date}
              renderContent={(v) => formatDateForDisplay(v as string | null, dateConfig)}
              nodeLocked={nodeLocked}
              rowHeight={rowHeight}
              globalIndex={globalIndex}
              activeCell={editHook.activeCell}
              onChange={editHook.updateValue}
              onKeyDown={handleEditKeyDown}
              onBlur={commitEditWithBlur}
              inputRef={editHook.inputRef}
              getCellFocus={getCellFocus}
              isCellSoftLocked={cellPresence.isCellSoftLocked}
              getSoftLockHolder={cellPresence.getSoftLockHolder}
              tryStartEdit={tryStartEditWithSoftLockCheck}
            />
          );
        },
      },

      // Column 5: Finish Date (editable, T0-aware)
      {
        accessorKey: 'planned_end_date',
        header: 'Finish',
        size: 120,
        cell: ({ row: reactRow }) => {
          const node = reactRow.original;
          const date = node.planned_end_date as string | null;
          const globalIndex = reactRow.index;
          const nodeLocked = isNodeLocked(node.path || '');

          // T0-aware date config
          const dateConfig: DateFormatConfig = {
            isRelativeMode,
            atpAnchorDate,
            relativeStartOffset: (node as any).relative_start_day_offset ?? null,
            relativeFinishOffset: (node as any).relative_finish_day_offset ?? null,
          };

          return (
            <WbsCellRenderer
              nodeId={node.id}
              field="planned_end_date"
              value={date}
              renderContent={(v) => formatFinishDateForDisplay(v as string | null, dateConfig)}
              nodeLocked={nodeLocked}
              rowHeight={rowHeight}
              globalIndex={globalIndex}
              activeCell={editHook.activeCell}
              onChange={editHook.updateValue}
              onKeyDown={handleEditKeyDown}
              onBlur={commitEditWithBlur}
              inputRef={editHook.inputRef}
              getCellFocus={getCellFocus}
              isCellSoftLocked={cellPresence.isCellSoftLocked}
              getSoftLockHolder={cellPresence.getSoftLockHolder}
              tryStartEdit={tryStartEditWithSoftLockCheck}
            />
          );
        },
      },

      // Column 5a: Duration (editable text, e.g. "3d", "2w", "8h", "1m")
      {
        id: 'duration',
        header: 'Duration',
        size: 100,
        cell: ({ row: reactRow }) => {
          const node = reactRow.original;
          const globalIndex = reactRow.index;
          const nodeLocked = isNodeLocked(node.path || '');
          // Prefer first-class duration_days; fall back to computed dates only when null
          const days = node.duration_days ?? (
            node.planned_start_date && node.planned_end_date
              ? calculateWorkdayDuration(node.planned_start_date, node.planned_end_date)
              : null
          );
          const text = days != null ? formatDaysToDuration(days) : '';

          return (
            <WbsCellRenderer
              nodeId={node.id}
              field="duration"
              value={text}
              renderContent={(v) => (
                <span className="font-mono text-sm truncate" title={v ? String(v) : undefined}>
                  {v || '—'}
                </span>
              )}
              nodeLocked={nodeLocked}
              rowHeight={rowHeight}
              globalIndex={globalIndex}
              activeCell={editHook.activeCell}
              onChange={editHook.updateValue}
              onKeyDown={handleEditKeyDown}
              onBlur={commitEditWithBlur}
              inputRef={editHook.inputRef}
              getCellFocus={getCellFocus}
              isCellSoftLocked={cellPresence.isCellSoftLocked}
              getSoftLockHolder={cellPresence.getSoftLockHolder}
              tryStartEdit={tryStartEditWithSoftLockCheck}
            />
          );
        },
      },

      // Column 5b: Predecessors (double-click opens dependency modal)
      {
        id: 'predecessors',
        header: 'Predecessors',
        size: 160,
        cell: ({ row: reactRow }) => {
          const node = reactRow.original;
          const nodeLocked = isNodeLocked(node.path || '');
          const text = formatDependencyList(node.id, dependencies, idToCode, 'predecessors');

          return (
            <span
              className="font-mono text-sm text-text-ops-muted cursor-pointer hover:text-text-ops-primary"
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (nodeLocked) return;
                setDependencyModalNode(node.id);
              }}
              title="Double-click to edit dependencies"
              style={{
                willChange: 'transform',
                transform: 'translateZ(0)',
              }}
            >
              <span className="truncate" title={text || undefined}>
                {text || '—'}
              </span>
            </span>
          );
        },
      },

      // Column 5c: Successors (double-click opens dependency modal)
      {
        id: 'successors',
        header: 'Successors',
        size: 160,
        cell: ({ row: reactRow }) => {
          const node = reactRow.original;
          const nodeLocked = isNodeLocked(node.path || '');
          const text = formatDependencyList(node.id, dependencies, idToCode, 'successors');

          return (
            <span
              className="font-mono text-sm text-text-ops-muted cursor-pointer hover:text-text-ops-primary"
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (nodeLocked) return;
                setDependencyModalNode(node.id);
              }}
              title="Double-click to edit dependencies"
              style={{
                willChange: 'transform',
                transform: 'translateZ(0)',
              }}
            >
              <span className="truncate" title={text || undefined}>
                {text || '—'}
              </span>
            </span>
          );
        },
      },

      // Column 5c-2: Resources (editable text with autocomplete, e.g. "JSmith, R-102")
      {
        id: 'resources',
        header: 'Resources',
        size: 180,
        cell: ({ row: reactRow }) => {
          const node = reactRow.original;
          const globalIndex = reactRow.index;
          const nodeLocked = isNodeLocked(node.path || '');
          const assignedList = resourceAssignments.filter((a) => a.portfolio_node_id === node.id);
          const text = assignedList
            .map((a) => a.resource_code || a.resource_name || a.resource_node_id)
            .join(', ');

          return (
            <div className="flex items-center justify-between w-full group">
              <div className="flex-1 min-w-0">
                <WbsCellRenderer
                  nodeId={node.id}
                  field="resources"
                  value={text}
                  renderContent={(v) => (
                    <span className="truncate block" title={v ? String(v) : undefined}>
                      {v || '—'}
                    </span>
                  )}
                  nodeLocked={nodeLocked}
                  rowHeight={rowHeight}
                  globalIndex={globalIndex}
                  activeCell={editHook.activeCell}
                  onChange={editHook.updateValue}
                  onKeyDown={handleEditKeyDown}
                  onBlur={commitEditWithBlur}
                  inputRef={editHook.inputRef}
                  getCellFocus={getCellFocus}
                  isCellSoftLocked={cellPresence.isCellSoftLocked}
                  getSoftLockHolder={cellPresence.getSoftLockHolder}
                  tryStartEdit={tryStartEditWithSoftLockCheck}
                  inputListOptions={resourceOptions.map((r) => r.code).filter(Boolean)}
                />
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setResourcePickerState({
                    position: { x: rect.left, y: rect.bottom + 4 },
                    nodeId: node.id,
                    taskLabel: node.name ? `${node.code || ''} ${node.name}`.trim() : node.code || node.id,
                  });
                }}
                className="opacity-0 group-hover:opacity-100 p-1 text-text-ops-muted hover:text-blue-400 hover:bg-bg-ops-overlay rounded transition-opacity flex-shrink-0 ml-1"
                title="Select resources from checklist"
                aria-label="Select resources"
              >
                <Users size={12} />
              </button>
            </div>
          );
        },
      },

      // Column 6: Total Float
      {
        accessorKey: 'total_float',
        header: 'Total Float',
        size: 100,
        cell: ({ getValue }) => {
          const tf = getValue() as number | null;

          if (tf === null || tf === undefined) {
            return <span className="font-mono text-sm text-text-ops-muted">—</span>;
          }

          const isCritical = tf <= 0;

          return (
            <span
              className={`font-mono text-sm ${
                isCritical ? 'text-rag-red font-bold' : 'text-text-ops-primary'
              }`}
            >
              {tf}d
            </span>
          );
        },
      },

      // Column 7: Progress (editable, lock-aware)
      {
        accessorKey: 'percent_complete',
        header: 'Progress',
        size: 150,
        cell: ({ row: reactRow }) => {
          const node = reactRow.original;
          const percent = node.percent_complete as number;
          const globalIndex = reactRow.index;
          const nodeLocked = isNodeLocked(node.path || '');

          return (
            <WbsCellRenderer
              nodeId={node.id}
              field="percent_complete"
              value={percent}
              renderContent={(v) => <ProgressBar percent={v as number} />}
              nodeLocked={nodeLocked}
              rowHeight={rowHeight}
              globalIndex={globalIndex}
              activeCell={editHook.activeCell}
              onChange={editHook.updateValue}
              onKeyDown={handleEditKeyDown}
              onBlur={commitEditWithBlur}
              inputRef={editHook.inputRef}
              getCellFocus={getCellFocus}
              isCellSoftLocked={cellPresence.isCellSoftLocked}
              getSoftLockHolder={cellPresence.getSoftLockHolder}
              tryStartEdit={tryStartEditWithSoftLockCheck}
            />
          );
        },
      },

      // Column 8: Blocker Glyphs
      {
        accessorKey: 'blockers',
        header: 'Blockers',
        size: 80,
        cell: ({ getValue }) => {
          const blockers = getValue() as typeof rows[number]['blockers'];

          if (!blockers || blockers.length === 0) {
            return <span className="text-text-ops-muted text-xs">—</span>;
          }

          return (
            <div className="flex items-center gap-1">
              {blockers.slice(0, 3).map((blocker) => (
                <Tooltip
                  key={blocker.id}
                  content={`${blocker.category} (${blocker.severity}) — ${blocker.impacted_hours}h impacted`}
                >
                  <span className={blockerSeverityColors[blocker.severity]}>
                    {blockerGlyphs[blocker.category]}
                  </span>
                </Tooltip>
              ))}
              {blockers.length > 3 && (
                <span className="text-xs text-text-ops-muted">+{blockers.length - 3}</span>
              )}
            </div>
          );
        },
      },

      // Column 9: Presence Avatars (colleagues inspecting this node)
      {
        id: 'presence',
        header: 'Presence',
        size: 80,
        cell: ({ row }) => {
          return <PresenceAvatars nodeId={row.original.id} size={20} />;
        },
      },

      // Column 10: Effort Comparison (Baseline vs Agile actual)
      {
        id: 'effortComparison',
        header: 'Effort',
        size: 200,
        cell: ({ row }) => {
          const node = row.original;
          if (node.baseline_effort_days != null || node.agile_actual_effort_days != null) {
            return (
              <EffortComparison
                baselineEffort={node.baseline_effort_days}
                agileActualEffort={node.agile_actual_effort_days}
              />
            );
          }
          return <span className="text-xs text-text-ops-muted">—</span>;
        },
      },
    ],
    [
      toggleExpand,
      handleHoverEnter,
      handleHoverLeave,
      isNodeLocked,
      getCellFocus,
      cellPresence,
      tryStartEditWithSoftLockCheck,
      editHook,
      handleEditKeyDown,
      commitEditWithBlur,
      rowHeight,
      isRelativeMode,
      atpAnchorDate,
      dependencies,
      idToCode,
    ],
  );

  // -----------------------------------------------------------------------
  // Table Instance
  // -----------------------------------------------------------------------

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      columnVisibility,
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    manualSorting: true,
    // Disable virtualization in tanstack-table itself; we handle it manually
    // for better control over row height from CSS variables.
  });

  // -----------------------------------------------------------------------
  // Virtualized Row Rendering
  // -----------------------------------------------------------------------

  const headerHeight = rowHeight; // Header row matches data row height
  const totalHeight = rows.length * rowHeight + headerHeight;
  const totalTableWidth = useMemo(
    () => 24 + table.getTotalSize(),
    [table],
  );

  // Track scroll position for virtualization
  const [scrollTop, setScrollTop] = React.useState(0);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Calculate visible rows
  const visibleRows = useMemo(() => {
    const startIdx = Math.floor(scrollTop / rowHeight);
    const visibleCount = Math.ceil(containerHeight / rowHeight);
    // Add buffer rows above and below for smooth scrolling
    const buffer = 10;
    const virtualStart = Math.max(0, startIdx - buffer);
    const virtualEnd = Math.min(rows.length, startIdx + visibleCount + buffer);

    return {
      start: virtualStart,
      end: virtualEnd,
      items: rows.slice(virtualStart, virtualEnd),
    };
  }, [scrollTop, rowHeight, containerHeight, rows]);

  // Sync selection highlight
  useEffect(() => {
    if (selectedNodeId && scrollRef.current) {
      // Optionally scroll selected row into view
      const index = rows.findIndex((r) => r.id === selectedNodeId);
      if (index >= 0) {
        const rowTop = index * rowHeight;
        const rowBottom = (index + 1) * rowHeight;
        const viewTop = scrollTop;
        const viewBottom = scrollTop + containerHeight;

        if (rowTop < viewTop || rowBottom > viewBottom) {
          scrollRef.current.scrollTop = rowTop - containerHeight / 3;
        }
      }
    }
  }, [selectedNodeId, rows, rowHeight, containerHeight, scrollTop]);

  // Keyboard listener for inline task creation shortcuts (Insert for sibling, Ctrl+Enter for child)
  const handleContainerKeyDown = useCallback(
    async (e: React.KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.key === 'Insert' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        const refId = selectedNodeId || (rows.length > 0 ? rows[rows.length - 1].id : null);
        if (refId) {
          const created = await insertSiblingTask(refId, 'FOLLOW_ON');
          if (created) {
            const currentRows = useScheduleStore.getState().rows;
            const idx = currentRows.findIndex((r) => r.id === created.id);
            editHook.startEdit(idx >= 0 ? idx : 0, created.id, 'name' as any, created.name);
          }
        }
      } else if (e.key === 'Enter' && (e.ctrlKey || (e as any).metaKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        const refId = selectedNodeId || (rows.length > 0 ? rows[0].id : null);
        if (refId) {
          const created = await insertChildTask(refId);
          if (created) {
            const currentRows = useScheduleStore.getState().rows;
            const idx = currentRows.findIndex((r) => r.id === created.id);
            editHook.startEdit(idx >= 0 ? idx : 0, created.id, 'name' as any, created.name);
          }
        }
      }
    },
    [selectedNodeId, rows, insertSiblingTask, insertChildTask, editHook],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleContainerKeyDown}
      className={`relative flex flex-col overflow-hidden focus:outline-none ${className}`}
    >
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-ops-base/80">
          <Loader2 size={24} className="text-text-ops-muted animate-spin" />
        </div>
      )}

      {/* Table container */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-auto"
        onScroll={handleScroll}
      >
        {/* Total height spacer for virtualization */}
        <div style={{ height: totalHeight, minWidth: totalTableWidth, position: 'relative' }}>
          {/* Header — fixed at top */}
          <div
            className="sticky top-0 z-10 flex border-b border-border-ops-subtle bg-bg-ops-surface box-border"
            style={{ height: headerHeight, minWidth: totalTableWidth }}
            onContextMenu={(e) => {
              e.preventDefault();
              setColumnMenuPos({ x: e.clientX, y: e.clientY });
            }}
          >
            <div className="flex items-center justify-center w-6 flex-shrink-0 text-xs font-mono text-text-ops-muted border-r border-border-ops-subtle/40">
              #
            </div>
            {table.getHeaderGroups()[0].headers.map((header) => (
              <div
                key={header.id}
                className="flex items-center px-3 text-xs font-semibold text-text-ops-muted uppercase tracking-wider truncate"
                style={{ width: header.getSize(), minWidth: header.getSize() }}
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
              </div>
            ))}
          </div>

          {columnMenuPos && (
            <ColumnVisibilityMenu
              position={columnMenuPos}
              columns={table.getAllLeafColumns().map((col) => ({
                id: col.id,
                label:
                  typeof col.columnDef.header === 'string'
                    ? col.columnDef.header
                    : col.id,
                visible: col.getIsVisible(),
              }))}
              onToggle={toggleColumnVisibility}
              onClose={() => setColumnMenuPos(null)}
            />
          )}

          {resourcePickerState && (
            <ResourcePickerPopup
              position={resourcePickerState.position}
              resources={resourceOptions}
              assignedIds={resourceAssignments
                .filter((a) => a.portfolio_node_id === resourcePickerState.nodeId)
                .map((a) => a.resource_node_id)}
              taskLabel={resourcePickerState.taskLabel}
              onToggle={handleToggleResourceAssignment}
              onClose={() => setResourcePickerState(null)}
            />
          )}

          {/* Virtualized rows */}
          {visibleRows.items.map((row, i) => {
            const globalIndex = visibleRows.start + i;
            const isSelected = row.id === selectedNodeId;
            const isMasked = row.is_masked;
            const isDimmed = isDimMode && !matchingNodeIds.has(row.id);
            const isMatch = isDimMode && matchingNodeIds.has(row.id);
            const isMultiSelected = selectedNodeIds.has(row.id);

            // Check-out lease state
            const nodeLocked = isNodeLocked(row.path || '');
            const leaseHolder = getLeaseHolder(row.path || '');

            // Handle row click for multi-row selection
            const handleRowClick = (e: React.MouseEvent) => {
              // Don't trigger selection if clicking on an input or button
              if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'BUTTON') return;

              toggleRowSelection(row.id, globalIndex, e.shiftKey, e.ctrlKey || e.metaKey);
              selectNode(row.id);
            };

            return (
              <div
                key={row.id}
                className={`flex items-center border-b border-border-ops-subtle box-border cursor-pointer transition-colors ${
                  isDimmed
                    ? 'opacity-25'
                    : isMultiSelected
                    ? 'bg-blue-900/30 border-blue-700/50'
                    : isSelected
                    ? 'bg-bg-ops-overlay'
                    : isMasked
                    ? 'bg-bg-ops-base/50'
                    : 'hover:bg-bg-ops-surface'
                } ${isMatch ? 'border-l-2 border-l-blue-500' : ''} ${
                  nodeLocked ? 'bg-amber-900/5' : ''
                }`}
                style={{
                  height: rowHeight,
                  minWidth: totalTableWidth,
                  position: 'absolute',
                  top: headerHeight + globalIndex * rowHeight,
                  left: 0,
                  right: 0,
                  boxSizing: 'border-box',
                }}
                onClick={handleRowClick}
                onDoubleClick={(e) => {
                  // Prevent double-click from triggering selection twice
                  e.stopPropagation();
                }}
                onContextMenu={(e) => {
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
                    isCheckoutLocked: nodeLocked,
                    leaseHolderUpn: leaseHolder?.leased_by_user_upn || null,
                  });
                }}
              >
                {/* Row selection indicator with lock indicator */}
                <div
                  className={`flex items-center justify-center w-6 flex-shrink-0 gap-0.5 ${
                    isMultiSelected ? 'text-blue-400' : 'text-text-ops-muted'
                  }`}
                >
                  {isMultiSelected ? (
                    <div className="w-2 h-2 bg-blue-400 rounded-sm" />
                  ) : (
                    <span className="text-xs font-mono">{globalIndex + 1}</span>
                  )}
                  {nodeLocked && leaseHolder && (
                    <LockIndicator
                      leaseHolderUpn={leaseHolder.leased_by_user_upn}
                      expiresAt={leaseHolder.expires_at}
                    />
                  )}
                </div>

                {table.getRowModel().rows[globalIndex]?.getVisibleCells().map((cell) => (
                  <div
                    key={cell.id}
                    className="flex items-center px-3 min-w-0 overflow-hidden relative"
                    style={{
                      width: cell.column.getSize(),
                      minWidth: cell.column.getSize(),
                      fontSize: 'var(--cell-font-size)',
                      paddingBlock: 'var(--pad-y)',
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}

                    {/* Drag-to-fill handle on active cell */}
                    {editHook.activeCell?.nodeId === row.id && editHook.activeCell?.rowIndex === globalIndex && (
                      <div className="absolute bottom-0 right-0">
                        <DragFillHandle
                          cellRect={{
                            top: globalIndex * rowHeight,
                            left: 0,
                            width: cell.column.getSize(),
                            height: rowHeight,
                          }}
                          rows={rows}
                          columnId={editHook.activeCell.field}
                          value={editHook.activeCell.currentValue}
                          rowHeight={rowHeight}
                          activeRowIndex={globalIndex}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          {/* Empty state */}
          {rows.length === 0 && (
            <div className="flex items-center justify-center h-32 text-text-ops-muted text-sm">
              No WBS nodes to display
            </div>
          )}
        </div>
      </div>

      {/* Footer with row count and Sibling Relationship Mode Radio Selector */}
      <div className="flex items-center justify-between px-3 h-8 flex-shrink-0 border-t border-border-ops-subtle bg-bg-ops-surface text-xs text-text-ops-muted box-border overflow-x-auto gap-4">
        <div className="flex items-center gap-3">
          <span>
            {rows.length} {rows.length !== allRows.length ? `of ${allRows.length} nodes (filtered)` : 'nodes'}
          </span>
          <span className="text-border-ops-subtle">|</span>
          {/* Sibling Insertion Mode Radio Selector */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text-ops-primary text-[11px]">New Sibling:</span>
            <label className="flex items-center gap-1 cursor-pointer text-[11px] hover:text-text-ops-primary">
              <input
                type="radio"
                name="sibling-mode"
                value="FOLLOW_ON"
                checked={siblingRelationshipMode === 'FOLLOW_ON'}
                onChange={() => setSiblingRelationshipMode('FOLLOW_ON')}
                className="w-3 h-3 text-blue-500 focus:ring-blue-500"
              />
              <span>Follow-On (FS)</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer text-[11px] hover:text-text-ops-primary">
              <input
                type="radio"
                name="sibling-mode"
                value="PARALLEL"
                checked={siblingRelationshipMode === 'PARALLEL'}
                onChange={() => setSiblingRelationshipMode('PARALLEL')}
                className="w-3 h-3 text-blue-500 focus:ring-blue-500"
              />
              <span>Parallel</span>
            </label>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="hidden sm:inline text-text-ops-muted">
            <kbd className="px-1 py-0.5 bg-bg-ops-overlay border border-border-ops-subtle rounded text-[10px] font-mono text-text-ops-primary">Insert</kbd> Sibling &bull;{' '}
            <kbd className="px-1 py-0.5 bg-bg-ops-overlay border border-border-ops-subtle rounded text-[10px] font-mono text-text-ops-primary">Ctrl+Enter</kbd> Child
          </span>
          <span className="text-border-ops-subtle">|</span>
          <span>{rowHeight}px</span>
        </div>
      </div>

      {/* Hover Summary Modal — rendered when dwell timer triggers */}
      {hoverInspector.state.isOpen && hoverTarget && (
        <HoverSummaryModal
          targetData={{ entityType: 'TASK', entityId: hoverTarget.nodeId }}
          position={hoverInspector.state.position}
          placement={hoverInspector.state.placement}
          isExiting={hoverInspector.state.isExiting}
          onClose={hoverInspector.close}
          onMouseEnter={hoverInspector.modalCallbacks.onMouseEnter}
          onMouseLeave={hoverInspector.modalCallbacks.onMouseLeave}
          onJumpToGantt={handleJumpToGantt}
          onOpenDetails={handleOpenDetails}
          floatingStyles={hoverInspector.floatingStyles}
          floatingRef={hoverInspector.refs?.setFloating}
        />
      )}

      {/* Bulk Operations HUD — shown when multiple rows are selected */}
      {selectedNodeIds.size > 1 && (
        <BulkOperationsHUD
          selectedCount={selectedNodeIds.size}
          onClose={clearRowSelection}
        />
      )}

      {/* Soft-lock warning toast (server-initiated) */}
      {softLockToast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            backgroundColor: '#1E293B',
            border: '1px solid #FBBF24',
            borderRadius: '8px',
            padding: '12px 16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            color: '#F1F5F9',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <Lock size={16} style={{ color: '#FBBF24', flexShrink: 0 }} />
          <span>
            Cell actively edited by{' '}
            <strong>{softLockToast.holderUpn.split('@')[0]}</strong>
          </span>
        </div>
      )}

      {/* Ephemeral hover tooltip for soft-locked cells */}
      {softLockHover && (
        <div
          style={{
            position: 'fixed',
            left: `${softLockHover.x + 12}px`,
            top: `${softLockHover.y - 8}px`,
            zIndex: 10000,
            backgroundColor: '#1E293B',
            border: '1px solid #FBBF24',
            borderRadius: '6px',
            padding: '6px 10px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            fontSize: '12px',
            color: '#F1F5F9',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            opacity: softLockHover ? 1 : 0,
            transition: 'opacity 0.15s ease-out',
            transform: 'translateY(-100%)',
          }}
        >
          <div className="flex items-center gap-1.5">
            <Lock size={12} style={{ color: '#FBBF24', flexShrink: 0 }} />
            <span>
              Cell actively being edited by{' '}
              <strong>{softLockHover.holderUpn.split('@')[0]}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Dependency Modal — opened by double-clicking predecessors/successors */}
      {dependencyModalNode && (
        <DependencyModal
          nodeId={dependencyModalNode}
          dependencies={dependencies}
          allRows={allRows}
          onClose={() => {
            setDependencyModalNode(null);
            loadTree(rootNodeId || 'default');
          }}
        />
      )}

      {/* End Date Edit Choice Modal */}
      {showEndEditChoice && endEditInfo && (
        <EndEditChoiceModal
          oldEndDate={endEditInfo.oldEndDate}
          newEndDate={endEditInfo.newEndDate}
          startDate={endEditInfo.startDate}
          onAdjustDuration={() => {
            const { nodeId, newEndDate, startDate } = endEditInfo;
            const newDuration = computeDurationFromDates(startDate, newEndDate);
            updateNode(nodeId, {
              planned_end_date: newEndDate,
              duration_days: Math.max(1, newDuration),
            } as any);
            setShowEndEditChoice(false);
            setEndEditInfo(null);
          }}
          onAddLag={() => {
            const { nodeId, oldEndDate, newEndDate, startDate } = endEditInfo;
            const node = allRows.find((r) => r.id === nodeId);
            const oldDuration = computeDurationFromDates(startDate, oldEndDate);
            const newDuration = computeDurationFromDates(startDate, newEndDate);
            const lagDiff = newDuration - oldDuration;
            const currentLag = (node?.lag_days as number) ?? 0;
            updateNode(nodeId, {
              planned_end_date: newEndDate,
              lag_days: Math.max(0, currentLag + lagDiff),
            } as any);
            setShowEndEditChoice(false);
            setEndEditInfo(null);
          }}
          onCancel={() => {
            setShowEndEditChoice(false);
            setEndEditInfo(null);
          }}
        />
      )}
    </div>
  );
};

export default WbsTable;
