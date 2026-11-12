/**
 * View Resolver Component
 *
 * Dynamically resolves and renders the correct view component based on
 * the WorkspaceTab.viewType discriminator.
 *
 * View Mapping
 * ------------
 * - WBS_GANTT → WbsTable + GanttViewport (with FilterToolbar)
 * - DAILY_COCKPIT → DailyCockpitView
 * - SRA_RISK → ScheduleRiskView
 * - FACILITY_CHAMBER → FacilitySchedulingView
 * - SUPPLIER_PORTAL → SupplierPortalView
 * - EVM_REPORTING → ReportingWorkbenchView
 * - CUSTOM_FIELDS → CustomFieldsAdminView
 * - SCHEDULE_HEALTH → ScheduleHealthView
 * - CONTRACT_DELIVERABLES → ContractDeliverablesView
 * - CHANGE_CONTROL → ChangeControlView
 * - LOCATION_EXPLORER → LocationExplorerView
 * - DOCUMENT_VAULT → ArtifactVaultDrawer
 * - MERKLE_SYNC → MerkleSyncView
 * - HELP_CENTER → HelpCenterView
 * - DASHBOARD → DashboardView
 *
 * Workforce & Operations
 * ----------------------
 * - LEAVE_MANAGEMENT → LeaveManagementView
 * - LINE_MANAGER_DASHBOARD → LineManagerDashboardView
 * - RESOURCE_SKILLS → ResourceSkillsView
 * - RESOURCE_DOWNTIME → ResourceDowntimeView
 * - DELEGATION_MANAGEMENT → DelegationManagementView
 * - REQUISITIONS → RequisitionsView
 *
 * Commercial & Financial
 * -----------------------
 * - COSTING → CostingView
 * - COMMERCIAL → CommercialView
 * - PROCUREMENT → ProcurementView
 * - RESERVES → ReservesView
 * - CURRENCY → CurrencyView
 *
 * Engineering & Physical Assets
 * ------------------------------
 * - ENGINEERING → EngineeringView
 * - EQUIPMENT → EquipmentView
 * - MATERIALS → MaterialsView
 *
 * Planning & Scheduling
 * ----------------------
 * - CALENDARS → CalendarsView
 * - SCHEDULE_QUARANTINE → ScheduleQuarantineView
 * - SUBCONTRACTORS → SubcontractorsView
 * - SANDBOXES → SandboxesView
 * - PROGRAMMES → ProgrammesView
 * - TEMPLATES → TemplatesView
 *
 * Air-Gap, Audit & Security
 * --------------------------
 * - AIRGAP → AirGapView
 * - AUDIT → AuditView
 * - ADMIN_SECURITY → AdminSecurityView
 * - PASSWORD_POLICY → PasswordPolicyView
 * - SECURITY_SCAN → SecurityScanView
 * - SECRET_ROTATION → SecretRotationView
 * - DATA_EXPORT → DataExportView
 *
 * Infrastructure & Monitoring
 * ----------------------------
 * - DB_HEALTH → DbHealthView
 * - BACKUP_MANAGER → BackupManagerView
 * - LOG_VIEWER → LogViewerView
 * - LOG_ROTATION → LogRotationView
 * - SERVICE_HEALTH → ServiceHealthView
 * - ALERTING → AlertingView
 * - MONITORING → MonitoringView
 * - SYSTEM_CONFIG → SystemConfigView
 * - MAINTENANCE_MODE → MaintenanceModeView
 * - FEATURE_FLAGS → FeatureFlagsView
 * - USER_MANAGEMENT → UserManagementView
 *
 * Compliance & CCB
 * -----------------
 * - CCB_ARBITRATION → CcbArbitrationWorkbenchView
 * - SBOM_VULNERABILITY → SbomVulnerabilityView
 *
 * Planning & Sandtable
 * --------------------
 * - SANDTABLE → ScenarioSandtableView
 *
 * EVM & Closeout
 * --------------
 * - CAM_EVM_CLOSEOUT_WIZARD → CamEvmCloseoutWizardView
 *
 * Usage
 * -----
 *
 * ```tsx
 * <ViewResolver tab={activeTab} projectId={projectId} />
 * ```
 */

