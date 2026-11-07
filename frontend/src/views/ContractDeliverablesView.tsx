/**
 * Contract Deliverables View
 *
 * The master register for all Contract Deliverables (CDRL/SDRL) in the
 * programme.  This view provides a tabular overview of every deliverable,
 * its current status, contractual due dates, and statutory review windows.
 *
 * Key Features
 * ------------
 *
 * 1. **Master Tabular Register** — Displays all CDRL items with columns for
 *    CDRL number, title, DID reference, revision, contractual due date, and
 *    review deadline.
 *
 * 2. **Statutory Review Window Countdown** — Visual badge showing remaining
 *    days until the review deadline expires.  Transitions from green to amber
 *    to red as the deadline approaches (≤ 5 days = urgent red).
 *
 * 3. **Customer Disposition Badging** — Color-coded status badges for each
 *    CDRL: DRAFTING, SUBMITTED, UNDER_REVIEW, ACCEPTED, ACCEPTED_WITH_COMMENTS,
 *    REJECTED.
 *
 * 4. **Slide-Out Comment Drawer** — Right-edge drawer for viewing and logging
 *    customer line-item comment matrices for a selected CDRL.
 *
 * 5. **Filterable Pill Bar** — Filter by status and search by CDRL number,
 *    title, or DID reference.
 *
 * Data source: GET /api/v1/cdrl/
 *
 * This view is intended for programme managers, contract administrators, and
 * CCB members who need to track deliverable compliance and review timelines.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import {
  FileText,
  Search,
  Filter,
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  PanelRightOpen,
  PanelRightClose,
  MessageSquare,
  Calendar,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import api from '../services/api';
import {
  CDRLItem,
  CDRLStatus,
  CDRLComment,
  CDRLFilters,
} from '../types/governance';

// ---------------------------------------------------------------------------
// Status badge configuration
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<CDRLStatus, { color: string; label: string; icon: typeof FileText }> = {
  DRAFTING: {
    color: 'text-gray-400',
    label: 'Drafting',
    icon: FileText,
  },
  SUBMITTED: {
    color: 'text-blue-400',
    label: 'Submitted',
    icon: FileText,
  },
  UNDER_REVIEW: {
    color: 'text-amber-400',
    label: 'Under Review',
    icon: Clock,
  },
  ACCEPTED: {
    color: 'text-green-400',
    label: 'Accepted',
    icon: CheckCircle2,
  },
  ACCEPTED_WITH_COMMENTS: {
    color: 'text-cyan-400',
    label: 'Accepted w/ Comments',
    icon: MessageSquare,
  },
  REJECTED: {
    color: 'text-red-400',
    label: 'Rejected',
    icon: AlertCircle,
  },
};

// ---------------------------------------------------------------------------
// Review Window Countdown Badge
// ---------------------------------------------------------------------------

const ReviewCountdownBadge: React.FC<{ daysRemaining: number | null }> = ({ daysRemaining }) => {
  if (daysRemaining === null) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono text-text-ops-muted bg-bg-ops-overlay">
        <Clock size={12} />
        N/A
      </span>
    );
  }

  let colorClass = 'text-green-400 bg-green-500/10 border-green-500/30';
  let label = `${daysRemaining} Days Left`;

  if (daysRemaining < 0) {
    colorClass = 'text-red-400 bg-red-500/10 border-red-500/30';
    label = `${Math.abs(daysRemaining)} Days Overdue`;
  } else if (daysRemaining <= 5) {
    colorClass = 'text-red-400 bg-red-500/10 border-red-500/30';
    label = `${daysRemaining} Days Left`;
  } else if (daysRemaining <= 14) {
    colorClass = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    label = `${daysRemaining} Days Left`;
  }

  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono border',
      colorClass,
    )}>
      <Clock size={12} />
      {label}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

const StatusBadge: React.FC<{ status: CDRLStatus }> = ({ status }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.DRAFTING;
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
// Comment Drawer Panel
// ---------------------------------------------------------------------------

const CommentDrawer: React.FC<{
  cdrl: CDRLItem;
  comments: CDRLComment[];
  onClose: () => void;
  onAddComment: (lineItem: string, comment: string) => void;
}> = ({ cdrl, comments, onClose, onAddComment }) => {
  const [lineItem, setLineItem] = useState('');
  const [commentText, setCommentText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lineItem.trim() && commentText.trim()) {
      onAddComment(lineItem.trim(), commentText.trim());
      setLineItem('');
      setCommentText('');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-ops-subtle bg-bg-ops-surface">
        <div>
          <h3 className="text-sm font-semibold text-text-ops-primary">
            {cdrl.cdrl_sequence_number}
          </h3>
          <p className="text-xs text-text-ops-muted truncate max-w-[200px]">
            {cdrl.title}
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

      {/* CDRL Summary */}
      <div className="px-4 py-3 border-b border-border-ops-subtle bg-bg-ops-overlay/50 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-ops-muted">DID Reference</span>
          <span className="font-mono text-text-ops-primary">{cdrl.did_reference}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-ops-muted">Revision</span>
          <span className="font-mono text-text-ops-primary">{cdrl.revision}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-ops-muted">Status</span>
          <StatusBadge status={cdrl.status} />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-ops-muted">Contractual Due</span>
          <span className="font-mono text-text-ops-primary">{cdrl.contractual_due_date}</span>
        </div>
        {cdrl.review_deadline_date && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-ops-muted">Review Deadline</span>
            <ReviewCountdownBadge daysRemaining={cdrl.days_until_review_deadline} />
          </div>
        )}
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-ops-muted">
            <MessageSquare size={32} className="mb-3 text-text-ops-muted/50" />
            <p className="text-sm text-center">No comments logged for this deliverable.</p>
          </div>
        ) : (
          comments.map((comment) => (
            <div
              key={comment.id}
              className="rounded-lg border border-border-ops-subtle bg-bg-ops-overlay p-3 space-y-2"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-blue-400">{comment.line_item}</span>
                <span className="text-text-ops-muted">{comment.created_at}</span>
              </div>
              <p className="text-sm text-text-ops-primary">{comment.comment}</p>
              <div className="text-xs text-text-ops-muted">
                — {comment.commenter}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Comment Form */}
      <form onSubmit={handleSubmit} className="px-4 py-3 border-t border-border-ops-subtle space-y-2">
        <input
          type="text"
          value={lineItem}
          onChange={(e) => setLineItem(e.target.value)}
          placeholder="Line item / section reference"
          className="w-full rounded border border-border-ops-subtle bg-bg-ops-overlay px-3 py-2 text-sm text-text-ops-primary placeholder:text-text-ops-muted focus:outline-none focus:border-blue-500/50"
        />
        <textarea
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="Enter comment..."
          rows={3}
          className="w-full rounded border border-border-ops-subtle bg-bg-ops-overlay px-3 py-2 text-sm text-text-ops-primary placeholder:text-text-ops-muted focus:outline-none focus:border-blue-500/50 resize-none"
        />
        <button
          type="submit"
          disabled={!lineItem.trim() || !commentText.trim()}
          className="w-full rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 text-sm font-medium text-white transition-colors"
        >
          Log Comment
        </button>
      </form>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Filter Bar
// ---------------------------------------------------------------------------

const FilterBar: React.FC<{
  filters: CDRLFilters;
  onFilterChange: (filters: CDRLFilters) => void;
  counts: Record<string, number>;
}> = ({ filters, onFilterChange, counts }) => {
  const statuses: CDRLStatus[] = [
    'DRAFTING', 'SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'ACCEPTED_WITH_COMMENTS', 'REJECTED',
  ];

  return (
    <div className="px-6 py-3 border-b border-border-ops-subtle bg-bg-ops-surface/50 space-y-3">
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-ops-muted" />
          <input
            type="text"
            value={filters.search || ''}
            onChange={(e) => onFilterChange({ ...filters, search: e.target.value || null })}
            placeholder="Search by CDRL number, title, or DID reference..."
            className="w-full rounded border border-border-ops-subtle bg-bg-ops-overlay pl-9 pr-3 py-2 text-sm text-text-ops-primary placeholder:text-text-ops-muted focus:outline-none focus:border-blue-500/50"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onFilterChange({ ...filters, search: null })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-ops-muted hover:text-text-ops-primary"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Status Pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-text-ops-muted" />
        <span className="text-xs text-text-ops-muted uppercase tracking-wider">Status</span>
        {statuses.map((status) => {
          const isActive = filters.status === status;
          const count = counts[status] || 0;
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
// Main View Component
// ---------------------------------------------------------------------------

const ContractDeliverablesView: React.FC = () => {
  const [cdrls, setCdrls] = useState<CDRLItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<CDRLFilters>({ status: null, search: null });
  const [selectedCdrl, setSelectedCdrl] = useState<CDRLItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [comments, setComments] = useState<CDRLComment[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Fetch CDRLs
  const fetchCdrls = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get('/api/v1/cdrl/list');
      if (response.data) {
        setCdrls(response.data.cdrls || response.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch CDRLs:', err);
      setError('Failed to load contract deliverables. The backend may not be running.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCdrls();
  }, [fetchCdrls]);

  // Status counts for filter pills
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    cdrls.forEach((cdrl) => {
      counts[cdrl.status] = (counts[cdrl.status] || 0) + 1;
    });
    return counts;
  }, [cdrls]);

  // Client-side filtering
  const filteredCdrls = useMemo(() => {
    return cdrls.filter((cdrl) => {
      if (filters.status && cdrl.status !== filters.status) {
        return false;
      }
      if (filters.search) {
        const search = filters.search.toLowerCase();
        const matches =
          cdrl.cdrl_sequence_number.toLowerCase().includes(search) ||
          cdrl.title.toLowerCase().includes(search) ||
          cdrl.did_reference.toLowerCase().includes(search);
        if (!matches) return false;
      }
      return true;
    });
  }, [cdrls, filters]);

  // Open comment drawer
  const openDrawer = useCallback((cdrl: CDRLItem) => {
    setSelectedCdrl(cdrl);
    setComments([]);
    setDrawerOpen(true);
  }, []);

  // Add comment (local state only — backend endpoint would be called here)
  const handleAddComment = useCallback((lineItem: string, comment: string) => {
    const newComment: CDRLComment = {
      id: `local-${Date.now()}`,
      cdrl_id: selectedCdrl?.id || '',
      line_item: lineItem,
      commenter: 'Current User',
      comment,
      created_at: new Date().toISOString(),
    };
    setComments((prev) => [newComment, ...prev]);
  }, [selectedCdrl]);

  // Toggle row expansion
  const toggleExpand = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-surface">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-lg font-semibold text-text-ops-primary">
              Contract Deliverables Register
            </h2>
            <p className="text-sm text-text-ops-muted">
              CDRL / SDRL tracking and review window management
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchCdrls}
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
        counts={statusCounts}
      />

      {/* Summary Strip */}
      <div className="grid grid-cols-4 gap-4 px-6 py-3 border-b border-border-ops-subtle bg-bg-ops-surface/50">
        <div className="flex items-center gap-3 rounded-lg border border-border-ops-subtle bg-bg-ops-overlay px-4 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20">
            <FileText size={16} className="text-blue-400" />
          </div>
          <div>
            <div className="text-lg font-bold font-mono text-text-ops-primary">
              {cdrls.length}
            </div>
            <div className="text-xs text-text-ops-muted uppercase tracking-wider">Total</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20">
            <Clock size={16} className="text-amber-400" />
          </div>
          <div>
            <div className="text-lg font-bold font-mono text-amber-400">
              {statusCounts['UNDER_REVIEW'] || 0}
            </div>
            <div className="text-xs text-text-ops-muted uppercase tracking-wider">Under Review</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/20">
            <CheckCircle2 size={16} className="text-green-400" />
          </div>
          <div>
            <div className="text-lg font-bold font-mono text-green-400">
              {(statusCounts['ACCEPTED'] || 0) + (statusCounts['ACCEPTED_WITH_COMMENTS'] || 0)}
            </div>
            <div className="text-xs text-text-ops-muted uppercase tracking-wider">Accepted</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/20">
            <AlertCircle size={16} className="text-red-400" />
          </div>
          <div>
            <div className="text-lg font-bold font-mono text-red-400">
              {statusCounts['REJECTED'] || 0}
            </div>
            <div className="text-xs text-text-ops-muted uppercase tracking-wider">Rejected</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {isLoading && cdrls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-text-ops-muted">
            <Loader2 size={48} className="mb-4 animate-spin text-blue-400" />
            <p className="text-lg font-semibold">Loading deliverables...</p>
            <p className="text-sm mt-1">Querying the contract register.</p>
          </div>
        ) : filteredCdrls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-text-ops-muted">
            <FileText size={48} className="mb-4 text-text-ops-muted/50" />
            <p className="text-lg font-semibold text-text-ops-primary">
              No Deliverables Found
            </p>
            <p className="text-sm mt-2 text-center max-w-md">
              {filters.status || filters.search
                ? 'No CDRLs match the current filters. Try adjusting your filter criteria.'
                : 'No contract deliverables have been registered yet.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-bg-ops-surface border-b border-border-ops-subtle">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-ops-muted uppercase tracking-wider">
                  <span className="sr-only">Expand</span>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-ops-muted uppercase tracking-wider">
                  CDRL Number
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-ops-muted uppercase tracking-wider">
                  Title
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-ops-muted uppercase tracking-wider">
                  DID Reference
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-ops-muted uppercase tracking-wider">
                  Revision
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-ops-muted uppercase tracking-wider">
                  Contractual Due
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-ops-muted uppercase tracking-wider">
                  Review Deadline
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-ops-muted uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-ops-muted uppercase tracking-wider">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-ops-subtle">
              {filteredCdrls.map((cdrl) => {
                const isExpanded = expandedRows.has(cdrl.id);
                return (
                  <React.Fragment key={cdrl.id}>
                    <tr
                      className="hover:bg-bg-ops-overlay/50 transition-colors cursor-pointer"
                      onClick={() => toggleExpand(cdrl.id)}
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="p-1 rounded text-text-ops-muted hover:text-text-ops-primary transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(cdrl.id);
                          }}
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-text-ops-primary font-semibold">
                        {cdrl.cdrl_sequence_number}
                      </td>
                      <td className="px-4 py-3 text-text-ops-primary max-w-[300px] truncate">
                        {cdrl.title}
                      </td>
                      <td className="px-4 py-3 font-mono text-text-ops-muted">
                        {cdrl.did_reference}
                      </td>
                      <td className="px-4 py-3 font-mono text-text-ops-muted">
                        {cdrl.revision}
                      </td>
                      <td className="px-4 py-3 font-mono text-text-ops-muted">
                        {cdrl.contractual_due_date}
                      </td>
                      <td className="px-4 py-3">
                        <ReviewCountdownBadge daysRemaining={cdrl.days_until_review_deadline} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={cdrl.status} />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDrawer(cdrl);
                          }}
                          className="inline-flex items-center gap-1.5 rounded border border-border-ops-subtle bg-bg-ops-overlay px-2.5 py-1 text-xs font-medium text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong transition-colors"
                        >
                          <MessageSquare size={12} />
                          Comments
                        </button>
                      </td>
                    </tr>
                    {/* Expanded Detail Row */}
                    {isExpanded && (
                      <tr className="bg-bg-ops-overlay/30">
                        <td colSpan={9} className="px-6 py-4">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-text-ops-muted text-xs uppercase tracking-wider">Portfolio Node</span>
                              <p className="font-mono text-text-ops-primary">{cdrl.portfolio_node_id}</p>
                            </div>
                            {cdrl.actual_submission_date && (
                              <div>
                                <span className="text-text-ops-muted text-xs uppercase tracking-wider">Submitted On</span>
                                <p className="font-mono text-text-ops-primary">{cdrl.actual_submission_date}</p>
                              </div>
                            )}
                            <div>
                              <span className="text-text-ops-muted text-xs uppercase tracking-wider">Review Window</span>
                              <p className="font-mono text-text-ops-primary">{cdrl.review_window_days} days</p>
                            </div>
                            <div>
                              <span className="text-text-ops-muted text-xs uppercase tracking-wider">Last Updated</span>
                              <p className="font-mono text-text-ops-primary">{cdrl.updated_at}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Comment Drawer */}
      {drawerOpen && selectedCdrl && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer Panel */}
          <div className="relative w-[480px] max-w-full h-full bg-bg-ops-surface border-l border-border-ops-subtle shadow-2xl flex flex-col">
            <CommentDrawer
              cdrl={selectedCdrl}
              comments={comments}
              onClose={() => setDrawerOpen(false)}
              onAddComment={handleAddComment}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ContractDeliverablesView;
