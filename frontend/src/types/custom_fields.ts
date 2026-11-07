/**
 * Custom Field Definition Types
 *
 * TypeScript interfaces mirroring the backend custom field definition schemas
 * used by the admin workbench to manage dynamic custom attributes across
 * Work Items, Resources, Facilities, and CDRLs.
 *
 * Each custom field is defined by a CustomFieldDefinition record that specifies
 * the field's key, display label, data type, validation rules, and security
 * clearance requirements. Field values are stored in the custom_attributes
 * JSONB column on the target entity.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Supported data types for custom field values */
export const DATA_TYPES = [
  'STRING',
  'INTEGER',
  'DECIMAL',
  'BOOLEAN',
  'DATE',
  'SINGLE_ENUM',
  'MULTI_ENUM',
  'CURRENCY',
] as const;

export type DataType = (typeof DATA_TYPES)[number];

/** Target entity types for custom field definitions */
export const TARGET_ENTITIES = ['WORK_ITEM', 'RESOURCE', 'FACILITY', 'CDRL'] as const;

export type TargetEntity = (typeof TARGET_ENTITIES)[number];

/** Security clearance levels for custom field access */
export const CLEARANCE_LEVELS = ['OFFICIAL', 'SECRET', 'TOP_SECRET'] as const;

export type ClearanceLevel = (typeof CLEARANCE_LEVELS)[number];

/** WBS tiers that custom fields can be restricted to */
export const VALID_TIERS = ['PROG', 'PROJ', 'CA', 'WP', 'TASK', 'MILESTONE'] as const;

export type WBSTier = (typeof VALID_TIERS)[number];

/** Permitted roles for custom field editing */
export const PERMITTED_ROLES = [
  'USER',
  'CAM',
  'SECURITY_OFFICER',
  'LEAD_ENGINEER',
  'SYSTEM_ADMIN',
  'PMO_DIRECTOR',
  'RESOURCE_MANAGER',
  'DEPT_HEAD',
  'ADMIN',
  'MANAGER',
  'MEMBER',
  'VIEWER',
] as const;

export type PermittedRole = (typeof PERMITTED_ROLES)[number];

// ---------------------------------------------------------------------------
// Validation Rules
// ---------------------------------------------------------------------------

/**
 * Validation rules for numeric and string fields.
 *
 * For numeric types (INTEGER, DECIMAL, CURRENCY), min and max define the
 * acceptable range. For STRING types, regex_pattern defines a PCRE-compatible
 * pattern that the value must match.
 */
export interface ValidationRules {
  /** Minimum value for numeric types */
  min?: number;
  /** Maximum value for numeric types */
  max?: number;
  /** Regex pattern for STRING type validation */
  regex_pattern?: string;
}

// ---------------------------------------------------------------------------
// Custom Field Definition
// ---------------------------------------------------------------------------

/**
 * A custom field definition record.
 *
 * This interface mirrors the backend CustomFieldDefinition model and
 * CustomFieldDefinitionResponse schema.
 */
export interface CustomFieldDefinition {
  /** Primary key UUID */
  id: string;
  /** Unique alphanumeric slug with cf_ prefix */
  field_key: string;
  /** Human-readable label shown in the UI */
  display_label: string;
  /** Entity type this field applies to */
  target_entity: TargetEntity;
  /** WBS tiers this field applies to (null = all tiers) */
  applicable_tiers: WBSTier[] | null;
  /** Data type of the field value */
  data_type: DataType;
  /** Valid options for SINGLE_ENUM and MULTI_ENUM types */
  enum_options: string[] | null;
  /** Validation rules (min, max, regex_pattern) */
  validation_rules: ValidationRules | null;
  /** Default value for new entities */
  default_value: any | null;
  /** Whether the field must have a value on entity creation */
  is_mandatory: boolean;
  /** Minimum clearance to read this field */
  read_clearance_level: ClearanceLevel;
  /** Minimum clearance to write this field */
  write_clearance_level: ClearanceLevel;
  /** Roles required to edit this field */
  required_roles: PermittedRole[];
  /** Whether the field is active (soft-delete flag) */
  is_active: boolean;
  /** Timestamp when the field was created */
  created_at: string;
}

/**
 * Payload for creating a new custom field definition.
 *
 * Mirrors the backend CustomFieldDefinitionCreate schema.
 */
export interface CustomFieldDefinitionCreate {
  /** Unique alphanumeric slug with cf_ prefix */
  field_key: string;
  /** Human-readable label */
  display_label: string;
  /** Entity type: WORK_ITEM, RESOURCE, FACILITY, or CDRL */
  target_entity: TargetEntity;
  /** WBS tiers this field applies to (null = all tiers) */
  applicable_tiers: WBSTier[] | null;
  /** Data type */
  data_type: DataType;
  /** Valid options for enum types */
  enum_options: string[] | null;
  /** Validation rules */
  validation_rules: ValidationRules | null;
  /** Default value */
  default_value: any | null;
  /** Whether the field is mandatory */
  is_mandatory: boolean;
  /** Minimum read clearance */
  read_clearance_level: ClearanceLevel;
  /** Minimum write clearance */
  write_clearance_level: ClearanceLevel;
  /** Required roles */
  required_roles: PermittedRole[];
}

/**
 * Partial payload for updating an existing custom field definition.
 *
 * Mirrors the backend CustomFieldDefinitionUpdate schema.
 */
