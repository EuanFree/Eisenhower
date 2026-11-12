import { r as reactExports, b as api, j as jsxRuntimeExports, aS as Truck, v as RefreshCw, _ as Package, C as Clock, T as TriangleAlert, K as Plus, c as clsx, am as SquarePen, af as Trash2 } from "./index-DwHrkWl2.js";
const LIFECYCLE_STAGES = [
  { value: "REQUISITION", label: "Requisition", color: "text-gray-400" },
  { value: "RFQ_ISSUED", label: "RFQ Issued", color: "text-blue-400" },
  { value: "PO_PLACED", label: "PO Placed", color: "text-indigo-400" },
  { value: "IN_MANUFACTURE", label: "In Manufacture", color: "text-amber-400" },
  { value: "CUSTOMS_TRANSIT", label: "Customs / Transit", color: "text-orange-400" },
  { value: "DELIVERED_STORES", label: "Delivered", color: "text-emerald-400" },
  { value: "ACCEPTED_INSPECTED", label: "Accepted", color: "text-green-400" }
];
const LIFECYCLE_ORDER = LIFECYCLE_STAGES.map((s) => s.value);
const ProcurementView = () => {
  const [items, setItems] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [filterStage, setFilterStage] = reactExports.useState(null);
  const [filterLongLead, setFilterLongLead] = reactExports.useState(false);
  const [searchQuery, setSearchQuery] = reactExports.useState("");
  const [showCreate, setShowCreate] = reactExports.useState(false);
  const [editingItem, setEditingItem] = reactExports.useState(null);
  const [showStatusModal, setShowStatusModal] = reactExports.useState(false);
  const fetchItems = reactExports.useCallback(async () => {
    var _a;
    try {
      const params = {};
      if (filterStage) params.lifecycle_stage = filterStage;
      if (filterLongLead) params.is_long_lead = "true";
      const res = await api.get("/procurement/items", { params });
      setItems(((_a = res.data) == null ? void 0 : _a.items) || res.data || []);
    } catch (err) {
      console.error("Failed to fetch procurement items:", err);
    } finally {
      setLoading(false);
    }
  }, [filterStage, filterLongLead]);
  reactExports.useEffect(() => {
    fetchItems();
  }, [fetchItems]);
  const handleCreate = async (item) => {
    try {
      const res = await api.post("/procurement/items", item);
      setItems((prev) => [...prev, res.data]);
      setShowCreate(false);
    } catch (err) {
      console.error("Failed to create procurement item:", err);
    }
  };
  const handleUpdateStatus = async (id, stage, forecastDate) => {
    try {
      const res = await api.put(`/procurement/items/${id}/status`, null, {
        params: { lifecycle_stage: stage, forecast_delivery_date: forecastDate }
      });
      setItems((prev) => prev.map((item) => item.id === id ? res.data : item));
      setShowStatusModal(false);
      setEditingItem(null);
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };
  const handleDelete = async (id) => {
    if (!confirm("Delete this procurement item?")) return;
    try {
      await api.delete(`/procurement/items/${id}`);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error("Failed to delete procurement item:", err);
    }
  };
  const totalItems = items.length;
  const longLeadItems = items.filter((i) => i.is_long_lead_item).length;
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const overdueItems = items.filter(
    (i) => i.forecast_delivery_date && i.forecast_delivery_date < today && i.lifecycle_stage !== "ACCEPTED_INSPECTED"
  ).length;
  const inTransitItems = items.filter(
    (i) => i.lifecycle_stage === "CUSTOMS_TRANSIT" || i.lifecycle_stage === "IN_MANUFACTURE"
  ).length;
  const filteredItems = items.filter((item) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return item.part_number.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || item.supplier_cage_code.toLowerCase().includes(q);
    }
    return true;
  });
  if (loading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted", children: "Loading procurement data..." }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Truck, { className: "w-6 h-6 text-blue-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Procurement Dashboard" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Supply Chain Tracking & Delivery Management" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: fetchItems,
          className: "p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors",
          title: "Refresh",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-4 h-4" })
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-4 gap-4 px-6 py-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-text-ops-muted text-sm mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Package, { className: "w-4 h-4" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Total Items" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-text-ops-primary", children: totalItems })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-text-ops-muted text-sm mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "w-4 h-4 text-amber-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Long Lead" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-amber-400", children: longLeadItems })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-text-ops-muted text-sm mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4 text-red-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Overdue" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-red-400", children: overdueItems })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-text-ops-muted text-sm mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Truck, { className: "w-4 h-4 text-blue-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "In Transit" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-blue-400", children: inTransitItems })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 px-6 py-3 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "select",
        {
          value: filterStage || "",
          onChange: (e) => setFilterStage(e.target.value || null),
          className: "bg-bg-ops-surface border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "All Stages" }),
            LIFECYCLE_STAGES.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: s.value, children: s.label }, s.value))
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-2 text-sm text-text-ops-muted", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "checkbox",
            checked: filterLongLead,
            onChange: (e) => setFilterLongLead(e.target.checked),
            className: "rounded"
          }
        ),
        "Long Lead Only"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          type: "text",
          value: searchQuery,
          onChange: (e) => setSearchQuery(e.target.value),
          placeholder: "Search part number, description...",
          className: "flex-1 bg-bg-ops-surface border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => setShowCreate(true),
          className: "flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "w-4 h-4" }),
            "New Item"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-6", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle text-text-ops-muted", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Part Number" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Description" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Supplier" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Stage" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Forecast" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Actual" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-center py-2 px-3 font-medium", children: "Long Lead" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-2 px-3 font-medium", children: "Actions" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("tbody", { children: [
        filteredItems.map((item) => {
          const stageInfo = LIFECYCLE_STAGES.find((s) => s.value === item.lifecycle_stage);
          const isOverdue = item.forecast_delivery_date && item.forecast_delivery_date < today && item.lifecycle_stage !== "ACCEPTED_INSPECTED";
          return /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "tr",
            {
              className: clsx(
                "border-b border-border-ops-subtle hover:bg-bg-ops-overlay transition-colors",
                isOverdue && "bg-red-900/10"
              ),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: item.part_number }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-primary max-w-xs truncate", children: item.description }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-muted", children: item.supplier_cage_code }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: clsx("px-2 py-0.5 rounded text-xs font-medium", (stageInfo == null ? void 0 : stageInfo.color) || "text-text-ops-muted"), children: (stageInfo == null ? void 0 : stageInfo.label) || item.lifecycle_stage }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: clsx("py-2 px-3 text-xs", isOverdue ? "text-red-400 font-bold" : "text-text-ops-muted"), children: item.forecast_delivery_date || "—" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-xs text-text-ops-muted", children: item.actual_arrival_date || "—" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-center", children: item.is_long_lead_item && /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4 text-amber-400 mx-auto" }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-right", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-end gap-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      onClick: () => {
                        setEditingItem(item);
                        setShowStatusModal(true);
                      },
                      className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-blue-400 transition-colors",
                      title: "Update Status",
                      children: /* @__PURE__ */ jsxRuntimeExports.jsx(SquarePen, { className: "w-3.5 h-3.5" })
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      onClick: () => handleDelete(item.id),
                      className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-red-400 transition-colors",
                      title: "Delete",
                      children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "w-3.5 h-3.5" })
                    }
                  )
                ] }) })
              ]
            },
            item.id
          );
        }),
        filteredItems.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("td", { colSpan: 8, className: "py-8 text-center text-text-ops-muted", children: "No procurement items found." }) })
      ] })
    ] }) }),
    showCreate && /* @__PURE__ */ jsxRuntimeExports.jsx(
      CreateProcurementModal,
      {
        onSubmit: handleCreate,
        onCancel: () => setShowCreate(false)
      }
    ),
    showStatusModal && editingItem && /* @__PURE__ */ jsxRuntimeExports.jsx(
      UpdateStatusModal,
      {
        item: editingItem,
        onSubmit: (stage, date) => handleUpdateStatus(editingItem.id, stage, date),
        onCancel: () => {
          setShowStatusModal(false);
          setEditingItem(null);
        }
      }
    )
  ] });
};
const CreateProcurementModal = ({ onSubmit, onCancel }) => {
  const [partNumber, setPartNumber] = reactExports.useState("");
  const [description, setDescription] = reactExports.useState("");
  const [supplierCage, setSupplierCage] = reactExports.useState("");
  const [forecastDate, setForecastDate] = reactExports.useState("");
  const [isLongLead, setIsLongLead] = reactExports.useState(false);
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      part_number: partNumber,
      description,
      supplier_cage_code: supplierCage,
      forecast_delivery_date: forecastDate || void 0,
      is_long_lead_item: isLongLead
    });
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg border border-border-ops-strong p-6 w-full max-w-lg", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold text-text-ops-primary mb-4", children: "New Procurement Item" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Part Number *" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              value: partNumber,
              onChange: (e) => setPartNumber(e.target.value.toUpperCase()),
              className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
              required: true
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Description *" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              value: description,
              onChange: (e) => setDescription(e.target.value),
              className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
              required: true
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Supplier CAGE Code *" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              value: supplierCage,
              onChange: (e) => setSupplierCage(e.target.value.toUpperCase()),
              className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
              required: true
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Forecast Delivery Date" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "date",
              value: forecastDate,
              onChange: (e) => setForecastDate(e.target.value),
              className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "flex items-center gap-2 text-sm text-text-ops-muted", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "checkbox",
              checked: isLongLead,
              onChange: (e) => setIsLongLead(e.target.checked),
              className: "rounded"
            }
          ),
          "Long Lead Item"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 justify-end mt-4", children: [
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
    ] })
  ] }) });
};
const UpdateStatusModal = ({ item, onSubmit, onCancel }) => {
  var _a;
  const currentIndex = LIFECYCLE_ORDER.indexOf(item.lifecycle_stage);
  const availableStages = LIFECYCLE_ORDER.slice(currentIndex + 1);
  const [selectedStage, setSelectedStage] = reactExports.useState(availableStages[0] || item.lifecycle_stage);
  const [forecastDate, setForecastDate] = reactExports.useState(item.forecast_delivery_date || "");
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(selectedStage, forecastDate || void 0);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface rounded-lg border border-border-ops-strong p-6 w-full max-w-md", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold text-text-ops-primary mb-1", children: "Update Status" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm text-text-ops-muted mb-4", children: [
      item.part_number,
      " — ",
      item.description
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Current Stage" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-text-ops-primary", children: (_a = LIFECYCLE_STAGES.find((s) => s.value === item.lifecycle_stage)) == null ? void 0 : _a.label })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Advance To" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "select",
            {
              value: selectedStage,
              onChange: (e) => setSelectedStage(e.target.value),
              className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary",
              children: availableStages.map((stage) => {
                const info = LIFECYCLE_STAGES.find((s) => s.value === stage);
                return /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: stage, children: info == null ? void 0 : info.label }, stage);
              })
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Updated Forecast Date" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "date",
              value: forecastDate,
              onChange: (e) => setForecastDate(e.target.value),
              className: "w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 justify-end mt-4", children: [
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
            children: "Update"
          }
        )
      ] })
    ] })
  ] }) });
};
export {
  ProcurementView as default
};
//# sourceMappingURL=ProcurementView-5rXN_inI.js.map
