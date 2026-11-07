/**
 * Filter Toolbar — High-Density Schedule Query Bar
 *
 * Multi-faceted filter bar for the WBS schedule view with:
 *
 * - **Structured Tokenized Filter Syntax** — Typed filter tokens (tier:WP,
 *   is:critical, float:<5d, dal:DAL_A, blocker:any, owner:j.smith) with
 *   auto-complete suggestions as the user types.
 *
 * - **Dual Visualization Modes** — Filter Mode (flattens to matching nodes
 *   + ancestors) and Dim/Context Mode (retains full hierarchy, dims non-matching
 *   rows to 25% opacity).
 *
 * - **Named View Presets** — Save and restore filter configurations with
 *   column state to PostgreSQL via UserDisplaySettings.
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    <FilterToolbar />
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Search,
  X,
  Filter,
  Eye,
  EyeOff,
  Save,
  Trash2,
  ChevronDown,
  Clock,
  Tag,
  SlidersHorizontal,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useScheduleStore } from '../../stores/useScheduleStore';
import { useFilterTokens } from '../../hooks/useFilterTokens';
import {
  FilterToken,
  FilterVisualizationMode,
  VIS_MODE_LABELS,
  TOKEN_KEY_LABELS,
  AutocompleteSuggestion,
} from '../../types/filter';

// ---------------------------------------------------------------------------
// Token Color Mapping
// ---------------------------------------------------------------------------

/** Color classes for different filter token keys */
const TOKEN_KEY_COLORS: Record<string, string> = {
  tier: 'bg-blue-900/40 text-blue-300 border-blue-700/50',
  is: 'bg-red-900/40 text-red-300 border-red-700/50',
  float: 'bg-amber-900/40 text-amber-300 border-amber-700/50',
  dal: 'bg-purple-900/40 text-purple-300 border-purple-700/50',
  blocker: 'bg-orange-900/40 text-orange-300 border-orange-700/50',
  owner: 'bg-green-900/40 text-green-300 border-green-700/50',
  mode: 'bg-cyan-900/40 text-cyan-300 border-cyan-700/50',
  classification: 'bg-rose-900/40 text-rose-300 border-rose-700/50',
  progress: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50',
};

// ---------------------------------------------------------------------------
// Token Chip Component
// ---------------------------------------------------------------------------

const TokenChip: React.FC<{
  token: FilterToken;
  onRemove: () => void;
}> = ({ token, onRemove }) => {
  const colorClass = TOKEN_KEY_COLORS[token.key] || 'bg-bg-ops-overlay text-text-ops-muted border-border-ops-subtle';

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded border transition-colors',
        colorClass,
        !token.isValid && 'opacity-50 border-dashed',
      )}
      title={`${TOKEN_KEY_LABELS[token.key] || token.key}: ${token.value}`}
    >
      <span className="font-semibold">{token.key}</span>
      <span>:</span>
      <span>{token.value}</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 hover:text-white transition-colors"
        aria-label={`Remove filter ${token.key}:${token.value}`}
      >
        <X size={10} />
      </button>
    </span>
  );
};

// ---------------------------------------------------------------------------
// Autocomplete Dropdown
// ---------------------------------------------------------------------------