import React, { useRef } from 'react';
import type { WorkspaceTab } from '../../../stores/useWorkspaceStore';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import FilterToolbar from '../../wbs/FilterToolbar';
import WbsTable from '../../wbs/WbsTable';
import GanttViewport from '../../gantt/GanttViewport';

// Lazy-loaded views
const DailyCockpitView = React.lazy(() => import('../../../views/DailyCockpitView'));
const BlockedActivitiesView = React.lazy(() => import('../../../views/BlockedActivitiesView'));
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
const DashboardView = React.lazy(() => import('../../../views/DashboardView'));
const WorkforceForecastView = React.lazy(() => import('../../../views/resources/WorkforceForecastView'));
const TimesheetCoherenceView = React.lazy(() => import('../../../views/commercial/TimesheetCoherenceView'));
const CostSpreadingView = React.lazy(() => import('../../../views/commercial/CostSpreadingView'));
const ExportControlDashboardView = React.lazy(() => import('../../../views/compliance/ExportControlDashboardView'));

// Copilot
const CopilotPanel = React.lazy(() => import('../../copilot/CopilotPanel'));

// Workforce & Operations
const LeaveManagementView = React.lazy(() => import('../../../views/LeaveManagementView'));
const LineManagerDashboardView = React.lazy(() => import('../../../views/LineManagerDashboardView'));
const ResourceSkillsView = React.lazy(() => import('../../../views/ResourceSkillsView'));
const ResourceDowntimeView = React.lazy(() => import('../../../views/ResourceDowntimeView'));
const DelegationManagementView = React.lazy(() => import('../../../views/DelegationManagementView'));
const RequisitionsView = React.lazy(() => import('../../../views/RequisitionsView'));

// Commercial & Financial
const CostingView = React.lazy(() => import('../../../views/CostingView'));
const CommercialView = React.lazy(() => import('../../../views/CommercialView'));
const ProcurementView = React.lazy(() => import('../../../views/ProcurementView'));
const ReservesView = React.lazy(() => import('../../../views/ReservesView'));
const CurrencyView = React.lazy(() => import('../../../views/CurrencyView'));

// Engineering & Physical Assets
const EngineeringView = React.lazy(() => import('../../../views/EngineeringView'));
const EquipmentView = React.lazy(() => import('../../../views/EquipmentView'));
const MaterialsView = React.lazy(() => import('../../../views/MaterialsView'));

// Planning & Scheduling
const CalendarsView = React.lazy(() => import('../../../views/CalendarsView'));
const ScheduleQuarantineView = React.lazy(() => import('../../../views/ScheduleQuarantineView'));
const SubcontractorsView = React.lazy(() => import('../../../views/SubcontractorsView'));
const SandboxesView = React.lazy(() => import('../../../views/SandboxesView'));
const ProgrammesView = React.lazy(() => import('../../../views/ProgrammesView'));
const TemplatesView = React.lazy(() => import('../../../views/TemplatesView'));

// Air-Gap, Audit & Security
const AirGapView = React.lazy(() => import('../../../views/AirGapView'));
const AuditView = React.lazy(() => import('../../../views/AuditView'));
const AdminSecurityView = React.lazy(() => import('../../../views/AdminSecurityView'));
const PasswordPolicyView = React.lazy(() => import('../../../views/PasswordPolicyView'));
const SecurityScanView = React.lazy(() => import('../../../views/SecurityScanView'));
const SecretRotationView = React.lazy(() => import('../../../views/SecretRotationView'));
const DataExportView = React.lazy(() => import('../../../views/DataExportView'));

