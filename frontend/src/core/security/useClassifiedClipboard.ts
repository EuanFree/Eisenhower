/**
 * Classified Clipboard Spill Guard — useClassifiedClipboard Hook
 *
 * Intercepts global copy, cut, and paste events to prevent cross-classification
 * data spills in SCIF environments.
 *
 * How It Works
 * ~~~~~~~~~~~~
 *
 * 1. **Copy / Cut Interception** — Wraps copied text into an encrypted
 *    ephemeral envelope:
 *    ```json
 *    { ciphertext, classification, caveats, sourceNodeId, timestamp }
 *    ```
 *    Stored in an in-memory session vault; purged after 60 seconds.
 *
 * 2. **Paste Interception** — Inspects the target entity's
 *    `security_classification` and caveat ceiling.  If the pasted payload
 *    classification exceeds the target entity's classification:
 *    - Prevents the paste action (`e.preventDefault()`).
 *    - Displays a warning toast.
 *    - Emits an audit warning event: `DATA_SPILL_PREVENTED`.
 *
 * 3. **Auto-Purge** — Clipboard buffers zeroize after 60 seconds via
 *    `setTimeout`.
 *
 * Usage
 * ~~~~~
 *
 * .. code-block:: ts
 *
 *   const { clipboardVault, lastBlockedPaste } = useClassifiedClipboard({
 *     targetClassification: 'OFFICIAL',
 *     targetCaveats: [],
 *     onBlockedPaste: (msg) => showToast(msg),
 *   });
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  deriveKeyFromToken,
  encryptPayload,
  decryptPayload,
  isLegacyPayload,
  decodeLegacyPayload,
  encodeLegacyPayload,
  isWebCryptoAvailable,
  type EncryptedPayload,
} from './encryption';
import { getAuthToken } from '../../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Classification hierarchy — higher index = higher classification.
 */
export const CLASSIFICATION_LEVELS: Record<string, number> = {
  'UNCLASSIFIED': 0,
  'OFFICIAL': 1,
  'OFFICIAL_SENSITIVE': 2,
  'SECRET': 3,
  'TOP_SECRET': 4,
};

/**
 * Ephemeral clipboard envelope — stored in-memory only.
 *
 * The `encryptedPayload` field holds an AES-GCM encrypted payload
 * (iv, ciphertext, tag).  For backward compatibility, legacy envelopes
 * may have a plain `ciphertext` string instead.
 */
export interface ClipboardEnvelope {
  /**
   * AES-GCM encrypted payload (production).
   * If present, takes precedence over `ciphertext`.
   */
  encryptedPayload?: EncryptedPayload;

  /**
   * Legacy base64-encoded ciphertext (fallback for backward compatibility).
   * New envelopes use `encryptedPayload` instead.
   */
  ciphertext?: string;

  /** Classification level of the copied content. */
  classification: string;

  /** Handling caveats (e.g., ['UK_EYES_ONLY']). */
  caveats: string[];

  /** Source node ID where the content was copied from. */
  sourceNodeId: string;

  /** ISO-8601 timestamp when the envelope was created. */
  timestamp: string;

  /** Expiration timer ID — purges after 60 seconds. */
  _expireTimer: ReturnType<typeof setTimeout>;
}

/**
 * Record of a blocked paste attempt.
 */
export interface BlockedPasteRecord {
  /** Classification of the clipboard payload. */
  sourceClassification: string;

  /** Caveats of the clipboard payload. */
  sourceCaveats: string[];

  /** Classification of the target entity. */
  targetClassification: string;

  /** Caveats of the target entity. */
  targetCaveats: string[];

  /** ISO-8601 timestamp of the blocked attempt. */
  timestamp: string;

  /** Warning message displayed to the user. */
  message: string;
}

/**
 * Configuration options for the clipboard guard hook.
 */
export interface ClassifiedClipboardOptions {
  /**
   * Classification level of the current target entity (where paste would land).
   * Defaults to 'OFFICIAL'.
   */
  targetClassification?: string;

  /**
   * Caveat ceiling of the current target entity.
   */
  targetCaveats?: string[];

  /**
   * Source classification of the currently selected content (for copy/cut).
   * Defaults to the target classification.
   */
  sourceClassification?: string;

  /**
   * Source caveats of the currently selected content.
   */
  sourceCaveats?: string[];

  /**
   * Source node ID of the currently selected content.
   */
  sourceNodeId?: string;

  /**
   * Callback invoked when a paste is blocked.
   */
  onBlockedPaste?: (message: string, record: BlockedPasteRecord) => void;

  /**
   * Callback invoked when an audit event is emitted.
   */
  onAuditEvent?: (event: string, data: unknown) => void;

