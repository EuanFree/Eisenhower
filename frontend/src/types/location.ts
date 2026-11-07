/**
 * Location Explorer and Artifact Vault Type Definitions
 *
 * TypeScript interfaces mirroring the backend spatial location tracking,
 * asset custody, and classified document vault schemas.
 *
 * These types are used by the LocationExplorerView and ArtifactVaultDrawer
 * to type-safe the API responses, upload workflows, and location tree data.
 */

// ---------------------------------------------------------------------------
// Location Breakdown Structure (LBS) Types
// ---------------------------------------------------------------------------

/** Tier in the location hierarchy */
export type LocationTier =
  | 'SITE'
  | 'FACILITY'
  | 'ZONE'
  | 'ROOM'
  | 'CONTAINER'
  | 'SUB_CONTAINER';

/** Security classification levels */
export type SecurityClassification =
  | 'OFFICIAL'
  | 'OFFICIAL_SENSITIVE'
  | 'SECRET'
  | 'TOP_SECRET';

/** Export control regime */
export type ExportControlRegime =
  | 'ITAR'
  | 'EAR_ECCN'
  | 'UK_MILITARY_LIST'
  | 'OPEN_GENERAL'
  | 'NOT_CONTROLLED';

/** Resource type for RBS nodes */
export type ResourceType = 'PERSON' | 'FACILITY' | 'ASSET' | 'EQUIPMENT';

/** A location node in the LBS hierarchy */
export interface LocationNode {
  /** Unique identifier */
  id: string;
  /** Parent location ID (null for root sites) */
  parent_id: string | null;
  /** ltree path string (e.g., "site_warton.bldg_1.fl_1") */
  path: string;
  /** Location code (e.g., 'RF-LAB-01') */
  code: string;
  /** Human-readable name */
  name: string;
  /** Tier in the hierarchy */
  tier: LocationTier;
  /** Whether this is a SCIF or TEMPEST-rated facility */
  is_scif_or_tempest: boolean;
  /** Whether visitors require an escort */
  escort_required: boolean;
  /** Security classification of this location */
  security_classification: SecurityClassification;
  /** Handling caveats */
  caveats: string[] | null;
  /** Whether this location is active */
  is_active: boolean;
  /** Optional child locations (populated when fetching sub-tree) */
  children?: LocationNode[];
  /** Whether this node is currently expanded in the tree */
  expanded?: boolean;
  /** Whether children have been loaded */
  childrenLoaded?: boolean;
  /** Number of assets currently in this location */
  asset_count?: number;
}

// ---------------------------------------------------------------------------
// Asset & Equipment Types
// ---------------------------------------------------------------------------

/** A physical asset or equipment item (ResourceNode with type ASSET/EQUIPMENT) */
export interface AssetItem {
  /** Unique identifier */
  id: string;
  /** Asset code (e.g., 'FPGA-VIRTEX-ULTRASCALE') */
  code: string;
  /** Human-readable name */
  name: string;
  /** Resource type */
  resource_type: 'ASSET' | 'EQUIPMENT';
  /** Current location ID */
  current_location_id: string | null;
  /** Current location path (ltree string) */
  current_location_path: string | null;
  /** Current location name */
  current_location_name: string | null;
  /** Security classification */
  security_classification: SecurityClassification;
  /** Standard hourly rate */
  standard_hourly_rate: number | null;
  /** Whether this is active */
  is_active: boolean;
}

/** A custody ledger entry recording an asset move */
export interface AssetCustodyEntry {
  /** Unique identifier */
  id: string;
  /** Asset resource node ID */
  resource_node_id: string;
  /** Asset code */
  resource_code: string;
  /** Asset name */
  resource_name: string;
  /** From location ID (null for initial commissioning) */
  from_location_id: string | null;
  /** From location name */
  from_location_name: string | null;
  /** To location ID */
  to_location_id: string;
  /** To location name */
  to_location_name: string;
  /** Moved by user ID */
  moved_by_user_id: number;
  /** Moved by user name */
  moved_by_user_name: string | null;
  /** Authorized by user name (nullable) */
  authorized_by_user_name: string | null;
  /** Associated task ID (nullable) */
  associated_task_id: string | null;
  /** Movement timestamp */
  movement_timestamp: string;
  /** Reason for the move */
  movement_reason: string;
  /** Additional notes */
  notes: string | null;
}

/** Response for location inventory query */
export interface LocationInventoryResponse {
  /** Location ID */
  location_id: string;
  /** Location name */
  location_name: string;
  /** Location tier */
  tier: LocationTier;
  /** List of assets in this location and sub-locations */
  assets: AssetItem[];
  /** Total asset count */
  total_count: number;
}

/** Response for asset custody history */
export interface AssetCustodyHistoryResponse {
  /** Asset resource node ID */
  resource_node_id: string;
  /** Asset code */
  resource_code: string;
  /** Asset name */
  resource_name: string;
  /** Chronological custody entries */
  entries: AssetCustodyEntry[];
}

