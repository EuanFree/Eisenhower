/**
 * CcbArbitrationWorkbenchView — Change Control Board Sign-Off Interface
 *
 * Provides a visual 3-way comparison workbench for resolving Merkle DAG
 * sync conflicts between air-gapped sites.
 *
 * Workflow
 * --------
 * 1. **Load Conflicts** — Fetch staged MerkleMergeStaging entries requiring
 *    CCB arbitration from the backend.
 * 2. **3-Way Comparison Grid** — Display each conflict in a 3-column grid:
 *    Column 1: Common Ancestor baseline state.
 *    Column 2: Local Site Proposed State (current active schedule).
 *    Column 3: Remote Site Ingest State (imported .merklepack).
 * 3. **Resolution Selection** — For each conflict, select one of:
 *    [Keep Local], [Accept Remote], or [Synthesize Envelope].
 * 4. **Dual-Officer Sign-Off** — Two distinct authorized officers (Lead
 *    Schedulers or Programme Directors) must sign before committing.
 * 5. **Commit Merge** — Apply resolved changes atomically and log the
 *    MERKLE_CCB_MERGE_COMMITTED block in the forensic audit ledger.
 *
 * @example
 * ```tsx
 * <CcbArbitrationWorkbenchView />
 * ```
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Shield,
  GitMerge,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  UserCheck,
  Lock,
  Eye,
  Save,
  XCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Users,
  Clock,
  KeyRound,
  EyeOff,
  Eye as EyeIcon,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConflictField {
  field_name: string;
  ancestor_value: unknown;
  local_value: unknown;
  remote_value: unknown;
}

interface MerkleMergeEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_code: string;
  conflict_type: string;
  ancestor_state: Record<string, unknown>;
  local_state: Record<string, unknown>;
  remote_state: Record<string, unknown>;
  conflicting_fields: ConflictField[];
  status: string;
  resolution: string | null;
  synthesized_state: Record<string, unknown> | null;
  officer_1_signature: string | null;
  officer_1_user_id: number | null;
  officer_2_signature: string | null;
  officer_2_user_id: number | null;
  created_at: string;
  resolved_at: string | null;
}

interface ReconciliationResult {
  ancestor_hash: string;
  auto_merged_count: number;
  conflicts_staged: number;
  staging_entries: MerkleMergeEntry[];
  divergent_paths: string[];
  errors: string[];
}

type ResolutionChoice = 'KEEP_LOCAL' | 'ACCEPT_REMOTE' | 'SYNTHESIZE';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CcbArbitrationWorkbenchViewProps {
  /** Optional reconciliation session ID */
  sessionId?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Three-way comparison cell showing a single field value.
 */
interface ComparisonCellProps {
  value: unknown;
  label: string;
  isConflict: boolean;
  column: 'ancestor' | 'local' | 'remote';
}

const ComparisonCell: React.FC<ComparisonCellProps> = ({
  value,
  label,
  isConflict,
  column,
}) => {
  const displayValue =
    value === null || value === undefined
      ? '—'
      : typeof value === 'object'
        ? JSON.stringify(value, null, 2)
        : String(value);

  return (
    <div
      className={clsx(
        'p-3 rounded-lg border text-sm font-mono whitespace-pre-wrap',
        isConflict
          ? column === 'ancestor'
            ? 'border-amber-200 bg-amber-50 text-amber-900'
            : column === 'local'
              ? 'border-blue-200 bg-blue-50 text-blue-900'
              : 'border-purple-200 bg-purple-50 text-purple-900'
          : 'border-gray-200 bg-gray-50 text-gray-700',
      )}
    >
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      {displayValue}
    </div>
  );
};

/**
 * Conflict detail row for a single conflicting field.
 */
interface ConflictFieldRowProps {
  field: ConflictField;
}

const ConflictFieldRow: React.FC<ConflictFieldRowProps> = ({ field }) => {
  const isConflict =
    field.local_value !== field.ancestor_value &&
    field.remote_value !== field.ancestor_value &&
    field.local_value !== field.remote_value;

  return (
    <div className="grid grid-cols-3 gap-3 py-2 border-b border-gray-100 last:border-b-0">
      <ComparisonCell
        value={field.ancestor_value}
        label={field.field_name}
        isConflict={isConflict}
        column="ancestor"
      />
      <ComparisonCell
        value={field.local_value}
        label={field.field_name}
        isConflict={isConflict}
        column="local"
      />
      <ComparisonCell
        value={field.remote_value}
        label={field.field_name}
        isConflict={isConflict}
        column="remote"
      />
    </div>
  );
};

