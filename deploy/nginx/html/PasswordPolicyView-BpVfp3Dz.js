import { r as reactExports, j as jsxRuntimeExports, ah as Key, v as RefreshCw, b as api } from "./index-DwHrkWl2.js";
const PasswordPolicyView = () => {
  const [policy, setPolicy] = reactExports.useState({});
  const [loading, setLoading] = reactExports.useState(true);
  const fetchPolicy = async () => {
    try {
      const res = await api.get("/admin/password/policy");
      setPolicy(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  reactExports.useEffect(() => {
    fetchPolicy();
  }, []);
  if (loading) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: "Loading..." });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Key, { className: "w-6 h-6 text-orange-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Password Policy" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Password complexity & 2FA settings" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: fetchPolicy, className: "p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-4 h-4" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-6", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "max-w-2xl space-y-4", children: Object.entries(policy).map(([key, val]) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-3 bg-bg-ops-surface rounded border border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-text-ops-primary capitalize", children: key.replace(/_/g, " ") }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-mono text-text-ops-muted", children: JSON.stringify(val) })
    ] }, key)) }) })
  ] });
};
export {
  PasswordPolicyView as default
};
//# sourceMappingURL=PasswordPolicyView-BpVfp3Dz.js.map
