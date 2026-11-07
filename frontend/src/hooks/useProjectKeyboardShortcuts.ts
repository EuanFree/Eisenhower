/**
 * Project Keyboard Shortcuts Hook
 *
 * Global keyboard shortcut manager emulating Microsoft Project bindings
 * with defence-grade extensions.
 *
 * Mounts a single `keydown` listener on `window` and dispatches to the
 * appropriate store action or callback based on the key combination.
 * Input/textarea/textarea focus is respected: shortcuts are bypassed when
 * the user is typing in an editable field, except for Enter, Escape, and
 * Tab which are allowed to propagate to inline edit cells.
 *
 * Key Binding Categories
 * ----------------------
 *
 * 1. **Hierarchy** (MS Project Standard):
 *    - Alt+Shift+Right: Indent selected tasks (reparent under previous sibling)
 *    - Alt+Shift+Left: Outdent selected tasks (promote to parent's level)
 *    - Insert: Insert task above selected node
 *    - Delete: Delete selected nodes (pushed to undo store)
 *
 * 2. **Precedence Logic** (MS Project Standard):
 *    - Ctrl+F2: Create sequential FS links across selected tasks
 *    - Ctrl+Shift+F2: Remove dependencies between selected tasks
 *    - Shift+F2: Focus and open lower split-pane drill-down workbench
 *
 * 3. **Navigation & Canvas**:
 *    - Ctrl+Shift+F5: Center Gantt viewport on earliest selected task date
 *    - Ctrl++ / Ctrl+-: Zoom timeline scale in and out
 *    - Ctrl+Shift+F: Scale timeline to fit entire project duration
 *    - Ctrl+Right / Ctrl+Left: Expand or collapse active parent summary node
 *
 * 4. **Defence Extensions**:
 *    - Ctrl+K: Open global Omni Command Palette
 *    - Ctrl+Z / Ctrl+Y: Undo / Redo (200+ step history)
 *    - Ctrl+B: Open rapid Blocker modal on selected task
 *    - Ctrl+T: Open inline micro-timesheet logger
 *    - Ctrl+J: Toggle lower workbench split-pane drawer
 *    - Ctrl+Shift+D: Cycle display density (Ultra-Dense → Balanced → Comfort)
 *    - Ctrl+Shift+M: Toggle filter mode (Filter ↔ Dim)
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    // In AppShell or root layout:
 *    useProjectKeyboardShortcuts({
 *      onIndent: () => { // ... },
 *      onOutdent: () => { // ... },
 *      onDelete: () => { // ... },
 *      // ... other callbacks ...
 *    });
 */

import { useEffect, useCallback, useRef } from 'react';
import { useDisplayStore, type Density } from '../stores/useDisplayStore';
import { useScheduleStore } from '../stores/useScheduleStore';
import { useHistoryStore } from '../stores/useHistoryStore';
import { useCommandPalette } from '../hooks/useCommandPalette';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Optional callback overrides for keyboard shortcut actions.
 * Each callback is called with the relevant payload when the shortcut
 * is triggered. If a callback is not provided, the default action
 * (e.g., store mutation) is executed.
 */
export interface KeyboardShortcutCallbacks {
  /** Called when Alt+Shift+Right is pressed (indent selected tasks) */
  onIndent?: () => void;
  /** Called when Alt+Shift+Left is pressed (outdent selected tasks) */
  onOutdent?: () => void;
  /** Called when Insert is pressed (insert task above) */
  onInsertTaskAbove?: () => void;
  /** Called when Delete is pressed (delete selected nodes) */
  onDelete?: () => void;
  /** Called when Ctrl+F2 is pressed (link selected tasks) */
  onLinkSelected?: () => void;
  /** Called when Ctrl+Shift+F2 is pressed (unlink selected tasks) */
  onUnlinkSelected?: () => void;
  /** Called when Shift+F2 is pressed (open drill-down workbench) */
  onOpenWorkbench?: () => void;
  /** Called when Ctrl+Shift+F5 is pressed (center Gantt on selected) */
  onCenterGantt?: () => void;
  /** Called when Ctrl++ is pressed (zoom in) */
  onZoomIn?: () => void;
  /** Called when Ctrl+- is pressed (zoom out) */
  onZoomOut?: () => void;
  /** Called when Ctrl+Shift+F is pressed (zoom to fit) */
  onZoomToFit?: () => void;
  /** Called when Ctrl+Right is pressed (expand parent) */
  onExpandParent?: () => void;
  /** Called when Ctrl+Left is pressed (collapse parent) */
  onCollapseParent?: () => void;
  /** Called when Ctrl+B is pressed (flag blocker) */
  onFlagBlocker?: () => void;
  /** Called when Ctrl+T is pressed (log hours) */
  onLogHours?: () => void;
  /** Called when Ctrl+J is pressed (toggle workbench) */
  onToggleWorkbench?: () => void;
}

