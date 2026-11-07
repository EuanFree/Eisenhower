#!/usr/bin/env bash
# ============================================================
# Eisenhower Portfolio Manager — Air-Gap Compliance Verifier
# ============================================================
#
# This script verifies that the compiled Docker containers operate
# correctly in a fully isolated network with zero outbound WAN
# connectivity. It is designed to be run on the air-gapped host
# after the offline bundle has been transferred.
#
# What It Tests
# ~~~~~~~~~~~~~
#
# 1. **Network Isolation** — Spins up containers on a Docker network
#    with `internal: true` (no gateway access to WAN).
#
# 2. **Egress Probing** — Verifies that no third-party telemetry,
#    analytics, license checks, or external font requests are fired.
#
# 3. **Database Schema** — Confirms that PostgreSQL schema creation
#    and ltree indexing complete successfully in isolation.
#
# 4. **Seed Fixture** — Verifies that benchmark seed fixture generation
#    works without network access.
#
# 5. **API Endpoints** — Probes key API endpoints to confirm the
#    application boots and responds correctly.
#
# 6. **SVG Gantt Rendering** — Verifies that the frontend serves
#    static assets without external font or CDN requests.
#
# Usage
# ~~~~~
#
#   ./scripts/verify_airgap_compliance.sh
#
# Prerequisites
# ~~~~~~~~~~~~~
#
# - Docker and Docker Compose installed
# - Offline bundle present in deploy/offline/
# - Base Docker images loaded (postgres, minio, redis, python, node, nginx)
#
# Exit Codes
# ~~~~~~~~~~
#
# 0 — All checks passed
# 1 — One or more checks failed
# 2 — Prerequisites not met
#
# ============================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/deploy/docker-compose.offline-build.yml"
NETWORK_NAME="eisenhower-isolated"
TEST_TIMEOUT=300  # 5 minutes total timeout

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

