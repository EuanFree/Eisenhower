/**
 * ABAC & Caveat Matrix Guide
 *
 * Offline-accessible technical guide explaining Attribute-Based Access Control
 * (ABAC) and classified data handling in the Eisenhower Portfolio Manager.
 *
 * Covers:
 *
 * - Security classification hierarchy (OFFICIAL → TOP SECRET)
 * - Caveat matching and subset checking
 * - Ghost-node hierarchy preservation
 * - Foreign disclosure interlocks (ITAR, EAR, UK Military List)
 * - Export control citizenship verification
 *
 * All content is self-contained — no external dependencies.
 */

import React from 'react';
import {
  Shield,
  Lock,
  Globe,
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
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
// Info Box Component
// ---------------------------------------------------------------------------

interface InfoBoxProps {
  title: string;
  variant?: 'info' | 'warning' | 'success' | 'danger';
  children: React.ReactNode;
}

const InfoBox: React.FC<InfoBoxProps> = ({ title, variant = 'info', children }) => {
  const colors = {
    info: 'border-sky-500/30 bg-sky-500/5',
    warning: 'border-amber-500/30 bg-amber-500/5',
    success: 'border-green-500/30 bg-green-500/5',
    danger: 'border-red-500/30 bg-red-500/5',
  };

  return (
    <div className={clsx('border rounded-lg p-4', colors[variant])}>
      <h4 className="text-sm font-semibold text-text-ops-primary mb-2">{title}</h4>
      <div className="text-sm text-text-ops-muted">{children}</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Classification Badge Component
// ---------------------------------------------------------------------------

interface ClassificationBadgeProps {
  level: string;
  color: string;
}

const ClassificationBadge: React.FC<ClassificationBadgeProps> = ({ level, color }) => (
  <span className={clsx('inline-block px-2 py-0.5 rounded text-xs font-mono font-bold', color)}>
    {level}
  </span>
);

// ---------------------------------------------------------------------------
// ABAC Matrix Guide Component
// ---------------------------------------------------------------------------

/**
 * ABAC & Caveat Matrix Guide component.
 *
 * Renders embedded technical documentation covering the security classification
 * hierarchy, caveat matching rules, ghost-node masking, and export control interlocks.
 */
const ABACMatrix: React.FC = () => {
  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-8 pb-6 border-b border-border-ops-subtle">
        <h1 className="text-2xl font-bold text-text-ops-primary mb-2">
          ABAC & Caveat Matrix Guide
        </h1>
        <p className="text-text-ops-muted">
          Understanding Attribute-Based Access Control, classification markings,
          caveat matching, and foreign disclosure interlocks.
        </p>
      </div>

      {/* Section 1: Overview */}
      <Section title="Overview" icon={<Shield className="w-5 h-5" />}>
        <p>
          Attribute-Based Access Control (ABAC) is the primary authorization mechanism
          in the Eisenhower Portfolio Manager. Unlike role-based access control (RBAC),
          ABAC evaluates multiple attributes — security clearance, handling caveats,
          citizenship, and employer legal entity — to determine whether a user may
          access a specific node in the Work Breakdown Structure.
        </p>
        <p>
          A node is visible to a user only if <strong>both</strong> conditions are met:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>
            <strong>Clearance Level:</strong> The user's clearance level is greater than
            or equal to the node's security classification.
          </li>
          <li>
            <strong>Caveat Matching:</strong> The node's handling caveats are a subset of
            the user's authorized caveats.
          </li>
        </ol>
        <InfoBox title="Security First" variant="danger">
          If either condition fails, the node is considered inaccessible. The system
          never exposes classified data to unauthorized users — instead, it uses
          "ghost-node" masking to preserve tree structure while redacting sensitive content.
        </InfoBox>
      </Section>

      {/* Section 2: Classification Hierarchy */}
      <Section title="Security Classification Hierarchy" icon={<Lock className="w-5 h-5" />}>
        <p>
          The system uses a four-level security classification hierarchy. A user may
          access nodes at their clearance level and below, but never above.
        </p>
        <div className="space-y-3">
          {[
            {
              level: 'OFFICIAL',
              color: 'bg-sky-500/20 text-sky-400 border border-sky-500/30',
              desc: 'Unclassified official information. Lowest classification level.',
            },
            {
              level: 'OFFICIAL-SENSITIVE',
              color: 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
              desc: 'Official information with additional handling restrictions.',
            },
            {
              level: 'SECRET',
              color: 'bg-red-500/20 text-red-400 border border-red-500/30',
              desc: 'Classified information. Compromise could cause serious damage.',
            },
            {
              level: 'TOP SECRET',
              color: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
              desc: 'Highest classification. Compromise could cause exceptionally grave damage.',
            },
          ].map((item) => (
            <div key={item.level} className="flex items-start gap-4 bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4">
              <ClassificationBadge level={item.level} color={item.color} />
              <p className="text-sm text-text-ops-muted">{item.desc}</p>
            </div>
          ))}
        </div>
        <InfoBox title="Clearance Comparison" variant="info">
          The clearance hierarchy is implemented as an ordered comparison:
          OFFICIAL (0) &lt; OFFICIAL-SENSITIVE (1) &lt; SECRET (2) &lt; TOP SECRET (3).
          A user with SECRET clearance (2) can access OFFICIAL, OFFICIAL-SENSITIVE, and SECRET nodes.
        </InfoBox>
      </Section>

      {/* Section 3: Caveat Matching */}
      <Section title="Caveat Matching Rules" icon={<Eye className="w-5 h-5" />}>
        <p>
          Handling caveats are additional access restrictions beyond the base
          classification level. Common caveats include:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { caveat: 'UK_EYES_ONLY', desc: 'Only UK citizens with appropriate clearance' },
            { caveat: 'NOFORN', desc: 'Not releasable to foreign nationals' },
            { caveat: 'REL TO NATO', desc: 'Releasable to NATO member nations only' },
            { caveat: 'CODEWORD', desc: 'Access restricted to codeword programme participants' },
          ].map((item) => (
            <div key={item.caveat} className="bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-3">
              <div className="font-mono text-sm text-text-ops-primary">{item.caveat}</div>
              <div className="text-xs text-text-ops-muted mt-1">{item.desc}</div>
            </div>
          ))}
        </div>
        <p className="mt-4">
          <strong>Subset Rule:</strong> A node's caveats must be a subset of the user's
          authorized caveats. For example:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>
            Node caveats: <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">['UK_EYES_ONLY']</code>
            <br />
            User caveats: <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">['UK_EYES_ONLY', 'NOFORN']</code>
            <br />
            <span className="text-green-400">✓ Access granted</span> — node caveats are a subset of user caveats.
          </li>
          <li>
            Node caveats: <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">['UK_EYES_ONLY', 'CODEWORD']</code>
            <br />
            User caveats: <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">['UK_EYES_ONLY']</code>
            <br />
            <span className="text-red-400">✗ Access denied</span> — user lacks CODEWORD caveat.
          </li>
        </ul>
      </Section>

      {/* Section 4: Ghost-Node Masking */}
      <Section title="Ghost-Node Hierarchy Preservation" icon={<EyeOff className="w-5 h-5" />}>
        <p>
          When querying a sub-tree, the system must preserve the hierarchical structure
          even when the user lacks clearance for intermediate nodes. Without ghost-node
          masking, a user who can access child tasks but not their parent would see a
          broken tree structure.
        </p>
        <InfoBox title="How Ghost-Node Masking Works" variant="warning">
          When a user queries a tree and encounters a node they cannot access:
          <br />
          <br />
          <strong>1.</strong> The system checks if the user has clearance for any descendants of the restricted node.
          <br />
          <strong>2.</strong> If yes, the parent is returned as a "ghost node" with redacted data:
          <br />
          &nbsp;&nbsp;• <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">name</code> → <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">'[RESTRICTED]'</code>
          <br />
          &nbsp;&nbsp;• <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">code</code> → <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">'[RESTRICTED]'</code>
          <br />
          &nbsp;&nbsp;• <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">custom_attributes</code> → <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">'[RESTRICTED]'</code>
          <br />
          &nbsp;&nbsp;• <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">is_masked</code> → <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">true</code>
          <br />
          <strong>3.</strong> The child nodes that the user <em>can</em> access are returned normally.
          <br />
          <br />
          This ensures the tree rendering in the UI remains structurally intact, with
          masked nodes shown as greyed-out placeholders.
        </InfoBox>
      </Section>

      {/* Section 5: Export Control */}
      <Section title="Foreign Disclosure Interlocks" icon={<Globe className="w-5 h-5" />}>
        <p>
          Beyond classification and caveats, the system enforces international export
          control regulations to prevent unauthorized foreign disclosure of controlled
          technical data.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border-ops-subtle">
                <th className="text-left py-2 px-3 text-text-ops-primary font-semibold">Regime</th>
                <th className="text-left py-2 px-3 text-text-ops-primary font-semibold">Full Name</th>
                <th className="text-left py-2 px-3 text-text-ops-primary font-semibold">Scope</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border-ops-subtle">
                <td className="py-2 px-3 font-mono text-text-ops-primary">ITAR</td>
                <td className="py-2 px-3 text-text-ops-muted">International Traffic in Arms Regulations</td>
                <td className="py-2 px-3 text-text-ops-muted">US Munitions List items — strict US-person-only access</td>
              </tr>
              <tr className="border-b border-border-ops-subtle">
                <td className="py-2 px-3 font-mono text-text-ops-primary">EAR_ECCN</td>
                <td className="py-2 px-3 text-text-ops-muted">Export Administration Regulations / ECCN</td>
                <td className="py-2 px-3 text-text-ops-muted">Dual-use items with Export Control Classification Numbers</td>
              </tr>
              <tr className="border-b border-border-ops-subtle">
                <td className="py-2 px-3 font-mono text-text-ops-primary">UK_MILITARY_LIST</td>
                <td className="py-2 px-3 text-text-ops-muted">UK Military List</td>
                <td className="py-2 px-3 text-text-ops-muted">UK-controlled military equipment and technology</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-mono text-text-ops-primary">NOT_CONTROLLED</td>
                <td className="py-2 px-3 text-text-ops-muted">Not Controlled</td>
                <td className="py-2 px-3 text-text-ops-muted">No export control restrictions apply</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* Section 6: Citizenship Verification */}
      <Section title="Citizenship Verification" icon={<CheckCircle className="w-5 h-5" />}>
        <p>
          For nodes under ITAR, EAR, or UK Military List control, the system verifies
          that all user citizenships (primary and dual) exist within the node's
          authorized nationalities list.
        </p>
        <div className="space-y-3">
          <div className="bg-bg-ops-surface border border-green-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-sm font-semibold text-green-400">Access Granted</span>
            </div>
            <p className="text-sm text-text-ops-muted">
              Node authorized nationalities: <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">['GB', 'US', 'AU']</code>
              <br />
              User citizenships: <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">primary='GB', dual=['AU']</code>
              <br />
              All citizenships are within the authorized list → access granted.
            </p>
          </div>
          <div className="bg-bg-ops-surface border border-red-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-sm font-semibold text-red-400">Access Denied — Export Control Violation</span>
            </div>
            <p className="text-sm text-text-ops-muted">
              Node authorized nationalities: <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">['GB', 'US']</code>
              <br />
              User citizenships: <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">primary='GB', dual=['CN']</code>
              <br />
              Dual citizenship 'CN' is not authorized → HTTP 403 ExportControlViolationException.
            </p>
          </div>
        </div>
        <InfoBox title="Employer Licence Verification" variant="info">
          For ITAR and EAR-controlled nodes, the system also verifies that the user's
          employer legal entity matches an authorized licensee under the node's TAA/MLA
          (Technical Assistance Agreement / Mutual Legal Assistance) reference.
          <br />
          <br />
          Format: <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">"TAA-2026-001: Entity A, Entity B"</code>
          <br />
          Entities are parsed from the comma-separated list after the colon.
        </InfoBox>
      </Section>

      {/* Section 7: Audit Trail */}
      <Section title="Export Control Denial Logging" icon={<AlertTriangle className="w-5 h-5" />}>
        <p>
          Every rejected export control check is logged to the immutable ForensicAuditLog
          with the security marking <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">EXPORT_CONTROL_DENIAL</code>.
          The log entry includes:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>User principal name (UPN) and client IP</li>
          <li>Target entity type and ID</li>
          <li>Export control regime (ITAR, EAR, UK Military List)</li>
          <li>Reason for denial (nationality mismatch, employer licence mismatch)</li>
          <li>SHA-256 chained hash for tamper-evident audit trail</li>
        </ul>
        <InfoBox title="Forensic Integrity" variant="success">
          All audit log entries are cryptographically chained using SHA-256 hashing.
          Any tampering with a log entry breaks the hash chain, making unauthorized
          modifications detectable. The audit chain can be verified via{' '}
          <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">POST /api/v1/audit/verify-integrity</code>.
        </InfoBox>
      </Section>

      {/* Section 8: Subcontractor Boundary */}
      <Section title="Subcontractor Boundary Scoping" icon={<Shield className="w-5 h-5" />}>
        <p>
          External tier-1/tier-2 subcontractors operate under a strict boundary tenant
          model. Subcontractor users are constrained to view and mutate only tasks
          where the vendor CAGE code matches their assigned organization.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-text-ops-muted mb-2">
              Visible to Subcontractor
            </div>
            <ul className="text-sm text-text-ops-muted space-y-1">
              <li>• Tasks matching their CAGE code</li>
              <li>• Contractual boundary work packages</li>
              <li>• Their own progress and notes</li>
            </ul>
          </div>
          <div className="bg-bg-ops-surface border border-red-500/30 rounded-lg p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-2">
              Masked from Subcontractor
            </div>
            <ul className="text-sm text-text-ops-muted space-y-1">
              <li>• Parent programme hierarchies</li>
              <li>• Sibling work packages</li>
              <li>• Prime EVM cost rates (→ <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">[RESTRICTED]</code>)</li>
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
};

export default ABACMatrix;
