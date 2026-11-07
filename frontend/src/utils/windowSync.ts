/**
 * Window Synchronization Utility — Multi-Window State Sync via BroadcastChannel
 *
 * Enables popping out the Gantt Chart, Monte Carlo Dashboard, or Daily Cockpit
 * into standalone browser windows (window.open()) while maintaining real-time
 * state synchronization between the parent and detached windows.
 *
 * Architecture
 * ------------
 *
 * Uses the BroadcastChannel API with channel name 'defence_ppm_bus' to
 * broadcast state changes between all open windows of the same origin.
 * Each window registers as either a 'primary' (parent) or 'detached' (popup)
 * instance.
 *
 * Synchronized State
 * ------------------
 *
 * - Row selections: Clicking a row in the WBS table updates all detached views.
 * - Zoom adjustments: Changing Gantt zoom level propagates to all windows.
 * - Date mutations: Inline edits or bulk shifts update all windows without latency.
 * - Filter state: Filter tokens and visualization mode sync across windows.
 *
 * Message Protocol
 * ----------------
 *
 * All messages follow a typed envelope pattern:
 *
 * .. code-block:: json
 *
 *    {
 *      "type": "STATE_SYNC",
 *      "category": "SELECTION" | "ZOOM" | "DATE_MUTATION" | "FILTER" | "HEARTBEAT",
 *      "payload": { ... },
 *      "timestamp": 1698234567890,
 *      "sourceWindowId": "uuid"
 *    }
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    // In a component that should sync across windows:
 *    const { broadcast, windowId } = useWindowSync();
 *
 *    // When state changes:
 *    broadcast('SELECTION', { nodeId: 'uuid-123' });
 *
 *    // To pop out a view:
 *    const { popOutView } = useWindowSync();
 *    popOutView('gantt', { projectId: 'uuid', viewState: currentView });
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Categories of state that can be synchronized across windows.
 */
export type SyncCategory =
  | 'SELECTION'
  | 'ZOOM'
  | 'DATE_MUTATION'
  | 'FILTER'
  | 'HEARTBEAT'
  | 'VIEW_STATE'
  | 'CLOSE_WINDOW';

/**
 * Payload types for each sync category.
 */
export interface SyncPayloads {
  SELECTION: {
    nodeId: string | null;
    nodeIds?: string[];
  };
  ZOOM: {
    level: 'DAYS' | 'WEEKS' | 'MONTHS';
  };
  DATE_MUTATION: {
    nodeId: string;
    field: string;
    oldValue: string | number | null;
    newValue: string | number | null;
  };
  FILTER: {
    tokens: string;
    mode: 'FILTER' | 'DIM';
  };
  HEARTBEAT: {
    windowId: string;
    viewType: string;
  };
  VIEW_STATE: {
    viewType: 'GANTT' | 'MONTE_CARLO' | 'COCKPIT';
    state: Record<string, unknown>;
  };
  CLOSE_WINDOW: {
    windowId: string;
  };
}

/**
 * A typed message envelope for inter-window communication.
 */
export interface SyncMessage<T extends SyncCategory = SyncCategory> {
  /** Message type discriminator */
  type: 'STATE_SYNC';
  /** Category of state being synchronized */
  category: T;
  /** Category-specific payload */
  payload: SyncPayloads[T];
  /** Unix timestamp when the message was created */
  timestamp: number;
  /** Unique identifier of the source window */
  sourceWindowId: string;
}

/**
 * Initial view state passed to a newly opened detached window.
 */
