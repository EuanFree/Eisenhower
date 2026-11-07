/**
 * Hover Inspector Custom Hook
 *
 * Provides a dwell-and-hover interaction pattern for displaying contextual
 * information modals after the user pauses their cursor on an element.
 *
 * Key Behaviours
 * --------------
 * 1. **Dwell Delay (enterDelayMs)** — When the mouse enters the anchor
 *    element, a timer starts. The modal opens only if the cursor remains
 *    stationary on the anchor for the full duration (default: 5 seconds).
 *
 * 2. **Exit Grace Period (exitDelayMs)** — When the mouse leaves the anchor,
 *    a cooldown timer starts (default: 2 seconds). If the cursor re-enters
 *    the anchor or enters the open modal before the cooldown expires, the
 *    modal stays open.
 *
 * 3. **Intent Bridge / Safe Tunnel** — If the mouse moves from the anchor
 *    directly into the modal popup, the modal does NOT close immediately.
 *    The 2-second exit cooldown only triggers when the cursor leaves BOTH
 *    the anchor AND the modal.
 *
 * 4. **Viewport Boundary Auto-Flip** — Uses @floating-ui/react to calculate
 *    optimal viewport placement (auto-flipping top/bottom/left/right) so the
 *    card never renders offscreen.
 *
 * 5. **Escape Key Dismissal** — Pressing Escape immediately closes the
 *    active modal, bypassing the exit cooldown.
 *
 * 6. **Global Singleton** — Only one hover modal can be active across the
 *    entire viewport at any time, managed by `useHoverModalStore`.
 *
 * @example
 * ```tsx
 * const ref = useRef<HTMLDivElement>(null);
 * const { handlers, state, floatingStyles, refs } = useHoverInspector({
 *   targetData: { entityType: 'TASK', entityId: task.id },
 *   enterDelayMs: 5000,
 *   exitDelayMs: 2000,
 * });
 *
 * return (
 *   <div ref={(el) => { refs.setReference(el); handlers.onRef?.(el); }} {...handlers}>
 *     Hover me
 *   </div>
 * );
 * ```
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useFloating, autoUpdate, offset, flip, shift } from '@floating-ui/react';
import { useHoverModalStore } from '../stores/useHoverModalStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Entity types that can be inspected via hover */
export type EntityType = 'TASK' | 'RESOURCE' | 'LOCATION' | 'CDRL';

/** Identifies the entity being inspected */
export interface TargetData {
  /** Type of entity */
  entityType: EntityType;
  /** Unique identifier of the entity */
  entityId: string;
}

/** Position coordinates for modal placement */
export interface AnchorPosition {
  /** X coordinate in viewport pixels */
  x: number;
  /** Y coordinate in viewport pixels */
  y: number;
  /** Width of the anchor element */
  width: number;
  /** Height of the anchor element */
  height: number;
}

/** Placement direction for the modal relative to the anchor */
export type PlacementDirection = 'below-right' | 'below-left' | 'above-right' | 'above-left';

/** Hover state returned by the hook */
export interface HoverState {
  /** Whether the modal is currently open */
  isOpen: boolean;
  /** Anchor coordinates for positioning (legacy, kept for compatibility) */
  position: AnchorPosition | null;
  /** Computed placement direction (legacy, kept for compatibility) */
  placement: PlacementDirection;
  /** Whether the modal is currently in the exit cooldown period */
  isExiting: boolean;
}

/** Mouse event handlers to attach to the anchor element */
export interface HoverHandlers {
  /** onMouseEnter handler */
  onMouseEnter: () => void;
  /** onMouseLeave handler */
  onMouseLeave: () => void;
  /** Optional ref callback for anchor element positioning */
  onRef?: (element: HTMLDivElement | null) => void;
}

/** Configuration options for the hook */
export interface HoverInspectorOptions {
  /** Entity data for the inspection target */
  targetData: TargetData;
  /** Milliseconds to wait before opening the modal (default: 5000) */
  enterDelayMs?: number;
  /** Milliseconds of grace period before closing (default: 2000) */
  exitDelayMs?: number;
  /** Estimated modal width for boundary calculation (default: 400) */
  modalWidth?: number;
  /** Estimated modal height for boundary calculation (default: 300) */
  modalHeight?: number;
  /** Padding from viewport edges (default: 8) */
  viewportPadding?: number;
}

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

const DEFAULT_ENTER_DELAY = 5000; // 5 seconds
const DEFAULT_EXIT_DELAY = 2000;  // 2 seconds
const DEFAULT_MODAL_WIDTH = 400;
const DEFAULT_MODAL_HEIGHT = 300;
const DEFAULT_VIEWPORT_PADDING = 8;

