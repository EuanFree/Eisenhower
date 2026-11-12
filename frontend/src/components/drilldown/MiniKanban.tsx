/**
 * Task Mini-Kanban / Sprint Board Component
 *
 * Full-featured Sprint Kanban board for AGILE and HYBRID delivery mode tasks.
 * Supports:
 * - Dynamic Backlog Selector & New Backlog Creator
 * - Interactive Story Card Creation (+ Add Story)
 * - Four Standard Sprint Columns: Backlog → In Progress → Testing → Done
 * - HTML5 Drag & Drop and quick-advance arrows between sprint columns
 * - Priority badges (0-1000), assignee tags, and blocker indicators
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flag,
  Lock,
  Plus,
  Kanban,
  ChevronLeft,
  ChevronRight,
  FolderGit2,
  Check,
  Maximize2,
  Minimize2,
  User,
  Users,
  TrendingUp,
  Calendar,
} from 'lucide-react';
import { clsx } from 'clsx';
import { WBSRow } from '../../types/wbs';
import { useScheduleStore } from '../../stores/useScheduleStore';
import { addWorkdays } from '../../utils/scheduleCalculator';
import SprintCardDetail from './SprintCardDetail';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KanbanStatus = 'BACKLOG' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED';

interface KanbanCard {
  row: WBSRow;
  status: KanbanStatus;
}

interface KanbanColumn {
  status: KanbanStatus;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  dropProgress: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLUMNS: KanbanColumn[] = [
  {
    status: 'BACKLOG',
    label: 'Backlog',
    icon: <Flag size={14} />,
    color: 'text-text-ops-muted',
    bgColor: 'bg-bg-ops-overlay/60',
    dropProgress: 0,
  },
  {
    status: 'IN_PROGRESS',
    label: 'In Progress',
    icon: <Clock size={14} />,
    color: 'text-sky-400',
    bgColor: 'bg-sky-950/20',
    dropProgress: 50,
  },
  {
    status: 'BLOCKED',
    label: 'Blocked',
    icon: <AlertTriangle size={14} />,
    color: 'text-rose-400',
    bgColor: 'bg-rose-950/25',
    dropProgress: 0,
  },
  {
    status: 'COMPLETED',
    label: 'Completed',
    icon: <CheckCircle2 size={14} />,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-950/20',
    dropProgress: 100,
  },
];

/**
 * Compute the next auto-priority for a new backlog item.
 * Returns the highest multiple of 10 below the current maximum priority.
 * Range: 0-1000, 1000 being highest priority.
 * If no items exist, starts at 1000. Each new item steps down by 10.
 */
function computeNextPriority(childRows: WBSRow[]): number {
  let maxPriority = 1000;
  for (const r of childRows) {
    const p = (r.custom_attributes?.priority as number) ?? 0;
    if (p > maxPriority) maxPriority = p;
  }
  // Find the highest multiple of 10 that is less than the current max
  let next = Math.floor(maxPriority / 10) * 10;
  // Ensure uniqueness: step down until we find an unused value
  const usedPriorities = new Set(childRows.map((r) => (r.custom_attributes?.priority as number) ?? 0));
  while (usedPriorities.has(next) && next >= 0) {
    next -= 10;
  }
  return Math.max(0, next);
}

