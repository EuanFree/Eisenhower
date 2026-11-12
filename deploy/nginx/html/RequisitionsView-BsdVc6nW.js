import { r as reactExports, b as api, j as jsxRuntimeExports, $ as FileText, v as RefreshCw } from "./index-DwHrkWl2.js";
const RequisitionsView = () => {
  const [items, setItems] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const fetch = reactExports.useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get("/requisitions/");
      setItems(d.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);
  reactExports.useEffect(() => {
    fetch();
  }, [fetch]);
  if (loading) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: "Loading requisitions..." });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "w-6 h-6 text-violet-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Requisitions" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Resource Requests & Approvals" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: fetch, className: "p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-4 h-4" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-6", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle text-text-ops-muted", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Code" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Title" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Status" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Requested By" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("tbody", { children: [
        items.map((i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle hover:bg-bg-ops-overlay", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: i.code }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-primary", children: i.title }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: i.status }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted text-xs", children: i.requested_by || "—" })
        ] }, i.id)),
        items.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("td", { colSpan: 4, className: "py-8 text-center text-text-ops-muted", children: "No requisitions." }) })
      ] })
    ] }) })
  ] });
};
export {
  RequisitionsView as default
};
//# sourceMappingURL=RequisitionsView-BsdVc6nW.js.map
