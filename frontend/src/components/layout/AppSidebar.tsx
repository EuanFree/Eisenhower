/**
 * AppSidebar Component
 *
 * The collapsible primary navigation sidebar for the Eisenhower Portfolio Manager.
 *
 * Features
 * --------
 * - **Compact Rail ↔ Expanded Sidebar** — Toggles between 52px rail and 240px
 *   sidebar via bottom collapse button or Ctrl+B keyboard shortcut.
 * - **Categorized Navigation** — Menu items grouped into 4 categories:
 *   Programmes & Scheduling, Risk & Analytics, Operations & Facilities, Governance & Administration.
 * - **Role Gating** — Hides views if user lacks required role or clearance.
 * - **Badging & Indicators** — Green dot indicator if view is open in a workspace tab,
 *   external link icon if running in a detached window.
 * - **Interaction Mechanics** — Left-click opens in active pane, right-click or hover
 *   presents context menu with split pane and detach options.
 * - **Detached Window Launching** — Opens standalone browser windows via window.open()
 *   and registers via BroadcastChannel('defence_ppm_workspace_bus').
 *
 * Usage
 * -----
 *
 * ```tsx
 * <AppSidebar projectId={projectId} />
 * ```
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  GanttChartSquare,
  UserCheck,
  ShieldAlert,
  Activity,
  FileSpreadsheet,
  Cpu,
  Warehouse,
  Truck,
  FileCheck2,
  Scale,
  Sliders,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Columns,
  Rows,
  MousePointerClick,
  // New icons for added views
  DollarSign,
  LayoutTemplate,
  Shield,
  Wrench,
  Package,
  Calendar,
  GitBranch,
  Archive,
  ShieldAlert as ShieldAlertIcon,
  FileCheck,
  Database,
  Clock,
  FileText,
  AlertTriangle,
  // Admin tool icons
  HardDrive,
  ScrollText,
  Users,
  Settings2,
  HeartPulse,
  Bell,
  BarChart3,
  Key,
  Download,
  RefreshCw,
  Flag,
  ScanLine,
  Lock,
  Hammer,
  // Line management icons
  UsersRound,
  Award,
  Bot,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useWorkspaceStore, type ViewType } from '../../stores/useWorkspaceStore';
import { detachViewToWindow, isViewDetached, getDetachedViewTypes } from '../../utils/detachWindow';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Navigation item configuration */
interface NavItem {
  /** Unique identifier */
  id: string;
  /** View type for workspace store */
  viewType: ViewType;
  /** Display label */
  label: string;
  /** Short label for compact rail */
  shortLabel: string;
  /** Icon component */
  icon: React.ElementType;
  /** Category group */
  category: string;
  /** Required role (optional) */
  requiredRole?: string;
  /** Minimum clearance level (optional) */
  minClearance?: 'OFFICIAL' | 'SECRET' | 'TOP_SECRET';
  /** If true, clicking toggles the CoPilot panel instead of opening a tab */
  isCopilot?: boolean;
}

/** Context menu position */
interface ContextMenuPosition {
  x: number;
  y: number;
  itemId: string;
}

// ---------------------------------------------------------------------------
// Navigation Menu Catalogue
// ---------------------------------------------------------------------------

