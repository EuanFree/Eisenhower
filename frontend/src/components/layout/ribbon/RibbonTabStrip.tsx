/**
 * RibbonTabStrip Component
 *
 * The top tab strip of the Microsoft Project-style contextual ribbon.
 *
 * Features
 * --------
 * - Reads active tabs dynamically from useRibbonContext().
 * - For WBS_GANTT: Tabs = ['Task', 'Precedence', 'Gantt View', 'EVM / Finance', 'Governance'].
 * - For DAILY_COCKPIT: Tabs = ['My Work', 'Timesheet', 'Blockers'].
 * - For SRA_RISK: Tabs = ['Simulation', 'Sensitivity', 'Reporting'].
 * - For FACILITY_CHAMBER: Tabs = ['Reservation', 'Environmental', 'Buffers'].
 * - Renders subtle active tab indicator underline in cyan
 *   (border-b-2 border-cyan-400 text-slate-100 font-semibold).
 * - Double-clicking any tab header toggles ribbon collapse state.
 *
 * Usage
 * -----
 *
 * ```tsx
 * <RibbonTabStrip
 *   tabs={ribbonContext.tabs}
 *   activeTabId={ribbonContext.activeTabId}
 *   onTabClick={ribbonContext.setActiveTab}
 *   onDoubleClick={() => toggleCollapse()}
 * />
 * ```
 */

import React from 'react';
import { clsx } from 'clsx';
import type { RibbonTab } from './useRibbonContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RibbonTabStripProps {
  /** Available ribbon tabs */
  tabs: RibbonTab[];
  /** Currently active tab ID */
  activeTabId: string;
  /** Callback when a tab is clicked */
  onTabClick: (tabId: string) => void;
  /** Callback when the tab strip is double-clicked (collapse toggle) */
  onDoubleClick: () => void;
  /** Quick access toolbar children (e.g., Undo/Redo buttons) */
  quickAccessToolbar?: React.ReactNode;
  /** Additional CSS class */
  className?: string;
}

// ---------------------------------------------------------------------------
// RibbonTabStrip
// ---------------------------------------------------------------------------

/**
 * Renders the ribbon tab strip with active tab highlighting.
 */
export const RibbonTabStrip: React.FC<RibbonTabStripProps> = ({
  tabs,
  activeTabId,
  onTabClick,
  onDoubleClick,
  quickAccessToolbar,
  className,
}) => {
  return (
    <div
      className={clsx(
        'flex items-center bg-ops-surface border-b border-ops-strong',
        'select-none',
        className,
      )}
      onDoubleClick={onDoubleClick}
    >
      {/* Quick Access Toolbar */}
      {quickAccessToolbar && (
        <div className="flex items-center gap-1 pr-2 border-r border-ops-strong mr-2">
          {quickAccessToolbar}
        </div>
      )}

      {/* Ribbon Tabs */}
      <div className="flex items-stretch h-full">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabClick(tab.id)}
            className={clsx(
              'px-3 py-1.5 text-xs transition-colors relative',
              activeTabId === tab.id
                ? 'text-slate-100 font-semibold bg-ops-overlay'
                : 'text-text-ops-muted hover:text-text-ops-primary hover:bg-ops-overlay/50',
            )}
          >
            {tab.label}
            {/* Active tab cyan underline indicator */}
            {activeTabId === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
