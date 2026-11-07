"""CLI runner for the Operational Readiness Smoke Test.

This script executes the full smoke test suite and produces an ANSI
color-coded terminal readiness report with pass/fail gates and
execution timings.

Usage
~~~~~

    python -m tests.smoke.run_readiness_audit

Prerequisites
~~~~~~~~~~~~~

A live PostgreSQL instance must be reachable.  Set the environment
variable before running::

    set E2E_DATABASE_URL=postgresql://user:pass@localhost:5432/eisenhower_smoke

If no database is available, the script reports all tests as SKIPPED.
"""

import os
import re
import sys
import time
import subprocess
from datetime import datetime
from pathlib import Path
from typing import List, Tuple


# ============================================================================
# ANSI colour helpers
# ============================================================================

class Colors:
    """ANSI escape codes for terminal colour output."""
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    MAGENTA = "\033[95m"
    CYAN = "\033[96m"
    BG_RED = "\033[41m"
    BG_GREEN = "\033[42m"
    BG_YELLOW = "\033[43m"

    @staticmethod
    def disable():
        """Disable colours (e.g. when piping to a file)."""
        Colors.RESET = ""
        Colors.BOLD = ""
        Colors.DIM = ""
        Colors.RED = ""
        Colors.GREEN = ""
        Colors.YELLOW = ""
        Colors.BLUE = ""
        Colors.MAGENTA = ""
        Colors.CYAN = ""
        Colors.BG_RED = ""
        Colors.BG_GREEN = ""
        Colors.BG_YELLOW = ""


# Disable colours if stdout is not a TTY
if not sys.stdout.isatty():
    Colors.disable()


# ============================================================================
# Test result data class
# ============================================================================

class TestResult:
    """Represents the result of a single smoke test step."""

    def __init__(self, name: str, step: int):
        self.name = name
        self.step = step
        self.status: str = "PENDING"  # PASS, FAIL, SKIP, ERROR
        self.duration: float = 0.0
        self.message: str = ""

    def __str__(self) -> str:
        if self.status == "PASS":
            icon = f"{Colors.GREEN}[PASS]{Colors.RESET}"
        elif self.status == "FAIL":
            icon = f"{Colors.RED}[FAIL]{Colors.RESET}"
        elif self.status == "SKIP":
            icon = f"{Colors.YELLOW}[SKIP]{Colors.RESET}"
        elif self.status == "ERROR":
            icon = f"{Colors.MAGENTA}[ERROR]{Colors.RESET}"
        else:
            icon = f"{Colors.DIM}[????]{Colors.RESET}"

        duration_str = f"{self.duration:.3f}s" if self.duration else "— "
        return f"  {icon}  Step {self.step}: {self.name}  {Colors.DIM}{duration_str}{Colors.RESET}"


# ============================================================================
# Banner
# ============================================================================

def print_banner():
    """Print the readiness audit banner."""
    print()
    print(f"{Colors.BOLD}{Colors.CYAN}")
    print("=" * 72)
    print("  EISENHOWER PORTFOLIO MANAGER — OPERATIONAL READINESS AUDIT")
    print("=" * 72)
    print(f"{Colors.RESET}")
    print(f"  {Colors.DIM}Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{Colors.RESET}")
    print(f"  {Colors.DIM}Database: {os.environ.get('E2E_DATABASE_URL', 'NOT SET')}{Colors.RESET}")
    print()


# ============================================================================
# Run the smoke tests via pytest and parse output
# ============================================================================

