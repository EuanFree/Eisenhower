/**
 * Settings View
 *
 * Centralised user preferences panel with two tabs:
 *
 * - **Appearance** — Theme, density, scale factor, font family, font size,
 *   and color accessibility. Changes are applied instantly to the DOM and
 *   debounced to the server.
 *
 * - **Work Item Defaults** — Default duration, delivery mode, and scheduling
 *   mode for newly created WBS tasks. Stored in the same display settings
 *   profile so they persist across hot-desking sessions.
 *
 * Usage
 * -----
 * Opened via the sidebar "Settings" entry or the ViewResolver with viewType
 * `SETTINGS`.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Palette,
  Settings2,
  Clock,
  Type,
  Monitor,
  Eye,
  Save,
  RotateCcw,
  Check,
} from 'lucide-react';
import { useDisplayStore, type Density, type Theme, type ColorAccessibility, type DisplaySettings } from '@/stores/useDisplayStore';
import api from '@/services/api';

// ---------------------------------------------------------------------------
// Font presets
// ---------------------------------------------------------------------------

const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter (Default)' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Georgia', label: 'Georgia (Serif)' },
  { value: 'system-ui', label: 'System UI' },
  { value: 'ui-monospace', label: 'Monospace' },
];

const FONT_SIZE_OPTIONS = [12, 13, 14, 15, 16, 17, 18, 20, 22, 24];

const DELIVERY_MODE_OPTIONS = [
  { value: 'WATERFALL', label: 'Waterfall' },
  { value: 'AGILE', label: 'Agile' },
  { value: 'HYBRID', label: 'Hybrid' },
];

const SCHEDULING_MODE_OPTIONS = [
  { value: 'AUTO', label: 'Auto (Default)' },
  { value: 'MANUAL', label: 'Manual' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SelectField({
  label,
  icon: Icon,
  value,
  options,
  onChange,
  help,
}: {
  label: string;
  icon: typeof Palette;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  help?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium text-ops-primary">
        <Icon className="w-4 h-4 text-sky-400" />
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-ops-subtle bg-ops-surface px-3 py-2 text-sm text-ops-primary focus:border-sky-500 focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {help && <p className="text-xs text-ops-muted">{help}</p>}
    </div>
  );
}

function NumberField({
  label,
  icon: Icon,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  help,
}: {
  label: string;
  icon: typeof Clock;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  help?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium text-ops-primary">
        <Icon className="w-4 h-4 text-sky-400" />
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-sky-500"
        />
        <span className="w-16 text-right text-sm text-ops-muted tabular-nums">
          {value}{unit}
        </span>
      </div>
      {help && <p className="text-xs text-ops-muted">{help}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Appearance Tab
// ---------------------------------------------------------------------------

function AppearanceTab({
  settings,
  onUpdate,
}: {
  settings: DisplaySettings;
  onUpdate: (partial: Partial<DisplaySettings>) => void;
}) {
  const { settings: current } = useDisplayStore();

  return (
    <div className="space-y-8">
      {/* Theme */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-ops-primary flex items-center gap-2">
          <Palette className="w-5 h-5 text-sky-400" />
          Theme & Colors
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SelectField
            label="Visual Theme"
            icon={Monitor}
            value={current.theme}
            options={[
              { value: 'SCIF_DARK', label: 'SCIF Dark (Default)' },
              { value: 'HIGH_CONTRAST_DARK', label: 'High Contrast Dark' },
              { value: 'BALANCED_LIGHT', label: 'Balanced Light' },
              { value: 'PROJECTOR', label: 'Projector' },
            ]}
            onChange={(v) => onUpdate({ theme: v as Theme })}
            help="Changes the overall color palette of the application"
          />
          <SelectField
            label="Color Accessibility"
            icon={Eye}
            value={current.colorAccessibility}
            options={[
              { value: 'STANDARD_RAG', label: 'Standard RAG' },
              { value: 'DEUTERANOPIA', label: 'Deuteranopia (Red-Green)' },
              { value: 'PROTANOPIA', label: 'Protanopia (Red-Blind)' },
              { value: 'TRITANOPIA', label: 'Tritanopia (Blue-Yellow)' },
              { value: 'MONOCHROME_PATTERN', label: 'Monochrome Pattern' },
            ]}
            onChange={(v) => onUpdate({ colorAccessibility: v as ColorAccessibility })}
            help="Adjusts status colors for color vision deficiency"
          />
        </div>
      </section>

      {/* Typography */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-ops-primary flex items-center gap-2">
          <Type className="w-5 h-5 text-sky-400" />
          Typography
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SelectField
            label="Font Family"
            icon={Type}
            value={current.fontFamily || 'Inter'}
            options={FONT_OPTIONS}
            onChange={(v) => onUpdate({ fontFamily: v })}
            help="Changes the primary font used throughout the application"
          />
          <NumberField
            label="Font Size"
            icon={Type}
            value={current.fontSize || 16}
            min={12}
            max={24}
            unit="px"
            onChange={(v) => onUpdate({ fontSize: v })}
            help="Base font size for the application (12-24px)"
          />
        </div>
      </section>

      {/* Density & Scale */}
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-ops-primary flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-sky-400" />
          Density & Scale
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SelectField
            label="Row Density"
            icon={Settings2}
            value={current.density}
            options={[
              { value: 'ULTRA_DENSE', label: 'Ultra Dense (28px)' },
              { value: 'BALANCED', label: 'Balanced (36px)' },
              { value: 'COMFORT', label: 'Comfort (44px)' },
            ]}
            onChange={(v) => onUpdate({ density: v as Density })}
            help="Controls how compact or spacious the data grid rows are"
          />
          <NumberField
            label="UI Scale"
            icon={Monitor}
            value={current.scaleFactor}
            min={0.8}
            max={1.5}
            step={0.05}
            unit="x"
            onChange={(v) => onUpdate({ scaleFactor: v })}
            help="Overall zoom level for the entire UI (0.8x - 1.5x)"
          />
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Work Item Defaults Tab
// ---------------------------------------------------------------------------

function WorkItemDefaultsTab({
  settings,
  onUpdate,
}: {
  settings: DisplaySettings;
  onUpdate: (partial: Partial<DisplaySettings>) => void;
}) {
  const { settings: current } = useDisplayStore();

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h3 className="text-base font-semibold text-ops-primary flex items-center gap-2">
          <Clock className="w-5 h-5 text-sky-400" />
          New Work Item Defaults
        </h3>
        <p className="text-sm text-ops-muted">
          These values will be automatically applied when you create new tasks
          via inline creation or the authoring modal.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <NumberField
            label="Default Duration"
            icon={Clock}
            value={current.defaultDurationDays || 5}
            min={1}
            max={365}
            unit="d"
            onChange={(v) => onUpdate({ defaultDurationDays: v })}
            help="Default duration in days for new work items"
          />
          <SelectField
            label="Default Delivery Mode"
            icon={Settings2}
            value={current.defaultDeliveryMode || 'WATERFALL'}
            options={DELIVERY_MODE_OPTIONS}
            onChange={(v) => onUpdate({ defaultDeliveryMode: v })}
            help="Default project delivery methodology for new tasks"
          />
          <SelectField
            label="Default Scheduling Mode"
            icon={Settings2}
            value={current.defaultSchedulingMode || 'AUTO'}
            options={SCHEDULING_MODE_OPTIONS}
            onChange={(v) => onUpdate({ defaultSchedulingMode: v })}
            help="Auto-scheduling dynamically computes dates from dependencies"
          />
        </div>
      </section>

      {/* Preview */}
      <section className="rounded-lg border border-ops-subtle bg-ops-surface p-4">
        <h4 className="text-sm font-medium text-ops-primary mb-3">Preview</h4>
        <div className="text-xs text-ops-muted space-y-1">
          <p>New tasks will be created with:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Duration: <span className="text-ops-primary">{current.defaultDurationDays || 5} days</span></li>
            <li>Delivery Mode: <span className="text-ops-primary">{current.defaultDeliveryMode || 'WATERFALL'}</span></li>
            <li>Scheduling: <span className="text-ops-primary">{current.defaultSchedulingMode || 'AUTO'}</span></li>
          </ul>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Settings View
// ---------------------------------------------------------------------------

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState<'appearance' | 'defaults'>('appearance');
  const [saved, setSaved] = useState(false);
  const { settings, updateDisplaySettings, hydrateDisplaySettings } = useDisplayStore();

  // Apply font changes to DOM
  useEffect(() => {
    const el = document.documentElement;
    if (settings.fontFamily) {
      document.body.style.fontFamily = `${settings.fontFamily}, system-ui, -apple-system, sans-serif`;
    }
    if (settings.fontSize) {
      el.style.fontSize = `${settings.fontSize}px`;
    }
  }, [settings.fontFamily, settings.fontSize]);

  const handleUpdate = useCallback(
    (partial: Partial<typeof settings>) => {
      updateDisplaySettings(partial);
      setSaved(false);
    },
    [updateDisplaySettings],
  );

  const handleReset = async () => {
    // Reset to defaults
    updateDisplaySettings({
      density: 'BALANCED',
      scaleFactor: 1.0,
      rowHeightPx: 36,
      theme: 'SCIF_DARK',
      colorAccessibility: 'STANDARD_RAG',
      fontFamily: 'Inter',
      fontSize: 16,
      defaultDurationDays: 5,
      defaultDeliveryMode: 'WATERFALL',
      defaultSchedulingMode: 'AUTO',
    });
    document.body.style.fontFamily = "'Inter', system-ui, -apple-system, sans-serif";
    document.documentElement.style.fontSize = '16px';
    setSaved(false);
  };

  const handleSave = () => {
    // Force immediate save by triggering the debounce
    updateDisplaySettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const tabs = [
    {
      key: 'appearance' as const,
      label: 'Appearance',
      icon: Palette,
    },
    {
      key: 'defaults' as const,
      label: 'Work Item Defaults',
      icon: Settings2,
    },
  ];

  return (
    <div className="flex flex-col h-full bg-ops-base">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-ops-subtle">
        <div className="flex items-center gap-3">
          <Settings2 className="w-6 h-6 text-sky-400" />
          <div>
            <h1 className="text-lg font-semibold text-ops-primary">Settings</h1>
            <p className="text-xs text-ops-muted">Customize your workspace appearance and default values</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-ops-muted hover:text-ops-primary border border-ops-subtle rounded-md hover:border-ops-strong transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
          <button
            onClick={handleSave}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
              saved
                ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                : 'bg-sky-600 text-white hover:bg-sky-500'
            }`}
          >
            {saved ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Saved
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                Save
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-ops-subtle px-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-sky-500 text-sky-400'
                  : 'border-transparent text-ops-muted hover:text-ops-primary'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl">
          {activeTab === 'appearance' ? (
            <AppearanceTab settings={settings} onUpdate={handleUpdate} />
          ) : (
            <WorkItemDefaultsTab settings={settings} onUpdate={handleUpdate} />
          )}
        </div>
      </div>
    </div>
  );
}
