/**
 * Detached Window Helper
 *
 * Opens clean browser windows for detached views from the sidebar navigation.
 * Registers detached window instances in useWorkspaceStore for tracking.
 *
 * Features
 * --------
 * - Opens a standalone window at `/standalone/{viewType}` with clean chrome.
 * - Registers the detached window in the workspace store so the sidebar can
 *   show external window glyphs for running detached views.
 * - Passes authentication and view state via URL parameters.
 *
 * Usage
 * -----
 *
 * ```ts
 * import { detachViewToWindow } from '../utils/detachWindow';
 *
 * // In a sidebar item handler:
 * detachViewToWindow('WBS_GANTT', { projectId: 'uuid-123' });
 * ```
 */

import type { ViewType } from '../stores/useWorkspaceStore';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';

// ---------------------------------------------------------------------------
// BroadcastChannel for multi-window communication
// ---------------------------------------------------------------------------

/**
 * BroadcastChannel name for workspace communication between main and detached windows.
 */
const WORKSPACE_CHANNEL = 'defence_ppm_workspace_bus';

/**
 * Message types for inter-window communication.
 */
export type WorkspaceMessageType =
  | 'DETACHED_WINDOW_REGISTERED'
  | 'DETACHED_WINDOW_CLOSED'
  | 'VIEW_STATE_SYNC'
  | 'SELECTION_SYNC';

/**
 * Message structure for workspace BroadcastChannel.
 */
