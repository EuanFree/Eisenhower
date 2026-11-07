#!/usr/bin/env bash
# =============================================================================
# WAL Segment Archiving Script
# =============================================================================
#
# This script is invoked by PostgreSQL's archive_command to archive completed
# WAL (Write-Ahead Logging) segments to an encrypted, isolated local storage
# mount. It provides continuous protection against data loss and enables
# Point-in-Time Recovery (PITR).
#
# Encryption
# ----------
# Each WAL segment is encrypted using GPG with AES-256 before being written
# to the archive directory. The recipient key must be pre-installed on the
# system and should be stored offline in a secure location (e.g., SCIF safe).
#
# Usage
# -----
#   PostgreSQL archive_command configuration:
#     archive_command = '/opt/patroni/archive_wal.sh %p %f'
#
#   Where:
#     %p = full path to the WAL file on disk (e.g., /var/lib/postgresql/16/main/pg_wal/000000010000000000000001)
#     %f = WAL segment filename (e.g., 000000010000000000000001)
#
# Configuration
# -------------
#   ARCHIVE_DIR:    Target directory for encrypted WAL segments.
#   GPG_RECIPIENT:  GPG key ID or email for encryption.
#   GPG_HOME:       Path to GPG home directory (for air-gapped key storage).
#
# Exit Codes
# ----------
#   0 = Success — WAL segment archived and encrypted.
#   1 = Failure — Archiving failed; PostgreSQL will retry.
#
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — adjust for your deployment environment
# ---------------------------------------------------------------------------
ARCHIVE_DIR="${WAL_ARCHIVE_DIR:-/wal_archive}"
GPG_RECIPIENT="${WAL_GPG_RECIPIENT:-backup-key@eisenhower.local}"
GPG_HOME="${WAL_GPG_HOME:-/opt/patroni/.gnupg}"
GPG_OPTS="--batch --yes --trust-model always --homedir ${GPG_HOME}"

# ---------------------------------------------------------------------------
# Arguments from PostgreSQL
# ---------------------------------------------------------------------------
# %p = full path to the WAL file
# %f = WAL segment filename
WAL_PATH="$1"
WAL_FILE="$2"

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
if [ -z "${WAL_PATH}" ] || [ -z "${WAL_FILE}" ]; then
    echo "ERROR: Missing arguments. Usage: archive_wal.sh <wal_path> <wal_file>" >&2
    exit 1
fi

if [ ! -f "${WAL_PATH}" ]; then
    echo "ERROR: WAL file not found: ${WAL_PATH}" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Ensure archive directory exists
# ---------------------------------------------------------------------------
if [ ! -d "${ARCHIVE_DIR}" ]; then
    mkdir -p "${ARCHIVE_DIR}"
    chmod 700 "${ARCHIVE_DIR}"
fi

# ---------------------------------------------------------------------------
# Encrypt and archive the WAL segment
# ---------------------------------------------------------------------------
# The encrypted file is named <wal_segment>.gpg
ENCRYPTED_FILE="${ARCHIVE_DIR}/${WAL_FILE}.gpg"

# Encrypt the WAL segment using GPG with AES-256
if gpg ${GPG_OPTS} --encrypt --recipient "${GPG_RECIPIENT}" \
     --output "${ENCRYPTED_FILE}" "${WAL_PATH}"; then

    # Verify the encrypted file was created and is non-empty
    if [ -s "${ENCRYPTED_FILE}" ]; then
        # Set restrictive permissions on the encrypted archive
        chmod 600 "${ENCRYPTED_FILE}"

        # Compute and store SHA-256 checksum for integrity verification
        sha256sum "${ENCRYPTED_FILE}" > "${ENCRYPTED_FILE}.sha256"

        echo "ARCHIVED: ${WAL_FILE} -> ${ENCRYPTED_FILE}"
        exit 0
    else
        echo "ERROR: Encrypted file is empty: ${ENCRYPTED_FILE}" >&2
        rm -f "${ENCRYPTED_FILE}"
        exit 1
    fi
else
    echo "ERROR: GPG encryption failed for ${WAL_FILE}" >&2
    rm -f "${ENCRYPTED_FILE}"
    exit 1
fi
