/**
 * useInlineEdit Hook — Spreadsheet-like Cell Editing
 *
 * Manages inline cell editing state for the WBS table:
 *
 * - Double-click to enter edit mode
 * - Enter: Commit and stay in column
 * - Tab: Commit and move right
 * - Shift+Tab: Commit and move left
 * - Esc: Revert and exit edit mode
 * - Blur: Commit on focus loss
 *
 * Each commit pushes a HistoryCommand to the undo store for Ctrl+Z rollback.
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    const editHook = useInlineEdit(rows, rowHeight);
 *
 *    // In cell render:
 *    {editHook.activeCell?.nodeId === node.id && editHook.activeCell?.field === 'planned_start_date'
 *      ? <InlineEditCell {...editHook} />
 *      : <span onDoubleClick={editHook.startEdit}>{value}</span>
 *    }
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useHistoryStore } from '../stores/useHistoryStore';
import { useScheduleStore } from '../stores/useScheduleStore';
import {
  EditableField,
  ActiveCellState,
  EDITABLE_FIELD_INPUT_TYPES,
} from '../types/editing';

// ---------------------------------------------------------------------------
// Date Helpers
// ---------------------------------------------------------------------------

/**
 * Add days to a date string, skipping weekends.
 */
function addWorkdays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  const direction = days >= 0 ? 1 : -1;
  let remaining = Math.abs(days);

  while (remaining > 0) {
    date.setDate(date.getDate() + direction);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) { // Skip weekends
      remaining--;
    }
  }

  return date.toISOString().split('T')[0];
}

/**
 * Calculate duration between two dates in workdays.
 */
function calculateWorkdayDuration(startStr: string, endStr: string): number {
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;

  let days = 0;
  const current = new Date(start);
  const direction = end >= start ? 1 : -1;

  while ((direction > 0 && current < end) || (direction < 0 && current > end)) {
    current.setDate(current.getDate() + direction);
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) {
      days++;
    }
  }

  return Math.abs(days);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseInlineEditProps {
  /** Current rows data */
  rows: { id: string; path?: string }[];
  /** Row height in pixels */
  rowHeight: number;
  /**
   * Optional override for committing specific fields (e.g. 'predecessors'/'successors')
   * that don't map to a simple `updateRow` call. Return `true` if the field was handled,
   * `false`/`undefined` to fall back to the default `updateRow` behaviour.
   */
  onCommitField?: (nodeId: string, field: EditableField, newValue: string | number | null) => boolean | void;
}

