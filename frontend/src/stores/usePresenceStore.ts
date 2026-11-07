/**
 * Global Zustand store for real-time user presence state.
 *
 * This store maintains the presence state of all colleagues currently
 * viewing the same project schedule.  It is updated by the
 * {@link useProjectWebSocket} hook whenever the server broadcasts a
 * {@link ServerEventType.USER_FOCUS_CHANGED} event.
 *
 * Each presence record tracks which WBS node a colleague is inspecting
 * and which UI pane they have open.  The frontend uses this data to
 * render colored avatar rings in the WBS table and Gantt chart, showing
 * at a glance where colleagues are focused.
 *
 * Usage
 * ~~~~~
 *
 * ```tsx
 * const presenceList = usePresenceStore(state => state.presenceList);
 * const getPresenceForNode = usePresenceStore(state => state.getPresenceForNode);
 *
 * // In a WBS row component:
 * const colleagues = getPresenceForNode(node.id);
 * // → renders avatar rings for each colleague inspecting this row
 * ```
 *
 * Data Flow
 * ~~~~~~~~~
 *
 * 1. Server broadcasts ``USER_FOCUS_CHANGED`` → hook calls ``updatePresence()``.
 * 2. Store updates the ``presenceMap`` keyed by ``user_id``.
 * 3. Components subscribing to ``getPresenceForNode`` re-render with
 *    the updated avatar list.
 * 4. When a user disconnects, ``removePresence()`` removes their record.
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Represents a single user's current focus state within a project.
 *
 * This record is received from the server via WebSocket whenever a
 * colleague navigates to a different WBS node or opens a different
 * UI pane.
 */
export interface PresenceRecord {
  /** The user's primary key (database ID). */
  user_id: number;
  /** The user's principal name (email address). */
  user_upn: string;
  /** UUID of the WBS node currently being inspected, or null. */
  node_id: string | null;
  /** The UI pane currently in focus (e.g., 'GANTT', 'WBS_TABLE'). */
  active_pane: string | null;
  /** Unix timestamp of the last heartbeat received. */
  last_heartbeat: number;
}

/**
 * Represents a sub-cell focus state — a specific cell within a WBS row
 * that a colleague is actively editing.
 *
 * Received via CELL_FOCUSED events and cleared by CELL_BLURRED events.
 */
export interface CellFocusRecord {
  /** The user's primary key (database ID). */
  user_id: number;
  /** The user's principal name (email address). */
  user_upn: string;
  /** UUID of the WBS node containing the cell. */
  node_id: string;
  /** Column identifier (e.g., 'planned_start_date'). */
  column_key: string;
  /** Hex color for the focus border. */
  display_color: string;
}

/**
 * Shape of the presence store state and actions.
 */
interface PresenceStore {
  /** Map of user_id → presence record for all active users. */
  presenceMap: Record<number, PresenceRecord>;

  /** The current user's ID (set when WebSocket connects). */
  currentUserId: number | null;

  /**
   * The node ID that the current user is actively editing.
   *
   * When a NODE_MUTATED event arrives for this node, a toast warning
   * is shown instead of a silent cache update.
   */
  editingNodeId: string | null;

  /**
   * List of all active presence records (derived from presenceMap).
   */
  presenceList: PresenceRecord[];

  /**
   * Map of composite key "node_id:column_key" → CellFocusRecord.
   *
   * Tracks which cells are actively being edited by colleagues.
   * Updated by CELL_FOCUSED and CELL_BLURRED events.
   */
  cellFocusMap: Record<string, CellFocusRecord>;

  /**
   * Set the current user's ID on WebSocket connect.
   *
   * @param userId - The authenticated user's database ID.
   */
  setCurrentUserId: (userId: number) => void;

  /**
   * Mark a node as being actively edited by the current user.
   *
   * When the user starts editing a field (e.g., clicking into a date
   * input), this is called so that incoming NODE_MUTATED events for
   * this node trigger a toast warning instead of a silent update.
   *
   * @param nodeId - The UUID of the node being edited, or null to clear.
   */
  setEditingNodeId: (nodeId: string | null) => void;

  /**
   * Update or add a presence record for a colleague.
   *
   * Called by the WebSocket hook when a ``USER_FOCUS_CHANGED`` event
   * is received.  If the user already has a record, it is replaced.
   *
   * @param record - The new presence data.
   */
  updatePresence: (record: PresenceRecord) => void;

  /**
   * Remove a presence record when a user disconnects.
   *
   * Called when a ``USER_FOCUS_CHANGED`` event arrives with ``node_id``
   * set to null, indicating the user has left the project.
   *
   * @param userId - The user ID to remove.
   */
  removePresence: (userId: number) => void;

  /**
   * Clear all presence records (e.g., when navigating away from a project).
   */
  clearAllPresence: () => void;

