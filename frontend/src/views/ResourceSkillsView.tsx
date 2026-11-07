/**
 * Resource Skills View
 *
 * Manages generic human resource skill sets. Users can view all defined
 * skills, manage their own skill profiles, and set proficiency levels.
 *
 * Features
 * --------
 * - **Skill Catalog** — Browse all skills organized by category.
 * - **My Skills** — View and edit personal skill proficiency levels.
 * - **Add Skill** — Add a new skill with proficiency and verification status.
 */

import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Award, Plus, Trash2, BookOpen } from 'lucide-react';

interface Skill {
  id: number;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
}

interface MySkill {
  id: number;
  skill_id: number;
  skill_name: string | null;
  category: string | null;
  proficiency_level: number;
  verification_status: string;
  certificate_expiry: string | null;
}

const PROFICIENCY_LABELS: Record<number, string> = {
  1: 'Novice',
  2: 'Intermediate',
  3: 'Competent',
  4: 'Expert',
  5: 'Master',
};

const ResourceSkillsView: React.FC = () => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [mySkills, setMySkills] = useState<MySkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState(0);
  const [proficiency, setProficiency] = useState(1);
  const [verification, setVerification] = useState('SELF_ATTESTED');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [skillsRes, myRes] = await Promise.all([
        api.get('/api/v1/skills'),
        api.get('/api/v1/skills/my-skills'),
      ]);
      setSkills(skillsRes.data.skills || []);
      setMySkills(myRes.data.skills || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!selectedSkill) return;
    try {
      await api.post('/api/v1/skills/add', null, {
        params: { skill_id: selectedSkill, proficiency_level: proficiency, verification_status: verification },
      });
      setShowAdd(false);
      setSelectedSkill(0);
      setProficiency(1);
      loadData();
    } catch {
      // silent
    }
  };

  const handleRemove = async (skillId: number) => {
    try {
      await api.delete(`/api/v1/skills/${skillId}`);
      loadData();
    } catch {
      // silent
    }
  };

  const getMySkillLevel = (skillId: number) => {
    return mySkills.find((s) => s.skill_id === skillId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-text-ops-muted">
        <div className="w-6 h-6 rounded-full border-2 border-border-ops-subtle border-t-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto p-6 gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-ops-primary flex items-center gap-2">
            <Award size={20} />
            Resource Skills
          </h1>
          <p className="text-sm text-text-ops-muted mt-1">Manage skill profiles and proficiency levels</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Add Skill
        </button>
      </div>

      {/* Add Skill Form */}
      {showAdd && (
        <div className="bg-surface-ops-elevated border border-border-ops-subtle rounded-lg p-4">
          <h3 className="text-sm font-semibold text-text-ops-primary mb-3">Add New Skill</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-text-ops-muted mb-1">Skill</label>
              <select
                value={selectedSkill}
                onChange={(e) => setSelectedSkill(Number(e.target.value))}
                className="w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none"
              >
                <option value={0}>Select a skill...</option>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.category})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-ops-muted mb-1">Proficiency</label>
              <select
                value={proficiency}
                onChange={(e) => setProficiency(Number(e.target.value))}
                className="w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none"
              >
                {Object.entries(PROFICIENCY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={handleAdd}
                disabled={!selectedSkill}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 bg-surface-ops-base border border-border-ops-subtle rounded-lg text-sm text-text-ops-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Skills */}
        <div className="bg-surface-ops-elevated border border-border-ops-subtle rounded-lg">
          <div className="p-4 border-b border-border-ops-subtle">
            <h2 className="text-sm font-semibold text-text-ops-primary flex items-center gap-2">
              <Award size={16} />
              My Skills ({mySkills.length})
            </h2>
          </div>
          {mySkills.length === 0 ? (
            <div className="p-8 text-center text-text-ops-muted text-sm">No skills added yet.</div>
          ) : (
            <div className="divide-y divide-border-ops-subtle/50">
              {mySkills.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 hover:bg-surface-ops-base/50">
                  <div>
                    <p className="text-sm text-text-ops-primary font-medium">{s.skill_name || `Skill #${s.skill_id}`}</p>
                    <p className="text-xs text-text-ops-muted">{s.category}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                      {PROFICIENCY_LABELS[s.proficiency_level] || s.proficiency_level}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-surface-ops-elevated text-text-ops-muted rounded">
                      {s.verification_status}
                    </span>
                    <button
                      onClick={() => handleRemove(s.skill_id)}
                      className="p-1 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Skill Catalog */}
        <div className="bg-surface-ops-elevated border border-border-ops-subtle rounded-lg">
          <div className="p-4 border-b border-border-ops-subtle">
            <h2 className="text-sm font-semibold text-text-ops-primary flex items-center gap-2">
              <BookOpen size={16} />
              Skill Catalog ({skills.length})
            </h2>
          </div>
          <div className="max-h-96 overflow-auto">
            {skills.length === 0 ? (
              <div className="p-8 text-center text-text-ops-muted text-sm">No skills defined.</div>
            ) : (
              <div className="divide-y divide-border-ops-subtle/50">
                {skills.map((s) => {
                  const myLevel = getMySkillLevel(s.id);
                  return (
                    <div key={s.id} className="p-3 hover:bg-surface-ops-base/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-text-ops-primary font-medium">{s.name}</p>
                          <p className="text-xs text-text-ops-muted">{s.category} — {s.code}</p>
                          {s.description && (
                            <p className="text-xs text-text-ops-muted mt-1">{s.description}</p>
                          )}
                        </div>
                        {myLevel && (
                          <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                            {PROFICIENCY_LABELS[myLevel.proficiency_level] || myLevel.proficiency_level}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResourceSkillsView;
