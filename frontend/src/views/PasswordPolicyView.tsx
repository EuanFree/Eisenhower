/** Password Policy View - Password policy and 2FA management. */
import React, { useState, useEffect } from 'react';
import { Key, RefreshCw } from 'lucide-react';
import api from '../services/api';

const PasswordPolicyView: React.FC = () => {
  const [policy, setPolicy] = useState<any>({});
  const [loading, setLoading] = useState(true);

  const fetchPolicy = async () => {
    try { const res = await api.get('/admin/password/policy'); setPolicy(res.data); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchPolicy(); }, []);

  if (loading) return <div className="flex items-center justify-center h-full text-text-ops-muted">Loading...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <Key className="w-6 h-6 text-orange-400" />
          <div><h1 className="text-lg font-semibold text-text-ops-primary">Password Policy</h1>
          <p className="text-sm text-text-ops-muted">Password complexity &amp; 2FA settings</p></div>
        </div>
        <button onClick={fetchPolicy} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-4">
          {Object.entries(policy).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between p-3 bg-bg-ops-surface rounded border border-border-ops-subtle">
              <span className="text-sm text-text-ops-primary capitalize">{key.replace(/_/g, ' ')}</span>
              <span className="text-sm font-mono text-text-ops-muted">{JSON.stringify(val)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PasswordPolicyView;