interface UseInlineEditReturn {
  /** Current active cell state */
  activeCell: ActiveCellState | null;
  /** Start editing a cell */
  startEdit: (rowIndex: number, nodeId: string, field: EditableField, value: string | number | null) => void;
  /** Commit the current edit */
  commitEdit: () => void;
  /** Revert the current edit */
  revertEdit: () => void;
  /** Move to next cell (Tab) */
  moveToNextCell: () => void;
  /** Move to previous cell (Shift+Tab) */
  moveToPrevCell: () => void;
  /** Move to cell in same column, next row (Enter) */
  moveToNextRow: () => void;
  /** Update current edit value */
  updateValue: (value: string) => void;
  /** Whether a cell is currently being edited */
  isEditing: boolean;
  /** Input ref for focus management */
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export function useInlineEdit({ rows, rowHeight, onCommitField }: UseInlineEditProps): UseInlineEditReturn {
  const [activeCell, setActiveCell] = useState<ActiveCellState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pushCommand = useHistoryStore((s) => s.pushCommand);
  const updateRow = useScheduleStore((s) => s.updateRow);

  // Column order for navigation
  const editableColumns: EditableField[] = [
    'predecessors',
    'successors',
    'planned_start_date',
    'planned_end_date',
    'percent_complete',
  ];

  // Focus input when edit starts
  useEffect(() => {
    if (activeCell?.isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [activeCell?.isEditing, activeCell?.nodeId, activeCell?.field]);

  // Get column index for a field
  const getColIndex = useCallback((field: EditableField): number => {
    return editableColumns.indexOf(field);
  }, []);

  // Navigate to a new cell
  const navigateTo = useCallback((rowIndex: number, nodeId: string, field: EditableField, value: string | number | null) => {
    setActiveCell({
      rowIndex,
      nodeId,
      field,
      columnId: field,
      originalValue: value,
      currentValue: value != null ? String(value) : '',
      isEditing: true,
    });
  }, []);

  // Start editing
  const startEdit = useCallback((rowIndex: number, nodeId: string, field: EditableField, value: string | number | null) => {
    navigateTo(rowIndex, nodeId, field, value);
  }, [navigateTo]);

  // Commit the current edit
  const commitEdit = useCallback(() => {
    if (!activeCell) return;

    const { nodeId, field, originalValue, currentValue } = activeCell;
    const newValue = parseValue(field, currentValue);

    // Skip if value hasn't changed
    if (String(newValue) === String(originalValue)) {
      setActiveCell(null);
      return;
    }

    // Push to history
    pushCommand({
      type: 'CELL_EDIT',
      description: `Edited ${field} on node ${nodeId}`,
      operations: [
        {
          node_id: nodeId,
          field,
          oldValue: originalValue,
          newValue,
        },
      ],
    });

    // Fields like 'predecessors'/'successors' require custom handling (dependency
    // link diffing) rather than a direct node attribute update.
    const handled = onCommitField?.(nodeId, field, newValue);
    if (!handled) {
      // Update the row in the schedule store
      updateRow(nodeId, { [field]: newValue });
    }

    setActiveCell(null);
  }, [activeCell, pushCommand, updateRow, onCommitField]);

  // Revert the current edit
  const revertEdit = useCallback(() => {
    setActiveCell(null);
  }, []);

  // Move to next cell (Tab)
  const moveToNextCell = useCallback(() => {
    if (!activeCell) return;
    commitEdit();

    const colIdx = getColIndex(activeCell.field);
    if (colIdx < editableColumns.length - 1) {
      // Same row, next column
      const nextField = editableColumns[colIdx + 1];
      const row = rows[activeCell.rowIndex];
      if (row) {
        const value = (row as any)[nextField] ?? null;
        navigateTo(activeCell.rowIndex, row.id, nextField, value);
      }
    }
  }, [activeCell, rows, getColIndex, commitEdit, navigateTo]);

  // Move to previous cell (Shift+Tab)
  const moveToPrevCell = useCallback(() => {
    if (!activeCell) return;
    commitEdit();

    const colIdx = getColIndex(activeCell.field);
    if (colIdx > 0) {
      // Same row, previous column
      const prevField = editableColumns[colIdx - 1];
      const row = rows[activeCell.rowIndex];
      if (row) {
        const value = (row as any)[prevField] ?? null;
        navigateTo(activeCell.rowIndex, row.id, prevField, value);
      }
    }
  }, [activeCell, rows, getColIndex, commitEdit, navigateTo]);

  // Move to next row (Enter)
  const moveToNextRow = useCallback(() => {
    if (!activeCell) return;
    commitEdit();

    const nextIdx = activeCell.rowIndex + 1;
    if (nextIdx < rows.length) {
      const nextRow = rows[nextIdx];
      const value = (nextRow as any)[activeCell.field] ?? null;
      navigateTo(nextIdx, nextRow.id, activeCell.field, value);
    }
  }, [activeCell, rows, commitEdit, navigateTo]);

  // Update current edit value
  const updateValue = useCallback((value: string) => {
    setActiveCell((prev) => prev ? { ...prev, currentValue: value } : null);
  }, []);

  return {
    activeCell,
    startEdit,
    commitEdit,
    revertEdit,
    moveToNextCell,
    moveToPrevCell,
    moveToNextRow,
    updateValue,
    isEditing: activeCell?.isEditing ?? false,
    inputRef,
  };
}

// ---------------------------------------------------------------------------
// Value Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a string value into the appropriate type for the field.
 */
function parseValue(field: EditableField, value: string): string | number | null {
  if (!value || value.trim() === '') return null;

  const inputType = EDITABLE_FIELD_INPUT_TYPES[field];

  if (inputType === 'number') {
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  }

  // Date / text
  return value.trim();
}

// ---------------------------------------------------------------------------
// Exported helpers for use in components
// ---------------------------------------------------------------------------

export { addWorkdays, calculateWorkdayDuration };
