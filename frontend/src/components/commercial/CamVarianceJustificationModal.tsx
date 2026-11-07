/**
 * CAM Technical Variance Narrative Dialog
 *
 * Modal for submitting variance justification when a timesheet batch is flagged
 * with HELD_FOR_CAM_JUSTIFICATION status. Follows IPMR Format 5 variance analysis
 * structure.
 *
 * Form Fields
 * -----------
 * 1. Root Cause Category — dropdown with standard categories:
 *    - Technical Non-Conformance
 *    - Test Rig Downtime
 *    - Material Incompatibility
 *    - Resource Skill Gap
 *    - Schedule Compression
 *    - External Dependency Delay
 *    - Other
 * 2. Technical Narrative — free-text area following IPMR Format 5 variance
 *    analysis format (cause, effect, corrective action)
 * 3. Corrective Action Plan — description of recovery measures
 * 4. Recovery Date — expected date when variance is resolved
 *
 * On Submit
 * ---------
 * - Dispatches to POST /api/v1/timesheets/{id}/justify
 * - Clears the HELD_FOR_CAM_JUSTIFICATION flag
 * - Attaches the narrative to the EVM audit trail
 *
 * Data source: POST /api/v1/timesheets/{id}/justify
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  X,
  ShieldAlert,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../services/api';
import type { TimesheetBatch } from '../../views/commercial/TimesheetCoherenceView';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RootCauseCategory =
  | 'TECHNICAL_NON_CONFORMANCE'
  | 'TEST_RIG_DOWNTIME'
  | 'MATERIAL_INCOMPATIBILITY'
  | 'RESOURCE_SKILL_GAP'
  | 'SCHEDULE_COMPRESSION'
  | 'EXTERNAL_DEPENDENCY_DELAY'
  | 'OTHER';

export interface CamVarianceJustificationModalProps {
  /** The timesheet batch requiring justification */
  batch: TimesheetBatch;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Called to close the modal without submitting */
  onClose: () => void;
  /** Called after a successful justification submission */
  onSubmit: (batchId: string) => void;
}

interface JustificationPayload {
  root_cause_category: RootCauseCategory;
  technical_narrative: string;
  corrective_action_plan: string;
  recovery_date: string;  // ISO date
}

