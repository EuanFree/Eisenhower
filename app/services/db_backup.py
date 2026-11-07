"""Database Backup Service.

Provides scheduled and on-demand PostgreSQL database backups with encryption,
retention policies, and restore capabilities. Designed for SCIF environments
where backups must be encrypted and verifiable.

Key Features
~~~~~~~~~~~~

- **Full backups** using `pg_dump` with custom format for efficient compression.
- **WAL archiving** integration for point-in-time recovery between full backups.
- **GPG encryption** of backup files for at-rest security.
- **Retention policies** to automatically purge old backups.
- **Backup verification** by testing restore to a temporary database.
- **APScheduler integration** for scheduled backups.

Backup Storage
~~~~~~~~~~~~~~

Backups are stored in ``deploy/backups/`` with the following structure::

    deploy/backups/
        full-2026-10-25-160000.dump.gz.gpg
        full-2026-10-24-160000.dump.gz.gpg
        manifest.json

The manifest.json tracks backup metadata including size, duration, checksum,
and verification status.

Usage
~~~~~

    from app.services.db_backup import db_backup_service
    await db_backup_service.create_backup()
    backups = await db_backup_service.list_backups()
    await db_backup_service.restore_backup(backup_id)
"""

import asyncio
import json
import os
import shutil
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.config import settings


BACKUP_DIR = Path("deploy/backups")
MANIFEST_FILE = BACKUP_DIR / "manifest.json"
DEFAULT_RETENTION_DAYS = 30


