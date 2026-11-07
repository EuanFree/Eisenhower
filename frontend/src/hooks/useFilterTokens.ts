/**
 * Filter Tokens Hook
 *
 * Manages the tokenized filter system for the WBS schedule query bar.
 * Handles token parsing, autocomplete suggestions, node matching,
 * dual visualization modes, and named view presets.
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    const filter = useFilterTokens();
 *
 *    // Access parsed tokens, matching nodes, autocomplete suggestions
 *    const { tokens, matchingNodeIds, suggestions, applyPreset, savePreset } = filter;
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useScheduleStore } from '../stores/useScheduleStore';
import { useDisplayStore } from '../stores/useDisplayStore';
import { useSessionStateStore } from '../stores/useSessionStateStore';
import { getActiveTab } from '../stores/useWorkspaceStore';
import { WBSRow } from '../types/wbs';
import {
  FilterToken,
  FilterTokenKey,
  FilterVisualizationMode,
  ViewPreset,
  AutocompleteSuggestion,
  TOKEN_KEY_LABELS,
  TOKEN_KEY_VALUES,
  TIER_SHORT,
  HierarchyTier,
} from '../types/filter';

// ---------------------------------------------------------------------------
// Token Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a raw token string into a structured FilterToken.
 *
 * Supported formats:
 * - tier:WP
 * - is:critical
 * - float:<5d
 * - dal:DAL_A
 * - blocker:any
 * - owner:j.smith
 *
 * @param raw - The raw token string (e.g., 'tier:WP')
 * @returns A parsed FilterToken
 */
function parseToken(raw: string): FilterToken {
  const colonIdx = raw.indexOf(':');
  if (colonIdx === -1) {
    return { key: 'tier' as FilterTokenKey, value: raw, raw, isValid: false };
  }

  const key = raw.substring(0, colonIdx).toLowerCase() as FilterTokenKey;
  const value = raw.substring(colonIdx + 1);

  // Validate key
  const validKeys = Object.keys(TOKEN_KEY_LABELS) as FilterTokenKey[];
  const isValid = validKeys.includes(key);

  // Extract operator for float filters
  let operator: string | undefined;
  let cleanValue = value;
  if (key === 'float') {
    const opMatch = value.match(/^([<>=]+)(.*)/);
    if (opMatch) {
      operator = opMatch[1];
      cleanValue = opMatch[2];
    }
  }

  return { key, value: cleanValue, operator, raw, isValid };
}

/**
 * Parse a full token string into an array of FilterTokens.
 * Tokens are separated by whitespace.
 *
 * @param tokenString - The full token string (e.g., 'tier:WP is:critical')
 * @returns Array of parsed FilterTokens
 */
function parseTokenString(tokenString: string): FilterToken[] {
  if (!tokenString.trim()) return [];
  return tokenString.trim().split(/\s+/).map(parseToken);
}

// ---------------------------------------------------------------------------
// Node Matching
// ---------------------------------------------------------------------------

/**
 * Map ltree indent level to hierarchy tier.
 * Level 0 = Programme, 1 = Project, 2 = Control Account, 3 = Work Package, 4+ = Task.
 */
function getTierFromRow(row: WBSRow): HierarchyTier {
  const level = row.indentLevel;
  if (level === 0) return 'PROGRAMME';
  if (level === 1) return 'PROJECT';
  if (level === 2) return 'CONTROL_ACCOUNT';
  if (level === 3) return 'WORK_PACKAGE';
  return 'TASK';
}

/**
 * Check if a WBSRow matches a single filter token.
 */
