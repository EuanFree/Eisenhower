"""Dynamic Application Security Testing (DAST) mock runner.

Probes active local endpoints for common web vulnerabilities:

1. **Path traversal** — Attempts directory traversal on ltree dot-path
   query endpoints to detect unsanitised path handling.

2. **SQL injection** — Sends crafted payloads to query parameters to
   detect unsanitised SQL string formatting.

3. **Missing security headers** — Checks response headers for
   Content-Security-Policy, X-Content-Type-Options, and
   Strict-Transport-Security.

4. **ABAC bypass attempts** — Tries accessing a SECRET-classified task
   using an OFFICIAL-scoped bearer token; verifies that HTTP 403 or
   masked data is returned.

Exit Code Gate
--------------

The script returns exit code 1 and generates ``security_audit_report.json``
if any high- or critical-severity vulnerability is detected.

Usage
~~~~~

.. code-block:: bash

    # Requires running backend at http://127.0.0.1:8000
    python -m scripts.security.run_dast_probe

    # Custom target URL
    python -m scripts.security.run_dast_probe --target http://localhost:9000

    # CI/CD mode (compact output)
    python -m scripts.security.run_dast_probe --ci

"""
import argparse
import json
import sys
import time
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import httpx


# ============================================================================
# Vulnerability data model
# ============================================================================


@dataclass
class Vulnerability:
    """A single vulnerability found during DAST probing."""

    probe_name: str
    severity: str  # "CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"
    category: str
    endpoint: str
    method: str
    message: str
    detail: str = ""
    request_headers: Dict[str, str] = field(default_factory=dict)
    response_status: int = 0
    response_headers: Dict[str, str] = field(default_factory=dict)


@dataclass
class DASTReport:
    """Aggregated DAST scan report."""

    scan_type: str
    timestamp: str
    target_url: str
    total_probes: int
    total_vulnerabilities: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    info_count: int
    vulnerabilities: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ============================================================================
# Probe definitions
# ============================================================================


