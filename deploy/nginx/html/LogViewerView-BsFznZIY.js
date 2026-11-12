import { r as reactExports, b as api, j as jsxRuntimeExports, a_ as ScrollText, v as RefreshCw, a2 as Download } from "./index-DwHrkWl2.js";
const LogViewerView = () => {
  const [logs, setLogs] = reactExports.useState([]);
  const [level, setLevel] = reactExports.useState("");
  const [search, setSearch] = reactExports.useState("");
  const [loading, setLoading] = reactExports.useState(true);
  const fetchLogs = reactExports.useCallback(async () => {
    try {
      const params = { limit: 200 };
      if (level) params.level = level;
      if (search) params.search = search;
      const data = await api.get("/admin/logs", { params });
      setLogs(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [level, search]);
  reactExports.useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);
  const handleExport = async (format) => {
    var _a;
    try {
      const result = await api.get("/admin/logs/export", { params: { format, limit: 1e3 } });
      const blob = new Blob([((_a = result.data) == null ? void 0 : _a.content) || ""], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `logs.${format}`;
      a.click();
    } catch (err) {
      console.error(err);
    }
  };
  const levelColor = {
    DEBUG: "text-gray-400",
    INFO: "text-blue-400",
    WARNING: "text-yellow-400",
    ERROR: "text-red-400",
    CRITICAL: "text-red-600 font-bold"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ScrollText, { className: "w-6 h-6 text-amber-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Log Viewer" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Application & access logs" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "select",
          {
            value: level,
            onChange: (e) => setLevel(e.target.value),
            className: "bg-bg-ops-surface border border-border-ops-strong rounded px-2 py-1 text-sm text-text-ops-primary",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "All Levels" }),
              ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"].map((l) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: l, children: l }, l))
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            value: search,
            onChange: (e) => setSearch(e.target.value),
            placeholder: "Search...",
            className: "bg-bg-ops-surface border border-border-ops-strong rounded px-2 py-1 text-sm text-text-ops-primary"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: fetchLogs, className: "p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-4 h-4" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => handleExport("json"), className: "p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Download, { className: "w-4 h-4" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-4 font-mono text-xs", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted", children: "Loading logs..." }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
      logs.map((log, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-b border-border-ops-subtle/30 py-1 px-2 hover:bg-bg-ops-overlay", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: log.timestamp }),
        " ",
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: levelColor[log.level] || "text-text-ops-primary", children: [
          "[",
          log.level,
          "]"
        ] }),
        " ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-primary", children: log.message })
      ] }, i)),
      logs.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted text-center py-8", children: "No logs found" })
    ] }) })
  ] });
};
export {
  LogViewerView as default
};
//# sourceMappingURL=LogViewerView-BsFznZIY.js.map
