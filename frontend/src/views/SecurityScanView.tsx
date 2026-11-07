/** Security Scan View - SAST/DAST scan management. */
import React, { useState, useEffect } from 'react';
import { ScanLine, Play, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import api from '../services/api';

const SecurityScanView: React.FC = () => {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchResults = async () => {
    try { const data = await api.get('/admin/security-scan/results'); setResults(data.data || []); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchResults(); }, []);

  const runScan = async (type: string) => {
    try { await api.post(`/admin/security-scan/${type}`); alert(`${type.toUpperCase()} scan started`); await fetchResults(); }
    catch (err) { console.error(err); }
  };

  if (loading) return <div className="flex items-center justify-center h-full text-text-ops-muted">Loading...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <ScanLine className="w-6 h-6 text-red-400" />
          <div><h1 className="text-lg font-semibold text-text-ops-primary">Security Scans</h1>
          <p className="text-sm text-text-ops-muted">SAST &amp; DAST scan management</p></div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => runScan('sast')} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm">
            <Play className="w-4 h-4" /> Run SAST
          </button>
          <button onClick={() => runScan('dast')} className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm">
            <Play className="w-4 h-4" /> Run DAST
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6">
        {results.length === 0 ? <div className="text-text-ops-muted text-center py-8">No scan results. Run a scan to get started.</div> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border-ops-subtle text-text-ops-muted">
              <th className="text-left py-2 px-3">ID</th><th className="text-left py-2 px-3">Type</th>
              <th className="text-left py-2 px-3">Status</th><th className="text-left py-2 px-3">Started</th>
            </tr></thead>
            <tbody>{results.map(r => (
              <tr key={r.id} className="border-b border-border-ops-subtle">
                <td className="py-2 px-3 font-mono text-text-ops-primary">{r.id}</td>
                <td className="py-2 px-3"><span className="px-2 py-0.5 bg-bg-ops-overlay rounded text-xs uppercase">{r.type}</span></td>
                <td className="py-2 px-3">
                  {r.status === 'completed' ? <><CheckCircle className="w-4 h-4 text-green-400 inline mr-1" />Completed</> :
                   r.status === 'failed' ? <><XCircle className="w-4 h-4 text-red-400 inline mr-1" />Failed</> :
                   <span className="text-amber-400">Running</span>}
                </td>
                <td className="py-2 px-3 text-text-ops-muted text-xs">{r.started_at ? new Date(r.started_at).toLocaleString() : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default SecurityScanView;
