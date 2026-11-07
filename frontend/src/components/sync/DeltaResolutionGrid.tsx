/**
 * DeltaResolutionGrid Component
 *
 * Three-way delta resolution grid for divergent Merkle sync branches.
 *
 * Features
 * --------
 * - Displays an interactive triage table for divergent work packages:
 *   Column 1: Local Site State (Version, Last Modified By, Finish Date)
 *   Column 2: Incoming Remote Site State (Version, Remote Author, Forecast Finish)
 *   Column 3: Base Common Ancestor
 * - Selection controls per row: 'Accept Remote', 'Preserve Local', or
 *   'Fork into Sandbox Scenario'.
 * - Bulk resolution actions for all pending items.
 * - Divergence type badges (Added, Removed, Modified).
 *
 * @example
 * ```tsx
 * <DeltaResolutionGrid
 *   divergentNodes={divergentNodes}
 *   divergentDependencies={divergentDeps}
 *   onResolutionChange={handleResolutionChange}
 * />
 * ```
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Check,
  X,
  GitFork,
  AlertTriangle,
  Plus,
  Minus,
  Edit3,
  ChevronDown,
  ChevronUp,
  GitMerge,
  ArrowLeftRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import type {
  DivergentNodeEntry,
  DivergentDependencyEntry,
} from '../../types/merkle';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DeltaResolutionGridProps {
  /** Divergent node entries for the resolution grid */
  divergentNodes: DivergentNodeEntry[];
  /** Divergent dependency entries */
  divergentDependencies: DivergentDependencyEntry[];
  /** Called when a resolution choice changes for a node */
  onNodeResolutionChange: (nodeId: string, resolution: DivergentNodeEntry['resolution']) => void;
  /** Called when a resolution choice changes for a dependency */
  onDependencyResolutionChange: (depId: string, resolution: DivergentDependencyEntry['resolution']) => void;
}

// ---------------------------------------------------------------------------
// Resolution Button Component
// ---------------------------------------------------------------------------

interface ResolutionButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  color: string;
}

