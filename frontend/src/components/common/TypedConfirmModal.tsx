/**
 * Typed Intent Confirmation Modal
 *
 * Replaces generic "OK / Cancel" prompts for destructive and high-consequence
 * operations with a typed confirmation dialog that enforces operator intent.
 *
 * Operations Requiring Typed Confirmation
 * ----------------------------------------
 *
 * - Freezing Baseline 0 (B₀): Irreversible snapshot of the WBS hierarchy.
 * - Executing an Emergency Classified Spillage Purge: Multi-sig redaction of
 *   contaminated content.
 * - Cold-storage permanent programme sealing: WORM archival with cryptographic
 *   signing.
 * - Applying resource leveling plan: Shifts task dates across the schedule.
 * - Merging sandbox scenario to live: Commits What-If branch changes.
 *
 * Modal Mechanics
 * ---------------
 *
 * 1. Display a bold summary of the irreversible consequences.
 * 2. Require the operator to type the specific target identifier into an input
 *    field (e.g., "FREEZE-B0-RADAR" or the Programme Code) before the
 *    destructive action button enables.
 * 3. Enforce a 3-second disabled delay on the confirm button to prevent
 *    automated double-click submissions.
 * 4. Show a countdown timer during the delay period.
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    const [confirmOpen, setConfirmOpen] = useState(false);
 *
 *    const handleFreeze = async () => {
 *      const confirmed = await showTypedConfirm({
 *        title: 'Freeze Baseline 0',
 *        description: 'This will create an irreversible snapshot...',
 *        requiredInput: 'FREEZE-B0-RADAR',
 *        confirmLabel: 'Freeze Baseline',
 *        dangerLevel: 'high',
 *      });
 *
 *      if (confirmed) {
 *        await api.post('/api/v1/baselines/freeze', ...);
 *      }
 *    };
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertTriangle,
  X,
  ShieldAlert,
  Lock,
  Archive,
  GitMerge,
  Save,
} from 'lucide-react';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Severity level of the destructive operation.
 */
export type DangerLevel = 'medium' | 'high' | 'critical';

/**
 * Configuration for a typed confirmation dialog.
 */
export interface TypedConfirmConfig {
  /** Dialog title */
  title: string;
  /** Detailed description of the consequences */
  description: string;
  /**
   * The exact string the operator must type to enable the confirm button.
   * E.g., "FREEZE-B0-RADAR" or the programme code.
   */
  requiredInput: string;
  /** Placeholder text shown in the input field */
  inputPlaceholder?: string;
  /** Label for the confirm button */
  confirmLabel: string;
  /** Danger level styling */
  dangerLevel?: DangerLevel;
  /**
   * Duration of the disabled delay in seconds (default: 3).
   * Prevents automated double-click submissions.
   */
  delaySeconds?: number;
  /** Optional icon override */
  icon?: React.ReactNode;
}

/**
 * Result of the typed confirmation.
 */
export interface TypedConfirmResult {
  /** Whether the operator confirmed the action */
  confirmed: boolean;
  /** The typed input value (for audit logging) */
  typedValue: string;
}

// ---------------------------------------------------------------------------
// Icon Mapping
// ---------------------------------------------------------------------------

/**
 * Default icons for common operation types.
 */
const OPERATION_ICONS: Record<string, React.ReactNode> = {
  baseline: <Save className="w-6 h-6" />,
  spillage: <ShieldAlert className="w-6 h-6" />,
  seal: <Archive className="w-6 h-6" />,
  merge: <GitMerge className="w-6 h-6" />,
  leveling: <AlertTriangle className="w-6 h-6" />,
  default: <Lock className="w-6 h-6" />,
};

// ---------------------------------------------------------------------------
// Danger Level Styles
// ---------------------------------------------------------------------------

