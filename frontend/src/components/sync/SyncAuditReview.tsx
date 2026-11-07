/**
 * SyncAuditReview Component
 *
 * Displays the cryptographic import manifest and reconciliation results
 * after applying a Merkle sync delta pack.
 *
 * Features
 * --------
 * - Shows the SHA-256 signature of the imported delta pack.
 * - Displays counts of applied mutations, staged conflicts, and sandbox
 *   scenarios created.
 * - Lists any errors encountered during ingestion.
 * - Shows the ForensicAuditLog entry reference for the synchronization.
 * - Provides a visual success/failure status banner.
 *
 * @example
 * ```tsx
 * <SyncAuditReview
 *   reconcileResult={result}
 *   signature="abc123..."
 *   reconciledBy="user@example.com"
 * />
 * ```
 */

import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Shield,
  Hash,
  GitMerge,
  GitFork,
  FileText,
  Clock,
  User,
  AlertOctagon,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { MerkleReconcileResponse } from '../../types/merkle';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SyncAuditReviewProps {
  /** Reconciliation result from the backend */
  reconcileResult: MerkleReconcileResponse;
  /** SHA-256 signature of the delta pack */
  signature?: string;
  /** User who performed the reconciliation */
  reconciledBy?: string;
  /** Timestamp of the reconciliation */
  reconciledAt?: string;
}

// ---------------------------------------------------------------------------
// Status Badge Component
// ---------------------------------------------------------------------------

interface StatusBadgeProps {
  status: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const config =
    status === 'SUCCESS'
      ? {
          icon: <CheckCircle2 className="w-5 h-5 text-green-500" />,
          bg: 'bg-green-900/30 border-green-700',
          text: 'text-green-400',
          label: 'Synchronization Complete',
        }
      : status === 'PARTIAL'
        ? {
            icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
            bg: 'bg-amber-900/30 border-amber-700',
            text: 'text-amber-400',
            label: 'Partial Synchronization',
          }
        : status === 'CONFLICT'
          ? {
              icon: <AlertOctagon className="w-5 h-5 text-cls-secret" />,
              bg: 'bg-red-900/30 border-red-700',
              text: 'text-cls-secret',
              label: 'Conflicts Detected',
            }
          : {
              icon: <XCircle className="w-5 h-5 text-cls-secret" />,
              bg: 'bg-red-900/30 border-red-700',
              text: 'text-cls-secret',
              label: 'Synchronization Failed',
            };

