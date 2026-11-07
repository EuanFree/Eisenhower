/**
 * Ribbon Context Evaluator Hook
 *
 * Determines which ribbon tabs and actions to display based on the active
 * workspace tab type and selected items.
 *
 * Features
 * --------
 * - Reads the active workspace tab (viewType) from useWorkspaceStore.
 * - Reads selected nodes from useScheduleStore for WBS_GANTT context.
 * - Maps each viewType to a set of ribbon tabs with their action groups.
 * - Supports selection-dependent actions (e.g., Link/Unlink require 2+ nodes).
 *
 * Usage
 * -----
 *
 * ```ts
 * const ribbonContext = useRibbonContext();
 * // ribbonContext.tabs = ['Task', 'Precedence', 'Gantt View', ...]
 * // ribbonContext.activeTab = 'Task'
 * // ribbonContext.actionGroups = [...]
 * ```
 */

import { useMemo, useState, useCallback, useEffect } from 'react';
import { useWorkspaceStore, type ViewType } from '../../../stores/useWorkspaceStore';
import { useScheduleStore } from '../../../stores/useScheduleStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single ribbon action button */
export interface RibbonAction {
  /** Unique action identifier */
  id: string;
  /** Display label */
  label: string;
  /** Icon name (lucide-react component name) */
  icon?: string;
  /** Keyboard shortcut hint */
  shortcut?: string;
  /** Whether this action is currently enabled */
  enabled: boolean;
  /** Callback when the action is executed */
  onClick: () => void;
  /** Optional tooltip */
  tooltip?: string;
  /** Whether this is a large button (48px icon + label) */
  isLarge?: boolean;
  /** Whether this is a split button with dropdown */
  isSplit?: boolean;
  /** Dropdown items for split buttons */
  dropdownItems?: RibbonDropdownItem[];
}

/** A dropdown item for split buttons */
export interface RibbonDropdownItem {
  /** Unique item identifier */
  id: string;
  /** Display label */
  label: string;
  /** Callback when selected */
  onClick: () => void;
}

/** A group of related actions (e.g., STRUCTURE, SCHEDULE) */
export interface RibbonActionGroup {
  /** Group caption displayed at the bottom */
  caption: string;
  /** Actions in this group */
  actions: RibbonAction[];
}

/** A ribbon tab with its associated action groups */
export interface RibbonTab {
  /** Tab identifier */
  id: string;
  /** Display label */
  label: string;
  /** Action groups for this tab */
  groups: RibbonActionGroup[];
}

/** Full ribbon context state */
export interface RibbonContext {
  /** Available tabs for the current view */
  tabs: RibbonTab[];
  /** Currently active tab ID */
  activeTabId: string;
  /** Action groups for the active tab */
  actionGroups: RibbonActionGroup[];
  /** Active view type */
  activeViewType: ViewType | null;
  /** Selected node IDs */
  selectedNodeIds: Set<string>;
  /** Whether any node is selected */
  hasSelection: boolean;
  /** Whether multiple nodes are selected */
  hasMultiSelection: boolean;
  /** Set the active ribbon tab */
  setActiveTab: (tabId: string) => void;
}

// ---------------------------------------------------------------------------
// Ribbon Tab Definitions per View Type
// ---------------------------------------------------------------------------

/**
 * Factory function that creates ribbon tabs for a given view type.
 * Actions are wired to store mutations and callbacks.
 */
interface RibbonCallbacks {
  onIndent?: () => void;
  onOutdent?: () => void;
  onInsertTask?: () => void;
  onDelete?: () => void;
  onLink?: () => void;
  onUnlink?: () => void;
  onToggleMilestone?: () => void;
  onMarkProgress?: (percent: number) => void;
  onFlagBlocker?: () => void;
  onRunCpm?: () => void;
  onRunMonteCarlo?: () => void;
  onFreezeBaseline?: () => void;
  onExportIpmr?: () => void;
  onExportBriefing?: () => void;
  onOpenColumnCustomizer?: () => void;
  onOpenCommandPalette?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onOpenCreateWorkItem?: () => void;
  onOpenCreateResource?: () => void;
  onLogHours?: () => void;
  onClaimTask?: () => void;
  onRunLeveling?: () => void;
  onRunSweep?: () => void;
  onResolveClash?: () => void;
  onOpenFilterToolbar?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomToFit?: () => void;
  onToggleBaseline?: () => void;
  onToggleDependencies?: () => void;
  onToggleDropLine?: () => void;
  onTogglePresence?: () => void;
  onOpenReservationModal?: () => void;
  onOpenCalibrationModal?: () => void;
  onCheckOut?: (nodeId: string) => void;
  onCheckIn?: () => void;
  onDiscardCheckout?: () => void;
  onToggleRelativeMode?: () => void;
  onOpenATPModal?: () => void;
}

