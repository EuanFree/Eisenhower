/**
 * Artifact Vault Drawer
 *
 * Embedded slide-out drawer for managing classified document attachments
 * on any WBS task or CDRL item.  The drawer displays attached documents
 * with classification badges and export control markers, and provides
 * a secure two-phase upload workflow and ABAC-gated download action.
 *
 * Features
 * --------
 * 1. **Document List** — Displays all artifacts attached to the current
 *    node or CDRL, with classification badges (OFFICIAL through TOP_SECRET)
 *    and export control markers (ITAR, EAR).
 *
 * 2. **Secure Upload Workflow** — Three-step process:
 *    a. Request a pre-signed S3 PUT URL from the backend.
 *    b. Upload the file payload directly to MinIO/S3 via encrypted PUT.
 *    c. Confirm the upload with a client-side SHA-256 checksum.
 *
 * 3. **Secure Download** — Emits a pre-signed download URL expiring in
 *    60 seconds after evaluating user ABAC clearance and citizenship gates.
 *
 * 4. **Classification Badges** — Color-coded badges matching the Defence
 *    Design Token System (sky for OFFICIAL, red for SECRET, purple for
 *    TOP_SECRET).
 *
 * 5. **Export Control Markers** — ITAR and EAR markers displayed alongside
 *    classification badges.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import {
  FileText,
  Upload,
  Download,
  X,
  Shield,
  Lock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  File,
  Eye,
  Trash2,
  Clock,
  Hash,
} from 'lucide-react';
import api from '../../services/api';
import type {
  DocumentArtifact,
  ArtifactUploadRequest,
  ArtifactUploadResponse,
  ArtifactConfirmUploadRequest,
  ArtifactConfirmUploadResponse,
  ArtifactDownloadResponse,
  ArtifactListResponse,
  SecurityClassification,
  ExportControlRegime,
} from '../../types/location';

// ---------------------------------------------------------------------------
// Classification Colors
// ---------------------------------------------------------------------------

const CLASS_COLORS: Record<SecurityClassification, string> = {
  OFFICIAL: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
  OFFICIAL_SENSITIVE: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  SECRET: 'text-red-400 bg-red-500/10 border-red-500/30',
  TOP_SECRET: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
};

const CLASS_BORDER_COLORS: Record<SecurityClassification, string> = {
  OFFICIAL: 'border-l-sky-500',
  OFFICIAL_SENSITIVE: 'border-l-cyan-500',
  SECRET: 'border-l-red-500',
  TOP_SECRET: 'border-l-purple-500',
};

// ---------------------------------------------------------------------------
// Export Control Colors
// ---------------------------------------------------------------------------

const EXPORT_COLORS: Record<ExportControlRegime, string> = {
  ITAR: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  EAR_ECCN: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  UK_MILITARY_LIST: 'text-red-400 bg-red-500/10 border-red-500/30',
  OPEN_GENERAL: 'text-green-400 bg-green-500/10 border-green-500/30',
  NOT_CONTROLLED: 'text-text-ops-muted bg-bg-ops-overlay border-border-ops-subtle',
};

// ---------------------------------------------------------------------------
// Helper: Format file size
// ---------------------------------------------------------------------------

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// ---------------------------------------------------------------------------
// Helper: Compute SHA-256 checksum of a file
// ---------------------------------------------------------------------------

const computeSHA256 = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

// ---------------------------------------------------------------------------
// Upload Step Enum
// ---------------------------------------------------------------------------

type UploadStep = 'idle' | 'selecting' | 'requesting-url' | 'uploading' | 'confirming' | 'done';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ArtifactVaultDrawerProps {
  /** Whether the drawer is open */
  open: boolean;
  /** Associated portfolio node ID (for filtering artifacts) */
  nodeId?: string | null;
  /** Associated CDRL ID (for filtering artifacts) */
  cdrlId?: string | null;
  /** Callback to close the drawer */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component: ArtifactItemRow
// ---------------------------------------------------------------------------

interface ArtifactItemRowProps {
  artifact: DocumentArtifact;
  onDownload: (artifact: DocumentArtifact) => void;
}

