/**
 * Architecture Blueprint
 *
 * Interactive SVG data flow diagram showing the system topology of the
 * Eisenhower Portfolio Manager.
 *
 * Architecture:
 *
 * React Frontend ↔ FastAPI Backend ↔ PostgreSQL/ltree ↔ MinIO Vault
 *
 * Clicking architectural nodes highlights the corresponding database tables,
 * services, and security boundaries.
 *
 * All content is self-contained — no external dependencies.
 */

import React, { useState, useCallback } from 'react';
import {
  Network,
  Database,
  Server,
  Monitor,
  Shield,
  HardDrive,
  Info,
} from 'lucide-react';
import { clsx } from 'clsx';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ArchitectureNode = 'frontend' | 'api' | 'database' | 'minio' | 'redis' | 'security';

interface NodeInfo {
  id: ArchitectureNode;
  title: string;
  description: string;
  details: string[];
  icon: React.ReactNode;
  color: string;
  hoverColor: string;
}

// ---------------------------------------------------------------------------
// Node Definitions
// ---------------------------------------------------------------------------

const nodes: NodeInfo[] = [
  {
    id: 'frontend',
    title: 'React Frontend',
    description: 'Vite + TypeScript SPA with Tailwind CSS',
    details: [
      'Virtualized WBS Grid (@tanstack/react-table)',
      'SVG/Canvas Gantt Chart with density tiers',
      'Zustand stores for state management',
      'WebSocket presence & cache invalidation',
      'SCIF hot-desking display profiles',
      'Offline-accessible Help Center',
    ],
    icon: <Monitor className="w-5 h-5" />,
    color: '#38BDF8',
    hoverColor: '#0EA5E9',
  },
  {
    id: 'api',
    title: 'FastAPI Backend',
    description: 'Python 3.11 async web server',
    details: [
      '37+ API routers (100+ endpoints)',
      'JWT authentication & PKI/mTLS support',
      'ABAC clearance enforcement',
      'CPM engine (NetworkX DAG)',
      'Monte Carlo SRA (NumPy/SciPy)',
      'Burgess-Killebrew resource leveling',
      'ANSI/EIA-748 EVM calculator',
      'Forensic audit log (SHA-256 chain)',
    ],
    icon: <Server className="w-5 h-5" />,
    color: '#34D399',
    hoverColor: '#10B981',
  },
  {
    id: 'database',
    title: 'PostgreSQL / ltree',
    description: 'Primary data store with hierarchical indexing',
    details: [
      '47+ tables with polymorphic inheritance',
      'ltree extension for WBS/RBS/LBS trees',
      'GiST indexes for path containment queries',
      'JSONB for custom attributes & ODAC',
      'Patroni HA cluster (3-node Raft)',
      'Continuous WAL archiving (AES-256)',
      'Point-in-time recovery (PITR)',
    ],
    icon: <Database className="w-5 h-5" />,
    color: '#FBBF24',
    hoverColor: '#F59E0B',
  },
  {
    id: 'minio',
    title: 'MinIO Vault',
    description: 'S3-compatible sovereign object store',
    details: [
      'Classified document artifacts',
      'AES-256 Server-Side Encryption (SSE-S3)',
      'Pre-signed upload/download URLs',
      'SHA-256 checksum verification',
      'ABAC-gated access control',
      'Export control citizenship checks',
    ],
    icon: <HardDrive className="w-5 h-5" />,
    color: '#A78BFA',
    hoverColor: '#8B5CF6',
  },
  {
    id: 'redis',
    title: 'Redis Cache',
    description: 'High-speed message bus & session store',
    details: [
      'WebSocket presence partitioning',
      'Session inactivity tracking (15-min timeout)',
      'Background task distribution',
      'LRU cache (256MB)',
      'Sub-tree lock coordination',
    ],
    icon: <Network className="w-5 h-5" />,
    color: '#F87171',
    hoverColor: '#EF4444',
  },
  {
    id: 'security',
    title: 'Security Layer',
    description: 'Cross-cutting security controls',
    details: [
      'ABAC clearance hierarchy (4 levels)',
      'Caveat subset matching',
      'Ghost-node hierarchy preservation',
      'Export control (ITAR/EAR/UK Military List)',
      'Citizenship verification',
      'SHA-256 forensic audit chain',
      'SCIF inactivity & session revocation',
      'Spillage remediation (multi-sig purge)',
    ],
    icon: <Shield className="w-5 h-5" />,
    color: '#FB923C',
    hoverColor: '#F97316',
  },
];

