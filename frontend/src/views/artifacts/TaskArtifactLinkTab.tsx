/**
 * Task Artifact Link Tab — Artifacts & Evidence workbench panel.
 *
 * Displays all external repository artifacts (Windchill, Git, DOORS)
 * linked to the currently selected WBS node.  Provides:
 *
 * - Table listing: Repository Type, Identifier, Title, Version/Rev,
 *   Lifecycle Badge (Draft/Review/Released/Approved/Obsolete),
 *   Verification Hash.
 * - "[Link Repository Artifact]" action button opening a modal for
 *   manual entry or repository search.
 * - "Earned Value Contribution" indicator showing each artifact's
 *   milestone weight percentage.
 * - Deep link button to launch external Windchill/GitLab viewer.
 *
 * Data Flow
 * ---------
 * The component fetches artifact data from the backend via
 * GET /api/v1/artifacts/node/{nodeId} and posts new links via
 * POST /api/v1/artifacts/link.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Link,
  Plus,
  ExternalLink,
  Search,
  X,
  FileText,
  GitBranch,
  BookOpen,
  CheckCircle,
  Loader,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LinkedArtifact {
  id: string;
  portfolio_node_id: string;
  repository_type: string;
  external_identifier: string;
  title: string;
  version_revision: string | null;
  lifecycle_state: string;
  verification_hash: string | null;
  drives_progress: boolean;
  milestone_weight_step_id: string | null;
  milestone_weight: number | null;
  external_url: string | null;
  extra_metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface TaskArtifactLinkTabProps {
  /** UUID of the currently selected WBS node */
  nodeId: string | null;
  /** Node code for display (e.g., "1.2.3") */
  nodeCode?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a CSS class for the lifecycle badge based on state. */
function getLifecycleBadgeClass(state: string) {
  switch (state.toUpperCase()) {
    case 'DRAFT':
      return 'bg-gray-100 text-gray-700 border-gray-300';
    case 'IN_REVIEW':
      return 'bg-amber-50 text-amber-700 border-amber-300';
    case 'RELEASED':
      return 'bg-sky-50 text-sky-700 border-sky-300';
    case 'APPROVED':
      return 'bg-emerald-50 text-emerald-700 border-emerald-300';
    case 'OBSOLETE':
      return 'bg-red-50 text-red-700 border-red-300';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-300';
  }
}

/** Return the icon for a repository type. */
function getRepoIcon(type: string) {
  switch (type.toUpperCase()) {
    case 'WINDCHILL':
      return <FileText size={14} />;
    case 'GIT':
      return <GitBranch size={14} />;
    case 'DOORS':
      return <BookOpen size={14} />;
    default:
      return <Link size={14} />;
  }
}

/** Truncate a hash for display. */
function truncateHash(hash: string | null, len = 12) {
  if (!hash) return '—';
  return hash.length > len ? `${hash.slice(0, len)}…` : hash;
}

// ---------------------------------------------------------------------------
// Link Artifact Modal
// ---------------------------------------------------------------------------

