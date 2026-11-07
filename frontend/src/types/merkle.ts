/**
 * Merkle Sync Types
 *
 * TypeScript interfaces for the offline multi-site schedule reconciliation
 * wizard using cryptographic Merkle trees.
 *
 * These types mirror the backend Merkle sync schemas and support the
 * MerkleSyncView, MerkleManifestInspector, DeltaResolutionGrid, and
 * SyncAuditReview components.
 *
 * The Merkle sync workflow allows disconnected air-gapped sites (e.g.,
 * Site Warton, Site Hastings) to synchronize their schedule data without
 * full database exports, using SHA-256 hash trees to isolate only the
 * divergent records.
 */

// ---------------------------------------------------------------------------
// Backend API Response Types
// ---------------------------------------------------------------------------

/**
 * Response from GET /api/v1/merkle-sync/manifest.
 *
 * Contains the complete Merkle tree manifest for a programme sub-tree,
 * including the root hash for instant equality comparison with a remote
 * site's manifest.
 */
export interface MerkleManifestResponse {
  /** UUID of the root PortfolioNode this manifest covers */
  root_node_id: string;
  /** ltree path of the root node */
  root_path: string;
  /** Top-level Merkle root hash (SHA-256 hex digest) */
  root_hash: string;
  /** ISO-8601 timestamp when the manifest was generated */
  generated_at: string;
  /** Total number of UniversalBreakdownNode records */
  node_count: number;
  /** Total number of DependencyLink records */
  dependency_count: number;
  /** Total number of ResourceAssignment records */
  assignment_count: number;
  /** Full Merkle tree structure as a nested dictionary */
  tree: MerkleTreeNode;
  /** Identifier of the generating site (e.g., 'Warton') */
  site_id: string;
}

/**
 * A node in the Merkle tree structure.
 *
 * Can be either a branch (internal node with children) or a leaf
 * (representing a single data record).
 */
export interface MerkleTreeNode {
  /** ltree path prefix for this branch */
  path: string;
  /** SHA-256 hash digest computed from children's hashes */
  hash_digest: string;
  /** Child nodes (branches or leaves) */
  children: MerkleTreeNode[];
  /** Total number of leaves under this branch */
  leaf_count: number;
  /** Total number of all entities under this branch */
  entity_count: number;
  /** If present, this is a leaf node (not a branch) */
  entity_type?: 'node' | 'dependency' | 'assignment';
  /** Entity UUID (leaf nodes only) */
  entity_id?: string;
  /** Version ID of the entity (leaf nodes only) */
  version_id?: number;
  /** Additional metadata for debugging */
  metadata?: Record<string, unknown>;
}

/**
 * Response from POST /api/v1/merkle-sync/compare.
 *
 * Detailed divergence report identifying exactly which nodes,
 * dependencies, and assignments differ between two Merkle manifests.
 */
export interface MerkleComparisonResponse {
  /** True if root hashes match (instant sync, zero changes) */
  identical: boolean;
  /** ltree paths that differ between the two manifests */
  divergent_paths: string[];
  /** UUIDs of nodes that have changed */
  divergent_node_ids: string[];
  /** UUIDs of nodes present in the remote manifest but not locally */
  added_node_ids: string[];
  /** UUIDs of nodes present locally but not in the remote manifest */
  removed_node_ids: string[];
  /** UUIDs of nodes present in both but with different hashes */
  modified_node_ids: string[];
  /** UUIDs of dependency links that have changed */
  divergent_dependency_ids: string[];
  /** UUIDs of resource assignments that have changed */
  divergent_assignment_ids: string[];
}

/**
 * Response from POST /api/v1/merkle-sync/export-delta.
 *
 * Metadata about the exported .merklepack delta pack.
 */
export interface MerkleDeltaExportResponse {
  /** Number of nodes included in the delta pack */
  node_count: number;
  /** Number of dependency links included */
  dependency_count: number;
  /** Number of resource assignments included */
  assignment_count: number;
  /** Size of the .merklepack ZIP archive in bytes */
  pack_size_bytes: number;
  /** SHA-256 signature of the delta payload */
  signature: string;
}

/**
 * Response from POST /api/v1/merkle-sync/reconcile-delta.
 *
 * Result of ingesting a .merklepack bundle with three-way version tracking.
 */
