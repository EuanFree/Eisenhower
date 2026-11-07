/**
 * RibbonSmallButton Component
 *
 * A compact inline button for ribbon action chunks.
 *
 * Features
 * --------
 * - Height: 22px.
 * - Inline row layout: 14px Lucide icon + 1-line label (text-[11px]).
 * - Disabled state with reduced opacity.
 * - Hover and active states with Defence Design Token colors.
 *
 * Usage
 * -----
 *
 * ```tsx
 * <RibbonSmallButton
 *   icon="Link"
 *   label="Link Selected"
 *   onClick={handleLink}
 *   shortcut="Ctrl+F2"
 * />
 * ```
 */

import React from 'react';
import * as LucideIcons from 'lucide-react';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RibbonSmallButtonProps {
  /** Icon name from lucide-react */
  icon?: string;
  /** Button label */
  label: string;
  /** Click handler */
  onClick: () => void;
  /** Keyboard shortcut hint */
  shortcut?: string;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Tooltip text */
  tooltip?: string;
  /** Additional CSS class */
  className?: string;
}

// ---------------------------------------------------------------------------
// RibbonSmallButton
// ---------------------------------------------------------------------------

/**
 * Renders a compact inline ribbon button.
 */
export const RibbonSmallButton: React.FC<RibbonSmallButtonProps> = ({
  icon,
  label,
  onClick,
  shortcut,
  disabled = false,
  tooltip,
  className,
}) => {
  const IconComponent = icon ? (LucideIcons as any)[icon] : null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tooltip || label}
      className={clsx(
        'flex items-center gap-1.5 h-[22px] rounded px-2 transition-colors',
        'hover:bg-ops-overlay focus:outline-none focus:ring-1 focus:ring-blue-500',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      )}
    >
      {IconComponent && (
        <IconComponent
          className="text-text-ops-muted shrink-0"
          size={14}
          strokeWidth={1.5}
        />
      )}
      <span className="text-[11px] text-text-ops-primary whitespace-nowrap">
        {label}
      </span>
      {shortcut && (
        <kbd className="text-[9px] text-text-ops-muted bg-ops-base border border-ops-subtle px-1 py-0 rounded">
          {shortcut}
        </kbd>
      )}
    </button>
  );
};
