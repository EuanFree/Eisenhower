/**
 * Scatter Chart Widget
 *
 * Recharts ScatterChart with axis labels.
 */

import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ChartWidgetProps {
  data: unknown;
  config: unknown;
}

const ScatterChartWidget: React.FC<ChartWidgetProps> = ({ data, config }) => {
  const cfg = (config as any) || {};
  const color = cfg.colors?.[0] || '#3b82f6';

  let chartData: Record<string, unknown>[] = [];
  if (Array.isArray(data)) {
    chartData = data as Record<string, unknown>[];
  } else if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (d.data && Array.isArray(d.data)) {
      chartData = d.data;
    }
  }

  if (!chartData.length) {
    return (
      <div className="flex items-center justify-center h-full text-text-ops-muted text-sm">
        No data available
      </div>
    );
  }

  const keys = Object.keys(chartData[0] || {});
  const numericKeys = keys.filter((k) => typeof chartData[0]?.[k] === 'number');
  const xField = cfg.xAxisField || numericKeys[0] || keys[0];
  const yField = cfg.yAxisFields?.[0] || numericKeys[1] || keys[1];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey={xField} type="number" tick={{ fill: '#9ca3af', fontSize: 11 }} name={xField} />
        <YAxis dataKey={yField} type="number" tick={{ fill: '#9ca3af', fontSize: 11 }} name={yField} />
        <ZAxis type="number" range={[50, 50]} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1f2937',
            border: '1px solid #374151',
            borderRadius: '6px',
            color: '#e5e7eb',
          }}
        />
        <Scatter data={chartData} fill={color} />
      </ScatterChart>
    </ResponsiveContainer>
  );
};

export default ScatterChartWidget;
