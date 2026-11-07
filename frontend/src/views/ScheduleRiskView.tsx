/**
 * Schedule Risk Analysis View
 *
 * The main view for Monte Carlo Schedule Risk Analysis (SRA).  This view
 * provides a comprehensive interface for simulating schedule uncertainty,
 * visualising the cumulative probability distribution, identifying the
 * primary drivers of programme risk, and managing the risk register.
 *
 * Features
 * --------
 * 1. **Simulation Controls** — Configure and trigger Monte Carlo simulations
 *    with adjustable iteration counts and distribution types.
 *
 * 2. **Cumulative Probability Curve** — S-curve chart showing P50, P80,
 *    and P90 completion dates with the deterministic CPM finish date
 *    for comparison.
 *
 * 3. **Tornado Sensitivity Chart** — Horizontal bar chart ranking activities
 *    by Criticality Index to identify primary schedule risk drivers.
 *
 * 4. **Risk Matrix Grid** — Interactive 5×5 risk matrix for visualising
 *    the programme's risk landscape and filtering active risks.
 *
 * 5. **Tabbed Navigation** — Switch between Simulation, Sensitivity, and
 *    Risk Register views.
 *
 * Data sources:
 * - POST /api/v1/schedule/{project_id}/monte-carlo (simulation)
 * - GET /api/v1/schedule/{project_id}/recalculate-cpm (CPM finish date)
 */

