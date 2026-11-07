/**
 * Delegate Stoppage Resolution Drawer
 *
 * Side drawer that displays full details of a critical path stoppage escalated
 * under delegated authority. Provides the resolution workflow with dual-attribution
 * acknowledgment controls.
 *
 * Sections
 * --------
 * 1. Blocker Root Cause — category, severity, description
 * 2. Operational Impact — impacted hours, driving path status (TF ≤ 0)
 * 3. Evidence Files — attached evidence documents
 * 4. Delegation Context — delegator, delegatee, CAM chain
 * 5. Resolution Controls — disposition notes + Acknowledge & Clear button
 *
 * Resolution Flow
 * ---------------
 * - Text area for technical disposition notes
 * - Primary action button [Acknowledge & Clear Impediment]:
 *   - Prompts for confirmation that the user is acting under delegated authority
 *   - Calls POST /api/v1/clashes/blockers/{id}/resolve
 *   - Transmits `acting_delegate_upn` in the request body
 *
 * Data source: POST /api/v1/clashes/blockers/{id}/resolve
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  X,
  AlertTriangle,
  FileText,
  Clock,
  GitBranch,
  Paperclip,
  UserCheck,
  ShieldCheck,
  CheckCircle2,
  ChevronRight,
  AlertOctagon,
  MessageSquareText,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../services/api';
import type { CriticalStoppageEvent } from '../common/EmergencyStoppageBanner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DelegateStoppageDrawerProps {
  /** The stoppage event data driving the drawer */
  event: CriticalStoppageEvent | null;
  /** Whether the drawer is open */
  isOpen: boolean;
  /** Called to close the drawer */
  onClose: () => void;
  /** Called after a successful resolution */
  onResolved?: (blockerId: string) => void;
  /** Current user's UPN */
  currentUserUpn?: string;
}

interface ResolveRequest {
  disposition_notes: string;
  acting_delegate_upn: string;
  resolved_by_role: 'cam' | 'delegatee';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map blocker category to display label and icon.
 */
function getCategoryDisplay(category: string): { label: string; icon: React.ReactNode } {
  const map: Record<string, { label: string; icon: React.ReactNode }> = {
    DEPENDENCY_OVERDUE: { label: 'Dependency Overdue', icon: <GitBranch size={14} /> },
    RESOURCE_UNAVAILABLE: { label: 'Resource Unavailable', icon: <UserCheck size={14} /> },
    CLEARANCE_HOLD: { label: 'Clearance Hold', icon: <ShieldCheck size={14} /> },
    FACILITY_MAINTENANCE: { label: 'Facility Maintenance', icon: <AlertTriangle size={14} /> },
    OPERATIONAL_IMPEDIMENT: { label: 'Operational Impediment', icon: <AlertOctagon size={14} /> },
  };
  return (
    map[category] ?? { label: category, icon: <AlertTriangle size={14} /> }
  );
}

/**
 * Format ISO date for display.
 */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DelegateStoppageDrawer: React.FC<DelegateStoppageDrawerProps> = ({
  event,
  isOpen,
  onClose,
  onResolved,
  currentUserUpn,
}) => {
  const [dispositionNotes, setDispositionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset state when drawer opens/closes
  useEffect(() => {
    if (isOpen && event) {
      setDispositionNotes('');
      setError(null);
      setSuccess(false);
      setConfirmOpen(false);
    }
  }, [isOpen, event?.blocker_id]);

  // Focus notes area on open
  useEffect(() => {
    if (isOpen && !success && notesRef.current) {
      notesRef.current.focus();
    }
  }, [isOpen, success]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmOpen) {
          setConfirmOpen(false);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, confirmOpen]);

  // Determine resolved-by role
  const userUpn = currentUserUpn ?? localStorage.getItem('user_upn') ?? '';
  const resolvedByRole: 'cam' | 'delegatee' =
    event && event.cam_upn.trim().toLowerCase() === userUpn.trim().toLowerCase()
      ? 'cam'
      : 'delegatee';

  // Resolve handler
  const handleResolve = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!event || !dispositionNotes.trim()) {
        setError('Disposition notes are required');
        return;
      }

      setSubmitting(true);
      setError(null);

