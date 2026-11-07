/** Materials Management View — Perishable materials tracking, clearance lifecycle, material expiry. Data: /api/v1/materials/* */
import React, { useState, useEffect, useCallback } from 'react';
import { Package, AlertTriangle, RefreshCw } from 'lucide-react';
import api from '../services/api';
interface Material { id: string; code: string; name: string; status: string; quantity: number; unit: string; expiry_date?: string; clearance_status?: string; }
const MaterialsView: React.FC = () => {
  const [items, setItems] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const fetch = useCallback(async () => { setLoading(true); try { const d = await api.get('/materials/'); setItems(d.data || []); } catch (e) { console.error(e); } finally { setLoading(false); } }, []);
  useEffect(() => { fetch(); }, [fetch]);
  const today = new Date().toISOString().split('T')[0];
  const expiring = items.filter(i => i.expiry_date && i.expiry_date < today).length;
  if (loading) return <div className="flex items-center justify-center h-full text-text-ops-muted">Loading materials data...</div>;
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3"><Package className="w-6 h-6 text-teal-400" /><div><h1 className="text-lg font-semibold text-text-ops-primary">Materials Management</h1><p className="text-sm text-text-ops-muted">Inventory &amp; Expiry Tracking</p></div></div>
        <button onClick={fetch} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-border-ops-subtle">
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle"><div className="text-text-ops-muted text-sm mb-1">Total Materials</div><div className="text-2xl font-bold text-text-ops-primary">{items.length}</div></div>
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle"><div className="text-text-ops-muted text-sm mb-1">Expiring / Expired</div><div className="text-2xl font-bold text-red-400">{expiring}</div></div>
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle"><div className="text-text-ops-muted text-sm mb-1">In Stock</div><div className="text-2xl font-bold text-emerald-400">{items.filter(i => i.quantity > 0).length}</div></div>
      </div>
      <div className="flex-1 overflow-auto p-6"><table className="w-full text-sm"><thead><tr className="border-b border-border-ops-subtle text-text-ops-muted"><th className="text-left py-2 px-3 font-medium">Code</th><th className="text-left py-2 px-3 font-medium">Name</th><th className="text-left py-2 px-3 font-medium">Qty</th><th className="text-left py-2 px-3 font-medium">Expiry</th><th className="text-left py-2 px-3 font-medium">Clearance</th></tr></thead><tbody>
        {items.map(i => (<tr key={i.id} className="border-b border-border-ops-subtle hover:bg-bg-ops-overlay"><td className="py-2 px-3 font-mono text-text-ops-primary">{i.code}</td><td className="py-2 px-3 text-text-ops-primary">{i.name}</td><td className="py-2 px-3 text-text-ops-muted">{i.quantity} {i.unit}</td><td className="py-2 px-3 text-text-ops-muted text-xs">{i.expiry_date || '—'}</td><td className="py-2 px-3 text-text-ops-muted text-xs">{i.clearance_status || '—'}</td></tr>))}
        {items.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-text-ops-muted">No materials registered.</td></tr>}
      </tbody></table></div>
    </div>
  );
};
export default MaterialsView;
