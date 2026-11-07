/**
 * Authoring Types — Work Item and Resource Creation
 *
 * TypeScript interfaces for the creation modals used to add new WBS nodes
 * and Resource entries.  These mirror the backend Pydantic schemas in
 * ``app/schemas/authoring.py`` and ``app/schemas/custom_fields.py``.
 */

// ---------------------------------------------------------------------------
// Work Item Creation
// ---------------------------------------------------------------------------

/**
 * WBS hierarchy tier for a new work item.
 */
export type WorkItemTier = 'PROG' | 'PROJ' | 'CA' | 'WP' | 'TASK' | 'MILESTONE';

/**
 * Delivery mode for a work item.
 */
export type DeliveryMode = 'WATERFALL' | 'AGILE' | 'HYBRID';

/**
 * Security classification level.
 */
export type SecurityClassification = 'OFFICIAL' | 'OFFICIAL_SENSITIVE' | 'SECRET' | 'TOP_SECRET';

/**
 * Design Assurance Level / Safety Integrity Level.
 */
export type DALSILLevel = 'DAL_A' | 'DAL_B' | 'DAL_C' | 'DAL_D' | 'DAL_E' | 'SIL_1' | 'SIL_2' | 'SIL_3' | 'SIL_4' | 'NON_SAFETY';

/**
 * Payload for creating a new work item via POST /api/v1/wbs/.
 */
export interface WorkItemCreatePayload {
  /** Parent node UUID (null for root-level Programme) */
  parent_id: string | null;
  /** Short WBS code (e.g., 'WP-2104') */
  code: string;
  /** Human-readable name */
  name: string;
  /** Hierarchy tier */
  tier: WorkItemTier;
  /** Delivery mode */
  delivery_mode: DeliveryMode | null;
  /** Planned start date (ISO string) */
  planned_start: string | null;
  /** Planned finish date (ISO string) */
  planned_finish: string | null;
  /** Duration in workdays */
  duration_days: number;
  /** Security classification */
  security_classification: SecurityClassification;
  /** Security caveats */
  caveats: string[];
  /** DAL/SIL safety level */
  dal_sil_level: DALSILLevel | null;
  /** Custom attributes */
  custom_attributes: Record<string, unknown>;
}

/**
 * Response from POST /api/v1/wbs/.
 */
export interface WorkItemCreatedResponse {
  /** New node UUID */
  id: string;
  /** WBS code */
  code: string;
  /** Node name */
  name: string;
  /** Hierarchy tier */
  tier: WorkItemTier;
  /** ltree path */
  path: string;
  /** Parent node UUID */
  parent_id: string | null;
  /** Version ID for concurrency control */
  version_id: number;
}

// ---------------------------------------------------------------------------
// Resource Creation
// ---------------------------------------------------------------------------

/**
 * Resource type for a new resource entry.
 */
export type ResourceType = 'HUMAN_LABOR' | 'EQUIPMENT' | 'FACILITY';

/**
 * Payload for creating a new resource via POST /api/v1/resources/.
 */
export interface ResourceCreatePayload {
  /** Resource code (e.g., 'ENG-001') */
  code: string;
  /** Full name */
  name: string;
  /** Resource type */
  resource_type: ResourceType;
  /** Primary department */
  department: string;
  /** Burdened hourly rate */
  burdened_hourly_rate: number;
  /** Security clearance level */
  clearance_level: SecurityClassification;
  /** Primary nationality (ISO 2-letter) */
  nationality: string;
  /** Weekly hours capacity (HUMAN_LABOR only) */
  weekly_hours_capacity?: number;
  /** Serial number (EQUIPMENT only) */
  serial_number?: string;
  /** Calibration due date (EQUIPMENT — mandatory) */
  calibration_expiry_date?: string;
  /** Custom attributes */
  custom_attributes: Record<string, unknown>;
}

/**
 * Response from POST /api/v1/resources/.
 */
export interface ResourceCreatedResponse {
  /** New resource UUID */
  id: string;
  /** Resource code */
  code: string;
  /** Resource name */
  name: string;
  /** Resource type */
  resource_type: ResourceType;
  /** ltree path */
  path: string;
}