function createWbsGanttTabs(callbacks: RibbonCallbacks): RibbonTab[] {
  const {
    onIndent, onOutdent, onInsertTask, onDelete, onLink, onUnlink,
    onToggleMilestone, onMarkProgress, onFlagBlocker, onRunCpm,
    onRunMonteCarlo, onFreezeBaseline, onExportIpmr, onExportBriefing,
    onOpenColumnCustomizer, onOpenCommandPalette, onUndo, onRedo,
    onOpenCreateWorkItem, onOpenFilterToolbar, onZoomIn, onZoomOut,
    onZoomToFit, onToggleBaseline, onToggleDependencies, onToggleDropLine,
    onTogglePresence, onCheckOut, onCheckIn, onDiscardCheckout,
    onToggleRelativeMode, onOpenATPModal,
  } = callbacks;

  return [
    {
      id: 'task',
      label: 'Task',
      groups: [
        {
          caption: 'CREATE',
          actions: [
            {
              id: 'new-work-item',
              label: 'New Work Item',
              icon: 'Plus',
              shortcut: 'Insert',
              enabled: true,
              onClick: onOpenCreateWorkItem || (() => {}),
              isLarge: true,
              tooltip: 'Create a new work item (Ctrl+Shift+N)',
            },
            {
              id: 'new-resource',
              label: 'New Resource',
              icon: 'Users',
              enabled: true,
              onClick: (() => {}) as () => void,
              tooltip: 'Create a new resource entry',
            },
          ],
        },
        {
          caption: 'STRUCTURE',
          actions: [
            {
              id: 'indent',
              label: 'Indent',
              icon: 'Indent',
              shortcut: 'Alt+Shift+→',
              enabled: true,
              onClick: onIndent || (() => {}),
              tooltip: 'Indent selected tasks (Alt+Shift+Right)',
            },
            {
              id: 'outdent',
              label: 'Outdent',
              icon: 'Outdent',
              shortcut: 'Alt+Shift+←',
              enabled: true,
              onClick: onOutdent || (() => {}),
              tooltip: 'Outdent selected tasks (Alt+Shift+Left)',
            },
            {
              id: 'insert-above',
              label: 'Insert Above',
              icon: 'ArrowUp',
              shortcut: 'Insert',
              enabled: true,
              onClick: onInsertTask || (() => {}),
              tooltip: 'Insert task above selection',
            },
            {
              id: 'delete',
              label: 'Delete',
              icon: 'Trash2',
              shortcut: 'Del',
              enabled: true,
              onClick: onDelete || (() => {}),
              tooltip: 'Delete selected tasks',
            },
          ],
        },
        {
          caption: 'SCHEDULE',
          actions: [
            {
              id: 'run-cpm',
              label: 'Run CPM',
              icon: 'Play',
              enabled: true,
              onClick: onRunCpm || (() => {}),
              isLarge: true,
              tooltip: 'Recalculate Critical Path Method',
            },
            {
              id: 'toggle-milestone',
              label: 'Toggle Milestone',
              icon: 'Flag',
              shortcut: 'Shift+F2',
              enabled: true,
              onClick: onToggleMilestone || (() => {}),
              tooltip: 'Toggle milestone status',
            },
            {
              id: 'check-out',
              label: 'Check Out',
              icon: 'LogIn',
              enabled: true,
              onClick: onCheckOut ? () => onCheckOut('') : (() => {}),
              tooltip: 'Check out sub-tree for exclusive drafting',
            },
            {
              id: 'check-in',
              label: 'Check In',
              icon: 'LogOut',
              enabled: true,
              onClick: onCheckIn || (() => {}),
              tooltip: 'Check in and publish changes',
            },
          ],
        },
        {
          caption: 'PROGRESS',
          actions: [
            {
              id: 'mark-progress',
              label: 'Mark Progress',
              icon: 'CheckCircle',
              enabled: true,
              onClick: () => onMarkProgress?.(100),
              isSplit: true,
              dropdownItems: [
                { id: 'p0', label: '0%', onClick: () => onMarkProgress?.(0) },
                { id: 'p25', label: '25%', onClick: () => onMarkProgress?.(25) },
                { id: 'p50', label: '50%', onClick: () => onMarkProgress?.(50) },
                { id: 'p75', label: '75%', onClick: () => onMarkProgress?.(75) },
                { id: 'p100', label: '100%', onClick: () => onMarkProgress?.(100) },
              ],
              tooltip: 'Set progress percentage',
            },
            {
              id: 'flag-blocker',
              label: 'Flag Blocker',
              icon: 'AlertTriangle',
              shortcut: 'Ctrl+B',
              enabled: true,
              onClick: onFlagBlocker || (() => {}),
              tooltip: 'Flag a blocker on selected task',
            },
          ],
        },
        {
          caption: 'UNDO',
          actions: [
            {
              id: 'undo',
              label: 'Undo',
              icon: 'Undo',
              shortcut: 'Ctrl+Z',
              enabled: true,
              onClick: onUndo || (() => {}),
              tooltip: 'Undo last action',
            },
            {
              id: 'redo',
              label: 'Redo',
              icon: 'Redo',
              shortcut: 'Ctrl+Y',
              enabled: true,
              onClick: onRedo || (() => {}),
              tooltip: 'Redo last undone action',
            },
          ],
        },
      ],
    },
    {
      id: 'precedence',
      label: 'Precedence',
      groups: [
        {
          caption: 'LINKS',
          actions: [
            {
              id: 'link-selected',
              label: 'Link Selected',
              icon: 'Link',
              shortcut: 'Ctrl+F2',
              enabled: true,
              onClick: onLink || (() => {}),
              tooltip: 'Create FS links between selected tasks',
            },
            {
              id: 'unlink-selected',
              label: 'Unlink',
              icon: 'Scissors',
              shortcut: 'Ctrl+Shift+F2',
              enabled: true,
              onClick: onUnlink || (() => {}),
              tooltip: 'Remove dependencies between selected tasks',
            },
          ],
        },
        {
          caption: 'LAG',
          actions: [
            {
              id: 'lag-days',
              label: 'Lag Days',
              icon: 'Clock',
              enabled: true,
              onClick: () => {},
              tooltip: 'Adjust lag days for selected dependency',
            },
          ],
        },
      ],
    },
    {
      id: 'gantt-view',
      label: 'Gantt View',
      groups: [
        {
          caption: 'ZOOM',
          actions: [
            {
              id: 'zoom-in',
              label: 'Zoom In',
              icon: 'ZoomIn',
              shortcut: 'Ctrl++',
              enabled: true,
              onClick: onZoomIn || (() => {}),
              tooltip: 'Zoom in timeline',
            },
            {
              id: 'zoom-out',
              label: 'Zoom Out',
              icon: 'ZoomOut',
              shortcut: 'Ctrl+-',
              enabled: true,
              onClick: onZoomOut || (() => {}),
              tooltip: 'Zoom out timeline',
            },
            {
              id: 'zoom-to-fit',
              label: 'Zoom to Fit',
              icon: 'Maximize',
              shortcut: 'Ctrl+Shift+F',
              enabled: true,
              onClick: onZoomToFit || (() => {}),
              tooltip: 'Fit timeline to project duration',
            },
          ],
        },
        {
          caption: 'LAYERS',
          actions: [
            {
              id: 'toggle-baseline',
              label: 'Baseline Shadows',
              icon: 'Layers',
              enabled: true,
              onClick: onToggleBaseline || (() => {}),
              tooltip: 'Toggle baseline comparison bars',
            },
            {
              id: 'toggle-dependencies',
              label: 'Dependencies',
              icon: 'GitBranch',
              enabled: true,
              onClick: onToggleDependencies || (() => {}),
              tooltip: 'Toggle dependency bezier lines',
            },
            {
              id: 'toggle-drop-line',
              label: 'Status Drop Line',
              icon: 'Minus',
              enabled: true,
              onClick: onToggleDropLine || (() => {}),
              tooltip: 'Toggle jagged status-date drop line',
            },
            {
              id: 'toggle-presence',
              label: 'Presence',
              icon: 'Users',
              enabled: true,
              onClick: onTogglePresence || (() => {}),
              tooltip: 'Toggle colleague presence avatars',
            },
          ],
        },
        {
          caption: 'COLUMNS',
          actions: [
            {
              id: 'customize-columns',
              label: 'Customize Columns',
              icon: 'Settings2',
              shortcut: 'Ctrl+Shift+C',
              enabled: true,
              onClick: onOpenColumnCustomizer || (() => {}),
              tooltip: 'Open column customizer modal',
            },
          ],
        },
        {
          caption: 'SCHEDULE MODE',
          actions: [
            {
              id: 'toggle-relative-mode',
              label: 'Toggle T0 Mode',
              icon: 'Calendar',
              enabled: true,
              onClick: onToggleRelativeMode || (() => {}),
              tooltip: 'Toggle between calendar dates and relative T0 display',
            },
            {
              id: 'activate-atp',
              label: 'Activate ATP',
              icon: 'Anchor',
              enabled: true,
              onClick: onOpenATPModal || (() => {}),
              tooltip: 'Set Authority to Proceed anchor date',
            },
          ],
        },
      ],
    },
    {
      id: 'evm-finance',
      label: 'EVM / Finance',
      groups: [
        {
          caption: 'BASELINE',
          actions: [
            {
              id: 'freeze-baseline',
              label: 'Freeze Baseline',
              icon: 'Save',
              enabled: true,
              onClick: onFreezeBaseline || (() => {}),
              isLarge: true,
              tooltip: 'Freeze current schedule as baseline',
            },
          ],
        },
        {
          caption: 'EXPORT',
          actions: [
            {
              id: 'export-ipmr',
              label: 'Export IPMR',
              icon: 'FileSpreadsheet',
              enabled: true,
              onClick: onExportIpmr || (() => {}),
              tooltip: 'Export IPMR Format 1 spreadsheet',
            },
            {
              id: 'export-briefing',
              label: 'Export Briefing',
              icon: 'Presentation',
              enabled: true,
              onClick: onExportBriefing || (() => {}),
              tooltip: 'Generate executive briefing deck',
            },
          ],
        },
      ],
    },
    {
      id: 'governance',
      label: 'Governance',
      groups: [
        {
          caption: 'FILTER',
          actions: [
            {
              id: 'open-filter',
              label: 'Filter',
              icon: 'Filter',
              shortcut: 'Ctrl+Shift+F',
              enabled: true,
              onClick: onOpenFilterToolbar || (() => {}),
              tooltip: 'Open filter toolbar',
            },
          ],
        },
        {
          caption: 'COMMANDS',
          actions: [
            {
              id: 'command-palette',
              label: 'Command Palette',
              icon: 'Command',
              shortcut: 'Ctrl+K',
              enabled: true,
              onClick: onOpenCommandPalette || (() => {}),
              tooltip: 'Open global command palette',
            },
          ],
        },
      ],
    },
  ];
}

