import { j as jsxRuntimeExports, aR as HardDrive, $ as FileText, a2 as Download, a0 as Upload, ah as Key, T as TriangleAlert, Y as CircleCheckBig, D as Shield, c as clsx } from "./index-DwHrkWl2.js";
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
const Step = ({ number, title, children }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-4", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-shrink-0 w-8 h-8 rounded-full bg-bg-ops-overlay border border-border-ops-subtle flex items-center justify-center text-sm font-bold text-text-ops-primary", children: number }),
  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-sm font-semibold text-text-ops-primary mb-1", children: title }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-text-ops-muted", children })
  ] })
] });
const AirGapGuide = () => {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-4xl", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-8 pb-6 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-2xl font-bold text-text-ops-primary mb-2", children: "Air-Gap Export/Import Procedures" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-text-ops-muted", children: "Step-by-step instructions for secure cross-domain data transfers between air-gapped systems using .defpack bundles and cryptographic verification." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Overview", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(HardDrive, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "The Eisenhower Portfolio Manager supports secure data exchange between air-gapped systems (e.g., Site Warton, Site Hastings, Deployable Rigs) that cannot communicate over a network. Data is transferred via physical media — optical discs or USB diodes — using cryptographically signed .defpack bundles." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "The .defpack format ensures:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "list-disc list-inside space-y-2 ml-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Integrity:" }),
          " SHA-256 manifest of all exported data"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Authenticity:" }),
          " Cryptographic signature verification"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Classification control:" }),
          " Automatic redaction of data exceeding the target system's classification ceiling"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Replay attack prevention:" }),
          " Duplicate transaction ID detection"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(InfoBox, { title: "Security Warning", variant: "danger", children: "Never transfer .defpack files between systems of different classification levels without proper sanitization. The export process automatically redacts classified content, but the operator must verify the classification ceiling matches the target system's maximum permitted classification." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: ".defpack Bundle Format", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "A .defpack file is a ZIP archive containing three files:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs font-semibold uppercase tracking-wider text-sky-400 mb-1", children: "payload.json" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: 'The canonical JSON payload containing all exported data: PortfolioNodes, DependencyLinks, ResourceAssignments, PortfolioBaselines, and ForensicAuditLog entries. Schema version: "1.0".' })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1", children: "manifest.json" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "SHA-256 checksums of every entity in the payload, plus a root hash covering the entire manifest. Used to verify data integrity on import." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs font-semibold uppercase tracking-wider text-green-400 mb-1", children: "signature.bin" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Cryptographic signature of the manifest, generated using the server's private key or local HSM certificate. Verified against trusted sovereign certificate authorities on import." })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Export Procedure", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Download, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "To export a project for transfer to an air-gapped system:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 ml-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Step, { number: 1, title: "Select the Project", children: "Navigate to the project in the schedule view and identify the root PortfolioNode ID for the programme or project you wish to export." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Step, { number: 2, title: "Set Classification Ceiling", children: "Determine the maximum classification level of the target system. For example, if exporting from a SECRET system to an OFFICIAL-SENSITIVE system, set the ceiling to OFFICIAL-SENSITIVE." }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Step, { number: 3, title: "Generate the Bundle", children: [
          "Call the export endpoint:",
          /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded block mt-1", children: "POST /api/v1/airgap/export" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
          "Body: ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "{ project_id: &quot;...&quot;, classification_ceiling: &quot;OFFICIAL_SENSITIVE&quot; }" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
          /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
          "The system extracts the project sub-tree, redacts any nodes exceeding the classification ceiling, serializes the content, computes the SHA-256 manifest, and packages everything into a signed .defpack file."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Step, { number: 4, title: "Verify the Bundle", children: [
          "Before physical transfer, verify the bundle's integrity:",
          /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded block mt-1", children: "sha256sum project_2026-10-24.defpack" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
          "Record the checksum for verification on the receiving system."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Step, { number: 5, title: "Physical Transfer", children: "Copy the .defpack file to optical media or USB diode. Follow your organization's data diode procedures for cross-domain transfer." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(InfoBox, { title: "Classification Redaction", variant: "warning", children: [
        "During export, any node whose security classification exceeds the target ceiling is redacted: name, code, and custom_attributes are replaced with ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "'[RESTRICTED]'" }),
        ". The node's existence and structural position are preserved, but its content is hidden."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Import Procedure", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Upload, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "To import a .defpack bundle on the receiving air-gapped system:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 ml-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Step, { number: 1, title: "Verify Physical Media", children: "Ensure the .defpack file was received via authorized data diode procedures. Verify the SHA-256 checksum matches the recorded value from the exporting system." }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Step, { number: 2, title: "Upload the Bundle", children: [
          "Call the import endpoint:",
          /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded block mt-1", children: "POST /api/v1/airgap/import" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
          "The file is uploaded as multipart form data. Optionally specify a",
          " ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "parent_node_id" }),
          " ",
          "to reparent the imported tree under an existing node."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Step, { number: 3, title: "Automated Verification", children: [
          "The system automatically performs:",
          /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "list-disc list-inside space-y-1 mt-2 ml-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "Package signature verification against trusted certificate authorities" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "JSON schema validation against injection attacks" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "Duplicate transaction ID detection (replay attack prevention)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "Importer clearance verification" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Step, { number: 4, title: "Merge or Review", children: "If verification passes, the system merges imported nodes into the target PostgreSQL instance using ltree reparenting. A comprehensive AIRGAP_INGEST transaction is recorded in the ForensicAuditLog." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(InfoBox, { title: "Replay Attack Prevention", variant: "danger", children: "The system checks for duplicate transaction IDs. If a .defpack bundle has already been imported, re-importing it will be rejected. Each bundle can only be ingested once." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Merkle Tree Delta Synchronization", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Key, { className: "w-5 h-5" }), children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "For systems that exchange data regularly, the Merkle tree synchronization protocol minimizes transfer size by sending only the changed records." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 ml-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Step, { number: 1, title: "Generate Local Manifest", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "GET /api/v1/merkle-sync/manifest" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
          "Computes SHA-256 leaf hashes for every node, dependency, and assignment, then combines them upward along the ltree hierarchy to produce a single root digest."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Step, { number: 2, title: "Compare Manifests", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "POST /api/v1/merkle-sync/compare" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
          "Compares the local manifest against the remote manifest. If root hashes match, no transfer is needed. If they differ, the system traverses branch-by-branch to isolate the exact changed records."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Step, { number: 3, title: "Export Delta Pack", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "POST /api/v1/merkle-sync/export-delta" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
          "Packages only the divergent records into a signed .merklepack file."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Step, { number: 4, title: "Ingest Delta Pack", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "POST /api/v1/merkle-sync/reconcile-delta" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
          "Resolves mutations using three-way version tracking:",
          /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "list-disc list-inside space-y-1 mt-2 ml-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "Forward mutations (incoming version > local) are applied directly" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "Concurrent edits are staged into a SandboxScenario for review" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "Parentage changes trigger manual review" })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(InfoBox, { title: "Leaf Hash Formula", variant: "info", children: [
        "Each leaf hash is computed as:",
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded block mt-1", children: "SHA256(id + code + version_id + updated_at + planned_dates)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        "Any single-field change produces a completely different hash, ensuring even minor modifications are detected."
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Section, { title: "Security Considerations", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-5 h-5" }), children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-red-500/30 rounded-lg p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4 text-red-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-semibold text-red-400", children: "Classification Ceiling" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm text-text-ops-muted", children: [
          "Always set the classification ceiling to the ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "lower" }),
          " of the source and target system classifications. Exporting SECRET data to an OFFICIAL system without proper redaction constitutes a classification spillage incident."
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-amber-500/30 rounded-lg p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4 text-amber-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-semibold text-amber-400", children: "Physical Media Handling" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Optical media and USB diodes used for .defpack transfer must be handled according to your organization's classified media procedures. Media must be encrypted at rest and destroyed after verified transfer." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-bg-ops-surface border border-green-500/30 rounded-lg p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheckBig, { className: "w-4 h-4 text-green-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-semibold text-green-400", children: "Audit Trail" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm text-text-ops-muted", children: [
          "All export and import operations are recorded in the ForensicAuditLog with SHA-256 chained hashing. Export operations use action type",
          " ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "AIRGAP_EXPORT" }),
          " and imports use ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "text-xs bg-bg-ops-base px-1 py-0.5 rounded", children: "AIRGAP_INGEST" }),
          "."
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Section, { title: "Troubleshooting", icon: /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-5 h-5" }), children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm border-collapse", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 text-text-ops-primary font-semibold", children: "Error" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 text-text-ops-primary font-semibold", children: "Cause" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 text-text-ops-primary font-semibold", children: "Resolution" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("tbody", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "SIGNATURE_INVALID" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Bundle signature doesn't match manifest" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Re-export the bundle; verify no corruption during transfer" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "REPLAY_DETECTED" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Bundle already imported" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Generate a fresh export; each bundle is single-use" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "CLEARANCE_INSUFFICIENT" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Importer lacks clearance for bundle content" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Use an importer with sufficient clearance or re-export with lower ceiling" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: "SCHEMA_INVALID" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Payload doesn't match expected schema" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: "Bundle may be corrupted or from an incompatible version" })
        ] })
      ] })
    ] }) }) })
  ] });
};
export {
  AirGapGuide as default
};
//# sourceMappingURL=AirGapGuide-00mJRM0L.js.map
