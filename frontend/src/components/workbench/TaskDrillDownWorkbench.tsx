/**
 * Task Drill-Down Workbench Component
 *
 * Context-aware tabbed tray that updates instantly when a row is clicked
 * in the WBS table or Gantt chart. This is the lower pane of the
 * SplitPaneContainer, sitting below the master schedule view.
 *
 * Five Tabs
 * ----------
 * 1. Agile/Sprint Kanban — If the selected node's delivery mode is AGILE or
 *    HYBRID, renders a drag-and-drop sub-task board (Backlog, In Progress,
 *    Peer Review, Done) linked to child tasks. For WATERFALL nodes, shows a
 *    placeholder message.
 *
 * 2. Precedence & Logic — Editable grid of incoming predecessors and outgoing
 *    successors with link types (FS, SS, FF, SF) and inline lag day inputs.
 *    Negative lag (leads) are highlighted in amber.
 *
 * 3. Resource Allocations & Location — Displays assigned personnel and assets
 *    with allocation percentages, burdened hourly rates, and current
 *    LocationNode path (e.g., site_warton.bldg_1.fl_1.lab_rf).
 *
 * 4. Impediments & Blockers — Active NodeBlocker records sorted by severity
 *    with one-click 'Resolve Blocker' action and impact hour summaries.
 *
 * 5. V&V Physical Test Cases — Table of linked VerificationTestCase items
 *    (PASSED, FAILED, NOT_RUN, WAIVED) that gate 100% task completion.
 *    Shows completion gate status when requires_vv_signoff is true.
 *
 * Data Flow
 * ---------
 * The workbench receives its data as props from AppShell, which reads the
 * selected node from useScheduleStore and computes child rows, predecessors,
 * successors, assignments, blockers, and V&V test cases.
 *
 * When a row is clicked in the WBS/Gantt, the selectedRow prop updates,
 * and all tabs instantly reflect the new context.
 */

import React, { useState, useMemo } from 'react';
import {
  Flag,
  Link2,
  Users,
  AlertTriangle,
  ClipboardCheck,
  Paperclip,
} from 'lucide-react';
import { clsx } from 'clsx';
import { WBSRow, NodeBlocker } from '../../types/wbs';
import MiniKanban, { KanbanStatus } from '../drilldown/MiniKanban';
import PrecedenceNetwork, { DependencyLink, DependencyType } from '../drilldown/PrecedenceNetwork';
import ResourceAssignments, { ResourceAssignment } from '../drilldown/ResourceAssignments';
import ActiveBlockers from '../drilldown/ActiveBlockers';
import VVPhysicalTests, { VerificationTestCase } from './V&VPhysicalTests';
import TaskArtifactLinkTab from '../../views/artifacts/TaskArtifactLinkTab';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Tab identifiers for the drill-down workbench.
 */
export type WorkbenchTab = 'KANBAN' | 'PRECEDENCE' | 'RESOURCES' | 'BLOCKERS' | 'VV_TESTS' | 'ARTIFACTS';

/**
 * Tab configuration: icon, label, and order.
 */
const TAB_CONFIG: { key: WorkbenchTab; icon: React.ReactNode; label: string }[] = [
  { key: 'KANBAN', icon: <Flag size={14} />, label: 'Kanban' },
  { key: 'PRECEDENCE', icon: <Link2 size={14} />, label: 'Dependencies' },
  { key: 'RESOURCES', icon: <Users size={14} />, label: 'Resources' },
  { key: 'BLOCKERS', icon: <AlertTriangle size={14} />, label: 'Blockers' },
  { key: 'VV_TESTS', icon: <ClipboardCheck size={14} />, label: 'V&V Tests' },
  { key: 'ARTIFACTS', icon: <Paperclip size={14} />, label: 'Artifacts' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TaskDrillDownWorkbenchProps {
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
  /** V&V test cases linked to the selected node */
  vvTestCases: VerificationTestCase[];
  /** Whether the selected node requires V&V sign-off for 100% completion */
  requiresVvSignoff?: boolean;

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
  /** When a V&V test case is verified as PASSED */
  onVvVerify?: (testCaseId: string) => void;
  /** When a V&V test case is waived */
  onVvWaive?: (testCaseId: string, reason: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TaskDrillDownWorkbench: React.FC<TaskDrillDownWorkbenchProps> = ({
  selectedRow,
  allRows,
  childRows,
  predecessors,
  successors,
  assignments,
  blockers,
  vvTestCases,
  requiresVvSignoff = false,
  onKanbanStatusChange,
  onLagChange,
  onAddLink,
  onRemoveLink,
  onResolveBlocker,
  onVvVerify,
  onVvWaive,
}) => {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('KANBAN');

  // Active blocker count badge
  const activeBlockerCount = useMemo(
    () => blockers.filter((b) => !b.resolved_at).length,
    [blockers],
  );

  // V&V test case summary for badge
  const vvBlockingCount = useMemo(
    () => vvTestCases.filter(
      (t) => t.is_mandatory && t.status !== 'PASSED' && t.status !== 'WAIVED',
    ).length,
    [vvTestCases],
  );

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border-ops-subtle bg-bg-ops-surface overflow-x-auto">
        {TAB_CONFIG.map((tab) => {
          const isActive = activeTab === tab.key;
          const isBlockers = tab.key === 'BLOCKERS';
          const isVVTests = tab.key === 'VV_TESTS';

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 text-sm border-b-2 transition-colors whitespace-nowrap flex-shrink-0',
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
              {isVVTests && requiresVvSignoff && vvBlockingCount > 0 && (
                <span className="flex items-center justify-center w-5 h-5 text-xs font-mono font-semibold rounded-full bg-amber-500 text-white">
                  {vvBlockingCount}
                </span>
              )}
            </button>
          );
        })}

        {/* Selected node info */}
        {selectedRow && (
          <div className="ml-auto px-4 flex items-center gap-2 text-xs text-text-ops-muted flex-shrink-0">
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

        {activeTab === 'VV_TESTS' && (
          <VVPhysicalTests
            selectedRow={selectedRow}
            testCases={vvTestCases}
            requiresVvSignoff={requiresVvSignoff}
            onVerify={onVvVerify}
            onWaive={onVvWaive}
          />
        )}

        {activeTab === 'ARTIFACTS' && (
          <TaskArtifactLinkTab
            nodeId={selectedRow?.id ?? null}
            nodeCode={selectedRow?.code}
          />
        )}
      </div>
    </div>
  );
};

export default TaskDrillDownWorkbench;
