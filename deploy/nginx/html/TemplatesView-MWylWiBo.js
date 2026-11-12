import { r as reactExports, b as api, j as jsxRuntimeExports, aT as LayoutTemplate, v as RefreshCw, U as Users, y as Play, aU as Copy, c as clsx, K as Plus, af as Trash2 } from "./index-DwHrkWl2.js";
const TIER_LABELS = {
  PROGRAMME: "Programme",
  PROJECT: "Project",
  WORK_PACKAGE: "Work Package",
  TASK_COLLECTION: "Task Collection"
};
const TemplatesView = () => {
  const [activeTab, setActiveTab] = reactExports.useState("structural");
  const [structuralTemplates, setStructuralTemplates] = reactExports.useState([]);
  const [crewTemplates, setCrewTemplates] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [showCreateStructural, setShowCreateStructural] = reactExports.useState(false);
  const [showCreateCrew, setShowCreateCrew] = reactExports.useState(false);
  const [showSnapshot, setShowSnapshot] = reactExports.useState(false);
  const [showInstantiate, setShowInstantiate] = reactExports.useState(false);
  const [selectedTemplate, setSelectedTemplate] = reactExports.useState(null);
  const fetchStructural = reactExports.useCallback(async () => {
    var _a;
    try {
      const res = await api.get("/templates/");
      setStructuralTemplates(((_a = res.data) == null ? void 0 : _a.templates) || res.data || []);
    } catch (err) {
      console.error("Failed to fetch structural templates:", err);
    }
  }, []);
  const fetchCrew = reactExports.useCallback(async () => {
    try {
      const res = await api.get("/templates/crew");
      setCrewTemplates(res.data || []);
    } catch (err) {
      console.error("Failed to fetch crew templates:", err);
    }
  }, []);
  const fetchData = reactExports.useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchStructural(), fetchCrew()]);
    setLoading(false);
  }, [fetchStructural, fetchCrew]);
  reactExports.useEffect(() => {
    fetchData();
  }, [fetchData]);
  const handleCreateStructural = async (template) => {
    try {
      const res = await api.post("/templates/", template);
      setStructuralTemplates((prev) => [...prev, res.data]);
      setShowCreateStructural(false);
    } catch (err) {
      console.error("Failed to create template:", err);
    }
  };
  const handleDeleteStructural = async (id) => {
    if (!confirm("Delete this template?")) return;
    try {
      await api.delete(`/templates/${id}`);
      setStructuralTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      console.error("Failed to delete template:", err);
    }
  };
  const handleSnapshot = async (data) => {
    try {
      const res = await api.post("/templates/snapshot", data);
      alert(`Template created: ${res.data.code} (${res.data.node_count} nodes, ${res.data.dependency_count} dependencies)`);
      setShowSnapshot(false);
      fetchStructural();
    } catch (err) {
      console.error("Failed to snapshot template:", err);
    }
  };
  const handleInstantiate = async (data) => {
    try {
      const res = await api.post("/templates/instantiate", data);
      alert(`Instantiated: ${res.data.node_count} nodes, ${res.data.dependency_count} dependencies`);
      setShowInstantiate(false);
    } catch (err) {
      console.error("Failed to instantiate template:", err);
    }
  };
  const handleCreateCrew = async (crew) => {
    try {
      const res = await api.post("/templates/crew", crew);
      setCrewTemplates((prev) => [...prev, res.data]);
      setShowCreateCrew(false);
    } catch (err) {
      console.error("Failed to create crew template:", err);
    }
  };
  const handleDeleteCrew = async (id) => {
    if (!confirm("Delete this crew template?")) return;
    try {
      await api.delete(`/templates/crew/${id}`);
      setCrewTemplates((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to delete crew template:", err);
    }
  };
  if (loading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted", children: "Loading templates..." }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(LayoutTemplate, { className: "w-6 h-6 text-cyan-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Templates Library" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "WBS Structures & Resource Crews" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: fetchData,
          className: "p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors",
          title: "Refresh",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-4 h-4" })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-4 px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-text-ops-muted text-sm mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(LayoutTemplate, { className: "w-4 h-4" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Structural Templates" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-text-ops-primary", children: structuralTemplates.length })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-text-ops-muted text-sm mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { className: "w-4 h-4 text-cyan-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Crew Templates" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-cyan-400", children: crewTemplates.length })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-text-ops-muted text-sm mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Play, { className: "w-4 h-4 text-emerald-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Active Templates" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-emerald-400", children: structuralTemplates.filter((t) => t.is_active).length + crewTemplates.filter((c) => c.is_active).length })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 px-6 py-3 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => setShowSnapshot(true),
          className: "flex items-center gap-2 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-sm transition-colors",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Copy, { className: "w-4 h-4" }),
            "Snapshot WBS"
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => setShowInstantiate(true),
          className: "flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm transition-colors",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Play, { className: "w-4 h-4" }),
            "Instantiate"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-1 px-6 border-b border-border-ops-subtle", children: [
      { key: "structural", label: "Structural Templates", icon: LayoutTemplate },
      { key: "crew", label: "Crew Templates", icon: Users }
    ].map(({ key, label, icon: Icon }) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        onClick: () => setActiveTab(key),
        className: clsx(
          "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
          activeTab === key ? "border-blue-400 text-blue-400" : "border-transparent text-text-ops-muted hover:text-text-ops-primary"
        ),
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: "w-4 h-4" }),
          label
        ]
      },
      key
    )) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto p-6", children: [
      activeTab === "structural" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-base font-medium text-text-ops-primary", children: [
            "WBS Structural Templates — ",
            structuralTemplates.length
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => setShowCreateStructural(true),
              className: "flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "w-4 h-4" }),
                "New Template"
              ]
            }
          )
        ] }),
        showCreateStructural && /* @__PURE__ */ jsxRuntimeExports.jsx(
          CreateStructuralForm,
          {
            onSubmit: handleCreateStructural,
            onCancel: () => setShowCreateStructural(false)
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-4", children: [
          structuralTemplates.map((template) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: "bg-bg-ops-surface rounded-lg border border-border-ops-subtle p-4",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-sm text-text-ops-primary font-bold", children: template.code }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-primary font-medium", children: template.name }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 bg-bg-ops-overlay rounded text-xs text-text-ops-muted", children: TIER_LABELS[template.tier] || template.tier }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted", children: [
                      "v",
                      template.revision_version
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "button",
                      {
                        onClick: () => {
                          setSelectedTemplate(template);
                          setShowInstantiate(true);
                        },
                        className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-emerald-400 transition-colors",
                        title: "Instantiate",
                        children: /* @__PURE__ */ jsxRuntimeExports.jsx(Play, { className: "w-3.5 h-3.5" })
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "button",
                      {
                        onClick: () => handleDeleteStructural(template.id),
                        className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-red-400 transition-colors",
                        title: "Delete",
                        children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "w-3.5 h-3.5" })
                      }
                    )
                  ] })
                ] }),
                template.description && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted mb-2", children: template.description }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-text-ops-muted", children: [
                  "Created: ",
                  new Date(template.created_at).toLocaleDateString()
                ] })
              ]
            },
            template.id
          )),
          structuralTemplates.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "py-8 text-center text-text-ops-muted", children: "No structural templates. Create one or snapshot an existing WBS sub-tree." })
        ] })
      ] }),
      activeTab === "crew" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-base font-medium text-text-ops-primary", children: [
            "Resource Crew Templates — ",
            crewTemplates.length
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => setShowCreateCrew(true),
              className: "flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "w-4 h-4" }),
                "New Crew"
              ]
            }
          )
        ] }),
        showCreateCrew && /* @__PURE__ */ jsxRuntimeExports.jsx(
          CreateCrewForm,
          {
            onSubmit: handleCreateCrew,
            onCancel: () => setShowCreateCrew(false)
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-4", children: [
          crewTemplates.map((crew) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: "bg-bg-ops-surface rounded-lg border border-border-ops-subtle p-4",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-sm text-text-ops-primary font-bold", children: crew.code }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-primary font-medium", children: crew.name }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted", children: [
                      crew.members.length,
                      " roles"
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      onClick: () => handleDeleteCrew(crew.id),
                      className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-red-400 transition-colors",
                      title: "Delete",
                      children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "w-3.5 h-3.5" })
                    }
                  )
                ] }),
                crew.description && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted mb-3", children: crew.description }),
                crew.members.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-2", children: crew.members.map((member) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "span",
                  {
                    className: "px-2 py-1 bg-bg-ops-overlay rounded text-xs text-text-ops-muted",
                    children: [
                      member.role_name,
                      " (",
                      member.resource_type,
                      ")"
                    ]
                  },
                  member.id
                )) })
              ]
            },
            crew.id
          )),
          crewTemplates.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "py-8 text-center text-text-ops-muted", children: "No crew templates. Create one to define reusable resource teams." })
        ] })
      ] })
    ] }),
    showSnapshot && /* @__PURE__ */ jsxRuntimeExports.jsx(
      SnapshotModal,
      {
        onSubmit: handleSnapshot,
        onCancel: () => setShowSnapshot(false)
      }
    ),
    showInstantiate && /* @__PURE__ */ jsxRuntimeExports.jsx(
      InstantiateModal,
      {
        preselectedTemplateId: selectedTemplate == null ? void 0 : selectedTemplate.id,
        onSubmit: handleInstantiate,
        onCancel: () => {
          setShowInstantiate(false);
          setSelectedTemplate(null);
        }
      }
    )
  ] });
};
const CreateStructuralForm = ({ onSubmit, onCancel }) => {
  const [code, setCode] = reactExports.useState("");
  const [name, setName] = reactExports.useState("");
  const [description, setDescription] = reactExports.useState("");
  const [tier, setTier] = reactExports.useState("PROJECT");
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ code, name, description, tier });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, className: "mb-4 p-4 bg-bg-ops-surface rounded-lg border border-blue-500/30", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-medium text-text-ops-primary mb-3", children: "New Structural Template" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-3 mb-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Code" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: code,
            onChange: (e) => setCode(e.target.value.toUpperCase()),
            placeholder: "e.g. STD_PROJ_001",
            className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
            required: true
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Name" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: name,
            onChange: (e) => setName(e.target.value),
            className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
            required: true
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Tier" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "select",
          {
            value: tier,
            onChange: (e) => setTier(e.target.value),
            className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
            children: Object.entries(TIER_LABELS).map(([key, label]) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: key, children: label }, key))
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Description" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "textarea",
          {
            value: description,
            onChange: (e) => setDescription(e.target.value),
            className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
            rows: 2
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 justify-end", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onCancel, className: "px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary", children: "Cancel" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "submit", className: "px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm", children: "Create" })
    ] })
  ] });
};
const CreateCrewForm = ({ onSubmit, onCancel }) => {
  const [code, setCode] = reactExports.useState("");
  const [name, setName] = reactExports.useState("");
  const [description, setDescription] = reactExports.useState("");
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ code, name, description });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, className: "mb-4 p-4 bg-bg-ops-surface rounded-lg border border-blue-500/30", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-medium text-text-ops-primary mb-3", children: "New Crew Template" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3 mb-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Code" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: code,
            onChange: (e) => setCode(e.target.value.toUpperCase()),
            placeholder: "e.g. CREW_TEST_01",
            className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
            required: true
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Name" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: name,
            onChange: (e) => setName(e.target.value),
            className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
            required: true
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Description" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "textarea",
          {
            value: description,
            onChange: (e) => setDescription(e.target.value),
            className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
            rows: 2
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 justify-end", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onCancel, className: "px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary", children: "Cancel" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "submit", className: "px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm", children: "Create" })
    ] })
  ] });
};
const SnapshotModal = ({ onSubmit, onCancel }) => {
  const [nodeId, setNodeId] = reactExports.useState("");
  const [code, setCode] = reactExports.useState("");
  const [name, setName] = reactExports.useState("");
  const [tier, setTier] = reactExports.useState("PROJECT");
  const [description, setDescription] = reactExports.useState("");
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ node_id: nodeId, code, name, tier });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg border border-border-ops-strong p-6 w-full max-w-lg", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold text-text-ops-primary mb-4", children: "Snapshot WBS as Template" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Source Node ID *" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              value: nodeId,
              onChange: (e) => setNodeId(e.target.value),
              className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
              required: true
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Template Code *" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "text",
                value: code,
                onChange: (e) => setCode(e.target.value.toUpperCase()),
                className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
                required: true
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Template Name *" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "text",
                value: name,
                onChange: (e) => setName(e.target.value),
                className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
                required: true
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Tier" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "select",
            {
              value: tier,
              onChange: (e) => setTier(e.target.value),
              className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
              children: Object.entries(TIER_LABELS).map(([key, label]) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: key, children: label }, key))
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
              className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
              rows: 2
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 justify-end mt-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onCancel, className: "px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary", children: "Cancel" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "submit", className: "px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-sm", children: "Snapshot" })
      ] })
    ] })
  ] }) });
};
const InstantiateModal = ({ preselectedTemplateId, onSubmit, onCancel }) => {
  const [templateId, setTemplateId] = reactExports.useState(preselectedTemplateId || "");
  const [parentNodeId, setParentNodeId] = reactExports.useState("");
  const [anchorDate, setAnchorDate] = reactExports.useState((/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
  const [codePrefix, setCodePrefix] = reactExports.useState("");
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ template_id: templateId, parent_node_id: parentNodeId, anchor_date: anchorDate, code_prefix: codePrefix });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg border border-border-ops-strong p-6 w-full max-w-lg", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold text-text-ops-primary mb-4", children: "Instantiate Template" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Template ID *" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              value: templateId,
              onChange: (e) => setTemplateId(e.target.value),
              className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
              required: true
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Parent Node ID *" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              value: parentNodeId,
              onChange: (e) => setParentNodeId(e.target.value),
              className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
              required: true
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Anchor Date *" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "date",
                value: anchorDate,
                onChange: (e) => setAnchorDate(e.target.value),
                className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
                required: true
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Code Prefix" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "text",
                value: codePrefix,
                onChange: (e) => setCodePrefix(e.target.value.toUpperCase()),
                className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
              }
            )
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 justify-end mt-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onCancel, className: "px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary", children: "Cancel" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "submit", className: "px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-sm", children: "Instantiate" })
      ] })
    ] })
  ] }) });
};
export {
  TemplatesView as default
};
//# sourceMappingURL=TemplatesView-MWylWiBo.js.map
