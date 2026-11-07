/**
 * Resource Picker Popup
 *
 * Filterable checklist popover for selecting and assigning resources
 * to a WBS task line. Supports live search filtering, quick select/clear,
 * and multi-select checkboxes.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Check, X, Users } from 'lucide-react';
import { clsx } from 'clsx';

export interface ResourceOption {
  id: string;
  code: string;
  name: string;
  type?: string;
}

interface ResourcePickerPopupProps {
  /** Screen position to anchor the popup at */
  position: { x: number; y: number };
  /** Full catalogue of available resources */
  resources: ResourceOption[];
  /** Currently assigned resource IDs for the task */
  assignedIds: string[];
  /** Task node code/name for the header */
  taskLabel?: string;
  /** Called when a resource is toggled */
  onToggle: (resourceId: string, resourceCode: string) => void;
  /** Called to close the popup */
  onClose: () => void;
}

const ResourcePickerPopup: React.FC<ResourcePickerPopupProps> = ({
  position,
  resources,
  assignedIds,
  taskLabel,
  onToggle,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const popupRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Dismiss on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Filter resources by code or name
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return resources;
    const q = searchTerm.toLowerCase();
    return resources.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.type && r.type.toLowerCase().includes(q)),
    );
  }, [resources, searchTerm]);

  // Adjust position to stay within viewport
  const adjustedStyle = useMemo(() => {
    const width = 280;
    const maxHeight = 380;
    let left = position.x;
    let top = position.y;

    if (left + width > window.innerWidth - 16) {
      left = window.innerWidth - width - 16;
    }
    if (top + maxHeight > window.innerHeight - 16) {
      top = Math.max(16, window.innerHeight - maxHeight - 16);
    }

    return { left, top };
  }, [position]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" />
      <div
        ref={popupRef}
        role="dialog"
        aria-label="Assign resources"
        className="fixed z-50 w-72 max-h-96 flex flex-col bg-bg-ops-surface border border-border-ops-strong rounded-lg shadow-2xl overflow-hidden"
        style={adjustedStyle}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-ops-subtle bg-bg-ops-elevated">
          <div className="flex items-center gap-1.5 truncate">
            <Users size={14} className="text-blue-400 flex-shrink-0" />
            <span className="text-xs font-semibold text-text-ops-primary truncate">
              {taskLabel ? `Resources: ${taskLabel}` : 'Assign Resources'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-ops-muted hover:text-text-ops-primary p-0.5 rounded transition-colors"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Filter Input */}
        <div className="p-2 border-b border-border-ops-subtle/60">
          <div className="relative flex items-center">
            <Search size={12} className="absolute left-2 text-text-ops-muted pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter resources..."
              className="w-full bg-bg-ops-base border border-border-ops-subtle rounded pl-6 pr-2 py-1 text-xs text-text-ops-primary placeholder:text-text-ops-muted focus:outline-none focus:border-blue-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-1.5 text-text-ops-muted hover:text-text-ops-primary text-xs"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Resource Checklist */}
        <div className="flex-1 overflow-y-auto p-1 max-h-56 divide-y divide-border-ops-subtle/30">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-xs text-text-ops-muted">
              {resources.length === 0 ? 'No resources available in catalogue' : 'No matching resources'}
            </div>
          ) : (
            filtered.map((r) => {
              const isAssigned = assignedIds.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onToggle(r.id, r.code)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-bg-ops-overlay transition-colors rounded"
                >
                  <div
                    className={clsx(
                      'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0',
                      isAssigned ? 'bg-blue-600 border-blue-600' : 'border-text-ops-muted/60',
                    )}
                  >
                    {isAssigned && <Check size={10} className="text-white" />}
                  </div>
                  <div className="flex flex-col truncate">
                    <span className="font-mono font-medium text-text-ops-primary truncate">
                      {r.code}
                    </span>
                    {r.name && r.name !== r.code && (
                      <span className="text-[10px] text-text-ops-muted truncate">{r.name}</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-border-ops-subtle bg-bg-ops-surface text-[11px] text-text-ops-muted">
          <span>{assignedIds.length} assigned</span>
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
};

export default ResourcePickerPopup;
