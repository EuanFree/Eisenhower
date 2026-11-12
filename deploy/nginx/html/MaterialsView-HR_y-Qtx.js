import { r as reactExports, b as api, j as jsxRuntimeExports, _ as Package, v as RefreshCw } from "./index-DwHrkWl2.js";
const MaterialsView = () => {
  const [items, setItems] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const fetch = reactExports.useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get("/materials/");
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
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const expiring = items.filter((i) => i.expiry_date && i.expiry_date < today).length;
  if (loading) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: "Loading materials data..." });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Package, { className: "w-6 h-6 text-teal-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Materials Management" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Inventory & Expiry Tracking" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: fetch, className: "p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-4 h-4" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-4 px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted text-sm mb-1", children: "Total Materials" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-text-ops-primary", children: items.length })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted text-sm mb-1", children: "Expiring / Expired" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-red-400", children: expiring })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted text-sm mb-1", children: "In Stock" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-emerald-400", children: items.filter((i) => i.quantity > 0).length })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-6", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle text-text-ops-muted", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Code" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Name" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Qty" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Expiry" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Clearance" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("tbody", { children: [
        items.map((i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle hover:bg-bg-ops-overlay", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: i.code }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-primary", children: i.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "py-2 px-3 text-text-ops-muted", children: [
            i.quantity,
            " ",
            i.unit
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted text-xs", children: i.expiry_date || "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted text-xs", children: i.clearance_status || "—" })
        ] }, i.id)),
        items.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("td", { colSpan: 5, className: "py-8 text-center text-text-ops-muted", children: "No materials registered." }) })
      ] })
    ] }) })
  ] });
};
export {
  MaterialsView as default
};
//# sourceMappingURL=MaterialsView-HR_y-Qtx.js.map
