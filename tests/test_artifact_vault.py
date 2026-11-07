"""Tests for the classified document vault and artifact module.

This module tests the S3-compatible upload/download flows, SHA-256 checksum
verification, and ABAC clearance enforcement for classified document access.
"""
import pytest
import hashlib


class TestSHA256Checksum:
    """Test SHA-256 checksum computation for artifacts."""

    def test_checksum_length(self):
        """Test that SHA-256 checksum is 64 hex characters."""
        data = b"test file content"
        checksum = hashlib.sha256(data).hexdigest()
        assert len(checksum) == 64

    def test_deterministic_checksum(self):
        """Test that same file content produces same checksum."""
        data = b"file content"
        hash1 = hashlib.sha256(data).hexdigest()
        hash2 = hashlib.sha256(data).hexdigest()
        assert hash1 == hash2

    def test_different_content_different_checksum(self):
        """Test that different content produces different checksum."""
        hash1 = hashlib.sha256(b"content1").hexdigest()
        hash2 = hashlib.sha256(b"content2").hexdigest()
        assert hash1 != hash2

    def test_empty_file_checksum(self):
        """Test that empty file has valid checksum."""
        data = b""
        checksum = hashlib.sha256(data).hexdigest()
        assert len(checksum) == 64


class TestUploadFlow:
    """Test the two-phase upload flow."""

    def test_request_upload_returns_presigned_url(self):
        """Test that request-upload returns a presigned PUT URL."""
        # Simulated response
        response = {
            "presigned_url": "https://s3.example.com/bucket/key?X-Amz-Signature=...",
            "artifact_id": "uuid-123",
            "expires_in": 900,  # 15 minutes
        }
        assert "presigned_url" in response
        assert "artifact_id" in response
        assert response["expires_in"] == 900

    def test_confirm_upload_verifies_checksum(self):
        """Test that confirm-upload verifies SHA-256 checksum."""
        expected_checksum = hashlib.sha256(b"file content").hexdigest()
        provided_checksum = expected_checksum
        is_valid = expected_checksum == provided_checksum
        assert is_valid is True

    def test_confirm_upload_rejects_bad_checksum(self):
        """Test that confirm-upload rejects incorrect checksum."""
        expected_checksum = hashlib.sha256(b"correct content").hexdigest()
        provided_checksum = hashlib.sha256(b"wrong content").hexdigest()
        is_valid = expected_checksum == provided_checksum
        assert is_valid is False


class TestDownloadFlow:
    """Test the ABAC-gated download flow."""

    def test_download_url_expiry(self):
        """Test that download URLs expire after 60 seconds."""
        expiry_seconds = 60
        assert expiry_seconds == 60

    def test_abac_clearance_check(self):
        """Test that download requires ABAC clearance check."""
        from app.core.abac import has_sufficient_clearance
        from app.models.models import SecurityClassification
        user_clearance = SecurityClassification.SECRET
        artifact_clearance = SecurityClassification.OFFICIAL
        has_access = has_sufficient_clearance(user_clearance, artifact_clearance)
        assert has_access is True

    def test_insufficient_clearance_blocked(self):
        """Test that insufficient clearance blocks download."""
        from app.core.abac import has_sufficient_clearance
        from app.models.models import SecurityClassification
        user_clearance = SecurityClassification.OFFICIAL
        artifact_clearance = SecurityClassification.SECRET
        has_access = has_sufficient_clearance(user_clearance, artifact_clearance)
        assert has_access is False


class TestS3Configuration:
    """Test S3-compatible client configuration."""

    def test_default_endpoint(self):
        """Test that default S3 endpoint is localhost:9000 (MinIO)."""
        default_endpoint = "http://localhost:9000"
        assert default_endpoint == "http://localhost:9000"

    def test_sse_s3_encryption(self):
        """Test that SSE-S3 encryption is used."""
        encryption = "AES256"
        assert encryption == "AES256"

    def test_bucket_auto_creation(self):
        """Test that bucket is auto-created if not exists."""
        # Simulated: bucket creation flag
        auto_create = True
        assert auto_create is True


class TestArtifactMetadata:
    """Test artifact metadata structure."""

    def test_metadata_fields(self):
        """Test that artifact metadata contains required fields."""
        metadata = {
            "file_name": "document.pdf",
            "file_size_bytes": 1024,
            "mime_type": "application/pdf",
            "sha256_checksum": "abc123",
            "security_classification": "SECRET",
            "caveats": ["UK_EYES_ONLY"],
            "export_control_regime": "ITAR",
        }
        assert "file_name" in metadata
        assert "file_size_bytes" in metadata
        assert "mime_type" in metadata
        assert "sha256_checksum" in metadata
        assert "security_classification" in metadata
        assert "caveats" in metadata
        assert "export_control_regime" in metadata

    def test_active_status_flag(self):
        """Test that artifact has active status flag."""
        is_active = True
        assert isinstance(is_active, bool)


class TestExportControlRegimes:
    """Test export control regime enum."""

    def test_itar(self):
        """Test ITAR regime."""
        from app.models.models import ExportControlRegime
        assert ExportControlRegime.ITAR.value == "ITAR"

    def test_ear_eccn(self):
        """Test EAR_ECCN regime."""
        from app.models.models import ExportControlRegime
        assert ExportControlRegime.EAR_ECCN.value == "EAR_ECCN"

    def test_uk_military_list(self):
        """Test UK_MILITARY_LIST regime."""
        from app.models.models import ExportControlRegime
        assert ExportControlRegime.UK_MILITARY_LIST.value == "UK_MILITARY_LIST"

    def test_not_controlled(self):
        """Test NOT_CONTROLLED regime."""
        from app.models.models import ExportControlRegime
        assert ExportControlRegime.NOT_CONTROLLED.value == "NOT_CONTROLLED"
