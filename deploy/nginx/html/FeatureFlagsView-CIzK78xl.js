import { r as reactExports, j as jsxRuntimeExports, b6 as Flag, v as RefreshCw, b0 as ToggleRight, b1 as ToggleLeft, b as api } from "./index-DwHrkWl2.js";
const FeatureFlagsView = () => {
  const [flags, setFlags] = reactExports.useState({});
  const [loading, setLoading] = reactExports.useState(true);
  const fetchFlags = async () => {
    try {
      const res = await api.get("/admin/feature-flags");
      setFlags(res.data || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  reactExports.useEffect(() => {
    fetchFlags();
  }, []);
  const toggle = async (key, val) => {
    try {
      await api.put(`/admin/feature-flags/${key}`, null, { params: { enabled: val } });
      await fetchFlags();
    } catch (err) {
      console.error(err);
    }
  };
  if (loading) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: "Loading..." });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Flag, { className: "w-6 h-6 text-pink-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Feature Flags" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Toggle features on/off" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: fetchFlags, className: "p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-4 h-4" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-6", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "max-w-2xl space-y-2", children: Object.entries(flags).map(([key, val]) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-3 bg-bg-ops-surface rounded border border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-text-ops-primary", children: key }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => toggle(key, !val), className: "flex items-center gap-2 text-sm", children: [
        val ? /* @__PURE__ */ jsxRuntimeExports.jsx(ToggleRight, { className: "w-5 h-5 text-green-400" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ToggleLeft, { className: "w-5 h-5" }),
        val ? "Enabled" : "Disabled"
      ] })
    ] }, key)) }) })
  ] });
};
export {
  FeatureFlagsView as default
};
//# sourceMappingURL=FeatureFlagsView-CIzK78xl.js.map
