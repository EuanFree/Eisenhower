"""Pre-commit and commit-hook hardening for sovereign air-gapped deployment.

This module scans staged git commits for security violations before they
enter version control.  It enforces zero-leakage policies by rejecting
commits that contain:

1. **Hardcoded secrets** — API keys, passwords, tokens, and private keys.
2. **Cloud credentials** — AWS/MinIO access keys and secret keys.
3. **Cryptographic material** — RSA/EC/DSA private key blocks.
4. **Defence classification markers** — UK MOD / US DoD marking strings
   in unapproved source code comments (e.g., "TOP SECRET", "UK EYES ONLY").

Usage
~~~~~

As a pre-commit hook (install in ``.git/hooks/pre-commit``)::

    python -m scripts.security.git_hooks --staged

As a manual scan of the working tree::

    python -m scripts.security.git_hooks --all

As a CI/CD gate::

    python -m scripts.security.git_hooks --ci

Exit Codes
----------

0 — No violations found.
1 — One or more violations detected (commit rejected).
2 — Internal error (e.g., git not available).

"""
import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional


# ============================================================================
# Violation data model
# ============================================================================


@dataclass
class Violation:
    """A single security violation found during scanning."""

    file: str
    line: int
    pattern: str
    severity: str  # "CRITICAL" or "HIGH"
    category: str
    message: str
    match_preview: str = ""


@dataclass
class ScanReport:
    """Aggregated report of all violations found during a scan."""

    scan_type: str
    timestamp: str
    total_files_scanned: int
    total_violations: int
    critical_count: int
    high_count: int
    violations: List[Dict] = field(default_factory=list)

    def to_dict(self) -> Dict:
        return asdict(self)


# ============================================================================
# Secret and classification detection patterns
# ============================================================================


class SecretPatterns:
    """Regex patterns for detecting hardcoded secrets and classification markers."""

    # Cryptographic private keys
    PRIVATE_KEY = re.compile(
        r"(-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----)",
        re.IGNORECASE,
    )

    # AWS access key IDs (16-character base32 after prefix)
    AWS_ACCESS_KEY = re.compile(
        r"(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}",
    )

    # AWS secret access keys (40-character base64)
    AWS_SECRET_KEY = re.compile(
        r"(?i)(aws_secret_access_key|aws_secret_key)\s*[:=]\s*['\"]?([A-Za-z0-9/+=]{40})['\"]?",
    )

    # MinIO / S3 access keys (generic pattern)
    MINIO_ACCESS_KEY = re.compile(
        r"(?i)(minio_access_key|minio_access|minio_key)\s*[:=]\s*['\"]?([A-Za-z0-9]{16,})['\"]?",
    )

    # MinIO / S3 secret keys
    MINIO_SECRET_KEY = re.compile(
        r"(?i)(minio_secret_key|minio_secret|minio_secret)\s*[:=]\s*['\"]?([A-Za-z0-9/+=]{20,})['\"]?",
    )

    # Generic API keys / tokens in code
    API_KEY_ASSIGNMENT = re.compile(
        r"(?i)(api_key|apikey|api_secret|access_token|auth_token|secret_key)\s*[:=]\s*['\"][^\"]{8,}['\"]",
    )

    # Hardcoded passwords in code
    HARDCODED_PASSWORD = re.compile(
        r"(?i)(password|passwd|pwd)\s*[:=]\s*['\"][^\"]{4,}['\"]",
    )

    # Database connection strings with embedded credentials
    DB_CONNECTION_STRING = re.compile(
        r"(?i)(postgresql|mysql|mongodb|redis)://[^:]+:[^@]+@",
    )

    # JWT secret / signing key
    JWT_SECRET = re.compile(
        r"(?i)(jwt_secret|jwt_signing_key|signing_secret|app_secret_key)\s*[:=]\s*['\"][^\"]{8,}['\"]",
    )

    # UK MOD / US DoD classification markers in comments or strings
    CLASSIFICATION_TOP_SECRET = re.compile(
        r"(TOP\s*SECRET|TS//SI|TS//SCI|TS//NOFORN|TS//REL|TS//ORCON)",
        re.IGNORECASE,
    )

    CLASSIFICATION_SECRET = re.compile(
        r"(SECRET//NOFORN|SECRET//REL|SECRET//ORCON|UK\s*EYES\s*ONLY|UKOFFEYESONLY)",
        re.IGNORECASE,
    )

    CLASSIFICATION_OFFICIAL = re.compile(
        r"(OFFICIAL-SENSITIVE|OFFICIAL\s*\*\s*UK|OFFICIAL\s*\*\s*UKOFFEYESONLY)",
        re.IGNORECASE,
    )

    # Defence programme designators (project codenames in comments)
    PROGRAMME_DESIGNATOR = re.compile(
        r"(?i)(programme|project)\s+(?:falcon|eagle|thunder|viper|phoenix|dragon|titan|atlas|odin|zeus)\b",
    )

    # CAGE codes in comments (potential operational data leak)
    CAGE_CODE = re.compile(
        r"(?i)(cage[_\s]?code|vendor[_\s]?cage)\s*[:=]\s*['\"]?[A-Z]{2}[0-9]{4}['\"]?",
    )

    # Private IP addresses in source (potential network topology leak)
    PRIVATE_IP = re.compile(
        r"\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b",
    )


