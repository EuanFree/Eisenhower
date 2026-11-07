/**
 * Create Resource Modal
 *
 * Permission-aware creation modal for new Resource entries (people,
 * equipment, and facilities).  Features:
 *
 * - Form fields: Resource Code, Full Name, Resource Type, Burdened Cost
 *   Rate, Clearance Level, and Primary Department.
 * - Dynamic conditional fields:
 *   - HUMAN_LABOR: Nationality selector and weekly hours capacity.
 *   - EQUIPMENT: Serial Number and Calibration Due Date (mandatory).
 * - Integrates the dynamic custom attributes panel.
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    const [modalOpen, setModalOpen] = useState(false);
 *
 *    return (
 *      <>
 *        <button onClick={() => setModalOpen(true)}>New Resource</button>
 *        {modalOpen && (
 *          <CreateResourceModal
 *            onClose={() => setModalOpen(false)}
 *            onCreated={(resource) => { // refresh list }}
 *          />
 *        )}
 *      </>
 *    );
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, User, Package, Building2, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../services/api';
import { useHistoryStore } from '../../stores/useHistoryStore';
import {
  ResourceType,
  SecurityClassification,
  ResourceCreatePayload,
  CustomFieldDefinition,
  CLASSIFICATION_COLORS,
} from '../../types/authoring';

// ---------------------------------------------------------------------------
// Form State
// ---------------------------------------------------------------------------

interface FormState {
  code: string;
  name: string;
  resource_type: ResourceType;
  department: string;
  burdened_hourly_rate: number;
  clearance_level: SecurityClassification;
  nationality: string;
  weekly_hours_capacity: number;
  serial_number: string;
  calibration_expiry_date: string;
  custom_attributes: Record<string, unknown>;
}

const DEFAULT_FORM: FormState = {
  code: '',
  name: '',
  resource_type: 'HUMAN_LABOR',
  department: '',
  burdened_hourly_rate: 0,
  clearance_level: 'OFFICIAL',
  nationality: 'GB',
  weekly_hours_capacity: 37.5,
  serial_number: '',
  calibration_expiry_date: '',
  custom_attributes: {},
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CreateResourceModalProps {
  /** Close callback */
  onClose: () => void;
  /** Success callback with the created resource */
  onCreated?: (resource: { id: string; code: string; name: string }) => void;
}

// ---------------------------------------------------------------------------
// Nationality Options (ISO 2-letter)
// ---------------------------------------------------------------------------

