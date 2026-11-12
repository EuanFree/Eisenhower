import { r as reactExports, b as api, j as jsxRuntimeExports, B as BarChart3, v as RefreshCw, c as clsx, U as Users, z as TrendingUp, S as ShieldAlert, T as TriangleAlert, C as Clock, k as Calendar, aH as Minus, $ as FileText, X, a9 as TrendingDown } from "./index-DwHrkWl2.js";
const HORIZON_OPTIONS = [6, 12, 24, 36];
const CLEARANCE_TIERS = ["BPSS", "SC", "DV", "NATO_SECRET"];
const ACCREDITATION_LEVELS = ["DAL_A", "DAL_B", "DAL_C", "DAL_D", "DAL_E"];
const CLEARANCE_LEAD_TIMES = {
  DV: 270,
  NATO_SECRET: 180,
  SC: 90,
  BPSS: 14
};
const HOURS_PER_MONTH = 160;
function formatMonthKey(key) {
  const [year, month] = key.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
function formatMonthKeyShort(key) {
  const [year, month] = key.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}
function getCellStatus(demandHours, capacityHours) {
  if (capacityHours === 0 && demandHours > 0) return "severe";
  if (capacityHours === 0) return "balanced";
  const ratio = demandHours / capacityHours;
  if (ratio > 1.1) {
    return ratio > 1.5 ? "severe" : "deficit";
  }
  if (ratio < 0.9 && demandHours > 0) return "balanced";
  return "balanced";
}
function getCellClasses(status) {
  switch (status) {
    case "balanced":
      return "bg-slate-700/60 text-slate-300";
    case "deficit":
      return "bg-amber-600/40 text-amber-100 border border-amber-500/50";
    case "severe":
      return "bg-red-600/50 text-red-100 border-2 border-red-500 animate-pulse";
  }
}
function getStatusIcon(status) {
  switch (status) {
    case "balanced":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(Minus, { className: "w-3 h-3" });
    case "deficit":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingDown, { className: "w-3 h-3" });
    case "severe":
      return /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { className: "w-3 h-3" });
  }
}
function getSeverityClasses(severity) {
  switch (severity) {
    case "CRITICAL":
      return "bg-red-600/20 text-red-400 border-red-500/30";
    case "WARNING":
      return "bg-amber-600/20 text-amber-400 border-amber-500/30";
    default:
      return "bg-blue-600/20 text-blue-400 border-blue-500/30";
  }
}
function estimateHeadcount(gapHours) {
  return Math.ceil(gapHours / HOURS_PER_MONTH);
}
const CreateRequisitionModal = ({ data, onClose }) => {
  const [submitting, setSubmitting] = reactExports.useState(false);
  const [title, setTitle] = reactExports.useState("");
  const [description, setDescription] = reactExports.useState("");
  reactExports.useEffect(() => {
    if (data) {
      setTitle(`Requisition: ${data.gap.tag} — ${data.clearanceTier}`);
      setDescription(
        `Pipeline deficit for ${data.gap.tag} (${data.gap.category}). Gap: ${data.gap.gap_hours.toFixed(0)} hours in ${data.gap.month}. Estimated headcount needed: ${data.headcount}.`
      );
    }
  }, [data]);
  if (!data) return null;
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api.post("/requisitions/", {
        title,
        description,
        clearance_level: data.clearanceTier,
        required_headcount: data.headcount,
        start_date: data.startDate,
        end_date: data.endDate,
        skill_tags: [data.gap.tag],
        category: data.gap.category
      });
      onClose();
    } catch (e) {
      console.error("Failed to create requisition:", e);
    } finally {
      setSubmitting(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-border-ops-strong rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "w-5 h-5 text-violet-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold text-text-ops-primary", children: "Generate Labor Requisition" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: onClose,
          className: "p-1.5 rounded-lg hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "w-4 h-4" })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-6 py-5 space-y-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 rounded-lg bg-red-600/10 border border-red-500/20", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4 text-red-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium text-red-400", children: "Pipeline Deficit Detected" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: data.gap.message })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-text-ops-muted mb-1.5", children: "Requisition Title" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: title,
            onChange: (e) => setTitle(e.target.value),
            className: "w-full px-3 py-2 rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:border-blue-500/50"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-text-ops-muted mb-1.5", children: "Description" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "textarea",
          {
            value: description,
            onChange: (e) => setDescription(e.target.value),
            rows: 3,
            className: "w-full px-3 py-2 rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:border-blue-500/50 resize-none"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-text-ops-muted mb-1.5", children: "Required Headcount" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-3 py-2 rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm font-mono", children: data.headcount })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-text-ops-muted mb-1.5", children: "Clearance Tier" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-3 py-2 rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm font-mono", children: data.clearanceTier })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-text-ops-muted mb-1.5", children: "Start Date" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-3 py-2 rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm font-mono", children: data.startDate })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-text-ops-muted mb-1.5", children: "End Date" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-3 py-2 rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm font-mono", children: data.endDate })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-end gap-3 px-6 py-4 border-t border-border-ops-subtle bg-bg-ops-overlay/50", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: onClose,
          className: "px-4 py-2 rounded-lg text-sm text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors",
          children: "Cancel"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: handleSubmit,
          disabled: submitting,
          className: clsx(
            "px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors",
            submitting && "opacity-50 cursor-not-allowed"
          ),
          children: submitting ? "Creating..." : "Submit Requisition"
        }
      )
    ] })
  ] }) });
};
const DeficitCard = ({ gap, onGenerateRequisition }) => {
  const leadTime = CLEARANCE_LEAD_TIMES[gap.tag] || 0;
  const headcount = estimateHeadcount(gap.gap_hours);
  const isBreached = gap.is_deficit && gap.minimum_action_date;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: clsx(
        "p-4 rounded-lg border transition-all",
        isBreached ? "bg-red-600/10 border-red-500/40" : "bg-bg-ops-overlay/50 border-border-ops-subtle"
      ),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between mb-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            gap.category === "CLEARANCE" && /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { className: "w-4 h-4 text-amber-400" }),
            gap.category === "SKILL" && /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { className: "w-4 h-4 text-blue-400" }),
            gap.category === "SAFETY" && /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4 text-red-400" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-semibold text-text-ops-primary", children: gap.tag }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: clsx(
              "px-2 py-0.5 rounded text-[10px] font-medium border",
              getSeverityClasses(gap.severity)
            ), children: gap.severity })
          ] }),
          isBreached && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white animate-pulse", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "w-3 h-3" }),
            "BREACHED"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-2 mb-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Category:" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 text-text-ops-primary", children: gap.category })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Month:" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 text-text-ops-primary", children: formatMonthKey(gap.month) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Demand:" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ml-1 text-text-ops-primary", children: [
              gap.demand_hours.toFixed(0),
              " hrs"
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Available:" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ml-1 text-text-ops-primary", children: [
              gap.available_hours.toFixed(0),
              " hrs"
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Gap:" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ml-1 text-red-400 font-medium", children: [
              gap.gap_hours.toFixed(0),
              " hrs"
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Est. Headcount:" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 text-text-ops-primary", children: headcount })
          ] }),
          leadTime > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Lead Time:" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ml-1 text-text-ops-primary", children: [
              leadTime,
              " days"
            ] })
          ] }),
          gap.minimum_action_date && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Min Action Date:" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: clsx(
              "ml-1 font-medium",
              isBreached ? "text-red-400" : "text-text-ops-primary"
            ), children: new Date(gap.minimum_action_date).toLocaleDateString("en-GB") })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted mb-3 line-clamp-2", children: gap.message }),
        isBreached && /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: () => onGenerateRequisition(gap),
            className: "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "w-4 h-4" }),
              "Generate Requisition"
            ]
          }
        )
      ]
    }
  );
};
const WorkforceForecastView = () => {
  const [loading, setLoading] = reactExports.useState(true);
  const [forecast, setForecast] = reactExports.useState(null);
  const [horizonMonths, setHorizonMonths] = reactExports.useState(36);
  const [departmentFilter, setDepartmentFilter] = reactExports.useState("");
  const [clearanceFilter, setClearanceFilter] = reactExports.useState("");
  const [accreditationFilter, setAccreditationFilter] = reactExports.useState("");
  const [selectedCategory, setSelectedCategory] = reactExports.useState("ALL");
  const [requisitionData, setRequisitionData] = reactExports.useState(null);
  const programmeId = reactExports.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("programme_id") || "";
  }, []);
  const fetchForecast = reactExports.useCallback(async () => {
    if (!programmeId) return;
    setLoading(true);
    try {
      const response = await api.get("/resources/workforce-forecast", {
        params: {
          programme_id: programmeId,
          horizon_months: horizonMonths
        }
      });
      setForecast(response);
    } catch (e) {
      console.error("Failed to fetch workforce forecast:", e);
    } finally {
      setLoading(false);
    }
  }, [programmeId, horizonMonths]);
  reactExports.useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);
  const filteredGaps = reactExports.useMemo(() => {
    if (!forecast) return [];
    let gaps = forecast.pipeline_gaps;
    if (selectedCategory !== "ALL") {
      gaps = gaps.filter((g) => g.category === selectedCategory);
    }
    if (clearanceFilter) {
      gaps = gaps.filter((g) => g.tag === clearanceFilter);
    }
    if (accreditationFilter) {
      gaps = gaps.filter((g) => g.tag === accreditationFilter);
    }
    const severityOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    return gaps.sort((a, b) => {
      const sa = severityOrder[a.severity] ?? 3;
      const sb = severityOrder[b.severity] ?? 3;
      if (sa !== sb) return sa - sb;
      return b.gap_hours - a.gap_hours;
    });
  }, [forecast, selectedCategory, clearanceFilter, accreditationFilter]);
  const heatmapData = reactExports.useMemo(() => {
    if (!forecast) return [];
    const vectors = forecast.demand_vectors;
    const monthKeys = Object.keys(vectors.by_month);
    return monthKeys.map((monthKey) => {
      const demand = vectors.by_month[monthKey] || 0;
      const capacity = Math.max(
        demand * 0.8,
        // rough estimate: 80% of demand is covered
        HOURS_PER_MONTH * 2
      );
      const status = getCellStatus(demand, capacity);
      const gap = demand - capacity;
      return {
        month: monthKey,
        label: formatMonthKey(monthKey),
        shortLabel: formatMonthKeyShort(monthKey),
        demand,
        capacity,
        gap,
        status
      };
    });
  }, [forecast]);
  const handleGenerateRequisition = reactExports.useCallback((gap) => {
    const headcount = estimateHeadcount(gap.gap_hours);
    CLEARANCE_LEAD_TIMES[gap.tag] || 0;
    const [year, month] = gap.month.split("-").map(Number);
    const targetDate = new Date(year, month - 1, 1);
    const today = /* @__PURE__ */ new Date();
    const startDate = gap.minimum_action_date ? new Date(gap.minimum_action_date) : today;
    const endDate = new Date(targetDate);
    endDate.setMonth(endDate.getMonth() + 1);
    setRequisitionData({
      gap,
      tag: gap.tag,
      category: gap.category,
      headcount,
      clearanceTier: gap.category === "CLEARANCE" ? gap.tag : "",
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0]
    });
  }, []);
  if (loading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-8 h-8 rounded-full border-2 border-border-ops-subtle border-t-blue-500 animate-spin" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "Computing workforce forecast..." })
    ] }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full overflow-auto", children: [
    requisitionData && /* @__PURE__ */ jsxRuntimeExports.jsx(
      CreateRequisitionModal,
      {
        data: requisitionData,
        onClose: () => setRequisitionData(null)
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-surface/80 backdrop-blur-sm sticky top-0 z-10", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(BarChart3, { className: "w-6 h-6 text-blue-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Workforce Forecast & Vetting Demand" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: "36-month competency forecasting with pipeline deficit analysis" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: fetchForecast,
          disabled: loading,
          className: "p-2 rounded-lg hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors disabled:opacity-50",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: clsx("w-4 h-4", loading && "animate-spin") })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-overlay/30", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-end gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-[200px]", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-text-ops-muted mb-1.5", children: "Planning Horizon" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "range",
              min: 0,
              max: HORIZON_OPTIONS.length - 1,
              value: HORIZON_OPTIONS.indexOf(horizonMonths),
              onChange: (e) => setHorizonMonths(HORIZON_OPTIONS[parseInt(e.target.value)]),
              className: "flex-1 h-2 bg-bg-ops-overlay rounded-lg appearance-none cursor-pointer accent-blue-500"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "px-3 py-1 rounded-lg bg-blue-600/20 text-blue-400 text-sm font-mono font-medium min-w-[60px] text-center", children: [
            horizonMonths,
            "m"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-text-ops-muted mb-1.5", children: "Department" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "select",
          {
            value: departmentFilter,
            onChange: (e) => setDepartmentFilter(e.target.value),
            className: "px-3 py-2 rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:border-blue-500/50",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "All Departments" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "AVIONICS", children: "Avionics" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "PROPULSION", children: "Propulsion" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "STRUCTURES", children: "Structures" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "SOFTWARE", children: "Software" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "TEST", children: "Test & Evaluation" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-text-ops-muted mb-1.5", children: "Security Clearance" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "select",
          {
            value: clearanceFilter,
            onChange: (e) => setClearanceFilter(e.target.value),
            className: "px-3 py-2 rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:border-blue-500/50",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "All Clearances" }),
              CLEARANCE_TIERS.map((tier) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: tier, children: tier }, tier))
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-text-ops-muted mb-1.5", children: "Accreditation" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "select",
          {
            value: accreditationFilter,
            onChange: (e) => setAccreditationFilter(e.target.value),
            className: "px-3 py-2 rounded-lg bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:border-blue-500/50",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "All Levels" }),
              ACCREDITATION_LEVELS.map((level) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: level, children: level }, level))
            ]
          }
        )
      ] })
    ] }) }),
    forecast && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-6 py-3 border-b border-border-ops-subtle bg-bg-ops-overlay/20", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-6 overflow-x-auto", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { className: "w-4 h-4 text-blue-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted", children: "Activities:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-semibold text-text-ops-primary", children: forecast.cpm_summary.total_activities })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingUp, { className: "w-4 h-4 text-green-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted", children: "Total Gaps:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-semibold text-text-ops-primary", children: forecast.gap_summary.total_gaps })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { className: "w-4 h-4 text-red-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted", children: "Critical:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-semibold text-red-400", children: forecast.gap_summary.critical })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4 text-amber-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted", children: "Warnings:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-semibold text-amber-400", children: forecast.gap_summary.warning })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "w-4 h-4 text-orange-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted", children: "Action Required:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-semibold text-orange-400", children: forecast.gap_summary.action_required })
      ] }),
      forecast.calculated_at && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 ml-auto", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { className: "w-3 h-3 text-text-ops-muted" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-text-ops-muted", children: [
          "Calculated: ",
          new Date(forecast.calculated_at).toLocaleString("en-GB")
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 flex flex-col lg:flex-row overflow-hidden", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 flex flex-col overflow-hidden min-w-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-6 py-3 border-b border-border-ops-subtle flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(BarChart3, { className: "w-4 h-4 text-text-ops-muted" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-semibold text-text-ops-primary", children: "Demand vs. Capacity Heatmap" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 text-[10px] text-text-ops-muted", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-3 h-3 rounded bg-slate-700/60" }),
              "Balanced (±10%)"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-3 h-3 rounded bg-amber-600/40 border border-amber-500/50" }),
              "Deficit (>10%)"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-3 h-3 rounded bg-red-600/50 border-2 border-red-500" }),
              "Severe Breach"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-4", children: heatmapData.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "No forecast data available." }) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid gap-1", style: { gridTemplateColumns: `repeat(${Math.min(heatmapData.length, 12)}, 1fr)` }, children: heatmapData.map((cell) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: clsx(
              "rounded-lg p-2 min-h-[80px] flex flex-col justify-between cursor-default transition-all hover:scale-105",
              getCellClasses(cell.status)
            ),
            title: `${cell.label}
Demand: ${cell.demand.toFixed(0)} hrs
Capacity: ${cell.capacity.toFixed(0)} hrs
Gap: ${cell.gap.toFixed(0)} hrs`,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-medium opacity-70", children: cell.shortLabel }),
                getStatusIcon(cell.status)
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs font-bold", children: [
                  cell.demand.toFixed(0),
                  " hrs"
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[10px] opacity-60", children: [
                  "/ ",
                  cell.capacity.toFixed(0),
                  " hrs"
                ] })
              ] }),
              cell.gap > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[10px] font-medium text-red-300", children: [
                "+",
                cell.gap.toFixed(0),
                " gap"
              ] })
            ]
          },
          cell.month
        )) }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full lg:w-[420px] flex flex-col border-l border-border-ops-subtle overflow-hidden", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 py-3 border-b border-border-ops-subtle flex items-center justify-between", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4 text-amber-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-semibold text-text-ops-primary", children: "Pipeline Deficit Alerts" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-600/20 text-amber-400", children: filteredGaps.length })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 py-2 border-b border-border-ops-subtle flex gap-1", children: ["ALL", "CLEARANCE", "SKILL", "SAFETY"].map((cat) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => setSelectedCategory(cat),
            className: clsx(
              "px-3 py-1 rounded text-[10px] font-medium transition-colors",
              selectedCategory === cat ? "bg-blue-600/20 text-blue-400" : "text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay"
            ),
            children: cat
          },
          cat
        )) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-4 space-y-3", children: filteredGaps.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center h-full text-text-ops-muted gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Minus, { className: "w-8 h-8 opacity-30" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-center", children: "No pipeline deficits detected for the selected filters." })
        ] }) : filteredGaps.map((gap, idx) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          DeficitCard,
          {
            gap,
            onGenerateRequisition: handleGenerateRequisition
          },
          `${gap.tag}-${gap.month}-${idx}`
        )) })
      ] })
    ] })
  ] });
};
export {
  WorkforceForecastView as default
};
//# sourceMappingURL=WorkforceForecastView-CS-Yr-1X.js.map