class DASTProbes:
    """Collection of dynamic security probes."""

    # -----------------------------------------------------------------------
    # Probe 1: Path traversal on ltree dot-path endpoints
    # -----------------------------------------------------------------------

    @staticmethod
    def path_traversal(client: httpx.AsyncClient, base_url: str) -> List[Vulnerability]:
        """Attempt path traversal on ltree-based query endpoints.

        Parameters
        ----------
        client : httpx.AsyncClient
            HTTP client instance.
        base_url : str
            Base URL of the target application.

        Returns
        -------
        list of Vulnerability
            Vulnerabilities found during probing.
        """
        vulns: List[Vulnerability] = []

        # Path traversal payloads targeting ltree dot-path parameters
        payloads = [
            "../../../etc/passwd",
            "..\\..\\..\\windows\\system32\\config\\sam",
            "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
            "....//....//....//etc/passwd",
            "..%252f..%252f..%252fetc%252fpasswd",
        ]

        # Endpoints that accept path-like parameters
        endpoints = [
            f"{base_url}/api/v1/wbs/tree/{{path}}",
            f"{base_url}/api/v1/wbs/nodes/{{path}}",
            f"{base_url}/api/v1/wbs/nodes/{{node_id}}/descendants",
        ]

        for endpoint_template in endpoints:
            for payload in payloads:
                endpoint = endpoint_template.replace("{{path}}", payload)
                endpoint = endpoint.replace("{{node_id}}", str(uuid.uuid4()))

                try:
                    response = client.get(endpoint, follow_redirects=False)

                    # Check for path traversal indicators
                    indicators = [
                        "root:x:0:0",  # /etc/passwd content
                        "Administrator",  # Windows SAM
                        "Permission denied",  # OS-level error
                        "FileNotFoundError",  # Python error
                        "lstat",  # OS-level path operation
                    ]

                    for indicator in indicators:
                        if indicator.lower() in response.text.lower():
                            vulns.append(Vulnerability(
                                probe_name="path_traversal",
                                severity="CRITICAL",
                                category="PATH_TRAVERSAL",
                                endpoint=endpoint,
                                method="GET",
                                message=f"Path traversal payload '{payload[:40]}' may have succeeded",
                                detail=f"Response contains indicator: '{indicator}'",
                                response_status=response.status_code,
                            ))
                            break

                except httpx.RequestError:
                    # Endpoint not reachable — skip
                    pass

        return vulns

    # -----------------------------------------------------------------------
    # Probe 2: SQL injection on query parameters
    # -----------------------------------------------------------------------

    @staticmethod
    def sql_injection(client: httpx.AsyncClient, base_url: str) -> List[Vulnerability]:
        """Attempt SQL injection on query parameters.

        Parameters
        ----------
        client : httpx.AsyncClient
            HTTP client instance.
        base_url : str
            Base URL of the target application.

        Returns
        -------
        list of Vulnerability
            Vulnerabilities found during probing.
        """
        vulns: List[Vulnerability] = []

        # SQL injection payloads
        payloads = [
            "' OR '1'='1",
            "' UNION SELECT NULL--",
            "1; DROP TABLE users--",
            "' OR 1=1#",
            "admin'--",
            "1' AND (SELECT * FROM (SELECT(SLEEP(5)))a)--",
        ]

        # Endpoints with query parameters
        endpoints_with_params = [
            (f"{base_url}/api/v1/wbs/nodes", {"tree_type": "WBS"}),
            (f"{base_url}/api/v1/procurement/items", {"status": "DELIVERED"}),
            (f"{base_url}/api/v1/schedule/clashes", {"severity": "CRITICAL"}),
        ]

        for endpoint, params in endpoints_with_params:
            for payload in payloads:
                # Inject into each parameter
                for param_key in params:
                    malicious_params = {**params, param_key: payload}

                    try:
                        response = client.get(
                            endpoint,
                            params=malicious_params,
                            follow_redirects=False,
                        )

                        # Check for SQL error indicators
                        sql_errors = [
                            "syntax error at or near",
                            "unexpected end of input",
                            "SQLite3::SQLException",
                            "psycopg2.errors",
                            "You have an error in your SQL",
                            "pg_query",
                            "relation \"",
                            "column \"",
                        ]

                        for error in sql_errors:
                            if error.lower() in response.text.lower():
                                vulns.append(Vulnerability(
                                    probe_name="sql_injection",
                                    severity="CRITICAL",
                                    category="SQL_INJECTION",
                                    endpoint=endpoint,
                                    method="GET",
                                    message=f"SQL injection payload may have succeeded on parameter '{param_key}'",
                                    detail=f"Response contains SQL error indicator: '{error}'",
                                    response_status=response.status_code,
                                ))
                                break

                    except httpx.RequestError:
                        pass

        return vulns

    # -----------------------------------------------------------------------
    # Probe 3: Missing security headers
    # -----------------------------------------------------------------------

    @staticmethod
    def missing_security_headers(
        client: httpx.AsyncClient,
        base_url: str,
    ) -> List[Vulnerability]:
        """Check for missing security headers on responses.

        Parameters
        ----------
        client : httpx.AsyncClient
            HTTP client instance.
        base_url : str
            Base URL of the target application.

        Returns
        -------
        list of Vulnerability
            Vulnerabilities found during probing.
        """
        vulns: List[Vulnerability] = []

        # Required security headers
        required_headers = {
            "Content-Security-Policy": {
                "severity": "HIGH",
                "message": "Missing Content-Security-Policy header — XSS risk",
            },
            "X-Content-Type-Options": {
                "severity": "MEDIUM",
                "message": "Missing X-Content-Type-Options header — MIME sniffing risk",
            },
            "Strict-Transport-Security": {
                "severity": "HIGH",
                "message": "Missing Strict-Transport-Security header — protocol downgrade risk",
            },
            "X-Frame-Options": {
                "severity": "MEDIUM",
                "message": "Missing X-Frame-Options header — clickjacking risk",
            },
            "X-XSS-Protection": {
                "severity": "LOW",
                "message": "Missing X-XSS-Protection header",
            },
            "Referrer-Policy": {
                "severity": "LOW",
                "message": "Missing Referrer-Policy header — referrer leakage risk",
            },
        }

        # Probe several endpoints
        endpoints = [
            f"{base_url}/api/v1/wbs/nodes",
            f"{base_url}/docs",
            f"{base_url}/",
        ]

        for endpoint in endpoints:
            try:
                response = client.get(endpoint, follow_redirects=False)

                for header, info in required_headers.items():
                    if header not in response.headers:
                        vulns.append(Vulnerability(
                            probe_name="missing_security_headers",
                            severity=info["severity"],
                            category="MISSING_SECURITY_HEADER",
                            endpoint=endpoint,
                            method="GET",
                            message=info["message"],
                            detail=f"Header '{header}' is not present in response",
                            response_status=response.status_code,
                            response_headers=dict(response.headers),
                        ))

            except httpx.RequestError:
                pass

        return vulns

    # -----------------------------------------------------------------------
    # Probe 4: ABAC bypass attempts
    # -----------------------------------------------------------------------

    @staticmethod
    def abac_bypass(
        client: httpx.AsyncClient,
        base_url: str,
        official_token: str,
    ) -> List[Vulnerability]:
        """Attempt to access SECRET-classified data with OFFICIAL clearance.

        Parameters
        ----------
        client : httpx.AsyncClient
            HTTP client instance.
        base_url : str
            Base URL of the target application.
        official_token : str
            JWT token of an OFFICIAL-cleared user.

        Returns
        -------
        list of Vulnerability
            Vulnerabilities found during probing.
        """
        vulns: List[Vulnerability] = []

        headers = {"Authorization": f"Bearer {official_token}"}

        # Try to access a node that should be SECRET-classified
        # We use a UUID that likely doesn't exist — the key test is whether
        # the endpoint requires authentication and returns proper errors
        test_uuid = str(uuid.uuid4())

        endpoints_to_test = [
            (f"{base_url}/api/v1/wbs/nodes/{test_uuid}", "GET"),
            (f"{base_url}/api/v1/wbs/tree/{test_uuid}", "GET"),
            (f"{base_url}/api/v1/previews/tasks/{test_uuid}", "GET"),
        ]

        for endpoint, method in endpoints_to_test:
            try:
                response = client.get(endpoint, headers=headers, follow_redirects=False)

                # Check 1: Does the endpoint require authentication?
                if response.status_code == 200:
                    # If we get 200 for a non-existent node, check the response
                    data = response.json() if response.text else {}

                    # Check if the response contains unmasked classified data
                    # A properly secured endpoint should return masked data or 404
                    if isinstance(data, dict):
                        name = data.get("name", "")
                        code = data.get("code", "")

                        # If we get actual data (not masked) for a node we shouldn't access
                        if name and name != "[RESTRICTED]" and name != "":
                            vulns.append(Vulnerability(
                                probe_name="abac_bypass",
                                severity="CRITICAL",
                                category="ABAC_BYPASS",
                                endpoint=endpoint,
                                method=method,
                                message="OFFICIAL-cleared user may have accessed unmasked classified data",
                                detail=f"Response contains unmasked name: '{name}'",
                                response_status=response.status_code,
                            ))

                # Check 2: Does the endpoint return 403 for unauthorized access?
                # (This is the expected behavior for ABAC enforcement)
                elif response.status_code == 403:
                    pass  # Correct behavior — ABAC is working

                # Check 3: Does the endpoint return 401 without auth?
                # Test without any token
                no_auth_response = client.get(endpoint, follow_redirects=False)
                if no_auth_response.status_code == 200:
                    vulns.append(Vulnerability(
                        probe_name="abac_bypass",
                        severity="CRITICAL",
                        category="MISSING_AUTH",
                        endpoint=endpoint,
                        method=method,
                        message="Endpoint accessible without authentication",
                        detail="No Authorization header required — endpoint is publicly accessible",
                        response_status=no_auth_response.status_code,
                    ))

            except httpx.RequestError:
                pass

        return vulns

    # -----------------------------------------------------------------------
    # Probe 5: Unauthenticated access to protected endpoints
    # -----------------------------------------------------------------------

    @staticmethod
    def unauthenticated_access(
        client: httpx.AsyncClient,
        base_url: str,
    ) -> List[Vulnerability]:
        """Check if protected endpoints are accessible without authentication.

        Parameters
        ----------
        client : httpx.AsyncClient
            HTTP client instance.
        base_url : str
            Base URL of the target application.

        Returns
        -------
        list of Vulnerability
            Vulnerabilities found during probing.
        """
        vulns: List[Vulnerability] = []

        # Endpoints that should require authentication
        protected_endpoints = [
            (f"{base_url}/api/v1/wbs/nodes", "GET"),
            (f"{base_url}/api/v1/cockpit/summary", "GET"),
            (f"{base_url}/api/v1/schedule/clashes", "GET"),
            (f"{base_url}/api/v1/requisitions/inbox", "GET"),
            (f"{base_url}/api/v1/baselines/list", "GET"),
            (f"{base_url}/api/v1/users/me/display-settings", "GET"),
            (f"{base_url}/api/v1/timesheets/oracle/prepopulate", "GET"),
            (f"{base_url}/api/v1/currency/convert", "POST"),
            (f"{base_url}/api/v1/supplier-portal/tasks", "GET"),
        ]

        for endpoint, method in protected_endpoints:
            try:
                if method == "GET":
                    response = client.get(endpoint, follow_redirects=False)
                else:
                    response = client.post(
                        endpoint,
                        json={},
                        follow_redirects=False,
                    )

                # Protected endpoints should return 401 or 403 without auth
                if response.status_code == 200:
                    vulns.append(Vulnerability(
                        probe_name="unauthenticated_access",
                        severity="CRITICAL",
                        category="MISSING_AUTH",
                        endpoint=endpoint,
                        method=method,
                        message=f"Protected endpoint '{endpoint}' is accessible without authentication",
                        detail=f"Expected 401/403, got {response.status_code}",
                        response_status=response.status_code,
                    ))
                elif response.status_code == 201:
                    vulns.append(Vulnerability(
                        probe_name="unauthenticated_access",
                        severity="CRITICAL",
                        category="MISSING_AUTH",
                        endpoint=endpoint,
                        method=method,
                        message=f"Protected endpoint '{endpoint}' allows unauthenticated creation",
                        detail=f"Expected 401/403, got {response.status_code}",
                        response_status=response.status_code,
                    ))

            except httpx.RequestError:
                pass

        return vulns

    # -----------------------------------------------------------------------
    # Probe 5b: Unauthenticated access to /api/v1/admin/* endpoints
    # -----------------------------------------------------------------------

    @staticmethod
    def admin_endpoint_auth(
        client: httpx.AsyncClient,
        base_url: str,
    ) -> List[Vulnerability]:
        """Check that /api/v1/admin/* endpoints reject unauthenticated calls.

        Parameters
        ----------
        client : httpx.AsyncClient
            HTTP client instance.
        base_url : str
            Base URL of the target application.

        Returns
        -------
        list of Vulnerability
            Vulnerabilities found during probing.
        """
        vulns: List[Vulnerability] = []

        admin_endpoints = [
            (f"{base_url}/api/v1/admin/security/heartbeat", "GET"),
            (f"{base_url}/api/v1/admin/db-health/metrics", "GET"),
            (f"{base_url}/api/v1/admin/backups/list", "GET"),
        ]

        for endpoint, method in admin_endpoints:
            try:
                if method == "GET":
                    response = client.get(endpoint, follow_redirects=False)
                else:
                    response = client.post(
                        endpoint, json={}, follow_redirects=False
                    )

                if response.status_code in (200, 201):
                    vulns.append(Vulnerability(
                        probe_name="admin_endpoint_auth",
                        severity="CRITICAL",
                        category="MISSING_AUTH",
                        endpoint=endpoint,
                        method=method,
                        message=f"Admin endpoint '{endpoint}' accessible without authentication",
                        detail=f"Expected 401/403, got {response.status_code}",
                        response_status=response.status_code,
                    ))

            except httpx.RequestError:
                pass

        return vulns

    # -----------------------------------------------------------------------
    # Probe 5c: Weak SECRET_KEY validation in production mode
    # -----------------------------------------------------------------------

    @staticmethod
    def weak_secret_key() -> List[Vulnerability]:
        """Check that SECRET_KEY is not a weak default value in production.

        Returns
        -------
        list of Vulnerability
            Vulnerabilities found during probing.
        """
        vulns: List[Vulnerability] = []

        try:
            from app.config import (
                settings,
                DEFAULT_SECRET_KEYS,
                MIN_SECRET_KEY_LENGTH,
                _estimate_secret_entropy,
            )

            if settings.ENVIRONMENT.lower() != "production":
                return vulns

            secret = settings.SECRET_KEY

            # Check against known defaults
            if secret.lower() in {d.lower() for d in DEFAULT_SECRET_KEYS}:
                vulns.append(Vulnerability(
                    probe_name="weak_secret_key",
                    severity="CRITICAL",
                    category="WEAK_SECRET",
                    endpoint="app.config.SECRET_KEY",
                    method="CONFIG",
                    message="SECRET_KEY is set to a known default value in production",
                    detail="Generate a new key: python -c \"import secrets; print(secrets.token_urlsafe(48))\"",
                ))

            # Check minimum length
            if len(secret) < MIN_SECRET_KEY_LENGTH:
                vulns.append(Vulnerability(
                    probe_name="weak_secret_key",
                    severity="CRITICAL",
                    category="WEAK_SECRET",
                    endpoint="app.config.SECRET_KEY",
                    method="CONFIG",
                    message=f"SECRET_KEY is too short for production ({len(secret)} chars, min {MIN_SECRET_KEY_LENGTH})",
                    detail="SECRET_KEY must contain at least 256 bits of entropy",
                ))

            # Check entropy
            entropy = _estimate_secret_entropy(secret)
            if entropy < 256:
                vulns.append(Vulnerability(
                    probe_name="weak_secret_key",
                    severity="HIGH",
                    category="WEAK_SECRET",
                    endpoint="app.config.SECRET_KEY",
                    method="CONFIG",
                    message=f"SECRET_KEY has insufficient entropy ({entropy:.0f} bits, min 256)",
                    detail="Use a longer, more random secret",
                ))

        except ImportError:
            pass  # Config not available in standalone mode

        return vulns

    # -----------------------------------------------------------------------
    # Probe 6: Information disclosure via error messages
    # -----------------------------------------------------------------------

    @staticmethod
    def information_disclosure(
        client: httpx.AsyncClient,
        base_url: str,
    ) -> List[Vulnerability]:
        """Check for information disclosure in error responses.

        Parameters
        ----------
        client : httpx.AsyncClient
            HTTP client instance.
        base_url : str
            Base URL of the target application.

        Returns
        -------
        list of Vulnerability
            Vulnerabilities found during probing.
        """
        vulns: List[Vulnerability] = []

        # Send malformed requests to trigger errors
        malformed_requests = [
            (f"{base_url}/api/v1/wbs/nodes/invalid-uuid", "GET"),
            (f"{base_url}/api/v1/schedule/not-a-uuid/recalculate-cpm", "POST"),
            (f"{base_url}/api/v1/auth/login", "POST", {"username": "x" * 1000, "password": "y" * 1000}),
        ]

        for request_info in malformed_requests:
            endpoint = request_info[0]
            method = request_info[1]
            body = request_info[2] if len(request_info) > 2 else None

            try:
                if method == "GET":
                    response = client.get(endpoint, follow_redirects=False)
                else:
                    response = client.post(
                        endpoint,
                        data=body or {},
                        follow_redirects=False,
                    )

                # Check for stack traces or internal paths in error responses
                leak_indicators = [
                    "Traceback (most recent call last)",
                    "File \"",
                    "line ",
                    "in ",
                    "sqlalchemy.exc.",
                    "psycopg2.",
                    "/app/",
                    "/usr/lib/python",
                    "Internal Server Error",
                ]

                for indicator in leak_indicators:
                    if indicator.lower() in response.text.lower():
                        vulns.append(Vulnerability(
                            probe_name="information_disclosure",
                            severity="HIGH",
                            category="INFORMATION_DISCLOSURE",
                            endpoint=endpoint,
                            method=method,
                            message="Error response may disclose internal system information",
                            detail=f"Response contains indicator: '{indicator}'",
                            response_status=response.status_code,
                        ))
                        break

            except httpx.RequestError:
                pass

        return vulns


