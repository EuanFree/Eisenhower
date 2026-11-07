/**
 * Cockpit Metrics Strip Component
 *
 * Displays 4 compact KPI metric cards at the top of the Daily Cockpit view:
 *
 * 1. Sprint Commitment — Radial dial showing assigned hours vs. standard
 *    weekly capacity (e.g., 34.0h / 37.5h). Color shifts from green → amber
 *    → red as capacity approaches 100%.
 *
 * 2. Critical Path Tasks — Count of assigned active tasks with Total Float
 *    ≤ 0. These tasks directly determine the project finish date.
 *
 * 3. Due Within 48 Hours — Urgent action items count with amber/red alert
 *    styling when deadlines are imminent.
 *
 * 4. Blocking Others — Count of active blockers logged where downstream
 *    tasks are waiting on the user. Highlights when the user is holding up
 *    the team.
 *
 * Data source: GET /api/v1/cockpit/summary
 */

import React, { useMemo } from 'react';
import {
  Gauge,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { clsx } from 'clsx';
import { CockpitSummaryResponse } from '../../types/cockpit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CockpitMetricsStripProps {
  /** Summary data from the cockpit API */
  summary: CockpitSummaryResponse | null;
  /** Weekly capacity in hours (default 37.5 for standard UK work week) */
  weeklyCapacityHours?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default weekly capacity: 7.5h/day × 5 days */
const DEFAULT_CAPACITY = 37.5;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Circular dial gauge for the Sprint Load card.
 * Renders an SVG arc that fills proportionally to the committed/capacity ratio.
 */
const DialGauge: React.FC<{
  value: number;
  max: number;
  size?: number;
}> = ({ value, max, size = 80 }) => {
  const ratio = Math.min(1, Math.max(0, value / max));

  // Color transitions: green (0–60%) → amber (60–85%) → red (85–100%)
  const color = ratio < 0.6 ? '#10b981' : ratio < 0.85 ? '#f59e0b' : '#ef4444';

  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - ratio);
  const center = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background ring */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="var(--bg-ops-overlay, #334155)"
        strokeWidth={6}
      />
      {/* Filled arc */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
        className="transition-all duration-500"
      />
      {/* Center text */}
      <text
        x={center}
        y={center - 4}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-text-ops-primary text-sm font-mono font-bold"
      >
        {value.toFixed(0)}h
      </text>
      <text
        x={center}
        y={center + 10}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-text-ops-muted text-xs font-mono"
      >
        / {max.toFixed(1)}h
      </text>
    </svg>
  );
};

/**
 * Single KPI card wrapper.
 */
const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  warning?: boolean;
  danger?: boolean;
  children?: React.ReactNode;
}> = ({ icon, label, value, subtext, warning, danger, children }) => {
  return (
    <div
      className={clsx(
        'relative flex flex-col rounded-lg border p-4 transition-colors',
        'bg-bg-ops-surface',
        danger
          ? 'border-red-500/60'
          : warning
            ? 'border-amber-500/60'
            : 'border-border-ops-subtle',
      )}
    >
      {/* Icon + Label */}
      <div className="flex items-center gap-2 mb-2">
        <span className={danger ? 'text-red-400' : warning ? 'text-amber-400' : 'text-text-ops-muted'}>
          {icon}
        </span>
        <span className="text-xs uppercase tracking-wider text-text-ops-muted font-semibold">
          {label}
        </span>
      </div>

      {/* Value */}
      {children ? (
        <div className="flex-1 flex items-center">{children}</div>
      ) : (
        <div className="flex-1 flex items-baseline gap-2">
          <span
            className={clsx(
              'text-3xl font-bold font-mono',
              danger ? 'text-red-400' : warning ? 'text-amber-400' : 'text-text-ops-primary',
            )}
          >
            {value}
          </span>
          {subtext && (
            <span className="text-sm text-text-ops-muted">{subtext}</span>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const CockpitMetricsStrip: React.FC<CockpitMetricsStripProps> = ({
  summary,
  weeklyCapacityHours = DEFAULT_CAPACITY,
}) => {
  // Derived metrics
  const metrics = useMemo(() => {
    if (!summary) {
      return {
        sprintLoad: 0,
        criticalCount: 0,
        due48h: 0,
        blockedCount: 0,
        blockingOthers: 0,
      };
    }
    return {
      sprintLoad: summary.total_planned_hours_week,
      criticalCount: summary.active_sprint_tasks,
      due48h: summary.tasks_due_48h,
      blockedCount: summary.blocked_tasks,
      blockingOthers: summary.blocking_others,
    };
  }, [summary]);

  // Load percentage for dial coloring
  const loadRatio = metrics.sprintLoad / weeklyCapacityHours;
  const isOverloaded = loadRatio > 1.0;
  const isNearCapacity = loadRatio > 0.85 && !isOverloaded;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* 1. Sprint Commitment */}
      <MetricCard
        icon={<Gauge size={16} />}
        label="Sprint Commitment"
        value=""
        warning={isNearCapacity}
        danger={isOverloaded}
      >
        <div className="flex items-center gap-4 flex-1">
          <DialGauge value={metrics.sprintLoad} max={weeklyCapacityHours} />
          <div className="flex flex-col">
            <span className="text-xs text-text-ops-muted">Committed</span>
            <span className="text-xs text-text-ops-muted">
              {((weeklyCapacityHours - metrics.sprintLoad) / weeklyCapacityHours * 100).toFixed(0)}% free
            </span>
          </div>
        </div>
      </MetricCard>

      {/* 2. Critical Path Tasks */}
      <MetricCard
        icon={<ShieldAlert size={16} />}
        label="Critical Path Tasks"
        value={metrics.criticalCount}
        subtext="tasks"
        warning={metrics.criticalCount > 0}
      />

      {/* 3. Due Within 48 Hours */}
      <MetricCard
        icon={<Clock size={16} />}
        label="Due Within 48 Hours"
        value={metrics.due48h}
        subtext="urgent"
        warning={metrics.due48h > 0}
        danger={metrics.due48h > 3}
      />

      {/* 4. Blocking Others */}
      <MetricCard
        icon={<Users size={16} />}
        label="Blocking Others"
        value={metrics.blockingOthers}
        subtext="waiting"
        warning={metrics.blockingOthers > 0}
        danger={metrics.blockingOthers > 2}
      />
    </div>
  );
};

export default CockpitMetricsStrip;
