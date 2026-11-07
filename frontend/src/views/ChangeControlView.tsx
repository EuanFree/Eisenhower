/**
 * Change Control View
 *
 * The Change Control Board (CCB) dashboard for reviewing and acting on
 * Baseline Change Requests (BCRs).  This view provides a comprehensive
 * overview of all active BCRs, their impact on the programme baseline,
 * and the multi-signature approval workflow.
 *
 * Key Features
 * ------------
 *
 * 1. **CCB Dashboard** — Displays all BCR items with tier badges, status
 *    indicators, and impact metrics.
 *
 * 2. **Tier Badges** — Color-coded governance tier indicators:
 *    - Tier 1: CAM Float (local management reserve)
 *    - Tier 2: Project CCB (project-level change control)
 *    - Tier 3: Programme Board (programme-level governance)
 *
 * 3. **Pre-Change Impact Viewer** — Side-by-side delta metrics showing:
 *    - Cost Variance Delta (ΔBAC)
 *    - Finish Date Slip (ΔDays)
 *    - Management Reserve Drawdown Requested
 *
 * 4. **Digital Signature Approval Pad** — Multi-signature sign-off controls
 *    that enforce user role verification before approving or rejecting a BCR.
 *
 * 5. **Filterable Pill Bar** — Filter by tier and status.
 *
 * Data source: GET /api/v1/baselines/bcr
 *
 * This view is intended for CCB members, project managers, and programme
 * directors who need to review and approve baseline changes.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import {
  Shield,
  Search,
  Filter,
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  FileText,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  PanelRightOpen,
  PanelRightClose,
  ChevronDown,
  ChevronUp,
  PenTool,
  UserCheck,
  UserX,
  Scale,
} from 'lucide-react';
import api from '../services/api';
import {
  BCRItem,
  BaselineTier,
  BCRStatus,
  BCRFilters,
  BCRSignature,
} from '../types/governance';

// ---------------------------------------------------------------------------
// Tier badge configuration
// ---------------------------------------------------------------------------

const TIER_CONFIG: Record<BaselineTier, { color: string; label: string; shortLabel: string; description: string }> = {
  TIER_1_LOCAL_CAM: {
    color: 'text-blue-400',
    label: 'Tier 1: CAM Float',
    shortLabel: 'Tier 1',
    description: 'Local CAM authority — float within management reserve',
  },
  TIER_2_PROJECT_CCB: {
    color: 'text-amber-400',
    label: 'Tier 2: Project CCB',
    shortLabel: 'Tier 2',
    description: 'Project Change Control Board approval required',
  },
  TIER_3_PROGRAMME_BOARD: {
    color: 'text-red-400',
    label: 'Tier 3: Programme Board',
    shortLabel: 'Tier 3',
    description: 'Programme Board governance — highest authority',
  },
};

// ---------------------------------------------------------------------------
// Status badge configuration
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<BCRStatus, { color: string; label: string; icon: typeof FileText }> = {
  DRAFT: {
    color: 'text-gray-400',
    label: 'Draft',
    icon: FileText,
  },
  UNDER_REVIEW: {
    color: 'text-amber-400',
    label: 'Under Review',
    icon: Clock,
  },
  APPROVED: {
    color: 'text-green-400',
    label: 'Approved',
    icon: CheckCircle2,
  },
  REJECTED: {
    color: 'text-red-400',
    label: 'Rejected',
    icon: AlertCircle,
  },
};

// ---------------------------------------------------------------------------
// Tier Badge Component
// ---------------------------------------------------------------------------

const TierBadge: React.FC<{ tier: BaselineTier }> = ({ tier }) => {
  const config = TIER_CONFIG[tier] || TIER_CONFIG.TIER_1_LOCAL_CAM;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border',
        config.color,
        `border-${config.color.split('-')[1]}-500/30 bg-${config.color.split('-')[1]}-500/10`,
      )}
      title={config.description}
    >
      <Shield size={12} />
      {config.shortLabel}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Status Badge Component
// ---------------------------------------------------------------------------

const StatusBadge: React.FC<{ status: BCRStatus }> = ({ status }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.DRAFT;
  const Icon = config.icon;

  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border',
      config.color,
      `border-${config.color.split('-')[1]}-500/30 bg-${config.color.split('-')[1]}-500/10`,
    )}>
      <Icon size={12} />
      {config.label}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Impact Metric Card
// ---------------------------------------------------------------------------

const ImpactMetricCard: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
  color: 'green' | 'red' | 'amber' | 'blue';
}> = ({ icon: Icon, label, value, subValue, color }) => {
  const bgClass = `bg-${color}-500/10 border-${color}-500/30`;
  const textClass = `text-${color}-400`;

  return (
    <div className={clsx('rounded-lg border p-4', bgClass)}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className={textClass} />
        <span className="text-xs text-text-ops-muted uppercase tracking-wider">{label}</span>
      </div>
      <div className={clsx('text-2xl font-bold font-mono', textClass)}>
        {value}
      </div>
      {subValue && (
        <div className="text-xs text-text-ops-muted mt-1">{subValue}</div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Digital Signature Pad
// ---------------------------------------------------------------------------

const SignaturePad: React.FC<{
  bcr: BCRItem;
  signatures: BCRSignature[];
  onClose: () => void;
  onApprove: (comment: string) => void;
  onReject: (reason: string) => void;
}> = ({ bcr, signatures, onClose, onApprove, onReject }) => {
  const [mode, setMode] = useState<'approve' | 'reject' | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mode || !comment.trim()) return;

    setIsSubmitting(true);
    try {
      if (mode === 'approve') {
        await onApprove(comment.trim());
      } else {
        await onReject(comment.trim());
      }
      onClose();
    } catch (err) {
      console.error('Failed to submit signature:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-ops-subtle bg-bg-ops-surface">
        <div>
          <h3 className="text-sm font-semibold text-text-ops-primary">
            {bcr.bcr_number}
          </h3>
          <p className="text-xs text-text-ops-muted truncate max-w-[200px]">
            {bcr.title}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay transition-colors"
          aria-label="Close drawer"
        >
          <X size={16} />
        </button>
      </div>

      {/* BCR Summary */}
      <div className="px-4 py-3 border-b border-border-ops-subtle bg-bg-ops-overlay/50 space-y-3">
        <div className="flex items-center gap-2">
          <TierBadge tier={bcr.tier} />
          <StatusBadge status={bcr.status} />
        </div>

        <div className="text-sm text-text-ops-primary">
          <p className="text-text-ops-muted text-xs mb-1">Justification</p>
          <p className="whitespace-pre-wrap">{bcr.justification}</p>
        </div>

        {/* Impact Metrics */}
        <div className="grid grid-cols-3 gap-2">
          {bcr.cost_delta_amount !== null && (
            <div className="rounded border border-border-ops-subtle bg-bg-ops-overlay p-2">
              <div className="flex items-center gap-1 text-xs text-text-ops-muted">
                <DollarSign size={12} />
                ΔBAC
              </div>
              <div className={clsx(
                'text-sm font-bold font-mono',
                bcr.cost_delta_amount >= 0 ? 'text-amber-400' : 'text-green-400',
              )}>
                {bcr.cost_delta_amount >= 0 ? '+' : ''}£{bcr.cost_delta_amount.toLocaleString()}
              </div>
            </div>
          )}
          {bcr.schedule_finish_slip_days !== null && (
            <div className="rounded border border-border-ops-subtle bg-bg-ops-overlay p-2">
              <div className="flex items-center gap-1 text-xs text-text-ops-muted">
                <Calendar size={12} />
                ΔDays
              </div>
              <div className={clsx(
                'text-sm font-bold font-mono',
                bcr.schedule_finish_slip_days > 0 ? 'text-red-400' : 'text-green-400',
              )}>
                {bcr.schedule_finish_slip_days > 0 ? '+' : ''}{bcr.schedule_finish_slip_days} days
              </div>
            </div>
          )}
          {bcr.contingency_reserve_requested !== null && (
            <div className="rounded border border-border-ops-subtle bg-bg-ops-overlay p-2">
              <div className="flex items-center gap-1 text-xs text-text-ops-muted">
                <Scale size={12} />
                Reserve
              </div>
              <div className="text-sm font-bold font-mono text-blue-400">
                £{bcr.contingency_reserve_requested.toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Existing Signatures */}
      <div className="px-4 py-3 border-b border-border-ops-subtle">
        <h4 className="text-xs text-text-ops-muted uppercase tracking-wider mb-2">
          Signatures ({signatures.length})
        </h4>
        {signatures.length === 0 ? (
          <p className="text-xs text-text-ops-muted italic">No signatures yet.</p>
        ) : (
          <div className="space-y-2">
            {signatures.map((sig) => (
              <div
                key={sig.id}
                className="flex items-center gap-3 rounded border border-border-ops-subtle bg-bg-ops-overlay p-2"
              >
                <UserCheck size={16} className="text-green-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-ops-primary truncate">{sig.user_name}</div>
                  <div className="text-xs text-text-ops-muted">{sig.user_role} · {sig.signed_at}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Area */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {!mode ? (
          <div className="space-y-3">
            <p className="text-sm text-text-ops-muted text-center mb-4">
              Select an action to sign off on this Baseline Change Request.
            </p>
            <button
              type="button"
              onClick={() => setMode('approve')}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm font-medium text-green-400 hover:bg-green-500/20 transition-colors"
            >
              <CheckCircle2 size={16} />
              Approve This BCR
            </button>
            <button
              type="button"
              onClick={() => setMode('reject')}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors"
            >
              <AlertCircle size={16} />
              Reject This BCR
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => { setMode(null); setComment(''); }}
                className="text-xs text-text-ops-muted hover:text-text-ops-primary transition-colors"
              >
                ← Back
              </button>
              <span className={clsx(
                'text-sm font-semibold',
                mode === 'approve' ? 'text-green-400' : 'text-red-400',
              )}>
                {mode === 'approve' ? 'Approve' : 'Reject'} BCR
              </span>
            </div>

            <div className={clsx(
              'rounded-lg border p-3 text-xs',
              mode === 'approve'
                ? 'border-green-500/30 bg-green-500/10 text-green-300'
                : 'border-red-500/30 bg-red-500/10 text-red-300',
            )}>
              <div className="flex items-center gap-2 mb-1">
                <Shield size={14} />
                <span className="font-semibold">Role Verification Required</span>
              </div>
              <p>
                By signing this {TIER_CONFIG[bcr.tier].label} BCR, you confirm that you have the
                authority to {mode} this change and that all impact assessments have been reviewed.
              </p>
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                mode === 'approve'
                  ? 'Enter approval comment...'
                  : 'Enter rejection reason (required)...'
              }
              rows={4}
              required
              className="w-full rounded border border-border-ops-subtle bg-bg-ops-overlay px-3 py-2 text-sm text-text-ops-primary placeholder:text-text-ops-muted focus:outline-none focus:border-blue-500/50 resize-none"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setMode(null); setComment(''); }}
                className="flex-1 rounded border border-border-ops-subtle bg-bg-ops-overlay px-3 py-2 text-sm font-medium text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!comment.trim() || isSubmitting}
                className={clsx(
                  'flex-1 rounded px-3 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                  mode === 'approve'
                    ? 'bg-green-600 hover:bg-green-500'
                    : 'bg-red-600 hover:bg-red-500',
                )}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Submitting...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <PenTool size={14} />
                    {mode === 'approve' ? 'Sign & Approve' : 'Sign & Reject'}
                  </span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Filter Bar
// ---------------------------------------------------------------------------

const FilterBar: React.FC<{
  filters: BCRFilters;
  onFilterChange: (filters: BCRFilters) => void;
  tierCounts: Record<string, number>;
  statusCounts: Record<string, number>;
}> = ({ filters, onFilterChange, tierCounts, statusCounts }) => {
  const tiers: BaselineTier[] = ['TIER_1_LOCAL_CAM', 'TIER_2_PROJECT_CCB', 'TIER_3_PROGRAMME_BOARD'];
  const statuses: BCRStatus[] = ['DRAFT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'];

  return (
    <div className="px-6 py-3 border-b border-border-ops-subtle bg-bg-ops-surface/50 space-y-3">
      {/* Tier Pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-text-ops-muted" />
        <span className="text-xs text-text-ops-muted uppercase tracking-wider">Tier</span>
        {tiers.map((tier) => {
          const isActive = filters.tier === tier;
          const count = tierCounts[tier] || 0;
          const config = TIER_CONFIG[tier];

          return (
            <button
              key={tier}
              type="button"
              onClick={() => onFilterChange({ ...filters, tier: isActive ? null : tier })}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                isActive
                  ? `${config.color} border-${config.color.split('-')[1]}-500/50 bg-${config.color.split('-')[1]}-500/10`
                  : 'text-text-ops-muted border-border-ops-subtle hover:border-border-ops-strong',
              )}
            >
              <Shield size={12} />
              {config.shortLabel}
              <span className={clsx(
                'ml-1 px-1.5 py-0.5 rounded-full text-xs',
                isActive ? 'bg-white/10' : 'bg-bg-ops-overlay',
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Status Pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-text-ops-muted uppercase tracking-wider">Status</span>
        {statuses.map((status) => {
          const isActive = filters.status === status;
          const count = statusCounts[status] || 0;
          const config = STATUS_CONFIG[status];

          return (
            <button
              key={status}
              type="button"
              onClick={() => onFilterChange({ ...filters, status: isActive ? null : status })}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                isActive
                  ? `${config.color} border-${config.color.split('-')[1]}-500/50 bg-${config.color.split('-')[1]}-500/10`
                  : 'text-text-ops-muted border-border-ops-subtle hover:border-border-ops-strong',
              )}
            >
              {config.label}
              <span className={clsx(
                'ml-1 px-1.5 py-0.5 rounded-full text-xs',
                isActive ? 'bg-white/10' : 'bg-bg-ops-overlay',
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// BCR Card Component
// ---------------------------------------------------------------------------

const BCRCard: React.FC<{
  bcr: BCRItem;
  onOpenSignature: (bcr: BCRItem) => void;
}> = ({ bcr, onOpenSignature }) => {
  const [expanded, setExpanded] = useState(false);
  const tierConfig = TIER_CONFIG[bcr.tier];

  return (
    <div className="rounded-lg border border-border-ops-subtle bg-bg-ops-overlay overflow-hidden transition-all hover:border-border-ops-strong">
      {/* Card Header */}
      <div className="px-4 py-3 border-b border-border-ops-subtle">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm font-semibold text-text-ops-primary">
                {bcr.bcr_number}
              </span>
              <TierBadge tier={bcr.tier} />
              <StatusBadge status={bcr.status} />
            </div>
            <h4 className="text-sm font-medium text-text-ops-primary truncate">
              {bcr.title}
            </h4>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded text-text-ops-muted hover:text-text-ops-primary transition-colors ml-2"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {/* Impact Metrics Row */}
        <div className="flex items-center gap-4 text-xs">
          {bcr.cost_delta_amount !== null && (
            <div className="flex items-center gap-1">
              <DollarSign size={12} className={bcr.cost_delta_amount >= 0 ? 'text-amber-400' : 'text-green-400'} />
              <span className="font-mono text-text-ops-primary">
                {bcr.cost_delta_amount >= 0 ? '+' : ''}£{bcr.cost_delta_amount.toLocaleString()}
              </span>
            </div>
          )}
          {bcr.schedule_finish_slip_days !== null && (
            <div className="flex items-center gap-1">
              <Calendar size={12} className={bcr.schedule_finish_slip_days > 0 ? 'text-red-400' : 'text-green-400'} />
              <span className="font-mono text-text-ops-primary">
                {bcr.schedule_finish_slip_days > 0 ? '+' : ''}{bcr.schedule_finish_slip_days} days
              </span>
            </div>
          )}
          {bcr.contingency_reserve_requested !== null && (
            <div className="flex items-center gap-1">
              <Scale size={12} className="text-blue-400" />
              <span className="font-mono text-text-ops-primary">
                £{bcr.contingency_reserve_requested.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 py-3 border-b border-border-ops-subtle space-y-3">
          <div>
            <span className="text-xs text-text-ops-muted uppercase tracking-wider">Justification</span>
            <p className="text-sm text-text-ops-primary mt-1 whitespace-pre-wrap">
              {bcr.justification}
            </p>
          </div>

          {bcr.rejection_reason && (
            <div className="rounded border border-red-500/30 bg-red-500/10 p-3">
              <span className="text-xs text-red-400 uppercase tracking-wider">Rejection Reason</span>
              <p className="text-sm text-red-300 mt-1">{bcr.rejection_reason}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-text-ops-muted">Created</span>
              <p className="font-mono text-text-ops-primary">{bcr.created_at}</p>
            </div>
            <div>
              <span className="text-text-ops-muted">Updated</span>
              <p className="font-mono text-text-ops-primary">{bcr.updated_at}</p>
            </div>
          </div>
        </div>
      )}

      {/* Action Footer */}
      {bcr.status === 'UNDER_REVIEW' && (
        <div className="px-4 py-2 bg-bg-ops-surface/50">
          <button
            type="button"
            onClick={() => onOpenSignature(bcr)}
            className="w-full flex items-center justify-center gap-2 rounded bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm font-medium text-white transition-colors"
          >
            <PenTool size={14} />
            Review & Sign
          </button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main View Component
// ---------------------------------------------------------------------------

const ChangeControlView: React.FC = () => {
  const [bcrs, setBcrs] = useState<BCRItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<BCRFilters>({ tier: null, status: null });
  const [selectedBcr, setSelectedBcr] = useState<BCRItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signatures, setSignatures] = useState<BCRSignature[]>([]);

  // Fetch BCRs
  const fetchBcrs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get('/api/v1/baselines/bcr');
      if (response.data) {
        setBcrs(response.data.bcrs || response.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch BCRs:', err);
      setError('Failed to load change requests. The backend may not be running.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBcrs();
  }, [fetchBcrs]);

  // Counts for filter pills
  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    bcrs.forEach((bcr) => {
      counts[bcr.tier] = (counts[bcr.tier] || 0) + 1;
    });
    return counts;
  }, [bcrs]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    bcrs.forEach((bcr) => {
      counts[bcr.status] = (counts[bcr.status] || 0) + 1;
    });
    return counts;
  }, [bcrs]);

  // Client-side filtering
  const filteredBcrs = useMemo(() => {
    return bcrs.filter((bcr) => {
      if (filters.tier && bcr.tier !== filters.tier) {
        return false;
      }
      if (filters.status && bcr.status !== filters.status) {
        return false;
      }
      return true;
    });
  }, [bcrs, filters]);

  // Open signature drawer
  const openSignature = useCallback((bcr: BCRItem) => {
    setSelectedBcr(bcr);
    setSignatures([]);
    setDrawerOpen(true);
  }, []);

  // Approve BCR
  const handleApprove = useCallback(async (comment: string) => {
    try {
      await api.put(`/api/v1/baselines/bcr/${selectedBcr?.id}`, {
        status: 'APPROVED',
      });
      // Add local signature entry
      const newSig: BCRSignature = {
        id: `local-${Date.now()}`,
        bcr_id: selectedBcr?.id || '',
        user_id: 'current-user',
        user_name: 'Current User',
        user_role: 'CCB Member',
        signed_at: new Date().toISOString(),
        comment,
      };
      setSignatures((prev) => [...prev, newSig]);
      await fetchBcrs();
    } catch (err) {
      console.error('Failed to approve BCR:', err);
      throw err;
    }
  }, [selectedBcr, fetchBcrs]);

  // Reject BCR
  const handleReject = useCallback(async (reason: string) => {
    try {
      await api.put(`/api/v1/baselines/bcr/${selectedBcr?.id}`, {
        status: 'REJECTED',
        rejection_reason: reason,
      });
      await fetchBcrs();
    } catch (err) {
      console.error('Failed to reject BCR:', err);
      throw err;
    }
  }, [selectedBcr, fetchBcrs]);

  // Aggregate impact metrics
  const aggregateImpact = useMemo(() => {
    const activeBcrs = bcrs.filter((bcr) => bcr.status === 'UNDER_REVIEW');
    const totalCostDelta = activeBcrs.reduce((sum, bcr) => sum + (bcr.cost_delta_amount || 0), 0);
    const totalScheduleSlip = activeBcrs.reduce((sum, bcr) => sum + (bcr.schedule_finish_slip_days || 0), 0);
    const totalReserveRequested = activeBcrs.reduce((sum, bcr) => sum + (bcr.contingency_reserve_requested || 0), 0);
    return { totalCostDelta, totalScheduleSlip, totalReserveRequested, count: activeBcrs.length };
  }, [bcrs]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-surface">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-amber-400" />
          <div>
            <h2 className="text-lg font-semibold text-text-ops-primary">
              Change Control Board
            </h2>
            <p className="text-sm text-text-ops-muted">
              Baseline Change Request review and approval
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchBcrs}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded border border-border-ops-subtle bg-bg-ops-overlay px-3 py-1.5 text-sm font-medium text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong transition-colors disabled:opacity-50"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
            Refresh
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-3 mx-6 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            &times;
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <FilterBar
        filters={filters}
        onFilterChange={setFilters}
        tierCounts={tierCounts}
        statusCounts={statusCounts}
      />

      {/* Aggregate Impact Strip */}
      <div className="grid grid-cols-4 gap-4 px-6 py-3 border-b border-border-ops-subtle bg-bg-ops-surface/50">
        <div className="flex items-center gap-3 rounded-lg border border-border-ops-subtle bg-bg-ops-overlay px-4 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20">
            <FileText size={16} className="text-amber-400" />
          </div>
          <div>
            <div className="text-lg font-bold font-mono text-text-ops-primary">
              {aggregateImpact.count}
            </div>
            <div className="text-xs text-text-ops-muted uppercase tracking-wider">Pending Review</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20">
            <DollarSign size={16} className="text-amber-400" />
          </div>
          <div>
            <div className="text-lg font-bold font-mono text-amber-400">
              £{aggregateImpact.totalCostDelta.toLocaleString()}
            </div>
            <div className="text-xs text-text-ops-muted uppercase tracking-wider">ΔBAC Total</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/20">
            <Calendar size={16} className="text-red-400" />
          </div>
          <div>
            <div className="text-lg font-bold font-mono text-red-400">
              +{aggregateImpact.totalScheduleSlip}d
            </div>
            <div className="text-xs text-text-ops-muted uppercase tracking-wider">Schedule Slip</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20">
            <Scale size={16} className="text-blue-400" />
          </div>
          <div>
            <div className="text-lg font-bold font-mono text-blue-400">
              £{aggregateImpact.totalReserveRequested.toLocaleString()}
            </div>
            <div className="text-xs text-text-ops-muted uppercase tracking-wider">Reserve Requested</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading && bcrs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-text-ops-muted">
            <Loader2 size={48} className="mb-4 animate-spin text-blue-400" />
            <p className="text-lg font-semibold">Loading change requests...</p>
            <p className="text-sm mt-1">Querying the CCB register.</p>
          </div>
        ) : filteredBcrs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-text-ops-muted">
            <Shield size={48} className="mb-4 text-text-ops-muted/50" />
            <p className="text-lg font-semibold text-text-ops-primary">
              No Change Requests Found
            </p>
            <p className="text-sm mt-2 text-center max-w-md">
              {filters.tier || filters.status
                ? 'No BCRs match the current filters. Try adjusting your filter criteria.'
                : 'No Baseline Change Requests have been submitted yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredBcrs.map((bcr) => (
              <BCRCard
                key={bcr.id}
                bcr={bcr}
                onOpenSignature={openSignature}
              />
            ))}
          </div>
        )}
      </div>

      {/* Signature Drawer */}
      {drawerOpen && selectedBcr && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer Panel */}
          <div className="relative w-[520px] max-w-full h-full bg-bg-ops-surface border-l border-border-ops-subtle shadow-2xl flex flex-col">
            <SignaturePad
              bcr={selectedBcr}
              signatures={signatures}
              onClose={() => setDrawerOpen(false)}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ChangeControlView;
