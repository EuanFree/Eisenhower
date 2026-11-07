/**
 * Schedule Health View
 *
 * The background clash audit triage center — the main landing page for
 * programme managers to review and resolve schedule conflicts detected
 * by the clash daemon.
 *
 * **Features:**
 *
 * 1. **Clash Triage Board** — Displays all active (unresolved) clash issues
 *    detected by the background sweep daemon (`/api/v1/schedule/clashes`).
 *    Delegated to the ClashTriageBoard component.
 *
 * 2. **Filterable Pill Bar** — Narrow clashes by severity (CRITICAL, MAJOR,
 *    ADVISORY) and category (RESOURCE_OVERALLOCATION, FACILITY_CONTRAVENTION,
 *    CREDENTIAL_LAPSE, SPATIAL_LOCATION_COLLISION, etc.).
 *
 * 3. **Conflict Cards** — Each card shows clear badges for conflicting entities
 *    (e.g., "RF Chamber Bay 2 double-booked by Project Falcon and Project Eagle
 *    on 14-Nov"), the conflict window, recommended action, and a "Run Leveling
 *    Proposal" button for overallocation clashes.
 *
 * 4. **Leveling Diff Modal** — Triggered by "Run Leveling Proposal", shows an
 *    interactive side-by-side comparison of current vs proposed dates before
 *    committing changes.
 *
 * 5. **Sweep Trigger** — Button to run a new portfolio clash sweep to refresh
 *    the detected issues.
 *
 * Data sources:
 * - GET /api/v1/schedule/clashes/ — Active clash list
 * - POST /api/v1/schedule/clashes/sweep/{project_id} — Trigger sweep
 * - POST /api/v1/schedule/clashes/leveling-proposal/{project_id} — Compute leveling
 * - POST /api/v1/schedule/clashes/resolve/{clash_id} — Mark clash resolved
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Loader2,
  Activity,
} from 'lucide-react';
import api from '../services/api';
import {
  ClashIssue,
  ClashListResponse,
  ClashFilters,
  ClashSeverity,
  LevelingProposalResponse,
} from '../types/clash';
import ClashTriageBoard from '../components/clash/ClashTriageBoard';
import LevelingDiffModal from '../components/clash/LevelingDiffModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduleHealthViewProps {
  /** Optional project ID to scope the sweep (if omitted, list-only mode) */
  projectId?: string;
}

