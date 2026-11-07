#!/usr/bin/env bash
# =============================================================================
# Point-in-Time Recovery (PITR) Script
# =============================================================================
#
# This script restores a PostgreSQL database cluster to a specific point in
# time using archived WAL segments. It is designed for emergency recovery
# scenarios such as accidental operator deletion, physical system trip, or
# data corruption events.
#
# Recovery Process
# ----------------
#   1. Stops the target PostgreSQL instance.
#   2. Backs up the current data directory (for forensic analysis).
#   3. Restores the base backup from the archive.
#   4. Configures recovery.conf with the target timestamp.
#   5. Decrypts and replays WAL segments from the archive up to the target time.
#   6. Starts PostgreSQL in recovery mode.
#   7. Monitors recovery progress until the target timestamp is reached.
#
# Prerequisites
# -------------
#   - A valid base backup exists in the backup directory.
#   - Encrypted WAL segments are available in the archive directory.
#   - GPG decryption key is installed and accessible.
#   - The target timestamp is within the available WAL archive range.
#
# Usage
# -----
#   ./restore_to_point_in_time.sh "2026-10-24T14:30:00.000+00:00"
#
#   Or with environment variables:
#     BACKUP_DIR=/backups ARCHIVE_DIR=/wal_archive \
#     ./restore_to_point_in_time.sh "2026-10-24T14:30:00.000+00:00"
#
# Environment Variables
# ---------------------
#   TARGET_TIME:      ISO-8601 timestamp to recover to (required, or pass as $1).
#   BACKUP_DIR:       Directory containing the base backup (default: /backups).
#   ARCHIVE_DIR:      Directory containing encrypted WAL segments (default: /wal_archive).
#   DATA_DIR:         PostgreSQL data directory (default: /var/lib/postgresql/16/main).
#   PG_USER:          PostgreSQL superuser for recovery (default: postgres).
#   GPG_HOME:         GPG home directory for decryption keys (default: /opt/patroni/.gnupg).
#
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
TARGET_TIME="${1:-${TARGET_TIME:-}}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
ARCHIVE_DIR="${ARCHIVE_DIR:-/wal_archive}"
DATA_DIR="${DATA_DIR:-/var/lib/postgresql/16/main}"
PG_USER="${PG_USER:-postgres}"
GPG_HOME="${GPG_HOME:-/opt/patroni/.gnupg}"
GPG_OPTS="--batch --yes --trust-model always --homedir ${GPG_HOME}"

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
if [ -z "${TARGET_TIME}" ]; then
    echo "ERROR: Target recovery time is required." >&2
    echo "Usage: $0 <ISO-8601-timestamp>" >&2
    echo "Example: $0 \"2026-10-24T14:30:00.000+00:00\"" >&2
    exit 1
fi

# Validate ISO-8601 format (basic check)
if ! echo "${TARGET_TIME}" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'; then
    echo "ERROR: Invalid ISO-8601 timestamp format: ${TARGET_TIME}" >&2
    echo "Expected format: YYYY-MM-DDTHH:MM:SS.mmm+HH:MM" >&2
    exit 1
fi

# Check for required directories
if [ ! -d "${BACKUP_DIR}" ]; then
    echo "ERROR: Backup directory not found: ${BACKUP_DIR}" >&2
    exit 1
fi

if [ ! -d "${ARCHIVE_DIR}" ]; then
    echo "ERROR: WAL archive directory not found: ${ARCHIVE_DIR}" >&2
    exit 1
fi

# Check for GPG
if ! command -v gpg &> /dev/null; then
    echo "ERROR: GPG is not installed. Cannot decrypt WAL segments." >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_FILE="/var/log/postgresql/pitr_recovery_$(date +%Y%m%d_%H%M%S).log"
mkdir -p "$(dirname "${LOG_FILE}")"

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
    echo "[${timestamp}] [${level}] ${message}" | tee -a "${LOG_FILE}"
}

log "INFO" "=========================================="
log "INFO" "Point-in-Time Recovery Started"
log "INFO" "=========================================="
log "INFO" "Target time: ${TARGET_TIME}"
log "INFO" "Backup dir:  ${BACKUP_DIR}"
log "INFO" "Archive dir: ${ARCHIVE_DIR}"
log "INFO" "Data dir:    ${DATA_DIR}"

