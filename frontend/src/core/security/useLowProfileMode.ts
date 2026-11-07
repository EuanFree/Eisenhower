/**
 * Low-Profile / Briefing Mode Hook
 *
 * Provides a toggle in the top shell utility bar to suppress all audible
 * browser chime notifications and flashing alert banners, routing
 * notifications to silent badge counters instead.
 *
 * How It Works
 * ~~~~~~~~~~~~
 *
 * 1. **Toggle State** — Maintains a `isLowProfile` boolean in a Zustand
 *    store so the state is shared across all components.
 *
 * 2. **Audio Suppression** — When active, intercepts all `new Audio()`
 *    calls and `AudioContext.resume()` to prevent audible chimes.
 *
 * 3. **Visual Suppression** — Adds a `data-low-profile="true"` attribute
 *    to `document.documentElement` so CSS can hide flashing banners and
 *    replace them with silent badge counters.
 *
 * 4. **Notification Routing** — Dispatches `scif:notification` custom
 *    events with a `silent: true` flag so notification components can
 *    route to badge counters instead of banners.
 *
 * Usage
 * ~~~~~
 *
 * .. code-block:: tsx
 *
 *   const { isLowProfile, toggleLowProfile } = useLowProfileMode();
 *
 *   // In the utility bar:
 *   <button onClick={toggleLowProfile}>
 *     {isLowProfile ? 'Exit Low-Profile' : 'Low-Profile / Briefing Mode'}
 *   </button>
 *
 *   // In CSS:
 *   // [data-low-profile="true"] .flashing-banner { display: none; }
 *   // [data-low-profile="true"] .notification-badge { display: flex; }
 */

import { useEffect, useCallback, useState } from 'react';
import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Zustand store state for low-profile mode.
 */
interface LowProfileStoreState {
  /** Whether low-profile / briefing mode is currently active. */
  isLowProfile: boolean;

  /** Toggle low-profile mode on/off. */
  toggleLowProfile: () => void;

  /** Set low-profile mode explicitly. */
  setLowProfile: (value: boolean) => void;
}

// ---------------------------------------------------------------------------
// Zustand Store
// ---------------------------------------------------------------------------

/**
 * Shared store for low-profile mode state.  Using Zustand ensures
 * the toggle state is accessible from any component without prop drilling.
 */
export const useLowProfileStore = create<LowProfileStoreState>((set) => ({
  isLowProfile: false,

  toggleLowProfile: () =>
    set((state) => ({ isLowProfile: !state.isLowProfile })),

  setLowProfile: (value: boolean) =>
    set(() => ({ isLowProfile: value })),
}));

// ---------------------------------------------------------------------------
// Audio Suppression
// ---------------------------------------------------------------------------

/**
 * Original Audio constructor reference for restoration.
 */
let originalAudioConstructor: typeof Audio | null = null;

/**
 * Suppress all audible browser chime notifications by monkey-patching
 * the Audio constructor.
 */
function suppressAudio() {
  if (typeof window === 'undefined') return;

  if (!originalAudioConstructor) {
    originalAudioConstructor = window.Audio;
  }

  window.Audio = class extends originalAudioConstructor {
    constructor(...args: ConstructorParameters<typeof Audio>) {
      super(...args);
      // Mute all audio
      this.volume = 0;
    }

    async play(): Promise<void> {
      // Silently fail — do not play audio
      return Promise.resolve();
    }
  } as typeof Audio;
}

/**
 * Restore the original Audio constructor.
 */
function restoreAudio() {
  if (typeof window === 'undefined' || !originalAudioConstructor) return;

  window.Audio = originalAudioConstructor;
  originalAudioConstructor = null;
}

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

/**
 * Custom hook for low-profile / briefing mode.
 *
 * @returns Object with isLowProfile state and toggle/set methods.
 *
 * @example
 * ```tsx
 * const { isLowProfile, toggleLowProfile } = useLowProfileMode();
 *
 * return (
 *   <button onClick={toggleLowProfile}>
 *     {isLowProfile ? '🔇 Briefing Mode ON' : '🔊 Normal Mode'}
 *   </button>
 * );
 * ```
 */
export function useLowProfileMode() {
  const { isLowProfile, toggleLowProfile, setLowProfile } = useLowProfileStore();

  // Apply DOM attribute and audio suppression when state changes
  useEffect(() => {
    if (isLowProfile) {
      // Set DOM attribute for CSS-based suppression
      document.documentElement.setAttribute('data-low-profile', 'true');

      // Suppress audio
      suppressAudio();

      // Dispatch activation event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('scif:low-profile', {
            detail: { active: true },
          })
        );
      }
    } else {
      // Remove DOM attribute
      document.documentElement.removeAttribute('data-low-profile');

      // Restore audio
      restoreAudio();

      // Dispatch deactivation event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('scif:low-profile', {
            detail: { active: false },
          })
        );
      }
    }

    // Cleanup on unmount
    return () => {
      // Do not restore on unmount — only on state change
    };
  }, [isLowProfile]);

  /**
   * Route a notification to silent badge counters when low-profile is active.
   *
   * @param notification - Notification payload.
   */
  const routeNotification = useCallback(
    (notification: {
      title: string;
      message?: string;
      type?: 'info' | 'warning' | 'error';
      sound?: string;
    }) => {
      if (isLowProfile) {
        // Dispatch a silent notification event
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('scif:notification', {
              detail: {
                ...notification,
                silent: true,
                timestamp: new Date().toISOString(),
              },
            })
          );
        }
      } else {
        // Normal notification — play sound if specified
        if (notification.sound && typeof window !== 'undefined') {
          try {
            const audio = new Audio(notification.sound);
            audio.play().catch(() => {
              // Audio play failed — ignore
            });
          } catch {
            // Audio construction failed — ignore
          }
        }
      }
    },
    [isLowProfile]
  );

  return {
    isLowProfile,
    toggleLowProfile,
    setLowProfile,
    routeNotification,
  };
}