/**
 * Resolution radio selector for a single conflict entry.
 */
interface ResolutionSelectorProps {
  entryId: string;
  currentResolution: string | null;
  onResolve: (entryId: string, resolution: ResolutionChoice, synthesizedState?: Record<string, unknown>) => void;
}

const ResolutionSelector: React.FC<ResolutionSelectorProps> = ({
  entryId,
  currentResolution,
  onResolve,
}) => {
  const [synthMode, setSynthMode] = useState(false);
  const [synthJson, setSynthJson] = useState('{}');

  const handleResolve = (resolution: ResolutionChoice) => {
    if (resolution === 'SYNTHESIZE') {
      setSynthMode(true);
      return;
    }
    onResolve(entryId, resolution);
  };

  const handleSynthesize = () => {
    try {
      const parsed = JSON.parse(synthJson);
      onResolve(entryId, 'SYNTHESIZE', parsed);
      setSynthMode(false);
    } catch {
      // Invalid JSON — ignore
    }
  };

  /**
   * Auto-synthesize: extend duration bounds to encompass both local and remote paths.
   * Takes the earlier start date and later finish date from both branches.
   */
  const handleAutoSynthesize = () => {
    // This triggers the backend to compute the envelope automatically
    onResolve(entryId, 'SYNTHESIZE');
    setSynthMode(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handleResolve('KEEP_LOCAL')}
          className={clsx(
            'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
            currentResolution === 'KEEP_LOCAL'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400',
          )}
        >
          Keep Local
        </button>
        <button
          type="button"
          onClick={() => handleResolve('ACCEPT_REMOTE')}
          className={clsx(
            'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
            currentResolution === 'ACCEPT_REMOTE'
              ? 'bg-purple-600 text-white border-purple-600'
              : 'bg-white text-gray-700 border-gray-300 hover:border-purple-400',
          )}
        >
          Accept Remote
        </button>
        <button
          type="button"
          onClick={() => handleResolve('SYNTHESIZE')}
          className={clsx(
            'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
            currentResolution === 'SYNTHESIZE'
              ? 'bg-amber-600 text-white border-amber-600'
              : 'bg-white text-gray-700 border-gray-300 hover:border-amber-400',
          )}
        >
          Synthesize Envelope
        </button>
      </div>

      {synthMode && (
        <div className="space-y-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <label className="text-sm font-medium text-amber-900">
            Synthesize Envelope
          </label>
          <p className="text-xs text-amber-700">
            Extend duration bounds to encompass both local and remote paths.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAutoSynthesize}
              className="px-3 py-1.5 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700 flex items-center gap-1.5"
            >
              <GitMerge className="w-3.5 h-3.5" />
              Auto-extend Bounds
            </button>
            <button
              type="button"
              onClick={() => setSynthMode(false)}
              className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
          <details className="mt-2">
            <summary className="text-xs text-amber-700 cursor-pointer hover:text-amber-900">
              Or provide custom synthesized state (JSON)
            </summary>
            <textarea
              className="w-full mt-2 p-2 border border-amber-300 rounded-md font-mono text-sm"
              rows={4}
              value={synthJson}
              onChange={(e) => setSynthJson(e.target.value)}
              placeholder='{"planned_start_date": "2026-01-15", ...}'
            />
            <button
              type="button"
              onClick={handleSynthesize}
              className="mt-2 px-3 py-1 bg-amber-600 text-white rounded-md text-sm hover:bg-amber-700"
            >
              Apply Custom Synthesis
            </button>
          </details>
        </div>
      )}
    </div>
  );
};

/**
 * Dual-officer sign-off panel.
 */
interface OfficerSignOffProps {
  entryId: string;
  officer1Signed: boolean;
  officer2Signed: boolean;
  onSign: (entryId: string, officerNumber: 1 | 2, pin: string) => void;
  onCommit: (entryId: string) => void;
  isReady: boolean;
}

/**
 * PKI PIN input modal for officer sign-off.
 */
interface PinModalProps {
  officerNumber: 1 | 2;
  onConfirm: (pin: string) => void;
  onCancel: () => void;
}

