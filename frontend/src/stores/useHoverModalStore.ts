/**
 * Hover Modal Global Store
 *
 * A Zustand store that enforces a single active hover modal across the entire
 * viewport at any given time.  This prevents multiple dwell-and-hover modals
 * from stacking on top of each other when the user moves their cursor quickly
 * between different UI elements.
 *
 * Key Features
 * ------------
 * 1. **Singleton Enforcement** — Only one hover modal can be active at a
 *    time.  Opening a new modal automatically closes the previous one.
 *
 * 2. **Position Tracking** — Stores the modal's pixel position and placement
 *    direction so the rendering component can position it correctly.
 *
 * 3. **Lock State** — If a dropdown, select, or other interactive element
 *    inside the modal is active, the modal can be locked to prevent accidental
 *    dismissal while the user is interacting with it.
 *
 * 4. **Entity Data** — Holds the target entity data (type and ID) so the
 *    modal can fetch and display the correct inspection details.
 *
 * @example
 * ```tsx
 * // In a component that opens the hover modal:
 * const { setActiveModal } = useHoverModalStore();
 * setActiveModal({
 *   targetData: { entityType: 'TASK', entityId: 'abc-123' },
 *   position: { x: 100, y: 200 },
 *   placement: 'below-right',
 * });
 *
 * // In the modal rendering component:
 * const { activeModal, closeActiveModal } = useHoverModalStore();
 * if (activeModal) {
 *   return <HoverModal data={activeModal.targetData} onClose={closeActiveModal} />;
 * }
 * ```
 */

import { create } from 'zustand';

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

/** Pixel position for the modal */
export interface ModalPosition {
  /** X coordinate in viewport pixels */
  x: number;
  /** Y coordinate in viewport pixels */
  y: number;
}

/** Placement direction for the modal relative to the anchor */
export type PlacementDirection = 'below-right' | 'below-left' | 'above-right' | 'above-left';

/** Active modal information stored in the global store */
export interface ActiveModalInfo {
  /** Entity data for the inspection target */
  targetData: TargetData;
  /** Pixel position of the modal */
  position: ModalPosition;
  /** Placement direction */
  placement: PlacementDirection;
}

/** State managed by the hover modal store */
interface HoverModalState {
  /** The currently active modal, or null if no modal is open */
  activeModal: ActiveModalInfo | null;

  /** Whether the modal is locked (e.g., dropdown inside is active) */
  isLocked: boolean;

  /**
   * Set the active modal, replacing any previously active one.
   * This is the primary way to open a hover modal.
   *
   * @param modal - Information about the modal to activate
   */
  setActiveModal: (modal: ActiveModalInfo) => void;

  /**
   * Clear the active modal, closing it if open.
   * Use this to programmatically dismiss the hover modal.
   */
  clearActiveModal: () => void;

  /**
   * Close the active modal immediately, bypassing any exit cooldown.
   * Typically called when the user presses Escape or clicks outside.
   */
  closeActiveModal: () => void;

  /**
   * Lock the modal to prevent dismissal while interacting with
   * internal elements (dropdowns, forms, etc.).
   *
   * @param locked - Whether to lock or unlock the modal
   */
  setLock: (locked: boolean) => void;

  /**
   * Check if the current hook's modal is the globally active one.
   * Useful for keyboard handlers that should only respond when
   * their modal is the active one.
   *
   * @param targetData - The entity data to check against
   * @returns True if this modal is the active one
   */
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Store Definition
// ---------------------------------------------------------------------------

/**
 * Global Zustand store for hover modal management.
 *
 * Ensures only one hover modal is active at a time across the viewport.
 * Provides lock state management for interactive elements inside the modal.
 */
export const useHoverModalStore = create<HoverModalState>((set, get) => ({
  /** No modal is active initially */
  activeModal: null,

  /** Modal is not locked initially */
  isLocked: false,

  /**
   * Set the active modal, replacing any previously active one.
   *
   * When a new modal is activated, any existing modal is automatically
   * cleared to maintain the singleton invariant.
   *
   * @param modal - Information about the modal to activate
   */
  setActiveModal: (modal: ActiveModalInfo) => {
    set({
      activeModal: modal,
      isLocked: false,
    });
  },

  /**
   * Clear the active modal, resetting all state.
   *
   * This is a soft clear that does not force-close the modal — it simply
   * removes the active modal from the store.  The modal component should
   * listen for this change and close itself.
   */
  clearActiveModal: () => {
    set({
      activeModal: null,
      isLocked: false,
    });
  },

  /**
   * Close the active modal immediately.
   *
   * Unlike clearActiveModal, this method is intended for immediate dismissal
   * (e.g., Escape key press, click outside).  It clears the modal and resets
   * the lock state in one atomic operation.
   */
  closeActiveModal: () => {
    set({
      activeModal: null,
      isLocked: false,
    });
  },

  /**
   * Set the lock state to prevent accidental dismissal.
   *
   * When locked, the modal will not close even if the exit cooldown timer
   * fires.  This is useful when the user is interacting with dropdowns,
   * forms, or other interactive elements inside the modal.
   *
   * @param locked - Whether to lock or unlock the modal
   */
  setLock: (locked: boolean) => {
    set({ isLocked: locked });
  },

  /**
   * Derived state: whether any modal is currently active.
   *
   * This is a getter function that returns true if there is an active
   * modal in the store.  Used by keyboard handlers and other global
   * listeners to determine if they should respond to user input.
   */
  get isActive() {
    return get().activeModal !== null;
  },
}));
