import { r as reactExports, j as jsxRuntimeExports, b3 as Bell, v as RefreshCw, af as Trash2, b as api } from "./index-DwHrkWl2.js";
const AlertingView = () => {
  const [rules, setRules] = reactExports.useState([]);
  const [channels, setChannels] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const fetchAll = async () => {
    try {
      const [r, c] = await Promise.all([api.get("/admin/alerting/rules"), api.get("/admin/alerting/channels")]);
      setRules(r.data || []);
      setChannels(c.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  reactExports.useEffect(() => {
    fetchAll();
  }, []);
  const deleteRule = async (id) => {
    try {
      await api.delete(`/admin/alerting/rules/${id}`);
      await fetchAll();
    } catch (err) {
      console.error(err);
    }
  };
  if (loading) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: "Loading..." });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Bell, { className: "w-6 h-6 text-yellow-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Alerting & Notifications" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Alert rules & notification channels" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: fetchAll, className: "p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-4 h-4" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto p-6 space-y-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-base font-medium text-text-ops-primary mb-3", children: [
          "Alert Rules (",
          rules.length,
          ")"
        ] }),
        rules.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted text-sm", children: "No alert rules configured" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: rules.map((r) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-3 bg-bg-ops-surface rounded border border-border-ops-subtle", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-text-ops-primary", children: r.name }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-text-ops-muted", children: [
              r.condition,
              " > ",
              r.threshold
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => deleteRule(r.id), className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-red-400", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "w-3.5 h-3.5" }) })
        ] }, r.id)) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-base font-medium text-text-ops-primary mb-3", children: [
          "Notification Channels (",
          channels.length,
          ")"
        ] }),
        channels.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted text-sm", children: "No notification channels configured" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: channels.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-3 bg-bg-ops-surface rounded border border-border-ops-subtle", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-text-ops-primary", children: c.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted", children: c.type })
        ] }, c.id)) })
      ] })
    ] })
  ] });
};
export {
  AlertingView as default
};
//# sourceMappingURL=AlertingView-Bq1q5Lnm.js.map
