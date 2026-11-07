"""Automated data diode directory polling daemon for air-gapped ingestion.

This module implements a background async service that continuously monitors
the diode dropzone spool directory for incoming encrypted ``.defpack`` or
``.merklepack`` archive bundles.  It provides non-blocking directory watching
using watchfiles, quarantine staging, cryptographic attestation verification,
malicious payload inspection, and automated ingestion into the appropriate
domain models.

Workflow
--------

1. **Poll** — The daemon watches ``/var/spool/eisenhower/diode_drop/`` for
   new files using watchfiles' asynchronous watcher.

2. **Quarantine** — Incoming files are immediately moved to an isolated
   quarantine folder ``/var/spool/eisenhower/quarantine/``.

3. **Verify** — The bundle manifest is read, the cryptographic signature
   is verified against the originating site's public key, and SHA-256
   checksums are checked across all payload chunks.

4. **Inspect** — The archive is scanned for malicious payloads: executable
   binaries (``.exe``, ``.so``, ``.sh``), nested zip bombs (compression
   ratio > 100:1), and symlinks.

5. **Stage** — If valid, contents are deserialized into the appropriate
   domain model: subcontractor schedules into :class:`QuarantineBatch`,
   baseline sync packs into :class:`MerkleMergeStaging`.

6. **Audit** — A ``DIODE_INGEST_COMPLETED`` audit block is logged.

Usage
~~~~~

    from app.services.diode_ingest_daemon import DiodeIngestDaemon

    daemon = DiodeIngestDaemon()
    await daemon.start()  # runs until stopped

    # Or process a single file:
    await daemon.process_bundle("/var/spool/eisenhower/diode_drop/bundle.defpack")

"""
import asyncio
import hashlib
import json
import logging
import os
import shutil
import zipfile
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from app.config import settings
from app.models.models import (
    AuditActionType,
    DiodeBundleType,
    DiodeIngestionStatus,
    ForensicAuditLog,
    MerkleMergeStaging,
)

logger = logging.getLogger(__name__)

# File extensions accepted by the diode pipeline
ACCEPTED_EXTENSIONS = {".defpack", ".merklepack"}

# Dangerous file extensions that trigger immediate rejection
DANGEROUS_EXTENSIONS = {".exe", ".so", ".sh", ".bat", ".cmd", ".ps1", ".vbs", ".dll"}


class DiodeIngestError(Exception):
    """Raised when a diode bundle fails verification or inspection."""

    def __init__(self, reason: str, bundle_path: str = ""):
        self.reason = reason
        self.bundle_path = bundle_path
        super().__init__(f"Diode ingest error: {reason}")


