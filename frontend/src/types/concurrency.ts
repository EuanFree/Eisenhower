/**
 * Concurrency Control Types
 *
 * TypeScript interfaces for the optimistic concurrency control system.
 * When two users edit the same entity simultaneously, the server returns
 * HTTP 409 with a structured conflict payload.  These types describe
 * that payload and the resolution actions available to the user.
 */

/**
 * Payload returned by the server on HTTP 409 Conflict.
 *
 * The frontend uses this data to display the ConflictResolutionModal
 * with a side-by-side diff of the user's edits vs. the server state.
 */
export interface ConcurrencyConflict {
  /** Always "CONCURRENT_MODIFICATION_CONFLICT" */
  error_code: string;

  /** UUID of the entity that was concurrently modified */
  entity_id: string;

  /** The version_id the client expected (from its local copy) */
  expected_version: number | null;

  /** The version_id currently stored in the database */
  current_database_version: number | null;

  /** User principal name of the user who made the conflicting change */
  conflicting_user_upn: string;

  /** Snapshot of the current database state for the entity */
  current_state: Record<string, unknown>;

  /** Human-readable conflict message */
  message: string;
}

/**
 * Resolution strategy chosen by the user in the conflict dialog.
 */
export type ConflictResolution =
  | 'OVERWRITE'    // Force-take: re-submit using the latest version_id
  | 'DISCARD'      // Discard local edits and reload from server
  | 'FORK';        // Keep both: create a parallel branch/sub-task

/**
 * State of an active conflict resolution dialog.
 */
export interface ConflictState {
  /** Whether the conflict modal is currently visible */
  isOpen: boolean;

  /** The conflict payload from the server */
  conflict: ConcurrencyConflict | null;

  /** The user's local (unsaved) edits that caused the conflict */
  localEdits: Record<string, unknown> | null;

  /** The server's current state of the entity */
  serverState: Record<string, unknown> | null;
}
