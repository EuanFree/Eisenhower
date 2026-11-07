"""Security scanning pipeline for sovereign air-gapped deployment.

This package provides automated static and dynamic security scanning tools
to enforce zero-leakage policies before code deployment into classified
environments.

Components
----------

1. **git_hooks.py** — Pre-commit and commit-hook hardening that scans
   staged commits for hardcoded secrets, cryptographic private keys,
   AWS/MinIO credentials, and defence classification indicators.

2. **run_sast.sh** — Static Application Security Testing (SAST) harness
   that orchestrates offline scanners: Bandit (Python security linting),
   pip-audit (CVE database auditing), and Semgrep (FastAPI router audit).

3. **run_dast_probe.py** — Dynamic Application Security Testing (DAST)
   mock runner that probes active local endpoints for path traversal,
   SQL injection, missing security headers, and ABAC bypass attempts.

4. **generate_sbom.py** — Automated CycloneDX v1.5 Software Bill of
   Materials (SBOM) generator that inspects Python dependencies,
   frontend npm packages, and Docker base images to produce a unified
   JSON manifest at ``dist/sbom/cyclonedx.json``.

5. **sign_release_manifest.sh** — Cryptographic signing script that
   produces a detached Ed25519 signature for the SBOM manifest using
   the release engineering private key (HSM or software fallback).

All scripts generate ``security_audit_report.json`` and return exit code 1
if any high- or critical-severity vulnerability is detected.

Usage
~~~~~

.. code-block:: bash

    # Pre-commit hook (run manually or install as git hook)
    python -m scripts.security.git_hooks --staged

    # SAST scan (requires bandit, pip-audit, semgrep installed)
    bash scripts/security/run_sast.sh

    # DAST probe (requires running backend at http://127.0.0.1:8000)
    python -m scripts.security.run_dast_probe

    # Generate CycloneDX SBOM manifest
    python scripts/security/generate_sbom.py

    # Generate and sign SBOM
    python scripts/security/generate_sbom.py --sign

"""
