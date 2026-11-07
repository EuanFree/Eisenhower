/**
 * Leave Management View
 *
 * Allows users to book leave, view their leave history, and cancel
 * pending requests. Line managers see pending requests from their
 * direct reports and can approve or reject them.
 *
 * Features
 * --------
 * - **Book Leave** — Form to submit a new leave request with type, dates, and reason.
 * - **My Leave** — Table showing the user's own leave requests with status badges.
 * - **Pending Approvals** — Manager section showing requests awaiting decision.
 * - **Cancel Request** — Action to cancel own pending requests.
 */

import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Calendar, CheckCircle, XCircle, Clock, AlertCircle, Plus } from 'lucide-react';

interface LeaveRequest {
  id: number;
  user_id?: number;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  manager_comment: string | null;
  approved_at: string | null;
  created_at: string;
  requester?: { id: number; username: string; full_name: string } | null;
}

const LEAVE_TYPES = [
  { value: 'ANNUAL', label: 'Annual Leave' },
  { value: 'SICK', label: 'Sick Leave' },
  { value: 'MATERNITY', label: 'Maternity Leave' },
  { value: 'PATERNITY', label: 'Paternity Leave' },
  { value: 'JURY', label: 'Jury Duty' },
  { value: 'UNPAID', label: 'Unpaid Leave' },
  { value: 'TRAINING', label: 'Training' },
  { value: 'OTHER', label: 'Other' },
];

function getStatusBadge(status: string) {
  const styles: Record<string, string> = {
    PENDING: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    APPROVED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    REJECTED: 'bg-red-500/20 text-red-400 border-red-500/30',
    CANCELLED: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };
  const icons: Record<string, React.ReactNode> = {
    PENDING: <Clock size={14} />,
    APPROVED: <CheckCircle size={14} />,
    REJECTED: <XCircle size={14} />,
    CANCELLED: <AlertCircle size={14} />,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${styles[status] || styles.PENDING}`}>
      {icons[status]}
      {status}
    </span>
  );
}

const LeaveManagementView: React.FC = () => {
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [pendingRequests, setPendingRequests] = useState<LeaveRequest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [leaveType, setLeaveType] = useState('ANNUAL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [comment, setComment] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [myRes, pendingRes] = await Promise.all([
        api.get('/api/v1/leave/my-requests'),
        api.get('/api/v1/leave/pending'),
      ]);
      setMyRequests(myRes.data.requests || []);
      setPendingRequests(pendingRes.data.pending_requests || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) return;
    setSubmitting(true);
    try {
      await api.post('/api/v1/leave/requests', null, {
        params: { leave_type: leaveType, start_date: startDate, end_date: endDate, reason: reason || undefined },
      });
      setShowForm(false);
      setStartDate('');
      setEndDate('');
      setReason('');
      loadData();
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: number) => {
    try {
      await api.post(`/api/v1/leave/${id}/cancel`);
      loadData();
    } catch {
      // silent
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await api.post(`/api/v1/leave/${id}/approve`, null, {
        params: { comment: comment || undefined },
      });
      setComment('');
      loadData();
    } catch {
      // silent
    }
  };

  const handleReject = async (id: number) => {
    try {
      await api.post(`/api/v1/leave/${id}/reject`, null, {
        params: { comment },
      });
      setComment('');
      loadData();
    } catch {
      // silent
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-text-ops-muted">
        <div className="w-6 h-6 rounded-full border-2 border-border-ops-subtle border-t-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto p-6 gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-ops-primary flex items-center gap-2">
            <Calendar size={20} />
            Leave Management
          </h1>
          <p className="text-sm text-text-ops-muted mt-1">Book leave and manage approval requests</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Book Leave
        </button>
      </div>

      {/* Booking Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface-ops-elevated border border-border-ops-subtle rounded-lg p-4 grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs text-text-ops-muted mb-1">Leave Type</label>
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
              className="w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none"
            >
              {LEAVE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-ops-muted mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-text-ops-muted mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
              className="w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-text-ops-muted mb-1">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Brief reason..."
              className="w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-surface-ops-base border border-border-ops-subtle hover:border-border-ops-strong rounded-lg text-sm text-text-ops-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Pending Approvals (Manager Section) */}
      {pendingRequests.length > 0 && (
        <div className="bg-surface-ops-elevated border border-yellow-500/30 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-yellow-400 flex items-center gap-2 mb-3">
            <Clock size={16} />
            Pending Approvals ({pendingRequests.length})
          </h2>
          <div className="space-y-3">
            {pendingRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between p-3 bg-surface-ops-base rounded border border-border-ops-subtle">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-ops-primary">
                      {req.requester?.full_name || req.requester?.username || `User #${req.user_id}`}
                    </span>
                    <span className="text-xs text-text-ops-muted px-2 py-0.5 bg-surface-ops-elevated rounded">
                      {req.leave_type}
                    </span>
                  </div>
                  <p className="text-xs text-text-ops-muted mt-1">
                    {req.start_date} → {req.end_date}
                    {req.reason && ` — ${req.reason}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <input
                    type="text"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Comment..."
                    className="w-40 px-2 py-1 bg-surface-ops-base border border-border-ops-subtle rounded text-xs text-text-ops-primary focus:border-blue-500 outline-none"
                  />
                  <button
                    onClick={() => handleApprove(req.id)}
                    className="p-1.5 text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors"
                    title="Approve"
                  >
                    <CheckCircle size={18} />
                  </button>
                  <button
                    onClick={() => handleReject(req.id)}
                    className="p-1.5 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                    title="Reject"
                  >
                    <XCircle size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Leave Requests */}
      <div className="bg-surface-ops-elevated border border-border-ops-subtle rounded-lg">
        <div className="p-4 border-b border-border-ops-subtle">
          <h2 className="text-sm font-semibold text-text-ops-primary">My Leave Requests</h2>
        </div>
        {myRequests.length === 0 ? (
          <div className="p-8 text-center text-text-ops-muted text-sm">No leave requests yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-ops-subtle text-text-ops-muted text-xs">
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-left px-4 py-2">Dates</th>
                <th className="text-left px-4 py-2">Reason</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Manager Comment</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {myRequests.map((req) => (
                <tr key={req.id} className="border-b border-border-ops-subtle/50 hover:bg-surface-ops-base/50">
                  <td className="px-4 py-2 text-text-ops-primary">{req.leave_type}</td>
                  <td className="px-4 py-2 text-text-ops-muted">
                    {req.start_date} → {req.end_date}
                  </td>
                  <td className="px-4 py-2 text-text-ops-muted max-w-xs truncate">{req.reason || '—'}</td>
                  <td className="px-4 py-2">{getStatusBadge(req.status)}</td>
                  <td className="px-4 py-2 text-text-ops-muted max-w-xs truncate">{req.manager_comment || '—'}</td>
                  <td className="px-4 py-2 text-right">
                    {req.status === 'PENDING' && (
                      <button
                        onClick={() => handleCancel(req.id)}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default LeaveManagementView;
