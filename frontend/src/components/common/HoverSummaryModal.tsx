/**
 * Hover Summary Modal Component
 *
 * The interactive summary popup displayed by the dwell-and-hover inspector
 * system.  This component renders as a fixed-position overlay (z-index: 50)
 * and provides a compact, information-dense card for inspecting tasks,
 * resources, and locations without navigating away from the current view.
 *
 * Key Features
 * ------------
 * 1. **Security Classification Strip** — A color-coded border strip at the
 *    top of the modal matches the entity's security classification (OFFICIAL
 *    → sky blue, SECRET → red, TOP_SECRET → purple).
 *
 * 2. **Text Selection** — All text content is fully selectable so users can
 *    highlight and copy task codes, serial numbers, or ltree paths.
 *
 * 3. **Quick-Action Buttons** — Three primary actions:
 *    - "Jump to Gantt Bar" — Focuses and scrolls the Gantt timeline to the
 *      entity's position.
 *    - "Open Full Details" — Opens the lower split-pane workbench or right
 *      slide-out drawer for deep inspection.
 *    - "Flag Blocker" — Launches the rapid blocker creation modal.
 *
 * 4. **Inline Selectable Tabs** — Three tabs (Summary, Assignments, Blockers)
 *    toggle the content panel directly inside the popup without dismissing it.
 *
 * 5. **Dropdown Lock** — When a selectable dropdown (e.g., quick re-assign or
 *    status change) is open inside the modal, the exit-delay timer is paused
 *    via `useHoverModalStore.setLock(true)` so the modal doesn't dismiss
 *    while the user is interacting with it.
 *
 * 6. **Grace Countdown Bar** — A subtle 2-second fading border animation
 *    appears when the mouse exits the modal, visually indicating the remaining
 *    grace time before the modal auto-dismisses.
 *
 * @example
 * ```tsx
 * const { state, handlers, modalCallbacks, close } = useHoverInspector({
 *   targetData: { entityType: 'TASK', entityId: task.id },
 * });
 *
 * if (state.isOpen) {
 *   return (
 *     <HoverSummaryModal
 *       targetData={targetData}
 *       position={state.position}
 *       placement={state.placement}
 *       isExiting={state.isExiting}
 *       onClose={close}
 *       {...modalCallbacks}
 *     />
 *   );
 * }
 * ```
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { clsx } from 'clsx';
import {
  GanttChartIcon,
  FileText,
  AlertTriangle,
  Clock,
  CalendarDays,
  Shield,
  Lock,
  Users,
  AlertCircle,
  CheckCircle2,
  AlertOctagon,
  GitBranch,
  Package,
  MapPin,
  Cpu,
  Building2,
  Box,
  Layers,
  Wrench,
  Eye,
  Flag,
  Settings2,
  Loader2,
} from 'lucide-react';
import { useHoverModalStore } from '../../stores/useHoverModalStore';
import { TargetData, EntityType } from '../../stores/useHoverModalStore';
import {
  TaskHoverPreview,
  ResourceHoverPreview,
  LocationHoverPreview,
  AssignedResourceItem,
  SkillItem,
  VVTestSummary,
} from '../../types/preview';
import api from '../../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Active tab inside the modal */
export type HoverTab = 'summary' | 'assignments' | 'blockers';

/** Props for the HoverSummaryModal component */
export interface HoverSummaryModalProps {
  /** Entity data identifying the inspection target */
  targetData: TargetData;
  /** Whether the modal is currently in the exit cooldown period */
  isExiting: boolean;
  /** Called when the modal should close */
  onClose: () => void;
  /** Called when the mouse enters the modal (Intent Bridge) */
  onMouseEnter: () => void;
  /** Called when the mouse leaves the modal (Intent Bridge) */
  onMouseLeave: () => void;
  /** Optional: called when "Jump to Gantt" is clicked */
  onJumpToGantt?: (entityId: string) => void;
  /** Optional: called when "Open Full Details" is clicked */
  onOpenDetails?: (entityType: EntityType, entityId: string) => void;
  /** Optional: called when "Flag Blocker" is clicked */
  onFlagBlocker?: (entityId: string) => void;
  /** @floating-ui/react computed styles for positioning */
  floatingStyles?: React.CSSProperties;
  /** @floating-ui/react ref callback for the floating element */
  floatingRef?: (node: HTMLDivElement | null) => void;
  /** Optional: legacy position (used when floatingStyles is not provided) */
  position?: { x: number; y: number } | null;
  /** Optional: legacy placement direction */
  placement?: string;
}

// ---------------------------------------------------------------------------
// Classification Color Map
// ---------------------------------------------------------------------------

