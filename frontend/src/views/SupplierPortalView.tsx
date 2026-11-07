/**
 * Supplier Portal View
 *
 * Isolated dashboard for external tier-1/tier-2 subcontractor engineers.
 * This view provides a clean, boundary-constrained workspace where suppliers
 * can manage their contractual work packages, submit deliverables, and
 * upload schedule updates — without exposure to the prime master schedule.
 *
 * Sections
 * --------
 *
 * 1. **Header** — Vendor CAGE code, legal entity, and clearance level.
 * 2. **Contract Deliverable In-Tray** — Tabular list of due SDRLs with
 *    statutory countdown clocks and customer status dispositions.
 * 3. **Work Package Progress Matrix** — Minimalist, high-contrast grid
 *    allowing direct submission of physical percent complete and milestone
 *    forecast dates.
 * 4. **Schedule Upload Box** — Dropzone to upload monthly .xer or .xml
 *    updates, triggering the automated delta-validation engine.
 *
 * Security
 * --------
 *
 * All data is filtered through the Subcontractor ABAC layer.  The supplier
 * can only see tasks where their vendor CAGE code matches the assigned
 * boundary node.  Prime EVM cost rates, parent programme hierarchies, and
 * sibling work packages are completely hidden.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Package,
  Upload,
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Building2,
  Shield,
  TrendingUp,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../services/api';
import type {
  SupplierTask,
  SupplierCDRLItem,
  SupplierProgressUpdate,
} from '../types/supplier';
import { CDRL_STATUS_COLORS, CDRL_STATUS_BG } from '../types/supplier';

// ---------------------------------------------------------------------------
// Contract Deliverable In-Tray
// ---------------------------------------------------------------------------

const CDRLInTray: React.FC<{
  deliverables: SupplierCDRLItem[];
  loading: boolean;
}> = ({ deliverables, loading }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-text-ops-muted">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
        <span className="text-sm">Loading deliverables...</span>
      </div>
    );
  }

  if (deliverables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-text-ops-muted">
        <FileText className="w-10 h-10 mb-3 opacity-50" />
        <p className="text-sm">No deliverables assigned to your vendor.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-ops-subtle text-text-ops-muted">
            <th className="text-left py-2 px-3 font-medium">CDRL Number</th>
            <th className="text-left py-2 px-3 font-medium">Title</th>
            <th className="text-left py-2 px-3 font-medium">Revision</th>
            <th className="text-left py-2 px-3 font-medium">Status</th>
            <th className="text-left py-2 px-3 font-medium">Due Date</th>
            <th className="text-left py-2 px-3 font-medium">Review Window</th>
            <th className="py-2 px-3 w-8" />
          </tr>
        </thead>
        <tbody>
          {deliverables.map((cdrl) => {
            const isExpanded = expandedId === cdrl.id;
            const statusColor = (CDRL_STATUS_COLORS as any)[cdrl.status] || 'text-text-ops-muted';
            const statusBg = (CDRL_STATUS_BG as any)[cdrl.status] || 'bg-bg-ops-overlay';

            // Countdown badge styling
            let countdownColor = 'text-text-ops-muted';
            let countdownBg = 'bg-bg-ops-overlay';
            if (cdrl.days_until_review_deadline !== null && cdrl.days_until_review_deadline !== undefined) {
              if (cdrl.days_until_review_deadline < 0) {
                countdownColor = 'text-red-400';
                countdownBg = 'bg-red-900/30';
              } else if (cdrl.days_until_review_deadline <= 5) {
                countdownColor = 'text-amber-400';
                countdownBg = 'bg-amber-900/30';
              } else {
                countdownColor = 'text-green-400';
                countdownBg = 'bg-green-900/30';
              }
            }

            return (
              <React.Fragment key={cdrl.id}>
                <tr
                  className="border-b border-border-ops-subtle hover:bg-bg-ops-overlay/50 cursor-pointer transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : cdrl.id)}
                >
                  <td className="py-2 px-3 font-mono text-text-ops-primary">
                    {cdrl.cdrl_sequence_number}
                  </td>
                  <td className="py-2 px-3 text-text-ops-primary truncate max-w-[250px]">
                    {cdrl.title}
                  </td>
                  <td className="py-2 px-3 font-mono text-text-ops-muted">
                    {cdrl.revision}
                  </td>
                  <td className="py-2 px-3">
                    <span className={clsx(
                      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                      statusBg,
                      statusColor,
                    )}>
                      {cdrl.status}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-mono text-text-ops-muted">
                    {cdrl.contractual_due_date
                      ? new Date(cdrl.contractual_due_date).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : '—'}
                  </td>
                  <td className="py-2 px-3">
                    {cdrl.days_until_review_deadline !== null && cdrl.days_until_review_deadline !== undefined ? (
                      <span className={clsx(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
                        countdownBg,
                        countdownColor,
                      )}>
                        <Clock className="w-3 h-3" />
                        {cdrl.days_until_review_deadline < 0
                          ? `${Math.abs(cdrl.days_until_review_deadline)}d Overdue`
                          : `${cdrl.days_until_review_deadline} Days Left`}
                      </span>
                    ) : (
                      <span className="text-text-ops-muted text-xs">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-text-ops-muted">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="bg-bg-ops-overlay/30">
                    <td colSpan={7} className="py-3 px-4">
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="text-text-ops-muted">DID Reference:</span>
                          <p className="font-mono text-text-ops-primary mt-0.5">
                            {cdrl.did_reference || '—'}
                          </p>
                        </div>
                        <div>
                          <span className="text-text-ops-muted">Submitted:</span>
                          <p className="font-mono text-text-ops-primary mt-0.5">
                            {cdrl.actual_submission_date
                              ? new Date(cdrl.actual_submission_date).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : 'Not yet submitted'}
                          </p>
                        </div>
                        <div>
                          <span className="text-text-ops-muted">Review Deadline:</span>
                          <p className="font-mono text-text-ops-primary mt-0.5">
                            {cdrl.review_deadline_date
                              ? new Date(cdrl.review_deadline_date).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : '—'}
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Work Package Progress Matrix
// ---------------------------------------------------------------------------

const ProgressMatrix: React.FC<{
  tasks: SupplierTask[];
  loading: boolean;
  onProgressUpdate: (taskId: string, update: SupplierProgressUpdate) => void;
}> = ({ tasks, loading, onProgressUpdate }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPercent, setEditPercent] = useState(0);
  const [editNotes, setEditNotes] = useState('');
  const [editHours, setEditHours] = useState('');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-text-ops-muted">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
        <span className="text-sm">Loading work packages...</span>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-text-ops-muted">
        <Package className="w-10 h-10 mb-3 opacity-50" />
        <p className="text-sm">No work packages assigned to your vendor.</p>
      </div>
    );
  }

  const startEdit = (task: SupplierTask) => {
    setEditingId(task.id);
    setEditPercent(task.percent_complete);
    setEditNotes('');
    setEditHours('');
  };

  const saveEdit = (taskId: string) => {
    if (editPercent < 0 || editPercent > 100) return;
    const update: SupplierProgressUpdate = {
      percent_complete: editPercent,
      notes: editNotes || undefined,
      hours_logged_today: editHours ? parseFloat(editHours) : undefined,
    };
    onProgressUpdate(taskId, update);
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-ops-subtle text-text-ops-muted">
            <th className="text-left py-2 px-3 font-medium">Code</th>
            <th className="text-left py-2 px-3 font-medium">Task Name</th>
            <th className="text-left py-2 px-3 font-medium">Delivery</th>
            <th className="text-left py-2 px-3 font-medium">Planned</th>
            <th className="text-left py-2 px-3 font-medium">Progress</th>
            <th className="text-left py-2 px-3 font-medium">Float</th>
            <th className="text-left py-2 px-3 font-medium">Blockers</th>
            <th className="py-2 px-3 w-20">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const isEditing = editingId === task.id;
            const progressColor =
              task.percent_complete >= 100
                ? 'bg-green-500'
                : task.percent_complete >= 50
                ? 'bg-amber-500'
                : 'bg-sky-500';

            return (
              <tr
                key={task.id}
                className={clsx(
                  'border-b border-border-ops-subtle hover:bg-bg-ops-overlay/50 transition-colors',
                  task.is_critical && 'border-l-2 border-l-red-500',
                )}
              >
                <td className="py-2 px-3 font-mono text-text-ops-primary">
                  {task.code}
                  {task.is_critical && (
                    <span className="ml-1 text-red-400" title="Critical Path">
                      ★
                    </span>
                  )}
                </td>
                <td className="py-2 px-3 text-text-ops-primary truncate max-w-[200px]">
                  {task.name === '[RESTRICTED]' ? (
                    <span className="italic text-text-ops-muted" title="Classified — insufficient clearance">
                      [RESTRICTED]
                    </span>
                  ) : (
                    task.name
                  )}
                </td>
                <td className="py-2 px-3">
                  {task.delivery_mode ? (
                    <span className={clsx(
                      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                      task.delivery_mode === 'AGILE'
                        ? 'bg-purple-900/30 text-purple-400'
                        : task.delivery_mode === 'HYBRID'
                        ? 'bg-blue-900/30 text-blue-400'
                        : 'bg-bg-ops-overlay text-text-ops-muted',
                    )}>
                      {task.delivery_mode}
                    </span>
                  ) : (
                    <span className="text-text-ops-muted text-xs">—</span>
                  )}
                </td>
                <td className="py-2 px-3 font-mono text-text-ops-muted text-xs">
                  {task.planned_start_date && task.planned_end_date ? (
                    <>
                      {new Date(task.planned_start_date).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                      })}
                      <br />
                      → {new Date(task.planned_end_date).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2 px-3">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={editPercent}
                        onChange={(e) => setEditPercent(Number(e.target.value))}
                        className="w-16 bg-bg-ops-base border border-border-ops-subtle rounded px-2 py-1 text-sm font-mono text-text-ops-primary"
                        aria-label="Progress percentage"
                      />
                      <span className="text-text-ops-muted">%</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-bg-ops-overlay rounded-full overflow-hidden">
                        <div
                          className={clsx('h-full rounded-full transition-all', progressColor)}
                          style={{ width: `${task.percent_complete}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs text-text-ops-primary w-10 text-right">
                        {task.percent_complete.toFixed(0)}%
                      </span>
                    </div>
                  )}
                </td>
                <td className="py-2 px-3 font-mono text-xs">
                  {task.total_float !== null ? (
                    <span className={clsx(
                      task.total_float <= 0 ? 'text-red-400' : 'text-text-ops-muted',
                    )}>
                      {task.total_float}d
                    </span>
                  ) : (
                    <span className="text-text-ops-muted">—</span>
                  )}
                </td>
                <td className="py-2 px-3">
                  {task.has_active_blocker ? (
                    <span className="inline-flex items-center gap-1 text-amber-400" title={`${task.blockers_count} active blocker(s)`}>
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-xs">{task.blockers_count}</span>
                    </span>
                  ) : (
                    <span className="text-text-ops-muted text-xs">—</span>
                  )}
                </td>
                <td className="py-2 px-3">
                  {isEditing ? (
                    <div className="flex flex-col gap-1">
                      <input
                        type="text"
                        placeholder="Notes..."
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        className="w-full bg-bg-ops-base border border-border-ops-subtle rounded px-2 py-1 text-xs text-text-ops-primary"
                        aria-label="Status notes"
                      />
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        placeholder="Hours"
                        value={editHours}
                        onChange={(e) => setEditHours(e.target.value)}
                        className="w-full bg-bg-ops-base border border-border-ops-subtle rounded px-2 py-1 text-xs text-text-ops-primary"
                        aria-label="Hours logged today"
                      />
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => saveEdit(task.id)}
                          className="flex-1 px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-xs text-white transition-colors"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="flex-1 px-2 py-1 bg-bg-ops-overlay hover:bg-bg-ops-surface rounded text-xs text-text-ops-muted transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(task)}
                      className="px-2 py-1 bg-bg-ops-overlay hover:bg-bg-ops-surface rounded text-xs text-text-ops-muted hover:text-text-ops-primary transition-colors"
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Schedule Upload Box
// ---------------------------------------------------------------------------

const ScheduleUploadBox: React.FC = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await uploadFile(file);
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xer' && ext !== 'xml') {
      setUploadMessage('Error: Only .xer (Primavera P6) or .xml (MS Project) files are accepted.');
      return;
    }

    setUploading(true);
    setUploadMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/api/v1/supplier-portal/schedule/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data) {
        setUploadMessage(`✓ ${response.data.message || 'File uploaded successfully.'}`);
      }
    } catch (err: any) {
      setUploadMessage(`Error: ${err.response?.data?.detail || 'Upload failed.'}`);
    } finally {
      setUploading(false);
    }
  }, []);

  return (
    <div
      className={clsx(
        'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
        isDragging
          ? 'border-sky-500 bg-sky-900/10'
          : 'border-border-ops-subtle hover:border-border-ops-strong',
      )}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <Upload className="w-10 h-10 mx-auto mb-3 text-text-ops-muted" />
      <p className="text-text-ops-primary text-sm mb-1">
        Upload Monthly Schedule Update
      </p>
      <p className="text-text-ops-muted text-xs mb-4">
        Drag and drop a <code className="font-mono">.xer</code> (Primavera P6) or{' '}
        <code className="font-mono">.xml</code> (MS Project) file
      </p>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-sky-800 rounded-md text-sm text-white transition-colors"
      >
        {uploading ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading...
          </span>
        ) : (
          'Select File'
        )}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xer,.xml"
        className="hidden"
        onChange={handleFileSelect}
      />
      {uploadMessage && (
        <p className={clsx(
          'mt-4 text-xs font-mono',
          uploadMessage.startsWith('✓') ? 'text-green-400' : 'text-red-400',
        )}>
          {uploadMessage}
        </p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main View
// ---------------------------------------------------------------------------

const SupplierPortalView: React.FC = () => {
  const [tasks, setTasks] = useState<SupplierTask[]>([]);
  const [deliverables, setDeliverables] = useState<SupplierCDRLItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tasks' | 'cdrl' | 'upload'>('tasks');

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [tasksRes, cdrlRes] = await Promise.all([
          api.get('/api/v1/supplier-portal/tasks').catch(() => null),
          api.get('/api/v1/supplier-portal/cdrl').catch(() => null),
        ]);

        if (tasksRes?.data) {
          setTasks(tasksRes.data.tasks || []);
        }
        if (cdrlRes?.data) {
          setDeliverables(cdrlRes.data.deliverables || []);
        }
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load supplier portal data.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleProgressUpdate = useCallback(async (taskId: string, update: SupplierProgressUpdate) => {
    try {
      const response = await api.post(`/api/v1/supplier-portal/tasks/${taskId}/progress`, update);
      if (response.data) {
        // Refresh tasks
        const res = await api.get('/api/v1/supplier-portal/tasks');
        if (res?.data) {
          setTasks(res.data.tasks || []);
        }
      }
    } catch (err: any) {
      console.error('Progress update failed:', err);
    }
  }, []);

  // Summary stats
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.percent_complete >= 100).length;
  const blockedTasks = tasks.filter((t) => t.has_active_blocker).length;
  const criticalTasks = tasks.filter((t) => t.is_critical).length;
  const overdueDeliverables = deliverables.filter(
    (d) => d.days_until_review_deadline !== null && d.days_until_review_deadline !== undefined && d.days_until_review_deadline < 0,
  ).length;

  return (
    <div className="flex flex-col h-full bg-bg-ops-base">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-surface">
        <div>
          <h1 className="text-lg font-semibold text-text-ops-primary">Supplier Portal</h1>
          <p className="text-sm text-text-ops-muted">
            Isolated workspace for external vendor engineers
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-bg-ops-overlay rounded-md border border-border-ops-subtle">
            <Shield className="w-4 h-4 text-sky-400" />
            <span className="text-xs font-mono text-text-ops-primary">SUBCONTRACTOR</span>
          </span>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-4 gap-4 px-6 py-3 border-b border-border-ops-subtle bg-bg-ops-surface/50">
        <div className="flex items-center gap-3 px-4 py-2 bg-bg-ops-overlay rounded-md">
          <Package className="w-5 h-5 text-sky-400" />
          <div>
            <p className="text-xs text-text-ops-muted">Work Packages</p>
            <p className="text-lg font-mono text-text-ops-primary">
              {completedTasks}/{totalTasks}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 bg-bg-ops-overlay rounded-md">
          <TrendingUp className="w-5 h-5 text-amber-400" />
          <div>
            <p className="text-xs text-text-ops-muted">Critical Path</p>
            <p className="text-lg font-mono text-amber-400">{criticalTasks}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 bg-bg-ops-overlay rounded-md">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <div>
            <p className="text-xs text-text-ops-muted">Blocked</p>
            <p className="text-lg font-mono text-red-400">{blockedTasks}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 bg-bg-ops-overlay rounded-md">
          <FileText className="w-5 h-5 text-green-400" />
          <div>
            <p className="text-xs text-text-ops-muted">Overdue CDRLs</p>
            <p className={clsx(
              'text-lg font-mono',
              overdueDeliverables > 0 ? 'text-red-400' : 'text-green-400',
            )}>
              {overdueDeliverables}
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 px-6 py-2 border-b border-border-ops-subtle">
        <button
          type="button"
          onClick={() => setActiveTab('tasks')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            activeTab === 'tasks'
              ? 'bg-bg-ops-overlay text-text-ops-primary'
              : 'text-text-ops-muted hover:text-text-ops-primary',
          )}
        >
          <Package className="w-4 h-4" />
          Work Packages
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('cdrl')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            activeTab === 'cdrl'
              ? 'bg-bg-ops-overlay text-text-ops-primary'
              : 'text-text-ops-muted hover:text-text-ops-primary',
          )}
        >
          <FileText className="w-4 h-4" />
          Deliverables
          {overdueDeliverables > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-red-900/50 text-red-400 rounded text-xs">
              {overdueDeliverables}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('upload')}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            activeTab === 'upload'
              ? 'bg-bg-ops-overlay text-text-ops-primary'
              : 'text-text-ops-muted hover:text-text-ops-primary',
          )}
        >
          <Upload className="w-4 h-4" />
          Schedule Upload
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-900/20 border border-red-800/50 rounded-md flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'tasks' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-text-ops-primary">
                Work Package Progress Matrix
              </h2>
              <span className="text-xs text-text-ops-muted">
                {tasks.length} task{tasks.length !== 1 ? 's' : ''} assigned to your vendor
              </span>
            </div>
            <ProgressMatrix
              tasks={tasks}
              loading={loading}
              onProgressUpdate={handleProgressUpdate}
            />
          </div>
        )}

        {activeTab === 'cdrl' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-text-ops-primary">
                Contract Deliverable In-Tray
              </h2>
              <span className="text-xs text-text-ops-muted">
                {deliverables.length} deliverable{deliverables.length !== 1 ? 's' : ''}
              </span>
            </div>
            <CDRLInTray
              deliverables={deliverables}
              loading={loading}
            />
          </div>
        )}

        {activeTab === 'upload' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-text-ops-primary">
                Schedule Upload
              </h2>
            </div>
            <div className="max-w-xl">
              <ScheduleUploadBox />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupplierPortalView;
