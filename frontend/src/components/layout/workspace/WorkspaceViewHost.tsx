/**
 * Workspace View Host Component
 *
 * Wraps each lazy-loaded view component with focus management and
 * Suspense fallback rendering for the multi-view workspace docking engine.
 *
 * Features
 * --------
 * - **Lazy Loading** — Each view is loaded via React.lazy() and wrapped in
 *   React.Suspense with a loading skeleton fallback.
 * - **Focus Management** — Clicking inside any pane marks it as the active
 *   focused viewport, automatically updating the Contextual Ribbon's active
 *   tabs and action states.
 * - **View Resolution** — Maps all 13 ViewType discriminators to their
 *   corresponding React view components.
 *
 * View Mapping
 * ------------
 * - WBS_GANTT → WbsTable + GanttViewport (with FilterToolbar)
 * - DAILY_COCKPIT → DailyCockpitView
 * - SCHEDULE_HEALTH → ScheduleHealthView
 * - SRA_RISK → ScheduleRiskView
 * - EVM_REPORTING → ReportingWorkbenchView
 * - FACILITY_CHAMBER → FacilitySchedulingView
 * - LOCATION_VAULT → LocationExplorerView
 * - SUPPLIER_PORTAL → SupplierPortalView
 * - CDRL_REGISTER → ContractDeliverablesView
 * - CCB_GOVERNANCE → ChangeControlView
 * - CUSTOM_FIELDS → CustomFieldsAdminView
 * - DOCUMENT_VAULT → ArtifactVaultDrawer
 * - MERKLE_SYNC → MerkleSyncView
 * - HELP_CENTER → HelpCenterView
 *
 * Usage
 * -----
 *
 * ```tsx
 * <WorkspaceViewHost tab={activeTab} projectId={projectId} />
 * ```
 */

import React, { useCallback, useRef, useState, useEffect } from 'react';
import type { WorkspaceTab } from '../../../stores/useWorkspaceStore';
import { useWorkspaceStore } from '../../../stores/useWorkspaceStore';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import FilterToolbar from '../../wbs/FilterToolbar';
import WbsTable from '../../wbs/WbsTable';
import GanttViewport from '../../gantt/GanttViewport';

// ---------------------------------------------------------------------------
// Resizable WBS & Gantt Split Pane
// ---------------------------------------------------------------------------

interface WbsGanttSplitPaneProps {
  projectId: string;
  wbsScrollRef: React.RefObject<HTMLDivElement | null>;
}

const WbsGanttSplitPane: React.FC<WbsGanttSplitPaneProps> = ({ projectId, wbsScrollRef }) => {
  // Split ratio between WBS table (left) and Gantt viewport (right), 0.15 to 0.85
  const [splitRatio, setSplitRatio] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('eisenhower_wbs_gantt_split_ratio');
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val >= 0.15 && val <= 0.85) return val;
      }
    } catch {
      // ignore
    }
    return 0.50;
  });

  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const ratio = Math.max(0.15, Math.min(0.85, offsetX / rect.width));
      setSplitRatio(ratio);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      try {
        localStorage.setItem('eisenhower_wbs_gantt_split_ratio', String(splitRatio));
      } catch {
        // ignore
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, splitRatio]);

  return (
    <div
      ref={containerRef}
      className={`flex flex-1 overflow-hidden ${isDragging ? 'select-none cursor-col-resize' : ''}`}
    >
      <div
        className="overflow-hidden"
        style={{ width: `${(splitRatio * 100).toFixed(2)}%`, minWidth: 150 }}
      >
        <WbsTable
          rootNodeId={projectId}
          className="h-full"
          externalScrollRef={wbsScrollRef as any}
        />
      </div>

      {/* Draggable vertical splitter divider */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(splitRatio * 100)}
        tabIndex={0}
        onMouseDown={handleMouseDown}
        className={`w-1.5 hover:w-2 -mx-0.5 cursor-col-resize z-20 flex items-center justify-center transition-colors flex-shrink-0 ${
          isDragging ? 'bg-blue-500 w-2' : 'bg-border-ops-subtle hover:bg-blue-400'
        }`}
        title="Drag to resize WBS Table and Gantt Chart"
      >
        <div className="w-0.5 h-6 bg-text-ops-muted/40 rounded-full pointer-events-none" />
      </div>

      <div
        className="flex flex-col overflow-hidden flex-1"
        style={{ width: `${((1 - splitRatio) * 100).toFixed(2)}%`, minWidth: 150 }}
      >
        <GanttViewport
          wbsScrollRef={wbsScrollRef as any}
          statusDate={new Date().toISOString().slice(0, 10)}
        />
      </div>
    </div>
  );
};

