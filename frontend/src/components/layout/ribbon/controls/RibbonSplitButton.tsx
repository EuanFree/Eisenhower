/**
 * RibbonSplitButton Component
 *
 * Dual-part button: Left primary action click + right chevron trigger
 * opening a floating dropdown menu (@floating-ui/react).
 *
 * Features
 * --------
 * - Primary action button on the left.
 * - Dropdown chevron on the right that opens a floating menu.
 * - Uses @floating-ui/react for viewport-safe positioning.
 * - Defence Design Token styling.
 * - Click outside or Escape to dismiss.
 *
 * Usage
 * -----
 *
 * ```tsx
 * <RibbonSplitButton
 *   icon="CheckCircle"
 *   label="Mark Progress"
 *   onPrimaryAction={() => setProgress(100)}
 *   dropdownItems={[
 *     { id: 'p0', label: '0%', onClick: () => setProgress(0) },
 *     { id: 'p25', label: '25%', onClick: () => setProgress(25) },
 *   ]}
 * />
 * ```
 */

import React, { useState, useCallback } from 'react';
import * as LucideIcons from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/react';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DropdownItem {
  /** Unique item identifier */
  id: string;
  /** Display label */
  label: string;
  /** Optional icon name */
  icon?: string;
  /** Click handler */
  onClick: () => void;
}

export interface RibbonSplitButtonProps {
  /** Icon name from lucide-react */
  icon?: string;
  /** Button label */
  label: string;
  /** Primary action handler (left side) */
  onPrimaryAction: () => void;
  /** Dropdown menu items */
  dropdownItems: DropdownItem[];
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Tooltip text */
  tooltip?: string;
  /** Additional CSS class */
  className?: string;
}

// ---------------------------------------------------------------------------
// RibbonSplitButton
// ---------------------------------------------------------------------------

/**
 * Renders a split button with primary action and floating dropdown.
 */
export const RibbonSplitButton: React.FC<RibbonSplitButtonProps> = ({
  icon,
  label,
  onPrimaryAction,
  dropdownItems,
  disabled = false,
  tooltip,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const {
    refs,
    floatingStyles,
    placement,
  } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: 'bottom-start',
    middleware: [offset(4), flip(), shift()],
    whileElementsMounted: autoUpdate,
  });

  const IconComponent = icon ? (LucideIcons as any)[icon] : null;

  const handlePrimaryClick = useCallback(() => {
    onPrimaryAction();
    setIsOpen(false);
  }, [onPrimaryAction]);

  const handleToggleDropdown = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleItemSelect = useCallback((item: DropdownItem) => {
    item.onClick();
    setIsOpen(false);
  }, []);

  // Close on Escape
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <div className={clsx('relative inline-flex', className)}>
      {/* Reference container for floating-ui */}
      <div ref={refs.setReference}>
        {/* Primary action button */}
        <button
          type="button"
          onClick={handlePrimaryClick}
          disabled={disabled}
          title={tooltip || label}
          className={clsx(
            'flex items-center gap-2 rounded-l px-2 py-1.5 text-left transition-colors',
            'border border-ops-strong bg-ops-surface',
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
          <span className="text-xs text-text-ops-primary">{label}</span>
        </button>

        {/* Dropdown arrow button */}
        <button
          type="button"
          ref={refs.setReference}
          onClick={handleToggleDropdown}
          disabled={disabled}
          className={clsx(
            'flex items-center justify-center px-1.5 transition-colors',
            'border border-ops-strong border-l-0 bg-ops-surface rounded-r',
            'hover:bg-ops-overlay focus:outline-none focus:ring-1 focus:ring-blue-500',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          <ChevronDown
            className={clsx(
              'text-text-ops-muted transition-transform',
              isOpen && 'rotate-180',
            )}
            size={14}
          />
        </button>
      </div>

      {/* Floating dropdown menu */}
      {isOpen && (
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          className="z-50 min-w-[120px] overflow-hidden rounded border border-ops-strong bg-ops-surface shadow-2xl"
          role="menu"
          data-placement={placement}
        >
          {dropdownItems.map((item) => {
            const ItemIcon = item.icon ? (LucideIcons as any)[item.icon] : null;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => handleItemSelect(item)}
                className={clsx(
                  'w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-text-ops-primary transition-colors',
                  'hover:bg-ops-overlay focus:outline-none',
                )}
              >
                {ItemIcon && (
                  <ItemIcon className="text-text-ops-muted shrink-0" size={14} />
                )}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
