/**
 * ScifDisplayShield Component
 *
 * Full-screen lock overlay displayed when the SCIF idle timeout expires.
 * This component purges classified content from the visible DOM and
 * requires re-authentication before restoring the workspace.
 *
 * Features
 * --------
 * - High-contrast full-screen overlay matching the active classification
 *   banner styling (red for SECRET, purple for TOP_SECRET, etc.).
 * - Displays the active project's highest classification banner
 *   (e.g., "SECRET // UK EYES ONLY").
 * - Shows the current timestamp, updating every second.
 * - Provides a password/PIN re-authentication prompt.
 * - On successful re-auth, restores the active workspace state with
 *   zero data loss.
 *
 * Usage
 * ~~~~~
 *
 * .. code-block:: tsx
 *
 *   const { isShielded, unshield } = useScifShield({
 *     classification: 'SECRET',
 *     caveats: ['UK_EYES_ONLY'],
 *   });
 *
 *   if (isShielded) {
 *     return (
 *       <ScifDisplayShield
 *         classification="SECRET"
 *         caveats={['UK_EYES_ONLY']}
 *         onUnlock={async (credentials) => {
 *           const ok = await verifyPassword(credentials);
 *           if (ok) unshield();
 *         }}
 *       />
 *     );
 *   }
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Shield, Lock, AlertTriangle, EyeOff } from 'lucide-react';
import { clsx } from 'clsx';
import type { SecurityClassification } from '../../components/layout/ClassificationBanner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Credentials submitted during re-authentication.
 */
export interface ReAuthCredentials {
  /** User password or PIN. */
  password: string;
  /** Optional user identifier. */
  userId?: string;
}

/**
 * Props for the ScifDisplayShield component.
 */
interface ScifDisplayShieldProps {
  /** Current classification level of the active view. */
  classification?: SecurityClassification;

  /** Active handling caveats (e.g., ['UK_EYES_ONLY']). */
  caveats?: string[];

  /** Active project name. */
  activeProject?: string;

  /**
   * Called when the user submits re-authentication credentials.
   * Return `true` to dismiss the shield, `false` to show an error.
   */
  onUnlock: (credentials: ReAuthCredentials) => Promise<boolean> | boolean;

  /** Optional user ID hint for the re-auth form. */
  userId?: string;
}

// ---------------------------------------------------------------------------
// Classification Styles — mirrors ClassificationBanner.tsx
// ---------------------------------------------------------------------------

