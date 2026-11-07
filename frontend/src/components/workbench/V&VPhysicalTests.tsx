/**
 * V&V Physical Test Cases Component
 *
 * Tab 5 of the Task Drill-Down Workbench: displays all linked Verification
 * and Validation (V&V) test cases for the selected task.
 *
 * This tab shows the physical completion gates that prevent a task from
 * reaching 100% completion. Each test case corresponds to a backend
 * VerificationTestCase record linked to the selected PortfolioNode.
 *
 * The table shows:
 * - Test identifier (e.g., 'ATP-AVIONICS-09')
 * - Test title / description
 * - Standard reference (e.g., 'DO-178C Level A', 'Def Stan 00-056')
 * - Mandatory flag (if true, the test must pass or be waived for 100% completion)
 * - Status badge: PASSED (green), FAILED (red), WAIVED (amber), NOT_RUN (grey)
 * - Target date for the test
 * - Verified by user and verification timestamp (if passed/waived)
 *
 * Completion Gate Logic:
 * If the selected node has requires_vv_signoff === true, the task cannot
 * reach 100% percent_complete unless all mandatory test cases are in either
 * PASSED or WAIVED status. This component highlights the blocking tests
 * that are preventing completion.
 *
 * Actions:
 * - Verify button: Marks a test case as PASSED (requires authorization).
 * - Waive button: Marks a test case as WAIVED with a reason (requires
 *   higher clearance or CAM approval).
 *
 * Corresponds to the backend VerificationTestCase model and the V&V gate
 * check endpoint GET /api/v1/cdrl/node/{id}/vv-gate-check.
 */

import React, { useMemo, useState } from 'react';
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Ban,
  Clock,
  Shield,
  FileText,
  Eye,
} from 'lucide-react';
import { clsx } from 'clsx';
import { WBSRow } from '../../types/wbs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * V&V test case status from the backend VerificationTestCase model.
 */
export type VVCStatus = 'NOT_RUN' | 'PASSED' | 'FAILED' | 'WAIVED';

/**
 * A single V&V test case linked to a portfolio node.
 */
export interface VerificationTestCase {
  id: string;
  test_identifier: string;
  title: string;
  standard_reference: string;
  is_mandatory: boolean;
  status: VVCStatus;
  target_date: string | null;
  verified_by_user?: string | null;
  verified_at?: string | null;
  waiver_reason?: string | null;
}

/**
 * Props for the V&V Physical Tests tab.
 */
