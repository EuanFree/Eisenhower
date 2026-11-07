/**
 * AES-GCM Encryption Utility for Classified Clipboard Envelopes
 *
 * Provides production-grade encryption for clipboard data using the
 * Web Crypto API with AES-GCM (Galois/Counter Mode).  Each envelope
 * is encrypted with a unique random IV, ensuring semantic security
 * even when the same plaintext is copied multiple times.
 *
 * Key Derivation
 * ~~~~~~~~~~~~~~
 *
 * The encryption key is derived from the user's session via a
 * password-based key derivation function (PBKDF2).  The key material
 * comes from the JWT access token, which is already in memory — this
 * means the key never touches disk and is purged when the session ends.
 *
 * Encryption Flow
 * ~~~~~~~~~~~~~~~
 *
 * 1. Derive an AES-GCM key from the access token using PBKDF2.
 * 2. Generate a random 12-byte IV for each encryption operation.
 * 3. Encrypt the plaintext with AES-GCM, producing ciphertext + auth tag.
 * 4. Return a compact envelope: `{ iv, ciphertext, tag }` (all base64).
 *
 * Decryption Flow
 * ~~~~~~~~~~~~~~~
 *
 * 1. Derive the same AES-GCM key from the access token.
 * 2. Extract IV, ciphertext, and tag from the envelope.
 * 3. Decrypt and authenticate with AES-GCM.
 *
 * Usage
 * ~~~~~
 *
 * .. code-block:: ts
 *
 *   const key = await deriveKeyFromToken(jwtToken);
 *   const encrypted = await encryptPayload(key, 'Classified data');
 *   const decrypted = await decryptPayload(key, encrypted);
 *   console.log(decrypted); // 'Classified data'
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Encrypted payload envelope returned by {@link encryptPayload}.
 *
 * All fields are base64-encoded for safe JSON serialization.
 */
export interface EncryptedPayload {
  /** 12-byte initialization vector (base64). */
  iv: string;

  /** AES-GCM ciphertext (base64). */
  ciphertext: string;

  /** 16-byte authentication tag (base64). */
  tag: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** PBKDF2 iteration count — balances security and performance. */
const PBKDF2_ITERATIONS = 100_000;

/** Key derivation key length in bits. */
const KEY_LENGTH_BITS = 256;

/** IV length in bytes (96 bits — recommended for GCM). */
const IV_LENGTH_BYTES = 12;

/** Auth tag length in bytes (128 bits — full GCM tag). */
const TAG_LENGTH_BYTES = 16;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert an ArrayBuffer to a base64 string.
 */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Convert a base64 string to an ArrayBuffer.
 */
function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert a string to an ArrayBuffer (UTF-8 encoded).
 */
function stringToBuffer(text: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(text);
  return encoded.buffer;
}

/**
 * Convert an ArrayBuffer to a UTF-8 string.
 */
function bufferToString(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return new TextDecoder().decode(bytes);
}

// ---------------------------------------------------------------------------
// Key Derivation
// ---------------------------------------------------------------------------

/**
 * Derive an AES-GCM crypto key from a JWT access token using PBKDF2.
 *
 * The access token serves as the key material.  A fixed salt is used
 * because the token itself changes per session, providing uniqueness.
 *
 * @param token - The JWT access token string.
 *
 * @returns A usable CryptoKey for AES-GCM encryption/decryption.
 *
 * @throws Error if Web Crypto API is not available.
 */
export async function deriveKeyFromToken(token: string): Promise<CryptoKey> {
  if (!window.crypto?.subtle) {
    throw new Error('Web Crypto API not available — cannot derive encryption key');
  }

  // Import the token as raw key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    stringToBuffer(token),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  // Derive the AES-GCM key using PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: stringToBuffer('eisenhower-clipboard-aes-gcm-salt'),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------

/**
 * Encrypt plaintext using AES-GCM.
 *
 * Generates a random IV for each encryption, ensuring that encrypting
 * the same plaintext twice produces different ciphertexts.
 *
 * @param key - The AES-GCM CryptoKey (from {@link deriveKeyFromToken}).
 * @param plaintext - The text to encrypt.
 *
 * @returns An {@link EncryptedPayload} with iv, ciphertext, and tag.
 */
export async function encryptPayload(
  key: CryptoKey,
  plaintext: string,
): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    stringToBuffer(plaintext),
  );

  // AES-GCM appends the auth tag to the ciphertext.  We split them.
  const ciphertextAndTag = new Uint8Array(ciphertextBuffer);
  const ciphertext = ciphertextAndTag.slice(0, -TAG_LENGTH_BYTES);
  const tag = ciphertextAndTag.slice(-TAG_LENGTH_BYTES);

  return {
    iv: bufferToBase64(iv.buffer),
    ciphertext: bufferToBase64(ciphertext.buffer),
    tag: bufferToBase64(tag.buffer),
  };
}

// ---------------------------------------------------------------------------
// Decryption
// ---------------------------------------------------------------------------

/**
 * Decrypt an AES-GCM encrypted payload.
 *
 * Verifies the authentication tag during decryption — if the ciphertext
 * was tampered with, decryption will fail.
 *
 * @param key - The AES-GCM CryptoKey (from {@link deriveKeyFromToken}).
 * @param payload - The encrypted payload envelope.
 *
 * @returns The decrypted plaintext string.
 *
 * @throws Error if decryption fails (e.g., wrong key or tampered data).
 */
export async function decryptPayload(
  key: CryptoKey,
  payload: EncryptedPayload,
): Promise<string> {
  const iv = new Uint8Array(base64ToBuffer(payload.iv));
  const ciphertext = new Uint8Array(base64ToBuffer(payload.ciphertext));
  const tag = new Uint8Array(base64ToBuffer(payload.tag));

  // Reconstruct the full ciphertext + tag buffer
  const ciphertextAndTag = new Uint8Array(ciphertext.length + tag.length);
  ciphertextAndTag.set(ciphertext, 0);
  ciphertextAndTag.set(tag, ciphertext.length);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertextAndTag.buffer,
  );

  return bufferToString(decryptedBuffer);
}

// ---------------------------------------------------------------------------
// Legacy Compatibility
// ---------------------------------------------------------------------------

/**
 * Check if an encrypted payload is in the legacy base64 format.
 *
 * Legacy payloads are plain base64-encoded text without IV/tag fields.
 * This function detects them so we can gracefully fall back to base64
 * decoding for backward compatibility.
 *
 * @param data - The data to check.
 *
 * @returns `true` if the data is a legacy base64 string.
 */
export function isLegacyPayload(data: unknown): data is string {
  return typeof data === 'string' && !data.includes('{');
}

/**
 * Decode a legacy base64 payload (fallback for backward compatibility).
 *
 * @param encoded - Base64-encoded string.
 *
 * @returns The decoded plaintext.
 */
export function decodeLegacyPayload(encoded: string): string {
  try {
    return decodeURIComponent(escape(atob(encoded)));
  } catch {
    return atob(encoded);
  }
}

/**
 * Encode text to base64 (fallback for environments without Web Crypto).
 *
 * @param text - The text to encode.
 *
 * @returns Base64-encoded string.
 */
export function encodeLegacyPayload(text: string): string {
  try {
    return btoa(unescape(encodeURIComponent(text)));
  } catch {
    return btoa(text);
  }
}

/**
 * Check if the Web Crypto API is available.
 */
export function isWebCryptoAvailable(): boolean {
  return typeof window !== 'undefined' && window.crypto?.subtle != null;
}