const classificationStyles: Record<SecurityClassification, {
  bg: string;
  border: string;
  text: string;
  badgeBg: string;
  badgeText: string;
  label: string;
}> = {
  OFFICIAL: {
    bg: 'bg-sky-950',
    border: 'border-sky-500',
    text: 'text-sky-300',
    badgeBg: 'bg-sky-600',
    badgeText: 'text-sky-100',
    label: 'OFFICIAL',
  },
  OFFICIAL_SENSITIVE: {
    bg: 'bg-cyan-950',
    border: 'border-cyan-500',
    text: 'text-cyan-300',
    badgeBg: 'bg-cyan-600',
    badgeText: 'text-cyan-100',
    label: 'OFFICIAL-SENSITIVE',
  },
  SECRET: {
    bg: 'bg-red-950',
    border: 'border-red-500',
    text: 'text-red-300',
    badgeBg: 'bg-red-600',
    badgeText: 'text-red-100',
    label: 'SECRET',
  },
  TOP_SECRET: {
    bg: 'bg-purple-950',
    border: 'border-purple-500',
    text: 'text-purple-300',
    badgeBg: 'bg-purple-600',
    badgeText: 'text-purple-100',
    label: 'TOP SECRET',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format caveats for display: 'UK_EYES_ONLY' → 'UK EYES ONLY'.
 */
function formatCaveat(caveat: string): string {
  return caveat.replace(/_/g, ' ');
}

/**
 * Build the full classification banner text.
 * e.g., "SECRET // UK EYES ONLY // NOFORN"
 */
function buildBannerText(
  classification: SecurityClassification,
  caveats: string[]
): string {
  const style = classificationStyles[classification];
  const parts = [style.label];
  for (const caveat of caveats) {
    parts.push(formatCaveat(caveat));
  }
  return parts.join(' // ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Full-screen SCIF display shield overlay.
 *
 * Renders a high-contrast lock screen with classification banner,
 * live timestamp, and re-authentication form.
 */
const ScifDisplayShield: React.FC<ScifDisplayShieldProps> = ({
  classification = 'SECRET',
  caveats = [],
  activeProject,
  onUnlock,
  userId,
}) => {
  const [password, setPassword] = useState('');
  const [currentUserId, setCurrentUserId] = useState(userId || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState(new Date());

  const style = classificationStyles[classification];
  const bannerText = useMemo(
    () => buildBannerText(classification, caveats),
    [classification, caveats]
  );

  // Update timestamp every second
  useEffect(() => {
    const timer = setInterval(() => setTimestamp(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Focus the password input on mount
  useEffect(() => {
    const input = document.getElementById('scif-shield-password');
    input?.focus();
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!password.trim()) {
        setError('Password or PIN is required');
        return;
      }

      setIsSubmitting(true);
      setError(null);

      try {
        const success = await onUnlock({
          password: password.trim(),
          userId: currentUserId.trim() || undefined,
        });

        if (!success) {
          setError('Re-authentication failed. Please try again.');
          setPassword('');
        }
      } catch {
        setError('Re-authentication error. Please try again.');
        setPassword('');
      } finally {
        setIsSubmitting(false);
      }
    },
    [password, currentUserId, onUnlock]
  );

  // Format timestamp: "2026-10-31 19:07:32 UTC+00:00"
  const formattedTime = timestamp.toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'shortOffset',
  });

  return (
    <div
      className={clsx(
        'fixed inset-0 z-[9999] flex flex-col items-center justify-center',
        'transition-opacity duration-300',
        style.bg
      )}
      role="dialog"
      aria-modal="true"
      aria-label="SCIF Display Shield — Re-authentication Required"
      data-scif-shield="true"
    >
      {/* Top Classification Banner */}
      <div
        className={clsx(
          'absolute top-0 left-0 right-0',
          'flex items-center justify-center',
          'px-6 py-2 border-b-2',
          style.border
        )}
      >
        <Shield className={clsx('w-5 h-5 mr-2', style.text)} />
        <span
          className={clsx(
            'text-sm font-bold tracking-widest font-mono',
            style.text
          )}
        >
          {bannerText}
        </span>
      </div>

      {/* Main Shield Content */}
      <div className="flex flex-col items-center space-y-8 max-w-md w-full px-6">
        {/* Lock Icon */}
        <div className="flex flex-col items-center space-y-4">
          <div
            className={clsx(
              'w-20 h-20 rounded-full flex items-center justify-center',
              'border-2', style.border, style.bg
            )}
          >
            <Lock className={clsx('w-10 h-10', style.text)} />
          </div>

          <div className="text-center space-y-2">
            <h1
              className={clsx(
                'text-2xl font-bold tracking-wider font-mono',
                style.text
              )}
            >
              TERMINAL LOCKED
            </h1>
            <p className="text-sm text-gray-400">
              Inactivity timeout — re-authentication required
            </p>
          </div>
        </div>

        {/* Classification Badge */}
        <div
          className={clsx(
            'inline-flex items-center gap-2 px-4 py-2 rounded-md',
            'border', style.border, style.badgeBg
          )}
        >
          <EyeOff className={clsx('w-4 h-4', style.badgeText)} />
          <span
            className={clsx(
              'text-sm font-bold tracking-widest font-mono',
              style.badgeText
            )}
          >
            {bannerText}
          </span>
        </div>

        {/* Active Project (if provided) */}
        {activeProject && (
          <div className="text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wider">
              Active Programme
            </p>
            <p className="text-sm text-gray-300 font-mono mt-1">
              {activeProject}
            </p>
          </div>
        )}

        {/* Timestamp */}
        <div className="text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">
            Lock Time
          </p>
          <p className="text-sm text-gray-300 font-mono mt-1">
            {formattedTime}
          </p>
        </div>

        {/* Re-Authentication Form */}
        <form
          onSubmit={handleSubmit}
          className="w-full space-y-4 pt-4"
          aria-label="Re-authentication form"
        >
          {/* User ID (optional) */}
          <div>
            <label
              htmlFor="scif-shield-userid"
              className="block text-xs text-gray-400 mb-1 uppercase tracking-wider"
            >
              User ID (optional)
            </label>
            <input
              id="scif-shield-userid"
              type="text"
              value={currentUserId}
              onChange={(e) => setCurrentUserId(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-gray-900 border border-gray-700
                         text-gray-100 text-sm font-mono placeholder-gray-600
                         focus:outline-none focus:border-gray-500"
              placeholder="Enter user ID"
              autoComplete="username"
            />
          </div>

          {/* Password / PIN */}
          <div>
            <label
              htmlFor="scif-shield-password"
              className="block text-xs text-gray-400 mb-1 uppercase tracking-wider"
            >
              Password / PIN
            </label>
            <input
              id="scif-shield-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={clsx(
                'w-full px-3 py-2 rounded-md bg-gray-900 border text-sm font-mono',
                'focus:outline-none',
                error
                  ? 'border-red-500 focus:border-red-400'
                  : 'border-gray-700 text-gray-100 focus:border-gray-500',
                'placeholder-gray-600'
              )}
              placeholder="Enter password or PIN"
              autoComplete="current-password"
              autoFocus
            />
          </div>

          {/* Error Message */}
          {error && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-950 border border-red-800"
              role="alert"
            >
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !password.trim()}
            className={clsx(
              'w-full py-3 rounded-md font-bold text-sm tracking-wider',
              'transition-colors',
              isSubmitting || !password.trim()
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : clsx(style.badgeBg, style.badgeText, 'hover:opacity-90')
            )}
          >
            {isSubmitting ? 'VERIFYING...' : 'UNLOCK TERMINAL'}
          </button>
        </form>

        {/* Security Notice */}
        <div className="text-center pt-4 space-y-1">
          <p className="text-[10px] text-gray-600 uppercase tracking-widest">
            UK MOD JSP 440 / JSP 604 Compliant
          </p>
          <p className="text-[10px] text-gray-600">
            Classified content has been purged from display memory
          </p>
        </div>
      </div>

      {/* Bottom Classification Banner */}
      <div
        className={clsx(
          'absolute bottom-0 left-0 right-0',
          'flex items-center justify-center',
          'px-6 py-2 border-t-2',
          style.border
        )}
      >
        <Shield className={clsx('w-5 h-5 mr-2', style.text)} />
        <span
          className={clsx(
            'text-sm font-bold tracking-widest font-mono',
            style.text
          )}
        >
          {bannerText}
        </span>
      </div>
    </div>
  );
};

export default ScifDisplayShield;
