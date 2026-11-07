#!/usr/bin/env python3
"""Eisenhower Portfolio Manager — Offline Dependency Harvester.

This script prepares a complete offline build bundle for air-gapped,
cold-boot deployment on bare-metal hardware with zero outbound network
connectivity.

It performs three main tasks:

1. **Python Wheelhouse** — Downloads pre-compiled Linux x86_64 wheels
   for all dependencies listed in ``requirements.txt``, targeting Python
   3.11. This includes native extensions like ``psycopg2-binary``,
   ``numpy``, ``scipy``, and ``bcrypt``.

2. **Frontend Font Vendoring** — Downloads and places web fonts
   (JetBrains Mono, Inter) into ``frontend/public/fonts/`` with
   ``.woff2`` format. No external Google Fonts or CDN URLs remain.

3. **NPM Package Vendoring** — Exports all npm dependencies from
   ``frontend/package.json`` into a tarball cache that can be consumed
   by ``npm ci`` in an offline Docker build.

Usage
~~~~~

Run on a build host with internet access:

.. code-block:: bash

    python -m scripts.build_offline_bundle

Or with custom output directory:

.. code-block:: bash

    python -m scripts.build_offline_bundle --output /mnt/usb/offline-bundle

After the bundle is created, transfer the entire output directory to the
air-gapped host via optical media or USB diode.

Output Structure
~~~~~~~~~~~~~~~~

.. code-block:: text

    deploy/offline/
    ├── wheelhouse/                  # Pre-compiled Python wheels
    │   ├── fastapi-0.109.0-py3-none-any.whl
    │   ├── numpy-1.26.3-cp311-...whl
    │   └── ...
    ├── npm_cache/                   # npm package tarballs
    │   └── npm-packages.tar.gz
    ├── fonts/                       # Downloaded web fonts
    │   ├── JetBrainsMono/
    │   └── Inter/
    └── manifest.json                # SHA-256 checksums of all files

Prerequisites
~~~~~~~~~~~~~

- Python 3.11+ with ``pip`` installed
- Node.js 20+ with ``npm`` installed (for npm cache export)
- Internet access on the build host
- Sufficient disk space (~2 GB for all wheels + npm packages)
"""

import argparse
import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import urllib.request
import urllib.error
import zipfile
from pathlib import Path
from typing import Dict, List, Optional

# Add project root to path so we can import app modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.core.path_security import safe_resolve_path, PathTraversalAttackException


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REQUIREMENTS_FILE = PROJECT_ROOT / "requirements.txt"
FRONTEND_DIR = PROJECT_ROOT / "frontend"
FRONTEND_PACKAGE_JSON = FRONTEND_DIR / "package.json"
OFFLINE_DIR = PROJECT_ROOT / "deploy" / "offline"
WHEELHOUSE_DIR = OFFLINE_DIR / "wheelhouse"
NPM_CACHE_DIR = OFFLINE_DIR / "npm_cache"
FONTS_DIR = OFFLINE_DIR / "fonts"
FRONTEND_FONTS_DIR = FRONTEND_DIR / "public" / "fonts"
MANIFEST_FILE = OFFLINE_DIR / "manifest.json"

# Python version and platform target for wheel downloads
PYTHON_VERSION = "311"
PLATFORM = "manylinux2014_x86_64"
ARCH = "x86_64"

