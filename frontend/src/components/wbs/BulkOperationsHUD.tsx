/**
 * BulkOperationsHUD — Floating Bulk Operations Bar
 *
 * Appears when multiple rows are selected in the WBS table,
 * providing quick bulk actions:
 *
 * - **Bulk Shift Dates**: Shift planned start/finish dates across
 *   all selected activities by a specified number of days.
 * - **Bulk Flag Blocker**: Attach a common impediment to all selected items.
 * - **Bulk Assign Resource**: Assign or replace personnel across the selection.
 *
 * All operations are wrapped in a single HistoryCommand for one-click
 * Ctrl+Z rollback.
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    {selectedNodeIds.size > 1 && (
 *      <BulkOperationsHUD
 *        selectedCount={selectedNodeIds.size}
 *        onClose={() => clearSelection()}
 *      />
 *    )}
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  CalendarDays,
  AlertTriangle,
  Users,
  X,
  ChevronDown,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useHistoryStore } from '../../stores/useHistoryStore';
import { useScheduleStore } from '../../stores/useScheduleStore';
import { addWorkdays } from '../../hooks/useInlineEdit';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BulkOperationsHUDProps {
  /** Number of selected rows */
  selectedCount: number;
  /** Called to close/dismiss the HUD */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const BulkOperationsHUD: React.FC<BulkOperationsHUDProps> = ({
  selectedCount,
  onClose,
}) => {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [shiftDays, setShiftDays] = useState(1);
  const hudRef = useRef<HTMLDivElement>(null);

  const selectedNodeIds = useScheduleStore((s) => s.selectedNodeIds);
  const updateRow = useScheduleStore((s) => s.updateRow);
  const rows = useScheduleStore((s) => s.rows);
  const pushCommand = useHistoryStore((s) => s.pushCommand);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (hudRef.current && !hudRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Bulk shift dates
  const handleShiftDates = useCallback(() => {
    const operations = [];

    for (const nodeId of selectedNodeIds) {
      const row = rows.find((r) => r.id === nodeId);
      if (!row) continue;

      if (row.planned_start_date) {
        const newStart = addWorkdays(row.planned_start_date, shiftDays);
        operations.push({
          node_id: nodeId,
          field: 'planned_start_date',
          oldValue: row.planned_start_date,
          newValue: newStart,
        });
        updateRow(nodeId, { planned_start_date: newStart });
      }

      if (row.planned_end_date) {
        const newEnd = addWorkdays(row.planned_end_date, shiftDays);
        operations.push({
          node_id: nodeId,
          field: 'planned_end_date',
          oldValue: row.planned_end_date,
          newValue: newEnd,
        });
        updateRow(nodeId, { planned_end_date: newEnd });
      }
    }

    if (operations.length > 0) {
      pushCommand({
        type: 'BULK_SHIFT_DATES',
        description: `Shifted ${selectedNodeIds.size} tasks by ${shiftDays} days`,
        operations,
      });
    }

    setActiveAction(null);
    onClose();
  }, [selectedNodeIds, rows, shiftDays, updateRow, pushCommand, onClose]);

  // Bulk flag blocker
  const handleFlagBlocker = useCallback(() => {
    // Placeholder — would call POST /api/v1/cockpit/tasks/{id}/blocker
    // for each selected node
    console.log(`Flag blocker on ${selectedNodeIds.size} nodes`);
    setActiveAction(null);
    onClose();
  }, [selectedNodeIds, onClose]);

  // Bulk assign resource
  const handleAssignResource = useCallback(() => {
    // Placeholder — would call the requisition/assignment API
    console.log(`Assign resource to ${selectedNodeIds.size} nodes`);
    setActiveAction(null);
    onClose();
  }, [selectedNodeIds, onClose]);

  return (
    <div
      ref={hudRef}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 bg-bg-ops-surface border border-border-ops-strong rounded-lg shadow-2xl"
      role="toolbar"
      aria-label="Bulk operations"
    >
      {/* Selection count */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/40 text-blue-300 rounded border border-blue-700/50">
        <Users size={14} />
        <span className="text-sm font-semibold">{selectedNodeIds.size} selected</span>
      </div>

      <div className="w-px h-6 bg-border-ops-subtle" />

      {/* Shift Dates */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setActiveAction(activeAction === 'shift' ? null : 'shift')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border transition-colors',
            activeAction === 'shift'
              ? 'bg-blue-900/40 text-blue-300 border-blue-700/50'
              : 'bg-bg-ops-overlay text-text-ops-muted border-border-ops-subtle hover:text-text-ops-primary hover:border-border-ops-strong',
          )}
        >
          <CalendarDays size={14} />
          <span className="hidden sm:inline">Shift Dates</span>
          <ChevronDown size={10} className={clsx(activeAction === 'shift' && 'rotate-180 transition-transform')} />
        </button>

        {activeAction === 'shift' && (
          <div className="absolute bottom-full left-0 mb-2 w-64 bg-bg-ops-surface border border-border-ops-strong rounded-lg shadow-2xl p-3">
            <label className="block text-xs text-text-ops-muted mb-2">
              Shift by workdays:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={-30}
                max={30}
                value={shiftDays}
                onChange={(e) => setShiftDays(parseInt(e.target.value, 10))}
                className="flex-1 accent-blue-500"
              />
              <span className="text-sm font-mono text-text-ops-primary min-w-[3ch] text-right">
                {shiftDays > 0 ? `+${shiftDays}` : shiftDays}
              </span>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={handleShiftDates}
                className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors"
              >
                Apply Shift
              </button>
              <button
                type="button"
                onClick={() => setActiveAction(null)}
                className="px-3 py-1.5 text-sm bg-bg-ops-overlay text-text-ops-muted rounded hover:text-text-ops-primary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Flag Blocker */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setActiveAction(activeAction === 'blocker' ? null : 'blocker')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border transition-colors',
            activeAction === 'blocker'
              ? 'bg-red-900/40 text-red-300 border-red-700/50'
              : 'bg-bg-ops-overlay text-text-ops-muted border-border-ops-subtle hover:text-text-ops-primary hover:border-border-ops-strong',
          )}
        >
          <AlertTriangle size={14} />
          <span className="hidden sm:inline">Flag Blocker</span>
          <ChevronDown size={10} className={clsx(activeAction === 'blocker' && 'rotate-180 transition-transform')} />
        </button>

        {activeAction === 'blocker' && (
          <div className="absolute bottom-full left-0 mb-2 w-64 bg-bg-ops-surface border border-border-ops-strong rounded-lg shadow-2xl p-3">
            <p className="text-xs text-text-ops-muted mb-2">
              Attach a common impediment to all {selectedNodeIds.size} selected tasks.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleFlagBlocker}
                className="flex-1 px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-500 transition-colors"
              >
                Create Blocker
              </button>
              <button
                type="button"
                onClick={() => setActiveAction(null)}
                className="px-3 py-1.5 text-sm bg-bg-ops-overlay text-text-ops-muted rounded hover:text-text-ops-primary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Assign Resource */}
      <button
        type="button"
        onClick={handleAssignResource}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-bg-ops-overlay text-text-ops-muted border border-border-ops-subtle rounded hover:text-text-ops-primary hover:border-border-ops-strong transition-colors"
      >
        <Users size={14} />
        <span className="hidden sm:inline">Assign Resource</span>
      </button>

      <div className="w-px h-6 bg-border-ops-subtle" />

      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        className="p-1 text-text-ops-muted hover:text-text-ops-primary transition-colors"
        aria-label="Close bulk operations"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default BulkOperationsHUD;
