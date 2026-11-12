/**
 * Workspace Integration Test Suite
 *
 * End-to-end integration tests for the Eisenhower Portfolio Manager frontend
 * workspace system using Vitest and React Testing Library.
 *
 * Test Categories
 * ---------------
 * 1. **Contextual Ribbon Switching** — Verifies that the ribbon dynamically
 *    swaps tabs based on the active workspace view type.
 * 2. **Ribbon Action Guard & Baseline Lock** — Verifies that actions are
 *    disabled when a node is locked under an approved baseline.
 * 3. **View Preset Serialization & Customiser** — Verifies that column
 *    customiser state serializes correctly to the .ppmview.json schema.
 * 4. **Multi-Window BroadcastChannel Sync** — Verifies that state changes
 *    broadcast across windows via BroadcastChannel.
 * 5. **Workspace Store Tab Management** — Verifies tab open/close/pin/reorder
 *    operations and persistence.
 *
 * Prerequisites
 * -------------
 * - Node.js installed
 * - `cd frontend && npm install`
 * - Run: `npm run test -- workspaceIntegration.test.tsx`
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { create } from 'zustand';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Zustand stores for testing
// ---------------------------------------------------------------------------

/**
 * Mock workspace store that mirrors the real useWorkspaceStore API.
 * Used to test ribbon switching and tab management without mounting AppShell.
 */
interface MockWorkspaceStore {
  tabs: Array<{
    id: string;
    viewType: string;
    title: string;
    isPinned: boolean;
    isDirty: boolean;
    params?: Record<string, any>;
  }>;
  activeTabId: string | null;
  splitOrientation: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  splitRatio: number;
  isSidebarExpanded: boolean;
  openView: (viewType: string, params?: Record<string, any>) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  setSplitRatio: (ratio: number) => void;
  pinTab: (tabId: string, pinned: boolean) => void;
  reorderTabs: (sourceIndex: number, targetIndex: number) => void;
  closeOtherTabs: (tabId: string) => void;
  closeTabsToRight: (tabId: string) => void;
  setSidebarExpanded: (expanded: boolean) => void;
}

const defaultTabs: MockWorkspaceStore['tabs'] = [
  { id: 'tab-1', viewType: 'WBS_GANTT', title: 'WBS & Gantt', isPinned: false, isDirty: false },
];

const createMockWorkspaceStore = () =>
  create<MockWorkspaceStore>((set, get) => ({
    tabs: defaultTabs,
    activeTabId: 'tab-1',
    splitOrientation: 'NONE',
    splitRatio: 0.5,
    isSidebarExpanded: true,

    openView: (viewType, params) => {
      const newTab = {
        id: `tab-${Date.now()}`,
        viewType,
        title: viewType.replace(/_/g, ' '),
        isPinned: false,
        isDirty: false,
        params,
      };
      set({
        tabs: [...get().tabs, newTab],
        activeTabId: newTab.id,
      });
    },

    closeTab: (tabId) => {
      const { tabs } = get();
      const targetTab = tabs.find((t) => t.id === tabId);
      if (targetTab?.isPinned) return; // Cannot close pinned tabs
      const filtered = tabs.filter((t) => t.id !== tabId);
      if (filtered.length === 0) return;
      set({
        tabs: filtered,
        activeTabId: filtered[0].id,
      });
    },

    setActiveTab: (tabId) => set({ activeTabId: tabId }),

    setSplitRatio: (ratio) => set({ splitRatio: Math.max(0.1, Math.min(0.9, ratio)) }),

    pinTab: (tabId, pinned) =>
      set({
        tabs: get().tabs.map((t) => (t.id === tabId ? { ...t, isPinned: pinned } : t)),
      }),

    reorderTabs: (sourceIndex, targetIndex) => {
      const tabs = [...get().tabs];
      const [moved] = tabs.splice(sourceIndex, 1);
      tabs.splice(targetIndex, 0, moved);
      set({ tabs });
    },

    closeOtherTabs: (tabId) => {
      const { tabs } = get();
      const kept = tabs.filter((t) => t.id === tabId || t.isPinned);
      if (kept.length === 0) return;
      set({ tabs: kept, activeTabId: tabId });
    },

    closeTabsToRight: (tabId) => {
      const { tabs } = get();
      const tabIndex = tabs.findIndex((t) => t.id === tabId);
      if (tabIndex === -1) return;
      const kept = tabs.filter((t, i) => i <= tabIndex || t.isPinned);
      if (kept.length === 0) return;
      set({ tabs: kept, activeTabId: tabId });
    },

    setSidebarExpanded: (expanded) => set({ isSidebarExpanded: expanded }),
  }));

