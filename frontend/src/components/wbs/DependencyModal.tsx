/**
 * Dependency Modal
 *
 * Modal dialog for editing predecessors and successors of a WBS task.
 * Allows adding, removing, and configuring dependency relationships
 * (FS, SS, FF, SF) with optional lag/lead values.
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    {showDependencyModal && (
 *      <DependencyModal
 *        nodeId={selectedNodeId}
 *        dependencies={allDependencies}
 *        allRows={flatRows}
 *        onClose={() => setShowDependencyModal(false)}
 *      />
 *    )}
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { X, Plus, Trash2, Link, ArrowRight, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../services/api';
import type { WBSRow } from '../../types/wbs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

interface DependencyItem {
  id: string;
  predecessor_id: string;
  successor_id: string;
  dependency_type: DependencyType;
  lag_days: number;
}

interface DependencyModalProps {
  /** The node ID whose dependencies are being edited */
  nodeId: string;
  /** All dependency records */
  dependencies: DependencyItem[];
  /** All flat WBS rows for lookup */
  allRows: WBSRow[];
  /** Close callback */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Dependency Type Metadata
// ---------------------------------------------------------------------------

const DEPENDENCY_TYPES: { value: DependencyType; label: string; description: string }[] = [
  { value: 'FS', label: 'FS', description: 'Finish-to-Start' },
  { value: 'SS', label: 'SS', description: 'Start-to-Start' },
  { value: 'FF', label: 'FF', description: 'Finish-to-Finish' },
  { value: 'SF', label: 'SF', description: 'Start-to-Finish' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DependencyModal: React.FC<DependencyModalProps> = ({
  nodeId,
  dependencies,
  allRows,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'predecessors' | 'successors'>('predecessors');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build lookup maps
  const idToRow = useMemo(() => {
    const map = new Map<string, WBSRow>();
    for (const row of allRows) {
      map.set(row.id, row);
    }
    return map;
  }, [allRows]);

  const nodeRow = idToRow.get(nodeId) || null;

  // Filter dependencies for this node
  const predecessorDeps = useMemo(() => {
    return dependencies.filter((d) => d.successor_id === nodeId);
  }, [dependencies, nodeId]);

  const successorDeps = useMemo(() => {
    return dependencies.filter((d) => d.predecessor_id === nodeId);
  }, [dependencies, nodeId]);

  // Available tasks for adding new dependencies (exclude self)
  const availableTasks = useMemo(() => {
    const predIds = new Set(predecessorDeps.map((d) => d.predecessor_id));
    const succIds = new Set(successorDeps.map((d) => d.successor_id));
    return allRows
      .filter((r) => r.id !== nodeId && !predIds.has(r.id) && !succIds.has(r.id))
      .sort((a, b) => (a.code || '').localeCompare(b.code || ''));
  }, [allRows, nodeId, predecessorDeps, successorDeps]);

  // New dependency form state
  const [newTaskId, setNewTaskId] = useState('');
  const [newDepType, setNewDepType] = useState<DependencyType>('FS');
  const [newLagDays, setNewLagDays] = useState(0);

  const handleAddDependency = useCallback(async () => {
    if (!newTaskId) return;
    setLoading(true);
    setError(null);

    try {
      const depType = activeTab === 'predecessors' ? 'predecessors' : 'successors';
      const depText = `${newTaskId}${newDepType}${newLagDays !== 0 ? (newLagDays > 0 ? '+' : '') + newLagDays + 'd' : ''}`;

      // Build the full dependency text including existing ones
      const existingDeps = activeTab === 'predecessors' ? predecessorDeps : successorDeps;
      const existingTexts = existingDeps.map((d) => {
        const targetId = activeTab === 'predecessors' ? d.predecessor_id : d.successor_id;
        const targetRow = idToRow.get(targetId);
        const code = targetRow?.code || targetId;
        return `${code}${d.dependency_type}${d.lag_days !== 0 ? (d.lag_days > 0 ? '+' : '') + d.lag_days + 'd' : ''}`;
      });
      const allTexts = [...existingTexts, depText];
      const fullText = allTexts.join(', ');

      const payload: Record<string, unknown> = {};
      if (activeTab === 'predecessors') {
        payload.predecessors = fullText;
      } else {
        payload.successors = fullText;
      }

      await api.put(`/api/v1/wbs/nodes/${nodeId}`, payload);
      onClose();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Failed to add dependency';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setLoading(false);
    }
  }, [newTaskId, newDepType, newLagDays, activeTab, nodeId, predecessorDeps, idToRow, onClose]);

  const handleRemoveDependency = useCallback(async (dep: DependencyItem) => {
    setLoading(true);
    setError(null);

    try {
      // Remove this dependency and rebuild the text
      const currentDeps = activeTab === 'predecessors' ? predecessorDeps : successorDeps;
      const remaining = currentDeps.filter((d) => d.id !== dep.id);
      const texts = remaining.map((d) => {
        const targetId = activeTab === 'predecessors' ? d.predecessor_id : d.successor_id;
        const targetRow = idToRow.get(targetId);
        const code = targetRow?.code || targetId;
        return `${code}${d.dependency_type}${d.lag_days !== 0 ? (d.lag_days > 0 ? '+' : '') + d.lag_days + 'd' : ''}`;
      });
      const fullText = texts.join(', ');

      const payload: Record<string, unknown> = {};
      if (activeTab === 'predecessors') {
        payload.predecessors = fullText;
      } else {
        payload.successors = fullText;
      }

      await api.put(`/api/v1/wbs/nodes/${nodeId}`, payload);
      onClose();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Failed to remove dependency';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setLoading(false);
    }
  }, [activeTab, nodeId, predecessorDeps, idToRow, onClose]);

  const formatDepType = (type: DependencyType, lagDays: number) => {
    const lagStr = lagDays !== 0 ? (lagDays > 0 ? '+' : '') + lagDays + 'd' : '';
    return `${type}${lagStr}`;
  };

  const currentDeps = activeTab === 'predecessors' ? predecessorDeps : successorDeps;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] bg-bg-ops-surface border border-border-ops-strong rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
          <div>
            <h2 className="text-lg font-semibold text-text-ops-primary flex items-center gap-2">
              <Link size={18} />
              Dependencies
            </h2>
            {nodeRow && (
              <p className="text-xs text-text-ops-muted font-mono mt-0.5">
                {nodeRow.code} — {nodeRow.name}
              </p>
            )}
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
          {(['predecessors', 'successors'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setNewTaskId(''); }}
              className={clsx(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors capitalize',
                activeTab === tab
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-text-ops-muted hover:text-text-ops-primary'
              )}
            >
              {tab === 'predecessors' ? <ArrowRight size={14} /> : <ArrowRight size={14} className="rotate-180" />}
              {tab}
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-bg-ops-overlay">
                {tab === 'predecessors' ? predecessorDeps.length : successorDeps.length}
              </span>
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Existing Dependencies List */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-text-ops-primary mb-2">
              Current {activeTab === 'predecessors' ? 'Predecessors' : 'Successors'}
            </h3>
            {currentDeps.length === 0 ? (
              <div className="text-center py-6 text-text-ops-muted border border-dashed border-border-ops-subtle rounded-lg">
                <Link size={24} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No {activeTab} configured</p>
                <p className="text-xs mt-1">Add a dependency below to link tasks</p>
              </div>
            ) : (
              <div className="space-y-2">
                {currentDeps.map((dep) => {
                  const targetId = activeTab === 'predecessors' ? dep.predecessor_id : dep.successor_id;
                  const targetRow = idToRow.get(targetId);
                  const code = targetRow?.code || targetId;
                  const name = targetRow?.name || '';

                  return (
                    <div
                      key={dep.id}
                      className="flex items-center gap-3 p-3 bg-bg-ops-overlay border border-border-ops-subtle rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono text-text-ops-primary">{code}</span>
                          <span className="text-sm text-text-ops-muted truncate">{name}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-1.5 py-0.5 text-xs font-mono rounded bg-blue-900/30 text-blue-400">
                            {dep.dependency_type}
                          </span>
                          {dep.lag_days !== 0 && (
                            <span className="flex items-center gap-1 text-xs text-text-ops-muted">
                              <Clock size={10} />
                              {dep.lag_days > 0 ? '+' : ''}{dep.lag_days}d lag
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveDependency(dep)}
                        className="p-1.5 text-text-ops-muted hover:text-rag-red hover:bg-red-950/30 rounded transition-colors"
                        title="Remove dependency"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add New Dependency */}
          <div className="border-t border-border-ops-subtle pt-4">
            <h3 className="text-sm font-medium text-text-ops-primary mb-3 flex items-center gap-2">
              <Plus size={14} />
              Add {activeTab === 'predecessors' ? 'Predecessor' : 'Successor'}
            </h3>

            <div className="space-y-3">
              {/* Task Selector */}
              <div>
                <label className="block text-xs text-text-ops-muted mb-1">Task</label>
                <select
                  className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary text-sm focus:border-blue-500 focus:outline-none"
                  value={newTaskId}
                  onChange={(e) => setNewTaskId(e.target.value)}
                >
                  <option value="">Select a task...</option>
                  {availableTasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.code} — {task.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dependency Type */}
              <div>
                <label className="block text-xs text-text-ops-muted mb-1">Relationship Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {DEPENDENCY_TYPES.map((dt) => (
                    <button
                      key={dt.value}
                      type="button"
                      onClick={() => setNewDepType(dt.value)}
                      className={clsx(
                        'px-2 py-2 text-xs rounded border transition-colors text-center',
                        newDepType === dt.value
                          ? 'bg-blue-900/50 border-blue-500 text-blue-300'
                          : 'bg-bg-ops-overlay border-border-ops-subtle text-text-ops-muted hover:border-border-ops-strong'
                      )}
                      title={dt.description}
                    >
                      <div className="font-mono font-semibold">{dt.label}</div>
                      <div className="text-[10px] opacity-70">{dt.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Lag/Lead Days */}
              <div>
                <label className="block text-xs text-text-ops-muted mb-1">
                  Lag/Lead (days) — positive = lag, negative = lead
                </label>
                <input
                  type="number"
                  className="w-full px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded text-text-ops-primary font-mono text-sm focus:border-blue-500 focus:outline-none"
                  value={newLagDays}
                  onChange={(e) => setNewLagDays(parseInt(e.target.value) || 0)}
                />
              </div>

              {/* Preview */}
              {newTaskId && (
                <div className="p-3 bg-bg-ops-overlay border border-border-ops-subtle rounded-lg">
                  <div className="text-xs text-text-ops-muted mb-1">Preview</div>
                  <div className="text-sm font-mono text-text-ops-primary">
                    {(() => {
                      const task = idToRow.get(newTaskId);
                      return `${task?.code || newTaskId}${formatDepType(newDepType, newLagDays)}`;
                    })()}
                    {' → '}
                    {nodeRow?.code || nodeId}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <p className="text-xs text-rag-red">{error}</p>
              )}

              {/* Submit */}
              <button
                type="button"
                onClick={handleAddDependency}
                disabled={!newTaskId || loading}
                className={clsx(
                  'w-full flex items-center justify-center gap-2 px-4 py-2 text-sm rounded font-medium transition-colors',
                  !newTaskId || loading
                    ? 'bg-bg-ops-overlay text-text-ops-muted/40 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-500'
                )}
              >
                <Plus size={14} />
                {loading ? 'Adding...' : `Add ${activeTab === 'predecessors' ? 'Predecessor' : 'Successor'}`}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-4 border-t border-border-ops-subtle">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-ops-muted border border-border-ops-subtle rounded hover:border-border-ops-strong transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default DependencyModal;
