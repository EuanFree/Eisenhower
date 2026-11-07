/**
 * Facility Scheduling Types
 *
 * TypeScript interfaces mirroring the backend facility telemetry and chamber
 * reservation schemas for the physical test rig reservation interface.
 *
 * These types support the ChamberGanttTimeline, ReservationModal, and
 * FacilitySchedulingView components.
 */

// ---------------------------------------------------------------------------
// Chamber Capabilities
// ---------------------------------------------------------------------------

/**
 * Environmental envelope of a physical test chamber.
 *
 * Example: { temp_min_c: -55, temp_max_c: 125, rf_shielding_db: 100, max_power_kw: 45 }
 */
export interface ChamberCapabilities {
  /** Minimum operating temperature in degrees Celsius */
  temp_min_c?: number;
  /** Maximum operating temperature in degrees Celsius */
  temp_max_c?: number;
  /** RF shielding effectiveness in decibels */
  rf_shielding_db?: number;
  /** Maximum power draw in kilowatts */
  max_power_kw?: number;
  /** Additional custom capability key-value pairs */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Facility Timeline
// ---------------------------------------------------------------------------

/**
 * A single time-phased reservation slot for Gantt/calendar display.
 *
 * Mirrors backend ReservationTimelineSlot schema.
 */
export interface ReservationTimelineSlot {
  /** UUID of the reservation */
  reservation_id: string;
  /** UUID of the testing activity */
  portfolio_node_id: string;
  /** Code of the testing activity (e.g., 'WP-101') */
  portfolio_node_code: string;
  /** Name of the testing activity */
  portfolio_node_name: string;
  /** ISO 8601 start datetime (UTC) */
  reserved_start: string;
  /** ISO 8601 end datetime (UTC) */
  reserved_end: string;
  /** ISO 8601 datetime including warmup buffer */
  buffer_start: string;
  /** ISO 8601 datetime including cooldown buffer */
  buffer_end: string;
  /** Name of the test operator */
  test_operator_name: string | null;
  /** Type of slot: 'reservation' or 'buffer' */
  slot_type: 'reservation' | 'buffer';
}

/**
 * Maintenance downtime window for a physical resource.
 */
export interface MaintenanceWindow {
  /** UUID of the maintenance window */
  id: string;
  /** UUID of the resource node */
  resource_node_id: string;
  /** ISO 8601 start datetime (UTC) */
  downtime_start: string;
  /** ISO 8601 end datetime (UTC) */
  downtime_end: string;
  /** Type of maintenance */
  maintenance_type: 'SCHEDULED_RECALIBRATION' | 'UNSCHEDULED_REPAIR' | 'ANNUAL_OVERHAUL';
  /** Work order reference number */
  work_order_reference: string;
  /** Name of the technician performing maintenance */
  technician_name: string;
}

/**
 * Response schema for a facility's time-phased reservation timeline.
 *
 * Mirrors backend FacilityTimelineResponse schema.
 */
export interface FacilityTimelineResponse {
  /** UUID of the location */
  location_id: string;
  /** Code of the location (e.g., 'LAB-EMC-01') */
  location_code: string;
  /** Name of the location */
  location_name: string;
  /** Environmental envelope of the chamber */
  chamber_capabilities: ChamberCapabilities | null;
  /** Date when the chamber calibration expires */
  calibration_expiry_date: string | null;
  /** Hours of buffer required before and after test runs */
  warmup_cooldown_hours: number;
  /** List of reservation slots sorted by start time */
  reservations: ReservationTimelineSlot[];
  /** List of buffer/cooldown slots for visual display */
  buffer_slots: ReservationTimelineSlot[];
  /** Optional: maintenance downtime windows */
  maintenance_windows?: MaintenanceWindow[];
}

// ---------------------------------------------------------------------------
// Chamber Reservation
// ---------------------------------------------------------------------------

/**
 * Request schema for creating a chamber reservation.
 *
 * Mirrors backend ChamberReservationCreate schema.
 */
export interface ChamberReservationCreate {
  /** UUID of the LocationNode (chamber, rig, etc.) to reserve */
  location_node_id: string;
  /** UUID of the PortfolioNode representing the testing activity */
  portfolio_node_id: string;
  /** ISO 8601 datetime for the start of the reservation (UTC) */
  reserved_start: string;
  /** ISO 8601 datetime for the end of the reservation (UTC) */
  reserved_end: string;
  /** Additional hours for setup and teardown (default 1.0) */
  setup_teardown_hours: number;
  /** Expected power draw in kilowatts during the test run */
  power_profile_kw: number | null;
  /** UUID of the User designated as the test operator */
  test_operator_user_id: string;
}

/**
 * Response schema for a ChamberReservation record.
 *
 * Mirrors backend ChamberReservationResponse schema.
 */
export interface ChamberReservationResponse {
  /** UUID of the reservation */
  id: string;
  /** UUID of the reserved location */
  location_node_id: string;
  /** UUID of the testing activity */
  portfolio_node_id: string;
  /** ISO 8601 start datetime (UTC) */
  reserved_start: string;
  /** ISO 8601 end datetime (UTC) */
  reserved_end: string;
  /** Setup and teardown buffer hours */
  setup_teardown_hours: number;
  /** Expected power draw in kilowatts */
  power_profile_kw: number | null;
  /** UUID of the test operator */
  test_operator_user_id: string;
  /** ISO 8601 datetime including warmup buffer before the test */
  buffer_start: string;
  /** ISO 8601 datetime including cooldown buffer after the test */
  buffer_end: string;
  /** Code of the reserved location */
  location_code: string;
  /** Name of the reserved location */
  location_name: string;
}

// ---------------------------------------------------------------------------
// Facility Validation
// ---------------------------------------------------------------------------

/**
 * Response from chamber feasibility validation.
 *
 * Mirrors backend FacilityValidationResponse schema.
 */
export interface FacilityValidationResponse {
  /** Whether the reservation passed all validation gates */
  valid: boolean;
  /** Whether the task's environmental envelope fits the chamber */
  capability_gate: boolean;
  /** Whether the reservation is within the calibration window */
  calibration_gate: boolean;
  /** Whether the buffer windows do not conflict with existing reservations */
  buffer_gate: boolean;
  /** List of validation error messages */
  errors: string[];
  /** Calculated buffer start (including warmup) */
  buffer_start: string | null;
  /** Calculated buffer end (including cooldown) */
  buffer_end: string | null;
}

// ---------------------------------------------------------------------------
// Frontend-only types
// ---------------------------------------------------------------------------

/**
 * A facility row for the ChamberGanttTimeline component.
 * Combines timeline data with display state.
 */
export interface FacilityRow {
  /** Facility timeline data */
  timeline: FacilityTimelineResponse;
  /** Whether this facility row is expanded */
  expanded: boolean;
  /** Whether this facility is selected */
  selected: boolean;
}

/**
 * Form state for the ReservationModal component.
 */
export interface ReservationFormState {
  /** UUID of the testing task to link */
  portfolio_node_id: string;
  /** ISO 8601 start datetime */
  reserved_start: string;
  /** ISO 8601 end datetime */
  reserved_end: string;
  /** Setup and teardown hours */
  setup_teardown_hours: number;
  /** Requested power draw in kW */
  power_profile_kw: number | null;
  /** Minimum operating temperature in °C */
  temp_min_c: number | null;
  /** Maximum operating temperature in °C */
  temp_max_c: number | null;
  /** UUID of the test operator */
  test_operator_user_id: string;
}

/**
 * Validation errors for the reservation form.
 */
export interface ReservationValidationErrors {
  /** Capability gate errors */
  capability?: string[];
  /** Calibration gate errors */
  calibration?: string[];
  /** Buffer gate errors */
  buffer?: string[];
  /** General form errors */
  form?: string[];
}
