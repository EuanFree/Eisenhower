/**
 * Dependency Link Context Menu
 *
 * Right-click menu for PDM (Precedence Diagramming Method) dependency links
 * in the Gantt chart dependency edges and the Precedence Network panel.
 *
 * Actions
 * --------
 *
 * - Edit PDM Type: Change the dependency type (FS, SS, FF, SF).
 * - Adjust Lag Days: Modify the lag/lead days between predecessor and successor.
 * - Highlight Driving Path: Highlight the critical driving path for this link.
 * - Delete Dependency: Remove the dependency link.
 */

import React, { useState, useCallback } from 'react';
import {
  Edit3,
  Calendar,
  GitBranch,
  Trash2,
  ChevronRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useContextMenu } from './ContextMenuProvider';
import KeyboardHintBadge from '../KeyboardHintBadge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * PDM dependency type.
 */
export type PDMType = 'FS' | 'SS' | 'FF' | 'SF';

/**
 * Payload data for the dependency link context menu.
 */
export interface DependencyLinkPayload {
  /** Dependency link UUID */
  linkId: string;
  /** Predecessor node UUID */
  predecessorId: string;
  /** Successor node UUID */
  successorId: string;
  /** Current PDM type */
  dependencyType: PDMType;
  /** Current lag days (negative = lead) */
  lagDays: number;
  /** Whether this link is on the critical path */
  isCritical: boolean;
}

/**
 * PDM type display configuration.
 */
const PDM_TYPES: { value: PDMType; label: string; description: string }[] = [
  { value: 'FS', label: 'FS', description: 'Finish-to-Start' },
  { value: 'SS', label: 'SS', description: 'Start-to-Start' },
  { value: 'FF', label: 'FF', description: 'Finish-to-Finish' },
  { value: 'SF', label: 'SF', description: 'Start-to-Finish' },
];

