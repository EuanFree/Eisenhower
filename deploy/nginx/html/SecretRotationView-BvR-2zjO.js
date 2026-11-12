import { r as reactExports, j as jsxRuntimeExports, L as Lock, v as RefreshCw, b8 as KeyRound, b as api } from "./index-DwHrkWl2.js";
const SecretRotationView = () => {
  const [secrets, setSecrets] = reactExports.useState([]);
  const [history, setHistory] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const fetchAll = async () => {
    try {
      const [s, h] = await Promise.all([api.get("/admin/secrets"), api.get("/admin/secrets/history")]);
      setSecrets(s.data || []);
      setHistory(h.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  reactExports.useEffect(() => {
    fetchAll();
  }, []);
  const rotate = async (name) => {
    if (!confirm(`Rotate ${name}?`)) return;
    try {
      await api.post(`/admin/secrets/${name}/rotate`);
      await fetchAll();
    } catch (err) {
      console.error(err);
    }
  };
  if (loading) return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: "Loading..." });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Lock, { className: "w-6 h-6 text-amber-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Secret Rotation" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Manage sensitive secrets" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: fetchAll, className: "p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-4 h-4" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto p-6 space-y-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-medium text-text-ops-primary mb-3", children: "Managed Secrets" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: secrets.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-3 bg-bg-ops-surface rounded border border-border-ops-subtle", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-text-ops-primary", children: s.name }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-text-ops-muted", children: [
              "Type: ",
              s.type,
              " | Rotated: ",
              s.last_rotated || "Never",
              " | Count: ",
              s.rotation_count
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => rotate(s.name), className: "flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(KeyRound, { className: "w-4 h-4" }),
            " Rotate"
          ] })
        ] }, s.name)) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-base font-medium text-text-ops-primary mb-3", children: [
          "Rotation History (",
          history.length,
          ")"
        ] }),
        history.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted text-sm", children: "No rotation history" }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle text-text-ops-muted", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3", children: "Secret" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3", children: "Rotated At" })
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: history.map((h, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-primary", children: h.secret_name }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted text-xs", children: new Date(h.rotated_at).toLocaleString() })
          ] }, i)) })
        ] })
      ] })
    ] })
  ] });
};
export {
  SecretRotationView as default
};
//# sourceMappingURL=SecretRotationView-BvR-2zjO.js.map
