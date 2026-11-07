/**
 * RibbonContainer Component
 *
 * The Microsoft Project–style dynamic contextual ribbon.
 *
 * Layout & Positioning
 * --------------------
 * - Spans the full viewport width beneath the top shell header.
 *
 * Collapsibility
 * --------------
 * - Double-clicking any tab header or pressing Ctrl+F1 toggles isCollapsed.
 * - When collapsed, hide the 92px action deck.
 * - Clicking any tab in collapsed mode opens the action chunk deck as an
 *   absolute-positioned floating overlay (z-40, bg-ops-surface, border-ops-strong).
 *
 * Structure
 * ---------
 * - Top Tab Strip: RibbonTabStrip with active tab cyan underline.
 * - Bottom Action Deck: RibbonActionDeck (92px) with RibbonChunk containers.
 *
 * Dynamic Context
 * ---------------
 * - Ribbon tabs and actions change based on the active workspace view type.
 * - Actions are wired to ActionRegistry for ABAC-aware availability.
 *
 * Usage
 * -----
 *
 * ```tsx
 * <RibbonContainer callbacks={ribbonCallbacks} />
 * ```
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Undo2, Redo2, ChevronUp, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { useRibbonContext, type RibbonActionGroup } from './useRibbonContext';
import { RibbonTabStrip } from './RibbonTabStrip';
import { RibbonActionDeck } from './RibbonActionDeck';
import { actionRegistry } from '../../../core/actions/ActionRegistry';
import type { ActionContext } from '../../../core/actions/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Callbacks for ribbon actions */
export interface RibbonCallbacks {
  onIndent?: () => void;
  onOutdent?: () => void;
  onInsertTask?: () => void;
  onDelete?: () => void;
  onLink?: () => void;
  onUnlink?: () => void;
  onToggleMilestone?: () => void;
  onMarkProgress?: (percent: number) => void;
  onFlagBlocker?: () => void;
  onRunCpm?: () => void;
  onRunMonteCarlo?: () => void;
  onFreezeBaseline?: () => void;
  onExportIpmr?: () => void;
  onExportBriefing?: () => void;
  onOpenColumnCustomizer?: () => void;
  onOpenCommandPalette?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onOpenCreateWorkItem?: () => void;
  onOpenCreateResource?: () => void;
  onLogHours?: () => void;
  onClaimTask?: () => void;
  onRunLeveling?: () => void;
  onRunSweep?: () => void;
  onResolveClash?: () => void;
  onOpenFilterToolbar?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomToFit?: () => void;
  onToggleBaseline?: () => void;
  onToggleDependencies?: () => void;
  onToggleDropLine?: () => void;
  onTogglePresence?: () => void;
  onOpenReservationModal?: () => void;
  onOpenCalibrationModal?: () => void;
}

/** Ribbon collapse state */
type RibbonCollapseState = 'EXPANDED' | 'COLLAPSED';

// ---------------------------------------------------------------------------
// RibbonContainer
// ---------------------------------------------------------------------------

export interface RibbonContainerProps {
  /** Callback functions for ribbon actions */
  callbacks?: RibbonCallbacks;
  /** Additional CSS class */
  className?: string;
}

/**
 * Main ribbon container with collapsible state and floating overlay mode.
 */
