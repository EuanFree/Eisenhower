/**
 * Blocker Modal Component
 *
 * Modal dialog for immediately creating a NodeBlocker on a task.
 * Prompts the user for:
 * - Category: Type of impediment (dependency overdue, resource unavailable, etc.)
 * - Severity: CRITICAL, MAJOR, or MINOR
 * - Impacted Hours: Estimated hours of delay caused by this blocker
 *
 * On submit, calls POST /api/v1/cockpit/tasks/{node_id}/blocker which
 * atomically creates the NodeBlocker, updates task status, and records
 * an entry in ForensicAuditLog.
 *
 * Data source: POST /api/v1/cockpit/tasks/{node_id}/blocker
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  Link,
  UserX,
  ShieldAlert,
  Wrench,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../services/api';
import {
  BlockerCategory,
  BlockerSeverity,
  BlockerCreateRequest,
} from '../../types/cockpit';
import { FocusQueueTask } from '../../types/cockpit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BlockerModalProps {
  /** The task to create a blocker for */
  task: FocusQueueTask | null;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Called to close the modal */
  onClose: () => void;
  /** Called after a successful blocker creation */
  onCreated?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES: { value: BlockerCategory; label: string; icon: React.ReactNode }[] = [
  {
    value: 'DEPENDENCY_OVERDUE',
    label: 'Dependency Overdue',
    icon: <Link size={14} />,
  },
  {
    value: 'RESOURCE_UNAVAILABLE',
    label: 'Resource Unavailable',
    icon: <UserX size={14} />,
  },
  {
    value: 'CLEARANCE_HOLD',
    label: 'Clearance Hold',
    icon: <ShieldAlert size={14} />,
  },
  {
    value: 'FACILITY_MAINTENANCE',
    label: 'Facility Maintenance',
    icon: <Wrench size={14} />,
  },
  {
    value: 'OPERATIONAL_IMPEDIMENT',
    label: 'Operational Impediment',
    icon: <Activity size={14} />,
  },
];

