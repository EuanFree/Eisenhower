/**
 * Date Formatting Utilities
 *
 * Provides date formatting functions that support both Calendar Date mode
 * and Relative T0 mode. In Relative T0 mode, dates are displayed as integer
 * working-day offsets from a project anchor date (T0).
 *
 * When isRelativeMode is true:
 * - Planned Start/Finish render as "T0 + 0d", "T0 + 12d", "T0 + 45d"
 * - Duration renders as "12d"
 * - Gantt timescale header switches to integer work-day buckets
 *
 * When ATP (Authority to Proceed) anchor date is set, relative offsets
 * convert to concrete calendar dates using the project's working calendar.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Date formatting mode configuration.
 */
export interface DateFormatConfig {
  /** Whether to display dates as relative T0 offsets */
  isRelativeMode: boolean;
  /** ATP anchor date (nullable). When set, relative offsets convert to calendar dates. */
  atpAnchorDate: string | null;
  /** Relative start day offset for the node (nullable) */
  relativeStartOffset: number | null;
  /** Relative finish day offset for the node (nullable) */
  relativeFinishOffset: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse an ISO date string to a Date object.
 */
function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format a Date as YYYY-MM-DD string.
 */
function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Add working days to a date, skipping weekends.
 */
export function addWorkingDays(dateStr: string | null, days: number): string | null {
  const d = parseDate(dateStr);
  if (!d) return null;

  const sign = days >= 0 ? 1 : -1;
  let remaining = Math.abs(days);

  while (remaining > 0) {
    d.setDate(d.getDate() + sign);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      remaining--;
    }
  }

  return formatDateISO(d);
}

/**
 * Calculate the difference in working days between two dates.
 */
export function workingDayDiff(startStr: string | null, endStr: string | null): number {
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  if (!start || !end) return 0;

  const sign = end >= start ? 1 : -1;
  const current = new Date(start);
  let count = 0;

  while (current < end) {
    current.setDate(current.getDate() + sign);
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) {
      count += sign;
    }
  }

  return count;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Format a date for display, respecting the current T0 mode.
 *
 * In Relative T0 mode with relative offsets available, returns "T0 + Xd".
 * Otherwise returns the standard YYYY-MM-DD format.
 *
 * @param dateStr - ISO date string (YYYY-MM-DD) or null
 * @param config - Date formatting configuration
 * @returns Formatted date string for display
 */
export function formatDateForDisplay(
  dateStr: string | null,
  config: DateFormatConfig,
): string {
  // If no date, return placeholder
  if (!dateStr) return '—';

  // In relative mode with relative offset available, show T0 + Xd
  if (config.isRelativeMode && config.relativeStartOffset !== null) {
    return formatRelativeDay(config.relativeStartOffset);
  }

  // In relative mode with ATP anchor, convert relative to absolute
  if (config.isRelativeMode && config.atpAnchorDate && config.relativeStartOffset !== null) {
    const anchor = parseDate(config.atpAnchorDate);
    if (anchor) {
      const absDate = addWorkingDays(config.atpAnchorDate, config.relativeStartOffset);
      return absDate || formatDateStandard(dateStr);
    }
  }

  // Default: standard calendar date format
  return formatDateStandard(dateStr);
}

/**
 * Format a finish date for display, respecting the current T0 mode.
 *
 * @param dateStr - ISO date string (YYYY-MM-DD) or null
 * @param config - Date formatting configuration
 * @returns Formatted date string for display
 */
export function formatFinishDateForDisplay(
  dateStr: string | null,
  config: DateFormatConfig,
): string {
  // If no date, return placeholder
  if (!dateStr) return '—';

  // In relative mode with relative offset available, show T0 + Xd
  if (config.isRelativeMode && config.relativeFinishOffset !== null) {
    return formatRelativeDay(config.relativeFinishOffset);
  }

  // In relative mode with ATP anchor, convert relative to absolute
  if (config.isRelativeMode && config.atpAnchorDate && config.relativeFinishOffset !== null) {
    const absDate = addWorkingDays(config.atpAnchorDate, config.relativeFinishOffset);
    return absDate || formatDateStandard(dateStr);
  }

  // Default: standard calendar date format
  return formatDateStandard(dateStr);
}

