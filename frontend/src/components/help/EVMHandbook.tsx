/**
 * EVM Handbook
 *
 * Offline-accessible technical guide explaining Earned Value Management
 * (EVM) techniques per ANSI/EIA-748 standards.
 *
 * Covers:
 *
 * - Core EVM metrics: PV, EV, AC
 * - Variance calculations: CV, SV, VAC
 * - Performance indices: CPI, SPI
 * - Forecasting: EAC, ETC
 * - Milestone weighting rules
 * - EVM technique types (Percent Complete, 0/100, 50/50, Milestone Weights, LOE)
 *
 * All content is self-contained — no external dependencies.
 */

import React from 'react';
import {
  Calculator,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Target,
  BarChart3,
} from 'lucide-react';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Section Component
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, icon, children }) => (
  <section className="mb-10">
    <h2 className="flex items-center gap-2 text-xl font-semibold text-text-ops-primary mb-4">
      {icon}
      {title}
    </h2>
    <div className="space-y-4 text-text-ops-muted leading-relaxed">
      {children}
    </div>
  </section>
);

// ---------------------------------------------------------------------------
// Formula Card Component
// ---------------------------------------------------------------------------

interface FormulaCardProps {
  metric: string;
  formula: string;
  description: string;
  interpretation?: string;
  variant?: 'neutral' | 'good' | 'bad';
}