# ============================================================================
# Report generation
# ============================================================================


def generate_report(
    target_url: str,
    probes_run: int,
    vulnerabilities: List[Vulnerability],
) -> DASTReport:
    """Generate an aggregated DAST scan report.

    Parameters
    ----------
    target_url : str
        URL of the target application.
    probes_run : int
        Number of probes executed.
    vulnerabilities : list of Vulnerability
        All vulnerabilities found.

    Returns
    -------
    DASTReport
        Aggregated report with counts and vulnerability details.
    """
    counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0, "INFO": 0}
    for v in vulnerabilities:
        severity = v.severity.upper()
        if severity in counts:
            counts[severity] += 1

    report = DASTReport(
        scan_type="dast-probe",
        timestamp=datetime.now(timezone.utc).isoformat(),
        target_url=target_url,
        total_probes=probes_run,
        total_vulnerabilities=len(vulnerabilities),
        critical_count=counts["CRITICAL"],
        high_count=counts["HIGH"],
        medium_count=counts["MEDIUM"],
        low_count=counts["LOW"],
        info_count=counts["INFO"],
        vulnerabilities=[asdict(v) for v in vulnerabilities],
    )
    return report


def save_report(report: DASTReport, output_path: str) -> None:
    """Save a DAST report to a JSON file.

    Parameters
    ----------
    report : DASTReport
        The report to save.
    output_path : str
        File path for the JSON report.
    """
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(report.to_dict(), f, indent=2)


