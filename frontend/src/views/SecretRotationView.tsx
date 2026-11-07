/** Secret Rotation View - Secret rotation management. */
import React, { useState, useEffect } from 'react';
import { Lock, RefreshCw, KeyRound } from 'lucide-react';
import api from '../services/api';

const SecretRotationView: React.FC = () => {
  const [secrets, setSecrets] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const [s, h] = await Promise.all([api.get('/admin/secrets'), api.get('/admin/secrets/history')]);
      setSecrets(s.data || []); setHistory(h.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchAll(); }, []);

  const rotate = async (name: string) => {
    if (!confirm(`Rotate ${name}?`)) return;
    try { await api.post(`/admin/secrets/${name}/rotate`); await fetchAll(); }
    catch (err) { console.error(err); }
  };

  if (loading) return <div className="flex items-center justify-center h-full text-text-ops-muted">Loading...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <Lock className="w-6 h-6 text-amber-400" />
          <div><h1 className="text-lg font-semibold text-text-ops-primary">Secret Rotation</h1>
          <p className="text-sm text-text-ops-muted">Manage sensitive secrets</p></div>
        </div>
        <button onClick={fetchAll} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div>
          <h2 className="text-base font-medium text-text-ops-primary mb-3">Managed Secrets</h2>
          <div className="space-y-2">
            {secrets.map(s => (
              <div key={s.name} className="flex items-center justify-between p-3 bg-bg-ops-surface rounded border border-border-ops-subtle">
                <div>
                  <div className="text-sm text-text-ops-primary">{s.name}</div>
                  <div className="text-xs text-text-ops-muted">Type: {s.type} | Rotated: {s.last_rotated || 'Never'} | Count: {s.rotation_count}</div>
                </div>
                <button onClick={() => rotate(s.name)} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm">
                  <KeyRound className="w-4 h-4" /> Rotate
                </button>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-base font-medium text-text-ops-primary mb-3">Rotation History ({history.length})</h2>
          {history.length === 0 ? <div className="text-text-ops-muted text-sm">No rotation history</div> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border-ops-subtle text-text-ops-muted">
                <th className="text-left py-2 px-3">Secret</th><th className="text-left py-2 px-3">Rotated At</th>
              </tr></thead>
              <tbody>{history.map((h, i) => (
                <tr key={i} className="border-b border-border-ops-subtle">
                  <td className="py-2 px-3 text-text-ops-primary">{h.secret_name}</td>
                  <td className="py-2 px-3 text-text-ops-muted text-xs">{new Date(h.rotated_at).toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default SecretRotationView;