const ResolutionButton: React.FC<ResolutionButtonProps> = ({
  active,
  onClick,
  icon,
  label,
  color,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={clsx(
      'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
      active
        ? `${color} text-white`
        : 'bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary',
    )}
    title={label}
  >
    {icon}
    <span className="hidden sm:inline">{label}</span>
  </button>
);

// ---------------------------------------------------------------------------
// Node Row Component
// ---------------------------------------------------------------------------

interface NodeRowProps {
  entry: DivergentNodeEntry;
  onResolutionChange: (nodeId: string, resolution: DivergentNodeEntry['resolution']) => void;
}

const NodeRow: React.FC<NodeRowProps> = ({ entry, onResolutionChange }) => {
  const divergenceIcon =
    entry.divergence_type === 'added' ? (
      <Plus className="w-4 h-4 text-green-500" />
    ) : entry.divergence_type === 'removed' ? (
      <Minus className="w-4 h-4 text-amber-500" />
    ) : (
      <Edit3 className="w-4 h-4 text-blue-500" />
    );

  const divergenceLabel =
    entry.divergence_type === 'added'
      ? 'Added'
      : entry.divergence_type === 'removed'
        ? 'Removed'
        : 'Modified';

  const formatDate = (dateStr: string | null) =>
    dateStr ? new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <tr className="border-b border-ops-subtle hover:bg-bg-ops-overlay/50">
      {/* Divergence type */}
      <td className="py-2 px-3">
        <div className="flex items-center gap-1.5">
          {divergenceIcon}
          <span className="text-xs text-text-ops-muted">{divergenceLabel}</span>
        </div>
      </td>

      {/* Node code & name */}
      <td className="py-2 px-3">
        <div className="flex flex-col">
          <span className="text-sm font-mono text-text-ops-primary">
            {entry.code}
          </span>
          <span className="text-xs text-text-ops-muted truncate max-w-[200px]" title={entry.name}>
            {entry.name}
          </span>
        </div>
      </td>

      {/* Local Site State */}
      <td className="py-2 px-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-mono text-text-ops-primary">
            v{entry.local_version}
          </span>
          <span className="text-xs text-text-ops-muted">
            {entry.local_last_modified_by}
          </span>
          <span className="text-xs font-mono text-text-ops-primary">
            {formatDate(entry.local_finish_date)}
          </span>
          <span className="text-xs text-text-ops-muted">
            {entry.local_percent_complete}%
          </span>
        </div>
      </td>

      {/* Remote Site State */}
      <td className="py-2 px-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-mono text-text-ops-primary">
            v{entry.remote_version}
          </span>
          <span className="text-xs text-text-ops-muted">
            {entry.remote_author}
          </span>
          <span className="text-xs font-mono text-text-ops-primary">
            {formatDate(entry.remote_finish_date)}
          </span>
          <span className="text-xs text-text-ops-muted">
            {entry.remote_percent_complete}%
          </span>
        </div>
      </td>

      {/* Base Common Ancestor */}
      <td className="py-2 px-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-mono text-text-ops-muted">
            v{entry.base_version}
          </span>
          <span className="text-xs font-mono text-text-ops-muted">
            {formatDate(entry.base_finish_date)}
          </span>
        </div>
      </td>

      {/* Resolution controls */}
      <td className="py-2 px-3">
        <div className="flex items-center gap-1">
          <ResolutionButton
            active={entry.resolution === 'accept_remote'}
            onClick={() => onResolutionChange(entry.node_id, 'accept_remote')}
            icon={<ArrowLeftRight className="w-3 h-3" />}
            label="Accept Remote"
            color="bg-blue-600"
          />
          <ResolutionButton
            active={entry.resolution === 'preserve_local'}
            onClick={() => onResolutionChange(entry.node_id, 'preserve_local')}
            icon={<Check className="w-3 h-3" />}
            label="Preserve Local"
            color="bg-green-600"
          />
          <ResolutionButton
            active={entry.resolution === 'fork_sandbox'}
            onClick={() => onResolutionChange(entry.node_id, 'fork_sandbox')}
            icon={<GitFork className="w-3 h-3" />}
            label="Fork Sandbox"
            color="bg-amber-600"
          />
        </div>
      </td>
    </tr>
  );
};

// ---------------------------------------------------------------------------
// Dependency Row Component
// ---------------------------------------------------------------------------

interface DependencyRowProps {
  entry: DivergentDependencyEntry;
  onResolutionChange: (depId: string, resolution: DivergentDependencyEntry['resolution']) => void;
}