// Lazy-loaded views
const DailyCockpitView = React.lazy(() => import('../../../views/DailyCockpitView'));
const ScheduleRiskView = React.lazy(() => import('../../../views/ScheduleRiskView'));
const FacilitySchedulingView = React.lazy(() => import('../../../views/FacilitySchedulingView'));
const SupplierPortalView = React.lazy(() => import('../../../views/SupplierPortalView'));
const ReportingWorkbenchView = React.lazy(() => import('../../../views/ReportingWorkbenchView'));
const CustomFieldsAdminView = React.lazy(() => import('../../../views/admin/CustomFieldsAdminView'));
const ScheduleHealthView = React.lazy(() => import('../../../views/ScheduleHealthView'));
const ContractDeliverablesView = React.lazy(() => import('../../../views/ContractDeliverablesView'));
const ChangeControlView = React.lazy(() => import('../../../views/ChangeControlView'));
const LocationExplorerView = React.lazy(() => import('../../../views/LocationExplorerView'));
const ArtifactVaultDrawer = React.lazy(() => import('../../artifacts/ArtifactVaultDrawer'));
const MerkleSyncView = React.lazy(() => import('../../../views/MerkleSyncView'));
const HelpCenterView = React.lazy(() => import('../../../views/HelpCenterView'));

// High priority views — Costing, Procurement, Commercial, Templates
const CostingView = React.lazy(() => import('../../../views/CostingView'));
const ProcurementView = React.lazy(() => import('../../../views/ProcurementView'));
const CommercialView = React.lazy(() => import('../../../views/CommercialView'));
const TemplatesView = React.lazy(() => import('../../../views/TemplatesView'));

// Medium priority views — Engineering, Equipment, Materials, Reserves, Currency, Calendars
const EngineeringView = React.lazy(() => import('../../../views/EngineeringView'));
const EquipmentView = React.lazy(() => import('../../../views/EquipmentView'));
const MaterialsView = React.lazy(() => import('../../../views/MaterialsView'));
const ReservesView = React.lazy(() => import('../../../views/ReservesView'));
const CurrencyView = React.lazy(() => import('../../../views/CurrencyView'));
const CalendarsView = React.lazy(() => import('../../../views/CalendarsView'));

// Lower priority views — Quarantine, Subcontractors, Requisitions, Sandboxes, Programmes, AirGap, Audit, AdminSecurity, DbHealth
const ScheduleQuarantineView = React.lazy(() => import('../../../views/ScheduleQuarantineView'));
const SubcontractorsView = React.lazy(() => import('../../../views/SubcontractorsView'));
const RequisitionsView = React.lazy(() => import('../../../views/RequisitionsView'));
const SandboxesView = React.lazy(() => import('../../../views/SandboxesView'));
const ProgrammesView = React.lazy(() => import('../../../views/ProgrammesView'));
const AirGapView = React.lazy(() => import('../../../views/AirGapView'));
const AuditView = React.lazy(() => import('../../../views/AuditView'));
const AdminSecurityView = React.lazy(() => import('../../../views/AdminSecurityView'));
const DbHealthView = React.lazy(() => import('../../../views/DbHealthView'));

// Admin tools — Backup, Logs, Users, Config, Health, Alerting, Monitoring, Password, Export, LogRotation, FeatureFlags, SecurityScan, SecretRotation, Maintenance
const BackupManagerView = React.lazy(() => import('../../../views/BackupManagerView'));
const LogViewerView = React.lazy(() => import('../../../views/LogViewerView'));
const UserManagementView = React.lazy(() => import('../../../views/UserManagementView'));
const SystemConfigView = React.lazy(() => import('../../../views/SystemConfigView'));
const ServiceHealthView = React.lazy(() => import('../../../views/ServiceHealthView'));
const AlertingView = React.lazy(() => import('../../../views/AlertingView'));
const MonitoringView = React.lazy(() => import('../../../views/MonitoringView'));
const PasswordPolicyView = React.lazy(() => import('../../../views/PasswordPolicyView'));
const DataExportView = React.lazy(() => import('../../../views/DataExportView'));
const LogRotationView = React.lazy(() => import('../../../views/LogRotationView'));
const FeatureFlagsView = React.lazy(() => import('../../../views/FeatureFlagsView'));
const SecurityScanView = React.lazy(() => import('../../../views/SecurityScanView'));
const SecretRotationView = React.lazy(() => import('../../../views/SecretRotationView'));
const MaintenanceModeView = React.lazy(() => import('../../../views/MaintenanceModeView'));