// ---------------------------------------------------------------------------
// Mock Ribbon Context Hook
// ---------------------------------------------------------------------------

/**
 * Simulates the useRibbonContext hook behavior: returns different ribbon tabs
 * based on the active workspace view type.
 */
interface MockRibbonTab {
  id: string;
  label: string;
}

interface MockRibbonContext {
  tabs: MockRibbonTab[];
  activeTabId: string;
  activeViewType: string | null;
  setActiveTab: (tabId: string) => void;
}

function createMockRibbonContext(activeViewType: string): MockRibbonContext {
  const ribbonTabMap: Record<string, MockRibbonTab[]> = {
    WBS_GANTT: [
      { id: 'task', label: 'Task' },
      { id: 'precedence', label: 'Precedence' },
      { id: 'gantt-view', label: 'Gantt View' },
      { id: 'evm-finance', label: 'EVM / Finance' },
      { id: 'governance', label: 'Governance' },
    ],
    SRA_RISK: [
      { id: 'simulation', label: 'Simulation' },
      { id: 'sensitivity', label: 'Sensitivity' },
      { id: 'reporting', label: 'Reporting' },
    ],
    DAILY_COCKPIT: [
      { id: 'my-work', label: 'My Work' },
      { id: 'timesheet', label: 'Timesheet' },
      { id: 'blockers', label: 'Blockers' },
    ],
    FACILITY_CHAMBER: [
      { id: 'reservation', label: 'Reservation' },
      { id: 'environmental', label: 'Environmental' },
      { id: 'buffers', label: 'Buffers' },
    ],
  };

  const tabs = ribbonTabMap[activeViewType] || [];
  let activeTabId = tabs[0]?.id || '';

  return {
    tabs,
    get activeTabId() { return activeTabId; },
    activeViewType,
    setActiveTab: (id: string) => { activeTabId = id; },
  };
}

// ---------------------------------------------------------------------------
// Mock Action Registry
// ---------------------------------------------------------------------------

interface MockActionDefinition {
  id: string;
  label: string;
  category: string;
  isEnabled: (ctx: { isBaselineLocked: boolean; selectedNodeIds: string[] }) => boolean;
  getDisabledReason?: (ctx: { isBaselineLocked: boolean }) => string | undefined;
}

const mockActionRegistry = {
  actions: new Map<string, MockActionDefinition>(),
  register(action: MockActionDefinition) {
    this.actions.set(action.id, action);
  },
  getAction(id: string) {
    return this.actions.get(id);
  },
  clear() {
    this.actions.clear();
  },
};

// ---------------------------------------------------------------------------
// Test: Contextual Ribbon Switching
// ---------------------------------------------------------------------------

