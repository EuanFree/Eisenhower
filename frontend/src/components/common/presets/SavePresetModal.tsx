/**
 * Save Preset Modal — Dialog for creating a new view preset.
 *
 * Collects preset title, description, sharing scope, and security
 * classification, then calls the backend to persist the preset.
 *
 * The modal is triggered when the user has unsaved view configuration
 * changes (dirty flag) and chooses to save them as a new preset.
 */

import React, { useState } from 'react';
import { X, Save, Eye, EyeOff, Globe } from 'lucide-react';
import { clsx } from 'clsx';
import {
  usePresetStore,
  type SharingScope,
  type PresetClassification,
  type PresetConfig,
} from '../../../stores/usePresetStore';

// ============================================================================
// Props
// ============================================================================

interface SavePresetModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Current view configuration to save */
  configPayload: PresetConfig;
}

// ============================================================================
// Component
// ============================================================================

export const SavePresetModal: React.FC<SavePresetModalProps> = ({
  isOpen,
  onClose,
  configPayload,
}) => {
  const { savePreset, clearDirty } = usePresetStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sharingScope, setSharingScope] = useState<SharingScope>('PRIVATE');
  const [classification, setClassification] = useState<PresetClassification>('OFFICIAL');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Preset name is required.');
      return;
    }
    if (name.length > 120) {
      setError('Preset name must be 120 characters or fewer.');
      return;
    }

    setIsSaving(true);
    setError(null);

    const result = await savePreset(
      name.trim(),
      description.trim() || null,
      sharingScope,
      classification,
      configPayload,
    );

    if (result) {
      clearDirty();
      resetForm();
      onClose();
    } else {
      setError('Failed to save preset. Please try again.');
    }
    setIsSaving(false);
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setSharingScope('PRIVATE');
    setClassification('OFFICIAL');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-preset-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-ops-surface border border-ops-strong rounded-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ops-strong">
          <h2
            id="save-preset-title"
            className="text-lg font-semibold text-text-ops-primary"
          >
            Save View Preset
          </h2>
          <button
            onClick={handleClose}
            className="p-1 text-text-ops-muted hover:text-text-ops-primary transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Name */}
          <div>
            <label
              htmlFor="preset-name"
              className="block text-sm font-medium text-text-ops-muted mb-1"
            >
              Preset Name <span className="text-red-400">*</span>
            </label>
            <input
              id="preset-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., CAM Cost Audit"
              maxLength={120}
              className="w-full px-3 py-2 bg-ops-base border border-ops-subtle rounded text-text-ops-primary text-sm focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="preset-description"
              className="block text-sm font-medium text-text-ops-muted mb-1"
            >
              Description
            </label>
            <textarea
              id="preset-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of this preset's purpose"
              rows={2}
              className="w-full px-3 py-2 bg-ops-base border border-ops-subtle rounded text-text-ops-primary text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* Sharing Scope */}
          <div>
            <label className="block text-sm font-medium text-text-ops-muted mb-2">
              Sharing Scope
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: 'PRIVATE', icon: EyeOff, label: 'Private' },
                  { value: 'PROJECT_SHARED', icon: Eye, label: 'Project' },
                  { value: 'SYSTEM_GLOBAL', icon: Globe, label: 'Global' },
                ] as const
              ).map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSharingScope(value)}
                  className={clsx(
                    'flex flex-col items-center gap-1 px-3 py-3 rounded border transition-colors',
                    sharingScope === value
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : 'border-ops-subtle bg-ops-base text-text-ops-muted hover:border-ops-strong',
                  )}
                >
                  <Icon size={18} />
                  <span className="text-xs">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Classification */}
          <div>
            <label className="block text-sm font-medium text-text-ops-muted mb-2">
              Security Classification
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { value: 'OFFICIAL', color: 'border-sky-500/30 bg-sky-500/10 text-sky-400' },
                  { value: 'SECRET', color: 'border-red-500/30 bg-red-500/10 text-red-400' },
                  { value: 'TOP_SECRET', color: 'border-purple-500/30 bg-purple-500/10 text-purple-400' },
                ] as const
              ).map(({ value, color }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setClassification(value)}
                  className={clsx(
                    'px-3 py-2 rounded border text-xs font-mono transition-colors',
                    classification === value
                      ? color
                      : 'border-ops-subtle bg-ops-base text-text-ops-muted hover:border-ops-strong',
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-ops-strong">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-text-ops-muted hover:text-text-ops-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 text-sm rounded transition-colors',
              isSaving || !name.trim()
                ? 'bg-ops-overlay text-text-ops-muted cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-500',
            )}
          >
            <Save size={14} />
            {isSaving ? 'Saving...' : 'Save Preset'}
          </button>
        </div>
      </div>
    </div>
  );
};
