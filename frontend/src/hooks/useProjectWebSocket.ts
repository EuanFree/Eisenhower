/**
 * React hook for real-time project collaboration via WebSocket.
 *
 * This hook manages the WebSocket connection to the server's presence
 * and cache invalidation endpoint.  It handles:
 *
 * 1. **Connection lifecycle** — Connects when a project is viewed,
 *    reconnects on failure, and disconnects when navigating away.
 * 2. **Heartbeat protocol** — Sends ``HEARTBEAT`` messages every 15
 *    seconds with the current user's focus state (node_id, active_pane).
 * 3. **Event routing** — Routes incoming server events to the appropriate
 *    store: presence updates go to ``usePresenceStore``, node mutations
 *    go to ``useScheduleStore``, and concurrent-edit conflicts trigger
 *    a toast warning.
 * 4. **Reconnection** — Automatically reconnects with exponential backoff
 *    if the WebSocket connection drops.
 *
 * Usage
 * ~~~~~
 *
 * ```tsx
 * // In AppShell or a project-level layout:
 * const { isConnected } = useProjectWebSocket(projectId);
 *
 * // In WbsTable or GanttBar, update focus on row click:
 * const { setFocus } = useProjectWebSocket();
 * const handleRowClick = (nodeId: string) => {
 *   setFocus(nodeId, 'WBS_TABLE');
 * };
 * ```
 *
 * Connection URL
 * ~~~~~~~~~~~~~~
 *
 * The hook connects to:
 *
 * ```
 * ws://localhost:8000/ws/projects/{projectId}?token={jwtToken}
 * ```
 *
 * The JWT token is read from ``localStorage`` (key: ``access_token``).
 * If no token is found, the hook remains disconnected.
 *
 * Heartbeat Protocol
 * ~~~~~~~~~~~~~~~~~~
 *
 * Every 15 seconds, the hook sends:
 *
 * ```json
 * {
 *   "type": "HEARTBEAT",
 *   "node_id": "abc-123",
 *   "active_pane": "GANTT"
 * }
 * ```
 *
 * The server uses this to update the user's presence state and detect
 * stale connections (no heartbeat within 30 seconds).
 *
 * Event Handling
 * ~~~~~~~~~~~~~~
 *
 * | Event                | Action                                          |
 * |----------------------|-------------------------------------------------|
 * | WELCOME              | Load initial presence state                     |
 * | USER_FOCUS_CHANGED   | Update presence store                           |
 * | NODE_MUTATED         | Patch schedule store or show toast              |
 * | NODE_CREATED         | Add to schedule store                           |
 * | NODE_DELETED         | Remove from schedule store                      |
 * | BLOCKER_CREATED      | Refresh blocker list                            |
 * | BLOCKER_RESOLVED     | Refresh blocker list                            |
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { usePresenceStore } from '../stores/usePresenceStore';
import { useScheduleStore } from '../stores/useScheduleStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Server-to-client event types.
 */
export enum ServerEventType {
  WELCOME = 'WELCOME',
  USER_FOCUS_CHANGED = 'USER_FOCUS_CHANGED',
  NODE_MUTATED = 'NODE_MUTATED',
  NODE_CREATED = 'NODE_CREATED',
  NODE_DELETED = 'NODE_DELETED',
  BLOCKER_CREATED = 'BLOCKER_CREATED',
  BLOCKER_RESOLVED = 'BLOCKER_RESOLVED',
  CRITICAL_STOPPAGE_ESCALATED = 'CRITICAL_STOPPAGE_ESCALATED',
  CELL_FOCUSED = 'CELL_FOCUSED',
  CELL_BLURRED = 'CELL_BLURRED',
  SOFT_LOCK_WARNING = 'SOFT_LOCK_WARNING',
  ERROR = 'ERROR',
}

/**
 * Shape of a WELCOME message from the server.
 */
interface WelcomeMessage {
  event: ServerEventType.WELCOME;
  project_id: string;
  presence: Array<{
    user_id: number;
    user_upn: string;
    node_id: string | null;
    active_pane: string | null;
    last_heartbeat: number;
  }>;
}

/**
 * Shape of a USER_FOCUS_CHANGED message.
 */
