/**
 * Commercial Governance View
 *
 * Contract management, fiscal year spending caps, and government acceptance
 * milestone tracking for the Eisenhower Portfolio Manager.
 *
 * Layout
 * ------
 * 1. Summary Metrics — Active contracts, fiscal cap utilization, pending acceptances
 * 2. Tabbed interface:
 *    - Contracts: Project contract structures with pricing type and TCIF calculation
 *    - Fiscal Caps: Year-by-year spending limits and utilization
 *    - Acceptances: Government milestone sign-off tracking
 *
 * Data Sources
 * ------------
 * - GET /api/v1/commercial/contracts/{id} → Contract structure
 * - POST /api/v1/commercial/contracts → Create contract
 * - PUT /api/v1/commercial/contracts/{id} → Update contract
 * - POST /api/v1/commercial/contracts/{id}/tcif-fee-adjustment → TCIF calculation
 * - GET /api/v1/commercial/fiscal-caps/{id} → Fiscal caps
 * - POST /api/v1/commercial/fiscal-caps → Create fiscal cap
 * - POST /api/v1/commercial/fiscal-caps/{id}/validate → Validate spend profile
 * - GET /api/v1/commercial/acceptance/{id} → Acceptance milestones
 * - POST /api/v1/commercial/acceptance → Create acceptance milestone
 * - PUT /api/v1/commercial/acceptance/{id} → Update acceptance status
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Scale,
  FileText,
  DollarSign,
  CheckCircle,
  Clock,
  AlertTriangle,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  Calculator,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ContractPricingType = 'FFP' | 'FIRF' | 'CPFF' | 'CPAF' | 'CCP' | 'TCIF';
type AcceptanceStatus = 'PENDING_INSPECTION' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED';
type AcceptanceDocType = 'FRR' | 'DAR' | 'SRR' | 'PMA' | 'FMA';

interface ContractStructure {
  id: string;
  portfolio_node_id: string;
  contract_pricing_type: ContractPricingType;
  target_cost: number;
  target_fee: number;
  ceiling_price?: number;
  contractor_share_ratio?: number;
  customer_share_ratio?: number;
  created_at?: string;
}

interface FiscalCap {
  id: string;
  portfolio_node_id: string;
  fiscal_year: number;
  fy_start_date: string;
  fy_end_date: string;
  allocated_funding_cap: number;
  actual_spend?: number;
}

interface AcceptanceMilestone {
  id: string;
  portfolio_node_id: string;
  acceptance_document_type: AcceptanceDocType;
  receipt_reference_number?: string;
  qar_inspector_name?: string;
  status: AcceptanceStatus;
  signoff_date?: string;
  created_at?: string;
}

type TabKey = 'contracts' | 'fiscal' | 'acceptances';

const PRICING_TYPE_LABELS: Record<ContractPricingType, string> = {
  FFP: 'Fixed Price',
  FIRF: 'Firm Fixed Price',
  CPFF: 'Cost Plus Fixed Fee',
  CPAF: 'Cost Plus Award Fee',
  CCP: 'Cost Plus Incentive',
  TCIF: 'Target Cost Incentive',
};

const ACCEPTANCE_STATUS_COLORS: Record<AcceptanceStatus, string> = {
  PENDING_INSPECTION: 'text-gray-400',
  UNDER_REVIEW: 'text-amber-400',
  ACCEPTED: 'text-emerald-400',
  REJECTED: 'text-red-400',
};

const DOC_TYPE_LABELS: Record<AcceptanceDocType, string> = {
  FRR: 'Final Review Report',
  DAR: 'Design Assurance Report',
  SRR: 'System Review Report',
  PMA: 'Preliminary MA',
  FMA: 'Final MA',
};

// ---------------------------------------------------------------------------
// Commercial View Component
// ---------------------------------------------------------------------------

const CommercialView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('contracts');
  const [contracts, setContracts] = useState<ContractStructure[]>([]);
  const [fiscalCaps, setFiscalCaps] = useState<FiscalCap[]>([]);
  const [acceptances, setAcceptances] = useState<AcceptanceMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateContract, setShowCreateContract] = useState(false);
  const [showCreateCap, setShowCreateCap] = useState(false);
  const [showCreateAcceptance, setShowCreateAcceptance] = useState(false);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // In a real app, these would call list endpoints
      // For now we initialize empty and show create forms
      setContracts([]);
      setFiscalCaps([]);
      setAcceptances([]);
    } catch (err) {
      console.error('Failed to fetch commercial data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // CRUD operations
  // ---------------------------------------------------------------------------

  const handleCreateContract = async (contract: Partial<ContractStructure>) => {
    try {
      const res = await api.post('/commercial/contracts', contract);
      setContracts((prev) => [...prev, res.data]);
      setShowCreateContract(false);
    } catch (err) {
      console.error('Failed to create contract:', err);
    }
  };

  const handleCreateCap = async (cap: Partial<FiscalCap>) => {
    try {
      const res = await api.post('/commercial/fiscal-caps', cap);
      setFiscalCaps((prev) => [...prev, res.data]);
      setShowCreateCap(false);
    } catch (err) {
      console.error('Failed to create fiscal cap:', err);
    }
  };

  const handleCreateAcceptance = async (acceptance: Partial<AcceptanceMilestone>) => {
    try {
      const res = await api.post('/commercial/acceptance', acceptance);
      setAcceptances((prev) => [...prev, res.data]);
      setShowCreateAcceptance(false);
    } catch (err) {
      console.error('Failed to create acceptance milestone:', err);
    }
  };

  const handleUpdateAcceptance = async (id: string, status: AcceptanceStatus) => {
    try {
      const res = await api.put(`/commercial/acceptance/${id}`, { status });
      setAcceptances((prev) =>
        prev.map((a) => (a.id === id ? res.data : a))
      );
    } catch (err) {
      console.error('Failed to update acceptance:', err);
    }
  };

  const handleTCIFCalculation = async (projectId: string, projectedCost: number) => {
    try {
      const res = await api.post(`/commercial/contracts/${projectId}/tcif-fee-adjustment`, null, {
        params: { projected_cost: projectedCost },
      });
      alert(`TCIF Result:\nAdjusted Fee: ${res.data.adjusted_fee}\nTotal Price: ${res.data.total_price}`);
    } catch (err) {
      console.error('TCIF calculation failed:', err);
    }
  };

  // ---------------------------------------------------------------------------
  // Computed metrics
  // ---------------------------------------------------------------------------

  const totalAllocated = fiscalCaps.reduce((sum, c) => sum + c.allocated_funding_cap, 0);
  const totalSpent = fiscalCaps.reduce((sum, c) => sum + (c.actual_spend || 0), 0);
  const pendingAcceptances = acceptances.filter(
    (a) => a.status === 'PENDING_INSPECTION' || a.status === 'UNDER_REVIEW'
  ).length;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-ops-muted">Loading commercial data...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <Scale className="w-6 h-6 text-purple-400" />
          <div>
            <h1 className="text-lg font-semibold text-text-ops-primary">
              Commercial Governance
            </h1>
            <p className="text-sm text-text-ops-muted">
              Contracts, Fiscal Caps &amp; Government Acceptance
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-border-ops-subtle">
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle">
          <div className="flex items-center gap-2 text-text-ops-muted text-sm mb-1">
            <FileText className="w-4 h-4" />
            <span>Active Contracts</span>
          </div>
          <div className="text-2xl font-bold text-text-ops-primary">{contracts.length}</div>
        </div>
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle">
          <div className="flex items-center gap-2 text-text-ops-muted text-sm mb-1">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span>Fiscal Utilization</span>
          </div>
          <div className="text-2xl font-bold text-text-ops-primary">
            {totalAllocated > 0 ? `${((totalSpent / totalAllocated) * 100).toFixed(1)}%` : '0%'}
          </div>
          <div className="text-xs text-text-ops-muted">
            {formatCurrency(totalSpent)} / {formatCurrency(totalAllocated)}
          </div>
        </div>
        <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle">
          <div className="flex items-center gap-2 text-text-ops-muted text-sm mb-1">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Pending Acceptances</span>
          </div>
          <div className="text-2xl font-bold text-amber-400">{pendingAcceptances}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 border-b border-border-ops-subtle">
        {([
          { key: 'contracts', label: 'Contracts', icon: FileText },
          { key: 'fiscal', label: 'Fiscal Caps', icon: DollarSign },
          { key: 'acceptances', label: 'Acceptances', icon: CheckCircle },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={clsx(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === key
                ? 'border-blue-400 text-blue-400'
                : 'border-transparent text-text-ops-muted hover:text-text-ops-primary'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Contracts Tab */}
        {activeTab === 'contracts' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-medium text-text-ops-primary">
                Contract Structures
              </h2>
              <button
                onClick={() => setShowCreateContract(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Contract
              </button>
            </div>

            {showCreateContract && (
              <CreateContractForm
                onSubmit={handleCreateContract}
                onCancel={() => setShowCreateContract(false)}
              />
            )}

            <div className="grid gap-4">
              {contracts.map((contract) => (
                <div
                  key={contract.id}
                  className="bg-bg-ops-surface rounded-lg border border-border-ops-subtle p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-text-ops-muted">
                        {contract.portfolio_node_id.slice(0, 8)}
                      </span>
                      <span className="px-2 py-0.5 bg-bg-ops-overlay rounded text-xs text-text-ops-muted">
                        {PRICING_TYPE_LABELS[contract.contract_pricing_type]}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {contract.contract_pricing_type === 'TCIF' && (
                        <button
                          onClick={() => {
                            const cost = prompt('Enter projected cost:');
                            if (cost) handleTCIFCalculation(contract.portfolio_node_id, Number(cost));
                          }}
                          className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-blue-400 transition-colors"
                          title="Calculate TCIF"
                        >
                          <Calculator className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-text-ops-muted mb-1">Target Cost</div>
                      <div className="text-base font-mono text-text-ops-primary">
                        {formatCurrency(contract.target_cost)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-text-ops-muted mb-1">Target Fee</div>
                      <div className="text-base font-mono text-emerald-400">
                        {formatCurrency(contract.target_fee)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-text-ops-muted mb-1">Ceiling Price</div>
                      <div className="text-base font-mono text-text-ops-primary">
                        {contract.ceiling_price ? formatCurrency(contract.ceiling_price) : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-text-ops-muted mb-1">Share Ratio</div>
                      <div className="text-base font-mono text-text-ops-primary">
                        {contract.contractor_share_ratio
                          ? `${contract.contractor_share_ratio} / ${contract.customer_share_ratio}`
                          : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {contracts.length === 0 && (
                <div className="py-8 text-center text-text-ops-muted">
                  No contracts defined. Create one to get started.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Fiscal Caps Tab */}
        {activeTab === 'fiscal' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-medium text-text-ops-primary">
                Fiscal Year Spending Caps
              </h2>
              <button
                onClick={() => setShowCreateCap(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Cap
              </button>
            </div>

            {showCreateCap && (
              <CreateFiscalCapForm
                onSubmit={handleCreateCap}
                onCancel={() => setShowCreateCap(false)}
              />
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-ops-subtle text-text-ops-muted">
                    <th className="text-left py-2 px-3 font-medium">Fiscal Year</th>
                    <th className="text-left py-2 px-3 font-medium">Period</th>
                    <th className="text-right py-2 px-3 font-medium">Allocated Cap</th>
                    <th className="text-right py-2 px-3 font-medium">Actual Spend</th>
                    <th className="text-right py-2 px-3 font-medium">Utilization</th>
                    <th className="text-center py-2 px-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {fiscalCaps.map((cap) => {
                    const utilization = cap.allocated_funding_cap > 0
                      ? ((cap.actual_spend || 0) / cap.allocated_funding_cap) * 100
                      : 0;
                    const isOver = utilization > 100;
                    return (
                      <tr
                        key={cap.id}
                        className={clsx(
                          'border-b border-border-ops-subtle hover:bg-bg-ops-overlay transition-colors',
                          isOver && 'bg-red-900/10'
                        )}
                      >
                        <td className="py-2 px-3 font-semibold text-text-ops-primary">
                          FY{cap.fiscal_year}
                        </td>
                        <td className="py-2 px-3 text-text-ops-muted text-xs">
                          {cap.fy_start_date} → {cap.fy_end_date}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-text-ops-primary">
                          {formatCurrency(cap.allocated_funding_cap)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-text-ops-primary">
                          {formatCurrency(cap.actual_spend || 0)}
                        </td>
                        <td className={clsx(
                          'py-2 px-3 text-right font-mono',
                          isOver ? 'text-red-400 font-bold' : 'text-text-ops-muted'
                        )}>
                          {utilization.toFixed(1)}%
                        </td>
                        <td className="py-2 px-3 text-center">
                          {isOver ? (
                            <AlertTriangle className="w-4 h-4 text-red-400 mx-auto" />
                          ) : utilization > 80 ? (
                            <AlertTriangle className="w-4 h-4 text-amber-400 mx-auto" />
                          ) : (
                            <CheckCircle className="w-4 h-4 text-emerald-400 mx-auto" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {fiscalCaps.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-text-ops-muted">
                        No fiscal caps defined.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Acceptances Tab */}
        {activeTab === 'acceptances' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-medium text-text-ops-primary">
                Government Acceptance Milestones
              </h2>
              <button
                onClick={() => setShowCreateAcceptance(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Milestone
              </button>
            </div>

            {showCreateAcceptance && (
              <CreateAcceptanceForm
                onSubmit={handleCreateAcceptance}
                onCancel={() => setShowCreateAcceptance(false)}
              />
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-ops-subtle text-text-ops-muted">
                    <th className="text-left py-2 px-3 font-medium">Document Type</th>
                    <th className="text-left py-2 px-3 font-medium">Reference</th>
                    <th className="text-left py-2 px-3 font-medium">Inspector</th>
                    <th className="text-left py-2 px-3 font-medium">Status</th>
                    <th className="text-left py-2 px-3 font-medium">Sign-off Date</th>
                    <th className="text-right py-2 px-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {acceptances.map((acceptance) => (
                    <tr
                      key={acceptance.id}
                      className="border-b border-border-ops-subtle hover:bg-bg-ops-overlay transition-colors"
                    >
                      <td className="py-2 px-3 text-text-ops-primary">
                        {DOC_TYPE_LABELS[acceptance.acceptance_document_type]}
                      </td>
                      <td className="py-2 px-3 font-mono text-text-ops-muted text-xs">
                        {acceptance.receipt_reference_number || '—'}
                      </td>
                      <td className="py-2 px-3 text-text-ops-muted text-xs">
                        {acceptance.qar_inspector_name || '—'}
                      </td>
                      <td className="py-2 px-3">
                        <span className={clsx(
                          'px-2 py-0.5 rounded text-xs font-medium',
                          ACCEPTANCE_STATUS_COLORS[acceptance.status]
                        )}>
                          {acceptance.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-text-ops-muted text-xs">
                        {acceptance.signoff_date || '—'}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {acceptance.status !== 'ACCEPTED' && (
                          <button
                            onClick={() => handleUpdateAcceptance(acceptance.id, 'ACCEPTED')}
                            className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-emerald-400 transition-colors"
                            title="Mark Accepted"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {acceptances.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-text-ops-muted">
                        No acceptance milestones defined.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Create Contract Form
// ---------------------------------------------------------------------------

interface CreateContractFormProps {
  onSubmit: (contract: Partial<ContractStructure>) => void;
  onCancel: () => void;
}

const CreateContractForm: React.FC<CreateContractFormProps> = ({ onSubmit, onCancel }) => {
  const [nodeId, setNodeId] = useState('');
  const [pricingType, setPricingType] = useState<ContractPricingType>('TCIF');
  const [targetCost, setTargetCost] = useState(0);
  const [targetFee, setTargetFee] = useState(0);
  const [ceilingPrice, setCeilingPrice] = useState(0);
  const [contractorShare, setContractorShare] = useState(0.2);
  const [customerShare, setCustomerShare] = useState(0.8);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      portfolio_node_id: nodeId,
      contract_pricing_type: pricingType,
      target_cost: targetCost,
      target_fee: targetFee,
      ceiling_price: ceilingPrice || undefined,
      contractor_share_ratio: contractorShare,
      customer_share_ratio: customerShare,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mb-4 p-4 bg-bg-ops-surface rounded-lg border border-blue-500/30">
      <h3 className="text-sm font-medium text-text-ops-primary mb-3">New Contract Structure</h3>
      <div className="grid grid-cols-4 gap-3 mb-3">
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Project Node ID</label>
          <input type="text" value={nodeId} onChange={(e) => setNodeId(e.target.value)}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" required />
        </div>
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Pricing Type</label>
          <select value={pricingType} onChange={(e) => setPricingType(e.target.value as ContractPricingType)}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary">
            {Object.entries(PRICING_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Target Cost</label>
          <input type="number" value={targetCost} onChange={(e) => setTargetCost(Number(e.target.value))}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" />
        </div>
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Target Fee</label>
          <input type="number" value={targetFee} onChange={(e) => setTargetFee(Number(e.target.value))}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" />
        </div>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary">Cancel</button>
        <button type="submit" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm">Create</button>
      </div>
    </form>
  );
};

// ---------------------------------------------------------------------------
// Create Fiscal Cap Form
// ---------------------------------------------------------------------------

interface CreateFiscalCapFormProps {
  onSubmit: (cap: Partial<FiscalCap>) => void;
  onCancel: () => void;
}

const CreateFiscalCapForm: React.FC<CreateFiscalCapFormProps> = ({ onSubmit, onCancel }) => {
  const [nodeId, setNodeId] = useState('');
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [cap, setCap] = useState(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      portfolio_node_id: nodeId,
      fiscal_year: fiscalYear,
      fy_start_date: startDate,
      fy_end_date: endDate,
      allocated_funding_cap: cap,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mb-4 p-4 bg-bg-ops-surface rounded-lg border border-blue-500/30">
      <h3 className="text-sm font-medium text-text-ops-primary mb-3">New Fiscal Cap</h3>
      <div className="grid grid-cols-4 gap-3 mb-3">
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Control Account ID</label>
          <input type="text" value={nodeId} onChange={(e) => setNodeId(e.target.value)}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" required />
        </div>
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Fiscal Year</label>
          <input type="number" value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value))}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" />
        </div>
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Start Date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" />
        </div>
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">End Date</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" />
        </div>
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Funding Cap (£)</label>
          <input type="number" value={cap} onChange={(e) => setCap(Number(e.target.value))}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" />
        </div>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary">Cancel</button>
        <button type="submit" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm">Create</button>
      </div>
    </form>
  );
};

// ---------------------------------------------------------------------------
// Create Acceptance Form
// ---------------------------------------------------------------------------

interface CreateAcceptanceFormProps {
  onSubmit: (acceptance: Partial<AcceptanceMilestone>) => void;
  onCancel: () => void;
}

const CreateAcceptanceForm: React.FC<CreateAcceptanceFormProps> = ({ onSubmit, onCancel }) => {
  const [nodeId, setNodeId] = useState('');
  const [docType, setDocType] = useState<AcceptanceDocType>('FRR');
  const [reference, setReference] = useState('');
  const [inspector, setInspector] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      portfolio_node_id: nodeId,
      acceptance_document_type: docType,
      receipt_reference_number: reference || undefined,
      qar_inspector_name: inspector || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mb-4 p-4 bg-bg-ops-surface rounded-lg border border-blue-500/30">
      <h3 className="text-sm font-medium text-text-ops-primary mb-3">New Acceptance Milestone</h3>
      <div className="grid grid-cols-4 gap-3 mb-3">
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Deliverable Node ID</label>
          <input type="text" value={nodeId} onChange={(e) => setNodeId(e.target.value)}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" required />
        </div>
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Document Type</label>
          <select value={docType} onChange={(e) => setDocType(e.target.value as AcceptanceDocType)}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary">
            {Object.entries(DOC_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Reference Number</label>
          <input type="text" value={reference} onChange={(e) => setReference(e.target.value)}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" />
        </div>
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">QAR Inspector</label>
          <input type="text" value={inspector} onChange={(e) => setInspector(e.target.value)}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary" />
        </div>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary">Cancel</button>
        <button type="submit" className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm">Create</button>
      </div>
    </form>
  );
};

export default CommercialView;
