/**
 * Field Definition Drawer
 *
 * Dual-pane slide-out panel for creating and editing custom field definitions.
 *
 * Layout
 * ------
 * - **Left Pane (Schema Form)** — Tabbed form with three sections:
 *   1. **Field Identification** — Display Label, Machine Slug (auto-generates
 *      cf_ prefix, enforces lowercase alphanumeric + underscores).
 *   2. **Scope & Data Type** — Target Entity selector, Applicable Tiers multi-select,
 *      Data Type selector.
 *   3. **Dynamic Constraints & Validation** — Enum chip tag manager, numeric Min/Max
 *      bounds, Regex pattern validator, Mandatory toggle, IPMR Export toggle.
 *   4. **ABAC Security & Classification** — Read/Write Clearance pickers,
 *      Permitted Roles multiselect.
 * - **Right Pane (Live Sandbox Preview)** — Embedded LiveFieldPreviewBox component
 *   that renders the exact form input in real time with a clearance emulator.
 *
 * Usage
 * -----
 *
 * ```tsx
 * <FieldDefinitionDrawer
 *   isOpen={isDrawerOpen}
 *   onClose={() => setIsDrawerOpen(false)}
 *   editingField={selectedField}
 *   onSave={handleSave}
 * />
 * ```
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  X,
  Save,
  Eye,
  Shield,
  Lock,
  AlertTriangle,
  Plus,
  Trash2,
  FileText,
  Settings,
  Key,
  Tag,
  Layers,
  Hash,
  ListChecks,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../../services/api';
import LiveFieldPreviewBox from './LiveFieldPreviewBox';
import type {
  CustomFieldDefinition,
  FieldDefinitionFormState,
  ValidationRules,
  DataType,
  TargetEntity,
  ClearanceLevel,
  PermittedRole,
  WBSTier,
} from '../../../types/custom_fields';
import {
  DATA_TYPES,
  TARGET_ENTITIES,
  CLEARANCE_LEVELS,
  VALID_TIERS,
  PERMITTED_ROLES,
  DATA_TYPE_METADATA,
  TARGET_ENTITY_METADATA,
  CLEARANCE_COLORS,
  TIER_METADATA,
  createEmptyFormState,
  formStateFromDefinition,
} from '../../../types/custom_fields';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FieldDefinitionDrawerProps {
  /** Whether the drawer is open */
  isOpen: boolean;
  /** Callback to close the drawer */
  onClose: () => void;
  /** Field being edited (null for new field) */
  editingField: CustomFieldDefinition | null;
  /** Callback when a field is saved */
  onSave: (field: CustomFieldDefinition) => void;
}

// ---------------------------------------------------------------------------
// Main Drawer Component
// ---------------------------------------------------------------------------

