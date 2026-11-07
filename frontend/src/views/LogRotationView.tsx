/** Log Rotation View - Log rotation configuration and management. */
import React, { useState, useEffect } from 'react';
import { RefreshCw, RotateCw } from 'lucide-react';
import api from '../services/api';

const LogRotationView: React.FC = () => {
  const [config, setConfig] = useState<any>({});
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const [c, f] = await Promise.all([api.get('/admin/log-rotation/config'), api.get('/admin/log-rotation/files')]);
      setConfig(c.data || {}); setFiles(f.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchAll(); }, []);

  const handleRotate = async () => {
    if (!confirm('Rotate logs now?')) return;
    try { await api.post('/admin/log-rotation/rotate'); await fetchAll(); }
    catch (err) { console.error(err); }
  };

  if (loading) return <div className="flex items-center justify-center h-full text-text-ops-muted">Loading...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <RotateCw className="w-6 h-6 text-indigo-400" />
          <div><h1 className="text-lg font-semibold text-text-ops-primary">Log Rotation</h1>
          <p className="text-sm text-text-ops-muted">Log file rotation &amp; retention</p></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRotate} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm">
            <RotateCw className="w-4 h-4" /> Rotate Now
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(config).map(([key, val]) => (
            <div key={key} className="p-3 bg-bg-ops-surface rounded border border-border-ops-subtle">
              <div className="text-xs text-text-ops-muted capitalize">{key.replace(/_/g, ' ')}</div>
              <div className="text-lg font-bold text-text-ops-primary">{JSON.stringify(val)}</div>
            </div>
          ))}
        </div>
        <div>
          <h2 className="text-base font-medium text-text-ops-primary mb-3">Rotated Files ({files.length})</h2>
          {files.length === 0 ? <div className="text-text-ops-muted text-sm">No rotated files</div> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border-ops-subtle text-text-ops-muted">
                <th className="text-left py-2 px-3">Filename</th><th className="text-left py-2 px-3">Size</th><th className="text-left py-2 px-3">Modified</th>
              </tr></thead>
              <tbody>{files.map(f => (
                <tr key={f.filename} className="border-b border-border-ops-subtle">
                  <td className="py-2 px-3 text-text-ops-primary">{f.filename}</td>
                  <td className="py-2 px-3 text-text-ops-muted">{(f.size_bytes/1024).toFixed(1)} KB</td>
                  <td className="py-2 px-3 text-text-ops-muted text-xs">{new Date(f.modified).toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default LogRotationView;
