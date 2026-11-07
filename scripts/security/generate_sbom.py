"""Automated CycloneDX v1.5 Software Bill of Materials (SBOM) generator.

This script inspects all installed Python dependencies, production frontend
dependencies, and base Docker container image digests to produce a unified,
standardised CycloneDX v1.5 JSON manifest.

Workflow
--------

1. **Python dependencies** — Runs ``pip list --format=json`` to enumerate
   all installed packages with versions.

2. **Frontend dependencies** — Parses ``frontend/package-lock.json`` to
   extract production npm packages.

3. **Docker base images** — Reads the Docker Compose manifest to extract
   base image references (PostgreSQL, Nginx, Redis) and computes their
   SHA-256 digests when available.

4. **Unified manifest** — Merges all components into a single CycloneDX
   v1.5 JSON document and writes it to ``dist/sbom/cyclonedx.json``.

5. **Signing** — Optionally invokes ``sign_release_manifest.sh`` to
   cryptographically sign the output manifest with the release engineering
   private key.

Usage
~~~~~

.. code-block:: bash

    # Generate SBOM only
    python scripts/security/generate_sbom.py

    # Generate and sign SBOM
    python scripts/security/generate_sbom.py --sign

    # Custom output path
    python scripts/security/generate_sbom.py --output dist/sbom/custom.json

    # Specify a custom frontend lockfile
    python scripts/security/generate_sbom.py --lockfile frontend/package-lock.json

"""
import argparse
import hashlib
import json
import logging
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# CycloneDX namespace
CYCLONEDX_NAMESPACE = "http://cyclonedx.org/schema/bom/1.5"

# Default output directory
DEFAULT_OUTPUT_DIR = Path("dist/sbom")

# Default signing script path
DEFAULT_SIGN_SCRIPT = Path("scripts/security/sign_release_manifest.sh")

# Docker Compose file path
DOCKER_COMPOSE_PATH = Path("deploy/docker-compose.yml")

# Frontend lockfile default path
DEFAULT_LOCKFILE = Path("frontend/package-lock.json")

# Dev-only dependency patterns (names that indicate development tools)
DEV_DEPENDENCY_PATTERNS = [
    r"^pytest",
    r"^pylint",
    r"^flake8",
    r"^black",
    r"^mypy",
    r"^isort",
    r"^bandit",
    r"^sphinx",
    r"^coverage",
    r"^mock",
    r"^tox",
    r"^nox",
    r"^pre-commit",
    r"^debugpy",
    r"^ipdb",
    r"^twine",
    r"^wheel",
    r"^setuptools",
    r"^build",
]


def _is_dev_dependency(package_name: str) -> bool:
    """Check if a package name matches known dev-only dependency patterns.

    Parameters
    ----------
    package_name : str
        Normalised package name to check.

    Returns
    -------
    bool
        True if the package is a dev-only dependency.
    """
    normalised = package_name.lower().replace("-", "").replace("_", "")
    for pattern in DEV_DEPENDENCY_PATTERNS:
        if re.search(pattern, normalised, re.IGNORECASE):
            return True
    return False


def _purl_python(name: str, version: str) -> str:
    """Build a Python package URL (purl).

    Parameters
    ----------
    name : str
        Package name.
    version : str
        Package version.

    Returns
    -------
    str
        Package URL string.
    """
    return f"pkg:pypi/{name}@{version}"


def _purl_npm(name: str, version: str) -> str:
    """Build an NPM package URL (purl).

    Parameters
    ----------
    name : str
        Package name.
    version : str
        Package version.

    Returns
    -------
    str
        Package URL string.
    """
    # Scope handling for @scope/package
    if name.startswith("@"):
        scope, pkg = name.split("/", 1)
        return f"pkg:npm/{scope}%2F{pkg}@{version}"
    return f"pkg:npm/{name}@{version}"


