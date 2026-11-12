import { r as reactExports, j as jsxRuntimeExports, c as clsx, by as Monitor, bn as Server, aZ as Database, aR as HardDrive, aM as Network, D as Shield, I as Info } from "./index-DwHrkWl2.js";
const nodes = [
  {
    id: "frontend",
    title: "React Frontend",
    description: "Vite + TypeScript SPA with Tailwind CSS",
    details: [
      "Virtualized WBS Grid (@tanstack/react-table)",
      "SVG/Canvas Gantt Chart with density tiers",
      "Zustand stores for state management",
      "WebSocket presence & cache invalidation",
      "SCIF hot-desking display profiles",
      "Offline-accessible Help Center"
    ],
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Monitor, { className: "w-5 h-5" }),
    color: "#38BDF8",
    hoverColor: "#0EA5E9"
  },
  {
    id: "api",
    title: "FastAPI Backend",
    description: "Python 3.11 async web server",
    details: [
      "37+ API routers (100+ endpoints)",
      "JWT authentication & PKI/mTLS support",
      "ABAC clearance enforcement",
      "CPM engine (NetworkX DAG)",
      "Monte Carlo SRA (NumPy/SciPy)",
      "Burgess-Killebrew resource leveling",
      "ANSI/EIA-748 EVM calculator",
      "Forensic audit log (SHA-256 chain)"
    ],
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Server, { className: "w-5 h-5" }),
    color: "#34D399",
    hoverColor: "#10B981"
  },
  {
    id: "database",
    title: "PostgreSQL / ltree",
    description: "Primary data store with hierarchical indexing",
    details: [
      "47+ tables with polymorphic inheritance",
      "ltree extension for WBS/RBS/LBS trees",
      "GiST indexes for path containment queries",
      "JSONB for custom attributes & ODAC",
      "Patroni HA cluster (3-node Raft)",
      "Continuous WAL archiving (AES-256)",
      "Point-in-time recovery (PITR)"
    ],
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Database, { className: "w-5 h-5" }),
    color: "#FBBF24",
    hoverColor: "#F59E0B"
  },
  {
    id: "minio",
    title: "MinIO Vault",
    description: "S3-compatible sovereign object store",
    details: [
      "Classified document artifacts",
      "AES-256 Server-Side Encryption (SSE-S3)",
      "Pre-signed upload/download URLs",
      "SHA-256 checksum verification",
      "ABAC-gated access control",
      "Export control citizenship checks"
    ],
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(HardDrive, { className: "w-5 h-5" }),
    color: "#A78BFA",
    hoverColor: "#8B5CF6"
  },
  {
    id: "redis",
    title: "Redis Cache",
    description: "High-speed message bus & session store",
    details: [
      "WebSocket presence partitioning",
      "Session inactivity tracking (15-min timeout)",
      "Background task distribution",
      "LRU cache (256MB)",
      "Sub-tree lock coordination"
    ],
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Network, { className: "w-5 h-5" }),
    color: "#F87171",
    hoverColor: "#EF4444"
  },
  {
    id: "security",
    title: "Security Layer",
    description: "Cross-cutting security controls",
    details: [
      "ABAC clearance hierarchy (4 levels)",
      "Caveat subset matching",
      "Ghost-node hierarchy preservation",
      "Export control (ITAR/EAR/UK Military List)",
      "Citizenship verification",
      "SHA-256 forensic audit chain",
      "SCIF inactivity & session revocation",
      "Spillage remediation (multi-sig purge)"
    ],
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-5 h-5" }),
    color: "#FB923C",
    hoverColor: "#F97316"
  }
];
const InfoPanel = ({ node }) => {
  if (!node) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-6 h-full flex flex-col items-center justify-center text-center", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Info, { className: "w-8 h-8 text-text-ops-muted mb-3" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-text-ops-primary mb-2", children: "Architecture Details" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted max-w-xs", children: "Click on any architectural node in the diagram to see its components, services, and security boundaries." })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 mb-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: "w-10 h-10 rounded-lg flex items-center justify-center",
          style: { backgroundColor: `${node.color}20`, color: node.color },
          children: node.icon
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-base font-semibold text-text-ops-primary", children: node.title }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: node.description })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-2", children: node.details.map((detail, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-start gap-2 text-sm text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { style: { color: node.color }, className: "mt-1 flex-shrink-0", children: "•" }),
      detail
    ] }, i)) })
  ] });
};
const ArchitectureBlueprint = () => {
  const [selectedNode, setSelectedNode] = reactExports.useState(null);
  const handleNodeClick = reactExports.useCallback((id) => {
    setSelectedNode((prev) => prev === id ? null : id);
  }, []);
  const selectedNodeInfo = nodes.find((n) => n.id === selectedNode) || null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "h-full flex flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-6 pb-4 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-2xl font-bold text-text-ops-primary mb-2", children: "System Architecture Blueprint" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-text-ops-muted", children: "Interactive topology diagram showing data flow between system components. Click on any node to see its services, tables, and security boundaries." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 flex gap-6 overflow-auto", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-w-[600px]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "svg",
        {
          viewBox: "0 0 800 500",
          className: "w-full h-auto",
          role: "img",
          "aria-label": "System architecture diagram",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("defs", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "marker",
                {
                  id: "arrowhead",
                  markerWidth: "10",
                  markerHeight: "7",
                  refX: "10",
                  refY: "3.5",
                  orient: "auto",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx("polygon", { points: "0 0, 10 3.5, 0 7", fill: "#64748B" })
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "marker",
                {
                  id: "arrowhead-highlight",
                  markerWidth: "10",
                  markerHeight: "7",
                  refX: "10",
                  refY: "3.5",
                  orient: "auto",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx("polygon", { points: "0 0, 10 3.5, 0 7", fill: "#FBBF24" })
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("pattern", { id: "grid", width: "20", height: "20", patternUnits: "userSpaceOnUse", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M 20 0 L 0 0 0 20", fill: "none", stroke: "#1E293B", strokeWidth: "0.5" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("rect", { width: "100%", height: "100%", fill: "url(#grid)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "line",
              {
                x1: "200",
                y1: "150",
                x2: "350",
                y2: "150",
                stroke: selectedNode === "frontend" || selectedNode === "api" ? "#FBBF24" : "#475569",
                strokeWidth: "2",
                markerEnd: "url(#arrowhead)",
                style: { transition: "stroke 0.2s" }
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "line",
              {
                x1: "350",
                y1: "160",
                x2: "200",
                y2: "160",
                stroke: selectedNode === "frontend" || selectedNode === "api" ? "#FBBF24" : "#475569",
                strokeWidth: "2",
                markerEnd: "url(#arrowhead)",
                style: { transition: "stroke 0.2s" }
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "line",
              {
                x1: "450",
                y1: "150",
                x2: "550",
                y2: "250",
                stroke: selectedNode === "api" || selectedNode === "database" ? "#FBBF24" : "#475569",
                strokeWidth: "2",
                markerEnd: "url(#arrowhead)",
                style: { transition: "stroke 0.2s" }
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "line",
              {
                x1: "550",
                y1: "260",
                x2: "450",
                y2: "160",
                stroke: selectedNode === "api" || selectedNode === "database" ? "#FBBF24" : "#475569",
                strokeWidth: "2",
                markerEnd: "url(#arrowhead)",
                style: { transition: "stroke 0.2s" }
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "line",
              {
                x1: "450",
                y1: "150",
                x2: "550",
                y2: "400",
                stroke: selectedNode === "api" || selectedNode === "minio" ? "#FBBF24" : "#475569",
                strokeWidth: "2",
                markerEnd: "url(#arrowhead)",
                style: { transition: "stroke 0.2s" }
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "line",
              {
                x1: "550",
                y1: "410",
                x2: "450",
                y2: "160",
                stroke: selectedNode === "api" || selectedNode === "minio" ? "#FBBF24" : "#475569",
                strokeWidth: "2",
                markerEnd: "url(#arrowhead)",
                style: { transition: "stroke 0.2s" }
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "line",
              {
                x1: "450",
                y1: "150",
                x2: "650",
                y2: "150",
                stroke: selectedNode === "api" || selectedNode === "redis" ? "#FBBF24" : "#475569",
                strokeWidth: "2",
                markerEnd: "url(#arrowhead)",
                style: { transition: "stroke 0.2s" }
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "line",
              {
                x1: "650",
                y1: "160",
                x2: "450",
                y2: "160",
                stroke: selectedNode === "api" || selectedNode === "redis" ? "#FBBF24" : "#475569",
                strokeWidth: "2",
                markerEnd: "url(#arrowhead)",
                style: { transition: "stroke 0.2s" }
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "rect",
              {
                x: "50",
                y: "50",
                width: "700",
                height: "400",
                fill: "none",
                stroke: selectedNode === "security" ? "#FB923C" : "#334155",
                strokeWidth: "2",
                strokeDasharray: "8 4",
                rx: "12",
                style: { transition: "stroke 0.2s" }
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "text",
              {
                x: "60",
                y: "75",
                fill: selectedNode === "security" ? "#FB923C" : "#64748B",
                fontSize: "11",
                fontWeight: "600",
                style: { transition: "fill 0.2s" },
                children: "SECURITY BOUNDARY"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "g",
              {
                onClick: () => handleNodeClick("frontend"),
                className: "cursor-pointer",
                role: "button",
                "aria-label": "React Frontend",
                tabIndex: 0,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "rect",
                    {
                      x: "100",
                      y: "100",
                      width: "200",
                      height: "100",
                      rx: "12",
                      fill: selectedNode === "frontend" ? "#38BDF820" : "#1E293B",
                      stroke: selectedNode === "frontend" ? "#38BDF8" : "#334155",
                      strokeWidth: "2",
                      style: { transition: "all 0.2s" }
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("text", { x: "200", y: "140", textAnchor: "middle", fill: "#F8FAFC", fontSize: "14", fontWeight: "600", children: "React Frontend" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("text", { x: "200", y: "160", textAnchor: "middle", fill: "#94A3B8", fontSize: "11", children: "Vite + TypeScript" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("text", { x: "200", y: "178", textAnchor: "middle", fill: "#94A3B8", fontSize: "10", children: "Tailwind CSS" })
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "g",
              {
                onClick: () => handleNodeClick("api"),
                className: "cursor-pointer",
                role: "button",
                "aria-label": "FastAPI Backend",
                tabIndex: 0,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "rect",
                    {
                      x: "350",
                      y: "100",
                      width: "200",
                      height: "100",
                      rx: "12",
                      fill: selectedNode === "api" ? "#34D39920" : "#1E293B",
                      stroke: selectedNode === "api" ? "#34D399" : "#334155",
                      strokeWidth: "2",
                      style: { transition: "all 0.2s" }
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("text", { x: "450", y: "140", textAnchor: "middle", fill: "#F8FAFC", fontSize: "14", fontWeight: "600", children: "FastAPI Backend" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("text", { x: "450", y: "160", textAnchor: "middle", fill: "#94A3B8", fontSize: "11", children: "Python 3.11" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("text", { x: "450", y: "178", textAnchor: "middle", fill: "#94A3B8", fontSize: "10", children: "37+ Routers" })
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "g",
              {
                onClick: () => handleNodeClick("database"),
                className: "cursor-pointer",
                role: "button",
                "aria-label": "PostgreSQL Database",
                tabIndex: 0,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "rect",
                    {
                      x: "550",
                      y: "200",
                      width: "200",
                      height: "100",
                      rx: "12",
                      fill: selectedNode === "database" ? "#FBBF2420" : "#1E293B",
                      stroke: selectedNode === "database" ? "#FBBF24" : "#334155",
                      strokeWidth: "2",
                      style: { transition: "all 0.2s" }
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("text", { x: "650", y: "240", textAnchor: "middle", fill: "#F8FAFC", fontSize: "14", fontWeight: "600", children: "PostgreSQL" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("text", { x: "650", y: "260", textAnchor: "middle", fill: "#94A3B8", fontSize: "11", children: "ltree + GiST Index" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("text", { x: "650", y: "278", textAnchor: "middle", fill: "#94A3B8", fontSize: "10", children: "47+ Tables" })
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "g",
              {
                onClick: () => handleNodeClick("minio"),
                className: "cursor-pointer",
                role: "button",
                "aria-label": "MinIO Vault",
                tabIndex: 0,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "rect",
                    {
                      x: "550",
                      y: "350",
                      width: "200",
                      height: "100",
                      rx: "12",
                      fill: selectedNode === "minio" ? "#A78BFA20" : "#1E293B",
                      stroke: selectedNode === "minio" ? "#A78BFA" : "#334155",
                      strokeWidth: "2",
                      style: { transition: "all 0.2s" }
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("text", { x: "650", y: "390", textAnchor: "middle", fill: "#F8FAFC", fontSize: "14", fontWeight: "600", children: "MinIO Vault" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("text", { x: "650", y: "410", textAnchor: "middle", fill: "#94A3B8", fontSize: "11", children: "S3-Compatible" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("text", { x: "650", y: "428", textAnchor: "middle", fill: "#94A3B8", fontSize: "10", children: "AES-256 SSE-S3" })
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "g",
              {
                onClick: () => handleNodeClick("redis"),
                className: "cursor-pointer",
                role: "button",
                "aria-label": "Redis Cache",
                tabIndex: 0,
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "rect",
                    {
                      x: "650",
                      y: "100",
                      width: "100",
                      height: "80",
                      rx: "12",
                      fill: selectedNode === "redis" ? "#F8717120" : "#1E293B",
                      stroke: selectedNode === "redis" ? "#F87171" : "#334155",
                      strokeWidth: "2",
                      style: { transition: "all 0.2s" }
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("text", { x: "700", y: "135", textAnchor: "middle", fill: "#F8FAFC", fontSize: "12", fontWeight: "600", children: "Redis" }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx("text", { x: "700", y: "155", textAnchor: "middle", fill: "#94A3B8", fontSize: "10", children: "Cache & Sessions" })
                ]
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("text", { x: "275", y: "140", textAnchor: "middle", fill: "#64748B", fontSize: "9", children: "HTTP/WebSocket" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("text", { x: "500", y: "195", textAnchor: "middle", fill: "#64748B", fontSize: "9", children: "psycopg2" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("text", { x: "500", y: "340", textAnchor: "middle", fill: "#64748B", fontSize: "9", children: "boto3 / S3" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("text", { x: "550", y: "140", textAnchor: "middle", fill: "#64748B", fontSize: "9", children: "Redis protocol" })
          ]
        }
      ) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-80 flex-shrink-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(InfoPanel, { node: selectedNodeInfo }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 pt-4 border-t border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-text-ops-primary mb-3", children: "Legend" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-4", children: nodes.map((node) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => handleNodeClick(node.id),
          className: clsx(
            "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors",
            selectedNode === node.id ? "bg-bg-ops-overlay text-text-ops-primary" : "text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay"
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                className: "w-2.5 h-2.5 rounded-full",
                style: { backgroundColor: node.color }
              }
            ),
            node.title
          ]
        },
        node.id
      )) })
    ] })
  ] });
};
export {
  ArchitectureBlueprint as default
};
//# sourceMappingURL=ArchitectureBlueprint-5FxtdX54.js.map
