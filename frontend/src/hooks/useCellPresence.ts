/**
 * useCellPresence Hook — Granular Sub-Cell Focus Broadcasting
 *
 * Consolidates cell-level presence broadcasting and peer presence reading
 * for the virtualized WBS grid. This hook bridges the WebSocket layer
 * (useProjectWebSocket) with the presence state layer (usePresenceStore)
 * to provide a single interface for:
 *
 * 1. **Focus Emission** — Debounced (100ms) CELL_FOCUSED payload via WebSocket
 *    on cell activation (onFocus, onDoubleClick).
 * 2. **Blur Emission** — CELL_BLURRED payload on blur or edit completion.
 * 3. **Peer Presence Reading** — Query which cells are actively edited by
 *    colleagues, for rendering visual presence indicators.
 * 4. **Soft-Lock Checking** — Determine whether a cell is currently focused
 *    by a peer, blocking concurrent inline edit activation.
 *
 * WebSocket Protocol
 * ------------------
 *
 * Outgoing (client → server):
 *
 * ```json
 * { "type": "CELL_FOCUSED", "projectId": "...", "nodeId": "...", "columnKey": "...", "userUpn": "...", "color": "#38BDF8" }
 * { "type": "CELL_BLURRED", "projectId": "...", "nodeId": "...", "columnKey": "..." }
 * ```
 *
 * Incoming (server → client, broadcast to peers):
 *
 * ```json
 * { "event": "CELL_FOCUSED", "user_id": 2, "user_upn": "colleague@org.uk", "node_id": "...", "column_key": "...", "display_color": "#34D399" }
 * { "event": "CELL_BLURRED", "user_id": 2, "node_id": "...", "column_key": "..." }
 * { "event": "SOFT_LOCK_WARNING", "holder_user_id": 1, "holder_upn": "you@org.uk", "node_id": "...", "column_key": "..." }
 * ```
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    const cellPresence = useCellPresence(projectId);
 *
 *    // On double-click to start editing:
 *    const handleDoubleClick = (nodeId: string, columnKey: string) => {
 *      // Check soft-lock before allowing edit
 *      const blocker = cellPresence.getCellFocus(nodeId, columnKey);
 *      if (blocker) {
 *        // Show ephemeral tooltip — cell is locked by peer
 *        return;
 *      }
 *      cellPresence.setCellFocus(nodeId, columnKey);
 *      startInlineEdit(nodeId, columnKey);
 *    };
 *
 *    // On blur / edit complete:
 *    const handleBlur = (nodeId: string, columnKey: string) => {
 *      cellPresence.clearCellFocus(nodeId, columnKey);
 *    };
 *
 *    // In cell renderer, check for peer focus:
 *    const peerFocus = cellPresence.getCellFocus(nodeId, columnKey);
 *    if (peerFocus) {
 *      return <CellFocusIndicator cellFocus={peerFocus}>{value}</CellFocusIndicator>;
 *    }
 */

import { useCallback, useRef } from 'react';
import { usePresenceStore, CellFocusRecord } from '../stores/usePresenceStore';
import { useProjectWebSocket } from './useProjectWebSocket';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Return type of the useCellPresence hook.
 */
export interface UseCellPresenceReturn {
  /**
   * Notify the server that the current user has focused a specific cell.
   *
   * Emits a debounced (100ms) CELL_FOCUSED payload via WebSocket.
   * Call this when the user double-clicks a cell to start editing.
   *
   * @param nodeId - The WBS node ID.
   * @param columnKey - The column identifier (e.g., 'planned_start_date').
   */
  setCellFocus: (nodeId: string, columnKey: string) => void;

  /**
   * Notify the server that the current user has blurred a cell.
   *
   * Emits a CELL_BLURRED payload via WebSocket.
   * Call this when the user finishes editing (commit, revert, escape).
   *
   * @param nodeId - The WBS node ID.
   * @param columnKey - The column identifier.
   */
  clearCellFocus: (nodeId: string, columnKey: string) => void;

  /**
   * Get the cell focus record for a specific cell, excluding the
   * current user.
   *
   * Returns the colleague editing this cell, or null if no peer
   * is focused on this cell.
   *
   * @param nodeId - The WBS node ID.
   * @param columnKey - The column identifier.
   * @returns The CellFocusRecord of the peer editing this cell, or null.
   */
  getCellFocus: (nodeId: string, columnKey: string) => CellFocusRecord | null;

