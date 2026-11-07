/**
 * Workspace Zustand Store
 *
 * Manages the multi-view workspace docking engine: active tabs, layout splits,
 * and tab states for the Eisenhower Portfolio Manager.
 *
 * Features
 * --------
 * - **Tab Management** — Open, close, pin, reorder, and activate tabs.
 * - **Split Pane Layout** — Horizontal and vertical split modes with adjustable
 *   ratios persisted to UserDisplaySettings.
 * - **Dirty State Tracking** — Marks tabs as modified when data changes.
 * - **Persistence** — Debounce-syncs workspace layout to PostgreSQL via
 *   UserDisplaySettings.view_state_overrides.workspace_layout.
 *
 * Usage
 * -----
 *
 * ```ts
 * const { tabs, activeTabId, openView, closeTab } = useWorkspaceStore();
 * ```
 */

import { create } from 'zustand';
import { useDisplayStore } from './useDisplayStore';
import { useSessionStateStore } from './useSessionStateStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported view types that can be opened in workspace tabs */
export type ViewType =
  | 'WBS_GANTT'
  | 'DAILY_COCKPIT'
  | 'SRA_RISK'
  | 'FACILITY_CHAMBER'
  | 'SUPPLIER_PORTAL'
  | 'EVM_REPORTING'
  | 'CUSTOM_FIELDS'
  | 'SCHEDULE_HEALTH'
  | 'CONTRACT_DELIVERABLES'
  | 'CHANGE_CONTROL'
  | 'LOCATION_EXPLORER'
  | 'DOCUMENT_VAULT'
  | 'MERKLE_SYNC'
  | 'HELP_CENTER'
  // High priority — Costing, Procurement, Commercial, Templates
  | 'COSTING'
  | 'PROCUREMENT'
  | 'COMMERCIAL'
  | 'TEMPLATES'
  // Medium priority — Engineering, Equipment, Materials, Reserves, Currency, Calendars
  | 'ENGINEERING'
  | 'EQUIPMENT'
  | 'MATERIALS'
  | 'RESERVES'
  | 'CURRENCY'
  | 'CALENDARS'
  // Lower priority — Quarantine, Subcontractors, Requisitions, Sandboxes, Programmes, AirGap, Audit, AdminSecurity, DbHealth
  | 'SCHEDULE_QUARANTINE'
  | 'SUBCONTRACTORS'
  | 'REQUISITIONS'
  | 'SANDBOXES'
  | 'PROGRAMMES'
  | 'AIRGAP'
  | 'AUDIT'
  | 'ADMIN_SECURITY'
  | 'DB_HEALTH'
  // Admin tools — Backup, Logs, Users, Config, Health, Alerting, Monitoring, Password, Export, LogRotation, FeatureFlags, SecurityScan, SecretRotation, Maintenance
  | 'BACKUP_MANAGER'
  | 'LOG_VIEWER'
  | 'USER_MANAGEMENT'
  | 'SYSTEM_CONFIG'
  | 'SERVICE_HEALTH'
  | 'ALERTING'
  | 'MONITORING'
  | 'PASSWORD_POLICY'
  | 'DATA_EXPORT'
  | 'LOG_ROTATION'
  | 'FEATURE_FLAGS'
  | 'SECURITY_SCAN'
  | 'SECRET_ROTATION'
  | 'MAINTENANCE_MODE'
  | 'DASHBOARD'
  | 'COPILOT'
  // Line management, leave, skills, resource downtime, and delegation
  | 'LEAVE_MANAGEMENT'
  | 'LINE_MANAGER_DASHBOARD'
  | 'RESOURCE_SKILLS'
  | 'RESOURCE_DOWNTIME'
  | 'DELEGATION_MANAGEMENT'
  | 'WORKFORCE_FORECAST'
  | 'TIMESHEET_COHERENCE'
  | 'COST_SPREADING'
  | 'EXPORT_CONTROL'
  | 'HARDWARE_ENCLAVE'
  | 'CCB_ARBITRATION'
  | 'SBOM_VULNERABILITY'
  | 'SANDTABLE'
  | 'CAM_EVM_CLOSEOUT_WIZARD'
  // AI Agent Governance
  | 'AGENT_REVIEW_WORKBENCH';