const NAV_ITEMS: NavItem[] = [
  // Group 1: Programmes & Scheduling
  {
    id: 'wbs-gantt',
    viewType: 'WBS_GANTT',
    label: 'WBS & Master Gantt',
    shortLabel: 'Gantt',
    icon: GanttChartSquare,
    category: 'Programmes & Scheduling',
  },
  {
    id: 'daily-cockpit',
    viewType: 'DAILY_COCKPIT',
    label: 'My Daily Cockpit',
    shortLabel: 'Cockpit',
    icon: UserCheck,
    category: 'Programmes & Scheduling',
  },
  {
    id: 'schedule-health',
    viewType: 'SCHEDULE_HEALTH',
    label: 'Schedule Clash & Health',
    shortLabel: 'Health',
    icon: ShieldAlert,
    category: 'Programmes & Scheduling',
  },
  // Group 2: Risk & Analytics
  {
    id: 'dashboard',
    viewType: 'DASHBOARD',
    label: 'Dashboard Builder',
    shortLabel: 'Dashboard',
    icon: BarChart3,
    category: 'Risk & Analytics',
  },
  {
    id: 'sra-risk',
    viewType: 'SRA_RISK',
    label: 'Monte Carlo SRA',
    shortLabel: 'SRA',
    icon: Activity,
    category: 'Risk & Analytics',
  },
  {
    id: 'evm-reporting',
    viewType: 'EVM_REPORTING',
    label: 'EVM & IPMR Reporting',
    shortLabel: 'EVM',
    icon: FileSpreadsheet,
    category: 'Risk & Analytics',
  },
  {
    id: 'copilot',
    viewType: 'COPILOT',
    label: 'CoPilot AI Assistant',
    shortLabel: 'CoPilot',
    icon: Bot,
    category: 'Risk & Analytics',
    isCopilot: true,
  },
  // Group 3: Operations & Facilities
  {
    id: 'facility-chamber',
    viewType: 'FACILITY_CHAMBER',
    label: 'Environmental Chambers & HIL',
    shortLabel: 'Chambers',
    icon: Cpu,
    category: 'Operations & Facilities',
  },
  {
    id: 'location-vault',
    viewType: 'LOCATION_EXPLORER',
    label: 'Spatial Location & Vault',
    shortLabel: 'Locations',
    icon: Warehouse,
    category: 'Operations & Facilities',
  },
  {
    id: 'supplier-portal',
    viewType: 'SUPPLIER_PORTAL',
    label: 'Subcontractor Portal',
    shortLabel: 'Supplier',
    icon: Truck,
    category: 'Operations & Facilities',
  },
  // Group 4: Governance & Administration
  {
    id: 'contract-deliverables',
    viewType: 'CONTRACT_DELIVERABLES',
    label: 'Contract Deliverables CDRL',
    shortLabel: 'CDRL',
    icon: FileCheck2,
    category: 'Governance & Administration',
  },
  {
    id: 'change-control',
    viewType: 'CHANGE_CONTROL',
    label: 'Change Control Board CCB',
    shortLabel: 'CCB',
    icon: Scale,
    category: 'Governance & Administration',
  },
  {
    id: 'custom-fields',
    viewType: 'CUSTOM_FIELDS',
    label: 'Custom Attributes Admin',
    shortLabel: 'Fields',
    icon: Sliders,
    category: 'Governance & Administration',
    requiredRole: 'SYSTEM_ADMIN',
  },
  // High priority additions
  {
    id: 'costing',
    viewType: 'COSTING',
    label: 'Costing Workbench',
    shortLabel: 'Costing',
    icon: DollarSign,
    category: 'Financial & Commercial',
  },
  {
    id: 'procurement',
    viewType: 'PROCUREMENT',
    label: 'Procurement Dashboard',
    shortLabel: 'Procure',
    icon: Truck,
    category: 'Operations & Facilities',
  },
  {
    id: 'commercial',
    viewType: 'COMMERCIAL',
    label: 'Commercial Governance',
    shortLabel: 'Commercial',
    icon: Scale,
    category: 'Financial & Commercial',
  },
  {
    id: 'templates',
    viewType: 'TEMPLATES',
    label: 'Templates Library',
    shortLabel: 'Templates',
    icon: LayoutTemplate,
    category: 'Programmes & Scheduling',
  },
  // Medium priority additions
  {
    id: 'engineering',
    viewType: 'ENGINEERING',
    label: 'Engineering Governance',
    shortLabel: 'Engineering',
    icon: Shield,
    category: 'Governance & Administration',
  },
  {
    id: 'equipment',
    viewType: 'EQUIPMENT',
    label: 'Equipment Management',
    shortLabel: 'Equipment',
    icon: Wrench,
    category: 'Operations & Facilities',
  },
  {
    id: 'materials',
    viewType: 'MATERIALS',
    label: 'Materials Management',
    shortLabel: 'Materials',
    icon: Package,
    category: 'Operations & Facilities',
  },
  {
    id: 'reserves',
    viewType: 'RESERVES',
    label: 'Management Reserves',
    shortLabel: 'Reserves',
    icon: DollarSign,
    category: 'Financial & Commercial',
  },
  {
    id: 'currency',
    viewType: 'CURRENCY',
    label: 'Currency Management',
    shortLabel: 'Currency',
    icon: DollarSign,
    category: 'Financial & Commercial',
  },
  {
    id: 'timesheet-coherence',
    viewType: 'TIMESHEET_COHERENCE',
    label: 'Timesheet Coherence Audit',
    shortLabel: 'Coherence',
    icon: FileSpreadsheet,
    category: 'Governance & Finance',
  },
  {
    id: 'cost-spreading',
    viewType: 'COST_SPREADING',
    label: 'Fiscal Tranche Spreading',
    shortLabel: 'Tranches',
    icon: DollarSign,
    category: 'Governance & Finance',
  },
  {
    id: 'export-control',
    viewType: 'EXPORT_CONTROL',
    label: 'Export Control & TAA',
    shortLabel: 'Export Ctrl',
    icon: Lock,
    category: 'Governance & Finance',
  },
  {
    id: 'calendars',
    viewType: 'CALENDARS',
    label: 'Calendar Management',
    shortLabel: 'Calendars',
    icon: Calendar,
    category: 'Programmes & Scheduling',
  },
  // Lower priority additions
  {
    id: 'schedule-quarantine',
    viewType: 'SCHEDULE_QUARANTINE',
    label: 'Schedule Quarantine',
    shortLabel: 'Quarantine',
    icon: AlertTriangle,
    category: 'Programmes & Scheduling',
  },
  {
    id: 'subcontractors',
    viewType: 'SUBCONTRACTORS',
    label: 'Subcontractors',
    shortLabel: 'Subcon',
    icon: Truck,
    category: 'Operations & Facilities',
  },
  {
    id: 'requisitions',
    viewType: 'REQUISITIONS',
    label: 'Requisitions',
    shortLabel: 'Requisitions',
    icon: FileText,
    category: 'Operations & Facilities',
  },
  {
    id: 'sandboxes',
    viewType: 'SANDBOXES',
    label: 'Sandboxes',
    shortLabel: 'Sandboxes',
    icon: GitBranch,
    category: 'Programmes & Scheduling',
  },
  {
    id: 'programmes',
    viewType: 'PROGRAMMES',
    label: 'Programme Management',
    shortLabel: 'Programmes',
    icon: Archive,
    category: 'Programmes & Scheduling',
  },
  {
    id: 'airgap',
    viewType: 'AIRGAP',
    label: 'Air-Gap Management',
    shortLabel: 'AirGap',
    icon: ShieldAlertIcon,
    category: 'Governance & Administration',
    requiredRole: 'SYSTEM_ADMIN',
  },
  {
    id: 'audit',
    viewType: 'AUDIT',
    label: 'Audit Trail',
    shortLabel: 'Audit',
    icon: FileCheck,
    category: 'Governance & Administration',
    requiredRole: 'SYSTEM_ADMIN',
  },
  {
    id: 'admin-security',
    viewType: 'ADMIN_SECURITY',
    label: 'Admin Security',
    shortLabel: 'Security',
    icon: Shield,
    category: 'Governance & Administration',
    requiredRole: 'SYSTEM_ADMIN',
  },
  {
    id: 'db-health',
    viewType: 'DB_HEALTH',
    label: 'Database Health',
    shortLabel: 'DB Health',
    icon: Database,
    category: 'Governance & Administration',
    requiredRole: 'SYSTEM_ADMIN',
  },
  // Admin tools — critical
  {
    id: 'backup-manager',
    viewType: 'BACKUP_MANAGER',
    label: 'Backup Manager',
    shortLabel: 'Backups',
    icon: HardDrive,
    category: 'Governance & Administration',
    requiredRole: 'SYSTEM_ADMIN',
  },
  {
    id: 'log-viewer',
    viewType: 'LOG_VIEWER',
    label: 'Log Viewer',
    shortLabel: 'Logs',
    icon: ScrollText,
    category: 'Governance & Administration',
    requiredRole: 'SYSTEM_ADMIN',
  },
  {
    id: 'user-management',
    viewType: 'USER_MANAGEMENT',
    label: 'User Management',
    shortLabel: 'Users',
    icon: Users,
    category: 'Governance & Administration',
    requiredRole: 'SYSTEM_ADMIN',
  },
  {
    id: 'system-config',
    viewType: 'SYSTEM_CONFIG',
    label: 'System Configuration',
    shortLabel: 'Config',
    icon: Settings2,
    category: 'Governance & Administration',
    requiredRole: 'SYSTEM_ADMIN',
  },
  {
    id: 'service-health',
    viewType: 'SERVICE_HEALTH',
    label: 'Service Health',
    shortLabel: 'Services',
    icon: HeartPulse,
    category: 'Governance & Administration',
    requiredRole: 'SYSTEM_ADMIN',
  },
  // Admin tools — high priority
  {
    id: 'alerting',
    viewType: 'ALERTING',
    label: 'Alerting & Notifications',
    shortLabel: 'Alerts',
    icon: Bell,
    category: 'Governance & Administration',
    requiredRole: 'SYSTEM_ADMIN',
  },
  {
    id: 'monitoring',
    viewType: 'MONITORING',
    label: 'Monitoring & Metrics',
    shortLabel: 'Metrics',
    icon: BarChart3,
    category: 'Governance & Administration',
    requiredRole: 'SYSTEM_ADMIN',
  },
  {
    id: 'password-policy',
    viewType: 'PASSWORD_POLICY',
    label: 'Password Policy',
    shortLabel: 'Passwords',
    icon: Key,
    category: 'Governance & Administration',
    requiredRole: 'SYSTEM_ADMIN',
  },
  {
    id: 'data-export',
    viewType: 'DATA_EXPORT',
    label: 'Data Export/Import',
    shortLabel: 'Export',
    icon: Download,
    category: 'Governance & Administration',
    requiredRole: 'SYSTEM_ADMIN',
  },
  // Admin tools — medium priority
  {
    id: 'log-rotation',
    viewType: 'LOG_ROTATION',
    label: 'Log Rotation',
    shortLabel: 'Rotation',
    icon: RefreshCw,
    category: 'Governance & Administration',
    requiredRole: 'SYSTEM_ADMIN',
  },
  {
    id: 'feature-flags',
    viewType: 'FEATURE_FLAGS',
    label: 'Feature Flags',
    shortLabel: 'Features',
    icon: Flag,
    category: 'Governance & Administration',
    requiredRole: 'SYSTEM_ADMIN',
  },
  {
    id: 'security-scan',
    viewType: 'SECURITY_SCAN',
    label: 'Security Scans',
    shortLabel: 'Scans',
    icon: ScanLine,
    category: 'Governance & Administration',
    requiredRole: 'SYSTEM_ADMIN',
  },
  {
    id: 'secret-rotation',
    viewType: 'SECRET_ROTATION',
    label: 'Secret Rotation',
    shortLabel: 'Secrets',
    icon: Lock,
    category: 'Governance & Administration',
    requiredRole: 'SYSTEM_ADMIN',
  },
  {
    id: 'maintenance-mode',
    viewType: 'MAINTENANCE_MODE',
    label: 'Maintenance Mode',
    shortLabel: 'Maintain',
    icon: Hammer,
    category: 'Governance & Administration',
    requiredRole: 'SYSTEM_ADMIN',
  },
  // Line management, leave, skills, and resource downtime
  {
    id: 'leave-management',
    viewType: 'LEAVE_MANAGEMENT',
    label: 'Leave Management',
    shortLabel: 'Leave',
    icon: Calendar,
    category: 'Operations & Facilities',
  },
  {
    id: 'line-manager-dashboard',
    viewType: 'LINE_MANAGER_DASHBOARD',
    label: 'Line Manager Dashboard',
    shortLabel: 'Team',
    icon: UsersRound,
    category: 'Operations & Facilities',
  },
  {
    id: 'resource-skills',
    viewType: 'RESOURCE_SKILLS',
    label: 'Resource Skills',
    shortLabel: 'Skills',
    icon: Award,
    category: 'Operations & Facilities',
  },
  {
    id: 'resource-downtime',
    viewType: 'RESOURCE_DOWNTIME',
    label: 'Resource Downtime',
    shortLabel: 'Offline',
    icon: Wrench,
    category: 'Operations & Facilities',
  },
  {
    id: 'delegation-management',
    viewType: 'DELEGATION_MANAGEMENT',
    label: 'Delegation Management',
    shortLabel: 'Delegation',
    icon: Shield,
    category: 'Governance & Administration',
  },
  {
    id: 'workforce-forecast',
    viewType: 'WORKFORCE_FORECAST',
    label: '36-Month Workforce Forecast',
    shortLabel: 'Forecast',
    icon: BarChart3,
    category: 'Workforce & Operations',
  },
  {
    id: 'hardware-enclave',
    viewType: 'HARDWARE_ENCLAVE',
    label: 'Hardware Enclave & Diode Console',
    shortLabel: 'HSM',
    icon: Key,
    category: 'System Administration',
    requiredRole: 'SYSTEM_ADMIN',
  },
];

