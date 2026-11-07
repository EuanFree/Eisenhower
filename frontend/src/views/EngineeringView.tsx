/**
 * Engineering Governance View
 *
 * Engineering concessions, Design Assurance Level (DAL) gates, and technical
 * review tracking for the Eisenhower Portfolio Manager.
 *
 * Data Sources: /api/v1/engineering/*
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Shield, AlertTriangle, CheckCircle, Clock, Plus, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import api from '../services/api';

interface Concession {
  id: string;
  code: string;
  title: string;
  type: string;
  status: string;
  dal_level?: string;
  submitted_by?: string;
  submitted_date?: string;
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'text-amber-400',
  UNDER_REVIEW: 'text-blue-400',
  APPROVED: 'text-emerald-400',
  REJECTED: 'text-red-400',
  CLOSED: 'text-gray-400',
};

const EngineeringView: React.FC = () => {
  const [concessions, setConcessions] = useState<Concession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('');
      (res.data || []);
    } catch (err) {
      console.error('Failed to fetch engineering data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCount = concessions.filter((c) => c.status === 'OPEN').length;
  const reviewCount = concessions.filter((c) => c.status === 'UNDER_REVIEW').length;
  const approvedCount = concessions.filter((c) => c.status === 'APPROVED').length;

  if (loading) return <div className="flex items-center justify-center h-full text-text-ops-muted">Loading engineering data...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-amber-400" />
          <div>
            <h1 className="text-lg font-semibold text-text-ops-primary">Engineering Governance</h1>
            <p className="text-sm text-text-ops-muted">Concessions, DAL Gates &amp; Technical Reviews</p>
          </div>
        </div>
        <button onClick={fetchData} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-border-ops-subtle">
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle">
          <div className="flex items-center gap-2 text-text-ops-muted text-sm mb-1"><AlertTriangle className="w-4 h-4" /><span>Open</span></div>
          <div className="text-2xl font-bold text-amber-400">{openCount}</div>
        </div>
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle">
          <div className="flex items-center gap-2 text-text-ops-muted text-sm mb-1"><Clock className="w-4 h-4" /><span>Under Review</span></div>
          <div className="text-2xl font-bold text-blue-400">{reviewCount}</div>
        </div>
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle">
          <div className="flex items-center gap-2 text-text-ops-muted text-sm mb-1"><CheckCircle className="w-4 h-4" /><span>Approved</span></div>
          <div className="text-2xl font-bold text-emerald-400">{approvedCount}</div>
        </div>
      </div>

      <div className="flex items-center justify-between px-6 py-3 border-b border-border-ops-subtle">
        <h2 className="text-base font-medium text-text-ops-primary">Concessions — {concessions.length}</h2>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm">
          <Plus className="w-4 h-4" /> New Concession
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-ops-subtle text-text-ops-muted">
              <th className="text-left py-2 px-3 font-medium">Code</th>
              <th className="text-left py-2 px-3 font-medium">Title</th>
              <th className="text-left py-2 px-3 font-medium">Type</th>
              <th className="text-left py-2 px-3 font-medium">DAL</th>
              <th className="text-left py-2 px-3 font-medium">Status</th>
              <th className="text-left py-2 px-3 font-medium">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {concessions.map((c) => (
              <tr key={c.id} className="border-b border-border-ops-subtle hover:bg-bg-ops-overlay">
                <td className="py-2 px-3 font-mono text-text-ops-primary">{c.code}</td>
                <td className="py-2 px-3 text-text-ops-primary">{c.title}</td>
                <td className="py-2 px-3 text-text-ops-muted">{c.type}</td>
                <td className="py-2 px-3 text-text-ops-muted">{c.dal_level || '—'}</td>
                <td className="py-2 px-3">
                  <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', STATUS_COLORS[c.status] || 'text-text-ops-muted')}>
                    {c.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="py-2 px-3 text-text-ops-muted text-xs">{c.submitted_date || '—'}</td>
              </tr>
            ))}
            {concessions.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-text-ops-muted">No concessions found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EngineeringView;
