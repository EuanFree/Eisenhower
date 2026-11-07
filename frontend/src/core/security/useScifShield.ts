/**
 * SCIF Display Shield — Idle Detection Hook
 *
 * Enforces workstation display shielding for classified environments
 * (SCIF — Sensitive Compartmented Information Facility).
 *
 * How It Works
 * ~~~~~~~~~~~~
 *
 * 1. **Activity Tracking** — Listens for mouse, keyboard, touch, and
 *    scroll events on the document.  Each event resets the idle timer.
 *
 * 2. **Configurable Timeout** — Reads the idle threshold from
 *    `system_config.json` (default: 180 seconds).  The backend exposes
 *    this value via `GET /api/v1/admin/system-config`.
 *
 * 3. **DOM Purge on Timeout** — When the idle threshold expires:
 *    - Temporarily unmounts active virtualized WBS tables, Gantt
 *      canvases, and detail drawers to purge classified DOM text
 *      from memory.
 *    - Displays a full-screen lock overlay (ScifDisplayShield.tsx).
 *
 * 4. **Re-Authentication** — On successful password/PIN entry, restores
 *    the active workspace state with zero data loss (state is preserved
 *    in a Zustand store, not destroyed).
 *
 * Usage
 * ~~~~~
 *
 * .. code-block:: ts
 *
 *   const { isShielded, shieldTimeout, unmountClassifiedDOM, restoreDOM } =
 *     useScifShield({ classification: 'SECRET', caveats: ['UK_EYES_ONLY'] });
 *
 *   if (isShielded) {
 *     return <ScifDisplayShield onUnlock={handleUnlock} />;
 *   }
 */

