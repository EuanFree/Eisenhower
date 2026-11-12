import { r as reactExports, j as jsxRuntimeExports, B as BarChart3, v as RefreshCw, b as api } from "./index-DwHrkWl2.js";
const MonitoringView = () => {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
  const [metrics, setMetrics] = reactExports.useState(null);
  const [loading, setLoading] = reactExports.useState(true);
  const fetchMetrics = async () => {
    try {
      const res = await api.get("/admin/monitoring/metrics");
      setMetrics(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  reactExports.useEffect(() => {
    fetchMetrics();
  }, []);
  const formatBytes = (b) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };
  if (loading) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: "Loading metrics..." });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(BarChart3, { className: "w-6 h-6 text-cyan-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Monitoring & Metrics" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "System resource usage" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: fetchMetrics, className: "p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-4 h-4" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto p-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-4 mb-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 bg-bg-ops-surface rounded-lg border border-border-ops-subtle", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-text-ops-muted mb-2", children: "CPU Usage" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-3xl font-bold text-text-ops-primary", children: [
            ((_a = metrics == null ? void 0 : metrics.cpu) == null ? void 0 : _a.percent) || 0,
            "%"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-text-ops-muted", children: [
            ((_b = metrics == null ? void 0 : metrics.cpu) == null ? void 0 : _b.cores) || 0,
            " cores"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 h-2 bg-bg-ops-overlay rounded-full overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-full bg-blue-500 rounded-full", style: { width: `${((_c = metrics == null ? void 0 : metrics.cpu) == null ? void 0 : _c.percent) || 0}%` } }) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 bg-bg-ops-surface rounded-lg border border-border-ops-subtle", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-text-ops-muted mb-2", children: "Memory Usage" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-3xl font-bold text-text-ops-primary", children: [
            ((_d = metrics == null ? void 0 : metrics.memory) == null ? void 0 : _d.percent) || 0,
            "%"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-text-ops-muted", children: [
            formatBytes(((_e = metrics == null ? void 0 : metrics.memory) == null ? void 0 : _e.used) || 0),
            " / ",
            formatBytes(((_f = metrics == null ? void 0 : metrics.memory) == null ? void 0 : _f.total) || 0)
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 h-2 bg-bg-ops-overlay rounded-full overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-full bg-purple-500 rounded-full", style: { width: `${((_g = metrics == null ? void 0 : metrics.memory) == null ? void 0 : _g.percent) || 0}%` } }) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 bg-bg-ops-surface rounded-lg border border-border-ops-subtle", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-text-ops-muted mb-2", children: "Disk Usage" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-3xl font-bold text-text-ops-primary", children: [
            ((_h = metrics == null ? void 0 : metrics.disk) == null ? void 0 : _h.percent) || 0,
            "%"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-text-ops-muted", children: [
            formatBytes(((_i = metrics == null ? void 0 : metrics.disk) == null ? void 0 : _i.used) || 0),
            " / ",
            formatBytes(((_j = metrics == null ? void 0 : metrics.disk) == null ? void 0 : _j.total) || 0)
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 h-2 bg-bg-ops-overlay rounded-full overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-full bg-amber-500 rounded-full", style: { width: `${((_k = metrics == null ? void 0 : metrics.disk) == null ? void 0 : _k.percent) || 0}%` } }) })
        ] })
      ] }),
      metrics && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 bg-bg-ops-surface rounded-lg border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-sm text-text-ops-muted", children: [
          "Hostname: ",
          metrics.hostname
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-text-ops-muted", children: [
          "Last updated: ",
          metrics.timestamp
        ] })
      ] })
    ] })
  ] });
};
export {
  MonitoringView as default
};
//# sourceMappingURL=MonitoringView-DO9NL_nD.js.map
