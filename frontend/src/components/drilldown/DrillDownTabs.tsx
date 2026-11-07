/**
 * Drill-Down Tabs Component
 *
 * Tabbed workbench that composes the four drill-down tabs for the lower
 * pane of the SplitPaneLayout:
 *
 * - Tab A: Task Mini-Kanban (sprint board for AGILE/HYBRID tasks)
 * - Tab B: Precedence Network (PDM dependency links)
 * - Tab C: Resource Assignments & Custody (people, skills, equipment)
 * - Tab D: Active Blockers (open impediments)
 *
 * The active tab is persisted in the URL hash or local state so it survives
 * row selection changes.
 */

import React, { useState, useMemo } from 'react';
import {
  Flag,
  Link2,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { WBSRow, NodeBlocker } from '../../types/wbs';
import MiniKanban, { KanbanStatus } from './MiniKanban';
import PrecedenceNetwork, { DependencyLink, DependencyType } from './PrecedenceNetwork';
import ResourceAssignments, { ResourceAssignment } from './ResourceAssignments';
import ActiveBlockers from './ActiveBlockers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Tab identifiers for the drill-down workbench.
 */
export type DrillDownTab = 'KANBAN' | 'PRECEDENCE' | 'RESOURCES' | 'BLOCKERS';

/**
 * Tab configuration: icon, label, and order.
 */
const TAB_CONFIG: { key: DrillDownTab; icon: React.ReactNode; label: string }[] = [
  { key: 'KANBAN', icon: <Flag size={14} />, label: 'Kanban' },
  { key: 'PRECEDENCE', icon: <Link2 size={14} />, label: 'Dependencies' },
  { key: 'RESOURCES', icon: <Users size={14} />, label: 'Resources' },
  { key: 'BLOCKERS', icon: <AlertTriangle size={14} />, label: 'Blockers' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DrillDownTabsProps {
  /** The currently selected WBS row */
  selectedRow: WBSRow | null;
  /** All rows in the schedule (for resolving linked node data) */
  allRows: WBSRow[];
  /** Child rows of the selected node (for Kanban) */
  childRows: WBSRow[];
  /** Predecessor links for the selected node */
  predecessors: DependencyLink[];
  /** Successor links for the selected node */
  successors: DependencyLink[];
  /** Resource assignments for the selected node */
  assignments: ResourceAssignment[];
  /** Active blockers for the selected node */
  blockers: NodeBlocker[];

  // -----------------------------------------------------------------------
  // Callbacks
  // -----------------------------------------------------------------------

  /** When a Kanban card's status changes */
  onKanbanStatusChange?: (nodeId: string, newStatus: KanbanStatus) => void;
  /** When a dependency lag is updated */
  onLagChange?: (linkId: string, newLag: number) => void;
  /** When a new dependency link is added */
  onAddLink?: (predecessorId: string, successorId: string, type: DependencyType) => void;
  /** When a dependency link is removed */
  onRemoveLink?: (linkId: string) => void;
  /** When a blocker is resolved */
  onResolveBlocker?: (blockerId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DrillDownTabs: React.FC<DrillDownTabsProps> = ({
  selectedRow,
  allRows,
  childRows,
  predecessors,
  successors,
  assignments,
  blockers,
  onKanbanStatusChange,
  onLagChange,
  onAddLink,
  onRemoveLink,
  onResolveBlocker,
}) => {
  const [activeTab, setActiveTab] = useState<DrillDownTab>('KANBAN');

  // Blocker count badge
  const activeBlockerCount = useMemo(
    () => blockers.filter((b) => !b.resolved_at).length,
    [blockers],
  );

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border-ops-subtle bg-bg-ops-surface">
        {TAB_CONFIG.map((tab) => {
          const isActive = activeTab === tab.key;
          const isBlockers = tab.key === 'BLOCKERS';

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 text-sm border-b-2 transition-colors',
                isActive
                  ? 'border-sky-500 text-text-ops-primary bg-bg-ops-overlay'
                  : 'border-transparent text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay/50',
              )}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              {isBlockers && activeBlockerCount > 0 && (
                <span className="flex items-center justify-center w-5 h-5 text-xs font-mono font-semibold rounded-full bg-red-500 text-white">
                  {activeBlockerCount}
                </span>
              )}
            </button>
          );
        })}

        {/* Selected node info */}
        {selectedRow && (
          <div className="ml-auto px-4 flex items-center gap-2 text-xs text-text-ops-muted">
            <span className="font-mono">{selectedRow.code}</span>
            <span className="truncate max-w-[200px]">
              {selectedRow.is_masked ? '[RESTRICTED]' : selectedRow.name}
            </span>
          </div>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'KANBAN' && (
          <MiniKanban
            selectedRow={selectedRow}
            childRows={childRows}
            onStatusChange={onKanbanStatusChange}
          />
        )}

        {activeTab === 'PRECEDENCE' && (
          <PrecedenceNetwork
            selectedRow={selectedRow}
            allRows={allRows}
            predecessors={predecessors}
            successors={successors}
            onLagChange={onLagChange}
            onAddLink={onAddLink}
            onRemoveLink={onRemoveLink}
          />
        )}

        {activeTab === 'RESOURCES' && (
          <ResourceAssignments
            selectedRow={selectedRow}
            assignments={assignments}
          />
        )}

        {activeTab === 'BLOCKERS' && (
          <ActiveBlockers
            selectedRow={selectedRow}
            blockers={blockers}
            onResolve={onResolveBlocker}
          />
        )}
      </div>
    </div>
  );
};

export default DrillDownTabs;
