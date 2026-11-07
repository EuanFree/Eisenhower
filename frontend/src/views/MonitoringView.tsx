/** Monitoring View - System metrics dashboard (CPU, memory, disk). */
import React, { useState, useEffect } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import api from '../services/api';

const MonitoringView: React.FC = () => {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    try { const res = await api.get('/admin/monitoring/metrics'); setMetrics(res.data); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchMetrics(); }, []);

  const formatBytes = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024*1024) return `${(b/1024).toFixed(1)} KB`;
    if (b < 1024*1024*1024) return `${(b/(1024*1024)).toFixed(1)} MB`;
    return `${(b/(1024*1024*1024)).toFixed(1)} GB`;
  };

  if (loading) return <div className="flex items-center justify-center h-full text-text-ops-muted">Loading metrics...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-cyan-400" />
          <div><h1 className="text-lg font-semibold text-text-ops-primary">Monitoring &amp; Metrics</h1>
          <p className="text-sm text-text-ops-muted">System resource usage</p></div>
        </div>
        <button onClick={fetchMetrics} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-bg-ops-surface rounded-lg border border-border-ops-subtle">
            <div className="text-sm text-text-ops-muted mb-2">CPU Usage</div>
            <div className="text-3xl font-bold text-text-ops-primary">{metrics?.cpu?.percent || 0}%</div>
            <div className="text-xs text-text-ops-muted">{metrics?.cpu?.cores || 0} cores</div>
            <div className="mt-2 h-2 bg-bg-ops-overlay rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${metrics?.cpu?.percent || 0}%` }} />
            </div>
          </div>
          <div className="p-4 bg-bg-ops-surface rounded-lg border border-border-ops-subtle">
            <div className="text-sm text-text-ops-muted mb-2">Memory Usage</div>
            <div className="text-3xl font-bold text-text-ops-primary">{metrics?.memory?.percent || 0}%</div>
            <div className="text-xs text-text-ops-muted">{formatBytes(metrics?.memory?.used || 0)} / {formatBytes(metrics?.memory?.total || 0)}</div>
            <div className="mt-2 h-2 bg-bg-ops-overlay rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full" style={{ width: `${metrics?.memory?.percent || 0}%` }} />
            </div>
          </div>
          <div className="p-4 bg-bg-ops-surface rounded-lg border border-border-ops-subtle">
            <div className="text-sm text-text-ops-muted mb-2">Disk Usage</div>
            <div className="text-3xl font-bold text-text-ops-primary">{metrics?.disk?.percent || 0}%</div>
            <div className="text-xs text-text-ops-muted">{formatBytes(metrics?.disk?.used || 0)} / {formatBytes(metrics?.disk?.total || 0)}</div>
            <div className="mt-2 h-2 bg-bg-ops-overlay rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: `${metrics?.disk?.percent || 0}%` }} />
            </div>
          </div>
        </div>
        {metrics && (
          <div className="p-4 bg-bg-ops-surface rounded-lg border border-border-ops-subtle">
            <div className="text-sm text-text-ops-muted">Hostname: {metrics.hostname}</div>
            <div className="text-xs text-text-ops-muted">Last updated: {metrics.timestamp}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MonitoringView;