# ---------------------------------------------------------------------------
# Step 1: Stop PostgreSQL
# ---------------------------------------------------------------------------
log "INFO" "Step 1: Stopping PostgreSQL instance..."

if pg_isready -q 2>/dev/null; then
    pg_ctlcluster 16 main stop || true
    sleep 2
    log "INFO" "PostgreSQL stopped."
else
    log "INFO" "PostgreSQL is not running."
fi

# ---------------------------------------------------------------------------
# Step 2: Backup current data directory (forensic preservation)
# ---------------------------------------------------------------------------
log "INFO" "Step 2: Backing up current data directory for forensic analysis..."

FORENSIC_BACKUP="${BACKUP_DIR}/forensic_pre_recovery_$(date +%Y%m%d_%H%M%S)"
if [ -d "${DATA_DIR}" ]; then
    mv "${DATA_DIR}" "${FORENSIC_BACKUP}"
    log "INFO" "Current data directory moved to: ${FORENSIC_BACKUP}"
else
    log "INFO" "No existing data directory found."
fi

# ---------------------------------------------------------------------------
# Step 3: Restore base backup
# ---------------------------------------------------------------------------
log "INFO" "Step 3: Restoring base backup..."

# Find the most recent base backup
LATEST_BACKUP=$(find "${BACKUP_DIR}" -maxdepth 1 -type d -name "base_backup_*" | sort -r | head -1)

if [ -z "${LATEST_BACKUP}" ] || [ ! -d "${LATEST_BACKUP}" ]; then
    log "ERROR" "No base backup found in ${BACKUP_DIR}"
    log "ERROR" "Recovery cannot proceed without a base backup."
    exit 1
fi

log "INFO" "Using base backup: ${LATEST_BACKUP}"

# Copy the base backup to the data directory
cp -a "${LATEST_BACKUP}" "${DATA_DIR}"
chown -R "${PG_USER}:${PG_USER}" "${DATA_DIR}"
chmod 700 "${DATA_DIR}"

log "INFO" "Base backup restored to ${DATA_DIR}"

# ---------------------------------------------------------------------------
# Step 4: Configure recovery
# ---------------------------------------------------------------------------
log "INFO" "Step 4: Configuring recovery..."

# Create recovery.signal file (PostgreSQL 12+ uses this instead of recovery.conf)
touch "${DATA_DIR}/recovery.signal"

# Configure postgresql.auto.conf with recovery settings
cat >> "${DATA_DIR}/postgresql.auto.conf" <<EOF

# =============================================================================
# PITR Recovery Configuration
# Generated by restore_to_point_in_time.sh at $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# =============================================================================
restore_command = '/opt/patroni/restore_wal.sh %f %p'
recovery_target_time = '${TARGET_TIME}'
recovery_target_action = 'promote'
# =============================================================================
EOF

log "INFO" "Recovery configuration written to postgresql.auto.conf"
log "INFO" "Recovery target time: ${TARGET_TIME}"

# ---------------------------------------------------------------------------
# Step 5: Create WAL restore script
# ---------------------------------------------------------------------------
log "INFO" "Step 5: Creating WAL restore script..."

cat > /opt/patroni/restore_wal.sh <<'RESTORE_SCRIPT'
#!/usr/bin/env bash
# =============================================================================
# WAL Restore Script — invoked by PostgreSQL during recovery
# =============================================================================
# Decrypts and restores WAL segments from the encrypted archive.
#
# Arguments:
#   $1 = WAL segment filename (%f)
#   $2 = destination path (%p)
# =============================================================================

set -euo pipefail

WAL_FILE="$1"
DEST_PATH="$2"

ARCHIVE_DIR="${WAL_ARCHIVE_DIR:-/wal_archive}"
GPG_HOME="${WAL_GPG_HOME:-/opt/patroni/.gnupg}"
GPG_OPTS="--batch --yes --trust-model always --homedir ${GPG_HOME}"

ENCRYPTED_FILE="${ARCHIVE_DIR}/${WAL_FILE}.gpg"

