/**
 * ChamberGanttTimeline Component
 *
 * Specialized resource timeline view dedicated to physical test locations
 * (LocationNode records where tier == 'FACILITY' or is_scif_or_tempest == True).
 *
 * Y-axis: Anechoic Chambers, Vibration Rigs, Thermal Vacuum Chambers, and HIL test bays.
 * X-axis: Time-phased reservation blocks.
 *
 * Features
 * --------
 * - Environmental envelope badges: Max/Min Temperature (°C), RF Shielding (dB), Power Draw (kW)
 * - Buffer Window overlays: Cross-hatched bands before/after booked testing windows for
 *   mandatory chamber warmup, stabilization, and cooldown periods.
 * - Maintenance Overlays: Locked red blocks indicating planned maintenance downtime or
 *   recalibration windows.
 * - Click-to-reserve: Clicking an empty time slot opens the ReservationModal.
 * - Zoom controls: Day/Week/Month timeline scales.
 *
 * @example
 * ```tsx
 * <ChamberGanttTimeline
 *   facilities={facilityRows}
 *   startDate={new Date('2026-01-01')}
 *   endDate={new Date('2026-03-31')}
 *   onReserveClick={(locationId, date) => openReservationModal(locationId, date)}
 * />
 * ```
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Thermometer,
  Radio,
  Zap,
  Calendar,
  Clock,
  Wrench,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useContextMenu } from '../common/contextmenu/ContextMenuProvider';
import type {
  FacilityTimelineResponse,
  ReservationTimelineSlot,
  MaintenanceWindow,
  ChamberCapabilities,
} from '../../types/facility';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Timeline zoom level */
type TimelineZoom = 'day' | 'week' | 'month';

