/**
 * Burndown Chart Widget
 *
 * Dual-line chart (ideal + actual) with area fill.
 */

import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area } from 'recharts';

interface ChartWidgetProps {
  data: unknown;
  config: unknown;
}

const BurndownChartWidget: React.FC<ChartWidgetProps> = ({ data }) => {
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
  const xAxisField = keys.find((k) => !['ideal', 'actual'].includes(k.toLowerCase())) || keys[0];
  const idealField = keys.find((k) => k.toLowerCase().includes('ideal')) || keys[1];
  const actualField = keys.find((k) => k.toLowerCase().includes('actual')) || keys[2];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
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
        {idealField && (
          <Line type="monotone" dataKey={idealField} stroke="#6b7280" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Ideal" />
        )}
        {actualField && (
          <Line type="monotone" dataKey={actualField} stroke="#3b82f6" strokeWidth={2} dot={false} name="Actual" />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
};

export default BurndownChartWidget;
