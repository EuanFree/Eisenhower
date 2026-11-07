/**
 * ReportingWorkbenchView Component
 *
 * The front-end export triggers and preview workbench for statutory defence
 * reporting (IPMR/CPR Formats 1–5) and executive slide deck generation.
 *
 * Features
 * --------
 * - Reporting period selector (Fiscal Month / Calendar Cut-off Date)
 * - Project/Programme scope tree selector using ltree parent paths
 * - Statutory EVM (IPMR/CPR) Export Panel:
 *   - Cards for Format 1 (WBS), Format 2 (OBS), Format 3 (Baseline Changes),
 *     and Format 5 (Variance Analysis)
 *   - Live preview table showing calculated PV, EV, AC, CV, SV, CPI, SPI, VAC
 *     with RAG thresholds
 *   - One-click trigger buttons calling /api/v1/reports/evm/ipmr/format1 and
 *     /api/v1/reports/evm/ipmr/format5 to download formatted OpenPyXL spreadsheets
 *     and sealed PDF/A documents
 * - Executive Slide Deck Generation Modal (BriefingExportModal):
 *   - Toggle switches for 5 briefing slides
 *   - Download trigger calling /api/v1/reports/briefing/generate-deck
 *
 * @example
 * ```tsx
 * <ReportingWorkbenchView projectId="..." />
 * ```
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  FileSpreadsheet,
  FileText,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Calendar,
  FolderTree,
  ChevronRight,
  ChevronDown,
  Building2,
  GitCommitHorizontal,
  TrendingDown,
  Presentation,
  Filter,
  Eye,
  Table2,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../services/api';
import BriefingExportModal from '../components/reporting/BriefingExportModal';
import type {
  Format1Row,
  Format5VarianceItem,
  ExportFormat,
  IPMRFormatCard,
} from '../types/reporting';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** RAG threshold values for CPI/SPI */
const RAG_THRESHOLDS = {
  cpi_green: 1.0,
  cpi_amber: 0.95,
  spi_green: 1.0,
  spi_amber: 0.95,
};

/**
 * Determine RAG status from a numeric value.
 *
 * @param value - The metric value (CPI, SPI, etc.)
 * @param isHigherBetter - Whether higher values are better (true for CPI/SPI)
 * @returns RAG color class
 */
function getRagColor(value: number, isHigherBetter: boolean): string {
  if (isNaN(value) || value === 0) return 'text-text-ops-muted';
  if (isHigherBetter) {
    if (value >= RAG_THRESHOLDS.cpi_green) return 'text-green-400';
    if (value >= RAG_THRESHOLDS.cpi_amber) return 'text-amber-400';
    return 'text-red-400';
  } else {
    if (value <= -10000) return 'text-red-400';
    if (value <= -25000) return 'text-amber-400';
    return 'text-green-400';
  }
}

/**
 * Format currency value with locale-aware formatting.
 *
 * @param value - Numeric value to format
 * @param currency - ISO currency code (default 'GBP')
 * @returns Formatted currency string
 */
function formatCurrency(value: number, currency = 'GBP'): string {
  const prefix = currency === 'GBP' ? '\u00a3' : currency === 'USD' ? '$' : '\u20ac';
  if (Math.abs(value) >= 1_000_000) {
    return `${prefix}${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${prefix}${(value / 1_000).toFixed(1)}k`;
  }
  return `${prefix}${value.toFixed(0)}`;
}

/**
 * Format a ratio (CPI, SPI) as a percentage-like string.
 *
 * @param value - Ratio value (e.g., 1.05)
 * @returns Formatted string (e.g., '1.05')
 */
function formatRatio(value: number): string {
  if (isNaN(value) || value === 0) return '-';
  return value.toFixed(2);
}

// ---------------------------------------------------------------------------
// Sub-component: RAG Status Badge
// ---------------------------------------------------------------------------

/**
 * Render a RAG status badge with color-coded background.
 *
 * @param props - Component props
 */
