/**
 * Emergency Stoppage Banner Component
 *
 * Listens on the WebSocket channel for the CRITICAL_STOPPAGE_ESCALATED event.
 * When received, evaluates whether the current user is the assigned CAM or the
 * designated active delegatee, then renders a high-visibility red emergency
 * banner at the top of the viewport.
 *
 * Banner content:
 *   'CRITICAL PATH STOPPAGE: [Task Code - Task Name] is blocked.
 *    Escalated under delegated authority from [Delegator UPN].
 *    SLA remaining: [Countdown Timer]'
 *
 * Provides an immediate action button: [Review Stoppage Drawer].
 *
 * WebSocket Event Contract
 * -------------------------
 * The server broadcasts a CRITICAL_STOPPAGE_ESCALATED event with the shape:
 *
 * {
 *   event: "CRITICAL_STOPPAGE_ESCALATED",
 *   blocker_id: string,
 *   node_id: string,
 *   task_code: string,
 *   task_name: string,
 *   delegator_upn: string,
 *   delegatee_upn: string,
 *   cam_upn: string,
 *   escalated_at: string,          // ISO timestamp
 *   sla_deadline: string,          // ISO timestamp
 *   root_cause: string,
 *   operational_impact_hours: number,
 *   driving_path_tf: number,       // Total float on driving path (≤0 means critical)
 *   evidence_files: string[],      // List of evidence file URLs
 * }
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertOctagon,
  X,
  PanelRightOpen,
  Clock,
} from 'lucide-react';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of the CRITICAL_STOPPAGE_ESCALATED WebSocket payload */
export interface CriticalStoppageEvent {
  blocker_id: string;
  node_id: string;
  task_code: string;
  task_name: string;
  delegator_upn: string;
  delegatee_upn: string;
  cam_upn: string;
  escalated_at: string;
  sla_deadline: string;
  root_cause: string;
  operational_impact_hours: number;
  driving_path_tf: number;
  evidence_files: string[];
}

export interface EmergencyStoppageBannerProps {
  /**
   * Current user's UPN for delegation evaluation.
   * If not provided, reads from localStorage 'user_upn'.
   */
  currentUserUpn?: string;

  /**
   * Called when the user clicks [Review Stoppage Drawer].
   * Passes the full stoppage event payload so the drawer can display details.
   */
  onReview?: (event: CriticalStoppageEvent) => void;

  /**
   * Called when the user dismisses the banner (silent acknowledgment).
   */
  onDismiss?: (event: CriticalStoppageEvent) => void;

  /**
   * Optionally inject events externally instead of listening on WebSocket.
   * Useful for testing or when the WebSocket hook is managed elsewhere.
   */
  onEventRegistered?: (callback: (event: CriticalStoppageEvent) => void) => void;

  /**
   * Optionally clear a registered event listener on unmount.
   */
  onEventUnregistered?: (callback: (event: CriticalStoppageEvent) => void) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute remaining SLA time in seconds from a deadline ISO string.
 */
function getSlaRemainingSeconds(slaDeadline: string): number {
  const deadline = new Date(slaDeadline).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((deadline - now) / 1000));
}

/**
 * Format remaining seconds into a human-readable countdown string.
 * e.g., "2h 15m 30s", "45m 12s", "3m 05s"
 */
