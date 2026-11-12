"""Unified Regression Test Runner

Runs all backend (pytest) and frontend (Vitest) tests and produces a
standardized text output summary suitable for CI/CD pipelines.

Usage:
    python scripts/run_regression_tests.py              # Quick run, no coverage
    python scripts/run_regression_tests.py --coverage   # With coverage reports
    python scripts/run_regression_tests.py --backend-only
    python scripts/run_regression_tests.py --frontend-only

Output:
    - Standard text summary to stdout
    - JSON report: test_results.json
    - Coverage reports (with --coverage):
        - Backend: htmlcov/ (HTML) + term-missing (stdout)
        - Frontend: frontend/coverage/ (HTML, JSON, Clover XML)
"""

import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"

SEPARATOR = "=" * 72
THIN_SEPARATOR = "-" * 72


def _find_executable(name: str) -> str:
    """Find the full path to an executable, handling Windows .cmd wrappers."""
    import shutil
    path = shutil.which(name)
    if path:
        return path
    # On Windows, try .cmd extension (e.g., npm.cmd)
    for ext in [".cmd", ".bat", ".exe"]:
        candidate = shutil.which(name + ext)
        if candidate:
            return candidate
    return name


def run_command(cmd: list[str], cwd: Path, description: str, timeout: int = 300) -> dict:
    """Run a subprocess command with streamed output and return structured results."""
    print(f"\n{SEPARATOR}")
    print(f"  {description}")
    print(f"{SEPARATOR}")
    print(f"  Command: {' '.join(cmd)}")
    print(f"  Working Dir: {cwd}")
    print(THIN_SEPARATOR)

    start = time.time()
    result = {
        "description": description,
        "command": " ".join(cmd),
        "cwd": str(cwd),
        "status": "unknown",
        "duration": 0,
        "exit_code": None,
        "stdout": "",
        "stderr": "",
        "tests_passed": 0,
        "tests_failed": 0,
        "tests_skipped": 0,
        "tests_total": 0,
        "coverage_percent": None,
    }

    try:
        # Resolve the first argument to a full path (important for npm on Windows)
        resolved_cmd = [_find_executable(cmd[0])] + cmd[1:]
        proc = subprocess.run(
            resolved_cmd,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=sys.platform == "win32",
        )
        result["exit_code"] = proc.returncode
        result["stdout"] = proc.stdout
        result["stderr"] = proc.stderr
        result["duration"] = round(time.time() - start, 2)

        # Stream the last few lines of output for quick feedback
        stdout_lines = proc.stdout.strip().split("\n")
        stderr_lines = proc.stderr.strip().split("\n")

        if proc.returncode == 0:
            result["status"] = "PASSED"
            print(f"  ✓ {description} PASSED ({result['duration']}s)")
            # Show the summary line from test output
            for line in reversed(stdout_lines[-10:]):
                if "passed" in line.lower() or "coverage" in line.lower():
                    print(f"    {line.strip()}")
                    break
        else:
            result["status"] = "FAILED"
            print(f"  ✗ {description} FAILED ({result['duration']}s)")
            # Show error summary
            for line in stderr_lines[-5:]:
                if line.strip():
                    print(f"    {line.strip()}")
            for line in stdout_lines[-5:]:
                if "failed" in line.lower() and line.strip():
                    print(f"    {line.strip()}")

    except subprocess.TimeoutExpired:
        result["status"] = "TIMEOUT"
        result["duration"] = timeout
        print(f"  ⏱ {description} TIMEOUT after {timeout}s")
    except Exception as e:
        result["status"] = "ERROR"
        result["duration"] = round(time.time() - start, 2)
        print(f"  ✗ {description} ERROR: {e}")

    return result


def parse_pytest_output(stdout: str) -> dict:
    """Extract test counts from pytest output."""
    passed = failed = skipped = 0
    total = 0

    # Match patterns like "173 passed, 5 skipped in 12.34s"
    match = re.search(r"(\d+)\s+passed", stdout)
    if match:
        passed = int(match.group(1))

    match = re.search(r"(\d+)\s+failed", stdout)
    if match:
        failed = int(match.group(1))

    match = re.search(r"(\d+)\s+skipped", stdout)
    if match:
        skipped = int(match.group(1))

    total = passed + failed + skipped
    return {"tests_passed": passed, "tests_failed": failed, "tests_skipped": skipped, "tests_total": total}


def parse_vitest_output(stdout: str) -> dict:
    """Extract test counts from Vitest output."""
    passed = failed = skipped = 0
    total = 0

    # Match patterns like "Test Files  5 passed (5)" or "Tests  173 passed | 0 failed"
    match = re.search(r"Tests\s+(\d+)\s+passed", stdout)
    if match:
        passed = int(match.group(1))

    match = re.search(r"Tests\s+\d+\s+passed\s*\|\s*(\d+)\s+failed", stdout)
    if match:
        failed = int(match.group(1))

    match = re.search(r"Tests\s+\d+\s+passed\s*\|\s*\d+\s+failed\s*\|\s*(\d+)\s+skipped", stdout)
    if match:
        skipped = int(match.group(1))

    total = passed + failed + skipped
    return {"tests_passed": passed, "tests_failed": failed, "tests_skipped": skipped, "tests_total": total}


