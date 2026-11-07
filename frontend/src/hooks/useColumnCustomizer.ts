/**
 * Column Customizer Hook
 *
 * Manages the complete column configuration state for the Gantt grid view:
 * column visibility, order, pinning, density, zoom level, and Gantt layer
 * visibility.  Handles preset CRUD operations via the backend API and
 * supports exporting/importing .ppmview.json files.
 *
 * Responsibilities
 * ----------------
 *
 * - Maintain the current column configuration state (45 columns).
 * - Handle column visibility toggles, reordering, and pinning.
 * - Manage layout settings (density, zoom, split ratio, Gantt layers).
 * - Fetch, create, update, and delete presets via the backend API.
 * - Export configurations as .ppmview.json files.
 * - Import and validate .ppmview.json files.
 * - Encode/decode shareable URL hashes for peer-to-peer sharing.
 * - Sync column state with TanStack Table in WbsTable.tsx.
 * - Sync Gantt layer state with GanttViewport.tsx.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import api from '../services/api';
import {
  ColumnConfig,
  ColumnPinPosition,
  LayoutSettings,
  ConfigPayload,
  GanttViewPreset,
  PresetWithCategory,
  PresetCreateRequest,
  PPMViewExport,
  SharingScope,
  DensityTier,
  ZoomLevel,
  MASTER_COLUMN_DEFINITIONS,
  DEFAULT_LAYOUT_SETTINGS,
  getDefaultConfigPayload,
} from '../types/column_customizer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Complete customizer state.
 */
interface CustomizerState {
  /** Current column configurations */
  columns: ColumnConfig[];
  /** Current layout settings */
  layout: LayoutSettings;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Whether presets are loading */
  loadingPresets: boolean;
  /** Fetched presets from the backend */
  presets: PresetWithCategory[];
  /** Active preset ID (null = no preset applied) */
  activePresetId: string | null;
  /** Search filter for column names */
  columnSearch: string;
  /** Error message (null = no error) */
  error: string | null;
}

// ---------------------------------------------------------------------------
// URL Hash Encoding for Shareable URLs
// ---------------------------------------------------------------------------

/**
 * Compress column config into a minimal string for URL encoding.
 * Format: visible_fields:order:widths|density|zoom|split|layers
 */
function encodeConfigToHash(config: ConfigPayload): string {
  const visible = config.columns
    .filter((c) => c.visible)
    .map((c) => c.field)
    .join(',');
  const density = config.density;
  const zoom = config.gantt?.zoom_level ?? 'WEEKS';
  const split = Math.round(config.split_ratio * 100);
  const layers = `${config.gantt?.show_baselines ? '1' : '0'}${config.gantt?.show_dependencies ? '1' : '0'}${config.gantt?.show_drop_line ? '1' : '0'}${config.gantt?.show_presence ? '1' : '0'}`;
  return btoa(`${visible}|${density}|${zoom}|${split}|${layers}`);
}

/**
 * Decode a URL hash back into a partial config payload.
 */
