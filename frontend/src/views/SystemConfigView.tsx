/** System Config View - Runtime configuration and feature flags. */
import React, { useState, useEffect } from 'react';
import { Settings2, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';
import api from '../services/api';

const SystemConfigView: React.FC = () => {
  const [config, setConfig] = useState<any>({});
  const [flags, setFlags] = useState<any>({});
  const [maintenance, setMaintenance] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const [cfg, flgs, maint] = await Promise.all([
        api.get('/admin/config'),
        api.get('/admin/feature-flags'),
        api.get('/admin/maintenance'),
      ]);
      setConfig(cfg || {});
      setFlags(flgs || {});
      setMaintenance(maint);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const toggleFlag = async (key: string, enabled: boolean) => {
    try { await api.put(`/admin/feature-flags/${key}`, null, { params: { enabled } }); await fetchAll(); }
    catch (err) { console.error(err); }
  };

  const toggleMaintenance = async (enabled: boolean) => {
    try { await api.put('/admin/maintenance', null, { params: { enabled } }); await fetchAll(); }
    catch (err) { console.error(err); }
  };

  if (loading) return <div className="flex items-center justify-center h-full text-text-ops-muted">Loading config...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <Settings2 className="w-6 h-6 text-purple-400" />
          <div><h1 className="text-lg font-semibold text-text-ops-primary">System Configuration</h1>
          <p className="text-sm text-text-ops-muted">Runtime settings &amp; feature flags</p></div>
        </div>
        <button onClick={fetchAll} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div>
          <h2 className="text-base font-medium text-text-ops-primary mb-3">Feature Flags</h2>
          <div className="space-y-2">
            {Object.entries(flags).map(([key, val]) => (
              <div key={key} className="flex items-center justify-between p-3 bg-bg-ops-surface rounded border border-border-ops-subtle">
                <span className="text-sm text-text-ops-primary">{key}</span>
                <button onClick={() => toggleFlag(key, !(val as boolean))}
                  className="flex items-center gap-2 text-sm text-text-ops-muted">
                  {val ? <ToggleRight className="w-5 h-5 text-green-400" /> : <ToggleLeft className="w-5 h-5" />}
                  {val ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-base font-medium text-text-ops-primary mb-3">Maintenance Mode</h2>
          <div className="flex items-center justify-between p-3 bg-bg-ops-surface rounded border border-border-ops-subtle">
            <div>
              <div className="text-sm text-text-ops-primary">{maintenance?.enabled ? '🚧 Under Maintenance' : '✅ Operational'}</div>
              {maintenance?.message && <div className="text-xs text-text-ops-muted">{maintenance.message}</div>}
            </div>
            <button onClick={() => toggleMaintenance(!maintenance?.enabled)}
              className={`px-3 py-1 rounded text-sm ${maintenance?.enabled ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'} text-white`}>
              {maintenance?.enabled ? 'Disable' : 'Enable'}
            </button>
          </div>
        </div>
        <div>
          <h2 className="text-base font-medium text-text-ops-primary mb-3">Configuration</h2>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(config).map(([key, val]) => (
              <div key={key} className="p-3 bg-bg-ops-surface rounded border border-border-ops-subtle">
                <div className="text-xs text-text-ops-muted">{key}</div>
                <div className="text-sm text-text-ops-primary font-mono">{JSON.stringify(val)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemConfigView;
