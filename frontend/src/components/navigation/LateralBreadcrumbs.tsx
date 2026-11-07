/**
 * Lateral Breadcrumbs Component
 *
 * Parses an active ltree dot-path (e.g., "prog_a.proj_1.sys_radar.wp_04")
 * and renders clickable breadcrumb pills for each hierarchy level.
 *
 * Features
 * --------
 *
 * - **ltree Path Parsing** — Splits dot-separated paths into individual
 *   segments and maps them to human-readable labels.
 *
 * - **Breadcrumb Pills** — Each segment is rendered as a clickable pill
 *   showing the hierarchy level (Programme, Project, Work Package, etc.).
 *
 * - **Sibling Popover** — Clicking any intermediate segment opens an inline
 *   popover listing sibling nodes at that exact hierarchy depth, enabling
 *   instant lateral switching without scrolling through the main tree.
 *
 * - **Keyboard Navigation** — Arrow keys navigate between breadcrumb segments;
 *   Enter opens the sibling popover.
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    <LateralBreadcrumbs
 *      ltreePath="prog_a.proj_1.sys_radar.wp_04"
 *      pathLabels={{"prog_a": "Programme A", "proj_1": "Project 1", ...}}
 *      onNavigate={(nodeId) => selectNode(nodeId)}
 *      siblingFetcher={async (prefix, depth) => fetchSiblings(prefix, depth)}
 *    />
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  ChevronRight,
  Home,
  FolderOpen,
  Folder,
  FileText,
  ChevronDown,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../services/api';
import type { WBSNode } from '../../types/wbs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A parsed breadcrumb segment */
interface BreadcrumbSegment {
  /** The ltree segment (e.g., "prog_a") */
  segment: string;
  /** Human-readable label (e.g., "Programme A") */
  label: string;
  /** Prefix path up to and including this segment */
  prefix: string;
  /** Depth in the hierarchy (0-based) */
  depth: number;
  /** Node ID for this segment (if available) */
  nodeId?: string;
}

/** A sibling node at a given hierarchy depth */
interface SiblingNode {
  /** Node ID */
  id: string;
  /** ltree path */
  path: string;
  /** Display code */
  code: string;
  /** Display name */
  name: string;
}

interface LateralBreadcrumbsProps {
  /** The active ltree dot-path (e.g., "prog_a.proj_1.sys_radar.wp_04") */
  ltreePath: string;
  /** Map of segment → human-readable label */
  pathLabels?: Record<string, string>;
  /** Map of segment → node ID */
  pathNodeIds?: Record<string, string>;
  /** Callback when navigating to a different node */
  onNavigate?: (nodeId: string, path: string) => void;
  /** Async function to fetch sibling nodes at a given depth */
  siblingFetcher?: (prefix: string, depth: number) => Promise<SiblingNode[]>;
}

// ---------------------------------------------------------------------------
// Hierarchy Level Detection
// ---------------------------------------------------------------------------

/**
 * Infer the hierarchy level name from the depth in the ltree path.
 *
 * @param depth - Zero-based depth in the hierarchy
 * @returns Human-readable level name
 */
function getHierarchyLevel(depth: number): string {
  const levels = [
    'Programme',
    'Project',
    'Control Account',
    'Work Package',
    'Task',
    'Sub-Task',
  ];
  return levels[depth] ?? `Level ${depth + 1}`;
}

/**
 * Get the appropriate icon for a hierarchy level.
 *
 * @param depth - Zero-based depth
 * @param isLast - Whether this is the last (active) segment
 * @returns Lucide icon component
 */
function getHierarchyIcon(depth: number, isLast: boolean): React.ElementType {
  if (isLast) return FileText;
  if (depth === 0) return Home;
  if (depth <= 2) return FolderOpen;
  return Folder;
}

// ---------------------------------------------------------------------------
// Sibling Popover Component
// ---------------------------------------------------------------------------

