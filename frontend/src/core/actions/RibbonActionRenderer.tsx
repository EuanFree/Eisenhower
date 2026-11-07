/**
 * Ribbon Action Renderer Component
 *
 * Generic renderer that automatically displays an ActionDefinition as the
 * correct button type based on its `preferredSize` metadata.  Handles
 * disabled states with contextual tooltips explaining why an action is
 * blocked, and displays keyboard shortcut hints.
 *
 * Supported Button Types
 * ----------------------
 *
 * 1. **LARGE_48PX** — 48px icon + label text (primary actions).
 * 2. **SMALL_24PX** — Compact stacked button (secondary actions).
 * 3. **SPLIT_DROPDOWN** — Action button + dropdown menu.
 * 4. **INPUT_NUMERIC** — Compact numeric input field.
 *
 * Disabled State Handling
 * -----------------------
 *
 * When an action's `isEnabled(context)` returns `false`, the button is
 * rendered with reduced opacity and a tooltip.  If the action provides
 * a `getDisabledReason()` function, the tooltip shows the specific reason
 * (e.g., "Disabled: Task is locked under Baseline 0").
 *
 * Usage
 * -----
 *
 * ```tsx
 * <RibbonActionRenderer
 *   action={runCpmAction}
 *   context={actionContext}
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

interface RibbonActionRendererProps {
  /** The action definition to render */
  action: ActionDefinition;

  /** Current action context for availability/enabled checks */
  context: ActionContext;
}

// ---------------------------------------------------------------------------
// Icon Helper
// ---------------------------------------------------------------------------

/**
 * Look up a Lucide icon component by name.
 *
 * @param iconName - Lucide icon name (e.g., 'Play', 'Lock')
 * @returns The icon component or undefined
 */
