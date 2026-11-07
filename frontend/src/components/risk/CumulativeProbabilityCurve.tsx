/**
 * Cumulative Probability Distribution Curve (S-Curve)
 *
 * SVG chart displaying the cumulative distribution of project completion
 * dates from the Monte Carlo simulation.  The S-curve shows the probability
 * that the project will finish by a given date.
 *
 * Features
 * --------
 * 1. **S-Curve** — Smooth SVG path connecting the distribution points
 *    returned by the backend (~50 points).
 *
 * 2. **Percentile Markers** — Vertical reference lines for P50 (green),
 *    P80 (amber, standard defence baseline), and P90 (red, contractual
 *    guarantee).
 *
 * 3. **Deterministic CPM Finish** — Dashed line showing the deterministic
 *    CPM finish date to visually reveal the schedule optimism gap between
 *    the point estimate and the probabilistic distribution.
 *
 * 4. **Axes** — X-axis shows completion dates, Y-axis shows cumulative
 *    probability (0% to 100%).
 *
 * 5. **Hover Tooltip** — Shows the exact date and probability at the
 *    cursor position.
 */

import React, { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { TrendingUp } from 'lucide-react';
import type { MonteCarloResult } from '../../types/risk';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CumulativeProbabilityCurveProps {
  /** Simulation result data */
  result: MonteCarloResult;
  /** Optional deterministic CPM finish date (ISO string) */
  cpmFinishDate?: string;
}

// ---------------------------------------------------------------------------
// Chart Dimensions
// ---------------------------------------------------------------------------

const MARGIN = { top: 30, right: 30, bottom: 50, left: 60 };
const CHART_WIDTH = 700;
const CHART_HEIGHT = 350;
const INNER_WIDTH = CHART_WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

// ---------------------------------------------------------------------------
// Helper: Parse ISO date to Date object
// ---------------------------------------------------------------------------

const parseDate = (iso: string): Date => new Date(iso);

// ---------------------------------------------------------------------------
// Helper: Format date as short string
// ---------------------------------------------------------------------------

const formatDate = (d: Date): string => {
  const day = d.getDate().toString().padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CumulativeProbabilityCurve: React.FC<CumulativeProbabilityCurveProps> = ({
  result,
  cpmFinishDate,
}) => {
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number; percentile: number; date: string } | null>(null);

  // Compute chart data
  const { points, xScale, yScale, xDomain, yDomain, percentileMarkers } = useMemo(() => {
    const distPoints = result.distribution_points
      .map((p) => ({
        percentile: p.percentile,
        date: parseDate(p.date),
        dateStr: p.date,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (distPoints.length === 0) {
      return {
        points: [] as { x: number; y: number; percentile: number; date: string }[],
        xScale: (d: Date) => 0,
        yScale: (p: number) => 0,
        xDomain: [new Date(), new Date()],
        yDomain: [0, 100] as [number, number],
        percentileMarkers: [] as { label: string; date: Date; color: string; x: number }[],
      };
    }

    const minDate = distPoints[0].date;
    const maxDate = distPoints[distPoints.length - 1].date;
    const xDomain: [Date, Date] = [minDate, maxDate];
    const yDomain: [number, number] = [0, 100];

    const xScale = (d: Date) => {
      const range = maxDate.getTime() - minDate.getTime();
      if (range === 0) return MARGIN.left + INNER_WIDTH / 2;
      return MARGIN.left + ((d.getTime() - minDate.getTime()) / range) * INNER_WIDTH;
    };

    const yScale = (p: number) => {
      return MARGIN.top + INNER_HEIGHT - (p / 100) * INNER_HEIGHT;
    };

    const points = distPoints.map((p) => ({
      x: xScale(p.date),
      y: yScale(p.percentile),
      percentile: p.percentile,
      date: p.dateStr,
    }));

    // Percentile markers
    const markers: { label: string; date: Date; color: string; x: number }[] = [];
    const percentileColors: Record<string, string> = {
      P50: '#34D399', // green
      P80: '#FBBF24', // amber
      P90: '#F87171', // red
    };

    for (const [label, color] of Object.entries(percentileColors)) {
      const dateStr = result.percentiles[label];
      if (dateStr) {
        const d = parseDate(dateStr);
        markers.push({ label, date: d, color, x: xScale(d) });
      }
    }

    return { points, xScale, yScale, xDomain, yDomain, percentileMarkers: markers };
  }, [result]);

  // Build SVG path for the S-curve
  const curvePath = useMemo(() => {
    if (points.length < 2) return '';
    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x},${points[i].y}`;
    }
    return d;
  }, [points]);

  // Build area fill path
  const areaPath = useMemo(() => {
    if (points.length < 2) return '';
    const bottomY = yScale(0);
    let d = `M ${points[0].x},${bottomY} L ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x},${points[i].y}`;
    }
    d += ` L ${points[points.length - 1].x},${bottomY} Z`;
    return d;
  }, [points, yScale]);

  // CPM finish date marker
  const cpmMarker = useMemo(() => {
    if (!cpmFinishDate) return null;
    const d = parseDate(cpmFinishDate);
    return { date: d, x: xScale(d) };
  }, [cpmFinishDate, xScale]);

  // Generate X-axis tick labels
  const xTicks = useMemo(() => {
    if (xDomain[0].getTime() === xDomain[1].getTime()) return [];
    const tickCount = 6;
    const ticks: Date[] = [];
    for (let i = 0; i <= tickCount; i++) {
      const t = xDomain[0].getTime() + (i / tickCount) * (xDomain[1].getTime() - xDomain[0].getTime());
      ticks.push(new Date(t));
    }
    return ticks;
  }, [xDomain]);

  // Generate Y-axis tick labels
  const yTicks = [0, 20, 40, 60, 80, 100];

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-400" />
          <h3 className="text-sm font-semibold text-text-ops-primary">
            Cumulative Probability Distribution
          </h3>
        </div>
        {hoverPoint && (
          <span className="text-xs font-mono text-text-ops-muted">
            {hoverPoint.percentile.toFixed(1)}% → {hoverPoint.date}
          </span>
        )}
      </div>

      {/* SVG Chart */}
      <div className="w-full overflow-x-auto">
        <svg
          width={CHART_WIDTH}
          height={CHART_HEIGHT}
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="min-w-[600px]"
          role="img"
          aria-label="Cumulative probability distribution S-curve chart"
        >
          {/* Background */}
          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={INNER_WIDTH}
            height={INNER_HEIGHT}
            fill="rgba(30, 41, 59, 0.5)"
            rx="4"
          />

          {/* Grid lines */}
          {yTicks.map((tick) => (
            <line
              key={`y-${tick}`}
              x1={MARGIN.left}
              y1={yScale(tick)}
              x2={MARGIN.left + INNER_WIDTH}
              y2={yScale(tick)}
              stroke="rgba(51, 65, 85, 0.5)"
              strokeWidth="1"
              strokeDasharray="4,4"
            />
          ))}

          {/* Area fill */}
          {areaPath && (
            <path
              d={areaPath}
              fill="url(#areaGradient)"
              opacity="0.3"
            />
          )}

          {/* Gradient definition */}
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* S-Curve */}
          {curvePath && (
            <path
              d={curvePath}
              fill="none"
              stroke="#3B82F6"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          )}

          {/* Interactive overlay for hover */}
          {points.map((point, i) => (
            <circle
              key={i}
              cx={point.x}
              cy={point.y}
              r="12"
              fill="transparent"
              onMouseEnter={() => setHoverPoint(point)}
              onMouseLeave={() => setHoverPoint(null)}
            />
          ))}

          {/* Hover indicator */}
          {hoverPoint && (
            <>
              <line
                x1={hoverPoint.x}
                y1={MARGIN.top}
                x2={hoverPoint.x}
                y2={MARGIN.top + INNER_HEIGHT}
                stroke="rgba(255, 255, 255, 0.3)"
                strokeWidth="1"
                strokeDasharray="4,4"
              />
              <circle
                cx={hoverPoint.x}
                cy={hoverPoint.y}
                r="4"
                fill="#3B82F6"
                stroke="white"
                strokeWidth="2"
              />
            </>
          )}

          {/* Percentile markers */}
          {percentileMarkers.map((marker) => (
            <g key={marker.label}>
              <line
                x1={marker.x}
                y1={MARGIN.top}
                x2={marker.x}
                y2={MARGIN.top + INNER_HEIGHT}
                stroke={marker.color}
                strokeWidth="2"
                strokeDasharray="6,4"
              />
              {/* Label at top */}
              <rect
                x={marker.x - 20}
                y={MARGIN.top - 20}
                width="40"
                height="16"
                rx="3"
                fill={marker.color}
                opacity="0.2"
              />
              <text
                x={marker.x}
                y={MARGIN.top - 8}
                textAnchor="middle"
                fill={marker.color}
                fontSize="10"
                fontWeight="bold"
              >
                {marker.label}
              </text>
              {/* Date label at bottom */}
              <text
                x={marker.x}
                y={MARGIN.top + INNER_HEIGHT + 14}
                textAnchor="middle"
                fill={marker.color}
                fontSize="9"
                fontFamily="monospace"
              >
                {formatDate(marker.date)}
              </text>
            </g>
          ))}

          {/* CPM deterministic finish marker */}
          {cpmMarker && (
            <g>
              <line
                x1={cpmMarker.x}
                y1={MARGIN.top}
                x2={cpmMarker.x}
                y2={MARGIN.top + INNER_HEIGHT}
                stroke="#94A3B8"
                strokeWidth="1.5"
                strokeDasharray="2,4"
              />
              <text
                x={cpmMarker.x}
                y={MARGIN.top - 24}
                textAnchor="middle"
                fill="#94A3B8"
                fontSize="9"
                fontFamily="monospace"
              >
                CPM: {formatDate(cpmMarker.date)}
              </text>
            </g>
          )}

          {/* X-axis labels */}
          {xTicks.map((tick, i) => (
            <text
              key={`x-${i}`}
              x={xScale(tick)}
              y={MARGIN.top + INNER_HEIGHT + 30}
              textAnchor="middle"
              fill="#94A3B8"
              fontSize="10"
              fontFamily="monospace"
            >
              {formatDate(tick)}
            </text>
          ))}

          {/* Y-axis labels */}
          {yTicks.map((tick) => (
            <text
              key={`y-label-${tick}`}
              x={MARGIN.left - 8}
              y={yScale(tick) + 4}
              textAnchor="end"
              fill="#94A3B8"
              fontSize="10"
              fontFamily="monospace"
            >
              {tick}%
            </text>
          ))}

          {/* Axis titles */}
          <text
            x={MARGIN.left + INNER_WIDTH / 2}
            y={CHART_HEIGHT - 5}
            textAnchor="middle"
            fill="#94A3B8"
            fontSize="11"
          >
            Completion Date
          </text>
          <text
            x={15}
            y={MARGIN.top + INNER_HEIGHT / 2}
            textAnchor="middle"
            fill="#94A3B8"
            fontSize="11"
            transform={`rotate(-90, 15, ${MARGIN.top + INNER_HEIGHT / 2})`}
          >
            Cumulative Probability
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-blue-500" />
          <span className="text-text-ops-muted">S-Curve</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-green-400" style={{ borderTop: '2px dashed #34D399' }} />
          <span className="text-text-ops-muted">P50 (Median)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-amber-400" style={{ borderTop: '2px dashed #FBBF24' }} />
          <span className="text-text-ops-muted">P80 (Defence Baseline)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-red-400" style={{ borderTop: '2px dashed #F87171' }} />
          <span className="text-text-ops-muted">P90 (Guarantee)</span>
        </div>
        {cpmFinishDate && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5" style={{ borderTop: '1.5px dashed #94A3B8' }} />
            <span className="text-text-ops-muted">Deterministic CPM</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CumulativeProbabilityCurve;