# ============================================================================
# File filtering
# ============================================================================


# File extensions to scan
SCANNABLE_EXTENSIONS = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".json", ".yaml", ".yml",
    ".toml", ".ini", ".cfg", ".conf", ".env", ".sql", ".sh", ".bash",
    ".xml", ".html", ".css", ".scss", ".md", ".rst", ".txt",
}

# Paths to exclude from scanning
EXCLUDED_PATHS = {
    "node_modules", ".git", "__pycache__", ".venv", "venv", "env",
    ".idea", ".vscode", ".pytest_cache", "dist", "build",
    "deploy/offline", "deploy/docker", "frontend/public/fonts",
    "security_audit_report.json",
}


def should_scan_file(file_path: str) -> bool:
    """Determine if a file should be scanned based on extension and path.

    Parameters
    ----------
    file_path : str
        Relative file path to check.

    Returns
    -------
    bool
        True if the file should be scanned.
    """
    path = Path(file_path)

    # Check extension
    if path.suffix.lower() not in SCANNABLE_EXTENSIONS:
        return False

    # Check excluded paths
    for excluded in EXCLUDED_PATHS:
        if excluded in file_path.replace("\\", "/"):
            return False

    return True


# ============================================================================
# Core scanning engine
# ============================================================================


def scan_file_for_violations(file_path: str) -> List[Violation]:
    """Scan a single file for security violations.

    Parameters
    ----------
    file_path : str
        Path to the file to scan.

    Returns
    -------
    list of Violation
        List of all violations found in the file.
    """
    violations: List[Violation] = []

    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
    except (OSError, IOError):
        return violations

    patterns = [
        # (compiled_regex, severity, category, human_readable_message)
        (SecretPatterns.PRIVATE_KEY, "CRITICAL", "CRYPTOGRAPHIC_KEY",
         "Cryptographic private key detected in source code"),
        (SecretPatterns.AWS_ACCESS_KEY, "CRITICAL", "CLOUD_CREDENTIAL",
         "AWS access key ID detected in source code"),
        (SecretPatterns.AWS_SECRET_KEY, "CRITICAL", "CLOUD_CREDENTIAL",
         "AWS secret access key detected in source code"),
        (SecretPatterns.MINIO_ACCESS_KEY, "CRITICAL", "CLOUD_CREDENTIAL",
         "MinIO/S3 access key detected in source code"),
        (SecretPatterns.MINIO_SECRET_KEY, "CRITICAL", "CLOUD_CREDENTIAL",
         "MinIO/S3 secret key detected in source code"),
        (SecretPatterns.JWT_SECRET, "CRITICAL", "HARDCODED_SECRET",
         "JWT signing secret detected in source code"),
        (SecretPatterns.DB_CONNECTION_STRING, "CRITICAL", "HARDCODED_SECRET",
         "Database connection string with embedded credentials"),
        (SecretPatterns.API_KEY_ASSIGNMENT, "HIGH", "HARDCODED_SECRET",
         "Hardcoded API key or token detected"),
        (SecretPatterns.HARDCODED_PASSWORD, "HIGH", "HARDCODED_SECRET",
         "Hardcoded password detected in source code"),
        (SecretPatterns.CLASSIFICATION_TOP_SECRET, "CRITICAL", "CLASSIFICATION_LEAK",
         "TOP SECRET classification marker in source code — potential operational leak"),
        (SecretPatterns.CLASSIFICATION_SECRET, "CRITICAL", "CLASSIFICATION_LEAK",
         "SECRET classification or UK EYES ONLY caveat in source code"),
        (SecretPatterns.CLASSIFICATION_OFFICIAL, "HIGH", "CLASSIFICATION_LEAK",
         "OFFICIAL-SENSITIVE classification marker in source code"),
        (SecretPatterns.PROGRAMME_DESIGNATOR, "HIGH", "OPERATIONAL_LEAK",
         "Defence programme/project designator in source code"),
        (SecretPatterns.CAGE_CODE, "HIGH", "OPERATIONAL_LEAK",
         "NATO CAGE code in source code — potential operational data leak"),
    ]

    for line_num, line in enumerate(lines, start=1):
        for pattern, severity, category, message in patterns:
            match = pattern.search(line)
            if match:
                # Truncate match preview for safety
                preview = match.group(0)[:80]
                violations.append(Violation(
                    file=file_path,
                    line=line_num,
                    pattern=pattern.pattern[:60],
                    severity=severity,
                    category=category,
                    message=message,
                    match_preview=preview,
                ))

    return violations