import React, { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import {
  BarChart3,
  TrendingUp,
  Shield,
  Loader2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import api from '../services/api';
import MonteCarloControls from '../components/risk/MonteCarloControls';
import CumulativeProbabilityCurve from '../components/risk/CumulativeProbabilityCurve';
import TornadoSensitivityChart from '../components/risk/TornadoSensitivityChart';
import RiskMatrixGrid from '../components/risk/RiskMatrixGrid';
import type {
  SimulationState,
  IterationCount,
  DistributionType,
  MonteCarloResult,
  ProjectRiskItem,
  RiskMatrixFilters,
} from '../types/risk';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RiskViewTab = 'simulation' | 'sensitivity' | 'risk-register';

interface ScheduleRiskViewProps {
  /** Project ID for the simulation endpoint */
  projectId?: string;
}

// ---------------------------------------------------------------------------
// Initial simulation state
// ---------------------------------------------------------------------------

const initialSimulationState: SimulationState = {
  iterations: 2000,
  distributionType: 'BETA_PERT',
  isRunning: false,
  progress: 0,
  result: null,
  error: null,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ScheduleRiskView: React.FC<ScheduleRiskViewProps> = ({ projectId }) => {
  const [activeTab, setActiveTab] = useState<RiskViewTab>('simulation');
  const [simState, setSimState] = useState<SimulationState>(initialSimulationState);
  const [risks, setRisks] = useState<ProjectRiskItem[]>([]);
  const [cpmFinishDate, setCpmFinishDate] = useState<string | undefined>(undefined);
  const [loadingCpm, setLoadingCpm] = useState(false);

  // Fetch CPM data for deterministic finish date
  const fetchCpmData = useCallback(async () => {
    if (!projectId) return;
    setLoadingCpm(true);
    try {
      const response = await api.get(`/api/v1/schedule/${projectId}/recalculate-cpm`);
      if (response.data) {
        // Extract the latest finish date from CPM results
        const activities = response.data.activities || [];
        const latestFinish = activities.reduce(
          (max: string, a: any) => {
            const ef = a.early_finish || '';
            return ef > max ? ef : max;
          },
          '',
        );
        if (latestFinish) {
          setCpmFinishDate(latestFinish);
        }
      }
    } catch (err) {
      console.error('Failed to fetch CPM data:', err);
    } finally {
      setLoadingCpm(false);
    }
  }, [projectId]);

  // Run Monte Carlo simulation
  const runSimulation = useCallback(async () => {
    if (!projectId) return;

    setSimState((prev) => ({
      ...prev,
      isRunning: true,
      progress: 0,
      error: null,
    }));

    // Simulate progress updates
    const progressInterval = setInterval(() => {
      setSimState((prev) => ({
        ...prev,
        progress: Math.min(prev.progress + Math.random() * 15, 90),
      }));
    }, 500);

    try {
      const response = await api.post(`/api/v1/schedule/${projectId}/monte-carlo`, {
        iterations: simState.iterations,
      });

      clearInterval(progressInterval);

      const result: MonteCarloResult = response.data;
      setSimState((prev) => ({
        ...prev,
        isRunning: false,
        progress: 100,
        result,
        error: null,
      }));

      // Fetch CPM data if not already loaded
      if (!cpmFinishDate) {
        await fetchCpmData();
      }
    } catch (err: any) {
      clearInterval(progressInterval);
      const message = err.response?.data?.detail || 'Simulation failed. Please try again.';
      setSimState((prev) => ({
        ...prev,
        isRunning: false,
        progress: 0,
        error: message,
      }));
    }
  }, [projectId, simState.iterations, cpmFinishDate, fetchCpmData]);

  // Reset simulation state
  const resetSimulation = useCallback(() => {
    setSimState(initialSimulationState);
  }, []);

  // Handle iteration change
  const handleIterationsChange = useCallback((iterations: IterationCount) => {
    setSimState((prev) => ({ ...prev, iterations }));
  }, []);

  // Handle distribution change
  const handleDistributionChange = useCallback((distributionType: DistributionType) => {
    setSimState((prev) => ({ ...prev, distributionType }));
  }, []);

  // Handle risk matrix cell click
  const handleRiskCellClick = useCallback((filters: RiskMatrixFilters) => {
    console.log('Risk matrix filter:', filters);
    // In a real implementation, this would filter the risk list
  }, []);

  // Tab configuration
  const tabs: { id: RiskViewTab; label: string; icon: typeof BarChart3; description: string }[] = [
    {
      id: 'simulation',
      label: 'Simulation',
      icon: BarChart3,
      description: 'Run Monte Carlo simulation and view probability distribution',
    },
    {
      id: 'sensitivity',
      label: 'Sensitivity',
      icon: TrendingUp,
      description: 'Tornado chart showing criticality indices',
    },
    {
      id: 'risk-register',
      label: 'Risk Register',
      icon: Shield,
      description: '5×5 risk matrix and active risk items',
    },
  ];

  return (
    <div className="flex flex-col h-full bg-bg-ops-base">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-ops-subtle bg-bg-ops-surface">
        <div>
          <h2 className="text-lg font-semibold text-text-ops-primary">
            Schedule Risk Analysis
          </h2>
          <p className="text-sm text-text-ops-muted mt-1">
            Monte Carlo simulation, sensitivity analysis, and risk register
          </p>
        </div>
        {loadingCpm && (
          <div className="flex items-center gap-2 text-xs text-text-ops-muted">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading CPM data...
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 px-6 py-2 border-b border-border-ops-subtle bg-bg-ops-surface/50">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay border border-transparent',
              )}
              title={tab.description}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* No Project Warning */}
        {!projectId && (
          <div className="flex items-start gap-3 p-4 rounded-md bg-amber-500/10 border border-amber-500/30 mb-6">
            <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-400" />
            <div>
              <p className="text-sm font-medium text-amber-400">
                No Project Selected
              </p>
              <p className="text-xs text-amber-300/80 mt-1">
                Select a project from the schedule view to enable Monte Carlo simulation.
              </p>
            </div>
          </div>
        )}

        {/* Simulation Tab */}
        {activeTab === 'simulation' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Controls Panel */}
            <div className="xl:col-span-1">
              <MonteCarloControls
                state={simState}
                projectId={projectId || ''}
                onIterationsChange={handleIterationsChange}
                onDistributionChange={handleDistributionChange}
                onRun={runSimulation}
                onReset={resetSimulation}
              />
            </div>

            {/* S-Curve Chart */}
            <div className="xl:col-span-2">
              {simState.result ? (
                <CumulativeProbabilityCurve
                  result={simState.result}
                  cpmFinishDate={cpmFinishDate}
                />
              ) : simState.isRunning ? (
                <div className="flex flex-col items-center justify-center h-full py-24 text-text-ops-muted">
                  <Loader2 className="w-12 h-12 mb-4 animate-spin text-blue-400" />
                  <p className="text-sm font-medium">Running Monte Carlo Simulation...</p>
                  <p className="text-xs mt-1">{simState.progress.toFixed(0)}% complete</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-24 text-text-ops-muted">
                  <TrendingUp className="w-12 h-12 mb-4 text-text-ops-muted/50" />
                  <p className="text-sm font-medium text-center">
                    No simulation results yet
                  </p>
                  <p className="text-xs mt-1 text-center max-w-md">
                    Configure the simulation parameters and click "Run Monte Carlo Simulation"
                    to generate the cumulative probability distribution curve.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sensitivity Tab */}
        {activeTab === 'sensitivity' && (
          <div className="max-w-4xl">
            {simState.result ? (
              <TornadoSensitivityChart
                criticalityIndices={simState.result.criticality_indices}
                maxBars={20}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-text-ops-muted">
                <TrendingUp className="w-12 h-12 mb-4 text-text-ops-muted/50" />
                <p className="text-sm font-medium text-center">
                  Run a simulation first
                </p>
                <p className="text-xs mt-1 text-center max-w-md">
                  The Tornado Sensitivity Chart requires Monte Carlo simulation results.
                  Switch to the Simulation tab and run a simulation to generate criticality indices.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('simulation')}
                  className="mt-4 px-4 py-2 rounded-md text-sm font-medium text-blue-400 bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 transition-colors"
                >
                  Go to Simulation
                </button>
              </div>
            )}
          </div>
        )}

        {/* Risk Register Tab */}
        {activeTab === 'risk-register' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Risk Matrix */}
            <div>
              <RiskMatrixGrid
                risks={risks}
                onCellClick={handleRiskCellClick}
              />
            </div>

            {/* Risk Summary */}
            <div className="flex flex-col gap-4">
              {/* Info Panel */}
              <div className="p-4 rounded-md bg-bg-ops-surface border border-border-ops-subtle">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-4 h-4 text-blue-400" />
                  <h4 className="text-sm font-semibold text-text-ops-primary">
                    Risk Register Overview
                  </h4>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-ops-muted">Total Risks</span>
                    <span className="font-mono text-text-ops-primary">{risks.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-ops-muted">Open</span>
                    <span className="font-mono text-blue-400">
                      {risks.filter((r) => r.status === 'OPEN').length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-ops-muted">Mitigating</span>
                    <span className="font-mono text-amber-400">
                      {risks.filter((r) => r.status === 'MITIGATING').length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-ops-muted">Closed</span>
                    <span className="font-mono text-green-400">
                      {risks.filter((r) => r.status === 'CLOSED').length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-ops-muted">Accepted</span>
                    <span className="font-mono text-gray-400">
                      {risks.filter((r) => r.status === 'ACCEPTED').length}
                    </span>
                  </div>
                </div>
              </div>

              {/* High Risk Alert */}
              {risks.some((r) => r.score >= 15 && r.status === 'OPEN') && (
                <div className="p-4 rounded-md bg-red-500/10 border border-red-500/30">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-400" />
                    <div>
                      <p className="text-sm font-medium text-red-400">
                        Extreme Risks Detected
                      </p>
                      <p className="text-xs text-red-300/80 mt-1">
                        {risks.filter((r) => r.score >= 15 && r.status === 'OPEN').length}{' '}
                        open risk(s) with extreme scores (≥15) require immediate attention.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Empty State */}
              {risks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-text-ops-muted">
                  <Shield className="w-8 h-8 mb-3 text-text-ops-muted/50" />
                  <p className="text-sm text-center">
                    No risks loaded for this project.
                  </p>
                  <p className="text-xs mt-1 text-center max-w-xs">
                    Risk items will appear here when linked to WBS tasks in the project.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScheduleRiskView;
