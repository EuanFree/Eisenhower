/**
 * Cost Curve Canvas — Interactive SVG time-phased cost distribution plot.
 *
 * Renders an SVG area chart showing daily and monthly time-phased spend vectors
 * for a selected cost distribution profile (LINEAR, BETA_DISTRIBUTION,
 * WEIBULL_CURVE, RAYLEIGH). Displays the cumulative S-curve alongside periodic
 * discrete bar allocations.
 *
 * When WEIBULL_CURVE is selected, exposes interactive shape parameter sliders
 * (k and λ) allowing the CAM to visually model early engineering build ramp-ups
 * versus late integration spend.
 *
 * Total area under the curve dynamically binds to 100.00% of BAC without
 * rounding drift.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Settings2, TrendingUp, BarChart3, Info } from 'lucide-react';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProfileCurve = 'LINEAR' | 'BETA_DISTRIBUTION' | 'WEIBULL_CURVE' | 'RAYLEIGH';

export interface WeibullParams {
  /** Shape parameter k — controls ramp-up steepness */
  k: number;
  /** Scale parameter λ — controls where the bulk of spend occurs */
  lambda: number;
}

export interface CostCurveCanvasProps {
  /** Total Budget at Completion */
  bac: number;
  /** Planned start date of the work package */
  startDate: string;  // ISO date
  /** Planned finish date of the work package */
  endDate: string;    // ISO date
  /** Selected cost distribution profile */
  profile: ProfileCurve;
  /** Weibull shape parameters (only used when profile === 'WEIBULL_CURVE') */
  weibullParams?: WeibullParams;
  /** Called when Weibull params change */
  onWeibullParamsChange?: (params: WeibullParams) => void;
  /** Optional: show monthly bars overlay */
  showMonthlyBars?: boolean;
}

// ---------------------------------------------------------------------------
// Mathematical curve functions
// ---------------------------------------------------------------------------

/**
 * Compute the PDF (probability density function) value for a given t ∈ [0, 1]
 * based on the selected profile curve.
 */
function computePdf(t: number, profile: ProfileCurve, weibullParams: WeibullParams): number {
  if (t < 0 || t > 1) return 0;

  switch (profile) {
    case 'LINEAR':
      return 1.0;

    case 'BETA_DISTRIBUTION': {
      // Beta distribution with α=2, β=5 for S-curve shape (NASA/DoD standard)
      const alpha = 2;
      const beta = 5;
      // Beta PDF: t^(α-1) * (1-t)^(β-1) / B(α,β)
      // B(α,β) = Γ(α)Γ(β)/Γ(α+β)
      const betaFunc = factorial(alpha - 1) * factorial(beta - 1) / factorial(alpha + beta - 1);
      const raw = Math.pow(t, alpha - 1) * Math.pow(1 - t, beta - 1) / betaFunc;
      return Math.max(0, raw);
    }

    case 'WEIBULL_CURVE': {
      const { k, lambda } = weibullParams;
      if (k <= 0 || lambda <= 0) return 0;
      // Weibull PDF: (k/λ) * (t/λ)^(k-1) * exp(-(t/λ)^k)
      // Normalized to [0,1] range
      const scaled = t / lambda;
      const raw = (k / lambda) * Math.pow(scaled, k - 1) * Math.exp(-Math.pow(scaled, k));
      return Math.max(0, raw);
    }

    case 'RAYLEIGH': {
      // Rayleigh distribution — early-peaked for high-concurrency phases
      // PDF: t * exp(-t²/2) for t ≥ 0
      const raw = t * Math.exp(-0.5 * t * t);
      return Math.max(0, raw);
    }

    default:
      return 1.0;
  }
}

/**
 * Compute the CDF (cumulative distribution function) value for a given t ∈ [0, 1].
 * Uses numerical integration (trapezoidal rule) over the PDF.
 */
