/**
 * Help Center View
 *
 * The offline-accessible documentation viewer and interactive architecture
 * blueprint for the Eisenhower Portfolio Manager.
 *
 * This view provides three main sections accessible via tabbed navigation:
 *
 * 1. **Technical Guides** — Embedded Markdown-style guides explaining
 *    system capabilities without external dependencies:
 *    - CPM Scheduling Guide (Early/Late calculations, Float absorption, DCMA)
 *    - EVM Handbook (PV, EV, AC, CPI, SPI, EAC, VAC formulas)
 *    - ABAC & Caveat Matrix (classification markings, foreign disclosure)
 *    - Air-Gap Export/Import Procedures (.defpack transfers)
 *
 * 2. **Architecture Blueprint** — Interactive SVG data flow diagram showing
 *    system topology (React ↔ FastAPI ↔ PostgreSQL/ltree ↔ MinIO Vault).
 *    Clicking architectural nodes highlights corresponding database tables,
 *    services, and security boundaries.
 *
 * 3. **Keyboard Shortcuts** — Reference drawer listing all global hotkeys
 *    with descriptions and key bindings.
 *
 * All content is self-contained — no external CDN, font, or API dependencies.
 */

import React, { useState, lazy, Suspense } from 'react';
import {
  BookOpen,
  Network,
  Keyboard,
  ChevronRight,
  BookMarked,
  Calculator,
  Shield,
  HardDrive,
} from 'lucide-react';
import { clsx } from 'clsx';

// Lazy-loaded guide components
const CPMGuide = lazy(() => import('../components/help/CPMGuide'));
const EVMHandbook = lazy(() => import('../components/help/EVMHandbook'));
const ABACMatrix = lazy(() => import('../components/help/ABACMatrix'));
const AirGapGuide = lazy(() => import('../components/help/AirGapGuide'));
const ArchitectureBlueprint = lazy(() => import('../components/help/ArchitectureBlueprint'));
const KeyboardShortcuts = lazy(() => import('../components/help/KeyboardShortcuts'));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HelpTab = 'guides' | 'architecture' | 'shortcuts';
type GuideSection = 'cpm' | 'evm' | 'abac' | 'airgap';

interface GuideMenuItem {
  id: GuideSection;
  title: string;
  description: string;
  icon: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Loading Fallback
// ---------------------------------------------------------------------------

const LoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center h-64">
    <div className="text-text-ops-muted animate-pulse">Loading documentation…</div>
  </div>
);

// ---------------------------------------------------------------------------
// Guide Menu Items
// ---------------------------------------------------------------------------

const guideMenuItems: GuideMenuItem[] = [
  {
    id: 'cpm',
    title: 'CPM Scheduling Guide',
    description: 'Early/Late calculations, Float absorption rules, DCMA 14-point compliance',
    icon: <BookMarked className="w-4 h-4" />,
  },
  {
    id: 'evm',
    title: 'EVM Handbook',
    description: 'Formula reference cards for PV, EV, AC, CPI, SPI, EAC, VAC',
    icon: <Calculator className="w-4 h-4" />,
  },
  {
    id: 'abac',
    title: 'ABAC & Caveat Matrix',
    description: 'Classification markings and foreign disclosure interlocks',
    icon: <Shield className="w-4 h-4" />,
  },
  {
    id: 'airgap',
    title: 'Air-Gap Procedures',
    description: 'Data diode transfers and .defpack cryptographic verification',
    icon: <HardDrive className="w-4 h-4" />,
  },
];

// ---------------------------------------------------------------------------
// Help Center View
// ---------------------------------------------------------------------------

/**
 * Main Help Center view component.
 *
 * Renders a tabbed interface with three top-level tabs:
 * Technical Guides, Architecture Blueprint, and Keyboard Shortcuts.
 */
const HelpCenterView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<HelpTab>('guides');
  const [activeGuide, setActiveGuide] = useState<GuideSection>('cpm');

  return (
    <div className="flex flex-col h-full bg-bg-ops-base">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-surface">
        <BookOpen className="w-5 h-5 text-text-ops-muted" />
        <h1 className="text-lg font-semibold text-text-ops-primary">Help Center & Documentation</h1>
        <span className="ml-auto text-xs text-text-ops-muted">Offline-accessible reference</span>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 px-6 py-2 border-b border-border-ops-subtle bg-bg-ops-surface">
        <button
          onClick={() => setActiveTab('guides')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
            activeTab === 'guides'
              ? 'bg-bg-ops-overlay text-text-ops-primary'
              : 'text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay'
          )}
        >
          <BookOpen className="w-4 h-4" />
          Technical Guides
        </button>
        <button
          onClick={() => setActiveTab('architecture')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
            activeTab === 'architecture'
              ? 'bg-bg-ops-overlay text-text-ops-primary'
              : 'text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay'
          )}
        >
          <Network className="w-4 h-4" />
          Architecture Blueprint
        </button>
        <button
          onClick={() => setActiveTab('shortcuts')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
            activeTab === 'shortcuts'
              ? 'bg-bg-ops-overlay text-text-ops-primary'
              : 'text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay'
          )}
        >
          <Keyboard className="w-4 h-4" />
          Keyboard Shortcuts
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto">
        <Suspense fallback={<LoadingFallback />}>
          {activeTab === 'guides' && (
            <GuidesContent
              activeGuide={activeGuide}
              onGuideChange={setActiveGuide}
            />
          )}
          {activeTab === 'architecture' && <ArchitectureBlueprint />}
          {activeTab === 'shortcuts' && <KeyboardShortcuts />}
        </Suspense>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Guides Content (Sidebar + Guide Panel)
// ---------------------------------------------------------------------------

interface GuidesContentProps {
  activeGuide: GuideSection;
  onGuideChange: (guide: GuideSection) => void;
}

/**
 * Guides content area with sidebar navigation and guide panel.
 */
const GuidesContent: React.FC<GuidesContentProps> = ({ activeGuide, onGuideChange }) => {
  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-border-ops-subtle bg-bg-ops-surface p-4">
        <h2 className="text-sm font-semibold text-text-ops-muted uppercase tracking-wider mb-3">
          Guide Sections
        </h2>
        <nav className="space-y-1" role="navigation" aria-label="Guide sections">
          {guideMenuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onGuideChange(item.id)}
              className={clsx(
                'w-full flex items-start gap-3 px-3 py-2.5 rounded-md text-left transition-colors',
                activeGuide === item.id
                  ? 'bg-bg-ops-overlay text-text-ops-primary'
                  : 'text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay'
              )}
            >
              <span className="mt-0.5 flex-shrink-0">{item.icon}</span>
              <div>
                <div className="text-sm font-medium">{item.title}</div>
                <div className="text-xs text-text-ops-muted mt-0.5">{item.description}</div>
              </div>
            </button>
          ))}
        </nav>
      </div>

      {/* Guide Panel */}
      <div className="flex-1 overflow-auto p-8">
        {activeGuide === 'cpm' && <CPMGuide />}
        {activeGuide === 'evm' && <EVMHandbook />}
        {activeGuide === 'abac' && <ABACMatrix />}
        {activeGuide === 'airgap' && <AirGapGuide />}
      </div>
    </div>
  );
};

export default HelpCenterView;
