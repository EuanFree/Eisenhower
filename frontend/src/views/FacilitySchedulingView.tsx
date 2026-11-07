/**
 * FacilitySchedulingView
 *
 * Main view for the physical facility and test rig reservation interface.
 *
 * Composes:
 * - ChamberGanttTimeline: Specialized resource timeline for physical test locations.
 * - ReservationModal: Form for creating new chamber reservations with validation interlocks.
 *
 * Data Flow
 * ---------
 * 1. On mount, fetches all LBS LocationNode records where tier == 'FACILITY' or
 *    is_scif_or_tempest == True.
 * 2. For each facility, fetches the time-phased reservation timeline from
 *    GET /api/v1/facilities/locations/{id}/timeline.
 * 3. Renders the ChamberGanttTimeline with all facility rows.
 * 4. On timeline click, opens the ReservationModal pre-filled with the
 *    clicked facility and suggested start date.
 * 5. On reservation submit, calls POST /api/v1/facilities/reservations and
 *    refreshes the affected facility's timeline.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Filter,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../services/api';
import ChamberGanttTimeline from '../components/facilities/ChamberGanttTimeline';
import ReservationModal from '../components/facilities/ReservationModal';
import type {
  FacilityTimelineResponse,
  ChamberReservationCreate,
} from '../types/facility';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Filter state for facility list */
interface FacilityFilters {
  /** Show only SCIF/TEMPEST accredited facilities */
  scifOnly: boolean;
  /** Show only facilities with expired calibration */
  calibrationExpired: boolean;
  /** Search text for facility code/name */
  searchQuery: string;
}

// ---------------------------------------------------------------------------
// FacilitySchedulingView Component
// ---------------------------------------------------------------------------

/**
 * FacilitySchedulingView — Physical facility and test rig reservation interface.
 */
