/**
 * Gauge Widget
 *
 * Recharts RadialBarChart as a circular gauge with threshold colors.
 */

import React from 'react';
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts';

interface ChartWidgetProps {
  data: unknown;
  config: unknown;
}

const GaugeWidget: React.FC<ChartWidgetProps> = ({ data, config }) => {
  const cfg = (config as any) || {};
  const gaugeMin = cfg.gaugeMin ?? 0;
  const gaugeMax = cfg.gaugeMax ?? 100;
  const thresholds = cfg.gaugeThresholds || [
    { value: 0, color: '#ef4444' },
    { value: 50, color: '#f59e0b' },
    { value: 80, color: '#10b981' },
  ];

  // Extract value from data
  let value = 0;
  if (typeof data === 'number') {
    value = data;
  } else if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (typeof d.value === 'number') {
      value = d.value;
    } else if (typeof d.data === 'number') {
      value = d.data;
    } else if (Array.isArray(d)) {
      // First row, first numeric field
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

  const percentage = Math.min(100, Math.max(0, ((value - gaugeMin) / (gaugeMax - gaugeMin)) * 100));

  // Determine color based on thresholds
  let color = '#3b82f6';
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (percentage >= thresholds[i].value) {
      color = thresholds[i].color;
      break;
    }
  }

  const chartData = [{ name: 'value', value: percentage, fill: color }];

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <ResponsiveContainer width="100%" height="70%">
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="60%"
          outerRadius="100%"
          data={chartData}
          startAngle={180}
          endAngle={0}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} />
          <RadialBar dataKey="value" cornerRadius={10} background={{ fill: '#374151' }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="text-center mt-2">
        <p className="text-2xl font-bold text-text-ops-primary">{value.toFixed(cfg.decimals ?? 1)}</p>
        <p className="text-xs text-text-ops-muted">{percentage.toFixed(0)}%</p>
      </div>
    </div>
  );
};

export default GaugeWidget;