const DependencyRow: React.FC<DependencyRowProps> = ({ entry, onResolutionChange }) => {
  const divergenceIcon =
    entry.divergence_type === 'added' ? (
      <Plus className="w-4 h-4 text-green-500" />
    ) : entry.divergence_type === 'removed' ? (
      <Minus className="w-4 h-4 text-amber-500" />
    ) : (
      <Edit3 className="w-4 h-4 text-blue-500" />
    );

  const divergenceLabel =
    entry.divergence_type === 'added'
      ? 'Added'
      : entry.divergence_type === 'removed'
        ? 'Removed'
        : 'Modified';

  return (
    <tr className="border-b border-ops-subtle hover:bg-bg-ops-overlay/50">
      {/* Divergence type */}
      <td className="py-2 px-3">
        <div className="flex items-center gap-1.5">
          {divergenceIcon}
          <span className="text-xs text-text-ops-muted">{divergenceLabel}</span>
        </div>
      </td>

      {/* Dependency info */}
      <td className="py-2 px-3">
        <div className="flex flex-col">
          <span className="text-xs font-mono text-text-ops-primary">
            {entry.dependency_type}
          </span>
          <span className="text-xs text-text-ops-muted">
            Lag: {entry.lag_days}d
          </span>
        </div>
      </td>

      {/* Predecessor */}
      <td className="py-2 px-3">
        <span className="text-xs font-mono text-text-ops-muted">
          {entry.predecessor_id?.slice(0, 8)}
        </span>
      </td>

      {/* Successor */}
      <td className="py-2 px-3">
        <span className="text-xs font-mono text-text-ops-muted">
          {entry.successor_id?.slice(0, 8)}
        </span>
      </td>

      {/* Empty base column */}
      <td className="py-2 px-3" />

      {/* Resolution controls */}
      <td className="py-2 px-3">
        <div className="flex items-center gap-1">
          <ResolutionButton
            active={entry.resolution === 'accept_remote'}
            onClick={() => onResolutionChange(entry.dependency_id, 'accept_remote')}
            icon={<ArrowLeftRight className="w-3 h-3" />}
            label="Accept Remote"
            color="bg-blue-600"
          />
          <ResolutionButton
            active={entry.resolution === 'preserve_local'}
            onClick={() => onResolutionChange(entry.dependency_id, 'preserve_local')}
            icon={<Check className="w-3 h-3" />}
            label="Preserve Local"
            color="bg-green-600"
          />
        </div>
      </td>
    </tr>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const DeltaResolutionGrid: React.FC<DeltaResolutionGridProps> = ({
  divergentNodes,
  divergentDependencies,
  onNodeResolutionChange,
  onDependencyResolutionChange,
}) => {
  const [showDependencies, setShowDependencies] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'added' | 'removed' | 'modified'>('all');

  // Filter nodes by divergence type
  const filteredNodes = useMemo(() => {
    if (filterType === 'all') return divergentNodes;
    return divergentNodes.filter((n) => n.divergence_type === filterType);
  }, [divergentNodes, filterType]);

  // Count pending resolutions
  const pendingCount = useMemo(() => {
    return (
      divergentNodes.filter((n) => n.resolution === 'pending').length +
      divergentDependencies.filter((d) => d.resolution === 'pending').length
    );
  }, [divergentNodes, divergentDependencies]);

  // Bulk resolution handlers
  const setAllToRemote = useCallback(() => {
    divergentNodes.forEach((n) => {
      if (n.resolution === 'pending') {
        onNodeResolutionChange(n.node_id, 'accept_remote');
      }
    });
  }, [divergentNodes, onNodeResolutionChange]);

  const setAllToLocal = useCallback(() => {
    divergentNodes.forEach((n) => {
      if (n.resolution === 'pending') {
        onNodeResolutionChange(n.node_id, 'preserve_local');
      }
    });
  }, [divergentNodes, onNodeResolutionChange]);

  const setAllToFork = useCallback(() => {
    divergentNodes.forEach((n) => {
      if (n.resolution === 'pending') {
        onNodeResolutionChange(n.node_id, 'fork_sandbox');
      }
    });
  }, [divergentNodes, onNodeResolutionChange]);

  const totalCount = divergentNodes.length + divergentDependencies.length;

  if (totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-ops-muted">
        <GitMerge className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-sm">No divergent entries to resolve.</p>
        <p className="text-xs mt-1">The manifests are fully synchronized.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-ops-subtle bg-bg-ops-surface">
        <div>
          <h3 className="text-sm font-semibold text-text-ops-primary">
            Three-Way Delta Resolution
          </h3>
          <p className="text-xs text-text-ops-muted mt-0.5">
            {totalCount} divergent entit
            {totalCount !== 1 ? 'ies' : 'y'} · {pendingCount} pending resolution
          </p>
        </div>

        {/* Bulk actions */}
        {pendingCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-ops-muted">Bulk:</span>
            <button
              type="button"
              onClick={setAllToRemote}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 transition-colors"
            >
              <ArrowLeftRight className="w-3 h-3" />
              All Remote
            </button>
            <button
              type="button"
              onClick={setAllToLocal}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-600/20 text-green-400 hover:bg-green-600/40 transition-colors"
            >
              <Check className="w-3 h-3" />
              All Local
            </button>
            <button
              type="button"
              onClick={setAllToFork}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-amber-600/20 text-amber-400 hover:bg-amber-600/40 transition-colors"
            >
              <GitFork className="w-3 h-3" />
              All Fork
            </button>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-ops-subtle bg-bg-ops-overlay">
        <span className="text-xs text-text-ops-muted">Filter:</span>
        {(['all', 'added', 'removed', 'modified'] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setFilterType(type)}
            className={clsx(
              'px-2 py-0.5 rounded text-xs font-medium transition-colors',
              filterType === type
                ? 'bg-bg-ops-surface text-text-ops-primary'
                : 'text-text-ops-muted hover:text-text-ops-primary',
            )}
          >
            {type === 'all'
              ? 'All'
              : type === 'added'
                ? '+ Added'
                : type === 'removed'
                  ? '- Removed'
                  : '~ Modified'}
          </button>
        ))}

        {/* Dependencies toggle */}
        {divergentDependencies.length > 0 && (
          <button
            type="button"
            onClick={() => setShowDependencies((prev) => !prev)}
            className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-xs text-text-ops-muted hover:text-text-ops-primary transition-colors"
          >
            {showDependencies ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
            Dependencies ({divergentDependencies.length})
          </button>
        )}
      </div>

      {/* Node table */}
      {filteredNodes.length > 0 && (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-bg-ops-surface z-10">
              <tr className="border-b border-ops-subtle text-xs text-text-ops-muted">
                <th className="py-2 px-3 font-medium">Type</th>
                <th className="py-2 px-3 font-medium">Node</th>
                <th className="py-2 px-3 font-medium">Local Site</th>
                <th className="py-2 px-3 font-medium">Remote Site</th>
                <th className="py-2 px-3 font-medium">Base Ancestor</th>
                <th className="py-2 px-3 font-medium">Resolution</th>
              </tr>
            </thead>
            <tbody>
              {filteredNodes.map((entry) => (
                <NodeRow
                  key={entry.node_id}
                  entry={entry}
                  onResolutionChange={onNodeResolutionChange}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dependency table */}
      {showDependencies && divergentDependencies.length > 0 && (
        <div className="border-t border-ops-subtle">
          <div className="px-4 py-2 bg-bg-ops-overlay text-xs text-text-ops-muted font-medium">
            Divergent Dependencies
          </div>
          <table className="w-full text-left">
            <thead className="bg-bg-ops-surface">
              <tr className="border-b border-ops-subtle text-xs text-text-ops-muted">
                <th className="py-2 px-3 font-medium">Type</th>
                <th className="py-2 px-3 font-medium">Link</th>
                <th className="py-2 px-3 font-medium">Predecessor</th>
                <th className="py-2 px-3 font-medium">Successor</th>
                <th className="py-2 px-3 font-medium" />
                <th className="py-2 px-3 font-medium">Resolution</th>
              </tr>
            </thead>
            <tbody>
              {divergentDependencies.map((entry) => (
                <DependencyRow
                  key={entry.dependency_id}
                  entry={entry}
                  onResolutionChange={onDependencyResolutionChange}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-ops-subtle bg-bg-ops-surface text-xs text-text-ops-muted">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Check className="w-3 h-3 text-green-500" />
            Preserve Local
          </span>
          <span className="flex items-center gap-1">
            <ArrowLeftRight className="w-3 h-3 text-blue-500" />
            Accept Remote
          </span>
          <span className="flex items-center gap-1">
            <GitFork className="w-3 h-3 text-amber-500" />
            Fork Sandbox
          </span>
        </div>
        {pendingCount > 0 && (
          <span className="flex items-center gap-1 text-amber-400">
            <AlertTriangle className="w-3 h-3" />
            {pendingCount} item{pendingCount !== 1 ? 's' : ''} pending resolution
          </span>
        )}
      </div>
    </div>
  );
};

export default DeltaResolutionGrid;
