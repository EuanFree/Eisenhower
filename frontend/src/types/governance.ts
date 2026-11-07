/**
 * Governance Type Definitions
 *
 * TypeScript interfaces mirroring the backend schemas for contractual
 * governance: Contract Deliverables (CDRL/SDRL) and Baseline Change
 * Requests (BCR).
 *
 * These types are used by the ContractDeliverablesView and ChangeControlView
 * to type-safe the API responses and form inputs.
 */

// ---------------------------------------------------------------------------
// Contract Deliverable (CDRL) Types
// ---------------------------------------------------------------------------

/** CDRL lifecycle status from the backend enum */
export type CDRLStatus =
  | 'DRAFTING'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ACCEPTED'
  | 'ACCEPTED_WITH_COMMENTS'
  | 'REJECTED';

/** Single CDRL item returned by the backend */
export interface CDRLItem {
  /** Unique identifier */
  id: string;
  /** Associated portfolio node ID */
  portfolio_node_id: string;
  /** Deliverable sequence number (e.g., 'CDRL-A004') */
  cdrl_sequence_number: string;
  /** Human-readable title */
  title: string;
  /** Data Item Description reference (e.g., 'DI-MGMT-81861') */
  did_reference: string;
  /** Current revision label (e.g., 'Rev A') */
  revision: string;
  /** Current lifecycle status */
  status: CDRLStatus;
  /** Contractual submission deadline */
  contractual_due_date: string; // ISO date string
  /** Actual submission date (nullable) */
  actual_submission_date: string | null; // ISO date string or null
  /** Review window in days */
  review_window_days: number;
  /** Calculated review deadline (nullable) */
  review_deadline_date: string | null; // ISO date string or null
  /** Remaining days until review deadline (negative if overdue) */
  days_until_review_deadline: number | null;
  /** Created timestamp */
  created_at: string;
  /** Last modified timestamp */
  updated_at: string;
}

/** CDRL list response from the backend */
export interface CDRLListResponse {
  cdrls: CDRLItem[];
  total: number;
}

/** CDRL comment entry for the line-item comment matrix */
export interface CDRLComment {
  /** Unique identifier */
  id: string;
  /** CDRL item ID */
  cdrl_id: string;
  /** Line item or section reference */
  line_item: string;
  /** Customer or reviewer name */
  commenter: string;
  /** Comment text */
  comment: string;
  /** Comment timestamp */
  created_at: string;
}

// ---------------------------------------------------------------------------
// Baseline Change Request (BCR) Types
// ---------------------------------------------------------------------------

/** BCR governance tier from the backend enum */
export type BaselineTier =
  | 'TIER_1_LOCAL_CAM'
  | 'TIER_2_PROJECT_CCB'
  | 'TIER_3_PROGRAMME_BOARD';

/** BCR lifecycle status from the backend enum */
export type BCRStatus =
  | 'DRAFT'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED';

/** Single BCR item returned by the backend */
export interface BCRItem {
  /** Unique identifier */
  id: string;
  /** Unique, human-readable BCR number (e.g., 'BCR-2024-001') */
  bcr_number: string;
  /** Short title describing the proposed change */
  title: string;
  /** Detailed justification for the change */
  justification: string;
  /** Governance tier required */
  tier: BaselineTier;
  /** Current lifecycle status */
  status: BCRStatus;
  /** Estimated change in total cost */
  cost_delta_amount: number | null;
  /** Estimated slip in finish date (days) */
  schedule_finish_slip_days: number | null;
  /** Additional contingency reserve requested */
  contingency_reserve_requested: number | null;
  /** User who created this BCR */
  created_by_user_id: string | null;
  /** User who approved or rejected this BCR */
  approver_user_id: string | null;
  /** If rejected, the reason for rejection */
  rejection_reason: string | null;
  /** Created timestamp */
  created_at: string;
  /** Last modified timestamp */
  updated_at: string;
}

/** BCR list response from the backend */
export interface BCRListResponse {
  bcrs: BCRItem[];
  total: number;
}

/** Digital signature entry for multi-signature sign-off */
export interface BCRSignature {
  /** Unique identifier */
  id: string;
  /** BCR item ID */
  bcr_id: string;
  /** Signer's user ID */
  user_id: string;
  /** Signer's display name */
  user_name: string;
  /** Signer's role */
  user_role: string;
  /** Signature timestamp */
  signed_at: string;
  /** Optional comment from the signer */
  comment: string | null;
}

// ---------------------------------------------------------------------------
// Frontend-Only Types
// ---------------------------------------------------------------------------

/** CDRL filter state for the triage board */
export interface CDRLFilters {
  /** Filter by status */
  status: CDRLStatus | null;
  /** Filter by search term (CDRL number, title, DID reference) */
  search: string | null;
}

/** BCR filter state for the CCB dashboard */
export interface BCRFilters {
  /** Filter by tier */
  tier: BaselineTier | null;
  /** Filter by status */
  status: BCRStatus | null;
}