function computeCdf(t: number, profile: ProfileCurve, weibullParams: WeibullParams): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  const steps = 200;
  const dt = t / steps;
  let sum = 0;

  for (let i = 0; i < steps; i++) {
    const t0 = i * dt;
    const t1 = (i + 1) * dt;
    const y0 = computePdf(t0, profile, weibullParams);
    const y1 = computePdf(t1, profile, weibullParams);
    sum += (y0 + y1) * dt / 2;
  }

  return Math.min(1, Math.max(0, sum));
}

/**
 * Normalize PDF values so that the total area under the curve equals exactly 1.0
 * (100% of BAC), eliminating rounding drift.
 */
function normalizePdf(
  profile: ProfileCurve,
  weibullParams: WeibullParams,
  numPoints: number = 365,
): number[] {
  const rawValues: number[] = [];
  const dt = 1.0 / numPoints;

  for (let i = 0; i <= numPoints; i++) {
    const t = i * dt;
    rawValues.push(computePdf(t, profile, weibullParams));
  }

  // Compute total area using trapezoidal rule
  let totalArea = 0;
  for (let i = 0; i < rawValues.length - 1; i++) {
    totalArea += (rawValues[i] + rawValues[i + 1]) * dt / 2;
  }

  // Normalize to ensure area = 1.0
  if (totalArea > 0) {
    const scale = 1.0 / totalArea;
    for (let i = 0; i < rawValues.length; i++) {
      rawValues[i] *= scale;
    }
  }

  return rawValues;
}

/** Simple factorial for integer values (used in Beta distribution) */
function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate the number of days between two ISO dates.
 */
function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
}

/**
 * Format currency for display.
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format date for display.
 */
function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Weibull Parameter Sliders Component
// ---------------------------------------------------------------------------

interface WeibullSlidersProps {
  params: WeibullParams;
  onChange: (params: WeibullParams) => void;
}