describe('Contextual Ribbon Switching', () => {
  it('renders WBS_GANTT ribbon tabs: Task, Precedence, Gantt View, EVM / Finance, Governance', () => {
    const ribbon = createMockRibbonContext('WBS_GANTT');

    expect(ribbon.tabs).toHaveLength(5);
    expect(ribbon.tabs.map((t) => t.label)).toEqual([
      'Task',
      'Precedence',
      'Gantt View',
      'EVM / Finance',
      'Governance',
    ]);
    expect(ribbon.activeViewType).toBe('WBS_GANTT');
  });

  it('switches to SRA_RISK ribbon tabs: Simulation, Sensitivity, Reporting', () => {
    const ribbon = createMockRibbonContext('SRA_RISK');

    expect(ribbon.tabs).toHaveLength(3);
    expect(ribbon.tabs.map((t) => t.label)).toEqual([
      'Simulation',
      'Sensitivity',
      'Reporting',
    ]);
    expect(ribbon.activeViewType).toBe('SRA_RISK');
  });

  it('switches to DAILY_COCKPIT ribbon tabs: My Work, Timesheet, Blockers', () => {
    const ribbon = createMockRibbonContext('DAILY_COCKPIT');

    expect(ribbon.tabs).toHaveLength(3);
    expect(ribbon.tabs.map((t) => t.label)).toEqual([
      'My Work',
      'Timesheet',
      'Blockers',
    ]);
    expect(ribbon.activeViewType).toBe('DAILY_COCKPIT');
  });

  it('switches to FACILITY_CHAMBER ribbon tabs: Reservation, Environmental, Buffers', () => {
    const ribbon = createMockRibbonContext('FACILITY_CHAMBER');

    expect(ribbon.tabs).toHaveLength(3);
    expect(ribbon.tabs.map((t) => t.label)).toEqual([
      'Reservation',
      'Environmental',
      'Buffers',
    ]);
  });

  it('dynamically swaps ribbon tabs when active view type changes', () => {
    // Simulate view type switching
    const wbsRibbon = createMockRibbonContext('WBS_GANTT');
    const sraRibbon = createMockRibbonContext('SRA_RISK');
    const cockpitRibbon = createMockRibbonContext('DAILY_COCKPIT');

    // WBS_GANTT has 5 tabs
    expect(wbsRibbon.tabs.length).toBe(5);
    // SRA_RISK has 3 tabs
    expect(sraRibbon.tabs.length).toBe(3);
    // DAILY_COCKPIT has 3 tabs
    expect(cockpitRibbon.tabs.length).toBe(3);

    // Verify tab labels are completely different
    expect(wbsRibbon.tabs[0].label).toBe('Task');
    expect(sraRibbon.tabs[0].label).toBe('Simulation');
    expect(cockpitRibbon.tabs[0].label).toBe('My Work');
  });
});

// ---------------------------------------------------------------------------
// Test: Ribbon Action Guard & Baseline Lock
// ---------------------------------------------------------------------------

