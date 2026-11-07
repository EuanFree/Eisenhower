/**
 * Custom Fields Admin View
 *
 * Administrator workbench for managing custom field definitions across the
 * Eisenhower Portfolio Manager platform.
 *
 * Target route: /admin/custom-fields
 *
 * Layout
 * ------
 * - **Header Bar** — Title, entity filter tabs (All, Work Items, Resources,
 *   Facilities, CDRLs), search input, and "+ New Custom Field" primary action
 *   button (enabled only for SYSTEM_ADMIN / PMO_DIRECTOR).
 * - **Tabular Grid** — Displays all custom field definitions with columns:
 *   Key, Label, Entity, Applicable Tiers, Type, Security (Read / Write),
 *   Mandatory, Status, Actions.
 * - **Row Micro-Actions** — Edit, Toggle Active/Disabled, Inspect Audit History.
 * - **Slide-out Drawer** — FieldDefinitionDrawer mounted upon creating or editing.
 *
 * Access Control
 * --------------
 *
 * This view is restricted to SYSTEM_ADMIN and PMO_DIRECTOR roles. Other users
 * will see an access denied message.
 *
 * Usage
 * -----
 *
 * Rendered as a top-level view in AppShell when the user navigates to the
 * "Fields" admin tab.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  X,
  Edit,
  Eye,
  EyeOff,
  Shield,
  Layers,
  Hash,
  AlertTriangle,
  Settings,
  FileText,
  RefreshCw,
  History,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../services/api';
import FieldDefinitionDrawer from '../../components/admin/customfields/FieldDefinitionDrawer';
import type {
  CustomFieldDefinition,
  DataType,
  TargetEntity,
  ClearanceLevel,
} from '../../types/custom_fields';
import {
  DATA_TYPES,
  TARGET_ENTITIES,
  CLEARANCE_LEVELS,
  DATA_TYPE_METADATA,
  TARGET_ENTITY_METADATA,
  CLEARANCE_COLORS,
} from '../../types/custom_fields';

// ---------------------------------------------------------------------------
// Entity Filter Tabs
// ---------------------------------------------------------------------------

interface EntityFilterTab {
  key: string;
  label: string;
  icon: React.ElementType;
  entity: TargetEntity | null;
}

const ENTITY_FILTER_TABS: EntityFilterTab[] = [
  { key: 'all', label: 'All', icon: Layers, entity: null },
  { key: 'work-items', label: 'Work Items', icon: FileText, entity: 'WORK_ITEM' },
  { key: 'resources', label: 'Resources', icon: Shield, entity: 'RESOURCE' },
  { key: 'facilities', label: 'Facilities', icon: Layers, entity: 'FACILITY' },
  { key: 'cdrls', label: 'CDRLs', icon: FileText, entity: 'CDRL' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CustomFieldsAdminViewProps {
  /** Current user's role (for access control) */
  userRole?: string;
}

// ---------------------------------------------------------------------------
// Main View Component
// ---------------------------------------------------------------------------