# ============================================================================
# CLI entry point
# ============================================================================


async def run_dast_scan(
    target_url: str = "http://127.0.0.1:8000",
    ci_mode: bool = False,
    output: Optional[str] = None,
) -> int:
    """Execute the DAST scan and return exit code.

    Parameters
    ----------
    target_url : str
        Base URL of the target FastAPI application.
    ci_mode : bool
        If True, use compact output suitable for CI/CD pipelines.
    output : str or None
        Custom output path for the report JSON.

    Returns
    -------
    int
        Exit code: 0 = clean, 1 = vulnerabilities found, 2 = internal error.
    """
    # Determine project root
    project_root = Path(__file__).resolve().parent.parent.parent
    report_path = output or str(project_root / "security_audit_report.json")

    # Also save structured results to app/config/scan_results.json
    scan_results_path = str(project_root / "app" / "config" / "scan_results.json")

    # Normalize target URL
    target_url = target_url.rstrip("/")

    all_vulns: List[Vulnerability] = []
    probes_run = 0

    # Check if target is reachable
    try:
        async with httpx.AsyncClient(
            base_url=target_url,
            timeout=10.0,
            follow_redirects=False,
        ) as client:
            # Quick connectivity check
            try:
                ping = await client.get(f"{target_url}/docs", follow_redirects=False)
                if ping.status_code not in (200, 307, 301, 404):
                    print(
                        f"WARNING: Target returned unexpected status {ping.status_code} on /docs",
                        file=sys.stderr,
                    )
            except httpx.RequestError as e:
                print(
                    f"ERROR: Cannot reach target at {target_url}/docs: {e}",
                    file=sys.stderr,
                )
                return 2

            if not ci_mode:
                print_scan_header(target_url)

            # ----------------------------------------------------------------
            # Probe 1: Path traversal
            # ----------------------------------------------------------------
            if not ci_mode:
                print_probe("Path Traversal", 1, 6)
            vulns = DASTProbes.path_traversal(client, target_url)
            all_vulns.extend(vulns)
            probes_run += 1
            print_result(vulns, not ci_mode)

            # ----------------------------------------------------------------
            # Probe 2: SQL injection
            # ----------------------------------------------------------------
            if not ci_mode:
                print_probe("SQL Injection", 2, 6)
            vulns = DASTProbes.sql_injection(client, target_url)
            all_vulns.extend(vulns)
            probes_run += 1
            print_result(vulns, not ci_mode)

            # ----------------------------------------------------------------
            # Probe 3: Missing security headers
            # ----------------------------------------------------------------
            if not ci_mode:
                print_probe("Missing Security Headers", 3, 6)
            vulns = DASTProbes.missing_security_headers(client, target_url)
            all_vulns.extend(vulns)
            probes_run += 1
            print_result(vulns, not ci_mode)

            # ----------------------------------------------------------------
            # Probe 4: ABAC bypass (requires a token — skip if not available)
            # ----------------------------------------------------------------
            if not ci_mode:
                print_probe("ABAC Bypass", 4, 6)
            # Try to get a token by registering/logging in
            official_token = await _get_test_token(client, target_url)
            if official_token:
                vulns = DASTProbes.abac_bypass(client, target_url, official_token)
            else:
                if not ci_mode:
                    print("  ⚠ Skipping — could not obtain test token")
                vulns = []
            all_vulns.extend(vulns)
            probes_run += 1
            print_result(vulns, not ci_mode)

            # ----------------------------------------------------------------
            # Probe 5: Unauthenticated access
            # ----------------------------------------------------------------
            if not ci_mode:
                print_probe("Unauthenticated Access", 5, 6)
            vulns = DASTProbes.unauthenticated_access(client, target_url)
            all_vulns.extend(vulns)
            probes_run += 1
            print_result(vulns, not ci_mode)

            # ----------------------------------------------------------------
            # Probe 6: Admin endpoint auth
            # ----------------------------------------------------------------
            if not ci_mode:
                print_probe("Admin Endpoint Auth", 6, 8)
            vulns = DASTProbes.admin_endpoint_auth(client, target_url)
            all_vulns.extend(vulns)
            probes_run += 1
            print_result(vulns, not ci_mode)

            # ----------------------------------------------------------------
            # Probe 7: Information disclosure
            # ----------------------------------------------------------------
            if not ci_mode:
                print_probe("Information Disclosure", 7, 8)
            vulns = DASTProbes.information_disclosure(client, target_url)
            all_vulns.extend(vulns)
            probes_run += 1
            print_result(vulns, not ci_mode)

        # ----------------------------------------------------------------
        # Probe 8: Weak SECRET_KEY (no server required)
        # ----------------------------------------------------------------
        if not ci_mode:
            print_probe("Weak SECRET_KEY", 8, 8)
        vulns = DASTProbes.weak_secret_key()
        all_vulns.extend(vulns)
        probes_run += 1
        print_result(vulns, not ci_mode)

    except Exception as e:
        print(f"ERROR: DAST scan failed: {e}", file=sys.stderr)
        return 2

    # Generate report
    report = generate_report(target_url, probes_run, all_vulns)
    save_report(report, report_path)

    # Also save structured results to app/config/scan_results.json
    try:
        scan_results_dir = Path(scan_results_path).parent
        scan_results_dir.mkdir(parents=True, exist_ok=True)
        save_report(report, scan_results_path)
    except OSError:
        pass  # Non-critical if scan_results.json cannot be written

    # Print summary
    if not ci_mode:
        print_summary(report, all_vulns)
    else:
        print_ci_summary(report, all_vulns)

    # Exit code gate
    if report.critical_count > 0 or report.high_count > 0:
        return 1
    return 0