export interface CustomFieldDefinitionUpdate {
  /** Human-readable label */
  display_label?: string;
  /** WBS tiers this field applies to */
  applicable_tiers?: WBSTier[] | null;
  /** Data type */
  data_type?: DataType;
  /** Valid options for enum types */
  enum_options?: string[] | null;
  /** Validation rules */
  validation_rules?: ValidationRules | null;
  /** Default value */
  default_value?: any | null;
  /** Whether the field is mandatory */
  is_mandatory?: boolean;
  /** Minimum read clearance */
  read_clearance_level?: ClearanceLevel;
  /** Minimum write clearance */
  write_clearance_level?: ClearanceLevel;
  /** Required roles */
  required_roles?: PermittedRole[];
}

/**
 * List response from GET /api/v1/admin/custom-fields
 */
export interface CustomFieldListResponse {
  /** Total count of fields */
  total: number;
  /** List of field definitions */
  items: CustomFieldDefinition[];
}

// ---------------------------------------------------------------------------
// Frontend-Only Types
// ---------------------------------------------------------------------------

/**
 * Filter state for the custom fields master table.
 */
export interface CustomFieldFilters {
  /** Filter by target entity (null = all) */
  target_entity: TargetEntity | null;
  /** Filter by data type (null = all) */
  data_type: DataType | null;
  /** Filter by active status (null = all, true = active only, false = inactive only) */
  is_active: boolean | null;
  /** Search text for field key or display label */
  search: string;
}

/**
 * Form state for the Field Definition Drawer.
 */
export interface FieldDefinitionFormState {
  field_key: string;
  display_label: string;
  target_entity: TargetEntity;
  applicable_tiers: WBSTier[];
  data_type: DataType;
  enum_options: string[];
  validation_rules: ValidationRules;
  default_value: any;
  is_mandatory: boolean;
  read_clearance_level: ClearanceLevel;
  write_clearance_level: ClearanceLevel;
  required_roles: PermittedRole[];
  include_in_ipmr: boolean;
}

/**
 * Validation error for a form field.
 */
export interface FieldError {
  /** Field name */
  field: string;
  /** Error message */
  message: string;
}

/**
 * Preview input test result.
 */
export interface PreviewTestResult {
  /** The test input value */
  input: string;
  /** Whether the input passed validation */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Coerced value if valid */
  coerced?: any;
}

/**
 * Tier metadata for display in the UI.
 */
export const TIER_METADATA: Record<WBSTier, { label: string; icon: string }> = {
  PROG: { label: 'Programme', icon: '🏛️' },
  PROJ: { label: 'Project', icon: '📁' },
  CA: { label: 'Control Account', icon: '📊' },
  WP: { label: 'Work Package', icon: '📦' },
  TASK: { label: 'Task', icon: '✅' },
  MILESTONE: { label: 'Milestone', icon: '🚩' },
};

/**
 * Data type metadata for display in the UI.
 */
export const DATA_TYPE_METADATA: Record<DataType, { label: string; icon: string; description: string }> = {
  STRING: { label: 'Text', icon: '📝', description: 'Free-form text string' },
  INTEGER: { label: 'Integer', icon: '🔢', description: 'Whole number' },
  DECIMAL: { label: 'Decimal', icon: '🔢', description: 'Decimal number' },
  BOOLEAN: { label: 'Boolean', icon: '☑️', description: 'True/False toggle' },
  DATE: { label: 'Date', icon: '📅', description: 'Calendar date' },
  SINGLE_ENUM: { label: 'Single Select', icon: '📋', description: 'Choose one from a list' },
  MULTI_ENUM: { label: 'Multi Select', icon: '☑️', description: 'Choose multiple from a list' },
  CURRENCY: { label: 'Currency', icon: '💰', description: 'Monetary value' },
};

/**
 * Clearance level color mapping for UI display.
 */
export const CLEARANCE_COLORS: Record<ClearanceLevel, { bg: string; text: string; border: string }> = {
  OFFICIAL: { bg: 'bg-sky-900/30', text: 'text-sky-400', border: 'border-sky-500' },
  SECRET: { bg: 'bg-red-900/30', text: 'text-red-400', border: 'border-red-500' },
  TOP_SECRET: { bg: 'bg-purple-900/30', text: 'text-purple-400', border: 'border-purple-500' },
};

/**
 * Target entity metadata for display in the UI.
 */
export const TARGET_ENTITY_METADATA: Record<TargetEntity, { label: string; icon: string }> = {
  WORK_ITEM: { label: 'Work Item', icon: '📋' },
  RESOURCE: { label: 'Resource', icon: '👤' },
  FACILITY: { label: 'Facility', icon: '🏢' },
  CDRL: { label: 'CDRL', icon: '📄' },
};

/**
 * Create an empty form state for a new field definition.
 */
export function createEmptyFormState(): FieldDefinitionFormState {
  return {
    field_key: 'cf_',
    display_label: '',
    target_entity: 'WORK_ITEM',
    applicable_tiers: [],
    data_type: 'STRING',
    enum_options: [],
    validation_rules: {},
    default_value: null,
    is_mandatory: false,
    read_clearance_level: 'OFFICIAL',
    write_clearance_level: 'OFFICIAL',
    required_roles: ['USER'],
    include_in_ipmr: false,
  };
}

/**
 * Populate form state from an existing field definition.
 */
export function formStateFromDefinition(def: CustomFieldDefinition): FieldDefinitionFormState {
  return {
    field_key: def.field_key,
    display_label: def.display_label,
    target_entity: def.target_entity,
    applicable_tiers: def.applicable_tiers || [],
    data_type: def.data_type,
    enum_options: def.enum_options || [],
    validation_rules: def.validation_rules || {},
    default_value: def.default_value,
    is_mandatory: def.is_mandatory,
    read_clearance_level: def.read_clearance_level,
    write_clearance_level: def.write_clearance_level,
    required_roles: def.required_roles,
    include_in_ipmr: false,
  };
}
