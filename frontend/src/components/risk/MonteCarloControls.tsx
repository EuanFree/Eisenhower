/**
 * Monte Carlo Simulation Controls
 *
 * Control panel for configuring and triggering the Monte Carlo Schedule
 * Risk Analysis (SRA) simulation.  Users select the number of iterations,
 * choose a distribution type, and press the run button to start the
 * simulation.
 *
 * Features
 * --------
 * 1. **Iteration Selector** — Radio pill buttons for 1,000 / 2,000 / 5,000 /
 *    10,000 iterations.  Higher iteration counts produce smoother curves but
 *    take longer to compute.
 *
 * 2. **Distribution Type Toggle** — Switch between Beta-PERT (default,
 *    smoother weighting toward the most-likely estimate) and Triangular
 *    (uniform weighting between optimistic and pessimistic bounds).
 *
 * 3. **Run Button** — Triggers the simulation via POST /api/v1/schedule/{id}/monte-carlo.
 *    Disabled while a simulation is running.
 *
 * 4. **Progress Bar** — Animated horizontal progress bar shown during
 *    simulation execution.
 *
 * 5. **Error Display** — Red alert box if the simulation fails.
 *
 * 6. **Result Summary** — Quick-glance P50 / P80 / P90 dates displayed
 *    after a successful run.
 */

import React from 'react';
import { clsx } from 'clsx';
import {
  Play,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
} from 'lucide-react';
import type { IterationCount, DistributionType, SimulationState } from '../../types/risk';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MonteCarloControlsProps {
  /** Current simulation state */
  state: SimulationState;
  /** Project ID for the simulation endpoint */
  projectId: string;
  /** Callback when settings change */
  onIterationsChange: (iterations: IterationCount) => void;
  onDistributionChange: (distribution: DistributionType) => void;
  /** Callback when simulation is triggered */
  onRun: () => void;
  /** Callback to reset simulation state */
  onReset: () => void;
}

// ---------------------------------------------------------------------------
// Iteration Options
// ---------------------------------------------------------------------------

const ITERATION_OPTIONS: { value: IterationCount; label: string; description: string }[] = [
  { value: 1000, label: '1,000', description: 'Quick' },
  { value: 2000, label: '2,000', description: 'Standard' },
  { value: 5000, label: '5,000', description: 'Detailed' },
  { value: 10000, label: '10,000', description: 'High precision' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MonteCarloControls: React.FC<MonteCarloControlsProps> = ({
  state,
  projectId,
  onIterationsChange,
  onDistributionChange,
  onRun,
  onReset,
}) => {
  return (
    <div className="flex flex-col gap-4 p-4 bg-bg-ops-surface border border-border-ops-subtle rounded-lg">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-blue-400" />
        <h3 className="text-sm font-semibold text-text-ops-primary">
          Monte Carlo Simulation
        </h3>
      </div>

      {/* Iteration Selector */}
      <div>
        <label className="block text-xs font-medium text-text-ops-muted uppercase tracking-wider mb-2">
          Iterations
        </label>
        <div className="flex items-center gap-2">
          {ITERATION_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onIterationsChange(option.value)}
              disabled={state.isRunning}
              className={clsx(
                'flex flex-col items-center gap-0.5 px-4 py-2 rounded-md border text-sm font-mono transition-colors',
                state.iterations === option.value
                  ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                  : 'bg-bg-ops-overlay border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong',
                state.isRunning && 'opacity-50 cursor-not-allowed',
              )}
              title={option.description}
            >
              <span className="font-semibold">{option.label}</span>
              <span className="text-[10px] text-text-ops-muted">{option.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Distribution Type Toggle */}
      <div>
        <label className="block text-xs font-medium text-text-ops-muted uppercase tracking-wider mb-2">
          Distribution Type
        </label>
        <div className="flex items-center gap-2">
          {(['BETA_PERT', 'TRIANGULAR'] as DistributionType[]).map((dist) => (
            <button
              key={dist}
              type="button"
              onClick={() => onDistributionChange(dist)}
              disabled={state.isRunning}
              className={clsx(
                'flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors',
                state.distributionType === dist
                  ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                  : 'bg-bg-ops-overlay border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong',
                state.isRunning && 'opacity-50 cursor-not-allowed',
              )}
            >
              {dist === 'BETA_PERT' ? 'Beta-PERT' : 'Triangular'}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-text-ops-muted">
          {state.distributionType === 'BETA_PERT'
            ? 'Beta-PERT weights toward the most-likely estimate, producing a smoother distribution.'
            : 'Triangular distribution applies uniform weighting between optimistic and pessimistic bounds.'}
        </p>
      </div>

      {/* Run Button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onRun}
          disabled={state.isRunning}
          className={clsx(
            'flex items-center gap-2 px-6 py-2.5 rounded-md font-medium text-sm transition-colors',
            state.isRunning
              ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 text-white',
          )}
        >
          {state.isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Running Simulation...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Run Monte Carlo Simulation
            </>
          )}
        </button>

        {state.isRunning && (
          <span className="text-xs text-text-ops-muted">
            {state.progress}% complete
          </span>
        )}
      </div>

      {/* Progress Bar */}
      {state.isRunning && (
        <div className="w-full h-2 bg-bg-ops-overlay rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${state.progress}%` }}
            role="progressbar"
            aria-valuenow={state.progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}

      {/* Error Display */}
      {state.error && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-400">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Simulation Failed</p>
            <p className="text-xs text-red-300/80 mt-1">{state.error}</p>
            <button
              type="button"
              onClick={onReset}
              className="mt-2 text-xs underline hover:text-red-300"
            >
              Reset and try again
            </button>
          </div>
        </div>
      )}

      {/* Result Summary */}
      {state.result && !state.isRunning && (
        <div className="p-3 rounded-md bg-green-500/10 border border-green-500/30">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-sm font-medium text-green-400">
              Simulation Complete
            </span>
            <span className="text-xs text-text-ops-muted ml-auto">
              {state.result.iterations.toLocaleString()} iterations
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <span className="text-[10px] text-text-ops-muted uppercase tracking-wider">P50 (Median)</span>
              <p className="text-sm font-mono text-text-ops-primary">
                {state.result.percentiles.P50 || 'N/A'}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-text-ops-muted uppercase tracking-wider">P80 (Defence Baseline)</span>
              <p className="text-sm font-mono text-amber-400">
                {state.result.percentiles.P80 || 'N/A'}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-text-ops-muted uppercase tracking-wider">P90 (Guarantee)</span>
              <p className="text-sm font-mono text-red-400">
                {state.result.percentiles.P90 || 'N/A'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MonteCarloControls;
