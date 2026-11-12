import { r as reactExports, j as jsxRuntimeExports, V as ClipboardList, $ as FileText, aQ as Calculator, az as PenTool, s as ShieldCheck, R as React, g as ChevronRight, d as CircleCheck, bt as Circle, J as ChevronLeft, h as User, t as UserCheck, L as Lock, bu as Bot, a9 as TrendingDown, z as TrendingUp, T as TriangleAlert, i as CircleAlert } from "./index-DwHrkWl2.js";
const MOCK_CONTROL_ACCOUNTS = [
  {
    id: "CA-001",
    name: "CA-001: Avionics Integration",
    cam: "J. Smith",
    bac: 25e5,
    pv: 12e5,
    ev: 105e4,
    ac: 118e4,
    physicalProgress: 85,
    milestones: [
      { id: "M1", name: "PDR Review", plannedDate: "2026-09-15", actualDate: "2026-09-14", status: "COMPLETE" },
      { id: "M2", name: "Interface Freeze", plannedDate: "2026-10-30", status: "AT_RISK" },
      { id: "M3", name: "CDR Gate", plannedDate: "2026-12-15", status: "ON_TRACK" }
    ]
  },
  {
    id: "CA-002",
    name: "CA-002: Propulsion Subsystem",
    cam: "A. Patel",
    bac: 42e5,
    pv: 21e5,
    ev: 195e4,
    ac: 225e4,
    physicalProgress: 72,
    milestones: [
      { id: "M4", name: "Hot Fire Test", plannedDate: "2026-08-20", actualDate: "2026-09-05", status: "SLIPPED" },
      { id: "M5", name: "Qualification Acceptance", plannedDate: "2026-11-30", status: "AT_RISK" }
    ]
  },
  {
    id: "CA-003",
    name: "CA-003: Ground Support Equipment",
    cam: "R. Williams",
    bac: 8e5,
    pv: 6e5,
    ev: 59e4,
    ac: 595e3,
    physicalProgress: 95,
    milestones: [
      { id: "M6", name: "Delivery Acceptance", plannedDate: "2026-10-15", actualDate: "2026-10-18", status: "SLIPPED" },
      { id: "M7", name: "Commissioning", plannedDate: "2026-11-15", status: "ON_TRACK" }
    ]
  },
  {
    id: "CA-004",
    name: "CA-004: Software Development",
    cam: "L. Chen",
    bac: 31e5,
    pv: 155e4,
    ev: 152e4,
    ac: 148e4,
    physicalProgress: 68,
    milestones: [
      { id: "M8", name: "SIL Testing", plannedDate: "2026-10-01", actualDate: "2026-09-28", status: "COMPLETE" },
      { id: "M9", name: "DIL Integration", plannedDate: "2026-12-01", status: "ON_TRACK" }
    ]
  },
  {
    id: "CA-005",
    name: "CA-005: Structural Assembly",
    cam: "M. O'Brien",
    bac: 18e5,
    pv: 9e5,
    ev: 75e4,
    ac: 92e4,
    physicalProgress: 55,
    milestones: [
      { id: "M10", name: "First Article Inspection", plannedDate: "2026-09-30", status: "AT_RISK" },
      { id: "M11", name: "Assembly Completion", plannedDate: "2027-01-15", status: "ON_TRACK" }
    ]
  }
];
const MOCK_LABOR_ENTRIES = [
  { id: "L1", employeeName: "D. Thompson", role: "Senior Systems Engineer", plannedHours: 160, actualHours: 185, plannedCost: 28e3, actualCost: 32375, burnRate: 1.16 },
  { id: "L2", employeeName: "S. Kumar", role: "Propulsion Analyst", plannedHours: 160, actualHours: 142, plannedCost: 24e3, actualCost: 21300, burnRate: 0.89 },
  { id: "L3", employeeName: "E. Martinez", role: "Test Technician", plannedHours: 160, actualHours: 168, plannedCost: 16e3, actualCost: 16800, burnRate: 1.05 },
  { id: "L4", employeeName: "K. Nakamura", role: "Software Developer", plannedHours: 160, actualHours: 175, plannedCost: 32e3, actualCost: 35e3, burnRate: 1.09 },
  { id: "L5", employeeName: "P. Dubois", role: "Quality Assurance", plannedHours: 120, actualHours: 95, plannedCost: 18e3, actualCost: 14250, burnRate: 0.79 },
  { id: "L6", employeeName: "T. Johansson", role: "Structural Engineer", plannedHours: 160, actualHours: 190, plannedCost: 26e3, actualCost: 30875, burnRate: 1.19 },
  { id: "L7", employeeName: "R. Al-Farsi", role: "Avionics Technician", plannedHours: 160, actualHours: 155, plannedCost: 2e4, actualCost: 19375, burnRate: 0.97 }
];
function computeEvmMetrics(ca) {
  const cv = ca.ev - ca.ac;
  const sv = ca.ev - ca.pv;
  const cpi = ca.ac > 0 ? ca.ev / ca.ac : 0;
  const spi = ca.pv > 0 ? ca.ev / ca.pv : 0;
  const eac = cpi > 0 ? ca.bac / cpi : ca.bac;
  const etv = eac - ca.ac;
  const tcpi = ca.bac - ca.ac > 0 ? (ca.bac - ca.ev) / (ca.bac - ca.ac) : 0;
  const cvPct = Math.abs(cv) / ca.bac * 100;
  const svPct = Math.abs(sv) / ca.bac * 100;
  const flagReasons = [];
  if (cvPct > 10) {
    flagReasons.push(`|CV| = £${Math.abs(cv).toLocaleString()} (${cvPct.toFixed(1)}% of BAC) exceeds 10% threshold`);
  }
  if (svPct > 10) {
    flagReasons.push(`|SV| = £${Math.abs(sv).toLocaleString()} (${svPct.toFixed(1)}% of BAC) exceeds 10% threshold`);
  }
  if (cpi < 0.9) {
    flagReasons.push(`CPI = ${cpi.toFixed(3)} is below 0.90 threshold`);
  }
  return {
    cv,
    sv,
    cpi,
    spi,
    eac,
    etv,
    tcpi,
    cvPct,
    svPct,
    flagged: flagReasons.length > 0,
    flagReasons
  };
}
function formatCurrency(value) {
  if (value < 0) {
    return `-£${Math.abs(value).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return `£${value.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function StepProgressVerification({
  accounts
}) {
  var _a;
  const [selectedAccount, setSelectedAccount] = reactExports.useState(((_a = accounts[0]) == null ? void 0 : _a.id) || "");
  const [verifiedMilestones, setVerifiedMilestones] = reactExports.useState(/* @__PURE__ */ new Set());
  const account = accounts.find((a) => a.id === selectedAccount);
  const unverifiedCount = account ? account.milestones.filter((m) => !verifiedMilestones.has(m.id)).length : 0;
  const handleVerify = reactExports.useCallback((milestoneId) => {
    setVerifiedMilestones((prev) => {
      const next = new Set(prev);
      if (next.has(milestoneId)) {
        next.delete(milestoneId);
      } else {
        next.add(milestoneId);
      }
      return next;
    });
  }, []);
  const milestoneStatusColor = (status) => {
    switch (status) {
      case "COMPLETE":
        return "text-green-600 bg-green-50";
      case "ON_TRACK":
        return "text-blue-600 bg-blue-50";
      case "AT_RISK":
        return "text-amber-600 bg-amber-50";
      case "SLIPPED":
        return "text-red-600 bg-red-50";
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-4 border-b border-gray-200", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-semibold text-gray-900", children: "Physical Progress & Milestones" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-gray-500", children: "Verify physical completion percentages and milestone status for each control account" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-gray-500", children: "Accounts:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "select",
          {
            value: selectedAccount,
            onChange: (e) => setSelectedAccount(e.target.value),
            className: "border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
            children: accounts.map((a) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: a.id, children: a.name }, a.id))
          }
        )
      ] })
    ] }),
    account && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-4 mb-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-white rounded-lg border border-gray-200 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-gray-500 mb-1", children: "Physical Progress" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-2xl font-bold text-gray-900", children: [
            account.physicalProgress,
            "%"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 w-full bg-gray-200 rounded-full h-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              className: `h-2 rounded-full ${account.physicalProgress >= 80 ? "bg-green-500" : account.physicalProgress >= 50 ? "bg-blue-500" : "bg-amber-500"}`,
              style: { width: `${account.physicalProgress}%` }
            }
          ) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-white rounded-lg border border-gray-200 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-gray-500 mb-1", children: "CAM Responsible" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-2xl font-bold text-gray-900", children: account.cam })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-white rounded-lg border border-gray-200 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-gray-500 mb-1", children: "Unverified Milestones" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `text-2xl font-bold ${unverifiedCount > 0 ? "text-amber-600" : "text-green-600"}`, children: unverifiedCount })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-white rounded-lg border border-gray-200 overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "min-w-full divide-y divide-gray-200", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "bg-gray-50", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase", children: "Verified" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase", children: "Milestone" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase", children: "Planned Date" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase", children: "Actual Date" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase", children: "Status" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { className: "divide-y divide-gray-200", children: account.milestones.map((m) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "hover:bg-gray-50", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => handleVerify(m.id),
              className: `p-1 rounded ${verifiedMilestones.has(m.id) ? "text-green-600 bg-green-50" : "text-gray-300 hover:text-gray-500"}`,
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 20 })
            }
          ) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-sm font-medium text-gray-900", children: m.name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-sm text-gray-600", children: m.plannedDate }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-sm text-gray-600", children: m.actualDate || "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${milestoneStatusColor(m.status)}`, children: m.status.replace("_", " ") }) })
        ] }, m.id)) })
      ] }) })
    ] })
  ] });
}
function StepLaborAudit({
  laborEntries
}) {
  const totalPlannedCost = laborEntries.reduce((sum, e) => sum + e.plannedCost, 0);
  const totalActualCost = laborEntries.reduce((sum, e) => sum + e.actualCost, 0);
  const overallBurnRate = totalPlannedCost > 0 ? totalActualCost / totalPlannedCost : 0;
  const divergence = totalActualCost - totalPlannedCost;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 border-b border-gray-200", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-semibold text-gray-900", children: "Timesheet Labor & Direct Cost Audit" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-gray-500", children: "Identify labor burn divergence between planned and actual hours/costs" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-4 gap-4 p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-white rounded-lg border border-gray-200 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-gray-500 mb-1", children: "Planned Labor Cost" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xl font-bold text-gray-900", children: formatCurrency(totalPlannedCost) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-white rounded-lg border border-gray-200 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-gray-500 mb-1", children: "Actual Labor Cost" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xl font-bold text-gray-900", children: formatCurrency(totalActualCost) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-white rounded-lg border border-gray-200 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-gray-500 mb-1", children: "Burn Rate" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `text-xl font-bold ${overallBurnRate > 1.1 ? "text-red-600" : overallBurnRate > 1 ? "text-amber-600" : "text-green-600"}`, children: [
          overallBurnRate.toFixed(2),
          "x"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-white rounded-lg border border-gray-200 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-gray-500 mb-1", children: "Cost Divergence" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `text-xl font-bold ${divergence > 0 ? "text-red-600" : "text-green-600"}`, children: [
          divergence > 0 ? "+" : "",
          formatCurrency(divergence)
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-4 pt-0", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "min-w-full bg-white rounded-lg border border-gray-200 divide-y divide-gray-200", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "bg-gray-50", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase", children: "Employee" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase", children: "Role" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase", children: "Planned Hrs" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase", children: "Actual Hrs" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase", children: "Planned Cost" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase", children: "Actual Cost" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase", children: "Burn Rate" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase", children: "Variance" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { className: "divide-y divide-gray-200", children: laborEntries.map((entry) => {
        const variance = entry.actualCost - entry.plannedCost;
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "hover:bg-gray-50", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-sm font-medium text-gray-900", children: entry.employeeName }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-sm text-gray-600", children: entry.role }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-sm text-right text-gray-600", children: entry.plannedHours }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-sm text-right text-gray-600", children: entry.actualHours }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-sm text-right text-gray-600", children: formatCurrency(entry.plannedCost) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-sm text-right text-gray-600", children: formatCurrency(entry.actualCost) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${entry.burnRate > 1.1 ? "bg-red-100 text-red-700" : entry.burnRate > 1 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`, children: [
            entry.burnRate.toFixed(2),
            "x"
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `text-sm font-medium ${variance > 0 ? "text-red-600" : "text-green-600"}`, children: [
            variance > 0 ? "+" : "",
            formatCurrency(variance)
          ] }) })
        ] }, entry.id);
      }) })
    ] }) })
  ] });
}
function StepEvmComputation({
  accounts
}) {
  const metricsMap = reactExports.useMemo(() => {
    const map = /* @__PURE__ */ new Map();
    accounts.forEach((ca) => {
      map.set(ca.id, computeEvmMetrics(ca));
    });
    return map;
  }, [accounts]);
  const flaggedAccounts = accounts.filter((ca) => {
    var _a;
    return (_a = metricsMap.get(ca.id)) == null ? void 0 : _a.flagged;
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 border-b border-gray-200", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-semibold text-gray-900", children: "Earned Value Metric Computation" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-gray-500", children: "Evaluate statutory reporting thresholds: |CV| > 10%, |SV| > 10%, CPI < 0.90" }),
      flaggedAccounts.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-2 flex items-center gap-2 text-amber-600", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 16 }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-sm font-medium", children: [
          flaggedAccounts.length,
          " control account(s) flagged — mandatory narrative required"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-4 flex items-center gap-4 text-xs text-gray-500", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-3 h-3 rounded-full bg-red-500 inline-block" }),
          " Flagged (threshold breach)"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-3 h-3 rounded-full bg-amber-500 inline-block" }),
          " Warning (approaching threshold)"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-3 h-3 rounded-full bg-green-500 inline-block" }),
          " Within tolerance"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-white rounded-lg border border-gray-200 overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "min-w-full divide-y divide-gray-200", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "bg-gray-50", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase", children: "Control Account" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase", children: "BAC" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase", children: "PV" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase", children: "EV" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase", children: "AC" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase", children: "CV" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase", children: "SV" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase", children: "CPI" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase", children: "SPI" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase", children: "TCPI" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase", children: "EAC" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase", children: "Status" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { className: "divide-y divide-gray-200", children: accounts.map((ca) => {
          const m = metricsMap.get(ca.id);
          return /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "tr",
            {
              className: `hover:bg-gray-50 ${m.flagged ? "bg-red-50" : ""}`,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "px-4 py-3 text-sm font-medium text-gray-900", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("div", { children: ca.name }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-gray-500", children: [
                    "CAM: ",
                    ca.cam
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-sm text-right text-gray-600", children: formatCurrency(ca.bac) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-sm text-right text-gray-600", children: formatCurrency(ca.pv) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-sm text-right text-gray-600", children: formatCurrency(ca.ev) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-sm text-right text-gray-600", children: formatCurrency(ca.ac) }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "px-4 py-3 text-center", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `text-sm font-medium ${m.cv >= 0 ? "text-green-600" : "text-red-600"}`, children: [
                    m.cv >= 0 ? "+" : "",
                    formatCurrency(m.cv)
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-gray-400", children: [
                    m.cvPct.toFixed(1),
                    "%"
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "px-4 py-3 text-center", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `text-sm font-medium ${m.sv >= 0 ? "text-green-600" : "text-red-600"}`, children: [
                    m.sv >= 0 ? "+" : "",
                    formatCurrency(m.sv)
                  ] }),
                  /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-gray-400", children: [
                    m.svPct.toFixed(1),
                    "%"
                  ] })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-sm font-bold ${m.cpi >= 1 ? "text-green-600" : m.cpi >= 0.9 ? "text-amber-600" : "text-red-600"}`, children: m.cpi.toFixed(3) }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `text-sm font-bold ${m.spi >= 1 ? "text-green-600" : m.spi >= 0.9 ? "text-amber-600" : "text-red-600"}`, children: m.spi.toFixed(3) }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-center text-sm font-medium text-gray-900", children: m.tcpi.toFixed(3) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-center text-sm text-gray-600", children: formatCurrency(m.eac) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-center", children: m.flagged ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(CircleAlert, { size: 12 }),
                  " FLAGGED"
                ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700", children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 12 }),
                  " OK"
                ] }) })
              ]
            },
            ca.id
          );
        }) })
      ] }) }),
      flaggedAccounts.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 bg-red-50 border border-red-200 rounded-lg p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("h4", { className: "text-sm font-semibold text-red-800 mb-2 flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { size: 16 }),
          "Flagged Accounts Requiring Mandatory Narrative"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "space-y-2", children: flaggedAccounts.map((ca) => {
          const m = metricsMap.get(ca.id);
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "text-sm text-red-700", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: ca.name }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "ml-4 mt-1 list-disc space-y-1", children: m.flagReasons.map((reason, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: reason }, i)) })
          ] }, ca.id);
        }) })
      ] })
    ] })
  ] });
}
function StepIpmrNarrative({
  accounts
}) {
  var _a, _b;
  const metricsMap = reactExports.useMemo(() => {
    const map = /* @__PURE__ */ new Map();
    accounts.forEach((ca) => {
      map.set(ca.id, computeEvmMetrics(ca));
    });
    return map;
  }, [accounts]);
  const flaggedAccounts = accounts.filter((ca) => {
    var _a2;
    return (_a2 = metricsMap.get(ca.id)) == null ? void 0 : _a2.flagged;
  });
  const [selectedAccount, setSelectedAccount] = reactExports.useState(
    ((_a = flaggedAccounts[0]) == null ? void 0 : _a.id) || ((_b = accounts[0]) == null ? void 0 : _b.id) || ""
  );
  const [narratives, setNarratives] = reactExports.useState({});
  const [copiloting, setCopiloting] = reactExports.useState(false);
  const account = accounts.find((a) => a.id === selectedAccount);
  const metrics = metricsMap.get(selectedAccount);
  const narrative = narratives[selectedAccount] || {
    rootCauseTechnical: "",
    rootCauseSchedule: "",
    rootCauseCost: "",
    operationalImpact: "",
    correctiveActionPlan: "",
    mitigationOwner: "",
    targetRecoveryDate: "",
    recoveryMilestones: ""
  };
  const isMandatory = (metrics == null ? void 0 : metrics.flagged) || false;
  const updateField = reactExports.useCallback((field, value) => {
    setNarratives((prev) => ({
      ...prev,
      [selectedAccount]: {
        ...prev[selectedAccount] || narrative,
        [field]: value
      }
    }));
  }, [selectedAccount, narrative]);
  const handleDraftWithCopilot = reactExports.useCallback(async () => {
    if (!account || !metrics) return;
    setCopiloting(true);
    setTimeout(() => {
      const draft = {
        rootCauseTechnical: `Supplier delay on critical component procurement for ${account.name} has impacted downstream integration activities. Vendor lead time exceeded baseline assumption by 3 weeks.`,
        rootCauseSchedule: `Schedule slippage of ${metrics.sv < 0 ? Math.abs(metrics.sv).toLocaleString() : 0} (SV: ${formatCurrency(metrics.sv)}) driven by late delivery of long-lead items. Total float consumed on path to M-04 milestone.`,
        rootCauseCost: `Cost variance of ${formatCurrency(metrics.cv)} (CPI: ${metrics.cpi.toFixed(3)}) attributed to overtime labor required to recover schedule and expedited freight charges for critical components.`,
        operationalImpact: `Downstream impact on critical path activities: Interface Freeze (M-02) at risk of slipping by 2 weeks. CDR Gate (M-03) remains on track with float buffer of 5 days. No impact to System Handover milestone at this time.`,
        correctiveActionPlan: `1. Expedite remaining POs via air freight (cost impact: £15,000). 2. Add weekend shifts to integration team (2 additional FTEs). 3. Fast-track qualification testing where technically permissible.`,
        mitigationOwner: account.cam,
        targetRecoveryDate: "2027-01-15",
        recoveryMilestones: "Interface Freeze recovery by 2026-11-15. CDR Gate maintained at 2026-12-15."
      };
      setNarratives((prev) => ({
        ...prev,
        [selectedAccount]: draft
      }));
      setCopiloting(false);
    }, 1500);
  }, [account, metrics, selectedAccount]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between p-4 border-b border-gray-200", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-semibold text-gray-900", children: "IPMR Format 5 Variance Narrative" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm text-gray-500", children: [
          "Structured variance narrative conforming to statutory IPMR guidelines",
          isMandatory && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-2 text-red-600 font-medium", children: "— MANDATORY for this flagged account" })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-gray-500", children: "Account:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "select",
          {
            value: selectedAccount,
            onChange: (e) => setSelectedAccount(e.target.value),
            className: "border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
            children: accounts.map((a) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: a.id, children: a.name }, a.id))
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto p-4", children: [
      account && metrics && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium text-blue-800 mb-1", children: "CPM Metrics Reference" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-4 gap-2 text-xs text-blue-700", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            "CV: ",
            formatCurrency(metrics.cv),
            " (",
            metrics.cvPct.toFixed(1),
            "%)"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            "SV: ",
            formatCurrency(metrics.sv),
            " (",
            metrics.svPct.toFixed(1),
            "%)"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            "CPI: ",
            metrics.cpi.toFixed(3)
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            "SPI: ",
            metrics.spi.toFixed(3)
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-4 flex items-center justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-gray-500", children: isMandatory ? "⚠ Mandatory narrative — complete all fields" : "Optional narrative for this account" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: handleDraftWithCopilot,
            disabled: copiloting,
            className: "inline-flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-md text-sm font-medium hover:bg-purple-200 disabled:opacity-50",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Bot, { size: 14 }),
              copiloting ? "Drafting..." : "Draft with Copilot"
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-white rounded-lg border border-gray-200 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h4", { className: "text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(FileText, { size: 14 }),
            " Root Cause Analysis"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-gray-500 mb-1", children: "Technical Root Cause" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "textarea",
                {
                  value: narrative.rootCauseTechnical,
                  onChange: (e) => updateField("rootCauseTechnical", e.target.value),
                  rows: 3,
                  className: "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                  placeholder: "Describe the technical root cause of the variance..."
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-gray-500 mb-1", children: "Schedule Root Cause" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "textarea",
                {
                  value: narrative.rootCauseSchedule,
                  onChange: (e) => updateField("rootCauseSchedule", e.target.value),
                  rows: 3,
                  className: "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                  placeholder: "Describe the schedule root cause..."
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-gray-500 mb-1", children: "Cost Root Cause" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "textarea",
                {
                  value: narrative.rootCauseCost,
                  onChange: (e) => updateField("rootCauseCost", e.target.value),
                  rows: 3,
                  className: "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                  placeholder: "Describe the cost root cause..."
                }
              )
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-white rounded-lg border border-gray-200 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h4", { className: "text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingDown, { size: 14 }),
            " Operational Impact Assessment"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-gray-500 mb-1", children: "Impact on Downstream Critical Path and Testing Gates" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "textarea",
            {
              value: narrative.operationalImpact,
              onChange: (e) => updateField("operationalImpact", e.target.value),
              rows: 4,
              className: "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
              placeholder: "Assess the impact on downstream critical path activities and testing gates..."
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-white rounded-lg border border-gray-200 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h4", { className: "text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(TrendingUp, { size: 14 }),
            " Corrective Action Plan"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-gray-500 mb-1", children: "Recovery Milestones, Mitigation Owner, Target Recovery Date" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "textarea",
                {
                  value: narrative.correctiveActionPlan,
                  onChange: (e) => updateField("correctiveActionPlan", e.target.value),
                  rows: 3,
                  className: "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                  placeholder: "Describe the corrective action plan..."
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-gray-500 mb-1", children: "Mitigation Owner" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    type: "text",
                    value: narrative.mitigationOwner,
                    onChange: (e) => updateField("mitigationOwner", e.target.value),
                    className: "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                    placeholder: "Name of mitigation owner"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-gray-500 mb-1", children: "Target Recovery Date" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  "input",
                  {
                    type: "date",
                    value: narrative.targetRecoveryDate,
                    onChange: (e) => updateField("targetRecoveryDate", e.target.value),
                    className: "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-gray-500 mb-1", children: "Recovery Milestones" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "textarea",
                {
                  value: narrative.recoveryMilestones,
                  onChange: (e) => updateField("recoveryMilestones", e.target.value),
                  rows: 2,
                  className: "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                  placeholder: "List the recovery milestones..."
                }
              )
            ] })
          ] })
        ] })
      ] })
    ] })
  ] });
}
function StepAttestation({
  accounts,
  onCommit
}) {
  const [camName, setCamName] = reactExports.useState("");
  const [camSignature, setCamSignature] = reactExports.useState("");
  const [camPin, setCamPin] = reactExports.useState("");
  const [pclName, setPclName] = reactExports.useState("");
  const [pclSignature, setPclSignature] = reactExports.useState("");
  const [pclPin, setPclPin] = reactExports.useState("");
  const [camSigned, setCamSigned] = reactExports.useState(false);
  const [pclSigned, setPclSigned] = reactExports.useState(false);
  const [committing, setCommitting] = reactExports.useState(false);
  const [committed, setCommitted] = reactExports.useState(false);
  const totalBac = accounts.reduce((sum, a) => sum + a.bac, 0);
  const totalEv = accounts.reduce((sum, a) => sum + a.ev, 0);
  const totalAc = accounts.reduce((sum, a) => sum + a.ac, 0);
  const canCamSign = camName.trim().length > 0 && camSignature.trim().length > 0 && camPin.length >= 4;
  const canPclSign = pclName.trim().length > 0 && pclSignature.trim().length > 0 && pclPin.length >= 4 && camSigned;
  const canCommit = camSigned && pclSigned;
  const handleCamSign = reactExports.useCallback(() => {
    if (canCamSign) setCamSigned(true);
  }, [canCamSign]);
  const handlePclSign = reactExports.useCallback(() => {
    if (canPclSign) setPclSigned(true);
  }, [canPclSign]);
  const [attestation, setAttestation] = reactExports.useState(null);
  const handleCommit = reactExports.useCallback(async () => {
    if (!canCommit) return;
    setCommitting(true);
    await new Promise((resolve) => setTimeout(resolve, 2e3));
    const record = {
      camName,
      camSignature,
      camPin,
      projectControlsLeadName: pclName,
      projectControlsLeadSignature: pclSignature,
      projectControlsLeadPin: pclPin,
      signedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    setAttestation(record);
    onCommit(record);
    setCommitting(false);
    setCommitted(true);
  }, [canCommit, camName, camSignature, camPin, pclName, pclSignature, pclPin, onCommit]);
  if (committed) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-col items-center justify-center h-full p-8", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-green-50 border border-green-200 rounded-xl p-8 max-w-lg text-center", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 32, className: "text-green-600" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-xl font-bold text-green-800 mb-2", children: "Monthly Closeout Committed" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm text-green-700 mb-4", children: [
        "The monthly accounting period has been transitioned to ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "CLOSED_LOCKED" }),
        ". The signed IPMR Format 1–5 package has been generated and the milestone has been logged in the forensic audit ledger."
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-xs text-green-600 space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          "CAM: ",
          camName,
          " — Signed"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          "PCL: ",
          pclName,
          " — Counter-signed"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          "Timestamp: ",
          attestation == null ? void 0 : attestation.signedAt
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 flex items-center justify-center gap-2 text-xs text-green-600", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldCheck, { size: 14 }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "MERKLE_CCB_MERGE_COMMITTED block appended to audit ledger" })
      ] })
    ] }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-4 border-b border-gray-200", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-semibold text-gray-900", children: "Digital Attestation & Formal Sign-Off" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-gray-500", children: "Dual-signoff attestation by CAM and Project Controls Lead required to commit the monthly closeout" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-6 grid grid-cols-3 gap-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-white rounded-lg border border-gray-200 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-gray-500 mb-1", children: "Total BAC" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xl font-bold text-gray-900", children: formatCurrency(totalBac) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-white rounded-lg border border-gray-200 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-gray-500 mb-1", children: "Total EV" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xl font-bold text-gray-900", children: formatCurrency(totalEv) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-white rounded-lg border border-gray-200 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-gray-500 mb-1", children: "Total AC" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xl font-bold text-gray-900", children: formatCurrency(totalAc) })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `mb-6 bg-white rounded-lg border-2 p-6 ${camSigned ? "border-green-300 bg-green-50" : "border-gray-200"}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h4", { className: "text-base font-semibold text-gray-900 flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(User, { size: 18 }),
            "Officer 1: Control Account Manager (CAM)"
          ] }),
          camSigned && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 12 }),
            " Verified & Signed"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-gray-500 mb-1", children: "Full Name" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "text",
                value: camName,
                onChange: (e) => setCamName(e.target.value),
                disabled: camSigned,
                className: "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100",
                placeholder: "CAM full name"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-gray-500 mb-1", children: "Digital Signature" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "text",
                value: camSignature,
                onChange: (e) => setCamSignature(e.target.value),
                disabled: camSigned,
                className: "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100",
                placeholder: "Type full name as signature"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-gray-500 mb-1", children: "PKI PIN" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "password",
                value: camPin,
                onChange: (e) => setCamPin(e.target.value),
                disabled: camSigned,
                className: "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100",
                placeholder: "Enter PKI PIN"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: handleCamSign,
            disabled: !canCamSign || camSigned,
            className: "inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed",
            children: [
              camSigned ? /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 16 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldCheck, { size: 16 }),
              camSigned ? "Signed" : "Verify & Sign"
            ]
          }
        ) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `mb-6 bg-white rounded-lg border-2 p-6 ${pclSigned ? "border-green-300 bg-green-50" : !camSigned ? "border-gray-100 bg-gray-50" : "border-gray-200"}`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between mb-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h4", { className: "text-base font-semibold text-gray-900 flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(UserCheck, { size: 18 }),
            "Officer 2: Project Controls Lead"
          ] }),
          pclSigned && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 12 }),
            " Counter-signed"
          ] }),
          !camSigned && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Lock, { size: 12 }),
            " Awaiting Officer 1"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-gray-500 mb-1", children: "Full Name" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "text",
                value: pclName,
                onChange: (e) => setPclName(e.target.value),
                disabled: !camSigned || pclSigned,
                className: "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100",
                placeholder: "PCL full name"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-gray-500 mb-1", children: "Digital Signature" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "text",
                value: pclSignature,
                onChange: (e) => setPclSignature(e.target.value),
                disabled: !camSigned || pclSigned,
                className: "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100",
                placeholder: "Type full name as signature"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "block text-xs font-medium text-gray-500 mb-1", children: "PKI PIN" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "input",
              {
                type: "password",
                value: pclPin,
                onChange: (e) => setPclPin(e.target.value),
                disabled: !camSigned || pclSigned,
                className: "w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100",
                placeholder: "Enter PKI PIN"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: handlePclSign,
            disabled: !canPclSign || pclSigned,
            className: "inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed",
            children: [
              pclSigned ? /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 16 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldCheck, { size: 16 }),
              pclSigned ? "Counter-signed" : "Counter-sign"
            ]
          }
        ) })
      ] }),
      canCommit && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-blue-50 border border-blue-200 rounded-lg p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium text-blue-800", children: "Ready to Commit Monthly Closeout" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-blue-600", children: "This will transition the period to CLOSED_LOCKED, generate IPMR Format 1–5, and log to the forensic audit ledger" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: handleCommit,
            disabled: committing,
            className: "inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-md text-sm font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed",
            children: committing ? /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" }),
              "Committing..."
            ] }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Lock, { size: 16 }),
              "Commit Closeout"
            ] })
          }
        )
      ] }) })
    ] })
  ] });
}
const CamEvmCloseoutWizardView = () => {
  const [currentStep, setCurrentStep] = reactExports.useState("progress");
  const [completedSteps, setCompletedSteps] = reactExports.useState(/* @__PURE__ */ new Set());
  const steps = [
    { id: "progress", label: "Progress & Milestones", icon: ClipboardList },
    { id: "labor", label: "Labor & Cost Audit", icon: FileText },
    { id: "evm", label: "EVM Computation", icon: Calculator },
    { id: "narrative", label: "IPMR Narrative", icon: PenTool },
    { id: "attestation", label: "Attestation", icon: ShieldCheck }
  ];
  const stepOrder = ["progress", "labor", "evm", "narrative", "attestation"];
  const currentIndex = stepOrder.indexOf(currentStep);
  const handleNext = reactExports.useCallback(() => {
    setCompletedSteps((prev) => new Set(prev).add(currentStep));
    if (currentIndex < stepOrder.length - 1) {
      setCurrentStep(stepOrder[currentIndex + 1]);
    }
  }, [currentStep, currentIndex]);
  const handlePrev = reactExports.useCallback(() => {
    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1]);
    }
  }, [currentIndex]);
  const handleGoToStep = reactExports.useCallback((step) => {
    const stepIdx = stepOrder.indexOf(step);
    if (stepIdx <= currentIndex || completedSteps.has(step)) {
      setCurrentStep(step);
    }
  }, [currentIndex, completedSteps]);
  const handleCommit = reactExports.useCallback((attestation) => {
    console.log("CAM EVM Closeout committed:", attestation);
  }, []);
  const renderStep = () => {
    switch (currentStep) {
      case "progress":
        return /* @__PURE__ */ jsxRuntimeExports.jsx(StepProgressVerification, { accounts: MOCK_CONTROL_ACCOUNTS });
      case "labor":
        return /* @__PURE__ */ jsxRuntimeExports.jsx(StepLaborAudit, { laborEntries: MOCK_LABOR_ENTRIES });
      case "evm":
        return /* @__PURE__ */ jsxRuntimeExports.jsx(StepEvmComputation, { accounts: MOCK_CONTROL_ACCOUNTS });
      case "narrative":
        return /* @__PURE__ */ jsxRuntimeExports.jsx(StepIpmrNarrative, { accounts: MOCK_CONTROL_ACCOUNTS });
      case "attestation":
        return /* @__PURE__ */ jsxRuntimeExports.jsx(StepAttestation, { accounts: MOCK_CONTROL_ACCOUNTS, onCommit: handleCommit });
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full bg-gray-50", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-white border-b border-gray-200 px-6 py-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-xl font-bold text-gray-900", children: "CAM EVM Closeout Wizard" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-gray-500", children: "Monthly Control Account Manager earned value closeout — October 2026 reporting period" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs text-gray-400", children: "Period: Oct 2026" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium", children: "Draft" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-white border-b border-gray-200 px-6 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-0", children: steps.map((step, index) => {
      const stepIdx = stepOrder.indexOf(step.id);
      const isActive = step.id === currentStep;
      const isCompleted = completedSteps.has(step.id);
      const isReachable = stepIdx <= currentIndex || isCompleted;
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(React.Fragment, { children: [
        index > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `w-8 flex items-center justify-center ${stepIdx <= currentIndex ? "text-blue-500" : "text-gray-300"}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { size: 16 }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => isReachable && handleGoToStep(step.id),
            disabled: !isReachable,
            className: `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? "bg-blue-100 text-blue-700" : isCompleted ? "text-green-600 hover:bg-green-50" : isReachable ? "text-gray-700 hover:bg-gray-100" : "text-gray-300 cursor-not-allowed"}`,
            children: [
              isCompleted ? /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { size: 16 }) : isActive ? /* @__PURE__ */ jsxRuntimeExports.jsx(step.icon, { size: 16 }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Circle, { size: 16 }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "hidden sm:inline", children: step.label })
            ]
          }
        )
      ] }, step.id);
    }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-hidden", children: renderStep() }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: handlePrev,
          disabled: currentIndex === 0,
          className: "inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronLeft, { size: 16 }),
            "Previous"
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "text-sm text-gray-500", children: [
        "Step ",
        currentIndex + 1,
        " of ",
        stepOrder.length
      ] }),
      currentIndex < stepOrder.length - 1 ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: handleNext,
          className: "inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700",
          children: [
            "Next",
            /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { size: 16 })
          ]
        }
      ) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm text-gray-400", children: "Final step" })
    ] })
  ] });
};
export {
  CamEvmCloseoutWizardView as default
};
//# sourceMappingURL=CamEvmCloseoutWizardView-POuplAVW.js.map
