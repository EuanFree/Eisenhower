/**
 * Workspace Tab Bar Component
 *
 * The tab bar header for the multi-view workspace docking engine.
 *
 * Features
 * --------
 * - **Draggable Tabs** — Drag-and-drop tab reordering via mouse events.
 * - **Close Buttons** — Each tab has a close button (pinned tabs hide it).
 * - **Dirty Indicators** — Unsaved changes shown as an amber dot.
 * - **Pinned Icons** — Pinned tabs display a pin glyph.
 * - **+ New Tab Dropdown** — Lists all accessible view types for quick launch.
 * - **Right-Hand Controls** — Split window toggle and detach active tab.
 *
 * Usage
 * -----
 *
 * ```tsx
 * <WorkspaceTabBar />
 * ```
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  X,
  Plus,
  Pin,
  Columns,
  Rows,
  ExternalLink,
  ChevronDown,
  LayoutGrid,
  Home,
  BarChart3,
  Thermometer,
  Users,
  FileSpreadsheet,
  Settings,
  Activity,
  FileText,
  Shield,
  ShieldAlert,
  MapPin,
  Lock,
  GitMerge,
  BookOpen,
  MoreVertical,
  LayoutDashboard,
  Calendar,
  AlertTriangle,
  Archive,
  FileCheck,
  Database,
  HardDrive,
  ScrollText,
  Bell,
  Key,
  Download,
  RefreshCw,
  Flag,
  ScanLine,
  Hammer,
  Award,
  Wrench,
  TrendingUp,
  Cpu,
  Bot,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useWorkspaceStore, getAllViewTypes, getViewMetadata } from '../../../stores/useWorkspaceStore';
import type { ViewType, WorkspaceTab } from '../../../stores/useWorkspaceStore';
import { getWindowSync } from '../../../utils/windowSync';
import { detachViewToWindow, isViewDetached } from '../../../utils/detachWindow';

// ---------------------------------------------------------------------------
// View Type Icon Map
// ---------------------------------------------------------------------------

const VIEW_ICON_MAP: Record<ViewType, React.ElementType> = {
  WBS_GANTT: LayoutGrid,
  DAILY_COCKPIT: Home,
  BLOCKED_ACTIVITIES: ShieldAlert,
  SRA_RISK: BarChart3,
  FACILITY_CHAMBER: Thermometer,
  SUPPLIER_PORTAL: Users,
  EVM_REPORTING: FileSpreadsheet,
  CUSTOM_FIELDS: Settings,
  SCHEDULE_HEALTH: Activity,
  CONTRACT_DELIVERABLES: FileText,
  CHANGE_CONTROL: Shield,
  LOCATION_EXPLORER: MapPin,
  DOCUMENT_VAULT: Lock,
  MERKLE_SYNC: GitMerge,
  HELP_CENTER: BookOpen,
  DASHBOARD: LayoutDashboard,
  // Remaining view types — default icons
  COSTING: FileSpreadsheet,
  PROCUREMENT: Users,
  COMMERCIAL: Shield,
  TEMPLATES: Settings,
  ENGINEERING: Shield,
  EQUIPMENT: Settings,
  MATERIALS: Users,
  RESERVES: FileSpreadsheet,
  CURRENCY: FileSpreadsheet,
  CALENDARS: Calendar,
  SCHEDULE_QUARANTINE: AlertTriangle,
  SUBCONTRACTORS: Users,
  REQUISITIONS: FileText,
  SANDBOXES: GitMerge,
  PROGRAMMES: Archive,
  AIRGAP: Lock,
  AUDIT: FileCheck,
  ADMIN_SECURITY: Shield,
  DB_HEALTH: Database,
  BACKUP_MANAGER: HardDrive,
  LOG_VIEWER: ScrollText,
  USER_MANAGEMENT: Users,
  SYSTEM_CONFIG: Settings,
  SERVICE_HEALTH: Activity,
  ALERTING: Bell,
  MONITORING: BarChart3,
  PASSWORD_POLICY: Key,
  DATA_EXPORT: Download,
  LOG_ROTATION: RefreshCw,
  FEATURE_FLAGS: Flag,
  SECURITY_SCAN: ScanLine,
  SECRET_ROTATION: Lock,
  MAINTENANCE_MODE: Hammer,
  LEAVE_MANAGEMENT: Calendar,
  LINE_MANAGER_DASHBOARD: Users,
  RESOURCE_SKILLS: Award,
   RESOURCE_DOWNTIME: Wrench,
    DELEGATION_MANAGEMENT: Shield,
    WORKFORCE_FORECAST: BarChart3,
    TIMESHEET_COHERENCE: FileSpreadsheet,
    COST_SPREADING: TrendingUp,
    EXPORT_CONTROL: Lock,
    HARDWARE_ENCLAVE: Cpu,
    COPILOT: Shield,
    CCB_ARBITRATION: Shield,
    SBOM_VULNERABILITY: Shield,
    SANDTABLE: Shield,
    CAM_EVM_CLOSEOUT_WIZARD: Shield,
    AGENT_REVIEW_WORKBENCH: Bot,
    SETTINGS: Settings,
};

// ---------------------------------------------------------------------------
// Tab Item Component
// ---------------------------------------------------------------------------

interface TabItemProps {
  tab: WorkspaceTab;
  isActive: boolean;
  index: number;
  totalTabs: number;
}

const TabItem: React.FC<TabItemProps> = ({ tab, isActive, index, totalTabs }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const dragStartIndex = useRef<number | null>(null);

  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const closeOtherTabs = useWorkspaceStore((s) => s.closeOtherTabs);
  const closeTabsToRight = useWorkspaceStore((s) => s.closeTabsToRight);
  const pinTab = useWorkspaceStore((s) => s.pinTab);
  const reorderTabs = useWorkspaceStore((s) => s.reorderTabs);

  const Icon = VIEW_ICON_MAP[tab.viewType];

  // Close context menu on outside click
  useEffect(() => {
    if (!showContextMenu) return;
    const handleClick = () => setShowContextMenu(false);
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showContextMenu]);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      dragStartIndex.current = index;
      setIsDragging(true);
      e.dataTransfer.effectAllowed = 'move';
    },
    [index],
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setIsDragOver(false);
    dragStartIndex.current = null;
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const from = dragStartIndex.current;
      if (from !== null && from !== index) {
        reorderTabs(from, index);
      }
      handleDragEnd();
    },
    [index, reorderTabs, handleDragEnd],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenuPos({ x: e.clientX, y: e.clientY });
      setShowContextMenu(true);
    },
    [],
  );

  const handleDetach = useCallback(() => {
    setShowContextMenu(false);
    detachViewToWindow(tab.viewType, tab.params);
  }, [tab]);

  return (
    <>
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onContextMenu={handleContextMenu}
        onClick={() => setActiveTab(tab.id)}
        className={clsx(
          'group flex items-center gap-1.5 px-3 py-1.5 cursor-default select-none transition-all border-r border-border-ops-subtle min-w-[120px] max-w-[200px]',
          isActive
            ? 'bg-bg-ops-base text-text-ops-primary border-b-2 border-b-blue-500'
            : 'bg-bg-ops-surface text-text-ops-muted hover:bg-bg-ops-overlay hover:text-text-ops-primary',
          isDragging && 'opacity-50',
          isDragOver && 'bg-blue-900/20 border-blue-500/50',
        )}
        role="tab"
        aria-selected={isActive}
        aria-label={tab.title}
      >
        {/* Pin Icon */}
        {tab.isPinned && (
          <Pin
            className={clsx(
              'w-3 h-3 flex-shrink-0',
              isActive ? 'text-blue-400' : 'text-text-ops-muted',
            )}
            onClick={(e) => {
              e.stopPropagation();
              pinTab(tab.id, !tab.isPinned);
            }}
          />
        )}

        {/* View Type Icon */}
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />

        {/* Title */}
        <span className="flex-1 truncate text-sm font-medium">{tab.title}</span>

        {/* Dirty Indicator */}
        {tab.isDirty && !isActive && (
          <div className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
        )}

        {/* Context Menu Trigger (visible on hover) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setContextMenuPos({ x: e.clientX, y: e.clientY });
            setShowContextMenu(true);
          }}
          className={clsx(
            'p-0.5 rounded flex-shrink-0 transition-colors',
            'opacity-0 group-hover:opacity-100',
            'hover:bg-bg-ops-overlay hover:text-text-ops-primary',
          )}
          aria-label="Tab options"
        >
          <MoreVertical className="w-3 h-3" />
        </button>

        {/* Close Button (hidden for pinned tabs) */}
        {!tab.isPinned && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            className={clsx(
              'p-0.5 rounded flex-shrink-0 transition-colors',
              'opacity-0 group-hover:opacity-100',
              'hover:bg-bg-ops-overlay hover:text-red-400',
            )}
            aria-label={`Close tab: ${tab.title}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Right-Click Context Menu */}
      {showContextMenu && (
        <div
          className="fixed z-50 bg-bg-ops-surface border border-border-ops-strong rounded-md shadow-2xl py-1 min-w-[200px]"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-border-ops-subtle">
            <span className="text-xs font-medium text-text-ops-primary truncate block">
              {tab.title}
            </span>
          </div>

          {/* Pin Tab */}
          <button
            type="button"
            onClick={() => {
              setShowContextMenu(false);
              pinTab(tab.id, !tab.isPinned);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
          >
            <Pin className="w-4 h-4" />
            <span>{tab.isPinned ? 'Unpin Tab' : 'Pin Tab'}</span>
          </button>

          <div className="border-t border-border-ops-subtle my-1" />

          {/* Close Others */}
          <button
            type="button"
            onClick={() => {
              setShowContextMenu(false);
              closeOtherTabs(tab.id);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
          >
            <X className="w-4 h-4" />
            <span>Close Others</span>
          </button>

          {/* Close All to the Right */}
          <button
            type="button"
            onClick={() => {
              setShowContextMenu(false);
              closeTabsToRight(tab.id);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
          >
            <X className="w-4 h-4" />
            <span>Close All to the Right</span>
          </button>

          <div className="border-t border-border-ops-subtle my-1" />

          {/* Detach to Window */}
          <button
            type="button"
            onClick={handleDetach}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Detach to Window</span>
          </button>
        </div>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// New Tab Dropdown
// ---------------------------------------------------------------------------

const NewTabDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const openView = useWorkspaceStore((s) => s.openView);

  const viewTypes = getAllViewTypes();

  // Close on outside click
  React.useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className={clsx(
          'p-1.5 rounded-md transition-colors',
          'text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay',
        )}
        aria-label="Open new tab"
        aria-expanded={isOpen}
        title="New Tab"
      >
        <Plus className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-64 bg-bg-ops-surface border border-border-ops-strong rounded-md shadow-2xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-border-ops-subtle">
            <span className="text-xs font-semibold text-text-ops-muted uppercase tracking-wider">
              Open View
            </span>
          </div>
          <div className="max-h-96 overflow-y-auto py-1">
            {viewTypes.map(({ type, meta }) => {
              const Icon = VIEW_ICON_MAP[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    openView(type);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
                >
                  <Icon className="w-4 h-4 text-text-ops-muted" />
                  <div className="flex-1 text-left">
                    <div className="font-medium">{meta.label}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Split Controls
// ---------------------------------------------------------------------------

const SplitControls: React.FC = () => {
  const splitOrientation = useWorkspaceStore((s) => s.splitOrientation);
  const setSplitOrientation = useWorkspaceStore((s) => s.setSplitOrientation);
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTab = useWorkspaceStore((s) => s.activeTabId);

  const canSplit = tabs.length >= 2;

  const handleDetach = useCallback(() => {
    const active = tabs.find((t) => t.id === activeTab);
    if (!active) return;

    const sync = getWindowSync();
    sync.popOutView({
      viewType: active.viewType as any,
      projectId: active.params?.projectId || '',
      zoomLevel: 'DAYS',
      selectedNodeId: active.params?.selectedNodeId || null,
      filterTokens: '',
      filterMode: 'FILTER',
      authToken: localStorage.getItem('authToken') || '',
      apiBaseUrl: window.location.origin,
    });
  }, [tabs, activeTab]);

  return (
    <div className="flex items-center gap-1">
      {/* Split Horizontal */}
      <button
        type="button"
        onClick={() =>
          setSplitOrientation(
            splitOrientation === 'HORIZONTAL' ? 'NONE' : 'HORIZONTAL',
          )
        }
        disabled={!canSplit}
        className={clsx(
          'p-1.5 rounded-md transition-colors',
          splitOrientation === 'HORIZONTAL'
            ? 'bg-blue-900/30 text-blue-400'
            : 'text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay',
          !canSplit && 'opacity-30 cursor-not-allowed',
        )}
        title="Split horizontally (side by side)"
      >
        <Columns className="w-4 h-4" />
      </button>

      {/* Split Vertical */}
      <button
        type="button"
        onClick={() =>
          setSplitOrientation(
            splitOrientation === 'VERTICAL' ? 'NONE' : 'VERTICAL',
          )
        }
        disabled={!canSplit}
        className={clsx(
          'p-1.5 rounded-md transition-colors',
          splitOrientation === 'VERTICAL'
            ? 'bg-blue-900/30 text-blue-400'
            : 'text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay',
          !canSplit && 'opacity-30 cursor-not-allowed',
        )}
        title="Split vertically (top / bottom)"
      >
        <Rows className="w-4 h-4" />
      </button>

      {/* Detach Active Tab */}
      <button
        type="button"
        onClick={handleDetach}
        className="p-1.5 rounded-md text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
        title="Detach active tab into new window"
      >
        <ExternalLink className="w-4 h-4" />
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Tab Bar Component
// ---------------------------------------------------------------------------

const WorkspaceTabBar: React.FC = () => {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);

  return (
    <div
      className="flex items-center bg-bg-ops-surface border-b border-border-ops-subtle overflow-x-auto"
      role="tablist"
      aria-label="Workspace tabs"
    >
      {/* Tab List */}
      <div className="flex items-center flex-1 min-w-0 overflow-x-auto scrollbar-thin">
        {tabs.map((tab, index) => (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            index={index}
            totalTabs={tabs.length}
          />
        ))}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1 px-2 flex-shrink-0 border-l border-border-ops-subtle">
        <SplitControls />
        <NewTabDropdown />
      </div>
    </div>
  );
};

export default WorkspaceTabBar;
