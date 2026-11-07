/**
 * Context Menu Renderer — Dispatches to the Correct Menu
 *
 * Reads the global context menu state and renders the appropriate menu
 * component based on the targetType discriminator.
 *
 * This component should be rendered once at the root level (e.g., in
 * AppShell) to display the active context menu at the clamped position.
 */

import React, { useCallback } from 'react';
import {
  useContextMenu,
  ContextTargetType,
} from './ContextMenuProvider';
import WbsTaskContextMenu from './WbsTaskContextMenu';
import DependencyLinkContextMenu from './DependencyLinkContextMenu';
import TimelineHeaderContextMenu from './TimelineHeaderContextMenu';
import DailyCockpitContextMenu from './DailyCockpitContextMenu';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Generic action callback signature.
 */
export type ContextActionCallback = (
  targetType: ContextTargetType,
  action: string,
  data: Record<string, unknown>,
) => void;

export interface ContextMenuRendererProps {
  /** Optional global action handler */
  onAction?: ContextActionCallback;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ContextMenuRenderer: React.FC<ContextMenuRendererProps> = ({
  onAction,
}) => {
  const {
    isOpen,
    adjustedPosition,
    targetType,
    targetPayload,
    closeContextMenu,
    menuRef,
  } = useContextMenu();

  const handleAction = useCallback(
    (action: string, data: Record<string, unknown> = {}) => {
      if (targetType) {
        onAction?.(targetType, action, data);
      }
      closeContextMenu();
    },
    [targetType, onAction, closeContextMenu],
  );

  if (!isOpen || !targetType) return null;

  // Fixed positioning portal-style overlay
  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    left: adjustedPosition.x,
    top: adjustedPosition.y,
    zIndex: 9999,
  };

  return (
    <div ref={menuRef} style={containerStyle}>
      {targetType === 'TASK' && (
        <WbsTaskContextMenu
          payload={targetPayload as any}
          onAction={(action, payload) => handleAction(action, payload as any)}
        />
      )}

      {targetType === 'CONTAINER' && (
        <WbsTaskContextMenu
          payload={targetPayload as any}
          onAction={(action, payload) => handleAction(action, payload as any)}
        />
      )}

      {targetType === 'DEPENDENCY_LINK' && (
        <DependencyLinkContextMenu
          payload={targetPayload as any}
          onAction={handleAction}
        />
      )}

      {targetType === 'TIMELINE_HEADER' && (
        <TimelineHeaderContextMenu
          payload={targetPayload as any}
          onAction={handleAction}
        />
      )}

      {targetType === 'KANBAN_CARD' && (
        <DailyCockpitContextMenu
          payload={targetPayload as any}
          onAction={handleAction}
        />
      )}

      {targetType === 'CHAMBER' && (
        <WbsTaskContextMenu
          payload={targetPayload as any}
          onAction={(action, payload) => handleAction(action, payload as any)}
        />
      )}

      {targetType === 'SDRL' && (
        <WbsTaskContextMenu
          payload={targetPayload as any}
          onAction={(action, payload) => handleAction(action, payload as any)}
        />
      )}
    </div>
  );
};

export default ContextMenuRenderer;
