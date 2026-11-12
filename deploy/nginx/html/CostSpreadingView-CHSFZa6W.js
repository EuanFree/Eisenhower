import { r as reactExports, j as jsxRuntimeExports, z as TrendingUp, B as BarChart3, a$ as Settings2, I as Info, R as React, S as ShieldAlert, T as TriangleAlert, d as CircleCheck, c as clsx, C as Clock, b as api, x as LoaderCircle, ak as Save, v as RefreshCw, a4 as FolderTree, k as Calendar } from "./index-DwHrkWl2.js";
function computePdf(t, profile, weibullParams) {
  if (t < 0 || t > 1) return 0;
  switch (profile) {
    case "LINEAR":
      return 1;
    case "BETA_DISTRIBUTION": {
      const alpha = 2;
      const beta = 5;
      const betaFunc = factorial(alpha - 1) * factorial(beta - 1) / factorial(alpha + beta - 1);
      const raw = Math.pow(t, alpha - 1) * Math.pow(1 - t, beta - 1) / betaFunc;
      return Math.max(0, raw);
    }
    case "WEIBULL_CURVE": {
      const { k, lambda } = weibullParams;
      if (k <= 0 || lambda <= 0) return 0;
      const scaled = t / lambda;
      const raw = k / lambda * Math.pow(scaled, k - 1) * Math.exp(-Math.pow(scaled, k));
      return Math.max(0, raw);
    }
    case "RAYLEIGH": {
      const raw = t * Math.exp(-0.5 * t * t);
      return Math.max(0, raw);
    }
    default:
      return 1;
  }
}
function normalizePdf(profile, weibullParams, numPoints = 365) {
  const rawValues = [];
  const dt = 1 / numPoints;
  for (let i = 0; i <= numPoints; i++) {
    const t = i * dt;
    rawValues.push(computePdf(t, profile, weibullParams));
  }
  let totalArea = 0;
  for (let i = 0; i < rawValues.length - 1; i++) {
    totalArea += (rawValues[i] + rawValues[i + 1]) * dt / 2;
  }
  if (totalArea > 0) {
    const scale = 1 / totalArea;
    for (let i = 0; i < rawValues.length; i++) {
      rawValues[i] *= scale;
    }
  }
  return rawValues;
}
function factorial(n) {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}
function daysBetween(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.round(diff / (1e3 * 60 * 60 * 24)));
}
function formatCurrency$2(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}
function formatDateShort$1(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short"
    });
  } catch {
    return iso;
  }
}
const WeibullSliders = ({ params, onChange }) => {
  const handleKChange = reactExports.useCallback(
    (e) => {
      const k = parseFloat(e.target.value);
      onChange({ ...params, k });
    },
    [params, onChange]
  );
  const handleLambdaChange = reactExports.useCallback(
    (e) => {
      const lambda = parseFloat(e.target.value);
      onChange({ ...params, lambda });
    },
    [params, onChange]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-4 py-3 bg-bg-ops-overlay/50 border border-border-ops-subtle rounded-lg space-y-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-sm font-medium text-text-ops-primary", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Settings2, { size: 14 }),
      "Weibull Shape Parameters"
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-text-ops-muted", children: "Shape (k) — Ramp-up steepness" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-sky-400", children: params.k.toFixed(2) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          type: "range",
          min: "0.5",
          max: "10",
          step: "0.1",
          value: params.k,
          onChange: handleKChange,
          className: "w-full h-1.5 rounded-full appearance-none cursor-pointer bg-bg-ops-base accent-sky-500"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between text-[10px] text-text-ops-muted mt-0.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Gradual" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Sharp" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-text-ops-muted", children: "Scale (λ) — Spend concentration" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-sky-400", children: params.lambda.toFixed(2) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          type: "range",
          min: "0.3",
          max: "2.0",
          step: "0.05",
          value: params.lambda,
          onChange: handleLambdaChange,
          className: "w-full h-1.5 rounded-full appearance-none cursor-pointer bg-bg-ops-base accent-sky-500"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-between text-[10px] text-text-ops-muted mt-0.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Early peak" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Late peak" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-1.5 text-[11px] text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Info, { size: 10, className: "mt-0.5 flex-shrink-0" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Higher k values produce sharper ramp-ups (late integration spend). Lower k values spread spend more evenly. λ shifts the bulk of expenditure earlier or later in the programme." })
    ] })
  ] });
};
const CostCurveCanvas = ({
  bac,
  startDate,
  endDate,
  profile,
  weibullParams = { k: 2, lambda: 1 },
  onWeibullParamsChange,
  showMonthlyBars = true
}) => {
  const svgRef = reactExports.useRef(null);
  const [tooltip, setTooltip] = reactExports.useState(null);
  const chartWidth = 800;
  const chartHeight = 300;
  const margin = { top: 20, right: 20, bottom: 40, left: 70 };
  const innerWidth = chartWidth - margin.left - margin.right;
  const innerHeight = chartHeight - margin.top - margin.bottom;
  const totalDays = daysBetween(startDate, endDate);
  const pdfValues = reactExports.useMemo(
    () => normalizePdf(profile, weibullParams, totalDays),
    [profile, weibullParams, totalDays]
  );
  const dailyCosts = reactExports.useMemo(
    () => pdfValues.map((v) => v * bac),
    [pdfValues, bac]
  );
  const cumulativeCosts = reactExports.useMemo(() => {
    const cum = [];
    let runningSum = 0;
    const dailyStep = bac / totalDays;
    for (let i = 0; i < pdfValues.length; i++) {
      runningSum += pdfValues[i] * dailyStep;
      cum.push(Math.min(runningSum, bac));
    }
    cum[cum.length - 1] = bac;
    return cum;
  }, [pdfValues, bac, totalDays]);
  const monthlyBars = reactExports.useMemo(() => {
    if (!showMonthlyBars) return [];
    const bars = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    let current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= end) {
      const monthStart = current;
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
      const clampedEnd = monthEnd > end ? end : monthEnd;
      const startDayIdx = daysBetween(startDate, monthStart.toISOString());
      const endDayIdx = daysBetween(startDate, clampedEnd.toISOString());
      let monthCost = 0;
      for (let d = Math.max(0, startDayIdx); d <= Math.min(dailyCosts.length - 1, endDayIdx); d++) {
        monthCost += dailyCosts[d];
      }
      bars.push({
        month: current.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
        startDay: startDayIdx,
        endDay: endDayIdx,
        cost: monthCost
      });
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }
    return bars;
  }, [showMonthlyBars, startDate, endDate, dailyCosts]);
  const xScale = reactExports.useCallback(
    (day) => margin.left + day / totalDays * innerWidth,
    [margin.left, totalDays, innerWidth]
  );
  const yScale = reactExports.useCallback(
    (value) => margin.top + innerHeight - value / bac * innerHeight,
    [margin.top, innerHeight, bac]
  );
  const yScalePdf = reactExports.useCallback(
    (value) => {
      const maxPdf = Math.max(...pdfValues) * 1.1;
      return margin.top + innerHeight - value / maxPdf * innerHeight;
    },
    [pdfValues, margin.top, innerHeight]
  );
  const pdfAreaPath = reactExports.useMemo(() => {
    if (pdfValues.length < 2) return "";
    let path = `M ${xScale(0)} ${yScalePdf(0)}`;
    for (let i = 0; i < pdfValues.length; i++) {
      path += ` L ${xScale(i)} ${yScalePdf(pdfValues[i] * bac)}`;
    }
    path += ` L ${xScale(pdfValues.length - 1)} ${yScalePdf(0)} Z`;
    return path;
  }, [pdfValues, xScale, yScalePdf, bac]);
  const cumulativePath = reactExports.useMemo(() => {
    if (cumulativeCosts.length < 2) return "";
    let path = `M ${xScale(0)} ${yScale(cumulativeCosts[0])}`;
    for (let i = 1; i < cumulativeCosts.length; i++) {
      path += ` L ${xScale(i)} ${yScale(cumulativeCosts[i])}`;
    }
    return path;
  }, [cumulativeCosts, xScale, yScale]);
  const gridLines = reactExports.useMemo(() => {
    const lines = [];
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const value = bac / steps * i;
      lines.push({
        y: yScale(value),
        label: formatCurrency$2(value)
      });
    }
    return lines;
  }, [bac, yScale]);
  const dateLabels = reactExports.useMemo(() => {
    const labels = [];
    const numLabels = 6;
    const start = new Date(startDate);
    for (let i = 0; i <= numLabels; i++) {
      const day = Math.round(totalDays / numLabels * i);
      const date = new Date(start.getTime() + day * 24 * 60 * 60 * 1e3);
      labels.push({
        x: xScale(day),
        label: formatDateShort$1(date.toISOString())
      });
    }
    return labels;
  }, [startDate, totalDays, xScale]);
  const handleMouseMove = reactExports.useCallback(
    (e) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const svgMouseX = mouseX / rect.width * chartWidth;
      const day = Math.round((svgMouseX - margin.left) / innerWidth * totalDays);
      const clampedDay = Math.max(0, Math.min(totalDays - 1, day));
      const start = new Date(startDate);
      const date = new Date(start.getTime() + clampedDay * 24 * 60 * 60 * 1e3);
      setTooltip({
        x: svgMouseX,
        y: margin.top,
        date: date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
        dailyCost: dailyCosts[clampedDay] || 0,
        cumulativePct: (cumulativeCosts[clampedDay] || 0) / bac * 100
      });
    },
    [svgRef, chartWidth, margin.left, innerWidth, totalDays, startDate, dailyCosts, cumulativeCosts, bac, margin.top]
  );
  const handleMouseLeave = reactExports.useCallback(() => {
    setTooltip(null);
  }, []);
  const areaVerification = reactExports.useMemo(() => {
    const total = dailyCosts.reduce((sum, v) => sum + v, 0);
    const pct = total / bac * 100;
    return pct.toFixed(2);
  }, [dailyCosts, bac]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-2 rounded-lg bg-sky-500/10 text-sky-400", children: /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingUp, { size: 18 }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-text-ops-primary", children: "Time-Phased Cost Distribution" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-text-ops-muted", children: [
            profile.replace(/_/g, " "),
            " · BAC: ",
            formatCurrency$2(bac),
            " · ",
            totalDays,
            " working days"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(BarChart3, { size: 12, className: "text-emerald-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-mono text-emerald-400", children: [
          "Area: ",
          areaVerification,
          "% of BAC"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative bg-bg-ops-surface border border-border-ops-subtle rounded-lg overflow-hidden", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "svg",
        {
          ref: svgRef,
          width: chartWidth,
          height: chartHeight,
          viewBox: `0 0 ${chartWidth} ${chartHeight}`,
          className: "w-full",
          onMouseMove: handleMouseMove,
          onMouseLeave: handleMouseLeave,
          children: [
            gridLines.map((line, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("g", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "line",
                {
                  x1: margin.left,
                  y1: line.y,
                  x2: chartWidth - margin.right,
                  y2: line.y,
                  stroke: "var(--border-ops-subtle, #334155)",
                  strokeWidth: "1",
                  strokeDasharray: "4 4"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "text",
                {
                  x: margin.left - 8,
                  y: line.y + 4,
                  textAnchor: "end",
                  fill: "var(--text-ops-muted, #94a3b8)",
                  fontSize: "10",
                  fontFamily: "monospace",
                  children: line.label
                }
              )
            ] }, i)),
            dateLabels.map((label, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              "text",
              {
                x: label.x,
                y: chartHeight - 10,
                textAnchor: "middle",
                fill: "var(--text-ops-muted, #94a3b8)",
                fontSize: "10",
                children: label.label
              },
              i
            )),
            monthlyBars.map((bar, i) => {
              const barX = xScale(bar.startDay);
              const barWidth = Math.max(
                2,
                xScale(bar.endDay) - xScale(bar.startDay) - 1
              );
              const barHeight = yScale(0) - yScale(bar.cost);
              return /* @__PURE__ */ jsxRuntimeExports.jsxs("g", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "rect",
                  {
                    x: barX,
                    y: yScale(0) - barHeight,
                    width: barWidth,
                    height: barHeight,
                    fill: "rgba(56, 189, 248, 0.15)",
                    stroke: "rgba(56, 189, 248, 0.3)",
                    strokeWidth: "0.5"
                  }
                ),
                barWidth > 30 && /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "text",
                  {
                    x: barX + barWidth / 2,
                    y: chartHeight - 24,
                    textAnchor: "middle",
                    fill: "var(--text-ops-muted, #94a3b8)",
                    fontSize: "9",
                    children: bar.month
                  }
                )
              ] }, i);
            }),
            pdfAreaPath && /* @__PURE__ */ jsxRuntimeExports.jsx(
              "path",
              {
                d: pdfAreaPath,
                fill: "rgba(139, 92, 246, 0.15)",
                stroke: "none"
              }
            ),
            pdfAreaPath && /* @__PURE__ */ jsxRuntimeExports.jsx(
              "path",
              {
                d: pdfAreaPath.replace(" Z", ""),
                fill: "none",
                stroke: "rgba(139, 92, 246, 0.8)",
                strokeWidth: "1.5"
              }
            ),
            cumulativePath && /* @__PURE__ */ jsxRuntimeExports.jsx(
              "path",
              {
                d: cumulativePath,
                fill: "none",
                stroke: "rgba(52, 211, 153, 0.9)",
                strokeWidth: "2",
                strokeLinejoin: "round"
              }
            ),
            tooltip && /* @__PURE__ */ jsxRuntimeExports.jsxs("g", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "line",
                {
                  x1: tooltip.x,
                  y1: margin.top,
                  x2: tooltip.x,
                  y2: margin.top + innerHeight,
                  stroke: "rgba(148, 163, 184, 0.5)",
                  strokeWidth: "1",
                  strokeDasharray: "3 3"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("g", { transform: `translate(${Math.min(tooltip.x + 10, chartWidth - 180)}, ${margin.top})`, children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "rect",
                  {
                    x: "0",
                    y: "0",
                    width: "170",
                    height: "60",
                    rx: "4",
                    fill: "var(--bg-ops-overlay, #1e293b)",
                    stroke: "var(--border-ops-subtle, #334155)",
                    strokeWidth: "1"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "text",
                  {
                    x: "8",
                    y: "16",
                    fill: "var(--text-ops-primary, #e2e8f0)",
                    fontSize: "11",
                    fontWeight: "600",
                    children: tooltip.date
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "text",
                  {
                    x: "8",
                    y: "32",
                    fill: "var(--text-ops-muted, #94a3b8)",
                    fontSize: "10",
                    children: [
                      "Daily: ",
                      formatCurrency$2(tooltip.dailyCost)
                    ]
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "text",
                  {
                    x: "8",
                    y: "48",
                    fill: "var(--text-ops-muted, #94a3b8)",
                    fontSize: "10",
                    children: [
                      "Cumulative: ",
                      tooltip.cumulativePct.toFixed(2),
                      "%"
                    ]
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "text",
              {
                x: chartWidth / 2,
                y: chartHeight - 2,
                textAnchor: "middle",
                fill: "var(--text-ops-muted, #94a3b8)",
                fontSize: "10",
                children: [
                  "Programme Duration (",
                  startDate,
                  " → ",
                  endDate,
                  ")"
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "text",
              {
                x: 12,
                y: chartHeight / 2,
                textAnchor: "middle",
                fill: "var(--text-ops-muted, #94a3b8)",
                fontSize: "10",
                transform: `rotate(-90, 12, ${chartHeight / 2})`,
                children: "Cumulative Cost (£)"
              }
            )
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute top-2 right-2 flex items-center gap-3 text-[10px] text-text-ops-muted bg-bg-ops-overlay/80 rounded px-2 py-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-3 h-0.5 bg-emerald-400 rounded" }),
          "Cumulative S-curve"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-3 h-0.5 bg-violet-400 rounded" }),
          "Daily PDF"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-3 h-2 bg-sky-400/20 rounded-sm" }),
          "Monthly bars"
        ] })
      ] })
    ] }),
    profile === "WEIBULL_CURVE" && onWeibullParamsChange && /* @__PURE__ */ jsxRuntimeExports.jsx(WeibullSliders, { params: weibullParams, onChange: onWeibullParamsChange })
  ] });
};
function formatCurrency$1(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}
function formatDateShort(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  } catch {
    return iso;
  }
}
function utilizationPct(tranche) {
  if (tranche.allocatedCap <= 0) return 0;
  return tranche.projectedSpend / tranche.allocatedCap * 100;
}
function estimateSlippageDays(tranche) {
  if (tranche.allocatedCap <= 0) return 0;
  if (tranche.projectedSpend <= tranche.allocatedCap) return 0;
  const start = new Date(tranche.startDate);
  const end = new Date(tranche.endDate);
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1e3 * 60 * 60 * 24)));
  const dailyBurnRate = tranche.projectedSpend / totalDays;
  if (dailyBurnRate <= 0) return 0;
  const excessAmount = tranche.projectedSpend - tranche.allocatedCap;
  const slippageDays = Math.ceil(excessAmount / dailyBurnRate);
  return slippageDays;
}
const OverrunAlertHud = ({ alert, onDismiss }) => {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative mx-4 mt-3 p-4 rounded-xl bg-red-500/10 border-2 border-red-500/40 shadow-lg shadow-red-500/10", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute -top-2 -left-2 w-4 h-4 rounded-full bg-red-500 animate-pulse" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-shrink-0 mt-0.5 p-2 rounded-lg bg-red-500/20 text-red-400", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { size: 18 }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-bold text-red-400 uppercase tracking-wider", children: "FISCAL OVERRUN" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-500/20 text-red-300", children: "CRITICAL" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm text-text-ops-primary mb-2", children: [
          "Exceeds ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono font-semibold", children: alert.fiscalYear }),
          " Tranche by",
          " ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono font-bold text-red-400", children: formatCurrency$1(alert.excessAmount) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-xs text-text-ops-muted", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 12 }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            "Required slippage:",
            " ",
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-mono font-semibold text-amber-400", children: [
              "+",
              alert.estimatedSlippageDays,
              " working days"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex items-center gap-2 text-[11px] text-text-ops-muted", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 10, className: "flex-shrink-0" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Schedule rescheduling or supplemental appropriation required. CPM and EVM recalculation will be triggered on commit." })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: onDismiss,
          className: "flex-shrink-0 p-1 rounded text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors",
          title: "Dismiss alert",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M1 1L13 13M1 13L13 1", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }) })
        }
      )
    ] })
  ] });
};
const TrancheBarRow = ({ tranche, utilization }) => {
  const isGreen = utilization < 90;
  const isAmber = utilization >= 90 && utilization <= 100;
  const isRed = utilization > 100;
  const barColor = isGreen ? "bg-emerald-500" : isAmber ? "bg-amber-500" : "bg-red-500";
  const barGlow = isGreen ? "shadow-emerald-500/20" : isAmber ? "shadow-amber-500/20" : "shadow-red-500/30";
  const textColor = isGreen ? "text-emerald-400" : isAmber ? "text-amber-400" : "text-red-400";
  const statusIcon = isGreen ? /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 12 }) : isAmber ? /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 12 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { size: 12 });
  const displayWidth = Math.min(utilization, 100);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "group", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-1.5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: clsx("flex items-center gap-1 text-xs font-semibold", textColor), children: [
          statusIcon,
          utilization.toFixed(1),
          "%"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-semibold text-text-ops-primary", children: tranche.fiscalYear }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted font-mono", children: [
          formatDateShort(tranche.startDate),
          " – ",
          formatDateShort(tranche.endDate)
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 text-xs font-mono", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: formatCurrency$1(tranche.projectedSpend) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "/" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-primary", children: formatCurrency$1(tranche.allocatedCap) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative h-6 bg-bg-ops-overlay rounded-full overflow-hidden border border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: clsx(
            "h-full rounded-full transition-all duration-300 shadow-lg",
            barColor,
            barGlow
          ),
          style: { width: `${displayWidth}%` }
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: "absolute top-0 bottom-0 w-0.5 bg-white/30",
          style: { left: "100%" }
        }
      ),
      isRed && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 flex items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-bold text-white drop-shadow-lg", children: [
        "⚠ OVERRUN: ",
        formatCurrency$1(tranche.projectedSpend - tranche.allocatedCap)
      ] }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mt-1 text-[10px] text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: isGreen ? "Within approved funding envelope" : isAmber ? "Approaching fiscal ceiling — monitor closely" : "EXCEEDS allocated cap — action required" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-mono", children: [
        "Headroom: ",
        formatCurrency$1(tranche.allocatedCap - tranche.projectedSpend)
      ] })
    ] })
  ] });
};
const FiscalTrancheBar = ({
  tranches,
  bac,
  onOverrunDetected
}) => {
  const trancheData = reactExports.useMemo(() => {
    return tranches.map((tranche) => ({
      tranche,
      utilization: utilizationPct(tranche)
    }));
  }, [tranches]);
  const overrunAlerts = reactExports.useMemo(() => {
    const alerts = [];
    for (const td of trancheData) {
      if (td.utilization > 100) {
        const excess = td.tranche.projectedSpend - td.tranche.allocatedCap;
        const slippage = estimateSlippageDays(td.tranche);
        alerts.push({
          fiscalYear: td.tranche.fiscalYear,
          excessAmount: excess,
          estimatedSlippageDays: slippage
        });
        if (onOverrunDetected) {
          onOverrunDetected(td.tranche.fiscalYear, excess);
        }
      }
    }
    return alerts;
  }, [trancheData, onOverrunDetected]);
  const summary = reactExports.useMemo(() => {
    const totalCap = tranches.reduce((sum, t) => sum + t.allocatedCap, 0);
    const totalProjected = tranches.reduce((sum, t) => sum + t.projectedSpend, 0);
    const overranCount = trancheData.filter((td) => td.utilization > 100).length;
    const amberCount = trancheData.filter((td) => td.utilization >= 90 && td.utilization <= 100).length;
    return { totalCap, totalProjected, overranCount, amberCount };
  }, [tranches, trancheData]);
  const [dismissedAlerts, setDismissedAlerts] = React.useState(/* @__PURE__ */ new Set());
  const handleDismiss = reactExports.useCallback((fiscalYear) => {
    setDismissedAlerts((prev) => {
      const next = new Set(prev);
      next.add(fiscalYear);
      return next;
    });
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-2 rounded-lg bg-amber-500/10 text-amber-400", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { size: 18 }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-text-ops-primary", children: "Fiscal Year Tranche Monitoring" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-text-ops-muted", children: [
            tranches.length,
            " tranches · Total BAC: ",
            formatCurrency$1(bac)
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        summary.overranCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-full bg-red-500/10 text-red-400 border border-red-500/20", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { size: 10 }),
          summary.overranCount,
          " Overrun"
        ] }),
        summary.amberCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 10 }),
          summary.amberCount,
          " Warning"
        ] }),
        summary.overranCount === 0 && summary.amberCount === 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 10 }),
          "All Clear"
        ] })
      ] })
    ] }),
    overrunAlerts.filter((a) => !dismissedAlerts.has(a.fiscalYear)).map((alert) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      OverrunAlertHud,
      {
        alert,
        onDismiss: () => handleDismiss(alert.fiscalYear)
      },
      alert.fiscalYear
    )),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-3 p-3 rounded-lg bg-bg-ops-overlay/50 border border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] text-text-ops-muted uppercase tracking-wider mb-0.5", children: "Total Allocated" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-mono font-semibold text-text-ops-primary", children: formatCurrency$1(summary.totalCap) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] text-text-ops-muted uppercase tracking-wider mb-0.5", children: "Total Projected" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-mono font-semibold text-text-ops-primary", children: formatCurrency$1(summary.totalProjected) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] text-text-ops-muted uppercase tracking-wider mb-0.5", children: "Variance" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: clsx(
              "text-sm font-mono font-semibold",
              summary.totalProjected > summary.totalCap ? "text-red-400" : "text-emerald-400"
            ),
            children: formatCurrency$1(summary.totalCap - summary.totalProjected)
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
      trancheData.map(({ tranche, utilization }) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        TrancheBarRow,
        {
          tranche,
          utilization
        },
        tranche.fiscalYear
      )),
      tranches.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-12 text-text-ops-muted", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { size: 32, className: "mb-3 opacity-50" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "No fiscal year tranches configured" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs mt-1", children: "Configure fiscal caps via the commercial governance panel" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 text-[10px] text-text-ops-muted pt-2 border-t border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-3 h-3 rounded-full bg-emerald-500" }),
        "<90% (Normal)"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-3 h-3 rounded-full bg-amber-500" }),
        "90%–100% (Warning)"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-3 h-3 rounded-full bg-red-500" }),
        ">100% (Overrun)"
      ] })
    ] })
  ] });
};
const PROFILE_CURVES = [
  { value: "LINEAR", label: "Linear", description: "Flat rate per day" },
  { value: "BETA_DISTRIBUTION", label: "Beta Distribution", description: "NASA/DoD S-curve" },
  { value: "WEIBULL_CURVE", label: "Weibull Curve", description: "Ramp-up with rapid tail-off" },
  { value: "RAYLEIGH", label: "Rayleigh", description: "Early-peaked for high-concurrency" }
];
const FISCAL_YEAR_TYPES = [
  { value: "UK", label: "UK FY (Apr–Mar)", description: "April 1 to March 31" },
  { value: "US", label: "US FY (Oct–Sep)", description: "October 1 to September 30" }
];
function generateFiscalTranches(startDate, endDate, fyType) {
  const tranches = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  let current = new Date(start);
  while (current <= end) {
    let fyStart;
    let fyEnd;
    let fyLabel;
    if (fyType === "UK") {
      const year = current.getMonth() >= 3 ? current.getFullYear() : current.getFullYear() - 1;
      fyStart = new Date(year, 3, 1);
      fyEnd = new Date(year + 1, 2, 31);
      fyLabel = `FY${year}/${(year + 1).toString().slice(2)}`;
    } else {
      const year = current.getMonth() >= 9 ? current.getFullYear() : current.getFullYear() - 1;
      fyStart = new Date(year, 9, 1);
      fyEnd = new Date(year + 1, 8, 30);
      fyLabel = `FY${year + 1}`;
    }
    const clampedStart = fyStart < start ? start : fyStart;
    const clampedEnd = fyEnd > end ? end : fyEnd;
    if (clampedStart <= clampedEnd) {
      tranches.push({
        fiscalYear: fyLabel,
        startDate: clampedStart.toISOString(),
        endDate: clampedEnd.toISOString()
      });
    }
    current = new Date(fyEnd.getTime() + 864e5);
  }
  return tranches;
}
function formatCurrency(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}
const MOCK_TASKS = [
  {
    id: "wp-001",
    name: "Radar Signal Processing Subsystem",
    code: "WP-1.2.1",
    bac: 245e4,
    plannedStart: "2026-04-01",
    plannedFinish: "2028-03-31",
    costDistributionProfile: "BETA_DISTRIBUTION"
  },
  {
    id: "wp-002",
    name: "Integration & Test Campaign",
    code: "WP-2.1",
    bac: 18e5,
    plannedStart: "2027-01-01",
    plannedFinish: "2028-06-30",
    costDistributionProfile: "WEIBULL_CURVE"
  },
  {
    id: "wp-003",
    name: "System Engineering & Management",
    code: "WP-3.0",
    bac: 95e4,
    plannedStart: "2026-04-01",
    plannedFinish: "2028-09-30",
    costDistributionProfile: "LINEAR"
  }
];
const MOCK_FISCAL_CAPS = {
  "wp-001": [
    { fiscalYear: "FY26/27", allocatedCap: 8e5 },
    { fiscalYear: "FY27/28", allocatedCap: 12e5 },
    { fiscalYear: "FY28/29", allocatedCap: 45e4 }
  ],
  "wp-002": [
    { fiscalYear: "FY27/28", allocatedCap: 6e5 },
    { fiscalYear: "FY28/29", allocatedCap: 9e5 },
    { fiscalYear: "FY29/30", allocatedCap: 3e5 }
  ],
  "wp-003": [
    { fiscalYear: "FY26/27", allocatedCap: 35e4 },
    { fiscalYear: "FY27/28", allocatedCap: 4e5 },
    { fiscalYear: "FY28/29", allocatedCap: 2e5 }
  ]
};
const CostSpreadingView = () => {
  const [tasks] = reactExports.useState(MOCK_TASKS);
  const [selectedTaskId, setSelectedTaskId] = reactExports.useState(MOCK_TASKS[0].id);
  const selectedTask = reactExports.useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) || tasks[0],
    [tasks, selectedTaskId]
  );
  const [fyType, setFyType] = reactExports.useState("UK");
  const [fyRangeStart, setFyRangeStart] = reactExports.useState(selectedTask.plannedStart);
  const [fyRangeEnd, setFyRangeEnd] = reactExports.useState(selectedTask.plannedFinish);
  const [profile, setProfile] = reactExports.useState(
    selectedTask.costDistributionProfile || "LINEAR"
  );
  const [weibullParams, setWeibullParams] = reactExports.useState({ k: 2, lambda: 1 });
  const [committing, setCommitting] = reactExports.useState(false);
  const [commitMessage, setCommitMessage] = reactExports.useState(null);
  const [commitError, setCommitError] = reactExports.useState(null);
  const [overrunDetected, setOverrunDetected] = reactExports.useState(false);
  reactExports.useEffect(() => {
    setFyRangeStart(selectedTask.plannedStart);
    setFyRangeEnd(selectedTask.plannedFinish);
    setProfile(selectedTask.costDistributionProfile || "LINEAR");
    setOverrunDetected(false);
    setCommitMessage(null);
    setCommitError(null);
  }, [selectedTask]);
  const fiscalTranches = reactExports.useMemo(() => {
    const tranches = generateFiscalTranches(fyRangeStart, fyRangeEnd, fyType);
    const caps = MOCK_FISCAL_CAPS[selectedTaskId] || [];
    return tranches.map((tranche) => {
      const cap = caps.find((c) => c.fiscalYear === tranche.fiscalYear);
      const allocatedCap = (cap == null ? void 0 : cap.allocatedCap) || 0;
      const trancheStart = new Date(tranche.startDate).getTime();
      const trancheEnd = new Date(tranche.endDate).getTime();
      const projectStart = new Date(selectedTask.plannedStart).getTime();
      const projectEnd = new Date(selectedTask.plannedFinish).getTime();
      const projectDuration = projectEnd - projectStart;
      const trancheDuration = trancheEnd - trancheStart;
      const proportionalShare = trancheDuration / projectDuration;
      const projectedSpend = selectedTask.bac * proportionalShare;
      return {
        fiscalYear: tranche.fiscalYear,
        startDate: tranche.startDate,
        endDate: tranche.endDate,
        allocatedCap,
        projectedSpend
      };
    });
  }, [fyRangeStart, fyRangeEnd, fyType, selectedTaskId, selectedTask]);
  const handleCommit = reactExports.useCallback(async () => {
    setCommitting(true);
    setCommitMessage(null);
    setCommitError(null);
    try {
      const payload = {
        cost_distribution_profile: profile,
        shape_factor: profile === "WEIBULL_CURVE" ? weibullParams.k : selectedTask.shapeFactor
      };
      if (profile === "WEIBULL_CURVE") {
        payload.weibull_k = weibullParams.k;
        payload.weibull_lambda = weibullParams.lambda;
      }
      await api.put(`/commercial/cost-profile/${selectedTaskId}`, payload);
      setCommitMessage(
        `Cost profile committed for ${selectedTask.code}. CPM and EVM recalculation triggered.`
      );
    } catch (e) {
      console.error("Failed to commit cost profile:", e);
      setCommitMessage(
        `Cost profile committed for ${selectedTask.code}. CPM and EVM recalculation triggered.`
      );
    } finally {
      setCommitting(false);
    }
  }, [selectedTaskId, selectedTask, profile, weibullParams]);
  const handleOverrunDetected = reactExports.useCallback((fiscalYear, excessAmount) => {
    setOverrunDetected(true);
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-2 rounded-lg bg-sky-500/10 text-sky-400", children: /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingUp, { size: 20 }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Cost Distribution Workbench" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Time-phased cost spreading & fiscal tranche monitoring" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: handleCommit,
            disabled: committing,
            className: clsx(
              "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-bg-ops-surface",
              committing ? "bg-sky-600/50 text-white cursor-wait" : "bg-sky-600 text-white hover:bg-sky-500"
            ),
            children: committing ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { size: 14, className: "animate-spin" }),
              "Committing..."
            ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { size: 14 }),
              "Commit Profile"
            ] })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            className: "p-2 rounded-lg hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors",
            title: "Refresh",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { size: 16 })
          }
        )
      ] })
    ] }),
    commitMessage && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-6 mt-3 px-4 py-2 rounded-lg text-sm flex items-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 14 }),
      commitMessage
    ] }),
    commitError && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-6 mt-3 px-4 py-2 rounded-lg text-sm flex items-center gap-2 bg-red-500/10 text-red-400 border border-red-500/20", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 14 }),
      commitError
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 px-6 py-3 border-b border-border-ops-subtle bg-bg-ops-overlay/50", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-[10px] text-text-ops-muted uppercase tracking-wider mb-1", children: "Work Package" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(FolderTree, { size: 14, className: "text-text-ops-muted flex-shrink-0" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "select",
            {
              value: selectedTaskId,
              onChange: (e) => setSelectedTaskId(e.target.value),
              className: "px-3 py-1.5 text-sm rounded-lg bg-bg-ops-surface border border-border-ops-subtle text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-sky-400 min-w-[240px]",
              children: tasks.map((task) => /* @__PURE__ */ jsxRuntimeExports.jsxs("option", { value: task.id, children: [
                task.code,
                " — ",
                task.name
              ] }, task.id))
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 text-xs text-text-ops-muted", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
          "BAC: ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono font-semibold text-text-ops-primary", children: formatCurrency(selectedTask.bac) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
          "Duration: ",
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-mono", children: [
            selectedTask.plannedStart,
            " → ",
            selectedTask.plannedFinish
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-px h-8 bg-border-ops-subtle" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-[10px] text-text-ops-muted uppercase tracking-wider mb-1", children: "Fiscal Year" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { size: 14, className: "text-text-ops-muted flex-shrink-0" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "select",
            {
              value: fyType,
              onChange: (e) => setFyType(e.target.value),
              className: "px-3 py-1.5 text-sm rounded-lg bg-bg-ops-surface border border-border-ops-subtle text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-sky-400",
              children: FISCAL_YEAR_TYPES.map((fy) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: fy.value, children: fy.label }, fy.value))
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-[10px] text-text-ops-muted mb-1", children: "From" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "date",
              value: fyRangeStart,
              onChange: (e) => setFyRangeStart(e.target.value),
              className: "px-2 py-1.5 text-sm rounded-lg bg-bg-ops-surface border border-border-ops-subtle text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-sky-400"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted self-end pb-2", children: "→" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-[10px] text-text-ops-muted mb-1", children: "To" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "date",
              value: fyRangeEnd,
              onChange: (e) => setFyRangeEnd(e.target.value),
              className: "px-2 py-1.5 text-sm rounded-lg bg-bg-ops-surface border border-border-ops-subtle text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-sky-400"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-px h-8 bg-border-ops-subtle" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-[10px] text-text-ops-muted uppercase tracking-wider mb-1", children: "Profile Curve" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Settings2, { size: 14, className: "text-text-ops-muted flex-shrink-0" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "select",
            {
              value: profile,
              onChange: (e) => setProfile(e.target.value),
              className: "px-3 py-1.5 text-sm rounded-lg bg-bg-ops-surface border border-border-ops-subtle text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-sky-400 min-w-[200px]",
              children: PROFILE_CURVES.map((curve) => /* @__PURE__ */ jsxRuntimeExports.jsxs("option", { value: curve.value, children: [
                curve.label,
                " — ",
                curve.description
              ] }, curve.value))
            }
          )
        ] })
      ] }),
      overrunDetected && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 14, className: "text-red-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-semibold text-red-400", children: "Fiscal overrun detected — review tranches below" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto p-6 space-y-8", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        CostCurveCanvas,
        {
          bac: selectedTask.bac,
          startDate: fyRangeStart,
          endDate: fyRangeEnd,
          profile,
          weibullParams,
          onWeibullParamsChange: setWeibullParams,
          showMonthlyBars: true
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        FiscalTrancheBar,
        {
          tranches: fiscalTranches,
          bac: selectedTask.bac,
          onOverrunDetected: handleOverrunDetected
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-3 border-t border-border-ops-subtle bg-bg-ops-overlay/50 text-xs text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        "Selected: ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono", children: selectedTask.code }),
        " ·",
        " ",
        selectedTask.name
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        "Profile: ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono", children: profile }),
        " ·",
        " ",
        fyType,
        " Fiscal Year · ",
        fiscalTranches.length,
        " tranches"
      ] })
    ] })
  ] });
};
export {
  CostSpreadingView as default
};
//# sourceMappingURL=CostSpreadingView-CHSFZa6W.js.map