const AutocompleteDropdown: React.FC<{
  suggestions: AutocompleteSuggestion[];
  selectedIndex: number;
  onSelect: (text: string) => void;
  onIndexChange: (index: number) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}> = ({ suggestions, selectedIndex, onSelect, onIndexChange, inputRef }) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    const el = dropdownRef.current?.children[selectedIndex] as HTMLElement;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div
      ref={dropdownRef}
      className="absolute z-50 top-full left-0 mt-1 w-80 bg-bg-ops-surface border border-border-ops-strong rounded-lg shadow-2xl overflow-hidden"
      role="listbox"
    >
      {suggestions.map((suggestion, index) => (
        <div
          key={index}
          role="option"
          aria-selected={index === selectedIndex}
          onClick={() => onSelect(suggestion.text)}
          onMouseEnter={() => onIndexChange(index)}
          className={clsx(
            'flex items-center justify-between px-3 py-2 cursor-pointer transition-colors',
            index === selectedIndex
              ? 'bg-bg-ops-overlay'
              : 'hover:bg-bg-ops-overlay/50',
          )}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {suggestion.isKey ? (
                <Tag size={12} className="text-text-ops-muted flex-shrink-0" />
              ) : (
                <Filter size={12} className="text-text-ops-muted flex-shrink-0" />
              )}
              <span className="text-sm font-mono text-text-ops-primary truncate">
                {suggestion.text}
              </span>
            </div>
            <span className="text-xs text-text-ops-muted ml-4 truncate">
              {suggestion.description}
            </span>
          </div>
          {suggestion.isKey && (
            <span className="text-xs text-text-ops-muted ml-2 flex-shrink-0">
              {suggestion.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Preset Dropdown
// ---------------------------------------------------------------------------

const PresetDropdown: React.FC<{
  presets: ReturnType<typeof useFilterTokens>['presets'];
  activePresetId: string | null;
  onApply: (id: string) => void;
  onDelete: (id: string) => void;
  onSaveClick: () => void;
  saveName: string;
  onSaveNameChange: (name: string) => void;
  onSaveKeyDown: (e: React.KeyboardEvent) => void;
  onSaveConfirm: () => void;
  onCancelSave: () => void;
  isSaving: boolean;
}> = ({
  presets,
  activePresetId,
  onApply,
  onDelete,
  onSaveClick,
  saveName,
  onSaveNameChange,
  onSaveKeyDown,
  onSaveConfirm,
  onCancelSave,
  isSaving,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded border transition-colors',
          activePresetId
            ? 'bg-blue-900/40 text-blue-300 border-blue-700/50'
            : 'bg-bg-ops-overlay text-text-ops-muted border-border-ops-subtle hover:text-text-ops-primary',
        )}
        title="Saved view presets"
      >
        <Clock size={12} />
        <span className="hidden sm:inline">Presets</span>
        {presets.length > 0 && (
          <span className="bg-bg-ops-base px-1.5 py-0.5 rounded text-xs">{presets.length}</span>
        )}
        <ChevronDown size={10} className={clsx(isOpen && 'rotate-180 transition-transform')} />
      </button>

      {isOpen && (
        <div className="absolute z-50 top-full right-0 mt-1 w-64 bg-bg-ops-surface border border-border-ops-strong rounded-lg shadow-2xl overflow-hidden">
          {/* Save new preset */}
          <div className="px-3 py-2 border-b border-border-ops-subtle">
            {isSaving ? (
              <div className="flex gap-1">
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => onSaveNameChange(e.target.value)}
                  onKeyDown={onSaveKeyDown}
                  placeholder="Preset name..."
                  className="flex-1 bg-bg-ops-overlay border border-border-ops-subtle rounded px-2 py-1 text-xs text-text-ops-primary placeholder-text-ops-muted focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <button
                  onClick={onSaveConfirm}
                  className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={onCancelSave}
                  className="px-2 py-1 bg-bg-ops-overlay text-text-ops-muted rounded text-xs transition-colors hover:text-text-ops-primary"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setIsOpen(true);
                  onSaveClick();
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay rounded transition-colors"
              >
                <Save size={12} />
                <span>Save Current View...</span>
              </button>
            )}
          </div>

          {/* Preset list */}
          <div className="max-h-48 overflow-y-auto">
            {presets.length === 0 && !isSaving && (
              <div className="px-3 py-4 text-xs text-text-ops-muted text-center">
                No saved presets
              </div>
            )}
            {presets.map((preset) => (
              <div
                key={preset.id}
                className={clsx(
                  'flex items-center gap-2 px-3 py-2 border-b border-border-ops-subtle/50 last:border-0',
                  preset.id === activePresetId && 'bg-blue-900/20',
                )}
              >
                <button
                  onClick={() => {
                    onApply(preset.id);
                    setIsOpen(false);
                  }}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="text-xs text-text-ops-primary truncate">{preset.name}</div>
                  <div className="text-xs text-text-ops-muted truncate">
                    {preset.tokenString || 'No filters'}
                  </div>
                </button>
                <button
                  onClick={() => onDelete(preset.id)}
                  className="p-1 text-text-ops-muted hover:text-rag-red transition-colors flex-shrink-0"
                  aria-label={`Delete preset ${preset.name}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Visualization Mode Toggle
// ---------------------------------------------------------------------------

const ModeToggle: React.FC<{
  mode: FilterVisualizationMode;
  onChange: (mode: FilterVisualizationMode) => void;
}> = ({ mode, onChange }) => {
  return (
    <div className="inline-flex items-center bg-bg-ops-overlay rounded border border-border-ops-subtle overflow-hidden">
      <button
        type="button"
        onClick={() => onChange('FILTER')}
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors',
          mode === 'FILTER'
            ? 'bg-blue-600 text-white'
            : 'text-text-ops-muted hover:text-text-ops-primary',
        )}
        title={VIS_MODE_LABELS.FILTER}
      >
        <Filter size={12} />
        <span className="hidden sm:inline">Filter</span>
      </button>
      <button
        type="button"
        onClick={() => onChange('DIM')}
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors',
          mode === 'DIM'
            ? 'bg-blue-600 text-white'
            : 'text-text-ops-muted hover:text-text-ops-primary',
        )}
        title={VIS_MODE_LABELS.DIM}
      >
        {mode === 'DIM' ? <EyeOff size={12} /> : <Eye size={12} />}
        <span className="hidden sm:inline">Dim</span>
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main FilterToolbar Component
// ---------------------------------------------------------------------------

interface FilterToolbarProps {
  /** Optional class for the container */
  className?: string;
}

const FilterToolbar: React.FC<FilterToolbarProps> = ({ className = '' }) => {
  const filter = useFilterTokens();
  const totalRows = useScheduleStore((s) => s.rows.length);
  const [inputValue, setInputValue] = useState('');
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveName, setSaveName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation for autocomplete
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!filter.isAutocompleteOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) =>
          Math.min(prev + 1, filter.suggestions.length - 1),
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const suggestion = filter.suggestions[selectedSuggestionIndex];
        if (suggestion) {
          applySuggestion(suggestion.text);
        }
      } else if (e.key === 'Escape') {
        filter.setAutocompleteInput('');
      }
    },
    [filter, selectedSuggestionIndex],
  );

  // Apply an autocomplete suggestion
  const applySuggestion = useCallback(
    (text: string) => {
      // Add the suggestion text to the token string
      const newTokenString = filter.tokenString
        ? `${filter.tokenString} ${text}`
        : text;
      filter.setTokenString(newTokenString);
      setInputValue('');
      filter.setAutocompleteInput('');
      setSelectedSuggestionIndex(0);
      inputRef.current?.focus();
    },
    [filter],
  );

  // Remove a token by its raw string
  const removeToken = useCallback(
    (raw: string) => {
      const tokens = filter.tokenString.split(/\s+/);
      const filtered = tokens.filter((t) => t !== raw).join(' ');
      filter.setTokenString(filtered);
    },
    [filter],
  );

  // Handle input change — extract the last partial token for autocomplete
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputValue(value);

      // Extract the last partial token for autocomplete
      const parts = value.trim().split(/\s+/);
      const lastPart = parts[parts.length - 1] || '';
      filter.setAutocompleteInput(lastPart);
      setSelectedSuggestionIndex(0);
    },
    [filter],
  );

  // Handle input blur — commit any partial text
  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      // Check if focus moved to the autocomplete dropdown
      const relatedTarget = e.relatedTarget as HTMLElement;
      if (relatedTarget && relatedTarget.closest('[role="listbox"]')) {
        return;
      }

      // Commit partial input as a token
      const trimmed = inputValue.trim();
      if (trimmed) {
        const newTokenString = filter.tokenString
          ? `${filter.tokenString} ${trimmed}`
          : trimmed;
        filter.setTokenString(newTokenString);
      }
      setInputValue('');
      filter.setAutocompleteInput('');
      setSelectedSuggestionIndex(0);
    },
    [inputValue, filter],
  );

  // Handle preset save
  const handleSavePreset = useCallback(() => {
    if (saveName.trim()) {
      filter.savePreset(saveName.trim());
      setSaveName('');
      setShowSaveInput(false);
    }
  }, [saveName, filter]);

  const handleSavePresetKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSavePreset();
      if (e.key === 'Escape') {
        setShowSaveInput(false);
        setSaveName('');
      }
    },
    [handleSavePreset],
  );

  // Active preset name
  const activePresetName = useMemo(() => {
    if (!filter.activePresetId) return null;
    return filter.presets.find((p) => p.id === filter.activePresetId)?.name;
  }, [filter.activePresetId, filter.presets]);

  return (
    <div
      ref={containerRef}
      className={clsx(
        'flex flex-col gap-2 px-3 py-2 bg-bg-ops-surface border-b border-border-ops-subtle',
        className,
      )}
    >
      {/* Top row: Input + Controls */}
      <div className="flex items-center gap-2">
        {/* Search input */}
        <div className="relative flex-1">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-ops-muted pointer-events-none"
            />
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              placeholder="Type filter tokens: tier:WP  is:critical  float:<5d  dal:DAL_A  blocker:any  owner:j.smith"
              className="w-full bg-bg-ops-overlay border border-border-ops-subtle rounded-lg pl-9 pr-4 py-2 text-sm text-text-ops-primary placeholder-text-ops-muted focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 font-mono"
            />
            {filter.tokenString && (
              <button
                type="button"
                onClick={filter.clearFilters}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-ops-muted hover:text-text-ops-primary transition-colors"
                aria-label="Clear all filters"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Autocomplete dropdown */}
          {filter.isAutocompleteOpen && filter.suggestions.length > 0 && (
            <AutocompleteDropdown
              suggestions={filter.suggestions}
              selectedIndex={selectedSuggestionIndex}
              onSelect={applySuggestion}
              onIndexChange={setSelectedSuggestionIndex}
              inputRef={inputRef}
            />
          )}
        </div>

        {/* Visualization mode toggle */}
        <ModeToggle
          mode={filter.visualizationMode}
          onChange={filter.setVisualizationMode}
        />

        {/* Preset dropdown */}
        <PresetDropdown
          presets={filter.presets}
          activePresetId={filter.activePresetId}
          onApply={filter.applyPreset}
          onDelete={filter.deletePreset}
          onSaveClick={() => setShowSaveInput(true)}
          saveName={saveName}
          onSaveNameChange={setSaveName}
          onSaveKeyDown={handleSavePresetKeyDown}
          onSaveConfirm={handleSavePreset}
          onCancelSave={() => {
            setShowSaveInput(false);
            setSaveName('');
          }}
          isSaving={showSaveInput}
        />
      </div>

      {/* Bottom row: Active tokens + Match count */}
      {filter.tokens.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {/* Active token chips */}
          <div className="flex items-center gap-1.5 flex-wrap flex-1">
            <SlidersHorizontal size={12} className="text-text-ops-muted flex-shrink-0" />
            {filter.tokens.map((token, index) => (
              <TokenChip
                key={`${token.raw}-${index}`}
                token={token}
                onRemove={() => removeToken(token.raw)}
              />
            ))}
          </div>

          {/* Match count */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {activePresetName && (
              <span className="text-xs text-blue-400 flex-shrink-0">
                Preset: {activePresetName}
              </span>
            )}
            <span className="text-xs text-text-ops-muted flex-shrink-0">
              {filter.matchCount} / {totalRows} matching
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default FilterToolbar;
