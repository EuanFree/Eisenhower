/**
 * Inactivity lock hook for SCIF terminal security.
 *
 * This hook enforces the 15-minute inactivity timeout required by
 * UK MOD JSP 440 / JSP 604 and US DoD IL5/IL6 guidelines.  In a
 * classified operational environment (SCIF), an unattended terminal
 * poses a severe security risk.
 *
 * How It Works
 * ~~~~~~~~~~~~
 *
 * 1. **Activity Tracking** — Listens for mouse movement, keypresses,
 *    touch events, and scroll events on the document.  Each event
 *    resets the inactivity timer.
 *
 * 2. **Heartbeat** — Sends periodic heartbeat pings to the backend
 *    (`POST /api/v1/auth/heartbeat`) to keep the server-side session
 *    alive.
 *
 * 3. **Warning Countdown** — At 14 minutes of inactivity, displays
 *    an accessible 60-second countdown dialog giving the user a
 *    chance to resume activity.
 *
 * 4. **Lockout** — At 15 minutes of inactivity, purges all sensitive
 *    Zustand memory stores and routes to a locked terminal blackout
 *    screen.
 *
 * Usage
 * ~~~~~
 *
 * .. code-block:: ts
 *
 *   const { isLocked, showCountdown, remainingSeconds } = useInactivityLock({
 *     tokenJti: "abc123",
 *     onLockout: () => navigate("/locked"),
 *   });
 *
 *   if (isLocked) {
 *     return <BlackoutScreen onUnlock={handleUnlock} />;
 *   }
 */
import { useEffect, useRef, useCallback, useState } from "react";
import axios from "axios";

// Inactivity thresholds (in seconds)
const WARNING_THRESHOLD = 840; // 14 minutes — show countdown
const LOCKOUT_THRESHOLD = 900; // 15 minutes — purge and lock

// Heartbeat interval (every 30 seconds)
const HEARTBEAT_INTERVAL = 30_000;

// Countdown check interval (every 1 second)
const COUNTDOWN_INTERVAL = 1_000;

/**
 * Configuration options for the inactivity lock hook.
 */
interface InactivityLockOptions {
  /** JWT token JTI for server-side session tracking. */
  tokenJti?: string;

  /** Callback invoked when the user is locked out. */
  onLockout?: () => void;

  /** Callback invoked when the countdown dialog appears. */
  onWarning?: () => void;

  /** Custom API base URL (defaults to current origin). */
  apiBaseUrl?: string;
}

/**
 * State and handlers returned by the inactivity lock hook.
 */
interface InactivityLockState {
  /** Whether the terminal is currently locked. */
  isLocked: boolean;

  /** Whether the countdown dialog should be shown. */
  showCountdown: boolean;

  /** Remaining seconds until lockout (0–900). */
  remainingSeconds: number;

  /** Reset the inactivity timer (call on user activity). */
  resetTimer: () => void;

  /** Manually unlock the terminal (requires re-authentication). */
  unlock: () => void;

  /** Manually trigger lockout. */
  lock: () => void;
}

/**
 * Purge all sensitive Zustand stores from memory.
 *
 * In a SCIF environment, when a terminal is locked due to inactivity,
 * all sensitive data must be removed from browser memory to prevent
 * unauthorized access if the terminal is left unattended.
 */
function purgeSensitiveMemory(): void {
  // Clear any JWT tokens from memory
  const tokenKey = "auth_token";
  if (typeof window !== "undefined") {
    // Note: We do NOT use localStorage in SCIF environments.
    // This is a safety net in case tokens were accidentally stored.
    try {
      localStorage.removeItem(tokenKey);
      sessionStorage.removeItem(tokenKey);
    } catch {
      // Storage may be unavailable — ignore
    }
  }

  // Clear any sensitive in-memory caches
  // Zustand stores are singletons — we dispatch a PURGE action
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("eisenhower:purge-memory", {
        detail: { reason: "INACTIVITY_LOCKOUT" },
      })
    );
  }
}

/**
 * Send a heartbeat ping to the backend to keep the session alive.
 *
 * @param tokenJti - JWT token JTI for session identification.
 * @param apiBaseUrl - API base URL.
 */
async function sendHeartbeat(
  tokenJti: string,
  apiBaseUrl: string
): Promise<void> {
  try {
    await axios.post(
      `${apiBaseUrl}/api/v1/admin/security/heartbeat`,
      { token_jti: tokenJti },
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
        },
        timeout: 5000,
      }
    );
  } catch {
    // Heartbeat failure is non-fatal — the server will handle
    // session expiry on the next request.
    console.warn("[InactivityLock] Heartbeat failed — session may have expired");
  }
}

/**
 * Custom hook that enforces SCIF inactivity timeout.
 *
 * Tracks DOM activity (mouse movement, keypresses, touch, scroll)
 * and enforces a 15-minute inactivity window.  At 14 minutes, shows
 * a 60-second countdown dialog.  At 15 minutes, purges sensitive
 * memory and triggers lockout.
 *
 * @param options - Configuration options for the hook.
 *
 * @returns InactivityLockState with isLocked, showCountdown,
 *          remainingSeconds, resetTimer, unlock, and lock.
 *
 * @example
 * ```tsx
 * const { isLocked, showCountdown, remainingSeconds } = useInactivityLock({
 *   tokenJti: userToken.jti,
 *   onLockout: () => router.navigate("/locked"),
 * });
 *
 * if (isLocked) {
 *   return <BlackoutScreen />;
 * }
 * ```
 */
