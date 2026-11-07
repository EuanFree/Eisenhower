/**
 * ReservationModal Component
 *
 * Modal form for creating a new chamber reservation.
 *
 * Collects:
 * - Linked testing task (portfolio_node_id)
 * - Operating temperature bounds (min/max °C)
 * - Requested power profile (kW)
 * - Test operator ID
 * - Reservation start and end dates
 *
 * Interlock Feedback
 * ------------------
 * Displays live validation errors if:
 * - The requested temperature profile exceeds the chamber's rated envelope.
 * - The reservation extends past the chamber's calibration expiration date.
 * - The buffer windows conflict with existing reservations.
 *
 * @example
 * ```tsx
 * <ReservationModal
 *   open={modalOpen}
 *   onClose={() => setModalOpen(false)}
 *   facility={selectedFacility}
 *   suggestedStart={suggestedDate}
 *   onSubmit={handleReservationSubmit}
 * />
 * ```
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  X,
  Calendar,
  Thermometer,
  Zap,
  User,
  ClipboardList,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../services/api';
import type {
  FacilityTimelineResponse,
  ChamberReservationCreate,
  FacilityValidationResponse,
  ReservationFormState,
  ReservationValidationErrors,
} from '../../types/facility';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Component props */
interface ReservationModalProps {
  /** Whether the modal is currently open */
  open: boolean;
  /** Called when the modal is closed */
  onClose: () => void;
  /** Facility being reserved */
  facility: FacilityTimelineResponse | null;
  /** Suggested start date (from timeline click) */
  suggestedStart: Date | null;
  /** Called when reservation is successfully submitted */
  onSubmit: (reservation: ChamberReservationCreate) => void;
}

// ---------------------------------------------------------------------------
// Default form state
// ---------------------------------------------------------------------------

/**
 * Create a default reservation form state.
 *
 * @param facility - The facility being reserved
 * @param suggestedStart - Suggested start date
 * @returns Default form state
 */
function createDefaultForm(
  facility: FacilityTimelineResponse | null,
  suggestedStart: Date | null,
): ReservationFormState {
  const start = suggestedStart || new Date();
  start.setHours(8, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    portfolio_node_id: '',
    reserved_start: start.toISOString().slice(0, 16).replace('T', ' '),
    reserved_end: end.toISOString().slice(0, 16).replace('T', ' '),
    setup_teardown_hours: facility?.warmup_cooldown_hours || 2.0,
    power_profile_kw: null,
    temp_min_c: null,
    temp_max_c: null,
    test_operator_user_id: '',
  };
}

// ---------------------------------------------------------------------------
// Sub-component: Validation Error List
// ---------------------------------------------------------------------------

/**
 * Render a list of validation errors for a specific gate.
 *
 * @param props - Component props
 */