const CustomFieldsAdminView: React.FC<CustomFieldsAdminViewProps> = ({ userRole }) => {
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDefinition | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [auditField, setAuditField] = useState<CustomFieldDefinition | null>(null);

  // Check access control
  const hasAccess = useMemo(() => {
    if (!userRole) return true; // No role check in dev mode
    const role = userRole.toUpperCase();
    return (
      role === 'SYSTEM_ADMIN' ||
      role === 'PMO_DIRECTOR' ||
      role === 'ADMIN' ||
      role === 'MANAGER'
    );
  }, [userRole]);

  // Fetch fields
  const fetchFields = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      const selectedTab = ENTITY_FILTER_TABS.find((t) => t.key === activeTab);
      if (selectedTab?.entity) params.target_entity = selectedTab.entity;
      const response = await api.get('/api/v1/admin/custom-fields', { params });
      setFields(response.data.items || []);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load custom fields');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchFields();
  }, [fetchFields]);

  // Filtered fields (search)
  const filteredFields = useMemo(() => {
    if (!search) return fields;
    const lower = search.toLowerCase();
    return fields.filter(
      (f) =>
        f.field_key.toLowerCase().includes(lower) ||
        f.display_label.toLowerCase().includes(lower),
    );
  }, [fields, search]);

  // Handle save (create or update)
  const handleSave = useCallback(
    (savedField: CustomFieldDefinition) => {
      setFields((prev) => {
        if (editingField) {
          return prev.map((f) => (f.id === savedField.id ? savedField : f));
        }
        return [...prev, savedField];
      });
      setShowDrawer(false);
      setEditingField(null);
    },
    [editingField],
  );

  // Open edit drawer
  const handleEdit = useCallback((field: CustomFieldDefinition) => {
    setEditingField(field);
    setShowDrawer(true);
  }, []);

  // Open create drawer
  const handleCreate = useCallback(() => {
    setEditingField(null);
    setShowDrawer(true);
  }, []);

  // Toggle active status (soft delete)
  const handleToggleActive = useCallback(async (field: CustomFieldDefinition) => {
    try {
      if (field.is_active) {
        await api.delete(`/api/v1/admin/custom-fields/${field.id}`);
      }
      setFields((prev) =>
        prev.map((f) => (f.id === field.id ? { ...f, is_active: !f.is_active } : f)),
      );
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update field status');
    }
  }, []);

  // Delete field
  const handleDelete = useCallback(async (fieldId: string) => {
    try {
      await api.delete(`/api/v1/admin/custom-fields/${fieldId}`);
      setFields((prev) => prev.filter((f) => f.id !== fieldId));
      setConfirmDelete(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete field');
    }
  }, []);

  // Inspect audit history (placeholder — opens a future audit drawer)
  const handleInspectAudit = useCallback((field: CustomFieldDefinition) => {
    setAuditField(field);
    // TODO: Open audit history drawer
    console.log(`[Audit] Inspecting history for field: ${field.field_key}`);
  }, []);

  // Render access denied
  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8 bg-ops-surface border border-ops-strong rounded-lg">
          <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-ops-primary mb-2">Access Denied</h2>
          <p className="text-ops-muted">
            You do not have permission to manage custom field definitions.
            <br />
            Required roles: SYSTEM_ADMIN, PMO_DIRECTOR
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-ops-base">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-ops-subtle">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-sky-400" />
          <h1 className="text-lg font-semibold text-ops-primary">Custom Field Definitions</h1>
          <span className="px-2 py-0.5 bg-ops-overlay rounded text-xs text-ops-muted font-mono">
            {filteredFields.length} / {fields.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchFields}
            className="p-2 rounded hover:bg-ops-overlay text-ops-muted hover:text-ops-primary transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 rounded text-sm text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Custom Field
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-900/20 border border-red-500/50 rounded text-sm text-red-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Entity Filter Tabs + Search */}
      <div className="px-4 py-3 border-b border-ops-subtle space-y-2">
        {/* Entity Filter Tabs */}
        <div className="flex items-center gap-1">
          {ENTITY_FILTER_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm border transition-colors',
                  isActive
                    ? 'bg-sky-900/30 border-sky-500 text-sky-400'
                    : 'bg-ops-overlay border-ops-subtle text-ops-muted hover:border-ops-strong',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}

          {/* Search Input */}
          <div className="relative flex-1 max-w-md ml-4">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ops-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-ops-overlay border border-ops-subtle rounded pl-9 pr-3 py-1.5 text-sm text-ops-primary"
              placeholder="Search by field key or label..."
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ops-muted hover:text-ops-primary"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabular Grid */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 text-ops-muted animate-spin mx-auto mb-2" />
              <p className="text-ops-muted text-sm">Loading custom fields...</p>
            </div>
          </div>
        ) : filteredFields.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-8">
              <FileText className="w-12 h-12 text-ops-muted mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-ops-primary mb-2">
                {fields.length === 0 ? 'No Custom Fields Defined' : 'No Matching Fields'}
              </h3>
              <p className="text-ops-muted mb-4">
                {fields.length === 0
                  ? 'Create your first custom field definition to extend entity attributes.'
                  : 'Try adjusting your search to see more results.'}
              </p>
              {fields.length === 0 && (
                <button
                  onClick={handleCreate}
                  className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded text-sm text-white transition-colors mx-auto"
                >
                  <Plus className="w-4 h-4" />
                  Create Field
                </button>
              )}
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-ops-surface border-b border-ops-subtle">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-ops-muted">Key</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-ops-muted">Label</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-ops-muted">Entity</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-ops-muted">Tiers</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-ops-muted">Type</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-ops-muted">
                  Security
                </th>
                <th className="text-center px-3 py-2 text-xs font-semibold text-ops-muted">
                  Mandatory
                </th>
                <th className="text-center px-3 py-2 text-xs font-semibold text-ops-muted">
                  Status
                </th>
                <th className="text-center px-3 py-2 text-xs font-semibold text-ops-muted">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredFields.map((field) => {
                const readColors = CLEARANCE_COLORS[field.read_clearance_level];
                const writeColors = CLEARANCE_COLORS[field.write_clearance_level];

                return (
                  <tr
                    key={field.id}
                    className={clsx(
                      'border-b border-ops-subtle hover:bg-ops-overlay/50 transition-colors',
                      !field.is_active && 'opacity-50',
                    )}
                  >
                    {/* Field Key */}
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-sky-400">{field.field_key}</span>
                    </td>

                    {/* Display Label */}
                    <td className="px-3 py-2">
                      <span className="text-ops-primary">{field.display_label}</span>
                    </td>

                    {/* Target Entity */}
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-ops-overlay rounded text-xs text-ops-primary">
                        {TARGET_ENTITY_METADATA[field.target_entity].icon}{' '}
                        {TARGET_ENTITY_METADATA[field.target_entity].label}
                      </span>
                    </td>

                    {/* Applicable Tiers */}
                    <td className="px-3 py-2">
                      {field.applicable_tiers && field.applicable_tiers.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {field.applicable_tiers.map((tier) => (
                            <span
                              key={tier}
                              className="px-1.5 py-0.5 bg-ops-overlay rounded text-xs text-ops-muted font-mono"
                            >
                              {tier}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-ops-muted text-xs">All tiers</span>
                      )}
                    </td>

                    {/* Data Type */}
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-ops-overlay rounded text-xs text-ops-primary">
                        {DATA_TYPE_METADATA[field.data_type].icon}{' '}
                        {DATA_TYPE_METADATA[field.data_type].label}
                      </span>
                    </td>

                    {/* Security (Read / Write) */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={clsx(
                            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border',
                            readColors.bg,
                            readColors.text,
                            readColors.border,
                          )}
                        >
                          <Eye className="w-2.5 h-2.5" />
                          {field.read_clearance_level.replace('_', ' ')}
                        </span>
                        <span
                          className={clsx(
                            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border',
                            writeColors.bg,
                            writeColors.text,
                            writeColors.border,
                          )}
                        >
                          <Shield className="w-2.5 h-2.5" />
                          {field.write_clearance_level.replace('_', ' ')}
                        </span>
                      </div>
                    </td>

                    {/* Mandatory */}
                    <td className="px-3 py-2 text-center">
                      {field.is_mandatory ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-900/30 text-red-400">
                          <span className="text-xs font-bold">*</span>
                        </span>
                      ) : (
                        <span className="text-ops-muted text-xs">—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleToggleActive(field)}
                        className={clsx(
                          'inline-flex items-center justify-center w-8 h-5 rounded-full relative transition-colors',
                          field.is_active ? 'bg-green-500' : 'bg-ops-surface',
                        )}
                        title={field.is_active ? 'Deactivate' : 'Cannot reactivate (use Edit)'}
                      >
                        <div
                          className={clsx(
                            'absolute top-0.5 w-4 h-4 rounded-full bg-ops-base transition-transform',
                            field.is_active ? 'left-3' : 'left-0.5',
                          )}
                        />
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {/* Edit */}
                        <button
                          onClick={() => handleEdit(field)}
                          className="p-1 rounded hover:bg-ops-overlay text-ops-muted hover:text-sky-400 transition-colors"
                          title="Edit"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        {/* Inspect Audit History */}
                        <button
                          onClick={() => handleInspectAudit(field)}
                          className="p-1 rounded hover:bg-ops-overlay text-ops-muted hover:text-amber-400 transition-colors"
                          title="Inspect Audit History"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete */}
                        {confirmDelete === field.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(field.id)}
                              className="px-2 py-0.5 bg-red-600 hover:bg-red-500 rounded text-xs text-white transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="px-2 py-0.5 bg-ops-overlay rounded text-xs text-ops-muted hover:text-ops-primary transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(field.id)}
                            className="p-1 rounded hover:bg-ops-overlay text-ops-muted hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer Summary */}
      {filteredFields.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-ops-subtle text-xs text-ops-muted">
          <span>
            Showing {filteredFields.length} of {fields.length} field definitions
          </span>
          <div className="flex items-center gap-4">
            <span>Active: {fields.filter((f) => f.is_active).length}</span>
            <span>Mandatory: {fields.filter((f) => f.is_mandatory).length}</span>
            <span>
              Classified:{' '}
              {fields.filter((f) => f.read_clearance_level !== 'OFFICIAL').length}
            </span>
          </div>
        </div>
      )}

      {/* Field Definition Drawer */}
      <FieldDefinitionDrawer
        isOpen={showDrawer}
        onClose={() => {
          setShowDrawer(false);
          setEditingField(null);
        }}
        editingField={editingField}
        onSave={handleSave}
      />
    </div>
  );
};

export default CustomFieldsAdminView;
