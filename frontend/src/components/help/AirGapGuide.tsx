/**
 * Air-Gap Export/Import Procedures Guide
 *
 * Offline-accessible technical guide explaining the air-gap data exchange
 * procedures used by the Eisenhower Portfolio Manager for secure cross-domain
 * data transfers between air-gapped systems.
 *
 * Covers:
 *
 * - .defpack bundle format and structure
 * - Export procedures with classification redaction
 * - Import procedures with cryptographic verification
 * - Data diode transfer workflows
 * - Merkle tree delta synchronization
 *
 * All content is self-contained — no external dependencies.
 */

import React from 'react';
import {
  HardDrive,
  Download,
  Upload,
  Shield,
  AlertTriangle,
  CheckCircle,
  FileText,
  Key,
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
// Step Component
// ---------------------------------------------------------------------------

interface StepProps {
  number: number;
  title: string;
  children: React.ReactNode;
}

const Step: React.FC<StepProps> = ({ number, title, children }) => (
  <div className="flex items-start gap-4">
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-bg-ops-overlay border border-border-ops-subtle flex items-center justify-center text-sm font-bold text-text-ops-primary">
      {number}
    </div>
    <div className="flex-1">
      <h4 className="text-sm font-semibold text-text-ops-primary mb-1">{title}</h4>
      <div className="text-sm text-text-ops-muted">{children}</div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Air-Gap Guide Component
// ---------------------------------------------------------------------------

/**
 * Air-Gap Export/Import Procedures Guide component.
 *
 * Renders embedded technical documentation covering .defpack bundle format,
 * export/import procedures, data diode transfers, and Merkle tree synchronization.
 */
const AirGapGuide: React.FC = () => {
  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-8 pb-6 border-b border-border-ops-subtle">
        <h1 className="text-2xl font-bold text-text-ops-primary mb-2">
          Air-Gap Export/Import Procedures
        </h1>
        <p className="text-text-ops-muted">
          Step-by-step instructions for secure cross-domain data transfers between
          air-gapped systems using .defpack bundles and cryptographic verification.
        </p>
      </div>

      {/* Section 1: Overview */}
      <Section title="Overview" icon={<HardDrive className="w-5 h-5" />}>
        <p>
          The Eisenhower Portfolio Manager supports secure data exchange between
          air-gapped systems (e.g., Site Warton, Site Hastings, Deployable Rigs)
          that cannot communicate over a network. Data is transferred via physical
          media — optical discs or USB diodes — using cryptographically signed
          .defpack bundles.
        </p>
        <p>
          The .defpack format ensures:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>
            <strong>Integrity:</strong> SHA-256 manifest of all exported data
          </li>
          <li>
            <strong>Authenticity:</strong> Cryptographic signature verification
          </li>
          <li>
            <strong>Classification control:</strong> Automatic redaction of data
            exceeding the target system's classification ceiling
          </li>
          <li>
            <strong>Replay attack prevention:</strong> Duplicate transaction ID detection
          </li>
        </ul>
        <InfoBox title="Security Warning" variant="danger">
          Never transfer .defpack files between systems of different classification
          levels without proper sanitization. The export process automatically redacts
          classified content, but the operator must verify the classification ceiling
          matches the target system's maximum permitted classification.
        </InfoBox>
      </Section>

      {/* Section 2: .defpack Format */}
      <Section title=".defpack Bundle Format" icon={<FileText className="w-5 h-5" />}>
        <p>
          A .defpack file is a ZIP archive containing three files:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-sky-400 mb-1">
              payload.json
            </div>
            <p className="text-sm text-text-ops-muted">
              The canonical JSON payload containing all exported data: PortfolioNodes,
              DependencyLinks, ResourceAssignments, PortfolioBaselines, and ForensicAuditLog
              entries. Schema version: "1.0".
            </p>
          </div>
          <div className="bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1">
              manifest.json
            </div>
            <p className="text-sm text-text-ops-muted">
              SHA-256 checksums of every entity in the payload, plus a root hash
              covering the entire manifest. Used to verify data integrity on import.
            </p>
          </div>
          <div className="bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-green-400 mb-1">
              signature.bin
            </div>
            <p className="text-sm text-text-ops-muted">
              Cryptographic signature of the manifest, generated using the server's
              private key or local HSM certificate. Verified against trusted
              sovereign certificate authorities on import.
            </p>
          </div>
        </div>
      </Section>

      {/* Section 3: Export Procedure */}
      <Section title="Export Procedure" icon={<Download className="w-5 h-5" />}>
        <p>
          To export a project for transfer to an air-gapped system:
        </p>
        <div className="space-y-4 ml-2">
          <Step number={1} title="Select the Project">
            Navigate to the project in the schedule view and identify the root PortfolioNode
            ID for the programme or project you wish to export.
          </Step>
          <Step number={2} title="Set Classification Ceiling">
            Determine the maximum classification level of the target system. For example,
            if exporting from a SECRET system to an OFFICIAL-SENSITIVE system, set the
            ceiling to OFFICIAL-SENSITIVE.
          </Step>
          <Step number={3} title="Generate the Bundle">
            Call the export endpoint:
            <br />
            <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded block mt-1">
              POST /api/v1/airgap/export
            </code>
            <br />
            Body: <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">{"{ project_id: &quot;...&quot;, classification_ceiling: &quot;OFFICIAL_SENSITIVE&quot; }"}</code>
            <br />
            <br />
            The system extracts the project sub-tree, redacts any nodes exceeding the
            classification ceiling, serializes the content, computes the SHA-256 manifest,
            and packages everything into a signed .defpack file.
          </Step>
          <Step number={4} title="Verify the Bundle">
            Before physical transfer, verify the bundle's integrity:
            <br />
            <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded block mt-1">
              sha256sum project_2026-10-24.defpack
            </code>
            <br />
            Record the checksum for verification on the receiving system.
          </Step>
          <Step number={5} title="Physical Transfer">
            Copy the .defpack file to optical media or USB diode. Follow your organization's
            data diode procedures for cross-domain transfer.
          </Step>
        </div>
        <InfoBox title="Classification Redaction" variant="warning">
          During export, any node whose security classification exceeds the target ceiling
          is redacted: name, code, and custom_attributes are replaced with <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">'[RESTRICTED]'</code>.
          The node's existence and structural position are preserved, but its content is hidden.
        </InfoBox>
      </Section>

      {/* Section 4: Import Procedure */}
      <Section title="Import Procedure" icon={<Upload className="w-5 h-5" />}>
        <p>
          To import a .defpack bundle on the receiving air-gapped system:
        </p>
        <div className="space-y-4 ml-2">
          <Step number={1} title="Verify Physical Media">
            Ensure the .defpack file was received via authorized data diode procedures.
            Verify the SHA-256 checksum matches the recorded value from the exporting system.
          </Step>
          <Step number={2} title="Upload the Bundle">
            Call the import endpoint:
            <br />
            <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded block mt-1">
              POST /api/v1/airgap/import
            </code>
            <br />
            The file is uploaded as multipart form data. Optionally specify a{' '}
            <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">parent_node_id</code>{' '}
            to reparent the imported tree under an existing node.
          </Step>
          <Step number={3} title="Automated Verification">
            The system automatically performs:
            <ul className="list-disc list-inside space-y-1 mt-2 ml-4">
              <li>Package signature verification against trusted certificate authorities</li>
              <li>JSON schema validation against injection attacks</li>
              <li>Duplicate transaction ID detection (replay attack prevention)</li>
              <li>Importer clearance verification</li>
            </ul>
          </Step>
          <Step number={4} title="Merge or Review">
            If verification passes, the system merges imported nodes into the target
            PostgreSQL instance using ltree reparenting. A comprehensive AIRGAP_INGEST
            transaction is recorded in the ForensicAuditLog.
          </Step>
        </div>
        <InfoBox title="Replay Attack Prevention" variant="danger">
          The system checks for duplicate transaction IDs. If a .defpack bundle has
          already been imported, re-importing it will be rejected. Each bundle can
          only be ingested once.
        </InfoBox>
      </Section>

      {/* Section 5: Merkle Tree Sync */}
      <Section title="Merkle Tree Delta Synchronization" icon={<Key className="w-5 h-5" />}>
        <p>
          For systems that exchange data regularly, the Merkle tree synchronization
          protocol minimizes transfer size by sending only the changed records.
        </p>
        <div className="space-y-4 ml-2">
          <Step number={1} title="Generate Local Manifest">
            <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">GET /api/v1/merkle-sync/manifest</code>
            <br />
            Computes SHA-256 leaf hashes for every node, dependency, and assignment,
            then combines them upward along the ltree hierarchy to produce a single
            root digest.
          </Step>
          <Step number={2} title="Compare Manifests">
            <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">POST /api/v1/merkle-sync/compare</code>
            <br />
            Compares the local manifest against the remote manifest. If root hashes
            match, no transfer is needed. If they differ, the system traverses
            branch-by-branch to isolate the exact changed records.
          </Step>
          <Step number={3} title="Export Delta Pack">
            <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">POST /api/v1/merkle-sync/export-delta</code>
            <br />
            Packages only the divergent records into a signed .merklepack file.
          </Step>
          <Step number={4} title="Ingest Delta Pack">
            <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">POST /api/v1/merkle-sync/reconcile-delta</code>
            <br />
            Resolves mutations using three-way version tracking:
            <ul className="list-disc list-inside space-y-1 mt-2 ml-4">
              <li>Forward mutations (incoming version &gt; local) are applied directly</li>
              <li>Concurrent edits are staged into a SandboxScenario for review</li>
              <li>Parentage changes trigger manual review</li>
            </ul>
          </Step>
        </div>
        <InfoBox title="Leaf Hash Formula" variant="info">
          Each leaf hash is computed as:
          <br />
          <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded block mt-1">
            SHA256(id + code + version_id + updated_at + planned_dates)
          </code>
          <br />
          Any single-field change produces a completely different hash, ensuring
          even minor modifications are detected.
        </InfoBox>
      </Section>

      {/* Section 6: Security Considerations */}
      <Section title="Security Considerations" icon={<Shield className="w-5 h-5" />}>
        <div className="space-y-3">
          <div className="bg-bg-ops-surface border border-red-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <span className="text-sm font-semibold text-red-400">Classification Ceiling</span>
            </div>
            <p className="text-sm text-text-ops-muted">
              Always set the classification ceiling to the <strong>lower</strong> of the
              source and target system classifications. Exporting SECRET data to an
              OFFICIAL system without proper redaction constitutes a classification
              spillage incident.
            </p>
          </div>
          <div className="bg-bg-ops-surface border border-amber-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-semibold text-amber-400">Physical Media Handling</span>
            </div>
            <p className="text-sm text-text-ops-muted">
              Optical media and USB diodes used for .defpack transfer must be handled
              according to your organization's classified media procedures. Media must
              be encrypted at rest and destroyed after verified transfer.
            </p>
          </div>
          <div className="bg-bg-ops-surface border border-green-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-sm font-semibold text-green-400">Audit Trail</span>
            </div>
            <p className="text-sm text-text-ops-muted">
              All export and import operations are recorded in the ForensicAuditLog
              with SHA-256 chained hashing. Export operations use action type{' '}
              <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">AIRGAP_EXPORT</code> and
              imports use <code className="text-xs bg-bg-ops-base px-1 py-0.5 rounded">AIRGAP_INGEST</code>.
            </p>
          </div>
        </div>
      </Section>

      {/* Section 7: Troubleshooting */}
      <Section title="Troubleshooting" icon={<AlertTriangle className="w-5 h-5" />}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border-ops-subtle">
                <th className="text-left py-2 px-3 text-text-ops-primary font-semibold">Error</th>
                <th className="text-left py-2 px-3 text-text-ops-primary font-semibold">Cause</th>
                <th className="text-left py-2 px-3 text-text-ops-primary font-semibold">Resolution</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border-ops-subtle">
                <td className="py-2 px-3 font-mono text-text-ops-primary">SIGNATURE_INVALID</td>
                <td className="py-2 px-3 text-text-ops-muted">Bundle signature doesn't match manifest</td>
                <td className="py-2 px-3 text-text-ops-muted">Re-export the bundle; verify no corruption during transfer</td>
              </tr>
              <tr className="border-b border-border-ops-subtle">
                <td className="py-2 px-3 font-mono text-text-ops-primary">REPLAY_DETECTED</td>
                <td className="py-2 px-3 text-text-ops-muted">Bundle already imported</td>
                <td className="py-2 px-3 text-text-ops-muted">Generate a fresh export; each bundle is single-use</td>
              </tr>
              <tr className="border-b border-border-ops-subtle">
                <td className="py-2 px-3 font-mono text-text-ops-primary">CLEARANCE_INSUFFICIENT</td>
                <td className="py-2 px-3 text-text-ops-muted">Importer lacks clearance for bundle content</td>
                <td className="py-2 px-3 text-text-ops-muted">Use an importer with sufficient clearance or re-export with lower ceiling</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-mono text-text-ops-primary">SCHEMA_INVALID</td>
                <td className="py-2 px-3 text-text-ops-muted">Payload doesn't match expected schema</td>
                <td className="py-2 px-3 text-text-ops-muted">Bundle may be corrupted or from an incompatible version</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
};

export default AirGapGuide;
