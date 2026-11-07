/**
 * Export Control Compliance Dashboard & Foreign Disclosure Licensing Workbench
 *
 * Target route: /compliance/export-control
 *
 * Provides a single-pane view for defence programme export control compliance:
 *
 * 1. **Top Metrics Cards** — Active Licenses (DSP-5, TAA, MLA, UK SIEL),
 *    Remaining Monetary Ceiling, Flagged Foreign National Accesses,
 *    Pending Disclosure Reviews.
 *
 * 2. **Technical Assistance Agreement (TAA) Balance Table** — Lists all active
 *    licenses with regime, authorized nations, approved CAGEs, monetary ceiling,
 *    drawn value, balance remaining, expiration date, and status. Each row has
 *    a progress bar visualising current_drawn_value vs monetary_ceiling and
 *    action buttons (View Linked Work Packages, Audit Access Log, Renew/Extend).
 *
 * 3. **License Quota Drawdown Warning Dialog** — Triggered when a proposed
 *    spend exceeds 90% of remaining license authority.
 *
 * 4. **National Caveats & Boundary Indicators** — Export control security badges
 *    (ITAR, EAR99, UK EYES ONLY pills) integrated into WbsTable and FocusQueue.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Shield,
  FileText,
  AlertTriangle,
  Clock,
  DollarSign,
  Globe,
  Lock,
  Eye,
  Activity,
  RefreshCw,
  ExternalLink,
  AlertOctagon,
  X,
  CheckCircle2,
  TriangleAlert,
} from 'lucide-react';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LicenseRegime = 'ITAR' | 'EAR' | 'UK_ML' | 'EAR99' | 'NOT_CONTROLLED';

export type LicenseStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'SUSPENDED';

export interface ExportLicense {
  id: string;
  license_type: string;       // DSP-5, TAA, MLA, UK_SIEL
  license_reference: string;
  regime: LicenseRegime;
  authorized_nations: string[];
  authorized_cages: string[];
  monetary_ceiling: number | null;
  current_drawn_value: number;
  effective_date: string;
  expiration_date: string;
  status: LicenseStatus;
  issuing_authority: string;
  linked_work_packages: string[]; // node IDs
}

export interface ComplianceMetrics {
  activeLicenses: number;
  remainingCeiling: number;
  flaggedForeignAccesses: number;
  pendingDisclosures: number;
}

export interface DrawdownWarningProps {
  open: boolean;
  licenseRef: string;
  proposedSpend: number;
  remainingCeiling: number;
  thresholdPct: number;
  onConfirm: () => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_LICENSES: ExportLicense[] = [
  {
    id: 'lic-001',
    license_type: 'TAA',
    license_reference: 'TAA-2026-UK-004',
    regime: 'ITAR',
    authorized_nations: ['GB', 'CA', 'AU'],
    authorized_cages: ['12345', '67890', 'ABCDE'],
    monetary_ceiling: 5_000_000,
    current_drawn_value: 3_850_000,
    effective_date: '2026-01-15',
    expiration_date: '2027-01-14',
    status: 'ACTIVE',
    issuing_authority: 'US State Department',
    linked_work_packages: ['wp-001', 'wp-003'],
  },
  {
    id: 'lic-002',
    license_type: 'DSP-5',
    license_reference: 'DSP-5-2026-DE-012',
    regime: 'EAR',
    authorized_nations: ['DE', 'FR'],
    authorized_cages: ['F1234'],
    monetary_ceiling: 2_500_000,
    current_drawn_value: 2_100_000,
    effective_date: '2026-03-01',
    expiration_date: '2026-12-31',
    status: 'EXPIRING_SOON',
    issuing_authority: 'BIS',
    linked_work_packages: ['wp-002'],
  },
  {
    id: 'lic-003',
    license_type: 'UK_SIEL',
    license_reference: 'SIEL-2026-00891',
    regime: 'UK_ML',
    authorized_nations: ['GB'],
    authorized_cages: ['UK001', 'UK002'],
    monetary_ceiling: 10_000_000,
    current_drawn_value: 4_200_000,
    effective_date: '2026-04-01',
    expiration_date: '2028-03-31',
    status: 'ACTIVE',
    issuing_authority: 'UK Export Control Joint Unit',
    linked_work_packages: ['wp-001', 'wp-004', 'wp-005'],
  },
  {
    id: 'lic-004',
    license_type: 'MLA',
    license_reference: 'MLA-2025-CA-003',
    regime: 'ITAR',
    authorized_nations: ['CA'],
    authorized_cages: ['CA999'],
    monetary_ceiling: 1_500_000,
    current_drawn_value: 1_425_000,
    effective_date: '2025-06-01',
    expiration_date: '2026-05-31',
    status: 'EXPIRING_SOON',
    issuing_authority: 'DDTC',
    linked_work_packages: ['wp-006'],
  },
  {
    id: 'lic-005',
    license_type: 'TAA',
    license_reference: 'TAA-2026-AU-007',
    regime: 'EAR',
    authorized_nations: ['AU', 'NZ'],
    authorized_cages: ['AU100'],
    monetary_ceiling: null,
    current_drawn_value: 0,
    effective_date: '2026-06-01',
    expiration_date: '2029-05-31',
    status: 'ACTIVE',
    issuing_authority: 'US State Department',
    linked_work_packages: ['wp-007'],
  },
];

const MOCK_METRICS: ComplianceMetrics = {
  activeLicenses: 5,
  remainingCeiling: 14_125_000,
  flaggedForeignAccesses: 3,
  pendingDisclosures: 7,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function utilizationPct(license: ExportLicense): number {
  if (!license.monetary_ceiling || license.monetary_ceiling === 0) return 0;
  return (license.current_drawn_value / license.monetary_ceiling) * 100;
}

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

/**
 * Metric Card — Top-level KPI display.
 */
interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
  color: string;
  alert?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({ icon, label, value, subtitle, color, alert }) => (
  <div
    className={clsx(
      'relative p-4 rounded-xl border bg-bg-ops-overlay/50',
      alert
        ? 'border-red-500/40 ring-1 ring-red-500/20'
        : 'border-border-ops-subtle',
    )}
  >
    <div className="flex items-start justify-between">
      <div className="space-y-2">
        <p className="text-xs text-text-ops-muted uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold font-mono text-text-ops-primary">{value}</p>
        {subtitle && <p className="text-xs text-text-ops-muted">{subtitle}</p>}
      </div>
      <div className={clsx('p-2.5 rounded-lg', color)}>{icon}</div>
    </div>
    {alert && (
      <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 animate-pulse" />
    )}
  </div>
);

/**
 * Regime Badge — Colored pill for ITAR, EAR, UK ML regimes.
 */
const RegimeBadge: React.FC<{ regime: LicenseRegime }> = ({ regime }) => {
  const config = {
    ITAR: 'bg-red-900/40 text-red-400 border-red-800/40',
    EAR: 'bg-amber-900/40 text-amber-400 border-amber-800/40',
    UK_ML: 'bg-sky-900/40 text-sky-400 border-sky-800/40',
    EAR99: 'bg-emerald-900/40 text-emerald-400 border-emerald-800/40',
    NOT_CONTROLLED: 'bg-gray-900/40 text-gray-400 border-gray-800/40',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border',
        config[regime],
      )}
    >
      {regime === 'ITAR' && <Lock size={10} className="mr-1" />}
      {regime}
    </span>
  );
};

/**
 * Status Badge — License status indicator.
 */
const StatusBadge: React.FC<{ status: LicenseStatus }> = ({ status }) => {
  const config = {
    ACTIVE: 'bg-emerald-900/40 text-emerald-400',
    EXPIRING_SOON: 'bg-amber-900/40 text-amber-400',
    EXPIRED: 'bg-red-900/40 text-red-400',
    SUSPENDED: 'bg-gray-900/40 text-gray-400',
  };

  const label = {
    ACTIVE: 'Active',
    EXPIRING_SOON: 'Expiring Soon',
    EXPIRED: 'Expired',
    SUSPENDED: 'Suspended',
  };

  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded', config[status])}>
      {status === 'ACTIVE' && <CheckCircle2 size={10} className="mr-1" />}
      {status === 'EXPIRING_SOON' && <TriangleAlert size={10} className="mr-1" />}
      {label[status]}
    </span>
  );
};

/**
 * Drawdown Progress Bar — Visualises drawn vs ceiling.
 */
