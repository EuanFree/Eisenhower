/**
 * Dashboard Canvas Component
 *
 * Free-form canvas where widgets can be placed, moved, and resized.
 * Uses react-rnd for drag and resize functionality with grid snapping.
 */

import React, { useRef, useCallback, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { useDashboardStore } from '../../stores/useDashboardStore';
import WidgetContainer from './WidgetContainer';

const DashboardCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    currentDashboard,
    isEditMode,
    canvasWidth,
    canvasHeight,
    setCanvasSize,
  } = useDashboardStore();

  // Update canvas size on resize
  const handleResize = useCallback(() => {
    if (containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      setCanvasSize(clientWidth, clientHeight);
    }
  }, [setCanvasSize]);

  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  const widgets = currentDashboard?.widgets || [];

  return (
    <div
      ref={containerRef}
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
          className="relative"
          style={{ width: Math.max(canvasWidth, 1200), height: Math.max(canvasHeight, 800) }}
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