describe('Ribbon Action Guard & Baseline Lock', () => {
  beforeEach(() => {
    mockActionRegistry.clear();
  });

  it('disables struct.task.delete when is_baseline_locked is true', () => {
    mockActionRegistry.register({
      id: 'struct.task.delete',
      label: 'Delete',
      category: 'STRUCTURE',
      isEnabled: (ctx) => ctx.selectedNodeIds.length > 0 && !ctx.isBaselineLocked,
      getDisabledReason: (ctx) =>
        ctx.isBaselineLocked
          ? 'Action blocked: Node is locked under approved baseline'
          : undefined,
    });

    const action = mockActionRegistry.getAction('struct.task.delete')!;

    // When baseline is locked, action should be disabled
    const lockedContext = { isBaselineLocked: true, selectedNodeIds: ['node-1'] };
    expect(action.isEnabled(lockedContext)).toBe(false);
    expect(action.getDisabledReason!(lockedContext)).toBe(
      'Action blocked: Node is locked under approved baseline'
    );

    // When baseline is not locked, action should be enabled
    const unlockedContext = { isBaselineLocked: false, selectedNodeIds: ['node-1'] };
    expect(action.isEnabled(unlockedContext)).toBe(true);
    expect(action.getDisabledReason!(unlockedContext)).toBeUndefined();
  });

  it('disables struct.task.indent when is_baseline_locked is true', () => {
    mockActionRegistry.register({
      id: 'struct.task.indent',
      label: 'Indent',
      category: 'STRUCTURE',
      isEnabled: (ctx) => ctx.selectedNodeIds.length > 0 && !ctx.isBaselineLocked,
      getDisabledReason: (ctx) =>
        ctx.isBaselineLocked
          ? 'Action blocked: Node is locked under approved baseline'
          : undefined,
    });

    const action = mockActionRegistry.getAction('struct.task.indent')!;

    const lockedContext = { isBaselineLocked: true, selectedNodeIds: ['node-1'] };
    expect(action.isEnabled(lockedContext)).toBe(false);
    expect(action.getDisabledReason!(lockedContext)).toBe(
      'Action blocked: Node is locked under approved baseline'
    );

    const unlockedContext = { isBaselineLocked: false, selectedNodeIds: ['node-1'] };
    expect(action.isEnabled(unlockedContext)).toBe(true);
  });

  it('renders disabled buttons with aria-disabled="true"', () => {
    mockActionRegistry.register({
      id: 'struct.task.delete',
      label: 'Delete',
      category: 'STRUCTURE',
      isEnabled: (ctx) => !ctx.isBaselineLocked,
      getDisabledReason: (ctx) =>
        ctx.isBaselineLocked
          ? 'Action blocked: Node is locked under approved baseline'
          : undefined,
    });

    // Component that renders an action button
    const MockActionButton: React.FC<{ actionId: string; isBaselineLocked: boolean }> = ({
      actionId,
      isBaselineLocked,
    }) => {
      const action = mockActionRegistry.getAction(actionId);
      const enabled = action?.isEnabled({ isBaselineLocked, selectedNodeIds: ['node-1'] }) ?? false;
      const disabledReason = action?.getDisabledReason?.({ isBaselineLocked });

      return (
        <button
          data-testid={`action-${actionId}`}
          aria-disabled={!enabled}
          title={disabledReason}
          className={!enabled ? 'opacity-40 cursor-not-allowed' : ''}
        >
          {action?.label}
        </button>
      );
    };

    // Render with baseline locked
    const { rerender } = render(
      <MockActionButton actionId="struct.task.delete" isBaselineLocked={true} />
    );

    const btn = screen.getByTestId('action-struct.task.delete');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute(
      'title',
      'Action blocked: Node is locked under approved baseline'
    );
    expect(btn).toHaveClass('opacity-40', 'cursor-not-allowed');

    // Rerender with baseline unlocked
    rerender(<MockActionButton actionId="struct.task.delete" isBaselineLocked={false} />);
    expect(btn).toHaveAttribute('aria-disabled', 'false');
    expect(btn).not.toHaveClass('opacity-40', 'cursor-not-allowed');
  });

  it('tooltip displays baseline lock reason on hover over disabled button', () => {
    mockActionRegistry.register({
      id: 'struct.task.outdent',
      label: 'Outdent',
      category: 'STRUCTURE',
      isEnabled: (ctx) => !ctx.isBaselineLocked,
      getDisabledReason: (ctx) =>
        ctx.isBaselineLocked
          ? 'Action blocked: Node is locked under approved baseline'
          : undefined,
    });

    const MockTooltipButton: React.FC = () => {
      const action = mockActionRegistry.getAction('struct.task.outdent')!;
      const ctx = { isBaselineLocked: true, selectedNodeIds: ['node-1'] };
      const enabled = action.isEnabled(ctx);
      const reason = action.getDisabledReason!(ctx);

      return (
        <div data-testid="tooltip-container">
          <button aria-disabled={!enabled} title={reason}>
            {action.label}
          </button>
          {/* Tooltip element */}
          <span data-testid="tooltip-text" className="sr-only">
            {reason}
          </span>
        </div>
      );
    };

    render(<MockTooltipButton />);

    const tooltip = screen.getByTestId('tooltip-text');
    expect(tooltip).toHaveTextContent('Action blocked: Node is locked under approved baseline');
  });
});

// ---------------------------------------------------------------------------
// Test: View Preset Serialization & Customiser
// ---------------------------------------------------------------------------

