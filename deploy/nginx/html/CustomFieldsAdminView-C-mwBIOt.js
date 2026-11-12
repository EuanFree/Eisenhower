import { r as reactExports, j as jsxRuntimeExports, ab as Eye, D as Shield, c as clsx, L as Lock, l as Send, ac as Check, T as TriangleAlert, b as api, ad as Settings, ae as ListChecks, K as Plus, af as Trash2, ag as Tag, ah as Key, ai as Layers, aj as Hash, X, $ as FileText, ak as Save, v as RefreshCw, al as Search, am as SquarePen, an as History } from "./index-DwHrkWl2.js";
const DATA_TYPES = [
  "STRING",
  "INTEGER",
  "DECIMAL",
  "BOOLEAN",
  "DATE",
  "SINGLE_ENUM",
  "MULTI_ENUM",
  "CURRENCY"
];
const TARGET_ENTITIES = ["WORK_ITEM", "RESOURCE", "FACILITY", "CDRL"];
const CLEARANCE_LEVELS = ["OFFICIAL", "SECRET", "TOP_SECRET"];
const VALID_TIERS = ["PROG", "PROJ", "CA", "WP", "TASK", "MILESTONE"];
const PERMITTED_ROLES = [
  "USER",
  "CAM",
  "SECURITY_OFFICER",
  "LEAD_ENGINEER",
  "SYSTEM_ADMIN",
  "PMO_DIRECTOR",
  "RESOURCE_MANAGER",
  "DEPT_HEAD",
  "ADMIN",
  "MANAGER",
  "MEMBER",
  "VIEWER"
];
const TIER_METADATA = {
  PROG: { label: "Programme", icon: "🏛️" },
  PROJ: { label: "Project", icon: "📁" },
  CA: { label: "Control Account", icon: "📊" },
  WP: { label: "Work Package", icon: "📦" },
  TASK: { label: "Task", icon: "✅" },
  MILESTONE: { label: "Milestone", icon: "🚩" }
};
const DATA_TYPE_METADATA = {
  STRING: { label: "Text", icon: "📝", description: "Free-form text string" },
  INTEGER: { label: "Integer", icon: "🔢", description: "Whole number" },
  DECIMAL: { label: "Decimal", icon: "🔢", description: "Decimal number" },
  BOOLEAN: { label: "Boolean", icon: "☑️", description: "True/False toggle" },
  DATE: { label: "Date", icon: "📅", description: "Calendar date" },
  SINGLE_ENUM: { label: "Single Select", icon: "📋", description: "Choose one from a list" },
  MULTI_ENUM: { label: "Multi Select", icon: "☑️", description: "Choose multiple from a list" },
  CURRENCY: { label: "Currency", icon: "💰", description: "Monetary value" }
};
const CLEARANCE_COLORS = {
  OFFICIAL: { bg: "bg-sky-900/30", text: "text-sky-400", border: "border-sky-500" },
  SECRET: { bg: "bg-red-900/30", text: "text-red-400", border: "border-red-500" },
  TOP_SECRET: { bg: "bg-purple-900/30", text: "text-purple-400", border: "border-purple-500" }
};
const TARGET_ENTITY_METADATA = {
  WORK_ITEM: { label: "Work Item", icon: "📋" },
  RESOURCE: { label: "Resource", icon: "👤" },
  FACILITY: { label: "Facility", icon: "🏢" },
  CDRL: { label: "CDRL", icon: "📄" }
};
function createEmptyFormState() {
  return {
    field_key: "cf_",
    display_label: "",
    target_entity: "WORK_ITEM",
    applicable_tiers: [],
    data_type: "STRING",
    enum_options: [],
    validation_rules: {},
    default_value: null,
    is_mandatory: false,
    read_clearance_level: "OFFICIAL",
    write_clearance_level: "OFFICIAL",
    required_roles: ["USER"],
    include_in_ipmr: false
  };
}
function formStateFromDefinition(def) {
  return {
    field_key: def.field_key,
    display_label: def.display_label,
    target_entity: def.target_entity,
    applicable_tiers: def.applicable_tiers || [],
    data_type: def.data_type,
    enum_options: def.enum_options || [],
    validation_rules: def.validation_rules || {},
    default_value: def.default_value,
    is_mandatory: def.is_mandatory,
    read_clearance_level: def.read_clearance_level,
    write_clearance_level: def.write_clearance_level,
    required_roles: def.required_roles,
    include_in_ipmr: false
  };
}
const CLEARANCE_RANK = {
  OFFICIAL: 1,
  SECRET: 2,
  TOP_SECRET: 3
};
const ClearanceEmulator = ({
  simulatedClearance,
  requiredClearance,
  onChange
}) => {
  const isMasked = CLEARANCE_RANK[simulatedClearance] < CLEARANCE_RANK[requiredClearance];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-ops-surface border border-ops-subtle rounded-lg p-3", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-4 h-4 text-ops-muted" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h5", { className: "text-xs font-semibold text-ops-primary", children: "Clearance Emulator" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-ops-muted mb-2", children: "View as:" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-1 mb-3", children: CLEARANCE_LEVELS.map((level) => {
      const colors = CLEARANCE_COLORS[level];
      const isActive = simulatedClearance === level;
      return /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: () => onChange(level),
          className: clsx(
            "flex-1 px-1.5 py-1 rounded border text-center text-xs font-medium transition-colors",
            isActive ? `${colors.bg} ${colors.border} ${colors.text}` : "bg-ops-overlay border-ops-subtle text-ops-muted hover:border-ops-strong"
          ),
          children: level.replace("_", " ")
        },
        level
      );
    }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "div",
      {
        className: clsx(
          "flex items-center gap-2 px-2 py-1.5 rounded text-xs",
          isMasked ? "bg-red-900/20 border border-red-500/30 text-red-400" : "bg-green-900/20 border border-green-500/30 text-green-400"
        ),
        children: isMasked ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Lock, { className: "w-3 h-3 flex-shrink-0" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Field masked — clearance too low" })
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Eye, { className: "w-3 h-3 flex-shrink-0" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Field visible at this clearance" })
        ] })
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex items-center gap-1.5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-ops-muted", children: "Required:" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "span",
        {
          className: clsx(
            "px-1.5 py-0.5 rounded text-xs font-medium border",
            CLEARANCE_COLORS[requiredClearance].bg,
            CLEARANCE_COLORS[requiredClearance].text,
            CLEARANCE_COLORS[requiredClearance].border
          ),
          children: requiredClearance.replace("_", " ")
        }
      )
    ] })
  ] });
};
const MaskedFieldDisplay = ({ displayLabel }) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-ops-muted", children: displayLabel || "Field" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Lock, { className: "w-3 h-3 text-red-400" })
  ] }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-3 py-2 bg-red-900/10 border border-red-500/30 rounded text-sm font-mono text-red-400", children: "[RESTRICTED]" })
] });
const PreviewInput = ({ formState }) => {
  const { data_type, display_label, enum_options, is_mandatory, validation_rules } = formState;
  const label = display_label || "Field Label";
  if (data_type === "BOOLEAN") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-10 h-5 rounded-full relative cursor-pointer bg-ops-overlay", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-ops-base" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-ops-muted", children: label }),
      is_mandatory && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-red-400 text-xs", children: "*" })
    ] });
  }
  if (data_type === "SINGLE_ENUM" && (enum_options == null ? void 0 : enum_options.length)) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-xs text-ops-muted mb-1", children: [
        label,
        " ",
        is_mandatory && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-red-400", children: "*" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("select", { className: "w-full bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-sm text-ops-primary", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "", children: "Select..." }),
        enum_options.map((opt) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: opt, children: opt }, opt))
      ] })
    ] });
  }
  if (data_type === "MULTI_ENUM" && (enum_options == null ? void 0 : enum_options.length)) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-xs text-ops-muted mb-1", children: [
        label,
        " ",
        is_mandatory && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-red-400", children: "*" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-1", children: enum_options.map((opt) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-4 h-4 border border-ops-subtle rounded bg-ops-overlay" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-ops-primary", children: opt })
      ] }, opt)) })
    ] });
  }
  if (data_type === "DATE") {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-xs text-ops-muted mb-1", children: [
        label,
        " ",
        is_mandatory && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-red-400", children: "*" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          type: "date",
          className: "w-full bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-sm text-ops-primary"
        }
      )
    ] });
  }
  const inputType = data_type === "INTEGER" || data_type === "DECIMAL" || data_type === "CURRENCY" ? "number" : "text";
  const prefix = data_type === "CURRENCY" ? "£" : "";
  const step = data_type === "INTEGER" ? "1" : "0.01";
  const placeholder = data_type === "STRING" ? (validation_rules == null ? void 0 : validation_rules.regex_pattern) ? `Match: ${validation_rules.regex_pattern}` : "Enter text..." : "0";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-xs text-ops-muted mb-1", children: [
      label,
      " ",
      is_mandatory && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-red-400", children: "*" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
      prefix && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "absolute left-2 top-1/2 -translate-y-1/2 text-ops-muted text-sm", children: prefix }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          type: inputType,
          step,
          min: validation_rules == null ? void 0 : validation_rules.min,
          max: validation_rules == null ? void 0 : validation_rules.max,
          className: clsx(
            "w-full bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-sm text-ops-primary",
            prefix && "pl-6"
          ),
          placeholder
        }
      )
    ] }),
    (validation_rules == null ? void 0 : validation_rules.min) !== void 0 || (validation_rules == null ? void 0 : validation_rules.max) !== void 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-ops-muted mt-0.5", children: [
      "Range: ",
      (validation_rules == null ? void 0 : validation_rules.min) ?? "-∞",
      " to ",
      (validation_rules == null ? void 0 : validation_rules.max) ?? "∞"
    ] }) : null
  ] });
};
const ValidationTestPanel = ({ formState }) => {
  const [testInput, setTestInput] = reactExports.useState("");
  const [testResults, setTestResults] = reactExports.useState([]);
  const validateInput = reactExports.useCallback(
    (input) => {
      const { data_type, enum_options, validation_rules } = formState;
      if (data_type === "STRING") {
        if (validation_rules == null ? void 0 : validation_rules.regex_pattern) {
          try {
            const regex = new RegExp(validation_rules.regex_pattern);
            if (!regex.test(input)) {
              return { input, valid: false, error: `Does not match: ${validation_rules.regex_pattern}` };
            }
          } catch {
            return { input, valid: false, error: "Invalid regex pattern" };
          }
        }
        return { input, valid: true, coerced: input };
      }
      if (data_type === "INTEGER") {
        const num = Number(input);
        if (!Number.isInteger(num)) {
          return { input, valid: false, error: "Expected a whole number" };
        }
        if ((validation_rules == null ? void 0 : validation_rules.min) !== void 0 && num < validation_rules.min) {
          return { input, valid: false, error: `Value must be >= ${validation_rules.min}` };
        }
        if ((validation_rules == null ? void 0 : validation_rules.max) !== void 0 && num > validation_rules.max) {
          return { input, valid: false, error: `Value must be <= ${validation_rules.max}` };
        }
        return { input, valid: true, coerced: num };
      }
      if (data_type === "DECIMAL" || data_type === "CURRENCY") {
        const num = parseFloat(input);
        if (isNaN(num)) {
          return { input, valid: false, error: "Expected a decimal number" };
        }
        if ((validation_rules == null ? void 0 : validation_rules.min) !== void 0 && num < validation_rules.min) {
          return { input, valid: false, error: `Value must be >= ${validation_rules.min}` };
        }
        if ((validation_rules == null ? void 0 : validation_rules.max) !== void 0 && num > validation_rules.max) {
          return { input, valid: false, error: `Value must be <= ${validation_rules.max}` };
        }
        return { input, valid: true, coerced: num };
      }
      if (data_type === "BOOLEAN") {
        if (input.toLowerCase() === "true" || input === "1") {
          return { input, valid: true, coerced: true };
        }
        if (input.toLowerCase() === "false" || input === "0") {
          return { input, valid: true, coerced: false };
        }
        return { input, valid: false, error: "Expected true/false, 1/0" };
      }
      if (data_type === "DATE") {
        const d = new Date(input);
        if (isNaN(d.getTime())) {
          return { input, valid: false, error: "Expected a valid date (YYYY-MM-DD)" };
        }
        return { input, valid: true, coerced: input };
      }
      if (data_type === "SINGLE_ENUM") {
        if (!(enum_options == null ? void 0 : enum_options.includes(input))) {
          return { input, valid: false, error: `Must be one of: ${enum_options == null ? void 0 : enum_options.join(", ")}` };
        }
        return { input, valid: true, coerced: input };
      }
      if (data_type === "MULTI_ENUM") {
        const values = input.split(",").map((s) => s.trim());
        const invalid = values.filter((v) => !(enum_options == null ? void 0 : enum_options.includes(v)));
        if (invalid.length > 0) {
          return { input, valid: false, error: `Invalid: ${invalid.join(", ")}` };
        }
        return { input, valid: true, coerced: values };
      }
      return { input, valid: false, error: "Unknown data type" };
    },
    [formState]
  );
  const handleTest = reactExports.useCallback(() => {
    if (!testInput.trim()) return;
    const result = validateInput(testInput.trim());
    setTestResults((prev) => [result, ...prev].slice(0, 10));
  }, [testInput, validateInput]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 mb-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Send, { className: "w-3 h-3 text-ops-muted" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h5", { className: "text-xs font-semibold text-ops-primary", children: "Validation Test" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-1.5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "input",
        {
          type: "text",
          value: testInput,
          onChange: (e) => setTestInput(e.target.value),
          onKeyDown: (e) => e.key === "Enter" && handleTest(),
          className: "flex-1 bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-xs text-ops-primary",
          placeholder: "Test value..."
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: handleTest,
          className: "px-2 py-1 bg-ops-overlay border border-ops-subtle rounded text-xs text-ops-primary hover:bg-ops-surface transition-colors",
          children: "Test"
        }
      )
    ] }),
    testResults.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-1 max-h-32 overflow-y-auto", children: testResults.map((result, idx) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: clsx(
          "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
          result.valid ? "bg-green-900/20 text-green-400" : "bg-red-900/20 text-red-400"
        ),
        children: [
          result.valid ? /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "w-3 h-3 flex-shrink-0" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-3 h-3 flex-shrink-0" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono truncate", children: result.input }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-ops-muted ml-auto truncate", children: result.valid ? `→ ${JSON.stringify(result.coerced)}` : result.error })
        ]
      },
      idx
    )) })
  ] });
};
const LiveFieldPreviewBox = ({ formState }) => {
  const [simulatedClearance, setSimulatedClearance] = reactExports.useState("TOP_SECRET");
  const isMasked = reactExports.useMemo(
    () => CLEARANCE_RANK[simulatedClearance] < CLEARANCE_RANK[formState.read_clearance_level],
    [simulatedClearance, formState.read_clearance_level]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-ops-base border border-ops-subtle rounded-lg p-4 space-y-4", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Eye, { className: "w-4 h-4 text-sky-400" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h4", { className: "text-sm font-semibold text-ops-primary", children: "Live Preview" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ml-auto px-1.5 py-0.5 bg-ops-overlay rounded text-xs font-mono text-ops-muted", children: [
        DATA_TYPE_METADATA[formState.data_type].icon,
        " ",
        formState.data_type
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      ClearanceEmulator,
      {
        simulatedClearance,
        requiredClearance: formState.read_clearance_level,
        onChange: setSimulatedClearance
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-3 bg-ops-surface rounded border border-ops-subtle", children: isMasked ? /* @__PURE__ */ jsxRuntimeExports.jsx(MaskedFieldDisplay, { displayLabel: formState.display_label || "Field" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(PreviewInput, { formState }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ValidationTestPanel, { formState })
  ] });
};
const FieldDefinitionDrawer = ({
  isOpen,
  onClose,
  editingField,
  onSave
}) => {
  const [form, setForm] = reactExports.useState(createEmptyFormState());
  const [isSaving, setIsSaving] = reactExports.useState(false);
  const [error, setError] = reactExports.useState(null);
  const [activeTab, setActiveTab] = reactExports.useState("metadata");
  const [newEnumOption, setNewEnumOption] = reactExports.useState("");
  reactExports.useEffect(() => {
    if (editingField) {
      setForm(formStateFromDefinition(editingField));
    } else {
      setForm(createEmptyFormState());
    }
    setActiveTab("metadata");
    setError(null);
  }, [editingField, isOpen]);
  const updateField = reactExports.useCallback(
    (key, value) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );
  const handleFieldKeyChange = reactExports.useCallback((value) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!sanitized.startsWith("cf_") && sanitized.length > 0) {
      updateField("field_key", `cf_${sanitized.replace(/^cf_/, "")}`);
    } else {
      updateField("field_key", sanitized);
    }
  }, [updateField]);
  const toggleTier = reactExports.useCallback((tier) => {
    setForm((prev) => {
      const tiers = prev.applicable_tiers.includes(tier) ? prev.applicable_tiers.filter((t) => t !== tier) : [...prev.applicable_tiers, tier];
      return { ...prev, applicable_tiers: tiers };
    });
  }, []);
  const toggleRole = reactExports.useCallback((role) => {
    setForm((prev) => {
      const roles = prev.required_roles.includes(role) ? prev.required_roles.filter((r) => r !== role) : [...prev.required_roles, role];
      return { ...prev, required_roles: roles.length ? roles : ["USER"] };
    });
  }, []);
  const addEnumOption = reactExports.useCallback(() => {
    if (!newEnumOption.trim()) return;
    setForm((prev) => ({
      ...prev,
      enum_options: prev.enum_options.includes(newEnumOption.trim()) ? prev.enum_options : [...prev.enum_options, newEnumOption.trim()]
    }));
    setNewEnumOption("");
  }, [newEnumOption]);
  const removeEnumOption = reactExports.useCallback((option) => {
    setForm((prev) => ({
      ...prev,
      enum_options: prev.enum_options.filter((o) => o !== option)
    }));
  }, []);
  const updateValidationRule = reactExports.useCallback(
    (key, value) => {
      setForm((prev) => ({
        ...prev,
        validation_rules: { ...prev.validation_rules, [key]: value }
      }));
    },
    []
  );
  const validateForm = reactExports.useCallback(() => {
    var _a, _b, _c;
    const keyRegex = /^cf_[a-z0-9_]{2,60}$/;
    if (!form.field_key || !keyRegex.test(form.field_key)) {
      return "Field key must match ^cf_[a-z0-9_]{2,60}$";
    }
    if (!form.display_label.trim()) {
      return "Display label is required";
    }
    if (form.data_type === "SINGLE_ENUM" || form.data_type === "MULTI_ENUM") {
      if (!form.enum_options.length) {
        return "Enum options are required for enum data types";
      }
    }
    if ((_a = form.validation_rules) == null ? void 0 : _a.regex_pattern) {
      try {
        new RegExp(form.validation_rules.regex_pattern);
      } catch {
        return "Invalid regex pattern";
      }
    }
    if (((_b = form.validation_rules) == null ? void 0 : _b.min) !== void 0 && ((_c = form.validation_rules) == null ? void 0 : _c.max) !== void 0 && form.validation_rules.min > form.validation_rules.max) {
      return "Min value cannot exceed max value";
    }
    return null;
  }, [form]);
  const handleSave = reactExports.useCallback(async () => {
    var _a, _b;
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        field_key: form.field_key,
        display_label: form.display_label,
        target_entity: form.target_entity,
        applicable_tiers: form.applicable_tiers.length ? form.applicable_tiers : null,
        data_type: form.data_type,
        enum_options: form.enum_options.length ? form.enum_options : null,
        validation_rules: Object.keys(form.validation_rules).length ? form.validation_rules : null,
        default_value: form.default_value,
        is_mandatory: form.is_mandatory,
        read_clearance_level: form.read_clearance_level,
        write_clearance_level: form.write_clearance_level,
        required_roles: form.required_roles
      };
      let response;
      if (editingField) {
        response = await api.put(`/api/v1/admin/custom-fields/${editingField.id}`, payload);
      } else {
        response = await api.post("/api/v1/admin/custom-fields", payload);
      }
      onSave(response.data);
      onClose();
    } catch (err) {
      setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to save field definition");
    } finally {
      setIsSaving(false);
    }
  }, [form, editingField, onSave, onClose, validateForm]);
  const fieldKeyStatus = reactExports.useMemo(() => {
    const keyRegex = /^cf_[a-z0-9_]{2,60}$/;
    if (!form.field_key || form.field_key === "cf_") return { valid: false, message: "Enter a field key" };
    if (keyRegex.test(form.field_key)) return { valid: true, message: "Valid field key" };
    return { valid: false, message: "Must match ^cf_[a-z0-9_]{2,60}$" };
  }, [form.field_key]);
  const renderTabContent = reactExports.useMemo(() => {
    switch (activeTab) {
      case "metadata":
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-xs text-ops-muted mb-1 flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Tag, { className: "w-3 h-3" }),
              "Display Label ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-red-400", children: "*" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "text",
                value: form.display_label,
                onChange: (e) => updateField("display_label", e.target.value),
                className: "w-full bg-ops-overlay border border-ops-subtle rounded px-2 py-1.5 text-sm text-ops-primary",
                placeholder: "Avionics DAL Target"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-xs text-ops-muted mb-1 flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Key, { className: "w-3 h-3" }),
              "Machine Slug ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-red-400", children: "*" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "text",
                value: form.field_key,
                onChange: (e) => handleFieldKeyChange(e.target.value),
                className: clsx(
                  "w-full bg-ops-overlay border rounded px-2 py-1.5 text-sm font-mono text-ops-primary",
                  fieldKeyStatus.valid ? "border-green-500/50" : form.field_key && form.field_key !== "cf_" ? "border-red-500/50" : "border-ops-subtle"
                ),
                placeholder: "cf_avionics_dal_target",
                disabled: !!editingField
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "p",
              {
                className: clsx(
                  "text-xs mt-0.5",
                  fieldKeyStatus.valid ? "text-green-400" : "text-ops-muted"
                ),
                children: [
                  "Auto-generates cf_ prefix. ",
                  editingField && "Cannot be changed after creation."
                ]
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-xs text-ops-muted mb-1 flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Layers, { className: "w-3 h-3" }),
              "Target Entity ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-red-400", children: "*" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-2 gap-2", children: TARGET_ENTITIES.map((entity) => {
              const meta = TARGET_ENTITY_METADATA[entity];
              const isActive = form.target_entity === entity;
              return /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  onClick: () => updateField("target_entity", entity),
                  className: clsx(
                    "px-3 py-2 rounded border text-left transition-colors",
                    isActive ? "bg-sky-900/30 border-sky-500 text-sky-400" : "bg-ops-overlay border-ops-subtle text-ops-muted hover:border-ops-strong"
                  ),
                  children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-sm font-medium", children: [
                    meta.icon,
                    " ",
                    meta.label
                  ] })
                },
                entity
              );
            }) })
          ] }),
          form.target_entity === "WORK_ITEM" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-xs text-ops-muted mb-1 flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Hash, { className: "w-3 h-3" }),
              "Applicable Tiers"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-ops-muted mb-2", children: "Leave empty to apply to all tiers." }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-2", children: VALID_TIERS.map((tier) => {
              const meta = TIER_METADATA[tier];
              const isActive = form.applicable_tiers.includes(tier);
              return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  type: "button",
                  onClick: () => toggleTier(tier),
                  className: clsx(
                    "px-2 py-1 rounded text-xs border transition-colors",
                    isActive ? "bg-sky-900/30 border-sky-500 text-sky-400" : "bg-ops-overlay border-ops-subtle text-ops-muted hover:border-ops-strong"
                  ),
                  children: [
                    meta.icon,
                    " ",
                    meta.label
                  ]
                },
                tier
              );
            }) })
          ] })
        ] });
      case "constraints":
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-xs text-ops-muted mb-1 flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Settings, { className: "w-3 h-3" }),
              "Data Type ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-red-400", children: "*" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-2 gap-2", children: DATA_TYPES.map((type) => {
              const meta = DATA_TYPE_METADATA[type];
              const isActive = form.data_type === type;
              return /* @__PURE__ */ jsxRuntimeExports.jsxs(
                "button",
                {
                  type: "button",
                  onClick: () => updateField("data_type", type),
                  className: clsx(
                    "px-3 py-2 rounded border text-left transition-colors",
                    isActive ? "bg-sky-900/30 border-sky-500 text-sky-400" : "bg-ops-overlay border-ops-subtle text-ops-muted hover:border-ops-strong"
                  ),
                  children: [
                    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-sm font-medium", children: [
                      meta.icon,
                      " ",
                      meta.label
                    ] }),
                    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs opacity-70", children: meta.description })
                  ]
                },
                type
              );
            }) })
          ] }),
          (form.data_type === "SINGLE_ENUM" || form.data_type === "MULTI_ENUM") && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-xs text-ops-muted mb-1 flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(ListChecks, { className: "w-3 h-3" }),
              "Enum Options ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-red-400", children: "*" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-ops-muted mb-2", children: form.data_type === "MULTI_ENUM" ? "Users can select multiple values." : "Users select one value from the list." }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2 mb-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  type: "text",
                  value: newEnumOption,
                  onChange: (e) => setNewEnumOption(e.target.value),
                  onKeyDown: (e) => e.key === "Enter" && (e.preventDefault(), addEnumOption()),
                  className: "flex-1 bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-sm text-ops-primary",
                  placeholder: "Add option..."
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  onClick: addEnumOption,
                  className: "px-2 py-1 bg-ops-overlay border border-ops-subtle rounded text-ops-primary hover:bg-ops-surface transition-colors",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "w-4 h-4" })
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-1", children: form.enum_options.map((option) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
              "div",
              {
                className: "flex items-center justify-between px-2 py-1 bg-ops-overlay rounded border border-ops-subtle",
                children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-ops-primary", children: option }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      type: "button",
                      onClick: () => removeEnumOption(option),
                      className: "text-red-400 hover:text-red-300 transition-colors",
                      children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "w-3 h-3" })
                    }
                  )
                ]
              },
              option
            )) })
          ] }),
          (form.data_type === "INTEGER" || form.data_type === "DECIMAL" || form.data_type === "CURRENCY") && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-ops-muted mb-1", children: "Numeric Bounds" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-ops-muted mb-0.5", children: "Min" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    type: "number",
                    step: form.data_type === "INTEGER" ? "1" : "0.01",
                    value: form.validation_rules.min ?? "",
                    onChange: (e) => updateValidationRule("min", e.target.value ? Number(e.target.value) : void 0),
                    className: "w-full bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-sm text-ops-primary",
                    placeholder: "No minimum"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-ops-muted mb-0.5", children: "Max" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    type: "number",
                    step: form.data_type === "INTEGER" ? "1" : "0.01",
                    value: form.validation_rules.max ?? "",
                    onChange: (e) => updateValidationRule("max", e.target.value ? Number(e.target.value) : void 0),
                    className: "w-full bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-sm text-ops-primary",
                    placeholder: "No maximum"
                  }
                )
              ] })
            ] })
          ] }),
          form.data_type === "STRING" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-ops-muted mb-1", children: "Regex Pattern Validator" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "text",
                value: form.validation_rules.regex_pattern ?? "",
                onChange: (e) => updateValidationRule("regex_pattern", e.target.value || void 0),
                className: "w-full bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-sm font-mono text-ops-primary",
                placeholder: "e.g. ^[A-Z]{3}-\\d{4}$"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-ops-muted mt-0.5", children: "PCRE-compatible pattern. Value must match to be accepted." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-ops-muted mb-1", children: "Default Value" }),
            form.data_type === "BOOLEAN" ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-2", children: ["true", "false", "none"].map((val) => {
              const bv = val === "true" ? true : val === "false" ? false : null;
              const isActive = form.default_value === bv;
              return /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  onClick: () => updateField("default_value", bv),
                  className: clsx(
                    "px-3 py-1 rounded text-xs border transition-colors",
                    isActive ? "bg-green-900/30 border-green-500 text-green-400" : "bg-ops-overlay border-ops-subtle text-ops-muted"
                  ),
                  children: val.charAt(0).toUpperCase() + val.slice(1)
                },
                val
              );
            }) }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: form.data_type === "DATE" ? "date" : "text",
                value: form.default_value ?? "",
                onChange: (e) => {
                  let value = e.target.value || null;
                  if (form.data_type === "INTEGER" && value) value = Number(value);
                  if ((form.data_type === "DECIMAL" || form.data_type === "CURRENCY") && value)
                    value = parseFloat(value);
                  updateField("default_value", value);
                },
                className: "w-full bg-ops-overlay border border-ops-subtle rounded px-2 py-1 text-sm text-ops-primary",
                placeholder: "No default"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-3 bg-ops-overlay rounded border border-ops-subtle", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-ops-primary", children: "Mandatory Field" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-ops-muted", children: "Blocks entity completion if empty" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => updateField("is_mandatory", !form.is_mandatory),
                className: clsx(
                  "w-10 h-5 rounded-full relative transition-colors",
                  form.is_mandatory ? "bg-sky-500" : "bg-ops-surface"
                ),
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "div",
                  {
                    className: clsx(
                      "absolute top-0.5 w-4 h-4 rounded-full bg-ops-base transition-transform",
                      form.is_mandatory ? "left-5" : "left-0.5"
                    )
                  }
                )
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-3 bg-ops-overlay rounded border border-ops-subtle", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-ops-primary", children: "Include in IPMR Export" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-ops-muted", children: "Appear in statutory EVM reports" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => updateField("include_in_ipmr", !form.include_in_ipmr),
                className: clsx(
                  "w-10 h-5 rounded-full relative transition-colors",
                  form.include_in_ipmr ? "bg-sky-500" : "bg-ops-surface"
                ),
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "div",
                  {
                    className: clsx(
                      "absolute top-0.5 w-4 h-4 rounded-full bg-ops-base transition-transform",
                      form.include_in_ipmr ? "left-5" : "left-0.5"
                    )
                  }
                )
              }
            )
          ] })
        ] });
      case "security":
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-xs text-ops-muted mb-1 flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Eye, { className: "w-3 h-3" }),
              "Minimum Read Clearance"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-2", children: CLEARANCE_LEVELS.map((level) => {
              const colors = CLEARANCE_COLORS[level];
              const isActive = form.read_clearance_level === level;
              return /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  onClick: () => updateField("read_clearance_level", level),
                  className: clsx(
                    "flex-1 px-2 py-2 rounded border text-center text-xs font-medium transition-colors",
                    isActive ? `${colors.bg} ${colors.border} ${colors.text}` : "bg-ops-overlay border-ops-subtle text-ops-muted hover:border-ops-strong"
                  ),
                  children: level.replace("_", " ")
                },
                level
              );
            }) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-xs text-ops-muted mb-1 flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Lock, { className: "w-3 h-3" }),
              "Minimum Write Clearance"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-2", children: CLEARANCE_LEVELS.map((level) => {
              const colors = CLEARANCE_COLORS[level];
              const isActive = form.write_clearance_level === level;
              return /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  onClick: () => updateField("write_clearance_level", level),
                  className: clsx(
                    "flex-1 px-2 py-2 rounded border text-center text-xs font-medium transition-colors",
                    isActive ? `${colors.bg} ${colors.border} ${colors.text}` : "bg-ops-overlay border-ops-subtle text-ops-muted hover:border-ops-strong"
                  ),
                  children: level.replace("_", " ")
                },
                level
              );
            }) }),
            form.write_clearance_level !== form.read_clearance_level && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-amber-400 mt-1 flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-3 h-3" }),
              "Write clearance differs from read clearance"
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block text-xs text-ops-muted mb-1 flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-3 h-3" }),
              "Permitted Roles"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-ops-muted mb-2", children: "Users must have at least one of these roles to edit this field." }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-2", children: PERMITTED_ROLES.map((role) => {
              const isActive = form.required_roles.includes(role);
              return /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  onClick: () => toggleRole(role),
                  className: clsx(
                    "px-2 py-1 rounded text-xs border transition-colors",
                    isActive ? "bg-sky-900/30 border-sky-500 text-sky-400" : "bg-ops-overlay border-ops-subtle text-ops-muted hover:border-ops-strong"
                  ),
                  children: role.replace(/_/g, " ")
                },
                role
              );
            }) })
          ] })
        ] });
      default:
        return null;
    }
  }, [
    form,
    activeTab,
    newEnumOption,
    editingField,
    toggleTier,
    toggleRole,
    addEnumOption,
    removeEnumOption,
    updateField,
    updateValidationRule,
    handleFieldKeyChange,
    fieldKeyStatus
  ]);
  if (!isOpen) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "fixed inset-0 z-[9000] flex justify-end", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 bg-black/50", onClick: onClose }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative w-[1100px] max-w-full bg-ops-base border-l border-ops-strong flex flex-col h-full shadow-2xl", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Settings, { className: "w-5 h-5 text-sky-400" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold text-ops-primary", children: editingField ? "Edit Field Definition" : "New Field Definition" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: onClose,
            className: "p-1 rounded hover:bg-ops-overlay text-ops-muted hover:text-ops-primary transition-colors",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "w-5 h-5" })
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex border-b border-ops-subtle px-4", children: [
        { key: "metadata", label: "Field Identification", icon: FileText },
        { key: "constraints", label: "Type & Constraints", icon: Settings },
        { key: "security", label: "ABAC Security", icon: Shield }
      ].map((tab) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: () => setActiveTab(tab.key),
          className: clsx(
            "flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors",
            activeTab === tab.key ? "border-sky-500 text-sky-400" : "border-transparent text-ops-muted hover:text-ops-primary"
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(tab.icon, { className: "w-4 h-4" }),
            tab.label
          ]
        },
        tab.key
      )) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-hidden flex", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-y-auto p-4 border-r border-ops-subtle", children: [
          error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-4 p-3 bg-red-900/20 border border-red-500/50 rounded text-sm text-red-400 flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4 flex-shrink-0" }),
            error
          ] }),
          renderTabContent
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-80 overflow-y-auto p-4 bg-ops-surface", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LiveFieldPreviewBox, { formState: form }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-t border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: onClose,
            className: "px-4 py-2 text-sm text-ops-muted hover:text-ops-primary transition-colors",
            children: "Cancel"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: handleSave,
            disabled: isSaving,
            className: clsx(
              "flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors",
              isSaving ? "bg-ops-overlay text-ops-muted cursor-not-allowed" : "bg-sky-600 hover:bg-sky-500 text-white"
            ),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "w-4 h-4" }),
              isSaving ? "Saving..." : editingField ? "Update Field" : "Create Field"
            ]
          }
        )
      ] })
    ] })
  ] });
};
const ENTITY_FILTER_TABS = [
  { key: "all", label: "All", icon: Layers, entity: null },
  { key: "work-items", label: "Work Items", icon: FileText, entity: "WORK_ITEM" },
  { key: "resources", label: "Resources", icon: Shield, entity: "RESOURCE" },
  { key: "facilities", label: "Facilities", icon: Layers, entity: "FACILITY" },
  { key: "cdrls", label: "CDRLs", icon: FileText, entity: "CDRL" }
];
const CustomFieldsAdminView = ({ userRole }) => {
  const [fields, setFields] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [error, setError] = reactExports.useState(null);
  const [activeTab, setActiveTab] = reactExports.useState("all");
  const [search, setSearch] = reactExports.useState("");
  const [showDrawer, setShowDrawer] = reactExports.useState(false);
  const [editingField, setEditingField] = reactExports.useState(null);
  const [confirmDelete, setConfirmDelete] = reactExports.useState(null);
  const [auditField, setAuditField] = reactExports.useState(null);
  const hasAccess = reactExports.useMemo(() => {
    if (!userRole) return true;
    const role = userRole.toUpperCase();
    return role === "SYSTEM_ADMIN" || role === "PMO_DIRECTOR" || role === "ADMIN" || role === "MANAGER";
  }, [userRole]);
  const fetchFields = reactExports.useCallback(async () => {
    var _a, _b;
    setLoading(true);
    setError(null);
    try {
      const params = {};
      const selectedTab = ENTITY_FILTER_TABS.find((t) => t.key === activeTab);
      if (selectedTab == null ? void 0 : selectedTab.entity) params.target_entity = selectedTab.entity;
      const response = await api.get("/api/v1/admin/custom-fields", { params });
      setFields(response.data.items || []);
    } catch (err) {
      setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to load custom fields");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);
  reactExports.useEffect(() => {
    fetchFields();
  }, [fetchFields]);
  const filteredFields = reactExports.useMemo(() => {
    if (!search) return fields;
    const lower = search.toLowerCase();
    return fields.filter(
      (f) => f.field_key.toLowerCase().includes(lower) || f.display_label.toLowerCase().includes(lower)
    );
  }, [fields, search]);
  const handleSave = reactExports.useCallback(
    (savedField) => {
      setFields((prev) => {
        if (editingField) {
          return prev.map((f) => f.id === savedField.id ? savedField : f);
        }
        return [...prev, savedField];
      });
      setShowDrawer(false);
      setEditingField(null);
    },
    [editingField]
  );
  const handleEdit = reactExports.useCallback((field) => {
    setEditingField(field);
    setShowDrawer(true);
  }, []);
  const handleCreate = reactExports.useCallback(() => {
    setEditingField(null);
    setShowDrawer(true);
  }, []);
  const handleToggleActive = reactExports.useCallback(async (field) => {
    var _a, _b;
    try {
      if (field.is_active) {
        await api.delete(`/api/v1/admin/custom-fields/${field.id}`);
      }
      setFields(
        (prev) => prev.map((f) => f.id === field.id ? { ...f, is_active: !f.is_active } : f)
      );
    } catch (err) {
      setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to update field status");
    }
  }, []);
  const handleDelete = reactExports.useCallback(async (fieldId) => {
    var _a, _b;
    try {
      await api.delete(`/api/v1/admin/custom-fields/${fieldId}`);
      setFields((prev) => prev.filter((f) => f.id !== fieldId));
      setConfirmDelete(null);
    } catch (err) {
      setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to delete field");
    }
  }, []);
  const handleInspectAudit = reactExports.useCallback((field) => {
    setAuditField(field);
    console.log(`[Audit] Inspecting history for field: ${field.field_key}`);
  }, []);
  if (!hasAccess) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-center p-8 bg-ops-surface border border-ops-strong rounded-lg", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-12 h-12 text-red-400 mx-auto mb-4" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-xl font-semibold text-ops-primary mb-2", children: "Access Denied" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-ops-muted", children: [
        "You do not have permission to manage custom field definitions.",
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        "Required roles: SYSTEM_ADMIN, PMO_DIRECTOR"
      ] })
    ] }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full bg-ops-base", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Settings, { className: "w-5 h-5 text-sky-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-ops-primary", children: "Custom Field Definitions" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "px-2 py-0.5 bg-ops-overlay rounded text-xs text-ops-muted font-mono", children: [
          filteredFields.length,
          " / ",
          fields.length
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: fetchFields,
            className: "p-2 rounded hover:bg-ops-overlay text-ops-muted hover:text-ops-primary transition-colors",
            title: "Refresh",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-4 h-4" })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: handleCreate,
            className: "flex items-center gap-2 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 rounded text-sm text-white transition-colors",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "w-4 h-4" }),
              "New Custom Field"
            ]
          }
        )
      ] })
    ] }),
    error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-4 mt-3 p-3 bg-red-900/20 border border-red-500/50 rounded text-sm text-red-400 flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4 flex-shrink-0" }),
        error
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setError(null), className: "text-red-400 hover:text-red-300", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "w-4 h-4" }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "px-4 py-3 border-b border-ops-subtle space-y-2", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
      ENTITY_FILTER_TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.key;
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: () => setActiveTab(tab.key),
            className: clsx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded text-sm border transition-colors",
              isActive ? "bg-sky-900/30 border-sky-500 text-sky-400" : "bg-ops-overlay border-ops-subtle text-ops-muted hover:border-ops-strong"
            ),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: "w-3.5 h-3.5" }),
              tab.label
            ]
          },
          tab.key
        );
      }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative flex-1 max-w-md ml-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ops-muted" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: search,
            onChange: (e) => setSearch(e.target.value),
            className: "w-full bg-ops-overlay border border-ops-subtle rounded pl-9 pr-3 py-1.5 text-sm text-ops-primary",
            placeholder: "Search by field key or label..."
          }
        ),
        search && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => setSearch(""),
            className: "absolute right-2 top-1/2 -translate-y-1/2 text-ops-muted hover:text-ops-primary",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "w-3 h-3" })
          }
        )
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-center", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(RefreshCw, { className: "w-8 h-8 text-ops-muted animate-spin mx-auto mb-2" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-ops-muted text-sm", children: "Loading custom fields..." })
    ] }) }) : filteredFields.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-center p-8", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "w-12 h-12 text-ops-muted mx-auto mb-4" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-semibold text-ops-primary mb-2", children: fields.length === 0 ? "No Custom Fields Defined" : "No Matching Fields" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-ops-muted mb-4", children: fields.length === 0 ? "Create your first custom field definition to extend entity attributes." : "Try adjusting your search to see more results." }),
      fields.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: handleCreate,
          className: "flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded text-sm text-white transition-colors mx-auto",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "w-4 h-4" }),
            "Create Field"
          ]
        }
      )
    ] }) }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "sticky top-0 bg-ops-surface border-b border-ops-subtle", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-3 py-2 text-xs font-semibold text-ops-muted", children: "Key" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-3 py-2 text-xs font-semibold text-ops-muted", children: "Label" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-3 py-2 text-xs font-semibold text-ops-muted", children: "Entity" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-3 py-2 text-xs font-semibold text-ops-muted", children: "Tiers" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-3 py-2 text-xs font-semibold text-ops-muted", children: "Type" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-3 py-2 text-xs font-semibold text-ops-muted", children: "Security" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-center px-3 py-2 text-xs font-semibold text-ops-muted", children: "Mandatory" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-center px-3 py-2 text-xs font-semibold text-ops-muted", children: "Status" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-center px-3 py-2 text-xs font-semibold text-ops-muted", children: "Actions" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: filteredFields.map((field) => {
        const readColors = CLEARANCE_COLORS[field.read_clearance_level];
        const writeColors = CLEARANCE_COLORS[field.write_clearance_level];
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "tr",
          {
            className: clsx(
              "border-b border-ops-subtle hover:bg-ops-overlay/50 transition-colors",
              !field.is_active && "opacity-50"
            ),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-mono text-xs text-sky-400", children: field.field_key }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-ops-primary", children: field.display_label }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 bg-ops-overlay rounded text-xs text-ops-primary", children: [
                TARGET_ENTITY_METADATA[field.target_entity].icon,
                " ",
                TARGET_ENTITY_METADATA[field.target_entity].label
              ] }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: field.applicable_tiers && field.applicable_tiers.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-1", children: field.applicable_tiers.map((tier) => /* @__PURE__ */ jsxRuntimeExports.jsx(
                "span",
                {
                  className: "px-1.5 py-0.5 bg-ops-overlay rounded text-xs text-ops-muted font-mono",
                  children: tier
                },
                tier
              )) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-ops-muted text-xs", children: "All tiers" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 bg-ops-overlay rounded text-xs text-ops-primary", children: [
                DATA_TYPE_METADATA[field.data_type].icon,
                " ",
                DATA_TYPE_METADATA[field.data_type].label
              ] }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "span",
                  {
                    className: clsx(
                      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border",
                      readColors.bg,
                      readColors.text,
                      readColors.border
                    ),
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(Eye, { className: "w-2.5 h-2.5" }),
                      field.read_clearance_level.replace("_", " ")
                    ]
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(
                  "span",
                  {
                    className: clsx(
                      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border",
                      writeColors.bg,
                      writeColors.text,
                      writeColors.border
                    ),
                    children: [
                      /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-2.5 h-2.5" }),
                      field.write_clearance_level.replace("_", " ")
                    ]
                  }
                )
              ] }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-center", children: field.is_mandatory ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-900/30 text-red-400", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-bold", children: "*" }) }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-ops-muted text-xs", children: "—" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: () => handleToggleActive(field),
                  className: clsx(
                    "inline-flex items-center justify-center w-8 h-5 rounded-full relative transition-colors",
                    field.is_active ? "bg-green-500" : "bg-ops-surface"
                  ),
                  title: field.is_active ? "Deactivate" : "Cannot reactivate (use Edit)",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "div",
                    {
                      className: clsx(
                        "absolute top-0.5 w-4 h-4 rounded-full bg-ops-base transition-transform",
                        field.is_active ? "left-3" : "left-0.5"
                      )
                    }
                  )
                }
              ) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-center gap-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    onClick: () => handleEdit(field),
                    className: "p-1 rounded hover:bg-ops-overlay text-ops-muted hover:text-sky-400 transition-colors",
                    title: "Edit",
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(SquarePen, { className: "w-3.5 h-3.5" })
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    onClick: () => handleInspectAudit(field),
                    className: "p-1 rounded hover:bg-ops-overlay text-ops-muted hover:text-amber-400 transition-colors",
                    title: "Inspect Audit History",
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(History, { className: "w-3.5 h-3.5" })
                  }
                ),
                confirmDelete === field.id ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      onClick: () => handleDelete(field.id),
                      className: "px-2 py-0.5 bg-red-600 hover:bg-red-500 rounded text-xs text-white transition-colors",
                      children: "Confirm"
                    }
                  ),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(
                    "button",
                    {
                      onClick: () => setConfirmDelete(null),
                      className: "px-2 py-0.5 bg-ops-overlay rounded text-xs text-ops-muted hover:text-ops-primary transition-colors",
                      children: "Cancel"
                    }
                  )
                ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    onClick: () => setConfirmDelete(field.id),
                    className: "p-1 rounded hover:bg-ops-overlay text-ops-muted hover:text-red-400 transition-colors",
                    title: "Delete",
                    children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "w-3.5 h-3.5" })
                  }
                )
              ] }) })
            ]
          },
          field.id
        );
      }) })
    ] }) }),
    filteredFields.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-4 py-2 border-t border-ops-subtle text-xs text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        "Showing ",
        filteredFields.length,
        " of ",
        fields.length,
        " field definitions"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
          "Active: ",
          fields.filter((f) => f.is_active).length
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
          "Mandatory: ",
          fields.filter((f) => f.is_mandatory).length
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
          "Classified:",
          " ",
          fields.filter((f) => f.read_clearance_level !== "OFFICIAL").length
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      FieldDefinitionDrawer,
      {
        isOpen: showDrawer,
        onClose: () => {
          setShowDrawer(false);
          setEditingField(null);
        },
        editingField,
        onSave: handleSave
      }
    )
  ] });
};
export {
  CustomFieldsAdminView as default
};
//# sourceMappingURL=CustomFieldsAdminView-C-mwBIOt.js.map
