/**
 * DisplayCalibrationModal Component
 *
 * Modal dialog for adjusting display profile settings with live pre-paint
 * preview. Triggered by keyboard shortcut (Ctrl+Shift+D) or the header
 * gear icon.
 *
 * Controls
 * --------
 * - Density: Radio pills for 28px / 36px / 44px row heights
 * - Scale Factor: Slider from 80% to 150%
 * - Theme: Radio pills for SCIF_DARK, HIGH_CONTRAST_DARK, BALANCED_LIGHT, PROJECTOR
 * - Color Mode: Radio pills for color accessibility palettes
 *
 * All changes are applied to the DOM immediately via the Zustand store
 * and debounced to PostgreSQL for persistence.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, Monitor, Ruler, Palette, Eye } from 'lucide-react';
import { clsx } from 'clsx';
import {
  useDisplayStore,
  type Density,
  type Theme,
  type ColorAccessibility,
} from '../../stores/useDisplayStore';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const densityOptions: { value: Density; label: string; rowHeight: string }[] = [
  { value: 'ULTRA_DENSE', label: 'Ultra Dense', rowHeight: '28px' },
  { value: 'BALANCED', label: 'Balanced', rowHeight: '36px' },
  { value: 'COMFORT', label: 'Comfort', rowHeight: '44px' },
];

const themeOptions: { value: Theme; label: string }[] = [
  { value: 'SCIF_DARK', label: 'SCIF Dark' },
  { value: 'HIGH_CONTRAST_DARK', label: 'High Contrast' },
  { value: 'BALANCED_LIGHT', label: 'Balanced Light' },
  { value: 'PROJECTOR', label: 'Projector' },
];

const colorModeOptions: { value: ColorAccessibility; label: string }[] = [
  { value: 'STANDARD_RAG', label: 'Standard' },
  { value: 'DEUTERANOPIA', label: 'Deuteranopia' },
  { value: 'PROTANOPIA', label: 'Protanopia' },
  { value: 'TRITANOPIA', label: 'Tritanopia' },
  { value: 'MONOCHROME_PATTERN', label: 'Monochrome' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DisplayCalibrationModalProps {
  open: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DisplayCalibrationModal: React.FC<DisplayCalibrationModalProps> = ({
  open,
  onClose,
}) => {
  const settings = useDisplayStore((s) => s.settings);
  const updateSettings = useDisplayStore((s) => s.updateDisplaySettings);

  // Local draft state — only committed on change (instant via store)
  const [draftDensity, setDraftDensity] = useState<Density>(settings.density);
  const [draftScale, setDraftScale] = useState<number>(settings.scaleFactor);
  const [draftTheme, setDraftTheme] = useState<Theme>(settings.theme);
  const [draftColorMode, setDraftColorMode] = useState<ColorAccessibility>(
    settings.colorAccessibility,
  );

  // Sync draft when modal opens
  useEffect(() => {
    if (open) {
      setDraftDensity(settings.density);
      setDraftScale(settings.scaleFactor);
      setDraftTheme(settings.theme);
      setDraftColorMode(settings.colorAccessibility);
    }
  }, [open, settings]);

  // Keyboard shortcut: Ctrl+Shift+D
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Display Calibration"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-bg-ops-surface border border-border-ops-subtle rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-text-ops-muted" />
            <h2 className="text-lg font-semibold text-text-ops-primary">
              Display Calibration
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6">
          {/* Density */}
          <fieldset>
            <legend className="flex items-center gap-2 text-sm font-medium text-text-ops-muted mb-3">
              <Ruler className="w-4 h-4" />
              Density
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {densityOptions.map((opt) => {
                const active = draftDensity === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setDraftDensity(opt.value);
                      updateSettings({ density: opt.value });
                    }}
                    className={clsx(
                      'px-3 py-2 rounded-md text-sm font-medium border transition-all',
                      active
                        ? 'bg-bg-ops-overlay border-border-ops-strong text-text-ops-primary'
                        : 'border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong',
                    )}
                  >
                    <div>{opt.label}</div>
                    <div className="text-xs opacity-60 font-mono">{opt.rowHeight}</div>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Scale Factor */}
          <fieldset>
            <legend className="flex items-center gap-2 text-sm font-medium text-text-ops-muted mb-3">
              <Monitor className="w-4 h-4" />
              Scale Factor
            </legend>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0.8}
                max={1.5}
                step={0.05}
                value={draftScale}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setDraftScale(val);
                  updateSettings({ scaleFactor: val });
                }}
                className="flex-1 accent-sky-500"
              />
              <span className="font-mono text-sm text-text-ops-primary w-16 text-right">
                {Math.round(draftScale * 100)}%
              </span>
            </div>
            <div className="flex justify-between text-xs text-text-ops-muted mt-1 font-mono">
              <span>80%</span>
              <span>100%</span>
              <span>150%</span>
            </div>
          </fieldset>

          {/* Theme */}
          <fieldset>
            <legend className="flex items-center gap-2 text-sm font-medium text-text-ops-muted mb-3">
              <Palette className="w-4 h-4" />
              Theme
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {themeOptions.map((opt) => {
                const active = draftTheme === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setDraftTheme(opt.value);
                      updateSettings({ theme: opt.value });
                    }}
                    className={clsx(
                      'px-3 py-2 rounded-md text-sm font-medium border transition-all',
                      active
                        ? 'bg-bg-ops-overlay border-border-ops-strong text-text-ops-primary'
                        : 'border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong',
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Color Accessibility */}
          <fieldset>
            <legend className="flex items-center gap-2 text-sm font-medium text-text-ops-muted mb-3">
              <Eye className="w-4 h-4" />
              Color Accessibility
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {colorModeOptions.map((opt) => {
                const active = draftColorMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setDraftColorMode(opt.value);
                      updateSettings({ colorAccessibility: opt.value });
                    }}
                    className={clsx(
                      'px-3 py-2 rounded-md text-sm font-medium border transition-all',
                      active
                        ? 'bg-bg-ops-overlay border-border-ops-strong text-text-ops-primary'
                        : 'border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong',
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Live Preview */}
          <div className="border border-border-ops-subtle rounded-md p-4 bg-bg-ops-base">
            <div className="text-xs text-text-ops-muted mb-2 font-mono uppercase tracking-wider">
              Live Preview
            </div>
            <div className="space-y-1">
              {['Task A — Requirements Analysis', 'Task B — System Design', 'Task C — Integration'].map(
                (label, i) => (
                  <div
                    key={i}
                    className={clsx(
                      'flex items-center gap-2 px-2 rounded text-sm font-mono',
                      'border border-border-ops-subtle',
                    )}
                    style={{ height: `${densityRowHeight[draftDensity]}px` }}
                  >
                    <span className="text-text-ops-muted">{i + 1}</span>
                    <span className="text-text-ops-primary truncate">{label}</span>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-ops-subtle text-xs text-text-ops-muted">
          <span>Press <kbd className="px-1.5 py-0.5 bg-bg-ops-overlay rounded font-mono">Ctrl+Shift+D</kbd> to toggle</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-bg-ops-overlay border border-border-ops-subtle rounded text-sm text-text-ops-primary hover:bg-bg-ops-base transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

// Helper map for preview row heights
const densityRowHeight: Record<Density, number> = {
  ULTRA_DENSE: 28,
  BALANCED: 36,
  COMFORT: 44,
};

export default DisplayCalibrationModal;
