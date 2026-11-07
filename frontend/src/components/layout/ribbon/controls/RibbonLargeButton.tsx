/**
 * RibbonLargeButton Component
 *
 * A primary ribbon action button with large icon and two-line label.
 *
 * Features
 * --------
 * - Height: 62px, width: 54px–72px.
 * - Centered stacked layout: 24px Lucide icon on top,
 *   two-line text label underneath (text-center, text-[10px] leading-tight).
 * - Disabled state: opacity-40 cursor-not-allowed pointer-events-none.
 * - Tooltip on hover (250ms delay): Shows action description,
 *   disabled reason (if blocked by baseline lock or clearance),
 *   and keyboard shortcut badge.
 *
 * Usage
 * -----
 *
 * ```tsx
 * <RibbonLargeButton
 *   icon="Play"
 *   label="Run CPM"
 *   onClick={handleRunCpm}
 *   shortcut="Ctrl+Shift+R"
 *   disabled={isLocked}
 *   tooltip="Recalculate Critical Path Method"
 *   disabledReason="Task is locked under Baseline 0"
 * />
 * ```
 */

import React, { useState, useRef, useCallback } from 'react';
import * as LucideIcons from 'lucide-react';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RibbonLargeButtonProps {
  /** Icon name from lucide-react */
  icon?: string;
  /** Button label (may be two lines) */
  label: string;
  /** Click handler */
  onClick: () => void;
  /** Keyboard shortcut hint */
  shortcut?: string;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Tooltip description text */
  tooltip?: string;
  /** Reason why the button is disabled (shown in tooltip) */
  disabledReason?: string;
  /** Additional CSS class */
  className?: string;
}

// ---------------------------------------------------------------------------
// Delayed Tooltip
// ---------------------------------------------------------------------------

/**
 * Tooltip that appears after a 250ms hover delay.
 */
const DelayedTooltip: React.FC<{
  content: string;
  visible: boolean;
  children: React.ReactNode;
}> = ({ content, visible, children }) => {
  return (
    <div className="relative inline-block">
      {children}
      {visible && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 min-w-[160px] max-w-[240px] rounded border border-ops-strong bg-ops-base px-2 py-1.5 text-[10px] text-text-ops-primary shadow-2xl">
          {content}
          {/* Arrow */}
          <div className="absolute left-1/2 top-full -translate-x-1/2 -translate-y-[1px] border-4 border-b-transparent border-l-transparent border-r-transparent border-t-ops-strong" />
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// RibbonLargeButton
// ---------------------------------------------------------------------------

/**
 * Renders a large ribbon action button with delayed tooltip.
 */
export const RibbonLargeButton: React.FC<RibbonLargeButtonProps> = ({
  icon,
  label,
  onClick,
  shortcut,
  disabled = false,
  tooltip,
  disabledReason,
  className,
}) => {
  const IconComponent = icon ? (LucideIcons as any)[icon] : null;
  const [showTooltip, setShowTooltip] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    timerRef.current = setTimeout(() => setShowTooltip(true), 250);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setShowTooltip(false);
  }, []);

  // Build tooltip content
  const tooltipContent = [
    tooltip || label,
    disabled && disabledReason ? disabledReason : null,
    shortcut ? `Shortcut: ${shortcut}` : null,
  ].filter(Boolean).join('\n');

  return (
    <DelayedTooltip content={tooltipContent} visible={showTooltip && !disabled}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={clsx(
          'flex flex-col items-center justify-center gap-0.5 rounded px-1.5 py-1 transition-colors',
          'w-[54px] h-[62px]',
          'hover:bg-ops-overlay focus:outline-none focus:ring-1 focus:ring-blue-500',
          disabled
            ? 'opacity-40 cursor-not-allowed pointer-events-none'
            : 'cursor-pointer',
          className,
        )}
      >
        {/* 24px Lucide icon */}
        {IconComponent && (
          <IconComponent
            className="text-text-ops-primary shrink-0"
            size={24}
            strokeWidth={1.5}
          />
        )}

        {/* Two-line text label */}
        <span className="text-[10px] text-text-ops-primary text-center leading-tight line-clamp-2">
          {label}
        </span>

        {/* Keyboard shortcut badge */}
        {shortcut && (
          <kbd className="text-[8px] text-text-ops-muted bg-ops-base border border-ops-subtle px-0.5 py-0 rounded">
            {shortcut}
          </kbd>
        )}
      </button>
    </DelayedTooltip>
  );
};