/** Request to relocate an asset */
export interface AssetRelocateRequest {
  /** Asset resource node ID */
  resource_id: string;
  /** Target location node ID */
  target_location_id: string;
  /** Justification for the move */
  reason: string;
  /** Optional associated task ID */
  task_id?: string | null;
  /** Optional authorization user ID */
  authorized_by_user_id?: number | null;
  /** Optional additional notes */
  notes?: string | null;
}

/** Response after relocating an asset */
export interface AssetRelocateResponse {
  /** Ledger entry ID */
  ledger_entry_id: string;
  /** Asset code */
  resource_code: string;
  /** Asset name */
  resource_name: string;
  /** From location name */
  from_location_name: string | null;
  /** To location name */
  to_location_name: string;
  /** Movement timestamp */
  movement_timestamp: string;
}

// ---------------------------------------------------------------------------
// Document Artifact Vault Types
// ---------------------------------------------------------------------------

/** A classified document artifact */
export interface DocumentArtifact {
  /** Unique identifier */
  id: string;
  /** Associated portfolio node ID (nullable) */
  portfolio_node_id: string | null;
  /** Associated CDRL ID (nullable) */
  cdrl_id: string | null;
  /** Original filename */
  file_name: string;
  /** File size in bytes */
  file_size_bytes: number;
  /** MIME type */
  mime_type: string;
  /** S3 object key */
  s3_object_key: string;
  /** SHA-256 checksum */
  sha256_checksum: string;
  /** Security classification */
  security_classification: SecurityClassification;
  /** Handling caveats */
  caveats: string[] | null;
  /** Export control regime */
  export_control_regime: ExportControlRegime;
  /** Uploader user ID */
  uploaded_by_user_id: number;
  /** Uploader user name */
  uploaded_by_user_name: string | null;
  /** Whether this artifact is active */
  is_active: boolean;
  /** Created timestamp */
  created_at: string;
  /** Updated timestamp */
  updated_at: string;
}

/** Request to upload a new artifact */
export interface ArtifactUploadRequest {
  /** Original filename */
  file_name: string;
  /** File size in bytes */
  file_size_bytes: number;
  /** MIME type */
  mime_type: string;
  /** Security classification */
  security_classification: SecurityClassification;
  /** Handling caveats */
  caveats?: string[] | null;
  /** Export control regime */
  export_control_regime: ExportControlRegime;
  /** Associated portfolio node ID (nullable) */
  portfolio_node_id?: string | null;
  /** Associated CDRL ID (nullable) */
  cdrl_id?: string | null;
}

/** Response after requesting an upload URL */
export interface ArtifactUploadResponse {
  /** Artifact database record ID */
  artifact_id: string;
  /** Pre-signed S3 PUT URL */
  upload_url: string;
  /** S3 object key */
  s3_object_key: string;
  /** URL expiry in seconds */
  url_expiry_seconds: number;
}

/** Request to confirm an upload */
export interface ArtifactConfirmUploadRequest {
  /** Artifact database record ID */
  artifact_id: string;
  /** Client-computed SHA-256 checksum */
  sha256_checksum: string;
}

/** Response after confirming an upload */
export interface ArtifactConfirmUploadResponse {
  /** Artifact ID */
  artifact_id: string;
  /** Whether the artifact is now active */
  is_active: boolean;
  /** SHA-256 checksum verified */
  sha256_checksum: string;
}

/** Response for a download URL request */
export interface ArtifactDownloadResponse {
  /** Artifact ID */
  artifact_id: string;
  /** Pre-signed S3 GET URL */
  download_url: string;
  /** URL expiry in seconds */
  url_expiry_seconds: number;
  /** File name */
  file_name: string;
  /** File size in bytes */
  file_size_bytes: number;
}

/** List response for artifacts */
export interface ArtifactListResponse {
  /** List of accessible artifacts */
  artifacts: DocumentArtifact[];
  /** Total count */
  total_count: number;
}

// ---------------------------------------------------------------------------
// Frontend-Only State Types
// ---------------------------------------------------------------------------

/** Upload state for the artifact vault drawer */
export interface UploadState {
  /** Whether an upload is in progress */
  isUploading: boolean;
  /** Upload progress percentage (0-100) */
  progress: number;
  /** Error message (null if no error) */
  error: string | null;
  /** Successfully uploaded artifact ID */
  uploadedArtifactId: string | null;
}

/** Relocate modal state */
export interface RelocateModalState {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Selected asset to relocate */
  asset: AssetItem | null;
  /** Selected target location */
  targetLocation: LocationNode | null;
  /** Justification text */
  reason: string;
  /** Optional notes */
  notes: string;
  /** Whether relocation is in progress */
  isRelocating: boolean;
  /** Error message */
  error: string | null;
}

/** Location tree filter state */
export interface LocationTreeFilters {
  /** Filter by tier (null = all) */
  tier: LocationTier | null;
  /** Only show SCIF/TEMPEST locations */
  scifOnly: boolean;
  /** Search query */
  searchQuery: string;
}
