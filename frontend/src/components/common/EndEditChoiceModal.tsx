/**
 * End Edit Choice Modal
 *
 * Small popup that asks the user whether an end date change should
 * adjust the task duration or add a lag period.
 *
 * Usage
 * -----
 *
 * .. code-block:: tsx
 *
 *    const [choiceOpen, setChoiceOpen] = useState(false);
 *    const [endEditInfo, setEndEditInfo] = useState<{
 *      nodeId: string;
 *      oldEndDate: string;
 *      newEndDate: string;
 *      startDate: string;
 *    } | null>(null);
 *
 *    // When end date changes:
 *    setEndEditInfo({ nodeId, oldEndDate, newEndDate, startDate });
 *    setChoiceOpen(true);
 *
 *    // In render:
 *    {choiceOpen && endEditInfo && (
 *      <EndEditChoiceModal
 *        oldEndDate={endEditInfo.oldEndDate}
 *        newEndDate={endEditInfo.newEndDate}
 *        startDate={endEditInfo.startDate}
 *        onAdjustDuration={() => {
 *           // Update duration based on new dates
 *           setChoiceOpen(false);
 *        }}
 *        onAddLag={() => {
 *           // Keep duration, add lag
 *           setChoiceOpen(false);
 *        }}
 *        onCancel={() => {
 *           // Revert end date
 *           setChoiceOpen(false);
 *        }}
 *      />
 *    )}
 */

import React from 'react';
import { Clock, CalendarDays, X } from 'lucide-react';
import { computeDurationFromDates } from '../../utils/scheduleCalculator';

export interface EndEditChoiceModalProps {
  /** The original end date before the edit */
  oldEndDate: string;
  /** The new end date the user entered */
  newEndDate: string;
  /** The task's start date */
  startDate: string;
  /** Called when user chooses to adjust the duration */
  onAdjustDuration: () => void;
  /** Called when user chooses to add lag instead */
  onAddLag: () => void;
  /** Called when user cancels and wants to revert the change */
  onCancel: () => void;
}

const EndEditChoiceModal: React.FC<EndEditChoiceModalProps> = ({
  oldEndDate,
  newEndDate,
  startDate,
  onAdjustDuration,
  onAddLag,
  onCancel,
}) => {
  // Calculate the workday difference
  const oldDuration = computeDurationFromDates(startDate, oldEndDate);
  const newDuration = computeDurationFromDates(startDate, newEndDate);
  const diff = newDuration - oldDuration;
  const isExtension = diff >= 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-bg-ops-surface border border-border-ops-strong rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-ops-subtle">
          <h3 className="text-sm font-semibold text-text-ops-primary">
            End Date Changed
          </h3>
          <button
            onClick={onCancel}
            className="p-1 text-text-ops-muted hover:text-text-ops-primary transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="text-sm text-text-ops-muted mb-4">
            The end date was changed by{' '}
            <span className="font-semibold text-text-ops-primary">
              {isExtension ? '+' : ''}{diff} workday{Math.abs(diff) !== 1 ? 's' : ''}
            </span>.
            How should this be applied?
          </p>

          <div className="space-y-3">
            {/* Adjust Duration Option */}
            <button
              type="button"
              onClick={onAdjustDuration}
              className="w-full flex items-start gap-3 p-3 rounded-lg border border-border-ops-subtle bg-bg-ops-overlay hover:border-blue-500/60 hover:bg-blue-950/20 transition-all text-left"
            >
              <div className="p-2 rounded-md bg-blue-950/50 border border-blue-700/50 flex-shrink-0">
                <Clock size={18} className="text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-ops-primary">
                  Adjust Duration
                </p>
                <p className="text-xs text-text-ops-muted mt-0.5">
                  Change the duration from {oldDuration} to {newDuration} workdays.
                  Lag remains unchanged.
                </p>
              </div>
            </button>

            {/* Add Lag Option */}
            <button
              type="button"
              onClick={onAddLag}
              className="w-full flex items-start gap-3 p-3 rounded-lg border border-border-ops-subtle bg-bg-ops-overlay hover:border-amber-500/60 hover:bg-amber-950/20 transition-all text-left"
            >
              <div className="p-2 rounded-md bg-amber-950/50 border border-amber-700/50 flex-shrink-0">
                <CalendarDays size={18} className="text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-ops-primary">
                  Add Lag
                </p>
                <p className="text-xs text-text-ops-muted mt-0.5">
                  Keep the duration at {oldDuration} workdays and add{' '}
                  {Math.abs(diff)} workday{Math.abs(diff) !== 1 ? 's' : ''} of lag
                  (idle time) to the task.
                </p>
              </div>
            </button>
          </div>

          {/* Cancel button */}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-medium text-text-ops-muted hover:text-text-ops-primary border border-border-ops-subtle rounded-md hover:border-border-ops-strong transition-colors"
            >
              Revert Change
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EndEditChoiceModal;