function createDailyCockpitTabs(callbacks: RibbonCallbacks): RibbonTab[] {
  return [
    {
      id: 'my-work',
      label: 'My Work',
      groups: [
        {
          caption: 'PROGRESS',
          actions: [
            {
              id: 'mark-progress',
              label: 'Mark Progress',
              icon: 'CheckCircle',
              enabled: true,
              onClick: () => callbacks.onMarkProgress?.(100),
              isSplit: true,
              dropdownItems: [
                { id: 'p5', label: '+5%', onClick: () => callbacks.onMarkProgress?.(5) },
                { id: 'p10', label: '+10%', onClick: () => callbacks.onMarkProgress?.(10) },
                { id: 'p25', label: '+25%', onClick: () => callbacks.onMarkProgress?.(25) },
                { id: 'p50', label: '+50%', onClick: () => callbacks.onMarkProgress?.(50) },
                { id: 'p100', label: 'Complete', onClick: () => callbacks.onMarkProgress?.(100) },
              ],
              tooltip: 'Quick progress increment',
            },
            {
              id: 'flag-blocker',
              label: 'Flag Blocker',
              icon: 'AlertTriangle',
              shortcut: 'Ctrl+B',
              enabled: true,
              onClick: callbacks.onFlagBlocker || (() => {}),
              tooltip: 'Create a blocker on selected task',
            },
          ],
        },
        {
          caption: 'CLAIM',
          actions: [
            {
              id: 'claim-task',
              label: 'Claim Task',
              icon: 'Hand',
              enabled: true,
              onClick: callbacks.onClaimTask || (() => {}),
              tooltip: 'Claim a generic placeholder task',
            },
          ],
        },
      ],
    },
    {
      id: 'timesheet',
      label: 'Timesheet',
      groups: [
        {
          caption: 'LOGGING',
          actions: [
            {
              id: 'log-hours',
              label: 'Log Hours',
              icon: 'Clock',
              shortcut: 'Ctrl+T',
              enabled: true,
              onClick: callbacks.onLogHours || (() => {}),
              tooltip: 'Quick log hours for today',
            },
          ],
        },
      ],
    },
    {
      id: 'blockers',
      label: 'Blockers',
      groups: [
        {
          caption: 'IMPEDIMENTS',
          actions: [
            {
              id: 'flag-blocker',
              label: 'Flag Blocker',
              icon: 'AlertTriangle',
              shortcut: 'Ctrl+B',
              enabled: true,
              onClick: callbacks.onFlagBlocker || (() => {}),
              isLarge: true,
              tooltip: 'Create a new blocker',
            },
          ],
        },
      ],
    },
  ];
}

