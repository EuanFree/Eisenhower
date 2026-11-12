const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/CPMGuide-BUTDf30I.js","assets/index-DwHrkWl2.js","assets/index-PKHZA3JW.css","assets/EVMHandbook-D4NgYxQe.js","assets/ABACMatrix-D3lyxtju.js","assets/AirGapGuide-00mJRM0L.js","assets/ArchitectureBlueprint-5FxtdX54.js","assets/KeyboardShortcuts-CJdpqBVW.js"])))=>i.map(i=>d[i]);
import { r as reactExports, j as jsxRuntimeExports, aL as BookOpen, c as clsx, aM as Network, aN as Keyboard, aO as __vitePreload, aP as BookMarked, aQ as Calculator, D as Shield, aR as HardDrive } from "./index-DwHrkWl2.js";
const CPMGuide = reactExports.lazy(() => __vitePreload(() => import("./CPMGuide-BUTDf30I.js"), true ? __vite__mapDeps([0,1,2]) : void 0));
const EVMHandbook = reactExports.lazy(() => __vitePreload(() => import("./EVMHandbook-D4NgYxQe.js"), true ? __vite__mapDeps([3,1,2]) : void 0));
const ABACMatrix = reactExports.lazy(() => __vitePreload(() => import("./ABACMatrix-D3lyxtju.js"), true ? __vite__mapDeps([4,1,2]) : void 0));
const AirGapGuide = reactExports.lazy(() => __vitePreload(() => import("./AirGapGuide-00mJRM0L.js"), true ? __vite__mapDeps([5,1,2]) : void 0));
const ArchitectureBlueprint = reactExports.lazy(() => __vitePreload(() => import("./ArchitectureBlueprint-5FxtdX54.js"), true ? __vite__mapDeps([6,1,2]) : void 0));
const KeyboardShortcuts = reactExports.lazy(() => __vitePreload(() => import("./KeyboardShortcuts-CJdpqBVW.js"), true ? __vite__mapDeps([7,1,2]) : void 0));
const LoadingFallback = () => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center h-64", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-text-ops-muted animate-pulse", children: "Loading documentation…" }) });
const guideMenuItems = [
  {
    id: "cpm",
    title: "CPM Scheduling Guide",
    description: "Early/Late calculations, Float absorption rules, DCMA 14-point compliance",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(BookMarked, { className: "w-4 h-4" })
  },
  {
    id: "evm",
    title: "EVM Handbook",
    description: "Formula reference cards for PV, EV, AC, CPI, SPI, EAC, VAC",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Calculator, { className: "w-4 h-4" })
  },
  {
    id: "abac",
    title: "ABAC & Caveat Matrix",
    description: "Classification markings and foreign disclosure interlocks",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Shield, { className: "w-4 h-4" })
  },
  {
    id: "airgap",
    title: "Air-Gap Procedures",
    description: "Data diode transfers and .defpack cryptographic verification",
    icon: /* @__PURE__ */ jsxRuntimeExports.jsx(HardDrive, { className: "w-4 h-4" })
  }
];
const HelpCenterView = () => {
  const [activeTab, setActiveTab] = reactExports.useState("guides");
  const [activeGuide, setActiveGuide] = reactExports.useState("cpm");
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col h-full bg-bg-ops-base", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3 px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-surface", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(BookOpen, { className: "w-5 h-5 text-text-ops-muted" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-semibold text-text-ops-primary", children: "Help Center & Documentation" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-auto text-xs text-text-ops-muted", children: "Offline-accessible reference" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 px-6 py-2 border-b border-border-ops-subtle bg-bg-ops-surface", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => setActiveTab("guides"),
          className: clsx(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
            activeTab === "guides" ? "bg-bg-ops-overlay text-text-ops-primary" : "text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay"
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(BookOpen, { className: "w-4 h-4" }),
            "Technical Guides"
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => setActiveTab("architecture"),
          className: clsx(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
            activeTab === "architecture" ? "bg-bg-ops-overlay text-text-ops-primary" : "text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay"
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Network, { className: "w-4 h-4" }),
            "Architecture Blueprint"
          ]
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => setActiveTab("shortcuts"),
          className: clsx(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
            activeTab === "shortcuts" ? "bg-bg-ops-overlay text-text-ops-primary" : "text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay"
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Keyboard, { className: "w-4 h-4" }),
            "Keyboard Shortcuts"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(reactExports.Suspense, { fallback: /* @__PURE__ */ jsxRuntimeExports.jsx(LoadingFallback, {}), children: [
      activeTab === "guides" && /* @__PURE__ */ jsxRuntimeExports.jsx(
        GuidesContent,
        {
          activeGuide,
          onGuideChange: setActiveGuide
        }
      ),
      activeTab === "architecture" && /* @__PURE__ */ jsxRuntimeExports.jsx(ArchitectureBlueprint, {}),
      activeTab === "shortcuts" && /* @__PURE__ */ jsxRuntimeExports.jsx(KeyboardShortcuts, {})
    ] }) })
  ] });
};
const GuidesContent = ({ activeGuide, onGuideChange }) => {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-64 flex-shrink-0 border-r border-border-ops-subtle bg-bg-ops-surface p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-semibold text-text-ops-muted uppercase tracking-wider mb-3", children: "Guide Sections" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("nav", { className: "space-y-1", role: "navigation", "aria-label": "Guide sections", children: guideMenuItems.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "button",
        {
          onClick: () => onGuideChange(item.id),
          className: clsx(
            "w-full flex items-start gap-3 px-3 py-2.5 rounded-md text-left transition-colors",
            activeGuide === item.id ? "bg-bg-ops-overlay text-text-ops-primary" : "text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay"
          ),
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-0.5 flex-shrink-0", children: item.icon }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-medium", children: item.title }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-text-ops-muted mt-0.5", children: item.description })
            ] })
          ]
        },
        item.id
      )) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-auto p-8", children: [
      activeGuide === "cpm" && /* @__PURE__ */ jsxRuntimeExports.jsx(CPMGuide, {}),
      activeGuide === "evm" && /* @__PURE__ */ jsxRuntimeExports.jsx(EVMHandbook, {}),
      activeGuide === "abac" && /* @__PURE__ */ jsxRuntimeExports.jsx(ABACMatrix, {}),
      activeGuide === "airgap" && /* @__PURE__ */ jsxRuntimeExports.jsx(AirGapGuide, {})
    ] })
  ] });
};
export {
  HelpCenterView as default
};
//# sourceMappingURL=HelpCenterView-B6m3InNR.js.map