const FacilitySchedulingView: React.FC = () => {
  const [facilities, setFacilities] = useState<FacilityTimelineResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Timeline date range
  const [startDate, setStartDate] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    return start;
  });
  const [endDate, setEndDate] = useState(() => {
    const end = new Date();
    end.setDate(end.getDate() + 30);
    end.setHours(23, 59, 59, 999);
    return end;
  });

  // Reservation modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState<FacilityTimelineResponse | null>(null);
  const [suggestedStart, setSuggestedStart] = useState<Date | null>(null);

  // Filters
  const [filters, setFilters] = useState<FacilityFilters>({
    scifOnly: false,
    calibrationExpired: false,
    searchQuery: '',
  });

  // Fetch facility timelines
  const fetchFacilities = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch LBS nodes filtered by FACILITY tier or SCIF accreditation
      const response = await api.get('/api/v1/wbs/nodes?tree_type=LBS');
      if (response.status !== 200) return;

      const nodes = response.data.items || [];
      const facilityNodes = nodes.filter(
        (node: Record<string, unknown>) =>
          node.tier === 'FACILITY' || node.is_scif_or_tempest === true,
      );

      // Fetch timeline for each facility
      const timelines: FacilityTimelineResponse[] = [];
      for (const node of facilityNodes) {
        try {
          const timelineResp = await api.get<FacilityTimelineResponse>(
            `/api/v1/facilities/locations/${node.id}/timeline`,
            {
              params: {
                start_date: startDate.toISOString(),
                end_date: endDate.toISOString(),
              },
            },
          );
          if (timelineResp.status === 200) {
            timelines.push(timelineResp.data);
          }
        } catch {
          // Skip facilities that don't have timeline data
        }
      }

      setFacilities(timelines);
    } catch {
      setError('Failed to load facility data. Ensure the backend is running and LBS nodes exist.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  // Initial load
  useEffect(() => {
    fetchFacilities();
  }, [fetchFacilities]);

  // Filtered facilities
  const filteredFacilities = useMemo(() => {
    return facilities.filter((facility) => {
      // SCIF only filter
      if (filters.scifOnly) {
        const isScif = facility.chamber_capabilities?.rf_shielding_db != null;
        if (!isScif) return false;
      }

      // Calibration expired filter
      if (filters.calibrationExpired) {
        if (!facility.calibration_expiry_date) return false;
        const expiry = new Date(facility.calibration_expiry_date);
        if (expiry >= new Date()) return false;
      }

      // Search query
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const matchesCode = facility.location_code.toLowerCase().includes(query);
        const matchesName = facility.location_name.toLowerCase().includes(query);
        if (!matchesCode && !matchesName) return false;
      }

      return true;
    });
  }, [facilities, filters]);

  // Handle timeline click (open reservation modal)
  const handleReserveClick = useCallback((locationId: string, suggestedStart: Date) => {
    const facility = facilities.find((f) => f.location_id === locationId);
    if (facility) {
      setSelectedFacility(facility);
      setSuggestedStart(suggestedStart);
      setModalOpen(true);
    }
  }, [facilities]);

  // Handle reservation submit
  const handleReservationSubmit = useCallback(
    async (reservation: ChamberReservationCreate) => {
      try {
        await api.post('/api/v1/facilities/reservations', reservation);
        setModalOpen(false);
        // Refresh the affected facility's timeline
        await fetchFacilities();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to create reservation';
        console.error('Reservation error:', message);
        setError(message);
      }
    },
    [fetchFacilities],
  );

  // Navigate timeline
  const navigateTimeline = useCallback(
    (direction: 'prev' | 'next') => {
      const days = 30;
      const sign = direction === 'prev' ? -days : days;
      setStartDate((prev) => {
        const newStart = new Date(prev.getTime() + sign * 24 * 60 * 60 * 1000);
        return newStart;
      });
      setEndDate((prev) => {
        const newEnd = new Date(prev.getTime() + sign * 24 * 60 * 60 * 1000);
        return newEnd;
      });
    },
    [],
  );

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalReservations = facilities.reduce(
      (sum, f) => sum + f.reservations.length,
      0,
    );
    const expiredCalibrations = facilities.filter((f) => {
      if (!f.calibration_expiry_date) return false;
      return new Date(f.calibration_expiry_date) < new Date();
    }).length;
    const scifCount = facilities.filter(
      (f) => f.chamber_capabilities?.rf_shielding_db != null,
    ).length;
    return { totalReservations, expiredCalibrations, scifCount };
  }, [facilities]);

  return (
    <div className="flex flex-col h-full bg-bg-ops-base">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-ops-subtle bg-bg-ops-surface">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-sky-400" />
          <h1 className="text-sm font-semibold text-text-ops-primary">
            Facility Scheduling
          </h1>
          <span className="text-xs text-text-ops-muted font-mono">
            {filteredFacilities.length} facilities
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Summary stats */}
          {summaryStats.totalReservations > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-sky-900/30 text-sky-400 border border-sky-800/50">
              <Calendar className="w-3 h-3" />
              {summaryStats.totalReservations} active
            </span>
          )}
          {summaryStats.expiredCalibrations > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-red-900/30 text-red-400 border border-red-800/50">
              <AlertTriangle className="w-3 h-3" />
              {summaryStats.expiredCalibrations} cal expired
            </span>
          )}
          {summaryStats.scifCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-purple-900/30 text-purple-400 border border-purple-800/50">
              <CheckCircle className="w-3 h-3" />
              {summaryStats.scifCount} SCIF
            </span>
          )}
          <button
            type="button"
            onClick={fetchFacilities}
            className={clsx(
              'p-1.5 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors',
              loading && 'animate-spin',
            )}
            title="Refresh facility data"
            disabled={loading}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border-ops-subtle/50 bg-bg-ops-surface/50">
        <Filter className="w-3.5 h-3.5 text-text-ops-muted" />
        <button
          type="button"
          onClick={() => setFilters((f) => ({ ...f, scifOnly: !f.scifOnly }))}
          className={clsx(
            'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
            filters.scifOnly
              ? 'bg-purple-900/30 text-purple-400 border border-purple-800/50'
              : 'text-text-ops-muted hover:text-text-ops-primary border border-transparent',
          )}
        >
          SCIF Only
        </button>
        <button
          type="button"
          onClick={() => setFilters((f) => ({ ...f, calibrationExpired: !f.calibrationExpired }))}
          className={clsx(
            'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
            filters.calibrationExpired
              ? 'bg-red-900/30 text-red-400 border border-red-800/50'
              : 'text-text-ops-muted hover:text-text-ops-primary border border-transparent',
          )}
        >
          Cal Expired
        </button>
        <input
          type="text"
          value={filters.searchQuery}
          onChange={(e) => setFilters((f) => ({ ...f, searchQuery: e.target.value }))}
          className="px-2 py-0.5 rounded text-[10px] font-mono bg-bg-ops-base border border-border-ops-subtle text-text-ops-primary focus:border-sky-500 focus:outline-none w-48"
          placeholder="Search by code or name..."
        />
      </div>

      {/* Main content */}
      {loading ? (
        <div className="flex items-center justify-center h-full text-text-ops-muted">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 animate-spin" />
            <p className="text-sm">Loading facility timelines...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-full text-text-ops-muted">
          <div className="flex flex-col items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-red-400" />
            <p className="text-sm text-red-400">{error}</p>
            <button
              type="button"
              onClick={fetchFacilities}
              className="px-3 py-1.5 rounded text-xs font-medium text-sky-400 hover:bg-sky-900/20 border border-sky-800/40 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      ) : (
        <ChamberGanttTimeline
          facilities={filteredFacilities}
          startDate={startDate}
          endDate={endDate}
          onReserveClick={handleReserveClick}
        />
      )}

      {/* Reservation Modal */}
      <ReservationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        facility={selectedFacility}
        suggestedStart={suggestedStart}
        onSubmit={handleReservationSubmit}
      />
    </div>
  );
};

export default FacilitySchedulingView;
