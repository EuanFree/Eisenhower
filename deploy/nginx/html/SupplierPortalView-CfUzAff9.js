import { r as reactExports, b as api, j as jsxRuntimeExports, D as Shield, _ as Package, z as TrendingUp, T as TriangleAlert, $ as FileText, c as clsx, a0 as Upload, i as CircleAlert, x as LoaderCircle, R as React, C as Clock, a1 as ChevronUp, f as ChevronDown } from "./index-DwHrkWl2.js";
const CDRL_STATUS_COLORS = {
  DRAFTING: "text-text-ops-muted",
  SUBMITTED: "text-sky-400",
  UNDER_REVIEW: "text-amber-400",
  ACCEPTED: "text-green-400",
  ACCEPTED_WITH_COMMENTS: "text-blue-400",
  REJECTED: "text-red-400"
};
const CDRL_STATUS_BG = {
  DRAFTING: "bg-bg-ops-overlay",
  SUBMITTED: "bg-sky-900/30",
  UNDER_REVIEW: "bg-amber-900/30",
  ACCEPTED: "bg-green-900/30",
  ACCEPTED_WITH_COMMENTS: "bg-blue-900/30",
  REJECTED: "bg-red-900/30"
};
const CDRLInTray = ({ deliverables, loading }) => {
  const [expandedId, setExpandedId] = reactExports.useState(null);
  if (loading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-center py-12 text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-5 h-5 mr-2 animate-spin" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm", children: "Loading deliverables..." })
    ] });
  }
  if (deliverables.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-12 text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "w-10 h-10 mb-3 opacity-50" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "No deliverables assigned to your vendor." })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "CDRL Number" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Title" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Revision" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Status" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Due Date" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Review Window" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "py-2 px-3 w-8" })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: deliverables.map((cdrl) => {
      const isExpanded = expandedId === cdrl.id;
      const statusColor = CDRL_STATUS_COLORS[cdrl.status] || "text-text-ops-muted";
      const statusBg = CDRL_STATUS_BG[cdrl.status] || "bg-bg-ops-overlay";
      let countdownColor = "text-text-ops-muted";
      let countdownBg = "bg-bg-ops-overlay";
      if (cdrl.days_until_review_deadline !== null && cdrl.days_until_review_deadline !== void 0) {
        if (cdrl.days_until_review_deadline < 0) {
          countdownColor = "text-red-400";
          countdownBg = "bg-red-900/30";
        } else if (cdrl.days_until_review_deadline <= 5) {
          countdownColor = "text-amber-400";
          countdownBg = "bg-amber-900/30";
        } else {
          countdownColor = "text-green-400";
          countdownBg = "bg-green-900/30";
        }
      }
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(React.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "tr",
          {
            className: "border-b border-border-ops-subtle hover:bg-bg-ops-overlay/50 cursor-pointer transition-colors",
            onClick: () => setExpandedId(isExpanded ? null : cdrl.id),
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: cdrl.cdrl_sequence_number }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-primary truncate max-w-[250px]", children: cdrl.title }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-muted", children: cdrl.revision }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: clsx(
                "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                statusBg,
                statusColor
              ), children: cdrl.status }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-muted", children: cdrl.contractual_due_date ? new Date(cdrl.contractual_due_date).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric"
              }) : "—" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: cdrl.days_until_review_deadline !== null && cdrl.days_until_review_deadline !== void 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: clsx(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
                countdownBg,
                countdownColor
              ), children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { className: "w-3 h-3" }),
                cdrl.days_until_review_deadline < 0 ? `${Math.abs(cdrl.days_until_review_deadline)}d Overdue` : `${cdrl.days_until_review_deadline} Days Left`
              ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted text-xs", children: "—" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-muted", children: isExpanded ? /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronUp, { className: "w-4 h-4" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: "w-4 h-4" }) })
            ]
          }
        ),
        isExpanded && /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { className: "bg-bg-ops-overlay/30", children: /* @__PURE__ */ jsxRuntimeExports.jsx("td", { colSpan: 7, className: "py-3 px-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4 text-xs", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "DID Reference:" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-mono text-text-ops-primary mt-0.5", children: cdrl.did_reference || "—" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Submitted:" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-mono text-text-ops-primary mt-0.5", children: cdrl.actual_submission_date ? new Date(cdrl.actual_submission_date).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric"
            }) : "Not yet submitted" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "Review Deadline:" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-mono text-text-ops-primary mt-0.5", children: cdrl.review_deadline_date ? new Date(cdrl.review_deadline_date).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric"
            }) : "—" })
          ] })
        ] }) }) })
      ] }, cdrl.id);
    }) })
  ] }) });
};
const ProgressMatrix = ({ tasks, loading, onProgressUpdate }) => {
  const [editingId, setEditingId] = reactExports.useState(null);
  const [editPercent, setEditPercent] = reactExports.useState(0);
  const [editNotes, setEditNotes] = reactExports.useState("");
  const [editHours, setEditHours] = reactExports.useState("");
  if (loading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-center py-12 text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-5 h-5 mr-2 animate-spin" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm", children: "Loading work packages..." })
    ] });
  }
  if (tasks.length === 0) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-12 text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Package, { className: "w-10 h-10 mb-3 opacity-50" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "No work packages assigned to your vendor." })
    ] });
  }
  const startEdit = (task) => {
    setEditingId(task.id);
    setEditPercent(task.percent_complete);
    setEditNotes("");
    setEditHours("");
  };
  const saveEdit = (taskId) => {
    if (editPercent < 0 || editPercent > 100) return;
    const update = {
      percent_complete: editPercent,
      notes: editNotes || void 0,
      hours_logged_today: editHours ? parseFloat(editHours) : void 0
    };
    onProgressUpdate(taskId, update);
    setEditingId(null);
  };
  const cancelEdit = () => {
    setEditingId(null);
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle text-text-ops-muted", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Code" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Task Name" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Delivery" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Planned" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Progress" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Float" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left py-2 px-3 font-medium", children: "Blockers" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "py-2 px-3 w-20", children: "Actions" })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: tasks.map((task) => {
      const isEditing = editingId === task.id;
      const progressColor = task.percent_complete >= 100 ? "bg-green-500" : task.percent_complete >= 50 ? "bg-amber-500" : "bg-sky-500";
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "tr",
        {
          className: clsx(
            "border-b border-border-ops-subtle hover:bg-bg-ops-overlay/50 transition-colors",
            task.is_critical && "border-l-2 border-l-red-500"
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "py-2 px-3 font-mono text-text-ops-primary", children: [
              task.code,
              task.is_critical && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 text-red-400", title: "Critical Path", children: "★" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 text-text-ops-primary truncate max-w-[200px]", children: task.name === "[RESTRICTED]" ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "italic text-text-ops-muted", title: "Classified — insufficient clearance", children: "[RESTRICTED]" }) : task.name }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: task.delivery_mode ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: clsx(
              "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
              task.delivery_mode === "AGILE" ? "bg-purple-900/30 text-purple-400" : task.delivery_mode === "HYBRID" ? "bg-blue-900/30 text-blue-400" : "bg-bg-ops-overlay text-text-ops-muted"
            ), children: task.delivery_mode }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted text-xs", children: "—" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-text-ops-muted text-xs", children: task.planned_start_date && task.planned_end_date ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              new Date(task.planned_start_date).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short"
              }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
              "→ ",
              new Date(task.planned_end_date).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short"
              })
            ] }) : "—" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: isEditing ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  type: "number",
                  min: 0,
                  max: 100,
                  value: editPercent,
                  onChange: (e) => setEditPercent(Number(e.target.value)),
                  className: "w-16 bg-bg-ops-base border border-border-ops-subtle rounded px-2 py-1 text-sm font-mono text-text-ops-primary",
                  "aria-label": "Progress percentage"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "%" })
            ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 h-2 bg-bg-ops-overlay rounded-full overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                "div",
                {
                  className: clsx("h-full rounded-full transition-all", progressColor),
                  style: { width: `${task.percent_complete}%` }
                }
              ) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-mono text-xs text-text-ops-primary w-10 text-right", children: [
                task.percent_complete.toFixed(0),
                "%"
              ] })
            ] }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3 font-mono text-xs", children: task.total_float !== null ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: clsx(
              task.total_float <= 0 ? "text-red-400" : "text-text-ops-muted"
            ), children: [
              task.total_float,
              "d"
            ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted", children: "—" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: task.has_active_blocker ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 text-amber-400", title: `${task.blockers_count} active blocker(s)`, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-4 h-4" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs", children: task.blockers_count })
            ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted text-xs", children: "—" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "py-2 px-3", children: isEditing ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  type: "text",
                  placeholder: "Notes...",
                  value: editNotes,
                  onChange: (e) => setEditNotes(e.target.value),
                  className: "w-full bg-bg-ops-base border border-border-ops-subtle rounded px-2 py-1 text-xs text-text-ops-primary",
                  "aria-label": "Status notes"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "input",
                {
                  type: "number",
                  min: 0,
                  step: 0.5,
                  placeholder: "Hours",
                  value: editHours,
                  onChange: (e) => setEditHours(e.target.value),
                  className: "w-full bg-bg-ops-base border border-border-ops-subtle rounded px-2 py-1 text-xs text-text-ops-primary",
                  "aria-label": "Hours logged today"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-1", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => saveEdit(task.id),
                    className: "flex-1 px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-xs text-white transition-colors",
                    children: "Save"
                  }
                ),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "button",
                  {
                    type: "button",
                    onClick: cancelEdit,
                    className: "flex-1 px-2 py-1 bg-bg-ops-overlay hover:bg-bg-ops-surface rounded text-xs text-text-ops-muted transition-colors",
                    children: "Cancel"
                  }
                )
              ] })
            ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                type: "button",
                onClick: () => startEdit(task),
                className: "px-2 py-1 bg-bg-ops-overlay hover:bg-bg-ops-surface rounded text-xs text-text-ops-muted hover:text-text-ops-primary transition-colors",
                children: "Edit"
              }
            ) })
          ]
        },
        task.id
      );
    }) })
  ] }) });
};
const ScheduleUploadBox = () => {
  const [isDragging, setIsDragging] = reactExports.useState(false);
  const [uploading, setUploading] = reactExports.useState(false);
  const [uploadMessage, setUploadMessage] = reactExports.useState(null);
  const fileInputRef = reactExports.useRef(null);
  const handleDrop = reactExports.useCallback(async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await uploadFile(file);
  }, []);
  const handleFileSelect = reactExports.useCallback(async (e) => {
    var _a;
    const file = (_a = e.target.files) == null ? void 0 : _a[0];
    if (file) await uploadFile(file);
  }, []);
  const uploadFile = reactExports.useCallback(async (file) => {
    var _a, _b, _c;
    const ext = (_a = file.name.split(".").pop()) == null ? void 0 : _a.toLowerCase();
    if (ext !== "xer" && ext !== "xml") {
      setUploadMessage("Error: Only .xer (Primavera P6) or .xml (MS Project) files are accepted.");
      return;
    }
    setUploading(true);
    setUploadMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await api.post("/api/v1/supplier-portal/schedule/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      if (response.data) {
        setUploadMessage(`✓ ${response.data.message || "File uploaded successfully."}`);
      }
    } catch (err) {
      setUploadMessage(`Error: ${((_c = (_b = err.response) == null ? void 0 : _b.data) == null ? void 0 : _c.detail) || "Upload failed."}`);
    } finally {
      setUploading(false);
    }
  }, []);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "div",
    {
      className: clsx(
        "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
        isDragging ? "border-sky-500 bg-sky-900/10" : "border-border-ops-subtle hover:border-border-ops-strong"
      ),
      onDragOver: (e) => {
        e.preventDefault();
        setIsDragging(true);
      },
      onDragLeave: () => setIsDragging(false),
      onDrop: handleDrop,
      children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Upload, { className: "w-10 h-10 mx-auto mb-3 text-text-ops-muted" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-text-ops-primary text-sm mb-1", children: "Upload Monthly Schedule Update" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-text-ops-muted text-xs mb-4", children: [
          "Drag and drop a ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "font-mono", children: ".xer" }),
          " (Primavera P6) or",
          " ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { className: "font-mono", children: ".xml" }),
          " (MS Project) file"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => {
              var _a;
              return (_a = fileInputRef.current) == null ? void 0 : _a.click();
            },
            disabled: uploading,
            className: "px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-sky-800 rounded-md text-sm text-white transition-colors",
            children: uploading ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "w-4 h-4 animate-spin" }),
              "Uploading..."
            ] }) : "Select File"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            ref: fileInputRef,
            type: "file",
            accept: ".xer,.xml",
            className: "hidden",
            onChange: handleFileSelect
          }
        ),
        uploadMessage && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: clsx(
          "mt-4 text-xs font-mono",
          uploadMessage.startsWith("✓") ? "text-green-400" : "text-red-400"
        ), children: uploadMessage })
      ]
    }
  );
};
const SupplierPortalView = () => {
  const [tasks, setTasks] = reactExports.useState([]);
  const [deliverables, setDeliverables] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [error, setError] = reactExports.useState(null);
  const [activeTab, setActiveTab] = reactExports.useState("tasks");
  reactExports.useEffect(() => {
    const fetchData = async () => {
      var _a, _b;
      try {
        setLoading(true);
        const [tasksRes, cdrlRes] = await Promise.all([
          api.get("/api/v1/supplier-portal/tasks").catch(() => null),
          api.get("/api/v1/supplier-portal/cdrl").catch(() => null)
        ]);
        if (tasksRes == null ? void 0 : tasksRes.data) {
          setTasks(tasksRes.data.tasks || []);
        }
        if (cdrlRes == null ? void 0 : cdrlRes.data) {
          setDeliverables(cdrlRes.data.deliverables || []);
        }
      } catch (err) {
        setError(((_b = (_a = err.response) == null ? void 0 : _a.data) == null ? void 0 : _b.detail) || "Failed to load supplier portal data.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);
  const handleProgressUpdate = reactExports.useCallback(async (taskId, update) => {
    try {
      const response = await api.post(`/api/v1/supplier-portal/tasks/${taskId}/progress`, update);
      if (response.data) {
        const res = await api.get("/api/v1/supplier-portal/tasks");
        if (res == null ? void 0 : res.data) {
          setTasks(res.data.tasks || []);
        }
      }
    } catch (err) {
      console.error("Progress update failed:", err);
    }
  }, []);
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.percent_complete >= 100).length;
  const blockedTasks = tasks.filter((t) => t.has_active_blocker).length;
  const criticalTasks = tasks.filter((t) => t.is_critical).length;
  const overdueDeliverables = deliverables.filter(
    (d) => d.days_until_review_deadline !== null && d.days_until_review_deadline !== void 0 && d.days_until_review_deadline < 0
  ).length;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full bg-bg-ops-base", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-surface", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Supplier Portal" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted", children: "Isolated workspace for external vendor engineers" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1.5 px-3 py-1.5 bg-bg-ops-overlay rounded-md border border-border-ops-subtle", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-4 h-4 text-sky-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-mono text-text-ops-primary", children: "SUBCONTRACTOR" })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-4 gap-4 px-6 py-3 border-b border-border-ops-subtle bg-bg-ops-surface/50", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 px-4 py-2 bg-bg-ops-overlay rounded-md", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Package, { className: "w-5 h-5 text-sky-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: "Work Packages" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-lg font-mono text-text-ops-primary", children: [
            completedTasks,
            "/",
            totalTasks
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 px-4 py-2 bg-bg-ops-overlay rounded-md", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingUp, { className: "w-5 h-5 text-amber-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: "Critical Path" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-lg font-mono text-amber-400", children: criticalTasks })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 px-4 py-2 bg-bg-ops-overlay rounded-md", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "w-5 h-5 text-red-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: "Blocked" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-lg font-mono text-red-400", children: blockedTasks })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 px-4 py-2 bg-bg-ops-overlay rounded-md", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "w-5 h-5 text-green-400" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-text-ops-muted", children: "Overdue CDRLs" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: clsx(
            "text-lg font-mono",
            overdueDeliverables > 0 ? "text-red-400" : "text-green-400"
          ), children: overdueDeliverables })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 px-6 py-2 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: () => setActiveTab("tasks"),
          className: clsx(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            activeTab === "tasks" ? "bg-bg-ops-overlay text-text-ops-primary" : "text-text-ops-muted hover:text-text-ops-primary"
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Package, { className: "w-4 h-4" }),
            "Work Packages"
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: () => setActiveTab("cdrl"),
          className: clsx(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            activeTab === "cdrl" ? "bg-bg-ops-overlay text-text-ops-primary" : "text-text-ops-muted hover:text-text-ops-primary"
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { className: "w-4 h-4" }),
            "Deliverables",
            overdueDeliverables > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 px-1.5 py-0.5 bg-red-900/50 text-red-400 rounded text-xs", children: overdueDeliverables })
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          type: "button",
          onClick: () => setActiveTab("upload"),
          className: clsx(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            activeTab === "upload" ? "bg-bg-ops-overlay text-text-ops-primary" : "text-text-ops-muted hover:text-text-ops-primary"
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Upload, { className: "w-4 h-4" }),
            "Schedule Upload"
          ]
        }
      )
    ] }),
    error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-6 mt-4 p-3 bg-red-900/20 border border-red-800/50 rounded-md flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CircleAlert, { className: "w-4 h-4 text-red-400 flex-shrink-0" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-red-400", children: error })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto p-6", children: [
      activeTab === "tasks" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-semibold text-text-ops-primary", children: "Work Package Progress Matrix" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted", children: [
            tasks.length,
            " task",
            tasks.length !== 1 ? "s" : "",
            " assigned to your vendor"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          ProgressMatrix,
          {
            tasks,
            loading,
            onProgressUpdate: handleProgressUpdate
          }
        )
      ] }),
      activeTab === "cdrl" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-semibold text-text-ops-primary", children: "Contract Deliverable In-Tray" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-text-ops-muted", children: [
            deliverables.length,
            " deliverable",
            deliverables.length !== 1 ? "s" : ""
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          CDRLInTray,
          {
            deliverables,
            loading
          }
        )
      ] }),
      activeTab === "upload" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-between mb-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-semibold text-text-ops-primary", children: "Schedule Upload" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "max-w-xl", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ScheduleUploadBox, {}) })
      ] })
    ] })
  ] });
};
export {
  SupplierPortalView as default
};
//# sourceMappingURL=SupplierPortalView-CfUzAff9.js.map
