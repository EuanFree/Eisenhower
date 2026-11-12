import { j as jsxRuntimeExports, B as BarChart3, a9 as TrendingDown, z as TrendingUp, bq as Target, aQ as Calculator, Y as CircleCheckBig, T as TriangleAlert, c as clsx } from "./index-DwHrkWl2.js";
const Section = ({ title, icon, children }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mb-10", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "flex items-center gap-2 text-xl font-semibold text-text-ops-primary mb-4", children: [
    icon,
    title
  ] }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-4 text-text-ops-muted leading-relaxed", children })
] });
const FormulaCard = ({
  metric,
  formula,
  description,
  interpretation,
  variant = "neutral"
}) => {
  const borderColors = {
    neutral: "border-border-ops-subtle",
    good: "border-green-500/30",
    bad: "border-red-500/30"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: clsx("border rounded-lg p-4", borderColors[variant]), children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-between mb-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold uppercase tracking-wider text-text-ops-muted", children: metric }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-mono text-sm text-text-ops-primary bg-bg-ops-base px-3 py-2 rounded mb-2", children: formula }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: description }),
    interpretation && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted mt-2 italic", children: interpretation })
  ] });
};
const InfoBox = ({ title, variant = "info", children }) => {
  const colors = {
    info: "border-sky-500/30 bg-sky-500/5",
    warning: "border-amber-500/30 bg-amber-500/5",
    success: "border-green-500/30 bg-green-500/5"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: clsx("border rounded-lg p-4", colors[variant]), children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-sm font-semibold text-text-ops-primary mb-2", children: title }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-text-ops-muted", children })
  ] });
};
const EVMHandbook = () => {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-4xl", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-8 pb-6 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-2xl font-bold text-text-ops-primary mb-2", children: "Earned Value Management (EVM) Handbook" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-text-ops-muted", children: "Formula reference cards for ANSI/EIA-748 compliant Earned Value Management, covering core metrics, variance analysis, performance indices, and forecasting." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Overview", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(BarChart3, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Earned Value Management (EVM) is a project management technique that integrates scope, schedule, and cost to objectively measure project performance. It compares three fundamental values at any point in time:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          FormulaCard,
          {
            metric: "PV",
            formula: "BCWS — Budgeted Cost for Work Scheduled",
            description: "The planned value of work that should have been completed by the status date.",
            interpretation: "Also called Planned Value. Represents the time-phased budget."
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          FormulaCard,
          {
            metric: "EV",
            formula: "BCWP — Budgeted Cost for Work Performed",
            description: "The earned value of work actually completed, measured against the budget.",
            interpretation: "Also called Earned Value. The objective measure of physical progress."
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          FormulaCard,
          {
            metric: "AC",
            formula: "ACWP — Actual Cost of Work Performed",
            description: "The actual cost incurred to complete the work performed.",
            interpretation: "Also called Actual Cost. Represents real expenditure."
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(InfoBox, { title: "ANSI/EIA-748 Compliance", variant: "info", children: "The Eisenhower Portfolio Manager implements five EVM techniques per ANSI/EIA-748: Percent Complete, 0/100 Rule, 50/50 Rule, Milestone Weights, and Level of Effort. Each technique determines how Earned Value (EV) is calculated for a given task." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Variance Calculations", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingDown, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Variances measure the difference between planned and actual performance. Negative variances indicate the project is over budget or behind schedule." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          FormulaCard,
          {
            metric: "CV",
            formula: "CV = EV - AC",
            description: "Cost Variance: Difference between earned value and actual cost.",
            interpretation: "CV > 0 means under budget. CV < 0 means over budget.",
            variant: "bad"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          FormulaCard,
          {
            metric: "SV",
            formula: "SV = EV - PV",
            description: "Schedule Variance: Difference between earned value and planned value.",
            interpretation: "SV > 0 means ahead of schedule. SV < 0 means behind schedule.",
            variant: "bad"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          FormulaCard,
          {
            metric: "VAC",
            formula: "VAC = BAC - EAC",
            description: "Variance at Completion: Difference between Budget at Completion and Estimate at Completion.",
            interpretation: "VAC > 0 means projected to finish under budget.",
            variant: "neutral"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Performance Indices", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingUp, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Performance indices are ratio-based measures of efficiency. A value of 1.0 indicates exactly on plan; values above 1.0 are favorable; below 1.0 are unfavorable." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          FormulaCard,
          {
            metric: "CPI",
            formula: "CPI = EV / AC",
            description: "Cost Performance Index: Ratio of earned value to actual cost.",
            interpretation: "CPI = 1.0 is on budget. CPI = 0.85 means £0.85 earned per £1.00 spent.",
            variant: "good"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          FormulaCard,
          {
            metric: "SPI",
            formula: "SPI = EV / PV",
            description: "Schedule Performance Index: Ratio of earned value to planned value.",
            interpretation: "SPI = 1.0 is on schedule. SPI = 0.90 means 90% of planned work completed.",
            variant: "good"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(InfoBox, { title: "Index Interpretation", variant: "warning", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "CPI < 1.0" }),
        " — The project is over budget. For every £1.00 spent, less than £1.00 of work has been earned.",
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "SPI < 1.0" }),
        " — The project is behind schedule. Less work has been completed than planned for the elapsed time.",
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        "Defence programmes typically require CPI ≥ 0.95 and SPI ≥ 0.90 for green status."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Forecasting", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Target, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Forecasting uses current performance to predict future project outcomes. The most common forecasts are Estimate at Completion (EAC) and Estimate to Complete (ETC)." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          FormulaCard,
          {
            metric: "EAC",
            formula: "EAC = BAC / CPI",
            description: "Estimate at Completion: Total projected cost based on current CPI.",
            interpretation: "If BAC = £1,000,000 and CPI = 0.85, EAC = £1,176,471.",
            variant: "neutral"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          FormulaCard,
          {
            metric: "ETC",
            formula: "ETC = EAC - AC",
            description: "Estimate to Complete: Remaining cost to finish the project.",
            interpretation: "ETC = EAC minus actual cost already incurred.",
            variant: "neutral"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "EVM Calculation Techniques", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Calculator, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
        "The system supports five EVM techniques for calculating Earned Value (EV). The technique is configured per task in the ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "evm_technique" }),
        " field."
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm border-collapse", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 text-text-ops-primary font-semibold", children: "Technique" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 text-text-ops-primary font-semibold", children: "EV Formula" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 text-text-ops-primary font-semibold", children: "Use Case" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("tbody", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "PERCENT_COMPLETE" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "EV = BAC × (percent_complete / 100)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "General tasks with subjective progress estimates" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "ZERO_100" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "EV = BAC if complete, else 0" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Deliverables with all-or-nothing completion" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "FIFTY_FIFTY" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "EV = 0.5×BAC if started, BAC if complete" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Tasks where start represents half the effort" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "MILESTONE_WEIGHTS" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "EV = BAC × Σ(verified step weights)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Tasks with defined milestone checkpoints" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "LEVEL_OF_EFFORT" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "EV = PV (enforces SV = 0)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Ongoing support activities (facilities, admin)" })
          ] })
        ] })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Milestone Weighting Rules", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheckBig, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "When using the Milestone Weights technique, Earned Value is calculated by summing the weights of verified milestone steps. The following rules apply:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "list-disc list-inside space-y-2 ml-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Weight sum must equal 1.000." }),
          " All milestone weight fractions for a single task must sum to exactly 1.000 (± 0.001 tolerance)."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Verification sign-off required." }),
          " Each milestone step must be explicitly verified as PASSED before its weight contributes to EV."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "WAIVED steps count." }),
          " A milestone step can be waived with justification; waived steps contribute their weight to EV."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Mandatory gate enforcement." }),
          " If ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "requires_vv_signoff" }),
          " ",
          "is true, setting percent_complete to 100% is rejected unless all mandatory verification test cases are PASSED or WAIVED."
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(InfoBox, { title: "Example", variant: "info", children: "A task with BAC = £100,000 has three milestone steps: Design Review (0.300), Prototype Build (0.400), and Final Test (0.300). If Design Review and Prototype Build are verified, EV = £100,000 × (0.300 + 0.400) = £70,000." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "S-Curve Analysis", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingUp, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "The S-Curve is a time-phased chart plotting cumulative PV, EV, and AC over the project lifecycle. It provides an at-a-glance view of schedule and cost performance." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs font-semibold uppercase tracking-wider text-sky-400 mb-1", children: "PV Curve" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "The planned baseline — shows when work was scheduled to be completed." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs font-semibold uppercase tracking-wider text-green-400 mb-1", children: "EV Curve" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "The earned value — shows actual work completed measured against budget." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs font-semibold uppercase tracking-wider text-red-400 mb-1", children: "AC Curve" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "The actual cost — shows real expenditure against the planned budget." })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-4", children: [
        "When the EV curve falls below the PV curve, the project is behind schedule. When the AC curve rises above the EV curve, the project is over budget. The system generates S-Curve data via",
        " ",
        /* @__PURE__ */ jsxRuntimeExports.jsxs("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: [
          "GET /api/v1/evm/projects/",
          "{id}",
          "/s-curve-data"
        ] }),
        "."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Variance Thresholds & Reporting", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Defence programmes typically define variance thresholds that trigger mandatory reporting and corrective action. The system auto-extracts tasks exceeding these thresholds for IPMR Format 5 (Variance Analysis Narrative):" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-red-500/30 rounded-lg p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs font-semibold uppercase tracking-wider text-red-400 mb-2", children: "Cost Threshold" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "|CV| exceeds ±10% of BAC or ±£25,000 — triggers variance narrative with Problem, Root Cause, Impact, and Corrective Action sections." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-amber-500/30 rounded-lg p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs font-semibold uppercase tracking-wider text-amber-400 mb-2", children: "Schedule Threshold" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "|SV| exceeds ±10% of PV or critical path slip > 5 days — triggers schedule impact analysis and recovery forecast." })
        ] })
      ] })
    ] })
  ] });
};
export {
  EVMHandbook as default
};
//# sourceMappingURL=EVMHandbook-D4NgYxQe.js.map
