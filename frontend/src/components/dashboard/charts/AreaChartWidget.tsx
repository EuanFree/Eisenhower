/**
 * Area Chart Widget
 *
 * Recharts AreaChart with fill gradients.
 */

import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ChartWidgetProps {
  data: unknown;
  config: unknown;
}

const AreaChartWidget: React.FC<ChartWidgetProps> = ({ data, config }) => {
  const cfg = (config as any) || {};
  const colors = cfg.colors || ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

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
  const xAxisField = cfg.xAxisField || keys[0];
  const yAxisFields = cfg.yAxisFields || keys.slice(1).filter((k) => typeof chartData[0]?.[k] === 'number');

  if (!yAxisFields.length) {
    return (
      <div className="flex items-center justify-center h-full text-text-ops-muted text-sm">
        No numeric data to chart
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
        <defs>
          {yAxisFields.map((field: string, i: number) => (
            <linearGradient key={field} id={`grad${field}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors[i % colors.length]} stopOpacity={0.6} />
              <stop offset="100%" stopColor={colors[i % colors.length]} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey={xAxisField} tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1f2937',
            border: '1px solid #374151',
            borderRadius: '6px',
            color: '#e5e7eb',
          }}
        />
        <Legend />
        {yAxisFields.map((field: string, i: number) => (
          <Area key={field} type="monotone" dataKey={field} stroke={colors[i % colors.length]} fill={`url(#grad${field})`} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default AreaChartWidget;
