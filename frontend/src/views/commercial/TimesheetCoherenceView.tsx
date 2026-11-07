/**
 * Timesheet Coherence Inspection Workbench
 *
 * Commercial view that inspects weekly timesheet batches staged for Oracle Projects
 * export, flagging labor-progress divergence and enforcing CAM justification before
 * transmission.
 *
 * Route: /commercial/timesheet-coherence
 *
 * Layout
 * ------
 * 1. Header with title, refresh button, and [Transmit to Oracle Projects] export button
 * 2. Filter bar — divergence status filter, export status filter, work package search
 * 3. Tabular workbench grid with columns:
 *    - Batch ID, Work Package, Booked Labor Hours, Labor Burn %, Physical % Complete,
 *      ACWP, PV, Divergence Status, Export Status, Actions
 * 4. Amber-highlighted rows where:
 *    - Labor Burn > 15% with 0% physical progress, OR
 *    - ACWP exceeds PV by ≥ 20% without earned value delivery
 * 5. Export interlock — [Transmit to Oracle Projects] is disabled when any selected
 *    batch contains unresolved HELD_FOR_CAM_JUSTIFICATION records
 * 6. CamVarianceJustificationModal — triggered by [Submit Variance Justification]
 *    on flagged rows
 *
 * Data Sources
 * ------------
 * - GET /api/v1/timesheets/batches → Weekly timesheet batch list
 * - POST /api/v1/timesheets/{id}/justify → Submit CAM variance justification
 * - POST /api/v1/timesheets/export/oracle → Transmit staged batches to Oracle Projects
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  RefreshCw,
  Send,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Clock,
  XCircle,
  Filter,
  Search,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../services/api';
import CamVarianceJustificationModal from '../../components/commercial/CamVarianceJustificationModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DivergenceStatus = 'NORMAL' | 'LABOR_PROGRESS_DIVERGENCE';
export type ExportStatus = 'STAGED' | 'HELD_FOR_CAM_JUSTIFICATION' | 'CLEARED';

export interface TimesheetBatch {
  id: string;
  batch_id: string;
  work_package: string;
  wp_code: string;
  booked_labor_hours: number;
  labor_burn_pct: number;
  physical_pct_complete: number;
  acwp: number;          // Actual Cost of Work Performed
  pv: number;            // Planned Value
  divergence_status: DivergenceStatus;
  export_status: ExportStatus;
  week_start: string;    // ISO date
  week_end: string;      // ISO date
  cam_justification?: string;  // Attached narrative if cleared
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a row should be highlighted in amber.
 * Conditions:
 *   - Labor Burn > 15% with 0% physical progress
 *   - ACWP exceeds PV by ≥ 20% without earned value delivery
 */
function isDivergentRow(batch: TimesheetBatch): boolean {
  const laborBurnWithNoProgress =
    batch.labor_burn_pct > 15 && batch.physical_pct_complete === 0;

  const acwpExceedsPv =
    batch.pv > 0 && (batch.acwp / batch.pv - 1) >= 0.2;

  return laborBurnWithNoProgress || acwpExceedsPv;
}

/**
 * Format currency value for display.
 */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format percentage for display.
 */
function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * Format date for display.
 */
function formatDate(iso: string): string {
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
// Status Badge Components
// ---------------------------------------------------------------------------

const DivergenceBadge: React.FC<{ status: DivergenceStatus }> = ({ status }) => {
  if (status === 'NORMAL') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400">
        <CheckCircle2 size={12} />
        Normal
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-400">
      <AlertTriangle size={12} />
      Divergence
    </span>
  );
};

const ExportBadge: React.FC<{ status: ExportStatus }> = ({ status }) => {
  switch (status) {
    case 'STAGED':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-sky-500/10 text-sky-400">
          <Clock size={12} />
          Staged
        </span>
      );
    case 'HELD_FOR_CAM_JUSTIFICATION':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-500/10 text-red-400">
          <ShieldAlert size={12} />
          Held
        </span>
      );
    case 'CLEARED':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400">
          <CheckCircle2 size={12} />
          Cleared
        </span>
      );
  }
};

// ---------------------------------------------------------------------------
// Main View Component
// ---------------------------------------------------------------------------