/** Maps security classification strings to Tailwind color classes */
const CLASSIFICATION_COLORS: Record<string, { border: string; bg: string; text: string; badge: string }> = {
  'OFFICIAL': {
    border: 'border-sky-400',
    bg: 'bg-sky-400',
    text: 'text-sky-400',
    badge: 'bg-sky-400/20 text-sky-300 border-sky-400/30',
  },
  'OFFICIAL_SENSITIVE': {
    border: 'border-cyan-400',
    bg: 'bg-cyan-400',
    text: 'text-cyan-400',
    badge: 'bg-cyan-400/20 text-cyan-300 border-cyan-400/30',
  },
  'SECRET': {
    border: 'border-red-400',
    bg: 'bg-red-400',
    text: 'text-red-400',
    badge: 'bg-red-400/20 text-red-300 border-red-400/30',
  },
  'TOP_SECRET': {
    border: 'border-purple-400',
    bg: 'bg-purple-400',
    text: 'text-purple-400',
    badge: 'bg-purple-400/20 text-purple-300 border-purple-400/30',
  },
};

/** Get classification color config, defaulting to OFFICIAL */
const getClassificationColors = (classification: string | null) => {
  if (!classification) return CLASSIFICATION_COLORS['OFFICIAL'];
  return CLASSIFICATION_COLORS[classification] || CLASSIFICATION_COLORS['OFFICIAL'];
};

// ---------------------------------------------------------------------------
// Delivery Mode Badge Colors
// ---------------------------------------------------------------------------

const DELIVERY_MODE_COLORS: Record<string, string> = {
  'WATERFALL': 'bg-blue-400/20 text-blue-300 border-blue-400/30',
  'AGILE': 'bg-emerald-400/20 text-emerald-300 border-emerald-400/30',
  'HYBRID': 'bg-amber-400/20 text-amber-300 border-amber-400/30',
};

// ---------------------------------------------------------------------------
// Helper: Format date
// ---------------------------------------------------------------------------

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

// ---------------------------------------------------------------------------
// Sub-component: Classification Strip
// ---------------------------------------------------------------------------

/**
 * Top security classification border strip.
 *
 * Renders a thin colored bar matching the entity's classification level,
 * providing an immediate visual cue about the sensitivity of the data.
 */
const ClassificationStrip: React.FC<{ classification: string | null }> = ({
  classification,
}) => {
  const colors = getClassificationColors(classification);

  return (
    <div
      className={clsx(
        'h-1 w-full rounded-t-lg',
        colors.bg,
      )}
      title={classification || 'OFFICIAL'}
    />
  );
};

// ---------------------------------------------------------------------------
// Sub-component: Classification Badge
// ---------------------------------------------------------------------------

/**
 * Inline classification badge with color-coded background.
 */
const ClassificationBadge: React.FC<{ classification: string | null }> = ({
  classification,
}) => {
  const colors = getClassificationColors(classification);

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border',
        colors.badge,
      )}
    >
      <Shield className="w-3 h-3" />
      {classification || 'OFFICIAL'}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: Progress Bar
// ---------------------------------------------------------------------------

/**
 * Mini horizontal progress bar with percentage text.
 */