const ArtifactItemRow: React.FC<ArtifactItemRowProps> = ({ artifact, onDownload }) => {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      await onDownload(artifact);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className={clsx(
        'flex items-start gap-3 p-3 rounded-md border border-border-ops-subtle bg-bg-ops-overlay hover:bg-bg-ops-surface transition-colors border-l-4',
        CLASS_BORDER_COLORS[artifact.security_classification],
      )}
    >
      {/* File Icon */}
      <div className="flex-shrink-0 mt-0.5">
        <File className="w-5 h-5 text-text-ops-muted" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm text-text-ops-primary truncate font-medium">
            {artifact.file_name}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Classification Badge */}
          <span
            className={clsx(
              'px-1.5 py-0.5 rounded text-[10px] font-medium border',
              CLASS_COLORS[artifact.security_classification],
            )}
          >
            {artifact.security_classification}
          </span>

          {/* Export Control Badge */}
          {artifact.export_control_regime !== 'NOT_CONTROLLED' && (
            <span
              className={clsx(
                'px-1.5 py-0.5 rounded text-[10px] font-medium border flex items-center gap-1',
                EXPORT_COLORS[artifact.export_control_regime],
              )}
            >
              <Lock className="w-3 h-3" />
              {artifact.export_control_regime}
            </span>
          )}

          {/* Caveats */}
          {artifact.caveats?.map((caveat) => (
            <span
              key={caveat}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/10 border border-orange-500/30 text-orange-400"
            >
              {caveat}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-ops-muted">
          <span>{formatFileSize(artifact.file_size_bytes)}</span>
          <span>{artifact.mime_type}</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(artifact.created_at).toLocaleDateString()}
          </span>
          {artifact.uploaded_by_user_name && (
            <span>by {artifact.uploaded_by_user_name}</span>
          )}
        </div>

        {/* SHA-256 checksum (truncated) */}
        <div className="flex items-center gap-1 mt-1 text-[10px] font-mono text-text-ops-muted/60">
          <Hash className="w-3 h-3" />
          {artifact.sha256_checksum.slice(0, 16)}...
        </div>

        {/* Active status */}
        {!artifact.is_active && (
          <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-400">
            <AlertCircle className="w-3 h-3" />
            Pending verification
          </div>
        )}

        {/* Download error */}
        {downloadError && (
          <div className="flex items-start gap-1 mt-1 text-[10px] text-red-400">
            <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span>{downloadError}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0">
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading || !artifact.is_active}
          className={clsx(
            'p-2 rounded-md transition-colors',
            downloading
              ? 'text-blue-400 cursor-wait'
              : !artifact.is_active
              ? 'text-text-ops-muted/30 cursor-not-allowed'
              : 'text-text-ops-muted hover:text-blue-400 hover:bg-bg-ops-overlay',
          )}
          title={artifact.is_active ? 'Download (60s expiry)' : 'Not yet verified'}
        >
          {downloading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Component: UploadForm
// ---------------------------------------------------------------------------

interface UploadFormProps {
  portfolioNodeId?: string | null;
  cdrlId?: string | null;
  onSuccess: () => void;
}

const UploadForm: React.FC<UploadFormProps> = ({ portfolioNodeId, cdrlId, onSuccess }) => {
  const [step, setStep] = useState<UploadStep>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [classification, setClassification] = useState<SecurityClassification>('OFFICIAL');
  const [caveats, setCaveats] = useState<string>('');
  const [exportControl, setExportControl] = useState<ExportControlRegime>('NOT_CONTROLLED');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [checksum, setChecksum] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = useCallback(() => {
    setStep('idle');
    setFile(null);
    setClassification('OFFICIAL');
    setCaveats('');
    setExportControl('NOT_CONTROLLED');
    setProgress(0);
    setError(null);
    setChecksum(null);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setStep('selecting');
      setError(null);
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file) return;

    try {
      // Step 1: Compute SHA-256 checksum
      setStep('requesting-url');
      setProgress(10);
      const sha256 = await computeSHA256(file);
      setChecksum(sha256);
      setProgress(20);

      // Step 2: Request pre-signed upload URL
      const uploadRequest: ArtifactUploadRequest = {
        file_name: file.name,
        file_size_bytes: file.size,
        mime_type: file.type || 'application/octet-stream',
        security_classification: classification,
        caveats: caveats ? caveats.split(',').map((c) => c.trim().toUpperCase()) : null,
        export_control_regime: exportControl,
        portfolio_node_id: portfolioNodeId,
        cdrl_id: cdrlId,
      };

      const uploadResponse = await api.post<ArtifactUploadResponse>(
        '/api/v1/artifacts/request-upload',
        uploadRequest,
      );
      setProgress(30);

      const { upload_url, artifact_id } = uploadResponse.data;

      // Step 3: Upload file directly to S3
      setStep('uploading');
      setProgress(40);

      const xhr = new XMLHttpRequest();

      // Progress tracking
      const xhrPromise = new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const pct = Math.round((event.loaded / event.total) * 50) + 40;
            setProgress(pct);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`S3 upload failed: ${xhr.status} ${xhr.statusText}`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('S3 upload failed')));
        xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
      });

      xhr.open('PUT', upload_url);
      xhr.send(file);
      await xhrPromise;

      setProgress(90);

      // Step 4: Confirm upload with SHA-256
      setStep('confirming');

      const confirmRequest: ArtifactConfirmUploadRequest = {
        artifact_id,
        sha256_checksum: sha256,
      };

      await api.post<ArtifactConfirmUploadResponse>(
        '/api/v1/artifacts/confirm-upload',
        confirmRequest,
      );

      setProgress(100);
      setStep('done');

      // Auto-refresh after success
      setTimeout(() => {
        onSuccess();
        resetForm();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setStep('idle');
    }
  }, [file, classification, caveats, exportControl, portfolioNodeId, cdrlId, onSuccess]);

  return (
    <div className="space-y-4">
      {/* File Selection */}
      {step === 'idle' || step === 'selecting' ? (
        <>
          <div
            onClick={() => fileInputRef.current?.click()}
            className={clsx(
              'flex flex-col items-center justify-center p-6 rounded-md border-2 border-dashed cursor-pointer transition-colors',
              file
                ? 'border-blue-500/50 bg-blue-500/5'
                : 'border-border-ops-subtle hover:border-border-ops-strong hover:bg-bg-ops-overlay',
            )}
            role="button"
            tabIndex={0}
            aria-label="Select file to upload"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
              aria-hidden="true"
            />

            {file ? (
              <>
                <FileText className="w-8 h-8 mb-2 text-blue-400" />
                <p className="text-sm text-text-ops-primary truncate max-w-full">{file.name}</p>
                <p className="text-xs text-text-ops-muted mt-1">
                  {formatFileSize(file.size)} · {file.type || 'unknown type'}
                </p>
                <p className="text-xs text-blue-400 mt-2">Click to change file</p>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8 mb-2 text-text-ops-muted" />
                <p className="text-sm text-text-ops-primary">Click to select a file</p>
                <p className="text-xs text-text-ops-muted mt-1">or drag and drop</p>
              </>
            )}
          </div>

          {/* Classification */}
          {file && (
            <>
              <div>
                <label className="block text-xs font-medium text-text-ops-muted uppercase tracking-wider mb-1.5">
                  Security Classification
                </label>
                <select
                  value={classification}
                  onChange={(e) => setClassification(e.target.value as SecurityClassification)}
                  className="w-full px-3 py-2 rounded-md bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="OFFICIAL">OFFICIAL</option>
                  <option value="OFFICIAL_SENSITIVE">OFFICIAL-SENSITIVE</option>
                  <option value="SECRET">SECRET</option>
                  <option value="TOP_SECRET">TOP SECRET</option>
                </select>
              </div>

              {/* Caveats */}
              <div>
                <label className="block text-xs font-medium text-text-ops-muted uppercase tracking-wider mb-1.5">
                  Caveats (comma-separated)
                </label>
                <input
                  type="text"
                  value={caveats}
                  onChange={(e) => setCaveats(e.target.value)}
                  placeholder="e.g., UK_EYES_ONLY, NOFORN"
                  className="w-full px-3 py-2 rounded-md bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Export Control */}
              <div>
                <label className="block text-xs font-medium text-text-ops-muted uppercase tracking-wider mb-1.5">
                  Export Control
                </label>
                <select
                  value={exportControl}
                  onChange={(e) => setExportControl(e.target.value as ExportControlRegime)}
                  className="w-full px-3 py-2 rounded-md bg-bg-ops-overlay border border-border-ops-subtle text-text-ops-primary text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="NOT_CONTROLLED">Not Controlled</option>
                  <option value="ITAR">ITAR</option>
                  <option value="EAR_ECCN">EAR ECCN</option>
                  <option value="UK_MILITARY_LIST">UK Military List</option>
                  <option value="OPEN_GENERAL">Open General</option>
                </select>
              </div>

              {/* Upload Button */}
              <button
                type="button"
                onClick={handleUpload}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
              >
                <Upload className="w-4 h-4" />
                Upload Document
              </button>
            </>
          )}
        </>
      ) : (
        /* Progress */
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            <div className="flex-1">
              <p className="text-sm text-text-ops-primary">
                {step === 'requesting-url' && 'Preparing secure upload...'}
                {step === 'uploading' && 'Uploading to secure storage...'}
                {step === 'confirming' && 'Verifying file integrity...'}
                {step === 'done' && 'Upload complete!'}
              </p>
              <p className="text-xs text-text-ops-muted mt-0.5">
                {file?.name} ({formatFileSize(file?.size || 0)})
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-bg-ops-overlay rounded-full overflow-hidden">
            <div
              className={clsx(
                'h-full rounded-full transition-all duration-300',
                step === 'done' ? 'bg-green-500' : 'bg-blue-500',
              )}
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>

          {/* Checksum */}
          {checksum && (
            <div className="flex items-center gap-1 text-[10px] font-mono text-text-ops-muted/60">
              <Hash className="w-3 h-3" />
              SHA-256: {checksum.slice(0, 32)}...
            </div>
          )}

          {/* Success */}
          {step === 'done' && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-green-500/10 border border-green-500/30 text-green-400">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">Document uploaded and verified</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-400">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Upload Failed</p>
                <p className="text-xs text-red-300/80 mt-1">{error}</p>
                <button
                  type="button"
                  onClick={resetForm}
                  className="mt-2 text-xs underline hover:text-red-300"
                >
                  Try again
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Drawer Component
// ---------------------------------------------------------------------------

const ArtifactVaultDrawer: React.FC<ArtifactVaultDrawerProps> = ({
  open,
  nodeId,
  cdrlId,
  onClose,
}) => {
  const [artifacts, setArtifacts] = useState<DocumentArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  // Fetch artifacts when drawer opens
  useEffect(() => {
    if (open) {
      fetchArtifacts();
    }
  }, [open, nodeId, cdrlId]);

  const fetchArtifacts = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (nodeId) params.portfolio_node_id = nodeId;
      if (cdrlId) params.cdrl_id = cdrlId;

      const response = await api.get<ArtifactListResponse>(
        '/api/v1/artifacts/',
        { params },
      );
      if (response.data) {
        setArtifacts(response.data.artifacts || []);
      }
    } catch {
      setArtifacts([]);
    } finally {
      setLoading(false);
    }
  }, [nodeId, cdrlId]);

  const handleDownload = useCallback(async (artifact: DocumentArtifact) => {
    try {
      const response = await api.get<ArtifactDownloadResponse>(
        `/api/v1/artifacts/${artifact.id}/download-url`,
      );
      if (response.data?.download_url) {
        // Open download URL in a new tab (expires in 60 seconds)
        window.open(response.data.download_url, '_blank');
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error('Download failed');
    }
  }, []);

  // Close drawer on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-lg bg-bg-ops-surface border-l border-border-ops-subtle shadow-2xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Document Vault"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-ops-subtle">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-semibold text-text-ops-primary">
              Document Vault
            </h2>
            {artifacts.length > 0 && (
              <span className="text-xs text-text-ops-muted">
                ({artifacts.length} document{artifacts.length !== 1 ? 's' : ''})
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-ops-overlay text-text-ops-muted hover:text-text-ops-primary transition-colors"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Security Warning */}
        <div className="px-4 py-2 border-b border-border-ops-subtle bg-amber-500/5">
          <div className="flex items-center gap-2 text-xs text-amber-400">
            <Lock className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              Downloads require ABAC clearance and export control verification.
              URLs expire after 60 seconds.
            </span>
          </div>
        </div>

        {/* Upload Toggle */}
        <div className="px-4 py-3 border-b border-border-ops-subtle">
          {!showUpload ? (
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-border-ops-subtle text-text-ops-muted hover:text-text-ops-primary hover:border-border-ops-strong transition-colors text-sm"
            >
              <Upload className="w-4 h-4" />
              Upload Document
            </button>
          ) : (
            <UploadForm
              portfolioNodeId={nodeId || undefined}
              cdrlId={cdrlId || undefined}
              onSuccess={() => {
                setShowUpload(false);
                fetchArtifacts();
              }}
            />
          )}
        </div>

        {/* Artifact List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 text-text-ops-muted">
              <Loader2 className="w-6 h-6 mb-2 animate-spin" />
              <p className="text-sm">Loading documents...</p>
            </div>
          ) : artifacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-text-ops-muted">
              <FileText className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">No documents attached</p>
              <p className="text-xs mt-1">
                {nodeId || cdrlId
                  ? 'Upload a document to attach it to this item'
                  : 'No accessible documents found'}
              </p>
            </div>
          ) : (
            artifacts.map((artifact) => (
              <ArtifactItemRow
                key={artifact.id}
                artifact={artifact}
                onDownload={handleDownload}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border-ops-subtle text-[10px] text-text-ops-muted">
          <span>All access logged in ForensicAuditLog</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Download URLs: 60s expiry
          </span>
        </div>
      </div>
    </>
  );
};

export default ArtifactVaultDrawer;
