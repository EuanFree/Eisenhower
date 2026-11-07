/**
 * Widget Container Component
 *
 * Wrapper for individual widgets with drag, resize, edit, and delete controls.
 * Uses react-rnd for positioning in edit mode.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Rnd } from 'react-rnd';
import { Settings, X, Trash2, Edit3, Copy, Move, Maximize2, RefreshCw } from 'lucide-react';
import { useDashboardStore } from '../../stores/useDashboardStore';
import type { DashboardWidget } from '../../types/dashboard';
import WidgetEditor from './WidgetEditor';

// Import chart components
import ColumnChartWidget from './charts/ColumnChartWidget';
import LineChartWidget from './charts/LineChartWidget';
import AreaChartWidget from './charts/AreaChartWidget';
import GaugeWidget from './charts/GaugeWidget';
import BurndownChartWidget from './charts/BurndownChartWidget';
import ScatterChartWidget from './charts/ScatterChartWidget';
import NumberCardWidget from './charts/NumberCardWidget';
import TableWidget from './charts/TableWidget';

interface WidgetContainerProps {
  widget: DashboardWidget;
}

const CHART_COMPONENTS: Record<string, React.FC<{ data: unknown; config: unknown }>> = {
  COLUMN_CHART: ColumnChartWidget,
  LINE_CHART: LineChartWidget,
  AREA_CHART: AreaChartWidget,
  GAUGE: GaugeWidget,
  BURNDOWN: BurndownChartWidget,
  SCATTER: ScatterChartWidget,
  NUMBER_CARD: NumberCardWidget,
  TABLE: TableWidget,
};

const WidgetContainer: React.FC<WidgetContainerProps> = ({ widget }) => {
  const {
    isEditMode,
    activeWidgetId,
    setActiveWidget,
    deleteWidget,
    updateWidgetPosition,
    widgetData,
    loadWidgetData,
  } = useDashboardStore();

  const [showEditor, setShowEditor] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const pos = widget.position || { x: 0, y: 0, width: 300, height: 250 };
  const data = widgetData[widget.id];
  const ChartComponent = CHART_COMPONENTS[widget.widget_type] || NumberCardWidget;

  // Close context menu on outside click
  useEffect(() => {
    if (!showContextMenu) return;
    const handleClick = () => setShowContextMenu(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showContextMenu]);

  const handleDragStop = (_e: MouseEvent, d: { x: number; y: number }) => {
    updateWidgetPosition(widget.id, { ...pos, x: d.x, y: d.y });
  };

  const handleResizeStop = (_e: MouseEvent, _size: unknown, _pos: unknown, delta: { deltaX: number; deltaY: number }, ref: HTMLElement) => {
    const newWidth = pos.width + delta.deltaX;
    const newHeight = pos.height + delta.deltaY;
    updateWidgetPosition(widget.id, { ...pos, width: newWidth, height: newHeight });
  };

  const handleEdit = () => {
    setShowEditor(true);
    setShowContextMenu(false);
  };

  const handleDelete = () => {
    deleteWidget(widget.id);
    setShowContextMenu(false);
  };

  const handleRefresh = () => {
    loadWidgetData();
    setShowContextMenu(false);
  };

  const handleDuplicate = () => {
    setShowContextMenu(false);
    // Duplicate by adding a new widget of the same type
    const store = useDashboardStore.getState();
    if (store.currentDashboard) {
      store.addWidget(widget.widget_type);
    }
  };

  const handleClick = () => {
    if (isEditMode) {
      setActiveWidget(widget.id);
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  }, []);

  if (isEditMode) {
    return (
      <div className="relative" ref={containerRef}>
        <Rnd
          size={{ width: pos.width, height: pos.height }}
          position={{ x: pos.x, y: pos.y }}
          onDragStop={handleDragStop}
          onResizeStop={handleResizeStop as any}
          dragHandleClassName="widget-drag-handle"
          resizeHandleEdges={{ top: 3, right: 3, bottom: 3, left: 3 }}
          bounds="parent"
          lockAspectRatio={false}
          enableResizing={{
            top: false, right: true, bottom: true, left: false,
            topRight: true, bottomRight: true, bottomLeft: true, topLeft: true,
          }}
        >
          <div
            className={`
              h-full bg-surface-ops-panel border-2 rounded-lg shadow-lg
              ${activeWidgetId === widget.id
                ? 'border-blue-500 ring-2 ring-blue-500/20'
                : 'border-border-ops-subtle hover:border-border-ops-border'
              }
            `}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
          >
            {/* Header */}
            <div className="widget-drag-handle flex items-center justify-between px-3 py-2 border-b border-border-ops-subtle bg-surface-ops-hover cursor-grab">
              <span className="text-sm font-medium text-text-ops-primary truncate">
                {widget.title}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); handleEdit(); }}
                  className="p-1 rounded hover:bg-surface-ops-active text-text-ops-muted hover:text-text-ops-primary"
                  title="Edit widget"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                  className="p-1 rounded hover:bg-red-500/20 text-text-ops-muted hover:text-red-400"
                  title="Delete widget"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-3 overflow-hidden" style={{ height: `calc(100% - 36px)` }}>
              <ChartComponent data={data} config={widget.display_config} />
            </div>
          </div>
        </Rnd>

        {/* Right-click context menu */}
        {showContextMenu && (
          <div
            className="fixed z-50 bg-surface-ops-panel border border-border-ops-border rounded-lg shadow-2xl py-1 min-w-[180px]"
            style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 border-b border-border-ops-subtle">
              <span className="text-xs font-medium text-text-ops-primary truncate block">
                {widget.title}
              </span>
            </div>
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary hover:bg-surface-ops-hover"
              onClick={handleEdit}
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Widget
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary hover:bg-surface-ops-hover"
              onClick={handleRefresh}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh Data
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary hover:bg-surface-ops-hover"
              onClick={handleDuplicate}
            >
              <Copy className="w-3.5 h-3.5" />
              Duplicate Widget
            </button>
            <div className="border-t border-border-ops-subtle my-1" />
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10"
              onClick={handleDelete}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Widget
            </button>
          </div>
        )}
      </div>
    );
  }

  // View mode — no drag/resize
  return (
    <div className="relative">
      <div
        className="absolute bg-surface-ops-panel border border-border-ops-subtle rounded-lg shadow-sm"
        style={{
          left: pos.x,
          top: pos.y,
          width: pos.width,
          height: pos.height,
        }}
        onContextMenu={handleContextMenu}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-ops-subtle">
          <span className="text-sm font-medium text-text-ops-primary truncate">
            {widget.title}
          </span>
        </div>

        {/* Content */}
        <div className="p-3 overflow-hidden" style={{ height: `calc(100% - 36px)` }}>
          <ChartComponent data={data} config={widget.display_config} />
        </div>
      </div>

      {/* Right-click context menu (view mode) */}
      {showContextMenu && (
        <div
          className="fixed z-50 bg-surface-ops-panel border border-border-ops-border rounded-lg shadow-2xl py-1 min-w-[180px]"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-border-ops-subtle">
            <span className="text-xs font-medium text-text-ops-primary truncate block">
              {widget.title}
            </span>
          </div>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary hover:bg-surface-ops-hover"
            onClick={handleRefresh}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Data
          </button>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary hover:bg-surface-ops-hover"
            onClick={handleDuplicate}
          >
            <Copy className="w-3.5 h-3.5" />
            Duplicate Widget
          </button>
        </div>
      )}
    </div>
  );
};

export default WidgetContainer;
