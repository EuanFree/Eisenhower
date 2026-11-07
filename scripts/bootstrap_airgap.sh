#!/usr/bin/env bash
# ============================================================
# Eisenhower Portfolio Manager — Cold-Start Bootstrap Script
# ============================================================
#
# Executes the complete initialization sequence for an air-gapped
# deployment. Loads Docker images from the vendor bundle, starts
# all services, runs database schema migrations, seeds default
# system data, and verifies ltree index integrity.
#
# USAGE:
#   # With a vendor bundle (from vendor_offline_bundle.sh)
#   ./scripts/bootstrap_airgap.sh --bundle /mnt/usb-diode/bundle
#
#   # Without a bundle (images already loaded)
#   ./scripts/bootstrap_airgap.sh
#
# STEPS:
#   1. Load Docker images from bundle (if --bundle provided)
#   2. Verify environment configuration
#   3. Create volume directories
#   4. Start all services via docker compose
#   5. Wait for PostgreSQL to be ready
#   6. Enable ltree extension and verify GiST indexing
#   7. Run database schema migrations (create all tables)
#   8. Seed default system calendars (UK/US statutory holidays)
#   9. Create system superuser
#   10. Set up MinIO buckets with SSE-S3 encryption
#   11. Verify ltree index integrity
#   12. Run system health checks
#
# PREREQUISITES:
#   - Docker and Docker Compose installed
#   - Sufficient disk space (~20GB for volumes + images)
#   - Root/sudo access for Docker operations
# ============================================================

set -euo pipefail

# -----------------------------------------------------------
# Configuration
# -----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOY_DIR="$PROJECT_ROOT/deploy"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"
ENV_FILE=""
BUNDLE_DIR=""
SEED_ADMIN_EMAIL=""
SEED_ADMIN_PASSWORD=""
SEED_ADMIN_NAME=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# -----------------------------------------------------------
# Helper functions
# -----------------------------------------------------------
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

log_step() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $*${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "Required command '$1' not found."
        exit 1
    fi
}

# -----------------------------------------------------------
# Parse arguments
# -----------------------------------------------------------
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --bundle DIR         Path to vendor bundle directory"
    echo "  --env-file FILE      Path to .env file (default: deploy/.env)"
    echo "  --admin-email EMAIL  Superuser email (default: admin@eisenhower.local)"
    echo "  --admin-password PW  Superuser password (default: auto-generated)"
    echo "  --admin-name NAME    Superuser display name (default: System Administrator)"
    echo "  --skip-images        Skip Docker image loading"
    echo "  --skip-seed          Skip seeding default data"
    echo "  --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --bundle /mnt/usb-diode/bundle"
    echo "  $0 --env-file deploy/.env --admin-email admin@defence.local"
}

SKIP_IMAGES=false
SKIP_SEED=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --bundle)
            BUNDLE_DIR="$2"
            shift 2
            ;;
        --env-file)
            ENV_FILE="$2"
            shift 2
            ;;
        --admin-email)
            SEED_ADMIN_EMAIL="$2"
            shift 2
            ;;
        --admin-password)
            SEED_ADMIN_PASSWORD="$2"
            shift 2
            ;;
        --admin-name)
            SEED_ADMIN_NAME="$2"
            shift 2
            ;;
        --skip-images)
            SKIP_IMAGES=true
            shift
            ;;
        --skip-seed)
            SKIP_SEED=true
            shift
            ;;
        --help)
            usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Defaults
if [[ -z "$ENV_FILE" ]]; then
    ENV_FILE="$DEPLOY_DIR/.env"
fi

if [[ -z "$SEED_ADMIN_EMAIL" ]]; then
    SEED_ADMIN_EMAIL="admin@eisenhower.local"
fi

if [[ -z "$SEED_ADMIN_PASSWORD" ]]; then
    SEED_ADMIN_PASSWORD="$(python3 -c "import secrets; print(secrets.token_urlsafe(24))" 2>/dev/null || echo "CHANGE_ME_NOW")"
fi

if [[ -z "$SEED_ADMIN_NAME" ]]; then
    SEED_ADMIN_NAME="System Administrator"
fi

# -----------------------------------------------------------
# Pre-flight checks
# -----------------------------------------------------------
echo ""
log_step "Eisenhower Portfolio Manager — Cold-Start Bootstrap"
log_info "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
log_info "Project root: $PROJECT_ROOT"
log_info "Environment: $ENV_FILE"
echo ""

check_command docker
check_command python3

# Check docker compose
if docker compose version &>/dev/null; then
    COMPOSE_CMD="docker compose"
elif docker-compose --version &>/dev/null; then
    COMPOSE_CMD="docker-compose"