// ---------------------------------------------------------------------------
// Helper: Map floating-ui placement to PlacementDirection
// ---------------------------------------------------------------------------

/**
 * Map @floating-ui/react placement string to our PlacementDirection type.
 *
 * @param placement - Placement string from floating-ui (e.g., 'right-start')
 * @returns Our PlacementDirection enum value
 */
function mapFloatingPlacement(placement: string): PlacementDirection {
  if (placement.startsWith('right') && placement.includes('start')) return 'below-right';
  if (placement.startsWith('left') && placement.includes('start')) return 'below-left';
  if (placement.startsWith('right') && placement.includes('end')) return 'above-right';
  return 'above-left';
}

// ---------------------------------------------------------------------------
// Custom Hook: useHoverInspector
// ---------------------------------------------------------------------------

/**
 * Custom hook that manages the dwell-and-hover interaction pattern.
 *
 * Returns mouse event handlers to attach to the anchor element and the
 * current hover state (open/closed, position, placement).
 *
 * Uses @floating-ui/react for viewport-safe positioning with auto-flip
 * and shift middleware to prevent the modal from rendering offscreen.
 *
 * The hook integrates with the global `useHoverModalStore` to ensure only
 * one hover modal is active at a time across the entire viewport.
 *
 * @param options - Configuration options for the hover inspector
 * @returns Object containing mouse event handlers, hover state, and
 *          floating-ui positioning data (floatingStyles, refs, placement)
 */
