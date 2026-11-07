/**
 * Costing Workbench View
 *
 * The financial management interface for the Eisenhower Portfolio Manager.
 * Provides a comprehensive view of the Cost Breakdown Structure (CBS),
 * indirect rate management, and cost rollup analysis.
 *
 * Layout
 * ------
 * 1. Summary Metrics Strip — Total direct cost, burdened cost, and cost variance
 * 2. Tabbed interface:
 *    - Cost Elements: CRUD table for CBS taxonomy (labour, materials, subcontract, ODC)
 *    - Indirect Rates: FPRA rate structures by fiscal year
 *    - CBS Rollup: Hierarchical cost rollup across WBS levels
 *
 * Data Sources
 * ------------
 * - GET /api/v1/costing/elements → Cost element catalogue
 * - POST /api/v1/costing/elements → Create cost element
 * - PUT /api/v1/costing/elements/{id} → Update cost element
 * - DELETE /api/v1/costing/elements/{id} → Delete cost element
 * - GET /api/v1/costing/rates → Indirect rate structures
 * - POST /api/v1/costing/rates → Create rate structure
 * - PUT /api/v1/costing/rates/{id} → Update rate structure
 * - GET /api/v1/costing/projects/{id}/cbs-rollup → CBS rollup
 * - GET /api/v1/costing/tasks/{id}/cost-breakdown → Task cost breakdown
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  FileText,
  Calculator,
  BarChart3,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CostElement {
  id: string;
  code: string;
  name: string;
  category: string;
  created_at?: string;
  updated_at?: string;
}

interface IndirectRate {
  id: string;
  fiscal_year: number;
  currency_code: string;
  fringe_rate_percent: number;
  overhead_rate_percent: number;
  ga_rate_percent: number;
  fee_profit_percent: number;
  created_at?: string;
  updated_at?: string;
}

interface CBSCategoryBreakdown {
  category: string;
  direct_cost: number;
  burdened_cost: number;
  burden_amount: number;
}

interface CBSLevel {
  level: number;
  code: string;
  name: string;
  direct_cost: number;
  burdened_cost: number;
  categories: CBSCategoryBreakdown[];
}

interface CBSRollup {
  project_id: string;
  fiscal_year: number;
  levels: CBSLevel[];
  grand_total_direct: number;
  grand_total_burdened: number;
  grand_total_burden: number;
}

type TabKey = 'elements' | 'rates' | 'rollup';

// ---------------------------------------------------------------------------
// Costing View Component
// ---------------------------------------------------------------------------

interface CostingViewProps {
  /** Optional project ID for CBS rollup */
  projectId?: string;
}

