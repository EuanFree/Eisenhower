/**
 * Clash Filter Bar Component
 *
 * Filterable pill bar at the top of the Schedule Health triage board.
 * Allows the user to narrow the displayed clash issues by:
 *
 * 1. **Severity** — CRITICAL, MAJOR, or ADVISORY.
 * 2. **Category** — RESOURCE_OVERALLOCATION, FACILITY_CONTRAVENTION,
 *    CREDENTIAL_LAPSE, SPATIAL_LOCATION_COLLISION, etc.
 *
 * Each filter group renders as a row of selectable pill buttons.
 * Clicking a pill toggles it active; clicking again clears the filter.
 * An "All" pill resets the group to show every value.
 *
 * Data source: Local state driven by the parent ScheduleHealthView.
 */

import React from 'react';
import { clsx } from 'clsx';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Users,
  Building2,
  TrendingDown,
  CalendarX,
  ShieldAlert,
  GitPullRequestClosed,
  MapPin,
} from 'lucide-react';
import { ClashCategory, ClashSeverity, ClashFilters } from '../../types/clash';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClashFilterBarProps {
  /** Current filter state */
  filters: ClashFilters;
  /** Callback when filters change */
  onFilterChange: (filters: ClashFilters) => void;
  /** Clash counts by severity for badge display */
  bySeverity?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Severity pill configuration */
const SEVERITY_PILLS: {
  value: ClashSeverity;
  label: string;
  color: string;
  bgActive: string;
  icon: React.ComponentType<any>;
}[] = [
  {
    value: 'CRITICAL',
    label: 'Critical',
    color: 'text-red-400',
    bgActive: 'bg-red-500/20 border-red-500/60 text-red-300',
    icon: AlertCircle,
  },
  {
    value: 'MAJOR',
    label: 'Major',
    color: 'text-amber-400',
    bgActive: 'bg-amber-500/20 border-amber-500/60 text-amber-300',
    icon: AlertTriangle,
  },
  {
    value: 'ADVISORY',
    label: 'Advisory',
    color: 'text-blue-400',
    bgActive: 'bg-blue-500/20 border-blue-500/60 text-blue-300',
    icon: Info,
  },
];

/** Category pill configuration */
const CATEGORY_PILLS: {
  value: ClashCategory;
  label: string;
  icon: React.ComponentType<any>;
}[] = [
  { value: 'RESOURCE_OVERALLOCATION', label: 'Overallocation', icon: Users },
  { value: 'FACILITY_CONTRAVENTION', label: 'Facility', icon: Building2 },
  { value: 'NEGATIVE_FLOAT_SLIP', label: 'Float Slip', icon: TrendingDown },
  { value: 'CALENDAR_EXCEPTION', label: 'Calendar', icon: CalendarX },
  { value: 'CREDENTIAL_LAPSE', label: 'Credentials', icon: ShieldAlert },
  { value: 'PREDECESSOR_UNMET', label: 'Predecessor', icon: GitPullRequestClosed },
  { value: 'SPATIAL_LOCATION_COLLISION', label: 'Spatial', icon: MapPin },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Single filter pill button.
 */
const FilterPill: React.FC<{
  label: string;
  active: boolean;
  activeStyle: string;
  icon: React.ComponentType<any>;
  count?: number;
  onClick: () => void;
}> = ({ label, active, activeStyle, icon: Icon, count, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all',
        'border-border-ops-subtle bg-bg-ops-overlay text-text-ops-muted',
        active && activeStyle,
        !active && 'hover:border-text-ops-muted hover:text-text-ops-primary',
      )}
    >
      <Icon size={14} />
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={clsx(
            'ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-mono font-bold',
            active ? 'bg-white/20 text-white' : 'bg-bg-ops-base text-text-ops-muted',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const ClashFilterBar: React.FC<ClashFilterBarProps> = ({
  filters,
  onFilterChange,
  bySeverity = {},
}) => {
  const handleSeverityChange = (severity: ClashSeverity) => {
    onFilterChange({
      ...filters,
      severity: filters.severity === severity ? null : severity,
    });
  };

  const handleCategoryChange = (category: ClashCategory) => {
    onFilterChange({
      ...filters,
      category: filters.category === category ? null : category,
    });
  };

  const hasActiveFilters = filters.severity !== null || filters.category !== null;

  return (
    <div className="space-y-3 mb-6">
      {/* Severity Filter Row */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs uppercase tracking-wider text-text-ops-muted font-semibold">
            Severity
          </span>
          {filters.severity && (
            <button
              type="button"
              onClick={() => onFilterChange({ ...filters, severity: null })}
              className="text-xs text-text-ops-muted hover:text-text-ops-primary underline"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterPill
            label="All"
            active={filters.severity === null}
            activeStyle="bg-bg-ops-base border-text-ops-muted text-text-ops-primary"
            icon={Info}
            count={Object.values(bySeverity).reduce((a, b) => a + b, 0)}
            onClick={() => onFilterChange({ ...filters, severity: null })}
          />
          {SEVERITY_PILLS.map((pill) => (
            <FilterPill
              key={pill.value}
              label={pill.label}
              active={filters.severity === pill.value}
              activeStyle={pill.bgActive}
              icon={pill.icon}
              count={bySeverity[pill.value] || 0}
              onClick={() => handleSeverityChange(pill.value)}
            />
          ))}
        </div>
      </div>

      {/* Category Filter Row */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs uppercase tracking-wider text-text-ops-muted font-semibold">
            Category
          </span>
          {filters.category && (
            <button
              type="button"
              onClick={() => onFilterChange({ ...filters, category: null })}
              className="text-xs text-text-ops-muted hover:text-text-ops-primary underline"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterPill
            label="All"
            active={filters.category === null}
            activeStyle="bg-bg-ops-base border-text-ops-muted text-text-ops-primary"
            icon={Info}
            onClick={() => onFilterChange({ ...filters, category: null })}
          />
          {CATEGORY_PILLS.map((pill) => (
            <FilterPill
              key={pill.value}
              label={pill.label}
              active={filters.category === pill.value}
              activeStyle="bg-bg-ops-surface border-text-ops-muted text-text-ops-primary"
              icon={pill.icon}
              onClick={() => handleCategoryChange(pill.value)}
            />
          ))}
        </div>
      </div>

      {/* Active filter summary */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 text-xs text-text-ops-muted">
          <span>Active filters:</span>
          {filters.severity && (
            <span className="inline-flex items-center gap-1 rounded bg-bg-ops-overlay px-2 py-0.5">
              Severity: {filters.severity}
              <button
                type="button"
                onClick={() => onFilterChange({ ...filters, severity: null })}
                className="ml-1 hover:text-text-ops-primary"
              >
                &times;
              </button>
            </span>
          )}
          {filters.category && (
            <span className="inline-flex items-center gap-1 rounded bg-bg-ops-overlay px-2 py-0.5">
              Category: {filters.category}
              <button
                type="button"
                onClick={() => onFilterChange({ ...filters, category: null })}
                className="ml-1 hover:text-text-ops-primary"
              >
                &times;
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={() => onFilterChange({ severity: null, category: null })}
            className="ml-2 text-amber-400 hover:text-amber-300 underline"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
};

export default ClashFilterBar;