export function useHoverInspector(options: HoverInspectorOptions) {
  const {
    targetData,
    enterDelayMs = DEFAULT_ENTER_DELAY,
    exitDelayMs = DEFAULT_EXIT_DELAY,
    modalWidth = DEFAULT_MODAL_WIDTH,
    modalHeight = DEFAULT_MODAL_HEIGHT,
    viewportPadding = DEFAULT_VIEWPORT_PADDING,
  } = options;

  // -----------------------------------------------------------------------
  // Local State
  // -----------------------------------------------------------------------

  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<AnchorPosition | null>(null);
  const [placement, setPlacement] = useState<PlacementDirection>('below-right');
  const [isExiting, setIsExiting] = useState(false);

  // Refs for timer management
  const enterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  // Ref to track whether the mouse is currently inside the modal
  const mouseInModalRef = useRef(false);

  // -----------------------------------------------------------------------
  // @floating-ui/react Integration
  // -----------------------------------------------------------------------

  const {
    refs: floatingRefs,
    floatingStyles,
    placement: floatingPlacement,
    strategy,
  } = useFloating({
    placement: 'right-start',
    strategy: 'fixed',
    open: isOpen,
    onOpenChange: (open) => {
      if (!open && isOpen) {
        // floating-ui wants to close; we manage open state ourselves
      }
    },
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(viewportPadding),
      flip({ padding: viewportPadding, fallbackAxisSideDirection: 'start' }),
      shift({ padding: viewportPadding }),
    ],
  });

  // Sync floating-ui placement to our PlacementDirection type
  useEffect(() => {
    if (isOpen && floatingPlacement) {
      setPlacement(mapFloatingPlacement(floatingPlacement));
    }
  }, [isOpen, floatingPlacement]);

  // -----------------------------------------------------------------------
  // Global Store Integration
  // -----------------------------------------------------------------------

  const { setActiveModal, clearActiveModal, isActive } = useHoverModalStore();

  // -----------------------------------------------------------------------
  // Timer Cleanup
  // -----------------------------------------------------------------------

  /**
   * Clear all pending timers to prevent stale callbacks.
   * Called before starting new timers and on unmount.
   */
  const clearTimers = useCallback(() => {
    if (enterTimerRef.current !== null) {
      clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
    if (exitTimerRef.current !== null) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }, []);

  // -----------------------------------------------------------------------
  // Modal Open/Close Actions
  // -----------------------------------------------------------------------

  /**
   * Open the hover modal after computing the anchor position and placement.
   * Registers this modal as the globally active one.
   * Uses @floating-ui/react for viewport-safe positioning.
   */
  const openModal = useCallback(() => {
    if (!anchorRef.current) return;

    const rect = anchorRef.current.getBoundingClientRect();

    // Set the floating-ui reference element
    floatingRefs.setReference(anchorRef.current);

    const anchorPosition: AnchorPosition = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };

    setPosition(anchorPosition);
    setIsOpen(true);
    setIsExiting(false);

    // Register as the globally active modal
    setActiveModal({
      targetData,
      position: { x: rect.right + viewportPadding, y: rect.top },
      placement: 'below-right',
    });
  }, [targetData, viewportPadding, floatingRefs, setActiveModal]);

  /**
   * Close the hover modal immediately, clearing all timers and global state.
   */
  const closeModal = useCallback(() => {
    clearTimers();
    setIsOpen(false);
    setIsExiting(false);
    mouseInModalRef.current = false;
    clearActiveModal();
  }, [clearTimers, clearActiveModal]);

  /**
   * Start the exit cooldown timer. If the mouse re-enters the anchor or
   * modal before the timer fires, the modal remains open.
   */
  const startExitTimer = useCallback(() => {
    // If mouse is still inside the modal, don't start exit timer
    if (mouseInModalRef.current) return;

    setIsExiting(true);

    exitTimerRef.current = setTimeout(() => {
      // Double-check: if mouse entered modal during cooldown, don't close
      if (!mouseInModalRef.current) {
        closeModal();
      }
    }, exitDelayMs);
  }, [exitDelayMs, closeModal]);

  // -----------------------------------------------------------------------
  // Mouse Event Handlers
  // -----------------------------------------------------------------------

  /**
   * Called when the mouse enters the anchor element.
   * Starts the dwell timer if not already active.
   */
  const handleMouseEnter = useCallback(() => {
    // Clear any pending exit timer
    clearTimers();
    setIsExiting(false);

    // Start the dwell timer
    enterTimerRef.current = setTimeout(() => {
      openModal();
    }, enterDelayMs);
  }, [enterDelayMs, clearTimers, openModal]);

  /**
   * Called when the mouse leaves the anchor element.
   * If the modal is open, starts the exit cooldown timer.
   * If the modal is not yet open, cancels the dwell timer.
   */
  const handleMouseLeave = useCallback(() => {
    // If modal is open, start exit cooldown (Intent Bridge)
    if (isOpen) {
      startExitTimer();
    } else {
      // Modal not yet open — cancel the dwell timer
      clearTimers();
    }
  }, [isOpen, startExitTimer, clearTimers]);

  // -----------------------------------------------------------------------
  // Modal Callbacks (for the modal component to call)
  // -----------------------------------------------------------------------

  /**
   * Called when the mouse enters the modal popup.
   * Clears the exit timer and keeps the modal open indefinitely.
   */
  const handleModalMouseEnter = useCallback(() => {
    mouseInModalRef.current = true;
    if (exitTimerRef.current !== null) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    setIsExiting(false);
  }, []);

  /**
   * Called when the mouse leaves the modal popup.
   * Starts the exit cooldown timer.
   */
  const handleModalMouseLeave = useCallback(() => {
    mouseInModalRef.current = false;
    startExitTimer();
  }, [startExitTimer]);

  // -----------------------------------------------------------------------
  // Keyboard Handler (Escape key)
  // -----------------------------------------------------------------------

  /**
   * Global keyboard listener that closes the modal when Escape is pressed.
   * Registered only when this modal is the globally active one.
   */
  useEffect(() => {
    if (!isActive || !isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isActive, isOpen, closeModal]);

  // -----------------------------------------------------------------------
  // Cleanup on Unmount
  // -----------------------------------------------------------------------

  useEffect(() => {
    return () => {
      clearTimers();
      if (isActive) {
        clearActiveModal();
      }
    };
  }, [clearTimers, isActive, clearActiveModal]);

  // -----------------------------------------------------------------------
  // Return Value
  // -----------------------------------------------------------------------

  const state: HoverState = {
    isOpen,
    position,
    placement,
    isExiting,
  };

  const handleRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (anchorRef.current === element) return;
      anchorRef.current = element;
      // Also set as the floating-ui reference element
      if (element) {
        floatingRefs.setReference(element);
      }
    },
    [floatingRefs.setReference],
  );

  const handlers: HoverHandlers = useMemo(
    () => ({
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      onRef: handleRef,
    }),
    [handleMouseEnter, handleMouseLeave, handleRef],
  );

  return {
    /** Current hover state */
    state,
    /** Mouse event handlers for the anchor element */
    handlers,
    /** Callbacks for the modal component to manage the Intent Bridge */
    modalCallbacks: {
      onMouseEnter: handleModalMouseEnter,
      onMouseLeave: handleModalMouseLeave,
    },
    /** Programmatically close the modal */
    close: closeModal,
    /** Whether this hook's modal is the globally active one */
    isActive,
    /** @floating-ui/react computed styles for the floating element */
    floatingStyles,
    /** @floating-ui/react refs for reference/floating elements */
    refs: floatingRefs,
    /** @floating-ui/react placement string */
    floatingPlacement,
    /** @floating-ui/react positioning strategy ('fixed' | 'absolute') */
    strategy,
  };
}
