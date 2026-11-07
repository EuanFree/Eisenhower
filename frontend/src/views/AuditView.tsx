/** Audit View — Audit chain integrity verification, forensic investigation, tamper detection. Data: /api/v1/audit/* */
import React, { useState, useEffect, useCallback } from 'react';
import { FileCheck, RefreshCw } from 'lucide-react';
import api from '../services/api';
interface AuditEntry { id: string; action: string; entity: string; user: string; timestamp?: string; hash?: string; }
const AuditView: React.FC = () => {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const fetch = useCallback(async () => { setLoading(true); try { const d = await api.get('/audit/chain'); setItems(d.data || []); } catch (e) { console.error(e); } finally { setLoading(false); } }, []);
  useEffect(() => { fetch(); }, [fetch]);
  if (loading) return <div className="flex items-center justify-center h-full text-text-ops-muted">Loading audit trail...</div>;
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3"><FileCheck className="w-6 h-6 text-emerald-400" /><div><h1 className="text-lg font-semibold text-text-ops-primary">Audit Trail</h1><p className="text-sm text-text-ops-muted">Chain Integrity &amp; Forensics</p></div></div>
        <button onClick={fetch} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-auto p-6"><table className="w-full text-sm"><thead><tr className="border-b border-border-ops-subtle text-text-ops-muted"><th className="text-left py-2 px-3 font-medium">Action</th><th className="text-left py-2 px-3 font-medium">Entity</th><th className="text-left py-2 px-3 font-medium">User</th><th className="text-left py-2 px-3 font-medium">Timestamp</th><th className="text-left py-2 px-3 font-medium">Hash</th></tr></thead><tbody>
        {items.map(i => (<tr key={i.id} className="border-b border-border-ops-subtle hover:bg-bg-ops-overlay"><td className="py-2 px-3 text-text-ops-primary">{i.action}</td><td className="py-2 px-3 text-text-ops-muted">{i.entity}</td><td className="py-2 px-3 text-text-ops-muted">{i.user}</td><td className="py-2 px-3 text-text-ops-muted text-xs">{i.timestamp || '—'}</td><td className="py-2 px-3 font-mono text-text-ops-muted text-xs">{i.hash?.slice(0, 12) || '—'}</td></tr>))}
        {items.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-text-ops-muted">No audit entries.</td></tr>}
      </tbody></table></div>
    </div>
  );
};
export default AuditView;