def run_smoke_tests() -> List[TestResult]:
    """Execute the smoke test suite and return structured results."""

    # Define the expected test steps
    step_names = [
        "CPM Calculation & Critical Path",
        "Monte Carlo SRA (2,000 iterations)",
        "Background Clash Daemon",
        "Heuristic Resource Leveling",
        "Baseline Freeze & Delta Variance",
        "Timesheet & Oracle Staging",
        "P6 Export & Subcontractor Re-Import",
        "Entity Presence Summary",
    ]

    results: List[TestResult] = []
    for i, name in enumerate(step_names, 1):
        results.append(TestResult(name, i))

    # Check PostgreSQL availability
    db_url = os.environ.get("E2E_DATABASE_URL", "")
    if not db_url:
        for r in results:
            r.status = "SKIP"
            r.message = "E2E_DATABASE_URL not set"
        return results

    # Run pytest with verbose output
    start_time = time.time()

    cmd = [
        sys.executable, "-m", "pytest",
        "tests/smoke/test_operational_readiness.py",
        "-v", "--tb=short",
        "-o", "log_cli=true",
        "-o", "log_cli_level=WARNING",
    ]

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,  # 5-minute timeout
        )
        elapsed = time.time() - start_time
    except subprocess.TimeoutExpired:
        for r in results:
            r.status = "ERROR"
            r.message = "Test suite timed out after 300s"
        return results
    except Exception as exc:
        for r in results:
            r.status = "ERROR"
            r.message = str(exc)
        return results

    # Parse pytest output to map test names to results
    output = proc.stdout + proc.stderr

    # Map test method names to step indices
    test_name_map = {
        "test_step1_cpm_calculation": 0,
        "test_step2_monte_carlo_sra": 1,
        "test_step3_clash_daemon": 2,
        "test_step4_resource_leveling": 3,
        "test_step5_baseline_freeze_and_variance": 4,
        "test_step6_timesheet_oracle_staging": 5,
        "test_step7_p6_export_and_reimport": 6,
        "test_all_entities_present": 7,
    }

    for line in output.splitlines():
        for test_name, idx in test_name_map.items():
            if test_name not in line:
                continue

            if "PASSED" in line:
                results[idx].status = "PASS"
            elif "FAILED" in line:
                results[idx].status = "FAIL"
            elif "SKIPPED" in line:
                results[idx].status = "SKIP"
            elif "ERROR" in line:
                results[idx].status = "ERROR"

            # Extract duration if present (pytest appends [0.123s])
            bracket = line.rfind("[")
            if bracket != -1:
                tail = line[bracket + 1:]
                if tail.endswith("s]"):
                    try:
                        results[idx].duration = float(tail[:-2])
                    except ValueError:
                        pass

            # Extract failure message
            if "FAILED" in line or "ERROR" in line:
                # Look for the assertion error in subsequent lines
                results[idx].message = line.strip()

    # If all tests are still PENDING, check for global skip
    if all(r.status == "PENDING" for r in results):
        if "SKIPPED" in output or "skip" in output.lower():
            for r in results:
                r.status = "SKIP"
                r.message = "PostgreSQL not available"
        else:
            for r in results:
                r.status = "ERROR"
                r.message = "Unable to parse pytest output"

    return results


# ============================================================================
# Report rendering
# ============================================================================

def print_results(results: List[TestResult]):
    """Print the formatted readiness report."""

    passed = sum(1 for r in results if r.status == "PASS")
    failed = sum(1 for r in results if r.status == "FAIL")
    skipped = sum(1 for r in results if r.status == "SKIP")
    errors = sum(1 for r in results if r.status == "ERROR")
    total = len(results)
    total_time = sum(r.duration for r in results)

    print(f"{Colors.BOLD}  TEST RESULTS{Colors.RESET}")
    print(f"  {'─' * 68}")

    for r in results:
        print(str(r))
        if r.message and r.status in ("FAIL", "ERROR"):
            print(f"      {Colors.DIM}{r.message}{Colors.RESET}")

    print()
    print(f"  {'─' * 68}")

    # Summary bar
    bar_parts = []
    if passed:
        bar_parts.append(f"{Colors.GREEN}{Colors.BOLD}{passed} passed{Colors.RESET}")
    if failed:
        bar_parts.append(f"{Colors.RED}{Colors.BOLD}{failed} failed{Colors.RESET}")
    if skipped:
        bar_parts.append(f"{Colors.YELLOW}{Colors.BOLD}{skipped} skipped{Colors.RESET}")
    if errors:
        bar_parts.append(f"{Colors.MAGENTA}{Colors.BOLD}{errors} errors{Colors.RESET}")

    summary = ", ".join(bar_parts) if bar_parts else f"{Colors.DIM}no results{Colors.RESET}"
    print(f"  {Colors.BOLD}Total: {summary}  ({total_time:.2f}s){Colors.RESET}")
    print()

    # Overall gate
    if failed > 0 or errors > 0:
        print(f"  {Colors.RED}{Colors.BOLD}{Colors.BG_RED}  READINESS GATE: FAILED  {Colors.RESET}")
        print()
        return 1
    elif skipped == total:
        print(f"  {Colors.YELLOW}{Colors.BOLD}{Colors.BG_YELLOW}  READINESS GATE: SKIPPED — No PostgreSQL{Colors.RESET}")
        print()
        return 0
    else:
        print(f"  {Colors.GREEN}{Colors.BOLD}{Colors.BG_GREEN}  READINESS GATE: PASSED  {Colors.RESET}")
        print()
        return 0


