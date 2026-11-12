import { r as reactExports, b as api, j as jsxRuntimeExports, k as Calendar, K as Plus, C as Clock, Y as CircleCheckBig, aJ as CircleX, i as CircleAlert } from "./index-DwHrkWl2.js";
const LEAVE_TYPES = [
  { value: "ANNUAL", label: "Annual Leave" },
  { value: "SICK", label: "Sick Leave" },
  { value: "MATERNITY", label: "Maternity Leave" },
  { value: "PATERNITY", label: "Paternity Leave" },
  { value: "JURY", label: "Jury Duty" },
  { value: "UNPAID", label: "Unpaid Leave" },
  { value: "TRAINING", label: "Training" },
  { value: "OTHER", label: "Other" }
];
function getStatusBadge(status) {
  const styles = {
    PENDING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    APPROVED: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    REJECTED: "bg-red-500/20 text-red-400 border-red-500/30",
    CANCELLED: "bg-gray-500/20 text-gray-400 border-gray-500/30"
  };
  const icons = {
    PENDING: /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 14 }),
    APPROVED: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheckBig, { size: 14 }),
    REJECTED: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { size: 14 }),
    CANCELLED: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleAlert, { size: 14 })
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${styles[status] || styles.PENDING}`, children: [
    icons[status],
    status
  ] });
}
const LeaveManagementView = () => {
  const [myRequests, setMyRequests] = reactExports.useState([]);
  const [pendingRequests, setPendingRequests] = reactExports.useState([]);
  const [showForm, setShowForm] = reactExports.useState(false);
  const [loading, setLoading] = reactExports.useState(true);
  const [leaveType, setLeaveType] = reactExports.useState("ANNUAL");
  const [startDate, setStartDate] = reactExports.useState("");
  const [endDate, setEndDate] = reactExports.useState("");
  const [reason, setReason] = reactExports.useState("");
  const [submitting, setSubmitting] = reactExports.useState(false);
  const [comment, setComment] = reactExports.useState("");
  reactExports.useEffect(() => {
    loadData();
  }, []);
  const loadData = async () => {
    try {
      const [myRes, pendingRes] = await Promise.all([
        api.get("/api/v1/leave/my-requests"),
        api.get("/api/v1/leave/pending")
      ]);
      setMyRequests(myRes.data.requests || []);
      setPendingRequests(pendingRes.data.pending_requests || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!startDate || !endDate) return;
    setSubmitting(true);
    try {
      await api.post("/api/v1/leave/requests", null, {
        params: { leave_type: leaveType, start_date: startDate, end_date: endDate, reason: reason || void 0 }
      });
      setShowForm(false);
      setStartDate("");
      setEndDate("");
      setReason("");
      loadData();
    } catch {
    } finally {
      setSubmitting(false);
    }
  };
  const handleCancel = async (id) => {
    try {
      await api.post(`/api/v1/leave/${id}/cancel`);
      loadData();
    } catch {
    }
  };
  const handleApprove = async (id) => {
    try {
      await api.post(`/api/v1/leave/${id}/approve`, null, {
        params: { comment: comment || void 0 }
      });
      setComment("");
      loadData();
    } catch {
    }
  };
  const handleReject = async (id) => {
    try {
      await api.post(`/api/v1/leave/${id}/reject`, null, {
        params: { comment }
      });
      setComment("");
      loadData();
    } catch {
    }
  };
  if (loading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-full text-text-ops-muted", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-6 h-6 rounded-full border-2 border-border-ops-subtle border-t-blue-500 animate-spin" }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full overflow-auto p-6 gap-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("h1", { className: "text-xl font-semibold text-text-ops-primary flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { size: 20 }),
          "Leave Management"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-text-ops-muted mt-1", children: "Book leave and manage approval requests" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => setShowForm(!showForm),
          className: "flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { size: 16 }),
            "Book Leave"
          ]
        }
      )
    ] }),
    showForm && /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, className: "bg-surface-ops-elevated border border-border-ops-subtle rounded-lg p-4 grid grid-cols-1 md:grid-cols-5 gap-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Leave Type" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "select",
          {
            value: leaveType,
            onChange: (e) => setLeaveType(e.target.value),
            className: "w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none",
            children: LEAVE_TYPES.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: t.value, children: t.label }, t.value))
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Start Date" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "date",
            value: startDate,
            onChange: (e) => setStartDate(e.target.value),
            required: true,
            className: "w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "End Date" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "date",
            value: endDate,
            onChange: (e) => setEndDate(e.target.value),
            required: true,
            className: "w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs text-text-ops-muted mb-1", children: "Reason (optional)" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "input",
          {
            type: "text",
            value: reason,
            onChange: (e) => setReason(e.target.value),
            placeholder: "Brief reason...",
            className: "w-full px-3 py-2 bg-surface-ops-base border border-border-ops-subtle rounded text-sm text-text-ops-primary focus:border-blue-500 outline-none"
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-end gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "submit",
            disabled: submitting,
            className: "flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors",
            children: submitting ? "Submitting..." : "Submit"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "button",
            onClick: () => setShowForm(false),
            className: "px-4 py-2 bg-surface-ops-base border border-border-ops-subtle hover:border-border-ops-strong rounded-lg text-sm text-text-ops-muted transition-colors",
            children: "Cancel"
          }
        )
      ] })
    ] }),
    pendingRequests.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-surface-ops-elevated border border-yellow-500/30 rounded-lg p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h2", { className: "text-sm font-semibold text-yellow-400 flex items-center gap-2 mb-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 16 }),
        "Pending Approvals (",
        pendingRequests.length,
        ")"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children: pendingRequests.map((req) => {
        var _a, _b;
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-3 bg-surface-ops-base rounded border border-border-ops-subtle", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-text-ops-primary", children: ((_a = req.requester) == null ? void 0 : _a.full_name) || ((_b = req.requester) == null ? void 0 : _b.username) || `User #${req.user_id}` }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-text-ops-muted px-2 py-0.5 bg-surface-ops-elevated rounded", children: req.leave_type })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-text-ops-muted mt-1", children: [
              req.start_date,
              " → ",
              req.end_date,
              req.reason && ` — ${req.reason}`
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 ml-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "text",
                value: comment,
                onChange: (e) => setComment(e.target.value),
                placeholder: "Comment...",
                className: "w-40 px-2 py-1 bg-surface-ops-base border border-border-ops-subtle rounded text-xs text-text-ops-primary focus:border-blue-500 outline-none"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => handleApprove(req.id),
                className: "p-1.5 text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors",
                title: "Approve",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheckBig, { size: 18 })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => handleReject(req.id),
                className: "p-1.5 text-red-400 hover:bg-red-500/20 rounded transition-colors",
                title: "Reject",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { size: 18 })
              }
            )
          ] })
        ] }, req.id);
      }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-surface-ops-elevated border border-border-ops-subtle rounded-lg", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-4 border-b border-border-ops-subtle", children: /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-semibold text-text-ops-primary", children: "My Leave Requests" }) }),
      myRequests.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-8 text-center text-text-ops-muted text-sm", children: "No leave requests yet." }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle text-text-ops-muted text-xs", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-2", children: "Type" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-2", children: "Dates" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-2", children: "Reason" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-2", children: "Status" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-2", children: "Manager Comment" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-right px-4 py-2", children: "Actions" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: myRequests.map((req) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border-ops-subtle/50 hover:bg-surface-ops-base/50", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-2 text-text-ops-primary", children: req.leave_type }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "px-4 py-2 text-text-ops-muted", children: [
            req.start_date,
            " → ",
            req.end_date
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-2 text-text-ops-muted max-w-xs truncate", children: req.reason || "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-2", children: getStatusBadge(req.status) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-2 text-text-ops-muted max-w-xs truncate", children: req.manager_comment || "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-2 text-right", children: req.status === "PENDING" && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => handleCancel(req.id),
              className: "text-xs text-red-400 hover:text-red-300 transition-colors",
              children: "Cancel"
            }
          ) })
        ] }, req.id)) })
      ] })
    ] })
  ] });
};
export {
  LeaveManagementView as default
};
//# sourceMappingURL=LeaveManagementView-CNtP9zzO.js.map