/** How a new view should be opened */
export type TargetMode = 'ACTIVE_PANE' | 'SPLIT_RIGHT' | 'SPLIT_BOTTOM' | 'NEW_WINDOW';

/** Split layout orientation */
export type SplitOrientation = 'NONE' | 'HORIZONTAL' | 'VERTICAL';

/** Unique workspace tab instance */
export interface WorkspaceTab {
  /** Unique tab instance ID (e.g., 'tab-123') */
  id: string;
  /** Type of view rendered in this tab */
  viewType: ViewType;
  /** Human-readable title (e.g., 'Project Falcon — WBS') */
  title: string;
  /** Pinned tabs cannot be closed and survive layout resets */
  isPinned: boolean;
  /** True when the tab has unsaved changes */
  isDirty: boolean;
  /** View-specific parameters (project ID, focused task, etc.) */
  params?: Record<string, any>;
}

/** Persisted workspace layout snapshot */
export interface WorkspaceLayout {
  /** Array of tabs in order */
  tabs: WorkspaceTab[];
  /** Currently active tab ID */
  activeTabId: string;
  /** Split orientation */
  splitOrientation: SplitOrientation;
  /** Split ratio (0.1–0.9) */
  splitRatio: number;
}

interface WorkspaceStoreState {
  /** All open tabs */
  tabs: WorkspaceTab[];
  /** Currently active tab ID */
  activeTabId: string | null;
  /** Split orientation: none, horizontal (side-by-side), vertical (top-bottom) */
  splitOrientation: SplitOrientation;
  /** Split ratio (0.1–0.9) */
  splitRatio: number;
  /** Whether the sidebar is expanded (240px) or compact (52px) */
  isSidebarExpanded: boolean;
  /** Whether a debounced save is pending */
  saving: boolean;

  /**
   * Open a new view in the specified target mode.
   * @param viewType - Type of view to open
   * @param params - View-specific parameters (e.g., projectId)
   * @param targetMode - Where to place the new tab
   */
  openView: (viewType: ViewType, params?: Record<string, any>, targetMode?: TargetMode) => void;

  /** Close a tab by ID. Pinned tabs cannot be closed. */
  closeTab: (tabId: string) => void;

  /** Set the active tab by ID */
  setActiveTab: (tabId: string) => void;

  /** Adjust the split ratio (0.1–0.9) */
  setSplitRatio: (ratio: number) => void;

  /** Pin or unpin a tab */
  pinTab: (tabId: string, pinned?: boolean) => void;

  /** Reorder tabs via drag-and-drop */
  reorderTabs: (sourceIndex: number, targetIndex: number) => void;

  /** Mark a tab as dirty (has unsaved changes) */
  setTabDirty: (tabId: string, dirty?: boolean) => void;

  /** Update tab parameters */
  updateTabParams: (tabId: string, params: Record<string, any>) => void;

  /** Set split orientation */
  setSplitOrientation: (orientation: SplitOrientation) => void;

  /** Close all non-pinned tabs */
  closeAllTabs: () => void;

  /** Close all tabs except the specified one */
  closeOtherTabs: (tabId: string) => void;

  /** Close all tabs to the right of the specified tab */
  closeTabsToRight: (tabId: string) => void;

  /** Load layout from persisted state */
  loadLayout: (layout: WorkspaceLayout) => void;

  /** Persist layout to display settings */
  persistLayout: () => void;

  /** Toggle or set sidebar expanded state */
  setSidebarExpanded: (expanded: boolean) => void;
}

// ---------------------------------------------------------------------------
// View Type Metadata
// ---------------------------------------------------------------------------

/** Category grouping for view types */
export type ViewCategory =
  | 'Core'
  | 'Workforce'
  | 'Commercial'
  | 'Engineering'
  | 'Planning'
  | 'Security'
  | 'Infrastructure'
  | 'Compliance'
  | 'Governance';

/** Lucide icon name mapping for each view type */
export type ViewMetadata = {
  label: string;
  defaultTitle: string;
  icon: string;
  category: ViewCategory;
  lucideIcon: string;
};

