/**
 * Duration Text Parsing & Formatting
 *
 * Converts between the free-text Duration column shorthand (as used in
 * Microsoft Project / Primavera P6, e.g. "3d", "2w", "8h", "1m") and a
 * fractional number of calendar days used internally for scheduling math.
 *
 * Supported units (case-insensitive):
 *   h — hours   (1d = 8h, i.e. a standard 8-hour work day)
 *   d — days    (default unit when none specified)
 *   w — weeks   (1w = 5d, i.e. a standard 5-day work week)
 *   m — months  (1m = 20d, i.e. a standard 20-workday month)
 *
 * Examples:
 *   "3d"   -> 3
 *   "8h"   -> 1
 *   "2w"   -> 10
 *   "1m"   -> 20
 *   "4"    -> 4 (bare number defaults to days)
 */

const HOURS_PER_DAY = 8;
const DAYS_PER_WEEK = 5;
const DAYS_PER_MONTH = 20;

const DURATION_PATTERN = /^\s*(\d+(?:\.\d+)?)\s*(h|d|w|m)?\s*$/i;

/**
 * Parse a free-text duration string (e.g. "2w") into a number of days.
 * Returns `null` if the text cannot be parsed.
 */
export function parseDurationToDays(text: string): number | null {
  if (!text || !text.trim()) return null;

  const match = text.match(DURATION_PATTERN);
  if (!match) return null;

  const [, numStr, unitRaw] = match;
  const num = parseFloat(numStr);
  if (isNaN(num)) return null;

  const unit = (unitRaw || 'd').toLowerCase();
  switch (unit) {
    case 'h':
      return num / HOURS_PER_DAY;
    case 'w':
      return num * DAYS_PER_WEEK;
    case 'm':
      return num * DAYS_PER_MONTH;
    case 'd':
    default:
      return num;
  }
}

/**
 * Format a number of days back into the most readable shorthand unit,
 * e.g. 10 -> "2w", 1 -> "1d", 0.5 -> "4h".
 */
export function formatDaysToDuration(days: number): string {
  if (days == null || isNaN(days)) return '';

  if (Number.isInteger(days / DAYS_PER_MONTH) && days >= DAYS_PER_MONTH) {
    return `${days / DAYS_PER_MONTH}m`;
  }
  if (Number.isInteger(days / DAYS_PER_WEEK) && days >= DAYS_PER_WEEK) {
    return `${days / DAYS_PER_WEEK}w`;
  }
  if (days < 1 && days > 0) {
    const hours = Math.round(days * HOURS_PER_DAY * 10) / 10;
    return `${hours}h`;
  }
  // Trim trailing .0
  const rounded = Math.round(days * 100) / 100;
  return `${rounded}d`;
}