def parse_coverage_output(stdout: str) -> float | None:
    """Extract overall coverage percentage from output."""
    # Match patterns like "TOTAL 1234 567 54.1%" or "All files  | 1234 | 567 | 54.1%"
    match = re.search(r"(?:TOTAL|All files)\s+[^\n]*\b(\d+\.?\d*)%", stdout)
    if match:
        return float(match.group(1))
    return None


def main():
    args = sys.argv[1:]
    with_coverage = "--coverage" in args
    backend_only = "--backend-only" in args
    frontend_only = "--frontend-only" in args

    print(SEPARATOR)
    print("  EISENHOWER PORTFOLIO MANAGER — REGRESSION TEST SUITE")
    print(f"  Run at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if with_coverage:
        print("  Coverage reporting: ENABLED")
    else:
        print("  Coverage reporting: DISABLED (add --coverage to enable)")
    print(SEPARATOR)

    results = []

    # ------------------------------------------------------------------
    # Backend Tests
    # ------------------------------------------------------------------
    if not frontend_only:
        print(f"\n{'='*72}")
        print("  BACKEND TESTS (Python / pytest)")
        print(f"{'='*72}")

        # Unit and integration tests (exclude e2e which needs live services)
        backend_cmd = [
            sys.executable, "-m", "pytest",
            "tests/core/", "tests/models/", "tests/middleware/",
            "tests/general/", "tests/cli/", "tests/integration/",
            "tests/frontend/", "tests/routers/",
            "-v", "--tb=short",
        ]
        if with_coverage:
            backend_cmd.extend(["--cov=app", "--cov-report=term-missing", "--cov-report=html:htmlcov"])
        backend_result = run_command(
            backend_cmd,
            cwd=PROJECT_ROOT,
            description="Backend Unit & Integration Tests",
            timeout=300,
        )
        parsed = parse_pytest_output(backend_result["stdout"])
        backend_result.update(parsed)
        if with_coverage:
            backend_result["coverage_percent"] = parse_coverage_output(backend_result["stdout"])
        results.append(backend_result)

        # E2E health check tests
        e2e_result = run_command(
            [sys.executable, "-m", "pytest", "tests/e2e/", "-v", "--tb=short"],
            cwd=PROJECT_ROOT,
            description="Backend E2E Health Checks",
            timeout=120,
        )
        parsed = parse_pytest_output(e2e_result["stdout"])
        e2e_result.update(parsed)
        results.append(e2e_result)

    # ------------------------------------------------------------------
    # Frontend Tests
    # ------------------------------------------------------------------
    if not backend_only:
        print(f"\n{'='*72}")
        print("  FRONTEND TESTS (TypeScript / Vitest)")
        print(f"{'='*72}")

        frontend_cmd = ["npm", "run", "test:run"]
        if with_coverage:
            frontend_cmd.extend(["--", "--coverage"])
        frontend_result = run_command(
            frontend_cmd,
            cwd=FRONTEND_DIR,
            description="Frontend Unit Tests",
            timeout=180,
        )
        parsed = parse_vitest_output(frontend_result["stdout"])
        frontend_result.update(parsed)
        if with_coverage:
            frontend_result["coverage_percent"] = parse_coverage_output(frontend_result["stdout"])
        results.append(frontend_result)

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    total_passed = sum(r["tests_passed"] for r in results)
    total_failed = sum(r["tests_failed"] for r in results)
    total_skipped = sum(r["tests_skipped"] for r in results)
    total_tests = sum(r["tests_total"] for r in results)
    total_duration = sum(r["duration"] for r in results)

    all_passed = all(r["status"] in ("PASSED",) for r in results)

    print(f"\n{'='*72}")
    print("  REGRESSION TEST SUMMARY")
    print(f"{'='*72}")

    for r in results:
        status_icon = "✓" if r["status"] == "PASSED" else "✗" if r["status"] == "FAILED" else "⏱" if r["status"] == "TIMEOUT" else "!"
        coverage_str = f" (Coverage: {r['coverage_percent']:.1f}%)" if r.get("coverage_percent") else ""
        test_str = f"{r['tests_passed']}/{r['tests_total']} passed" if r['tests_total'] > 0 else ""
        print(f"  {status_icon} {r['description']}")
        print(f"    {test_str}{coverage_str}  ({r['duration']}s)")

    print(THIN_SEPARATOR)
    print(f"  TOTAL TESTS: {total_tests}")
    print(f"  PASSED:      {total_passed}")
    print(f"  FAILED:      {total_failed}")
    print(f"  SKIPPED:     {total_skipped}")
    print(f"  DURATION:    {total_duration:.1f}s")
    print(THIN_SEPARATOR)

    if all_passed:
        print("  ✓ ALL TESTS PASSED")
    else:
        print("  ✗ SOME TESTS FAILED")

    print(f"{'='*72}\n")

    # Save JSON report
    report = {
        "timestamp": datetime.now().isoformat(),
        "total_tests": total_tests,
        "total_passed": total_passed,
        "total_failed": total_failed,
        "total_skipped": total_skipped,
        "total_duration_seconds": round(total_duration, 2),
        "all_passed": all_passed,
        "results": results,
    }
    report_path = PROJECT_ROOT / "test_results.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"  Report saved to: {report_path}")

    # Exit code
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