export const RibbonContainer: React.FC<RibbonContainerProps> = ({
  callbacks = {},
  className,
}) => {
  const ribbonContext = useRibbonContext(callbacks);

  // Build ActionContext from current state for the Action Registry
  const actionContext: ActionContext = useMemo(() => ({
    selectedNodeIds: [],
    selectedNode: undefined,
    activeViewType: ribbonContext.activeViewType || '',
    userClearance: 'SECRET',
    userRoles: ['USER'],
    isBaselineLocked: false,
    dispatch: (_action, _payload) => {},
    executeCommand: async (_command) => {},
  }), [ribbonContext.activeViewType]);

  // Map ribbon tab IDs to registry categories
  const tabToCategories: Record<string, string[]> = useMemo(() => ({
    'task': ['STRUCTURE', 'SCHEDULE'],
    'precedence': ['SCHEDULE'],
    'gantt-view': ['SYSTEM'],
    'evm-finance': ['EVM'],
    'governance': ['GOVERNANCE'],
    'my-work': ['PROGRESS'],
    'timesheet': ['PROGRESS'],
    'blockers': ['PROGRESS'],
    'simulation': ['RISK'],
    'sensitivity': ['RISK'],
    'reporting': ['EVM', 'GOVERNANCE'],
    'reservation': ['FACILITY'],
    'environmental': ['FACILITY'],
    'buffers': ['FACILITY'],
    'clash-triage': ['RISK'],
    'dashboard-builder': ['SYSTEM'],
    'dashboard-layout': ['SYSTEM'],
    'dashboard-view': ['SYSTEM'],
  }), []);

  const [collapseState, setCollapseState] = useState<RibbonCollapseState>('EXPANDED');
  const [floatingTabId, setFloatingTabId] = useState<string | null>(null);
  const lastInteractionRef = useRef<number>(Date.now());

  // Ctrl+F1 to toggle collapse
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'F1') {
        e.preventDefault();
        toggleCollapse();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close floating overlay on Escape
  useEffect(() => {
    if (!floatingTabId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFloatingTabId(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [floatingTabId]);

  const toggleCollapse = useCallback(() => {
    setCollapseState((prev) =>
      prev === 'EXPANDED' ? 'COLLAPSED' : 'EXPANDED',
    );
    setFloatingTabId(null);
  }, []);

  // Handle tab click: in collapsed mode, open floating overlay
  const handleTabClick = useCallback((tabId: string) => {
    ribbonContext.setActiveTab(tabId);
    handleInteraction();
    if (collapseState === 'COLLAPSED') {
      setFloatingTabId((prev) => (prev === tabId ? null : tabId));
    }
  }, [collapseState, ribbonContext]);

  // Track interaction to reset auto-collapse timer
  const handleInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now();
  }, []);

  // Auto-collapse after 30 seconds of inactivity
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      if (now - lastInteractionRef.current > 30000 && collapseState === 'EXPANDED') {
        setCollapseState('COLLAPSED');
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [collapseState]);

  // Quick access toolbar buttons
  const quickAccessToolbar = (
    <>
      <button
        type="button"
        onClick={() => callbacks.onUndo?.()}
        title="Undo (Ctrl+Z)"
        className="rounded p-1 text-text-ops-muted hover:bg-ops-overlay hover:text-text-ops-primary transition-colors"
      >
        <Undo2 size={14} />
      </button>
      <button
        type="button"
        onClick={() => callbacks.onRedo?.()}
        title="Redo (Ctrl+Y)"
        className="rounded p-1 text-text-ops-muted hover:bg-ops-overlay hover:text-text-ops-primary transition-colors"
      >
        <Redo2 size={14} />
      </button>
    </>
  );

  return (
    <div
      className={clsx(
        'flex flex-col bg-ops-surface border-b border-ops-strong relative',
        className,
      )}
      onMouseMove={handleInteraction}
      onClick={handleInteraction}
    >
      {/* Tab Strip */}
      <RibbonTabStrip
        tabs={ribbonContext.tabs}
        activeTabId={ribbonContext.activeTabId}
        onTabClick={handleTabClick}
        onDoubleClick={toggleCollapse}
        quickAccessToolbar={quickAccessToolbar}
      />

      {/* Expanded Action Deck */}
      {collapseState === 'EXPANDED' && (
        <RibbonActionDeck
          actionGroups={ribbonContext.actionGroups}
          actionContext={actionContext}
          tabToCategories={tabToCategories}
          activeTabId={ribbonContext.activeTabId}
        />
      )}

      {/* Floating Overlay Action Deck (collapsed mode) */}
      {collapseState === 'COLLAPSED' && floatingTabId && (
        <div
          className="absolute left-0 top-full z-40 w-full border border-ops-strong bg-ops-surface shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <RibbonActionDeck
            actionGroups={ribbonContext.actionGroups}
            actionContext={actionContext}
            tabToCategories={tabToCategories}
            activeTabId={floatingTabId}
          />
        </div>
      )}

      {/* Collapse toggle button */}
      <button
        type="button"
        onClick={toggleCollapse}
        className="absolute right-2 top-0.5 z-10 rounded p-1 text-text-ops-muted hover:bg-ops-overlay hover:text-text-ops-primary transition-colors"
        title={collapseState === 'EXPANDED' ? 'Collapse Ribbon (Ctrl+F1)' : 'Expand Ribbon (Ctrl+F1)'}
      >
        {collapseState === 'EXPANDED' ? (
          <ChevronUp size={12} />
        ) : (
          <ChevronDown size={12} />
        )}
      </button>
    </div>
  );
};
