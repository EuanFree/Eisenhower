#!/usr/bin/env bash
# ============================================================
# Eisenhower Portfolio Manager — Offline Vendor Bundle Script
# ============================================================
#
# Downloads and caches all Python wheels, npm packages, and base
# container images onto a local staging volume for transfer into
# air-gapped environments via optical media or USB diodes.
#
# USAGE:
#   # Run on a build host with internet access
#   ./scripts/vendor_offline_bundle.sh --output /mnt/usb-diode/bundle
#
#   # Transfer the bundle to the air-gapped host
#   # Then load it:
#   ./scripts/bootstrap_airgap.sh --bundle /mnt/usb-diode/bundle
#
# OUTPUT STRUCTURE:
#   bundle/
#   ├── python-wheels/          # All Python package wheels
#   │   ├── requirements.txt
#   │   ├── *.whl
#   ├── npm-packages/           # npm cache tarball
#   │   ├── package.json
#   │   ├── npm-cache.tar.gz
#   ├── docker-images/          # Saved Docker images
#   │   ├── python-3.11-slim.tar
#   │   ├── node-20-slim.tar
#   │   ├── nginx-1.25-alpine.tar
#   │   ├── postgres-16-bookworm.tar
#   │   ├── minio-latest.tar
#   │   └── redis-7-bookworm.tar
#   ├── manifest.json           # Bundle metadata and checksums
#   └── checksums.sha256        # SHA-256 checksums for verification
#
# PREREQUISITES:
#   - Docker installed and running
#   - Python 3.11+ with pip
#   - Node.js 20+ with npm
#   - Sufficient disk space (~10GB for full bundle)
# ============================================================

set -euo pipefail

# -----------------------------------------------------------
# Configuration
# -----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR=""
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
MANIFEST_FILE=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "Required command '$1' not found. Please install it."
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
    echo "  --output DIR       Output directory for the bundle (required)"
    echo "  --skip-docker      Skip Docker image download (saves ~8GB)"
    echo "  --skip-npm         Skip npm package download (saves ~200MB)"
    echo "  --skip-python      Skip Python wheel download (saves ~500MB)"
    echo "  --help             Show this help message"
    echo ""
    echo "Example:"
    echo "  $0 --output /mnt/usb-diode/bundle"
}

SKIP_DOCKER=false
SKIP_NPM=false
SKIP_PYTHON=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --skip-docker)
            SKIP_DOCKER=true
            shift
            ;;
        --skip-npm)
            SKIP_NPM=true
            shift
            ;;
        --skip-python)
            SKIP_PYTHON=true
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

if [[ -z "$OUTPUT_DIR" ]]; then
    log_error "Output directory is required. Use --output DIR"
    usage
    exit 1
fi

# -----------------------------------------------------------
# Pre-flight checks
# -----------------------------------------------------------
log_info "Eisenhower Portfolio Manager — Offline Vendor Bundle"
log_info "===================================================="
log_info "Timestamp: $TIMESTAMP"
log_info "Output: $OUTPUT_DIR"
echo ""

check_command docker
check_command python3
check_command pip3
check_command npm

# Create output directory structure
mkdir -p "$OUTPUT_DIR"/{python-wheels,npm-packages,docker-images}
MANIFEST_FILE="$OUTPUT_DIR/manifest.json"

# -----------------------------------------------------------
# Step 1: Python wheels
# -----------------------------------------------------------
if [[ "$SKIP_PYTHON" == false ]]; then
    log_info "Step 1/3: Downloading Python wheels..."

    WHEELS_DIR="$OUTPUT_DIR/python-wheels"
    cp "$PROJECT_ROOT/requirements.txt" "$WHEELS_DIR/"

    # Create a temporary virtual environment for wheel building
    TEMP_VENV="$(mktemp -d)"
    python3 -m venv "$TEMP_VENV"
    source "$TEMP_VENV/bin/activate"

    # Download all wheels (including dependencies)
    pip3 wheel \
        --wheel-dir="$WHEELS_DIR" \
        --no-deps \
        -r "$WHEELS_DIR/requirements.txt" 2>&1 | tail -5

    # Also download transitive dependencies
    pip3 download \
        --dest="$WHEELS_DIR" \
        --no-deps \
        -r "$WHEELS_DIR/requirements.txt" 2>&1 | tail -5

    # Count wheels
    WHEEL_COUNT=$(find "$WHEELS_DIR" -name "*.whl" | wc -l)
    WHEEL_SIZE=$(du -sh "$WHEELS_DIR" | cut -f1)

    log_success "Downloaded $WHEEL_COUNT Python wheels ($WHEEL_SIZE)"

    # Cleanup
    deactivate
    rm -rf "$TEMP_VENV"
else
    log_warn "Skipping Python wheel download (--skip-python)"
fi