// Line management, leave, skills, resource downtime, and delegation
const LeaveManagementView = React.lazy(() => import('../../../views/LeaveManagementView'));
const LineManagerDashboardView = React.lazy(() => import('../../../views/LineManagerDashboardView'));
const ResourceSkillsView = React.lazy(() => import('../../../views/ResourceSkillsView'));
const ResourceDowntimeView = React.lazy(() => import('../../../views/ResourceDowntimeView'));
const DelegationManagementView = React.lazy(() => import('../../../views/DelegationManagementView'));

// Additional views — Dashboard, Timesheet, Cost Spreading, Export Control, Workforce Forecast
const DashboardView = React.lazy(() => import('../../../views/DashboardView'));
const TimesheetCoherenceView = React.lazy(() => import('../../../views/commercial/TimesheetCoherenceView'));
const CostSpreadingView = React.lazy(() => import('../../../views/commercial/CostSpreadingView'));
const ExportControlDashboardView = React.lazy(() => import('../../../views/compliance/ExportControlDashboardView'));
const WorkforceForecastView = React.lazy(() => import('../../../views/resources/WorkforceForecastView'));

// Additional views — CCB Arbitration, SBOM, Sandtable, CAM EVM, Agent Review
const CcbArbitrationWorkbenchView = React.lazy(() => import('../../../views/sync/CcbArbitrationWorkbenchView'));
const SbomVulnerabilityView = React.lazy(() => import('../../../views/compliance/SbomVulnerabilityView'));
const ScenarioSandtableView = React.lazy(() => import('../../../views/sandboxes/ScenarioSandtableView'));
const CamEvmCloseoutWizardView = React.lazy(() => import('../../../views/evm/CamEvmCloseoutWizardView'));
const AgentReviewWorkbenchView = React.lazy(() => import('../../../views/agents/AgentReviewWorkbenchView'));

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WorkspaceViewHostProps {
  /** The workspace tab to render */
  tab: WorkspaceTab;
  /** Optional project ID for views that need it */
  projectId?: string;
}

// ---------------------------------------------------------------------------
// Suspense Fallback
// ---------------------------------------------------------------------------

const SuspenseFallback: React.FC<{ tab: WorkspaceTab }> = ({ tab }) => (
  <div className="flex flex-col items-center justify-center h-full gap-4 text-text-ops-muted">
    {/* Loading skeleton */}
    <div className="w-8 h-8 rounded-full border-2 border-border-ops-subtle border-t-blue-500 animate-spin" />
    <p className="text-sm">Loading {tab.title}...</p>
  </div>
);

// ---------------------------------------------------------------------------
// Workspace View Host
// ---------------------------------------------------------------------------