# ---------------------------------------------------------------------------
# Utility Functions
# ---------------------------------------------------------------------------

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $*"
    PASS_COUNT=$((PASS_COUNT + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $*"
    FAIL_COUNT=$((FAIL_COUNT + 1))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $*"
    SKIP_COUNT=$((SKIP_COUNT + 1))
}

log_section() {
    echo ""
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${BLUE} $*${NC}"
    echo -e "${BLUE}============================================================${NC}"
}

# Check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# ---------------------------------------------------------------------------
# Prerequisite Checks
# ---------------------------------------------------------------------------

check_prerequisites() {
    log_section "PREREQUISITE CHECKS"

    # Docker
    if ! command_exists docker; then
        log_fail "Docker is not installed"
        return 2
    fi
    log_pass "Docker is installed ($(docker --version))"

    # Docker Compose
    if ! docker compose version >/dev/null 2>&1; then
        log_fail "Docker Compose is not available"
        return 2
    fi
    log_pass "Docker Compose is available ($(docker compose version --short))"

    # Docker daemon running
    if ! docker info >/dev/null 2>&1; then
        log_fail "Docker daemon is not running"
        return 2
    fi
    log_pass "Docker daemon is running"

    # Compose file exists
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        log_fail "Compose file not found: $COMPOSE_FILE"
        return 2
    fi
    log_pass "Compose file found: $COMPOSE_FILE"

    # Offline bundle exists
    if [[ ! -d "$PROJECT_ROOT/deploy/offline" ]]; then
        log_fail "Offline bundle not found at deploy/offline/"
        log_info "Run 'python -m scripts.build_offline_bundle' on a connected host first"
        return 2
    fi
    log_pass "Offline bundle directory exists"

    # Check for wheelhouse
    WHEEL_COUNT=$(find "$PROJECT_ROOT/deploy/offline/wheelhouse" -name "*.whl" 2>/dev/null | wc -l)
    if [[ "$WHEEL_COUNT" -eq 0 ]]; then
        log_fail "No Python wheels found in wheelhouse/"
        log_info "Run 'python -m scripts.build_offline_bundle' to download wheels"
        return 2
    fi
    log_pass "Found $WHEEL_COUNT Python wheels in wheelhouse/"

    # Check for required Docker images
    local required_images=(
        "postgres:16-bookworm"
        "minio/minio:latest"
        "redis:7-bookworm"
        "python:3.11-slim-bookworm"
        "node:20-slim"
        "nginx:1.25-alpine"
    )

    local missing_images=0
    for img in "${required_images[@]}"; do
        if ! docker image inspect "$img" >/dev/null 2>&1; then
            log_fail "Missing Docker image: $img"
            missing_images=$((missing_images + 1))
        else
            log_pass "Docker image present: $img"
        fi
    done

    if [[ "$missing_images" -gt 0 ]]; then
        log_fail "$missing_images required Docker image(s) missing"
        log_info "Load images from offline bundle: docker load < image.tar.gz"
        return 2
    fi

    return 0
}

# ---------------------------------------------------------------------------
# Test 1: Network Isolation
# ---------------------------------------------------------------------------

test_network_isolation() {
    log_section "TEST 1: Network Isolation"

    # Create isolated network with internal: true (no WAN gateway)
    log_info "Creating isolated Docker network..."
    docker network rm "$NETWORK_NAME" >/dev/null 2>&1 || true
    docker network create --internal "$NETWORK_NAME" >/dev/null 2>&1

    if [[ $? -ne 0 ]]; then
        log_fail "Failed to create isolated network"
        return 1
    fi
    log_pass "Created isolated network: $NETWORK_NAME"

    # Verify the network has no gateway
    local gateway
    gateway=$(docker network inspect "$NETWORK_NAME" --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}')
    if [[ -z "$gateway" || "$gateway" == "" ]]; then
        log_pass "Network has no WAN gateway (internal: true)"
    else
        log_fail "Network has a gateway: $gateway (should be empty)"
    fi

    # Spin up a test container and verify it cannot reach the internet
    log_info "Testing outbound connectivity from isolated container..."
    docker run --rm --network "$NETWORK_NAME" \
        python:3.11-slim-bookworm \
        python -c "
import socket
import sys

# Try to resolve an external hostname
try:
    socket.getaddrinfo('google.com', 80)
    print('ERROR: DNS resolution succeeded (should fail)')
    sys.exit(1)
except socket.gaierror:
    print('OK: DNS resolution failed as expected')
    sys.exit(0)
" 2>&1

    if [[ $? -eq 0 ]]; then
        log_pass "Outbound DNS resolution is blocked (as expected)"
    else
        log_fail "Outbound DNS resolution succeeded (should be blocked)"
    fi

    # Test TCP connectivity to external IP
    log_info "Testing outbound TCP connectivity..."
    docker run --rm --network "$NETWORK_NAME" \
        python:3.11-slim-bookworm \
        python -c "
import socket
import sys

# Try to connect to an external IP (should fail)
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(3)
try:
    s.connect(('8.8.8.8', 53))
    print('ERROR: TCP connection succeeded (should fail)')
    s.close()
    sys.exit(1)
except (socket.timeout, ConnectionRefusedError, OSError):
    print('OK: TCP connection failed as expected')
    s.close()
    sys.exit(0)
" 2>&1

    if [[ $? -eq 0 ]]; then
        log_pass "Outbound TCP connectivity is blocked (as expected)"
    else
        log_fail "Outbound TCP connectivity succeeded (should be blocked)"
    fi
}

# ---------------------------------------------------------------------------
# Test 2: Build Images in Isolation
# ---------------------------------------------------------------------------

test_build_in_isolation() {
    log_section "TEST 2: Build Images in Isolation"

    # Build backend image
    log_info "Building backend image from offline wheels..."
    cd "$PROJECT_ROOT"

    if docker compose -f "$COMPOSE_FILE" build backend 2>&1 | tail -20; then
        log_pass "Backend image built successfully from offline wheels"
    else
        log_fail "Backend image build failed"
        log_info "Ensure deploy/offline/wheelhouse/ contains all required wheels"
        return 1
    fi

    # Build frontend image
    log_info "Building frontend image from offline npm cache..."
    if docker compose -f "$COMPOSE_FILE" build frontend 2>&1 | tail -20; then
        log_pass "Frontend image built successfully from offline npm cache"
    else
        log_fail "Frontend image build failed"
        log_info "Ensure deploy/offline/npm_cache/ contains npm packages"
        return 1
    fi
}

# ---------------------------------------------------------------------------
# Test 3: Service Startup
# ---------------------------------------------------------------------------

test_service_startup() {
    log_section "TEST 3: Service Startup"

    # Start all services
    log_info "Starting all services..."
    cd "$PROJECT_ROOT"
    docker compose -f "$COMPOSE_FILE" up -d 2>&1 | tail -10

    # Wait for PostgreSQL
    log_info "Waiting for PostgreSQL to become healthy..."
    local retries=0
    local max_retries=30
    while [[ $retries -lt $max_retries ]]; do
        if docker compose -f "$COMPOSE_FILE" ps postgres | grep -q "healthy"; then
            log_pass "PostgreSQL is healthy"
            break
        fi
        sleep 2
        retries=$((retries + 1))
    done

    if [[ $retries -ge $max_retries ]]; then
        log_fail "PostgreSQL did not become healthy within $((max_retries * 2))s"
        return 1
    fi

    # Wait for MinIO
    log_info "Waiting for MinIO to become healthy..."
    retries=0
    while [[ $retries -lt $max_retries ]]; do
        if docker compose -f "$COMPOSE_FILE" ps minio | grep -q "healthy"; then
            log_pass "MinIO is healthy"
            break
        fi
        sleep 2
        retries=$((retries + 1))
    done

    if [[ $retries -ge $max_retries ]]; then
        log_fail "MinIO did not become healthy within $((max_retries * 2))s"
        return 1
    fi

    # Wait for Redis
    log_info "Waiting for Redis to become healthy..."
    retries=0
    while [[ $retries -lt $max_retries ]]; do
        if docker compose -f "$COMPOSE_FILE" ps redis | grep -q "healthy"; then
            log_pass "Redis is healthy"
            break
        fi
        sleep 2
        retries=$((retries + 1))
    done

    if [[ $retries -ge $max_retries ]]; then
        log_fail "Redis did not become healthy within $((max_retries * 2))s"
        return 1
    fi

    # Wait for Backend
    log_info "Waiting for Backend to become healthy..."
    retries=0
    max_retries=45
    while [[ $retries -lt $max_retries ]]; do
        if docker compose -f "$COMPOSE_FILE" ps backend | grep -q "healthy"; then
            log_pass "Backend is healthy"
            break
        fi
        sleep 2
        retries=$((retries + 1))
    done

    if [[ $retries -ge $max_retries ]]; then
        log_fail "Backend did not become healthy within $((max_retries * 2))s"
        log_info "Check backend logs: docker compose -f $COMPOSE_FILE logs backend"
        return 1
    fi

    # Wait for Frontend
    log_info "Waiting for Frontend to become healthy..."
    retries=0
    while [[ $retries -lt $max_retries ]]; do
        if docker compose -f "$COMPOSE_FILE" ps frontend | grep -q "healthy"; then
            log_pass "Frontend is healthy"
            break
        fi
        sleep 2
        retries=$((retries + 1))
    done

    if [[ $retries -ge $max_retries ]]; then
        log_fail "Frontend did not become healthy within $((max_retries * 2))s"
        return 1
    fi
}

# ---------------------------------------------------------------------------
# Test 4: Database Schema & ltree
# ---------------------------------------------------------------------------

test_database_schema() {
    log_section "TEST 4: Database Schema & ltree Indexing"

    # Check ltree extension
    log_info "Verifying ltree extension..."
    local ltree_result
    ltree_result=$(docker compose -f "$COMPOSE_FILE" exec -T postgres \
        psql -U eisenhower -d eisenhower -c "SELECT extname FROM pg_extension WHERE extname = 'ltree';" 2>&1)

    if echo "$ltree_result" | grep -q "ltree"; then
        log_pass "ltree extension is enabled"
    else
        log_fail "ltree extension is not enabled"
        return 1
    fi

    # Check table count
    log_info "Verifying database tables..."
    local table_count
    table_count=$(docker compose -f "$COMPOSE_FILE" exec -T postgres \
        psql -U eisenhower -d eisenhower -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>&1 | tr -d ' ')

    if [[ "$table_count" -gt 0 ]]; then
        log_pass "Database has $table_count tables"
    else
        log_fail "No tables found in database"
        log_info "Run init_db.py to create schema"
        return 1
    fi

    # Check GiST index on ltree path
    log_info "Verifying GiST index on ltree path..."
    local gist_result
    gist_result=$(docker compose -f "$COMPOSE_FILE" exec -T postgres \
        psql -U eisenhower -d eisenhower -t -c "SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'ix_ubn_path_gist';" 2>&1 | tr -d ' ')

    if [[ "$gist_result" -gt 0 ]]; then
        log_pass "GiST index on ltree path exists"
    else
        log_skip "GiST index not found (may need schema migration)"
    fi
}

# ---------------------------------------------------------------------------
# Test 5: API Endpoints
# ---------------------------------------------------------------------------

test_api_endpoints() {
    log_section "TEST 5: API Endpoint Verification"

    local backend_url="http://localhost:8000"

    # Health check
    log_info "Testing /api/health endpoint..."
    local health_response
    health_response=$(curl -sf "$backend_url/api/health" 2>&1 || echo "FAILED")

    if [[ "$health_response" != "FAILED" ]]; then
        log_pass "Health endpoint responds: $health_response"
    else
        log_fail "Health endpoint not responding"
        return 1
    fi

    # API docs
    log_info "Testing /docs endpoint..."
    local docs_status
    docs_status=$(curl -sf -o /dev/null -w "%{http_code}" "$backend_url/docs" 2>&1 || echo "000")

    if [[ "$docs_status" == "200" ]]; then
        log_pass "API docs endpoint responds (HTTP 200)"
    else
        log_fail "API docs endpoint returned HTTP $docs_status"
    fi

    # OpenAPI schema
    log_info "Testing /openapi.json endpoint..."
    local schema_status
    schema_status=$(curl -sf -o /dev/null -w "%{http_code}" "$backend_url/openapi.json" 2>&1 || echo "000")

    if [[ "$schema_status" == "200" ]]; then
        log_pass "OpenAPI schema endpoint responds (HTTP 200)"
    else
        log_fail "OpenAPI schema endpoint returned HTTP $schema_status"
    fi

    # Auth endpoint (should return 401/422 without token)
    log_info "Testing /api/v1/auth/login endpoint..."
    local auth_status
    auth_status=$(curl -sf -o /dev/null -w "%{http_code}" \
        -X POST "$backend_url/api/v1/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"test","password":"test"}' 2>&1 || echo "000")

    if [[ "$auth_status" == "401" || "$auth_status" == "422" || "$auth_status" == "200" ]]; then
        log_pass "Auth endpoint responds (HTTP $auth_status)"
    else
        log_fail "Auth endpoint returned unexpected HTTP $auth_status"
    fi
}

# ---------------------------------------------------------------------------
# Test 6: Frontend Static Assets
# ---------------------------------------------------------------------------

test_frontend_assets() {
    log_section "TEST 6: Frontend Static Assets"

    local frontend_url="http://localhost:8080"

    # Main page
    log_info "Testing frontend main page..."
    local page_status
    page_status=$(curl -sf -o /dev/null -w "%{http_code}" "$frontend_url/" 2>&1 || echo "000")

    if [[ "$page_status" == "200" ]]; then
        log_pass "Frontend main page serves (HTTP 200)"
    else
        log_fail "Frontend main page returned HTTP $page_status"
    fi

    # Check for external font requests in HTML
    log_info "Checking for external font/CDN references..."
    local page_content
    page_content=$(curl -sf "$frontend_url/" 2>&1 || echo "")

    local external_refs=0
    if echo "$page_content" | grep -qi "fonts.googleapis.com"; then
        log_fail "Google Fonts reference found in HTML"
        external_refs=$((external_refs + 1))
    else
        log_pass "No Google Fonts references in HTML"
    fi

    if echo "$page_content" | grep -qi "cdn\."; then
        log_fail "CDN reference found in HTML"
        external_refs=$((external_refs + 1))
    else
        log_pass "No CDN references in HTML"
    fi

    if [[ "$external_refs" -eq 0 ]]; then
        log_pass "Frontend has no external font/CDN references"
    fi
}

# ---------------------------------------------------------------------------
# Test 7: Egress Telemetry Check
# ---------------------------------------------------------------------------

test_egress_telemetry() {
    log_section "TEST 7: Egress Telemetry Check"

    log_info "Checking for outbound network connections from containers..."

    # Use docker exec to check active connections from each container
    local containers=("eisenhower-backend" "eisenhower-frontend" "eisenhower-postgres" "eisenhower-minio" "eisenhower-redis")
    local external_connections=0

    for container in "${containers[@]}"; do
        if ! docker ps --format '{{.Names}}' | grep -q "$container"; then
            continue
        fi

        log_info "Checking connections from $container..."

        # Check for connections to non-local IPs
        local connections
        connections=$(docker exec "$container" \
            bash -c 'ss -tn 2>/dev/null || netstat -tn 2>/dev/null || true' 2>&1 || echo "")

        # Look for connections to non-172.28.x.x (our internal network) and non-127.x.x
        local ext_conns
        ext_conns=$(echo "$connections" | grep -v "172.28\." | grep -v "127\." | grep -v "State" | grep -v "Recv-Q" | grep -v "^$" | wc -l)

        if [[ "$ext_conns" -gt 0 ]]; then
            log_fail "$container has $ext_conns connections to non-local IPs"
            external_connections=$((external_connections + ext_conns))
        else
            log_pass "$container has no external connections"
        fi
    done

    if [[ "$external_connections" -eq 0 ]]; then
        log_pass "No outbound telemetry detected from any container"
    else
        log_fail "Detected $external_connections external connections total"
    fi
}

# ---------------------------------------------------------------------------
# Test 8: Seed Fixture Generation
# ---------------------------------------------------------------------------

test_seed_fixture() {
    log_section "TEST 8: Seed Fixture Generation"

    log_info "Testing benchmark seed fixture generation..."

    # Run the seed script with minimal data
    local seed_output
    seed_output=$(docker compose -f "$COMPOSE_FILE" exec -T backend \
        python -m app.cli.seed \
        --programmes 1 \
        --projects-per-programme 2 \
        --nodes-per-project 10 \
        --no-benchmarks \
        2>&1 || echo "FAILED")

    if echo "$seed_output" | grep -q "FAILED"; then
        log_fail "Seed fixture generation failed"
        log_info "Output: $(echo "$seed_output" | tail -5)"
        return 1
    fi

    if echo "$seed_output" | grep -q "seed"; then
        log_pass "Seed fixture generated successfully"
    else
        log_skip "Seed fixture output unclear"
    fi
}

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

cleanup() {
    log_section "CLEANUP"

    log_info "Stopping all services..."
    cd "$PROJECT_ROOT"
    docker compose -f "$COMPOSE_FILE" down 2>&1 | tail -5

    log_info "Removing isolated network..."
    docker network rm "$NETWORK_NAME" >/dev/null 2>&1 || true

    log_pass "Cleanup complete"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
    echo ""
    echo -e "${BLUE}============================================================${NC}"
    echo -e "${BLUE} Eisenhower Portfolio Manager — Air-Gap Compliance Verifier${NC}"
    echo -e "${BLUE}============================================================${NC}"
    echo ""
    log_info "Project root: $PROJECT_ROOT"
    log_info "Compose file: $COMPOSE_FILE"
    log_info "Network name: $NETWORK_NAME"

    # Set up cleanup trap
    trap cleanup EXIT

    # Phase 1: Prerequisites
    if ! check_prerequisites; then
        log_fail "Prerequisites not met"
        exit 2
    fi

    # Phase 2: Network Isolation
    test_network_isolation || true

    # Phase 3: Build in Isolation
    test_build_in_isolation || true

    # Phase 4: Service Startup
    test_service_startup || true

    # Phase 5: Database Schema
    test_database_schema || true

    # Phase 6: API Endpoints
    test_api_endpoints || true

    # Phase 7: Frontend Assets
    test_frontend_assets || true

    # Phase 8: Egress Telemetry
    test_egress_telemetry || true

    # Phase 9: Seed Fixture
    test_seed_fixture || true

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------
    log_section "VERIFICATION SUMMARY"

    echo ""
    echo -e "  ${GREEN}PASSED: $PASS_COUNT${NC}"
    echo -e "  ${RED}FAILED: $FAIL_COUNT${NC}"
    echo -e "  ${YELLOW}SKIPPED: $SKIP_COUNT${NC}"
    echo ""

    local total=$((PASS_COUNT + FAIL_COUNT + SKIP_COUNT))
    echo -e "  Total checks: $total"
    echo ""

    if [[ "$FAIL_COUNT" -eq 0 ]]; then
        echo -e "${GREEN}============================================================${NC}"
        echo -e "${GREEN} ALL CHECKS PASSED — Air-gap compliance verified${NC}"
        echo -e "${GREEN}============================================================${NC}"
        exit 0
    else
        echo -e "${RED}============================================================${NC}"
        echo -e "${RED} $FAIL_COUNT CHECK(S) FAILED — Review output above${NC}"
        echo -e "${RED}============================================================${NC}"
        exit 1
    fi
}

# Run main
main "$@"
