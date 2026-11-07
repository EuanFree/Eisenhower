/**
 * Zustand store for multi-view preset management.
 *
 * Manages active preset ID, unsaved modification dirty flags,
 * and preset switching for all view types (WBS_GANTT, DAILY_COCKPIT,
 * SRA_RISK, FACILITY_CHAMBER, EVM_REPORTING).
 *
 * Presets are persisted to PostgreSQL via the /api/v1/presets endpoints
 * and cached locally for fast switching.  When a user modifies their
 * active view configuration, the store sets a dirty flag that triggers
 * a "Save Preset" prompt.
 *
 * Usage
 * ~~~~~
 *
 * ```tsx
 * const { activePreset, presets, loadPresets, applyPreset, setDirty } = usePresetStore();
 * ```
 */

import { create } from 'zustand';
import api from '../services/api';

// ============================================================================
// Types
// ============================================================================

export type ViewType = 'WBS_GANTT' | 'DAILY_COCKPIT' | 'SRA_RISK' | 'FACILITY_CHAMBER' | 'EVM_REPORTING';

export type SharingScope = 'PRIVATE' | 'PROJECT_SHARED' | 'SYSTEM_GLOBAL';

export type PresetClassification = 'OFFICIAL' | 'SECRET' | 'TOP_SECRET';

export interface PresetConfig {
  [key: string]: any;
}

export interface ViewPreset {
  id: string;
  view_type: ViewType;
  name: string;
  description: string | null;
  author_user_id: string;
  project_id: string | null;
  sharing_scope: SharingScope;
  classification: PresetClassification;
  layout_schema_version: string;
  config_payload: PresetConfig;
  created_at: string;
  updated_at: string;
}

export interface PresetState {
  /** Currently active preset ID (per view type) */
  activePresetId: string | null;

  /** All loaded presets for the current view type */
  presets: ViewPreset[];

  /** Whether the current view configuration has unsaved changes */
  isDirty: boolean;

  /** Currently active view type */
  activeViewType: ViewType;

  /** Loading state */
  isLoading: boolean;

  /** Error message if loading failed */
  error: string | null;

  /**
   * Fetch presets for the given view type from the backend.
   *
   * @param viewType - The view type to load presets for.
   */
  loadPresets: (viewType: ViewType) => Promise<void>;

  /**
   * Apply a preset by ID, updating the active configuration.
   *
   * @param presetId - The ID of the preset to apply.
   * @returns The applied preset or null if not found.
   */
  applyPreset: (presetId: string) => ViewPreset | null;

  /**
   * Set the dirty flag to indicate unsaved changes.
   *
   * @param dirty - Whether the current configuration has unsaved changes.
   */
  setDirty: (dirty: boolean) => void;

  /**
   * Set the active view type and load its presets.
   *
   * @param viewType - The new active view type.
   */
  setActiveViewType: (viewType: ViewType) => void;

  /**
   * Save the current configuration as a new preset.
   *
   * @param name - Preset name.
   * @param description - Optional description.
   * @param sharingScope - Visibility scope.
   * @param classification - Security classification.
   * @param configPayload - The current view configuration.
   * @returns The created preset.
   */
  savePreset: (
    name: string,
    description: string | null,
    sharingScope: SharingScope,
    classification: PresetClassification,
    configPayload: PresetConfig,
  ) => Promise<ViewPreset | null>;

  /**
   * Update an existing preset's configuration.
   *
   * @param presetId - The ID of the preset to update.
   * @param configPayload - The updated configuration.
   * @returns The updated preset.
   */
  updatePreset: (
    presetId: string,
    configPayload: PresetConfig,
  ) => Promise<ViewPreset | null>;

  /**
   * Export a preset as a .ppmview.json file download.
   *
   * @param presetId - The ID of the preset to export.
   */
  exportPreset: (presetId: string) => Promise<void>;

  /**
   * Import a .ppmview.json file and create a new preset.
   *
   * @param file - The uploaded file.
   * @param presetName - Name for the imported preset.
   * @returns The import result.
   */
  importPreset: (file: File, presetName: string) => Promise<{ success: boolean; presetId?: string; errors?: string[] }>;

  /**
   * Clear the dirty flag after a successful save.
   */
  clearDirty: () => void;
}

// ============================================================================
// Store
// ============================================================================

export const usePresetStore = create<PresetState>((set, get) => ({
  activePresetId: null,
  presets: [],
  isDirty: false,
  activeViewType: 'WBS_GANTT',
  isLoading: false,
  error: null,

  loadPresets: async (viewType: ViewType) => {
    set({ isLoading: true, error: null, activeViewType: viewType });
    try {
      const response = await api.get('/api/v1/presets', {
        params: { view_type: viewType },
      });
      const presets = response.data.presets || [];
      set({ presets, isLoading: false });
    } catch (err: any) {
      console.error('Failed to load presets:', err);
      set({
        presets: [],
        isLoading: false,
        error: err.response?.data?.detail || 'Failed to load presets',
      });
    }
  },

  applyPreset: (presetId: string) => {
    const { presets } = get();
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return null;
    set({ activePresetId: presetId, isDirty: false });
    return preset;
  },

  setDirty: (dirty: boolean) => {
    set({ isDirty: dirty });
  },

  setActiveViewType: (viewType: ViewType) => {
    const { loadPresets } = get();
    set({ activeViewType: viewType, activePresetId: null, isDirty: false });
    loadPresets(viewType);
  },

  savePreset: async (
    name: string,
    description: string | null,
    sharingScope: SharingScope,
    classification: PresetClassification,
    configPayload: PresetConfig,
  ) => {
    const { activeViewType } = get();
    try {
      const response = await api.post('/api/v1/presets', {
        view_type: activeViewType,
        name,
        description,
        sharing_scope: sharingScope,
        classification,
        config_payload: configPayload,
      });
      const newPreset = response.data;

      // Add to local cache
      const { presets, loadPresets } = get();
      set({
        presets: [...presets, newPreset],
        activePresetId: newPreset.id,
        isDirty: false,
      });
      return newPreset;
    } catch (err: any) {
      console.error('Failed to save preset:', err);
      return null;
    }
  },

  updatePreset: async (presetId: string, configPayload: PresetConfig) => {
    try {
      const response = await api.put(`/api/v1/presets/${presetId}`, {
        config_payload: configPayload,
      });
      const updatedPreset = response.data;

      // Update local cache
      const { presets } = get();
      set({
        presets: presets.map((p) => (p.id === presetId ? updatedPreset : p)),
        isDirty: false,
      });
      return updatedPreset;
    } catch (err: any) {
      console.error('Failed to update preset:', err);
      return null;
    }
  },

  exportPreset: async (presetId: string) => {
    try {
      const response = await api.get(`/api/v1/presets/${presetId}/export-file`, {
        responseType: 'blob',
      });

      // Trigger browser download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${presetId}.ppmview.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Failed to export preset:', err);
    }
  },

  importPreset: async (file: File, presetName: string) => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/api/v1/presets/import-file', formData, {
        params: { preset_name: presetName },
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const data = response.data;
      if (data.success) {
        // Reload presets to include the imported one
        const { loadPresets, activeViewType } = get();
        await loadPresets(activeViewType);
      }
      return data;
    } catch (err: any) {
      console.error('Failed to import preset:', err);
      return {
        success: false,
        errors: [err.response?.data?.detail || 'Import failed'],
      };
    }
  },

  clearDirty: () => {
    set({ isDirty: false });
  },
}));