const FormulaCard: React.FC<FormulaCardProps> = ({
  metric,
  formula,
  description,
  interpretation,
  variant = 'neutral',
}) => {
  const borderColors = {
    neutral: 'border-border-ops-subtle',
    good: 'border-green-500/30',
    bad: 'border-red-500/30',
  };

  return (
    <div className={clsx('border rounded-lg p-4', borderColors[variant])}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-ops-muted">
          {metric}
        </span>
      </div>
      <div className="font-mono text-sm text-text-ops-primary bg-bg-ops-base px-3 py-2 rounded mb-2">
        {formula}
      </div>
      <p className="text-sm text-text-ops-muted">{description}</p>
      {interpretation && (
        <p className="text-xs text-text-ops-muted mt-2 italic">{interpretation}</p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Info Box Component
// ---------------------------------------------------------------------------

interface InfoBoxProps {
  title: string;
  variant?: 'info' | 'warning' | 'success';
  children: React.ReactNode;
}

const InfoBox: React.FC<InfoBoxProps> = ({ title, variant = 'info', children }) => {
  const colors = {
    info: 'border-sky-500/30 bg-sky-500/5',
    warning: 'border-amber-500/30 bg-amber-500/5',
    success: 'border-green-500/30 bg-green-500/5',
  };

  return (
    <div className={clsx('border rounded-lg p-4', colors[variant])}>
      <h4 className="text-sm font-semibold text-text-ops-primary mb-2">{title}</h4>
      <div className="text-sm text-text-ops-muted">{children}</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// EVM Handbook Component
// ---------------------------------------------------------------------------

/**
 * EVM Handbook component.
 *
 * Renders embedded technical documentation covering all ANSI/EIA-748
 * Earned Value Management formulas, techniques, and interpretation rules.
 */
const EVMHandbook: React.FC = () => {
  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-8 pb-6 border-b border-border-ops-subtle">
        <h1 className="text-2xl font-bold text-text-ops-primary mb-2">
          Earned Value Management (EVM) Handbook
        </h1>
        <p className="text-text-ops-muted">
          Formula reference cards for ANSI/EIA-748 compliant Earned Value Management,
          covering core metrics, variance analysis, performance indices, and forecasting.
        </p>
      </div>

      {/* Section 1: Overview */}
      <Section title="Overview" icon={<BarChart3 className="w-5 h-5" />}>
        <p>
          Earned Value Management (EVM) is a project management technique that integrates
          scope, schedule, and cost to objectively measure project performance. It compares
          three fundamental values at any point in time:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormulaCard
            metric="PV"
            formula="BCWS — Budgeted Cost for Work Scheduled"
            description="The planned value of work that should have been completed by the status date."
            interpretation="Also called Planned Value. Represents the time-phased budget."
          />
          <FormulaCard
            metric="EV"
            formula="BCWP — Budgeted Cost for Work Performed"
            description="The earned value of work actually completed, measured against the budget."
            interpretation="Also called Earned Value. The objective measure of physical progress."
          />
          <FormulaCard
            metric="AC"
            formula="ACWP — Actual Cost of Work Performed"
            description="The actual cost incurred to complete the work performed."
            interpretation="Also called Actual Cost. Represents real expenditure."
          />
        </div>
        <InfoBox title="ANSI/EIA-748 Compliance" variant="info">
          The Eisenhower Portfolio Manager implements five EVM techniques per ANSI/EIA-748:
          Percent Complete, 0/100 Rule, 50/50 Rule, Milestone Weights, and Level of Effort.
          Each technique determines how Earned Value (EV) is calculated for a given task.
        </InfoBox>
      </Section>

      {/* Section 2: Variance Calculations */}
      <Section title="Variance Calculations" icon={<TrendingDown className="w-5 h-5" />}>
        <p>
          Variances measure the difference between planned and actual performance.
          Negative variances indicate the project is over budget or behind schedule.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormulaCard
            metric="CV"
            formula="CV = EV - AC"
            description="Cost Variance: Difference between earned value and actual cost."
            interpretation="CV &gt; 0 means under budget. CV &lt; 0 means over budget."
            variant="bad"
          />
          <FormulaCard
            metric="SV"
            formula="SV = EV - PV"
            description="Schedule Variance: Difference between earned value and planned value."
            interpretation="SV &gt; 0 means ahead of schedule. SV &lt; 0 means behind schedule."
            variant="bad"
          />
          <FormulaCard
            metric="VAC"
            formula="VAC = BAC - EAC"
            description="Variance at Completion: Difference between Budget at Completion and Estimate at Completion."
            interpretation="VAC &gt; 0 means projected to finish under budget."
            variant="neutral"
          />
        </div>
      </Section>

      {/* Section 3: Performance Indices */}
      <Section title="Performance Indices" icon={<TrendingUp className="w-5 h-5" />}>
        <p>
          Performance indices are ratio-based measures of efficiency. A value of 1.0
          indicates exactly on plan; values above 1.0 are favorable; below 1.0 are unfavorable.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormulaCard
            metric="CPI"
            formula="CPI = EV / AC"
            description="Cost Performance Index: Ratio of earned value to actual cost."
            interpretation="CPI = 1.0 is on budget. CPI = 0.85 means £0.85 earned per £1.00 spent."
            variant="good"
          />
          <FormulaCard
            metric="SPI"
            formula="SPI = EV / PV"
            description="Schedule Performance Index: Ratio of earned value to planned value."
            interpretation="SPI = 1.0 is on schedule. SPI = 0.90 means 90% of planned work completed."
            variant="good"
          />
        </div>
        <InfoBox title="Index Interpretation" variant="warning">
          <strong>CPI &lt; 1.0</strong> — The project is over budget. For every £1.00 spent,
          less than £1.00 of work has been earned.
          <br />
          <strong>SPI &lt; 1.0</strong> — The project is behind schedule. Less work has been
          completed than planned for the elapsed time.
          <br />
          Defence programmes typically require CPI ≥ 0.95 and SPI ≥ 0.90 for green status.
        </InfoBox>
      </Section>

      {/* Section 4: Forecasting */}
      <Section title="Forecasting" icon={<Target className="w-5 h-5" />}>
        <p>
          Forecasting uses current performance to predict future project outcomes.
          The most common forecasts are Estimate at Completion (EAC) and Estimate to Complete (ETC).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormulaCard
            metric="EAC"
            formula="EAC = BAC / CPI"
            description="Estimate at Completion: Total projected cost based on current CPI."
            interpretation="If BAC = £1,000,000 and CPI = 0.85, EAC = £1,176,471."
            variant="neutral"
          />
          <FormulaCard
            metric="ETC"
            formula="ETC = EAC - AC"
            description="Estimate to Complete: Remaining cost to finish the project."
            interpretation="ETC = EAC minus actual cost already incurred."
            variant="neutral"
          />
        </div>
      </Section>

      {/* Section 5: EVM Techniques */}
      <Section title="EVM Calculation Techniques" icon={<Calculator className="w-5 h-5" />}>
        <p>
          The system supports five EVM techniques for calculating Earned Value (EV).
          The technique is configured per task in the <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">evm_technique</code> field.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border-ops-subtle">
                <th className="text-left py-2 px-3 text-text-ops-primary font-semibold">Technique</th>
                <th className="text-left py-2 px-3 text-text-ops-primary font-semibold">EV Formula</th>
                <th className="text-left py-2 px-3 text-text-ops-primary font-semibold">Use Case</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border-ops-subtle">
                <td className="py-2 px-3 font-mono text-text-ops-primary">PERCENT_COMPLETE</td>
                <td className="py-2 px-3 font-mono text-text-ops-primary">EV = BAC × (percent_complete / 100)</td>
                <td className="py-2 px-3 text-text-ops-muted">General tasks with subjective progress estimates</td>
              </tr>
              <tr className="border-b border-border-ops-subtle">
                <td className="py-2 px-3 font-mono text-text-ops-primary">ZERO_100</td>
                <td className="py-2 px-3 font-mono text-text-ops-primary">EV = BAC if complete, else 0</td>
                <td className="py-2 px-3 text-text-ops-muted">Deliverables with all-or-nothing completion</td>
              </tr>
              <tr className="border-b border-border-ops-subtle">
                <td className="py-2 px-3 font-mono text-text-ops-primary">FIFTY_FIFTY</td>
                <td className="py-2 px-3 font-mono text-text-ops-primary">EV = 0.5×BAC if started, BAC if complete</td>
                <td className="py-2 px-3 text-text-ops-muted">Tasks where start represents half the effort</td>
              </tr>
              <tr className="border-b border-border-ops-subtle">
                <td className="py-2 px-3 font-mono text-text-ops-primary">MILESTONE_WEIGHTS</td>
                <td className="py-2 px-3 font-mono text-text-ops-primary">EV = BAC × Σ(verified step weights)</td>
                <td className="py-2 px-3 text-text-ops-muted">Tasks with defined milestone checkpoints</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-mono text-text-ops-primary">LEVEL_OF_EFFORT</td>
                <td className="py-2 px-3 font-mono text-text-ops-primary">EV = PV (enforces SV = 0)</td>
                <td className="py-2 px-3 text-text-ops-muted">Ongoing support activities (facilities, admin)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* Section 6: Milestone Weights */}
      <Section title="Milestone Weighting Rules" icon={<CheckCircle className="w-5 h-5" />}>
        <p>
          When using the Milestone Weights technique, Earned Value is calculated by
          summing the weights of verified milestone steps. The following rules apply:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>
            <strong>Weight sum must equal 1.000.</strong> All milestone weight fractions for a
            single task must sum to exactly 1.000 (± 0.001 tolerance).
          </li>
          <li>
            <strong>Verification sign-off required.</strong> Each milestone step must be
            explicitly verified as PASSED before its weight contributes to EV.
          </li>
          <li>
            <strong>WAIVED steps count.</strong> A milestone step can be waived with justification;
            waived steps contribute their weight to EV.
          </li>
          <li>
            <strong>Mandatory gate enforcement.</strong> If <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">requires_vv_signoff</code>{' '}
            is true, setting percent_complete to 100% is rejected unless all mandatory
            verification test cases are PASSED or WAIVED.
          </li>
        </ul>
        <InfoBox title="Example" variant="info">
          A task with BAC = £100,000 has three milestone steps: Design Review (0.300),
          Prototype Build (0.400), and Final Test (0.300). If Design Review and Prototype
          Build are verified, EV = £100,000 × (0.300 + 0.400) = £70,000.
        </InfoBox>
      </Section>

      {/* Section 7: S-Curve */}
      <Section title="S-Curve Analysis" icon={<TrendingUp className="w-5 h-5" />}>
        <p>
          The S-Curve is a time-phased chart plotting cumulative PV, EV, and AC over the
          project lifecycle. It provides an at-a-glance view of schedule and cost performance.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-sky-400 mb-1">PV Curve</div>
            <p className="text-sm text-text-ops-muted">
              The planned baseline — shows when work was scheduled to be completed.
            </p>
          </div>
          <div className="bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-green-400 mb-1">EV Curve</div>
            <p className="text-sm text-text-ops-muted">
              The earned value — shows actual work completed measured against budget.
            </p>
          </div>
          <div className="bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-1">AC Curve</div>
            <p className="text-sm text-text-ops-muted">
              The actual cost — shows real expenditure against the planned budget.
            </p>
          </div>
        </div>
        <p className="mt-4">
          When the EV curve falls below the PV curve, the project is behind schedule.
          When the AC curve rises above the EV curve, the project is over budget.
          The system generates S-Curve data via{' '}
          <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">
            GET /api/v1/evm/projects/{'{id}'}/s-curve-data
          </code>.
        </p>
      </Section>

      {/* Section 8: Variance Thresholds */}
      <Section title="Variance Thresholds & Reporting" icon={<AlertTriangle className="w-5 h-5" />}>
        <p>
          Defence programmes typically define variance thresholds that trigger mandatory
          reporting and corrective action. The system auto-extracts tasks exceeding
          these thresholds for IPMR Format 5 (Variance Analysis Narrative):
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-bg-ops-surface border border-red-500/30 rounded-lg p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-2">
              Cost Threshold
            </div>
            <p className="text-sm text-text-ops-muted">
              |CV| exceeds ±10% of BAC or ±£25,000 — triggers variance narrative with
              Problem, Root Cause, Impact, and Corrective Action sections.
            </p>
          </div>
          <div className="bg-bg-ops-surface border border-amber-500/30 rounded-lg p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-2">
              Schedule Threshold
            </div>
            <p className="text-sm text-text-ops-muted">
              |SV| exceeds ±10% of PV or critical path slip &gt; 5 days — triggers
              schedule impact analysis and recovery forecast.
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
};

export default EVMHandbook;