export interface WorkspaceMessage {
  type: WorkspaceMessageType;
  viewType: ViewType;
  timestamp: number;
  payload?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Window features for detached views.
 */
interface DetachedWindowFeatures {
  /** Window width in pixels */
  width: number;
  /** Window height in pixels */
  height: number;
  /** Whether to show menubar */
  menubar: boolean;
  /** Whether to show toolbar */
  toolbar: boolean;
  /** Whether window is resizable */
  resizable: boolean;
  /** Whether to show scrollbars */
  scrollbars: boolean;
}

/**
 * Default window features for detached views.
 */
const DEFAULT_FEATURES: DetachedWindowFeatures = {
  width: 1600,
  height: 950,
  menubar: false,
  toolbar: false,
  resizable: true,
  scrollbars: true,
};

/**
 * View type to window title mapping.
 */
const VIEW_TITLE_MAP: Record<string, string> = {
  WBS_GANTT: 'WBS & Master Gantt',
  DAILY_COCKPIT: 'My Daily Cockpit',
  SRA_RISK: 'Schedule Risk Analysis',
  FACILITY_CHAMBER: 'Facility Scheduling',
  SUPPLIER_PORTAL: 'Supplier Portal',
  EVM_REPORTING: 'EVM & IPMR Reporting',
  CUSTOM_FIELDS: 'Custom Fields Admin',
  SCHEDULE_HEALTH: 'Schedule Health',
  CONTRACT_DELIVERABLES: 'Contract Deliverables',
  CHANGE_CONTROL: 'Change Control Board',
  LOCATION_EXPLORER: 'Location Explorer',
  DOCUMENT_VAULT: 'Document Vault',
  MERKLE_SYNC: 'Merkle Sync',
  HELP_CENTER: 'Help Center',
  COSTING: 'Costing Workbench',
  PROCUREMENT: 'Procurement',
  COMMERCIAL: 'Commercial Governance',
  TEMPLATES: 'Templates',
  ENGINEERING: 'Engineering Governance',
  EQUIPMENT: 'Equipment',
  MATERIALS: 'Materials',
  RESERVES: 'Management Reserves',
  CURRENCY: 'Currency Management',
  CALENDARS: 'Calendars',
  SCHEDULE_QUARANTINE: 'Schedule Quarantine',
  SUBCONTRACTORS: 'Subcontractors',
  REQUISITIONS: 'Requisitions',
  SANDBOXES: 'Sandboxes',
  PROGRAMMES: 'Programme Management',
  AIRGAP: 'Air-Gap Management',
  AUDIT: 'Audit Trail',
  ADMIN_SECURITY: 'Admin Security',
  DB_HEALTH: 'Database Health',
  BACKUP_MANAGER: 'Backup Manager',
  LOG_VIEWER: 'Log Viewer',
  USER_MANAGEMENT: 'User Management',
  SYSTEM_CONFIG: 'System Configuration',
  SERVICE_HEALTH: 'Service Health',
  ALERTING: 'Alerting & Notifications',
  MONITORING: 'Monitoring & Metrics',
  PASSWORD_POLICY: 'Password Policy',
  DATA_EXPORT: 'Data Export/Import',
  LOG_ROTATION: 'Log Rotation',
  FEATURE_FLAGS: 'Feature Flags',
  SECURITY_SCAN: 'Security Scans',
  SECRET_ROTATION: 'Secret Rotation',
  MAINTENANCE_MODE: 'Maintenance Mode',
};

// ---------------------------------------------------------------------------
// Detached Window Registry
// ---------------------------------------------------------------------------

/**
 * Track detached window instances by view type.
 * Key: viewType, Value: Window reference
 */
const detachedWindows = new Map<ViewType, WindowProxy | null>();

/**
 * Open a view in a detached browser window.
 *
 * @param viewType - The type of view to detach
 * @param params - Optional view-specific parameters (e.g., projectId)
 * @param features - Optional window features override
 * @returns The newly opened window reference, or null if blocked
 */
export function detachViewToWindow(
  viewType: ViewType,
  params?: Record<string, any>,
  features?: Partial<DetachedWindowFeatures>,
): WindowProxy | null {
  const mergedFeatures = { ...DEFAULT_FEATURES, ...features };

  // Build the URL
  const url = new URL('/standalone', window.location.href);
  url.searchParams.set('viewType', viewType);

  // Add view-specific parameters
  if (params?.projectId) {
    url.searchParams.set('projectId', params.projectId);
  }
  if (params?.taskCode) {
    url.searchParams.set('taskCode', params.taskCode);
  }

  // Add authentication
  const authToken = localStorage.getItem('authToken') || '';
  if (authToken) {
    url.searchParams.set('authToken', authToken);
  }

  // Add API base URL
  url.searchParams.set('apiBaseUrl', window.location.origin);

  // Build window features string
  const featuresString = Object.entries(mergedFeatures)
    .map(([key, value]) => `${key}=${value ? 'yes' : 'no'}`)
    .join(',');

  // Open the window
  const windowName = `${viewType}_Window_${Date.now()}`;
  const newWindow = window.open(
    url.toString(),
    windowName,
    featuresString,
  );

  if (newWindow) {
    // Register in the detached windows map
    detachedWindows.set(viewType, newWindow);

    // Register in the workspace store
    useWorkspaceStore.getState().openView(viewType, params, 'NEW_WINDOW');

    // Transmit registration event via BroadcastChannel
    try {
      const channel = new BroadcastChannel(WORKSPACE_CHANNEL);
      const message: WorkspaceMessage = {
        type: 'DETACHED_WINDOW_REGISTERED',
        viewType,
        timestamp: Date.now(),
        payload: params,
      };
      channel.postMessage(message);
      channel.close();
    } catch (err) {
      console.warn('[detachWindow] BroadcastChannel not available:', err);
    }

    // Check if the window was blocked by popup blocker
    if (newWindow.closed) {
      detachedWindows.delete(viewType);
      console.warn('[detachWindow] Popup blocked for view:', viewType);
      return null;
    }

    // Clean up when window is closed
    const checkClosed = setInterval(() => {
      if (newWindow.closed) {
        clearInterval(checkClosed);
        detachedWindows.delete(viewType);

        // Notify main window via BroadcastChannel
        try {
          const channel = new BroadcastChannel(WORKSPACE_CHANNEL);
          const message: WorkspaceMessage = {
            type: 'DETACHED_WINDOW_CLOSED',
            viewType,
            timestamp: Date.now(),
          };
          channel.postMessage(message);
          channel.close();
        } catch (err) {
          // Ignore if channel unavailable
        }
      }
    }, 1000);
  }

  return newWindow;
}

/**
 * Check if a view type is currently running in a detached window.
 *
 * @param viewType - The view type to check
 * @returns True if a detached window is open and active
 */
export function isViewDetached(viewType: ViewType): boolean {
  const win = detachedWindows.get(viewType);
  if (!win) return false;
  return !win.closed;
}

/**
 * Get all currently detached view types.
 *
 * @returns Array of view types running in detached windows
 */
export function getDetachedViewTypes(): ViewType[] {
  const active: ViewType[] = [];
  for (const [viewType, win] of detachedWindows.entries()) {
    if (win && !win.closed) {
      active.push(viewType);
    }
  }
  return active;
}

/**
 * Get the title for a detached view window.
 *
 * @param viewType - The view type
 * @returns The window title
 */
export function getDetachedWindowTitle(viewType: ViewType): string {
  return VIEW_TITLE_MAP[viewType] || 'Eisenhower Portfolio Manager';
}

/**
 * Close a detached window by view type.
 *
 * @param viewType - The view type to close
 */
export function closeDetachedWindow(viewType: ViewType): void {
  const win = detachedWindows.get(viewType);
  if (win && !win.closed) {
    win.close();
    detachedWindows.delete(viewType);
  }
}

/**
 * Clean up all detached windows (e.g., on logout).
 */
export function cleanupAllDetachedWindows(): void {
  for (const [viewType, win] of detachedWindows.entries()) {
    if (win && !win.closed) {
      win.close();
    }
  }
  detachedWindows.clear();
}
