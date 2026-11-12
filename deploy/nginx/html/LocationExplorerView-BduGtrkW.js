import { r as reactExports, b as api, j as jsxRuntimeExports, aq as MapPin, al as Search, D as Shield, c as clsx, F as Filter, x as LoaderCircle, aA as Box, R as React, g as ChevronRight, aB as ArrowRightLeft, X, i as CircleAlert, an as History, a as useHoverInspector, f as ChevronDown, t as UserCheck, H as HoverSummaryModal, _ as Package, aC as DoorOpen, ai as Layers, a7 as Building2 } from "./index-DwHrkWl2.js";
const TIER_ICONS = {
  SITE: /* @__PURE__ */ jsxRuntimeExports.jsx(MapPin, { className: "w-4 h-4" }),
  FACILITY: /* @__PURE__ */ jsxRuntimeExports.jsx(Building2, { className: "w-4 h-4" }),
  ZONE: /* @__PURE__ */ jsxRuntimeExports.jsx(Layers, { className: "w-4 h-4" }),
  ROOM: /* @__PURE__ */ jsxRuntimeExports.jsx(DoorOpen, { className: "w-4 h-4" }),
  CONTAINER: /* @__PURE__ */ jsxRuntimeExports.jsx(Package, { className: "w-4 h-4" }),
  SUB_CONTAINER: /* @__PURE__ */ jsxRuntimeExports.jsx(Box, { className: "w-4 h-4" })
};
const TIER_LABELS = {
  SITE: "Site",
  FACILITY: "Facility",
  ZONE: "Zone",
  ROOM: "Room",
  CONTAINER: "Container",
  SUB_CONTAINER: "Sub-Container"
};
const CLASS_COLORS = {
  OFFICIAL: "text-sky-400 bg-sky-500/10 border-sky-500/30",
  OFFICIAL_SENSITIVE: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  SECRET: "text-red-400 bg-red-500/10 border-red-500/30",
  TOP_SECRET: "text-purple-400 bg-purple-500/10 border-purple-500/30"
};
const LocationTreeRow = ({
  node,
  depth,
  selectedId,
  onSelect,
  onToggleExpand
}) => {
  var _a, _b;
  const hasChildren = (((_a = node.children) == null ? void 0 : _a.length) ?? 0) > 0;
  const isExpanded = node.expanded;
  const isSelected = selectedId === node.id;
  const rowRef = reactExports.useRef(null);
  const hoverInspector = useHoverInspector({
    targetData: {
      entityType: "LOCATION",
      entityId: node.id
    },
    enterDelayMs: 5e3,
    exitDelayMs: 2e3
  });
  reactExports.useEffect(() => {
    if (hoverInspector.handlers.onRef) {
      hoverInspector.handlers.onRef(rowRef.current);
    }
  }, [hoverInspector.handlers.onRef]);
  const handleRowMouseEnter = () => {
    hoverInspector.handlers.onMouseEnter();
  };
  const handleRowMouseLeave = () => {
    hoverInspector.handlers.onMouseLeave();
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        ref: rowRef,
        className: clsx(
          "flex items-center gap-2 py-1.5 px-2 cursor-pointer border-b border-border-ops-subtle/30 transition-colors",
          isSelected ? "bg-blue-600/10 border-l-2 border-l-blue-500" : "hover:bg-bg-ops-overlay"
        ),
        style: { paddingLeft: `${depth * 24 + 8}px` },
        onClick: () => {
          if (hasChildren && !node.childrenLoaded) {
            onToggleExpand(node.id);
          }
          onSelect(node);
        },
        onMouseEnter: handleRowMouseEnter,
        onMouseLeave: handleRowMouseLeave,
        role: "treeitem",
        "aria-expanded": hasChildren ? isExpanded : void 0,
        "aria-selected": isSelected,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: (e) => {
                e.stopPropagation();
                onToggleExpand(node.id);
              },
              className: clsx(
                "w-5 h-5 flex items-center justify-center rounded hover:bg-bg-ops-overlay transition-colors",
                !hasChildren && "invisible"
              ),
              "aria-label": isExpanded ? "Collapse" : "Expand",
              children: isExpanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: "w-3.5 h-3.5 text-text-ops-muted" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "w-3.5 h-3.5 text-text-ops-muted" })
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: TIER_ICONS[node.tier] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-w-0", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-text-ops-muted", children: node.code }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-text-ops-primary truncate", children: node.name })
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 flex-shrink-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                className: clsx(
                  "px-1.5 py-0.5 rounded text-[10px] font-medium border",
                  CLASS_COLORS[node.security_classification]
                ),
                children: node.security_classification
              }
            ),
            node.is_scif_or_tempest && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 border border-amber-500/30 text-amber-400", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-3 h-3 inline mr-0.5" }),
              "SCIF"
            ] }),
            node.escort_required && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/10 border border-orange-500/30 text-orange-400", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(UserCheck, { className: "w-3 h-3 inline mr-0.5" }),
              "Escort"
            ] }),
            node.asset_count !== void 0 && node.asset_count > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 border border-blue-500/30 text-blue-400", children: [
              node.asset_count,
              " asset",
              node.asset_count > 1 ? "s" : ""
            ] })
          ] })
        ]
      }
    ),
    hoverInspector.state.isOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(
      HoverSummaryModal,
      {
        targetData: { entityType: "LOCATION", entityId: node.id },
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
const AssetRow = ({ asset, onRelocate, onViewHistory }) => {
  var _a;
  const rowRef = reactExports.useRef(null);
  const hoverInspector = useHoverInspector({
    targetData: {
      entityType: "RESOURCE",
      entityId: asset.id
    },
    enterDelayMs: 5e3,
    exitDelayMs: 2e3
  });
  reactExports.useEffect(() => {
    if (hoverInspector.handlers.onRef) {
      hoverInspector.handlers.onRef(rowRef.current);
    }
  }, [hoverInspector.handlers.onRef]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "tr",
      {
        ref: rowRef,
        className: "border-b border-border-ops-subtle/30 hover:bg-bg-ops-overlay transition-colors",
        onMouseEnter: () => hoverInspector.handlers.onMouseEnter(),
        onMouseLeave: () => hoverInspector.handlers.onMouseLeave(),
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-xs text-text-ops-muted", children: asset.code }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-primary", children: asset.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-1.5 py-0.5 rounded text-[10px] font-medium bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-muted", children: asset.resource_type }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            "span",
            {
              className: clsx(
                "px-1.5 py-0.5 rounded text-[10px] font-medium border",
                CLASS_COLORS[asset.security_classification]
              ),
              children: asset.security_classification
            }
          ) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-xs text-text-ops-muted truncate max-w-[150px]", children: asset.current_location_name || "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-right", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-end gap-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => onViewHistory(asset),
                className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors",
                title: "View custody history",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(History, { className: "w-3.5 h-3.5" })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => onRelocate(asset),
                className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-blue-400 transition-colors",
                title: "Relocate asset",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowRightLeft, { className: "w-3.5 h-3.5" })
              }
            )
          ] }) })
        ]
      },
      asset.id
    ),
    hoverInspector.state.isOpen && /* @__PURE__ */ jsxRuntimeExports.jsx(
      HoverSummaryModal,
      {
        targetData: { entityType: "RESOURCE", entityId: asset.id },
        position: hoverInspector.state.position,
        placement: hoverInspector.state.placement,
        isExiting: hoverInspector.state.isExiting,
        onClose: hoverInspector.close,
        onMouseEnter: hoverInspector.modalCallbacks.onMouseEnter,
        onMouseLeave: hoverInspector.modalCallbacks.onMouseLeave,
        floatingStyles: hoverInspector.floatingStyles,
        floatingRef: (_a = hoverInspector.refs) == null ? void 0 : _a.setFloating
      }
    )
  ] });
};
const AssetInventoryTable = ({
  assets,
  onRelocate,
  onViewHistory
}) => {
  if (assets.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-8 text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Box, { className: "w-8 h-8 mb-2 opacity-50" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "No assets in this location" })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle text-text-ops-muted text-xs uppercase tracking-wider", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Code" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Name" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Type" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Classification" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Location" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right py-2 px-3 font-medium", children: "Actions" })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: assets.map((asset) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      AssetRow,
      {
        asset,
        onRelocate,
        onViewHistory
      },
      asset.id
    )) })
  ] }) });
};
const RelocateAssetModal = ({
  asset,
  locations,
  onClose,
  onRelocate
}) => {
  const [targetLocationId, setTargetLocationId] = reactExports.useState("");
  const [reason, setReason] = reactExports.useState("");
  const [notes, setNotes] = reactExports.useState("");
  const [isRelocating, setIsRelocating] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const allLocations = reactExports.useMemo(() => {
    const flatten = (nodes) => nodes.reduce((acc, node) => {
      acc.push(node);
      if (node.children) {
        acc.push(...flatten(node.children));
      }
      return acc;
    }, []);
    return flatten(locations);
  }, [locations]);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!asset || !targetLocationId || !reason.trim()) return;
    setIsRelocating(true);
    setError(null);
    try {
      await onRelocate(asset.id, targetLocationId, reason.trim(), notes.trim() || void 0);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Relocation failed");
    } finally {
      setIsRelocating(false);
    }
  };
  if (!asset) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Relocate Asset",
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-lg bg-bg-ops-surface border border-border-ops-subtle rounded-lg shadow-2xl", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-4 border-b border-border-ops-subtle", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowRightLeft, { className: "w-5 h-5 text-blue-400" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-semibold text-text-ops-primary", children: "Relocate Asset" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: onClose,
              className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "w-4 h-4" })
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 border-b border-border-ops-subtle", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-text-ops-muted bg-bg-ops-overlay px-2 py-1 rounded", children: asset.code }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-text-ops-primary", children: asset.name }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                className: clsx(
                  "px-1.5 py-0.5 rounded text-[10px] font-medium border",
                  CLASS_COLORS[asset.security_classification]
                ),
                children: asset.security_classification
              }
            )
          ] }),
          asset.current_location_name && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-2 text-xs text-text-ops-muted", children: [
            "Current location: ",
            asset.current_location_name
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, className: "p-4 space-y-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-text-ops-muted uppercase tracking-wider mb-1.5", children: "Target Location" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "select",
              {
                value: targetLocationId,
                onChange: (e) => setTargetLocationId(e.target.value),
                required: true,
                className: "w-full px-3 py-2 rounded-md bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:ring-1 focus:ring-blue-500",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "Select a location..." }),
                  allLocations.map((loc) => /* @__PURE__ */ jsxRuntimeExports.jsxs("option", { value: loc.id, children: [
                    loc.path,
                    " — ",
                    loc.code,
                    " (",
                    loc.name,
                    ")"
                  ] }, loc.id))
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-text-ops-muted uppercase tracking-wider mb-1.5", children: "Justification *" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "textarea",
              {
                value: reason,
                onChange: (e) => setReason(e.target.value),
                required: true,
                rows: 3,
                placeholder: "Why is this asset being relocated?",
                className: "w-full px-3 py-2 rounded-md bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-text-ops-muted uppercase tracking-wider mb-1.5", children: "Additional Notes" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "textarea",
              {
                value: notes,
                onChange: (e) => setNotes(e.target.value),
                rows: 2,
                placeholder: "Optional notes about this move...",
                className: "w-full px-3 py-2 rounded-md bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              }
            )
          ] }),
          error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-400", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(CircleAlert, { className: "w-4 h-4 mt-0.5 flex-shrink-0" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: error })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-end gap-2 pt-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: onClose,
                disabled: isRelocating,
                className: "px-4 py-2 rounded-md text-sm font-medium text-text-ops-muted hover:text-text-ops-primary border border-border-ops-subtle hover:border-border-ops-strong transition-colors",
                children: "Cancel"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "submit",
                disabled: isRelocating || !targetLocationId || !reason.trim(),
                className: clsx(
                  "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                  isRelocating || !targetLocationId || !reason.trim() ? "bg-gray-600 text-gray-300 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-500 text-white"
                ),
                children: isRelocating ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-4 h-4 animate-spin" }),
                  "Relocating..."
                ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowRightLeft, { className: "w-4 h-4" }),
                  "Confirm Relocation"
                ] })
              }
            )
          ] })
        ] })
      ] })
    }
  );
};
const CustodyHistoryPanel = ({
  asset,
  entries,
  loading,
  onClose
}) => {
  if (!asset) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "div",
    {
      className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Custody History",
      children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-full max-w-2xl max-h-[80vh] bg-bg-ops-surface border border-border-ops-subtle rounded-lg shadow-2xl flex flex-col", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-4 border-b border-border-ops-subtle", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(History, { className: "w-5 h-5 text-amber-400" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-semibold text-text-ops-primary", children: "Custody History" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: onClose,
              className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "w-4 h-4" })
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4 border-b border-border-ops-subtle", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-text-ops-muted bg-bg-ops-overlay px-2 py-1 rounded", children: asset.code }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-text-ops-primary", children: asset.name })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-y-auto p-4", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-8 text-text-ops-muted", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-6 h-6 mb-2 animate-spin" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "Loading custody history..." })
        ] }) : entries.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-8 text-text-ops-muted", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(History, { className: "w-8 h-8 mb-2 opacity-50" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "No custody history recorded" })
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children: entries.map((entry, index) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "div",
          {
            className: "flex gap-3 p-3 rounded-md bg-bg-ops-overlay border border-border-ops-subtle",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-3 h-3 rounded-full bg-blue-500/50 border-2 border-blue-500" }),
                index < entries.length - 1 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-px h-full bg-border-ops-subtle mt-1" })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-2 mb-1", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-text-ops-muted", children: new Date(entry.movement_timestamp).toLocaleString() }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-primary", children: entry.from_location_name ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: entry.from_location_name }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowRightLeft, { className: "w-3 h-3 inline mx-1 text-blue-400" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-blue-400", children: entry.to_location_name })
                ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Initial commissioning →" }),
                  " ",
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-blue-400", children: entry.to_location_name })
                ] }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted mt-1", children: entry.movement_reason }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 mt-1 text-[10px] text-text-ops-muted", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                    "Moved by: ",
                    entry.moved_by_user_name || "Unknown"
                  ] }),
                  entry.authorized_by_user_name && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
                    "Auth: ",
                    entry.authorized_by_user_name
                  ] })
                ] }),
                entry.notes && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-text-ops-muted mt-1 italic", children: [
                  '"',
                  entry.notes,
                  '"'
                ] })
              ] })
            ]
          },
          entry.id
        )) }) })
      ] })
    }
  );
};
const BreadcrumbBar = ({ node, onNavigateUp }) => {
  if (!node) return null;
  const parts = node.path.split(".");
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 text-xs px-4 py-2 border-b border-border-ops-subtle bg-bg-ops-overlay", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        type: "button",
        onClick: onNavigateUp,
        className: "text-text-ops-muted hover:text-text-ops-primary transition-colors",
        children: "↑ Parent"
      }
    ),
    parts.map((part, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs(React.Fragment, { children: [
      i > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "w-3 h-3 text-text-ops-muted" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "span",
        {
          className: clsx(
            "truncate",
            i === parts.length - 1 ? "text-text-ops-primary font-semibold" : "text-text-ops-muted"
          ),
          children: part
        }
      )
    ] }, i))
  ] });
};
const LocationExplorerView = () => {
  const [locations, setLocations] = reactExports.useState([]);
  const [selectedNode, setSelectedNode] = reactExports.useState(null);
  const [assets, setAssets] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(false);
  const [inventoryLoading, setInventoryLoading] = reactExports.useState(false);
  const [searchQuery, setSearchQuery] = reactExports.useState("");
  const [filterTier, setFilterTier] = reactExports.useState(null);
  const [scifOnly, setScifOnly] = reactExports.useState(false);
  const [relocateAsset, setRelocateAsset] = reactExports.useState(null);
  const [custodyAsset, setCustodyAsset] = reactExports.useState(null);
  const [custodyEntries, setCustodyEntries] = reactExports.useState([]);
  const [custodyLoading, setCustodyLoading] = reactExports.useState(false);
  reactExports.useEffect(() => {
    fetchLocations();
  }, []);
  const fetchLocations = async () => {
    setLoading(true);
    try {
      const response = await api.get("/api/v1/wbs/nodes", {
        params: { tree_type: "LBS" }
      });
      if (response.data) {
        setLocations(response.data.items || []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };
  const fetchInventory = reactExports.useCallback(
    async (locationId) => {
      setInventoryLoading(true);
      try {
        const response = await api.get(
          `/api/v1/spatial/locations/${locationId}/inventory`
        );
        if (response.data) {
          setAssets(response.data.assets || []);
        }
      } catch {
        setAssets([]);
      } finally {
        setInventoryLoading(false);
      }
    },
    []
  );
  const handleSelectNode = reactExports.useCallback(
    (node) => {
      setSelectedNode(node);
      fetchInventory(node.id);
    },
    [fetchInventory]
  );
  const handleToggleExpand = reactExports.useCallback((nodeId) => {
    setLocations((prev) => {
      const toggle = (nodes) => nodes.map((node) => {
        if (node.id === nodeId) {
          return { ...node, expanded: !node.expanded };
        }
        if (node.children) {
          return { ...node, children: toggle(node.children) };
        }
        return node;
      });
      return toggle(prev);
    });
  }, []);
  const handleRelocate = reactExports.useCallback(
    async (assetId, targetLocationId, reason, notes) => {
      await api.post("/api/v1/spatial/relocate", {
        resource_id: assetId,
        target_location_id: targetLocationId,
        reason,
        notes
      });
      if (selectedNode) {
        fetchInventory(selectedNode.id);
      }
    },
    [selectedNode, fetchInventory]
  );
  const handleViewCustody = reactExports.useCallback(async (asset) => {
    setCustodyAsset(asset);
    setCustodyLoading(true);
    try {
      const response = await api.get(
        `/api/v1/spatial/assets/${asset.id}/custody-history`
      );
      if (response.data) {
        setCustodyEntries(response.data.entries || []);
      }
    } catch {
      setCustodyEntries([]);
    } finally {
      setCustodyLoading(false);
    }
  }, []);
  const filteredLocations = reactExports.useMemo(() => {
    const filter = (nodes) => nodes.filter((node) => {
      if (filterTier && node.tier !== filterTier) return false;
      if (scifOnly && !node.is_scif_or_tempest) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return node.name.toLowerCase().includes(q) || node.code.toLowerCase().includes(q) || node.path.toLowerCase().includes(q);
      }
      return true;
    }).map((node) => {
      if (node.children) {
        return { ...node, children: filter(node.children) };
      }
      return node;
    });
    return filter(locations);
  }, [locations, filterTier, scifOnly, searchQuery]);
  const renderTree = (nodes, depth = 0) => nodes.map((node) => /* @__PURE__ */ jsxRuntimeExports.jsxs(React.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      LocationTreeRow,
      {
        node,
        depth,
        selectedId: (selectedNode == null ? void 0 : selectedNode.id) || null,
        onSelect: handleSelectNode,
        onToggleExpand: handleToggleExpand
      }
    ),
    node.expanded && node.children && node.children.length > 0 && renderTree(node.children, depth + 1)
  ] }, node.id));
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(MapPin, { className: "w-5 h-5 text-blue-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-sm font-semibold text-text-ops-primary", children: "Location Explorer" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted", children: [
          "(",
          locations.length,
          " sites)"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-ops-muted" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              value: searchQuery,
              onChange: (e) => setSearchQuery(e.target.value),
              placeholder: "Search locations...",
              className: "pl-8 pr-3 py-1.5 rounded-md bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "select",
          {
            value: filterTier || "",
            onChange: (e) => setFilterTier(e.target.value || null),
            className: "px-2 py-1.5 rounded-md bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-xs focus:outline-none focus:ring-1 focus:ring-blue-500",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "All Tiers" }),
              Object.keys(TIER_LABELS).map((tier) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: tier, children: TIER_LABELS[tier] }, tier))
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: () => setScifOnly(!scifOnly),
            className: clsx(
              "flex items-center gap-1 px-2 py-1.5 rounded-md border text-xs transition-colors",
              scifOnly ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-bg-ops-overlay border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary"
            ),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-3.5 h-3.5" }),
              "SCIF Only"
            ]
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      BreadcrumbBar,
      {
        node: selectedNode,
        onNavigateUp: () => {
          if (selectedNode == null ? void 0 : selectedNode.parent_id) {
            const findParent = (nodes, parentId) => {
              for (const node of nodes) {
                if (node.id === parentId) return node;
                if (node.children) {
                  const found = findParent(node.children, parentId);
                  if (found) return found;
                }
              }
              return null;
            };
            const parent = findParent(locations, selectedNode.parent_id);
            if (parent) handleSelectNode(parent);
          }
        }
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-1 overflow-hidden", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-1/2 border-r border-border-ops-subtle flex flex-col overflow-hidden", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 px-3 py-2 border-b border-border-ops-subtle bg-bg-ops-overlay", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Filter, { className: "w-3.5 h-3.5 text-text-ops-muted" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-medium text-text-ops-muted uppercase tracking-wider", children: "Location Hierarchy" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-y-auto", role: "tree", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-8 text-text-ops-muted", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-6 h-6 mb-2 animate-spin" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "Loading locations..." })
        ] }) : filteredLocations.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-8 text-text-ops-muted", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(MapPin, { className: "w-8 h-8 mb-2 opacity-50" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: searchQuery || filterTier || scifOnly ? "No locations match your filters" : "No locations configured" })
        ] }) : renderTree(filteredLocations) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 flex flex-col overflow-hidden", children: selectedNode ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-3 py-2 border-b border-border-ops-subtle bg-bg-ops-overlay", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Box, { className: "w-3.5 h-3.5 text-text-ops-muted" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-medium text-text-ops-muted uppercase tracking-wider", children: "Asset Inventory" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted", children: [
              "— ",
              selectedNode.code,
              ": ",
              selectedNode.name
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted", children: [
            assets.length,
            " asset",
            assets.length !== 1 ? "s" : ""
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-y-auto", children: inventoryLoading ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-8 text-text-ops-muted", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-6 h-6 mb-2 animate-spin" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "Loading inventory..." })
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
          AssetInventoryTable,
          {
            assets,
            onRelocate: setRelocateAsset,
            onViewHistory: handleViewCustody
          }
        ) })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center h-full text-text-ops-muted", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(MapPin, { className: "w-12 h-12 mb-3 opacity-30" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "Select a location to view its asset inventory" })
      ] }) })
    ] }),
    relocateAsset && /* @__PURE__ */ jsxRuntimeExports.jsx(
      RelocateAssetModal,
      {
        asset: relocateAsset,
        locations,
        onClose: () => setRelocateAsset(null),
        onRelocate: handleRelocate
      }
    ),
    custodyAsset && /* @__PURE__ */ jsxRuntimeExports.jsx(
      CustodyHistoryPanel,
      {
        asset: custodyAsset,
        entries: custodyEntries,
        loading: custodyLoading,
        onClose: () => {
          setCustodyAsset(null);
          setCustodyEntries([]);
        }
      }
    )
  ] });
};
export {
  LocationExplorerView as default
};
//# sourceMappingURL=LocationExplorerView-BduGtrkW.js.map
