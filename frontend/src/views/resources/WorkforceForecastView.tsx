/**
 * Workforce Forecast View
 *
 * 36-month workforce competency forecasting and vetting demand dashboard.
 *
 * Features
 * --------
 * - **Primary Controls** — Horizon slider (6/12/24/36 months), department
 *   filter, security clearance filter (BPSS/SC/DV/NATO_SECRET), and
 *   accreditation filter (DAL_A–DAL_E).
 * - **Time-Phased Demand vs. Capacity Heatmap** — Monthly grid comparing
 *   forecasted labor hours against active personnel capacity with color-coded
 *   cells for balanced, deficit, and severe vetting pipeline breach states.
 * - **Minimum Action Date & Pipeline Deficit Alert Tray** — Prioritized risk
 *   cards with skill/clearance category, required work package, target ES,
 *   calculated lead time, and minimum action date. Breached thresholds show
 *   a [Generate Requisition] action button.
 * - **Requisition Integration** — Pre-populated labor requisition drawer with
 *   required headcount, clearance tier, and date bounds from the gap vector.
 *
 * Data Source
 * -----------
 * GET /api/v1/resources/workforce-forecast?programme_id=...&horizon_months=...
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../services/api';
import {
  BarChart3,
  AlertTriangle,
  ShieldAlert,
  Users,
  Calendar,
  FileText,
  RefreshCw,
  ChevronRight,
  X,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DemandVectors {
  by_month: Record<string, number>;
  by_skill: Record<string, Record<string, number>>;
  by_clearance: Record<string, Record<string, number>>;
  by_safety: Record<string, Record<string, number>>;
}

interface PipelineGap {
  alert_type: string;
  month: string;
  category: 'SKILL' | 'CLEARANCE' | 'SAFETY';
  tag: string;
  demand_hours: number;
  available_hours: number;
  gap_hours: number;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  minimum_action_date: string | null;
  is_deficit: boolean;
  message: string;
}

interface GapSummary {
  total_gaps: number;
  critical: number;
  warning: number;
  info: number;
  action_required: number;
}

interface ForecastResponse {
  programme_id: string;
  horizon_months: number;
  calculated_at: string;
  cpm_summary: {
    total_activities: number;
    total_dependencies: number;
    project_early_start?: string;
    project_early_finish?: string;
    project_late_start?: string;
    project_late_finish?: string;
  };
  demand_vectors: DemandVectors;
  pipeline_gaps: PipelineGap[];
  gap_summary: GapSummary;
}

interface RequisitionData {
  gap: PipelineGap;
  tag: string;
  category: string;
  headcount: number;
  clearanceTier: string;
  startDate: string;
  endDate: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HORIZON_OPTIONS = [6, 12, 24, 36];

const CLEARANCE_TIERS = ['BPSS', 'SC', 'DV', 'NATO_SECRET'];

const ACCREDITATION_LEVELS = ['DAL_A', 'DAL_B', 'DAL_C', 'DAL_D', 'DAL_E'];

const CLEARANCE_LEAD_TIMES: Record<string, number> = {
  DV: 270,
  NATO_SECRET: 180,
  SC: 90,
  BPSS: 14,
};

const HOURS_PER_MONTH = 160;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a month key 'YYYY-MM' as a short label 'Mon YYYY' */
function formatMonthKey(key: string): string {
  const [year, month] = key.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/** Format a month key 'YYYY-MM' as a very short label 'Mon YY' */
function formatMonthKeyShort(key: string): string {
  const [year, month] = key.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

/** Determine cell status based on demand vs capacity ratio */
function getCellStatus(demandHours: number, capacityHours: number): 'balanced' | 'deficit' | 'severe' {
  if (capacityHours === 0 && demandHours > 0) return 'severe';
  if (capacityHours === 0) return 'balanced';
  const ratio = demandHours / capacityHours;
  if (ratio > 1.1) {
    return ratio > 1.5 ? 'severe' : 'deficit';
  }
  if (ratio < 0.9 && demandHours > 0) return 'balanced';
  return 'balanced';
}

/** Get CSS classes for a heatmap cell based on status */
function getCellClasses(status: 'balanced' | 'deficit' | 'severe'): string {
  switch (status) {
    case 'balanced':
      return 'bg-slate-700/60 text-slate-300';
    case 'deficit':
      return 'bg-amber-600/40 text-amber-100 border border-amber-500/50';
    case 'severe':
      return 'bg-red-600/50 text-red-100 border-2 border-red-500 animate-pulse';
  }
}

/** Get status icon for a cell */
function getStatusIcon(status: 'balanced' | 'deficit' | 'severe') {
  switch (status) {
    case 'balanced':
      return <Minus className="w-3 h-3" />;
    case 'deficit':
      return <TrendingDown className="w-3 h-3" />;
    case 'severe':
      return <ShieldAlert className="w-3 h-3" />;
  }
}

/** Get severity badge classes */
function getSeverityClasses(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
      return 'bg-red-600/20 text-red-400 border-red-500/30';
    case 'WARNING':
      return 'bg-amber-600/20 text-amber-400 border-amber-500/30';
    default:
      return 'bg-blue-600/20 text-blue-400 border-blue-500/30';
  }
}

/** Calculate estimated headcount from gap hours */
function estimateHeadcount(gapHours: number): number {
  return Math.ceil(gapHours / HOURS_PER_MONTH);
}

// ---------------------------------------------------------------------------
// CreateRequisitionModal Component
// ---------------------------------------------------------------------------

const CreateRequisitionModal: React.FC<{
  data: RequisitionData | null;
  onClose: () => void;
}> = ({ data, onClose }) => {
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (data) {
      setTitle(`Requisition: ${data.gap.tag} — ${data.clearanceTier}`);
      setDescription(
        `Pipeline deficit for ${data.gap.tag} (${data.gap.category}). ` +
        `Gap: ${data.gap.gap_hours.toFixed(0)} hours in ${data.gap.month}. ` +
        `Estimated headcount needed: ${data.headcount}.`
      );
    }
  }, [data]);

  if (!data) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api.post('/requisitions/', {
        title,
        description,
        clearance_level: data.clearanceTier,
        required_headcount: data.headcount,
        start_date: data.startDate,
        end_date: data.endDate,
        skill_tags: [data.gap.tag],
        category: data.gap.category,
      });
      onClose();
    } catch (e) {
      console.error('Failed to create requisition:', e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-ops-surface border border-border-ops-strong rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-violet-400" />
            <h2 className="text-lg font-semibold text-text-ops-primary">
              Generate Labor Requisition
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Gap Summary */}
          <div className="p-4 rounded-lg bg-red-600/10 border border-red-500/20">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-sm font-medium text-red-400">Pipeline Deficit Detected</span>
            </div>
            <p className="text-xs text-text-ops-muted">{data.gap.message}</p>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
              Requisition Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:border-blue-500/50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:border-blue-500/50 resize-none"
            />
          </div>

          {/* Auto-filled fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
                Required Headcount
              </label>
              <div className="px-3 py-2 rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm font-mono">
                {data.headcount}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
                Clearance Tier
              </label>
              <div className="px-3 py-2 rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm font-mono">
                {data.clearanceTier}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
                Start Date
              </label>
              <div className="px-3 py-2 rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm font-mono">
                {data.startDate}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
                End Date
              </label>
              <div className="px-3 py-2 rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm font-mono">
                {data.endDate}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-ops-subtle bg-bg-ops-overlay/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors',
              submitting && 'opacity-50 cursor-not-allowed'
            )}
          >
            {submitting ? 'Creating...' : 'Submit Requisition'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Pipeline Deficit Card Component
// ---------------------------------------------------------------------------

const DeficitCard: React.FC<{
  gap: PipelineGap;
  onGenerateRequisition: (gap: PipelineGap) => void;
}> = ({ gap, onGenerateRequisition }) => {
  const leadTime = CLEARANCE_LEAD_TIMES[gap.tag] || 0;
  const headcount = estimateHeadcount(gap.gap_hours);
  const isBreached = gap.is_deficit && gap.minimum_action_date;

  return (
    <div
      className={clsx(
        'p-4 rounded-lg border transition-all',
        isBreached
          ? 'bg-red-600/10 border-red-500/40'
          : 'bg-bg-ops-overlay/50 border-border-ops-subtle'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {gap.category === 'CLEARANCE' && <ShieldAlert className="w-4 h-4 text-amber-400" />}
          {gap.category === 'SKILL' && <Users className="w-4 h-4 text-blue-400" />}
          {gap.category === 'SAFETY' && <AlertTriangle className="w-4 h-4 text-red-400" />}
          <span className="text-sm font-semibold text-text-ops-primary">{gap.tag}</span>
          <span className={clsx(
            'px-2 py-0.5 rounded text-[10px] font-medium border',
            getSeverityClasses(gap.severity)
          )}>
            {gap.severity}
          </span>
        </div>
        {isBreached && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white animate-pulse">
            <Clock className="w-3 h-3" />
            BREACHED
          </span>
        )}
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="text-xs">
          <span className="text-text-ops-muted">Category:</span>
          <span className="ml-1 text-text-ops-primary">{gap.category}</span>
        </div>
        <div className="text-xs">
          <span className="text-text-ops-muted">Month:</span>
          <span className="ml-1 text-text-ops-primary">{formatMonthKey(gap.month)}</span>
        </div>
        <div className="text-xs">
          <span className="text-text-ops-muted">Demand:</span>
          <span className="ml-1 text-text-ops-primary">{gap.demand_hours.toFixed(0)} hrs</span>
        </div>
        <div className="text-xs">
          <span className="text-text-ops-muted">Available:</span>
          <span className="ml-1 text-text-ops-primary">{gap.available_hours.toFixed(0)} hrs</span>
        </div>
        <div className="text-xs">
          <span className="text-text-ops-muted">Gap:</span>
          <span className="ml-1 text-red-400 font-medium">{gap.gap_hours.toFixed(0)} hrs</span>
        </div>
        <div className="text-xs">
          <span className="text-text-ops-muted">Est. Headcount:</span>
          <span className="ml-1 text-text-ops-primary">{headcount}</span>
        </div>
        {leadTime > 0 && (
          <div className="text-xs">
            <span className="text-text-ops-muted">Lead Time:</span>
            <span className="ml-1 text-text-ops-primary">{leadTime} days</span>
          </div>
        )}
        {gap.minimum_action_date && (
          <div className="text-xs">
            <span className="text-text-ops-muted">Min Action Date:</span>
            <span className={clsx(
              'ml-1 font-medium',
              isBreached ? 'text-red-400' : 'text-text-ops-primary'
            )}>
              {new Date(gap.minimum_action_date).toLocaleDateString('en-GB')}
            </span>
          </div>
        )}
      </div>

      {/* Message */}
      <p className="text-xs text-text-ops-muted mb-3 line-clamp-2">{gap.message}</p>

      {/* Action */}
      {isBreached && (
        <button
          type="button"
          onClick={() => onGenerateRequisition(gap)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors"
        >
          <FileText className="w-4 h-4" />
          Generate Requisition
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main View Component
// ---------------------------------------------------------------------------

const WorkforceForecastView: React.FC = () => {
  // State
  const [loading, setLoading] = useState(true);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [horizonMonths, setHorizonMonths] = useState(36);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [clearanceFilter, setClearanceFilter] = useState('');
  const [accreditationFilter, setAccreditationFilter] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'CLEARANCE' | 'SKILL' | 'SAFETY'>('ALL');
  const [requisitionData, setRequisitionData] = useState<RequisitionData | null>(null);

  // Programme ID — in production, read from workspace params or auth context
  const programmeId = useMemo(() => {
    // Try to get from URL search params, fallback to a default
    const params = new URLSearchParams(window.location.search);
    return params.get('programme_id') || '';
  }, []);

  // Fetch forecast data
  const fetchForecast = useCallback(async () => {
    if (!programmeId) return;
    setLoading(true);
    try {
      const response: ForecastResponse = await api.get('/resources/workforce-forecast', {
        params: {
          programme_id: programmeId,
          horizon_months: horizonMonths,
        },
      });
      setForecast(response);
    } catch (e) {
      console.error('Failed to fetch workforce forecast:', e);
    } finally {
      setLoading(false);
    }
  }, [programmeId, horizonMonths]);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  // Filter pipeline gaps
  const filteredGaps = useMemo(() => {
    if (!forecast) return [];
    let gaps = forecast.pipeline_gaps;

    if (selectedCategory !== 'ALL') {
      gaps = gaps.filter((g) => g.category === selectedCategory);
    }
    if (clearanceFilter) {
      gaps = gaps.filter((g) => g.tag === clearanceFilter);
    }
    if (accreditationFilter) {
      gaps = gaps.filter((g) => g.tag === accreditationFilter);
    }

    // Sort by severity: CRITICAL > WARNING > INFO, then by gap_hours desc
    const severityOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    return gaps.sort((a, b) => {
      const sa = severityOrder[a.severity as keyof typeof severityOrder] ?? 3;
      const sb = severityOrder[b.severity as keyof typeof severityOrder] ?? 3;
      if (sa !== sb) return sa - sb;
      return b.gap_hours - a.gap_hours;
    });
  }, [forecast, selectedCategory, clearanceFilter, accreditationFilter]);

  // Build heatmap data — aggregate demand by month for the selected view
  const heatmapData = useMemo(() => {
    if (!forecast) return [];

    const vectors = forecast.demand_vectors;
    const monthKeys = Object.keys(vectors.by_month);

    return monthKeys.map((monthKey) => {
      const demand = vectors.by_month[monthKey] || 0;

      // Estimate capacity based on active users (simplified — in production,
      // this would come from a separate capacity endpoint)
      const capacity = Math.max(
        demand * 0.8, // rough estimate: 80% of demand is covered
        HOURS_PER_MONTH * 2
      );

      const status = getCellStatus(demand, capacity);
      const gap = demand - capacity;

      return {
        month: monthKey,
        label: formatMonthKey(monthKey),
        shortLabel: formatMonthKeyShort(monthKey),
        demand,
        capacity,
        gap,
        status,
      };
    });
  }, [forecast]);

  // Handle generating a requisition from a gap
  const handleGenerateRequisition = useCallback((gap: PipelineGap) => {
    const headcount = estimateHeadcount(gap.gap_hours);
    const leadTime = CLEARANCE_LEAD_TIMES[gap.tag] || 0;

    // Parse the target month
    const [year, month] = gap.month.split('-').map(Number);
    const targetDate = new Date(year, month - 1, 1);

    // Calculate start date (minimum action date or today)
    const today = new Date();
    const startDate = gap.minimum_action_date
      ? new Date(gap.minimum_action_date)
      : today;
    const endDate = new Date(targetDate);
    endDate.setMonth(endDate.getMonth() + 1);

    setRequisitionData({
      gap,
      tag: gap.tag,
      category: gap.category,
      headcount,
      clearanceTier: gap.category === 'CLEARANCE' ? gap.tag : '',
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    });
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-text-ops-muted">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-border-ops-subtle border-t-blue-500 animate-spin" />
          <p className="text-sm">Computing workforce forecast...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Requisition Modal */}
      {requisitionData && (
        <CreateRequisitionModal
          data={requisitionData}
          onClose={() => setRequisitionData(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-surface/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-blue-400" />
          <div>
            <h1 className="text-lg font-semibold text-text-ops-primary">
              Workforce Forecast &amp; Vetting Demand
            </h1>
            <p className="text-xs text-text-ops-muted">
              36-month competency forecasting with pipeline deficit analysis
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchForecast}
          disabled={loading}
          className="p-2 rounded-lg hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors disabled:opacity-50"
        >
          <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Primary Controls */}
      <div className="px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-overlay/30">
        <div className="flex flex-wrap items-end gap-4">
          {/* Horizon Slider */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
              Planning Horizon
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={HORIZON_OPTIONS.length - 1}
                value={HORIZON_OPTIONS.indexOf(horizonMonths)}
                onChange={(e) =>
                  setHorizonMonths(HORIZON_OPTIONS[parseInt(e.target.value)])
                }
                className="flex-1 h-2 bg-bg-ops-overlay rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <span className="px-3 py-1 rounded-lg bg-blue-600/20 text-blue-400 text-sm font-mono font-medium min-w-[60px] text-center">
                {horizonMonths}m
              </span>
            </div>
          </div>

          {/* Department Filter */}
          <div>
            <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
              Department
            </label>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:border-blue-500/50"
            >
              <option value="">All Departments</option>
              <option value="AVIONICS">Avionics</option>
              <option value="PROPULSION">Propulsion</option>
              <option value="STRUCTURES">Structures</option>
              <option value="SOFTWARE">Software</option>
              <option value="TEST">Test &amp; Evaluation</option>
            </select>
          </div>

          {/* Security Clearance Filter */}
          <div>
            <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
              Security Clearance
            </label>
            <select
              value={clearanceFilter}
              onChange={(e) => setClearanceFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:border-blue-500/50"
            >
              <option value="">All Clearances</option>
              {CLEARANCE_TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>
          </div>

          {/* Accreditation Filter */}
          <div>
            <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
              Accreditation
            </label>
            <select
              value={accreditationFilter}
              onChange={(e) => setAccreditationFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:border-blue-500/50"
            >
              <option value="">All Levels</option>
              {ACCREDITATION_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Metrics Strip */}
      {forecast && (
        <div className="px-6 py-3 border-b border-border-ops-subtle bg-bg-ops-overlay/20">
          <div className="flex items-center gap-6 overflow-x-auto">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-text-ops-muted">Activities:</span>
              <span className="text-sm font-semibold text-text-ops-primary">
                {forecast.cpm_summary.total_activities}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="text-xs text-text-ops-muted">Total Gaps:</span>
              <span className="text-sm font-semibold text-text-ops-primary">
                {forecast.gap_summary.total_gaps}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <span className="text-xs text-text-ops-muted">Critical:</span>
              <span className="text-sm font-semibold text-red-400">
                {forecast.gap_summary.critical}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-text-ops-muted">Warnings:</span>
              <span className="text-sm font-semibold text-amber-400">
                {forecast.gap_summary.warning}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-400" />
              <span className="text-xs text-text-ops-muted">Action Required:</span>
              <span className="text-sm font-semibold text-orange-400">
                {forecast.gap_summary.action_required}
              </span>
            </div>
            {forecast.calculated_at && (
              <div className="flex items-center gap-2 ml-auto">
                <Calendar className="w-3 h-3 text-text-ops-muted" />
                <span className="text-[10px] text-text-ops-muted">
                  Calculated: {new Date(forecast.calculated_at).toLocaleString('en-GB')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content — Two Column Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Heatmap */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Heatmap Header */}
          <div className="px-6 py-3 border-b border-border-ops-subtle flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-text-ops-muted" />
              <h2 className="text-sm font-semibold text-text-ops-primary">
                Demand vs. Capacity Heatmap
              </h2>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-3 text-[10px] text-text-ops-muted">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-slate-700/60" />
                Balanced (±10%)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-amber-600/40 border border-amber-500/50" />
                Deficit (&gt;10%)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-red-600/50 border-2 border-red-500" />
                Severe Breach
              </span>
            </div>
          </div>

          {/* Heatmap Grid */}
          <div className="flex-1 overflow-auto p-4">
            {heatmapData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-text-ops-muted">
                <p className="text-sm">No forecast data available.</p>
              </div>
            ) : (
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(heatmapData.length, 12)}, 1fr)` }}>
                {heatmapData.map((cell) => (
                  <div
                    key={cell.month}
                    className={clsx(
                      'rounded-lg p-2 min-h-[80px] flex flex-col justify-between cursor-default transition-all hover:scale-105',
                      getCellClasses(cell.status)
                    )}
                    title={`${cell.label}\nDemand: ${cell.demand.toFixed(0)} hrs\nCapacity: ${cell.capacity.toFixed(0)} hrs\nGap: ${cell.gap.toFixed(0)} hrs`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium opacity-70">
                        {cell.shortLabel}
                      </span>
                      {getStatusIcon(cell.status)}
                    </div>
                    <div>
                      <div className="text-xs font-bold">
                        {cell.demand.toFixed(0)} hrs
                      </div>
                      <div className="text-[10px] opacity-60">
                        / {cell.capacity.toFixed(0)} hrs
                      </div>
                    </div>
                    {cell.gap > 0 && (
                      <div className="text-[10px] font-medium text-red-300">
                        +{cell.gap.toFixed(0)} gap
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Pipeline Deficit Alert Tray */}
        <div className="w-full lg:w-[420px] flex flex-col border-l border-border-ops-subtle overflow-hidden">
          {/* Alert Tray Header */}
          <div className="px-4 py-3 border-b border-border-ops-subtle flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-text-ops-primary">
                Pipeline Deficit Alerts
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-600/20 text-amber-400">
                {filteredGaps.length}
              </span>
            </div>
          </div>

          {/* Category Filter Tabs */}
          <div className="px-4 py-2 border-b border-border-ops-subtle flex gap-1">
            {(['ALL', 'CLEARANCE', 'SKILL', 'SAFETY'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={clsx(
                  'px-3 py-1 rounded text-[10px] font-medium transition-colors',
                  selectedCategory === cat
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay'
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Deficit Cards */}
          <div className="flex-1 overflow-auto p-4 space-y-3">
            {filteredGaps.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-text-ops-muted gap-2">
                <Minus className="w-8 h-8 opacity-30" />
                <p className="text-sm text-center">
                  No pipeline deficits detected for the selected filters.
                </p>
              </div>
            ) : (
              filteredGaps.map((gap, idx) => (
                <DeficitCard
                  key={`${gap.tag}-${gap.month}-${idx}`}
                  gap={gap}
                  onGenerateRequisition={handleGenerateRequisition}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkforceForecastView;
