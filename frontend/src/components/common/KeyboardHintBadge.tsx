/**
 * Keyboard Hint Badge Component
 *
 * Renders a styled keyboard shortcut badge for display in context menus,
 * tooltips, and help documentation.
 *
 * The badge uses the Defence Design Token System colors:
 * bg-ops-surface background with border-ops-strong border, matching
 * the military dark theme.
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    <MenuItem icon={<Link />} label="Link Selected" shortcut="Ctrl+F2" />
 *
 *    // Renders:
 *    // [Link] Link Selected          [Ctrl+F2]
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the keyboard hint badge component.
 */
export interface KeyboardHintBadgeProps {
  /** The shortcut text to display (e.g., "Ctrl+F2", "Alt+Shift+Right") */
  shortcut: string;
  /** Optional additional CSS class */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders a keyboard shortcut badge with monospace font and subtle styling.
 *
 * The badge is designed to be placed inline with menu item labels, tooltips,
 * or help text. It uses the Defence Design Token System for consistent
 * theming across all density tiers.
 *
 * @param shortcut - The shortcut text to display
 * @param className - Optional additional CSS class
 */
const KeyboardHintBadge: React.FC<KeyboardHintBadgeProps> = ({
  shortcut,
  className = '',
}) => {
  return (
    <kbd
      className={`text-xs font-mono bg-ops-surface border border-ops-strong px-1.5 py-0.5 rounded text-text-ops-muted select-text ${className}`}
      tabIndex={-1}
    >
      {shortcut}
    </kbd>
  );
};

export default KeyboardHintBadge;
