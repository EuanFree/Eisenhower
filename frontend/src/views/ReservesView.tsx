/** Reserves Dashboard View — Management reserve budget tracking, drawdown requests, reserve consumption. Data: /api/v1/reserves/* */
import React, { useState, useEffect, useCallback } from 'react';
import { DollarSign, RefreshCw } from 'lucide-react';
import api from '../services/api';
interface Reserve { id: string; name: string; total_budget: number; consumed: number; available: number; drawdown_count: number; }
const ReservesView: React.FC = () => {
  const [items, setItems] = useState<Reserve[]>([]);
  const [loading, setLoading] = useState(true);
  const fetch = useCallback(async () => { setLoading(true); try { const d = await api.get('/reserves/'); setItems(d.data || []); } catch (e) { console.error(e); } finally { setLoading(false); } }, []);
  useEffect(() => { fetch(); }, [fetch]);
  const fmt = (v: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(v);
  if (loading) return <div className="flex items-center justify-center h-full text-text-ops-muted">Loading reserves data...</div>;
  const total = items.reduce((s, i) => s + i.total_budget, 0);
  const consumed = items.reduce((s, i) => s + i.consumed, 0);
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3"><DollarSign className="w-6 h-6 text-emerald-400" /><div><h1 className="text-lg font-semibold text-text-ops-primary">Management Reserves</h1><p className="text-sm text-text-ops-muted">Reserve Budget &amp; Drawdown Tracking</p></div></div>
        <button onClick={fetch} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-border-ops-subtle">
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle"><div className="text-text-ops-muted text-sm mb-1">Total Reserve</div><div className="text-2xl font-bold text-text-ops-primary">{fmt(total)}</div></div>
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle"><div className="text-text-ops-muted text-sm mb-1">Consumed</div><div className="text-2xl font-bold text-amber-400">{fmt(consumed)}</div></div>
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle"><div className="text-text-ops-muted text-sm mb-1">Available</div><div className="text-2xl font-bold text-emerald-400">{fmt(total - consumed)}</div></div>
      </div>
      <div className="flex-1 overflow-auto p-6"><table className="w-full text-sm"><thead><tr className="border-b border-border-ops-subtle text-text-ops-muted"><th className="text-left py-2 px-3 font-medium">Name</th><th className="text-right py-2 px-3 font-medium">Budget</th><th className="text-right py-2 px-3 font-medium">Consumed</th><th className="text-right py-2 px-3 font-medium">Available</th><th className="text-center py-2 px-3 font-medium">Drawdowns</th></tr></thead><tbody>
        {items.map(i => (<tr key={i.id} className="border-b border-border-ops-subtle hover:bg-bg-ops-overlay"><td className="py-2 px-3 text-text-ops-primary">{i.name}</td><td className="py-2 px-3 text-right font-mono text-text-ops-primary">{fmt(i.total_budget)}</td><td className="py-2 px-3 text-right font-mono text-amber-400">{fmt(i.consumed)}</td><td className="py-2 px-3 text-right font-mono text-emerald-400">{fmt(i.available)}</td><td className="py-2 px-3 text-center text-text-ops-muted">{i.drawdown_count}</td></tr>))}
        {items.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-text-ops-muted">No reserves configured.</td></tr>}
      </tbody></table></div>
    </div>
  );
};
export default ReservesView;
