/**
 * Location Explorer View
 *
 * Hierarchical tree grid for browsing the Location Breakdown Structure (LBS)
 * from Site down to Shelf.  Each location displays facility badging (SCIF/
 * TEMPEST accreditation, escort requirements) and a nested asset inventory
 * table showing all calibrated equipment currently housed in that container.
 *
 * Features
 * --------
 * 1. **Hierarchical Tree Grid** — Expandable location tree from Site →
 *    Building → Zone → Room → Container → Shelf with breadcrumb navigation.
 *
 * 2. **Facility Badging** — Visual badges for SCIF/TEMPEST accreditation,
 *    escort requirements, and security classification.
 *
 * 3. **Nested Asset Table** — Sub-table listing all calibrated equipment
 *    and rigs currently located in the selected container.
 *
 * 4. **Relocate Asset Modal** — Allows scan/selection of a new target
 *    LocationNode, prompts for justification, and verifies user clearance
 *    before executing the move.
 *
 * 5. **Custody History** — Clicking an asset shows its chronological
 *    movement trail from the AssetLocationLedger.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { clsx } from 'clsx';
import {
  MapPin,
  Building2,
  Box,
  DoorOpen,
  Package,
  Layers,
  ChevronRight,
  ChevronDown,
  Shield,
  AlertTriangle,
  UserCheck,
  Search,
  ArrowRightLeft,
  History,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Filter,
  X,
} from 'lucide-react';
import api from '../services/api';
import type {
  LocationNode,
  AssetItem,
  AssetCustodyEntry,
  LocationInventoryResponse,
  AssetCustodyHistoryResponse,
  AssetRelocateResponse,
  LocationTier,
  SecurityClassification,
} from '../types/location';
import { useHoverInspector } from '../hooks/useHoverInspector';
import HoverSummaryModal from '../components/common/HoverSummaryModal';

// ---------------------------------------------------------------------------
// Tier Icons
// ---------------------------------------------------------------------------

const TIER_ICONS: Record<LocationTier, React.ReactNode> = {
  SITE: <MapPin className="w-4 h-4" />,
  FACILITY: <Building2 className="w-4 h-4" />,
  ZONE: <Layers className="w-4 h-4" />,
  ROOM: <DoorOpen className="w-4 h-4" />,
  CONTAINER: <Package className="w-4 h-4" />,
  SUB_CONTAINER: <Box className="w-4 h-4" />,
};

const TIER_LABELS: Record<LocationTier, string> = {
  SITE: 'Site',
  FACILITY: 'Facility',
  ZONE: 'Zone',
  ROOM: 'Room',
  CONTAINER: 'Container',
  SUB_CONTAINER: 'Sub-Container',
};

// ---------------------------------------------------------------------------
// Classification Colors
// ---------------------------------------------------------------------------

const CLASS_COLORS: Record<SecurityClassification, string> = {
  OFFICIAL: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
  OFFICIAL_SENSITIVE: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  SECRET: 'text-red-400 bg-red-500/10 border-red-500/30',
  TOP_SECRET: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
};

// ---------------------------------------------------------------------------
// Helper: Format file size
// ---------------------------------------------------------------------------

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ---------------------------------------------------------------------------
// Component: LocationTreeRow
// ---------------------------------------------------------------------------

interface LocationTreeRowProps {
  node: LocationNode;
  depth: number;
  selectedId: string | null;
  onSelect: (node: LocationNode) => void;
  onToggleExpand: (nodeId: string) => void;
}

const LocationTreeRow: React.FC<LocationTreeRowProps> = ({
  node,
  depth,
  selectedId,
  onSelect,
  onToggleExpand,
}) => {
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isExpanded = node.expanded;
  const isSelected = selectedId === node.id;

  // Hover inspector for location tree rows
  const rowRef = useRef<HTMLDivElement>(null);
  const hoverInspector = useHoverInspector({
    targetData: {
      entityType: 'LOCATION',
      entityId: node.id,
    },
    enterDelayMs: 5000,
    exitDelayMs: 2000,
  });

  // Wire the row ref to the hook for positioning
  useEffect(() => {
    if (hoverInspector.handlers.onRef) {
      hoverInspector.handlers.onRef(rowRef.current);
    }
  }, [hoverInspector.handlers.onRef]);

  const handleRowMouseEnter = () => {
    hoverInspector.handlers.onMouseEnter();
  };

  const handleRowMouseLeave = () => {
    hoverInspector.handlers.onMouseLeave();
  };

  return (
    <>
    <div
      ref={rowRef}
      className={clsx(
        'flex items-center gap-2 py-1.5 px-2 cursor-pointer border-b border-border-ops-subtle/30 transition-colors',
        isSelected
          ? 'bg-blue-600/10 border-l-2 border-l-blue-500'
          : 'hover:bg-bg-ops-overlay',
      )}
      style={{ paddingLeft: `${depth * 24 + 8}px` }}
      onClick={() => {
        if (hasChildren && !node.childrenLoaded) {
          onToggleExpand(node.id);
        }
        onSelect(node);
      }}
      onMouseEnter={handleRowMouseEnter}
      onMouseLeave={handleRowMouseLeave}
      role="treeitem"
      aria-expanded={hasChildren ? isExpanded : undefined}
      aria-selected={isSelected}
    >
      {/* Expand/Collapse Chevron */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand(node.id);
        }}
        className={clsx(
          'w-5 h-5 flex items-center justify-center rounded hover:bg-bg-ops-overlay transition-colors',
          !hasChildren && 'invisible',
        )}
        aria-label={isExpanded ? 'Collapse' : 'Expand'}
      >
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-text-ops-muted" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-text-ops-muted" />
        )}
      </button>

      {/* Tier Icon */}
      <span className="text-text-ops-muted">
        {TIER_ICONS[node.tier]}
      </span>

      {/* Code & Name */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-text-ops-muted">
            {node.code}
          </span>
          <span className="text-sm text-text-ops-primary truncate">
            {node.name}
          </span>
        </div>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Classification Badge */}
        <span
          className={clsx(
            'px-1.5 py-0.5 rounded text-[10px] font-medium border',
            CLASS_COLORS[node.security_classification],
          )}
        >
          {node.security_classification}
        </span>

        {/* SCIF Badge */}
        {node.is_scif_or_tempest && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Shield className="w-3 h-3 inline mr-0.5" />
            SCIF
          </span>
        )}

        {/* Escort Badge */}
        {node.escort_required && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/10 border border-orange-500/30 text-orange-400">
            <UserCheck className="w-3 h-3 inline mr-0.5" />
            Escort
          </span>
        )}

        {/* Asset Count */}
        {node.asset_count !== undefined && node.asset_count > 0 && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 border border-blue-500/30 text-blue-400">
            {node.asset_count} asset{node.asset_count > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>

      {/* Hover Summary Modal — rendered when dwell timer triggers */}
      {hoverInspector.state.isOpen && (
        <HoverSummaryModal
          targetData={{ entityType: 'LOCATION', entityId: node.id }}
          position={hoverInspector.state.position}
          placement={hoverInspector.state.placement}
          isExiting={hoverInspector.state.isExiting}
          onClose={hoverInspector.close}
          onMouseEnter={hoverInspector.modalCallbacks.onMouseEnter}
          onMouseLeave={hoverInspector.modalCallbacks.onMouseLeave}
          floatingStyles={hoverInspector.floatingStyles}
          floatingRef={hoverInspector.refs?.setFloating}
        />
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Component: AssetInventoryTable
// ---------------------------------------------------------------------------

interface AssetInventoryTableProps {
  assets: AssetItem[];
  onRelocate: (asset: AssetItem) => void;
  onViewHistory: (asset: AssetItem) => void;
}

// ---------------------------------------------------------------------------
// Sub-component: AssetRow with hover inspector
// ---------------------------------------------------------------------------

const AssetRow: React.FC<{
  asset: AssetItem;
  onRelocate: (asset: AssetItem) => void;
  onViewHistory: (asset: AssetItem) => void;
}> = ({ asset, onRelocate, onViewHistory }) => {
  const rowRef = useRef<HTMLTableRowElement>(null);
  const hoverInspector = useHoverInspector({
    targetData: {
      entityType: 'RESOURCE',
      entityId: asset.id,
    },
    enterDelayMs: 5000,
    exitDelayMs: 2000,
  });

  // Wire the row ref to the hook for positioning
  useEffect(() => {
    if (hoverInspector.handlers.onRef) {
      hoverInspector.handlers.onRef(rowRef.current);
    }
  }, [hoverInspector.handlers.onRef]);

  return (
    <>
    <tr
      ref={rowRef}
      key={asset.id}
      className="border-b border-border-ops-subtle/30 hover:bg-bg-ops-overlay transition-colors"
      onMouseEnter={() => hoverInspector.handlers.onMouseEnter()}
      onMouseLeave={() => hoverInspector.handlers.onMouseLeave()}
    >
      <td className="py-2 px-3 font-mono text-xs text-text-ops-muted">
        {asset.code}
      </td>
      <td className="py-2 px-3 text-text-ops-primary">{asset.name}</td>
      <td className="py-2 px-3">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-muted">
          {asset.resource_type}
        </span>
      </td>
      <td className="py-2 px-3">
        <span
          className={clsx(
            'px-1.5 py-0.5 rounded text-[10px] font-medium border',
            CLASS_COLORS[asset.security_classification],
          )}
        >
          {asset.security_classification}
        </span>
      </td>
      <td className="py-2 px-3 text-xs text-text-ops-muted truncate max-w-[150px]">
        {asset.current_location_name || '—'}
      </td>
      <td className="py-2 px-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => onViewHistory(asset)}
            className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors"
            title="View custody history"
          >
            <History className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onRelocate(asset)}
            className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-blue-400 transition-colors"
            title="Relocate asset"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>

      {/* Hover Summary Modal — rendered when dwell timer triggers */}
      {hoverInspector.state.isOpen && (
        <HoverSummaryModal
          targetData={{ entityType: 'RESOURCE', entityId: asset.id }}
          position={hoverInspector.state.position}
          placement={hoverInspector.state.placement}
          isExiting={hoverInspector.state.isExiting}
          onClose={hoverInspector.close}
          onMouseEnter={hoverInspector.modalCallbacks.onMouseEnter}
          onMouseLeave={hoverInspector.modalCallbacks.onMouseLeave}
          floatingStyles={hoverInspector.floatingStyles}
          floatingRef={hoverInspector.refs?.setFloating}
        />
      )}
    </>
  );
};

const AssetInventoryTable: React.FC<AssetInventoryTableProps> = ({
  assets,
  onRelocate,
  onViewHistory,
}) => {
  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-text-ops-muted">
        <Box className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No assets in this location</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-ops-subtle text-text-ops-muted text-xs uppercase tracking-wider">
            <th className="text-left py-2 px-3 font-medium">Code</th>
            <th className="text-left py-2 px-3 font-medium">Name</th>
            <th className="text-left py-2 px-3 font-medium">Type</th>
            <th className="text-left py-2 px-3 font-medium">Classification</th>
            <th className="text-left py-2 px-3 font-medium">Location</th>
            <th className="text-right py-2 px-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <AssetRow
              key={asset.id}
              asset={asset}
              onRelocate={onRelocate}
              onViewHistory={onViewHistory}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Component: RelocateAssetModal
// ---------------------------------------------------------------------------

interface RelocateAssetModalProps {
  asset: AssetItem | null;
  locations: LocationNode[];
  onClose: () => void;
  onRelocate: (
    assetId: string,
    targetLocationId: string,
    reason: string,
    notes?: string,
  ) => Promise<void>;
}

const RelocateAssetModal: React.FC<RelocateAssetModalProps> = ({
  asset,
  locations,
  onClose,
  onRelocate,
}) => {
  const [targetLocationId, setTargetLocationId] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [isRelocating, setIsRelocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Flatten all locations for the dropdown
  const allLocations = useMemo(() => {
    const flatten = (nodes: LocationNode[]): LocationNode[] =>
      nodes.reduce<LocationNode[]>((acc, node) => {
        acc.push(node);
        if (node.children) {
          acc.push(...flatten(node.children));
        }
        return acc;
      }, []);
    return flatten(locations);
  }, [locations]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset || !targetLocationId || !reason.trim()) return;

    setIsRelocating(true);
    setError(null);
    try {
      await onRelocate(asset.id, targetLocationId, reason.trim(), notes.trim() || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Relocation failed');
    } finally {
      setIsRelocating(false);
    }
  };

  if (!asset) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Relocate Asset"
    >
      <div className="w-full max-w-lg bg-bg-ops-surface border border-border-ops-subtle rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-ops-subtle">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-blue-400" />
            <h2 className="text-sm font-semibold text-text-ops-primary">
              Relocate Asset
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Asset Info */}
        <div className="p-4 border-b border-border-ops-subtle">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-text-ops-muted bg-bg-ops-overlay px-2 py-1 rounded">
              {asset.code}
            </span>
            <span className="text-sm text-text-ops-primary">{asset.name}</span>
            <span
              className={clsx(
                'px-1.5 py-0.5 rounded text-[10px] font-medium border',
                CLASS_COLORS[asset.security_classification],
              )}
            >
              {asset.security_classification}
            </span>
          </div>
          {asset.current_location_name && (
            <p className="mt-2 text-xs text-text-ops-muted">
              Current location: {asset.current_location_name}
            </p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Target Location */}
          <div>
            <label className="block text-xs font-medium text-text-ops-muted uppercase tracking-wider mb-1.5">
              Target Location
            </label>
            <select
              value={targetLocationId}
              onChange={(e) => setTargetLocationId(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-md bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select a location...</option>
              {allLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.path} — {loc.code} ({loc.name})
                </option>
              ))}
            </select>
          </div>

          {/* Justification */}
          <div>
            <label className="block text-xs font-medium text-text-ops-muted uppercase tracking-wider mb-1.5">
              Justification *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              placeholder="Why is this asset being relocated?"
              className="w-full px-3 py-2 rounded-md bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-text-ops-muted uppercase tracking-wider mb-1.5">
              Additional Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes about this move..."
              className="w-full px-3 py-2 rounded-md bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-400">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isRelocating}
              className="px-4 py-2 rounded-md text-sm font-medium text-text-ops-muted hover:text-text-ops-primary border border-border-ops-subtle hover:border-border-ops-strong transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isRelocating || !targetLocationId || !reason.trim()}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                isRelocating || !targetLocationId || !reason.trim()
                  ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white',
              )}
            >
              {isRelocating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Relocating...
                </>
              ) : (
                <>
                  <ArrowRightLeft className="w-4 h-4" />
                  Confirm Relocation
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Component: CustodyHistoryPanel
// ---------------------------------------------------------------------------

interface CustodyHistoryPanelProps {
  asset: AssetItem | null;
  entries: AssetCustodyEntry[];
  loading: boolean;
  onClose: () => void;
}

const CustodyHistoryPanel: React.FC<CustodyHistoryPanelProps> = ({
  asset,
  entries,
  loading,
  onClose,
}) => {
  if (!asset) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Custody History"
    >
      <div className="w-full max-w-2xl max-h-[80vh] bg-bg-ops-surface border border-border-ops-subtle rounded-lg shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-ops-subtle">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-semibold text-text-ops-primary">
              Custody History
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Asset Info */}
        <div className="p-4 border-b border-border-ops-subtle">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-text-ops-muted bg-bg-ops-overlay px-2 py-1 rounded">
              {asset.code}
            </span>
            <span className="text-sm text-text-ops-primary">{asset.name}</span>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 text-text-ops-muted">
              <Loader2 className="w-6 h-6 mb-2 animate-spin" />
              <p className="text-sm">Loading custody history...</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-text-ops-muted">
              <History className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">No custody history recorded</p>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry, index) => (
                <div
                  key={entry.id}
                  className="flex gap-3 p-3 rounded-md bg-bg-ops-overlay border border-border-ops-subtle"
                >
                  {/* Timeline indicator */}
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-blue-500/50 border-2 border-blue-500" />
                    {index < entries.length - 1 && (
                      <div className="w-px h-full bg-border-ops-subtle mt-1" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-text-ops-muted">
                        {new Date(entry.movement_timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-text-ops-primary">
                      {entry.from_location_name ? (
                        <>
                          <span className="text-text-ops-muted">{entry.from_location_name}</span>
                          <ArrowRightLeft className="w-3 h-3 inline mx-1 text-blue-400" />
                          <span className="text-blue-400">{entry.to_location_name}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-text-ops-muted">Initial commissioning →</span>{' '}
                          <span className="text-blue-400">{entry.to_location_name}</span>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-text-ops-muted mt-1">
                      {entry.movement_reason}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-text-ops-muted">
                      <span>Moved by: {entry.moved_by_user_name || 'Unknown'}</span>
                      {entry.authorized_by_user_name && (
                        <span>Auth: {entry.authorized_by_user_name}</span>
                      )}
                    </div>
                    {entry.notes && (
                      <p className="text-xs text-text-ops-muted mt-1 italic">
                        "{entry.notes}"
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Component: BreadcrumbBar
// ---------------------------------------------------------------------------

interface BreadcrumbBarProps {
  node: LocationNode | null;
  onNavigateUp: () => void;
}

const BreadcrumbBar: React.FC<BreadcrumbBarProps> = ({ node, onNavigateUp }) => {
  if (!node) return null;

  // Build breadcrumb from ltree path
  const parts = node.path.split('.');

  return (
    <div className="flex items-center gap-1 text-xs px-4 py-2 border-b border-border-ops-subtle bg-bg-ops-overlay">
      <button
        type="button"
        onClick={onNavigateUp}
        className="text-text-ops-muted hover:text-text-ops-primary transition-colors"
      >
        ↑ Parent
      </button>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight className="w-3 h-3 text-text-ops-muted" />}
          <span
            className={clsx(
              'truncate',
              i === parts.length - 1
                ? 'text-text-ops-primary font-semibold'
                : 'text-text-ops-muted',
            )}
          >
            {part}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main View Component
// ---------------------------------------------------------------------------

const LocationExplorerView: React.FC = () => {
  const [locations, setLocations] = useState<LocationNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<LocationNode | null>(null);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTier, setFilterTier] = useState<LocationTier | null>(null);
  const [scifOnly, setScifOnly] = useState(false);

  // Relocate modal state
  const [relocateAsset, setRelocateAsset] = useState<AssetItem | null>(null);

  // Custody history state
  const [custodyAsset, setCustodyAsset] = useState<AssetItem | null>(null);
  const [custodyEntries, setCustodyEntries] = useState<AssetCustodyEntry[]>([]);
  const [custodyLoading, setCustodyLoading] = useState(false);

  // Fetch root locations on mount
  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    setLoading(true);
    try {
      // Fetch root-level locations (sites)
      const response = await api.get('/api/v1/wbs/nodes', {
        params: { tree_type: 'LBS' },
      });
      if (response.data) {
        setLocations(response.data.items || []);
      }
    } catch {
      // Silently fail — locations may not be available
    } finally {
      setLoading(false);
    }
  };

  // Fetch inventory for selected location
  const fetchInventory = useCallback(
    async (locationId: string) => {
      setInventoryLoading(true);
      try {
        const response = await api.get<LocationInventoryResponse>(
          `/api/v1/spatial/locations/${locationId}/inventory`,
        );
        if (response.data) {
          setAssets(response.data.assets || []);
        }
      } catch {
        setAssets([]);
      } finally {
        setInventoryLoading(false);
      }
    },
    [],
  );

  // Handle location selection
  const handleSelectNode = useCallback(
    (node: LocationNode) => {
      setSelectedNode(node);
      fetchInventory(node.id);
    },
    [fetchInventory],
  );

  // Handle expand/collapse
  const handleToggleExpand = useCallback((nodeId: string) => {
    setLocations((prev) => {
      const toggle = (nodes: LocationNode[]): LocationNode[] =>
        nodes.map((node) => {
          if (node.id === nodeId) {
            return { ...node, expanded: !node.expanded };
          }
          if (node.children) {
            return { ...node, children: toggle(node.children) };
          }
          return node;
        });
      return toggle(prev);
    });
  }, []);

  // Handle relocation
  const handleRelocate = useCallback(
    async (
      assetId: string,
      targetLocationId: string,
      reason: string,
      notes?: string,
    ) => {
      await api.post<AssetRelocateResponse>('/api/v1/spatial/relocate', {
        resource_id: assetId,
        target_location_id: targetLocationId,
        reason,
        notes,
      });
      // Refresh inventory
      if (selectedNode) {
        fetchInventory(selectedNode.id);
      }
    },
    [selectedNode, fetchInventory],
  );

  // Handle view custody history
  const handleViewCustody = useCallback(async (asset: AssetItem) => {
    setCustodyAsset(asset);
    setCustodyLoading(true);
    try {
      const response = await api.get<AssetCustodyHistoryResponse>(
        `/api/v1/spatial/assets/${asset.id}/custody-history`,
      );
      if (response.data) {
        setCustodyEntries(response.data.entries || []);
      }
    } catch {
      setCustodyEntries([]);
    } finally {
      setCustodyLoading(false);
    }
  }, []);

  // Filter locations
  const filteredLocations = useMemo(() => {
    const filter = (nodes: LocationNode[]): LocationNode[] =>
      nodes.filter((node) => {
        if (filterTier && node.tier !== filterTier) return false;
        if (scifOnly && !node.is_scif_or_tempest) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          return (
            node.name.toLowerCase().includes(q) ||
            node.code.toLowerCase().includes(q) ||
            node.path.toLowerCase().includes(q)
          );
        }
        return true;
      }).map((node) => {
        if (node.children) {
          return { ...node, children: filter(node.children) };
        }
        return node;
      });
    return filter(locations);
  }, [locations, filterTier, scifOnly, searchQuery]);

  // Render tree recursively
  const renderTree = (nodes: LocationNode[], depth = 0) =>
    nodes.map((node) => (
      <React.Fragment key={node.id}>
        <LocationTreeRow
          node={node}
          depth={depth}
          selectedId={selectedNode?.id || null}
          onSelect={handleSelectNode}
          onToggleExpand={handleToggleExpand}
        />
        {node.expanded && node.children && node.children.length > 0 &&
          renderTree(node.children, depth + 1)}
      </React.Fragment>
    ));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-ops-subtle">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-blue-400" />
          <h1 className="text-sm font-semibold text-text-ops-primary">
            Location Explorer
          </h1>
          <span className="text-xs text-text-ops-muted">
            ({locations.length} sites)
          </span>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-ops-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search locations..."
              className="pl-8 pr-3 py-1.5 rounded-md bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
            />
          </div>

          <select
            value={filterTier || ''}
            onChange={(e) => setFilterTier(e.target.value as LocationTier || null)}
            className="px-2 py-1.5 rounded-md bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All Tiers</option>
            {Object.keys(TIER_LABELS).map((tier) => (
              <option key={tier} value={tier}>
                {TIER_LABELS[tier as LocationTier]}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setScifOnly(!scifOnly)}
            className={clsx(
              'flex items-center gap-1 px-2 py-1.5 rounded-md border text-xs transition-colors',
              scifOnly
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-bg-ops-overlay border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary',
            )}
          >
            <Shield className="w-3.5 h-3.5" />
            SCIF Only
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      <BreadcrumbBar
        node={selectedNode}
        onNavigateUp={() => {
          if (selectedNode?.parent_id) {
            // Navigate to parent — find it in the tree
            const findParent = (
              nodes: LocationNode[],
              parentId: string,
            ): LocationNode | null => {
              for (const node of nodes) {
                if (node.id === parentId) return node;
                if (node.children) {
                  const found = findParent(node.children, parentId);
                  if (found) return found;
                }
              }
              return null;
            };
            const parent = findParent(locations, selectedNode.parent_id);
            if (parent) handleSelectNode(parent);
          }
        }}
      />

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Location Tree */}
        <div className="w-1/2 border-r border-border-ops-subtle flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border-ops-subtle bg-bg-ops-overlay">
            <Filter className="w-3.5 h-3.5 text-text-ops-muted" />
            <span className="text-xs font-medium text-text-ops-muted uppercase tracking-wider">
              Location Hierarchy
            </span>
          </div>

          <div className="flex-1 overflow-y-auto" role="tree">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8 text-text-ops-muted">
                <Loader2 className="w-6 h-6 mb-2 animate-spin" />
                <p className="text-sm">Loading locations...</p>
              </div>
            ) : filteredLocations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-text-ops-muted">
                <MapPin className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">
                  {searchQuery || filterTier || scifOnly
                    ? 'No locations match your filters'
                    : 'No locations configured'}
                </p>
              </div>
            ) : (
              renderTree(filteredLocations)
            )}
          </div>
        </div>

        {/* Right Panel: Asset Inventory */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedNode ? (
            <>
              <div className="flex items-center justify-between px-3 py-2 border-b border-border-ops-subtle bg-bg-ops-overlay">
                <div className="flex items-center gap-2">
                  <Box className="w-3.5 h-3.5 text-text-ops-muted" />
                  <span className="text-xs font-medium text-text-ops-muted uppercase tracking-wider">
                    Asset Inventory
                  </span>
                  <span className="text-xs text-text-ops-muted">
                    — {selectedNode.code}: {selectedNode.name}
                  </span>
                </div>
                <span className="text-xs text-text-ops-muted">
                  {assets.length} asset{assets.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto">
                {inventoryLoading ? (
                  <div className="flex flex-col items-center justify-center py-8 text-text-ops-muted">
                    <Loader2 className="w-6 h-6 mb-2 animate-spin" />
                    <p className="text-sm">Loading inventory...</p>
                  </div>
                ) : (
                  <AssetInventoryTable
                    assets={assets}
                    onRelocate={setRelocateAsset}
                    onViewHistory={handleViewCustody}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-text-ops-muted">
              <MapPin className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">Select a location to view its asset inventory</p>
            </div>
          )}
        </div>
      </div>

      {/* Relocate Modal */}
      {relocateAsset && (
        <RelocateAssetModal
          asset={relocateAsset}
          locations={locations}
          onClose={() => setRelocateAsset(null)}
          onRelocate={handleRelocate}
        />
      )}

      {/* Custody History Panel */}
      {custodyAsset && (
        <CustodyHistoryPanel
          asset={custodyAsset}
          entries={custodyEntries}
          loading={custodyLoading}
          onClose={() => {
            setCustodyAsset(null);
            setCustodyEntries([]);
          }}
        />
      )}
    </div>
  );
};

export default LocationExplorerView;
