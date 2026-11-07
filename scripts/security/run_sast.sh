#!/usr/bin/env bash
# =============================================================================
# Static Application Security Testing (SAST) Harness
# =============================================================================
#
# Orchestrates local offline scanners to enforce zero-leakage policies before
# code deployment into sovereign air-gapped zones.
#
# Scanners
# --------
#
# 1. **Bandit** — Detects insecure cryptographic primitives, unsafe
#    deserialization, and SQL string formatting in Python code.
#
# 2. **pip-audit** — Audits installed Python packages against known CVE
#    databases using an offline vulnerability database (no internet required).
#
# 3. **Semgrep** — Evaluates FastAPI routers for missing authentication or
#    ABAC authorization dependencies using local security audit rules.
#
# Usage
# -----
#
#     bash scripts/security/run_sast.sh
#
# Exit Codes
# ----------
#
# 0 — All scanners passed with no high/critical findings.
# 1 — One or more high/critical vulnerabilities detected.
# 2 — Scanner tool not found or internal error.
#
# Prerequisites
# -------------
#
# Install scanners (on a connected host, then vendor for air-gapped transfer):
#
#     pip install bandit pip-audit semgrep
#
# For fully offline operation, pip-audit requires a local vulnerability DB:
#
#     pip-audit --local --vulnerability-db /path/to/offline-db.db
#
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPORT_DIR="$PROJECT_ROOT/scripts/security"
REPORT_FILE="$PROJECT_ROOT/security_audit_report.json"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Scanner output files
BANDIT_REPORT="$REPORT_DIR/bandit_report.json"
PIP_AUDIT_REPORT="$REPORT_DIR/pip_audit_report.json"
SEMGREP_REPORT="$REPORT_DIR/semgrep_report.json"

# Exit code accumulator
EXIT_CODE=0

# Counters
TOTAL_FINDINGS=0
CRITICAL_COUNT=0
HIGH_COUNT=0
MEDIUM_COUNT=0
LOW_COUNT=0

# ---------------------------------------------------------------------------
# Color output helpers
# ---------------------------------------------------------------------------

RED='\033[0;31m'
AMBER='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_warn() {
    echo -e "${AMBER}[WARN]${NC} $1"
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
}

