/**
 * AppShell Component
 *
 * The persistent sovereign top shell for the Eisenhower Portfolio Manager.
 * This is the root layout component that wraps every page of the application.
 *
 * Structure
 * ---------
 * 1. Top Classification Banner — mandatory security banner (always visible)
 * 2. Main Navigation Bar — breadcrumbs, active project selector, gear icon
 *    for display calibration, and user menu
 * 3. Main View Body — SplitPaneLayout with master Gantt/WBS (upper) and
 *    drill-down workbench (lower), plus SlideOverDrawer for deep config
 * 4. Bottom Classification Banner — mirrors the top banner
 *
 * The shell listens for the Ctrl+Shift+D keyboard shortcut to toggle the
 * DisplayCalibrationModal.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Settings,
  Settings2,
  FolderOpen,
  ChevronRight,
  Home,
  User,
  LogOut,
  PanelRightOpen,
  PanelRightClose,
  Search,
  ExternalLink,
  Monitor,
  Bot,
  Eye,
  EyeOff,
} from 'lucide-react';
import { clsx } from 'clsx';
import { TopBanner, BottomBanner } from './ClassificationBanner';
import DisplayCalibrationModal from './DisplayCalibrationModal';
import AppSidebar from './AppSidebar';
import SplitPaneContainer from './SplitPaneContainer';
import SlideOverDrawer, { DrawerPanel } from './SlideOverDrawer';
import TaskDrillDownWorkbench from '../workbench/TaskDrillDownWorkbench';
import FilterToolbar from '../wbs/FilterToolbar';
import WbsTable from '../wbs/WbsTable';
import GanttViewport from '../gantt/GanttViewport';
import WorkspaceContainer from './workspace/WorkspaceContainer';
import { RibbonContainer } from './ribbon/RibbonContainer';
import CommandPalette from '../navigation/CommandPalette';
import LateralBreadcrumbs from '../navigation/LateralBreadcrumbs';
import ColumnCustomizerModal from '../wbs/ColumnCustomizerModal';
import type { SecurityClassification } from './ClassificationBanner';
import { useDisplayStore } from '../../stores/useDisplayStore';
import { useScheduleStore } from '../../stores/useScheduleStore';
import { useWorkspaceStore, type WorkspaceLayout } from '../../stores/useWorkspaceStore';
import { useSessionStateStore } from '../../stores/useSessionStateStore';
import { useProjectWebSocket } from '../../hooks/useProjectWebSocket';
import { useCommandPalette } from '../../hooks/useCommandPalette';
import { useProjectKeyboardShortcuts } from '../../hooks/useProjectKeyboardShortcuts';
import { useColumnCustomizer } from '../../hooks/useColumnCustomizer';
import { PresenceIndicator } from '../common/PresenceAvatars';
import { TypedConfirmProvider } from '../common/TypedConfirmModal';
import ContextMenuProvider from '../common/contextmenu/ContextMenuProvider';
import ContextMenuRenderer from '../common/contextmenu/ContextMenuRenderer';
import { getWindowSync } from '../../utils/windowSync';
import type { WBSRow } from '../../types/wbs';
import { CopilotPanel } from '../copilot/CopilotPanel';
import { useCopilotStore } from '../../stores/useCopilotStore';
import CreateWorkItemModal from '../authoring/CreateWorkItemModal';
import CreateResourceModal from '../authoring/CreateResourceModal';
import RestoreSessionModal from './RestoreSessionModal';
import { useHistoryStore } from '../../stores/useHistoryStore';
import { registerBuiltInActions } from '../../core/actions/builtInActions';
import { actionRegistry } from '../../core/actions/ActionRegistry';
import {
  useScifShield,
  ScifDisplayShield,
  useClassifiedClipboard,
  useLowProfileMode,
  ScifToast,
} from '../../core/security';
import type { ReAuthCredentials, ScifToastItem } from '../../core/security';
import api, { setAuthToken } from '../../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Breadcrumb {
  label: string;
  href?: string;
}

interface WbsProject {
  id: string;
  code: string;
  name: string;
  planned_start_date: string | null;
  planned_end_date: string | null;
  percent_complete: number | null;
  security_classification: string | null;
}

// ---------------------------------------------------------------------------
// Project Selector Component
// ---------------------------------------------------------------------------

const ProjectSelector: React.FC<{ activeProject: string }> = ({ activeProject }) => {
  const [projects, setProjects] = useState<WbsProject[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadTree = useScheduleStore((s) => s.loadTree);

  useEffect(() => {
    api.get('/wbs/projects')
      .then((res) => {
        const data = res.data || res;
        setProjects(Array.isArray(data) ? data : []);
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  const handleSelect = (project: WbsProject) => {
    setMenuOpen(false);
    // Load the selected project's WBS tree
    loadTree(project.id);
  };

  const selectedProject = projects.find((p) => p.name === activeProject);

  return (
    <div className="relative flex-shrink-0" ref={menuRef}>
      <button
        onClick={() => setMenuOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 bg-bg-ops-overlay rounded-md border border-border-ops-subtle hover:border-border-ops-strong transition-colors"
        aria-label="Select project"
        aria-expanded={menuOpen}
      >
        <FolderOpen className="w-4 h-4 text-text-ops-muted" />
        <span className="text-sm font-mono text-text-ops-primary truncate max-w-[200px]">
          {loading ? 'Loading...' : (selectedProject?.name || activeProject || 'Select Project')}
        </span>
        <ChevronRight className="w-3 h-3 text-text-ops-muted rotate-90" />
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-bg-ops-surface border border-border-ops-subtle rounded-md shadow-lg z-50 max-h-96 overflow-auto">
          <div className="py-1">
            {projects.length === 0 ? (
              <div className="px-4 py-3 text-sm text-text-ops-muted">No projects available</div>
            ) : (
              projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => handleSelect(project)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-bg-ops-overlay transition-colors',
                    selectedProject?.id === project.id && 'bg-bg-ops-overlay/50'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-ops-primary truncate">{project.name}</div>
                    <div className="text-xs text-text-ops-muted font-mono">{project.code}</div>
                  </div>
                  {project.percent_complete !== null && (
                    <span className="text-xs text-text-ops-muted flex-shrink-0">{project.percent_complete}%</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface AppShellProps {
  /** Children content rendered in the main body (optional; if omitted, uses default workspace layout) */
  children?: React.ReactNode;
  /** Current classification level of the active view */
  classification?: SecurityClassification;
  /** Active handling caveats */
  caveats?: string[];
  /** Breadcrumb trail for the current page */
  breadcrumbs?: Breadcrumb[];
  /** Currently selected project name */
  activeProject?: string;
  /** Current user's display name */
  userName?: string;
  /** Optional project ID for clash sweeps and view parameters */
  projectId?: string;
}

