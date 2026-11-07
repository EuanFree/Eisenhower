/**
 * Risk Matrix Grid
 *
 * Interactive 5×5 Risk Matrix (Likelihood 1–5 × Consequence 1–5) for
 * visualising the programme's risk landscape.  Each cell is color-coded
 * by risk score (likelihood × consequence) and shows the count of risks
 * falling into that cell.
 *
 * Features
 * --------
 * 1. **5×5 Grid** — Likelihood on the Y-axis (1–5, bottom to top),
 *    Consequence on the X-axis (1–5, left to right).
 *
 * 2. **Color-Coded Zones** — Green (low, 1–4), Yellow (medium, 5–9),
 *    Orange (high, 10–16), Red (extreme, 15–25).
 *
 * 3. **Risk Count Badges** — Each cell displays the number of active
 *    risks in that zone.
 *
 * 4. **Cell Click Filtering** — Clicking a cell filters the list of
 *    ProjectRiskItem entries to show only risks with that likelihood
 *    and consequence rating.
 *
 * 5. **Risk List Panel** — Below the matrix, a scrollable list of
 *    filtered risks with title, WBS task link, status, and mitigation.
 */

import React, { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Shield,
  X,
  Filter,
} from 'lucide-react';
import type {
  LikelihoodRating,
  ConsequenceRating,
  ProjectRiskItem,
  RiskMatrixFilters,
} from '../../types/risk';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RiskMatrixGridProps {
  /** List of active project risk items */
  risks: ProjectRiskItem[];
  /** Callback when a cell is clicked (filters risks) */
  onCellClick?: (filters: RiskMatrixFilters) => void;
}

// ---------------------------------------------------------------------------
// Risk Zone Configuration
// ---------------------------------------------------------------------------

interface ZoneConfig {
  label: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  icon: typeof AlertTriangle;
}

const ZONE_CONFIG: Record<string, ZoneConfig> = {
  low: {
    label: 'Low',
    bgClass: 'bg-green-500/10',
    borderClass: 'border-green-500/30',
    textClass: 'text-green-400',
    icon: CheckCircle2,
  },
  medium: {
    label: 'Medium',
    bgClass: 'bg-yellow-500/10',
    borderClass: 'border-yellow-500/30',
    textClass: 'text-yellow-400',
    icon: AlertTriangle,
  },
  high: {
    label: 'High',
    bgClass: 'bg-orange-500/10',
    borderClass: 'border-orange-500/30',
    textClass: 'text-orange-400',
    icon: AlertTriangle,
  },
  extreme: {
    label: 'Extreme',
    bgClass: 'bg-red-500/10',
    borderClass: 'border-red-500/30',
    textClass: 'text-red-400',
    icon: AlertTriangle,
  },
};

// ---------------------------------------------------------------------------
// Helper: Determine risk zone from score
// ---------------------------------------------------------------------------

const getZone = (score: number): 'low' | 'medium' | 'high' | 'extreme' => {
  if (score >= 15) return 'extreme';
  if (score >= 10) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
};

