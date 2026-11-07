/**
 * RibbonActionDeck Component
 *
 * The 92px action deck that renders beneath the ribbon tab strip.
 *
 * Features
 * --------
 * - Renders the active tab's registered action chunks horizontally.
 * - Each chunk is a RibbonChunk with action buttons and a caption.
 * - Supports both legacy RibbonActionGroup format and Action Registry format.
 *
 * Usage
 * -----
 *
 * ```tsx
 * <RibbonActionDeck
 *   actionGroups={ribbonContext.actionGroups}
 *   actionContext={actionContext}
 * />
 * ```
 */

import React, { useMemo } from 'react';
import { clsx } from 'clsx';
import { RibbonChunk } from './RibbonChunk';
import { RibbonLargeButton } from './controls/RibbonLargeButton';
import { RibbonSmallButton } from './controls/RibbonSmallButton';
import { RibbonSplitButton } from './controls/RibbonSplitButton';
import { actionRegistry } from '../../../core/actions/ActionRegistry';
import RibbonActionRenderer from '../../../core/actions/RibbonActionRenderer';
import type { RibbonActionGroup } from './useRibbonContext';
import type { ActionContext } from '../../../core/actions/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RibbonActionDeckProps {
  /** Legacy action groups from useRibbonContext */
  actionGroups: RibbonActionGroup[];
  /** Action Registry context for registry-based rendering */
  actionContext?: ActionContext;
  /** Map of ribbon tab IDs to registry categories */
  tabToCategories?: Record<string, string[]>;
  /** Currently active ribbon tab ID */
  activeTabId?: string;
  /** Additional CSS class */
  className?: string;
}

// ---------------------------------------------------------------------------
// RibbonActionDeck
// ---------------------------------------------------------------------------

/**
 * Renders the 92px action deck with action chunks.
 */
export const RibbonActionDeck: React.FC<RibbonActionDeckProps> = ({
  actionGroups,
  actionContext,
  tabToCategories,
  activeTabId,
  className,
}) => {
  // Get registry-based action groups for the active tab
  const registryActionGroups = useMemo(() => {
    if (!actionContext || !tabToCategories || !activeTabId) return [];
    const categories = tabToCategories[activeTabId] || [];
    return categories.map((cat) => ({
      caption: cat,
      actions: actionRegistry.getActionsForCategory(cat as any, actionContext),
    }));
  }, [activeTabId, actionContext, tabToCategories]);

  return (
    <div
      className={clsx(
        'flex items-stretch overflow-x-auto bg-ops-surface',
        className,
      )}
      style={{ height: '92px' }}
    >
      {/* Registry-based action chunks */}
      {registryActionGroups.map((group, idx) => (
        <RibbonChunk
          key={`reg-${group.caption}`}
          caption={group.caption}
          showDivider={group.actions.length > 0}
        >
          {group.actions.map((action) => (
            <RibbonActionRenderer
              key={action.id}
              action={action}
              context={actionContext!}
            />
          ))}
        </RibbonChunk>
      ))}

      {/* Legacy action chunks (fallback) */}
      {actionGroups.map((group, idx) => (
        <RibbonChunk
          key={`legacy-${group.caption}`}
          caption={group.caption}
          showDivider={group.actions.length > 0}
        >
          {group.actions.map((action) => (
            <LegacyActionRenderer key={action.id} action={action} />
          ))}
        </RibbonChunk>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Legacy Action Renderer
// ---------------------------------------------------------------------------

/**
 * Render a single legacy ribbon action based on its type.
 */
const LegacyActionRenderer: React.FC<{ action: any }> = ({ action }) => {
  if (action.isLarge) {
    return (
      <RibbonLargeButton
        icon={action.icon}
        label={action.label}
        onClick={action.onClick}
        shortcut={action.shortcut}
        disabled={!action.enabled}
        tooltip={action.tooltip}
      />
    );
  }

  if (action.isSplit && action.dropdownItems) {
    return (
      <RibbonSplitButton
        icon={action.icon}
        label={action.label}
        onPrimaryAction={action.onClick}
        dropdownItems={action.dropdownItems}
        disabled={!action.enabled}
        tooltip={action.tooltip}
      />
    );
  }

  // Default: small button
  return (
    <RibbonSmallButton
      icon={action.icon}
      label={action.label}
      onClick={action.onClick}
      shortcut={action.shortcut}
      disabled={!action.enabled}
      tooltip={action.tooltip}
    />
  );
};
