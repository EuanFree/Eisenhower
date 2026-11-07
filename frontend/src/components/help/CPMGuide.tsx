/**
 * CPM Scheduling Guide
 *
 * Offline-accessible technical guide explaining the Critical Path Method
 * (CPM) scheduling engine used by the Eisenhower Portfolio Manager.
 *
 * Covers:
 *
 * - Forward and backward pass calculations (ES, EF, LS, LF)
 * - Total Float and Free Float absorption rules
 * - All four PDM dependency types (FS, SS, FF, SF) with lag/lead days
 * - DCMA 14-Point compliance checks
 * - Critical path identification and float consumption
 *
 * All content is self-contained — no external dependencies.
 */

import React from 'react';
import { clsx } from 'clsx';
import {
  GitBranch,
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  Clock,
  Calculator,
} from 'lucide-react';

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
  formula: string;
  description: string;
  example?: string;
}

const FormulaCard: React.FC<FormulaCardProps> = ({ formula, description, example }) => (
  <div className="bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4">
    <div className="font-mono text-sm text-text-ops-primary bg-bg-ops-base px-3 py-2 rounded mb-2">
      {formula}
    </div>
    <p className="text-sm text-text-ops-muted">{description}</p>
    {example && (
      <p className="text-xs text-text-ops-muted mt-2 italic">Example: {example}</p>
    )}
  </div>
);

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
// CPM Guide Component
// ---------------------------------------------------------------------------

/**
 * CPM Scheduling Guide component.
 *
 * Renders embedded technical documentation covering CPM forward/backward
 * pass calculations, float absorption rules, PDM dependency types, and
 * DCMA 14-Point compliance checks.
 */
