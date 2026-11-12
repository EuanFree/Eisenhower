/**
 * Widget Editor Component
 *
 * Modal for editing widget title, data source, display options, and
 * widget-type-specific properties (gauge thresholds, chart colors, etc.).
 */

import React, { useState, useEffect, useMemo } from 'react';
import { X, Database, Code, Settings, Palette, BarChart3, TrendingUp, Activity, Gauge, TrendingDown, ScatterChart, Hash, Table } from 'lucide-react';
import { useDashboardStore } from '../../stores/useDashboardStore';
import type { DataSourceType, WidgetType } from '../../types/dashboard';

interface WidgetEditorProps {
  widgetId: string;
  onClose: () => void;
}

const WIDGET_TYPE_LABELS: Record<WidgetType, string> = {
  COLUMN_CHART: 'Column Chart',
  LINE_CHART: 'Line Chart',
  AREA_CHART: 'Area Chart',
  GAUGE: 'Gauge',
  BURNDOWN: 'Burndown',
  SCATTER: 'Scatter Plot',
  NUMBER_CARD: 'Number Card',
  TABLE: 'Table',
};

const WIDGET_TYPE_ICONS: Record<WidgetType, React.ElementType> = {
  COLUMN_CHART: BarChart3,
  LINE_CHART: TrendingUp,
  AREA_CHART: Activity,
  GAUGE: Gauge,
  BURNDOWN: TrendingDown,
  SCATTER: ScatterChart,
  NUMBER_CARD: Hash,
  TABLE: Table,
};

