/**
 * Column Visibility Menu
 *
 * Lightweight popup checklist shown when the user right-clicks the WBS
 * table's header row. Lets the user toggle which columns are visible
 * without opening the full Column Customizer modal.
 */

import React, { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { clsx } from 'clsx';

export interface ColumnVisibilityOption {
  /** Column id (matches the TanStack Table column id) */
  id: string;
  /** Display label shown in the checklist */
  label: string;
  /** Whether the column is currently visible */
  visible: boolean;
}

interface ColumnVisibilityMenuProps {
  /** Screen position to anchor the popup at */
  position: { x: number; y: number };
  /** Columns available for toggling */
  columns: ColumnVisibilityOption[];
  /** Called when a column's visibility is toggled */
  onToggle: (columnId: string) => void;
  /** Called to dismiss the menu */
  onClose: () => void;
}

const ColumnVisibilityMenu: React.FC<ColumnVisibilityMenuProps> = ({
  position,
  columns,
  onToggle,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40" />
      <div
        ref={menuRef}
        role="menu"
        aria-label="Toggle column visibility"
        className="fixed z-50 w-56 max-h-96 overflow-y-auto bg-bg-ops-surface border border-border-ops-strong rounded-lg shadow-2xl py-1"
        style={{ left: position.x, top: position.y }}
      >
        <div className="px-3 py-1.5 text-xs font-semibold text-text-ops-muted uppercase tracking-wider border-b border-border-ops-subtle/50">
          Show Columns
        </div>
        {columns.map((col) => (
          <button
            key={col.id}
            type="button"
            role="menuitemcheckbox"
            aria-checked={col.visible}
            onClick={() => onToggle(col.id)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
          >
            <div
              className={clsx(
                'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0',
                col.visible ? 'bg-blue-600 border-blue-600' : 'border-text-ops-muted',
              )}
            >
              {col.visible && <Check size={10} className="text-white" />}
            </div>
            <span className="truncate">{col.label}</span>
          </button>
        ))}
      </div>
    </>
  );
};

export default ColumnVisibilityMenu;