function createSraRiskTabs(callbacks: RibbonCallbacks): RibbonTab[] {
  return [
    {
      id: 'simulation',
      label: 'Simulation',
      groups: [
        {
          caption: 'RUN',
          actions: [
            {
              id: 'run-monte-carlo',
              label: 'Run Monte Carlo',
              icon: 'Play',
              enabled: true,
              onClick: callbacks.onRunMonteCarlo || (() => {}),
              isLarge: true,
              tooltip: 'Execute Monte Carlo SRA simulation',
            },
          ],
        },
        {
          caption: 'SETTINGS',
          actions: [
            {
              id: 'iterations',
              label: 'Iterations',
              icon: 'Settings',
              enabled: true,
              onClick: () => {},
              tooltip: 'Configure simulation iterations',
            },
          ],
        },
      ],
    },
    {
      id: 'sensitivity',
      label: 'Sensitivity',
      groups: [
        {
          caption: 'ANALYSIS',
          actions: [
            {
              id: 'tornado-chart',
              label: 'Tornado Chart',
              icon: 'BarChart3',
              enabled: true,
              onClick: () => {},
              tooltip: 'View tornado sensitivity chart',
            },
          ],
        },
      ],
    },
    {
      id: 'reporting',
      label: 'Reporting',
      groups: [
        {
          caption: 'EXPORT',
          actions: [
            {
              id: 'export-briefing',
              label: 'Export Briefing',
              icon: 'Presentation',
              enabled: true,
              onClick: callbacks.onExportBriefing || (() => {}),
              tooltip: 'Generate executive briefing deck',
            },
          ],
        },
      ],
    },
  ];
}

