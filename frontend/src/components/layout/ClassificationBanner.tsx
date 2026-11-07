/**
 * ClassificationBanner Component
 *
 * Renders the sovereign classification banner across the top and bottom
 * of the viewport. This is a mandatory security requirement for classified
 * defence systems: every screen must display the current classification
 * level and active caveats at all times.
 *
 * The banner shows:
 * - Classification rank badge (OFFICIAL, SECRET, TOP SECRET, etc.)
 * - Active caveats array (e.g., ['UK EYES ONLY'])
 * - Color-coded border and background that interlock with the classification level
 *
 * Usage
 * -----
 * Placed at the very top of AppShell.tsx, the banner is always visible
 * and cannot be dismissed. A matching bottom banner is rendered via
 * the `BottomBanner` sub-component.
 */

import React from 'react';
import { Shield, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SecurityClassification =
  | 'OFFICIAL'
  | 'OFFICIAL_SENSITIVE'
  | 'SECRET'
  | 'TOP_SECRET';

interface ClassificationBannerProps {
  /** Current classification level of the active view */
  classification?: SecurityClassification;
  /** Active handling caveats (e.g., ['UK_EYES_ONLY', 'NOFORN']) */
  caveats?: string[];
  /** Render position: 'top' or 'bottom' */
  position?: 'top' | 'bottom';
}

// ---------------------------------------------------------------------------
// Classification Style Map
// ---------------------------------------------------------------------------

const classificationStyles: Record<SecurityClassification, {
  bg: string;
  border: string;
  text: string;
  badgeBg: string;
  badgeText: string;
  label: string;
}> = {
  OFFICIAL: {
    bg: 'bg-sky-950',
    border: 'border-sky-500',
    text: 'text-sky-300',
    badgeBg: 'bg-sky-600',
    badgeText: 'text-sky-100',
    label: 'OFFICIAL',
  },
  OFFICIAL_SENSITIVE: {
    bg: 'bg-cyan-950',
    border: 'border-cyan-500',
    text: 'text-cyan-300',
    badgeBg: 'bg-cyan-600',
    badgeText: 'text-cyan-100',
    label: 'OFFICIAL-SENSITIVE',
  },
  SECRET: {
    bg: 'bg-red-950',
    border: 'border-red-500',
    text: 'text-red-300',
    badgeBg: 'bg-red-600',
    badgeText: 'text-red-100',
    label: 'SECRET',
  },
  TOP_SECRET: {
    bg: 'bg-purple-950',
    border: 'border-purple-500',
    text: 'text-purple-300',
    badgeBg: 'bg-purple-600',
    badgeText: 'text-purple-100',
    label: 'TOP SECRET',
  },
};

// ---------------------------------------------------------------------------
// Caveat Formatting
// ---------------------------------------------------------------------------

/**
 * Convert caveat codes to human-readable labels.
 * e.g., 'UK_EYES_ONLY' → 'UK EYES ONLY'
 */
function formatCaveat(caveat: string): string {
  return caveat
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/**
 * Top classification banner — spans the full viewport width at the top.
 */
const TopBanner: React.FC<ClassificationBannerProps> = ({
  classification = 'OFFICIAL',
  caveats = [],
}) => {
  const style = classificationStyles[classification];

  return (
    <div
      className={clsx(
        'w-full flex items-center justify-center gap-3 px-4 py-1 border-b font-mono text-xs tracking-wider',
        style.bg,
        style.border,
        style.text,
      )}
      role="banner"
      aria-label={`Classification: ${style.label}`}
    >
      <Shield className="w-3.5 h-3.5" />
      <span
        className={clsx(
          'px-2 py-0.5 rounded font-bold uppercase',
          style.badgeBg,
          style.badgeText,
        )}
      >
        {style.label}
      </span>
      {caveats.length > 0 && (
        <>
          <span className="opacity-50">|</span>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3 h-3 opacity-70" />
            {caveats.map((caveat) => (
              <span key={caveat} className="font-semibold">
                {formatCaveat(caveat)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

/**
 * Bottom classification banner — mirrors the top banner at the viewport bottom.
 */
const BottomBanner: React.FC<ClassificationBannerProps> = ({
  classification = 'OFFICIAL',
  caveats = [],
}) => {
  const style = classificationStyles[classification];

  return (
    <div
      className={clsx(
        'w-full flex items-center justify-center gap-3 px-4 py-1 border-t font-mono text-xs tracking-wider',
        style.bg,
        style.border,
        style.text,
      )}
      role="contentinfo"
      aria-label={`Classification: ${style.label}`}
    >
      <Shield className="w-3.5 h-3.5" />
      <span
        className={clsx(
          'px-2 py-0.5 rounded font-bold uppercase',
          style.badgeBg,
          style.badgeText,
        )}
      >
        {style.label}
      </span>
      {caveats.length > 0 && (
        <>
          <span className="opacity-50">|</span>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3 h-3 opacity-70" />
            {caveats.map((caveat) => (
              <span key={caveat} className="font-semibold">
                {formatCaveat(caveat)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * ClassificationBanner — renders both top and bottom banners.
 *
 * @example
 * ```tsx
 * <ClassificationBanner classification="SECRET" caveats={['UK_EYES_ONLY']} />
 * ```
 */
const ClassificationBanner: React.FC<ClassificationBannerProps> = (props) => {
  return (
    <>
      <TopBanner {...props} position="top" />
      <BottomBanner {...props} position="bottom" />
    </>
  );
};

export default ClassificationBanner;
export { TopBanner, BottomBanner };
