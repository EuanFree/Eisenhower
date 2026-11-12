import { r as reactExports, b as api, j as jsxRuntimeExports, ax as DollarSign, v as RefreshCw } from "./index-DwHrkWl2.js";
const ReservesView = () => {
  const [items, setItems] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const fetch = reactExports.useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get("/reserves/");
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
  const fmt = (v) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(v);
  if (loading) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: "Loading reserves data..." });
  const total = items.reduce((s, i) => s + i.total_budget, 0);
  const consumed = items.reduce((s, i) => s + i.consumed, 0);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DollarSign, { className: "w-6 h-6 text-emerald-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Management Reserves" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Reserve Budget & Drawdown Tracking" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: fetch, className: "p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-4 h-4" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-4 px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted text-sm mb-1", children: "Total Reserve" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-text-ops-primary", children: fmt(total) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted text-sm mb-1", children: "Consumed" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-amber-400", children: fmt(consumed) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted text-sm mb-1", children: "Available" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-emerald-400", children: fmt(total - consumed) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-6", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle text-text-ops-muted", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Name" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-2 px-3 font-medium", children: "Budget" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-2 px-3 font-medium", children: "Consumed" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-2 px-3 font-medium", children: "Available" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-center py-2 px-3 font-medium", children: "Drawdowns" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("tbody", { children: [
        items.map((i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle hover:bg-bg-ops-overlay", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-primary", children: i.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-right font-mono text-text-ops-primary", children: fmt(i.total_budget) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-right font-mono text-amber-400", children: fmt(i.consumed) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-right font-mono text-emerald-400", children: fmt(i.available) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-center text-text-ops-muted", children: i.drawdown_count })
        ] }, i.id)),
        items.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("td", { colSpan: 5, className: "py-8 text-center text-text-ops-muted", children: "No reserves configured." }) })
      ] })
    ] }) })
  ] });
};
export {
  ReservesView as default
};
//# sourceMappingURL=ReservesView-DxvDsy0Y.js.map