const PinModal: React.FC<PinModalProps> = ({ officerNumber, onConfirm, onCancel }) => {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }
    onConfirm(pin);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="w-5 h-5 text-amber-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            PKI PIN Verification
          </h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Officer {officerNumber === 1 ? '1 (Lead Scheduler)' : '2 (Programme Director)'} — enter your PKI PIN to sign the resolution package.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="relative mb-4">
            <input
              ref={inputRef}
              type={showPin ? 'text' : 'password'}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''));
                setError(null);
              }}
              maxLength={8}
              className={clsx(
                'w-full px-3 py-2 border rounded-lg text-center text-lg tracking-widest font-mono',
                error ? 'border-red-300 bg-red-50' : 'border-gray-300',
              )}
              placeholder="••••••"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPin ? <EyeOff className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
            </button>
          </div>
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Sign with PIN
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const OfficerSignOff: React.FC<OfficerSignOffProps> = ({
  entryId,
  officer1Signed,
  officer2Signed,
  onSign,
  onCommit,
  isReady,
}) => {
  const [pinOfficer, setPinOfficer] = useState<1 | 2 | null>(null);

  const handlePinConfirm = useCallback(
    async (pin: string) => {
      if (pinOfficer !== null) {
        await onSign(entryId, pinOfficer, pin);
      }
      setPinOfficer(null);
    },
    [entryId, pinOfficer, onSign],
  );

  return (
    <div className="space-y-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Users className="w-4 h-4" />
        Dual-Officer Quorum Sign-Off
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Officer 1 — Lead Scheduler */}
        <div
          className={clsx(
            'p-3 rounded-lg border flex flex-col gap-2',
            officer1Signed
              ? 'border-green-300 bg-green-50'
              : 'border-gray-200 bg-white',
          )}
        >
          <div className="flex items-center gap-2">
            {officer1Signed ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <Lock className="w-5 h-5 text-gray-400" />
            )}
            <div className="flex-1">
              <div className="text-sm font-medium">Officer 1</div>
              <div className="text-xs text-gray-500">Lead Scheduler</div>
            </div>
          </div>
          <div className="text-xs text-gray-500">
            {officer1Signed ? '✓ Signed with PKI PIN' : 'Awaiting signature'}
          </div>
          {!officer1Signed && (
            <button
              type="button"
              onClick={() => setPinOfficer(1)}
              className="w-full px-2 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 flex items-center justify-center gap-1"
            >
              <KeyRound className="w-3 h-3" />
              Sign with PIN
            </button>
          )}
        </div>

        {/* Officer 2 — Programme Director */}
        <div
          className={clsx(
            'p-3 rounded-lg border flex flex-col gap-2',
            officer2Signed
              ? 'border-green-300 bg-green-50'
              : 'border-gray-200 bg-white',
          )}
        >
          <div className="flex items-center gap-2">
            {officer2Signed ? (
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            ) : (
              <Lock className="w-5 h-5 text-gray-400" />
            )}
            <div className="flex-1">
              <div className="text-sm font-medium">Officer 2</div>
              <div className="text-xs text-gray-500">Programme Director</div>
            </div>
          </div>
          <div className="text-xs text-gray-500">
            {officer2Signed ? '✓ Counter-signed with PKI PIN' : 'Awaiting counter-signature'}
          </div>
          {!officer2Signed && (
            <button
              type="button"
              onClick={() => setPinOfficer(2)}
              className="w-full px-2 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 flex items-center justify-center gap-1"
            >
              <KeyRound className="w-3 h-3" />
              Counter-sign with PIN
            </button>
          )}
        </div>
      </div>

      {isReady && (
        <button
          type="button"
          onClick={() => onCommit(entryId)}
          className="w-full px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 flex items-center justify-center gap-2"
        >
          <GitMerge className="w-4 h-4" />
          Commit Merge Resolution
        </button>
      )}

      {/* PIN Modal */}
      {pinOfficer !== null && (
        <PinModal
          officerNumber={pinOfficer}
          onConfirm={handlePinConfirm}
          onCancel={() => setPinOfficer(null)}
        />
      )}
    </div>
  );
};

/**
 * Single conflict card in the workbench.
 */