function matchesToken(row: WBSRow, token: FilterToken): boolean {
  if (!token.isValid) return true; // Invalid tokens don't filter

  switch (token.key) {
    case 'tier': {
      const tier = getTierFromRow(row);
      const val = token.value.toUpperCase();
      // Support both short codes and full names
      const tierShort = TIER_SHORT[tier];
      return tier === val || tierShort === val.toUpperCase();
    }

    case 'is': {
      const val = token.value.toLowerCase();
      switch (val) {
        case 'critical':
          return row.total_float !== null && row.total_float <= 0;
        case 'not-critical':
          return row.total_float === null || row.total_float > 0;
        case 'blocked':
          return !!(row.blockers && row.blockers.length > 0);
        case 'complete':
          return row.percent_complete >= 100;
        case 'in-progress':
          return row.percent_complete > 0 && row.percent_complete < 100;
        default:
          return true;
      }
    }

    case 'float': {
      if (row.total_float === null || row.total_float === undefined) return false;
      const tf = row.total_float;
      const val = token.value.toLowerCase();

      if (val === 'any') return true;

      // Parse numeric value (e.g., '5d' → 5)
      const numMatch = val.match(/(\d+)/);
      const num = numMatch ? parseInt(numMatch[1], 10) : 0;

      switch (token.operator) {
        case '<':
          return tf < num;
        case '<=':
          return tf <= num;
        case '>':
          return tf > num;
        case '>=':
          return tf >= num;
        case '=':
          return tf === num;
        default:
          // No operator — default to <
          return tf < num;
      }
    }

    case 'dal': {
      const dal = (row.custom_attributes && (row.custom_attributes as any).dal_sil_level) || 'NON_SAFETY';
      return dal === token.value.toUpperCase();
    }

    case 'blocker': {
      const val = token.value.toLowerCase();
      const hasBlockers = row.blockers && row.blockers.length > 0;

      switch (val) {
        case 'any':
          return !!hasBlockers;
        case 'none':
          return !hasBlockers;
        case 'critical':
          return !!(hasBlockers && row.blockers?.some((b) => b.severity === 'CRITICAL'));
        case 'major':
          return !!(hasBlockers && row.blockers?.some((b) => b.severity === 'MAJOR'));
        case 'minor':
          return !!(hasBlockers && row.blockers?.some((b) => b.severity === 'MINOR'));
        default:
          return true;
      }
    }

    case 'owner': {
      // Check assigned resources for matching owner
      const ownerName = token.value.toLowerCase();
      const assignments = (row.custom_attributes && (row.custom_attributes as any).assignments) as Array<{
        resource_name?: string;
        resource_code?: string;
      }> | undefined;

      if (!assignments || assignments.length === 0) return false;
      return assignments.some(
        (a) =>
          (a.resource_name && a.resource_name.toLowerCase().includes(ownerName)) ||
          (a.resource_code && a.resource_code.toLowerCase().includes(ownerName)),
      );
    }

    case 'mode': {
      return row.delivery_mode === token.value.toUpperCase();
    }

    case 'classification': {
      return row.security_classification === token.value.toUpperCase();
    }

    case 'progress': {
      const pct = row.percent_complete;
      const val = token.value.toLowerCase();

      switch (val) {
        case '0%':
          return pct === 0;
        case '0-25%':
          return pct >= 0 && pct < 25;
        case '25-50%':
          return pct >= 25 && pct < 50;
        case '50-75%':
          return pct >= 50 && pct < 75;
        case '75-100%':
          return pct >= 75 && pct < 100;
        case '100%':
          return pct >= 100;
        default:
          return true;
      }
    }

    default:
      return true;
  }
}

/**
 * Check if a row matches all active filter tokens.
 */
function matchesAllTokens(row: WBSRow, tokens: FilterToken[]): boolean {
  return tokens.every((token) => matchesToken(row, token));
}

/**
 * Given a set of matching node IDs, compute the set of visible node IDs.
 * In filter mode, ancestors of matching nodes are also visible.
 * In dim mode, all nodes are visible.
 */
function computeVisibleNodeIds(
  rows: WBSRow[],
  matchingNodeIds: Set<string>,
  mode: FilterVisualizationMode,
): Set<string> {
  if (mode === 'DIM') {
    // In dim mode, all nodes are visible
    return new Set(rows.map((r) => r.id));
  }

  // In filter mode, include matching nodes and their ancestors
  const visible = new Set<string>(matchingNodeIds);

  // Build a map of node paths for ancestor lookup
  const nodeMap = new Map<string, WBSRow>();
  for (const row of rows) {
    nodeMap.set(row.id, row);
  }

  // For each matching node, walk up the path to find ancestors
  for (const nodeId of matchingNodeIds) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    // Split the ltree path and walk up
    const parts = node.path.split('.');
    for (let i = parts.length - 1; i >= 0; i--) {
      const ancestorPath = parts.slice(0, i + 1).join('.');
      // Find the node with this path
      for (const row of rows) {
        if (row.path === ancestorPath) {
          visible.add(row.id);
          break;
        }
      }
    }
  }

  return visible;
}

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------

/**
 * Generate autocomplete suggestions based on the current input text.
 */
