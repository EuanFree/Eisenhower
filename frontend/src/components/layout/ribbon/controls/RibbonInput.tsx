/**
 * RibbonInput Component
 *
 * Compact numerical/text inputs for Lag Days, Duration, or Filter Query.
 *
 * Features
 * --------
 * - Compact input field with label.
 * - Supports text, number, and date input types.
 * - Defence Design Token styling.
 * - Validation feedback.
 *
 * Usage
 * -----
 *
 * ```tsx
 * <RibbonInput
 *   label="Lag Days"
 *   type="number"
 *   value={lagDays}
 *   onChange={setLagDays}
 *   min={-10}
 *   max={30}
 * />
 * ```
 */

import React from 'react';
import { clsx } from 'clsx';

interface RibbonInputProps {
  /** Input label */
  label: string;
  /** Input type */
  type?: 'text' | 'number' | 'date';
  /** Current value */
  value: string | number;
  /** Change handler */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Minimum value (for number type) */
  min?: number;
  /** Maximum value (for number type) */
  max?: number;
  /** Step value (for number type) */
  step?: number;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Tooltip text */
  tooltip?: string;
  /** Additional CSS class */
  className?: string;
}

export const RibbonInput: React.FC<RibbonInputProps> = ({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
  disabled = false,
  tooltip,
  className,
}) => {
  return (
    <div className={clsx('flex flex-col gap-0.5', className)}>
      <label className="text-[10px] text-text-ops-muted uppercase tracking-wider">
        {label}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        title={tooltip}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(
          'w-full rounded border border-ops-strong bg-ops-base px-2 py-1 text-xs text-text-ops-primary',
          'placeholder:text-text-ops-muted',
          'focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          type === 'number' && 'font-mono',
        )}
      />
    </div>
  );
};
