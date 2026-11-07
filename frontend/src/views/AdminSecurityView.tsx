/** AdminSecurity View — Security heartbeat, data spillage purge, security audit. Data: /api/v1/admin/security/* */
import React, { useState, useEffect, useCallback } from 'react';
import { Shield, RefreshCw } from 'lucide-react';
import api from '../services/api';
interface SecurityEvent { id: string; type: string; message: string; severity: string; timestamp?: string; }
const AdminSecurityView: React.FC = () => {
  const [items, setItems] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const fetch = useCallback(async () => { setLoading(true); try { const d = await api.get('/admin/security/events'); setItems(d.data || []); } catch (e) { console.error(e); } finally { setLoading(false); } }, []);
  useEffect(() => { fetch(); }, [fetch]);
  if (loading) return <div className="flex items-center justify-center h-full text-text-ops-muted">Loading security data...</div>;
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3"><Shield className="w-6 h-6 text-red-400" /><div><h1 className="text-lg font-semibold text-text-ops-primary">Admin Security</h1><p className="text-sm text-text-ops-muted">System Health &amp; Spillage Purge</p></div></div>
        <button onClick={fetch} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-auto p-6"><table className="w-full text-sm"><thead><tr className="border-b border-border-ops-subtle text-text-ops-muted"><th className="text-left py-2 px-3 font-medium">Type</th><th className="text-left py-2 px-3 font-medium">Message</th><th className="text-left py-2 px-3 font-medium">Severity</th><th className="text-left py-2 px-3 font-medium">Timestamp</th></tr></thead><tbody>
        {items.map(i => (<tr key={i.id} className="border-b border-border-ops-subtle hover:bg-bg-ops-overlay"><td className="py-2 px-3 text-text-ops-primary">{i.type}</td><td className="py-2 px-3 text-text-ops-muted">{i.message}</td><td className="py-2 px-3 text-red-400">{i.severity}</td><td className="py-2 px-3 text-text-ops-muted text-xs">{i.timestamp || '—'}</td></tr>))}
        {items.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-text-ops-muted">No security events.</td></tr>}
      </tbody></table></div>
    </div>
  );
};
export default AdminSecurityView;
