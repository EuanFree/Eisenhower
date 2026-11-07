/**
 * Field Definition Drawer
 *
 * Slide-out configurator allowing authorized users (SYSTEM_ADMIN, PMO_DIRECTOR)
 * to author or edit custom field definitions.
 *
 * Sections
 * --------
 * 1. **Basic Metadata** — Key slug (auto-enforces cf_ prefix), Display Label,
 *    Target Entity, Tier Multi-Select.
 * 2. **Type & Constraints** — Data Type selector; dynamic option list builder
 *    for SINGLE_ENUM and MULTI_ENUM; numeric Min/Max bounds; Regex input validator.
 * 3. **Security & ABAC Gates** — Minimum Read/Write Clearance, Permitted Role
 *    Badges, Mandatory toggle, and IPMR Export inclusion switch.
 *
 * A side-by-side Form Preview Sandbox renders the generated form input component
 * in real time, validating regex and formatting rules against test inputs before
 * saving.
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
  Unlock,
  AlertTriangle,
  Check,
  Plus,
  Trash2,
  FileText,
  Settings,
  Key,
  Tag,
  Layers,
  Hash,
  Calendar,
  ToggleLeft,
  ToggleRight,
  DollarSign,
  List,
  ListChecks,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../services/api';
import type {
  CustomFieldDefinition,
  FieldDefinitionFormState,
  ValidationRules,
  DataType,
  TargetEntity,
  ClearanceLevel,
  PermittedRole,
  WBSTier,
  PreviewTestResult,
} from '../../types/custom_fields';
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
} from '../../types/custom_fields';

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
// Form Preview Sandbox Component
// ---------------------------------------------------------------------------

interface FormPreviewSandboxProps {
  formState: FieldDefinitionFormState;
}

const FormPreviewSandbox: React.FC<FormPreviewSandboxProps> = ({ formState }) => {
  const [testInput, setTestInput] = useState<string>('');
  const [testResults, setTestResults] = useState<PreviewTestResult[]>([]);

  const validateInput = useCallback(
    (input: string): PreviewTestResult => {
      const { data_type, enum_options, validation_rules } = formState;

      // Type validation
      if (data_type === 'STRING') {
        if (typeof input !== 'string') {
          return { input, valid: false, error: 'Expected a string value' };
        }
        if (validation_rules?.regex_pattern) {
          try {
            const regex = new RegExp(validation_rules.regex_pattern);
            if (!regex.test(input)) {
              return { input, valid: false, error: `Does not match pattern: ${validation_rules.regex_pattern}` };
            }
          } catch {
            return { input, valid: false, error: 'Invalid regex pattern in field definition' };
          }
        }
        return { input, valid: true, coerced: input };
      }

      if (data_type === 'INTEGER') {
        const num = Number(input);
        if (!Number.isInteger(num)) {
          return { input, valid: false, error: 'Expected a whole number' };
        }
        if (validation_rules?.min !== undefined && num < validation_rules.min) {
          return { input, valid: false, error: `Value must be >= ${validation_rules.min}` };
        }
        if (validation_rules?.max !== undefined && num > validation_rules.max) {
          return { input, valid: false, error: `Value must be <= ${validation_rules.max}` };
        }
        return { input, valid: true, coerced: num };
      }

      if (data_type === 'DECIMAL' || data_type === 'CURRENCY') {
        const num = parseFloat(input);
        if (isNaN(num)) {
          return { input, valid: false, error: 'Expected a decimal number' };
        }
        if (validation_rules?.min !== undefined && num < validation_rules.min) {
          return { input, valid: false, error: `Value must be >= ${validation_rules.min}` };
        }
        if (validation_rules?.max !== undefined && num > validation_rules.max) {
          return { input, valid: false, error: `Value must be <= ${validation_rules.max}` };
        }
        return { input, valid: true, coerced: num };
      }

      if (data_type === 'BOOLEAN') {
        if (input.toLowerCase() === 'true' || input === '1') {
          return { input, valid: true, coerced: true };
        }
        if (input.toLowerCase() === 'false' || input === '0') {
          return { input, valid: true, coerced: false };
        }
        return { input, valid: false, error: 'Expected true/false, 1/0' };
      }

      if (data_type === 'DATE') {
        const d = new Date(input);
        if (isNaN(d.getTime())) {
          return { input, valid: false, error: 'Expected a valid date (YYYY-MM-DD)' };
        }
        return { input, valid: true, coerced: input };
      }

      if (data_type === 'SINGLE_ENUM') {
        if (!enum_options?.includes(input)) {
          return { input, valid: false, error: `Must be one of: ${enum_options?.join(', ')}` };
        }
        return { input, valid: true, coerced: input };
      }

      if (data_type === 'MULTI_ENUM') {
        const values = input.split(',').map((s) => s.trim());
        const invalid = values.filter((v) => !enum_options?.includes(v));
        if (invalid.length > 0) {
          return { input, valid: false, error: `Invalid values: ${invalid.join(', ')}` };
        }
        return { input, valid: true, coerced: values };
      }

      return { input, valid: false, error: 'Unknown data type' };
    },
    [formState],
  );

  const handleTest = useCallback(() => {
    if (!testInput.trim()) return;
    const result = validateInput(testInput.trim());
    setTestResults((prev) => [result, ...prev].slice(0, 10));
  }, [testInput, validateInput]);

  const renderPreviewInput = useMemo(() => {
    const { data_type, display_label, enum_options, is_mandatory } = formState;

    const label = display_label || 'Field Label';

    if (data_type === 'BOOLEAN') {
      return (
        <div className="flex items-center gap-2">
          <div className={clsx('w-10 h-5 rounded-full relative cursor-pointer', 'bg-ops-overlay')}>
            <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-ops-base" />
          </div>
          <span className="text-sm text-ops-muted">{label}</span>
          {is_mandatory && <span className="text-red-400 text-xs">*</span>}
        </div>
      );
    }

    if (data_type === 'SINGLE_ENUM' && enum_options?.length) {
      return (
        <div>
          <label className="block text-xs text-ops-muted mb-1">
            {label} {is_mandatory && <span className="text-red-400">*</span>}
          </label>
          <select className="w-full bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-sm text-ops-primary">
            <option value="">Select...</option>
            {enum_options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (data_type === 'MULTI_ENUM' && enum_options?.length) {
      return (
        <div>
          <label className="block text-xs text-ops-muted mb-1">
            {label} {is_mandatory && <span className="text-red-400">*</span>}
          </label>
          <div className="space-y-1">
            {enum_options.map((opt) => (
              <div key={opt} className="flex items-center gap-2">
                <div className="w-4 h-4 border border-ops-subtle rounded bg-ops-overlay" />
                <span className="text-sm text-ops-primary">{opt}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (data_type === 'DATE') {
      return (
        <div>
          <label className="block text-xs text-ops-muted mb-1">
            {label} {is_mandatory && <span className="text-red-400">*</span>}
          </label>
          <input
            type="date"
            className="w-full bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-sm text-ops-primary"
            placeholder="YYYY-MM-DD"
          />
        </div>
      );
    }

    // Default: text input for STRING, INTEGER, DECIMAL, CURRENCY
    const inputType = data_type === 'INTEGER' ? 'number' : data_type === 'DECIMAL' || data_type === 'CURRENCY' ? 'number' : 'text';
    const prefix = data_type === 'CURRENCY' ? '£' : '';

    return (
      <div>
        <label className="block text-xs text-ops-muted mb-1">
          {label} {is_mandatory && <span className="text-red-400">*</span>}
        </label>
        <div className="relative">
          {prefix && (
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ops-muted text-sm">
              {prefix}
            </span>
          )}
          <input
            type={inputType}
            step={data_type === 'DECIMAL' || data_type === 'CURRENCY' ? '0.01' : '1'}
            className={clsx(
              'w-full bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-sm text-ops-primary',
              prefix && 'pl-6',
            )}
            placeholder={data_type === 'STRING' ? 'Enter text...' : '0'}
          />
        </div>
      </div>
    );
  }, [formState]);

  return (
    <div className="bg-ops-base border border-ops-subtle rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Eye className="w-4 h-4 text-ops-muted" />
        <h4 className="text-sm font-semibold text-ops-primary">Form Preview</h4>
      </div>

      {/* Rendered preview input */}
      <div className="mb-4 p-3 bg-ops-surface rounded border border-ops-subtle">
        {renderPreviewInput}
      </div>

      {/* Validation test input */}
      <div className="mb-3">
        <label className="block text-xs text-ops-muted mb-1">Test Input Validation</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTest()}
            className="flex-1 bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-sm text-ops-primary"
            placeholder="Enter test value..."
          />
          <button
            onClick={handleTest}
            className="px-3 py-1 bg-ops-overlay border border-ops-subtle rounded text-xs text-ops-primary hover:bg-ops-surface transition-colors"
          >
            Test
          </button>
        </div>
      </div>

      {/* Test results */}
      {testResults.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {testResults.map((result, idx) => (
            <div
              key={idx}
              className={clsx(
                'flex items-center gap-2 px-2 py-1 rounded text-xs',
                result.valid ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400',
              )}
            >
              {result.valid ? (
                <Check className="w-3 h-3 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              )}
              <span className="font-mono truncate">{result.input}</span>
              <span className="text-ops-muted ml-auto truncate">
                {result.valid ? `→ ${JSON.stringify(result.coerced)}` : result.error}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

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
      setActiveTab('metadata');
    } else {
      setForm(createEmptyFormState());
      setActiveTab('metadata');
    }
    setError(null);
  }, [editingField, isOpen]);

  // Update form field
  const updateField = useCallback(
    <K extends keyof FieldDefinitionFormState>(key: K, value: FieldDefinitionFormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // Auto-enforce cf_ prefix on field_key
  const handleFieldKeyChange = useCallback((value: string) => {
    const sanitized = value.replace(/[^a-zA-Z0-9_]/g, '_');
    if (!sanitized.startsWith('cf_') && sanitized.length > 0) {
      updateField('field_key', `cf_${sanitized.replace(/^cf_/, '')}`);
    } else {
      updateField('field_key', sanitized);
    }
  }, [updateField]);

  // Toggle tier selection
  const toggleTier = useCallback(
    (tier: WBSTier) => {
      setForm((prev) => {
        const tiers = prev.applicable_tiers.includes(tier)
          ? prev.applicable_tiers.filter((t) => t !== tier)
          : [...prev.applicable_tiers, tier];
        return { ...prev, applicable_tiers: tiers };
      });
    },
    [],
  );

  // Toggle role selection
  const toggleRole = useCallback(
    (role: PermittedRole) => {
      setForm((prev) => {
        const roles = prev.required_roles.includes(role)
          ? prev.required_roles.filter((r) => r !== role)
          : [...prev.required_roles, role];
        return { ...prev, required_roles: roles.length ? roles : ['USER'] };
      });
    },
    [],
  );

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
    if (!form.field_key || form.field_key === 'cf_') {
      return 'Field key is required (must start with cf_)';
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
        // Update existing
        response = await api.put(`/api/v1/admin/custom-fields/${editingField.id}`, payload);
      } else {
        // Create new
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

  // Render tab content
  const renderTabContent = useMemo(() => {
    switch (activeTab) {
      case 'metadata':
        return (
          <div className="space-y-4">
            {/* Field Key */}
            <div>
              <label className="block text-xs text-ops-muted mb-1 flex items-center gap-1">
                <Key className="w-3 h-3" />
                Field Key <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.field_key}
                onChange={(e) => handleFieldKeyChange(e.target.value)}
                className="w-full bg-ops-overlay border border-ops-subtle rounded px-2 py-1.5 text-sm font-mono text-ops-primary"
                placeholder="cf_my_field"
                disabled={!!editingField}
              />
              <p className="text-xs text-ops-muted mt-0.5">
                Unique identifier. Auto-enforces cf_ prefix. {editingField && 'Cannot be changed after creation.'}
              </p>
            </div>

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
                placeholder="Radar Frequency (GHz)"
              />
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
                  <button
                    type="button"
                    onClick={() => updateField('default_value', true)}
                    className={clsx(
                      'px-3 py-1 rounded text-xs border transition-colors',
                      form.default_value === true
                        ? 'bg-green-900/30 border-green-500 text-green-400'
                        : 'bg-ops-overlay border-ops-subtle text-ops-muted',
                    )}
                  >
                    True
                  </button>
                  <button
                    type="button"
                    onClick={() => updateField('default_value', false)}
                    className={clsx(
                      'px-3 py-1 rounded text-xs border transition-colors',
                      form.default_value === false
                        ? 'bg-green-900/30 border-green-500 text-green-400'
                        : 'bg-ops-overlay border-ops-subtle text-ops-muted',
                    )}
                  >
                    False
                  </button>
                  <button
                    type="button"
                    onClick={() => updateField('default_value', null)}
                    className={clsx(
                      'px-3 py-1 rounded text-xs border transition-colors',
                      form.default_value === null
                        ? 'bg-green-900/30 border-green-500 text-green-400'
                        : 'bg-ops-overlay border-ops-subtle text-ops-muted',
                    )}
                  >
                    None
                  </button>
                </div>
              ) : (
                <input
                  type={form.data_type === 'DATE' ? 'date' : 'text'}
                  value={form.default_value ?? ''}
                  onChange={(e) => {
                    let value: any = e.target.value || null;
                    if (form.data_type === 'INTEGER' && value) value = Number(value);
                    if ((form.data_type === 'DECIMAL' || form.data_type === 'CURRENCY') && value) value = parseFloat(value);
                    updateField('default_value', value);
                  }}
                  className="w-full bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-sm text-ops-primary"
                  placeholder="No default"
                />
              )}
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
                        isActive ? `${colors.bg} ${colors.border} ${colors.text}` : 'bg-ops-overlay border-ops-subtle text-ops-muted hover:border-ops-strong',
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
                        isActive ? `${colors.bg} ${colors.border} ${colors.text}` : 'bg-ops-overlay border-ops-subtle text-ops-muted hover:border-ops-strong',
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
              <p className="text-xs text-ops-muted mb-2">Users must have at least one of these roles to edit this field.</p>
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

            {/* Mandatory Toggle */}
            <div className="flex items-center justify-between p-3 bg-ops-overlay rounded border border-ops-subtle">
              <div>
                <div className="text-sm text-ops-primary">Mandatory Field</div>
                <div className="text-xs text-ops-muted">Must have a value on entity creation</div>
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

      default:
        return null;
    }
  }, [form, activeTab, newEnumOption, editingField, toggleTier, toggleRole, addEnumOption, removeEnumOption, updateField, updateValidationRule]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9000] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-[900px] max-w-full bg-ops-base border-l border-ops-strong flex flex-col h-full shadow-2xl">
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
            { key: 'metadata' as const, label: 'Basic Metadata', icon: FileText },
            { key: 'constraints' as const, label: 'Type & Constraints', icon: Settings },
            { key: 'security' as const, label: 'Security & ABAC', icon: Shield },
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

        {/* Content: Split pane with form and preview */}
        <div className="flex-1 overflow-hidden flex">
          {/* Form */}
          <div className="flex-1 overflow-y-auto p-4">
            {error && (
              <div className="mb-4 p-3 bg-red-900/20 border border-red-500/50 rounded text-sm text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
            {renderTabContent}
          </div>

          {/* Preview Sandbox */}
          <div className="w-72 border-l border-ops-subtle overflow-y-auto p-4 bg-ops-surface">
            <FormPreviewSandbox formState={form} />
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