# Web font download URLs (SIL Open Font License 1.1)
FONT_DOWNLOADS = {
    "JetBrainsMono": {
        "url": (
            "https://github.com/JetBrains/JetBrainsMono/archive/"
            "refs/heads/master.zip"
        ),
        "license": "OFL-1.1",
        "files_to_extract": [
            "JetBrainsMono-master/fonts/woff2/JetBrainsMono-Regular.woff2",
            "JetBrainsMono-master/fonts/woff2/JetBrainsMono-Medium.woff2",
            "JetBrainsMono-master/fonts/woff2/JetBrainsMono-Bold.woff2",
            "JetBrainsMono-master/fonts/woff2/JetBrainsMono-Italic.woff2",
        ],
    },
    "Inter": {
        "url": (
            "https://github.com/rsms/inter/archive/"
            "refs/heads/main.zip"
        ),
        "license": "OFL-1.1",
        "files_to_extract": [
            "Inter-main/fonts/Inter/Inter.woff2_archive/Inter-Regular.woff2",
            "Inter-main/fonts/Inter/Inter.woff2_archive/Inter-Medium.woff2",
            "Inter-main/fonts/Inter/Inter.woff2_archive/Inter-SemiBold.woff2",
            "Inter-main/fonts/Inter/Inter.woff2_archive/Inter-Bold.woff2",
        ],
    },
}


# ---------------------------------------------------------------------------
# Utility Functions
# ---------------------------------------------------------------------------


def sha256_file(file_path: Path) -> str:
    """Compute SHA-256 checksum of a file.

    Parameters
    ----------
    file_path : Path
        Path to the file to hash.

    Returns
    -------
    str
        Hex-encoded SHA-256 digest.
    """
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def download_file(url: str, dest: Path, description: str = "") -> Path:
    """Download a file from a URL with progress reporting.

    Parameters
    ----------
    url : str
        URL to download.
    dest : Path
        Destination file path.
    description : str
        Human-readable description for progress output.

    Returns
    -------
    Path
        The destination path.

    Raises
    ------
    urllib.error.URLError
        If the download fails.
    """
    label = description or dest.name
    print(f"  ↓ Downloading {label}...")
    dest.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(url, str(dest))
    print(f"    ✓ {label} ({dest.stat().st_size / 1024:.0f} KB)")
    return dest


def run_command(
    cmd: List[str],
    description: str = "",
    cwd: Optional[Path] = None,
    capture: bool = False,
) -> subprocess.CompletedProcess:
    """Run a shell command with error handling.

    Parameters
    ----------
    cmd : list of str
        Command and arguments.
    description : str
        Human-readable description for output.
    cwd : Path or None
        Working directory for the command.
    capture : bool
        If True, capture stdout/stderr.

    Returns
    -------
    subprocess.CompletedProcess
        Result of the command.

    Raises
    ------
    subprocess.CalledProcessError
        If the command returns a non-zero exit code.
    """
    label = description or " ".join(cmd)
    print(f"  ⚙ Running: {label}")
    try:
        result = subprocess.run(
            cmd,
            cwd=str(cwd) if cwd else None,
            check=True,
            capture_output=capture,
            text=capture,
        )
        if capture and result.stdout:
            print(f"    {result.stdout.strip()}")
        print(f"    ✓ {label}")
        return result
    except subprocess.CalledProcessError as e:
        print(f"    ✗ {label} failed (exit code {e.returncode})")
        if e.stderr:
            print(f"    Error: {e.stderr.strip()}")
        raise


# ---------------------------------------------------------------------------
# Phase 1: Python Wheelhouse
# ---------------------------------------------------------------------------