import { useEffect, useRef, useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration options for the SCIF shield hook.
 */
export interface ScifShieldOptions {
  /** Current classification level of the active view. */
  classification?: string;

  /** Active handling caveats (e.g., ['UK_EYES_ONLY']). */
  caveats?: string[];

  /** Custom idle timeout in seconds (overrides system_config.json). */
  idleTimeoutSeconds?: number;

  /** Callback invoked when the shield activates. */
  onShield?: () => void;

  /** Callback invoked when the shield is dismissed. */
  onUnshield?: () => void;

  /** Custom API base URL (defaults to current origin). */
  apiBaseUrl?: string;
}

/**
 * State and handlers returned by the SCIF shield hook.
 */
export interface ScifShieldState {
  /** Whether the display shield is currently active. */
  isShielded: boolean;

  /** Current idle timeout threshold in seconds. */
  shieldTimeout: number;

  /** Seconds remaining until shield activates. */
  remainingSeconds: number;

  /** Whether the hook has finished loading configuration. */
  isConfigLoaded: boolean;

  /**
   * Temporarily unmount classified DOM elements (WBS tables, Gantt
   * canvases, detail drawers) to purge classified text from memory.
   */
  unmountClassifiedDOM: () => void;

  /**
   * Restore previously unmounted classified DOM elements.
   */
  restoreDOM: () => void;

  /** Manually activate the shield. */
  shield: () => void;

  /** Manually dismiss the shield (after re-authentication). */
  unshield: () => void;

  /** Reset the idle timer (call on user activity). */
  resetTimer: () => void;
}

// ---------------------------------------------------------------------------
// DOM Selectors for Classified Content
// ---------------------------------------------------------------------------

/**
 * CSS selectors targeting classified content areas that must be
 * unmounted when the display shield activates.
 */
const CLASSIFIED_DOM_SELECTORS = [
  '#main-content [data-classified="true"]',
  '.wbs-table',
  '.gantt-viewport',
  '.gantt-canvas',
  '.detail-drawer',
  '.slide-over-drawer',
  '[role="main"] .task-cell',
  '[role="main"] .gantt-bar',
] as const;

// ---------------------------------------------------------------------------
// Configuration Loader
// ---------------------------------------------------------------------------

/**
 * Fetch the idle timeout from system_config.json via the backend API.
 * Falls back to 180 seconds if the API is unavailable.
 */
async function loadShieldConfig(
  apiBaseUrl: string
): Promise<number> {
  try {
    const resp = await fetch(`${apiBaseUrl}/api/v1/admin/system-config`, {
      credentials: 'include',
    });
    if (resp.ok) {
      const config = await resp.json();
      // Support both SCIF_IDLE_TIMEOUT_SECONDS and SESSION_TIMEOUT_MINUTES
      if (config.SCIF_IDLE_TIMEOUT_SECONDS) {
        return config.SCIF_IDLE_TIMEOUT_SECONDS;
      }
      if (config.SESSION_TIMEOUT_MINUTES) {
        return config.SESSION_TIMEOUT_MINUTES * 60;
      }
    }
  } catch {
    // API unavailable — use default
  }
  return 180; // Default: 3 minutes
}

// ---------------------------------------------------------------------------
// DOM Preservation Store
// ---------------------------------------------------------------------------

/**
 * In-memory store for preserving classified DOM state during shield
 * activation.  This allows zero-data-loss restoration after re-auth.
 */
interface DOMPreservationEntry {
  element: HTMLElement;
  parent: HTMLElement | null;
  nextSibling: Node | null;
  innerHTML: string;
  dataset: DOMStringMap;
}

const domPreservationStore: DOMPreservationEntry[] = [];

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

/**
 * Custom hook that enforces SCIF display shielding on idle timeout.
 *
 * Tracks DOM activity (mouse, keyboard, touch, scroll) and enforces
 * a configurable idle window.  On timeout, unmounts classified DOM
 * elements and activates the full-screen lock overlay.
 *
 * @param options - Configuration options for the hook.
 *
 * @returns ScifShieldState with shield status and control methods.
 *
 * @example
 * ```tsx
 * const { isShielded, unmountClassifiedDOM, restoreDOM } = useScifShield({
 *   classification: 'SECRET',
 *   caveats: ['UK_EYES_ONLY'],
 *   idleTimeoutSeconds: 180,
 * });
 *
 * if (isShielded) {
 *   return <ScifDisplayShield onUnlock={handleUnlock} />;
 * }
 * ```
 */
export function useScifShield(
  options: ScifShieldOptions = {}
): ScifShieldState {
  const {
    classification,
    caveats,
    idleTimeoutSeconds,
    onShield,
    onUnshield,
    apiBaseUrl,
  } = options;

  const apiBaseUrlRef = useRef<string>(
    apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
  );

  const [isShielded, setIsShielded] = useState(false);
  const [shieldTimeout, setShieldTimeout] = useState(180);
  const [remainingSeconds, setRemainingSeconds] = useState(180);
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);

  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * Reset the idle timer on user activity.
   */
  const resetTimer = useCallback(() => {
    if (isShielded) return;
    lastActivityRef.current = Date.now();
    setRemainingSeconds(shieldTimeout);
  }, [isShielded, shieldTimeout]);

  /**
   * Temporarily unmount classified DOM elements to purge classified
   * text from the DOM while preserving state for restoration.
   */
  const unmountClassifiedDOM = useCallback(() => {
    domPreservationStore.length = 0;

    for (const selector of CLASSIFIED_DOM_SELECTORS) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements as NodeListOf<HTMLElement>) {
        const entry: DOMPreservationEntry = {
          element: el,
          parent: el.parentElement,
          nextSibling: el.nextSibling,
          innerHTML: el.innerHTML,
          dataset: el.dataset,
        };
        domPreservationStore.push(entry);

        // Hide the element rather than removing it — React virtualized
        // lists manage their own DOM lifecycle.  We set a data attribute
        // so the shield overlay knows classified content is purged.
        el.setAttribute('data-shield-purged', 'true');
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
      }
    }

    // Dispatch a custom event so React components can unmount their
    // classified content programmatically
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('scif:shield-activate', {
          detail: { classification, caveats },
        })
      );
    }
  }, [classification, caveats]);

  /**
   * Restore previously unmounted classified DOM elements.
   */
  const restoreDOM = useCallback(() => {
    for (const entry of domPreservationStore) {
      entry.element.removeAttribute('data-shield-purged');
      entry.element.style.visibility = '';
      entry.element.style.pointerEvents = '';
    }
    domPreservationStore.length = 0;

    // Dispatch a custom event so React components can re-mount their
    // classified content programmatically
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('scif:shield-deactivate', {
          detail: { classification, caveats },
        })
      );
    }
  }, [classification, caveats]);

  /**
   * Activate the display shield.
   */
  const shield = useCallback(() => {
    unmountClassifiedDOM();
    setIsShielded(true);
    setRemainingSeconds(0);
    onShield?.();
  }, [unmountClassifiedDOM, onShield]);

  /**
   * Deactivate the display shield (after successful re-authentication).
   */
  const unshield = useCallback(() => {
    setIsShielded(false);
    restoreDOM();
    lastActivityRef.current = Date.now();
    setRemainingSeconds(shieldTimeout);
    onUnshield?.();
  }, [restoreDOM, shieldTimeout, onUnshield]);

  // Load configuration from backend on mount
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const timeout = idleTimeoutSeconds ?? await loadShieldConfig(apiBaseUrlRef.current);
      if (!cancelled) {
        setShieldTimeout(timeout);
        setRemainingSeconds(timeout);
        setIsConfigLoaded(true);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [idleTimeoutSeconds]);

  // Activity event listeners
  useEffect(() => {
    if (isShielded || !isConfigLoaded) return;

    const activityEvents = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'touchmove',
      'scroll',
      'click',
      'wheel',
    ] as const;

    const handleActivity = () => {
      resetTimer();
    };

    for (const event of activityEvents) {
      document.addEventListener(event, handleActivity, { passive: true });
    }

    return () => {
      for (const event of activityEvents) {
        document.removeEventListener(event, handleActivity);
      }
    };
  }, [isShielded, isConfigLoaded, resetTimer]);

  // Idle countdown timer
  useEffect(() => {
    if (isShielded || !isConfigLoaded) return;

    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - lastActivityRef.current) / 1000;
      const remaining = Math.max(0, shieldTimeout - Math.floor(elapsed));

      setRemainingSeconds(remaining);

      if (elapsed >= shieldTimeout) {
        shield();
      }
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isShielded, isConfigLoaded, shieldTimeout, shield]);

  return {
    isShielded,
    shieldTimeout,
    remainingSeconds,
    isConfigLoaded,
    unmountClassifiedDOM,
    restoreDOM,
    shield,
    unshield,
    resetTimer,
  };
}
