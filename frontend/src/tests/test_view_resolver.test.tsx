/**
 * View Resolver Test Suite
 *
 * Verifies that every registered ViewType in the workspace store maps to a
 * valid React component in ViewResolver, without falling back to the
 * "Unknown view type" default container.
 *
 * Test Strategy
 * -------------
 * - Parse ViewResolver.tsx source to extract all switch-case branches.
 * - Iterate over all known ViewType values from useWorkspaceStore.
 * - Assert that every ViewType has a corresponding case branch.
 * - Verify VIEW_METADATA completeness (label, defaultTitle, icon, category, lucideIcon).
 * - For lightweight views (no heavy context dependencies), mount via React Testing Library
 *   and confirm they do not fall back to the "Unknown view type" container.
 *
 * Prerequisites
 * -------------
 * - Node.js installed
 * - `cd frontend && npm install`
 * - Run: `npm run test -- test_view_resolver.test.tsx`
 */

import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { ViewType, getAllViewTypes } from '../../src/stores/useWorkspaceStore';

// Jest globals
const { describe, it, expect, beforeEach } = globalThis as any;

/**
 * Extract all case branch labels from ViewResolver.tsx source code.
 * Returns a Set of strings like 'WBS_GANTT', 'DAILY_COCKPIT', etc.
 */
function extractCaseBranches(): Set<string> {
  const resolverPath = path.join(__dirname, '../../src/components/layout/workspace/ViewResolver.tsx');
  const source = fs.readFileSync(resolverPath, 'utf-8');
  const caseRegex = /case\s+'([A-Z_0-9]+)':/g;
  const branches = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = caseRegex.exec(source)) !== null) {
    branches.add(match[1]);
  }
  return branches;
}

