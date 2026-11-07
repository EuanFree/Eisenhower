/**
 * Schedule Shared State Store
 *
 * Central Zustand store for synchronizing the WBS grid, Gantt chart,
 * and any other schedule-related views.
 *
 * Responsibilities:
 * - Track the currently selected node (row) across all schedule views.
 * - Manage the flat row list used by the virtualized WBS table.
 * - Track expanded/collapsed state for sub-tree nodes.
 * - Cache fetched child nodes so dynamic loading doesn't re-fetch.
 * - Broadcast selection changes so the Gantt split-pane stays in sync.
 */

import { create } from 'zustand';
import { WBSRow, WBSNode, WBSColumnState } from '../types/wbs';
import { ConcurrencyConflict, ConflictResolution } from '../types/concurrency';
import { FilterVisualizationMode } from '../types/filter';
import { getWindowSync } from '../utils/windowSync';
import api from '../services/api';

// ---------------------------------------------------------------------------
// Window Sync Instance
// ---------------------------------------------------------------------------

/**
 * Broadcast state changes to detached windows via BroadcastChannel.
 * Lazily initialized on first use.
 */
let windowSync: ReturnType<typeof getWindowSync> | null = null;

function broadcastSync(category: string, payload: unknown): void {
  if (!windowSync) {
    windowSync = getWindowSync();
  }
  try {
    windowSync.broadcast(category as any, payload as any);
  } catch {
    // BroadcastChannel may not be supported in all environments
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduleDependencyLink {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: 'FS' | 'SS' | 'FF' | 'SF';
  lag_days: number;
}

export interface ScheduleResourceAssignment {
  id: string;
  portfolio_node_id: string;
  resource_node_id: string;
  resource_code: string | null;
  resource_name: string | null;
  allocated_units: number;
}

interface ScheduleStoreState {
  /** Currently selected node ID (null = no selection) */
  selectedNodeId: string | null;

  /** Multi-row selection: set of selected node IDs */
  selectedNodeIds: Set<string>;

  /** Full flat row list for the virtualized table */
  rows: WBSRow[];

  /** Dependency links between WBS nodes in the active project */
  dependencies: ScheduleDependencyLink[];

  /** Resource assignments for WBS nodes in the active project */
  resourceAssignments: ScheduleResourceAssignment[];

  /** Map of node_id → expanded boolean */
  expandedNodes: Record<string, boolean>;

  /** Map of node_id → whether children have been fetched */
  childrenLoaded: Record<string, boolean>;

  /** Column visibility and width state */
  columnState: WBSColumnState;

  /** Whether the initial tree load is in progress */
  loading: boolean;

  /** Root node ID for the current project view */
  rootNodeId: string | null;

  /** Active conflict from HTTP 409 — null when no conflict */
  activeConflict: ConcurrencyConflict | null;

  /** Local edits that caused the conflict (for side-by-side diff) */
  pendingLocalEdits: Record<string, unknown> | null;

  /** Filter visualization mode (FILTER = hide non-matching, DIM = dim them) */
  filterMode: FilterVisualizationMode;

  /** Set of node IDs that match the current filter */
  matchingNodeIds: Set<string>;

  /** Set of node IDs visible in filter mode (matching + ancestors) */
  visibleNodeIds: Set<string>;

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  /**
   * Set the selected node. Broadcasts to all subscribers (Gantt, detail
   * panels, etc.) so they can update their view.
   */
  selectNode: (nodeId: string | null) => void;

  /**
   * Load the initial tree for a project root node.
   * Fetches the root and its immediate children, then flattens them
   * into the row list.
   */
  loadTree: (rootNodeId: string) => Promise<void>;

  /**
   * Expand or collapse a node. If expanding and children haven't been
   * loaded yet, fetches them from the API and inserts them into the
   * flat row list right after the parent.
   */
  toggleExpand: (nodeId: string) => Promise<void>;

  /**
   * Update the column visibility and width state.
   */
  updateColumnState: (partial: Partial<WBSColumnState>) => void;

  /**
   * Refresh a single row's data (e.g. after a progress update).
   */
  refreshRow: (nodeId: string) => Promise<void>;

  /**
   * Update a node via PATCH with optimistic concurrency control.
   * Sends version_id in the body; on HTTP 409, sets activeConflict
   * so the UI can show the ConflictResolutionModal.
   *
   * @param nodeId - UUID of the node to update
   * @param updates - Partial update data
   * @param onConflict - Optional callback when 409 is received
   */
  updateNode: (
    nodeId: string,
    updates: Partial<WBSNode>,
  ) => Promise<{ success: boolean; node?: WBSNode }>;

  /**
   * Resolve an active conflict by applying the chosen strategy.
   * - OVERWRITE: Re-submit with the latest version_id
   * - DISCARD: Replace local row with server state
   * - FORK: Create a parallel sub-task
   */
  resolveConflict: (
    resolution: ConflictResolution,
  ) => Promise<void>;

  /**
   * Clear the active conflict state (close the modal).
   */
  clearConflict: () => void;

  /**
   * Update filter state from the FilterToolbar.
   */
  setFilterState: (state: {
    filterMode: FilterVisualizationMode;
    matchingNodeIds: Set<string>;
    visibleNodeIds: Set<string>;
  }) => void;

  // -----------------------------------------------------------------------
  // Multi-Row Selection
  // -----------------------------------------------------------------------

  /**
   * Toggle a row's selection state for multi-row operations.
   * Supports Shift+Click (range) and Ctrl+Click (discontiguous).
   */
  toggleRowSelection: (nodeId: string, rowIndex: number, shiftKey: boolean, ctrlKey: boolean) => void;

  /**
   * Clear all multi-row selection.
   */
  clearRowSelection: () => void;

  /**
   * Update a single row's data locally (for inline editing).
   */
  updateRow: (nodeId: string, updates: Record<string, unknown>) => void;

  /**
   * Create or update a dependency link between two WBS tasks.
   */
  addDependency: (
    predecessorId: string,
    successorId: string,
    dependencyType?: 'FS' | 'SS' | 'FF' | 'SF',
    lagDays?: number,
  ) => Promise<ScheduleDependencyLink | null>;

  /**
   * Delete a dependency link by ID.
   */
  removeDependency: (dependencyId: string) => Promise<void>;

  /**
   * Assign a resource to a WBS task (creates or updates allocation).
   */
  addResourceAssignment: (
    nodeId: string,
    resourceId: string,
    allocatedUnits?: number,
  ) => Promise<ScheduleResourceAssignment | null>;

  /**
   * Remove a resource assignment by ID.
   */
  removeResourceAssignment: (assignmentId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the indent level from an ltree path string.
 * Path '1' → level 0, '1.2' → level 1, '1.2.3' → level 2, etc.
 */
function computeIndentLevel(path: string): number {
  return (path.match(/\./g) || []).length;
}

/**
 * Convert a WBSNode from the API into a WBSRow for the flat table.
 */
function nodeToRow(node: WBSNode, expandedNodes: Record<string, boolean>, childrenLoaded: Record<string, boolean>): WBSRow {
  return {
    ...node,
    indentLevel: computeIndentLevel(node.path),
    expanded: expandedNodes[node.id] ?? false,
    childrenLoaded: childrenLoaded[node.id] ?? false,
    selected: false,
  };
}

/**
 * Insert child rows into the flat list immediately after the parent row.
 * This preserves tree order without a full re-render.
 */
function insertChildrenAfterParent(
  rows: WBSRow[],
  parentId: string,
  children: WBSNode[],
  expandedNodes: Record<string, boolean>,
  childrenLoaded: Record<string, boolean>,
): { rows: WBSRow[]; expandedNodes: Record<string, boolean>; childrenLoaded: Record<string, boolean> } {
  const parentIndex = rows.findIndex((r) => r.id === parentId);
  if (parentIndex === -1) {
    return { rows, expandedNodes, childrenLoaded };
  }

  // Convert children to rows
  const childRows = children.map((c) =>
    nodeToRow(c, expandedNodes, childrenLoaded),
  );

  // Insert after parent
  const newRows = [
    ...rows.slice(0, parentIndex + 1),
    ...childRows,
    ...rows.slice(parentIndex + 1),
  ];

  // Mark parent as having loaded children
  const newChildrenLoaded = { ...childrenLoaded, [parentId]: true };

  return { rows: newRows, expandedNodes, childrenLoaded: newChildrenLoaded };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const defaultColumnState: WBSColumnState = {
  columnWidths: {
    code: 120,
    name: 300,
    deliveryMode: 100,
    startDate: 120,
    finishDate: 120,
    totalFloat: 90,
    progress: 140,
    blockers: 60,
  },
  hiddenColumns: [],
};

export const useScheduleStore = create<ScheduleStoreState>((set, get) => ({
  selectedNodeId: null,
  selectedNodeIds: new Set(),
  rows: [],
  dependencies: [],
  resourceAssignments: [],
  expandedNodes: {},
  childrenLoaded: {},
  columnState: defaultColumnState,
  loading: false,
  rootNodeId: null,
  activeConflict: null,
  pendingLocalEdits: null,
  filterMode: 'FILTER',
  matchingNodeIds: new Set(),
  visibleNodeIds: new Set(),

  selectNode: (nodeId) => {
    set({
      selectedNodeId: nodeId,
      rows: get().rows.map((row) => ({
        ...row,
        selected: row.id === nodeId,
      })),
    });
    // Broadcast selection to detached windows
    broadcastSync('SELECTION', { nodeId });
  },

  loadTree: async (rootNodeId) => {
    const targetId = rootNodeId || 'default';
    set({ loading: true, rootNodeId: targetId });

    try {
      // Fetch the full tree for the root node (or default root)
      const response = await api.get<any>(`/wbs/tree/${targetId}`);
      const data = response?.data !== undefined ? response.data : response;

      let flatNodes: WBSNode[] = [];
      const newExpandedNodes: Record<string, boolean> = { ...get().expandedNodes };
      const newChildrenLoaded: Record<string, boolean> = { ...get().childrenLoaded };

      if (data?.root) {
        const root = data.root as WBSNode;
        const children = (data.children || []) as WBSNode[];
        flatNodes = [root, ...children];
      } else if (Array.isArray(data?.tree) && data.tree.length > 0) {
        const flattenTree = (nodes: any[]) => {
          for (const n of nodes) {
            const { children, ...rest } = n;
            flatNodes.push(rest as WBSNode);
            if (Array.isArray(children) && children.length > 0) {
              newExpandedNodes[n.id] = true;
              newChildrenLoaded[n.id] = true;
              flattenTree(children);
            }
          }
        };
        flattenTree(data.tree);
      }

      if (flatNodes.length === 0) {
        // Fallback: fetch all WBS nodes
        const nodesResp = await api.get<any>('/wbs/nodes?tree_type=WBS');
        const nodesData = nodesResp?.data !== undefined ? nodesResp.data : nodesResp;
        if (Array.isArray(nodesData?.nodes)) {
          flatNodes = nodesData.nodes as WBSNode[];
        }
      }

      // Mark nodes that have children in flatNodes as expanded and childrenLoaded by default
      const parentIds = new Set(flatNodes.map((n) => n.parent_id).filter(Boolean));
      for (const n of flatNodes) {
        if (parentIds.has(n.id)) {
          if (newExpandedNodes[n.id] === undefined) {
            newExpandedNodes[n.id] = true;
          }
          newChildrenLoaded[n.id] = true;
        }
      }

      const allRows = flatNodes.map((n) => nodeToRow(n, newExpandedNodes, newChildrenLoaded));
      let loadedDeps: ScheduleDependencyLink[] = Array.isArray(data?.dependencies)
        ? data.dependencies
        : [];
      if (loadedDeps.length === 0) {
        try {
          const depsResp = await api.get<any>(`/wbs/dependencies?root_id=${encodeURIComponent(data?.root_id || targetId)}`);
          const depsData = depsResp?.data !== undefined ? depsResp.data : depsResp;
          if (Array.isArray(depsData?.dependencies)) {
            loadedDeps = depsData.dependencies;
          }
        } catch {
          // Non-fatal fallback
        }
      }

      let loadedAssignments: ScheduleResourceAssignment[] = Array.isArray(data?.resource_assignments)
        ? data.resource_assignments
        : [];
      if (loadedAssignments.length === 0) {
        try {
          const assignResp = await api.get<any>(`/wbs/resource-assignments?root_id=${encodeURIComponent(data?.root_id || targetId)}`);
          const assignData = assignResp?.data !== undefined ? assignResp.data : assignResp;
          if (Array.isArray(assignData?.resource_assignments)) {
            loadedAssignments = assignData.resource_assignments;
          }
        } catch {
          // Non-fatal fallback
        }
      }

      set({
        rootNodeId: data?.root_id || (flatNodes[0]?.id ?? targetId),
        rows: allRows,
        dependencies: loadedDeps,
        resourceAssignments: loadedAssignments,
        expandedNodes: newExpandedNodes,
        childrenLoaded: newChildrenLoaded,
        loading: false,
      });
    } catch (err) {
      console.error('Failed to load WBS tree:', err);
      set({ loading: false });
    }
  },

  toggleExpand: async (nodeId) => {
    const { expandedNodes, childrenLoaded, rows } = get();
    const isExpanded = expandedNodes[nodeId] ?? false;

    if (isExpanded) {
      // Collapse: hide all descendants that come after this node
      const nodeRow = rows.find((r) => r.id === nodeId);
      if (!nodeRow) return;

      const nodeIndent = nodeRow.indentLevel;
      const nodeIndex = rows.indexOf(nodeRow);

      // Filter out rows that are descendants (consecutive rows with higher indent after this node)
      let inSubtree = true;
      const filteredRows = rows.filter((row, idx) => {
        if (idx === nodeIndex) return true;
        if (idx < nodeIndex) return true;
        if (inSubtree) {
          if (row.indentLevel > nodeIndent) {
            return false;
          }
          inSubtree = false;
        }
        return true;
      }).map((r) => (r.id === nodeId ? { ...r, expanded: false } : r));

      set({
        expandedNodes: { ...expandedNodes, [nodeId]: false },
        rows: filteredRows,
      });
    } else {
      // Expand: load children if not already loaded
      const nodeRow = rows.find((r) => r.id === nodeId);
      if (!nodeRow) return;

      const newExpandedNodes = { ...expandedNodes, [nodeId]: true };

      // Check if descendants are already present in rows right after nodeRow
      const nodeIndex = rows.indexOf(nodeRow);
      const nextRow = rows[nodeIndex + 1];
      const hasDescendantsInRows = nextRow && nextRow.indentLevel > nodeRow.indentLevel;

      if (!childrenLoaded[nodeId] || !hasDescendantsInRows) {
        // Fetch children from the API
        try {
          const response = await api.get<any>(`/wbs/nodes?root=${encodeURIComponent(nodeRow.path)}`);
          const data = response?.data !== undefined ? response.data : response;
          const children = (data?.nodes || []) as WBSNode[];

          if (children.length > 0) {
            const { rows: newRows, childrenLoaded: newChildrenLoaded } = insertChildrenAfterParent(
              rows.map((r) => (r.id === nodeId ? { ...r, expanded: true } : r)),
              nodeId,
              children,
              newExpandedNodes,
              childrenLoaded,
            );

            set({
              expandedNodes: newExpandedNodes,
              childrenLoaded: newChildrenLoaded,
              rows: newRows,
            });
          } else {
            // No children — just mark as loaded
            set({
              expandedNodes: newExpandedNodes,
              childrenLoaded: { ...childrenLoaded, [nodeId]: true },
              rows: rows.map((r) => (r.id === nodeId ? { ...r, expanded: true, childrenLoaded: true } : r)),
            });
          }
        } catch (err) {
          console.error('Failed to load children for node:', nodeId, err);
        }
      } else {
        // Children already loaded — just mark as expanded
        set({
          expandedNodes: newExpandedNodes,
          rows: rows.map((r) => (r.id === nodeId ? { ...r, expanded: true } : r)),
        });
      }
    }
  },

  updateColumnState: (partial) => {
    set({
      columnState: {
        ...get().columnState,
        ...partial,
        columnWidths: {
          ...get().columnState.columnWidths,
          ...(partial.columnWidths || {}),
        },
      },
    });
  },

  refreshRow: async (nodeId) => {
    try {
      const response = await api.get<any>(`/wbs/nodes/${nodeId}`);
      const node = (response?.data !== undefined ? response.data : response) as unknown as WBSNode;

      const rows = get().rows;
      const index = rows.findIndex((r) => r.id === nodeId);
      if (index === -1) return;

      const expandedNodes = get().expandedNodes;
      const childrenLoaded = get().childrenLoaded;
      const updatedRow = nodeToRow(node, expandedNodes, childrenLoaded);
      updatedRow.selected = rows[index].selected;

      const newRows = [...rows];
      newRows[index] = updatedRow;

      set({ rows: newRows });
    } catch (err) {
      console.error('Failed to refresh row:', nodeId, err);
    }
  },

  // -----------------------------------------------------------------------
  // Optimistic Concurrency Control
  // -----------------------------------------------------------------------

  updateNode: async (nodeId, updates) => {
    const rows = get().rows;
    const row = rows.find((r) => r.id === nodeId);
    if (!row) {
      return { success: false };
    }

    // Build the update payload including version_id for concurrency check
    const payload: Record<string, unknown> = { ...updates };
    if (row.version_id !== undefined) {
      payload.version_id = row.version_id;
    }

    try {
      const response = await api.put<any>(`/wbs/nodes/${nodeId}`, payload);
      const updatedNode = (response?.data !== undefined ? response.data : response) as unknown as WBSNode;

      // Update the row in the flat list
      const newRows = rows.map((r) =>
        r.id === nodeId ? { ...r, ...updatedNode, selected: r.selected } : r,
      );

      set({ rows: newRows, activeConflict: null, pendingLocalEdits: null });
      return { success: true, node: updatedNode };
    } catch (err: any) {
      // Check for HTTP 409 Conflict
      if (err?.response?.status === 409) {
        const conflictData = err.response.data as ConcurrencyConflict;

        // Store the conflict and the local edits for the diff view
        set({
          activeConflict: conflictData,
          pendingLocalEdits: payload,
        });

        return { success: false };
      }

      console.error('Failed to update node:', nodeId, err);
      return { success: false };
    }
  },

  resolveConflict: async (resolution) => {
    const { activeConflict, pendingLocalEdits, rows } = get();
    if (!activeConflict || !pendingLocalEdits) return;

    const nodeId = activeConflict.entity_id;

    if (resolution === 'DISCARD') {
      // Replace local row with server state
      const serverState = activeConflict.current_state as unknown as WBSNode || {};
      const newRows = rows.map((r) => {
        if (r.id === nodeId) {
          const merged = { ...r, ...serverState, selected: r.selected };
          return nodeToRow(merged, get().expandedNodes, get().childrenLoaded);
        }
        return r;
      });
      set({ rows: newRows, activeConflict: null, pendingLocalEdits: null });
    } else if (resolution === 'OVERWRITE') {
      // Re-submit with the latest version_id from the server
      const latestVersion = activeConflict.current_database_version ?? 1;
      const payload: Record<string, unknown> = {
        ...pendingLocalEdits,
        version_id: latestVersion,
      };

      try {
        const response = await api.put<any>(`/wbs/nodes/${nodeId}`, payload);
        const updatedNode = response.data as unknown as WBSNode;

        const newRows = rows.map((r) =>
          r.id === nodeId ? { ...r, ...updatedNode, selected: r.selected } : r,
        );

        set({ rows: newRows, activeConflict: null, pendingLocalEdits: null });
      } catch (err) {
        console.error('Overwrite failed:', err);
      }
    } else if (resolution === 'FORK') {
      // Create a parallel sub-task to preserve the user's input
      const parentRow = rows.find((r) => r.id === nodeId);
      if (parentRow) {
        try {
          const forkPayload = {
            parent_id: nodeId,
            tree_type: 'WBS',
            code: `${parentRow.code}-FORK`,
            name: `${parentRow.name} (Forked)`,
            path: `${parentRow.path}.fork`,
            security_classification: parentRow.security_classification,
            is_active: true,
          };

          await api.post<any>('/wbs/nodes', forkPayload);

          // Refresh the tree to include the new forked node
          await get().refreshRow(nodeId);
          set({ activeConflict: null, pendingLocalEdits: null });
        } catch (err) {
          console.error('Fork failed:', err);
        }
      }
    }
  },

  clearConflict: () => {
    set({ activeConflict: null, pendingLocalEdits: null });
  },

  // -----------------------------------------------------------------------
  // Filter State
  // -----------------------------------------------------------------------

  setFilterState: (state) => {
    set({
      filterMode: state.filterMode,
      matchingNodeIds: state.matchingNodeIds,
      visibleNodeIds: state.visibleNodeIds,
    });
    // Broadcast filter state to detached windows
    broadcastSync('FILTER', {
      tokens: '',
      mode: state.filterMode,
    });
  },

  // -----------------------------------------------------------------------
  // Multi-Row Selection
  // -----------------------------------------------------------------------

  toggleRowSelection: (nodeId, rowIndex, shiftKey, ctrlKey) => {
    const { selectedNodeIds, rows } = get();
    const newSelected = new Set(selectedNodeIds);

    if (shiftKey && newSelected.size > 0) {
      // Range selection: select from last clicked to current
      const lastClicked = Array.from(newSelected).pop();
      const lastIndex = rows.findIndex((r) => r.id === lastClicked);
      if (lastIndex !== -1) {
        const start = Math.min(lastIndex, rowIndex);
        const end = Math.max(lastIndex, rowIndex);
        for (let i = start; i <= end; i++) {
          newSelected.add(rows[i].id);
        }
      }
    } else if (ctrlKey) {
      // Toggle single row
      if (newSelected.has(nodeId)) {
        newSelected.delete(nodeId);
      } else {
        newSelected.add(nodeId);
      }
    } else {
      // Single selection
      newSelected.clear();
      newSelected.add(nodeId);
    }

    set({ selectedNodeIds: newSelected });
  },

  clearRowSelection: () => {
    set({ selectedNodeIds: new Set() });
  },

  updateRow: (nodeId, updates) => {
    const rows = get().rows;
    const index = rows.findIndex((r) => r.id === nodeId);
    if (index === -1) return;

    const updatedRow = { ...rows[index], ...updates };
    const newRows = [...rows];
    newRows[index] = updatedRow;

    set({ rows: newRows });

    // Broadcast date mutations to detached windows
    for (const field of Object.keys(updates)) {
      if (field === 'planned_start_date' || field === 'planned_end_date' || field === 'percent_complete') {
        broadcastSync('DATE_MUTATION', {
          nodeId,
          field,
          oldValue: rows[index][field as keyof WBSRow],
          newValue: updates[field],
        });
      }
    }
  },

  addDependency: async (predecessorId, successorId, dependencyType = 'FS', lagDays = 0) => {
    try {
      const resp = await api.post<any>('/wbs/dependencies', {
        predecessor_id: predecessorId,
        successor_id: successorId,
        dependency_type: dependencyType,
        lag_days: lagDays,
      });
      const created = (resp?.data !== undefined ? resp.data : resp) as ScheduleDependencyLink;
      if (created && created.predecessor_id && created.successor_id) {
        const existing = get().dependencies.filter(
          (d) =>
            !(
              d.predecessor_id === created.predecessor_id &&
              d.successor_id === created.successor_id
            ),
        );
        set({ dependencies: [...existing, created] });
        return created;
      }
      return null;
    } catch (err) {
      console.error('Failed to add dependency:', err);
      return null;
    }
  },

  removeDependency: async (dependencyId) => {
    try {
      await api.delete(`/wbs/dependencies/${dependencyId}`);
      set({
        dependencies: get().dependencies.filter((d) => d.id !== dependencyId),
      });
    } catch (err) {
      console.error('Failed to remove dependency:', err);
    }
  },

  addResourceAssignment: async (nodeId, resourceId, allocatedUnits = 1.0) => {
    try {
      const resp = await api.post<any>('/wbs/resource-assignments', {
        portfolio_node_id: nodeId,
        resource_node_id: resourceId,
        allocated_units: allocatedUnits,
      });
      const created = (resp?.data !== undefined ? resp.data : resp) as ScheduleResourceAssignment;
      if (created && created.portfolio_node_id && created.resource_node_id) {
        const existing = get().resourceAssignments.filter(
          (a) =>
            !(
              a.portfolio_node_id === created.portfolio_node_id &&
              a.resource_node_id === created.resource_node_id
            ),
        );
        set({ resourceAssignments: [...existing, created] });
        return created;
      }
      return null;
    } catch (err) {
      console.error('Failed to add resource assignment:', err);
      return null;
    }
  },

  removeResourceAssignment: async (assignmentId) => {
    try {
      await api.delete(`/wbs/resource-assignments/${assignmentId}`);
      set({
        resourceAssignments: get().resourceAssignments.filter((a) => a.id !== assignmentId),
      });
    } catch (err) {
      console.error('Failed to remove resource assignment:', err);
    }
  },
}));
