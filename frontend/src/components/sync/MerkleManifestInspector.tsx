/**
 * MerkleManifestInspector Component
 *
 * Visualizes the hierarchical Merkle digest tree of the local database
 * vs. an imported .merklepack bundle.
 *
 * Features
 * --------
 * - Collapses synchronized sub-trees with green checkmark badges when
 *   root hashes match.
 * - Automatically expands divergent sub-trees, highlighting the specific
 *   Work Packages or dependency links that differ between sites.
 * - Recursive tree rendering with expand/collapse controls.
 * - Hash digest display for each branch and leaf node.
 *
 * @example
 * ```tsx
 * <MerkleManifestInspector
 *   localManifest={localManifest}
 *   remoteManifest={remoteManifest}
 *   divergentPaths={comparison?.divergent_paths ?? []}
 * />
 * ```
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  GitBranch,
  FileText,
  Link,
  Users,
  Hash,
} from 'lucide-react';
import { clsx } from 'clsx';
import type {
  MerkleManifestResponse,
  MerkleTreeNode,
  ComparisonSummary,
} from '../../types/merkle';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MerkleManifestInspectorProps {
  /** Local Merkle manifest */
  localManifest: MerkleManifestResponse | null;
  /** Remote Merkle manifest (imported) */
  remoteManifest: MerkleManifestResponse | null;
  /** Set of divergent ltree paths from the comparison */
  divergentPaths: string[];
  /** Comparison summary for the header */
  comparisonSummary?: ComparisonSummary;
}

// ---------------------------------------------------------------------------
// Tree Node Component
// ---------------------------------------------------------------------------

interface MerkleTreeBranchProps {
  /** Local tree node */
  localNode: MerkleTreeNode;
  /** Remote tree node (may be undefined if branch doesn't exist remotely) */
  remoteNode?: MerkleTreeNode;
  /** Set of divergent paths */
  divergentPaths: Set<string>;
  /** Current expand/collapse state */
  expandedPaths: Set<string>;
  /** Toggle expand/collapse */
  onToggle: (path: string) => void;
  /** Tree depth for indentation */
  depth?: number;
}

/**
 * Recursive component that renders a single Merkle tree branch and its children.
 */
