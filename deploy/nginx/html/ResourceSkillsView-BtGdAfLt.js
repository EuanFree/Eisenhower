import { r as reactExports, b as api, j as jsxRuntimeExports, bb as Award, K as Plus, af as Trash2, aL as BookOpen } from "./index-DwHrkWl2.js";
const PROFICIENCY_LABELS = {
  1: "Novice",
  2: "Intermediate",
  3: "Competent",
  4: "Expert",
  5: "Master"
};
const ResourceSkillsView = () => {
  const [skills, setSkills] = reactExports.useState([]);
  const [mySkills, setMySkills] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [showAdd, setShowAdd] = reactExports.useState(false);
  const [selectedSkill, setSelectedSkill] = reactExports.useState(0);
  const [proficiency, setProficiency] = reactExports.useState(1);
  const [verification, setVerification] = reactExports.useState("SELF_ATTESTED");
  reactExports.useEffect(() => {
    loadData();
  }, []);
  const loadData = async () => {
    try {
      const [skillsRes, myRes] = await Promise.all([
        api.get("/api/v1/skills"),
        api.get("/api/v1/skills/my-skills")
      ]);
      setSkills(skillsRes.data.skills || []);
      setMySkills(myRes.data.skills || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };
  const handleAdd = async () => {
    if (!selectedSkill) return;
    try {
      await api.post("/api/v1/skills/add", null, {
        params: { skill_id: selectedSkill, proficiency_level: proficiency, verification_status: verification }
      });
      setShowAdd(false);
      setSelectedSkill(0);
      setProficiency(1);
      loadData();
    } catch {
    }
  };
  const handleRemove = async (skillId) => {
    try {
      await api.delete(`/api/v1/skills/${skillId}`);
      loadData();
    } catch {
    }
  };
  const getMySkillLevel = (skillId) => {
    return mySkills.find((s) => s.skill_id === skillId);
  };
  if (loading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-6 h-6 rounded-full border-2 border-border-ops-subtle border-t-blue-500 animate-spin" }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full overflow-auto p-6 gap-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("h1", { className: "text-xl font-semibold text-text-ops-primary flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Award, { size: 20 }),
          "Resource Skills"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted mt-1", children: "Manage skill profiles and proficiency levels" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => setShowAdd(!showAdd),
          className: "flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { size: 16 }),
            "Add Skill"
          ]
        }
      )
    ] }),
    showAdd && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-surface-ops-elevated border border-border-ops-subtle rounded-lg p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-text-ops-primary mb-3", children: "Add New Skill" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Skill" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "select",
            {
              value: selectedSkill,
              onChange: (e) => setSelectedSkill(Number(e.target.value)),
              className: "w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: 0, children: "Select a skill..." }),
                skills.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsxs("option", { value: s.id, children: [
                  s.name,
                  " (",
                  s.category,
                  ")"
                ] }, s.id))
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Proficiency" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "select",
            {
              value: proficiency,
              onChange: (e) => setProficiency(Number(e.target.value)),
              className: "w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none",
              children: Object.entries(PROFICIENCY_LABELS).map(([val, label]) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: val, children: label }, val))
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-end gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: handleAdd,
              disabled: !selectedSkill,
              className: "flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors",
              children: "Add"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => setShowAdd(false),
              className: "px-4 py-2 bg-surface-ops-base border border-border-ops-subtle rounded-lg text-sm text-text-ops-muted transition-colors",
              children: "Cancel"
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-surface-ops-elevated border border-border-ops-subtle rounded-lg", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4 border-b border-border-ops-subtle", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-sm font-semibold text-text-ops-primary flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Award, { size: 16 }),
          "My Skills (",
          mySkills.length,
          ")"
        ] }) }),
        mySkills.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-8 text-center text-text-ops-muted text-sm", children: "No skills added yet." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "divide-y divide-border-ops-subtle/50", children: mySkills.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-3 hover:bg-surface-ops-base/50", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-primary font-medium", children: s.skill_name || `Skill #${s.skill_id}` }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: s.category })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded", children: PROFICIENCY_LABELS[s.proficiency_level] || s.proficiency_level }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs px-2 py-0.5 bg-surface-ops-elevated text-text-ops-muted rounded", children: s.verification_status }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => handleRemove(s.skill_id),
                className: "p-1 text-red-400 hover:bg-red-500/20 rounded transition-colors",
                title: "Remove",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { size: 14 })
              }
            )
          ] })
        ] }, s.id)) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-surface-ops-elevated border border-border-ops-subtle rounded-lg", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4 border-b border-border-ops-subtle", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-sm font-semibold text-text-ops-primary flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(BookOpen, { size: 16 }),
          "Skill Catalog (",
          skills.length,
          ")"
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "max-h-96 overflow-auto", children: skills.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-8 text-center text-text-ops-muted text-sm", children: "No skills defined." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "divide-y divide-border-ops-subtle/50", children: skills.map((s) => {
          const myLevel = getMySkillLevel(s.id);
          return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-3 hover:bg-surface-ops-base/50", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-primary font-medium", children: s.name }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-text-ops-muted", children: [
                s.category,
                " — ",
                s.code
              ] }),
              s.description && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted mt-1", children: s.description })
            ] }),
            myLevel && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded", children: PROFICIENCY_LABELS[myLevel.proficiency_level] || myLevel.proficiency_level })
          ] }) }, s.id);
        }) }) })
      ] })
    ] })
  ] });
};
export {
  ResourceSkillsView as default
};
//# sourceMappingURL=ResourceSkillsView-BtGdAfLt.js.map
