/**
 * Task Mini-Kanban Component
 *
 * Sprint board view for AGILE and HYBRID delivery mode tasks.
 * Displays sub-tasks and stories across four columns:
 * Backlog → In Progress → Testing → Done.
 *
 * When the selected node uses AGILE or HYBRID delivery mode, this tab
 * shows the node's child tasks as Kanban cards that can be dragged
 * between columns to update their status. For WATERFALL nodes, the
 * tab displays a placeholder message.
 *
 * Each card shows the task code, name, assignee, progress percentage,
 * and any active blocker indicators.
 */

import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flag,
  Lock,
  Plus,
} from 'lucide-react';
import { clsx } from 'clsx';
import { WBSRow, DeliveryMode } from '../../types/wbs';
import { useScheduleStore } from '../../stores/useScheduleStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Kanban column status values.
 */
export type KanbanStatus = 'BACKLOG' | 'IN_PROGRESS' | 'TESTING' | 'DONE';

/**
 * Kanban card data derived from a WBSRow.
 */
interface KanbanCard {
  row: WBSRow;
  status: KanbanStatus;
}

/**
 * Column configuration for the Kanban board.
 */
interface KanbanColumn {
  status: KanbanStatus;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
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
    bgColor: 'bg-bg-ops-overlay',
  },
  {
    status: 'IN_PROGRESS',
    label: 'In Progress',
    icon: <Clock size={14} />,
    color: 'text-sky-400',
    bgColor: 'bg-sky-900/20',
  },
  {
    status: 'TESTING',
    label: 'Testing',
    icon: <AlertTriangle size={14} />,
    color: 'text-amber-400',
    bgColor: 'bg-amber-900/20',
  },
  {
    status: 'DONE',
    label: 'Done',
    icon: <CheckCircle2 size={14} />,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-900/20',
  },
];

/**
 * Map percent_complete to a Kanban status.
 */
