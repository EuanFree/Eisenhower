import { r as reactExports, b as api, j as jsxRuntimeExports, $ as FileText, x as LoaderCircle, k as Calendar, i as CircleAlert, C as Clock, d as CircleCheck, R as React, a1 as ChevronUp, f as ChevronDown, aw as MessageSquare, al as Search, X, F as Filter, c as clsx } from "./index-DwHrkWl2.js";
const STATUS_CONFIG = {
  DRAFTING: {
    color: "text-gray-400",
    label: "Drafting",
    icon: FileText
  },
  SUBMITTED: {
    color: "text-blue-400",
    label: "Submitted",
    icon: FileText
  },
  UNDER_REVIEW: {
    color: "text-amber-400",
    label: "Under Review",
    icon: Clock
  },
  ACCEPTED: {
    color: "text-green-400",
    label: "Accepted",
    icon: CircleCheck
  },
  ACCEPTED_WITH_COMMENTS: {
    color: "text-cyan-400",
    label: "Accepted w/ Comments",
    icon: MessageSquare
  },
  REJECTED: {
    color: "text-red-400",
    label: "Rejected",
    icon: CircleAlert
  }
};
const ReviewCountdownBadge = ({ daysRemaining }) => {
  if (daysRemaining === null) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono text-text-ops-muted bg-bg-ops-overlay", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 12 }),
      "N/A"
    ] });
  }
  let colorClass = "text-green-400 bg-green-500/10 border-green-500/30";
  let label = `${daysRemaining} Days Left`;
  if (daysRemaining < 0) {
    colorClass = "text-red-400 bg-red-500/10 border-red-500/30";
    label = `${Math.abs(daysRemaining)} Days Overdue`;
  } else if (daysRemaining <= 5) {
    colorClass = "text-red-400 bg-red-500/10 border-red-500/30";
    label = `${daysRemaining} Days Left`;
  } else if (daysRemaining <= 14) {
    colorClass = "text-amber-400 bg-amber-500/10 border-amber-500/30";
    label = `${daysRemaining} Days Left`;
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: clsx(
    "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono border",
    colorClass
  ), children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 12 }),
    label
  ] });
};
const StatusBadge = ({ status }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.DRAFTING;
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
const CommentDrawer = ({ cdrl, comments, onClose, onAddComment }) => {
  const [lineItem, setLineItem] = reactExports.useState("");
  const [commentText, setCommentText] = reactExports.useState("");
  const handleSubmit = (e) => {
    e.preventDefault();
    if (lineItem.trim() && commentText.trim()) {
      onAddComment(lineItem.trim(), commentText.trim());
      setLineItem("");
      setCommentText("");
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-border-ops-subtle bg-bg-ops-surface", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-text-ops-primary", children: cdrl.cdrl_sequence_number }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted truncate max-w-[200px]", children: cdrl.title })
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
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-4 py-3 border-b border-border-ops-subtle bg-bg-ops-overlay/50 space-y-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-xs", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "DID Reference" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-text-ops-primary", children: cdrl.did_reference })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-xs", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Revision" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-text-ops-primary", children: cdrl.revision })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-xs", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Status" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(StatusBadge, { status: cdrl.status })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-xs", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Contractual Due" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-text-ops-primary", children: cdrl.contractual_due_date })
      ] }),
      cdrl.review_deadline_date && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-xs", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Review Deadline" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(ReviewCountdownBadge, { daysRemaining: cdrl.days_until_review_deadline })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto px-4 py-3 space-y-3", children: comments.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-12 text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(MessageSquare, { size: 32, className: "mb-3 text-text-ops-muted/50" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-center", children: "No comments logged for this deliverable." })
    ] }) : comments.map((comment) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "rounded-lg border border-border-ops-subtle bg-bg-ops-overlay p-3 space-y-2",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-xs", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-blue-400", children: comment.line_item }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: comment.created_at })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-primary", children: comment.comment }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-text-ops-muted", children: [
            "— ",
            comment.commenter
          ] })
        ]
      },
      comment.id
    )) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, className: "px-4 py-3 border-t border-border-ops-subtle space-y-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          type: "text",
          value: lineItem,
          onChange: (e) => setLineItem(e.target.value),
          placeholder: "Line item / section reference",
          className: "w-full rounded border border-border-ops-subtle bg-bg-ops-overlay px-3 py-2 text-sm text-text-ops-primary placeholder:text-text-ops-muted focus:outline-none focus:border-blue-500/50"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "textarea",
        {
          value: commentText,
          onChange: (e) => setCommentText(e.target.value),
          placeholder: "Enter comment...",
          rows: 3,
          className: "w-full rounded border border-border-ops-subtle bg-bg-ops-overlay px-3 py-2 text-sm text-text-ops-primary placeholder:text-text-ops-muted focus:outline-none focus:border-blue-500/50 resize-none"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "submit",
          disabled: !lineItem.trim() || !commentText.trim(),
          className: "w-full rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 text-sm font-medium text-white transition-colors",
          children: "Log Comment"
        }
      )
    ] })
  ] });
};
const FilterBar = ({ filters, onFilterChange, counts }) => {
  const statuses = [
    "DRAFTING",
    "SUBMITTED",
    "UNDER_REVIEW",
    "ACCEPTED",
    "ACCEPTED_WITH_COMMENTS",
    "REJECTED"
  ];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-6 py-3 border-b border-border-ops-subtle bg-bg-ops-surface/50 space-y-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative flex-1 max-w-md", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { size: 16, className: "absolute left-3 top-1/2 -translate-y-1/2 text-text-ops-muted" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          type: "text",
          value: filters.search || "",
          onChange: (e) => onFilterChange({ ...filters, search: e.target.value || null }),
          placeholder: "Search by CDRL number, title, or DID reference...",
          className: "w-full rounded border border-border-ops-subtle bg-bg-ops-overlay pl-9 pr-3 py-2 text-sm text-text-ops-primary placeholder:text-text-ops-muted focus:outline-none focus:border-blue-500/50"
        }
      ),
      filters.search && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => onFilterChange({ ...filters, search: null }),
          className: "absolute right-2 top-1/2 -translate-y-1/2 text-text-ops-muted hover:text-text-ops-primary",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 14 })
        }
      )
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Filter, { size: 14, className: "text-text-ops-muted" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted uppercase tracking-wider", children: "Status" }),
      statuses.map((status) => {
        const isActive = filters.status === status;
        const count = counts[status] || 0;
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
const ContractDeliverablesView = () => {
  const [cdrls, setCdrls] = reactExports.useState([]);
  const [isLoading, setIsLoading] = reactExports.useState(true);
  const [error, setError] = reactExports.useState(null);
  const [filters, setFilters] = reactExports.useState({ status: null, search: null });
  const [selectedCdrl, setSelectedCdrl] = reactExports.useState(null);
  const [drawerOpen, setDrawerOpen] = reactExports.useState(false);
  const [comments, setComments] = reactExports.useState([]);
  const [expandedRows, setExpandedRows] = reactExports.useState(/* @__PURE__ */ new Set());
  const fetchCdrls = reactExports.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get("/api/v1/cdrl/list");
      if (response.data) {
        setCdrls(response.data.cdrls || response.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch CDRLs:", err);
      setError("Failed to load contract deliverables. The backend may not be running.");
    } finally {
      setIsLoading(false);
    }
  }, []);
  reactExports.useEffect(() => {
    fetchCdrls();
  }, [fetchCdrls]);
  const statusCounts = reactExports.useMemo(() => {
    const counts = {};
    cdrls.forEach((cdrl) => {
      counts[cdrl.status] = (counts[cdrl.status] || 0) + 1;
    });
    return counts;
  }, [cdrls]);
  const filteredCdrls = reactExports.useMemo(() => {
    return cdrls.filter((cdrl) => {
      if (filters.status && cdrl.status !== filters.status) {
        return false;
      }
      if (filters.search) {
        const search = filters.search.toLowerCase();
        const matches = cdrl.cdrl_sequence_number.toLowerCase().includes(search) || cdrl.title.toLowerCase().includes(search) || cdrl.did_reference.toLowerCase().includes(search);
        if (!matches) return false;
      }
      return true;
    });
  }, [cdrls, filters]);
  const openDrawer = reactExports.useCallback((cdrl) => {
    setSelectedCdrl(cdrl);
    setComments([]);
    setDrawerOpen(true);
  }, []);
  const handleAddComment = reactExports.useCallback((lineItem, comment) => {
    const newComment = {
      id: `local-${Date.now()}`,
      cdrl_id: (selectedCdrl == null ? void 0 : selectedCdrl.id) || "",
      line_item: lineItem,
      commenter: "Current User",
      comment,
      created_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    setComments((prev) => [newComment, ...prev]);
  }, [selectedCdrl]);
  const toggleExpand = reactExports.useCallback((id) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-surface", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "w-5 h-5 text-blue-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold text-text-ops-primary", children: "Contract Deliverables Register" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "CDRL / SDRL tracking and review window management" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: fetchCdrls,
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
        counts: statusCounts
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-4 gap-4 px-6 py-3 border-b border-border-ops-subtle bg-bg-ops-surface/50", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 rounded-lg border border-border-ops-subtle bg-bg-ops-overlay px-4 py-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20", children: /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { size: 16, className: "text-blue-400" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-lg font-bold font-mono text-text-ops-primary", children: cdrls.length }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted uppercase tracking-wider", children: "Total" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 16, className: "text-amber-400" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-lg font-bold font-mono text-amber-400", children: statusCounts["UNDER_REVIEW"] || 0 }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted uppercase tracking-wider", children: "Under Review" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-8 w-8 items-center justify-center rounded-full bg-green-500/20", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 16, className: "text-green-400" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-lg font-bold font-mono text-green-400", children: (statusCounts["ACCEPTED"] || 0) + (statusCounts["ACCEPTED_WITH_COMMENTS"] || 0) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted uppercase tracking-wider", children: "Accepted" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-8 w-8 items-center justify-center rounded-full bg-red-500/20", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleAlert, { size: 16, className: "text-red-400" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-lg font-bold font-mono text-red-400", children: statusCounts["REJECTED"] || 0 }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted uppercase tracking-wider", children: "Rejected" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto", children: isLoading && cdrls.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-24 text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { size: 48, className: "mb-4 animate-spin text-blue-400" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-lg font-semibold", children: "Loading deliverables..." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm mt-1", children: "Querying the contract register." })
    ] }) : filteredCdrls.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-24 text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { size: 48, className: "mb-4 text-text-ops-muted/50" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-lg font-semibold text-text-ops-primary", children: "No Deliverables Found" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm mt-2 text-center max-w-md", children: filters.status || filters.search ? "No CDRLs match the current filters. Try adjusting your filter criteria." : "No contract deliverables have been registered yet." })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "sticky top-0 bg-bg-ops-surface border-b border-border-ops-subtle", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-left text-xs font-semibold text-text-ops-muted uppercase tracking-wider", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sr-only", children: "Expand" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-left text-xs font-semibold text-text-ops-muted uppercase tracking-wider", children: "CDRL Number" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-left text-xs font-semibold text-text-ops-muted uppercase tracking-wider", children: "Title" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-left text-xs font-semibold text-text-ops-muted uppercase tracking-wider", children: "DID Reference" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-left text-xs font-semibold text-text-ops-muted uppercase tracking-wider", children: "Revision" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-left text-xs font-semibold text-text-ops-muted uppercase tracking-wider", children: "Contractual Due" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-left text-xs font-semibold text-text-ops-muted uppercase tracking-wider", children: "Review Deadline" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-left text-xs font-semibold text-text-ops-muted uppercase tracking-wider", children: "Status" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-left text-xs font-semibold text-text-ops-muted uppercase tracking-wider", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sr-only", children: "Actions" }) })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { className: "divide-y divide-border-ops-subtle", children: filteredCdrls.map((cdrl) => {
        const isExpanded = expandedRows.has(cdrl.id);
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(React.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "tr",
            {
              className: "hover:bg-bg-ops-overlay/50 transition-colors cursor-pointer",
              onClick: () => toggleExpand(cdrl.id),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    className: "p-1 rounded text-text-ops-muted hover:text-text-ops-primary transition-colors",
                    onClick: (e) => {
                      e.stopPropagation();
                      toggleExpand(cdrl.id);
                    },
                    children: isExpanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronUp, { size: 16 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { size: 16 })
                  }
                ) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 font-mono text-text-ops-primary font-semibold", children: cdrl.cdrl_sequence_number }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-text-ops-primary max-w-[300px] truncate", children: cdrl.title }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 font-mono text-text-ops-muted", children: cdrl.did_reference }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 font-mono text-text-ops-muted", children: cdrl.revision }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 font-mono text-text-ops-muted", children: cdrl.contractual_due_date }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ReviewCountdownBadge, { daysRemaining: cdrl.days_until_review_deadline }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(StatusBadge, { status: cdrl.status }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    type: "button",
                    onClick: (e) => {
                      e.stopPropagation();
                      openDrawer(cdrl);
                    },
                    className: "inline-flex items-center gap-1.5 rounded border border-border-ops-subtle bg-bg-ops-overlay px-2.5 py-1 text-xs font-medium text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong transition-colors",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(MessageSquare, { size: 12 }),
                      "Comments"
                    ]
                  }
                ) })
              ]
            }
          ),
          isExpanded && /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { className: "bg-bg-ops-overlay/30", children: /* @__PURE__ */ jsxRuntimeExports.jsx("td", { colSpan: 9, className: "px-6 py-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4 text-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted text-xs uppercase tracking-wider", children: "Portfolio Node" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-mono text-text-ops-primary", children: cdrl.portfolio_node_id })
            ] }),
            cdrl.actual_submission_date && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted text-xs uppercase tracking-wider", children: "Submitted On" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-mono text-text-ops-primary", children: cdrl.actual_submission_date })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted text-xs uppercase tracking-wider", children: "Review Window" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "font-mono text-text-ops-primary", children: [
                cdrl.review_window_days,
                " days"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted text-xs uppercase tracking-wider", children: "Last Updated" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-mono text-text-ops-primary", children: cdrl.updated_at })
            ] })
          ] }) }) })
        ] }, cdrl.id);
      }) })
    ] }) }),
    drawerOpen && selectedCdrl && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "fixed inset-0 z-50 flex justify-end", role: "dialog", "aria-modal": "true", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: "absolute inset-0 bg-black/50",
          onClick: () => setDrawerOpen(false),
          "aria-hidden": "true"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "relative w-[480px] max-w-full h-full bg-bg-ops-surface border-l border-border-ops-subtle shadow-2xl flex flex-col", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        CommentDrawer,
        {
          cdrl: selectedCdrl,
          comments,
          onClose: () => setDrawerOpen(false),
          onAddComment: handleAddComment
        }
      ) })
    ] })
  ] });
};
export {
  ContractDeliverablesView as default
};
//# sourceMappingURL=ContractDeliverablesView-DSfmm11v.js.map
