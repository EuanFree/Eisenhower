import { r as reactExports, j as jsxRuntimeExports, a$ as Settings2, v as RefreshCw, b0 as ToggleRight, b1 as ToggleLeft, b as api } from "./index-DwHrkWl2.js";
const SystemConfigView = () => {
  const [config, setConfig] = reactExports.useState({});
  const [flags, setFlags] = reactExports.useState({});
  const [maintenance, setMaintenance] = reactExports.useState(null);
  const [loading, setLoading] = reactExports.useState(true);
  const fetchAll = async () => {
    try {
      const [cfg, flgs, maint] = await Promise.all([
        api.get("/admin/config"),
        api.get("/admin/feature-flags"),
        api.get("/admin/maintenance")
      ]);
      setConfig(cfg || {});
      setFlags(flgs || {});
      setMaintenance(maint);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  reactExports.useEffect(() => {
    fetchAll();
  }, []);
  const toggleFlag = async (key, enabled) => {
    try {
      await api.put(`/admin/feature-flags/${key}`, null, { params: { enabled } });
      await fetchAll();
    } catch (err) {
      console.error(err);
    }
  };
  const toggleMaintenance = async (enabled) => {
    try {
      await api.put("/admin/maintenance", null, { params: { enabled } });
      await fetchAll();
    } catch (err) {
      console.error(err);
    }
  };
  if (loading) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: "Loading config..." });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Settings2, { className: "w-6 h-6 text-purple-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "System Configuration" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Runtime settings & feature flags" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: fetchAll, className: "p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-4 h-4" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto p-6 space-y-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-medium text-text-ops-primary mb-3", children: "Feature Flags" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: Object.entries(flags).map(([key, val]) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-3 bg-bg-ops-surface rounded border border-border-ops-subtle", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-text-ops-primary", children: key }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => toggleFlag(key, !val),
              className: "flex items-center gap-2 text-sm text-text-ops-muted",
              children: [
                val ? /* @__PURE__ */ jsxRuntimeExports.jsx(ToggleRight, { className: "w-5 h-5 text-green-400" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ToggleLeft, { className: "w-5 h-5" }),
                val ? "Enabled" : "Disabled"
              ]
            }
          )
        ] }, key)) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-medium text-text-ops-primary mb-3", children: "Maintenance Mode" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-3 bg-bg-ops-surface rounded border border-border-ops-subtle", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-text-ops-primary", children: (maintenance == null ? void 0 : maintenance.enabled) ? "🚧 Under Maintenance" : "✅ Operational" }),
            (maintenance == null ? void 0 : maintenance.message) && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted", children: maintenance.message })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => toggleMaintenance(!(maintenance == null ? void 0 : maintenance.enabled)),
              className: `px-3 py-1 rounded text-sm ${(maintenance == null ? void 0 : maintenance.enabled) ? "bg-green-600 hover:bg-green-500" : "bg-red-600 hover:bg-red-500"} text-white`,
              children: (maintenance == null ? void 0 : maintenance.enabled) ? "Disable" : "Enable"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-medium text-text-ops-primary mb-3", children: "Configuration" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-2 gap-3", children: Object.entries(config).map(([key, val]) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-3 bg-bg-ops-surface rounded border border-border-ops-subtle", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted", children: key }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-text-ops-primary font-mono", children: JSON.stringify(val) })
        ] }, key)) })
      ] })
    ] })
  ] });
};
export {
  SystemConfigView as default
};
//# sourceMappingURL=SystemConfigView-CltXhENq.js.map
