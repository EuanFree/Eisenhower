/**
 * Supplier Portal TypeScript Types
 *
 * Type definitions for the isolated subcontractor supplier portal API.
 * These types mirror the backend Pydantic schemas in app/schemas/supplier_schemas.py.
 */

// ---------------------------------------------------------------------------
// Supplier Task Types
// ---------------------------------------------------------------------------

export interface SupplierTask {
  /** Unique node identifier */
  id: string;
  /** Work package code (e.g., 'WP-101') */
  code: string;
  /** Task name (or '[RESTRICTED]' if classification exceeds clearance) */
  name: string;
  /** Truncated ltree path showing only boundary node + descendant */
  path: string;
  /** True if the full parent hierarchy has been hidden */
  path_masked: boolean;
  /** Node classification level */
  security_classification: string;
  /** Delivery methodology */
  delivery_mode?: 'WATERFALL' | 'AGILE' | 'HYBRID' | null;
  /** Planned start date */
  planned_start_date?: string | null;
  /** Planned end date */
  planned_end_date?: string | null;
  /** Actual start date (if work has begun) */
  actual_start_date?: string | null;
  /** Actual end date (if work is complete) */
  actual_end_date?: string | null;
  /** Physical percent complete (0–100) */
  percent_complete: number;
  /** Total float in days (null if CPM not yet calculated) */
  total_float: number | null;
  /** True if the task is on the critical path (TF ≤ 0) */
  is_critical: boolean;
  /** True if the task has unresolved blockers */
  has_active_blocker: boolean;
  /** Number of active blockers on this task */
  blockers_count: number;
  /** NATO/CAGE code of the vendor assigned to this work package */
  vendor_cage_code?: string | null;
  /** CDRL sequence number if a deliverable is linked */
  linked_cdrl_code?: string | null;
  /** V&V test case summary */
  vv_test_summary?: { passed: number; total: number } | null;
  /** Optimistic concurrency version number */
  version_id: number;
}

export interface SupplierTaskListResponse {
  /** Masked task nodes accessible to the subcontractor */
  tasks: SupplierTask[];
  /** Total number of accessible tasks */
  total_count: number;
  /** The CAGE code of the requesting vendor */
  vendor_cage_code: string;
}

// ---------------------------------------------------------------------------
// Progress Update Types
// ---------------------------------------------------------------------------

export interface SupplierProgressUpdate {
  /** New physical percent complete (0–100) */
  percent_complete: number;
  /** Updated estimate of remaining work days */
  remaining_duration_days?: number | null;
  /** Status notes or comments from the subcontractor */
  notes?: string | null;
  /** Direct labor hours logged for today */
  hours_logged_today?: number | null;
  /** Updated forecast of when the task will be physically complete */
  forecast_finish_date?: string | null;
}

export interface SupplierProgressResponse {
  /** Updated task identifier */
  task_id: string;
  /** Progress before this update */
  previous_percent_complete: number;
  /** Progress after this update */
  new_percent_complete: number;
  /** Timestamp of the update */
  updated_at: string;
  /** Confirmation message */
  message: string;
}

// ---------------------------------------------------------------------------
// CDRL / SDRL Types
// ---------------------------------------------------------------------------

export interface SupplierCDRLItem {
  /** Deliverable identifier */
  id: string;
  /** CDRL/SDRL sequence number */
  cdrl_sequence_number: string;
  /** Deliverable title */
  title: string;
  /** DID reference */
  did_reference?: string | null;
  /** Current revision */
  revision: string;
  /** Current status */
  status: string;
  /** Contractual due date */
  contractual_due_date?: string | null;
  /** Date the deliverable was submitted */
  actual_submission_date?: string | null;
  /** Deadline for customer review */
  review_deadline_date?: string | null;
  /** Remaining days until review deadline (negative = overdue) */
  days_until_review_deadline?: number | null;
}

export interface SupplierCDRLListResponse {
  /** CDRL items assigned to the subcontractor's work packages */
  deliverables: SupplierCDRLItem[];
  /** Total number of deliverables */
  total_count: number;
}

export interface SupplierCDRLSubmission {
  /** ID of the ContractDeliverable being submitted */
  cdrl_id: string;
  /** Name of the submitted file */
  file_name: string;
  /** Size of the file in bytes */
  file_size_bytes: number;
  /** MIME type of the submitted file */
  mime_type: string;
  /** SHA-256 cryptographic digest of the file payload */
  sha256_checksum: string;
  /** S3 object key where the file is stored */
  s3_object_key: string;
  /** Notes from the subcontractor regarding the submission */
  submission_notes?: string | null;
}

export interface SupplierCDRLResponse {
  /** Deliverable identifier */
  cdrl_id: string;
  /** CDRL sequence number */
  cdrl_sequence_number: string;
  /** Deliverable title */
  title: string;
  /** Status before submission */
  previous_status: string;
  /** Status after submission */
  new_status: string;
  /** Timestamp of the submission */
  submitted_at: string;
  /** Confirmation message */
  message: string;
}

// ---------------------------------------------------------------------------
// Schedule Upload Types
// ---------------------------------------------------------------------------

export interface SupplierScheduleUploadResponse {
  /** ID of the created SubcontractorSubmission record */
  submission_id: string;
  /** Initial status */
  status: string;
  /** Confirmation message */
  message: string;
}

// ---------------------------------------------------------------------------
// Supplier Profile Types
// ---------------------------------------------------------------------------

export interface SupplierProfileResponse {
  /** User account ID */
  user_id: number;
  /** Login username */
  username: string;
  /** Display name */
  full_name?: string | null;
  /** NATO/CAGE code of the vendor organisation */
  vendor_cage_code: string;
  /** Legal entity name */
  employer_legal_entity?: string | null;
  /** Security clearance level */
  clearance_level: string;
  /** Security caveats */
  caveats?: string[] | null;
}

// ---------------------------------------------------------------------------
// Frontend-only Types
// ---------------------------------------------------------------------------

/** CDRL status dispositions with color coding */
export const CDRL_STATUS_COLORS: Record<string, string> = {
  DRAFTING: 'text-text-ops-muted',
  SUBMITTED: 'text-sky-400',
  UNDER_REVIEW: 'text-amber-400',
  ACCEPTED: 'text-green-400',
  ACCEPTED_WITH_COMMENTS: 'text-blue-400',
  REJECTED: 'text-red-400',
};

/** CDRL status badge backgrounds */
export const CDRL_STATUS_BG: Record<string, string> = {
  DRAFTING: 'bg-bg-ops-overlay',
  SUBMITTED: 'bg-sky-900/30',
  UNDER_REVIEW: 'bg-amber-900/30',
  ACCEPTED: 'bg-green-900/30',
  ACCEPTED_WITH_COMMENTS: 'bg-blue-900/30',
  REJECTED: 'bg-red-900/30',
};
