import { j as jsxRuntimeExports, p as GitBranch, at as ArrowRight, C as Clock, aQ as Calculator, T as TriangleAlert, Y as CircleCheckBig, c as clsx } from "./index-DwHrkWl2.js";
const Section = ({ title, icon, children }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mb-10", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "flex items-center gap-2 text-xl font-semibold text-text-ops-primary mb-4", children: [
    icon,
    title
  ] }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-4 text-text-ops-muted leading-relaxed", children })
] });
const FormulaCard = ({ formula, description, example }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-mono text-sm text-text-ops-primary bg-bg-ops-base px-3 py-2 rounded mb-2", children: formula }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: description }),
  example && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-text-ops-muted mt-2 italic", children: [
    "Example: ",
    example
  ] })
] });
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
const CPMGuide = () => {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-4xl", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-8 pb-6 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-2xl font-bold text-text-ops-primary mb-2", children: "Critical Path Method (CPM) Scheduling Guide" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-text-ops-muted", children: "Reference documentation for the CPM engine, covering forward and backward pass calculations, float absorption rules, dependency types, and DCMA 14-Point compliance." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Overview", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(GitBranch, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
        "The Critical Path Method (CPM) is a deterministic scheduling algorithm that calculates the earliest and latest possible start and finish dates for every activity in a project network. It identifies the ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "critical path" }),
        " — the sequence of activities with zero or negative total float — which determines the minimum project duration."
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
        "In the Eisenhower Portfolio Manager, CPM operates on the Work Breakdown Structure (WBS) stored as a unified tree in PostgreSQL using the ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: "ltree" }),
        " extension. Activities are connected via Precedence Diagramming Method (PDM) dependency links, supporting all four relationship types: Finish-to-Start, Start-to-Start, Finish-to-Finish, and Start-to-Finish."
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(InfoBox, { title: "Key Concept", variant: "info", children: [
        "The critical path is not static. As tasks progress, resources shift, or blockers emerge, the critical path can migrate to different activities. The system recalculates CPM on demand via",
        " ",
        /* @__PURE__ */ jsxRuntimeExports.jsxs("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: [
          "POST /api/v1/schedule/",
          "{project_id}",
          "/recalculate-cpm"
        ] }),
        "."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Forward Pass: Early Start & Early Finish", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowRight, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "The forward pass traverses the activity network from the project start, calculating the earliest possible dates each activity can begin and complete." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          FormulaCard,
          {
            formula: "ES = max(EF_predecessors + lag)",
            description: "Early Start (ES) is the latest Early Finish of all predecessors, plus any lag days.",
            example: "If predecessor EF = Day 10 and lag = 2, then ES = Day 12"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          FormulaCard,
          {
            formula: "EF = ES + duration",
            description: "Early Finish (EF) is the Early Start plus the activity duration in working days.",
            example: "ES = Day 12, duration = 5 workdays → EF = Day 17"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-4", children: [
        "The forward pass respects the working calendar configured for each activity, skipping weekends, statutory holidays, and planned maintenance shutdowns. Duration is measured in ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "working days" }),
        ", not calendar days."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Backward Pass: Late Start & Late Finish", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowRight, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "The backward pass traverses the network in reverse topological order, from the project finish back to the start, calculating the latest dates each activity can begin and complete without delaying the project." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          FormulaCard,
          {
            formula: "LF = min(LS_successors - lag)",
            description: "Late Finish (LF) is the earliest Late Start of all successors, minus any lag days.",
            example: "If successor LS = Day 20 and lag = 1, then LF = Day 19"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          FormulaCard,
          {
            formula: "LS = LF - duration",
            description: "Late Start (LS) is the Late Finish minus the activity duration.",
            example: "LF = Day 19, duration = 5 → LS = Day 14"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Float Calculations", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Float (or slack) represents the amount of time an activity can be delayed without affecting downstream constraints. There are two types of float:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          FormulaCard,
          {
            formula: "Total Float = LS - ES",
            description: "Total Float (TF) is the amount of time an activity can be delayed without delaying the project finish date.",
            example: "LS = Day 14, ES = Day 12 → TF = 2 days"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          FormulaCard,
          {
            formula: "Free Float = min(ES_successors) - EF",
            description: "Free Float (FF) is the amount of time an activity can be delayed without delaying any successor's Early Start.",
            example: "Successor ES = Day 15, EF = Day 13 → FF = 2 days"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(InfoBox, { title: "Critical Path Identification", variant: "warning", children: [
        "An activity is on the ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "critical path" }),
        " when its Total Float is zero or negative (TF ≤ 0). These activities have no scheduling flexibility — any delay directly impacts the project finish date. In the Gantt chart, critical path tasks are highlighted with a bold red border (#F87171)."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "PDM Dependency Types", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(GitBranch, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "The system supports all four Precedence Diagramming Method (PDM) dependency types, each with optional lag (positive) or lead (negative) days:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm border-collapse", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 text-text-ops-primary font-semibold", children: "Type" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 text-text-ops-primary font-semibold", children: "Relationship" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 text-text-ops-primary font-semibold", children: "Effect" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("tbody", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "FS" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Finish-to-Start" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Successor cannot start until predecessor finishes" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "SS" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Start-to-Start" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Successor cannot start until predecessor starts" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "FF" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Finish-to-Finish" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Successor cannot finish until predecessor finishes" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "SF" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Start-to-Finish" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Successor cannot finish until predecessor starts" })
          ] })
        ] })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(InfoBox, { title: "Lag & Lead Days", variant: "info", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Lag" }),
        " (positive value) adds a delay between predecessor and successor.",
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Lead" }),
        " (negative value) allows the successor to start before the predecessor completes. For example, FS with lag = -2 means the successor can start 2 working days before the predecessor finishes."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Float Absorption Rules", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Calculator, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Float is a shared resource across the project network. When a non-critical activity consumes its float, it may reduce the available float for other activities on parallel paths. The system enforces the following rules:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "list-disc list-inside space-y-2 ml-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Critical path tasks are fixed first." }),
          " During resource leveling, activities with zero or negative Total Float remain at their scheduled dates."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Non-critical tasks are delayed within their float window." }),
          " The Burgess-Killebrew heuristic delays activities with positive Free Float before touching critical path items."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Milestone breach detection." }),
          " If delaying a non-critical task exceeds its available float and slips a contractual delivery milestone, the system flags a milestone breach warning."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Float consumption is tracked." }),
          " Each leveling proposal records the consumed float in days, allowing planners to see how much scheduling flexibility remains."
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "DCMA 14-Point Compliance", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheckBig, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "The Defense Contract Management Agency (DCMA) 14-Point assessment is a standard defence programme schedule integrity check. The system automatically flags the following conditions:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: [
        { point: "Dangling Activities", desc: "Tasks with no predecessor or successor links" },
        { point: "Invalid Leads/Lags", desc: "Unusually large lead or lag values that may mask logic errors" },
        { point: "Negative Float", desc: "Activities where EF > LF, indicating schedule infeasibility" },
        { point: "Duration Mismatches", desc: "Activities where estimated duration differs significantly from actual" },
        { point: "Over-Constrained Schedules", desc: "Too many hard constraints (must-start/must-finish) limiting flexibility" },
        { point: "Missing Baselines", desc: "Projects without a frozen Performance Measurement Baseline" }
      ].map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3 bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium text-text-ops-primary", children: item.point }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted", children: item.desc })
        ] })
      ] }, item.point)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(InfoBox, { title: "Running DCMA Checks", variant: "success", children: [
        "DCMA 14-Point checks are executed automatically when you run a CPM recalculation. The results are included in the CPM response under the ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "dcma_flags" }),
        " field. You can also trigger a standalone sweep via",
        " ",
        /* @__PURE__ */ jsxRuntimeExports.jsxs("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: [
          "POST /api/v1/schedule/clashes/sweep/",
          "{project_id}"
        ] }),
        "."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Working Calendar Integration", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "CPM calculations respect the working calendar assigned to each activity. The calendar resolution priority is:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("ol", { className: "list-decimal list-inside space-y-2 ml-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Node-level calendar" }),
          " — If the activity has a ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "calendar_id" }),
          ", use it directly."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Project root calendar" }),
          " — If the node has no calendar, inherit from the project root."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Default system calendar" }),
          " — Fall back to the system default calendar (marked ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "is_default=True" }),
          ")."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Naive Mon–Fri fallback" }),
          " — If no calendar is configured, assume Monday–Friday working days."
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-4", children: [
        "Calendar exceptions (statutory holidays, planned maintenance, overtime surge) are treated as non-working days when their ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "working_hours_override" }),
        " is 0.00."
      ] })
    ] })
  ] });
};
export {
  CPMGuide as default
};
//# sourceMappingURL=CPMGuide-BUTDf30I.js.map