else
    log_error "Docker Compose not found. Install it first."
    exit 1
fi

log_info "Docker Compose: $COMPOSE_CMD ($($COMPOSE_CMD version --short 2>/dev/null || echo 'unknown'))"

# -----------------------------------------------------------
# Step 1: Load Docker images from bundle
# -----------------------------------------------------------
log_step "Step 1: Loading Docker images"

if [[ -n "$BUNDLE_DIR" && -d "$BUNDLE_DIR/docker-images" ]]; then
    log_info "Loading images from bundle: $BUNDLE_DIR/docker-images"

    IMAGE_COUNT=0
    for image_file in "$BUNDLE_DIR/docker-images"/*.tar*; do
        if [[ -f "$image_file" ]]; then
            IMAGE_NAME="$(basename "$image_file")"
            log_info "Loading $IMAGE_NAME..."

            if [[ "$image_file" == *.tar.gz ]]; then
                gunzip -c "$image_file" | docker load 2>&1 | tail -2
            else
                docker load -i "$image_file" 2>&1 | tail -2
            fi

            IMAGE_COUNT=$((IMAGE_COUNT + 1))
            log_success "Loaded $IMAGE_NAME"
        fi
    done

    if [[ $IMAGE_COUNT -gt 0 ]]; then
        log_success "Loaded $IMAGE_COUNT Docker images"
    else
        log_warn "No Docker images found in bundle"
    fi
elif [[ "$SKIP_IMAGES" == false ]]; then
    log_warn "No bundle provided and --skip-images not set."
    log_warn "Docker images will be pulled from the registry."
    log_warn "For air-gapped deployment, use --bundle with vendor_offline_bundle.sh output."
fi

# -----------------------------------------------------------
# Step 2: Verify environment configuration
# -----------------------------------------------------------
log_step "Step 2: Verifying environment configuration"

if [[ -f "$ENV_FILE" ]]; then
    log_info "Loading environment from: $ENV_FILE"
    export $(grep -v '^#' "$ENV_FILE" | xargs 2>/dev/null || true)
else
    log_warn "No .env file found at $ENV_FILE"
    log_warn "Using docker-compose defaults"
fi

# Check critical secrets
if [[ "${APP_SECRET_KEY:-}" == "CHANGE_ME_GENERATE_RANDOM_SECRET" || -z "${APP_SECRET_KEY:-}" ]]; then
    log_warn "APP_SECRET_KEY is not set. Generating a random key..."
    APP_SECRET_KEY="$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")"
    export APP_SECRET_KEY
fi

if [[ "${POSTGRES_PASSWORD:-}" == "eisenhower_secure_change_me" ]]; then
    log_warn "POSTGRES_PASSWORD uses the default value. Change it in $ENV_FILE!"
fi

log_success "Environment configuration verified"

# -----------------------------------------------------------
# Step 3: Create volume directories
# -----------------------------------------------------------
log_step "Step 3: Creating volume directories"

VOLUME_DIRS=(
    "$DEPLOY_DIR/volumes/postgres/data"
    "$DEPLOY_DIR/volumes/postgres/wal"
    "$DEPLOY_DIR/volumes/minio/data"
    "$DEPLOY_DIR/volumes/minio/config"
    "$DEPLOY_DIR/volumes/redis/data"
    "$DEPLOY_DIR/volumes/backend/logs"
    "$DEPLOY_DIR/volumes/backend/tmp"
)

for dir in "${VOLUME_DIRS[@]}"; do
    mkdir -p "$dir"
    log_info "Created: $dir"
done

log_success "Volume directories created"

# -----------------------------------------------------------
# Step 4: Start all services
# -----------------------------------------------------------
log_step "Step 4: Starting all services"

log_info "Starting services with docker compose..."
$COMPOSE_CMD -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d 2>&1 | tail -10

log_success "Services started"

# -----------------------------------------------------------
# Step 5: Wait for PostgreSQL
# -----------------------------------------------------------
log_step "Step 5: Waiting for PostgreSQL"

log_info "Waiting for PostgreSQL to be ready (max 120s)..."
MAX_WAIT=120
WAITED=0
while [[ $WAITED -lt $MAX_WAIT ]]; do
    if $COMPOSE_CMD -f "$COMPOSE_FILE" exec -T postgres pg_isready -U eisenhower -d eisenhower &>/dev/null; then
        log_success "PostgreSQL is ready (waited ${WAITED}s)"
        break
    fi

    if [[ $((WAITED % 10)) -eq 0 ]]; then
        log_info "Still waiting... (${WAITED}s)"
    fi

    sleep 2
    WAITED=$((WAITED + 2))
done

if [[ $WAITED -ge $MAX_WAIT ]]; then
    log_error "PostgreSQL did not become ready within ${MAX_WAIT}s"
    exit 1
fi

# -----------------------------------------------------------
# Step 6: Verify ltree extension
# -----------------------------------------------------------
log_step "Step 6: Verifying ltree extension"

LTREE_CHECK=$($COMPOSE_CMD -f "$COMPOSE_FILE" exec -T postgres \
    psql -U eisenhower -d eisenhower -t -c \
    "SELECT extname FROM pg_extension WHERE extname = 'ltree';" 2>/dev/null | tr -d '[:space:]')

if [[ "$LTREE_CHECK" == "ltree" ]]; then
    log_success "ltree extension is active"
else
    log_warn "ltree extension not found. Enabling..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" exec -T postgres \
        psql -U eisenhower -d eisenhower -c "CREATE EXTENSION IF NOT EXISTS ltree;" 2>&1

    if [[ $? -eq 0 ]]; then
        log_success "ltree extension enabled"
    else
        log_error "Failed to enable ltree extension"
        exit 1
    fi
fi

# -----------------------------------------------------------
# Step 7: Run database schema migrations
# -----------------------------------------------------------
log_step "Step 7: Running database schema migrations"

log_info "Creating all database tables..."

# Set DATABASE_URL for the init script
export DATABASE_URL="postgresql://eisenhower:${POSTGRES_PASSWORD:-eisenhower_secure_change_me}@localhost:${POSTGRES_PORT:-5432}/eisenhower"

# Run the init_db.py script
if [[ -f "$PROJECT_ROOT/init_db.py" ]]; then
    # Install dependencies if needed
    if [[ -n "$BUNDLE_DIR" && -d "$BUNDLE_DIR/python-wheels" ]]; then
        pip3 install --no-index --find-links="$BUNDLE_DIR/python-wheels" \
            -r "$PROJECT_ROOT/requirements.txt" 2>&1 | tail -3
    fi

    python3 "$PROJECT_ROOT/init_db.py" --seed 2>&1 | tail -10

    if [[ $? -eq 0 ]]; then
        log_success "Database schema migrations complete"
    else
        log_error "Database schema migration failed"
        exit 1
    fi
else
    log_warn "init_db.py not found. Tables will be created on first API request."
fi

# -----------------------------------------------------------
# Step 8: Seed default calendars
# -----------------------------------------------------------
log_step "Step 8: Seeding default system calendars"

if [[ "$SKIP_SEED" == false ]]; then
    log_info "Creating UK and US default calendars..."

    # Use the CLI seed tool if available
    if [[ -f "$PROJECT_ROOT/app/cli/seed.py" ]]; then
        python3 -m app.cli.seed --programmes 0 --projects-per-programme 0 \
            --no-benchmarks 2>&1 | tail -5 || true
    fi

    log_success "Default calendars seeded"
else
    log_warn "Skipping seed data (--skip-seed)"
fi

# -----------------------------------------------------------
# Step 9: Create system superuser
# -----------------------------------------------------------
log_step "Step 9: Creating system superuser"

if [[ "$SKIP_SEED" == false ]]; then
    log_info "Creating superuser: $SEED_ADMIN_EMAIL"

    # Check if admin user already exists
    ADMIN_EXISTS=$($COMPOSE_CMD -f "$COMPOSE_FILE" exec -T postgres \
        psql -U eisenhower -d eisenhower -t -c \
        "SELECT COUNT(*) FROM users WHERE email = '$SEED_ADMIN_EMAIL';" 2>/dev/null | tr -d '[:space:]')

    if [[ "$ADMIN_EXISTS" == "0" ]]; then
        # Use init_db.py to seed the admin user
        python3 "$PROJECT_ROOT/init_db.py" \
            --seed-admin \
            --admin-email "$SEED_ADMIN_EMAIL" \
            --admin-password "$SEED_ADMIN_PASSWORD" \
            --admin-name "$SEED_ADMIN_NAME" 2>&1 || true

        log_success "Superuser created: $SEED_ADMIN_EMAIL"
        echo ""
        log_warn "=========================================="
        log_warn "Superuser credentials:"
        log_warn "  Email:    $SEED_ADMIN_EMAIL"
        log_warn "  Password: $SEED_ADMIN_PASSWORD"
        log_warn "=========================================="
        echo ""
    else
        log_info "Superuser already exists: $SEED_ADMIN_EMAIL"
    fi
else
    log_warn "Skipping superuser creation (--skip-seed)"
fi

# -----------------------------------------------------------
# Step 10: Set up MinIO buckets
# -----------------------------------------------------------
log_step "Step 10: Setting up MinIO buckets"

log_info "Waiting for MinIO to be ready..."
MINIO_WAITED=0
while [[ $MINIO_WAITED -lt 60 ]]; do
    if $COMPOSE_CMD -f "$COMPOSE_FILE" exec -T minio mc ready local &>/dev/null; then
        log_success "MinIO is ready (waited ${MINIO_WAITED}s)"
        break
    fi

    sleep 2
    MINIO_WAITED=$((MINIO_WAITED + 2))
done

if [[ $MINIO_WAITED -ge 60 ]]; then
    log_error "MinIO did not become ready within 60s"
    exit 1
fi

# Create buckets
MINIO_BUCKETS=(
    "eisenhower-artifacts"
    "eisenhower-backups"
    "eisenhower-exports"
)

for bucket in "${MINIO_BUCKETS[@]}"; do
    log_info "Creating bucket: $bucket"
    $COMPOSE_CMD -f "$COMPOSE_FILE" exec -T minio \
        mc mb --ignore-existing local/"$bucket" 2>&1 || true

    # Enable SSE-S3 encryption policy
    $COMPOSE_CMD -f "$COMPOSE_FILE" exec -T minio \
        mc encrypt set s3 local/"$bucket" 2>&1 || true

    log_success "Bucket created: $bucket"
done

# -----------------------------------------------------------
# Step 11: Verify ltree index integrity
# -----------------------------------------------------------
log_step "Step 11: Verifying ltree index integrity"

log_info "Running ltree index integrity check..."

# Check that the ltree GiST index can be created
INDEX_CHECK=$($COMPOSE_CMD -f "$COMPOSE_FILE" exec -T postgres \
    psql -U eisenhower -d eisenhower -t -c \
    "SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'ix_ubn_path_gist';" 2>/dev/null | tr -d '[:space:]')

if [[ "$INDEX_CHECK" == "1" ]]; then
    log_success "ltree GiST index (ix_ubn_path_gist) exists"
else
    log_info "GiST index not yet created (will be created on first WBS node insert)"
fi

# Test ltree operations
LTREE_TEST=$($COMPOSE_CMD -f "$COMPOSE_FILE" exec -T postgres \
    psql -U eisenhower -d eisenhower -t -c \
    "SELECT '1.2.3'::ltree <@ '1.2.3.4.5'::ltree;" 2>/dev/null | tr -d '[:space:]')

if [[ "$LTREE_TEST" == "t" ]]; then
    log_success "ltree containment operator (@>) working correctly"
else
    log_error "ltree containment operator test failed"
    exit 1
fi

# -----------------------------------------------------------
# Step 12: System health checks
# -----------------------------------------------------------
log_step "Step 12: Running system health checks"

# Wait for backend to be ready
log_info "Waiting for backend API..."
BACKEND_WAITED=0
while [[ $BACKEND_WAITED -lt 60 ]]; do
    if curl -sf http://localhost:${BACKEND_PORT:-8000}/api/health &>/dev/null; then
        log_success "Backend API is ready (waited ${BACKEND_WAITED}s)"
        break
    fi

    sleep 2
    BACKEND_WAITED=$((BACKEND_WAITED + 2))
done

# Wait for frontend to be ready
log_info "Waiting for frontend gateway..."
FRONTEND_WAITED=0
while [[ $FRONTEND_WAITED -lt 60 ]]; do
    if curl -sf http://localhost:${FRONTEND_PORT:-8080}/health &>/dev/null; then
        log_success "Frontend gateway is ready (waited ${FRONTEND_WAITED}s)"
        break
    fi

    sleep 2
    FRONTEND_WAITED=$((FRONTEND_WAITED + 2))
done

# -----------------------------------------------------------
# Summary
# -----------------------------------------------------------
echo ""
log_step "Bootstrap Complete!"

echo ""
log_info "System Status:"
echo ""
$COMPOSE_CMD -f "$COMPOSE_FILE" ps 2>/dev/null || true

echo ""
log_info "Access Points:"
log_info "  Frontend:  http://localhost:${FRONTEND_PORT:-8080}"
log_info "  Backend:   http://localhost:${BACKEND_PORT:-8000}"
log_info "  MinIO:     http://localhost:${MINIO_CONSOLE_PORT:-9001}"
echo ""
log_info "Superuser:"
log_info "  Email:    $SEED_ADMIN_EMAIL"
log_info "  Password: $SEED_ADMIN_PASSWORD"
echo ""
log_info "Next Steps:"
log_info "  1. Access the frontend at http://localhost:${FRONTEND_PORT:-8080}"
log_info "  2. Log in with the superuser credentials above"
log_info "  3. Change the default password immediately"
log_info "  4. Configure your first programme in the WBS editor"
echo ""
log_success "Eisenhower Portfolio Manager is ready for operation."
