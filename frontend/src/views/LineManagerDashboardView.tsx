/**
 * Line Manager Dashboard View
 *
 * Provides a comprehensive overview for line managers showing:
 * - Team hierarchy (org chart) with direct and indirect reports
 * - Pending leave requests requiring approval
 * - Leave overlap assessment to identify delivery risk
 * - Team capacity analysis
 *
 * Features
 * --------
 * - **Org Chart** — Collapsible tree showing the full reporting structure.
 * - **Leave Calendar** — Overview of who is off and when.
 * - **Risk Assessment** — Date range picker to assess team availability.
 * - **Capacity Metrics** — Summary of team size, on-leave count, and risk level.
 */

import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Users, ChevronRight, ChevronDown, AlertTriangle, CheckCircle, Clock, UserMinus } from 'lucide-react';

interface HierarchyNode {
  id: number;
  username: string;
  full_name: string | null;
  email: string;
  role: string;
  clearance_level: string;
  is_active: boolean;
  reports: HierarchyNode[];
}

interface OverlapAssessment {
  total_team_size: number;
  absent_members: { id: number; username: string; full_name: string }[];
  absence_percentage: number;
  risk_level: string;
  overlapping_requests: { id: number; user_id: number; leave_type: string; start_date: string; end_date: string }[];
}

