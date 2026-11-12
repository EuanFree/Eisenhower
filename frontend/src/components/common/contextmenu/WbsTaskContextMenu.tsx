/**
 * WBS Task Context Menu
 *
 * Right-click menu for WBS task and container nodes in the WBS table and
 * Gantt chart. Actions are evaluated against user ABAC clearance and
 * baseline freeze status.
 *
 * Actions
 * --------
 *
 * - Task Information... (Shift+F2): Opens the task detail panel.
 * - Indent (Alt+Shift+Right): Increases hierarchy indent level.
 * - Outdent (Alt+Shift+Left): Decreases hierarchy indent level.
 * - Link Selected (Ctrl+F2): Opens the dependency link dialog.
 * - Unlink (Ctrl+Shift+F2): Removes all dependency links.
 * - Toggle Milestone: Converts between task and milestone.
 * - Mark Progress (Flyout 0–100%): Quick progress increment.
 * - Flag Blocker... (Ctrl+B): Opens the blocker creation modal.
 * - Delete (Delete): Deletes the node (with confirmation).
 *
 * ABAC Clearance Evaluation
 * --------------------------
 *
 * If the node is locked under an active baseline freeze or the user lacks
 * CAM (Contracting Officer's Representative) privileges, destructive actions
 * are hidden or disabled.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Info,
  ArrowRight,
  ArrowLeft,
  Link,
  Link2Off,
  Flag,
  AlertTriangle,
  Trash2,
  ChevronRight,
  Lock,
  Percent,
  Plus,
  LogIn,
  LogOut,
  XCircle,
  Pencil,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useContextMenu } from './ContextMenuProvider';
import KeyboardHintBadge from '../KeyboardHintBadge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Payload data passed to the WBS task context menu.
 */
export interface WbsTaskPayload {
  /** Node UUID */
  nodeId: string;
  /** Node code (e.g., 'WP-101') */
  code?: string;
  /** Node name */
  name?: string;
  /** Current indent level */
  indentLevel?: number;
  /** Current progress percentage */
  percentComplete?: number;
  /** Whether the node is a milestone */
  isMilestone?: boolean;
  /** Whether the node is locked under baseline freeze */
  isBaselineLocked?: boolean;
  /** Whether the user has CAM privileges */
  hasCamPrivileges?: boolean;
  /** Security classification of the node */
  securityClassification?: string;
  /** Whether the node is masked (ABAC restricted) */
  isMasked?: boolean;
  /** Whether the node is locked by a check-out lease */
  isCheckoutLocked?: boolean;
  /** UPN of the user holding the check-out lease */
  leaseHolderUpn?: string | null;
}

/**
 * Action callback type.
 */
type ActionCallback = (payload: WbsTaskPayload) => void;

export interface WbsTaskContextMenuProps {
  /** Payload data for the current target */
  payload: WbsTaskPayload;
  /** Callback when an action is selected */
  onAction?: (action: string, payload: WbsTaskPayload) => void;
}

// ---------------------------------------------------------------------------
// Progress Flyout
// ---------------------------------------------------------------------------

const PROGRESS_STEPS = [0, 10, 25, 50, 75, 90, 100];

interface ProgressFlyoutProps {
  currentProgress: number;
  onSelect: (percent: number) => void;
}

