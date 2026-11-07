/**
 * Precedence Network Component
 *
 * Tab B of the drill-down workbench: displays predecessor and successor
 * dependency links for the selected task, with inline ability to add
 * and edit lag days.
 *
 * Shows two tables side by side:
 * - Predecessors: Tasks that must finish (or start) before this task.
 * - Successors: Tasks that depend on this task.
 *
 * Each link row shows the linked task code, dependency type (FS/SS/FF/SF),
 * and an editable lag day field. Negative lag values (leads) are allowed
 * and highlighted in amber.
 *
 * Corresponds to the backend DependencyLink model.
 */

import React, { useState, useMemo } from 'react';
import {
  ArrowRight,
  Link2,
  Plus,
  X,
  Save,
  AlertTriangle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { WBSRow } from '../../types/wbs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Dependency types from the backend DependencyLink model.
 */
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

/**
 * A dependency link between two nodes.
 */
export interface DependencyLink {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: DependencyType;
  lag_days: number;
  /** Resolved predecessor node data (for display) */
  predecessor?: WBSRow;
  /** Resolved successor node data (for display) */
  successor?: WBSRow;
}

/**
 * Label and description for each dependency type.
 */
const DEPENDENCY_LABELS: Record<DependencyType, { label: string; desc: string }> = {
  FS: { label: 'FS', desc: 'Finish-to-Start' },
  SS: { label: 'SS', desc: 'Start-to-Start' },
  FF: { label: 'FF', desc: 'Finish-to-Finish' },
  SF: { label: 'SF', desc: 'Start-to-Finish' },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PrecedenceNetworkProps {
  /** The currently selected WBS row */
  selectedRow: WBSRow | null;
  /** All rows in the schedule (for resolving linked node data) */
  allRows: WBSRow[];
  /** Predecessor links for the selected node */
  predecessors: DependencyLink[];
  /** Successor links for the selected node */
  successors: DependencyLink[];
  /** Callback when lag days are updated */
  onLagChange?: (linkId: string, newLag: number) => void;
  /** Callback when a new link is added */
  onAddLink?: (predecessorId: string, successorId: string, type: DependencyType) => void;
  /** Callback when a link is removed */
  onRemoveLink?: (linkId: string) => void;
}

// ---------------------------------------------------------------------------
// Inline Editable Lag Input
// ---------------------------------------------------------------------------

const LagInput: React.FC<{
  linkId: string;
  value: number;
  onChange: (linkId: string, newLag: number) => void;
}> = ({ linkId, value, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(String(value));

  const isLead = value < 0;

  const handleBlur = () => {
    setEditing(false);
    const parsed = parseInt(localValue, 10);
    if (!isNaN(parsed) && parsed !== value) {
      onChange(linkId, parsed);
    } else {
      setLocalValue(String(value));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setLocalValue(String(value));
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        type="number"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-16 px-1 py-0.5 text-xs font-mono bg-bg-ops-overlay border border-border-ops-strong rounded text-text-ops-primary focus:outline-none focus:ring-1 focus:ring-sky-500"
        autoFocus
        min={-999}
        max={999}
      />
    );
  }

  return (
    <button
      onClick={() => {
        setLocalValue(String(value));
        setEditing(true);
      }}
      className={clsx(
        'px-1.5 py-0.5 text-xs font-mono rounded transition-colors hover:bg-bg-ops-overlay',
        isLead
          ? 'text-amber-400 bg-amber-900/20'
          : 'text-text-ops-muted',
      )}
      title="Click to edit lag days"
    >
      {value > 0 ? `+${value}` : value}d
    </button>
  );
};

// ---------------------------------------------------------------------------
// Dependency Link Row
// ---------------------------------------------------------------------------

const LinkRow: React.FC<{
  link: DependencyLink;
  isPredecessor: boolean;
  onLagChange: (linkId: string, newLag: number) => void;
  onRemove: (linkId: string) => void;
}> = ({ link, isPredecessor, onLagChange, onRemove }) => {
  const linkedNode = isPredecessor ? link.predecessor : link.successor;
  const label = DEPENDENCY_LABELS[link.dependency_type];

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-border-ops-subtle hover:bg-bg-ops-overlay/50 transition-colors">
      {/* Arrow indicator */}
      <div className="flex-shrink-0 text-text-ops-muted">
        {isPredecessor ? (
          <ArrowRight size={14} />
        ) : (
          <ArrowRight size={14} style={{ transform: 'rotate(180deg)' }} />
        )}
      </div>

      {/* Linked node info */}
      {linkedNode ? (
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-text-ops-muted">
              {linkedNode.code}
            </span>
            <span className="text-sm text-text-ops-primary truncate">
              {linkedNode.is_masked ? '[RESTRICTED]' : linkedNode.name}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex-1 text-xs text-text-ops-muted italic">
          Node not found
        </div>
      )}

      {/* Dependency type badge */}
      <span
        className="flex-shrink-0 px-2 py-0.5 text-xs font-mono font-semibold rounded bg-bg-ops-overlay text-text-ops-primary"
        title={label.desc}
      >
        {label.label}
      </span>

      {/* Lag days */}
      <LagInput
        linkId={link.id}
        value={link.lag_days}
        onChange={onLagChange}
      />

      {/* Remove button */}
      <button
        onClick={() => onRemove(link.id)}
        className="flex-shrink-0 p-1 text-text-ops-muted hover:text-red-400 transition-colors"
        title="Remove dependency"
      >
        <X size={14} />
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Dependency Table Section
// ---------------------------------------------------------------------------

const DependencySection: React.FC<{
  title: string;
  links: DependencyLink[];
  isPredecessor: boolean;
  onLagChange: (linkId: string, newLag: number) => void;
  onRemove: (linkId: string) => void;
}> = ({ title, links, isPredecessor, onLagChange, onRemove }) => {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-ops-subtle bg-bg-ops-surface">
        <Link2 size={14} className="text-text-ops-muted" />
        <span className="text-sm font-semibold text-text-ops-primary">
          {title}
        </span>
        <span className="ml-auto text-xs font-mono text-text-ops-muted">
          {links.length}
        </span>
      </div>

      <div className="overflow-y-auto">
        {links.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-text-ops-muted italic">
            No {title.toLowerCase()}
          </div>
        ) : (
          links.map((link) => (
            <LinkRow
              key={link.id}
              link={link}
              isPredecessor={isPredecessor}
              onLagChange={onLagChange}
              onRemove={onRemove}
            />
          ))
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const PrecedenceNetwork: React.FC<PrecedenceNetworkProps> = ({
  selectedRow,
  allRows,
  predecessors,
  successors,
  onLagChange,
  onAddLink,
  onRemoveLink,
}) => {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newLinkType, setNewLinkType] = useState<DependencyType>('FS');

  // Resolve node data for each link
  const rowMap = useMemo(() => {
    const map = new Map<string, WBSRow>();
    allRows.forEach((row) => map.set(row.id, row));
    return map;
  }, [allRows]);

  const resolvedPredecessors = useMemo(
    () =>
      predecessors.map((link) => ({
        ...link,
        predecessor: rowMap.get(link.predecessor_id) || undefined,
      })),
    [predecessors, rowMap],
  );

  const resolvedSuccessors = useMemo(
    () =>
      successors.map((link) => ({
        ...link,
        successor: rowMap.get(link.successor_id) || undefined,
      })),
    [successors, rowMap],
  );

  // Available nodes for linking (siblings and nearby nodes)
  const availableNodes = useMemo(() => {
    if (!selectedRow) return [];
    return allRows.filter(
      (row) => row.id !== selectedRow.id && row.is_active,
    );
  }, [selectedRow, allRows]);

  const handleAddLink = () => {
    if (!selectedRow || availableNodes.length === 0) return;
    // Default: link first available node as predecessor
    const target = availableNodes[0];
    if (newLinkType === 'FS' || newLinkType === 'SS') {
      // Target is predecessor, selected is successor
      onAddLink?.(target.id, selectedRow.id, newLinkType);
    } else {
      // Target is successor, selected is predecessor
      onAddLink?.(selectedRow.id, target.id, newLinkType);
    }
    setShowAddDialog(false);
  };

  // No selection
  if (!selectedRow) {
    return (
      <div className="flex items-center justify-center h-full text-text-ops-muted">
        <div className="text-center">
          <Link2 size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Select a task to view its dependency network</p>
        </div>
      </div>
    );
  }

  const hasLeadLags = [...resolvedPredecessors, ...resolvedSuccessors].some(
    (l) => l.lag_days < 0,
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-ops-subtle bg-bg-ops-surface">
        <div className="flex items-center gap-2">
          <Link2 size={16} className="text-text-ops-muted" />
          <span className="text-sm font-semibold text-text-ops-primary">
            Precedence Network
          </span>
          <span className="text-xs font-mono text-text-ops-muted">
            {selectedRow.code}
          </span>
          {hasLeadLags && (
            <span className="flex items-center gap-1 text-xs text-amber-400" title="Negative lag (lead) detected">
              <AlertTriangle size={12} />
              Lead lags active
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          className="flex items-center gap-1 px-2 py-1 text-xs text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay rounded transition-colors"
          title="Add dependency link"
        >
          <Plus size={12} />
          Add Link
        </button>
      </div>

      {/* Add link dialog */}
      {showAddDialog && (
        <div className="px-4 py-3 border-b border-border-ops-subtle bg-bg-ops-overlay/50">
          <div className="flex items-center gap-3">
            <label className="text-xs text-text-ops-muted">Type:</label>
            <select
              value={newLinkType}
              onChange={(e) => setNewLinkType(e.target.value as DependencyType)}
              className="px-2 py-1 text-xs font-mono bg-bg-ops-surface border border-border-ops-subtle rounded text-text-ops-primary focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              {Object.entries(DEPENDENCY_LABELS).map(([key, val]) => (
                <option key={key} value={key}>
                  {val.label} - {val.desc}
                </option>
              ))}
            </select>
            <button
              onClick={handleAddLink}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-sky-600 text-white rounded hover:bg-sky-500 transition-colors"
            >
              <Save size={12} />
              Add
            </button>
            <button
              onClick={() => setShowAddDialog(false)}
              className="p-1 text-text-ops-muted hover:text-text-ops-primary transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Dependency tables */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 flex gap-0 overflow-hidden">
          <DependencySection
            title="Predecessors"
            links={resolvedPredecessors}
            isPredecessor
            onLagChange={onLagChange ?? (() => {})}
            onRemove={onRemoveLink ?? (() => {})}
          />
          <div className="w-px bg-border-ops-subtle flex-shrink-0" />
          <DependencySection
            title="Successors"
            links={resolvedSuccessors}
            isPredecessor={false}
            onLagChange={onLagChange ?? (() => {})}
            onRemove={onRemoveLink ?? (() => {})}
          />
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-t border-border-ops-subtle bg-bg-ops-surface text-xs text-text-ops-muted">
        <span>FS: Finish→Start</span>
        <span>SS: Start→Start</span>
        <span>FF: Finish→Finish</span>
        <span>SF: Start→Finish</span>
        <span className="text-amber-400">Negative = Lead</span>
      </div>
    </div>
  );
};

export default PrecedenceNetwork;