const NATIONALITIES = [
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'AU', name: 'Australia' },
  { code: 'CA', name: 'Canada' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'JP', name: 'Japan' },
  { code: 'IN', name: 'India' },
  { code: 'IE', name: 'Ireland' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CreateResourceModal: React.FC<CreateResourceModalProps> = ({
  onClose,
  onCreated,
}) => {
  const [form, setForm] = useState<FormState>({ ...DEFAULT_FORM });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);

  const pushCommand = useHistoryStore((s) => s.pushCommand);

  // -----------------------------------------------------------------------
  // Load custom fields on mount
  // -----------------------------------------------------------------------

  useEffect(() => {
    const targetEntity = 'RESOURCE';

    api.get('/api/v1/admin/custom-fields', {
      params: { target_entity: targetEntity },
    })
      .then((res) => {
        const fields = res.data?.fields || res.data || [];
        setCustomFields(Array.isArray(fields) ? fields : []);

        // Apply default values
        const defaults: Record<string, unknown> = {};
        for (const field of (Array.isArray(fields) ? fields : [])) {
          if (field.default_value !== null && field.default_value !== undefined) {
            defaults[field.field_key] = field.default_value;
          }
        }
        setForm((prev) => ({ ...prev, custom_attributes: { ...prev.custom_attributes, ...defaults } }));
      })
      .catch(() => {
        // Custom fields not available
      });
  }, []);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const updateCustomField = useCallback((fieldKey: string, value: unknown) => {
    setForm((prev) => ({
      ...prev,
      custom_attributes: { ...prev.custom_attributes, [fieldKey]: value },
    }));
  }, []);

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!form.code.trim()) {
      newErrors.code = 'Code is required';
    }
    if (!form.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (!form.department.trim()) {
      newErrors.department = 'Department is required';
    }

    // EQUIPMENT requires calibration expiry date
    if (form.resource_type === 'EQUIPMENT' && !form.calibration_expiry_date) {
      newErrors.calibration_expiry_date = 'Calibration due date is mandatory for equipment';
    }

    // Check mandatory custom fields
    for (const field of customFields) {
      if (field.is_mandatory && !(field.field_key in form.custom_attributes)) {
        newErrors[`custom_${field.field_key}`] = `${field.display_label} is mandatory`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form, customFields]);

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------

  const handleSubmit = useCallback(async () => {
    if (!validate()) {
      return;
    }

    setSubmitting(true);

    const payload: ResourceCreatePayload = {
      code: form.code.trim(),
      name: form.name.trim(),
      resource_type: form.resource_type,
      department: form.department.trim(),
      burdened_hourly_rate: form.burdened_hourly_rate,
      clearance_level: form.clearance_level,
      nationality: form.nationality,
      custom_attributes: form.custom_attributes,
    };

    if (form.resource_type === 'HUMAN_LABOR') {
      payload.weekly_hours_capacity = form.weekly_hours_capacity;
    }

    if (form.resource_type === 'EQUIPMENT') {
      payload.serial_number = form.serial_number || undefined;
      payload.calibration_expiry_date = form.calibration_expiry_date || undefined;
    }

    try {
      const res = await api.post('/api/v1/resources/', payload);
      const resource = res.data;

      pushCommand({
        type: 'BATCH_EDIT',
        description: `Created resource ${form.code}`,
        operations: [{
          node_id: resource.id,
          field: 'created',
          oldValue: null,
          newValue: resource.code,
        }],
      });

      onCreated?.(resource);
      onClose();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Failed to create resource';
      setErrors({ submit: typeof detail === 'string' ? detail : JSON.stringify(detail) });
    } finally {
      setSubmitting(false);
    }
  }, [form, validate, pushCommand, onCreated, onClose]);

  // -----------------------------------------------------------------------
  // Render Custom Field Input
  // -----------------------------------------------------------------------

  const renderCustomFieldInput = (field: CustomFieldDefinition) => {
    const value = form.custom_attributes[field.field_key];
    const error = errors[`custom_${field.field_key}`];

    return (
      <div key={field.field_key} className="mb-4">
        <label className="block text-sm font-medium text-text-ops-primary mb-1">
          {field.display_label}
          {field.is_mandatory && <span className="text-rag-red ml-1">*</span>}
        </label>

        {field.data_type === 'STRING' && (
          <input
            type="text"
            className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary text-sm focus:border-blue-500 focus:outline-none"
            value={value as string || ''}
            onChange={(e) => updateCustomField(field.field_key, e.target.value)}
          />
        )}

        {(field.data_type === 'INTEGER' || field.data_type === 'DECIMAL' || field.data_type === 'CURRENCY') && (
          <input
            type="number"
            step={field.data_type === 'INTEGER' ? '1' : '0.01'}
            className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary text-sm focus:border-blue-500 focus:outline-none"
            value={value as string || ''}
            onChange={(e) => updateCustomField(field.field_key, field.data_type === 'INTEGER' ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0)}
          />
        )}

        {field.data_type === 'BOOLEAN' && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded bg-bg-ops-overlay border-border-ops-subtle text-blue-500 focus:ring-blue-500"
              checked={!!value}
              onChange={(e) => updateCustomField(field.field_key, e.target.checked)}
            />
            <span className="text-sm text-text-ops-muted">{value ? 'Yes' : 'No'}</span>
          </label>
        )}

        {field.data_type === 'DATE' && (
          <input
            type="date"
            className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary text-sm focus:border-blue-500 focus:outline-none"
            value={value as string || ''}
            onChange={(e) => updateCustomField(field.field_key, e.target.value)}
          />
        )}

        {field.data_type === 'SINGLE_ENUM' && field.enum_options && (
          <select
            className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary text-sm focus:border-blue-500 focus:outline-none"
            value={value as string || ''}
            onChange={(e) => updateCustomField(field.field_key, e.target.value)}
          >
            <option value="">Select...</option>
            {field.enum_options.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        )}

        {error && <p className="mt-1 text-xs text-rag-red">{error}</p>}
      </div>
    );
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-xl max-h-[90vh] bg-bg-ops-surface border border-border-ops-strong rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
          <h2 className="text-lg font-semibold text-text-ops-primary">
            Create Resource
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-text-ops-muted hover:text-text-ops-primary transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Resource Type */}
          <div>
            <label className="block text-sm font-medium text-text-ops-primary mb-2">
              Resource Type
            </label>
            <div className="grid grid-cols-3 gap-3">
              {([
                { type: 'HUMAN_LABOR' as ResourceType, label: 'Person', icon: <User size={16} /> },
                { type: 'EQUIPMENT' as ResourceType, label: 'Equipment', icon: <Package size={16} /> },
                { type: 'FACILITY' as ResourceType, label: 'Facility', icon: <Building2 size={16} /> },
              ]).map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  onClick={() => updateField('resource_type', opt.type)}
                  className={clsx(
                    'flex flex-col items-center gap-2 px-4 py-3 rounded-lg border transition-colors',
                    form.resource_type === opt.type
                      ? 'bg-blue-900/30 border-blue-500 text-blue-400'
                      : 'bg-bg-ops-overlay border-border-ops-subtle text-text-ops-muted hover:border-border-ops-strong'
                  )}
                >
                  {opt.icon}
                  <span className="text-sm">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Code & Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-ops-primary mb-1">
                Code <span className="text-rag-red">*</span>
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary font-mono text-sm focus:border-blue-500 focus:outline-none"
                value={form.code}
                onChange={(e) => updateField('code', e.target.value)}
                placeholder="ENG-001"
              />
              {errors.code && <p className="mt-1 text-xs text-rag-red">{errors.code}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-text-ops-primary mb-1">
                Full Name <span className="text-rag-red">*</span>
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary text-sm focus:border-blue-500 focus:outline-none"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="John Smith"
              />
              {errors.name && <p className="mt-1 text-xs text-rag-red">{errors.name}</p>}
            </div>
          </div>

          {/* Department */}
          <div>
            <label className="block text-sm font-medium text-text-ops-primary mb-1">
              Primary Department <span className="text-rag-red">*</span>
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary text-sm focus:border-blue-500 focus:outline-none"
              value={form.department}
              onChange={(e) => updateField('department', e.target.value)}
              placeholder="Avionics Engineering"
            />
            {errors.department && <p className="mt-1 text-xs text-rag-red">{errors.department}</p>}
          </div>

          {/* Burdened Rate & Clearance */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-ops-primary mb-1">
                Burdened Hourly Rate
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary font-mono text-sm focus:border-blue-500 focus:outline-none"
                value={form.burdened_hourly_rate}
                onChange={(e) => updateField('burdened_hourly_rate', parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-ops-primary mb-1">
                Clearance Level
              </label>
              <select
                className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary text-sm focus:border-blue-500 focus:outline-none"
                value={form.clearance_level}
                onChange={(e) => updateField('clearance_level', e.target.value as SecurityClassification)}
              >
                <option value="OFFICIAL">OFFICIAL</option>
                <option value="OFFICIAL_SENSITIVE">OFFICIAL-SENSITIVE</option>
                <option value="SECRET">SECRET</option>
                <option value="TOP_SECRET">TOP SECRET</option>
              </select>
            </div>
          </div>

          {/* Conditional: HUMAN_LABOR */}
          {form.resource_type === 'HUMAN_LABOR' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-ops-primary mb-1">
                    Nationality
                  </label>
                  <select
                    className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary text-sm focus:border-blue-500 focus:outline-none"
                    value={form.nationality}
                    onChange={(e) => updateField('nationality', e.target.value)}
                  >
                    {NATIONALITIES.map((n) => (
                      <option key={n.code} value={n.code}>{n.name} ({n.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-ops-primary mb-1">
                    Weekly Hours Capacity
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary font-mono text-sm focus:border-blue-500 focus:outline-none"
                    value={form.weekly_hours_capacity}
                    onChange={(e) => updateField('weekly_hours_capacity', parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
            </>
          )}

          {/* Conditional: EQUIPMENT */}
          {form.resource_type === 'EQUIPMENT' && (
            <>
              <div>
                <label className="block text-sm font-medium text-text-ops-primary mb-1">
                  Serial Number
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary font-mono text-sm focus:border-blue-500 focus:outline-none"
                  value={form.serial_number}
                  onChange={(e) => updateField('serial_number', e.target.value)}
                  placeholder="SN-2026-0042"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-ops-primary mb-1">
                  Calibration Due Date <span className="text-rag-red">*</span>
                </label>
                <input
                  type="date"
                  className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary text-sm focus:border-blue-500 focus:outline-none"
                  value={form.calibration_expiry_date}
                  onChange={(e) => updateField('calibration_expiry_date', e.target.value)}
                />
                {errors.calibration_expiry_date && (
                  <p className="mt-1 text-xs text-rag-red">{errors.calibration_expiry_date}</p>
                )}
              </div>
            </>
          )}

          {/* Custom Attributes */}
          {customFields.length > 0 && (
            <div className="border-t border-border-ops-subtle pt-4">
              <h3 className="text-sm font-medium text-text-ops-primary mb-3">Custom Attributes</h3>
              {customFields.map(renderCustomFieldInput)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-ops-subtle">
          <div>
            {errors.submit && (
              <p className="text-xs text-rag-red flex items-center gap-1">
                <AlertTriangle size={12} />
                {errors.submit}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-ops-muted border border-border-ops-subtle rounded hover:border-border-ops-strong transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 text-sm rounded font-medium transition-colors',
                submitting
                  ? 'bg-blue-900/30 text-blue-400 cursor-wait'
                  : 'bg-blue-600 text-white hover:bg-blue-500'
              )}
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <CheckCircle size={14} />
                  Create Resource
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateResourceModal;