// ---------------------------------------------------------------------------
// Helper: Status badge config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  OPEN: { color: 'text-blue-400', label: 'Open' },
  MITIGATING: { color: 'text-amber-400', label: 'Mitigating' },
  CLOSED: { color: 'text-green-400', label: 'Closed' },
  ACCEPTED: { color: 'text-gray-400', label: 'Accepted' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const RiskMatrixGrid: React.FC<RiskMatrixGridProps> = ({
  risks = [],
  onCellClick,
}) => {
  const [activeFilters, setActiveFilters] = useState<RiskMatrixFilters>({
    likelihood: null,
    consequence: null,
    status: null,
  });

  // Build 5×5 grid with risk counts
  const grid = useMemo(() => {
    const matrix: {
      likelihood: LikelihoodRating;
      consequence: ConsequenceRating;
      score: number;
      zone: 'low' | 'medium' | 'high' | 'extreme';
      count: number;
      risks: ProjectRiskItem[];
    }[][] = [];

    for (let likelihood = 5; likelihood >= 1; likelihood--) {
      const row: {
        likelihood: LikelihoodRating;
        consequence: ConsequenceRating;
        score: number;
        zone: 'low' | 'medium' | 'high' | 'extreme';
        count: number;
        risks: ProjectRiskItem[];
      }[] = [];

      for (let consequence = 1; consequence <= 5; consequence++) {
        const score = likelihood * consequence;
        const matchingRisks = risks.filter(
          (r) => r.likelihood === likelihood && r.consequence === consequence,
        );

        row.push({
          likelihood: likelihood as LikelihoodRating,
          consequence: consequence as ConsequenceRating,
          score,
          zone: getZone(score),
          count: matchingRisks.length,
          risks: matchingRisks,
        });
      }

      matrix.push(row);
    }

    return matrix;
  }, [risks]);

  // Filter risks based on active cell selection
  const filteredRisks = useMemo(() => {
    let filtered = [...risks];

    if (activeFilters.likelihood !== null) {
      filtered = filtered.filter((r) => r.likelihood === activeFilters.likelihood);
    }
    if (activeFilters.consequence !== null) {
      filtered = filtered.filter((r) => r.consequence === activeFilters.consequence);
    }
    if (activeFilters.status !== null) {
      filtered = filtered.filter((r) => r.status === activeFilters.status);
    }

    return filtered.sort((a, b) => b.score - a.score);
  }, [risks, activeFilters]);

  // Handle cell click
  const handleCellClick = (likelihood: LikelihoodRating, consequence: ConsequenceRating) => {
    if (activeFilters.likelihood === likelihood && activeFilters.consequence === consequence) {
      // Deselect
      const newFilters = { ...activeFilters, likelihood: null, consequence: null };
      setActiveFilters(newFilters);
      onCellClick?.(newFilters);
    } else {
      const newFilters = { ...activeFilters, likelihood, consequence };
      setActiveFilters(newFilters);
      onCellClick?.(newFilters);
    }
  };

  // Clear all filters
  const clearFilters = () => {
    const newFilters = { likelihood: null, consequence: null, status: null };
    setActiveFilters(newFilters);
    onCellClick?.(newFilters);
  };

  // Total risk counts by zone
  const zoneCounts = useMemo(() => {
    const counts = { low: 0, medium: 0, high: 0, extreme: 0 };
    risks.forEach((r) => {
      const zone = getZone(r.score);
      counts[zone]++;
    });
    return counts;
  }, [risks]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-400" />
          <h3 className="text-sm font-semibold text-text-ops-primary">
            Risk Matrix
          </h3>
          <span className="text-xs text-text-ops-muted">
            ({risks.length} total risks)
          </span>
        </div>

        {/* Active filter indicator */}
        {(activeFilters.likelihood !== null || activeFilters.status !== null) && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-blue-400 bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 transition-colors"
          >
            <X className="w-3 h-3" />
            Clear Filters
          </button>
        )}
      </div>

      {/* Zone Summary Strip */}
      <div className="flex items-center gap-3">
        {(['low', 'medium', 'high', 'extreme'] as const).map((zone) => {
          const config = ZONE_CONFIG[zone];
          const Icon = config.icon;
          return (
            <div
              key={zone}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs',
                config.bgClass,
                config.borderClass,
                config.textClass,
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="font-medium">{config.label}</span>
              <span className="font-mono opacity-70">{zoneCounts[zone]}</span>
            </div>
          );
        })}
      </div>

      {/* 5×5 Grid */}
      <div className="flex gap-2">
        {/* Y-axis label */}
        <div className="flex flex-col justify-between py-0 px-1">
          <span className="text-[10px] text-text-ops-muted rotate-[-90deg] whitespace-nowrap" style={{ writingMode: 'vertical-rl' }}>
            Likelihood →
          </span>
        </div>

        <div className="flex flex-col gap-0.5">
          {/* X-axis header */}
          <div className="flex gap-0.5 ml-10">
            <div className="w-16 h-6" />
            {[1, 2, 3, 4, 5].map((c) => (
              <div key={c} className="flex-1 text-center">
                <span className="text-[10px] text-text-ops-muted">{c}</span>
              </div>
            ))}
          </div>

          {/* Grid rows (likelihood 5 at top, 1 at bottom) */}
          {grid.map((row, rowIdx) => (
            <div key={rowIdx} className="flex items-center gap-0.5">
              {/* Row label */}
              <div className="w-10 text-center">
                <span className="text-xs font-mono text-text-ops-muted">{row[0].likelihood}</span>
              </div>

              {/* Cells */}
              {row.map((cell) => {
                const config = ZONE_CONFIG[cell.zone];
                const isActive =
                  activeFilters.likelihood === cell.likelihood &&
                  activeFilters.consequence === cell.consequence;

                return (
                  <button
                    key={`${cell.likelihood}-${cell.consequence}`}
                    type="button"
                    onClick={() => handleCellClick(cell.likelihood, cell.consequence)}
                    className={clsx(
                      'flex-1 h-12 rounded border text-xs font-mono transition-all relative',
                      config.bgClass,
                      config.borderClass,
                      isActive && 'ring-2 ring-blue-500 ring-offset-1 ring-offset-bg-ops-base',
                      cell.count > 0 && 'cursor-pointer hover:opacity-80',
                      cell.count === 0 && 'cursor-default opacity-50',
                    )}
                    title={`Likelihood: ${cell.likelihood}, Consequence: ${cell.consequence}, Score: ${cell.score}`}
                  >
                    {/* Score */}
                    <span className="absolute top-0.5 left-1 text-[9px] opacity-50 text-text-ops-muted">
                      {cell.score}
                    </span>

                    {/* Count badge */}
                    {cell.count > 0 && (
                      <span className={clsx(
                        'absolute top-0.5 right-1 text-[10px] font-bold',
                        config.textClass,
                      )}>
                        {cell.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {/* X-axis label */}
          <div className="ml-10 text-center mt-1">
            <span className="text-[10px] text-text-ops-muted">Consequence →</span>
          </div>
        </div>
      </div>

      {/* Filtered Risk List */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-text-ops-muted" />
          <h4 className="text-xs font-medium text-text-ops-muted uppercase tracking-wider">
            {activeFilters.likelihood !== null
              ? `Risks (L:${activeFilters.likelihood} × C:${activeFilters.consequence})`
              : 'All Risks'}
          </h4>
          <span className="text-xs text-text-ops-muted">
            ({filteredRisks.length})
          </span>
        </div>

        {filteredRisks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-ops-muted">
            <Shield className="w-8 h-8 mb-2 text-text-ops-muted/50" />
            <p className="text-sm text-center">
              {activeFilters.likelihood !== null
                ? 'No risks in this matrix cell.'
                : 'No active risks.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {filteredRisks.map((risk) => {
              const zone = getZone(risk.score);
              const config = ZONE_CONFIG[zone];
              const statusConfig = STATUS_CONFIG[risk.status] || STATUS_CONFIG.OPEN;

              return (
                <div
                  key={risk.id}
                  className={clsx(
                    'p-3 rounded-md border transition-colors',
                    config.bgClass,
                    config.borderClass,
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={clsx('text-sm font-medium', config.textClass)}>
                          {risk.title}
                        </span>
                        <span className={clsx(
                          'px-1.5 py-0.5 rounded text-[10px] font-medium',
                          statusConfig.color,
                          `bg-${statusConfig.color.split('-')[1]}-500/10`,
                        )}>
                          {statusConfig.label}
                        </span>
                      </div>
                      {risk.portfolio_node_id && (
                        <span className="text-xs font-mono text-text-ops-muted">
                          Node: {risk.portfolio_node_id}
                        </span>
                      )}
                      {risk.mitigation && (
                        <p className="text-xs text-text-ops-muted mt-1 line-clamp-2">
                          {risk.mitigation}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs font-mono text-text-ops-muted">
                      <span className="px-1.5 py-0.5 rounded bg-bg-ops-overlay">
                        L:{risk.likelihood}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-bg-ops-overlay">
                        C:{risk.consequence}
                      </span>
                      <span className={clsx(
                        'px-1.5 py-0.5 rounded font-bold',
                        config.textClass,
                        config.bgClass,
                      )}>
                        {risk.score}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default RiskMatrixGrid;