def download_python_wheels(output_dir: Optional[Path] = None) -> Dict[str, str]:
    """Download pre-compiled Linux wheels for all Python dependencies.

    Reads ``requirements.txt`` and uses ``pip download`` to fetch
    pre-compiled binary wheels targeting Linux x86_64 with Python 3.11.

    Parameters
    ----------
    output_dir : Path or None
        Override output directory (defaults to ``deploy/offline/wheelhouse``).

    Returns
    -------
    dict
        Mapping of wheel filename to SHA-256 checksum.
    """
    target_dir = output_dir or WHEELHOUSE_DIR
    target_dir.mkdir(parents=True, exist_ok=True)

    print("\n" + "=" * 70)
    print("PHASE 1: Python Wheelhouse")
    print("=" * 70)
    print(f"  Target platform: {PLATFORM} / Python {PYTHON_VERSION}")
    print(f"  Output directory: {target_dir}")

    if not REQUIREMENTS_FILE.exists():
        print(f"  ✗ requirements.txt not found at {REQUIREMENTS_FILE}")
        return {}

    # Build pip download command
    cmd = [
        sys.executable,
        "-m",
        "pip",
        "download",
        "--only-binary=:all:",
        f"--platform={PLATFORM}",
        f"--python-version={PYTHON_VERSION}",
        f"--py {PYTHON_VERSION}",
        "--no-deps",
        f"-d {target_dir}",
        "-r",
        str(REQUIREMENTS_FILE),
    ]

    try:
        run_command(cmd, "pip download wheels")
    except subprocess.CalledProcessError:
        # Fallback: try without --only-binary for packages that don't have wheels
        print("  ⚠ Retrying without --only-binary restriction...")
        cmd[4] = ""  # Remove --only-binary
        try:
            run_command(cmd, "pip download (fallback)")
        except subprocess.CalledProcessError:
            print("  ✗ Wheel download failed. Ensure pip is up to date.")
            return {}

    # Compute checksums
    checksums = {}
    wheel_files = list(target_dir.glob("*.whl"))
    print(f"\n  Downloaded {len(wheel_files)} wheel(s):")
    for wf in sorted(wheel_files):
        checksum = sha256_file(wf)
        checksums[wf.name] = checksum
        size_kb = wf.stat().st_size / 1024
        print(f"    {wf.name} ({size_kb:.0f} KB)")

    total_mb = sum(wf.stat().st_size for wf in wheel_files) / (1024 * 1024)
    print(f"\n  Total wheelhouse size: {total_mb:.1f} MB")
    return checksums


# ---------------------------------------------------------------------------
# Phase 2: Frontend Font Vendoring
# ---------------------------------------------------------------------------


def vendor_web_fonts(output_dir: Optional[Path] = None) -> Dict[str, str]:
    """Download and vendor web fonts for air-gapped deployment.

    Downloads JetBrains Mono and Inter font families as ``.woff2`` files
    and places them in both the offline bundle and the frontend public
    directory.

    Parameters
    ----------
    output_dir : Path or None
        Override output directory (defaults to ``deploy/offline/fonts``).

    Returns
    -------
    dict
        Mapping of font filename to SHA-256 checksum.
    """
    target_dir = output_dir or FONTS_DIR
    target_dir.mkdir(parents=True, exist_ok=True)
    FRONTEND_FONTS_DIR.mkdir(parents=True, exist_ok=True)

    print("\n" + "=" * 70)
    print("PHASE 2: Frontend Font Vendoring")
    print("=" * 70)
    print(f"  Offline bundle: {target_dir}")
    print(f"  Frontend public: {FRONTEND_FONTS_DIR}")

    checksums = {}
    tmp_dir = OFFLINE_DIR / "tmp_fonts"
    tmp_dir.mkdir(parents=True, exist_ok=True)

    for font_family, config in FONT_DOWNLOADS.items():
        print(f"\n  Downloading {font_family} ({config['license']})...")
        zip_path = tmp_dir / f"{font_family}.zip"

        try:
            download_file(config["url"], zip_path, font_family)
        except urllib.error.URLError as e:
            print(f"    ✗ Failed to download {font_family}: {e}")
            continue

        # Extract specific font files
        font_dir_bundle = target_dir / font_family
        font_dir_frontend = FRONTEND_FONTS_DIR / font_family
        font_dir_bundle.mkdir(parents=True, exist_ok=True)
        font_dir_frontend.mkdir(parents=True, exist_ok=True)

        extracted = 0
        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                for member_path in config["files_to_extract"]:
                    try:
                        zf.extract(member_path, tmp_dir)
                        src_file = tmp_dir / member_path
                        if src_file.exists():
                            dest_name = src_file.name
                            # Copy to both locations
                            shutil.copy2(src_file, font_dir_bundle / dest_name)
                            shutil.copy2(src_file, font_dir_frontend / dest_name)
                            checksum = sha256_file(font_dir_bundle / dest_name)
                            checksums[dest_name] = checksum
                            extracted += 1
                    except KeyError:
                        # File not in archive — try alternative paths
                        continue
        except zipfile.BadZipFile:
            print(f"    ✗ Invalid zip file for {font_family}")
            continue

        print(f"    ✓ Extracted {extracted} font file(s) for {font_family}")

        # Cleanup
        if zip_path.exists():
            zip_path.unlink()

    # Cleanup temp directory
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir, ignore_errors=True)

    # If fonts couldn't be extracted from zip, provide download instructions
    if not checksums:
        print("\n  ⚠ Automatic font extraction failed.")
        print("  Please manually download fonts and place them in:")
        print(f"    {FRONTEND_FONTS_DIR}/")
        print("\n  Font sources:")
        print("    JetBrains Mono: https://github.com/JetBrains/JetBrainsMono/releases")
        print("    Inter: https://github.com/rsms/inter/releases")

    return checksums