  /**
   * How long (in seconds) before clipboard envelopes auto-purge.
   * Default: 60 seconds.
   */
  purgeTimeoutSeconds?: number;
}

/**
 * State and handlers returned by the clipboard guard hook.
 */
export interface ClassifiedClipboardState {
  /**
   * In-memory vault of active clipboard envelopes.
   * Purged after the configured timeout.
   */
  clipboardVault: ClipboardEnvelope[];

  /**
   * The most recent blocked paste record, if any.
   */
  lastBlockedPaste: BlockedPasteRecord | null;

  /**
   * Total number of blocked paste attempts since mount.
   */
  blockedPasteCount: number;

  /**
   * Manually purge all clipboard envelopes.
   */
  purgeVault: () => void;

  /**
   * Check if a paste from a given classification would be blocked.
   */
  wouldBlockPaste: (
    sourceClass: string,
    sourceCaveats: string[],
    targetClass: string,
    targetCaveats: string[]
  ) => boolean;
}

// ---------------------------------------------------------------------------
// Classification Comparison
// ---------------------------------------------------------------------------

/**
 * Check if a source classification exceeds a target classification.
 *
 * @returns `true` if pasting source into target would be a data spill.
 */
export function exceedsClassification(
  sourceClass: string,
  sourceCaveats: string[],
  targetClass: string,
  targetCaveats: string[]
): boolean {
  const sourceLevel = CLASSIFICATION_LEVELS[sourceClass.toUpperCase()] ?? 0;
  const targetLevel = CLASSIFICATION_LEVELS[targetClass.toUpperCase()] ?? 0;

  // Higher classification cannot be pasted into lower
  if (sourceLevel > targetLevel) {
    return true;
  }

  // Caveat check: source caveats must be a subset of target caveats
  for (const caveat of sourceCaveats) {
    if (!targetCaveats.includes(caveat)) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Encryption Key Cache
// ---------------------------------------------------------------------------

/**
 * Cached AES-GCM crypto key derived from the current JWT token.
 * Lazily initialized on first use; re-derived when the token changes.
 */
let cachedKey: CryptoKey | null = null;
let cachedTokenHash: string | null = null;

/**
 * Get or derive the AES-GCM encryption key from the current JWT token.
 *
 * The key is cached so repeated copy/paste operations don't re-derive
 * it.  When the token changes (e.g., after re-authentication), the
 * cache is invalidated automatically.
 *
 * @returns The AES-GCM CryptoKey, or `null` if unavailable.
 */
async function getEncryptionKey(): Promise<CryptoKey | null> {
  const token = getAuthToken();
  if (!token) return null;

  // Simple hash to detect token changes
  const tokenHash = token.slice(0, 32);
  if (cachedKey && cachedTokenHash === tokenHash) {
    return cachedKey;
  }

  try {
    cachedKey = await deriveKeyFromToken(token);
    cachedTokenHash = tokenHash;
    return cachedKey;
  } catch (err) {
    console.warn('[SCIF Clipboard] Failed to derive encryption key:', err);
    return null;
  }
}

/**
 * Encrypt plaintext using AES-GCM, falling back to base64 if unavailable.
 *
 * @param text - The text to encrypt.
 *
 * @returns Encrypted payload or legacy base64 string.
 */
async function encryptText(text: string): Promise<EncryptedPayload | null> {
  if (!isWebCryptoAvailable()) {
    return null;
  }

  const key = await getEncryptionKey();
  if (!key) {
    return null;
  }

  return encryptPayload(key, text);
}

/**
 * Decrypt an encrypted payload, falling back to legacy base64 decode.
 *
 * @param data - The encrypted payload or legacy base64 string.
 *
 * @returns The decrypted plaintext.
 */
async function decryptText(data: EncryptedPayload | string): Promise<string> {
  // Legacy base64 fallback
  if (isLegacyPayload(data)) {
    return decodeLegacyPayload(data);
  }

  // AES-GCM decryption
  if (isWebCryptoAvailable()) {
    const key = await getEncryptionKey();
    if (key) {
      try {
        return decryptPayload(key, data);
      } catch (err) {
        console.warn('[SCIF Clipboard] Decryption failed:', err);
      }
    }
  }

  // Last resort — should not happen in normal operation
  throw new Error('Unable to decrypt clipboard payload');
}

// ---------------------------------------------------------------------------
// In-Memory Vault
// ---------------------------------------------------------------------------

/**
 * Global in-memory clipboard vault.  Lives only in JS heap — never
 * touches localStorage or sessionStorage.
 */
const vault: ClipboardEnvelope[] = [];

// ---------------------------------------------------------------------------
// Hook Implementation
// ---------------------------------------------------------------------------

/**
 * Custom hook that intercepts clipboard events to prevent cross-classification
 * data spills.
 *
 * @param options - Configuration options for the clipboard guard.
 *
 * @returns ClassifiedClipboardState with vault access and control methods.
 *
 * @example
 * ```tsx
 * const { clipboardVault, lastBlockedPaste } = useClassifiedClipboard({
 *   targetClassification: 'OFFICIAL',
 *   onBlockedPaste: (msg) => toast.warning(msg),
 * });
 * ```
 */
export function useClassifiedClipboard(
  options: ClassifiedClipboardOptions = {}
): ClassifiedClipboardState {
  const {
    targetClassification = 'OFFICIAL',
    targetCaveats = [],
    sourceClassification,
    sourceCaveats = [],
    sourceNodeId = '',
    onBlockedPaste,
    onAuditEvent,
    purgeTimeoutSeconds = 60,
  } = options;

  const targetClassRef = useRef(targetClassification);
  const targetCaveatsRef = useRef(targetCaveats);
  const sourceClassRef = useRef(sourceClassification || targetClassification);
  const sourceCaveatsRef = useRef(sourceCaveats);
  const sourceNodeIdRef = useRef(sourceNodeId);
  const purgeTimeoutRef = useRef(purgeTimeoutSeconds);

  const [clipboardVault, setClipboardVault] = useState<ClipboardEnvelope[]>([]);
  const [lastBlockedPaste, setLastBlockedPaste] = useState<BlockedPasteRecord | null>(null);
  const [blockedPasteCount, setBlockedPasteCount] = useState(0);

  // Keep refs in sync with props
  useEffect(() => {
    targetClassRef.current = targetClassification;
  }, [targetClassification]);

  useEffect(() => {
    targetCaveatsRef.current = targetCaveats;
  }, [targetCaveats]);

  useEffect(() => {
    sourceClassRef.current = sourceClassification || targetClassification;
  }, [sourceClassification, targetClassification]);

  useEffect(() => {
    sourceCaveatsRef.current = sourceCaveats;
  }, [sourceCaveats]);

  useEffect(() => {
    sourceNodeIdRef.current = sourceNodeId;
  }, [sourceNodeId]);

  useEffect(() => {
    purgeTimeoutRef.current = purgeTimeoutSeconds;
  }, [purgeTimeoutSeconds]);

  /**
   * Purge all clipboard envelopes from the vault.
   */
  const purgeVault = useCallback(() => {
    for (const envelope of vault) {
      clearTimeout(envelope._expireTimer);
    }
    vault.length = 0;
    setClipboardVault([]);
  }, []);

  /**
   * Check if a paste from a given classification would be blocked.
   */
  const wouldBlockPaste = useCallback(
    (
      sourceClass: string,
      sourceCaveats: string[],
      targetClass: string,
      targetCaveats: string[]
    ): boolean => {
      return exceedsClassification(sourceClass, sourceCaveats, targetClass, targetCaveats);
    },
    []
  );

  /**
   * Emit an audit event to the backend.
   */
  const emitAuditEvent = useCallback(
    (eventName: string, data: unknown) => {
      onAuditEvent?.(eventName, data);

      // Dispatch a custom DOM event for other components to listen to
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('scif:audit', {
            detail: { event: eventName, data },
          })
        );
      }

      // Log to console for debugging
      console.warn(`[SCIF Audit] ${eventName}`, data);
    },
    [onAuditEvent]
  );

  /**
   * Handle copy and cut events — wrap content in encrypted envelope.
   *
   * Uses AES-GCM encryption when available, falling back to base64
   * encoding for backward compatibility.
   */
  const handleCopyCut = useCallback(
    async (e: ClipboardEvent) => {
      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      // Get the selected text
      const text = clipboardData.getData('text') || '';
      if (!text) return;

      // Encrypt the payload
      let encryptedPayload: EncryptedPayload | null = null;
      let legacyCiphertext: string | undefined = undefined;

      try {
        encryptedPayload = await encryptText(text);
      } catch (err) {
        console.warn('[SCIF Clipboard] Encryption failed, falling back to base64:', err);
      }

      if (!encryptedPayload) {
        // Fallback: legacy base64 encoding
        legacyCiphertext = encodeLegacyPayload(text);
      }

      // Build the envelope
      const envelope: ClipboardEnvelope = {
        encryptedPayload: encryptedPayload ?? undefined,
        ciphertext: legacyCiphertext,
        classification: sourceClassRef.current,
        caveats: [...sourceCaveatsRef.current],
        sourceNodeId: sourceNodeIdRef.current,
        timestamp: new Date().toISOString(),
        _expireTimer: setTimeout(() => {
          // Auto-purge after timeout
          const idx = vault.indexOf(envelope);
          if (idx !== -1) {
            vault.splice(idx, 1);
            setClipboardVault([...vault]);
          }
        }, purgeTimeoutRef.current * 1000),
      };

      // Store in vault
      vault.push(envelope);
      setClipboardVault([...vault]);

      // Replace clipboard content with the envelope JSON
      const envelopeJson = JSON.stringify({
        encryptedPayload: envelope.encryptedPayload,
        ciphertext: envelope.ciphertext,
        classification: envelope.classification,
        caveats: envelope.caveats,
        sourceNodeId: envelope.sourceNodeId,
        timestamp: envelope.timestamp,
      });

      e.preventDefault();
      clipboardData.setData('text/plain', envelopeJson);
    },
    []
  );

  /**
   * Handle paste events — check classification before allowing paste.
   *
   * Supports both AES-GCM encrypted payloads and legacy base64 envelopes.
   */
  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      const rawText = clipboardData.getData('text/plain');
      if (!rawText) return;

      // Try to parse as an envelope
      let envelope: {
        encryptedPayload?: EncryptedPayload;
        ciphertext?: string;
        classification: string;
        caveats: string[];
        sourceNodeId: string;
        timestamp: string;
      } | null = null;

      try {
        const parsed = JSON.parse(rawText);
        if ((parsed.encryptedPayload || parsed.ciphertext) && parsed.classification) {
          envelope = parsed;
        }
      } catch {
        // Not an envelope — treat as plain text with target classification
      }

      if (envelope) {
        // Check if paste is allowed
        const targetClass = targetClassRef.current;
        const targetCaveats = targetCaveatsRef.current;

        if (
          exceedsClassification(
            envelope.classification,
            envelope.caveats || [],
            targetClass,
            targetCaveats
          )
        ) {
          // Block the paste
          e.preventDefault();

          // Build warning message
          const sourceBanner = [
            envelope.classification,
            ...(envelope.caveats || []),
          ].join(' // ');

          const targetBanner = [targetClass, ...targetCaveats].join(' // ');

          const message = `DATA SPILL BLOCKED: Cannot paste [${sourceBanner}] data into [${targetBanner}] field`;

          // Record the blocked attempt
          const record: BlockedPasteRecord = {
            sourceClassification: envelope.classification,
            sourceCaveats: envelope.caveats || [],
            targetClassification: targetClass,
            targetCaveats: targetCaveats,
            timestamp: new Date().toISOString(),
            message,
          };

          setLastBlockedPaste(record);
          setBlockedPasteCount((c) => c + 1);

          // Notify the caller
          onBlockedPaste?.(message, record);

          // Emit audit event
          emitAuditEvent('DATA_SPILL_PREVENTED', {
            sourceClassification: envelope.classification,
            sourceCaveats: envelope.caveats || [],
            targetClassification: targetClass,
            targetCaveats: targetCaveats,
            sourceNodeId: envelope.sourceNodeId,
            timestamp: envelope.timestamp,
          });

          return;
        }

        // Paste is allowed — decrypt and set the actual text
        try {
          let decodedText: string;
          if (envelope.encryptedPayload) {
            // AES-GCM decryption
            decodedText = await decryptText(envelope.encryptedPayload);
          } else if (envelope.ciphertext) {
            // Legacy base64 fallback
            decodedText = await decryptText(envelope.ciphertext);
          } else {
            return;
          }
          e.preventDefault();
          clipboardData.setData('text/plain', decodedText);
        } catch (err) {
          console.error('[SCIF Clipboard] Failed to decrypt paste payload:', err);
        }
      }
      // If not an envelope, allow the default paste behavior
    },
    [onBlockedPaste, emitAuditEvent]
  );

  // Attach global event listeners
  useEffect(() => {
    document.addEventListener('copy', handleCopyCut, { passive: false });
    document.addEventListener('cut', handleCopyCut, { passive: false });
    document.addEventListener('paste', handlePaste, { passive: false });

    return () => {
      document.removeEventListener('copy', handleCopyCut);
      document.removeEventListener('cut', handleCopyCut);
      document.removeEventListener('paste', handlePaste);
    };
  }, [handleCopyCut, handlePaste]);

  // Purge vault on unmount
  useEffect(() => {
    return () => {
      purgeVault();
    };
  }, [purgeVault]);

  return {
    clipboardVault,
    lastBlockedPaste,
    blockedPasteCount,
    purgeVault,
    wouldBlockPaste,
  };
}