def get_staged_files() -> List[str]:
    """Get list of files staged in git for commit.

    Returns
    -------
    list of str
        Relative paths of staged files.

    Raises
    ------
    subprocess.CalledProcessError
        If git is not available or the command fails.
    """
    result = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
        capture_output=True, text=True, check=True,
    )
    return [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]


def get_all_files(root: str = ".") -> List[str]:
    """Get all scannable files in the working tree.

    Parameters
    ----------
    root : str
        Root directory to scan from.

    Returns
    -------
    list of str
        Relative paths of all scannable files.
    """
    files = []
    root_path = Path(root)
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune excluded directories
        dirnames[:] = [
            d for d in dirnames
            if d not in EXCLUDED_PATHS and not d.startswith(".")
        ]
        for filename in filenames:
            full_path = Path(dirpath) / filename
            rel_path = str(full_path.relative_to(root_path))
            if should_scan_file(rel_path):
                files.append(rel_path)
    return files


# ============================================================================
# Report generation
# ============================================================================


def generate_report(
    scan_type: str,
    files: List[str],
    violations: List[Violation],
) -> ScanReport:
    """Generate an aggregated scan report.

    Parameters
    ----------
    scan_type : str
        Type of scan: "pre-commit", "full-scan", or "ci".
    files : list of str
        List of files that were scanned.
    violations : list of Violation
        All violations found during the scan.

    Returns
    -------
    ScanReport
        Aggregated report with counts and violation details.
    """
    critical = sum(1 for v in violations if v.severity == "CRITICAL")
    high = sum(1 for v in violations if v.severity == "HIGH")

    report = ScanReport(
        scan_type=scan_type,
        timestamp=datetime.now(timezone.utc).isoformat(),
        total_files_scanned=len(files),
        total_violations=len(violations),
        critical_count=critical,
        high_count=high,
        violations=[asdict(v) for v in violations],
    )
    return report


def save_report(report: ScanReport, output_path: str = "security_audit_report.json") -> None:
    """Save a scan report to a JSON file.

    Parameters
    ----------
    report : ScanReport
        The report to save.
    output_path : str
        File path for the JSON report.
    """
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report.to_dict(), f, indent=2)


# ============================================================================
# CLI entry point
# ============================================================================


