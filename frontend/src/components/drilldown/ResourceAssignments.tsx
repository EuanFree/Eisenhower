/**
 * Resource Assignments & Custody Component
 *
 * Tab C of the drill-down workbench: shows all resources allocated to the
 * selected task, including people, required skills, and physical equipment
 * with their current LocationNode path.
 *
 * Three sections:
 * 1. Allocated Personnel — people assigned to the task with allocation %,
 *    planned hours, rate snapshot, and status.
 * 2. Required Skills — skills needed for the task with minimum proficiency.
 * 3. Physical Equipment — assets assigned to the task with current location
 *    path (from LocationNode ltree).
 *
 * Corresponds to the backend ResourceAssignment, ResourceNode, and
 * AssetLocationLedger models.
 */

import React, { useMemo } from 'react';
import {
  User,
  Users,
  Wrench,
  MapPin,
  Shield,
  Briefcase,
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { WBSRow } from '../../types/wbs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Assignment status from the backend.
 */
export type AssignmentStatus = 'CONFIRMED' | 'CLAIMED' | 'REQUISITIONED';

/**
 * Resource type from ResourceNode.
 */
export type ResourceType = 'PERSON' | 'FACILITY' | 'ASSET';

/**
 * A resource assignment to a portfolio node.
 */
export interface ResourceAssignment {
  id: string;
  resource_id: string;
  resource_name: string;
  resource_code: string;
  resource_type: ResourceType;
  allocated_units: number;
  planned_hours: number;
  rate_snapshot: number;
  status: AssignmentStatus;
  /** Current location path for assets (ltree) */
  current_location_path?: string;
  /** Required skill description */
  required_skill?: string;
  /** Minimum proficiency level (1-5) */
  min_proficiency?: number;
}

/**
 * Proficiency level labels.
 */
const PROFICIENCY_LABELS: Record<number, string> = {
  1: 'Novice',
  2: 'Intermediate',
  3: 'Competent',
  4: 'Expert',
  5: 'Master',
};

/**
 * Assignment status badges.
 */
const STATUS_CONFIG: Record<AssignmentStatus, { color: string; bg: string; icon: React.ReactNode }> = {
  CONFIRMED: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-900/20',
    icon: <CheckCircle2 size={12} />,
  },
  CLAIMED: {
    color: 'text-amber-400',
    bg: 'bg-amber-900/20',
    icon: <AlertCircle size={12} />,
  },
  REQUISITIONED: {
    color: 'text-sky-400',
    bg: 'bg-sky-900/20',
    icon: <HelpCircle size={12} />,
  },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ResourceAssignmentsProps {
  /** The currently selected WBS row */
  selectedRow: WBSRow | null;
  /** List of resource assignments for the selected node */
  assignments: ResourceAssignment[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format allocation units as a percentage.
 */
function formatAllocation(units: number): string {
  return `${Math.round(units * 100)}%`;
}

/**
 * Format hours with one decimal place.
 */
function formatHours(hours: number): string {
  return `${hours.toFixed(1)}h`;
}

/**
 * Format currency rate.
 */
function formatRate(rate: number): string {
  return `£${rate.toFixed(2)}/hr`;
}

/**
 * Format location path from ltree.
 */
function formatLocationPath(path: string): string {
  // ltree path like "1.2.3" — we show it as-is with arrows
  return path.replace(/\./g, ' → ');
}

// ---------------------------------------------------------------------------
// Resource Row
// ---------------------------------------------------------------------------

const ResourceRow: React.FC<{
  assignment: ResourceAssignment;
}> = ({ assignment }) => {
  const statusConfig = STATUS_CONFIG[assignment.status];
  const isPerson = assignment.resource_type === 'PERSON';
  const isAsset = assignment.resource_type === 'ASSET';

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-border-ops-subtle hover:bg-bg-ops-overlay/50 transition-colors">
      {/* Icon */}
      <div className="flex-shrink-0 text-text-ops-muted">
        {isPerson ? (
          <User size={14} />
        ) : isAsset ? (
          <Wrench size={14} />
        ) : (
          <Briefcase size={14} />
        )}
      </div>

      {/* Name & Code */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-ops-primary truncate">
            {assignment.resource_name}
          </span>
          <span className="text-xs font-mono text-text-ops-muted">
            {assignment.resource_code}
          </span>
        </div>

        {/* Location path for assets */}
        {isAsset && assignment.current_location_path && (
          <div className="flex items-center gap-1 text-xs text-text-ops-muted mt-0.5">
            <MapPin size={10} />
            <span className="font-mono truncate">
              {formatLocationPath(assignment.current_location_path)}
            </span>
          </div>
        )}

        {/* Required skill */}
        {assignment.required_skill && (
          <div className="flex items-center gap-1 text-xs text-text-ops-muted mt-0.5">
            <Shield size={10} />
            <span>{assignment.required_skill}</span>
            {assignment.min_proficiency && (
              <span className="text-sky-400">
                (min: {PROFICIENCY_LABELS[assignment.min_proficiency] || assignment.min_proficiency})
              </span>
            )}
          </div>
        )}
      </div>

      {/* Allocation */}
      <div className="flex-shrink-0 text-right">
        <div className="text-xs font-mono text-text-ops-primary">
          {formatAllocation(assignment.allocated_units)}
        </div>
        <div className="text-xs text-text-ops-muted">
          {formatHours(assignment.planned_hours)}
        </div>
      </div>

      {/* Rate */}
      <div className="flex-shrink-0 text-right">
        <div className="text-xs font-mono text-text-ops-muted">
          {formatRate(assignment.rate_snapshot)}
        </div>
      </div>

      {/* Status badge */}
      <div
        className={clsx(
          'flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-xs',
          statusConfig.color,
          statusConfig.bg,
        )}
      >
        {statusConfig.icon}
        <span className="hidden sm:inline">{assignment.status}</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Section Header
// ---------------------------------------------------------------------------

const SectionHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  count: number;
}> = ({ icon, title, count }) => {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-ops-overlay/50 border-b border-border-ops-subtle">
      <span className="text-text-ops-muted">{icon}</span>
      <span className="text-xs font-semibold text-text-ops-primary">{title}</span>
      <span className="ml-auto text-xs font-mono text-text-ops-muted">{count}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const ResourceAssignments: React.FC<ResourceAssignmentsProps> = ({
  selectedRow,
  assignments,
}) => {
  // Group assignments by type
  const { people, facilities, assets } = useMemo(() => {
    const people: ResourceAssignment[] = [];
    const facilities: ResourceAssignment[] = [];
    const assets: ResourceAssignment[] = [];

    assignments.forEach((a) => {
      if (a.resource_type === 'PERSON') people.push(a);
      else if (a.resource_type === 'FACILITY') facilities.push(a);
      else assets.push(a);
    });

    return { people, facilities, assets };
  }, [assignments]);

  // Summary stats
  const totalAllocation = useMemo(
    () => assignments.reduce((sum, a) => sum + a.allocated_units, 0),
    [assignments],
  );
  const totalPlannedHours = useMemo(
    () => assignments.reduce((sum, a) => sum + a.planned_hours, 0),
    [assignments],
  );

  // No selection
  if (!selectedRow) {
    return (
      <div className="flex items-center justify-center h-full text-text-ops-muted">
        <div className="text-center">
          <Users size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Select a task to view its resource assignments</p>
        </div>
      </div>
    );
  }

  const isOverallocated = totalAllocation > 1.0;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-ops-subtle bg-bg-ops-surface">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-text-ops-muted" />
          <span className="text-sm font-semibold text-text-ops-primary">
            Resource Assignments
          </span>
          <span className="text-xs font-mono text-text-ops-muted">
            {selectedRow.code}
          </span>
        </div>

        {/* Summary stats */}
        <div className="flex items-center gap-3 text-xs">
          <span className="font-mono text-text-ops-muted">
            {formatHours(totalPlannedHours)} planned
          </span>
          <span
            className={clsx(
              'font-mono',
              isOverallocated ? 'text-red-400' : 'text-text-ops-muted',
            )}
          >
            {formatAllocation(totalAllocation)} allocated
            {isOverallocated && ' ⚠'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {assignments.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-text-ops-muted italic">
            No resources assigned to this task
          </div>
        ) : (
          <>
            {/* Personnel Section */}
            {people.length > 0 && (
              <>
                <SectionHeader
                  icon={<User size={12} />}
                  title="Personnel"
                  count={people.length}
                />
                {people.map((a) => (
                  <ResourceRow key={a.id} assignment={a} />
                ))}
              </>
            )}

            {/* Facilities Section */}
            {facilities.length > 0 && (
              <>
                <SectionHeader
                  icon={<Briefcase size={12} />}
                  title="Facilities"
                  count={facilities.length}
                />
                {facilities.map((a) => (
                  <ResourceRow key={a.id} assignment={a} />
                ))}
              </>
            )}

            {/* Equipment Section */}
            {assets.length > 0 && (
              <>
                <SectionHeader
                  icon={<Wrench size={12} />}
                  title="Equipment & Assets"
                  count={assets.length}
                />
                {assets.map((a) => (
                  <ResourceRow key={a.id} assignment={a} />
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* Footer legend */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-t border-border-ops-subtle bg-bg-ops-surface text-xs text-text-ops-muted">
        {Object.entries(STATUS_CONFIG).map(([status, config]) => (
          <span key={status} className={clsx('flex items-center gap-1', config.color)}>
            {config.icon}
            {status}
          </span>
        ))}
      </div>
    </div>
  );
};

export default ResourceAssignments;
