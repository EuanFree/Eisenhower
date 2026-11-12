import { r as reactExports, b as api, j as jsxRuntimeExports, D as Shield, $ as FileText, d as CircleCheck, T as TriangleAlert, x as LoaderCircle, aJ as CircleX, t as UserCheck, a1 as ChevronUp, f as ChevronDown, ab as Eye, ak as Save, C as Clock, c as clsx, aE as GitMerge, U as Users, L as Lock, b8 as KeyRound, bk as EyeOff } from "./index-DwHrkWl2.js";
const ComparisonCell = ({
  value,
  label,
  isConflict,
  column
}) => {
  const displayValue = value === null || value === void 0 ? "—" : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: clsx(
        "p-3 rounded-lg border text-sm font-mono whitespace-pre-wrap",
        isConflict ? column === "ancestor" ? "border-amber-200 bg-amber-50 text-amber-900" : column === "local" ? "border-blue-200 bg-blue-50 text-blue-900" : "border-purple-200 bg-purple-50 text-purple-900" : "border-gray-200 bg-gray-50 text-gray-700"
      ),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-gray-500 mb-1", children: label }),
        displayValue
      ]
    }
  );
};
const ConflictFieldRow = ({ field }) => {
  const isConflict = field.local_value !== field.ancestor_value && field.remote_value !== field.ancestor_value && field.local_value !== field.remote_value;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-3 py-2 border-b border-gray-100 last:border-b-0", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ComparisonCell,
      {
        value: field.ancestor_value,
        label: field.field_name,
        isConflict,
        column: "ancestor"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ComparisonCell,
      {
        value: field.local_value,
        label: field.field_name,
        isConflict,
        column: "local"
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ComparisonCell,
      {
        value: field.remote_value,
        label: field.field_name,
        isConflict,
        column: "remote"
      }
    )
  ] });
};
const ResolutionSelector = ({
  entryId,
  currentResolution,
  onResolve
}) => {
  const [synthMode, setSynthMode] = reactExports.useState(false);
  const [synthJson, setSynthJson] = reactExports.useState("{}");
  const handleResolve = (resolution) => {
    if (resolution === "SYNTHESIZE") {
      setSynthMode(true);
      return;
    }
    onResolve(entryId, resolution);
  };
  const handleSynthesize = () => {
    try {
      const parsed = JSON.parse(synthJson);
      onResolve(entryId, "SYNTHESIZE", parsed);
      setSynthMode(false);
    } catch {
    }
  };
  const handleAutoSynthesize = () => {
    onResolve(entryId, "SYNTHESIZE");
    setSynthMode(false);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => handleResolve("KEEP_LOCAL"),
          className: clsx(
            "px-3 py-1.5 rounded-md text-sm font-medium border transition-colors",
            currentResolution === "KEEP_LOCAL" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
          ),
          children: "Keep Local"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => handleResolve("ACCEPT_REMOTE"),
          className: clsx(
            "px-3 py-1.5 rounded-md text-sm font-medium border transition-colors",
            currentResolution === "ACCEPT_REMOTE" ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-700 border-gray-300 hover:border-purple-400"
          ),
          children: "Accept Remote"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => handleResolve("SYNTHESIZE"),
          className: clsx(
            "px-3 py-1.5 rounded-md text-sm font-medium border transition-colors",
            currentResolution === "SYNTHESIZE" ? "bg-amber-600 text-white border-amber-600" : "bg-white text-gray-700 border-gray-300 hover:border-amber-400"
          ),
          children: "Synthesize Envelope"
        }
      )
    ] }),
    synthMode && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3 p-3 bg-amber-50 border border-amber-200 rounded-lg", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "text-sm font-medium text-amber-900", children: "Synthesize Envelope" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-amber-700", children: "Extend duration bounds to encompass both local and remote paths." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: handleAutoSynthesize,
            className: "px-3 py-1.5 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700 flex items-center gap-1.5",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(GitMerge, { className: "w-3.5 h-3.5" }),
              "Auto-extend Bounds"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => setSynthMode(false),
            className: "px-3 py-1.5 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300",
            children: "Cancel"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "mt-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "text-xs text-amber-700 cursor-pointer hover:text-amber-900", children: "Or provide custom synthesized state (JSON)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "textarea",
          {
            className: "w-full mt-2 p-2 border border-amber-300 rounded-md font-mono text-sm",
            rows: 4,
            value: synthJson,
            onChange: (e) => setSynthJson(e.target.value),
            placeholder: '{"planned_start_date": "2026-01-15", ...}'
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: handleSynthesize,
            className: "mt-2 px-3 py-1 bg-amber-600 text-white rounded-md text-sm hover:bg-amber-700",
            children: "Apply Custom Synthesis"
          }
        )
      ] })
    ] })
  ] });
};
const PinModal = ({ officerNumber, onConfirm, onCancel }) => {
  const [pin, setPin] = reactExports.useState("");
  const [showPin, setShowPin] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const inputRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    var _a;
    (_a = inputRef.current) == null ? void 0 : _a.focus();
  }, []);
  const handleSubmit = (e) => {
    e.preventDefault();
    if (pin.length < 4) {
      setError("PIN must be at least 4 digits");
      return;
    }
    onConfirm(pin);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(KeyRound, { className: "w-5 h-5 text-amber-600" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-semibold text-gray-900", children: "PKI PIN Verification" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm text-gray-600 mb-4", children: [
      "Officer ",
      officerNumber === 1 ? "1 (Lead Scheduler)" : "2 (Programme Director)",
      " — enter your PKI PIN to sign the resolution package."
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative mb-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            ref: inputRef,
            type: showPin ? "text" : "password",
            value: pin,
            onChange: (e) => {
              setPin(e.target.value.replace(/\D/g, ""));
              setError(null);
            },
            maxLength: 8,
            className: clsx(
              "w-full px-3 py-2 border rounded-lg text-center text-lg tracking-widest font-mono",
              error ? "border-red-300 bg-red-50" : "border-gray-300"
            ),
            placeholder: "••••••",
            autoFocus: true
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => setShowPin(!showPin),
            className: "absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600",
            children: showPin ? /* @__PURE__ */ jsxRuntimeExports.jsx(EyeOff, { className: "w-4 h-4" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Eye, { className: "w-4 h-4" })
          }
        )
      ] }),
      error && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-red-600 mb-2", children: error }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: onCancel,
            className: "flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200",
            children: "Cancel"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "submit",
            className: "flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700",
            children: "Sign with PIN"
          }
        )
      ] })
    ] })
  ] }) });
};
const OfficerSignOff = ({
  entryId,
  officer1Signed,
  officer2Signed,
  onSign,
  onCommit,
  isReady
}) => {
  const [pinOfficer, setPinOfficer] = reactExports.useState(null);
  const handlePinConfirm = reactExports.useCallback(
    async (pin) => {
      if (pinOfficer !== null) {
        await onSign(entryId, pinOfficer, pin);
      }
      setPinOfficer(null);
    },
    [entryId, pinOfficer, onSign]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3 p-4 bg-gray-50 border border-gray-200 rounded-lg", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-sm font-medium text-gray-700", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { className: "w-4 h-4" }),
      "Dual-Officer Quorum Sign-Off"
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: clsx(
            "p-3 rounded-lg border flex flex-col gap-2",
            officer1Signed ? "border-green-300 bg-green-50" : "border-gray-200 bg-white"
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              officer1Signed ? /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-5 h-5 text-green-600" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Lock, { className: "w-5 h-5 text-gray-400" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium", children: "Officer 1" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-gray-500", children: "Lead Scheduler" })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-gray-500", children: officer1Signed ? "✓ Signed with PKI PIN" : "Awaiting signature" }),
            !officer1Signed && /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                type: "button",
                onClick: () => setPinOfficer(1),
                className: "w-full px-2 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 flex items-center justify-center gap-1",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(KeyRound, { className: "w-3 h-3" }),
                  "Sign with PIN"
                ]
              }
            )
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: clsx(
            "p-3 rounded-lg border flex flex-col gap-2",
            officer2Signed ? "border-green-300 bg-green-50" : "border-gray-200 bg-white"
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              officer2Signed ? /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-5 h-5 text-green-600" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Lock, { className: "w-5 h-5 text-gray-400" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium", children: "Officer 2" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-gray-500", children: "Programme Director" })
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-gray-500", children: officer2Signed ? "✓ Counter-signed with PKI PIN" : "Awaiting counter-signature" }),
            !officer2Signed && /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "button",
              {
                type: "button",
                onClick: () => setPinOfficer(2),
                className: "w-full px-2 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 flex items-center justify-center gap-1",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(KeyRound, { className: "w-3 h-3" }),
                  "Counter-sign with PIN"
                ]
              }
            )
          ]
        }
      )
    ] }),
    isReady && /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onClick: () => onCommit(entryId),
        className: "w-full px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 flex items-center justify-center gap-2",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(GitMerge, { className: "w-4 h-4" }),
          "Commit Merge Resolution"
        ]
      }
    ),
    pinOfficer !== null && /* @__PURE__ */ jsxRuntimeExports.jsx(
      PinModal,
      {
        officerNumber: pinOfficer,
        onConfirm: handlePinConfirm,
        onCancel: () => setPinOfficer(null)
      }
    )
  ] });
};
const ConflictCard = ({
  entry,
  onResolve,
  onSign,
  onCommit
}) => {
  const [expanded, setExpanded] = reactExports.useState(false);
  const isResolved = entry.status.startsWith("RESOLVED_");
  const isCommitted = entry.status === "MERGE_COMMITTED";
  const isReadyForCommit = Boolean(isResolved && entry.officer_1_signature && entry.officer_2_signature);
  const conflictTypeLabel = {
    CONCURRENT_EDIT: "Concurrent Edit",
    PARENTAGE_CONFLICT: "Parentage Conflict",
    CONTRADICTORY_LINK: "Contradictory Link",
    DATE_CONFLICT: "Date Conflict"
  }[entry.conflict_type] || entry.conflict_type;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: clsx(
        "border rounded-xl overflow-hidden transition-shadow",
        isCommitted ? "border-green-300 bg-green-50/30" : isReadyForCommit ? "border-amber-300 bg-amber-50/30 shadow-amber-100" : "border-gray-200 bg-white hover:shadow-md"
      ),
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: () => setExpanded(!expanded),
            className: "w-full p-4 flex items-center justify-between text-left",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
                isCommitted ? /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-5 h-5 text-green-600" }) : isReadyForCommit ? /* @__PURE__ */ jsxRuntimeExports.jsx(UserCheck, { className: "w-5 h-5 text-amber-600" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-5 h-5 text-amber-500" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "font-medium text-gray-900", children: entry.entity_code }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-gray-500", children: [
                    entry.entity_type,
                    " · ",
                    conflictTypeLabel
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
                isCommitted && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium", children: "Committed" }),
                isResolved && !isCommitted && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium", children: "Resolved" }),
                !isResolved && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium", children: "Needs Arbitration" }),
                expanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronUp, { className: "w-4 h-4 text-gray-400" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: "w-4 h-4 text-gray-400" })
              ] })
            ]
          }
        ),
        expanded && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 border-t border-gray-100 space-y-6", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-sm font-medium text-gray-700 mb-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Eye, { className: "w-4 h-4" }),
              "3-Way Comparison"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-1 mb-2 text-xs font-medium text-gray-500 text-center", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: "Common Ancestor" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: "Local Site" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: "Remote Site" })
            ] }),
            entry.conflicting_fields.map((field, idx) => /* @__PURE__ */ jsxRuntimeExports.jsx(ConflictFieldRow, { field }, idx))
          ] }),
          !isCommitted && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-sm font-medium text-gray-700 mb-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "w-4 h-4" }),
              "Resolution"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              ResolutionSelector,
              {
                entryId: entry.id,
                currentResolution: entry.resolution,
                onResolve
              }
            )
          ] }),
          isResolved && !isCommitted && /* @__PURE__ */ jsxRuntimeExports.jsx(
            OfficerSignOff,
            {
              entryId: entry.id,
              officer1Signed: !!entry.officer_1_signature,
              officer2Signed: !!entry.officer_2_signature,
              onSign,
              onCommit,
              isReady: isReadyForCommit
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4 text-xs text-gray-400", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "w-3 h-3" }),
              "Created: ",
              new Date(entry.created_at).toLocaleString()
            ] }),
            entry.resolved_at && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-3 h-3" }),
              "Resolved: ",
              new Date(entry.resolved_at).toLocaleString()
            ] })
          ] })
        ] })
      ]
    }
  );
};
const CcbArbitrationWorkbenchView = ({
  sessionId
}) => {
  const [loading, setLoading] = reactExports.useState(true);
  const [entries, setEntries] = reactExports.useState([]);
  const [reconciliationSummary, setReconciliationSummary] = reactExports.useState(null);
  const [error, setError] = reactExports.useState(null);
  const [committing, setCommitting] = reactExports.useState(null);
  const loadConflicts = reactExports.useCallback(async () => {
    var _a, _b;
    setLoading(true);
    setError(null);
    try {
      const params = sessionId ? { session_id: sessionId } : {};
      const response = await api.get(
        "/api/v1/merkle-sync/ccb-staging",
        { params }
      );
      setEntries(response.data.staging_entries || []);
      setReconciliationSummary({
        ancestor_hash: response.data.ancestor_hash,
        auto_merged_count: response.data.auto_merged_count,
        conflicts_staged: response.data.conflicts_staged
      });
    } catch (err) {
      setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to load conflicts");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);
  reactExports.useEffect(() => {
    loadConflicts();
  }, [loadConflicts]);
  const handleResolve = reactExports.useCallback(
    async (entryId, resolution, synthesizedState) => {
      var _a, _b;
      try {
        await api.post(`/api/v1/merkle-sync/ccb-resolve/${entryId}`, {
          resolution,
          synthesized_state: synthesizedState
        });
        setEntries(
          (prev) => prev.map(
            (e) => e.id === entryId ? {
              ...e,
              resolution,
              status: resolution === "KEEP_LOCAL" ? "RESOLVED_KEEP_LOCAL" : resolution === "ACCEPT_REMOTE" ? "RESOLVED_ACCEPT_REMOTE" : "RESOLVED_SYNTHESIZED",
              synthesized_state: synthesizedState || e.synthesized_state
            } : e
          )
        );
      } catch (err) {
        setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to resolve conflict");
      }
    },
    []
  );
  const handleSign = reactExports.useCallback(
    async (entryId, officerNumber, pin) => {
      var _a, _b;
      try {
        const response = await api.post(
          `/api/v1/merkle-sync/ccb-sign/${entryId}`,
          {
            officer_number: officerNumber,
            pki_pin: pin
          }
        );
        const updated = response.data;
        setEntries(
          (prev) => prev.map((e) => e.id === entryId ? updated : e)
        );
      } catch (err) {
        setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to sign");
      }
    },
    []
  );
  const handleCommit = reactExports.useCallback(
    async (entryId) => {
      var _a, _b;
      setCommitting(entryId);
      try {
        await api.post(`/api/v1/merkle-sync/ccb-commit`, {
          entry_ids: [entryId]
        });
        setEntries(
          (prev) => prev.map(
            (e) => e.id === entryId ? {
              ...e,
              status: "MERGE_COMMITTED",
              resolved_at: (/* @__PURE__ */ new Date()).toISOString()
            } : e
          )
        );
      } catch (err) {
        setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to commit merge");
      } finally {
        setCommitting(null);
      }
    },
    []
  );
  const pendingCount = entries.filter(
    (e) => e.status === "REQUIRES_CCB_ARBITRATION"
  ).length;
  const resolvedCount = entries.filter(
    (e) => e.status.startsWith("RESOLVED_")
  ).length;
  const committedCount = entries.filter(
    (e) => e.status === "MERGE_COMMITTED"
  ).length;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-screen bg-gray-50", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-white border-b border-gray-200 px-6 py-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-6 h-6 text-amber-600" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-xl font-bold text-gray-900", children: "CCB Arbitration Workbench" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-gray-500", children: "Multi-site Merkle DAG conflict resolution with dual-officer quorum sign-off" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: loadConflicts,
          className: "px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200",
          children: "Refresh"
        }
      )
    ] }) }),
    reconciliationSummary && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-6 py-3 bg-white border-b border-gray-100", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-6 text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "w-4 h-4 text-gray-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-gray-500", children: "Ancestor:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-mono text-gray-700 truncate max-w-[120px]", children: [
          reconciliationSummary.ancestor_hash.slice(0, 12),
          "..."
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-4 h-4 text-green-500" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-gray-500", children: "Auto-merged:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-green-700", children: reconciliationSummary.auto_merged_count })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4 text-amber-500" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-gray-500", children: "Conflicts:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-amber-700", children: reconciliationSummary.conflicts_staged })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ml-auto flex items-center gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-amber-600 font-medium", children: [
          pendingCount,
          " pending"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-blue-600 font-medium", children: [
          resolvedCount,
          " resolved"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-green-600 font-medium", children: [
          committedCount,
          " committed"
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-6 max-w-6xl mx-auto", children: [
      loading ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-center py-20", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-8 h-8 text-gray-400 animate-spin" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-3 text-gray-500", children: "Loading conflicts..." })
      ] }) : error ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-center py-20", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { className: "w-8 h-8 text-red-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-3 text-red-600", children: error })
      ] }) : entries.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-20 text-gray-400", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "w-12 h-12 mb-3" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-lg font-medium", children: "No Conflicts" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm", children: "All Merkle sync conflicts have been resolved." })
      ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children: entries.map((entry) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        ConflictCard,
        {
          entry,
          onResolve: handleResolve,
          onSign: handleSign,
          onCommit: handleCommit
        },
        entry.id
      )) }),
      committing && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "fixed bottom-4 right-4 px-4 py-2 bg-green-600 text-white rounded-lg shadow-lg flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-4 h-4 animate-spin" }),
        "Committing merge..."
      ] })
    ] })
  ] });
};
export {
  CcbArbitrationWorkbenchView as default
};
//# sourceMappingURL=CcbArbitrationWorkbenchView-B0yFrukj.js.map