/**
 * Format a duration for display.
 *
 * In relative mode, renders as "12d". In calendar mode, renders as "12 days".
 *
 * @param days - Duration in working days
 * @param isRelativeMode - Whether to use relative T0 formatting
 * @returns Formatted duration string
 */
export function formatDuration(days: number | null, isRelativeMode: boolean = false): string {
  if (days === null || days === undefined) return '—';
  return isRelativeMode ? `${days}d` : `${days} days`;
}

/**
 * Format a relative day offset as "T0 + Xd".
 *
 * @param dayOffset - Integer working-day offset from T0
 * @returns Formatted string like "T0 + 0d", "T0 + 12d", "T0 + 45d"
 */
export function formatRelativeDay(dayOffset: number): string {
  if (dayOffset === 0) return 'T0 + 0d';
  if (dayOffset > 0) return `T0 + ${dayOffset}d`;
  return `T0 - ${Math.abs(dayOffset)}d`;
}

/**
 * Format a standard calendar date for display.
 *
 * @param dateStr - ISO date string (YYYY-MM-DD) or null
 * @returns Formatted date string (YYYY-MM-DD) or '—'
 */
export function formatDateStandard(dateStr: string | null): string {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length >= 3) {
    return `${parts[0]}-${parts[1]}-${parts[2]}`;
  }
  return dateStr;
}

/**
 * Convert a relative day offset to an absolute calendar date using the ATP anchor.
 *
 * @param atpAnchorDate - ATP anchor date string (YYYY-MM-DD)
 * @param dayOffset - Relative working-day offset
 * @returns Absolute calendar date string or null
 */
export function convertRelativeToAbsolute(
  atpAnchorDate: string | null,
  dayOffset: number | null,
): string | null {
  if (!atpAnchorDate || dayOffset === null) return null;
  return addWorkingDays(atpAnchorDate, dayOffset);
}

/**
 * Convert an absolute calendar date to a relative day offset from the ATP anchor.
 *
 * @param atpAnchorDate - ATP anchor date string (YYYY-MM-DD)
 * @param absoluteDate - Absolute calendar date string (YYYY-MM-DD)
 * @returns Relative working-day offset or null
 */
export function convertAbsoluteToRelative(
  atpAnchorDate: string | null,
  absoluteDate: string | null,
): number | null {
  if (!atpAnchorDate || !absoluteDate) return null;
  return workingDayDiff(atpAnchorDate, absoluteDate);
}

/**
 * Generate timescale header labels for the Gantt chart.
 *
 * In relative mode, returns integer work-day buckets: [T0 + 0d], [T0 + 5d], [T0 + 10d], ...
 * In calendar mode, returns standard month/week labels.
 *
 * @param totalDays - Total number of days in the timeline
 * @param isRelativeMode - Whether to use relative T0 formatting
 * @param atpAnchorDate - ATP anchor date (for converting relative to absolute)
 * @param interval - Interval between labels in days (default: 5)
 * @returns Array of { label, dayOffset } objects
 */
export function generateTimescaleLabels(
  totalDays: number,
  isRelativeMode: boolean,
  atpAnchorDate: string | null = null,
  interval: number = 5,
): { label: string; dayOffset: number }[] {
  const labels: { label: string; dayOffset: number }[] = [];

  for (let day = 0; day <= totalDays; day += interval) {
    if (isRelativeMode) {
      labels.push({
        label: formatRelativeDay(day),
        dayOffset: day,
      });
    } else if (atpAnchorDate) {
      const absDate = addWorkingDays(atpAnchorDate, day);
      labels.push({
        label: absDate || formatRelativeDay(day),
        dayOffset: day,
      });
    } else {
      labels.push({
        label: formatRelativeDay(day),
        dayOffset: day,
      });
    }
  }

  return labels;
}