function statusFromRow(row: WBSRow): KanbanStatus {
  const explicit = row.custom_attributes?.kanban_status as KanbanStatus | undefined;
  if (explicit === 'BLOCKED' || row.custom_attributes?.is_blocked === true) return 'BLOCKED';
  if (explicit === 'COMPLETED') return 'COMPLETED';
  if (explicit === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (explicit === 'BACKLOG') return 'BACKLOG';

  const progress = row.percent_complete ?? 0;
  if (progress >= 100) return 'COMPLETED';
  if (progress > 0) return 'IN_PROGRESS';
  return 'BACKLOG';
}

function nextStatus(current: KanbanStatus): KanbanStatus | null {
  if (current === 'BACKLOG') return 'IN_PROGRESS';
  if (current === 'IN_PROGRESS') return 'COMPLETED';
  if (current === 'BLOCKED') return 'IN_PROGRESS';
  return null;
}

function prevStatus(current: KanbanStatus): KanbanStatus | null {
  if (current === 'COMPLETED') return 'IN_PROGRESS';
  if (current === 'IN_PROGRESS') return 'BACKLOG';
  if (current === 'BLOCKED') return 'BACKLOG';
  return null;
}

function progressForStatus(status: KanbanStatus, currentProgress?: number): number {
  if (status === 'COMPLETED') return 100;
  if (status === 'IN_PROGRESS') return currentProgress && currentProgress > 0 && currentProgress < 100 ? currentProgress : 50;
  if (status === 'BLOCKED') return currentProgress || 0;
  return 0;
}

// ---------------------------------------------------------------------------
// Sprint Summary Calculation
// ---------------------------------------------------------------------------

/**
 * Computes the accumulated state of all sprint child cards:
 * - Counts by status (backlog, in progress, blocked, completed)
 * - Overall progress percentage (weighted average)
 * - Total work days from all cards (based on planned dates)
 * - Remaining work days (excluding completed cards)
 */
interface SprintSummary {
  totalCount: number;
  backlogCount: number;
  inProgressCount: number;
  blockedCount: number;
  completedCount: number;
  overallProgress: number; // 0-100
  totalWorkDays: number; // sum of all card durations in calendar days
  remainingWorkDays: number; // work days for non-completed cards
  predictedDurationDays: number; // remainingWorkDays / resourceCount (calendar days)
  predictedEndDate: string; // ISO date string
}

function computeSprintSummary(
  childRows: WBSRow[],
  resourceCount: number,
): SprintSummary {
  const summary: SprintSummary = {
    totalCount: childRows.length,
    backlogCount: 0,
    inProgressCount: 0,
    blockedCount: 0,
    completedCount: 0,
    overallProgress: 0,
    totalWorkDays: 0,
    remainingWorkDays: 0,
    predictedDurationDays: 0,
    predictedEndDate: '',
  };

  if (childRows.length === 0) return summary;

  let totalProgress = 0;

  for (const row of childRows) {
    const status = statusFromRow(row);
    const progress = row.percent_complete ?? 0;

    // Count by status
    if (status === 'BACKLOG') summary.backlogCount++;
    else if (status === 'IN_PROGRESS') summary.inProgressCount++;
    else if (status === 'BLOCKED') summary.blockedCount++;
    else if (status === 'COMPLETED') summary.completedCount++;

    // Accumulate progress
    totalProgress += progress;

    // Calculate work days for this card
    let cardDays = 0;
    if (row.planned_start_date && row.planned_end_date) {
      const start = new Date(row.planned_start_date);
      const end = new Date(row.planned_end_date);
      const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      cardDays = Math.max(0, diff);
    }

    summary.totalWorkDays += cardDays;

    // Only count remaining work for non-completed cards
    if (status !== 'COMPLETED') {
      // Remaining work = cardDays * (1 - progress/100)
      const remainingFraction = Math.max(0, 1 - progress / 100);
      summary.remainingWorkDays += cardDays * remainingFraction;
    }
  }

  // Overall progress is weighted average
  summary.overallProgress = Math.round(totalProgress / childRows.length);

  // Predicted duration = remaining work days / number of resources
  // If no resources nominated, use 1 as default
  const effectiveResources = Math.max(1, resourceCount);
  summary.predictedDurationDays = Math.ceil(summary.remainingWorkDays / effectiveResources);

  // Predicted end date = today + predicted duration (workdays)
  const today = new Date().toISOString().split('T')[0];
  summary.predictedEndDate = addWorkdays(today, summary.predictedDurationDays);

  return summary;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MiniKanbanProps {
  /** The currently selected WBS row (parent task) */
  selectedRow: WBSRow | null;
  /** Child rows of the selected node */
  childRows?: WBSRow[];
  /** Callback when a card's status changes */
  onStatusChange?: (nodeId: string, newStatus: KanbanStatus) => void;
  /** Controlled full-screen state (if managed by parent container) */
  isFullScreen?: boolean;
  /** Callback to toggle full-screen mode */
  onToggleFullScreen?: () => void;
}

// ---------------------------------------------------------------------------
// Card Component
// ---------------------------------------------------------------------------

const KanbanCardComponent: React.FC<{
  card: KanbanCard;
  onDragStart: (e: React.DragEvent, nodeId: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onMove: (nodeId: string, targetStatus: KanbanStatus) => void;
  onDoubleClick: (card: KanbanCard) => void;
}> = ({ card, onDragStart, onDragEnd, onMove, onDoubleClick }) => {
  const { row, status } = card;
  const isMasked = row.is_masked === true;
  const isBlocked = status === 'BLOCKED' || (row.blockers && row.blockers.length > 0) || row.custom_attributes?.is_blocked === true;
  const isCritical = row.total_float !== null && row.total_float <= 0;
  const priority = (row.custom_attributes?.priority as number) ?? 0;
  const assignee = (row.custom_attributes?.assignee as string) || '';
  // Use first-class duration_days field, falling back to computed dates
  const durationDays = row.duration_days ?? (row.planned_start_date && row.planned_end_date
    ? Math.max(0, Math.round((new Date(row.planned_end_date).getTime() - new Date(row.planned_start_date).getTime()) / (1000 * 60 * 60 * 24)))
    : 0);

  const canMoveLeft = prevStatus(status) !== null;
  const canMoveRight = nextStatus(status) !== null;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, row.id)}
      onDragEnd={onDragEnd}
      onDoubleClick={() => onDoubleClick(card)}
      className={clsx(
        'group relative p-2.5 rounded-md border cursor-grab active:cursor-grabbing transition-all shadow-sm',
        isBlocked
          ? 'bg-rose-950/20 border-rose-600/70 hover:border-rose-500'
          : 'bg-bg-ops-surface border-border-ops-subtle hover:border-blue-500/60 hover:shadow-md',
        isCritical && !isBlocked && 'border-l-2 border-l-red-500',
      )}
      title={isMasked ? '[RESTRICTED]' : `${row.code}: ${row.name}`}
    >
      {/* Top Header: Code, Points & Quick Move Buttons */}
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="text-[11px] font-mono font-medium text-text-ops-muted">{row.code}</span>
        <div className="flex items-center gap-1">
          <span
            className={clsx(
              'px-1.5 py-0.2 rounded font-mono text-[10px] border',
              priority >= 800 ? 'bg-rose-950/80 border-rose-700/60 text-rose-300' :
              priority >= 500 ? 'bg-amber-950/80 border-amber-700/60 text-amber-300' :
              'bg-blue-950/80 border-blue-700/60 text-blue-300',
            )}
            title={`Priority: ${priority}/1000`}
          >
            P{priority}
          </span>
          {isBlocked && (
            <span className="px-1.5 py-0.2 rounded bg-rose-950 border border-rose-700 text-rose-300 font-mono text-[9px] font-bold flex items-center gap-0.5" title="Task is blocked by impediment">
              <AlertTriangle size={10} /> BLOCKED
            </span>
          )}
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
            {canMoveLeft && (
              <button
                type="button"
                onClick={() => onMove(row.id, prevStatus(status)!)}
                className="p-0.5 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary"
                title={`Move to ${prevStatus(status)}`}
              >
                <ChevronLeft size={12} />
              </button>
            )}
            {canMoveRight && (
              <button
                type="button"
                onClick={() => onMove(row.id, nextStatus(status)!)}
                className="p-0.5 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary"
                title={`Move to ${nextStatus(status)}`}
              >
                <ChevronRight size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Task Title */}
      {isMasked ? (
        <div className="flex items-center gap-1 text-xs italic text-text-ops-muted mb-1">
          <Lock size={10} />
          [RESTRICTED]
        </div>
      ) : (
        <div className="text-xs font-medium text-text-ops-primary truncate mb-1" title={row.name}>
          {row.name}
        </div>
      )}

      {/* Duration & Assignee */}
      {!isMasked && (
        <div className="flex items-center gap-2 text-[10px] text-text-ops-muted mb-1.5">
          {durationDays > 0 && (
            <span className="flex items-center gap-0.5" title={`${durationDays} working days`}>
              <Clock size={10} />
              {durationDays}{durationDays === 1 ? 'd' : 'd'}
            </span>
          )}
          {assignee && (
            <span className="flex items-center gap-0.5 truncate" title={`Assigned: ${assignee}`}>
              <User size={10} />
              <span className="truncate">{assignee}</span>
            </span>
          )}
        </div>
      )}

      {/* Progress Bar & Footer */}
      {!isMasked && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-bg-ops-overlay rounded-full overflow-hidden">
            <div
              className={clsx(
                'h-full rounded-full transition-all',
                status === 'COMPLETED'
                  ? 'bg-emerald-500'
                  : status === 'BLOCKED'
                  ? 'bg-rose-500'
                  : status === 'IN_PROGRESS'
                  ? 'bg-sky-500'
                  : 'bg-slate-600',
              )}
              style={{ width: `${row.percent_complete}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-text-ops-muted">{row.percent_complete}%</span>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Column Component
// ---------------------------------------------------------------------------

const KanbanColumnComponent: React.FC<{
  column: KanbanColumn;
  cards: KanbanCard[];
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, status: KanbanStatus) => void;
  onDragStart: (e: React.DragEvent, nodeId: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onMove: (nodeId: string, targetStatus: KanbanStatus) => void;
  onDoubleClick: (card: KanbanCard) => void;
  onQuickAdd?: () => void;
}> = ({ column, cards, onDragOver, onDrop, onDragStart, onDragEnd, onMove, onDoubleClick, onQuickAdd }) => {
  return (
    <div
      className={clsx('flex-1 flex flex-col min-w-0 border border-border-ops-subtle/50 rounded-lg overflow-hidden', column.bgColor)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(e);
      }}
      onDrop={(e) => onDrop(e, column.status)}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-ops-subtle/40 bg-bg-ops-surface/50">
        <div className="flex items-center gap-2 min-w-0">
          <span className={column.color}>{column.icon}</span>
          <span className="text-xs font-semibold text-text-ops-primary truncate">{column.label}</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-bg-ops-overlay text-text-ops-muted">
            {cards.length}
          </span>
        </div>
        {onQuickAdd && (
          <button
            type="button"
            onClick={onQuickAdd}
            className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary"
            title={`Add story to ${column.label}`}
          >
            <Plus size={12} />
          </button>
        )}
      </div>

      {/* Cards Area */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto">
        {cards.length === 0 ? (
          <div className="flex items-center justify-center h-24 border border-dashed border-border-ops-subtle/30 rounded-md text-[11px] text-text-ops-muted/50">
            Drop cards here
          </div>
        ) : (
          cards.map((card) => (
            <KanbanCardComponent
              key={card.row.id}
              card={card}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onMove={onMove}
              onDoubleClick={onDoubleClick}
            />
          ))
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const MiniKanban: React.FC<MiniKanbanProps> = ({
  selectedRow,
  childRows: propsChildRows,
  onStatusChange,
  isFullScreen: controlledFullScreen,
  onToggleFullScreen: controlledToggleFullScreen,
}) => {
  const allRows = useScheduleStore((s) => s.rows);
  const updateNode = useScheduleStore((s) => s.updateNode);
  const insertChildTask = useScheduleStore((s) => s.insertChildTask);
  const selectNode = useScheduleStore((s) => s.selectNode);

  const [localFullScreen, setLocalFullScreen] = useState(false);
  const isFullScreen = controlledFullScreen !== undefined ? controlledFullScreen : localFullScreen;
  const toggleFullScreen = controlledToggleFullScreen || (() => setLocalFullScreen((v) => !v));

  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemDuration, setNewItemDuration] = useState<number>(1);
  const [isAddingItem, setIsAddingItem] = useState(false);

  // Persist the sprint parent row across selection changes so that creating
  // a child task (which changes selectedNodeId) doesn't clear the board.
  const [sprintParentId, setSprintParentId] = useState<string | null>(null);
  const sprintParentRow = useMemo(() => {
    // If the prop changes to a different parent, update our remembered ID
    if (selectedRow && selectedRow.id !== sprintParentId) {
      setSprintParentId(selectedRow.id);
    }
    // Always return the remembered parent if we have one, falling back to the prop
    if (sprintParentId) {
      return allRows.find((r) => r.id === sprintParentId) || selectedRow;
    }
    return selectedRow;
  }, [selectedRow, sprintParentId, allRows]);

  // Sprint resources: comma-separated list of resource names stored in custom_attributes
  const sprintResources = useMemo(() => {
    const raw = (sprintParentRow?.custom_attributes?.sprint_resources as string) || '';
    return raw.split(',').map((r) => r.trim()).filter(Boolean);
  }, [sprintParentRow?.custom_attributes?.sprint_resources]);

  const [resourceInput, setResourceInput] = useState('');
  const [isAddingResource, setIsAddingResource] = useState(false);


  // Add a resource to the sprint
  const handleAddResource = useCallback(() => {
    if (!sprintParentRow || !resourceInput.trim()) return;
    const name = resourceInput.trim();
    const currentResources = sprintResources.filter((r) => r.toLowerCase() !== name.toLowerCase());
    const updated = [...currentResources, name];
    updateNode(sprintParentRow.id, {
      custom_attributes: {
        ...(sprintParentRow.custom_attributes || {}),
        sprint_resources: updated.join(', '),
      },
    });
    setResourceInput('');
    setIsAddingResource(false);
  }, [sprintParentRow, resourceInput, sprintResources, updateNode]);

  // Remove a resource from the sprint
  const handleRemoveResource = useCallback(
    (resourceName: string) => {
      if (!sprintParentRow) return;
      const updated = sprintResources.filter((r) => r !== resourceName);
      updateNode(sprintParentRow.id, {
        custom_attributes: {
          ...(sprintParentRow.custom_attributes || {}),
          sprint_resources: updated.join(', '),
        },
      });
    },
    [sprintParentRow, sprintResources, updateNode],
  );
  
  // Card detail overlay state
  const [detailCard, setDetailCard] = useState<KanbanCard | null>(null);

  // Backlog state
  const [isCreatingBacklog, setIsCreatingBacklog] = useState(false);
  const [customBacklogInput, setCustomBacklogInput] = useState('');

  // Discover all named backlogs across project rows
  const availableBacklogs = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) {
      const bName = r.custom_attributes?.backlog_name as string | undefined;
      if (bName && bName.trim()) set.add(bName.trim());
    }
    return Array.from(set);
  }, [allRows]);

  const currentBacklog = (sprintParentRow?.custom_attributes?.backlog_name as string) || 'Default Sprint Backlog';

  // Backlog selection handler
  const handleSelectBacklog = useCallback(
    (bName: string) => {
      if (!sprintParentRow) return;
      updateNode(sprintParentRow.id, {
        custom_attributes: {
          ...(sprintParentRow.custom_attributes || {}),
          backlog_name: bName,
        },
      });
    },
    [sprintParentRow, updateNode],
  );

  const handleCreateBacklog = useCallback(() => {
    if (!customBacklogInput.trim() || !sprintParentRow) return;
    const name = customBacklogInput.trim();
    updateNode(sprintParentRow.id, {
      custom_attributes: {
        ...(sprintParentRow.custom_attributes || {}),
        backlog_name: name,
      },
    });
    setCustomBacklogInput('');
    setIsCreatingBacklog(false);
  }, [customBacklogInput, sprintParentRow, updateNode]);

  // Compute children of sprint parent row (uses sprintParentRow, not selectedRow)
  const childRows = useMemo(() => {
    if (propsChildRows && propsChildRows.length > 0) return propsChildRows;
    if (!sprintParentRow) return [];
    return allRows.filter((r) => r.parent_id === sprintParentRow.id);
  }, [propsChildRows, sprintParentRow, allRows]);

  // Compute sprint summary (must be after childRows)
  const sprintSummary = useMemo(
    () => computeSprintSummary(childRows, sprintResources.length),
    [childRows, sprintResources.length],
  );

  // Map child rows to Kanban cards
  const cards = useMemo(() => {
    return childRows.map((r) => ({
      row: r,
      status: statusFromRow(r),
    }));
  }, [childRows]);

  // Group cards by column
  const cardsByColumn = useMemo(() => {
    const grouped: Record<KanbanStatus, KanbanCard[]> = {
      BACKLOG: [],
      IN_PROGRESS: [],
      BLOCKED: [],
      COMPLETED: [],
    };
    for (const c of cards) {
      if (grouped[c.status]) {
        grouped[c.status].push(c);
      } else {
        grouped.BACKLOG.push(c);
      }
    }
    return grouped;
  }, [cards]);

  // Status transition handler with optimistic update
  const handleMoveCard = useCallback(
    (nodeId: string, targetStatus: KanbanStatus) => {
      // Always read the latest rows from the store, not from a stale closure
      const currentRows = useScheduleStore.getState().rows;
      const node = currentRows.find((r) => r.id === nodeId);
      if (!node) {
        console.warn('handleMoveCard: node not found in store', nodeId);
        return;
      }
      const currentProgress = node?.percent_complete ?? 0;
      const progress = progressForStatus(targetStatus, currentProgress);
      const isBlocked = targetStatus === 'BLOCKED';

      const durationDays = (node?.duration_days as number) ?? 1;

      // Auto-set start date to today when moving to In Progress
      let plannedStartDate: string | undefined;
      let plannedEndDate: string | undefined;
      if (targetStatus === 'IN_PROGRESS' && !node.planned_start_date) {
        const today = new Date().toISOString().substring(0, 10);
        plannedStartDate = today;
        // Compute end date using workdays: start + duration + lag - 1
        const lag = (node.lag_days as number) ?? 0;
        const totalWorkdays = durationDays + lag;
        plannedEndDate = addWorkdays(today, Math.max(0, totalWorkdays - 1));
      }

      const newCustomAttrs = {
        ...(node?.custom_attributes || {}),
        kanban_status: targetStatus,
        is_blocked: isBlocked,
        ...(isBlocked ? { blocker_reason: 'Flagged on Kanban board' } : {}),
      };

      // Optimistic update: move the card immediately in the local store
      useScheduleStore.setState((state) => ({
        rows: state.rows.map((r) =>
          r.id === nodeId
            ? {
                ...r,
                percent_complete: progress,
                custom_attributes: newCustomAttrs,
                planned_start_date: plannedStartDate || r.planned_start_date,
                planned_end_date: plannedEndDate || r.planned_end_date,
              }
            : r,
        ),
      }));
      onStatusChange?.(nodeId, targetStatus);

      // Persist to server in background; on success the server response replaces the optimistic row
      const result = updateNode(nodeId, {
        percent_complete: progress,
        custom_attributes: newCustomAttrs,
        planned_start_date: plannedStartDate,
        planned_end_date: plannedEndDate,
      });
      // Log if the server update fails so we can debug
      if (result instanceof Promise) {
        result.then(res => {
          if (!res.success) {
            console.error('Failed to persist Kanban status change for node:', nodeId);
          }
        }).catch(err => {
          console.error('Error persisting Kanban status change:', nodeId, err);
        });
      }
    },
    [updateNode, onStatusChange],
  );

  // Drag and drop handlers
  const handleDragStart = useCallback((_e: React.DragEvent, nodeId: string) => {
    setDraggedNodeId(nodeId);
  }, []);

  const handleDragEnd = useCallback((_e: React.DragEvent) => {
    setDraggedNodeId(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (_e: React.DragEvent, status: KanbanStatus) => {
      if (!draggedNodeId) return;
      handleMoveCard(draggedNodeId, status);
      setDraggedNodeId(null);
    },
    [draggedNodeId, handleMoveCard],
  );

  // Create new backlog item handler
  const handleCreateItem = useCallback(async () => {
    if (!sprintParentRow || !newItemTitle.trim()) return;
    const parentId = sprintParentRow.id;
    const title = newItemTitle.trim();
    const created = await insertChildTask(parentId);
    if (created) {
      // Compute auto-priority based on existing children
      const currentChildren = useScheduleStore.getState().rows.filter((r) => r.parent_id === parentId);
      const autoPriority = computeNextPriority(currentChildren);
      updateNode(created.id, {
        name: title,
        delivery_mode: 'AGILE',
        percent_complete: 0,
        duration_days: newItemDuration,
        custom_attributes: {
          ...(created.custom_attributes || {}),
          priority: autoPriority,
          backlog_name: currentBacklog,
          kanban_status: 'BACKLOG',
        },
      });
      // Restore selection to the parent so the Kanban board doesn't lose context
      selectNode(parentId);
    }
    setNewItemTitle('');
    setNewItemDuration(1);
    setIsAddingItem(false);
  }, [sprintParentRow, newItemTitle, newItemDuration, currentBacklog, insertChildTask, updateNode, selectNode]);

  // Escape key handler for local full-screen
  useEffect(() => {
    if (!localFullScreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLocalFullScreen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [localFullScreen]);

  // Double-click handler to open card detail
  const handleDoubleClick = useCallback((card: KanbanCard) => {
    setDetailCard(card);
  }, []);

  // Non-Agile placeholder check
  const isAgileOrHybrid = sprintParentRow?.delivery_mode === 'AGILE' || sprintParentRow?.delivery_mode === 'HYBRID';

  if (!sprintParentRow) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-text-ops-muted text-xs gap-2">
        <Kanban size={24} className="text-text-ops-muted/60" />
        <span>Select a WBS task to inspect its Sprint Kanban board</span>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'flex flex-col h-full bg-bg-ops-base p-2 space-y-2 overflow-hidden',
        localFullScreen && 'fixed inset-0 z-50 p-4 bg-bg-ops-base shadow-2xl',
      )}
    >
      {/* Top Agile Toolbar: Work Package Info & Backlog Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-bg-ops-surface border border-border-ops-subtle rounded-lg flex-shrink-0">
        <div className="flex items-center gap-2 truncate">
          <Kanban size={15} className="text-emerald-400 flex-shrink-0" />
          <span className="font-mono text-xs font-semibold text-text-ops-primary truncate">
            {sprintParentRow.code}
          </span>
          <span className="text-xs text-text-ops-muted truncate">
            {sprintParentRow.name}
          </span>
          <span
            className={clsx(
              'px-2 py-0.5 rounded text-[10px] font-mono font-medium border uppercase',
              isAgileOrHybrid
                ? 'bg-emerald-950/70 border-emerald-600/70 text-emerald-300'
                : 'bg-blue-950/70 border-blue-600/70 text-blue-300',
            )}
          >
            {sprintParentRow.delivery_mode || 'WATERFALL'}
          </span>
        </div>

        {/* Backlog Selector */}
        <div className="flex items-center gap-2">
          <FolderGit2 size={13} className="text-text-ops-muted" />
          <span className="text-xs text-text-ops-muted">Backlog:</span>
          {isCreatingBacklog ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={customBacklogInput}
                onChange={(e) => setCustomBacklogInput(e.target.value)}
                placeholder="New backlog name..."
                className="bg-bg-ops-base border border-blue-500 rounded px-2 py-0.5 text-xs text-text-ops-primary focus:outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateBacklog();
                  if (e.key === 'Escape') setIsCreatingBacklog(false);
                }}
              />
              <button
                type="button"
                onClick={handleCreateBacklog}
                className="p-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs"
              >
                <Check size={12} />
              </button>
            </div>
          ) : (
            <select
              value={currentBacklog}
              onChange={(e) => {
                if (e.target.value === '__NEW__') {
                  setIsCreatingBacklog(true);
                } else {
                  handleSelectBacklog(e.target.value);
                }
              }}
              className="bg-bg-ops-base border border-border-ops-subtle rounded px-2 py-0.5 text-xs font-mono text-text-ops-primary focus:outline-none focus:border-blue-500"
            >
              <option value={currentBacklog}>{currentBacklog}</option>
              {availableBacklogs
                .filter((b) => b !== currentBacklog)
                .map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              <option value="__NEW__">+ Create New Backlog...</option>
            </select>
          )}

          <button
            type="button"
            onClick={() => setIsAddingItem((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition-colors"
          >
            <Plus size={13} />
            <span>Add Item</span>
          </button>

          {/* Full Screen / Exit Full Screen button */}
          <button
            type="button"
            onClick={toggleFullScreen}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border transition-colors',
              isFullScreen
                ? 'bg-sky-950/80 border-sky-600 text-sky-300 hover:bg-sky-900'
                : 'bg-bg-ops-surface border-border-ops-subtle text-text-ops-primary hover:bg-bg-ops-overlay',
            )}
            title={isFullScreen ? 'Drop back to partial screen (Esc / toggle)' : 'Expand Kanban board to full screen'}
          >
            {isFullScreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span className="hidden sm:inline">{isFullScreen ? 'Exit Full Screen' : 'Full Screen'}</span>
          </button>
        </div>
      </div>

      {/* Sprint Summary Bar */}
      {isAgileOrHybrid && childRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-bg-ops-surface border border-border-ops-subtle rounded-lg flex-shrink-0">
          {/* Status Counts */}
          <div className="flex items-center gap-2">
            <TrendingUp size={13} className="text-emerald-400 flex-shrink-0" />
            <span className="text-[10px] font-medium text-text-ops-muted uppercase">Sprint Status:</span>
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950/50 border border-emerald-700/50 text-emerald-300 text-[10px] font-mono">
              <Check size={10} /> {sprintSummary.completedCount}
            </span>
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-950/50 border border-sky-700/50 text-sky-300 text-[10px] font-mono">
              <Clock size={10} /> {sprintSummary.inProgressCount}
            </span>
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-950/50 border border-rose-700/50 text-rose-300 text-[10px] font-mono">
              <AlertTriangle size={10} /> {sprintSummary.blockedCount}
            </span>
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800/50 border border-slate-600/50 text-slate-300 text-[10px] font-mono">
              <Flag size={10} /> {sprintSummary.backlogCount}
            </span>
            <span className="text-[10px] font-mono text-text-ops-muted">
              ({sprintSummary.overallProgress}% done)
            </span>
          </div>

          {/* Progress Bar */}
          <div className="flex-1 min-w-[80px] h-1.5 bg-bg-ops-overlay rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${sprintSummary.overallProgress}%` }}
            />
          </div>

          {/* Nominated Resources */}
          <div className="flex items-center gap-2">
            <Users size={13} className="text-blue-400 flex-shrink-0" />
            <span className="text-[10px] font-medium text-text-ops-muted uppercase">Resources:</span>
            {sprintResources.length > 0 ? (
              <div className="flex items-center gap-1 flex-wrap">
                {sprintResources.map((res) => (
                  <span
                    key={res}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-950/50 border border-blue-700/50 text-blue-300 text-[10px] font-mono group/resource"
                  >
                    <User size={9} />
                    {res}
                    <button
                      type="button"
                      onClick={() => handleRemoveResource(res)}
                      className="ml-0.5 opacity-0 group-hover/resource:opacity-100 hover:text-rose-400 transition-opacity"
                      title={`Remove ${res}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-[10px] text-text-ops-muted/50 italic">No resources assigned</span>
            )}
            {isAddingResource ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={resourceInput}
                  onChange={(e) => setResourceInput(e.target.value)}
                  placeholder="Resource name..."
                  className="bg-bg-ops-base border border-blue-500 rounded px-1.5 py-0.5 text-[10px] text-text-ops-primary focus:outline-none w-24"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddResource();
                    if (e.key === 'Escape') setIsAddingResource(false);
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddResource}
                  className="p-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px]"
                >
                  <Check size={10} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingResource(true)}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary text-[10px] transition-colors"
                title="Add resource to sprint"
              >
                <Plus size={10} />
                Add
              </button>
            )}
          </div>

          {/* Predicted Duration & End Date */}
          <div className="flex items-center gap-2">
            <Calendar size={13} className="text-amber-400 flex-shrink-0" />
            <span className="text-[10px] font-medium text-text-ops-muted uppercase">Prediction:</span>
            <span className="px-1.5 py-0.5 rounded bg-amber-950/50 border border-amber-700/50 text-amber-300 text-[10px] font-mono">
              {sprintSummary.predictedDurationDays}d remaining
            </span>
            <span className="px-1.5 py-0.5 rounded bg-amber-950/50 border border-amber-700/50 text-amber-300 text-[10px] font-mono">
              End: {sprintSummary.predictedEndDate || '—'}
            </span>
          </div>
        </div>
      )}

      {/* Inline New Item Creation Form */}
      {isAddingItem && (
        <div className="flex items-center gap-2 p-2 bg-bg-ops-surface border border-blue-500/60 rounded-lg flex-shrink-0 animate-in fade-in">
          <input
            type="text"
            value={newItemTitle}
            onChange={(e) => setNewItemTitle(e.target.value)}
            placeholder="Work item title (e.g. Implement login validation...)"
            className="flex-1 bg-bg-ops-base border border-border-ops-subtle rounded px-2 py-1 text-xs text-text-ops-primary focus:outline-none focus:border-blue-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateItem();
              if (e.key === 'Escape') setIsAddingItem(false);
            }}
          />
          <div className="flex items-center gap-1 text-xs text-text-ops-muted">
            <Clock size={11} />
            <span>Days:</span>
            <input
              type="number"
              min={1}
              max={365}
              value={newItemDuration}
              onChange={(e) => setNewItemDuration(Math.max(1, Number(e.target.value)))}
              className="w-14 bg-bg-ops-base border border-border-ops-subtle rounded px-1.5 py-0.5 text-xs font-mono text-text-ops-primary focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleCreateItem}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setIsAddingItem(false)}
            className="px-2 py-1 text-text-ops-muted hover:text-text-ops-primary text-xs"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Kanban Board Grid */}
      <div className="flex-1 flex gap-2 min-h-0 overflow-x-auto">
        {COLUMNS.map((col) => (
          <KanbanColumnComponent
            key={col.status}
            column={col}
            cards={cardsByColumn[col.status]}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onMove={handleMoveCard}
            onQuickAdd={() => setIsAddingItem(true)}
            onDoubleClick={handleDoubleClick}
          />
        ))}
      </div>

      {/* Card Detail Overlay */}
      {detailCard && (
        <SprintCardDetail
          row={detailCard.row}
          status={detailCard.status}
          onClose={() => setDetailCard(null)}
          onStatusChange={handleMoveCard}
        />
      )}
    </div>
  );
};

export default MiniKanban;
