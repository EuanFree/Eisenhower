#!/usr/bin/env bash
# ============================================================
# sign_release_manifest.sh — Cryptographically sign SBOM manifest
# ============================================================
#
# Signs a CycloneDX SBOM JSON manifest using the release engineering
# private key.  Produces a detached Ed25519 signature file (.sig)
# alongside the manifest.
#
# In production, this script uses an HSM (Hardware Security Module)
# via PKCS#11 to sign with the release engineering key.  In development,
# it falls back to a software Ed25519 key pair.
#
# Usage:
#   bash scripts/security/sign_release_manifest.sh <manifest_path>
#
# Arguments:
#   manifest_path  — Path to the CycloneDX JSON manifest to sign.
#
# Output:
#   <manifest_path>.sig  — Detached Ed25519 signature file.
#
# Exit codes:
#   0  — Signature produced successfully.
#   1  — Signing failed (key not found, HSM unavailable, etc.).
# ============================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Release engineering key directory
RELEASE_KEY_DIR="${RELEASE_KEY_DIR:-/etc/eisenhower/keys/release}"

# Private key file (Ed25519)
PRIVATE_KEY="${RELEASE_KEY_DIR}/release-engineering.key"

# Public key file (for verification)
PUBLIC_KEY="${RELEASE_KEY_DIR}/release-engineering.pub"

# HSM PKCS#11 library (optional — used in production)
HSM_LIB="${HSM_PKCS11_LIB_PATH:-}"

# HSM key label
HSM_KEY_LABEL="${HSM_KEY_LABEL:-release-signing-key}"

# ---------------------------------------------------------------------------
# Argument validation
# ---------------------------------------------------------------------------

if [ $# -lt 1 ]; then
    echo "ERROR: Missing manifest path argument." >&2
    echo "Usage: $0 <manifest_path>" >&2
    exit 1
fi

MANIFEST_PATH="$1"

if [ ! -f "$MANIFEST_PATH" ]; then
    echo "ERROR: Manifest file not found: $MANIFEST_PATH" >&2
    exit 1
fi

SIGNATURE_PATH="${MANIFEST_PATH}.sig"

echo "Signing manifest: $MANIFEST_PATH"
echo "Output signature: $SIGNATURE_PATH"

# ---------------------------------------------------------------------------
# HSM-based signing (production)
# ---------------------------------------------------------------------------

if [ -n "$HSM_LIB" ] && [ -f "$HSM_LIB" ]; then
    echo "Using HSM for signing: $HSM_LIB"

    # Use OpenSSL with PKCS#11 provider for HSM signing
    if command -v openssl &> /dev/null; then
        openssl dgst -ed25519 \
            -provider pkcs11 \
            -provider default \
            -provider-path "$HSM_LIB" \
            -keyform engine \
            -sign "$HSM_KEY_LABEL" \
            -out "$SIGNATURE_PATH" \
            "$MANIFEST_PATH" 2>/dev/null

        if [ $? -eq 0 ]; then
            echo "HSM signing successful."
            exit 0
        else
            echo "WARNING: HSM signing failed, falling back to software key." >&2
        fi
    else
        echo "WARNING: OpenSSL not available for HSM signing." >&2
    fi
fi

# ---------------------------------------------------------------------------
# Software Ed25519 signing (development / fallback)
# ---------------------------------------------------------------------------

echo "Using software Ed25519 key for signing."

# Generate key pair if it does not exist
if [ ! -f "$PRIVATE_KEY" ]; then
    echo "Generating Ed25519 key pair at $RELEASE_KEY_DIR..."
    mkdir -p "$RELEASE_KEY_DIR"

    if command -v openssl &> /dev/null; then
        openssl genpkey -algorithm Ed25519 -out "$PRIVATE_KEY" 2>/dev/null
        openssl pkey -in "$PRIVATE_KEY" -pubout -out "$PUBLIC_KEY" 2>/dev/null
    else
        # Fallback: use Python nacl if available
        python3 -c "
import base64
from nacl.signing import SigningKey
key = SigningKey.generate()
with open('$PRIVATE_KEY', 'wb') as f:
    f.write(key.encode())
with open('$PUBLIC_KEY', 'wb') as f:
    f.write(key.verify_key.encode())
" 2>/dev/null
    fi

    if [ ! -f "$PRIVATE_KEY" ]; then
        echo "ERROR: Could not generate signing key." >&2
        exit 1
    fi
    echo "Key pair generated."
fi

# Sign the manifest
if command -v openssl &> /dev/null; then
    openssl dgst -ed25519 \
        -sign "$PRIVATE_KEY" \
        -out "$SIGNATURE_PATH" \
        "$MANIFEST_PATH"

    echo "Manifest signed successfully: $SIGNATURE_PATH"
    exit 0
fi

# Fallback: Python-based signing
python3 -c "
import sys
from pathlib import Path
try:
    from nacl.signing import SigningKey
    private_key_data = Path('$PRIVATE_KEY').read_bytes()
    key = SigningKey(private_key_data)
    manifest_data = Path('$MANIFEST_PATH').read_bytes()
    signature = key.sign(manifest_data).signature
    Path('$SIGNATURE_PATH').write_bytes(signature)
    print('Manifest signed with NaCl: $SIGNATURE_PATH')
except ImportError:
    print('ERROR: Neither OpenSSL nor PyNaCl available for signing.', file=sys.stderr)
    sys.exit(1)
"

echo "Signing complete."
exit 0
