/**
 * Command Palette Component
 *
 * High-density military dark theme command palette for fast, keyboard-driven
 * navigation across the entire application.
 *
 * Features
 * --------
 *
 * - **Fuzzy Search** — Searches across task codes, CDRL references, equipment
 *   serials, user names, and direct actions.
 *
 * - **Direct Actions** — Commands prefixed with ">" for quick execution:
 *   freeze baseline, run CPM, export reports, switch density.
 *
 * - **Recent History** — Top 5 recently viewed work packages and search filters.
 *
 * - **Keyboard Navigation** — Up/Down arrows to highlight, Enter to execute,
 *   Esc to dismiss.
 *
 * - **Global Shortcut** — Opens on Ctrl+K (or Cmd+K on macOS).
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    const { isOpen, closePalette, ... } = useCommandPalette();
 *
 *    return (
 *      <CommandPalette
 *        isOpen={isOpen}
 *        onClose={closePalette}
 *        onSelectEntity={(entity) => navigateToEntity(entity)}
 *        onSelectHistory={(entry) => navigateToHistory(entry)}
 *      />
 *    );
 */

import React, { useEffect, useRef, useMemo } from 'react';
import {
  Search,
  X,
  ChevronRight,
  FileText,
  Package,
  Wrench,
  User,
  MapPin,
  Clock,
  Zap,
  LayoutGrid,
  BarChart3,
  FileSpreadsheet,
  Settings,
  GitMerge,
  Shield,
  Thermometer,
  Key,
  UserCheck,
  AlertTriangle,
} from 'lucide-react';
import { clsx } from 'clsx';
import type {
  CommandEntity,
  CommandAction,
  CommandHistory,
  CommandResult,
} from '../../hooks/useCommandPalette';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommandPaletteProps {
  /** Whether the palette is currently open */
  isOpen: boolean;
  /** Close the palette */
  onClose: () => void;
  /** Current search query */
  query: string;
  /** Set the search query */
  setQuery: (q: string) => void;
  /** Currently highlighted result index */
  highlightedIndex: number;
  /** Set the highlighted index */
  setHighlightedIndex: (i: number) => void;
  /** Filtered results */
  results: CommandResult[];
  /** Execute the highlighted result */
  executeHighlighted: () => void;
  /** Callback when an entity is selected */
  onSelectEntity?: (entity: CommandEntity) => void;
  /** Callback when a history entry is selected */
  onSelectHistory?: (entry: CommandHistory) => void;
}

// ---------------------------------------------------------------------------
// Icon Mapping
// ---------------------------------------------------------------------------

const entityIconMap: Record<string, React.ElementType> = {
  TASK: LayoutGrid,
  CDRL: FileText,
  EQUIPMENT: Wrench,
  USER: User,
  LOCATION: MapPin,
  LICENSE: Key,
  DELEGATION: UserCheck,
  BATCH: AlertTriangle,
};

const actionCategoryIconMap: Record<string, React.ElementType> = {
  Schedule: Zap,
  Reporting: FileSpreadsheet,
  Display: Settings,
  Analysis: BarChart3,
  Sync: GitMerge,
  Security: Shield,
  Facilities: Thermometer,
};

// ---------------------------------------------------------------------------
// Result Row Component
// ---------------------------------------------------------------------------

