/**
 * Conflict Resolution Modal
 *
 * Interactive dialog displayed when the server returns HTTP 409 Conflict
 * due to a concurrent modification.  The user sees a side-by-side diff
 * of their local edits versus the server's current state, and chooses
 * one of three resolution strategies:
 *
 * 1. **Overwrite (Force Take)** — Re-submit the local edits using the
 *    latest version_id from the server.
 * 2. **Discard & Reload** — Abandon local edits and replace them with
 *    the server's current state.
 * 3. **Keep Both / Fork** — Create a parallel sub-task to preserve the
 *    user's input without overwriting the server state.
 *
 * The modal uses the military dark theme tokens (bg-ops-surface,
 * border-ops-strong) and includes a red warning banner at the top.
 */

import React, { useMemo } from 'react';
import {
  AlertTriangle,
  GitMerge,
  RotateCcw,
  Save,
  GitBranch,
  User,
  Clock,
  Hash,
} from 'lucide-react';
import { clsx } from 'clsx';
import { ConcurrencyConflict, ConflictResolution } from '../../types/concurrency';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConflictResolutionModalProps {
  /** The conflict payload from the server */
  conflict: ConcurrencyConflict;

  /** The user's local (unsaved) edits that caused the conflict */
  localEdits: Record<string, unknown>;

  /**
   * Called when the user chooses a resolution strategy.
   * Returns the chosen strategy so the caller can act on it.
   */
  onResolve: (resolution: ConflictResolution) => void;

  /** Close the modal without resolving (cancel) */
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the fields that differ between local edits and server state.
 */
function computeDiff(
  local: Record<string, unknown>,
  server: Record<string, unknown>,
): { field: string; localValue: string; serverValue: string }[] {
  const allKeys = new Set([
    ...Object.keys(local),
    ...Object.keys(server),
  ]);

  const diffs: { field: string; localValue: string; serverValue: string }[] = [];

  for (const key of allKeys) {
    const localVal = local[key];
    const serverVal = server[key];

    // Skip internal fields that shouldn't be shown in the diff
    if (['id', 'created_at', 'updated_at', 'version_id', 'is_masked'].includes(key)) {
      continue;
    }

    const localStr = localVal !== undefined ? String(localVal) : '(empty)';
    const serverStr = serverVal !== undefined ? String(serverVal) : '(empty)';

    if (localStr !== serverStr) {
      diffs.push({ field: key, localValue: localStr, serverValue: serverStr });
    }
  }

  return diffs;
}

/**
 * Format a field name for display (snake_case → Title Case).
 */
function formatFieldName(field: string): string {
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  conflict,
  localEdits,
  onResolve,
  onCancel,
}) => {
  const { entity_id, expected_version, current_database_version, conflicting_user_upn, message } = conflict;

  const serverState = conflict.current_state as Record<string, unknown> || {};
  const diffs = useMemo(() => computeDiff(localEdits, serverState), [localEdits, serverState]);

  const handleResolve = (resolution: ConflictResolution) => {
    onResolve(resolution);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal Content */}
      <div className="relative z-[110] w-full max-w-4xl max-h-[90vh] mx-4 rounded-lg border border-ops-strong shadow-2xl bg-bg-ops-surface overflow-hidden flex flex-col">

        {/* Warning Banner */}
        <div className="flex items-center gap-3 px-6 py-4 bg-red-900/30 border-b border-red-500/40">
          <AlertTriangle className="text-red-400 flex-shrink-0" size={24} />
          <div className="flex-1 min-w-0">
            <h2
              id="conflict-modal-title"
              className="text-lg font-semibold text-red-400"
            >
              Concurrent Modification Conflict
            </h2>
            <p className="text-sm text-text-ops-muted truncate">{message}</p>
          </div>
          <button
            onClick={onCancel}
            className="text-text-ops-muted hover:text-text-ops-primary transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Conflict Metadata */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-6 py-4 border-b border-ops-subtle">
          <div className="flex items-center gap-2">
            <Hash size={14} className="text-text-ops-muted flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-text-ops-muted">Entity ID</div>
              <div className="text-sm font-mono truncate">{entity_id}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <GitMerge size={14} className="text-text-ops-muted flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-text-ops-muted">Your Version</div>
              <div className="text-sm font-mono">
                {expected_version ?? 'unknown'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-text-ops-muted flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-text-ops-muted">Server Version</div>
              <div className="text-sm font-mono">
                {current_database_version ?? 'unknown'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <User size={14} className="text-text-ops-muted flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-text-ops-muted">Modified By</div>
              <div className="text-sm truncate">{conflicting_user_upn}</div>
            </div>
          </div>
        </div>

        {/* Side-by-Side Diff */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {diffs.length > 0 ? (
            <div className="grid grid-cols-3 gap-0 text-xs">
              {/* Headers */}
              <div className="px-3 py-2 font-semibold text-text-ops-muted border-b border-ops-subtle">
                Field
              </div>
              <div className="px-3 py-2 font-semibold text-amber-400 border-b border-ops-subtle">
                Your Edits
              </div>
              <div className="px-3 py-2 font-semibold text-sky-400 border-b border-ops-subtle">
                Server State (Committed)
              </div>

              {/* Diff Rows */}
              {diffs.map((diff, idx) => (
                <React.Fragment key={diff.field}>
                  <div
                    className={clsx(
                      'px-3 py-2 border-b border-ops-subtle text-text-ops-muted font-medium',
                      idx % 2 === 0 && 'bg-bg-ops-overlay/30',
                    )}
                  >
                    {formatFieldName(diff.field)}
                  </div>
                  <div
                    className={clsx(
                      'px-3 py-2 border-b border-ops-subtle text-amber-300/80 font-mono text-xs truncate',
                      idx % 2 === 0 && 'bg-bg-ops-overlay/30',
                    )}
                    title={diff.localValue}
                  >
                    {diff.localValue}
                  </div>
                  <div
                    className={clsx(
                      'px-3 py-2 border-b border-ops-subtle text-sky-300/80 font-mono text-xs truncate',
                      idx % 2 === 0 && 'bg-bg-ops-overlay/30',
                    )}
                    title={diff.serverValue}
                  >
                    {diff.serverValue}
                  </div>
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-text-ops-muted">
              <GitMerge size={32} className="mx-auto mb-2 opacity-50" />
              <p>No detectable differences between your edits and server state.</p>
              <p className="text-sm mt-1">The version counter was incremented by another user.</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t border-ops-subtle bg-bg-ops-overlay/50">
          {/* Option 1: Overwrite */}
          <button
            onClick={() => handleResolve('OVERWRITE')}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-red-600/20 border border-red-500/40 text-red-400 hover:bg-red-600/30 transition-colors text-sm"
            title="Force-submit your edits, overwriting the server state"
          >
            <Save size={16} />
            Overwrite (Force Take)
          </button>

          {/* Option 2: Discard */}
          <button
            onClick={() => handleResolve('DISCARD')}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-amber-600/20 border border-amber-500/40 text-amber-400 hover:bg-amber-600/30 transition-colors text-sm"
            title="Discard your edits and reload the server state"
          >
            <RotateCcw size={16} />
            Discard & Reload
          </button>

          {/* Option 3: Fork */}
          <button
            onClick={() => handleResolve('FORK')}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-sky-600/20 border border-sky-500/40 text-sky-400 hover:bg-sky-600/30 transition-colors text-sm"
            title="Create a parallel sub-task to preserve your input"
          >
            <GitBranch size={16} />
            Keep Both / Fork
          </button>

          {/* Cancel */}
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-md text-text-ops-muted hover:text-text-ops-primary transition-colors text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConflictResolutionModal;
