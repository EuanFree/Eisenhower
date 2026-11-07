/**
 * Data Export View
 *
 * Comprehensive export interface for:
 * - Database data export (CSV, JSON, Excel)
 * - GUI view export to PNG and PowerPoint slides
 * - Template-based report generation (Word and PowerPoint)
 */
import React, { useState } from 'react';
import {
  Download,
  Upload,
  RefreshCw,
  Image,
  FileText,
  Presentation,
  Database,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../services/api';
import ExportModal from '../components/export/ExportModal';

const DataExportView: React.FC = () => {
  const [formats, setFormats] = useState<string[]>([]);
  const [format, setFormat] = useState('csv');
  const [exporting, setExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  React.useEffect(() => {
    api.get('/admin/data/formats').then(d => setFormats(d.data || ['csv', 'json', 'excel'])).catch(() => {});
  }, []);

  const handleDataExport = async () => {
    setExporting(true);
    try { await api.post('/admin/data/export', null, { params: { format } }); alert('Export started'); }
    catch (err) { console.error(err); }
    setExporting(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <Download className="w-6 h-6 text-blue-400" />
          <div>
            <h1 className="text-lg font-semibold text-text-ops-primary">Export Center</h1>
            <p className="text-sm text-text-ops-muted">Export views, generate reports, and manage data</p>
          </div>
        </div>
        <button
          onClick={() => setShowExportModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          Export View or Report
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl space-y-8">
          {/* Quick Export Cards */}
          <div>
            <h2 className="text-sm font-medium text-text-ops-muted mb-4">Quick Export</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* View Export */}
              <button
                onClick={() => setShowExportModal(true)}
                className="flex flex-col items-start p-4 bg-bg-ops-surface border border-border-ops-subtle rounded-lg hover:border-blue-500/50 transition-colors group"
              >
                <div className="p-2 bg-blue-600/10 rounded-lg mb-3 group-hover:bg-blue-600/20 transition-colors">
                  <Image className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="text-sm font-medium text-text-ops-primary mb-1">Export View</h3>
                <p className="text-xs text-text-ops-muted">
                  Export any GUI view to PNG image or PowerPoint slide
                </p>
              </button>

              {/* Word Report */}
              <button
                onClick={() => setShowExportModal(true)}
                className="flex flex-col items-start p-4 bg-bg-ops-surface border border-border-ops-subtle rounded-lg hover:border-blue-500/50 transition-colors group"
              >
                <div className="p-2 bg-blue-600/10 rounded-lg mb-3 group-hover:bg-blue-600/20 transition-colors">
                  <FileText className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="text-sm font-medium text-text-ops-primary mb-1">Word Report</h3>
                <p className="text-xs text-text-ops-muted">
                  Generate template-based reports in Word format
                </p>
              </button>

              {/* PowerPoint Report */}
              <button
                onClick={() => setShowExportModal(true)}
                className="flex flex-col items-start p-4 bg-bg-ops-surface border border-border-ops-subtle rounded-lg hover:border-blue-500/50 transition-colors group"
              >
                <div className="p-2 bg-blue-600/10 rounded-lg mb-3 group-hover:bg-blue-600/20 transition-colors">
                  <Presentation className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="text-sm font-medium text-text-ops-primary mb-1">PowerPoint Report</h3>
                <p className="text-xs text-text-ops-muted">
                  Generate template-based reports in PowerPoint format
                </p>
              </button>
            </div>
          </div>

          {/* Data Export */}
          <div>
            <h2 className="text-sm font-medium text-text-ops-muted mb-4 flex items-center gap-2">
              <Database className="w-4 h-4" />
              Database Data Export
            </h2>
            <div className="bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4">
              <div className="max-w-md space-y-4">
                <div>
                  <label className="text-sm text-text-ops-muted">Export Format</label>
                  <select
                    value={format}
                    onChange={e => setFormat(e.target.value)}
                    className="w-full mt-1 bg-bg-ops-muted border border-border-ops-strong rounded-lg px-3 py-2 text-sm text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    {formats.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
                  </select>
                </div>
                <button
                  onClick={handleDataExport}
                  disabled={exporting}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  {exporting ? 'Exporting...' : 'Export Database Data'}
                </button>
              </div>
            </div>
          </div>

          {/* Export Options Info */}
          <div>
            <h2 className="text-sm font-medium text-text-ops-muted mb-4">Export Options</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4">
                <h3 className="text-sm font-medium text-text-ops-primary mb-2">View Export</h3>
                <ul className="text-xs text-text-ops-muted space-y-1">
                  <li>• Export any GUI view as PNG image</li>
                  <li>• Export views as PowerPoint slides</li>
                  <li>• Includes classification stamps</li>
                  <li>• Supports 20+ view types</li>
                </ul>
              </div>
              <div className="bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4">
                <h3 className="text-sm font-medium text-text-ops-primary mb-2">Template Reports</h3>
                <ul className="text-xs text-text-ops-muted space-y-1">
                  <li>• Programme Status Reports</li>
                  <li>• Executive Summaries</li>
                  <li>• Risk Registers</li>
                  <li>• EVM Reports and more</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
      />
    </div>
  );
};

export default DataExportView;
