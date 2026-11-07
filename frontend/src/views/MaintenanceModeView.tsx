/** Maintenance Mode View - Maintenance mode control. */
import React, { useState, useEffect } from 'react';
import { Hammer, RefreshCw } from 'lucide-react';
import api from '../services/api';

const MaintenanceModeView: React.FC = () => {
  const [maintenance, setMaintenance] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try { const res = await api.get('/admin/maintenance'); setMaintenance(res.data); setMessage(res.data?.message || ''); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchStatus(); }, []);

  const toggle = async (enabled: boolean) => {
    try { await api.put('/admin/maintenance', null, { params: { enabled, message } }); await fetchStatus(); }
    catch (err) { console.error(err); }
  };

  if (loading) return <div className="flex items-center justify-center h-full text-text-ops-muted">Loading...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <Hammer className="w-6 h-6 text-orange-400" />
          <div><h1 className="text-lg font-semibold text-text-ops-primary">Maintenance Mode</h1>
          <p className="text-sm text-text-ops-muted">Control system maintenance state</p></div>
        </div>
        <button onClick={fetchStatus} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-md space-y-4">
          <div className={`p-6 rounded-lg border text-center ${maintenance?.enabled ? 'bg-red-900/20 border-red-500' : 'bg-green-900/20 border-green-500'}`}>
            <div className="text-4xl mb-2">{maintenance?.enabled ? '🚧' : '✅'}</div>
            <div className="text-xl font-bold text-text-ops-primary">{maintenance?.enabled ? 'Under Maintenance' : 'Operational'}</div>
          </div>
          <div>
            <label className="text-sm text-text-ops-muted">Maintenance Message</label>
            <input value={message} onChange={e => setMessage(e.target.value)}
              className="w-full mt-1 bg-bg-ops-surface border border-border-ops-strong rounded px-3 py-2 text-sm text-text-ops-primary"
              placeholder="System under maintenance" />
          </div>
          <button onClick={() => toggle(!maintenance?.enabled)}
            className={`w-full py-2 rounded text-sm text-white ${maintenance?.enabled ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'}`}>
            {maintenance?.enabled ? 'Disable Maintenance Mode' : 'Enable Maintenance Mode'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MaintenanceModeView;