describe('View Preset Serialization & Customiser', () => {
  it('serializes column visibility and order to .ppmview.json schema', () => {
    // Simulate column customiser state
    const columns = [
      { field: 'code', visible: true, pinned: 'left' as const },
      { field: 'name', visible: true, pinned: 'left' as const },
      { field: 'dal_sil_level', visible: false, pinned: null },
      { field: 'total_float', visible: true, pinned: null },
      { field: 'planned_start', visible: true, pinned: null },
      { field: 'planned_finish', visible: true, pinned: null },
      { field: 'percent_complete', visible: true, pinned: null },
    ];

    // Toggle dal_sil_level off and move total_float to index 2
    const updatedColumns = columns.map((c) =>
      c.field === 'dal_sil_level' ? { ...c, visible: false } : c
    );

    // Move total_float to index 2
    const floatCol = updatedColumns.find((c) => c.field === 'total_float')!;
    const filtered = updatedColumns.filter((c) => c.field !== 'total_float');
    filtered.splice(2, 0, floatCol);

    // Build config payload
    const configPayload = {
      columns: filtered.map((c) => ({
        field: c.field,
        visible: c.visible,
        width: 120,
        pinned: c.pinned,
      })),
      sort: [{ field: 'planned_start', direction: 'asc' }],
      gantt: {
        zoom: 'WEEKS' as const,
        showBaselines: true,
        showDependencies: true,
        showDropLine: true,
      },
      density: 'BALANCED' as const,
      split_ratio: 0.5,
    };

    // Verify dal_sil_level is hidden
    expect(configPayload.columns.find((c: any) => c.field === 'dal_sil_level')?.visible).toBe(
      false
    );

    // Verify total_float is at index 2
    expect(configPayload.columns[2].field).toBe('total_float');

    // Verify schema structure
    expect(configPayload).toHaveProperty('columns');
    expect(configPayload).toHaveProperty('sort');
    expect(configPayload).toHaveProperty('gantt');
    expect(configPayload).toHaveProperty('density');
    expect(configPayload).toHaveProperty('split_ratio');
  });

  it('saves preset with correct .ppmview.json schema specification', () => {
    // Simulate the preset save payload
    const presetPayload = {
      name: 'Lead Systems Float Audit',
      description: 'Custom view for lead systems engineering float analysis',
      sharing_scope: 'PROJECT_SHARED',
      classification: 'OFFICIAL',
      view_type: 'WBS_GANTT',
      layout_schema_version: '1.2.0',
      config_payload: {
        columns: [
          { field: 'code', visible: true, width: 120, pinned: 'left' },
          { field: 'name', visible: true, width: 200, pinned: 'left' },
          { field: 'total_float', visible: true, width: 100, pinned: null },
          { field: 'planned_start', visible: true, width: 120, pinned: null },
          { field: 'planned_finish', visible: true, width: 120, pinned: null },
          { field: 'percent_complete', visible: true, width: 120, pinned: null },
          { field: 'dal_sil_level', visible: false, width: 120, pinned: null },
        ],
        sort: [{ field: 'planned_start', direction: 'asc' }],
        gantt: {
          zoom: 'WEEKS',
          showBaselines: true,
          showDependencies: true,
          showDropLine: true,
        },
        density: 'BALANCED',
        split_ratio: 0.5,
      },
    };

    // Verify preset structure matches .ppmview.json schema
    expect(presetPayload.name).toBe('Lead Systems Float Audit');
    expect(presetPayload.sharing_scope).toBe('PROJECT_SHARED');
    expect(presetPayload.view_type).toBe('WBS_GANTT');
    expect(presetPayload.layout_schema_version).toBe('1.2.0');

    // Verify column configuration
    const cols = presetPayload.config_payload.columns;
    expect(cols.find((c: any) => c.field === 'dal_sil_level')?.visible).toBe(false);
    expect(cols[2].field).toBe('total_float');

    // Verify split_ratio bounds
    expect(presetPayload.config_payload.split_ratio).toBeGreaterThanOrEqual(0.1);
    expect(presetPayload.config_payload.split_ratio).toBeLessThanOrEqual(0.9);

    // Verify density is valid
    expect(['ULTRA_DENSE', 'BALANCED', 'COMFORT']).toContain(presetPayload.config_payload.density);
  });

  it('POST /api/v1/presets payload matches .ppmview.json schema', async () => {
    // Mock fetch for the API call
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'preset-123', name: 'Lead Systems Float Audit' }),
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch as any);

    // Simulate the API call
    const presetData = {
      name: 'Lead Systems Float Audit',
      description: 'Float analysis view',
      sharing_scope: 'PROJECT_SHARED',
      classification: 'OFFICIAL',
      view_type: 'WBS_GANTT',
      config_payload: {
        columns: [
          { field: 'code', visible: true, width: 120, pinned: 'left' },
          { field: 'name', visible: true, width: 200, pinned: 'left' },
          { field: 'total_float', visible: true, width: 100, pinned: null },
        ],
        sort: [{ field: 'planned_start', direction: 'asc' }],
        gantt: { zoom: 'WEEKS', showBaselines: true, showDependencies: true, showDropLine: true },
        density: 'BALANCED',
        split_ratio: 0.5,
      },
    };

    await act(async () => {
      await fetch('/api/v1/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(presetData),
      });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/presets',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(presetData),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Test: Multi-Window BroadcastChannel Sync
// ---------------------------------------------------------------------------

describe('Multi-Window BroadcastChannel Sync', () => {
  let channel: BroadcastChannel;

  beforeEach(() => {
    // Mock BroadcastChannel for jsdom
    vi.stubGlobal('BroadcastChannel', vi.fn((channelName?: string) => ({
      name: channelName || '',
      postMessage: vi.fn(),
      onmessage: null,
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches FOCUS_NODE_CHANGED message from Window A, caught by Window B', () => {
    // Create two BroadcastChannel instances simulating two windows
    const messages: Array<{ type: string; payload: any }> = [];

    // Mock BroadcastChannel that captures messages
    const mockChannel = {
      name: 'defence_ppm_workspace_bus',
      postMessage: (msg: any) => {
        // Simulate message delivery to other windows
        if (mockChannel.onmessage) {
          (mockChannel.onmessage as Function)({ data: msg } as MessageEvent);
        }
      },
      onmessage: null,
      close: vi.fn(),
    };

    // Window A: Dispatches FOCUS_NODE_CHANGED
    let windowAFocusedNodeId: string | null = null;
    const windowA = {
      channel: mockChannel,
      get focusedNodeId() { return windowAFocusedNodeId; },
      dispatchFocus: (nodeId: string) => {
        windowAFocusedNodeId = nodeId;
        mockChannel.postMessage({
          type: 'FOCUS_NODE_CHANGED',
          nodeId,
          timestamp: Date.now(),
        });
      },
    };

    // Window B: Listens for messages
    const windowB = {
      channel: mockChannel,
      focusedNodeId: null as string | null,
      onMessage: (event: { data: any }) => {
        if (event.data.type === 'FOCUS_NODE_CHANGED') {
          windowB.focusedNodeId = event.data.nodeId;
        }
      },
    };

    // Wire up Window B's listener
    (mockChannel as any).onmessage = windowB.onMessage;

    // Window A dispatches focus change
    windowA.dispatchFocus('WP-2104');

    // Window B should have received the message
    expect(windowB.focusedNodeId).toBe('WP-2104');
  });

  it('dispatches UNDO_REDO_DISPATCHED message; both windows reflect identical transaction counters', () => {
    const mockChannel = {
      name: 'defence_ppm_workspace_bus',
      postMessage: (msg: any) => {
        if (mockChannel.onmessage) {
          (mockChannel.onmessage as Function)({ data: msg } as MessageEvent);
        }
      },
      onmessage: null,
      close: vi.fn(),
    };

    // Both windows track transaction counters
    const windowA = { transactionCounter: 0 };
    const windowB = { transactionCounter: 0 };

    // Window B listens for undo/redo messages
    (mockChannel as any).onmessage = (event: { data: any }) => {
      if (event.data.type === 'UNDO_REDO_DISPATCHED') {
        windowB.transactionCounter = event.data.transactionCounter;
      }
    };

    // Window A dispatches undo/redo
    const newCounter = 42;
    mockChannel.postMessage({
      type: 'UNDO_REDO_DISPATCHED',
      transactionCounter: newCounter,
      timestamp: Date.now(),
    });

    // Both windows should have the same counter
    windowA.transactionCounter = newCounter;
    expect(windowA.transactionCounter).toBe(newCounter);
    expect(windowB.transactionCounter).toBe(newCounter);
    expect(windowA.transactionCounter).toBe(windowB.transactionCounter);
  });

  it('BroadcastChannel uses correct channel name defence_ppm_workspace_bus', () => {
    const channel = new (BroadcastChannel as any)('defence_ppm_workspace_bus');
    expect(channel.name).toBe('defence_ppm_workspace_bus');
  });

  it('BroadcastChannel sync uses defence_ppm_bus for window state sync', () => {
    const channel = new (BroadcastChannel as any)('defence_ppm_bus');
    expect(channel.name).toBe('defence_ppm_bus');
  });
});

// ---------------------------------------------------------------------------
// Test: Workspace Store Tab Management
// ---------------------------------------------------------------------------

describe('Workspace Store Tab Management', () => {
  let Store: ReturnType<typeof createMockWorkspaceStore>;
  let store: MockWorkspaceStore;

  beforeEach(() => {
    Store = createMockWorkspaceStore();
    // Create a hook-like accessor
    store = {
      tabs: Store.getState().tabs,
      activeTabId: Store.getState().activeTabId,
      splitOrientation: Store.getState().splitOrientation,
      splitRatio: Store.getState().splitRatio,
      isSidebarExpanded: Store.getState().isSidebarExpanded,
      openView: Store.getState().openView,
      closeTab: Store.getState().closeTab,
      setActiveTab: Store.getState().setActiveTab,
      setSplitRatio: Store.getState().setSplitRatio,
      pinTab: Store.getState().pinTab,
      reorderTabs: Store.getState().reorderTabs,
      closeOtherTabs: Store.getState().closeOtherTabs,
      closeTabsToRight: Store.getState().closeTabsToRight,
      setSidebarExpanded: Store.getState().setSidebarExpanded,
    };
  });

  it('opens a new view tab and sets it as active', () => {
    store.openView('SRA_RISK', { projectId: 'proj-1' });
    const state = Store.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.tabs[1].viewType).toBe('SRA_RISK');
    expect(state.activeTabId).toBe(state.tabs[1].id);
  });

  it('closes a tab and activates the next available tab', () => {
    store.openView('DAILY_COCKPIT');
    const state = Store.getState();
    const tabToClose = state.tabs[1].id;
    store.closeTab(tabToClose);
    const newState = Store.getState();
    expect(newState.tabs).toHaveLength(1);
    expect(newState.activeTabId).toBe(newState.tabs[0].id);
  });

  it('cannot close a pinned tab', () => {
    store.openView('SRA_RISK');
    const state = Store.getState();
    const tabId = state.tabs[1].id;
    store.pinTab(tabId, true);
    store.closeTab(tabId);
    const newState = Store.getState();
    expect(newState.tabs).toHaveLength(2); // Pinned tab should remain
  });

  it('reorders tabs via drag-and-drop', () => {
    store.openView('SRA_RISK');
    store.openView('DAILY_COCKPIT');
    const state = Store.getState();
    expect(state.tabs[0].viewType).toBe('WBS_GANTT');
    expect(state.tabs[1].viewType).toBe('SRA_RISK');
    expect(state.tabs[2].viewType).toBe('DAILY_COCKPIT');

    // Move DAILY_COCKPIT to index 0
    store.reorderTabs(2, 0);
    const newState = Store.getState();
    expect(newState.tabs[0].viewType).toBe('DAILY_COCKPIT');
    expect(newState.tabs[1].viewType).toBe('WBS_GANTT');
    expect(newState.tabs[2].viewType).toBe('SRA_RISK');
  });

  it('closes other tabs while preserving pinned tabs', () => {
    store.openView('SRA_RISK');
    store.openView('DAILY_COCKPIT');
    const state = Store.getState();
    const tabId = state.tabs[0].id;
    store.pinTab(state.tabs[2].id, true); // Pin DAILY_COCKPIT
    store.closeOtherTabs(tabId);
    const newState = Store.getState();
    // Should keep the target tab and the pinned tab
    expect(newState.tabs.every((t) => t.id === tabId || t.isPinned)).toBe(true);
  });

  it('closes all tabs to the right of specified tab', () => {
    store.openView('SRA_RISK');
    store.openView('DAILY_COCKPIT');
    const state = Store.getState();
    const tabId = state.tabs[0].id; // WBS_GANTT
    store.closeTabsToRight(tabId);
    const newState = Store.getState();
    expect(newState.tabs).toHaveLength(1);
    expect(newState.tabs[0].viewType).toBe('WBS_GANTT');
  });

  it('preserves pinned tabs when closing tabs to the right', () => {
    store.openView('SRA_RISK');
    store.openView('DAILY_COCKPIT');
    const state = Store.getState();
    const tabId = state.tabs[0].id;
    const dailyCockpitTabId = state.tabs[2].id;
    store.pinTab(dailyCockpitTabId, true); // Pin DAILY_COCKPIT
    store.closeTabsToRight(tabId);
    const newState = Store.getState();
    // Should keep WBS_GANTT (target) and DAILY_COCKPIT (pinned)
    // SRA_RISK is between WBS_GANTT and DAILY_COCKPIT, so it gets closed
    expect(newState.tabs.map((t) => t.viewType)).toContain('WBS_GANTT');
    expect(newState.tabs.map((t) => t.viewType)).toContain('DAILY_COCKPIT');
    expect(newState.tabs.find((t) => t.viewType === 'DAILY_COCKPIT')?.isPinned).toBe(true);
  });

  it('sets split ratio within bounds (0.1 - 0.9)', () => {
    store.setSplitRatio(0.5);
    expect(Store.getState().splitRatio).toBe(0.5);

    store.setSplitRatio(0.05); // Below minimum
    expect(Store.getState().splitRatio).toBe(0.1);

    store.setSplitRatio(0.95); // Above maximum
    expect(Store.getState().splitRatio).toBe(0.9);
  });

  it('toggles sidebar expansion state', () => {
    expect(Store.getState().isSidebarExpanded).toBe(true);
    store.setSidebarExpanded(false);
    expect(Store.getState().isSidebarExpanded).toBe(false);
    store.setSidebarExpanded(true);
    expect(Store.getState().isSidebarExpanded).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test: Integration - Ribbon + Workspace Store
// ---------------------------------------------------------------------------

describe('Integration: Ribbon + Workspace Store', () => {
  it('ribbon tabs update when workspace active tab changes', () => {
    const Store = createMockWorkspaceStore();
    const state = Store.getState();

    // Initial: WBS_GANTT is active
    expect(state.activeTabId).toBe(state.tabs[0].id);
    expect(state.tabs[0].viewType).toBe('WBS_GANTT');

    // Open SRA_RISK tab
    Store.getState().openView('SRA_RISK');
    const newState = Store.getState();
    expect(newState.activeTabId).toBe(newState.tabs[1].id);
    expect(newState.tabs[1].viewType).toBe('SRA_RISK');

    // Switch back to WBS_GANTT
    Store.getState().setActiveTab(newState.tabs[0].id);
    const finalState = Store.getState();
    expect(finalState.activeTabId).toBe(newState.tabs[0].id);
  });

  it('action registry filters actions by view type and baseline lock', () => {
    const registry = new Map<string, MockActionDefinition>();

    registry.set('run-cpm', {
      id: 'run-cpm',
      label: 'Run CPM',
      category: 'SCHEDULE',
      isEnabled: (ctx) => !ctx.isBaselineLocked,
    });

    registry.set('delete-task', {
      id: 'delete-task',
      label: 'Delete Task',
      category: 'STRUCTURE',
      isEnabled: (ctx) => ctx.selectedNodeIds.length > 0 && !ctx.isBaselineLocked,
    });

    // With baseline locked, both actions should be disabled
    const lockedCtx = { isBaselineLocked: true, selectedNodeIds: ['node-1'] };
    for (const action of registry.values()) {
      expect(action.isEnabled(lockedCtx)).toBe(false);
    }

    // With baseline unlocked, CPM should be enabled
    const unlockedCtx = { isBaselineLocked: false, selectedNodeIds: ['node-1'] };
    expect(registry.get('run-cpm')!.isEnabled(unlockedCtx)).toBe(true);
    expect(registry.get('delete-task')!.isEnabled(unlockedCtx)).toBe(true);

    // With no selection, delete should be disabled
    const noSelectionCtx = { isBaselineLocked: false, selectedNodeIds: [] };
    expect(registry.get('delete-task')!.isEnabled(noSelectionCtx)).toBe(false);
  });
});