const ResultRow: React.FC<{
  result: CommandResult;
  isHighlighted: boolean;
  onClick: () => void;
}> = ({ result, isHighlighted, onClick }) => {
  const Icon = useMemo(() => {
    if (result.kind === 'entity') {
      const IconComp = entityIconMap[result.data.type] || FileText;
      return IconComp;
    }
    if (result.kind === 'action') {
      const IconComp = actionCategoryIconMap[result.data.category] || Zap;
      return IconComp;
    }
    if (result.kind === 'history') {
      return Clock;
    }
    return FileText;
  }, [result]);

  const label =
    result.kind === 'action'
      ? `> ${result.data.label}`
      : result.kind === 'entity'
        ? result.data.label
        : result.data.label;

  const subtitle =
    result.kind === 'entity'
      ? result.data.subtitle || result.data.type
      : result.kind === 'action'
        ? result.data.description
        : `Viewed recently`;

  return (
    <div
      role="option"
      aria-selected={isHighlighted}
      onClick={onClick}
      className={clsx(
        'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
        isHighlighted
          ? 'bg-bg-ops-overlay text-text-ops-primary'
          : 'text-text-ops-muted hover:bg-bg-ops-overlay/50',
      )}
    >
      <Icon
        className={clsx(
          'w-4 h-4 flex-shrink-0',
          result.kind === 'action' && 'text-amber-400',
          result.kind === 'history' && 'text-sky-400',
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{label}</span>
          {result.kind === 'entity' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-ops-overlay text-text-ops-muted flex-shrink-0">
              {result.data.type}
            </span>
          )}
          {result.kind === 'action' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-400 flex-shrink-0">
              {result.data.category}
            </span>
          )}
        </div>
        <p className="text-xs text-text-ops-muted truncate">{subtitle}</p>
      </div>
      {isHighlighted && (
        <ChevronRight className="w-4 h-4 text-text-ops-muted flex-shrink-0" />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * Command Palette overlay component.
 *
 * Renders a fixed-position search panel with fuzzy-matched results.
 * Supports keyboard navigation (Up/Down/Enter/Esc) and click selection.
 *
 * @param props - Command palette props
 */
const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  query,
  setQuery,
  highlightedIndex,
  setHighlightedIndex,
  results,
  executeHighlighted,
  onSelectEntity,
  onSelectHistory,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex(
            highlightedIndex < results.length - 1 ? highlightedIndex + 1 : 0,
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex(
            highlightedIndex > 0 ? highlightedIndex - 1 : results.length - 1,
          );
          break;
        case 'Enter':
          e.preventDefault();
          handleSelect(results[highlightedIndex]);
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, highlightedIndex, onClose, setHighlightedIndex]);

  const handleSelect = (result: CommandResult | undefined) => {
    if (!result) return;

    if (result.kind === 'action') {
      executeHighlighted();
    } else if (result.kind === 'entity') {
      onSelectEntity?.(result.data);
      onClose();
    } else if (result.kind === 'history') {
      onSelectHistory?.(result.data);
      onClose();
    }
  };

  // Group results by kind for section headers
  const groupedResults = useMemo(() => {
    const groups: {
      label: string;
      items: CommandResult[];
    }[] = [];
    let currentLabel = '';

    for (const result of results) {
      let label = '';
      if (result.kind === 'entity') label = 'Entities';
      else if (result.kind === 'action') label = 'Actions';
      else label = 'Recent';

      if (label !== currentLabel) {
        groups.push({ label, items: [result] });
        currentLabel = label;
      } else {
        groups[groups.length - 1].items.push(result);
      }
    }

    return groups;
  }, [results]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="relative w-full max-w-xl bg-bg-ops-surface border border-border-ops-strong shadow-2xl rounded-lg overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 border-b border-border-ops-subtle">
          <Search className="w-5 h-5 text-text-ops-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightedIndex(0);
            }}
            placeholder="Search tasks, CDRLs, licenses, delegations, batches, or type > for actions..."
            className="flex-1 py-4 bg-transparent text-text-ops-primary text-sm placeholder:text-text-ops-muted outline-none"
            autoFocus
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-bg-ops-overlay text-text-ops-muted border border-border-ops-subtle">
            ESC
          </kbd>
          <button
            type="button"
            onClick={onClose}
            className="text-text-ops-muted hover:text-text-ops-primary transition-colors"
            aria-label="Close command palette"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div
          className="max-h-[60vh] overflow-y-auto"
          role="listbox"
          aria-label="Search results"
        >
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-text-ops-muted text-sm">
              {query ? 'No results found' : 'Start typing to search...'}
            </div>
          ) : (
            groupedResults.map((group) => (
              <div key={group.label}>
                <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-ops-muted bg-bg-ops-overlay/30">
                  {group.label}
                </div>
                {group.items.map((result, idx) => {
                  // Calculate global index
                  let globalIdx = 0;
                  for (const g of groupedResults) {
                    for (let i = 0; i < g.items.length; i++) {
                      if (g === group && i === idx) break;
                      globalIdx++;
                    }
                  }

                  return (
                    <ResultRow
                      key={`${result.kind}-${idx}`}
                      result={result}
                      isHighlighted={globalIdx === highlightedIndex}
                      onClick={() => handleSelect(result)}
                    />
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border-ops-subtle text-[10px] text-text-ops-muted">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1 py-0.5 rounded bg-bg-ops-overlay border border-border-ops-subtle mr-1">
                ↑↓
              </kbd>
              Navigate
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-bg-ops-overlay border border-border-ops-subtle mr-1">
                ↵
              </kbd>
              Select
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-bg-ops-overlay border border-border-ops-subtle mr-1">
                ⎋
              </kbd>
              Close
            </span>
          </div>
          <span>{results.length} results</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
