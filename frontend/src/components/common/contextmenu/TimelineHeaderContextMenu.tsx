/**
 * Timeline Header Context Menu
 *
 * Right-click menu for the Gantt chart timeline header (date axis).
 * Controls zoom level, timescale settings, and status date navigation.
 *
 * Actions
 * --------
 *
 * - Zoom In: Increase timeline granularity.
 * - Zoom Out: Decrease timeline granularity.
 * - Zoom to Fit: Auto-fit the timeline to show all tasks.
 * - Jump to Status Date: Scroll to the current project status date.
 * - Timescale Settings: Open the timescale configuration dialog.
 */

import React, { useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  CalendarDays,
  Settings2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useContextMenu } from './ContextMenuProvider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Payload data for the timeline header context menu.
 */
export interface TimelineHeaderPayload {
  /** Current zoom level */
  zoomLevel: 'DAYS' | 'WEEKS' | 'MONTHS';
  /** Current status date (ISO string) */
  statusDate?: string;
  /** Project start date */
  projectStart?: string;
  /** Project end date */
  projectEnd?: string;
}

export interface TimelineHeaderContextMenuProps {
  /** Payload data for the current target */
  payload: TimelineHeaderPayload;
  /** Callback when an action is selected */
  onAction?: (action: string, data: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// Menu Item Component
// ---------------------------------------------------------------------------

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick?: () => void;
}

const MenuItem: React.FC<MenuItemProps> = ({
  icon,
  label,
  shortcut,
  disabled = false,
  onClick,
}) => {
  return (
    <button
      type="button"
      className={clsx(
        'w-full text-left px-3 py-1.5 text-sm flex items-center gap-2.5 hover:bg-bg-ops-overlay transition-colors',
        disabled
          ? 'text-text-ops-muted/40 cursor-not-allowed'
          : 'text-text-ops-primary',
      )}
      disabled={disabled}
      onClick={onClick}
      role="menuitem"
    >
      <span className="flex-shrink-0 w-4">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {shortcut && (
        <span className="text-xs text-text-ops-muted font-mono ml-auto pl-2">
          {shortcut}
        </span>
      )}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------

const Separator: React.FC = () => (
  <div className="my-1 border-t border-border-ops-subtle" />
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TimelineHeaderContextMenu: React.FC<TimelineHeaderContextMenuProps> = ({
  payload,
  onAction,
}) => {
  const { closeContextMenu } = useContextMenu();

  const handleAction = useCallback(
    (action: string, data: Record<string, unknown> = {}) => {
      onAction?.(action, { ...payload, ...data });
      closeContextMenu();
    },
    [onAction, payload, closeContextMenu],
  );

  const zoomLabel =
    payload.zoomLevel === 'DAYS'
      ? 'Day Mode'
      : payload.zoomLevel === 'WEEKS'
      ? 'Week Mode'
      : 'Month Mode';

  return (
    <div
      className="min-w-[200px] py-1 bg-bg-ops-surface border border-border-ops-strong rounded-lg shadow-2xl"
      role="menu"
    >
      {/* Current zoom indicator */}
      <div className="px-3 py-2 text-xs text-text-ops-muted border-b border-border-ops-subtle">
        <div>Timescale: <span className="text-text-ops-primary font-semibold">{zoomLabel}</span></div>
        {payload.statusDate && (
          <div className="mt-0.5">
            Status: <span className="text-text-ops-primary">{payload.statusDate}</span>
          </div>
        )}
      </div>

      <Separator />

      {/* Zoom In */}
      <MenuItem
        icon={<ZoomIn size={14} />}
        label="Zoom In"
        shortcut="+"
        disabled={payload.zoomLevel === 'DAYS'}
        onClick={() => handleAction('ZOOM_IN')}
      />

      {/* Zoom Out */}
      <MenuItem
        icon={<ZoomOut size={14} />}
        label="Zoom Out"
        shortcut="-"
        disabled={payload.zoomLevel === 'MONTHS'}
        onClick={() => handleAction('ZOOM_OUT')}
      />

      <Separator />

      {/* Zoom to Fit */}
      <MenuItem
        icon={<Maximize2 size={14} />}
        label="Zoom to Fit"
        onClick={() => handleAction('ZOOM_FIT')}
      />

      <Separator />

      {/* Jump to Status Date */}
      <MenuItem
        icon={<CalendarDays size={14} />}
        label="Jump to Status Date"
        disabled={!payload.statusDate}
        onClick={() => handleAction('JUMP_STATUS_DATE')}
      />

      <Separator />

      {/* Timescale Settings */}
      <MenuItem
        icon={<Settings2 size={14} />}
        label="Timescale Settings..."
        onClick={() => handleAction('TIMESCALE_SETTINGS')}
      />
    </div>
  );
};

export default TimelineHeaderContextMenu;