function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'EXPIRED';

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${String(seconds).padStart(2, '0')}s`);

  return parts.join(' ');
}

/**
 * Check whether a user is eligible to see the banner based on delegation.
 * The user must be either the assigned CAM or the designated active delegatee.
 */
function isUserEligible(
  userUpn: string,
  camUpn: string,
  delegateeUpn: string,
): boolean {
  const normalized = userUpn.trim().toLowerCase();
  return (
    normalized === camUpn.trim().toLowerCase() ||
    normalized === delegateeUpn.trim().toLowerCase()
  );
}

// ---------------------------------------------------------------------------
// Countdown Timer Hook (internal)
// ---------------------------------------------------------------------------

function useCountdown(deadlineIso: string | null, intervalMs = 1000) {
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!deadlineIso) {
      setRemaining(0);
      return;
    }

    const update = () => setRemaining(getSlaRemainingSeconds(deadlineIso));
    update();

    timerRef.current = setInterval(update, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [deadlineIso, intervalMs]);

  return remaining;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const EmergencyStoppageBanner: React.FC<EmergencyStoppageBannerProps> = ({
  currentUserUpn,
  onReview,
  onDismiss,
  onEventRegistered,
  onEventUnregistered,
}) => {
  const [activeEvent, setActiveEvent] = useState<CriticalStoppageEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const remainingSeconds = useCountdown(
    activeEvent?.sla_deadline ?? null,
  );

  // Resolve current user UPN
  const userUpn =
    currentUserUpn ?? localStorage.getItem('user_upn') ?? '';

  // Handler for incoming WebSocket events
  const handleEvent = useCallback((event: CriticalStoppageEvent) => {
    // Evaluate delegation eligibility
    if (!isUserEligible(userUpn, event.cam_upn, event.delegatee_upn)) {
      return;
    }

    setActiveEvent(event);
    setVisible(true);
  }, [userUpn]);

  // Register event listener
  useEffect(() => {
    if (onEventRegistered) {
      onEventRegistered(handleEvent);
    }
    return () => {
      if (onEventUnregistered) {
        onEventUnregistered(handleEvent);
      }
    };
  }, [onEventRegistered, onEventUnregistered, handleEvent]);

  // Dismiss handler
  const handleDismiss = useCallback(() => {
    if (activeEvent) {
      onDismiss?.(activeEvent);
    }
    setVisible(false);
    setActiveEvent(null);
  }, [activeEvent, onDismiss]);

  // Review drawer handler
  const handleReview = useCallback(() => {
    if (activeEvent) {
      onReview?.(activeEvent);
    }
  }, [activeEvent, onReview]);

  if (!visible || !activeEvent) return null;

  const isSlaCritical = remainingSeconds > 0 && remainingSeconds < 3600; // Less than 1 hour
  const isSlaExpired = remainingSeconds <= 0;

  return (
    <div
      className={clsx(
        'fixed top-0 left-0 right-0 z-[100] flex items-start justify-center p-4',
        'animate-in slide-in-from-top',
      )}
      role="alert"
      aria-live="assertive"
    >
      {/* Pulsing red background overlay */}
      <div
        className={clsx(
          'absolute inset-0 pointer-events-none',
          isSlaExpired
            ? 'bg-red-950/90'
            : 'bg-gradient-to-b from-red-950/80 to-red-950/40',
        )}
        style={
          isSlaExpired
            ? {
                animation: 'pulse-opacity 2s ease-in-out infinite',
              }
            : undefined
        }
      />

      {/* Banner card */}
      <div
        className={clsx(
          'relative w-full max-w-4xl rounded-xl border-2 shadow-2xl',
          'bg-bg-ops-surface border-red-500',
          isSlaExpired && 'animate-pulse-border',
        )}
      >
        {/* Top accent bar */}
        <div
          className={clsx(
            'absolute top-0 left-0 right-0 h-1 rounded-t-lg',
            isSlaExpired
              ? 'bg-red-500'
              : isSlaCritical
              ? 'bg-amber-500'
              : 'bg-red-400',
          )}
        />

        <div className="p-4">
          {/* Header row */}
          <div className="flex items-start gap-3">
            {/* Alert icon */}
            <div
              className={clsx(
                'flex-shrink-0 mt-0.5 p-2 rounded-lg',
                isSlaExpired
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-red-900/40 text-red-400',
              )}
            >
              <AlertOctagon size={24} />
            </div>

            {/* Message body */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-sm font-bold uppercase tracking-wider text-red-400">
                  Critical Path Stoppage
                </h2>
                {isSlaExpired && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-red-500 text-white">
                    SLA Breached
                  </span>
                )}
              </div>

              <p className="text-base font-semibold text-text-ops-primary mb-1">
                {activeEvent.task_code} — {activeEvent.task_name}
              </p>

              <p className="text-sm text-text-ops-muted">
                Task is blocked. Escalated under delegated authority from{' '}
                <span className="font-medium text-text-ops-primary">
                  {activeEvent.delegator_upn}
                </span>
                .
              </p>

              {/* SLA countdown */}
              <div className="flex items-center gap-2 mt-2">
                <Clock
                  size={14}
                  className={clsx(
                    isSlaExpired
                      ? 'text-red-400'
                      : isSlaCritical
                      ? 'text-amber-400'
                      : 'text-sky-400',
                  )}
                />
                <span
                  className={clsx(
                    'text-sm font-mono font-semibold',
                    isSlaExpired
                      ? 'text-red-400'
                      : isSlaCritical
                      ? 'text-amber-400'
                      : 'text-text-ops-primary',
                  )}
                >
                  SLA remaining:{' '}
                  {formatCountdown(remainingSeconds)}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleReview}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors',
                  'bg-red-600 text-white hover:bg-red-500',
                  'focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-bg-ops-surface',
                )}
              >
                <PanelRightOpen size={14} />
                Review Stoppage Drawer
              </button>

              <button
                onClick={handleDismiss}
                className="p-1.5 rounded-lg text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
                title="Dismiss alert"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmergencyStoppageBanner;