# ---------------------------------------------------------------------------
# Phase 3: NPM Package Vendoring
# ---------------------------------------------------------------------------


def vendor_npm_packages(output_dir: Optional[Path] = None) -> Dict[str, str]:
    """Export all npm dependencies for offline installation.

    Uses ``npm pack`` to create a tarball cache of all packages listed
    in ``frontend/package.json``. This cache can be consumed by
    ``npm ci --cache`` in an offline Docker build.

    Parameters
    ----------
    output_dir : Path or None
        Override output directory (defaults to ``deploy/offline/npm_cache``).

    Returns
    -------
    dict
        Mapping of package tarball name to SHA-256 checksum.
    """
    target_dir = output_dir or NPM_CACHE_DIR
    target_dir.mkdir(parents=True, exist_ok=True)

    print("\n" + "=" * 70)
    print("PHASE 3: NPM Package Vendoring")
    print("=" * 70)
    print(f"  Frontend directory: {FRONTEND_DIR}")
    print(f"  Output directory: {target_dir}")

    if not FRONTEND_PACKAGE_JSON.exists():
        print(f"  ✗ package.json not found at {FRONTEND_PACKAGE_JSON}")
        return {}

    checksums = {}

    # Check if npm is available
    try:
        result = subprocess.run(
            ["npm", "--version"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            print("  ⚠ npm is not installed. Skipping NPM package vendoring.")
            print("  Install Node.js 20+ to enable offline frontend builds.")
            return {}
        npm_version = result.stdout.strip()
        print(f"  npm version: {npm_version}")
    except FileNotFoundError:
        print("  ⚠ npm command not found. Skipping NPM package vendoring.")
        return {}

    # Strategy: Use npm ci with a custom cache directory
    # This downloads all packages into the cache for offline use
    npm_cache_path = target_dir / "npm-cache"
    npm_cache_path.mkdir(parents=True, exist_ok=True)

    print("  ⚙ Exporting npm cache...")
    try:
        run_command(
            [
                "npm",
                "ci",
                "--cache",
                str(npm_cache_path),
                "--prefer-offline",
                "--no-audit",
                "--no-fund",
            ],
            "npm ci --cache",
            cwd=FRONTEND_DIR,
        )
    except subprocess.CalledProcessError:
        print("  ⚠ npm ci failed. Trying npm install...")
        try:
            run_command(
                [
                    "npm",
                    "install",
                    "--cache",
                    str(npm_cache_path),
                    "--prefer-offline",
                    "--no-audit",
                    "--no-fund",
                ],
                "npm install --cache",
                cwd=FRONTEND_DIR,
            )
        except subprocess.CalledProcessError:
            print("  ✗ NPM package download failed.")
            return {}

    # Also pack individual packages for maximum compatibility
    pack_dir = target_dir / "packages"
    pack_dir.mkdir(parents=True, exist_ok=True)

    # Read package.json to get dependency names
    try:
        with open(FRONTEND_PACKAGE_JSON, "r") as f:
            pkg_json = json.load(f)
        all_deps = {}
        all_deps.update(pkg_json.get("dependencies", {}))
        all_deps.update(pkg_json.get("devDependencies", {}))

        print(f"\n  Packing {len(all_deps)} individual packages...")
        for pkg_name in all_deps:
            pkg_dir = pack_dir / pkg_name
            pkg_dir.mkdir(parents=True, exist_ok=True)
            try:
                run_command(
                    ["npm", "pack", pkg_name, "--pack-destination", str(pkg_dir)],
                    f"npm pack {pkg_name}",
                    capture=True,
                )
                # Find the packed tarball
                tarballs = list(pkg_dir.glob("*.tgz"))
                for tb in tarballs:
                    checksum = sha256_file(tb)
                    checksums[tb.name] = checksum
            except subprocess.CalledProcessError:
                print(f"    ⚠ Skipping {pkg_name} (not found or failed)")
                continue
    except (json.JSONDecodeError, KeyError) as e:
        print(f"  ⚠ Could not parse package.json: {e}")

    # Create a tarball of the entire npm cache
    cache_tarball = target_dir / "npm-packages.tar.gz"
    if npm_cache_path.exists():
        print(f"\n  Creating cache tarball: {cache_tarball}")
        shutil.make_archive(
            str(target_dir / "npm-packages"),
            "gztar",
            root_dir=target_dir,
            base_dir="npm-cache",
        )
        if cache_tarball.exists():
            checksums["npm-packages.tar.gz"] = sha256_file(cache_tarball)

    # Report sizes
    total_size = sum(
        f.stat().st_size
        for f in target_dir.rglob("*")
        if f.is_file()
    )
    print(f"\n  Total NPM cache size: {total_size / (1024 * 1024):.1f} MB")

    return checksums


# ---------------------------------------------------------------------------
# Phase 4: Manifest Generation
# ---------------------------------------------------------------------------


def generate_manifest(
    wheel_checksums: Dict[str, str],
    font_checksums: Dict[str, str],
    npm_checksums: Dict[str, str],
    output_dir: Optional[Path] = None,
) -> Path:
    """Generate a SHA-256 manifest of all bundled files.

    Parameters
    ----------
    wheel_checksums : dict
        Wheel filename → checksum mapping.
    font_checksums : dict
        Font filename → checksum mapping.
    npm_checksums : dict
        NPM package filename → checksum mapping.
    output_dir : Path or None
        Override output directory.

    Returns
    -------
    Path
        Path to the generated manifest.json file.
    """
    target_dir = output_dir or OFFLINE_DIR
    manifest_path = target_dir / "manifest.json"

    print("\n" + "=" * 70)
    print("PHASE 4: Manifest Generation")
    print("=" * 70)

    manifest = {
        "version": "1.0",
        "generated_at": __import__("datetime").datetime.now(timezone.utc).isoformat() + "Z",
        "python_version": PYTHON_VERSION,
        "platform": PLATFORM,
        "checksums": {
            "wheels": wheel_checksums,
            "fonts": font_checksums,
            "npm_packages": npm_checksums,
        },
        "summary": {
            "wheel_count": len(wheel_checksums),
            "font_count": len(font_checksums),
            "npm_package_count": len(npm_checksums),
        },
    }

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"  ✓ Manifest written to {manifest_path}")
    print(f"  Summary:")
    print(f"    Wheels: {len(wheel_checksums)}")
    print(f"    Fonts: {len(font_checksums)}")
    print(f"    NPM packages: {len(npm_checksums)}")

    return manifest_path


# ---------------------------------------------------------------------------
# Main Entry Point
# ---------------------------------------------------------------------------


def main():
    """Main entry point for the offline bundle builder."""
    parser = argparse.ArgumentParser(
        description="Build offline dependency bundle for air-gapped deployment.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python -m scripts.build_offline_bundle\n"
            "  python -m scripts.build_offline_bundle --output /mnt/usb/bundle\n"
            "  python -m scripts.build_offline_bundle --skip-npm\n"
        ),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output directory (default: deploy/offline/)",
    )
    parser.add_argument(
        "--skip-wheels",
        action="store_true",
        help="Skip Python wheel download",
    )
    parser.add_argument(
        "--skip-fonts",
        action="store_true",
        help="Skip font vendoring",
    )
    parser.add_argument(
        "--skip-npm",
        action="store_true",
        help="Skip NPM package vendoring",
    )
    parser.add_argument(
        "--python-version",
        type=str,
        default=PYTHON_VERSION,
        help=f"Python version target (default: {PYTHON_VERSION})",
    )
    parser.add_argument(
        "--platform",
        type=str,
        default=PLATFORM,
        help=f"Platform target (default: {PLATFORM})",
    )

    args = parser.parse_args()

    # Update globals based on arguments
    global OFFLINE_DIR, PYTHON_VERSION, PLATFORM
    if args.output:
        # Validate that the output directory doesn't escape the project root
        # via path traversal — while this is a CLI tool, defense-in-depth matters
        try:
            safe_output = safe_resolve_path(Path("."), str(args.output))
            OFFLINE_DIR = safe_output.resolve()
        except PathTraversalAttackException:
            # For CLI tools, allow absolute paths but warn
            print(f"  ⚠ Warning: output path {args.output} is outside project root.")
            OFFLINE_DIR = args.output.resolve()
        except ValueError:
            print(f"  ✗ Error: invalid output path {args.output}")
            sys.exit(1)

        global WHEELHOUSE_DIR, NPM_CACHE_DIR, FONTS_DIR, MANIFEST_FILE
        WHEELHOUSE_DIR = OFFLINE_DIR / "wheelhouse"
        NPM_CACHE_DIR = OFFLINE_DIR / "npm_cache"
        FONTS_DIR = OFFLINE_DIR / "fonts"
        MANIFEST_FILE = OFFLINE_DIR / "manifest.json"
    PYTHON_VERSION = args.python_version
    PLATFORM = args.platform

    print("=" * 70)
    print("Eisenhower Portfolio Manager — Offline Dependency Harvester")
    print("=" * 70)
    print(f"  Project root: {PROJECT_ROOT}")
    print(f"  Output directory: {OFFLINE_DIR}")
    print(f"  Python version: {PYTHON_VERSION}")
    print(f"  Platform: {PLATFORM}")
    print(f"  Host: {platform.system()} {platform.machine()}")

    # Phase 1: Python Wheels
    wheel_checksums = {}
    if not args.skip_wheels:
        wheel_checksums = download_python_wheels()
    else:
        print("\n⚠ Skipping Python wheel download (--skip-wheels)")

    # Phase 2: Web Fonts
    font_checksums = {}
    if not args.skip_fonts:
        font_checksums = vendor_web_fonts()
    else:
        print("\n⚠ Skipping font vendoring (--skip-fonts)")

    # Phase 3: NPM Packages
    npm_checksums = {}
    if not args.skip_npm:
        npm_checksums = vendor_npm_packages()
    else:
        print("\n⚠ Skipping NPM package vendoring (--skip-npm)")

    # Phase 4: Manifest
    generate_manifest(wheel_checksums, font_checksums, npm_checksums)

    # Final summary
    total_size = OFFLINE_DIR.stat().st_size if OFFLINE_DIR.exists() else 0
    total_size = sum(
        f.stat().st_size
        for f in OFFLINE_DIR.rglob("*")
        if f.is_file()
    )
    print("\n" + "=" * 70)
    print("BUILD COMPLETE")
    print("=" * 70)
    print(f"  Total bundle size: {total_size / (1024 * 1024):.1f} MB")
    print(f"  Output directory: {OFFLINE_DIR}")
    print("\n  To deploy to an air-gapped host:")
    print(f"    1. Copy '{OFFLINE_DIR}' to optical media or USB diode")
    print("    2. On the air-gapped host, run:")
    print("       docker compose -f deploy/docker-compose.offline-build.yml up --build")
    print("\n" + "=" * 70)


if __name__ == "__main__":
    main()