const ValidationErrorList: React.FC<{
  errors?: string[];
  label: string;
  icon?: React.ReactNode;
}> = ({ errors, label, icon }) => {
  if (!errors || errors.length === 0) return null;

  return (
    <div className="mt-2 p-2 rounded bg-red-900/20 border border-red-800/40">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400 mb-1">
        {icon || <AlertTriangle className="w-3.5 h-3.5" />}
        <span>{label}</span>
      </div>
      <ul className="text-[11px] text-red-300/80 space-y-0.5">
        {errors.map((error, i) => (
          <li key={i} className="flex items-start gap-1">
            <span className="mr-1">•</span>
            {error}
          </li>
        ))}
      </ul>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: Gate Status Indicator
// ---------------------------------------------------------------------------

/**
 * Render a gate status indicator (pass/fail/pending).
 *
 * @param props - Component props
 */
const GateStatus: React.FC<{
  label: string;
  passed: boolean;
  pending?: boolean;
}> = ({ label, passed, pending = false }) => {
  if (pending) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-text-ops-muted">
        <Clock className="w-3.5 h-3.5" />
        <span>{label}</span>
      </div>
    );
  }
  return (
    <div
      className={clsx(
        'flex items-center gap-1.5 text-xs',
        passed ? 'text-green-400' : 'text-red-400',
      )}
    >
      {passed ? (
        <CheckCircle className="w-3.5 h-3.5" />
      ) : (
        <AlertTriangle className="w-3.5 h-3.5" />
      )}
      <span>{label}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component: ReservationModal
// ---------------------------------------------------------------------------

/**
 * ReservationModal — Form for creating chamber reservations with validation interlocks.
 *
 * @param props - Component props
 */
const ReservationModal: React.FC<ReservationModalProps> = ({
  open,
  onClose,
  facility,
  suggestedStart,
  onSubmit,
}) => {
  const [form, setForm] = useState<ReservationFormState>(createDefaultForm(null, null));
  const [validationErrors, setValidationErrors] = useState<ReservationValidationErrors>({});
  const [validationResult, setValidationResult] = useState<FacilityValidationResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setForm(createDefaultForm(facility, suggestedStart));
      setValidationErrors({});
      setValidationResult(null);
      setIsSubmitting(false);
    }
  }, [open, facility, suggestedStart]);

  // Update form field
  const updateField = useCallback(
    <K extends keyof ReservationFormState>(field: K, value: ReservationFormState[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  // Validate against backend
  const validateReservation = useCallback(async () => {
    if (!facility) return;

    setIsValidating(true);
    setValidationErrors({});

    try {
      const response = await api.post<FacilityValidationResponse>(
        '/api/v1/facilities/validate',
        {
          location_node_id: facility.location_id,
          portfolio_node_id: form.portfolio_node_id,
          reserved_start: form.reserved_start,
          reserved_end: form.reserved_end,
          setup_teardown_hours: form.setup_teardown_hours,
          power_profile_kw: form.power_profile_kw,
          test_operator_user_id: form.test_operator_user_id,
          environmental_envelope: {
            temp_min_c: form.temp_min_c,
            temp_max_c: form.temp_max_c,
          },
        },
      );

      const result = response.data;
      setValidationResult(result);

      if (!result.valid) {
        const errors: ReservationValidationErrors = {};
        if (!result.capability_gate) {
          errors.capability = result.errors.filter((e, i) => i < result.errors.length / 3);
        }
        if (!result.calibration_gate) {
          errors.calibration = result.errors.filter((e, i) => i >= result.errors.length / 3 && i < (2 * result.errors.length) / 3);
        }
        if (!result.buffer_gate) {
          errors.buffer = result.errors.filter((e, i) => i >= (2 * result.errors.length) / 3);
        }
        // If no specific gate errors, put all in form errors
        if (Object.keys(errors).length === 0) {
          errors.form = result.errors;
        }
        setValidationErrors(errors);
      }
    } catch {
      // If validation endpoint is not available, perform local checks
      const localErrors: ReservationValidationErrors = {};

      // Check temperature against chamber capabilities
      if (facility.chamber_capabilities) {
        const caps = facility.chamber_capabilities;
        if (form.temp_min_c != null && caps.temp_min_c != null) {
          if (form.temp_min_c < caps.temp_min_c) {
            localErrors.capability = localErrors.capability || [];
            localErrors.capability.push(
              `Requested min temp (${form.temp_min_c}°C) is below chamber minimum (${caps.temp_min_c}°C).`,
            );
          }
        }
        if (form.temp_max_c != null && caps.temp_max_c != null) {
          if (form.temp_max_c > caps.temp_max_c) {
            localErrors.capability = localErrors.capability || [];
            localErrors.capability.push(
              `Requested max temp (${form.temp_max_c}°C) exceeds chamber maximum (${caps.temp_max_c}°C).`,
            );
          }
        }
        if (form.power_profile_kw != null && caps.max_power_kw != null) {
          if (form.power_profile_kw > caps.max_power_kw) {
            localErrors.capability = localErrors.capability || [];
            localErrors.capability.push(
              `Requested power (${form.power_profile_kw} kW) exceeds chamber limit (${caps.max_power_kw} kW).`,
            );
          }
        }
      }

      // Check calibration expiry
      if (facility.calibration_expiry_date) {
        const expiry = new Date(facility.calibration_expiry_date);
        const reservedEnd = new Date(form.reserved_end);
        if (reservedEnd > expiry) {
          localErrors.calibration = [
            `Reservation end (${form.reserved_end}) extends past calibration expiry (${facility.calibration_expiry_date}).`,
          ];
        }
      }

      // Check required fields
      if (!form.portfolio_node_id) {
        localErrors.form = localErrors.form || [];
        localErrors.form.push('Testing task is required.');
      }
      if (!form.test_operator_user_id) {
        localErrors.form = localErrors.form || [];
        localErrors.form.push('Test operator is required.');
      }

      setValidationErrors(localErrors);
      setValidationResult({
        valid: Object.keys(localErrors).length === 0,
        capability_gate: !localErrors.capability,
        calibration_gate: !localErrors.calibration,
        buffer_gate: true,
        errors: Object.values(localErrors).flat(),
        buffer_start: null,
        buffer_end: null,
      });
    } finally {
      setIsValidating(false);
    }
  }, [facility, form]);

  // Submit reservation
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Validate first
      await validateReservation();

      const hasErrors = Object.keys(validationErrors).length > 0;
      if (hasErrors && validationResult) {
        // Re-check after validation
        const stillHasErrors = Object.keys(validationErrors).length > 0;
        if (stillHasErrors) return;
      }

      if (!facility) return;

      setIsSubmitting(true);
      const reservation: ChamberReservationCreate = {
        location_node_id: facility.location_id,
        portfolio_node_id: form.portfolio_node_id,
        reserved_start: form.reserved_start,
        reserved_end: form.reserved_end,
        setup_teardown_hours: form.setup_teardown_hours,
        power_profile_kw: form.power_profile_kw,
        test_operator_user_id: form.test_operator_user_id,
      };

      onSubmit(reservation);
    },
    [facility, form, validationErrors, validationResult, validateReservation, onSubmit],
  );

  // Handle close
  const handleClose = useCallback(() => {
    setValidationErrors({});
    setValidationResult(null);
    onClose();
  }, [onClose]);

  if (!open || !facility) return null;

  const hasAnyErrors = Object.keys(validationErrors).length > 0;
  const allGatesPass = validationResult?.valid === true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="dialog" aria-modal="true">
      <div
        className="w-full max-w-lg rounded-lg shadow-2xl bg-bg-ops-surface border border-border-ops-strong overflow-hidden"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-ops-subtle bg-bg-ops-overlay">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-sky-400" />
            <h2 className="text-sm font-semibold text-text-ops-primary">
              Reserve {facility.location_code}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded hover:bg-bg-ops-base text-text-ops-muted hover:text-text-ops-primary"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Facility info */}
        <div className="px-4 py-2 border-b border-border-ops-subtle/50 bg-bg-ops-base/50">
          <p className="text-xs text-text-ops-muted">{facility.location_name}</p>
          {facility.chamber_capabilities && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {facility.chamber_capabilities.temp_min_c != null && facility.chamber_capabilities.temp_max_c != null && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-900/30 text-red-400 border border-red-800/50">
                  <Thermometer className="w-3 h-3" />
                  {facility.chamber_capabilities.temp_min_c}°/{facility.chamber_capabilities.temp_max_c}°C
                </span>
              )}
              {facility.chamber_capabilities.rf_shielding_db != null && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-900/30 text-purple-400 border border-purple-800/50">
                  <Zap className="w-3 h-3" />
                  {facility.chamber_capabilities.rf_shielding_db} dB
                </span>
              )}
              {facility.chamber_capabilities.max_power_kw != null && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-900/30 text-amber-400 border border-amber-800/50">
                  <Zap className="w-3 h-3" />
                  {facility.chamber_capabilities.max_power_kw} kW
                </span>
              )}
            </div>
          )}
          {facility.calibration_expiry_date && (
            <p className="text-[10px] text-text-ops-muted mt-1">
              Calibration expires: {new Date(facility.calibration_expiry_date).toLocaleDateString('en-GB')}
            </p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-4 py-3 overflow-y-auto" style={{ maxHeight: '60vh' }}>
          <div className="space-y-3">
            {/* Testing Task */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-text-ops-primary mb-1">
                <ClipboardList className="w-3.5 h-3.5" />
                Testing Task
              </label>
              <input
                type="text"
                value={form.portfolio_node_id}
                onChange={(e) => updateField('portfolio_node_id', e.target.value)}
                className="w-full px-2 py-1.5 rounded text-xs font-mono bg-bg-ops-base border border-border-ops-subtle text-text-ops-primary focus:border-sky-500 focus:outline-none"
                placeholder="Portfolio Node UUID or code..."
                required
              />
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-text-ops-primary mb-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Start
                </label>
                <input
                  type="datetime-local"
                  value={form.reserved_start.slice(0, 16)}
                  onChange={(e) => updateField('reserved_start', e.target.value)}
                  className="w-full px-2 py-1.5 rounded text-xs font-mono bg-bg-ops-base border border-border-ops-subtle text-text-ops-primary focus:border-sky-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-text-ops-primary mb-1">End</label>
                <input
                  type="datetime-local"
                  value={form.reserved_end.slice(0, 16)}
                  onChange={(e) => updateField('reserved_end', e.target.value)}
                  className="w-full px-2 py-1.5 rounded text-xs font-mono bg-bg-ops-base border border-border-ops-subtle text-text-ops-primary focus:border-sky-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            {/* Temperature Bounds */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-text-ops-primary mb-1">
                  <Thermometer className="w-3.5 h-3.5" />
                  Min Temp (°C)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={form.temp_min_c ?? ''}
                  onChange={(e) => updateField('temp_min_c', e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full px-2 py-1.5 rounded text-xs font-mono bg-bg-ops-base border border-border-ops-subtle text-text-ops-primary focus:border-sky-500 focus:outline-none"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-text-ops-primary mb-1">Max Temp (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={form.temp_max_c ?? ''}
                  onChange={(e) => updateField('temp_max_c', e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full px-2 py-1.5 rounded text-xs font-mono bg-bg-ops-base border border-border-ops-subtle text-text-ops-primary focus:border-sky-500 focus:outline-none"
                  placeholder="Optional"
                />
              </div>
            </div>

            {/* Power Profile */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-text-ops-primary mb-1">
                <Zap className="w-3.5 h-3.5" />
                Power Draw (kW)
              </label>
              <input
                type="number"
                step="0.1"
                value={form.power_profile_kw ?? ''}
                onChange={(e) => updateField('power_profile_kw', e.target.value ? parseFloat(e.target.value) : null)}
                className="w-full px-2 py-1.5 rounded text-xs font-mono bg-bg-ops-base border border-border-ops-subtle text-text-ops-primary focus:border-sky-500 focus:outline-none"
                placeholder="Optional"
              />
              {facility.chamber_capabilities?.max_power_kw != null && (
                <p className="text-[10px] text-text-ops-muted mt-0.5">
                  Chamber limit: {facility.chamber_capabilities.max_power_kw} kW
                </p>
              )}
            </div>

            {/* Test Operator */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-text-ops-primary mb-1">
                <User className="w-3.5 h-3.5" />
                Test Operator
              </label>
              <input
                type="text"
                value={form.test_operator_user_id}
                onChange={(e) => updateField('test_operator_user_id', e.target.value)}
                className="w-full px-2 py-1.5 rounded text-xs font-mono bg-bg-ops-base border border-border-ops-subtle text-text-ops-primary focus:border-sky-500 focus:outline-none"
                placeholder="User UUID..."
                required
              />
            </div>

            {/* Setup/Teardown Hours */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-text-ops-primary mb-1">
                <Clock className="w-3.5 h-3.5" />
                Setup/Teardown (hours)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={form.setup_teardown_hours}
                onChange={(e) => updateField('setup_teardown_hours', parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1.5 rounded text-xs font-mono bg-bg-ops-base border border-border-ops-subtle text-text-ops-primary focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Validation Results */}
          {validationResult && (
            <div className="mt-4 p-3 rounded bg-bg-ops-base border border-border-ops-subtle">
              <h3 className="text-xs font-semibold text-text-ops-primary mb-2">Validation Gates</h3>
              <div className="space-y-1">
                <GateStatus
                  label="Capability Envelope"
                  passed={validationResult.capability_gate}
                  pending={isValidating}
                />
                <GateStatus
                  label="Calibration Window"
                  passed={validationResult.calibration_gate}
                  pending={isValidating}
                />
                <GateStatus
                  label="Buffer Availability"
                  passed={validationResult.buffer_gate}
                  pending={isValidating}
                />
              </div>

              {/* Error details */}
              <ValidationErrorList
                errors={validationErrors.capability}
                label="Capability Gate Failed"
                icon={<Thermometer className="w-3.5 h-3.5" />}
              />
              <ValidationErrorList
                errors={validationErrors.calibration}
                label="Calibration Gate Failed"
                icon={<AlertTriangle className="w-3.5 h-3.5" />}
              />
              <ValidationErrorList
                errors={validationErrors.buffer}
                label="Buffer Gate Failed"
                icon={<Clock className="w-3.5 h-3.5" />}
              />
              <ValidationErrorList
                errors={validationErrors.form}
                label="Form Errors"
              />
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border-ops-subtle bg-bg-ops-overlay">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 rounded text-xs font-medium text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-base transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={validateReservation}
              disabled={isValidating}
              className="px-3 py-1.5 rounded text-xs font-medium text-amber-400 hover:bg-amber-900/20 border border-amber-800/40 transition-colors disabled:opacity-50"
            >
              {isValidating ? 'Validating...' : 'Validate'}
            </button>
            <button
              type="submit"
              form="reservation-form"
              onClick={handleSubmit}
              disabled={isSubmitting || hasAnyErrors}
              className={clsx(
                'px-3 py-1.5 rounded text-xs font-medium transition-colors',
                isSubmitting || hasAnyErrors
                  ? 'bg-sky-900/30 text-sky-400/50 cursor-not-allowed'
                  : 'bg-sky-600 text-white hover:bg-sky-500',
              )}
            >
              {isSubmitting ? 'Submitting...' : 'Create Reservation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReservationModal;