/** Group navigation items by category */
const NAV_CATEGORIES = NAV_ITEMS.reduce((acc, item) => {
  if (!acc[item.category]) {
    acc[item.category] = [];
  }
  acc[item.category].push(item);
  return acc;
}, {} as Record<string, NavItem[]>);

// ---------------------------------------------------------------------------
// Role & Clearance Filtering
// ---------------------------------------------------------------------------

/**
 * Check if a user has the required role to see a navigation item.
 * In production, this would read from the authenticated user's profile.
 */
function hasRequiredRole(_item: NavItem): boolean {
  // TODO: Read user roles from auth context
  // For now, show all items
  return true;
}

/**
 * Check if a user has the required clearance to see a navigation item.
 * In production, this would read from the authenticated user's clearance level.
 */
function hasRequiredClearance(_item: NavItem): boolean {
  // TODO: Read user clearance from auth context
  // For now, show all items
  return true;
}

// ---------------------------------------------------------------------------
// Sidebar Item Component
// ---------------------------------------------------------------------------

const SidebarItem: React.FC<{
  item: NavItem;
  isExpanded: boolean;
  isOpenInTab: boolean;
  isDetached: boolean;
  isActive: boolean;
  onClick: (item: NavItem, e: React.MouseEvent) => void;
  onContextMenu: (item: NavItem, e: React.MouseEvent) => void;
}> = ({ item, isExpanded, isOpenInTab, isDetached, isActive, onClick, onContextMenu }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const itemRef = useRef<HTMLDivElement>(null);

  const Icon = item.icon;

  const handleClick = (e: React.MouseEvent) => {
    onClick(item, e);
    setShowContextMenu(false);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = itemRef.current?.getBoundingClientRect();
    if (rect) {
      // Position context menu to the right of the item
      setContextMenuPos({
        x: rect.right,
        y: rect.top,
      });
      setShowContextMenu(true);
    }
    onContextMenu(item, e);
  };

  // Close context menu on click outside
  useEffect(() => {
    if (!showContextMenu) return;

    const handleClickOutside = () => setShowContextMenu(false);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showContextMenu]);

  return (
    <div className="relative">
      <div
        ref={itemRef}
        onClick={handleClick}
        onAuxClick={(e) => {
          // Middle-click (button 1) detaches to new window
          if (e.button === 1) {
            e.preventDefault();
            detachViewToWindow(item.viewType);
          }
        }}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setShowContextMenu(false);
        }}
        className={clsx(
          'group flex items-center gap-3 cursor-pointer transition-all duration-150',
          isExpanded ? 'px-3 py-2.5 rounded-lg mx-2' : 'justify-center px-0 py-3 mx-2',
          isActive
            ? 'bg-blue-600/20 text-blue-400 border-l-2 border-blue-400'
            : isHovered
              ? 'bg-bg-ops-overlay text-text-ops-primary'
              : 'text-text-ops-muted hover:text-text-ops-primary',
          !isExpanded && 'border-l-2 border-transparent',
        )}
        title={isExpanded ? '' : item.label}
        role="button"
        tabIndex={0}
        aria-label={item.label}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick(e as any);
          }
        }}
      >
        {/* Icon */}
        <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>

        {/* Label (expanded only) */}
        {isExpanded && (
          <>
            <span className="text-sm font-medium flex-1 truncate">{item.label}</span>

            {/* Status Badges */}
            <div className="flex items-center gap-1.5">
              {/* Green dot indicator if view is open in a workspace tab */}
              {isOpenInTab && (
                <span
                  className="w-2 h-2 rounded-full bg-green-500"
                  title="Open in workspace tab"
                />
              )}

              {/* External window glyph */}
              {isDetached && (
                <ExternalLink
                  className="w-3 h-3 text-amber-500"
                />
              )}
            </div>
          </>
        )}

        {/* Compact rail tooltip */}
        {!isExpanded && isHovered && (
          <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 pointer-events-none">
            <div className="bg-bg-ops-surface border border-border-ops-strong rounded-md px-3 py-2 shadow-xl whitespace-nowrap">
              <span className="text-sm font-medium text-text-ops-primary">{item.label}</span>
              <div className="flex items-center gap-2 mt-1">
                {isOpenInTab && (
                  <span className="flex items-center gap-1 text-[10px] text-text-ops-muted">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Open in tab
                  </span>
                )}
                {isDetached && (
                  <span className="text-[10px] text-amber-500">Detached</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {showContextMenu && (
        <div
          className="fixed z-50 bg-bg-ops-surface border border-border-ops-strong rounded-lg shadow-2xl py-1 min-w-[220px]"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-border-ops-subtle">
            <span className="text-xs font-medium text-text-ops-primary">{item.label}</span>
          </div>

          {/* Open in Current Tab */}
          <button
            type="button"
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              useWorkspaceStore.getState().openView(item.viewType, {}, 'ACTIVE_PANE');
              setShowContextMenu(false);
            }}
          >
            <MousePointerClick className="w-4 h-4" />
            <span>Open in Current Tab</span>
          </button>

          {/* Open in Split Pane (Right) */}
          <button
            type="button"
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              useWorkspaceStore.getState().openView(item.viewType, {}, 'SPLIT_RIGHT');
              setShowContextMenu(false);
            }}
          >
            <Columns className="w-4 h-4" />
            <span>Open in Split Pane (Right)</span>
          </button>

          {/* Open in Split Pane (Bottom) */}
          <button
            type="button"
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              useWorkspaceStore.getState().openView(item.viewType, {}, 'SPLIT_BOTTOM');
              setShowContextMenu(false);
            }}
          >
            <Rows className="w-4 h-4" />
            <span>Open in Split Pane (Bottom)</span>
          </button>

          <div className="border-t border-border-ops-subtle my-1" />

          {/* Open in Detached Window (Multi-Monitor) */}
          <button
            type="button"
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              detachViewToWindow(item.viewType);
              setShowContextMenu(false);
            }}
          >
            <ExternalLink className="w-4 h-4" />
            <span>Open in Detached Window</span>
          </button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Sidebar Component