/** Component props */
interface ChamberGanttTimelineProps {
  /** List of facility timeline data */
  facilities: FacilityTimelineResponse[];
  /** Start date of the visible timeline window */
  startDate: Date;
  /** End date of the visible timeline window */
  endDate: Date;
  /** Called when user clicks to create a new reservation */
  onReserveClick: (locationId: string, suggestedStart: Date) => void;
  /** Optional: currently selected facility ID */
  selectedFacilityId?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Row height for each facility row */
const ROW_HEIGHT = 72;
/** Header height */
const HEADER_HEIGHT = 48;
/** Left panel width (facility names + badges) */
const LEFT_PANEL_WIDTH = 320;
/** Pixel width per day at 'day' zoom */
const DAY_WIDTH_DAY = 60;
/** Pixel width per day at 'week' zoom */
const DAY_WIDTH_WEEK = 12;
/** Pixel width per day at 'month' zoom */
const DAY_WIDTH_MONTH = 3;

// ---------------------------------------------------------------------------
// Helper: Format date for display
// ---------------------------------------------------------------------------

/**
 * Format a date as a short string for timeline headers.
 *
 * @param date - Date to format
 * @param zoom - Current zoom level
 * @returns Formatted date string
 */
function formatDateHeader(date: Date, zoom: TimelineZoom): string {
  if (zoom === 'day') {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }
  if (zoom === 'week') {
    const weekNum = getISOWeek(date);
    return `W${weekNum}`;
  }
  return date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

/**
 * Get ISO week number for a date.
 *
 * @param date - Date to compute week number for
 * @returns ISO week number (1-53)
 */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// ---------------------------------------------------------------------------
// Helper: Convert date to pixel X coordinate
// ---------------------------------------------------------------------------

/**
 * Convert a date to its pixel X coordinate within the timeline.
 *
 * @param date - Date to convert
 * @param startDate - Timeline start date
 * @param dayWidth - Pixel width per day
 * @returns Pixel X coordinate
 */
function dateToX(date: Date, startDate: Date, dayWidth: number): number {
  const diffMs = date.getTime() - startDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays * dayWidth;
}

// ---------------------------------------------------------------------------
// Sub-component: Environmental Envelope Badges
// ---------------------------------------------------------------------------

/**
 * Render environmental envelope badges for a chamber's capabilities.
 *
 * @param props - Component props
 */
const CapabilityBadges: React.FC<{ capabilities: ChamberCapabilities | null }> = ({
  capabilities,
}) => {
  if (!capabilities) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {capabilities.temp_min_c != null && capabilities.temp_max_c != null && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-900/30 text-red-400 border border-red-800/50"
          title={`Temperature range: ${capabilities.temp_min_c}°C to ${capabilities.temp_max_c}°C`}
        >
          <Thermometer className="w-3 h-3" />
          {capabilities.temp_min_c}°/{capabilities.temp_max_c}°C
        </span>
      )}
      {capabilities.rf_shielding_db != null && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-900/30 text-purple-400 border border-purple-800/50"
          title={`RF shielding: ${capabilities.rf_shielding_db} dB`}
        >
          <Radio className="w-3 h-3" />
          {capabilities.rf_shielding_db} dB
        </span>
      )}
      {capabilities.max_power_kw != null && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-900/30 text-amber-400 border border-amber-800/50"
          title={`Max power draw: ${capabilities.max_power_kw} kW`}
        >
          <Zap className="w-3 h-3" />
          {capabilities.max_power_kw} kW
        </span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: Facility Info Row
// ---------------------------------------------------------------------------

/**
 * Render the left-panel facility info row (name, code, badges).
 *
 * @param props - Component props
 */
const FacilityInfoRow: React.FC<{
  facility: FacilityTimelineResponse;
  isSelected: boolean;
}> = ({ facility, isSelected }) => {
  const calibrationExpiry = facility.calibration_expiry_date
    ? new Date(facility.calibration_expiry_date)
    : null;
  const isCalibrationExpired = calibrationExpiry
    ? calibrationExpiry < new Date()
    : false;
  const daysToExpiry = calibrationExpiry
    ? Math.ceil((calibrationExpiry.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div
      className={clsx(
        'flex flex-col justify-center px-3 border-r border-border-ops-subtle',
        'h-full overflow-hidden',
        isSelected && 'bg-bg-ops-overlay',
      )}
      style={{ width: LEFT_PANEL_WIDTH, height: ROW_HEIGHT }}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono font-semibold text-text-ops-primary">
          {facility.location_code}
        </span>
        {isCalibrationExpired && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-600/30 text-red-400 border border-red-600/50">
            <AlertTriangle className="w-3 h-3" />
            CAL EXPIRED
          </span>
        )}
        {daysToExpiry != null && daysToExpiry > 0 && daysToExpiry <= 30 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-600/30 text-amber-400 border border-amber-600/50">
            <Clock className="w-3 h-3" />
            CAL {daysToExpiry}d
          </span>
        )}
      </div>
      <span className="text-xs text-text-ops-muted truncate" title={facility.location_name}>
        {facility.location_name}
      </span>
      <CapabilityBadges capabilities={facility.chamber_capabilities} />
      {facility.warmup_cooldown_hours > 0 && (
        <span className="text-[9px] text-text-ops-muted mt-0.5">
          ±{facility.warmup_cooldown_hours}h buffer
        </span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: Timeline Block
// ---------------------------------------------------------------------------

/**
 * Render a single reservation or buffer block on the timeline.
 *
 * @param props - Component props
 */
const TimelineBlock: React.FC<{
  slot: ReservationTimelineSlot;
  x: number;
  width: number;
  y: number;
  isBuffer?: boolean;
}> = ({ slot, x, width, y, isBuffer = false }) => {
  if (width < 2) return null;

  return (
    <div
      className={clsx(
        'absolute top-1 rounded-sm cursor-pointer transition-opacity hover:opacity-80',
        isBuffer
          ? 'bg-amber-500/10 border border-amber-500/30'
          : 'bg-sky-500/20 border border-sky-500/40',
      )}
      style={{
        left: `${x}px`,
        width: `${Math.max(width, 2)}px`,
        top: isBuffer ? `${ROW_HEIGHT - 16}px` : '4px',
        height: isBuffer ? '12px' : `${ROW_HEIGHT - 20}px`,
      }}
      title={
        isBuffer
          ? `Buffer: ${slot.portfolio_node_code} (${slot.test_operator_name || 'Unassigned'})`
          : `${slot.portfolio_node_code}: ${slot.portfolio_node_name}\nOperator: ${slot.test_operator_name || 'Unassigned'}\n${slot.reserved_start} → ${slot.reserved_end}`
      }
    >
      {!isBuffer && width > 20 && (
        <div className="px-1 text-[9px] font-mono text-sky-300 truncate">
          {slot.portfolio_node_code}
        </div>
      )}
      {isBuffer && width > 30 && (
        <div className="px-1 text-[8px] font-mono text-amber-400/60 truncate">
          buffer
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: Maintenance Block
// ---------------------------------------------------------------------------

/**
 * Render a locked red maintenance downtime block on the timeline.
 *
 * @param props - Component props
 */
const MaintenanceBlock: React.FC<{
  window: MaintenanceWindow;
  x: number;
  width: number;
  y: number;
}> = ({ window: maint, x, width, y }) => {
  if (width < 2) return null;

  const typeLabel =
    maint.maintenance_type === 'SCHEDULED_RECALIBRATION'
      ? 'Recalibration'
      : maint.maintenance_type === 'ANNUAL_OVERHAUL'
        ? 'Annual Overhaul'
        : 'Repair';

  return (
    <div
      className="absolute top-1 rounded-sm bg-red-600/30 border border-red-600/60 cursor-not-allowed"
      style={{
        left: `${x}px`,
        width: `${Math.max(width, 2)}px`,
        top: '4px',
        height: `${ROW_HEIGHT - 20}px`,
      }}
      title={`🔒 ${typeLabel}: ${maint.work_order_reference}\nTechnician: ${maint.technician_name}\n${maint.downtime_start} → ${maint.downtime_end}`}
    >
      {width > 40 && (
        <div className="flex items-center gap-1 px-1">
          <Wrench className="w-3 h-3 text-red-400" />
          <span className="text-[9px] font-mono text-red-300 truncate">
            {maint.work_order_reference}
          </span>
        </div>
      )}
      {width <= 40 && (
        <div className="flex items-center justify-center w-full">
          <Wrench className="w-3 h-3 text-red-400" />
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-component: Cross-hatch SVG pattern for buffer zones
// ---------------------------------------------------------------------------

/**
 * Inject SVG cross-hatch pattern for buffer window visualization.
 * Singleton pattern to avoid duplicate definitions.
 */
const BufferPatternDefs: React.FC = () => {
  const [injected, setInjected] = useState(false);

  if (!injected) {
    setInjected(true);
    return (
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <pattern
            id="bufferCrossHatch"
            patternUnits="userSpaceOnUse"
            width="6"
            height="6"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke="rgba(245, 158, 11, 0.2)"
              strokeWidth="1"
            />
          </pattern>
        </defs>
      </svg>
    );
  }
  return null;
};

// ---------------------------------------------------------------------------
// Main Component: ChamberGanttTimeline
// ---------------------------------------------------------------------------

/**
 * ChamberGanttTimeline — Specialized resource timeline for physical test locations.
 *
 * Renders a horizontal timeline with facility rows on the Y-axis and time-phased
 * reservation blocks on the X-axis. Includes environmental envelope badges,
 * buffer window overlays with cross-hatching, and locked red maintenance blocks.
 *
 * @param props - Component props
 */
const ChamberGanttTimeline: React.FC<ChamberGanttTimelineProps> = ({
  facilities,
  startDate,
  endDate,
  onReserveClick,
  selectedFacilityId,
}) => {
  const { openContextMenu } = useContextMenu();
  const [zoom, setZoom] = useState<TimelineZoom>('week');

  const dayWidth = zoom === 'day' ? DAY_WIDTH_DAY : zoom === 'week' ? DAY_WIDTH_WEEK : DAY_WIDTH_MONTH;

  // Calculate total timeline width
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const timelineWidth = totalDays * dayWidth;

  // Generate timeline header ticks
  const ticks = useMemo(() => {
    const tickInterval = zoom === 'day' ? 1 : zoom === 'week' ? 7 : 30;
    const ticks: { date: Date; x: number; label: string }[] = [];
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);

    while (current <= endDate) {
      ticks.push({
        date: new Date(current),
        x: dateToX(current, startDate, dayWidth),
        label: formatDateHeader(current, zoom),
      });
      current.setDate(current.getDate() + tickInterval);
    }
    return ticks;
  }, [startDate, endDate, zoom, dayWidth]);

  // Current date marker position
  const nowX = dateToX(new Date(), startDate, dayWidth);

  // Navigate timeline
  const navigateTimeline = useCallback(
    (direction: 'prev' | 'next') => {
      const days = zoom === 'day' ? 7 : zoom === 'week' ? 30 : 90;
      const sign = direction === 'prev' ? -days : days;
      const newStart = new Date(startDate.getTime() + sign * 24 * 60 * 60 * 1000);
      const newEnd = new Date(endDate.getTime() + sign * 24 * 60 * 60 * 1000);
      // Parent component should handle date changes; for now, just log
      console.log(`Navigate timeline: ${direction} (${days} days)`);
    },
    [startDate, endDate, zoom],
  );

  // Handle click on empty timeline area
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, facilityIndex: number) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickDate = new Date(startDate.getTime() + (clickX / dayWidth) * 24 * 60 * 60 * 1000);
      clickDate.setHours(0, 0, 0, 0);
      onReserveClick(facilities[facilityIndex].location_id, clickDate);
    },
    [startDate, dayWidth, facilities, onReserveClick],
  );

  if (facilities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-ops-muted">
        <Calendar className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-sm">No test facilities found.</p>
        <p className="text-xs mt-1">Facilities with tier=&apos;FACILITY&apos; or SCIF accreditation will appear here.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-bg-ops-base overflow-hidden">
      <BufferPatternDefs />

      {/* Zoom controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-ops-subtle bg-bg-ops-surface">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigateTimeline('prev')}
            className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary"
            title="Previous period"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => navigateTimeline('next')}
            className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary"
            title="Next period"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-xs text-text-ops-muted font-mono">
            {startDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} — {endDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {(['day', 'week', 'month'] as TimelineZoom[]).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              className={clsx(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                zoom === z
                  ? 'bg-bg-ops-overlay text-text-ops-primary'
                  : 'text-text-ops-muted hover:text-text-ops-primary',
              )}
            >
              {z.charAt(0).toUpperCase() + z.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Facility info */}
        <div
          className="flex-shrink-0 border-r border-border-ops-subtle bg-bg-ops-surface overflow-y-auto"
          style={{ width: LEFT_PANEL_WIDTH }}
        >
          {/* Header spacer */}
          <div
            className="flex items-center px-3 border-b border-border-ops-subtle bg-bg-ops-surface"
            style={{ height: HEADER_HEIGHT }}
          >
            <span className="text-xs font-semibold text-text-ops-muted uppercase tracking-wider">
              Test Facilities
            </span>
          </div>
          {facilities.map((facility) => (
            <FacilityInfoRow
              key={facility.location_id}
              facility={facility}
              isSelected={selectedFacilityId === facility.location_id}
            />
          ))}
        </div>

        {/* Right panel: Timeline */}
        <div className="flex-1 overflow-auto relative">
          {/* Timeline header */}
          <div
            className="sticky top-0 z-10 border-b border-border-ops-subtle bg-bg-ops-surface"
            style={{ height: HEADER_HEIGHT, width: `${timelineWidth}px` }}
          >
            {ticks.map((tick) => (
              <div
                key={tick.date.toISOString()}
                className="absolute top-0 flex flex-col items-center justify-center h-full border-l border-border-ops-subtle/50"
                style={{ left: `${tick.x}px`, width: `${dayWidth}px` }}
              >
                <span className="text-[10px] font-mono text-text-ops-muted">{tick.label}</span>
              </div>
            ))}
          </div>

          {/* Timeline rows */}
          <div style={{ width: `${timelineWidth}px` }}>
            {facilities.map((facility, facilityIndex) => (
              <div
                key={facility.location_id}
                className="relative border-b border-border-ops-subtle/30"
                style={{ height: ROW_HEIGHT }}
              >
                {/* Clickable background for new reservations */}
                <div
                  className="absolute inset-0 cursor-pointer hover:bg-sky-500/5"
                  onClick={(e) => handleTimelineClick(e, facilityIndex)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openContextMenu(e, 'CHAMBER', {
                      nodeId: facility.location_id,
                      code: facility.location_code,
                      name: facility.location_name,
                      indentLevel: 0,
                      percentComplete: 0,
                      isBaselineLocked: false,
                      hasCamPrivileges: true,
                      securityClassification: (facility as any).security_classification,
                      isMasked: false,
                    });
                  }}
                  title={`Click to reserve ${facility.location_code}`}
                />

                {/* Current time marker */}
                {nowX > 0 && nowX < timelineWidth && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-red-500/60 z-10 pointer-events-none"
                    style={{ left: `${nowX}px` }}
                  />
                )}

                {/* Buffer slots (cross-hatched) */}
                {facility.buffer_slots.map((slot) => {
                  const slotStart = new Date(slot.buffer_start);
                  const slotEnd = new Date(slot.buffer_end);
                  const x = dateToX(slotStart, startDate, dayWidth);
                  const width = ((slotEnd.getTime() - slotStart.getTime()) / (1000 * 60 * 60 * 24)) * dayWidth;
                  return (
                    <TimelineBlock
                      key={`${slot.reservation_id}-buffer`}
                      slot={slot}
                      x={x}
                      width={width}
                      y={facilityIndex * ROW_HEIGHT}
                      isBuffer
                    />
                  );
                })}

                {/* Reservation slots */}
                {facility.reservations.map((slot) => {
                  const slotStart = new Date(slot.reserved_start);
                  const slotEnd = new Date(slot.reserved_end);
                  const x = dateToX(slotStart, startDate, dayWidth);
                  const width = ((slotEnd.getTime() - slotStart.getTime()) / (1000 * 60 * 60 * 24)) * dayWidth;
                  return (
                    <TimelineBlock
                      key={slot.reservation_id}
                      slot={slot}
                      x={x}
                      width={width}
                      y={facilityIndex * ROW_HEIGHT}
                    />
                  );
                })}

                {/* Maintenance windows */}
                {facility.maintenance_windows?.map((maint) => {
                  const maintStart = new Date(maint.downtime_start);
                  const maintEnd = new Date(maint.downtime_end);
                  const x = dateToX(maintStart, startDate, dayWidth);
                  const width = ((maintEnd.getTime() - maintStart.getTime()) / (1000 * 60 * 60 * 24)) * dayWidth;
                  return (
                    <MaintenanceBlock
                      key={maint.id}
                      window={maint}
                      x={x}
                      width={width}
                      y={facilityIndex * ROW_HEIGHT}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-3 py-1.5 border-t border-border-ops-subtle bg-bg-ops-surface text-[10px] text-text-ops-muted">
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-sm bg-sky-500/20 border border-sky-500/40" />
          <span>Reservation</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-sm bg-amber-500/10 border border-amber-500/30" />
          <span>Buffer Zone</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 rounded-sm bg-red-600/30 border border-red-600/60" />
          <span>Maintenance</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-px h-3 bg-red-500/60" />
          <span>Now</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Plus className="w-3 h-3" />
          <span>Click empty slot to reserve</span>
        </div>
      </div>
    </div>
  );
};

export default ChamberGanttTimeline;
