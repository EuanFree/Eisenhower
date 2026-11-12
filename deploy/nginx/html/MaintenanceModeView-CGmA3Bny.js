import { r as reactExports, j as jsxRuntimeExports, b9 as Hammer, v as RefreshCw, b as api } from "./index-DwHrkWl2.js";
const MaintenanceModeView = () => {
  const [maintenance, setMaintenance] = reactExports.useState(null);
  const [message, setMessage] = reactExports.useState("");
  const [loading, setLoading] = reactExports.useState(true);
  const fetchStatus = async () => {
    var _a;
    try {
      const res = await api.get("/admin/maintenance");
      setMaintenance(res.data);
      setMessage(((_a = res.data) == null ? void 0 : _a.message) || "");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  reactExports.useEffect(() => {
    fetchStatus();
  }, []);
  const toggle = async (enabled) => {
    try {
      await api.put("/admin/maintenance", null, { params: { enabled, message } });
      await fetchStatus();
    } catch (err) {
      console.error(err);
    }
  };
  if (loading) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: "Loading..." });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Hammer, { className: "w-6 h-6 text-orange-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Maintenance Mode" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Control system maintenance state" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: fetchStatus, className: "p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-4 h-4" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-6", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-md space-y-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `p-6 rounded-lg border text-center ${(maintenance == null ? void 0 : maintenance.enabled) ? "bg-red-900/20 border-red-500" : "bg-green-900/20 border-green-500"}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-4xl mb-2", children: (maintenance == null ? void 0 : maintenance.enabled) ? "🚧" : "✅" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xl font-bold text-text-ops-primary", children: (maintenance == null ? void 0 : maintenance.enabled) ? "Under Maintenance" : "Operational" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm text-text-ops-muted", children: "Maintenance Message" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            value: message,
            onChange: (e) => setMessage(e.target.value),
            className: "w-full mt-1 bg-bg-ops-surface border border-border-ops-strong rounded px-3 py-2 text-sm text-text-ops-primary",
            placeholder: "System under maintenance"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => toggle(!(maintenance == null ? void 0 : maintenance.enabled)),
          className: `w-full py-2 rounded text-sm text-white ${(maintenance == null ? void 0 : maintenance.enabled) ? "bg-green-600 hover:bg-green-500" : "bg-red-600 hover:bg-red-500"}`,
          children: (maintenance == null ? void 0 : maintenance.enabled) ? "Disable Maintenance Mode" : "Enable Maintenance Mode"
        }
      )
    ] }) })
  ] });
};
export {
  MaintenanceModeView as default
};
//# sourceMappingURL=MaintenanceModeView-CGmA3Bny.js.map