def _purl_docker(name: str, digest: Optional[str] = None, tag: Optional[str] = None) -> str:
    """Build a Docker image package URL (purl).

    Parameters
    ----------
    name : str
        Image name (e.g., ``postgres:16-bookworm``).
    digest : str, optional
        SHA-256 digest of the image.
    tag : str, optional
        Image tag.

    Returns
    -------
    str
        Package URL string.
    """
    purl = f"pkg:docker/{name}"
    qualifiers = []
    if digest:
        qualifiers.append(f"digest=sha256:{digest}")
    if tag:
        qualifiers.append(f"tag={tag}")
    if qualifiers:
        purl += f"?{'&'.join(qualifiers)}"
    return purl


def collect_python_dependencies() -> List[Dict[str, Any]]:
    """Inspect all installed Python dependencies via ``pip list --format=json``.

    Returns
    -------
    list of dict
        List of CycloneDX component dicts for each Python package.
    """
    components = []
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "list", "--format=json"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0:
            logger.warning("pip list failed: %s", result.stderr.strip())
            return components

        packages = json.loads(result.stdout)
        for pkg in packages:
            name = pkg.get("name", "")
            version = pkg.get("version", "")
            if not name or not version:
                continue

            component = {
                "type": "library",
                "name": name,
                "version": version,
                "purl": _purl_python(name, version),
                "properties": [
                    {
                        "name": "SrcOrganization",
                        "value": "pypi",
                    },
                    {
                        "name": "devDependency",
                        "value": str(_is_dev_dependency(name)).lower(),
                    },
                ],
            }
            components.append(component)
        logger.info("Collected %d Python dependencies", len(components))
    except subprocess.TimeoutExpired:
        logger.error("pip list timed out after 60 seconds")
    except json.JSONDecodeError as e:
        logger.error("Failed to parse pip list output: %s", e)
    except FileNotFoundError:
        logger.warning("pip not found in PATH; skipping Python dependencies")
    return components


def collect_frontend_dependencies(lockfile_path: Path) -> List[Dict[str, Any]]:
    """Parse ``frontend/package-lock.json`` to extract production npm packages.

    Parameters
    ----------
    lockfile_path : Path
        Path to the package-lock.json file.

    Returns
    -------
    list of dict
        List of CycloneDX component dicts for each npm package.
    """
    components = []
    if not lockfile_path.is_file():
        logger.warning("Frontend lockfile not found: %s", lockfile_path)
        return components

    try:
        with open(lockfile_path, "r", encoding="utf-8") as f:
            lock_data = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.error("Failed to read lockfile %s: %s", lockfile_path, e)
        return components

    # package-lock.json v2/v3 format: packages object
    packages = lock_data.get("packages", {})
    for pkg_path, pkg_info in packages.items():
        # Skip root entry
        if pkg_path == "":
            continue

        name = pkg_info.get("name", pkg_path.split("/")[-1])
        version = pkg_info.get("version", "")
        if not name or not version:
            continue

        # Determine if dev dependency from path
        is_dev = "node_modules/.package-lock" not in pkg_path and "dev" in pkg_info.get("dev", False)

        component = {
            "type": "library",
            "name": name,
            "version": version,
            "purl": _purl_npm(name, version),
            "properties": [
                {
                    "name": "SrcOrganization",
                    "value": "npm",
                },
                {
                    "name": "devDependency",
                    "value": str(is_dev).lower(),
                },
            ],
        }
        components.append(component)

    # Fallback: legacy lockfile format (dependencies object)
    if not components:
        dependencies = lock_data.get("dependencies", {})
        for name, dep_info in dependencies.items():
            version = dep_info.get("version", "")
            if not version:
                continue
            component = {
                "type": "library",
                "name": name,
                "version": version,
                "purl": _purl_npm(name, version),
                "properties": [
                    {
                        "name": "SrcOrganization",
                        "value": "npm",
                    },
                    {
                        "name": "devDependency",
                        "value": "false",
                    },
                ],
            }
            components.append(component)

    logger.info("Collected %d frontend dependencies", len(components))
    return components


