/**
 * Preset Toolbar Dropdown — Dropdown selector in the top bar for managing view presets.
 *
 * Displays categorized presets (My Presets, Project Shared, System Baselines)
 * with one-click apply, export, and import actions.
 *
 * The dropdown is typically placed in the ribbon or toolbar area and allows
 * users to quickly switch between saved view configurations.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown,
  Save,
  Download,
  Upload,
  FolderOpen,
  Users,
  Globe,
  Lock,
  Play,
  MoreHorizontal,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  usePresetStore,
  type ViewPreset,
  type ViewType,
} from '../../../stores/usePresetStore';

// ============================================================================
// Props
// ============================================================================

interface PresetToolbarDropdownProps {
  /** The current view type for filtering presets */
  viewType: ViewType;
  /** Current view configuration (for saving) */
  configPayload?: Record<string, any>;
  /** Whether the current view has unsaved changes */
  isDirty?: boolean;
  /** Callback when the user wants to save a new preset */
  onSavePreset?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export const PresetToolbarDropdown: React.FC<PresetToolbarDropdownProps> = ({
  viewType,
  configPayload,
  isDirty,
  onSavePreset,
}) => {
  const {
    presets,
    activePresetId,
    isLoading,
    loadPresets,
    applyPreset,
    exportPreset,
    importPreset,
  } = usePresetStore();

  const [isOpen, setIsOpen] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load presets on mount and view type change
  useEffect(() => {
    loadPresets(viewType);
  }, [viewType, loadPresets]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Categorize presets
  const myPresets = presets.filter((p) => p.sharing_scope === 'PRIVATE');
  const projectShared = presets.filter((p) => p.sharing_scope === 'PROJECT_SHARED');
  const systemGlobal = presets.filter((p) => p.sharing_scope === 'SYSTEM_GLOBAL');

  const activePreset = presets.find((p) => p.id === activePresetId);

  const handleApply = (presetId: string) => {
    applyPreset(presetId);
    setIsOpen(false);
  };

  const handleExport = async (presetId: string) => {
    await exportPreset(presetId);
    setIsOpen(false);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const presetName = file.name.replace('.ppmview.json', '');
    const result = await importPreset(file, presetName);

    if (!result.success) {
      setImportError(result.errors?.[0] || 'Import failed');
    } else {
      setImportError(null);
      setIsOpen(false);
    }

    // Reset file input
    e.target.value = '';
  };

  const getScopeIcon = (scope: string) => {
    switch (scope) {
      case 'PRIVATE':
        return <Lock size={12} className="text-text-ops-muted" />;
      case 'PROJECT_SHARED':
        return <Users size={12} className="text-amber-400" />;
      case 'SYSTEM_GLOBAL':
        return <Globe size={12} className="text-green-400" />;
      default:
        return null;
    }
  };

  const getScopeLabel = (scope: string) => {
    switch (scope) {
      case 'PRIVATE':
        return 'My Presets';
      case 'PROJECT_SHARED':
        return 'Project Shared';
      case 'SYSTEM_GLOBAL':
        return 'System Baselines';
      default:
        return scope;
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex items-center gap-2 px-3 py-1.5 rounded text-sm border transition-colors',
          isOpen
            ? 'border-blue-500 bg-blue-500/10 text-blue-400'
            : 'border-ops-subtle bg-ops-base text-text-ops-muted hover:border-ops-strong hover:text-text-ops-primary',
        )}
      >
        <FolderOpen size={14} />
        <span className="hidden sm:inline">
          {activePreset ? activePreset.name : 'Presets'}
        </span>
        {isDirty && (
          <span className="w-2 h-2 rounded-full bg-amber-400" title="Unsaved changes" />
        )}
        <ChevronDown size={12} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-ops-surface border border-ops-strong rounded-lg shadow-2xl z-50">
          {/* Header */}
          <div className="px-3 py-2 border-b border-ops-strong flex items-center justify-between">
            <span className="text-xs font-medium text-text-ops-muted uppercase tracking-wider">
              View Presets
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  onSavePreset?.();
                  setIsOpen(false);
                }}
                className="p-1 text-text-ops-muted hover:text-text-ops-primary transition-colors"
                title="Save current view as preset"
              >
                <Save size={14} />
              </button>
              <button
                onClick={handleImportClick}
                className="p-1 text-text-ops-muted hover:text-text-ops-primary transition-colors"
                title="Import .ppmview.json file"
              >
                <Upload size={14} />
              </button>
            </div>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".ppmview.json"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Import error */}
          {importError && (
            <div className="px-3 py-2 text-xs text-red-400 bg-red-500/10 border-b border-red-500/30">
              {importError}
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="px-3 py-6 text-center text-text-ops-muted text-sm">
              Loading presets...
            </div>
          )}

          {/* Preset list */}
          {!isLoading && presets.length === 0 && (
            <div className="px-3 py-6 text-center text-text-ops-muted text-sm">
              No presets saved yet.
            </div>
          )}

          {/* Scrollable preset list */}
          <div className="max-h-80 overflow-y-auto">
            {/* My Presets */}
            {myPresets.length > 0 && (
              <PresetGroup
                label={getScopeLabel('PRIVATE')}
                presets={myPresets}
                activePresetId={activePresetId}
                onApply={handleApply}
                onExport={handleExport}
                getScopeIcon={getScopeIcon}
              />
            )}

            {/* Project Shared */}
            {projectShared.length > 0 && (
              <PresetGroup
                label={getScopeLabel('PROJECT_SHARED')}
                presets={projectShared}
                activePresetId={activePresetId}
                onApply={handleApply}
                onExport={handleExport}
                getScopeIcon={getScopeIcon}
              />
            )}

            {/* System Global */}
            {systemGlobal.length > 0 && (
              <PresetGroup
                label={getScopeLabel('SYSTEM_GLOBAL')}
                presets={systemGlobal}
                activePresetId={activePresetId}
                onApply={handleApply}
                onExport={handleExport}
                getScopeIcon={getScopeIcon}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Preset Group Sub-component
// ============================================================================

interface PresetGroupProps {
  label: string;
  presets: ViewPreset[];
  activePresetId: string | null;
  onApply: (presetId: string) => void;
  onExport: (presetId: string) => void;
  getScopeIcon: (scope: string) => React.ReactNode;
}

const PresetGroup: React.FC<PresetGroupProps> = ({
  label,
  presets,
  activePresetId,
  onApply,
  onExport,
  getScopeIcon,
}) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  return (
    <div>
      {/* Group header */}
      <div className="px-3 py-1.5 flex items-center gap-1.5 text-xs text-text-ops-muted border-b border-ops-subtle">
        {getScopeIcon(label === 'My Presets' ? 'PRIVATE' : label === 'Project Shared' ? 'PROJECT_SHARED' : 'SYSTEM_GLOBAL')}
        <span className="uppercase tracking-wider">{label}</span>
        <span className="ml-auto text-xs opacity-50">{presets.length}</span>
      </div>

      {/* Preset items */}
      {presets.map((preset) => (
        <div key={preset.id} className="relative">
          <button
            onClick={() => onApply(preset.id)}
            className={clsx(
              'w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
              activePresetId === preset.id
                ? 'bg-blue-500/10 text-blue-400'
                : 'text-text-ops-primary hover:bg-ops-overlay',
            )}
          >
            <Play size={12} className={clsx(
              activePresetId === preset.id ? 'text-blue-400' : 'text-text-ops-muted',
            )} />
            <span className="truncate flex-1">{preset.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenuId(openMenuId === preset.id ? null : preset.id);
              }}
              className="p-1 text-text-ops-muted hover:text-text-ops-primary transition-colors"
            >
              <MoreHorizontal size={14} />
            </button>
          </button>

          {/* Context menu */}
          {openMenuId === preset.id && (
            <div className="absolute right-full top-0 mr-1 w-40 bg-ops-surface border border-ops-strong rounded shadow-xl z-50">
              <button
                onClick={() => {
                  onApply(preset.id);
                  setOpenMenuId(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-text-ops-primary hover:bg-ops-overlay transition-colors"
              >
                <Play size={12} />
                Apply Preset
              </button>
              <button
                onClick={() => {
                  onExport(preset.id);
                  setOpenMenuId(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-text-ops-primary hover:bg-ops-overlay transition-colors"
              >
                <Download size={12} />
                Export to File
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
