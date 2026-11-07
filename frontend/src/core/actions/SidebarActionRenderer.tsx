/**
 * Sidebar Action Renderer Component
 *
 * Renders navigation items in the AppSidebar with primary click (in-place
 * tab opening) and secondary hover/flyout options (detach to new window,
 * open in split pane).
 *
 * Interaction Mechanics
 * ---------------------
 *
 * 1. **Left Click** — Opens the view in the active workspace tab.
 * 2. **Middle Click / Ctrl+Click** — Detaches the view into a new browser
 *    window via `window.open()`.
 * 3. **Right Click** — Opens a context menu with options:
 *    - Open in Active Tab
 *    - Open in Split Pane (Right)
 *    - Open in New Browser Window
 *
 * Usage
 * -----
 *
 * ```tsx
 * <SidebarActionRenderer
 *   action={wbsGanttAction}
 *   context={actionContext}
 *   onOpenInTab={() => openView('WBS_GANTT')}
 *   onOpenInSplit={() => openView('WBS_GANTT', {}, 'SPLIT_RIGHT')}
 *   onDetach={() => detachViewToWindow('WBS_GANTT')}
 * />
 * ```
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as LucideIcons from 'lucide-react';
import { clsx } from 'clsx';
import type { ActionDefinition, ActionContext } from './types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SidebarActionRendererProps {
  /** The action definition to render */
  action: ActionDefinition;

  /** Current action context */
  context: ActionContext;

  /** Called on primary left click — opens in active workspace tab */
  onOpenInTab: () => void;

  /** Called to open in a split pane */
  onOpenInSplit: () => void;

  /** Called to detach into a new browser window */
  onDetach: () => void;

  /** Whether this action is currently active (highlighted) */
  isActive?: boolean;

  /** Badge count to display (e.g., number of open tabs) */
  badgeCount?: number;

  /** Whether this view is running in a detached window */
  isDetached?: boolean;
}

// ---------------------------------------------------------------------------
// Icon Helper
// ---------------------------------------------------------------------------

function getIconByName(iconName: string): React.ComponentType<{ className?: string }> | undefined {
  return (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[iconName];
}

// ---------------------------------------------------------------------------
// Context Menu
// ---------------------------------------------------------------------------

const SidebarContextMenu: React.FC<{
  position: { x: number; y: number };
  onOpenInTab: () => void;
  onOpenInSplit: () => void;
  onDetach: () => void;
  onClose: () => void;
}> = ({ position, onOpenInTab, onOpenInSplit, onDetach, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{ position: 'fixed', left: position.x, top: position.y, zIndex: 10000 }}
      className="w-48 bg-bg-ops-surface border border-border-ops-strong rounded-md shadow-xl py-1"
    >
      <button
        type="button"
        onClick={() => { onOpenInTab(); onClose(); }}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
      >
        <LucideIcons.Square className="w-4 h-4" />
        Open in Active Tab
      </button>
      <button
        type="button"
        onClick={() => { onOpenInSplit(); onClose(); }}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
      >
        <LucideIcons.Split className="w-4 h-4" />
        Open in Split Pane
      </button>
      <div className="my-1 border-t border-border-ops-subtle" />
      <button
        type="button"
        onClick={() => { onDetach(); onClose(); }}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
      >
        <LucideIcons.ExternalLink className="w-4 h-4" />
        New Browser Window
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Renderer
// ---------------------------------------------------------------------------

/**
 * Sidebar navigation item with primary click and secondary flyout options.
 */
const SidebarActionRenderer: React.FC<SidebarActionRendererProps> = ({
  action,
  context,
  onOpenInTab,
  onOpenInSplit,
  onDetach,
  isActive = false,
  badgeCount,
  isDetached = false,
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const IconComponent = getIconByName(action.icon);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Middle click (button 1) — detach
      if (e.button === 1) {
        e.preventDefault();
        onDetach();
      }
      // Ctrl+Click — detach
      if (e.ctrlKey && e.button === 0) {
        e.preventDefault();
        onDetach();
      }
    },
    [onDetach],
  );

  const handleClick = useCallback(() => {
    onOpenInTab();
  }, [onOpenInTab]);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenInTab();
          }
        }}
        className={clsx(
          'group flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-all',
          'border-l-2',
          isActive
            ? 'bg-bg-ops-overlay border-l-blue-500 text-text-ops-primary'
            : 'border-l-transparent text-text-ops-muted hover:bg-bg-ops-overlay hover:text-text-ops-primary',
        )}
        title={action.description}
        aria-label={action.label}
        aria-current={isActive ? 'page' : undefined}
      >
        {/* Icon */}
        <div className="relative flex-shrink-0">
          {IconComponent && <IconComponent className="w-5 h-5" />}
          {isDetached && (
            <LucideIcons.ExternalLink className="w-3 h-3 absolute -top-1 -right-1 text-amber-500" />
          )}
        </div>

        {/* Label */}
        <span className="text-sm font-medium flex-1 truncate">{action.label}</span>

        {/* Badge */}
        {badgeCount !== undefined && badgeCount > 0 && (
          <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-mono">
            {badgeCount}
          </span>
        )}

        {/* Hover flyout indicator */}
        <LucideIcons.MoreHorizontal className="w-4 h-4 opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <SidebarContextMenu
          position={contextMenu}
          onOpenInTab={onOpenInTab}
          onOpenInSplit={onOpenInSplit}
          onDetach={onDetach}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
};

export default SidebarActionRenderer;