function generateSuggestions(
  input: string,
  rows: WBSRow[],
): AutocompleteSuggestion[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  // Determine if we're typing a key or a value
  const colonIdx = trimmed.lastIndexOf(':');
  let currentKey: FilterTokenKey | null = null;
  let currentValue = '';

  if (colonIdx === -1) {
    // Typing a key
    const partial = trimmed.toLowerCase();
    return (Object.keys(TOKEN_KEY_LABELS) as FilterTokenKey[])
      .filter((key) => key.startsWith(partial))
      .map((key) => ({
        text: `${key}:`,
        key,
        value: null,
        label: key,
        description: TOKEN_KEY_LABELS[key],
        isKey: true,
      }));
  } else {
    // Typing a value
    currentKey = trimmed.substring(0, colonIdx).toLowerCase() as FilterTokenKey;
    currentValue = trimmed.substring(colonIdx + 1).toLowerCase();

    if (!currentKey || !(currentKey in TOKEN_KEY_VALUES)) {
      return [];
    }

    // For owner, extract unique resource names from rows
    if (currentKey === 'owner') {
      const owners = new Set<string>();
      for (const row of rows) {
        const assignments = (row.custom_attributes && (row.custom_attributes as any).assignments) as Array<{
          resource_name?: string;
          resource_code?: string;
        }> | undefined;
        if (assignments) {
          for (const a of assignments) {
            if (a.resource_name) owners.add(a.resource_name);
            if (a.resource_code) owners.add(a.resource_code);
          }
        }
      }

      return Array.from(owners)
        .filter((name) => name.toLowerCase().includes(currentValue))
        .slice(0, 10)
        .map((name) => ({
          text: `${currentKey}:${name}`,
          key: currentKey,
          value: name,
          label: name,
          description: 'Assigned engineer',
          isKey: false,
        }));
    }

    // For other keys, use predefined values
    const values = TOKEN_KEY_VALUES[currentKey] || [];
    return values
      .filter((val) => val.toLowerCase().includes(currentValue))
      .slice(0, 10)
      .map((val) => ({
        text: `${currentKey}:${val}`,
        key: currentKey,
        value: val,
        label: val,
        description: currentKey ? TOKEN_KEY_LABELS[currentKey] : '',
        isKey: false,
      }));
  }
}

// ---------------------------------------------------------------------------
// Preset Management
// ---------------------------------------------------------------------------

/**
 * Load presets from the display store's view_state_overrides.
 */
function loadPresets(): ViewPreset[] {
  try {
    const overrides = useDisplayStore.getState().settings.viewStateOverrides;
    const saved = (overrides as any).saved_presets;
    if (Array.isArray(saved)) return saved;
  } catch {
    // Ignore errors
  }
  return [];
}

/**
 * Save presets to the display store's view_state_overrides.
 */
