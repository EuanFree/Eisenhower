import { r as reactExports, b as api, j as jsxRuntimeExports, d as CircleCheck, aJ as CircleX, k as Calendar, K as Plus, v as RefreshCw, al as Search, U as Users, aI as PenLine, aV as Star, aW as StarOff, af as Trash2, C as Clock, f as ChevronDown, g as ChevronRight, X, ak as Save } from "./index-DwHrkWl2.js";
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const CATEGORIES = [
  { value: "STANDARD", label: "Standard", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  { value: "SHIFT", label: "Shift", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  { value: "PART_TIME", label: "Part-Time", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  { value: "OVERTIME", label: "Overtime", color: "bg-red-500/20 text-red-300 border-red-500/30" },
  { value: "CUSTOM", label: "Custom", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" }
];
const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.color]));
const DayEditorRow = ({ dayOfWeek, hours, startTime, endTime, onChange }) => {
  const isWorking = hours > 0;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isWorking ? "bg-bg-ops-overlay" : "bg-bg-ops-surface/30 opacity-60"}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-16 text-sm font-medium text-text-ops-primary", children: DAY_FULL[dayOfWeek] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-text-ops-muted w-14", children: "Hours" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          type: "number",
          min: 0,
          max: 24,
          step: 0.5,
          value: hours || "",
          onChange: (e) => onChange(dayOfWeek, "hours", e.target.value),
          className: "w-20 px-2 py-1 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-text-ops-muted w-14", children: "Start" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          type: "time",
          value: startTime,
          onChange: (e) => onChange(dayOfWeek, "start_time", e.target.value),
          className: "w-24 px-2 py-1 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-text-ops-muted w-14", children: "End" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          type: "time",
          value: endTime,
          onChange: (e) => onChange(dayOfWeek, "end_time", e.target.value),
          className: "w-24 px-2 py-1 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-20 text-right text-sm font-mono text-text-ops-muted", children: isWorking ? `${hours}h` : "—" })
  ] });
};
const WeeklyCalendarHeatmap = ({ days }) => {
  const maxHours = Math.max(...days.map((d) => d.hours), 1);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-1", children: days.map((d) => {
    const intensity = d.hours / maxHours;
    const barHeight = d.hours > 0 ? Math.max(8, intensity * 40) : 2;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: "w-8 rounded-t transition-all",
          style: {
            height: `${barHeight}px`,
            backgroundColor: d.hours > 0 ? `rgba(99, 102, 241, ${0.3 + intensity * 0.7})` : "rgba(100,116,139,0.15)"
          }
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-text-ops-muted", children: DAY_NAMES[d.day_of_week] })
    ] }, d.day_of_week);
  }) });
};
const TemplateEditor = ({ template, onSave, onClose }) => {
  const isEdit = !!template;
  const [code, setCode] = reactExports.useState((template == null ? void 0 : template.code) || "");
  const [name, setName] = reactExports.useState((template == null ? void 0 : template.name) || "");
  const [description, setDescription] = reactExports.useState((template == null ? void 0 : template.description) || "");
  const [category, setCategory] = reactExports.useState((template == null ? void 0 : template.category) || "CUSTOM");
  const [isDefault, setIsDefault] = reactExports.useState((template == null ? void 0 : template.is_default) || false);
  const [days, setDays] = reactExports.useState(
    (template == null ? void 0 : template.days) || Array.from({ length: 7 }, (_, i) => ({
      id: "",
      day_of_week: i,
      hours: 0,
      start_time: null,
      end_time: null
    }))
  );
  const [saving, setSaving] = reactExports.useState(false);
  const handleDayChange = (dow, field, value) => {
    setDays((prev) => prev.map(
      (d) => d.day_of_week === dow ? { ...d, [field]: field === "hours" ? parseFloat(value) || 0 : value || null } : d
    ));
  };
  const weeklyHours = days.reduce((sum, d) => sum + d.hours, 0);
  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const payload = {
      code: code.trim().toUpperCase().replace(/\s+/g, "_"),
      name: name.trim(),
      description: description.trim() || null,
      category,
      is_default: isDefault,
      days: days.map((d) => ({
        day_of_week: d.day_of_week,
        hours: d.hours,
        start_time: d.start_time,
        end_time: d.end_time
      }))
    };
    try {
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-3xl max-h-[90vh] bg-bg-ops-surface border border-border-ops-subtle rounded-xl shadow-2xl overflow-hidden flex flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(PenLine, { className: "w-5 h-5 text-indigo-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold text-text-ops-primary", children: isEdit ? "Edit Work Pattern" : "New Work Pattern" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onClose, className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "w-5 h-5" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-y-auto p-6 space-y-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Code" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              value: code,
              onChange: (e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, "_")),
              placeholder: "WP_STANDARD",
              className: "w-full px-3 py-2 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Category" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "select",
            {
              value: category,
              onChange: (e) => setCategory(e.target.value),
              className: "w-full px-3 py-2 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none",
              children: CATEGORIES.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: c.value, children: c.label }, c.value))
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Name" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: name,
            onChange: (e) => setName(e.target.value),
            placeholder: "Standard Office Hours",
            className: "w-full px-3 py-2 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Description" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "textarea",
          {
            value: description,
            onChange: (e) => setDescription(e.target.value),
            placeholder: "Mon-Fri, 9:00-17:00 with 1-hour lunch...",
            rows: 2,
            className: "w-full px-3 py-2 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none resize-none"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-2 cursor-pointer", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "checkbox",
            checked: isDefault,
            onChange: (e) => setIsDefault(e.target.checked),
            className: "rounded border-border-ops-subtle bg-bg-ops-input text-indigo-500 focus:ring-indigo-500"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-text-ops-primary", children: "Set as default for this category" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-text-ops-primary", children: "Weekly Schedule" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "w-4 h-4 text-indigo-400" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-sm font-mono text-indigo-300", children: [
              weeklyHours.toFixed(1),
              "h / week"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-1", children: days.map((d) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          DayEditorRow,
          {
            dayOfWeek: d.day_of_week,
            hours: d.hours,
            startTime: d.start_time || "",
            endTime: d.end_time || "",
            onChange: handleDayChange
          },
          d.day_of_week
        )) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xs text-text-ops-muted mb-2", children: "Quick Presets" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-2", children: [
          { label: "Mon-Fri 9-5", days: [8, 8, 8, 8, 8, 0, 0], start: "09:00", end: "17:00" },
          { label: "Mon-Fri 8-4", days: [8, 8, 8, 8, 8, 0, 0], start: "08:00", end: "16:00" },
          { label: "Mon-Thu 9-5", days: [8, 8, 8, 8, 0, 0, 0], start: "09:00", end: "17:00" },
          { label: "6-day week", days: [8, 8, 8, 8, 8, 4, 0], start: "09:00", end: "17:00" },
          { label: "24/7 Shift", days: [12, 12, 12, 12, 12, 12, 12], start: "06:00", end: "18:00" },
          { label: "Part-time 4h", days: [4, 4, 4, 4, 4, 0, 0], start: "09:00", end: "13:00" }
        ].map((preset) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => {
              setDays((prev) => prev.map((d, i) => ({
                ...d,
                hours: preset.days[i],
                start_time: preset.start,
                end_time: preset.end
              })));
            },
            className: "px-3 py-1.5 rounded-full text-xs bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary hover:border-indigo-500/50 transition-colors",
            children: preset.label
          },
          preset.label
        )) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-end gap-3 px-6 py-4 border-t border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onClose, className: "px-4 py-2 rounded-lg text-sm text-text-ops-muted hover:text-text-ops-primary transition-colors", children: "Cancel" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: handleSave,
          disabled: saving || !name.trim(),
          className: "px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors flex items-center gap-2",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "w-4 h-4" }),
            saving ? "Saving..." : isEdit ? "Update Pattern" : "Create Pattern"
          ]
        }
      )
    ] })
  ] }) });
};
const AssignmentModal = ({ template, onClose, onAssign }) => {
  const [resourceId, setResourceId] = reactExports.useState("");
  const [effectiveFrom, setEffectiveFrom] = reactExports.useState((/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
  const [effectiveTo, setEffectiveTo] = reactExports.useState("");
  const [notes, setNotes] = reactExports.useState("");
  const [assigning, setAssigning] = reactExports.useState(false);
  const handleAssign = async () => {
    if (!resourceId.trim()) return;
    setAssigning(true);
    try {
      await onAssign({
        resource_node_id: resourceId.trim(),
        template_id: template.id,
        effective_from: effectiveFrom,
        effective_to: effectiveTo || null,
        notes: notes.trim() || null
      });
    } finally {
      setAssigning(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-lg bg-bg-ops-surface border border-border-ops-subtle rounded-xl shadow-2xl overflow-hidden", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold text-text-ops-primary", children: "Assign Pattern to Resource" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onClose, className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "w-5 h-5" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-6 space-y-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-indigo-300 font-medium", children: template.name }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-text-ops-muted mt-1", children: [
          template.days.filter((d) => d.hours > 0).length,
          " working days · ",
          template.days.reduce((s, d) => s + d.hours, 0).toFixed(1),
          "h/week"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Resource Node ID (UUID)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: resourceId,
            onChange: (e) => setResourceId(e.target.value),
            placeholder: "Enter resource UUID...",
            className: "w-full px-3 py-2 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none font-mono"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Effective From" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "date",
              value: effectiveFrom,
              onChange: (e) => setEffectiveFrom(e.target.value),
              className: "w-full px-3 py-2 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Effective To (optional)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "date",
              value: effectiveTo,
              onChange: (e) => setEffectiveTo(e.target.value),
              className: "w-full px-3 py-2 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Notes" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "textarea",
          {
            value: notes,
            onChange: (e) => setNotes(e.target.value),
            placeholder: "Reason for assignment...",
            rows: 2,
            className: "w-full px-3 py-2 rounded bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none resize-none"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-end gap-3 px-6 py-4 border-t border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onClose, className: "px-4 py-2 rounded-lg text-sm text-text-ops-muted hover:text-text-ops-primary", children: "Cancel" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: handleAssign,
          disabled: assigning || !resourceId.trim(),
          className: "px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors flex items-center gap-2",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { className: "w-4 h-4" }),
            assigning ? "Assigning..." : "Assign Pattern"
          ]
        }
      )
    ] })
  ] }) });
};
const CalendarsView = () => {
  const [templates, setTemplates] = reactExports.useState([]);
  const [assignments, setAssignments] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [categoryFilter, setCategoryFilter] = reactExports.useState(null);
  const [searchQuery, setSearchQuery] = reactExports.useState("");
  const [editingTemplate, setEditingTemplate] = reactExports.useState(null);
  const [creatingNew, setCreatingNew] = reactExports.useState(false);
  const [assigningTemplate, setAssigningTemplate] = reactExports.useState(null);
  const [activeTab, setActiveTab] = reactExports.useState("templates");
  const [expandedTemplate, setExpandedTemplate] = reactExports.useState(null);
  const [toast, setToast] = reactExports.useState(null);
  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3e3);
  };
  const fetchTemplates = reactExports.useCallback(async () => {
    try {
      const res = await api.get("/calendars/work-patterns/");
      setTemplates(res.data.templates || []);
    } catch (e) {
      console.error("Failed to fetch templates:", e);
    } finally {
      setLoading(false);
    }
  }, []);
  const fetchAssignments = reactExports.useCallback(async () => {
    try {
      const res = await api.get("/calendars/work-patterns/assignments/");
      setAssignments(res.data.assignments || []);
    } catch (e) {
      console.error("Failed to fetch assignments:", e);
    }
  }, []);
  reactExports.useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);
  reactExports.useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);
  const handleCreateTemplate = async (data) => {
    var _a, _b;
    try {
      await api.post("/calendars/work-patterns/", data);
      setCreatingNew(false);
      setEditingTemplate(null);
      showToast("Work pattern created successfully");
      await fetchTemplates();
    } catch (e) {
      showToast(((_b = (_a = e.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to create template", "error");
    }
  };
  const handleUpdateTemplate = async (data) => {
    var _a, _b;
    if (!editingTemplate) return;
    try {
      await api.put(`/calendars/work-patterns/${editingTemplate.id}`, data);
      setEditingTemplate(null);
      showToast("Work pattern updated successfully");
      await fetchTemplates();
    } catch (e) {
      showToast(((_b = (_a = e.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to update template", "error");
    }
  };
  const handleDeleteTemplate = async (id) => {
    var _a, _b;
    if (!confirm("Deactivate this work pattern template?")) return;
    try {
      await api.delete(`/calendars/work-patterns/${id}`);
      showToast("Template deactivated");
      await fetchTemplates();
    } catch (e) {
      showToast(((_b = (_a = e.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to deactivate template", "error");
    }
  };
  const handleSetDefault = async (id) => {
    var _a, _b;
    try {
      await api.post(`/calendars/work-patterns/${id}/set-default`);
      showToast("Set as default pattern");
      await fetchTemplates();
    } catch (e) {
      showToast(((_b = (_a = e.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to set default", "error");
    }
  };
  const handleAssign = async (data) => {
    var _a, _b;
    try {
      await api.post("/calendars/work-patterns/assignments/", data);
      setAssigningTemplate(null);
      showToast("Pattern assigned to resource");
      await fetchAssignments();
      await fetchTemplates();
    } catch (e) {
      showToast(((_b = (_a = e.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to assign pattern", "error");
    }
  };
  const handleRemoveAssignment = async (id) => {
    var _a, _b;
    if (!confirm("Remove this pattern assignment?")) return;
    try {
      await api.delete(`/calendars/work-patterns/assignments/${id}`);
      showToast("Assignment removed");
      await fetchAssignments();
    } catch (e) {
      showToast(((_b = (_a = e.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to remove assignment", "error");
    }
  };
  const filteredTemplates = templates.filter((tpl) => {
    if (categoryFilter && tpl.category !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return tpl.name.toLowerCase().includes(q) || tpl.code.toLowerCase().includes(q);
    }
    return true;
  });
  if (loading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: "Loading work patterns..." });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    toast && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg border flex items-center gap-2 text-sm ${toast.type === "success" ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300" : "bg-red-500/20 border-red-500/30 text-red-300"}`, children: [
      toast.type === "success" ? /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-4 h-4" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { className: "w-4 h-4" }),
      toast.message
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { className: "w-6 h-6 text-indigo-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Work Pattern Management" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Templates, Schedules & Resource Assignments" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => {
              setCreatingNew(true);
              setEditingTemplate(null);
            },
            className: "px-3 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-500 flex items-center gap-2 transition-colors",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "w-4 h-4" }),
              "New Pattern"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => {
          fetchTemplates();
          fetchAssignments();
        }, className: "p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-4 h-4" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-1 px-6 border-b border-border-ops-subtle", children: ["templates", "assignments"].map((tab) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        onClick: () => setActiveTab(tab),
        className: `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? "border-indigo-500 text-indigo-300" : "border-transparent text-text-ops-muted hover:text-text-ops-primary"}`,
        children: [
          tab === "templates" ? "Templates" : "Assignments",
          tab === "assignments" && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ml-1.5 text-xs opacity-60", children: [
            "(",
            assignments.length,
            ")"
          ] })
        ]
      },
      tab
    )) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto", children: activeTab === "templates" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative flex-1 max-w-md", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-ops-muted" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              value: searchQuery,
              onChange: (e) => setSearchQuery(e.target.value),
              placeholder: "Search patterns...",
              className: "w-full pl-10 pr-4 py-2 rounded-lg bg-bg-ops-input border border-border-ops-subtle text-text-ops-primary text-sm focus:border-indigo-500 focus:outline-none"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => setCategoryFilter(null),
              className: `px-3 py-1.5 rounded-full text-xs border transition-colors ${!categoryFilter ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" : "bg-bg-ops-overlay text-text-ops-muted border-border-ops-subtle"}`,
              children: "All"
            }
          ),
          CATEGORIES.map((cat) => /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => setCategoryFilter(categoryFilter === cat.value ? null : cat.value),
              className: `px-3 py-1.5 rounded-full text-xs border transition-colors ${categoryFilter === cat.value ? cat.color : "bg-bg-ops-overlay text-text-ops-muted border-border-ops-subtle"}`,
              children: cat.label
            },
            cat.value
          ))
        ] })
      ] }),
      filteredTemplates.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-text-ops-muted", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { className: "w-12 h-12 mb-4 opacity-30" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-lg font-medium", children: "No work patterns found" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm mt-1", children: "Create your first pattern to get started" })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-4", children: filteredTemplates.map((tpl) => {
        const weeklyHours = tpl.days.reduce((s, d) => s + d.hours, 0);
        const workingDays = tpl.days.filter((d) => d.hours > 0).length;
        const isExpanded = expandedTemplate === tpl.id;
        return /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: `rounded-xl border transition-all ${tpl.is_default ? "border-indigo-500/40 bg-indigo-500/5" : "border-border-ops-subtle bg-bg-ops-surface hover:border-border-ops-overlay"}`,
            children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-1", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "font-semibold text-text-ops-primary", children: tpl.name }),
                    tpl.is_default && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30", children: "DEFAULT" }),
                    !tpl.is_active && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/20 text-red-300 border border-red-500/30", children: "INACTIVE" })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-text-ops-muted font-mono", children: [
                    tpl.code,
                    " · v",
                    tpl.version
                  ] }),
                  tpl.description && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted mt-1", children: tpl.description })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      onClick: () => setAssigningTemplate(tpl),
                      className: "p-1.5 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-emerald-400",
                      title: "Assign to resource",
                      children: /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { className: "w-4 h-4" })
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      onClick: () => setEditingTemplate(tpl),
                      className: "p-1.5 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-indigo-400",
                      title: "Edit pattern",
                      children: /* @__PURE__ */ jsxRuntimeExports.jsx(PenLine, { className: "w-4 h-4" })
                    }
                  ),
                  !tpl.is_default && /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      onClick: () => handleSetDefault(tpl.id),
                      className: "p-1.5 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-amber-400",
                      title: "Set as default",
                      children: /* @__PURE__ */ jsxRuntimeExports.jsx(Star, { className: "w-4 h-4" })
                    }
                  ),
                  tpl.is_default && /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      onClick: () => {
                        const update = { is_default: false };
                        api.put(`/calendars/work-patterns/${tpl.id}`, update).then(() => {
                          showToast("Default removed");
                          fetchTemplates();
                        });
                      },
                      className: "p-1.5 rounded hover:bg-bg-ops-overlay text-amber-400",
                      title: "Remove default",
                      children: /* @__PURE__ */ jsxRuntimeExports.jsx(StarOff, { className: "w-4 h-4" })
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      onClick: () => handleDeleteTemplate(tpl.id),
                      className: "p-1.5 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-red-400",
                      title: "Deactivate",
                      children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "w-4 h-4" })
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 mt-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `px-2 py-0.5 rounded-full text-[10px] font-medium border ${CATEGORY_MAP[tpl.category] || ""}`, children: tpl.category }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted flex items-center gap-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "w-3 h-3" }),
                  weeklyHours.toFixed(1),
                  "h/week"
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted", children: [
                  workingDays,
                  " working days"
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted flex items-center gap-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { className: "w-3 h-3" }),
                  tpl.resource_count,
                  " resources"
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(WeeklyCalendarHeatmap, { days: tpl.days }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  onClick: () => setExpandedTemplate(isExpanded ? null : tpl.id),
                  className: "flex items-center gap-1 mt-3 text-xs text-text-ops-muted hover:text-text-ops-primary transition-colors",
                  children: [
                    isExpanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: "w-3 h-3" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "w-3 h-3" }),
                    isExpanded ? "Hide" : "Show",
                    " daily breakdown"
                  ]
                }
              ),
              isExpanded && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 space-y-1", children: tpl.days.map((d) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-xs px-2 py-1 rounded bg-bg-ops-overlay", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-primary", children: DAY_FULL[d.day_of_week] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: d.hours > 0 ? `${d.hours}h (${d.start_time}–${d.end_time})` : "Non-working" })
              ] }, d.day_of_week)) })
            ] })
          },
          tpl.id
        );
      }) })
    ] }) : (
      /* Assignments Tab */
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-6", children: assignments.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-text-ops-muted", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { className: "w-12 h-12 mb-4 opacity-30" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-lg font-medium", children: "No assignments yet" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm mt-1", children: "Assign a work pattern to a resource from the Templates tab" })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-auto rounded-xl border border-border-ops-subtle", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle text-text-ops-muted bg-bg-ops-overlay", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-3 px-4 font-medium", children: "Resource" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-3 px-4 font-medium", children: "Pattern" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-3 px-4 font-medium", children: "Effective From" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-3 px-4 font-medium", children: "Effective To" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-3 px-4 font-medium", children: "Priority" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-3 px-4 font-medium", children: "Notes" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-center py-3 px-4 font-medium", children: "Actions" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: assignments.map((a) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle hover:bg-bg-ops-overlay transition-colors", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-3 px-4 text-text-ops-primary font-medium", children: a.resource_name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-3 px-4 text-text-ops-muted", children: a.template_name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-3 px-4 text-text-ops-muted font-mono text-xs", children: a.effective_from }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-3 px-4 text-text-ops-muted font-mono text-xs", children: a.effective_to || /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-emerald-400/60", children: "Ongoing" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-3 px-4 text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 rounded-full text-xs bg-bg-ops-overlay text-text-ops-muted", children: a.priority }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-3 px-4 text-text-ops-muted text-xs max-w-[200px] truncate", children: a.notes || "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-3 px-4 text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => handleRemoveAssignment(a.id),
              className: "p-1.5 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-red-400",
              title: "Remove assignment",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { className: "w-4 h-4" })
            }
          ) })
        ] }, a.id)) })
      ] }) }) })
    ) }),
    (creatingNew || editingTemplate) && /* @__PURE__ */ jsxRuntimeExports.jsx(
      TemplateEditor,
      {
        template: editingTemplate,
        onSave: editingTemplate ? handleUpdateTemplate : handleCreateTemplate,
        onClose: () => {
          setCreatingNew(false);
          setEditingTemplate(null);
        }
      }
    ),
    assigningTemplate && /* @__PURE__ */ jsxRuntimeExports.jsx(
      AssignmentModal,
      {
        template: assigningTemplate,
        onClose: () => setAssigningTemplate(null),
        onAssign: handleAssign
      }
    )
  ] });
};
export {
  CalendarsView as default
};
//# sourceMappingURL=CalendarsView-u-KVzAue.js.map
