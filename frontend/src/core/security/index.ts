/**
 * SCIF Security Module — Barrel Export
 *
 * Exports all security middleware hooks and components from the
 * `frontend/src/core/security` package.
 */

// Display Shield
export { useScifShield } from './useScifShield';
export type { ScifShieldOptions, ScifShieldState } from './useScifShield';

// Display Shield Overlay Component
export { default as ScifDisplayShield } from './ScifDisplayShield';
export type { ReAuthCredentials } from './ScifDisplayShield';

// Classified Clipboard Spill Guard
export {
  useClassifiedClipboard,
  exceedsClassification,
  CLASSIFICATION_LEVELS,
} from './useClassifiedClipboard';
export type {
  ClassifiedClipboardOptions,
  ClassifiedClipboardState,
  ClipboardEnvelope,
  BlockedPasteRecord,
} from './useClassifiedClipboard';

// Low-Profile / Briefing Mode
export { useLowProfileMode, useLowProfileStore } from './useLowProfileMode';

// AES-GCM Encryption Utilities
export {
  deriveKeyFromToken,
  encryptPayload,
  decryptPayload,
  isLegacyPayload,
  decodeLegacyPayload,
  encodeLegacyPayload,
  isWebCryptoAvailable,
} from './encryption';
export type { EncryptedPayload } from './encryption';

// SCIF Toast Notifications
export { default as ScifToast } from './ScifToast';
export type { ScifToastItem, ScifToastProps, ToastType } from './ScifToast';