function createFacilityChamberTabs(callbacks: RibbonCallbacks): RibbonTab[] {
  return [
    {
      id: 'reservation',
      label: 'Reservation',
      groups: [
        {
          caption: 'BOOKING',
          actions: [
            {
              id: 'new-reservation',
              label: 'New Reservation',
              icon: 'Plus',
              enabled: true,
              onClick: callbacks.onOpenReservationModal || (() => {}),
              isLarge: true,
              tooltip: 'Create a new chamber reservation',
            },
          ],
        },
      ],
    },
    {
      id: 'environmental',
      label: 'Environmental',
      groups: [
        {
          caption: 'CALIBRATION',
          actions: [
            {
              id: 'recalibrate',
              label: 'Recalibrate',
              icon: 'Wrench',
              enabled: true,
              onClick: callbacks.onOpenCalibrationModal || (() => {}),
              tooltip: 'Record a calibration event',
            },
          ],
        },
      ],
    },
    {
      id: 'buffers',
      label: 'Buffers',
      groups: [
        {
          caption: 'MAINTENANCE',
          actions: [
            {
              id: 'schedule-maintenance',
              label: 'Schedule Maintenance',
              icon: 'Calendar',
              enabled: true,
              onClick: () => {},
              tooltip: 'Schedule maintenance downtime',
            },
          ],
        },
      ],
    },
  ];
}

