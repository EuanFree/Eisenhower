/**
 * Slide-Over Drawer Component
 *
 * Context-preserving slide-out drawer from the right edge of the viewport.
 * Used for deep configuration tasks (CDRL reviews, BCR change diffs,
 * Artifact Vault upload) without losing scroll position in the main
 * Gantt/WBS view.
 *
 * The drawer overlays the right side of the screen with a semi-transparent
 * backdrop, keeping the main content visible and interactive. The drawer
 * width is configurable (default 480px) and can be resized.
 *
 * Features:
 * - Smooth slide-in/out animation
 * - Backdrop click to close
 * - Escape key to close
 * - Tabbed content sections for different configuration types
 * - Preserves main view scroll position and selection state
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  X,
  FileText,
  GitCompareArrows,
  Upload,
  Settings,
  Kanban,
  Maximize2,
  Minimize2,
  Info,
  Calendar,
  Clock,
  User,
  Shield,
  Link,
  Percent,
  Flag,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useScheduleStore } from '../../stores/useScheduleStore';
import MiniKanban from '../drilldown/MiniKanban';
import type { WBSRow } from '../../types/wbs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Drawer content panel types.
 */
export type DrawerPanel = 'CDRL' | 'BCR' | 'ARTIFACTS' | 'SETTINGS' | 'KANBAN' | 'TASK_INFO' | 'CUSTOM';

/**
 * Panel configuration: icon, label.
 */
const PANEL_CONFIG: Record<Exclude<DrawerPanel, 'CUSTOM'>, { icon: React.ReactNode; label: string }> = {
  KANBAN: {
    icon: <Kanban size={14} />,
    label: 'Sprint Kanban',
  },
  TASK_INFO: {
    icon: <Info size={14} />,
    label: 'Task Info',
  },
  CDRL: {
    icon: <FileText size={14} />,
    label: 'CDRL Reviews',
  },
  BCR: {
    icon: <GitCompareArrows size={14} />,
    label: 'BCR Change Diffs',
  },
  ARTIFACTS: {
    icon: <Upload size={14} />,
    label: 'Artifact Vault',
  },
  SETTINGS: {
    icon: <Settings size={14} />,
    label: 'Settings',
  },
};

/**
 * Props for the slide-over drawer.
 */
export interface SlideOverDrawerProps {
  /** Whether the drawer is open */
  open: boolean;
  /** Callback to close the drawer */
  onClose: () => void;
  /** Initial panel to show */
  initialPanel?: DrawerPanel;
  /** Custom panel title (for CUSTOM panel type) */
  title?: string;
  /** Custom panel content */
  children?: React.ReactNode;
  /** Drawer width in pixels */
  width?: number;
}

/**
 * Props for a panel section within the drawer.
 */
