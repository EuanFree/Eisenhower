import { r as reactExports, j as jsxRuntimeExports, p as GitBranch, ab as Eye, bk as EyeOff, c as clsx, B as BarChart3, as as RotateCcw, l as Send, bo as Split, f as ChevronDown, g as ChevronRight, Z as Zap, T as TriangleAlert, bp as Pause, ax as DollarSign, R as React, aG as GitFork, ai as Layers, aH as Minus, K as Plus, A as Activity, k as Calendar, bq as Target, O as OctagonAlert, br as ArrowDownRight, bs as ArrowUpRight, d as CircleCheck, S as ShieldAlert, $ as FileText, X } from "./index-DwHrkWl2.js";
const MOCK_TASKS = [
  {
    id: "task-001",
    code: "1.0",
    name: "Programme Start",
    plannedStart: "2026-01-01",
    plannedEnd: "2026-01-01",
    baselineStart: "2026-01-01",
    baselineEnd: "2026-01-01",
    duration: 0,
    percentComplete: 100,
    predecessorIds: [],
    successorIds: ["task-002"],
    isMilestone: true,
    isContractGate: true,
    milestoneLabel: "P01 Programme Start",
    estimatedCost: 0,
    actualCost: 0,
    budgetedCost: 0,
    level: 0
  },
  {
    id: "task-002",
    code: "1.1",
    name: "Requirements Definition",
    plannedStart: "2026-01-02",
    plannedEnd: "2026-04-30",
    baselineStart: "2026-01-02",
    baselineEnd: "2026-04-30",
    duration: 100,
    percentComplete: 100,
    predecessorIds: ["task-001"],
    successorIds: ["task-003", "task-004"],
    subcontractorCage: "1A2B3",
    isMilestone: false,
    isContractGate: false,
    estimatedCost: 25e5,
    actualCost: 245e4,
    budgetedCost: 25e5,
    level: 1
  },
  {
    id: "task-003",
    code: "1.2",
    name: "Design Phase",
    plannedStart: "2026-05-01",
    plannedEnd: "2026-10-31",
    baselineStart: "2026-05-01",
    baselineEnd: "2026-10-31",
    duration: 150,
    percentComplete: 80,
    predecessorIds: ["task-002"],
    successorIds: ["task-005"],
    subcontractorCage: "4C5D6",
    isMilestone: false,
    isContractGate: false,
    estimatedCost: 5e6,
    actualCost: 42e5,
    budgetedCost: 48e5,
    level: 1
  },
  {
    id: "task-004",
    code: "1.2.1",
    name: "Subcontractor Procurement",
    plannedStart: "2026-05-01",
    plannedEnd: "2026-07-31",
    baselineStart: "2026-05-01",
    baselineEnd: "2026-07-31",
    duration: 80,
    percentComplete: 60,
    predecessorIds: ["task-002"],
    successorIds: ["task-003"],
    subcontractorCage: "7E8F9",
    isMilestone: false,
    isContractGate: false,
    estimatedCost: 15e5,
    actualCost: 9e5,
    budgetedCost: 12e5,
    level: 2
  },
  {
    id: "task-005",
    code: "1.3",
    name: "Integration Testing",
    plannedStart: "2026-11-01",
    plannedEnd: "2027-04-30",
    baselineStart: "2026-11-01",
    baselineEnd: "2027-04-30",
    duration: 170,
    percentComplete: 20,
    predecessorIds: ["task-003"],
    successorIds: ["task-006"],
    subcontractorCage: "4C5D6",
    isMilestone: false,
    isContractGate: false,
    estimatedCost: 8e6,
    actualCost: 16e5,
    budgetedCost: 2e6,
    level: 1
  },
  {
    id: "task-006",
    code: "1.3.1",
    name: "Range Testing Campaign",
    plannedStart: "2027-01-01",
    plannedEnd: "2027-03-31",
    baselineStart: "2027-01-01",
    baselineEnd: "2027-03-31",
    duration: 85,
    percentComplete: 0,
    predecessorIds: ["task-005"],
    successorIds: ["task-007"],
    subcontractorCage: "1A2B3",
    isMilestone: false,
    isContractGate: false,
    estimatedCost: 3e6,
    actualCost: 0,
    budgetedCost: 0,
    level: 2
  },
  {
    id: "task-007",
    code: "1.4",
    name: "System Acceptance Review",
    plannedStart: "2027-05-01",
    plannedEnd: "2027-06-30",
    baselineStart: "2027-05-01",
    baselineEnd: "2027-06-30",
    duration: 55,
    percentComplete: 0,
    predecessorIds: ["task-006"],
    successorIds: ["task-008"],
    isMilestone: false,
    isContractGate: false,
    estimatedCost: 2e6,
    actualCost: 0,
    budgetedCost: 0,
    level: 1
  },
  {
    id: "task-008",
    code: "M-01",
    name: "Critical Design Review",
    plannedStart: "2027-07-01",
    plannedEnd: "2027-07-01",
    baselineStart: "2027-07-01",
    baselineEnd: "2027-07-01",
    duration: 0,
    percentComplete: 0,
    predecessorIds: ["task-007"],
    successorIds: ["task-009"],
    isMilestone: true,
    isContractGate: true,
    milestoneLabel: "M-01 Critical Design Review",
    estimatedCost: 0,
    actualCost: 0,
    budgetedCost: 0,
    level: 1
  },
  {
    id: "task-009",
    code: "1.5",
    name: "Production & Deployment",
    plannedStart: "2027-07-02",
    plannedEnd: "2028-06-30",
    baselineStart: "2027-07-02",
    baselineEnd: "2028-06-30",
    duration: 350,
    percentComplete: 0,
    predecessorIds: ["task-008"],
    successorIds: ["task-010"],
    subcontractorCage: "7E8F9",
    isMilestone: false,
    isContractGate: false,
    estimatedCost: 15e6,
    actualCost: 0,
    budgetedCost: 0,
    level: 1
  },
  {
    id: "task-010",
    code: "M-04",
    name: "System Handover",
    plannedStart: "2028-07-01",
    plannedEnd: "2028-07-01",
    baselineStart: "2028-07-01",
    baselineEnd: "2028-07-01",
    duration: 0,
    percentComplete: 0,
    predecessorIds: ["task-009"],
    successorIds: [],
    isMilestone: true,
    isContractGate: true,
    milestoneLabel: "M-04 System Handover",
    estimatedCost: 0,
    actualCost: 0,
    budgetedCost: 0,
    level: 1
  }
];
function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addWorkingDays(dateStr, days) {
  const d = new Date(dateStr);
  const sign = days >= 0 ? 1 : -1;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    d.setDate(d.getDate() + sign);
    if (d.getDay() !== 0 && d.getDay() !== 6) remaining--;
  }
  return formatDate(d);
}
function daysBetween(dateStr1, dateStr2) {
  const d1 = parseDate(dateStr1);
  const d2 = parseDate(dateStr2);
  if (!d1 || !d2) return 0;
  return Math.round((d2.getTime() - d1.getTime()) / (1e3 * 60 * 60 * 24));
}
function formatCurrency(value) {
  if (Math.abs(value) >= 1e6) {
    return `£${(value / 1e6).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1e3) {
    return `£${(value / 1e3).toFixed(0)}K`;
  }
  return `£${value.toFixed(0)}`;
}
function formatShortDate(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
const ShockEventRibbon = ({ tasks, onApplyShock, appliedShocks }) => {
  const [supplierCage, setSupplierCage] = reactExports.useState("");
  const [delayDays, setDelayDays] = reactExports.useState(14);
  const [stoppageStart, setStoppageStart] = reactExports.useState("2027-01-15");
  const [stoppageEnd, setStoppageEnd] = reactExports.useState("2027-02-28");
  const [budgetPercent, setBudgetPercent] = reactExports.useState(80);
  const [expanded, setExpanded] = reactExports.useState(false);
  const cageCodes = reactExports.useMemo(() => {
    const cages = /* @__PURE__ */ new Set();
    for (const t of tasks) {
      if (t.subcontractorCage) cages.add(t.subcontractorCage);
    }
    return Array.from(cages);
  }, [tasks]);
  const handleSupplierDelay = () => {
    const affectedTasks = tasks.filter((t) => t.subcontractorCage === supplierCage);
    if (affectedTasks.length === 0) return;
    const shock = {
      id: `shock-supplier-${Date.now()}`,
      type: "SUPPLIER_DELAY",
      label: `Supplier Delay: ${supplierCage} (+${delayDays}d)`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      parameters: { cageCode: supplierCage, delayDays },
      affectedTaskIds: affectedTasks.map((t) => t.id),
      deltaDays: delayDays,
      deltaCost: affectedTasks.reduce((sum, t) => sum + t.estimatedCost * 0.05, 0)
    };
    onApplyShock(shock);
  };
  const handleRangeStoppage = () => {
    const stoppageStartD = parseDate(stoppageStart);
    const stoppageEndD = parseDate(stoppageEnd);
    if (!stoppageStartD || !stoppageEndD) return;
    const affectedTasks = tasks.filter((t) => {
      const tStart = parseDate(t.plannedStart);
      const tEnd = parseDate(t.plannedEnd);
      if (!tStart || !tEnd) return false;
      return tStart <= stoppageEndD && tEnd >= stoppageStartD;
    });
    const days = daysBetween(stoppageStart, stoppageEnd);
    const shock = {
      id: `shock-range-${Date.now()}`,
      type: "RANGE_STOPPAGE",
      label: `Range Stoppage: ${formatShortDate(stoppageStart)} → ${formatShortDate(stoppageEnd)}`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      parameters: { stoppageStart, stoppageEnd, days },
      affectedTaskIds: affectedTasks.map((t) => t.id),
      deltaDays: days,
      deltaCost: affectedTasks.reduce((sum, t) => sum + t.estimatedCost * 0.1, 0)
    };
    onApplyShock(shock);
  };
  const handleBudgetCut = () => {
    const affectedTasks = tasks.filter((t) => t.estimatedCost > 0);
    const cutAmount = affectedTasks.reduce((sum, t) => {
      return sum + t.estimatedCost * (1 - budgetPercent / 100);
    }, 0);
    const shock = {
      id: `shock-budget-${Date.now()}`,
      type: "BUDGET_CUT",
      label: `Budget Cut: ${budgetPercent}% of FY allocation`,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      parameters: { budgetPercent, cutAmount },
      affectedTaskIds: affectedTasks.map((t) => t.id),
      deltaDays: Math.round(affectedTasks.reduce((sum, t) => sum + t.duration * (1 - budgetPercent / 100) * 0.5, 0)),
      deltaCost: -cutAmount
    };
    onApplyShock(shock);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-b border-border-ops-subtle bg-bg-ops-surface", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        onClick: () => setExpanded(!expanded),
        className: "flex items-center gap-2 w-full px-4 py-2 text-sm text-text-ops-primary hover:bg-bg-ops-overlay transition-colors",
        children: [
          expanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { size: 14 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { size: 14 }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Zap, { size: 14, className: "text-amber-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium", children: "Shock Event Injectors" }),
          appliedShocks.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ml-auto bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-full", children: [
            appliedShocks.length,
            " active"
          ] })
        ]
      }
    ),
    expanded && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-4 pb-4 space-y-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-3 rounded-lg bg-bg-ops-base border border-border-ops-subtle space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-sm text-text-ops-primary", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 14, className: "text-amber-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium", children: "Inject Supplier Delay" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "select",
            {
              value: supplierCage,
              onChange: (e) => setSupplierCage(e.target.value),
              className: "flex-1 bg-bg-ops-surface border border-border-ops-subtle rounded px-2 py-1 text-sm text-text-ops-primary",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "Select subcontractor CAGE..." }),
                cageCodes.map((cage) => /* @__PURE__ */ jsxRuntimeExports.jsxs("option", { value: cage, children: [
                  "CAGE: ",
                  cage
                ] }, cage))
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "number",
              value: delayDays,
              onChange: (e) => setDelayDays(Number(e.target.value)),
              className: "w-20 bg-bg-ops-surface border border-border-ops-subtle rounded px-2 py-1 text-sm text-text-ops-primary text-center",
              min: 1,
              max: 365
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted", children: "days" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: handleSupplierDelay,
              disabled: !supplierCage,
              className: "px-3 py-1 bg-amber-500/20 text-amber-400 rounded text-xs font-medium hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed",
              children: "Apply"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-3 rounded-lg bg-bg-ops-base border border-border-ops-subtle space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-sm text-text-ops-primary", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Pause, { size: 14, className: "text-red-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium", children: "Range / Chamber Stoppage" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "date",
              value: stoppageStart,
              onChange: (e) => setStoppageStart(e.target.value),
              className: "flex-1 bg-bg-ops-surface border border-border-ops-subtle rounded px-2 py-1 text-sm text-text-ops-primary"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted", children: "→" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "date",
              value: stoppageEnd,
              onChange: (e) => setStoppageEnd(e.target.value),
              className: "flex-1 bg-bg-ops-surface border border-border-ops-subtle rounded px-2 py-1 text-sm text-text-ops-primary"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: handleRangeStoppage,
              className: "px-3 py-1 bg-red-500/20 text-red-400 rounded text-xs font-medium hover:bg-red-500/30",
              children: "Apply"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-3 rounded-lg bg-bg-ops-base border border-border-ops-subtle space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-sm text-text-ops-primary", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(DollarSign, { size: 14, className: "text-emerald-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium", children: "Budget Cut Truncation" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "range",
              min: 50,
              max: 100,
              value: budgetPercent,
              onChange: (e) => setBudgetPercent(Number(e.target.value)),
              className: "flex-1"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-sm text-text-ops-primary w-12 text-right", children: [
            budgetPercent,
            "%"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: handleBudgetCut,
              className: "px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded text-xs font-medium hover:bg-emerald-500/30",
              children: "Apply"
            }
          )
        ] })
      ] }),
      appliedShocks.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted font-medium", children: "Applied Shocks:" }),
        appliedShocks.map((shock) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-xs text-text-ops-muted px-2 py-1 bg-bg-ops-overlay rounded", children: [
          shock.type === "SUPPLIER_DELAY" && /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 10, className: "text-amber-400" }),
          shock.type === "RANGE_STOPPAGE" && /* @__PURE__ */ jsxRuntimeExports.jsx(Pause, { size: 10, className: "text-red-400" }),
          shock.type === "BUDGET_CUT" && /* @__PURE__ */ jsxRuntimeExports.jsx(DollarSign, { size: 10, className: "text-emerald-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: shock.label }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ml-auto text-amber-400", children: [
            "+",
            shock.deltaDays,
            "d"
          ] })
        ] }, shock.id))
      ] })
    ] })
  ] });
};
const SandtableBar = React.memo(({
  task,
  dateToX,
  rowHeight,
  barHeight,
  isBaseline,
  isSandbox,
  isAffected
}) => {
  const xStart = dateToX(task.plannedStart);
  const xEnd = dateToX(task.plannedEnd);
  const width = Math.max(2, xEnd - xStart);
  const y = (rowHeight - barHeight) / 2;
  let bgColor = "bg-sky-500";
  let borderColor = "border-sky-400";
  if (isBaseline) {
    bgColor = "bg-slate-500/40";
    borderColor = "border-slate-400/40";
  } else if (isSandbox) {
    if (isAffected) {
      bgColor = "bg-amber-500";
      borderColor = "border-amber-400";
    } else {
      bgColor = "bg-violet-500";
      borderColor = "border-violet-400";
    }
  }
  if (task.isMilestone) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        style: {
          position: "absolute",
          left: `${xStart - 4}px`,
          top: `${y}px`,
          width: "8px",
          height: `${barHeight + 4}px`,
          transform: "rotate(45deg)"
        },
        className: clsx(
          "rounded-sm border",
          isBaseline ? "bg-slate-400/40 border-slate-300/40" : isSandbox && isAffected ? "bg-amber-500 border-amber-400" : isSandbox ? "bg-violet-500 border-violet-400" : "bg-sky-500 border-sky-400"
        ),
        title: `${task.code} ${task.name || task.milestoneLabel}`
      }
    );
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      style: {
        position: "absolute",
        left: `${xStart}px`,
        top: `${y}px`,
        width: `${width}px`,
        height: `${barHeight}px`
      },
      className: clsx(
        "rounded-sm border",
        bgColor,
        borderColor,
        isBaseline && "opacity-50",
        isSandbox && isAffected && "ring-1 ring-amber-300/50"
      ),
      title: `${task.code} ${task.name} (${task.duration}d)`,
      children: task.percentComplete > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          style: { width: `${task.percentComplete}%` },
          className: clsx(
            "h-full rounded-sm",
            isBaseline ? "bg-slate-400/30" : isSandbox && isAffected ? "bg-amber-400/40" : isSandbox ? "bg-violet-400/40" : "bg-sky-400/40"
          )
        }
      )
    }
  );
});
const SandtablePane = React.memo(({
  title,
  tasks,
  zoom,
  startDate,
  endDate,
  dateToX,
  affectedTaskIds,
  showBaseline,
  isSandbox,
  onZoomIn,
  onZoomOut
}) => {
  const containerRef = reactExports.useRef(null);
  const rowHeight = 32;
  const barHeight = 18;
  const pixelsPerDay = zoom === "DAYS" ? 4 : zoom === "WEEKS" ? 2 : 0.5;
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1e3 * 60 * 60 * 24));
  const timelineWidth = totalDays * pixelsPerDay;
  const timelineDates = reactExports.useMemo(() => {
    const dates = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      const dow = current.getDay();
      const day = current.getDate();
      let label = "";
      let isMajor = false;
      switch (zoom) {
        case "DAYS":
          label = String(day);
          isMajor = dow === 1;
          break;
        case "WEEKS":
          if (dow === 1) {
            const d = new Date(Date.UTC(current.getFullYear(), current.getMonth(), current.getDate()));
            const dayNum = d.getUTCDay() || 7;
            d.setUTCDate(d.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 864e5 + 1) / 7);
            label = `W${weekNum}`;
            isMajor = day <= 7;
          }
          break;
        case "MONTHS":
          if (day === 1) {
            const monthName = current.toLocaleString("en-GB", { month: "short" });
            const year = String(current.getFullYear()).slice(-2);
            label = `${monthName} '${year}`;
            isMajor = true;
          }
          break;
      }
      if (label) {
        dates.push({ date: new Date(current), label, isMajor });
      }
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }, [startDate, endDate, zoom]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { ref: containerRef, className: "flex flex-col h-full border border-border-ops-subtle rounded-lg overflow-hidden", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 px-3 py-1.5 bg-bg-ops-surface border-b border-border-ops-subtle", children: [
      isSandbox ? /* @__PURE__ */ jsxRuntimeExports.jsx(GitFork, { size: 12, className: "text-violet-400" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Layers, { size: 12, className: "text-sky-400" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-medium text-text-ops-primary", children: title }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-text-ops-muted uppercase", children: zoom }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onZoomOut, className: "p-0.5 hover:bg-bg-ops-overlay rounded text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Minus, { size: 10 }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onZoomIn, className: "p-0.5 hover:bg-bg-ops-overlay rounded text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { size: 10 }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-7 bg-bg-ops-surface border-b border-border-ops-subtle overflow-hidden flex-shrink-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { position: "relative", height: "100%", width: `${timelineWidth}px` }, children: timelineDates.map((td, i) => {
      const x = dateToX(formatDate(td.date));
      if (x < 0) return null;
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          style: {
            position: "absolute",
            left: `${x}px`,
            top: 0,
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderLeft: td.isMajor ? "1px solid var(--border-ops-strong, #475569)" : "1px solid var(--border-ops-subtle, #334155)",
            paddingLeft: "4px",
            minWidth: zoom === "DAYS" ? 20 : zoom === "WEEKS" ? 14 : 10
          },
          children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { fontSize: "9px", color: td.isMajor ? "#F8FAFC" : "#94A3B8", fontFamily: "var(--font-mono, ui-monospace, monospace)", whiteSpace: "nowrap" }, children: td.label })
        },
        i
      );
    }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto", style: { minWidth: `${timelineWidth}px` }, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { style: { position: "relative", height: `${tasks.length * rowHeight}px`, width: `${timelineWidth}px` }, children: [
      timelineDates.map((td, i) => {
        const x = dateToX(formatDate(td.date));
        if (x < 0) return null;
        return /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            style: {
              position: "absolute",
              left: `${x}px`,
              top: 0,
              bottom: 0,
              width: "1px",
              backgroundColor: td.isMajor ? "var(--border-ops-strong, #475569)" : "var(--border-ops-subtle, #334155)",
              opacity: td.isMajor ? 0.5 : 0.2
            }
          },
          i
        );
      }),
      tasks.map((task, index) => {
        const y = index * rowHeight;
        const isAffected = affectedTaskIds.has(task.id);
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            style: {
              position: "absolute",
              top: `${y}px`,
              left: 0,
              width: `${timelineWidth}px`,
              height: `${rowHeight}px`,
              borderBottom: "1px solid var(--border-ops-subtle, #334155)",
              boxSizing: "border-box"
            },
            children: [
              showBaseline && /* @__PURE__ */ jsxRuntimeExports.jsx(
                SandtableBar,
                {
                  task: { ...task, plannedStart: task.baselineStart, plannedEnd: task.baselineEnd },
                  dateToX,
                  rowHeight,
                  barHeight,
                  isBaseline: true
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                SandtableBar,
                {
                  task,
                  dateToX,
                  rowHeight,
                  barHeight,
                  isSandbox,
                  isAffected
                }
              )
            ]
          },
          task.id
        );
      })
    ] }) })
  ] });
});
const DeltaHUD = ({ metrics, visible }) => {
  if (!visible) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border border-border-ops-subtle bg-bg-ops-surface rounded-lg p-3 space-y-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-sm text-text-ops-primary", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Activity, { size: 14, className: "text-sky-400" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium", children: "Comparative Delta Telemetry" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-2 rounded bg-bg-ops-base border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 text-xs text-text-ops-muted mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { size: 10 }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Completion Date" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: clsx(
          "text-lg font-bold font-mono",
          metrics.completionDateSlippage > 0 ? "text-red-400" : metrics.completionDateSlippage < 0 ? "text-emerald-400" : "text-text-ops-primary"
        ), children: [
          metrics.completionDateSlippage > 0 ? "+" : "",
          metrics.completionDateSlippage,
          "d"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[10px] text-text-ops-muted mt-0.5", children: [
          formatShortDate(metrics.originalCompletionDate),
          " → ",
          formatShortDate(metrics.sandboxCompletionDate)
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-2 rounded bg-bg-ops-base border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 text-xs text-text-ops-muted mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(DollarSign, { size: 10 }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Program EAC" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: clsx(
          "text-lg font-bold font-mono",
          metrics.eacVariance > 0 ? "text-red-400" : metrics.eacVariance < 0 ? "text-emerald-400" : "text-text-ops-primary"
        ), children: [
          metrics.eacVariance > 0 ? "+" : "",
          formatCurrency(metrics.eacVariance)
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[10px] text-text-ops-muted mt-0.5", children: [
          formatCurrency(metrics.originalEAC),
          " → ",
          formatCurrency(metrics.sandboxEAC)
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-2 rounded bg-bg-ops-base border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 text-xs text-text-ops-muted mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Target, { size: 10 }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Monte Carlo P80" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: clsx(
          "text-lg font-bold font-mono",
          metrics.p80Shift > 0 ? "text-amber-400" : "text-text-ops-primary"
        ), children: metrics.p80Shift > 0 ? "+P80" : "P80" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[10px] text-text-ops-muted mt-0.5", children: [
          formatShortDate(metrics.p80OriginalDate),
          " → ",
          formatShortDate(metrics.p80SandboxDate)
        ] }),
        metrics.p80Shift > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[10px] text-amber-400 mt-0.5", children: [
          "P80 slips by ",
          metrics.p80Shift,
          "d"
        ] })
      ] })
    ] }),
    metrics.milestoneVariances.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t border-border-ops-subtle pt-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted font-medium mb-2", children: "Milestone Variance Matrix" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-1", children: metrics.milestoneVariances.map((mv) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: clsx(
            "flex items-center gap-2 text-xs px-2 py-1 rounded",
            mv.isBreached ? "bg-red-500/10 border border-red-500/30" : mv.varianceDays !== 0 ? "bg-amber-500/10 border border-amber-500/30" : "bg-bg-ops-base border border-border-ops-subtle"
          ),
          children: [
            mv.isBreached ? /* @__PURE__ */ jsxRuntimeExports.jsx(OctagonAlert, { size: 10, className: "text-red-400" }) : mv.varianceDays > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowDownRight, { size: 10, className: "text-amber-400" }) : mv.varianceDays < 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowUpRight, { size: 10, className: "text-emerald-400" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 10, className: "text-emerald-400" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-text-ops-primary", children: mv.milestoneLabel }),
            mv.isContractGate && /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { size: 10, className: "text-sky-400" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: formatShortDate(mv.baselineDate) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "→" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: clsx(
              mv.isBreached ? "text-red-400" : mv.varianceDays > 0 ? "text-amber-400" : "text-text-ops-primary"
            ), children: formatShortDate(mv.sandboxDate) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ml-auto font-mono text-[10px]", children: [
              mv.varianceDays > 0 ? "+" : "",
              mv.varianceDays,
              "d"
            ] })
          ]
        },
        mv.milestoneId
      )) })
    ] })
  ] });
};
const BCRSubmissionModal = ({ metrics, shockEvents, onSubmit, onClose }) => {
  const [officerName, setOfficerName] = reactExports.useState("");
  const [justification, setJustification] = reactExports.useState("");
  const [submitting, setSubmitting] = reactExports.useState(false);
  const handleSubmit = async () => {
    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setSubmitting(false);
    onSubmit();
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-border-ops-subtle rounded-lg shadow-2xl w-full max-w-lg mx-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-sm text-text-ops-primary", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { size: 14, className: "text-sky-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium", children: "Baseline Change Request (BCR) Package" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onClose, className: "p-1 hover:bg-bg-ops-overlay rounded text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 14 }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-4 py-4 space-y-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-3 rounded bg-bg-ops-base border border-border-ops-subtle space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted font-medium", children: "Sandbox Delta Summary" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-2 text-xs", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Completion Slippage:" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: clsx(
              " ml-1 font-mono font-bold",
              metrics.completionDateSlippage > 0 ? "text-red-400" : "text-emerald-400"
            ), children: [
              metrics.completionDateSlippage > 0 ? "+" : "",
              metrics.completionDateSlippage,
              "d"
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "EAC Variance:" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: clsx(
              " ml-1 font-mono font-bold",
              metrics.eacVariance > 0 ? "text-red-400" : "text-emerald-400"
            ), children: formatCurrency(metrics.eacVariance) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Shock Events:" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 font-mono text-text-ops-primary", children: shockEvents.length })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Breached Gates:" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 font-mono text-red-400", children: metrics.milestoneVariances.filter((mv) => mv.isBreached).length })
          ] })
        ] })
      ] }),
      shockEvents.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted font-medium", children: "Applied Shock Events" }),
        shockEvents.map((shock) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-primary px-2 py-1 bg-bg-ops-overlay rounded", children: shock.label }, shock.id))
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Officer Name" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              value: officerName,
              onChange: (e) => setOfficerName(e.target.value),
              placeholder: "Enter your name...",
              className: "w-full bg-bg-ops-base border border-border-ops-subtle rounded px-3 py-1.5 text-sm text-text-ops-primary placeholder:text-text-ops-muted"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Justification" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "textarea",
            {
              value: justification,
              onChange: (e) => setJustification(e.target.value),
              placeholder: "Provide justification for this baseline change...",
              rows: 3,
              className: "w-full bg-bg-ops-base border border-border-ops-subtle rounded px-3 py-1.5 text-sm text-text-ops-primary placeholder:text-text-ops-muted resize-none"
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-end gap-2 px-4 py-3 border-t border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: onClose,
          className: "px-3 py-1.5 text-xs text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay rounded",
          children: "Cancel"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: handleSubmit,
          disabled: !officerName || !justification || submitting,
          className: "px-4 py-1.5 bg-sky-500/20 text-sky-400 rounded text-xs font-medium hover:bg-sky-500/30 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5",
          children: submitting ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-3 h-3 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" }),
            "Submitting..."
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Send, { size: 12 }),
            "Submit to Change Control Board"
          ] })
        }
      )
    ] })
  ] }) });
};
const ScenarioSandtableView = () => {
  const [tasks, setTasks] = reactExports.useState(MOCK_TASKS);
  const [sandboxTasks, setSandboxTasks] = reactExports.useState(MOCK_TASKS);
  const [shockEvents, setShockEvents] = reactExports.useState([]);
  const [zoom, setZoom] = reactExports.useState("WEEKS");
  const [showDeltaHUD, setShowDeltaHUD] = reactExports.useState(true);
  const [showBCRModal, setShowBCRModal] = reactExports.useState(false);
  const [showBaselineInSandbox, setShowBaselineInSandbox] = reactExports.useState(true);
  const { startDate, endDate } = reactExports.useMemo(() => {
    let minDate = null;
    let maxDate = null;
    for (const task of tasks) {
      const start = parseDate(task.plannedStart);
      const end = parseDate(task.plannedEnd);
      if (start && (!minDate || start < minDate)) minDate = start;
      if (end && (!maxDate || end > maxDate)) maxDate = end;
    }
    if (!minDate || !maxDate) {
      minDate = /* @__PURE__ */ new Date("2026-01-01");
      maxDate = /* @__PURE__ */ new Date("2028-12-31");
    }
    const padding = (maxDate.getTime() - minDate.getTime()) * 0.1;
    return {
      startDate: new Date(minDate.getTime() - padding),
      endDate: new Date(maxDate.getTime() + padding)
    };
  }, [tasks]);
  const pixelsPerDay = zoom === "DAYS" ? 4 : zoom === "WEEKS" ? 2 : 0.5;
  Math.ceil((endDate.getTime() - startDate.getTime()) / (1e3 * 60 * 60 * 24));
  const dateToX = reactExports.useCallback((dateStr) => {
    const d = parseDate(dateStr);
    if (!d) return 0;
    const diffMs = d.getTime() - startDate.getTime();
    const diffDays = diffMs / (1e3 * 60 * 60 * 24);
    return diffDays * pixelsPerDay;
  }, [startDate, pixelsPerDay]);
  const affectedTaskIds = reactExports.useMemo(() => {
    const ids = /* @__PURE__ */ new Set();
    for (const shock of shockEvents) {
      for (const id of shock.affectedTaskIds) {
        ids.add(id);
      }
    }
    return ids;
  }, [shockEvents]);
  const handleApplyShock = reactExports.useCallback((shock) => {
    setShockEvents((prev) => [...prev, shock]);
    setSandboxTasks((prev) => {
      const updated = [...prev];
      for (const task of updated) {
        if (shock.affectedTaskIds.includes(task.id)) {
          switch (shock.type) {
            case "SUPPLIER_DELAY": {
              const days = shock.deltaDays;
              task.plannedStart = addWorkingDays(task.plannedStart, days);
              task.plannedEnd = addWorkingDays(task.plannedEnd, days);
              break;
            }
            case "RANGE_STOPPAGE": {
              const days = shock.deltaDays;
              task.plannedStart = addWorkingDays(task.plannedStart, days);
              task.plannedEnd = addWorkingDays(task.plannedEnd, days);
              break;
            }
            case "BUDGET_CUT": {
              const percent = shock.parameters.budgetPercent / 100;
              const newDuration = Math.round(task.duration * percent);
              const newEnd = parseDate(task.plannedStart);
              if (newEnd) {
                let remaining = newDuration;
                while (remaining > 0) {
                  newEnd.setDate(newEnd.getDate() + 1);
                  if (newEnd.getDay() !== 0 && newEnd.getDay() !== 6) remaining--;
                }
                task.plannedEnd = formatDate(newEnd);
                task.duration = newDuration;
              }
              break;
            }
          }
        }
      }
      return updated;
    });
  }, []);
  const handleReset = reactExports.useCallback(() => {
    setSandboxTasks([...MOCK_TASKS]);
    setShockEvents([]);
  }, []);
  const deltaMetrics = reactExports.useMemo(() => {
    const baselineTasks = tasks.filter((t) => t.successorIds.length === 0 && t.isMilestone);
    const sandboxTasksFiltered = sandboxTasks.filter((t) => t.successorIds.length === 0 && t.isMilestone);
    const baselineCompletion = baselineTasks.length > 0 ? baselineTasks.reduce((max, t) => {
      const d = parseDate(t.plannedEnd);
      return !d || max && d < max ? max : d;
    }, null) : null;
    const sandboxCompletion = sandboxTasksFiltered.length > 0 ? sandboxTasksFiltered.reduce((max, t) => {
      const d = parseDate(t.plannedEnd);
      return !d || max && d < max ? max : d;
    }, null) : null;
    const originalCompletionDate = baselineCompletion ? formatDate(baselineCompletion) : "2028-07-01";
    const sandboxCompletionDate = sandboxCompletion ? formatDate(sandboxCompletion) : "2028-07-01";
    const completionDateSlippage = daysBetween(originalCompletionDate, sandboxCompletionDate);
    const originalEAC = tasks.reduce((sum, t) => sum + t.estimatedCost, 0);
    const sandboxEAC = sandboxTasks.reduce((sum, t) => sum + t.estimatedCost, 0) + shockEvents.reduce((sum, s) => sum + s.deltaCost, 0);
    const eacVariance = sandboxEAC - originalEAC;
    const p80Shift = Math.round(completionDateSlippage * 1.2);
    const p80OriginalDate = addWorkingDays(originalCompletionDate, 14);
    const p80SandboxDate = addWorkingDays(sandboxCompletionDate, 14 + p80Shift);
    const milestoneVariances = tasks.filter((t) => t.isMilestone && t.isContractGate).map((bt) => {
      const st = sandboxTasks.find((t) => t.id === bt.id);
      if (!st) return null;
      const varianceDays = daysBetween(bt.plannedEnd, st.plannedEnd);
      return {
        milestoneId: bt.id,
        milestoneLabel: bt.milestoneLabel || bt.name,
        baselineDate: bt.plannedEnd,
        sandboxDate: st.plannedEnd,
        varianceDays,
        isContractGate: true,
        isBreached: varianceDays > 0
      };
    }).filter((mv) => mv !== null);
    return {
      completionDateSlippage,
      originalCompletionDate,
      sandboxCompletionDate,
      eacVariance,
      originalEAC,
      sandboxEAC,
      p80OriginalDate,
      p80SandboxDate,
      p80Shift,
      milestoneVariances
    };
  }, [tasks, sandboxTasks, shockEvents]);
  const zoomIn = () => {
    setZoom((prev) => {
      if (prev === "DAYS") return "DAYS";
      if (prev === "WEEKS") return "DAYS";
      return "WEEKS";
    });
  };
  const zoomOut = () => {
    setZoom((prev) => {
      if (prev === "MONTHS") return "MONTHS";
      if (prev === "WEEKS") return "MONTHS";
      return "WEEKS";
    });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full bg-bg-ops-base", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-4 py-2.5 border-b border-border-ops-subtle bg-bg-ops-surface", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(GitBranch, { size: 18, className: "text-violet-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-base font-semibold text-text-ops-primary", children: "Programme Scenario Sandtable" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: "Interactive What-If Simulation Environment" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => setShowBaselineInSandbox(!showBaselineInSandbox),
            className: clsx(
              "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
              showBaselineInSandbox ? "bg-sky-500/20 text-sky-400" : "bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary"
            ),
            children: [
              showBaselineInSandbox ? /* @__PURE__ */ jsxRuntimeExports.jsx(Eye, { size: 10 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(EyeOff, { size: 10 }),
              "Baseline Overlay"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => setShowDeltaHUD(!showDeltaHUD),
            className: clsx(
              "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
              showDeltaHUD ? "bg-amber-500/20 text-amber-400" : "bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary"
            ),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(BarChart3, { size: 10 }),
              "Delta HUD"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: handleReset,
            className: "flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RotateCcw, { size: 10 }),
              "Reset"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => setShowBCRModal(true),
            disabled: shockEvents.length === 0,
            className: "flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/20 text-sky-400 rounded text-xs font-medium hover:bg-sky-500/30 disabled:opacity-40 disabled:cursor-not-allowed",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Send, { size: 10 }),
              "Submit to Change Control Board"
            ]
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ShockEventRibbon,
      {
        tasks,
        onApplyShock: handleApplyShock,
        appliedShocks: shockEvents
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-1 overflow-hidden", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 flex flex-col gap-2 p-3 overflow-hidden", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-h-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          SandtablePane,
          {
            title: "Master Schedule (Baseline / Live)",
            tasks,
            zoom,
            startDate,
            endDate,
            dateToX,
            affectedTaskIds,
            onZoomIn: zoomIn,
            onZoomOut: zoomOut
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 py-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 h-px bg-border-ops-subtle" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Split, { size: 12, className: "text-text-ops-muted" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 h-px bg-border-ops-subtle" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-h-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          SandtablePane,
          {
            title: "Sandbox Simulation Branch",
            tasks: sandboxTasks,
            zoom,
            startDate,
            endDate,
            dateToX,
            affectedTaskIds,
            showBaseline: showBaselineInSandbox,
            isSandbox: true,
            onZoomIn: zoomIn,
            onZoomOut: zoomOut
          }
        ) })
      ] }),
      showDeltaHUD && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-80 border-l border-border-ops-subtle bg-bg-ops-surface overflow-auto p-3 space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DeltaHUD, { metrics: deltaMetrics, visible: true }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t border-border-ops-subtle pt-3 space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted font-medium", children: "Legend" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1 text-[11px] text-text-ops-muted", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-3 h-2 rounded-sm bg-sky-500" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Master Schedule" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-3 h-2 rounded-sm bg-slate-500/40" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Baseline Overlay" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-3 h-2 rounded-sm bg-violet-500" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Sandbox (Unaffected)" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-3 h-2 rounded-sm bg-amber-500" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Sandbox (Affected)" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t border-border-ops-subtle pt-3 space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted font-medium", children: "Quick Stats" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1 text-[11px]", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Total Tasks" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-primary font-mono", children: sandboxTasks.length })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Affected Tasks" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-amber-400 font-mono", children: affectedTaskIds.size })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Shock Events" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sky-400 font-mono", children: shockEvents.length })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Breached Gates" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-red-400 font-mono", children: deltaMetrics.milestoneVariances.filter((mv) => mv.isBreached).length })
            ] })
          ] })
        ] })
      ] })
    ] }),
    showBCRModal && /* @__PURE__ */ jsxRuntimeExports.jsx(
      BCRSubmissionModal,
      {
        metrics: deltaMetrics,
        shockEvents,
        onSubmit: () => setShowBCRModal(false),
        onClose: () => setShowBCRModal(false)
      }
    )
  ] });
};
export {
  ScenarioSandtableView as default
};
//# sourceMappingURL=ScenarioSandtableView-9M0-4lz1.js.map
