/**
 * Presence avatar component for real-time collaboration indicators.
 *
 * This component renders small colored avatar rings around WBS nodes
 * that are currently being inspected or edited by colleagues.  It reads
 * the presence state from {@link usePresenceStore} and displays up to
 * 3 avatars per node, with a "+N" overflow indicator for additional
 * colleagues.
 *
 * Each avatar shows the first letter of the colleague's email address
 * in a colored circle.  The color is deterministically derived from
 * the user's ID so that the same user always gets the same color.
 *
 * Usage
 * ~~~~~
 *
 * ```tsx
 * // In a WBS row:
 * <PresenceAvatars nodeId={node.id} />
 *
 * // In a Gantt bar:
 * <PresenceAvatars nodeId={node.id} size={18} />
 * ```
 *
 * Visual Design
 * ~~~~~~~~~~~~~
 *
 * - Avatar size: 22px diameter (configurable via ``size`` prop).
 * - Border: 2px solid ``bg-ops-base`` to separate overlapping avatars.
 * - Offset: Each subsequent avatar overlaps the previous by 6px.
 * - Tooltip: Shows the colleague's email on hover.
 * - Overflow: When more than 3 colleagues are on a node, a "+N" badge
 *   is shown in a neutral grey circle.
 */

import React from 'react';
import { usePresenceStore, PresenceRecord } from '../../stores/usePresenceStore';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Deterministic color palette for avatars.
 *
 * These colors are chosen to be distinguishable against the dark ops
 * theme background.  The user's ID is hashed modulo the array length
 * to assign a consistent color.
 */
const AVATAR_COLORS = [
  '#38BDF8', // sky-400
  '#34D399', // emerald-400
  '#FBBF24', // amber-400
  '#F87171', // red-400
  '#C084FC', // purple-400
  '#FB923C', // orange-400
  '#2DD4BF', // teal-400
  '#F472B6', // pink-400
  '#818CF8', // indigo-400
  '#A78BFA', // violet-400
];

/** Maximum number of avatars shown before using overflow badge. */
const MAX_AVATARS = 3;

/** Default avatar diameter in pixels. */
const DEFAULT_SIZE = 22;

/** Overlap offset between consecutive avatars (negative = overlap). */
const AVATAR_OFFSET = -6;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get a deterministic color for a user based on their ID.
 *
 * @param userId - The user's database ID.
 * @returns A hex color string.
 */
function getUserColor(userId: number): string {
  return AVATAR_COLORS[userId % AVATAR_COLORS.length];
}

/**
 * Extract the first letter or initials from a user's email.
 *
 * @param upn - The user's principal name (email address).
 * @returns The first letter of the local part, uppercased.
 */
