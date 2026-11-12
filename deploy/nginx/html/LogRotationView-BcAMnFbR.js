import { r as reactExports, j as jsxRuntimeExports, b5 as RotateCw, b as api } from "./index-DwHrkWl2.js";
const LogRotationView = () => {
  const [config, setConfig] = reactExports.useState({});
  const [files, setFiles] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const fetchAll = async () => {
    try {
      const [c, f] = await Promise.all([api.get("/admin/log-rotation/config"), api.get("/admin/log-rotation/files")]);
      setConfig(c.data || {});
      setFiles(f.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  reactExports.useEffect(() => {
    fetchAll();
  }, []);
  const handleRotate = async () => {
    if (!confirm("Rotate logs now?")) return;
    try {
      await api.post("/admin/log-rotation/rotate");
      await fetchAll();
    } catch (err) {
      console.error(err);
    }
  };
  if (loading) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: "Loading..." });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(RotateCw, { className: "w-6 h-6 text-indigo-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Log Rotation" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Log file rotation & retention" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-2", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: handleRotate, className: "flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(RotateCw, { className: "w-4 h-4" }),
        " Rotate Now"
      ] }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto p-6 space-y-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-3 gap-4", children: Object.entries(config).map(([key, val]) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-3 bg-bg-ops-surface rounded border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted capitalize", children: key.replace(/_/g, " ") }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-lg font-bold text-text-ops-primary", children: JSON.stringify(val) })
      ] }, key)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-base font-medium text-text-ops-primary mb-3", children: [
          "Rotated Files (",
          files.length,
          ")"
        ] }),
        files.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted text-sm", children: "No rotated files" }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle text-text-ops-muted", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3", children: "Filename" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3", children: "Size" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3", children: "Modified" })
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: files.map((f) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-primary", children: f.filename }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "py-2 px-3 text-text-ops-muted", children: [
              (f.size_bytes / 1024).toFixed(1),
              " KB"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted text-xs", children: new Date(f.modified).toLocaleString() })
          ] }, f.filename)) })
        ] })
      ] })
    ] })
  ] });
};
export {
  LogRotationView as default
};
//# sourceMappingURL=LogRotationView-BcAMnFbR.js.map
