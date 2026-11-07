/**
 * Number Card Widget
 *
 * Large single-value display with trend indicator.
 */

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ChartWidgetProps {
  data: unknown;
  config: unknown;
}

const NumberCardWidget: React.FC<ChartWidgetProps> = ({ data, config }) => {
  const cfg = (config as any) || {};
  const decimals = cfg.decimals ?? 1;

  // Extract value from data
  let value = 0;
  let trend: number | null = null;

  if (typeof data === 'number') {
    value = data;
  } else if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (typeof d.value === 'number') {
      value = d.value;
    } else if (typeof d.data === 'number') {
      value = d.data;
    } else if (typeof d.trend === 'number') {
      trend = d.trend;
    } else if (Array.isArray(d)) {
      const first = d[0] as Record<string, unknown>;
      const keys = Object.keys(first).filter((k) => typeof first[k] === 'number');
      if (keys.length) {
        value = first[keys[0]] as number;
      }
    }
  }

  if (value === 0 && !data) {
    return (
      <div className="flex items-center justify-center h-full text-text-ops-muted text-sm">
        No data available
      </div>
    );
  }

  let trendIcon;
  let trendColor;
  if (trend === null) {
    trendIcon = <Minus className="w-4 h-4" />;
    trendColor = 'text-text-ops-muted';
  } else if (trend > 0) {
    trendIcon = <TrendingUp className="w-4 h-4" />;
    trendColor = 'text-green-400';
  } else {
    trendIcon = <TrendingDown className="w-4 h-4" />;
    trendColor = 'text-red-400';
  }

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <p className="text-4xl font-bold text-text-ops-primary">
        {typeof value === 'number' ? value.toFixed(decimals) : value}
      </p>
      {trend !== null && (
        <div className={`flex items-center gap-1 mt-1 text-sm ${trendColor}`}>
          {trendIcon}
          <span>{Math.abs(trend).toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
};

export default NumberCardWidget;