const LineManagerDashboardView: React.FC = () => {
  const [hierarchy, setHierarchy] = useState<HierarchyNode | null>(null);
  const [directCount, setDirectCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set([0]));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [assessment, setAssessment] = useState<OverlapAssessment | null>(null);
  const [assessing, setAssessing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [hierRes, directRes, allRes] = await Promise.all([
        api.get('/api/v1/line-management/hierarchy'),
        api.get('/api/v1/line-management/my-reports'),
        api.get('/api/v1/line-management/all-reports'),
      ]);
      setHierarchy(hierRes.data.hierarchy || null);
      setDirectCount(directRes.data.count || 0);
      setTotalCount(allRes.data.count || 0);
      if (hierRes.data.hierarchy) {
        setExpanded(new Set([hierRes.data.hierarchy.id]));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleAssess = async () => {
    if (!startDate || !endDate) return;
    setAssessing(true);
    try {
      const res = await api.get('/api/v1/leave/overlap-assessment', {
        params: { start_date: startDate, end_date: endDate },
      });
      setAssessment(res.data);
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  };

  const toggleExpand = (id: number) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const renderNode = (node: HierarchyNode, depth: number = 0) => {
    const isExpanded = expanded.has(node.id);
    const hasReports = node.reports.length > 0;

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 py-2 px-3 hover:bg-surface-ops-base/50 rounded cursor-pointer"
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
          onClick={() => hasReports && toggleExpand(node.id)}
        >
          {hasReports ? (
            <span className="text-text-ops-muted">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          ) : (
            <span className="w-3.5" />
          )}
          <span className={`w-2 h-2 rounded-full ${node.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span className="text-sm text-text-ops-primary font-medium">
            {node.full_name || node.username}
          </span>
          <span className="text-xs text-text-ops-muted px-1.5 py-0.5 bg-surface-ops-elevated rounded">
            {node.role}
          </span>
          <span className="text-xs text-text-ops-muted">
            {node.reports.length} report{node.reports.length !== 1 ? 's' : ''}
          </span>
        </div>
        {isExpanded && hasReports && (
          <div>
            {node.reports.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const getRiskColor = (level: string) => {
    const colors: Record<string, string> = {
      LOW: 'text-emerald-400',
      MEDIUM: 'text-yellow-400',
      HIGH: 'text-orange-400',
      CRITICAL: 'text-red-400',
    };
    return colors[level] || 'text-text-ops-muted';
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
      <div>
        <h1 className="text-xl font-semibold text-text-ops-primary flex items-center gap-2">
          <Users size={20} />
          Line Manager Dashboard
        </h1>
        <p className="text-sm text-text-ops-muted mt-1">Team hierarchy, leave approvals, and delivery risk assessment</p>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-surface-ops-elevated border border-border-ops-subtle rounded-lg p-4">
          <p className="text-xs text-text-ops-muted">Total Team</p>
          <p className="text-2xl font-bold text-text-ops-primary mt-1">{totalCount}</p>
        </div>
        <div className="bg-surface-ops-elevated border border-border-ops-subtle rounded-lg p-4">
          <p className="text-xs text-text-ops-muted">Direct Reports</p>
          <p className="text-2xl font-bold text-text-ops-primary mt-1">{directCount}</p>
        </div>
        <div className="bg-surface-ops-elevated border border-border-ops-subtle rounded-lg p-4">
          <p className="text-xs text-text-ops-muted">Currently On Leave</p>
          <p className="text-2xl font-bold text-yellow-400 mt-1">
            {assessment ? assessment.absent_members.length : '—'}
          </p>
        </div>
        <div className="bg-surface-ops-elevated border border-border-ops-subtle rounded-lg p-4">
          <p className="text-xs text-text-ops-muted">Risk Level</p>
          <p className={`text-2xl font-bold mt-1 ${assessment ? getRiskColor(assessment.risk_level) : 'text-text-ops-muted'}`}>
            {assessment ? assessment.risk_level : '—'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Hierarchy */}
        <div className="bg-surface-ops-elevated border border-border-ops-subtle rounded-lg">
          <div className="p-4 border-b border-border-ops-subtle">
            <h2 className="text-sm font-semibold text-text-ops-primary">Team Hierarchy</h2>
          </div>
          <div className="p-2 max-h-96 overflow-auto">
            {hierarchy ? (
              renderNode(hierarchy)
            ) : (
              <div className="p-8 text-center text-text-ops-muted text-sm">No team data available.</div>
            )}
          </div>
        </div>

        {/* Leave Overlap Assessment */}
        <div className="bg-surface-ops-elevated border border-border-ops-subtle rounded-lg">
          <div className="p-4 border-b border-border-ops-subtle">
            <h2 className="text-sm font-semibold text-text-ops-primary flex items-center gap-2">
              <AlertTriangle size={16} />
              Leave Overlap Assessment
            </h2>
          </div>
          <div className="p-4">
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="block text-xs text-text-ops-muted mb-1">From</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-text-ops-muted mb-1">To</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleAssess}
                  disabled={assessing || !startDate || !endDate}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {assessing ? 'Checking...' : 'Assess'}
                </button>
              </div>
            </div>

            {assessment && (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-surface-ops-base rounded border border-border-ops-subtle">
                  <span className="text-sm text-text-ops-muted">Absence Rate</span>
                  <span className={`text-lg font-bold ${getRiskColor(assessment.risk_level)}`}>
                    {assessment.absence_percentage}%
                  </span>
                </div>

                {assessment.absent_members.length > 0 && (
                  <div>
                    <p className="text-xs text-text-ops-muted mb-2">Absent Team Members:</p>
                    <div className="space-y-1">
                      {assessment.absent_members.map((m) => (
                        <div key={m.id} className="flex items-center gap-2 text-sm">
                          <UserMinus size={14} className="text-yellow-400" />
                          <span className="text-text-ops-primary">{m.full_name || m.username}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {assessment.overlapping_requests.length > 0 && (
                  <div>
                    <p className="text-xs text-text-ops-muted mb-2">Overlapping Leave:</p>
                    <div className="space-y-1">
                      {assessment.overlapping_requests.map((r) => (
                        <div key={r.id} className="text-xs text-text-ops-muted flex items-center gap-2">
                          <Clock size={12} />
                          <span>{r.leave_type}</span>
                          <span>{r.start_date} → {r.end_date}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {assessment.risk_level === 'CRITICAL' && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
                    <AlertTriangle size={14} className="inline mr-1" />
                    Critical delivery risk — {assessment.absence_percentage}% of team absent. Consider deferring leave or reallocating resources.
                  </div>
                )}
                {assessment.risk_level === 'HIGH' && (
                  <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded text-sm text-orange-400">
                    <AlertTriangle size={14} className="inline mr-1" />
                    High delivery risk — {assessment.absence_percentage}% of team absent. Review critical path tasks.
                  </div>
                )}
                {assessment.risk_level === 'LOW' && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded text-sm text-emerald-400">
                    <CheckCircle size={14} className="inline mr-1" />
                    Low risk — team capacity is sufficient during this period.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LineManagerDashboardView;