export function useInactivityLock(
  options: InactivityLockOptions = {}
): InactivityLockState {
  const { tokenJti, onLockout, onWarning, apiBaseUrl } = options;

  const [isLocked, setIsLocked] = useState(false);
  const [showCountdown, setShowCountdown] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(LOCKOUT_THRESHOLD);

  const lastActivityRef = useRef<number>(Date.now());
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const apiBaseUrlRef = useRef<string>(
    apiBaseUrl || (typeof window !== "undefined" ? window.location.origin : "")
  );

  /**
   * Reset the inactivity timer on user activity.
   */
  const resetTimer = useCallback(() => {
    if (isLocked) return;

    lastActivityRef.current = Date.now();
    setRemainingSeconds(LOCKOUT_THRESHOLD);
    setShowCountdown(false);
  }, [isLocked]);

  /**
   * Manually unlock the terminal.
   *
   * Typically called after the user re-authenticates on the
   * blackout screen.
   */
  const unlock = useCallback(() => {
    setIsLocked(false);
    setShowCountdown(false);
    setRemainingSeconds(LOCKOUT_THRESHOLD);
    lastActivityRef.current = Date.now();
  }, []);

  /**
   * Manually trigger lockout.
   */
  const lock = useCallback(() => {
    purgeSensitiveMemory();
    setIsLocked(true);
    setShowCountdown(false);
    setRemainingSeconds(0);
    onLockout?.();
  }, [onLockout]);

  useEffect(() => {
    if (isLocked) return;

    // Activity event handlers
    const activityEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "click",
    ] as const;

    const handleActivity = () => {
      resetTimer();
    };

    // Attach event listeners
    for (const event of activityEvents) {
      document.addEventListener(event, handleActivity, { passive: true });
    }

    // Heartbeat timer — keep server session alive
    heartbeatTimerRef.current = setInterval(() => {
      const elapsed = (Date.now() - lastActivityRef.current) / 1000;

      if (elapsed < LOCKOUT_THRESHOLD && tokenJti) {
        sendHeartbeat(tokenJti, apiBaseUrlRef.current);
      }
    }, HEARTBEAT_INTERVAL);

    // Countdown timer — check inactivity status every second
    countdownTimerRef.current = setInterval(() => {
      const elapsed = (Date.now() - lastActivityRef.current) / 1000;
      const remaining = Math.max(0, LOCKOUT_THRESHOLD - Math.floor(elapsed));

      setRemainingSeconds(remaining);

      // Warning zone — show countdown at 14 minutes
      if (elapsed >= WARNING_THRESHOLD && !showCountdown) {
        setShowCountdown(true);
        onWarning?.();
      }

      // Lockout — purge and lock at 15 minutes
      if (elapsed >= LOCKOUT_THRESHOLD) {
        purgeSensitiveMemory();
        setIsLocked(true);
        setShowCountdown(false);
        setRemainingSeconds(0);
        onLockout?.();
      }
    }, COUNTDOWN_INTERVAL);

    // Cleanup
    return () => {
      for (const event of activityEvents) {
        document.removeEventListener(event, handleActivity);
      }
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, [isLocked, tokenJti, resetTimer, onLockout, onWarning, showCountdown]);

  // Listen for purge memory events from other components
  useEffect(() => {
    const handlePurge = () => {
      // Reset timer on purge event — the component that dispatched
      // the event is responsible for the actual purge
      resetTimer();
    };

    window.addEventListener("eisenhower:activity-detected", handlePurge);
    return () => {
      window.removeEventListener("eisenhower:activity-detected", handlePurge);
    };
  }, [resetTimer]);

  return {
    isLocked,
    showCountdown,
    remainingSeconds,
    resetTimer,
    unlock,
    lock,
  };
}

/**
 * Custom hook that subscribes to the purge-memory event and clears
 * Zustand stores.
 *
 * Use this in your root App component to ensure all sensitive stores
 * are cleared when the inactivity lockout triggers.
 */
export function useMemoryPurgeSubscription(): void {
  useEffect(() => {
    const handlePurge = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      console.log(
        `[MemoryPurge] Purging sensitive memory: ${detail?.reason || "unknown"}`
      );

      // Dispatch a custom event that Zustand stores can listen to
      window.dispatchEvent(
        new CustomEvent("eisenhower:stores-purge", {
          detail: { reason: detail?.reason },
        })
      );
    };

    window.addEventListener("eisenhower:purge-memory", handlePurge);
    return () => {
      window.removeEventListener("eisenhower:purge-memory", handlePurge);
    };
  }, []);
}

/**
 * Format remaining seconds into a human-readable countdown string.
 *
 * @param seconds - Remaining seconds.
 *
 * @returns Formatted string like "0:45" or "1:30".
 */
export function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