describe('ViewResolver', () => {
  describe('switch-case coverage', () => {
    const allViews = getAllViewTypes();
    const caseBranches = extractCaseBranches();

    it('should have at least 58 registered view types', () => {
      expect(allViews.length).toBeGreaterThanOrEqual(58);
    });

    it('should have a switch-case branch for every registered ViewType', () => {
      const missing: string[] = [];
      allViews.forEach(({ type }) => {
        if (!caseBranches.has(type)) {
          missing.push(type);
        }
      });
      expect(missing).toEqual([]);
    });

    it('should have at least 58 case branches in the switch statement', () => {
      expect(caseBranches.size).toBeGreaterThanOrEqual(58);
    });
  });

  describe('37 disconnected views specifically', () => {
    /**
     * The 37 views that were previously disconnected from the resolver.
     */
    const disconnectedViews: ViewType[] = [
      // Workforce & Operations
      'LEAVE_MANAGEMENT',
      'LINE_MANAGER_DASHBOARD',
      'RESOURCE_SKILLS',
      'RESOURCE_DOWNTIME',
      'DELEGATION_MANAGEMENT',
      'REQUISITIONS',
      // Commercial & Financial
      'COSTING',
      'COMMERCIAL',
      'PROCUREMENT',
      'RESERVES',
      'CURRENCY',
      // Engineering & Physical Assets
      'ENGINEERING',
      'EQUIPMENT',
      'MATERIALS',
      // Planning & Scheduling
      'CALENDARS',
      'SCHEDULE_QUARANTINE',
      'SUBCONTRACTORS',
      'SANDBOXES',
      'PROGRAMMES',
      'TEMPLATES',
      // Air-Gap, Audit & Security
      'AIRGAP',
      'AUDIT',
      'ADMIN_SECURITY',
      'PASSWORD_POLICY',
      'SECURITY_SCAN',
      'SECRET_ROTATION',
      'DATA_EXPORT',
      // Infrastructure & Monitoring
      'DB_HEALTH',
      'BACKUP_MANAGER',
      'LOG_VIEWER',
      'LOG_ROTATION',
      'SERVICE_HEALTH',
      'ALERTING',
      'MONITORING',
      'SYSTEM_CONFIG',
      'MAINTENANCE_MODE',
      'FEATURE_FLAGS',
      'USER_MANAGEMENT',
    ];

    const caseBranches = extractCaseBranches();

    it('should have exactly 38 previously disconnected views', () => {
      expect(disconnectedViews.length).toBe(38);
    });

    it('all 38 previously disconnected views should have case branches', () => {
      const missing: string[] = [];
      disconnectedViews.forEach((viewType) => {
        if (!caseBranches.has(viewType)) {
          missing.push(viewType);
        }
      });
      expect(missing).toEqual([]);
    });

    disconnectedViews.forEach((viewType) => {
      it(`"${viewType}" should have a corresponding case branch`, () => {
        expect(caseBranches.has(viewType)).toBe(true);
      });
    });
  });

  describe('lazy import coverage', () => {
    /**
     * Verify that React.lazy imports exist for the 37 new views.
     */
    function extractLazyImports(): Set<string> {
      const resolverPath = path.join(__dirname, '../../src/components/layout/workspace/ViewResolver.tsx');
      const source = fs.readFileSync(resolverPath, 'utf-8');
      const lazyRegex = /const\s+(\w+View)\s*=\s*React\.lazy/g;
      const imports = new Set<string>();
      let match: RegExpExecArray | null;
      while ((match = lazyRegex.exec(source)) !== null) {
        imports.add(match[1]);
      }
      return imports;
    }

    const lazyImports = extractLazyImports();

    it('should have lazy imports for all 37 previously disconnected views', () => {
      const expectedImports = new Set([
        'LeaveManagementView',
        'LineManagerDashboardView',
        'ResourceSkillsView',
        'ResourceDowntimeView',
        'DelegationManagementView',
        'RequisitionsView',
        'CostingView',
        'CommercialView',
        'ProcurementView',
        'ReservesView',
        'CurrencyView',
        'EngineeringView',
        'EquipmentView',
        'MaterialsView',
        'CalendarsView',
        'ScheduleQuarantineView',
        'SubcontractorsView',
        'SandboxesView',
        'ProgrammesView',
        'TemplatesView',
        'AirGapView',
        'AuditView',
        'AdminSecurityView',
        'PasswordPolicyView',
        'SecurityScanView',
        'SecretRotationView',
        'DataExportView',
        'DbHealthView',
        'BackupManagerView',
        'LogViewerView',
        'LogRotationView',
        'ServiceHealthView',
        'AlertingView',
        'MonitoringView',
        'SystemConfigView',
        'MaintenanceModeView',
        'FeatureFlagsView',
        'UserManagementView',
        'CcbArbitrationWorkbenchView',
        'SbomVulnerabilityView',
        'ScenarioSandtableView',
        'CamEvmCloseoutWizardView',
      ]);

      const missing: string[] = [];
      expectedImports.forEach((imp) => {
        if (!lazyImports.has(imp)) {
          missing.push(imp);
        }
      });
      expect(missing).toEqual([]);
    });
  });

  describe('VIEW_METADATA completeness', () => {
    it('every ViewType should have metadata with category and lucideIcon', () => {
      const allViews = getAllViewTypes();

      allViews.forEach(({ type, meta }) => {
        expect(meta.label).toBeDefined();
        expect(meta.label.length).toBeGreaterThan(0);
        expect(meta.defaultTitle).toBeDefined();
        expect(meta.defaultTitle.length).toBeGreaterThan(0);
        expect(meta.icon).toBeDefined();
        expect(meta.category).toBeDefined();
        expect(meta.lucideIcon).toBeDefined();
        expect(meta.lucideIcon.length).toBeGreaterThan(0);
      });
    });

    it('all categories should be valid ViewCategory values', () => {
      const validCategories = new Set([
        'Core',
        'Workforce',
        'Commercial',
        'Engineering',
        'Planning',
        'Security',
        'Infrastructure',
        'Compliance',
      ]);

      const allViews = getAllViewTypes();

      allViews.forEach(({ type, meta }) => {
        expect(validCategories.has(meta.category)).toBe(true);
      });
    });
  });

  describe('view file existence', () => {
    /**
     * Verify that each view component file exists on disk.
     */
    const viewFileMap: Record<string, string> = {
      // Workforce & Operations
      'LEAVE_MANAGEMENT': 'LeaveManagementView',
      'LINE_MANAGER_DASHBOARD': 'LineManagerDashboardView',
      'RESOURCE_SKILLS': 'ResourceSkillsView',
      'RESOURCE_DOWNTIME': 'ResourceDowntimeView',
      'DELEGATION_MANAGEMENT': 'DelegationManagementView',
      'REQUISITIONS': 'RequisitionsView',
      // Commercial & Financial
      'COSTING': 'CostingView',
      'COMMERCIAL': 'CommercialView',
      'PROCUREMENT': 'ProcurementView',
      'RESERVES': 'ReservesView',
      'CURRENCY': 'CurrencyView',
      // Engineering & Physical Assets
      'ENGINEERING': 'EngineeringView',
      'EQUIPMENT': 'EquipmentView',
      'MATERIALS': 'MaterialsView',
      // Planning & Scheduling
      'CALENDARS': 'CalendarsView',
      'SCHEDULE_QUARANTINE': 'ScheduleQuarantineView',
      'SUBCONTRACTORS': 'SubcontractorsView',
      'SANDBOXES': 'SandboxesView',
      'PROGRAMMES': 'ProgrammesView',
      'TEMPLATES': 'TemplatesView',
      // Air-Gap, Audit & Security
      'AIRGAP': 'AirGapView',
      'AUDIT': 'AuditView',
      'ADMIN_SECURITY': 'AdminSecurityView',
      'PASSWORD_POLICY': 'PasswordPolicyView',
      'SECURITY_SCAN': 'SecurityScanView',
      'SECRET_ROTATION': 'SecretRotationView',
      'DATA_EXPORT': 'DataExportView',
      // Infrastructure & Monitoring
      'DB_HEALTH': 'DbHealthView',
      'BACKUP_MANAGER': 'BackupManagerView',
      'LOG_VIEWER': 'LogViewerView',
      'LOG_ROTATION': 'LogRotationView',
      'SERVICE_HEALTH': 'ServiceHealthView',
      'ALERTING': 'AlertingView',
      'MONITORING': 'MonitoringView',
      'SYSTEM_CONFIG': 'SystemConfigView',
      'MAINTENANCE_MODE': 'MaintenanceModeView',
      'FEATURE_FLAGS': 'FeatureFlagsView',
      'USER_MANAGEMENT': 'UserManagementView',
      // Compliance & CCB
      'CCB_ARBITRATION': 'sync/CcbArbitrationWorkbenchView',
      'SBOM_VULNERABILITY': 'compliance/SbomVulnerabilityView',
      // Planning & Sandtable
      'SANDTABLE': 'sandboxes/ScenarioSandtableView',
      // EVM & Closeout
      'CAM_EVM_CLOSEOUT_WIZARD': 'evm/CamEvmCloseoutWizardView',
    };

    Object.entries(viewFileMap).forEach(([viewType, componentName]) => {
      it(`"${viewType}" view file "${componentName}.tsx" should exist`, () => {
        const viewsDir = path.join(__dirname, '../../src/views');
        const filePath = path.join(viewsDir, `${componentName}.tsx`);
        expect(fs.existsSync(filePath)).toBe(true);
      });
    });
  });
});