const TimesheetCoherenceView: React.FC = () => {
  const [batches, setBatches] = useState<TimesheetBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filters
  const [divergenceFilter, setDivergenceFilter] = useState<DivergenceStatus | 'ALL'>('ALL');
  const [exportFilter, setExportFilter] = useState<ExportStatus | 'ALL'>('ALL');
  const [wpSearch, setWpSearch] = useState('');

  // Justification modal
  const [justificationBatch, setJustificationBatch] = useState<TimesheetBatch | null>(null);
  const [justificationModalOpen, setJustificationModalOpen] = useState(false);

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Data Fetch
  // -----------------------------------------------------------------------

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.get<TimesheetBatch[]>('/timesheets/batches');
      setBatches((resp as any)?.data ?? resp ?? []);
    } catch (e) {
      console.error('Failed to fetch timesheet batches:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  // -----------------------------------------------------------------------
  // Filtered Batches
  // -----------------------------------------------------------------------

  const filteredBatches = useMemo(() => {
    return batches.filter((batch) => {
      if (divergenceFilter !== 'ALL' && batch.divergence_status !== divergenceFilter) {
        return false;
      }
      if (exportFilter !== 'ALL' && batch.export_status !== exportFilter) {
        return false;
      }
      if (wpSearch) {
        const search = wpSearch.toLowerCase();
        const matchesWp =
          batch.work_package.toLowerCase().includes(search) ||
          batch.wp_code.toLowerCase().includes(search) ||
          batch.batch_id.toLowerCase().includes(search);
        if (!matchesWp) return false;
      }
      return true;
    });
  }, [batches, divergenceFilter, exportFilter, wpSearch]);

  // -----------------------------------------------------------------------
  // Selection & Export Interlock
  // -----------------------------------------------------------------------

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredBatches.map((b) => b.id)));
  }, [filteredBatches]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  /**
   * Export interlock: disabled if any selected batch has HELD_FOR_CAM_JUSTIFICATION.
   */
  const hasHeldBatches = useMemo(() => {
    return filteredBatches.some(
      (b) => selectedIds.has(b.id) && b.export_status === 'HELD_FOR_CAM_JUSTIFICATION',
    );
  }, [filteredBatches, selectedIds]);

  const selectedBatchCount = selectedIds.size;

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const handleJustificationSubmit = useCallback((batchId: string) => {
    setJustificationModalOpen(false);
    setJustificationBatch(null);
    // Refresh batches to reflect cleared status
    fetchBatches();
  }, [fetchBatches]);

  const handleOpenJustification = useCallback((batch: TimesheetBatch) => {
    setJustificationBatch(batch);
    setJustificationModalOpen(true);
  }, []);

  const handleTransmit = useCallback(async () => {
    if (hasHeldBatches || selectedBatchCount === 0) return;

    setExporting(true);
    setExportMessage(null);
    try {
      await api.post('/timesheets/export/oracle', {
        batch_ids: Array.from(selectedIds),
      });
      setExportMessage(`Successfully transmitted ${selectedBatchCount} batch(es) to Oracle Projects.`);
      clearSelection();
      fetchBatches();
    } catch (e) {
      console.error('Export to Oracle Projects failed:', e);
      setExportMessage('Export failed. Check server logs for details.');
    } finally {
      setExporting(false);
    }
  }, [hasHeldBatches, selectedBatchCount, selectedIds, clearSelection, fetchBatches]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-text-ops-muted">
        <div className="flex items-center gap-3">
          <RefreshCw size={16} className="animate-spin" />
          <span className="text-sm">Loading timesheet batches...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="w-6 h-6 text-sky-400" />
          <div>
            <h1 className="text-lg font-semibold text-text-ops-primary">
              Timesheet Coherence Workbench
            </h1>
            <p className="text-sm text-text-ops-muted">
              Time-to-progress inspection for Oracle Projects export
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Export interlock button */}
          <button
            onClick={handleTransmit}
            disabled={hasHeldBatches || selectedBatchCount === 0 || exporting}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-bg-ops-surface',
              hasHeldBatches || selectedBatchCount === 0
                ? 'bg-bg-ops-overlay text-text-ops-muted cursor-not-allowed'
                : exporting
                ? 'bg-sky-600/50 text-white cursor-wait'
                : 'bg-sky-600 text-white hover:bg-sky-500',
            )}
            title={
              hasHeldBatches
                ? 'Cannot transmit: selected batches contain unresolved CAM justification holds'
                : selectedBatchCount === 0
                ? 'Select batches to transmit'
                : undefined
            }
          >
            {exporting ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            {exporting ? 'Transmitting...' : 'Transmit to Oracle Projects'}
            {selectedBatchCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-white/20">
                {selectedBatchCount}
              </span>
            )}
          </button>

          <button
            onClick={fetchBatches}
            className="p-2 rounded-lg hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Export message */}
      {exportMessage && (
        <div
          className={clsx(
            'mx-6 mt-3 px-4 py-2 rounded-lg text-sm flex items-center gap-2',
            exportMessage.startsWith('Successfully')
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20',
          )}
        >
          {exportMessage.startsWith('Successfully') ? (
            <CheckCircle2 size={14} />
          ) : (
            <XCircle size={14} />
          )}
          {exportMessage}
          <button
            onClick={() => setExportMessage(null)}
            className="ml-auto p-0.5 hover:bg-bg-ops-overlay rounded"
          >
            <XCircle size={12} />
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border-ops-subtle bg-bg-ops-overlay/50">
        <Filter size={14} className="text-text-ops-muted flex-shrink-0" />

        {/* Divergence filter */}
        <select
          value={divergenceFilter}
          onChange={(e) => setDivergenceFilter(e.target.value as DivergenceStatus | 'ALL')}
          className="px-3 py-1.5 text-sm rounded-lg bg-bg-ops-surface border border-border-ops-subtle text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-sky-400"
        >
          <option value="ALL">All Divergence</option>
          <option value="NORMAL">Normal</option>
          <option value="LABOR_PROGRESS_DIVERGENCE">Divergence</option>
        </select>

        {/* Export status filter */}
        <select
          value={exportFilter}
          onChange={(e) => setExportFilter(e.target.value as ExportStatus | 'ALL')}
          className="px-3 py-1.5 text-sm rounded-lg bg-bg-ops-surface border border-border-ops-subtle text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-sky-400"
        >
          <option value="ALL">All Export Status</option>
          <option value="STAGED">Staged</option>
          <option value="HELD_FOR_CAM_JUSTIFICATION">Held</option>
          <option value="CLEARED">Cleared</option>
        </select>

        {/* Work package search */}
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-ops-muted" />
          <input
            type="text"
            value={wpSearch}
            onChange={(e) => setWpSearch(e.target.value)}
            placeholder="Search by Batch ID, WP Code, or Work Package..."
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg bg-bg-ops-surface border border-border-ops-subtle text-text-ops-primary placeholder-text-ops-muted focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </div>

        {/* Selection controls */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={selectAll}
            className="text-xs text-text-ops-muted hover:text-text-ops-primary transition-colors"
          >
            Select All
          </button>
          <span className="text-text-ops-muted">/</span>
          <button
            onClick={clearSelection}
            className="text-xs text-text-ops-muted hover:text-text-ops-primary transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Export interlock warning */}
      {hasHeldBatches && (
        <div className="mx-6 mt-3 px-4 py-2 rounded-lg text-sm flex items-center gap-2 bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <ShieldAlert size={14} />
          <span>
            <strong>Export blocked:</strong> {selectedBatchCount} selected batch(es) contain unresolved CAM justification holds.
            Submit variance justification before transmitting.
          </span>
        </div>
      )}

      {/* Workbench Grid */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-bg-ops-overlay/90 backdrop-blur-sm">
            <tr className="border-b border-border-ops-subtle text-text-ops-muted">
              <th className="text-left py-3 px-4 font-medium w-10">
                <input
                  type="checkbox"
                  checked={filteredBatches.length > 0 && selectedIds.size === filteredBatches.length}
                  onChange={(e) => {
                    if (e.target.checked) selectAll();
                    else clearSelection();
                  }}
                  className="rounded border-border-ops-subtle bg-bg-ops-surface text-sky-500 focus:ring-sky-400"
                />
              </th>
              <th className="text-left py-3 px-4 font-medium">Batch ID</th>
              <th className="text-left py-3 px-4 font-medium">Work Package</th>
              <th className="text-left py-3 px-4 font-medium">Week</th>
              <th className="text-right py-3 px-4 font-medium">Booked Hours</th>
              <th className="text-right py-3 px-4 font-medium">Labor Burn %</th>
              <th className="text-right py-3 px-4 font-medium">Physical %</th>
              <th className="text-right py-3 px-4 font-medium">ACWP</th>
              <th className="text-right py-3 px-4 font-medium">PV</th>
              <th className="text-left py-3 px-4 font-medium">Divergence</th>
              <th className="text-left py-3 px-4 font-medium">Export</th>
              <th className="text-left py-3 px-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredBatches.map((batch) => {
              const divergent = isDivergentRow(batch);
              const isSelected = selectedIds.has(batch.id);
              const isHeld = batch.export_status === 'HELD_FOR_CAM_JUSTIFICATION';

              return (
                <tr
                  key={batch.id}
                  className={clsx(
                    'border-b border-border-ops-subtle transition-colors',
                    isSelected && 'bg-sky-500/5',
                    divergent && !isSelected && 'bg-amber-500/5',
                    isHeld && 'bg-red-500/5',
                    !divergent && !isHeld && !isSelected && 'hover:bg-bg-ops-overlay',
                  )}
                >
                  <td className="py-3 px-4">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(batch.id)}
                      className="rounded border-border-ops-subtle bg-bg-ops-surface text-sky-500 focus:ring-sky-400"
                    />
                  </td>
                  <td className="py-3 px-4 font-mono text-text-ops-primary text-xs">
                    {batch.batch_id}
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-text-ops-primary text-sm">{batch.work_package}</div>
                    <div className="text-text-ops-muted text-xs font-mono">{batch.wp_code}</div>
                  </td>
                  <td className="py-3 px-4 text-text-ops-muted text-xs">
                    {formatDate(batch.week_start)} – {formatDate(batch.week_end)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-text-ops-primary">
                    {batch.booked_labor_hours.toFixed(1)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono">
                    <span
                      className={clsx(
                        batch.labor_burn_pct > 15 && batch.physical_pct_complete === 0
                          ? 'text-amber-400 font-semibold'
                          : 'text-text-ops-primary',
                      )}
                    >
                      {formatPct(batch.labor_burn_pct)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono">
                    <span
                      className={clsx(
                        batch.physical_pct_complete === 0 && batch.labor_burn_pct > 15
                          ? 'text-red-400 font-semibold'
                          : 'text-text-ops-primary',
                      )}
                    >
                      {formatPct(batch.physical_pct_complete)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-text-ops-primary">
                    {formatCurrency(batch.acwp)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-text-ops-primary">
                    {formatCurrency(batch.pv)}
                  </td>
                  <td className="py-3 px-4">
                    <DivergenceBadge status={batch.divergence_status} />
                  </td>
                  <td className="py-3 px-4">
                    <ExportBadge status={batch.export_status} />
                  </td>
                  <td className="py-3 px-4">
                    {isHeld && (
                      <button
                        onClick={() => handleOpenJustification(batch)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
                      >
                        <ShieldAlert size={12} />
                        Submit Variance Justification
                      </button>
                    )}
                    {!isHeld && (
                      <span className="text-text-ops-muted text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {filteredBatches.length === 0 && (
              <tr>
                <td colSpan={12} className="py-12 text-center text-text-ops-muted">
                  <FileSpreadsheet size={24} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No timesheet batches match the current filters.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer summary */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-border-ops-subtle bg-bg-ops-overlay/50 text-xs text-text-ops-muted">
        <span>
          {filteredBatches.length} batch(es) shown · {selectedBatchCount} selected
        </span>
        <span>
          {batches.filter((b) => b.export_status === 'HELD_FOR_CAM_JUSTIFICATION').length} held for justification
        </span>
      </div>

      {/* CAM Variance Justification Modal */}
      {justificationBatch && (
        <CamVarianceJustificationModal
          batch={justificationBatch}
          isOpen={justificationModalOpen}
          onClose={() => {
            setJustificationModalOpen(false);
            setJustificationBatch(null);
          }}
          onSubmit={handleJustificationSubmit}
        />
      )}
    </div>
  );
};

export default TimesheetCoherenceView;
