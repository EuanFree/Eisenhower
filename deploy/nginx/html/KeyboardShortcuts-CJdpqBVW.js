import { j as jsxRuntimeExports, R as React, ad as Settings, bw as Undo2, bz as Redo2, al as Search, X, J as ChevronLeft, g as ChevronRight, bA as Maximize2, bB as Minimize2, bC as LayoutGrid, bD as Printer, c as clsx } from "./index-DwHrkWl2.js";
const categories = [
  {
    title: "Display & Settings",
    shortcuts: [
      {
        keys: ["Ctrl", "Shift", "D"],
        description: "Open Display Calibration & Roaming Settings modal",
        icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Settings, { className: "w-4 h-4" })
      }
    ]
  },
  {
    title: "Undo / Redo",
    shortcuts: [
      {
        keys: ["Ctrl", "Z"],
        description: "Undo last action (200+ step history)",
        icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Undo2, { className: "w-4 h-4" })
      },
      {
        keys: ["Ctrl", "Y"],
        description: "Redo last undone action",
        icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Redo2, { className: "w-4 h-4" })
      }
    ]
  },
  {
    title: "Search & Navigation",
    shortcuts: [
      {
        keys: ["Ctrl", "K"],
        description: "Open Global Omni-Search / Command Palette",
        icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "w-4 h-4" }),
        available: false
      },
      {
        keys: ["Esc"],
        description: "Dismiss active hover inspection modals and slide-out drawers",
        icon: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "w-4 h-4" })
      }
    ]
  },
  {
    title: "Gantt Chart",
    shortcuts: [
      {
        keys: ["←"],
        description: "Scroll timeline left (when Gantt is focused)",
        icon: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronLeft, { className: "w-4 h-4" })
      },
      {
        keys: ["→"],
        description: "Scroll timeline right (when Gantt is focused)",
        icon: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "w-4 h-4" })
      },
      {
        keys: ["+"],
        description: "Zoom in timeline (Days → Weeks → Months)",
        icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Maximize2, { className: "w-4 h-4" })
      },
      {
        keys: ["-"],
        description: "Zoom out timeline",
        icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Minimize2, { className: "w-4 h-4" })
      }
    ]
  },
  {
    title: "WBS Grid",
    shortcuts: [
      {
        keys: ["Enter"],
        description: "Expand/collapse selected node (when WBS is focused)",
        icon: /* @__PURE__ */ jsxRuntimeExports.jsx(LayoutGrid, { className: "w-4 h-4" })
      },
      {
        keys: ["↑"],
        description: "Move selection up one row",
        icon: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronLeft, { className: "w-4 h-4" })
      },
      {
        keys: ["↓"],
        description: "Move selection down one row",
        icon: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "w-4 h-4" })
      }
    ]
  },
  {
    title: "Printing",
    shortcuts: [
      {
        keys: ["Ctrl", "P"],
        description: "Print current view (browser print dialog)",
        icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Printer, { className: "w-4 h-4" })
      }
    ]
  }
];
const KeyBadge = ({ key: keyText }) => {
  const isModifier = ["Ctrl", "Shift", "Alt", "Cmd"].includes(keyText);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "span",
    {
      className: clsx(
        "inline-flex items-center justify-center font-mono text-xs rounded border border-border-ops-subtle bg-bg-ops-base",
        isModifier ? "px-2 py-1 min-w-[36px]" : "px-1.5 py-1 min-w-[24px]"
      ),
      children: keyText
    }
  );
};
const KeyboardShortcuts = () => {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-3xl mx-auto", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-8 pb-6 border-b border-border-ops-subtle", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-2xl font-bold text-text-ops-primary mb-2", children: "Keyboard Shortcuts" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-text-ops-muted", children: "Reference guide for all global keyboard shortcuts available in the Eisenhower Portfolio Manager." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-8", children: categories.map((category) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-semibold uppercase tracking-wider text-text-ops-muted mb-3", children: category.title }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "bg-bg-ops-surface border border-border-ops-subtle rounded-lg divide-y divide-border-ops-subtle", children: category.shortcuts.map((shortcut, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          className: "flex items-center justify-between px-4 py-3",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted", children: shortcut.icon }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm text-text-ops-primary", children: shortcut.description }),
              !shortcut.available && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-2 text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30", children: "Coming Soon" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-1", children: shortcut.keys.map((key, j) => /* @__PURE__ */ jsxRuntimeExports.jsxs(React.Fragment, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(KeyBadge, {}, key),
              j < shortcut.keys.length - 1 && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-text-ops-muted mx-0.5", children: "+" })
            ] }, j)) })
          ]
        },
        i
      )) })
    ] }, category.title)) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-10 p-4 bg-bg-ops-surface border border-border-ops-subtle rounded-lg", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-sm font-semibold text-text-ops-primary mb-2", children: "Notes" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "text-sm text-text-ops-muted space-y-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          "• ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Ctrl+Shift+D" }),
          " toggles the Display Calibration modal, allowing you to adjust density, scale factor, theme, and color accessibility settings in real time."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          "• ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Ctrl+Z / Ctrl+Y" }),
          " provides 200+ step undo/redo history, aligned with backend database transactional rollback and forensic audit logging."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          "• ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Ctrl+K" }),
          " will open the Global Omni-Search / Command Palette for quick navigation to any task, resource, or location."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
          "• ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Esc" }),
          " dismisses all active hover inspection modals, slide-out drawers, and context menus."
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "• Arrow keys in the Gantt chart scroll the timeline horizontally; in the WBS grid, they move the row selection up and down." })
      ] })
    ] })
  ] });
};
export {
  KeyboardShortcuts as default
};
//# sourceMappingURL=KeyboardShortcuts-CJdpqBVW.js.map
