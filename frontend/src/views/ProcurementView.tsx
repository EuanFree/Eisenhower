/**
 * Procurement Dashboard View
 *
 * Supply chain procurement tracking interface for the Eisenhower Portfolio Manager.
 * Monitors procurement items through their lifecycle from requisition to acceptance,
 * and manages task-level procurement constraints.
 *
 * Layout
 * ------
 * 1. Summary Metrics — Total items, long-lead items, overdue items, at-risk items
 * 2. Filter bar — Lifecycle stage filter, long-lead toggle, search
 * 3. Procurement items table with lifecycle stage indicators
 * 4. Status update modal for advancing lifecycle stages
 *
 * Data Sources
 * ------------
 * - GET /api/v1/procurement/items → List procurement items
 * - POST /api/v1/procurement/items → Create procurement item
 * - PUT /api/v1/procurement/items/{id} → Update item
 * - PUT /api/v1/procurement/items/{id}/status → Advance lifecycle stage
 * - DELETE /api/v1/procurement/items/{id} → Delete item
 * - POST /api/v1/procurement/tasks/{id}/link-part → Link part to task
 * - GET /api/v1/procurement/tasks/{id}/constraints → List task constraints
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Truck,
  Package,
  Clock,
  AlertTriangle,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  Link,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LifecycleStage =
  | 'REQUISITION'
  | 'RFQ_ISSUED'
  | 'PO_PLACED'
  | 'IN_MANUFACTURE'
  | 'CUSTOMS_TRANSIT'
  | 'DELIVERED_STORES'
  | 'ACCEPTED_INSPECTED';

interface ProcurementItem {
  id: string;
  part_number: string;
  description: string;
  supplier_cage_code: string;
  portfolio_node_id?: string;
  purchase_order_reference?: string;
  contractual_delivery_date?: string;
  forecast_delivery_date?: string;
  actual_arrival_date?: string;
  lifecycle_stage: LifecycleStage;
  is_long_lead_item: boolean;
  created_at?: string;
  updated_at?: string;
}

const LIFECYCLE_STAGES: { value: LifecycleStage; label: string; color: string }[] = [
  { value: 'REQUISITION', label: 'Requisition', color: 'text-gray-400' },
  { value: 'RFQ_ISSUED', label: 'RFQ Issued', color: 'text-blue-400' },
  { value: 'PO_PLACED', label: 'PO Placed', color: 'text-indigo-400' },
  { value: 'IN_MANUFACTURE', label: 'In Manufacture', color: 'text-amber-400' },
  { value: 'CUSTOMS_TRANSIT', label: 'Customs / Transit', color: 'text-orange-400' },
  { value: 'DELIVERED_STORES', label: 'Delivered', color: 'text-emerald-400' },
  { value: 'ACCEPTED_INSPECTED', label: 'Accepted', color: 'text-green-400' },
];

const LIFECYCLE_ORDER: LifecycleStage[] = LIFECYCLE_STAGES.map((s) => s.value);

// ---------------------------------------------------------------------------
// Procurement View Component
// ---------------------------------------------------------------------------

const ProcurementView: React.FC = () => {
  const [items, setItems] = useState<ProcurementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStage, setFilterStage] = useState<LifecycleStage | null>(null);
  const [filterLongLead, setFilterLongLead] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingItem, setEditingItem] = useState<ProcurementItem | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchItems = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (filterStage) params.lifecycle_stage = filterStage;
      if (filterLongLead) params.is_long_lead = 'true';
      const res = await api.get('/procurement/items', { params });
      setItems(res.data?.items || res.data || []);
    } catch (err) {
      console.error('Failed to fetch procurement items:', err);
    } finally {
      setLoading(false);
    }
  }, [filterStage, filterLongLead]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // ---------------------------------------------------------------------------
  // CRUD operations
  // ---------------------------------------------------------------------------

  const handleCreate = async (item: Partial<ProcurementItem>) => {
    try {
      const res = await api.post('/procurement/items', item);
      setItems((prev) => [...prev, res.data]);
      setShowCreate(false);
    } catch (err) {
      console.error('Failed to create procurement item:', err);
    }
  };

  const handleUpdateStatus = async (id: string, stage: LifecycleStage, forecastDate?: string) => {
    try {
      const res = await api.put(`/procurement/items/${id}/status`, null, {
        params: { lifecycle_stage: stage, forecast_delivery_date: forecastDate },
      });
      setItems((prev) => prev.map((item) => (item.id === id ? res.data : item)));
      setShowStatusModal(false);
      setEditingItem(null);
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this procurement item?')) return;
    try {
      await api.delete(`/procurement/items/${id}`);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error('Failed to delete procurement item:', err);
    }
  };

  // ---------------------------------------------------------------------------
  // Computed metrics
  // ---------------------------------------------------------------------------

  const totalItems = items.length;
  const longLeadItems = items.filter((i) => i.is_long_lead_item).length;
  const today = new Date().toISOString().split('T')[0];
  const overdueItems = items.filter(
    (i) => i.forecast_delivery_date && i.forecast_delivery_date < today && i.lifecycle_stage !== 'ACCEPTED_INSPECTED'
  ).length;
  const inTransitItems = items.filter(
    (i) => i.lifecycle_stage === 'CUSTOMS_TRANSIT' || i.lifecycle_stage === 'IN_MANUFACTURE'
  ).length;

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  const filteredItems = items.filter((item) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.part_number.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.supplier_cage_code.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-ops-muted">Loading procurement data...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <Truck className="w-6 h-6 text-blue-400" />
          <div>
            <h1 className="text-lg font-semibold text-text-ops-primary">
              Procurement Dashboard
            </h1>
            <p className="text-sm text-text-ops-muted">
              Supply Chain Tracking &amp; Delivery Management
            </p>
          </div>
        </div>
        <button
          onClick={fetchItems}
          className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-4 gap-4 px-6 py-4 border-b border-border-ops-subtle">
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle">
          <div className="flex items-center gap-2 text-text-ops-muted text-sm mb-1">
            <Package className="w-4 h-4" />
            <span>Total Items</span>
          </div>
          <div className="text-2xl font-bold text-text-ops-primary">{totalItems}</div>
        </div>
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle">
          <div className="flex items-center gap-2 text-text-ops-muted text-sm mb-1">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Long Lead</span>
          </div>
          <div className="text-2xl font-bold text-amber-400">{longLeadItems}</div>
        </div>
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle">
          <div className="flex items-center gap-2 text-text-ops-muted text-sm mb-1">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span>Overdue</span>
          </div>
          <div className="text-2xl font-bold text-red-400">{overdueItems}</div>
        </div>
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle">
          <div className="flex items-center gap-2 text-text-ops-muted text-sm mb-1">
            <Truck className="w-4 h-4 text-blue-400" />
            <span>In Transit</span>
          </div>
          <div className="text-2xl font-bold text-blue-400">{inTransitItems}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border-ops-subtle">
        <select
          value={filterStage || ''}
          onChange={(e) => setFilterStage(e.target.value as LifecycleStage || null)}
          className="bg-bg-ops-surface border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
        >
          <option value="">All Stages</option>
          {LIFECYCLE_STAGES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-text-ops-muted">
          <input
            type="checkbox"
            checked={filterLongLead}
            onChange={(e) => setFilterLongLead(e.target.checked)}
            className="rounded"
          />
          Long Lead Only
        </label>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search part number, description..."
          className="flex-1 bg-bg-ops-surface border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
        />
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Item
        </button>
      </div>

      {/* Items Table */}
      <div className="flex-1 overflow-auto p-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-ops-subtle text-text-ops-muted">
              <th className="text-left py-2 px-3 font-medium">Part Number</th>
              <th className="text-left py-2 px-3 font-medium">Description</th>
              <th className="text-left py-2 px-3 font-medium">Supplier</th>
              <th className="text-left py-2 px-3 font-medium">Stage</th>
              <th className="text-left py-2 px-3 font-medium">Forecast</th>
              <th className="text-left py-2 px-3 font-medium">Actual</th>
              <th className="text-center py-2 px-3 font-medium">Long Lead</th>
              <th className="text-right py-2 px-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => {
              const stageInfo = LIFECYCLE_STAGES.find((s) => s.value === item.lifecycle_stage);
              const isOverdue = item.forecast_delivery_date && item.forecast_delivery_date < today && item.lifecycle_stage !== 'ACCEPTED_INSPECTED';
              return (
                <tr
                  key={item.id}
                  className={clsx(
                    'border-b border-border-ops-subtle hover:bg-bg-ops-overlay transition-colors',
                    isOverdue && 'bg-red-900/10'
                  )}
                >
                  <td className="py-2 px-3 font-mono text-text-ops-primary">
                    {item.part_number}
                  </td>
                  <td className="py-2 px-3 text-text-ops-primary max-w-xs truncate">
                    {item.description}
                  </td>
                  <td className="py-2 px-3 font-mono text-text-ops-muted">
                    {item.supplier_cage_code}
                  </td>
                  <td className="py-2 px-3">
                    <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', stageInfo?.color || 'text-text-ops-muted')}>
                      {stageInfo?.label || item.lifecycle_stage}
                    </span>
                  </td>
                  <td className={clsx('py-2 px-3 text-xs', isOverdue ? 'text-red-400 font-bold' : 'text-text-ops-muted')}>
                    {item.forecast_delivery_date || '—'}
                  </td>
                  <td className="py-2 px-3 text-xs text-text-ops-muted">
                    {item.actual_arrival_date || '—'}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {item.is_long_lead_item && <AlertTriangle className="w-4 h-4 text-amber-400 mx-auto" />}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          setEditingItem(item);
                          setShowStatusModal(true);
                        }}
                        className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-blue-400 transition-colors"
                        title="Update Status"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-text-ops-muted">
                  No procurement items found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <CreateProcurementModal
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Status Update Modal */}
      {showStatusModal && editingItem && (
        <UpdateStatusModal
          item={editingItem}
          onSubmit={(stage, date) => handleUpdateStatus(editingItem.id, stage, date)}
          onCancel={() => {
            setShowStatusModal(false);
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Create Procurement Modal
// ---------------------------------------------------------------------------

interface CreateProcurementModalProps {
  onSubmit: (item: Partial<ProcurementItem>) => void;
  onCancel: () => void;
}

const CreateProcurementModal: React.FC<CreateProcurementModalProps> = ({ onSubmit, onCancel }) => {
  const [partNumber, setPartNumber] = useState('');
  const [description, setDescription] = useState('');
  const [supplierCage, setSupplierCage] = useState('');
  const [forecastDate, setForecastDate] = useState('');
  const [isLongLead, setIsLongLead] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      part_number: partNumber,
      description,
      supplier_cage_code: supplierCage,
      forecast_delivery_date: forecastDate || undefined,
      is_long_lead_item: isLongLead,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bg-ops-surface rounded-lg border border-border-ops-strong p-6 w-full max-w-lg">
        <h2 className="text-lg font-semibold text-text-ops-primary mb-4">
          New Procurement Item
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-text-ops-muted mb-1">Part Number *</label>
              <input
                type="text"
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value.toUpperCase())}
                className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-text-ops-muted mb-1">Description *</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-text-ops-muted mb-1">Supplier CAGE Code *</label>
              <input
                type="text"
                value={supplierCage}
                onChange={(e) => setSupplierCage(e.target.value.toUpperCase())}
                className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-text-ops-muted mb-1">Forecast Delivery Date</label>
              <input
                type="date"
                value={forecastDate}
                onChange={(e) => setForecastDate(e.target.value)}
                className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-text-ops-muted">
              <input
                type="checkbox"
                checked={isLongLead}
                onChange={(e) => setIsLongLead(e.target.checked)}
                className="rounded"
              />
              Long Lead Item
            </label>
          </div>
          <div className="flex items-center gap-2 justify-end mt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Update Status Modal
// ---------------------------------------------------------------------------

interface UpdateStatusModalProps {
  item: ProcurementItem;
  onSubmit: (stage: LifecycleStage, date?: string) => void;
  onCancel: () => void;
}

const UpdateStatusModal: React.FC<UpdateStatusModalProps> = ({ item, onSubmit, onCancel }) => {
  const currentIndex = LIFECYCLE_ORDER.indexOf(item.lifecycle_stage);
  const availableStages = LIFECYCLE_ORDER.slice(currentIndex + 1);
  const [selectedStage, setSelectedStage] = useState(availableStages[0] || item.lifecycle_stage);
  const [forecastDate, setForecastDate] = useState(item.forecast_delivery_date || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(selectedStage, forecastDate || undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bg-ops-surface rounded-lg border border-border-ops-strong p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-text-ops-primary mb-1">
          Update Status
        </h2>
        <p className="text-sm text-text-ops-muted mb-4">
          {item.part_number} — {item.description}
        </p>
        <form onSubmit={handleSubmit}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-text-ops-muted mb-1">Current Stage</label>
              <div className="text-sm text-text-ops-primary">
                {LIFECYCLE_STAGES.find((s) => s.value === item.lifecycle_stage)?.label}
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-ops-muted mb-1">Advance To</label>
              <select
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value as LifecycleStage)}
                className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
              >
                {availableStages.map((stage) => {
                  const info = LIFECYCLE_STAGES.find((s) => s.value === stage);
                  return (
                    <option key={stage} value={stage}>
                      {info?.label}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-ops-muted mb-1">Updated Forecast Date</label>
              <input
                type="date"
                value={forecastDate}
                onChange={(e) => setForecastDate(e.target.value)}
                className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end mt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
            >
              Update
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProcurementView;