def run_scan(
    staged_only: bool = False,
    ci_mode: bool = False,
    output: Optional[str] = None,
) -> int:
    """Execute the security scan and return exit code.

    Parameters
    ----------
    staged_only : bool
        If True, scan only git-staged files.  If False, scan all files.
    ci_mode : bool
        If True, use compact output suitable for CI/CD pipelines.
    output : str or None
        Custom output path for the report JSON.  Defaults to
        ``security_audit_report.json`` in the project root.

    Returns
    -------
    int
        Exit code: 0 = clean, 1 = violations found, 2 = internal error.
    """
    # Determine project root (parent of scripts/)
    project_root = Path(__file__).resolve().parent.parent.parent
    report_path = output or str(project_root / "security_audit_report.json")

    try:
        if staged_only:
            scan_type = "pre-commit"
            files = get_staged_files()
        else:
            scan_type = "full-scan" if not ci_mode else "ci"
            files = get_all_files(str(project_root))

        # Filter to scannable files
        files = [f for f in files if should_scan_file(f)]

        # Scan all files
        all_violations: List[Violation] = []
        for file_path in files:
            full_path = project_root / file_path
            violations = scan_file_for_violations(str(full_path))
            all_violations.extend(violations)

        # Generate report
        report = generate_report(scan_type, files, all_violations)
        save_report(report, report_path)

        # Print results
        if not ci_mode:
            print_scan_results(report, all_violations)
        else:
            print_ci_results(report, all_violations)

        # Exit code gate
        if report.critical_count > 0 or report.high_count > 0:
            return 1
        return 0

    except subprocess.CalledProcessError as e:
        print(f"ERROR: Git command failed: {e}", file=sys.stderr)
        return 2
    except Exception as e:
        print(f"ERROR: Scan failed: {e}", file=sys.stderr)
        return 2


def print_scan_results(report: ScanReport, violations: List[Violation]) -> None:
    """Print human-readable scan results.

    Parameters
    ----------
    report : ScanReport
        Aggregated scan report.
    violations : list of Violation
        All violations found.
    """
    print("\n" + "=" * 72)
    print("  SECURITY SCAN REPORT — Eisenhower Portfolio Manager")
    print("=" * 72)
    print(f"  Scan type:        {report.scan_type}")
    print(f"  Timestamp:        {report.timestamp}")
    print(f"  Files scanned:    {report.total_files_scanned}")
    print(f"  Violations:       {report.total_violations}")
    print(f"    CRITICAL:       {report.critical_count}")
    print(f"    HIGH:           {report.high_count}")
    print("-" * 72)

    if violations:
        print("\n  VIOLATIONS DETECTED:\n")
        for v in violations:
            severity_marker = "🔴" if v.severity == "CRITICAL" else "🟠"
            print(f"  {severity_marker} [{v.severity}] {v.category}")
            print(f"     File:   {v.file}:{v.line}")
            print(f"     Issue:  {v.message}")
            if v.match_preview:
                print(f"     Match:  {v.match_preview[:60]}")
            print()
    else:
        print("\n  ✅ No security violations detected.\n")

    print("=" * 72)
    if report.total_violations > 0:
        print("  ❌ SCAN FAILED — Commit rejected due to security violations.")
        print(f"  Report saved to: security_audit_report.json")
    else:
        print("  ✅ SCAN PASSED — All clear for commit.")
    print("=" * 72 + "\n")


def print_ci_results(report: ScanReport, violations: List[Violation]) -> None:
    """Print compact CI/CD-friendly results.

    Parameters
    ----------
    report : ScanReport
        Aggregated scan report.
    violations : list of Violation
        All violations found.
    """
    if violations:
        for v in violations:
            print(
                f"::{v.severity} file={v.file},line={v.line},"
                f"title={v.category}::{v.message}"
            )
        print(f"::error::Security scan failed: {report.total_violations} violations")
    else:
        print("::notice::Security scan passed: no violations")


# ============================================================================
# Main
# ============================================================================


def main() -> None:
    """CLI entry point for the security scan."""
    parser = argparse.ArgumentParser(
        description="Pre-commit security scanner for sovereign air-gapped deployment.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python -m scripts.security.git_hooks --staged    # Pre-commit hook\n"
            "  python -m scripts.security.git_hooks --all       # Full working tree\n"
            "  python -m scripts.security.git_hooks --ci        # CI/CD pipeline mode\n"
        ),
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--staged", action="store_true",
        help="Scan only git-staged files (pre-commit mode).",
    )
    group.add_argument(
        "--all", action="store_true", dest="all_files",
        help="Scan all files in the working tree.",
    )
    group.add_argument(
        "--ci", action="store_true",
        help="CI/CD mode: compact output, full scan.",
    )
    parser.add_argument(
        "--output", "-o", type=str, default=None,
        help="Custom output path for the JSON report.",
    )

    args = parser.parse_args()

    staged_only = args.staged
    ci_mode = args.ci
    output = args.output

    exit_code = run_scan(
        staged_only=staged_only,
        ci_mode=ci_mode,
        output=output,
    )
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
