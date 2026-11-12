import { r as reactExports, j as jsxRuntimeExports, G as Gauge, S as ShieldAlert, C as Clock, U as Users, c as clsx, u as useContextMenu, a as useHoverInspector, b as api, X, T as TriangleAlert, P as PresenceAvatars, L as Lock, E as ExportControlBadge, d as CircleCheck, H as HoverSummaryModal, e as UserPlus, f as ChevronDown, g as ChevronRight, h as User, i as CircleAlert, W as Wrench, R as React, k as Calendar, l as Send, m as Link, n as UserX, A as Activity, O as OctagonAlert, o as PanelRightOpen, p as GitBranch, q as Paperclip, s as ShieldCheck, M as MessageSquareText, t as UserCheck, v as RefreshCw, w as LayoutDashboard } from "./index-DwHrkWl2.js";
const DEFAULT_CAPACITY = 37.5;
const DialGauge = ({ value, max, size = 80 }) => {
  const ratio = Math.min(1, Math.max(0, value / max));
  const color = ratio < 0.6 ? "#10b981" : ratio < 0.85 ? "#f59e0b" : "#ef4444";
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - ratio);
  const center = size / 2;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("svg", { width: size, height: size, viewBox: `0 0 ${size} ${size}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "circle",
      {
        cx: center,
        cy: center,
        r: radius,
        fill: "none",
        stroke: "var(--bg-ops-overlay, #334155)",
        strokeWidth: 6
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "circle",
      {
        cx: center,
        cy: center,
        r: radius,
        fill: "none",
        stroke: color,
        strokeWidth: 6,
        strokeDasharray: circumference,
        strokeDashoffset,
        strokeLinecap: "round",
        transform: `rotate(-90 ${center} ${center})`,
        className: "transition-all duration-500"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "text",
      {
        x: center,
        y: center - 4,
        textAnchor: "middle",
        dominantBaseline: "middle",
        className: "fill-text-ops-primary text-sm font-mono font-bold",
        children: [
          value.toFixed(0),
          "h"
        ]
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "text",
      {
        x: center,
        y: center + 10,
        textAnchor: "middle",
        dominantBaseline: "middle",
        className: "fill-text-ops-muted text-xs font-mono",
        children: [
          "/ ",
          max.toFixed(1),
          "h"
        ]
      }
    )
  ] });
};
const MetricCard = ({ icon, label, value, subtext, warning, danger, children }) => {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: clsx(
        "relative flex flex-col rounded-lg border p-4 transition-colors",
        "bg-bg-ops-surface",
        danger ? "border-red-500/60" : warning ? "border-amber-500/60" : "border-border-ops-subtle"
      ),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: danger ? "text-red-400" : warning ? "text-amber-400" : "text-text-ops-muted", children: icon }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs uppercase tracking-wider text-text-ops-muted font-semibold", children: label })
        ] }),
        children ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 flex items-center", children }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 flex items-baseline gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: clsx(
                "text-3xl font-bold font-mono",
                danger ? "text-red-400" : warning ? "text-amber-400" : "text-text-ops-primary"
              ),
              children: value
            }
          ),
          subtext && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-text-ops-muted", children: subtext })
        ] })
      ]
    }
  );
};
const CockpitMetricsStrip = ({
  summary,
  weeklyCapacityHours = DEFAULT_CAPACITY
}) => {
  const metrics = reactExports.useMemo(() => {
    if (!summary) {
      return {
        sprintLoad: 0,
        criticalCount: 0,
        due48h: 0,
        blockedCount: 0,
        blockingOthers: 0
      };
    }
    return {
      sprintLoad: summary.total_planned_hours_week,
      criticalCount: summary.active_sprint_tasks,
      due48h: summary.tasks_due_48h,
      blockedCount: summary.blocked_tasks,
      blockingOthers: summary.blocking_others
    };
  }, [summary]);
  const loadRatio = metrics.sprintLoad / weeklyCapacityHours;
  const isOverloaded = loadRatio > 1;
  const isNearCapacity = loadRatio > 0.85 && !isOverloaded;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      MetricCard,
      {
        icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Gauge, { size: 16 }),
        label: "Sprint Commitment",
        value: "",
        warning: isNearCapacity,
        danger: isOverloaded,
        children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 flex-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(DialGauge, { value: metrics.sprintLoad, max: weeklyCapacityHours }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted", children: "Committed" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted", children: [
              ((weeklyCapacityHours - metrics.sprintLoad) / weeklyCapacityHours * 100).toFixed(0),
              "% free"
            ] })
          ] })
        ] })
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      MetricCard,
      {
        icon: /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { size: 16 }),
        label: "Critical Path Tasks",
        value: metrics.criticalCount,
        subtext: "tasks",
        warning: metrics.criticalCount > 0
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      MetricCard,
      {
        icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 16 }),
        label: "Due Within 48 Hours",
        value: metrics.due48h,
        subtext: "urgent",
        warning: metrics.due48h > 0,
        danger: metrics.due48h > 3
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      MetricCard,
      {
        icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { size: 16 }),
        label: "Blocking Others",
        value: metrics.blockingOthers,
        subtext: "waiting",
        warning: metrics.blockingOthers > 0,
        danger: metrics.blockingOthers > 2
      }
    )
  ] });
};
const ProgressBar = ({
  percent,
  isCritical
}) => {
  const color = percent >= 100 ? "bg-emerald-500" : isCritical ? "bg-red-500" : percent >= 75 ? "bg-amber-500" : "bg-sky-500";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 h-2 bg-bg-ops-overlay rounded-full overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: clsx("h-full rounded-full transition-all duration-300", color),
        style: { width: `${Math.min(100, percent)}%` }
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-mono text-text-ops-muted min-w-[3rem] text-right", children: [
      percent,
      "%"
    ] })
  ] });
};
const HoursLogger = ({ taskId, onRefresh }) => {
  const [hours, setHours] = reactExports.useState("");
  const [logging, setLogging] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const submit = reactExports.useCallback(
    async (e) => {
      e.preventDefault();
      const h = parseFloat(hours);
      if (isNaN(h) || h <= 0) {
        setError("Enter valid hours");
        return;
      }
      setLogging(true);
      setError(null);
      try {
        await api.post(`/cockpit/tasks/${taskId}/progress`, {
          increment: 0,
          hours_logged: h
        });
        setHours("");
        onRefresh == null ? void 0 : onRefresh();
      } catch {
        setError("Failed to log hours");
      } finally {
        setLogging(false);
      }
    },
    [hours, taskId, onRefresh]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: submit, className: "flex items-center gap-1", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        type: "number",
        step: "0.5",
        min: "0",
        max: "24",
        value: hours,
        onChange: (e) => setHours(e.target.value),
        placeholder: "hrs",
        className: clsx(
          "w-16 px-2 py-1 text-xs font-mono rounded border",
          "bg-bg-ops-base border-border-ops-subtle text-text-ops-primary",
          "focus:outline-none focus:border-sky-500",
          error && "border-red-500"
        )
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "submit",
        disabled: logging || !hours,
        className: clsx(
          "px-2 py-1 text-xs rounded border transition-colors",
          "border-border-ops-subtle text-text-ops-muted",
          "hover:bg-bg-ops-overlay hover:text-text-ops-primary",
          "disabled:opacity-30 disabled:cursor-not-allowed"
        ),
        children: logging ? "..." : "Log"
      }
    ),
    error && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-red-400", children: error })
  ] });
};
const TaskCard = ({ task, onRefresh, onFlagBlocker }) => {
  var _a, _b;
  const [updating, setUpdating] = reactExports.useState(null);
  const [vvAlert, setVvAlert] = reactExports.useState(false);
  const { openContextMenu } = useContextMenu();
  const cardRef = reactExports.useRef(null);
  const hoverInspector = useHoverInspector({
    targetData: {
      entityType: "TASK",
      entityId: task.id
    },
    enterDelayMs: 5e3,
    exitDelayMs: 2e3
  });
  reactExports.useEffect(() => {
    if (hoverInspector.handlers.onRef) {
      hoverInspector.handlers.onRef(cardRef.current);
    }
  }, [hoverInspector.handlers.onRef]);
  const isCritical = task.is_critical === true || task.total_float !== null && task.total_float <= 0;
  const isMasked = task.is_masked === true;
  const hasBlockers = task.blockers && task.blockers.length > 0;
  const isComplete = task.percent_complete >= 100;
  const updateProgress = reactExports.useCallback(
    async (increment) => {
      var _a2;
      setUpdating(String(increment));
      try {
        const resp = await api.post(
          `/cockpit/tasks/${task.id}/progress`,
          { increment }
        );
        if (increment === "complete" && ((_a2 = resp == null ? void 0 : resp.data) == null ? void 0 : _a2.vv_signoff_missing)) {
          setVvAlert(true);
          setTimeout(() => setVvAlert(false), 5e3);
        } else {
          onRefresh == null ? void 0 : onRefresh();
        }
      } catch {
      } finally {
        setUpdating(null);
      }
    },
    [task.id, onRefresh]
  );
  const handleCardMouseEnter = () => {
    hoverInspector.handlers.onMouseEnter();
  };
  const handleCardMouseLeave = () => {
    hoverInspector.handlers.onMouseLeave();
  };
  const handleCardContextMenu = (e) => {
    e.preventDefault();
    openContextMenu(e, "KANBAN_CARD", {
      nodeId: task.id,
      code: task.code,
      percentComplete: task.percent_complete,
      isCritical: task.is_critical,
      hasBlockers: !!(task.blockers && task.blockers.length > 0)
    });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        ref: cardRef,
        className: clsx(
          "group relative flex flex-col gap-3 p-4 rounded-lg border transition-all",
          "bg-bg-ops-surface",
          isCritical ? "border-l-4 border-l-red-500 border-y-border-ops-subtle border-r-border-ops-subtle" : "border-border-ops-subtle",
          isComplete && "opacity-60",
          "hover:border-border-ops-strong"
        ),
        onMouseEnter: handleCardMouseEnter,
        onMouseLeave: handleCardMouseLeave,
        onContextMenu: handleCardContextMenu,
        children: [
          vvAlert && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 p-2 mb-2 rounded bg-red-900/30 border border-red-500/40 text-red-400 text-xs", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { size: 14 }),
            "Cannot complete: V&V test sign-off is required. All mandatory verification tests must be PASSED or WAIVED.",
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setVvAlert(false), className: "ml-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 12 }) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-text-ops-muted", children: task.code }),
                isCritical && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-red-900/40 text-red-400", children: "Critical" }),
                hasBlockers && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-amber-400", title: `${(_a = task.blockers) == null ? void 0 : _a.length} active blocker(s)`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 14 }) }),
                task.requires_vv_signoff && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sky-400", title: "Requires V&V sign-off", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { size: 14 }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(PresenceAvatars, { nodeId: task.id, size: 18 })
              ] }),
              isMasked ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 text-sm italic text-text-ops-muted", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Lock, { size: 12 }),
                "[RESTRICTED]"
              ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 min-w-0", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-text-ops-primary truncate", children: task.name }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  ExportControlBadge,
                  {
                    regime: task.export_control_regime ?? null,
                    taaReference: task.taa_mla_reference ?? null
                  }
                )
              ] })
            ] }),
            task.planned_end_date && !isMasked && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-end text-xs font-mono text-text-ops-muted", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] uppercase", children: "Due" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: task.planned_end_date })
            ] })
          ] }),
          !isMasked && /* @__PURE__ */ jsxRuntimeExports.jsx(ProgressBar, { percent: task.percent_complete, isCritical }),
          !isMasked && !isComplete && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 pt-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => updateProgress(5),
                disabled: updating !== null,
                className: clsx(
                  "px-2 py-1 text-xs rounded border transition-colors",
                  "border-border-ops-subtle text-text-ops-muted",
                  "hover:bg-sky-900/30 hover:text-sky-400 hover:border-sky-500/40",
                  "disabled:opacity-30 disabled:cursor-not-allowed"
                ),
                title: "Add 5% progress",
                children: "+5%"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => updateProgress(10),
                disabled: updating !== null,
                className: clsx(
                  "px-2 py-1 text-xs rounded border transition-colors",
                  "border-border-ops-subtle text-text-ops-muted",
                  "hover:bg-sky-900/30 hover:text-sky-400 hover:border-sky-500/40",
                  "disabled:opacity-30 disabled:cursor-not-allowed"
                ),
                title: "Add 10% progress",
                children: "+10%"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => updateProgress("complete"),
                disabled: updating !== null,
                className: clsx(
                  "px-2 py-1 text-xs rounded border transition-colors",
                  "border-emerald-500/40 text-emerald-400",
                  "hover:bg-emerald-900/30",
                  "disabled:opacity-30 disabled:cursor-not-allowed"
                ),
                title: "Mark as complete",
                children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 12 }),
                  "Done"
                ] })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(HoursLogger, { taskId: task.id, onRefresh }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => onFlagBlocker == null ? void 0 : onFlagBlocker(task),
                className: clsx(
                  "px-2 py-1 text-xs rounded border transition-colors",
                  "border-amber-500/40 text-amber-400",
                  "hover:bg-amber-900/30"
                ),
                title: "Flag a blocker",
                children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 12 }),
                  "Blocker"
                ] })
              }
            )
          ] }),
          isComplete && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 text-xs text-emerald-400", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 12 }),
            "Complete"
          ] })
        ]
      }
    ),
    hoverInspector.state.isOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(
      HoverSummaryModal,
      {
        targetData: { entityType: "TASK", entityId: task.id },
        position: hoverInspector.state.position,
        placement: hoverInspector.state.placement,
        isExiting: hoverInspector.state.isExiting,
        onClose: hoverInspector.close,
        onMouseEnter: hoverInspector.modalCallbacks.onMouseEnter,
        onMouseLeave: hoverInspector.modalCallbacks.onMouseLeave,
        floatingStyles: hoverInspector.floatingStyles,
        floatingRef: (_b = hoverInspector.refs) == null ? void 0 : _b.setFloating
      }
    )
  ] });
};
const FocusQueue = ({
  tasks,
  onRefresh,
  onFlagBlocker
}) => {
  if (tasks.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-12 text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 32, className: "mb-3 opacity-40" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm italic", children: "No active tasks in your focus queue" })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-between mb-1", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "text-sm font-semibold text-text-ops-primary flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 14 }),
      "Focus Queue",
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-mono text-text-ops-muted", children: [
        "(",
        tasks.length,
        " tasks)"
      ] })
    ] }) }),
    tasks.map((task) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      TaskCard,
      {
        task,
        onRefresh,
        onFlagBlocker
      },
      task.id
    ))
  ] });
};
const PROFICIENCY_LABELS = {
  1: "Novice",
  2: "Intermediate",
  3: "Competent",
  4: "Expert",
  5: "Master"
};
const ClaimableTaskItem = ({ task, onClaimed }) => {
  const [expanded, setExpanded] = reactExports.useState(false);
  const [claiming, setClaiming] = reactExports.useState(false);
  const [claimed, setClaimed] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const isMasked = task.is_masked === true;
  const handleClaim = reactExports.useCallback(async () => {
    var _a, _b;
    setClaiming(true);
    setError(null);
    try {
      await api.post(`/cockpit/claimable-tasks/${task.id}/claim`);
      setClaimed(true);
      onClaimed == null ? void 0 : onClaimed();
    } catch (err) {
      const msg = ((_b = (_a = err == null ? void 0 : err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to claim task";
      setError(typeof msg === "string" ? msg : "Failed to claim task");
    } finally {
      setClaiming(false);
    }
  }, [task.id, onClaimed]);
  if (claimed) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: clsx(
          "flex items-center gap-3 p-3 rounded-lg border",
          "bg-bg-ops-surface border-border-ops-subtle opacity-50"
        ),
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 16, className: "text-emerald-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-text-ops-muted italic", children: "Claimed" })
        ]
      }
    );
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: clsx(
        "rounded-lg border transition-colors",
        "bg-bg-ops-surface border-border-ops-subtle",
        "hover:border-border-ops-strong"
      ),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: "flex items-center gap-3 p-3 cursor-pointer",
            onClick: () => setExpanded(!expanded),
            role: "button",
            tabIndex: 0,
            onKeyDown: (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setExpanded(!expanded);
              }
            },
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: expanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { size: 14 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { size: 14 }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-text-ops-muted", children: task.code }),
              isMasked ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1 text-sm italic text-text-ops-muted", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Lock, { size: 12 }),
                "[RESTRICTED]"
              ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex-1 text-sm text-text-ops-primary truncate", children: task.name }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "span",
                {
                  className: clsx(
                    "flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded",
                    "bg-amber-900/30 text-amber-400 border border-amber-500/30"
                  ),
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(User, { size: 10 }),
                    task.placeholder_code
                  ]
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-mono text-text-ops-muted", children: [
                task.percent_complete,
                "%"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: (e) => {
                    e.stopPropagation();
                    handleClaim();
                  },
                  disabled: claiming,
                  className: clsx(
                    "flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded transition-colors",
                    "bg-sky-600 text-white hover:bg-sky-500",
                    "disabled:opacity-30 disabled:cursor-not-allowed"
                  ),
                  children: claiming ? "..." : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(UserPlus, { size: 12 }),
                    "Claim Task"
                  ] })
                }
              )
            ]
          }
        ),
        error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 px-3 pb-2 text-xs text-red-400", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(CircleAlert, { size: 12 }),
          error
        ] }),
        expanded && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-3 pb-3 pt-1 border-t border-border-ops-subtle mt-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3 text-xs", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(User, { size: 12, className: "text-text-ops-muted" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Role:" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-primary", children: task.placeholder_name })
            ] }),
            task.required_skill && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Wrench, { size: 12, className: "text-text-ops-muted" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Skill:" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-primary", children: task.required_skill })
            ] }),
            task.min_proficiency !== null && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Min Level:" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-primary", children: PROFICIENCY_LABELS[task.min_proficiency] || task.min_proficiency })
            ] }),
            task.planned_end_date && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 12, className: "text-text-ops-muted" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Due:" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-primary font-mono", children: task.planned_end_date })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Classification:" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-primary", children: task.security_classification })
            ] }),
            task.delivery_mode && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Mode:" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-primary", children: task.delivery_mode })
            ] })
          ] }),
          task.caveats && task.caveats.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 flex flex-wrap gap-1", children: task.caveats.map((caveat) => /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: "px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-red-900/30 text-red-400 border border-red-500/30",
              children: caveat
            },
            caveat
          )) })
        ] })
      ]
    }
  );
};
const ClaimableQueue = ({ tasks, onClaimed }) => {
  if (tasks.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-8 text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(UserPlus, { size: 28, className: "mb-2 opacity-40" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm italic", children: "No claimable tasks available" })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-between mb-1", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "text-sm font-semibold text-text-ops-primary flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(UserPlus, { size: 14 }),
      "Available to Pick Up",
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-mono text-text-ops-muted", children: [
        "(",
        tasks.length,
        " tasks)"
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-2", children: tasks.map((task) => /* @__PURE__ */ jsxRuntimeExports.jsx(ClaimableTaskItem, { task, onClaimed }, task.id)) })
  ] });
};
const DayCell = ({ day, onHoursChange }) => {
  const [editing, setEditing] = reactExports.useState(false);
  const [localHours, setLocalHours] = reactExports.useState(day.logged_hours.toString());
  const handleSave = reactExports.useCallback(() => {
    const h = parseFloat(localHours);
    if (!isNaN(h) && h >= 0) {
      onHoursChange == null ? void 0 : onHoursChange(day.date, h);
    }
    setEditing(false);
  }, [localHours, day.date, onHoursChange]);
  const handleKeyDown = reactExports.useCallback(
    (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        setLocalHours(day.logged_hours.toString());
        setEditing(false);
      }
    },
    [handleSave, day.logged_hours]
  );
  const isOverlogged = day.logged_hours > day.scheduled_hours && day.scheduled_hours > 0;
  const isUnderlogged = day.logged_hours < day.scheduled_hours && day.scheduled_hours > 0;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: clsx(
        "flex flex-col p-2 rounded-lg border transition-colors min-w-[90px]",
        day.is_weekend ? "bg-bg-ops-base/50 border-border-ops-subtle/30 opacity-50" : "bg-bg-ops-surface border-border-ops-subtle",
        day.is_today && !day.is_weekend && "ring-1 ring-sky-500/40"
      ),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold text-text-ops-primary", children: day.day_name }),
          day.is_today && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] font-bold uppercase tracking-wider text-sky-400", children: "Today" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] font-mono text-text-ops-muted mb-2", children: [
          day.date.slice(5),
          " "
        ] }),
        day.scheduled_hours > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 10, className: "text-text-ops-muted" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-text-ops-muted", children: [
            day.scheduled_hours.toFixed(1),
            "h planned"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-1 mt-auto", children: editing ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "number",
            step: "0.5",
            min: "0",
            max: "24",
            value: localHours,
            onChange: (e) => setLocalHours(e.target.value),
            onBlur: handleSave,
            onKeyDown: handleKeyDown,
            autoFocus: true,
            className: clsx(
              "w-16 px-1 py-0.5 text-xs font-mono rounded border",
              "bg-bg-ops-base border-border-ops-subtle text-text-ops-primary",
              "focus:outline-none focus:border-sky-500"
            )
          }
        ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => {
              if (!day.is_weekend) {
                setEditing(true);
                setLocalHours(day.logged_hours.toString());
              }
            },
            disabled: day.is_weekend,
            className: clsx(
              "flex items-center gap-1 px-1.5 py-0.5 text-xs font-mono rounded transition-colors",
              "hover:bg-bg-ops-overlay",
              "disabled:cursor-default",
              isOverlogged && "text-amber-400",
              isUnderlogged && "text-sky-400",
              !isOverlogged && !isUnderlogged && "text-text-ops-primary"
            ),
            title: "Click to edit logged hours",
            children: day.logged_hours > 0 ? `${day.logged_hours.toFixed(1)}h` : "—"
          }
        ) }),
        day.task_code && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] font-mono text-text-ops-muted mt-1 truncate", title: day.task_name || day.task_code, children: day.task_code })
      ]
    }
  );
};
const WeeklyMicroTimesheet = ({ snapshot, onSubmitted }) => {
  const [submitting, setSubmitting] = reactExports.useState(false);
  const [submitted, setSubmitted] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const [days, setDays] = reactExports.useState([]);
  React.useEffect(() => {
    if (snapshot) {
      setDays(snapshot.days);
      setSubmitted(false);
    }
  }, [snapshot]);
  const handleHoursChange = reactExports.useCallback(
    (date, hours) => {
      setDays(
        (prev) => prev.map((d) => d.date === date ? { ...d, logged_hours: hours } : d)
      );
    },
    []
  );
  const totals = reactExports.useMemo(() => {
    const totalScheduled = days.reduce((sum, d) => sum + d.scheduled_hours, 0);
    const totalLogged = days.reduce((sum, d) => sum + d.logged_hours, 0);
    return { totalScheduled, totalLogged };
  }, [days]);
  const handleSubmit = reactExports.useCallback(async () => {
    var _a, _b;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/timesheets/oracle/batches/create", {
        period_start: snapshot == null ? void 0 : snapshot.week_start,
        period_end: snapshot == null ? void 0 : snapshot.week_end
      });
      setSubmitted(true);
      onSubmitted == null ? void 0 : onSubmitted();
    } catch (err) {
      const msg = ((_b = (_a = err == null ? void 0 : err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to submit timesheet";
      setError(typeof msg === "string" ? msg : "Failed to submit timesheet");
    } finally {
      setSubmitting(false);
    }
  }, [snapshot, onSubmitted]);
  if (!snapshot || days.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-8 text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { size: 28, className: "mb-2 opacity-40" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm italic", children: "No timesheet data available" })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "text-sm font-semibold text-text-ops-primary flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { size: 14 }),
        "Weekly Timesheet",
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-mono text-text-ops-muted", children: [
          "(",
          snapshot.week_start,
          " → ",
          snapshot.week_end,
          ")"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 text-xs font-mono", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-text-ops-muted", children: [
          "Scheduled: ",
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-text-ops-primary", children: [
            totals.totalScheduled.toFixed(1),
            "h"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-text-ops-muted", children: [
          "Logged: ",
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-text-ops-primary", children: [
            totals.totalLogged.toFixed(1),
            "h"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-text-ops-muted", children: [
          "Capacity: ",
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-text-ops-primary", children: [
            snapshot.weekly_capacity_hours.toFixed(1),
            "h"
          ] })
        ] })
      ] })
    ] }),
    submitted && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 p-2 rounded bg-emerald-900/30 border border-emerald-500/40 text-emerald-400 text-xs", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 14 }),
      "Timesheet submitted for CAM approval."
    ] }),
    error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 p-2 rounded bg-red-900/30 border border-red-500/40 text-red-400 text-xs", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CircleAlert, { size: 14 }),
      error
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-7 gap-2", children: days.map((day) => /* @__PURE__ */ jsxRuntimeExports.jsx(DayCell, { day, onHoursChange: handleHoursChange }, day.date)) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 h-2 bg-bg-ops-overlay rounded-full overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: clsx(
            "h-full rounded-full transition-all duration-300",
            totals.totalLogged > snapshot.weekly_capacity_hours ? "bg-red-500" : totals.totalLogged > snapshot.weekly_capacity_hours * 0.85 ? "bg-amber-500" : "bg-sky-500"
          ),
          style: {
            width: `${Math.min(100, totals.totalLogged / snapshot.weekly_capacity_hours * 100)}%`
          }
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-mono text-text-ops-muted", children: [
        totals.totalLogged.toFixed(1),
        " / ",
        snapshot.weekly_capacity_hours.toFixed(1),
        "h"
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-end", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: handleSubmit,
        disabled: submitting || submitted || totals.totalLogged === 0,
        className: clsx(
          "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded transition-colors",
          "bg-sky-600 text-white hover:bg-sky-500",
          "disabled:opacity-30 disabled:cursor-not-allowed"
        ),
        children: submitting ? "Submitting..." : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Send, { size: 14 }),
          "Submit for CAM Approval"
        ] })
      }
    ) })
  ] });
};
const CATEGORIES = [
  {
    value: "DEPENDENCY_OVERDUE",
    label: "Dependency Overdue",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { size: 14 })
  },
  {
    value: "RESOURCE_UNAVAILABLE",
    label: "Resource Unavailable",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(UserX, { size: 14 })
  },
  {
    value: "CLEARANCE_HOLD",
    label: "Clearance Hold",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { size: 14 })
  },
  {
    value: "FACILITY_MAINTENANCE",
    label: "Facility Maintenance",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Wrench, { size: 14 })
  },
  {
    value: "OPERATIONAL_IMPEDIMENT",
    label: "Operational Impediment",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Activity, { size: 14 })
  }
];
const SEVERITIES = [
  {
    value: "CRITICAL",
    label: "Critical",
    color: "text-red-400",
    bgColor: "bg-red-900/40 border-red-500/50"
  },
  {
    value: "MAJOR",
    label: "Major",
    color: "text-amber-400",
    bgColor: "bg-amber-900/40 border-amber-500/50"
  },
  {
    value: "MINOR",
    label: "Minor",
    color: "text-sky-400",
    bgColor: "bg-sky-900/40 border-sky-500/50"
  }
];
const BlockerModal = ({
  task,
  isOpen,
  onClose,
  onCreated
}) => {
  const [category, setCategory] = reactExports.useState("");
  const [severity, setSeverity] = reactExports.useState("");
  const [impactedHours, setImpactedHours] = reactExports.useState("");
  const [submitting, setSubmitting] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const [success, setSuccess] = reactExports.useState(false);
  reactExports.useEffect(() => {
    if (isOpen) {
      setCategory("");
      setSeverity("");
      setImpactedHours("");
      setError(null);
      setSuccess(false);
    }
  }, [isOpen, task == null ? void 0 : task.id]);
  reactExports.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);
  const handleSubmit = reactExports.useCallback(
    async (e) => {
      var _a, _b;
      e.preventDefault();
      if (!task || !category || !severity || !impactedHours) {
        setError("Please fill in all fields");
        return;
      }
      const hours = parseFloat(impactedHours);
      if (isNaN(hours) || hours <= 0) {
        setError("Impacted hours must be a positive number");
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        await api.post(
          `/cockpit/tasks/${task.id}/blocker`,
          {
            category,
            severity,
            impacted_hours: hours
          }
        );
        setSuccess(true);
        setTimeout(() => {
          onClose();
          onCreated == null ? void 0 : onCreated();
        }, 1500);
      } catch (err) {
        const msg = ((_b = (_a = err == null ? void 0 : err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to create blocker";
        setError(typeof msg === "string" ? msg : "Failed to create blocker");
      } finally {
        setSubmitting(false);
      }
    },
    [task, category, severity, impactedHours, onClose, onCreated]
  );
  if (!isOpen || !task) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "fixed inset-0 z-50 flex items-center justify-center",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "blocker-modal-title",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: "absolute inset-0 bg-black/60 backdrop-blur-sm",
            onClick: onClose
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: clsx(
              "relative w-full max-w-lg mx-4 rounded-xl border shadow-2xl",
              "bg-bg-ops-surface border-border-ops-subtle"
            ),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-4 border-b border-border-ops-subtle", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-amber-400", children: /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 20 }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "h2",
                      {
                        id: "blocker-modal-title",
                        className: "text-base font-semibold text-text-ops-primary",
                        children: "Flag Blocker"
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-text-ops-muted", children: [
                      task.code,
                      ": ",
                      task.name
                    ] })
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    onClick: onClose,
                    className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors",
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 16 })
                  }
                )
              ] }),
              success ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center p-8 gap-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 48, className: "text-emerald-400" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-lg font-semibold text-text-ops-primary", children: "Blocker Created" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-text-ops-muted", children: "The impediment has been logged and recorded in the audit trail." })
              ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, className: "p-4 flex flex-col gap-4", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-2", children: "Category" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 gap-2", children: CATEGORIES.map((cat) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                    "button",
                    {
                      type: "button",
                      onClick: () => setCategory(cat.value),
                      className: clsx(
                        "flex items-center gap-3 p-3 rounded-lg border text-left transition-colors",
                        category === cat.value ? "bg-amber-900/20 border-amber-500/50 text-amber-400" : "bg-bg-ops-base border-border-ops-subtle text-text-ops-primary hover:border-border-ops-strong"
                      ),
                      children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: category === cat.value ? "text-amber-400" : "text-text-ops-muted", children: cat.icon }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm", children: cat.label }),
                        category === cat.value && /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 14, className: "ml-auto text-amber-400" })
                      ]
                    },
                    cat.value
                  )) })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-2", children: "Severity" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-2", children: SEVERITIES.map((sev) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: () => setSeverity(sev.value),
                      className: clsx(
                        "flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-semibold transition-colors",
                        severity === sev.value ? `${sev.bgColor} ${sev.color}` : "bg-bg-ops-base border-border-ops-subtle text-text-ops-primary hover:border-border-ops-strong"
                      ),
                      children: sev.label
                    },
                    sev.value
                  )) })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "label",
                    {
                      htmlFor: "impacted-hours",
                      className: "block text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-2",
                      children: "Impacted Hours"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "input",
                    {
                      id: "impacted-hours",
                      type: "number",
                      step: "0.5",
                      min: "0",
                      value: impactedHours,
                      onChange: (e) => setImpactedHours(e.target.value),
                      placeholder: "e.g., 8",
                      className: clsx(
                        "w-full px-3 py-2 text-sm font-mono rounded-lg border",
                        "bg-bg-ops-base border-border-ops-subtle text-text-ops-primary",
                        "focus:outline-none focus:border-amber-500"
                      )
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[10px] text-text-ops-muted", children: "Estimated hours of delay caused by this blocker." })
                ] }),
                error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 p-2 rounded bg-red-900/30 border border-red-500/40 text-red-400 text-xs", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 12 }),
                  error
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2 pt-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: onClose,
                      className: "px-4 py-2 text-sm rounded-lg border border-border-ops-subtle text-text-ops-muted hover:bg-bg-ops-overlay transition-colors",
                      children: "Cancel"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "submit",
                      disabled: submitting || !category || !severity || !impactedHours,
                      className: clsx(
                        "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors",
                        "bg-amber-600 text-white hover:bg-amber-500",
                        "disabled:opacity-30 disabled:cursor-not-allowed"
                      ),
                      children: submitting ? "Creating..." : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 14 }),
                        "Create Blocker"
                      ] })
                    }
                  )
                ] })
              ] })
            ]
          }
        )
      ]
    }
  );
};
function getSlaRemainingSeconds(slaDeadline) {
  const deadline = new Date(slaDeadline).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((deadline - now) / 1e3));
}
function formatCountdown(totalSeconds) {
  if (totalSeconds <= 0) return "EXPIRED";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${String(seconds).padStart(2, "0")}s`);
  return parts.join(" ");
}
function isUserEligible(userUpn, camUpn, delegateeUpn) {
  const normalized = userUpn.trim().toLowerCase();
  return normalized === camUpn.trim().toLowerCase() || normalized === delegateeUpn.trim().toLowerCase();
}
function useCountdown(deadlineIso, intervalMs = 1e3) {
  const [remaining, setRemaining] = reactExports.useState(0);
  const timerRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (!deadlineIso) {
      setRemaining(0);
      return;
    }
    const update = () => setRemaining(getSlaRemainingSeconds(deadlineIso));
    update();
    timerRef.current = setInterval(update, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [deadlineIso, intervalMs]);
  return remaining;
}
const EmergencyStoppageBanner = ({
  currentUserUpn,
  onReview,
  onDismiss,
  onEventRegistered,
  onEventUnregistered
}) => {
  const [activeEvent, setActiveEvent] = reactExports.useState(null);
  const [visible, setVisible] = reactExports.useState(false);
  const remainingSeconds = useCountdown(
    (activeEvent == null ? void 0 : activeEvent.sla_deadline) ?? null
  );
  const userUpn = currentUserUpn ?? localStorage.getItem("user_upn") ?? "";
  const handleEvent = reactExports.useCallback((event) => {
    if (!isUserEligible(userUpn, event.cam_upn, event.delegatee_upn)) {
      return;
    }
    setActiveEvent(event);
    setVisible(true);
  }, [userUpn]);
  reactExports.useEffect(() => {
    if (onEventRegistered) {
      onEventRegistered(handleEvent);
    }
    return () => {
      if (onEventUnregistered) {
        onEventUnregistered(handleEvent);
      }
    };
  }, [onEventRegistered, onEventUnregistered, handleEvent]);
  const handleDismiss = reactExports.useCallback(() => {
    if (activeEvent) {
      onDismiss == null ? void 0 : onDismiss(activeEvent);
    }
    setVisible(false);
    setActiveEvent(null);
  }, [activeEvent, onDismiss]);
  const handleReview = reactExports.useCallback(() => {
    if (activeEvent) {
      onReview == null ? void 0 : onReview(activeEvent);
    }
  }, [activeEvent, onReview]);
  if (!visible || !activeEvent) return null;
  const isSlaCritical = remainingSeconds > 0 && remainingSeconds < 3600;
  const isSlaExpired = remainingSeconds <= 0;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: clsx(
        "fixed top-0 left-0 right-0 z-[100] flex items-start justify-center p-4",
        "animate-in slide-in-from-top"
      ),
      role: "alert",
      "aria-live": "assertive",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: clsx(
              "absolute inset-0 pointer-events-none",
              isSlaExpired ? "bg-red-950/90" : "bg-gradient-to-b from-red-950/80 to-red-950/40"
            ),
            style: isSlaExpired ? {
              animation: "pulse-opacity 2s ease-in-out infinite"
            } : void 0
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: clsx(
              "relative w-full max-w-4xl rounded-xl border-2 shadow-2xl",
              "bg-bg-ops-surface border-red-500",
              isSlaExpired && "animate-pulse-border"
            ),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "div",
                {
                  className: clsx(
                    "absolute top-0 left-0 right-0 h-1 rounded-t-lg",
                    isSlaExpired ? "bg-red-500" : isSlaCritical ? "bg-amber-500" : "bg-red-400"
                  )
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "div",
                  {
                    className: clsx(
                      "flex-shrink-0 mt-0.5 p-2 rounded-lg",
                      isSlaExpired ? "bg-red-500/20 text-red-400" : "bg-red-900/40 text-red-400"
                    ),
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(OctagonAlert, { size: 24 })
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-1", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold uppercase tracking-wider text-red-400", children: "Critical Path Stoppage" }),
                    isSlaExpired && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-red-500 text-white", children: "SLA Breached" })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-base font-semibold text-text-ops-primary mb-1", children: [
                    activeEvent.task_code,
                    " — ",
                    activeEvent.task_name
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm text-text-ops-muted", children: [
                    "Task is blocked. Escalated under delegated authority from",
                    " ",
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-text-ops-primary", children: activeEvent.delegator_upn }),
                    "."
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mt-2", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      Clock,
                      {
                        size: 14,
                        className: clsx(
                          isSlaExpired ? "text-red-400" : isSlaCritical ? "text-amber-400" : "text-sky-400"
                        )
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs(
                      "span",
                      {
                        className: clsx(
                          "text-sm font-mono font-semibold",
                          isSlaExpired ? "text-red-400" : isSlaCritical ? "text-amber-400" : "text-text-ops-primary"
                        ),
                        children: [
                          "SLA remaining:",
                          " ",
                          formatCountdown(remainingSeconds)
                        ]
                      }
                    )
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 flex-shrink-0", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs(
                    "button",
                    {
                      onClick: handleReview,
                      className: clsx(
                        "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors",
                        "bg-red-600 text-white hover:bg-red-500",
                        "focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-bg-ops-surface"
                      ),
                      children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(PanelRightOpen, { size: 14 }),
                        "Review Stoppage Drawer"
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      onClick: handleDismiss,
                      className: "p-1.5 rounded-lg text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors",
                      title: "Dismiss alert",
                      children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 16 })
                    }
                  )
                ] })
              ] }) })
            ]
          }
        )
      ]
    }
  );
};
function getCategoryDisplay(category) {
  const map = {
    DEPENDENCY_OVERDUE: { label: "Dependency Overdue", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(GitBranch, { size: 14 }) },
    RESOURCE_UNAVAILABLE: { label: "Resource Unavailable", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(UserCheck, { size: 14 }) },
    CLEARANCE_HOLD: { label: "Clearance Hold", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldCheck, { size: 14 }) },
    FACILITY_MAINTENANCE: { label: "Facility Maintenance", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 14 }) },
    OPERATIONAL_IMPEDIMENT: { label: "Operational Impediment", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(OctagonAlert, { size: 14 }) }
  };
  return map[category] ?? { label: category, icon: /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 14 }) };
}
function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(void 0, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return String(iso);
  }
}
const DelegateStoppageDrawer = ({
  event,
  isOpen,
  onClose,
  onResolved,
  currentUserUpn
}) => {
  const [dispositionNotes, setDispositionNotes] = reactExports.useState("");
  const [submitting, setSubmitting] = reactExports.useState(false);
  const [confirmOpen, setConfirmOpen] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const [success, setSuccess] = reactExports.useState(false);
  const notesRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (isOpen && event) {
      setDispositionNotes("");
      setError(null);
      setSuccess(false);
      setConfirmOpen(false);
    }
  }, [isOpen, event == null ? void 0 : event.blocker_id]);
  reactExports.useEffect(() => {
    if (isOpen && !success && notesRef.current) {
      notesRef.current.focus();
    }
  }, [isOpen, success]);
  reactExports.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (confirmOpen) {
          setConfirmOpen(false);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, confirmOpen]);
  const userUpn = currentUserUpn ?? localStorage.getItem("user_upn") ?? "";
  const resolvedByRole = event && event.cam_upn.trim().toLowerCase() === userUpn.trim().toLowerCase() ? "cam" : "delegatee";
  const handleResolve = reactExports.useCallback(
    async (e) => {
      var _a, _b;
      e.preventDefault();
      if (!event || !dispositionNotes.trim()) {
        setError("Disposition notes are required");
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        const request = {
          disposition_notes: dispositionNotes.trim(),
          acting_delegate_upn: userUpn,
          resolved_by_role: resolvedByRole
        };
        await api.post(
          `/clashes/blockers/${event.blocker_id}/resolve`,
          request
        );
        setSuccess(true);
        setTimeout(() => {
          onClose();
          onResolved == null ? void 0 : onResolved(event.blocker_id);
        }, 2e3);
      } catch (err) {
        const msg = ((_b = (_a = err == null ? void 0 : err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to resolve stoppage";
        setError(typeof msg === "string" ? msg : "Failed to resolve stoppage");
      } finally {
        setSubmitting(false);
      }
    },
    [event, dispositionNotes, userUpn, resolvedByRole, onClose, onResolved]
  );
  const handleConfirmResolve = reactExports.useCallback(() => {
    setConfirmOpen(true);
  }, []);
  const handleExecuteResolve = reactExports.useCallback(() => {
    setConfirmOpen(false);
    handleResolve({ preventDefault: () => {
    } });
  }, [handleResolve]);
  if (!isOpen || !event) return null;
  const isCriticalPath = event.driving_path_tf <= 0;
  const categoryDisplay = getCategoryDisplay(event.root_cause.split(":")[0] || event.root_cause);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "fixed inset-0 z-[90] flex justify-end",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "stoppage-drawer-title",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: "absolute inset-0 bg-black/50 backdrop-blur-sm",
            onClick: onClose
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: clsx(
              "relative w-full max-w-lg ml-auto h-full flex flex-col",
              "bg-bg-ops-surface border-l border-border-ops-subtle shadow-2xl",
              "animate-in slide-in-from-right"
            ),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-4 border-b border-border-ops-subtle", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-red-400", children: /* @__PURE__ */ jsxRuntimeExports.jsx(OctagonAlert, { size: 20 }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "h2",
                      {
                        id: "stoppage-drawer-title",
                        className: "text-base font-semibold text-text-ops-primary",
                        children: "Delegate Stoppage Resolution"
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-text-ops-muted", children: [
                      event.task_code,
                      ": ",
                      event.task_name
                    ] })
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    onClick: onClose,
                    className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors",
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 16 })
                  }
                )
              ] }),
              success ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center flex-1 p-8 gap-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 48, className: "text-emerald-400" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-lg font-semibold text-text-ops-primary", children: "Stoppage Resolved" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-text-ops-muted text-center", children: "Impediment cleared under delegated authority. Audit trail recorded." })
              ] }) : (
                /* Scrollable content */
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-y-auto p-4 flex flex-col gap-6", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-3", children: "Blocker Root Cause" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-border-ops-subtle bg-bg-ops-base p-3", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-amber-400", children: categoryDisplay.icon }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium text-text-ops-primary", children: categoryDisplay.label })
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted leading-relaxed", children: event.root_cause }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 flex items-center gap-4 text-xs text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 12 }),
                        "Escalated: ",
                        formatDate(event.escalated_at)
                      ] }) })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-3", children: "Operational Impact" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-border-ops-subtle bg-bg-ops-base p-3", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-1", children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 14, className: "text-amber-400" }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted", children: "Impact Hours" })
                        ] }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xl font-bold text-text-ops-primary", children: event.operational_impact_hours }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted ml-1", children: "hrs" })
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs(
                        "div",
                        {
                          className: clsx(
                            "rounded-lg border p-3",
                            isCriticalPath ? "border-red-500/50 bg-red-900/20" : "border-border-ops-subtle bg-bg-ops-base"
                          ),
                          children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-1", children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx(
                                GitBranch,
                                {
                                  size: 14,
                                  className: isCriticalPath ? "text-red-400" : "text-text-ops-muted"
                                }
                              ),
                              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted", children: "Driving Path TF" })
                            ] }),
                            /* @__PURE__ */ jsxRuntimeExports.jsx(
                              "span",
                              {
                                className: clsx(
                                  "text-xl font-bold",
                                  isCriticalPath ? "text-red-400" : "text-text-ops-primary"
                                ),
                                children: event.driving_path_tf
                              }
                            ),
                            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted ml-1", children: "days" }),
                            isCriticalPath && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-1 flex items-center gap-1 text-[10px] text-red-400 font-medium", children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 10 }),
                              "Critical path — no float remaining"
                            ] })
                          ]
                        }
                      )
                    ] })
                  ] }),
                  event.evidence_files.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-3", children: "Evidence Files" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col gap-2", children: event.evidence_files.map((file, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                      "a",
                      {
                        href: file,
                        target: "_blank",
                        rel: "noopener noreferrer",
                        className: clsx(
                          "flex items-center gap-2 p-2 rounded-lg border",
                          "border-border-ops-subtle bg-bg-ops-base",
                          "hover:border-border-ops-strong transition-colors"
                        ),
                        children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsx(Paperclip, { size: 14, className: "text-text-ops-muted" }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-text-ops-primary truncate", children: file.split("/").pop() || file }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { size: 12, className: "ml-auto text-text-ops-muted flex-shrink-0" })
                        ]
                      },
                      idx
                    )) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-3", children: "Delegation Context" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border border-border-ops-subtle bg-bg-ops-base p-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted", children: "Delegator" }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium text-text-ops-primary", children: event.delegator_upn })
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted", children: "Delegatee (you)" }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium text-text-ops-primary", children: event.delegatee_upn })
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted", children: "CAM" }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium text-text-ops-primary", children: event.cam_upn })
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 pt-2 border-t border-border-ops-subtle", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-xs text-text-ops-muted", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldCheck, { size: 12, className: "text-sky-400" }),
                        "Acting as:",
                        " ",
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-text-ops-primary", children: resolvedByRole === "cam" ? "Contract Administrator (CAM)" : "Delegated Authority" })
                      ] }) })
                    ] }) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-3", children: "Resolution" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleResolve, className: "flex flex-col gap-3", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsxs(
                          "label",
                          {
                            htmlFor: "disposition-notes",
                            className: "flex items-center gap-2 text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-2",
                            children: [
                              /* @__PURE__ */ jsxRuntimeExports.jsx(MessageSquareText, { size: 12 }),
                              "Technical Disposition Notes"
                            ]
                          }
                        ),
                        /* @__PURE__ */ jsxRuntimeExports.jsx(
                          "textarea",
                          {
                            ref: notesRef,
                            id: "disposition-notes",
                            value: dispositionNotes,
                            onChange: (e) => setDispositionNotes(e.target.value),
                            placeholder: "Describe the resolution action taken under delegated authority...",
                            rows: 4,
                            className: clsx(
                              "w-full px-3 py-2 text-sm rounded-lg border resize-none",
                              "bg-bg-ops-base border-border-ops-subtle text-text-ops-primary",
                              "placeholder:text-text-ops-muted/50",
                              "focus:outline-none focus:border-red-500"
                            )
                          }
                        ),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-[10px] text-text-ops-muted", children: "Required. This will be recorded in the forensic audit trail." })
                      ] }),
                      error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 p-2 rounded bg-red-900/30 border border-red-500/40 text-red-400 text-xs", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 12 }),
                        error
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          type: "button",
                          onClick: handleConfirmResolve,
                          disabled: submitting || !dispositionNotes.trim(),
                          className: clsx(
                            "flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors",
                            "bg-red-600 text-white hover:bg-red-500",
                            "disabled:opacity-30 disabled:cursor-not-allowed",
                            "focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-bg-ops-surface"
                          ),
                          children: submitting ? "Resolving..." : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 14 }),
                            "Acknowledge & Clear Impediment"
                          ] })
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-text-ops-muted text-center", children: "This action will be attributed to your delegated authority and recorded in the audit log." })
                    ] })
                  ] })
                ] })
              ),
              confirmOpen && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "div",
                {
                  className: clsx(
                    "w-full max-w-sm mx-4 rounded-xl border shadow-2xl p-6",
                    "bg-bg-ops-surface border-border-ops-subtle"
                  ),
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 mb-3", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-amber-400", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldCheck, { size: 20 }) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-base font-semibold text-text-ops-primary", children: "Confirm Delegated Authority" })
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm text-text-ops-muted mb-4 leading-relaxed", children: [
                      "You are about to resolve this stoppage acting under",
                      " ",
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-text-ops-primary", children: "delegated authority" }),
                      " ",
                      "from",
                      " ",
                      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-text-ops-primary", children: event.delegator_upn }),
                      ". This action will be permanently recorded in the forensic audit trail."
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2", children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          type: "button",
                          onClick: () => setConfirmOpen(false),
                          className: "px-4 py-2 text-sm rounded-lg border border-border-ops-subtle text-text-ops-muted hover:bg-bg-ops-overlay transition-colors",
                          children: "Cancel"
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "button",
                        {
                          type: "button",
                          onClick: handleExecuteResolve,
                          disabled: submitting,
                          className: clsx(
                            "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors",
                            "bg-red-600 text-white hover:bg-red-500",
                            "disabled:opacity-30 disabled:cursor-not-allowed"
                          ),
                          children: submitting ? "Resolving..." : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                            /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 14 }),
                            "Confirm & Resolve"
                          ] })
                        }
                      )
                    ] })
                  ]
                }
              ) })
            ]
          }
        )
      ]
    }
  );
};
function buildWeeklySnapshot(prepopulateData) {
  var _a;
  if (!prepopulateData) return null;
  const today = /* @__PURE__ */ new Date();
  const dayOfWeek = today.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateStr = date.toISOString().split("T")[0];
    const isWeekend = i >= 5;
    const isToday = dateStr === today.toISOString().split("T")[0];
    const dayEntry = (_a = prepopulateData.days) == null ? void 0 : _a.find(
      (d) => d.date === dateStr
    );
    days.push({
      date: dateStr,
      day_name: dayNames[i],
      is_weekend: isWeekend,
      is_today: isToday,
      scheduled_hours: (dayEntry == null ? void 0 : dayEntry.scheduled_hours) || 0,
      logged_hours: (dayEntry == null ? void 0 : dayEntry.logged_hours) || 0,
      task_code: (dayEntry == null ? void 0 : dayEntry.task_code) || null,
      task_name: (dayEntry == null ? void 0 : dayEntry.task_name) || null
    });
  }
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const totalScheduled = days.reduce((sum, d) => sum + d.scheduled_hours, 0);
  return {
    week_start: monday.toISOString().split("T")[0],
    week_end: sunday.toISOString().split("T")[0],
    days,
    total_scheduled: totalScheduled,
    total_logged: days.reduce((sum, d) => sum + d.logged_hours, 0),
    weekly_capacity_hours: 37.5
  };
}
const DailyCockpitView = ({
  weeklyCapacityHours = 37.5
}) => {
  const [summary, setSummary] = reactExports.useState(null);
  const [focusTasks, setFocusTasks] = reactExports.useState([]);
  const [claimableTasks, setClaimableTasks] = reactExports.useState([]);
  const [timesheet, setTimesheet] = reactExports.useState(null);
  const [loading, setLoading] = reactExports.useState(true);
  const [refreshing, setRefreshing] = reactExports.useState(false);
  const [blockerTask, setBlockerTask] = reactExports.useState(null);
  const [blockerModalOpen, setBlockerModalOpen] = reactExports.useState(false);
  const [delegatedStoppages, setDelegatedStoppages] = reactExports.useState([]);
  const [drawerEvent, setDrawerEvent] = reactExports.useState(null);
  const [drawerOpen, setDrawerOpen] = reactExports.useState(false);
  const eventCallbacksRef = reactExports.useRef(/* @__PURE__ */ new Set());
  const handleStoppageEvent = reactExports.useCallback((event) => {
    for (const cb of eventCallbacksRef.current) {
      cb(event);
    }
    setDelegatedStoppages((prev) => {
      if (prev.some((s) => s.blocker_id === event.blocker_id)) {
        return prev;
      }
      return [event, ...prev];
    });
  }, []);
  const registerEventCallback = reactExports.useCallback(
    (cb) => {
      eventCallbacksRef.current.add(cb);
    },
    []
  );
  const unregisterEventCallback = reactExports.useCallback(
    (cb) => {
      eventCallbacksRef.current.delete(cb);
    },
    []
  );
  reactExports.useEffect(() => {
    const handler = (e) => {
      var _a;
      if (((_a = e.detail) == null ? void 0 : _a.event) === "CRITICAL_STOPPAGE_ESCALATED") {
        handleStoppageEvent(e.detail);
      }
    };
    window.addEventListener(
      "stoppage-escalated",
      handler
    );
    return () => window.removeEventListener(
      "stoppage-escalated",
      handler
    );
  }, [handleStoppageEvent]);
  const fetchData = reactExports.useCallback(async () => {
    var _a, _b;
    try {
      const [summaryResp, focusResp, claimableResp, timesheetResp] = await Promise.all([
        api.get("/cockpit/summary").catch(() => null),
        api.get("/cockpit/focus-queue").catch(() => null),
        api.get("/cockpit/claimable-tasks").catch(() => null),
        api.get("/timesheets/oracle/prepopulate").catch(() => null)
      ]);
      if (summaryResp) setSummary(summaryResp.data);
      if (focusResp) setFocusTasks(((_a = focusResp.data) == null ? void 0 : _a.tasks) || []);
      if (claimableResp) setClaimableTasks(((_b = claimableResp.data) == null ? void 0 : _b.tasks) || []);
      if (timesheetResp) setTimesheet(buildWeeklySnapshot(timesheetResp.data));
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);
  reactExports.useEffect(() => {
    fetchData();
  }, [fetchData]);
  const handleRefresh = reactExports.useCallback(() => {
    setRefreshing(true);
    fetchData().then(() => setRefreshing(false));
  }, [fetchData]);
  const handleFlagBlocker = reactExports.useCallback((task) => {
    setBlockerTask(task);
    setBlockerModalOpen(true);
  }, []);
  const handleBlockerClose = reactExports.useCallback(() => {
    setBlockerModalOpen(false);
    setBlockerTask(null);
  }, []);
  const handleBlockerCreated = reactExports.useCallback(() => {
    handleRefresh();
  }, [handleRefresh]);
  const handleReviewStoppage = reactExports.useCallback((event) => {
    setDrawerEvent(event);
    setDrawerOpen(true);
  }, []);
  const handleDrawerClose = reactExports.useCallback(() => {
    setDrawerOpen(false);
    setDrawerEvent(null);
  }, []);
  const handleStoppageResolved = reactExports.useCallback(
    (blockerId) => {
      setDelegatedStoppages(
        (prev) => prev.filter((s) => s.blocker_id !== blockerId)
      );
      handleRefresh();
    },
    [handleRefresh]
  );
  const handleBannerDismiss = reactExports.useCallback(
    (event) => {
      setTimeout(() => {
        setDelegatedStoppages(
          (prev) => prev.filter((s) => s.blocker_id !== event.blocker_id)
        );
      }, 5e3);
    },
    []
  );
  if (loading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center h-full py-24 text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { size: 32, className: "mb-3 animate-spin opacity-40" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm italic", children: "Loading cockpit data..." })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full overflow-y-auto", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      EmergencyStoppageBanner,
      {
        onReview: handleReviewStoppage,
        onDismiss: handleBannerDismiss,
        onEventRegistered: registerEventCallback,
        onEventUnregistered: unregisterEventCallback
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full p-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sky-400", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LayoutDashboard, { size: 20 }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "My Daily Cockpit" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: "Individual contributor operational landing page" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: handleRefresh,
            disabled: refreshing,
            className: clsx(
              "flex items-center gap-2 px-3 py-1.5 text-xs rounded border transition-colors",
              "border-border-ops-subtle text-text-ops-muted",
              "hover:bg-bg-ops-overlay hover:text-text-ops-primary",
              "disabled:opacity-30 disabled:cursor-not-allowed"
            ),
            title: "Refresh cockpit data",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { size: 12, className: refreshing ? "animate-spin" : "" }),
              "Refresh"
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        CockpitMetricsStrip,
        {
          summary,
          weeklyCapacityHours
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "lg:col-span-2 flex flex-col gap-6", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          FocusQueue,
          {
            tasks: focusTasks,
            onRefresh: handleRefresh,
            onFlagBlocker: handleFlagBlocker
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-6", children: [
          delegatedStoppages.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: clsx(
                "rounded-xl border-2 overflow-hidden",
                "border-red-500/50 bg-red-950/20"
              ),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 px-3 py-2 border-b border-red-500/30 bg-red-950/30", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { size: 14, className: "text-red-400" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xs font-bold uppercase tracking-wider text-red-400", children: "Active Delegated Stoppages" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-auto px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-500 text-white", children: delegatedStoppages.length })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col", children: delegatedStoppages.map((stoppage) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    onClick: () => handleReviewStoppage(stoppage),
                    className: clsx(
                      "flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                      "hover:bg-red-900/20",
                      "border-b border-red-500/20 last:border-b-0"
                    ),
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(OctagonAlert, { size: 14, className: "text-red-400 flex-shrink-0" }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-sm font-medium text-text-ops-primary truncate", children: [
                          stoppage.task_code,
                          " — ",
                          stoppage.task_name
                        ] }),
                        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-[10px] text-text-ops-muted truncate", children: [
                          "From ",
                          stoppage.delegator_upn,
                          " · ",
                          stoppage.operational_impact_hours,
                          "h impact"
                        ] })
                      ] }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx(PanelRightOpen, { size: 12, className: "text-text-ops-muted flex-shrink-0" })
                    ]
                  },
                  stoppage.blocker_id
                )) })
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            ClaimableQueue,
            {
              tasks: claimableTasks,
              onClaimed: handleRefresh
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-t border-border-ops-subtle pt-6", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            WeeklyMicroTimesheet,
            {
              snapshot: timesheet,
              onSubmitted: handleRefresh
            }
          ) })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      BlockerModal,
      {
        task: blockerTask,
        isOpen: blockerModalOpen,
        onClose: handleBlockerClose,
        onCreated: handleBlockerCreated
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      DelegateStoppageDrawer,
      {
        event: drawerEvent,
        isOpen: drawerOpen,
        onClose: handleDrawerClose,
        onResolved: handleStoppageResolved
      }
    )
  ] });
};
export {
  DailyCockpitView as default
};
//# sourceMappingURL=DailyCockpitView-B4IVzIWw.js.map