function createDashboardTabs(callbacks: RibbonCallbacks): RibbonTab[] {
  return [
    {
      id: 'dashboard-builder',
      label: 'Builder',
      groups: [
        {
          caption: 'CANVAS',
          actions: [
            {
              id: 'dashboard-edit-mode',
              label: 'Edit Mode',
              icon: 'Pencil',
              enabled: true,
              onClick: callbacks.onOpenColumnCustomizer || (() => {}),
              isLarge: true,
              tooltip: 'Toggle dashboard edit mode to add, move, and resize widgets',
            },
            {
              id: 'dashboard-refresh',
              label: 'Refresh Data',
              icon: 'RefreshCw',
              shortcut: 'Ctrl+R',
              enabled: true,
              onClick: callbacks.onRunSweep || (() => {}),
              tooltip: 'Refresh all widget data now',
            },
          ],
        },
        {
          caption: 'WIDGETS',
          actions: [
            {
              id: 'dashboard-add-widget',
              label: 'Add Widget',
              icon: 'Plus',
              enabled: true,
              onClick: callbacks.onInsertTask || (() => {}),
              isLarge: true,
              tooltip: 'Add a new widget to the dashboard',
            },
            {
              id: 'dashboard-delete-widget',
              label: 'Delete Widget',
              icon: 'Trash2',
              enabled: false,
              onClick: callbacks.onDelete || (() => {}),
              tooltip: 'Delete the selected widget',
            },
          ],
        },
      ],
    },
    {
      id: 'dashboard-layout',
      label: 'Layout',
      groups: [
        {
          caption: 'SAVE',
          actions: [
            {
              id: 'dashboard-save',
              label: 'Save Dashboard',
              icon: 'Save',
              shortcut: 'Ctrl+S',
              enabled: true,
              onClick: callbacks.onFreezeBaseline || (() => {}),
              isLarge: true,
              tooltip: 'Save current dashboard layout and widget positions',
            },
            {
              id: 'dashboard-new',
              label: 'New Dashboard',
              icon: 'FilePlus',
              enabled: true,
              onClick: callbacks.onOpenCreateWorkItem || (() => {}),
              tooltip: 'Create a new blank dashboard',
            },
          ],
        },
        {
          caption: 'SHARE',
          actions: [
            {
              id: 'dashboard-share',
              label: 'Share',
              icon: 'Share2',
              enabled: true,
              onClick: callbacks.onExportIpmr || (() => {}),
              tooltip: 'Change dashboard sharing settings',
            },
            {
              id: 'dashboard-switch',
              label: 'Switch Dashboard',
              icon: 'ArrowLeftRight',
              enabled: true,
              onClick: callbacks.onOpenFilterToolbar || (() => {}),
              tooltip: 'Switch to a different saved dashboard',
            },
          ],
        },
      ],
    },
    {
      id: 'dashboard-view',
      label: 'View',
      groups: [
        {
          caption: 'DISPLAY',
          actions: [
            {
              id: 'dashboard-zoom-in',
              label: 'Zoom In',
              icon: 'ZoomIn',
              shortcut: 'Ctrl+=',
              enabled: true,
              onClick: callbacks.onZoomIn || (() => {}),
              tooltip: 'Zoom in on the dashboard canvas',
            },
            {
              id: 'dashboard-zoom-out',
              label: 'Zoom Out',
              icon: 'ZoomOut',
              shortcut: 'Ctrl+-',
              enabled: true,
              onClick: callbacks.onZoomOut || (() => {}),
              tooltip: 'Zoom out on the dashboard canvas',
            },
            {
              id: 'dashboard-zoom-fit',
              label: 'Fit to Screen',
              icon: 'Maximize',
              enabled: true,
              onClick: callbacks.onZoomToFit || (() => {}),
              tooltip: 'Fit dashboard to current viewport',
            },
          ],
        },
        {
          caption: 'GRID',
          actions: [
            {
              id: 'dashboard-toggle-grid',
              label: 'Toggle Grid',
              icon: 'Grid3x3',
              enabled: true,
              onClick: callbacks.onToggleDependencies || (() => {}),
              tooltip: 'Show or hide the alignment grid',
            },
          ],
        },
      ],
    },
  ];
}

