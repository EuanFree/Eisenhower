/**
 * Blocked Activities Dashboard View
 *
 * Displays all currently blocked tasks across all projects with:
 * - Summary metrics (total blocked, critical, major, impacted hours)
 * - Filterable table of blocked activities
 * - Blocker severity indicators and category badges
 * - Project context for each blocked task
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  Clock,
  ShieldAlert,
  GitBranch,
  Calendar,
  ChevronRight,
  Filter,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BlockedActivity {
  task_id: string;
  task_code: string;
  task_name: string;
  task_path: string;
  project_id: string | null;
  project_code: string | null;
  project_name: string | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
  percent_complete: number | null;
  delivery_mode: string | null;
  security_classification: string | null;
  blocker_id: string;
  blocker_category: string | null;
  blocker_severity: string | null;
  impacted_hours: number | null;
  blocker_created_at: string | null;
}

interface BlockedActivitiesResponse {
  total_blocked: number;
  critical_count: number;
  major_count: number;
  total_impacted_hours: number;
  blocked_activities: BlockedActivity[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const severityColor = (severity: string | null) => {
  switch (severity) {
    case 'CRITICAL': return 'bg-rose-950/60 border-rose-700 text-rose-300';
    case 'MAJOR': return 'bg-amber-950/60 border-amber-700 text-amber-300';
    case 'MINOR': return 'bg-sky-950/60 border-sky-700 text-sky-300';
    default: return 'bg-bg-ops-overlay border-border-ops-subtle text-text-ops-muted';
  }
};

const categoryLabel = (category: string | null) => {
  const labels: Record<string, string> = {
    'RESOURCE_UNAVAILABLE': 'Resource Unavailable',
    'FACILITY_MAINTENANCE': 'Facility Maintenance',
    'CLEARANCE_HOLD': 'Clearance Hold',
    'OPERATIONAL_IMPEDIMENT': 'Operational Impediment',
    'DEPENDENCY_DELAY': 'Dependency Delay',
    'TECHNICAL_ISSUE': 'Technical Issue',
  };
  return labels[category || ''] || category || 'Unknown';
};

const classificationColor = (classification: string | null) => {
  switch (classification) {
    case 'TOP_SECRET': return 'bg-red-950/60 border-red-700 text-red-300';
    case 'SECRET': return 'bg-blue-950/60 border-blue-700 text-blue-300';
    case 'OFFICIAL_SENSITIVE': return 'bg-yellow-950/60 border-yellow-700 text-yellow-300';
    default: return 'bg-bg-ops-overlay border-border-ops-subtle text-text-ops-muted';
  }
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const BlockedActivitiesView: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BlockedActivitiesResponse | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    api.get('/cockpit/blocked-activities')
      .then((res) => {
        setData(res.data || res);
      })
      .catch(() => {
        setData({ total_blocked: 0, critical_count: 0, major_count: 0, total_impacted_hours: 0, blocked_activities: [] });
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredActivities = useMemo(() => {
    if (!data) return [];
    return data.blocked_activities.filter((activity) => {
      if (severityFilter && activity.blocker_severity !== severityFilter) return false;
      if (projectFilter && activity.project_code !== projectFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match =
          activity.task_name.toLowerCase().includes(q) ||
          activity.task_code.toLowerCase().includes(q) ||
          (activity.project_name || '').toLowerCase().includes(q) ||
          categoryLabel(activity.blocker_category).toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [data, severityFilter, projectFilter, searchQuery]);

  const projects = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    return data.blocked_activities
      .filter((a) => {
        if (!a.project_code) return false;
        if (seen.has(a.project_code)) return false;
        seen.add(a.project_code);
        return true;
      })
      .map((a) => ({ code: a.project_code!, name: a.project_name || '' }));
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <AlertTriangle size={32} className="text-rose-400 animate-pulse" />
          <span className="text-text-ops-muted text-sm">Loading blocked activities...</span>
        </div>
      </div>
    );
  }

  const summary = data || { total_blocked: 0, critical_count: 0, major_count: 0, total_impacted_hours: 0, blocked_activities: [] };

  return (
    <div className="flex flex-col h-full bg-bg-ops-base p-4 gap-4 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-text-ops-primary flex items-center gap-2">
            <ShieldAlert size={20} className="text-rose-400" />
            Blocked Activities Dashboard
          </h2>
          <p className="text-sm text-text-ops-muted mt-1">
            All currently blocked tasks across all programmes and projects
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3 flex-shrink-0">
        <div className="bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4">
          <div className="flex items-center gap-2 text-text-ops-muted text-sm mb-1">
            <AlertTriangle size={14} />
            <span>Total Blocked</span>
          </div>
          <div className="text-2xl font-bold text-text-ops-primary">{summary.total_blocked}</div>
        </div>
        <div className="bg-rose-950/20 border border-rose-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-rose-400 text-sm mb-1">
            <ShieldAlert size={14} />
            <span>Critical</span>
          </div>
          <div className="text-2xl font-bold text-rose-300">{summary.critical_count}</div>
        </div>
        <div className="bg-amber-950/20 border border-amber-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-400 text-sm mb-1">
            <AlertTriangle size={14} />
            <span>Major</span>
          </div>
          <div className="text-2xl font-bold text-amber-300">{summary.major_count}</div>
        </div>
        <div className="bg-sky-950/20 border border-sky-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sky-400 text-sm mb-1">
            <Clock size={14} />
            <span>Impacted Hours</span>
          </div>
          <div className="text-2xl font-bold text-sky-300">{summary.total_impacted_hours.toFixed(0)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="relative flex-1 max-w-md">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-ops-muted" />
          <input
            type="text"
            placeholder="Search by task name, code, or project..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-bg-ops-surface border border-border-ops-subtle rounded-md text-sm text-text-ops-primary placeholder:text-text-ops-muted focus:outline-none focus:border-sky-600"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-ops-muted hover:text-text-ops-primary"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <select
          value={severityFilter || ''}
          onChange={(e) => setSeverityFilter(e.target.value || null)}
          className="px-3 py-2 bg-bg-ops-surface border border-border-ops-subtle rounded-md text-sm text-text-ops-primary focus:outline-none focus:border-sky-600"
        >
          <option value="">All Severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="MAJOR">Major</option>
          <option value="MINOR">Minor</option>
        </select>
        {projects.length > 1 && (
          <select
            value={projectFilter || ''}
            onChange={(e) => setProjectFilter(e.target.value || null)}
            className="px-3 py-2 bg-bg-ops-surface border border-border-ops-subtle rounded-md text-sm text-text-ops-primary focus:outline-none focus:border-sky-600"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.code} value={p.code}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Blocked Activities Table */}
      <div className="flex-1 overflow-auto bg-bg-ops-surface border border-border-ops-subtle rounded-lg">
        {filteredActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-text-ops-muted">
            <AlertTriangle size={32} className="text-emerald-400 mb-2" />
            <span className="text-sm">No blocked activities found</span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-bg-ops-overlay border-b border-border-ops-subtle">
              <tr>
                <th className="text-left px-4 py-2 text-text-ops-muted font-medium">Severity</th>
                <th className="text-left px-4 py-2 text-text-ops-muted font-medium">Task</th>
                <th className="text-left px-4 py-2 text-text-ops-muted font-medium">Project</th>
                <th className="text-left px-4 py-2 text-text-ops-muted font-medium">Category</th>
                <th className="text-left px-4 py-2 text-text-ops-muted font-medium">Classification</th>
                <th className="text-left px-4 py-2 text-text-ops-muted font-medium">Progress</th>
                <th className="text-left px-4 py-2 text-text-ops-muted font-medium">Impacted Hours</th>
              </tr>
            </thead>
            <tbody>
              {filteredActivities.map((activity) => (
                <tr key={activity.task_id} className="border-b border-border-ops-subtle/50 hover:bg-bg-ops-overlay/30">
                  <td className="px-4 py-3">
                    <span className={clsx('px-2 py-0.5 rounded text-xs font-medium border', severityColor(activity.blocker_severity))}>
                      {activity.blocker_severity || 'UNKNOWN'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ChevronRight size={12} className="text-text-ops-muted" />
                      <div>
                        <div className="text-text-ops-primary font-medium">{activity.task_name}</div>
                        <div className="text-text-ops-muted text-xs font-mono">{activity.task_code}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <GitBranch size={12} className="text-text-ops-muted" />
                      <span className="text-text-ops-primary text-xs">{activity.project_name || '-'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-text-ops-muted text-xs">{categoryLabel(activity.blocker_category)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('px-2 py-0.5 rounded text-xs font-medium border', classificationColor(activity.security_classification))}>
                      {activity.security_classification || 'UNCLASSIFIED'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-bg-ops-base rounded-full overflow-hidden">
                        <div
                          className={clsx('h-full rounded-full',
                            (activity.percent_complete || 0) >= 100 ? 'bg-emerald-500' :
                            (activity.percent_complete || 0) > 50 ? 'bg-sky-500' :
                            (activity.percent_complete || 0) > 0 ? 'bg-amber-500' : 'bg-text-ops-muted'
                          )}
                          style={{ width: `${Math.min(100, activity.percent_complete || 0)}%` }}
                        />
                      </div>
                      <span className="text-text-ops-muted text-xs">{activity.percent_complete ?? 0}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-text-ops-primary">
                      <Clock size={12} className="text-text-ops-muted" />
                      <span className="font-mono text-xs">{activity.impacted_hours ?? 0}h</span>
                    </div>
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

export default BlockedActivitiesView;
