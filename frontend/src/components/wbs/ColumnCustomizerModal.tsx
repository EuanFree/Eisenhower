/**
 * Column Customizer Modal
 *
 * Interactive modal for configuring the Gantt grid view layout.  Triggered
 * via toolbar button or Ctrl+Shift+C shortcut.
 *
 * Left Pane — Column Selection & Reordering
 * ------------------------------------------
 *
 * - Categorized checklist of all 45 catalogue columns (Hierarchy, CPM Schedule,
 *   Progress, EVM, Security, Logistics).
 * - Drag-to-reorder handle to define horizontal display sequence.
 * - Pinning toggles: Pin Left, Unpinned, Pin Right.
 * - Quick-filter search bar to locate specific fields instantly.
 *
 * Right Pane — Layout & Viewport Settings
 * ---------------------------------------
 *
 * - Radio selectors for Density (Ultra-Dense 28px, Balanced 36px, Comfort 44px).
 * - Timescale zoom defaults (Day, Week, Month/Quarter).
 * - Checkboxes to toggle Gantt layers: Baseline Shadows, Dependency Bezier Lines,
 *   Status Drop Line.
 *
 * Preset Management Bar
 * ---------------------
 *
 * - Dropdown listing available presets categorized as Personal, Project Shared,
 *   and System Standard.
 * - Save, Export, Import, and Copy Shareable URL actions.
 *
 * Grid Engine Integration
 * -----------------------
 *
 * - Synchronizes column state with TanStack Table (columnVisibility, columnOrder,
 *   columnPinning) in WbsTable.tsx.
 * - Dynamically toggles SVG layers in GanttViewport.tsx.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  X,
  Search,
  GripVertical,
  Pin,
  LayoutGrid,
  Monitor,
  Layers,
  Save,
  Download,
  Upload,
  Link as LinkIcon,
  Trash2,
  ChevronDown,
  ChevronUp,
  Settings2,
  Eye,
  EyeOff,
  Copy,
  Check,
  RotateCcw,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useColumnCustomizer } from '../../hooks/useColumnCustomizer';
import {
  ColumnConfig,
  ColumnCategory,
  ColumnPinPosition,
  DensityTier,
  ZoomLevel,
  CATEGORY_ORDER,
  CATEGORY_COLORS,
  COLUMNS_BY_CATEGORY,
  DENSITY_ROW_HEIGHTS,
  SharingScope,
} from '../../types/column_customizer';

// ---------------------------------------------------------------------------
// Draggable Column Row
// ---------------------------------------------------------------------------

const DraggableColumnRow: React.FC<{
  column: ColumnConfig;
  index: number;
  onToggleVisibility: (field: string) => void;
  onSetPin: (field: string, pinned: ColumnPinPosition) => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (index: number) => void;
}> = ({ column, index, onToggleVisibility, onSetPin, onDragStart, onDragOver, onDrop }) => {
  const [pinMenuOpen, setPinMenuOpen] = useState(false);

  const cyclePin = useCallback(() => {
    const next: Record<ColumnPinPosition, ColumnPinPosition> = {
      none: 'left',
      left: 'right',
      right: 'none',
    };
    onSetPin(column.field, next[column.pinned]);
  }, [column.field, column.pinned, onSetPin]);

  const pinLabel = column.pinned === 'left' ? 'Pinned Left' : column.pinned === 'right' ? 'Pinned Right' : 'Unpinned';

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(index);
      }}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={() => onDrop(index)}
      className={clsx(
        'group flex items-center gap-2 px-3 py-1.5 border-b border-border-ops-subtle/30 transition-colors',
        column.visible ? 'bg-bg-ops-surface' : 'bg-bg-ops-surface/50 opacity-60',
      )}
    >
      {/* Drag handle */}
      <div
        className="cursor-grab active:cursor-grabbing text-text-ops-muted hover:text-text-ops-primary transition-colors"
        title="Drag to reorder"
      >
        <GripVertical size={12} />
      </div>

      {/* Visibility toggle */}
      <button
        type="button"
        onClick={() => onToggleVisibility(column.field)}
        className={clsx(
          'p-0.5 rounded transition-colors',
          column.visible
            ? 'text-text-ops-primary hover:text-blue-400'
            : 'text-text-ops-muted hover:text-text-ops-primary',
        )}
        title={column.visible ? 'Hide column' : 'Show column'}
      >
        {column.visible ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>

      {/* Column label */}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-text-ops-primary truncate">{column.label}</div>
        <div className="text-xs text-text-ops-muted font-mono truncate">{column.field}</div>
      </div>

      {/* Width */}
      <span className="text-xs text-text-ops-muted font-mono w-12 text-right flex-shrink-0">
        {column.width}px
      </span>

      {/* Pin toggle */}
      <div className="relative flex-shrink-0">
        <button
          type="button"
          onClick={() => setPinMenuOpen(!pinMenuOpen)}
          className={clsx(
            'p-1 rounded transition-colors',
            column.pinned !== 'none'
              ? 'text-blue-400 hover:text-blue-300'
              : 'text-text-ops-muted hover:text-text-ops-primary',
          )}
          title={pinLabel}
        >
          {column.pinned !== 'none' ? <Pin size={12} /> : <Pin size={12} style={{ opacity: 0.4, transform: 'rotate(45deg)' }} />}
        </button>

        {pinMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPinMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-50 w-32 bg-bg-ops-surface border border-border-ops-strong rounded-lg shadow-2xl overflow-hidden">
              {(['none', 'left', 'right'] as ColumnPinPosition[]).map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => {
                    onSetPin(column.field, pos);
                    setPinMenuOpen(false);
                  }}
                  className={clsx(
                    'w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors',
                    column.pinned === pos
                      ? 'bg-blue-900/30 text-blue-300'
                      : 'text-text-ops-muted hover:bg-bg-ops-overlay',
                  )}
                >
                  {pos === 'none' ? <Pin size={12} style={{ opacity: 0.4, transform: 'rotate(45deg)' }} /> : <Pin size={12} />}
                  <span>{pos === 'none' ? 'Unpinned' : pos === 'left' ? 'Pin Left' : 'Pin Right'}</span>
                  {column.pinned === pos && <Check size={12} className="ml-auto" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Category Section
// ---------------------------------------------------------------------------

const CategorySection: React.FC<{
  category: ColumnCategory;
  columns: ColumnConfig[];
  onToggleVisibility: (field: string) => void;
  onSetPin: (field: string, pinned: ColumnPinPosition) => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (index: number) => void;
  startIndex: number;
}> = ({ category, columns, onToggleVisibility, onSetPin, onDragStart, onDragOver, onDrop, startIndex }) => {
  const [collapsed, setCollapsed] = useState(false);
  const colorClass = CATEGORY_COLORS[category];

  const allVisible = columns.every((c) => c.visible);
  const someVisible = columns.some((c) => c.visible);

  return (
    <div className="border-b border-border-ops-subtle/50">
      {/* Category header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-bg-ops-overlay/50 hover:bg-bg-ops-overlay transition-colors"
      >
        {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        <span className={clsx('text-xs font-semibold', colorClass)}>{category}</span>
        <span className="text-xs text-text-ops-muted ml-auto">{columns.length}</span>
        {/* Toggle all */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            columns.forEach((c) => onToggleVisibility(c.field));
          }}
          className="ml-2 p-0.5 rounded text-text-ops-muted hover:text-text-ops-primary transition-colors"
          title={allVisible ? 'Hide all' : 'Show all'}
        >
          {allVisible ? <EyeOff size={12} /> : someVisible ? <Eye size={12} /> : <Eye size={12} />}
        </button>
      </button>

      {/* Column rows */}
      {!collapsed && (
        <div>
          {columns.map((col, idx) => (
            <DraggableColumnRow
              key={col.field}
              column={col}
              index={startIndex + idx}
              onToggleVisibility={onToggleVisibility}
              onSetPin={onSetPin}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Preset Management Bar
// ---------------------------------------------------------------------------

const PresetManagementBar: React.FC = () => {
  const customizer = useColumnCustomizer();
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveScope, setSaveScope] = useState<SharingScope>('PRIVATE');
  const [showImportZone, setShowImportZone] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = useCallback(async () => {
    if (!saveName.trim()) return;
    try {
      await customizer.createPreset({
        name: saveName.trim(),
        description: saveDescription.trim() || undefined,
        sharing_scope: saveScope,
        config_payload: customizer.toConfigPayload(),
      });
      setShowSaveForm(false);
      setSaveName('');
      setSaveDescription('');
      setSaveScope('PRIVATE');
    } catch {
      // Error already handled by hook
    }
  }, [saveName, saveDescription, saveScope, customizer]);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await customizer.importFromFile(file);
      setShowImportZone(false);
    } catch (err) {
      console.error('Import failed:', err);
    }
    e.target.value = '';
  }, [customizer]);

  const handleCopyUrl = useCallback(async () => {
    const url = customizer.generateShareableUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      console.error('Failed to copy URL');
    }
  }, [customizer]);

  // Group presets by category
  const presetsByCategory = React.useMemo(() => {
    const groups: Record<string, typeof customizer.state.presets> = {};
    customizer.state.presets.forEach((p) => {
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category].push(p);
    });
    return groups;
  }, [customizer.state.presets]);

  return (
    <div className="space-y-3">
      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Preset dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-bg-ops-overlay border border-border-ops-subtle rounded-lg hover:bg-bg-ops-surface transition-colors"
          >
            <LayoutGrid size={12} />
            <span>Presets</span>
            {customizer.state.presets.length > 0 && (
              <span className="bg-bg-ops-base px-1.5 py-0.5 rounded text-xs">{customizer.state.presets.length}</span>
            )}
            <ChevronDown size={10} className={clsx(dropdownOpen && 'rotate-180 transition-transform')} />
          </button>

          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-50 w-72 bg-bg-ops-surface border border-border-ops-strong rounded-lg shadow-2xl overflow-hidden">
                {customizer.state.presets.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-text-ops-muted text-center">No saved presets</div>
                ) : (
                  Object.entries(presetsByCategory).map(([category, presets]) => (
                    <div key={category}>
                      <div className="px-3 py-1.5 text-xs font-semibold text-text-ops-muted bg-bg-ops-overlay/50">
                        {category}
                      </div>
                      {presets.map((preset) => (
                        <div
                          key={preset.id}
                          className="flex items-center gap-2 px-3 py-2 border-t border-border-ops-subtle/30"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              customizer.applyPreset(preset);
                              setDropdownOpen(false);
                            }}
                            className="flex-1 text-left min-w-0"
                          >
                            <div className="text-xs text-text-ops-primary truncate">{preset.name}</div>
                            {preset.description && (
                              <div className="text-xs text-text-ops-muted truncate">{preset.description}</div>
                            )}
                          </button>
                          {customizer.state.activePresetId === preset.id && (
                            <Check size={12} className="text-blue-400 flex-shrink-0" />
                          )}
                          <button
                            type="button"
                            onClick={() => customizer.deletePreset(preset.id)}
                            className="p-1 text-text-ops-muted hover:text-rag-red transition-colors flex-shrink-0"
                            aria-label={`Delete preset ${preset.name}`}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* Save */}
        <button
          type="button"
          onClick={() => setShowSaveForm(!showSaveForm)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-900/40 text-blue-300 border border-blue-700/50 rounded-lg hover:bg-blue-900/60 transition-colors"
        >
          <Save size={12} />
          <span>Save As...</span>
        </button>

        {/* Export */}
        <button
          type="button"
          onClick={() => customizer.exportToFile('custom_view')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-bg-ops-overlay border border-border-ops-subtle rounded-lg hover:bg-bg-ops-surface transition-colors"
        >
          <Download size={12} />
          <span>Export</span>
        </button>

        {/* Import */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-bg-ops-overlay border border-border-ops-subtle rounded-lg hover:bg-bg-ops-surface transition-colors"
        >
          <Upload size={12} />
          <span>Import</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".ppmview.json,.json"
          onChange={handleImport}
          className="hidden"
        />

        {/* Copy URL */}
        <button
          type="button"
          onClick={handleCopyUrl}
          className={clsx(
            'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors',
            copiedUrl
              ? 'bg-green-900/40 text-green-300 border-green-700/50'
              : 'bg-bg-ops-overlay border-border-ops-subtle hover:bg-bg-ops-surface',
          )}
        >
          {copiedUrl ? <Check size={12} /> : <LinkIcon size={12} />}
          <span>{copiedUrl ? 'Copied!' : 'Copy URL'}</span>
        </button>

        {/* Reset */}
        <button
          type="button"
          onClick={customizer.resetToDefaults}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-bg-ops-overlay border border-border-ops-subtle rounded-lg hover:bg-bg-ops-surface transition-colors ml-auto"
        >
          <RotateCcw size={12} />
          <span>Reset</span>
        </button>
      </div>

      {/* Save form */}
      {showSaveForm && (
        <div className="p-3 bg-bg-ops-overlay/50 border border-border-ops-subtle rounded-lg space-y-2">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Preset name..."
            className="w-full bg-bg-ops-overlay border border-border-ops-subtle rounded px-3 py-2 text-xs text-text-ops-primary placeholder-text-ops-muted focus:outline-none focus:border-blue-500"
            autoFocus
          />
          <input
            type="text"
            value={saveDescription}
            onChange={(e) => setSaveDescription(e.target.value)}
            placeholder="Description (optional)..."
            className="w-full bg-bg-ops-overlay border border-border-ops-subtle rounded px-3 py-2 text-xs text-text-ops-primary placeholder-text-ops-muted focus:outline-none focus:border-blue-500"
          />
          <div className="flex items-center gap-2">
            <select
              value={saveScope}
              onChange={(e) => setSaveScope(e.target.value as SharingScope)}
              className="flex-1 bg-bg-ops-overlay border border-border-ops-subtle rounded px-3 py-2 text-xs text-text-ops-primary focus:outline-none focus:border-blue-500"
            >
              <option value="PRIVATE">Private</option>
              <option value="PROJECT_SHARED">Project Shared</option>
            </select>
            <button
              type="button"
              onClick={handleSave}
              disabled={!saveName.trim()}
              className={clsx(
                'px-4 py-2 text-xs rounded transition-colors',
                saveName.trim()
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-bg-ops-overlay text-text-ops-muted cursor-not-allowed',
              )}
            >
              Save Preset
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSaveForm(false);
                setSaveName('');
                setSaveDescription('');
              }}
              className="px-3 py-2 text-xs bg-bg-ops-overlay text-text-ops-muted rounded hover:text-text-ops-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error message */}
      {customizer.state.error && (
        <div className="px-3 py-2 bg-red-900/20 border border-red-700/50 rounded-lg text-xs text-red-300">
          {customizer.state.error}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Right Pane — Layout & Viewport Settings
// ---------------------------------------------------------------------------

const LayoutSettingsPane: React.FC = () => {
  const customizer = useColumnCustomizer();
  const { layout } = customizer.state;

  const densityOptions: { value: DensityTier; label: string; rowHeight: number }[] = [
    { value: 'ULTRA_DENSE', label: 'Ultra-Dense', rowHeight: 28 },
    { value: 'BALANCED', label: 'Balanced', rowHeight: 36 },
    { value: 'COMFORT', label: 'Comfort', rowHeight: 44 },
  ];

  const zoomOptions: { value: ZoomLevel; label: string }[] = [
    { value: 'DAYS', label: 'Days' },
    { value: 'WEEKS', label: 'Weeks' },
    { value: 'MONTHS', label: 'Months' },
  ];

  return (
    <div className="space-y-4">
      {/* Density */}
      <div>
        <h4 className="text-xs font-semibold text-text-ops-muted mb-2 flex items-center gap-2">
          <Monitor size={12} />
          Density
        </h4>
        <div className="space-y-1">
          {densityOptions.map((opt) => (
            <label
              key={opt.value}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors',
                layout.density === opt.value
                  ? 'bg-blue-900/30 border border-blue-700/50'
                  : 'bg-bg-ops-overlay/50 border border-transparent hover:bg-bg-ops-overlay',
              )}
            >
              <input
                type="radio"
                name="density"
                value={opt.value}
                checked={layout.density === opt.value}
                onChange={() => customizer.setDensity(opt.value)}
                className="sr-only"
              />
              <div className={clsx(
                'w-4 h-4 rounded-full border-2 flex items-center justify-center',
                layout.density === opt.value ? 'border-blue-400' : 'border-text-ops-muted',
              )}>
                {layout.density === opt.value && <div className="w-2 h-2 rounded-full bg-blue-400" />}
              </div>
              <div className="flex-1">
                <div className="text-xs text-text-ops-primary">{opt.label}</div>
                <div className="text-xs text-text-ops-muted">{opt.rowHeight}px row height</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Zoom Level */}
      <div>
        <h4 className="text-xs font-semibold text-text-ops-muted mb-2 flex items-center gap-2">
          <LayoutGrid size={12} />
          Timescale Zoom
        </h4>
        <div className="flex items-center bg-bg-ops-overlay rounded-lg border border-border-ops-subtle overflow-hidden">
          {zoomOptions.map((opt, idx) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => customizer.setZoomLevel(opt.value)}
              className={clsx(
                'flex-1 px-3 py-2 text-xs transition-colors',
                idx > 0 && 'border-l border-border-ops-subtle',
                layout.zoomLevel === opt.value
                  ? 'bg-blue-600 text-white'
                  : 'text-text-ops-muted hover:text-text-ops-primary',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Split Ratio */}
      <div>
        <h4 className="text-xs font-semibold text-text-ops-muted mb-2 flex items-center gap-2">
          <Settings2 size={12} />
          Split Ratio
        </h4>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={10}
            max={90}
            value={Math.round(layout.splitRatio * 100)}
            onChange={(e) => customizer.setSplitRatio(parseInt(e.target.value, 10) / 100)}
            className="flex-1 accent-blue-500"
          />
          <span className="text-xs font-mono text-text-ops-muted w-12 text-right">
            {Math.round(layout.splitRatio * 100)}%
          </span>
        </div>
      </div>

      {/* Gantt Layers */}
      <div>
        <h4 className="text-xs font-semibold text-text-ops-muted mb-2 flex items-center gap-2">
          <Layers size={12} />
          Gantt Layers
        </h4>
        <div className="space-y-1">
          {[
            { key: 'showBaselines' as const, label: 'Baseline Shadows (B₀ / B_curr)' },
            { key: 'showDependencies' as const, label: 'Dependency Bezier Lines' },
            { key: 'showDropLine' as const, label: 'Status Drop Line' },
            { key: 'showPresence' as const, label: 'Presence Avatars' },
          ].map(({ key, label }) => (
            <label
              key={key}
              className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors hover:bg-bg-ops-overlay"
            >
              <input
                type="checkbox"
                checked={layout.ganttLayers[key]}
                onChange={() => customizer.toggleGanttLayer(key as any)}
                className="sr-only"
              />
              <div className={clsx(
                'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                layout.ganttLayers[key]
                  ? 'bg-blue-600 border-blue-600'
                  : 'border-text-ops-muted',
              )}>
                {layout.ganttLayers[key] && <Check size={10} className="text-white" />}
              </div>
              <span className="text-xs text-text-ops-primary">{label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main ColumnCustomizerModal Component
// ---------------------------------------------------------------------------

interface ColumnCustomizerModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Close callback */
  onClose: () => void;
}

const ColumnCustomizerModal: React.FC<ColumnCustomizerModalProps> = ({ isOpen, onClose }) => {
  const customizer = useColumnCustomizer();
  const [activeTab, setActiveTab] = useState<'columns' | 'layout'>('columns');
  const dragIndexRef = useRef<number | null>(null);

  // Fetch presets on mount
  useEffect(() => {
    if (isOpen) {
      customizer.fetchPresets();
    }
  }, [isOpen, customizer]);

  // Keyboard shortcut: Ctrl+Shift+C
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          customizer.openModal();
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, customizer]);

  // Drag-to-reorder handlers
  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((dropIndex: number) => {
    const fromIndex = dragIndexRef.current;
    if (fromIndex !== null && fromIndex !== dropIndex) {
      customizer.reorderColumns(fromIndex, dropIndex);
    }
    dragIndexRef.current = null;
  }, [customizer]);

  // Build category column lists with correct indices
  const categoryColumns = React.useMemo(() => {
    const result: { category: ColumnCategory; columns: ColumnConfig[]; startIndex: number }[] = [];
    let index = 0;
    for (const category of CATEGORY_ORDER) {
      const cols = customizer.state.columns.filter(
        (c) => COLUMNS_BY_CATEGORY[category].some((def) => def.field === c.field),
      );
      result.push({ category, columns: cols, startIndex: index });
      index += cols.length;
    }
    return result;
  }, [customizer.state.columns]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed inset-4 z-50 bg-bg-ops-surface border border-border-ops-strong rounded-xl shadow-2xl flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Column Customizer"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-ops-subtle bg-bg-ops-overlay/50">
          <div className="flex items-center gap-3">
            <Settings2 size={16} className="text-blue-400" />
            <h2 className="text-sm font-semibold text-text-ops-primary">Column Customizer</h2>
            <kbd className="text-xs bg-bg-ops-base border border-border-ops-subtle px-1.5 py-0.5 rounded font-mono text-text-ops-muted">
              Ctrl+Shift+C
            </kbd>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-text-ops-muted hover:text-text-ops-primary rounded-lg transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border-ops-subtle bg-bg-ops-overlay/30">
          <button
            type="button"
            onClick={() => setActiveTab('columns')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 text-xs rounded-lg transition-colors',
              activeTab === 'columns'
                ? 'bg-blue-900/30 text-blue-300'
                : 'text-text-ops-muted hover:text-text-ops-primary',
            )}
          >
            <LayoutGrid size={12} />
            <span>Columns</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('layout')}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 text-xs rounded-lg transition-colors',
              activeTab === 'layout'
                ? 'bg-blue-900/30 text-blue-300'
                : 'text-text-ops-muted hover:text-text-ops-primary',
            )}
          >
            <Monitor size={12} />
            <span>Layout</span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-text-ops-muted">
              {customizer.state.columns.filter((c) => c.visible).length} visible
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          {activeTab === 'columns' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Search bar */}
              <div className="px-4 py-2 border-b border-border-ops-subtle/50">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-ops-muted pointer-events-none"
                  />
                  <input
                    type="text"
                    value={customizer.state.columnSearch}
                    onChange={(e) => customizer.setColumnSearch(e.target.value)}
                    placeholder="Search columns..."
                    className="w-full bg-bg-ops-overlay border border-border-ops-subtle rounded-lg pl-9 pr-4 py-2 text-xs text-text-ops-primary placeholder-text-ops-muted focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Column list */}
              <div className="flex-1 overflow-y-auto">
                {CATEGORY_ORDER.map((category) => {
                  const catData = categoryColumns.find((c) => c.category === category);
                  if (!catData) return null;

                  // Filter columns if search is active
                  const filteredCols = customizer.state.columnSearch
                    ? catData.columns.filter(
                        (c) =>
                          c.field.toLowerCase().includes(customizer.state.columnSearch.toLowerCase()) ||
                          c.label.toLowerCase().includes(customizer.state.columnSearch.toLowerCase()),
                      )
                    : catData.columns;

                  if (filteredCols.length === 0) return null;

                  return (
                    <CategorySection
                      key={category}
                      category={category}
                      columns={filteredCols}
                      onToggleVisibility={customizer.toggleColumnVisibility}
                      onSetPin={customizer.setColumnPin}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      startIndex={catData.startIndex}
                    />
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4">
              <LayoutSettingsPane />
            </div>
          )}
        </div>

        {/* Footer — Preset Management */}
        <div className="border-t border-border-ops-subtle bg-bg-ops-overlay/30 p-4">
          <PresetManagementBar />
        </div>
      </div>
    </>
  );
};

export default ColumnCustomizerModal;
