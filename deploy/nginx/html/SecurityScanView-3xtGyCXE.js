import { r as reactExports, j as jsxRuntimeExports, b7 as ScanLine, y as Play, Y as CircleCheckBig, aJ as CircleX, b as api } from "./index-DwHrkWl2.js";
const SecurityScanView = () => {
  const [results, setResults] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const fetchResults = async () => {
    try {
      const data = await api.get("/admin/security-scan/results");
      setResults(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  reactExports.useEffect(() => {
    fetchResults();
  }, []);
  const runScan = async (type) => {
    try {
      await api.post(`/admin/security-scan/${type}`);
      alert(`${type.toUpperCase()} scan started`);
      await fetchResults();
    } catch (err) {
      console.error(err);
    }
  };
  if (loading) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: "Loading..." });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ScanLine, { className: "w-6 h-6 text-red-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Security Scans" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "SAST & DAST scan management" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => runScan("sast"), className: "flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Play, { className: "w-4 h-4" }),
          " Run SAST"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => runScan("dast"), className: "flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-sm", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Play, { className: "w-4 h-4" }),
          " Run DAST"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-6", children: results.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted text-center py-8", children: "No scan results. Run a scan to get started." }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle text-text-ops-muted", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3", children: "ID" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3", children: "Type" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3", children: "Status" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3", children: "Started" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: results.map((r) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: r.id }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 bg-bg-ops-overlay rounded text-xs uppercase", children: r.type }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: r.status === "completed" ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheckBig, { className: "w-4 h-4 text-green-400 inline mr-1" }),
          "Completed"
        ] }) : r.status === "failed" ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { className: "w-4 h-4 text-red-400 inline mr-1" }),
          "Failed"
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-amber-400", children: "Running" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted text-xs", children: r.started_at ? new Date(r.started_at).toLocaleString() : "—" })
      ] }, r.id)) })
    ] }) })
  ] });
};
export {
  SecurityScanView as default
};
//# sourceMappingURL=SecurityScanView-3xtGyCXE.js.map
