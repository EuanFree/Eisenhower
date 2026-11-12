import { r as reactExports, b as api, j as jsxRuntimeExports, D as Shield, X, k as Calendar, d as CircleCheck, c as clsx, i as CircleAlert, x as LoaderCircle, a2 as Download, a3 as Grid3x3, A as Activity, z as TrendingUp, B as BarChart3, R as React, a4 as FolderTree, a5 as Presentation, F as Filter, a6 as Table2, a7 as Building2, a8 as GitCommitHorizontal, a9 as TrendingDown, aa as FileSpreadsheet, ab as Eye, $ as FileText, f as ChevronDown, g as ChevronRight } from "./index-DwHrkWl2.js";
const BRIEFING_SLIDES = [
  {
    slide_number: 1,
    title: "Executive Program Health",
    description: "CPI/SPI dials, RAG status indicators, and overall programme health summary.",
    icon: "BarChart3"
  },
  {
    slide_number: 2,
    title: "Comparative Gantt Snapshot",
    description: "Top-level WBS nodes with live forecast bars, B₀ baseline tracks, and jagged status drop line.",
    icon: "Calendar"
  },
  {
    slide_number: 3,
    title: "Cumulative EVM S-Curve",
    description: "Historical and projected PV, EV, and AC curves through contract completion.",
    icon: "TrendingUp"
  },
  {
    slide_number: 4,
    title: "Monte Carlo Tornado Chart",
    description: "Top 5 schedule drivers ranked by Monte Carlo Criticality Index.",
    icon: "Activity"
  },
  {
    slide_number: 5,
    title: "5×5 Program Risk Matrix",
    description: "Active risks plotted by likelihood vs consequence with mitigation owners.",
    icon: "Grid3X3"
  }
];
const ICON_MAP = {
  BarChart3,
  Calendar,
  TrendingUp,
  Activity,
  Grid3X3: Grid3x3
};
const BriefingExportModal = ({
  isOpen,
  onClose,
  projectId,
  statusDate,
  programmeName,
  classificationOverride
}) => {
  const [selectedSlides, setSelectedSlides] = reactExports.useState(
    /* @__PURE__ */ new Set([1, 2, 3, 4, 5])
  );
  const [includeDisclaimer, setIncludeDisclaimer] = reactExports.useState(true);
  const [isGenerating, setIsGenerating] = reactExports.useState(false);
  const [generationResult, setGenerationResult] = reactExports.useState(null);
  const [error, setError] = reactExports.useState(null);
  const toggleSlide = reactExports.useCallback((slideNumber) => {
    setSelectedSlides((prev) => {
      const next = new Set(prev);
      if (next.has(slideNumber)) {
        next.delete(slideNumber);
      } else {
        next.add(slideNumber);
      }
      return next;
    });
  }, []);
  const selectAllSlides = reactExports.useCallback(() => {
    setSelectedSlides(/* @__PURE__ */ new Set([1, 2, 3, 4, 5]));
  }, []);
  const deselectAllSlides = reactExports.useCallback(() => {
    setSelectedSlides(/* @__PURE__ */ new Set());
  }, []);
  const handleGenerate = reactExports.useCallback(async () => {
    var _a, _b;
    if (selectedSlides.size === 0) {
      setError("Please select at least one slide to include.");
      return;
    }
    setIsGenerating(true);
    setError(null);
    setGenerationResult(null);
    try {
      const request = {
        project_id: projectId,
        status_date: statusDate,
        slide_selection: Array.from(selectedSlides).sort((a, b) => a - b),
        include_export_disclaimer: includeDisclaimer,
        ...classificationOverride && { classification_override: classificationOverride },
        ...programmeName && { title_override: programmeName }
      };
      const response = await api.post("/api/v1/reports/briefing/generate-deck", request, {
        responseType: "blob"
      });
      const deckId = response.headers["x-deck-id"] || `deck-${Date.now()}`;
      const title = response.headers["x-deck-title"] || "Executive Briefing Deck";
      const classification = response.headers["x-classification"] || "OFFICIAL-SENSITIVE";
      const result = {
        deck_id: deckId,
        title,
        slide_count: selectedSlides.size,
        slides: Array.from(selectedSlides).map((num) => {
          const def = BRIEFING_SLIDES.find((s) => s.slide_number === num);
          return {
            slide_number: num,
            slide_title: (def == null ? void 0 : def.title) || `Slide ${num}`,
            data_points: 0
          };
        }),
        file_size_bytes: response.data.size,
        classification,
        generated_at: (/* @__PURE__ */ new Date()).toISOString(),
        message: `Briefing deck generated with ${selectedSlides.size} slides.`
      };
      setGenerationResult(result);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${title.replace(/[^a-zA-Z0-9]/g, "_")}_${statusDate}.pptx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const message = ((_b = (_a = err == null ? void 0 : err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || (err == null ? void 0 : err.message) || "Failed to generate briefing deck.";
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }, [selectedSlides, projectId, statusDate, includeDisclaimer, classificationOverride, programmeName]);
  const handleClose = reactExports.useCallback(() => {
    setIsGenerating(false);
    setGenerationResult(null);
    setError(null);
    setSelectedSlides(/* @__PURE__ */ new Set([1, 2, 3, 4, 5]));
    setIncludeDisclaimer(true);
    onClose();
  }, [onClose]);
  if (!isOpen) return null;
  const getIcon = (iconName) => {
    const IconComponent = ICON_MAP[iconName];
    return IconComponent ? /* @__PURE__ */ jsxRuntimeExports.jsx(IconComponent, { className: "w-5 h-5" }) : null;
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: "fixed inset-0 z-50 flex items-center justify-center",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "briefing-modal-title",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: "absolute inset-0 bg-black/60 backdrop-blur-sm",
            onClick: handleClose,
            "aria-hidden": "true"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative w-full max-w-2xl mx-4 bg-bg-ops-surface border border-border-ops-strong rounded-lg shadow-2xl max-h-[90vh] flex flex-col", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-6 h-6 text-cls-secret" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "h2",
                  {
                    id: "briefing-modal-title",
                    className: "text-lg font-semibold text-text-ops-primary",
                    children: "Executive Briefing Deck"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: "Generate classification-stamped .pptx presentation" })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: handleClose,
                className: "p-2 rounded-md text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors",
                "aria-label": "Close modal",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "w-5 h-5" })
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-y-auto px-6 py-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-4 px-3 py-2 bg-red-900/20 border border-red-800/50 rounded-md", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-4 h-4 text-red-400" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-mono font-bold text-red-400", children: classificationOverride || "OFFICIAL-SENSITIVE // UK EYES ONLY" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted mt-1", children: "Every slide will be stamped with this classification marking." })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-4 flex items-center gap-2 text-sm text-text-ops-muted", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { className: "w-4 h-4" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                "Status Date: ",
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-text-ops-primary", children: statusDate })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-4", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-3", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-semibold text-text-ops-primary", children: "Slide Selection" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: selectAllSlides,
                      className: "text-xs text-text-ops-muted hover:text-text-ops-primary transition-colors",
                      children: "Select All"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "/" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: deselectAllSlides,
                      className: "text-xs text-text-ops-muted hover:text-text-ops-primary transition-colors",
                      children: "Deselect All"
                    }
                  )
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: BRIEFING_SLIDES.map((slide) => {
                const isSelected = selectedSlides.has(slide.slide_number);
                return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "button",
                  {
                    type: "button",
                    onClick: () => toggleSlide(slide.slide_number),
                    className: clsx(
                      "w-full flex items-start gap-3 p-3 rounded-md border transition-colors text-left",
                      isSelected ? "bg-bg-ops-overlay border-border-ops-strong" : "bg-transparent border-border-ops-subtle opacity-60 hover:opacity-80"
                    ),
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(
                        "div",
                        {
                          className: clsx(
                            "mt-0.5 flex-shrink-0 w-5 h-5 rounded flex items-center justify-center border transition-colors",
                            isSelected ? "bg-blue-600 border-blue-600" : "border-border-ops-subtle"
                          ),
                          children: isSelected && /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-4 h-4 text-white" })
                        }
                      ),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-0.5 flex-shrink-0 text-text-ops-muted", children: getIcon(slide.icon) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
                        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-mono text-text-ops-muted", children: [
                            "Slide ",
                            slide.slide_number
                          ] }),
                          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium text-text-ops-primary truncate", children: slide.title })
                        ] }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted mt-0.5 line-clamp-2", children: slide.description })
                      ] })
                    ]
                  },
                  slide.slide_number
                );
              }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-text-ops-muted mt-2", children: [
                selectedSlides.size,
                " of 5 slides selected"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mb-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                type: "button",
                onClick: () => setIncludeDisclaimer((prev) => !prev),
                className: clsx(
                  "w-full flex items-center gap-3 p-3 rounded-md border transition-colors text-left",
                  includeDisclaimer ? "bg-bg-ops-overlay border-border-ops-strong" : "bg-transparent border-border-ops-subtle"
                ),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "div",
                    {
                      className: clsx(
                        "flex-shrink-0 w-5 h-5 rounded flex items-center justify-center border transition-colors",
                        includeDisclaimer ? "bg-blue-600 border-blue-600" : "border-border-ops-subtle"
                      ),
                      children: includeDisclaimer && /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-4 h-4 text-white" })
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium text-text-ops-primary", children: "Include Export-Control Disclaimer" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted mt-0.5", children: "Add ITAR/EAR disclaimer on the title slide for export-controlled programmes." })
                  ] })
                ]
              }
            ) }),
            error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-4 p-3 bg-red-900/20 border border-red-800/50 rounded-md flex items-start gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(CircleAlert, { className: "w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-medium text-red-400", children: "Generation Failed" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted mt-0.5", children: error })
              ] })
            ] }),
            generationResult && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-4 p-3 bg-green-900/20 border border-green-800/50 rounded-md flex items-start gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-medium text-green-400", children: "Deck Generated Successfully" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-text-ops-muted mt-0.5", children: [
                  generationResult.message,
                  " (",
                  (generationResult.file_size_bytes / 1024).toFixed(1),
                  " KB)"
                ] })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-end gap-3 px-6 py-4 border-t border-border-ops-subtle", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: handleClose,
                className: "px-4 py-2 text-sm font-medium text-text-ops-muted bg-bg-ops-overlay rounded-md border border-border-ops-subtle hover:text-text-ops-primary transition-colors",
                children: "Cancel"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: handleGenerate,
                disabled: isGenerating || selectedSlides.size === 0,
                className: clsx(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors",
                  isGenerating || selectedSlides.size === 0 ? "bg-bg-ops-overlay text-text-ops-muted cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"
                ),
                children: isGenerating ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-4 h-4 animate-spin" }),
                  "Generating..."
                ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Download, { className: "w-4 h-4" }),
                  "Download Briefing Deck"
                ] })
              }
            )
          ] })
        ] })
      ]
    }
  );
};
const RAG_THRESHOLDS = {
  cpi_green: 1,
  cpi_amber: 0.95
};
function getRagColor(value, isHigherBetter) {
  if (isNaN(value) || value === 0) return "text-text-ops-muted";
  if (isHigherBetter) {
    if (value >= RAG_THRESHOLDS.cpi_green) return "text-green-400";
    if (value >= RAG_THRESHOLDS.cpi_amber) return "text-amber-400";
    return "text-red-400";
  } else {
    if (value <= -1e4) return "text-red-400";
    if (value <= -25e3) return "text-amber-400";
    return "text-green-400";
  }
}
function formatCurrency(value, currency = "GBP") {
  const prefix = currency === "GBP" ? "£" : currency === "USD" ? "$" : "€";
  if (Math.abs(value) >= 1e6) {
    return `${prefix}${(value / 1e6).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1e3) {
    return `${prefix}${(value / 1e3).toFixed(1)}k`;
  }
  return `${prefix}${value.toFixed(0)}`;
}
function formatRatio(value) {
  if (isNaN(value) || value === 0) return "-";
  return value.toFixed(2);
}
const RAGBadge = ({
  value,
  isHigherBetter
}) => {
  const colorClass = getRagColor(value, isHigherBetter);
  const bgColor = colorClass.includes("green") ? "bg-green-900/30 border-green-800/50" : colorClass.includes("amber") ? "bg-amber-900/30 border-amber-800/50" : colorClass.includes("red") ? "bg-red-900/30 border-red-800/50" : "bg-bg-ops-overlay border-border-ops-subtle";
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "span",
    {
      className: clsx(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold border",
        colorClass,
        bgColor
      ),
      children: formatRatio(value)
    }
  );
};
const Format1Preview = ({
  rows,
  currency
}) => {
  if (rows.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "py-8 text-center text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Table2, { className: "w-8 h-8 mx-auto mb-2 opacity-50" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "No WBS data available for the selected period." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs mt-1", children: "Select a project and reporting period to load EVM data." })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "overflow-x-auto", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-xs font-mono", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle text-text-ops-muted", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-3 py-2 font-medium", children: "WBS Code" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-3 py-2 font-medium", children: "Element" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-3 py-2 font-medium", children: "BAC" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-3 py-2 font-medium", children: "PV" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-3 py-2 font-medium", children: "EV" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-3 py-2 font-medium", children: "AC" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-3 py-2 font-medium", children: "CV" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-3 py-2 font-medium", children: "SV" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-center px-3 py-2 font-medium", children: "CPI" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-center px-3 py-2 font-medium", children: "SPI" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-3 py-2 font-medium", children: "EAC" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-3 py-2 font-medium", children: "VAC" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-3 py-2 font-medium", children: "%" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: rows.slice(0, 20).map((row, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "tr",
        {
          className: clsx(
            "border-b border-border-ops-subtle/50 hover:bg-bg-ops-overlay/50 transition-colors",
            row.percent_complete >= 100 && "opacity-60"
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-text-ops-primary", children: row.wbs_element_code }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-text-ops-muted max-w-[200px] truncate", title: row.wbs_element_name, children: row.wbs_element_name }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-right text-text-ops-primary", children: formatCurrency(row.bac, currency) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-right text-text-ops-muted", children: formatCurrency(row.pv, currency) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-right text-text-ops-primary", children: formatCurrency(row.ev, currency) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-right text-text-ops-muted", children: formatCurrency(row.ac, currency) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: clsx("px-3 py-1.5 text-right font-semibold", getRagColor(row.cv, false)), children: formatCurrency(row.cv, currency) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: clsx("px-3 py-1.5 text-right font-semibold", getRagColor(row.sv, false)), children: formatCurrency(row.sv, currency) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RAGBadge, { value: row.cpi, isHigherBetter: true }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RAGBadge, { value: row.spi, isHigherBetter: true }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-right text-text-ops-primary", children: formatCurrency(row.eac, currency) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: clsx("px-3 py-1.5 text-right font-semibold", getRagColor(row.vac, false)), children: formatCurrency(row.vac, currency) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "px-3 py-1.5 text-right text-text-ops-muted", children: [
              row.percent_complete.toFixed(0),
              "%"
            ] })
          ]
        },
        i
      )) })
    ] }),
    rows.length > 20 && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-text-ops-muted px-3 py-2 text-center", children: [
      "Showing 20 of ",
      rows.length,
      " rows. Export full report for complete data."
    ] })
  ] });
};
const Format5Preview = ({
  items,
  currency
}) => {
  if (items.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "py-8 text-center text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingDown, { className: "w-8 h-8 mx-auto mb-2 opacity-50" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "No variance items exceeding thresholds." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs mt-1", children: "Format 5 auto-extracts tasks with CV or SV exceeding ±10% or ±£25k." })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "overflow-x-auto", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-xs font-mono", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle text-text-ops-muted", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-3 py-2 font-medium", children: "WBS Code" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-3 py-2 font-medium", children: "Element" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-3 py-2 font-medium", children: "CV" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-3 py-2 font-medium", children: "SV" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-center px-3 py-2 font-medium", children: "CPI" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-center px-3 py-2 font-medium", children: "SPI" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-3 py-2 font-medium", children: "Problem" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-3 py-2 font-medium", children: "Blockers" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: items.slice(0, 15).map((item, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "tr",
        {
          className: "border-b border-border-ops-subtle/50 hover:bg-bg-ops-overlay/50 transition-colors",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-text-ops-primary", children: item.wbs_element_code }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-text-ops-muted max-w-[150px] truncate", title: item.wbs_element_name, children: item.wbs_element_name }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: clsx("px-3 py-1.5 text-right font-semibold", getRagColor(item.cv, false)), children: formatCurrency(item.cv, currency) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: clsx("px-3 py-1.5 text-right font-semibold", getRagColor(item.sv, false)), children: formatCurrency(item.sv, currency) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RAGBadge, { value: item.cpi, isHigherBetter: true }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(RAGBadge, { value: item.spi, isHigherBetter: true }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-text-ops-muted max-w-[200px] truncate", title: item.problem, children: item.problem }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-right", children: item.active_blockers > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-red-900/30 text-red-400 border border-red-800/50", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(CircleAlert, { className: "w-3 h-3" }),
              item.active_blockers
            ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "-" }) })
          ]
        },
        i
      )) })
    ] }),
    items.length > 15 && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-text-ops-muted px-3 py-2 text-center", children: [
      "Showing 15 of ",
      items.length,
      " variance items. Export full report for complete narratives."
    ] })
  ] });
};
const IPMRFormatCardComponent = ({ formatNumber, title, description, icon, previewData, onExport, exporting, exportError }) => {
  const [showPreview, setShowPreview] = reactExports.useState(false);
  const [expanded, setExpanded] = reactExports.useState(false);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-overlay border border-border-ops-subtle rounded-lg overflow-hidden", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-4 py-3 flex items-start gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-0.5 text-text-ops-muted", children: icon }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "text-sm font-semibold text-text-ops-primary", children: [
            "Format ",
            formatNumber
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-text-ops-muted", children: title })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted mt-0.5", children: description })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-4 pb-3 flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: () => setShowPreview((prev) => !prev),
          className: clsx(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
            showPreview ? "bg-blue-600/20 text-blue-400 border border-blue-800/50" : "bg-bg-ops-surface text-text-ops-muted border border-border-ops-subtle hover:text-text-ops-primary"
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Eye, { className: "w-3.5 h-3.5" }),
            showPreview ? "Hide Preview" : "Preview"
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: () => onExport(formatNumber, "xlsx"),
          disabled: exporting,
          className: "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-green-600/20 text-green-400 border border-green-800/50 hover:bg-green-600/30 transition-colors disabled:opacity-50",
          children: [
            exporting ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-3.5 h-3.5 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(FileSpreadsheet, { className: "w-3.5 h-3.5" }),
            "Excel"
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: () => onExport(formatNumber, "pdf"),
          disabled: exporting,
          className: "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-red-600/20 text-red-400 border border-red-800/50 hover:bg-red-600/30 transition-colors disabled:opacity-50",
          children: [
            exporting ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-3.5 h-3.5 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "w-3.5 h-3.5" }),
            "PDF"
          ]
        }
      )
    ] }),
    exportError && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 pb-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2 p-2 bg-red-900/20 border border-red-800/50 rounded-md", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CircleAlert, { className: "w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-red-400", children: exportError })
    ] }) }),
    showPreview && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => setExpanded((prev) => !prev),
          className: "w-full flex items-center justify-between px-4 py-2 text-xs text-text-ops-muted hover:text-text-ops-primary transition-colors",
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1.5", children: [
            expanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: "w-3.5 h-3.5" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "w-3.5 h-3.5" }),
            expanded ? "Collapse" : "Expand",
            " Preview Table"
          ] })
        }
      ),
      expanded && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t border-border-ops-subtle", children: [
        formatNumber === 1 && (previewData == null ? void 0 : previewData.rows) && /* @__PURE__ */ jsxRuntimeExports.jsx(Format1Preview, { rows: previewData.rows, currency: previewData.currency_code || "GBP" }),
        formatNumber === 5 && (previewData == null ? void 0 : previewData.items) && /* @__PURE__ */ jsxRuntimeExports.jsx(Format5Preview, { items: previewData.items, currency: previewData.currency_code || "GBP" }),
        (formatNumber === 2 || formatNumber === 3) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "py-8 text-center text-text-ops-muted", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Table2, { className: "w-8 h-8 mx-auto mb-2 opacity-50" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "Preview available on export." }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs mt-1", children: [
            "Format ",
            formatNumber,
            " data is best viewed in the exported spreadsheet."
          ] })
        ] })
      ] })
    ] })
  ] });
};
const WBSScopeTree = ({ nodes, selectedId, onSelect }) => {
  const [expandedNodes, setExpandedNodes] = reactExports.useState(/* @__PURE__ */ new Set());
  const toggleExpand = reactExports.useCallback((id) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  const renderNode = (node, depth = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedId === node.id;
    const hasChildren = node.children && node.children.length > 0;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: () => {
            if (hasChildren) toggleExpand(node.id);
            onSelect(node.id, node.name);
          },
          className: clsx(
            "w-full flex items-center gap-2 px-2 py-1.5 text-left rounded-md transition-colors",
            isSelected ? "bg-blue-600/20 text-blue-400" : "text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay"
          ),
          style: { paddingLeft: `${depth * 16 + 8}px` },
          children: [
            hasChildren ? isExpanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: "w-3.5 h-3.5 flex-shrink-0" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "w-3.5 h-3.5 flex-shrink-0" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-3.5 h-3.5 flex-shrink-0" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(FolderTree, { className: "w-4 h-4 flex-shrink-0" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-mono truncate", children: [
              node.code,
              " — ",
              node.name
            ] })
          ]
        }
      ),
      isExpanded && hasChildren && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: node.children.map((child) => renderNode(child, depth + 1)) })
    ] }, node.id);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-0.5 max-h-64 overflow-y-auto", children: nodes.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted px-2 py-4 text-center", children: "No programmes loaded. Select a project to begin." }) : nodes.map((node) => renderNode(node)) });
};
const ReportingWorkbenchView = ({ projectId }) => {
  const today = /* @__PURE__ */ new Date();
  const [statusDate, setStatusDate] = reactExports.useState(today.toISOString().split("T")[0]);
  const [periodLabel, setPeriodLabel] = reactExports.useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
  const [selectedProjectId, setSelectedProjectId] = reactExports.useState(projectId || "");
  const [selectedProjectName, setSelectedProjectName] = reactExports.useState("");
  const [showBriefingModal, setShowBriefingModal] = reactExports.useState(false);
  const [exportingFormat, setExportingFormat] = reactExports.useState(null);
  const [exportErrors, setExportErrors] = reactExports.useState({});
  const [format1Data, setFormat1Data] = reactExports.useState(null);
  const [format5Data, setFormat5Data] = reactExports.useState(null);
  const [wbsScopeTree, setWbsScopeTree] = reactExports.useState([]);
  const loadScopeTree = reactExports.useCallback(async () => {
    try {
      const response = await api.get("/api/v1/wbs/nodes?tree_type=WBS");
      if (response.data && response.data.nodes) {
        const rootNodes = response.data.nodes.filter((n) => n.path && n.path.split(".").length <= 2).map((n) => ({
          id: n.id,
          code: n.code,
          name: n.name,
          path: n.path,
          children: []
        }));
        setWbsScopeTree(rootNodes);
      }
    } catch {
    }
  }, []);
  const loadFormat1Preview = reactExports.useCallback(async () => {
    if (!selectedProjectId) return;
    try {
      const response = await api.get(`/api/v1/reports/evm/ipmr/format1`, {
        params: {
          project_id: selectedProjectId,
          status_date: statusDate
        }
      });
      if (response.data) {
        setFormat1Data(response.data);
      }
    } catch {
    }
  }, [selectedProjectId, statusDate]);
  const loadFormat5Preview = reactExports.useCallback(async () => {
    if (!selectedProjectId) return;
    try {
      const response = await api.get(`/api/v1/reports/evm/ipmr/format5`, {
        params: {
          project_id: selectedProjectId,
          status_date: statusDate
        }
      });
      if (response.data) {
        setFormat5Data(response.data);
      }
    } catch {
    }
  }, [selectedProjectId, statusDate]);
  const handleSelectProject = reactExports.useCallback(
    (id, name) => {
      setSelectedProjectId(id);
      setSelectedProjectName(name);
    },
    []
  );
  const handleExport = reactExports.useCallback(
    async (formatNumber, exportFormat) => {
      var _a, _b;
      if (!selectedProjectId) {
        setExportErrors((prev) => ({
          ...prev,
          [formatNumber]: "Please select a project first."
        }));
        return;
      }
      setExportingFormat(formatNumber);
      setExportErrors((prev) => ({ ...prev, [formatNumber]: void 0 }));
      try {
        const endpoint = formatNumber === 1 ? "/api/v1/reports/evm/ipmr/format1" : formatNumber === 5 ? "/api/v1/reports/evm/ipmr/format5" : `/api/v1/reports/evm/ipmr/format${formatNumber}`;
        const response = await api.get(endpoint, {
          params: {
            project_id: selectedProjectId,
            status_date: statusDate,
            export_format: exportFormat
          },
          responseType: "blob"
        });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement("a");
        link.href = url;
        const fileName = `IPMR_Format${formatNumber}_${periodLabel}.${exportFormat}`;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (err) {
        const message = ((_b = (_a = err == null ? void 0 : err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || (err == null ? void 0 : err.message) || `Failed to export Format ${formatNumber}.`;
        setExportErrors((prev) => ({ ...prev, [formatNumber]: message }));
      } finally {
        setExportingFormat(null);
      }
    },
    [selectedProjectId, statusDate, periodLabel]
  );
  const handleDateChange = reactExports.useCallback((event) => {
    const newDate = event.target.value;
    setStatusDate(newDate);
    const [year, month] = newDate.split("-");
    setPeriodLabel(`${year}-${month}`);
  }, []);
  React.useEffect(() => {
    loadScopeTree();
  }, [loadScopeTree]);
  React.useEffect(() => {
    loadFormat1Preview();
    loadFormat5Preview();
  }, [loadFormat1Preview, loadFormat5Preview]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-xl font-semibold text-text-ops-primary", children: "Reporting Workbench" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted mt-1", children: "Statutory EVM reporting (IPMR/CPR) and executive briefing deck generation." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-6 py-3 border-b border-border-ops-subtle flex items-center gap-6 flex-wrap", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { className: "w-4 h-4 text-text-ops-muted" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { htmlFor: "status-date", className: "block text-xs font-medium text-text-ops-muted", children: "Status Date" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              id: "status-date",
              type: "date",
              value: statusDate,
              onChange: handleDateChange,
              className: "mt-0.5 block w-40 px-3 py-1.5 text-sm font-mono bg-bg-ops-overlay border border-border-ops-subtle rounded-md text-text-ops-primary focus:outline-none focus:ring-1 focus:ring-blue-600"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-mono text-text-ops-muted bg-bg-ops-overlay px-2 py-1 rounded", children: [
          "Period: ",
          periodLabel
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(FolderTree, { className: "w-4 h-4 text-text-ops-muted" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-text-ops-muted", children: "Project / Programme Scope" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-0.5 flex items-center gap-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-mono text-text-ops-primary", children: selectedProjectName || "Select a project..." }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: () => setShowBriefingModal(true),
          disabled: !selectedProjectId,
          className: clsx(
            "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors",
            selectedProjectId ? "bg-purple-600 text-white hover:bg-purple-700" : "bg-bg-ops-overlay text-text-ops-muted cursor-not-allowed"
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Presentation, { className: "w-4 h-4" }),
            "Generate Briefing Deck"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 flex overflow-hidden", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-72 border-r border-border-ops-subtle flex flex-col", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-4 py-3 border-b border-border-ops-subtle flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Filter, { className: "w-4 h-4 text-text-ops-muted" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-semibold text-text-ops-primary", children: "Scope Selector" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-y-auto p-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          WBSScopeTree,
          {
            nodes: wbsScopeTree,
            selectedId: selectedProjectId || null,
            onSelect: handleSelectProject
          }
        ) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-y-auto p-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-6", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold text-text-ops-primary", children: "Statutory EVM Reports (IPMR/CPR)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted mt-1", children: "Export compliant defence programme reports in Excel or PDF/A format." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            IPMRFormatCardComponent,
            {
              formatNumber: 1,
              title: "Work Breakdown Structure",
              description: "Time-phased cost data by WBS element: BCWS/PV, BCWP/EV, ACWP/AC with CV, SV, CPI, SPI, EAC, VAC.",
              icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Table2, { className: "w-5 h-5" }),
              previewData: format1Data,
              onExport: handleExport,
              exporting: exportingFormat === 1,
              exportError: exportErrors[1]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            IPMRFormatCardComponent,
            {
              formatNumber: 2,
              title: "Organizational Breakdown Structure",
              description: "Earned Value performance grouped by functional department and RBS cost centers.",
              icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Building2, { className: "w-5 h-5" }),
              previewData: null,
              onExport: handleExport,
              exporting: exportingFormat === 2,
              exportError: exportErrors[2]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            IPMRFormatCardComponent,
            {
              formatNumber: 3,
              title: "Baseline Changes",
              description: "Audits changes to the Performance Measurement Baseline between reporting cycles.",
              icon: /* @__PURE__ */ jsxRuntimeExports.jsx(GitCommitHorizontal, { className: "w-5 h-5" }),
              previewData: null,
              onExport: handleExport,
              exporting: exportingFormat === 3,
              exportError: exportErrors[3]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            IPMRFormatCardComponent,
            {
              formatNumber: 5,
              title: "Variance Analysis Narrative",
              description: "Auto-extracted tasks exceeding variance thresholds with Problem/Cause/Impact/Corrective Action.",
              icon: /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingDown, { className: "w-5 h-5" }),
              previewData: format5Data,
              onExport: handleExport,
              exporting: exportingFormat === 5,
              exportError: exportErrors[5]
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-8 p-4 bg-bg-ops-overlay border border-border-ops-subtle rounded-lg", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-text-ops-primary mb-3", children: "RAG Threshold Reference" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4 text-xs", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "CPI / SPI " }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold border text-green-400 bg-green-900/30 border-green-800/50", children: "≥ 1.00" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted ml-1", children: "= On Track" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "CPI / SPI " }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold border text-amber-400 bg-amber-900/30 border-amber-800/50", children: "0.95–0.99" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted ml-1", children: "= Watch" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "CPI / SPI " }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold border text-red-400 bg-red-900/30 border-red-800/50", children: "< 0.95" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted ml-1", children: "= Action Required" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "CV / SV " }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold border text-green-400 bg-green-900/30 border-green-800/50", children: "≥ 0" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted ml-1", children: "= Under Budget / Ahead" })
            ] })
          ] })
        ] }),
        !selectedProjectId && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-16 text-center", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(FileSpreadsheet, { className: "w-16 h-16 text-text-ops-muted opacity-30 mb-4" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-semibold text-text-ops-primary mb-2", children: "Select a Project to Begin" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted max-w-md", children: "Choose a programme or project from the scope selector on the left to load EVM data and generate statutory IPMR reports." })
        ] })
      ] })
    ] }),
    selectedProjectId && /* @__PURE__ */ jsxRuntimeExports.jsx(
      BriefingExportModal,
      {
        isOpen: showBriefingModal,
        onClose: () => setShowBriefingModal(false),
        projectId: selectedProjectId,
        statusDate,
        programmeName: selectedProjectName
      }
    )
  ] });
};
export {
  ReportingWorkbenchView as default
};
//# sourceMappingURL=ReportingWorkbenchView-DMPbDsKS.js.map