function getInitials(upn: string): string {
  const localPart = upn.split('@')[0];
  return localPart.charAt(0).toUpperCase();
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PresenceAvatarsProps {
  /** The UUID of the WBS node to show presence for. */
  nodeId: string;
  /** Diameter of each avatar in pixels (default: 22). */
  size?: number;
  /** Optional CSS class for the container. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders colored avatar rings for colleagues inspecting a node.
 *
 * Subscribes to {@link usePresenceStore.getPresenceForNode} to get the
 * list of colleagues currently focused on the given node.  Renders up
 * to {@link MAX_AVATARS} avatars with a "+N" overflow badge for the
 * remainder.
 *
 * @param props - Component props.
 */
const PresenceAvatars: React.FC<PresenceAvatarsProps> = ({
  nodeId,
  size = DEFAULT_SIZE,
  className = '',
}) => {
  const getPresenceForNode = usePresenceStore(
    (state) => state.getPresenceForNode,
  );

  const colleagues = getPresenceForNode(nodeId);

  // Don't render anything if no colleagues are on this node
  if (colleagues.length === 0) {
    return null;
  }

  const visibleColleagues = colleagues.slice(0, MAX_AVATARS);
  const overflowCount = colleagues.length - MAX_AVATARS;

  return (
    <div
      className={`flex items-center ${className}`}
      style={{ position: 'relative', minWidth: `${size}px` }}
    >
      {visibleColleagues.map((colleague, index) => (
        <PresenceAvatar
          key={colleague.user_id}
          colleague={colleague}
          size={size}
          offset={index * AVATAR_OFFSET}
        />
      ))}

      {overflowCount > 0 && (
        <OverflowBadge count={overflowCount} size={size} offset={MAX_AVATARS * AVATAR_OFFSET} />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface PresenceAvatarProps {
  colleague: PresenceRecord;
  size: number;
  offset: number;
}

/**
 * Single avatar circle for one colleague.
 *
 * @param props - Component props.
 */
const PresenceAvatar: React.FC<PresenceAvatarProps> = ({
  colleague,
  size,
  offset,
}) => {
  const color = getUserColor(colleague.user_id);
  const initials = getInitials(colleague.user_upn);
  const fontSize = Math.max(8, Math.floor(size * 0.4));

  return (
    <div
      title={`${colleague.user_upn}${colleague.active_pane ? ` (${colleague.active_pane})` : ''}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        backgroundColor: color,
        border: `2px solid #0F172A`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${fontSize}px`,
        fontWeight: 600,
        color: '#0F172A',
        position: 'relative',
        marginLeft: offset !== 0 ? `${AVATAR_OFFSET}px` : '0',
        zIndex: 10 - Math.abs(offset),
        cursor: 'default',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {initials}
    </div>
  );
};

interface OverflowBadgeProps {
  count: number;
  size: number;
  offset: number;
}

/**
 * "+N" overflow badge when more than MAX_AVATARS colleagues are present.
 *
 * @param props - Component props.
 */
const OverflowBadge: React.FC<OverflowBadgeProps> = ({
  count,
  size,
  offset,
}) => {
  const fontSize = Math.max(8, Math.floor(size * 0.45));

  return (
    <div
      title={`+${count} more colleague${count > 1 ? 's' : ''}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        backgroundColor: '#475569',
        border: `2px solid #0F172A`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${fontSize}px`,
        fontWeight: 600,
        color: '#94A3B8',
        position: 'relative',
        marginLeft: `${AVATAR_OFFSET}px`,
        zIndex: 1,
        cursor: 'default',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      +{count}
    </div>
  );
};

// ---------------------------------------------------------------------------
// PresenceIndicator: Connection status indicator
// ---------------------------------------------------------------------------

/**
 * Small indicator showing the WebSocket connection status.
 *
 * Renders a colored dot: green when connected, red when disconnected,
 * amber when reconnecting.
 */
interface PresenceIndicatorProps {
  /** Whether the WebSocket is connected. */
  isConnected: boolean;
  /** Number of reconnection attempts (0 if connected). */
  reconnectAttempts: number;
}

/**
 * Connection status indicator for the nav bar.
 *
 * @param props - Component props.
 */
export const PresenceIndicator: React.FC<PresenceIndicatorProps> = ({
  isConnected,
  reconnectAttempts,
}) => {
  let color = '#34D399'; // green-400 (connected)
  let tooltip = 'Real-time collaboration active';

  if (reconnectAttempts > 0 && !isConnected) {
    color = '#FBBF24'; // amber-400 (reconnecting)
    tooltip = `Reconnecting... (attempt ${reconnectAttempts})`;
  } else if (!isConnected) {
    color = '#F87171'; // red-400 (disconnected)
    tooltip = 'Real-time collaboration disconnected';
  }

  return (
    <div
      title={tooltip}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        cursor: 'default',
      }}
    >
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: color,
          boxShadow: `0 0 4px ${color}`,
        }}
      />
      <span
        style={{
          fontSize: '10px',
          color: '#94A3B8',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {isConnected ? 'Live' : reconnectAttempts > 0 ? 'Reconnecting' : 'Offline'}
      </span>
    </div>
  );
};

export default PresenceAvatars;
