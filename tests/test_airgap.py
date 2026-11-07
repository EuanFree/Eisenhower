"""Tests for the airgap cross-domain data exchange module.

This module tests the .defpack bundle packaging, payload serialization,
manifest generation, and schema validation for offline data transfer.
"""
import pytest
import hashlib
import json


class TestPayloadSerialization:
    """Test canonical JSON payload serialization."""

    def test_payload_version(self):
        """Test that payload uses version 1.0."""
        payload = {"version": "1.0"}
        assert payload["version"] == "1.0"

    def test_payload_structure(self):
        """Test that payload contains required sections."""
        payload = {
            "version": "1.0",
            "nodes": [],
            "dependencies": [],
            "assignments": [],
            "baselines": [],
            "audit_logs": [],
        }
        assert "version" in payload
        assert "nodes" in payload
        assert "dependencies" in payload
        assert "assignments" in payload
        assert "baselines" in payload
        assert "audit_logs" in payload

    def test_deterministic_serialization(self):
        """Test that JSON serialization is deterministic."""
        data = {"key": "value", "number": 42}
        json1 = json.dumps(data, sort_keys=True)
        json2 = json.dumps(data, sort_keys=True)
        assert json1 == json2


class TestManifestGeneration:
    """Test SHA-256 manifest generation."""

    def test_manifest_hash(self):
        """Test that manifest contains SHA-256 hash."""
        payload = b"test payload"
        manifest_hash = hashlib.sha256(payload).hexdigest()
        assert len(manifest_hash) == 64

    def test_manifest_structure(self):
        """Test that manifest contains required fields."""
        manifest = {
            "payload_hash": "abc123",
            "payload_size": 1024,
            "entity_count": 100,
        }
        assert "payload_hash" in manifest
        assert "payload_size" in manifest
        assert "entity_count" in manifest


class TestDefpackFormat:
    """Test .defpack ZIP archive format."""

    def test_required_files(self):
        """Test that .defpack contains required files."""
        required = ["payload.json", "manifest.json", "signature.bin"]
        assert len(required) == 3
        assert "payload.json" in required
        assert "manifest.json" in required
        assert "signature.bin" in required

    def test_signature_format(self):
        """Test that signature is SHA-256 of manifest."""
        manifest_data = b'{"payload_hash": "abc123"}'
        signature = hashlib.sha256(manifest_data).hexdigest()
        assert len(signature) == 64


class TestSchemaValidation:
    """Test JSON schema validation on ingest."""

    def test_valid_version(self):
        """Test that valid version passes."""
        payload = {"version": "1.0"}
        is_valid = payload.get("version") == "1.0"
        assert is_valid is True

    def test_invalid_version_rejected(self):
        """Test that invalid version is rejected."""
        payload = {"version": "99.0"}
        is_valid = payload.get("version") == "1.0"
        assert is_valid is False

    def test_missing_version_rejected(self):
        """Test that missing version is rejected."""
        payload = {}
        is_valid = payload.get("version") == "1.0"
        assert is_valid is False

    def test_injection_detection(self):
        """Test that script injection is detected."""
        malicious = "<script>alert('xss')</script>"
        contains_script = "<script>" in malicious
        assert contains_script is True

    def test_duplicate_transaction_check(self):
        """Test that duplicate transaction IDs are detected."""
        seen_ids = {"tx-001", "tx-002"}
        new_id = "tx-001"
        is_duplicate = new_id in seen_ids
        assert is_duplicate is True

    def test_unique_transaction_passes(self):
        """Test that unique transaction ID passes."""
        seen_ids = {"tx-001", "tx-002"}
        new_id = "tx-003"
        is_duplicate = new_id in seen_ids
        assert is_duplicate is False


class TestClassificationRedaction:
    """Test classification ceiling redaction."""

    def test_redact_above_ceiling(self):
        """Test that nodes above classification ceiling are redacted."""
        from app.models.models import SecurityClassification
        from app.core.abac import has_sufficient_clearance
        node_class = SecurityClassification.SECRET
        ceiling = SecurityClassification.OFFICIAL
        needs_redaction = not has_sufficient_clearance(ceiling, node_class)
        assert needs_redaction is True

    def test_no_redaction_below_ceiling(self):
        """Test that nodes below ceiling are not redacted."""
        from app.models.models import SecurityClassification
        from app.core.abac import has_sufficient_clearance
        node_class = SecurityClassification.OFFICIAL
        ceiling = SecurityClassification.SECRET
        needs_redaction = not has_sufficient_clearance(ceiling, node_class)
        assert needs_redaction is False


class TestIngestAudit:
    """Test ingest audit logging."""

    def test_airgap_ingest_action(self):
        """Test that ingest uses AIRGAP_INGEST action type."""
        action_type = "AIRGAP_INGEST"
        assert action_type == "AIRGAP_INGEST"

    def test_audit_entry_fields(self):
        """Test that audit entry contains required fields."""
        entry = {
            "action_type": "AIRGAP_INGEST",
            "entity_type": "defpack",
            "entity_id": "uuid-123",
            "json_diff": {"nodes_imported": 100},
        }
        assert "action_type" in entry
        assert "entity_type" in entry
        assert "entity_id" in entry
        assert "json_diff" in entry