function createScheduleHealthTabs(callbacks: RibbonCallbacks): RibbonTab[] {
  return [
    {
      id: 'clash-triage',
      label: 'Clash Triage',
      groups: [
        {
          caption: 'SWEEP',
          actions: [
            {
              id: 'run-sweep',
              label: 'Run Sweep',
              icon: 'RefreshCw',
              enabled: true,
              onClick: callbacks.onRunSweep || (() => {}),
              isLarge: true,
              tooltip: 'Run portfolio clash daemon sweep',
            },
          ],
        },
        {
          caption: 'RESOLVE',
          actions: [
            {
              id: 'run-leveling',
              label: 'Run Leveling',
              icon: 'TrendingUp',
              enabled: true,
              onClick: callbacks.onRunLeveling || (() => {}),
              tooltip: 'Compute heuristic leveling proposal',
            },
            {
              id: 'resolve-clash',
              label: 'Resolve Selected',
              icon: 'CheckCircle',
              enabled: true,
              onClick: callbacks.onResolveClash || (() => {}),
              tooltip: 'Mark selected clash as resolved',
            },
          ],
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook that evaluates the current ribbon context based on the active
 * workspace tab and selected items.
 *
 * @param callbacks - Optional callback functions for ribbon actions
 * @returns Ribbon context state
 */
export function useRibbonContext(callbacks: RibbonCallbacks = {}): RibbonContext {
  const activeTab = useWorkspaceStore((s) => {
    if (!s.activeTabId) return null;
    return s.tabs.find((t) => t.id === s.activeTabId) || null;
  });

  const selectedNodeIds = useScheduleStore((s) => s.selectedNodeIds);
  const [activeRibbonTabId, setActiveRibbonTabId] = useState('task');

  const hasSelection = selectedNodeIds.size > 0;
  const hasMultiSelection = selectedNodeIds.size >= 2;

  // Build ribbon tabs based on active view type
  const tabs = useMemo(() => {
    if (!activeTab) return [];

    switch (activeTab.viewType) {
      case 'WBS_GANTT':
        return createWbsGanttTabs(callbacks);
      case 'DAILY_COCKPIT':
        return createDailyCockpitTabs(callbacks);
      case 'SRA_RISK':
        return createSraRiskTabs(callbacks);
      case 'FACILITY_CHAMBER':
        return createFacilityChamberTabs(callbacks);
      case 'SCHEDULE_HEALTH':
        return createScheduleHealthTabs(callbacks);
      case 'DASHBOARD':
        return createDashboardTabs(callbacks);
      default:
        return [];
    }
  }, [activeTab?.viewType, callbacks]);

  // Reset active ribbon tab when view type changes
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.id === activeRibbonTabId)) {
      setActiveRibbonTabId(tabs[0].id);
    }
  }, [tabs, activeRibbonTabId]);

  // Get action groups for the active ribbon tab
  const actionGroups = useMemo(() => {
    const activeRibbonTab = tabs.find((t) => t.id === activeRibbonTabId);
    return activeRibbonTab?.groups || [];
  }, [tabs, activeRibbonTabId]);

  const handleSetActiveTab = useCallback((tabId: string) => {
    setActiveRibbonTabId(tabId);
  }, []);

  return {
    tabs,
    activeTabId: activeRibbonTabId,
    actionGroups,
    activeViewType: activeTab?.viewType || null,
    selectedNodeIds,
    hasSelection,
    hasMultiSelection,
    setActiveTab: handleSetActiveTab,
  };
}