if [ -f "${ENCRYPTED_FILE}" ]; then
    # Decrypt the WAL segment to the destination
    if gpg ${GPG_OPTS} --decrypt --output "${DEST_PATH}" "${ENCRYPTED_FILE}" 2>/dev/null; then
        chmod 600 "${DEST_PATH}"
        exit 0
    else
        echo "ERROR: GPG decryption failed for ${WAL_FILE}" >&2
        exit 1
    fi
else
    # Check if this is a WAL segment that doesn't exist in the archive
    # (e.g., a segment that was never archived)
    exit 1
fi
RESTORE_SCRIPT

chmod +x /opt/patroni/restore_wal.sh
log "INFO" "WAL restore script created at /opt/patroni/restore_wal.sh"

# ---------------------------------------------------------------------------
# Step 6: Start PostgreSQL in recovery mode
# ---------------------------------------------------------------------------
log "INFO" "Step 6: Starting PostgreSQL in recovery mode..."

su - "${PG_USER}" -c "pg_ctlcluster 16 main start" || {
    log "ERROR" "Failed to start PostgreSQL in recovery mode."
    exit 1
}

log "INFO" "PostgreSQL started in recovery mode."

# ---------------------------------------------------------------------------
# Step 7: Monitor recovery progress
# ---------------------------------------------------------------------------
log "INFO" "Step 7: Monitoring recovery progress..."

MAX_WAIT=300  # 5 minutes maximum wait
ELAPSED=0
SLEEP_INTERVAL=5

while [ ${ELAPSED} -lt ${MAX_WAIT} ]; do
    # Check if recovery is complete
    if su - "${PG_USER}" -c "psql -tAc 'SELECT pg_is_in_recovery()'" 2>/dev/null | grep -q 'f'; then
        log "INFO" "Recovery complete! Database is now in read/write mode."
        break
    fi

    # Check for errors
    if su - "${PG_USER}" -c "psql -tAc 'SELECT pg_last_error()'" 2>/dev/null | grep -qi 'error'; then
        log "ERROR" "Recovery encountered an error."
        exit 1
    fi

    log "INFO" "Recovery in progress... (${ELAPSED}s elapsed)"
    sleep ${SLEEP_INTERVAL}
    ELAPSED=$((ELAPSED + SLEEP_INTERVAL))
done

if [ ${ELAPSED} -ge ${MAX_WAIT} ]; then
    log "ERROR" "Recovery timed out after ${MAX_WAIT} seconds."
    exit 1
fi

# ---------------------------------------------------------------------------
# Step 8: Verify recovery
# ---------------------------------------------------------------------------
log "INFO" "Step 8: Verifying recovery..."

# Check that the database is accessible
if su - "${PG_USER}" -c "psql -tAc 'SELECT 1'" 2>/dev/null | grep -q '1'; then
    log "INFO" "Database is accessible."
else
    log "ERROR" "Database is not accessible after recovery."
    exit 1
fi

# Check the recovery target time
RECOVERY_TARGET=$(su - "${PG_USER}" -c "psql -tAc \"SELECT pg_settings.setting FROM pg_settings WHERE name = 'recovery_target_time'\"" 2>/dev/null | tr -d ' ')
log "INFO" "Recovery target time: ${RECOVERY_TARGET}"

# Check the current transaction timestamp
CURRENT_TIME=$(su - "${PG_USER}" -c "psql -tAc 'SELECT now()'" 2>/dev/null | tr -d ' ')
log "INFO" "Current database time: ${CURRENT_TIME}"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
log "INFO" "=========================================="
log "INFO" "Point-in-Time Recovery Complete"
log "INFO" "=========================================="
log "INFO" "Target time: ${TARGET_TIME}"
log "INFO" "Log file:    ${LOG_FILE}"
log "INFO" ""
log "INFO" "Next steps:"
log "INFO" "  1. Verify data integrity: psql -c 'SELECT count(*) FROM universal_breakdown_nodes;'"
log "INFO" "  2. Check ForensicAuditLog chain: psql -c 'SELECT * FROM forensic_audit_logs ORDER BY created_at DESC LIMIT 5;'"
log "INFO" "  3. Re-enable WAL archiving if needed."
log "INFO" "  4. Remove recovery.signal if recovery is complete: rm ${DATA_DIR}/recovery.signal"

exit 0
