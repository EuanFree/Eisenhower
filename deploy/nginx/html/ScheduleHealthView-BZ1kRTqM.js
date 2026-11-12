import { j as jsxRuntimeExports, I as Info, i as CircleAlert, T as TriangleAlert, U as Users, a7 as Building2, a9 as TrendingDown, ao as CalendarX, S as ShieldAlert, ap as GitPullRequestClosed, aq as MapPin, c as clsx, C as Clock, W as Wrench, y as Play, g as ChevronRight, x as LoaderCircle, d as CircleCheck, v as RefreshCw, r as reactExports, z as TrendingUp, X, ar as CalendarDays, as as RotateCcw, ak as Save, at as ArrowRight, au as showTypedConfirm, av as CONFIRM_PRESETS, b as api, A as Activity } from "./index-DwHrkWl2.js";
const SEVERITY_PILLS = [
  {
    value: "CRITICAL",
    label: "Critical",
    color: "text-red-400",
    bgActive: "bg-red-500/20 border-red-500/60 text-red-300",
    icon: CircleAlert
  },
  {
    value: "MAJOR",
    label: "Major",
    color: "text-amber-400",
    bgActive: "bg-amber-500/20 border-amber-500/60 text-amber-300",
    icon: TriangleAlert
  },
  {
    value: "ADVISORY",
    label: "Advisory",
    color: "text-blue-400",
    bgActive: "bg-blue-500/20 border-blue-500/60 text-blue-300",
    icon: Info
  }
];
const CATEGORY_PILLS = [
  { value: "RESOURCE_OVERALLOCATION", label: "Overallocation", icon: Users },
  { value: "FACILITY_CONTRAVENTION", label: "Facility", icon: Building2 },
  { value: "NEGATIVE_FLOAT_SLIP", label: "Float Slip", icon: TrendingDown },
  { value: "CALENDAR_EXCEPTION", label: "Calendar", icon: CalendarX },
  { value: "CREDENTIAL_LAPSE", label: "Credentials", icon: ShieldAlert },
  { value: "PREDECESSOR_UNMET", label: "Predecessor", icon: GitPullRequestClosed },
  { value: "SPATIAL_LOCATION_COLLISION", label: "Spatial", icon: MapPin }
];
const FilterPill = ({ label, active, activeStyle, icon: Icon, count, onClick }) => {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      type: "button",
      onClick,
      className: clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all",
        "border-border-ops-subtle bg-bg-ops-overlay text-text-ops-muted",
        active && activeStyle,
        !active && "hover:border-text-ops-muted hover:text-text-ops-primary"
      ),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { size: 14 }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: label }),
        count !== void 0 && count > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            className: clsx(
              "ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-mono font-bold",
              active ? "bg-white/20 text-white" : "bg-bg-ops-base text-text-ops-muted"
            ),
            children: count
          }
        )
      ]
    }
  );
};
const ClashFilterBar = ({
  filters,
  onFilterChange,
  bySeverity = {}
}) => {
  const handleSeverityChange = (severity) => {
    onFilterChange({
      ...filters,
      severity: filters.severity === severity ? null : severity
    });
  };
  const handleCategoryChange = (category) => {
    onFilterChange({
      ...filters,
      category: filters.category === category ? null : category
    });
  };
  const hasActiveFilters = filters.severity !== null || filters.category !== null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3 mb-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs uppercase tracking-wider text-text-ops-muted font-semibold", children: "Severity" }),
        filters.severity && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => onFilterChange({ ...filters, severity: null }),
            className: "text-xs text-text-ops-muted hover:text-text-ops-primary underline",
            children: "Clear"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          FilterPill,
          {
            label: "All",
            active: filters.severity === null,
            activeStyle: "bg-bg-ops-base border-text-ops-muted text-text-ops-primary",
            icon: Info,
            count: Object.values(bySeverity).reduce((a, b) => a + b, 0),
            onClick: () => onFilterChange({ ...filters, severity: null })
          }
        ),
        SEVERITY_PILLS.map((pill) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          FilterPill,
          {
            label: pill.label,
            active: filters.severity === pill.value,
            activeStyle: pill.bgActive,
            icon: pill.icon,
            count: bySeverity[pill.value] || 0,
            onClick: () => handleSeverityChange(pill.value)
          },
          pill.value
        ))
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs uppercase tracking-wider text-text-ops-muted font-semibold", children: "Category" }),
        filters.category && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => onFilterChange({ ...filters, category: null }),
            className: "text-xs text-text-ops-muted hover:text-text-ops-primary underline",
            children: "Clear"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          FilterPill,
          {
            label: "All",
            active: filters.category === null,
            activeStyle: "bg-bg-ops-base border-text-ops-muted text-text-ops-primary",
            icon: Info,
            onClick: () => onFilterChange({ ...filters, category: null })
          }
        ),
        CATEGORY_PILLS.map((pill) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          FilterPill,
          {
            label: pill.label,
            active: filters.category === pill.value,
            activeStyle: "bg-bg-ops-surface border-text-ops-muted text-text-ops-primary",
            icon: pill.icon,
            onClick: () => handleCategoryChange(pill.value)
          },
          pill.value
        ))
      ] })
    ] }),
    hasActiveFilters && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-xs text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Active filters:" }),
      filters.severity && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 rounded bg-bg-ops-overlay px-2 py-0.5", children: [
        "Severity: ",
        filters.severity,
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => onFilterChange({ ...filters, severity: null }),
            className: "ml-1 hover:text-text-ops-primary",
            children: "×"
          }
        )
      ] }),
      filters.category && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 rounded bg-bg-ops-overlay px-2 py-0.5", children: [
        "Category: ",
        filters.category,
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => onFilterChange({ ...filters, category: null }),
            className: "ml-1 hover:text-text-ops-primary",
            children: "×"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => onFilterChange({ severity: null, category: null }),
          className: "ml-2 text-amber-400 hover:text-amber-300 underline",
          children: "Clear all"
        }
      )
    ] })
  ] });
};
const SEVERITY_STYLES = {
  CRITICAL: {
    badgeBg: "bg-red-500/20",
    badgeText: "text-red-300",
    badgeBorder: "border-red-500/40",
    leftBorder: "border-l-red-500",
    icon: CircleAlert,
    label: "CRITICAL"
  },
  MAJOR: {
    badgeBg: "bg-amber-500/20",
    badgeText: "text-amber-300",
    badgeBorder: "border-amber-500/40",
    leftBorder: "border-l-amber-500",
    icon: TriangleAlert,
    label: "MAJOR"
  },
  ADVISORY: {
    badgeBg: "bg-blue-500/20",
    badgeText: "text-blue-300",
    badgeBorder: "border-blue-500/40",
    leftBorder: "border-l-blue-500",
    icon: Info,
    label: "ADVISORY"
  }
};
const CATEGORY_ICONS = {
  RESOURCE_OVERALLOCATION: Users,
  FACILITY_CONTRAVENTION: Building2,
  NEGATIVE_FLOAT_SLIP: TrendingDown,
  CALENDAR_EXCEPTION: CalendarX,
  CREDENTIAL_LAPSE: ShieldAlert,
  PREDECESSOR_UNMET: GitPullRequestClosed,
  SPATIAL_LOCATION_COLLISION: MapPin
};
const CATEGORY_LABELS = {
  RESOURCE_OVERALLOCATION: "Resource Overallocation",
  FACILITY_CONTRAVENTION: "Facility Contravention",
  NEGATIVE_FLOAT_SLIP: "Negative Float Slip",
  CALENDAR_EXCEPTION: "Calendar Exception",
  CREDENTIAL_LAPSE: "Credential Lapse",
  PREDECESSOR_UNMET: "Predecessor Unmet",
  SPATIAL_LOCATION_COLLISION: "Spatial Collision"
};
const formatDate$1 = (dateStr) => {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  } catch {
    return dateStr;
  }
};
const formatRelativeTime = (dateStr) => {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const now = /* @__PURE__ */ new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 6e4);
    const diffHours = Math.floor(diffMs / 36e5);
    const diffDays = Math.floor(diffMs / 864e5);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  } catch {
    return "";
  }
};
const ClashCard = ({
  clash,
  onRunLeveling,
  onResolve
}) => {
  const severityStyle = SEVERITY_STYLES[clash.severity];
  const SeverityIcon = severityStyle.icon;
  const CategoryIcon = CATEGORY_ICONS[clash.category];
  const categoryLabel = CATEGORY_LABELS[clash.category];
  const canLevel = clash.category === "RESOURCE_OVERALLOCATION";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: clsx(
        "group relative rounded-lg border border-l-4 p-4 transition-all",
        "bg-bg-ops-surface border-border-ops-subtle",
        severityStyle.leftBorder,
        "hover:border-border-ops-strong"
      ),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between mb-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "span",
              {
                className: clsx(
                  "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-bold font-mono uppercase tracking-wider",
                  severityStyle.badgeBg,
                  severityStyle.badgeText,
                  severityStyle.badgeBorder
                ),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SeverityIcon, { size: 12 }),
                  severityStyle.label
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 rounded border border-border-ops-subtle bg-bg-ops-overlay px-2 py-0.5 text-xs text-text-ops-muted", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(CategoryIcon, { size: 12 }),
              categoryLabel
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted flex items-center gap-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 12 }),
            formatRelativeTime(clash.created_at)
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-text-ops-primary mb-2", children: clash.title }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted mb-3 line-clamp-2", children: clash.description }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-4 mb-3 text-xs text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(CalendarX, { size: 12 }),
          "Window: ",
          formatDate$1(clash.conflict_window_start),
          " — ",
          formatDate$1(clash.conflict_window_end)
        ] }) }),
        (clash.conflicting_node_id || clash.conflicting_resource_id) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-3 space-y-1", children: [
          clash.conflicting_node_id && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-xs", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Conflicting node:" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-mono text-text-ops-primary", children: [
              clash.conflicting_node_id.slice(0, 8),
              "..."
            ] })
          ] }),
          clash.conflicting_resource_id && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-xs", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Conflicting resource:" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-mono text-text-ops-primary", children: [
              clash.conflicting_resource_id.slice(0, 8),
              "..."
            ] })
          ] })
        ] }),
        clash.recommended_action && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-3 rounded bg-bg-ops-overlay p-2 text-xs text-text-ops-muted border border-border-ops-subtle", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 mb-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Wrench, { size: 12 }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-text-ops-primary", children: "Recommended Action" })
          ] }),
          clash.recommended_action
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 pt-2 border-t border-border-ops-subtle", children: [
          canLevel && onRunLeveling && /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: () => onRunLeveling(clash.portfolio_node_id),
              className: "inline-flex items-center gap-1.5 rounded bg-blue-600/20 border border-blue-500/40 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-600/30 transition-colors",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Play, { size: 12 }),
                "Run Leveling Proposal"
              ]
            }
          ),
          onResolve && /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: () => onResolve(clash.id),
              className: "inline-flex items-center gap-1.5 rounded bg-bg-ops-overlay border border-border-ops-subtle px-3 py-1.5 text-xs font-medium text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong transition-colors",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { size: 12 }),
                "Mark Resolved"
              ]
            }
          )
        ] })
      ]
    }
  );
};
const SEVERITY_SUMMARY = [
  {
    severity: "CRITICAL",
    color: "red",
    icon: CircleAlert,
    label: "Critical"
  },
  {
    severity: "MAJOR",
    color: "amber",
    icon: TriangleAlert,
    label: "Major"
  },
  {
    severity: "ADVISORY",
    color: "blue",
    icon: Info,
    label: "Advisory"
  }
];
const ClashTriageBoard = ({
  clashes,
  bySeverity,
  totalClashes,
  isLoading,
  filters,
  onFilterChange,
  onRunLeveling,
  onResolve,
  projectId,
  isSweeping = false,
  onSweep,
  isComputingLeveling = false
}) => {
  const filteredClashes = clashes.filter((clash) => {
    if (filters.category && clash.category !== filters.category) {
      return false;
    }
    return true;
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-3 gap-4 px-6 py-3 border-b border-border-ops-subtle bg-bg-ops-surface/50", children: SEVERITY_SUMMARY.map((item) => {
      const Icon = item.icon;
      const count = bySeverity[item.severity] || 0;
      const isActive = filters.severity === item.severity;
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: () => onFilterChange({
            ...filters,
            severity: isActive ? null : item.severity
          }),
          className: clsx(
            "flex items-center gap-3 rounded-lg border px-4 py-3 transition-all text-left",
            isActive ? `border-${item.color}-500/60 bg-${item.color}-500/10` : "border-border-ops-subtle bg-bg-ops-overlay hover:border-border-ops-strong"
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "div",
              {
                className: clsx(
                  "flex h-10 w-10 items-center justify-center rounded-full",
                  `bg-${item.color}-500/20`
                ),
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { size: 20, className: `text-${item.color}-400` })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "div",
                {
                  className: clsx(
                    "text-2xl font-bold font-mono",
                    `text-${item.color}-400`
                  ),
                  children: count
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted uppercase tracking-wider", children: item.label })
            ] })
          ]
        },
        item.severity
      );
    }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-6", children: isLoading && clashes.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-24 text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { size: 48, className: "mb-4 animate-spin text-blue-400" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-lg font-semibold", children: "Loading clash issues..." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm mt-1", children: "Querying the schedule audit engine." })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ClashFilterBar,
        {
          filters,
          onFilterChange,
          bySeverity
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm text-text-ops-muted", children: [
          "Showing",
          " ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-text-ops-primary", children: filteredClashes.length }),
          " ",
          "of",
          " ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold text-text-ops-primary", children: totalClashes }),
          " ",
          "active clash",
          totalClashes !== 1 ? "es" : "",
          "."
        ] }),
        isComputingLeveling && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-2 text-xs text-blue-400", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { size: 12, className: "animate-spin" }),
          "Computing leveling proposal..."
        ] })
      ] }),
      filteredClashes.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-4", children: filteredClashes.map((clash) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        ClashCard,
        {
          clash,
          onRunLeveling,
          onResolve
        },
        clash.id
      )) }) : (
        /* Empty State */
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-24 text-text-ops-muted", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 64, className: "mb-4 text-green-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xl font-semibold text-text-ops-primary", children: "Schedule is Healthy" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm mt-2 text-center max-w-md", children: filters.severity || filters.category ? "No clashes match the current filters. Try adjusting your filter criteria." : "No active schedule conflicts detected. The portfolio is clear of resource overallocations, facility collisions, and credential lapses." }),
          projectId && onSweep && /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: onSweep,
              disabled: isSweeping,
              className: "mt-4 inline-flex items-center gap-2 rounded border border-border-ops-subtle bg-bg-ops-overlay px-4 py-2 text-sm font-medium text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong transition-colors disabled:opacity-50",
              children: [
                isSweeping ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { size: 14, className: "animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { size: 14 }),
                "Run New Sweep"
              ]
            }
          )
        ] })
      )
    ] }) })
  ] });
};
const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  } catch {
    return dateStr;
  }
};
const daysBetween = (startStr, endStr) => {
  try {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const diffMs = end.getTime() - start.getTime();
    return Math.round(diffMs / 864e5);
  } catch {
    return 0;
  }
};
const ShiftRow = ({ shift, index }) => {
  const startShift = daysBetween(shift.original_start, shift.proposed_start);
  const finishShift = daysBetween(shift.original_finish, shift.proposed_finish);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "tr",
    {
      className: clsx(
        "border-b border-border-ops-subtle text-xs",
        shift.milestone_breach && "bg-red-500/10",
        index % 2 === 0 ? "bg-bg-ops-overlay/30" : ""
      ),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "px-3 py-2 align-top", rowSpan: 2, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-mono font-semibold text-text-ops-primary", children: shift.code }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted truncate max-w-48", title: shift.name, children: shift.name }),
          shift.reason && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 text-text-ops-muted italic text-[10px]", children: shift.reason })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 align-top font-mono text-text-ops-muted", children: formatDate(shift.original_start) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 align-top font-mono text-text-ops-muted", children: formatDate(shift.original_finish) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 align-top font-mono text-text-ops-muted", children: shift.consumed_float_days > 0 ? `${shift.consumed_float_days}d available` : "0d" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-2 py-2 align-top text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowRight, { size: 14, className: "text-text-ops-muted" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "px-3 py-2 align-top font-mono", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: clsx(
            startShift !== 0 ? "text-amber-300 font-bold" : "text-text-ops-primary"
          ), children: formatDate(shift.proposed_start) }),
          startShift > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[10px] text-amber-400", children: [
            "+",
            startShift,
            "d"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "px-3 py-2 align-top font-mono", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: clsx(
            finishShift !== 0 ? "text-amber-300 font-bold" : "text-text-ops-primary"
          ), children: formatDate(shift.proposed_finish) }),
          finishShift > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[10px] text-amber-400", children: [
            "+",
            finishShift,
            "d"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 align-top font-mono", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: clsx(
          shift.consumed_float_days > 0 ? "text-amber-300" : "text-text-ops-primary"
        ), children: [
          shift.consumed_float_days,
          "d"
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 align-top text-center", children: shift.milestone_breach ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 rounded bg-red-500/20 border border-red-500/40 px-2 py-0.5 text-[10px] font-bold text-red-300 uppercase", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 10 }),
          "Breach"
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-flex items-center gap-1 text-green-400", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 12 }) }) })
      ]
    }
  );
};
const LevelingDiffModal = ({
  proposal,
  isOpen,
  onClose,
  onCommitSuccess
}) => {
  const [isCommitting, setIsCommitting] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  if (!isOpen || !proposal) return null;
  const hasBreaches = proposal.shifts.some((s) => s.milestone_breach);
  const breachCount = proposal.shifts.filter((s) => s.milestone_breach).length;
  const handleDiscard = () => {
    setError(null);
    onClose();
  };
  const handleCommit = async () => {
    var _a, _b;
    const result = await showTypedConfirm(
      CONFIRM_PRESETS.applyLeveling(proposal.project_id)
    );
    if (!result.confirmed) return;
    setIsCommitting(true);
    setError(null);
    try {
      const shifts = proposal.shifts.map((s) => ({
        node_id: s.node_id,
        proposed_start: s.proposed_start,
        proposed_finish: s.proposed_finish
      }));
      await api.post(
        `/api/v1/schedule/clashes/apply-leveling/${proposal.project_id}`,
        { shifts }
      );
      onCommitSuccess == null ? void 0 : onCommitSuccess();
      onClose();
    } catch (err) {
      setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to commit leveling plan");
    } finally {
      setIsCommitting(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "fixed inset-0 z-50 flex items-center justify-center", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "absolute inset-0 bg-black/60 backdrop-blur-sm",
        onClick: handleDiscard
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "relative w-full max-w-6xl max-h-[90vh] rounded-xl border border-border-ops-subtle bg-bg-ops-base shadow-2xl overflow-hidden flex flex-col",
        style: { minWidth: "800px" },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-surface", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-lg font-bold text-text-ops-primary flex items-center gap-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingUp, { size: 20, className: "text-blue-400" }),
                "Leveling Proposal Review"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-text-ops-muted mt-1", children: [
                proposal.total_shifts,
                " proposed shifts across",
                " ",
                proposal.overallocation_windows,
                " overallocation window",
                proposal.overallocation_windows !== 1 ? "s" : "",
                ".",
                proposal.message && ` ${proposal.message}`
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: handleDiscard,
                className: "rounded p-2 text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 20 })
              }
            )
          ] }),
          hasBreaches && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 px-6 py-3 bg-red-500/10 border-b border-red-500/30", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 18, className: "text-red-400 flex-shrink-0" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-sm", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-bold text-red-300", children: "Milestone Breach Warning:" }),
              " ",
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-red-200", children: [
                breachCount,
                " of ",
                proposal.total_shifts,
                " proposed shifts will exceed available float and slip contractual delivery milestone",
                breachCount > 1 ? "s" : "",
                ". Review the flagged rows below before committing."
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-4 gap-4 px-6 py-3 border-b border-border-ops-subtle bg-bg-ops-surface/50", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-center", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted uppercase tracking-wider", children: "Total Shifts" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold font-mono text-text-ops-primary", children: proposal.total_shifts })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-center", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted uppercase tracking-wider", children: "Overallocation Windows" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold font-mono text-amber-300", children: proposal.overallocation_windows })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-center", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted uppercase tracking-wider", children: "Milestone Breaches" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: clsx(
                "text-2xl font-bold font-mono",
                breachCount > 0 ? "text-red-400" : "text-green-400"
              ), children: breachCount })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-center", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted uppercase tracking-wider", children: "Computed At" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-mono text-text-ops-muted", children: formatDate(proposal.computed_at) })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto p-6", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-xs", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b-2 border-border-ops-subtle", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left text-text-ops-muted font-semibold uppercase tracking-wider text-[10px]", children: "Node" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left text-text-ops-muted font-semibold uppercase tracking-wider text-[10px]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 10 }),
                  "Current Start"
                ] }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left text-text-ops-muted font-semibold uppercase tracking-wider text-[10px]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(CalendarDays, { size: 10 }),
                  "Current Finish"
                ] }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left text-text-ops-muted font-semibold uppercase tracking-wider text-[10px]", children: "Float" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-2 py-2 text-center text-[10px]" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left text-amber-300 font-semibold uppercase tracking-wider text-[10px]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 10 }),
                  "Proposed Start"
                ] }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left text-amber-300 font-semibold uppercase tracking-wider text-[10px]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(CalendarDays, { size: 10 }),
                  "Proposed Finish"
                ] }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left text-amber-300 font-semibold uppercase tracking-wider text-[10px]", children: "Consumed Float" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-center text-text-ops-muted font-semibold uppercase tracking-wider text-[10px]", children: "Status" })
              ] }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: proposal.shifts.map((shift, index) => /* @__PURE__ */ jsxRuntimeExports.jsx(ShiftRow, { shift, index }, shift.node_id)) })
            ] }),
            proposal.shifts.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-12 text-text-ops-muted", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 48, className: "mb-4 text-green-400" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-lg font-semibold", children: "No Shifts Required" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm mt-1", children: "No resource overallocations detected. The schedule is healthy." })
            ] })
          ] }),
          error && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-6 py-3 bg-red-500/10 border-t border-red-500/30 text-sm text-red-300", children: error }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-t border-border-ops-subtle bg-bg-ops-surface", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-text-ops-muted", children: [
              "Committing will update planned dates for ",
              proposal.total_shifts,
              " task",
              proposal.total_shifts !== 1 ? "s" : "",
              " in the database."
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  type: "button",
                  onClick: handleDiscard,
                  disabled: isCommitting,
                  className: "inline-flex items-center gap-2 rounded border border-border-ops-subtle bg-bg-ops-overlay px-4 py-2 text-sm font-medium text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong transition-colors disabled:opacity-50",
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(RotateCcw, { size: 14 }),
                    "Discard Changes"
                  ]
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  onClick: handleCommit,
                  disabled: isCommitting || proposal.shifts.length === 0,
                  className: clsx(
                    "inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-medium transition-colors",
                    "bg-blue-600 border border-blue-500 text-white hover:bg-blue-700",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    hasBreaches && "bg-amber-600 border-amber-500 hover:bg-amber-700"
                  ),
                  children: isCommitting ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { size: 14, className: "animate-spin" }),
                    "Committing..."
                  ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { size: 14 }),
                    "Commit Leveling Plan"
                  ] })
                }
              )
            ] })
          ] })
        ]
      }
    )
  ] });
};
const SEVERITY_ORDER = {
  CRITICAL: 0,
  MAJOR: 1,
  ADVISORY: 2
};
const ScheduleHealthView = ({ projectId }) => {
  const [clashes, setClashes] = reactExports.useState([]);
  const [bySeverity, setBySeverity] = reactExports.useState({});
  const [totalClashes, setTotalClashes] = reactExports.useState(0);
  const [isLoading, setIsLoading] = reactExports.useState(true);
  const [isSweeping, setIsSweeping] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const [filters, setFilters] = reactExports.useState({
    severity: null,
    category: null
  });
  const [levelingProposal, setLevelingProposal] = reactExports.useState(null);
  const [isLevelingModalOpen, setIsLevelingModalOpen] = reactExports.useState(false);
  const [isComputingLeveling, setIsComputingLeveling] = reactExports.useState(false);
  const fetchClashes = reactExports.useCallback(async () => {
    var _a, _b;
    setIsLoading(true);
    setError(null);
    try {
      const severityParam = filters.severity ? `?severity=${filters.severity}` : "";
      const response = await api.get(
        `/api/v1/schedule/clashes/${severityParam}`
      );
      if (response.data) {
        const sorted = [...response.data.clashes].sort((a, b) => {
          const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
          if (sevDiff !== 0) return sevDiff;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        setClashes(sorted);
        setBySeverity(response.data.by_severity || {});
        setTotalClashes(response.data.total_clashes);
      }
    } catch (err) {
      setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to fetch clash issues");
    } finally {
      setIsLoading(false);
    }
  }, [filters.severity]);
  reactExports.useEffect(() => {
    fetchClashes();
  }, [fetchClashes]);
  const handleSweep = async () => {
    var _a, _b;
    if (!projectId) {
      setError("No project ID provided for sweep");
      return;
    }
    setIsSweeping(true);
    setError(null);
    try {
      await api.post(`/api/v1/schedule/clashes/sweep/${projectId}`);
      await fetchClashes();
    } catch (err) {
      setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to run portfolio sweep");
    } finally {
      setIsSweeping(false);
    }
  };
  const handleRunLeveling = async (projectNodeId) => {
    var _a, _b;
    setIsComputingLeveling(true);
    setError(null);
    try {
      const response = await api.post(
        `/api/v1/schedule/clashes/leveling-proposal/${projectNodeId}`
      );
      if (response.data) {
        setLevelingProposal(response.data);
        setIsLevelingModalOpen(true);
      }
    } catch (err) {
      setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to compute leveling proposal");
    } finally {
      setIsComputingLeveling(false);
    }
  };
  const handleResolve = async (clashId) => {
    var _a, _b;
    try {
      await api.post(`/api/v1/schedule/clashes/resolve/${clashId}`);
      setClashes((prev) => prev.filter((c) => c.id !== clashId));
      setTotalClashes((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to resolve clash");
    }
  };
  const handleLevelingCommitSuccess = async () => {
    await fetchClashes();
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-surface", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("h1", { className: "text-xl font-bold text-text-ops-primary flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Activity, { size: 22, className: "text-amber-400" }),
          "Schedule Health Triage"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted mt-1", children: "Review and resolve schedule conflicts detected by the background audit daemon." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        projectId && /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: handleSweep,
            disabled: isSweeping,
            className: "inline-flex items-center gap-2 rounded border border-border-ops-subtle bg-bg-ops-overlay px-3 py-2 text-sm font-medium text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong transition-colors disabled:opacity-50",
            children: [
              isSweeping ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { size: 14, className: "animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { size: 14 }),
              "Run Sweep"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: fetchClashes,
            disabled: isLoading,
            className: "inline-flex items-center gap-2 rounded border border-border-ops-subtle bg-bg-ops-overlay px-3 py-2 text-sm font-medium text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong transition-colors disabled:opacity-50",
            children: [
              isLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { size: 14, className: "animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { size: 14 }),
              "Refresh"
            ]
          }
        )
      ] })
    ] }),
    error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 mx-6 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300", children: [
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
      ClashTriageBoard,
      {
        clashes,
        bySeverity,
        totalClashes,
        isLoading,
        filters,
        onFilterChange: setFilters,
        onRunLeveling: handleRunLeveling,
        onResolve: handleResolve,
        projectId,
        isSweeping,
        onSweep: handleSweep,
        isComputingLeveling
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      LevelingDiffModal,
      {
        proposal: levelingProposal,
        isOpen: isLevelingModalOpen,
        onClose: () => setIsLevelingModalOpen(false),
        onCommitSuccess: handleLevelingCommitSuccess
      }
    )
  ] });
};
export {
  ScheduleHealthView as default
};
//# sourceMappingURL=ScheduleHealthView-BZ1kRTqM.js.map
