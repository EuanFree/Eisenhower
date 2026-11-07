/**
 * Table Widget
 *
 * Sortable data table display.
 */

import React, { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface ChartWidgetProps {
  data: unknown;
  config: unknown;
}

const TableWidget: React.FC<ChartWidgetProps> = ({ data }) => {
  let rows: Record<string, unknown>[] = [];
  if (Array.isArray(data)) {
    rows = data as Record<string, unknown>[];
  } else if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (d.data && Array.isArray(d.data)) {
      rows = d.data;
    }
  }

  const [sortKey, setSortKey] = useState<string>('');
  const [sortAsc, setSortAsc] = useState(true);

  const columns = rows.length ? Object.keys(rows[0]) : [];

  const sortedRows = [...rows].sort((a, b) => {
    if (!sortKey) return 0;
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortAsc ? aVal - bVal : bVal - aVal;
    }
    return sortAsc
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  if (!rows.length) {
    return (
      <div className="flex items-center justify-center h-full text-text-ops-muted text-sm">
        No data available
      </div>
    );
  }

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface-ops-panel">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="text-left px-3 py-2 text-xs font-medium text-text-ops-muted border-b border-border-ops-subtle cursor-pointer hover:text-text-ops-primary select-none whitespace-nowrap"
                onClick={() => handleSort(col)}
              >
                <div className="flex items-center gap-1">
                  {col}
                  {sortKey === col && (
                    sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => (
            <tr key={i} className="hover:bg-surface-ops-hover">
              {columns.map((col) => (
                <td key={col} className="px-3 py-1.5 text-text-ops-primary whitespace-nowrap text-xs">
                  {row[col] != null ? String(row[col]) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TableWidget;
