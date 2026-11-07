/**
 * ExportModal Component
 *
 * Modal dialog for exporting GUI views and generating template reports.
 *
 * Features
 * --------
 * - Export any GUI view to PNG or PowerPoint slides
 * - Generate template reports in Word or PowerPoint format
 * - Select view type, format, and options
 * - Preview available templates
 * - Download generated files
 *
 * @example
 * ```tsx
 * <ExportModal
 *   isOpen={showExportModal}
 *   onClose={() => setShowExportModal(false)}
 *   projectId="..."
 * />
 * ```
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  X,
  Download,
  Loader2,
  Image,
  FileText,
  Presentation,
  LayoutDashboard,
  Calendar,
  BarChart3,
  AlertTriangle,
  TrendingUp,
  Settings,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExportModalProps {
  /** Whether the modal is currently open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Current project ID (optional) */
  projectId?: string;
  /** Current dashboard ID (optional) */
  dashboardId?: string;
}

type ExportMode = 'view' | 'report';
type ExportFormat = 'png' | 'pptx' | 'docx';

interface ViewType {
  value: string;
  label: string;
  icon: string;
}

interface ReportTemplate {
  template_type: string;
  name: string;
  description: string;
  supported_formats: string[];
  sections: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VIEW_TYPES: ViewType[] = [
  { value: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
  { value: 'gantt', label: 'Gantt Chart', icon: 'Calendar' },
  { value: 'cockpit', label: 'Daily Cockpit', icon: 'Settings' },
  { value: 'wbs', label: 'WBS', icon: 'LayoutDashboard' },
  { value: 'risk', label: 'Risk Matrix', icon: 'AlertTriangle' },
  { value: 'evm', label: 'EVM', icon: 'TrendingUp' },
  { value: 'procurement', label: 'Procurement', icon: 'BarChart3' },
  { value: 'reserves', label: 'Reserves', icon: 'BarChart3' },
  { value: 'facilities', label: 'Facilities', icon: 'LayoutDashboard' },
  { value: 'equipment', label: 'Equipment', icon: 'Settings' },
  { value: 'engineering', label: 'Engineering', icon: 'Settings' },
  { value: 'commercial', label: 'Commercial', icon: 'BarChart3' },
  { value: 'materials', label: 'Materials', icon: 'LayoutDashboard' },
  { value: 'schedule', label: 'Schedule', icon: 'Calendar' },
  { value: 'calendars', label: 'Calendars', icon: 'Calendar' },
  { value: 'costing', label: 'Costing', icon: 'TrendingUp' },
  { value: 'cdrl', label: 'CDRL', icon: 'FileText' },
  { value: 'subcontractors', label: 'Subcontractors', icon: 'LayoutDashboard' },
  { value: 'supplier', label: 'Supplier Portal', icon: 'LayoutDashboard' },
  { value: 'audit', label: 'Audit', icon: 'Settings' },
  { value: 'merkle', label: 'Merkle Sync', icon: 'Settings' },
  { value: 'spatial', label: 'Spatial', icon: 'LayoutDashboard' },
  { value: 'currency', label: 'Currency', icon: 'TrendingUp' },
];

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Calendar,
  BarChart3,
  AlertTriangle,
  TrendingUp,
  Settings,
  Image,
  FileText,
  Presentation,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  projectId,
  dashboardId,
}) => {
  const [mode, setMode] = useState<ExportMode>('view');
  const [viewType, setViewType] = useState('dashboard');
  const [format, setFormat] = useState<ExportFormat>('png');
  const [templateType, setTemplateType] = useState('programme_status');
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [titleOverride, setTitleOverride] = useState('');
  const [includeClassification, setIncludeClassification] = useState(true);

  // Load templates when switching to report mode
  useEffect(() => {
    if (mode === 'report' && templates.length === 0) {
      setLoading(true);
      api.get('/v1/export/templates')
        .then((res) => {
          if (res.data?.templates) {
            setTemplates(res.data.templates);
            if (res.data.templates.length > 0) {
              setTemplateType(res.data.templates[0].template_type);
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [mode, templates.length]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      let response;

      if (mode === 'view') {
        response = await api.post('/v1/export/view', {
          view_type: viewType,
          format: format,
          project_id: projectId || undefined,
          dashboard_id: dashboardId || undefined,
          include_classification: includeClassification,
          title_override: titleOverride || undefined,
        }, {
          responseType: 'blob',
        });
      } else {
        response = await api.post('/v1/export/report', {
          template_type: templateType,
          format: format,
          project_id: projectId || undefined,
          title_override: titleOverride || undefined,
          include_export_disclaimer: true,
        }, {
          responseType: 'blob',
        });
      }

      // Trigger download
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Extract filename from Content-Disposition header
      const disposition = response.headers['content-disposition'];
      let filename = `export_${Date.now()}.${format}`;
      if (disposition) {
        const filenameMatch = disposition.match(/filename="?(.+)"?$/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      onClose();
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
    }
    setExporting(false);
  }, [mode, viewType, format, templateType, projectId, dashboardId, includeClassification, titleOverride, onClose]);

  if (!isOpen) return null;

  const currentTemplate = templates.find(t => t.template_type === templateType);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-bg-ops-surface rounded-lg shadow-2xl border border-border-ops-strong w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
          <div className="flex items-center gap-3">
            <Download className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-text-ops-primary">Export</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-ops-hover text-text-ops-muted hover:text-text-ops-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Mode Toggle */}
          <div>
            <label className="text-sm font-medium text-text-ops-muted mb-2 block">
              Export Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode('view')}
                className={clsx(
                  'px-4 py-3 rounded-lg text-sm font-medium transition-colors border',
                  mode === 'view'
                    ? 'bg-blue-600/10 border-blue-500/50 text-blue-400'
                    : 'bg-bg-ops-muted border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary'
                )}
              >
                <div className="flex items-center justify-center gap-2">
                  <Image className="w-4 h-4" />
                  View Export
                </div>
                <div className="text-xs mt-1 opacity-70">
                  Export current view to PNG or PPTX
                </div>
              </button>
              <button
                onClick={() => setMode('report')}
                className={clsx(
                  'px-4 py-3 rounded-lg text-sm font-medium transition-colors border',
                  mode === 'report'
                    ? 'bg-blue-600/10 border-blue-500/50 text-blue-400'
                    : 'bg-bg-ops-muted border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary'
                )}
              >
                <div className="flex items-center justify-center gap-2">
                  <FileText className="w-4 h-4" />
                  Template Report
                </div>
                <div className="text-xs mt-1 opacity-70">
                  Generate Word or PowerPoint report
                </div>
              </button>
            </div>
          </div>

          {/* View Type Selection */}
          {mode === 'view' && (
            <>
              <div>
                <label className="text-sm font-medium text-text-ops-muted mb-2 block">
                  View Type
                </label>
                <div className="grid grid-cols-4 gap-2 max-h-48 overflow-auto">
                  {VIEW_TYPES.map((vt) => {
                    const Icon = ICON_MAP[vt.icon] || LayoutDashboard;
                    return (
                      <button
                        key={vt.value}
                        onClick={() => setViewType(vt.value)}
                        className={clsx(
                          'px-3 py-2 rounded-lg text-xs font-medium transition-colors border text-center',
                          viewType === vt.value
                            ? 'bg-blue-600/10 border-blue-500/50 text-blue-400'
                            : 'bg-bg-ops-muted border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary'
                        )}
                      >
                        <Icon className="w-4 h-4 mx-auto mb-1" />
                        {vt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-text-ops-muted mb-2 block">
                  Format
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setFormat('png')}
                    className={clsx(
                      'px-4 py-3 rounded-lg text-sm font-medium transition-colors border flex items-center justify-center gap-2',
                      format === 'png'
                        ? 'bg-blue-600/10 border-blue-500/50 text-blue-400'
                        : 'bg-bg-ops-muted border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary'
                    )}
                  >
                    <Image className="w-4 h-4" />
                    PNG Image
                  </button>
                  <button
                    onClick={() => setFormat('pptx')}
                    className={clsx(
                      'px-4 py-3 rounded-lg text-sm font-medium transition-colors border flex items-center justify-center gap-2',
                      format === 'pptx'
                        ? 'bg-blue-600/10 border-blue-500/50 text-blue-400'
                        : 'bg-bg-ops-muted border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary'
                    )}
                  >
                    <Presentation className="w-4 h-4" />
                    PowerPoint
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Report Template Selection */}
          {mode === 'report' && (
            <>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-sm font-medium text-text-ops-muted mb-2 block">
                      Report Template
                    </label>
                    <select
                      value={templateType}
                      onChange={(e) => setTemplateType(e.target.value)}
                      className="w-full bg-bg-ops-muted border border-border-ops-strong rounded-lg px-3 py-2 text-sm text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      {templates.map((t) => (
                        <option key={t.template_type} value={t.template_type}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    {currentTemplate && (
                      <p className="mt-2 text-xs text-text-ops-muted">
                        {currentTemplate.description}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-text-ops-muted mb-2 block">
                      Format
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setFormat('docx')}
                        className={clsx(
                          'px-4 py-3 rounded-lg text-sm font-medium transition-colors border flex items-center justify-center gap-2',
                          format === 'docx'
                            ? 'bg-blue-600/10 border-blue-500/50 text-blue-400'
                            : 'bg-bg-ops-muted border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary'
                        )}
                      >
                        <FileText className="w-4 h-4" />
                        Word Document
                      </button>
                      <button
                        onClick={() => setFormat('pptx')}
                        className={clsx(
                          'px-4 py-3 rounded-lg text-sm font-medium transition-colors border flex items-center justify-center gap-2',
                          format === 'pptx'
                            ? 'bg-blue-600/10 border-blue-500/50 text-blue-400'
                            : 'bg-bg-ops-muted border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary'
                        )}
                      >
                        <Presentation className="w-4 h-4" />
                        PowerPoint
                      </button>
                    </div>
                  </div>

                  {currentTemplate && currentTemplate.sections.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-text-ops-muted mb-2 block">
                        Sections ({currentTemplate.sections.length})
                      </label>
                      <div className="flex flex-wrap gap-1">
                        {currentTemplate.sections.map((section) => (
                          <span
                            key={section}
                            className="px-2 py-1 bg-bg-ops-muted rounded text-xs text-text-ops-muted"
                          >
                            {section.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Options */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-text-ops-muted mb-1 block">
                Title (optional)
              </label>
              <input
                type="text"
                value={titleOverride}
                onChange={(e) => setTitleOverride(e.target.value)}
                placeholder="Leave empty for auto-generated title"
                className="w-full bg-bg-ops-muted border border-border-ops-strong rounded-lg px-3 py-2 text-sm text-text-ops-primary placeholder:text-text-ops-muted/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>

            {mode === 'view' && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeClassification}
                  onChange={(e) => setIncludeClassification(e.target.checked)}
                  className="rounded border-border-ops-strong bg-bg-ops-muted text-blue-600 focus:ring-blue-500/50"
                />
                <span className="text-sm text-text-ops-muted">
                  Include classification stamps
                </span>
              </label>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-ops-subtle">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border-ops-strong text-text-ops-muted hover:text-text-ops-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
