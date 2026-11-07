/**
 * Context Menu Provider — Global Right-Click Menu System
 *
 * Manages the global state for item- and context-dependent right-click menus
 * across all primary views (WBS Table, Gantt Chart, Dependencies, Cockpit,
 * Facility Timeline).
 *
 * Features
 * --------
 *
 * 1. Global Context State:
 *    - isOpen: Whether any context menu is currently visible.
 *    - position: { x, y } screen coordinates for menu placement.
 *    - targetType: Discriminator for the menu renderer to use.
 *    - targetPayload: Arbitrary data (node IDs, link metadata, etc.).
 *
 * 2. Viewport Clamping & Collision Detection:
 *    - Measures menu dimensions using a DOM ref.
 *    - Automatically flips leftward if x + menuWidth > window.innerWidth.
 *    - Automatically flips upward if y + menuHeight > window.innerHeight.
 *
 * 3. Dismissal Listeners:
 *    - Closes on left-click outside the menu.
 *    - Closes on window scroll, viewport resize, or pressing Escape.
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    // In AppShell or root layout:
 *    <ContextMenuProvider>
 *      <App />
 *    </ContextMenuProvider>
 *
 *    // In any component:
 *    const { openContextMenu } = useContextMenu();
 *
 *    <div
 *      onContextMenu={(e) => {
 *        e.preventDefault();
 *        openContextMenu(e, 'TASK', { nodeId: row.id });
 *      }}
 *    >
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Target type discriminator for the context menu renderer.
 */
export type ContextTargetType =
  | 'TASK'
  | 'CONTAINER'
  | 'DEPENDENCY_LINK'
  | 'TIMELINE_HEADER'
  | 'KANBAN_CARD'
  | 'CHAMBER'
  | 'SDRL';

/**
 * Position coordinates for menu placement.
 */
export interface ContextPosition {
  x: number;
  y: number;
}

/**
 * Context menu state.
 */
export interface ContextMenuState {
  /** Whether any context menu is currently open */
  isOpen: boolean;
  /** Screen position of the menu anchor */
  position: ContextPosition;
  /** Target type discriminator */
  targetType: ContextTargetType | null;
  /** Arbitrary payload data for the menu renderer */
  targetPayload: Record<string, unknown>;
  /** Adjusted position after viewport clamping */
  adjustedPosition: ContextPosition;
}

/**
 * Context menu provider interface.
 */
export interface ContextMenuContextValue extends ContextMenuState {
  /** Open a context menu at the given event coordinates */
  openContextMenu: (
    event: React.MouseEvent | MouseEvent,
    targetType: ContextTargetType,
    payload?: Record<string, unknown>,
  ) => void;
  /** Close the active context menu */
  closeContextMenu: () => void;
  /** Ref callback for the menu container to measure dimensions */
  menuRef: (node: HTMLDivElement | null) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Menu padding from viewport edge in pixels */
const VIEWPORT_PADDING = 8;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null);

/**
 * React context provider component.
 */