/** Form state uses camelCase for React bindings */
interface JustificationForm {
  rootCauseCategory: RootCauseCategory | '';
  technicalNarrative: string;
  correctiveActionPlan: string;
  recoveryDate: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROOT_CAUSE_OPTIONS: { value: RootCauseCategory; label: string }[] = [
  { value: 'TECHNICAL_NON_CONFORMANCE', label: 'Technical Non-Conformance' },
  { value: 'TEST_RIG_DOWNTIME', label: 'Test Rig Downtime' },
  { value: 'MATERIAL_INCOMPATIBILITY', label: 'Material Incompatibility' },
  { value: 'RESOURCE_SKILL_GAP', label: 'Resource Skill Gap' },
  { value: 'SCHEDULE_COMPRESSION', label: 'Schedule Compression' },
  { value: 'EXTERNAL_DEPENDENCY_DELAY', label: 'External Dependency Delay' },
  { value: 'OTHER', label: 'Other' },
];

const INITIAL_FORM = {
  rootCauseCategory: '' as RootCauseCategory | '',
  technicalNarrative: '',
  correctiveActionPlan: '',
  recoveryDate: '',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format today's date as ISO date string for the default recovery date.
 */
function todayAsIso(): string {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

/**
 * Format ISO date for display.
 */
function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CamVarianceJustificationModal: React.FC<CamVarianceJustificationModalProps> = ({
  batch,
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [form, setForm] = useState<JustificationForm>({
    rootCauseCategory: '',
    technicalNarrative: '',
    correctiveActionPlan: '',
    recoveryDate: todayAsIso(),
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const narrativeRef = useRef<HTMLTextAreaElement>(null);

  // Reset form on open
  useEffect(() => {
    if (isOpen) {
      setForm({
        rootCauseCategory: '',
        technicalNarrative: '',
        correctiveActionPlan: '',
        recoveryDate: todayAsIso(),
      } as JustificationForm);
      setSubmitting(false);
      setError(null);
      setSuccess(false);
      // Focus narrative field after mount
      setTimeout(() => narrativeRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
      if (e.key === 'Enter' && e.ctrlKey && !submitting) {
        handleSubmit();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, submitting, onClose]);

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  // Form field handlers
  const handleFieldChange = useCallback(
    (field: string) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setForm((prev) => ({ ...prev, [field]: e.target.value }));
        setError(null);
      },
    [],
  );

  // Validation
  const isFormValid = useCallback(() => {
    const f = form as any;
    return (
      f.rootCauseCategory !== '' &&
      f.technicalNarrative.trim().length > 0 &&
      f.correctiveActionPlan.trim().length > 0 &&
      f.recoveryDate !== ''
    );
  }, [form]);

  // Submit handler
  const handleSubmit = useCallback(async () => {
    if (!isFormValid() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const payload: JustificationPayload = {
        root_cause_category: form.rootCauseCategory as RootCauseCategory,
        technical_narrative: (form as any).technicalNarrative.trim(),
        corrective_action_plan: (form as any).correctiveActionPlan.trim(),
        recovery_date: (form as any).recoveryDate,
      };

      await api.post(`/timesheets/${batch.id}/justify`, payload);

      setSuccess(true);
      setTimeout(() => {
        onSubmit(batch.id);
      }, 800);
    } catch (e: any) {
      console.error('Variance justification failed:', e);
      setError(
        e?.response?.data?.detail ??
          e?.message ??
          'Failed to submit variance justification. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }, [form, batch.id, isFormValid, submitting, onSubmit]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cam-variance-modal-title"
    >
      <div
        ref={modalRef}
        className={clsx(
          'relative w-full max-w-2xl max-h-[90vh] rounded-xl shadow-2xl overflow-hidden',
          'bg-bg-ops-surface border border-border-ops-subtle',
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-overlay/50">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5 p-2 rounded-lg bg-red-500/10 text-red-400">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h2
                id="cam-variance-modal-title"
                className="text-base font-semibold text-text-ops-primary"
              >
                CAM Variance Justification
              </h2>
              <p className="text-sm text-text-ops-muted mt-0.5">
                Batch <span className="font-mono">{batch.batch_id}</span> —{' '}
                {batch.work_package}
              </p>
              <p className="text-xs text-text-ops-muted mt-1">
                Week: {formatDate(batch.week_start)} – {formatDate(batch.week_end)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors disabled:opacity-50"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Divergence Summary */}
        <div className="mx-6 mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-amber-400">
              Divergence Detected
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-text-ops-muted">Labor Burn:</span>{' '}
              <span className="font-mono font-semibold text-amber-400">
                {batch.labor_burn_pct.toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="text-text-ops-muted">Physical %:</span>{' '}
              <span className="font-mono font-semibold text-red-400">
                {batch.physical_pct_complete.toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="text-text-ops-muted">ACWP:</span>{' '}
              <span className="font-mono text-text-ops-primary">
                {new Intl.NumberFormat('en-GB', {
                  style: 'currency',
                  currency: 'GBP',
                  minimumFractionDigits: 0,
                }).format(batch.acwp)}
              </span>
            </div>
            <div>
              <span className="text-text-ops-muted">PV:</span>{' '}
              <span className="font-mono text-text-ops-primary">
                {new Intl.NumberFormat('en-GB', {
                  style: 'currency',
                  currency: 'GBP',
                  minimumFractionDigits: 0,
                }).format(batch.pv)}
              </span>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <div className="px-6 py-4 overflow-y-auto max-h-[50vh] space-y-4">
          {/* Root Cause Category */}
          <div>
            <label className="block text-sm font-medium text-text-ops-primary mb-1.5">
              Root Cause Category <span className="text-red-400">*</span>
            </label>
            <select
              value={form.rootCauseCategory}
              onChange={handleFieldChange('rootCauseCategory')}
              className="w-full px-3 py-2 text-sm rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              <option value="">Select root cause category...</option>
              {ROOT_CAUSE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Technical Narrative */}
          <div>
            <label className="block text-sm font-medium text-text-ops-primary mb-1.5">
              Technical Narrative (IPMR Format 5) <span className="text-red-400">*</span>
            </label>
            <p className="text-xs text-text-ops-muted mb-1.5">
              Provide variance analysis following IPMR Format 5: describe the cause of the
              labor-progress divergence, its effect on the work package schedule and cost,
              and any downstream impact on the critical path.
            </p>
            <textarea
              ref={narrativeRef}
              value={(form as any).technicalNarrative}
              onChange={handleFieldChange('technicalNarrative')}
              rows={5}
              placeholder="Cause: ...&#10;Effect: ...&#10;Downstream Impact: ..."
              className="w-full px-3 py-2 text-sm rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary placeholder-text-ops-muted focus:outline-none focus:ring-2 focus:ring-sky-400 resize-y"
            />
          </div>

          {/* Corrective Action Plan */}
          <div>
            <label className="block text-sm font-medium text-text-ops-primary mb-1.5">
              Corrective Action Plan <span className="text-red-400">*</span>
            </label>
            <textarea
              value={(form as any).correctiveActionPlan}
              onChange={handleFieldChange('correctiveActionPlan')}
              rows={3}
              placeholder="Describe the corrective measures being taken to recover the variance..."
              className="w-full px-3 py-2 text-sm rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary placeholder-text-ops-muted focus:outline-none focus:ring-2 focus:ring-sky-400 resize-y"
            />
          </div>

          {/* Recovery Date */}
          <div>
            <label className="block text-sm font-medium text-text-ops-primary mb-1.5">
              Recovery Date <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={(form as any).recoveryDate}
              onChange={handleFieldChange('recoveryDate')}
              className="w-full px-3 py-2 text-sm rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm border border-red-500/20">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          {/* Success state */}
          {success && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm border border-emerald-500/20">
              <CheckCircle2 size={14} />
              Variance justification submitted. Hold flag cleared.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border-ops-subtle bg-bg-ops-overlay/50">
          <div className="flex items-center gap-2 text-xs text-text-ops-muted">
            <FileText size={12} />
            <span>
              Narrative will be attached to the EVM audit trail for batch{' '}
              <span className="font-mono">{batch.batch_id}</span>.
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium rounded-lg text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors disabled:opacity-50"
            >
              Dismiss
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isFormValid() || submitting}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-bg-ops-surface',
                !isFormValid() || submitting
                  ? 'bg-bg-ops-overlay text-text-ops-muted cursor-not-allowed'
                  : 'bg-sky-600 text-white hover:bg-sky-500',
              )}
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  Submit Variance Justification
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CamVarianceJustificationModal;
