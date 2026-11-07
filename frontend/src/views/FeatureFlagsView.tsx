/** Feature Flags View - Feature flag management. */
import React, { useState, useEffect } from 'react';
import { Flag, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';
import api from '../services/api';

const FeatureFlagsView: React.FC = () => {
  const [flags, setFlags] = useState<any>({});
  const [loading, setLoading] = useState(true);

  const fetchFlags = async () => {
    try { const res = await api.get('/admin/feature-flags'); setFlags(res.data || {}); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchFlags(); }, []);

  const toggle = async (key: string, val: boolean) => {
    try { await api.put(`/admin/feature-flags/${key}`, null, { params: { enabled: val } }); await fetchFlags(); }
    catch (err) { console.error(err); }
  };

  if (loading) return <div className="flex items-center justify-center h-full text-text-ops-muted">Loading...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <Flag className="w-6 h-6 text-pink-400" />
          <div><h1 className="text-lg font-semibold text-text-ops-primary">Feature Flags</h1>
          <p className="text-sm text-text-ops-muted">Toggle features on/off</p></div>
        </div>
        <button onClick={fetchFlags} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-2">
          {Object.entries(flags).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between p-3 bg-bg-ops-surface rounded border border-border-ops-subtle">
              <span className="text-sm text-text-ops-primary">{key}</span>
              <button onClick={() => toggle(key, !(val as boolean))} className="flex items-center gap-2 text-sm">
                {val ? <ToggleRight className="w-5 h-5 text-green-400" /> : <ToggleLeft className="w-5 h-5" />}
                {val ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FeatureFlagsView;
