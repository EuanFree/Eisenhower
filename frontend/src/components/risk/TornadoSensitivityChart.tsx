/**
 * Tornado Sensitivity Chart
 *
 * Horizontal bar chart ranking activities by their Criticality Index — the
 * percentage of Monte Carlo simulation runs in which each activity landed
 * on the Critical Path.  This identifies the primary drivers of programme
 * schedule risk.
 *
 * Features
 * --------
 * 1. **Ranked Bars** — Activities sorted by descending Criticality Index.
 *    The top bars are the activities that most frequently drive the project
 *    finish date.
 *
 * 2. **Color-Coded Bars** — Gradient from green (low criticality) through
 *    amber to red (high criticality).  Activities with a Criticality Index
 *    above 80% are highlighted as primary risk drivers.
 *
 * 3. **Activity Labels** — Each bar shows the WBS code and activity name.
 *
 * 4. **Criticality Percentage** — Monospace percentage label at the end
 *    of each bar.
 *
 * 5. **Hover Details** — Hovering a bar shows the full activity name and
 *    criticality index.
 */

import React, { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { AlertTriangle, BarChart3 } from 'lucide-react';
import type { CriticalityIndex } from '../../types/risk';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TornadoSensitivityChartProps {
  /** Criticality index data, sorted descending */
  criticalityIndices: CriticalityIndex[];
  /** Maximum number of bars to display (default 20) */
  maxBars?: number;
}

// ---------------------------------------------------------------------------
// Chart Constants
// ---------------------------------------------------------------------------

const BAR_HEIGHT = 28;
const BAR_GAP = 4;
const LABEL_WIDTH = 160;
const VALUE_WIDTH = 60;
const CHART_PADDING = 20;

// ---------------------------------------------------------------------------
// Helper: Color interpolation based on criticality
// ---------------------------------------------------------------------------

const getBarColor = (index: number): string => {
  if (index >= 0.8) return '#F87171'; // red
  if (index >= 0.6) return '#FB923C'; // orange
  if (index >= 0.4) return '#FBBF24'; // amber
  if (index >= 0.2) return '#A3E635'; // lime
  return '#34D399'; // green
};

const getBarBgColor = (index: number): string => {
  if (index >= 0.8) return 'rgba(248, 113, 113, 0.15)';
  if (index >= 0.6) return 'rgba(251, 146, 60, 0.15)';
  if (index >= 0.4) return 'rgba(251, 191, 36, 0.15)';
  if (index >= 0.2) return 'rgba(163, 230, 53, 0.15)';
  return 'rgba(52, 211, 153, 0.15)';
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TornadoSensitivityChart: React.FC<TornadoSensitivityChartProps> = ({
  criticalityIndices,
  maxBars = 20,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Sort and limit data
  const sortedData = useMemo(() => {
    return [...criticalityIndices]
      .sort((a, b) => b.criticality_index - a.criticality_index)
      .slice(0, maxBars);
  }, [criticalityIndices, maxBars]);

  const chartWidth = 600;
  const barAreaWidth = chartWidth - LABEL_WIDTH - VALUE_WIDTH - CHART_PADDING * 2;
  const chartHeight = sortedData.length * (BAR_HEIGHT + BAR_GAP) + CHART_PADDING * 2;

  if (sortedData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-text-ops-muted">
        <BarChart3 className="w-8 h-8 mb-3 text-text-ops-muted/50" />
        <p className="text-sm text-center">
          No criticality data available. Run a Monte Carlo simulation first.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-400" />
          <h3 className="text-sm font-semibold text-text-ops-primary">
            Tornado Sensitivity Chart
          </h3>
          <span className="text-xs text-text-ops-muted">
            ({sortedData.length} activities)
          </span>
        </div>
        {hoveredIndex !== null && sortedData[hoveredIndex] && (
          <span className="text-xs font-mono text-text-ops-muted">
            {sortedData[hoveredIndex].name} — {sortedData[hoveredIndex].criticality_index.toFixed(1)}%
          </span>
        )}
      </div>

      {/* Primary Risk Drivers Warning */}
      {sortedData.some((d) => d.criticality_index >= 0.8) && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-red-500/10 border border-red-500/30">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" />
          <p className="text-xs text-red-300/80">
            <span className="font-medium text-red-400">Primary risk drivers detected.</span>{' '}
            Activities with ≥80% criticality index are the main drivers of schedule uncertainty.
          </p>
        </div>
      )}

      {/* Chart */}
      <div className="w-full overflow-x-auto">
        <div
          className="min-w-[500px]"
          style={{ height: Math.min(chartHeight, 500) }}
        >
          <svg
            width={chartWidth}
            height={Math.min(chartHeight, 500)}
            viewBox={`0 0 ${chartWidth} ${Math.min(chartHeight, 500)}`}
            role="img"
            aria-label="Tornado sensitivity chart ranking activities by criticality index"
          >
            {sortedData.map((item, i) => {
              const y = CHART_PADDING + i * (BAR_HEIGHT + BAR_GAP);
              const barWidth = (item.criticality_index * 100) / 100 * barAreaWidth;
              const color = getBarColor(item.criticality_index);
              const isHovered = hoveredIndex === i;

              return (
                <g
                  key={item.node_id}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  className="cursor-pointer"
                >
                  {/* Background track */}
                  <rect
                    x={LABEL_WIDTH + CHART_PADDING}
                    y={y}
                    width={barAreaWidth}
                    height={BAR_HEIGHT}
                    rx="3"
                    fill={getBarBgColor(item.criticality_index)}
                    opacity={isHovered ? 0.8 : 0.5}
                  />

                  {/* Filled bar */}
                  <rect
                    x={LABEL_WIDTH + CHART_PADDING}
                    y={y}
                    width={Math.max(barWidth, 2)}
                    height={BAR_HEIGHT}
                    rx="3"
                    fill={color}
                    opacity={isHovered ? 1 : 0.8}
                  />

                  {/* Activity label */}
                  <text
                    x={LABEL_WIDTH / 2}
                    y={y + BAR_HEIGHT / 2 + 4}
                    textAnchor="middle"
                    fill="#F8FAFC"
                    fontSize="11"
                    fontFamily="monospace"
                  >
                    {item.code.length > 12 ? `...${item.code.slice(-12)}` : item.code}
                  </text>

                  {/* Criticality percentage */}
                  <text
                    x={LABEL_WIDTH + CHART_PADDING + barAreaWidth + 8}
                    y={y + BAR_HEIGHT / 2 + 4}
                    textAnchor="start"
                    fill={color}
                    fontSize="11"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    {(item.criticality_index * 100).toFixed(0)}%
                  </text>

                  {/* Hover highlight */}
                  {isHovered && (
                    <rect
                      x={0}
                      y={y - 2}
                      width={chartWidth}
                      height={BAR_HEIGHT + 4}
                      rx="4"
                      fill="rgba(255, 255, 255, 0.05)"
                    />
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <span className="text-text-ops-muted">Criticality:</span>
        {[
          { label: '≥80% Primary', color: '#F87171' },
          { label: '60-79% High', color: '#FB923C' },
          { label: '40-59% Medium', color: '#FBBF24' },
          { label: '20-39% Low', color: '#A3E635' },
          { label: '<20% Minimal', color: '#34D399' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: item.color }} />
            <span className="text-text-ops-muted">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TornadoSensitivityChart;