const ProgressBar: React.FC<{ percent: number; className?: string }> = ({
  percent,
  className,
}) => {
  const clamped = Math.min(100, Math.max(0, percent));
  const color =
    clamped >= 100
      ? 'bg-green-400'
      : clamped >= 75
        ? 'bg-emerald-400'
        : clamped >= 50
          ? 'bg-amber-400'
          : clamped >= 25
            ? 'bg-orange-400'
            : 'bg-red-400';

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <div className="flex-1 h-1.5 bg-bg-ops-overlay rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all', color)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs font-mono text-text-ops-primary tabular-nums">
        {Math.round(clamped)}%
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: Tab Bar
// ---------------------------------------------------------------------------

/**
 * Inline pill selector toggling between Summary, Assignments, and Blockers.
 */
const TabBar: React.FC<{
  activeTab: HoverTab;
  onTabChange: (tab: HoverTab) => void;
  blockersCount?: number;
}> = ({ activeTab, onTabChange, blockersCount = 0 }) => {
  const tabs: { id: HoverTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'summary', label: 'Summary', icon: <Eye className="w-3 h-3" /> },
    { id: 'assignments', label: 'Assignments', icon: <Users className="w-3 h-3" /> },
    {
      id: 'blockers',
      label: 'Blockers',
      icon: <AlertTriangle className="w-3 h-3" />,
      badge: blockersCount,
    },
  ];

  return (
    <div className="flex gap-1 p-1 bg-bg-ops-overlay/50 rounded-lg">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={clsx(
            'flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-all',
            activeTab === tab.id
              ? 'bg-bg-ops-overlay text-text-ops-primary shadow-sm'
              : 'text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay/50',
          )}
        >
          {tab.icon}
          <span className="hidden sm:inline">{tab.label}</span>
          {tab.badge !== undefined && tab.badge > 0 && (
            <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-red-500 rounded-full">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: Quick Action Buttons
// ---------------------------------------------------------------------------

/**
 * Quick-action buttons row: Jump to Gantt, Open Details, Flag Blocker.
 */
const QuickActions: React.FC<{
  entityType: EntityType;
  entityId: string;
  onJumpToGantt?: (entityId: string) => void;
  onOpenDetails?: (entityType: EntityType, entityId: string) => void;
  onFlagBlocker?: (entityId: string) => void;
}> = ({
  entityType,
  entityId,
  onJumpToGantt,
  onOpenDetails,
  onFlagBlocker,
}) => {
  return (
    <div className="flex gap-1">
      {entityType === 'TASK' && (
        <button
          onClick={() => onJumpToGantt?.(entityId)}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-text-ops-muted bg-bg-ops-overlay/50 hover:bg-bg-ops-overlay hover:text-text-ops-primary rounded-md transition-all border border-border-ops-subtle hover:border-border-ops-strong"
          title="Jump to Gantt Bar"
        >
          <GanttChartIcon className="w-3 h-3" />
          <span className="hidden sm:inline">Gantt</span>
        </button>
      )}
      <button
        onClick={() => onOpenDetails?.(entityType, entityId)}
        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-text-ops-muted bg-bg-ops-overlay/50 hover:bg-bg-ops-overlay hover:text-text-ops-primary rounded-md transition-all border border-border-ops-subtle hover:border-border-ops-strong"
        title="Open Full Details"
      >
        <FileText className="w-3 h-3" />
        <span className="hidden sm:inline">Details</span>
      </button>
      {entityType === 'TASK' && (
        <button
          onClick={() => onFlagBlocker?.(entityId)}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-text-ops-muted bg-bg-ops-overlay/50 hover:bg-red-500/20 hover:text-red-300 rounded-md transition-all border border-border-ops-subtle hover:border-red-400/30"
          title="Flag Blocker"
        >
          <Flag className="w-3 h-3" />
          <span className="hidden sm:inline">Blocker</span>
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: Grace Countdown Bar
// ---------------------------------------------------------------------------

/**
 * Visual grace cue: a 2-second countdown bar that fades along the bottom
 * edge of the modal when the mouse exits, showing the user how much time
 * remains before auto-dismissal.
 */
const GraceCountdownBar: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  if (!isActive) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden rounded-b-lg">
      <div
        className="h-full bg-amber-400 animate-grace-countdown"
        style={{
          animation: 'graceCountdown 2s linear forwards',
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab Content: Summary
// ---------------------------------------------------------------------------

/**
 * Summary tab content for a task preview.
 */
const TaskSummaryTab: React.FC<{ data: TaskHoverPreview }> = ({ data }) => {
  const colors = getClassificationColors(data.security_classification);

  return (
    <div className="space-y-3" style={{ userSelect: 'text' }}>
      {/* Header: Code + Classification */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono font-bold text-text-ops-primary select-all">
              {data.code}
            </span>
            {data.is_critical && (
              <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-red-500/20 text-red-300 border border-red-400/30">
                Critical
              </span>
            )}
          </div>
          <h3 className="text-sm font-medium text-text-ops-primary mt-0.5">
            {data.is_masked ? (
              <span className="italic text-text-ops-muted flex items-center gap-1">
                <Lock className="w-3 h-3" />
                [RESTRICTED]
              </span>
            ) : (
              data.name
            )}
          </h3>
        </div>
        <ClassificationBadge classification={data.security_classification} />
      </div>

      {/* Caveats */}
      {data.caveats && data.caveats.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {data.caveats.map((caveat) => (
            <span
              key={caveat}
              className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-400/20 text-amber-300 border border-amber-400/30"
            >
              {caveat.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      {/* Delivery Mode */}
      {data.delivery_mode && (
        <span
          className={clsx(
            'inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border',
            DELIVERY_MODE_COLORS[data.delivery_mode] || 'bg-gray-400/20 text-gray-300 border-gray-400/30',
          )}
        >
          {data.delivery_mode}
        </span>
      )}

      {/* Dates */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-text-ops-muted">
          <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Start:</span>
          <span className="font-mono text-text-ops-primary tabular-nums select-all">
            {formatDate(data.planned_start)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-text-ops-muted">
          <CalendarDays className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Finish:</span>
          <span className="font-mono text-text-ops-primary tabular-nums select-all">
            {formatDate(data.planned_finish)}
          </span>
        </div>
      </div>

      {/* Progress */}
      <ProgressBar percent={data.percent_complete} />

      {/* Float */}
      {data.total_float !== null && (
        <div className="flex items-center gap-1.5 text-xs">
          <Clock className="w-3.5 h-3.5 flex-shrink-0 text-text-ops-muted" />
          <span className="text-text-ops-muted">Float:</span>
          <span
            className={clsx(
              'font-mono font-bold tabular-nums',
              data.total_float <= 0 ? 'text-red-400' : 'text-text-ops-primary',
            )}
          >
            {data.total_float}d
          </span>
        </div>
      )}

      {/* Blockers */}
      {data.active_blockers_count > 0 && (
        <div className="flex items-center gap-1.5 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
          <span className="text-amber-400 font-medium">
            {data.active_blockers_count} active blocker{data.active_blockers_count > 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* CDRL */}
      {data.linked_cdrl_code && (
        <div className="flex items-center gap-1.5 text-xs">
          <FileText className="w-3.5 h-3.5 flex-shrink-0 text-text-ops-muted" />
          <span className="text-text-ops-muted">CDRL:</span>
          <span className="font-mono text-text-ops-primary select-all">
            {data.linked_cdrl_code}
          </span>
        </div>
      )}

      {/* V&V */}
      {data.vv_test_summary && (
        <div className="flex items-center gap-1.5 text-xs">
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-text-ops-muted" />
          <span className="text-text-ops-muted">V&V:</span>
          <span className="font-mono text-text-ops-primary">
            {data.vv_test_summary.passed}/{data.vv_test_summary.total}
          </span>
          {data.vv_test_summary.passed < data.vv_test_summary.total && (
            <span className="text-amber-400 text-[10px]">
              (incomplete)
            </span>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Summary tab content for a resource preview.
 */
const ResourceSummaryTab: React.FC<{ data: ResourceHoverPreview }> = ({ data }) => {
  const typeIcon =
    data.resource_type === 'PERSON' ? (
      <Users className="w-3.5 h-3.5" />
    ) : data.resource_type === 'FACILITY' ? (
      <Building2 className="w-3.5 h-3.5" />
    ) : (
      <Package className="w-3.5 h-3.5" />
    );

  return (
    <div className="space-y-3" style={{ userSelect: 'text' }}>
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-bold text-text-ops-primary select-all">
            {data.code}
          </span>
          {data.resource_type && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-bg-ops-overlay text-text-ops-muted border border-border-ops-subtle">
              {typeIcon}
              {data.resource_type}
            </span>
          )}
        </div>
        <h3 className="text-sm font-medium text-text-ops-primary mt-0.5">
          {data.is_masked ? (
            <span className="italic text-text-ops-muted flex items-center gap-1">
              <Lock className="w-3 h-3" />
              [RESTRICTED]
            </span>
          ) : (
            data.name
          )}
        </h3>
      </div>

      {/* Clearance */}
      {data.clearance_level && (
        <ClassificationBadge classification={data.clearance_level} />
      )}

      {/* Location */}
      {data.current_location_path && (
        <div className="flex items-center gap-1.5 text-xs">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-text-ops-muted" />
          <span className="text-text-ops-muted">Location:</span>
          <span className="font-mono text-text-ops-primary text-[11px] select-all truncate">
            {data.current_location_path}
          </span>
        </div>
      )}

      {/* Allocation */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-ops-muted">Weekly Allocation</span>
          <span className="font-mono text-text-ops-primary tabular-nums">
            {data.allocated_hours_this_week.toFixed(1)}h / {data.capacity_hours.toFixed(1)}h
          </span>
        </div>
        <div className="h-1.5 bg-bg-ops-overlay rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all',
              data.allocated_hours_this_week > data.capacity_hours
                ? 'bg-red-400'
                : data.allocated_hours_this_week > data.capacity_hours * 0.8
                  ? 'bg-amber-400'
                  : 'bg-green-400',
            )}
            style={{
              width: `${Math.min(100, (data.allocated_hours_this_week / data.capacity_hours) * 100)}%`,
            }}
          />
        </div>
      </div>

      {/* Top Skills */}
      {data.top_skills.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs text-text-ops-muted">Top Skills</span>
          {data.top_skills.map((skill, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-text-ops-primary truncate">{skill.skill_name}</span>
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={clsx(
                        'w-1 h-2.5 rounded-sm',
                        level <= skill.proficiency_level
                          ? 'bg-emerald-400'
                          : 'bg-bg-ops-overlay',
                      )}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-text-ops-muted w-12 text-right">
                  {skill.verification_status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Summary tab content for a location preview.
 */
const LocationSummaryTab: React.FC<{ data: LocationHoverPreview }> = ({ data }) => {
  const tierIcon =
    data.tier === 'SITE' ? (
      <Building2 className="w-3.5 h-3.5" />
    ) : data.tier === 'FACILITY' ? (
      <Layers className="w-3.5 h-3.5" />
    ) : data.tier === 'ZONE' ? (
      <MapPin className="w-3.5 h-3.5" />
    ) : data.tier === 'ROOM' ? (
      <Box className="w-3.5 h-3.5" />
    ) : (
      <Package className="w-3.5 h-3.5" />
    );

  return (
    <div className="space-y-3" style={{ userSelect: 'text' }}>
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono font-bold text-text-ops-primary select-all">
            {data.code}
          </span>
          {data.tier && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-bg-ops-overlay text-text-ops-muted border border-border-ops-subtle">
              {tierIcon}
              {data.tier}
            </span>
          )}
        </div>
        <h3 className="text-sm font-medium text-text-ops-primary mt-0.5">
          {data.is_masked ? (
            <span className="italic text-text-ops-muted flex items-center gap-1">
              <Lock className="w-3 h-3" />
              [RESTRICTED]
            </span>
          ) : (
            data.name
          )}
        </h3>
      </div>

      {/* Path */}
      {data.path && (
        <div className="flex items-center gap-1.5 text-xs">
          <GitBranch className="w-3.5 h-3.5 flex-shrink-0 text-text-ops-muted" />
          <span className="text-text-ops-muted">Path:</span>
          <span className="font-mono text-text-ops-primary text-[11px] select-all truncate">
            {data.path}
          </span>
        </div>
      )}

      {/* SCIF / TEMPEST */}
      {data.is_scif_or_tempest && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-red-400/20 text-red-300 border border-red-400/30">
          <Shield className="w-3 h-3" />
          SCIF / TEMPEST
        </span>
      )}

      {/* Escort Required */}
      {data.escort_required && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
          <Users className="w-3 h-3" />
          Escort Required
        </span>
      )}

      {/* Contained Assets */}
      <div className="flex items-center gap-1.5 text-xs">
        <Package className="w-3.5 h-3.5 flex-shrink-0 text-text-ops-muted" />
        <span className="text-text-ops-muted">Assets:</span>
        <span className="font-mono text-text-ops-primary tabular-nums">
          {data.contained_assets_count}
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab Content: Assignments
// ---------------------------------------------------------------------------

/**
 * Assignments tab content for a task preview.
 */
const TaskAssignmentsTab: React.FC<{ data: TaskHoverPreview }> = ({ data }) => {
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const { setLock } = useHoverModalStore();

  const handleDropdownToggle = useCallback(
    (resourceName: string) => {
      const isOpen = dropdownOpen === resourceName;
      setDropdownOpen(isOpen ? null : resourceName);
      setLock(!isOpen);
    },
    [dropdownOpen, setLock],
  );

  if (data.assigned_resources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-text-ops-muted">
        <Users className="w-8 h-8 mb-2 opacity-50" />
        <span className="text-xs">No resources assigned</span>
      </div>
    );
  }

  return (
    <div className="space-y-2" style={{ userSelect: 'text' }}>
      {data.assigned_resources.map((resource, i) => (
        <div
          key={i}
          className="relative flex items-center justify-between p-2 bg-bg-ops-overlay/30 rounded-md border border-border-ops-subtle"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Users className="w-4 h-4 flex-shrink-0 text-text-ops-muted" />
            <div className="min-w-0">
              <div className="text-xs font-medium text-text-ops-primary truncate select-all">
                {resource.name}
              </div>
              <div className="text-[10px] text-text-ops-muted font-mono tabular-nums">
                {resource.allocation_percent.toFixed(0)}% allocated
              </div>
            </div>
          </div>

          {/* Quick Re-assign Dropdown */}
          <div className="relative flex-shrink-0 ml-2">
            <button
              onClick={() => handleDropdownToggle(resource.name)}
              className="p-1 text-text-ops-muted hover:text-text-ops-primary rounded transition-colors"
              title="Quick re-assign"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>

            {dropdownOpen === resource.name && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-bg-ops-surface border border-border-ops-strong rounded-md shadow-xl z-50 py-1">
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
                  onClick={() => {
                    setDropdownOpen(null);
                    setLock(false);
                  }}
                >
                  <Wrench className="w-3 h-3" />
                  Re-assign resource
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-amber-300 hover:bg-bg-ops-overlay transition-colors"
                  onClick={() => {
                    setDropdownOpen(null);
                    setLock(false);
                  }}
                >
                  <AlertCircle className="w-3 h-3" />
                  Reduce allocation
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Assignments tab content for a resource preview (shows skills).
 */
const ResourceAssignmentsTab: React.FC<{ data: ResourceHoverPreview }> = ({ data }) => {
  if (data.top_skills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-text-ops-muted">
        <Cpu className="w-8 h-8 mb-2 opacity-50" />
        <span className="text-xs">No skills profiled</span>
      </div>
    );
  }

  return (
    <div className="space-y-2" style={{ userSelect: 'text' }}>
      {data.top_skills.map((skill, i) => (
        <div
          key={i}
          className="flex items-center justify-between p-2 bg-bg-ops-overlay/30 rounded-md border border-border-ops-subtle"
        >
          <div className="min-w-0">
            <div className="text-xs font-medium text-text-ops-primary truncate select-all">
              {skill.skill_name}
            </div>
            <div className="text-[10px] text-text-ops-muted">
              {skill.verification_status}
            </div>
          </div>
          <div className="flex gap-0.5 ml-2 flex-shrink-0">
            {[1, 2, 3, 4, 5].map((level) => (
              <div
                key={level}
                className={clsx(
                  'w-2 h-3 rounded-sm',
                  level <= skill.proficiency_level
                    ? 'bg-emerald-400'
                    : 'bg-bg-ops-overlay',
                )}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Assignments tab content for a location preview (shows contained assets).
 */
const LocationAssignmentsTab: React.FC<{ data: LocationHoverPreview }> = ({ data }) => {
  return (
    <div className="space-y-2" style={{ userSelect: 'text' }}>
      <div className="flex items-center justify-between p-2 bg-bg-ops-overlay/30 rounded-md border border-border-ops-subtle">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 flex-shrink-0 text-text-ops-muted" />
          <span className="text-xs text-text-ops-primary">Contained Assets</span>
        </div>
        <span className="text-xs font-mono text-text-ops-primary tabular-nums">
          {data.contained_assets_count}
        </span>
      </div>
      {data.contained_assets_count === 0 && (
        <div className="flex flex-col items-center justify-center py-4 text-text-ops-muted">
          <Package className="w-6 h-6 mb-1 opacity-50" />
          <span className="text-[11px]">No assets in this location</span>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab Content: Blockers
// ---------------------------------------------------------------------------

/**
 * Blockers tab content for a task preview.
 * Shows a placeholder since detailed blocker data requires a separate API call.
 */
const TaskBlockersTab: React.FC<{ data: TaskHoverPreview }> = ({ data }) => {
  if (data.active_blockers_count === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-text-ops-muted">
        <CheckCircle2 className="w-8 h-8 mb-2 opacity-50 text-green-400" />
        <span className="text-xs">No active blockers</span>
        <span className="text-[10px] mt-1">This task is clear to proceed</span>
      </div>
    );
  }

  return (
    <div className="space-y-2" style={{ userSelect: 'text' }}>
      <div className="flex items-center gap-2 p-2 bg-amber-400/10 rounded-md border border-amber-400/30">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
        <div>
          <div className="text-xs font-medium text-amber-300">
            {data.active_blockers_count} Active Blocker{data.active_blockers_count > 1 ? 's' : ''}
          </div>
          <div className="text-[10px] text-amber-400/70">
            Task progress is impeded
          </div>
        </div>
      </div>

      <div className="p-2 bg-bg-ops-overlay/30 rounded-md border border-border-ops-subtle">
        <div className="text-[11px] text-text-ops-muted">
          Detailed blocker information requires opening the full task details.
        </div>
      </div>
    </div>
  );
};

/**
 * Blockers tab for resource preview (shows overallocation warning).
 */
const ResourceBlockersTab: React.FC<{ data: ResourceHoverPreview }> = ({ data }) => {
  const isOverallocated = data.allocated_hours_this_week > data.capacity_hours;

  if (!isOverallocated) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-text-ops-muted">
        <CheckCircle2 className="w-8 h-8 mb-2 opacity-50 text-green-400" />
        <span className="text-xs">No allocation issues</span>
        <span className="text-[10px] mt-1">
          Within capacity: {data.allocated_hours_this_week.toFixed(1)}h / {data.capacity_hours.toFixed(1)}h
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2" style={{ userSelect: 'text' }}>
      <div className="flex items-center gap-2 p-2 bg-red-400/10 rounded-md border border-red-400/30">
        <AlertOctagon className="w-4 h-4 flex-shrink-0 text-red-400" />
        <div>
          <div className="text-xs font-medium text-red-300">Over-allocated</div>
          <div className="text-[10px] text-red-400/70">
            {data.allocated_hours_this_week.toFixed(1)}h / {data.capacity_hours.toFixed(1)}h weekly capacity
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Blockers tab for location preview (shows SCIF/escort warnings).
 */
const LocationBlockersTab: React.FC<{ data: LocationHoverPreview }> = ({ data }) => {
  const hasWarnings = data.is_scif_or_tempest || data.escort_required;

  if (!hasWarnings) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-text-ops-muted">
        <CheckCircle2 className="w-8 h-8 mb-2 opacity-50 text-green-400" />
        <span className="text-xs">No access restrictions</span>
      </div>
    );
  }

  return (
    <div className="space-y-2" style={{ userSelect: 'text' }}>
      {data.is_scif_or_tempest && (
        <div className="flex items-center gap-2 p-2 bg-red-400/10 rounded-md border border-red-400/30">
          <Shield className="w-4 h-4 flex-shrink-0 text-red-400" />
          <div>
            <div className="text-xs font-medium text-red-300">SCIF / TEMPEST Facility</div>
            <div className="text-[10px] text-red-400/70">
              Classified access controls enforced
            </div>
          </div>
        </div>
      )}
      {data.escort_required && (
        <div className="flex items-center gap-2 p-2 bg-amber-400/10 rounded-md border border-amber-400/30">
          <Users className="w-4 h-4 flex-shrink-0 text-amber-400" />
          <div>
            <div className="text-xs font-medium text-amber-300">Escort Required</div>
            <div className="text-[10px] text-amber-400/70">
              Visitors must be accompanied
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * HoverSummaryModal — The main interactive summary popup.
 *
 * Renders as a fixed-position overlay with classification strip, tabs,
 * quick actions, and grace countdown bar.  Integrates with the global
 * hover modal store for lock state management.
 */
const HoverSummaryModal: React.FC<HoverSummaryModalProps> = ({
  targetData,
  isExiting,
  onClose,
  onMouseEnter,
  onMouseLeave,
  onJumpToGantt,
  onOpenDetails,
  onFlagBlocker,
  floatingStyles,
  floatingRef,
  position,
  placement,
}) => {
  const [activeTab, setActiveTab] = useState<HoverTab>('summary');
  const [previewData, setPreviewData] = useState<
    | TaskHoverPreview
    | ResourceHoverPreview
    | LocationHoverPreview
    | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Fetch preview data on mount
  useEffect(() => {
    const fetchPreview = async () => {
      setLoading(true);
      setError(null);

      try {
        let endpoint = '';
        switch (targetData.entityType) {
          case 'TASK':
            endpoint = `/api/v1/previews/tasks/${targetData.entityId}`;
            break;
          case 'RESOURCE':
            endpoint = `/api/v1/previews/resources/${targetData.entityId}`;
            break;
          case 'LOCATION':
            endpoint = `/api/v1/previews/locations/${targetData.entityId}`;
            break;
          case 'CDRL':
            // CDRL previews not yet supported — fall back to empty
            setLoading(false);
            return;
        }

        const response = await api.get(endpoint);
        if (response.status === 200) {
          setPreviewData(response.data);
        } else {
          setError('Failed to load preview data');
        }
      } catch (err) {
        // If the preview endpoint is unavailable, show a minimal card
        console.debug('Preview fetch failed:', err);
        setError(null);
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();
  }, [targetData.entityType, targetData.entityId]);

  // Determine the classification from preview data
  const classification =
    targetData.entityType === 'TASK' && previewData
      ? (previewData as TaskHoverPreview).security_classification
      : targetData.entityType === 'RESOURCE' && previewData
        ? (previewData as ResourceHoverPreview).clearance_level
        : null;

  // Blocker count for the tab badge
  const blockersCount =
    targetData.entityType === 'TASK' && previewData
      ? (previewData as TaskHoverPreview).active_blockers_count
      : 0;

  // Render the appropriate tab content based on entity type and active tab
  const renderTabContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-text-ops-muted animate-spin" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-6 text-text-ops-muted">
          <AlertCircle className="w-6 h-6 mb-2 opacity-50" />
          <span className="text-xs text-center">{error}</span>
        </div>
      );
    }

    if (!previewData) {
      return (
        <div className="flex flex-col items-center justify-center py-6 text-text-ops-muted">
          <Eye className="w-6 h-6 mb-2 opacity-50" />
          <span className="text-xs">No preview data available</span>
        </div>
      );
    }

    switch (activeTab) {
      case 'summary':
        switch (targetData.entityType) {
          case 'TASK':
            return <TaskSummaryTab data={previewData as TaskHoverPreview} />;
          case 'RESOURCE':
            return <ResourceSummaryTab data={previewData as ResourceHoverPreview} />;
          case 'LOCATION':
            return <LocationSummaryTab data={previewData as LocationHoverPreview} />;
          default:
            return null;
        }
      case 'assignments':
        switch (targetData.entityType) {
          case 'TASK':
            return <TaskAssignmentsTab data={previewData as TaskHoverPreview} />;
          case 'RESOURCE':
            return <ResourceAssignmentsTab data={previewData as ResourceHoverPreview} />;
          case 'LOCATION':
            return <LocationAssignmentsTab data={previewData as LocationHoverPreview} />;
          default:
            return null;
        }
      case 'blockers':
        switch (targetData.entityType) {
          case 'TASK':
            return <TaskBlockersTab data={previewData as TaskHoverPreview} />;
          case 'RESOURCE':
            return <ResourceBlockersTab data={previewData as ResourceHoverPreview} />;
          case 'LOCATION':
            return <LocationBlockersTab data={previewData as LocationHoverPreview} />;
          default:
            return null;
        }
    }
  };

  // Determine positioning: prefer floating-ui styles, fall back to legacy CSS
  const modalStyle: React.CSSProperties = floatingStyles
    ? floatingStyles
    : position
      ? {
          position: 'fixed' as const,
          left: `${position.x}px`,
          top: `${position.y}px`,
        }
      : {
          position: 'fixed' as const,
          left: '0px',
          top: '0px',
        };

  return (
    <div
      ref={(node) => {
        (modalRef as any).current = node;
        floatingRef?.(node);
      }}
      className={clsx(
        'z-50 w-[340px] rounded-lg shadow-2xl',
        'bg-bg-ops-surface border border-border-ops-strong',
        'overflow-hidden',
      )}
      style={modalStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Classification Strip */}
      <ClassificationStrip classification={classification} />

      {/* Grace Countdown Bar */}
      <GraceCountdownBar isActive={isExiting} />

      {/* Header */}
      <div className="px-3 pt-2 pb-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {targetData.entityType === 'TASK' && (
              <GitBranch className="w-4 h-4 text-text-ops-muted" />
            )}
            {targetData.entityType === 'RESOURCE' && (
              <Users className="w-4 h-4 text-text-ops-muted" />
            )}
            {targetData.entityType === 'LOCATION' && (
              <MapPin className="w-4 h-4 text-text-ops-muted" />
            )}
            {targetData.entityType === 'CDRL' && (
              <FileText className="w-4 h-4 text-text-ops-muted" />
            )}
            <span className="text-xs font-semibold text-text-ops-primary uppercase tracking-wider">
              {targetData.entityType}
            </span>
          </div>
          <ClassificationBadge classification={classification} />
        </div>
      </div>

      {/* Tab Bar */}
      <div className="px-3 pb-2">
        <TabBar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          blockersCount={blockersCount}
        />
      </div>

      {/* Tab Content */}
      <div className="px-3 pb-2 max-h-[300px] overflow-y-auto">
        {renderTabContent()}
      </div>

      {/* Quick Actions */}
      <div className="px-3 pb-3">
        <QuickActions
          entityType={targetData.entityType}
          entityId={targetData.entityId}
          onJumpToGantt={onJumpToGantt}
          onOpenDetails={onOpenDetails}
          onFlagBlocker={onFlagBlocker}
        />
      </div>

      {/* Inline Styles for Grace Countdown Animation */}
      <style>{`
        @keyframes graceCountdown {
          0% {
            width: 100%;
            opacity: 1;
          }
          100% {
            width: 0%;
            opacity: 0;
          }
        }
        
        /* Ensure text selection is enabled inside the modal */
        .hover-summary-modal [style*="userSelect"] {
          -webkit-user-select: text;
          -moz-user-select: text;
          -ms-user-select: text;
          user-select: text;
        }
        
        /* Custom scrollbar for tab content */
        .hover-summary-modal::-webkit-scrollbar {
          width: 4px;
        }
        .hover-summary-modal::-webkit-scrollbar-track {
          background: transparent;
        }
        .hover-summary-modal::-webkit-scrollbar-thumb {
          background: var(--border-ops-subtle);
          border-radius: 2px;
        }
        .hover-summary-modal::-webkit-scrollbar-thumb:hover {
          background: var(--border-ops-strong);
        }
      `}</style>
    </div>
  );
};

export default HoverSummaryModal;