interface FocusChangedMessage {
  event: ServerEventType.USER_FOCUS_CHANGED;
  user_id: number;
  user_upn: string;
  node_id: string | null;
  active_pane: string | null;
}

/**
 * Shape of a NODE_MUTATED message.
 */
interface NodeMutatedMessage {
  event: ServerEventType.NODE_MUTATED;
  node_id: string;
  path: string;
  updated_fields: string[];
  new_version_id: number;
  actor_upn: string;
}

/**
 * Shape of a NODE_CREATED message.
 */
interface NodeCreatedMessage {
  event: ServerEventType.NODE_CREATED;
  node_id: string;
  path: string;
  parent_id: string | null;
  actor_upn: string;
}

/**
 * Shape of a NODE_DELETED message.
 */
interface NodeDeletedMessage {
  event: ServerEventType.NODE_DELETED;
  node_id: string;
  path: string;
  actor_upn: string;
}

/**
 * Shape of a BLOCKER_CREATED message.
 */
interface BlockerCreatedMessage {
  event: ServerEventType.BLOCKER_CREATED;
  node_id: string;
  blocker_id: string;
  category: string;
  severity: string;
  actor_upn: string;
}

/**
 * Shape of a BLOCKER_RESOLVED message.
 */
interface BlockerResolvedMessage {
  event: ServerEventType.BLOCKER_RESOLVED;
  node_id: string;
  blocker_id: string;
  actor_upn: string;
}

/**
 * Shape of a CRITICAL_STOPPAGE_ESCALATED message.
 * Broadcast when a critical path stoppage is escalated under delegated authority.
 */
interface CriticalStoppageEscalatedMessage {
  event: ServerEventType.CRITICAL_STOPPAGE_ESCALATED;
  blocker_id: string;
  node_id: string;
  task_code: string;
  task_name: string;
  delegator_upn: string;
  delegatee_upn: string;
  cam_upn: string;
  escalated_at: string;
  sla_deadline: string;
  root_cause: string;
  operational_impact_hours: number;
  driving_path_tf: number;
  evidence_files: string[];
}

/**
 * Shape of a CELL_FOCUSED message.
 */
interface CellFocusedMessage {
  event: ServerEventType.CELL_FOCUSED;
  user_id: number;
  user_upn: string;
  node_id: string;
  column_key: string;
  display_color: string;
}

/**
 * Shape of a CELL_BLURRED message.
 */
interface CellBlurredMessage {
  event: ServerEventType.CELL_BLURRED;
  user_id: number;
  node_id: string;
  column_key: string;
}

/**
 * Shape of a SOFT_LOCK_WARNING message.
 */
interface SoftLockWarningMessage {
  event: ServerEventType.SOFT_LOCK_WARNING;
  holder_user_id: number;
  holder_upn: string;
  node_id: string;
  column_key: string;
}

/**
 * Union type for all server messages.
 */
type ServerMessage =
  | WelcomeMessage
  | FocusChangedMessage
  | NodeMutatedMessage
  | NodeCreatedMessage
  | NodeDeletedMessage
  | BlockerCreatedMessage
  | BlockerResolvedMessage
  | CriticalStoppageEscalatedMessage
  | CellFocusedMessage
  | CellBlurredMessage
  | SoftLockWarningMessage;

/**
 * Return type of the useProjectWebSocket hook.
 */