function statusFromProgress(percentComplete: number): KanbanStatus {
  if (percentComplete >= 100) return 'DONE';
  if (percentComplete >= 75) return 'TESTING';
  if (percentComplete > 0) return 'IN_PROGRESS';
  return 'BACKLOG';
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MiniKanbanProps {
  /** The currently selected WBS row (parent task) */
  selectedRow: WBSRow | null;
  /** Child rows of the selected node */
  childRows: WBSRow[];
  /** Callback when a card's status changes */
  onStatusChange?: (nodeId: string, newStatus: KanbanStatus) => void;
}

// ---------------------------------------------------------------------------
// Kanban Card
// ---------------------------------------------------------------------------

const KanbanCardComponent: React.FC<{
  card: KanbanCard;
  onDragStart: (e: React.DragEvent, nodeId: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
}> = ({ card, onDragStart, onDragEnd }) => {
  const { row } = card;
  const isMasked = row.is_masked === true;
  const hasBlockers = row.blockers && row.blockers.length > 0;
  const isCritical = row.total_float !== null && row.total_float <= 0;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, row.id)}
      onDragEnd={onDragEnd}
      className={clsx(
        'p-3 rounded-md border cursor-grab active:cursor-grabbing transition-colors',
        'bg-bg-ops-surface border-border-ops-subtle hover:border-border-ops-strong',
        isCritical && 'border-l-2 border-l-red-500',
      )}
      title={isMasked ? '[RESTRICTED]' : `${row.code}: ${row.name}`}
    >
      {/* Code */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-text-ops-muted">{row.code}</span>
        {hasBlockers && (
          <span className="text-amber-400" title="Has active blockers">
            <AlertTriangle size={12} />
          </span>
        )}
      </div>

      {/* Name */}
      {isMasked ? (
        <div className="flex items-center gap-1 text-xs italic text-text-ops-muted mb-2">
          <Lock size={10} />
          [RESTRICTED]
        </div>
      ) : (
        <div className="text-sm text-text-ops-primary truncate mb-2">
          {row.name}
        </div>
      )}

      {/* Progress bar */}
      {!isMasked && (
        <div className="flex items-center gap-2">
          <div
            className="flex-1 h-1.5 bg-bg-ops-overlay rounded-full overflow-hidden"
          >
            <div
              className="h-full bg-sky-500 rounded-full transition-all"
              style={{ width: `${row.percent_complete}%` }}
            />
          </div>
          <span className="text-xs font-mono text-text-ops-muted">
            {row.percent_complete}%
          </span>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Kanban Column
// ---------------------------------------------------------------------------

const KanbanColumnComponent: React.FC<{
  column: KanbanColumn;
  cards: KanbanCard[];
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, status: KanbanStatus) => void;
  onDragStart: (e: React.DragEvent, nodeId: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
}> = ({ column, cards, onDragOver, onDrop, onDragStart, onDragEnd }) => {
  return (
    <div
      className={clsx('flex-1 flex flex-col min-w-0', column.bgColor, 'rounded-md')}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(e);
      }}
      onDrop={(e) => onDrop(e, column.status)}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-ops-subtle">
        <span className={column.color}>{column.icon}</span>
        <span className="text-sm font-semibold text-text-ops-primary">
          {column.label}
        </span>
        <span className="ml-auto text-xs font-mono text-text-ops-muted">
          {cards.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {cards.map((card) => (
          <KanbanCardComponent
            key={card.row.id}
            card={card}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
        {cards.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-text-ops-muted italic">
            No tasks
          </div>
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
  childRows,
  onStatusChange,
}) => {
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);

  // Check if the selected node supports Kanban view
  const isAgileOrHybrid =
    selectedRow?.delivery_mode === 'AGILE' ||
    selectedRow?.delivery_mode === 'HYBRID';

  // Map child rows to Kanban cards
  const cardsByColumn = useMemo(() => {
    const columns: Record<KanbanStatus, KanbanCard[]> = {
      BACKLOG: [],
      IN_PROGRESS: [],
      TESTING: [],
      DONE: [],
    };

    childRows.forEach((row) => {
      const status = statusFromProgress(row.percent_complete);
      columns[status].push({ row, status });
    });

    return columns;
  }, [childRows]);

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, nodeId: string) => {
    setDraggedNodeId(nodeId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedNodeId(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (_e: React.DragEvent, newStatus: KanbanStatus) => {
    if (!draggedNodeId) return;
    onStatusChange?.(draggedNodeId, newStatus);
    setDraggedNodeId(null);
  };

  // No selection — show placeholder
  if (!selectedRow) {
    return (
      <div className="flex items-center justify-center h-full text-text-ops-muted">
        <div className="text-center">
          <Flag size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Select a task to view its sprint board</p>
        </div>
      </div>
    );
  }

  // WATERFALL node — show placeholder
  if (!isAgileOrHybrid) {
    return (
      <div className="flex items-center justify-center h-full text-text-ops-muted">
        <div className="text-center">
          <Flag size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">
            Kanban board is available for AGILE and HYBRID delivery modes.
          </p>
          <p className="text-xs mt-1">
            This task uses {selectedRow.delivery_mode || 'WATERFALL'} delivery.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-ops-subtle bg-bg-ops-surface">
        <div className="flex items-center gap-2">
          <Flag size={16} className="text-text-ops-muted" />
          <span className="text-sm font-semibold text-text-ops-primary">
            Sprint Board
          </span>
          <span className="text-xs font-mono text-text-ops-muted">
            {selectedRow.code}: {selectedRow.name}
          </span>
        </div>
        <button
          className="flex items-center gap-1 px-2 py-1 text-xs text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay rounded transition-colors"
          title="Add sub-task"
        >
          <Plus size={12} />
          Add Task
        </button>
      </div>

      {/* Columns */}
      <div className="flex-1 overflow-x-auto p-3 gap-3 flex">
        {COLUMNS.map((column) => (
          <KanbanColumnComponent
            key={column.status}
            column={column}
            cards={cardsByColumn[column.status]}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>
    </div>
  );
};

export default MiniKanban;
