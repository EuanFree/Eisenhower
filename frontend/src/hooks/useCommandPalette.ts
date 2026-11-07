/**
 * Command Palette Hook
 *
 * Global keyboard listener and state management for the Command Palette.
 * Listens for Ctrl+K (or Cmd+K on macOS) to toggle the palette open/closed.
 *
 * The command palette provides fast, keyboard-driven navigation across the
 * entire application: searching entities (tasks, CDRLs, equipment, users),
 * executing direct actions (freeze baseline, run CPM, export reports),
 * and jumping to recently viewed work packages.
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    const { isOpen, openPalette, closePalette, togglePalette } = useCommandPalette();
 *
 *    return (
 *      <>
 *        <CommandPalette isOpen={isOpen} onClose={closePalette} />
 *      </>
 *    );
 */

import { useState, useCallback, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A searchable entity result (task, CDRL, equipment, user, etc.) */
export interface CommandEntity {
  /** Unique identifier for the entity */
  id: string;
  /** Display label (e.g., task code "WP-2104") */
  label: string;
  /** Entity type for icon and category grouping */
  type: 'TASK' | 'CDRL' | 'EQUIPMENT' | 'USER' | 'LOCATION' | 'LICENSE' | 'DELEGATION' | 'BATCH';
  /** Subtitle or description (e.g., "Radar Integration WP") */
  subtitle?: string;
  /** ltree path for navigation context */
  path?: string;
}

/** A direct action command (e.g., "Freeze Baseline", "Run Monte Carlo") */
export interface CommandAction {
  /** Unique action identifier */
  id: string;
  /** Display label prefixed with ">" */
  label: string;
  /** Short description of what the action does */
  description: string;
  /** Category for grouping (e.g., "Schedule", "Reporting", "Display") */
  category: string;
  /** Callback executed when the action is selected */
  execute: () => void | Promise<void>;
}

/** A recently viewed work package or search filter */
export interface CommandHistory {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Timestamp of last view */
  viewedAt: number;
  /** Entity type */
  type: 'TASK' | 'CDRL' | 'EQUIPMENT' | 'USER' | 'LOCATION' | 'LICENSE' | 'DELEGATION' | 'BATCH';
  /** Navigation target (node ID or view name) */
  target: string;
}

/** Unified result type for the search list */
export type CommandResult =
  | { kind: 'entity'; data: CommandEntity }
  | { kind: 'action'; data: CommandAction }
  | { kind: 'history'; data: CommandHistory };

// ---------------------------------------------------------------------------
// Lightweight Fuzzy Matching
// ---------------------------------------------------------------------------

/**
 * Compute a fuzzy match score between a query and a target string.
 *
 * Uses a simple character-sequence algorithm: walks through the target
 * string looking for characters in the query in order.  Bonus points
 * are awarded for consecutive matches (word boundaries) and for matches
 * at the start of the string.
 *
 * @param query - The search query (lowercased)
 * @param target - The string to search within (lowercased)
 * @returns A score between 0 (no match) and 1 (exact match)
 */
function fuzzyScore(query: string, target: string): number {
  if (!query) return 0.5;
  if (target === query) return 1.0;

  let score = 0;
  let queryIdx = 0;
  let consecutive = 0;
  let lastMatchIdx = -2;

  for (let i = 0; i < target.length && queryIdx < query.length; i++) {
    if (target[i] === query[queryIdx]) {
      // Bonus for consecutive characters
      if (i === lastMatchIdx + 1) {
        consecutive++;
        score += 3 + consecutive;
      } else {
        consecutive = 0;
        // Bonus for matching at word boundaries
        if (i === 0 || target[i - 1] === ' ' || target[i - 1] === '-' || target[i - 1] === '_') {
          score += 4;
        } else {
          score += 1;
        }
      }
      lastMatchIdx = i;
      queryIdx++;
    }
  }

  if (queryIdx < query.length) return 0; // Not all query chars matched

  // Normalize: higher score for shorter targets with full matches
  const normalized = Math.min(1.0, score / (query.length * 2));
  // Bonus for starting with the query
  if (target.startsWith(query)) return 1.0;
  return normalized;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseCommandPaletteReturn {
  /** Whether the palette is currently open */
  isOpen: boolean;
  /** Open the palette */
  openPalette: () => void;
  /** Close the palette */
  closePalette: () => void;
  /** Toggle the palette open/closed */
  togglePalette: () => void;
  /** Current search query */
  query: string;
  /** Set the search query */
  setQuery: (q: string) => void;
  /** Currently highlighted result index */
  highlightedIndex: number;
  /** Set the highlighted index */
  setHighlightedIndex: (i: number) => void;
  /** Registered entities for search */
  entities: CommandEntity[];
  /** Register entities for search */
  registerEntities: (entities: CommandEntity[]) => void;
  /** Registered actions */
  actions: CommandAction[];
  /** Register an action */
  registerAction: (action: CommandAction) => void;
  /** Recent history entries */
  history: CommandHistory[];
  /** Add an entry to recent history */
  addToHistory: (entry: Omit<CommandHistory, 'id' | 'viewedAt'>) => void;
  /** Filtered results based on current query */
  results: CommandResult[];
  /** Execute the currently highlighted result */
  executeHighlighted: () => void;
}

/**
 * React hook for global command palette state and keyboard handling.
 *
 * Listens for Ctrl+K / Cmd+K to toggle the palette.  Manages the search
 * query, highlighted result index, and entity/action registration.
 *
 * @returns Command palette state and actions
 */
export function useCommandPalette(): UseCommandPaletteReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [entities, setEntities] = useState<CommandEntity[]>([]);
  const [actions, setActions] = useState<CommandAction[]>([]);
  const [history, setHistory] = useState<CommandHistory[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPalette = useCallback(() => {
    setIsOpen(true);
    setQuery('');
    setHighlightedIndex(0);
    // Focus the input after render
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const closePalette = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setHighlightedIndex(0);
  }, []);

  const togglePalette = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const registerEntities = useCallback((newEntities: CommandEntity[]) => {
    setEntities(newEntities);
  }, []);

  const registerAction = useCallback((action: CommandAction) => {
    setActions((prev) => [...prev, action]);
  }, []);

  const addToHistory = useCallback((entry: Omit<CommandHistory, 'id' | 'viewedAt'>) => {
    setHistory((prev) => {
      // Remove existing entry with same target
      const filtered = prev.filter((h) => h.target !== entry.target);
      // Add new entry at the front
      const updated = [
        { ...entry, id: `${entry.target}-${Date.now()}`, viewedAt: Date.now() },
        ...filtered,
      ].slice(0, 10); // Keep top 10
      return updated;
    });
  }, []);

  // Global keyboard listener for Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlK = (e.ctrlKey || e.metaKey) && e.key === 'k';
      if (isCtrlK) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filtered results based on current query
  const results: CommandResult[] = (() => {
    const q = query.toLowerCase().trim();

    if (!q) {
      // Show recent history and popular actions when no query
      const historyResults: CommandResult[] = history.slice(0, 5).map((h) => ({
        kind: 'history' as const,
        data: h,
      }));
      const actionResults: CommandResult[] = actions.slice(0, 5).map((a) => ({
        kind: 'action' as const,
        data: a,
      }));
      return [...historyResults, ...actionResults];
    }

    const results: CommandResult[] = [];

    // Search entities
    for (const entity of entities) {
      const searchText = `${entity.label} ${entity.subtitle || ''}`.toLowerCase();
      const score = fuzzyScore(q, searchText);
      if (score > 0) {
        results.push({ kind: 'entity', data: { ...entity, _score: score } as CommandEntity });
      }
    }

    // Search actions
    for (const action of actions) {
      const searchText = `${action.label} ${action.description} ${action.category}`.toLowerCase();
      const score = fuzzyScore(q, searchText);
      if (score > 0) {
        results.push({ kind: 'action', data: { ...action, _score: score } as CommandAction });
      }
    }

    // Search history
    for (const h of history) {
      const searchText = `${h.label}`.toLowerCase();
      const score = fuzzyScore(q, searchText);
      if (score > 0) {
        results.push({ kind: 'history', data: { ...h, _score: score } as CommandHistory });
      }
    }

    // Sort by score descending
    results.sort((a, b) => {
      const scoreA =
        'data' in a && '_score' in a.data ? (a.data as any)._score ?? 0 : 0;
      const scoreB =
        'data' in b && '_score' in b.data ? (b.data as any)._score ?? 0 : 0;
      return scoreB - scoreA;
    });

    return results.slice(0, 20); // Limit to 20 results
  })();

  const executeHighlighted = useCallback(() => {
    const result = results[highlightedIndex];
    if (!result) return;

    if (result.kind === 'action') {
      result.data.execute();
      closePalette();
    } else if (result.kind === 'entity' || result.kind === 'history') {
      // Navigation handled by caller
      closePalette();
    }
  }, [results, highlightedIndex, closePalette]);

  return {
    isOpen,
    openPalette,
    closePalette,
    togglePalette,
    query,
    setQuery,
    highlightedIndex,
    setHighlightedIndex,
    entities,
    registerEntities,
    actions,
    registerAction,
    history,
    addToHistory,
    results,
    executeHighlighted,
  };
}
