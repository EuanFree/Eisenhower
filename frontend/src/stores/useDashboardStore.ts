/**
 * Dashboard Zustand Store
 *
 * Manages the dashboard builder state: current dashboard, widgets, edit mode,
 * active widget being edited, and the dashboard list for switching between
 * saved dashboards.
 */

import { create } from 'zustand';
import api from '../services/api';
import type {
  Dashboard,
  DashboardWidget,
  DashboardCreatePayload,
  DashboardUpdatePayload,
  DashboardWidgetCreatePayload,
  DashboardWidgetUpdatePayload,
  WidgetType,
  WidgetPosition,
  WidgetTypeInfo,
} from '../types/dashboard';

// ---------------------------------------------------------------------------
// Widget type metadata for the palette
// ---------------------------------------------------------------------------

export const WIDGET_TYPE_INFO: WidgetTypeInfo[] = [
  {
    type: 'COLUMN_CHART',
    label: 'Column Chart',
    icon: 'BarChart3',
    defaultWidth: 350,
    defaultHeight: 280,
    description: 'Grouped or stacked bar/column charts',
  },
  {
    type: 'LINE_CHART',
    label: 'Line Chart',
    icon: 'TrendingUp',
    defaultWidth: 350,
    defaultHeight: 280,
    description: 'Time-series or trend line charts',
  },
  {
    type: 'AREA_CHART',
    label: 'Area Chart',
    icon: 'Activity',
    defaultWidth: 350,
    defaultHeight: 280,
    description: 'Filled area charts for cumulative data',
  },
  {
    type: 'GAUGE',
    label: 'Gauge',
    icon: 'Gauge',
    defaultWidth: 220,
    defaultHeight: 220,
    description: 'Single-value KPI with gauge visualization',
  },
  {
    type: 'BURNDOWN',
    label: 'Burndown',
    icon: 'TrendingDown',
    defaultWidth: 350,
    defaultHeight: 280,
    description: 'Sprint/project burndown chart',
  },
  {
    type: 'SCATTER',
    label: 'Scatter Plot',
    icon: 'ScatterChart',
    defaultWidth: 350,
    defaultHeight: 280,
    description: 'Two-dimensional data point distribution',
  },
  {
    type: 'NUMBER_CARD',
    label: 'Number Card',
    icon: 'Hash',
    defaultWidth: 200,
    defaultHeight: 140,
    description: 'Large single-value display with trend',
  },
  {
    type: 'TABLE',
    label: 'Table',
    icon: 'Table',
    defaultWidth: 400,
    defaultHeight: 300,
    description: 'Tabular data display with sorting',
  },
];

// ---------------------------------------------------------------------------
// Store state and actions
// ---------------------------------------------------------------------------

interface DashboardStore {
  // Dashboard list
  dashboards: Dashboard[];
  isLoadingDashboards: boolean;

  // Current dashboard
  currentDashboard: Dashboard | null;
  isLoadingDashboard: boolean;

  // Edit mode
  isEditMode: boolean;

  // Active widget being edited
  activeWidgetId: string | null;

  // Widget data cache
  widgetData: Record<string, unknown>;
  isLoadingData: boolean;

  // Canvas dimensions
  canvasWidth: number;
  canvasHeight: number;

  // Actions
  loadDashboards: () => Promise<void>;
  createDashboard: (payload: DashboardCreatePayload) => Promise<Dashboard>;
  loadDashboard: (id: string) => Promise<void>;
  updateDashboard: (id: string, payload: DashboardUpdatePayload) => Promise<void>;
  deleteDashboard: (id: string) => Promise<void>;

  toggleEditMode: () => void;

  setActiveWidget: (widgetId: string | null) => void;

  addWidget: (widgetType: WidgetType) => void;
  updateWidget: (widgetId: string, payload: DashboardWidgetUpdatePayload) => Promise<void>;
  deleteWidget: (widgetId: string) => Promise<void>;

  updateWidgetPosition: (widgetId: string, position: WidgetPosition) => void;

  loadWidgetData: () => Promise<void>;

  setCanvasSize: (width: number, height: number) => void;
}

