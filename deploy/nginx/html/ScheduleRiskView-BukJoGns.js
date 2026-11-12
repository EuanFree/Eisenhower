import { j as jsxRuntimeExports, B as BarChart3, c as clsx, x as LoaderCircle, y as Play, T as TriangleAlert, d as CircleCheck, r as reactExports, z as TrendingUp, D as Shield, X, F as Filter, b as api, I as Info } from "./index-DwHrkWl2.js";
const ITERATION_OPTIONS = [
  { value: 1e3, label: "1,000", description: "Quick" },
  { value: 2e3, label: "2,000", description: "Standard" },
  { value: 5e3, label: "5,000", description: "Detailed" },
  { value: 1e4, label: "10,000", description: "High precision" }
];
const MonteCarloControls = ({
  state,
  projectId,
  onIterationsChange,
  onDistributionChange,
  onRun,
  onReset
}) => {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4 p-4 bg-bg-ops-surface border border-border-ops-subtle rounded-lg", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(BarChart3, { className: "w-5 h-5 text-blue-400" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-text-ops-primary", children: "Monte Carlo Simulation" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-text-ops-muted uppercase tracking-wider mb-2", children: "Iterations" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-2", children: ITERATION_OPTIONS.map((option) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: () => onIterationsChange(option.value),
          disabled: state.isRunning,
          className: clsx(
            "flex flex-col items-center gap-0.5 px-4 py-2 rounded-md border text-sm font-mono transition-colors",
            state.iterations === option.value ? "bg-blue-600/20 border-blue-500/50 text-blue-400" : "bg-bg-ops-overlay border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong",
            state.isRunning && "opacity-50 cursor-not-allowed"
          ),
          title: option.description,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold", children: option.label }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-text-ops-muted", children: option.description })
          ]
        },
        option.value
      )) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-text-ops-muted uppercase tracking-wider mb-2", children: "Distribution Type" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-2", children: ["BETA_PERT", "TRIANGULAR"].map((dist) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => onDistributionChange(dist),
          disabled: state.isRunning,
          className: clsx(
            "flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors",
            state.distributionType === dist ? "bg-blue-600/20 border-blue-500/50 text-blue-400" : "bg-bg-ops-overlay border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong",
            state.isRunning && "opacity-50 cursor-not-allowed"
          ),
          children: dist === "BETA_PERT" ? "Beta-PERT" : "Triangular"
        },
        dist
      )) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1.5 text-xs text-text-ops-muted", children: state.distributionType === "BETA_PERT" ? "Beta-PERT weights toward the most-likely estimate, producing a smoother distribution." : "Triangular distribution applies uniform weighting between optimistic and pessimistic bounds." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: onRun,
          disabled: state.isRunning,
          className: clsx(
            "flex items-center gap-2 px-6 py-2.5 rounded-md font-medium text-sm transition-colors",
            state.isRunning ? "bg-gray-600 text-gray-300 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-500 text-white"
          ),
          children: state.isRunning ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-4 h-4 animate-spin" }),
            "Running Simulation..."
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Play, { className: "w-4 h-4" }),
            "Run Monte Carlo Simulation"
          ] })
        }
      ),
      state.isRunning && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted", children: [
        state.progress,
        "% complete"
      ] })
    ] }),
    state.isRunning && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full h-2 bg-bg-ops-overlay rounded-full overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "h-full bg-blue-500 rounded-full transition-all duration-300",
        style: { width: `${state.progress}%` },
        role: "progressbar",
        "aria-valuenow": state.progress,
        "aria-valuemin": 0,
        "aria-valuemax": 100
      }
    ) }),
    state.error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-400", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4 mt-0.5 flex-shrink-0" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-medium", children: "Simulation Failed" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-red-300/80 mt-1", children: state.error }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: onReset,
            className: "mt-2 text-xs underline hover:text-red-300",
            children: "Reset and try again"
          }
        )
      ] })
    ] }),
    state.result && !state.isRunning && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-3 rounded-md bg-green-500/10 border border-green-500/30", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-4 h-4 text-green-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium text-green-400", children: "Simulation Complete" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted ml-auto", children: [
          state.result.iterations.toLocaleString(),
          " iterations"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-text-ops-muted uppercase tracking-wider", children: "P50 (Median)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-mono text-text-ops-primary", children: state.result.percentiles.P50 || "N/A" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-text-ops-muted uppercase tracking-wider", children: "P80 (Defence Baseline)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-mono text-amber-400", children: state.result.percentiles.P80 || "N/A" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-text-ops-muted uppercase tracking-wider", children: "P90 (Guarantee)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-mono text-red-400", children: state.result.percentiles.P90 || "N/A" })
        ] })
      ] })
    ] })
  ] });
};
const MARGIN = { top: 30, right: 30, bottom: 50, left: 60 };
const CHART_WIDTH = 700;
const CHART_HEIGHT = 350;
const INNER_WIDTH = CHART_WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
const parseDate = (iso) => new Date(iso);
const formatDate = (d) => {
  const day = d.getDate().toString().padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};
