/**
 * Daily Cockpit View
 *
 * The individual contributor's operational landing page for the Eisenhower
 * Portfolio Manager. This is the first view a user sees after login, providing
 * an at-a-glance overview of their daily workload and quick actions.
 *
 * Layout
 * ------
 * 0. Emergency Stoppage Banner — real-time red banner for critical stoppages
 *    escalated under delegated authority (WebSocket-driven)
 * 1. Quick Metrics Strip — 4 KPI cards (sprint load, critical path, due-48h, blockers)
 * 2. Two-column layout:
 *    - Left (wider): Focus Queue — ranked task cards with inline actions
 *    - Right (narrower): Delegated Stoppages priority card + Claimable Queue + Weekly Timesheet
 * 3. Blocker Modal — overlay for creating NodeBlockers
 * 4. Delegate Stoppage Drawer — side drawer for resolving escalated stoppages
 *
 * Data Sources
 * ------------
 * - GET /api/v1/cockpit/summary → Metrics strip
 * - GET /api/v1/cockpit/focus-queue → Ranked task list
 * - GET /api/v1/cockpit/claimable-tasks → Generic placeholder tasks
 * - GET /api/v1/timesheets/oracle/prepopulate → Weekly timesheet data
 * - WebSocket CRITICAL_STOPPAGE_ESCALATED → Emergency banner + delegated stoppages
 *
 * Auto-refresh
 * ------------
 * Data is fetched on mount and can be manually refreshed after actions
 * (progress update, claim, blocker creation) via the onRefresh callback.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  RefreshCw,
  AlertOctagon,
  PanelRightOpen,
  ShieldAlert,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../services/api';
import {
  CockpitSummaryResponse,
  FocusQueueTask,
  ClaimableTask,
  WeeklyTimesheetSnapshot,
  FocusQueueResponse,
  ClaimableTasksResponse,
} from '../types/cockpit';
import CockpitMetricsStrip from '../components/cockpit/CockpitMetricsStrip';
import FocusQueue from '../components/cockpit/FocusQueue';
import ClaimableQueue from '../components/cockpit/ClaimableQueue';
import WeeklyMicroTimesheet from '../components/cockpit/WeeklyMicroTimesheet';
import BlockerModal from '../components/cockpit/BlockerModal';
import EmergencyStoppageBanner, {
  type CriticalStoppageEvent,
} from '../components/common/EmergencyStoppageBanner';
import DelegateStoppageDrawer from '../components/cockpit/DelegateStoppageDrawer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyCockpitViewProps {
  /** Optional weekly capacity override (default 37.5h) */
  weeklyCapacityHours?: number;
}

// ---------------------------------------------------------------------------
// Helper: Build weekly timesheet snapshot from prepopulate data
// ---------------------------------------------------------------------------

/**
 * Constructs a WeeklyTimesheetSnapshot from the Oracle prepopulate API response.
 * The prepopulate endpoint returns scheduled hours per day; we merge them into
 * a 7-day grid starting from Monday.
 */