function getIconByName(iconName: string): React.ComponentType<{ className?: string }> | undefined {
  return (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[iconName];
}

// ---------------------------------------------------------------------------
// Large Button (48px icon + label)
// ---------------------------------------------------------------------------

const LargeButton: React.FC<{
  action: ActionDefinition;
  context: ActionContext;
  disabled: boolean;
  disabledReason?: string;
  onClick: () => void;
}> = ({ action, context, disabled, disabledReason, onClick }) => {
  const IconComponent = getIconByName(action.icon);

  return (
    <div className="flex flex-col items-center justify-center gap-1 min-w-[72px]">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={disabled ? disabledReason || action.description : action.description}
        className={clsx(
          'flex flex-col items-center justify-center gap-1 rounded-md transition-colors',
          'w-[72px] h-[72px]',
          disabled
            ? 'opacity-40 cursor-not-allowed'
            : 'hover:bg-bg-ops-overlay active:bg-bg-ops-surface',
        )}
        aria-label={action.label}
        aria-disabled={disabled}
      >
        {IconComponent && <IconComponent className="w-[48px] h-[48px] text-text-ops-primary" />}
      </button>
      <span className="text-[11px] text-text-ops-muted text-center leading-tight">
        {action.label}
      </span>
      {action.defaultShortcut && (
        <kbd className="text-[9px] px-1 py-0.5 rounded bg-bg-ops-base border border-border-ops-subtle text-text-ops-muted font-mono">
          {action.defaultShortcut}
        </kbd>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Small Button (24px stacked)
// ---------------------------------------------------------------------------

const SmallButton: React.FC<{
  action: ActionDefinition;
  context: ActionContext;
  disabled: boolean;
  disabledReason?: string;
  onClick: () => void;
}> = ({ action, context, disabled, disabledReason, onClick }) => {
  const IconComponent = getIconByName(action.icon);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledReason || action.description : action.description}
      className={clsx(
        'flex flex-col items-center justify-center gap-0.5 rounded-md transition-colors px-2 py-1',
        'min-w-[48px] h-[56px]',
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'hover:bg-bg-ops-overlay active:bg-bg-ops-surface',
      )}
      aria-label={action.label}
      aria-disabled={disabled}
    >
      {IconComponent && <IconComponent className="w-5 h-5 text-text-ops-primary" />}
      <span className="text-[10px] text-text-ops-muted leading-tight">{action.label}</span>
    </button>
  );
};

// ---------------------------------------------------------------------------
// Split Dropdown Button
// ---------------------------------------------------------------------------

const SplitDropdownButton: React.FC<{
  action: ActionDefinition;
  context: ActionContext;
  disabled: boolean;
  disabledReason?: string;
  onClick: (optionValue?: any) => void;
}> = ({ action, context, disabled, disabledReason, onClick }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const IconComponent = getIconByName(action.icon);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const handleMainClick = () => {
    // Execute with no option value (default action)
    onClick();
    setDropdownOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative flex flex-col items-center gap-1 min-w-[72px]">
      <div className="flex items-center">
        <button
          type="button"
          onClick={handleMainClick}
          disabled={disabled}
          title={disabled ? disabledReason || action.description : action.description}
          className={clsx(
            'flex items-center justify-center rounded-l-md transition-colors',
            'w-[56px] h-[56px]',
            disabled
              ? 'opacity-40 cursor-not-allowed'
              : 'hover:bg-bg-ops-overlay active:bg-bg-ops-surface',
          )}
          aria-label={action.label}
          aria-disabled={disabled}
        >
          {IconComponent && <IconComponent className="w-5 h-5 text-text-ops-primary" />}
        </button>
        <button
          type="button"
          onClick={() => setDropdownOpen((o) => !o)}
          disabled={disabled}
          className={clsx(
            'flex items-center justify-center rounded-r-md border-l border-border-ops-subtle transition-colors',
            'w-[24px] h-[56px]',
            disabled
              ? 'opacity-40 cursor-not-allowed'
              : 'hover:bg-bg-ops-overlay',
          )}
          aria-label={`${action.label} options`}
          aria-expanded={dropdownOpen}
        >
          <svg className="w-3 h-3 text-text-ops-muted" viewBox="0 0 12 12">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </button>
      </div>
      <span className="text-[11px] text-text-ops-muted text-center leading-tight">
        {action.label}
      </span>

      {/* Dropdown Menu */}
      {dropdownOpen && action.dropdownOptions && (
        <div className="absolute top-full left-0 mt-1 w-40 bg-bg-ops-surface border border-border-ops-strong rounded-md shadow-xl z-50 py-1">
          {action.dropdownOptions.map((option) => {
            const OptionIcon = option.icon ? getIconByName(option.icon) : undefined;
            return (
              <button
                key={String(option.value)}
                type="button"
                onClick={() => {
                  onClick(option.value);
                  setDropdownOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
              >
                {OptionIcon && <OptionIcon className="w-4 h-4" />}
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Numeric Input
// ---------------------------------------------------------------------------

const NumericInput: React.FC<{
  action: ActionDefinition;
  context: ActionContext;
  disabled: boolean;
  disabledReason?: string;
  onChange: (value: number) => void;
}> = ({ action, context, disabled, disabledReason, onChange }) => {
  const [value, setValue] = useState('');
  const IconComponent = getIconByName(action.icon);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setValue(raw);
    const num = parseFloat(raw);
    if (!isNaN(num)) {
      onChange(num);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1 min-w-[80px]">
      <div className="flex items-center gap-2">
        {IconComponent && <IconComponent className="w-4 h-4 text-text-ops-muted" />}
        <input
          type="number"
          value={value}
          onChange={handleChange}
          disabled={disabled}
          title={disabled ? disabledReason || action.description : action.description}
          className={clsx(
            'w-20 px-2 py-1 rounded-md text-sm font-mono bg-bg-ops-base border border-border-ops-subtle text-text-ops-primary',
            'focus:outline-none focus:border-blue-500',
            disabled && 'opacity-40 cursor-not-allowed',
          )}
          aria-label={action.label}
          aria-disabled={disabled}
        />
      </div>
      <span className="text-[10px] text-text-ops-muted leading-tight">{action.label}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Renderer
// ---------------------------------------------------------------------------

/**
 * Generic action renderer that automatically selects the correct button
 * type based on the action's `preferredSize` metadata.
 */
const RibbonActionRenderer: React.FC<RibbonActionRendererProps> = ({ action, context }) => {
  const enabled = action.isEnabled(context);
  const disabledReason = enabled ? undefined : action.getDisabledReason?.(context);

  const handleClick = useCallback(
    (optionValue?: any) => {
      if (!enabled) return;
      action.execute(context, optionValue);
    },
    [action, context, enabled],
  );

  const handleNumericChange = useCallback(
    (value: number) => {
      if (!enabled) return;
      action.execute(context, value);
    },
    [action, context, enabled],
  );

  const size = action.preferredSize || 'SMALL_24PX';

  switch (size) {
    case 'LARGE_48PX':
      return (
        <LargeButton
          action={action}
          context={context}
          disabled={!enabled}
          disabledReason={disabledReason}
          onClick={() => handleClick()}
        />
      );

    case 'SPLIT_DROPDOWN':
      return (
        <SplitDropdownButton
          action={action}
          context={context}
          disabled={!enabled}
          disabledReason={disabledReason}
          onClick={handleClick}
        />
      );

    case 'INPUT_NUMERIC':
      return (
        <NumericInput
          action={action}
          context={context}
          disabled={!enabled}
          disabledReason={disabledReason}
          onChange={handleNumericChange}
        />
      );

    case 'SMALL_24PX':
    default:
      return (
        <SmallButton
          action={action}
          context={context}
          disabled={!enabled}
          disabledReason={disabledReason}
          onClick={() => handleClick()}
        />
      );
  }
};

export default RibbonActionRenderer;
