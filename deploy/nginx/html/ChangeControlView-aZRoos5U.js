import { r as reactExports, b as api, j as jsxRuntimeExports, D as Shield, x as LoaderCircle, k as Calendar, i as CircleAlert, $ as FileText, ax as DollarSign, ay as Scale, F as Filter, c as clsx, d as CircleCheck, C as Clock, a1 as ChevronUp, f as ChevronDown, az as PenTool, X, t as UserCheck } from "./index-DwHrkWl2.js";
const TIER_CONFIG = {
  TIER_1_LOCAL_CAM: {
    color: "text-blue-400",
    label: "Tier 1: CAM Float",
    shortLabel: "Tier 1",
    description: "Local CAM authority — float within management reserve"
  },
  TIER_2_PROJECT_CCB: {
    color: "text-amber-400",
    label: "Tier 2: Project CCB",
    shortLabel: "Tier 2",
    description: "Project Change Control Board approval required"
  },
  TIER_3_PROGRAMME_BOARD: {
    color: "text-red-400",
    label: "Tier 3: Programme Board",
    shortLabel: "Tier 3",
    description: "Programme Board governance — highest authority"
  }
};
const STATUS_CONFIG = {
  DRAFT: {
    color: "text-gray-400",
    label: "Draft",
    icon: FileText
  },
  UNDER_REVIEW: {
    color: "text-amber-400",
    label: "Under Review",
    icon: Clock
  },
  APPROVED: {
    color: "text-green-400",
    label: "Approved",
    icon: CircleCheck
  },
  REJECTED: {
    color: "text-red-400",
    label: "Rejected",
    icon: CircleAlert
  }
};
const TierBadge = ({ tier }) => {
  const config = TIER_CONFIG[tier] || TIER_CONFIG.TIER_1_LOCAL_CAM;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "span",
    {
      className: clsx(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border",
        config.color,
        `border-${config.color.split("-")[1]}-500/30 bg-${config.color.split("-")[1]}-500/10`
      ),
      title: config.description,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { size: 12 }),
        config.shortLabel
      ]
    }
  );
};
const StatusBadge = ({ status }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.DRAFT;
  const Icon = config.icon;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: clsx(
    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border",
    config.color,
    `border-${config.color.split("-")[1]}-500/30 bg-${config.color.split("-")[1]}-500/10`
  ), children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { size: 12 }),
    config.label
  ] });
};
const SignaturePad = ({ bcr, signatures, onClose, onApprove, onReject }) => {
  const [mode, setMode] = reactExports.useState(null);
  const [comment, setComment] = reactExports.useState("");
  const [isSubmitting, setIsSubmitting] = reactExports.useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!mode || !comment.trim()) return;
    setIsSubmitting(true);
    try {
      if (mode === "approve") {
        await onApprove(comment.trim());
      } else {
        await onReject(comment.trim());
      }
      onClose();
    } catch (err) {
      console.error("Failed to submit signature:", err);
    } finally {
      setIsSubmitting(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-border-ops-subtle bg-bg-ops-surface", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-text-ops-primary", children: bcr.bcr_number }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted truncate max-w-[200px]", children: bcr.title })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: onClose,
          className: "p-1.5 rounded-md text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors",
          "aria-label": "Close drawer",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 16 })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-4 py-3 border-b border-border-ops-subtle bg-bg-ops-overlay/50 space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TierBadge, { tier: bcr.tier }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(StatusBadge, { status: bcr.status })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-sm text-text-ops-primary", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-text-ops-muted text-xs mb-1", children: "Justification" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "whitespace-pre-wrap", children: bcr.justification })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-2", children: [
        bcr.cost_delta_amount !== null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded border border-border-ops-subtle bg-bg-ops-overlay p-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 text-xs text-text-ops-muted", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(DollarSign, { size: 12 }),
            "ΔBAC"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: clsx(
            "text-sm font-bold font-mono",
            bcr.cost_delta_amount >= 0 ? "text-amber-400" : "text-green-400"
          ), children: [
            bcr.cost_delta_amount >= 0 ? "+" : "",
            "£",
            bcr.cost_delta_amount.toLocaleString()
          ] })
        ] }),
        bcr.schedule_finish_slip_days !== null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded border border-border-ops-subtle bg-bg-ops-overlay p-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 text-xs text-text-ops-muted", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { size: 12 }),
            "ΔDays"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: clsx(
            "text-sm font-bold font-mono",
            bcr.schedule_finish_slip_days > 0 ? "text-red-400" : "text-green-400"
          ), children: [
            bcr.schedule_finish_slip_days > 0 ? "+" : "",
            bcr.schedule_finish_slip_days,
            " days"
          ] })
        ] }),
        bcr.contingency_reserve_requested !== null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded border border-border-ops-subtle bg-bg-ops-overlay p-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 text-xs text-text-ops-muted", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Scale, { size: 12 }),
            "Reserve"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-sm font-bold font-mono text-blue-400", children: [
            "£",
            bcr.contingency_reserve_requested.toLocaleString()
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-4 py-3 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h4", { className: "text-xs text-text-ops-muted uppercase tracking-wider mb-2", children: [
        "Signatures (",
        signatures.length,
        ")"
      ] }),
      signatures.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted italic", children: "No signatures yet." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: signatures.map((sig) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: "flex items-center gap-3 rounded border border-border-ops-subtle bg-bg-ops-overlay p-2",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(UserCheck, { size: 16, className: "text-green-400 flex-shrink-0" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-text-ops-primary truncate", children: sig.user_name }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-text-ops-muted", children: [
                sig.user_role,
                " · ",
                sig.signed_at
              ] })
            ] })
          ]
        },
        sig.id
      )) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto px-4 py-3", children: !mode ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted text-center mb-4", children: "Select an action to sign off on this Baseline Change Request." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: () => setMode("approve"),
          className: "w-full flex items-center justify-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm font-medium text-green-400 hover:bg-green-500/20 transition-colors",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 16 }),
            "Approve This BCR"
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: () => setMode("reject"),
          className: "w-full flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(CircleAlert, { size: 16 }),
            "Reject This BCR"
          ]
        }
      )
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, className: "space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => {
              setMode(null);
              setComment("");
            },
            className: "text-xs text-text-ops-muted hover:text-text-ops-primary transition-colors",
            children: "← Back"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: clsx(
          "text-sm font-semibold",
          mode === "approve" ? "text-green-400" : "text-red-400"
        ), children: [
          mode === "approve" ? "Approve" : "Reject",
          " BCR"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: clsx(
        "rounded-lg border p-3 text-xs",
        mode === "approve" ? "border-green-500/30 bg-green-500/10 text-green-300" : "border-red-500/30 bg-red-500/10 text-red-300"
      ), children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { size: 14 }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold", children: "Role Verification Required" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
          "By signing this ",
          TIER_CONFIG[bcr.tier].label,
          " BCR, you confirm that you have the authority to ",
          mode,
          " this change and that all impact assessments have been reviewed."
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "textarea",
        {
          value: comment,
          onChange: (e) => setComment(e.target.value),
          placeholder: mode === "approve" ? "Enter approval comment..." : "Enter rejection reason (required)...",
          rows: 4,
          required: true,
          className: "w-full rounded border border-border-ops-subtle bg-bg-ops-overlay px-3 py-2 text-sm text-text-ops-primary placeholder:text-text-ops-muted focus:outline-none focus:border-blue-500/50 resize-none"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => {
              setMode(null);
              setComment("");
            },
            className: "flex-1 rounded border border-border-ops-subtle bg-bg-ops-overlay px-3 py-2 text-sm font-medium text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong transition-colors",
            children: "Cancel"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "submit",
            disabled: !comment.trim() || isSubmitting,
            className: clsx(
              "flex-1 rounded px-3 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              mode === "approve" ? "bg-green-600 hover:bg-green-500" : "bg-red-600 hover:bg-red-500"
            ),
            children: isSubmitting ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center justify-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { size: 14, className: "animate-spin" }),
              "Submitting..."
            ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center justify-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(PenTool, { size: 14 }),
              mode === "approve" ? "Sign & Approve" : "Sign & Reject"
            ] })
          }
        )
      ] })
    ] }) })
  ] });
};
const FilterBar = ({ filters, onFilterChange, tierCounts, statusCounts }) => {
  const tiers = ["TIER_1_LOCAL_CAM", "TIER_2_PROJECT_CCB", "TIER_3_PROGRAMME_BOARD"];
  const statuses = ["DRAFT", "UNDER_REVIEW", "APPROVED", "REJECTED"];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-6 py-3 border-b border-border-ops-subtle bg-bg-ops-surface/50 space-y-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Filter, { size: 14, className: "text-text-ops-muted" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted uppercase tracking-wider", children: "Tier" }),
      tiers.map((tier) => {
        const isActive = filters.tier === tier;
        const count = tierCounts[tier] || 0;
        const config = TIER_CONFIG[tier];
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: () => onFilterChange({ ...filters, tier: isActive ? null : tier }),
            className: clsx(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors",
              isActive ? `${config.color} border-${config.color.split("-")[1]}-500/50 bg-${config.color.split("-")[1]}-500/10` : "text-text-ops-muted border-border-ops-subtle hover:border-border-ops-strong"
            ),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { size: 12 }),
              config.shortLabel,
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: clsx(
                "ml-1 px-1.5 py-0.5 rounded-full text-xs",
                isActive ? "bg-white/10" : "bg-bg-ops-overlay"
              ), children: count })
            ]
          },
          tier
        );
      })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted uppercase tracking-wider", children: "Status" }),
      statuses.map((status) => {
        const isActive = filters.status === status;
        const count = statusCounts[status] || 0;
        const config = STATUS_CONFIG[status];
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: () => onFilterChange({ ...filters, status: isActive ? null : status }),
            className: clsx(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors",
              isActive ? `${config.color} border-${config.color.split("-")[1]}-500/50 bg-${config.color.split("-")[1]}-500/10` : "text-text-ops-muted border-border-ops-subtle hover:border-border-ops-strong"
            ),
            children: [
              config.label,
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: clsx(
                "ml-1 px-1.5 py-0.5 rounded-full text-xs",
                isActive ? "bg-white/10" : "bg-bg-ops-overlay"
              ), children: count })
            ]
          },
          status
        );
      })
    ] })
  ] });
};
const BCRCard = ({ bcr, onOpenSignature }) => {
  const [expanded, setExpanded] = reactExports.useState(false);
  TIER_CONFIG[bcr.tier];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-border-ops-subtle bg-bg-ops-overlay overflow-hidden transition-all hover:border-border-ops-strong", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-4 py-3 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between mb-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-sm font-semibold text-text-ops-primary", children: bcr.bcr_number }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(TierBadge, { tier: bcr.tier }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(StatusBadge, { status: bcr.status })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-sm font-medium text-text-ops-primary truncate", children: bcr.title })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => setExpanded(!expanded),
            className: "p-1 rounded text-text-ops-muted hover:text-text-ops-primary transition-colors ml-2",
            children: expanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronUp, { size: 16 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { size: 16 })
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 text-xs", children: [
        bcr.cost_delta_amount !== null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(DollarSign, { size: 12, className: bcr.cost_delta_amount >= 0 ? "text-amber-400" : "text-green-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-mono text-text-ops-primary", children: [
            bcr.cost_delta_amount >= 0 ? "+" : "",
            "£",
            bcr.cost_delta_amount.toLocaleString()
          ] })
        ] }),
        bcr.schedule_finish_slip_days !== null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { size: 12, className: bcr.schedule_finish_slip_days > 0 ? "text-red-400" : "text-green-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-mono text-text-ops-primary", children: [
            bcr.schedule_finish_slip_days > 0 ? "+" : "",
            bcr.schedule_finish_slip_days,
            " days"
          ] })
        ] }),
        bcr.contingency_reserve_requested !== null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Scale, { size: 12, className: "text-blue-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-mono text-text-ops-primary", children: [
            "£",
            bcr.contingency_reserve_requested.toLocaleString()
          ] })
        ] })
      ] })
    ] }),
    expanded && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-4 py-3 border-b border-border-ops-subtle space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted uppercase tracking-wider", children: "Justification" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-primary mt-1 whitespace-pre-wrap", children: bcr.justification })
      ] }),
      bcr.rejection_reason && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded border border-red-500/30 bg-red-500/10 p-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-red-400 uppercase tracking-wider", children: "Rejection Reason" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-red-300 mt-1", children: bcr.rejection_reason })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-2 text-xs", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Created" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-mono text-text-ops-primary", children: bcr.created_at })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Updated" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-mono text-text-ops-primary", children: bcr.updated_at })
        ] })
      ] })
    ] }),
    bcr.status === "UNDER_REVIEW" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 py-2 bg-bg-ops-surface/50", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onClick: () => onOpenSignature(bcr),
        className: "w-full flex items-center justify-center gap-2 rounded bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm font-medium text-white transition-colors",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(PenTool, { size: 14 }),
          "Review & Sign"
        ]
      }
    ) })
  ] });
};
const ChangeControlView = () => {
  const [bcrs, setBcrs] = reactExports.useState([]);
  const [isLoading, setIsLoading] = reactExports.useState(true);
  const [error, setError] = reactExports.useState(null);
  const [filters, setFilters] = reactExports.useState({ tier: null, status: null });
  const [selectedBcr, setSelectedBcr] = reactExports.useState(null);
  const [drawerOpen, setDrawerOpen] = reactExports.useState(false);
  const [signatures, setSignatures] = reactExports.useState([]);
  const fetchBcrs = reactExports.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get("/api/v1/baselines/bcr");
      if (response.data) {
        setBcrs(response.data.bcrs || response.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch BCRs:", err);
      setError("Failed to load change requests. The backend may not be running.");
    } finally {
      setIsLoading(false);
    }
  }, []);
  reactExports.useEffect(() => {
    fetchBcrs();
  }, [fetchBcrs]);
  const tierCounts = reactExports.useMemo(() => {
    const counts = {};
    bcrs.forEach((bcr) => {
      counts[bcr.tier] = (counts[bcr.tier] || 0) + 1;
    });
    return counts;
  }, [bcrs]);
  const statusCounts = reactExports.useMemo(() => {
    const counts = {};
    bcrs.forEach((bcr) => {
      counts[bcr.status] = (counts[bcr.status] || 0) + 1;
    });
    return counts;
  }, [bcrs]);
  const filteredBcrs = reactExports.useMemo(() => {
    return bcrs.filter((bcr) => {
      if (filters.tier && bcr.tier !== filters.tier) {
        return false;
      }
      if (filters.status && bcr.status !== filters.status) {
        return false;
      }
      return true;
    });
  }, [bcrs, filters]);
  const openSignature = reactExports.useCallback((bcr) => {
    setSelectedBcr(bcr);
    setSignatures([]);
    setDrawerOpen(true);
  }, []);
  const handleApprove = reactExports.useCallback(async (comment) => {
    try {
      await api.put(`/api/v1/baselines/bcr/${selectedBcr == null ? void 0 : selectedBcr.id}`, {
        status: "APPROVED"
      });
      const newSig = {
        id: `local-${Date.now()}`,
        bcr_id: (selectedBcr == null ? void 0 : selectedBcr.id) || "",
        user_id: "current-user",
        user_name: "Current User",
        user_role: "CCB Member",
        signed_at: (/* @__PURE__ */ new Date()).toISOString(),
        comment
      };
      setSignatures((prev) => [...prev, newSig]);
      await fetchBcrs();
    } catch (err) {
      console.error("Failed to approve BCR:", err);
      throw err;
    }
  }, [selectedBcr, fetchBcrs]);
  const handleReject = reactExports.useCallback(async (reason) => {
    try {
      await api.put(`/api/v1/baselines/bcr/${selectedBcr == null ? void 0 : selectedBcr.id}`, {
        status: "REJECTED",
        rejection_reason: reason
      });
      await fetchBcrs();
    } catch (err) {
      console.error("Failed to reject BCR:", err);
      throw err;
    }
  }, [selectedBcr, fetchBcrs]);
  const aggregateImpact = reactExports.useMemo(() => {
    const activeBcrs = bcrs.filter((bcr) => bcr.status === "UNDER_REVIEW");
    const totalCostDelta = activeBcrs.reduce((sum, bcr) => sum + (bcr.cost_delta_amount || 0), 0);
    const totalScheduleSlip = activeBcrs.reduce((sum, bcr) => sum + (bcr.schedule_finish_slip_days || 0), 0);
    const totalReserveRequested = activeBcrs.reduce((sum, bcr) => sum + (bcr.contingency_reserve_requested || 0), 0);
    return { totalCostDelta, totalScheduleSlip, totalReserveRequested, count: activeBcrs.length };
  }, [bcrs]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-surface", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-5 h-5 text-amber-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold text-text-ops-primary", children: "Change Control Board" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Baseline Change Request review and approval" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: fetchBcrs,
          disabled: isLoading,
          className: "inline-flex items-center gap-2 rounded border border-border-ops-subtle bg-bg-ops-overlay px-3 py-1.5 text-sm font-medium text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong transition-colors disabled:opacity-50",
          children: [
            isLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { size: 14, className: "animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { size: 14 }),
            "Refresh"
          ]
        }
      ) })
    ] }),
    error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 mx-6 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CircleAlert, { size: 16, className: "flex-shrink-0" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: error }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => setError(null),
          className: "ml-auto text-red-400 hover:text-red-300",
          children: "×"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      FilterBar,
      {
        filters,
        onFilterChange: setFilters,
        tierCounts,
        statusCounts
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-4 gap-4 px-6 py-3 border-b border-border-ops-subtle bg-bg-ops-surface/50", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 rounded-lg border border-border-ops-subtle bg-bg-ops-overlay px-4 py-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20", children: /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { size: 16, className: "text-amber-400" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-lg font-bold font-mono text-text-ops-primary", children: aggregateImpact.count }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted uppercase tracking-wider", children: "Pending Review" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20", children: /* @__PURE__ */ jsxRuntimeExports.jsx(DollarSign, { size: 16, className: "text-amber-400" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-lg font-bold font-mono text-amber-400", children: [
            "£",
            aggregateImpact.totalCostDelta.toLocaleString()
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted uppercase tracking-wider", children: "ΔBAC Total" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-8 w-8 items-center justify-center rounded-full bg-red-500/20", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { size: 16, className: "text-red-400" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-lg font-bold font-mono text-red-400", children: [
            "+",
            aggregateImpact.totalScheduleSlip,
            "d"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted uppercase tracking-wider", children: "Schedule Slip" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Scale, { size: 16, className: "text-blue-400" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-lg font-bold font-mono text-blue-400", children: [
            "£",
            aggregateImpact.totalReserveRequested.toLocaleString()
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted uppercase tracking-wider", children: "Reserve Requested" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-6", children: isLoading && bcrs.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-24 text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { size: 48, className: "mb-4 animate-spin text-blue-400" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-lg font-semibold", children: "Loading change requests..." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm mt-1", children: "Querying the CCB register." })
    ] }) : filteredBcrs.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-24 text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { size: 48, className: "mb-4 text-text-ops-muted/50" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-lg font-semibold text-text-ops-primary", children: "No Change Requests Found" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm mt-2 text-center max-w-md", children: filters.tier || filters.status ? "No BCRs match the current filters. Try adjusting your filter criteria." : "No Baseline Change Requests have been submitted yet." })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-4", children: filteredBcrs.map((bcr) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      BCRCard,
      {
        bcr,
        onOpenSignature: openSignature
      },
      bcr.id
    )) }) }),
    drawerOpen && selectedBcr && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "fixed inset-0 z-50 flex justify-end", role: "dialog", "aria-modal": "true", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: "absolute inset-0 bg-black/50",
          onClick: () => setDrawerOpen(false),
          "aria-hidden": "true"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "relative w-[520px] max-w-full h-full bg-bg-ops-surface border-l border-border-ops-subtle shadow-2xl flex flex-col", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        SignaturePad,
        {
          bcr: selectedBcr,
          signatures,
          onClose: () => setDrawerOpen(false),
          onApprove: handleApprove,
          onReject: handleReject
        }
      ) })
    ] })
  ] });
};
export {
  ChangeControlView as default
};
//# sourceMappingURL=ChangeControlView-aZRoos5U.js.map
