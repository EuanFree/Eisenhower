import { r as reactExports, b as api, j as jsxRuntimeExports, S as ShieldAlert, X, T as TriangleAlert, d as CircleCheck, $ as FileText, x as LoaderCircle, c as clsx, v as RefreshCw, aa as FileSpreadsheet, l as Send, aJ as CircleX, F as Filter, al as Search, C as Clock } from "./index-DwHrkWl2.js";
const ROOT_CAUSE_OPTIONS = [
  { value: "TECHNICAL_NON_CONFORMANCE", label: "Technical Non-Conformance" },
  { value: "TEST_RIG_DOWNTIME", label: "Test Rig Downtime" },
  { value: "MATERIAL_INCOMPATIBILITY", label: "Material Incompatibility" },
  { value: "RESOURCE_SKILL_GAP", label: "Resource Skill Gap" },
  { value: "SCHEDULE_COMPRESSION", label: "Schedule Compression" },
  { value: "EXTERNAL_DEPENDENCY_DELAY", label: "External Dependency Delay" },
  { value: "OTHER", label: "Other" }
];
function todayAsIso() {
  const d = /* @__PURE__ */ new Date();
  return d.toISOString().split("T")[0];
}
function formatDate$1(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  } catch {
    return iso;
  }
}
const CamVarianceJustificationModal = ({
  batch,
  isOpen,
  onClose,
  onSubmit
}) => {
  const [form, setForm] = reactExports.useState({
    rootCauseCategory: "",
    technicalNarrative: "",
    correctiveActionPlan: "",
    recoveryDate: todayAsIso()
  });
  const [submitting, setSubmitting] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const [success, setSuccess] = reactExports.useState(false);
  const modalRef = reactExports.useRef(null);
  const narrativeRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (isOpen) {
      setForm({
        rootCauseCategory: "",
        technicalNarrative: "",
        correctiveActionPlan: "",
        recoveryDate: todayAsIso()
      });
      setSubmitting(false);
      setError(null);
      setSuccess(false);
      setTimeout(() => {
        var _a;
        return (_a = narrativeRef.current) == null ? void 0 : _a.focus();
      }, 100);
    }
  }, [isOpen]);
  reactExports.useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === "Escape" && !submitting) {
        onClose();
      }
      if (e.key === "Enter" && e.ctrlKey && !submitting) {
        handleSubmit();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, submitting, onClose]);
  const handleBackdropClick = reactExports.useCallback(
    (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    },
    [onClose]
  );
  const handleFieldChange = reactExports.useCallback(
    (field) => (e) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      setError(null);
    },
    []
  );
  const isFormValid = reactExports.useCallback(() => {
    const f = form;
    return f.rootCauseCategory !== "" && f.technicalNarrative.trim().length > 0 && f.correctiveActionPlan.trim().length > 0 && f.recoveryDate !== "";
  }, [form]);
  const handleSubmit = reactExports.useCallback(async () => {
    var _a, _b;
    if (!isFormValid() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        root_cause_category: form.rootCauseCategory,
        technical_narrative: form.technicalNarrative.trim(),
        corrective_action_plan: form.correctiveActionPlan.trim(),
        recovery_date: form.recoveryDate
      };
      await api.post(`/timesheets/${batch.id}/justify`, payload);
      setSuccess(true);
      setTimeout(() => {
        onSubmit(batch.id);
      }, 800);
    } catch (e) {
      console.error("Variance justification failed:", e);
      setError(
        ((_b = (_a = e == null ? void 0 : e.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) ?? (e == null ? void 0 : e.message) ?? "Failed to submit variance justification. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }, [form, batch.id, isFormValid, submitting, onSubmit]);
  if (!isOpen) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm",
      onClick: handleBackdropClick,
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "cam-variance-modal-title",
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          ref: modalRef,
          className: clsx(
            "relative w-full max-w-2xl max-h-[90vh] rounded-xl shadow-2xl overflow-hidden",
            "bg-bg-ops-surface border border-border-ops-subtle"
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-overlay/50", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-shrink-0 mt-0.5 p-2 rounded-lg bg-red-500/10 text-red-400", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { size: 20 }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "h2",
                    {
                      id: "cam-variance-modal-title",
                      className: "text-base font-semibold text-text-ops-primary",
                      children: "CAM Variance Justification"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm text-text-ops-muted mt-0.5", children: [
                    "Batch ",
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono", children: batch.batch_id }),
                    " —",
                    " ",
                    batch.work_package
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-text-ops-muted mt-1", children: [
                    "Week: ",
                    formatDate$1(batch.week_start),
                    " – ",
                    formatDate$1(batch.week_end)
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: onClose,
                  disabled: submitting,
                  className: "p-1.5 rounded-lg text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors disabled:opacity-50",
                  title: "Close (Esc)",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 18 })
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-6 mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 14, className: "text-amber-400 flex-shrink-0" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-semibold text-amber-400", children: "Divergence Detected" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-2 text-xs", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Labor Burn:" }),
                  " ",
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-mono font-semibold text-amber-400", children: [
                    batch.labor_burn_pct.toFixed(1),
                    "%"
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Physical %:" }),
                  " ",
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-mono font-semibold text-red-400", children: [
                    batch.physical_pct_complete.toFixed(1),
                    "%"
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "ACWP:" }),
                  " ",
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-text-ops-primary", children: new Intl.NumberFormat("en-GB", {
                    style: "currency",
                    currency: "GBP",
                    minimumFractionDigits: 0
                  }).format(batch.acwp) })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "PV:" }),
                  " ",
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-text-ops-primary", children: new Intl.NumberFormat("en-GB", {
                    style: "currency",
                    currency: "GBP",
                    minimumFractionDigits: 0
                  }).format(batch.pv) })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-6 py-4 overflow-y-auto max-h-[50vh] space-y-4", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-sm font-medium text-text-ops-primary mb-1.5", children: [
                  "Root Cause Category ",
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-red-400", children: "*" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "select",
                  {
                    value: form.rootCauseCategory,
                    onChange: handleFieldChange("rootCauseCategory"),
                    className: "w-full px-3 py-2 text-sm rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-sky-400",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "Select root cause category..." }),
                      ROOT_CAUSE_OPTIONS.map((opt) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: opt.value, children: opt.label }, opt.value))
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-sm font-medium text-text-ops-primary mb-1.5", children: [
                  "Technical Narrative (IPMR Format 5) ",
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-red-400", children: "*" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted mb-1.5", children: "Provide variance analysis following IPMR Format 5: describe the cause of the labor-progress divergence, its effect on the work package schedule and cost, and any downstream impact on the critical path." }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "textarea",
                  {
                    ref: narrativeRef,
                    value: form.technicalNarrative,
                    onChange: handleFieldChange("technicalNarrative"),
                    rows: 5,
                    placeholder: "Cause: ...\nEffect: ...\nDownstream Impact: ...",
                    className: "w-full px-3 py-2 text-sm rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary placeholder-text-ops-muted focus:outline-none focus:ring-2 focus:ring-sky-400 resize-y"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-sm font-medium text-text-ops-primary mb-1.5", children: [
                  "Corrective Action Plan ",
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-red-400", children: "*" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "textarea",
                  {
                    value: form.correctiveActionPlan,
                    onChange: handleFieldChange("correctiveActionPlan"),
                    rows: 3,
                    placeholder: "Describe the corrective measures being taken to recover the variance...",
                    className: "w-full px-3 py-2 text-sm rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary placeholder-text-ops-muted focus:outline-none focus:ring-2 focus:ring-sky-400 resize-y"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-sm font-medium text-text-ops-primary mb-1.5", children: [
                  "Recovery Date ",
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-red-400", children: "*" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    type: "date",
                    value: form.recoveryDate,
                    onChange: handleFieldChange("recoveryDate"),
                    className: "w-full px-3 py-2 text-sm rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-sky-400"
                  }
                )
              ] }),
              error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm border border-red-500/20", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 14 }),
                error
              ] }),
              success && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm border border-emerald-500/20", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 14 }),
                "Variance justification submitted. Hold flag cleared."
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-t border-border-ops-subtle bg-bg-ops-overlay/50", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-xs text-text-ops-muted", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { size: 12 }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                  "Narrative will be attached to the EVM audit trail for batch",
                  " ",
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono", children: batch.batch_id }),
                  "."
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    onClick: onClose,
                    disabled: submitting,
                    className: "px-4 py-2 text-sm font-medium rounded-lg text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors disabled:opacity-50",
                    children: "Dismiss"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    onClick: handleSubmit,
                    disabled: !isFormValid() || submitting,
                    className: clsx(
                      "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors",
                      "focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-bg-ops-surface",
                      !isFormValid() || submitting ? "bg-bg-ops-overlay text-text-ops-muted cursor-not-allowed" : "bg-sky-600 text-white hover:bg-sky-500"
                    ),
                    children: submitting ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { size: 14, className: "animate-spin" }),
                      "Submitting..."
                    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 14 }),
                      "Submit Variance Justification"
                    ] })
                  }
                )
              ] })
            ] })
          ]
        }
      )
    }
  );
};
function isDivergentRow(batch) {
  const laborBurnWithNoProgress = batch.labor_burn_pct > 15 && batch.physical_pct_complete === 0;
  const acwpExceedsPv = batch.pv > 0 && batch.acwp / batch.pv - 1 >= 0.2;
  return laborBurnWithNoProgress || acwpExceedsPv;
}
function formatCurrency(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}
function formatPct(value) {
  return `${value.toFixed(1)}%`;
}
function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  } catch {
    return iso;
  }
}
const DivergenceBadge = ({ status }) => {
  if (status === "NORMAL") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 12 }),
      "Normal"
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-400", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 12 }),
    "Divergence"
  ] });
};
const ExportBadge = ({ status }) => {
  switch (status) {
    case "STAGED":
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-sky-500/10 text-sky-400", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 12 }),
        "Staged"
      ] });
    case "HELD_FOR_CAM_JUSTIFICATION":
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-500/10 text-red-400", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { size: 12 }),
        "Held"
      ] });
    case "CLEARED":
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 12 }),
        "Cleared"
      ] });
  }
};
const TimesheetCoherenceView = () => {
  const [batches, setBatches] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [selectedIds, setSelectedIds] = reactExports.useState(/* @__PURE__ */ new Set());
  const [divergenceFilter, setDivergenceFilter] = reactExports.useState("ALL");
  const [exportFilter, setExportFilter] = reactExports.useState("ALL");
  const [wpSearch, setWpSearch] = reactExports.useState("");
  const [justificationBatch, setJustificationBatch] = reactExports.useState(null);
  const [justificationModalOpen, setJustificationModalOpen] = reactExports.useState(false);
  const [exporting, setExporting] = reactExports.useState(false);
  const [exportMessage, setExportMessage] = reactExports.useState(null);
  const fetchBatches = reactExports.useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.get("/timesheets/batches");
      setBatches((resp == null ? void 0 : resp.data) ?? resp ?? []);
    } catch (e) {
      console.error("Failed to fetch timesheet batches:", e);
    } finally {
      setLoading(false);
    }
  }, []);
  reactExports.useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);
  const filteredBatches = reactExports.useMemo(() => {
    return batches.filter((batch) => {
      if (divergenceFilter !== "ALL" && batch.divergence_status !== divergenceFilter) {
        return false;
      }
      if (exportFilter !== "ALL" && batch.export_status !== exportFilter) {
        return false;
      }
      if (wpSearch) {
        const search = wpSearch.toLowerCase();
        const matchesWp = batch.work_package.toLowerCase().includes(search) || batch.wp_code.toLowerCase().includes(search) || batch.batch_id.toLowerCase().includes(search);
        if (!matchesWp) return false;
      }
      return true;
    });
  }, [batches, divergenceFilter, exportFilter, wpSearch]);
  const toggleSelect = reactExports.useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  const selectAll = reactExports.useCallback(() => {
    setSelectedIds(new Set(filteredBatches.map((b) => b.id)));
  }, [filteredBatches]);
  const clearSelection = reactExports.useCallback(() => {
    setSelectedIds(/* @__PURE__ */ new Set());
  }, []);
  const hasHeldBatches = reactExports.useMemo(() => {
    return filteredBatches.some(
      (b) => selectedIds.has(b.id) && b.export_status === "HELD_FOR_CAM_JUSTIFICATION"
    );
  }, [filteredBatches, selectedIds]);
  const selectedBatchCount = selectedIds.size;
  const handleJustificationSubmit = reactExports.useCallback((batchId) => {
    setJustificationModalOpen(false);
    setJustificationBatch(null);
    fetchBatches();
  }, [fetchBatches]);
  const handleOpenJustification = reactExports.useCallback((batch) => {
    setJustificationBatch(batch);
    setJustificationModalOpen(true);
  }, []);
  const handleTransmit = reactExports.useCallback(async () => {
    if (hasHeldBatches || selectedBatchCount === 0) return;
    setExporting(true);
    setExportMessage(null);
    try {
      await api.post("/timesheets/export/oracle", {
        batch_ids: Array.from(selectedIds)
      });
      setExportMessage(`Successfully transmitted ${selectedBatchCount} batch(es) to Oracle Projects.`);
      clearSelection();
      fetchBatches();
    } catch (e) {
      console.error("Export to Oracle Projects failed:", e);
      setExportMessage("Export failed. Check server logs for details.");
    } finally {
      setExporting(false);
    }
  }, [hasHeldBatches, selectedBatchCount, selectedIds, clearSelection, fetchBatches]);
  if (loading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { size: 16, className: "animate-spin" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm", children: "Loading timesheet batches..." })
    ] }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(FileSpreadsheet, { className: "w-6 h-6 text-sky-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Timesheet Coherence Workbench" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Time-to-progress inspection for Oracle Projects export" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: handleTransmit,
            disabled: hasHeldBatches || selectedBatchCount === 0 || exporting,
            className: clsx(
              "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-bg-ops-surface",
              hasHeldBatches || selectedBatchCount === 0 ? "bg-bg-ops-overlay text-text-ops-muted cursor-not-allowed" : exporting ? "bg-sky-600/50 text-white cursor-wait" : "bg-sky-600 text-white hover:bg-sky-500"
            ),
            title: hasHeldBatches ? "Cannot transmit: selected batches contain unresolved CAM justification holds" : selectedBatchCount === 0 ? "Select batches to transmit" : void 0,
            children: [
              exporting ? /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { size: 14, className: "animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Send, { size: 14 }),
              exporting ? "Transmitting..." : "Transmit to Oracle Projects",
              selectedBatchCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 px-1.5 py-0.5 text-xs rounded-full bg-white/20", children: selectedBatchCount })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: fetchBatches,
            className: "p-2 rounded-lg hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors",
            title: "Refresh",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { size: 16 })
          }
        )
      ] })
    ] }),
    exportMessage && /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: clsx(
          "mx-6 mt-3 px-4 py-2 rounded-lg text-sm flex items-center gap-2",
          exportMessage.startsWith("Successfully") ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
        ),
        children: [
          exportMessage.startsWith("Successfully") ? /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 14 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { size: 14 }),
          exportMessage,
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => setExportMessage(null),
              className: "ml-auto p-0.5 hover:bg-bg-ops-overlay rounded",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { size: 12 })
            }
          )
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 px-6 py-3 border-b border-border-ops-subtle bg-bg-ops-overlay/50", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Filter, { size: 14, className: "text-text-ops-muted flex-shrink-0" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "select",
        {
          value: divergenceFilter,
          onChange: (e) => setDivergenceFilter(e.target.value),
          className: "px-3 py-1.5 text-sm rounded-lg bg-bg-ops-surface border border-border-ops-subtle text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-sky-400",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "ALL", children: "All Divergence" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "NORMAL", children: "Normal" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "LABOR_PROGRESS_DIVERGENCE", children: "Divergence" })
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "select",
        {
          value: exportFilter,
          onChange: (e) => setExportFilter(e.target.value),
          className: "px-3 py-1.5 text-sm rounded-lg bg-bg-ops-surface border border-border-ops-subtle text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-sky-400",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "ALL", children: "All Export Status" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "STAGED", children: "Staged" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "HELD_FOR_CAM_JUSTIFICATION", children: "Held" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "CLEARED", children: "Cleared" })
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative flex-1 max-w-md", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { size: 14, className: "absolute left-3 top-1/2 -translate-y-1/2 text-text-ops-muted" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: wpSearch,
            onChange: (e) => setWpSearch(e.target.value),
            placeholder: "Search by Batch ID, WP Code, or Work Package...",
            className: "w-full pl-9 pr-3 py-1.5 text-sm rounded-lg bg-bg-ops-surface border border-border-ops-subtle text-text-ops-primary placeholder-text-ops-muted focus:outline-none focus:ring-2 focus:ring-sky-400"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 ml-auto", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: selectAll,
            className: "text-xs text-text-ops-muted hover:text-text-ops-primary transition-colors",
            children: "Select All"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "/" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: clearSelection,
            className: "text-xs text-text-ops-muted hover:text-text-ops-primary transition-colors",
            children: "Clear"
          }
        )
      ] })
    ] }),
    hasHeldBatches && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-6 mt-3 px-4 py-2 rounded-lg text-sm flex items-center gap-2 bg-amber-500/10 text-amber-400 border border-amber-500/20", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { size: 14 }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Export blocked:" }),
        " ",
        selectedBatchCount,
        " selected batch(es) contain unresolved CAM justification holds. Submit variance justification before transmitting."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "sticky top-0 z-10 bg-bg-ops-overlay/90 backdrop-blur-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle text-text-ops-muted", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-3 px-4 font-medium w-10", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "checkbox",
            checked: filteredBatches.length > 0 && selectedIds.size === filteredBatches.length,
            onChange: (e) => {
              if (e.target.checked) selectAll();
              else clearSelection();
            },
            className: "rounded border-border-ops-subtle bg-bg-ops-surface text-sky-500 focus:ring-sky-400"
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-3 px-4 font-medium", children: "Batch ID" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-3 px-4 font-medium", children: "Work Package" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-3 px-4 font-medium", children: "Week" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-3 px-4 font-medium", children: "Booked Hours" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-3 px-4 font-medium", children: "Labor Burn %" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-3 px-4 font-medium", children: "Physical %" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-3 px-4 font-medium", children: "ACWP" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-3 px-4 font-medium", children: "PV" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-3 px-4 font-medium", children: "Divergence" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-3 px-4 font-medium", children: "Export" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-3 px-4 font-medium", children: "Actions" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("tbody", { children: [
        filteredBatches.map((batch) => {
          const divergent = isDivergentRow(batch);
          const isSelected = selectedIds.has(batch.id);
          const isHeld = batch.export_status === "HELD_FOR_CAM_JUSTIFICATION";
          return /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "tr",
            {
              className: clsx(
                "border-b border-border-ops-subtle transition-colors",
                isSelected && "bg-sky-500/5",
                divergent && !isSelected && "bg-amber-500/5",
                isHeld && "bg-red-500/5",
                !divergent && !isHeld && !isSelected && "hover:bg-bg-ops-overlay"
              ),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-3 px-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    type: "checkbox",
                    checked: isSelected,
                    onChange: () => toggleSelect(batch.id),
                    className: "rounded border-border-ops-subtle bg-bg-ops-surface text-sky-500 focus:ring-sky-400"
                  }
                ) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-3 px-4 font-mono text-text-ops-primary text-xs", children: batch.batch_id }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "py-3 px-4", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-primary text-sm", children: batch.work_package }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted text-xs font-mono", children: batch.wp_code })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "py-3 px-4 text-text-ops-muted text-xs", children: [
                  formatDate(batch.week_start),
                  " – ",
                  formatDate(batch.week_end)
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-3 px-4 text-right font-mono text-text-ops-primary", children: batch.booked_labor_hours.toFixed(1) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-3 px-4 text-right font-mono", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "span",
                  {
                    className: clsx(
                      batch.labor_burn_pct > 15 && batch.physical_pct_complete === 0 ? "text-amber-400 font-semibold" : "text-text-ops-primary"
                    ),
                    children: formatPct(batch.labor_burn_pct)
                  }
                ) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-3 px-4 text-right font-mono", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "span",
                  {
                    className: clsx(
                      batch.physical_pct_complete === 0 && batch.labor_burn_pct > 15 ? "text-red-400 font-semibold" : "text-text-ops-primary"
                    ),
                    children: formatPct(batch.physical_pct_complete)
                  }
                ) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-3 px-4 text-right font-mono text-text-ops-primary", children: formatCurrency(batch.acwp) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-3 px-4 text-right font-mono text-text-ops-primary", children: formatCurrency(batch.pv) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-3 px-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(DivergenceBadge, { status: batch.divergence_status }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-3 px-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ExportBadge, { status: batch.export_status }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "py-3 px-4", children: [
                  isHeld && /* @__PURE__ */ jsxRuntimeExports.jsxs(
                    "button",
                    {
                      onClick: () => handleOpenJustification(batch),
                      className: "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400",
                      children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { size: 12 }),
                        "Submit Variance Justification"
                      ]
                    }
                  ),
                  !isHeld && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted text-xs", children: "—" })
                ] })
              ]
            },
            batch.id
          );
        }),
        filteredBatches.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { colSpan: 12, className: "py-12 text-center text-text-ops-muted", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(FileSpreadsheet, { size: 24, className: "mx-auto mb-2 opacity-50" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "No timesheet batches match the current filters." })
        ] }) })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-3 border-t border-border-ops-subtle bg-bg-ops-overlay/50 text-xs text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        filteredBatches.length,
        " batch(es) shown · ",
        selectedBatchCount,
        " selected"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        batches.filter((b) => b.export_status === "HELD_FOR_CAM_JUSTIFICATION").length,
        " held for justification"
      ] })
    ] }),
    justificationBatch && /* @__PURE__ */ jsxRuntimeExports.jsx(
      CamVarianceJustificationModal,
      {
        batch: justificationBatch,
        isOpen: justificationModalOpen,
        onClose: () => {
          setJustificationModalOpen(false);
          setJustificationBatch(null);
        },
        onSubmit: handleJustificationSubmit
      }
    )
  ] });
};
export {
  TimesheetCoherenceView as default
};
//# sourceMappingURL=TimesheetCoherenceView-BqF2LQVT.js.map