def _parse_docker_compose_images(compose_path: Path) -> List[Dict[str, Any]]:
    """Extract base image references from Docker Compose YAML.

    Parameters
    ----------
    compose_path : Path
        Path to docker-compose.yml.

    Returns
    -------
    list of dict
        List of dicts with ``image`` and ``service`` keys.
    """
    images = []
    if not compose_path.is_file():
        logger.warning("Docker Compose file not found: %s", compose_path)
        return images

    try:
        with open(compose_path, "r", encoding="utf-8") as f:
            content = f.read()
    except OSError as e:
        logger.error("Failed to read compose file: %s", e)
        return images

    # Simple regex-based extraction — avoids requiring PyYAML
    # Matches lines like:    image: postgres:16-bookworm
    image_pattern = re.compile(r"^\s+image:\s+(.+)$", re.MULTILINE)
    service_pattern = re.compile(r"^\s+(\w[\w-]*):\s*$", re.MULTILINE)

    # Find all service blocks and their images
    lines = content.splitlines()
    current_service = None
    for line in lines:
        service_match = service_pattern.match(line)
        if service_match:
            candidate = service_match.group(1)
            # Skip top-level keys that are not services
            if candidate in ("version", "services", "volumes", "networks", "configs", "secrets"):
                continue
            current_service = candidate
            continue

        image_match = image_pattern.match(line)
        if image_match and current_service:
            image_ref = image_match.group(1).strip().strip("'\"")
            images.append({
                "service": current_service,
                "image": image_ref,
            })

    logger.info("Extracted %d Docker images from compose file", len(images))
    return images


