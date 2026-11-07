/**
 * ATP (Authority to Proceed) Activation Modal
 *
 * Dialog that allows the Project Manager to input the ATP anchor date
 * and select the governing working calendar. This converts all relative
 * T0 day offsets into concrete calendar dates.
 *
 * Features:
 * - Calendar date picker for the ATP anchor date
 * - Working calendar selector
 * - Live preview table showing conversion of relative milestones to
 *   concrete calendar dates
 * - Confirmation button that calls POST /api/v1/projects/{id}/activate-atp
 *
 * Usage:
 * ```tsx
 * const [showATPModal, setShowATPModal] = useState(false);
 *
 * return (
 *   <>
 *     <button onClick={() => setShowATPModal(true)}>Activate ATP</button>
 *     {showATPModal && (
 *       <ATPActivationModal
 *         projectId={projectId}
 *         milestones={milestones}
 *         onClose={() => setShowATPModal(false)}
 *       />
 *     )}
 *   </>
 * );
 * ```
 */

import React, { useState, useMemo } from 'react';
import { X, Calendar, CheckCircle, AlertTriangle } from 'lucide-react';
import api from '../../services/api';
import { addWorkingDays, formatRelativeDay } from '../../utils/dateFormatting';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A milestone for the preview table.
 */
export interface ATPMilestone {
  /** Node code (e.g., 'WP-2104') */
  code: string;
  /** Node name */
  name: string;
  /** Relative start day offset */
  relativeStartOffset: number;
  /** Relative finish day offset */
  relativeFinishOffset: number;
}

/**
 * Working calendar option.
 */
export interface WorkingCalendar {
  id: string;
  code: string;
  name: string;
}

/**
 * Props for the ATP Activation Modal.
 */
export interface ATPActivationModalProps {
  /** Project node ID */
  projectId: string;
  /** List of milestones for the preview table */
  milestones: ATPMilestone[];
  /** Available working calendars */
  calendars?: WorkingCalendar[];
  /** Called when the modal is closed */
  onClose: () => void;
  /** Called when ATP is successfully activated */
  onSuccess?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ATP Activation Modal component.
 */
const ATPActivationModal: React.FC<ATPActivationModalProps> = ({
  projectId,
  milestones,
  calendars = [],
  onClose,
  onSuccess,
}) => {
  const [anchorDate, setAnchorDate] = useState<string>('');
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>(
    calendars[0]?.id || '',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute preview dates
  const previewDates = useMemo(() => {
    if (!anchorDate) return [];

    return milestones.map((m) => ({
      ...m,
      absoluteStartDate: addWorkingDays(anchorDate, m.relativeStartOffset),
      absoluteFinishDate: addWorkingDays(anchorDate, m.relativeFinishOffset),
    }));
  }, [anchorDate, milestones]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!anchorDate) {
      setError('Please select an ATP anchor date.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.post(`/api/v1/projects/${projectId}/activate-atp`, {
        atp_anchor_date: anchorDate,
        calendar_id: selectedCalendarId || undefined,
      });

      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to activate ATP');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden bg-bg-ops-surface border border-border-ops-strong rounded-lg shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="atp-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
          <h2
            id="atp-modal-title"
            className="text-lg font-semibold text-text-ops-primary"
          >
            Authority to Proceed (ATP) Activation
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-text-ops-muted hover:text-text-ops-primary transition-colors"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4">
          <form onSubmit={handleSubmit}>
            {/* Description */}
            <div className="mb-6 p-4 bg-bg-ops-overlay rounded-lg border border-border-ops-subtle">
              <p className="text-sm text-text-ops-muted">
                Setting the ATP anchor date converts all relative T0 day offsets
                into concrete calendar dates. This will update the project
                schedule to use calendar-based planning.
              </p>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Anchor Date */}
              <div>
                <label
                  htmlFor="atp-anchor-date"
                  className="block text-sm font-medium text-text-ops-muted mb-2"
                >
                  ATP Anchor Date
                </label>
                <div className="relative">
                  <input
                    id="atp-anchor-date"
                    type="date"
                    value={anchorDate}
                    onChange={(e) => setAnchorDate(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-ops-base border border-border-ops-subtle rounded text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <Calendar
                    size={16}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-ops-muted pointer-events-none"
                  />
                </div>
              </div>

              {/* Working Calendar */}
              <div>
                <label
                  htmlFor="atp-calendar"
                  className="block text-sm font-medium text-text-ops-muted mb-2"
                >
                  Governing Working Calendar
                </label>
                <select
                  id="atp-calendar"
                  value={selectedCalendarId}
                  onChange={(e) => setSelectedCalendarId(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-ops-base border border-border-ops-subtle rounded text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {calendars.length === 0 && (
                    <option value="">Default (Mon-Fri)</option>
                  )}
                  {calendars.map((cal) => (
                    <option key={cal.id} value={cal.id}>
                      {cal.name} ({cal.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-red-900/20 border border-red-700 rounded-lg">
                <AlertTriangle size={16} className="text-rag-red flex-shrink-0" />
                <span className="text-sm text-rag-red">{error}</span>
              </div>
            )}

            {/* Live Preview Table */}
            {anchorDate && previewDates.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-text-ops-primary mb-3">
                  Live Preview: Relative → Calendar Conversion
                </h3>
                <div className="overflow-x-auto rounded-lg border border-border-ops-subtle">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-bg-ops-overlay">
                        <th className="px-4 py-2 text-left text-text-ops-muted font-medium">
                          Code
                        </th>
                        <th className="px-4 py-2 text-left text-text-ops-muted font-medium">
                          Name
                        </th>
                        <th className="px-4 py-2 text-left text-text-ops-muted font-medium">
                          Relative Start
                        </th>
                        <th className="px-4 py-2 text-left text-text-ops-muted font-medium">
                          Relative Finish
                        </th>
                        <th className="px-4 py-2 text-left text-text-ops-muted font-medium">
                          Calendar Start
                        </th>
                        <th className="px-4 py-2 text-left text-text-ops-muted font-medium">
                          Calendar Finish
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewDates.map((m, i) => (
                        <tr
                          key={i}
                          className="border-t border-border-ops-subtle hover:bg-bg-ops-overlay/50"
                        >
                          <td className="px-4 py-2 font-mono text-text-ops-primary">
                            {m.code}
                          </td>
                          <td className="px-4 py-2 text-text-ops-primary truncate max-w-[200px]">
                            {m.name}
                          </td>
                          <td className="px-4 py-2 font-mono text-text-ops-muted">
                            {formatRelativeDay(m.relativeStartOffset)}
                          </td>
                          <td className="px-4 py-2 font-mono text-text-ops-muted">
                            {formatRelativeDay(m.relativeFinishOffset)}
                          </td>
                          <td className="px-4 py-2 font-mono text-blue-400">
                            {m.absoluteStartDate || '—'}
                          </td>
                          <td className="px-4 py-2 font-mono text-blue-400">
                            {m.absoluteFinishDate || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* No anchor date selected */}
            {!anchorDate && milestones.length > 0 && (
              <div className="mb-6 p-4 bg-bg-ops-overlay rounded-lg border border-border-ops-subtle text-center">
                <p className="text-sm text-text-ops-muted">
                  Select an anchor date above to preview the calendar conversion.
                </p>
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-ops-subtle">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-ops-muted bg-bg-ops-overlay border border-border-ops-subtle rounded hover:bg-bg-ops-surface transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="atp-form"
            onClick={handleSubmit}
            disabled={!anchorDate || isSubmitting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Activating...
              </>
            ) : (
              <>
                <CheckCircle size={16} />
                Activate ATP
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ATPActivationModal;
