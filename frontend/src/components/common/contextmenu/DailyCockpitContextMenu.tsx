/**
 * Daily Cockpit Context Menu
 *
 * Right-click menu for task cards in the Daily Cockpit Focus Queue and
 * Claimable Queue. Provides quick inline actions for individual contributors.
 *
 * Actions
 * --------
 *
 * - +5% Progress: Increment physical progress by 5 percentage points.
 * - +10% Progress: Increment physical progress by 10 percentage points.
 * - Quick Log Hours (Ctrl+T): Open the inline hours logger.
 * - Flag Blocker: Open the blocker creation modal.
 * - Claim Task: Claim a generic placeholder task (claimable queue only).
 */

import React, { useCallback } from 'react';
import {
  Plus,
  Clock,
  AlertTriangle,
  CheckCircle2,
  UserPlus,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useContextMenu } from './ContextMenuProvider';
import KeyboardHintBadge from '../KeyboardHintBadge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Payload data for the Daily Cockpit context menu.
 */
export interface DailyCockpitPayload {
  /** Task node UUID */
  nodeId: string;
  /** Task code */
  code?: string;
  /** Current progress percentage */
  percentComplete?: number;
  /** Whether this task is from the claimable queue */
  isClaimable?: boolean;
  /** Whether the task is on the critical path */
  isCritical?: boolean;
  /** Whether the task has active blockers */
  hasBlockers?: boolean;
}

export interface DailyCockpitContextMenuProps {
  /** Payload data for the current target */
  payload: DailyCockpitPayload;
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
        <KeyboardHintBadge shortcut={shortcut} />
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

const DailyCockpitContextMenu: React.FC<DailyCockpitContextMenuProps> = ({
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

  const currentProgress = payload.percentComplete ?? 0;
  const canProgress5 = currentProgress < 95;
  const canProgress10 = currentProgress < 90;
  const canComplete = currentProgress < 100;

  return (
    <div
      className="min-w-[200px] py-1 bg-bg-ops-surface border border-border-ops-strong rounded-lg shadow-2xl"
      role="menu"
    >
      {/* Task info header */}
      <div className="px-3 py-2 text-xs text-text-ops-muted border-b border-border-ops-subtle">
        <div className="font-mono text-text-ops-primary">
          {payload.code || payload.nodeId.slice(0, 8)}
        </div>
        <div className="mt-0.5">
          Progress: <span className="text-text-ops-primary">{Math.round(currentProgress)}%</span>
        </div>
        {payload.isCritical && (
          <div className="mt-0.5 text-rag-red font-semibold">Critical Path</div>
        )}
      </div>

      <Separator />

      {/* Progress increments */}
      <MenuItem
        icon={<Plus size={14} />}
        label={`+5% Progress`}
        disabled={!canProgress5}
        onClick={() => handleAction('PROGRESS_5')}
      />
      <MenuItem
        icon={<Plus size={14} />}
        label={`+10% Progress`}
        disabled={!canProgress10}
        onClick={() => handleAction('PROGRESS_10')}
      />
      <MenuItem
        icon={<CheckCircle2 size={14} />}
        label={`Mark Complete`}
        disabled={!canComplete}
        onClick={() => handleAction('PROGRESS_COMPLETE')}
      />

      <Separator />

      {/* Quick Log Hours */}
      <MenuItem
        icon={<Clock size={14} />}
        label="Quick Log Hours"
        shortcut="Ctrl+T"
        onClick={() => handleAction('LOG_HOURS')}
      />

      <Separator />

      {/* Flag Blocker */}
      <MenuItem
        icon={<AlertTriangle size={14} />}
        label="Flag Blocker"
        onClick={() => handleAction('FLAG_BLOCKER')}
      />

      {/* Claim Task (claimable queue only) */}
      {payload.isClaimable && (
        <>
          <Separator />
          <MenuItem
            icon={<UserPlus size={14} />}
            label="Claim Task"
            onClick={() => handleAction('CLAIM_TASK')}
          />
        </>
      )}
    </div>
  );
};

export default DailyCockpitContextMenu;
