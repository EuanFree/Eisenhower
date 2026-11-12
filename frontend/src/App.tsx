import React, { useEffect, Component, ErrorInfo, ReactNode } from 'react';
import AppShell from './components/layout/AppShell';
import { useWorkspaceStore, type ViewType } from './stores/useWorkspaceStore';
import { setAuthToken } from './services/api';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('AppShell error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, color: '#f87171', backgroundColor: '#0f172a', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h1 style={{ fontSize: 24, marginBottom: 16 }}>Error in AppShell</h1>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#fca5a5', marginBottom: 16 }}>
            {this.state.error?.toString()}
          </pre>
          <details open>
            <summary style={{ cursor: 'pointer', marginBottom: 8, color: '#93c5fd' }}>Component Stack</summary>
            <pre style={{ whiteSpace: 'pre-wrap', color: '#94a3b8' }}>
              {this.state.errorInfo?.componentStack}
            </pre>
          </details>
          <details open style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', marginBottom: 8, color: '#93c5fd' }}>Stack Trace</summary>
            <pre style={{ whiteSpace: 'pre-wrap', color: '#64748b' }}>
              {this.state.error?.stack}
            </pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
};

export default App;