const DANGER_STYLES: Record<DangerLevel, {
  border: string;
  bg: string;
  button: string;
  badge: string;
  iconColor: string;
}> = {
  medium: {
    border: 'border-amber-500',
    bg: 'bg-amber-500/10',
    button: 'bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800',
    badge: 'bg-amber-500/20 text-amber-400',
    iconColor: 'text-amber-400',
  },
  high: {
    border: 'border-red-500',
    bg: 'red-500/10',
    button: 'bg-red-600 hover:bg-red-500 disabled:bg-red-800',
    badge: 'bg-red-500/20 text-red-400',
    iconColor: 'text-red-400',
  },
  critical: {
    border: 'border-red-600',
    bg: 'bg-red-600/10',
    button: 'bg-red-700 hover:bg-red-600 disabled:bg-red-900',
    badge: 'bg-red-600/20 text-red-300',
    iconColor: 'text-red-300',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TypedConfirmModal: React.FC<{
  /** Confirmation configuration */
  config: TypedConfirmConfig | null;
  /** Called when the operator confirms or cancels */
  onResult: (result: TypedConfirmResult) => void;
  /** Called to close the modal without confirming */
  onClose: () => void;
}> = ({ config, onResult, onClose }) => {
  const [typedValue, setTypedValue] = useState('');
  const [delayRemaining, setDelayRemaining] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  const [hasStartedTyping, setHasStartedTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dangerLevel = config?.dangerLevel ?? 'high';
  const delaySeconds = config?.delaySeconds ?? 3;
  const styles = DANGER_STYLES[dangerLevel];

  // Check if the typed value matches the required input
  const isMatch = config ? typedValue === config.requiredInput : false;

  // Determine if the confirm button should be enabled
  const canConfirm = config && isMatch && delayRemaining === 0;

  // Auto-focus the input when the modal opens
  useEffect(() => {
    if (config && inputRef.current) {
      // Small delay to ensure the modal is rendered
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [config]);

  // Start the countdown timer when the input matches
  useEffect(() => {
    if (isMatch && delayRemaining === 0 && hasStartedTyping) {
      // Input matches — start the delay countdown
      setDelayRemaining(delaySeconds);

      timerRef.current = setInterval(() => {
        setDelayRemaining((prev) => {
          if (prev <= 1) {
            // Countdown complete
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    // Reset timer if match changes
    if (!isMatch && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      setDelayRemaining(0);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isMatch, delaySeconds, hasStartedTyping]);

  // Handle input changes
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTypedValue(value);
    if (value.length > 0 && !hasStartedTyping) {
      setHasStartedTyping(true);
    }
  }, [hasStartedTyping]);

  // Handle confirm action
  const handleConfirm = useCallback(() => {
    if (!canConfirm || !config) return;
    onResult({ confirmed: true, typedValue: config.requiredInput });
  }, [canConfirm, config, onResult]);

  // Handle cancel action
  const handleCancel = useCallback(() => {
    onResult({ confirmed: false, typedValue });
    onClose();
  }, [onResult, typedValue, onClose]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
    if (e.key === 'Enter' && canConfirm) {
      handleConfirm();
    }
  }, [handleCancel, handleConfirm, canConfirm]);

  // Reset state when config changes
  useEffect(() => {
    if (config) {
      setTypedValue('');
      setDelayRemaining(0);
      setInputFocused(false);
      setHasStartedTyping(false);
    }
  }, [config]);

  if (!config) return null;

  // Get the appropriate icon
  const icon = config.icon || OPERATION_ICONS.default;

  // Calculate match percentage for visual feedback
  const matchLength = config.requiredInput.substring(0, typedValue.length) === typedValue
    ? typedValue.length
    : 0;
  const matchPercentage = (matchLength / config.requiredInput.length) * 100;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="typed-confirm-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleCancel}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className={clsx(
          'relative w-full max-w-lg mx-4 rounded-lg shadow-2xl border-2',
          'bg-bg-ops-surface',
          styles.border,
        )}
      >
        {/* Danger Level Badge */}
        <div className="flex items-center justify-between px-6 pt-4 pb-2">
          <span className={clsx(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider',
            styles.badge,
          )}>
            <AlertTriangle className="w-3.5 h-3.5" />
            {dangerLevel} Severity
          </span>
          <button
            type="button"
            onClick={handleCancel}
            className="text-text-ops-muted hover:text-text-ops-primary transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Icon & Title */}
        <div className="px-6 pt-2">
          <div className="flex items-start gap-4">
            <div className={clsx('flex-shrink-0 mt-1', styles.iconColor)}>
              {icon}
            </div>
            <div className="flex-1">
              <h2
                id="typed-confirm-title"
                className="text-lg font-bold text-text-ops-primary"
              >
                {config.title}
              </h2>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="px-6 py-4">
          <p className="text-sm text-text-ops-muted leading-relaxed">
            {config.description}
          </p>
        </div>

        {/* Typed Input Section */}
        <div className="px-6 pb-4">
          <label
            htmlFor="typed-confirm-input"
            className="block text-xs font-medium text-text-ops-muted mb-2 uppercase tracking-wider"
          >
            Type to Confirm
          </label>

          <div className="relative">
            <input
              ref={inputRef}
              id="typed-confirm-input"
              type="text"
              value={typedValue}
              onChange={handleInputChange}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={config.inputPlaceholder || config.requiredInput}
              className={clsx(
                'w-full rounded-md px-4 py-3 text-sm font-mono',
                'border-2 bg-bg-ops-base text-text-ops-primary',
                'placeholder:text-text-ops-muted/50',
                'focus:outline-none focus:ring-2 focus:ring-blue-500/50',
                inputFocused ? 'border-blue-500' : 'border-border-ops-subtle',
                isMatch && 'border-green-500',
              )}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />

            {/* Match indicator overlay */}
            {typedValue.length > 0 && !isMatch && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <span className="text-xs text-amber-400">
                  {Math.round(matchPercentage)}%
                </span>
              </div>
            )}

            {/* Success checkmark */}
            {isMatch && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <span className="text-green-400 text-lg">✓</span>
              </div>
            )}
          </div>

          {/* Required value hint */}
          <p className="mt-2 text-xs text-text-ops-muted">
            Required: <code className="font-mono text-amber-400">{config.requiredInput}</code>
          </p>

          {/* Match progress bar */}
          <div className="mt-2 h-1 rounded-full bg-bg-ops-overlay overflow-hidden">
            <div
              className={clsx(
                'h-full transition-all duration-200 rounded-full',
                isMatch ? 'bg-green-500' : 'bg-amber-500',
              )}
              style={{ width: `${matchPercentage}%` }}
            />
          </div>
        </div>

        {/* Delay Countdown */}
        {isMatch && delayRemaining > 0 && (
          <div className="px-6 pb-4">
            <div className={clsx(
              'flex items-center gap-3 rounded-md px-4 py-3',
              styles.bg,
            )}>
              <Lock className={clsx('w-5 h-5 flex-shrink-0', styles.iconColor)} />
              <div className="flex-1">
                <p className="text-sm font-medium text-text-ops-primary">
                  Safety Delay Active
                </p>
                <p className="text-xs text-text-ops-muted">
                  Please wait {delayRemaining} second{delayRemaining !== 1 ? 's' : ''} before confirming...
                </p>
              </div>
              <span className="text-2xl font-bold font-mono text-text-ops-primary">
                {delayRemaining}
              </span>
            </div>

            {/* Countdown progress bar */}
            <div className="mt-2 h-1 rounded-full bg-bg-ops-overlay overflow-hidden">
              <div
                className={clsx(
                  'h-full transition-all duration-1000 ease-linear rounded-full',
                  styles.button.replace('bg-', 'bg-').split(' ')[0],
                )}
                style={{ width: `${((delaySeconds - delayRemaining) / delaySeconds) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-ops-subtle">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 rounded-md text-sm font-medium text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={clsx(
              'px-6 py-2 rounded-md text-sm font-bold text-white transition-all',
              styles.button,
              'disabled:cursor-not-allowed',
              canConfirm && 'animate-pulse',
            )}
          >
            {isMatch && delayRemaining > 0
              ? `${config.confirmLabel} (${delayRemaining}s)`
              : config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Hook: showTypedConfirm
// ---------------------------------------------------------------------------

/**
 * Result type for the promise-based confirmation API.
 */
type ConfirmPromise = (result: TypedConfirmResult) => void;

/**
 * Global state for the typed confirmation dialog.
 * This allows the modal to be rendered at the app root while being
 * triggered from any component.
 */
let currentConfig: TypedConfirmConfig | null = null;
let currentResolver: ConfirmPromise | null = null;

/**
 * Show a typed confirmation dialog and wait for the result.
 *
 * @param config - Configuration for the confirmation dialog
 * @returns Promise that resolves with the confirmation result
 *
 * @example
 * ```tsx
 * const result = await showTypedConfirm({
 *   title: 'Freeze Baseline 0',
 *   description: 'This will create an irreversible snapshot...',
 *   requiredInput: 'FREEZE-B0-RADAR',
 *   confirmLabel: 'Freeze Baseline',
 *   dangerLevel: 'high',
 * });
 *
 * if (result.confirmed) {
 *   // Proceed with the action
 * }
 * ```
 */
export function showTypedConfirm(config: TypedConfirmConfig): Promise<TypedConfirmResult> {
  return new Promise((resolve) => {
    currentConfig = config;
    currentResolver = resolve;
  });
}

/**
 * Hook that provides the typed confirmation modal state for rendering at the app root.
 *
 * @returns Object containing the modal config and handlers
 */
export function useTypedConfirm() {
  const [config, setConfig] = useState<TypedConfirmConfig | null>(null);

  // Expose the show function globally
  useEffect(() => {
    // Override the global showTypedConfirm to use React state
    const originalShow = showTypedConfirm;

    // We use a mutation observer pattern: the global function sets currentConfig,
    // and we poll for changes
    const pollInterval = setInterval(() => {
      if (currentConfig && !config) {
        setConfig(currentConfig);
      }
    }, 50);

    return () => clearInterval(pollInterval);
  }, [config]);

  const handleResult = useCallback((result: TypedConfirmResult) => {
    if (currentResolver) {
      currentResolver(result);
      currentResolver = null;
    }
    currentConfig = null;
    setConfig(null);
  }, []);

  const handleClose = useCallback(() => {
    if (currentResolver) {
      currentResolver({ confirmed: false, typedValue: '' });
      currentResolver = null;
    }
    currentConfig = null;
    setConfig(null);
  }, []);

  return {
    config,
    handleResult,
    handleClose,
  };
}

/**
 * Component that renders the typed confirmation modal at the app root.
 * Import and place this in your AppShell or root layout.
 */
const TypedConfirmProvider: React.FC = () => {
  const { config, handleResult, handleClose } = useTypedConfirm();

  if (!config) return null;

  return (
    <TypedConfirmModal
      config={config}
      onResult={handleResult}
      onClose={handleClose}
    />
  );
};

// ---------------------------------------------------------------------------
// Preset Configurations
// ---------------------------------------------------------------------------

/**
 * Pre-configured confirmation templates for common operations.
 */
export const CONFIRM_PRESETS = {
  /**
   * Freeze Baseline 0 (B₀) confirmation.
   */
  freezeBaseline: (baselineCode: string): TypedConfirmConfig => ({
    title: 'Freeze Performance Measurement Baseline',
    description: `This will create an irreversible snapshot of the current WBS hierarchy as baseline "${baselineCode}". All subsequent schedule changes will be measured against this frozen state. A BaselineChangeRequest (BCR) will be required to modify the baseline.`,
    requiredInput: `FREEZE-${baselineCode.toUpperCase()}`,
    inputPlaceholder: `Type FREEZE-${baselineCode.toUpperCase()}`,
    confirmLabel: 'Freeze Baseline',
    dangerLevel: 'high',
    icon: OPERATION_ICONS.baseline,
  }),

  /**
   * Emergency Classified Spillage Purge confirmation.
   */
  spillagePurge: (ticketRef: string): TypedConfirmConfig => ({
    title: 'Emergency Classified Spillage Purge',
    description: `This will surgically redact contaminated content across all affected entities. The operation requires multi-signature administrative authorization. All purged content will be replaced with "[PURGED UNDER CLASSIFIED SPILLAGE PROTOCOL - REF: ${ticketRef}]". This action creates an unalterable SPILLAGE_REDACTION_CERTIFICATE in the ForensicAuditLog.`,
    requiredInput: `PURGE-${ticketRef.toUpperCase()}`,
    inputPlaceholder: `Type PURGE-${ticketRef.toUpperCase()}`,
    confirmLabel: 'Execute Purge',
    dangerLevel: 'critical',
    icon: OPERATION_ICONS.spillage,
    delaySeconds: 5,
  }),

  /**
   * Cold-storage permanent programme sealing confirmation.
   */
  sealProgramme: (programmeCode: string): TypedConfirmConfig => ({
    title: 'Permanent Programme Sealing',
    description: `This will permanently seal programme "${programmeCode}" for cold-storage archival. All nodes will be set to read-only, a cryptographic SHA-256 manifest will be generated, and the programme will be exported to WORM storage. This action is irreversible.`,
    requiredInput: `SEAL-${programmeCode.toUpperCase()}`,
    inputPlaceholder: `Type SEAL-${programmeCode.toUpperCase()}`,
    confirmLabel: 'Seal Programme',
    dangerLevel: 'critical',
    icon: OPERATION_ICONS.seal,
    delaySeconds: 5,
  }),

  /**
   * Merge sandbox scenario to live confirmation.
   */
  mergeSandbox: (scenarioName: string): TypedConfirmConfig => ({
    title: 'Merge Sandbox to Live Schedule',
    description: `This will commit all changes from sandbox scenario "${scenarioName}" into the live operational schedule. A CPM forward/backward recalculation will be triggered, and a SANDBOX_MERGE entry will be recorded in the ForensicAuditLog.`,
    requiredInput: `MERGE-${scenarioName.toUpperCase().replace(/\s+/g, '-')}`,
    inputPlaceholder: `Type MERGE-${scenarioName.toUpperCase().replace(/\s+/g, '-')}`,
    confirmLabel: 'Merge to Live',
    dangerLevel: 'high',
    icon: OPERATION_ICONS.merge,
  }),

  /**
   * Apply resource leveling plan confirmation.
   */
  applyLeveling: (projectId: string): TypedConfirmConfig => ({
    title: 'Apply Resource Leveling Plan',
    description: `This will commit the proposed date shifts to the live schedule for project "${projectId}". Non-critical tasks will be delayed within their float window. If milestone breaches are detected, contractual delivery dates may be affected.`,
    requiredInput: `LEVEL-${projectId.substring(0, 8).toUpperCase()}`,
    inputPlaceholder: `Type LEVEL-${projectId.substring(0, 8).toUpperCase()}`,
    confirmLabel: 'Apply Leveling',
    dangerLevel: 'medium',
    icon: OPERATION_ICONS.leveling,
  }),
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default TypedConfirmModal;
export { TypedConfirmProvider };
