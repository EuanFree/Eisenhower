/** Subcontractors View — Subcontractor schedule ingestion, external schedule validation. Data: /api/v1/subcontractors/* */
import React, { useState, useEffect, useCallback } from 'react';
import { Truck, RefreshCw } from 'lucide-react';
import api from '../services/api';
interface Sub { id: string; name: string; status: string; last_ingest?: string; }
const SubcontractorsView: React.FC = () => {
  const [items, setItems] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const fetch = useCallback(async () => { setLoading(true); try { const d = await api.get('/subcontractors/'); setItems(d.data || []); } catch (e) { console.error(e); } finally { setLoading(false); } }, []);
  useEffect(() => { fetch(); }, [fetch]);
  if (loading) return <div className="flex items-center justify-center h-full text-text-ops-muted">Loading subcontractor data...</div>;
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3"><Truck className="w-6 h-6 text-blue-400" /><div><h1 className="text-lg font-semibold text-text-ops-primary">Subcontractors</h1><p className="text-sm text-text-ops-muted">Schedule Ingestion &amp; Validation</p></div></div>
        <button onClick={fetch} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-auto p-6"><table className="w-full text-sm"><thead><tr className="border-b border-border-ops-subtle text-text-ops-muted"><th className="text-left py-2 px-3 font-medium">Name</th><th className="text-left py-2 px-3 font-medium">Status</th><th className="text-left py-2 px-3 font-medium">Last Ingest</th></tr></thead><tbody>
        {items.map(i => (<tr key={i.id} className="border-b border-border-ops-subtle hover:bg-bg-ops-overlay"><td className="py-2 px-3 text-text-ops-primary">{i.name}</td><td className="py-2 px-3 text-text-ops-muted">{i.status}</td><td className="py-2 px-3 text-text-ops-muted text-xs">{i.last_ingest || '—'}</td></tr>))}
        {items.length === 0 && <tr><td colSpan={3} className="py-8 text-center text-text-ops-muted">No subcontractors registered.</td></tr>}
      </tbody></table></div>
    </div>
  );
};
export default SubcontractorsView;
