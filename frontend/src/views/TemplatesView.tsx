/**
 * Templates Library View
 *
 * WBS structural template and resource crew template management for the
 * Eisenhower Portfolio Manager. Browse, create, snapshot, and instantiate
 * reusable project structures.
 *
 * Layout
 * ------
 * 1. Summary Metrics — Structural templates, crew templates, instantiations
 * 2. Tabbed interface:
 *    - Structural Templates: WBS structure templates with snapshot/instantiate
 *    - Crew Templates: Resource crew templates with role definitions
 *
 * Data Sources
 * ------------
 * - GET /api/v1/templates → List structural templates
 * - POST /api/v1/templates → Create structural template
 * - PUT /api/v1/templates/{id} → Update template
 * - DELETE /api/v1/templates/{id} → Delete template
 * - POST /api/v1/templates/snapshot → Snapshot WBS sub-tree as template
 * - POST /api/v1/templates/instantiate → Instantiate template into schedule
 * - GET /api/v1/templates/crew → List crew templates
 * - POST /api/v1/templates/crew → Create crew template
 * - POST /api/v1/templates/crew/{id}/members → Add role to crew
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  LayoutTemplate,
  Users,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  Copy,
  Play,
  Eye,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StructuralTemplate {
  id: string;
  code: string;
  name: string;
  description: string;
  tier: string;
  revision_version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface CrewMember {
  id: string;
  role_name: string;
  resource_type: string;
  min_proficiency: number;
  default_allocation_fraction: number;
}

interface CrewTemplate {
  id: string;
  code: string;
  name: string;
  description: string;
  is_active: boolean;
  members: CrewMember[];
  created_at: string;
  updated_at: string;
}

type TabKey = 'structural' | 'crew';

const TIER_LABELS: Record<string, string> = {
  PROGRAMME: 'Programme',
  PROJECT: 'Project',
  WORK_PACKAGE: 'Work Package',
  TASK_COLLECTION: 'Task Collection',
};

// ---------------------------------------------------------------------------
// Templates View Component
// ---------------------------------------------------------------------------

const TemplatesView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('structural');
  const [structuralTemplates, setStructuralTemplates] = useState<StructuralTemplate[]>([]);
  const [crewTemplates, setCrewTemplates] = useState<CrewTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateStructural, setShowCreateStructural] = useState(false);
  const [showCreateCrew, setShowCreateCrew] = useState(false);
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [showInstantiate, setShowInstantiate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<StructuralTemplate | null>(null);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchStructural = useCallback(async () => {
    try {
      const res = await api.get('/templates/');
      setStructuralTemplates(res.data?.templates || res.data || []);
    } catch (err) {
      console.error('Failed to fetch structural templates:', err);
    }
  }, []);

  const fetchCrew = useCallback(async () => {
    try {
      const res = await api.get('/templates/crew');
      setCrewTemplates(res.data || []);
    } catch (err) {
      console.error('Failed to fetch crew templates:', err);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStructural(), fetchCrew()]);
    setLoading(false);
  }, [fetchStructural, fetchCrew]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // CRUD operations
  // ---------------------------------------------------------------------------

  const handleCreateStructural = async (template: Partial<StructuralTemplate>) => {
    try {
      const res = await api.post('/templates/', template);
      setStructuralTemplates((prev) => [...prev, res.data]);
      setShowCreateStructural(false);
    } catch (err) {
      console.error('Failed to create template:', err);
    }
  };

  const handleDeleteStructural = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    try {
      await api.delete(`/templates/${id}`);
      setStructuralTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error('Failed to delete template:', err);
    }
  };

  const handleSnapshot = async (data: { node_id: string; code: string; name: string; tier: string }) => {
    try {
      const res = await api.post('/templates/snapshot', data);
      alert(`Template created: ${res.data.code} (${res.data.node_count} nodes, ${res.data.dependency_count} dependencies)`);
      setShowSnapshot(false);
      fetchStructural();
    } catch (err) {
      console.error('Failed to snapshot template:', err);
    }
  };

  const handleInstantiate = async (data: { template_id: string; parent_node_id: string; anchor_date: string; code_prefix: string }) => {
    try {
      const res = await api.post('/templates/instantiate', data);
      alert(`Instantiated: ${res.data.node_count} nodes, ${res.data.dependency_count} dependencies`);
      setShowInstantiate(false);
    } catch (err) {
      console.error('Failed to instantiate template:', err);
    }
  };

  const handleCreateCrew = async (crew: Partial<CrewTemplate>) => {
    try {
      const res = await api.post('/templates/crew', crew);
      setCrewTemplates((prev) => [...prev, res.data]);
      setShowCreateCrew(false);
    } catch (err) {
      console.error('Failed to create crew template:', err);
    }
  };

  const handleDeleteCrew = async (id: string) => {
    if (!confirm('Delete this crew template?')) return;
    try {
      await api.delete(`/templates/crew/${id}`);
      setCrewTemplates((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error('Failed to delete crew template:', err);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-ops-muted">Loading templates...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <LayoutTemplate className="w-6 h-6 text-cyan-400" />
          <div>
            <h1 className="text-lg font-semibold text-text-ops-primary">
              Templates Library
            </h1>
            <p className="text-sm text-text-ops-muted">
              WBS Structures &amp; Resource Crews
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-border-ops-subtle">
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle">
          <div className="flex items-center gap-2 text-text-ops-muted text-sm mb-1">
            <LayoutTemplate className="w-4 h-4" />
            <span>Structural Templates</span>
          </div>
          <div className="text-2xl font-bold text-text-ops-primary">
            {structuralTemplates.length}
          </div>
        </div>
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle">
          <div className="flex items-center gap-2 text-text-ops-muted text-sm mb-1">
            <Users className="w-4 h-4 text-cyan-400" />
            <span>Crew Templates</span>
          </div>
          <div className="text-2xl font-bold text-cyan-400">{crewTemplates.length}</div>
        </div>
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle">
          <div className="flex items-center gap-2 text-text-ops-muted text-sm mb-1">
            <Play className="w-4 h-4 text-emerald-400" />
            <span>Active Templates</span>
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            {structuralTemplates.filter((t) => t.is_active).length +
             crewTemplates.filter((c) => c.is_active).length}
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border-ops-subtle">
        <button
          onClick={() => setShowSnapshot(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-sm transition-colors"
        >
          <Copy className="w-4 h-4" />
          Snapshot WBS
        </button>
        <button
          onClick={() => setShowInstantiate(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm transition-colors"
        >
          <Play className="w-4 h-4" />
          Instantiate
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 border-b border-border-ops-subtle">
        {([
          { key: 'structural', label: 'Structural Templates', icon: LayoutTemplate },
          { key: 'crew', label: 'Crew Templates', icon: Users },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={clsx(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === key
                ? 'border-blue-400 text-blue-400'
                : 'border-transparent text-text-ops-muted hover:text-text-ops-primary'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Structural Templates */}
        {activeTab === 'structural' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-medium text-text-ops-primary">
                WBS Structural Templates — {structuralTemplates.length}
              </h2>
              <button
                onClick={() => setShowCreateStructural(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Template
              </button>
            </div>

            {showCreateStructural && (
              <CreateStructuralForm
                onSubmit={handleCreateStructural}
                onCancel={() => setShowCreateStructural(false)}
              />
            )}

            <div className="grid gap-4">
              {structuralTemplates.map((template) => (
                <div
                  key={template.id}
                  className="bg-bg-ops-surface rounded-lg border border-border-ops-subtle p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-text-ops-primary font-bold">
                        {template.code}
                      </span>
                      <span className="text-text-ops-primary font-medium">
                        {template.name}
                      </span>
                      <span className="px-2 py-0.5 bg-bg-ops-overlay rounded text-xs text-text-ops-muted">
                        {TIER_LABELS[template.tier] || template.tier}
                      </span>
                      <span className="text-xs text-text-ops-muted">
                        v{template.revision_version}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setSelectedTemplate(template);
                          setShowInstantiate(true);
                        }}
                        className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-emerald-400 transition-colors"
                        title="Instantiate"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteStructural(template.id)}
                        className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {template.description && (
                    <p className="text-sm text-text-ops-muted mb-2">{template.description}</p>
                  )}
                  <div className="text-xs text-text-ops-muted">
                    Created: {new Date(template.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
              {structuralTemplates.length === 0 && (
                <div className="py-8 text-center text-text-ops-muted">
                  No structural templates. Create one or snapshot an existing WBS sub-tree.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Crew Templates */}
        {activeTab === 'crew' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-medium text-text-ops-primary">
                Resource Crew Templates — {crewTemplates.length}
              </h2>
              <button
                onClick={() => setShowCreateCrew(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Crew
              </button>
            </div>

            {showCreateCrew && (
              <CreateCrewForm
                onSubmit={handleCreateCrew}
                onCancel={() => setShowCreateCrew(false)}
              />
            )}

            <div className="grid gap-4">
              {crewTemplates.map((crew) => (
                <div
                  key={crew.id}
                  className="bg-bg-ops-surface rounded-lg border border-border-ops-subtle p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-text-ops-primary font-bold">
                        {crew.code}
                      </span>
                      <span className="text-text-ops-primary font-medium">
                        {crew.name}
                      </span>
                      <span className="text-xs text-text-ops-muted">
                        {crew.members.length} roles
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteCrew(crew.id)}
                      className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {crew.description && (
                    <p className="text-sm text-text-ops-muted mb-3">{crew.description}</p>
                  )}
                  {crew.members.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {crew.members.map((member) => (
                        <span
                          key={member.id}
                          className="px-2 py-1 bg-bg-ops-overlay rounded text-xs text-text-ops-muted"
                        >
                          {member.role_name} ({member.resource_type})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {crewTemplates.length === 0 && (
                <div className="py-8 text-center text-text-ops-muted">
                  No crew templates. Create one to define reusable resource teams.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Snapshot Modal */}
      {showSnapshot && (
        <SnapshotModal
          onSubmit={handleSnapshot}
          onCancel={() => setShowSnapshot(false)}
        />
      )}

      {/* Instantiate Modal */}
      {showInstantiate && (
        <InstantiateModal
          preselectedTemplateId={selectedTemplate?.id}
          onSubmit={handleInstantiate}
          onCancel={() => {
            setShowInstantiate(false);
            setSelectedTemplate(null);
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Create Structural Template Form
// ---------------------------------------------------------------------------

interface CreateStructuralFormProps {
  onSubmit: (template: Partial<StructuralTemplate>) => void;
  onCancel: () => void;
}

const CreateStructuralForm: React.FC<CreateStructuralFormProps> = ({ onSubmit, onCancel }) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tier, setTier] = useState('PROJECT');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ code, name, description, tier });
  };

  return (
    <form onSubmit={handleSubmit} className="mb-4 p-4 bg-bg-ops-surface rounded-lg border border-blue-500/30">
      <h3 className="text-sm font-medium text-text-ops-primary mb-3">New Structural Template</h3>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Code</label>
          <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. STD_PROJ_001"
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" required />
        </div>
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" required />
        </div>
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Tier</label>
          <select value={tier} onChange={(e) => setTier(e.target.value)}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary">
            {Object.entries(TIER_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="col-span-3">
          <label className="block text-xs text-text-ops-muted mb-1">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" rows={2} />
        </div>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary">Cancel</button>
        <button type="submit" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm">Create</button>
      </div>
    </form>
  );
};

// ---------------------------------------------------------------------------
// Create Crew Template Form
// ---------------------------------------------------------------------------

interface CreateCrewFormProps {
  onSubmit: (crew: Partial<CrewTemplate>) => void;
  onCancel: () => void;
}

const CreateCrewForm: React.FC<CreateCrewFormProps> = ({ onSubmit, onCancel }) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ code, name, description });
  };

  return (
    <form onSubmit={handleSubmit} className="mb-4 p-4 bg-bg-ops-surface rounded-lg border border-blue-500/30">
      <h3 className="text-sm font-medium text-text-ops-primary mb-3">New Crew Template</h3>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Code</label>
          <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. CREW_TEST_01"
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" required />
        </div>
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" required />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-text-ops-muted mb-1">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" rows={2} />
        </div>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary">Cancel</button>
        <button type="submit" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm">Create</button>
      </div>
    </form>
  );
};

// ---------------------------------------------------------------------------
// Snapshot Modal
// ---------------------------------------------------------------------------

interface SnapshotModalProps {
  onSubmit: (data: { node_id: string; code: string; name: string; tier: string }) => void;
  onCancel: () => void;
}

const SnapshotModal: React.FC<SnapshotModalProps> = ({ onSubmit, onCancel }) => {
  const [nodeId, setNodeId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [tier, setTier] = useState('PROJECT');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ node_id: nodeId, code, name, tier });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bg-ops-surface rounded-lg border border-border-ops-strong p-6 w-full max-w-lg">
        <h2 className="text-lg font-semibold text-text-ops-primary mb-4">
          Snapshot WBS as Template
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-text-ops-muted mb-1">Source Node ID *</label>
              <input type="text" value={nodeId} onChange={(e) => setNodeId(e.target.value)}
                className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-ops-muted mb-1">Template Code *</label>
                <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" required />
              </div>
              <div>
                <label className="block text-xs text-text-ops-muted mb-1">Template Name *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" required />
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-ops-muted mb-1">Tier</label>
              <select value={tier} onChange={(e) => setTier(e.target.value)}
                className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary">
                {Object.entries(TIER_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-ops-muted mb-1">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" rows={2} />
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end mt-4">
            <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary">Cancel</button>
            <button type="submit" className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-sm">Snapshot</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Instantiate Modal
// ---------------------------------------------------------------------------

interface InstantiateModalProps {
  preselectedTemplateId?: string;
  onSubmit: (data: { template_id: string; parent_node_id: string; anchor_date: string; code_prefix: string }) => void;
  onCancel: () => void;
}

const InstantiateModal: React.FC<InstantiateModalProps> = ({ preselectedTemplateId, onSubmit, onCancel }) => {
  const [templateId, setTemplateId] = useState(preselectedTemplateId || '');
  const [parentNodeId, setParentNodeId] = useState('');
  const [anchorDate, setAnchorDate] = useState(new Date().toISOString().split('T')[0]);
  const [codePrefix, setCodePrefix] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ template_id: templateId, parent_node_id: parentNodeId, anchor_date: anchorDate, code_prefix: codePrefix });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bg-ops-surface rounded-lg border border-border-ops-strong p-6 w-full max-w-lg">
        <h2 className="text-lg font-semibold text-text-ops-primary mb-4">
          Instantiate Template
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-text-ops-muted mb-1">Template ID *</label>
              <input type="text" value={templateId} onChange={(e) => setTemplateId(e.target.value)}
                className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" required />
            </div>
            <div>
              <label className="block text-xs text-text-ops-muted mb-1">Parent Node ID *</label>
              <input type="text" value={parentNodeId} onChange={(e) => setParentNodeId(e.target.value)}
                className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-ops-muted mb-1">Anchor Date *</label>
                <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)}
                  className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" required />
              </div>
              <div>
                <label className="block text-xs text-text-ops-muted mb-1">Code Prefix</label>
                <input type="text" value={codePrefix} onChange={(e) => setCodePrefix(e.target.value.toUpperCase())}
                  className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end mt-4">
            <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary">Cancel</button>
            <button type="submit" className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm">Instantiate</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TemplatesView;
