/**
 * Dashboard View
 *
 * Main dashboard view that wraps the toolbar, widget palette, and canvas.
 * Handles dashboard creation, loading, saving, and auto-refresh.
 */

import React, { useEffect, useRef } from 'react';
import { useDashboardStore } from '../stores/useDashboardStore';
import DashboardToolbar from '../components/dashboard/DashboardToolbar';
import WidgetPalette from '../components/dashboard/WidgetPalette';
import DashboardCanvas from '../components/dashboard/DashboardCanvas';

const REFRESH_INTERVAL = 30_000; // 30 seconds

const DashboardView: React.FC = () => {
  const {
    currentDashboard,
    dashboards,
    loadDashboards,
    loadDashboard,
    createDashboard,
    loadWidgetData,
  } = useDashboardStore();

  const initialized = useRef(false);

  // Load dashboards on mount
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      loadDashboards();
    }
  }, [loadDashboards]);

  // Auto-refresh widget data
  useEffect(() => {
    if (!currentDashboard) return;
    const timer = setInterval(() => {
      loadWidgetData();
    }, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [currentDashboard, loadWidgetData]);

  // Auto-load first dashboard or create one
  useEffect(() => {
    if (dashboards.length && !currentDashboard) {
      loadDashboard(dashboards[0].id);
    }
  }, [dashboards, currentDashboard, loadDashboard]);

  const handleCreateNew = async () => {
    await createDashboard({
      name: `Dashboard ${dashboards.length + 1}`,
      sharing_scope: 'PRIVATE',
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <DashboardToolbar />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Widget Palette */}
        <WidgetPalette />

        {/* Canvas */}
        <DashboardCanvas />
      </div>

      {/* Empty state */}
      {!currentDashboard && dashboards.length === 0 && (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-lg text-text-ops-primary mb-2">No dashboards yet</p>
            <p className="text-sm text-text-ops-muted mb-4">
              Create your first dashboard to start building custom views
            </p>
            <button
              onClick={handleCreateNew}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium"
            >
              Create Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardView;