const DrawdownProgressBar: React.FC<{ license: ExportLicense }> = ({ license }) => {
  const pct = utilizationPct(license);
  const color = pct > 100 ? 'bg-red-500' : pct > 90 ? 'bg-amber-500' : 'bg-emerald-500';

  if (!license.monetary_ceiling) {
    return (
      <span className="text-xs text-text-ops-muted italic">No monetary limit</span>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-text-ops-muted">
        <span>{pct.toFixed(1)}% utilised</span>
        <span>{formatCurrency(license.monetary_ceiling - license.current_drawn_value)} remaining</span>
      </div>
      <div className="h-2 bg-bg-ops-overlay rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-300', color)}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
};

/**
 * License Quota Drawdown Warning Dialog
 *
 * Triggered during purchase order or subcontract milestone commitments if
 * proposed spend exceeds 90% of remaining license authority.
 */
const DrawdownWarningDialog: React.FC<DrawdownWarningProps> = ({
  open,
  licenseRef,
  proposedSpend,
  remainingCeiling,
  thresholdPct,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  const newUtilization = ((proposedSpend / remainingCeiling) * 100).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-red-500/40 bg-bg-ops-base shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-ops-subtle bg-red-900/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20 text-red-400">
              <AlertOctagon size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider">
                License Quota Drawdown Warning
              </h3>
              <p className="text-xs text-text-ops-muted">
                Proposed spend exceeds {thresholdPct}% of remaining authority
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="p-4 rounded-lg bg-red-900/10 border border-red-800/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-ops-muted">License Reference</span>
              <span className="text-sm font-mono font-bold text-text-ops-primary">{licenseRef}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-ops-muted">Proposed Spend</span>
              <span className="text-sm font-mono font-bold text-amber-400">
                {formatCurrency(proposedSpend)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-text-ops-muted">Remaining Ceiling</span>
              <span className="text-sm font-mono font-bold text-text-ops-primary">
                {formatCurrency(remainingCeiling)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-border-ops-subtle pt-2">
              <span className="text-xs text-text-ops-muted">Post-Transaction Utilization</span>
              <span className="text-sm font-mono font-bold text-red-400">{newUtilization}%</span>
            </div>
          </div>

          <div className="h-2 bg-bg-ops-overlay rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-red-500"
              style={{ width: `${Math.min(100, parseFloat(newUtilization))}%` }}
            />
          </div>

          <p className="text-xs text-text-ops-muted leading-relaxed">
            This transaction will consume a significant portion of the remaining license authority.
            Proceeding may leave insufficient headroom for subsequent procurement activities under
            this license. Consider reducing the order value or obtaining an amended license.
          </p>

          {/* Acknowledgement checkbox */}
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="ack-drawdown"
              className="mt-0.5 rounded border-border-ops-subtle bg-bg-ops-overlay accent-red-500"
            />
            <label htmlFor="ack-drawdown" className="text-xs text-text-ops-muted">
              I acknowledge that this transaction will exceed the {thresholdPct}% threshold and
              understand the compliance implications.
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-border-ops-subtle bg-bg-ops-overlay/30">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-default transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors"
          >
            Proceed with Caution
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Export Control Security Badge
 *
 * High-visibility pill for work packages tagged with export control restrictions.
 * Used in WbsTable and DailyCockpitView FocusQueue.
 */
interface ExportControlBadgeProps {
  regime: string | null;
  taaReference?: string | null;
  className?: string;
}

export const ExportControlBadge: React.FC<ExportControlBadgeProps> = ({
  regime,
  taaReference,
  className,
}) => {
  if (!regime) return null;

  const config: Record<string, { bg: string; text: string; border: string; label: string }> = {
    ITAR: {
      bg: 'bg-red-900/40',
      text: 'text-red-400',
      border: 'border-red-800/40',
      label: 'ITAR',
    },
    EAR_ECCN: {
      bg: 'bg-amber-900/40',
      text: 'text-amber-400',
      border: 'border-amber-800/40',
      label: 'EAR',
    },
    EAR99: {
      bg: 'bg-emerald-900/40',
      text: 'text-emerald-400',
      border: 'border-emerald-800/40',
      label: 'EAR99',
    },
    UK_MILITARY_LIST: {
      bg: 'bg-sky-900/40',
      text: 'text-sky-400',
      border: 'border-sky-800/40',
      label: 'UK EYES ONLY',
    },
    NOT_CONTROLLED: {
      bg: 'bg-gray-900/40',
      text: 'text-gray-400',
      border: 'border-gray-800/40',
      label: 'UNRESTRICTED',
    },
    OPEN_GENERAL: {
      bg: 'bg-gray-900/40',
      text: 'text-gray-400',
      border: 'border-gray-800/40',
      label: 'OPEN',
    },
  };

  const style = config[regime] || config.NOT_CONTROLLED;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded border',
        style.bg,
        style.text,
        style.border,
        className,
      )}
      title={taaReference ? `TAA Reference: ${taaReference}` : `Export control regime: ${regime}`}
    >
      <Lock size={9} />
      {style.label}
      {taaReference && (
        <span className="ml-0.5 opacity-70">[{taaReference}]</span>
      )}
    </span>
  );
};

/**
 * TAA Balance Table Row
 */
const LicenseRow: React.FC<{
  license: ExportLicense;
  onViewWorkPackages: (lic: ExportLicense) => void;
  onAuditLog: (lic: ExportLicense) => void;
  onRenew: (lic: ExportLicense) => void;
  onDrawdownCheck: (lic: ExportLicense) => void;
}> = ({ license, onViewWorkPackages, onAuditLog, onRenew, onDrawdownCheck }) => {
  const daysLeft = daysUntil(license.expiration_date);
  const pct = utilizationPct(license);

  return (
    <tr className="border-b border-border-ops-subtle/50 hover:bg-bg-ops-overlay/30 transition-colors">
      {/* License Ref & Regime */}
      <td className="px-4 py-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono font-bold text-text-ops-primary">
              {license.license_reference}
            </span>
            <RegimeBadge regime={license.regime} />
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={license.status} />
            <span className="text-[10px] text-text-ops-muted">
              {license.license_type} &middot; {license.issuing_authority}
            </span>
          </div>
        </div>
      </td>

      {/* Authorized Nations */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {license.authorized_nations.map((n) => (
            <span
              key={n}
              className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono rounded bg-bg-ops-overlay text-text-ops-muted border border-border-ops-subtle"
            >
              <Globe size={9} className="mr-0.5" />
              {n}
            </span>
          ))}
        </div>
      </td>

      {/* Approved CAGEs */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {license.authorized_cages.map((c) => (
            <span
              key={c}
              className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono rounded bg-bg-ops-overlay text-text-ops-muted border border-border-ops-subtle"
            >
              {c}
            </span>
          ))}
        </div>
      </td>

      {/* Monetary Ceiling */}
      <td className="px-4 py-3">
        <span className="text-sm font-mono text-text-ops-primary">
          {license.monetary_ceiling ? formatCurrency(license.monetary_ceiling) : '—'}
        </span>
      </td>

      {/* Drawn Value */}
      <td className="px-4 py-3">
        <span className={clsx(
          'text-sm font-mono',
          pct > 90 ? 'text-red-400' : pct > 75 ? 'text-amber-400' : 'text-text-ops-muted',
        )}>
          {formatCurrency(license.current_drawn_value)}
        </span>
      </td>

      {/* Balance Remaining */}
      <td className="px-4 py-3">
        <span className={clsx(
          'text-sm font-mono font-bold',
          license.monetary_ceiling && pct > 90
            ? 'text-red-400'
            : license.monetary_ceiling && pct > 75
            ? 'text-amber-400'
            : 'text-emerald-400',
        )}>
          {license.monetary_ceiling
            ? formatCurrency(license.monetary_ceiling - license.current_drawn_value)
            : '∞'}
        </span>
      </td>

      {/* Progress Bar */}
      <td className="px-4 py-3 min-w-[180px]">
        <DrawdownProgressBar license={license} />
      </td>

      {/* Expiration Date */}
      <td className="px-4 py-3">
        <div className="space-y-0.5">
          <span className="text-xs font-mono text-text-ops-muted">
            {formatDate(license.expiration_date)}
          </span>
          {daysLeft <= 90 && (
            <span className={clsx(
              'text-[10px] font-bold',
              daysLeft <= 30 ? 'text-red-400' : 'text-amber-400',
            )}>
              {daysLeft} days left
            </span>
          )}
        </div>
      </td>

      {/* Row Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onViewWorkPackages(license)}
            className="p-1.5 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors"
            title="View Linked Work Packages"
          >
            <Eye size={14} />
          </button>
          <button
            onClick={() => onAuditLog(license)}
            className="p-1.5 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors"
            title="Audit Access Log"
          >
            <Activity size={14} />
          </button>
          <button
            onClick={() => onRenew(license)}
            className="p-1.5 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors"
            title="Renew / Extend License"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => onDrawdownCheck(license)}
            className="p-1.5 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-amber-400 transition-colors"
            title="Simulate Drawdown"
          >
            <DollarSign size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
};

// ---------------------------------------------------------------------------
// Main Dashboard View
// ---------------------------------------------------------------------------

const ExportControlDashboardView: React.FC = () => {
  const [licenses] = useState<ExportLicense[]>(MOCK_LICENSES);
  const [metrics] = useState<ComplianceMetrics>(MOCK_METRICS);
  const [filterRegime, setFilterRegime] = useState<LicenseRegime | 'ALL'>('ALL');

  // Drawdown warning dialog state
  const [drawdownOpen, setDrawdownOpen] = useState(false);
  const [drawdownLicense, setDrawdownLicense] = useState<ExportLicense | null>(null);
  const [drawdownProposedSpend, setDrawdownProposedSpend] = useState(0);

  // Action handlers
  const handleViewWorkPackages = useCallback((lic: ExportLicense) => {
    console.log('[ExportControl] View work packages for', lic.license_reference, lic.linked_work_packages);
  }, []);

  const handleAuditLog = useCallback((lic: ExportLicense) => {
    console.log('[ExportControl] Audit log for', lic.license_reference);
  }, []);

  const handleRenew = useCallback((lic: ExportLicense) => {
    console.log('[ExportControl] Renew license', lic.license_reference);
  }, []);

  const handleDrawdownCheck = useCallback((lic: ExportLicense) => {
    // Simulate a proposed spend that triggers the warning
    const remaining = lic.monetary_ceiling
      ? lic.monetary_ceiling - lic.current_drawn_value
      : 0;
    const proposed = Math.ceil(remaining * 0.95); // 95% of remaining — triggers 90% warning

    setDrawdownLicense(lic);
    setDrawdownProposedSpend(proposed);
    setDrawdownOpen(true);
  }, []);

  // Filtered licenses
  const filteredLicenses = useMemo(() => {
    if (filterRegime === 'ALL') return licenses;
    return licenses.filter((l) => l.regime === filterRegime);
  }, [licenses, filterRegime]);

  // Summary stats
  const expiringSoonCount = useMemo(
    () => licenses.filter((l) => l.status === 'EXPIRING_SOON').length,
    [licenses],
  );
  const overThresholdCount = useMemo(
    () => licenses.filter((l) => l.monetary_ceiling && utilizationPct(l) > 90).length,
    [licenses],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-overlay/30">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/10 text-red-400">
            <Shield size={20} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-ops-primary uppercase tracking-wider">
              Export Control Compliance
            </h2>
            <p className="text-xs text-text-ops-muted">
              Foreign Disclosure Licensing Workbench
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {expiringSoonCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded bg-amber-900/40 text-amber-400">
              <Clock size={10} />
              {expiringSoonCount} Expiring Soon
            </span>
          )}
          {overThresholdCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded bg-red-900/40 text-red-400">
              <AlertTriangle size={10} />
              {overThresholdCount} Over 90% Drawdown
            </span>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Top Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            icon={<FileText size={18} />}
            label="Active Licenses"
            value={metrics.activeLicenses}
            subtitle="DSP-5, TAA, MLA, UK SIEL"
            color="bg-sky-500/10 text-sky-400"
          />
          <MetricCard
            icon={<DollarSign size={18} />}
            label="Remaining Ceiling"
            value={formatCurrency(metrics.remainingCeiling)}
            subtitle="Across all active licenses"
            color="bg-emerald-500/10 text-emerald-400"
          />
          <MetricCard
            icon={<Globe size={18} />}
            label="Flagged Foreign Accesses"
            value={metrics.flaggedForeignAccesses}
            subtitle="Requires review"
            color="bg-amber-500/10 text-amber-400"
            alert={metrics.flaggedForeignAccesses > 0}
          />
          <MetricCard
            icon={<Clock size={18} />}
            label="Pending Disclosures"
            value={metrics.pendingDisclosures}
            subtitle="Awaiting approval"
            color="bg-purple-500/10 text-purple-400"
            alert={metrics.pendingDisclosures > 0}
          />
        </div>

        {/* TAA Balance Table */}
        <div className="rounded-xl border border-border-ops-subtle bg-bg-ops-overlay/30 overflow-hidden">
          {/* Table Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-ops-subtle bg-bg-ops-overlay/50">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-text-ops-muted" />
              <h3 className="text-xs font-bold text-text-ops-primary uppercase tracking-wider">
                Technical Assistance Agreement Balance Table
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {/* Regime filter */}
              <select
                value={filterRegime}
                onChange={(e) => setFilterRegime(e.target.value as LicenseRegime | 'ALL')}
                className="px-2 py-1 text-xs rounded border border-border-ops-subtle bg-bg-ops-base text-text-ops-muted focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="ALL">All Regimes</option>
                <option value="ITAR">ITAR</option>
                <option value="EAR">EAR</option>
                <option value="UK_ML">UK ML</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border-ops-subtle bg-bg-ops-overlay/50">
                  <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-ops-muted">
                    License Ref
                  </th>
                  <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-ops-muted">
                    Authorized Nations
                  </th>
                  <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-ops-muted">
                    Approved CAGEs
                  </th>
                  <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-ops-muted text-right">
                    Ceiling
                  </th>
                  <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-ops-muted text-right">
                    Drawn
                  </th>
                  <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-ops-muted text-right">
                    Balance
                  </th>
                  <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-ops-muted">
                    Utilization
                  </th>
                  <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-ops-muted">
                    Expiration
                  </th>
                  <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-ops-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredLicenses.map((lic) => (
                  <LicenseRow
                    key={lic.id}
                    license={lic}
                    onViewWorkPackages={handleViewWorkPackages}
                    onAuditLog={handleAuditLog}
                    onRenew={handleRenew}
                    onDrawdownCheck={handleDrawdownCheck}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {filteredLicenses.length === 0 && (
            <div className="flex items-center justify-center py-12 text-text-ops-muted">
              <p className="text-sm">No licenses match the selected filter.</p>
            </div>
          )}
        </div>

        {/* National Caveats & Boundary Indicators Legend */}
        <div className="rounded-xl border border-border-ops-subtle bg-bg-ops-overlay/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={14} className="text-text-ops-muted" />
            <h3 className="text-xs font-bold text-text-ops-primary uppercase tracking-wider">
              Export Control Badge Legend
            </h3>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <ExportControlBadge regime="ITAR" taaReference="TAA-2026-UK-004" />
              <span className="text-[10px] text-text-ops-muted">International Traffic in Arms Regulations</span>
            </div>
            <div className="flex items-center gap-2">
              <ExportControlBadge regime="EAR_ECCN" />
              <span className="text-[10px] text-text-ops-muted">Export Administration Regulations — ECCN controlled</span>
            </div>
            <div className="flex items-center gap-2">
              <ExportControlBadge regime="EAR99" />
              <span className="text-[10px] text-text-ops-muted">EAR99 — Not otherwise classified</span>
            </div>
            <div className="flex items-center gap-2">
              <ExportControlBadge regime="UK_MILITARY_LIST" />
              <span className="text-[10px] text-text-ops-muted">UK Military List — UK Eyes Only</span>
            </div>
          </div>
          <p className="mt-3 text-[10px] text-text-ops-muted leading-relaxed">
            These badges appear inline in the WBS table and Daily Cockpit focus queue.
            If the logged-in user or active subcontractor profile lacks nationality/CAGE authorization,
            restricted payload attributes are masked with <code className="px-1 py-0.5 bg-bg-ops-overlay rounded text-red-400 font-mono">[EXPORT_CONTROL_RESTRICTED]</code> and file attachments are disabled.
          </p>
        </div>
      </div>

      {/* Drawdown Warning Dialog */}
      {drawdownLicense && (
        <DrawdownWarningDialog
          open={drawdownOpen}
          licenseRef={drawdownLicense.license_reference}
          proposedSpend={drawdownProposedSpend}
          remainingCeiling={
            drawdownLicense.monetary_ceiling
              ? drawdownLicense.monetary_ceiling - drawdownLicense.current_drawn_value
              : 0
          }
          thresholdPct={90}
          onConfirm={() => {
            console.log('[ExportControl] Drawdown confirmed for', drawdownLicense.license_reference);
            setDrawdownOpen(false);
          }}
          onCancel={() => setDrawdownOpen(false)}
        />
      )}
    </div>
  );
};

export default ExportControlDashboardView;
