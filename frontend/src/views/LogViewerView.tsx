/** Log Viewer View - Application and access log management interface. */
import React, { useState, useCallback, useEffect } from 'react';
import { ScrollText, RefreshCw, Download, Filter } from 'lucide-react';
import api from '../services/api';

const LogViewerView: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [level, setLevel] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      const params: any = { limit: 200 };
      if (level) params.level = level;
      if (search) params.search = search;
      const data = await api.get('/admin/logs', { params });
      setLogs(data.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [level, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleExport = async (format: string) => {
    try {
      const result = await api.get('/admin/logs/export', { params: { format, limit: 1000 } });
      const blob = new Blob([result.data?.content || ''], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs.${format}`;
      a.click();
    } catch (err) { console.error(err); }
  };

  const levelColor: Record<string, string> = {
    DEBUG: 'text-gray-400', INFO: 'text-blue-400', WARNING: 'text-yellow-400',
    ERROR: 'text-red-400', CRITICAL: 'text-red-600 font-bold',
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <ScrollText className="w-6 h-6 text-amber-400" />
          <div>
            <h1 className="text-lg font-semibold text-text-ops-primary">Log Viewer</h1>
            <p className="text-sm text-text-ops-muted">Application &amp; access logs</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={level} onChange={e => setLevel(e.target.value)}
            className="bg-bg-ops-surface border border-border-ops-strong rounded px-2 py-1 text-sm text-text-ops-primary">
            <option value="">All Levels</option>
            {['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
            className="bg-bg-ops-surface border border-border-ops-strong rounded px-2 py-1 text-sm text-text-ops-primary" />
          <button onClick={fetchLogs} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => handleExport('json')} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted"><Download className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4 font-mono text-xs">
        {loading ? <div className="text-text-ops-muted">Loading logs...</div> : (
          <div className="space-y-1">
            {logs.map((log, i) => (
              <div key={i} className="border-b border-border-ops-subtle/30 py-1 px-2 hover:bg-bg-ops-overlay">
                <span className="text-text-ops-muted">{log.timestamp}</span>{' '}
                <span className={levelColor[log.level] || 'text-text-ops-primary'}>[{log.level}]</span>{' '}
                <span className="text-text-ops-primary">{log.message}</span>
              </div>
            ))}
            {logs.length === 0 && <div className="text-text-ops-muted text-center py-8">No logs found</div>}
          </div>
        )}
      </div>
    </div>
  );
};

export default LogViewerView;