// ---------------------------------------------------------------------------
// Severity sort order
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<ClashSeverity, number> = {
  CRITICAL: 0,
  MAJOR: 1,
  ADVISORY: 2,
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const ScheduleHealthView: React.FC<ScheduleHealthViewProps> = ({ projectId }) => {
  // Data state
  const [clashes, setClashes] = useState<ClashIssue[]>([]);
  const [bySeverity, setBySeverity] = useState<Record<string, number>>({});
  const [totalClashes, setTotalClashes] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSweeping, setIsSweeping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [filters, setFilters] = useState<ClashFilters>({
    severity: null,
    category: null,
  });

  // Leveling modal state
  const [levelingProposal, setLevelingProposal] = useState<LevelingProposalResponse | null>(null);
  const [isLevelingModalOpen, setIsLevelingModalOpen] = useState(false);
  const [isComputingLeveling, setIsComputingLeveling] = useState(false);

  // -----------------------------------------------------------------------
  // Fetch active clashes
  // -----------------------------------------------------------------------

  const fetchClashes = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const severityParam = filters.severity ? `?severity=${filters.severity}` : '';
      const response = await api.get<ClashListResponse>(
        `/api/v1/schedule/clashes/${severityParam}`,
      );

      if (response.data) {
        // Sort by severity (CRITICAL first), then by created_at (newest first)
        const sorted = [...response.data.clashes].sort((a, b) => {
          const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
          if (sevDiff !== 0) return sevDiff;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        setClashes(sorted);
        setBySeverity(response.data.by_severity || {});
        setTotalClashes(response.data.total_clashes);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to fetch clash issues');
    } finally {
      setIsLoading(false);
    }
  }, [filters.severity]);

  // Fetch on mount and when severity filter changes
  useEffect(() => {
    fetchClashes();
  }, [fetchClashes]);

  // -----------------------------------------------------------------------
  // Sweep handler
  // -----------------------------------------------------------------------

  const handleSweep = async () => {
    if (!projectId) {
      setError('No project ID provided for sweep');
      return;
    }

    setIsSweeping(true);
    setError(null);

    try {
      await api.post(`/api/v1/schedule/clashes/sweep/${projectId}`);
      // Refresh clashes after sweep
      await fetchClashes();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to run portfolio sweep');
    } finally {
      setIsSweeping(false);
    }
  };

  // -----------------------------------------------------------------------
  // Leveling proposal handler
  // -----------------------------------------------------------------------

  const handleRunLeveling = async (projectNodeId: string) => {
    setIsComputingLeveling(true);
    setError(null);

    try {
      const response = await api.post<LevelingProposalResponse>(
        `/api/v1/schedule/clashes/leveling-proposal/${projectNodeId}`,
      );

      if (response.data) {
        setLevelingProposal(response.data);
        setIsLevelingModalOpen(true);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to compute leveling proposal');
    } finally {
      setIsComputingLeveling(false);
    }
  };

  // -----------------------------------------------------------------------
  // Resolve clash handler
  // -----------------------------------------------------------------------

  const handleResolve = async (clashId: string) => {
    try {
      await api.post(`/api/v1/schedule/clashes/resolve/${clashId}`);
      // Remove from local list
      setClashes((prev) => prev.filter((c) => c.id !== clashId));
      setTotalClashes((prev) => Math.max(0, prev - 1));
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to resolve clash');
    }
  };

  // -----------------------------------------------------------------------
  // Leveling commit success
  // -----------------------------------------------------------------------

  const handleLevelingCommitSuccess = async () => {
    // Refresh clashes after leveling is applied
    await fetchClashes();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-surface">
        <div>
          <h1 className="text-xl font-bold text-text-ops-primary flex items-center gap-2">
            <Activity size={22} className="text-amber-400" />
            Schedule Health Triage
          </h1>
          <p className="text-xs text-text-ops-muted mt-1">
            Review and resolve schedule conflicts detected by the background audit daemon.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {projectId && (
            <button
              type="button"
              onClick={handleSweep}
              disabled={isSweeping}
              className="inline-flex items-center gap-2 rounded border border-border-ops-subtle bg-bg-ops-overlay px-3 py-2 text-sm font-medium text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong transition-colors disabled:opacity-50"
            >
              {isSweeping ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Run Sweep
            </button>
          )}

          <button
            type="button"
            onClick={fetchClashes}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded border border-border-ops-subtle bg-bg-ops-overlay px-3 py-2 text-sm font-medium text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            Refresh
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-3 mx-6 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            &times;
          </button>
        </div>
      )}

      {/* Clash Triage Board — delegated component */}
      <ClashTriageBoard
        clashes={clashes}
        bySeverity={bySeverity}
        totalClashes={totalClashes}
        isLoading={isLoading}
        filters={filters}
        onFilterChange={setFilters}
        onRunLeveling={handleRunLeveling}
        onResolve={handleResolve}
        projectId={projectId}
        isSweeping={isSweeping}
        onSweep={handleSweep}
        isComputingLeveling={isComputingLeveling}
      />

      {/* Leveling Diff Modal */}
      <LevelingDiffModal
        proposal={levelingProposal}
        isOpen={isLevelingModalOpen}
        onClose={() => setIsLevelingModalOpen(false)}
        onCommitSuccess={handleLevelingCommitSuccess}
      />
    </div>
  );
};

export default ScheduleHealthView;
