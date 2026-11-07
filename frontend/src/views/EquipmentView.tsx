/** Equipment Management View — Calibration tracking, maintenance schedules, equipment lifecycle. Data: /api/v1/equipment/* */
import React, { useState, useEffect, useCallback } from 'react';
import { Wrench, AlertTriangle, CheckCircle, Clock, Plus, RefreshCw } from 'lucide-react';
import api from '../services/api';
interface Equipment { id: string; tag: string; name: string; status: string; next_calibration?: string; last_maintenance?: string; location?: string; }
const EquipmentView: React.FC = () => {
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const fetch = useCallback(async () => { setLoading(true); try { const d = await api.get('/equipment/'); setItems(d.data || []); } catch (e) { console.error(e); } finally { setLoading(false); } }, []);
  useEffect(() => { fetch(); }, [fetch]);
  if (loading) return <div className="flex items-center justify-center h-full text-text-ops-muted">Loading equipment data...</div>;
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3"><Wrench className="w-6 h-6 text-orange-400" /><div><h1 className="text-lg font-semibold text-text-ops-primary">Equipment Management</h1><p className="text-sm text-text-ops-muted">Calibration &amp; Maintenance Tracking</p></div></div>
        <button onClick={fetch} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-border-ops-subtle">
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle"><div className="text-text-ops-muted text-sm mb-1">Total Equipment</div><div className="text-2xl font-bold text-text-ops-primary">{items.length}</div></div>
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle"><div className="text-text-ops-muted text-sm mb-1">Due Calibration</div><div className="text-2xl font-bold text-amber-400">{items.filter(i => i.next_calibration && i.next_calibration < new Date().toISOString().split('T')[0]).length}</div></div>
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle"><div className="text-text-ops-muted text-sm mb-1">Operational</div><div className="text-2xl font-bold text-emerald-400">{items.filter(i => i.status === 'OPERATIONAL').length}</div></div>
      </div>
      <div className="flex-1 overflow-auto p-6"><table className="w-full text-sm"><thead><tr className="border-b border-border-ops-subtle text-text-ops-muted"><th className="text-left py-2 px-3 font-medium">Tag</th><th className="text-left py-2 px-3 font-medium">Name</th><th className="text-left py-2 px-3 font-medium">Status</th><th className="text-left py-2 px-3 font-medium">Next Calibration</th><th className="text-left py-2 px-3 font-medium">Location</th></tr></thead><tbody>
        {items.map(i => (<tr key={i.id} className="border-b border-border-ops-subtle hover:bg-bg-ops-overlay"><td className="py-2 px-3 font-mono text-text-ops-primary">{i.tag}</td><td className="py-2 px-3 text-text-ops-primary">{i.name}</td><td className="py-2 px-3 text-text-ops-muted">{i.status}</td><td className="py-2 px-3 text-text-ops-muted text-xs">{i.next_calibration || '—'}</td><td className="py-2 px-3 text-text-ops-muted text-xs">{i.location || '—'}</td></tr>))}
        {items.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-text-ops-muted">No equipment registered.</td></tr>}
      </tbody></table></div>
    </div>
  );
};
export default EquipmentView;