// Infrastructure & Monitoring
const DbHealthView = React.lazy(() => import('../../../views/DbHealthView'));
const BackupManagerView = React.lazy(() => import('../../../views/BackupManagerView'));
const LogViewerView = React.lazy(() => import('../../../views/LogViewerView'));
const LogRotationView = React.lazy(() => import('../../../views/LogRotationView'));
const ServiceHealthView = React.lazy(() => import('../../../views/ServiceHealthView'));
const AlertingView = React.lazy(() => import('../../../views/AlertingView'));
const MonitoringView = React.lazy(() => import('../../../views/MonitoringView'));
const SystemConfigView = React.lazy(() => import('../../../views/SystemConfigView'));
const MaintenanceModeView = React.lazy(() => import('../../../views/MaintenanceModeView'));
const FeatureFlagsView = React.lazy(() => import('../../../views/FeatureFlagsView'));
const UserManagementView = React.lazy(() => import('../../../views/UserManagementView'));

// Compliance & CCB
const CcbArbitrationWorkbenchView = React.lazy(() => import('../../../views/sync/CcbArbitrationWorkbenchView'));
const SbomVulnerabilityView = React.lazy(() => import('../../../views/compliance/SbomVulnerabilityView'));

// Planning & Sandtable
const ScenarioSandtableView = React.lazy(() => import('../../../views/sandboxes/ScenarioSandtableView'));

// EVM & Closeout
const CamEvmCloseoutWizardView = React.lazy(() => import('../../../views/evm/CamEvmCloseoutWizardView'));

// AI Agent Governance
const AgentReviewWorkbenchView = React.lazy(() => import('../../../views/agents/AgentReviewWorkbenchView'));

// User Preferences
const SettingsView = React.lazy(() => import('../../../views/SettingsView'));

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ViewResolverProps {
  /** The workspace tab to render */
  tab: WorkspaceTab;
  /** Optional project ID for views that need it */
  projectId?: string;
}

// ---------------------------------------------------------------------------
// Suspense Fallback
// ---------------------------------------------------------------------------

const SuspenseFallback: React.FC<{ tab: WorkspaceTab }> = ({ tab }) => (
  <div className="flex items-center justify-center h-full text-text-ops-muted">
    <p className="text-sm">Loading {tab.title}...</p>
  </div>
);

// ---------------------------------------------------------------------------
// View Resolver
// ---------------------------------------------------------------------------