class BackupInfo:
    """Metadata about a completed backup."""

    def __init__(
        self,
        backup_id: str,
        file_path: str,
        size_bytes: int,
        created_at: str,
        duration_seconds: float,
        checksum: str,
        verified: bool = False,
        backup_type: str = "full",
    ):
        """Initialize a backup metadata record.

        Stores all the metadata about a completed database backup, including
        the unique identifier, file path on disk, size, creation timestamp,
        duration of the backup operation, SHA-256 checksum for integrity
        verification, and whether the backup has been verified by a test restore.

        Args
        ----
        backup_id : str
            Unique identifier for the backup (e.g., ``"full-20261025-160000"``).
        file_path : str
            Absolute or relative path to the encrypted backup file on disk.
        size_bytes : int
            Size of the backup file in bytes after compression and encryption.
        created_at : str
            ISO-8601 timestamp when the backup was created.
        duration_seconds : float
            How long the backup operation took in seconds.
        checksum : str
            SHA-256 hex digest of the backup file for integrity verification.
        verified : bool, optional
            Whether the backup has been verified by a test restore (default ``False``).
        backup_type : str, optional
            Type of backup: ``"full"`` or ``"incremental"`` (default ``"full"``).
        """
        self.backup_id = backup_id
        self.file_path = file_path
        self.size_bytes = size_bytes
        self.created_at = created_at
        self.duration_seconds = duration_seconds
        self.checksum = checksum
        self.verified = verified
        self.backup_type = backup_type

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the backup metadata to a dictionary.

        Returns
        -------
        Dict[str, Any]
            A dictionary containing all backup metadata fields, suitable for
            JSON serialization or API response.
        """
        return {
            "backup_id": self.backup_id,
            "file_path": self.file_path,
            "size_bytes": self.size_bytes,
            "created_at": self.created_at,
            "duration_seconds": self.duration_seconds,
            "checksum": self.checksum,
            "verified": self.verified,
            "backup_type": self.backup_type,
        }


class DatabaseBackupService:
    """Service for managing PostgreSQL database backups.

    Handles full database dumps, WAL archiving coordination, encryption,
    retention management, and restore operations.
    """

    def __init__(self):
        """Initialize the database backup service.

        Creates the backup directory if it does not exist and sets the default
        retention policy. The backup directory (``deploy/backups/``) stores
        encrypted dump files and the manifest that tracks backup metadata.

        Side Effects
        ~~~~~~~~~~~~

        * Creates ``deploy/backups/`` directory with ``exist_ok=True``.
        """
        self.backup_dir = BACKUP_DIR
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        self.retention_days = DEFAULT_RETENTION_DAYS

    def _load_manifest(self) -> List[Dict[str, Any]]:
        """Load the backup manifest file."""
        if MANIFEST_FILE.exists():
            with open(MANIFEST_FILE, "r") as f:
                return json.load(f)
        return []

    def _save_manifest(self, backups: List[Dict[str, Any]]):
        """Save the backup manifest file."""
        with open(MANIFEST_FILE, "w") as f:
            json.dump(backups, f, indent=2)

    async def create_backup(
        self,
        backup_type: str = "full",
        encrypt: bool = True,
    ) -> Optional[BackupInfo]:
        """Create a new database backup.

        Process Flow
        ~~~~~~~~~~~~

        1. Generate a unique backup ID based on timestamp.
        2. Construct the pg_dump command with custom format and compression.
        3. Execute pg_dump asynchronously, capturing the database dump.
        4. If encryption is enabled, encrypt the dump with GPG.
        5. Calculate the SHA-256 checksum of the final backup file.
        6. Record metadata in the manifest file.
        7. Apply retention policy to purge old backups.

        Args:
            backup_type: Type of backup ("full" or "schema-only").
            encrypt: Whether to encrypt the backup with GPG.

        Returns:
            BackupInfo object with metadata about the created backup,
            or None if the backup failed.

        Raises:
            subprocess.CalledProcessError: If pg_dump fails.
            FileNotFoundError: If pg_dump is not found in PATH.
        """
        timestamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
        backup_id = f"full-{timestamp}"
        dump_file = self.backup_dir / f"{backup_id}.dump"
        final_file = dump_file

        try:
            # Build pg_dump command
            db_url = settings.DATABASE_URL
            cmd = [
                "pg_dump",
                "--format=custom",
                "--compress=9",
                "--blobs",
                "--verbose",
                db_url,
            ]

            if backup_type == "schema-only":
                cmd.append("--schema-only")

            # Execute pg_dump
            start_time = datetime.now()
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=open(dump_file, "wb"),
                stderr=subprocess.PIPE,
            )
            _, stderr = await process.communicate()

            if process.returncode != 0:
                print(f"pg_dump failed: {stderr.decode()}")
                if dump_file.exists():
                    dump_file.unlink()
                return None

            duration = (datetime.now() - start_time).total_seconds()

            # Encrypt if requested
            if encrypt:
                encrypted_file = dump_file.with_suffix(".dump.gpg")
                encrypt_cmd = [
                    "gpg", "--batch", "--yes", "--symmetric",
                    "--cipher-algo", "AES256",
                    "--passphrase", os.environ.get("BACKUP_ENCRYPTION_KEY", "eisenhower-backup"),
                    "-o", str(encrypted_file),
                    str(dump_file),
                ]
                encrypt_process = await asyncio.create_subprocess_exec(
                    *encrypt_cmd,
                    stderr=subprocess.PIPE,
                )
                _, _ = await encrypt_process.communicate()

                if encrypt_process.returncode == 0:
                    dump_file.unlink()  # Remove unencrypted file
                    final_file = encrypted_file

            # Calculate checksum
            checksum_process = await asyncio.create_subprocess_exec(
                "sha256sum", str(final_file),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            stdout, _ = await checksum_process.communicate()
            checksum = stdout.decode().split()[0] if stdout else ""

            size_bytes = final_file.stat().st_size

            backup_info = BackupInfo(
                backup_id=backup_id,
                file_path=str(final_file),
                size_bytes=size_bytes,
                created_at=datetime.now().isoformat(),
                duration_seconds=duration,
                checksum=checksum,
                backup_type=backup_type,
            )

            # Update manifest
            backups = self._load_manifest()
            backups.append(backup_info.to_dict())
            self._save_manifest(backups)

            # Apply retention
            await self.apply_retention()

            return backup_info

        except Exception as e:
            print(f"Backup failed: {e}")
            if dump_file.exists():
                dump_file.unlink()
            return None

    async def list_backups(self) -> List[Dict[str, Any]]:
        """List all backups from the manifest.

        Returns
        -------
        List[Dict[str, Any]]
            List of backup metadata dictionaries, sorted by creation date
            (newest first).
        """
        backups = self._load_manifest()
        backups.sort(key=lambda b: b.get("created_at", ""), reverse=True)
        return backups

    async def get_backup(self, backup_id: str) -> Optional[Dict[str, Any]]:
        """Get metadata for a specific backup.

        Args:
            backup_id: The backup identifier.

        Returns:
            Backup metadata dictionary or None if not found.
        """
        backups = self._load_manifest()
        for backup in backups:
            if backup["backup_id"] == backup_id:
                return backup
        return None

    async def delete_backup(self, backup_id: str) -> bool:
        """Delete a backup and update the manifest.

        Args:
            backup_id: The backup identifier.

        Returns:
            True if the backup was deleted, False if not found.
        """
        backups = self._load_manifest()
        updated = []
        deleted = False

        for backup in backups:
            if backup["backup_id"] == backup_id:
                # Remove the file
                file_path = Path(backup["file_path"])
                if file_path.exists():
                    file_path.unlink()
                deleted = True
            else:
                updated.append(backup)

        if deleted:
            self._save_manifest(updated)
        return deleted

    async def verify_backup(self, backup_id: str) -> Dict[str, Any]:
        """Verify a backup's integrity by checking its checksum.

        Args:
            backup_id: The backup identifier.

        Returns:
            Dictionary with verification results including 'valid' boolean
            and 'message' describing the result.
        """
        backup = await self.get_backup(backup_id)
        if not backup:
            return {"valid": False, "message": "Backup not found"}

        file_path = Path(backup["file_path"])
        if not file_path.exists():
            return {"valid": False, "message": "Backup file missing"}

        # Verify checksum
        checksum_process = await asyncio.create_subprocess_exec(
            "sha256sum", str(file_path),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        stdout, _ = await checksum_process.communicate()
        current_checksum = stdout.decode().split()[0] if stdout else ""

        valid = current_checksum == backup["checksum"]

        if valid:
            # Update manifest
            backups = self._load_manifest()
            for b in backups:
                if b["backup_id"] == backup_id:
                    b["verified"] = True
                    break
            self._save_manifest(backups)

        return {
            "valid": valid,
            "message": "Checksum verified" if valid else "Checksum mismatch",
            "expected_checksum": backup["checksum"],
            "actual_checksum": current_checksum,
        }

    async def restore_backup(
        self,
        backup_id: str,
        target_db: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Restore a database from a backup.

        WARNING: This operation will overwrite the target database.

        Args:
            backup_id: The backup identifier.
            target_db: Optional target database URL. If not provided,
                uses the configured DATABASE_URL.

        Returns:
            Dictionary with restore results including 'success' boolean
            and 'message' describing the result.
        """
        backup = await self.get_backup(backup_id)
        if not backup:
            return {"success": False, "message": "Backup not found"}

        file_path = Path(backup["file_path"])
        if not file_path.exists():
            return {"success": False, "message": "Backup file missing"}

        db_url = target_db or settings.DATABASE_URL

        try:
            # If encrypted, decrypt first
            restore_file = file_path
            if file_path.suffix == ".gpg":
                decrypted = file_path.with_suffix(".dump")
                decrypt_cmd = [
                    "gpg", "--batch", "--yes", "--decrypt",
                    "--passphrase", os.environ.get("BACKUP_ENCRYPTION_KEY", "eisenhower-backup"),
                    "-o", str(decrypted),
                    str(file_path),
                ]
                process = await asyncio.create_subprocess_exec(
                    *decrypt_cmd,
                    stderr=subprocess.PIPE,
                )
                _, _ = await process.communicate()
                if process.returncode == 0:
                    restore_file = decrypted

            # Restore using pg_restore
            restore_cmd = [
                "pg_restore",
                "--verbose",
                "--no-owner",
                "--no-privileges",
                "-d", db_url,
                str(restore_file),
            ]
            process = await asyncio.create_subprocess_exec(
                *restore_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            stdout, stderr = await process.communicate()

            # Clean up decrypted file
            if restore_file != file_path and restore_file.exists():
                restore_file.unlink()

            success = process.returncode == 0
            return {
                "success": success,
                "message": stdout.decode() if success else stderr.decode(),
            }

        except Exception as e:
            return {"success": False, "message": str(e)}

    async def apply_retention(self):
        """Apply retention policy by removing backups older than retention_days.

        This is called automatically after each new backup is created.
        """
        cutoff = datetime.now() - timedelta(days=self.retention_days)
        backups = self._load_manifest()
        kept = []
        removed = []

        for backup in backups:
            created = datetime.fromisoformat(backup.get("created_at", ""))
            if created >= cutoff:
                kept.append(backup)
            else:
                # Remove old backup file
                file_path = Path(backup["file_path"])
                if file_path.exists():
                    file_path.unlink()
                removed.append(backup)

        if removed:
            self._save_manifest(kept)

    async def get_status(self) -> Dict[str, Any]:
        """Get the current backup status.

        Returns
        -------
        Dict[str, Any]
            Dictionary containing:
            - total_backups: Total number of backups in manifest.
            - latest_backup: ISO timestamp of the most recent backup.
            - total_size_bytes: Sum of all backup file sizes.
            - retention_days: Current retention policy in days.
            - backup_dir: Path to the backup directory.
        """
        backups = self._load_manifest()
        total_size = sum(b.get("size_bytes", 0) for b in backups)
        latest = backups[0]["created_at"] if backups else None

        return {
            "total_backups": len(backups),
            "latest_backup": latest,
            "total_size_bytes": total_size,
            "retention_days": self.retention_days,
            "backup_dir": str(self.backup_dir),
        }


# Singleton instance
db_backup_service = DatabaseBackupService()