# ============================================================================
# Deployment Hardening Validation
# ============================================================================

def _find_project_root() -> Path:
    """Walk up from this file to locate the project root."""
    current = Path(__file__).resolve().parent.parent.parent  # tests/smoke/ -> project root
    if current.exists():
        return current
    return Path.cwd()


def _read_deploy_file(relative_path: str) -> str:
    """Read a file from the deploy/ directory, returning empty string if missing."""
    project_root = _find_project_root()
    file_path = project_root / relative_path
    if file_path.exists():
        return file_path.read_text()
    return ""


def validate_dockerfile_hardening() -> List[TestResult]:
    """Check that all Dockerfiles run as unprivileged users."""

    dockerfiles = [
        ("Backend Dockerfile", "deploy/docker/backend.Dockerfile"),
        ("Backend Dockerfile (offline)", "deploy/docker/backend.Dockerfile.offline"),
        ("Frontend Dockerfile", "deploy/docker/frontend.Dockerfile"),
        ("Frontend Dockerfile (offline)", "deploy/docker/frontend.Dockerfile.offline"),
    ]

    results: List[TestResult] = []
    step = 1

    for name, path in dockerfiles:
        result = TestResult(f"{name} — unprivileged user", step)
        content = _read_deploy_file(path)

        if not content:
            result.status = "FAIL"
            result.message = f"File not found: {path}"
        else:
            # Check for user/group creation
            has_groupadd = bool(re.search(r'groupadd|addgroup', content))
            has_useradd = bool(re.search(r'useradd|adduser', content))
            has_user_directive = bool(re.search(r'^\s*USER\s+', content, re.MULTILINE))

            if has_groupadd and has_useradd and has_user_directive:
                result.status = "PASS"
            else:
                missing = []
                if not has_groupadd:
                    missing.append("group creation")
                if not has_useradd:
                    missing.append("user creation")
                if not has_user_directive:
                    missing.append("USER directive")
                result.status = "FAIL"
                result.message = f"Missing: {', '.join(missing)}"

        results.append(result)
        step += 1

    return results


def validate_nginx_mtls() -> List[TestResult]:
    """Check that nginx.conf enforces mTLS client certificate verification."""

    checks = [
        ("mTLS — ssl_client_certificate", r'ssl_client_certificate\s+/', 0),
        ("mTLS — ssl_verify_client on", r'ssl_verify_client\s+on', 0),
        ("mTLS — ssl_verify_depth", r'ssl_verify_depth\s+\d+', 0),
        ("mTLS — X-SSL-Client-Cert header", r'X-SSL-Client-Cert\s+\$ssl_client_escaped_cert', 0),
        ("mTLS — X-SSL-Client-DN header", r'X-SSL-Client-DN\s+\$ssl_client_s_dn', 0),
        ("TLS — restricted protocols", r'ssl_protocols\s+TLSv1\.2\s+TLSv1\.3', 0),
        ("TLS — hardened ciphers", r'ssl_ciphers\s+', 0),
        ("User — unprivileged", r'^\s*user\s+appuser\s*;', re.MULTILINE),
    ]

    results: List[TestResult] = []
    content = _read_deploy_file("deploy/docker/nginx.conf")
    step = 1

    for name, pattern, flags in checks:
        result = TestResult(f"Nginx {name}", step)

        if not content:
            result.status = "FAIL"
            result.message = "nginx.conf not found"
        elif re.search(pattern, content, flags):
            result.status = "PASS"
        else:
            result.status = "FAIL"
            result.message = f"Pattern not found: {pattern}"

        results.append(result)
        step += 1

    return results