  /**
   * Get all cell focus records for a specific node.
   *
   * Useful for rendering presence indicators on all cells of a row.
   *
   * @param nodeId - The WBS node ID.
   * @returns Array of CellFocusRecord for peers editing cells on this node.
   */
  getCellFocusesForNode: (nodeId: string) => CellFocusRecord[];

  /**
   * Check whether a cell is soft-locked by a peer.
   *
   * Returns true if another user is actively editing this cell,
   * meaning the current user should not be allowed to start editing.
   *
   * @param nodeId - The WBS node ID.
   * @param columnKey - The column identifier.
   * @returns True if the cell is soft-locked by a peer.
   */
  isCellSoftLocked: (nodeId: string, columnKey: string) => boolean;

  /**
   * Get the UPN of the user who soft-locks a cell.
   *
   * @param nodeId - The WBS node ID.
   * @param columnKey - The column identifier.
   * @returns The UPN of the locking user, or null.
   */
  getSoftLockHolder: (nodeId: string, columnKey: string) => string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Custom hook for granular sub-cell focus broadcasting and concurrent
 * editing soft-locks.
 *
 * This hook wraps the WebSocket cell focus methods and the presence
 * store cell focus queries into a single, cohesive interface.
 *
 * @param projectId - The project ID for WebSocket connection. Pass
 *                    the same value used for useProjectWebSocket.
 * @returns Object with cell focus control and query methods.
 */
export function useCellPresence(projectId: string | null): UseCellPresenceReturn {
  // WebSocket hook for emitting focus/blur events
  const ws = useProjectWebSocket(projectId);

  // Presence store for reading peer cell focus state
  const getCellFocusStore = usePresenceStore((s) => s.getCellFocus);
  const getCellFocusesForNodeStore = usePresenceStore((s) => s.getCellFocusesForNode);

  // Track the last focused cell to avoid redundant emissions
  const lastFocusedRef = useRef<{ nodeId: string; columnKey: string } | null>(null);

  /**
   * Set cell focus — emits debounced CELL_FOCUSED via WebSocket.
   *
   * The 100ms debounce is handled internally by useProjectWebSocket.
   * We also track the last focused cell to skip redundant calls.
   */
  const setCellFocus = useCallback(
    (nodeId: string, columnKey: string) => {
      const last = lastFocusedRef.current;
      // Skip if already focused on this cell
      if (last?.nodeId === nodeId && last?.columnKey === columnKey) {
        return;
      }
      lastFocusedRef.current = { nodeId, columnKey };
      ws.setCellFocus(nodeId, columnKey);
    },
    [ws],
  );

  /**
   * Clear cell focus — emits CELL_BLURRED via WebSocket.
   *
   * Clears the debounce timer and immediately sends the blur event.
   */
  const clearCellFocus = useCallback(
    (nodeId: string, columnKey: string) => {
      const last = lastFocusedRef.current;
      if (last?.nodeId === nodeId && last?.columnKey === columnKey) {
        lastFocusedRef.current = null;
      }
      ws.clearCellFocus(nodeId, columnKey);
    },
    [ws],
  );

  /**
   * Query peer cell focus for a specific cell.
   *
   * Reads from the presence store, which is updated by incoming
   * CELL_FOCUSED events from the server.
   */
  const getCellFocus = useCallback(
    (nodeId: string, columnKey: string): CellFocusRecord | null => {
      return getCellFocusStore(nodeId, columnKey);
    },
    [getCellFocusStore],
  );

  /**
   * Query all peer cell focuses for a specific node.
   */
  const getCellFocusesForNode = useCallback(
    (nodeId: string): CellFocusRecord[] => {
      return getCellFocusesForNodeStore(nodeId);
    },
    [getCellFocusesForNodeStore],
  );

  /**
   * Check if a cell is soft-locked by a peer.
   *
   * Returns true if another user is actively editing this cell.
   */
  const isCellSoftLocked = useCallback(
    (nodeId: string, columnKey: string): boolean => {
      return getCellFocusStore(nodeId, columnKey) !== null;
    },
    [getCellFocusStore],
  );

  /**
   * Get the UPN of the user who soft-locks a cell.
   */
  const getSoftLockHolder = useCallback(
    (nodeId: string, columnKey: string): string | null => {
      const record = getCellFocusStore(nodeId, columnKey);
      return record?.user_upn ?? null;
    },
    [getCellFocusStore],
  );

  return {
    setCellFocus,
    clearCellFocus,
    getCellFocus,
    getCellFocusesForNode,
    isCellSoftLocked,
    getSoftLockHolder,
  };
}