const CumulativeProbabilityCurve = ({
  result,
  cpmFinishDate
}) => {
  const [hoverPoint, setHoverPoint] = reactExports.useState(null);
  const { points, xScale, yScale, xDomain, yDomain, percentileMarkers } = reactExports.useMemo(() => {
    const distPoints = result.distribution_points.map((p) => ({
      percentile: p.percentile,
      date: parseDate(p.date),
      dateStr: p.date
    })).sort((a, b) => a.date.getTime() - b.date.getTime());
    if (distPoints.length === 0) {
      return {
        points: [],
        xScale: (d) => 0,
        yScale: (p) => 0,
        xDomain: [/* @__PURE__ */ new Date(), /* @__PURE__ */ new Date()],
        yDomain: [0, 100],
        percentileMarkers: []
      };
    }
    const minDate = distPoints[0].date;
    const maxDate = distPoints[distPoints.length - 1].date;
    const xDomain2 = [minDate, maxDate];
    const yDomain2 = [0, 100];
    const xScale2 = (d) => {
      const range = maxDate.getTime() - minDate.getTime();
      if (range === 0) return MARGIN.left + INNER_WIDTH / 2;
      return MARGIN.left + (d.getTime() - minDate.getTime()) / range * INNER_WIDTH;
    };
    const yScale2 = (p) => {
      return MARGIN.top + INNER_HEIGHT - p / 100 * INNER_HEIGHT;
    };
    const points2 = distPoints.map((p) => ({
      x: xScale2(p.date),
      y: yScale2(p.percentile),
      percentile: p.percentile,
      date: p.dateStr
    }));
    const markers = [];
    const percentileColors = {
      P50: "#34D399",
      // green
      P80: "#FBBF24",
      // amber
      P90: "#F87171"
      // red
    };
    for (const [label, color] of Object.entries(percentileColors)) {
      const dateStr = result.percentiles[label];
      if (dateStr) {
        const d = parseDate(dateStr);
        markers.push({ label, date: d, color, x: xScale2(d) });
      }
    }
    return { points: points2, xScale: xScale2, yScale: yScale2, xDomain: xDomain2, yDomain: yDomain2, percentileMarkers: markers };
  }, [result]);
  const curvePath = reactExports.useMemo(() => {
    if (points.length < 2) return "";
    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x},${points[i].y}`;
    }
    return d;
  }, [points]);
  const areaPath = reactExports.useMemo(() => {
    if (points.length < 2) return "";
    const bottomY = yScale(0);
    let d = `M ${points[0].x},${bottomY} L ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${points[i].x},${points[i].y}`;
    }
    d += ` L ${points[points.length - 1].x},${bottomY} Z`;
    return d;
  }, [points, yScale]);
  const cpmMarker = reactExports.useMemo(() => {
    if (!cpmFinishDate) return null;
    const d = parseDate(cpmFinishDate);
    return { date: d, x: xScale(d) };
  }, [cpmFinishDate, xScale]);
  const xTicks = reactExports.useMemo(() => {
    if (xDomain[0].getTime() === xDomain[1].getTime()) return [];
    const tickCount = 6;
    const ticks = [];
    for (let i = 0; i <= tickCount; i++) {
      const t = xDomain[0].getTime() + i / tickCount * (xDomain[1].getTime() - xDomain[0].getTime());
      ticks.push(new Date(t));
    }
    return ticks;
  }, [xDomain]);
  const yTicks = [0, 20, 40, 60, 80, 100];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingUp, { className: "w-5 h-5 text-blue-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-text-ops-primary", children: "Cumulative Probability Distribution" })
      ] }),
      hoverPoint && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-mono text-text-ops-muted", children: [
        hoverPoint.percentile.toFixed(1),
        "% → ",
        hoverPoint.date
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "svg",
      {
        width: CHART_WIDTH,
        height: CHART_HEIGHT,
        viewBox: `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`,
        className: "min-w-[600px]",
        role: "img",
        "aria-label": "Cumulative probability distribution S-curve chart",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "rect",
            {
              x: MARGIN.left,
              y: MARGIN.top,
              width: INNER_WIDTH,
              height: INNER_HEIGHT,
              fill: "rgba(30, 41, 59, 0.5)",
              rx: "4"
            }
          ),
          yTicks.map((tick) => /* @__PURE__ */ jsxRuntimeExports.jsx(
            "line",
            {
              x1: MARGIN.left,
              y1: yScale(tick),
              x2: MARGIN.left + INNER_WIDTH,
              y2: yScale(tick),
              stroke: "rgba(51, 65, 85, 0.5)",
              strokeWidth: "1",
              strokeDasharray: "4,4"
            },
            `y-${tick}`
          )),
          areaPath && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "path",
            {
              d: areaPath,
              fill: "url(#areaGradient)",
              opacity: "0.3"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("defs", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("linearGradient", { id: "areaGradient", x1: "0", y1: "0", x2: "0", y2: "1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "0%", stopColor: "#3B82F6", stopOpacity: "0.6" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("stop", { offset: "100%", stopColor: "#3B82F6", stopOpacity: "0.05" })
          ] }) }),
          curvePath && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "path",
            {
              d: curvePath,
              fill: "none",
              stroke: "#3B82F6",
              strokeWidth: "2.5",
              strokeLinejoin: "round"
            }
          ),
          points.map((point, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
            "circle",
            {
              cx: point.x,
              cy: point.y,
              r: "12",
              fill: "transparent",
              onMouseEnter: () => setHoverPoint(point),
              onMouseLeave: () => setHoverPoint(null)
            },
            i
          )),
          hoverPoint && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "line",
              {
                x1: hoverPoint.x,
                y1: MARGIN.top,
                x2: hoverPoint.x,
                y2: MARGIN.top + INNER_HEIGHT,
                stroke: "rgba(255, 255, 255, 0.3)",
                strokeWidth: "1",
                strokeDasharray: "4,4"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "circle",
              {
                cx: hoverPoint.x,
                cy: hoverPoint.y,
                r: "4",
                fill: "#3B82F6",
                stroke: "white",
                strokeWidth: "2"
              }
            )
          ] }),
          percentileMarkers.map((marker) => /* @__PURE__ */ jsxRuntimeExports.jsxs("g", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "line",
              {
                x1: marker.x,
                y1: MARGIN.top,
                x2: marker.x,
                y2: MARGIN.top + INNER_HEIGHT,
                stroke: marker.color,
                strokeWidth: "2",
                strokeDasharray: "6,4"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "rect",
              {
                x: marker.x - 20,
                y: MARGIN.top - 20,
                width: "40",
                height: "16",
                rx: "3",
                fill: marker.color,
                opacity: "0.2"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "text",
              {
                x: marker.x,
                y: MARGIN.top - 8,
                textAnchor: "middle",
                fill: marker.color,
                fontSize: "10",
                fontWeight: "bold",
                children: marker.label
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "text",
              {
                x: marker.x,
                y: MARGIN.top + INNER_HEIGHT + 14,
                textAnchor: "middle",
                fill: marker.color,
                fontSize: "9",
                fontFamily: "monospace",
                children: formatDate(marker.date)
              }
            )
          ] }, marker.label)),
          cpmMarker && /* @__PURE__ */ jsxRuntimeExports.jsxs("g", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "line",
              {
                x1: cpmMarker.x,
                y1: MARGIN.top,
                x2: cpmMarker.x,
                y2: MARGIN.top + INNER_HEIGHT,
                stroke: "#94A3B8",
                strokeWidth: "1.5",
                strokeDasharray: "2,4"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "text",
              {
                x: cpmMarker.x,
                y: MARGIN.top - 24,
                textAnchor: "middle",
                fill: "#94A3B8",
                fontSize: "9",
                fontFamily: "monospace",
                children: [
                  "CPM: ",
                  formatDate(cpmMarker.date)
                ]
              }
            )
          ] }),
          xTicks.map((tick, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
            "text",
            {
              x: xScale(tick),
              y: MARGIN.top + INNER_HEIGHT + 30,
              textAnchor: "middle",
              fill: "#94A3B8",
              fontSize: "10",
              fontFamily: "monospace",
              children: formatDate(tick)
            },
            `x-${i}`
          )),
          yTicks.map((tick) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "text",
            {
              x: MARGIN.left - 8,
              y: yScale(tick) + 4,
              textAnchor: "end",
              fill: "#94A3B8",
              fontSize: "10",
              fontFamily: "monospace",
              children: [
                tick,
                "%"
              ]
            },
            `y-label-${tick}`
          )),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "text",
            {
              x: MARGIN.left + INNER_WIDTH / 2,
              y: CHART_HEIGHT - 5,
              textAnchor: "middle",
              fill: "#94A3B8",
              fontSize: "11",
              children: "Completion Date"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "text",
            {
              x: 15,
              y: MARGIN.top + INNER_HEIGHT / 2,
              textAnchor: "middle",
              fill: "#94A3B8",
              fontSize: "11",
              transform: `rotate(-90, 15, ${MARGIN.top + INNER_HEIGHT / 2})`,
              children: "Cumulative Probability"
            }
          )
        ]
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 flex-wrap text-xs", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-3 h-0.5 bg-blue-500" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "S-Curve" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-3 h-0.5 bg-green-400", style: { borderTop: "2px dashed #34D399" } }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "P50 (Median)" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-3 h-0.5 bg-amber-400", style: { borderTop: "2px dashed #FBBF24" } }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "P80 (Defence Baseline)" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-3 h-0.5 bg-red-400", style: { borderTop: "2px dashed #F87171" } }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "P90 (Guarantee)" })
      ] }),
      cpmFinishDate && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-3 h-0.5", style: { borderTop: "1.5px dashed #94A3B8" } }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Deterministic CPM" })
      ] })
    ] })
  ] });
};
const BAR_HEIGHT = 28;
const BAR_GAP = 4;
const LABEL_WIDTH = 160;
const VALUE_WIDTH = 60;
const CHART_PADDING = 20;
const getBarColor = (index) => {
  if (index >= 0.8) return "#F87171";
  if (index >= 0.6) return "#FB923C";
  if (index >= 0.4) return "#FBBF24";
  if (index >= 0.2) return "#A3E635";
  return "#34D399";
};
const getBarBgColor = (index) => {
  if (index >= 0.8) return "rgba(248, 113, 113, 0.15)";
  if (index >= 0.6) return "rgba(251, 146, 60, 0.15)";
  if (index >= 0.4) return "rgba(251, 191, 36, 0.15)";
  if (index >= 0.2) return "rgba(163, 230, 53, 0.15)";
  return "rgba(52, 211, 153, 0.15)";
};
const TornadoSensitivityChart = ({
  criticalityIndices,
  maxBars = 20
}) => {
  const [hoveredIndex, setHoveredIndex] = reactExports.useState(null);
  const sortedData = reactExports.useMemo(() => {
    return [...criticalityIndices].sort((a, b) => b.criticality_index - a.criticality_index).slice(0, maxBars);
  }, [criticalityIndices, maxBars]);
  const chartWidth = 600;
  const barAreaWidth = chartWidth - LABEL_WIDTH - VALUE_WIDTH - CHART_PADDING * 2;
  const chartHeight = sortedData.length * (BAR_HEIGHT + BAR_GAP) + CHART_PADDING * 2;
  if (sortedData.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-12 text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(BarChart3, { className: "w-8 h-8 mb-3 text-text-ops-muted/50" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-center", children: "No criticality data available. Run a Monte Carlo simulation first." })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(BarChart3, { className: "w-5 h-5 text-blue-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-text-ops-primary", children: "Tornado Sensitivity Chart" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted", children: [
          "(",
          sortedData.length,
          " activities)"
        ] })
      ] }),
      hoveredIndex !== null && sortedData[hoveredIndex] && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-mono text-text-ops-muted", children: [
        sortedData[hoveredIndex].name,
        " — ",
        sortedData[hoveredIndex].criticality_index.toFixed(1),
        "%"
      ] })
    ] }),
    sortedData.some((d) => d.criticality_index >= 0.8) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2 p-2 rounded-md bg-red-500/10 border border-red-500/30", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-red-300/80", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-red-400", children: "Primary risk drivers detected." }),
        " ",
        "Activities with ≥80% criticality index are the main drivers of schedule uncertainty."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "min-w-[500px]",
        style: { height: Math.min(chartHeight, 500) },
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          "svg",
          {
            width: chartWidth,
            height: Math.min(chartHeight, 500),
            viewBox: `0 0 ${chartWidth} ${Math.min(chartHeight, 500)}`,
            role: "img",
            "aria-label": "Tornado sensitivity chart ranking activities by criticality index",
            children: sortedData.map((item, i) => {
              const y = CHART_PADDING + i * (BAR_HEIGHT + BAR_GAP);
              const barWidth = item.criticality_index * 100 / 100 * barAreaWidth;
              const color = getBarColor(item.criticality_index);
              const isHovered = hoveredIndex === i;
              return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "g",
                {
                  onMouseEnter: () => setHoveredIndex(i),
                  onMouseLeave: () => setHoveredIndex(null),
                  className: "cursor-pointer",
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "rect",
                      {
                        x: LABEL_WIDTH + CHART_PADDING,
                        y,
                        width: barAreaWidth,
                        height: BAR_HEIGHT,
                        rx: "3",
                        fill: getBarBgColor(item.criticality_index),
                        opacity: isHovered ? 0.8 : 0.5
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "rect",
                      {
                        x: LABEL_WIDTH + CHART_PADDING,
                        y,
                        width: Math.max(barWidth, 2),
                        height: BAR_HEIGHT,
                        rx: "3",
                        fill: color,
                        opacity: isHovered ? 1 : 0.8
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "text",
                      {
                        x: LABEL_WIDTH / 2,
                        y: y + BAR_HEIGHT / 2 + 4,
                        textAnchor: "middle",
                        fill: "#F8FAFC",
                        fontSize: "11",
                        fontFamily: "monospace",
                        children: item.code.length > 12 ? `...${item.code.slice(-12)}` : item.code
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs(
                      "text",
                      {
                        x: LABEL_WIDTH + CHART_PADDING + barAreaWidth + 8,
                        y: y + BAR_HEIGHT / 2 + 4,
                        textAnchor: "start",
                        fill: color,
                        fontSize: "11",
                        fontFamily: "monospace",
                        fontWeight: "bold",
                        children: [
                          (item.criticality_index * 100).toFixed(0),
                          "%"
                        ]
                      }
                    ),
                    isHovered && /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "rect",
                      {
                        x: 0,
                        y: y - 2,
                        width: chartWidth,
                        height: BAR_HEIGHT + 4,
                        rx: "4",
                        fill: "rgba(255, 255, 255, 0.05)"
                      }
                    )
                  ]
                },
                item.node_id
              );
            })
          }
        )
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 flex-wrap text-xs", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Criticality:" }),
      [
        { label: "≥80% Primary", color: "#F87171" },
        { label: "60-79% High", color: "#FB923C" },
        { label: "40-59% Medium", color: "#FBBF24" },
        { label: "20-39% Low", color: "#A3E635" },
        { label: "<20% Minimal", color: "#34D399" }
      ].map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-3 h-3 rounded", style: { backgroundColor: item.color } }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: item.label })
      ] }, item.label))
    ] })
  ] });
};
const ZONE_CONFIG = {
  low: {
    label: "Low",
    bgClass: "bg-green-500/10",
    borderClass: "border-green-500/30",
    textClass: "text-green-400",
    icon: CircleCheck
  },
  medium: {
    label: "Medium",
    bgClass: "bg-yellow-500/10",
    borderClass: "border-yellow-500/30",
    textClass: "text-yellow-400",
    icon: TriangleAlert
  },
  high: {
    label: "High",
    bgClass: "bg-orange-500/10",
    borderClass: "border-orange-500/30",
    textClass: "text-orange-400",
    icon: TriangleAlert
  },
  extreme: {
    label: "Extreme",
    bgClass: "bg-red-500/10",
    borderClass: "border-red-500/30",
    textClass: "text-red-400",
    icon: TriangleAlert
  }
};
const getZone = (score) => {
  if (score >= 15) return "extreme";
  if (score >= 10) return "high";
  if (score >= 5) return "medium";
  return "low";
};
const STATUS_CONFIG = {
  OPEN: { color: "text-blue-400", label: "Open" },
  MITIGATING: { color: "text-amber-400", label: "Mitigating" },
  CLOSED: { color: "text-green-400", label: "Closed" },
  ACCEPTED: { color: "text-gray-400", label: "Accepted" }
};
const RiskMatrixGrid = ({
  risks = [],
  onCellClick
}) => {
  const [activeFilters, setActiveFilters] = reactExports.useState({
    likelihood: null,
    consequence: null,
    status: null
  });
  const grid = reactExports.useMemo(() => {
    const matrix = [];
    for (let likelihood = 5; likelihood >= 1; likelihood--) {
      const row = [];
      for (let consequence = 1; consequence <= 5; consequence++) {
        const score = likelihood * consequence;
        const matchingRisks = risks.filter(
          (r) => r.likelihood === likelihood && r.consequence === consequence
        );
        row.push({
          likelihood,
          consequence,
          score,
          zone: getZone(score),
          count: matchingRisks.length,
          risks: matchingRisks
        });
      }
      matrix.push(row);
    }
    return matrix;
  }, [risks]);
  const filteredRisks = reactExports.useMemo(() => {
    let filtered = [...risks];
    if (activeFilters.likelihood !== null) {
      filtered = filtered.filter((r) => r.likelihood === activeFilters.likelihood);
    }
    if (activeFilters.consequence !== null) {
      filtered = filtered.filter((r) => r.consequence === activeFilters.consequence);
    }
    if (activeFilters.status !== null) {
      filtered = filtered.filter((r) => r.status === activeFilters.status);
    }
    return filtered.sort((a, b) => b.score - a.score);
  }, [risks, activeFilters]);
  const handleCellClick = (likelihood, consequence) => {
    if (activeFilters.likelihood === likelihood && activeFilters.consequence === consequence) {
      const newFilters = { ...activeFilters, likelihood: null, consequence: null };
      setActiveFilters(newFilters);
      onCellClick == null ? void 0 : onCellClick(newFilters);
    } else {
      const newFilters = { ...activeFilters, likelihood, consequence };
      setActiveFilters(newFilters);
      onCellClick == null ? void 0 : onCellClick(newFilters);
    }
  };
  const clearFilters = () => {
    const newFilters = { likelihood: null, consequence: null, status: null };
    setActiveFilters(newFilters);
    onCellClick == null ? void 0 : onCellClick(newFilters);
  };
  const zoneCounts = reactExports.useMemo(() => {
    const counts = { low: 0, medium: 0, high: 0, extreme: 0 };
    risks.forEach((r) => {
      const zone = getZone(r.score);
      counts[zone]++;
    });
    return counts;
  }, [risks]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-5 h-5 text-blue-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-text-ops-primary", children: "Risk Matrix" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted", children: [
          "(",
          risks.length,
          " total risks)"
        ] })
      ] }),
      (activeFilters.likelihood !== null || activeFilters.status !== null) && /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: clearFilters,
          className: "flex items-center gap-1 px-2 py-1 rounded-md text-xs text-blue-400 bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 transition-colors",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "w-3 h-3" }),
            "Clear Filters"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-3", children: ["low", "medium", "high", "extreme"].map((zone) => {
      const config = ZONE_CONFIG[zone];
      const Icon = config.icon;
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: clsx(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs",
            config.bgClass,
            config.borderClass,
            config.textClass
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: "w-3.5 h-3.5" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium", children: config.label }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono opacity-70", children: zoneCounts[zone] })
          ]
        },
        zone
      );
    }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col justify-between py-0 px-1", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-text-ops-muted rotate-[-90deg] whitespace-nowrap", style: { writingMode: "vertical-rl" }, children: "Likelihood →" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-0.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-0.5 ml-10", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-16 h-6" }),
          [1, 2, 3, 4, 5].map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-text-ops-muted", children: c }) }, c))
        ] }),
        grid.map((row, rowIdx) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-0.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-10 text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-text-ops-muted", children: row[0].likelihood }) }),
          row.map((cell) => {
            const config = ZONE_CONFIG[cell.zone];
            const isActive = activeFilters.likelihood === cell.likelihood && activeFilters.consequence === cell.consequence;
            return /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                type: "button",
                onClick: () => handleCellClick(cell.likelihood, cell.consequence),
                className: clsx(
                  "flex-1 h-12 rounded border text-xs font-mono transition-all relative",
                  config.bgClass,
                  config.borderClass,
                  isActive && "ring-2 ring-blue-500 ring-offset-1 ring-offset-bg-ops-base",
                  cell.count > 0 && "cursor-pointer hover:opacity-80",
                  cell.count === 0 && "cursor-default opacity-50"
                ),
                title: `Likelihood: ${cell.likelihood}, Consequence: ${cell.consequence}, Score: ${cell.score}`,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute top-0.5 left-1 text-[9px] opacity-50 text-text-ops-muted", children: cell.score }),
                  cell.count > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: clsx(
                    "absolute top-0.5 right-1 text-[10px] font-bold",
                    config.textClass
                  ), children: cell.count })
                ]
              },
              `${cell.likelihood}-${cell.consequence}`
            );
          })
        ] }, rowIdx)),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "ml-10 text-center mt-1", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-text-ops-muted", children: "Consequence →" }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Filter, { className: "w-4 h-4 text-text-ops-muted" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-xs font-medium text-text-ops-muted uppercase tracking-wider", children: activeFilters.likelihood !== null ? `Risks (L:${activeFilters.likelihood} × C:${activeFilters.consequence})` : "All Risks" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted", children: [
          "(",
          filteredRisks.length,
          ")"
        ] })
      ] }),
      filteredRisks.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-8 text-text-ops-muted", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-8 h-8 mb-2 text-text-ops-muted/50" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-center", children: activeFilters.likelihood !== null ? "No risks in this matrix cell." : "No active risks." })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2 max-h-64 overflow-y-auto", children: filteredRisks.map((risk) => {
        const zone = getZone(risk.score);
        const config = ZONE_CONFIG[zone];
        const statusConfig = STATUS_CONFIG[risk.status] || STATUS_CONFIG.OPEN;
        return /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: clsx(
              "p-3 rounded-md border transition-colors",
              config.bgClass,
              config.borderClass
            ),
            children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start justify-between gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: clsx("text-sm font-medium", config.textClass), children: risk.title }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: clsx(
                    "px-1.5 py-0.5 rounded text-[10px] font-medium",
                    statusConfig.color,
                    `bg-${statusConfig.color.split("-")[1]}-500/10`
                  ), children: statusConfig.label })
                ] }),
                risk.portfolio_node_id && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-mono text-text-ops-muted", children: [
                  "Node: ",
                  risk.portfolio_node_id
                ] }),
                risk.mitigation && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted mt-1 line-clamp-2", children: risk.mitigation })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 text-xs font-mono text-text-ops-muted", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "px-1.5 py-0.5 rounded bg-bg-ops-overlay", children: [
                  "L:",
                  risk.likelihood
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "px-1.5 py-0.5 rounded bg-bg-ops-overlay", children: [
                  "C:",
                  risk.consequence
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: clsx(
                  "px-1.5 py-0.5 rounded font-bold",
                  config.textClass,
                  config.bgClass
                ), children: risk.score })
              ] })
            ] })
          },
          risk.id
        );
      }) })
    ] })
  ] });
};
const initialSimulationState = {
  iterations: 2e3,
  distributionType: "BETA_PERT",
  isRunning: false,
  progress: 0,
  result: null,
  error: null
};
const ScheduleRiskView = ({ projectId }) => {
  const [activeTab, setActiveTab] = reactExports.useState("simulation");
  const [simState, setSimState] = reactExports.useState(initialSimulationState);
  const [risks, setRisks] = reactExports.useState([]);
  const [cpmFinishDate, setCpmFinishDate] = reactExports.useState(void 0);
  const [loadingCpm, setLoadingCpm] = reactExports.useState(false);
  const fetchCpmData = reactExports.useCallback(async () => {
    if (!projectId) return;
    setLoadingCpm(true);
    try {
      const response = await api.get(`/api/v1/schedule/${projectId}/recalculate-cpm`);
      if (response.data) {
        const activities = response.data.activities || [];
        const latestFinish = activities.reduce(
          (max, a) => {
            const ef = a.early_finish || "";
            return ef > max ? ef : max;
          },
          ""
        );
        if (latestFinish) {
          setCpmFinishDate(latestFinish);
        }
      }
    } catch (err) {
      console.error("Failed to fetch CPM data:", err);
    } finally {
      setLoadingCpm(false);
    }
  }, [projectId]);
  const runSimulation = reactExports.useCallback(async () => {
    var _a, _b;
    if (!projectId) return;
    setSimState((prev) => ({
      ...prev,
      isRunning: true,
      progress: 0,
      error: null
    }));
    const progressInterval = setInterval(() => {
      setSimState((prev) => ({
        ...prev,
        progress: Math.min(prev.progress + Math.random() * 15, 90)
      }));
    }, 500);
    try {
      const response = await api.post(`/api/v1/schedule/${projectId}/monte-carlo`, {
        iterations: simState.iterations
      });
      clearInterval(progressInterval);
      const result = response.data;
      setSimState((prev) => ({
        ...prev,
        isRunning: false,
        progress: 100,
        result,
        error: null
      }));
      if (!cpmFinishDate) {
        await fetchCpmData();
      }
    } catch (err) {
      clearInterval(progressInterval);
      const message = ((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Simulation failed. Please try again.";
      setSimState((prev) => ({
        ...prev,
        isRunning: false,
        progress: 0,
        error: message
      }));
    }
  }, [projectId, simState.iterations, cpmFinishDate, fetchCpmData]);
  const resetSimulation = reactExports.useCallback(() => {
    setSimState(initialSimulationState);
  }, []);
  const handleIterationsChange = reactExports.useCallback((iterations) => {
    setSimState((prev) => ({ ...prev, iterations }));
  }, []);
  const handleDistributionChange = reactExports.useCallback((distributionType) => {
    setSimState((prev) => ({ ...prev, distributionType }));
  }, []);
  const handleRiskCellClick = reactExports.useCallback((filters) => {
    console.log("Risk matrix filter:", filters);
  }, []);
  const tabs = [
    {
      id: "simulation",
      label: "Simulation",
      icon: BarChart3,
      description: "Run Monte Carlo simulation and view probability distribution"
    },
    {
      id: "sensitivity",
      label: "Sensitivity",
      icon: TrendingUp,
      description: "Tornado chart showing criticality indices"
    },
    {
      id: "risk-register",
      label: "Risk Register",
      icon: Shield,
      description: "5×5 risk matrix and active risk items"
    }
  ];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full bg-bg-ops-base", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-surface", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold text-text-ops-primary", children: "Schedule Risk Analysis" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted mt-1", children: "Monte Carlo simulation, sensitivity analysis, and risk register" })
      ] }),
      loadingCpm && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-xs text-text-ops-muted", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-3.5 h-3.5 animate-spin" }),
        "Loading CPM data..."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-1 px-6 py-2 border-b border-border-ops-subtle bg-bg-ops-surface/50", children: tabs.map((tab) => {
      const Icon = tab.icon;
      const isActive = activeTab === tab.id;
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: () => setActiveTab(tab.id),
          className: clsx(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
            isActive ? "bg-blue-600/20 text-blue-400 border border-blue-500/30" : "text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay border border-transparent"
          ),
          title: tab.description,
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: "w-4 h-4" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden sm:inline", children: tab.label })
          ]
        },
        tab.id
      );
    }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-y-auto p-6", children: [
      !projectId && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3 p-4 rounded-md bg-amber-500/10 border border-amber-500/30 mb-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-5 h-5 mt-0.5 flex-shrink-0 text-amber-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-medium text-amber-400", children: "No Project Selected" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-amber-300/80 mt-1", children: "Select a project from the schedule view to enable Monte Carlo simulation." })
        ] })
      ] }),
      activeTab === "simulation" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 xl:grid-cols-3 gap-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "xl:col-span-1", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          MonteCarloControls,
          {
            state: simState,
            projectId: projectId || "",
            onIterationsChange: handleIterationsChange,
            onDistributionChange: handleDistributionChange,
            onRun: runSimulation,
            onReset: resetSimulation
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "xl:col-span-2", children: simState.result ? /* @__PURE__ */ jsxRuntimeExports.jsx(
          CumulativeProbabilityCurve,
          {
            result: simState.result,
            cpmFinishDate
          }
        ) : simState.isRunning ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center h-full py-24 text-text-ops-muted", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-12 h-12 mb-4 animate-spin text-blue-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-medium", children: "Running Monte Carlo Simulation..." }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs mt-1", children: [
            simState.progress.toFixed(0),
            "% complete"
          ] })
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center h-full py-24 text-text-ops-muted", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingUp, { className: "w-12 h-12 mb-4 text-text-ops-muted/50" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-medium text-center", children: "No simulation results yet" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs mt-1 text-center max-w-md", children: 'Configure the simulation parameters and click "Run Monte Carlo Simulation" to generate the cumulative probability distribution curve.' })
        ] }) })
      ] }),
      activeTab === "sensitivity" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "max-w-4xl", children: simState.result ? /* @__PURE__ */ jsxRuntimeExports.jsx(
        TornadoSensitivityChart,
        {
          criticalityIndices: simState.result.criticality_indices,
          maxBars: 20
        }
      ) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-24 text-text-ops-muted", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingUp, { className: "w-12 h-12 mb-4 text-text-ops-muted/50" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-medium text-center", children: "Run a simulation first" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs mt-1 text-center max-w-md", children: "The Tornado Sensitivity Chart requires Monte Carlo simulation results. Switch to the Simulation tab and run a simulation to generate criticality indices." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => setActiveTab("simulation"),
            className: "mt-4 px-4 py-2 rounded-md text-sm font-medium text-blue-400 bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 transition-colors",
            children: "Go to Simulation"
          }
        )
      ] }) }),
      activeTab === "risk-register" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 xl:grid-cols-2 gap-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          RiskMatrixGrid,
          {
            risks,
            onCellClick: handleRiskCellClick
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 rounded-md bg-bg-ops-surface border border-border-ops-subtle", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Info, { className: "w-4 h-4 text-blue-400" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-sm font-semibold text-text-ops-primary", children: "Risk Register Overview" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-sm", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Total Risks" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-text-ops-primary", children: risks.length })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-sm", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Open" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-blue-400", children: risks.filter((r) => r.status === "OPEN").length })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-sm", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Mitigating" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-amber-400", children: risks.filter((r) => r.status === "MITIGATING").length })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-sm", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Closed" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-green-400", children: risks.filter((r) => r.status === "CLOSED").length })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between text-sm", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Accepted" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-gray-400", children: risks.filter((r) => r.status === "ACCEPTED").length })
              ] })
            ] })
          ] }),
          risks.some((r) => r.score >= 15 && r.status === "OPEN") && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4 rounded-md bg-red-500/10 border border-red-500/30", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-5 h-5 mt-0.5 flex-shrink-0 text-red-400" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-medium text-red-400", children: "Extreme Risks Detected" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-red-300/80 mt-1", children: [
                risks.filter((r) => r.score >= 15 && r.status === "OPEN").length,
                " ",
                "open risk(s) with extreme scores (≥15) require immediate attention."
              ] })
            ] })
          ] }) }),
          risks.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-12 text-text-ops-muted", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-8 h-8 mb-3 text-text-ops-muted/50" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-center", children: "No risks loaded for this project." }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs mt-1 text-center max-w-xs", children: "Risk items will appear here when linked to WBS tasks in the project." })
          ] })
        ] })
      ] })
    ] })
  ] });
};
export {
  ScheduleRiskView as default
};
//# sourceMappingURL=ScheduleRiskView-BukJoGns.js.map