const VIEW_METADATA: Record<ViewType, ViewMetadata> = {
  // ---------------------------------------------------------------------------
  // Core — Core scheduling and project views
  // ---------------------------------------------------------------------------
  WBS_GANTT: { label: 'WBS / Gantt', defaultTitle: 'Schedule', icon: '📊', category: 'Core', lucideIcon: 'BarChart3' },
  DAILY_COCKPIT: { label: 'Daily Cockpit', defaultTitle: 'My Cockpit', icon: '🎯', category: 'Core', lucideIcon: 'Target' },
  SRA_RISK: { label: 'Schedule Risk', defaultTitle: 'Risk Analysis', icon: '📈', category: 'Core', lucideIcon: 'TrendingUp' },
  FACILITY_CHAMBER: { label: 'Facility Scheduling', defaultTitle: 'Facilities', icon: '🔬', category: 'Core', lucideIcon: 'FlaskConical' },
  SUPPLIER_PORTAL: { label: 'Supplier Portal', defaultTitle: 'Supplier', icon: '👥', category: 'Core', lucideIcon: 'Users' },
  EVM_REPORTING: { label: 'EVM Reporting', defaultTitle: 'Reporting', icon: '📋', category: 'Core', lucideIcon: 'FileText' },
  CUSTOM_FIELDS: { label: 'Custom Fields', defaultTitle: 'Custom Fields', icon: '⚙️', category: 'Core', lucideIcon: 'Settings' },
  SCHEDULE_HEALTH: { label: 'Schedule Health', defaultTitle: 'Health', icon: '💓', category: 'Core', lucideIcon: 'HeartPulse' },
  CONTRACT_DELIVERABLES: { label: 'Contract Deliverables', defaultTitle: 'CDRL', icon: '📄', category: 'Core', lucideIcon: 'FileCheck' },
  CHANGE_CONTROL: { label: 'Change Control', defaultTitle: 'CCB', icon: '🛡️', category: 'Core', lucideIcon: 'Shield' },
  LOCATION_EXPLORER: { label: 'Location Explorer', defaultTitle: 'Locations', icon: '📍', category: 'Core', lucideIcon: 'MapPin' },
  DOCUMENT_VAULT: { label: 'Document Vault', defaultTitle: 'Vault', icon: '🔒', category: 'Core', lucideIcon: 'Lock' },
  MERKLE_SYNC: { label: 'Merkle Sync', defaultTitle: 'Sync', icon: '🔄', category: 'Core', lucideIcon: 'RefreshCw' },
  HELP_CENTER: { label: 'Help Center', defaultTitle: 'Help', icon: '📖', category: 'Core', lucideIcon: 'BookOpen' },
  DASHBOARD: { label: 'Dashboard Builder', defaultTitle: 'Dashboard', icon: '📊', category: 'Core', lucideIcon: 'LayoutDashboard' },
  COPILOT: { label: 'CoPilot AI', defaultTitle: 'CoPilot', icon: '🤖', category: 'Core', lucideIcon: 'Bot' },
  HARDWARE_ENCLAVE: { label: 'Hardware Enclave & Diode Console', defaultTitle: 'HSM Console', icon: '🔐', category: 'Core', lucideIcon: 'Cpu' },

  // ---------------------------------------------------------------------------
  // Workforce — People, leave, skills, delegation
  // ---------------------------------------------------------------------------
  LEAVE_MANAGEMENT: { label: 'Leave Management', defaultTitle: 'Leave', icon: '🏖️', category: 'Workforce', lucideIcon: 'CalendarCheck' },
  LINE_MANAGER_DASHBOARD: { label: 'Line Manager Dashboard', defaultTitle: 'Team Dashboard', icon: '👥', category: 'Workforce', lucideIcon: 'UserCheck' },
  RESOURCE_SKILLS: { label: 'Resource Skills', defaultTitle: 'Skills', icon: '🏆', category: 'Workforce', lucideIcon: 'Award' },
  RESOURCE_DOWNTIME: { label: 'Resource Downtime', defaultTitle: 'Downtime', icon: '🔧', category: 'Workforce', lucideIcon: 'Clock' },
  DELEGATION_MANAGEMENT: { label: 'Delegation Management', defaultTitle: 'Delegation', icon: '🛡️', category: 'Workforce', lucideIcon: 'ShieldCheck' },
  REQUISITIONS: { label: 'Requisitions', defaultTitle: 'Requisitions', icon: '📝', category: 'Workforce', lucideIcon: 'ClipboardList' },
  WORKFORCE_FORECAST: { label: 'Workforce Forecast', defaultTitle: 'Forecast', icon: '📊', category: 'Workforce', lucideIcon: 'TrendingUp' },

  // ---------------------------------------------------------------------------
  // Commercial — Costing, procurement, financial governance
  // ---------------------------------------------------------------------------
  COSTING: { label: 'Costing Workbench', defaultTitle: 'Costing', icon: '💷', category: 'Commercial', lucideIcon: 'PoundSterling' },
  PROCUREMENT: { label: 'Procurement Dashboard', defaultTitle: 'Procurement', icon: '🚚', category: 'Commercial', lucideIcon: 'Truck' },
  COMMERCIAL: { label: 'Commercial Governance', defaultTitle: 'Commercial', icon: '⚖️', category: 'Commercial', lucideIcon: 'Scale' },
  RESERVES: { label: 'Management Reserves', defaultTitle: 'Reserves', icon: '💰', category: 'Commercial', lucideIcon: 'Vault' },
  CURRENCY: { label: 'Currency Management', defaultTitle: 'Currency', icon: '💱', category: 'Commercial', lucideIcon: 'Coins' },
  TIMESHEET_COHERENCE: { label: 'Timesheet Coherence', defaultTitle: 'Timesheet Coherence', icon: '📋', category: 'Commercial', lucideIcon: 'ClockCheck' },
  COST_SPREADING: { label: 'Fiscal Tranche Spreading', defaultTitle: 'Cost Spreading', icon: '💷', category: 'Commercial', lucideIcon: 'Split' },

  // ---------------------------------------------------------------------------
  // Engineering — Physical assets and materials
  // ---------------------------------------------------------------------------
  ENGINEERING: { label: 'Engineering Governance', defaultTitle: 'Engineering', icon: '🛡️', category: 'Engineering', lucideIcon: 'Wrench' },
  EQUIPMENT: { label: 'Equipment Management', defaultTitle: 'Equipment', icon: '🔧', category: 'Engineering', lucideIcon: 'Settings2' },
  MATERIALS: { label: 'Materials Management', defaultTitle: 'Materials', icon: '📦', category: 'Engineering', lucideIcon: 'Package' },

  // ---------------------------------------------------------------------------
  // Planning — Scheduling, templates, programmes
  // ---------------------------------------------------------------------------
  CALENDARS: { label: 'Calendar Management', defaultTitle: 'Calendars', icon: '📅', category: 'Planning', lucideIcon: 'CalendarDays' },
  SCHEDULE_QUARANTINE: { label: 'Schedule Quarantine', defaultTitle: 'Quarantine', icon: '⚠️', category: 'Planning', lucideIcon: 'AlertTriangle' },
  SUBCONTRACTORS: { label: 'Subcontractors', defaultTitle: 'Subcontractors', icon: '🤝', category: 'Planning', lucideIcon: 'Handshake' },
  SANDBOXES: { label: 'Sandboxes', defaultTitle: 'Sandboxes', icon: '🔀', category: 'Planning', lucideIcon: 'GitBranch' },
  PROGRAMMES: { label: 'Programme Management', defaultTitle: 'Programmes', icon: '📁', category: 'Planning', lucideIcon: 'FolderTree' },
  TEMPLATES: { label: 'Templates Library', defaultTitle: 'Templates', icon: '📐', category: 'Planning', lucideIcon: 'FilePlus' },

  // ---------------------------------------------------------------------------
  // Security — Air-gap, audit, password, encryption
  // ---------------------------------------------------------------------------
  AIRGAP: { label: 'Air-Gap Management', defaultTitle: 'AirGap', icon: '🔌', category: 'Security', lucideIcon: 'PlugZap' },
  AUDIT: { label: 'Audit Trail', defaultTitle: 'Audit', icon: '🔍', category: 'Security', lucideIcon: 'Search' },
  ADMIN_SECURITY: { label: 'Admin Security', defaultTitle: 'Security', icon: '🔐', category: 'Security', lucideIcon: 'ShieldAlert' },
  PASSWORD_POLICY: { label: 'Password Policy', defaultTitle: 'Password Policy', icon: '🔑', category: 'Security', lucideIcon: 'Key' },
  SECURITY_SCAN: { label: 'Security Scans', defaultTitle: 'Security Scans', icon: '🔬', category: 'Security', lucideIcon: 'ScanEye' },
  SECRET_ROTATION: { label: 'Secret Rotation', defaultTitle: 'Secret Rotation', icon: '🔏', category: 'Security', lucideIcon: 'RotateCw' },
  DATA_EXPORT: { label: 'Data Export/Import', defaultTitle: 'Data Export', icon: '📤', category: 'Security', lucideIcon: 'Download' },
  EXPORT_CONTROL: { label: 'Export Control & TAA', defaultTitle: 'Export Control', icon: '🔒', category: 'Security', lucideIcon: 'LockKeyhole' },
  SBOM_VULNERABILITY: { label: 'SBOM & Vulnerability Triage', defaultTitle: 'SBOM Explorer', icon: '🛡️', category: 'Compliance', lucideIcon: 'Shield' },
  SANDTABLE: { label: 'Scenario Sandtable', defaultTitle: 'Sandtable', icon: '🔬', category: 'Planning', lucideIcon: 'GitBranch' },

  // ---------------------------------------------------------------------------
  // Infrastructure — Monitoring, logging, system config
  // ---------------------------------------------------------------------------
  DB_HEALTH: { label: 'Database Health', defaultTitle: 'DB Health', icon: '🗄️', category: 'Infrastructure', lucideIcon: 'Database' },
  BACKUP_MANAGER: { label: 'Backup Manager', defaultTitle: 'Backups', icon: '💾', category: 'Infrastructure', lucideIcon: 'HardDrive' },
  LOG_VIEWER: { label: 'Log Viewer', defaultTitle: 'Logs', icon: '📋', category: 'Infrastructure', lucideIcon: 'ScrollText' },
  LOG_ROTATION: { label: 'Log Rotation', defaultTitle: 'Log Rotation', icon: '🔄', category: 'Infrastructure', lucideIcon: 'RefreshCw' },
  SERVICE_HEALTH: { label: 'Service Health', defaultTitle: 'Health', icon: '💚', category: 'Infrastructure', lucideIcon: 'Activity' },
  ALERTING: { label: 'Alerting & Notifications', defaultTitle: 'Alerting', icon: '🔔', category: 'Infrastructure', lucideIcon: 'Bell' },
  MONITORING: { label: 'Monitoring & Metrics', defaultTitle: 'Monitoring', icon: '📊', category: 'Infrastructure', lucideIcon: 'Gauge' },
  SYSTEM_CONFIG: { label: 'System Configuration', defaultTitle: 'Config', icon: '⚙️', category: 'Infrastructure', lucideIcon: 'SlidersHorizontal' },
  MAINTENANCE_MODE: { label: 'Maintenance Mode', defaultTitle: 'Maintenance', icon: '🚧', category: 'Infrastructure', lucideIcon: 'Construction' },
  FEATURE_FLAGS: { label: 'Feature Flags', defaultTitle: 'Feature Flags', icon: '🚩', category: 'Infrastructure', lucideIcon: 'Flag' },
  USER_MANAGEMENT: { label: 'User Management', defaultTitle: 'Users', icon: '👤', category: 'Infrastructure', lucideIcon: 'UserCog' },

  // ---------------------------------------------------------------------------
  // Compliance — Regulatory, export control, and CCB arbitration
  // ---------------------------------------------------------------------------
  CCB_ARBITRATION: { label: 'CCB Arbitration Workbench', defaultTitle: 'CCB Arbitration', icon: '🛡️', category: 'Compliance', lucideIcon: 'ShieldCheck' },
  CAM_EVM_CLOSEOUT_WIZARD: { label: 'CAM EVM Closeout Wizard', defaultTitle: 'EVM Closeout', icon: '📊', category: 'Commercial', lucideIcon: 'ClipboardCheck' },
  // AI Agent Governance
  AGENT_REVIEW_WORKBENCH: { label: 'Agent Proposal Review', defaultTitle: 'Agent Proposals', icon: '🤖', category: 'Security', lucideIcon: 'Bot' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tabCounter = 0;

function generateTabId(): string {
  return `tab-${Date.now()}-${++tabCounter}`;
}

function deriveTitle(viewType: ViewType, params?: Record<string, any>): string {
  const meta = VIEW_METADATA[viewType];
  if (params?.projectName) {
    return `${params.projectName} — ${meta.label}`;
  }
  if (params?.taskCode) {
    return `${params.taskCode} — ${meta.label}`;
  }
  return meta.defaultTitle;
}

// ---------------------------------------------------------------------------
// Debounce persistence
// ---------------------------------------------------------------------------

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function debouncePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const state = useWorkspaceStore.getState();
    const layout: WorkspaceLayout = {
      tabs: state.tabs,
      activeTabId: state.activeTabId || '',
      splitOrientation: state.splitOrientation,
      splitRatio: state.splitRatio,
    };

    // Sync to display settings view_state_overrides
    const displayStore = useDisplayStore.getState();
    const overrides = { ...displayStore.settings.viewStateOverrides, workspace_layout: layout };
    displayStore.updateDisplaySettings({ viewStateOverrides: overrides });
  }, 300);
}

