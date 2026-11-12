import { r as reactExports, b as api, j as jsxRuntimeExports, D as Shield, k as Calendar, e as UserPlus, Y as CircleCheckBig, T as TriangleAlert, at as ArrowRight, C as Clock, U as Users, aJ as CircleX } from "./index-DwHrkWl2.js";
function getStatusBadge(delegation) {
  if (delegation.revoked) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-gray-500/20 text-gray-400 border-gray-500/30", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CircleX, { size: 14 }),
      " Revoked"
    ] });
  }
  if (delegation.is_active) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-emerald-500/20 text-emerald-400 border-emerald-500/30", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheckBig, { size: 14 }),
      " Active"
    ] });
  }
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  if (delegation.start_date > today) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-blue-500/20 text-blue-400 border-blue-500/30", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 14 }),
      " Upcoming"
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border bg-gray-500/20 text-gray-400 border-gray-500/30", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { size: 14 }),
    " Expired"
  ] });
}
const DelegationManagementView = () => {
  var _a, _b, _c, _d;
  const [outgoing, setOutgoing] = reactExports.useState([]);
  const [incoming, setIncoming] = reactExports.useState([]);
  const [activeDelegation, setActiveDelegation] = reactExports.useState(null);
  const [upcoming, setUpcoming] = reactExports.useState([]);
  const [expiring, setExpiring] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [showForm, setShowForm] = reactExports.useState(false);
  const [showCoverage, setShowCoverage] = reactExports.useState(false);
  const [tab, setTab] = reactExports.useState("outgoing");
  const [delegateeId, setDelegateeId] = reactExports.useState("");
  const [startDate, setStartDate] = reactExports.useState("");
  const [endDate, setEndDate] = reactExports.useState("");
  const [reason, setReason] = reactExports.useState("");
  const [submitting, setSubmitting] = reactExports.useState(false);
  const [error, setError] = reactExports.useState("");
  const [success, setSuccess] = reactExports.useState("");
  const [covStart, setCovStart] = reactExports.useState("");
  const [covEnd, setCovEnd] = reactExports.useState("");
  const [coverage, setCoverage] = reactExports.useState(null);
  const [userSearch, setUserSearch] = reactExports.useState("");
  const [users, setUsers] = reactExports.useState([]);
  reactExports.useEffect(() => {
    loadData();
  }, []);
  const loadData = async () => {
    try {
      const [outRes, inRes, activeRes, upRes, expRes] = await Promise.all([
        api.get("/api/v1/delegation/my-delegations", { params: { direction: "outgoing" } }),
        api.get("/api/v1/delegation/my-delegations", { params: { direction: "incoming" } }),
        api.get("/api/v1/delegation/active"),
        api.get("/api/v1/delegation/upcoming", { params: { days_ahead: 7 } }),
        api.get("/api/v1/delegation/expiring", { params: { days_ahead: 7 } })
      ]);
      setOutgoing(outRes.data.delegations || []);
      setIncoming(inRes.data.delegations || []);
      setActiveDelegation(activeRes.data.active_delegation || null);
      setUpcoming(upRes.data.upcoming || []);
      setExpiring(expRes.data.expiring || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };
  const searchUsers = async (query) => {
    setUserSearch(query);
    if (query.length < 2) {
      setUsers([]);
      return;
    }
    try {
      const res = await api.get("/api/v1/admin/users", { params: { search: query } });
      setUsers(res.data.users || []);
    } catch {
      try {
        const res = await api.get("/api/users", { params: { q: query } });
        setUsers(res.data || []);
      } catch {
        setUsers([]);
      }
    }
  };
  const handleSubmit = async (e) => {
    var _a2, _b2;
    e.preventDefault();
    if (!delegateeId || !startDate || !endDate) return;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      await api.post("/api/v1/delegation", null, {
        params: {
          delegatee_user_id: parseInt(delegateeId),
          start_date: startDate,
          end_date: endDate,
          reason: reason || void 0
        }
      });
      setSuccess("Delegation created successfully.");
      setShowForm(false);
      setDelegateeId("");
      setStartDate("");
      setEndDate("");
      setReason("");
      loadData();
    } catch (err) {
      setError(((_b2 = (_a2 = err.response) == null ? void 0 : _a2.data) == null ? void 0 : _b2.detail) || "Failed to create delegation.");
    } finally {
      setSubmitting(false);
    }
  };
  const handleRevoke = async (id) => {
    var _a2, _b2;
    if (!window.confirm("Revoke this delegation? Authority will revert to you immediately.")) return;
    try {
      await api.post(`/api/v1/delegation/${id}/revoke`);
      setSuccess("Delegation revoked.");
      loadData();
    } catch (err) {
      setError(((_b2 = (_a2 = err.response) == null ? void 0 : _a2.data) == null ? void 0 : _b2.detail) || "Failed to revoke delegation.");
    }
  };
  const handleCoverageCheck = async (e) => {
    e.preventDefault();
    if (!covStart || !covEnd) return;
    try {
      const res = await api.get("/api/v1/delegation/coverage", {
        params: { start_date: covStart, end_date: covEnd }
      });
      setCoverage(res.data);
    } catch {
      setCoverage(null);
    }
  };
  const currentDelegations = tab === "outgoing" ? outgoing : incoming;
  if (loading) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-64", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-gray-400", children: "Loading delegations..." }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-6 space-y-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("h1", { className: "text-2xl font-bold text-gray-100 flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { size: 28, className: "text-blue-400" }),
          "Delegation Management"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-gray-400 mt-1", children: "Delegate your sign-off authority when you're unavailable" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => setShowCoverage(!showCoverage),
            className: "px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm flex items-center gap-1",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { size: 16 }),
              "Check Coverage"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => setShowForm(!showForm),
            className: "px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm flex items-center gap-1",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(UserPlus, { size: 16 }),
              "New Delegation"
            ]
          }
        )
      ] })
    ] }),
    activeDelegation && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-emerald-400 font-medium", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheckBig, { size: 18 }),
        "Active Delegation"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-gray-300 mt-1", children: [
        "You have delegated sign-off authority to",
        " ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: ((_a = activeDelegation.delegatee) == null ? void 0 : _a.full_name) || ((_b = activeDelegation.delegatee) == null ? void 0 : _b.username) }),
        " ",
        "from ",
        activeDelegation.start_date,
        " to ",
        activeDelegation.end_date,
        ".",
        activeDelegation.reason && ` Reason: ${activeDelegation.reason}`
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => handleRevoke(activeDelegation.id),
          className: "mt-2 px-3 py-1 rounded text-xs bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30",
          children: "Revoke Delegation"
        }
      )
    ] }),
    error && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 16 }),
      error
    ] }),
    success && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheckBig, { size: 16 }),
      success
    ] }),
    showForm && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 rounded-lg bg-gray-800 border border-gray-700", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(UserPlus, { size: 18 }),
        "Create New Delegation"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-sm text-gray-400 mb-1", children: "Delegate To" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              placeholder: "Search users...",
              value: userSearch,
              onChange: (e) => searchUsers(e.target.value),
              className: "w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-gray-100 focus:border-blue-500 focus:outline-none"
            }
          ),
          users.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 max-h-40 overflow-y-auto rounded-lg bg-gray-900 border border-gray-600", children: users.map((u) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              type: "button",
              onClick: () => {
                setDelegateeId(String(u.id));
                setUserSearch(u.full_name || u.username);
                setUsers([]);
              },
              className: "w-full text-left px-3 py-2 hover:bg-gray-700 text-gray-200 text-sm flex items-center justify-between",
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: u.full_name || u.username }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-gray-500 text-xs", children: [
                  "@",
                  u.username
                ] })
              ]
            },
            u.id
          )) }),
          delegateeId && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 text-xs text-emerald-400", children: [
            "Selected: ",
            userSearch
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-sm text-gray-400 mb-1", children: "Start Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "date",
                value: startDate,
                onChange: (e) => setStartDate(e.target.value),
                className: "w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-gray-100 focus:border-blue-500 focus:outline-none",
                required: true
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-sm text-gray-400 mb-1", children: "End Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "date",
                value: endDate,
                onChange: (e) => setEndDate(e.target.value),
                className: "w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-gray-100 focus:border-blue-500 focus:outline-none",
                required: true
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-sm text-gray-400 mb-1", children: "Reason (Optional)" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "input",
            {
              type: "text",
              value: reason,
              onChange: (e) => setReason(e.target.value),
              placeholder: "e.g., Annual leave, Training course...",
              className: "w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-gray-100 focus:border-blue-500 focus:outline-none"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "submit",
              disabled: submitting || !delegateeId || !startDate || !endDate,
              className: "px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm",
              children: submitting ? "Creating..." : "Create Delegation"
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              type: "button",
              onClick: () => {
                setShowForm(false);
                setError("");
                setSuccess("");
              },
              className: "px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm",
              children: "Cancel"
            }
          )
        ] })
      ] })
    ] }),
    showCoverage && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 rounded-lg bg-gray-800 border border-gray-700", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { size: 18 }),
        "Check Delegation Coverage"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleCoverageCheck, className: "space-y-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-sm text-gray-400 mb-1", children: "From" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "date",
                value: covStart,
                onChange: (e) => setCovStart(e.target.value),
                className: "w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-gray-100 focus:border-blue-500 focus:outline-none",
                required: true
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-sm text-gray-400 mb-1", children: "To" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "date",
                value: covEnd,
                onChange: (e) => setCovEnd(e.target.value),
                className: "w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-600 text-gray-100 focus:border-blue-500 focus:outline-none",
                required: true
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            type: "submit",
            className: "px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm",
            children: "Check Coverage"
          }
        ),
        coverage && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `mt-4 p-3 rounded-lg border ${coverage.covered ? "bg-emerald-500/10 border-emerald-500/30" : "bg-yellow-500/10 border-yellow-500/30"}`, children: coverage.covered ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-emerald-400 flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheckBig, { size: 16 }),
          "Fully covered by delegation to ",
          ((_c = coverage.delegatee) == null ? void 0 : _c.full_name) || ((_d = coverage.delegatee) == null ? void 0 : _d.username)
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-yellow-400", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 16 }),
            "Gaps in delegation coverage:"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-2 space-y-1 text-sm text-gray-300", children: coverage.gaps.map((gap, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowRight, { size: 12 }),
            gap.start,
            " to ",
            gap.end
          ] }, i)) })
        ] }) })
      ] })
    ] }),
    (upcoming.length > 0 || expiring.length > 0) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
      upcoming.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 rounded-lg bg-blue-500/5 border border-blue-500/20", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "text-sm font-semibold text-blue-400 flex items-center gap-2 mb-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Clock, { size: 14 }),
          "Starting Soon (",
          upcoming.length,
          ")"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: upcoming.map((d) => {
          var _a2, _b2;
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-gray-300 flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
              (_a2 = d.delegator) == null ? void 0 : _a2.full_name,
              " → ",
              (_b2 = d.delegatee) == null ? void 0 : _b2.full_name
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-gray-500", children: d.start_date })
          ] }, d.id);
        }) })
      ] }),
      expiring.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 rounded-lg bg-orange-500/5 border border-orange-500/20", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "text-sm font-semibold text-orange-400 flex items-center gap-2 mb-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 14 }),
          "Expiring Soon (",
          expiring.length,
          ")"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-2", children: expiring.map((d) => {
          var _a2, _b2;
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-gray-300 flex items-center justify-between", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
              (_a2 = d.delegator) == null ? void 0 : _a2.full_name,
              " → ",
              (_b2 = d.delegatee) == null ? void 0 : _b2.full_name
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-orange-400", children: [
              d.days_remaining ?? "?",
              "d left"
            ] })
          ] }, d.id);
        }) })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg bg-gray-800 border border-gray-700", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex border-b border-gray-700", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => setTab("outgoing"),
            className: `px-4 py-3 text-sm font-medium flex items-center gap-2 ${tab === "outgoing" ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-400 hover:text-gray-200"}`,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowRight, { size: 14 }),
              "My Outgoing (",
              outgoing.length,
              ")"
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => setTab("incoming"),
            className: `px-4 py-3 text-sm font-medium flex items-center gap-2 ${tab === "incoming" ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-400 hover:text-gray-200"}`,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Users, { size: 14 }),
              "My Incoming (",
              incoming.length,
              ")"
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-gray-700 text-gray-400", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Status" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-3 font-medium", children: tab === "outgoing" ? "Delegated To" : "Delegated By" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Period" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Reason" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "text-left px-4 py-3 font-medium", children: "Actions" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: currentDelegations.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { colSpan: 5, className: "px-4 py-8 text-center text-gray-500", children: [
          "No ",
          tab,
          " delegations found."
        ] }) }) : currentDelegations.map((d) => {
          const other = tab === "outgoing" ? d.delegatee : d.delegator;
          const isMyActive = tab === "outgoing" && !d.revoked && d.is_active;
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-gray-700/50 hover:bg-gray-700/30", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: getStatusBadge(d) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-gray-200", children: (other == null ? void 0 : other.full_name) || (other == null ? void 0 : other.username) || "Unknown" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "px-4 py-3 text-gray-300", children: [
              d.start_date,
              " → ",
              d.end_date
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-gray-400 text-xs", children: d.reason || "—" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: isMyActive && /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => handleRevoke(d.id),
                className: "px-2 py-1 rounded text-xs bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30",
                children: "Revoke"
              }
            ) })
          ] }, d.id);
        }) })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 rounded-lg bg-gray-800/50 border border-gray-700/50", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h3", { className: "text-sm font-semibold text-gray-300 flex items-center gap-2 mb-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { size: 14 }),
        "How Delegation Works"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "text-xs text-gray-400 space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "• When you delegate, the delegatee can approve leave requests and sign off on your behalf." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "• You can only have one active delegation at a time — overlapping dates are not allowed." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "• You can revoke a delegation at any time if your plans change." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "• When your leave is approved, the system will check whether you have delegation in place." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "• If no delegation covers your leave period, you'll receive a reminder to set one up." })
      ] })
    ] })
  ] });
};
export {
  DelegationManagementView as default
};
//# sourceMappingURL=DelegationManagementView-Bzt1nGmo.js.map