const CostingView: React.FC<CostingViewProps> = ({ projectId }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('elements');
  const [costElements, setCostElements] = useState<CostElement[]>([]);
  const [indirectRates, setIndirectRates] = useState<IndirectRate[]>([]);
  const [cbsRollup, setCBSRollup] = useState<CBSRollup | null>(null);
  const [loading, setLoading] = useState(true);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [showCreateElement, setShowCreateElement] = useState(false);
  const [showCreateRate, setShowCreateRate] = useState(false);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchCostElements = useCallback(async () => {
    try {
      const res = await api.get('/costing/elements');
      setCostElements(res.data || []);
    } catch (err) {
      console.error('Failed to fetch cost elements:', err);
    }
  }, []);

  const fetchIndirectRates = useCallback(async () => {
    try {
      const res = await api.get('/costing/rates');
      setIndirectRates(res.data || []);
    } catch (err) {
      console.error('Failed to fetch indirect rates:', err);
    }
  }, []);

  const fetchCBSRollup = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await api.get(`/costing/projects/${projectId}/cbs-rollup`, {
        params: { fiscal_year: fiscalYear },
      });
      setCBSRollup(res.data || null);
    } catch (err) {
      console.error('Failed to fetch CBS rollup:', err);
    }
  }, [projectId, fiscalYear]);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([
        fetchCostElements(),
        fetchIndirectRates(),
        projectId ? fetchCBSRollup() : Promise.resolve(),
      ]);
      setLoading(false);
    };
    loadAll();
  }, [fetchCostElements, fetchIndirectRates, fetchCBSRollup, projectId]);

  // ---------------------------------------------------------------------------
  // CRUD operations
  // ---------------------------------------------------------------------------

  const handleCreateElement = async (element: Omit<CostElement, 'id'>) => {
    try {
      const res = await api.post('/costing/elements', element);
      setCostElements((prev) => [...prev, res.data]);
      setShowCreateElement(false);
    } catch (err) {
      console.error('Failed to create cost element:', err);
    }
  };

  const handleUpdateElement = async (id: string, updates: Partial<CostElement>) => {
    try {
      const res = await api.put(`/costing/elements/${id}`, updates);
      setCostElements((prev) =>
        prev.map((el) => (el.id === id ? res.data : el))
      );
    } catch (err) {
      console.error('Failed to update cost element:', err);
    }
  };

  const handleDeleteElement = async (id: string) => {
    try {
      await api.delete(`/costing/elements/${id}`);
      setCostElements((prev) => prev.filter((el) => el.id !== id));
    } catch (err) {
      console.error('Failed to delete cost element:', err);
    }
  };

  const handleCreateRate = async (rate: Omit<IndirectRate, 'id'>) => {
    try {
      const res = await api.post('/costing/rates', rate);
      setIndirectRates((prev) => [...prev, res.data]);
      setShowCreateRate(false);
    } catch (err) {
      console.error('Failed to create indirect rate:', err);
    }
  };

  const handleUpdateRate = async (id: string, updates: Partial<IndirectRate>) => {
    try {
      const res = await api.put(`/costing/rates/${id}`, updates);
      setIndirectRates((prev) =>
        prev.map((r) => (r.id === id ? res.data : r))
      );
    } catch (err) {
      console.error('Failed to update indirect rate:', err);
    }
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const formatPercent = (value: number) =>
    `${value.toFixed(2)}%`;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-text-ops-muted">Loading costing data...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle">
        <div className="flex items-center gap-3">
          <DollarSign className="w-6 h-6 text-emerald-400" />
          <div>
            <h1 className="text-lg font-semibold text-text-ops-primary">
              Costing Workbench
            </h1>
            <p className="text-sm text-text-ops-muted">
              Cost Breakdown Structure &amp; Financial Management
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {projectId && (
            <select
              value={fiscalYear}
              onChange={(e) => setFiscalYear(Number(e.target.value))}
              className="bg-bg-ops-surface border border-border-ops-strong rounded px-2 py-1 text-sm text-text-ops-primary"
            >
              {[2024, 2025, 2026, 2027, 2028].map((year) => (
                <option key={year} value={year}>
                  FY{year}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => {
              fetchCostElements();
              fetchIndirectRates();
              if (projectId) fetchCBSRollup();
            }}
            className="p-2 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors"
            title="Refresh data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Summary Metrics */}
      {cbsRollup && (
        <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-border-ops-subtle">
          <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle">
            <div className="flex items-center gap-2 text-text-ops-muted text-sm mb-1">
              <Calculator className="w-4 h-4" />
              <span>Direct Cost</span>
            </div>
            <div className="text-2xl font-bold text-text-ops-primary">
              {formatCurrency(cbsRollup.grand_total_direct)}
            </div>
          </div>
          <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle">
            <div className="flex items-center gap-2 text-text-ops-muted text-sm mb-1">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>Burdened Cost</span>
            </div>
            <div className="text-2xl font-bold text-text-ops-primary">
              {formatCurrency(cbsRollup.grand_total_burdened)}
            </div>
          </div>
          <div className="bg-bg-ops-surface rounded-lg p-4 border border-border-ops-subtle">
            <div className="flex items-center gap-2 text-text-ops-muted text-sm mb-1">
              <BarChart3 className="w-4 h-4 text-amber-400" />
              <span>Burden Amount</span>
            </div>
            <div className="text-2xl font-bold text-amber-400">
              {formatCurrency(cbsRollup.grand_total_burden)}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 border-b border-border-ops-subtle">
        <button
          onClick={() => setActiveTab('elements')}
          className={clsx(
            'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'elements'
              ? 'border-blue-400 text-blue-400'
              : 'border-transparent text-text-ops-muted hover:text-text-ops-primary'
          )}
        >
          <FileText className="w-4 h-4 inline mr-2" />
          Cost Elements
        </button>
        <button
          onClick={() => setActiveTab('rates')}
          className={clsx(
            'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'rates'
              ? 'border-blue-400 text-blue-400'
              : 'border-transparent text-text-ops-muted hover:text-text-ops-primary'
          )}
        >
          <Calculator className="w-4 h-4 inline mr-2" />
          Indirect Rates
        </button>
        {projectId && (
          <button
            onClick={() => setActiveTab('rollup')}
            className={clsx(
              'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'rollup'
                ? 'border-blue-400 text-blue-400'
                : 'border-transparent text-text-ops-muted hover:text-text-ops-primary'
            )}
          >
            <BarChart3 className="w-4 h-4 inline mr-2" />
            CBS Rollup
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Cost Elements Tab */}
        {activeTab === 'elements' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-medium text-text-ops-primary">
                CBS Taxonomy — {costElements.length} elements
              </h2>
              <button
                onClick={() => setShowCreateElement(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Element
              </button>
            </div>

            {showCreateElement && (
              <CreateCostElementForm
                onSubmit={handleCreateElement}
                onCancel={() => setShowCreateElement(false)}
              />
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-ops-subtle text-text-ops-muted">
                    <th className="text-left py-2 px-3 font-medium">Code</th>
                    <th className="text-left py-2 px-3 font-medium">Name</th>
                    <th className="text-left py-2 px-3 font-medium">Category</th>
                    <th className="text-left py-2 px-3 font-medium">Created</th>
                    <th className="text-right py-2 px-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {costElements.map((el) => (
                    <tr
                      key={el.id}
                      className="border-b border-border-ops-subtle hover:bg-bg-ops-overlay transition-colors"
                    >
                      <td className="py-2 px-3 font-mono text-text-ops-primary">
                        {el.code}
                      </td>
                      <td className="py-2 px-3 text-text-ops-primary">
                        {el.name}
                      </td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 bg-bg-ops-overlay rounded text-xs text-text-ops-muted">
                          {el.category}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-text-ops-muted text-xs">
                        {el.created_at
                          ? new Date(el.created_at).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              // Inline edit could be implemented here
                              alert(`Edit ${el.code}`);
                            }}
                            className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-blue-400 transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteElement(el.id)}
                            className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {costElements.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-text-ops-muted">
                        No cost elements defined. Create one to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Indirect Rates Tab */}
        {activeTab === 'rates' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-medium text-text-ops-primary">
                FPRA Rate Structures — {indirectRates.length} records
              </h2>
              <button
                onClick={() => setShowCreateRate(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Rate Structure
              </button>
            </div>

            {showCreateRate && (
              <CreateIndirectRateForm
                onSubmit={handleCreateRate}
                onCancel={() => setShowCreateRate(false)}
              />
            )}

            <div className="grid gap-4">
              {indirectRates.map((rate) => (
                <div
                  key={rate.id}
                  className="bg-bg-ops-surface rounded-lg border border-border-ops-subtle p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-semibold text-text-ops-primary">
                        FY{rate.fiscal_year}
                      </span>
                      <span className="px-2 py-0.5 bg-bg-ops-overlay rounded text-xs text-text-ops-muted">
                        {rate.currency_code}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        alert(`Edit FY${rate.fiscal_year}`);
                      }}
                      className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-blue-400 transition-colors"
                      title="Edit"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-text-ops-muted mb-1">Fringe Rate</div>
                      <div className="text-base font-mono text-text-ops-primary">
                        {formatPercent(rate.fringe_rate_percent)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-text-ops-muted mb-1">Overhead Rate</div>
                      <div className="text-base font-mono text-text-ops-primary">
                        {formatPercent(rate.overhead_rate_percent)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-text-ops-muted mb-1">G&amp;A Rate</div>
                      <div className="text-base font-mono text-text-ops-primary">
                        {formatPercent(rate.ga_rate_percent)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-text-ops-muted mb-1">Fee / Profit</div>
                      <div className="text-base font-mono text-emerald-400">
                        {formatPercent(rate.fee_profit_percent)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {indirectRates.length === 0 && (
                <div className="py-8 text-center text-text-ops-muted">
                  No indirect rate structures defined. Create one to enable burdening calculations.
                </div>
              )}
            </div>
          </div>
        )}

        {/* CBS Rollup Tab */}
        {activeTab === 'rollup' && (
          <div>
            <h2 className="text-base font-medium text-text-ops-primary mb-4">
              CBS Financial Rollup — FY{fiscalYear}
            </h2>

            {cbsRollup ? (
              <div className="space-y-4">
                {cbsRollup.levels.map((level) => (
                  <div
                    key={`${level.level}-${level.code}`}
                    className="bg-bg-ops-surface rounded-lg border border-border-ops-subtle overflow-hidden"
                  >
                    <div className="px-4 py-3 border-b border-border-ops-subtle bg-bg-ops-overlay">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-mono text-sm text-text-ops-muted mr-2">
                            {level.code}
                          </span>
                          <span className="text-text-ops-primary font-medium">
                            {level.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="text-right">
                            <div className="text-text-ops-muted text-xs">Direct</div>
                            <div className="font-mono text-text-ops-primary">
                              {formatCurrency(level.direct_cost)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-text-ops-muted text-xs">Burdened</div>
                            <div className="font-mono text-emerald-400">
                              {formatCurrency(level.burdened_cost)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {level.categories.length > 0 && (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border-ops-subtle text-text-ops-muted">
                            <th className="text-left py-2 px-4 font-medium">Category</th>
                            <th className="text-right py-2 px-4 font-medium">Direct Cost</th>
                            <th className="text-right py-2 px-4 font-medium">Burdened Cost</th>
                            <th className="text-right py-2 px-4 font-medium">Burden</th>
                          </tr>
                        </thead>
                        <tbody>
                          {level.categories.map((cat) => (
                            <tr
                              key={cat.category}
                              className="border-b border-border-ops-subtle hover:bg-bg-ops-overlay transition-colors"
                            >
                              <td className="py-2 px-4 text-text-ops-primary">
                                {cat.category}
                              </td>
                              <td className="py-2 px-4 text-right font-mono text-text-ops-primary">
                                {formatCurrency(cat.direct_cost)}
                              </td>
                              <td className="py-2 px-4 text-right font-mono text-emerald-400">
                                {formatCurrency(cat.burdened_cost)}
                              </td>
                              <td className="py-2 px-4 text-right font-mono text-amber-400">
                                {formatCurrency(cat.burden_amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-text-ops-muted">
                {projectId
                  ? 'No CBS rollup data available for this project.'
                  : 'Select a project to view CBS rollup.'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Create Cost Element Form
// ---------------------------------------------------------------------------

interface CreateCostElementFormProps {
  onSubmit: (element: Omit<CostElement, 'id'>) => void;
  onCancel: () => void;
}

const CreateCostElementForm: React.FC<CreateCostElementFormProps> = ({ onSubmit, onCancel }) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('LABOR_DIRECT');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name) return;
    onSubmit({ code, name, category });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 p-4 bg-bg-ops-surface rounded-lg border border-blue-500/30"
    >
      <h3 className="text-sm font-medium text-text-ops-primary mb-3">
        New Cost Element
      </h3>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Code</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. LABOR_DIRECT"
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Direct Labour"
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
          >
            <option value="LABOR_DIRECT">Direct Labour</option>
            <option value="SUBCONTRACT">Subcontract</option>
            <option value="MATERIAL_RAW">Raw Material</option>
            <option value="MATERIAL_COTS">COTS Material</option>
            <option value="ODC_TRAVEL">ODC — Travel</option>
            <option value="ODC_SUBSISTENCE">ODC — Subsistence</option>
            <option value="ODC_OTHER">ODC — Other</option>
            <option value="EQUIPMENT">Equipment</option>
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
        >
          Create
        </button>
      </div>
    </form>
  );
};

// ---------------------------------------------------------------------------
// Create Indirect Rate Form
// ---------------------------------------------------------------------------

interface CreateIndirectRateFormProps {
  onSubmit: (rate: Omit<IndirectRate, 'id'>) => void;
  onCancel: () => void;
}

const CreateIndirectRateForm: React.FC<CreateIndirectRateFormProps> = ({ onSubmit, onCancel }) => {
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [currencyCode, setCurrencyCode] = useState('GBP');
  const [fringeRate, setFringeRate] = useState(25.0);
  const [overheadRate, setOverheadRate] = useState(15.0);
  const [gaRate, setGaRate] = useState(10.0);
  const [feeProfit, setFeeProfit] = useState(5.0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      fiscal_year: fiscalYear,
      currency_code: currencyCode,
      fringe_rate_percent: fringeRate,
      overhead_rate_percent: overheadRate,
      ga_rate_percent: gaRate,
      fee_profit_percent: feeProfit,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 p-4 bg-bg-ops-surface rounded-lg border border-blue-500/30"
    >
      <h3 className="text-sm font-medium text-text-ops-primary mb-3">
        New FPRA Rate Structure
      </h3>
      <div className="grid grid-cols-4 gap-3 mb-3">
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Fiscal Year</label>
          <input
            type="number"
            value={fiscalYear}
            onChange={(e) => setFiscalYear(Number(e.target.value))}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Currency</label>
          <select
            value={currencyCode}
            onChange={(e) => setCurrencyCode(e.target.value)}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
          >
            <option value="GBP">GBP (£)</option>
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Fringe Rate %</label>
          <input
            type="number"
            step="0.01"
            value={fringeRate}
            onChange={(e) => setFringeRate(Number(e.target.value))}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
          />
        </div>
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Overhead Rate %</label>
          <input
            type="number"
            step="0.01"
            value={overheadRate}
            onChange={(e) => setOverheadRate(Number(e.target.value))}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
          />
        </div>
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">G&amp;A Rate %</label>
          <input
            type="number"
            step="0.01"
            value={gaRate}
            onChange={(e) => setGaRate(Number(e.target.value))}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
          />
        </div>
        <div>
          <label className="block text-xs text-text-ops-muted mb-1">Fee / Profit %</label>
          <input
            type="number"
            step="0.01"
            value={feeProfit}
            onChange={(e) => setFeeProfit(Number(e.target.value))}
            className="w-full bg-bg-ops-overlay border border-border-ops-strong rounded px-3 py-1.5 text-sm text-text-ops-primary"
          />
        </div>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-text-ops-muted hover:text-text-ops-primary transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
        >
          Create
        </button>
      </div>
    </form>
  );
};

export default CostingView;