const GRID_SIZE = 20;

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  dashboards: [],
  isLoadingDashboards: false,
  currentDashboard: null,
  isLoadingDashboard: false,
  isEditMode: false,
  activeWidgetId: null,
  widgetData: {},
  isLoadingData: false,
  canvasWidth: 1200,
  canvasHeight: 800,

  loadDashboards: async () => {
    set({ isLoadingDashboards: true });
    try {
      const response = await api.get<Dashboard[]>('/dashboards');
      const items = Array.isArray(response.data) ? response.data : [];
      set({ dashboards: Array.isArray(items) ? items : [] });
    } catch {
      // Silently fail — user may not have dashboards yet
      set({ dashboards: [] });
    } finally {
      set({ isLoadingDashboards: false });
    }
  },

  createDashboard: async (payload) => {
    const response = await api.post<Dashboard>('/dashboards', payload);
    const dashboard = response.data;
    set((state) => ({
      dashboards: [...state.dashboards, dashboard],
      currentDashboard: dashboard,
    }));
    return dashboard;
  },

  loadDashboard: async (id) => {
    set({ isLoadingDashboard: true });
    try {
      const response = await api.get<Dashboard>(`/dashboards/${id}`);
      set({ currentDashboard: response.data });
      // Load widget data
      get().loadWidgetData();
    } finally {
      set({ isLoadingDashboard: false });
    }
  },

  updateDashboard: async (id, payload) => {
    await api.put(`/dashboards/${id}`, payload);
    // Refresh current dashboard
    if (get().currentDashboard?.id === id) {
      await get().loadDashboard(id);
    }
    // Refresh dashboard list
    await get().loadDashboards();
  },

  deleteDashboard: async (id) => {
    await api.delete(`/dashboards/${id}`);
    set((state) => ({
      dashboards: state.dashboards.filter((d) => d.id !== id),
      currentDashboard: state.currentDashboard?.id === id ? null : state.currentDashboard,
    }));
  },

  toggleEditMode: () => {
    set((state) => ({ isEditMode: !state.isEditMode }));
  },

  setActiveWidget: (widgetId) => {
    set({ activeWidgetId: widgetId });
  },

  addWidget: (widgetType) => {
    const info = WIDGET_TYPE_INFO.find((w) => w.type === widgetType);
    if (!info) return;

    const current = get().currentDashboard;
    if (!current) return;

    // Find a non-overlapping position
    const existingWidgets = current.widgets || [];
    let x = snapToGrid(20);
    let y = snapToGrid(20);

    // Simple placement: find first available slot
    for (let attempt = 0; attempt < 50; attempt++) {
      let overlaps = false;
      for (const w of existingWidgets) {
        const pos = w.position;
        if (pos) {
          if (
            x < pos.x + pos.width &&
            x + info.defaultWidth > pos.x &&
            y < pos.y + pos.height &&
            y + info.defaultHeight > pos.y
          ) {
            overlaps = true;
            break;
          }
        }
      }
      if (!overlaps) break;
      x = snapToGrid(x + GRID_SIZE * 2);
      if (x + info.defaultWidth > get().canvasWidth) {
        x = snapToGrid(20);
        y = snapToGrid(y + GRID_SIZE * 2);
      }
    }

    const newWidget: DashboardWidget = {
      id: `temp-${Date.now()}`,
      dashboard_id: current.id,
      widget_type: widgetType,
      title: info.label,
      data_source_type: 'ENDPOINT',
      data_source_config: undefined,
      display_config: undefined,
      position: { x, y, width: info.defaultWidth, height: info.defaultHeight },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    set((state) => {
      const updatedDashboard = {
        ...state.currentDashboard!,
        widgets: [...(state.currentDashboard?.widgets || []), newWidget],
      };
      return { currentDashboard: updatedDashboard };
    });

    // Persist the widget to the backend
    const payload: DashboardWidgetCreatePayload = {
      widget_type: widgetType,
      title: info.label,
      data_source_type: 'ENDPOINT',
      position: { x, y, width: info.defaultWidth, height: info.defaultHeight },
    };
    api.post(`/dashboards/${current.id}/widgets`, payload).then((response) => {
      // Update the temp ID with the real ID
      set((state) => {
        const widgets = state.currentDashboard?.widgets.map((w) =>
          w.id === newWidget.id ? { ...response.data, position: newWidget.position } : w
        );
        return state.currentDashboard ? { currentDashboard: { ...state.currentDashboard, widgets: widgets || [] } } : {};
      });
    });
  },

  updateWidget: async (widgetId, payload) => {
    const current = get().currentDashboard;
    if (!current) return;

    await api.put(`/dashboards/${current.id}/widgets/${widgetId}`, payload);

    // Update local state
    set((state) => {
      const widgets = state.currentDashboard?.widgets.map((w) =>
        w.id === widgetId ? { ...w, ...payload, updated_at: new Date().toISOString() } : w
      );
      return state.currentDashboard ? { currentDashboard: { ...state.currentDashboard, widgets: widgets || [] } } : {};
    });
  },

  deleteWidget: async (widgetId) => {
    const current = get().currentDashboard;
    if (!current) return;

    await api.delete(`/dashboards/${current.id}/widgets/${widgetId}`);

    set((state) => {
      const widgets = state.currentDashboard?.widgets.filter((w) => w.id !== widgetId);
      return state.currentDashboard ? { currentDashboard: { ...state.currentDashboard, widgets: widgets || [] } } : {};
    });
  },

  updateWidgetPosition: (widgetId, position) => {
    const snapped = {
      x: snapToGrid(position.x),
      y: snapToGrid(position.y),
      width: snapToGrid(position.width),
      height: snapToGrid(position.height),
    };

    set((state) => {
      const widgets = state.currentDashboard?.widgets.map((w) =>
        w.id === widgetId ? { ...w, position: snapped } : w
      );
      return state.currentDashboard ? { currentDashboard: { ...state.currentDashboard, widgets: widgets || [] } } : {};
    });

    // Persist position
    const current = get().currentDashboard;
    if (current) {
      api.put(`/dashboards/${current.id}/widgets/${widgetId}`, { position: snapped }).catch(() => {
        // Silently fail — position will be saved on next full save
      });
    }
  },

  loadWidgetData: async () => {
    const current = get().currentDashboard;
    if (!current || !current.widgets?.length) {
      set({ widgetData: {}, isLoadingData: false });
      return;
    }

    set({ isLoadingData: true });
    try {
      const response = await api.get(`/dashboards/${current.id}/data`);
      set({ widgetData: response.data?.widget_data || {} });
    } catch {
      // Silently fail — widgets will show empty state
    } finally {
      set({ isLoadingData: false });
    }
  },

  setCanvasSize: (width, height) => {
    set({ canvasWidth: width, canvasHeight: height });
  },
}));