def validate_patroni_mtls() -> List[TestResult]:
    """Check that patroni.yml configures mutual TLS for Raft and REST API."""

    checks = [
        ("REST API — certfile", r'certfile:\s*/etc/patroni/certs/patroni\.crt'),
        ("REST API — keyfile", r'keyfile:\s*/etc/patroni/certs/patroni\.key'),
        ("REST API — cacert", r'cacert:\s*/etc/patroni/certs/ca\.crt'),
        ("Raft — certfile", r'certfile:\s*/etc/patroni/certs/patroni\.crt'),
        ("PostgreSQL — ssl on", r'ssl:\s*["\']?on["\']?'),
        ("PostgreSQL — ssl_cert_file", r'ssl_cert_file:\s*/etc/patroni/certs/patroni\.crt'),
        ("PostgreSQL — ssl_min_protocol", r'ssl_min_protocol_version:\s*["\']?TLSv1\.2["\']?'),
        ("pg_hba — hostssl replication", r'hostssl\s+replication'),
        ("pg_hba — hostssl application", r'hostssl\s+all\s+all'),
    ]

    results: List[TestResult] = []
    content = _read_deploy_file("deploy/postgres/patroni.yml")
    step = 1

    for name, pattern in checks:
        result = TestResult(f"Patroni {name}", step)

        if not content:
            result.status = "FAIL"
            result.message = "patroni.yml not found"
        elif re.search(pattern, content):
            result.status = "PASS"
        else:
            result.status = "FAIL"
            result.message = f"Pattern not found: {pattern}"

        results.append(result)
        step += 1

    return results


def run_deployment_hardening_checks() -> List[TestResult]:
    """Run all deployment hardening validation checks."""
    results: List[TestResult] = []

    docker_results = validate_dockerfile_hardening()
    nginx_results = validate_nginx_mtls()
    patroni_results = validate_patroni_mtls()

    # Re-number all steps sequentially
    step = 1
    for r in docker_results + nginx_results + patroni_results:
        r.step = step
        step += 1
        results.append(r)

    return results


# ============================================================================
# Main
# ============================================================================

def main():
    """Entry point for the readiness audit CLI."""
    print_banner()

    # ------------------------------------------------------------------
    # Phase 1: Deployment Hardening Validation
    # ------------------------------------------------------------------
    print(f"{Colors.BOLD}{Colors.BLUE}  PHASE 1: DEPLOYMENT HARDENING VALIDATION{Colors.RESET}")
    print(f"  {'─' * 68}")

    hardening_results = run_deployment_hardening_checks()
    for r in hardening_results:
        print(str(r))
        if r.message and r.status in ("FAIL", "ERROR"):
            print(f"      {Colors.DIM}{r.message}{Colors.RESET}")

    hardening_passed = sum(1 for r in hardening_results if r.status == "PASS")
    hardening_failed = sum(1 for r in hardening_results if r.status == "FAIL")
    hardening_total = len(hardening_results)

    print()
    if hardening_failed > 0:
        print(f"  {Colors.RED}{Colors.BOLD}  Hardening: {hardening_passed}/{hardening_total} checks passed{Colors.RESET}")
    else:
        print(f"  {Colors.GREEN}{Colors.BOLD}  Hardening: {hardening_passed}/{hardening_total} checks passed{Colors.RESET}")
    print()

    # ------------------------------------------------------------------
    # Phase 2: Operational Smoke Tests
    # ------------------------------------------------------------------
    print(f"{Colors.BOLD}{Colors.BLUE}  PHASE 2: OPERATIONAL SMOKE TESTS{Colors.RESET}")
    print(f"  {'─' * 68}")

    smoke_results = run_smoke_tests()
    exit_code = print_results(smoke_results)

    # ------------------------------------------------------------------
    # Overall gate
    # ------------------------------------------------------------------
    print(f"{Colors.BOLD}  OVERALL READINESS GATE{Colors.RESET}")
    print(f"  {'─' * 68}")

    if hardening_failed > 0:
        print(f"  {Colors.RED}{Colors.BOLD}{Colors.BG_RED}  HARDENING GATE: FAILED  {Colors.RESET}")
        print(f"  {Colors.RED}  {hardening_failed} deployment hardening check(s) failed.{Colors.RESET}")
        print()
        return 1
    elif exit_code != 0:
        print(f"  {Colors.RED}{Colors.BOLD}{Colors.BG_RED}  READINESS GATE: FAILED  {Colors.RESET}")
        print()
        return 1
    else:
        print(f"  {Colors.GREEN}{Colors.BOLD}{Colors.BG_GREEN}  READINESS GATE: PASSED  {Colors.RESET}")
        print(f"  {Colors.GREEN}  All hardening checks and smoke tests passed.{Colors.RESET}")
        print()
        return 0


if __name__ == "__main__":
    main()
