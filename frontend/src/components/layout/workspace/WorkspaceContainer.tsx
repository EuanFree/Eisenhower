/**
 * Workspace Container Component
 *
 * The main layout container for the multi-view workspace docking engine.
 *
 * Structure
 * ---------
 * 1. Tab Bar Header — Draggable tabs with close/pin/dirty indicators
 * 2. Viewport Renderers — Single-pane or resizable split-pane views
 *
 * Features
 * --------
 * - **Single Pane** — Renders the active tab's view component
 * - **Split Pane** — Resizable horizontal or vertical split with two active views
 * - **Dynamic View Resolution** — Maps viewType to the correct React component
 * - **Tab-Aware Rendering** — Each pane shows its own tab's content
 *
 * Usage
 * -----
 *
 * ```tsx
 * <WorkspaceContainer projectId={projectId} />
 * ```
 */

import React, { useCallback, useRef, useState } from 'react';
import { clsx } from 'clsx';
import WorkspaceTabBar from './WorkspaceTabBar';
import WorkspaceViewHost from './WorkspaceViewHost';
import { useWorkspaceStore, getActiveTab } from '../../../stores/useWorkspaceStore';
import type { SplitOrientation } from '../../../stores/useWorkspaceStore';

// ---------------------------------------------------------------------------
// Split Divider Component
// ---------------------------------------------------------------------------

interface SplitDividerProps {
  orientation: SplitOrientation;
  ratio: number;
  onRatioChange: (ratio: number) => void;
}

const SplitDivider: React.FC<SplitDividerProps> = ({ orientation, ratio, onRatioChange }) => {
  const isDragging = useRef(false);
  const startRatio = useRef(0);
  const startCoord = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      startRatio.current = ratio;
      startCoord.current = orientation === 'HORIZONTAL' ? e.clientX : e.clientY;
      e.preventDefault();
    },
    [ratio, orientation],
  );

  React.useEffect(() => {
    if (!isDragging.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.getElementById('workspace-viewport');
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const coord = orientation === 'HORIZONTAL' ? e.clientX : e.clientY;
      const delta = coord - startCoord.current;
      const dimension =
        orientation === 'HORIZONTAL' ? rect.width : rect.height;
      const deltaRatio = delta / dimension;

      const newRatio = Math.max(0.1, Math.min(0.9, startRatio.current + deltaRatio));
      onRatioChange(newRatio);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [orientation, onRatioChange]);

  return (
    <div
      className={clsx(
        'flex-shrink-0 bg-bg-ops-surface z-10',
        orientation === 'HORIZONTAL'
          ? 'w-1.5 cursor-col-resize hover:bg-blue-500/30'
          : 'h-1.5 cursor-row-resize hover:bg-blue-500/30',
      )}
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation={orientation === 'HORIZONTAL' ? 'vertical' : 'horizontal'}
      tabIndex={0}
    />
  );
};

// ---------------------------------------------------------------------------
// Workspace Container
// ---------------------------------------------------------------------------

interface WorkspaceContainerProps {
  /** Optional project ID for views that need it */
  projectId?: string;
}

const WorkspaceContainer: React.FC<WorkspaceContainerProps> = ({ projectId }) => {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const activeTabId = useWorkspaceStore((s) => s.activeTabId);
  const splitOrientation = useWorkspaceStore((s) => s.splitOrientation);
  const splitRatio = useWorkspaceStore((s) => s.splitRatio);
  const setSplitRatio = useWorkspaceStore((s) => s.setSplitRatio);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  // For split mode, the second tab is the one after the active tab, or the last tab
  const secondTab =
    splitOrientation !== 'NONE' && tabs.length >= 2
      ? tabs.find((t) => t.id !== activeTabId) || tabs[tabs.length - 1]
      : null;

  if (!activeTab) {
    return (
      <div className="flex flex-col h-full">
        <WorkspaceTabBar />
        <div className="flex-1 flex items-center justify-center text-text-ops-muted">
          <p className="text-sm">No active tab. Open a view to get started.</p>
        </div>
      </div>
    );
  }

  const renderSplitLayout = () => {
    if (splitOrientation === 'NONE' || !secondTab) {
      return (
        <div
          id="workspace-viewport"
          className="flex-1 overflow-hidden bg-bg-ops-base"
        >
          <WorkspaceViewHost tab={activeTab} projectId={projectId} />
        </div>
      );
    }

    if (splitOrientation === 'HORIZONTAL') {
      return (
        <div
          id="workspace-viewport"
          className="flex-1 flex overflow-hidden bg-bg-ops-base"
        >
          {/* Left Pane (Primary - Active Tab) */}
          <div
            className="overflow-hidden"
            style={{ width: `${splitRatio * 100}%` }}
          >
            <WorkspaceViewHost tab={activeTab} projectId={projectId} />
          </div>

          {/* Divider */}
          <SplitDivider
            orientation="HORIZONTAL"
            ratio={splitRatio}
            onRatioChange={setSplitRatio}
          />

          {/* Right Pane (Secondary) */}
          <div
            className="overflow-hidden"
            style={{ width: `${(1 - splitRatio) * 100}%` }}
          >
            <WorkspaceViewHost tab={secondTab} projectId={projectId} />
          </div>
        </div>
      );
    }

    // VERTICAL split
    return (
      <div
        id="workspace-viewport"
        className="flex-1 flex flex-col overflow-hidden bg-bg-ops-base"
      >
        {/* Top Pane (Primary - Active Tab) */}
        <div
          className="overflow-hidden"
          style={{ height: `${splitRatio * 100}%` }}
        >
          <WorkspaceViewHost tab={activeTab} projectId={projectId} />
        </div>

        {/* Divider */}
        <SplitDivider
          orientation="VERTICAL"
          ratio={splitRatio}
          onRatioChange={setSplitRatio}
        />

        {/* Bottom Pane (Secondary) */}
        <div
          className="overflow-hidden"
          style={{ height: `${(1 - splitRatio) * 100}%` }}
        >
          <WorkspaceViewHost tab={secondTab} projectId={projectId} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tab Bar */}
      <WorkspaceTabBar />

      {/* Viewport */}
      {renderSplitLayout()}
    </div>
  );
};

export default WorkspaceContainer;
