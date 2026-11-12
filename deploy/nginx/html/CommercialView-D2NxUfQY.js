import { r as reactExports, j as jsxRuntimeExports, ay as Scale, v as RefreshCw, $ as FileText, ax as DollarSign, C as Clock, Y as CircleCheckBig, c as clsx, K as Plus, aQ as Calculator, T as TriangleAlert, b as api } from "./index-DwHrkWl2.js";
const PRICING_TYPE_LABELS = {
  FFP: "Fixed Price",
  FIRF: "Firm Fixed Price",
  CPFF: "Cost Plus Fixed Fee",
  CPAF: "Cost Plus Award Fee",
  CCP: "Cost Plus Incentive",
  TCIF: "Target Cost Incentive"
};
const ACCEPTANCE_STATUS_COLORS = {
  PENDING_INSPECTION: "text-gray-400",
  UNDER_REVIEW: "text-amber-400",
  ACCEPTED: "text-emerald-400",
  REJECTED: "text-red-400"
};
const DOC_TYPE_LABELS = {
  FRR: "Final Review Report",
  DAR: "Design Assurance Report",
  SRR: "System Review Report",
  PMA: "Preliminary MA",
  FMA: "Final MA"
};
const CommercialView = () => {
  const [activeTab, setActiveTab] = reactExports.useState("contracts");
  const [contracts, setContracts] = reactExports.useState([]);
  const [fiscalCaps, setFiscalCaps] = reactExports.useState([]);
  const [acceptances, setAcceptances] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [showCreateContract, setShowCreateContract] = reactExports.useState(false);
  const [showCreateCap, setShowCreateCap] = reactExports.useState(false);
  const [showCreateAcceptance, setShowCreateAcceptance] = reactExports.useState(false);
  const fetchData = reactExports.useCallback(async () => {
    setLoading(true);
    try {
      setContracts([]);
      setFiscalCaps([]);
      setAcceptances([]);
    } catch (err) {
      console.error("Failed to fetch commercial data:", err);
    } finally {
      setLoading(false);
    }
  }, []);
  reactExports.useEffect(() => {
    fetchData();
  }, [fetchData]);
  const handleCreateContract = async (contract) => {
    try {
      const res = await api.post("/commercial/contracts", contract);
      setContracts((prev) => [...prev, res.data]);
      setShowCreateContract(false);
    } catch (err) {
      console.error("Failed to create contract:", err);
    }
  };
  const handleCreateCap = async (cap) => {
    try {
      const res = await api.post("/commercial/fiscal-caps", cap);
      setFiscalCaps((prev) => [...prev, res.data]);
      setShowCreateCap(false);
    } catch (err) {
      console.error("Failed to create fiscal cap:", err);
    }
  };
  const handleCreateAcceptance = async (acceptance) => {
    try {
      const res = await api.post("/commercial/acceptance", acceptance);
      setAcceptances((prev) => [...prev, res.data]);
      setShowCreateAcceptance(false);
    } catch (err) {
      console.error("Failed to create acceptance milestone:", err);
    }
  };
  const handleUpdateAcceptance = async (id, status) => {
    try {
      const res = await api.put(`/commercial/acceptance/${id}`, { status });
      setAcceptances(
        (prev) => prev.map((a) => a.id === id ? res.data : a)
      );
    } catch (err) {
      console.error("Failed to update acceptance:", err);
    }
  };
  const handleTCIFCalculation = async (projectId, projectedCost) => {
    try {
      const res = await api.post(`/commercial/contracts/${projectId}/tcif-fee-adjustment`, null, {
        params: { projected_cost: projectedCost }
      });
      alert(`TCIF Result:
Adjusted Fee: ${res.data.adjusted_fee}
Total Price: ${res.data.total_price}`);
    } catch (err) {
      console.error("TCIF calculation failed:", err);
    }
  };
  const totalAllocated = fiscalCaps.reduce((sum, c) => sum + c.allocated_funding_cap, 0);
  const totalSpent = fiscalCaps.reduce((sum, c) => sum + (c.actual_spend || 0), 0);
  const pendingAcceptances = acceptances.filter(
    (a) => a.status === "PENDING_INSPECTION" || a.status === "UNDER_REVIEW"
  ).length;
  const formatCurrency = (value) => new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
  if (loading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted", children: "Loading commercial data..." }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Scale, { className: "w-6 h-6 text-purple-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Commercial Governance" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Contracts, Fiscal Caps & Government Acceptance" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: fetchData,
          className: "p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors",
          title: "Refresh",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-4 h-4" })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-4 px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-text-ops-muted text-sm mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "w-4 h-4" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Active Contracts" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-text-ops-primary", children: contracts.length })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-text-ops-muted text-sm mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(DollarSign, { className: "w-4 h-4 text-emerald-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Fiscal Utilization" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-text-ops-primary", children: totalAllocated > 0 ? `${(totalSpent / totalAllocated * 100).toFixed(1)}%` : "0%" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-text-ops-muted", children: [
          formatCurrency(totalSpent),
          " / ",
          formatCurrency(totalAllocated)
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-text-ops-muted text-sm mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "w-4 h-4 text-amber-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Pending Acceptances" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-amber-400", children: pendingAcceptances })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-1 px-6 border-b border-border-ops-subtle", children: [
      { key: "contracts", label: "Contracts", icon: FileText },
      { key: "fiscal", label: "Fiscal Caps", icon: DollarSign },
      { key: "acceptances", label: "Acceptances", icon: CircleCheckBig }
    ].map(({ key, label, icon: Icon }) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        onClick: () => setActiveTab(key),
        className: clsx(
          "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
          activeTab === key ? "border-blue-400 text-blue-400" : "border-transparent text-text-ops-muted hover:text-text-ops-primary"
        ),
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: "w-4 h-4" }),
          label
        ]
      },
      key
    )) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto p-6", children: [
      activeTab === "contracts" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-medium text-text-ops-primary", children: "Contract Structures" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => setShowCreateContract(true),
              className: "flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "w-4 h-4" }),
                "New Contract"
              ]
            }
          )
        ] }),
        showCreateContract && /* @__PURE__ */ jsxRuntimeExports.jsx(
          CreateContractForm,
          {
            onSubmit: handleCreateContract,
            onCancel: () => setShowCreateContract(false)
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid gap-4", children: [
          contracts.map((contract) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              className: "bg-bg-ops-surface rounded-lg border border-border-ops-subtle p-4",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-3", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-sm text-text-ops-muted", children: contract.portfolio_node_id.slice(0, 8) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 bg-bg-ops-overlay rounded text-xs text-text-ops-muted", children: PRICING_TYPE_LABELS[contract.contract_pricing_type] })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-1", children: contract.contract_pricing_type === "TCIF" && /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      onClick: () => {
                        const cost = prompt("Enter projected cost:");
                        if (cost) handleTCIFCalculation(contract.portfolio_node_id, Number(cost));
                      },
                      className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-blue-400 transition-colors",
                      title: "Calculate TCIF",
                      children: /* @__PURE__ */ jsxRuntimeExports.jsx(Calculator, { className: "w-3.5 h-3.5" })
                    }
                  ) })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-4 gap-4", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted mb-1", children: "Target Cost" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-base font-mono text-text-ops-primary", children: formatCurrency(contract.target_cost) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted mb-1", children: "Target Fee" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-base font-mono text-emerald-400", children: formatCurrency(contract.target_fee) })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted mb-1", children: "Ceiling Price" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-base font-mono text-text-ops-primary", children: contract.ceiling_price ? formatCurrency(contract.ceiling_price) : "—" })
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted mb-1", children: "Share Ratio" }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-base font-mono text-text-ops-primary", children: contract.contractor_share_ratio ? `${contract.contractor_share_ratio} / ${contract.customer_share_ratio}` : "—" })
                  ] })
                ] })
              ]
            },
            contract.id
          )),
          contracts.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "py-8 text-center text-text-ops-muted", children: "No contracts defined. Create one to get started." })
        ] })
      ] }),
      activeTab === "fiscal" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-medium text-text-ops-primary", children: "Fiscal Year Spending Caps" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => setShowCreateCap(true),
              className: "flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "w-4 h-4" }),
                "New Cap"
              ]
            }
          )
        ] }),
        showCreateCap && /* @__PURE__ */ jsxRuntimeExports.jsx(
          CreateFiscalCapForm,
          {
            onSubmit: handleCreateCap,
            onCancel: () => setShowCreateCap(false)
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle text-text-ops-muted", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Fiscal Year" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Period" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-2 px-3 font-medium", children: "Allocated Cap" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-2 px-3 font-medium", children: "Actual Spend" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-2 px-3 font-medium", children: "Utilization" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-center py-2 px-3 font-medium", children: "Status" })
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("tbody", { children: [
            fiscalCaps.map((cap) => {
              const utilization = cap.allocated_funding_cap > 0 ? (cap.actual_spend || 0) / cap.allocated_funding_cap * 100 : 0;
              const isOver = utilization > 100;
              return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "tr",
                {
                  className: clsx(
                    "border-b border-border-ops-subtle hover:bg-bg-ops-overlay transition-colors",
                    isOver && "bg-red-900/10"
                  ),
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "py-2 px-3 font-semibold text-text-ops-primary", children: [
                      "FY",
                      cap.fiscal_year
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "py-2 px-3 text-text-ops-muted text-xs", children: [
                      cap.fy_start_date,
                      " → ",
                      cap.fy_end_date
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-right font-mono text-text-ops-primary", children: formatCurrency(cap.allocated_funding_cap) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-right font-mono text-text-ops-primary", children: formatCurrency(cap.actual_spend || 0) }),
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: clsx(
                      "py-2 px-3 text-right font-mono",
                      isOver ? "text-red-400 font-bold" : "text-text-ops-muted"
                    ), children: [
                      utilization.toFixed(1),
                      "%"
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-center", children: isOver ? /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4 text-red-400 mx-auto" }) : utilization > 80 ? /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4 text-amber-400 mx-auto" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheckBig, { className: "w-4 h-4 text-emerald-400 mx-auto" }) })
                  ]
                },
                cap.id
              );
            }),
            fiscalCaps.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("td", { colSpan: 6, className: "py-8 text-center text-text-ops-muted", children: "No fiscal caps defined." }) })
          ] })
        ] }) })
      ] }),
      activeTab === "acceptances" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-medium text-text-ops-primary", children: "Government Acceptance Milestones" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => setShowCreateAcceptance(true),
              className: "flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "w-4 h-4" }),
                "New Milestone"
              ]
            }
          )
        ] }),
        showCreateAcceptance && /* @__PURE__ */ jsxRuntimeExports.jsx(
          CreateAcceptanceForm,
          {
            onSubmit: handleCreateAcceptance,
            onCancel: () => setShowCreateAcceptance(false)
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle text-text-ops-muted", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Document Type" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Reference" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Inspector" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Status" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Sign-off Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-2 px-3 font-medium", children: "Actions" })
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("tbody", { children: [
            acceptances.map((acceptance) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "tr",
              {
                className: "border-b border-border-ops-subtle hover:bg-bg-ops-overlay transition-colors",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-primary", children: DOC_TYPE_LABELS[acceptance.acceptance_document_type] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-muted text-xs", children: acceptance.receipt_reference_number || "—" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted text-xs", children: acceptance.qar_inspector_name || "—" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: clsx(
                    "px-2 py-0.5 rounded text-xs font-medium",
                    ACCEPTANCE_STATUS_COLORS[acceptance.status]
                  ), children: acceptance.status.replace(/_/g, " ") }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted text-xs", children: acceptance.signoff_date || "—" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-right", children: acceptance.status !== "ACCEPTED" && /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      onClick: () => handleUpdateAcceptance(acceptance.id, "ACCEPTED"),
                      className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-emerald-400 transition-colors",
                      title: "Mark Accepted",
                      children: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheckBig, { className: "w-3.5 h-3.5" })
                    }
                  ) })
                ]
              },
              acceptance.id
            )),
            acceptances.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("td", { colSpan: 6, className: "py-8 text-center text-text-ops-muted", children: "No acceptance milestones defined." }) })
          ] })
        ] }) })
      ] })
    ] })
  ] });
};
const CreateContractForm = ({ onSubmit, onCancel }) => {
  const [nodeId, setNodeId] = reactExports.useState("");
  const [pricingType, setPricingType] = reactExports.useState("TCIF");
  const [targetCost, setTargetCost] = reactExports.useState(0);
  const [targetFee, setTargetFee] = reactExports.useState(0);
  const [ceilingPrice, setCeilingPrice] = reactExports.useState(0);
  const [contractorShare, setContractorShare] = reactExports.useState(0.2);
  const [customerShare, setCustomerShare] = reactExports.useState(0.8);
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      portfolio_node_id: nodeId,
      contract_pricing_type: pricingType,
      target_cost: targetCost,
      target_fee: targetFee,
      ceiling_price: ceilingPrice || void 0,
      contractor_share_ratio: contractorShare,
      customer_share_ratio: customerShare
    });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, className: "mb-4 p-4 bg-bg-ops-surface rounded-lg border border-blue-500/30", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-medium text-text-ops-primary mb-3", children: "New Contract Structure" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-4 gap-3 mb-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Project Node ID" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: nodeId,
            onChange: (e) => setNodeId(e.target.value),
            className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
            required: true
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Pricing Type" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "select",
          {
            value: pricingType,
            onChange: (e) => setPricingType(e.target.value),
            className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
            children: Object.entries(PRICING_TYPE_LABELS).map(([key, label]) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: key, children: label }, key))
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Target Cost" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "number",
            value: targetCost,
            onChange: (e) => setTargetCost(Number(e.target.value)),
            className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Target Fee" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "number",
            value: targetFee,
            onChange: (e) => setTargetFee(Number(e.target.value)),
            className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 justify-end", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onCancel, className: "px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary", children: "Cancel" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "submit", className: "px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm", children: "Create" })
    ] })
  ] });
};
const CreateFiscalCapForm = ({ onSubmit, onCancel }) => {
  const [nodeId, setNodeId] = reactExports.useState("");
  const [fiscalYear, setFiscalYear] = reactExports.useState((/* @__PURE__ */ new Date()).getFullYear());
  const [startDate, setStartDate] = reactExports.useState("");
  const [endDate, setEndDate] = reactExports.useState("");
  const [cap, setCap] = reactExports.useState(0);
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      portfolio_node_id: nodeId,
      fiscal_year: fiscalYear,
      fy_start_date: startDate,
      fy_end_date: endDate,
      allocated_funding_cap: cap
    });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, className: "mb-4 p-4 bg-bg-ops-surface rounded-lg border border-blue-500/30", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-medium text-text-ops-primary mb-3", children: "New Fiscal Cap" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-4 gap-3 mb-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Control Account ID" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: nodeId,
            onChange: (e) => setNodeId(e.target.value),
            className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
            required: true
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Fiscal Year" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "number",
            value: fiscalYear,
            onChange: (e) => setFiscalYear(Number(e.target.value)),
            className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Start Date" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "date",
            value: startDate,
            onChange: (e) => setStartDate(e.target.value),
            className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "End Date" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "date",
            value: endDate,
            onChange: (e) => setEndDate(e.target.value),
            className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Funding Cap (£)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "number",
            value: cap,
            onChange: (e) => setCap(Number(e.target.value)),
            className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 justify-end", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onCancel, className: "px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary", children: "Cancel" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "submit", className: "px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm", children: "Create" })
    ] })
  ] });
};
const CreateAcceptanceForm = ({ onSubmit, onCancel }) => {
  const [nodeId, setNodeId] = reactExports.useState("");
  const [docType, setDocType] = reactExports.useState("FRR");
  const [reference, setReference] = reactExports.useState("");
  const [inspector, setInspector] = reactExports.useState("");
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      portfolio_node_id: nodeId,
      acceptance_document_type: docType,
      receipt_reference_number: reference || void 0,
      qar_inspector_name: inspector || void 0
    });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, className: "mb-4 p-4 bg-bg-ops-surface rounded-lg border border-blue-500/30", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-medium text-text-ops-primary mb-3", children: "New Acceptance Milestone" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-4 gap-3 mb-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Deliverable Node ID" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: nodeId,
            onChange: (e) => setNodeId(e.target.value),
            className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
            required: true
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Document Type" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "select",
          {
            value: docType,
            onChange: (e) => setDocType(e.target.value),
            className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
            children: Object.entries(DOC_TYPE_LABELS).map(([key, label]) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: key, children: label }, key))
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Reference Number" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: reference,
            onChange: (e) => setReference(e.target.value),
            className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "QAR Inspector" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: inspector,
            onChange: (e) => setInspector(e.target.value),
            className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 justify-end", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: onCancel, className: "px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary", children: "Cancel" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "submit", className: "px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm", children: "Create" })
    ] })
  ] });
};
export {
  CommercialView as default
};
//# sourceMappingURL=CommercialView-D2NxUfQY.js.map
