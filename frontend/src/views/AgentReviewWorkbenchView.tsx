/** Agent Review Workbench — Cherry-pick individual mutations from staged agent proposals. Data: /api/v1/agents/* */
import React, { useState, useEffect, useCallback } from 'react';
import { CheckSquare, Square, Send, RefreshCw, GitMerge, XCircle } from 'lucide-react';
import api from '../services/api';

interface Mutation {
  mutation_id: string;
  client_mutation_id: string;
  sequence_order: number;
  target_node_id: string;
  action_type: string;
  forward_delta: Record<string, any>;
  inverse_delta: Record<string, any>;
  topological_impact_summary?: Record<string, any>;
  committed: boolean;
}

interface Session {
  session_id: string;
  programme_id: string;
  agent_identifier: string;
  model_name: string;
  model_weights_hash: string;
  prompt_digest: string;
  status: string;
  created_at?: string;
  resolved_at?: string;
  reviewed_by_user_id?: number;
  reversion_justification?: string;
  mutations: Mutation[];
}

const AgentReviewWorkbenchView: React.FC = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [message, setMessage] = useState('');

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get('/api/v1/agents/sessions');
      setSessions(d.data || []);
    } catch (e) {
      console.error(e);
      setMessage('Failed to load sessions.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSession = useCallback(async (sessionId: string) => {
    setLoading(true);
    try {
      const d = await api.get(`/api/v1/agents/sessions/${sessionId}`);
      setSelectedSession(d.data);
      setApprovedIds(new Set(d.data.mutations.map((m: Mutation) => m.mutation_id)));
      setMessage('');
    } catch (e) {
      console.error(e);
      setMessage('Failed to load session details.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const toggleMutation = (mutationId: string) => {
    setApprovedIds(prev => {
      const next = new Set(prev);
      if (next.has(mutationId)) next.delete(mutationId);
      else next.add(mutationId);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedSession) {
      setApprovedIds(new Set(selectedSession.mutations.map(m => m.mutation_id)));
    }
  };

  const deselectAll = () => {
    setApprovedIds(new Set());
  };

  const handleSelectiveCommit = async () => {
    if (!selectedSession) return;
    setCommitting(true);
    setMessage('');
    try {
      const approved = Array.from(approvedIds);
      await api.post(
        `/api/v1/agents/sessions/${selectedSession.session_id}/commit-selective?reviewer_user_id=1`,
        { approved_mutation_ids: approved }
      );
      setMessage(`Committed ${approved.length} mutation(s), discarded ${selectedSession.mutations.length - approved.length}.`);
      setSelectedSession(null);
      fetchSessions();
    } catch (e: any) {
      console.error(e);
      setMessage(e.response?.data?.detail || 'Commit failed.');
    } finally {
      setCommitting(false);
    }
  };

  const handleFullCommit = async () => {
    if (!selectedSession) return;
    setCommitting(true);
    setMessage('');
    try {
      await api.post(
        `/api/v1/agents/sessions/${selectedSession.session_id}/commit?reviewer_user_id=1`
      );
      setMessage('Full commit successful.');
      setSelectedSession(null);
      fetchSessions();
    } catch (e: any) {
      console.error(e);
      setMessage(e.response?.data?.detail || 'Commit failed.');
    } finally {
      setCommitting(false);
    }
  };

  if (loading && !selectedSession) return (
    <div className="flex items-center justify-center h-full text-text-ops-muted">Loading agent sessions...</div>
  );

  if (selectedSession) {
    const impactSummary = (m: Mutation) => {
      if (!m.topological_impact_summary) return '';
      const fc = m.topological_impact_summary.float_consumption;
      const affected = m.topological_impact_summary.affected_successors?.length || 0;
      return fc > 0 ? `Float: +${fc}d, ${affected} successors` : `${affected} successors`;
    };

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
          <div className="flex items-center gap-3">
            <GitMerge className="w-6 h-6 text-blue-400" />
            <div>
              <h1 className="text-lg font-semibold text-text-ops-primary">Agent Review Workbench</h1>
              <p className="text-sm text-text-ops-muted">
                Agent: {selectedSession.agent_identifier} | Model: {selectedSession.model_name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedSession(null)} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 px-6 py-2 border-b border-border-ops-subtle bg-bg-ops-surface">
          <button onClick={selectAll} className="text-xs px-2 py-1 rounded bg-bg-ops-overlay hover:bg-bg-ops-hover text-text-ops-primary">
            Select All
          </button>
          <button onClick={deselectAll} className="text-xs px-2 py-1 rounded bg-bg-ops-overlay hover:bg-bg-ops-hover text-text-ops-primary">
            Deselect All
          </button>
          <span className="text-xs text-text-ops-muted ml-2">
            {approvedIds.size} / {selectedSession.mutations.length} approved
          </span>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-ops-subtle text-text-ops-muted">
                <th className="text-left py-2 px-3 font-medium w-10"></th>
                <th className="text-left py-2 px-3 font-medium">Seq</th>
                <th className="text-left py-2 px-3 font-medium">Action</th>
                <th className="text-left py-2 px-3 font-medium">Target Node</th>
                <th className="text-left py-2 px-3 font-medium">Forward Delta</th>
                <th className="text-left py-2 px-3 font-medium">Impact</th>
              </tr>
            </thead>
            <tbody>
              {selectedSession.mutations.map(m => {
                const isApproved = approvedIds.has(m.mutation_id);
                return (
                  <tr
                    key={m.mutation_id}
                    onClick={() => toggleMutation(m.mutation_id)}
                    className={`border-b border-border-ops-subtle cursor-pointer ${
                      isApproved ? 'bg-blue-900/20' : 'hover:bg-bg-ops-overlay'
                    }`}
                  >
                    <td className="py-2 px-3">
                      {isApproved ? (
                        <CheckSquare className="w-4 h-4 text-blue-400" />
                      ) : (
                        <Square className="w-4 h-4 text-text-ops-muted" />
                      )}
                    </td>
                    <td className="py-2 px-3 text-text-ops-muted">{m.sequence_order}</td>
                    <td className="py-2 px-3 font-mono text-text-ops-primary">{m.action_type}</td>
                    <td className="py-2 px-3 font-mono text-text-ops-muted text-xs">{m.target_node_id.slice(0, 8)}</td>
                    <td className="py-2 px-3 text-text-ops-muted text-xs max-w-xs truncate">
                      {JSON.stringify(m.forward_delta)}
                    </td>
                    <td className="py-2 px-3 text-text-ops-muted text-xs">{impactSummary(m)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {message && (
          <div className="px-6 py-2 border-t border-border-ops-subtle text-sm text-text-ops-primary bg-bg-ops-surface">
            {message}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-ops-subtle bg-bg-ops-surface">
          <button
            onClick={handleSelectiveCommit}
            disabled={committing || approvedIds.size === 0}
            className="flex items-center gap-2 px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm"
          >
            <CheckSquare className="w-4 h-4" />
            Commit Selected ({approvedIds.size})
          </button>
          <button
            onClick={handleFullCommit}
            disabled={committing}
            className="flex items-center gap-2 px-4 py-2 rounded bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm"
          >
            <Send className="w-4 h-4" />
            Commit All
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <GitMerge className="w-6 h-6 text-blue-400" />
          <div>
            <h1 className="text-lg font-semibold text-text-ops-primary">Agent Review Workbench</h1>
            <p className="text-sm text-text-ops-muted">Review and cherry-pick agent proposals</p>
          </div>
        </div>
        <button onClick={fetchSessions} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {sessions.length === 0 ? (
          <div className="text-center text-text-ops-muted py-12">No pending agent proposals.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-ops-subtle text-text-ops-muted">
                <th className="text-left py-2 px-3 font-medium">Agent</th>
                <th className="text-left py-2 px-3 font-medium">Model</th>
                <th className="text-left py-2 px-3 font-medium">Mutations</th>
                <th className="text-left py-2 px-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr
                  key={s.session_id}
                  onClick={() => loadSession(s.session_id)}
                  className="border-b border-border-ops-subtle cursor-pointer hover:bg-bg-ops-overlay"
                >
                  <td className="py-2 px-3 font-mono text-text-ops-primary">{s.agent_identifier}</td>
                  <td className="py-2 px-3 text-text-ops-muted">{s.model_name}</td>
                  <td className="py-2 px-3 text-text-ops-primary">{s.mutation_count}</td>
                  <td className="py-2 px-3 text-text-ops-muted text-xs">{s.created_at || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AgentReviewWorkbenchView;
