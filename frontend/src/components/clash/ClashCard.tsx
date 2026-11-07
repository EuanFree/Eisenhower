/**
 * Clash Card Component
 *
 * Displays a single schedule clash issue detected by the background audit daemon.
 * Each card shows:
 *
 * 1. **Severity Badge** — Color-coded indicator (CRITICAL = red, MAJOR = amber,
 *    ADVISORY = blue).
 * 2. **Category Icon** — Category-specific icon (users for overallocation,
 *    building for facility, etc.).
 * 3. **Conflict Title** — Short summary of the clash (e.g., "RF Chamber Bay 2
 *    double-booked by Project Falcon and Project Eagle on 14-Nov").
 * 4. **Conflict Window** — Date range during which the clash occurs.
 * 5. **Conflicting Entities** — Names of the nodes/resources involved.
 * 6. **Recommended Action** — Suggested resolution strategy.
 * 7. **Action Button** — "Run Leveling Proposal" for overallocation clashes.
 *
 * Data source: ClashIssue from GET /api/v1/schedule/clashes/
 */

import React from 'react';
import { clsx } from 'clsx';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  Users,
  Building2,
  TrendingDown,
  CalendarX,
  ShieldAlert,
  GitPullRequestClosed,
  MapPin,
  Wrench,
  Play,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { ClashIssue, ClashCategory, ClashSeverity } from '../../types/clash';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClashCardProps {
  /** The clash issue data */
  clash: ClashIssue;
  /** Called when the user clicks "Run Leveling Proposal" */
  onRunLeveling?: (projectNodeId: string) => void;
  /** Called when the user clicks to resolve the clash */
  onResolve?: (clashId: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Severity styling configuration */
const SEVERITY_STYLES: Record<ClashSeverity, {
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  leftBorder: string;
  icon: React.ComponentType<any>;
  label: string;
}> = {
  CRITICAL: {
    badgeBg: 'bg-red-500/20',
    badgeText: 'text-red-300',
    badgeBorder: 'border-red-500/40',
    leftBorder: 'border-l-red-500',
    icon: AlertCircle,
    label: 'CRITICAL',
  },
  MAJOR: {
    badgeBg: 'bg-amber-500/20',
    badgeText: 'text-amber-300',
    badgeBorder: 'border-amber-500/40',
    leftBorder: 'border-l-amber-500',
    icon: AlertTriangle,
    label: 'MAJOR',
  },
  ADVISORY: {
    badgeBg: 'bg-blue-500/20',
    badgeText: 'text-blue-300',
    badgeBorder: 'border-blue-500/40',
    leftBorder: 'border-l-blue-500',
    icon: Info,
    label: 'ADVISORY',
  },
};

/** Category icon mapping */
const CATEGORY_ICONS: Record<ClashCategory, React.ComponentType<any>> = {
  RESOURCE_OVERALLOCATION: Users,
  FACILITY_CONTRAVENTION: Building2,
  NEGATIVE_FLOAT_SLIP: TrendingDown,
  CALENDAR_EXCEPTION: CalendarX,
  CREDENTIAL_LAPSE: ShieldAlert,
  PREDECESSOR_UNMET: GitPullRequestClosed,
  SPATIAL_LOCATION_COLLISION: MapPin,
};

/** Category label mapping */
const CATEGORY_LABELS: Record<ClashCategory, string> = {
  RESOURCE_OVERALLOCATION: 'Resource Overallocation',
  FACILITY_CONTRAVENTION: 'Facility Contravention',
  NEGATIVE_FLOAT_SLIP: 'Negative Float Slip',
  CALENDAR_EXCEPTION: 'Calendar Exception',
  CREDENTIAL_LAPSE: 'Credential Lapse',
  PREDECESSOR_UNMET: 'Predecessor Unmet',
  SPATIAL_LOCATION_COLLISION: 'Spatial Collision',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format an ISO date string to a short readable format.
 */
const formatDate = (dateStr: string): string => {
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

/**
 * Format a relative time from now.
 */
const formatRelativeTime = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  } catch {
    return '';
  }
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const ClashCard: React.FC<ClashCardProps> = ({
  clash,
  onRunLeveling,
  onResolve,
}) => {
  const severityStyle = SEVERITY_STYLES[clash.severity];
  const SeverityIcon = severityStyle.icon;
  const CategoryIcon = CATEGORY_ICONS[clash.category];
  const categoryLabel = CATEGORY_LABELS[clash.category];

  // Determine if this clash can be resolved via leveling
  const canLevel = clash.category === 'RESOURCE_OVERALLOCATION';

  return (
    <div
      className={clsx(
        'group relative rounded-lg border border-l-4 p-4 transition-all',
        'bg-bg-ops-surface border-border-ops-subtle',
        severityStyle.leftBorder,
        'hover:border-border-ops-strong',
      )}
    >
      {/* Header: Severity + Category + Time */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* Severity Badge */}
          <span
            className={clsx(
              'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold font-mono uppercase tracking-wider',
              severityStyle.badgeBg,
              severityStyle.badgeText,
              severityStyle.badgeBorder,
            )}
          >
            <SeverityIcon size={12} />
            {severityStyle.label}
          </span>

          {/* Category Badge */}
          <span className="inline-flex items-center gap-1 rounded border border-border-ops-subtle bg-bg-ops-overlay px-2 py-0.5 text-xs text-text-ops-muted">
            <CategoryIcon size={12} />
            {categoryLabel}
          </span>
        </div>

        {/* Detected time */}
        <span className="text-xs text-text-ops-muted flex items-center gap-1">
          <Clock size={12} />
          {formatRelativeTime(clash.created_at)}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-text-ops-primary mb-2">
        {clash.title}
      </h3>

      {/* Description */}
      <p className="text-xs text-text-ops-muted mb-3 line-clamp-2">
        {clash.description}
      </p>

      {/* Conflict Window */}
      <div className="flex items-center gap-4 mb-3 text-xs text-text-ops-muted">
        <span className="inline-flex items-center gap-1">
          <CalendarX size={12} />
          Window: {formatDate(clash.conflict_window_start)} — {formatDate(clash.conflict_window_end)}
        </span>
      </div>

      {/* Conflicting Entities */}
      {(clash.conflicting_node_id || clash.conflicting_resource_id) && (
        <div className="mb-3 space-y-1">
          {clash.conflicting_node_id && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-text-ops-muted">Conflicting node:</span>
              <span className="font-mono text-text-ops-primary">
                {clash.conflicting_node_id.slice(0, 8)}...
              </span>
            </div>
          )}
          {clash.conflicting_resource_id && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-text-ops-muted">Conflicting resource:</span>
              <span className="font-mono text-text-ops-primary">
                {clash.conflicting_resource_id.slice(0, 8)}...
              </span>
            </div>
          )}
        </div>
      )}

      {/* Recommended Action */}
      {clash.recommended_action && (
        <div className="mb-3 rounded bg-bg-ops-overlay p-2 text-xs text-text-ops-muted border border-border-ops-subtle">
          <div className="flex items-center gap-1.5 mb-1">
            <Wrench size={12} />
            <span className="font-semibold text-text-ops-primary">Recommended Action</span>
          </div>
          {clash.recommended_action}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-2 border-t border-border-ops-subtle">
        {canLevel && onRunLeveling && (
          <button
            type="button"
            onClick={() => onRunLeveling(clash.portfolio_node_id)}
            className="inline-flex items-center gap-1.5 rounded bg-blue-600/20 border border-blue-500/40 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-600/30 transition-colors"
          >
            <Play size={12} />
            Run Leveling Proposal
          </button>
        )}

        {onResolve && (
          <button
            type="button"
            onClick={() => onResolve(clash.id)}
            className="inline-flex items-center gap-1.5 rounded bg-bg-ops-overlay border border-border-ops-subtle px-3 py-1.5 text-xs font-medium text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong transition-colors"
          >
            <ChevronRight size={12} />
            Mark Resolved
          </button>
        )}
      </div>
    </div>
  );
};

export default ClashCard;