interface LinkModalProps {
  nodeId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const LinkArtifactModal: React.FC<LinkModalProps> = ({ nodeId, onClose, onSuccess }) => {
  const [mode, setMode] = useState<'manual' | 'search'>('manual');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [repositoryType, setRepositoryType] = useState('WINDCHILL');
  const [externalIdentifier, setExternalIdentifier] = useState('');
  const [title, setTitle] = useState('');
  const [versionRevision, setVersionRevision] = useState('');
  const [lifecycleState, setLifecycleState] = useState('DRAFT');
  const [verificationHash, setVerificationHash] = useState('');
  const [drivesProgress, setDrivesProgress] = useState(false);
  const [milestoneWeightStepId, setMilestoneWeightStepId] = useState('');
  const [externalUrl, setExternalUrl] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await api.post('/artifacts/link', {
        portfolio_node_id: nodeId,
        repository_type: repositoryType,
        external_identifier: externalIdentifier,
        title: title || externalIdentifier,
        version_revision: versionRevision || null,
        lifecycle_state: lifecycleState,
        verification_hash: verificationHash || null,
        drives_progress: drivesProgress,
        milestone_weight_step_id: milestoneWeightStepId || null,
        external_url: externalUrl || null,
      });
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to link artifact';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Link Repository Artifact</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Mode toggle */}
        <div className="px-6 pt-4">
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={clsx(
                'px-3 py-1.5 text-sm rounded-md border transition-colors',
                mode === 'manual'
                  ? 'bg-sky-50 border-sky-300 text-sky-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50',
              )}
            >
              Manual Entry
            </button>
            <button
              type="button"
              onClick={() => setMode('search')}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors',
                mode === 'search'
                  ? 'bg-sky-50 border-sky-300 text-sky-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50',
              )}
            >
              <Search size={14} />
              Search Repository
            </button>
          </div>

          {mode === 'search' && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
              Repository search requires a configured connection to the external system.
              Use manual entry to link an artifact by its identifier.
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Repository Type
                </label>
                <select
                  value={repositoryType}
                  onChange={(e) => setRepositoryType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                >
                  <option value="WINDCHILL">Windchill</option>
                  <option value="GIT">Git</option>
                  <option value="DOORS">DOORS</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lifecycle State
                </label>
                <select
                  value={lifecycleState}
                  onChange={(e) => setLifecycleState(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="IN_REVIEW">In Review</option>
                  <option value="RELEASED">Released</option>
                  <option value="APPROVED">Approved</option>
                  <option value="OBSOLETE">Obsolete</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                External Identifier <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={externalIdentifier}
                onChange={(e) => setExternalIdentifier(e.target.value)}
                placeholder="Part Number, Git Tag, or Document ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Human-readable title"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Version / Revision
                </label>
                <input
                  type="text"
                  value={versionRevision}
                  onChange={(e) => setVersionRevision(e.target.value)}
                  placeholder="e.g., A, 1.0, v2.3.0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Verification Hash
                </label>
                <input
                  type="text"
                  value={verificationHash}
                  onChange={(e) => setVerificationHash(e.target.value)}
                  placeholder="SHA-256 hash"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                External URL
              </label>
              <input
                type="text"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://windchill.example.com/..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={drivesProgress}
                  onChange={(e) => setDrivesProgress(e.target.checked)}
                  className="rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                />
                <span className="text-sm text-gray-700">
                  Drives task progress on RELEASED / APPROVED
                </span>
              </label>

              {drivesProgress && (
                <div className="ml-6">
                  <input
                    type="text"
                    value={milestoneWeightStepId}
                    onChange={(e) => setMilestoneWeightStepId(e.target.value)}
                    placeholder="Milestone Weight Step UUID"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm text-white bg-sky-600 rounded-md hover:bg-sky-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader size={14} className="animate-spin" />
                    Linking…
                  </>
                ) : (
                  'Link Artifact'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Tab Component
// ---------------------------------------------------------------------------

const TaskArtifactLinkTab: React.FC<TaskArtifactLinkTabProps> = ({ nodeId, nodeCode }) => {
  const [artifacts, setArtifacts] = useState<LinkedArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [totalContribution, setTotalContribution] = useState(0.0);

  const fetchArtifacts = useCallback(async () => {
    if (!nodeId) return;
    setLoading(true);
    try {
      const data = (await api.get(`/artifacts/node/${nodeId}`)) as { artifacts?: LinkedArtifact[]; total_progress_contribution?: number };
      setArtifacts(data.artifacts || []);
      setTotalContribution(data.total_progress_contribution || 0.0);
    } catch {
      setArtifacts([]);
      setTotalContribution(0.0);
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    fetchArtifacts();
  }, [fetchArtifacts]);

  if (!nodeId) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        Select a task to view linked artifacts
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Artifacts & Evidence
            {nodeCode && <span className="ml-2 text-xs font-mono text-gray-500">{nodeCode}</span>}
          </h3>
          {totalContribution > 0 && (
            <p className="text-xs text-emerald-600 mt-0.5 flex items-center gap-1">
              <CheckCircle size={12} />
              Contributes {Math.round(totalContribution * 100)}% to Task Completion
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowLinkModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-sky-600 rounded-md hover:bg-sky-700 transition-colors"
        >
          <Plus size={14} />
          Link Repository Artifact
        </button>
      </div>

      {/* Artifact Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader size={20} className="animate-spin text-gray-400" />
          </div>
        ) : artifacts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
            <Link size={32} className="opacity-30" />
            <span className="text-sm">No linked artifacts</span>
            <button
              type="button"
              onClick={() => setShowLinkModal(true)}
              className="text-sm text-sky-600 hover:text-sky-700 underline"
            >
              Link your first artifact
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Repository
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Identifier
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Version
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Lifecycle
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Hash
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  EV Contrib.
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {artifacts.map((art) => (
                <tr key={art.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-1.5 text-gray-700">
                      {getRepoIcon(art.repository_type)}
                      {art.repository_type}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-600">
                    {art.external_identifier}
                  </td>
                  <td className="px-4 py-2 text-gray-900 max-w-[200px] truncate">
                    {art.title}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {art.version_revision || '—'}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={clsx(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                        getLifecycleBadgeClass(art.lifecycle_state),
                      )}
                    >
                      {art.lifecycle_state.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">
                    {truncateHash(art.verification_hash)}
                  </td>
                  <td className="px-4 py-2">
                    {art.drives_progress && art.milestone_weight != null ? (
                      <span className="text-xs text-emerald-600 font-medium">
                        +{Math.round(art.milestone_weight * 100)}%
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {art.external_url && (
                      <a
                        href={art.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 transition-colors"
                        title="Open in external viewer"
                      >
                        <ExternalLink size={12} />
                        Open
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Link Modal */}
      {showLinkModal && (
        <LinkArtifactModal
          nodeId={nodeId}
          onClose={() => setShowLinkModal(false)}
          onSuccess={() => {
            setShowLinkModal(false);
            fetchArtifacts();
          }}
        />
      )}
    </div>
  );
};

export default TaskArtifactLinkTab;