interface ConflictCardProps {
  entry: MerkleMergeEntry;
  onResolve: (entryId: string, resolution: ResolutionChoice, synthesizedState?: Record<string, unknown>) => void;
  onSign: (entryId: string, officerNumber: 1 | 2, pin: string) => void;
  onCommit: (entryId: string) => void;
}

const ConflictCard: React.FC<ConflictCardProps> = ({
  entry,
  onResolve,
  onSign,
  onCommit,
}) => {
  const [expanded, setExpanded] = useState(false);

  const isResolved = entry.status.startsWith('RESOLVED_');
  const isCommitted = entry.status === 'MERGE_COMMITTED';
  const isReadyForCommit =
    Boolean(isResolved && entry.officer_1_signature && entry.officer_2_signature);

  const conflictTypeLabel = {
    CONCURRENT_EDIT: 'Concurrent Edit',
    PARENTAGE_CONFLICT: 'Parentage Conflict',
    CONTRADICTORY_LINK: 'Contradictory Link',
    DATE_CONFLICT: 'Date Conflict',
  }[entry.conflict_type] || entry.conflict_type;

  return (
    <div
      className={clsx(
        'border rounded-xl overflow-hidden transition-shadow',
        isCommitted
          ? 'border-green-300 bg-green-50/30'
          : isReadyForCommit
            ? 'border-amber-300 bg-amber-50/30 shadow-amber-100'
            : 'border-gray-200 bg-white hover:shadow-md',
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          {isCommitted ? (
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          ) : isReadyForCommit ? (
            <UserCheck className="w-5 h-5 text-amber-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          )}
          <div>
            <div className="font-medium text-gray-900">{entry.entity_code}</div>
            <div className="text-xs text-gray-500">
              {entry.entity_type} · {conflictTypeLabel}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isCommitted && (
            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
              Committed
            </span>
          )}
          {isResolved && !isCommitted && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
              Resolved
            </span>
          )}
          {!isResolved && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
              Needs Arbitration
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="p-4 border-t border-gray-100 space-y-6">
          {/* 3-Way Comparison Grid */}
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
              <Eye className="w-4 h-4" />
              3-Way Comparison
            </div>
            <div className="grid grid-cols-3 gap-1 mb-2 text-xs font-medium text-gray-500 text-center">
              <div>Common Ancestor</div>
              <div>Local Site</div>
              <div>Remote Site</div>
            </div>
            {entry.conflicting_fields.map((field, idx) => (
              <ConflictFieldRow key={idx} field={field} />
            ))}
          </div>

          {/* Resolution Selector */}
          {!isCommitted && (
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                <Save className="w-4 h-4" />
                Resolution
              </div>
              <ResolutionSelector
                entryId={entry.id}
                currentResolution={entry.resolution}
                onResolve={onResolve}
              />
            </div>
          )}

          {/* Officer Sign-Off */}
          {isResolved && !isCommitted && (
            <OfficerSignOff
              entryId={entry.id}
              officer1Signed={!!entry.officer_1_signature}
              officer2Signed={!!entry.officer_2_signature}
              onSign={onSign}
              onCommit={onCommit}
              isReady={isReadyForCommit}
            />
          )}

          {/* Metadata */}
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Created: {new Date(entry.created_at).toLocaleString()}
            </span>
            {entry.resolved_at && (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Resolved: {new Date(entry.resolved_at).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main View
// ---------------------------------------------------------------------------

const CcbArbitrationWorkbenchView: React.FC<CcbArbitrationWorkbenchViewProps> = ({
  sessionId,
}) => {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<MerkleMergeEntry[]>([]);
  const [reconciliationSummary, setReconciliationSummary] = useState<
    Pick<ReconciliationResult, 'ancestor_hash' | 'auto_merged_count' | 'conflicts_staged'> | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState<string | null>(null);

  // Load staged conflicts
  const loadConflicts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = sessionId ? { session_id: sessionId } : {};
      const response = await api.get<ReconciliationResult>(
        '/api/v1/merkle-sync/ccb-staging',
        { params },
      );
      setEntries(response.data.staging_entries || []);
      setReconciliationSummary({
        ancestor_hash: response.data.ancestor_hash,
        auto_merged_count: response.data.auto_merged_count,
        conflicts_staged: response.data.conflicts_staged,
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load conflicts');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadConflicts();
  }, [loadConflicts]);

  // Resolve a conflict
  const handleResolve = useCallback(
    async (
      entryId: string,
      resolution: ResolutionChoice,
      synthesizedState?: Record<string, unknown>,
    ) => {
      try {
        await api.post(`/api/v1/merkle-sync/ccb-resolve/${entryId}`, {
          resolution,
          synthesized_state: synthesizedState,
        });
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entryId
              ? {
                  ...e,
                  resolution,
                  status:
                    resolution === 'KEEP_LOCAL'
                      ? 'RESOLVED_KEEP_LOCAL'
                      : resolution === 'ACCEPT_REMOTE'
                        ? 'RESOLVED_ACCEPT_REMOTE'
                        : 'RESOLVED_SYNTHESIZED',
                  synthesized_state: synthesizedState || e.synthesized_state,
                }
              : e,
          ),
        );
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to resolve conflict');
      }
    },
    [],
  );

  // Stage officer signature with PKI PIN
  const handleSign = useCallback(
    async (entryId: string, officerNumber: 1 | 2, pin: string) => {
      try {
        const response = await api.post(
          `/api/v1/merkle-sync/ccb-sign/${entryId}`,
          {
            officer_number: officerNumber,
            pki_pin: pin,
          },
        );
        const updated = response.data as MerkleMergeEntry;
        setEntries((prev) =>
          prev.map((e) => (e.id === entryId ? updated : e)),
        );
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to sign');
      }
    },
    [],
  );

  // Commit a resolved entry
  const handleCommit = useCallback(
    async (entryId: string) => {
      setCommitting(entryId);
      try {
        await api.post(`/api/v1/merkle-sync/ccb-commit`, {
          entry_ids: [entryId],
        });
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entryId
              ? {
                  ...e,
                  status: 'MERGE_COMMITTED',
                  resolved_at: new Date().toISOString(),
                }
              : e,
          ),
        );
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to commit merge');
      } finally {
        setCommitting(null);
      }
    },
    [],
  );

  // Summary counts
  const pendingCount = entries.filter(
    (e) => e.status === 'REQUIRES_CCB_ARBITRATION',
  ).length;
  const resolvedCount = entries.filter((e) =>
    e.status.startsWith('RESOLVED_'),
  ).length;
  const committedCount = entries.filter(
    (e) => e.status === 'MERGE_COMMITTED',
  ).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-amber-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                CCB Arbitration Workbench
              </h1>
              <p className="text-sm text-gray-500">
                Multi-site Merkle DAG conflict resolution with dual-officer
                quorum sign-off
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadConflicts}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      {reconciliationSummary && (
        <div className="px-6 py-3 bg-white border-b border-gray-100">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-400" />
              <span className="text-gray-500">Ancestor:</span>
              <span className="font-mono text-gray-700 truncate max-w-[120px]">
                {reconciliationSummary.ancestor_hash.slice(0, 12)}...
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-gray-500">Auto-merged:</span>
              <span className="font-medium text-green-700">
                {reconciliationSummary.auto_merged_count}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-gray-500">Conflicts:</span>
              <span className="font-medium text-amber-700">
                {reconciliationSummary.conflicts_staged}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-4">
              <span className="text-amber-600 font-medium">
                {pendingCount} pending
              </span>
              <span className="text-blue-600 font-medium">
                {resolvedCount} resolved
              </span>
              <span className="text-green-600 font-medium">
                {committedCount} committed
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-6 max-w-6xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            <span className="ml-3 text-gray-500">Loading conflicts...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-20">
            <XCircle className="w-8 h-8 text-red-400" />
            <span className="ml-3 text-red-600">{error}</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <CheckCircle2 className="w-12 h-12 mb-3" />
            <div className="text-lg font-medium">No Conflicts</div>
            <div className="text-sm">
              All Merkle sync conflicts have been resolved.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <ConflictCard
                key={entry.id}
                entry={entry}
                onResolve={handleResolve}
                onSign={handleSign}
                onCommit={handleCommit}
              />
            ))}
          </div>
        )}

        {/* Committing indicator */}
        {committing && (
          <div className="fixed bottom-4 right-4 px-4 py-2 bg-green-600 text-white rounded-lg shadow-lg flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Committing merge...
          </div>
        )}
      </div>
    </div>
  );
};

export default CcbArbitrationWorkbenchView;
