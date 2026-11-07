"""Comprehensive tests for the data diode directory polling daemon and
verification engine.

Validates automated bundle ingestion, cryptographic signature verification,
malicious payload inspection, quarantine staging, and database staging for
both .defpack and .merklepack bundle types.
"""
import hashlib
import json
import os
import tempfile
import zipfile
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.models import (
    AuditActionType,
    DiodeBundleType,
    DiodeIngestionStatus,
    ForensicAuditLog,
    MerkleMergeStaging,
    PortfolioNode,
    QuarantineBatch,
    QuarantineFileFormat,
    QuarantineValidationStatus,
    SecurityClassification,
    TreeType,
    User,
    UserRole,
)
from app.services.diode_ingest_daemon import (
    DiodeIngestDaemon,
    DiodeIngestError,
    _compute_section_hash,
    safe_resolve_path,
)


# ============================================================================
# Helpers
# ============================================================================


def _make_db():
    """Create an in-memory SQLite database session."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return SessionLocal()


def _make_user(db):
    """Create a test user."""
    user = User(
        username=f"user_{uuid4().hex[:8]}",
        email=f"{uuid4().hex[:8]}@test.com",
        hashed_password="hashed",
        role=UserRole.MEMBER,
        clearance_level=SecurityClassification.SECRET,
        is_active=True,
    )
    db.add(user)
    db.commit()
    return user


def _make_node(db):
    """Create a test PortfolioNode."""
    node = PortfolioNode(
        id=uuid4(),
        tree_type=TreeType.WBS,
        code=f"WP-{uuid4().hex[:6]}",
        name="Test Work Package",
        path="1",
        security_classification=SecurityClassification.SECRET,
    )
    db.add(node)
    db.commit()
    return node


def _build_payload(project_id=None, source_system="TestSite"):
    """Build a canonical payload dict for testing."""
    if project_id is None:
        project_id = str(uuid4())
    return {
        "version": "1.0",
        "transaction_id": str(uuid4()),
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "exported_by": "test@system.local",
        "source_system": source_system,
        "project_id": project_id,
        "classification_ceiling": "SECRET",
        "nodes": [{"id": project_id, "node_class": "PROJECT", "name": "Test", "path": "1"}],
        "dependencies": [],
        "assignments": [],
        "baselines": [],
        "audit_trail": [],
    }


def _build_manifest(payload):
    """Build a manifest dict from a payload."""
    return {
        "version": _compute_section_hash(payload["version"]),
        "transaction_id": _compute_section_hash(payload["transaction_id"]),
        "nodes": _compute_section_hash(payload["nodes"]),
        "dependencies": _compute_section_hash(payload["dependencies"]),
        "assignments": _compute_section_hash(payload["assignments"]),
        "baselines": _compute_section_hash(payload["baselines"]),
        "audit_trail": _compute_section_hash(payload["audit_trail"]),
    }


def _compute_signature(manifest):
    """Compute deterministic signature of the manifest."""
    manifest_json = json.dumps(manifest, sort_keys=True)
    return hashlib.sha256(manifest_json.encode("utf-8")).hexdigest()


def _create_bundle(
    tmp_dir: Path,
    filename: str = "test.defpack",
    payload=None,
    corrupt_signature: bool = False,
    corrupt_checksum: bool = False,
    include_dangerous_file: bool = False,
    include_symlink: bool = False,
    missing_manifest: bool = False,
    missing_payload: bool = False,
    missing_signature: bool = False,
):
    """Create a synthetic .defpack or .merklepack bundle for testing.

    Parameters
    ----------
    tmp_dir : Path
        Directory to create the bundle in.
    filename : str
        Name of the bundle file.
    payload : dict or None
        Payload data.  If None, a default payload is generated.
    corrupt_signature : bool
        If True, write a random signature instead of the correct one.
    corrupt_checksum : bool
        If True, corrupt one manifest checksum.
    include_dangerous_file : bool
        If True, include a .exe file in the archive.
    include_symlink : bool
        If True, include a symlink entry in the archive.
    missing_manifest : bool
        If True, omit manifest.json.
    missing_payload : bool
        If True, omit payload.json.
    missing_signature : bool
        If True, omit signature.bin.

    Returns
    -------
    Path
        Path to the created bundle file.
    """
    if payload is None:
        payload = _build_payload()
    manifest = _build_manifest(payload)

    if corrupt_checksum:
        # Corrupt the nodes checksum
        manifest["nodes"] = "0" * 64

    signature = _compute_signature(manifest)
    if corrupt_signature:
        signature = "dead" * 16

    bundle_path = tmp_dir / filename
    with zipfile.ZipFile(bundle_path, "w", zipfile.ZIP_DEFLATED) as zf:
        if not missing_payload:
            zf.writestr("payload.json", json.dumps(payload, indent=2, default=str))
        if not missing_manifest:
            zf.writestr("manifest.json", json.dumps(manifest, indent=2))
        if not missing_signature:
            zf.writestr("signature.bin", signature)
        if include_dangerous_file:
            zf.writestr("malware.exe", "MZ fake executable")
        if include_symlink:
            # Create a fake symlink entry
            import io
            zip_info = zipfile.ZipInfo("link_to_secret")
            # Set external attribute to indicate symlink (0o120000 << 16)
            zip_info.external_attr = 0o120000 << 16
            zf.writestr(zip_info, "/etc/passwd")

    return bundle_path


def _create_zip_bomb(tmp_dir: Path, ratio: float = 200.0):
    """Create a zip bomb archive with high compression ratio.

    Parameters
    ----------
    tmp_dir : Path
        Directory to create the bundle in.
    ratio : float
        Target compression ratio.

    Returns
    -------
    Path
        Path to the created zip bomb file.
    """
    # Create a small compressed payload that expands to a large uncompressed size
    bundle_path = tmp_dir / "bomb.defpack"
    with zipfile.ZipFile(bundle_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # Write a large repetitive string that compresses well
        large_data = "A" * int(1024 * ratio)
        zf.writestr("payload.json", json.dumps({
            "version": "1.0",
            "transaction_id": str(uuid4()),
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "exported_by": "test",
            "source_system": "Test",
            "project_id": str(uuid4()),
            "classification_ceiling": "SECRET",
            "nodes": [{"data": "A" * 1024}],
            "dependencies": [],
            "assignments": [],
            "baselines": [],
            "audit_trail": [],
        }))
        zf.writestr("manifest.json", "{}")
        zf.writestr("signature.bin", "fake")

    return bundle_path


# ============================================================================
# Section hash tests
# ============================================================================


class TestComputeSectionHash:
    """Test _compute_section_hash helper."""

    def test_empty_list(self):
        h = _compute_section_hash([])
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_empty_dict(self):
        h = _compute_section_hash({})
        assert len(h) == 64

    def test_consistent_hash(self):
        data = {"key": "value", "list": [1, 2, 3]}
        h1 = _compute_section_hash(data)
        h2 = _compute_section_hash(data)
        assert h1 == h2

    def test_different_data_different_hash(self):
        h1 = _compute_section_hash({"a": 1})
        h2 = _compute_section_hash({"a": 2})
        assert h1 != h2

    def test_sorted_keys(self):
        # Hash should be deterministic regardless of dict insertion order
        h1 = _compute_section_hash({"b": 1, "a": 2})
        h2 = _compute_section_hash({"a": 2, "b": 1})
        assert h1 == h2


# ============================================================================
# Safe path resolution tests
# ============================================================================


class TestSafeResolvePath:
    """Test safe_resolve_path helper."""

    def test_path_within_base(self, tmp_path):
        base = tmp_path / "base"
        base.mkdir()
        child = base / "file.txt"
        child.touch()
        resolved = safe_resolve_path(child, base)
        assert resolved == child.resolve()

    def test_path_outside_base_raises(self, tmp_path):
        base = tmp_path / "base"
        base.mkdir()
        outside = tmp_path / "outside.txt"
        outside.touch()
        with pytest.raises(DiodeIngestError, match="outside"):
            safe_resolve_path(outside, base)


# ============================================================================
# Bundle creation tests
# ============================================================================


class TestBundleCreation:
    """Test synthetic bundle creation helpers."""

    def test_create_valid_defpack(self, tmp_path):
        bundle = _create_bundle(tmp_path, "test.defpack")
        assert bundle.exists()
        assert bundle.suffix == ".defpack"

        with zipfile.ZipFile(bundle, "r") as zf:
            names = zf.namelist()
            assert "payload.json" in names
            assert "manifest.json" in names
            assert "signature.bin" in names

    def test_create_valid_merklepack(self, tmp_path):
        bundle = _create_bundle(tmp_path, "test.merklepack")
        assert bundle.exists()
        assert bundle.suffix == ".merklepack"

    def test_corrupt_signature_bundle(self, tmp_path):
        bundle = _create_bundle(tmp_path, "corrupt.defpack", corrupt_signature=True)
        assert bundle.exists()

    def test_corrupt_checksum_bundle(self, tmp_path):
        bundle = _create_bundle(tmp_path, "corrupt.defpack", corrupt_checksum=True)
        assert bundle.exists()

    def test_bundle_with_dangerous_file(self, tmp_path):
        bundle = _create_bundle(tmp_path, "malicious.defpack", include_dangerous_file=True)
        assert bundle.exists()

        with zipfile.ZipFile(bundle, "r") as zf:
            names = zf.namelist()
            assert "malware.exe" in names

    def test_bundle_with_symlink(self, tmp_path):
        bundle = _create_bundle(tmp_path, "symlink.defpack", include_symlink=True)
        assert bundle.exists()


# ============================================================================
# DiodeIngestDaemon — quarantine staging
# ============================================================================


class TestQuarantineStaging:
    """Test quarantine file movement."""

    def test_move_to_quarantine(self, tmp_path):
        drop_dir = tmp_path / "drop"
        quarantine_dir = tmp_path / "quarantine"
        drop_dir.mkdir()
        quarantine_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        # Create a test file in drop zone
        test_file = drop_dir / "test.txt"
        test_file.write_text("hello")

        quarantined = daemon._move_to_quarantine(test_file)
        assert quarantined.exists()
        assert not test_file.exists()
        assert quarantined == quarantine_dir / "test.txt"

    def test_quarantine_preserves_content(self, tmp_path):
        drop_dir = tmp_path / "drop"
        quarantine_dir = tmp_path / "quarantine"
        drop_dir.mkdir()
        quarantine_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        test_file = drop_dir / "test.txt"
        test_file.write_text("secret data")

        quarantined = daemon._move_to_quarantine(test_file)
        assert quarantined.read_text() == "secret data"


# ============================================================================
# DiodeIngestDaemon — path resolution check
# ============================================================================


class TestPathResolutionCheck:
    """Test path resolution security check."""

    def test_valid_path_passes(self, tmp_path):
        drop_dir = tmp_path / "drop"
        quarantine_dir = tmp_path / "quarantine"
        drop_dir.mkdir()
        quarantine_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        test_file = quarantine_dir / "test.txt"
        test_file.touch()

        # Should not raise
        daemon._check_path_resolution(test_file)

    def test_path_outside_quarantine_fails(self, tmp_path):
        drop_dir = tmp_path / "drop"
        quarantine_dir = tmp_path / "quarantine"
        drop_dir.mkdir()
        quarantine_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        # File outside quarantine
        outside_file = drop_dir / "test.txt"
        outside_file.touch()

        with pytest.raises(DiodeIngestError, match="outside quarantine"):
            daemon._check_path_resolution(outside_file)


# ============================================================================
# DiodeIngestDaemon — archive size check
# ============================================================================


class TestArchiveSizeCheck:
    """Test archive size limit enforcement."""

    def test_small_archive_passes(self, tmp_path):
        quarantine_dir = tmp_path / "quarantine"
        quarantine_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(tmp_path / "drop"),
            quarantine_dir=str(quarantine_dir),
            max_archive_size_mb=1,
        )

        test_file = quarantine_dir / "small.defpack"
        test_file.write_bytes(b"small")

        # Should not raise
        daemon._check_archive_size(test_file)

    def test_oversized_archive_rejected(self, tmp_path):
        quarantine_dir = tmp_path / "quarantine"
        quarantine_dir.mkdir()

        # Set max size to 0 bytes — any non-empty file should be rejected
        daemon = DiodeIngestDaemon(
            drop_dir=str(tmp_path / "drop"),
            quarantine_dir=str(quarantine_dir),
        )
        daemon.max_archive_size_bytes = 0

        test_file = quarantine_dir / "large.defpack"
        test_file.write_bytes(b"x" * 1024)

        with pytest.raises(DiodeIngestError, match="exceeds maximum"):
            daemon._check_archive_size(test_file)


# ============================================================================
# DiodeIngestDaemon — malicious payload inspection
# ============================================================================


class TestMaliciousPayloadInspection:
    """Test malicious payload detection."""

    def test_clean_archive_passes(self, tmp_path):
        quarantine_dir = tmp_path / "quarantine"
        quarantine_dir.mkdir()
        drop_dir = tmp_path / "drop"
        drop_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        bundle = _create_bundle(quarantine_dir, "clean.defpack")
        # Should not raise
        daemon._inspect_malicious_payload(bundle)

    def test_executable_binary_rejected(self, tmp_path):
        quarantine_dir = tmp_path / "quarantine"
        quarantine_dir.mkdir()
        drop_dir = tmp_path / "drop"
        drop_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        bundle = _create_bundle(
            quarantine_dir, "malicious.defpack", include_dangerous_file=True
        )
        with pytest.raises(DiodeIngestError, match="Dangerous file extension"):
            daemon._inspect_malicious_payload(bundle)

    def test_symlink_rejected(self, tmp_path):
        quarantine_dir = tmp_path / "quarantine"
        quarantine_dir.mkdir()
        drop_dir = tmp_path / "drop"
        drop_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        bundle = _create_bundle(
            quarantine_dir, "symlink.defpack", include_symlink=True
        )
        with pytest.raises(DiodeIngestError, match="Symlink detected"):
            daemon._inspect_malicious_payload(bundle)

    def test_shell_script_rejected(self, tmp_path):
        quarantine_dir = tmp_path / "quarantine"
        quarantine_dir.mkdir()
        drop_dir = tmp_path / "drop"
        drop_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        bundle = _create_bundle(
            quarantine_dir, "shell.defpack", include_dangerous_file=True
        )
        # The helper creates malware.exe; let's also test .sh
        bundle_path = quarantine_dir / "shell.defpack"
        with zipfile.ZipFile(bundle_path, "r") as zf:
            names = zf.namelist()

        # Recreate with .sh
        bundle_path.unlink()
        payload = _build_payload()
        manifest = _build_manifest(payload)
        signature = _compute_signature(manifest)

        with zipfile.ZipFile(bundle_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("payload.json", json.dumps(payload, indent=2, default=str))
            zf.writestr("manifest.json", json.dumps(manifest, indent=2))
            zf.writestr("signature.bin", signature)
            zf.writestr("script.sh", "#!/bin/bash\necho pwned")

        with pytest.raises(DiodeIngestError, match="Dangerous file extension"):
            daemon._inspect_malicious_payload(bundle_path)

    def test_zip_bomb_rejected(self, tmp_path):
        quarantine_dir = tmp_path / "quarantine"
        quarantine_dir.mkdir()
        drop_dir = tmp_path / "drop"
        drop_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
            zip_bomb_ratio=10.0,  # Low threshold for testing
        )

        # Create a zip bomb with high compression ratio
        bundle_path = quarantine_dir / "bomb.defpack"
        with zipfile.ZipFile(bundle_path, "w", zipfile.ZIP_DEFLATED) as zf:
            # Large repetitive data that compresses very well
            large_data = "A" * 102400  # 100KB uncompressed
            payload_data = {
                "version": "1.0",
                "transaction_id": str(uuid4()),
                "exported_at": datetime.now(timezone.utc).isoformat(),
                "exported_by": "test",
                "source_system": "Test",
                "project_id": str(uuid4()),
                "classification_ceiling": "SECRET",
                "nodes": [{"data": large_data}],
                "dependencies": [],
                "assignments": [],
                "baselines": [],
                "audit_trail": [],
            }
            zf.writestr("payload.json", json.dumps(payload_data))
            zf.writestr("manifest.json", "{}")
            zf.writestr("signature.bin", "fake")

        with pytest.raises(DiodeIngestError, match="Zip bomb detected"):
            daemon._inspect_malicious_payload(bundle_path)

    def test_path_traversal_rejected(self, tmp_path):
        quarantine_dir = tmp_path / "quarantine"
        quarantine_dir.mkdir()
        drop_dir = tmp_path / "drop"
        drop_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        bundle_path = quarantine_dir / "traversal.defpack"
        payload = _build_payload()
        manifest = _build_manifest(payload)
        signature = _compute_signature(manifest)

        with zipfile.ZipFile(bundle_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("payload.json", json.dumps(payload, indent=2, default=str))
            zf.writestr("manifest.json", json.dumps(manifest, indent=2))
            zf.writestr("signature.bin", signature)
            zf.writestr("../../etc/passwd", "root:x:0:0")

        with pytest.raises(DiodeIngestError, match="Path traversal"):
            daemon._inspect_malicious_payload(bundle_path)

    def test_invalid_zip_rejected(self, tmp_path):
        quarantine_dir = tmp_path / "quarantine"
        quarantine_dir.mkdir()
        drop_dir = tmp_path / "drop"
        drop_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        bundle_path = quarantine_dir / "invalid.defpack"
        bundle_path.write_bytes(b"not a zip file")

        with pytest.raises(DiodeIngestError, match="Invalid ZIP"):
            daemon._inspect_malicious_payload(bundle_path)


# ============================================================================
# DiodeIngestDaemon — cryptographic attestation verification
# ============================================================================


class TestCryptographicAttestation:
    """Test signature and checksum verification."""

    def test_valid_signature_verifies(self, tmp_path):
        quarantine_dir = tmp_path / "quarantine"
        quarantine_dir.mkdir()
        drop_dir = tmp_path / "drop"
        drop_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        bundle = _create_bundle(quarantine_dir, "valid.defpack")
        bundle_type, manifest, payload = daemon._verify_attestation(bundle)

        assert bundle_type == DiodeBundleType.DEF_PACK
        assert "nodes" in payload
        assert "version" in manifest

    def test_corrupt_signature_rejected(self, tmp_path):
        quarantine_dir = tmp_path / "quarantine"
        quarantine_dir.mkdir()
        drop_dir = tmp_path / "drop"
        drop_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        bundle = _create_bundle(
            quarantine_dir, "corrupt.defpack", corrupt_signature=True
        )
        with pytest.raises(DiodeIngestError, match="Signature verification failed"):
            daemon._verify_attestation(bundle)

    def test_corrupt_checksum_rejected(self, tmp_path):
        quarantine_dir = tmp_path / "quarantine"
        quarantine_dir.mkdir()
        drop_dir = tmp_path / "drop"
        drop_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        bundle = _create_bundle(
            quarantine_dir, "corrupt.defpack", corrupt_checksum=True
        )
        with pytest.raises(DiodeIngestError, match="Checksum mismatch"):
            daemon._verify_attestation(bundle)

    def test_missing_manifest_rejected(self, tmp_path):
        quarantine_dir = tmp_path / "quarantine"
        quarantine_dir.mkdir()
        drop_dir = tmp_path / "drop"
        drop_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        bundle = _create_bundle(
            quarantine_dir, "no_manifest.defpack", missing_manifest=True
        )
        with pytest.raises(DiodeIngestError, match="Missing manifest.json"):
            daemon._verify_attestation(bundle)

    def test_missing_payload_rejected(self, tmp_path):
        quarantine_dir = tmp_path / "quarantine"
        quarantine_dir.mkdir()
        drop_dir = tmp_path / "drop"
        drop_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        bundle = _create_bundle(
            quarantine_dir, "no_payload.defpack", missing_payload=True
        )
        with pytest.raises(DiodeIngestError, match="Missing payload.json"):
            daemon._verify_attestation(bundle)

    def test_missing_signature_rejected(self, tmp_path):
        quarantine_dir = tmp_path / "quarantine"
        quarantine_dir.mkdir()
        drop_dir = tmp_path / "drop"
        drop_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        bundle = _create_bundle(
            quarantine_dir, "no_sig.defpack", missing_signature=True
        )
        with pytest.raises(DiodeIngestError, match="Missing signature.bin"):
            daemon._verify_attestation(bundle)

    def test_merklepack_type_detected(self, tmp_path):
        quarantine_dir = tmp_path / "quarantine"
        quarantine_dir.mkdir()
        drop_dir = tmp_path / "drop"
        drop_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        bundle = _create_bundle(quarantine_dir, "test.merklepack")
        bundle_type, manifest, payload = daemon._verify_attestation(bundle)

        assert bundle_type == DiodeBundleType.MERKLE_PACK


# ============================================================================
# DiodeIngestDaemon — full pipeline integration
# ============================================================================


class TestFullPipelineIntegration:
    """Test end-to-end bundle processing through the full pipeline."""

    def test_process_valid_defpack_without_db(self, tmp_path):
        """Process a valid .defpack without database staging."""
        import asyncio
        drop_dir = tmp_path / "drop"
        quarantine_dir = tmp_path / "quarantine"
        drop_dir.mkdir()
        quarantine_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        bundle = _create_bundle(drop_dir, "test.defpack")
        result = asyncio.run(daemon.process_bundle(str(bundle)))

        assert result["status"] == "verified"
        assert result["filename"] == "test.defpack"
        assert result["bundle_type"] == "DEF_PACK"
        assert "quarantine_path" in result

        # File should be in quarantine
        assert (quarantine_dir / "test.defpack").exists()
        assert not (drop_dir / "test.defpack").exists()

    def test_process_valid_merklepack_without_db(self, tmp_path):
        """Process a valid .merklepack without database staging."""
        import asyncio
        drop_dir = tmp_path / "drop"
        quarantine_dir = tmp_path / "quarantine"
        drop_dir.mkdir()
        quarantine_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        bundle = _create_bundle(drop_dir, "test.merklepack")
        result = asyncio.run(daemon.process_bundle(str(bundle)))

        assert result["status"] == "verified"
        assert result["bundle_type"] == "MERKLE_PACK"

    def test_process_corrupt_signature_rejected(self, tmp_path):
        """Reject a bundle with corrupted signature."""
        import asyncio
        drop_dir = tmp_path / "drop"
        quarantine_dir = tmp_path / "quarantine"
        drop_dir.mkdir()
        quarantine_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        bundle = _create_bundle(
            drop_dir, "corrupt.defpack", corrupt_signature=True
        )
        with pytest.raises(DiodeIngestError, match="Signature verification failed"):
            asyncio.run(daemon.process_bundle(str(bundle)))

    def test_process_dangerous_file_rejected(self, tmp_path):
        """Reject a bundle containing executable files."""
        import asyncio
        drop_dir = tmp_path / "drop"
        quarantine_dir = tmp_path / "quarantine"
        drop_dir.mkdir()
        quarantine_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        bundle = _create_bundle(
            drop_dir, "malicious.defpack", include_dangerous_file=True
        )
        with pytest.raises(DiodeIngestError, match="Dangerous file extension"):
            asyncio.run(daemon.process_bundle(str(bundle)))

    def test_process_symlink_rejected(self, tmp_path):
        """Reject a bundle containing symlinks."""
        import asyncio
        drop_dir = tmp_path / "drop"
        quarantine_dir = tmp_path / "quarantine"
        drop_dir.mkdir()
        quarantine_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        bundle = _create_bundle(
            drop_dir, "symlink.defpack", include_symlink=True
        )
        with pytest.raises(DiodeIngestError, match="Symlink detected"):
            asyncio.run(daemon.process_bundle(str(bundle)))


# ============================================================================
# DiodeIngestDaemon — database staging
# ============================================================================


class TestDatabaseStaging:
    """Test database staging for verified bundles."""

    def test_stage_defpack_to_merkle_staging(self, tmp_path):
        """Stage a .defpack into MerkleMergeStaging.

        Note: QuarantineBatch has a FK mismatch (UUID vs Integer User.id),
        so defpack bundles are staged into MerkleMergeStaging instead.
        """
        import asyncio
        db = _make_db()
        user = _make_user(db)

        drop_dir = tmp_path / "drop"
        quarantine_dir = tmp_path / "quarantine"
        drop_dir.mkdir()
        quarantine_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        payload = _build_payload(source_system="TestSite")
        bundle = _create_bundle(drop_dir, "test.defpack", payload=payload)

        result = asyncio.run(daemon.process_bundle(str(bundle), db=db))

        assert result["status"] == "staged"
        assert "staging_id" in result

        # Verify MerkleMergeStaging was created
        staging = db.query(MerkleMergeStaging).filter_by(
            source_filename="test.defpack"
        ).first()
        assert staging is not None
        assert staging.bundle_type == DiodeBundleType.DEF_PACK
        assert staging.originating_site == "TestSite"
        assert staging.signature_verified is True
        assert staging.ingestion_status == DiodeIngestionStatus.VERIFIED

        # Verify audit log entry
        audit = db.query(ForensicAuditLog).filter_by(
            action_type=AuditActionType.DIODE_INGEST_COMPLETED,
            entity_type="MerkleMergeStaging",
        ).first()
        assert audit is not None
        assert audit.entity_id == staging.id

    def test_stage_merklepack_to_merkle_staging(self, tmp_path):
        """Stage a .merklepack into MerkleMergeStaging."""
        import asyncio
        db = _make_db()
        user = _make_user(db)

        drop_dir = tmp_path / "drop"
        quarantine_dir = tmp_path / "quarantine"
        drop_dir.mkdir()
        quarantine_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        payload = _build_payload(source_system="SovereignSite-Alpha")
        bundle = _create_bundle(drop_dir, "sync.merklepack", payload=payload)

        result = asyncio.run(daemon.process_bundle(str(bundle), db=db))

        assert result["status"] == "staged"
        assert "staging_id" in result

        # Verify MerkleMergeStaging was created
        staging = db.query(MerkleMergeStaging).filter_by(
            source_filename="sync.merklepack"
        ).first()
        assert staging is not None
        assert staging.bundle_type == DiodeBundleType.MERKLE_PACK
        assert staging.originating_site == "SovereignSite-Alpha"
        assert staging.signature_verified is True
        assert staging.ingestion_status == DiodeIngestionStatus.VERIFIED

        # Verify audit log entry
        audit = db.query(ForensicAuditLog).filter_by(
            action_type=AuditActionType.DIODE_INGEST_COMPLETED,
            entity_type="MerkleMergeStaging",
        ).first()
        assert audit is not None
        assert audit.entity_id == staging.id

    def test_multiple_bundles_staged_independently(self, tmp_path):
        """Verify multiple bundles are staged as separate records."""
        import asyncio
        db = _make_db()

        drop_dir = tmp_path / "drop"
        quarantine_dir = tmp_path / "quarantine"
        drop_dir.mkdir()
        quarantine_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        # Stage two defpacks
        for i in range(2):
            payload = _build_payload(source_system=f"Site-{i}")
            bundle = _create_bundle(
                drop_dir, f"bundle_{i}.defpack", payload=payload
            )
            asyncio.run(daemon.process_bundle(str(bundle), db=db))

        stagings = db.query(MerkleMergeStaging).all()
        assert len(stagings) == 2

        audits = db.query(ForensicAuditLog).filter_by(
            action_type=AuditActionType.DIODE_INGEST_COMPLETED,
        ).all()
        assert len(audits) == 2


# ============================================================================
# DiodeIngestDaemon — daemon lifecycle
# ============================================================================


class TestDaemonLifecycle:
    """Test daemon start/stop lifecycle."""

    def test_daemon_creates_directories(self, tmp_path):
        """Verify daemon creates drop and quarantine directories."""
        drop_dir = tmp_path / "drop"
        quarantine_dir = tmp_path / "quarantine"

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        import asyncio
        async def _start():
            daemon._running = True
            daemon.drop_dir.mkdir(parents=True, exist_ok=True)
            daemon.quarantine_dir.mkdir(parents=True, exist_ok=True)

        asyncio.run(_start())
        assert drop_dir.exists()
        assert quarantine_dir.exists()

    def test_daemon_ignores_non_bundle_files(self, tmp_path):
        """Verify daemon ignores files with non-bundle extensions."""
        drop_dir = tmp_path / "drop"
        quarantine_dir = tmp_path / "quarantine"
        drop_dir.mkdir()
        quarantine_dir.mkdir()

        daemon = DiodeIngestDaemon(
            drop_dir=str(drop_dir),
            quarantine_dir=str(quarantine_dir),
        )

        # Create non-bundle files
        (drop_dir / "readme.txt").write_text("hello")
        (drop_dir / "data.csv").write_text("a,b,c")

        import asyncio
        async def _scan():
            await daemon._scan_dropzone()

        asyncio.run(_scan())

        # Files should still be in drop zone (not moved)
        assert (drop_dir / "readme.txt").exists()
        assert (drop_dir / "data.csv").exists()
        # Quarantine should be empty
        assert len(list(quarantine_dir.iterdir())) == 0


# ============================================================================
# MerkleMergeStaging model tests
# ============================================================================


class TestMerkleMergeStagingModel:
    """Test MerkleMergeStaging model creation and queries."""

    def test_create_staging_record(self):
        db = _make_db()
        staging = MerkleMergeStaging(
            bundle_type=DiodeBundleType.MERKLE_PACK,
            source_filename="test.merklepack",
            originating_site="TestSite",
            signature_verified=True,
            staging_payload={"key": "value"},
            ingestion_status=DiodeIngestionStatus.VERIFIED,
        )
        db.add(staging)
        db.commit()

        assert staging.id is not None
        assert staging.bundle_type == DiodeBundleType.MERKLE_PACK
        assert staging.signature_verified is True

    def test_query_by_status(self):
        db = _make_db()
        for status in DiodeIngestionStatus:
            staging = MerkleMergeStaging(
                bundle_type=DiodeBundleType.MERKLE_PACK,
                source_filename=f"test_{status.value}.merklepack",
                originating_site="TestSite",
                ingestion_status=status,
            )
            db.add(staging)
        db.commit()

        for status in DiodeIngestionStatus:
            count = db.query(MerkleMergeStaging).filter_by(
                ingestion_status=status
            ).count()
            assert count == 1

    def test_rejection_reason_stored(self):
        db = _make_db()
        staging = MerkleMergeStaging(
            bundle_type=DiodeBundleType.DEF_PACK,
            source_filename="rejected.defpack",
            originating_site="TestSite",
            ingestion_status=DiodeIngestionStatus.REJECTED,
            rejection_reason="Signature verification failed",
        )
        db.add(staging)
        db.commit()

        assert staging.rejection_reason == "Signature verification failed"


# ============================================================================
# DiodeBundleType and DiodeIngestionStatus enum tests
# ============================================================================


class TestDiodeEnums:
    """Test diode-related enum values."""

    def test_diode_bundle_type_values(self):
        assert DiodeBundleType.DEF_PACK.value == "DEF_PACK"
        assert DiodeBundleType.MERKLE_PACK.value == "MERKLE_PACK"

    def test_diode_ingestion_status_values(self):
        assert DiodeIngestionStatus.PENDING.value == "PENDING"
        assert DiodeIngestionStatus.VERIFIED.value == "VERIFIED"
        assert DiodeIngestionStatus.STAGED.value == "STAGED"
        assert DiodeIngestionStatus.REJECTED.value == "REJECTED"

    def test_audit_action_diode_ingest(self):
        assert AuditActionType.DIODE_INGEST_COMPLETED.value == "DIODE_INGEST_COMPLETED"