  return (
    <div className={clsx('flex items-center gap-3 px-4 py-3 rounded-lg border', config.bg)}>
      {config.icon}
      <div>
        <p className={clsx('text-sm font-semibold', config.text)}>{config.label}</p>
        <p className="text-xs text-text-ops-muted">
          Status: {status}
        </p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Metric Card Component
// ---------------------------------------------------------------------------

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ icon, label, value, color = 'text-text-ops-primary' }) => (
  <div className="flex items-center gap-3 p-3 rounded-lg bg-bg-ops-overlay">
    {icon}
    <div>
      <p className="text-lg font-semibold font-mono" style={{ color }}>
        {value}
      </p>
      <p className="text-xs text-text-ops-muted">{label}</p>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const SyncAuditReview: React.FC<SyncAuditReviewProps> = ({
  reconcileResult,
  signature,
  reconciledBy,
  reconciledAt,
}) => {
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const hasErrors = reconcileResult.errors.length > 0;
  const hasSkipped = reconcileResult.skipped_entities.length > 0;
  const hasSandboxScenarios = reconcileResult.sandbox_scenario_ids.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Status banner */}
      <div className="p-4 border-b border-ops-subtle bg-bg-ops-surface">
        <StatusBadge status={reconcileResult.status} />
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3 p-4 border-b border-ops-subtle bg-bg-ops-surface">
        <MetricCard
          icon={<GitMerge className="w-5 h-5 text-green-500" />}
          label="Applied Mutations"
          value={reconcileResult.applied_mutations}
          color="rgb(74, 222, 128)"
        />
        <MetricCard
          icon={<GitFork className="w-5 h-5 text-amber-500" />}
          label="Staged Conflicts"
          value={reconcileResult.staged_conflicts}
          color="rgb(251, 191, 36)"
        />
        <MetricCard
          icon={<FileText className="w-5 h-5 text-blue-500" />}
          label="Sandbox Scenarios"
          value={reconcileResult.sandbox_scenario_ids.length}
          color="rgb(96, 165, 250)"
        />
        <MetricCard
          icon={<AlertTriangle className="w-5 h-5 text-cls-secret" />}
          label="Errors"
          value={reconcileResult.errors.length}
          color={hasErrors ? 'rgb(248, 113, 113)' : 'rgb(148, 163, 184)'}
        />
      </div>

      {/* Cryptographic manifest */}
      <div className="p-4 border-b border-ops-subtle bg-bg-ops-surface">
        <h4 className="text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Cryptographic Import Manifest
        </h4>

        <div className="space-y-2">
          {/* Signature */}
          {signature && (
            <div className="flex items-start gap-2">
              <Hash className="w-4 h-4 text-text-ops-muted mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-text-ops-muted">SHA-256 Signature</p>
                <p className="text-xs font-mono text-text-ops-primary break-all select-all">
                  {signature}
                </p>
              </div>
            </div>
          )}

          {/* Reconciled by */}
          {reconciledBy && (
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-text-ops-muted flex-shrink-0" />
              <div>
                <p className="text-xs text-text-ops-muted">Reconciled By</p>
                <p className="text-xs text-text-ops-primary">{reconciledBy}</p>
              </div>
            </div>
          )}

          {/* Timestamp */}
          {reconciledAt && (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-text-ops-muted flex-shrink-0" />
              <div>
                <p className="text-xs text-text-ops-muted">Reconciliation Timestamp</p>
                <p className="text-xs text-text-ops-primary">{formatDate(reconciledAt)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sandbox scenarios */}
      {hasSandboxScenarios && (
        <div className="p-4 border-b border-ops-subtle bg-bg-ops-surface">
          <h4 className="text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <GitFork className="w-4 h-4" />
            Sandbox Scenarios Created
          </h4>
          <div className="space-y-1">
            {reconcileResult.sandbox_scenario_ids.map((id, idx) => (
              <div
                key={id}
                className="flex items-center gap-2 px-2 py-1.5 rounded bg-amber-900/20 border border-amber-700/50"
              >
                <span className="text-xs text-amber-400 font-mono">
                  Scenario #{idx + 1}
                </span>
                <span className="text-xs font-mono text-text-ops-muted truncate select-all">
                  {id}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-text-ops-muted mt-2">
            These scenarios contain conflicting branches for manual review in the Sandbox workspace.
          </p>
        </div>
      )}

      {/* Skipped entities */}
      {hasSkipped && (
        <div className="p-4 border-b border-ops-subtle bg-bg-ops-surface">
          <h4 className="text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Skipped Entities ({reconcileResult.skipped_entities.length})
          </h4>
          <div className="max-h-32 overflow-auto space-y-1">
            {reconcileResult.skipped_entities.map((entity, idx) => (
              <div
                key={idx}
                className="px-2 py-1.5 rounded bg-bg-ops-overlay text-xs font-mono text-text-ops-muted"
              >
                {JSON.stringify(entity).slice(0, 120)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Errors */}
      {hasErrors && (
        <div className="p-4 border-b border-ops-subtle bg-bg-ops-surface">
          <h4 className="text-xs font-semibold text-cls-secret uppercase tracking-wider mb-3 flex items-center gap-2">
            <XCircle className="w-4 h-4" />
            Errors ({reconcileResult.errors.length})
          </h4>
          <div className="space-y-1">
            {reconcileResult.errors.map((error, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 px-2 py-1.5 rounded bg-red-900/20 border border-red-700/50"
              >
                <XCircle className="w-3.5 h-3.5 text-cls-secret mt-0.5 flex-shrink-0" />
                <p className="text-xs text-cls-secret">{error}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Forensic audit note */}
      <div className="p-4 bg-bg-ops-overlay">
        <div className="flex items-start gap-2">
          <Shield className="w-4 h-4 text-text-ops-muted mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-text-ops-muted">
              Forensic Audit Trail
            </p>
            <p className="text-xs text-text-ops-muted mt-1">
              This synchronization has been recorded in the{' '}
              <code className="font-mono text-text-ops-primary">ForensicAuditLog</code> with
              action type <code className="font-mono text-text-ops-primary">MERKLE_RECONCILE</code>.
              The SHA-256 tamper-evident hash chain has been updated.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SyncAuditReview;
