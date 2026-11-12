/**
 * Dashboard Canvas Component
 *
 * Free-form canvas where widgets can be placed, moved, and resized.
 * Supports HTML5 drag-and-drop from the widget palette and react-rnd
 * for in-canvas widget repositioning with grid snapping.
 */

import React, { useRef, useCallback, useEffect } from 'react';
import { useDashboardStore } from '../../stores/useDashboardStore';
import WidgetContainer from './WidgetContainer';
import type { WidgetType } from '../../types/dashboard';

const GRID_SIZE = 20;

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

const DashboardCanvas: React.FC = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const widgetsRef = useRef<HTMLDivElement>(null);
  const {
    currentDashboard,
    isEditMode,
    canvasWidth,
    canvasHeight,
    setCanvasSize,
    addWidget,
  } = useDashboardStore();

  // Update canvas size on resize
  const handleResize = useCallback(() => {
    if (scrollRef.current) {
      const { clientWidth, clientHeight } = scrollRef.current;
      setCanvasSize(clientWidth, clientHeight);
    }
  }, [setCanvasSize]);

  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  // Handle drag-over — allow drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // Handle drop — add widget at drop position
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!isEditMode || !currentDashboard || !widgetsRef.current) return;

    let rawData: string | null = null;
    try {
      rawData = e.dataTransfer.getData('application/json');
    } catch {
      return;
    }
    if (!rawData) return;

    let parsed: { widgetType: WidgetType } | null = null;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      return;
    }
    if (!parsed?.widgetType) return;

    // Calculate drop position relative to the widgets container
    const rect = widgetsRef.current.getBoundingClientRect();
    const x = snapToGrid(Math.max(20, e.clientX - rect.left));
    const y = snapToGrid(Math.max(20, e.clientY - rect.top));

    // Add the widget at the dropped position
    addWidget(parsed.widgetType, { x, y });
  }, [isEditMode, currentDashboard, addWidget]);

  const widgets = currentDashboard?.widgets || [];

  return (
    <div
      ref={scrollRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative flex-1 overflow-auto bg-surface-ops-panel"
      style={{
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '20px 20px',
      }}
    >
      {widgets.length === 0 ? (
        <div className="flex items-center justify-center h-full text-text-ops-muted">
          <div className="text-center">
            <p className="text-lg mb-2">No widgets yet</p>
            <p className="text-sm">
              {isEditMode
                ? 'Drag widgets from the palette to get started'
                : 'Enter edit mode to add widgets'}
            </p>
          </div>
        </div>
      ) : (
        <div
          ref={widgetsRef}
          className="relative"
          style={{ 
            position: 'relative',
            width: Math.max(canvasWidth, 1200), 
            height: Math.max(canvasHeight, 800) 
          }}
        >
          {widgets.map((widget) => (
            <WidgetContainer key={widget.id} widget={widget} />
          ))}
        </div>
      )}
    </div>
  );
};

export default DashboardCanvas;
