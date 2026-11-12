import { r as reactExports, b as api, j as jsxRuntimeExports, ax as DollarSign, v as RefreshCw, aQ as Calculator, z as TrendingUp, B as BarChart3, $ as FileText, c as clsx, K as Plus, am as SquarePen, af as Trash2 } from "./index-DwHrkWl2.js";
const CostingView = ({ projectId }) => {
  const [activeTab, setActiveTab] = reactExports.useState("elements");
  const [costElements, setCostElements] = reactExports.useState([]);
  const [indirectRates, setIndirectRates] = reactExports.useState([]);
  const [cbsRollup, setCBSRollup] = reactExports.useState(null);
  const [loading, setLoading] = reactExports.useState(true);
  const [fiscalYear, setFiscalYear] = reactExports.useState((/* @__PURE__ */ new Date()).getFullYear());
  const [showCreateElement, setShowCreateElement] = reactExports.useState(false);
  const [showCreateRate, setShowCreateRate] = reactExports.useState(false);
  const fetchCostElements = reactExports.useCallback(async () => {
    try {
      const res = await api.get("/costing/elements");
      setCostElements(res.data || []);
    } catch (err) {
      console.error("Failed to fetch cost elements:", err);
    }
  }, []);
  const fetchIndirectRates = reactExports.useCallback(async () => {
    try {
      const res = await api.get("/costing/rates");
      setIndirectRates(res.data || []);
    } catch (err) {
      console.error("Failed to fetch indirect rates:", err);
    }
  }, []);
  const fetchCBSRollup = reactExports.useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await api.get(`/costing/projects/${projectId}/cbs-rollup`, {
        params: { fiscal_year: fiscalYear }
      });
      setCBSRollup(res.data || null);
    } catch (err) {
      console.error("Failed to fetch CBS rollup:", err);
    }
  }, [projectId, fiscalYear]);
  reactExports.useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([
        fetchCostElements(),
        fetchIndirectRates(),
        projectId ? fetchCBSRollup() : Promise.resolve()
      ]);
      setLoading(false);
    };
    loadAll();
  }, [fetchCostElements, fetchIndirectRates, fetchCBSRollup, projectId]);
  const handleCreateElement = async (element) => {
    try {
      const res = await api.post("/costing/elements", element);
      setCostElements((prev) => [...prev, res.data]);
      setShowCreateElement(false);
    } catch (err) {
      console.error("Failed to create cost element:", err);
    }
  };
  const handleDeleteElement = async (id) => {
    try {
      await api.delete(`/costing/elements/${id}`);
      setCostElements((prev) => prev.filter((el) => el.id !== id));
    } catch (err) {
      console.error("Failed to delete cost element:", err);
    }
  };
  const handleCreateRate = async (rate) => {
    try {
      const res = await api.post("/costing/rates", rate);
      setIndirectRates((prev) => [...prev, res.data]);
      setShowCreateRate(false);
    } catch (err) {
      console.error("Failed to create indirect rate:", err);
    }
  };
  const formatCurrency = (value) => new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
  const formatPercent = (value) => `${value.toFixed(2)}%`;
  if (loading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted", children: "Loading costing data..." }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DollarSign, { className: "w-6 h-6 text-emerald-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Costing Workbench" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Cost Breakdown Structure & Financial Management" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        projectId && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "select",
          {
            value: fiscalYear,
            onChange: (e) => setFiscalYear(Number(e.target.value)),
            className: "bg-bg-ops-surface border border-border-ops-strong rounded px-2 py-1 text-sm text-text-ops-primary",
            children: [2024, 2025, 2026, 2027, 2028].map((year) => /* @__PURE__ */ jsxRuntimeExports.jsxs("option", { value: year, children: [
              "FY",
              year
            ] }, year))
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => {
              fetchCostElements();
              fetchIndirectRates();
              if (projectId) fetchCBSRollup();
            },
            className: "p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors",
            title: "Refresh data",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-4 h-4" })
          }
        )
      ] })
    ] }),
    cbsRollup && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-4 px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-text-ops-muted text-sm mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Calculator, { className: "w-4 h-4" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Direct Cost" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-text-ops-primary", children: formatCurrency(cbsRollup.grand_total_direct) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-text-ops-muted text-sm mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingUp, { className: "w-4 h-4 text-emerald-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Burdened Cost" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-text-ops-primary", children: formatCurrency(cbsRollup.grand_total_burdened) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-text-ops-muted text-sm mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(BarChart3, { className: "w-4 h-4 text-amber-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Burden Amount" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-amber-400", children: formatCurrency(cbsRollup.grand_total_burden) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 px-6 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => setActiveTab("elements"),
          className: clsx(
            "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
            activeTab === "elements" ? "border-blue-400 text-blue-400" : "border-transparent text-text-ops-muted hover:text-text-ops-primary"
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "w-4 h-4 inline mr-2" }),
            "Cost Elements"
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => setActiveTab("rates"),
          className: clsx(
            "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
            activeTab === "rates" ? "border-blue-400 text-blue-400" : "border-transparent text-text-ops-muted hover:text-text-ops-primary"
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Calculator, { className: "w-4 h-4 inline mr-2" }),
            "Indirect Rates"
          ]
        }
      ),
      projectId && /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => setActiveTab("rollup"),
          className: clsx(
            "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
            activeTab === "rollup" ? "border-blue-400 text-blue-400" : "border-transparent text-text-ops-muted hover:text-text-ops-primary"
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(BarChart3, { className: "w-4 h-4 inline mr-2" }),
            "CBS Rollup"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto p-6", children: [
      activeTab === "elements" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-base font-medium text-text-ops-primary", children: [
            "CBS Taxonomy — ",
            costElements.length,
            " elements"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => setShowCreateElement(true),
              className: "flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "w-4 h-4" }),
                "New Element"
              ]
            }
          )
        ] }),
        showCreateElement && /* @__PURE__ */ jsxRuntimeExports.jsx(
          CreateCostElementForm,
          {
            onSubmit: handleCreateElement,
            onCancel: () => setShowCreateElement(false)
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle text-text-ops-muted", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Code" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Name" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Category" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Created" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-2 px-3 font-medium", children: "Actions" })
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("tbody", { children: [
            costElements.map((el) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "tr",
              {
                className: "border-b border-border-ops-subtle hover:bg-bg-ops-overlay transition-colors",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: el.code }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-primary", children: el.name }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 bg-bg-ops-overlay rounded text-xs text-text-ops-muted", children: el.category }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted text-xs", children: el.created_at ? new Date(el.created_at).toLocaleDateString() : "—" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-right", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-end gap-1", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "button",
                      {
                        onClick: () => {
                          alert(`Edit ${el.code}`);
                        },
                        className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-blue-400 transition-colors",
                        title: "Edit",
                        children: /* @__PURE__ */ jsxRuntimeExports.jsx(SquarePen, { className: "w-3.5 h-3.5" })
                      }
                    ),
                    /* @__PURE__ */ jsxRuntimeExports.jsx(
                      "button",
                      {
                        onClick: () => handleDeleteElement(el.id),
                        className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-red-400 transition-colors",
                        title: "Delete",
                        children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "w-3.5 h-3.5" })
                      }
                    )
                  ] }) })
                ]
              },
              el.id
            )),
            costElements.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("td", { colSpan: 5, className: "py-8 text-center text-text-ops-muted", children: "No cost elements defined. Create one to get started." }) })
          ] })
        ] }) })
      ] }),
      activeTab === "rates" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-base font-medium text-text-ops-primary", children: [
            "FPRA Rate Structures — ",
            indirectRates.length,
            " records"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => setShowCreateRate(true),
              className: "flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "w-4 h-4" }),
                "New Rate Structure"
              ]
            }
          )
        ] }),
        showCreateRate && /* @__PURE__ */ jsxRuntimeExports.jsx(
          CreateIndirectRateForm,
          {
            onSubmit: handleCreateRate,
            onCancel: () => setShowCreateRate(false)
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-4", children: [
          indirectRates.map((rate) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: "bg-bg-ops-surface rounded-lg border border-border-ops-subtle p-4",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-3", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-lg font-semibold text-text-ops-primary", children: [
                      "FY",
                      rate.fiscal_year
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 bg-bg-ops-overlay rounded text-xs text-text-ops-muted", children: rate.currency_code })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      onClick: () => {
                        alert(`Edit FY${rate.fiscal_year}`);
                      },
                      className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-blue-400 transition-colors",
                      title: "Edit",
                      children: /* @__PURE__ */ jsxRuntimeExports.jsx(SquarePen, { className: "w-3.5 h-3.5" })
                    }
                  )
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-4 gap-4", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted mb-1", children: "Fringe Rate" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-base font-mono text-text-ops-primary", children: formatPercent(rate.fringe_rate_percent) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted mb-1", children: "Overhead Rate" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-base font-mono text-text-ops-primary", children: formatPercent(rate.overhead_rate_percent) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted mb-1", children: "G&A Rate" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-base font-mono text-text-ops-primary", children: formatPercent(rate.ga_rate_percent) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted mb-1", children: "Fee / Profit" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-base font-mono text-emerald-400", children: formatPercent(rate.fee_profit_percent) })
                  ] })
                ] })
              ]
            },
            rate.id
          )),
          indirectRates.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "py-8 text-center text-text-ops-muted", children: "No indirect rate structures defined. Create one to enable burdening calculations." })
        ] })
      ] }),
      activeTab === "rollup" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-base font-medium text-text-ops-primary mb-4", children: [
          "CBS Financial Rollup — FY",
          fiscalYear
        ] }),
        cbsRollup ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-4", children: cbsRollup.levels.map((level) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: "bg-bg-ops-surface rounded-lg border border-border-ops-subtle overflow-hidden",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 py-3 border-b border-border-ops-subtle bg-bg-ops-overlay", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-sm text-text-ops-muted mr-2", children: level.code }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-primary font-medium", children: level.name })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-6 text-sm", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-right", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted text-xs", children: "Direct" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-mono text-text-ops-primary", children: formatCurrency(level.direct_cost) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-right", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted text-xs", children: "Burdened" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-mono text-emerald-400", children: formatCurrency(level.burdened_cost) })
                  ] })
                ] })
              ] }) }),
              level.categories.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle text-text-ops-muted", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-4 font-medium", children: "Category" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-2 px-4 font-medium", children: "Direct Cost" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-2 px-4 font-medium", children: "Burdened Cost" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-2 px-4 font-medium", children: "Burden" })
                ] }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: level.categories.map((cat) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "tr",
                  {
                    className: "border-b border-border-ops-subtle hover:bg-bg-ops-overlay transition-colors",
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-4 text-text-ops-primary", children: cat.category }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-4 text-right font-mono text-text-ops-primary", children: formatCurrency(cat.direct_cost) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-4 text-right font-mono text-emerald-400", children: formatCurrency(cat.burdened_cost) }),
                      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-4 text-right font-mono text-amber-400", children: formatCurrency(cat.burden_amount) })
                    ]
                  },
                  cat.category
                )) })
              ] })
            ]
          },
          `${level.level}-${level.code}`
        )) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "py-8 text-center text-text-ops-muted", children: projectId ? "No CBS rollup data available for this project." : "Select a project to view CBS rollup." })
      ] })
    ] })
  ] });
};
const CreateCostElementForm = ({ onSubmit, onCancel }) => {
  const [code, setCode] = reactExports.useState("");
  const [name, setName] = reactExports.useState("");
  const [category, setCategory] = reactExports.useState("LABOR_DIRECT");
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!code || !name) return;
    onSubmit({ code, name, category });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "form",
    {
      onSubmit: handleSubmit,
      className: "mb-4 p-4 bg-bg-ops-surface rounded-lg border border-blue-500/30",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-medium text-text-ops-primary mb-3", children: "New Cost Element" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-3 mb-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Code" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "text",
                value: code,
                onChange: (e) => setCode(e.target.value.toUpperCase()),
                placeholder: "e.g. LABOR_DIRECT",
                className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
                required: true
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Name" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "text",
                value: name,
                onChange: (e) => setName(e.target.value),
                placeholder: "e.g. Direct Labour",
                className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
                required: true
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Category" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "select",
              {
                value: category,
                onChange: (e) => setCategory(e.target.value),
                className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "LABOR_DIRECT", children: "Direct Labour" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "SUBCONTRACT", children: "Subcontract" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "MATERIAL_RAW", children: "Raw Material" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "MATERIAL_COTS", children: "COTS Material" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "ODC_TRAVEL", children: "ODC — Travel" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "ODC_SUBSISTENCE", children: "ODC — Subsistence" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "ODC_OTHER", children: "ODC — Other" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "EQUIPMENT", children: "Equipment" })
                ]
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 justify-end", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: onCancel,
              className: "px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary transition-colors",
              children: "Cancel"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "submit",
              className: "px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors",
              children: "Create"
            }
          )
        ] })
      ]
    }
  );
};
const CreateIndirectRateForm = ({ onSubmit, onCancel }) => {
  const [fiscalYear, setFiscalYear] = reactExports.useState((/* @__PURE__ */ new Date()).getFullYear());
  const [currencyCode, setCurrencyCode] = reactExports.useState("GBP");
  const [fringeRate, setFringeRate] = reactExports.useState(25);
  const [overheadRate, setOverheadRate] = reactExports.useState(15);
  const [gaRate, setGaRate] = reactExports.useState(10);
  const [feeProfit, setFeeProfit] = reactExports.useState(5);
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      fiscal_year: fiscalYear,
      currency_code: currencyCode,
      fringe_rate_percent: fringeRate,
      overhead_rate_percent: overheadRate,
      ga_rate_percent: gaRate,
      fee_profit_percent: feeProfit
    });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "form",
    {
      onSubmit: handleSubmit,
      className: "mb-4 p-4 bg-bg-ops-surface rounded-lg border border-blue-500/30",
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-medium text-text-ops-primary mb-3", children: "New FPRA Rate Structure" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-4 gap-3 mb-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Fiscal Year" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "number",
                value: fiscalYear,
                onChange: (e) => setFiscalYear(Number(e.target.value)),
                className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
                required: true
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Currency" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "select",
              {
                value: currencyCode,
                onChange: (e) => setCurrencyCode(e.target.value),
                className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "GBP", children: "GBP (£)" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "USD", children: "USD ($)" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "EUR", children: "EUR (€)" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Fringe Rate %" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "number",
                step: "0.01",
                value: fringeRate,
                onChange: (e) => setFringeRate(Number(e.target.value)),
                className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Overhead Rate %" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "number",
                step: "0.01",
                value: overheadRate,
                onChange: (e) => setOverheadRate(Number(e.target.value)),
                className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "G&A Rate %" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "number",
                step: "0.01",
                value: gaRate,
                onChange: (e) => setGaRate(Number(e.target.value)),
                className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Fee / Profit %" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "number",
                step: "0.01",
                value: feeProfit,
                onChange: (e) => setFeeProfit(Number(e.target.value)),
                className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 justify-end", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: onCancel,
              className: "px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary transition-colors",
              children: "Cancel"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "submit",
              className: "px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors",
              children: "Create"
            }
          )
        ] })
      ]
    }
  );
};
export {
  CostingView as default
};
//# sourceMappingURL=CostingView-BixZu74q.js.map