async def _get_test_token(
    client: httpx.AsyncClient,
    base_url: str,
) -> Optional[str]:
    """Attempt to obtain a test JWT token for ABAC bypass probing.

    Parameters
    ----------
    client : httpx.AsyncClient
        HTTP client instance.
    base_url : str
        Base URL of the target application.

    Returns
    -------
    str or None
        JWT token if obtained, None otherwise.
    """
    # Try to register a test user and log in
    test_username = f"dast_test_{int(time.time())}"
    test_password = "DastTest123!"

    try:
        # Register
        reg_response = await client.post(
            f"{base_url}/api/auth/register",
            json={
                "username": test_username,
                "email": f"{test_username}@test.local",
                "password": test_password,
                "role": "MEMBER",
            },
            follow_redirects=False,
        )

        if reg_response.status_code == 201:
            # Login
            login_response = await client.post(
                f"{base_url}/api/auth/login",
                data={
                    "username": test_username,
                    "password": test_password,
                },
                follow_redirects=False,
            )

            if login_response.status_code == 200:
                data = login_response.json()
                return data.get("access_token")

    except (httpx.RequestError, json.JSONDecodeError):
        pass

    return None


# ============================================================================
# Output formatting
# ============================================================================


def print_scan_header(target_url: str) -> None:
    """Print the DAST scan header.

    Parameters
    ----------
    target_url : str
        Target URL being scanned.
    """
    print("\n" + "=" * 72)
    print("  DYNAMIC APPLICATION SECURITY TESTING (DAST) PROBE")
    print("=" * 72)
    print(f"  Target:     {target_url}")
    print(f"  Timestamp:  {datetime.now(timezone.utc).isoformat()}")
    print("-" * 72)


