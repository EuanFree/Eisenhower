/**
 * Display Settings Zustand Store
 *
 * Manages the user's display profile: density, scale factor, theme,
 * color accessibility mode, and view state overrides (column widths,
 * split-pane ratios).
 *
 * On application start, `hydrateDisplaySettings()` is called to fetch
 * the user's saved profile from the backend and immediately apply it
 * to `document.documentElement` via data attributes — ensuring the UI
 * is pre-painted before React renders, with no flash of unstyled content.
 *
 * Updates are applied locally first (instant UI feedback) and then
 * debounced to PostgreSQL via PUT /api/v1/users/me/display-settings.
 */

import { create } from 'zustand';
import api from '../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Density = 'ULTRA_DENSE' | 'BALANCED' | 'COMFORT';
export type Theme = 'SCIF_DARK' | 'HIGH_CONTRAST_DARK' | 'BALANCED_LIGHT' | 'PROJECTOR';
export type ColorAccessibility =
  | 'STANDARD_RAG'
  | 'DEUTERANOPIA'
  | 'PROTANOPIA'
  | 'TRITANOPIA'
  | 'MONOCHROME_PATTERN';

export interface ViewStateOverrides {
  /** Column width map: { columnKey: pixelWidth } */
  columnWidths?: Record<string, number>;
  /** Hidden column keys */
  hiddenColumns?: string[];
  /** Split-pane ratio (0.0–1.0) */
  splitPaneRatio?: number;
  /** Additional free-form overrides */
  [key: string]: unknown;
}

export interface DisplaySettings {
  density: Density;
  scaleFactor: number;
  rowHeightPx: number;
  theme: Theme;
  colorAccessibility: ColorAccessibility;
  viewStateOverrides: ViewStateOverrides;
}

interface DisplayStoreState {
  /** Current display settings */
  settings: DisplaySettings;
  /** Whether hydration from the server has completed */
  hydrated: boolean;
  /** Whether a debounced PUT is currently pending */
  saving: boolean;

  /**
   * Fetch the active display profile from the backend and apply it
   * to the DOM immediately.
   */
  hydrateDisplaySettings: () => Promise<void>;

  /**
   * Mutate local state and DOM properties instantly, then debounce
   * a PUT to PostgreSQL.
   */
  updateDisplaySettings: (partial: Partial<DisplaySettings>) => void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const defaultSettings: DisplaySettings = {
  density: 'BALANCED',
  scaleFactor: 1.0,
  rowHeightPx: 36,
  theme: 'SCIF_DARK',
  colorAccessibility: 'STANDARD_RAG',
  viewStateOverrides: {},
};

// Row height map for density presets
const densityRowHeight: Record<Density, number> = {
  ULTRA_DENSE: 28,
  BALANCED: 36,
  COMFORT: 44,
};

// ---------------------------------------------------------------------------
// DOM Helpers
// ---------------------------------------------------------------------------

/**
 * Apply display settings to document.documentElement so the CSS token
 * system picks them up before React paints.
 */
function applyToDOM(settings: DisplaySettings) {
  const el = document.documentElement;

  // Density attribute — drives --row-height, --cell-font-size, --pad-y
  el.setAttribute('data-density', settings.density);

  // Theme attribute — drives background, border, text palettes
  el.setAttribute('data-theme', settings.theme);

  // Color accessibility — drives RAG metric colors
  el.setAttribute('data-color-mode', settings.colorAccessibility);

  // Scale factor — drives root font-size via calc()
  el.style.setProperty('--ui-scale', String(settings.scaleFactor));
}

// ---------------------------------------------------------------------------
// Debounce
// ---------------------------------------------------------------------------

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function debounceSave(settings: DisplaySettings) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    try {
      await api.put('/users/me/display-settings', settings);
    } catch (err) {
      console.error('Failed to persist display settings:', err);
    }
  }, 500);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useDisplayStore = create<DisplayStoreState>((set, get) => ({
  settings: defaultSettings,
  hydrated: false,
  saving: false,

  hydrateDisplaySettings: async () => {
    try {
      const res = await api.get<any>('/users/me/display-settings');
      const data = res?.data !== undefined ? res.data : res;
      const settings: DisplaySettings = data && data.density ? {
        density: data.density || defaultSettings.density,
        scaleFactor: data.scaleFactor ?? data.scale_factor ?? defaultSettings.scaleFactor,
        rowHeightPx: data.rowHeightPx ?? data.row_height_px ?? defaultSettings.rowHeightPx,
        theme: data.theme || defaultSettings.theme,
        colorAccessibility: data.colorAccessibility || data.color_accessibility || defaultSettings.colorAccessibility,
        viewStateOverrides: data.viewStateOverrides || data.view_state_overrides || defaultSettings.viewStateOverrides,
      } : defaultSettings;
      applyToDOM(settings);
      set({ settings, hydrated: true });
    } catch (err) {
      console.warn('Display settings hydration failed; using defaults.', err);
      applyToDOM(defaultSettings);
      set({ settings: defaultSettings, hydrated: true });
    }
  },

  updateDisplaySettings: (partial) => {
    const current = get().settings;
    const updated: DisplaySettings = { ...current, ...partial };

    // Auto-adjust row height when density changes
    if (partial.density && !partial.rowHeightPx) {
      updated.rowHeightPx = densityRowHeight[partial.density];
    }

    // Clamp scale factor
    if (partial.scaleFactor !== undefined) {
      updated.scaleFactor = Math.max(0.8, Math.min(1.5, partial.scaleFactor));
    }

    // Apply to DOM immediately for instant visual feedback
    applyToDOM(updated);

    // Update local state
    set({ settings: updated, saving: true });

    // Debounce server commit
    debounceSave(updated);

    // Mark saving as false after debounce window
    setTimeout(() => set({ saving: false }), 600);
  },
}));
