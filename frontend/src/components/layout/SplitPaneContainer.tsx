/**
 * Split Pane Container Component
 *
 * Resizable dual-pane container for the Eisenhower Portfolio Manager's
 * master-detail drill-down interface.
 *
 * Structure
 * ---------
 * - Upper Pane (Master): WBS grid and GanttViewport timeline area.
 * - Resizable Divider Bar: Accessible drag handle with keyboard support.
 * - Lower Pane (Drill-down): TaskDrillDownWorkbench with 5 context-aware tabs.
 *
 * The split ratio is persisted to UserDisplaySettings.view_state_overrides.split_ratio
 * via the useDisplayStore. Persistence is debounced (300ms) so rapid dragging
 * does not flood the backend with PUT requests.
 *
 * Key Differences from SplitPaneLayout
 * -------------------------------------
 * - Uses 'split_ratio' key in view_state_overrides (matching backend field name).
 * - Debounces the persist call to avoid excessive database writes during drag.
 * - Clears the debounce timer on component unmount.
 *
 * Accessibility
 * -------------
 * The divider bar is a focusable button (tabIndex=0, role=separator) that can
 * be resized via keyboard (Arrow Up/Down) as well as mouse drag.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GripVertical } from 'lucide-react';
import { useDisplayStore } from '../../stores/useDisplayStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the split-pane container.
 */
export interface SplitPaneContainerProps {
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

/** Keyboard step size for arrow-key resizing */
const KEYBOARD_STEP = 0.02;

/** Debounce interval for persisting split ratio to PostgreSQL (ms) */
const PERSIST_DEBOUNCE_MS = 300;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SplitPaneContainer: React.FC<SplitPaneContainerProps> = ({
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
    typeof viewStateOverrides?.split_ratio === 'number'
      ? viewStateOverrides.split_ratio
      : typeof viewStateOverrides?.splitPaneRatio === 'number'
        ? viewStateOverrides.splitPaneRatio
        : undefined;

  const [splitRatio, setSplitRatio] = useState(
    initialRatio ?? persistedRatio ?? DEFAULT_RATIO,
  );
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -----------------------------------------------------------------------
  // Debounced persist: writes split_ratio to view_state_overrides in the
  // display store, which then debounces the PUT to PostgreSQL.
  // -----------------------------------------------------------------------

  const persistSplitRatio = useCallback(
    (ratio: number) => {
      // Clear any pending debounce
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set a new debounce timer
      debounceTimerRef.current = setTimeout(() => {
        updateDisplaySettings({
          viewStateOverrides: {
            ...viewStateOverrides,
            split_ratio: Math.round(ratio * 1000) / 1000, // 3 decimal places
          },
        });
      }, PERSIST_DEBOUNCE_MS);
    },
    [updateDisplaySettings, viewStateOverrides],
  );

  // Clear debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

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
      // Persist immediately on mouse up (after debounce has already fired or will fire)
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
      {/* Upper Pane: Master WBS/Gantt */}
      <div
        className="overflow-hidden"
        style={{ height: masterHeight, minHeight: '0' }}
        role="region"
        aria-label="Master schedule view"
      >
        {masterContent}
      </div>

      {/* Resizable Divider Bar */}
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

export default SplitPaneContainer;