  /**
   * Get the list of colleagues currently inspecting a specific node.
   *
   * This is the primary query used by WbsTable and GanttBar to render
   * presence avatar rings.
   *
   * @param nodeId - The UUID of the WBS node.
   * @returns Array of presence records for colleagues on this node.
   */
  getPresenceForNode: (nodeId: string) => PresenceRecord[];

  /**
   * Initialize presence from a WELCOME message on connect.
   *
   * When the client first subscribes to a project channel, the server
   * sends a ``WELCOME`` message containing the current presence state
   * of all other users.  This method bulk-loads that state.
   *
   * @param records - Array of presence records from the server.
   */
  setInitialPresence: (records: PresenceRecord[]) => void;

  // Cell focus actions

  /**
   * Record that a colleague has focused a specific cell.
   *
   * Called when a CELL_FOCUSED event is received.
   *
   * @param record - The cell focus record.
   */
  setCellFocus: (record: CellFocusRecord) => void;

  /**
   * Clear a colleague's cell focus.
   *
   * Called when a CELL_BLURRED event is received.
   *
   * @param nodeId - The WBS node ID.
   * @param columnKey - The column identifier.
   */
  clearCellFocus: (nodeId: string, columnKey: string) => void;

  /**
   * Get the cell focus record for a specific cell, excluding the
   * current user.
   *
   * @param nodeId - The WBS node ID.
   * @param columnKey - The column identifier.
   * @returns The colleague editing this cell, or null.
   */
  getCellFocus: (nodeId: string, columnKey: string) => CellFocusRecord | null;

  /**
   * Get all cell focus records for a specific node.
   *
   * @param nodeId - The WBS node ID.
   * @returns Array of cell focus records for colleagues editing cells
   *          on this node.
   */
  getCellFocusesForNode: (nodeId: string) => CellFocusRecord[];

  /**
   * Clear all cell focus records.
   */
  clearAllCellFocus: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Zustand store for real-time presence state.
 *
 * This is a singleton store shared across the entire application.
 * Components subscribe to specific selectors to avoid unnecessary
 * re-renders when unrelated presence data changes.
 */
export const usePresenceStore = create<PresenceStore>((set, get) => ({
  presenceMap: {},
  currentUserId: null,
  editingNodeId: null,
  presenceList: [],
  cellFocusMap: {},

  setCurrentUserId: (userId: number) => {
    set({ currentUserId: userId });
  },

  setEditingNodeId: (nodeId: string | null) => {
    set({ editingNodeId: nodeId });
  },

  updatePresence: (record: PresenceRecord) => {
    const { presenceMap } = get();
    const newMap = { ...presenceMap, [record.user_id]: record };
    set({
      presenceMap: newMap,
      presenceList: Object.values(newMap),
    });
  },

  removePresence: (userId: number) => {
    const { presenceMap } = get();
    const newMap = { ...presenceMap };
    delete newMap[userId];
    set({
      presenceMap: newMap,
      presenceList: Object.values(newMap),
    });
  },

  clearAllPresence: () => {
    set({ presenceMap: {}, presenceList: [] });
  },

  getPresenceForNode: (nodeId: string) => {
    const { presenceMap, currentUserId } = get();
    return Object.values(presenceMap).filter(
      (record) =>
        record.node_id === nodeId &&
        record.user_id !== currentUserId,
    );
  },

  setInitialPresence: (records: PresenceRecord[]) => {
    const map: Record<number, PresenceRecord> = {};
    for (const record of records) {
      map[record.user_id] = record;
    }
    set({
      presenceMap: map,
      presenceList: records,
    });
  },

  // Cell focus actions

  setCellFocus: (record: CellFocusRecord) => {
    const { cellFocusMap } = get();
    const key = `${record.node_id}:${record.column_key}`;
    set({
      cellFocusMap: { ...cellFocusMap, [key]: record },
    });
  },

  clearCellFocus: (nodeId: string, columnKey: string) => {
    const { cellFocusMap } = get();
    const key = `${nodeId}:${columnKey}`;
    const newMap = { ...cellFocusMap };
    delete newMap[key];
    set({ cellFocusMap: newMap });
  },

  getCellFocus: (nodeId: string, columnKey: string) => {
    const { cellFocusMap, currentUserId } = get();
    const key = `${nodeId}:${columnKey}`;
    const record = cellFocusMap[key];
    if (record && record.user_id === currentUserId) {
      return null;
    }
    return record || null;
  },

  getCellFocusesForNode: (nodeId: string) => {
    const { cellFocusMap, currentUserId } = get();
    return Object.values(cellFocusMap).filter(
      (record) => record.node_id === nodeId && record.user_id !== currentUserId,
    );
  },

  clearAllCellFocus: () => {
    set({ cellFocusMap: {} });
  },
}));