export interface VVPhysicalTestsProps {
  /** The currently selected WBS row */
  selectedRow: WBSRow | null;
  /** List of V&V test cases linked to the selected node */
  testCases: VerificationTestCase[];
  /** Whether the node requires V&V sign-off for 100% completion */
  requiresVvSignoff?: boolean;
  /** Callback when a test case is verified as PASSED */
  onVerify?: (testCaseId: string) => void;
  /** Callback when a test case is waived */
  onWaive?: (testCaseId: string, reason: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Status configuration: icon, label, color, and background.
 */
const STATUS_CONFIG: Record<VVCStatus, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  PASSED: {
    icon: <CheckCircle2 size={14} />,
    label: 'Passed',
    color: 'text-emerald-400',
    bg: 'bg-emerald-900/20',
  },
  FAILED: {
    icon: <XCircle size={14} />,
    label: 'Failed',
    color: 'text-red-400',
    bg: 'bg-red-900/20',
  },
  WAIVED: {
    icon: <Ban size={14} />,
    label: 'Waived',
    color: 'text-amber-400',
    bg: 'bg-amber-900/20',
  },
  NOT_RUN: {
    icon: <Clock size={14} />,
    label: 'Not Run',
    color: 'text-text-ops-muted',
    bg: 'bg-bg-ops-overlay',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a date string for display.
 */
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

/**
 * Format a datetime string for display (includes time).
 */
function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

// ---------------------------------------------------------------------------
// Waive Reason Modal
// ---------------------------------------------------------------------------

const WaiveModal: React.FC<{
  testCase: VerificationTestCase;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}> = ({ testCase, onClose, onConfirm }) => {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (reason.trim().length < 10) return;
    onConfirm(reason.trim());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Waive test case"
    >
      <div
        className="bg-bg-ops-surface border border-border-ops-subtle rounded-lg shadow-2xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-text-ops-primary mb-2">
          Waive Test Case
        </h3>
        <p className="text-sm text-text-ops-muted mb-4">
          <span className="font-mono">{testCase.test_identifier}</span> — {testCase.title}
        </p>

        <label className="block text-sm text-text-ops-muted mb-1">
          Waiver Reason <span className="text-red-400">*</span>
        </label>
        <textarea
          className="w-full h-24 px-3 py-2 bg-bg-ops-overlay border border-border-ops-subtle rounded-md text-sm text-text-ops-primary placeholder:text-text-ops-muted/50 focus:outline-none focus:border-sky-500 resize-none"
          placeholder="Provide a detailed justification for waiving this test case..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        {reason.trim().length > 0 && reason.trim().length < 10 && (
          <p className="text-xs text-red-400 mt-1">Minimum 10 characters required.</p>
        )}

        <div className="flex items-center justify-end gap-3 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-ops-muted hover:text-text-ops-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={reason.trim().length < 10}
            className={clsx(
              'px-4 py-2 text-sm rounded-md font-medium transition-colors',
              reason.trim().length >= 10
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-bg-ops-overlay text-text-ops-muted cursor-not-allowed',
            )}
          >
            Confirm Waiver
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const VVPhysicalTests: React.FC<VVPhysicalTestsProps> = ({
  selectedRow,
  testCases,
  requiresVvSignoff = false,
  onVerify,
  onWaive,
}) => {
  const [waivingTest, setWaivingTest] = useState<VerificationTestCase | null>(null);

  // Compute completion gate summary
  const summary = useMemo(() => {
    const mandatory = testCases.filter((t) => t.is_mandatory);
    const passedOrWaived = mandatory.filter(
      (t) => t.status === 'PASSED' || t.status === 'WAIVED',
    );
    const failed = mandatory.filter((t) => t.status === 'FAILED');
    const notRun = mandatory.filter((t) => t.status === 'NOT_RUN');

    return {
      total: testCases.length,
      mandatoryCount: mandatory.length,
      passedCount: passedOrWaived.length,
      failedCount: failed.length,
      notRunCount: notRun.length,
      canComplete: requiresVvSignoff
        ? mandatory.length > 0 && passedOrWaived.length === mandatory.length && failed.length === 0
        : true,
    };
  }, [testCases, requiresVvSignoff]);

  const handleWaiveConfirm = (reason: string) => {
    if (waivingTest) {
      onWaive?.(waivingTest.id, reason);
      setWaivingTest(null);
    }
  };

  // Empty state
  if (!selectedRow) {
    return (
      <div className="flex items-center justify-center h-full text-text-ops-muted">
        <div className="text-center">
          <ClipboardCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Select a task to view V&V test cases</p>
        </div>
      </div>
    );
  }

  if (testCases.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-ops-muted">
        <div className="text-center">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm mb-1">No V&V test cases linked</p>
          <p className="text-xs">
            {selectedRow.code} — {selectedRow.is_masked ? '[RESTRICTED]' : selectedRow.name}
          </p>
          {requiresVvSignoff && (
            <p className="text-xs text-amber-400 mt-2">
              This task requires V&V sign-off but has no test cases defined.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Completion Gate Summary */}
      {requiresVvSignoff && (
        <div
          className={clsx(
            'px-4 py-3 border-b border-border-ops-subtle flex items-center gap-3',
            summary.canComplete
              ? 'bg-emerald-900/10 border-emerald-500/30'
              : 'bg-red-900/10 border-red-500/30',
          )}
        >
          {summary.canComplete ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          ) : (
            <Shield className="w-5 h-5 text-red-400 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-ops-primary">
              {summary.canComplete
                ? 'V&V Sign-off Complete — Task can reach 100%'
                : 'V&V Sign-off Required — Task is blocked from 100% completion'}
            </p>
            <p className="text-xs text-text-ops-muted">
              {summary.passedCount} of {summary.mandatoryCount} mandatory tests passed/waived
              {summary.failedCount > 0 && `, ${summary.failedCount} failed`}
              {summary.notRunCount > 0 && `, ${summary.notRunCount} not run`}
            </p>
          </div>
        </div>
      )}

      {/* Test Cases Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-bg-ops-surface border-b border-border-ops-subtle z-10">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-semibold text-text-ops-muted uppercase tracking-wider">
                Test ID
              </th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-text-ops-muted uppercase tracking-wider">
                Title
              </th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-text-ops-muted uppercase tracking-wider hidden md:table-cell">
                Standard
              </th>
              <th className="text-center px-4 py-2 text-xs font-semibold text-text-ops-muted uppercase tracking-wider">
                Mandatory
              </th>
              <th className="text-center px-4 py-2 text-xs font-semibold text-text-ops-muted uppercase tracking-wider">
                Status
              </th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-text-ops-muted uppercase tracking-wider hidden lg:table-cell">
                Target Date
              </th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-text-ops-muted uppercase tracking-wider hidden xl:table-cell">
                Verified
              </th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-text-ops-muted uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-ops-subtle/50">
            {testCases.map((tc) => {
              const statusConfig = STATUS_CONFIG[tc.status];
              const isBlocking = tc.is_mandatory && tc.status !== 'PASSED' && tc.status !== 'WAIVED';

              return (
                <tr
                  key={tc.id}
                  className={clsx(
                    'hover:bg-bg-ops-overlay/50 transition-colors',
                    isBlocking && 'bg-red-900/5',
                  )}
                >
                  {/* Test Identifier */}
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-text-ops-primary">
                      {tc.test_identifier}
                    </span>
                  </td>

                  {/* Title */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-text-ops-primary truncate max-w-[200px]">
                        {tc.title}
                      </span>
                      {isBlocking && (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                      )}
                    </div>
                  </td>

                  {/* Standard Reference */}
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-text-ops-muted font-mono">
                      {tc.standard_reference || '—'}
                    </span>
                  </td>

                  {/* Mandatory */}
                  <td className="px-4 py-3 text-center">
                    {tc.is_mandatory ? (
                      <Shield className="w-4 h-4 text-amber-400 mx-auto" />
                    ) : (
                      <span className="text-text-ops-muted text-xs">Optional</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 text-center">
                    <span
                      className={clsx(
                        'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
                        statusConfig.bg,
                        statusConfig.color,
                      )}
                    >
                      {statusConfig.icon}
                      {statusConfig.label}
                    </span>
                  </td>

                  {/* Target Date */}
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="font-mono text-xs text-text-ops-muted">
                      {formatDate(tc.target_date)}
                    </span>
                  </td>

                  {/* Verified By */}
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <div className="text-xs text-text-ops-muted">
                      {tc.verified_by_user ? (
                        <>
                          <span>{tc.verified_by_user}</span>
                          <br />
                          <span className="font-mono">{formatDateTime(tc.verified_at)}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {tc.status === 'NOT_RUN' && (
                        <>
                          <button
                            type="button"
                            onClick={() => onVerify?.(tc.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors"
                            title="Mark as Passed"
                          >
                            <CheckCircle2 size={12} />
                            Verify
                          </button>
                          <button
                            type="button"
                            onClick={() => setWaivingTest(tc)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 transition-colors"
                            title="Waive test case"
                          >
                            <Ban size={12} />
                            Waive
                          </button>
                        </>
                      )}
                      {tc.status === 'FAILED' && (
                        <button
                          type="button"
                          onClick={() => setWaivingTest(tc)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 transition-colors"
                          title="Waive failed test"
                        >
                          <Ban size={12} />
                          Waive
                        </button>
                      )}
                      {tc.status === 'PASSED' && (
                        <Eye
                          size={14}
                          className="text-emerald-400/50"
                        />
                      )}
                      {tc.status === 'WAIVED' && (
                        <span className="text-xs text-amber-400/50" title={tc.waiver_reason || 'Waived'}>
                          Waived
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer Summary */}
      <div className="px-4 py-2 border-t border-border-ops-subtle bg-bg-ops-surface text-xs text-text-ops-muted flex items-center gap-4">
        <span>
          Total: <strong className="text-text-ops-primary">{summary.total}</strong>
        </span>
        <span>
          Mandatory: <strong className="text-text-ops-primary">{summary.mandatoryCount}</strong>
        </span>
        <span>
          Passed: <strong className="text-emerald-400">{summary.passedCount}</strong>
        </span>
        {summary.failedCount > 0 && (
          <span>
            Failed: <strong className="text-red-400">{summary.failedCount}</strong>
          </span>
        )}
        {summary.notRunCount > 0 && (
          <span>
            Not Run: <strong className="text-text-ops-muted">{summary.notRunCount}</strong>
          </span>
        )}
      </div>

      {/* Waive Modal */}
      {waivingTest && (
        <WaiveModal
          testCase={waivingTest}
          onClose={() => setWaivingTest(null)}
          onConfirm={handleWaiveConfirm}
        />
      )}
    </div>
  );
};

export default VVPhysicalTests;