const RAGBadge: React.FC<{ value: number; isHigherBetter: boolean }> = ({
  value,
  isHigherBetter,
}) => {
  const colorClass = getRagColor(value, isHigherBetter);
  const bgColor = colorClass.includes('green')
    ? 'bg-green-900/30 border-green-800/50'
    : colorClass.includes('amber')
      ? 'bg-amber-900/30 border-amber-800/50'
      : colorClass.includes('red')
        ? 'bg-red-900/30 border-red-800/50'
        : 'bg-bg-ops-overlay border-border-ops-subtle';

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold border',
        colorClass,
        bgColor,
      )}
    >
      {formatRatio(value)}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: Format 1 Preview Table
// ---------------------------------------------------------------------------

/**
 * Live preview table for Format 1 WBS EVM data.
 *
 * @param props - Component props
 */
const Format1Preview: React.FC<{ rows: Format1Row[]; currency: string }> = ({
  rows,
  currency,
}) => {
  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-text-ops-muted">
        <Table2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No WBS data available for the selected period.</p>
        <p className="text-xs mt-1">Select a project and reporting period to load EVM data.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="border-b border-border-ops-subtle text-text-ops-muted">
            <th className="text-left px-3 py-2 font-medium">WBS Code</th>
            <th className="text-left px-3 py-2 font-medium">Element</th>
            <th className="text-right px-3 py-2 font-medium">BAC</th>
            <th className="text-right px-3 py-2 font-medium">PV</th>
            <th className="text-right px-3 py-2 font-medium">EV</th>
            <th className="text-right px-3 py-2 font-medium">AC</th>
            <th className="text-right px-3 py-2 font-medium">CV</th>
            <th className="text-right px-3 py-2 font-medium">SV</th>
            <th className="text-center px-3 py-2 font-medium">CPI</th>
            <th className="text-center px-3 py-2 font-medium">SPI</th>
            <th className="text-right px-3 py-2 font-medium">EAC</th>
            <th className="text-right px-3 py-2 font-medium">VAC</th>
            <th className="text-right px-3 py-2 font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((row, i) => (
            <tr
              key={i}
              className={clsx(
                'border-b border-border-ops-subtle/50 hover:bg-bg-ops-overlay/50 transition-colors',
                row.percent_complete >= 100 && 'opacity-60',
              )}
            >
              <td className="px-3 py-1.5 text-text-ops-primary">{row.wbs_element_code}</td>
              <td className="px-3 py-1.5 text-text-ops-muted max-w-[200px] truncate" title={row.wbs_element_name}>
                {row.wbs_element_name}
              </td>
              <td className="px-3 py-1.5 text-right text-text-ops-primary">
                {formatCurrency(row.bac, currency)}
              </td>
              <td className="px-3 py-1.5 text-right text-text-ops-muted">
                {formatCurrency(row.pv, currency)}
              </td>
              <td className="px-3 py-1.5 text-right text-text-ops-primary">
                {formatCurrency(row.ev, currency)}
              </td>
              <td className="px-3 py-1.5 text-right text-text-ops-muted">
                {formatCurrency(row.ac, currency)}
              </td>
              <td className={clsx('px-3 py-1.5 text-right font-semibold', getRagColor(row.cv, false))}>
                {formatCurrency(row.cv, currency)}
              </td>
              <td className={clsx('px-3 py-1.5 text-right font-semibold', getRagColor(row.sv, false))}>
                {formatCurrency(row.sv, currency)}
              </td>
              <td className="px-3 py-1.5 text-center">
                <RAGBadge value={row.cpi} isHigherBetter={true} />
              </td>
              <td className="px-3 py-1.5 text-center">
                <RAGBadge value={row.spi} isHigherBetter={true} />
              </td>
              <td className="px-3 py-1.5 text-right text-text-ops-primary">
                {formatCurrency(row.eac, currency)}
              </td>
              <td className={clsx('px-3 py-1.5 text-right font-semibold', getRagColor(row.vac, false))}>
                {formatCurrency(row.vac, currency)}
              </td>
              <td className="px-3 py-1.5 text-right text-text-ops-muted">
                {row.percent_complete.toFixed(0)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 20 && (
        <p className="text-xs text-text-ops-muted px-3 py-2 text-center">
          Showing 20 of {rows.length} rows. Export full report for complete data.
        </p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: Format 5 Preview Table
// ---------------------------------------------------------------------------

/**
 * Live preview table for Format 5 Variance Analysis data.
 *
 * @param props - Component props
 */
const Format5Preview: React.FC<{ items: Format5VarianceItem[]; currency: string }> = ({
  items,
  currency,
}) => {
  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-text-ops-muted">
        <TrendingDown className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No variance items exceeding thresholds.</p>
        <p className="text-xs mt-1">Format 5 auto-extracts tasks with CV or SV exceeding ±10% or ±£25k.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="border-b border-border-ops-subtle text-text-ops-muted">
            <th className="text-left px-3 py-2 font-medium">WBS Code</th>
            <th className="text-left px-3 py-2 font-medium">Element</th>
            <th className="text-right px-3 py-2 font-medium">CV</th>
            <th className="text-right px-3 py-2 font-medium">SV</th>
            <th className="text-center px-3 py-2 font-medium">CPI</th>
            <th className="text-center px-3 py-2 font-medium">SPI</th>
            <th className="text-left px-3 py-2 font-medium">Problem</th>
            <th className="text-right px-3 py-2 font-medium">Blockers</th>
          </tr>
        </thead>
        <tbody>
          {items.slice(0, 15).map((item, i) => (
            <tr
              key={i}
              className="border-b border-border-ops-subtle/50 hover:bg-bg-ops-overlay/50 transition-colors"
            >
              <td className="px-3 py-1.5 text-text-ops-primary">{item.wbs_element_code}</td>
              <td className="px-3 py-1.5 text-text-ops-muted max-w-[150px] truncate" title={item.wbs_element_name}>
                {item.wbs_element_name}
              </td>
              <td className={clsx('px-3 py-1.5 text-right font-semibold', getRagColor(item.cv, false))}>
                {formatCurrency(item.cv, currency)}
              </td>
              <td className={clsx('px-3 py-1.5 text-right font-semibold', getRagColor(item.sv, false))}>
                {formatCurrency(item.sv, currency)}
              </td>
              <td className="px-3 py-1.5 text-center">
                <RAGBadge value={item.cpi} isHigherBetter={true} />
              </td>
              <td className="px-3 py-1.5 text-center">
                <RAGBadge value={item.spi} isHigherBetter={true} />
              </td>
              <td className="px-3 py-1.5 text-text-ops-muted max-w-[200px] truncate" title={item.problem}>
                {item.problem}
              </td>
              <td className="px-3 py-1.5 text-right">
                {item.active_blockers > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-red-900/30 text-red-400 border border-red-800/50">
                    <AlertCircle className="w-3 h-3" />
                    {item.active_blockers}
                  </span>
                ) : (
                  <span className="text-text-ops-muted">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length > 15 && (
        <p className="text-xs text-text-ops-muted px-3 py-2 text-center">
          Showing 15 of {items.length} variance items. Export full report for complete narratives.
        </p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: IPMR Format Card
// ---------------------------------------------------------------------------

/**
 * Card component for each IPMR format with preview and export buttons.
 *
 * @param props - Component props
 */
const IPMRFormatCardComponent: React.FC<{
  formatNumber: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  previewData: any;
  onExport: (format: number, exportFormat: ExportFormat) => void;
  exporting: boolean;
  exportError?: string;
}> = ({ formatNumber, title, description, icon, previewData, onExport, exporting, exportError }) => {
  const [showPreview, setShowPreview] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-bg-ops-overlay border border-border-ops-subtle rounded-lg overflow-hidden">
      {/* Card Header */}
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="mt-0.5 text-text-ops-muted">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-ops-primary">Format {formatNumber}</h3>
            <span className="text-xs font-mono text-text-ops-muted">{title}</span>
          </div>
          <p className="text-xs text-text-ops-muted mt-0.5">{description}</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-4 pb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowPreview((prev) => !prev)}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            showPreview
              ? 'bg-blue-600/20 text-blue-400 border border-blue-800/50'
              : 'bg-bg-ops-surface text-text-ops-muted border border-border-ops-subtle hover:text-text-ops-primary',
          )}
        >
          <Eye className="w-3.5 h-3.5" />
          {showPreview ? 'Hide Preview' : 'Preview'}
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => onExport(formatNumber, 'xlsx')}
          disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-green-600/20 text-green-400 border border-green-800/50 hover:bg-green-600/30 transition-colors disabled:opacity-50"
        >
          {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
          Excel
        </button>
        <button
          type="button"
          onClick={() => onExport(formatNumber, 'pdf')}
          disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-red-600/20 text-red-400 border border-red-800/50 hover:bg-red-600/30 transition-colors disabled:opacity-50"
        >
          {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
          PDF
        </button>
      </div>

      {/* Export Error */}
      {exportError && (
        <div className="px-4 pb-3">
          <div className="flex items-start gap-2 p-2 bg-red-900/20 border border-red-800/50 rounded-md">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-400">{exportError}</p>
          </div>
        </div>
      )}

      {/* Preview Panel */}
      {showPreview && (
        <div className="border-t border-border-ops-subtle">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs text-text-ops-muted hover:text-text-ops-primary transition-colors"
          >
            <span className="flex items-center gap-1.5">
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {expanded ? 'Collapse' : 'Expand'} Preview Table
            </span>
          </button>
          {expanded && (
            <div className="border-t border-border-ops-subtle">
              {formatNumber === 1 && previewData?.rows && (
                <Format1Preview rows={previewData.rows} currency={previewData.currency_code || 'GBP'} />
              )}
              {formatNumber === 5 && previewData?.items && (
                <Format5Preview items={previewData.items} currency={previewData.currency_code || 'GBP'} />
              )}
              {(formatNumber === 2 || formatNumber === 3) && (
                <div className="py-8 text-center text-text-ops-muted">
                  <Table2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Preview available on export.</p>
                  <p className="text-xs mt-1">
                    Format {formatNumber} data is best viewed in the exported spreadsheet.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: WBS Scope Tree Selector
// ---------------------------------------------------------------------------

/**
 * Tree selector for choosing project/programme scope using ltree paths.
 *
 * @param props - Component props
 */
const WBSScopeTree: React.FC<{
  nodes: any[];
  selectedId: string | null;
  onSelect: (id: string, name: string) => void;
}> = ({ nodes, selectedId, onSelect }) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const renderNode = (node: any, depth = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedId === node.id;
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.id}>
        <button
          type="button"
          onClick={() => {
            if (hasChildren) toggleExpand(node.id);
            onSelect(node.id, node.name);
          }}
          className={clsx(
            'w-full flex items-center gap-2 px-2 py-1.5 text-left rounded-md transition-colors',
            isSelected
              ? 'bg-blue-600/20 text-blue-400'
              : 'text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay',
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
            )
          ) : (
            <span className="w-3.5 h-3.5 flex-shrink-0" />
          )}
          <FolderTree className="w-4 h-4 flex-shrink-0" />
          <span className="text-xs font-mono truncate">
            {node.code} — {node.name}
          </span>
        </button>
        {isExpanded && hasChildren && (
          <div>{node.children.map((child: any) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-0.5 max-h-64 overflow-y-auto">
      {nodes.length === 0 ? (
        <p className="text-xs text-text-ops-muted px-2 py-4 text-center">
          No programmes loaded. Select a project to begin.
        </p>
      ) : (
        nodes.map((node) => renderNode(node))
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface ReportingWorkbenchViewProps {
  /** Optional: pre-selected project ID */
  projectId?: string;
}

const ReportingWorkbenchView: React.FC<ReportingWorkbenchViewProps> = ({ projectId }) => {
  // Reporting period state
  const today = new Date();
  const [statusDate, setStatusDate] = useState(today.toISOString().split('T')[0]);
  const [periodLabel, setPeriodLabel] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);

  // Scope selection state
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || '');
  const [selectedProjectName, setSelectedProjectName] = useState('');

  // Briefing modal state
  const [showBriefingModal, setShowBriefingModal] = useState(false);

  // Export state
  const [exportingFormat, setExportingFormat] = useState<number | null>(null);
  const [exportErrors, setExportErrors] = useState<Record<number, string | undefined>>({});

  // Preview data state
  const [format1Data, setFormat1Data] = useState<any>(null);
  const [format5Data, setFormat5Data] = useState<any>(null);

  // Mock WBS scope tree (would be loaded from API)
  const [wbsScopeTree, setWbsScopeTree] = useState<any[]>([]);

  /**
   * Load WBS scope tree for project selection.
   */
  const loadScopeTree = useCallback(async () => {
    try {
      const response = await api.get('/api/v1/wbs/nodes?tree_type=WBS');
      if (response.data && response.data.nodes) {
        // Build tree from flat list using ltree paths
        const rootNodes = response.data.nodes
          .filter((n: any) => n.path && n.path.split('.').length <= 2)
          .map((n: any) => ({
            id: n.id,
            code: n.code,
            name: n.name,
            path: n.path,
            children: [],
          }));
        setWbsScopeTree(rootNodes);
      }
    } catch {
      // Silently fail — scope tree is optional
    }
  }, []);

  /**
   * Load Format 1 preview data.
   */
  const loadFormat1Preview = useCallback(async () => {
    if (!selectedProjectId) return;
    try {
      const response = await api.get(`/api/v1/reports/evm/ipmr/format1`, {
        params: {
          project_id: selectedProjectId,
          status_date: statusDate,
        },
      });
      if (response.data) {
        setFormat1Data(response.data);
      }
    } catch {
      // Preview data not available — export will still work
    }
  }, [selectedProjectId, statusDate]);

  /**
   * Load Format 5 preview data.
   */
  const loadFormat5Preview = useCallback(async () => {
    if (!selectedProjectId) return;
    try {
      const response = await api.get(`/api/v1/reports/evm/ipmr/format5`, {
        params: {
          project_id: selectedProjectId,
          status_date: statusDate,
        },
      });
      if (response.data) {
        setFormat5Data(response.data);
      }
    } catch {
      // Preview data not available — export will still work
    }
  }, [selectedProjectId, statusDate]);

  /**
   * Handle project scope selection.
   *
   * @param id - Selected node UUID
   * @param name - Selected node name
   */
  const handleSelectProject = useCallback(
    (id: string, name: string) => {
      setSelectedProjectId(id);
      setSelectedProjectName(name);
    },
    [],
  );

  /**
   * Export IPMR report to specified format.
   *
   * @param formatNumber - IPMR format number (1, 2, 3, 5)
   * @param exportFormat - Export format ('xlsx' or 'pdf')
   */
  const handleExport = useCallback(
    async (formatNumber: number, exportFormat: ExportFormat) => {
      if (!selectedProjectId) {
        setExportErrors((prev) => ({
          ...prev,
          [formatNumber]: 'Please select a project first.',
        }));
        return;
      }

      setExportingFormat(formatNumber);
      setExportErrors((prev) => ({ ...prev, [formatNumber]: undefined }));

      try {
        const endpoint =
          formatNumber === 1
            ? '/api/v1/reports/evm/ipmr/format1'
            : formatNumber === 5
              ? '/api/v1/reports/evm/ipmr/format5'
              : `/api/v1/reports/evm/ipmr/format${formatNumber}`;

        const response = await api.get(endpoint, {
          params: {
            project_id: selectedProjectId,
            status_date: statusDate,
            export_format: exportFormat,
          },
          responseType: 'blob',
        });

        // Trigger file download
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        const fileName = `IPMR_Format${formatNumber}_${periodLabel}.${exportFormat}`;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (err: any) {
        const message =
          err?.response?.data?.detail || err?.message || `Failed to export Format ${formatNumber}.`;
        setExportErrors((prev) => ({ ...prev, [formatNumber]: message }));
      } finally {
        setExportingFormat(null);
      }
    },
    [selectedProjectId, statusDate, periodLabel],
  );

  /**
   * Handle status date change.
   *
   * @param event - Date input change event
   */
  const handleDateChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = event.target.value;
    setStatusDate(newDate);
    const [year, month] = newDate.split('-');
    setPeriodLabel(`${year}-${month}`);
  }, []);

  // Load scope tree on mount
  React.useEffect(() => {
    loadScopeTree();
  }, [loadScopeTree]);

  // Load preview data when project or date changes
  React.useEffect(() => {
    loadFormat1Preview();
    loadFormat5Preview();
  }, [loadFormat1Preview, loadFormat5Preview]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border-ops-subtle">
        <h1 className="text-xl font-semibold text-text-ops-primary">Reporting Workbench</h1>
        <p className="text-sm text-text-ops-muted mt-1">
          Statutory EVM reporting (IPMR/CPR) and executive briefing deck generation.
        </p>
      </div>

      {/* Controls Bar */}
      <div className="px-6 py-3 border-b border-border-ops-subtle flex items-center gap-6 flex-wrap">
        {/* Reporting Period */}
        <div className="flex items-center gap-3">
          <Calendar className="w-4 h-4 text-text-ops-muted" />
          <div>
            <label htmlFor="status-date" className="block text-xs font-medium text-text-ops-muted">
              Status Date
            </label>
            <input
              id="status-date"
              type="date"
              value={statusDate}
              onChange={handleDateChange}
              className="mt-0.5 block w-40 px-3 py-1.5 text-sm font-mono bg-bg-ops-overlay border border-border-ops-subtle rounded-md text-text-ops-primary focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>
          <span className="text-xs font-mono text-text-ops-muted bg-bg-ops-overlay px-2 py-1 rounded">
            Period: {periodLabel}
          </span>
        </div>

        {/* Project Selector */}
        <div className="flex items-center gap-3">
          <FolderTree className="w-4 h-4 text-text-ops-muted" />
          <div>
            <label className="block text-xs font-medium text-text-ops-muted">
              Project / Programme Scope
            </label>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-sm font-mono text-text-ops-primary">
                {selectedProjectName || 'Select a project...'}
              </span>
            </div>
          </div>
        </div>

        {/* Briefing Deck Button */}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowBriefingModal(true)}
          disabled={!selectedProjectId}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors',
            selectedProjectId
              ? 'bg-purple-600 text-white hover:bg-purple-700'
              : 'bg-bg-ops-overlay text-text-ops-muted cursor-not-allowed',
          )}
        >
          <Presentation className="w-4 h-4" />
          Generate Briefing Deck
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Scope Tree */}
        <div className="w-72 border-r border-border-ops-subtle flex flex-col">
          <div className="px-4 py-3 border-b border-border-ops-subtle flex items-center gap-2">
            <Filter className="w-4 h-4 text-text-ops-muted" />
            <span className="text-sm font-semibold text-text-ops-primary">Scope Selector</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <WBSScopeTree
              nodes={wbsScopeTree}
              selectedId={selectedProjectId || null}
              onSelect={handleSelectProject}
            />
          </div>
        </div>

        {/* Right Content: IPMR Export Panel */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Section Header */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-text-ops-primary">
              Statutory EVM Reports (IPMR/CPR)
            </h2>
            <p className="text-sm text-text-ops-muted mt-1">
              Export compliant defence programme reports in Excel or PDF/A format.
            </p>
          </div>

          {/* Format Cards Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
            <IPMRFormatCardComponent
              formatNumber={1}
              title="Work Breakdown Structure"
              description="Time-phased cost data by WBS element: BCWS/PV, BCWP/EV, ACWP/AC with CV, SV, CPI, SPI, EAC, VAC."
              icon={<Table2 className="w-5 h-5" />}
              previewData={format1Data}
              onExport={handleExport}
              exporting={exportingFormat === 1}
              exportError={exportErrors[1]}
            />
            <IPMRFormatCardComponent
              formatNumber={2}
              title="Organizational Breakdown Structure"
              description="Earned Value performance grouped by functional department and RBS cost centers."
              icon={<Building2 className="w-5 h-5" />}
              previewData={null}
              onExport={handleExport}
              exporting={exportingFormat === 2}
              exportError={exportErrors[2]}
            />
            <IPMRFormatCardComponent
              formatNumber={3}
              title="Baseline Changes"
              description="Audits changes to the Performance Measurement Baseline between reporting cycles."
              icon={<GitCommitHorizontal className="w-5 h-5" />}
              previewData={null}
              onExport={handleExport}
              exporting={exportingFormat === 3}
              exportError={exportErrors[3]}
            />
            <IPMRFormatCardComponent
              formatNumber={5}
              title="Variance Analysis Narrative"
              description="Auto-extracted tasks exceeding variance thresholds with Problem/Cause/Impact/Corrective Action."
              icon={<TrendingDown className="w-5 h-5" />}
              previewData={format5Data}
              onExport={handleExport}
              exporting={exportingFormat === 5}
              exportError={exportErrors[5]}
            />
          </div>

          {/* RAG Threshold Legend */}
          <div className="mb-8 p-4 bg-bg-ops-overlay border border-border-ops-subtle rounded-lg">
            <h3 className="text-sm font-semibold text-text-ops-primary mb-3">RAG Threshold Reference</h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-text-ops-muted">CPI / SPI </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold border text-green-400 bg-green-900/30 border-green-800/50">
                  ≥ 1.00
                </span>
                <span className="text-text-ops-muted ml-1">= On Track</span>
              </div>
              <div>
                <span className="text-text-ops-muted">CPI / SPI </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold border text-amber-400 bg-amber-900/30 border-amber-800/50">
                  0.95–0.99
                </span>
                <span className="text-text-ops-muted ml-1">= Watch</span>
              </div>
              <div>
                <span className="text-text-ops-muted">CPI / SPI </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold border text-red-400 bg-red-900/30 border-red-800/50">
                  &lt; 0.95
                </span>
                <span className="text-text-ops-muted ml-1">= Action Required</span>
              </div>
              <div>
                <span className="text-text-ops-muted">CV / SV </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold border text-green-400 bg-green-900/30 border-green-800/50">
                  ≥ 0
                </span>
                <span className="text-text-ops-muted ml-1">= Under Budget / Ahead</span>
              </div>
            </div>
          </div>

          {/* Empty State */}
          {!selectedProjectId && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileSpreadsheet className="w-16 h-16 text-text-ops-muted opacity-30 mb-4" />
              <h3 className="text-lg font-semibold text-text-ops-primary mb-2">
                Select a Project to Begin
              </h3>
              <p className="text-sm text-text-ops-muted max-w-md">
                Choose a programme or project from the scope selector on the left to load EVM data
                and generate statutory IPMR reports.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Briefing Export Modal */}
      {selectedProjectId && (
        <BriefingExportModal
          isOpen={showBriefingModal}
          onClose={() => setShowBriefingModal(false)}
          projectId={selectedProjectId}
          statusDate={statusDate}
          programmeName={selectedProjectName}
        />
      )}
    </div>
  );
};

export default ReportingWorkbenchView;
