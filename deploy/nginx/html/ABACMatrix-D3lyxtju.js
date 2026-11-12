import { j as jsxRuntimeExports, D as Shield, L as Lock, ab as Eye, bk as EyeOff, bx as Globe, Y as CircleCheckBig, T as TriangleAlert, c as clsx } from "./index-DwHrkWl2.js";
const Section = ({ title, icon, children }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mb-10", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "flex items-center gap-2 text-xl font-semibold text-text-ops-primary mb-4", children: [
    icon,
    title
  ] }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-4 text-text-ops-muted leading-relaxed", children })
] });
const InfoBox = ({ title, variant = "info", children }) => {
  const colors = {
    info: "border-sky-500/30 bg-sky-500/5",
    warning: "border-amber-500/30 bg-amber-500/5",
    success: "border-green-500/30 bg-green-500/5",
    danger: "border-red-500/30 bg-red-500/5"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: clsx("border rounded-lg p-4", colors[variant]), children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-sm font-semibold text-text-ops-primary mb-2", children: title }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-text-ops-muted", children })
  ] });
};
const ClassificationBadge = ({ level, color }) => /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: clsx("inline-block px-2 py-0.5 rounded text-xs font-mono font-bold", color), children: level });
const ABACMatrix = () => {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-4xl", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-8 pb-6 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-2xl font-bold text-text-ops-primary mb-2", children: "ABAC & Caveat Matrix Guide" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-text-ops-muted", children: "Understanding Attribute-Based Access Control, classification markings, caveat matching, and foreign disclosure interlocks." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Overview", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Attribute-Based Access Control (ABAC) is the primary authorization mechanism in the Eisenhower Portfolio Manager. Unlike role-based access control (RBAC), ABAC evaluates multiple attributes — security clearance, handling caveats, citizenship, and employer legal entity — to determine whether a user may access a specific node in the Work Breakdown Structure." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
        "A node is visible to a user only if ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "both" }),
        " conditions are met:"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("ol", { className: "list-decimal list-inside space-y-2 ml-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Clearance Level:" }),
          " The user's clearance level is greater than or equal to the node's security classification."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Caveat Matching:" }),
          " The node's handling caveats are a subset of the user's authorized caveats."
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(InfoBox, { title: "Security First", variant: "danger", children: 'If either condition fails, the node is considered inaccessible. The system never exposes classified data to unauthorized users — instead, it uses "ghost-node" masking to preserve tree structure while redacting sensitive content.' })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Security Classification Hierarchy", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Lock, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "The system uses a four-level security classification hierarchy. A user may access nodes at their clearance level and below, but never above." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children: [
        {
          level: "OFFICIAL",
          color: "bg-sky-500/20 text-sky-400 border border-sky-500/30",
          desc: "Unclassified official information. Lowest classification level."
        },
        {
          level: "OFFICIAL-SENSITIVE",
          color: "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30",
          desc: "Official information with additional handling restrictions."
        },
        {
          level: "SECRET",
          color: "bg-red-500/20 text-red-400 border border-red-500/30",
          desc: "Classified information. Compromise could cause serious damage."
        },
        {
          level: "TOP SECRET",
          color: "bg-purple-500/20 text-purple-400 border border-purple-500/30",
          desc: "Highest classification. Compromise could cause exceptionally grave damage."
        }
      ].map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-4 bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ClassificationBadge, { level: item.level, color: item.color }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: item.desc })
      ] }, item.level)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(InfoBox, { title: "Clearance Comparison", variant: "info", children: "The clearance hierarchy is implemented as an ordered comparison: OFFICIAL (0) < OFFICIAL-SENSITIVE (1) < SECRET (2) < TOP SECRET (3). A user with SECRET clearance (2) can access OFFICIAL, OFFICIAL-SENSITIVE, and SECRET nodes." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Caveat Matching Rules", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Eye, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Handling caveats are additional access restrictions beyond the base classification level. Common caveats include:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3", children: [
        { caveat: "UK_EYES_ONLY", desc: "Only UK citizens with appropriate clearance" },
        { caveat: "NOFORN", desc: "Not releasable to foreign nationals" },
        { caveat: "REL TO NATO", desc: "Releasable to NATO member nations only" },
        { caveat: "CODEWORD", desc: "Access restricted to codeword programme participants" }
      ].map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-mono text-sm text-text-ops-primary", children: item.caveat }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted mt-1", children: item.desc })
      ] }, item.caveat)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Subset Rule:" }),
        " A node's caveats must be a subset of the user's authorized caveats. For example:"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "list-disc list-inside space-y-2 ml-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          "Node caveats: ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "['UK_EYES_ONLY']" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
          "User caveats: ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "['UK_EYES_ONLY', 'NOFORN']" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-green-400", children: "✓ Access granted" }),
          " — node caveats are a subset of user caveats."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          "Node caveats: ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "['UK_EYES_ONLY', 'CODEWORD']" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
          "User caveats: ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "['UK_EYES_ONLY']" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-red-400", children: "✗ Access denied" }),
          " — user lacks CODEWORD caveat."
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Ghost-Node Hierarchy Preservation", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(EyeOff, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "When querying a sub-tree, the system must preserve the hierarchical structure even when the user lacks clearance for intermediate nodes. Without ghost-node masking, a user who can access child tasks but not their parent would see a broken tree structure." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(InfoBox, { title: "How Ghost-Node Masking Works", variant: "warning", children: [
        "When a user queries a tree and encounters a node they cannot access:",
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "1." }),
        " The system checks if the user has clearance for any descendants of the restricted node.",
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "2." }),
        ' If yes, the parent is returned as a "ghost node" with redacted data:',
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        "  • ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "name" }),
        " → ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "'[RESTRICTED]'" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        "  • ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "code" }),
        " → ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "'[RESTRICTED]'" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        "  • ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "custom_attributes" }),
        " → ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "'[RESTRICTED]'" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        "  • ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "is_masked" }),
        " → ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "true" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "3." }),
        " The child nodes that the user ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("em", { children: "can" }),
        " access are returned normally.",
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        "This ensures the tree rendering in the UI remains structurally intact, with masked nodes shown as greyed-out placeholders."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Foreign Disclosure Interlocks", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Globe, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Beyond classification and caveats, the system enforces international export control regulations to prevent unauthorized foreign disclosure of controlled technical data." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm border-collapse", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 text-text-ops-primary font-semibold", children: "Regime" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 text-text-ops-primary font-semibold", children: "Full Name" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 text-text-ops-primary font-semibold", children: "Scope" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("tbody", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "ITAR" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "International Traffic in Arms Regulations" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "US Munitions List items — strict US-person-only access" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "EAR_ECCN" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Export Administration Regulations / ECCN" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Dual-use items with Export Control Classification Numbers" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "UK_MILITARY_LIST" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "UK Military List" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "UK-controlled military equipment and technology" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "NOT_CONTROLLED" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Not Controlled" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "No export control restrictions apply" })
          ] })
        ] })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Citizenship Verification", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheckBig, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "For nodes under ITAR, EAR, or UK Military List control, the system verifies that all user citizenships (primary and dual) exist within the node's authorized nationalities list." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-green-500/30 rounded-lg p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheckBig, { className: "w-4 h-4 text-green-400" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-semibold text-green-400", children: "Access Granted" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm text-text-ops-muted", children: [
            "Node authorized nationalities: ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "['GB', 'US', 'AU']" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
            "User citizenships: ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "primary='GB', dual=['AU']" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
            "All citizenships are within the authorized list → access granted."
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-red-500/30 rounded-lg p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4 text-red-400" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-semibold text-red-400", children: "Access Denied — Export Control Violation" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm text-text-ops-muted", children: [
            "Node authorized nationalities: ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "['GB', 'US']" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
            "User citizenships: ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "primary='GB', dual=['CN']" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
            "Dual citizenship 'CN' is not authorized → HTTP 403 ExportControlViolationException."
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(InfoBox, { title: "Employer Licence Verification", variant: "info", children: [
        "For ITAR and EAR-controlled nodes, the system also verifies that the user's employer legal entity matches an authorized licensee under the node's TAA/MLA (Technical Assistance Agreement / Mutual Legal Assistance) reference.",
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        "Format: ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: '"TAA-2026-001: Entity A, Entity B"' }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        "Entities are parsed from the comma-separated list after the colon."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Export Control Denial Logging", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
        "Every rejected export control check is logged to the immutable ForensicAuditLog with the security marking ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "EXPORT_CONTROL_DENIAL" }),
        ". The log entry includes:"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "list-disc list-inside space-y-2 ml-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "User principal name (UPN) and client IP" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "Target entity type and ID" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "Export control regime (ITAR, EAR, UK Military List)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "Reason for denial (nationality mismatch, employer licence mismatch)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "SHA-256 chained hash for tamper-evident audit trail" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(InfoBox, { title: "Forensic Integrity", variant: "success", children: [
        "All audit log entries are cryptographically chained using SHA-256 hashing. Any tampering with a log entry breaks the hash chain, making unauthorized modifications detectable. The audit chain can be verified via",
        " ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "POST /api/v1/audit/verify-integrity" }),
        "."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Subcontractor Boundary Scoping", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "External tier-1/tier-2 subcontractors operate under a strict boundary tenant model. Subcontractor users are constrained to view and mutate only tasks where the vendor CAGE code matches their assigned organization." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs font-semibold uppercase tracking-wider text-text-ops-muted mb-2", children: "Visible to Subcontractor" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "text-sm text-text-ops-muted space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "• Tasks matching their CAGE code" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "• Contractual boundary work packages" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "• Their own progress and notes" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-red-500/30 rounded-lg p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs font-semibold uppercase tracking-wider text-red-400 mb-2", children: "Masked from Subcontractor" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "text-sm text-text-ops-muted space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "• Parent programme hierarchies" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "• Sibling work packages" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
              "• Prime EVM cost rates (→ ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "[RESTRICTED]" }),
              ")"
            ] })
          ] })
        ] })
      ] })
    ] })
  ] });
};
export {
  ABACMatrix as default
};
//# sourceMappingURL=ABACMatrix-D3lyxtju.js.map
