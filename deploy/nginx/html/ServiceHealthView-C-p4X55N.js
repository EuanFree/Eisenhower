import { r as reactExports, j as jsxRuntimeExports, b2 as HeartPulse, v as RefreshCw, Y as CircleCheckBig, aJ as CircleX, b as api } from "./index-DwHrkWl2.js";
const ServiceHealthView = () => {
  const [health, setHealth] = reactExports.useState(null);
  const [loading, setLoading] = reactExports.useState(true);
  const fetchHealth = async () => {
    try {
      const res = await api.get("/admin/health");
      setHealth(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  reactExports.useEffect(() => {
    fetchHealth();
  }, []);
  if (loading) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: "Loading health data..." });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(HeartPulse, { className: "w-6 h-6 text-green-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Service Health" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Backend service status" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: fetchHealth, className: "p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-4 h-4" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto p-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: "mb-6 p-4 rounded-lg border",
          style: { backgroundColor: (health == null ? void 0 : health.overall_healthy) ? "#064e3b20" : "#7f1d1d20", borderColor: (health == null ? void 0 : health.overall_healthy) ? "#059669" : "#dc2626" },
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            (health == null ? void 0 : health.overall_healthy) ? /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheckBig, { className: "w-6 h-6 text-green-400" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { className: "w-6 h-6 text-red-400" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-lg font-semibold", children: (health == null ? void 0 : health.overall_healthy) ? "All Services Healthy" : "Service Issues Detected" })
          ] })
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-3 gap-4", children: (health == null ? void 0 : health.services) && Object.entries(health.services).map(([name, svc]) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 bg-bg-ops-surface rounded-lg border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
          svc.healthy ? /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheckBig, { className: "w-5 h-5 text-green-400" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { className: "w-5 h-5 text-red-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-text-ops-primary capitalize", children: name })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-text-ops-muted", children: svc.message })
      ] }, name)) })
    ] })
  ] });
};
export {
  ServiceHealthView as default
};
//# sourceMappingURL=ServiceHealthView-C-p4X55N.js.map