interface UseProjectWebSocketReturn {
  /** Whether the WebSocket is currently connected. */
  isConnected: boolean;
  /** The current connection attempt number (for reconnection display). */
  reconnectAttempts: number;
  /**
   * Update the focus state sent in heartbeats.
   *
   * Call this when the user clicks on a row or opens a pane so the
   * server knows which node they're inspecting.
   *
   * @param nodeId - The UUID of the node being inspected.
   * @param activePane - The UI pane in focus.
   */
  setFocus: (nodeId: string | null, activePane?: string) => void;
  /**
   * Mark a node as being actively edited.
   *
   * When the user starts editing a field, call this so that incoming
   * NODE_MUTATED events for this node trigger a toast warning.
   *
   * @param nodeId - The UUID of the node being edited, or null to clear.
   */
  setEditing: (nodeId: string | null) => void;
  /**
   * Notify the server that the user has focused a specific cell.
   *
   * Call this when the user double-clicks a cell to start editing.
   * The server broadcasts this to other viewers and checks for
   * soft-lock collisions.
   *
   * @param nodeId - The WBS node ID.
   * @param columnKey - The column identifier.
   * @param displayColor - Optional hex color for the focus border.
   */
  setCellFocus: (nodeId: string, columnKey: string, displayColor?: string) => void;
  /**
   * Notify the server that the user has blurred a cell.
   *
   * Call this when the user finishes editing (commit, revert, escape).
   *
   * @param nodeId - The WBS node ID.
   * @param columnKey - The column identifier.
   */
  clearCellFocus: (nodeId: string, columnKey: string) => void;
  /**
   * Manually disconnect the WebSocket.
   *
   * Call this when navigating away from a project to stop receiving
   * events and free server resources.
   */
  disconnect: () => void;
  /**
   * Callback for soft-lock warnings.
   *
   * Set this to receive notifications when the user attempts to edit
   * a cell already focused by a colleague.
   */
  onSoftLockWarning: ((holderUpn: string, nodeId: string, columnKey: string) => void) | null;
  /**
   * Set the soft-lock warning callback.
   */
  setSoftLockCallback: (cb: ((holderUpn: string, nodeId: string, columnKey: string) => void) | null) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Interval between heartbeat messages (15 seconds). */
const HEARTBEAT_INTERVAL = 15_000;

/** Maximum reconnection delay (30 seconds). */
const MAX_RECONNECT_DELAY = 30_000;

/** Base reconnection delay (1 second). */
const BASE_RECONNECT_DELAY = 1_000;

/**
 * Get the WebSocket URL for a project channel.
 *
 * @param projectId - The UUID of the project.
 * @returns The full WebSocket URL with JWT token.
 */
function getWebSocketUrl(projectId: string): string | null {
  const token = localStorage.getItem('access_token');
  if (!token) return null;

  // Determine the protocol based on the current location
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host || 'localhost:8000';
  return `${protocol}//${host}/ws/projects/${projectId}?token=${token}`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook for real-time project collaboration via WebSocket.
 *
 * Connects to the server's WebSocket endpoint when ``projectId`` is
 * provided and manages the entire connection lifecycle: authentication,
 * heartbeat, event routing, and reconnection.
 *
 * @param projectId - The UUID of the project to subscribe to. Pass
 *                    ``null`` or ``undefined`` to stay disconnected.
 * @returns Object with connection state and control methods.
 */
export function useProjectWebSocket(
  projectId: string | null,
): UseProjectWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const focusNodeRef = useRef<string | null>(null);
  const focusPaneRef = useRef<string>('WBS_TABLE');
  const softLockCallbackRef = useRef<((holderUpn: string, nodeId: string, columnKey: string) => void) | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Store actions
  const setCurrentUserId = usePresenceStore(
    (state) => state.setCurrentUserId,
  );
  const setEditingNodeId = usePresenceStore(
    (state) => state.setEditingNodeId,
  );
  const updatePresence = usePresenceStore(
    (state) => state.updatePresence,
  );
  const removePresence = usePresenceStore(
    (state) => state.removePresence,
  );
  const setInitialPresence = usePresenceStore(
    (state) => state.setInitialPresence,
  );
  const clearAllPresence = usePresenceStore(
    (state) => state.clearAllPresence,
  );
  const editingNodeId = usePresenceStore(
    (state) => state.editingNodeId,
  );

  // Cell focus store actions
  const setCellFocusStore = usePresenceStore(
    (state) => state.setCellFocus,
  );
  const clearCellFocusStore = usePresenceStore(
    (state) => state.clearCellFocus,
  );
  const clearAllCellFocusStore = usePresenceStore(
    (state) => state.clearAllCellFocus,
  );

  // Schedule store actions
  const refreshRow = useScheduleStore((state) => state.refreshRow);
  const loadTree = useScheduleStore((state) => state.loadTree);

  // -----------------------------------------------------------------------
  // Event handlers
  // -----------------------------------------------------------------------

  const handleServerMessage = useCallback(
    (raw: string) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(raw);
      } catch {
        console.warn('[WS] Invalid JSON:', raw.slice(0, 100));
        return;
      }

      switch (message.event) {
        case ServerEventType.WELCOME: {
          const msg = message as WelcomeMessage;
          setInitialPresence(msg.presence);
          console.log('[WS] Connected to project:', msg.project_id);
          break;
        }

        case ServerEventType.USER_FOCUS_CHANGED: {
          const msg = message as FocusChangedMessage;
          if (msg.node_id === null) {
            // User disconnected
            removePresence(msg.user_id);
          } else {
            updatePresence({
              user_id: msg.user_id,
              user_upn: msg.user_upn,
              node_id: msg.node_id,
              active_pane: msg.active_pane,
              last_heartbeat: Date.now() / 1000,
            });
          }
          break;
        }

        case ServerEventType.NODE_MUTATED: {
          const msg = message as NodeMutatedMessage;
          // If the current user is editing this node, show a toast warning
          if (editingNodeId === msg.node_id) {
            console.warn(
              '[WS] Colleague modified node you are editing:',
              msg.node_id,
              'by',
              msg.actor_upn,
            );
            // In a real app, trigger a toast notification here
            // For now, log to console — the ConflictResolutionModal
            // can be triggered by the schedule store's updateNode method
          } else {
            // Silently patch the local cache
            refreshRow(msg.node_id);
          }
          break;
        }

        case ServerEventType.NODE_CREATED: {
          const msg = message as NodeCreatedMessage;
          console.log('[WS] Node created:', msg.node_id, 'by', msg.actor_upn);
          // Reload the tree to include the new node
          if (projectId) {
            loadTree(projectId);
          }
          break;
        }

        case ServerEventType.NODE_DELETED: {
          const msg = message as NodeDeletedMessage;
          console.log('[WS] Node deleted:', msg.node_id, 'by', msg.actor_upn);
          // Remove from local cache
          refreshRow(msg.node_id);
          break;
        }

        case ServerEventType.BLOCKER_CREATED: {
          const msg = message as BlockerCreatedMessage;
          console.log(
            '[WS] Blocker created on',
            msg.node_id,
            ':',
            msg.category,
            '(',
            msg.severity,
            ')',
          );
          refreshRow(msg.node_id);
          break;
        }

        case ServerEventType.BLOCKER_RESOLVED: {
          const msg = message as BlockerResolvedMessage;
          console.log('[WS] Blocker resolved on', msg.node_id);
          refreshRow(msg.node_id);
          break;
        }

        case ServerEventType.CRITICAL_STOPPAGE_ESCALATED: {
          const msg = message as CriticalStoppageEscalatedMessage;
          console.log(
            '[WS] Critical stoppage escalated:',
            msg.task_code,
            '—',
            msg.task_name,
          );
          // Dispatch as a custom event so components outside the WebSocket
          // hook (e.g., DailyCockpitView) can react to the escalation
          window.dispatchEvent(
            new CustomEvent('stoppage-escalated', { detail: msg }),
          );
          break;
        }

        case ServerEventType.CELL_FOCUSED: {
          const msg = message as CellFocusedMessage;
          setCellFocusStore({
            user_id: msg.user_id,
            user_upn: msg.user_upn,
            node_id: msg.node_id,
            column_key: msg.column_key,
            display_color: msg.display_color,
          });
          break;
        }

        case ServerEventType.CELL_BLURRED: {
          const msg = message as CellBlurredMessage;
          clearCellFocusStore(msg.node_id, msg.column_key);
          break;
        }

        case ServerEventType.SOFT_LOCK_WARNING: {
          const msg = message as SoftLockWarningMessage;
          console.warn(
            '[WS] Soft lock: cell edited by',
            msg.holder_upn,
            'on',
            msg.node_id,
            msg.column_key,
          );
          softLockCallbackRef.current?.(
            msg.holder_upn,
            msg.node_id,
            msg.column_key,
          );
          break;
        }

        case ServerEventType.ERROR as any:
          console.error('[WS] Server error:', raw);
          break;
      }
    },
    [
      editingNodeId,
      projectId,
      updatePresence,
      removePresence,
      setInitialPresence,
      refreshRow,
      loadTree,
      setCellFocusStore,
      clearCellFocusStore,
    ],
  );

  // -----------------------------------------------------------------------
  // Connection management
  // -----------------------------------------------------------------------

  const connect = useCallback(() => {
    if (!projectId) return;

    const url = getWebSocketUrl(projectId);
    if (!url) {
      console.warn('[WS] No JWT token found, cannot connect');
      return;
    }

    // Close any existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
      setReconnectAttempts(0);
      console.log('[WS] Connection established');

      // Subscribe to the project channel
      ws.send(
        JSON.stringify({
          type: 'SUBSCRIBE',
          project_id: projectId,
        }),
      );

      // Start heartbeat
      heartbeatTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'HEARTBEAT',
              node_id: focusNodeRef.current,
              active_pane: focusPaneRef.current,
            }),
          );
        }
      }, HEARTBEAT_INTERVAL);
    };

    ws.onmessage = (event: MessageEvent) => {
      handleServerMessage(event.data);
    };

    ws.onclose = (event: CloseEvent) => {
      setIsConnected(false);
      clearInterval(heartbeatTimerRef.current ?? undefined);
      heartbeatTimerRef.current = null;

      console.log('[WS] Connection closed:', event.code, event.reason);

      // Attempt reconnection with exponential backoff
      if (event.code !== 1000 && projectId) {
        const attempts = reconnectAttemptsRef.current + 1;
        reconnectAttemptsRef.current = attempts;
        setReconnectAttempts(attempts);

        const delay = Math.min(
          BASE_RECONNECT_DELAY * Math.pow(2, attempts - 1),
          MAX_RECONNECT_DELAY,
        );

        console.log(`[WS] Reconnecting in ${delay / 1000}s (attempt ${attempts})`);
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    };

    ws.onerror = (error: Event) => {
      console.error('[WS] Connection error:', error);
    };
  }, [projectId, handleServerMessage]);

  const disconnect = useCallback(() => {
    // Clear timers
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnecting');
      wsRef.current = null;
    }

    setIsConnected(false);
    clearAllPresence();
    clearAllCellFocusStore();
    reconnectAttemptsRef.current = 0;
    setReconnectAttempts(0);
  }, [clearAllPresence, clearAllCellFocusStore]);

  // -----------------------------------------------------------------------
  // Focus control
  // -----------------------------------------------------------------------

  const setFocus = useCallback(
    (nodeId: string | null, activePane?: string) => {
      focusNodeRef.current = nodeId;
      if (activePane) {
        focusPaneRef.current = activePane;
      }
    },
    [],
  );

  const setEditing = useCallback(
    (nodeId: string | null) => {
      setEditingNodeId(nodeId);
    },
    [setEditingNodeId],
  );

  // -----------------------------------------------------------------------
  // Cell focus control (with 100ms debounce)
  // -----------------------------------------------------------------------

  const cellFocusDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setCellFocus = useCallback(
    (nodeId: string, columnKey: string, displayColor?: string) => {
      if (!projectId || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return;
      }
      // Debounce: coalesce rapid focus changes
      if (cellFocusDebounceRef.current) {
        clearTimeout(cellFocusDebounceRef.current);
      }
      cellFocusDebounceRef.current = setTimeout(() => {
        wsRef.current?.send(
          JSON.stringify({
            type: 'CELL_FOCUSED',
            project_id: projectId,
            node_id: nodeId,
            column_key: columnKey,
            display_color: displayColor,
          }),
        );
      }, 100);
    },
    [projectId],
  );

  const clearCellFocus = useCallback(
    (nodeId: string, columnKey: string) => {
      if (!projectId || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return;
      }
      if (cellFocusDebounceRef.current) {
        clearTimeout(cellFocusDebounceRef.current);
        cellFocusDebounceRef.current = null;
      }
      wsRef.current.send(
        JSON.stringify({
          type: 'CELL_BLURRED',
          project_id: projectId,
          node_id: nodeId,
          column_key: columnKey,
        }),
      );
    },
    [projectId],
  );

  const setSoftLockCallback = useCallback(
    (cb: ((holderUpn: string, nodeId: string, columnKey: string) => void) | null) => {
      softLockCallbackRef.current = cb;
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Effect: connect/disconnect on projectId change
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (projectId) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [projectId, connect, disconnect]);

  return {
    isConnected,
    reconnectAttempts,
    setFocus,
    setEditing,
    setCellFocus,
    clearCellFocus,
    disconnect,
    onSoftLockWarning: softLockCallbackRef.current,
    setSoftLockCallback,
  };
}