function buildWeeklySnapshot(
  prepopulateData: any,
): WeeklyTimesheetSnapshot | null {
  if (!prepopulateData) return null;

  const today = new Date();
  // Find Monday of the current week
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ...
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Days since Monday
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  monday.setHours(0, 0, 0, 0);

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const days = [];

  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const isWeekend = i >= 5;
    const isToday = dateStr === today.toISOString().split('T')[0];

    // Look up scheduled hours from prepopulate data
    const dayEntry = prepopulateData.days?.find(
      (d: any) => d.date === dateStr,
    );

    days.push({
      date: dateStr,
      day_name: dayNames[i],
      is_weekend: isWeekend,
      is_today: isToday,
      scheduled_hours: dayEntry?.scheduled_hours || 0,
      logged_hours: dayEntry?.logged_hours || 0,
      task_code: dayEntry?.task_code || null,
      task_name: dayEntry?.task_name || null,
    });
  }

  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const totalScheduled = days.reduce((sum, d) => sum + d.scheduled_hours, 0);

  return {
    week_start: monday.toISOString().split('T')[0],
    week_end: sunday.toISOString().split('T')[0],
    days,
    total_scheduled: totalScheduled,
    total_logged: days.reduce((sum, d) => sum + d.logged_hours, 0),
    weekly_capacity_hours: 37.5,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DailyCockpitView: React.FC<DailyCockpitViewProps> = ({
  weeklyCapacityHours = 37.5,
}) => {
  // Data state
  const [summary, setSummary] = useState<CockpitSummaryResponse | null>(null);
  const [focusTasks, setFocusTasks] = useState<FocusQueueTask[]>([]);
  const [claimableTasks, setClaimableTasks] = useState<ClaimableTask[]>([]);
  const [timesheet, setTimesheet] = useState<WeeklyTimesheetSnapshot | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [blockerTask, setBlockerTask] = useState<FocusQueueTask | null>(null);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);

  // -----------------------------------------------------------------------
  // Emergency Stoppage state
  // -----------------------------------------------------------------------

  /** Active delegated stoppages accumulated from WebSocket events */
  const [delegatedStoppages, setDelegatedStoppages] = useState<CriticalStoppageEvent[]>([]);
  const [drawerEvent, setDrawerEvent] = useState<CriticalStoppageEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  /** Callback registry for EmergencyStoppageBanner event subscription */
  const eventCallbacksRef = useRef<Set<(event: CriticalStoppageEvent) => void>>(new Set());

  /**
   * Handle incoming CRITICAL_STOPPAGE_ESCALATED WebSocket events.
   * The banner component registers a callback; we also collect stoppages
   * for the priority card.
   */
  const handleStoppageEvent = useCallback((event: CriticalStoppageEvent) => {
    // Notify all registered callbacks (e.g., the banner)
    for (const cb of eventCallbacksRef.current) {
      cb(event);
    }
    // Add to delegated stoppages list for the priority card
    setDelegatedStoppages((prev) => {
      // Avoid duplicates by blocker_id
      if (prev.some((s) => s.blocker_id === event.blocker_id)) {
        return prev;
      }
      return [event, ...prev];
    });
  }, []);

  /** Register a callback for stoppage events (used by EmergencyStoppageBanner) */
  const registerEventCallback = useCallback(
    (cb: (event: CriticalStoppageEvent) => void) => {
      eventCallbacksRef.current.add(cb);
    },
    [],
  );

  /** Unregister a callback */
  const unregisterEventCallback = useCallback(
    (cb: (event: CriticalStoppageEvent) => void) => {
      eventCallbacksRef.current.delete(cb);
    },
    [],
  );

  /** Simulate incoming WebSocket event for demo purposes.
   * In production, this is triggered by the WebSocket handler in useProjectWebSocket. */
  useEffect(() => {
    // Listen for custom dispatch events from the WebSocket layer
    const handler = (e: CustomEvent) => {
      if (e.detail?.event === 'CRITICAL_STOPPAGE_ESCALATED') {
        handleStoppageEvent(e.detail as CriticalStoppageEvent);
      }
    };
    window.addEventListener(
      'stoppage-escalated' as any,
      handler as EventListener,
    );
    return () =>
      window.removeEventListener(
        'stoppage-escalated' as any,
        handler as EventListener,
      );
  }, [handleStoppageEvent]);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    try {
      // Fetch all cockpit data in parallel
      const [summaryResp, focusResp, claimableResp, timesheetResp] =
        await Promise.all([
          api.get<CockpitSummaryResponse>('/cockpit/summary').catch(() => null),
          api.get<FocusQueueResponse>('/cockpit/focus-queue').catch(() => null),
          api.get<ClaimableTasksResponse>('/cockpit/claimable-tasks').catch(() => null),
          api.get('/timesheets/oracle/prepopulate').catch(() => null),
        ]);

      if (summaryResp) setSummary(summaryResp.data);
      if (focusResp) setFocusTasks(focusResp.data?.tasks || []);
      if (claimableResp) setClaimableTasks(claimableResp.data?.tasks || []);
      if (timesheetResp) setTimesheet(buildWeeklySnapshot(timesheetResp.data));
    } catch {
      // Silently fail — API interceptor handles 401
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // -----------------------------------------------------------------------
  // Refresh handler
  // -----------------------------------------------------------------------

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData().then(() => setRefreshing(false));
  }, [fetchData]);

  // -----------------------------------------------------------------------
  // Blocker modal handlers
  // -----------------------------------------------------------------------

  const handleFlagBlocker = useCallback((task: FocusQueueTask) => {
    setBlockerTask(task);
    setBlockerModalOpen(true);
  }, []);

  const handleBlockerClose = useCallback(() => {
    setBlockerModalOpen(false);
    setBlockerTask(null);
  }, []);

  const handleBlockerCreated = useCallback(() => {
    handleRefresh();
  }, [handleRefresh]);

  // -----------------------------------------------------------------------
  // Stoppage drawer handlers
  // -----------------------------------------------------------------------

  const handleReviewStoppage = useCallback((event: CriticalStoppageEvent) => {
    setDrawerEvent(event);
    setDrawerOpen(true);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false);
    setDrawerEvent(null);
  }, []);

  const handleStoppageResolved = useCallback(
    (blockerId: string) => {
      setDelegatedStoppages((prev) =>
        prev.filter((s) => s.blocker_id !== blockerId),
      );
      handleRefresh();
    },
    [handleRefresh],
  );

  const handleBannerDismiss = useCallback(
    (event: CriticalStoppageEvent) => {
      // Silent dismissal — remove from priority card after a delay
      setTimeout(() => {
        setDelegatedStoppages((prev) =>
          prev.filter((s) => s.blocker_id !== event.blocker_id),
        );
      }, 5000);
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24 text-text-ops-muted">
        <RefreshCw size={32} className="mb-3 animate-spin opacity-40" />
        <span className="text-sm italic">Loading cockpit data...</span>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* 0. Emergency Stoppage Banner — fixed at top */}
      <EmergencyStoppageBanner
        onReview={handleReviewStoppage}
        onDismiss={handleBannerDismiss}
        onEventRegistered={registerEventCallback}
        onEventUnregistered={unregisterEventCallback}
      />

      <div className="flex flex-col h-full p-6">
        {/* View header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="text-sky-400">
              <LayoutDashboard size={20} />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-text-ops-primary">
                My Daily Cockpit
              </h1>
              <p className="text-xs text-text-ops-muted">
                Individual contributor operational landing page
              </p>
            </div>
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={clsx(
              'flex items-center gap-2 px-3 py-1.5 text-xs rounded border transition-colors',
              'border-border-ops-subtle text-text-ops-muted',
              'hover:bg-bg-ops-overlay hover:text-text-ops-primary',
              'disabled:opacity-30 disabled:cursor-not-allowed',
            )}
            title="Refresh cockpit data"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* 1. Quick Metrics Strip */}
        <CockpitMetricsStrip
          summary={summary}
          weeklyCapacityHours={weeklyCapacityHours}
        />

        {/* 2. Two-column layout */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Focus Queue (2/3 width) */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <FocusQueue
              tasks={focusTasks}
              onRefresh={handleRefresh}
              onFlagBlocker={handleFlagBlocker}
            />
          </div>

          {/* Right: Delegated Stoppages + Claimable Queue + Timesheet (1/3 width) */}
          <div className="flex flex-col gap-6">
            {/* Delegated Stoppages Priority Card */}
            {delegatedStoppages.length > 0 && (
              <div
                className={clsx(
                  'rounded-xl border-2 overflow-hidden',
                  'border-red-500/50 bg-red-950/20',
                )}
              >
                <div className="flex items-center gap-2 px-3 py-2 border-b border-red-500/30 bg-red-950/30">
                  <ShieldAlert size={14} className="text-red-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-red-400">
                    Active Delegated Stoppages
                  </h3>
                  <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-500 text-white">
                    {delegatedStoppages.length}
                  </span>
                </div>
                <div className="flex flex-col">
                  {delegatedStoppages.map((stoppage) => (
                    <button
                      key={stoppage.blocker_id}
                      onClick={() => handleReviewStoppage(stoppage)}
                      className={clsx(
                        'flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                        'hover:bg-red-900/20',
                        'border-b border-red-500/20 last:border-b-0',
                      )}
                    >
                      <AlertOctagon size={14} className="text-red-400 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-text-ops-primary truncate">
                          {stoppage.task_code} — {stoppage.task_name}
                        </div>
                        <div className="text-[10px] text-text-ops-muted truncate">
                          From {stoppage.delegator_upn} · {stoppage.operational_impact_hours}h impact
                        </div>
                      </div>
                      <PanelRightOpen size={12} className="text-text-ops-muted flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <ClaimableQueue
              tasks={claimableTasks}
              onClaimed={handleRefresh}
            />

            <div className="border-t border-border-ops-subtle pt-6">
              <WeeklyMicroTimesheet
                snapshot={timesheet}
                onSubmitted={handleRefresh}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Blocker Modal */}
      <BlockerModal
        task={blockerTask}
        isOpen={blockerModalOpen}
        onClose={handleBlockerClose}
        onCreated={handleBlockerCreated}
      />

      {/* 4. Delegate Stoppage Resolution Drawer */}
      <DelegateStoppageDrawer
        event={drawerEvent}
        isOpen={drawerOpen}
        onClose={handleDrawerClose}
        onResolved={handleStoppageResolved}
      />
    </div>
  );
};

export default DailyCockpitView;