function decodeConfigFromHash(hash: string): Partial<ConfigPayload> | null {
  try {
    const decoded = atob(hash);
    const parts = decoded.split('|');
    if (parts.length < 5) return null;

    const fields = parts[0].split(',').filter(Boolean);
    const density = parts[1] as DensityTier;
    const zoom = parts[2] as ZoomLevel;
    const split = parseInt(parts[3], 10) / 100;
    const layers = parts[4];

    return {
      columns: MASTER_COLUMN_DEFINITIONS.map((def, idx) => ({
        field: def.field,
        label: def.label,
        width: fields.includes(def.field) ? def.defaultWidth : 120,
        visible: fields.includes(def.field),
        frozen: def.defaultFrozen,
      })),
      density,
      split_ratio: Math.max(0.1, Math.min(0.9, split)),
      gantt: {
        zoom_level: zoom,
        show_baselines: layers[0] === '1',
        show_dependencies: layers[1] === '1',
        show_drop_line: layers[2] === '1',
        show_presence: layers[3] === '1',
      },
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useColumnCustomizer() {
  const [state, setState] = useState<CustomizerState>(() => ({
    columns: MASTER_COLUMN_DEFINITIONS.map((def, idx) => ({
      field: def.field,
      label: def.label,
      width: def.defaultWidth,
      visible: def.defaultVisible,
      pinned: def.defaultFrozen ? 'left' : 'none',
      order: idx,
    })),
    layout: { ...DEFAULT_LAYOUT_SETTINGS },
    isOpen: false,
    loadingPresets: false,
    presets: [],
    activePresetId: null,
    columnSearch: '',
    error: null,
  }));

  // -----------------------------------------------------------------------
  // Column Operations
  // -----------------------------------------------------------------------

  /** Toggle column visibility */
  const toggleColumnVisibility = useCallback((field: string) => {
    setState((prev) => ({
      ...prev,
      columns: prev.columns.map((col) =>
        col.field === field ? { ...col, visible: !col.visible } : col,
      ),
    }));
  }, []);

  /** Update column width */
  const updateColumnWidth = useCallback((field: string, width: number) => {
    setState((prev) => ({
      ...prev,
      columns: prev.columns.map((col) =>
        col.field === field ? { ...col, width: Math.max(50, Math.min(800, width)) } : col,
      ),
    }));
  }, []);

  /** Set column pin position */
  const setColumnPin = useCallback((field: string, pinned: ColumnPinPosition) => {
    setState((prev) => ({
      ...prev,
      columns: prev.columns.map((col) =>
        col.field === field ? { ...col, pinned } : col,
      ),
    }));
  }, []);

  /** Reorder columns (drag-to-reorder) */
  const reorderColumns = useCallback((fromIndex: number, toIndex: number) => {
    setState((prev) => {
      const updated = [...prev.columns];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return {
        ...prev,
        columns: updated.map((col, idx) => ({ ...col, order: idx })),
      };
    });
  }, []);

  /** Toggle all columns in a category */
  const toggleCategoryVisibility = useCallback((category: string, visible: boolean) => {
    setState((prev) => ({
      ...prev,
      columns: prev.columns.map((col) =>
        (col as any).category === category ? { ...col, visible } : col,
      ),
    }));
  }, []);

  // -----------------------------------------------------------------------
  // Layout Operations
  // -----------------------------------------------------------------------

  /** Update density tier */
  const setDensity = useCallback((density: DensityTier) => {
    setState((prev) => ({
      ...prev,
      layout: { ...prev.layout, density },
    }));
  }, []);

  /** Update zoom level */
  const setZoomLevel = useCallback((zoomLevel: ZoomLevel) => {
    setState((prev) => ({
      ...prev,
      layout: { ...prev.layout, zoomLevel },
    }));
  }, []);

  /** Update split ratio */
  const setSplitRatio = useCallback((splitRatio: number) => {
    setState((prev) => ({
      ...prev,
      layout: { ...prev.layout, splitRatio: Math.max(0.1, Math.min(0.9, splitRatio)) },
    }));
  }, []);

  /** Toggle Gantt layer visibility */
  const toggleGanttLayer = useCallback((layer: keyof NonNullable<ConfigPayload['gantt']>) => {
    setState((prev) => ({
      ...prev,
      layout: {
        ...prev.layout,
        ganttLayers: {
          ...prev.layout.ganttLayers,
          [layer]: !(prev.layout.ganttLayers as any)[layer],
        },
      },
    }));
  }, []);

  // -----------------------------------------------------------------------
  // Config Payload Conversion
  // -----------------------------------------------------------------------

  /** Convert current state to a ConfigPayload for the backend */
  const toConfigPayload = useCallback((): ConfigPayload => {
    const sorted = [...state.columns].sort((a, b) => a.order - b.order);
    return {
      columns: sorted.map((col) => ({
        field: col.field,
        label: col.label,
        width: col.width,
        visible: col.visible,
        frozen: col.pinned !== 'none',
      })),
      sort: { field: 'planned_start_date', direction: 'asc' },
      density: state.layout.density,
      split_ratio: state.layout.splitRatio,
      gantt: {
        zoom_level: state.layout.zoomLevel,
        show_baselines: state.layout.ganttLayers.showBaselines,
        show_drop_line: state.layout.ganttLayers.showDropLine,
        show_dependencies: state.layout.ganttLayers.showDependencies,
        show_presence: state.layout.ganttLayers.showPresence,
      },
    };
  }, [state.columns, state.layout]);

  const applyConfigPayload = useCallback((payload: ConfigPayload) => {
    setState((prev: CustomizerState) => {
      const columns = MASTER_COLUMN_DEFINITIONS.map((def) => {
        const match = payload.columns.find((c) => c.field === def.field);
        return {
          field: def.field,
          label: match?.label ?? def.label,
          width: match?.width ?? def.defaultWidth,
          visible: match?.visible ?? def.defaultVisible,
          pinned: match?.frozen ? 'left' : 'none',
          order: match ? payload.columns.indexOf(match) : def.field.charCodeAt(0),
        };
      });

      // Re-order by payload order
      columns.sort((a, b) => {
        const aIdx = payload.columns.findIndex((c) => c.field === a.field);
        const bIdx = payload.columns.findIndex((c) => c.field === b.field);
        return aIdx - bIdx;
      });

      return {
        ...prev,
        columns: columns.map((col, idx) => ({ ...col, order: idx })),
        layout: {
          density: payload.density,
          zoomLevel: payload.gantt?.zoom_level ?? 'WEEKS',
          splitRatio: payload.split_ratio,
          ganttLayers: {
            showBaselines: payload.gantt?.show_baselines ?? false,
            showDependencies: payload.gantt?.show_dependencies ?? true,
            showDropLine: payload.gantt?.show_drop_line ?? true,
            showPresence: payload.gantt?.show_presence ?? true,
          },
        },
      } as CustomizerState;
    });
  }, []);

  // -----------------------------------------------------------------------
  // Preset API Operations
  // -----------------------------------------------------------------------

  /** Fetch all accessible presets */
  const fetchPresets = useCallback(async () => {
    setState((prev) => ({ ...prev, loadingPresets: true, error: null }));
    try {
      const res = await api.get<GanttViewPreset[]>('/views/presets');
      const data = res.data || [];
      const categorized: PresetWithCategory[] = data.map((preset) => ({
        ...preset,
        category:
          preset.sharing_scope === 'SYSTEM_GLOBAL'
            ? 'System Standard'
            : preset.sharing_scope === 'PROJECT_SHARED'
            ? 'Project Shared'
            : 'Personal',
      }));
      setState((prev) => ({ ...prev, presets: categorized, loadingPresets: false }));
    } catch (err) {
      console.error('Failed to fetch presets:', err);
      setState((prev) => ({ ...prev, loadingPresets: false, error: 'Failed to load presets' }));
    }
  }, []);

  /** Create a new preset */
  const createPreset = useCallback(async (request: PresetCreateRequest) => {
    setState((prev) => ({ ...prev, error: null }));
    try {
      const res = await api.post<GanttViewPreset>('/views/presets', request);
      const data = res.data;
      const preset: PresetWithCategory = {
        ...data,
        category:
          data.sharing_scope === 'SYSTEM_GLOBAL'
            ? 'System Standard'
            : data.sharing_scope === 'PROJECT_SHARED'
            ? 'Project Shared'
            : 'Personal',
      };
      setState((prev) => ({
        ...prev,
        presets: [...prev.presets, preset],
        activePresetId: data.id,
      }));
      return data;
    } catch (err) {
      console.error('Failed to create preset:', err);
      setState((prev) => ({ ...prev, error: 'Failed to save preset' }));
      throw err;
    }
  }, []);

  /** Update an existing preset */
  const updatePreset = useCallback(async (id: string, payload: Partial<ConfigPayload & { name?: string; sharing_scope?: SharingScope }>) => {
    setState((prev) => ({ ...prev, error: null }));
    try {
      const res = await api.put<GanttViewPreset>(`/views/presets/${id}`, payload);
      const data = res.data;
      setState((prev) => ({
        ...prev,
        presets: prev.presets.map((p) =>
          p.id === id
            ? {
                ...p,
                ...data,
                category:
                  data.sharing_scope === 'SYSTEM_GLOBAL'
                    ? 'System Standard'
                    : data.sharing_scope === 'PROJECT_SHARED'
                    ? 'Project Shared'
                    : 'Personal',
              }
            : p,
        ),
      }));
      return data;
    } catch (err) {
      console.error('Failed to update preset:', err);
      setState((prev) => ({ ...prev, error: 'Failed to update preset' }));
      throw err;
    }
  }, []);

  /** Delete a preset */
  const deletePreset = useCallback(async (id: string) => {
    setState((prev) => ({ ...prev, error: null }));
    try {
      await api.delete(`/views/presets/${id}`);
      setState((prev) => ({
        ...prev,
        presets: prev.presets.filter((p) => p.id !== id),
        activePresetId: prev.activePresetId === id ? null : prev.activePresetId,
      }));
    } catch (err) {
      console.error('Failed to delete preset:', err);
      setState((prev) => ({ ...prev, error: 'Failed to delete preset' }));
      throw err;
    }
  }, []);

  /** Apply a preset to the current view */
  const applyPreset = useCallback((preset: GanttViewPreset) => {
    applyConfigPayload(preset.config_payload);
    setState((prev) => ({ ...prev, activePresetId: preset.id }));
  }, [applyConfigPayload]);

  // -----------------------------------------------------------------------
  // Export / Import
  // -----------------------------------------------------------------------

  /** Export current config as .ppmview.json file */
  const exportToFile = useCallback((presetName: string) => {
    const config = toConfigPayload();
    const exportData: PPMViewExport = {
      version: '1.0',
      export_date: new Date().toISOString(),
      preset_name: presetName,
      config,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${presetName.replace(/[^a-zA-Z0-9-_]/g, '_')}.ppmview.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [toConfigPayload]);

  /** Import a .ppmview.json file */
  const importFromFile = useCallback((file: File): Promise<PPMViewExport> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string) as PPMViewExport;
          // Validate structure
          if (!data.config || !data.config.columns || !data.config.density) {
            reject(new Error('Invalid .ppmview.json format'));
            return;
          }
          applyConfigPayload(data.config);
          resolve(data);
        } catch (err) {
          reject(new Error('Failed to parse .ppmview.json file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }, [applyConfigPayload]);

  /** Import via backend API endpoint */
  const importViaApi = useCallback(async (file: File) => {
    setState((prev) => ({ ...prev, error: null }));
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/views/presets/import-file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data;
      // Apply the imported config
      if (data.config_payload) {
        applyConfigPayload(data.config_payload);
      }
      await fetchPresets();
      return data;
    } catch (err) {
      console.error('Failed to import preset:', err);
      setState((prev) => ({ ...prev, error: 'Failed to import preset file' }));
      throw err;
    }
  }, [applyConfigPayload, fetchPresets]);

  /** Generate a shareable URL hash */
  const generateShareableUrl = useCallback((): string => {
    const config = toConfigPayload();
    const hash = encodeConfigToHash(config);
    return `${window.location.origin}${window.location.pathname}#view=${hash}`;
  }, [toConfigPayload]);

  /** Apply a shareable URL hash */
  const applyShareableHash = useCallback((hash: string): boolean => {
    const partial = decodeConfigFromHash(hash);
    if (partial) {
      applyConfigPayload(partial as ConfigPayload);
      return true;
    }
    return false;
  }, [applyConfigPayload]);

  // -----------------------------------------------------------------------
  // Modal Controls
  // -----------------------------------------------------------------------

  /** Open the customizer modal */
  const openModal = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: true }));
  }, []);

  /** Close the customizer modal */
  const closeModal = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false, columnSearch: '' }));
  }, []);

  /** Reset to default configuration */
  const resetToDefaults = useCallback(() => {
    const defaults = getDefaultConfigPayload();
    applyConfigPayload(defaults);
    setState((prev) => ({
      ...prev,
      activePresetId: null,
      columns: MASTER_COLUMN_DEFINITIONS.map((def, idx) => ({
        field: def.field,
        label: def.label,
        width: def.defaultWidth,
        visible: def.defaultVisible,
        pinned: def.defaultFrozen ? 'left' : 'none',
        order: idx,
      })),
      layout: { ...DEFAULT_LAYOUT_SETTINGS },
    }));
  }, [applyConfigPayload]);

  /** Set column search filter */
  const setColumnSearch = useCallback((search: string) => {
    setState((prev) => ({ ...prev, columnSearch: search }));
  }, []);

  // -----------------------------------------------------------------------
  // Filtered columns for search
  // -----------------------------------------------------------------------

  const filteredColumns = useMemo(() => {
    if (!state.columnSearch.trim()) return state.columns;
    const search = state.columnSearch.toLowerCase();
    return state.columns.filter(
      (col) =>
        col.field.toLowerCase().includes(search) ||
        col.label.toLowerCase().includes(search),
    );
  }, [state.columns, state.columnSearch]);

  // -----------------------------------------------------------------------
  // Check for URL hash on mount
  // -----------------------------------------------------------------------

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash.startsWith('view=')) {
      const viewHash = hash.slice(5);
      applyShareableHash(viewHash);
    }
  }, [applyShareableHash]);

  // -----------------------------------------------------------------------
  // Return value
  // -----------------------------------------------------------------------

  return {
    // State
    state,
    filteredColumns,

    // Column operations
    toggleColumnVisibility,
    updateColumnWidth,
    setColumnPin,
    reorderColumns,
    toggleCategoryVisibility,

    // Layout operations
    setDensity,
    setZoomLevel,
    setSplitRatio,
    toggleGanttLayer,

    // Config payload
    toConfigPayload,
    applyConfigPayload,

    // Preset operations
    fetchPresets,
    createPreset,
    updatePreset,
    deletePreset,
    applyPreset,

    // Export / Import
    exportToFile,
    importFromFile,
    importViaApi,
    generateShareableUrl,
    applyShareableHash,

    // Modal controls
    openModal,
    closeModal,
    resetToDefaults,
    setColumnSearch,
  };
}
