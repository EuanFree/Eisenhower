import { r as reactExports, b as api, j as jsxRuntimeExports, aR as HardDrive, v as RefreshCw, K as Plus, D as Shield, af as Trash2 } from "./index-DwHrkWl2.js";
const BackupManagerView = () => {
  const [backups, setBackups] = reactExports.useState([]);
  const [status, setStatus] = reactExports.useState(null);
  const [loading, setLoading] = reactExports.useState(true);
  const [creating, setCreating] = reactExports.useState(false);
  const fetchBackups = reactExports.useCallback(async () => {
    try {
      const res = await api.get("/admin/backups");
      setBackups(res.data || []);
    } catch (err) {
      console.error("Failed to fetch backups:", err);
    }
  }, []);
  const fetchStatus = reactExports.useCallback(async () => {
    try {
      const res = await api.get("/admin/backups/status");
      setStatus(res.data);
    } catch (err) {
      console.error("Failed to fetch status:", err);
    }
  }, []);
  reactExports.useEffect(() => {
    Promise.all([fetchBackups(), fetchStatus()]).finally(() => setLoading(false));
  }, [fetchBackups, fetchStatus]);
  const handleCreateBackup = async () => {
    setCreating(true);
    try {
      await api.post("/admin/backups");
      await fetchBackups();
      await fetchStatus();
    } catch (err) {
      console.error("Failed to create backup:", err);
    }
    setCreating(false);
  };
  const handleDeleteBackup = async (id) => {
    if (!confirm(`Delete backup ${id}?`)) return;
    try {
      await api.delete(`/admin/backups/${id}`);
      await fetchBackups();
      await fetchStatus();
    } catch (err) {
      console.error("Failed to delete backup:", err);
    }
  };
  const handleVerifyBackup = async (id) => {
    var _a, _b;
    try {
      const res = await api.post(`/admin/backups/${id}/verify`);
      alert(((_a = res.data) == null ? void 0 : _a.valid) ? "Backup verified!" : `Verification failed: ${(_b = res.data) == null ? void 0 : _b.message}`);
      await fetchBackups();
    } catch (err) {
      console.error("Failed to verify backup:", err);
    }
  };
  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };
  if (loading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: "Loading backup data..." });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(HardDrive, { className: "w-6 h-6 text-blue-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Backup Manager" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Database backup & restore" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => {
              fetchBackups();
              fetchStatus();
            },
            className: "p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-4 h-4" })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: handleCreateBackup,
            disabled: creating,
            className: "flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm disabled:opacity-50",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "w-4 h-4" }),
              creating ? "Creating..." : "New Backup"
            ]
          }
        )
      ] })
    ] }),
    status && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-4 gap-4 px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-text-ops-muted", children: "Total Backups" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-text-ops-primary", children: status.total_backups })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-text-ops-muted", children: "Latest Backup" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-lg font-bold text-text-ops-primary", children: status.latest_backup ? new Date(status.latest_backup).toLocaleDateString() : "Never" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-text-ops-muted", children: "Total Size" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-text-ops-primary", children: formatSize(status.total_size_bytes) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-text-ops-muted", children: "Retention" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-2xl font-bold text-text-ops-primary", children: [
          status.retention_days,
          " days"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-6", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle text-text-ops-muted", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Backup ID" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Type" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Size" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Created" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Duration" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Verified" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-2 px-3 font-medium", children: "Actions" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("tbody", { children: [
        backups.map((b) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle hover:bg-bg-ops-overlay", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: b.backup_id }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 bg-bg-ops-overlay rounded text-xs", children: b.backup_type }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-primary", children: formatSize(b.size_bytes) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted text-xs", children: new Date(b.created_at).toLocaleString() }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "py-2 px-3 text-text-ops-muted", children: [
            b.duration_seconds.toFixed(1),
            "s"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: b.verified ? /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-4 h-4 text-green-400" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "—" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-right", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-end gap-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => handleVerifyBackup(b.backup_id), className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-green-400", title: "Verify", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-3.5 h-3.5" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => handleDeleteBackup(b.backup_id), className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-red-400", title: "Delete", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "w-3.5 h-3.5" }) })
          ] }) })
        ] }, b.backup_id)),
        backups.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("td", { colSpan: 7, className: "py-8 text-center text-text-ops-muted", children: "No backups found. Create your first backup." }) })
      ] })
    ] }) })
  ] });
};
export {
  BackupManagerView as default
};
//# sourceMappingURL=BackupManagerView-BXEc-Da-.js.map
