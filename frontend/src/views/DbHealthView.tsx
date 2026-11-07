/** DbHealth View — Database health metrics, maintenance operations. Data: /api/v1/admin/db-health/* */
import React, { useState, useEffect, useCallback } from 'react';
import { Database, RefreshCw } from 'lucide-react';
import api from '../services/api';
interface Metric { name: string; value: string; status: string; }
const DbHealthView: React.FC = () => {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const fetch = useCallback(async () => { setLoading(true); try { const d = await api.get('/admin/db-health/metrics'); setMetrics(d.data || []); } catch (e) { console.error(e); } finally { setLoading(false); } }, []);
  useEffect(() => { fetch(); }, [fetch]);
  if (loading) return <div className="flex items-center justify-center h-full text-text-ops-muted">Loading database health...</div>;
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3"><Database className="w-6 h-6 text-blue-400" /><div><h1 className="text-lg font-semibold text-text-ops-primary">Database Health</h1><p className="text-sm text-text-ops-muted">Connection Pool &amp; Maintenance</p></div></div>
        <button onClick={fetch} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-auto p-6"><table className="w-full text-sm"><thead><tr className="border-b border-border-ops-subtle text-text-ops-muted"><th className="text-left py-2 px-3 font-medium">Metric</th><th className="text-left py-2 px-3 font-medium">Value</th><th className="text-left py-2 px-3 font-medium">Status</th></tr></thead><tbody>
        {metrics.map((m, i) => (<tr key={i} className="border-b border-border-ops-subtle hover:bg-bg-ops-overlay"><td className="py-2 px-3 text-text-ops-primary">{m.name}</td><td className="py-2 px-3 font-mono text-text-ops-muted">{m.value}</td><td className="py-2 px-3 text-emerald-400">{m.status}</td></tr>))}
        {metrics.length === 0 && <tr><td colSpan={3} className="py-8 text-center text-text-ops-muted">No metrics available.</td></tr>}
      </tbody></table></div>
    </div>
  );
};
export default DbHealthView;