// ---------------------------------------------------------------------------
// Navigation Bar
// ---------------------------------------------------------------------------

const NavBar: React.FC<{
  breadcrumbs: Breadcrumb[];
  activeProject: string;
  userName: string;
  onOpenCalibration: () => void;
  onOpenPalette: () => void;
  onToggleDrawer: () => void;
  drawerOpen: boolean;
  wsConnected?: boolean;
  wsReconnectAttempts?: number;
  onOpenColumnCustomizer?: () => void;
  onToggleLowProfile: () => void;
  onLowProfileActive: boolean;
}> = ({ breadcrumbs, activeProject, userName, onOpenCalibration, onOpenPalette, onToggleDrawer, drawerOpen, wsConnected = false, wsReconnectAttempts = 0, onOpenColumnCustomizer, onToggleLowProfile, onLowProfileActive }) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <nav
      className="w-full flex items-center gap-4 px-4 py-2 border-b border-border-ops-subtle bg-bg-ops-surface"
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Lateral Breadcrumbs */}
      <div className="flex-1 overflow-hidden min-w-0">
        <LateralBreadcrumbs
          ltreePath={activeProject || ''}
          pathLabels={breadcrumbs.reduce((acc, b, i) => {
            const segments = (activeProject || '').split('.');
            if (segments[i]) acc[segments[i]] = b.label;
            return acc;
          }, {} as Record<string, string>)}
          onNavigate={(nodeId: string) => {
            console.log('Navigate to node:', nodeId);
          }}
        />
      </div>

      {/* Command Palette Trigger */}
      <button
        type="button"
        onClick={onOpenPalette}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong transition-colors flex-shrink-0"
        aria-label="Open command palette (Ctrl+K)"
        title="Command Palette (Ctrl+K)"
      >
        <Search className="w-4 h-4" />
        <kbd className="text-[10px] px-1 py-0.5 rounded bg-bg-ops-base border border-border-ops-subtle">
          ⌘K
        </kbd>
      </button>

      {/* Active Project Selector with Dropdown */}
      <ProjectSelector activeProject={activeProject} />

      {/* WebSocket Presence Indicator */}
      <PresenceIndicator isConnected={wsConnected} reconnectAttempts={wsReconnectAttempts} />

      {/* CoPilot Toggle */}
      <button
        onClick={useCopilotStore.getState().togglePanel}
        className="p-2 rounded-md text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors flex-shrink-0"
        aria-label="Toggle CoPilot panel (Ctrl+J)"
        title="CoPilot (Ctrl+J)"
      >
        <Bot className="w-5 h-5" />
      </button>

      {/* Slide-Over Drawer Toggle */}
      <button
        onClick={onToggleDrawer}
        className="p-2 rounded-md text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors flex-shrink-0"
        aria-label="Toggle configuration drawer"
        title="Open configuration drawer"
      >
        {drawerOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
      </button>

      {/* Display Calibration Gear */}
      <button
        onClick={onOpenCalibration}
        className="p-2 rounded-md text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors flex-shrink-0"
        aria-label="Open display calibration"
        title="Display Calibration (Ctrl+Shift+D)"
      >
        <Settings className="w-5 h-5" />
      </button>

      {/* Column Customizer */}
      {onOpenColumnCustomizer && (
        <button
          onClick={onOpenColumnCustomizer}
          className="p-2 rounded-md text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors flex-shrink-0"
          aria-label="Open column customizer"
          title="Column Customizer (Ctrl+Shift+C)"
        >
          <Settings2 className="w-5 h-5" />
        </button>
      )}

      {/* Low-Profile / Briefing Mode Toggle */}
      <button
        onClick={onToggleLowProfile}
        className={clsx(
          'p-2 rounded-md transition-colors flex-shrink-0',
          onLowProfileActive
            ? 'text-amber-400 hover:text-amber-300 hover:bg-bg-ops-overlay'
            : 'text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay'
        )}
        aria-label="Toggle Low-Profile / Briefing Mode"
        title="Low-Profile / Briefing Mode (suppress audio & flashing alerts)"
      >
        {onLowProfileActive ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
      </button>

      {/* User Menu */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => setUserMenuOpen((o) => !o)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
          aria-label="User menu"
          aria-expanded={userMenuOpen}
        >
          <User className="w-4 h-4" />
          <span className="text-sm truncate max-w-[120px]">{userName || 'User'}</span>
        </button>

        {userMenuOpen && (
          <div className="absolute right-0 top-full mt-1 w-48 bg-bg-ops-surface border border-border-ops-subtle rounded-md shadow-lg z-50">
            <div className="py-1">
              <a
                href="/profile"
                className="flex items-center gap-2 px-4 py-2 text-sm text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
                onClick={() => setUserMenuOpen(false)}
              >
                <User className="w-4 h-4" />
                Profile
              </a>
              <button
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
                onClick={() => {
                  // Force save all session state before sign-out
                  useSessionStateStore.getState().forceSave();
                  useWorkspaceStore.getState().persistLayout();
                  setUserMenuOpen(false);
                }}
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

// ---------------------------------------------------------------------------
// Main Shell
// ---------------------------------------------------------------------------

const AppShell: React.FC<AppShellProps> = ({
  children,
  classification = 'OFFICIAL',
  caveats = [],
  breadcrumbs = [{ label: 'Home', href: '/' }],
  activeProject = '',
  userName = '',
  projectId,
}) => {
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPanel, setDrawerPanel] = useState<DrawerPanel>('CDRL');
  const [showRestoreModal, setShowRestoreModal] = useState(false);

  // Command Palette
  const commandPalette = useCommandPalette();

  // Column Customizer
  const columnCustomizer = useColumnCustomizer();

  // Register built-in actions with the Action Registry at startup
  useEffect(() => {
    registerBuiltInActions();
  }, []);

  // Hydrate display settings on mount
  const hydrated = useDisplayStore((s) => s.hydrated);
  const hydrate = useDisplayStore((s) => s.hydrateDisplaySettings);

  // Schedule store for drill-down data and default project root
  const selectedNodeId = useScheduleStore((s) => s.selectedNodeId);
  const rows = useScheduleStore((s) => s.rows);
  const storeRootNodeId = useScheduleStore((s) => s.rootNodeId);
  const loadTree = useScheduleStore((s) => s.loadTree);
  const updateNode = useScheduleStore((s) => s.updateNode);
  const selectNode = useScheduleStore((s) => s.selectNode);
  const openView = useWorkspaceStore((s) => s.openView);
  const effectiveProjectId =
    projectId || (storeRootNodeId && storeRootNodeId !== 'default' ? storeRootNodeId : undefined);

  // WebSocket connection for real-time presence
  const { isConnected, reconnectAttempts, setFocus } = useProjectWebSocket(
    effectiveProjectId || null,
  );

  // Update WebSocket focus when selected node changes
  useEffect(() => {
    if (selectedNodeId) {
      setFocus(selectedNodeId, 'WBS_TABLE');
    }
  }, [selectedNodeId, setFocus]);

  // Find the selected row
  const selectedRow = rows.find((r: WBSRow) => r.id === selectedNodeId) || null;

  // Find child rows of the selected node
  const childRows = useMemo(() => {
    if (!selectedRow) return [];
    const selectedPath = selectedRow.path;
    return rows.filter(
      (r: WBSRow) =>
        r.path.startsWith(selectedPath + '.') &&
        r.path.split('.').length === selectedPath.split('.').length + 1,
    );
  }, [rows, selectedRow]);

  useEffect(() => {
    if (!hydrated) {
      hydrate();
    }
  }, [hydrated, hydrate]);

  // Hydrate session state after display settings are loaded
  const hydrateSessionState = useSessionStateStore((s) => s.hydrateSessionState);
  const restorePromptCheckedRef = useRef(false);
  useEffect(() => {
    if (!hydrated || restorePromptCheckedRef.current) return;
    restorePromptCheckedRef.current = true;
    hydrateSessionState();
    const { detachedWindows: savedDetached } = useSessionStateStore.getState();
    if (savedDetached.length > 0) {
      setShowRestoreModal(true);
    }
  }, [hydrated, hydrateSessionState]);

  // Load persisted workspace layout from display settings
  const loadWorkspaceLayout = useWorkspaceStore((s) => s.loadLayout);
  useEffect(() => {
    if (!hydrated) return;
    const overrides = useDisplayStore.getState().settings.viewStateOverrides;
    const workspaceLayout = overrides?.workspace_layout as WorkspaceLayout | undefined;
    if (workspaceLayout && workspaceLayout.tabs?.length > 0) {
      loadWorkspaceLayout(workspaceLayout);
    }
  }, [hydrated, loadWorkspaceLayout]);

  // Restore per-view state for each loaded tab after workspace layout is loaded
  useEffect(() => {
    if (!hydrated) return;
    const tabs = useWorkspaceStore.getState().tabs;
    const perView = useSessionStateStore.getState().perViewState;
    const scheduleStore = useScheduleStore.getState();

    for (const tab of tabs) {
      const savedState = perView[tab.id];
      if (!savedState) continue;

      // Restore selected node for the active tab
      if (tab.id === useWorkspaceStore.getState().activeTabId && savedState.selectedNodeId) {
        scheduleStore.selectNode(savedState.selectedNodeId);
      }
    }
  }, [hydrated]);

  // Global keyboard shortcuts (MS Project bindings + Defence extensions)
  // The hook handles Ctrl+Shift+D (density cycle), Ctrl+K (palette),
  // Ctrl+Z/Y (undo/redo), and all hierarchy/precedence/navigation bindings.
  useProjectKeyboardShortcuts({
    onOpenWorkbench: () => {
      openDrawer('CDRL');
    },
    onFlagBlocker: () => {
      if (selectedNodeId && selectedRow) {
        updateNode(selectedNodeId, {
          custom_attributes: { ...(selectedRow.custom_attributes || {}), is_blocked: true },
        });
        addScifToast(`Flagged blocker on ${selectedRow.code}`, 'warning');
      }
    },
    onLogHours: () => {
      openView('TIMESHEET_COHERENCE');
    },
    onToggleWorkbench: () => {
      toggleDrawer();
    },
    onZoomIn: () => {
      window.dispatchEvent(new CustomEvent('gantt:zoom-in'));
    },
    onZoomOut: () => {
      window.dispatchEvent(new CustomEvent('gantt:zoom-out'));
    },
    onCenterGantt: () => {
      window.dispatchEvent(new CustomEvent('gantt:center-selected'));
    },
    onZoomToFit: () => {
      window.dispatchEvent(new CustomEvent('gantt:zoom-to-fit'));
    },
    onIndent: async () => {
      if (selectedNodeId) {
        await useScheduleStore.getState().indentTask(selectedNodeId);
        addScifToast('Indented task under previous sibling', 'info');
      }
    },
    onOutdent: async () => {
      if (selectedNodeId) {
        await useScheduleStore.getState().outdentTask(selectedNodeId);
        addScifToast('Outdented task to parent level', 'info');
      }
    },
    onInsertSibling: async () => {
      if (selectedNodeId) {
        const created = await useScheduleStore.getState().insertSiblingTask(selectedNodeId, 'FOLLOW_ON');
        if (created) {
          addScifToast(`Inserted sibling task ${created.code}`, 'info');
        }
      } else if (useScheduleStore.getState().rows.length > 0) {
        const rowsList = useScheduleStore.getState().rows;
        const lastRow = rowsList[rowsList.length - 1];
        const created = await useScheduleStore.getState().insertSiblingTask(lastRow.id, 'FOLLOW_ON');
        if (created) {
          addScifToast(`Inserted sibling task ${created.code}`, 'info');
        }
      }
    },
    onInsertChild: async () => {
      if (selectedNodeId) {
        const created = await useScheduleStore.getState().insertChildTask(selectedNodeId);
        if (created) {
          addScifToast(`Inserted child task ${created.code}`, 'info');
        }
      }
    },
    onInsertTaskAbove: async () => {
      if (selectedNodeId) {
        const created = await useScheduleStore.getState().insertSiblingTask(selectedNodeId, 'FOLLOW_ON');
        if (created) {
          addScifToast(`Inserted sibling task ${created.code}`, 'info');
        }
      }
    },
    onDelete: async () => {
      if (selectedNodeId && selectedRow) {
        try {
          await useScheduleStore.getState().deleteNode(selectedNodeId);
          addScifToast(`Deleted ${selectedRow.code}`, 'info');
        } catch (err: any) {
          addScifToast(err?.response?.data?.detail || 'Failed to delete node', 'error');
        }
      }
    },
    onLinkSelected: () => {
      addScifToast('Select two tasks in the Gantt chart to link Finish-to-Start', 'info');
    },
    onUnlinkSelected: () => {
      addScifToast('Select a dependency line in the Gantt chart to unlink', 'info');
    },
  });

  // Register default command palette actions
  useEffect(() => {
    const updateSettings = useDisplayStore.getState().updateDisplaySettings;

    commandPalette.registerAction({
      id: 'freeze-baseline',
      label: 'Freeze Baseline',
      description: 'Freeze current WBS as Performance Measurement Baseline',
      category: 'Schedule',
      execute: () => openView('CHANGE_CONTROL'),
    });
    commandPalette.registerAction({
      id: 'run-leveling',
      label: 'Run Heuristic Leveling',
      description: 'Compute resource leveling proposal for overallocated tasks',
      category: 'Schedule',
      execute: () => openView('SCHEDULE_HEALTH'),
    });
    commandPalette.registerAction({
      id: 'run-monte-carlo',
      label: 'Run Monte Carlo SRA',
      description: 'Execute 2,000-iteration Schedule Risk Analysis simulation',
      category: 'Analysis',
      execute: () => openView('SRA_RISK'),
    });
    commandPalette.registerAction({
      id: 'export-ipmr-format1',
      label: 'Export IPMR Format 1',
      description: 'Generate WBS time-phased EVM report spreadsheet',
      category: 'Reporting',
      execute: () => openView('EVM_REPORTING'),
    });
    commandPalette.registerAction({
      id: 'switch-ultra-dense',
      label: 'Switch Density: Ultra-Dense',
      description: 'Set display density to 28px row height',
      category: 'Display',
      execute: () => updateSettings({ density: 'ULTRA_DENSE' }),
    });
    commandPalette.registerAction({
      id: 'switch-balanced',
      label: 'Switch Density: Balanced',
      description: 'Set display density to 36px row height',
      category: 'Display',
      execute: () => updateSettings({ density: 'BALANCED' }),
    });
    commandPalette.registerAction({
      id: 'switch-comfort',
      label: 'Switch Density: Comfort',
      description: 'Set display density to 44px row height',
      category: 'Display',
      execute: () => updateSettings({ density: 'COMFORT' }),
    });
    commandPalette.registerAction({
      id: 'open-calibration',
      label: 'Open Display Calibration',
      description: 'Open display calibration modal (Ctrl+Shift+D)',
      category: 'Display',
      execute: () => setCalibrationOpen(true),
    });
  }, [commandPalette]);

  // Register entities from schedule store rows
  useEffect(() => {
    const entities = rows.slice(0, 100).map((r: WBSRow) => ({
      id: r.id,
      label: r.code,
      type: 'TASK' as const,
      subtitle: r.name,
      path: r.path,
    }));
    commandPalette.registerEntities(entities);
  }, [rows, commandPalette]);

  // Toggle drawer handler
  const toggleDrawer = useCallback(() => {
    setDrawerOpen((o) => !o);
  }, []);

  const openDrawer = useCallback((panel: DrawerPanel) => {
    setDrawerPanel(panel);
    setDrawerOpen(true);
  }, []);

  // Listen for custom workbench tab open requests (e.g. from Agile Kanban badge)
  useEffect(() => {
    const handleWorkbenchTab = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { tab } = customEvent.detail || {};
      if (tab === 'KANBAN') {
        openDrawer('KANBAN');
      }
    };
    window.addEventListener('workbench:open-tab', handleWorkbenchTab);
    return () => {
      window.removeEventListener('workbench:open-tab', handleWorkbenchTab);
    };
  }, [openDrawer]);

  // Create Work Item & Resource Modal state
  const [createWorkItemOpen, setCreateWorkItemOpen] = useState(false);
  const [createWorkItemParentId, setCreateWorkItemParentId] = useState<string | null>(null);
  const [createWorkItemParentPath, setCreateWorkItemParentPath] = useState('');
  const [createWorkItemEditNodeId, setCreateWorkItemEditNodeId] = useState<string | null>(null);
  const [createResourceOpen, setCreateResourceOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // SCIF Display Shield — idle detection with configurable timeout
  // ---------------------------------------------------------------------------
  const scifShield = useScifShield({
    classification,
    caveats,
  });

  // ---------------------------------------------------------------------------
  // SCIF Toast Notifications
  // ---------------------------------------------------------------------------
  const [scifToasts, setScifToasts] = useState<ScifToastItem[]>([]);

  const addScifToast = useCallback((message: string, type: 'error' | 'warning' | 'info' | 'success' = 'error') => {
    const id = `scif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const toast: ScifToastItem = { id, message, type, duration: 6000 };
    setScifToasts((prev) => [...prev, toast]);
  }, []);

  const dismissScifToast = useCallback((id: string) => {
    setScifToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ---------------------------------------------------------------------------
  // Classified Clipboard Spill Guard
  // ---------------------------------------------------------------------------
  const classifiedClipboard = useClassifiedClipboard({
    targetClassification: classification,
    targetCaveats: caveats,
    sourceClassification: classification,
    sourceCaveats: caveats,
    onBlockedPaste: (message) => {
      console.warn('[SCIF Clipboard]', message);
      addScifToast(message, 'error');
    },
    onAuditEvent: (event, data) => {
      console.warn('[SCIF Audit]', event, data);
    },
  });

  // ---------------------------------------------------------------------------
  // Low-Profile / Briefing Mode
  // ---------------------------------------------------------------------------
  const lowProfile = useLowProfileMode();

  // Re-authentication handler for the display shield
  const handleShieldUnlock = async (credentials: ReAuthCredentials): Promise<boolean> => {
    try {
      const data = (await api.post('/auth/re-authenticate', {
        password: credentials.password,
      })) as { access_token?: string };

      if (data && data.access_token) {
        // Update the auth token so subsequent requests use the fresh token
        setAuthToken(data.access_token);
        scifShield.unshield();
        return true;
      }
      return false;
    } catch (error: any) {
      console.error('[SCIF Shield] Re-authentication failed:', error?.response?.data?.detail || error);
      return false;
    }
  };

  // Main content: children prop takes precedence, otherwise use WorkspaceContainer
  const mainContent = children || <WorkspaceContainer projectId={effectiveProjectId} />;

  // If the SCIF shield is active, render the full-screen lock overlay
  if (scifShield.isShielded) {
    return (
      <ScifDisplayShield
        classification={classification}
        caveats={caveats}
        activeProject={activeProject}
        onUnlock={handleShieldUnlock}
      />
    );
  }

  return (
    <ContextMenuProvider>
      <div className="flex flex-col min-h-screen">
        {/* 1. Top Classification Banner */}
        <TopBanner classification={classification} caveats={caveats} />

        {/* 2. Main Layout: Sidebar + Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Primary Navigation Sidebar */}
          <AppSidebar projectId={projectId} />

          {/* Right: NavBar + Main Content */}
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Navigation Bar */}
            <NavBar
              breadcrumbs={breadcrumbs}
              activeProject={activeProject}
              userName={userName}
              onOpenCalibration={() => setCalibrationOpen(true)}
              onOpenPalette={commandPalette.openPalette}
              onToggleDrawer={toggleDrawer}
              drawerOpen={drawerOpen}
              wsConnected={isConnected}
              wsReconnectAttempts={reconnectAttempts}
              onOpenColumnCustomizer={columnCustomizer.openModal}
              onToggleLowProfile={lowProfile.toggleLowProfile}
              onLowProfileActive={lowProfile.isLowProfile}
            />

            {/* Contextual Ribbon */}
            <RibbonContainer
              callbacks={{
                onIndent: async () => {
                  if (selectedNodeId) {
                    await useScheduleStore.getState().indentTask(selectedNodeId);
                    addScifToast('Indented task under previous sibling', 'info');
                  }
                },
                onOutdent: async () => {
                  if (selectedNodeId) {
                    await useScheduleStore.getState().outdentTask(selectedNodeId);
                    addScifToast('Outdented task to parent level', 'info');
                  }
                },
                onInsertTask: async () => {
                  if (selectedNodeId) {
                    const created = await useScheduleStore.getState().insertSiblingTask(selectedNodeId, 'FOLLOW_ON');
                    if (created) {
                      addScifToast(`Inserted sibling task ${created.code}`, 'info');
                    }
                  } else {
                    setCreateWorkItemOpen(true);
                    setCreateWorkItemParentId(selectedNodeId || effectiveProjectId || null);
                    setCreateWorkItemParentPath(selectedRow?.path || '');
                  }
                },
                onDelete: async () => {
                  if (selectedNodeId && selectedRow) {
                    try {
                      await useScheduleStore.getState().deleteNode(selectedNodeId);
                      addScifToast(`Deleted ${selectedRow.code}`, 'info');
                    } catch (err: any) {
                      addScifToast(err?.response?.data?.detail || 'Failed to delete node', 'error');
                    }
                  }
                },
                onLink: async () => {
                  const selectedSet = Array.from(useScheduleStore.getState().selectedNodeIds);
                  if (selectedSet.length >= 2) {
                    const predId = selectedSet[0];
                    const succId = selectedSet[1];
                    const created = await useScheduleStore.getState().addDependency(predId, succId, 'FS', 0);
                    if (created) {
                      addScifToast('Linked selected tasks (Finish-to-Start)', 'info');
                    } else {
                      addScifToast('Failed to link selected tasks', 'error');
                    }
                    return;
                  }
                  if (selectedNodeId && selectedRow) {
                    const idx = rows.findIndex((r) => r.id === selectedNodeId);
                    const nextRow = rows[idx + 1];
                    if (nextRow) {
                      const created = await useScheduleStore.getState().addDependency(selectedNodeId, nextRow.id, 'FS', 0);
                      if (created) {
                        addScifToast(`Linked ${selectedRow.code} → ${nextRow.code} (FS)`, 'info');
                        return;
                      }
                    }
                  }
                  addScifToast('Select two tasks (Ctrl+Click) or a task with a successor row to create a dependency', 'info');
                },
                onUnlink: async () => {
                  if (selectedNodeId) {
                    const deps = useScheduleStore.getState().dependencies.filter(
                      (d) => d.predecessor_id === selectedNodeId || d.successor_id === selectedNodeId,
                    );
                    if (deps.length > 0) {
                      for (const dep of deps) {
                        await useScheduleStore.getState().removeDependency(dep.id);
                      }
                      addScifToast(`Removed ${deps.length} dependency link(s) for ${selectedRow?.code || 'selected task'}`, 'info');
                      return;
                    }
                  }
                  addScifToast('No dependency links found on the selected task', 'info');
                },
                onToggleMilestone: () => {
                  if (selectedNodeId && selectedRow) {
                    const start = selectedRow.planned_start_date || new Date().toISOString().slice(0, 10);
                    updateNode(selectedNodeId, {
                      planned_start_date: start,
                      planned_end_date: start,
                    });
                    addScifToast(`Converted ${selectedRow.code} to zero-duration milestone`, 'info');
                  }
                },
                onMarkProgress: (percent) => {
                  if (selectedNodeId) {
                    updateNode(selectedNodeId, { percent_complete: percent });
                    addScifToast(`Updated progress to ${percent}%`, 'info');
                  }
                },
                onFlagBlocker: () => {
                  if (selectedNodeId && selectedRow) {
                    updateNode(selectedNodeId, {
                      custom_attributes: { ...(selectedRow.custom_attributes || {}), is_blocked: true },
                    });
                    addScifToast(`Flagged blocker on ${selectedRow.code}`, 'warning');
                  }
                },
                onRunCpm: async () => {
                  if (!effectiveProjectId) return;
                  try {
                    await api.post(`/schedule/${effectiveProjectId}/recalculate-cpm`);
                    await loadTree(effectiveProjectId);
                    addScifToast('CPM schedule recalculated successfully', 'info');
                  } catch (err: any) {
                    addScifToast(err?.response?.data?.detail || 'CPM calculation failed', 'error');
                  }
                },
                onRunMonteCarlo: () => openView('SRA_RISK'),
                onFreezeBaseline: () => openView('CHANGE_CONTROL'),
                onExportIpmr: () => openView('EVM_REPORTING'),
                onExportBriefing: () => openView('EVM_REPORTING'),
                onOpenColumnCustomizer: columnCustomizer.openModal,
                onOpenCommandPalette: commandPalette.openPalette,
                onUndo: () => {
                  const cmd = useHistoryStore.getState().undo();
                  if (cmd) {
                    for (const op of cmd.operations) {
                      updateNode(op.node_id, { [op.field]: op.oldValue } as any);
                    }
                    addScifToast(`Undid: ${cmd.description}`, 'info');
                  }
                },
                onRedo: () => {
                  const cmd = useHistoryStore.getState().redo();
                  if (cmd) {
                    for (const op of cmd.operations) {
                      updateNode(op.node_id, { [op.field]: op.newValue } as any);
                    }
                    addScifToast(`Redid: ${cmd.description}`, 'info');
                  }
                },
                onOpenCreateWorkItem: () => {
                  setCreateWorkItemOpen(true);
                  setCreateWorkItemParentId(selectedNodeId || effectiveProjectId || null);
                  setCreateWorkItemParentPath(selectedRow?.path || '');
                },
                onOpenCreateResource: () => setCreateResourceOpen(true),
                onLogHours: () => openView('TIMESHEET_COHERENCE'),
                onClaimTask: () => {
                  if (selectedNodeId && selectedRow) {
                    updateNode(selectedNodeId, { percent_complete: Math.max(selectedRow.percent_complete || 0, 10) });
                    addScifToast(`Claimed task ${selectedRow.code}`, 'info');
                  }
                },
                onRunLeveling: () => openView('SCHEDULE_HEALTH'),
                onRunSweep: () => openView('SCHEDULE_HEALTH'),
                onResolveClash: () => openView('SCHEDULE_HEALTH'),
                onOpenFilterToolbar: () => openView('WBS_GANTT'),
                onZoomIn: () => window.dispatchEvent(new CustomEvent('gantt:zoom-in')),
                onZoomOut: () => window.dispatchEvent(new CustomEvent('gantt:zoom-out')),
                onZoomToFit: () => window.dispatchEvent(new CustomEvent('gantt:zoom-to-fit')),
                onToggleBaseline: () => window.dispatchEvent(new CustomEvent('gantt:toggle-baseline')),
                onToggleDependencies: () => window.dispatchEvent(new CustomEvent('gantt:toggle-dependencies')),
                onToggleDropLine: () => window.dispatchEvent(new CustomEvent('gantt:toggle-dropline')),
                onTogglePresence: () => window.dispatchEvent(new CustomEvent('gantt:toggle-presence')),
                onOpenReservationModal: () => openView('FACILITY_CHAMBER'),
                onOpenCalibrationModal: () => setCalibrationOpen(true),
              }}
            />

            {/* Main View Body + CoPilot Panel */}
            <div className="flex-1 flex overflow-hidden bg-bg-ops-base">
              <main
                className="flex-1 overflow-hidden"
                role="main"
                id="main-content"
              >
                {mainContent}
              </main>
              {/* CoPilot Docked Panel */}
              <CopilotPanel />
            </div>
          </div>
        </div>

        {/* 3. Bottom Classification Banner */}
        <BottomBanner classification={classification} caveats={caveats} />

        {/* Display Calibration Modal */}
        <DisplayCalibrationModal
          open={calibrationOpen}
          onClose={() => setCalibrationOpen(false)}
        />

        {/* Slide-Over Configuration Drawer */}
        <SlideOverDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          initialPanel={drawerPanel}
        />

        {/* Column Customizer Modal */}
        <ColumnCustomizerModal
          isOpen={columnCustomizer.state.isOpen}
          onClose={columnCustomizer.closeModal}
        />

        {/* Command Palette */}
        <CommandPalette
          isOpen={commandPalette.isOpen}
          onClose={commandPalette.closePalette}
          query={commandPalette.query}
          setQuery={commandPalette.setQuery}
          highlightedIndex={commandPalette.highlightedIndex}
          setHighlightedIndex={commandPalette.setHighlightedIndex}
          results={commandPalette.results}
          executeHighlighted={commandPalette.executeHighlighted}
          onSelectEntity={(entity) => {
            console.log('Navigate to entity:', entity);
            commandPalette.addToHistory({
              type: entity.type,
              label: entity.label,
              target: entity.id,
            });
          }}
          onSelectHistory={(entry) => {
            console.log('Navigate to history:', entry);
          }}
        />

        {/* Typed Confirmation Modal Provider */}
        <TypedConfirmProvider />

        {/* Context Menu Renderer — displays the active right-click menu */}
        <ContextMenuRenderer onAction={(targetType, action, data) => {
          const payload = data as Record<string, unknown> | undefined;
          if (action === 'ADD_CHILD' && targetType === 'TASK') {
            setCreateWorkItemOpen(true);
            setCreateWorkItemParentId((payload?.nodeId || payload?.id) as string || null);
            setCreateWorkItemParentPath(payload?.path as string || '');
            setCreateWorkItemEditNodeId(null);
          } else if (action === 'EDIT_TASK' && targetType === 'TASK') {
            // Open the CreateWorkItemModal in edit mode with the selected task
            const nodeId = (payload?.nodeId || payload?.id) as string;
            if (nodeId) {
              useScheduleStore.getState().selectNode(nodeId);
              setCreateWorkItemEditNodeId(nodeId);
              setCreateWorkItemParentId(null);
              setCreateWorkItemParentPath('');
              setCreateWorkItemOpen(true);
            }
          } else if (action === 'TASK_INFO' && targetType === 'TASK') {
            // Select the task node and open the Task Info drawer panel
            const nodeId = (payload?.nodeId || payload?.id) as string;
            if (nodeId) {
              useScheduleStore.getState().selectNode(nodeId);
            }
            setDrawerPanel('TASK_INFO');
            setDrawerOpen(true);
          } else {
            console.log('Context menu action:', targetType, action, data);
          }
        }} />

        {/* Create Work Item Modal */}
        {createWorkItemOpen && (
          <CreateWorkItemModal
            parentId={createWorkItemParentId}
            parentPath={createWorkItemParentPath}
            editNodeId={createWorkItemEditNodeId}
            onClose={() => {
              setCreateWorkItemOpen(false);
              setCreateWorkItemEditNodeId(null);
            }}
            onCreated={() => {
              loadTree(effectiveProjectId || 'default');
              addScifToast('Work item created successfully', 'info');
            }}
            onUpdated={() => {
              loadTree(effectiveProjectId || 'default');
              addScifToast('Work item updated successfully', 'info');
            }}
          />
        )}

        {/* Create Resource Modal */}
        {createResourceOpen && (
          <CreateResourceModal
            onClose={() => setCreateResourceOpen(false)}
            onCreated={(res) => {
              addScifToast(`Resource ${res.code} created`, 'info');
            }}
          />
        )}

        {/* Restore Previous Session Modal */}
        <RestoreSessionModal
          open={showRestoreModal}
          onClose={() => setShowRestoreModal(false)}
        />

        {/* SCIF Toast Notifications */}
        <ScifToast toasts={scifToasts} onDismiss={dismissScifToast} />

        {/* Pop-Out Buttons for quick detachment via sidebar */}
        <div className="fixed bottom-16 right-4 z-50 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              const sync = getWindowSync();
              sync.popOutView({
                viewType: 'GANTT',
                projectId: effectiveProjectId || '',
                zoomLevel: 'DAYS',
                selectedNodeId: selectedNodeId,
                filterTokens: '',
                filterMode: 'FILTER',
                authToken: localStorage.getItem('authToken') || '',
                apiBaseUrl: window.location.origin,
              });
            }}
            className="flex items-center gap-2 rounded-lg bg-bg-ops-surface border border-border-ops-strong px-3 py-2 text-xs font-medium text-text-ops-muted hover:text-text-ops-primary hover:border-blue-500 transition-all shadow-lg"
            title="Pop out Gantt Chart into standalone window"
          >
            <Monitor className="w-4 h-4" />
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>
    </ContextMenuProvider>
  );
};

export default AppShell;
