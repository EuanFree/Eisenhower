/**
 * Keyboard Shortcuts Reference
 *
 * Modal listing all global keyboard shortcuts available in the
 * Eisenhower Portfolio Manager.
 *
 * Covers:
 *
 * - Display calibration & roaming settings
 * - Undo/Redo (200+ step history)
 * - Global omni-search / command palette
 * - Modal dismissal
 * - Navigation shortcuts
 *
 * All content is self-contained — no external dependencies.
 */

import React from 'react';
import {
  Keyboard,
  Settings,
  Undo2,
  Redo2,
  Search,
  X,
  LayoutGrid,
  ChevronRight,
  ChevronLeft,
  Maximize2,
  Minimize2,
  Printer,
} from 'lucide-react';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShortcutCategory {
  title: string;
  shortcuts: Shortcut[];
}

interface Shortcut {
  keys: string[];
  description: string;
  icon: React.ReactNode;
  available?: boolean;
}

// ---------------------------------------------------------------------------
// Shortcut Definitions
// ---------------------------------------------------------------------------

const categories: ShortcutCategory[] = [
  {
    title: 'Display & Settings',
    shortcuts: [
      {
        keys: ['Ctrl', 'Shift', 'D'],
        description: 'Open Display Calibration & Roaming Settings modal',
        icon: <Settings className="w-4 h-4" />,
      },
    ],
  },
  {
    title: 'Undo / Redo',
    shortcuts: [
      {
        keys: ['Ctrl', 'Z'],
        description: 'Undo last action (200+ step history)',
        icon: <Undo2 className="w-4 h-4" />,
      },
      {
        keys: ['Ctrl', 'Y'],
        description: 'Redo last undone action',
        icon: <Redo2 className="w-4 h-4" />,
      },
    ],
  },
  {
    title: 'Search & Navigation',
    shortcuts: [
      {
        keys: ['Ctrl', 'K'],
        description: 'Open Global Omni-Search / Command Palette',
        icon: <Search className="w-4 h-4" />,
        available: false,
      },
      {
        keys: ['Esc'],
        description: 'Dismiss active hover inspection modals and slide-out drawers',
        icon: <X className="w-4 h-4" />,
      },
    ],
  },
  {
    title: 'Gantt Chart',
    shortcuts: [
      {
        keys: ['←'],
        description: 'Scroll timeline left (when Gantt is focused)',
        icon: <ChevronLeft className="w-4 h-4" />,
      },
      {
        keys: ['→'],
        description: 'Scroll timeline right (when Gantt is focused)',
        icon: <ChevronRight className="w-4 h-4" />,
      },
      {
        keys: ['+'],
        description: 'Zoom in timeline (Days → Weeks → Months)',
        icon: <Maximize2 className="w-4 h-4" />,
      },
      {
        keys: ['-'],
        description: 'Zoom out timeline',
        icon: <Minimize2 className="w-4 h-4" />,
      },
    ],
  },
  {
    title: 'WBS Grid',
    shortcuts: [
      {
        keys: ['Enter'],
        description: 'Expand/collapse selected node (when WBS is focused)',
        icon: <LayoutGrid className="w-4 h-4" />,
      },
      {
        keys: ['↑'],
        description: 'Move selection up one row',
        icon: <ChevronLeft className="w-4 h-4" />,
      },
      {
        keys: ['↓'],
        description: 'Move selection down one row',
        icon: <ChevronRight className="w-4 h-4" />,
      },
    ],
  },
  {
    title: 'Printing',
    shortcuts: [
      {
        keys: ['Ctrl', 'P'],
        description: 'Print current view (browser print dialog)',
        icon: <Printer className="w-4 h-4" />,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Key Badge Component
// ---------------------------------------------------------------------------

interface KeyBadgeProps {
  key: string;
}

const KeyBadge: React.FC<KeyBadgeProps> = ({ key: keyText }) => {
  const isModifier = ['Ctrl', 'Shift', 'Alt', 'Cmd'].includes(keyText);

  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center font-mono text-xs rounded border border-border-ops-subtle bg-bg-ops-base',
        isModifier ? 'px-2 py-1 min-w-[36px]' : 'px-1.5 py-1 min-w-[24px]'
      )}
    >
      {keyText}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Keyboard Shortcuts Component
// ---------------------------------------------------------------------------

/**
 * Keyboard Shortcuts Reference component.
 *
 * Renders a modal listing all global hotkeys with descriptions and key bindings.
 */
const KeyboardShortcuts: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8 pb-6 border-b border-border-ops-subtle">
        <h1 className="text-2xl font-bold text-text-ops-primary mb-2">
          Keyboard Shortcuts
        </h1>
        <p className="text-text-ops-muted">
          Reference guide for all global keyboard shortcuts available in the
          Eisenhower Portfolio Manager.
        </p>
      </div>

      {/* Categories */}
      <div className="space-y-8">
        {categories.map((category) => (
          <div key={category.title}>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-ops-muted mb-3">
              {category.title}
            </h2>
            <div className="bg-bg-ops-surface border border-border-ops-subtle rounded-lg divide-y divide-border-ops-subtle">
              {category.shortcuts.map((shortcut, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-text-ops-muted">
                      {shortcut.icon}
                    </div>
                    <span className="text-sm text-text-ops-primary">
                      {shortcut.description}
                    </span>
                    {!shortcut.available && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        Coming Soon
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((key, j) => (
                      <React.Fragment key={j}>
                        <KeyBadge key={key} />
                        {j < shortcut.keys.length - 1 && (
                          <span className="text-text-ops-muted mx-0.5">+</span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Notes */}
      <div className="mt-10 p-4 bg-bg-ops-surface border border-border-ops-subtle rounded-lg">
        <h3 className="text-sm font-semibold text-text-ops-primary mb-2">
          Notes
        </h3>
        <ul className="text-sm text-text-ops-muted space-y-1">
          <li>
            • <strong>Ctrl+Shift+D</strong> toggles the Display Calibration modal,
            allowing you to adjust density, scale factor, theme, and color accessibility
            settings in real time.
          </li>
          <li>
            • <strong>Ctrl+Z / Ctrl+Y</strong> provides 200+ step undo/redo history,
            aligned with backend database transactional rollback and forensic audit logging.
          </li>
          <li>
            • <strong>Ctrl+K</strong> will open the Global Omni-Search / Command Palette
            for quick navigation to any task, resource, or location.
          </li>
          <li>
            • <strong>Esc</strong> dismisses all active hover inspection modals,
            slide-out drawers, and context menus.
          </li>
          <li>
            • Arrow keys in the Gantt chart scroll the timeline horizontally;
            in the WBS grid, they move the row selection up and down.
          </li>
        </ul>
      </div>
    </div>
  );
};

export default KeyboardShortcuts;