const WorkspaceViewHost: React.FC<WorkspaceViewHostProps> = ({ tab, projectId }) => {
  const params = tab.params || {};
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const storeRootNodeId = useScheduleStore((s) => s.rootNodeId);
  const defaultRootId =
    storeRootNodeId && storeRootNodeId !== 'default' ? storeRootNodeId : undefined;
  const effectiveProjectId = projectId || params.projectId || defaultRootId;
  const wbsScrollRef = useRef<HTMLDivElement>(null);

  // Focus management: clicking inside this pane activates the tab
  const handleClick = useCallback(() => {
    setActiveTab(tab.id);
  }, [tab.id, setActiveTab]);

  // Render the view component based on viewType
  const renderView = () => {
    switch (tab.viewType) {
      case 'WBS_GANTT':
        return (
          <div className="flex flex-col h-full">
            <FilterToolbar />
            <WbsGanttSplitPane
              projectId={effectiveProjectId || ''}
              wbsScrollRef={wbsScrollRef}
            />
          </div>
        );

      case 'DAILY_COCKPIT':
        return <DailyCockpitView />;

      case 'SRA_RISK':
        return <ScheduleRiskView projectId={effectiveProjectId} />;

      case 'FACILITY_CHAMBER':
        return <FacilitySchedulingView />;

      case 'SUPPLIER_PORTAL':
        return <SupplierPortalView />;

      case 'EVM_REPORTING':
        return <ReportingWorkbenchView projectId={effectiveProjectId} />;

      case 'CUSTOM_FIELDS':
        return <CustomFieldsAdminView />;

      case 'SCHEDULE_HEALTH':
        return <ScheduleHealthView projectId={effectiveProjectId} />;

      case 'CONTRACT_DELIVERABLES':
        return <ContractDeliverablesView />;

      case 'CHANGE_CONTROL':
        return <ChangeControlView />;

      case 'LOCATION_EXPLORER':
        return <LocationExplorerView />;

      case 'DOCUMENT_VAULT':
        return <ArtifactVaultDrawer open={true} onClose={() => {}} />;

      case 'MERKLE_SYNC':
        return <MerkleSyncView projectId={effectiveProjectId} />;

      case 'HELP_CENTER':
        return <HelpCenterView />;

      // High priority views
      case 'COSTING':
        return <CostingView projectId={effectiveProjectId} />;
      case 'PROCUREMENT':
        return <ProcurementView />;
      case 'COMMERCIAL':
        return <CommercialView />;
      case 'TEMPLATES':
        return <TemplatesView />;

      // Medium priority views
      case 'ENGINEERING':
        return <EngineeringView />;
      case 'EQUIPMENT':
        return <EquipmentView />;
      case 'MATERIALS':
        return <MaterialsView />;
      case 'RESERVES':
        return <ReservesView />;
      case 'CURRENCY':
        return <CurrencyView />;
      case 'CALENDARS':
        return <CalendarsView />;

      // Lower priority views
      case 'SCHEDULE_QUARANTINE':
        return <ScheduleQuarantineView />;
      case 'SUBCONTRACTORS':
        return <SubcontractorsView />;
      case 'REQUISITIONS':
        return <RequisitionsView />;
      case 'SANDBOXES':
        return <SandboxesView />;
      case 'PROGRAMMES':
        return <ProgrammesView />;
      case 'AIRGAP':
        return <AirGapView />;
      case 'AUDIT':
        return <AuditView />;
      case 'ADMIN_SECURITY':
        return <AdminSecurityView />;
      case 'DB_HEALTH':
        return <DbHealthView />;

      // Admin tools
      case 'BACKUP_MANAGER':
        return <BackupManagerView />;
      case 'LOG_VIEWER':
        return <LogViewerView />;
      case 'USER_MANAGEMENT':
        return <UserManagementView />;
      case 'SYSTEM_CONFIG':
        return <SystemConfigView />;
      case 'SERVICE_HEALTH':
        return <ServiceHealthView />;
      case 'ALERTING':
        return <AlertingView />;
      case 'MONITORING':
        return <MonitoringView />;
      case 'PASSWORD_POLICY':
        return <PasswordPolicyView />;
      case 'DATA_EXPORT':
        return <DataExportView />;
      case 'LOG_ROTATION':
        return <LogRotationView />;
      case 'FEATURE_FLAGS':
        return <FeatureFlagsView />;
      case 'SECURITY_SCAN':
        return <SecurityScanView />;
      case 'SECRET_ROTATION':
        return <SecretRotationView />;
      case 'MAINTENANCE_MODE':
        return <MaintenanceModeView />;

      // Line management, leave, skills, resource downtime, and delegation
      case 'LEAVE_MANAGEMENT':
        return <LeaveManagementView />;
      case 'LINE_MANAGER_DASHBOARD':
        return <LineManagerDashboardView />;
      case 'RESOURCE_SKILLS':
        return <ResourceSkillsView />;
      case 'RESOURCE_DOWNTIME':
        return <ResourceDowntimeView />;
      case 'DELEGATION_MANAGEMENT':
        return <DelegationManagementView />;

      // Additional views
      case 'DASHBOARD':
        return <DashboardView />;
      case 'TIMESHEET_COHERENCE':
        return <TimesheetCoherenceView />;
      case 'COST_SPREADING':
        return <CostSpreadingView />;
      case 'EXPORT_CONTROL':
        return <ExportControlDashboardView />;
      case 'WORKFORCE_FORECAST':
        return <WorkforceForecastView />;
      case 'CCB_ARBITRATION':
        return <CcbArbitrationWorkbenchView />;
      case 'SBOM_VULNERABILITY':
        return <SbomVulnerabilityView />;
      case 'SANDTABLE':
        return <ScenarioSandtableView />;
      case 'CAM_EVM_CLOSEOUT_WIZARD':
        return <CamEvmCloseoutWizardView />;
      case 'AGENT_REVIEW_WORKBENCH':
        return <AgentReviewWorkbenchView />;
      case 'HARDWARE_ENCLAVE':
        return <AirGapView />;

      default:
        return (
          <div className="flex items-center justify-center h-full text-text-ops-muted">
            <p className="text-sm">Unknown view type: {tab.viewType}</p>
          </div>
        );
    }
  };

  return (
    <div
      className="h-full w-full overflow-hidden"
      onClick={handleClick}
      role="tabpanel"
      aria-label={tab.title}
      tabIndex={0}
    >
      <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
        {renderView()}
      </React.Suspense>
    </div>
  );
};

export default WorkspaceViewHost;
