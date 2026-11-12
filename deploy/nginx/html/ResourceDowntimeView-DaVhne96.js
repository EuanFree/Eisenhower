import { r as reactExports, b as api, j as jsxRuntimeExports, W as Wrench, K as Plus, af as Trash2, i as CircleAlert } from "./index-DwHrkWl2.js";
const DOWNTIME_TYPES = [
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "CALIBRATION", label: "Calibration" },
  { value: "REPAIR", label: "Repair" },
  { value: "INSPECTION", label: "Inspection" },
  { value: "MODIFICATION", label: "Modification" },
  { value: "OTHER", label: "Other" }
];
function getTypeBadge(type) {
  const styles = {
    MAINTENANCE: "bg-blue-500/20 text-blue-400",
    CALIBRATION: "bg-purple-500/20 text-purple-400",
    REPAIR: "bg-orange-500/20 text-orange-400",
    INSPECTION: "bg-yellow-500/20 text-yellow-400",
    MODIFICATION: "bg-cyan-500/20 text-cyan-400",
    OTHER: "bg-gray-500/20 text-gray-400"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `px-2 py-0.5 rounded text-xs font-medium ${styles[type] || styles.OTHER}`, children: type });
}
const ResourceDowntimeView = () => {
  const [downtimes, setDowntimes] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [showForm, setShowForm] = reactExports.useState(false);
  const [resourceId, setResourceId] = reactExports.useState("");
  const [downtimeType, setDowntimeType] = reactExports.useState("MAINTENANCE");
  const [startDate, setStartDate] = reactExports.useState("");
  const [endDate, setEndDate] = reactExports.useState("");
  const [reason, setReason] = reactExports.useState("");
  const [submitting, setSubmitting] = reactExports.useState(false);
  const [daysAhead, setDaysAhead] = reactExports.useState(30);
  reactExports.useEffect(() => {
    loadData();
  }, [daysAhead]);
  const loadData = async () => {
    try {
      const res = await api.get("/api/v1/downtime", { params: { days_ahead: daysAhead } });
      setDowntimes(res.data.downtimes || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!resourceId || !startDate || !endDate) return;
    setSubmitting(true);
    try {
      await api.post("/api/v1/downtime/", null, {
        params: {
          resource_node_id: resourceId,
          downtime_type: downtimeType,
          start_date: startDate,
          end_date: endDate,
          reason: reason || void 0
        }
      });
      setShowForm(false);
      setResourceId("");
      setStartDate("");
      setEndDate("");
      setReason("");
      loadData();
    } catch {
    } finally {
      setSubmitting(false);
    }
  };
  const handleCancel = async (id) => {
    try {
      await api.delete(`/api/v1/downtime/${id}`);
      loadData();
    } catch {
    }
  };
  if (loading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-6 h-6 rounded-full border-2 border-border-ops-subtle border-t-blue-500 animate-spin" }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full overflow-auto p-6 gap-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("h1", { className: "text-xl font-semibold text-text-ops-primary flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Wrench, { size: 20 }),
          "Resource Downtime"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted mt-1", children: "Schedule and manage physical resource offline periods" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => setShowForm(!showForm),
          className: "flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { size: 16 }),
            "Schedule Downtime"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-text-ops-muted", children: "Show next" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "select",
        {
          value: daysAhead,
          onChange: (e) => setDaysAhead(Number(e.target.value)),
          className: "px-2 py-1 bg-surface-ops-base border border-border-ops-subtle rounded text-xs text-text-ops-primary outline-none",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: 7, children: "7 days" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: 14, children: "14 days" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: 30, children: "30 days" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: 60, children: "60 days" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: 90, children: "90 days" })
          ]
        }
      )
    ] }),
    showForm && /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, className: "bg-surface-ops-elevated border border-border-ops-subtle rounded-lg p-4 grid grid-cols-1 md:grid-cols-6 gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Resource UUID" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: resourceId,
            onChange: (e) => setResourceId(e.target.value),
            required: true,
            placeholder: "UUID of resource...",
            className: "w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Type" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "select",
          {
            value: downtimeType,
            onChange: (e) => setDowntimeType(e.target.value),
            className: "w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none",
            children: DOWNTIME_TYPES.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: t.value, children: t.label }, t.value))
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Start Date" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "date",
            value: startDate,
            onChange: (e) => setStartDate(e.target.value),
            required: true,
            className: "w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "End Date" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "date",
            value: endDate,
            onChange: (e) => setEndDate(e.target.value),
            required: true,
            className: "w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Reason" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: reason,
            onChange: (e) => setReason(e.target.value),
            placeholder: "Reason...",
            className: "w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-end gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "submit",
            disabled: submitting,
            className: "flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors",
            children: submitting ? "Scheduling..." : "Schedule"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => setShowForm(false),
            className: "px-4 py-2 bg-surface-ops-base border border-border-ops-subtle hover:border-border-ops-strong rounded-lg text-sm text-text-ops-muted transition-colors",
            children: "Cancel"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-surface-ops-elevated border border-border-ops-subtle rounded-lg", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4 border-b border-border-ops-subtle flex items-center justify-between", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-sm font-semibold text-text-ops-primary", children: [
        "Upcoming Downtime (",
        downtimes.length,
        ")"
      ] }) }),
      downtimes.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-8 text-center text-text-ops-muted text-sm", children: "No upcoming downtime scheduled." }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle text-text-ops-muted text-xs", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-2", children: "Resource" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-2", children: "Type" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-2", children: "Start" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-2", children: "End" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-2", children: "Reason" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-2", children: "Scheduled By" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-4 py-2", children: "Actions" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: downtimes.map((d) => {
          var _a, _b;
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle/50 hover:bg-surface-ops-base/50", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-2", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-text-ops-primary font-medium", children: d.resource_name || "Unknown" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted font-mono", children: d.resource_node_id })
            ] }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-2", children: getTypeBadge(d.downtime_type) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-2 text-text-ops-muted", children: d.start_date }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-2 text-text-ops-muted", children: d.end_date }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-2 text-text-ops-muted max-w-xs truncate", children: d.reason || "—" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-2 text-text-ops-muted", children: ((_a = d.scheduled_by) == null ? void 0 : _a.full_name) || ((_b = d.scheduled_by) == null ? void 0 : _b.username) || "—" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-2 text-right", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => handleCancel(d.id),
                className: "p-1 text-red-400 hover:bg-red-500/20 rounded transition-colors",
                title: "Cancel downtime",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { size: 14 })
              }
            ) })
          ] }, d.id);
        }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-surface-ops-elevated border border-yellow-500/30 rounded-lg p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CircleAlert, { size: 16, className: "text-yellow-400 mt-0.5 flex-shrink-0" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-medium text-yellow-400", children: "Resource Availability Impact" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted mt-1", children: "When a resource is scheduled for downtime, it is automatically marked as out of service. The scheduling engine will not assign tasks to resources during their offline period. If a task's planned dates overlap with a downtime window, a RESOURCE_UNAVAILABLE clash will be flagged by the clash detection daemon." })
      ] })
    ] }) })
  ] });
};
export {
  ResourceDowntimeView as default
};
//# sourceMappingURL=ResourceDowntimeView-DaVhne96.js.map