const ProgressFlyout: React.FC<ProgressFlyoutProps> = ({
  currentProgress,
  onSelect,
}) => {
  return (
    <div
      className="absolute left-full top-0 ml-1 z-50 min-w-[140px] py-1 bg-bg-ops-surface border border-border-ops-strong rounded-lg shadow-2xl"
      role="menu"
    >
      {PROGRESS_STEPS.map((pct) => (
        <button
          key={pct}
          type="button"
          className={clsx(
            'w-full text-left px-3 py-1.5 text-sm flex items-center justify-between hover:bg-bg-ops-overlay transition-colors',
            pct === currentProgress ? 'text-text-ops-primary font-semibold' : 'text-text-ops-muted',
          )}
          onClick={() => onSelect(pct)}
          role="menuitem"
        >
          <span>{pct}%</span>
          {pct === currentProgress && (
            <span className="text-xs text-rag-green">Current</span>
          )}
        </button>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Menu Item Component
// ---------------------------------------------------------------------------

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  hasFlyout?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}

const MenuItem: React.FC<MenuItemProps> = ({
  icon,
  label,
  shortcut,
  disabled = false,
  danger = false,
  hasFlyout = false,
  onClick,
  children,
}) => {
  return (
    <div className="relative">
      <button
        type="button"
        className={clsx(
          'w-full text-left px-3 py-1.5 text-sm flex items-center gap-2.5 hover:bg-bg-ops-overlay transition-colors',
          disabled
            ? 'text-text-ops-muted/40 cursor-not-allowed'
            : danger
            ? 'text-rag-red hover:bg-red-950/30'
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
        {hasFlyout && <ChevronRight size={14} className="text-text-ops-muted" />}
      </button>
      {children}
    </div>
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

const WbsTaskContextMenu: React.FC<WbsTaskContextMenuProps> = ({
  payload,
  onAction,
}) => {
  const { closeContextMenu } = useContextMenu();
  const [showProgressFlyout, setShowProgressFlyout] = useState(false);

  const {
    isBaselineLocked = false,
    hasCamPrivileges = true,
    isMasked = false,
    isCheckoutLocked = false,
    leaseHolderUpn = null,
  } = payload;

  const canModify = !isBaselineLocked && !isCheckoutLocked && hasCamPrivileges && !isMasked;

  const handleAction = useCallback(
    (action: string) => {
      onAction?.(action, payload);
      closeContextMenu();
    },
    [onAction, payload, closeContextMenu],
  );

  const handleProgressSelect = useCallback(
    (percent: number) => {
      setShowProgressFlyout(false);
      handleAction(`PROGRESS_${percent}`);
    },
    [handleAction],
  );

  return (
    <div
      className="min-w-[220px] py-1 bg-bg-ops-surface border border-border-ops-strong rounded-lg shadow-2xl"
      role="menu"
    >
      {/* Task Information */}
      <MenuItem
        icon={<Info size={14} />}
        label="Task Information..."
        shortcut="Shift+F2"
        onClick={() => handleAction('TASK_INFO')}
      />

      <Separator />

      {/* Edit Task */}
      <MenuItem
        icon={<Pencil size={14} />}
        label="Edit Task..."
        shortcut="F2"
        disabled={!canModify}
        onClick={() => handleAction('EDIT_TASK')}
      />

      <Separator />

      {/* Add Child Work Item */}
      <MenuItem
        icon={<Plus size={14} />}
        label="Add Child Work Item"
        shortcut="Insert"
        disabled={!canModify}
        onClick={() => handleAction('ADD_CHILD')}
      />

      <Separator />

      {/* Indent / Outdent */}
      <MenuItem
        icon={<ArrowRight size={14} />}
        label="Indent"
        shortcut="Alt+Shift+→"
        disabled={!canModify || (payload.indentLevel ?? 0) >= 5}
        onClick={() => handleAction('INDENT')}
      />
      <MenuItem
        icon={<ArrowLeft size={14} />}
        label="Outdent"
        shortcut="Alt+Shift+←"
        disabled={!canModify || (payload.indentLevel ?? 0) <= 0}
        onClick={() => handleAction('OUTDENT')}
      />

      <Separator />

      {/* Link / Unlink */}
      <MenuItem
        icon={<Link size={14} />}
        label="Link Selected"
        shortcut="Ctrl+F2"
        disabled={!canModify}
        onClick={() => handleAction('LINK_SELECTED')}
      />
      <MenuItem
        icon={<Link2Off size={14} />}
        label="Unlink"
        shortcut="Ctrl+Shift+F2"
        disabled={!canModify}
        onClick={() => handleAction('UNLINK')}
      />

      <Separator />

      {/* Toggle Milestone */}
      <MenuItem
        icon={<Flag size={14} />}
        label={payload.isMilestone ? 'Convert to Task' : 'Toggle Milestone'}
        disabled={!canModify}
        onClick={() => handleAction('TOGGLE_MILESTONE')}
      />

      <Separator />

      {/* Mark Progress with flyout */}
      <div
        className="relative"
        onMouseEnter={() => canModify && setShowProgressFlyout(true)}
        onMouseLeave={() => setShowProgressFlyout(false)}
      >
        <MenuItem
          icon={<Percent size={14} />}
          label={`Mark Progress (${Math.round(payload.percentComplete ?? 0)}%)`}
          hasFlyout={canModify}
          disabled={!canModify}
          onClick={() => {}}
        >
          {showProgressFlyout && canModify && (
            <ProgressFlyout
              currentProgress={payload.percentComplete ?? 0}
              onSelect={handleProgressSelect}
            />
          )}
        </MenuItem>
      </div>

      <Separator />

      {/* Flag Blocker */}
      <MenuItem
        icon={<AlertTriangle size={14} />}
        label="Flag Blocker..."
        shortcut="Ctrl+B"
        disabled={!canModify}
        onClick={() => handleAction('FLAG_BLOCKER')}
      />

      <Separator />

      {/* Delete */}
      <MenuItem
        icon={<Trash2 size={14} />}
        label="Delete"
        shortcut="Del"
        danger
        disabled={!canModify}
        onClick={() => handleAction('DELETE')}
      />

      {/* Check-out actions */}
      {!isCheckoutLocked && hasCamPrivileges && (
        <>
          <Separator />
          <MenuItem
            icon={<LogIn size={14} />}
            label="Check Out Sub-Tree for Drafting"
            onClick={() => handleAction('CHECK_OUT')}
          />
        </>
      )}

      {isCheckoutLocked && leaseHolderUpn && (
        <>
          <Separator />
          <MenuItem
            icon={<LogOut size={14} />}
            label="Check In & Publish Changes"
            disabled={true}
            onClick={() => handleAction('CHECK_IN')}
          />
          <MenuItem
            icon={<XCircle size={14} />}
            label="Discard Changes & Release"
            disabled={true}
            danger
            onClick={() => handleAction('DISCARD_CHECKOUT')}
          />
        </>
      )}

      {/* Baseline lock indicator */}
      {isBaselineLocked && (
        <>
          <Separator />
          <div className="px-3 py-2 text-xs text-text-ops-muted flex items-center gap-2">
            <Lock size={12} />
            <span>Locked under baseline freeze</span>
          </div>
        </>
      )}

      {/* Check-out lock indicator */}
      {isCheckoutLocked && (
        <>
          <Separator />
          <div className="px-3 py-2 text-xs text-amber-500 flex items-center gap-2">
            <Lock size={12} />
            <span>Checked out by CAM {leaseHolderUpn}</span>
          </div>
        </>
      )}
    </div>
  );
};

export default WbsTaskContextMenu;