const WidgetEditor: React.FC<WidgetEditorProps> = ({ widgetId, onClose }) => {
  const { currentDashboard, updateWidget } = useDashboardStore();
  const widget = currentDashboard?.widgets.find((w) => w.id === widgetId);
  if (!widget) return null;

  const [activeTab, setActiveTab] = useState<'general' | 'data' | 'display'>('general');

  // General settings
  const [title, setTitle] = useState(widget.title);
  const [widgetType, setWidgetType] = useState<WidgetType>(widget.widget_type);

  // Data source settings
  const [dataSourceType, setDataSourceType] = useState<DataSourceType>(widget.data_source_type);
  const [endpointUrl, setEndpointUrl] = useState(
    (widget.data_source_config as any)?.url || ''
  );
  const [jsonPath, setJsonPath] = useState(
    (widget.data_source_config as any)?.jsonPath || ''
  );
  const [refreshInterval, setRefreshInterval] = useState(
    (widget.data_source_config as any)?.refreshInterval || 30
  );
  const [sqlQuery, setSqlQuery] = useState(
    (widget.data_source_config as any)?.sql || ''
  );

  // Display config settings
  const displayCfg = useMemo(() => (widget.display_config as any) || {}, [widget.display_config]);
  const [chartColor, setChartColor] = useState(displayCfg.chartColor || '#3b82f6');
  const [chartColors, setChartColors] = useState(displayCfg.chartColors || ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']);
  const [showLegend, setShowLegend] = useState(displayCfg.showLegend ?? true);
  const [showGrid, setShowGrid] = useState(displayCfg.showGrid ?? true);
  const [showTooltip, setShowTooltip] = useState(displayCfg.showTooltip ?? true);
  const [fontSize, setFontSize] = useState(displayCfg.fontSize || 'medium');

  // Gauge-specific settings
  const [gaugeMin, setGaugeMin] = useState(displayCfg.gaugeMin ?? 0);
  const [gaugeMax, setGaugeMax] = useState(displayCfg.gaugeMax ?? 100);
  const [gaugeDecimals, setGaugeDecimals] = useState(displayCfg.decimals ?? 1);
  const [gaugeThresholds, setGaugeThresholds] = useState<Array<{ value: number; color: string }>>(displayCfg.gaugeThresholds || [
    { value: 0, color: '#ef4444' },
    { value: 50, color: '#f59e0b' },
    { value: 80, color: '#10b981' },
  ]);

  // Sync state when widget changes (e.g., after save)
  useEffect(() => {
    setTitle(widget.title);
    setWidgetType(widget.widget_type);
    setDataSourceType(widget.data_source_type);
    const dsc = widget.data_source_config as any || {};
    setEndpointUrl(dsc.url || '');
    setJsonPath(dsc.jsonPath || '');
    setRefreshInterval(dsc.refreshInterval || 30);
    setSqlQuery(dsc.sql || '');
    const dc = widget.display_config as any || {};
    setChartColor(dc.chartColor || '#3b82f6');
    setChartColors(dc.chartColors || ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']);
    setShowLegend(dc.showLegend ?? true);
    setShowGrid(dc.showGrid ?? true);
    setShowTooltip(dc.showTooltip ?? true);
    setFontSize(dc.fontSize || 'medium');
    setGaugeMin(dc.gaugeMin ?? 0);
    setGaugeMax(dc.gaugeMax ?? 100);
    setGaugeDecimals(dc.decimals ?? 1);
    setGaugeThresholds(dc.gaugeThresholds || [
      { value: 0, color: '#ef4444' },
      { value: 50, color: '#f59e0b' },
      { value: 80, color: '#10b981' },
    ] as Array<{ value: number; color: string }>);
  }, [widget.id, widget.updated_at]);

  const handleSave = async () => {
    let data_source_config;
    if (dataSourceType === 'ENDPOINT') {
      data_source_config = { url: endpointUrl, jsonPath, refreshInterval };
    } else {
      data_source_config = { sql: sqlQuery, refreshInterval };
    }

    // Build display config based on widget type
    const display_config: Record<string, unknown> = {
      chartColor,
      chartColors,
      showLegend,
      showGrid,
      showTooltip,
      fontSize,
    };

    // Add gauge-specific config
    if (widgetType === 'GAUGE') {
      display_config.gaugeMin = gaugeMin;
      display_config.gaugeMax = gaugeMax;
      display_config.decimals = gaugeDecimals;
      display_config.gaugeThresholds = gaugeThresholds;
    }

    await updateWidget(widgetId, {
      title,
      widget_type: widgetType,
      data_source_type: dataSourceType,
      data_source_config,
      display_config,
    });
    onClose();
  };

  const WidgetIcon = WIDGET_TYPE_ICONS[widgetType] || Hash;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface-ops-panel border border-border-ops-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-ops-subtle flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <WidgetIcon className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text-ops-primary">Edit Widget</h2>
              <p className="text-xs text-text-ops-muted">{WIDGET_TYPE_LABELS[widgetType]}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-ops-hover text-text-ops-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-5 py-2 border-b border-border-ops-subtle flex-shrink-0">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              activeTab === 'general'
                ? 'bg-blue-500/10 text-blue-400'
                : 'text-text-ops-muted hover:text-text-ops-primary hover:bg-surface-ops-hover'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            General
          </button>
          <button
            onClick={() => setActiveTab('data')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              activeTab === 'data'
                ? 'bg-blue-500/10 text-blue-400'
                : 'text-text-ops-muted hover:text-text-ops-primary hover:bg-surface-ops-hover'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Data Source
          </button>
          <button
            onClick={() => setActiveTab('display')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              activeTab === 'display'
                ? 'bg-blue-500/10 text-blue-400'
                : 'text-text-ops-muted hover:text-text-ops-primary hover:bg-surface-ops-hover'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            Display
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* General Tab */}
          {activeTab === 'general' && (
            <>
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
              <div>
                <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
                  Widget Type
                </label>
                <select
                  value={widgetType}
                  onChange={(e) => setWidgetType(e.target.value as WidgetType)}
                  className="w-full px-3 py-2 text-sm bg-surface-ops-input border border-border-ops-border rounded-lg outline-none focus:border-blue-500 text-text-ops-primary"
                >
                  {Object.entries(WIDGET_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Data Source Tab */}
          {activeTab === 'data' && (
            <>
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

              <div>
                <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
                  Refresh Interval (seconds)
                </label>
                <input
                  type="number"
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  min={5}
                  max={3600}
                  className="w-full px-3 py-2 text-sm bg-surface-ops-input border border-border-ops-border rounded-lg outline-none focus:border-blue-500 text-text-ops-primary"
                />
              </div>
            </>
          )}

          {/* Display Tab */}
          {activeTab === 'display' && (
            <>
              {/* Common display options */}
              <div>
                <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
                  Primary Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={chartColor}
                    onChange={(e) => setChartColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-border-ops-border"
                  />
                  <input
                    type="text"
                    value={chartColor}
                    onChange={(e) => setChartColor(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm font-mono bg-surface-ops-input border border-border-ops-border rounded-lg outline-none focus:border-blue-500 text-text-ops-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm text-text-ops-primary">
                  <input
                    type="checkbox"
                    checked={showLegend}
                    onChange={(e) => setShowLegend(e.target.checked)}
                    className="rounded border-border-ops-border"
                  />
                  Show Legend
                </label>
                <label className="flex items-center gap-2 text-sm text-text-ops-primary">
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => setShowGrid(e.target.checked)}
                    className="rounded border-border-ops-border"
                  />
                  Show Grid
                </label>
                <label className="flex items-center gap-2 text-sm text-text-ops-primary">
                  <input
                    type="checkbox"
                    checked={showTooltip}
                    onChange={(e) => setShowTooltip(e.target.checked)}
                    className="rounded border-border-ops-border"
                  />
                  Show Tooltip
                </label>
                <div>
                  <label className="block text-xs font-medium text-text-ops-muted mb-1">
                    Font Size
                  </label>
                  <select
                    value={fontSize}
                    onChange={(e) => setFontSize(e.target.value)}
                    className="w-full px-2 py-1 text-sm bg-surface-ops-input border border-border-ops-border rounded-lg outline-none focus:border-blue-500 text-text-ops-primary"
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>
              </div>

              {/* Gauge-specific options */}
              {widgetType === 'GAUGE' && (
                <>
                  <div className="border-t border-border-ops-subtle pt-4">
                    <h3 className="text-sm font-medium text-text-ops-primary mb-3">Gauge Settings</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
                          Minimum Value
                        </label>
                        <input
                          type="number"
                          value={gaugeMin}
                          onChange={(e) => setGaugeMin(Number(e.target.value))}
                          className="w-full px-3 py-2 text-sm bg-surface-ops-input border border-border-ops-border rounded-lg outline-none focus:border-blue-500 text-text-ops-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
                          Maximum Value
                        </label>
                        <input
                          type="number"
                          value={gaugeMax}
                          onChange={(e) => setGaugeMax(Number(e.target.value))}
                          className="w-full px-3 py-2 text-sm bg-surface-ops-input border border-border-ops-border rounded-lg outline-none focus:border-blue-500 text-text-ops-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
                          Decimal Places
                        </label>
                        <input
                          type="number"
                          value={gaugeDecimals}
                          onChange={(e) => setGaugeDecimals(Number(e.target.value))}
                          min={0}
                          max={4}
                          className="w-full px-3 py-2 text-sm bg-surface-ops-input border border-border-ops-border rounded-lg outline-none focus:border-blue-500 text-text-ops-primary"
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-text-ops-muted mb-1.5">
                        Thresholds (value → color)
                      </label>
                      {gaugeThresholds.map((t: { value: number; color: string }, i: number) => (
                        <div key={i} className="flex items-center gap-2 mb-2">
                          <input
                            type="number"
                            value={t.value}
                            onChange={(e) => {
                              const updated = [...gaugeThresholds];
                              updated[i] = { ...updated[i], value: Number(e.target.value) };
                              setGaugeThresholds(updated);
                            }}
                            className="w-20 px-2 py-1 text-sm bg-surface-ops-input border border-border-ops-border rounded-lg outline-none focus:border-blue-500 text-text-ops-primary"
                          />
                          <input
                            type="color"
                            value={t.color}
                            onChange={(e) => {
                              const updated = [...gaugeThresholds];
                              updated[i] = { ...updated[i], color: e.target.value };
                              setGaugeThresholds(updated);
                            }}
                            className="w-8 h-8 rounded cursor-pointer border border-border-ops-border"
                          />
                          <button
                            onClick={() => setGaugeThresholds(gaugeThresholds.filter((_: { value: number; color: string }, j: number) => j !== i))}
                            className="p-1 rounded hover:bg-red-500/20 text-text-ops-muted hover:text-red-400"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => setGaugeThresholds([...gaugeThresholds, { value: 0, color: '#3b82f6' }])}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        + Add Threshold
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Chart color palette for multi-series charts */}
              {(widgetType === 'COLUMN_CHART' || widgetType === 'LINE_CHART' || widgetType === 'AREA_CHART' || widgetType === 'SCATTER') && (
                <div className="border-t border-border-ops-subtle pt-4">
                  <h3 className="text-sm font-medium text-text-ops-primary mb-3">Color Palette</h3>
                  <div className="flex flex-wrap gap-2">
                    {chartColors.map((color: string, i: number) => (
                      <div key={i} className="flex items-center gap-1">
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => {
                            const updated = [...chartColors];
                            updated[i] = e.target.value;
                            setChartColors(updated);
                          }}
                          className="w-8 h-8 rounded cursor-pointer border border-border-ops-border"
                        />
                        <button
                          onClick={() => setChartColors(chartColors.filter((_: string, j: number) => j !== i))}
                          className="p-0.5 rounded hover:bg-red-500/20 text-text-ops-muted hover:text-red-400"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setChartColors([...chartColors, '#6366f1'])}
                      className="px-2 py-1 text-xs rounded border border-dashed border-border-ops-border text-text-ops-muted hover:text-text-ops-primary"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              )}
            </>
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
