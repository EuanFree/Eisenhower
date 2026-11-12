/**
 * Create Work Item Modal
 *
 * Permission-aware creation modal for new WBS nodes (Programmes, Projects,
 * Control Accounts, Work Packages, Tasks, and Milestones).  Features:
 *
 * - Context-aware initialization: pre-populates parent path and suggests
 *   the next sequential WBS code.
 * - Tabbed drawer layout: General & Schedule, Governance & Security,
 *   and dynamic Custom Attributes.
 * - Client-side validation of mandatory attributes and regex rules.
 * - Pushes an invertible HistoryCommand on successful creation.
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
 *        <button onClick={() => setModalOpen(true)}>Add Child Work Item</button>
 *        {modalOpen && (
 *          <CreateWorkItemModal
 *            parentId={selectedNodeId}
 *            parentPath="prog_a.proj_1"
 *            onClose={() => setModalOpen(false)}
 *            onCreated={(node) => { // refresh tree }}
 *          />
 *        )}
 *      </>
 *    );
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, Shield, Lock, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../services/api';
import { useHistoryStore } from '../../stores/useHistoryStore';
import { useScheduleStore } from '../../stores/useScheduleStore';
import { computeFinishDate, computeDurationFromDates } from '../../utils/scheduleCalculator';
import EndEditChoiceModal from '../common/EndEditChoiceModal';
import {
  WorkItemTier,
  DeliveryMode,
  SecurityClassification,
  DALSILLevel,
  WorkItemCreatePayload,
  CustomFieldDefinition,
  TIER_METADATA,
  CLASSIFICATION_COLORS,
  DAL_COLORS,
} from '../../types/authoring';

// ---------------------------------------------------------------------------
// Tab Types
// ---------------------------------------------------------------------------

type TabId = 'general' | 'governance' | 'custom';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  { id: 'general', label: 'General & Schedule', icon: <Shield size={14} /> },
  { id: 'governance', label: 'Governance & Security', icon: <Lock size={14} /> },
  { id: 'custom', label: 'Custom Attributes', icon: <AlertTriangle size={14} /> },
];

// ---------------------------------------------------------------------------
// Form State
// ---------------------------------------------------------------------------

interface FormState {
  code: string;
  name: string;
  tier: WorkItemTier;
  delivery_mode: DeliveryMode | null;
  planned_start: string;
  planned_finish: string;
  duration_days: number;
  lag_days: number;
  security_classification: SecurityClassification;
  caveats: string[];
  dal_sil_level: DALSILLevel | null;
  custom_attributes: Record<string, unknown>;
}

const DEFAULT_FORM: FormState = {
  code: '',
  name: '',
  tier: 'TASK',
  delivery_mode: null,
  planned_start: '',
  planned_finish: '',
  duration_days: 0,
  lag_days: 0,
  security_classification: 'OFFICIAL',
  caveats: [],
  dal_sil_level: null,
  custom_attributes: {},
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CreateWorkItemModalProps {
  /** Parent node UUID (null for root-level creation) */
  parentId: string | null;
  /** Parent ltree path (for code suggestion) */
  parentPath?: string;
  /** Node ID to edit (null for create mode) */
  editNodeId?: string | null;
  /** Close callback */
  onClose: () => void;
  /** Success callback with the created node */
  onCreated?: (node: { id: string; code: string; name: string; path: string }) => void;
  /** Success callback after updating a node */
  onUpdated?: (node: { id: string; code: string; name: string; path: string }) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CreateWorkItemModal: React.FC<CreateWorkItemModalProps> = ({
  parentId,
  parentPath = '',
  editNodeId = null,
  onClose,
  onCreated,
  onUpdated,
}) => {
  const isEditMode = editNodeId !== null;
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [form, setForm] = useState<FormState>({ ...DEFAULT_FORM });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [caveatInput, setCaveatInput] = useState('');

  // End date edit choice modal state
  const [showEndEditChoice, setShowEndEditChoice] = useState(false);
  const [endEditPending, setEndEditPending] = useState<{
    newFinish: string;
    startDate: string;
  } | null>(null);

  const pushCommand = useHistoryStore((s) => s.pushCommand);
  const addRow = (useScheduleStore as any)((s: any) => s.addRow) as Function | undefined;

  // -----------------------------------------------------------------------
  // Load existing task data in edit mode
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!editNodeId) return;
    setLoading(true);
    api.get(`/api/v1/wbs/nodes/${editNodeId}`)
      .then((res) => {
        const node = res.data;
        const customAttrs = node.custom_attributes || {};
        const startDate = node.planned_start_date ? node.planned_start_date.split('T')[0] : '';
        const finishDate = node.planned_end_date ? node.planned_end_date.split('T')[0] : '';
        const durationDays = node.duration_days ?? 0;
        setForm({
          code: node.code || '',
          name: node.name || '',
          tier: node.tier || 'TASK',
          delivery_mode: node.delivery_mode || null,
          planned_start: startDate,
          planned_finish: finishDate,
          duration_days: typeof durationDays === 'number' ? durationDays : 0,
          lag_days: typeof (node.lag_days as number) === 'number' ? (node.lag_days as number) : 0,
          security_classification: node.security_classification || 'OFFICIAL',
          caveats: Array.isArray(node.caveats) ? node.caveats : [],
          dal_sil_level: customAttrs.dal_sil_level || null,
          custom_attributes: customAttrs,
        });
      })
      .catch(() => {
        setErrors({ submit: 'Failed to load task data' });
      })
      .finally(() => setLoading(false));
  }, [editNodeId]);

  // -----------------------------------------------------------------------
  // Auto-compute finish date from start + duration + lag
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (form.planned_start && form.duration_days > 0) {
      const finish = computeFinishDate(form.planned_start, form.duration_days, form.lag_days);
      if (finish && finish !== form.planned_finish) {
        setForm((prev) => ({ ...prev, planned_finish: finish }));
      }
    }
  }, [form.planned_start, form.duration_days, form.lag_days]);

  // -----------------------------------------------------------------------
  // Load custom fields on mount
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (loading) return;
    setLoading(true);

    const targetEntity = 'WORK_ITEM';
    const tier = form.tier;

    api.get('/api/v1/admin/custom-fields', {
      params: { target_entity: targetEntity, tier },
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
        // Custom fields not available — continue without them
      })
      .finally(() => setLoading(false));
  }, [form.tier]);

  // -----------------------------------------------------------------------
  // Suggest next WBS code
  // -----------------------------------------------------------------------

  useEffect(() => {
    const tierMeta = TIER_METADATA.find((t) => t.tier === form.tier);
    if (tierMeta && !form.code) {
      const prefix = tierMeta.code_prefix;
      const suggested = `${prefix}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
      setForm((prev) => ({ ...prev, code: suggested }));
    }
  }, [form.tier]);

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

  const addCaveat = useCallback(() => {
    const caveat = caveatInput.trim().toUpperCase();
    if (caveat && !form.caveats.includes(caveat)) {
      setForm((prev) => ({ ...prev, caveats: [...prev.caveats, caveat] }));
    }
    setCaveatInput('');
  }, [caveatInput, form.caveats]);

  const removeCaveat = useCallback((caveat: string) => {
    setForm((prev) => ({ ...prev, caveats: prev.caveats.filter((c) => c !== caveat) }));
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
    if (form.planned_start && form.planned_finish && form.planned_start > form.planned_finish) {
      newErrors.planned_finish = 'Finish date must be after start date';
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

    try {
      if (isEditMode && editNodeId) {
        // Update existing node
        const updatePayload: Record<string, unknown> = {
          code: form.code.trim(),
          name: form.name.trim(),
          delivery_mode: form.delivery_mode,
          planned_start_date: form.planned_start || null,
          planned_end_date: form.planned_finish || null,
          duration_days: form.duration_days,
          lag_days: form.lag_days,
          security_classification: form.security_classification,
          caveats: form.caveats,
          custom_attributes: {
            ...form.custom_attributes,
            dal_sil_level: form.dal_sil_level,
          },
        };
        const res = await api.put(`/api/v1/wbs/nodes/${editNodeId}`, updatePayload);
        const node = res.data;
        pushCommand({
          type: 'BATCH_EDIT',
          description: `Updated work item ${form.code}`,
          operations: [{
            node_id: editNodeId,
            field: 'updated',
            oldValue: null,
            newValue: node?.code || form.code,
          }],
        });
        onUpdated?.({ id: editNodeId, code: form.code, name: form.name, path: '' });
      } else {
        // Create new node
        const payload: WorkItemCreatePayload = {
          parent_id: parentId,
          code: form.code.trim(),
          name: form.name.trim(),
          tier: form.tier,
          delivery_mode: form.delivery_mode,
          planned_start: form.planned_start || null,
          planned_finish: form.planned_finish || null,
          duration_days: form.duration_days,
          lag_days: form.lag_days,
          security_classification: form.security_classification,
          caveats: form.caveats,
          dal_sil_level: form.dal_sil_level,
          custom_attributes: form.custom_attributes,
        };
        const res = await api.post('/api/v1/wbs/', payload);
        const node = res.data;
        pushCommand({
          type: 'BATCH_EDIT',
          description: `Created work item ${form.code}`,
          operations: [{
            node_id: node.id,
            field: 'created',
            oldValue: null,
            newValue: node.code,
          }],
        });
        if (addRow) {
          addRow({
            id: node.id,
            code: node.code,
            name: node.name,
            path: node.path,
            parent_id: node.parent_id,
            indentLevel: (node.path || '').split('.').length - 1,
          });
        }
        onCreated?.(node);
      }
      onClose();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || (isEditMode ? 'Failed to update work item' : 'Failed to create work item');
      setErrors({ submit: typeof detail === 'string' ? detail : JSON.stringify(detail) });
    } finally {
      setSubmitting(false);
    }
  }, [form, parentId, validate, pushCommand, addRow, onCreated, onUpdated, onClose, isEditMode, editNodeId]);

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
          <span className={clsx(
            'ml-2 text-xs px-1.5 py-0.5 rounded',
            field.read_clearance_level === 'SECRET' ? 'bg-red-900/30 text-red-400' :
            field.read_clearance_level === 'TOP_SECRET' ? 'bg-purple-900/30 text-purple-400' :
            'bg-sky-900/30 text-sky-400'
          )}>
            {field.read_clearance_level}
          </span>
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

        {field.data_type === 'MULTI_ENUM' && field.enum_options && (
          <div className="flex flex-wrap gap-2">
            {field.enum_options.map((opt) => {
              const selected = Array.isArray(value)
                ? (value as string[]).includes(opt)
                : value === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    const current = Array.isArray(value) ? (value as string[]) : [];
                    if (current.includes(opt)) {
                      updateCustomField(field.field_key, current.filter((v: string) => v !== opt));
                    } else {
                      updateCustomField(field.field_key, [...current, opt]);
                    }
                  }}
                  className={clsx(
                    'px-2 py-1 text-xs rounded border transition-colors',
                    selected
                      ? 'bg-blue-900/50 border-blue-500 text-blue-300'
                      : 'bg-bg-ops-overlay border-border-ops-subtle text-text-ops-muted hover:border-border-ops-strong'
                  )}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <p className="mt-1 text-xs text-rag-red">{error}</p>
        )}
      </div>
    );
  };

  // -----------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] bg-bg-ops-surface border border-border-ops-strong rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
          <div>
            <h2 className="text-lg font-semibold text-text-ops-primary">
              {isEditMode ? 'Edit Work Item' : 'Create Work Item'}
            </h2>
            {isEditMode ? (
              <p className="text-xs text-text-ops-muted font-mono mt-0.5">
                Editing: {form.code} — {form.name}
              </p>
            ) : parentPath ? (
              <p className="text-xs text-text-ops-muted font-mono mt-0.5">
                Parent: {parentPath}
              </p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-text-ops-muted hover:text-text-ops-primary transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border-ops-subtle px-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-text-ops-muted hover:text-text-ops-primary'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-blue-400" />
            </div>
          ) : activeTab === 'general' ? (
            /* Tab 1: General & Schedule */
            <div className="space-y-4">
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
                    placeholder="WP-2104"
                  />
                  {errors.code && <p className="mt-1 text-xs text-rag-red">{errors.code}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-ops-primary mb-1">
                    Tier
                  </label>
                  <select
                    className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary text-sm focus:border-blue-500 focus:outline-none"
                    value={form.tier}
                    onChange={(e) => updateField('tier', e.target.value as WorkItemTier)}
                  >
                    {TIER_METADATA.map((t) => (
                      <option key={t.tier} value={t.tier}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-ops-primary mb-1">
                  Title <span className="text-rag-red">*</span>
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary text-sm focus:border-blue-500 focus:outline-none"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="Work package title"
                />
                {errors.name && <p className="mt-1 text-xs text-rag-red">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-text-ops-primary mb-1">
                  Delivery Mode
                </label>
                <select
                  className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary text-sm focus:border-blue-500 focus:outline-none"
                  value={form.delivery_mode || ''}
                  onChange={(e) => updateField('delivery_mode', e.target.value as DeliveryMode || null)}
                >
                  <option value="">None</option>
                  <option value="WATERFALL">Waterfall</option>
                  <option value="AGILE">Agile</option>
                  <option value="HYBRID">Hybrid</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-ops-primary mb-1">
                    Planned Start
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary text-sm focus:border-blue-500 focus:outline-none"
                    value={form.planned_start}
                    onChange={(e) => updateField('planned_start', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-ops-primary mb-1">
                    Planned Finish
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary text-sm focus:border-blue-500 focus:outline-none"
                    value={form.planned_finish}
                    onChange={(e) => {
                      const newFinish = e.target.value;
                      // If start date exists and finish changed, ask how to apply
                      if (form.planned_start && newFinish !== form.planned_finish) {
                        setEndEditPending({ newFinish, startDate: form.planned_start });
                        setShowEndEditChoice(true);
                      } else {
                        updateField('planned_finish', newFinish);
                      }
                    }}
                  />
                  {errors.planned_finish && <p className="mt-1 text-xs text-rag-red">{errors.planned_finish}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-ops-primary mb-1">
                  Duration (workdays)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary font-mono text-sm focus:border-blue-500 focus:outline-none"
                  value={form.duration_days}
                  onChange={(e) => updateField('duration_days', parseFloat(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-ops-primary mb-1">
                  Lag (workdays)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary font-mono text-sm focus:border-blue-500 focus:outline-none"
                  value={form.lag_days}
                  onChange={(e) => updateField('lag_days', parseInt(e.target.value) || 0)}
                />
                <p className="mt-1 text-xs text-text-ops-muted">Idle time within the task (e.g., curing, approval waits)</p>
              </div>
            </div>
          ) : activeTab === 'governance' ? (
            /* Tab 2: Governance & Security */
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-ops-primary mb-1">
                  Security Classification
                </label>
                <select
                  className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary text-sm focus:border-blue-500 focus:outline-none"
                  value={form.security_classification}
                  onChange={(e) => updateField('security_classification', e.target.value as SecurityClassification)}
                >
                  <option value="OFFICIAL">OFFICIAL</option>
                  <option value="OFFICIAL_SENSITIVE">OFFICIAL-SENSITIVE</option>
                  <option value="SECRET">SECRET</option>
                  <option value="TOP_SECRET">TOP SECRET</option>
                </select>
                <p className={clsx('mt-1 text-xs font-mono', CLASSIFICATION_COLORS[form.security_classification])}>
                  {form.security_classification}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-ops-primary mb-1">
                  National Caveats
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary text-sm focus:border-blue-500 focus:outline-none"
                    value={caveatInput}
                    onChange={(e) => setCaveatInput(e.target.value)}
                    placeholder="UK_EYES_ONLY"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCaveat())}
                  />
                  <button
                    onClick={addCaveat}
                    className="px-3 py-2 bg-blue-900/50 border border-blue-700 text-blue-300 rounded text-sm hover:bg-blue-800/50 transition-colors"
                  >
                    Add
                  </button>
                </div>
                {form.caveats.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {form.caveats.map((caveat) => (
                      <span
                        key={caveat}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-red-900/30 border border-red-800 text-red-400"
                      >
                        {caveat}
                        <button onClick={() => removeCaveat(caveat)} className="hover:text-red-300">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-text-ops-primary mb-1">
                  Safety Level (DAL/SIL)
                </label>
                <select
                  className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary text-sm focus:border-blue-500 focus:outline-none"
                  value={form.dal_sil_level || 'NON_SAFETY'}
                  onChange={(e) => updateField('dal_sil_level', e.target.value as DALSILLevel || null)}
                >
                  <option value="NON_SAFETY">Non-Safety</option>
                  <option value="DAL_E">DAL E</option>
                  <option value="DAL_D">DAL D</option>
                  <option value="DAL_C">DAL C</option>
                  <option value="DAL_B">DAL B</option>
                  <option value="DAL_A">DAL A</option>
                  <option value="SIL_1">SIL 1</option>
                  <option value="SIL_2">SIL 2</option>
                  <option value="SIL_3">SIL 3</option>
                  <option value="SIL_4">SIL 4</option>
                </select>
                {form.dal_sil_level && form.dal_sil_level !== 'NON_SAFETY' && (
                  <p className={clsx('mt-1 text-xs font-mono', DAL_COLORS[form.dal_sil_level] || 'text-text-ops-muted')}>
                    {form.dal_sil_level}
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* Tab 3: Custom Attributes */
            <div>
              {customFields.length === 0 ? (
                <div className="text-center py-8 text-text-ops-muted">
                  <p className="text-sm">No custom fields defined for this tier.</p>
                  <p className="text-xs mt-1">Contact your PMO administrator to add custom fields.</p>
                </div>
              ) : (
                customFields.map(renderCustomFieldInput)
              )}
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
                  {isEditMode ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                <>
                  <CheckCircle size={14} />
                  {isEditMode ? 'Update Work Item' : 'Create Work Item'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* End Date Edit Choice Modal */}
      {showEndEditChoice && endEditPending && form.planned_finish && (
        <EndEditChoiceModal
          oldEndDate={form.planned_finish}
          newEndDate={endEditPending.newFinish}
          startDate={endEditPending.startDate}
          onAdjustDuration={() => {
            // Compute new duration from the new dates
            const newDuration = computeDurationFromDates(
              endEditPending.startDate,
              endEditPending.newFinish
            );
            setForm((prev) => ({
              ...prev,
              planned_finish: endEditPending.newFinish,
              duration_days: Math.max(1, newDuration),
            }));
            setShowEndEditChoice(false);
            setEndEditPending(null);
          }}
          onAddLag={() => {
            // Keep duration, compute lag from the difference
            const oldDuration = computeDurationFromDates(
              endEditPending.startDate,
              form.planned_finish
            );
            const newDuration = computeDurationFromDates(
              endEditPending.startDate,
              endEditPending.newFinish
            );
            const lagDiff = newDuration - oldDuration;
            setForm((prev) => ({
              ...prev,
              planned_finish: endEditPending.newFinish,
              lag_days: Math.max(0, (prev.lag_days || 0) + lagDiff),
            }));
            setShowEndEditChoice(false);
            setEndEditPending(null);
          }}
          onCancel={() => {
            // Revert: keep the old finish date
            setShowEndEditChoice(false);
            setEndEditPending(null);
          }}
        />
      )}
    </div>
  );
};

export default CreateWorkItemModal;