export interface DependencyLinkContextMenuProps {
  /** Payload data for the current target */
  payload: DependencyLinkPayload;
  /** Callback when an action is selected */
  onAction?: (action: string, data: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// PDM Type Flyout
// ---------------------------------------------------------------------------

interface PDMTypeFlyoutProps {
  currentType: PDMType;
  onSelect: (type: PDMType) => void;
}

const PDMTypeFlyout: React.FC<PDMTypeFlyoutProps> = ({ currentType, onSelect }) => {
  return (
    <div
      className="absolute left-full top-0 ml-1 z-50 min-w-[180px] py-1 bg-bg-ops-surface border border-border-ops-strong rounded-lg shadow-2xl"
      role="menu"
    >
      {PDM_TYPES.map((pdm) => (
        <button
          key={pdm.value}
          type="button"
          className={clsx(
            'w-full text-left px-3 py-1.5 text-sm flex items-center justify-between hover:bg-bg-ops-overlay transition-colors',
            pdm.value === currentType
              ? 'text-text-ops-primary font-semibold'
              : 'text-text-ops-muted',
          )}
          onClick={() => onSelect(pdm.value)}
          role="menuitem"
        >
          <div>
            <span className="font-mono text-xs">{pdm.label}</span>
            <span className="ml-2 text-xs">{pdm.description}</span>
          </div>
          {pdm.value === currentType && (
            <span className="text-xs text-rag-green">Current</span>
          )}
        </button>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Lag Days Flyout
// ---------------------------------------------------------------------------

interface LagDaysFlyoutProps {
  currentLag: number;
  onSelect: (lag: number) => void;
}

const LagDaysFlyout: React.FC<LagDaysFlyoutProps> = ({ currentLag, onSelect }) => {
  const [value, setValue] = useState(currentLag.toString());

  const handleApply = () => {
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      onSelect(num);
    }
  };

  return (
    <div
      className="absolute left-full top-0 ml-1 z-50 min-w-[160px] p-3 bg-bg-ops-surface border border-border-ops-strong rounded-lg shadow-2xl"
      role="menu"
    >
      <label className="block text-xs text-text-ops-muted mb-2">
        Lag Days (negative = lead)
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          className="flex-1 px-2 py-1 text-sm bg-bg-ops-base border border-border-ops-subtle rounded text-text-ops-primary font-mono focus:outline-none focus:border-blue-500"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleApply();
            if (e.key === 'Escape') return;
          }}
          autoFocus
        />
        <button
          type="button"
          className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors"
          onClick={handleApply}
        >
          Apply
        </button>
      </div>
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

const DependencyLinkContextMenu: React.FC<DependencyLinkContextMenuProps> = ({
  payload,
  onAction,
}) => {
  const { closeContextMenu } = useContextMenu();
  const [showPDMFlyout, setShowPDMFlyout] = useState(false);
  const [showLagFlyout, setShowLagFlyout] = useState(false);

  const handleAction = useCallback(
    (action: string, data: Record<string, unknown> = {}) => {
      onAction?.(action, { ...payload, ...data });
      closeContextMenu();
    },
    [onAction, payload, closeContextMenu],
  );

  const handlePDMSelect = useCallback(
    (type: PDMType) => {
      setShowPDMFlyout(false);
      handleAction('EDIT_PDM_TYPE', { dependencyType: type });
    },
    [handleAction],
  );

  const handleLagSelect = useCallback(
    (lag: number) => {
      setShowLagFlyout(false);
      handleAction('ADJUST_LAG', { lagDays: lag });
    },
    [handleAction],
  );

  const lagLabel =
    payload.lagDays === 0
      ? 'No Lag'
      : payload.lagDays > 0
      ? `+${payload.lagDays}d Lag`
      : `${payload.lagDays}d Lead`;

  return (
    <div
      className="min-w-[220px] py-1 bg-bg-ops-surface border border-border-ops-strong rounded-lg shadow-2xl"
      role="menu"
    >
      {/* Link info header */}
      <div className="px-3 py-2 text-xs text-text-ops-muted border-b border-border-ops-subtle">
        <div className="font-mono">{payload.dependencyType}</div>
        <div className="mt-0.5">
          {payload.predecessorId.slice(0, 8)} → {payload.successorId.slice(0, 8)}
        </div>
        {payload.isCritical && (
          <div className="mt-1 text-rag-red font-semibold">Critical Path</div>
        )}
      </div>

      <Separator />

      {/* Edit PDM Type */}
      <div
        className="relative"
        onMouseEnter={() => setShowPDMFlyout(true)}
        onMouseLeave={() => setShowPDMFlyout(false)}
      >
        <MenuItem
          icon={<Edit3 size={14} />}
          label={`PDM Type: ${payload.dependencyType}`}
          hasFlyout
          onClick={() => {}}
        >
          {showPDMFlyout && (
            <PDMTypeFlyout
              currentType={payload.dependencyType}
              onSelect={handlePDMSelect}
            />
          )}
        </MenuItem>
      </div>

      {/* Adjust Lag Days */}
      <div
        className="relative"
        onMouseEnter={() => setShowLagFlyout(true)}
        onMouseLeave={() => setShowLagFlyout(false)}
      >
        <MenuItem
          icon={<Calendar size={14} />}
          label={`Lag: ${lagLabel}`}
          hasFlyout
          onClick={() => {}}
        >
          {showLagFlyout && (
            <LagDaysFlyout
              currentLag={payload.lagDays}
              onSelect={handleLagSelect}
            />
          )}
        </MenuItem>
      </div>

      <Separator />

      {/* Highlight Driving Path */}
      <MenuItem
        icon={<GitBranch size={14} />}
        label="Highlight Driving Path"
        onClick={() => handleAction('HIGHLIGHT_DRIVING')}
      />

      <Separator />

      {/* Delete Dependency */}
      <MenuItem
        icon={<Trash2 size={14} />}
        label="Delete Dependency"
        danger
        onClick={() => handleAction('DELETE_DEPENDENCY')}
      />
    </div>
  );
};

export default DependencyLinkContextMenu;
