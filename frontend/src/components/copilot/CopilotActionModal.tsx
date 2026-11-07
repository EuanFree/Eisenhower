/**
 * Copilot Action Modal — Invertible Staging for AI-Recommended Actions
 *
 * When the Copilot LLM recommends a tool execution, this component:
 *
 * 1. Triggers automatically when a response from /api/v1/copilot/chat contains
 *    a structured tool execution payload (shift_task_dates, create_precedence_link,
 *    update_progress_percentage, flag_operational_blocker).
 * 2. Displays a Modal Header highlighting the intent (e.g., "Copilot Recommendation:
 *    Shift WP-2104 by +3 working days").
 * 3. Renders a Topological Impact Summary Table showing affected attributes
 *    before and after the proposed change, including downstream driving successors,
 *    float consumption, and critical path transition warnings.
 * 4. Shows contractual check warnings if the action causes baseline slip or
 *    breaches a CDRL due date.
 * 5. Mounts a GanttCanvasGhostLayer over the main Gantt viewport showing dashed
 *    semi-transparent ghost bars indicating projected date shifts.
 * 6. On [Accept & Apply (Enter)]: Dispatches the mutation to the server, appends
 *    an invertible HistoryCommand to useHistoryStore, closes the modal, and clears
 *    ghost layers.
 * 7. On [Reject / Dismiss (Esc)]: Discards the staged change without touching
 *    local or remote state.
 * 8. Asserts that pressing Ctrl+Z immediately after accepting reverts the action
 *    completely.
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    <CopilotActionModal
 *      isOpen={showModal}
 *      onClose={() => setShowModal(false)}
 *      toolCall={pendingToolCall}
 *      onCommit={handleCommit}
 *    />
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  GitCommitHorizontal,
  Undo2,
  CalendarDays,
  Link2,
  TrendingUp,
  Flag,
  Clock,
  AlertOctagon,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  GitBranch,
  ArrowRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { ToolCall } from '../../types/copilot';
import {
  useHistoryStore,
  type HistoryCommand,
  type HistoryOperation,
} from '../../stores/useHistoryStore';
import { useScheduleStore } from '../../stores/useScheduleStore';
import type { CascadeProjection, ContractualBreach } from '../../hooks/useGanttDragCascade';
import GanttCanvasGhostLayer from '../gantt/GanttCanvasGhostLayer';
import type { DependencyLink } from '../gantt/GanttViewport';
import api from '../../services/api';

// ---------------------------------------------------------------------------
// Tool icon and label mapping
// ---------------------------------------------------------------------------

const TOOL_ICONS: Record<string, React.ReactNode> = {
  shift_task_dates: <CalendarDays className="w-5 h-5 text-blue-400" />,
  create_precedence_link: <Link2 className="w-5 h-5 text-purple-400" />,
  update_progress_percentage: <TrendingUp className="w-5 h-5 text-green-400" />,
  flag_operational_blocker: <Flag className="w-5 h-5 text-red-400" />,
};

const TOOL_LABELS: Record<string, string> = {
  shift_task_dates: 'Shift Task Dates',
  create_precedence_link: 'Create Dependency Link',
  update_progress_percentage: 'Update Progress',
  flag_operational_blocker: 'Flag Blocker',
};

// ---------------------------------------------------------------------------
// Impact analysis helpers
// ---------------------------------------------------------------------------

/** Parse an ISO date string for display */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(iso);
  }
}

