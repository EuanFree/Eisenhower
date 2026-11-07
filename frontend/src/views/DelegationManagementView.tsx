/**
 * Delegation Management View
 *
 * Allows line managers to set up, monitor, and revoke delegation of
 * sign-off authority when they are unavailable due to leave, training,
 * or other commitments.
 *
 * Features
 * --------
 * - **Create Delegation** — Form to delegate sign-off authority to a
 *   colleague for a defined date range.
 * - **My Delegations** — Table showing outgoing and incoming delegations
 *   with status badges (Active, Upcoming, Expired, Revoked).
 * - **Coverage Check** — Check whether delegation covers a specific
 *   date range (useful before submitting leave).
 * - **Revoke Delegation** — Revoke an active delegation if plans change.
 * - **Upcoming & Expiring** — Dashboard strips showing delegations
 *   starting or expiring within the next 7 days.
 * - **Delegation Warning** — Alert when a line manager has approved
 *   leave but no delegation in place.
 */

import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  UserPlus,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Calendar,
  ArrowRight,
  Shield,
  Users,
} from 'lucide-react';

interface Delegation {
  id: number;
  delegator: { id: number; username: string; full_name: string } | null;
  delegatee: { id: number; username: string; full_name: string } | null;
  start_date: string;
  end_date: string;
  reason: string | null;
  revoked: boolean;
  revoked_at: string | null;
  is_active: boolean;
  created_at: string | null;
  days_remaining?: number;
}

interface CoverageResult {
  covered: boolean;
  delegation: { id: number; start_date: string; end_date: string; reason: string | null } | null;
  gaps: Array<{ start: string; end: string }>;
  delegatee: { id: number; username: string; full_name: string } | null;
}

function getStatusBadge(delegation: Delegation) {
  if (delegation.revoked) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-gray-500/20 text-gray-400 border-gray-500/30">
        <XCircle size={14} /> Revoked
      </span>
    );
  }
  if (delegation.is_active) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
        <CheckCircle size={14} /> Active
      </span>
    );
  }
  const today = new Date().toISOString().split('T')[0];
  if (delegation.start_date > today) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-blue-500/20 text-blue-400 border-blue-500/30">
        <Clock size={14} /> Upcoming
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-gray-500/20 text-gray-400 border-gray-500/30">
      <Calendar size={14} /> Expired
    </span>
  );
}

