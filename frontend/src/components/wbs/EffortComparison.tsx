import React from 'react';

interface EffortComparisonProps {
  baselineEffort: number | null | undefined;
  agileActualEffort: number | null | undefined;
}

/**
 * EffortComparison component displays the comparison between the original
 * Waterfall estimate (baseline) and the sum of Agile subtask durations.
 *
 * Shows a visual bar comparison with variance percentage.
 */
const EffortComparison: React.FC<EffortComparisonProps> = ({
  baselineEffort,
  agileActualEffort,
}) => {
  if (baselineEffort == null && agileActualEffort == null) {
    return null;
  }

  const baseline = baselineEffort ?? 0;
  const actual = agileActualEffort ?? 0;

  // Calculate variance
  const variance = actual - baseline;
  const variancePercent = baseline > 0 ? ((variance / baseline) * 100) : 0;

  // Determine color based on variance
  const getVarianceColor = () => {
    if (Math.abs(variancePercent) <= 10) return 'text-green-600';
    if (variancePercent > 0) return 'text-red-600';
    return 'text-yellow-600';
  };

  const getVarianceIcon = () => {
    if (Math.abs(variancePercent) <= 10) return '✓';
    if (variancePercent > 0) return '↑';
    return '↓';
  };

  // Calculate bar widths (max 100%)
  const maxEffort = Math.max(baseline, actual, 1);
  const baselineWidth = (baseline / maxEffort) * 100;
  const actualWidth = (actual / maxEffort) * 100;

  return (
    <div className="flex flex-col gap-1 min-w-[180px]">
      {/* Summary line */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">Baseline vs Agile</span>
        <span className={`font-medium ${getVarianceColor()}`}>
          {getVarianceIcon()} {variancePercent >= 0 ? '+' : ''}{variancePercent.toFixed(1)}%
        </span>
      </div>

      {/* Baseline bar */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 w-16">Baseline</span>
        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-blue-400 rounded-full transition-all duration-300"
            style={{ width: `${baselineWidth}%` }}
          />
        </div>
        <span className="text-xs text-gray-600 w-12 text-right">
          {baseline.toFixed(1)}d
        </span>
      </div>

      {/* Actual bar */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 w-16">Agile</span>
        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              variancePercent > 10
                ? 'bg-red-400'
                : variancePercent < -10
                ? 'bg-yellow-400'
                : 'bg-green-400'
            }`}
            style={{ width: `${actualWidth}%` }}
          />
        </div>
        <span className="text-xs text-gray-600 w-12 text-right">
          {actual.toFixed(1)}d
        </span>
      </div>

      {/* Variance detail */}
      <div className="text-xs text-gray-400">
        Variance: {variance >= 0 ? '+' : ''}{variance.toFixed(1)} working days
      </div>
    </div>
  );
};

export default EffortComparison;
