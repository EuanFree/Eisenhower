/** Alerting View - Alert rules and notification channels management. */
import React, { useState, useEffect } from 'react';
import { Bell, Plus, Trash2, RefreshCw } from 'lucide-react';
import api from '../services/api';

const AlertingView: React.FC = () => {
  const [rules, setRules] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const [r, c] = await Promise.all([api.get('/admin/alerting/rules'), api.get('/admin/alerting/channels')]);
      setRules(r.data || []); setChannels(c.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchAll(); }, []);

  const deleteRule = async (id: string) => {
    try { await api.delete(`/admin/alerting/rules/${id}`); await fetchAll(); }
    catch (err) { console.error(err); }
  };

  if (loading) return <div className="flex items-center justify-center h-full text-text-ops-muted">Loading...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-yellow-400" />
          <div><h1 className="text-lg font-semibold text-text-ops-primary">Alerting &amp; Notifications</h1>
          <p className="text-sm text-text-ops-muted">Alert rules &amp; notification channels</p></div>
        </div>
        <button onClick={fetchAll} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div>
          <h2 className="text-base font-medium text-text-ops-primary mb-3">Alert Rules ({rules.length})</h2>
          {rules.length === 0 ? <div className="text-text-ops-muted text-sm">No alert rules configured</div> : (
            <div className="space-y-2">
              {rules.map(r => (
                <div key={r.id} className="flex items-center justify-between p-3 bg-bg-ops-surface rounded border border-border-ops-subtle">
                  <div><div className="text-sm text-text-ops-primary">{r.name}</div>
                  <div className="text-xs text-text-ops-muted">{r.condition} &gt; {r.threshold}</div></div>
                  <button onClick={() => deleteRule(r.id)} className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <h2 className="text-base font-medium text-text-ops-primary mb-3">Notification Channels ({channels.length})</h2>
          {channels.length === 0 ? <div className="text-text-ops-muted text-sm">No notification channels configured</div> : (
            <div className="space-y-2">
              {channels.map(c => (
                <div key={c.id} className="p-3 bg-bg-ops-surface rounded border border-border-ops-subtle">
                  <div className="text-sm text-text-ops-primary">{c.name}</div>
                  <div className="text-xs text-text-ops-muted">{c.type}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AlertingView;
