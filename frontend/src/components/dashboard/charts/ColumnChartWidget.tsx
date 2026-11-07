/**
 * Column Chart Widget
 *
 * Recharts BarChart with grouped/stacked support.
 */

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ChartWidgetProps {
  data: unknown;
  config: unknown;
}

const ColumnChartWidget: React.FC<ChartWidgetProps> = ({ data, config }) => {
  const cfg = (config as any) || {};
  const colors = cfg.colors || ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
  const stacked = cfg.stacked || false;

  // Handle different data formats
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

  // Auto-detect fields
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
      <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
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
          <Bar key={field} dataKey={field} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} stackId={stacked ? 'a' : undefined} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

export default ColumnChartWidget;