const ViewResolver: React.FC<ViewResolverProps> = ({ tab, projectId }) => {
  const params = tab.params || {};
  const storeRootNodeId = useScheduleStore((s) => s.rootNodeId);
  const defaultRootId =
    storeRootNodeId && storeRootNodeId !== 'default' ? storeRootNodeId : undefined;
  const effectiveProjectId = projectId || params.projectId || defaultRootId;
  const wbsScrollRef = useRef<HTMLDivElement>(null);

  switch (tab.viewType) {
    case 'WBS_GANTT':
      return (
        <div className="flex flex-col h-full">
          <FilterToolbar />
          <div className="flex flex-1 overflow-hidden">
            <div className="w-1/2 overflow-hidden border-r border-border-ops-subtle">
              <WbsTable
                rootNodeId={effectiveProjectId || ''}
                className="h-full"
                externalScrollRef={wbsScrollRef}
              />
            </div>
            <div className="w-1/2 flex flex-col overflow-hidden">
              <GanttViewport
                wbsScrollRef={wbsScrollRef}
                statusDate={new Date().toISOString().slice(0, 10)}
              />
            </div>
          </div>
        </div>
      );

    case 'DAILY_COCKPIT':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <DailyCockpitView />
        </React.Suspense>
      );

    case 'BLOCKED_ACTIVITIES':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <BlockedActivitiesView />
        </React.Suspense>
      );

    case 'SRA_RISK':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <ScheduleRiskView projectId={effectiveProjectId} />
        </React.Suspense>
      );

    case 'FACILITY_CHAMBER':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <FacilitySchedulingView />
        </React.Suspense>
      );

    case 'SUPPLIER_PORTAL':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <SupplierPortalView />
        </React.Suspense>
      );

    case 'EVM_REPORTING':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <ReportingWorkbenchView projectId={effectiveProjectId} />
        </React.Suspense>
      );

    case 'CUSTOM_FIELDS':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <CustomFieldsAdminView />
        </React.Suspense>
      );

    case 'SCHEDULE_HEALTH':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <ScheduleHealthView projectId={effectiveProjectId} />
        </React.Suspense>
      );

    case 'CONTRACT_DELIVERABLES':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <ContractDeliverablesView />
        </React.Suspense>
      );

    case 'CHANGE_CONTROL':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <ChangeControlView />
        </React.Suspense>
      );

    case 'LOCATION_EXPLORER':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <LocationExplorerView />
        </React.Suspense>
      );

    case 'DOCUMENT_VAULT':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <ArtifactVaultDrawer open={true} onClose={() => {}} />
        </React.Suspense>
      );

    case 'MERKLE_SYNC':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <MerkleSyncView projectId={effectiveProjectId} />
        </React.Suspense>
      );

    case 'HELP_CENTER':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <HelpCenterView />
        </React.Suspense>
      );

    case 'DASHBOARD':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <DashboardView />
        </React.Suspense>
      );

    case 'WORKFORCE_FORECAST':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <WorkforceForecastView />
        </React.Suspense>
      );

    case 'TIMESHEET_COHERENCE':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <TimesheetCoherenceView />
        </React.Suspense>
      );

    case 'COST_SPREADING':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <CostSpreadingView />
        </React.Suspense>
      );

    case 'EXPORT_CONTROL':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <ExportControlDashboardView />
        </React.Suspense>
      );

    case 'HARDWARE_ENCLAVE':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <AirGapView />
        </React.Suspense>
      );

    case 'COPILOT':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <CopilotPanel />
        </React.Suspense>
      );

    // ---------------------------------------------------------------------------
    // Workforce & Operations
    // ---------------------------------------------------------------------------

    case 'LEAVE_MANAGEMENT':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <LeaveManagementView />
        </React.Suspense>
      );

    case 'LINE_MANAGER_DASHBOARD':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <LineManagerDashboardView />
        </React.Suspense>
      );

    case 'RESOURCE_SKILLS':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <ResourceSkillsView />
        </React.Suspense>
      );

    case 'RESOURCE_DOWNTIME':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <ResourceDowntimeView />
        </React.Suspense>
      );

    case 'DELEGATION_MANAGEMENT':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <DelegationManagementView />
        </React.Suspense>
      );

    case 'REQUISITIONS':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <RequisitionsView />
        </React.Suspense>
      );

    // ---------------------------------------------------------------------------
    // Commercial & Financial
    // ---------------------------------------------------------------------------

    case 'COSTING':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <CostingView projectId={effectiveProjectId} />
        </React.Suspense>
      );

    case 'COMMERCIAL':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <CommercialView />
        </React.Suspense>
      );

    case 'PROCUREMENT':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <ProcurementView />
        </React.Suspense>
      );

    case 'RESERVES':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <ReservesView />
        </React.Suspense>
      );

    case 'CURRENCY':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <CurrencyView />
        </React.Suspense>
      );

    // ---------------------------------------------------------------------------
    // Engineering & Physical Assets
    // ---------------------------------------------------------------------------

    case 'ENGINEERING':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <EngineeringView />
        </React.Suspense>
      );

    case 'EQUIPMENT':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <EquipmentView />
        </React.Suspense>
      );

    case 'MATERIALS':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <MaterialsView />
        </React.Suspense>
      );

    // ---------------------------------------------------------------------------
    // Planning & Scheduling
    // ---------------------------------------------------------------------------

    case 'CALENDARS':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <CalendarsView />
        </React.Suspense>
      );

    case 'SCHEDULE_QUARANTINE':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <ScheduleQuarantineView />
        </React.Suspense>
      );

    case 'SUBCONTRACTORS':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <SubcontractorsView />
        </React.Suspense>
      );

    case 'SANDBOXES':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <SandboxesView />
        </React.Suspense>
      );

    case 'PROGRAMMES':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <ProgrammesView />
        </React.Suspense>
      );

    case 'TEMPLATES':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <TemplatesView />
        </React.Suspense>
      );

    // ---------------------------------------------------------------------------
    // Air-Gap, Audit & Security
    // ---------------------------------------------------------------------------

    case 'AIRGAP':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <AirGapView />
        </React.Suspense>
      );

    case 'AUDIT':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <AuditView />
        </React.Suspense>
      );

    case 'ADMIN_SECURITY':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <AdminSecurityView />
        </React.Suspense>
      );

    case 'PASSWORD_POLICY':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <PasswordPolicyView />
        </React.Suspense>
      );

    case 'SECURITY_SCAN':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <SecurityScanView />
        </React.Suspense>
      );

    case 'SECRET_ROTATION':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <SecretRotationView />
        </React.Suspense>
      );

    case 'DATA_EXPORT':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <DataExportView />
        </React.Suspense>
      );

    // ---------------------------------------------------------------------------
    // Infrastructure & Monitoring
    // ---------------------------------------------------------------------------

    case 'DB_HEALTH':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <DbHealthView />
        </React.Suspense>
      );

    case 'BACKUP_MANAGER':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <BackupManagerView />
        </React.Suspense>
      );

    case 'LOG_VIEWER':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <LogViewerView />
        </React.Suspense>
      );

    case 'LOG_ROTATION':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <LogRotationView />
        </React.Suspense>
      );

    case 'SERVICE_HEALTH':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <ServiceHealthView />
        </React.Suspense>
      );

    case 'ALERTING':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <AlertingView />
        </React.Suspense>
      );

    case 'MONITORING':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <MonitoringView />
        </React.Suspense>
      );

    case 'SYSTEM_CONFIG':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <SystemConfigView />
        </React.Suspense>
      );

    case 'MAINTENANCE_MODE':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <MaintenanceModeView />
        </React.Suspense>
      );

    case 'FEATURE_FLAGS':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <FeatureFlagsView />
        </React.Suspense>
      );

    case 'USER_MANAGEMENT':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <UserManagementView />
        </React.Suspense>
      );

    // ---------------------------------------------------------------------------
    // Compliance & CCB
    // ---------------------------------------------------------------------------

    case 'CCB_ARBITRATION':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <CcbArbitrationWorkbenchView />
        </React.Suspense>
      );

    case 'SBOM_VULNERABILITY':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <SbomVulnerabilityView />
        </React.Suspense>
      );

    // ---------------------------------------------------------------------------
    // Planning & Sandtable
    // ---------------------------------------------------------------------------

    case 'SANDTABLE':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <ScenarioSandtableView />
        </React.Suspense>
      );

    // ---------------------------------------------------------------------------
    // EVM & Closeout
    // ---------------------------------------------------------------------------

    case 'CAM_EVM_CLOSEOUT_WIZARD':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <CamEvmCloseoutWizardView />
        </React.Suspense>
      );

    // ---------------------------------------------------------------------------
    // AI Agent Governance
    // ---------------------------------------------------------------------------

    case 'AGENT_REVIEW_WORKBENCH':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <AgentReviewWorkbenchView />
        </React.Suspense>
      );

    // ---------------------------------------------------------------------------
    // User Preferences
    // ---------------------------------------------------------------------------

    case 'SETTINGS':
      return (
        <React.Suspense fallback={<SuspenseFallback tab={tab} />}>
          <SettingsView />
        </React.Suspense>
      );

    default:
      return (
        <div className="flex items-center justify-center h-full text-text-ops-muted">
          <p className="text-sm">Unknown view type: {tab.viewType}</p>
        </div>
      );
  }
};

export default ViewResolver;
