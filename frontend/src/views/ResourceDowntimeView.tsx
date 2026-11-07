/**
 * Resource Downtime View
 *
 * Manages physical resource offline periods for maintenance, calibration,
 * repair, inspection, and modification.
 *
 * Features
 * --------
 * - **Schedule Downtime** — Form to book a resource offline period.
 * - **Upcoming Downtime** — Table of all scheduled downtime records.
 * - **Cancel Downtime** — Action to cancel a scheduled offline period.
 */

import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Wrench, Plus, Trash2, AlertCircle } from 'lucide-react';

interface DowntimeRecord {
  id: number;
  resource_node_id: string;
  resource_name: string | null;
  downtime_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  scheduled_by: { id: number; username: string; full_name: string } | null;
}

const DOWNTIME_TYPES = [
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'CALIBRATION', label: 'Calibration' },
  { value: 'REPAIR', label: 'Repair' },
  { value: 'INSPECTION', label: 'Inspection' },
  { value: 'MODIFICATION', label: 'Modification' },
  { value: 'OTHER', label: 'Other' },
];

function getTypeBadge(type: string) {
  const styles: Record<string, string> = {
    MAINTENANCE: 'bg-blue-500/20 text-blue-400',
    CALIBRATION: 'bg-purple-500/20 text-purple-400',
    REPAIR: 'bg-orange-500/20 text-orange-400',
    INSPECTION: 'bg-yellow-500/20 text-yellow-400',
    MODIFICATION: 'bg-cyan-500/20 text-cyan-400',
    OTHER: 'bg-gray-500/20 text-gray-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[type] || styles.OTHER}`}>
      {type}
    </span>
  );
}

const ResourceDowntimeView: React.FC = () => {
  const [downtimes, setDowntimes] = useState<DowntimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [resourceId, setResourceId] = useState('');
  const [downtimeType, setDowntimeType] = useState('MAINTENANCE');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [daysAhead, setDaysAhead] = useState(30);

  useEffect(() => {
    loadData();
  }, [daysAhead]);

  const loadData = async () => {
    try {
      const res = await api.get('/api/v1/downtime', { params: { days_ahead: daysAhead } });
      setDowntimes(res.data.downtimes || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resourceId || !startDate || !endDate) return;
    setSubmitting(true);
    try {
      await api.post('/api/v1/downtime/', null, {
        params: {
          resource_node_id: resourceId,
          downtime_type: downtimeType,
          start_date: startDate,
          end_date: endDate,
          reason: reason || undefined,
        },
      });
      setShowForm(false);
      setResourceId('');
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
      await api.delete(`/api/v1/downtime/${id}`);
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
            <Wrench size={20} />
            Resource Downtime
          </h1>
          <p className="text-sm text-text-ops-muted mt-1">
            Schedule and manage physical resource offline periods
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Schedule Downtime
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-text-ops-muted">Show next</label>
        <select
          value={daysAhead}
          onChange={(e) => setDaysAhead(Number(e.target.value))}
          className="px-2 py-1 bg-surface-ops-base border border-border-ops-subtle rounded text-xs text-text-ops-primary outline-none"
        >
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
          <option value={30}>30 days</option>
          <option value={60}>60 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>

      {/* Schedule Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface-ops-elevated border border-border-ops-subtle rounded-lg p-4 grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <label className="block text-xs text-text-ops-muted mb-1">Resource UUID</label>
            <input
              type="text"
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              required
              placeholder="UUID of resource..."
              className="w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-text-ops-muted mb-1">Type</label>
            <select
              value={downtimeType}
              onChange={(e) => setDowntimeType(e.target.value)}
              className="w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none"
            >
              {DOWNTIME_TYPES.map((t) => (
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
            <label className="block text-xs text-text-ops-muted mb-1">Reason</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason..."
              className="w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {submitting ? 'Scheduling...' : 'Schedule'}
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

      {/* Downtime Table */}
      <div className="bg-surface-ops-elevated border border-border-ops-subtle rounded-lg">
        <div className="p-4 border-b border-border-ops-subtle flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-ops-primary">
            Upcoming Downtime ({downtimes.length})
          </h2>
        </div>
        {downtimes.length === 0 ? (
          <div className="p-8 text-center text-text-ops-muted text-sm">
            No upcoming downtime scheduled.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-ops-subtle text-text-ops-muted text-xs">
                <th className="text-left px-4 py-2">Resource</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-left px-4 py-2">Start</th>
                <th className="text-left px-4 py-2">End</th>
                <th className="text-left px-4 py-2">Reason</th>
                <th className="text-left px-4 py-2">Scheduled By</th>
                <th className="text-right px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {downtimes.map((d) => (
                <tr key={d.id} className="border-b border-border-ops-subtle/50 hover:bg-surface-ops-base/50">
                  <td className="px-4 py-2">
                    <div>
                      <p className="text-text-ops-primary font-medium">{d.resource_name || 'Unknown'}</p>
                      <p className="text-xs text-text-ops-muted font-mono">{d.resource_node_id}</p>
                    </div>
                  </td>
                  <td className="px-4 py-2">{getTypeBadge(d.downtime_type)}</td>
                  <td className="px-4 py-2 text-text-ops-muted">{d.start_date}</td>
                  <td className="px-4 py-2 text-text-ops-muted">{d.end_date}</td>
                  <td className="px-4 py-2 text-text-ops-muted max-w-xs truncate">{d.reason || '—'}</td>
                  <td className="px-4 py-2 text-text-ops-muted">
                    {d.scheduled_by?.full_name || d.scheduled_by?.username || '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleCancel(d.id)}
                      className="p-1 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                      title="Cancel downtime"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Info Card */}
      <div className="bg-surface-ops-elevated border border-yellow-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-400">Resource Availability Impact</p>
            <p className="text-xs text-text-ops-muted mt-1">
              When a resource is scheduled for downtime, it is automatically marked as out of service.
              The scheduling engine will not assign tasks to resources during their offline period.
              If a task's planned dates overlap with a downtime window, a RESOURCE_UNAVAILABLE clash
              will be flagged by the clash detection daemon.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResourceDowntimeView;
