/**
 * Dependency Text Parsing & Formatting
 *
 * Converts between the free-text Predecessors / Successors column format
 * (as used in Microsoft Project / Primavera P6, e.g. "1.2FS+2d, 1.3SS")
 * and the structured `ScheduleDependencyLink` records used by the schedule
 * store and backend API.
 *
 * Supported token grammar (comma or semicolon separated):
 *
 *   <code>[<type>][<+/-><lagDays>[d]]
 *
 * Examples:
 *   "1.2"          -> code=1.2,  type=FS (default), lag=0
 *   "1.2FS"        -> code=1.2,  type=FS, lag=0
 *   "1.2FS+2d"     -> code=1.2,  type=FS, lag=2
 *   "1.2SS-1"      -> code=1.2,  type=SS, lag=-1
 *   "1.2FF+3d, 1.4SF-2d" -> two tokens
 */

import { ScheduleDependencyLink } from '../stores/useScheduleStore';

export type DependencyTypeCode = 'FS' | 'SS' | 'FF' | 'SF';

export interface ParsedDependencyToken {
  /** Raw task code as typed by the user (e.g. "1.2") */
  code: string;
  type: DependencyTypeCode;
  lagDays: number;
}

const TOKEN_PATTERN = /^\s*([A-Za-z0-9_.\-]+?)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)\s*d?\s*$/i;
const TOKEN_PATTERN_NO_LAG = /^\s*([A-Za-z0-9_.\-]+?)\s*(FS|SS|FF|SF)?\s*$/i;

/**
 * Parse a free-text predecessors/successors cell value into a list of tokens.
 * Unparseable or empty tokens are silently skipped.
 */
export function parseDependencyText(text: string): ParsedDependencyToken[] {
  if (!text || !text.trim()) return [];

  return text
    .split(/[,;]/)
    .map((raw) => raw.trim())
    .filter((raw) => raw.length > 0)
    .map((raw) => {
      let match = raw.match(TOKEN_PATTERN);
      if (match) {
        const [, code, type, lagStr] = match;
        return {
          code: code.trim(),
          type: (type ? (type.toUpperCase() as DependencyTypeCode) : 'FS'),
          lagDays: parseInt(lagStr.replace(/\s+/g, ''), 10) || 0,
        };
      }
      match = raw.match(TOKEN_PATTERN_NO_LAG);
      if (match) {
        const [, code, type] = match;
        return {
          code: code.trim(),
          type: (type ? (type.toUpperCase() as DependencyTypeCode) : 'FS'),
          lagDays: 0,
        };
      }
      return null;
    })
    .filter((t): t is ParsedDependencyToken => t !== null && t.code.length > 0);
}

/**
 * Format a single dependency token back to its text representation,
 * e.g. { code: '1.2', type: 'SS', lagDays: 2 } -> "1.2SS+2d"
 */
export function formatDependencyToken(code: string, type: DependencyTypeCode, lagDays: number): string {
  const lagPart = lagDays > 0 ? `+${lagDays}d` : lagDays < 0 ? `${lagDays}d` : '';
  // Omit the default FS type only when there's no lag, to keep display compact
  // but unambiguous (consistent with MS Project's convention of showing type
  // only when it deviates from FS or lag is present).
  const typePart = type !== 'FS' || lagPart ? type : '';
  return `${code}${typePart}${lagPart}`;
}

/**
 * Build the display text for a node's predecessors or successors column
 * from the full list of dependency links and the set of rows (for code lookup).
 */
export function formatDependencyList(
  nodeId: string,
  dependencies: ScheduleDependencyLink[],
  idToCode: Map<string, string>,
  direction: 'predecessors' | 'successors',
): string {
  const relevant = dependencies.filter((d) =>
    direction === 'predecessors' ? d.successor_id === nodeId : d.predecessor_id === nodeId,
  );

  return relevant
    .map((d) => {
      const otherId = direction === 'predecessors' ? d.predecessor_id : d.successor_id;
      const code = idToCode.get(otherId) || otherId;
      return formatDependencyToken(code, d.dependency_type, d.lag_days || 0);
    })
    .join(', ');
}
