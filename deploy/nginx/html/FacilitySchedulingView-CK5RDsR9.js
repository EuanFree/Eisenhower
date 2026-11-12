import { u as useContextMenu, r as reactExports, j as jsxRuntimeExports, k as Calendar, J as ChevronLeft, g as ChevronRight, c as clsx, K as Plus, T as TriangleAlert, C as Clock, W as Wrench, N as Thermometer, Q as Radio, Z as Zap, b as api, X, V as ClipboardList, h as User, Y as CircleCheckBig, v as RefreshCw, F as Filter } from "./index-DwHrkWl2.js";
const ROW_HEIGHT = 72;
const HEADER_HEIGHT = 48;
const LEFT_PANEL_WIDTH = 320;
const DAY_WIDTH_DAY = 60;
const DAY_WIDTH_WEEK = 12;
const DAY_WIDTH_MONTH = 3;
function formatDateHeader(date, zoom) {
  if (zoom === "day") {
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  }
  if (zoom === "week") {
    const weekNum = getISOWeek(date);
    return `W${weekNum}`;
  }
  return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 864e5 + 1) / 7);
}
function dateToX(date, startDate, dayWidth) {
  const diffMs = date.getTime() - startDate.getTime();
  const diffDays = diffMs / (1e3 * 60 * 60 * 24);
  return diffDays * dayWidth;
}
const CapabilityBadges = ({
  capabilities
}) => {
  if (!capabilities) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-1 mt-1", children: [
    capabilities.temp_min_c != null && capabilities.temp_max_c != null && /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "span",
      {
        className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-900/30 text-red-400 border border-red-800/50",
        title: `Temperature range: ${capabilities.temp_min_c}°C to ${capabilities.temp_max_c}°C`,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Thermometer, { className: "w-3 h-3" }),
          capabilities.temp_min_c,
          "°/",
          capabilities.temp_max_c,
          "°C"
        ]
      }
    ),
    capabilities.rf_shielding_db != null && /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "span",
      {
        className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-900/30 text-purple-400 border border-purple-800/50",
        title: `RF shielding: ${capabilities.rf_shielding_db} dB`,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Radio, { className: "w-3 h-3" }),
          capabilities.rf_shielding_db,
          " dB"
        ]
      }
    ),
    capabilities.max_power_kw != null && /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "span",
      {
        className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-900/30 text-amber-400 border border-amber-800/50",
        title: `Max power draw: ${capabilities.max_power_kw} kW`,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Zap, { className: "w-3 h-3" }),
          capabilities.max_power_kw,
          " kW"
        ]
      }
    )
  ] });
};
const FacilityInfoRow = ({ facility, isSelected }) => {
  const calibrationExpiry = facility.calibration_expiry_date ? new Date(facility.calibration_expiry_date) : null;
  const isCalibrationExpired = calibrationExpiry ? calibrationExpiry < /* @__PURE__ */ new Date() : false;
  const daysToExpiry = calibrationExpiry ? Math.ceil((calibrationExpiry.getTime() - (/* @__PURE__ */ new Date()).getTime()) / (1e3 * 60 * 60 * 24)) : null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: clsx(
        "flex flex-col justify-center px-3 border-r border-border-ops-subtle",
        "h-full overflow-hidden",
        isSelected && "bg-bg-ops-overlay"
      ),
      style: { width: LEFT_PANEL_WIDTH, height: ROW_HEIGHT },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-mono font-semibold text-text-ops-primary", children: facility.location_code }),
          isCalibrationExpired && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-600/30 text-red-400 border border-red-600/50", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-3 h-3" }),
            "CAL EXPIRED"
          ] }),
          daysToExpiry != null && daysToExpiry > 0 && daysToExpiry <= 30 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-600/30 text-amber-400 border border-amber-600/50", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "w-3 h-3" }),
            "CAL ",
            daysToExpiry,
            "d"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted truncate", title: facility.location_name, children: facility.location_name }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CapabilityBadges, { capabilities: facility.chamber_capabilities }),
        facility.warmup_cooldown_hours > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[9px] text-text-ops-muted mt-0.5", children: [
          "±",
          facility.warmup_cooldown_hours,
          "h buffer"
        ] })
      ]
    }
  );
};
const TimelineBlock = ({ slot, x, width, y, isBuffer = false }) => {
  if (width < 2) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: clsx(
        "absolute top-1 rounded-sm cursor-pointer transition-opacity hover:opacity-80",
        isBuffer ? "bg-amber-500/10 border border-amber-500/30" : "bg-sky-500/20 border border-sky-500/40"
      ),
      style: {
        left: `${x}px`,
        width: `${Math.max(width, 2)}px`,
        top: isBuffer ? `${ROW_HEIGHT - 16}px` : "4px",
        height: isBuffer ? "12px" : `${ROW_HEIGHT - 20}px`
      },
      title: isBuffer ? `Buffer: ${slot.portfolio_node_code} (${slot.test_operator_name || "Unassigned"})` : `${slot.portfolio_node_code}: ${slot.portfolio_node_name}
Operator: ${slot.test_operator_name || "Unassigned"}
${slot.reserved_start} → ${slot.reserved_end}`,
      children: [
        !isBuffer && width > 20 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-1 text-[9px] font-mono text-sky-300 truncate", children: slot.portfolio_node_code }),
        isBuffer && width > 30 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-1 text-[8px] font-mono text-amber-400/60 truncate", children: "buffer" })
      ]
    }
  );
};
const MaintenanceBlock = ({ window: maint, x, width, y }) => {
  if (width < 2) return null;
  const typeLabel = maint.maintenance_type === "SCHEDULED_RECALIBRATION" ? "Recalibration" : maint.maintenance_type === "ANNUAL_OVERHAUL" ? "Annual Overhaul" : "Repair";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "absolute top-1 rounded-sm bg-red-600/30 border border-red-600/60 cursor-not-allowed",
      style: {
        left: `${x}px`,
        width: `${Math.max(width, 2)}px`,
        top: "4px",
        height: `${ROW_HEIGHT - 20}px`
      },
      title: `🔒 ${typeLabel}: ${maint.work_order_reference}
Technician: ${maint.technician_name}
${maint.downtime_start} → ${maint.downtime_end}`,
      children: [
        width > 40 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 px-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Wrench, { className: "w-3 h-3 text-red-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[9px] font-mono text-red-300 truncate", children: maint.work_order_reference })
        ] }),
        width <= 40 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center w-full", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Wrench, { className: "w-3 h-3 text-red-400" }) })
      ]
    }
  );
};
const BufferPatternDefs = () => {
  const [injected, setInjected] = reactExports.useState(false);
  if (!injected) {
    setInjected(true);
    return /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { style: { position: "absolute", width: 0, height: 0 }, children: /* @__PURE__ */ jsxRuntimeExports.jsx("defs", { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "pattern",
      {
        id: "bufferCrossHatch",
        patternUnits: "userSpaceOnUse",
        width: "6",
        height: "6",
        patternTransform: "rotate(45)",
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          "line",
          {
            x1: "0",
            y1: "0",
            x2: "0",
            y2: "6",
            stroke: "rgba(245, 158, 11, 0.2)",
            strokeWidth: "1"
          }
        )
      }
    ) }) });
  }
  return null;
};
const ChamberGanttTimeline = ({
  facilities,
  startDate,
  endDate,
  onReserveClick,
  selectedFacilityId
}) => {
  const { openContextMenu } = useContextMenu();
  const [zoom, setZoom] = reactExports.useState("week");
  const dayWidth = zoom === "day" ? DAY_WIDTH_DAY : zoom === "week" ? DAY_WIDTH_WEEK : DAY_WIDTH_MONTH;
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1e3 * 60 * 60 * 24));
  const timelineWidth = totalDays * dayWidth;
  const ticks = reactExports.useMemo(() => {
    const tickInterval = zoom === "day" ? 1 : zoom === "week" ? 7 : 30;
    const ticks2 = [];
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);
    while (current <= endDate) {
      ticks2.push({
        date: new Date(current),
        x: dateToX(current, startDate, dayWidth),
        label: formatDateHeader(current, zoom)
      });
      current.setDate(current.getDate() + tickInterval);
    }
    return ticks2;
  }, [startDate, endDate, zoom, dayWidth]);
  const nowX = dateToX(/* @__PURE__ */ new Date(), startDate, dayWidth);
  const navigateTimeline = reactExports.useCallback(
    (direction) => {
      const days = zoom === "day" ? 7 : zoom === "week" ? 30 : 90;
      const sign = direction === "prev" ? -days : days;
      new Date(startDate.getTime() + sign * 24 * 60 * 60 * 1e3);
      new Date(endDate.getTime() + sign * 24 * 60 * 60 * 1e3);
      console.log(`Navigate timeline: ${direction} (${days} days)`);
    },
    [startDate, endDate, zoom]
  );
  const handleTimelineClick = reactExports.useCallback(
    (e, facilityIndex) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickDate = new Date(startDate.getTime() + clickX / dayWidth * 24 * 60 * 60 * 1e3);
      clickDate.setHours(0, 0, 0, 0);
      onReserveClick(facilities[facilityIndex].location_id, clickDate);
    },
    [startDate, dayWidth, facilities, onReserveClick]
  );
  if (facilities.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center h-full text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { className: "w-12 h-12 mb-4 opacity-50" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "No test facilities found." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs mt-1", children: "Facilities with tier='FACILITY' or SCIF accreditation will appear here." })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full bg-bg-ops-base overflow-hidden", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(BufferPatternDefs, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-3 py-2 border-b border-border-ops-subtle bg-bg-ops-surface", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => navigateTimeline("prev"),
            className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary",
            title: "Previous period",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronLeft, { className: "w-4 h-4" })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => navigateTimeline("next"),
            className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary",
            title: "Next period",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "w-4 h-4" })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted font-mono", children: [
          startDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
          " — ",
          endDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-1", children: ["day", "week", "month"].map((z) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => setZoom(z),
          className: clsx(
            "px-2 py-0.5 rounded text-xs font-medium transition-colors",
            zoom === z ? "bg-bg-ops-overlay text-text-ops-primary" : "text-text-ops-muted hover:text-text-ops-primary"
          ),
          children: z.charAt(0).toUpperCase() + z.slice(1)
        },
        z
      )) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-1 overflow-hidden", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: "flex-shrink-0 border-r border-border-ops-subtle bg-bg-ops-surface overflow-y-auto",
          style: { width: LEFT_PANEL_WIDTH },
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "div",
              {
                className: "flex items-center px-3 border-b border-border-ops-subtle bg-bg-ops-surface",
                style: { height: HEADER_HEIGHT },
                children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold text-text-ops-muted uppercase tracking-wider", children: "Test Facilities" })
              }
            ),
            facilities.map((facility) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              FacilityInfoRow,
              {
                facility,
                isSelected: selectedFacilityId === facility.location_id
              },
              facility.location_id
            ))
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto relative", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: "sticky top-0 z-10 border-b border-border-ops-subtle bg-bg-ops-surface",
            style: { height: HEADER_HEIGHT, width: `${timelineWidth}px` },
            children: ticks.map((tick) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              "div",
              {
                className: "absolute top-0 flex flex-col items-center justify-center h-full border-l border-border-ops-subtle/50",
                style: { left: `${tick.x}px`, width: `${dayWidth}px` },
                children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-mono text-text-ops-muted", children: tick.label })
              },
              tick.date.toISOString()
            ))
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: { width: `${timelineWidth}px` }, children: facilities.map((facility, facilityIndex) => {
          var _a;
          return /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: "relative border-b border-border-ops-subtle/30",
              style: { height: ROW_HEIGHT },
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "div",
                  {
                    className: "absolute inset-0 cursor-pointer hover:bg-sky-500/5",
                    onClick: (e) => handleTimelineClick(e, facilityIndex),
                    onContextMenu: (e) => {
                      e.preventDefault();
                      openContextMenu(e, "CHAMBER", {
                        nodeId: facility.location_id,
                        code: facility.location_code,
                        name: facility.location_name,
                        indentLevel: 0,
                        percentComplete: 0,
                        isBaselineLocked: false,
                        hasCamPrivileges: true,
                        securityClassification: facility.security_classification,
                        isMasked: false
                      });
                    },
                    title: `Click to reserve ${facility.location_code}`
                  }
                ),
                nowX > 0 && nowX < timelineWidth && /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "div",
                  {
                    className: "absolute top-0 bottom-0 w-px bg-red-500/60 z-10 pointer-events-none",
                    style: { left: `${nowX}px` }
                  }
                ),
                facility.buffer_slots.map((slot) => {
                  const slotStart = new Date(slot.buffer_start);
                  const slotEnd = new Date(slot.buffer_end);
                  const x = dateToX(slotStart, startDate, dayWidth);
                  const width = (slotEnd.getTime() - slotStart.getTime()) / (1e3 * 60 * 60 * 24) * dayWidth;
                  return /* @__PURE__ */ jsxRuntimeExports.jsx(
                    TimelineBlock,
                    {
                      slot,
                      x,
                      width,
                      y: facilityIndex * ROW_HEIGHT,
                      isBuffer: true
                    },
                    `${slot.reservation_id}-buffer`
                  );
                }),
                facility.reservations.map((slot) => {
                  const slotStart = new Date(slot.reserved_start);
                  const slotEnd = new Date(slot.reserved_end);
                  const x = dateToX(slotStart, startDate, dayWidth);
                  const width = (slotEnd.getTime() - slotStart.getTime()) / (1e3 * 60 * 60 * 24) * dayWidth;
                  return /* @__PURE__ */ jsxRuntimeExports.jsx(
                    TimelineBlock,
                    {
                      slot,
                      x,
                      width,
                      y: facilityIndex * ROW_HEIGHT
                    },
                    slot.reservation_id
                  );
                }),
                (_a = facility.maintenance_windows) == null ? void 0 : _a.map((maint) => {
                  const maintStart = new Date(maint.downtime_start);
                  const maintEnd = new Date(maint.downtime_end);
                  const x = dateToX(maintStart, startDate, dayWidth);
                  const width = (maintEnd.getTime() - maintStart.getTime()) / (1e3 * 60 * 60 * 24) * dayWidth;
                  return /* @__PURE__ */ jsxRuntimeExports.jsx(
                    MaintenanceBlock,
                    {
                      window: maint,
                      x,
                      width,
                      y: facilityIndex * ROW_HEIGHT
                    },
                    maint.id
                  );
                })
              ]
            },
            facility.location_id
          );
        }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 px-3 py-1.5 border-t border-border-ops-subtle bg-bg-ops-surface text-[10px] text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-3 h-2 rounded-sm bg-sky-500/20 border border-sky-500/40" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Reservation" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-3 h-2 rounded-sm bg-amber-500/10 border border-amber-500/30" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Buffer Zone" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-3 h-2 rounded-sm bg-red-600/30 border border-red-600/60" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Maintenance" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-px h-3 bg-red-500/60" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Now" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ml-auto flex items-center gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "w-3 h-3" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Click empty slot to reserve" })
      ] })
    ] })
  ] });
};
function createDefaultForm(facility, suggestedStart) {
  const start = suggestedStart || /* @__PURE__ */ new Date();
  start.setHours(8, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    portfolio_node_id: "",
    reserved_start: start.toISOString().slice(0, 16).replace("T", " "),
    reserved_end: end.toISOString().slice(0, 16).replace("T", " "),
    setup_teardown_hours: (facility == null ? void 0 : facility.warmup_cooldown_hours) || 2,
    power_profile_kw: null,
    temp_min_c: null,
    temp_max_c: null,
    test_operator_user_id: ""
  };
}
const ValidationErrorList = ({ errors, label, icon }) => {
  if (!errors || errors.length === 0) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 p-2 rounded bg-red-900/20 border border-red-800/40", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 text-xs font-semibold text-red-400 mb-1", children: [
      icon || /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-3.5 h-3.5" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: label })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "text-[11px] text-red-300/80 space-y-0.5", children: errors.map((error, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-start gap-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mr-1", children: "•" }),
      error
    ] }, i)) })
  ] });
};
const GateStatus = ({ label, passed, pending = false }) => {
  if (pending) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 text-xs text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "w-3.5 h-3.5" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: label })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: clsx(
        "flex items-center gap-1.5 text-xs",
        passed ? "text-green-400" : "text-red-400"
      ),
      children: [
        passed ? /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheckBig, { className: "w-3.5 h-3.5" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-3.5 h-3.5" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: label })
      ]
    }
  );
};
const ReservationModal = ({
  open,
  onClose,
  facility,
  suggestedStart,
  onSubmit
}) => {
  var _a;
  const [form, setForm] = reactExports.useState(createDefaultForm(null, null));
  const [validationErrors, setValidationErrors] = reactExports.useState({});
  const [validationResult, setValidationResult] = reactExports.useState(null);
  const [isSubmitting, setIsSubmitting] = reactExports.useState(false);
  const [isValidating, setIsValidating] = reactExports.useState(false);
  reactExports.useEffect(() => {
    if (open) {
      setForm(createDefaultForm(facility, suggestedStart));
      setValidationErrors({});
      setValidationResult(null);
      setIsSubmitting(false);
    }
  }, [open, facility, suggestedStart]);
  const updateField = reactExports.useCallback(
    (field, value) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    []
  );
  const validateReservation = reactExports.useCallback(async () => {
    if (!facility) return;
    setIsValidating(true);
    setValidationErrors({});
    try {
      const response = await api.post(
        "/api/v1/facilities/validate",
        {
          location_node_id: facility.location_id,
          portfolio_node_id: form.portfolio_node_id,
          reserved_start: form.reserved_start,
          reserved_end: form.reserved_end,
          setup_teardown_hours: form.setup_teardown_hours,
          power_profile_kw: form.power_profile_kw,
          test_operator_user_id: form.test_operator_user_id,
          environmental_envelope: {
            temp_min_c: form.temp_min_c,
            temp_max_c: form.temp_max_c
          }
        }
      );
      const result = response.data;
      setValidationResult(result);
      if (!result.valid) {
        const errors = {};
        if (!result.capability_gate) {
          errors.capability = result.errors.filter((e, i) => i < result.errors.length / 3);
        }
        if (!result.calibration_gate) {
          errors.calibration = result.errors.filter((e, i) => i >= result.errors.length / 3 && i < 2 * result.errors.length / 3);
        }
        if (!result.buffer_gate) {
          errors.buffer = result.errors.filter((e, i) => i >= 2 * result.errors.length / 3);
        }
        if (Object.keys(errors).length === 0) {
          errors.form = result.errors;
        }
        setValidationErrors(errors);
      }
    } catch {
      const localErrors = {};
      if (facility.chamber_capabilities) {
        const caps = facility.chamber_capabilities;
        if (form.temp_min_c != null && caps.temp_min_c != null) {
          if (form.temp_min_c < caps.temp_min_c) {
            localErrors.capability = localErrors.capability || [];
            localErrors.capability.push(
              `Requested min temp (${form.temp_min_c}°C) is below chamber minimum (${caps.temp_min_c}°C).`
            );
          }
        }
        if (form.temp_max_c != null && caps.temp_max_c != null) {
          if (form.temp_max_c > caps.temp_max_c) {
            localErrors.capability = localErrors.capability || [];
            localErrors.capability.push(
              `Requested max temp (${form.temp_max_c}°C) exceeds chamber maximum (${caps.temp_max_c}°C).`
            );
          }
        }
        if (form.power_profile_kw != null && caps.max_power_kw != null) {
          if (form.power_profile_kw > caps.max_power_kw) {
            localErrors.capability = localErrors.capability || [];
            localErrors.capability.push(
              `Requested power (${form.power_profile_kw} kW) exceeds chamber limit (${caps.max_power_kw} kW).`
            );
          }
        }
      }
      if (facility.calibration_expiry_date) {
        const expiry = new Date(facility.calibration_expiry_date);
        const reservedEnd = new Date(form.reserved_end);
        if (reservedEnd > expiry) {
          localErrors.calibration = [
            `Reservation end (${form.reserved_end}) extends past calibration expiry (${facility.calibration_expiry_date}).`
          ];
        }
      }
      if (!form.portfolio_node_id) {
        localErrors.form = localErrors.form || [];
        localErrors.form.push("Testing task is required.");
      }
      if (!form.test_operator_user_id) {
        localErrors.form = localErrors.form || [];
        localErrors.form.push("Test operator is required.");
      }
      setValidationErrors(localErrors);
      setValidationResult({
        valid: Object.keys(localErrors).length === 0,
        capability_gate: !localErrors.capability,
        calibration_gate: !localErrors.calibration,
        buffer_gate: true,
        errors: Object.values(localErrors).flat(),
        buffer_start: null,
        buffer_end: null
      });
    } finally {
      setIsValidating(false);
    }
  }, [facility, form]);
  const handleSubmit = reactExports.useCallback(
    async (e) => {
      e.preventDefault();
      await validateReservation();
      const hasErrors = Object.keys(validationErrors).length > 0;
      if (hasErrors && validationResult) {
        const stillHasErrors = Object.keys(validationErrors).length > 0;
        if (stillHasErrors) return;
      }
      if (!facility) return;
      setIsSubmitting(true);
      const reservation = {
        location_node_id: facility.location_id,
        portfolio_node_id: form.portfolio_node_id,
        reserved_start: form.reserved_start,
        reserved_end: form.reserved_end,
        setup_teardown_hours: form.setup_teardown_hours,
        power_profile_kw: form.power_profile_kw,
        test_operator_user_id: form.test_operator_user_id
      };
      onSubmit(reservation);
    },
    [facility, form, validationErrors, validationResult, validateReservation, onSubmit]
  );
  const handleClose = reactExports.useCallback(() => {
    setValidationErrors({});
    setValidationResult(null);
    onClose();
  }, [onClose]);
  if (!open || !facility) return null;
  const hasAnyErrors = Object.keys(validationErrors).length > 0;
  (validationResult == null ? void 0 : validationResult.valid) === true;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60", role: "dialog", "aria-modal": "true", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "w-full max-w-lg rounded-lg shadow-2xl bg-bg-ops-surface border border-border-ops-strong overflow-hidden",
      style: { maxHeight: "90vh" },
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-border-ops-subtle bg-bg-ops-overlay", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { className: "w-5 h-5 text-sky-400" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-sm font-semibold text-text-ops-primary", children: [
              "Reserve ",
              facility.location_code
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: handleClose,
              className: "p-1 rounded hover:bg-bg-ops-base text-text-ops-muted hover:text-text-ops-primary",
              "aria-label": "Close modal",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "w-4 h-4" })
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-4 py-2 border-b border-border-ops-subtle/50 bg-bg-ops-base/50", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: facility.location_name }),
          facility.chamber_capabilities && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-1.5 mt-1.5", children: [
            facility.chamber_capabilities.temp_min_c != null && facility.chamber_capabilities.temp_max_c != null && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-900/30 text-red-400 border border-red-800/50", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Thermometer, { className: "w-3 h-3" }),
              facility.chamber_capabilities.temp_min_c,
              "°/",
              facility.chamber_capabilities.temp_max_c,
              "°C"
            ] }),
            facility.chamber_capabilities.rf_shielding_db != null && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-900/30 text-purple-400 border border-purple-800/50", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Zap, { className: "w-3 h-3" }),
              facility.chamber_capabilities.rf_shielding_db,
              " dB"
            ] }),
            facility.chamber_capabilities.max_power_kw != null && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-900/30 text-amber-400 border border-amber-800/50", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Zap, { className: "w-3 h-3" }),
              facility.chamber_capabilities.max_power_kw,
              " kW"
            ] })
          ] }),
          facility.calibration_expiry_date && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-[10px] text-text-ops-muted mt-1", children: [
            "Calibration expires: ",
            new Date(facility.calibration_expiry_date).toLocaleDateString("en-GB")
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, className: "px-4 py-3 overflow-y-auto", style: { maxHeight: "60vh" }, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-1.5 text-xs font-medium text-text-ops-primary mb-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(ClipboardList, { className: "w-3.5 h-3.5" }),
                "Testing Task"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  type: "text",
                  value: form.portfolio_node_id,
                  onChange: (e) => updateField("portfolio_node_id", e.target.value),
                  className: "w-full px-2 py-1.5 rounded text-xs font-mono bg-bg-ops-base border border-border-ops-subtle text-text-ops-primary focus:border-sky-500 focus:outline-none",
                  placeholder: "Portfolio Node UUID or code...",
                  required: true
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-1.5 text-xs font-medium text-text-ops-primary mb-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { className: "w-3.5 h-3.5" }),
                  "Start"
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    type: "datetime-local",
                    value: form.reserved_start.slice(0, 16),
                    onChange: (e) => updateField("reserved_start", e.target.value),
                    className: "w-full px-2 py-1.5 rounded text-xs font-mono bg-bg-ops-base border border-border-ops-subtle text-text-ops-primary focus:border-sky-500 focus:outline-none",
                    required: true
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs font-medium text-text-ops-primary mb-1", children: "End" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    type: "datetime-local",
                    value: form.reserved_end.slice(0, 16),
                    onChange: (e) => updateField("reserved_end", e.target.value),
                    className: "w-full px-2 py-1.5 rounded text-xs font-mono bg-bg-ops-base border border-border-ops-subtle text-text-ops-primary focus:border-sky-500 focus:outline-none",
                    required: true
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-1.5 text-xs font-medium text-text-ops-primary mb-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Thermometer, { className: "w-3.5 h-3.5" }),
                  "Min Temp (°C)"
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    type: "number",
                    step: "0.1",
                    value: form.temp_min_c ?? "",
                    onChange: (e) => updateField("temp_min_c", e.target.value ? parseFloat(e.target.value) : null),
                    className: "w-full px-2 py-1.5 rounded text-xs font-mono bg-bg-ops-base border border-border-ops-subtle text-text-ops-primary focus:border-sky-500 focus:outline-none",
                    placeholder: "Optional"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs font-medium text-text-ops-primary mb-1", children: "Max Temp (°C)" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    type: "number",
                    step: "0.1",
                    value: form.temp_max_c ?? "",
                    onChange: (e) => updateField("temp_max_c", e.target.value ? parseFloat(e.target.value) : null),
                    className: "w-full px-2 py-1.5 rounded text-xs font-mono bg-bg-ops-base border border-border-ops-subtle text-text-ops-primary focus:border-sky-500 focus:outline-none",
                    placeholder: "Optional"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-1.5 text-xs font-medium text-text-ops-primary mb-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Zap, { className: "w-3.5 h-3.5" }),
                "Power Draw (kW)"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  type: "number",
                  step: "0.1",
                  value: form.power_profile_kw ?? "",
                  onChange: (e) => updateField("power_profile_kw", e.target.value ? parseFloat(e.target.value) : null),
                  className: "w-full px-2 py-1.5 rounded text-xs font-mono bg-bg-ops-base border border-border-ops-subtle text-text-ops-primary focus:border-sky-500 focus:outline-none",
                  placeholder: "Optional"
                }
              ),
              ((_a = facility.chamber_capabilities) == null ? void 0 : _a.max_power_kw) != null && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-[10px] text-text-ops-muted mt-0.5", children: [
                "Chamber limit: ",
                facility.chamber_capabilities.max_power_kw,
                " kW"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-1.5 text-xs font-medium text-text-ops-primary mb-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(User, { className: "w-3.5 h-3.5" }),
                "Test Operator"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  type: "text",
                  value: form.test_operator_user_id,
                  onChange: (e) => updateField("test_operator_user_id", e.target.value),
                  className: "w-full px-2 py-1.5 rounded text-xs font-mono bg-bg-ops-base border border-border-ops-subtle text-text-ops-primary focus:border-sky-500 focus:outline-none",
                  placeholder: "User UUID...",
                  required: true
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-1.5 text-xs font-medium text-text-ops-primary mb-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "w-3.5 h-3.5" }),
                "Setup/Teardown (hours)"
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  type: "number",
                  step: "0.5",
                  min: "0",
                  value: form.setup_teardown_hours,
                  onChange: (e) => updateField("setup_teardown_hours", parseFloat(e.target.value) || 0),
                  className: "w-full px-2 py-1.5 rounded text-xs font-mono bg-bg-ops-base border border-border-ops-subtle text-text-ops-primary focus:border-sky-500 focus:outline-none"
                }
              )
            ] })
          ] }),
          validationResult && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 p-3 rounded bg-bg-ops-base border border-border-ops-subtle", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xs font-semibold text-text-ops-primary mb-2", children: "Validation Gates" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                GateStatus,
                {
                  label: "Capability Envelope",
                  passed: validationResult.capability_gate,
                  pending: isValidating
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                GateStatus,
                {
                  label: "Calibration Window",
                  passed: validationResult.calibration_gate,
                  pending: isValidating
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                GateStatus,
                {
                  label: "Buffer Availability",
                  passed: validationResult.buffer_gate,
                  pending: isValidating
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              ValidationErrorList,
              {
                errors: validationErrors.capability,
                label: "Capability Gate Failed",
                icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Thermometer, { className: "w-3.5 h-3.5" })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              ValidationErrorList,
              {
                errors: validationErrors.calibration,
                label: "Calibration Gate Failed",
                icon: /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-3.5 h-3.5" })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              ValidationErrorList,
              {
                errors: validationErrors.buffer,
                label: "Buffer Gate Failed",
                icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "w-3.5 h-3.5" })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              ValidationErrorList,
              {
                errors: validationErrors.form,
                label: "Form Errors"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-t border-border-ops-subtle bg-bg-ops-overlay", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: handleClose,
              className: "px-3 py-1.5 rounded text-xs font-medium text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-base transition-colors",
              children: "Cancel"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: validateReservation,
                disabled: isValidating,
                className: "px-3 py-1.5 rounded text-xs font-medium text-amber-400 hover:bg-amber-900/20 border border-amber-800/40 transition-colors disabled:opacity-50",
                children: isValidating ? "Validating..." : "Validate"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "submit",
                form: "reservation-form",
                onClick: handleSubmit,
                disabled: isSubmitting || hasAnyErrors,
                className: clsx(
                  "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                  isSubmitting || hasAnyErrors ? "bg-sky-900/30 text-sky-400/50 cursor-not-allowed" : "bg-sky-600 text-white hover:bg-sky-500"
                ),
                children: isSubmitting ? "Submitting..." : "Create Reservation"
              }
            )
          ] })
        ] })
      ]
    }
  ) });
};
const FacilitySchedulingView = () => {
  const [facilities, setFacilities] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [error, setError] = reactExports.useState(null);
  const [startDate, setStartDate] = reactExports.useState(() => {
    const start = /* @__PURE__ */ new Date();
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    return start;
  });
  const [endDate, setEndDate] = reactExports.useState(() => {
    const end = /* @__PURE__ */ new Date();
    end.setDate(end.getDate() + 30);
    end.setHours(23, 59, 59, 999);
    return end;
  });
  const [modalOpen, setModalOpen] = reactExports.useState(false);
  const [selectedFacility, setSelectedFacility] = reactExports.useState(null);
  const [suggestedStart, setSuggestedStart] = reactExports.useState(null);
  const [filters, setFilters] = reactExports.useState({
    scifOnly: false,
    calibrationExpired: false,
    searchQuery: ""
  });
  const fetchFacilities = reactExports.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get("/api/v1/wbs/nodes?tree_type=LBS");
      if (response.status !== 200) return;
      const nodes = response.data.items || [];
      const facilityNodes = nodes.filter(
        (node) => node.tier === "FACILITY" || node.is_scif_or_tempest === true
      );
      const timelines = [];
      for (const node of facilityNodes) {
        try {
          const timelineResp = await api.get(
            `/api/v1/facilities/locations/${node.id}/timeline`,
            {
              params: {
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString()
              }
            }
          );
          if (timelineResp.status === 200) {
            timelines.push(timelineResp.data);
          }
        } catch {
        }
      }
      setFacilities(timelines);
    } catch {
      setError("Failed to load facility data. Ensure the backend is running and LBS nodes exist.");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);
  reactExports.useEffect(() => {
    fetchFacilities();
  }, [fetchFacilities]);
  const filteredFacilities = reactExports.useMemo(() => {
    return facilities.filter((facility) => {
      var _a;
      if (filters.scifOnly) {
        const isScif = ((_a = facility.chamber_capabilities) == null ? void 0 : _a.rf_shielding_db) != null;
        if (!isScif) return false;
      }
      if (filters.calibrationExpired) {
        if (!facility.calibration_expiry_date) return false;
        const expiry = new Date(facility.calibration_expiry_date);
        if (expiry >= /* @__PURE__ */ new Date()) return false;
      }
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const matchesCode = facility.location_code.toLowerCase().includes(query);
        const matchesName = facility.location_name.toLowerCase().includes(query);
        if (!matchesCode && !matchesName) return false;
      }
      return true;
    });
  }, [facilities, filters]);
  const handleReserveClick = reactExports.useCallback((locationId, suggestedStart2) => {
    const facility = facilities.find((f) => f.location_id === locationId);
    if (facility) {
      setSelectedFacility(facility);
      setSuggestedStart(suggestedStart2);
      setModalOpen(true);
    }
  }, [facilities]);
  const handleReservationSubmit = reactExports.useCallback(
    async (reservation) => {
      try {
        await api.post("/api/v1/facilities/reservations", reservation);
        setModalOpen(false);
        await fetchFacilities();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create reservation";
        console.error("Reservation error:", message);
        setError(message);
      }
    },
    [fetchFacilities]
  );
  reactExports.useCallback(
    (direction) => {
      const days = 30;
      const sign = direction === "prev" ? -days : days;
      setStartDate((prev) => {
        const newStart = new Date(prev.getTime() + sign * 24 * 60 * 60 * 1e3);
        return newStart;
      });
      setEndDate((prev) => {
        const newEnd = new Date(prev.getTime() + sign * 24 * 60 * 60 * 1e3);
        return newEnd;
      });
    },
    []
  );
  const summaryStats = reactExports.useMemo(() => {
    const totalReservations = facilities.reduce(
      (sum, f) => sum + f.reservations.length,
      0
    );
    const expiredCalibrations = facilities.filter((f) => {
      if (!f.calibration_expiry_date) return false;
      return new Date(f.calibration_expiry_date) < /* @__PURE__ */ new Date();
    }).length;
    const scifCount = facilities.filter(
      (f) => {
        var _a;
        return ((_a = f.chamber_capabilities) == null ? void 0 : _a.rf_shielding_db) != null;
      }
    ).length;
    return { totalReservations, expiredCalibrations, scifCount };
  }, [facilities]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full bg-bg-ops-base", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-4 py-2 border-b border-border-ops-subtle bg-bg-ops-surface", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { className: "w-5 h-5 text-sky-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-sm font-semibold text-text-ops-primary", children: "Facility Scheduling" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted font-mono", children: [
          filteredFacilities.length,
          " facilities"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        summaryStats.totalReservations > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-sky-900/30 text-sky-400 border border-sky-800/50", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { className: "w-3 h-3" }),
          summaryStats.totalReservations,
          " active"
        ] }),
        summaryStats.expiredCalibrations > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-red-900/30 text-red-400 border border-red-800/50", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-3 h-3" }),
          summaryStats.expiredCalibrations,
          " cal expired"
        ] }),
        summaryStats.scifCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-purple-900/30 text-purple-400 border border-purple-800/50", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheckBig, { className: "w-3 h-3" }),
          summaryStats.scifCount,
          " SCIF"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: fetchFacilities,
            className: clsx(
              "p-1.5 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors",
              loading && "animate-spin"
            ),
            title: "Refresh facility data",
            disabled: loading,
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-4 h-4" })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 px-4 py-1.5 border-b border-border-ops-subtle/50 bg-bg-ops-surface/50", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Filter, { className: "w-3.5 h-3.5 text-text-ops-muted" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => setFilters((f) => ({ ...f, scifOnly: !f.scifOnly })),
          className: clsx(
            "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
            filters.scifOnly ? "bg-purple-900/30 text-purple-400 border border-purple-800/50" : "text-text-ops-muted hover:text-text-ops-primary border border-transparent"
          ),
          children: "SCIF Only"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => setFilters((f) => ({ ...f, calibrationExpired: !f.calibrationExpired })),
          className: clsx(
            "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
            filters.calibrationExpired ? "bg-red-900/30 text-red-400 border border-red-800/50" : "text-text-ops-muted hover:text-text-ops-primary border border-transparent"
          ),
          children: "Cal Expired"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          type: "text",
          value: filters.searchQuery,
          onChange: (e) => setFilters((f) => ({ ...f, searchQuery: e.target.value })),
          className: "px-2 py-0.5 rounded text-[10px] font-mono bg-bg-ops-base border border-border-ops-subtle text-text-ops-primary focus:border-sky-500 focus:outline-none w-48",
          placeholder: "Search by code or name..."
        }
      )
    ] }),
    loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-8 h-8 animate-spin" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "Loading facility timelines..." })
    ] }) }) : error ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-8 h-8 text-red-400" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-red-400", children: error }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: fetchFacilities,
          className: "px-3 py-1.5 rounded text-xs font-medium text-sky-400 hover:bg-sky-900/20 border border-sky-800/40 transition-colors",
          children: "Retry"
        }
      )
    ] }) }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
      ChamberGanttTimeline,
      {
        facilities: filteredFacilities,
        startDate,
        endDate,
        onReserveClick: handleReserveClick
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ReservationModal,
      {
        open: modalOpen,
        onClose: () => setModalOpen(false),
        facility: selectedFacility,
        suggestedStart,
        onSubmit: handleReservationSubmit
      }
    )
  ] });
};
export {
  FacilitySchedulingView as default
};
//# sourceMappingURL=FacilitySchedulingView-CK5RDsR9.js.map