// ---------------------------------------------------------------------------
// Info Panel Component
// ---------------------------------------------------------------------------

interface InfoPanelProps {
  node: NodeInfo | null;
}

const InfoPanel: React.FC<InfoPanelProps> = ({ node }) => {
  if (!node) {
    return (
      <div className="bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-6 h-full flex flex-col items-center justify-center text-center">
        <Info className="w-8 h-8 text-text-ops-muted mb-3" />
        <h3 className="text-sm font-semibold text-text-ops-primary mb-2">
          Architecture Details
        </h3>
        <p className="text-xs text-text-ops-muted max-w-xs">
          Click on any architectural node in the diagram to see its components,
          services, and security boundaries.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-bg-ops-surface border border-border-ops-subtle rounded-lg p-6">
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${node.color}20`, color: node.color }}
        >
          {node.icon}
        </div>
        <div>
          <h3 className="text-base font-semibold text-text-ops-primary">{node.title}</h3>
          <p className="text-xs text-text-ops-muted">{node.description}</p>
        </div>
      </div>
      <ul className="space-y-2">
        {node.details.map((detail, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-text-ops-muted">
            <span style={{ color: node.color }} className="mt-1 flex-shrink-0">
              •
            </span>
            {detail}
          </li>
        ))}
      </ul>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Architecture Blueprint Component
// ---------------------------------------------------------------------------

/**
 * Interactive SVG data flow blueprint component.
 *
 * Renders a vector diagram of the system topology with clickable nodes
 * that highlight corresponding database tables, services, and security boundaries.
 */
const ArchitectureBlueprint: React.FC = () => {
  const [selectedNode, setSelectedNode] = useState<ArchitectureNode | null>(null);

  const handleNodeClick = useCallback((id: ArchitectureNode) => {
    setSelectedNode((prev) => (prev === id ? null : id));
  }, []);

  const selectedNodeInfo = nodes.find((n) => n.id === selectedNode) || null;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="mb-6 pb-4 border-b border-border-ops-subtle">
        <h1 className="text-2xl font-bold text-text-ops-primary mb-2">
          System Architecture Blueprint
        </h1>
        <p className="text-text-ops-muted">
          Interactive topology diagram showing data flow between system components.
          Click on any node to see its services, tables, and security boundaries.
        </p>
      </div>

      <div className="flex-1 flex gap-6 overflow-auto">
        {/* SVG Diagram */}
        <div className="flex-1 min-w-[600px]">
          <svg
            viewBox="0 0 800 500"
            className="w-full h-auto"
            role="img"
            aria-label="System architecture diagram"
          >
            <defs>
              {/* Arrow marker */}
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="7"
                refX="10"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#64748B" />
              </marker>
              {/* Highlighted arrow marker */}
              <marker
                id="arrowhead-highlight"
                markerWidth="10"
                markerHeight="7"
                refX="10"
                refY="3.5"
                orient="auto"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill="#FBBF24" />
              </marker>
            </defs>

            {/* Background grid */}
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1E293B" strokeWidth="0.5" />
            </pattern>
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* Connection lines */}
            {/* Frontend ↔ API */}
            <line
              x1="200" y1="150" x2="350" y2="150"
              stroke={selectedNode === 'frontend' || selectedNode === 'api' ? '#FBBF24' : '#475569'}
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
              style={{ transition: 'stroke 0.2s' }}
            />
            <line
              x1="350" y1="160" x2="200" y2="160"
              stroke={selectedNode === 'frontend' || selectedNode === 'api' ? '#FBBF24' : '#475569'}
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
              style={{ transition: 'stroke 0.2s' }}
            />

            {/* API ↔ Database */}
            <line
              x1="450" y1="150" x2="550" y2="250"
              stroke={selectedNode === 'api' || selectedNode === 'database' ? '#FBBF24' : '#475569'}
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
              style={{ transition: 'stroke 0.2s' }}
            />
            <line
              x1="550" y1="260" x2="450" y2="160"
              stroke={selectedNode === 'api' || selectedNode === 'database' ? '#FBBF24' : '#475569'}
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
              style={{ transition: 'stroke 0.2s' }}
            />

            {/* API ↔ MinIO */}
            <line
              x1="450" y1="150" x2="550" y2="400"
              stroke={selectedNode === 'api' || selectedNode === 'minio' ? '#FBBF24' : '#475569'}
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
              style={{ transition: 'stroke 0.2s' }}
            />
            <line
              x1="550" y1="410" x2="450" y2="160"
              stroke={selectedNode === 'api' || selectedNode === 'minio' ? '#FBBF24' : '#475569'}
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
              style={{ transition: 'stroke 0.2s' }}
            />

            {/* API ↔ Redis */}
            <line
              x1="450" y1="150" x2="650" y2="150"
              stroke={selectedNode === 'api' || selectedNode === 'redis' ? '#FBBF24' : '#475569'}
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
              style={{ transition: 'stroke 0.2s' }}
            />
            <line
              x1="650" y1="160" x2="450" y2="160"
              stroke={selectedNode === 'api' || selectedNode === 'redis' ? '#FBBF24' : '#475569'}
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
              style={{ transition: 'stroke 0.2s' }}
            />

            {/* Security layer (dashed, surrounds all) */}
            <rect
              x="50" y="50" width="700" height="400"
              fill="none"
              stroke={selectedNode === 'security' ? '#FB923C' : '#334155'}
              strokeWidth="2"
              strokeDasharray="8 4"
              rx="12"
              style={{ transition: 'stroke 0.2s' }}
            />
            <text
              x="60" y="75"
              fill={selectedNode === 'security' ? '#FB923C' : '#64748B'}
              fontSize="11"
              fontWeight="600"
              style={{ transition: 'fill 0.2s' }}
            >
              SECURITY BOUNDARY
            </text>

            {/* Node: Frontend */}
            <g
              onClick={() => handleNodeClick('frontend')}
              className="cursor-pointer"
              role="button"
              aria-label="React Frontend"
              tabIndex={0}
            >
              <rect
                x="100" y="100" width="200" height="100"
                rx="12"
                fill={selectedNode === 'frontend' ? '#38BDF820' : '#1E293B'}
                stroke={selectedNode === 'frontend' ? '#38BDF8' : '#334155'}
                strokeWidth="2"
                style={{ transition: 'all 0.2s' }}
              />
              <text x="200" y="140" textAnchor="middle" fill="#F8FAFC" fontSize="14" fontWeight="600">
                React Frontend
              </text>
              <text x="200" y="160" textAnchor="middle" fill="#94A3B8" fontSize="11">
                Vite + TypeScript
              </text>
              <text x="200" y="178" textAnchor="middle" fill="#94A3B8" fontSize="10">
                Tailwind CSS
              </text>
            </g>

            {/* Node: API */}
            <g
              onClick={() => handleNodeClick('api')}
              className="cursor-pointer"
              role="button"
              aria-label="FastAPI Backend"
              tabIndex={0}
            >
              <rect
                x="350" y="100" width="200" height="100"
                rx="12"
                fill={selectedNode === 'api' ? '#34D39920' : '#1E293B'}
                stroke={selectedNode === 'api' ? '#34D399' : '#334155'}
                strokeWidth="2"
                style={{ transition: 'all 0.2s' }}
              />
              <text x="450" y="140" textAnchor="middle" fill="#F8FAFC" fontSize="14" fontWeight="600">
                FastAPI Backend
              </text>
              <text x="450" y="160" textAnchor="middle" fill="#94A3B8" fontSize="11">
                Python 3.11
              </text>
              <text x="450" y="178" textAnchor="middle" fill="#94A3B8" fontSize="10">
                37+ Routers
              </text>
            </g>

            {/* Node: Database */}
            <g
              onClick={() => handleNodeClick('database')}
              className="cursor-pointer"
              role="button"
              aria-label="PostgreSQL Database"
              tabIndex={0}
            >
              <rect
                x="550" y="200" width="200" height="100"
                rx="12"
                fill={selectedNode === 'database' ? '#FBBF2420' : '#1E293B'}
                stroke={selectedNode === 'database' ? '#FBBF24' : '#334155'}
                strokeWidth="2"
                style={{ transition: 'all 0.2s' }}
              />
              <text x="650" y="240" textAnchor="middle" fill="#F8FAFC" fontSize="14" fontWeight="600">
                PostgreSQL
              </text>
              <text x="650" y="260" textAnchor="middle" fill="#94A3B8" fontSize="11">
                ltree + GiST Index
              </text>
              <text x="650" y="278" textAnchor="middle" fill="#94A3B8" fontSize="10">
                47+ Tables
              </text>
            </g>

            {/* Node: MinIO */}
            <g
              onClick={() => handleNodeClick('minio')}
              className="cursor-pointer"
              role="button"
              aria-label="MinIO Vault"
              tabIndex={0}
            >
              <rect
                x="550" y="350" width="200" height="100"
                rx="12"
                fill={selectedNode === 'minio' ? '#A78BFA20' : '#1E293B'}
                stroke={selectedNode === 'minio' ? '#A78BFA' : '#334155'}
                strokeWidth="2"
                style={{ transition: 'all 0.2s' }}
              />
              <text x="650" y="390" textAnchor="middle" fill="#F8FAFC" fontSize="14" fontWeight="600">
                MinIO Vault
              </text>
              <text x="650" y="410" textAnchor="middle" fill="#94A3B8" fontSize="11">
                S3-Compatible
              </text>
              <text x="650" y="428" textAnchor="middle" fill="#94A3B8" fontSize="10">
                AES-256 SSE-S3
              </text>
            </g>

            {/* Node: Redis */}
            <g
              onClick={() => handleNodeClick('redis')}
              className="cursor-pointer"
              role="button"
              aria-label="Redis Cache"
              tabIndex={0}
            >
              <rect
                x="650" y="100" width="100" height="80"
                rx="12"
                fill={selectedNode === 'redis' ? '#F8717120' : '#1E293B'}
                stroke={selectedNode === 'redis' ? '#F87171' : '#334155'}
                strokeWidth="2"
                style={{ transition: 'all 0.2s' }}
              />
              <text x="700" y="135" textAnchor="middle" fill="#F8FAFC" fontSize="12" fontWeight="600">
                Redis
              </text>
              <text x="700" y="155" textAnchor="middle" fill="#94A3B8" fontSize="10">
                Cache &amp; Sessions
              </text>
            </g>

            {/* Protocol labels */}
            <text x="275" y="140" textAnchor="middle" fill="#64748B" fontSize="9">
              HTTP/WebSocket
            </text>
            <text x="500" y="195" textAnchor="middle" fill="#64748B" fontSize="9">
              psycopg2
            </text>
            <text x="500" y="340" textAnchor="middle" fill="#64748B" fontSize="9">
              boto3 / S3
            </text>
            <text x="550" y="140" textAnchor="middle" fill="#64748B" fontSize="9">
              Redis protocol
            </text>
          </svg>
        </div>

        {/* Info Panel */}
        <div className="w-80 flex-shrink-0">
          <InfoPanel node={selectedNodeInfo} />
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-border-ops-subtle">
        <h3 className="text-sm font-semibold text-text-ops-primary mb-3">Legend</h3>
        <div className="flex flex-wrap gap-4">
          {nodes.map((node) => (
            <button
              key={node.id}
              onClick={() => handleNodeClick(node.id)}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors',
                selectedNode === node.id
                  ? 'bg-bg-ops-overlay text-text-ops-primary'
                  : 'text-text-ops-muted hover:text-text-ops-primary hover:bg-bg-ops-overlay'
              )}
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: node.color }}
              />
              {node.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ArchitectureBlueprint;
