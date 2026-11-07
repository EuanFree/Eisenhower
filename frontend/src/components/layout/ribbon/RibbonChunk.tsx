/**
 * RibbonChunk Component
 *
 * A single action chunk container within the ribbon action deck.
 *
 * Features
 * --------
 * - Height: 92px (matches the action deck).
 * - Right-hand vertical hairline divider: border-r border-ops-strong/70.
 * - Chunk Body: Flex row containing action buttons.
 * - Chunk Label: Subtle centered uppercase caption at the bottom
 *   (e.g., STRUCTURE, SCHEDULE, PROGRESS, BASELINE).
 *   Font size: 9px, color: text-slate-500 font-mono tracking-wider.
 *
 * Usage
 * -----
 *
 * ```tsx
 * <RibbonChunk caption="STRUCTURE">
 *   <RibbonLargeButton icon="Play" label="Run CPM" onClick={...} />
 *   <RibbonSmallButton icon="Link" label="Link" onClick={...} />
 * </RibbonChunk>
 * ```
 */

import React from 'react';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RibbonChunkProps {
  /** Caption displayed at the bottom of the chunk */
  caption: string;
  /** Child action buttons */
  children: React.ReactNode;
  /** Whether to show the right-hand divider */
  showDivider?: boolean;
  /** Additional CSS class */
  className?: string;
}

// ---------------------------------------------------------------------------
// RibbonChunk
// ---------------------------------------------------------------------------

/**
 * Renders a single action chunk with body and caption.
 */
export const RibbonChunk: React.FC<RibbonChunkProps> = ({
  caption,
  children,
  showDivider = true,
  className,
}) => {
  return (
    <div
      className={clsx(
        'flex flex-col justify-between px-2 py-1',
        'h-[92px]',
        showDivider && 'border-r border-ops-strong/70 pr-2 mr-2',
        className,
      )}
    >
      {/* Chunk Body: Action buttons */}
      <div className="flex items-center gap-1 flex-wrap overflow-hidden">
        {children}
      </div>

      {/* Chunk Label: Centered uppercase caption */}
      <span className="text-[9px] text-slate-500 font-mono tracking-wider text-center mt-auto pt-1">
        {caption}
      </span>
    </div>
  );
};