export interface DetachedViewState {
  /** Type of view being detached */
  viewType: 'GANTT' | 'MONTE_CARLO' | 'COCKPIT';
  /** Current project ID */
  projectId: string;
  /** Current zoom level */
  zoomLevel: 'DAYS' | 'WEEKS' | 'MONTHS';
  /** Currently selected node ID */
  selectedNodeId: string | null;
  /** Current filter tokens */
  filterTokens: string;
  /** Current filter mode */
  filterMode: 'FILTER' | 'DIM';
  /** JWT token for API authentication */
  authToken: string;
  /** Base URL of the backend API */
  apiBaseUrl: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** BroadcastChannel name for inter-window communication */
const CHANNEL_NAME = 'defence_ppm_bus';

/** Heartbeat interval in milliseconds (5 seconds) */
const HEARTBEAT_INTERVAL = 5000;

/** Stale window timeout in milliseconds (15 seconds) */
const STALE_TIMEOUT = 15000;

// ---------------------------------------------------------------------------
// Window ID Generator
// ---------------------------------------------------------------------------

/**
 * Generate a unique window identifier.
 */
function generateWindowId(): string {
  return `win-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Window Sync Service
// ---------------------------------------------------------------------------

/**
 * Singleton window sync service.
 *
 * Manages the BroadcastChannel connection, heartbeat tracking,
 * and message broadcasting/reception.
 */
class WindowSyncService {
  private channel: BroadcastChannel | null = null;
  private windowId: string;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private staleCheckTimer: ReturnType<typeof setInterval> | null = null;
  private activeWindows: Map<string, { lastHeartbeat: number; viewType: string }> = new Map();
  private listeners: Map<SyncCategory, Set<(payload: SyncPayloads[SyncCategory]) => void>> = new Map();
  private isPrimary: boolean = true;

  constructor() {
    this.windowId = generateWindowId();
    this.initChannel();
  }

  /**
   * Initialize the BroadcastChannel connection.
   */
  private initChannel(): void {
    if (typeof BroadcastChannel === 'undefined') {
      console.warn('[WindowSync] BroadcastChannel not supported; multi-window sync disabled.');
      return;
    }

    this.channel = new BroadcastChannel(CHANNEL_NAME);

    this.channel.onmessage = (event: MessageEvent<SyncMessage>) => {
      this.handleMessage(event.data);
    };

    // Start heartbeat and stale check
    this.startHeartbeat();
    this.startStaleCheck();
  }

  /**
   * Handle an incoming message from another window.
   */
  private handleMessage(message: SyncMessage): void {
    // Ignore messages from self
    if (message.sourceWindowId === this.windowId) return;

    // Track heartbeats
    if (message.category === 'HEARTBEAT') {
      this.activeWindows.set(message.sourceWindowId, {
        lastHeartbeat: message.timestamp,
        viewType: (message.payload as any).viewType,
      });
      return;
    }

    // Notify registered listeners
    const categoryListeners = this.listeners.get(message.category);
    if (categoryListeners) {
      for (const listener of categoryListeners) {
        try {
          listener(message.payload as SyncPayloads[SyncCategory]);
        } catch (error) {
          console.error(`[WindowSync] Listener error for ${message.category}:`, error);
        }
      }
    }
  }

  /**
   * Broadcast a state change to all connected windows.
   */
  public broadcast<T extends SyncCategory>(
    category: T,
    payload: SyncPayloads[T],
  ): void {
    if (!this.channel) return;

    const message: SyncMessage<T> = {
      type: 'STATE_SYNC',
      category,
      payload,
      timestamp: Date.now(),
      sourceWindowId: this.windowId,
    };

    this.channel.postMessage(message);
  }

  /**
   * Register a listener for a specific sync category.
   *
   * @param category - The sync category to listen for
   * @param listener - Callback function invoked when a message arrives
   * @returns Unsubscribe function
   */
  public on<T extends SyncCategory>(
    category: T,
    listener: (payload: SyncPayloads[T]) => void,
  ): () => void {
    if (!this.listeners.has(category)) {
      this.listeners.set(category, new Set());
    }
    this.listeners.get(category)!.add(listener as (payload: SyncPayloads[SyncCategory]) => void);

    return () => {
      this.listeners.get(category)?.delete(listener as (payload: SyncPayloads[SyncCategory]) => void);
    };
  }

  /**
   * Start sending periodic heartbeats.
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.broadcast('HEARTBEAT', {
        windowId: this.windowId,
        viewType: this.isPrimary ? 'PRIMARY' : 'DETACHED',
      });
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Start checking for stale windows and cleaning them up.
   */
  private startStaleCheck(): void {
    this.staleCheckTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, info] of this.activeWindows.entries()) {
        if (now - info.lastHeartbeat > STALE_TIMEOUT) {
          this.activeWindows.delete(id);
          console.log(`[WindowSync] Removed stale window: ${id}`);
        }
      }
    }, STALE_TIMEOUT);
  }

  /**
   * Pop out a view into a new browser window.
   *
   * @param viewState - The current view state to pass to the detached window
   * @returns The newly opened window reference, or null if blocked
   */
  public popOutView(viewState: DetachedViewState): Window | null {
    const width = 1200;
    const height = 800;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    const url = new URL('/detached', window.location.href);
    url.searchParams.set('viewType', viewState.viewType);
    url.searchParams.set('projectId', viewState.projectId);
    url.searchParams.set('authToken', viewState.authToken);
    url.searchParams.set('apiBaseUrl', viewState.apiBaseUrl);

    // Serialize view state into a base64-encoded JSON blob
    const stateBlob = btoa(JSON.stringify({
      zoomLevel: viewState.zoomLevel,
      selectedNodeId: viewState.selectedNodeId,
      filterTokens: viewState.filterTokens,
      filterMode: viewState.filterMode,
    }));
    url.searchParams.set('state', stateBlob);

    const newWindow = window.open(
      url.toString(),
      `_detached_${viewState.viewType}_${Date.now()}`,
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
    );

    if (newWindow) {
      // Mark this window as primary (it has detached a child)
      this.isPrimary = true;

      // Track the detached window in session state persistence
      try {
        const { useSessionStateStore } = require('../stores/useSessionStateStore');
        const windowId = this.getWindowId() + '-detached-' + Date.now();
        useSessionStateStore.getState().addDetachedWindow({
          windowId,
          viewType: viewState.viewType,
          projectId: viewState.projectId,
          viewState: {
            ganttZoom: viewState.zoomLevel,
            selectedNodeId: viewState.selectedNodeId,
            filterTokens: viewState.filterTokens,
            filterMode: viewState.filterMode,
          },
          openedAt: Date.now(),
        });
      } catch (err) {
        console.warn('[WindowSync] Failed to track detached window:', err);
      }

      // Send initial state to the new window once it loads
      newWindow.addEventListener('load', () => {
        this.broadcast('VIEW_STATE', {
          viewType: viewState.viewType,
          state: {
            zoomLevel: viewState.zoomLevel,
            selectedNodeId: viewState.selectedNodeId,
            filterTokens: viewState.filterTokens,
            filterMode: viewState.filterMode,
          },
        });
      });
    }

    return newWindow;
  }

  /**
   * Get the list of active connected windows.
   */
  public getActiveWindows(): Map<string, { lastHeartbeat: number; viewType: string }> {
    return new Map(this.activeWindows);
  }

  /**
   * Get the unique window ID.
   */
  public getWindowId(): string {
    return this.windowId;
  }

  /**
   * Clean up the BroadcastChannel connection.
   */
  public destroy(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.staleCheckTimer) clearInterval(this.staleCheckTimer);
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.listeners.clear();
    this.activeWindows.clear();
  }
}

// ---------------------------------------------------------------------------
// Singleton Instance
// ---------------------------------------------------------------------------

/**
 * Global singleton instance of the window sync service.
 */
let windowSyncInstance: WindowSyncService | null = null;

/**
 * Get or create the singleton window sync service.
 */
export function getWindowSync(): WindowSyncService {
  if (!windowSyncInstance) {
    windowSyncInstance = new WindowSyncService();
  }
  return windowSyncInstance;
}

/**
 * Clean up the singleton (for testing or unmount).
 */
export function destroyWindowSync(): void {
  if (windowSyncInstance) {
    windowSyncInstance.destroy();
    windowSyncInstance = null;
  }
}
