/**
 * Backup Manager View
 *
 * Database backup and restore management interface.
 * Provides backup creation, listing, verification, and restore capabilities.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { HardDrive, Plus, Trash2, RefreshCw, Shield, Download } from 'lucide-react';
import api from '../services/api';

interface Backup {
  backup_id: string;
  file_path: string;
  size_bytes: number;
  created_at: string;
  duration_seconds: number;
  checksum: string;
  verified: boolean;
  backup_type: string;
}

const BackupManagerView: React.FC = () => {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchBackups = useCallback(async () => {
    try {
      const res = await api.get('/admin/backups');
      setBackups(res.data || []);
    } catch (err) {
      console.error('Failed to fetch backups:', err);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/admin/backups/status');
      setStatus(res.data);
    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchBackups(), fetchStatus()]).finally(() => setLoading(false));
  }, [fetchBackups, fetchStatus]);

  const handleCreateBackup = async () => {
    setCreating(true);
    try {
      await api.post('/admin/backups');
      await fetchBackups();
      await fetchStatus();
    } catch (err) {
      console.error('Failed to create backup:', err);
    }
    setCreating(false);
  };

  const handleDeleteBackup = async (id: string) => {
    if (!confirm(`Delete backup ${id}?`)) return;
    try {
      await api.delete(`/admin/backups/${id}`);
      await fetchBackups();
      await fetchStatus();
    } catch (err) {
      console.error('Failed to delete backup:', err);
    }
  };

  const handleVerifyBackup = async (id: string) => {
    try {
      const res = await api.post(`/admin/backups/${id}/verify`);
      alert(res.data?.valid ? 'Backup verified!' : `Verification failed: ${res.data?.message}`);
      await fetchBackups();
    } catch (err) {
      console.error('Failed to verify backup:', err);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-text-ops-muted">Loading backup data...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <HardDrive className="w-6 h-6 text-blue-400" />
          <div>
            <h1 className="text-lg font-semibold text-text-ops-primary">Backup Manager</h1>
            <p className="text-sm text-text-ops-muted">Database backup &amp; restore</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchBackups(); fetchStatus(); }}
            className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleCreateBackup}
            disabled={creating}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {creating ? 'Creating...' : 'New Backup'}
          </button>
        </div>
      </div>

      {status && (
        <div className="grid grid-cols-4 gap-4 px-6 py-4 border-b border-border-ops-subtle">
          <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle">
            <div className="text-sm text-text-ops-muted">Total Backups</div>
            <div className="text-2xl font-bold text-text-ops-primary">{status.total_backups}</div>
          </div>
          <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle">
            <div className="text-sm text-text-ops-muted">Latest Backup</div>
            <div className="text-lg font-bold text-text-ops-primary">
              {status.latest_backup ? new Date(status.latest_backup).toLocaleDateString() : 'Never'}
            </div>
          </div>
          <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle">
            <div className="text-sm text-text-ops-muted">Total Size</div>
            <div className="text-2xl font-bold text-text-ops-primary">{formatSize(status.total_size_bytes)}</div>
          </div>
          <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle">
            <div className="text-sm text-text-ops-muted">Retention</div>
            <div className="text-2xl font-bold text-text-ops-primary">{status.retention_days} days</div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-ops-subtle text-text-ops-muted">
              <th className="text-left py-2 px-3 font-medium">Backup ID</th>
              <th className="text-left py-2 px-3 font-medium">Type</th>
              <th className="text-left py-2 px-3 font-medium">Size</th>
              <th className="text-left py-2 px-3 font-medium">Created</th>
              <th className="text-left py-2 px-3 font-medium">Duration</th>
              <th className="text-left py-2 px-3 font-medium">Verified</th>
              <th className="text-right py-2 px-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.backup_id} className="border-b border-border-ops-subtle hover:bg-bg-ops-overlay">
                <td className="py-2 px-3 font-mono text-text-ops-primary">{b.backup_id}</td>
                <td className="py-2 px-3"><span className="px-2 py-0.5 bg-bg-ops-overlay rounded text-xs">{b.backup_type}</span></td>
                <td className="py-2 px-3 text-text-ops-primary">{formatSize(b.size_bytes)}</td>
                <td className="py-2 px-3 text-text-ops-muted text-xs">{new Date(b.created_at).toLocaleString()}</td>
                <td className="py-2 px-3 text-text-ops-muted">{b.duration_seconds.toFixed(1)}s</td>
                <td className="py-2 px-3">
                  {b.verified ? <Shield className="w-4 h-4 text-green-400" /> : <span className="text-text-ops-muted">—</span>}
                </td>
                <td className="py-2 px-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => handleVerifyBackup(b.backup_id)} className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-green-400" title="Verify">
                      <Shield className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDeleteBackup(b.backup_id)} className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-red-400" title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {backups.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-text-ops-muted">No backups found. Create your first backup.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BackupManagerView;