export interface DrawerPanelProps {
  /** Panel identifier */
  panel: DrawerPanel;
  /** Custom title for CUSTOM panels */
  title?: string;
  /** Custom content for CUSTOM panels */
  children?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default drawer width */
const DEFAULT_WIDTH = 480;

/** Minimum drawer width */
const MIN_WIDTH = 320;

/** Maximum drawer width */
const MAX_WIDTH = 800;

// ---------------------------------------------------------------------------
// CDRL Review Panel (placeholder)
// ---------------------------------------------------------------------------

const CDRLPanel: React.FC = () => {
  return (
    <div className="p-4">
      <div className="text-sm text-text-ops-muted mb-4">
        Contract Deliverables (CDRL/SDRL) tracking and review.
      </div>

      {/* CDRL list placeholder */}
      <div className="space-y-2">
        {[
          { seq: 'CDRL-A004', title: 'Project Management Plan', status: 'ACCEPTED', revision: 'Rev C' },
          { seq: 'CDRL-B001', title: 'Systems Safety Report', status: 'UNDER_REVIEW', revision: 'Rev A' },
          { seq: 'CDRL-C002', title: 'Test Integration Plan', status: 'DRAFTING', revision: 'Rev A' },
        ].map((cdrl) => (
          <div
            key={cdrl.seq}
            className="p-3 rounded-md border border-border-ops-subtle bg-bg-ops-overlay/50 hover:bg-bg-ops-overlay transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-mono text-text-ops-primary">{cdrl.seq}</span>
              <span
                className={clsx(
                  'px-2 py-0.5 text-xs font-mono rounded',
                  cdrl.status === 'ACCEPTED' && 'bg-emerald-900/30 text-emerald-400',
                  cdrl.status === 'UNDER_REVIEW' && 'bg-amber-900/30 text-amber-400',
                  cdrl.status === 'DRAFTING' && 'bg-sky-900/30 text-sky-400',
                )}
              >
                {cdrl.status}
              </span>
            </div>
            <div className="text-sm text-text-ops-primary truncate">{cdrl.title}</div>
            <div className="text-xs text-text-ops-muted mt-1">{cdrl.revision}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// BCR Change Diff Panel (placeholder)
// ---------------------------------------------------------------------------

const BCRPanel: React.FC = () => {
  return (
    <div className="p-4">
      <div className="text-sm text-text-ops-muted mb-4">
        Baseline Change Request (BCR) comparison and approval workflow.
      </div>

      {/* BCR list placeholder */}
      <div className="space-y-2">
        {[
          { number: 'BCR-2026-001', title: 'Schedule Slip: RF Testing', tier: 'TIER_2', status: 'UNDER_REVIEW' },
          { number: 'BCR-2026-002', title: 'Scope Addition: Cyber Security', tier: 'TIER_3', status: 'DRAFT' },
        ].map((bcr) => (
          <div
            key={bcr.number}
            className="p-3 rounded-md border border-border-ops-subtle bg-bg-ops-overlay/50 hover:bg-bg-ops-overlay transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-mono text-text-ops-primary">{bcr.number}</span>
              <span
                className={clsx(
                  'px-2 py-0.5 text-xs font-mono rounded',
                  bcr.status === 'APPROVED' && 'bg-emerald-900/30 text-emerald-400',
                  bcr.status === 'UNDER_REVIEW' && 'bg-amber-900/30 text-amber-400',
                  bcr.status === 'DRAFT' && 'bg-sky-900/30 text-sky-400',
                  bcr.status === 'REJECTED' && 'bg-red-900/30 text-red-400',
                )}
              >
                {bcr.status}
              </span>
            </div>
            <div className="text-sm text-text-ops-primary truncate">{bcr.title}</div>
            <div className="text-xs text-text-ops-muted mt-1">Tier: {bcr.tier}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Artifact Vault Panel (placeholder)
// ---------------------------------------------------------------------------

const ArtifactsPanel: React.FC = () => {
  return (
    <div className="p-4">
      <div className="text-sm text-text-ops-muted mb-4">
        Classified document vault — upload and manage evidence artifacts.
      </div>

      {/* Upload area */}
      <div className="border-2 border-dashed border-border-ops-subtle rounded-lg p-8 text-center mb-4 hover:border-border-ops-strong transition-colors cursor-pointer">
        <Upload size={32} className="mx-auto mb-2 text-text-ops-muted" />
        <p className="text-sm text-text-ops-primary">Click to upload or drag and drop</p>
        <p className="text-xs text-text-ops-muted mt-1">
          Files are encrypted with AES-256 SSE-S3
        </p>
      </div>

      {/* Recent artifacts placeholder */}
      <div className="space-y-2">
        {[
          { name: 'safety_report_rev3.pdf', size: '2.4 MB', classification: 'SECRET' },
          { name: 'test_results_atp.xlsx', size: '856 KB', classification: 'OFFICIAL_SENSITIVE' },
        ].map((artifact) => (
          <div
            key={artifact.name}
            className="flex items-center gap-3 p-2 rounded-md border border-border-ops-subtle bg-bg-ops-overlay/30"
          >
            <FileText size={14} className="text-text-ops-muted flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-text-ops-primary truncate">{artifact.name}</div>
              <div className="text-xs text-text-ops-muted">{artifact.size}</div>
            </div>
            <span
              className={clsx(
                'px-1.5 py-0.5 text-xs font-mono rounded',
                artifact.classification === 'SECRET' && 'bg-red-900/30 text-red-400',
                artifact.classification === 'OFFICIAL_SENSITIVE' && 'bg-cyan-900/30 text-cyan-400',
                artifact.classification === 'OFFICIAL' && 'bg-sky-900/30 text-sky-400',
              )}
            >
              {artifact.classification}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Task Info Panel
// ---------------------------------------------------------------------------

const TaskInfoPanel: React.FC<{ row: WBSRow | null }> = ({ row }) => {
  if (!row) {
    return (
      <div className="p-4">
        <div className="text-sm text-text-ops-muted">
          No task selected. Right-click a task and choose "Task Information..." to view details.
        </div>
      </div>
    );
  }

  const formatDate = (d: string | null | undefined) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const duration = (() => {
    const start = row.early_start || row.planned_start_date;
    const end = row.early_finish || row.planned_end_date;
    if (!start || !end) return null;
    const diff = new Date(end).getTime() - new Date(start).getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return `${days} days`;
  })();

  const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value: string | React.ReactNode }> = ({ icon, label, value }) => (
    <div className="flex items-start gap-3 py-2">
      <div className="text-text-ops-muted mt-0.5 flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-text-ops-muted">{label}</div>
        <div className="text-sm text-text-ops-primary break-words">{value}</div>
      </div>
    </div>
  );

  const assignedTo = (row.custom_attributes as Record<string, unknown>)?.assigned_to || null;
  const predecessors = (row.custom_attributes as Record<string, unknown>)?.predecessors || null;
  const description = (row.custom_attributes as Record<string, unknown>)?.description || null;

  return (
    <div className="p-4 space-y-1 overflow-y-auto">
      {/* Title */}
      <div className="pb-3 mb-3 border-b border-border-ops-subtle">
        <div className="text-xs text-text-ops-muted mb-1">Task Name</div>
        <div className="text-base font-semibold text-text-ops-primary">{row.name || 'Untitled'}</div>
        <div className="text-xs font-mono text-text-ops-muted mt-1">{row.code}</div>
        <div className="text-xs font-mono text-text-ops-muted">Path: {row.path}</div>
      </div>

      {/* Key details */}
      <InfoRow icon={<Calendar size={14} />} label="Planned Start" value={formatDate(row.planned_start_date)} />
      <InfoRow icon={<Calendar size={14} />} label="Planned End" value={formatDate(row.planned_end_date)} />
      <InfoRow icon={<Calendar size={14} />} label="Actual Start" value={formatDate(row.actual_start_date)} />
      <InfoRow icon={<Calendar size={14} />} label="Actual End" value={formatDate(row.actual_end_date)} />
      <InfoRow icon={<Clock size={14} />} label="Duration" value={duration || '—'} />
      <InfoRow icon={<Percent size={14} />} label="Progress" value={`${row.percent_complete ?? 0}%`} />
      <InfoRow icon={<User size={14} />} label="Assigned To" value={assignedTo ? String(assignedTo) : 'Unassigned'} />
      <InfoRow icon={<Flag size={14} />} label="Delivery Mode" value={row.delivery_mode || '—'} />
      <InfoRow icon={<Shield size={14} />} label="Classification" value={row.security_classification || '—'} />
      <InfoRow icon={<Link size={14} />} label="Predecessors" value={predecessors ? String(predecessors) : 'None'} />
      <InfoRow icon={<Info size={14} />} label="Scheduling Mode" value={row.scheduling_mode || 'AUTO'} />
      <InfoRow icon={<Info size={14} />} label="EVM Technique" value={row.evm_technique || '—'} />

      {/* Description */}
      {description && (
        <div className="pt-3 mt-3 border-t border-border-ops-subtle">
          <div className="text-xs text-text-ops-muted mb-1">Description</div>
          <div className="text-sm text-text-ops-primary whitespace-pre-wrap">{String(description)}</div>
        </div>
      )}

      {/* Progress bar */}
      <div className="pt-3 mt-3 border-t border-border-ops-subtle">
        <div className="text-xs text-text-ops-muted mb-2">Completion Progress</div>
        <div className="w-full h-2 bg-bg-ops-overlay rounded-full overflow-hidden">
          <div
            className="h-full bg-sky-500 rounded-full transition-all"
            style={{ width: `${row.percent_complete ?? 0}%` }}
          />
        </div>
        <div className="text-xs text-text-ops-muted mt-1">{row.percent_complete ?? 0}% complete</div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Settings Panel (placeholder)
// ---------------------------------------------------------------------------

const SettingsPanel: React.FC = () => {
  return (
    <div className="p-4">
      <div className="text-sm text-text-ops-muted mb-4">
        Task-specific settings and configuration.
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Delivery Mode</label>
          <select className="w-full px-3 py-2 text-sm bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary focus:outline-none focus:ring-1 focus:ring-sky-500">
            <option value="WATERFALL">WATERFALL</option>
            <option value="AGILE">AGILE</option>
            <option value="HYBRID">HYBRID</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-text-ops-muted mb-1">EVM Technique</label>
          <select className="w-full px-3 py-2 text-sm bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary focus:outline-none focus:ring-1 focus:ring-sky-500">
            <option value="PERCENT_COMPLETE">Percent Complete</option>
            <option value="ZERO_100">0/100 Rule</option>
            <option value="FIFTY_FIFTY">50/50 Rule</option>
            <option value="MILESTONE_WEIGHTS">Milestone Weights</option>
            <option value="LEVEL_OF_EFFORT">Level of Effort</option>
          </select>
        </div>

        <div className="flex items-center justify-between p-3 rounded-md border border-border-ops-subtle bg-bg-ops-overlay/30">
          <span className="text-sm text-text-ops-primary">Requires V&V Signoff</span>
          <button
            className="w-10 h-5 bg-bg-ops-overlay rounded-full relative transition-colors"
            role="switch"
            aria-checked={false}
          >
            <span className="absolute left-0.5 top-0.5 w-4 h-4 bg-text-ops-muted rounded-full transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const SlideOverDrawer: React.FC<SlideOverDrawerProps> = ({
  open,
  onClose,
  initialPanel = 'CDRL',
  title,
  children,
  width: propWidth = DEFAULT_WIDTH,
}) => {
  const [activePanel, setActivePanel] = useState<DrawerPanel>(initialPanel);
  const [drawerWidth, setDrawerWidth] = useState(propWidth);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Reset panel when drawer opens
  useEffect(() => {
    if (open) {
      setActivePanel(initialPanel);
    }
  }, [open, initialPanel]);

  // Escape key handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    },
    [open, onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Resize handler
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - e.clientX));
      setDrawerWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const selectedRow = useScheduleStore((s) => {
    const id = s.selectedNodeId;
    return id ? s.rows.find((r) => r.id === id) || null : null;
  });

  // Backdrop click handler
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!open) return null;

  // Render the active panel content
  const renderPanelContent = () => {
    if (activePanel === 'CUSTOM' && children) {
      return <div className="flex-1 overflow-y-auto">{children}</div>;
    }

    switch (activePanel) {
      case 'KANBAN':
        return (
          <div className="flex-1 overflow-hidden p-2 h-full">
            <MiniKanban
              selectedRow={selectedRow}
              isFullScreen={isFullScreen}
              onToggleFullScreen={() => setIsFullScreen((prev) => !prev)}
            />
          </div>
        );
      case 'CDRL':
        return <CDRLPanel />;
      case 'BCR':
        return <BCRPanel />;
      case 'ARTIFACTS':
        return <ArtifactsPanel />;
      case 'TASK_INFO':
        return <TaskInfoPanel row={selectedRow} />;
      case 'SETTINGS':
        return <SettingsPanel />;
      default:
        return <CDRLPanel />;
    }
  };

  const panelLabel =
    activePanel === 'CUSTOM'
      ? title || 'Configuration'
      : PANEL_CONFIG[activePanel as keyof typeof PANEL_CONFIG]?.label || 'Configuration';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={clsx(
          'fixed top-0 right-0 h-full z-50 flex flex-col',
          'bg-bg-ops-surface border-l border-border-ops-subtle',
          'shadow-2xl transition-all duration-200 ease-out',
          isFullScreen && '!w-full !max-w-full border-l-0',
        )}
        style={{
          width: isFullScreen ? '100vw' : `${drawerWidth}px`,
          maxWidth: isFullScreen ? '100vw' : '100vw',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={panelLabel}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-ops-subtle bg-bg-ops-overlay">
          <div className="flex items-center gap-2">
            {activePanel !== 'CUSTOM' && PANEL_CONFIG[activePanel as keyof typeof PANEL_CONFIG]?.icon}
            {activePanel === 'CUSTOM' && <Settings size={14} className="text-text-ops-muted" />}
            <span className="text-sm font-semibold text-text-ops-primary">{panelLabel}</span>
            {isFullScreen && (
              <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-950 border border-sky-700 text-sky-300">
                FULL SCREEN
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Panel switcher */}
            <select
              value={activePanel}
              onChange={(e) => setActivePanel(e.target.value as DrawerPanel)}
              className="px-2 py-1 text-xs font-mono bg-bg-ops-surface border border-border-ops-subtle rounded text-text-ops-primary focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              {Object.entries(PANEL_CONFIG).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.label}
                </option>
              ))}
              {activePanel === 'CUSTOM' && (
                <option value="CUSTOM">{title || 'Custom'}</option>
              )}
            </select>

            {/* Full screen toggle */}
            <button
              type="button"
              onClick={() => setIsFullScreen((prev) => !prev)}
              className={clsx(
                'p-1.5 rounded-md transition-colors',
                isFullScreen
                  ? 'text-sky-400 bg-sky-950/60 hover:bg-sky-900/60'
                  : 'text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay',
              )}
              title={isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
              aria-label={isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
            >
              {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
              aria-label="Close drawer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Panel tabs (quick switch) */}
        <div className="flex items-center border-b border-border-ops-subtle bg-bg-ops-surface">
          {Object.entries(PANEL_CONFIG).map(([key, config]) => {
            const isActive = activePanel === key;
            return (
              <button
                key={key}
                onClick={() => setActivePanel(key as DrawerPanel)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors',
                  isActive
                    ? 'border-sky-500 text-text-ops-primary'
                    : 'border-transparent text-text-ops-muted hover:text-text-ops-primary',
                )}
              >
                {config.icon}
                <span className="hidden sm:inline">{config.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {renderPanelContent()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border-ops-subtle bg-bg-ops-overlay/50 text-xs text-text-ops-muted">
          <span>{isFullScreen ? 'Full-screen mode' : 'Slide-over drawer — main view preserved'}</span>
          <span className="font-mono">{isFullScreen ? '100vw' : `${drawerWidth}px`}</span>
        </div>

        {/* Resize handle */}
        {!isFullScreen && (
          <div
            className="absolute left-0 top-0 w-1 h-full cursor-col-resize hover:bg-sky-500/30 transition-colors"
            onMouseDown={handleResizeStart}
            aria-label="Resize drawer"
            role="separator"
            tabIndex={0}
          />
        )}
      </div>
    </>
  );
};

export default SlideOverDrawer;