const MerkleTreeBranch: React.FC<MerkleTreeBranchProps> = ({
  localNode,
  remoteNode,
  divergentPaths,
  expandedPaths,
  onToggle,
  depth = 0,
}) => {
  const isDivergent = divergentPaths.has(localNode.path);
  const isSynced = localNode.hash_digest === remoteNode?.hash_digest;
  const isMissing = !remoteNode;
  const isExpanded = expandedPaths.has(localNode.path);

  // Check if any child is divergent
  const hasDivergentChild = useMemo(() => {
    return localNode.children.some((child) => {
      if (child.entity_type) {
        return divergentPaths.has(child.path);
      }
      return divergentPaths.has(child.path) || hasDivergentChildRecursive(child, divergentPaths);
    });
  }, [localNode.children, divergentPaths]);

  // Auto-expand divergent branches
  const shouldExpand = isDivergent || hasDivergentChild;

  const statusIcon = isMissing
    ? 'removed'
    : isSynced
      ? 'synced'
      : isDivergent
        ? 'divergent'
        : 'unknown';

  return (
    <div className="select-text">
      {/* Branch row */}
      <div
        className={clsx(
          'flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-colors',
          'hover:bg-bg-ops-overlay',
          isDivergent && 'bg-red-900/20 border-l-2 border-cls-secret',
          isSynced && !isMissing && 'bg-green-900/10 border-l-2 border-green-500',
          isMissing && 'bg-amber-900/20 border-l-2 border-amber-500',
        )}
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
        onClick={() => onToggle(localNode.path)}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle(localNode.path);
          }
        }}
      >
        {/* Expand/collapse chevron */}
        {localNode.children.length > 0 ? (
          isExpanded ? (
            <ChevronDown className="w-4 h-4 text-text-ops-muted flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-text-ops-muted flex-shrink-0" />
          )
        ) : (
          <span className="w-4 h-4 flex-shrink-0" />
        )}

        {/* Status icon */}
        {statusIcon === 'synced' && (
          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
        )}
        {statusIcon === 'divergent' && (
          <AlertTriangle className="w-4 h-4 text-cls-secret flex-shrink-0" />
        )}
        {statusIcon === 'removed' && (
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
        )}

        {/* Branch icon */}
        <GitBranch className="w-3.5 h-3.5 text-text-ops-muted flex-shrink-0" />

        {/* Path label */}
        <span className="text-sm font-mono text-text-ops-primary truncate">
          {localNode.path}
        </span>

        {/* Entity count badge */}
        <span className="text-xs text-text-ops-muted flex-shrink-0">
          {localNode.entity_count} entities
        </span>

        {/* Hash digest (truncated) */}
        <span className="text-xs font-mono text-text-ops-muted flex-shrink-0 ml-auto">
          <Hash className="w-3 h-3 inline mr-0.5" />
          {localNode.hash_digest.slice(0, 12)}...
        </span>

        {/* Status badge */}
        {isSynced && !isMissing && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/40 text-green-400 flex-shrink-0">
            Synced
          </span>
        )}
        {isDivergent && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/40 text-cls-secret flex-shrink-0">
            Divergent
          </span>
        )}
        {isMissing && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400 flex-shrink-0">
            Missing
          </span>
        )}
      </div>

      {/* Recursively render children */}
      {isExpanded && shouldExpand && (
        <div className="border-l border-bg-ops-overlay ml-3">
          {localNode.children.map((child, idx) => {
            // Find matching remote child by path
            const remoteChild = remoteNode?.children.find(
              (rc) => rc.path === child.path,
            );

            if (child.entity_type) {
              return (
                <MerkleLeafNode
                  key={child.entity_id || idx}
                  localLeaf={child}
                  remoteLeaf={remoteChild}
                  divergentPaths={divergentPaths}
                  depth={depth + 1}
                />
              );
            }

            return (
              <MerkleTreeBranch
                key={child.path}
                localNode={child}
                remoteNode={remoteChild}
                divergentPaths={divergentPaths}
                expandedPaths={expandedPaths}
                onToggle={onToggle}
                depth={depth + 1}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Leaf Node Component
// ---------------------------------------------------------------------------

interface MerkleLeafNodeProps {
  localLeaf: MerkleTreeNode;
  remoteLeaf?: MerkleTreeNode;
  divergentPaths: Set<string>;
  depth: number;
}

const MerkleLeafNode: React.FC<MerkleLeafNodeProps> = ({
  localLeaf,
  remoteLeaf,
  divergentPaths,
  depth,
}) => {
  const isDivergent = divergentPaths.has(localLeaf.path);
  const isSynced = localLeaf.hash_digest === remoteLeaf?.hash_digest;
  const isMissing = !remoteLeaf;

  const entityIcon =
    localLeaf.entity_type === 'dependency'
      ? 'link'
      : localLeaf.entity_type === 'assignment'
        ? 'users'
        : 'file';

  return (
    <div
      className={clsx(
        'flex items-center gap-2 py-1 px-2 rounded-md transition-colors',
        'hover:bg-bg-ops-overlay',
        isDivergent && 'bg-red-900/20 border-l-2 border-cls-secret',
        isSynced && !isMissing && 'bg-green-900/10 border-l-2 border-green-500',
        isMissing && 'bg-amber-900/20 border-l-2 border-amber-500',
      )}
      style={{ paddingLeft: `${depth * 24 + 16}px` }}
    >
      {/* Entity type icon */}
      {entityIcon === 'link' && (
        <Link className="w-3.5 h-3.5 text-text-ops-muted flex-shrink-0" />
      )}
      {entityIcon === 'users' && (
        <Users className="w-3.5 h-3.5 text-text-ops-muted flex-shrink-0" />
      )}
      {entityIcon === 'file' && (
        <FileText className="w-3.5 h-3.5 text-text-ops-muted flex-shrink-0" />
      )}

      {/* Entity type label */}
      <span className="text-xs text-text-ops-muted uppercase flex-shrink-0">
        {localLeaf.entity_type}
      </span>

      {/* Entity ID (truncated) */}
      <span className="text-xs font-mono text-text-ops-primary truncate">
        {localLeaf.entity_id?.slice(0, 8)}
      </span>

      {/* Version badge */}
      {localLeaf.version_id !== undefined && (
        <span className="text-xs px-1 py-0.5 rounded bg-bg-ops-overlay text-text-ops-muted flex-shrink-0">
          v{localLeaf.version_id}
        </span>
      )}

      {/* Hash digest */}
      <span className="text-xs font-mono text-text-ops-muted flex-shrink-0 ml-auto">
        {localLeaf.hash_digest.slice(0, 8)}
      </span>

      {/* Status badge */}
      {isSynced && !isMissing && (
        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
      )}
      {isDivergent && (
        <AlertTriangle className="w-3.5 h-3.5 text-cls-secret flex-shrink-0" />
      )}
      {isMissing && (
        <span className="text-xs text-amber-400 flex-shrink-0">Removed</span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Helper: Recursive divergent child check
// ---------------------------------------------------------------------------

function hasDivergentChildRecursive(
  node: MerkleTreeNode,
  divergentPaths: Set<string>,
): boolean {
  if (divergentPaths.has(node.path)) return true;
  return node.children.some((child) =>
    child.entity_type
      ? divergentPaths.has(child.path)
      : hasDivergentChildRecursive(child, divergentPaths),
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const MerkleManifestInspector: React.FC<MerkleManifestInspectorProps> = ({
  localManifest,
  remoteManifest,
  divergentPaths,
  comparisonSummary,
}) => {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // Auto-expand divergent paths
  const initialExpanded = useMemo(() => {
    const paths = new Set<string>();
    if (divergentPaths.length > 0) {
      // Expand all parent paths of divergent nodes
      divergentPaths.forEach((dp) => {
        const parts = dp.split('.');
        for (let i = 1; i < parts.length; i++) {
          paths.add(parts.slice(0, i).join('.'));
        }
        paths.add(dp);
      });
    }
    return paths;
  }, [divergentPaths]);

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Initialize expanded paths on mount
  React.useEffect(() => {
    setExpandedPaths(initialExpanded);
  }, [initialExpanded]);

  const divergentSet = useMemo(
    () => new Set(divergentPaths),
    [divergentPaths],
  );

  if (!localManifest) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-text-ops-muted">
        <GitBranch className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-sm">No local manifest loaded.</p>
        <p className="text-xs mt-1">Generate a manifest to begin comparison.</p>
      </div>
    );
  }

  const rootHashesMatch =
    localManifest.root_hash === remoteManifest?.root_hash;

  return (
    <div className="flex flex-col h-full">
      {/* Header summary */}
      <div className="flex items-center gap-4 p-4 border-b border-ops-subtle bg-bg-ops-surface">
        {/* Local manifest info */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <GitBranch className="w-4 h-4 text-text-ops-primary" />
            <span className="text-sm font-semibold text-text-ops-primary">
              Local: {localManifest.site_id || 'This Site'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-ops-muted">
            <span>
              {localManifest.node_count} nodes
            </span>
            <span>
              {localManifest.dependency_count} deps
            </span>
            <span>
              {localManifest.assignment_count} assignments
            </span>
          </div>
          <div className="text-xs font-mono text-text-ops-muted mt-0.5">
            Root: {localManifest.root_hash.slice(0, 16)}...
          </div>
        </div>

        {/* Sync status */}
        <div className="flex-shrink-0">
          {rootHashesMatch ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-900/30 border border-green-700">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-sm font-semibold text-green-400">
                  Fully Synchronized
                </p>
                <p className="text-xs text-green-500/80">
                  Root hashes match — zero changes
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-900/30 border border-red-700">
              <AlertTriangle className="w-5 h-5 text-cls-secret" />
              <div>
                <p className="text-sm font-semibold text-cls-secret">
                  Divergence Detected
                </p>
                <p className="text-xs text-red-400/80">
                  {divergentPaths.length} divergent path
                  {divergentPaths.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Remote manifest info */}
      {remoteManifest && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-ops-subtle bg-bg-ops-overlay text-xs text-text-ops-muted">
          <GitBranch className="w-3.5 h-3.5" />
          <span>
            Remote: {remoteManifest.site_id || 'Remote Site'}
          </span>
          <span>
            {remoteManifest.node_count} nodes
          </span>
          <span>
            {remoteManifest.dependency_count} deps
          </span>
          <span className="font-mono">
            Root: {remoteManifest.root_hash.slice(0, 16)}...
          </span>
        </div>
      )}

      {/* Comparison summary strip */}
      {comparisonSummary && !comparisonSummary.identical && (
        <div className="flex items-center gap-4 px-4 py-2 border-b border-ops-subtle bg-bg-ops-surface text-xs">
          <span className="text-text-ops-muted">Divergence Summary:</span>
          <span className="px-2 py-0.5 rounded bg-green-900/30 text-green-400">
            +{comparisonSummary.added_count} Added
          </span>
          <span className="px-2 py-0.5 rounded bg-amber-900/30 text-amber-400">
            -{comparisonSummary.removed_count} Removed
          </span>
          <span className="px-2 py-0.5 rounded bg-red-900/30 text-cls-secret">
            ~{comparisonSummary.modified_count} Modified
          </span>
          <span className="px-2 py-0.5 rounded bg-blue-900/30 text-blue-400">
            {comparisonSummary.divergent_dependency_count} Deps
          </span>
        </div>
      )}

      {/* Tree view */}
      <div className="flex-1 overflow-auto p-2">
        <MerkleTreeBranch
          localNode={localManifest.tree}
          remoteNode={remoteManifest?.tree}
          divergentPaths={divergentSet}
          expandedPaths={expandedPaths}
          onToggle={handleToggle}
          depth={0}
        />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-ops-subtle bg-bg-ops-surface text-xs text-text-ops-muted">
        <span>Legend:</span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          Synced
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-cls-secret" />
          Divergent
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          Missing
        </span>
      </div>
    </div>
  );
};

export default MerkleManifestInspector;