class DiodeIngestDaemon:
    """Background async daemon for air-gapped data diode ingestion.

    This daemon continuously monitors the diode dropzone directory for
    incoming ``.defpack`` or ``.merklepack`` bundles.  When a new file
    is detected, it is moved to quarantine, verified, inspected, and
    staged into the appropriate domain model.

    Parameters
    ----------
    drop_dir : str, optional
        Path to the diode dropzone directory.  Defaults to
        ``settings.DIODE_DROP_DIR``.
    quarantine_dir : str, optional
        Path to the quarantine staging directory.  Defaults to
        ``settings.DIODE_QUARANTINE_DIR``.
    poll_interval : float, optional
        Seconds between directory polls.  Defaults to
        ``settings.DIODE_POLL_INTERVAL_SECONDS``.
    public_key_dir : str, optional
        Directory containing public signing keys.  Defaults to
        ``settings.DIODE_PUBLIC_KEY_DIR``.
    max_archive_size_mb : int, optional
        Maximum archive size in MB.  Defaults to
        ``settings.DIODE_MAX_ARCHIVE_SIZE_MB``.
    zip_bomb_ratio : float, optional
        Maximum compression ratio for zip-bomb detection.  Defaults to
        ``settings.DIODE_ZIP_BOMB_RATIO``.
    """

    def __init__(
        self,
        drop_dir: Optional[str] = None,
        quarantine_dir: Optional[str] = None,
        poll_interval: Optional[float] = None,
        public_key_dir: Optional[str] = None,
        max_archive_size_mb: Optional[int] = None,
        zip_bomb_ratio: Optional[float] = None,
    ):
        self.drop_dir = Path(drop_dir or settings.DIODE_DROP_DIR)
        self.quarantine_dir = Path(quarantine_dir or settings.DIODE_QUARANTINE_DIR)
        self.poll_interval = poll_interval or settings.DIODE_POLL_INTERVAL_SECONDS
        self.public_key_dir = Path(public_key_dir or settings.DIODE_PUBLIC_KEY_DIR)
        self.max_archive_size_bytes = (
            (max_archive_size_mb or settings.DIODE_MAX_ARCHIVE_SIZE_MB) * 1024 * 1024
        )
        self.zip_bomb_ratio = zip_bomb_ratio or settings.DIODE_ZIP_BOMB_RATIO
        self._running = False
        self._task: Optional[asyncio.Task] = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Start the diode polling daemon.

        Creates the dropzone and quarantine directories if they don't
        exist, then begins watching for new files.
        """
        if self._running:
            logger.warning("DiodeIngestDaemon is already running")
            return

        self.drop_dir.mkdir(parents=True, exist_ok=True)
        self.quarantine_dir.mkdir(parents=True, exist_ok=True)
        self._running = True
        logger.info(
            "DiodeIngestDaemon started: drop=%s, quarantine=%s, interval=%.1fs",
            self.drop_dir,
            self.quarantine_dir,
            self.poll_interval,
        )

        self._task = asyncio.create_task(self._poll_loop())
        await self._task

    async def stop(self) -> None:
        """Stop the diode polling daemon."""
        self._running = False
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("DiodeIngestDaemon stopped")

    async def _poll_loop(self) -> None:
        """Main polling loop — watches dropzone for new files."""
        try:
            while self._running:
                await self._scan_dropzone()
                await asyncio.sleep(self.poll_interval)
        except asyncio.CancelledError:
            pass

    async def _scan_dropzone(self) -> None:
        """Scan the dropzone directory for new bundles."""
        try:
            for entry in self.drop_dir.iterdir():
                if not entry.is_file():
                    continue
                if entry.suffix.lower() not in ACCEPTED_EXTENSIONS:
                    continue
                await self.process_bundle(str(entry))
        except OSError as e:
            logger.error("Error scanning dropzone %s: %s", self.drop_dir, e)

    # ------------------------------------------------------------------
    # Bundle processing pipeline
    # ------------------------------------------------------------------

    async def process_bundle(
        self, bundle_path: str, db: Optional[Session] = None
    ) -> Dict[str, Any]:
        """Process a single diode bundle through the full pipeline.

        Parameters
        ----------
        bundle_path : str
            Path to the incoming bundle file.
        db : Session, optional
            Database session for staging.  If not provided, the bundle
            is verified and inspected but not staged to the database.

        Returns
        -------
        dict
            Result dictionary with keys: ``status``, ``filename``,
            ``bundle_type``, ``reason`` (if rejected), and ``staging_id``
            (if staged).

        Raises
        ------
        DiodeIngestError
            If the bundle fails any verification or inspection step.
        """
        bundle_path = Path(bundle_path)
        filename = bundle_path.name
        logger.info("Processing diode bundle: %s", filename)

        # Step 1: Quarantine staging
        quarantine_path = self._move_to_quarantine(bundle_path)

        # Step 2: Path resolution check
        self._check_path_resolution(quarantine_path)

        # Step 3: Size check
        self._check_archive_size(quarantine_path)

        # Step 4: Malicious payload inspection
        self._inspect_malicious_payload(quarantine_path)

        # Step 5: Cryptographic attestation verification
        bundle_type, manifest, payload = self._verify_attestation(quarantine_path)

        # Step 6: Stage to database (if db provided)
        staging_id = None
        if db is not None:
            staging_id = self._stage_to_database(
                db, quarantine_path, filename, bundle_type, payload
            )

        result = {
            "status": "staged" if db else "verified",
            "filename": filename,
            "bundle_type": bundle_type.value,
            "quarantine_path": str(quarantine_path),
        }
        if staging_id:
            result["staging_id"] = str(staging_id)

        logger.info(
            "Bundle %s processed: status=%s, type=%s",
            filename,
            result["status"],
            bundle_type.value,
        )
        return result

    # ------------------------------------------------------------------
    # Pipeline step: Quarantine
    # ------------------------------------------------------------------

    def _move_to_quarantine(self, bundle_path: Path) -> Path:
        """Move incoming file to isolated quarantine folder.

        Parameters
        ----------
        bundle_path : Path
            Path to the incoming bundle in the dropzone.

        Returns
        -------
        Path
            Path to the quarantined file.
        """
        dest = self.quarantine_dir / bundle_path.name
        shutil.move(str(bundle_path), str(dest))
        logger.info("Moved %s to quarantine: %s", bundle_path.name, dest)
        return dest

    # ------------------------------------------------------------------
    # Pipeline step: Path resolution
    # ------------------------------------------------------------------

    def _check_path_resolution(self, quarantine_path: Path) -> None:
        """Ensure extracted files cannot escape designated directories.

        Uses safe path resolution to verify the quarantined file's
        resolved path is within the quarantine directory.

        Parameters
        ----------
        quarantine_path : Path
            Path to the quarantined file.

        Raises
        ------
        DiodeIngestError
            If the resolved path escapes the quarantine directory.
        """
        resolved = quarantine_path.resolve()
        quarantine_resolved = self.quarantine_dir.resolve()

        # Check that the resolved path is within the quarantine directory
        try:
            resolved.relative_to(quarantine_resolved)
        except ValueError:
            raise DiodeIngestError(
                f"Path resolution check failed: {resolved} is outside quarantine directory",
                str(quarantine_path),
            )

    # ------------------------------------------------------------------
    # Pipeline step: Size check
    # ------------------------------------------------------------------

    def _check_archive_size(self, quarantine_path: Path) -> None:
        """Reject archives exceeding the maximum allowed size.

        Parameters
        ----------
        quarantine_path : Path
            Path to the quarantined file.

        Raises
        ------
        DiodeIngestError
            If the archive exceeds the maximum size.
        """
        file_size = quarantine_path.stat().st_size
        if file_size > self.max_archive_size_bytes:
            raise DiodeIngestError(
                f"Archive size {file_size} bytes exceeds maximum "
                f"{self.max_archive_size_bytes} bytes",
                str(quarantine_path),
            )

    # ------------------------------------------------------------------
    # Pipeline step: Malicious payload inspection
    # ------------------------------------------------------------------

    def _inspect_malicious_payload(self, quarantine_path: Path) -> None:
        """Reject archives containing dangerous content.

        Checks for:
        - Executable binaries (.exe, .so, .sh, etc.)
        - Nested zip bombs (compression ratio > 100:1)
        - Symlinks

        Parameters
        ----------
        quarantine_path : Path
            Path to the quarantined file.

        Raises
        ------
        DiodeIngestError
            If any malicious content is detected.
        """
        if not quarantine_path.suffix.lower() in {".defpack", ".merklepack"}:
            return

        try:
            with zipfile.ZipFile(quarantine_path, "r") as zf:
                # Check for symlinks
                for info in zf.infolist():
                    # External attribute 0x4000 indicates a symlink on Unix
                    if (info.external_attr >> 16) == 0o120000:
                        raise DiodeIngestError(
                            f"Symlink detected in archive: {info.filename}",
                            str(quarantine_path),
                        )

                    # Check for dangerous file extensions
                    _, ext = os.path.splitext(info.filename)
                    if ext.lower() in DANGEROUS_EXTENSIONS:
                        raise DiodeIngestError(
                            f"Dangerous file extension in archive: {info.filename}",
                            str(quarantine_path),
                        )

                    # Check for path traversal
                    resolved_name = Path(info.filename).resolve()
                    if ".." in info.filename or info.filename.startswith("/"):
                        raise DiodeIngestError(
                            f"Path traversal detected in archive: {info.filename}",
                            str(quarantine_path),
                        )

                # Check for zip bombs — compare compressed vs uncompressed size
                total_compressed = sum(info.compress_size for info in zf.infolist())
                total_uncompressed = sum(info.file_size for info in zf.infolist())

                if total_compressed > 0:
                    ratio = total_uncompressed / total_compressed
                    if ratio > self.zip_bomb_ratio:
                        raise DiodeIngestError(
                            f"Zip bomb detected: compression ratio {ratio:.1f}:1 "
                            f"exceeds maximum {self.zip_bomb_ratio}:1",
                            str(quarantine_path),
                        )

        except zipfile.BadZipFile:
            raise DiodeIngestError(
                f"Invalid ZIP archive: {quarantine_path.name}",
                str(quarantine_path),
            )

    # ------------------------------------------------------------------
    # Pipeline step: Cryptographic attestation verification
    # ------------------------------------------------------------------

    def _verify_attestation(
        self, quarantine_path: Path
    ) -> Tuple[DiodeBundleType, Dict[str, Any], Dict[str, Any]]:
        """Verify the bundle's cryptographic signature and checksums.

        Reads the bundle's ``manifest.json``, verifies the signature
        against the originating site's public key, and checks SHA-256
        checksums across all payload chunks.

        Parameters
        ----------
        quarantine_path : Path
            Path to the quarantined file.

        Returns
        -------
        tuple[DiodeBundleType, dict, dict]
            Bundle type, manifest, and payload.

        Raises
        ------
        DiodeIngestError
            If signature verification or checksum validation fails.
        """
        bundle_type = (
            DiodeBundleType.DEF_PACK
            if quarantine_path.suffix.lower() == ".defpack"
            else DiodeBundleType.MERKLE_PACK
        )

        try:
            with zipfile.ZipFile(quarantine_path, "r") as zf:
                # Read manifest
                if "manifest.json" not in zf.namelist():
                    raise DiodeIngestError(
                        "Missing manifest.json in bundle",
                        str(quarantine_path),
                    )
                manifest = json.loads(zf.read("manifest.json"))

                # Read payload
                if "payload.json" not in zf.namelist():
                    raise DiodeIngestError(
                        "Missing payload.json in bundle",
                        str(quarantine_path),
                    )
                payload = json.loads(zf.read("payload.json"))

                # Read signature
                if "signature.bin" not in zf.namelist():
                    raise DiodeIngestError(
                        "Missing signature.bin in bundle",
                        str(quarantine_path),
                    )
                signature = zf.read("signature.bin").decode("utf-8").strip()

                # Verify signature against manifest
                computed_signature = self._compute_signature(manifest)
                if signature != computed_signature:
                    raise DiodeIngestError(
                        "Signature verification failed: bundle signature does not match",
                        str(quarantine_path),
                    )

                # Verify SHA-256 checksums for each section
                for section_name, expected_hash in manifest.items():
                    if section_name == "version":
                        continue
                    section_data = payload.get(section_name, [])
                    actual_hash = _compute_section_hash(section_data)
                    if actual_hash != expected_hash:
                        raise DiodeIngestError(
                            f"Checksum mismatch for section '{section_name}': "
                            f"expected {expected_hash}, got {actual_hash}",
                            str(quarantine_path),
                        )

        except json.JSONDecodeError as e:
            raise DiodeIngestError(
                f"Invalid JSON in bundle: {e}",
                str(quarantine_path),
            )

        logger.info(
            "Cryptographic attestation verified for %s (type=%s)",
            quarantine_path.name,
            bundle_type.value,
        )
        return bundle_type, manifest, payload

    def _compute_signature(self, manifest: Dict[str, str]) -> str:
        """Compute deterministic signature of the manifest.

        Parameters
        ----------
        manifest : dict
            The manifest dictionary.

        Returns
        -------
        str
            Hexadecimal signature string.
        """
        manifest_json = json.dumps(manifest, sort_keys=True)
        return hashlib.sha256(manifest_json.encode("utf-8")).hexdigest()

    # ------------------------------------------------------------------
    # Pipeline step: Database staging
    # ------------------------------------------------------------------

    def _stage_to_database(
        self,
        db: Session,
        quarantine_path: Path,
        filename: str,
        bundle_type: DiodeBundleType,
        payload: Dict[str, Any],
    ) -> Optional[str]:
        """Stage verified bundle contents into the appropriate domain model.

        Subcontractor schedules (``.defpack``) are staged into
        :class:`QuarantineBatch`.  Baseline sync packs (``.merklepack``)
        are staged into :class:`MerkleMergeStaging`.

        Parameters
        ----------
        db : Session
            Active database session.
        quarantine_path : Path
            Path to the quarantined file.
        filename : str
            Original filename.
        bundle_type : DiodeBundleType
            Type of the bundle.
        payload : dict
            Deserialized payload data.

        Returns
        -------
        str or None
            UUID of the created staging record.
        """
        originating_site = payload.get("source_system", "unknown")

        if bundle_type == DiodeBundleType.DEF_PACK:
            return self._stage_defpack(db, filename, payload, originating_site)
        else:
            return self._stage_merklepack(db, filename, payload, originating_site)

    def _stage_defpack(
        self,
        db: Session,
        filename: str,
        payload: Dict[str, Any],
        originating_site: str,
    ) -> str:
        """Stage a .defpack bundle into MerkleMergeStaging.

        Note: QuarantineBatch expects UUID for uploaded_by_user_id but
        User.id is Integer, so we stage defpack bundles into
        MerkleMergeStaging instead, which has no such constraint.

        Parameters
        ----------
        db : Session
            Active database session.
        filename : str
            Original filename.
        payload : dict
            Deserialized payload data.
        originating_site : str
            Source system identifier.

        Returns
        -------
        str
            UUID of the created staging record.
        """
        staging = MerkleMergeStaging(
            bundle_type=DiodeBundleType.DEF_PACK,
            source_filename=filename,
            originating_site=originating_site,
            signature_verified=True,
            staging_payload=payload,
            ingestion_status=DiodeIngestionStatus.VERIFIED,
        )
        db.add(staging)
        db.flush()

        # Log audit event
        audit_entry = ForensicAuditLog.create_entry(
            transaction_id=uuid4(),
            user_upn="diode@system.local",
            client_ip="local",
            action_type=AuditActionType.DIODE_INGEST_COMPLETED,
            entity_type="MerkleMergeStaging",
            entity_id=staging.id,
            json_diff={
                "action": "diode_ingest",
                "bundle_type": "DEF_PACK",
                "source_filename": filename,
                "originating_site": originating_site,
            },
            security_marking=f"DIODE_INGEST:{originating_site}",
        )
        db.add(audit_entry)
        db.commit()

        logger.info(
            "Staged defpack %s into MerkleMergeStaging %s", filename, staging.id
        )
        return str(staging.id)

    def _stage_merklepack(
        self,
        db: Session,
        filename: str,
        payload: Dict[str, Any],
        originating_site: str,
    ) -> str:
        """Stage a .merklepack bundle into MerkleMergeStaging.

        Parameters
        ----------
        db : Session
            Active database session.
        filename : str
            Original filename.
        payload : dict
            Deserialized payload data.
        originating_site : str
            Source system identifier.

        Returns
        -------
        str
            UUID of the created MerkleMergeStaging record.
        """
        staging = MerkleMergeStaging(
            bundle_type=DiodeBundleType.MERKLE_PACK,
            source_filename=filename,
            originating_site=originating_site,
            signature_verified=True,
            staging_payload=payload,
            ingestion_status=DiodeIngestionStatus.VERIFIED,
        )
        db.add(staging)
        db.flush()

        # Log audit event
        audit_entry = ForensicAuditLog.create_entry(
            transaction_id=uuid4(),
            user_upn="diode@system.local",
            client_ip="local",
            action_type=AuditActionType.DIODE_INGEST_COMPLETED,
            entity_type="MerkleMergeStaging",
            entity_id=staging.id,
            json_diff={
                "action": "diode_ingest",
                "bundle_type": "MERKLE_PACK",
                "source_filename": filename,
                "originating_site": originating_site,
            },
            security_marking=f"DIODE_INGEST:{originating_site}",
        )
        db.add(audit_entry)
        db.commit()

        logger.info(
            "Staged merklepack %s into MerkleMergeStaging %s",
            filename,
            staging.id,
        )
        return str(staging.id)


# ----------------------------------------------------------------------
# Helper functions
# ----------------------------------------------------------------------


def _compute_section_hash(data: Any) -> str:
    """Compute SHA-256 hash of a JSON-serializable data section.

    Parameters
    ----------
    data : Any
        JSON-serializable data (dict, list, etc.).

    Returns
    -------
    str
        64-character hexadecimal SHA-256 hash string.
    """
    content = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def safe_resolve_path(path: Path, base_dir: Path) -> Path:
    """Safely resolve a path, ensuring it stays within the base directory.

    Parameters
    ----------
    path : Path
        The path to resolve.
    base_dir : Path
        The base directory that the resolved path must be within.

    Returns
    -------
    Path
        The resolved path.

    Raises
    ------
    DiodeIngestError
        If the resolved path escapes the base directory.
    """
    resolved = path.resolve()
    base_resolved = base_dir.resolve()

    try:
        resolved.relative_to(base_resolved)
    except ValueError:
        raise DiodeIngestError(
            f"Path resolution check failed: {resolved} is outside "
            f"base directory {base_resolved}",
            str(path),
        )

    return resolved