const FieldDefinitionDrawer: React.FC<FieldDefinitionDrawerProps> = ({
  isOpen,
  onClose,
  editingField,
  onSave,
}) => {
  const [form, setForm] = useState<FieldDefinitionFormState>(createEmptyFormState());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'metadata' | 'constraints' | 'security'>('metadata');
  const [newEnumOption, setNewEnumOption] = useState('');

  // Initialize form when editing an existing field
  useEffect(() => {
    if (editingField) {
      setForm(formStateFromDefinition(editingField));
    } else {
      setForm(createEmptyFormState());
    }
    setActiveTab('metadata');
    setError(null);
  }, [editingField, isOpen]);

  // Update form field
  const updateField = useCallback(
    <K extends keyof FieldDefinitionFormState>(key: K, value: FieldDefinitionFormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // Auto-enforce cf_ prefix and lowercase alphanumeric + underscores
  const handleFieldKeyChange = useCallback((value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!sanitized.startsWith('cf_') && sanitized.length > 0) {
      updateField('field_key', `cf_${sanitized.replace(/^cf_/, '')}`);
    } else {
      updateField('field_key', sanitized);
    }
  }, [updateField]);

  // Toggle tier selection
  const toggleTier = useCallback((tier: WBSTier) => {
    setForm((prev) => {
      const tiers = prev.applicable_tiers.includes(tier)
        ? prev.applicable_tiers.filter((t) => t !== tier)
        : [...prev.applicable_tiers, tier];
      return { ...prev, applicable_tiers: tiers };
    });
  }, []);

  // Toggle role selection
  const toggleRole = useCallback((role: PermittedRole) => {
    setForm((prev) => {
      const roles = prev.required_roles.includes(role)
        ? prev.required_roles.filter((r) => r !== role)
        : [...prev.required_roles, role];
      return { ...prev, required_roles: roles.length ? roles : ['USER'] };
    });
  }, []);

  // Add enum option
  const addEnumOption = useCallback(() => {
    if (!newEnumOption.trim()) return;
    setForm((prev) => ({
      ...prev,
      enum_options: prev.enum_options.includes(newEnumOption.trim())
        ? prev.enum_options
        : [...prev.enum_options, newEnumOption.trim()],
    }));
    setNewEnumOption('');
  }, [newEnumOption]);

  // Remove enum option
  const removeEnumOption = useCallback((option: string) => {
    setForm((prev) => ({
      ...prev,
      enum_options: prev.enum_options.filter((o) => o !== option),
    }));
  }, []);

  // Update validation rule
  const updateValidationRule = useCallback(
    (key: keyof ValidationRules, value: number | string | undefined) => {
      setForm((prev) => ({
        ...prev,
        validation_rules: { ...prev.validation_rules, [key]: value },
      }));
    },
    [],
  );

  // Validate form
  const validateForm = useCallback((): string | null => {
    // Field key regex: ^cf_[a-z0-9_]{2,60}$
    const keyRegex = /^cf_[a-z0-9_]{2,60}$/;
    if (!form.field_key || !keyRegex.test(form.field_key)) {
      return 'Field key must match ^cf_[a-z0-9_]{2,60}$';
    }
    if (!form.display_label.trim()) {
      return 'Display label is required';
    }
    if (form.data_type === 'SINGLE_ENUM' || form.data_type === 'MULTI_ENUM') {
      if (!form.enum_options.length) {
        return 'Enum options are required for enum data types';
      }
    }
    if (form.validation_rules?.regex_pattern) {
      try {
        new RegExp(form.validation_rules.regex_pattern);
      } catch {
        return 'Invalid regex pattern';
      }
    }
    if (
      form.validation_rules?.min !== undefined &&
      form.validation_rules?.max !== undefined &&
      form.validation_rules.min > form.validation_rules.max
    ) {
      return 'Min value cannot exceed max value';
    }
    return null;
  }, [form]);

  // Save field definition
  const handleSave = useCallback(async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const payload = {
        field_key: form.field_key,
        display_label: form.display_label,
        target_entity: form.target_entity,
        applicable_tiers: form.applicable_tiers.length ? form.applicable_tiers : null,
        data_type: form.data_type,
        enum_options: form.enum_options.length ? form.enum_options : null,
        validation_rules: Object.keys(form.validation_rules).length ? form.validation_rules : null,
        default_value: form.default_value,
        is_mandatory: form.is_mandatory,
        read_clearance_level: form.read_clearance_level,
        write_clearance_level: form.write_clearance_level,
        required_roles: form.required_roles,
      };

      let response;
      if (editingField) {
        response = await api.put(`/api/v1/admin/custom-fields/${editingField.id}`, payload);
      } else {
        response = await api.post('/api/v1/admin/custom-fields', payload);
      }

      onSave(response.data);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save field definition');
    } finally {
      setIsSaving(false);
    }
  }, [form, editingField, onSave, onClose, validateForm]);

  // Field key validation status
  const fieldKeyStatus = useMemo(() => {
    const keyRegex = /^cf_[a-z0-9_]{2,60}$/;
    if (!form.field_key || form.field_key === 'cf_') return { valid: false, message: 'Enter a field key' };
    if (keyRegex.test(form.field_key)) return { valid: true, message: 'Valid field key' };
    return { valid: false, message: 'Must match ^cf_[a-z0-9_]{2,60}$' };
  }, [form.field_key]);

  // Render tab content
  const renderTabContent = useMemo(() => {
    switch (activeTab) {
      case 'metadata':
        return (
          <div className="space-y-4">
            {/* Display Label */}
            <div>
              <label className="block text-xs text-ops-muted mb-1 flex items-center gap-1">
                <Tag className="w-3 h-3" />
                Display Label <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.display_label}
                onChange={(e) => updateField('display_label', e.target.value)}
                className="w-full bg-ops-overlay border border-ops-subtle rounded px-2 py-1.5 text-sm text-ops-primary"
                placeholder="Avionics DAL Target"
              />
            </div>

            {/* Machine Slug */}
            <div>
              <label className="block text-xs text-ops-muted mb-1 flex items-center gap-1">
                <Key className="w-3 h-3" />
                Machine Slug <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.field_key}
                onChange={(e) => handleFieldKeyChange(e.target.value)}
                className={clsx(
                  'w-full bg-ops-overlay border rounded px-2 py-1.5 text-sm font-mono text-ops-primary',
                  fieldKeyStatus.valid
                    ? 'border-green-500/50'
                    : form.field_key && form.field_key !== 'cf_'
                    ? 'border-red-500/50'
                    : 'border-ops-subtle',
                )}
                placeholder="cf_avionics_dal_target"
                disabled={!!editingField}
              />
              <p
                className={clsx(
                  'text-xs mt-0.5',
                  fieldKeyStatus.valid ? 'text-green-400' : 'text-ops-muted',
                )}
              >
                Auto-generates cf_ prefix. {editingField && 'Cannot be changed after creation.'}
              </p>
            </div>

            {/* Target Entity */}
            <div>
              <label className="block text-xs text-ops-muted mb-1 flex items-center gap-1">
                <Layers className="w-3 h-3" />
                Target Entity <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TARGET_ENTITIES.map((entity) => {
                  const meta = TARGET_ENTITY_METADATA[entity];
                  const isActive = form.target_entity === entity;
                  return (
                    <button
                      key={entity}
                      type="button"
                      onClick={() => updateField('target_entity', entity)}
                      className={clsx(
                        'px-3 py-2 rounded border text-left transition-colors',
                        isActive
                          ? 'bg-sky-900/30 border-sky-500 text-sky-400'
                          : 'bg-ops-overlay border-ops-subtle text-ops-muted hover:border-ops-strong',
                      )}
                    >
                      <div className="text-sm font-medium">{meta.icon} {meta.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Applicable Tiers */}
            {form.target_entity === 'WORK_ITEM' && (
              <div>
                <label className="block text-xs text-ops-muted mb-1 flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  Applicable Tiers
                </label>
                <p className="text-xs text-ops-muted mb-2">Leave empty to apply to all tiers.</p>
                <div className="flex flex-wrap gap-2">
                  {VALID_TIERS.map((tier) => {
                    const meta = TIER_METADATA[tier];
                    const isActive = form.applicable_tiers.includes(tier);
                    return (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => toggleTier(tier)}
                        className={clsx(
                          'px-2 py-1 rounded text-xs border transition-colors',
                          isActive
                            ? 'bg-sky-900/30 border-sky-500 text-sky-400'
                            : 'bg-ops-overlay border-ops-subtle text-ops-muted hover:border-ops-strong',
                        )}
                      >
                        {meta.icon} {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );

      case 'constraints':
        return (
          <div className="space-y-4">
            {/* Data Type */}
            <div>
              <label className="block text-xs text-ops-muted mb-1 flex items-center gap-1">
                <Settings className="w-3 h-3" />
                Data Type <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {DATA_TYPES.map((type) => {
                  const meta = DATA_TYPE_METADATA[type];
                  const isActive = form.data_type === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => updateField('data_type', type)}
                      className={clsx(
                        'px-3 py-2 rounded border text-left transition-colors',
                        isActive
                          ? 'bg-sky-900/30 border-sky-500 text-sky-400'
                          : 'bg-ops-overlay border-ops-subtle text-ops-muted hover:border-ops-strong',
                      )}
                    >
                      <div className="text-sm font-medium">{meta.icon} {meta.label}</div>
                      <div className="text-xs opacity-70">{meta.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Enum Options */}
            {(form.data_type === 'SINGLE_ENUM' || form.data_type === 'MULTI_ENUM') && (
              <div>
                <label className="block text-xs text-ops-muted mb-1 flex items-center gap-1">
                  <ListChecks className="w-3 h-3" />
                  Enum Options <span className="text-red-400">*</span>
                </label>
                <p className="text-xs text-ops-muted mb-2">
                  {form.data_type === 'MULTI_ENUM'
                    ? 'Users can select multiple values.'
                    : 'Users select one value from the list.'}
                </p>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newEnumOption}
                    onChange={(e) => setNewEnumOption(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEnumOption())}
                    className="flex-1 bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-sm text-ops-primary"
                    placeholder="Add option..."
                  />
                  <button
                    type="button"
                    onClick={addEnumOption}
                    className="px-2 py-1 bg-ops-overlay border border-ops-subtle rounded text-ops-primary hover:bg-ops-surface transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-1">
                  {form.enum_options.map((option) => (
                    <div
                      key={option}
                      className="flex items-center justify-between px-2 py-1 bg-ops-overlay rounded border border-ops-subtle"
                    >
                      <span className="text-sm text-ops-primary">{option}</span>
                      <button
                        type="button"
                        onClick={() => removeEnumOption(option)}
                        className="text-red-400 hover:text-red-300 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Numeric Bounds */}
            {(form.data_type === 'INTEGER' || form.data_type === 'DECIMAL' || form.data_type === 'CURRENCY') && (
              <div>
                <label className="block text-xs text-ops-muted mb-1">Numeric Bounds</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-ops-muted mb-0.5">Min</label>
                    <input
                      type="number"
                      step={form.data_type === 'INTEGER' ? '1' : '0.01'}
                      value={form.validation_rules.min ?? ''}
                      onChange={(e) =>
                        updateValidationRule('min', e.target.value ? Number(e.target.value) : undefined)
                      }
                      className="w-full bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-sm text-ops-primary"
                      placeholder="No minimum"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-ops-muted mb-0.5">Max</label>
                    <input
                      type="number"
                      step={form.data_type === 'INTEGER' ? '1' : '0.01'}
                      value={form.validation_rules.max ?? ''}
                      onChange={(e) =>
                        updateValidationRule('max', e.target.value ? Number(e.target.value) : undefined)
                      }
                      className="w-full bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-sm text-ops-primary"
                      placeholder="No maximum"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Regex Pattern */}
            {form.data_type === 'STRING' && (
              <div>
                <label className="block text-xs text-ops-muted mb-1">Regex Pattern Validator</label>
                <input
                  type="text"
                  value={form.validation_rules.regex_pattern ?? ''}
                  onChange={(e) => updateValidationRule('regex_pattern', e.target.value || undefined)}
                  className="w-full bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-sm font-mono text-ops-primary"
                  placeholder="e.g. ^[A-Z]{3}-\d{4}$"
                />
                <p className="text-xs text-ops-muted mt-0.5">
                  PCRE-compatible pattern. Value must match to be accepted.
                </p>
              </div>
            )}

            {/* Default Value */}
            <div>
              <label className="block text-xs text-ops-muted mb-1">Default Value</label>
              {form.data_type === 'BOOLEAN' ? (
                <div className="flex items-center gap-2">
                  {['true', 'false', 'none'].map((val) => {
                    const bv = val === 'true' ? true : val === 'false' ? false : null;
                    const isActive = form.default_value === bv;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => updateField('default_value', bv)}
                        className={clsx(
                          'px-3 py-1 rounded text-xs border transition-colors',
                          isActive
                            ? 'bg-green-900/30 border-green-500 text-green-400'
                            : 'bg-ops-overlay border-ops-subtle text-ops-muted',
                        )}
                      >
                        {val.charAt(0).toUpperCase() + val.slice(1)}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  type={form.data_type === 'DATE' ? 'date' : 'text'}
                  value={form.default_value ?? ''}
                  onChange={(e) => {
                    let value: any = e.target.value || null;
                    if (form.data_type === 'INTEGER' && value) value = Number(value);
                    if ((form.data_type === 'DECIMAL' || form.data_type === 'CURRENCY') && value)
                      value = parseFloat(value);
                    updateField('default_value', value);
                  }}
                  className="w-full bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-sm text-ops-primary"
                  placeholder="No default"
                />
              )}
            </div>

            {/* Mandatory Toggle */}
            <div className="flex items-center justify-between p-3 bg-ops-overlay rounded border border-ops-subtle">
              <div>
                <div className="text-sm text-ops-primary">Mandatory Field</div>
                <div className="text-xs text-ops-muted">Blocks entity completion if empty</div>
              </div>
              <button
                type="button"
                onClick={() => updateField('is_mandatory', !form.is_mandatory)}
                className={clsx(
                  'w-10 h-5 rounded-full relative transition-colors',
                  form.is_mandatory ? 'bg-sky-500' : 'bg-ops-surface',
                )}
              >
                <div
                  className={clsx(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-ops-base transition-transform',
                    form.is_mandatory ? 'left-5' : 'left-0.5',
                  )}
                />
              </button>
            </div>

            {/* IPMR Export Toggle */}
            <div className="flex items-center justify-between p-3 bg-ops-overlay rounded border border-ops-subtle">
              <div>
                <div className="text-sm text-ops-primary">Include in IPMR Export</div>
                <div className="text-xs text-ops-muted">Appear in statutory EVM reports</div>
              </div>
              <button
                type="button"
                onClick={() => updateField('include_in_ipmr', !form.include_in_ipmr)}
                className={clsx(
                  'w-10 h-5 rounded-full relative transition-colors',
                  form.include_in_ipmr ? 'bg-sky-500' : 'bg-ops-surface',
                )}
              >
                <div
                  className={clsx(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-ops-base transition-transform',
                    form.include_in_ipmr ? 'left-5' : 'left-0.5',
                  )}
                />
              </button>
            </div>
          </div>
        );

      case 'security':
        return (
          <div className="space-y-4">
            {/* Read Clearance */}
            <div>
              <label className="block text-xs text-ops-muted mb-1 flex items-center gap-1">
                <Eye className="w-3 h-3" />
                Minimum Read Clearance
              </label>
              <div className="flex gap-2">
                {CLEARANCE_LEVELS.map((level) => {
                  const colors = CLEARANCE_COLORS[level];
                  const isActive = form.read_clearance_level === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => updateField('read_clearance_level', level)}
                      className={clsx(
                        'flex-1 px-2 py-2 rounded border text-center text-xs font-medium transition-colors',
                        isActive
                          ? `${colors.bg} ${colors.border} ${colors.text}`
                          : 'bg-ops-overlay border-ops-subtle text-ops-muted hover:border-ops-strong',
                      )}
                    >
                      {level.replace('_', ' ')}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Write Clearance */}
            <div>
              <label className="block text-xs text-ops-muted mb-1 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Minimum Write Clearance
              </label>
              <div className="flex gap-2">
                {CLEARANCE_LEVELS.map((level) => {
                  const colors = CLEARANCE_COLORS[level];
                  const isActive = form.write_clearance_level === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => updateField('write_clearance_level', level)}
                      className={clsx(
                        'flex-1 px-2 py-2 rounded border text-center text-xs font-medium transition-colors',
                        isActive
                          ? `${colors.bg} ${colors.border} ${colors.text}`
                          : 'bg-ops-overlay border-ops-subtle text-ops-muted hover:border-ops-strong',
                      )}
                    >
                      {level.replace('_', ' ')}
                    </button>
                  );
                })}
              </div>
              {form.write_clearance_level !== form.read_clearance_level && (
                <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Write clearance differs from read clearance
                </p>
              )}
            </div>

            {/* Permitted Roles */}
            <div>
              <label className="block text-xs text-ops-muted mb-1 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                Permitted Roles
              </label>
              <p className="text-xs text-ops-muted mb-2">
                Users must have at least one of these roles to edit this field.
              </p>
              <div className="flex flex-wrap gap-2">
                {PERMITTED_ROLES.map((role) => {
                  const isActive = form.required_roles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      className={clsx(
                        'px-2 py-1 rounded text-xs border transition-colors',
                        isActive
                          ? 'bg-sky-900/30 border-sky-500 text-sky-400'
                          : 'bg-ops-overlay border-ops-subtle text-ops-muted hover:border-ops-strong',
                      )}
                    >
                      {role.replace(/_/g, ' ')}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  }, [
    form,
    activeTab,
    newEnumOption,
    editingField,
    toggleTier,
    toggleRole,
    addEnumOption,
    removeEnumOption,
    updateField,
    updateValidationRule,
    handleFieldKeyChange,
    fieldKeyStatus,
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9000] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-[1100px] max-w-full bg-ops-base border-l border-ops-strong flex flex-col h-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-ops-subtle">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-sky-400" />
            <h2 className="text-lg font-semibold text-ops-primary">
              {editingField ? 'Edit Field Definition' : 'New Field Definition'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-ops-overlay text-ops-muted hover:text-ops-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-ops-subtle px-4">
          {[
            { key: 'metadata' as const, label: 'Field Identification', icon: FileText },
            { key: 'constraints' as const, label: 'Type & Constraints', icon: Settings },
            { key: 'security' as const, label: 'ABAC Security', icon: Shield },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors',
                activeTab === tab.key
                  ? 'border-sky-500 text-sky-400'
                  : 'border-transparent text-ops-muted hover:text-ops-primary',
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content: Dual-pane (Form + Preview) */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left Pane: Schema Form */}
          <div className="flex-1 overflow-y-auto p-4 border-r border-ops-subtle">
            {error && (
              <div className="mb-4 p-3 bg-red-900/20 border border-red-500/50 rounded text-sm text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
            {renderTabContent}
          </div>

          {/* Right Pane: Live Sandbox Preview */}
          <div className="w-80 overflow-y-auto p-4 bg-ops-surface">
            <LiveFieldPreviewBox formState={form} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-ops-subtle">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-ops-muted hover:text-ops-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors',
              isSaving
                ? 'bg-ops-overlay text-ops-muted cursor-not-allowed'
                : 'bg-sky-600 hover:bg-sky-500 text-white',
            )}
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : editingField ? 'Update Field' : 'Create Field'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FieldDefinitionDrawer;
