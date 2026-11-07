/**
 * AgentReviewWorkbenchView — Human Reviewer Workbench for AI Agent Proposals
 *
 * Provides a dedicated interface for inspecting, approving, and rolling back
 * AI agent operations on the project schedule.
 *
 * Workflow
 * --------
 * 1. **Filter Sessions** — Use status filters to view PENDING_REVIEW,
 *    ACCEPTED_COMMITTED, REJECTED, or REVERTED sessions.
 * 2. **Inspect Sessions** — Click any session row to open the diff drawer
 *    showing side-by-side baseline vs proposed state.
 * 3. **Accept & Commit** — For PENDING_REVIEW sessions, commit the batch
 *    with dual-attribution audit logging.
 * 4. **Reject Proposal** — Discard a staged proposal without applying changes.
 * 5. **Revert Committed** — Even weeks or months later, revert a committed
 *    session with a mandatory justification narrative.
 *
 * @example
 * ```tsx
 * <AgentReviewWorkbenchView />
 * ```
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Bot,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  GitCommitHorizontal,
  Undo2,
  Eye,
  Shield,
  Clock,
  Hash,
  FileText,
  ChevronRight,
  AlertOctagon,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../services/api';
import AgentDiffDrawer from '../../components/agents/AgentDiffDrawer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProposalStatus = 'PENDING_REVIEW' | 'ACCEPTED_COMMITTED' | 'REJECTED' | 'REVERTED';

export interface AgentMutation {
  mutation_id: string;
  client_mutation_id: string;
  sequence_order: number;
  target_node_id: string;
  action_type: string;
  forward_delta: Record<string, unknown>;
  inverse_delta: Record<string, unknown>;
  topological_impact_summary: Record<string, unknown> | null;
  committed: boolean;
}

export interface AgentProposalSession {
  session_id: string;
  programme_id: string;
  agent_identifier: string;
  model_name: string;
  model_weights_hash: string;
  prompt_digest: string;
  status: ProposalStatus;
  created_at: string;
  resolved_at: string | null;
  reviewed_by_user_id: string | null;
  reversion_justification: string | null;
  mutations: AgentMutation[];
  mutation_count?: number;
}

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------

const statusConfig: Record<ProposalStatus, { label: string; icon: React.ReactNode; bg: string; text: string }> = {
  PENDING_REVIEW: {
    label: 'Pending Review',
    icon: <Clock size={14} />,
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-800 dark:text-amber-300',
  },
  ACCEPTED_COMMITTED: {
    label: 'Committed',
    icon: <CheckCircle2 size={14} />,
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    text: 'text-emerald-800 dark:text-emerald-300',
  },
  REJECTED: {
    label: 'Rejected',
    icon: <XCircle size={14} />,
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-800 dark:text-red-300',
  },
  REVERTED: {
    label: 'Reverted',
    icon: <Undo2 size={14} />,
    bg: 'bg-gray-100 dark:bg-gray-800/30',
    text: 'text-gray-800 dark:text-gray-300',
  },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Status filter pill button.
 */
interface StatusFilterProps {
  status: ProposalStatus;
  active: boolean;
  count: number;
  onClick: (status: ProposalStatus) => void;
}

const StatusFilter: React.FC<StatusFilterProps> = ({ status, active, count, onClick }) => {
  const config = statusConfig[status];
  return (
    <button
      type="button"
      onClick={() => onClick(status)}
      className={clsx(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
        active
          ? clsx(config.bg, config.text, 'ring-2 ring-offset-1 ring-blue-400 dark:ring-blue-500')
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
      )}
    >
      {config.icon}
      <span>{config.label}</span>
      <span
        className={clsx(
          'ml-1 px-1.5 py-0.5 text-xs rounded-full',
          active ? 'bg-black/10 dark:bg-white/10' : 'bg-black/5 dark:bg-white/5',
        )}
      >
        {count}
      </span>
    </button>
  );
};

/**
 * Confirmation modal for destructive actions.
 */
interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  variant: 'commit' | 'reject' | 'revert';
  justification?: string;
  onJustificationChange?: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  message,
  confirmLabel,
  variant,
  justification,
  onJustificationChange,
  onConfirm,
  onCancel,
  loading,
}) => {
  if (!open) return null;

  const variantStyles = {
    commit: 'border-emerald-300 dark:border-emerald-700',
    reject: 'border-red-300 dark:border-red-700',
    revert: 'border-amber-300 dark:border-amber-700',
  };

  const buttonStyles = {
    commit: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    reject: 'bg-red-600 hover:bg-red-700 text-white',
    revert: 'bg-amber-600 hover:bg-amber-700 text-white',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className={clsx(
          'w-full max-w-lg rounded-xl border bg-white dark:bg-gray-900 p-6 shadow-2xl',
          variantStyles[variant],
        )}
      >
        <div className="flex items-start gap-3">
          {variant === 'commit' && <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />}
          {variant === 'reject' && <XCircle className="mt-0.5 h-5 w-5 text-red-600" />}
          {variant === 'revert' && <AlertOctagon className="mt-0.5 h-5 w-5 text-amber-600" />}
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{message}</p>

            {variant === 'revert' && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Reversion Justification <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  rows={3}
                  placeholder="Explain why this agent action is being reverted..."
                  value={justification || ''}
                  onChange={(e) => onJustificationChange?.(e.target.value)}
                  required
                />
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || (variant === 'revert' && (!justification || !justification.trim()))}
            className={clsx(
              'px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2',
              buttonStyles[variant],
              (loading || (variant === 'revert' && (!justification || !justification.trim()))) &&
                'opacity-50 cursor-not-allowed',
            )}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main View
// ---------------------------------------------------------------------------

const AgentReviewWorkbenchView: React.FC = () => {
  // -- State --
  const [sessions, setSessions] = useState<AgentProposalSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | 'ALL'>('PENDING_REVIEW');

  // Selected session for diff drawer
  const [selectedSession, setSelectedSession] = useState<AgentProposalSession | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Action modals
  const [commitModal, setCommitModal] = useState<{ open: boolean; session: AgentProposalSession | null }>({ open: false, session: null });
  const [rejectModal, setRejectModal] = useState<{ open: boolean; session: AgentProposalSession | null }>({ open: false, session: null });
  const [revertModal, setRevertModal] = useState<{ open: boolean; session: AgentProposalSession | null; justification: string }>({ open: false, session: null, justification: '' });
  const [actionLoading, setActionLoading] = useState(false);

  // -- Data loading --

  const fetchSessions = useCallback(async (filter?: ProposalStatus) => {
    setLoading(true);
    setError(null);
    try {
      const url = filter
        ? `/api/v1/agents/sessions?status=${filter}`
        : '/api/v1/agents/sessions';
      const data = await api.get(url);
      setSessions(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load agent proposals';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions(statusFilter === 'ALL' ? undefined : statusFilter);
  }, [statusFilter, fetchSessions]);

  // -- Status counts --

  const statusCounts: Record<ProposalStatus, number> = {
    PENDING_REVIEW: 0,
    ACCEPTED_COMMITTED: 0,
    REJECTED: 0,
    REVERTED: 0,
  };
  sessions.forEach((s) => {
    if (statusCounts[s.status] !== undefined) {
      statusCounts[s.status]++;
    }
  });

  // -- Filtered sessions --

  const filteredSessions =
    statusFilter === 'ALL'
      ? sessions
      : sessions.filter((s) => s.status === statusFilter);

  // -- Row click: open diff drawer --

  const handleRowClick = useCallback(async (session: AgentProposalSession) => {
    // If we only have the summary list, fetch full details
    if (!session.mutations || session.mutations.length === 0) {
      try {
        const details: AgentProposalSession = await api.get(`/api/v1/agents/sessions/${session.session_id}`);
        setSelectedSession(details);
      } catch {
        setSelectedSession(session);
      }
    } else {
      setSelectedSession(session);
    }
    setDrawerOpen(true);
  }, []);

  // -- Actions --

  const handleCommit = useCallback(() => {
    if (!commitModal.session) return;
    setCommitModal((prev) => ({ ...prev, open: true }));
  }, [commitModal.session]);

  const handleReject = useCallback(() => {
    if (!commitModal.session) return;
    setRejectModal((prev) => ({ ...prev, open: true }));
  }, [commitModal.session]);

  const handleRevert = useCallback((session: AgentProposalSession) => {
    setRevertModal({ open: true, session, justification: '' });
  }, []);

  const executeCommit = useCallback(async () => {
    if (!commitModal.session) return;
    setActionLoading(true);
    try {
      await api.post(`/api/v1/agents/sessions/${commitModal.session.session_id}/commit`);
      await fetchSessions(statusFilter === 'ALL' ? undefined : statusFilter);
      setCommitModal({ open: false, session: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Commit failed';
      setError(message);
    } finally {
      setActionLoading(false);
    }
  }, [commitModal.session, fetchSessions, statusFilter]);

  const executeReject = useCallback(async () => {
    if (!rejectModal.session) return;
    setActionLoading(true);
    try {
      await api.post(`/api/v1/agents/sessions/${rejectModal.session.session_id}/reject`);
      await fetchSessions(statusFilter === 'ALL' ? undefined : statusFilter);
      setRejectModal({ open: false, session: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Reject failed';
      setError(message);
    } finally {
      setActionLoading(false);
    }
  }, [rejectModal.session, fetchSessions, statusFilter]);

  const executeRevert = useCallback(async () => {
    if (!revertModal.session || !revertModal.justification.trim()) return;
    setActionLoading(true);
    try {
      await api.post(
        `/api/v1/agents/sessions/${revertModal.session.session_id}/revert`,
        { justification: revertModal.justification },
      );
      await fetchSessions(statusFilter === 'ALL' ? undefined : statusFilter);
      setRevertModal({ open: false, session: null, justification: '' });
      setDrawerOpen(false);
      setSelectedSession(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Revert failed';
      setError(message);
    } finally {
      setActionLoading(false);
    }
  }, [revertModal, fetchSessions, statusFilter]);

  // -- Helpers --

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const truncateHash = (hash: string, len = 12) => {
    if (!hash) return '—';
    return hash.length > len ? `${hash.slice(0, len)}…` : hash;
  };

  const hasContractBaselineImpact = (session: AgentProposalSession) => {
    return session.mutations?.some((m) => {
      const impact = m.topological_impact_summary;
      return impact && ('contract_baseline_hit' in impact || 'milestone_impact' in impact);
    });
  };

  const getProposedDateDelta = (session: AgentProposalSession) => {
    let maxDelta = 0;
    session.mutations?.forEach((m) => {
      const fd = m.forward_delta;
      const inv = m.inverse_delta;
      if (fd && inv) {
        ['planned_start_date', 'planned_end_date'].forEach((key) => {
          if (fd[key] && inv[key]) {
            const diff = Math.abs(new Date(fd[key] as string).getTime() - new Date(inv[key] as string).getTime());
            const days = Math.round(diff / (1000 * 60 * 60 * 24));
            if (days > maxDelta) maxDelta = days;
          }
        });
      }
    });
    return maxDelta;
  };

  // -- Render --

  return (
    <div className="flex h-full flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
            <Bot size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Agent Proposal Review
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Inspect, approve, and rollback AI agent schedule operations
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fetchSessions(statusFilter === 'ALL' ? undefined : statusFilter)}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <Loader2 size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Status Filters */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-3">
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400 mr-2">Filter:</span>
        <StatusFilter
          status="PENDING_REVIEW"
          active={statusFilter === 'PENDING_REVIEW'}
          count={statusCounts.PENDING_REVIEW}
          onClick={setStatusFilter}
        />
        <StatusFilter
          status="ACCEPTED_COMMITTED"
          active={statusFilter === 'ACCEPTED_COMMITTED'}
          count={statusCounts.ACCEPTED_COMMITTED}
          onClick={setStatusFilter}
        />
        <StatusFilter
          status="REJECTED"
          active={statusFilter === 'REJECTED'}
          count={statusCounts.REJECTED}
          onClick={setStatusFilter}
        />
        <StatusFilter
          status="REVERTED"
          active={statusFilter === 'REVERTED'}
          count={statusCounts.REVERTED}
          onClick={setStatusFilter}
        />
        <button
          type="button"
          onClick={() => setStatusFilter('ALL')}
          className={clsx(
            'ml-2 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors',
            statusFilter === 'ALL'
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
              : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
          )}
        >
          All ({sessions.length})
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-6 py-3">
          <AlertTriangle size={16} className="text-red-600" />
          <span className="text-sm text-red-800 dark:text-red-300">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-red-600 hover:text-red-800 dark:hover:text-red-200"
          >
            <XCircle size={16} />
          </button>
        </div>
      )}

      {/* Session Table */}
      <div className="flex-1 overflow-auto">
        {loading && sessions.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <Loader2 size={32} className="animate-spin" />
              <span className="text-sm">Loading agent proposals...</span>
            </div>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <Bot size={48} className="opacity-30" />
              <span className="text-sm">No agent proposals found</span>
            </div>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 font-medium">Session ID</th>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Model &amp; Weights</th>
                <th className="px-4 py-3 font-medium">Prompt Digest</th>
                <th className="px-4 py-3 font-medium">Mutations</th>
                <th className="px-4 py-3 font-medium">Date Delta</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {filteredSessions.map((session) => {
                const config = statusConfig[session.status];
                const contractWarning = hasContractBaselineImpact(session);
                const dateDelta = getProposedDateDelta(session);

                return (
                  <tr
                    key={session.session_id}
                    className="bg-white dark:bg-gray-950 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer transition-colors"
                    onClick={() => handleRowClick(session)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Hash size={14} className="text-gray-400" />
                        <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                          {truncateHash(session.session_id, 8)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Bot size={14} className="text-violet-500" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {session.agent_identifier}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-700 dark:text-gray-300">
                          {session.model_name}
                        </span>
                        <span className="font-mono text-[10px] text-gray-400">
                          {truncateHash(session.model_weights_hash)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[10px] text-gray-400">
                        {truncateHash(session.prompt_digest)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-300">
                        {session.mutation_count || session.mutations?.length || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {dateDelta > 0 ? (
                        <span className={clsx(
                          'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',
                          dateDelta > 7
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
                        )}>
                          {dateDelta > 0 ? '+' : ''}{dateDelta}d
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={clsx(
                          'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
                          config.bg,
                          config.text,
                        )}
                      >
                        {config.icon}
                        {config.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(session.created_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleRowClick(session)}
                          title="Inspect diff"
                          className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                        >
                          <Eye size={16} />
                        </button>

                        {session.status === 'PENDING_REVIEW' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setCommitModal({ open: true, session });
                              }}
                              title="Accept & commit"
                              className="p-1.5 rounded-lg text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                            >
                              <CheckCircle2 size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectModal({ open: true, session });
                              }}
                              title="Reject proposal"
                              className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              <XCircle size={16} />
                            </button>
                          </>
                        )}

                        {session.status === 'ACCEPTED_COMMITTED' && (
                          <button
                            type="button"
                            onClick={() => handleRevert(session)}
                            title="Revert agent action"
                            className="p-1.5 rounded-lg text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                          >
                            <Undo2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Contract Baseline Warning Banner */}
      {selectedSession && hasContractBaselineImpact(selectedSession) && (
        <div className="flex items-center gap-3 border-t border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-6 py-3">
          <Shield size={18} className="text-amber-600" />
          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Contract Baseline Warning: This proposal affects approved B₀ milestones.
          </span>
        </div>
      )}

      {/* Diff Drawer */}
      <AgentDiffDrawer
        open={drawerOpen}
        session={selectedSession}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedSession(null);
        }}
      />

      {/* Commit Confirmation Modal */}
      <ConfirmModal
        open={commitModal.open}
        title="Accept & Commit Proposals"
        message={`This will apply ${commitModal.session?.mutation_count || commitModal.session?.mutations?.length || 0} mutations to the live schedule. The action will be logged with dual-attribution forensic provenance.`}
        confirmLabel="Accept & Commit"
        variant="commit"
        onConfirm={executeCommit}
        onCancel={() => setCommitModal({ open: false, session: null })}
        loading={actionLoading}
      />

      {/* Reject Confirmation Modal */}
      <ConfirmModal
        open={rejectModal.open}
        title="Reject Proposal"
        message={`This will discard all ${rejectModal.session?.mutation_count || rejectModal.session?.mutations?.length || 0} staged mutations. No changes will be applied.`}
        confirmLabel="Reject Proposal"
        variant="reject"
        onConfirm={executeReject}
        onCancel={() => setRejectModal({ open: false, session: null })}
        loading={actionLoading}
      />

      {/* Revert Confirmation Modal */}
      <ConfirmModal
        open={revertModal.open}
        title={`Revert Agent Session`}
        message={`This will restore ${revertModal.session?.mutation_count || revertModal.session?.mutations?.length || 0} tasks to their prior state. The schedule will be rolled back to the state before this agent action was committed.`}
        confirmLabel="Revert Agent Action"
        variant="revert"
        justification={revertModal.justification}
        onJustificationChange={(value) =>
          setRevertModal((prev) => ({ ...prev, justification: value }))
        }
        onConfirm={executeRevert}
        onCancel={() => setRevertModal({ open: false, session: null, justification: '' })}
        loading={actionLoading}
      />
    </div>
  );
};

export default AgentReviewWorkbenchView;
