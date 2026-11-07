/** User Management View - User CRUD interface for administrators. */
import React, { useState, useCallback, useEffect } from 'react';
import { Users, Plus, Edit, Trash2, RefreshCw } from 'lucide-react';
import api from '../services/api';

const UserManagementView: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    try { const data = await api.get('/admin/users'); setUsers(data.data || []); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this user?')) return;
    try { await api.delete(`/admin/users/${id}`); await fetchUsers(); }
    catch (err) { console.error(err); }
  };

  if (loading) return <div className="flex items-center justify-center h-full text-text-ops-muted">Loading users...</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-blue-400" />
          <div><h1 className="text-lg font-semibold text-text-ops-primary">User Management</h1>
          <p className="text-sm text-text-ops-muted">Manage system users</p></div>
        </div>
        <button onClick={fetchUsers} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border-ops-subtle text-text-ops-muted">
            <th className="text-left py-2 px-3 font-medium">Username</th>
            <th className="text-left py-2 px-3 font-medium">Email</th>
            <th className="text-left py-2 px-3 font-medium">Role</th>
            <th className="text-left py-2 px-3 font-medium">Active</th>
            <th className="text-right py-2 px-3 font-medium">Actions</th>
          </tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-border-ops-subtle hover:bg-bg-ops-overlay">
                <td className="py-2 px-3 text-text-ops-primary">{u.username}</td>
                <td className="py-2 px-3 text-text-ops-muted">{u.email}</td>
                <td className="py-2 px-3"><span className="px-2 py-0.5 bg-bg-ops-overlay rounded text-xs">{u.role}</span></td>
                <td className="py-2 px-3">{u.active ? '✅' : '❌'}</td>
                <td className="py-2 px-3 text-right">
                  <button onClick={() => handleDelete(u.id)} className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-text-ops-muted">No users found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UserManagementView;
