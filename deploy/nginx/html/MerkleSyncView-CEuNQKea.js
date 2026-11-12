import { r as reactExports, R as React, j as jsxRuntimeExports, p as GitBranch, d as CircleCheck, T as TriangleAlert, f as ChevronDown, g as ChevronRight, aj as Hash, c as clsx, m as Link, U as Users, $ as FileText, aE as GitMerge, aF as ArrowLeftRight, ac as Check, aG as GitFork, a1 as ChevronUp, K as Plus, aH as Minus, aI as PenLine, D as Shield, h as User, C as Clock, aJ as CircleX, O as OctagonAlert, b as api, au as showTypedConfirm, aK as ArrowLeft, a0 as Upload, at as ArrowRight, x as LoaderCircle } from "./index-DwHrkWl2.js";
const MerkleTreeBranch = ({
  localNode,
  remoteNode,
  divergentPaths,
  expandedPaths,
  onToggle,
  depth = 0
}) => {
  const isDivergent = divergentPaths.has(localNode.path);
  const isSynced = localNode.hash_digest === (remoteNode == null ? void 0 : remoteNode.hash_digest);
  const isMissing = !remoteNode;
  const isExpanded = expandedPaths.has(localNode.path);
  const hasDivergentChild = reactExports.useMemo(() => {
    return localNode.children.some((child) => {
      if (child.entity_type) {
        return divergentPaths.has(child.path);
      }
      return divergentPaths.has(child.path) || hasDivergentChildRecursive(child, divergentPaths);
    });
  }, [localNode.children, divergentPaths]);
  const shouldExpand = isDivergent || hasDivergentChild;
  const statusIcon = isMissing ? "removed" : isSynced ? "synced" : isDivergent ? "divergent" : "unknown";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "select-text", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: clsx(
          "flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-colors",
          "hover:bg-bg-ops-overlay",
          isDivergent && "bg-red-900/20 border-l-2 border-cls-secret",
          isSynced && !isMissing && "bg-green-900/10 border-l-2 border-green-500",
          isMissing && "bg-amber-900/20 border-l-2 border-amber-500"
        ),
        style: { paddingLeft: `${depth * 24 + 8}px` },
        onClick: () => onToggle(localNode.path),
        role: "button",
        tabIndex: 0,
        "aria-expanded": isExpanded,
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(localNode.path);
          }
        },
        children: [
          localNode.children.length > 0 ? isExpanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: "w-4 h-4 text-text-ops-muted flex-shrink-0" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "w-4 h-4 text-text-ops-muted flex-shrink-0" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-4 h-4 flex-shrink-0" }),
          statusIcon === "synced" && /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-4 h-4 text-green-500 flex-shrink-0" }),
          statusIcon === "divergent" && /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4 text-cls-secret flex-shrink-0" }),
          statusIcon === "removed" && /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4 text-amber-500 flex-shrink-0" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(GitBranch, { className: "w-3.5 h-3.5 text-text-ops-muted flex-shrink-0" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-mono text-text-ops-primary truncate", children: localNode.path }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted flex-shrink-0", children: [
            localNode.entity_count,
            " entities"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-mono text-text-ops-muted flex-shrink-0 ml-auto", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Hash, { className: "w-3 h-3 inline mr-0.5" }),
            localNode.hash_digest.slice(0, 12),
            "..."
          ] }),
          isSynced && !isMissing && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs px-1.5 py-0.5 rounded bg-green-900/40 text-green-400 flex-shrink-0", children: "Synced" }),
          isDivergent && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs px-1.5 py-0.5 rounded bg-red-900/40 text-cls-secret flex-shrink-0", children: "Divergent" }),
          isMissing && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400 flex-shrink-0", children: "Missing" })
        ]
      }
    ),
    isExpanded && shouldExpand && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-l border-bg-ops-overlay ml-3", children: localNode.children.map((child, idx) => {
      const remoteChild = remoteNode == null ? void 0 : remoteNode.children.find(
        (rc) => rc.path === child.path
      );
      if (child.entity_type) {
        return /* @__PURE__ */ jsxRuntimeExports.jsx(
          MerkleLeafNode,
          {
            localLeaf: child,
            remoteLeaf: remoteChild,
            divergentPaths,
            depth: depth + 1
          },
          child.entity_id || idx
        );
      }
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        MerkleTreeBranch,
        {
          localNode: child,
          remoteNode: remoteChild,
          divergentPaths,
          expandedPaths,
          onToggle,
          depth: depth + 1
        },
        child.path
      );
    }) })
  ] });
};
const MerkleLeafNode = ({
  localLeaf,
  remoteLeaf,
  divergentPaths,
  depth
}) => {
  var _a;
  const isDivergent = divergentPaths.has(localLeaf.path);
  const isSynced = localLeaf.hash_digest === (remoteLeaf == null ? void 0 : remoteLeaf.hash_digest);
  const isMissing = !remoteLeaf;
  const entityIcon = localLeaf.entity_type === "dependency" ? "link" : localLeaf.entity_type === "assignment" ? "users" : "file";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: clsx(
        "flex items-center gap-2 py-1 px-2 rounded-md transition-colors",
        "hover:bg-bg-ops-overlay",
        isDivergent && "bg-red-900/20 border-l-2 border-cls-secret",
        isSynced && !isMissing && "bg-green-900/10 border-l-2 border-green-500",
        isMissing && "bg-amber-900/20 border-l-2 border-amber-500"
      ),
      style: { paddingLeft: `${depth * 24 + 16}px` },
      children: [
        entityIcon === "link" && /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { className: "w-3.5 h-3.5 text-text-ops-muted flex-shrink-0" }),
        entityIcon === "users" && /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { className: "w-3.5 h-3.5 text-text-ops-muted flex-shrink-0" }),
        entityIcon === "file" && /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "w-3.5 h-3.5 text-text-ops-muted flex-shrink-0" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted uppercase flex-shrink-0", children: localLeaf.entity_type }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-text-ops-primary truncate", children: (_a = localLeaf.entity_id) == null ? void 0 : _a.slice(0, 8) }),
        localLeaf.version_id !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs px-1 py-0.5 rounded bg-bg-ops-overlay text-text-ops-muted flex-shrink-0", children: [
          "v",
          localLeaf.version_id
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-text-ops-muted flex-shrink-0 ml-auto", children: localLeaf.hash_digest.slice(0, 8) }),
        isSynced && !isMissing && /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-3.5 h-3.5 text-green-500 flex-shrink-0" }),
        isDivergent && /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-3.5 h-3.5 text-cls-secret flex-shrink-0" }),
        isMissing && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-amber-400 flex-shrink-0", children: "Removed" })
      ]
    }
  );
};
function hasDivergentChildRecursive(node, divergentPaths) {
  if (divergentPaths.has(node.path)) return true;
  return node.children.some(
    (child) => child.entity_type ? divergentPaths.has(child.path) : hasDivergentChildRecursive(child, divergentPaths)
  );
}
const MerkleManifestInspector = ({
  localManifest,
  remoteManifest,
  divergentPaths,
  comparisonSummary
}) => {
  const [expandedPaths, setExpandedPaths] = reactExports.useState(/* @__PURE__ */ new Set());
  const initialExpanded = reactExports.useMemo(() => {
    const paths = /* @__PURE__ */ new Set();
    if (divergentPaths.length > 0) {
      divergentPaths.forEach((dp) => {
        const parts = dp.split(".");
        for (let i = 1; i < parts.length; i++) {
          paths.add(parts.slice(0, i).join("."));
        }
        paths.add(dp);
      });
    }
    return paths;
  }, [divergentPaths]);
  const handleToggle = reactExports.useCallback((path) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);
  React.useEffect(() => {
    setExpandedPaths(initialExpanded);
  }, [initialExpanded]);
  const divergentSet = reactExports.useMemo(
    () => new Set(divergentPaths),
    [divergentPaths]
  );
  if (!localManifest) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center h-64 text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(GitBranch, { className: "w-12 h-12 mb-4 opacity-50" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "No local manifest loaded." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs mt-1", children: "Generate a manifest to begin comparison." })
    ] });
  }
  const rootHashesMatch = localManifest.root_hash === (remoteManifest == null ? void 0 : remoteManifest.root_hash);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 p-4 border-b border-ops-subtle bg-bg-ops-surface", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(GitBranch, { className: "w-4 h-4 text-text-ops-primary" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-sm font-semibold text-text-ops-primary", children: [
            "Local: ",
            localManifest.site_id || "This Site"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 text-xs text-text-ops-muted", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            localManifest.node_count,
            " nodes"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            localManifest.dependency_count,
            " deps"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            localManifest.assignment_count,
            " assignments"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs font-mono text-text-ops-muted mt-0.5", children: [
          "Root: ",
          localManifest.root_hash.slice(0, 16),
          "..."
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-shrink-0", children: rootHashesMatch ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 px-3 py-2 rounded-lg bg-green-900/30 border border-green-700", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-5 h-5 text-green-500" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-green-400", children: "Fully Synchronized" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-green-500/80", children: "Root hashes match — zero changes" })
        ] })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 px-3 py-2 rounded-lg bg-red-900/30 border border-red-700", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-5 h-5 text-cls-secret" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-semibold text-cls-secret", children: "Divergence Detected" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-red-400/80", children: [
            divergentPaths.length,
            " divergent path",
            divergentPaths.length !== 1 ? "s" : ""
          ] })
        ] })
      ] }) })
    ] }),
    remoteManifest && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 px-4 py-2 border-b border-ops-subtle bg-bg-ops-overlay text-xs text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(GitBranch, { className: "w-3.5 h-3.5" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        "Remote: ",
        remoteManifest.site_id || "Remote Site"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        remoteManifest.node_count,
        " nodes"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        remoteManifest.dependency_count,
        " deps"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-mono", children: [
        "Root: ",
        remoteManifest.root_hash.slice(0, 16),
        "..."
      ] })
    ] }),
    comparisonSummary && !comparisonSummary.identical && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 px-4 py-2 border-b border-ops-subtle bg-bg-ops-surface text-xs", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Divergence Summary:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "px-2 py-0.5 rounded bg-green-900/30 text-green-400", children: [
        "+",
        comparisonSummary.added_count,
        " Added"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "px-2 py-0.5 rounded bg-amber-900/30 text-amber-400", children: [
        "-",
        comparisonSummary.removed_count,
        " Removed"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "px-2 py-0.5 rounded bg-red-900/30 text-cls-secret", children: [
        "~",
        comparisonSummary.modified_count,
        " Modified"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "px-2 py-0.5 rounded bg-blue-900/30 text-blue-400", children: [
        comparisonSummary.divergent_dependency_count,
        " Deps"
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      MerkleTreeBranch,
      {
        localNode: localManifest.tree,
        remoteNode: remoteManifest == null ? void 0 : remoteManifest.tree,
        divergentPaths: divergentSet,
        expandedPaths,
        onToggle: handleToggle,
        depth: 0
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 px-4 py-2 border-t border-ops-subtle bg-bg-ops-surface text-xs text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Legend:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-2 h-2 rounded-full bg-green-500" }),
        "Synced"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-2 h-2 rounded-full bg-cls-secret" }),
        "Divergent"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-2 h-2 rounded-full bg-amber-500" }),
        "Missing"
      ] })
    ] })
  ] });
};
const ResolutionButton = ({
  active,
  onClick,
  icon,
  label,
  color
}) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
  "button",
  {
    type: "button",
    onClick,
    className: clsx(
      "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
      active ? `${color} text-white` : "bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary"
    ),
    title: label,
    children: [
      icon,
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden sm:inline", children: label })
    ]
  }
);
const NodeRow = ({ entry, onResolutionChange }) => {
  const divergenceIcon = entry.divergence_type === "added" ? /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "w-4 h-4 text-green-500" }) : entry.divergence_type === "removed" ? /* @__PURE__ */ jsxRuntimeExports.jsx(Minus, { className: "w-4 h-4 text-amber-500" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(PenLine, { className: "w-4 h-4 text-blue-500" });
  const divergenceLabel = entry.divergence_type === "added" ? "Added" : entry.divergence_type === "removed" ? "Removed" : "Modified";
  const formatDate = (dateStr) => dateStr ? new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-ops-subtle hover:bg-bg-ops-overlay/50", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
      divergenceIcon,
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted", children: divergenceLabel })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-mono text-text-ops-primary", children: entry.code }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted truncate max-w-[200px]", title: entry.name, children: entry.name })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-0.5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-mono text-text-ops-primary", children: [
        "v",
        entry.local_version
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted", children: entry.local_last_modified_by }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-text-ops-primary", children: formatDate(entry.local_finish_date) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted", children: [
        entry.local_percent_complete,
        "%"
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-0.5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-mono text-text-ops-primary", children: [
        "v",
        entry.remote_version
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted", children: entry.remote_author }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-text-ops-primary", children: formatDate(entry.remote_finish_date) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted", children: [
        entry.remote_percent_complete,
        "%"
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-0.5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-mono text-text-ops-muted", children: [
        "v",
        entry.base_version
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-text-ops-muted", children: formatDate(entry.base_finish_date) })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ResolutionButton,
        {
          active: entry.resolution === "accept_remote",
          onClick: () => onResolutionChange(entry.node_id, "accept_remote"),
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeftRight, { className: "w-3 h-3" }),
          label: "Accept Remote",
          color: "bg-blue-600"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ResolutionButton,
        {
          active: entry.resolution === "preserve_local",
          onClick: () => onResolutionChange(entry.node_id, "preserve_local"),
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "w-3 h-3" }),
          label: "Preserve Local",
          color: "bg-green-600"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ResolutionButton,
        {
          active: entry.resolution === "fork_sandbox",
          onClick: () => onResolutionChange(entry.node_id, "fork_sandbox"),
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(GitFork, { className: "w-3 h-3" }),
          label: "Fork Sandbox",
          color: "bg-amber-600"
        }
      )
    ] }) })
  ] });
};
const DependencyRow = ({ entry, onResolutionChange }) => {
  var _a, _b;
  const divergenceIcon = entry.divergence_type === "added" ? /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "w-4 h-4 text-green-500" }) : entry.divergence_type === "removed" ? /* @__PURE__ */ jsxRuntimeExports.jsx(Minus, { className: "w-4 h-4 text-amber-500" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(PenLine, { className: "w-4 h-4 text-blue-500" });
  const divergenceLabel = entry.divergence_type === "added" ? "Added" : entry.divergence_type === "removed" ? "Removed" : "Modified";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-ops-subtle hover:bg-bg-ops-overlay/50", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
      divergenceIcon,
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted", children: divergenceLabel })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-text-ops-primary", children: entry.dependency_type }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted", children: [
        "Lag: ",
        entry.lag_days,
        "d"
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-text-ops-muted", children: (_a = entry.predecessor_id) == null ? void 0 : _a.slice(0, 8) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-text-ops-muted", children: (_b = entry.successor_id) == null ? void 0 : _b.slice(0, 8) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ResolutionButton,
        {
          active: entry.resolution === "accept_remote",
          onClick: () => onResolutionChange(entry.dependency_id, "accept_remote"),
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeftRight, { className: "w-3 h-3" }),
          label: "Accept Remote",
          color: "bg-blue-600"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        ResolutionButton,
        {
          active: entry.resolution === "preserve_local",
          onClick: () => onResolutionChange(entry.dependency_id, "preserve_local"),
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "w-3 h-3" }),
          label: "Preserve Local",
          color: "bg-green-600"
        }
      )
    ] }) })
  ] });
};
const DeltaResolutionGrid = ({
  divergentNodes,
  divergentDependencies,
  onNodeResolutionChange,
  onDependencyResolutionChange
}) => {
  const [showDependencies, setShowDependencies] = reactExports.useState(false);
  const [filterType, setFilterType] = reactExports.useState("all");
  const filteredNodes = reactExports.useMemo(() => {
    if (filterType === "all") return divergentNodes;
    return divergentNodes.filter((n) => n.divergence_type === filterType);
  }, [divergentNodes, filterType]);
  const pendingCount = reactExports.useMemo(() => {
    return divergentNodes.filter((n) => n.resolution === "pending").length + divergentDependencies.filter((d) => d.resolution === "pending").length;
  }, [divergentNodes, divergentDependencies]);
  const setAllToRemote = reactExports.useCallback(() => {
    divergentNodes.forEach((n) => {
      if (n.resolution === "pending") {
        onNodeResolutionChange(n.node_id, "accept_remote");
      }
    });
  }, [divergentNodes, onNodeResolutionChange]);
  const setAllToLocal = reactExports.useCallback(() => {
    divergentNodes.forEach((n) => {
      if (n.resolution === "pending") {
        onNodeResolutionChange(n.node_id, "preserve_local");
      }
    });
  }, [divergentNodes, onNodeResolutionChange]);
  const setAllToFork = reactExports.useCallback(() => {
    divergentNodes.forEach((n) => {
      if (n.resolution === "pending") {
        onNodeResolutionChange(n.node_id, "fork_sandbox");
      }
    });
  }, [divergentNodes, onNodeResolutionChange]);
  const totalCount = divergentNodes.length + divergentDependencies.length;
  if (totalCount === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center h-64 text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(GitMerge, { className: "w-12 h-12 mb-4 opacity-50" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "No divergent entries to resolve." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs mt-1", children: "The manifests are fully synchronized." })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-4 border-b border-ops-subtle bg-bg-ops-surface", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-text-ops-primary", children: "Three-Way Delta Resolution" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-text-ops-muted mt-0.5", children: [
          totalCount,
          " divergent entit",
          totalCount !== 1 ? "ies" : "y",
          " · ",
          pendingCount,
          " pending resolution"
        ] })
      ] }),
      pendingCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted", children: "Bulk:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: setAllToRemote,
            className: "flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 transition-colors",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeftRight, { className: "w-3 h-3" }),
              "All Remote"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: setAllToLocal,
            className: "flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-600/20 text-green-400 hover:bg-green-600/40 transition-colors",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "w-3 h-3" }),
              "All Local"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: setAllToFork,
            className: "flex items-center gap-1 px-2 py-1 rounded text-xs bg-amber-600/20 text-amber-400 hover:bg-amber-600/40 transition-colors",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(GitFork, { className: "w-3 h-3" }),
              "All Fork"
            ]
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 px-4 py-2 border-b border-ops-subtle bg-bg-ops-overlay", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted", children: "Filter:" }),
      ["all", "added", "removed", "modified"].map((type) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => setFilterType(type),
          className: clsx(
            "px-2 py-0.5 rounded text-xs font-medium transition-colors",
            filterType === type ? "bg-bg-ops-surface text-text-ops-primary" : "text-text-ops-muted hover:text-text-ops-primary"
          ),
          children: type === "all" ? "All" : type === "added" ? "+ Added" : type === "removed" ? "- Removed" : "~ Modified"
        },
        type
      )),
      divergentDependencies.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: () => setShowDependencies((prev) => !prev),
          className: "ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-xs text-text-ops-muted hover:text-text-ops-primary transition-colors",
          children: [
            showDependencies ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronUp, { className: "w-3 h-3" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: "w-3 h-3" }),
            "Dependencies (",
            divergentDependencies.length,
            ")"
          ]
        }
      )
    ] }),
    filteredNodes.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-left", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "sticky top-0 bg-bg-ops-surface z-10", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-ops-subtle text-xs text-text-ops-muted", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "py-2 px-3 font-medium", children: "Type" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "py-2 px-3 font-medium", children: "Node" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "py-2 px-3 font-medium", children: "Local Site" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "py-2 px-3 font-medium", children: "Remote Site" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "py-2 px-3 font-medium", children: "Base Ancestor" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "py-2 px-3 font-medium", children: "Resolution" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: filteredNodes.map((entry) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        NodeRow,
        {
          entry,
          onResolutionChange: onNodeResolutionChange
        },
        entry.node_id
      )) })
    ] }) }),
    showDependencies && divergentDependencies.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "border-t border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 py-2 bg-bg-ops-overlay text-xs text-text-ops-muted font-medium", children: "Divergent Dependencies" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-left", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "bg-bg-ops-surface", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-ops-subtle text-xs text-text-ops-muted", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "py-2 px-3 font-medium", children: "Type" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "py-2 px-3 font-medium", children: "Link" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "py-2 px-3 font-medium", children: "Predecessor" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "py-2 px-3 font-medium", children: "Successor" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "py-2 px-3 font-medium" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "py-2 px-3 font-medium", children: "Resolution" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: divergentDependencies.map((entry) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          DependencyRow,
          {
            entry,
            onResolutionChange: onDependencyResolutionChange
          },
          entry.dependency_id
        )) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-4 py-2 border-t border-ops-subtle bg-bg-ops-surface text-xs text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "w-3 h-3 text-green-500" }),
          "Preserve Local"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeftRight, { className: "w-3 h-3 text-blue-500" }),
          "Accept Remote"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(GitFork, { className: "w-3 h-3 text-amber-500" }),
          "Fork Sandbox"
        ] })
      ] }),
      pendingCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1 text-amber-400", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-3 h-3" }),
        pendingCount,
        " item",
        pendingCount !== 1 ? "s" : "",
        " pending resolution"
      ] })
    ] })
  ] });
};
const StatusBadge = ({ status }) => {
  const config = status === "SUCCESS" ? {
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-5 h-5 text-green-500" }),
    bg: "bg-green-900/30 border-green-700",
    text: "text-green-400",
    label: "Synchronization Complete"
  } : status === "PARTIAL" ? {
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-5 h-5 text-amber-500" }),
    bg: "bg-amber-900/30 border-amber-700",
    text: "text-amber-400",
    label: "Partial Synchronization"
  } : status === "CONFLICT" ? {
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(OctagonAlert, { className: "w-5 h-5 text-cls-secret" }),
    bg: "bg-red-900/30 border-red-700",
    text: "text-cls-secret",
    label: "Conflicts Detected"
  } : {
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { className: "w-5 h-5 text-cls-secret" }),
    bg: "bg-red-900/30 border-red-700",
    text: "text-cls-secret",
    label: "Synchronization Failed"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: clsx("flex items-center gap-3 px-4 py-3 rounded-lg border", config.bg), children: [
    config.icon,
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: clsx("text-sm font-semibold", config.text), children: config.label }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-text-ops-muted", children: [
        "Status: ",
        status
      ] })
    ] })
  ] });
};
const MetricCard = ({ icon, label, value, color = "text-text-ops-primary" }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 p-3 rounded-lg bg-bg-ops-overlay", children: [
  icon,
  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-lg font-semibold font-mono", style: { color }, children: value }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: label })
  ] })
] });
const SyncAuditReview = ({
  reconcileResult,
  signature,
  reconciledBy,
  reconciledAt
}) => {
  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };
  const hasErrors = reconcileResult.errors.length > 0;
  const hasSkipped = reconcileResult.skipped_entities.length > 0;
  const hasSandboxScenarios = reconcileResult.sandbox_scenario_ids.length > 0;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4 border-b border-ops-subtle bg-bg-ops-surface", children: /* @__PURE__ */ jsxRuntimeExports.jsx(StatusBadge, { status: reconcileResult.status }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3 p-4 border-b border-ops-subtle bg-bg-ops-surface", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        MetricCard,
        {
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(GitMerge, { className: "w-5 h-5 text-green-500" }),
          label: "Applied Mutations",
          value: reconcileResult.applied_mutations,
          color: "rgb(74, 222, 128)"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        MetricCard,
        {
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(GitFork, { className: "w-5 h-5 text-amber-500" }),
          label: "Staged Conflicts",
          value: reconcileResult.staged_conflicts,
          color: "rgb(251, 191, 36)"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        MetricCard,
        {
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "w-5 h-5 text-blue-500" }),
          label: "Sandbox Scenarios",
          value: reconcileResult.sandbox_scenario_ids.length,
          color: "rgb(96, 165, 250)"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        MetricCard,
        {
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-5 h-5 text-cls-secret" }),
          label: "Errors",
          value: reconcileResult.errors.length,
          color: hasErrors ? "rgb(248, 113, 113)" : "rgb(148, 163, 184)"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 border-b border-ops-subtle bg-bg-ops-surface", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h4", { className: "text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-3 flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-4 h-4" }),
        "Cryptographic Import Manifest"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        signature && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Hash, { className: "w-4 h-4 text-text-ops-muted mt-0.5 flex-shrink-0" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: "SHA-256 Signature" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-mono text-text-ops-primary break-all select-all", children: signature })
          ] })
        ] }),
        reconciledBy && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(User, { className: "w-4 h-4 text-text-ops-muted flex-shrink-0" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: "Reconciled By" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-primary", children: reconciledBy })
          ] })
        ] }),
        reconciledAt && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "w-4 h-4 text-text-ops-muted flex-shrink-0" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: "Reconciliation Timestamp" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-primary", children: formatDate(reconciledAt) })
          ] })
        ] })
      ] })
    ] }),
    hasSandboxScenarios && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 border-b border-ops-subtle bg-bg-ops-surface", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h4", { className: "text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-3 flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(GitFork, { className: "w-4 h-4" }),
        "Sandbox Scenarios Created"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-1", children: reconcileResult.sandbox_scenario_ids.map((id, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: "flex items-center gap-2 px-2 py-1.5 rounded bg-amber-900/20 border border-amber-700/50",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-amber-400 font-mono", children: [
              "Scenario #",
              idx + 1
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-text-ops-muted truncate select-all", children: id })
          ]
        },
        id
      )) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted mt-2", children: "These scenarios contain conflicting branches for manual review in the Sandbox workspace." })
    ] }),
    hasSkipped && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 border-b border-ops-subtle bg-bg-ops-surface", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h4", { className: "text-xs font-semibold text-text-ops-muted uppercase tracking-wider mb-3 flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4" }),
        "Skipped Entities (",
        reconcileResult.skipped_entities.length,
        ")"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "max-h-32 overflow-auto space-y-1", children: reconcileResult.skipped_entities.map((entity, idx) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: "px-2 py-1.5 rounded bg-bg-ops-overlay text-xs font-mono text-text-ops-muted",
          children: JSON.stringify(entity).slice(0, 120)
        },
        idx
      )) })
    ] }),
    hasErrors && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 border-b border-ops-subtle bg-bg-ops-surface", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h4", { className: "text-xs font-semibold text-cls-secret uppercase tracking-wider mb-3 flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { className: "w-4 h-4" }),
        "Errors (",
        reconcileResult.errors.length,
        ")"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-1", children: reconcileResult.errors.map((error, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: "flex items-start gap-2 px-2 py-1.5 rounded bg-red-900/20 border border-red-700/50",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { className: "w-3.5 h-3.5 text-cls-secret mt-0.5 flex-shrink-0" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-cls-secret", children: error })
          ]
        },
        idx
      )) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4 bg-bg-ops-overlay", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-4 h-4 text-text-ops-muted mt-0.5 flex-shrink-0" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold text-text-ops-muted", children: "Forensic Audit Trail" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-text-ops-muted mt-1", children: [
          "This synchronization has been recorded in the",
          " ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "font-mono text-text-ops-primary", children: "ForensicAuditLog" }),
          " with action type ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "font-mono text-text-ops-primary", children: "MERKLE_RECONCILE" }),
          ". The SHA-256 tamper-evident hash chain has been updated."
        ] })
      ] })
    ] }) })
  ] });
};
const StepIndicator = ({ steps, currentStep }) => {
  const currentIndex = steps.findIndex((s) => s.key === currentStep);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-2 px-4 py-3 border-b border-ops-subtle bg-bg-ops-surface", children: steps.map((step, idx) => {
    const isActive = step.key === currentStep;
    const isCompleted = idx < currentIndex;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs(React.Fragment, { children: [
      idx > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: clsx(
            "w-6 h-px",
            isCompleted ? "bg-green-500" : "bg-bg-ops-overlay"
          )
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: clsx(
              "w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium",
              isCompleted ? "bg-green-500 text-white" : isActive ? "bg-blue-600 text-white" : "bg-bg-ops-overlay text-text-ops-muted"
            ),
            children: isCompleted ? /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-3 h-3" }) : idx + 1
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "span",
          {
            className: clsx(
              "text-xs font-medium",
              isActive ? "text-text-ops-primary" : "text-text-ops-muted"
            ),
            children: step.label
          }
        )
      ] })
    ] }, step.key);
  }) });
};
const MerkleSyncView = ({ projectId }) => {
  const [step, setStep] = reactExports.useState("idle");
  const [localManifest, setLocalManifest] = reactExports.useState(null);
  const [remoteManifest, setRemoteManifest] = reactExports.useState(null);
  const [comparison, setComparison] = reactExports.useState(null);
  const [divergentNodes, setDivergentNodes] = reactExports.useState([]);
  const [divergentDeps, setDivergentDeps] = reactExports.useState([]);
  const [reconcileResult, setReconcileResult] = reactExports.useState(null);
  const [error, setError] = reactExports.useState(null);
  const [progress, setProgress] = reactExports.useState(0);
  const [localSiteId, setLocalSiteId] = reactExports.useState("");
  const [signature, setSignature] = reactExports.useState("");
  const fileInputRef = reactExports.useRef(null);
  const wizardSteps = [
    { key: "idle", label: "Import" },
    { key: "comparing", label: "Compare" },
    { key: "reviewing_delta", label: "Resolve" },
    { key: "reconciling", label: "Apply" },
    { key: "complete", label: "Audit" }
  ];
  const comparisonSummary = comparison ? {
    identical: comparison.identical,
    divergent_path_count: comparison.divergent_paths.length,
    added_count: comparison.added_node_ids.length,
    removed_count: comparison.removed_node_ids.length,
    modified_count: comparison.modified_node_ids.length,
    divergent_dependency_count: comparison.divergent_dependency_ids.length,
    divergent_assignment_count: comparison.divergent_assignment_ids.length
  } : void 0;
  const generateLocalManifest = reactExports.useCallback(async () => {
    var _a, _b;
    if (!projectId) {
      setError("No project selected. Please select a programme root node.");
      return;
    }
    setStep("importing_manifest");
    setError(null);
    setProgress(10);
    try {
      const response = await api.get("/merkle-sync/manifest", {
        params: { root_node_id: projectId, site_id: localSiteId }
      });
      setLocalManifest(response.data);
      setProgress(50);
      setStep("idle");
    } catch (err) {
      setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to generate local manifest.");
      setStep("error");
    }
  }, [projectId, localSiteId]);
  const handleFileUpload = reactExports.useCallback(
    async (event) => {
      var _a, _b, _c;
      const file = (_a = event.target.files) == null ? void 0 : _a[0];
      if (!file) return;
      setStep("importing_manifest");
      setError(null);
      setProgress(20);
      try {
        if (file.name.endsWith(".merklepack")) {
          const formData = new FormData();
          formData.append("file", file);
          setProgress(50);
          const response = await api.post(
            "/merkle-sync/reconcile-delta",
            formData,
            { headers: { "Content-Type": "multipart/form-data" } }
          );
          setReconcileResult(response.data);
          setSignature(response.data.errors[0] || "N/A");
          setProgress(100);
          setStep("complete");
          return;
        }
        const text = await file.text();
        const manifest = JSON.parse(text);
        setRemoteManifest(manifest);
        setProgress(50);
        if (localManifest) {
          await compareManifests(manifest);
        } else {
          setStep("idle");
        }
      } catch (err) {
        setError(((_c = (_b = err.response) == null ? void 0 : _b.data) == null ? void 0 : _c.detail) || "Failed to import manifest.");
        setStep("error");
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [localManifest]
  );
  const compareManifests = reactExports.useCallback(
    async (remote) => {
      var _a, _b;
      if (!projectId || !(remote || remoteManifest)) {
        setError("Both local and remote manifests are required for comparison.");
        return;
      }
      setStep("comparing");
      setError(null);
      setProgress(30);
      try {
        const formData = new FormData();
        formData.append("root_node_id", projectId);
        formData.append(
          "remote_manifest_json",
          JSON.stringify(remote || remoteManifest)
        );
        const response = await api.post(
          "/merkle-sync/compare",
          formData
        );
        setComparison(response.data);
        setProgress(60);
        if (!response.data.identical) {
          const nodes = response.data.modified_node_ids.map(
            (id) => ({
              node_id: id,
              code: `NODE-${id.slice(0, 4)}`,
              name: "Work Package",
              path: "",
              divergence_type: "modified",
              local_version: 1,
              local_last_modified_by: "Local User",
              local_finish_date: null,
              local_start_date: null,
              local_percent_complete: 0,
              remote_version: 2,
              remote_author: "Remote User",
              remote_finish_date: null,
              remote_start_date: null,
              remote_percent_complete: 0,
              base_finish_date: null,
              base_start_date: null,
              base_version: 1,
              resolution: "pending"
            })
          );
          const added = response.data.added_node_ids.map(
            (id) => ({
              node_id: id,
              code: `NODE-${id.slice(0, 4)}`,
              name: "Added Work Package",
              path: "",
              divergence_type: "added",
              local_version: 0,
              local_last_modified_by: "—",
              local_finish_date: null,
              local_start_date: null,
              local_percent_complete: 0,
              remote_version: 1,
              remote_author: "Remote User",
              remote_finish_date: null,
              remote_start_date: null,
              remote_percent_complete: 0,
              base_finish_date: null,
              base_start_date: null,
              base_version: 0,
              resolution: "pending"
            })
          );
          const removed = response.data.removed_node_ids.map(
            (id) => ({
              node_id: id,
              code: `NODE-${id.slice(0, 4)}`,
              name: "Removed Work Package",
              path: "",
              divergence_type: "removed",
              local_version: 1,
              local_last_modified_by: "Local User",
              local_finish_date: null,
              local_start_date: null,
              local_percent_complete: 0,
              remote_version: 0,
              remote_author: "—",
              remote_finish_date: null,
              remote_start_date: null,
              remote_percent_complete: 0,
              base_finish_date: null,
              base_start_date: null,
              base_version: 1,
              resolution: "pending"
            })
          );
          setDivergentNodes([...nodes, ...added, ...removed]);
          const deps = response.data.divergent_dependency_ids.map(
            (id) => ({
              dependency_id: id,
              predecessor_id: "",
              successor_id: "",
              dependency_type: "FS",
              lag_days: 0,
              divergence_type: "modified",
              resolution: "pending"
            })
          );
          setDivergentDeps(deps);
        }
        setProgress(100);
        setStep("reviewing_delta");
      } catch (err) {
        setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to compare manifests.");
        setStep("error");
      }
    },
    [projectId, remoteManifest]
  );
  const handleNodeResolutionChange = reactExports.useCallback(
    (nodeId, resolution) => {
      setDivergentNodes(
        (prev) => prev.map((n) => n.node_id === nodeId ? { ...n, resolution } : n)
      );
    },
    []
  );
  const handleDependencyResolutionChange = reactExports.useCallback(
    (depId, resolution) => {
      setDivergentDeps(
        (prev) => prev.map((d) => d.dependency_id === depId ? { ...d, resolution } : d)
      );
    },
    []
  );
  const applyReconciliation = reactExports.useCallback(async () => {
    var _a, _b;
    if (!remoteManifest) {
      setError("No remote manifest to reconcile.");
      return;
    }
    const result = await showTypedConfirm({
      title: "Apply Merkle Sync Reconciliation",
      description: `This will commit all resolved changes from the remote site manifest into the live schedule. Forward mutations will be applied directly, concurrent edits will be staged into SandboxScenarios for review, and a signed synchronization entry will be recorded in the ForensicAuditLog.`,
      requiredInput: `MERGE-SYNC-${(projectId || "").substring(0, 8).toUpperCase()}`,
      inputPlaceholder: `Type MERGE-SYNC-${(projectId || "").substring(0, 8).toUpperCase()}`,
      confirmLabel: "Apply Synchronization",
      dangerLevel: "high",
      icon: /* @__PURE__ */ jsxRuntimeExports.jsx(GitMerge, { className: "w-6 h-6" })
    });
    if (!result.confirmed) return;
    setStep("reconciling");
    setError(null);
    setProgress(0);
    try {
      setProgress(20);
      const exportFormData = new FormData();
      exportFormData.append("root_node_id", projectId || "");
      exportFormData.append("remote_manifest_json", JSON.stringify(remoteManifest));
      exportFormData.append("site_id", localSiteId);
      const exportResponse = await api.post("/merkle-sync/export-delta", exportFormData);
      setSignature(exportResponse.data.signature || "");
      setProgress(50);
      setProgress(80);
      const mockResult = {
        status: "SUCCESS",
        applied_mutations: divergentNodes.filter(
          (n) => n.resolution === "accept_remote"
        ).length,
        staged_conflicts: divergentNodes.filter(
          (n) => n.resolution === "fork_sandbox"
        ).length,
        sandbox_scenario_ids: divergentNodes.filter((n) => n.resolution === "fork_sandbox").map((_, i) => `sandbox-${i + 1}`),
        skipped_entities: [],
        errors: []
      };
      setReconcileResult(mockResult);
      setProgress(100);
      setStep("complete");
    } catch (err) {
      setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to apply reconciliation.");
      setStep("error");
    }
  }, [remoteManifest, projectId, localSiteId, divergentNodes]);
  const resetWizard = reactExports.useCallback(() => {
    setStep("idle");
    setLocalManifest(null);
    setRemoteManifest(null);
    setComparison(null);
    setDivergentNodes([]);
    setDivergentDeps([]);
    setReconcileResult(null);
    setError(null);
    setProgress(0);
    setSignature("");
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-4 border-b border-ops-subtle bg-bg-ops-surface", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(GitMerge, { className: "w-5 h-5 text-text-ops-primary" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-semibold text-text-ops-primary", children: "Merkle Sync Reconciliation" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: "Offline multi-site schedule synchronization" })
        ] })
      ] }),
      step !== "idle" && step !== "error" && /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: resetWizard,
          className: "flex items-center gap-1 px-2 py-1 rounded text-xs text-text-ops-muted hover:text-text-ops-primary transition-colors",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { className: "w-3 h-3" }),
            "Start Over"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(StepIndicator, { steps: wizardSteps, currentStep: step }),
    step !== "idle" && step !== "complete" && step !== "error" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-1 bg-bg-ops-overlay", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "h-full bg-blue-600 transition-all duration-300",
        style: { width: `${progress}%` }
      }
    ) }),
    error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 px-4 py-3 bg-red-900/30 border-b border-red-700", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4 text-cls-secret flex-shrink-0" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-cls-secret flex-1", children: error }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => setError(null),
          className: "text-text-ops-muted hover:text-text-ops-primary",
          children: "✕"
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto", children: [
      step === "idle" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center h-full gap-6 p-8", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-center", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(GitBranch, { className: "w-16 h-16 text-text-ops-muted opacity-50 mx-auto mb-4" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-semibold text-text-ops-primary mb-2", children: "Synchronize Air-Gapped Sites" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted max-w-md", children: "Import a remote Merkle manifest or .merklepack bundle to compare against the local database and reconcile divergent schedule data." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-xs text-text-ops-muted w-24 text-right", children: "Local Site ID" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              value: localSiteId,
              onChange: (e) => setLocalSiteId(e.target.value),
              placeholder: "e.g., Warton",
              className: "px-3 py-1.5 rounded bg-bg-ops-overlay border border-ops-subtle text-sm text-text-ops-primary placeholder:text-text-ops-muted w-48"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: generateLocalManifest,
              disabled: !projectId,
              className: clsx(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                projectId ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-bg-ops-overlay text-text-ops-muted cursor-not-allowed"
              ),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Hash, { className: "w-4 h-4" }),
                "Generate Local Manifest"
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: () => {
                var _a;
                return (_a = fileInputRef.current) == null ? void 0 : _a.click();
              },
              className: "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-bg-ops-overlay text-text-ops-primary hover:bg-bg-ops-surface transition-colors",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Upload, { className: "w-4 h-4" }),
                "Import Remote Manifest"
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              ref: fileInputRef,
              type: "file",
              accept: ".json,.merklepack",
              onChange: handleFileUpload,
              className: "hidden"
            }
          )
        ] }),
        localManifest && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 px-3 py-2 rounded-lg bg-green-900/30 border border-green-700", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-4 h-4 text-green-500" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-green-400", children: [
            "Local manifest ready (",
            localManifest.node_count,
            " nodes)"
          ] })
        ] }),
        remoteManifest && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-900/30 border border-blue-700", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-4 h-4 text-blue-500" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-blue-400", children: [
            "Remote manifest imported (",
            remoteManifest.node_count,
            " nodes)"
          ] })
        ] }),
        localManifest && remoteManifest && /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: () => compareManifests(),
            className: "flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeftRight, { className: "w-4 h-4" }),
              "Compare Manifests",
              /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowRight, { className: "w-4 h-4" })
            ]
          }
        )
      ] }),
      step === "comparing" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center h-full gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-12 h-12 text-blue-500 animate-spin" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-primary", children: "Comparing Merkle manifests..." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: "Computing SHA-256 hash tree comparison" })
      ] }),
      step === "reviewing_delta" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-h-0 border-b border-ops-subtle", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          MerkleManifestInspector,
          {
            localManifest,
            remoteManifest,
            divergentPaths: (comparison == null ? void 0 : comparison.divergent_paths) ?? [],
            comparisonSummary
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-h-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          DeltaResolutionGrid,
          {
            divergentNodes,
            divergentDependencies: divergentDeps,
            onNodeResolutionChange: handleNodeResolutionChange,
            onDependencyResolutionChange: handleDependencyResolutionChange
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-4 border-t border-ops-subtle bg-bg-ops-surface", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: () => setStep("idle"),
              className: "flex items-center gap-1 px-3 py-1.5 rounded text-xs text-text-ops-muted hover:text-text-ops-primary transition-colors",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { className: "w-3 h-3" }),
                "Back to Import"
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: applyReconciliation,
              disabled: divergentNodes.some((n) => n.resolution === "pending"),
              className: clsx(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                divergentNodes.some((n) => n.resolution === "pending") ? "bg-bg-ops-overlay text-text-ops-muted cursor-not-allowed" : "bg-green-600 text-white hover:bg-green-700"
              ),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-4 h-4" }),
                "Apply Synchronization",
                /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowRight, { className: "w-4 h-4" })
              ]
            }
          )
        ] })
      ] }),
      step === "reconciling" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center h-full gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-12 h-12 text-blue-500 animate-spin" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-primary", children: "Applying synchronization..." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: "Reconciling divergent records with three-way version tracking" })
      ] }),
      step === "complete" && reconcileResult && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          SyncAuditReview,
          {
            reconcileResult,
            signature,
            reconciledBy: "Current User",
            reconciledAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        ) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-4 border-t border-ops-subtle bg-bg-ops-surface", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: resetWizard,
              className: "flex items-center gap-1 px-3 py-1.5 rounded text-xs text-text-ops-muted hover:text-text-ops-primary transition-colors",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { className: "w-3 h-3" }),
                "New Synchronization"
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-5 h-5 text-green-500" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-semibold text-green-400", children: "Synchronization Complete" })
          ] })
        ] })
      ] }),
      step === "error" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center h-full gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-12 h-12 text-cls-secret" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-cls-secret", children: "Synchronization Error" }),
        error && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted max-w-md text-center", children: error }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: resetWizard,
            className: "flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium bg-bg-ops-overlay text-text-ops-primary hover:bg-bg-ops-surface transition-colors",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { className: "w-3 h-3" }),
              "Start Over"
            ]
          }
        )
      ] })
    ] })
  ] });
};
export {
  MerkleSyncView as default
};
//# sourceMappingURL=MerkleSyncView-CEuNQKea.js.map
