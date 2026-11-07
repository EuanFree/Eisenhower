/**
 * InlineEditCell — Reusable Inline Cell Editor
 *
 * Renders an active input field inside a WBS table cell.
 * Supports date and number input types with proper validation.
 *
 * Key bindings:
 * - Enter: Commit and move to next row in the same column.
 * - Tab: Commit and move to the next column.
 * - Shift+Tab: Commit and move to the previous column.
 * - Esc: Revert changes and exit edit mode.
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    const editHook = useInlineEdit(rows, rowHeight);
 *
 *    {editHook.activeCell?.nodeId === node.id && editHook.activeCell?.field === 'planned_start_date'
 *      ? <InlineEditCell
 *          field={editHook.activeCell.field}
 *          value={editHook.activeCell.currentValue}
 *          onChange={editHook.updateValue}
 *          onKeyDown={handleKeyDown}
 *          onBlur={editHook.commitEdit}
 *          inputRef={editHook.inputRef}
 *        />
 *      : <span onDoubleClick={() => editHook.startEdit(...)}>{value}</span>
 *    }
 */

import React, { useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { Calendar } from 'lucide-react';
import { EditableField, EDITABLE_FIELD_INPUT_TYPES } from '../../types/editing';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface InlineEditCellProps {
  /** Field being edited */
  field: EditableField;
  /** Current string value */
  value: string;
  /** Called when the input value changes */
  onChange: (value: string) => void;
  /** Called on key down for navigation */
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Called on blur to commit */
  onBlur: () => void;
  /** Ref for the input element */
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Optional row height for sizing */
  rowHeight?: number;
  /** Optional autocomplete suggestions, rendered via a native <datalist> */
  listOptions?: string[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const InlineEditCell: React.FC<InlineEditCellProps> = ({
  field,
  value,
  onChange,
  onKeyDown,
  onBlur,
  inputRef,
  rowHeight,
  listOptions,
}) => {
  const inputType = EDITABLE_FIELD_INPUT_TYPES[field];

  // Determine input props based on field type
  const inputProps = getInputProps(field, inputType, value);
  const datalistId = listOptions && listOptions.length > 0 ? `edit-${field}-options` : undefined;

  const handleOpenDatePicker = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      (inputRef.current as any)?.showPicker?.();
    } catch {
      inputRef.current?.focus();
    }
  };

  return (
    <div className="relative flex items-center w-full">
      <input
        ref={inputRef as any}
        type={inputType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className={clsx(
          'w-full bg-bg-ops-overlay border border-blue-500 rounded px-1.5 py-0.5 text-sm font-mono text-text-ops-primary focus:outline-none focus:ring-1 focus:ring-blue-500',
          inputType === 'date' && 'cursor-pointer pr-6',
          inputType === 'number' && 'text-right',
        )}
        style={{
          height: rowHeight ? `${rowHeight - 8}px` : 'auto',
          minHeight: 20,
        }}
        min={inputProps.min}
        max={inputProps.max}
        step={inputProps.step}
        placeholder={inputProps.placeholder}
        list={datalistId}
        aria-label={`Edit ${field}`}
      />
      {inputType === 'date' && (
        <button
          type="button"
          tabIndex={-1}
          onClick={handleOpenDatePicker}
          className="absolute right-1 text-text-ops-muted hover:text-blue-400 p-0.5 rounded transition-colors"
          title="Open calendar popup"
          aria-label="Open calendar"
        >
          <Calendar size={13} />
        </button>
      )}
      {datalistId && (
        <datalist id={datalistId}>
          {listOptions!.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Input Props Helper
// ---------------------------------------------------------------------------

interface InputProps {
  min?: string;
  max?: string;
  step?: number;
  placeholder?: string;
}

function getInputProps(field: EditableField, inputType: 'date' | 'number' | 'text', value: string): InputProps {
  if (inputType === 'number') {
    if (field === 'percent_complete') {
      return { min: '0', max: '100', step: 1 };
    }
    if (field === 'duration_days') {
      return { min: '0', step: 1 };
    }
    return { step: 1 };
  }

  if (inputType === 'text') {
    if (field === 'duration') {
      return { placeholder: 'e.g. 3d, 2w, 8h, 1m' };
    }
    if (field === 'resources') {
      return { placeholder: 'e.g. JSmith, R-102' };
    }
    return { placeholder: 'e.g. 1.2FS+2d, 1.3SS' };
  }

  // Date fields
  return {};
}

export default InlineEditCell;
