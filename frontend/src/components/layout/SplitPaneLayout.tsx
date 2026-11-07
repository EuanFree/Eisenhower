/**
 * Split Pane Layout Component
 *
 * Adjustable dual-pane container for the Eisenhower Portfolio Manager's
 * master-detail drill-down system.
 *
 * Structure
 * ---------
 * - Upper Pane (Master): WBS grid and Gantt chart area.
 * - Drag Handle: Accessible resizer bar between the two panes.
 * - Lower Pane (Drill-down): Tabbed workbench showing task details
 *   (Mini-Kanban, Precedence Network, Resource Assignments, Blockers).
 *
 * The split ratio is persisted to UserDisplaySettings.view_state_overrides.splitRatio
 * via the useDisplayStore, so the user's preferred layout survives page reloads
 * and terminal wipes in SCIF hot-desking environments.
 *
 * Accessibility
 * -------------
 * The drag handle is a focusable button (tabIndex=0, role=separator) that can
 * be resized via keyboard (Arrow Up/Down) as well as mouse drag.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GripVertical } from 'lucide-react';
import { useDisplayStore } from '../../stores/useDisplayStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the split-pane layout.
 */
export interface SplitPaneLayoutProps {
  /** Content rendered in the upper (master) pane */
  masterContent: React.ReactNode;
  /** Content rendered in the lower (drill-down) pane */
  detailContent: React.ReactNode;
  /** Optional initial split ratio (0.0–1.0), defaults to persisted value or 0.65 */
  initialRatio?: number;
  /** Minimum height fraction for the upper pane (prevents collapsing too small) */
  minMasterRatio?: number;
  /** Minimum height fraction for the lower pane */
  minDetailRatio?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default split ratio: 65% master, 35% detail */
const DEFAULT_RATIO = 0.65;

/** Minimum master pane: 40% of container */
const MIN_MASTER = 0.4;

/** Minimum detail pane: 20% of container */
const MIN_DETAIL = 0.2;

/** Keyboard step size for arrow-key resizing (percentage of container height) */
const KEYBOARD_STEP = 0.02;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SplitPaneLayout: React.FC<SplitPaneLayoutProps> = ({
  masterContent,
  detailContent,
  initialRatio,
  minMasterRatio = MIN_MASTER,
  minDetailRatio = MIN_DETAIL,
}) => {
  // Load persisted split ratio from display settings, or fall back to initial/default
  const viewStateOverrides = useDisplayStore((s) => s.settings.viewStateOverrides);
  const updateDisplaySettings = useDisplayStore((s) => s.updateDisplaySettings);

  const persistedRatio =
    typeof viewStateOverrides?.splitPaneRatio === 'number'
      ? viewStateOverrides.splitPaneRatio
      : undefined;

  const [splitRatio, setSplitRatio] = useState(
    initialRatio ?? persistedRatio ?? DEFAULT_RATIO,
  );
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // -----------------------------------------------------------------------
  // Persist split ratio to display settings on change (debounced by the store)
  // -----------------------------------------------------------------------

  const persistSplitRatio = useCallback(
    (ratio: number) => {
      updateDisplaySettings({
        viewStateOverrides: {
          ...viewStateOverrides,
          splitPaneRatio: ratio,
        },
      });
    },
    [updateDisplaySettings, viewStateOverrides],
  );

  // -----------------------------------------------------------------------
  // Mouse drag handler
  // -----------------------------------------------------------------------

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const ratio = Math.max(0, Math.min(1, y / rect.height));

      setSplitRatio((prev) => {
        const newRatio = Math.max(minMasterRatio, Math.min(1 - minDetailRatio, ratio));
        return newRatio;
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      persistSplitRatio(splitRatio);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Prevent text selection while dragging
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, splitRatio, minMasterRatio, minDetailRatio, persistSplitRatio]);

  // -----------------------------------------------------------------------
  // Keyboard resize handler
  // -----------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSplitRatio((prev) => {
          const newRatio = Math.min(1 - minDetailRatio, prev + KEYBOARD_STEP);
          persistSplitRatio(newRatio);
          return newRatio;
        });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSplitRatio((prev) => {
          const newRatio = Math.max(minMasterRatio, prev - KEYBOARD_STEP);
          persistSplitRatio(newRatio);
          return newRatio;
        });
      }
    },
    [minMasterRatio, minDetailRatio, persistSplitRatio],
  );

  // -----------------------------------------------------------------------
  // Styles
  // -----------------------------------------------------------------------

  const masterHeight = `${splitRatio * 100}%`;
  const detailHeight = `${(1 - splitRatio) * 100}%`;

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full"
      style={{ height: '100%' }}
    >
      {/* Upper Pane: Master Gantt/WBS */}
      <div
        className="overflow-hidden"
        style={{ height: masterHeight, minHeight: '0' }}
        role="region"
        aria-label="Master schedule view"
      >
        {masterContent}
      </div>

      {/* Drag Handle Resizer */}
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label="Resize panes"
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
        className={
          'flex items-center justify-center cursor-row-resize ' +
          'border-t border-b border-border-ops-subtle bg-bg-ops-surface ' +
          'transition-colors duration-75 select-none ' +
          (isDragging ? 'bg-bg-ops-overlay' : 'hover:bg-bg-ops-overlay')
        }
        style={{ height: '6px', flexShrink: 0 }}
      >
        <GripVertical
          className="text-text-ops-muted"
          size={14}
          style={{ transform: 'rotate(90deg)' }}
        />
      </div>

      {/* Lower Pane: Drill-down Workbench */}
      <div
        className="overflow-hidden"
        style={{ height: detailHeight, minHeight: '0' }}
        role="region"
        aria-label="Task drill-down workbench"
      >
        {detailContent}
      </div>
    </div>
  );
};

export default SplitPaneLayout;