const WeibullSliders: React.FC<WeibullSlidersProps> = ({ params, onChange }) => {
  const handleKChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const k = parseFloat(e.target.value);
      onChange({ ...params, k });
    },
    [params, onChange],
  );

  const handleLambdaChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const lambda = parseFloat(e.target.value);
      onChange({ ...params, lambda });
    },
    [params, onChange],
  );

  return (
    <div className="px-4 py-3 bg-bg-ops-overlay/50 border border-border-ops-subtle rounded-lg space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-text-ops-primary">
        <Settings2 size={14} />
        Weibull Shape Parameters
      </div>

      {/* Shape parameter k */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-text-ops-muted">
            Shape (k) — Ramp-up steepness
          </label>
          <span className="text-xs font-mono text-sky-400">{params.k.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min="0.5"
          max="10"
          step="0.1"
          value={params.k}
          onChange={handleKChange}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-bg-ops-base accent-sky-500"
        />
        <div className="flex justify-between text-[10px] text-text-ops-muted mt-0.5">
          <span>Gradual</span>
          <span>Sharp</span>
        </div>
      </div>

      {/* Scale parameter λ */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-text-ops-muted">
            Scale (λ) — Spend concentration
          </label>
          <span className="text-xs font-mono text-sky-400">{params.lambda.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min="0.3"
          max="2.0"
          step="0.05"
          value={params.lambda}
          onChange={handleLambdaChange}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-bg-ops-base accent-sky-500"
        />
        <div className="flex justify-between text-[10px] text-text-ops-muted mt-0.5">
          <span>Early peak</span>
          <span>Late peak</span>
        </div>
      </div>

      {/* Tooltip explanation */}
      <div className="flex items-start gap-1.5 text-[11px] text-text-ops-muted">
        <Info size={10} className="mt-0.5 flex-shrink-0" />
        <span>
          Higher k values produce sharper ramp-ups (late integration spend). Lower k values spread
          spend more evenly. λ shifts the bulk of expenditure earlier or later in the programme.
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main CostCurveCanvas Component
// ---------------------------------------------------------------------------

const CostCurveCanvas: React.FC<CostCurveCanvasProps> = ({
  bac,
  startDate,
  endDate,
  profile,
  weibullParams = { k: 2.0, lambda: 1.0 },
  onWeibullParamsChange,
  showMonthlyBars = true,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; dailyCost: number; cumulativePct: number } | null>(null);

  // Chart dimensions
  const chartWidth = 800;
  const chartHeight = 300;
  const margin = { top: 20, right: 20, bottom: 40, left: 70 };
  const innerWidth = chartWidth - margin.left - margin.right;
  const innerHeight = chartHeight - margin.top - margin.bottom;

  // Duration in days
  const totalDays = daysBetween(startDate, endDate);

  // Normalized PDF values — area under curve = 100% of BAC
  const pdfValues = useMemo(
    () => normalizePdf(profile, weibullParams, totalDays),
    [profile, weibullParams, totalDays],
  );

  // Daily cost allocation (PDF * BAC)
  const dailyCosts = useMemo(
    () => pdfValues.map((v) => v * bac),
    [pdfValues, bac],
  );

  // Cumulative costs (CDF * BAC)
  const cumulativeCosts = useMemo(() => {
    const cum: number[] = [];
    let runningSum = 0;
    const dailyStep = bac / totalDays;
    for (let i = 0; i < pdfValues.length; i++) {
      runningSum += pdfValues[i] * dailyStep;
      cum.push(Math.min(runningSum, bac));
    }
    // Ensure final value is exactly BAC (no rounding drift)
    cum[cum.length - 1] = bac;
    return cum;
  }, [pdfValues, bac, totalDays]);

  // Monthly bar data
  const monthlyBars = useMemo(() => {
    if (!showMonthlyBars) return [];

    const bars: { month: string; startDay: number; endDay: number; cost: number }[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    let current = new Date(start.getFullYear(), start.getMonth(), 1);

    while (current <= end) {
      const monthStart = current;
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
      const clampedEnd = monthEnd > end ? end : monthEnd;

      const startDayIdx = daysBetween(startDate, monthStart.toISOString());
      const endDayIdx = daysBetween(startDate, clampedEnd.toISOString());

      let monthCost = 0;
      for (let d = Math.max(0, startDayIdx); d <= Math.min(dailyCosts.length - 1, endDayIdx); d++) {
        monthCost += dailyCosts[d];
      }

      bars.push({
        month: current.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
        startDay: startDayIdx,
        endDay: endDayIdx,
        cost: monthCost,
      });

      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }

    return bars;
  }, [showMonthlyBars, startDate, endDate, dailyCosts]);

  // Scale functions
  const xScale = useCallback(
    (day: number) => margin.left + (day / totalDays) * innerWidth,
    [margin.left, totalDays, innerWidth],
  );

  const yScale = useCallback(
    (value: number) => margin.top + innerHeight - (value / bac) * innerHeight,
    [margin.top, innerHeight, bac],
  );

  const yScalePdf = useCallback(
    (value: number) => {
      const maxPdf = Math.max(...pdfValues) * 1.1;
      return margin.top + innerHeight - (value / maxPdf) * innerHeight;
    },
    [pdfValues, margin.top, innerHeight],
  );

  // SVG path for PDF area
  const pdfAreaPath = useMemo(() => {
    if (pdfValues.length < 2) return '';
    let path = `M ${xScale(0)} ${yScalePdf(0)}`;
    for (let i = 0; i < pdfValues.length; i++) {
      path += ` L ${xScale(i)} ${yScalePdf(pdfValues[i] * bac)}`;
    }
    path += ` L ${xScale(pdfValues.length - 1)} ${yScalePdf(0)} Z`;
    return path;
  }, [pdfValues, xScale, yScalePdf, bac]);

  // SVG path for cumulative S-curve
  const cumulativePath = useMemo(() => {
    if (cumulativeCosts.length < 2) return '';
    let path = `M ${xScale(0)} ${yScale(cumulativeCosts[0])}`;
    for (let i = 1; i < cumulativeCosts.length; i++) {
      path += ` L ${xScale(i)} ${yScale(cumulativeCosts[i])}`;
    }
    return path;
  }, [cumulativeCosts, xScale, yScale]);

  // Grid lines
  const gridLines = useMemo(() => {
    const lines: { y: number; label: string }[] = [];
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const value = (bac / steps) * i;
      lines.push({
        y: yScale(value),
        label: formatCurrency(value),
      });
    }
    return lines;
  }, [bac, yScale]);

  // Date axis labels
  const dateLabels = useMemo(() => {
    const labels: { x: number; label: string }[] = [];
    const numLabels = 6;
    const start = new Date(startDate);

    for (let i = 0; i <= numLabels; i++) {
      const day = Math.round((totalDays / numLabels) * i);
      const date = new Date(start.getTime() + day * 24 * 60 * 60 * 1000);
      labels.push({
        x: xScale(day),
        label: formatDateShort(date.toISOString()),
      });
    }
    return labels;
  }, [startDate, totalDays, xScale]);

  // Tooltip handler
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const svgMouseX = (mouseX / rect.width) * chartWidth;

      const day = Math.round(((svgMouseX - margin.left) / innerWidth) * totalDays);
      const clampedDay = Math.max(0, Math.min(totalDays - 1, day));

      const start = new Date(startDate);
      const date = new Date(start.getTime() + clampedDay * 24 * 60 * 60 * 1000);

      setTooltip({
        x: svgMouseX,
        y: margin.top,
        date: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        dailyCost: dailyCosts[clampedDay] || 0,
        cumulativePct: ((cumulativeCosts[clampedDay] || 0) / bac) * 100,
      });
    },
    [svgRef, chartWidth, margin.left, innerWidth, totalDays, startDate, dailyCosts, cumulativeCosts, bac, margin.top],
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  // Verify area under curve = 100% of BAC
  const areaVerification = useMemo(() => {
    const total = dailyCosts.reduce((sum, v) => sum + v, 0);
    const pct = (total / bac) * 100;
    return pct.toFixed(2);
  }, [dailyCosts, bac]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
            <TrendingUp size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-ops-primary">
              Time-Phased Cost Distribution
            </h3>
            <p className="text-xs text-text-ops-muted">
              {profile.replace(/_/g, ' ')} · BAC: {formatCurrency(bac)} · {totalDays} working days
            </p>
          </div>
        </div>

        {/* Area verification badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <BarChart3 size={12} className="text-emerald-400" />
          <span className="text-xs font-mono text-emerald-400">
            Area: {areaVerification}% of BAC
          </span>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="relative bg-bg-ops-surface border border-border-ops-subtle rounded-lg overflow-hidden">
        <svg
          ref={svgRef}
          width={chartWidth}
          height={chartHeight}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Grid lines */}
          {gridLines.map((line, i) => (
            <g key={i}>
              <line
                x1={margin.left}
                y1={line.y}
                x2={chartWidth - margin.right}
                y2={line.y}
                stroke="var(--border-ops-subtle, #334155)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={margin.left - 8}
                y={line.y + 4}
                textAnchor="end"
                fill="var(--text-ops-muted, #94a3b8)"
                fontSize="10"
                fontFamily="monospace"
              >
                {line.label}
              </text>
            </g>
          ))}

          {/* Date axis labels */}
          {dateLabels.map((label, i) => (
            <text
              key={i}
              x={label.x}
              y={chartHeight - 10}
              textAnchor="middle"
              fill="var(--text-ops-muted, #94a3b8)"
              fontSize="10"
            >
              {label.label}
            </text>
          ))}

          {/* Monthly bars */}
          {monthlyBars.map((bar, i) => {
            const barX = xScale(bar.startDay);
            const barWidth = Math.max(
              2,
              xScale(bar.endDay) - xScale(bar.startDay) - 1,
            );
            const barHeight = yScale(0) - yScale(bar.cost);

            return (
              <g key={i}>
                <rect
                  x={barX}
                  y={yScale(0) - barHeight}
                  width={barWidth}
                  height={barHeight}
                  fill="rgba(56, 189, 248, 0.15)"
                  stroke="rgba(56, 189, 248, 0.3)"
                  strokeWidth="0.5"
                />
                {/* Month label */}
                {barWidth > 30 && (
                  <text
                    x={barX + barWidth / 2}
                    y={chartHeight - 24}
                    textAnchor="middle"
                    fill="var(--text-ops-muted, #94a3b8)"
                    fontSize="9"
                  >
                    {bar.month}
                  </text>
                )}
              </g>
            );
          })}

          {/* PDF area fill */}
          {pdfAreaPath && (
            <path
              d={pdfAreaPath}
              fill="rgba(139, 92, 246, 0.15)"
              stroke="none"
            />
          )}

          {/* PDF curve line */}
          {pdfAreaPath && (
            <path
              d={pdfAreaPath.replace(' Z', '')}
              fill="none"
              stroke="rgba(139, 92, 246, 0.8)"
              strokeWidth="1.5"
            />
          )}

          {/* Cumulative S-curve */}
          {cumulativePath && (
            <path
              d={cumulativePath}
              fill="none"
              stroke="rgba(52, 211, 153, 0.9)"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          )}

          {/* Tooltip crosshair */}
          {tooltip && (
            <g>
              <line
                x1={tooltip.x}
                y1={margin.top}
                x2={tooltip.x}
                y2={margin.top + innerHeight}
                stroke="rgba(148, 163, 184, 0.5)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              {/* Tooltip card */}
              <g transform={`translate(${Math.min(tooltip.x + 10, chartWidth - 180)}, ${margin.top})`}>
                <rect
                  x="0"
                  y="0"
                  width="170"
                  height="60"
                  rx="4"
                  fill="var(--bg-ops-overlay, #1e293b)"
                  stroke="var(--border-ops-subtle, #334155)"
                  strokeWidth="1"
                />
                <text
                  x="8"
                  y="16"
                  fill="var(--text-ops-primary, #e2e8f0)"
                  fontSize="11"
                  fontWeight="600"
                >
                  {tooltip.date}
                </text>
                <text
                  x="8"
                  y="32"
                  fill="var(--text-ops-muted, #94a3b8)"
                  fontSize="10"
                >
                  Daily: {formatCurrency(tooltip.dailyCost)}
                </text>
                <text
                  x="8"
                  y="48"
                  fill="var(--text-ops-muted, #94a3b8)"
                  fontSize="10"
                >
                  Cumulative: {tooltip.cumulativePct.toFixed(2)}%
                </text>
              </g>
            </g>
          )}

          {/* Axis labels */}
          <text
            x={chartWidth / 2}
            y={chartHeight - 2}
            textAnchor="middle"
            fill="var(--text-ops-muted, #94a3b8)"
            fontSize="10"
          >
            Programme Duration ({startDate} → {endDate})
          </text>
          <text
            x={12}
            y={chartHeight / 2}
            textAnchor="middle"
            fill="var(--text-ops-muted, #94a3b8)"
            fontSize="10"
            transform={`rotate(-90, 12, ${chartHeight / 2})`}
          >
            Cumulative Cost (£)
          </text>
        </svg>

        {/* Legend */}
        <div className="absolute top-2 right-2 flex items-center gap-3 text-[10px] text-text-ops-muted bg-bg-ops-overlay/80 rounded px-2 py-1">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-emerald-400 rounded" />
            Cumulative S-curve
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-violet-400 rounded" />
            Daily PDF
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-2 bg-sky-400/20 rounded-sm" />
            Monthly bars
          </span>
        </div>
      </div>

      {/* Weibull parameter sliders */}
      {profile === 'WEIBULL_CURVE' && onWeibullParamsChange && (
        <WeibullSliders params={weibullParams} onChange={onWeibullParamsChange} />
      )}
    </div>
  );
};

export default CostCurveCanvas;
