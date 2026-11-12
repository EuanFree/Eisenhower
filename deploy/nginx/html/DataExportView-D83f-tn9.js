import { r as reactExports, b as api, j as jsxRuntimeExports, a2 as Download, X, b4 as Image, c as clsx, $ as FileText, a5 as Presentation, ad as Settings, z as TrendingUp, T as TriangleAlert, B as BarChart3, k as Calendar, w as LayoutDashboard, x as LoaderCircle, R as React, aZ as Database } from "./index-DwHrkWl2.js";
const VIEW_TYPES = [
  { value: "dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { value: "gantt", label: "Gantt Chart", icon: "Calendar" },
  { value: "cockpit", label: "Daily Cockpit", icon: "Settings" },
  { value: "wbs", label: "WBS", icon: "LayoutDashboard" },
  { value: "risk", label: "Risk Matrix", icon: "AlertTriangle" },
  { value: "evm", label: "EVM", icon: "TrendingUp" },
  { value: "procurement", label: "Procurement", icon: "BarChart3" },
  { value: "reserves", label: "Reserves", icon: "BarChart3" },
  { value: "facilities", label: "Facilities", icon: "LayoutDashboard" },
  { value: "equipment", label: "Equipment", icon: "Settings" },
  { value: "engineering", label: "Engineering", icon: "Settings" },
  { value: "commercial", label: "Commercial", icon: "BarChart3" },
  { value: "materials", label: "Materials", icon: "LayoutDashboard" },
  { value: "schedule", label: "Schedule", icon: "Calendar" },
  { value: "calendars", label: "Calendars", icon: "Calendar" },
  { value: "costing", label: "Costing", icon: "TrendingUp" },
  { value: "cdrl", label: "CDRL", icon: "FileText" },
  { value: "subcontractors", label: "Subcontractors", icon: "LayoutDashboard" },
  { value: "supplier", label: "Supplier Portal", icon: "LayoutDashboard" },
  { value: "audit", label: "Audit", icon: "Settings" },
  { value: "merkle", label: "Merkle Sync", icon: "Settings" },
  { value: "spatial", label: "Spatial", icon: "LayoutDashboard" },
  { value: "currency", label: "Currency", icon: "TrendingUp" }
];
const ICON_MAP = {
  LayoutDashboard,
  Calendar,
  BarChart3,
  AlertTriangle: TriangleAlert,
  TrendingUp,
  Settings,
  Image,
  FileText,
  Presentation
};
const ExportModal = ({
  isOpen,
  onClose,
  projectId,
  dashboardId
}) => {
  const [mode, setMode] = reactExports.useState("view");
  const [viewType, setViewType] = reactExports.useState("dashboard");
  const [format, setFormat] = reactExports.useState("png");
  const [templateType, setTemplateType] = reactExports.useState("programme_status");
  const [templates, setTemplates] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(false);
  const [exporting, setExporting] = reactExports.useState(false);
  const [titleOverride, setTitleOverride] = reactExports.useState("");
  const [includeClassification, setIncludeClassification] = reactExports.useState(true);
  reactExports.useEffect(() => {
    if (mode === "report" && templates.length === 0) {
      setLoading(true);
      api.get("/v1/export/templates").then((res) => {
        var _a;
        if ((_a = res.data) == null ? void 0 : _a.templates) {
          setTemplates(res.data.templates);
          if (res.data.templates.length > 0) {
            setTemplateType(res.data.templates[0].template_type);
          }
        }
      }).catch(() => {
      }).finally(() => setLoading(false));
    }
  }, [mode, templates.length]);
  const handleExport = reactExports.useCallback(async () => {
    setExporting(true);
    try {
      let response;
      if (mode === "view") {
        response = await api.post("/v1/export/view", {
          view_type: viewType,
          format,
          project_id: projectId || void 0,
          dashboard_id: dashboardId || void 0,
          include_classification: includeClassification,
          title_override: titleOverride || void 0
        }, {
          responseType: "blob"
        });
      } else {
        response = await api.post("/v1/export/report", {
          template_type: templateType,
          format,
          project_id: projectId || void 0,
          title_override: titleOverride || void 0,
          include_export_disclaimer: true
        }, {
          responseType: "blob"
        });
      }
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const disposition = response.headers["content-disposition"];
      let filename = `export_${Date.now()}.${format}`;
      if (disposition) {
        const filenameMatch = disposition.match(/filename="?(.+)"?$/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Please try again.");
    }
    setExporting(false);
  }, [mode, viewType, format, templateType, projectId, dashboardId, includeClassification, titleOverride, onClose]);
  if (!isOpen) return null;
  const currentTemplate = templates.find((t) => t.template_type === templateType);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "fixed inset-0 z-50 flex items-center justify-center", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "absolute inset-0 bg-black/50 backdrop-blur-sm",
        onClick: onClose
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative bg-bg-ops-surface rounded-lg shadow-2xl border border-border-ops-strong w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Download, { className: "w-5 h-5 text-blue-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold text-text-ops-primary", children: "Export" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: onClose,
            className: "p-1 rounded hover:bg-bg-ops-hover text-text-ops-muted hover:text-text-ops-primary transition-colors",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "w-5 h-5" })
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto p-6 space-y-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium text-text-ops-muted mb-2 block", children: "Export Type" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                onClick: () => setMode("view"),
                className: clsx(
                  "px-4 py-3 rounded-lg text-sm font-medium transition-colors border",
                  mode === "view" ? "bg-blue-600/10 border-blue-500/50 text-blue-400" : "bg-bg-ops-muted border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary"
                ),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-center gap-2", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(Image, { className: "w-4 h-4" }),
                    "View Export"
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs mt-1 opacity-70", children: "Export current view to PNG or PPTX" })
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                onClick: () => setMode("report"),
                className: clsx(
                  "px-4 py-3 rounded-lg text-sm font-medium transition-colors border",
                  mode === "report" ? "bg-blue-600/10 border-blue-500/50 text-blue-400" : "bg-bg-ops-muted border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary"
                ),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-center gap-2", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "w-4 h-4" }),
                    "Template Report"
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs mt-1 opacity-70", children: "Generate Word or PowerPoint report" })
                ]
              }
            )
          ] })
        ] }),
        mode === "view" && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium text-text-ops-muted mb-2 block", children: "View Type" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-4 gap-2 max-h-48 overflow-auto", children: VIEW_TYPES.map((vt) => {
              const Icon = ICON_MAP[vt.icon] || LayoutDashboard;
              return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  onClick: () => setViewType(vt.value),
                  className: clsx(
                    "px-3 py-2 rounded-lg text-xs font-medium transition-colors border text-center",
                    viewType === vt.value ? "bg-blue-600/10 border-blue-500/50 text-blue-400" : "bg-bg-ops-muted border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary"
                  ),
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: "w-4 h-4 mx-auto mb-1" }),
                    vt.label
                  ]
                },
                vt.value
              );
            }) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium text-text-ops-muted mb-2 block", children: "Format" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  onClick: () => setFormat("png"),
                  className: clsx(
                    "px-4 py-3 rounded-lg text-sm font-medium transition-colors border flex items-center justify-center gap-2",
                    format === "png" ? "bg-blue-600/10 border-blue-500/50 text-blue-400" : "bg-bg-ops-muted border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary"
                  ),
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(Image, { className: "w-4 h-4" }),
                    "PNG Image"
                  ]
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  onClick: () => setFormat("pptx"),
                  className: clsx(
                    "px-4 py-3 rounded-lg text-sm font-medium transition-colors border flex items-center justify-center gap-2",
                    format === "pptx" ? "bg-blue-600/10 border-blue-500/50 text-blue-400" : "bg-bg-ops-muted border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary"
                  ),
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(Presentation, { className: "w-4 h-4" }),
                    "PowerPoint"
                  ]
                }
              )
            ] })
          ] })
        ] }),
        mode === "report" && /* @__PURE__ */ jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center py-8", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-6 h-6 animate-spin text-blue-400" }) }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium text-text-ops-muted mb-2 block", children: "Report Template" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "select",
              {
                value: templateType,
                onChange: (e) => setTemplateType(e.target.value),
                className: "w-full bg-bg-ops-muted border border-border-ops-strong rounded-lg px-3 py-2 text-sm text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50",
                children: templates.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: t.template_type, children: t.name }, t.template_type))
              }
            ),
            currentTemplate && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs text-text-ops-muted", children: currentTemplate.description })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium text-text-ops-muted mb-2 block", children: "Format" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  onClick: () => setFormat("docx"),
                  className: clsx(
                    "px-4 py-3 rounded-lg text-sm font-medium transition-colors border flex items-center justify-center gap-2",
                    format === "docx" ? "bg-blue-600/10 border-blue-500/50 text-blue-400" : "bg-bg-ops-muted border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary"
                  ),
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "w-4 h-4" }),
                    "Word Document"
                  ]
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  onClick: () => setFormat("pptx"),
                  className: clsx(
                    "px-4 py-3 rounded-lg text-sm font-medium transition-colors border flex items-center justify-center gap-2",
                    format === "pptx" ? "bg-blue-600/10 border-blue-500/50 text-blue-400" : "bg-bg-ops-muted border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary"
                  ),
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(Presentation, { className: "w-4 h-4" }),
                    "PowerPoint"
                  ]
                }
              )
            ] })
          ] }),
          currentTemplate && currentTemplate.sections.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "text-sm font-medium text-text-ops-muted mb-2 block", children: [
              "Sections (",
              currentTemplate.sections.length,
              ")"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-1", children: currentTemplate.sections.map((section) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                className: "px-2 py-1 bg-bg-ops-muted rounded text-xs text-text-ops-muted",
                children: section.replace(/_/g, " ")
              },
              section
            )) })
          ] })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium text-text-ops-muted mb-1 block", children: "Title (optional)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "text",
                value: titleOverride,
                onChange: (e) => setTitleOverride(e.target.value),
                placeholder: "Leave empty for auto-generated title",
                className: "w-full bg-bg-ops-muted border border-border-ops-strong rounded-lg px-3 py-2 text-sm text-text-ops-primary placeholder:text-text-ops-muted/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              }
            )
          ] }),
          mode === "view" && /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-2 cursor-pointer", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "checkbox",
                checked: includeClassification,
                onChange: (e) => setIncludeClassification(e.target.checked),
                className: "rounded border-border-ops-strong bg-bg-ops-muted text-blue-600 focus:ring-blue-500/50"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-text-ops-muted", children: "Include classification stamps" })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-end gap-3 px-6 py-4 border-t border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: onClose,
            className: "px-4 py-2 text-sm rounded-lg border border-border-ops-strong text-text-ops-muted hover:text-text-ops-primary transition-colors",
            children: "Cancel"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: handleExport,
            disabled: exporting || loading,
            className: "flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
            children: exporting ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-4 h-4 animate-spin" }),
              "Exporting..."
            ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Download, { className: "w-4 h-4" }),
              "Export"
            ] })
          }
        )
      ] })
    ] })
  ] });
};
const DataExportView = () => {
  const [formats, setFormats] = reactExports.useState([]);
  const [format, setFormat] = reactExports.useState("csv");
  const [exporting, setExporting] = reactExports.useState(false);
  const [showExportModal, setShowExportModal] = reactExports.useState(false);
  React.useEffect(() => {
    api.get("/admin/data/formats").then((d) => setFormats(d.data || ["csv", "json", "excel"])).catch(() => {
    });
  }, []);
  const handleDataExport = async () => {
    setExporting(true);
    try {
      await api.post("/admin/data/export", null, { params: { format } });
      alert("Export started");
    } catch (err) {
      console.error(err);
    }
    setExporting(false);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Download, { className: "w-6 h-6 text-blue-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Export Center" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Export views, generate reports, and manage data" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => setShowExportModal(true),
          className: "flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Download, { className: "w-4 h-4" }),
            "Export View or Report"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-6", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-4xl space-y-8", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-medium text-text-ops-muted mb-4", children: "Quick Export" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => setShowExportModal(true),
              className: "flex flex-col items-start p-4 bg-bg-ops-surface border border-border-ops-subtle rounded-lg hover:border-blue-500/50 transition-colors group",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-2 bg-blue-600/10 rounded-lg mb-3 group-hover:bg-blue-600/20 transition-colors", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Image, { className: "w-5 h-5 text-blue-400" }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-medium text-text-ops-primary mb-1", children: "Export View" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: "Export any GUI view to PNG image or PowerPoint slide" })
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => setShowExportModal(true),
              className: "flex flex-col items-start p-4 bg-bg-ops-surface border border-border-ops-subtle rounded-lg hover:border-blue-500/50 transition-colors group",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-2 bg-blue-600/10 rounded-lg mb-3 group-hover:bg-blue-600/20 transition-colors", children: /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "w-5 h-5 text-blue-400" }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-medium text-text-ops-primary mb-1", children: "Word Report" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: "Generate template-based reports in Word format" })
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => setShowExportModal(true),
              className: "flex flex-col items-start p-4 bg-bg-ops-surface border border-border-ops-subtle rounded-lg hover:border-blue-500/50 transition-colors group",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-2 bg-blue-600/10 rounded-lg mb-3 group-hover:bg-blue-600/20 transition-colors", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Presentation, { className: "w-5 h-5 text-blue-400" }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-medium text-text-ops-primary mb-1", children: "PowerPoint Report" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: "Generate template-based reports in PowerPoint format" })
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-sm font-medium text-text-ops-muted mb-4 flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Database, { className: "w-4 h-4" }),
          "Database Data Export"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-md space-y-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm text-text-ops-muted", children: "Export Format" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "select",
              {
                value: format,
                onChange: (e) => setFormat(e.target.value),
                className: "w-full mt-1 bg-bg-ops-muted border border-border-ops-strong rounded-lg px-3 py-2 text-sm text-text-ops-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50",
                children: formats.map((f) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: f, children: f.toUpperCase() }, f))
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: handleDataExport,
              disabled: exporting,
              className: "flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Download, { className: "w-4 h-4" }),
                exporting ? "Exporting..." : "Export Database Data"
              ]
            }
          )
        ] }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-medium text-text-ops-muted mb-4", children: "Export Options" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-medium text-text-ops-primary mb-2", children: "View Export" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "text-xs text-text-ops-muted space-y-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "• Export any GUI view as PNG image" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "• Export views as PowerPoint slides" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "• Includes classification stamps" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "• Supports 20+ view types" })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-medium text-text-ops-primary mb-2", children: "Template Reports" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "text-xs text-text-ops-muted space-y-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "• Programme Status Reports" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "• Executive Summaries" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "• Risk Registers" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "• EVM Reports and more" })
            ] })
          ] })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ExportModal,
      {
        isOpen: showExportModal,
        onClose: () => setShowExportModal(false)
      }
    )
  ] });
};
export {
  DataExportView as default
};
//# sourceMappingURL=DataExportView-D83f-tn9.js.map