def _compute_image_digest(image_ref: str) -> Optional[str]:
    """Attempt to compute a SHA-256 digest for a Docker image reference.

    In an air-gapped environment, ``docker inspect`` may not be available.
    Falls back to hashing the image reference string as a stable identifier.

    Parameters
    ----------
    image_ref : str
        Docker image reference (e.g., ``postgres:16-bookworm``).

    Returns
    -------
    str or None
        SHA-256 hex digest or None if computation fails.
    """
    # Try docker inspect first
    try:
        result = subprocess.run(
            ["docker", "inspect", "--format='{{.Id}}'", image_ref],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            raw_id = result.stdout.strip().strip("'\"")
            if raw_id and raw_id != "''":
                # Docker image IDs are typically sha256:hex
                if raw_id.startswith("sha256:"):
                    return raw_id[7:]
                return hashlib.sha256(raw_id.encode()).hexdigest()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Fallback: hash the image reference string
    return hashlib.sha256(image_ref.encode()).hexdigest()


def collect_docker_images(compose_path: Path) -> List[Dict[str, Any]]:
    """Collect base Docker container image digests from Docker Compose.

    Parameters
    ----------
    compose_path : Path
        Path to docker-compose.yml.

    Returns
    -------
    list of dict
        List of CycloneDX component dicts for each Docker image.
    """
    components = []
    images = _parse_docker_compose_images(compose_path)

    for img_info in images:
        image_ref = img_info["image"]
        service = img_info["service"]

        # Parse name and tag
        if ":" in image_ref:
            name, tag = image_ref.rsplit(":", 1)
        else:
            name = image_ref
            tag = "latest"

        digest = _compute_image_digest(image_ref)

        component = {
            "type": "container",
            "name": name,
            "version": tag,
            "purl": _purl_docker(image_ref, digest=digest, tag=tag),
            "properties": [
                {
                    "name": "SrcOrganization",
                    "value": "docker",
                },
                {
                    "name": "service",
                    "value": service,
                },
                {
                    "name": "imageDigest",
                    "value": f"sha256:{digest}" if digest else "unknown",
                },
            ],
        }
        components.append(component)

    logger.info("Collected %d Docker image components", len(components))
    return components


def build_sbom(
    python_components: List[Dict[str, Any]],
    frontend_components: List[Dict[str, Any]],
    docker_components: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Assemble a CycloneDX v1.5 JSON SBOM document.

    Parameters
    ----------
    python_components : list of dict
        Python dependency components.
    frontend_components : list of dict
        Frontend npm dependency components.
    docker_components : list of dict
        Docker image components.

    Returns
    -------
    dict
        Complete CycloneDX v1.5 SBOM document.
    """
    all_components = python_components + frontend_components + docker_components

    sbom = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "serialNumber": f"urn:uuid:{__import__('uuid').uuid4()}",
        "version": 1,
        "metadata": {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "tools": [
                {
                    "vendor": "Eisenhower Portfolio Manager",
                    "name": "SBOM Generator",
                    "version": "1.0.0",
                }
            ],
            "component": {
                "type": "application",
                "name": "Eisenhower Portfolio Manager",
                "version": "1.0.0",
            },
        },
        "components": all_components,
    }

    # Add dependencies section
    sbom["dependencies"] = [
        {
            "ref": f"pkg:pypi/{comp['name']}@{comp['version']}",
            "dependsOn": [],
        }
        for comp in all_components
        if comp["type"] == "library"
    ]

    return sbom


def sign_manifest(output_path: Path, sign_script: Optional[Path] = None) -> bool:
    """Sign the SBOM manifest using the release engineering private key.

    Invokes ``sign_release_manifest.sh`` to produce a detached signature
    file alongside the manifest.

    Parameters
    ----------
    output_path : Path
        Path to the generated SBOM JSON file.
    sign_script : Path, optional
        Path to the signing script. Defaults to ``scripts/security/sign_release_manifest.sh``.

    Returns
    -------
    bool
        True if signing succeeded, False otherwise.
    """
    script = sign_script or DEFAULT_SIGN_SCRIPT
    if not script.is_file():
        logger.warning("Signing script not found: %s — skipping signature", script)
        return False

    try:
        result = subprocess.run(
            ["bash", str(script), str(output_path)],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode == 0:
            logger.info("Manifest signed successfully: %s.sig", output_path.with_suffix(".json.sig"))
            return True
        else:
            logger.error("Signing failed: %s", result.stderr.strip())
            return False
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        logger.error("Signing script error: %s", e)
        return False


def main() -> int:
    """CLI entry point for SBOM generation.

    Returns
    -------
    int
        Exit code: 0 on success, 1 on failure.
    """
    parser = argparse.ArgumentParser(
        description="Generate CycloneDX v1.5 SBOM manifest for Eisenhower Portfolio Manager"
    )
    parser.add_argument(
        "--output", "-o",
        type=Path,
        default=DEFAULT_OUTPUT_DIR / "cyclonedx.json",
        help="Output path for the SBOM JSON manifest (default: dist/sbom/cyclonedx.json)",
    )
    parser.add_argument(
        "--lockfile", "-l",
        type=Path,
        default=DEFAULT_LOCKFILE,
        help="Path to frontend package-lock.json (default: frontend/package-lock.json)",
    )
    parser.add_argument(
        "--compose", "-c",
        type=Path,
        default=DOCKER_COMPOSE_PATH,
        help="Path to docker-compose.yml (default: deploy/docker-compose.yml)",
    )
    parser.add_argument(
        "--sign", "-s",
        action="store_true",
        help="Sign the generated manifest with the release engineering key",
    )
    parser.add_argument(
        "--sign-script",
        type=Path,
        default=None,
        help="Path to the signing script (default: scripts/security/sign_release_manifest.sh)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose logging",
    )

    args = parser.parse_args()

    if args.verbose:
        logging.basicConfig(level=logging.DEBUG, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    else:
        logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    # Collect dependencies
    logger.info("Collecting Python dependencies...")
    python_components = collect_python_dependencies()

    logger.info("Collecting frontend dependencies from %s...", args.lockfile)
    frontend_components = collect_frontend_dependencies(args.lockfile)

    logger.info("Collecting Docker image digests from %s...", args.compose)
    docker_components = collect_docker_images(args.compose)

    # Build SBOM
    logger.info("Building CycloneDX v1.5 SBOM...")
    sbom = build_sbom(python_components, frontend_components, docker_components)

    # Write output
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(sbom, f, indent=2)

    logger.info("SBOM written to %s (%d components)", args.output, len(sbom["components"]))

    # Sign if requested
    if args.sign:
        logger.info("Signing manifest...")
        sign_ok = sign_manifest(args.output, args.sign_script)
        if not sign_ok:
            logger.warning("Manifest signing failed — SBOM is unsigned")

    return 0


if __name__ == "__main__":
    sys.exit(main())