// ---------------------------------------------------------------------------
// Custom Field Definition
// ---------------------------------------------------------------------------

/**
 * Supported data types for custom fields.
 */
export type CustomFieldDataType =
  | 'STRING'
  | 'INTEGER'
  | 'DECIMAL'
  | 'BOOLEAN'
  | 'DATE'
  | 'SINGLE_ENUM'
  | 'MULTI_ENUM'
  | 'CURRENCY';

/**
 * Target entity types for custom fields.
 */
export type CustomFieldTargetEntity = 'WORK_ITEM' | 'RESOURCE' | 'FACILITY' | 'CDRL';

/**
 * Custom field definition from GET /api/v1/admin/custom-fields.
 */
export interface CustomFieldDefinition {
  /** Field definition UUID */
  id: string;
  /** Alphanumeric slug with cf_ prefix */
  field_key: string;
  /** Human-readable label */
  display_label: string;
  /** Target entity type */
  target_entity: CustomFieldTargetEntity;
  /** Applicable WBS tiers (null = all) */
  applicable_tiers: string[] | null;
  /** Data type */
  data_type: CustomFieldDataType;
  /** Valid enum options (for enum types) */
  enum_options: string[] | null;
  /** Validation rules (min, max, regex_pattern) */
  validation_rules: {
    min?: number;
    max?: number;
    regex_pattern?: string;
  } | null;
  /** Default value */
  default_value: unknown;
  /** Whether the field is mandatory */
  is_mandatory: boolean;
  /** Minimum clearance to read */
  read_clearance_level: string;
  /** Minimum clearance to write */
  write_clearance_level: string;
  /** Required roles */
  required_roles: string[];
  /** Whether the field is active */
  is_active: boolean;
}

/**
 * Custom field input value for the creation form.
 */
export interface CustomFieldValue {
  /** Field key */
  field_key: string;
  /** Current value */
  value: unknown;
  /** Whether the user can write this field */
  can_write: boolean;
  /** Whether the field is mandatory */
  is_mandatory: boolean;
  /** Validation error message (if any) */
  error?: string;
}

// ---------------------------------------------------------------------------
// Tier Metadata
// ---------------------------------------------------------------------------

/**
 * Display metadata for each WBS tier.
 */
export interface TierMetadata {
  /** Tier code */
  tier: WorkItemTier;
  /** Display label */
  label: string;
  /** Description */
  description: string;
  /** Suggested code prefix */
  code_prefix: string;
}

/**
 * All WBS tier definitions.
 */
export const TIER_METADATA: TierMetadata[] = [
  { tier: 'PROG', label: 'Programme', description: 'Root-level portfolio programme', code_prefix: 'PROG' },
  { tier: 'PROJ', label: 'Project', description: 'Child project under a programme', code_prefix: 'PROJ' },
  { tier: 'CA', label: 'Control Account', description: 'Cost control point under a project', code_prefix: 'CA' },
  { tier: 'WP', label: 'Work Package', description: 'Executable work unit', code_prefix: 'WP' },
  { tier: 'TASK', label: 'Task', description: 'Individual task activity', code_prefix: 'TASK' },
  { tier: 'MILESTONE', label: 'Milestone', description: 'Zero-duration checkpoint', code_prefix: 'MS' },
];

/**
 * Security classification display metadata.
 */
export const CLASSIFICATION_COLORS: Record<SecurityClassification, string> = {
  OFFICIAL: 'text-sky-400',
  OFFICIAL_SENSITIVE: 'text-cyan-400',
  SECRET: 'text-red-400',
  TOP_SECRET: 'text-purple-400',
};

/**
 * DAL/SIL level display metadata.
 */
export const DAL_COLORS: Record<string, string> = {
  DAL_A: 'text-red-400',
  DAL_B: 'text-orange-400',
  DAL_C: 'text-amber-400',
  DAL_D: 'text-yellow-400',
  DAL_E: 'text-green-400',
  SIL_4: 'text-red-400',
  SIL_3: 'text-orange-400',
  SIL_2: 'text-amber-400',
  SIL_1: 'text-yellow-400',
  NON_SAFETY: 'text-text-ops-muted',
};