const CPMGuide: React.FC = () => {
  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-8 pb-6 border-b border-border-ops-subtle">
        <h1 className="text-2xl font-bold text-text-ops-primary mb-2">
          Critical Path Method (CPM) Scheduling Guide
        </h1>
        <p className="text-text-ops-muted">
          Reference documentation for the CPM engine, covering forward and backward pass
          calculations, float absorption rules, dependency types, and DCMA 14-Point compliance.
        </p>
      </div>

      {/* Section 1: Overview */}
      <Section title="Overview" icon={<GitBranch className="w-5 h-5" />}>
        <p>
          The Critical Path Method (CPM) is a deterministic scheduling algorithm that
          calculates the earliest and latest possible start and finish dates for every
          activity in a project network. It identifies the <strong>critical path</strong> —
          the sequence of activities with zero or negative total float — which determines
          the minimum project duration.
        </p>
        <p>
          In the Eisenhower Portfolio Manager, CPM operates on the Work Breakdown Structure
          (WBS) stored as a unified tree in PostgreSQL using the <code>ltree</code> extension.
          Activities are connected via Precedence Diagramming Method (PDM) dependency links,
          supporting all four relationship types: Finish-to-Start, Start-to-Start,
          Finish-to-Finish, and Start-to-Finish.
        </p>
        <InfoBox title="Key Concept" variant="info">
          The critical path is not static. As tasks progress, resources shift, or blockers
          emerge, the critical path can migrate to different activities. The system
          recalculates CPM on demand via{' '}
          <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">
            POST /api/v1/schedule/{'{project_id}'}/recalculate-cpm
          </code>.
        </InfoBox>
      </Section>

      {/* Section 2: Forward Pass */}
      <Section title="Forward Pass: Early Start & Early Finish" icon={<ArrowRight className="w-5 h-5" />}>
        <p>
          The forward pass traverses the activity network from the project start,
          calculating the earliest possible dates each activity can begin and complete.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormulaCard
            formula="ES = max(EF_predecessors + lag)"
            description="Early Start (ES) is the latest Early Finish of all predecessors, plus any lag days."
            example="If predecessor EF = Day 10 and lag = 2, then ES = Day 12"
          />
          <FormulaCard
            formula="EF = ES + duration"
            description="Early Finish (EF) is the Early Start plus the activity duration in working days."
            example="ES = Day 12, duration = 5 workdays → EF = Day 17"
          />
        </div>
        <p className="mt-4">
          The forward pass respects the working calendar configured for each activity,
          skipping weekends, statutory holidays, and planned maintenance shutdowns.
          Duration is measured in <strong>working days</strong>, not calendar days.
        </p>
      </Section>

      {/* Section 3: Backward Pass */}
      <Section title="Backward Pass: Late Start & Late Finish" icon={<ArrowRight className="w-5 h-5" />}>
        <p>
          The backward pass traverses the network in reverse topological order, from the
          project finish back to the start, calculating the latest dates each activity
          can begin and complete without delaying the project.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormulaCard
            formula="LF = min(LS_successors - lag)"
            description="Late Finish (LF) is the earliest Late Start of all successors, minus any lag days."
            example="If successor LS = Day 20 and lag = 1, then LF = Day 19"
          />
          <FormulaCard
            formula="LS = LF - duration"
            description="Late Start (LS) is the Late Finish minus the activity duration."
            example="LF = Day 19, duration = 5 → LS = Day 14"
          />
        </div>
      </Section>

      {/* Section 4: Float Calculations */}
      <Section title="Float Calculations" icon={<Clock className="w-5 h-5" />}>
        <p>
          Float (or slack) represents the amount of time an activity can be delayed
          without affecting downstream constraints. There are two types of float:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormulaCard
            formula="Total Float = LS - ES"
            description="Total Float (TF) is the amount of time an activity can be delayed without delaying the project finish date."
            example="LS = Day 14, ES = Day 12 → TF = 2 days"
          />
          <FormulaCard
            formula="Free Float = min(ES_successors) - EF"
            description="Free Float (FF) is the amount of time an activity can be delayed without delaying any successor's Early Start."
            example="Successor ES = Day 15, EF = Day 13 → FF = 2 days"
          />
        </div>
        <InfoBox title="Critical Path Identification" variant="warning">
          An activity is on the <strong>critical path</strong> when its Total Float is
          zero or negative (TF ≤ 0). These activities have no scheduling flexibility —
          any delay directly impacts the project finish date. In the Gantt chart,
          critical path tasks are highlighted with a bold red border (#F87171).
        </InfoBox>
      </Section>

      {/* Section 5: PDM Dependency Types */}
      <Section title="PDM Dependency Types" icon={<GitBranch className="w-5 h-5" />}>
        <p>
          The system supports all four Precedence Diagramming Method (PDM) dependency
          types, each with optional lag (positive) or lead (negative) days:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border-ops-subtle">
                <th className="text-left py-2 px-3 text-text-ops-primary font-semibold">Type</th>
                <th className="text-left py-2 px-3 text-text-ops-primary font-semibold">Relationship</th>
                <th className="text-left py-2 px-3 text-text-ops-primary font-semibold">Effect</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border-ops-subtle">
                <td className="py-2 px-3 font-mono text-text-ops-primary">FS</td>
                <td className="py-2 px-3 text-text-ops-muted">Finish-to-Start</td>
                <td className="py-2 px-3 text-text-ops-muted">
                  Successor cannot start until predecessor finishes
                </td>
              </tr>
              <tr className="border-b border-border-ops-subtle">
                <td className="py-2 px-3 font-mono text-text-ops-primary">SS</td>
                <td className="py-2 px-3 text-text-ops-muted">Start-to-Start</td>
                <td className="py-2 px-3 text-text-ops-muted">
                  Successor cannot start until predecessor starts
                </td>
              </tr>
              <tr className="border-b border-border-ops-subtle">
                <td className="py-2 px-3 font-mono text-text-ops-primary">FF</td>
                <td className="py-2 px-3 text-text-ops-muted">Finish-to-Finish</td>
                <td className="py-2 px-3 text-text-ops-muted">
                  Successor cannot finish until predecessor finishes
                </td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-mono text-text-ops-primary">SF</td>
                <td className="py-2 px-3 text-text-ops-muted">Start-to-Finish</td>
                <td className="py-2 px-3 text-text-ops-muted">
                  Successor cannot finish until predecessor starts
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <InfoBox title="Lag & Lead Days" variant="info">
          <strong>Lag</strong> (positive value) adds a delay between predecessor and successor.
          <strong>Lead</strong> (negative value) allows the successor to start before the
          predecessor completes. For example, FS with lag = -2 means the successor can
          start 2 working days before the predecessor finishes.
        </InfoBox>
      </Section>

      {/* Section 6: Float Absorption Rules */}
      <Section title="Float Absorption Rules" icon={<Calculator className="w-5 h-5" />}>
        <p>
          Float is a shared resource across the project network. When a non-critical
          activity consumes its float, it may reduce the available float for other
          activities on parallel paths. The system enforces the following rules:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>
            <strong>Critical path tasks are fixed first.</strong> During resource leveling,
            activities with zero or negative Total Float remain at their scheduled dates.
          </li>
          <li>
            <strong>Non-critical tasks are delayed within their float window.</strong> The
            Burgess-Killebrew heuristic delays activities with positive Free Float before
            touching critical path items.
          </li>
          <li>
            <strong>Milestone breach detection.</strong> If delaying a non-critical task
            exceeds its available float and slips a contractual delivery milestone, the
            system flags a milestone breach warning.
          </li>
          <li>
            <strong>Float consumption is tracked.</strong> Each leveling proposal records
            the consumed float in days, allowing planners to see how much scheduling
            flexibility remains.
          </li>
        </ul>
      </Section>

      {/* Section 7: DCMA 14-Point */}
      <Section title="DCMA 14-Point Compliance" icon={<CheckCircle className="w-5 h-5" />}>
        <p>
          The Defense Contract Management Agency (DCMA) 14-Point assessment is a standard
          defence programme schedule integrity check. The system automatically flags the
          following conditions:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { point: 'Dangling Activities', desc: 'Tasks with no predecessor or successor links' },
            { point: 'Invalid Leads/Lags', desc: 'Unusually large lead or lag values that may mask logic errors' },
            { point: 'Negative Float', desc: 'Activities where EF > LF, indicating schedule infeasibility' },
            { point: 'Duration Mismatches', desc: 'Activities where estimated duration differs significantly from actual' },
            { point: 'Over-Constrained Schedules', desc: 'Too many hard constraints (must-start/must-finish) limiting flexibility' },
            { point: 'Missing Baselines', desc: 'Projects without a frozen Performance Measurement Baseline' },
          ].map((item) => (
            <div key={item.point} className="flex items-start gap-3 bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-sm font-medium text-text-ops-primary">{item.point}</div>
                <div className="text-xs text-text-ops-muted">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <InfoBox title="Running DCMA Checks" variant="success">
          DCMA 14-Point checks are executed automatically when you run a CPM recalculation.
          The results are included in the CPM response under the <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">dcma_flags</code> field.
          You can also trigger a standalone sweep via{' '}
          <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">
            POST /api/v1/schedule/clashes/sweep/{'{project_id}'}
          </code>.
        </InfoBox>
      </Section>

      {/* Section 8: Working Calendar */}
      <Section title="Working Calendar Integration" icon={<Clock className="w-5 h-5" />}>
        <p>
          CPM calculations respect the working calendar assigned to each activity. The
          calendar resolution priority is:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>
            <strong>Node-level calendar</strong> — If the activity has a <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">calendar_id</code>, use it directly.
          </li>
          <li>
            <strong>Project root calendar</strong> — If the node has no calendar, inherit from the project root.
          </li>
          <li>
            <strong>Default system calendar</strong> — Fall back to the system default calendar (marked <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">is_default=True</code>).
          </li>
          <li>
            <strong>Naive Mon–Fri fallback</strong> — If no calendar is configured, assume Monday–Friday working days.
          </li>
        </ol>
        <p className="mt-4">
          Calendar exceptions (statutory holidays, planned maintenance, overtime surge)
          are treated as non-working days when their <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">working_hours_override</code> is 0.00.
        </p>
      </Section>
    </div>
  );
};

export default CPMGuide;
