/**
 * Restore Previous Session Modal
 *
 * Shown after login when the user has saved session state from a previous
 * session, including detached (popped-out) windows. The modal offers to
 * fully restore the previous workspace state, including reopening detached
 * windows in new browser windows.
 *
 * Features
 * --------
 *
 * - **Detached window summary** — Shows how many windows were open and
 *   what views they contained.
 * - **Session timestamp** — Displays when the previous session ended.
 * - **Per-view state summary** — Lists the tabs that had saved state.
 * - **Restore options** — User can choose to restore everything, only the
 *   main workspace, or dismiss and start fresh.
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    <RestoreSessionModal
 *      open={showRestoreModal}
 *      onClose={() => setShowRestoreModal(false)}
 *    />
 */

import React, { useMemo } from 'react';
import { X, Monitor, LayoutGrid, ExternalLink, Clock, RotateCcw } from 'lucide-react';
import { useSessionStateStore, type DetachedWindowRecord } from '../../stores/useSessionStateStore';
import { useWorkspaceStore, getViewMetadata } from '../../stores/useWorkspaceStore';
import { useDisplayStore } from '../../stores/useDisplayStore';
import { getWindowSync } from '../../utils/windowSync';
import type { SessionStateOverrides } from '../../stores/useSessionStateStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RestoreSessionModalProps {
  /** Whether the modal is visible */
  open: boolean;
  /** Called when the modal is dismissed */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const RestoreSessionModal: React.FC<RestoreSessionModalProps> = ({ open, onClose }) => {
  const detachedWindows = useSessionStateStore((s) => s.detachedWindows);
  const clearDetachedWindows = useSessionStateStore((s) => s.clearDetachedWindows);
  const perViewState = useSessionStateStore((s) => s.perViewState);
  const tabs = useWorkspaceStore((s) => s.tabs);

  // Format the last session timestamp
  const lastSessionSave = useMemo(() => {
    const displayStore = useDisplayStore.getState();
    const overrides = displayStore.settings.viewStateOverrides as SessionStateOverrides | undefined;
    return overrides?.last_session_save;
  }, []);

  const lastSessionTime = useMemo(() => {
    if (!lastSessionSave) return '';
    const date = new Date(lastSessionSave);
    return date.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }, [lastSessionSave]);

  // Count unique view types in detached windows
  const detachedViewTypes = useMemo(() => {
    const types = new Map<string, number>();
    for (const win of detachedWindows) {
      types.set(win.viewType, (types.get(win.viewType) || 0) + 1);
    }
    return types;
  }, [detachedWindows]);

  // Count tabs with saved per-view state
  const tabsWithState = useMemo(() => {
    let count = 0;
    for (const tab of tabs) {
      if (perViewState[tab.id]) {
        count++;
      }
    }
    return count;
  }, [tabs, perViewState]);

  const hasDetachedWindows = detachedWindows.length > 0;
  const hasSavedViewState = Object.keys(perViewState).length > 0;

  if (!open) return null;

  const handleRestoreAll = () => {
    // Restore detached windows by opening new browser windows
    if (hasDetachedWindows) {
      const sync = getWindowSync();
      for (const record of detachedWindows) {
        try {
          sync.popOutView({
            viewType: record.viewType as any,
            projectId: record.projectId || '',
            zoomLevel: record.viewState?.ganttZoom || 'WEEKS',
            selectedNodeId: record.viewState?.selectedNodeId || null,
            filterTokens: record.viewState?.filterTokens || '',
            filterMode: record.viewState?.filterMode || 'FILTER',
            authToken: localStorage.getItem('authToken') || '',
            apiBaseUrl: window.location.origin,
          });
        } catch (err) {
          console.warn('Failed to restore detached window:', err);
        }
      }
    }

    // Clear the detached window records so they don't show again
    clearDetachedWindows();
    onClose();
  };

  const handleRestoreWorkspaceOnly = () => {
    // Just clear detached windows without reopening them
    clearDetachedWindows();
    onClose();
  };

  const handleDismiss = () => {
    // Clear everything and start fresh
    clearDetachedWindows();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-session-title"
    >
      <div className="w-full max-w-lg bg-bg-ops-surface border border-border-ops-subtle rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
          <div className="flex items-center gap-3">
            <RotateCcw className="w-5 h-5 text-blue-400" />
            <h2
              id="restore-session-title"
              className="text-lg font-semibold text-text-ops-primary"
            >
              Restore Previous Session
            </h2>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 rounded-md text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-text-ops-muted">
            You have saved state from a previous session. Would you like to restore it?
          </p>

          {lastSessionTime && (
            <div className="flex items-center gap-2 text-xs text-text-ops-muted">
              <Clock className="w-3.5 h-3.5" />
              <span>Last session: {lastSessionTime}</span>
            </div>
          )}

          {/* Workspace State Summary */}
          {hasSavedViewState && (
            <div className="rounded-md border border-border-ops-subtle bg-bg-ops-overlay p-4 space-y-3">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-text-ops-primary">
                  Workspace State
                </span>
              </div>
              <div className="text-xs text-text-ops-muted space-y-1">
                <p>
                  {tabs.length} tab{tabs.length !== 1 ? 's' : ''} in workspace layout
                </p>
                {tabsWithState > 0 && (
                  <p>
                    {tabsWithState} tab{tabsWithState !== 1 ? 's' : ''} with saved scroll, zoom,
                    and filter state
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Detached Windows Summary */}
          {hasDetachedWindows && (
            <div className="rounded-md border border-border-ops-subtle bg-bg-ops-overlay p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-text-ops-primary">
                  Detached Windows
                </span>
              </div>
              <div className="text-xs text-text-ops-muted space-y-1">
                <p>
                  {detachedWindows.length} popped-out window{detachedWindows.length !== 1 ? 's' : ''}{' '}
                  from your last session
                </p>
                {Array.from(detachedViewTypes.entries()).map(([viewType, count]) => {
                  const meta = getViewMetadata(viewType as any);
                  return (
                    <div key={viewType} className="flex items-center gap-2 pl-2">
                      <ExternalLink className="w-3 h-3" />
                      <span>
                        {count}× {meta?.label || viewType}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* What will be restored */}
          <div className="rounded-md border border-border-ops-subtle bg-bg-ops-overlay p-4">
            <p className="text-xs text-text-ops-muted leading-relaxed">
              <strong className="text-text-ops-primary">Restoring will replay:</strong> Your open
              tabs, split pane layout, scroll positions, Gantt zoom levels, selected items, active
              filters, and column configurations.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-ops-subtle bg-bg-ops-overlay">
          <button
            type="button"
            onClick={handleDismiss}
            className="px-4 py-2 text-sm font-medium text-text-ops-muted hover:text-text-ops-primary rounded-md hover:bg-bg-ops-surface transition-colors"
          >
            Start Fresh
          </button>

          {hasDetachedWindows && (
            <button
              type="button"
              onClick={handleRestoreWorkspaceOnly}
              className="px-4 py-2 text-sm font-medium text-text-ops-muted hover:text-text-ops-primary rounded-md hover:bg-bg-ops-surface transition-colors"
            >
              Workspace Only
            </button>
          )}

          <button
            type="button"
            onClick={handleRestoreAll}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            {hasDetachedWindows ? 'Restore Everything' : 'Restore Session'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RestoreSessionModal;
