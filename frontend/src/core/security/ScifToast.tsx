/**
 * SCIF Toast Notification Component
 *
 * A minimal, classification-aware toast notification system for displaying
 * security alerts (e.g., clipboard data spill blocks, soft-lock warnings).
 *
 * Features
 * --------
 * - Stacks multiple toasts vertically at the bottom-right of the viewport.
 * - Auto-dismisses after a configurable timeout (default: 5 seconds).
 * - Supports classification-aware styling (red for SECRET spills, amber for warnings).
 * - Respects Low-Profile / Briefing Mode: when `data-low-profile="true"` is set
 *   on the document, toasts are suppressed and routed to a silent badge counter
 *   instead.
 *
 * Usage
 * ~~~~~
 *
 * .. code-block:: tsx
 *
 *   // In AppShell.tsx:
 *   <ScifToast toasts={toasts} onDismiss={dismissToast} />
 *
 *   // Trigger a toast:
 *   addToast({
 *     message: 'DATA SPILL BLOCKED: Cannot paste [SECRET] into [OFFICIAL] field',
 *     type: 'error',
 *   });
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { X, AlertTriangle, Shield, Info } from 'lucide-react';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Toast notification types.
 */
export type ToastType = 'error' | 'warning' | 'info' | 'success';

/**
 * A single toast notification.
 */
export interface ScifToastItem {
  /** Unique identifier for the toast. */
  id: string;

  /** The message to display. */
  message: string;

  /** Toast severity type. */
  type: ToastType;

  /** How long (ms) before auto-dismiss. Default: 5000. */
  duration?: number;
}

/**
 * Props for the ScifToast container.
 */
export interface ScifToastProps {
  /** Array of active toasts. */
  toasts: ScifToastItem[];

  /** Called when a toast is dismissed (manually or by timeout). */
  onDismiss: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Style Maps
// ---------------------------------------------------------------------------

const toastStyles: Record<ToastType, {
  bg: string;
  border: string;
  text: string;
  icon: React.ElementType;
}> = {
  error: {
    bg: 'bg-red-950/95',
    border: 'border-red-500',
    text: 'text-red-200',
    icon: AlertTriangle,
  },
  warning: {
    bg: 'bg-amber-950/95',
    border: 'border-amber-500',
    text: 'text-amber-200',
    icon: AlertTriangle,
  },
  info: {
    bg: 'bg-sky-950/95',
    border: 'border-sky-500',
    text: 'text-sky-200',
    icon: Info,
  },
  success: {
    bg: 'bg-emerald-950/95',
    border: 'border-emerald-500',
    text: 'text-emerald-200',
    icon: Shield,
  },
};

// ---------------------------------------------------------------------------
// Single Toast Component
// ---------------------------------------------------------------------------

interface SingleToastProps {
  toast: ScifToastItem;
  onDismiss: (id: string) => void;
}

/**
 * Individual toast notification with auto-dismiss timer.
 */
const SingleToast: React.FC<SingleToastProps> = ({ toast, onDismiss }) => {
  const { id, message, type, duration = 5000 } = toast;
  const style = toastStyles[type];
  const Icon = style.icon;
  const [progress, setProgress] = useState(100);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    startTimeRef.current = Date.now();

    // Animate progress bar
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        onDismiss(id);
      }
    }, 50);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [id, duration, onDismiss]);

  const handleDismiss = useCallback(() => {
    onDismiss(id);
  }, [id, onDismiss]);

  return (
    <div
      className={clsx(
        'flex items-start gap-3 px-4 py-3 rounded-lg border-l-4 shadow-xl',
        'backdrop-blur-sm min-w-[320px] max-w-md',
        'animate-slide-in-right',
        style.bg,
        style.border
      )}
      role="alert"
      aria-live="assertive"
    >
      {/* Icon */}
      <Icon className={clsx('w-5 h-5 flex-shrink-0 mt-0.5', style.text)} />

      {/* Message */}
      <p className={clsx('text-sm font-medium flex-1', style.text)}>
        {message}
      </p>

      {/* Dismiss Button */}
      <button
        onClick={handleDismiss}
        className={clsx(
          'flex-shrink-0 p-1 rounded-md transition-colors',
          'hover:bg-white/10',
          style.text
        )}
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Progress Bar */}
      <div
        className="absolute bottom-0 left-0 h-0.5 bg-white/20 rounded-b-lg"
        style={{ width: `${progress}%`, transition: 'width 50ms linear' }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Toast Container
// ---------------------------------------------------------------------------

/**
 * Toast notification container that stacks toasts at the bottom-right.
 *
 * When Low-Profile / Briefing Mode is active (`data-low-profile="true"`),
 * toasts are hidden and only a silent badge counter is shown.
 */
const ScifToast: React.FC<ScifToastProps> = ({ toasts, onDismiss }) => {
  // Check if low-profile mode is active
  const [isLowProfile, setIsLowProfile] = useState(false);

  useEffect(() => {
    const checkLowProfile = () => {
      setIsLowProfile(
        document.documentElement.getAttribute('data-low-profile') === 'true'
      );
    };

    checkLowProfile();

    // Listen for low-profile changes
    const handleMutation = (mutations: MutationRecord[]) => {
      for (const mutation of mutations) {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'data-low-profile'
        ) {
          checkLowProfile();
        }
      }
    };

    const observer = new MutationObserver(handleMutation);
    observer.observe(document.documentElement, { attributes: true });

    // Listen for scif:low-profile custom events
    const handleLowProfileEvent = () => checkLowProfile();
    window.addEventListener('scif:low-profile', handleLowProfileEvent);

    return () => {
      observer.disconnect();
      window.removeEventListener('scif:low-profile', handleLowProfileEvent);
    };
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  // In low-profile mode, show only a silent badge counter
  if (isLowProfile) {
    return (
      <div
        className="fixed bottom-4 right-4 z-[9998] flex items-center gap-2"
        aria-label={`${toasts.length} silent notifications`}
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-700 border border-gray-600">
          <span className="text-xs font-bold text-gray-200">
            {toasts.length}
          </span>
        </div>
      </div>
    );
  }

  // Normal mode: show full toast notifications
  return (
    <div
      className="fixed bottom-4 right-4 z-[9998] flex flex-col gap-2 items-end"
      aria-label="Security notifications"
    >
      {toasts.map((toast) => (
        <SingleToast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

export default ScifToast;