# -----------------------------------------------------------
# Step 2: npm packages
# -----------------------------------------------------------
if [[ "$SKIP_NPM" == false ]]; then
    log_info "Step 2/3: Downloading npm packages..."

    NPM_DIR="$OUTPUT_DIR/npm-packages"

    if [[ -f "$PROJECT_ROOT/frontend/package.json" ]]; then
        cp "$PROJECT_ROOT/frontend/package.json" "$NPM_DIR/"

        # Create a temporary directory for npm install
        TEMP_NPM="$(mktemp -d)"
        cp "$PROJECT_ROOT/frontend/package.json" "$TEMP_NPM/"

        # Download all packages to cache
        (cd "$TEMP_NPM" && npm install --cache "$TEMP_NPM/.npm-cache" 2>&1 | tail -5)

        # Tar the cache
        (cd "$TEMP_NPM" && tar czf "$NPM_DIR/npm-cache.tar.gz" .npm-cache node_modules 2>/dev/null || true)

        NPM_SIZE=$(du -sh "$NPM_DIR" | cut -f1)
        log_success "Downloaded npm packages ($NPM_SIZE)"

        # Cleanup
        rm -rf "$TEMP_NPM"
    else
        log_warn "No frontend/package.json found. Skipping npm packages."
    fi
else
    log_warn "Skipping npm package download (--skip-npm)"
fi

# -----------------------------------------------------------
# Step 3: Docker base images
# -----------------------------------------------------------
if [[ "$SKIP_DOCKER" == false ]]; then
    log_info "Step 3/3: Pulling and saving Docker base images..."

    IMAGES_DIR="$OUTPUT_DIR/docker-images"

    # Define base images to pull
    declare -a BASE_IMAGES=(
        "python:3.11-slim-bookworm"
        "node:20-slim"
        "nginx:1.25-alpine"
        "postgres:16-bookworm"
        "minio/minio:latest"
        "redis:7-bookworm"
    )

    for image in "${BASE_IMAGES[@]}"; do
        # Generate filename from image name
        IMAGE_NAME=$(echo "$image" | sed 's|[:/]|-|g')
        IMAGE_FILE="$IMAGES_DIR/${IMAGE_NAME}.tar"

        log_info "Pulling $image..."
        docker pull "$image" 2>&1 | tail -2

        log_info "Saving $image to $IMAGE_FILE..."
        docker save "$image" | gzip > "$IMAGE_FILE" 2>&1

        IMAGE_SIZE=$(du -sh "$IMAGE_FILE" | cut -f1)
        log_success "Saved $image ($IMAGE_SIZE)"
    done

    DOCKER_SIZE=$(du -sh "$IMAGES_DIR" | cut -f1)
    log_success "All Docker images saved ($DOCKER_SIZE total)"
else
    log_warn "Skipping Docker image download (--skip-docker)"
fi

# -----------------------------------------------------------
# Generate manifest and checksums
# -----------------------------------------------------------
log_info "Generating bundle manifest..."

# Create manifest
cat > "$MANIFEST_FILE" << MANIFEST_EOF
{
    "bundle_version": "1.0.0",
    "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "timestamp": "$TIMESTAMP",
    "project": "Eisenhower Portfolio Manager",
    "components": {
        "python_wheels": {
            "included": $( [[ "$SKIP_PYTHON" == false ]] && echo "true" || echo "false" ),
            "directory": "python-wheels/"
        },
        "npm_packages": {
            "included": $( [[ "$SKIP_NPM" == false ]] && echo "true" || echo "false" ),
            "directory": "npm-packages/"
        },
        "docker_images": {
            "included": $( [[ "$SKIP_DOCKER" == false ]] && echo "true" || echo "false" ),
            "directory": "docker-images/",
            "images": [
                "python-3.11-slim-bookworm.tar",
                "node-20-slim.tar",
                "nginx-1.25-alpine.tar",
                "postgres-16-bookworm.tar",
                "minio-minio-latest.tar",
                "redis-7-bookworm.tar"
            ]
        }
    },
    "total_size": "$(du -sh "$OUTPUT_DIR" | cut -f1)",
    "checksums_file": "checksums.sha256"
}
MANIFEST_EOF

# Generate SHA-256 checksums
log_info "Computing SHA-256 checksums..."
(
    cd "$OUTPUT_DIR"
    find . -type f \
        ! -name "manifest.json" \
        ! -name "checksums.sha256" \
        -exec sha256sum {} \; > checksums.sha256 2>/dev/null || true
)

CHECKSUM_COUNT=$(wc -l < "$OUTPUT_DIR/checksums.sha256")
log_success "Generated checksums for $CHECKSUM_COUNT files"

# -----------------------------------------------------------
# Summary
# -----------------------------------------------------------
echo ""
log_info "===================================================="
log_info "Bundle generation complete!"
log_info "===================================================="
echo ""
log_info "Output directory: $OUTPUT_DIR"
log_info "Total size: $(du -sh "$OUTPUT_DIR" | cut -f1)"
log_info "Manifest: $MANIFEST_FILE"
echo ""
log_info "To transfer to an air-gapped environment:"
log_info "  1. Copy $OUTPUT_DIR to optical media or USB diode"
log_info "  2. Transfer to the air-gapped host"
log_info "  3. Run: ./scripts/bootstrap_airgap.sh --bundle $OUTPUT_DIR"
echo ""
log_success "Bundle ready for air-gapped transfer."
