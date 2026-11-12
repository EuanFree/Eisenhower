import { j as jsxRuntimeExports, bu as Bot, X, D as Shield, O as OctagonAlert, a8 as GitCommitHorizontal, r as reactExports, aH as Minus, c as clsx, m as Link, C as Clock, a9 as TrendingDown, k as Calendar, bv as Percent, at as ArrowRight, T as TriangleAlert, z as TrendingUp, b as api, x as LoaderCircle, aJ as CircleX, aj as Hash, ab as Eye, d as CircleCheck, bw as Undo2 } from "./index-DwHrkWl2.js";
const FieldDiffRow = ({ diff }) => {
  const impactStyles = {
    critical: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
    warning: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800",
    neutral: "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
  };
  const valueChangedStyles = {
    critical: "text-red-700 dark:text-red-300 font-semibold",
    warning: "text-amber-700 dark:text-amber-300 font-semibold",
    neutral: diff.changed ? "text-blue-700 dark:text-blue-300 font-medium" : "text-gray-500 dark:text-gray-400"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: clsx("flex items-center rounded-lg border p-2 text-xs", impactStyles[diff.impact]), children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex w-32 shrink-0 items-center gap-1.5 text-gray-500 dark:text-gray-400", children: [
      diff.icon,
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium", children: diff.label })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 px-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-wider text-gray-400", children: "Baseline" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-mono text-gray-700 dark:text-gray-300", children: diff.baseline })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-1 text-gray-400", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowRight, { size: 12 }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 px-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-wider text-gray-400", children: "Proposed" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: clsx("font-mono", valueChangedStyles[diff.impact]), children: diff.proposed })
    ] }),
    diff.changed && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ml-2 shrink-0", children: [
      diff.impact === "critical" && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/40 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-300", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(OctagonAlert, { size: 10 }),
        "CRITICAL"
      ] }),
      diff.impact === "warning" && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 10 }),
        "WARNING"
      ] }),
      diff.impact === "neutral" && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingUp, { size: 10 }),
        "CHANGED"
      ] })
    ] })
  ] });
};
const MutationCard = ({ mutation, index }) => {
  const [expanded, setExpanded] = reactExports.useState(true);
  const formatDate = (value) => {
    if (!value) return "—";
    if (typeof value === "string") {
      try {
        const d = new Date(value);
        return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      } catch {
        return value;
      }
    }
    return String(value);
  };
  const formatNumber = (value) => {
    if (value === null || value === void 0) return "—";
    if (typeof value === "number") return `${value.toFixed(1)}%`;
    return String(value);
  };
  const fieldDiffs = reactExports.useMemo(() => {
    const fd = mutation.forward_delta || {};
    const inv = mutation.inverse_delta || {};
    const fields = [
      { key: "planned_start_date", label: "Early Start", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { size: 12 }), formatter: formatDate },
      { key: "planned_end_date", label: "Early Finish", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { size: 12 }), formatter: formatDate },
      { key: "percent_complete", label: "Progress", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Percent, { size: 12 }), formatter: formatNumber }
    ];
    const allKeys = /* @__PURE__ */ new Set([...Object.keys(fd), ...Object.keys(inv)]);
    allKeys.forEach((key) => {
      if (!fields.find((f) => f.key === key)) {
        fields.push({
          key,
          label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Minus, { size: 12 }),
          formatter: (v) => v === null || v === void 0 ? "—" : String(v)
        });
      }
    });
    return fields.map((f) => {
      const baseline = f.formatter(inv[f.key]);
      const proposed = f.formatter(fd[f.key]);
      const changed = baseline !== proposed;
      let impact = "neutral";
      const impactSummary = mutation.topological_impact_summary || {};
      if (impactSummary["critical_path_hit"] || impactSummary["baseline_slip"]) {
        impact = "critical";
      } else if (impactSummary["float_consumed"] || changed) {
        impact = "warning";
      }
      return {
        field: f.key,
        label: f.label,
        icon: f.icon,
        baseline,
        proposed,
        changed,
        impact
      };
    });
  }, [mutation]);
  const hasContractBaseline = !!(mutation.topological_impact_summary && (mutation.topological_impact_summary["contract_baseline_hit"] || mutation.topological_impact_summary["milestone_impact"]));
  const actionTypeColors = {
    NODE_SHIFT: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
    LINK_CREATE: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
    PROGRESS_SET: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
    BLOCKER_RAISE: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
  };
  const actionColor = actionTypeColors[mutation.action_type] || "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onClick: () => setExpanded(!expanded),
        className: "flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-[10px] font-bold text-gray-600 dark:text-gray-300", children: index + 1 }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: clsx("px-2 py-0.5 rounded-full text-[10px] font-bold", actionColor), children: mutation.action_type }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-mono text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px]", children: [
            mutation.target_node_id.slice(0, 8),
            "…"
          ] }),
          hasContractBaseline && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ml-auto flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { size: 12 }),
            "B₀ IMPACT"
          ] })
        ]
      }
    ),
    expanded && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t border-gray-200 dark:border-gray-800 px-4 py-3 space-y-2", children: [
      fieldDiffs.map((diff) => /* @__PURE__ */ jsxRuntimeExports.jsx(FieldDiffRow, { diff }, diff.field)),
      mutation.topological_impact_summary && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-wider text-gray-400 mb-2", children: "Topological Impact" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1 text-xs", children: [
          !!mutation.topological_impact_summary["affected_successors"] && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-gray-600 dark:text-gray-400", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { size: 12 }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
              "Affected successors:",
              " ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-gray-900 dark:text-gray-100", children: String(mutation.topological_impact_summary["affected_successors"]) })
            ] })
          ] }),
          mutation.topological_impact_summary["float_consumed"] !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-gray-600 dark:text-gray-400", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 12 }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
              "Float consumed:",
              " ",
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: clsx(
                "font-semibold",
                typeof mutation.topological_impact_summary["float_consumed"] === "number" && mutation.topological_impact_summary["float_consumed"] > 5 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-gray-100"
              ), children: [
                String(mutation.topological_impact_summary["float_consumed"]),
                " days"
              ] })
            ] })
          ] }),
          !!mutation.topological_impact_summary["baseline_slip"] && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-red-600 dark:text-red-400", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingDown, { size: 12 }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-semibold", children: [
              "Baseline slip: ",
              String(mutation.topological_impact_summary["baseline_slip"]),
              " days"
            ] })
          ] }),
          !!mutation.topological_impact_summary["critical_path_hit"] && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-red-600 dark:text-red-400", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(OctagonAlert, { size: 12 }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold", children: "Critical path impact detected" })
          ] })
        ] })
      ] })
    ] })
  ] });
};
const AgentDiffDrawer = ({ open, session, onClose }) => {
  var _a, _b;
  if (!open || !session) return null;
  const mutations = session.mutations || [];
  const hasContractBaseline = mutations.some((m) => {
    const impact = m.topological_impact_summary;
    return impact && ("contract_baseline_hit" in impact || "milestone_impact" in impact);
  });
  const hasCriticalPathImpact = mutations.some((m) => {
    var _a2;
    return (_a2 = m.topological_impact_summary) == null ? void 0 : _a2["critical_path_hit"];
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "fixed inset-0 z-40 bg-black/30 backdrop-blur-sm",
        onClick: onClose
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "fixed right-0 top-0 z-50 h-full w-[60vw] min-w-[600px] max-w-[900px] flex flex-col bg-gray-50 dark:bg-gray-950 shadow-2xl border-l border-gray-200 dark:border-gray-800", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Bot, { size: 16 }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-bold text-gray-900 dark:text-gray-100", children: "Proposal Diff" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-gray-500 dark:text-gray-400", children: [
              session.agent_identifier,
              " · ",
              session.model_name
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: onClose,
            className: "p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 20 })
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3 text-xs", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-gray-400", children: "Session ID" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "font-mono text-gray-700 dark:text-gray-300", children: [
            session.session_id.slice(0, 16),
            "…"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-gray-400", children: "Weights Hash" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "font-mono text-gray-700 dark:text-gray-300", children: [
            (_a = session.model_weights_hash) == null ? void 0 : _a.slice(0, 16),
            "…"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-gray-400", children: "Prompt Digest" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "font-mono text-gray-700 dark:text-gray-300", children: [
            (_b = session.prompt_digest) == null ? void 0 : _b.slice(0, 16),
            "…"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-gray-400", children: "Mutations" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-semibold text-gray-900 dark:text-gray-100", children: mutations.length })
        ] })
      ] }) }),
      (hasContractBaseline || hasCriticalPathImpact) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2 border-b border-gray-200 dark:border-gray-800 px-6 py-3", children: [
        hasContractBaseline && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { size: 14, className: "text-amber-600" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-medium text-amber-800 dark:text-amber-300", children: "Contract Baseline Warning: This proposal affects approved B₀ milestones." })
        ] }),
        hasCriticalPathImpact && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(OctagonAlert, { size: 14, className: "text-red-600" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-medium text-red-800 dark:text-red-300", children: "Critical Path Impact: Float consumption may affect project delivery date." })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center border-b border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900 px-6 py-2 text-[10px] uppercase tracking-wider text-gray-400", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-32 shrink-0", children: "Field" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 px-2", children: "Current Baseline State" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-1", children: "→" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 px-2", children: "Proposed Agent State" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto px-6 py-4 space-y-3", children: mutations.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-12 text-gray-400", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(GitCommitHorizontal, { size: 32, className: "opacity-30 mb-3" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm", children: "No mutations in this session" })
      ] }) : mutations.map((mutation, index) => /* @__PURE__ */ jsxRuntimeExports.jsx(MutationCard, { mutation, index }, mutation.mutation_id)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-gray-400", children: [
          mutations.length,
          " mutation",
          mutations.length !== 1 ? "s" : "",
          " staged"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: onClose,
            className: "px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors",
            children: "Close"
          }
        )
      ] })
    ] })
  ] });
};
const statusConfig = {
  PENDING_REVIEW: {
    label: "Pending Review",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 14 }),
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-800 dark:text-amber-300"
  },
  ACCEPTED_COMMITTED: {
    label: "Committed",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 14 }),
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    text: "text-emerald-800 dark:text-emerald-300"
  },
  REJECTED: {
    label: "Rejected",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { size: 14 }),
    bg: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-800 dark:text-red-300"
  },
  REVERTED: {
    label: "Reverted",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Undo2, { size: 14 }),
    bg: "bg-gray-100 dark:bg-gray-800/30",
    text: "text-gray-800 dark:text-gray-300"
  }
};
const StatusFilter = ({ status, active, count, onClick }) => {
  const config = statusConfig[status];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      type: "button",
      onClick: () => onClick(status),
      className: clsx(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
        active ? clsx(config.bg, config.text, "ring-2 ring-offset-1 ring-blue-400 dark:ring-blue-500") : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
      ),
      children: [
        config.icon,
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: config.label }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            className: clsx(
              "ml-1 px-1.5 py-0.5 text-xs rounded-full",
              active ? "bg-black/10 dark:bg-white/10" : "bg-black/5 dark:bg-white/5"
            ),
            children: count
          }
        )
      ]
    }
  );
};
const ConfirmModal = ({
  open,
  title,
  message,
  confirmLabel,
  variant,
  justification,
  onJustificationChange,
  onConfirm,
  onCancel,
  loading
}) => {
  if (!open) return null;
  const variantStyles = {
    commit: "border-emerald-300 dark:border-emerald-700",
    reject: "border-red-300 dark:border-red-700",
    revert: "border-amber-300 dark:border-amber-700"
  };
  const buttonStyles = {
    commit: "bg-emerald-600 hover:bg-emerald-700 text-white",
    reject: "bg-red-600 hover:bg-red-700 text-white",
    revert: "bg-amber-600 hover:bg-amber-700 text-white"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: clsx(
        "w-full max-w-lg rounded-xl border bg-white dark:bg-gray-900 p-6 shadow-2xl",
        variantStyles[variant]
      ),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
          variant === "commit" && /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "mt-0.5 h-5 w-5 text-emerald-600" }),
          variant === "reject" && /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { className: "mt-0.5 h-5 w-5 text-red-600" }),
          variant === "revert" && /* @__PURE__ */ jsxRuntimeExports.jsx(OctagonAlert, { className: "mt-0.5 h-5 w-5 text-amber-600" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-semibold text-gray-900 dark:text-gray-100", children: title }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-gray-600 dark:text-gray-400", children: message }),
            variant === "revert" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-sm font-medium text-gray-700 dark:text-gray-300", children: [
                "Reversion Justification ",
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-red-500", children: "*" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "textarea",
                {
                  className: "mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
                  rows: 3,
                  placeholder: "Explain why this agent action is being reverted...",
                  value: justification || "",
                  onChange: (e) => onJustificationChange == null ? void 0 : onJustificationChange(e.target.value),
                  required: true
                }
              )
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 flex justify-end gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: onCancel,
              className: "px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors",
              children: "Cancel"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: onConfirm,
              disabled: loading || variant === "revert" && (!justification || !justification.trim()),
              className: clsx(
                "px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2",
                buttonStyles[variant],
                (loading || variant === "revert" && (!justification || !justification.trim())) && "opacity-50 cursor-not-allowed"
              ),
              children: [
                loading && /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { size: 14, className: "animate-spin" }),
                confirmLabel
              ]
            }
          )
        ] })
      ]
    }
  ) });
};
const AgentReviewWorkbenchView = () => {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  const [sessions, setSessions] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [error, setError] = reactExports.useState(null);
  const [statusFilter, setStatusFilter] = reactExports.useState("PENDING_REVIEW");
  const [selectedSession, setSelectedSession] = reactExports.useState(null);
  const [drawerOpen, setDrawerOpen] = reactExports.useState(false);
  const [commitModal, setCommitModal] = reactExports.useState({ open: false, session: null });
  const [rejectModal, setRejectModal] = reactExports.useState({ open: false, session: null });
  const [revertModal, setRevertModal] = reactExports.useState({ open: false, session: null, justification: "" });
  const [actionLoading, setActionLoading] = reactExports.useState(false);
  const fetchSessions = reactExports.useCallback(async (filter) => {
    setLoading(true);
    setError(null);
    try {
      const url = filter ? `/api/v1/agents/sessions?status=${filter}` : "/api/v1/agents/sessions";
      const data = await api.get(url);
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load agent proposals";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);
  reactExports.useEffect(() => {
    fetchSessions(statusFilter === "ALL" ? void 0 : statusFilter);
  }, [statusFilter, fetchSessions]);
  const statusCounts = {
    PENDING_REVIEW: 0,
    ACCEPTED_COMMITTED: 0,
    REJECTED: 0,
    REVERTED: 0
  };
  sessions.forEach((s) => {
    if (statusCounts[s.status] !== void 0) {
      statusCounts[s.status]++;
    }
  });
  const filteredSessions = statusFilter === "ALL" ? sessions : sessions.filter((s) => s.status === statusFilter);
  const handleRowClick = reactExports.useCallback(async (session) => {
    if (!session.mutations || session.mutations.length === 0) {
      try {
        const details = await api.get(`/api/v1/agents/sessions/${session.session_id}`);
        setSelectedSession(details);
      } catch {
        setSelectedSession(session);
      }
    } else {
      setSelectedSession(session);
    }
    setDrawerOpen(true);
  }, []);
  reactExports.useCallback(() => {
    if (!commitModal.session) return;
    setCommitModal((prev) => ({ ...prev, open: true }));
  }, [commitModal.session]);
  reactExports.useCallback(() => {
    if (!commitModal.session) return;
    setRejectModal((prev) => ({ ...prev, open: true }));
  }, [commitModal.session]);
  const handleRevert = reactExports.useCallback((session) => {
    setRevertModal({ open: true, session, justification: "" });
  }, []);
  const executeCommit = reactExports.useCallback(async () => {
    if (!commitModal.session) return;
    setActionLoading(true);
    try {
      await api.post(`/api/v1/agents/sessions/${commitModal.session.session_id}/commit`);
      await fetchSessions(statusFilter === "ALL" ? void 0 : statusFilter);
      setCommitModal({ open: false, session: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Commit failed";
      setError(message);
    } finally {
      setActionLoading(false);
    }
  }, [commitModal.session, fetchSessions, statusFilter]);
  const executeReject = reactExports.useCallback(async () => {
    if (!rejectModal.session) return;
    setActionLoading(true);
    try {
      await api.post(`/api/v1/agents/sessions/${rejectModal.session.session_id}/reject`);
      await fetchSessions(statusFilter === "ALL" ? void 0 : statusFilter);
      setRejectModal({ open: false, session: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Reject failed";
      setError(message);
    } finally {
      setActionLoading(false);
    }
  }, [rejectModal.session, fetchSessions, statusFilter]);
  const executeRevert = reactExports.useCallback(async () => {
    if (!revertModal.session || !revertModal.justification.trim()) return;
    setActionLoading(true);
    try {
      await api.post(
        `/api/v1/agents/sessions/${revertModal.session.session_id}/revert`,
        { justification: revertModal.justification }
      );
      await fetchSessions(statusFilter === "ALL" ? void 0 : statusFilter);
      setRevertModal({ open: false, session: null, justification: "" });
      setDrawerOpen(false);
      setSelectedSession(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Revert failed";
      setError(message);
    } finally {
      setActionLoading(false);
    }
  }, [revertModal, fetchSessions, statusFilter]);
  const formatDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };
  const truncateHash = (hash, len = 12) => {
    if (!hash) return "—";
    return hash.length > len ? `${hash.slice(0, len)}…` : hash;
  };
  const hasContractBaselineImpact = (session) => {
    var _a2;
    return (_a2 = session.mutations) == null ? void 0 : _a2.some((m) => {
      const impact = m.topological_impact_summary;
      return impact && ("contract_baseline_hit" in impact || "milestone_impact" in impact);
    });
  };
  const getProposedDateDelta = (session) => {
    var _a2;
    let maxDelta = 0;
    (_a2 = session.mutations) == null ? void 0 : _a2.forEach((m) => {
      const fd = m.forward_delta;
      const inv = m.inverse_delta;
      if (fd && inv) {
        ["planned_start_date", "planned_end_date"].forEach((key) => {
          if (fd[key] && inv[key]) {
            const diff = Math.abs(new Date(fd[key]).getTime() - new Date(inv[key]).getTime());
            const days = Math.round(diff / (1e3 * 60 * 60 * 24));
            if (days > maxDelta) maxDelta = days;
          }
        });
      }
    });
    return maxDelta;
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col bg-gray-50 dark:bg-gray-950", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Bot, { size: 20 }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-xl font-bold text-gray-900 dark:text-gray-100", children: "Agent Proposal Review" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-gray-500 dark:text-gray-400", children: "Inspect, approve, and rollback AI agent schedule operations" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: () => fetchSessions(statusFilter === "ALL" ? void 0 : statusFilter),
          className: "inline-flex items-center gap-2 rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { size: 14, className: loading ? "animate-spin" : "" }),
            "Refresh"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium text-gray-500 dark:text-gray-400 mr-2", children: "Filter:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        StatusFilter,
        {
          status: "PENDING_REVIEW",
          active: statusFilter === "PENDING_REVIEW",
          count: statusCounts.PENDING_REVIEW,
          onClick: setStatusFilter
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        StatusFilter,
        {
          status: "ACCEPTED_COMMITTED",
          active: statusFilter === "ACCEPTED_COMMITTED",
          count: statusCounts.ACCEPTED_COMMITTED,
          onClick: setStatusFilter
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        StatusFilter,
        {
          status: "REJECTED",
          active: statusFilter === "REJECTED",
          count: statusCounts.REJECTED,
          onClick: setStatusFilter
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        StatusFilter,
        {
          status: "REVERTED",
          active: statusFilter === "REVERTED",
          count: statusCounts.REVERTED,
          onClick: setStatusFilter
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: () => setStatusFilter("ALL"),
          className: clsx(
            "ml-2 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors",
            statusFilter === "ALL" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300" : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          ),
          children: [
            "All (",
            sessions.length,
            ")"
          ]
        }
      )
    ] }),
    error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-6 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 16, className: "text-red-600" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-red-800 dark:text-red-300", children: error }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => setError(null),
          className: "ml-auto text-red-600 hover:text-red-800 dark:hover:text-red-200",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { size: 16 })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto", children: loading && sessions.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-full items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-3 text-gray-400", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { size: 32, className: "animate-spin" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm", children: "Loading agent proposals..." })
    ] }) }) : filteredSessions.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-full items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-3 text-gray-400", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Bot, { size: 48, className: "opacity-30" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm", children: "No agent proposals found" })
    ] }) }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-left text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "sticky top-0 bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 font-medium", children: "Session ID" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 font-medium", children: "Agent" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 font-medium", children: "Model & Weights" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 font-medium", children: "Prompt Digest" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 font-medium", children: "Mutations" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 font-medium", children: "Date Delta" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 font-medium", children: "Status" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 font-medium", children: "Created" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 font-medium", children: "Actions" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { className: "divide-y divide-gray-200 dark:divide-gray-800", children: filteredSessions.map((session) => {
        var _a2;
        const config = statusConfig[session.status];
        hasContractBaselineImpact(session);
        const dateDelta = getProposedDateDelta(session);
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "tr",
          {
            className: "bg-white dark:bg-gray-950 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer transition-colors",
            onClick: () => handleRowClick(session),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Hash, { size: 14, className: "text-gray-400" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-xs text-gray-600 dark:text-gray-400", children: truncateHash(session.session_id, 8) })
              ] }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Bot, { size: 14, className: "text-violet-500" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-gray-900 dark:text-gray-100", children: session.agent_identifier })
              ] }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-gray-700 dark:text-gray-300", children: session.model_name }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-[10px] text-gray-400", children: truncateHash(session.model_weights_hash) })
              ] }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-[10px] text-gray-400", children: truncateHash(session.prompt_digest) }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-300", children: session.mutation_count || ((_a2 = session.mutations) == null ? void 0 : _a2.length) || 0 }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: dateDelta > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: clsx(
                "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                dateDelta > 7 ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300" : "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300"
              ), children: [
                dateDelta > 0 ? "+" : "",
                dateDelta,
                "d"
              ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-gray-400", children: "—" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "span",
                {
                  className: clsx(
                    "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
                    config.bg,
                    config.text
                  ),
                  children: [
                    config.icon,
                    config.label
                  ]
                }
              ) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-gray-500 dark:text-gray-400", children: formatDate(session.created_at) }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", onClick: (e) => e.stopPropagation(), children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => handleRowClick(session),
                    title: "Inspect diff",
                    className: "p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors",
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(Eye, { size: 16 })
                  }
                ),
                session.status === "PENDING_REVIEW" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: () => {
                        setCommitModal({ open: true, session });
                      },
                      title: "Accept & commit",
                      className: "p-1.5 rounded-lg text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors",
                      children: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 16 })
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: () => {
                        setRejectModal({ open: true, session });
                      },
                      title: "Reject proposal",
                      className: "p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors",
                      children: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { size: 16 })
                    }
                  )
                ] }),
                session.status === "ACCEPTED_COMMITTED" && /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => handleRevert(session),
                    title: "Revert agent action",
                    className: "p-1.5 rounded-lg text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors",
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(Undo2, { size: 16 })
                  }
                )
              ] }) })
            ]
          },
          session.session_id
        );
      }) })
    ] }) }),
    selectedSession && hasContractBaselineImpact(selectedSession) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 border-t border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-6 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { size: 18, className: "text-amber-600" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium text-amber-800 dark:text-amber-300", children: "Contract Baseline Warning: This proposal affects approved B₀ milestones." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      AgentDiffDrawer,
      {
        open: drawerOpen,
        session: selectedSession,
        onClose: () => {
          setDrawerOpen(false);
          setSelectedSession(null);
        }
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ConfirmModal,
      {
        open: commitModal.open,
        title: "Accept & Commit Proposals",
        message: `This will apply ${((_a = commitModal.session) == null ? void 0 : _a.mutation_count) || ((_c = (_b = commitModal.session) == null ? void 0 : _b.mutations) == null ? void 0 : _c.length) || 0} mutations to the live schedule. The action will be logged with dual-attribution forensic provenance.`,
        confirmLabel: "Accept & Commit",
        variant: "commit",
        onConfirm: executeCommit,
        onCancel: () => setCommitModal({ open: false, session: null }),
        loading: actionLoading
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ConfirmModal,
      {
        open: rejectModal.open,
        title: "Reject Proposal",
        message: `This will discard all ${((_d = rejectModal.session) == null ? void 0 : _d.mutation_count) || ((_f = (_e = rejectModal.session) == null ? void 0 : _e.mutations) == null ? void 0 : _f.length) || 0} staged mutations. No changes will be applied.`,
        confirmLabel: "Reject Proposal",
        variant: "reject",
        onConfirm: executeReject,
        onCancel: () => setRejectModal({ open: false, session: null }),
        loading: actionLoading
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ConfirmModal,
      {
        open: revertModal.open,
        title: `Revert Agent Session`,
        message: `This will restore ${((_g = revertModal.session) == null ? void 0 : _g.mutation_count) || ((_i = (_h = revertModal.session) == null ? void 0 : _h.mutations) == null ? void 0 : _i.length) || 0} tasks to their prior state. The schedule will be rolled back to the state before this agent action was committed.`,
        confirmLabel: "Revert Agent Action",
        variant: "revert",
        justification: revertModal.justification,
        onJustificationChange: (value) => setRevertModal((prev) => ({ ...prev, justification: value })),
        onConfirm: executeRevert,
        onCancel: () => setRevertModal({ open: false, session: null, justification: "" }),
        loading: actionLoading
      }
    )
  ] });
};
export {
  AgentReviewWorkbenchView as default
};
//# sourceMappingURL=AgentReviewWorkbenchView-ghOJjQu6.js.map
