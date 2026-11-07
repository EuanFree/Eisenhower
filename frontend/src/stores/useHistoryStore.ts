/**
 * History Store — 200+ Step Undo/Redo with Batch Commands
 *
 * Manages an invertible command history for WBS table edits,
 * enabling Ctrl+Z / Ctrl+Y rollback that aligns with backend
 * database transactional rollback and audit logging.
 *
 * Each command records the original state and the new state,
 * allowing both forward execution and backward reversal.
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    const { pushCommand, undo, redo, canUndo, canRedo } = useHistoryStore();
 *
 *    // Single cell edit
 *    pushCommand({
 *      type: 'CELL_EDIT',
 *      node_id: 'uuid',
 *      field: 'planned_start_date',
 *      oldValue: '2026-10-15',
 *      newValue: '2026-10-20',
 *    });
 *
 *    // Batch edit (drag-to-fill, bulk shift dates)
 *    pushCommand(createBatchCommand([
 *      { node_id: 'uuid1', field: 'planned_start_date', oldValue: '...', newValue: '...' },
 *      { node_id: 'uuid2', field: 'planned_start_date', oldValue: '...', newValue: '...' },
 *    ]));
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Command Types
// ---------------------------------------------------------------------------

/**
 * A single invertible history command.
 */
export interface HistoryCommand {
  /** Unique command identifier */
  id: string;
  /** Command type for display and routing */
  type: 'CELL_EDIT' | 'BATCH_EDIT' | 'BULK_SHIFT_DATES' | 'BULK_FLAG_BLOCKER' | 'BULK_ASSIGN_RESOURCE';
  /** Timestamp when the command was executed */
  timestamp: number;
  /** Human-readable description */
  description: string;
  /** Array of field-level changes for this command */
  operations: HistoryOperation[];
}

/**
 * A single field-level change within a history command.
 */
export interface HistoryOperation {
  /** Node UUID being modified */
  node_id: string;
  /** Field name (e.g., 'planned_start_date', 'percent_complete') */
  field: string;
  /** Previous value before the command */
  oldValue: string | number | null;
  /** New value after the command */
  newValue: string | number | null;
}

// ---------------------------------------------------------------------------
// Store State
// ---------------------------------------------------------------------------

interface HistoryStore {
  /** Undo stack (past commands) */
  undoStack: HistoryCommand[];
  /** Redo stack (future commands that were undone) */
  redoStack: HistoryCommand[];
  /** Current command being built (for batch operations) */
  currentBatch: HistoryOperation[] | null;
  /** Maximum history depth */
  maxHistory: number;

  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;

  /** Push a new command onto the history stack */
  pushCommand: (cmd: Omit<HistoryCommand, 'id' | 'timestamp'>) => void;
  /** Undo the last command */
  undo: () => HistoryCommand | null;
  /** Redo the last undone command */
  redo: () => HistoryCommand | null;
  /** Start a new batch command */
  startBatch: (type: HistoryCommand['type'], description: string) => void;
  /** Add an operation to the current batch */
  addBatchOperation: (op: HistoryOperation) => void;
  /** Commit the current batch as a single command */
  commitBatch: () => void;
  /** Cancel the current batch without committing */
  cancelBatch: () => void;
  /** Clear all history */
  clearHistory: () => void;
}

// ---------------------------------------------------------------------------
// ID Generator
// ---------------------------------------------------------------------------

let commandIdCounter = 0;
const generateId = (): string => `cmd-${Date.now()}-${++commandIdCounter}`;

// ---------------------------------------------------------------------------
// Store Definition
// ---------------------------------------------------------------------------

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  undoStack: [],
  redoStack: [],
  currentBatch: null,
  maxHistory: 500,

  canUndo: false,
  canRedo: false,

  pushCommand: (cmd) => {
    const fullCmd: HistoryCommand = {
      ...cmd,
      id: generateId(),
      timestamp: Date.now(),
    };

    set((state) => {
      const newUndo = [...state.undoStack, fullCmd];
      // Trim to max history
      if (newUndo.length > state.maxHistory) {
        newUndo.shift();
      }
      return {
        undoStack: newUndo,
        redoStack: [], // Clear redo stack on new command
        canUndo: true,
        canRedo: false,
      };
    });
  },

  undo: () => {
    const { undoStack, redoStack } = get();
    if (undoStack.length === 0) return null;

    const cmd = undoStack[undoStack.length - 1];
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, cmd],
      canUndo: undoStack.length > 1,
      canRedo: true,
    });
    return cmd;
  },

  redo: () => {
    const { redoStack, undoStack } = get();
    if (redoStack.length === 0) return null;

    const cmd = redoStack[redoStack.length - 1];
    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, cmd],
      canUndo: true,
      canRedo: redoStack.length > 1,
    });
    return cmd;
  },

  startBatch: (type, description) => {
    set({ currentBatch: [] });
    // Store batch metadata
    (get() as any)._batchType = type;
    (get() as any)._batchDescription = description;
  },

  addBatchOperation: (op) => {
    set((state) => ({
      currentBatch: state.currentBatch ? [...state.currentBatch, op] : null,
    }));
  },

  commitBatch: () => {
    const ops = get().currentBatch;
    if (!ops || ops.length === 0) {
      set({ currentBatch: null });
      return;
    }

    const type = (get() as any)._batchType || 'BATCH_EDIT';
    const description = (get() as any)._batchDescription || `Batch edit (${ops.length} operations)`;

    get().pushCommand({
      type,
      description,
      operations: ops,
    });

    set({ currentBatch: null });
    delete (get() as any)._batchType;
    delete (get() as any)._batchDescription;
  },

  cancelBatch: () => {
    set({ currentBatch: null });
    delete (get() as any)._batchType;
    delete (get() as any)._batchDescription;
  },

  clearHistory: () => {
    set({ undoStack: [], redoStack: [], canUndo: false, canRedo: false });
  },
}));

/**
 * Helper to create a batch command from an array of operations.
 *
 * @param operations - Array of field-level changes
 * @param type - Command type
 * @param description - Human-readable description
 * @returns The created HistoryCommand
 */
export function createBatchCommand(
  operations: HistoryOperation[],
  type: HistoryCommand['type'] = 'BATCH_EDIT',
  description: string = `Batch edit (${operations.length} operations)`,
): HistoryCommand {
  return {
    id: generateId(),
    type,
    timestamp: Date.now(),
    description,
    operations,
  };
}
