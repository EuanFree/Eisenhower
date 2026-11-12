import { r as reactExports, b as api, j as jsxRuntimeExports, D as Shield, X, L as Lock, a0 as Upload, x as LoaderCircle, $ as FileText, C as Clock, c as clsx, aj as Hash, d as CircleCheck, i as CircleAlert, aD as File, a2 as Download } from "./index-DwHrkWl2.js";
const CLASS_COLORS = {
  OFFICIAL: "text-sky-400 bg-sky-500/10 border-sky-500/30",
  OFFICIAL_SENSITIVE: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  SECRET: "text-red-400 bg-red-500/10 border-red-500/30",
  TOP_SECRET: "text-purple-400 bg-purple-500/10 border-purple-500/30"
};
const CLASS_BORDER_COLORS = {
  OFFICIAL: "border-l-sky-500",
  OFFICIAL_SENSITIVE: "border-l-cyan-500",
  SECRET: "border-l-red-500",
  TOP_SECRET: "border-l-purple-500"
};
const EXPORT_COLORS = {
  ITAR: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  EAR_ECCN: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  UK_MILITARY_LIST: "text-red-400 bg-red-500/10 border-red-500/30",
  OPEN_GENERAL: "text-green-400 bg-green-500/10 border-green-500/30",
  NOT_CONTROLLED: "text-text-ops-muted bg-bg-ops-overlay border-border-ops-subtle"
};
const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const computeSHA256 = async (file) => {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};
const ArtifactItemRow = ({ artifact, onDownload }) => {
  var _a;
  const [downloading, setDownloading] = reactExports.useState(false);
  const [downloadError, setDownloadError] = reactExports.useState(null);
  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      await onDownload(artifact);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: clsx(
        "flex items-start gap-3 p-3 rounded-md border border-border-ops-subtle bg-bg-ops-overlay hover:bg-bg-ops-surface transition-colors border-l-4",
        CLASS_BORDER_COLORS[artifact.security_classification]
      ),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-shrink-0 mt-0.5", children: /* @__PURE__ */ jsxRuntimeExports.jsx(File, { className: "w-5 h-5 text-text-ops-muted" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 min-w-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-2 mb-1", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-text-ops-primary truncate font-medium", children: artifact.file_name }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                className: clsx(
                  "px-1.5 py-0.5 rounded text-[10px] font-medium border",
                  CLASS_COLORS[artifact.security_classification]
                ),
                children: artifact.security_classification
              }
            ),
            artifact.export_control_regime !== "NOT_CONTROLLED" && /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "span",
              {
                className: clsx(
                  "px-1.5 py-0.5 rounded text-[10px] font-medium border flex items-center gap-1",
                  EXPORT_COLORS[artifact.export_control_regime]
                ),
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(Lock, { className: "w-3 h-3" }),
                  artifact.export_control_regime
                ]
              }
            ),
            (_a = artifact.caveats) == null ? void 0 : _a.map((caveat) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                className: "px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/10 border border-orange-500/30 text-orange-400",
                children: caveat
              },
              caveat
            ))
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 mt-1.5 text-[10px] text-text-ops-muted", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: formatFileSize(artifact.file_size_bytes) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: artifact.mime_type }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "w-3 h-3" }),
              new Date(artifact.created_at).toLocaleDateString()
            ] }),
            artifact.uploaded_by_user_name && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
              "by ",
              artifact.uploaded_by_user_name
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 mt-1 text-[10px] font-mono text-text-ops-muted/60", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Hash, { className: "w-3 h-3" }),
            artifact.sha256_checksum.slice(0, 16),
            "..."
          ] }),
          !artifact.is_active && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 mt-1 text-[10px] text-amber-400", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(CircleAlert, { className: "w-3 h-3" }),
            "Pending verification"
          ] }),
          downloadError && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-1 mt-1 text-[10px] text-red-400", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(CircleAlert, { className: "w-3 h-3 mt-0.5 flex-shrink-0" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: downloadError })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-shrink-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: handleDownload,
            disabled: downloading || !artifact.is_active,
            className: clsx(
              "p-2 rounded-md transition-colors",
              downloading ? "text-blue-400 cursor-wait" : !artifact.is_active ? "text-text-ops-muted/30 cursor-not-allowed" : "text-text-ops-muted hover:text-blue-400 hover:bg-bg-ops-overlay"
            ),
            title: artifact.is_active ? "Download (60s expiry)" : "Not yet verified",
            children: downloading ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-4 h-4 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Download, { className: "w-4 h-4" })
          }
        ) })
      ]
    }
  );
};
const UploadForm = ({ portfolioNodeId, cdrlId, onSuccess }) => {
  const [step, setStep] = reactExports.useState("idle");
  const [file, setFile] = reactExports.useState(null);
  const [classification, setClassification] = reactExports.useState("OFFICIAL");
  const [caveats, setCaveats] = reactExports.useState("");
  const [exportControl, setExportControl] = reactExports.useState("NOT_CONTROLLED");
  const [progress, setProgress] = reactExports.useState(0);
  const [error, setError] = reactExports.useState(null);
  const [checksum, setChecksum] = reactExports.useState(null);
  const fileInputRef = reactExports.useRef(null);
  const resetForm = reactExports.useCallback(() => {
    setStep("idle");
    setFile(null);
    setClassification("OFFICIAL");
    setCaveats("");
    setExportControl("NOT_CONTROLLED");
    setProgress(0);
    setError(null);
    setChecksum(null);
  }, []);
  const handleFileSelect = reactExports.useCallback((e) => {
    var _a;
    const selected = (_a = e.target.files) == null ? void 0 : _a[0];
    if (selected) {
      setFile(selected);
      setStep("selecting");
      setError(null);
    }
  }, []);
  const handleUpload = reactExports.useCallback(async () => {
    if (!file) return;
    try {
      setStep("requesting-url");
      setProgress(10);
      const sha256 = await computeSHA256(file);
      setChecksum(sha256);
      setProgress(20);
      const uploadRequest = {
        file_name: file.name,
        file_size_bytes: file.size,
        mime_type: file.type || "application/octet-stream",
        security_classification: classification,
        caveats: caveats ? caveats.split(",").map((c) => c.trim().toUpperCase()) : null,
        export_control_regime: exportControl,
        portfolio_node_id: portfolioNodeId,
        cdrl_id: cdrlId
      };
      const uploadResponse = await api.post(
        "/api/v1/artifacts/request-upload",
        uploadRequest
      );
      setProgress(30);
      const { upload_url, artifact_id } = uploadResponse.data;
      setStep("uploading");
      setProgress(40);
      const xhr = new XMLHttpRequest();
      const xhrPromise = new Promise((resolve, reject) => {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const pct = Math.round(event.loaded / event.total * 50) + 40;
            setProgress(pct);
          }
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`S3 upload failed: ${xhr.status} ${xhr.statusText}`));
          }
        });
        xhr.addEventListener("error", () => reject(new Error("S3 upload failed")));
        xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));
      });
      xhr.open("PUT", upload_url);
      xhr.send(file);
      await xhrPromise;
      setProgress(90);
      setStep("confirming");
      const confirmRequest = {
        artifact_id,
        sha256_checksum: sha256
      };
      await api.post(
        "/api/v1/artifacts/confirm-upload",
        confirmRequest
      );
      setProgress(100);
      setStep("done");
      setTimeout(() => {
        onSuccess();
        resetForm();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStep("idle");
    }
  }, [file, classification, caveats, exportControl, portfolioNodeId, cdrlId, onSuccess]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-4", children: step === "idle" || step === "selecting" ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        onClick: () => {
          var _a;
          return (_a = fileInputRef.current) == null ? void 0 : _a.click();
        },
        className: clsx(
          "flex flex-col items-center justify-center p-6 rounded-md border-2 border-dashed cursor-pointer transition-colors",
          file ? "border-blue-500/50 bg-blue-500/5" : "border-border-ops-subtle hover:border-border-ops-strong hover:bg-bg-ops-overlay"
        ),
        role: "button",
        tabIndex: 0,
        "aria-label": "Select file to upload",
        onKeyDown: (e) => {
          var _a;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            (_a = fileInputRef.current) == null ? void 0 : _a.click();
          }
        },
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              ref: fileInputRef,
              type: "file",
              onChange: handleFileSelect,
              className: "hidden",
              "aria-hidden": "true"
            }
          ),
          file ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "w-8 h-8 mb-2 text-blue-400" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-primary truncate max-w-full", children: file.name }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-text-ops-muted mt-1", children: [
              formatFileSize(file.size),
              " · ",
              file.type || "unknown type"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-blue-400 mt-2", children: "Click to change file" })
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Upload, { className: "w-8 h-8 mb-2 text-text-ops-muted" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-primary", children: "Click to select a file" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted mt-1", children: "or drag and drop" })
          ] })
        ]
      }
    ),
    file && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-text-ops-muted uppercase tracking-wider mb-1.5", children: "Security Classification" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "select",
          {
            value: classification,
            onChange: (e) => setClassification(e.target.value),
            className: "w-full px-3 py-2 rounded-md bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:ring-1 focus:ring-blue-500",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "OFFICIAL", children: "OFFICIAL" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "OFFICIAL_SENSITIVE", children: "OFFICIAL-SENSITIVE" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "SECRET", children: "SECRET" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "TOP_SECRET", children: "TOP SECRET" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-text-ops-muted uppercase tracking-wider mb-1.5", children: "Caveats (comma-separated)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: caveats,
            onChange: (e) => setCaveats(e.target.value),
            placeholder: "e.g., UK_EYES_ONLY, NOFORN",
            className: "w-full px-3 py-2 rounded-md bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-text-ops-muted uppercase tracking-wider mb-1.5", children: "Export Control" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "select",
          {
            value: exportControl,
            onChange: (e) => setExportControl(e.target.value),
            className: "w-full px-3 py-2 rounded-md bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:ring-1 focus:ring-blue-500",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "NOT_CONTROLLED", children: "Not Controlled" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "ITAR", children: "ITAR" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "EAR_ECCN", children: "EAR ECCN" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "UK_MILITARY_LIST", children: "UK Military List" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "OPEN_GENERAL", children: "Open General" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: handleUpload,
          className: "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Upload, { className: "w-4 h-4" }),
            "Upload Document"
          ]
        }
      )
    ] })
  ] }) : (
    /* Progress */
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-5 h-5 text-blue-400 animate-spin" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm text-text-ops-primary", children: [
            step === "requesting-url" && "Preparing secure upload...",
            step === "uploading" && "Uploading to secure storage...",
            step === "confirming" && "Verifying file integrity...",
            step === "done" && "Upload complete!"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-text-ops-muted mt-0.5", children: [
            file == null ? void 0 : file.name,
            " (",
            formatFileSize((file == null ? void 0 : file.size) || 0),
            ")"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-full h-2 bg-bg-ops-overlay rounded-full overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: clsx(
            "h-full rounded-full transition-all duration-300",
            step === "done" ? "bg-green-500" : "bg-blue-500"
          ),
          style: { width: `${progress}%` },
          role: "progressbar",
          "aria-valuenow": progress,
          "aria-valuemin": 0,
          "aria-valuemax": 100
        }
      ) }),
      checksum && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 text-[10px] font-mono text-text-ops-muted/60", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Hash, { className: "w-3 h-3" }),
        "SHA-256: ",
        checksum.slice(0, 32),
        "..."
      ] }),
      step === "done" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 p-2 rounded-md bg-green-500/10 border border-green-500/30 text-green-400", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-4 h-4 flex-shrink-0" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm", children: "Document uploaded and verified" })
      ] }),
      error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-400", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CircleAlert, { className: "w-4 h-4 mt-0.5 flex-shrink-0" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-medium", children: "Upload Failed" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-red-300/80 mt-1", children: error }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: resetForm,
              className: "mt-2 text-xs underline hover:text-red-300",
              children: "Try again"
            }
          )
        ] })
      ] })
    ] })
  ) });
};
const ArtifactVaultDrawer = ({
  open,
  nodeId,
  cdrlId,
  onClose
}) => {
  const [artifacts, setArtifacts] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(false);
  const [showUpload, setShowUpload] = reactExports.useState(false);
  reactExports.useEffect(() => {
    if (open) {
      fetchArtifacts();
    }
  }, [open, nodeId, cdrlId]);
  const fetchArtifacts = reactExports.useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (nodeId) params.portfolio_node_id = nodeId;
      if (cdrlId) params.cdrl_id = cdrlId;
      const response = await api.get(
        "/api/v1/artifacts/",
        { params }
      );
      if (response.data) {
        setArtifacts(response.data.artifacts || []);
      }
    } catch {
      setArtifacts([]);
    } finally {
      setLoading(false);
    }
  }, [nodeId, cdrlId]);
  const handleDownload = reactExports.useCallback(async (artifact) => {
    var _a;
    try {
      const response = await api.get(
        `/api/v1/artifacts/${artifact.id}/download-url`
      );
      if ((_a = response.data) == null ? void 0 : _a.download_url) {
        window.open(response.data.download_url, "_blank");
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error("Download failed");
    }
  }, []);
  reactExports.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);
  if (!open) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: "fixed inset-0 z-40 bg-black/40",
        onClick: onClose,
        "aria-hidden": "true"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: "fixed top-0 right-0 bottom-0 z-50 w-full max-w-lg bg-bg-ops-surface border-l border-border-ops-subtle shadow-2xl flex flex-col",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "Document Vault",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-4 border-b border-border-ops-subtle", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-5 h-5 text-amber-400" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-semibold text-text-ops-primary", children: "Document Vault" }),
              artifacts.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted", children: [
                "(",
                artifacts.length,
                " document",
                artifacts.length !== 1 ? "s" : "",
                ")"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: onClose,
                className: "p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors",
                "aria-label": "Close drawer",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "w-4 h-4" })
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 py-2 border-b border-border-ops-subtle bg-amber-500/5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-xs text-amber-400", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Lock, { className: "w-3.5 h-3.5 flex-shrink-0" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Downloads require ABAC clearance and export control verification. URLs expire after 60 seconds." })
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 py-3 border-b border-border-ops-subtle", children: !showUpload ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: () => setShowUpload(true),
              className: "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong transition-colors text-sm",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Upload, { className: "w-4 h-4" }),
                "Upload Document"
              ]
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsx(
            UploadForm,
            {
              portfolioNodeId: nodeId || void 0,
              cdrlId: cdrlId || void 0,
              onSuccess: () => {
                setShowUpload(false);
                fetchArtifacts();
              }
            }
          ) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-y-auto p-4 space-y-3", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-8 text-text-ops-muted", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-6 h-6 mb-2 animate-spin" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "Loading documents..." })
          ] }) : artifacts.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-8 text-text-ops-muted", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "w-8 h-8 mb-2 opacity-50" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "No documents attached" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs mt-1", children: nodeId || cdrlId ? "Upload a document to attach it to this item" : "No accessible documents found" })
          ] }) : artifacts.map((artifact) => /* @__PURE__ */ jsxRuntimeExports.jsx(
            ArtifactItemRow,
            {
              artifact,
              onDownload: handleDownload
            },
            artifact.id
          )) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-t border-border-ops-subtle text-[10px] text-text-ops-muted", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "All access logged in ForensicAuditLog" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "w-3 h-3" }),
              "Download URLs: 60s expiry"
            ] })
          ] })
        ]
      }
    )
  ] });
};
export {
  ArtifactVaultDrawer as default
};
//# sourceMappingURL=ArtifactVaultDrawer-CKR4fgAk.js.map