export const ContextMenuProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<ContextPosition>({ x: 0, y: 0 });
  const [adjustedPosition, setAdjustedPosition] = useState<ContextPosition>({
    x: 0,
    y: 0,
  });
  const [targetType, setTargetType] = useState<ContextTargetType | null>(null);
  const [targetPayload, setTargetPayload] = useState<Record<string, unknown>>(
    {},
  );

  const menuRefInner = useRef<HTMLDivElement | null>(null);

  /**
   * Clamp menu position to viewport bounds.
   * Uses the measured menu dimensions to flip leftward or upward.
   */
  const clampPosition = useCallback(
    (pos: ContextPosition) => {
      if (!menuRefInner.current) {
        setPosition(pos);
        setAdjustedPosition(pos);
        return;
      }

      const menuRect = menuRefInner.current.getBoundingClientRect();
      const menuWidth = menuRect.width || 220; // fallback width
      const menuHeight = menuRect.height || 200; // fallback height

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let x = pos.x;
      let y = pos.y;

      // Flip leftward if right edge exceeds viewport
      if (x + menuWidth > viewportWidth - VIEWPORT_PADDING) {
        x = viewportWidth - menuWidth - VIEWPORT_PADDING;
      }

      // Flip upward if bottom edge exceeds viewport
      if (y + menuHeight > viewportHeight - VIEWPORT_PADDING) {
        y = viewportHeight - menuHeight - VIEWPORT_PADDING;
      }

      // Ensure minimum position
      x = Math.max(VIEWPORT_PADDING, x);
      y = Math.max(VIEWPORT_PADDING, y);

      setPosition(pos);
      setAdjustedPosition({ x, y });
    },
    [],
  );

  /**
   * Open a context menu at the given event coordinates.
   */
  const openContextMenu = useCallback(
    (
      event: React.MouseEvent | MouseEvent,
      targetType: ContextTargetType,
      payload: Record<string, unknown> = {},
    ) => {
      event.preventDefault();

      const clientX = 'clientX' in event ? event.clientX : 0;
      const clientY = 'clientY' in event ? event.clientY : 0;

      setTargetType(targetType);
      setTargetPayload(payload);
      setIsOpen(true);

      // Initial position; will be clamped on next render
      const pos = { x: clientX, y: clientY };
      setPosition(pos);
      setAdjustedPosition(pos);
    },
    [],
  );

  /**
   * Close the active context menu.
   */
  const closeContextMenu = useCallback(() => {
    setIsOpen(false);
    setTargetType(null);
    setTargetPayload({});
  }, []);

  /**
   * Ref callback for the menu container.
   * After the menu is mounted, re-clamp the position.
   */
  const menuRef = useCallback(
    (node: HTMLDivElement | null) => {
      menuRefInner.current = node;

      if (node && isOpen) {
        // Re-measure and clamp after mount
        requestAnimationFrame(() => {
          clampPosition(adjustedPosition);
        });
      }
    },
    [isOpen, adjustedPosition, clampPosition],
  );

  // -----------------------------------------------------------------------
  // Dismissal Listeners
  // -----------------------------------------------------------------------

  /** Close on left-click outside the menu */
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      // Only close on left-click (button 0)
      if (e.button !== 0) return;

      // Don't close if clicking inside the menu
      if (menuRefInner.current && menuRefInner.current.contains(e.target as Node)) {
        return;
      }

      closeContextMenu();
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, closeContextMenu]);

  /** Close on Escape key */
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeContextMenu();
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, closeContextMenu]);

  /** Close on window scroll */
  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = () => closeContextMenu();

    window.addEventListener('scroll', handleScroll, { capture: true });
    return () =>
      window.removeEventListener('scroll', handleScroll, { capture: true });
  }, [isOpen, closeContextMenu]);

  /** Close on viewport resize */
  useEffect(() => {
    if (!isOpen) return;

    const handleResize = () => closeContextMenu();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen, closeContextMenu]);

  // -----------------------------------------------------------------------
  // Context Value
  // -----------------------------------------------------------------------

  const contextValue = useMemo<ContextMenuContextValue>(
    () => ({
      isOpen,
      position,
      adjustedPosition,
      targetType,
      targetPayload,
      openContextMenu,
      closeContextMenu,
      menuRef,
    }),
    [
      isOpen,
      position,
      adjustedPosition,
      targetType,
      targetPayload,
      openContextMenu,
      closeContextMenu,
      menuRef,
    ],
  );

  return (
    <ContextMenuContext.Provider value={contextValue}>
      {children}
    </ContextMenuContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook to access the global context menu state and actions.
 *
 * Must be used within a ContextMenuProvider.
 *
 * @returns Context menu state and actions
 * @throws Error if used outside ContextMenuProvider
 */
export function useContextMenu(): ContextMenuContextValue {
  const context = useContext(ContextMenuContext);

  if (context === null) {
    throw new Error(
      'useContextMenu must be used within a ContextMenuProvider',
    );
  }

  return context;
}

export default ContextMenuProvider;
