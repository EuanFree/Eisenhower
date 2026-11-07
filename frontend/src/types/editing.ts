/**
 * Editing Type Definitions
 *
 * Types for spreadsheet-like data manipulation in the WBS table:
 * inline cell editing, multi-row selection, bulk operations,
 * and drag-to-fill handles.
 *
 * Inline Editing
 * --------------
 *
 * Double-clicking editable cells (Planned Start, Planned Finish, Duration,
 * Physical % Complete) converts the cell into an active input field.
 *
 * Key bindings:
 * - Enter: Commits the edit and pushes a HistoryCommand to the undo store.
 * - Tab / Shift+Tab: Commits and moves to the adjacent cell.
 * - Esc: Reverts changes and restores display mode.
 *
 * Multi-Row Selection
 * -------------------
 *
 * - Shift+Click: Range selection between the last clicked row and the current row.
 * - Ctrl+Click: Toggle individual row selection (discontiguous).
 *
 * Bulk Operations HUD
 * -------------------
 *
 * When multiple rows are selected, a floating HUD appears with:
 * - Bulk Shift Dates (+/- days)
 * - Bulk Flag Blocker
 * - Bulk Assign Resource
 *
 * Drag-to-Fill Handle
 * -------------------
 *
 * A 4px square handle on the bottom-right corner of the active cell.
 * Dragging propagates the value to highlighted target cells, wrapped
 * in a single createBatchCommand() for one-click Ctrl+Z rollback.
 */

// ---------------------------------------------------------------------------
// Editable Fields
// ---------------------------------------------------------------------------

/**
 * Field names that support inline editing in the WBS table.
 */
export type EditableField =
  | 'planned_start_date'
  | 'planned_end_date'
  | 'duration_days'
  | 'duration'
  | 'percent_complete'
  | 'predecessors'
  | 'successors'
  | 'resources';

/**
 * Display labels for editable fields.
 */
export const EDITABLE_FIELD_LABELS: Record<EditableField, string> = {
  planned_start_date: 'Planned Start',
  planned_end_date: 'Planned Finish',
  duration_days: 'Duration (days)',
  duration: 'Duration',
  percent_complete: 'Physical % Complete',
  predecessors: 'Predecessors',
  successors: 'Successors',
  resources: 'Resources',
};

/**
 * Input types for each editable field.
 */
export const EDITABLE_FIELD_INPUT_TYPES: Record<EditableField, 'date' | 'number' | 'text'> = {
  planned_start_date: 'date',
  planned_end_date: 'date',
  duration_days: 'number',
  duration: 'text',
  percent_complete: 'number',
  predecessors: 'text',
  successors: 'text',
  resources: 'text',
};

// ---------------------------------------------------------------------------
// Active Cell State
// ---------------------------------------------------------------------------

/**
 * State of the currently active (editing) cell.
 */
export interface ActiveCellState {
  /** Row index in the virtualized table */
  rowIndex: number;
  /** Node ID being edited */
  nodeId: string;
  /** Field being edited */
  field: EditableField;
  /** Column accessor key */
  columnId: string;
  /** Original value before editing */
  originalValue: string | number | null;
  /** Current value being edited */
  currentValue: string;
  /** Whether the cell is in edit mode */
  isEditing: boolean;
}

// ---------------------------------------------------------------------------
// Multi-Row Selection
// ---------------------------------------------------------------------------

/**
 * Selection mode for multi-row operations.
 */
export type SelectionMode = 'SINGLE' | 'RANGE' | 'DISCONTIGUOUS';

/**
 * State of multi-row selection.
 */
export interface MultiRowSelection {
  /** Set of selected node IDs */
  selectedNodeIds: Set<string>;
  /** Selection mode */
  mode: SelectionMode;
  /** Last clicked row index (for range selection) */
  lastClickedRowIndex: number | null;
  /** Whether Shift key was held on last click */
  shiftKey: boolean;
  /** Whether Ctrl/Cmd key was held on last click */
  ctrlKey: boolean;
}

// ---------------------------------------------------------------------------
// Bulk Operations
// ---------------------------------------------------------------------------

/**
 * Types of bulk operations available in the HUD.
 */
export type BulkOperationType = 'SHIFT_DATES' | 'FLAG_BLOCKER' | 'ASSIGN_RESOURCE';

/**
 * Parameters for bulk date shift operation.
 */
export interface BulkShiftDatesParams {
  /** Number of days to shift (positive = forward, negative = backward) */
  days: number;
  /** Fields to shift */
  fields: ('planned_start_date' | 'planned_end_date')[];
}

/**
 * Parameters for bulk flag blocker operation.
 */
export interface BulkFlagBlockerParams {
  /** Blocker category */
  category: string;
  /** Blocker severity */
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
  /** Impacted hours */
  impactedHours: number;
}

/**
 * Parameters for bulk assign resource operation.
 */
export interface BulkAssignResourceParams {
  /** Resource node ID to assign */
  resourceNodeId: string;
  /** Allocation units (e.g., 1.0 for 100% FTE) */
  allocatedUnits: number;
}

// ---------------------------------------------------------------------------
// Drag-to-Fill
// ---------------------------------------------------------------------------

/**
 * State of the drag-to-fill handle.
 */
export interface DragFillState {
  /** Whether drag is in progress */
  isDragging: boolean;
  /** Source cell state */
  sourceCell: ActiveCellState | null;
  /** Target row indices being filled */
  targetRowIndices: number[];
  /** Preview highlight range */
  previewRange: { start: number; end: number } | null;
}

// ---------------------------------------------------------------------------
// Column Definitions for Editing
// ---------------------------------------------------------------------------

/**
 * Column IDs that map to editable fields.
 */
export const EDITABLE_COLUMN_IDS: Record<string, EditableField> = {
  planned_start_date: 'planned_start_date',
  planned_end_date: 'planned_end_date',
  duration: 'duration',
  total_float: 'duration_days', // Map total_float column to duration_days for editing
  percent_complete: 'percent_complete',
  predecessors: 'predecessors',
  successors: 'successors',
  resources: 'resources',
};

/**
 * Get the column index for a given field.
 */
export function getColumnIndexForField(field: EditableField): number {
  const columnOrder = ['code', 'name', 'predecessors', 'successors', 'resources', 'delivery_mode', 'planned_start_date', 'planned_end_date', 'duration', 'total_float', 'percent_complete', 'blockers', 'presence'];
  return columnOrder.indexOf(field === 'duration_days' ? 'total_float' : field);
}