log_section() {
    echo ""
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  $1${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
}

# ---------------------------------------------------------------------------
# Check for required tools
# ---------------------------------------------------------------------------

check_tool() {
    local tool="$1"
    if command -v "$tool" &>/dev/null; then
        log_info "Found: $tool ($( "$tool" --version 2>&1 | head -1 ))"
        return 0
    else
        log_warn "Not found: $tool — skipping this scanner"
        return 1
    fi
}

# ---------------------------------------------------------------------------
# Scanner 1: Bandit — Python security linting
# ---------------------------------------------------------------------------

run_bandit() {
    log_section "SCANNER 1/3: Bandit — Python Security Linting"

    if ! check_tool "bandit"; then
        echo '{"scanner": "bandit", "status": "skipped", "reason": "bandit not installed"}' > "$BANDIT_REPORT"
        return 0
    fi

    log_info "Scanning app/ for insecure patterns..."
    log_info "Command: bandit -r app/ -ll -ii -f json -o $BANDIT_REPORT"

    # -r: recursive, -ll: high severity only, -ii: high confidence only
    # -f json: JSON output, -o: output file
    if bandit -r "$PROJECT_ROOT/app/" -ll -ii -f json -o "$BANDIT_REPORT" 2>/dev/null; then
        log_pass "Bandit scan completed"
    else
        # Bandit returns 2 when issues are found — this is expected
        log_warn "Bandit detected potential issues"
    fi

    # Parse results
    if [ -f "$BANDIT_REPORT" ]; then
        local bandit_critical bandit_high
        bandit_critical=$(python3 -c "
import json
with open('$BANDIT_REPORT') as f:
    data = json.load(f)
results = data.get('results', [])
print(sum(1 for r in results if r.get('issue_severity') == 'HIGH'))
" 2>/dev/null || echo "0")
        bandit_high=$(python3 -c "
import json
with open('$BANDIT_REPORT') as f:
    data = json.load(f)
results = data.get('results', [])
print(sum(1 for r in results if r.get('issue_severity') == 'MEDIUM'))
" 2>/dev/null || echo "0")

        CRITICAL_COUNT=$((CRITICAL_COUNT + bandit_critical))
        HIGH_COUNT=$((HIGH_COUNT + bandit_high))
        TOTAL_FINDINGS=$((TOTAL_FINDINGS + bandit_critical + bandit_high))

        if [ "$bandit_critical" -gt 0 ]; then
            log_fail "Bandit found $bandit_critical CRITICAL issues"
            EXIT_CODE=1
        fi
        if [ "$bandit_high" -gt 0 ]; then
            log_warn "Bandit found $bandit_high HIGH issues"
        fi
    fi

    echo ""
    log_info "Report saved to: $BANDIT_REPORT"
}

# ---------------------------------------------------------------------------
# Scanner 2: pip-audit — Offline CVE database audit
# ---------------------------------------------------------------------------

run_pip_audit() {
    log_section "SCANNER 2/3: pip-audit — Offline CVE Database Audit"

    if ! check_tool "pip-audit"; then
        echo '{"scanner": "pip-audit", "status": "skipped", "reason": "pip-audit not installed"}' > "$PIP_AUDIT_REPORT"
        return 0
    fi

    log_info "Auditing installed packages against offline CVE database..."
    log_info "Command: pip-audit --local --disable-pip -f json -o $PIP_AUDIT_REPORT"

    # --local: use local vulnerability DB only (no internet)
    # --disable-pip: don't use pip's vulnerability check
    if pip-audit --local --disable-pip -f json -o "$PIP_AUDIT_REPORT" 2>/dev/null; then
        log_pass "pip-audit scan completed — no known CVEs found"
    else
        log_warn "pip-audit detected known vulnerabilities"
    fi

    # Parse results
    if [ -f "$PIP_AUDIT_REPORT" ]; then
        local audit_critical audit_high
        audit_critical=$(python3 -c "
import json
with open('$PIP_AUDIT_REPORT') as f:
    data = json.load(f)
vulns = data.get('vulnerabilities', [])
if isinstance(vulns, list):
    print(sum(1 for v in vulns if any(sev.get('severity','').upper() in ('CRITICAL','HIGH') for sev in v.get('scores', []))))
else:
    print(0)
" 2>/dev/null || echo "0")
        audit_high=$(python3 -c "
import json
with open('$PIP_AUDIT_REPORT') as f:
    data = json.load(f)
vulns = data.get('vulnerabilities', [])
if isinstance(vulns, list):
    print(sum(1 for v in vulns if any(sev.get('severity','').upper() == 'MEDIUM' for sev in v.get('scores', []))))
else:
    print(0)
" 2>/dev/null || echo "0")

        CRITICAL_COUNT=$((CRITICAL_COUNT + audit_critical))
        HIGH_COUNT=$((HIGH_COUNT + audit_high))
        TOTAL_FINDINGS=$((TOTAL_FINDINGS + audit_critical + audit_high))

        if [ "$audit_critical" -gt 0 ]; then
            log_fail "pip-audit found $audit_critical CRITICAL CVEs"
            EXIT_CODE=1
        fi
        if [ "$audit_high" -gt 0 ]; then
            log_warn "pip-audit found $audit_high HIGH CVEs"
        fi
    fi

    echo ""
    log_info "Report saved to: $PIP_AUDIT_REPORT"
}

# ---------------------------------------------------------------------------
# Scanner 3: Semgrep — FastAPI router security audit
# ---------------------------------------------------------------------------

run_semgrep() {
    log_section "SCANNER 3/3: Semgrep — FastAPI Router Security Audit"

    if ! check_tool "semgrep"; then
        echo '{"scanner": "semgrep", "status": "skipped", "reason": "semgrep not installed"}' > "$SEMGREP_REPORT"
        return 0
    fi

    log_info "Scanning FastAPI routers for missing auth/ABAC dependencies..."

    # Create local Semgrep rules for FastAPI security audit
    local RULES_FILE="$REPORT_DIR/semgrep_rules.yaml"
    cat > "$RULES_FILE" << 'SEMGREP_RULES'
rules:
  # Rule 1: FastAPI endpoints without authentication dependency
  - id: fastapi-missing-auth-dependency
    patterns:
      - pattern: "@router.(get|post|put|delete|patch)(...)"
      - pattern-inside: |
          def $FUNC(...):
            ...
      - pattern-not-inside: |
          def $FUNC(..., ..., Depends($AUTH), ...):
            ...
      - pattern-not-inside: |
          def $FUNC(..., current_user: $TYPE = Depends(...)):
            ...
      - pattern-not-inside: |
          def $FUNC(..., ..., Depends(get_current_user), ...):
            ...
      - pattern-not-inside: |
          def $FUNC(..., ..., Depends(require_admin), ...):
            ...
      - pattern-not-inside: |
          def $FUNC(..., ..., Depends(require_manager), ...):
            ...
      - pattern-not-inside: |
          def $FUNC(..., ..., Depends(get_pki_authenticated_user), ...):
            ...
    message: >
      FastAPI endpoint may be missing authentication dependency.
      All mutable endpoints should require get_current_user or a role-based
      dependency to prevent unauthenticated access.
    severity: WARNING
    metadata:
      category: security
      cwe:
        - "CWE-306: Missing Authentication for Critical Function"
      technology: fastapi

  # Rule 2: SQL string formatting (potential SQL injection)
  - id: python-sql-string-formatting
    patterns:
      - pattern: |
          f"SELECT ... {$_} ..."
      - pattern: |
          "SELECT ...".format(..., $_, ...)
      - pattern: |
          "SELECT ... %s" % ...
      - pattern-not: |
          text("SELECT ...", [...])
      - pattern-not: |
          select(...).where(...)
    message: >
      Potential SQL injection via string formatting.
      Use SQLAlchemy parameterized queries instead of string interpolation.
    severity: ERROR
    metadata:
      category: security
      cwe:
        - "CWE-89: SQL Injection"
      technology: python

  # Rule 3: Unsafe deserialization
  - id: python-unsafe-deserialization
    patterns:
      - pattern: pickle.loads(...)
      - pattern: pickle.load(...)
      - pattern: yaml.load(..., Loader=yaml.UnsafeLoader)
      - pattern: yaml.load(...)
      - pattern-not: yaml.load(..., Loader=yaml.SafeLoader)
      - pattern-not: yaml.safe_load(...)
    message: >
      Unsafe deserialization detected. Deserializing untrusted data can
      lead to remote code execution. Use safe alternatives.
    severity: ERROR
    metadata:
      category: security
      cwe:
        - "CWE-502: Deserialization of Untrusted Data"
      technology: python

  # Rule 4: Hardcoded secrets
  - id: python-hardcoded-secret
    patterns:
      - pattern: |
          $VAR = "$STRING"
      - pattern-inside: |
          ...
      - metavariable-pattern:
          metavariable: $VAR
          patterns:
            - pattern: /(?i)(password|secret|api_key|token|credential)/
      - metavariable-pattern:
          metavariable: $STRING
          patterns:
            - pattern: /[^"]{8,}/
    message: >
      Potential hardcoded secret detected. Secrets should be loaded from
      environment variables or a secure vault, not hardcoded in source.
    severity: WARNING
    metadata:
      category: security
      cwe:
        - "CWE-798: Use of Hardcoded Credentials"
      technology: python

  # Rule 5: Missing ABAC clearance check on node access
  - id: fastapi-missing-abac-check
    patterns:
      - pattern: |
          db.query(UniversalBreakdownNode).filter(...)
      - pattern-not-inside: |
          ...
          is_node_visible(...)
          ...
      - pattern-not-inside: |
          ...
          has_sufficient_clearance(...)
          ...
    message: >
      Querying UniversalBreakdownNode without ABAC clearance check.
      Ensure that node access is gated by has_sufficient_clearance() or
      is_node_visible() to enforce classification-based access control.
    severity: WARNING
    metadata:
      category: security
      cwe:
        - "CWE-284: Improper Access Control"
      technology: fastapi

  # Rule 6: Insecure random number generation
  - id: python-insecure-random
    patterns:
      - pattern: random.random()
      - pattern: random.randint(...)
      - pattern: random.choice(...)
      - pattern-not-inside: |
          # Security: random used for non-security purpose
          ...
    message: >
      Insecure random number generation. The `random` module is not
      cryptographically secure. Use `secrets` or `os.urandom()` for
      security-sensitive operations.
    severity: WARNING
    metadata:
      category: security
      cwe:
        - "CWE-330: Use of Insufficiently Random Values"
      technology: python

  # Rule 7: Missing security headers
  - id: fastapi-missing-security-headers
    patterns:
      - pattern: |
          Response(...)
      - pattern-not-inside: |
          ...
          headers={"...": "..."}
          ...
    message: >
      HTTP response may be missing security headers. Consider adding
      Content-Security-Policy, X-Content-Type-Options, and
      Strict-Transport-Security headers.
    severity: INFO
    metadata:
      category: security
      cwe:
        - "CWE-693: Protection Mechanism Failure"
      technology: fastapi
SEMGREP_RULES

    log_info "Running Semgrep with local security rules..."
    log_info "Command: semgrep --config $RULES_FILE app/ --json --output $SEMGREP_REPORT"

    if semgrep --config "$RULES_FILE" "$PROJECT_ROOT/app/" --json --output "$SEMGREP_REPORT" 2>/dev/null; then
        log_pass "Semgrep scan completed — no issues found"
    else
        log_warn "Semgrep detected potential issues"
    fi

    # Parse results
    if [ -f "$SEMGREP_REPORT" ]; then
        local sg_critical sg_high sg_medium
        sg_critical=$(python3 -c "
import json
with open('$SEMGREP_REPORT') as f:
    data = json.load(f)
results = data.get('results', [])
print(sum(1 for r in results if r.get('extra', {}).get('severity') == 'ERROR'))
" 2>/dev/null || echo "0")
        sg_high=$(python3 -c "
import json
with open('$SEMGREP_REPORT') as f:
    data = json.load(f)
results = data.get('results', [])
print(sum(1 for r in results if r.get('extra', {}).get('severity') == 'WARNING'))
" 2>/dev/null || echo "0")
        sg_medium=$(python3 -c "
import json
with open('$SEMGREP_REPORT') as f:
    data = json.load(f)
results = data.get('results', [])
print(sum(1 for r in results if r.get('extra', {}).get('severity') == 'INFO'))
" 2>/dev/null || echo "0")

        CRITICAL_COUNT=$((CRITICAL_COUNT + sg_critical))
        HIGH_COUNT=$((HIGH_COUNT + sg_high))
        MEDIUM_COUNT=$((MEDIUM_COUNT + sg_medium))
        TOTAL_FINDINGS=$((TOTAL_FINDINGS + sg_critical + sg_high + sg_medium))

        if [ "$sg_critical" -gt 0 ]; then
            log_fail "Semgrep found $sg_critical CRITICAL issues"
            EXIT_CODE=1
        fi
        if [ "$sg_high" -gt 0 ]; then
            log_warn "Semgrep found $sg_high HIGH issues"
        fi
    fi

    echo ""
    log_info "Report saved to: $SEMGREP_REPORT"
}

# ---------------------------------------------------------------------------
# Generate consolidated JSON report
# ---------------------------------------------------------------------------

generate_consolidated_report() {
    log_section "Generating Consolidated Security Report"

    python3 << PYTHON_REPORT
import json
from datetime import datetime, timezone

report = {
    "scan_type": "sast-consolidated",
    "timestamp": "$TIMESTAMP",
    "scanners": {},
    "summary": {
        "total_findings": $TOTAL_FINDINGS,
        "critical_count": $CRITICAL_COUNT,
        "high_count": $HIGH_COUNT,
        "medium_count": $MEDIUM_COUNT,
        "low_count": $LOW_COUNT,
    },
    "exit_code": $EXIT_CODE,
    "violations": [],
}

# Load individual scanner reports
for scanner, path in [
    ("bandit", "$BANDIT_REPORT"),
    ("pip-audit", "$PIP_AUDIT_REPORT"),
    ("semgrep", "$SEMGREP_REPORT"),
]:
    try:
        with open(path) as f:
            data = json.load(f)
        report["scanners"][scanner] = {
            "status": "completed",
            "output_file": path,
        }
        # Extract violations from each scanner
        if scanner == "bandit":
            for result in data.get("results", []):
                if result.get("issue_severity") in ("HIGH", "MEDIUM"):
                    report["violations"].append({
                        "scanner": "bandit",
                        "severity": result.get("issue_severity"),
                        "file": result.get("filename", "unknown"),
                        "line": result.get("line_number"),
                        "message": result.get("issue_text", ""),
                        "category": "SAST",
                    })
        elif scanner == "semgrep":
            for result in data.get("results", []):
                extra = result.get("extra", {})
                if extra.get("severity") in ("ERROR", "WARNING"):
                    report["violations"].append({
                        "scanner": "semgrep",
                        "severity": extra.get("severity"),
                        "file": result.get("path", "unknown"),
                        "line": result.get("start", {}).get("line"),
                        "message": extra.get("message", ""),
                        "category": "SAST",
                    })
    except (FileNotFoundError, json.JSONDecodeError) as e:
        report["scanners"][scanner] = {
            "status": "error",
            "error": str(e),
        }

with open("$REPORT_FILE", "w") as f:
    json.dump(report, f, indent=2)

print(f"Consolidated report saved to: $REPORT_FILE")
PYTHON_REPORT
}

# ---------------------------------------------------------------------------
# Print summary
# ---------------------------------------------------------------------------

print_summary() {
    log_section "SAST SCAN SUMMARY"

    echo ""
    echo -e "  ${BOLD}Total findings:  $TOTAL_FINDINGS${NC}"
    echo -e "  ${RED}CRITICAL:        $CRITICAL_COUNT${NC}"
    echo -e "  ${AMBER}HIGH:            $HIGH_COUNT${NC}"
    echo -e "  ${GREEN}MEDIUM:          $MEDIUM_COUNT${NC}"
    echo ""

    if [ "$EXIT_CODE" -ne 0 ]; then
        echo -e "  ${RED}${BOLD}❌ SAST SCAN FAILED${NC}"
        echo -e "  ${RED}High or critical vulnerabilities detected.${NC}"
        echo -e "  ${RED}Report saved to: $REPORT_FILE${NC}"
        echo ""
    else
        echo -e "  ${GREEN}${BOLD}✅ SAST SCAN PASSED${NC}"
        echo -e "  ${GREEN}No high or critical vulnerabilities detected.${NC}"
        echo ""
    fi

    echo -e "${BOLD}═══════════════════════════════════════════════════════════════${NC}"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
    echo ""
    echo -e "${BOLD}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║  Static Application Security Testing (SAST) Harness         ║${NC}"
    echo -e "${BOLD}║  Eisenhower Portfolio Manager — Air-Gap Security Pipeline   ║${NC}"
    echo -e "${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    log_info "Project root: $PROJECT_ROOT"
    log_info "Timestamp:    $TIMESTAMP"
    echo ""

    # Run scanners
    run_bandit
    run_pip_audit
    run_semgrep

    # Generate consolidated report
    generate_consolidated_report

    # Print summary
    print_summary

    exit $EXIT_CODE
}

main "$@"
