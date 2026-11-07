/**
 * Drag Breach Warning HUD
 *
 * Floating cursor HUD that appears when a contractual breach is detected
 * during an active Gantt bar drag operation.
 *
 * Visual Design:
 * - High-contrast dark background with red border (#EF4444).
 * - AlertTriangle warning glyph in red.
 * - Bold text describing the breach:
 *   'CRITICAL SLIP: Breaches Contract Milestone [M4 - System Delivery]
 *    by +3 working days (Total Float: -3d)'.
 * - Positioned near the cursor with viewport boundary clamping.
 *
 * The HUD mounts only when hasCriticalBreach is true and unmounts
 * automatically when the drag ends.
 */

import React, { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ContractualBreach } from '../../hooks/useGanttDragCascade';

export interface DragBreachWarningHUDProps {
  /** List of contractual breaches detected during drag */
  breaches: ContractualBreach[];
  /** Current mouse cursor X position (viewport coordinates) */
  cursorX: number;
  /** Current mouse cursor Y position (viewport coordinates) */
  cursorY: number;
}

const HUD_WIDTH = 320;
const HUD_HEIGHT = 80;
const HUD_PADDING = 12;
const BREACH_BORDER_COLOR = '#EF4444';
const BREACH_BG_COLOR = 'rgba(30, 41, 59, 0.95)';
const BREACH_TEXT_COLOR = '#F8FAFC';
const BREACH_SUBTEXT_COLOR = '#94A3B8';

/**
 * Breach Warning HUD Component
 *
 * Renders a floating panel near the cursor showing the most critical
 * breach detected during the drag cascade.  If multiple breaches exist,
 * the first BASELINE_B0 or CDRL_DUE_DATE breach is shown, falling back
 * to the first NEGATIVE_FLOAT breach.
 */
const DragBreachWarningHUD: React.FC<DragBreachWarningHUDProps> = ({
  breaches,
  cursorX,
  cursorY,
}) => {
  // Select the most critical breach to display
  const primaryBreach = useMemo(() => {
    if (breaches.length === 0) return null;

    // Priority: BASELINE_B0 > CDRL_DUE_DATE > NEGATIVE_FLOAT
    const baselineBreach = breaches.find((b) => b.breachType === 'BASELINE_B0');
    if (baselineBreach) return baselineBreach;

    const cdrlBreach = breaches.find((b) => b.breachType === 'CDRL_DUE_DATE');
    if (cdrlBreach) return cdrlBreach;

    return breaches[0];
  }, [breaches]);

  if (!primaryBreach) return null;

  // Compute HUD position with viewport boundary clamping
  const position = useMemo(() => {
    const margin = 16;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = cursorX + margin;
    let y = cursorY + margin;

    // Clamp right edge
    if (x + HUD_WIDTH > viewportWidth - margin) {
      x = cursorX - HUD_WIDTH - margin;
    }

    // Clamp bottom edge
    if (y + HUD_HEIGHT > viewportHeight - margin) {
      y = cursorY - HUD_HEIGHT - margin;
    }

    // Ensure not off-screen on left/top
    x = Math.max(margin, x);
    y = Math.max(margin, y);

    return { x, y };
  }, [cursorX, cursorY]);

  // Format breach message
  const message = useMemo(() => {
    const { nodeCode, nodeName, breachType, slipDays, totalFloat, milestoneDescription } = primaryBreach;

    let prefix = '';
    switch (breachType) {
      case 'BASELINE_B0':
        prefix = 'Contract Baseline B₀';
        break;
      case 'CDRL_DUE_DATE':
        prefix = 'CDRL Deliverable';
        break;
      case 'NEGATIVE_FLOAT':
        prefix = 'Negative Float';
        break;
    }

    const slipText = slipDays > 0 ? `+${slipDays} working days` : `${slipDays} days`;
    const floatText = totalFloat < 0 ? `Total Float: ${totalFloat}d` : `Total Float: ${totalFloat}d`;

    return {
      title: `CRITICAL SLIP: ${prefix}`,
      milestone: milestoneDescription,
      slip: slipText,
      float: floatText,
      nodeCode,
      nodeName,
    };
  }, [primaryBreach]);

  // Count total breaches
  const breachCount = breaches.length;
  const additionalBreaches = breachCount > 1 ? ` (+${breachCount - 1} more)` : '';

  return (
    <div
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${HUD_WIDTH}px`,
        minWidth: `${HUD_WIDTH}px`,
        backgroundColor: BREACH_BG_COLOR,
        border: `1px solid ${BREACH_BORDER_COLOR}`,
        borderRadius: '6px',
        padding: `${HUD_PADDING}px`,
        zIndex: 9998,
        pointerEvents: 'none',
        boxShadow: '0 4px 24px rgba(239, 68, 68, 0.3)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <AlertTriangle
          size={18}
          color={BREACH_BORDER_COLOR}
          style={{ flexShrink: 0, marginTop: '2px' }}
        />
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 'bold',
              color: BREACH_BORDER_COLOR,
              fontFamily: 'var(--font-sans, Inter, system-ui, sans-serif)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '4px',
            }}
          >
            {message.title}{additionalBreaches}
          </div>
          <div
            style={{
              fontSize: '12px',
              color: BREACH_TEXT_COLOR,
              fontFamily: 'var(--font-sans, Inter, system-ui, sans-serif)',
              lineHeight: '1.4',
            }}
          >
            Breaches <span style={{ fontWeight: 'bold' }}>{message.milestone}</span> by{' '}
            <span style={{ color: BREACH_BORDER_COLOR, fontWeight: 'bold' }}>{message.slip}</span>
          </div>
          <div
            style={{
              fontSize: '10px',
              color: BREACH_SUBTEXT_COLOR,
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              marginTop: '4px',
            }}
          >
            {message.nodeCode} — {message.nodeName} | {message.float}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DragBreachWarningHUD;
