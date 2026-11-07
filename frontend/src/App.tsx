import React, { useEffect } from 'react';
import AppShell from './components/layout/AppShell';
import { useWorkspaceStore, type ViewType } from './stores/useWorkspaceStore';
import { setAuthToken } from './services/api';

const DETACHED_VIEW_ALIAS: Record<string, ViewType> = {
  GANTT: 'WBS_GANTT',
  WBSTABLE: 'WBS_GANTT',
  COCKPIT: 'DAILY_COCKPIT',
  SRA: 'SRA_RISK',
  FACILITIES: 'FACILITY_CHAMBER',
};

/**
 * App — Root component for the Eisenhower Portfolio Manager.
 *
 * Renders the AppShell with default classification and breadcrumbs.
 * The AppShell handles display settings hydration on mount, so the
 * UI is pre-painted with the correct theme, density, and scale before
 * any child content renders.
 *
 * When no children are provided, AppShell renders the WorkspaceContainer
 * by default, which handles multi-view tabs, split panes, and lazy-loaded
 * view components mapped from the sidebar navigation.
 */
const App: React.FC = () => {
  const openView = useWorkspaceStore((s) => s.openView);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('authToken');
    if (tokenParam) {
      setAuthToken(tokenParam);
    }

    const rawViewType = params.get('viewType');
    const projectId = params.get('projectId') || undefined;
    if (rawViewType) {
      const resolvedViewType = (DETACHED_VIEW_ALIAS[rawViewType] || rawViewType) as ViewType;
      openView(resolvedViewType, projectId ? { projectId } : undefined, 'ACTIVE_PANE');
    }
  }, [openView]);

  const params = new URLSearchParams(window.location.search);
  const urlProjectId = params.get('projectId') || undefined;

  return (
    <AppShell
      classification="SECRET"
      caveats={['UK_EYES_ONLY']}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Dashboard', href: '/dashboard' },
      ]}
      activeProject="Next-Gen Avionics Radar Suite"
      userName="J. Smith"
      projectId={urlProjectId}
    />
  );
};

export default App;