const SEVERITIES: { value: BlockerSeverity; label: string; color: string; bgColor: string }[] = [
  {
    value: 'CRITICAL',
    label: 'Critical',
    color: 'text-red-400',
    bgColor: 'bg-red-900/40 border-red-500/50',
  },
  {
    value: 'MAJOR',
    label: 'Major',
    color: 'text-amber-400',
    bgColor: 'bg-amber-900/40 border-amber-500/50',
  },
  {
    value: 'MINOR',
    label: 'Minor',
    color: 'text-sky-400',
    bgColor: 'bg-sky-900/40 border-sky-500/50',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const BlockerModal: React.FC<BlockerModalProps> = ({
  task,
  isOpen,
  onClose,
  onCreated,
}) => {
  const [category, setCategory] = useState<BlockerCategory | ''>('');
  const [severity, setSeverity] = useState<BlockerSeverity | ''>('');
  const [impactedHours, setImpactedHours] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Reset form when task changes
  useEffect(() => {
    if (isOpen) {
      setCategory('');
      setSeverity('');
      setImpactedHours('');
      setError(null);
      setSuccess(false);
    }
  }, [isOpen, task?.id]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!task || !category || !severity || !impactedHours) {
        setError('Please fill in all fields');
        return;
      }

      const hours = parseFloat(impactedHours);
      if (isNaN(hours) || hours <= 0) {
        setError('Impacted hours must be a positive number');
        return;
      }

      setSubmitting(true);
      setError(null);

      try {
        await api.post<BlockerCreateRequest>(
          `/cockpit/tasks/${task.id}/blocker`,
          {
            category,
            severity,
            impacted_hours: hours,
          },
        );
        setSuccess(true);
        setTimeout(() => {
          onClose();
          onCreated?.();
        }, 1500);
      } catch (err: any) {
        const msg = err?.response?.data?.detail || 'Failed to create blocker';
        setError(typeof msg === 'string' ? msg : 'Failed to create blocker');
      } finally {
        setSubmitting(false);
      }
    },
    [task, category, severity, impactedHours, onClose, onCreated],
  );

  if (!isOpen || !task) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="blocker-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div
        className={clsx(
          'relative w-full max-w-lg mx-4 rounded-xl border shadow-2xl',
          'bg-bg-ops-surface border-border-ops-subtle',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-ops-subtle">
          <div className="flex items-center gap-3">
            <span className="text-amber-400">
              <AlertTriangle size={20} />
            </span>
            <div>
              <h2
                id="blocker-modal-title"
                className="text-base font-semibold text-text-ops-primary"
              >
                Flag Blocker
              </h2>
              <p className="text-xs text-text-ops-muted">
                {task.code}: {task.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Success state */}
        {success ? (
          <div className="flex flex-col items-center justify-center p-8 gap-3">
            <CheckCircle2 size={48} className="text-emerald-400" />
            <span className="text-lg font-semibold text-text-ops-primary">
              Blocker Created
            </span>
            <span className="text-sm text-text-ops-muted">
              The impediment has been logged and recorded in the audit trail.
            </span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-4">
            {/* Category selection */}
            <div>
              <label className="block text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-2">
                Category
              </label>
              <div className="grid grid-cols-1 gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    className={clsx(
                      'flex items-center gap-3 p-3 rounded-lg border text-left transition-colors',
                      category === cat.value
                        ? 'bg-amber-900/20 border-amber-500/50 text-amber-400'
                        : 'bg-bg-ops-base border-border-ops-subtle text-text-ops-primary hover:border-border-ops-strong',
                    )}
                  >
                    <span className={category === cat.value ? 'text-amber-400' : 'text-text-ops-muted'}>
                      {cat.icon}
                    </span>
                    <span className="text-sm">{cat.label}</span>
                    {category === cat.value && (
                      <CheckCircle2 size={14} className="ml-auto text-amber-400" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Severity selection */}
            <div>
              <label className="block text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-2">
                Severity
              </label>
              <div className="flex gap-2">
                {SEVERITIES.map((sev) => (
                  <button
                    key={sev.value}
                    type="button"
                    onClick={() => setSeverity(sev.value)}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-semibold transition-colors',
                      severity === sev.value
                        ? `${sev.bgColor} ${sev.color}`
                        : 'bg-bg-ops-base border-border-ops-subtle text-text-ops-primary hover:border-border-ops-strong',
                    )}
                  >
                    {sev.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Impacted hours */}
            <div>
              <label
                htmlFor="impacted-hours"
                className="block text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-2"
              >
                Impacted Hours
              </label>
              <input
                id="impacted-hours"
                type="number"
                step="0.5"
                min="0"
                value={impactedHours}
                onChange={(e) => setImpactedHours(e.target.value)}
                placeholder="e.g., 8"
                className={clsx(
                  'w-full px-3 py-2 text-sm font-mono rounded-lg border',
                  'bg-bg-ops-base border-border-ops-subtle text-text-ops-primary',
                  'focus:outline-none focus:border-amber-500',
                )}
              />
              <p className="mt-1 text-[10px] text-text-ops-muted">
                Estimated hours of delay caused by this blocker.
              </p>
            </div>

            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 p-2 rounded bg-red-900/30 border border-red-500/40 text-red-400 text-xs">
                <AlertTriangle size={12} />
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-lg border border-border-ops-subtle text-text-ops-muted hover:bg-bg-ops-overlay transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !category || !severity || !impactedHours}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors',
                  'bg-amber-600 text-white hover:bg-amber-500',
                  'disabled:opacity-30 disabled:cursor-not-allowed',
                )}
              >
                {submitting ? (
                  'Creating...'
                ) : (
                  <>
                    <AlertTriangle size={14} />
                    Create Blocker
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default BlockerModal;
