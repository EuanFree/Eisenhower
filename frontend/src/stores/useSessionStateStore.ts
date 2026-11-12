/**
 * Session State Persistence Hook
 *
 * Captures and restores per-view transient state that is not covered by the
 * workspace layout (tabs, splits) or display settings (theme, density).
 *
 * What Is Persisted
 * -----------------
 *
 * For each open view tab, the following transient state is saved to
 * ``view_state_overrides.per_view_state[tabId]`` in PostgreSQL:
 *
 * - **Scroll position** — Vertical (WBS table) and horizontal (Gantt) scroll offsets.
 * - **Gantt zoom level** — DAYS, WEEKS, or MONTHS.
 * - **Selected node** — The currently focused/selected work item ID.
 * - **Active filter tokens** — The raw filter string and visualization mode.
 * - **Sort order** — Column key and direction (asc/desc).
 * - **Expanded nodes** — Which tree nodes are expanded in the WBS table.
 * - **Ribbon state** — Active ribbon tab and collapsed/expanded state.
 * - **Drawer state** — Whether the slide-over drawer is open and which panel.
 *
 * Multi-Window Tracking
 * ---------------------
 *
 * When the user pops out a view into a detached browser window, the detached
 * window's view type and parameters are recorded in
 * ``view_state_overrides.detached_windows``. On the next login, if any
 * detached windows are found, the "Restore Previous Session" modal offers
 * to reopen them.
 *
 * Save Strategy
 * -------------
 *
 * All changes are debounced (300 ms) before being merged into the display
 * settings store, which itself debounces the PUT to PostgreSQL (500 ms).
 * A final explicit save is triggered on sign-out to ensure no state is lost.
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    const session = useSessionState();
 *
 *    // In a Gantt viewport component:
 *    useEffect(() => {
 *      session.saveViewState(activeTabId, {
 *        ganttZoom: zoom,
 *        scrollX,
 *        selectedNodeId,
 *      });
 *    }, [zoom, scrollX, selectedNodeId]);
 *
 *    // On mount, restore previous state:
 *    const prev = session.loadViewState(activeTabId);
 *    if (prev?.ganttZoom) setZoom(prev.ganttZoom);
 */

import { create } from 'zustand';
import { useDisplayStore } from './useDisplayStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Per-view transient state stored for each workspace tab.
 * All fields are optional so partial updates are safe.
 */
export interface PerViewState {
  /** Vertical scroll offset of the WBS table (pixels) */
  scrollTop?: number;
  /** Horizontal scroll offset of the Gantt viewport (pixels) */
  scrollX?: number;
  /** Gantt timeline zoom level (legacy discrete) */
  ganttZoom?: 'DAYS' | 'WEEKS' | 'MONTHS';
  /** Gantt continuous zoom: pixels per day (e.g. 0.5, 2, 4) */
  ganttPixelsPerDay?: number;
  /** Whether Gantt auto-fit is enabled (fills window) */
  ganttAutoFit?: boolean;
  /** Currently selected/focused node ID */
  selectedNodeId?: string | null;
  /** Active filter token string */
  filterTokens?: string;
  /** Filter visualization mode */
  filterMode?: 'FILTER' | 'DIM';
  /** Sort column key */
  sortColumn?: string;
  /** Sort direction */
  sortDirection?: 'asc' | 'desc';
  /** Expanded node IDs in the WBS tree */
  expandedNodes?: Record<string, boolean>;
  /** Active ribbon tab identifier */
  ribbonTab?: string;
  /** Whether the ribbon is collapsed to tab-only mode */
  ribbonCollapsed?: boolean;
  /** Whether the slide-over drawer is open */
  drawerOpen?: boolean;
  /** Active drawer panel identifier */
  drawerPanel?: string;
}

/**
 * Metadata about a detached (popped-out) browser window.
 */
export interface DetachedWindowRecord {
  /** Unique window identifier */
  windowId: string;
  /** View type that was detached */
  viewType: string;
  /** Project ID associated with the view */
  projectId?: string;
  /** View state snapshot at the time of detachment */
  viewState?: PerViewState;
  /** Timestamp when the window was opened */
  openedAt: number;
}

/**
 * Top-level structure stored inside view_state_overrides.
 */
export interface SessionStateOverrides {
  /** Per-tab transient state, keyed by tab ID */
  per_view_state?: Record<string, PerViewState>;
  /** List of detached windows from the last session */
  detached_windows?: DetachedWindowRecord[];
  /** Timestamp of the last session save */
  last_session_save?: number;
}

// ---------------------------------------------------------------------------
// Debounce
// ---------------------------------------------------------------------------

let sessionDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function debounceSessionSave() {
  if (sessionDebounceTimer) clearTimeout(sessionDebounceTimer);
  sessionDebounceTimer = setTimeout(() => {
    const state = useSessionStateStore.getState();
    const displayStore = useDisplayStore.getState();

    const currentOverrides = displayStore.settings.viewStateOverrides || {};
    const sessionOverrides: SessionStateOverrides = {
      per_view_state: state.perViewState,
      detached_windows: state.detachedWindows,
      last_session_save: Date.now(),
    };

    // Merge session overrides into the existing view_state_overrides
    const merged = {
      ...currentOverrides,
      ...sessionOverrides,
    };

    displayStore.updateDisplaySettings({ viewStateOverrides: merged });
  }, 300);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface SessionStateStoreState {
  /** Per-tab transient state */
  perViewState: Record<string, PerViewState>;
  /** Detached window records */
  detachedWindows: DetachedWindowRecord[];

  /**
   * Load persisted session state from display settings.
   * Call this after hydration to restore per-view state.
   */
  hydrateSessionState: () => void;

  /**
   * Save transient state for a specific tab.
   * Merges the provided partial state with any existing state for that tab.
   */
  saveViewState: (tabId: string, partial: PerViewState) => void;

  /**
   * Load the persisted transient state for a specific tab.
   * Returns undefined if no state is saved for that tab.
   */
  loadViewState: (tabId: string) => PerViewState | undefined;

  /**
   * Clear transient state for a specific tab (e.g., when closing the tab).
   */
  clearViewState: (tabId: string) => void;

  /**
   * Register a detached window.
   */
  addDetachedWindow: (record: DetachedWindowRecord) => void;

  /**
   * Remove a detached window record (e.g., when the window is closed).
   */
  removeDetachedWindow: (windowId: string) => void;

  /**
   * Clear all detached window records (e.g., after user confirms restore).
   */
  clearDetachedWindows: () => void;

  /**
   * Force an immediate save of all session state.
   * Use this on sign-out to ensure no state is lost.
   */
  forceSave: () => void;
}

export const useSessionStateStore = create<SessionStateStoreState>((set, get) => ({
  perViewState: {},
  detachedWindows: [],

  hydrateSessionState: () => {
    const displayStore = useDisplayStore.getState();
    const overrides = displayStore.settings.viewStateOverrides as SessionStateOverrides | undefined;

    if (overrides) {
      set({
        perViewState: overrides.per_view_state || {},
        detachedWindows: overrides.detached_windows || [],
      });
    }
  },

  saveViewState: (tabId, partial) => {
    const state = get();
    const existing = state.perViewState[tabId] || {};
    const updated = { ...existing, ...partial };

    set({
      perViewState: {
        ...state.perViewState,
        [tabId]: updated,
      },
    });

    debounceSessionSave();
  },

  loadViewState: (tabId) => {
    return get().perViewState[tabId];
  },

  clearViewState: (tabId) => {
    const state = get();
    const updated = { ...state.perViewState };
    delete updated[tabId];
    set({ perViewState: updated });
    debounceSessionSave();
  },

  addDetachedWindow: (record) => {
    set({
      detachedWindows: [...get().detachedWindows, record],
    });
    debounceSessionSave();
  },

  removeDetachedWindow: (windowId) => {
    set({
      detachedWindows: get().detachedWindows.filter((w) => w.windowId !== windowId),
    });
    debounceSessionSave();
  },

  clearDetachedWindows: () => {
    set({ detachedWindows: [] });
    debounceSessionSave();
  },

  forceSave: () => {
    // Immediately flush the debounce timer
    if (sessionDebounceTimer) {
      clearTimeout(sessionDebounceTimer);
      sessionDebounceTimer = null;
    }

    const state = get();
    const displayStore = useDisplayStore.getState();

    const currentOverrides = displayStore.settings.viewStateOverrides || {};
    const sessionOverrides: SessionStateOverrides = {
      per_view_state: state.perViewState,
      detached_windows: state.detachedWindows,
      last_session_save: Date.now(),
    };

    const merged = {
      ...currentOverrides,
      ...sessionOverrides,
    };

    // Direct PUT without debounce
    displayStore.updateDisplaySettings({ viewStateOverrides: merged });
  },
}));

// ---------------------------------------------------------------------------
// Convenience Hook
// ---------------------------------------------------------------------------

/**
 * Hook for accessing session state persistence.
 *
 * Returns a stable object with methods for saving, loading, and managing
 * per-view transient state and detached window tracking.
 */
export function useSessionState() {
  return useSessionStateStore((s) => ({
    perViewState: s.perViewState,
    detachedWindows: s.detachedWindows,
    hydrateSessionState: s.hydrateSessionState,
    saveViewState: s.saveViewState,
    loadViewState: s.loadViewState,
    clearViewState: s.clearViewState,
    addDetachedWindow: s.addDetachedWindow,
    removeDetachedWindow: s.removeDetachedWindow,
    clearDetachedWindows: s.clearDetachedWindows,
    forceSave: s.forceSave,
  }));
}
