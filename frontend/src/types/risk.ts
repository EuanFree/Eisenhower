/**
 * Schedule Risk Analysis Type Definitions
 *
 * TypeScript interfaces mirroring the backend Monte Carlo SRA schemas
 * and the Risk Matrix domain model.
 *
 * These types are used by the ScheduleRiskView and its child components
 * to type-safe the API responses, simulation controls, and risk matrix
 * interactions.
 */

// ---------------------------------------------------------------------------
// Monte Carlo Simulation Types
// ---------------------------------------------------------------------------

/** Distribution type for three-point duration estimates */
export type DistributionType = 'BETA_PERT' | 'TRIANGULAR';

/** Number of simulation iterations to run */
export type IterationCount = 1000 | 2000 | 5000 | 10000;

/** Request payload for triggering a Monte Carlo simulation */
export interface MonteCarloRequest {
  /** Number of iterations (100–50000) */
  iterations: number;
  /** Optional random seed for reproducible results */
  seed?: number | null;
}

/** A single activity's criticality index from the simulation */
export interface CriticalityIndex {
  /** Portfolio node UUID */
  node_id: string;
  /** WBS code (e.g., 'WP-101') */
  code: string;
  /** Human-readable activity name */
  name: string;
  /** Fraction of iterations (0.0–1.0) where this activity was on the critical path */
  criticality_index: number;
}

/** A single point on the cumulative distribution curve */
export interface DistributionPoint {
  /** Percentile value (e.g., 50.0 for P50) */
  percentile: number;
  /** ISO-formatted date at this percentile */
  date: string;
}

/** Project duration statistics from the simulation */
export interface ProjectDurationStats {
  /** Earliest project finish date across all iterations (ISO string) */
  min_finish: string;
  /** Latest project finish date across all iterations (ISO string) */
  max_finish: string;
  /** Mean of finish date ordinals */
  mean_finish_ordinal: number;
  /** Standard deviation of finish date ordinals */
  std_finish_ordinal: number;
}

/** Complete Monte Carlo SRA simulation result */
export interface MonteCarloResult {
  /** Root portfolio node UUID */
  project_id: string;
  /** Number of iterations actually run */
  iterations: number;
  /** Random seed used (if provided) */
  seed: number | null;
  /** Percentile completion dates: { P50, P80, P90 } as ISO date strings */
  percentiles: Record<string, string>;
  /** Per-activity criticality indices, sorted descending */
  criticality_indices: CriticalityIndex[];
  /** Subsampled distribution points for UI curve plotting (~50 points) */
  distribution_points: DistributionPoint[];
  /** Summary statistics of project finish dates */
  project_duration_stats: ProjectDurationStats;
  /** ISO timestamp of when the simulation completed */
  calculated_at: string;
}

// ---------------------------------------------------------------------------
// Risk Matrix Types
// ---------------------------------------------------------------------------

/** Likelihood rating (1–5) */
export type LikelihoodRating = 1 | 2 | 3 | 4 | 5;

/** Consequence rating (1–5) */
export type ConsequenceRating = 1 | 2 | 3 | 4 | 5;

/** A cell in the 5×5 risk matrix */
export interface RiskMatrixCell {
  /** Likelihood rating (1–5) */
  likelihood: LikelihoodRating;
  /** Consequence rating (1–5) */
  consequence: ConsequenceRating;
  /** Risk score (likelihood × consequence) */
  score: number;
  /** Risk zone color category */
  zone: 'low' | 'medium' | 'high' | 'extreme';
}

/** Project risk item linked to a WBS task */
export interface ProjectRiskItem {
  /** Unique identifier */
  id: string;
  /** Associated portfolio node ID (nullable) */
  portfolio_node_id: string | null;
  /** Risk title */
  title: string;
  /** Risk description */
  description: string;
  /** Likelihood rating (1–5) */
  likelihood: LikelihoodRating;
  /** Consequence rating (1–5) */
  consequence: ConsequenceRating;
  /** Risk score (likelihood × consequence) */
  score: number;
  /** Risk status */
  status: 'OPEN' | 'MITIGATING' | 'CLOSED' | 'ACCEPTED';
  /** Mitigation strategy (nullable) */
  mitigation: string | null;
  /** Owner user ID (nullable) */
  owner_user_id: string | null;
  /** Created timestamp */
  created_at: string;
  /** Last modified timestamp */
  updated_at: string;
}

/** Risk matrix filter state */
export interface RiskMatrixFilters {
  /** Filter by likelihood (null = all) */
  likelihood: LikelihoodRating | null;
  /** Filter by consequence (null = all) */
  consequence: ConsequenceRating | null;
  /** Filter by risk status (null = all) */
  status: 'OPEN' | 'MITIGATING' | 'CLOSED' | 'ACCEPTED' | null;
}

// ---------------------------------------------------------------------------
// Simulation Control State
// ---------------------------------------------------------------------------

/** State of the Monte Carlo simulation controls */
export interface SimulationState {
  /** Selected iteration count */
  iterations: IterationCount;
  /** Selected distribution type */
  distributionType: DistributionType;
  /** Whether a simulation is currently running */
  isRunning: boolean;
  /** Progress percentage (0–100) */
  progress: number;
  /** Simulation result (null if not yet run) */
  result: MonteCarloResult | null;
  /** Error message (null if no error) */
  error: string | null;
}