// ---------------------------------------------------------------------------
// Default Layout
// ---------------------------------------------------------------------------

const defaultLayout: WorkspaceLayout = {
  tabs: [
    {
      id: 'tab-default-wbs',
      viewType: 'WBS_GANTT',
      title: 'Schedule',
      isPinned: true,
      isDirty: false,
    },
  ],
  activeTabId: 'tab-default-wbs',
  splitOrientation: 'NONE',
  splitRatio: 0.5,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorkspaceStore = create<WorkspaceStoreState>((set, get) => ({
  tabs: defaultLayout.tabs,
  activeTabId: defaultLayout.activeTabId,
  splitOrientation: defaultLayout.splitOrientation,
  splitRatio: defaultLayout.splitRatio,
  isSidebarExpanded: true,
  saving: false,

  openView: (viewType, params, targetMode = 'ACTIVE_PANE') => {
    const { tabs, activeTabId } = get();
    const tabId = generateTabId();
    const title = deriveTitle(viewType, params);

    const newTab: WorkspaceTab = {
      id: tabId,
      viewType,
      title,
      isPinned: false,
      isDirty: false,
      params,
    };

    if (targetMode === 'NEW_WINDOW') {
      // New window is handled by the window sync utility
      set({ tabs: [...tabs, newTab], activeTabId: tabId });
      return;
    }

    if (targetMode === 'SPLIT_RIGHT' || targetMode === 'SPLIT_BOTTOM') {
      const orientation: SplitOrientation =
        targetMode === 'SPLIT_RIGHT' ? 'HORIZONTAL' : 'VERTICAL';
      set({
        tabs: [...tabs, newTab],
        activeTabId: tabId,
        splitOrientation: orientation,
        splitRatio: 0.5,
      });
    } else {
      // ACTIVE_PANE: Replace or add to active pane
      if (activeTabId) {
        // Replace the active tab
        const updatedTabs = tabs.map((t) => (t.id === activeTabId ? newTab : t));
        set({ tabs: updatedTabs, activeTabId: tabId });
      } else {
        set({ tabs: [...tabs, newTab], activeTabId: tabId });
      }
    }

    debouncePersist();
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get();
    const tabIndex = tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return;

    // Cannot close pinned tabs
    if (tabs[tabIndex].isPinned) return;

    const updatedTabs = tabs.filter((t) => t.id !== tabId);

    if (updatedTabs.length === 0) {
      // Always keep at least one tab
      return;
    }

    // If closing the active tab, activate the nearest neighbor
    let newActiveId = activeTabId;
    if (activeTabId === tabId) {
      const newIdx = Math.min(tabIndex, updatedTabs.length - 1);
      newActiveId = updatedTabs[newIdx].id;
    }

    // Reset split if only one tab remains
    const newOrientation = updatedTabs.length <= 1 ? 'NONE' : get().splitOrientation;

    set({
      tabs: updatedTabs,
      activeTabId: newActiveId,
      splitOrientation: newOrientation,
    });

    // Clear session state for the closed tab
    useSessionStateStore.getState().clearViewState(tabId);

    debouncePersist();
  },

  setActiveTab: (tabId) => {
    const { tabs } = get();
    if (tabs.find((t) => t.id === tabId)) {
      set({ activeTabId: tabId });
      debouncePersist();
    }
  },

  setSplitRatio: (ratio) => {
    const clamped = Math.max(0.1, Math.min(0.9, ratio));
    set({ splitRatio: clamped });
    debouncePersist();
  },

  pinTab: (tabId, pinned) => {
    const isPinned = pinned !== undefined ? pinned : true;
    set({
      tabs: get().tabs.map((t) => (t.id === tabId ? { ...t, isPinned } : t)),
    });
    debouncePersist();
  },

  reorderTabs: (sourceIndex, targetIndex) => {
    const { tabs } = get();
    const updated = [...tabs];
    const [moved] = updated.splice(sourceIndex, 1);
    updated.splice(targetIndex, 0, moved);
    set({ tabs: updated });
    debouncePersist();
  },

  setTabDirty: (tabId, dirty = true) => {
    set({
      tabs: get().tabs.map((t) => (t.id === tabId ? { ...t, isDirty: dirty } : t)),
    });
  },

  updateTabParams: (tabId, params) => {
    set({
      tabs: get().tabs.map((t) =>
        t.id === tabId ? { ...t, params: { ...t.params, ...params } } : t,
      ),
    });
    debouncePersist();
  },

  setSplitOrientation: (orientation) => {
    set({ splitOrientation: orientation });
    debouncePersist();
  },

  closeAllTabs: () => {
    const { tabs } = get();
    const pinned = tabs.filter((t) => t.isPinned);
    if (pinned.length === 0) return; // Keep at least one tab
    set({
      tabs: pinned,
      activeTabId: pinned[0].id,
      splitOrientation: 'NONE',
    });
    debouncePersist();
  },

  closeOtherTabs: (tabId) => {
    const { tabs } = get();
    const kept = tabs.filter((t) => t.id === tabId || t.isPinned);
    if (kept.length === 0) return;
    set({
      tabs: kept,
      activeTabId: tabId,
      splitOrientation: kept.length <= 1 ? 'NONE' : get().splitOrientation,
    });
    debouncePersist();
  },

  closeTabsToRight: (tabId) => {
    const { tabs } = get();
    const tabIndex = tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return;

    // Keep tabs at or before the specified index, plus pinned tabs to the right
    const kept = tabs.filter((t, i) => i <= tabIndex || t.isPinned);
    if (kept.length === 0) return;

    set({
      tabs: kept,
      activeTabId: tabId,
      splitOrientation: kept.length <= 1 ? 'NONE' : get().splitOrientation,
    });
    debouncePersist();
  },

  loadLayout: (layout) => {
    set({
      tabs: layout.tabs,
      activeTabId: layout.activeTabId,
      splitOrientation: layout.splitOrientation,
      splitRatio: layout.splitRatio,
    });
  },

  persistLayout: () => {
    const state = get();
    const layout: WorkspaceLayout = {
      tabs: state.tabs,
      activeTabId: state.activeTabId || '',
      splitOrientation: state.splitOrientation,
      splitRatio: state.splitRatio,
    };

    const displayStore = useDisplayStore.getState();
    const overrides = { ...displayStore.settings.viewStateOverrides, workspace_layout: layout };
    displayStore.updateDisplaySettings({ viewStateOverrides: overrides });
  },

  setSidebarExpanded: (expanded) => {
    set({ isSidebarExpanded: expanded });
    // Persist sidebar state to display settings
    const displayStore = useDisplayStore.getState();
    const overrides = { ...displayStore.settings.viewStateOverrides, is_sidebar_expanded: expanded };
    displayStore.updateDisplaySettings({ viewStateOverrides: overrides });
  },
}));

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

/** Get the active tab object */
export function getActiveTab(): WorkspaceTab | null {
  const { tabs, activeTabId } = useWorkspaceStore.getState();
  return tabs.find((t) => t.id === activeTabId) || null;
}

/** Get view metadata for a view type */
export function getViewMetadata(viewType: ViewType): ViewMetadata {
  return VIEW_METADATA[viewType];
}

/** Get all view types for the new tab dropdown */
export function getAllViewTypes(): { type: ViewType; meta: typeof VIEW_METADATA[ViewType] }[] {
  return Object.entries(VIEW_METADATA).map(([type, meta]) => ({
    type: type as ViewType,
    meta,
  }));
}
