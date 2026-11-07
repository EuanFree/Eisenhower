/**
 * Lease State Management Hook
 *
 * Manages sub-tree check-out leases for CAM (Contract Administration Manager)
 * drafting sessions. When a user checks out a sub-tree, no other user can
 * modify nodes within that scope until the lease is released or expires.
 *
 * Features:
 * - Check out a sub-tree for exclusive editing
 * - Heartbeat renewal to keep the lease alive
 * - Check in and publish changes
 * - Force-break abandoned leases (admin only)
 * - Track active leases per node path
 * - Auto-refresh lease status
 *
 * Usage:
 * ```tsx
 * const leaseState = useLeaseState();
 *
 * // Check out a sub-tree
 * const handleCheckout = async () => {
 *   await leaseState.checkOut(nodeId, 'Drafting Month 11 Progress');
 * };
 *
 * // Check in and publish
 * const handleCheckIn = async () => {
 *   await leaseState.checkIn();
 * };
 *
 * // Check if a node is locked by another user
 * const isLocked = leaseState.isNodeLocked(nodeId);
 * const leaseHolder = leaseState.getLeaseHolder(nodeId);
 * ```
 */

import { useState, useCallback, useEffect } from 'react';
import api from '../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Lease information returned by the API.
 */
export interface LeaseInfo {
  id: string;
  root_node_id: string;
  ltree_scope_path: string;
  leased_by_user_id: string;
  leased_by_user_upn: string;
  lease_token: string;
  leased_at: string;
  expires_at: string;
  check_out_note: string | null;
  is_active: boolean;
}

/**
 * Check-out request payload.
 */
export interface CheckOutRequest {
  check_out_note?: string;
}

/**
 * Lease state for the hook.
 */
export interface LeaseState {
  /** Currently active lease held by the current user */
  activeLease: LeaseInfo | null;
  /** Map of node path → lease info for all active leases */
  activeLeases: Map<string, LeaseInfo>;
  /** Whether a lease operation is in progress */
  isLoading: boolean;
  /** Error message if a lease operation failed */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Custom hook for managing sub-tree check-out leases.
 *
 * @returns Lease state and action functions
 */
export function useLeaseState() {
  const [state, setState] = useState<LeaseState>({
    activeLease: null,
    activeLeases: new Map(),
    isLoading: false,
    error: null,
  });

  /**
   * Check out a sub-tree for exclusive editing.
   *
   * @param nodeId - The root node ID to check out
   * @param note - Optional check-out note
   */
  const checkOut = useCallback(async (nodeId: string, note?: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await api.post(
        `/api/v1/leases/checkout/${nodeId}`,
        { check_out_note: note || null },
      );

      const lease: LeaseInfo = response.data;

      setState((prev) => {
        const newLeases = new Map(prev.activeLeases);
        newLeases.set(lease.ltree_scope_path, lease);

        return {
          activeLease: lease,
          activeLeases: newLeases,
          isLoading: false,
          error: null,
        };
      });

      return lease;
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Failed to check out sub-tree';
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      throw err;
    }
  }, []);

  /**
   * Extend an active lease by 60 minutes.
   */
  const heartbeat = useCallback(async () => {
    if (!state.activeLease?.lease_token) return;

    try {
      await api.post(`/api/v1/leases/heartbeat/${state.activeLease.lease_token}`);

      setState((prev) => {
        if (!prev.activeLease) return prev;

        const updatedLease = {
          ...prev.activeLease,
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        };

        const newLeases = new Map(prev.activeLeases);
        newLeases.set(updatedLease.ltree_scope_path, updatedLease);

        return {
          ...prev,
          activeLease: updatedLease,
          activeLeases: newLeases,
        };
      });
    } catch (err) {
      console.error('Heartbeat failed:', err);
    }
  }, [state.activeLease]);

  /**
   * Check in and publish changes, releasing the lease.
   */
  const checkIn = useCallback(async () => {
    if (!state.activeLease?.lease_token) return;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      await api.post(`/api/v1/leases/checkin/${state.activeLease.lease_token}`);

      setState((prev) => {
        const newLeases = new Map(prev.activeLeases);
        newLeases.delete(prev.activeLease!.ltree_scope_path);

        return {
          activeLease: null,
          activeLeases: newLeases,
          isLoading: false,
          error: null,
        };
      });
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Failed to check in changes';
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      throw err;
    }
  }, [state.activeLease]);

  /**
   * Force-break an abandoned lease (admin only).
   *
   * @param leaseToken - The lease token to break
   */
  const forceBreak = useCallback(async (leaseToken: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      await api.post(`/api/v1/leases/force-break/${leaseToken}`);

      setState((prev) => {
        const lease = prev.activeLeases.get(leaseToken);
        const newLeases = new Map(prev.activeLeases);
        if (lease) {
          newLeases.delete(lease.ltree_scope_path);
        }

        return {
          activeLease: prev.activeLease?.lease_token === leaseToken ? null : prev.activeLease,
          activeLeases: newLeases,
          isLoading: false,
          error: null,
        };
      });
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Failed to break lease';
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      throw err;
    }
  }, []);

  /**
   * Check if a node is locked by another user's lease.
   *
   * A node is locked if its ltree path falls within an active lease scope.
   *
   * @param nodePath - The ltree path of the node (e.g., 'prog_a.proj_1.wp_04')
   * @returns True if the node is locked by another user
   */
  const isNodeLocked = useCallback(
    (nodePath: string): boolean => {
      for (const [scopePath, lease] of state.activeLeases) {
        // Node is locked if its path starts with the lease scope path
        if (nodePath.startsWith(scopePath) && lease.is_active) {
          return true;
        }
      }
      return false;
    },
    [state.activeLeases],
  );

  /**
   * Get the lease holder information for a node.
   *
   * @param nodePath - The ltree path of the node
   * @returns Lease info if locked, null otherwise
   */
  const getLeaseHolder = useCallback(
    (nodePath: string): LeaseInfo | null => {
      for (const [scopePath, lease] of state.activeLeases) {
        if (nodePath.startsWith(scopePath) && lease.is_active) {
          return lease;
        }
      }
      return null;
    },
    [state.activeLeases],
  );

  /**
   * Fetch lease details by token.
   *
   * @param leaseToken - The lease token to fetch
   */
  const fetchLease = useCallback(async (leaseToken: string) => {
    try {
      const response = await api.get(`/api/v1/leases/${leaseToken}`);
      return response.data as LeaseInfo;
    } catch (err) {
      console.error('Failed to fetch lease:', err);
      return null;
    }
  }, []);

  /**
   * Clear error state.
   */
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  // Auto-heartbeat: extend lease every 10 minutes if active
  useEffect(() => {
    if (!state.activeLease) return;

    const interval = setInterval(() => {
      heartbeat();
    }, 10 * 60 * 1000); // 10 minutes

    return () => clearInterval(interval);
  }, [state.activeLease, heartbeat]);

  return {
    ...state,
    checkOut,
    checkIn,
    heartbeat,
    forceBreak,
    fetchLease,
    isNodeLocked,
    getLeaseHolder,
    clearError,
  };
}