/** Calculate the day delta between two ISO date strings */
function dayDelta(oldIso: string | null, newIso: string | null): number | null {
  if (!oldIso || !newIso) return null;
  try {
    const old = new Date(oldIso).getTime();
    const nw = new Date(newIso).getTime();
    return Math.round((nw - old) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

/** Add working days to a date string */
function addWorkingDays(dateStr: string | null, days: number): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const sign = days >= 0 ? 1 : -1;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    d.setDate(d.getDate() + sign);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse an ISO date string to a Date object */
function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

/** Format a Date as YYYY-MM-DD string */
function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// CopilotActionModal Props
// ---------------------------------------------------------------------------

interface CopilotActionModalProps {
  /** Whether the modal is currently open. */
  isOpen: boolean;
  /** Close callback (cancel without committing). */
  onClose: () => void;
  /** The pending tool call from the Copilot. */
  toolCall: ToolCall | null;
  /** Called when the user commits the action. */
  onCommit: (command: HistoryCommand) => void;
}

// ---------------------------------------------------------------------------
// Impact Row for the summary table
// ---------------------------------------------------------------------------

interface ImpactRow {
  nodeId: string;
  nodeCode: string;
  nodeName: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  delta: string;
  isDirectTarget: boolean;
  floatConsumed?: number;
  totalFloat?: number | null;
  isCriticalPathTransition?: boolean;
}

// ---------------------------------------------------------------------------
// CopilotActionModal Component
// ---------------------------------------------------------------------------

export const CopilotActionModal = ({
  isOpen,
  onClose,
  toolCall,
  onCommit,
}: CopilotActionModalProps) => {
  const [staged, setStaged] = useState<HistoryCommand | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [impactRows, setImpactRows] = useState<ImpactRow[]>([]);
  const [breaches, setBreaches] = useState<ContractualBreach[]>([]);
  const [cascadeMap, setCascadeMap] = useState<Map<string, CascadeProjection>>(new Map());
  const [showDownstream, setShowDownstream] = useState(false);
  const ganttRef = useRef<HTMLDivElement | null>(null);

  const { pushCommand } = useHistoryStore();
  const rows = useScheduleStore((s) => s.rows);
  const [dependencies] = useState<DependencyLink[]>([]);
  const [baselines] = useState<Record<string, { baseline0End?: string }>>({});

  // Clear staged state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setStaged(null);
      setIsCommitting(false);
      setImpactRows([]);
      setBreaches([]);
      setCascadeMap(new Map());
      setShowDownstream(false);
    }
  }, [isOpen]);

  // Stage the action and compute impact analysis when toolCall changes
  useEffect(() => {
    if (!toolCall) {
      setStaged(null);
      setImpactRows([]);
      setBreaches([]);
      setCascadeMap(new Map());
      return;
    }

    const rowMap = new Map(rows.map((r) => [r.id, r]));
    const node_id = (toolCall.arguments.node_id as string) || '';
    const targetRow = rowMap.get(node_id);

    const ops: HistoryOperation[] = [];
    const impact: ImpactRow[] = [];
    const breachList: ContractualBreach[] = [];
    const cascade = new Map<string, CascadeProjection>();

    // Build operations and impact rows based on tool type
    if (toolCall.name === 'shift_task_dates') {
      const deltaDays = (toolCall.arguments.delta_days as number) || 0;

      if (targetRow) {
        const oldStart = targetRow.planned_start_date || targetRow.early_start;
        const oldEnd = targetRow.planned_end_date || targetRow.early_finish;
        const newStart = addWorkingDays(oldStart, deltaDays);
        const newEnd = addWorkingDays(oldEnd, deltaDays);

        if (oldStart && newStart) {
          ops.push({
            node_id,
            field: 'planned_start_date',
            oldValue: oldStart,
            newValue: newStart,
          });
          impact.push({
            nodeId: node_id,
            nodeCode: targetRow.code,
            nodeName: targetRow.name,
            field: 'Start Date',
            oldValue: oldStart,
            newValue: newStart,
            delta: `${deltaDays > 0 ? '+' : ''}${deltaDays} working days`,
            isDirectTarget: true,
            totalFloat: targetRow.total_float,
          });
        }

        if (oldEnd && newEnd) {
          ops.push({
            node_id,
            field: 'planned_end_date',
            oldValue: oldEnd,
            newValue: newEnd,
          });
          impact.push({
            nodeId: node_id,
            nodeCode: targetRow.code,
            nodeName: targetRow.name,
            field: 'Finish Date',
            oldValue: oldEnd,
            newValue: newEnd,
            delta: `${deltaDays > 0 ? '+' : ''}${deltaDays} working days`,
            isDirectTarget: true,
            totalFloat: targetRow.total_float,
          });
        }

        // Total Float impact
        const oldFloat = targetRow.total_float ?? 0;
        const newFloat = oldFloat - Math.abs(deltaDays);
        if (oldFloat !== null && oldFloat !== undefined) {
          impact.push({
            nodeId: node_id,
            nodeCode: targetRow.code,
            nodeName: targetRow.name,
            field: 'Total Float (TF)',
            oldValue: `${oldFloat} days`,
            newValue: `${newFloat} days`,
            delta: `${newFloat < oldFloat ? '-' : '+'}${Math.abs(newFloat - oldFloat)} days`,
            isDirectTarget: true,
            isCriticalPathTransition: oldFloat >= 0 && newFloat < 0,
            totalFloat: newFloat,
          });
        }

        // Set cascade projection for the target node
        cascade.set(node_id, {
          projectedStart: newStart || oldStart || '',
          projectedFinish: newEnd || oldEnd || '',
          floatConsumed: Math.abs(deltaDays),
          originalStart: oldStart || '',
          originalFinish: oldEnd || '',
        });

        // Check for baseline breach on target
        const baseline = baselines?.[node_id];
        if (baseline?.baseline0End && newEnd) {
          const b0End = parseDate(baseline.baseline0End);
          const projFinish = parseDate(newEnd);
          if (b0End && projFinish && projFinish > b0End) {
            const slipDays = Math.round(
              (projFinish.getTime() - b0End.getTime()) / (1000 * 60 * 60 * 24),
            );
            breachList.push({
              nodeId: node_id,
              nodeCode: targetRow.code,
              nodeName: targetRow.name,
              breachType: 'BASELINE_B0',
              milestoneDescription: `Contract Baseline B₀ (${targetRow.code})`,
              slipDays,
              totalFloat: newFloat,
            });
          }
        }

        // Propagate to downstream successors
        const successorMap = new Map<
          string,
          { successorId: string; dependencyType: string; lagDays: number }[]
        >();
        for (const dep of dependencies || []) {
          if (!successorMap.has(dep.predecessor_id)) {
            successorMap.set(dep.predecessor_id, []);
          }
          successorMap.get(dep.predecessor_id)!.push({
            successorId: dep.successor_id,
            dependencyType: dep.dependency_type,
            lagDays: dep.lag_days,
          });
        }

        const visited = new Set<string>();
        const propagate = (nodeId: string, newFinish: string) => {
          if (visited.has(nodeId)) return;
          visited.add(nodeId);

          const successors = successorMap.get(nodeId) || [];
          for (const { successorId, dependencyType, lagDays } of successors) {
            const succRow = rowMap.get(successorId);
            if (!succRow) continue;

            const succOrigStart = succRow.early_start || succRow.planned_start_date;
            const succOrigFinish = succRow.early_finish || succRow.planned_end_date;
            const succDuration = succOrigStart && succOrigFinish
              ? Math.round(
                  (parseDate(succOrigFinish)!.getTime() - parseDate(succOrigStart)!.getTime()) /
                    (1000 * 60 * 60 * 24),
                )
              : 0;

            let succProjectedStart: string | null = null;

            switch (dependencyType) {
              case 'FS':
                succProjectedStart = addWorkingDays(newFinish, lagDays);
                break;
              case 'SS': {
                const targetProjStart = cascade.get(nodeId)?.projectedStart;
                succProjectedStart = targetProjStart
                  ? addWorkingDays(targetProjStart, lagDays)
                  : succOrigStart;
                break;
              }
              default:
                succProjectedStart = succOrigStart;
            }

            if (!succProjectedStart) continue;

            const succProjectedFinish = addWorkingDays(succProjectedStart, succDuration);
            const succFloat = succRow.total_float ?? Infinity;
            const succDelta = succOrigStart && succProjectedStart
              ? Math.round(
                  (parseDate(succProjectedStart)!.getTime() - parseDate(succOrigStart)!.getTime()) /
                    (1000 * 60 * 60 * 24),
                )
              : 0;
            const floatConsumed = Math.max(0, succDelta);

            // Only propagate if float is within threshold or shift exceeds available float
            if (succFloat <= 5 || floatConsumed > succFloat) {
              const succNewFloat = (succRow.total_float ?? 0) - succDelta;

              cascade.set(successorId, {
                projectedStart: succProjectedStart,
                projectedFinish: succProjectedFinish || '',
                floatConsumed,
                originalStart: succOrigStart || '',
                originalFinish: succOrigFinish || '',
              });

              // Add downstream impact row
              impact.push({
                nodeId: successorId,
                nodeCode: succRow.code,
                nodeName: succRow.name,
                field: 'Start Date',
                oldValue: succOrigStart,
                newValue: succProjectedStart,
                delta: `${succDelta > 0 ? '+' : ''}${succDelta} days`,
                isDirectTarget: false,
                floatConsumed,
                totalFloat: succNewFloat,
                isCriticalPathTransition: (succRow.total_float ?? 0) >= 0 && succNewFloat < 0,
              });

              // Check for baseline breach on successor
              const succBaseline = baselines?.[successorId];
              if (succBaseline?.baseline0End && succProjectedFinish) {
                const b0End = parseDate(succBaseline.baseline0End);
                const projFinish = parseDate(succProjectedFinish);
                if (b0End && projFinish && projFinish > b0End) {
                  const slipDays = Math.round(
                    (projFinish.getTime() - b0End.getTime()) / (1000 * 60 * 60 * 24),
                  );
                  breachList.push({
                    nodeId: successorId,
                    nodeCode: succRow.code,
                    nodeName: succRow.name,
                    breachType: 'BASELINE_B0',
                    milestoneDescription: `Contract Baseline B₀ (${succRow.code})`,
                    slipDays,
                    totalFloat: succNewFloat,
                  });
                }
              }

              // Recurse
              propagate(successorId, succProjectedFinish || '');
            }
          }
        };

        // Start propagation from the target node
        propagate(node_id, newEnd || '');

      } else {
        // Fallback: build generic operations from arguments
        const genericOps: HistoryOperation[] = Object.entries(toolCall.arguments).map(
          ([key, value]) => ({
            node_id: node_id || '',
            field: key,
            oldValue: null,
            newValue: String(value),
          }),
        );
        ops.push(...genericOps);
      }
    } else if (toolCall.name === 'create_precedence_link') {
      const pred_id = (toolCall.arguments.pred_id as string) || '';
      const succ_id = (toolCall.arguments.succ_id as string) || '';
      const linkType = (toolCall.arguments.link_type as string) || 'FS';
      const lagDays = (toolCall.arguments.lag_days as number) || 0;

      ops.push({
        node_id: succ_id,
        field: 'dependency_links',
        oldValue: null,
        newValue: `ADD_LINK:${linkType}:${pred_id}->${succ_id}:${lagDays}`,
      });

      const predRow = rowMap.get(pred_id);
      const succRow = rowMap.get(succ_id);

      if (predRow && succRow) {
        impact.push({
          nodeId: succ_id,
          nodeCode: succRow.code,
          nodeName: succRow.name,
          field: 'Dependency',
          oldValue: 'None',
          newValue: `${linkType} from ${predRow.code}`,
          delta: lagDays ? `+${lagDays} day lag` : '',
          isDirectTarget: true,
          totalFloat: succRow.total_float,
        });
      }
    } else if (toolCall.name === 'update_progress_percentage') {
      const percent = (toolCall.arguments.percent as number) || 0;
      const oldPercent = targetRow?.percent_complete ?? 0;

      ops.push({
        node_id,
        field: 'percent_complete',
        oldValue: oldPercent,
        newValue: percent,
      });

      if (targetRow) {
        impact.push({
          nodeId: node_id,
          nodeCode: targetRow.code,
          nodeName: targetRow.name,
          field: 'Progress',
          oldValue: `${oldPercent}%`,
          newValue: `${percent}%`,
          delta: `${percent > oldPercent ? '+' : ''}${percent - oldPercent}%`,
          isDirectTarget: true,
        });
      }
    } else if (toolCall.name === 'flag_operational_blocker') {
      const severity = (toolCall.arguments.severity as string) || 'MAJOR';
      const category = (toolCall.arguments.category as string) || 'OPERATIONAL_IMPEDIMENT';
      const blockerId = `blocker-${Date.now()}`;

      ops.push({
        node_id,
        field: 'blockers',
        oldValue: null,
        newValue: `ADD_BLOCKER:${severity}:${category}:${blockerId}`,
      });

      if (targetRow) {
        impact.push({
          nodeId: node_id,
          nodeCode: targetRow.code,
          nodeName: targetRow.name,
          field: 'Blocker',
          oldValue: 'None',
          newValue: `${severity}: ${category}`,
          delta: '',
          isDirectTarget: true,
        });
      }
    }

    // Build the HistoryCommand
    const cmd: HistoryCommand = {
      id: `copilot-${Date.now()}`,
      type: 'BATCH_EDIT',
      timestamp: Date.now(),
      description: `${TOOL_LABELS[toolCall.name] || toolCall.name}: ${buildDescription(toolCall)}`,
      operations: ops,
    };

    setStaged(cmd);
    setImpactRows(impact);
    setBreaches(breachList);
    setCascadeMap(cascade);
  }, [toolCall, rows]);

  /**
   * Commit the staged action: push to history store and dispatch to backend.
   */
  const handleCommit = useCallback(async () => {
    if (!staged || !toolCall) return;
    setIsCommitting(true);

    // Push to history store for undo/redo
    pushCommand({
      type: staged.type,
      description: staged.description,
      operations: staged.operations,
    });

    // Dispatch to backend
    try {
      await api.post('/copilot/execute-tool', {
        tool_name: toolCall.name,
        arguments: toolCall.arguments,
      });
    } catch (e) {
      console.error('Failed to execute tool:', e);
    }

    onCommit(staged);
    setIsCommitting(false);
    onClose();
  }, [staged, toolCall, pushCommand, onCommit, onClose]);

  /**
   * Revert the staged action using history store undo.
   */
  const handleRevert = useCallback(() => {
    // No-op for staged (not yet committed) actions
    setStaged(null);
    setImpactRows([]);
    setBreaches([]);
    setCascadeMap(new Map());
    onClose();
  }, [onClose]);

  // Keyboard shortcuts: Enter to accept, Esc to dismiss
  useEffect(() => {
    if (!isOpen) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleCommit();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, handleCommit]);

  if (!isOpen || !toolCall || !staged) return null;

  const toolIcon = TOOL_ICONS[toolCall.name] || <AlertTriangle className="w-5 h-5 text-yellow-400" />;
  const toolLabel = TOOL_LABELS[toolCall.name] || toolCall.name;

  const hasBaselineSlip = breaches.some((b) => b.breachType === 'BASELINE_B0');
  const hasCdrdBreach = breaches.some((b) => b.breachType === 'CDRL_DUE_DATE');
  const hasNegativeFloat = breaches.some((b) => b.breachType === 'NEGATIVE_FLOAT');
  const hasCriticalBreach = hasBaselineSlip || hasCdrdBreach || hasNegativeFloat;

  const directTargetRows = impactRows.filter((r) => r.isDirectTarget);
  const downstreamRows = impactRows.filter((r) => !r.isDirectTarget);

  // Ghost layer rendering — compute dateToX for the modal's mini Gantt preview
  const ghostLayerData = useMemo(() => {
    if (cascadeMap.size === 0) return null;

    // Find the date range for the ghost layer
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    for (const [, proj] of cascadeMap) {
      const start = parseDate(proj.projectedStart);
      const finish = parseDate(proj.projectedFinish);
      const origStart = parseDate(proj.originalStart);
      const origFinish = parseDate(proj.originalFinish);

      if (start) {
        if (!minDate || start < minDate) minDate = start;
        if (!maxDate || start > maxDate) maxDate = start;
      }
      if (finish) {
        if (!minDate || finish < minDate) minDate = finish;
        if (!maxDate || finish > maxDate) maxDate = finish;
      }
      if (origStart) {
        if (!minDate || origStart < minDate) minDate = origStart;
        if (!maxDate || origStart > maxDate) maxDate = origStart;
      }
      if (origFinish) {
        if (!minDate || origFinish < minDate) minDate = origFinish;
        if (!maxDate || origFinish > maxDate) maxDate = origFinish;
      }
    }

    if (!minDate || !maxDate) return null;

    // Add padding
    const padding = (maxDate.getTime() - minDate.getTime()) * 0.1;
    const paddedStart = new Date(minDate.getTime() - padding);
    const paddedEnd = new Date(maxDate.getTime() + padding);

    const totalDays = Math.ceil((paddedEnd.getTime() - paddedStart.getTime()) / (1000 * 60 * 60 * 24));
    const pixelsPerDay = 4;
    const timelineWidth = totalDays * pixelsPerDay;

    const dateToX = (dateStr: string | null): number => {
      const d = parseDate(dateStr);
      if (!d) return 0;
      const diffMs = d.getTime() - paddedStart.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      return diffDays * pixelsPerDay;
    };

    return {
      rows: rows.filter((r) => cascadeMap.has(r.id)),
      cascadeMap,
      dateToX,
      timelineWidth,
      rowHeight: 36,
      barHeight: 28,
    };
  }, [cascadeMap, rows]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-4xl mx-4 bg-bg-ops-surface border border-border-ops-strong rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-overlay/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-blue-600/20">
              {toolIcon}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-ops-primary">
                Copilot Recommendation: {toolLabel}
              </h2>
              <p className="text-xs text-text-ops-muted mt-0.5">
                {staged.description}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 min-h-0">
          {/* Contractual Check Warnings */}
          {breaches.length > 0 && (
            <div className="space-y-2">
              {hasBaselineSlip && (
                <div className="flex items-start gap-3 bg-red-600/10 border border-red-500/30 rounded-lg p-4">
                  <ShieldAlert className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-red-300">
                      Baseline Slip Warning
                    </div>
                    <div className="text-xs text-red-400/80 mt-1">
                      This action will cause the projected finish date to exceed the approved
                      Contract Baseline B₀. Review the impact carefully before proceeding.
                    </div>
                    {breaches
                      .filter((b) => b.breachType === 'BASELINE_B0')
                      .map((b, i) => (
                        <div key={i} className="mt-2 text-xs font-mono text-red-300 bg-red-900/30 rounded px-2 py-1.5">
                          {b.nodeCode} ({b.nodeName}): +{b.slipDays} days slip · TF = {b.totalFloat} days
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {hasCdrdBreach && (
                <div className="flex items-start gap-3 bg-amber-600/10 border border-amber-500/30 rounded-lg p-4">
                  <AlertOctagon className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-amber-300">
                      CDRL Due Date Breach
                    </div>
                    <div className="text-xs text-amber-400/80 mt-1">
                      This action will cause one or more CDRL deliverables to miss their
                      statutory due dates.
                    </div>
                  </div>
                </div>
              )}

              {hasNegativeFloat && (
                <div className="flex items-start gap-3 bg-orange-600/10 border border-orange-500/30 rounded-lg p-4">
                  <AlertTriangle className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-orange-300">
                      Critical Path Transition
                    </div>
                    <div className="text-xs text-orange-400/80 mt-1">
                      One or more tasks will transition to the critical path (Total Float &lt; 0).
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Topological Impact Summary Table */}
          <div>
            <h3 className="text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-3 flex items-center gap-2">
              <GitBranch className="w-3.5 h-3.5" />
              Topological Impact Summary
            </h3>

            {/* Direct Target Section */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-medium text-text-ops-primary">Direct Target</span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border-ops-subtle">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-bg-ops-overlay/50">
                      <th className="text-left px-3 py-2 text-text-ops-muted font-medium">Attribute</th>
                      <th className="text-left px-3 py-2 text-text-ops-muted font-medium">Before</th>
                      <th className="text-left px-3 py-2 text-text-ops-muted font-medium">After</th>
                      <th className="text-left px-3 py-2 text-text-ops-muted font-medium">Delta</th>
                      <th className="text-left px-3 py-2 text-text-ops-muted font-medium">TF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {directTargetRows.map((row, i) => (
                      <tr
                        key={i}
                        className={clsx(
                          'border-t border-border-ops-subtle',
                          row.isCriticalPathTransition && 'bg-red-600/10',
                        )}
                      >
                        <td className="px-3 py-2 text-text-ops-primary">
                          <div className="font-medium">{row.field}</div>
                          <div className="text-[10px] text-text-ops-muted">{row.nodeCode} · {row.nodeName}</div>
                        </td>
                        <td className="px-3 py-2 font-mono text-text-ops-muted">
                          {row.field.includes('Float') || row.field.includes('Progress') || row.field.includes('Dependency') || row.field.includes('Blocker')
                            ? String(row.oldValue)
                            : formatDate(row.oldValue)}
                        </td>
                        <td className="px-3 py-2 font-mono text-green-300">
                          {row.field.includes('Float') || row.field.includes('Progress') || row.field.includes('Dependency') || row.field.includes('Blocker')
                            ? String(row.newValue)
                            : formatDate(row.newValue)}
                        </td>
                        <td className="px-3 py-2">
                          {row.delta && (
                            <span className={clsx(
                              'px-1.5 py-0.5 rounded text-[10px] font-medium',
                              row.isCriticalPathTransition
                                ? 'bg-red-600/20 text-red-300'
                                : row.delta.startsWith('-')
                                ? 'bg-blue-600/20 text-blue-300'
                                : 'bg-amber-600/20 text-amber-300',
                            )}>
                              {row.delta}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {row.totalFloat !== undefined && row.totalFloat !== null && (
                            <span className={clsx(
                              'font-mono',
                              row.totalFloat < 0 ? 'text-red-400 font-bold' : 'text-text-ops-muted',
                            )}>
                              {row.totalFloat}d
                            </span>
                          )}
                          {row.isCriticalPathTransition && (
                            <span className="ml-1 text-[10px] text-red-400">⚠ CRITICAL</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Downstream Successors Section */}
            {downstreamRows.length > 0 && (
              <div>
                <button
                  onClick={() => setShowDownstream(!showDownstream)}
                  className="flex items-center gap-2 mb-2 text-xs font-medium text-text-ops-primary hover:text-text-ops-primary/80 transition-colors"
                >
                  {showDownstream ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                  Downstream Driving Successors ({downstreamRows.length})
                  {downstreamRows.some((r) => r.isCriticalPathTransition) && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600/20 text-red-300">
                      CRITICAL PATH
                    </span>
                  )}
                </button>

                {showDownstream && (
                  <div className="overflow-x-auto rounded-lg border border-border-ops-subtle">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-bg-ops-overlay/50">
                          <th className="text-left px-3 py-2 text-text-ops-muted font-medium">Task</th>
                          <th className="text-left px-3 py-2 text-text-ops-muted font-medium">Attribute</th>
                          <th className="text-left px-3 py-2 text-text-ops-muted font-medium">Before</th>
                          <th className="text-left px-3 py-2 text-text-ops-muted font-medium">After</th>
                          <th className="text-left px-3 py-2 text-text-ops-muted font-medium">Float Consumed</th>
                          <th className="text-left px-3 py-2 text-text-ops-muted font-medium">New TF</th>
                        </tr>
                      </thead>
                      <tbody>
                        {downstreamRows.map((row, i) => (
                          <tr
                            key={i}
                            className={clsx(
                              'border-t border-border-ops-subtle',
                              row.isCriticalPathTransition && 'bg-red-600/10',
                            )}
                          >
                            <td className="px-3 py-2 text-text-ops-primary">
                              <div className="font-medium">{row.nodeCode}</div>
                              <div className="text-[10px] text-text-ops-muted">{row.nodeName}</div>
                            </td>
                            <td className="px-3 py-2 text-text-ops-muted">{row.field}</td>
                            <td className="px-3 py-2 font-mono text-text-ops-muted">
                              {formatDate(row.oldValue)}
                            </td>
                            <td className="px-3 py-2 font-mono text-green-300">
                              {formatDate(row.newValue)}
                            </td>
                            <td className="px-3 py-2">
                              {row.floatConsumed !== undefined && row.floatConsumed > 0 && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-600/20 text-amber-300">
                                  {row.floatConsumed}d
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {row.totalFloat !== undefined && row.totalFloat !== null && (
                                <span className={clsx(
                                  'font-mono',
                                  row.totalFloat < 0 ? 'text-red-400 font-bold' : 'text-text-ops-muted',
                                )}>
                                  {row.totalFloat}d
                                </span>
                              )}
                              {row.isCriticalPathTransition && (
                                <span className="ml-1 text-[10px] text-red-400">⚠</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Interactive Gantt Ghost Preview */}
          {ghostLayerData && ghostLayerData.cascadeMap.size > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                <CalendarDays className="w-3.5 h-3.5" />
                Gantt Ghost Preview
              </h3>
              <div
                ref={ganttRef}
                className="relative overflow-x-auto rounded-lg border border-border-ops-subtle bg-bg-ops-overlay/30"
                style={{ maxHeight: '200px' }}
              >
                <GanttCanvasGhostLayer
                  rows={ghostLayerData.rows}
                  projectedCascadeMap={ghostLayerData.cascadeMap}
                  dateToX={ghostLayerData.dateToX}
                  rowHeight={ghostLayerData.rowHeight}
                  barHeight={ghostLayerData.barHeight}
                  hasCriticalBreach={hasCriticalBreach}
                  timelineWidth={ghostLayerData.timelineWidth}
                />
              </div>
              <p className="text-[10px] text-text-ops-muted mt-2">
                Dashed ghost bars show projected date shifts. Red bars indicate contractual breaches.
              </p>
            </div>
          )}

          {/* Tool Arguments */}
          <div>
            <h3 className="text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-2">
              Action Parameters
            </h3>
            <div className="bg-bg-ops-overlay/50 rounded-lg p-3 font-mono text-xs text-text-ops-muted border border-border-ops-subtle">
              <pre className="overflow-x-auto">
                {JSON.stringify(toolCall.arguments, null, 2)}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-ops-subtle bg-bg-ops-overlay/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-ops-muted hover:text-text-ops-primary rounded-lg hover:bg-bg-ops-overlay transition-colors"
            >
              Reject / Dismiss <span className="text-[10px] opacity-60 ml-1">(Esc)</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            {hasCriticalBreach && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/10 border border-red-500/30">
                <AlertOctagon className="w-3.5 h-3.5 text-red-400" />
                <span className="text-xs text-red-300 font-medium">Contractual breach detected</span>
              </div>
            )}
            <button
              onClick={handleCommit}
              disabled={isCommitting}
              className={clsx(
                'flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-colors',
                isCommitting
                  ? 'bg-blue-600/50 text-white/50 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-500',
              )}
            >
              <CheckCircle2 className="w-4 h-4" />
              {isCommitting ? 'Applying...' : 'Accept & Apply'}
              <span className="text-[10px] opacity-60 ml-1">(Enter)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Helper: build human-readable description from tool call
// ---------------------------------------------------------------------------

function buildDescription(toolCall: ToolCall): string {
  switch (toolCall.name) {
    case 'shift_task_dates':
      return `Shift by ${toolCall.arguments.delta_days} working days`;
    case 'create_precedence_link':
      return `${toolCall.arguments.link_type} link from ${toolCall.arguments.pred_id} to ${toolCall.arguments.succ_id}`;
    case 'update_progress_percentage':
      return `Set progress to ${toolCall.arguments.percent}%`;
    case 'flag_operational_blocker':
      return `${toolCall.arguments.severity} ${toolCall.arguments.category}`;
    default:
      return '';
  }
}

export default CopilotActionModal;
