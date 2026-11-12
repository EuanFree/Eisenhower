import { r as reactExports, b as api, j as jsxRuntimeExports, U as Users, T as TriangleAlert, ba as UserMinus, C as Clock, Y as CircleCheckBig, f as ChevronDown, g as ChevronRight } from "./index-DwHrkWl2.js";
const LineManagerDashboardView = () => {
  const [hierarchy, setHierarchy] = reactExports.useState(null);
  const [directCount, setDirectCount] = reactExports.useState(0);
  const [totalCount, setTotalCount] = reactExports.useState(0);
  const [loading, setLoading] = reactExports.useState(true);
  const [expanded, setExpanded] = reactExports.useState(/* @__PURE__ */ new Set([0]));
  const [startDate, setStartDate] = reactExports.useState("");
  const [endDate, setEndDate] = reactExports.useState("");
  const [assessment, setAssessment] = reactExports.useState(null);
  const [assessing, setAssessing] = reactExports.useState(false);
  reactExports.useEffect(() => {
    loadData();
  }, []);
  const loadData = async () => {
    try {
      const [hierRes, directRes, allRes] = await Promise.all([
        api.get("/api/v1/line-management/hierarchy"),
        api.get("/api/v1/line-management/my-reports"),
        api.get("/api/v1/line-management/all-reports")
      ]);
      setHierarchy(hierRes.data.hierarchy || null);
      setDirectCount(directRes.data.count || 0);
      setTotalCount(allRes.data.count || 0);
      if (hierRes.data.hierarchy) {
        setExpanded(/* @__PURE__ */ new Set([hierRes.data.hierarchy.id]));
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };
  const handleAssess = async () => {
    if (!startDate || !endDate) return;
    setAssessing(true);
    try {
      const res = await api.get("/api/v1/leave/overlap-assessment", {
        params: { start_date: startDate, end_date: endDate }
      });
      setAssessment(res.data);
    } catch {
    } finally {
      setAssessing(false);
    }
  };
  const toggleExpand = (id) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };
  const renderNode = (node, depth = 0) => {
    const isExpanded = expanded.has(node.id);
    const hasReports = node.reports.length > 0;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: "flex items-center gap-2 py-2 px-3 hover:bg-surface-ops-base/50 rounded cursor-pointer",
          style: { paddingLeft: `${depth * 20 + 8}px` },
          onClick: () => hasReports && toggleExpand(node.id),
          children: [
            hasReports ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: isExpanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { size: 14 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { size: 14 }) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-3.5" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `w-2 h-2 rounded-full ${node.is_active ? "bg-emerald-400" : "bg-red-400"}` }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-text-ops-primary font-medium", children: node.full_name || node.username }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted px-1.5 py-0.5 bg-surface-ops-elevated rounded", children: node.role }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted", children: [
              node.reports.length,
              " report",
              node.reports.length !== 1 ? "s" : ""
            ] })
          ]
        }
      ),
      isExpanded && hasReports && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: node.reports.map((child) => renderNode(child, depth + 1)) })
    ] }, node.id);
  };
  const getRiskColor = (level) => {
    const colors = {
      LOW: "text-emerald-400",
      MEDIUM: "text-yellow-400",
      HIGH: "text-orange-400",
      CRITICAL: "text-red-400"
    };
    return colors[level] || "text-text-ops-muted";
  };
  if (loading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-6 h-6 rounded-full border-2 border-border-ops-subtle border-t-blue-500 animate-spin" }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full overflow-auto p-6 gap-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h1", { className: "text-xl font-semibold text-text-ops-primary flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { size: 20 }),
        "Line Manager Dashboard"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted mt-1", children: "Team hierarchy, leave approvals, and delivery risk assessment" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-4 gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-surface-ops-elevated border border-border-ops-subtle rounded-lg p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: "Total Team" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-2xl font-bold text-text-ops-primary mt-1", children: totalCount })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-surface-ops-elevated border border-border-ops-subtle rounded-lg p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: "Direct Reports" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-2xl font-bold text-text-ops-primary mt-1", children: directCount })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-surface-ops-elevated border border-border-ops-subtle rounded-lg p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: "Currently On Leave" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-2xl font-bold text-yellow-400 mt-1", children: assessment ? assessment.absent_members.length : "—" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-surface-ops-elevated border border-border-ops-subtle rounded-lg p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: "Risk Level" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `text-2xl font-bold mt-1 ${assessment ? getRiskColor(assessment.risk_level) : "text-text-ops-muted"}`, children: assessment ? assessment.risk_level : "—" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-surface-ops-elevated border border-border-ops-subtle rounded-lg", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4 border-b border-border-ops-subtle", children: /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-semibold text-text-ops-primary", children: "Team Hierarchy" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-2 max-h-96 overflow-auto", children: hierarchy ? renderNode(hierarchy) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-8 text-center text-text-ops-muted text-sm", children: "No team data available." }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-surface-ops-elevated border border-border-ops-subtle rounded-lg", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4 border-b border-border-ops-subtle", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-sm font-semibold text-text-ops-primary flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 16 }),
          "Leave Overlap Assessment"
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-3 mb-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "From" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  type: "date",
                  value: startDate,
                  onChange: (e) => setStartDate(e.target.value),
                  className: "w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "To" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  type: "date",
                  value: endDate,
                  onChange: (e) => setEndDate(e.target.value),
                  className: "w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-end", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: handleAssess,
                disabled: assessing || !startDate || !endDate,
                className: "px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors",
                children: assessing ? "Checking..." : "Assess"
              }
            ) })
          ] }),
          assessment && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-3 bg-surface-ops-base rounded border border-border-ops-subtle", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-text-ops-muted", children: "Absence Rate" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `text-lg font-bold ${getRiskColor(assessment.risk_level)}`, children: [
                assessment.absence_percentage,
                "%"
              ] })
            ] }),
            assessment.absent_members.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted mb-2", children: "Absent Team Members:" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-1", children: assessment.absent_members.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-sm", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(UserMinus, { size: 14, className: "text-yellow-400" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-primary", children: m.full_name || m.username })
              ] }, m.id)) })
            ] }),
            assessment.overlapping_requests.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted mb-2", children: "Overlapping Leave:" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-1", children: assessment.overlapping_requests.map((r) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-text-ops-muted flex items-center gap-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 12 }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: r.leave_type }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                  r.start_date,
                  " → ",
                  r.end_date
                ] })
              ] }, r.id)) })
            ] }),
            assessment.risk_level === "CRITICAL" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 14, className: "inline mr-1" }),
              "Critical delivery risk — ",
              assessment.absence_percentage,
              "% of team absent. Consider deferring leave or reallocating resources."
            ] }),
            assessment.risk_level === "HIGH" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-3 bg-orange-500/10 border border-orange-500/30 rounded text-sm text-orange-400", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 14, className: "inline mr-1" }),
              "High delivery risk — ",
              assessment.absence_percentage,
              "% of team absent. Review critical path tasks."
            ] }),
            assessment.risk_level === "LOW" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-3 bg-emerald-500/10 border border-emerald-500/30 rounded text-sm text-emerald-400", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheckBig, { size: 14, className: "inline mr-1" }),
              "Low risk — team capacity is sufficient during this period."
            ] })
          ] })
        ] })
      ] })
    ] })
  ] });
};
export {
  LineManagerDashboardView as default
};
//# sourceMappingURL=LineManagerDashboardView-Cvv4wro9.js.map