export interface MerkleReconcileResponse {
  /** Overall status: 'SUCCESS', 'PARTIAL', 'CONFLICT', or 'ERROR' */
  status: string;
  /** Number of forward mutations successfully applied */
  applied_mutations: number;
  /** Number of conflicts staged into sandbox scenarios */
  staged_conflicts: number;
  /** UUIDs of sandbox scenarios created for conflict resolution */
  sandbox_scenario_ids: string[];
  /** Entities that were skipped due to version conflicts */
  skipped_entities: Record<string, unknown>[];
  /** Any errors encountered during ingestion */
  errors: string[];
}

// ---------------------------------------------------------------------------
// Frontend-only Types
// ---------------------------------------------------------------------------

/**
 * A divergent node entry for the three-way delta resolution grid.
 *
 * Combines local state, incoming remote state, and base common ancestor
 * for side-by-side comparison.
 */
export interface DivergentNodeEntry {
  /** Node UUID */
  node_id: string;
  /** WBS code (e.g., '1.2.3') */
  code: string;
  /** Node name */
  name: string;
  /** ltree path */
  path: string;
  /** Type of divergence: 'added', 'removed', or 'modified' */
  divergence_type: 'added' | 'removed' | 'modified';

  /** Local site state */
  local_version: number;
  local_last_modified_by: string;
  local_finish_date: string | null;
  local_start_date: string | null;
  local_percent_complete: number;

  /** Incoming remote site state */
  remote_version: number;
  remote_author: string;
  remote_finish_date: string | null;
  remote_start_date: string | null;
  remote_percent_complete: number;

  /** Base common ancestor (from baseline snapshot if available) */
  base_finish_date: string | null;
  base_start_date: string | null;
  base_version: number;

  /** Resolution choice for this node */
  resolution: 'accept_remote' | 'preserve_local' | 'fork_sandbox' | 'pending';
}

/**
 * A divergent dependency link entry.
 */
export interface DivergentDependencyEntry {
  /** Dependency link UUID */
  dependency_id: string;
  /** Predecessor node UUID */
  predecessor_id: string;
  /** Successor node UUID */
  successor_id: string;
  /** Dependency type (FS, SS, FF, SF) */
  dependency_type: string;
  /** Lag days */
  lag_days: number;
  /** Type of divergence */
  divergence_type: 'added' | 'removed' | 'modified';
  /** Resolution choice */
  resolution: 'accept_remote' | 'preserve_local' | 'pending';
}

/**
 * Synchronization step in the wizard workflow.
 */
export type SyncStep =
  | 'idle'
  | 'importing_manifest'
  | 'comparing'
  | 'reviewing_delta'
  | 'reconciling'
  | 'complete'
  | 'error';

/**
 * State of the Merkle sync wizard.
 */
export interface MerkleSyncState {
  /** Current step in the wizard workflow */
  step: SyncStep;
  /** Local site identifier */
  local_site_id: string;
  /** Remote site identifier (from imported manifest) */
  remote_site_id: string;
  /** Root node UUID for the programme being synced */
  root_node_id: string | null;
  /** Local Merkle manifest */
  local_manifest: MerkleManifestResponse | null;
  /** Remote Merkle manifest (imported) */
  remote_manifest: MerkleManifestResponse | null;
  /** Comparison result */
  comparison: MerkleComparisonResponse | null;
  /** Divergent node entries for the resolution grid */
  divergent_nodes: DivergentNodeEntry[];
  /** Divergent dependency entries */
  divergent_dependencies: DivergentDependencyEntry[];
  /** Reconciliation result */
  reconcile_result: MerkleReconcileResponse | null;
  /** Error message, if any */
  error: string | null;
  /** Progress percentage (0-100) */
  progress: number;
}

/**
 * Manifest comparison summary for the inspector view.
 */
export interface ComparisonSummary {
  /** Whether the two manifests are identical */
  identical: boolean;
  /** Total number of divergent paths */
  divergent_path_count: number;
  /** Number of added nodes */
  added_count: number;
  /** Number of removed nodes */
  removed_count: number;
  /** Number of modified nodes */
  modified_count: number;
  /** Number of divergent dependencies */
  divergent_dependency_count: number;
  /** Number of divergent assignments */
  divergent_assignment_count: number;
}

/**
 * Cryptographic import manifest for the audit review panel.
 */
export interface AuditManifest {
  /** SHA-256 signature of the delta pack */
  signature: string;
  /** Number of applied mutations */
  applied_mutations: number;
  /** Number of staged conflicts */
  staged_conflicts: number;
  /** Sandbox scenario IDs created */
  sandbox_scenario_ids: string[];
  /** Timestamp of the reconciliation */
  reconciled_at: string;
  /** User who performed the reconciliation */
  reconciled_by: string;
}