      try {
        const request: ResolveRequest = {
          disposition_notes: dispositionNotes.trim(),
          acting_delegate_upn: userUpn,
          resolved_by_role: resolvedByRole,
        };

        await api.post(
          `/clashes/blockers/${event.blocker_id}/resolve`,
          request,
        );

        setSuccess(true);
        setTimeout(() => {
          onClose();
          onResolved?.(event.blocker_id);
        }, 2000);
      } catch (err: any) {
        const msg =
          err?.response?.data?.detail || 'Failed to resolve stoppage';
        setError(typeof msg === 'string' ? msg : 'Failed to resolve stoppage');
      } finally {
        setSubmitting(false);
      }
    },
    [event, dispositionNotes, userUpn, resolvedByRole, onClose, onResolved],
  );

  // Confirmation dialog handler
  const handleConfirmResolve = useCallback(() => {
    setConfirmOpen(true);
  }, []);

  const handleExecuteResolve = useCallback(() => {
    setConfirmOpen(false);
    // Create a synthetic form event to trigger the resolve
    handleResolve({ preventDefault: () => {} } as React.FormEvent);
  }, [handleResolve]);

  if (!isOpen || !event) return null;

  const isCriticalPath = event.driving_path_tf <= 0;
  const categoryDisplay = getCategoryDisplay(event.root_cause.split(':')[0] || event.root_cause);

  return (
    <div
      className="fixed inset-0 z-[90] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stoppage-drawer-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={clsx(
          'relative w-full max-w-lg ml-auto h-full flex flex-col',
          'bg-bg-ops-surface border-l border-border-ops-subtle shadow-2xl',
          'animate-in slide-in-from-right',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-ops-subtle">
          <div className="flex items-center gap-3">
            <span className="text-red-400">
              <AlertOctagon size={20} />
            </span>
            <div>
              <h2
                id="stoppage-drawer-title"
                className="text-base font-semibold text-text-ops-primary"
              >
                Delegate Stoppage Resolution
              </h2>
              <p className="text-xs text-text-ops-muted">
                {event.task_code}: {event.task_name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Success state */}
        {success ? (
          <div className="flex flex-col items-center justify-center flex-1 p-8 gap-3">
            <CheckCircle2 size={48} className="text-emerald-400" />
            <span className="text-lg font-semibold text-text-ops-primary">
              Stoppage Resolved
            </span>
            <span className="text-sm text-text-ops-muted text-center">
              Impediment cleared under delegated authority.
              Audit trail recorded.
            </span>
          </div>
        ) : (
          /* Scrollable content */
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
            {/* 1. Blocker Root Cause */}
            <section>
              <h3 className="text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-3">
                Blocker Root Cause
              </h3>
              <div className="rounded-lg border border-border-ops-subtle bg-bg-ops-base p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-amber-400">
                    {categoryDisplay.icon}
                  </span>
                  <span className="text-sm font-medium text-text-ops-primary">
                    {categoryDisplay.label}
                  </span>
                </div>
                <p className="text-sm text-text-ops-muted leading-relaxed">
                  {event.root_cause}
                </p>
                <div className="mt-2 flex items-center gap-4 text-xs text-text-ops-muted">
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    Escalated: {formatDate(event.escalated_at)}
                  </span>
                </div>
              </div>
            </section>

            {/* 2. Operational Impact */}
            <section>
              <h3 className="text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-3">
                Operational Impact
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {/* Impact Hours */}
                <div className="rounded-lg border border-border-ops-subtle bg-bg-ops-base p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock size={14} className="text-amber-400" />
                    <span className="text-xs text-text-ops-muted">
                      Impact Hours
                    </span>
                  </div>
                  <span className="text-xl font-bold text-text-ops-primary">
                    {event.operational_impact_hours}
                  </span>
                  <span className="text-xs text-text-ops-muted ml-1">hrs</span>
                </div>

                {/* Driving Path Status */}
                <div
                  className={clsx(
                    'rounded-lg border p-3',
                    isCriticalPath
                      ? 'border-red-500/50 bg-red-900/20'
                      : 'border-border-ops-subtle bg-bg-ops-base',
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <GitBranch
                      size={14}
                      className={isCriticalPath ? 'text-red-400' : 'text-text-ops-muted'}
                    />
                    <span className="text-xs text-text-ops-muted">
                      Driving Path TF
                    </span>
                  </div>
                  <span
                    className={clsx(
                      'text-xl font-bold',
                      isCriticalPath ? 'text-red-400' : 'text-text-ops-primary',
                    )}
                  >
                    {event.driving_path_tf}
                  </span>
                  <span className="text-xs text-text-ops-muted ml-1">days</span>

                  {isCriticalPath && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-red-400 font-medium">
                      <AlertTriangle size={10} />
                      Critical path — no float remaining
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* 3. Evidence Files */}
            {event.evidence_files.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-3">
                  Evidence Files
                </h3>
                <div className="flex flex-col gap-2">
                  {event.evidence_files.map((file, idx) => (
                    <a
                      key={idx}
                      href={file}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={clsx(
                        'flex items-center gap-2 p-2 rounded-lg border',
                        'border-border-ops-subtle bg-bg-ops-base',
                        'hover:border-border-ops-strong transition-colors',
                      )}
                    >
                      <Paperclip size={14} className="text-text-ops-muted" />
                      <span className="text-sm text-text-ops-primary truncate">
                        {file.split('/').pop() || file}
                      </span>
                      <ChevronRight size={12} className="ml-auto text-text-ops-muted flex-shrink-0" />
                    </a>
                  ))}
                </div>
              </section>
            )}

            {/* 4. Delegation Context */}
            <section>
              <h3 className="text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-3">
                Delegation Context
              </h3>
              <div className="rounded-lg border border-border-ops-subtle bg-bg-ops-base p-3">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-ops-muted">
                      Delegator
                    </span>
                    <span className="text-sm font-medium text-text-ops-primary">
                      {event.delegator_upn}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-ops-muted">
                      Delegatee (you)
                    </span>
                    <span className="text-sm font-medium text-text-ops-primary">
                      {event.delegatee_upn}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-ops-muted">
                      CAM
                    </span>
                    <span className="text-sm font-medium text-text-ops-primary">
                      {event.cam_upn}
                    </span>
                  </div>
                  <div className="mt-1 pt-2 border-t border-border-ops-subtle">
                    <div className="flex items-center gap-2 text-xs text-text-ops-muted">
                      <ShieldCheck size={12} className="text-sky-400" />
                      Acting as:{' '}
                      <span className="font-medium text-text-ops-primary">
                        {resolvedByRole === 'cam'
                          ? 'Contract Administrator (CAM)'
                          : 'Delegated Authority'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 5. Resolution Controls */}
            <section>
              <h3 className="text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-3">
                Resolution
              </h3>

              <form onSubmit={handleResolve} className="flex flex-col gap-3">
                {/* Disposition notes */}
                <div>
                  <label
                    htmlFor="disposition-notes"
                    className="flex items-center gap-2 text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-2"
                  >
                    <MessageSquareText size={12} />
                    Technical Disposition Notes
                  </label>
                  <textarea
                    ref={notesRef}
                    id="disposition-notes"
                    value={dispositionNotes}
                    onChange={(e) => setDispositionNotes(e.target.value)}
                    placeholder="Describe the resolution action taken under delegated authority..."
                    rows={4}
                    className={clsx(
                      'w-full px-3 py-2 text-sm rounded-lg border resize-none',
                      'bg-bg-ops-base border-border-ops-subtle text-text-ops-primary',
                      'placeholder:text-text-ops-muted/50',
                      'focus:outline-none focus:border-red-500',
                    )}
                  />
                  <p className="mt-1 text-[10px] text-text-ops-muted">
                    Required. This will be recorded in the forensic audit trail.
                  </p>
                </div>

                {/* Error message */}
                {error && (
                  <div className="flex items-center gap-2 p-2 rounded bg-red-900/30 border border-red-500/40 text-red-400 text-xs">
                    <AlertTriangle size={12} />
                    {error}
                  </div>
                )}

                {/* Action button */}
                <button
                  type="button"
                  onClick={handleConfirmResolve}
                  disabled={submitting || !dispositionNotes.trim()}
                  className={clsx(
                    'flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors',
                    'bg-red-600 text-white hover:bg-red-500',
                    'disabled:opacity-30 disabled:cursor-not-allowed',
                    'focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-bg-ops-surface',
                  )}
                >
                  {submitting ? (
                    'Resolving...'
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      Acknowledge & Clear Impediment
                    </>
                  )}
                </button>

                <p className="text-[10px] text-text-ops-muted text-center">
                  This action will be attributed to your delegated authority and
                  recorded in the audit log.
                </p>
              </form>
            </section>
          </div>
        )}

        {/* Confirmation Dialog Overlay */}
        {confirmOpen && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div
              className={clsx(
                'w-full max-w-sm mx-4 rounded-xl border shadow-2xl p-6',
                'bg-bg-ops-surface border-border-ops-subtle',
              )}
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-amber-400">
                  <ShieldCheck size={20} />
                </span>
                <h3 className="text-base font-semibold text-text-ops-primary">
                  Confirm Delegated Authority
                </h3>
              </div>

              <p className="text-sm text-text-ops-muted mb-4 leading-relaxed">
                You are about to resolve this stoppage acting under{' '}
                <span className="font-medium text-text-ops-primary">
                  delegated authority
                </span>{' '}
                from{' '}
                <span className="font-medium text-text-ops-primary">
                  {event.delegator_upn}
                </span>
                . This action will be permanently recorded in the forensic audit
                trail.
              </p>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmOpen(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-border-ops-subtle text-text-ops-muted hover:bg-bg-ops-overlay transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteResolve}
                  disabled={submitting}
                  className={clsx(
                    'flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors',
                    'bg-red-600 text-white hover:bg-red-500',
                    'disabled:opacity-30 disabled:cursor-not-allowed',
                  )}
                >
                  {submitting ? (
                    'Resolving...'
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      Confirm & Resolve
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DelegateStoppageDrawer;