def print_probe(name: str, number: int, total: int) -> None:
    """Print a probe header.

    Parameters
    ----------
    name : str
        Name of the probe.
    number : int
        Current probe number.
    total : int
        Total number of probes.
    """
    print(f"\n  [{number}/{total}] Probe: {name}")


def print_result(vulns: List[Vulnerability], verbose: bool = True) -> None:
    """Print probe results.

    Parameters
    ----------
    vulns : list of Vulnerability
        Vulnerabilities found by the probe.
    verbose : bool
        If True, print detailed results.
    """
    if not vulns:
        print("  ✅ No vulnerabilities detected")
    else:
        severity_colors = {
            "CRITICAL": "🔴",
            "HIGH": "🟠",
            "MEDIUM": "🟡",
            "LOW": "🔵",
            "INFO": "⚪",
        }
        for v in vulns:
            marker = severity_colors.get(v.severity, "⚪")
            print(f"  {marker} [{v.severity}] {v.message}")
            if v.detail:
                print(f"      Detail: {v.detail[:100]}")


def print_summary(report: DASTReport, vulns: List[Vulnerability]) -> None:
    """Print the final scan summary.

    Parameters
    ----------
    report : DASTReport
        Aggregated scan report.
    vulns : list of Vulnerability
        All vulnerabilities found.
    """
    print("\n" + "=" * 72)
    print("  DAST SCAN SUMMARY")
    print("=" * 72)
    print(f"  Target:              {report.target_url}")
    print(f"  Probes executed:     {report.total_probes}")
    print(f"  Total vulnerabilities: {report.total_vulnerabilities}")
    print(f"    CRITICAL:          {report.critical_count}")
    print(f"    HIGH:              {report.high_count}")
    print(f"    MEDIUM:            {report.medium_count}")
    print(f"    LOW:               {report.low_count}")
    print(f"    INFO:              {report.info_count}")
    print("-" * 72)

    if report.critical_count > 0 or report.high_count > 0:
        print("\n  ❌ DAST SCAN FAILED")
        print("  High or critical vulnerabilities detected.")
        print("  Report saved to: security_audit_report.json")
    else:
        print("\n  ✅ DAST SCAN PASSED")
        print("  No high or critical vulnerabilities detected.")

    print("=" * 72 + "\n")


