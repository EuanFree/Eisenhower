/**
 * Widget Editor Component
 *
 * Modal/panel for editing widget title, data source, and display options.
 * Placeholder for Step 5 — will be fully implemented with DataSourceSelector
 * and SqlQueryBuilder.
 */

import React, { useState } from 'react';
import { X, Database, Code } from 'lucide-react';
import { useDashboardStore } from '../../stores/useDashboardStore';
import type { DataSourceType } from '../../types/dashboard';

interface WidgetEditorProps {
  widgetId: string;
  onClose: () => void;
}

const WidgetEditor: React.FC<WidgetEditorProps> = ({ widgetId, onClose }) => {
  const { currentDashboard, updateWidget } = useDashboardStore();
  const widget = currentDashboard?.widgets.find((w) => w.id === widgetId);
  if (!widget) return null;

  const [title, setTitle] = useState(widget.title);
  const [dataSourceType, setDataSourceType] = useState<DataSourceType>(widget.data_source_type);
  const [endpointUrl, setEndpointUrl] = useState(
    (widget.data_source_config as any)?.url || ''
  );
  const [jsonPath, setJsonPath] = useState(
    (widget.data_source_config as any)?.jsonPath || ''
  );
  const [sqlQuery, setSqlQuery] = useState(
    (widget.data_source_config as any)?.sql || ''
  );

  const handleSave = async () => {
    let data_source_config;
    if (dataSourceType === 'ENDPOINT') {
      data_source_config = { url: endpointUrl, jsonPath };
    } else {
      data_source_config = { sql: sqlQuery };
    }

    await updateWidget(widgetId, {
      title,
      data_source_type: dataSourceType,
      data_source_config,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface-ops-panel border border-border-ops-border rounded-xl shadow-2xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-ops-subtle">
          <h2 className="text-base font-semibold text-text-ops-primary">Edit Widget</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-ops-hover text-text-ops-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
              Widget Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-ops-input border border-border-ops-border rounded-lg outline-none focus:border-blue-500 text-text-ops-primary"
            />
          </div>

          {/* Data Source Type */}
          <div>
            <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
              Data Source
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setDataSourceType('ENDPOINT')}
                className={`
                  flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors
                  ${dataSourceType === 'ENDPOINT'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                    : 'border-border-ops-border text-text-ops-muted hover:border-border-ops-border'
                  }
                `}
              >
                <Database className="w-4 h-4" />
                API Endpoint
              </button>
              <button
                onClick={() => setDataSourceType('SQL_QUERY')}
                className={`
                  flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors
                  ${dataSourceType === 'SQL_QUERY'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                    : 'border-border-ops-border text-text-ops-muted hover:border-border-ops-border'
                  }
                `}
              >
                <Code className="w-4 h-4" />
                SQL Query
              </button>
            </div>
          </div>

          {/* Endpoint Config */}
          {dataSourceType === 'ENDPOINT' && (
            <>
              <div>
                <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
                  Endpoint URL
                </label>
                <input
                  type="text"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="/api/v1/cockpit/summary"
                  className="w-full px-3 py-2 text-sm bg-surface-ops-input border border-border-ops-border rounded-lg outline-none focus:border-blue-500 text-text-ops-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
                  JSON Path
                </label>
                <input
                  type="text"
                  value={jsonPath}
                  onChange={(e) => setJsonPath(e.target.value)}
                  placeholder="data.tasks"
                  className="w-full px-3 py-2 text-sm bg-surface-ops-input border border-border-ops-border rounded-lg outline-none focus:border-blue-500 text-text-ops-primary"
                />
              </div>
            </>
          )}

          {/* SQL Config */}
          {dataSourceType === 'SQL_QUERY' && (
            <div>
              <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
                SQL Query
              </label>
              <textarea
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                placeholder="SELECT status, COUNT(*) FROM portfolio_nodes GROUP BY status"
                rows={4}
                className="w-full px-3 py-2 text-sm font-mono bg-surface-ops-input border border-border-ops-border rounded-lg outline-none focus:border-blue-500 text-text-ops-primary resize-none"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-ops-subtle">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg text-text-ops-muted hover:bg-surface-ops-hover"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default WidgetEditor;