function savePresets(presets: ViewPreset[]) {
  const displayStore = useDisplayStore.getState();
  const overrides = { ...displayStore.settings.viewStateOverrides, saved_presets: presets };
  displayStore.updateDisplaySettings({ viewStateOverrides: overrides });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseFilterTokensReturn {
  /** Raw token string from the input */
  tokenString: string;
  /** Set the token string */
  setTokenString: (s: string) => void;
  /** Parsed filter tokens */
  tokens: FilterToken[];
  /** Current visualization mode */
  visualizationMode: FilterVisualizationMode;
  /** Set the visualization mode */
  setVisualizationMode: (mode: FilterVisualizationMode) => void;
  /** Set of matching node IDs */
  matchingNodeIds: Set<string>;
  /** Set of visible node IDs (matching + ancestors in filter mode) */
  visibleNodeIds: Set<string>;
  /** Whether any filter is active */
  hasActiveFilter: boolean;
  /** Number of matching nodes */
  matchCount: number;
  /** Current autocomplete suggestions */
  suggestions: AutocompleteSuggestion[];
  /** Set the current autocomplete input */
  setAutocompleteInput: (s: string) => void;
  /** Whether the autocomplete dropdown is open */
  isAutocompleteOpen: boolean;
  /** Selected suggestion index */
  selectedSuggestionIndex: number;
  /** Save a named view preset */
  savePreset: (name: string) => void;
  /** Load a preset by ID */
  applyPreset: (id: string) => void;
  /** Delete a preset by ID */
  deletePreset: (id: string) => void;
  /** List of saved presets */
  presets: ViewPreset[];
  /** Currently active preset ID */
  activePresetId: string | null;
  /** Clear all filters */
  clearFilters: () => void;
}

/**
 * React hook for managing tokenized filter state, autocomplete,
 * node matching, and named view presets.
 *
 * @returns Filter state and actions
 */
export function useFilterTokens(): UseFilterTokensReturn {
  const [tokenString, setTokenStringState] = useState('');
  const [visualizationMode, setVisualizationMode] = useState<FilterVisualizationMode>('FILTER');
  const [autocompleteInput, setAutocompleteInput] = useState('');
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [presets, setPresets] = useState<ViewPreset[]>(loadPresets);

  const rows = useScheduleStore((s) => s.rows);
  const setFilterState = useScheduleStore((s) => s.setFilterState);

  // Session state persistence for filter tokens
  const saveViewState = useSessionStateStore((s) => s.saveViewState);
  const loadViewState = useSessionStateStore((s) => s.loadViewState);
  const activeTab = getActiveTab();

  // Restore saved filter on mount
  useEffect(() => {
    if (!activeTab) return;
    const saved = loadViewState(activeTab.id);
    if (saved?.filterTokens !== undefined) {
      setTokenStringState(saved.filterTokens);
    }
    if (saved?.filterMode) {
      setVisualizationMode(saved.filterMode);
    }
  }, [activeTab?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist filter tokens and mode on change
  useEffect(() => {
    if (!activeTab) return;
    saveViewState(activeTab.id, {
      filterTokens: tokenString,
      filterMode: visualizationMode,
    });
  }, [tokenString, visualizationMode, activeTab?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Parse tokens from string
  const tokens = useMemo(() => parseTokenString(tokenString), [tokenString]);

  // Compute matching node IDs
  const matchingNodeIds = useMemo(() => {
    const matched = new Set<string>();
    for (const row of rows) {
      if (matchesAllTokens(row, tokens)) {
        matched.add(row.id);
      }
    }
    return matched;
  }, [rows, tokens]);

  // Compute visible node IDs based on mode
  const visibleNodeIds = useMemo(
    () => computeVisibleNodeIds(rows, matchingNodeIds, visualizationMode),
    [rows, matchingNodeIds, visualizationMode],
  );

  // Sync filter state to the schedule store so WbsTable and GanttBar can consume it
  useEffect(() => {
    setFilterState({
      filterMode: visualizationMode,
      matchingNodeIds,
      visibleNodeIds,
    });
  }, [visualizationMode, matchingNodeIds, visibleNodeIds, setFilterState]);

  // Autocomplete suggestions
  const suggestions = useMemo(
    () => generateSuggestions(autocompleteInput, rows),
    [autocompleteInput, rows],
  );

  const isAutocompleteOpen = suggestions.length > 0 && autocompleteInput.length > 0;

  // Derived state
  const hasActiveFilter = tokens.length > 0;
  const matchCount = matchingNodeIds.size;

  // Token string setter with preset clearing
  const setTokenString = useCallback((s: string) => {
    setTokenStringState(s);
    setActivePresetId(null);
  }, []);

  // Save a named preset
  const savePreset = useCallback(
    (name: string) => {
      const preset: ViewPreset = {
        id: `preset-${Date.now()}`,
        name,
        tokenString,
        visualizationMode,
        columnWidths: useScheduleStore.getState().columnState.columnWidths,
        hiddenColumns: useScheduleStore.getState().columnState.hiddenColumns,
        savedAt: Date.now(),
      };

      const updated = [...presets.filter((p) => p.name !== name), preset];
      setPresets(updated);
      savePresets(updated);
      setActivePresetId(preset.id);
    },
    [tokenString, visualizationMode, presets],
  );

  // Apply a preset
  const applyPreset = useCallback((id: string) => {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;

    setTokenStringState(preset.tokenString);
    setVisualizationMode(preset.visualizationMode);
    setActivePresetId(id);

    // Restore column state if available
    if (preset.columnWidths || preset.hiddenColumns) {
      useScheduleStore.getState().updateColumnState({
        columnWidths: preset.columnWidths,
        hiddenColumns: preset.hiddenColumns,
      });
    }
  }, [presets]);

  // Delete a preset
  const deletePreset = useCallback(
    (id: string) => {
      const updated = presets.filter((p) => p.id !== id);
      setPresets(updated);
      savePresets(updated);
      if (activePresetId === id) setActivePresetId(null);
    },
    [presets, activePresetId],
  );

  // Clear all filters
  const clearFilters = useCallback(() => {
    setTokenStringState('');
    setVisualizationMode('FILTER');
    setActivePresetId(null);
  }, []);

  // Load presets on mount
  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  return {
    tokenString,
    setTokenString,
    tokens,
    visualizationMode,
    setVisualizationMode,
    matchingNodeIds,
    visibleNodeIds,
    hasActiveFilter,
    matchCount,
    suggestions,
    setAutocompleteInput,
    isAutocompleteOpen,
    selectedSuggestionIndex,
    savePreset,
    applyPreset,
    deletePreset,
    presets,
    activePresetId,
    clearFilters,
  };
}
