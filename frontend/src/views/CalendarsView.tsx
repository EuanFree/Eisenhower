/**
 * Calendars View — Work Pattern Templates & Resource Assignments.
 *
 * Full-featured GUI for managing work pattern templates with:
 * - Template list with category filtering and search
 * - Template editor with per-day-of-week calendar grid
 * - Resource assignment panel
 * - Default pattern management
 * - Weekly hours summary
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Plus, Edit3, Trash2, Star, StarOff, Users,
  Clock, ChevronRight, ChevronDown, RefreshCw, Search,
  CheckCircle2, XCircle, AlertTriangle, Save, X
} from 'lucide-react';
import api from '../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkPatternDay {
  id: string;
  day_of_week: number;
  hours: number;
  start_time: string | null;
  end_time: string | null;
}

interface WorkPatternTemplate {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  version: number;
  is_default: boolean;
  is_active: boolean;
  days: WorkPatternDay[];
  resource_count: number;
  created_at: string;
  updated_at: string;
}

interface ResourceAssignment {
  id: string;
  resource_node_id: string;
  resource_name: string;
  template_id: string;
  template_name: string;
  effective_from: string;
  effective_to: string | null;
  override_hours: Record<string, number> | null;
  priority: number;
  notes: string | null;
  created_at: string;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const CATEGORIES = [
  { value: 'STANDARD', label: 'Standard', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  { value: 'SHIFT', label: 'Shift', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { value: 'PART_TIME', label: 'Part-Time', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  { value: 'OVERTIME', label: 'Overtime', color: 'bg-red-500/20 text-red-300 border-red-500/30' },
  { value: 'CUSTOM', label: 'Custom', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
];

const CATEGORY_MAP: Record<string, string> = Object.fromEntries(CATEGORIES.map(c => [c.value, c.color]));

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Per-day editor row inside the template editor */
const DayEditorRow: React.FC<{
  dayOfWeek: number;
  hours: number;
  startTime: string;
  endTime: string;
  onChange: (dow: number, field: string, value: string) => void;
}> = ({ dayOfWeek, hours, startTime, endTime, onChange }) => {
  const isWorking = hours > 0;
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
      isWorking ? 'bg-bg-ops-overlay' : 'bg-bg-ops-surface/30 opacity-60'
    }`}>
      <div className="w-16 text-sm font-medium text-text-ops-primary">{DAY_FULL[dayOfWeek]}</div>
      <div className="flex-1 flex items-center gap-2">
        <label className="text-xs text-text-ops-muted w-14">Hours</label>
        <input
          type="number"
          min={0}
          max={24}
          step={0.5}
          value={hours || ''}
          onChange={e => onChange(dayOfWeek, 'hours', e.target.value)}
          className="w-20 px-2 py-1 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <div className="flex-1 flex items-center gap-2">
        <label className="text-xs text-text-ops-muted w-14">Start</label>
        <input
          type="time"
          value={startTime}
          onChange={e => onChange(dayOfWeek, 'start_time', e.target.value)}
          className="w-24 px-2 py-1 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <div className="flex-1 flex items-center gap-2">
        <label className="text-xs text-text-ops-muted w-14">End</label>
        <input
          type="time"
          value={endTime}
          onChange={e => onChange(dayOfWeek, 'end_time', e.target.value)}
          className="w-24 px-2 py-1 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <div className="w-20 text-right text-sm font-mono text-text-ops-muted">
        {isWorking ? `${hours}h` : '—'}
      </div>
    </div>
  );
};

/** Mini weekly calendar heatmap for a template */
const WeeklyCalendarHeatmap: React.FC<{ days: WorkPatternDay[] }> = ({ days }) => {
  const maxHours = Math.max(...days.map(d => d.hours), 1);
  return (
    <div className="flex gap-1">
      {days.map(d => {
        const intensity = d.hours / maxHours;
        const barHeight = d.hours > 0 ? Math.max(8, intensity * 40) : 2;
        return (
          <div key={d.day_of_week} className="flex flex-col items-center gap-1">
            <div
              className="w-8 rounded-t transition-all"
              style={{
                height: `${barHeight}px`,
                backgroundColor: d.hours > 0
                  ? `rgba(99, 102, 241, ${0.3 + intensity * 0.7})`
                  : 'rgba(100,116,139,0.15)',
              }}
            />
            <span className="text-[10px] text-text-ops-muted">{DAY_NAMES[d.day_of_week]}</span>
          </div>
        );
      })}
    </div>
  );
};

/** Template editor modal */
const TemplateEditor: React.FC<{
  template: WorkPatternTemplate | null;
  onSave: (data: any) => void;
  onClose: () => void;
}> = ({ template, onSave, onClose }) => {
  const isEdit = !!template;
  const [code, setCode] = useState(template?.code || '');
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [category, setCategory] = useState(template?.category || 'CUSTOM');
  const [isDefault, setIsDefault] = useState(template?.is_default || false);
  const [days, setDays] = useState<WorkPatternDay[]>(
    template?.days || Array.from({ length: 7 }, (_, i) => ({
      id: '', day_of_week: i, hours: 0, start_time: null, end_time: null,
    }))
  );
  const [saving, setSaving] = useState(false);

  const handleDayChange = (dow: number, field: string, value: string) => {
    setDays(prev => prev.map(d =>
      d.day_of_week === dow ? { ...d, [field]: field === 'hours' ? parseFloat(value) || 0 : value || null } : d
    ));
  };

  const weeklyHours = days.reduce((sum, d) => sum + d.hours, 0);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const payload = {
      code: code.trim().toUpperCase().replace(/\s+/g, '_'),
      name: name.trim(),
      description: description.trim() || null,
      category,
      is_default: isDefault,
      days: days.map(d => ({
        day_of_week: d.day_of_week,
        hours: d.hours,
        start_time: d.start_time,
        end_time: d.end_time,
      })),
    };
    try {
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[90vh] bg-bg-ops-surface border border-border-ops-subtle rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
          <div className="flex items-center gap-3">
            <Edit3 className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold text-text-ops-primary">
              {isEdit ? 'Edit Work Pattern' : 'New Work Pattern'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-ops-muted mb-1">Code</label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                placeholder="WP_STANDARD"
                className="w-full px-3 py-2 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-text-ops-muted mb-1">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none"
              >
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-ops-muted mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Standard Office Hours"
              className="w-full px-3 py-2 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-text-ops-muted mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Mon-Fri, 9:00-17:00 with 1-hour lunch..."
              rows={2}
              className="w-full px-3 py-2 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none resize-none"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={e => setIsDefault(e.target.checked)}
              className="rounded border-border-ops-subtle bg-bg-ops-input text-indigo-500 focus:ring-indigo-500"
            />
            <span className="text-sm text-text-ops-primary">Set as default for this category</span>
          </label>

          {/* Per-day editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-text-ops-primary">Weekly Schedule</h3>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-mono text-indigo-300">{weeklyHours.toFixed(1)}h / week</span>
              </div>
            </div>
            <div className="space-y-1">
              {days.map(d => (
                <DayEditorRow
                  key={d.day_of_week}
                  dayOfWeek={d.day_of_week}
                  hours={d.hours}
                  startTime={d.start_time || ''}
                  endTime={d.end_time || ''}
                  onChange={handleDayChange}
                />
              ))}
            </div>
          </div>

          {/* Quick presets */}
          <div>
            <h3 className="text-xs text-text-ops-muted mb-2">Quick Presets</h3>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Mon-Fri 9-5', days: [8,8,8,8,8,0,0], start: '09:00', end: '17:00' },
                { label: 'Mon-Fri 8-4', days: [8,8,8,8,8,0,0], start: '08:00', end: '16:00' },
                { label: 'Mon-Thu 9-5', days: [8,8,8,8,0,0,0], start: '09:00', end: '17:00' },
                { label: '6-day week', days: [8,8,8,8,8,4,0], start: '09:00', end: '17:00' },
                { label: '24/7 Shift', days: [12,12,12,12,12,12,12], start: '06:00', end: '18:00' },
                { label: 'Part-time 4h', days: [4,4,4,4,4,0,0], start: '09:00', end: '13:00' },
              ].map(preset => (
                <button
                  key={preset.label}
                  onClick={() => {
                    setDays(prev => prev.map((d, i) => ({
                      ...d,
                      hours: preset.days[i],
                      start_time: preset.start,
                      end_time: preset.end,
                    })));
                  }}
                  className="px-3 py-1.5 rounded-full text-xs bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary hover:border-indigo-500/50 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-ops-subtle">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-text-ops-muted hover:text-text-ops-primary transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : isEdit ? 'Update Pattern' : 'Create Pattern'}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Resource assignment modal */
const AssignmentModal: React.FC<{
  template: WorkPatternTemplate;
  onClose: () => void;
  onAssign: (data: any) => void;
}> = ({ template, onClose, onAssign }) => {
  const [resourceId, setResourceId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [effectiveTo, setEffectiveTo] = useState('');
  const [notes, setNotes] = useState('');
  const [assigning, setAssigning] = useState(false);

  const handleAssign = async () => {
    if (!resourceId.trim()) return;
    setAssigning(true);
    try {
      await onAssign({
        resource_node_id: resourceId.trim(),
        template_id: template.id,
        effective_from: effectiveFrom,
        effective_to: effectiveTo || null,
        notes: notes.trim() || null,
      });
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-bg-ops-surface border border-border-ops-subtle rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
          <h2 className="text-lg font-semibold text-text-ops-primary">Assign Pattern to Resource</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
            <p className="text-sm text-indigo-300 font-medium">{template.name}</p>
            <p className="text-xs text-text-ops-muted mt-1">
              {template.days.filter(d => d.hours > 0).length} working days · {template.days.reduce((s, d) => s + d.hours, 0).toFixed(1)}h/week
            </p>
          </div>
          <div>
            <label className="block text-xs text-text-ops-muted mb-1">Resource Node ID (UUID)</label>
            <input
              type="text"
              value={resourceId}
              onChange={e => setResourceId(e.target.value)}
              placeholder="Enter resource UUID..."
              className="w-full px-3 py-2 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-ops-muted mb-1">Effective From</label>
              <input
                type="date"
                value={effectiveFrom}
                onChange={e => setEffectiveFrom(e.target.value)}
                className="w-full px-3 py-2 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-text-ops-muted mb-1">Effective To (optional)</label>
              <input
                type="date"
                value={effectiveTo}
                onChange={e => setEffectiveTo(e.target.value)}
                className="w-full px-3 py-2 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-ops-muted mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Reason for assignment..."
              rows={2}
              className="w-full px-3 py-2 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none resize-none"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-ops-subtle">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-text-ops-muted hover:text-text-ops-primary">
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={assigning || !resourceId.trim()}
            className="px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            <Users className="w-4 h-4" />
            {assigning ? 'Assigning...' : 'Assign Pattern'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main View
// ---------------------------------------------------------------------------

const CalendarsView: React.FC = () => {
  const [templates, setTemplates] = useState<WorkPatternTemplate[]>([]);
  const [assignments, setAssignments] = useState<ResourceAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTemplate, setEditingTemplate] = useState<WorkPatternTemplate | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [assigningTemplate, setAssigningTemplate] = useState<WorkPatternTemplate | null>(null);
  const [activeTab, setActiveTab] = useState<'templates' | 'assignments'>('templates');
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await api.get('/calendars/work-patterns/');
      setTemplates(res.data.templates || []);
    } catch (e) {
      console.error('Failed to fetch templates:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAssignments = useCallback(async () => {
    try {
      const res = await api.get('/calendars/work-patterns/assignments/');
      setAssignments(res.data.assignments || []);
    } catch (e) {
      console.error('Failed to fetch assignments:', e);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);
  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  const handleCreateTemplate = async (data: any) => {
    try {
      await api.post('/calendars/work-patterns/', data);
      setCreatingNew(false);
      setEditingTemplate(null);
      showToast('Work pattern created successfully');
      await fetchTemplates();
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to create template', 'error');
    }
  };

  const handleUpdateTemplate = async (data: any) => {
    if (!editingTemplate) return;
    try {
      await api.put(`/calendars/work-patterns/${editingTemplate.id}`, data);
      setEditingTemplate(null);
      showToast('Work pattern updated successfully');
      await fetchTemplates();
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to update template', 'error');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Deactivate this work pattern template?')) return;
    try {
      await api.delete(`/calendars/work-patterns/${id}`);
      showToast('Template deactivated');
      await fetchTemplates();
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to deactivate template', 'error');
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await api.post(`/calendars/work-patterns/${id}/set-default`);
      showToast('Set as default pattern');
      await fetchTemplates();
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to set default', 'error');
    }
  };

  const handleAssign = async (data: any) => {
    try {
      await api.post('/calendars/work-patterns/assignments/', data);
      setAssigningTemplate(null);
      showToast('Pattern assigned to resource');
      await fetchAssignments();
      await fetchTemplates();
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to assign pattern', 'error');
    }
  };

  const handleRemoveAssignment = async (id: string) => {
    if (!confirm('Remove this pattern assignment?')) return;
    try {
      await api.delete(`/calendars/work-patterns/assignments/${id}`);
      showToast('Assignment removed');
      await fetchAssignments();
    } catch (e: any) {
      showToast(e.response?.data?.detail || 'Failed to remove assignment', 'error');
    }
  };

  // Filter templates
  const filteredTemplates = templates.filter(tpl => {
    if (categoryFilter && tpl.category !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return tpl.name.toLowerCase().includes(q) || tpl.code.toLowerCase().includes(q);
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-text-ops-muted">
        Loading work patterns...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg border flex items-center gap-2 text-sm ${
          toast.type === 'success'
            ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/20 border-red-500/30 text-red-300'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <Calendar className="w-6 h-6 text-indigo-400" />
          <div>
            <h1 className="text-lg font-semibold text-text-ops-primary">Work Pattern Management</h1>
            <p className="text-sm text-text-ops-muted">Templates, Schedules &amp; Resource Assignments</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setCreatingNew(true); setEditingTemplate(null); }}
            className="px-3 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-500 flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Pattern
          </button>
          <button onClick={() => { fetchTemplates(); fetchAssignments(); }} className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 border-b border-border-ops-subtle">
        {(['templates', 'assignments'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-text-ops-muted hover:text-text-ops-primary'
            }`}
          >
            {tab === 'templates' ? 'Templates' : 'Assignments'}
            {tab === 'assignments' && <span className="ml-1.5 text-xs opacity-60">({assignments.length})</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'templates' ? (
          <div className="p-6">
            {/* Filters */}
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-ops-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search patterns..."
                  className="w-full pl-10 pr-4 py-2 rounded-lg bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setCategoryFilter(null)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                    !categoryFilter ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-bg-ops-overlay text-text-ops-muted border-border-ops-subtle'
                  }`}
                >
                  All
                </button>
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.value}
                    onClick={() => setCategoryFilter(categoryFilter === cat.value ? null : cat.value)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                      categoryFilter === cat.value
                        ? cat.color
                        : 'bg-bg-ops-overlay text-text-ops-muted border-border-ops-subtle'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Template Cards */}
            {filteredTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-text-ops-muted">
                <Calendar className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-lg font-medium">No work patterns found</p>
                <p className="text-sm mt-1">Create your first pattern to get started</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredTemplates.map(tpl => {
                  const weeklyHours = tpl.days.reduce((s, d) => s + d.hours, 0);
                  const workingDays = tpl.days.filter(d => d.hours > 0).length;
                  const isExpanded = expandedTemplate === tpl.id;

                  return (
                    <div
                      key={tpl.id}
                      className={`rounded-xl border transition-all ${
                        tpl.is_default
                          ? 'border-indigo-500/40 bg-indigo-500/5'
                          : 'border-border-ops-subtle bg-bg-ops-surface hover:border-border-ops-overlay'
                      }`}
                    >
                      {/* Card Header */}
                      <div className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-text-ops-primary">{tpl.name}</h3>
                              {tpl.is_default && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                  DEFAULT
                                </span>
                              )}
                              {!tpl.is_active && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/20 text-red-300 border border-red-500/30">
                                  INACTIVE
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-text-ops-muted font-mono">{tpl.code} · v{tpl.version}</p>
                            {tpl.description && (
                              <p className="text-xs text-text-ops-muted mt-1">{tpl.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setAssigningTemplate(tpl)}
                              className="p-1.5 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-emerald-400"
                              title="Assign to resource"
                            >
                              <Users className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingTemplate(tpl)}
                              className="p-1.5 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-indigo-400"
                              title="Edit pattern"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            {!tpl.is_default && (
                              <button
                                onClick={() => handleSetDefault(tpl.id)}
                                className="p-1.5 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-amber-400"
                                title="Set as default"
                              >
                                <Star className="w-4 h-4" />
                              </button>
                            )}
                            {tpl.is_default && (
                              <button
                                onClick={() => {
                                  const update = { is_default: false };
                                  api.put(`/calendars/work-patterns/${tpl.id}`, update).then(() => {
                                    showToast('Default removed');
                                    fetchTemplates();
                                  });
                                }}
                                className="p-1.5 rounded hover:bg-bg-ops-overlay text-amber-400"
                                title="Remove default"
                              >
                                <StarOff className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteTemplate(tpl.id)}
                              className="p-1.5 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-red-400"
                              title="Deactivate"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Stats row */}
                        <div className="flex items-center gap-4 mt-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${CATEGORY_MAP[tpl.category] || ''}`}>
                            {tpl.category}
                          </span>
                          <span className="text-xs text-text-ops-muted flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {weeklyHours.toFixed(1)}h/week
                          </span>
                          <span className="text-xs text-text-ops-muted">
                            {workingDays} working days
                          </span>
                          <span className="text-xs text-text-ops-muted flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {tpl.resource_count} resources
                          </span>
                        </div>

                        {/* Heatmap */}
                        <div className="mt-3">
                          <WeeklyCalendarHeatmap days={tpl.days} />
                        </div>

                        {/* Expandable detail */}
                        <button
                          onClick={() => setExpandedTemplate(isExpanded ? null : tpl.id)}
                          className="flex items-center gap-1 mt-3 text-xs text-text-ops-muted hover:text-text-ops-primary transition-colors"
                        >
                          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          {isExpanded ? 'Hide' : 'Show'} daily breakdown
                        </button>

                        {isExpanded && (
                          <div className="mt-2 space-y-1">
                            {tpl.days.map(d => (
                              <div key={d.day_of_week} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-bg-ops-overlay">
                                <span className="text-text-ops-primary">{DAY_FULL[d.day_of_week]}</span>
                                <span className="text-text-ops-muted">
                                  {d.hours > 0
                                    ? `${d.hours}h (${d.start_time}–${d.end_time})`
                                    : 'Non-working'
                                  }
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Assignments Tab */
          <div className="p-6">
            {assignments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-text-ops-muted">
                <Users className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-lg font-medium">No assignments yet</p>
                <p className="text-sm mt-1">Assign a work pattern to a resource from the Templates tab</p>
              </div>
            ) : (
              <div className="overflow-auto rounded-xl border border-border-ops-subtle">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-ops-subtle text-text-ops-muted bg-bg-ops-overlay">
                      <th className="text-left py-3 px-4 font-medium">Resource</th>
                      <th className="text-left py-3 px-4 font-medium">Pattern</th>
                      <th className="text-left py-3 px-4 font-medium">Effective From</th>
                      <th className="text-left py-3 px-4 font-medium">Effective To</th>
                      <th className="text-left py-3 px-4 font-medium">Priority</th>
                      <th className="text-left py-3 px-4 font-medium">Notes</th>
                      <th className="text-center py-3 px-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map(a => (
                      <tr key={a.id} className="border-b border-border-ops-subtle hover:bg-bg-ops-overlay transition-colors">
                        <td className="py-3 px-4 text-text-ops-primary font-medium">{a.resource_name}</td>
                        <td className="py-3 px-4 text-text-ops-muted">{a.template_name}</td>
                        <td className="py-3 px-4 text-text-ops-muted font-mono text-xs">{a.effective_from}</td>
                        <td className="py-3 px-4 text-text-ops-muted font-mono text-xs">
                          {a.effective_to || <span className="text-emerald-400/60">Ongoing</span>}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-bg-ops-overlay text-text-ops-muted">
                            {a.priority}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-text-ops-muted text-xs max-w-[200px] truncate">{a.notes || '—'}</td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleRemoveAssignment(a.id)}
                            className="p-1.5 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-red-400"
                            title="Remove assignment"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {(creatingNew || editingTemplate) && (
        <TemplateEditor
          template={editingTemplate}
          onSave={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
          onClose={() => { setCreatingNew(false); setEditingTemplate(null); }}
        />
      )}
      {assigningTemplate && (
        <AssignmentModal
          template={assigningTemplate}
          onClose={() => setAssigningTemplate(null)}
          onAssign={handleAssign}
        />
      )}
    </div>
  );
};

export default CalendarsView;
