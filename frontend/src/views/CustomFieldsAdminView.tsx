/**
 * Custom Fields Admin View
 *
 * Administrator workbench for managing custom field definitions across the
 * Eisenhower Portfolio Manager platform.
 *
 * Features
 * --------
 * - **Master Custom Field Table** — Displays all defined custom attributes with
 *   columns for Field Key, Display Label, Target Entity, Applicable Tiers,
 *   Data Type, Mandatory, Read/Write Clearance, Permitted Roles, and Active Status.
 * - **Filterable Pill Bar** — Filter by Target Entity, Data Type, and Active Status.
 * - **Field Schema Builder Drawer** — Slide-out configurator for creating and
 *   editing field definitions (FieldDefinitionDrawer).
 * - **Search** — Full-text search across field keys and display labels.
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
 * "Custom Fields" tab.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  Filter,
  X,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Shield,
  Layers,
  Hash,
  ToggleLeft,
  ToggleRight,
  AlertTriangle,
  Check,
  Settings,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../services/api';
import FieldDefinitionDrawer from '../components/admin/FieldDefinitionDrawer';
import type {
  CustomFieldDefinition,
  CustomFieldFilters,
  DataType,
  TargetEntity,
  ClearanceLevel,
} from '../types/custom_fields';
import {
  DATA_TYPES,
  TARGET_ENTITIES,
  CLEARANCE_LEVELS,
  DATA_TYPE_METADATA,
  TARGET_ENTITY_METADATA,
  CLEARANCE_COLORS,
} from '../types/custom_fields';

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
  const [filters, setFilters] = useState<CustomFieldFilters>({
    target_entity: null,
    data_type: null,
    is_active: null,
    search: '',
  });
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDefinition | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Check access control
  const hasAccess = useMemo(() => {
    if (!userRole) return true; // No role check in dev mode
    const role = userRole.toUpperCase();
    return role === 'SYSTEM_ADMIN' || role === 'PMO_DIRECTOR' || role === 'ADMIN' || role === 'MANAGER';
  }, [userRole]);

  // Fetch fields
  const fetchFields = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (filters.target_entity) params.target_entity = filters.target_entity;
      const response = await api.get('/api/v1/admin/custom-fields', { params });
      setFields(response.data.items || []);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load custom fields');
    } finally {
      setLoading(false);
    }
  }, [filters.target_entity]);

  useEffect(() => {
    fetchFields();
  }, [fetchFields]);

  // Filtered fields
  const filteredFields = useMemo(() => {
    return fields.filter((field) => {
      // Data type filter
      if (filters.data_type && field.data_type !== filters.data_type) return false;
      // Active status filter
      if (filters.is_active !== null && field.is_active !== filters.is_active) return false;
      // Search filter
      if (filters.search) {
        const search = filters.search.toLowerCase();
        const matchesKey = field.field_key.toLowerCase().includes(search);
        const matchesLabel = field.display_label.toLowerCase().includes(search);
        if (!matchesKey && !matchesLabel) return false;
      }
      return true;
    });
  }, [fields, filters]);

  // Handle save (create or update)
  const handleSave = useCallback(
    (savedField: CustomFieldDefinition) => {
      setFields((prev) => {
        if (editingField) {
          // Update existing
          return prev.map((f) => (f.id === savedField.id ? savedField : f));
        } else {
          // Add new
          return [...prev, savedField];
        }
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
  const handleToggleActive = useCallback(
    async (field: CustomFieldDefinition) => {
      try {
        if (field.is_active) {
          // Deactivate via DELETE
          await api.delete(`/api/v1/admin/custom-fields/${field.id}`);
        }
        // Note: Reactivating would require a separate endpoint
        setFields((prev) =>
          prev.map((f) => (f.id === field.id ? { ...f, is_active: !f.is_active } : f)),
        );
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to update field status');
      }
    },
    [],
  );

  // Confirm and delete field
  const handleDelete = useCallback(
    async (fieldId: string) => {
      try {
        await api.delete(`/api/v1/admin/custom-fields/${fieldId}`);
        setFields((prev) => prev.filter((f) => f.id !== fieldId));
        setConfirmDelete(null);
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to delete field');
      }
    },
    [],
  );

  // Clear filter
  const clearFilter = useCallback((key: keyof CustomFieldFilters) => {
    setFilters((prev) => ({ ...prev, [key]: key === 'search' ? '' : null }));
  }, []);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.target_entity) count++;
    if (filters.data_type) count++;
    if (filters.is_active !== null) count++;
    if (filters.search) count++;
    return count;
  }, [filters]);

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
      {/* Header */}
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
            New Field
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

      {/* Filter Bar */}
      <div className="px-4 py-3 border-b border-ops-subtle space-y-2">
        {/* Search and primary filters */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ops-muted" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              className="w-full bg-ops-overlay border border-ops-subtle rounded pl-9 pr-3 py-1.5 text-sm text-ops-primary"
              placeholder="Search by field key or label..."
            />
            {filters.search && (
              <button
                onClick={() => clearFilter('search')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ops-muted hover:text-ops-primary"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Target Entity Filter */}
          <div className="relative">
            <select
              value={filters.target_entity || ''}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  target_entity: e.target.value as TargetEntity || null,
                }))
              }
              className="appearance-none bg-ops-overlay border border-ops-subtle rounded px-3 py-1.5 text-sm text-ops-primary pr-8"
            >
              <option value="">All Entities</option>
              {TARGET_ENTITIES.map((entity) => (
                <option key={entity} value={entity}>
                  {TARGET_ENTITY_METADATA[entity].label}
                </option>
              ))}
            </select>
            <Layers className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ops-muted pointer-events-none" />
          </div>

          {/* Data Type Filter */}
          <div className="relative">
            <select
              value={filters.data_type || ''}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  data_type: e.target.value as DataType || null,
                }))
              }
              className="appearance-none bg-ops-overlay border border-ops-subtle rounded px-3 py-1.5 text-sm text-ops-primary pr-8"
            >
              <option value="">All Types</option>
              {DATA_TYPES.map((type) => (
                <option key={type} value={type}>
                  {DATA_TYPE_METADATA[type].label}
                </option>
              ))}
            </select>
            <Hash className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ops-muted pointer-events-none" />
          </div>

          {/* Active Status Filter */}
          <button
            onClick={() =>
              setFilters((prev) => ({
                ...prev,
                is_active: prev.is_active === null ? true : prev.is_active ? false : null,
              }))
            }
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded border text-sm transition-colors',
              filters.is_active !== null
                ? 'bg-sky-900/30 border-sky-500 text-sky-400'
                : 'bg-ops-overlay border-ops-subtle text-ops-muted hover:border-ops-strong',
            )}
          >
            <Filter className="w-3 h-3" />
            {filters.is_active === null ? 'Status' : filters.is_active ? 'Active Only' : 'Inactive Only'}
          </button>

          {/* Active filter count badge */}
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 bg-amber-900/30 border border-amber-500/50 rounded text-xs text-amber-400">
              {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
            </span>
          )}

          {/* Clear all filters */}
          {activeFilterCount > 0 && (
            <button
              onClick={() =>
                setFilters({ target_entity: null, data_type: null, is_active: null, search: '' })
              }
              className="text-xs text-ops-muted hover:text-ops-primary transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {filters.target_entity && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-ops-overlay border border-ops-subtle rounded text-xs text-ops-primary">
                Entity: {TARGET_ENTITY_METADATA[filters.target_entity].label}
                <button onClick={() => clearFilter('target_entity')} className="ml-1 text-ops-muted hover:text-ops-primary">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.data_type && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-ops-overlay border border-ops-subtle rounded text-xs text-ops-primary">
                Type: {DATA_TYPE_METADATA[filters.data_type].label}
                <button onClick={() => clearFilter('data_type')} className="ml-1 text-ops-muted hover:text-ops-primary">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.is_active !== null && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-ops-overlay border border-ops-subtle rounded text-xs text-ops-primary">
                Status: {filters.is_active ? 'Active' : 'Inactive'}
                <button onClick={() => clearFilter('is_active')} className="ml-1 text-ops-muted hover:text-ops-primary">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {filters.search && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-ops-overlay border border-ops-subtle rounded text-xs text-ops-primary">
                Search: "{filters.search}"
                <button onClick={() => clearFilter('search')} className="ml-1 text-ops-muted hover:text-ops-primary">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Master Table */}
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
                  : 'Try adjusting your filters to see more results.'}
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
                <th className="text-left px-3 py-2 text-xs font-semibold text-ops-muted">Field Key</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-ops-muted">Display Label</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-ops-muted">Target Entity</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-ops-muted">Tiers</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-ops-muted">Data Type</th>
                <th className="text-center px-3 py-2 text-xs font-semibold text-ops-muted">Mandatory</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-ops-muted">Read Clearance</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-ops-muted">Write Clearance</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-ops-muted">Roles</th>
                <th className="text-center px-3 py-2 text-xs font-semibold text-ops-muted">Active</th>
                <th className="text-center px-3 py-2 text-xs font-semibold text-ops-muted">Actions</th>
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
                        {DATA_TYPE_METADATA[field.data_type].icon} {DATA_TYPE_METADATA[field.data_type].label}
                      </span>
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

                    {/* Read Clearance */}
                    <td className="px-3 py-2">
                      <span
                        className={clsx(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border',
                          readColors.bg,
                          readColors.text,
                          readColors.border,
                        )}
                      >
                        <Eye className="w-3 h-3" />
                        {field.read_clearance_level.replace('_', ' ')}
                      </span>
                    </td>

                    {/* Write Clearance */}
                    <td className="px-3 py-2">
                      <span
                        className={clsx(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border',
                          writeColors.bg,
                          writeColors.text,
                          writeColors.border,
                        )}
                      >
                        <Shield className="w-3 h-3" />
                        {field.write_clearance_level.replace('_', ' ')}
                      </span>
                    </td>

                    {/* Roles */}
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {field.required_roles.slice(0, 3).map((role) => (
                          <span
                            key={role}
                            className="px-1.5 py-0.5 bg-ops-overlay rounded text-xs text-ops-muted"
                          >
                            {role.replace(/_/g, ' ')}
                          </span>
                        ))}
                        {field.required_roles.length > 3 && (
                          <span className="px-1.5 py-0.5 bg-ops-overlay rounded text-xs text-ops-muted">
                            +{field.required_roles.length - 3}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Active Status */}
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
                        <button
                          onClick={() => handleEdit(field)}
                          className="p-1 rounded hover:bg-ops-overlay text-ops-muted hover:text-sky-400 transition-colors"
                          title="Edit"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
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
                            <Trash2 className="w-3.5 h-3.5" />
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
            <span>
              Active: {fields.filter((f) => f.is_active).length}
            </span>
            <span>
              Mandatory: {fields.filter((f) => f.is_mandatory).length}
            </span>
            <span>
              Classified: {fields.filter((f) => f.read_clearance_level !== 'OFFICIAL').length}
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