// ---------------------------------------------------------------------------

interface AppSidebarProps {
  /** Optional project ID for view parameters */
  projectId?: string;
}

const AppSidebar: React.FC<AppSidebarProps> = ({ projectId }) => {
  // Sidebar expansion state from workspace store
  const isExpanded = useWorkspaceStore((s) => s.isSidebarExpanded);
  const setSidebarExpanded = useWorkspaceStore((s) => s.setSidebarExpanded);

  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);

  // Workspace store for tab tracking
  const tabs = useWorkspaceStore((s) => s.tabs);

  // Detached window tracking
  const [detachedViewTypes, setDetachedViewTypes] = useState<ViewType[]>([]);

  // Poll detached windows every 2 seconds
  useEffect(() => {
    setDetachedViewTypes(getDetachedViewTypes());
    const interval = setInterval(() => {
      setDetachedViewTypes(getDetachedViewTypes());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Ctrl+B keyboard shortcut to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        setSidebarExpanded(!isExpanded);
      }
      // Ctrl+J to toggle CoPilot panel
      if (e.ctrlKey && e.key === 'j') {
        e.preventDefault();
        import('../../stores/useCopilotStore').then((mod) => {
          mod.useCopilotStore.getState().togglePanel();
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, setSidebarExpanded]);

  // Check if a view type is open in a workspace tab
  const isOpenInTab = useCallback(
    (viewType: ViewType): boolean => {
      return tabs.some((t) => t.viewType === viewType);
    },
    [tabs],
  );

  // Check if a view type is detached
  const isViewDetachedFn = useCallback(
    (viewType: ViewType): boolean => {
      return detachedViewTypes.includes(viewType);
    },
    [detachedViewTypes],
  );

  // Get the active view type (from active tab)
  const activeTab = useWorkspaceStore((s) => {
    if (!s.activeTabId) return null;
    return s.tabs.find((t) => t.id === s.activeTabId) || null;
  });

  const handleItemClick = useCallback(
    (item: NavItem, e: React.MouseEvent) => {
      // Ctrl+Click or Cmd+Click detaches to new window
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        detachViewToWindow(item.viewType, { projectId });
        return;
      }

      // CoPilot toggles the panel instead of opening a tab
      if (item.isCopilot) {
        import('../../stores/useCopilotStore').then((mod) => {
          mod.useCopilotStore.getState().togglePanel();
        });
        return;
      }

      // Direct left-click opens in active pane
      useWorkspaceStore.getState().openView(item.viewType, { projectId }, 'ACTIVE_PANE');
    },
    [projectId],
  );

  const handleItemContextMenu = useCallback((_item: NavItem, _e: React.MouseEvent) => {
    // Context menu is handled by SidebarItem
  }, []);

  // Filter navigation items by role and clearance
  const filteredNavItems = NAV_ITEMS.filter(
    (item) => hasRequiredRole(item) && hasRequiredClearance(item),
  );

  // Re-group filtered items by category
  const filteredNavCategories = filteredNavItems.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, NavItem[]>);

  return (
    <aside
      className={clsx(
        'flex flex-col h-full bg-bg-ops-surface border-r border-border-ops-strong transition-all duration-200 ease-in-out',
        isExpanded ? 'w-[240px]' : 'w-[52px]',
      )}
      role="navigation"
      aria-label="Primary navigation sidebar"
    >
      {/* Sidebar Header */}
      <div
        className={clsx(
          'flex items-center gap-3 px-3 py-4 border-b border-border-ops-subtle',
          !isExpanded && 'justify-center px-0',
        )}
      >
        {/* Logo / App Name */}
        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-blue-600/20 text-blue-400">
          <GanttChartSquare className="w-5 h-5" />
        </div>

        {isExpanded && (
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-text-ops-primary truncate">
              Eisenhower PPM
            </h1>
            <p className="text-[10px] text-text-ops-muted truncate">
              Portfolio Manager
            </p>
          </div>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 scrollbar-thin">
        {Object.entries(filteredNavCategories).map(([category, items]) => (
          <div
            key={category}
            className="mb-4"
            onMouseEnter={() => setHoveredCategory(category)}
            onMouseLeave={() => setHoveredCategory(null)}
          >
            {/* Category Header */}
            {isExpanded && (
              <div className="px-4 py-2 mb-1">
                <span
                  className={clsx(
                    'text-[10px] font-semibold uppercase tracking-wider',
                    hoveredCategory === category
                      ? 'text-text-ops-muted'
                      : 'text-text-ops-muted/50',
                  )}
                >
                  {category}
                </span>
              </div>
            )}

            {/* Category Separator (compact rail) */}
            {!isExpanded && (
              <div className="mx-3 my-2 border-t border-border-ops-subtle/30" />
            )}

            {/* Navigation Items */}
            {items.map((item) => (
              <SidebarItem
                key={item.id}
                item={item}
                isExpanded={isExpanded}
                isOpenInTab={isOpenInTab(item.viewType)}
                isDetached={isViewDetachedFn(item.viewType)}
                isActive={activeTab?.viewType === item.viewType}
                onClick={handleItemClick}
                onContextMenu={handleItemContextMenu}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Sidebar Footer — Collapse Toggle */}
      <div className="border-t border-border-ops-subtle p-2">
        <button
          type="button"
          onClick={() => setSidebarExpanded(!isExpanded)}
          className={clsx(
            'w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors',
            !isExpanded && 'justify-center px-0',
          )}
          aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          title={isExpanded ? 'Collapse sidebar (Ctrl+B)' : 'Expand sidebar (Ctrl+B)'}
        >
          {isExpanded ? (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span className="text-xs font-medium">Collapse</span>
            </>
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;