// ---------------------------------------------------------------------------
// Density Cycling
// ---------------------------------------------------------------------------

/** Ordered density levels for cycling */
const DENSITY_ORDER: Density[] = ['ULTRA_DENSE', 'BALANCED', 'COMFORT'];

/**
 * Cycle to the next density level in the display store.
 */
function cycleDensity() {
  const { settings, updateDisplaySettings } = useDisplayStore.getState();
  const currentIndex = DENSITY_ORDER.indexOf(settings.density);
  const nextIndex = (currentIndex + 1) % DENSITY_ORDER.length;
  updateDisplaySettings({ density: DENSITY_ORDER[nextIndex] });
}

// ---------------------------------------------------------------------------
// Input Focus Detection
// ---------------------------------------------------------------------------

/**
 * Check whether the currently focused element is an input, textarea, or
 * contenteditable element. Shortcuts are bypassed for these elements
 * unless the key is Enter, Escape, or Tab.
 */
function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;

  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  if (el.getAttribute('contenteditable') !== null) return true;
  return false;
}

/**
 * Check whether the key is allowed to propagate to input elements.
 * Enter, Escape, and Tab are always allowed.
 */
function isInputPassthroughKey(key: string): boolean {
  return key === 'Enter' || key === 'Escape' || key === 'Tab';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * React hook that mounts a global `keydown` listener on `window`.
 *
 * @param callbacks - Optional callback overrides for shortcut actions
 */
export function useProjectKeyboardShortcuts(
  callbacks: KeyboardShortcutCallbacks = {},
) {
  const {
    onIndent,
    onOutdent,
    onInsertTaskAbove,
    onDelete,
    onLinkSelected,
    onUnlinkSelected,
    onOpenWorkbench,
    onCenterGantt,
    onZoomIn,
    onZoomOut,
    onZoomToFit,
    onExpandParent,
    onCollapseParent,
    onFlagBlocker,
    onLogHours,
    onToggleWorkbench,
  } = callbacks;

  const { undo, redo, canUndo, canRedo } = useHistoryStore();
  const { toggleExpand, selectedNodeId, selectedNodeIds, setFilterState, filterMode } = useScheduleStore();
  const { openPalette, closePalette, isOpen: paletteOpen } = useCommandPalette();
  const callbacksRef = useRef(callbacks);

  // Keep callbacks ref up to date without re-binding the listener
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  /**
   * Handle a keyboard shortcut event.
   * Returns true if the shortcut was consumed (preventDefault called).
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const { ctrlKey, shiftKey, altKey, key, code } = e;

      // Bypass input/textarea focus unless the key is a passthrough
      if (isInputFocused() && !isInputPassthroughKey(key)) {
        return;
      }

      let consumed = false;

      // ------------------------------------------------------------------
      // Defence Extensions
      // ------------------------------------------------------------------

      // Ctrl+K / Cmd+K: Toggle Command Palette
      if (ctrlKey && key === 'k' && !shiftKey && !altKey) {
        e.preventDefault();
        if (paletteOpen) {
          closePalette();
        } else {
          openPalette();
        }
        consumed = true;
      }

      // Ctrl+Z: Undo
      if (ctrlKey && key === 'z' && !shiftKey && !altKey) {
        if (canUndo) {
          e.preventDefault();
          undo();
          consumed = true;
        }
      }

      // Ctrl+Y: Redo
      if (ctrlKey && key === 'y' && !shiftKey && !altKey) {
        if (canRedo) {
          e.preventDefault();
          redo();
          consumed = true;
        }
      }

      // Ctrl+Shift+D: Cycle display density
      if (ctrlKey && shiftKey && key === 'd' && !altKey) {
        e.preventDefault();
        cycleDensity();
        consumed = true;
      }

      // Ctrl+Shift+M: Toggle filter mode (Filter ↔ Dim)
      if (ctrlKey && shiftKey && key === 'm' && !altKey) {
        e.preventDefault();
        const newMode = filterMode === 'FILTER' ? 'DIM' : 'FILTER';
        setFilterState({ filterMode: newMode, matchingNodeIds: new Set(), visibleNodeIds: new Set() });
        consumed = true;
      }

      // Ctrl+B: Flag Blocker on selected task
      if (ctrlKey && key === 'b' && !shiftKey && !altKey) {
        if (selectedNodeId) {
          e.preventDefault();
          callbacksRef.current.onFlagBlocker?.();
          consumed = true;
        }
      }

      // Ctrl+T: Log hours (inline micro-timesheet)
      if (ctrlKey && key === 't' && !shiftKey && !altKey) {
        if (selectedNodeId) {
          e.preventDefault();
          callbacksRef.current.onLogHours?.();
          consumed = true;
        }
      }

      // Ctrl+J: Toggle lower workbench split-pane
      if (ctrlKey && key === 'j' && !shiftKey && !altKey) {
        e.preventDefault();
        callbacksRef.current.onToggleWorkbench?.();
        consumed = true;
      }

      // ------------------------------------------------------------------
      // Hierarchy (MS Project Standard)
      // ------------------------------------------------------------------

      // Alt+Shift+Right: Indent selected tasks
      if (altKey && shiftKey && key === 'ArrowRight' && !ctrlKey) {
        e.preventDefault();
        callbacksRef.current.onIndent?.();
        consumed = true;
      }

      // Alt+Shift+Left: Outdent selected tasks
      if (altKey && shiftKey && key === 'ArrowLeft' && !ctrlKey) {
        e.preventDefault();
        callbacksRef.current.onOutdent?.();
        consumed = true;
      }

      // Insert: Insert task above selected node
      if (key === 'Insert' && !ctrlKey && !shiftKey && !altKey) {
        e.preventDefault();
        callbacksRef.current.onInsertTaskAbove?.();
        consumed = true;
      }

      // Delete: Delete selected nodes
      if (key === 'Delete' && !ctrlKey && !shiftKey && !altKey) {
        // Only consume if a node is selected to avoid interfering with
        // text deletion in inputs
        if (selectedNodeId || selectedNodeIds.size > 0) {
          e.preventDefault();
          callbacksRef.current.onDelete?.();
          consumed = true;
        }
      }

      // ------------------------------------------------------------------
      // Precedence Logic (MS Project Standard)
      // ------------------------------------------------------------------

      // Ctrl+F2: Link selected tasks (sequential FS)
      if (ctrlKey && key === 'F2' && !shiftKey && !altKey) {
        e.preventDefault();
        callbacksRef.current.onLinkSelected?.();
        consumed = true;
      }

      // Ctrl+Shift+F2: Unlink selected tasks
      if (ctrlKey && shiftKey && key === 'F2' && !altKey) {
        e.preventDefault();
        callbacksRef.current.onUnlinkSelected?.();
        consumed = true;
      }

      // Shift+F2: Open drill-down workbench
      if (shiftKey && key === 'F2' && !ctrlKey && !altKey) {
        e.preventDefault();
        callbacksRef.current.onOpenWorkbench?.();
        consumed = true;
      }

      // ------------------------------------------------------------------
      // Navigation & Canvas
      // ------------------------------------------------------------------

      // Ctrl+Shift+F5: Center Gantt on earliest selected task date
      if (ctrlKey && shiftKey && key === 'F5' && !altKey) {
        e.preventDefault();
        callbacksRef.current.onCenterGantt?.();
        consumed = true;
      }

      // Ctrl++ / Ctrl+=: Zoom in
      if (ctrlKey && (key === '=' || key === '+') && !shiftKey && !altKey) {
        e.preventDefault();
        callbacksRef.current.onZoomIn?.();
        consumed = true;
      }

      // Ctrl+-: Zoom out
      if (ctrlKey && key === '-' && !shiftKey && !altKey) {
        e.preventDefault();
        callbacksRef.current.onZoomOut?.();
        consumed = true;
      }

      // Ctrl+Shift+F: Zoom to fit entire project
      if (ctrlKey && shiftKey && key === 'f' && !altKey) {
        e.preventDefault();
        callbacksRef.current.onZoomToFit?.();
        consumed = true;
      }

      // Ctrl+Right: Expand active parent summary node
      if (ctrlKey && key === 'ArrowRight' && !shiftKey && !altKey) {
        if (selectedNodeId) {
          e.preventDefault();
          toggleExpand(selectedNodeId);
          consumed = true;
        }
      }

      // Ctrl+Left: Collapse active parent summary node
      if (ctrlKey && key === 'ArrowLeft' && !shiftKey && !altKey) {
        if (selectedNodeId) {
          e.preventDefault();
          toggleExpand(selectedNodeId);
          consumed = true;
        }
      }

      return consumed;
    },
    [
      canUndo,
      canRedo,
      undo,
      redo,
      toggleExpand,
      selectedNodeId,
      selectedNodeIds,
      filterMode,
      setFilterState,
      openPalette,
      closePalette,
      paletteOpen,
    ],
  );

  // -----------------------------------------------------------------------
  // Mount / Unmount
  // -----------------------------------------------------------------------

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return {
    /** Whether undo is available */
    canUndo,
    /** Whether redo is available */
    canRedo,
  };
}

export default useProjectKeyboardShortcuts;
