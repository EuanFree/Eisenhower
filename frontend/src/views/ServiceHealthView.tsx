/** Service Health View - Backend service health monitoring dashboard. */
import React, { useState, useEffect } from 'react';
import { HeartPulse, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import api from '../services/api';

const ServiceHealthView: React.FC = () => {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    try { const res = await api.get('/admin/health'); setHealth(res.data); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchHealth(); }, []);

  if (loading) return <div className="flex items-center justify-center h-full text-text-ops-muted">Loading health data...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <HeartPulse className="w-6 h-6 text-green-400" />
          <div><h1 className="text-lg font-semibold text-text-ops-primary">Service Health</h1>
          <p className="text-sm text-text-ops-muted">Backend service status</p></div>
        </div>
        <button onClick={fetchHealth} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="mb-6 p-4 rounded-lg border"
          style={{ backgroundColor: health?.overall_healthy ? '#064e3b20' : '#7f1d1d20', borderColor: health?.overall_healthy ? '#059669' : '#dc2626' }}>
          <div className="flex items-center gap-2">
            {health?.overall_healthy ? <CheckCircle className="w-6 h-6 text-green-400" /> : <XCircle className="w-6 h-6 text-red-400" />}
            <span className="text-lg font-semibold">{health?.overall_healthy ? 'All Services Healthy' : 'Service Issues Detected'}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {health?.services && Object.entries(health.services).map(([name, svc]: [string, any]) => (
            <div key={name} className="p-4 bg-bg-ops-surface rounded-lg border border-border-ops-subtle">
              <div className="flex items-center gap-2 mb-2">
                {svc.healthy ? <CheckCircle className="w-5 h-5 text-green-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
                <span className="font-medium text-text-ops-primary capitalize">{name}</span>
              </div>
              <div className="text-sm text-text-ops-muted">{svc.message}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ServiceHealthView;