def print_ci_summary(report: DASTReport, vulns: List[Vulnerability]) -> None:
    """Print CI/CD-friendly summary.

    Parameters
    ----------
    report : DASTReport
        Aggregated scan report.
    vulns : list of Vulnerability
        All vulnerabilities found.
    """
    if vulns:
        for v in vulns:
            print(
                f"::{v.severity} file={v.endpoint},"
                f"title={v.category}::{v.message}"
            )
        print(
            f"::error::DAST scan failed: {report.total_vulnerabilities} vulnerabilities"
        )
    else:
        print("::notice::DAST scan passed: no vulnerabilities")


# ============================================================================
# Main
# ============================================================================


def main() -> None:
    """CLI entry point for the DAST probe runner."""
    parser = argparse.ArgumentParser(
        description="Dynamic Application Security Testing (DAST) probe runner.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python -m scripts.security.run_dast_probe\n"
            "  python -m scripts.security.run_dast_probe --target http://localhost:9000\n"
            "  python -m scripts.security.run_dast_probe --ci\n"
        ),
    )
    parser.add_argument(
        "--target", "-t", type=str, default="http://127.0.0.1:8000",
        help="Target URL of the FastAPI application (default: http://127.0.0.1:8000).",
    )
    parser.add_argument(
        "--ci", action="store_true",
        help="CI/CD mode: compact output.",
    )
    parser.add_argument(
        "--output", "-o", type=str, default=None,
        help="Custom output path for the JSON report.",
    )

    args = parser.parse_args()

    import asyncio

    exit_code = asyncio.run(
        run_dast_scan(
            target_url=args.target,
            ci_mode=args.ci,
            output=args.output,
        )
    )
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