const DelegationManagementView: React.FC = () => {
  const [outgoing, setOutgoing] = useState<Delegation[]>([]);
  const [incoming, setIncoming] = useState<Delegation[]>([]);
  const [activeDelegation, setActiveDelegation] = useState<Delegation | null>(null);
  const [upcoming, setUpcoming] = useState<Delegation[]>([]);
  const [expiring, setExpiring] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [tab, setTab] = useState<'outgoing' | 'incoming'>('outgoing');

  // Create delegation form
  const [delegateeId, setDelegateeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Coverage check form
  const [covStart, setCovStart] = useState('');
  const [covEnd, setCovEnd] = useState('');
  const [coverage, setCoverage] = useState<CoverageResult | null>(null);

  // User search for delegatee selection
  const [userSearch, setUserSearch] = useState('');
  const [users, setUsers] = useState<Array<{ id: number; username: string; full_name: string }>>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [outRes, inRes, activeRes, upRes, expRes] = await Promise.all([
        api.get('/api/v1/delegation/my-delegations', { params: { direction: 'outgoing' } }),
        api.get('/api/v1/delegation/my-delegations', { params: { direction: 'incoming' } }),
        api.get('/api/v1/delegation/active'),
        api.get('/api/v1/delegation/upcoming', { params: { days_ahead: 7 } }),
        api.get('/api/v1/delegation/expiring', { params: { days_ahead: 7 } }),
      ]);
      setOutgoing(outRes.data.delegations || []);
      setIncoming(inRes.data.delegations || []);
      setActiveDelegation(activeRes.data.active_delegation || null);
      setUpcoming(upRes.data.upcoming || []);
      setExpiring(expRes.data.expiring || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const searchUsers = async (query: string) => {
    setUserSearch(query);
    if (query.length < 2) {
      setUsers([]);
      return;
    }
    try {
      const res = await api.get('/api/v1/admin/users', { params: { search: query } });
      setUsers(res.data.users || []);
    } catch {
      // Try alternative endpoint
      try {
        const res = await api.get('/api/users', { params: { q: query } });
        setUsers(res.data || []);
      } catch {
        setUsers([]);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!delegateeId || !startDate || !endDate) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/api/v1/delegation', null, {
        params: {
          delegatee_user_id: parseInt(delegateeId),
          start_date: startDate,
          end_date: endDate,
          reason: reason || undefined,
        },
      });
      setSuccess('Delegation created successfully.');
      setShowForm(false);
      setDelegateeId('');
      setStartDate('');
      setEndDate('');
      setReason('');
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create delegation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (id: number) => {
    if (!window.confirm('Revoke this delegation? Authority will revert to you immediately.')) return;
    try {
      await api.post(`/api/v1/delegation/${id}/revoke`);
      setSuccess('Delegation revoked.');
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to revoke delegation.');
    }
  };

  const handleCoverageCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!covStart || !covEnd) return;
    try {
      const res = await api.get('/api/v1/delegation/coverage', {
        params: { start_date: covStart, end_date: covEnd },
      });
      setCoverage(res.data);
    } catch {
      setCoverage(null);
    }
  };

  const currentDelegations = tab === 'outgoing' ? outgoing : incoming;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading delegations...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
            <Shield size={28} className="text-blue-400" />
            Delegation Management
          </h1>
          <p className="text-gray-400 mt-1">
            Delegate your sign-off authority when you're unavailable
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCoverage(!showCoverage)}
            className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm flex items-center gap-1"
          >
            <Calendar size={16} />
            Check Coverage
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm flex items-center gap-1"
          >
            <UserPlus size={16} />
            New Delegation
          </button>
        </div>
      </div>

      {/* Active Delegation Banner */}
      {activeDelegation && (
        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
          <div className="flex items-center gap-2 text-emerald-400 font-medium">
            <CheckCircle size={18} />
            Active Delegation
          </div>
          <p className="text-gray-300 mt-1">
            You have delegated sign-off authority to{' '}
            <strong>{activeDelegation.delegatee?.full_name || activeDelegation.delegatee?.username}</strong>
            {' '}from {activeDelegation.start_date} to {activeDelegation.end_date}.
            {activeDelegation.reason && ` Reason: ${activeDelegation.reason}`}
          </p>
          <button
            onClick={() => handleRevoke(activeDelegation.id)}
            className="mt-2 px-3 py-1 rounded text-xs bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30"
          >
            Revoke Delegation
          </button>
        </div>
      )}

      {/* Alerts */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-2">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-2">
          <CheckCircle size={16} />
          {success}
        </div>
      )}

      {/* Create Delegation Form */}
      {showForm && (
        <div className="p-4 rounded-lg bg-gray-800 border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
            <UserPlus size={18} />
            Create New Delegation
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Delegatee Selection */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Delegate To</label>
              <input
                type="text"
                placeholder="Search users..."
                value={userSearch}
                onChange={(e) => searchUsers(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-gray-100 focus:border-blue-500 focus:outline-none"
              />
              {users.length > 0 && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-lg bg-gray-900 border border-gray-600">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setDelegateeId(String(u.id));
                        setUserSearch(u.full_name || u.username);
                        setUsers([]);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-700 text-gray-200 text-sm flex items-center justify-between"
                    >
                      <span>{u.full_name || u.username}</span>
                      <span className="text-gray-500 text-xs">@{u.username}</span>
                    </button>
                  ))}
                </div>
              )}
              {delegateeId && (
                <p className="mt-1 text-xs text-emerald-400">
                  Selected: {userSearch}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-gray-100 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-gray-100 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Reason (Optional)</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Annual leave, Training course..."
                className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting || !delegateeId || !startDate || !endDate}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm"
              >
                {submitting ? 'Creating...' : 'Create Delegation'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setError('');
                  setSuccess('');
                }}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Coverage Check */}
      {showCoverage && (
        <div className="p-4 rounded-lg bg-gray-800 border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
            <Calendar size={18} />
            Check Delegation Coverage
          </h3>
          <form onSubmit={handleCoverageCheck} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">From</label>
                <input
                  type="date"
                  value={covStart}
                  onChange={(e) => setCovStart(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-gray-100 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">To</label>
                <input
                  type="date"
                  value={covEnd}
                  onChange={(e) => setCovEnd(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-gray-100 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm"
            >
              Check Coverage
            </button>

            {coverage && (
              <div className={`mt-4 p-3 rounded-lg border ${
                coverage.covered
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-yellow-500/10 border-yellow-500/30'
              }`}>
                {coverage.covered ? (
                  <div className="text-emerald-400 flex items-center gap-2">
                    <CheckCircle size={16} />
                    Fully covered by delegation to {coverage.delegatee?.full_name || coverage.delegatee?.username}
                  </div>
                ) : (
                  <div className="text-yellow-400">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={16} />
                      Gaps in delegation coverage:
                    </div>
                    <ul className="mt-2 space-y-1 text-sm text-gray-300">
                      {coverage.gaps.map((gap, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <ArrowRight size={12} />
                          {gap.start} to {gap.end}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </form>
        </div>
      )}

      {/* Upcoming & Expiring Strips */}
      {(upcoming.length > 0 || expiring.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <h3 className="text-sm font-semibold text-blue-400 flex items-center gap-2 mb-2">
                <Clock size={14} />
                Starting Soon ({upcoming.length})
              </h3>
              <div className="space-y-2">
                {upcoming.map((d) => (
                  <div key={d.id} className="text-xs text-gray-300 flex items-center justify-between">
                    <span>
                      {d.delegator?.full_name} → {d.delegatee?.full_name}
                    </span>
                    <span className="text-gray-500">{d.start_date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expiring */}
          {expiring.length > 0 && (
            <div className="p-4 rounded-lg bg-orange-500/5 border border-orange-500/20">
              <h3 className="text-sm font-semibold text-orange-400 flex items-center gap-2 mb-2">
                <AlertTriangle size={14} />
                Expiring Soon ({expiring.length})
              </h3>
              <div className="space-y-2">
                {expiring.map((d) => (
                  <div key={d.id} className="text-xs text-gray-300 flex items-center justify-between">
                    <span>
                      {d.delegator?.full_name} → {d.delegatee?.full_name}
                    </span>
                    <span className="text-orange-400">{d.days_remaining ?? '?'}d left</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delegations Table */}
      <div className="rounded-lg bg-gray-800 border border-gray-700">
        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setTab('outgoing')}
            className={`px-4 py-3 text-sm font-medium flex items-center gap-2 ${
              tab === 'outgoing'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <ArrowRight size={14} />
            My Outgoing ({outgoing.length})
          </button>
          <button
            onClick={() => setTab('incoming')}
            className={`px-4 py-3 text-sm font-medium flex items-center gap-2 ${
              tab === 'incoming'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <Users size={14} />
            My Incoming ({incoming.length})
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">
                  {tab === 'outgoing' ? 'Delegated To' : 'Delegated By'}
                </th>
                <th className="text-left px-4 py-3 font-medium">Period</th>
                <th className="text-left px-4 py-3 font-medium">Reason</th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentDelegations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No {tab} delegations found.
                  </td>
                </tr>
              ) : (
                currentDelegations.map((d) => {
                  const other = tab === 'outgoing' ? d.delegatee : d.delegator;
                  const isMyActive = tab === 'outgoing' && !d.revoked && d.is_active;
                  return (
                    <tr key={d.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="px-4 py-3">{getStatusBadge(d)}</td>
                      <td className="px-4 py-3 text-gray-200">
                        {other?.full_name || other?.username || 'Unknown'}
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {d.start_date} → {d.end_date}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {d.reason || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {isMyActive && (
                          <button
                            onClick={() => handleRevoke(d.id)}
                            className="px-2 py-1 rounded text-xs bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info Section */}
      <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700/50">
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-2">
          <Shield size={14} />
          How Delegation Works
        </h3>
        <ul className="text-xs text-gray-400 space-y-1">
          <li>• When you delegate, the delegatee can approve leave requests and sign off on your behalf.</li>
          <li>• You can only have one active delegation at a time — overlapping dates are not allowed.</li>
          <li>• You can revoke a delegation at any time if your plans change.</li>
          <li>• When your leave is approved, the system will check whether you have delegation in place.</li>
          <li>• If no delegation covers your leave period, you'll receive a reminder to set one up.</li>
        </ul>
      </div>
    </div>
  );
};

export default DelegationManagementView;
