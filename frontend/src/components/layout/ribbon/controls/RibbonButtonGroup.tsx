/**
 * RibbonButtonGroup Component
 *
 * Stacked small buttons for paired actions (e.g., Indent / Outdent, Link / Unlink).
 *
 * Features
 * --------
 * - Vertical stack of small icon+label buttons.
 * - Shared border and hover styling.
 * - Disabled state support.
 *
 * Usage
 * -----
 *
 * ```tsx
 * <RibbonButtonGroup
 *   buttons={[
 *     { id: 'indent', icon: 'Indent', label: 'Indent', onClick: handleIndent },
 *     { id: 'outdent', icon: 'Outdent', label: 'Outdent', onClick: handleOutdent },
 *   ]}
 * />
 * ```
 */

import React from 'react';
import * as LucideIcons from 'lucide-react';
import { clsx } from 'clsx';

interface RibbonButton {
  /** Unique button identifier */
  id: string;
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
}

interface RibbonButtonGroupProps {
  /** Array of buttons to render */
  buttons: RibbonButton[];
  /** Additional CSS class */
  className?: string;
}

export const RibbonButtonGroup: React.FC<RibbonButtonGroupProps> = ({
  buttons,
  className,
}) => {
  return (
    <div className={clsx('flex flex-col gap-0.5', className)}>
      {buttons.map((btn) => {
        const IconComponent = btn.icon ? (LucideIcons as any)[btn.icon] : null;

        return (
          <button
            key={btn.id}
            type="button"
            onClick={btn.onClick}
            disabled={btn.disabled}
            title={btn.tooltip || btn.label}
            className={clsx(
              'flex items-center gap-2 rounded px-2 py-1 text-left transition-colors',
              'hover:bg-ops-overlay focus:outline-none focus:ring-1 focus:ring-blue-500',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            {IconComponent && (
              <IconComponent
                className="text-text-ops-muted shrink-0"
                size={16}
                strokeWidth={1.5}
              />
            )}
            <span className="text-xs text-text-ops-primary">{btn.label}</span>
            {btn.shortcut && (
              <kbd className="ml-auto text-[9px] text-text-ops-muted bg-ops-base border border-ops-subtle px-1 py-0.5 rounded">
                {btn.shortcut}
              </kbd>
            )}
          </button>
        );
      })}
    </div>
  );
};