const SiblingPopover: React.FC<{
  segment: BreadcrumbSegment;
  siblings: SiblingNode[];
  loading: boolean;
  error: string | null;
  onSelect: (sibling: SiblingNode) => void;
  onClose: () => void;
}> = ({ segment, siblings, loading, error, onSelect, onClose }) => {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      ref={popoverRef}
      className="absolute top-full left-0 mt-2 z-50 w-72 bg-bg-ops-surface border border-border-ops-strong shadow-2xl rounded-lg overflow-hidden"
      role="listbox"
      aria-label={`Sibling nodes at ${getHierarchyLevel(segment.depth)} level`}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-ops-subtle bg-bg-ops-overlay/50">
        <p className="text-xs font-semibold text-text-ops-primary">
          {getHierarchyLevel(segment.depth)} — Siblings
        </p>
        <p className="text-[10px] text-text-ops-muted truncate">
          Path: {segment.prefix}
        </p>
      </div>

      {/* Content */}
      <div className="max-h-60 overflow-y-auto">
        {loading ? (
          <div className="px-3 py-6 text-center text-text-ops-muted text-xs">
            Loading siblings...
          </div>
        ) : error ? (
          <div className="px-3 py-6 text-center text-red-400 text-xs">
            {error}
          </div>
        ) : siblings.length === 0 ? (
          <div className="px-3 py-6 text-center text-text-ops-muted text-xs">
            No siblings at this level
          </div>
        ) : (
          siblings.map((sibling) => (
            <button
              key={sibling.id}
              type="button"
              role="option"
              onClick={() => onSelect(sibling)}
              className={clsx(
                'w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                sibling.path === segment.prefix
                  ? 'bg-bg-ops-overlay text-text-ops-primary'
                  : 'text-text-ops-muted hover:bg-bg-ops-overlay/50 hover:text-text-ops-primary',
              )}
            >
              <FileText className="w-3.5 h-3.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{sibling.code}</div>
                <div className="text-[10px] text-text-ops-muted truncate">
                  {sibling.name}
                </div>
              </div>
              {sibling.path === segment.prefix && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-sky-400/10 text-sky-400 flex-shrink-0">
                  Current
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * Lateral Breadcrumbs component.
 *
 * Parses an ltree dot-path into clickable breadcrumb pills.  Clicking any
 * intermediate segment opens a popover listing sibling nodes at that depth,
 * enabling instant lateral navigation without scrolling the main tree.
 *
 * @param props - Lateral breadcrumbs props
 */
const LateralBreadcrumbs: React.FC<LateralBreadcrumbsProps> = ({
  ltreePath,
  pathLabels = {},
  pathNodeIds = {},
  onNavigate,
  siblingFetcher,
}) => {
  const [activePopover, setActivePopover] = useState<number | null>(null);
  const [siblings, setSiblings] = useState<SiblingNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse ltree path into segments
  const segments: BreadcrumbSegment[] = useMemo(() => {
    if (!ltreePath) return [];

    const parts = ltreePath.split('.');
    const segs: BreadcrumbSegment[] = [];
    let prefix = '';

    parts.forEach((part, idx) => {
      prefix = idx === 0 ? part : `${prefix}.${part}`;
      segs.push({
        segment: part,
        label: pathLabels[part] || part,
        prefix,
        depth: idx,
        nodeId: pathNodeIds[part],
      });
    });

    return segs;
  }, [ltreePath, pathLabels, pathNodeIds]);

  // Fetch siblings when popover opens
  const handleOpenPopover = useCallback(
    async (depth: number, segment: BreadcrumbSegment) => {
      if (activePopover === depth) {
        setActivePopover(null);
        return;
      }

      setActivePopover(depth);
      setLoading(true);
      setError(null);

      try {
        let fetched: SiblingNode[];

        if (siblingFetcher) {
          fetched = await siblingFetcher(segment.prefix, depth);
        } else {
          // Default: fetch from API
          const parentPath = depth > 0 ? segments[depth - 1]?.prefix : undefined;
          const response = await api.get<WBSNode[]>(
            `/api/v1/wbs/nodes?root=${parentPath || segment.segment}&depth=1`,
          );
          fetched = (response.data || []).map((node) => ({
            id: node.id,
            path: node.path,
            code: node.code,
            name: node.name,
          }));
        }

        setSiblings(fetched);
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load siblings');
      } finally {
        setLoading(false);
      }
    },
    [activePopover, siblingFetcher, segments],
  );

  // Handle sibling selection
  const handleSelectSibling = useCallback(
    (sibling: SiblingNode) => {
      onNavigate?.(sibling.id, sibling.path);
      setActivePopover(null);
    },
    [onNavigate],
  );

  // Keyboard navigation between segments
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (e.key === 'ArrowRight' && index < segments.length - 1) {
        e.preventDefault();
        const nextBtn = containerRef.current?.querySelector<HTMLButtonElement>(
          `button[data-segment-idx="${index + 1}"]`,
        );
        nextBtn?.focus();
      } else if (e.key === 'ArrowLeft' && index > 0) {
        e.preventDefault();
        const prevBtn = containerRef.current?.querySelector<HTMLButtonElement>(
          `button[data-segment-idx="${index - 1}"]`,
        );
        prevBtn?.focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleOpenPopover(index, segments[index]);
      }
    },
    [segments, handleOpenPopover],
  );

  if (segments.length === 0) return null;

  return (
    <nav
      ref={containerRef}
      className="flex items-center gap-1 text-sm"
      role="navigation"
      aria-label="Breadcrumb navigation"
    >
      {segments.map((segment, idx) => {
        const isLast = idx === segments.length - 1;
        const Icon = getHierarchyIcon(idx, isLast);
        const isPopoverOpen = activePopover === idx;

        return (
          <React.Fragment key={segment.prefix}>
            {/* Separator */}
            {idx > 0 && (
              <ChevronRight className="w-3.5 h-3.5 text-text-ops-muted flex-shrink-0" />
            )}

            {/* Breadcrumb Pill */}
            <div className="relative">
              <button
                type="button"
                data-segment-idx={idx}
                onClick={() => handleOpenPopover(idx, segment)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                className={clsx(
                  'flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors',
                  isLast
                    ? 'bg-bg-ops-overlay text-text-ops-primary font-medium'
                    : 'text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay/50',
                )}
                aria-label={`${getHierarchyLevel(idx)}: ${segment.label}`}
                title={`${getHierarchyLevel(idx)}: ${segment.label}`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="max-w-[120px] truncate text-xs">
                  {segment.label}
                </span>
                {!isLast && (
                  <ChevronDown
                    className={clsx(
                      'w-3 h-3 flex-shrink-0 transition-transform',
                      isPopoverOpen && 'rotate-180',
                    )}
                  />
                )}
              </button>

              {/* Sibling Popover */}
              {isPopoverOpen && (
                <SiblingPopover
                  segment={segment}
                  siblings={siblings}
                  loading={loading}
                  error={error}
                  onSelect={handleSelectSibling}
                  onClose={() => setActivePopover(null)}
                />
              )}
            </div>
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default LateralBreadcrumbs;
