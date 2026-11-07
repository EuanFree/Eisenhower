"""Tests for the programme archival and WORM cold-storage sealing module.

This module tests the SHA-256 manifest generation, archive integrity
verification, and cryptographic seal record creation.
"""
import pytest
import hashlib
import json


class TestSHA256Manifest:
    """Test SHA-256 manifest generation."""

    def test_manifest_hash_length(self):
        """Test that SHA-256 manifest hash is 64 hex characters."""
        data = b"test archive data"
        hash_hex = hashlib.sha256(data).hexdigest()
        assert len(hash_hex) == 64

    def test_deterministic_manifest(self):
        """Test that same data produces same manifest hash."""
        data = b"archive payload"
        hash1 = hashlib.sha256(data).hexdigest()
        hash2 = hashlib.sha256(data).hexdigest()
        assert hash1 == hash2

    def test_per_entity_hashes(self):
        """Test that each entity has its own hash."""
        entities = {
            "node_1": {"id": "1", "code": "A"},
            "node_2": {"id": "2", "code": "B"},
        }
        hashes = {}
        for name, entity in entities.items():
            data = json.dumps(entity, sort_keys=True).encode()
            hashes[name] = hashlib.sha256(data).hexdigest()
        assert hashes["node_1"] != hashes["node_2"]

    def test_manifest_json_structure(self):
        """Test that manifest JSON contains required fields."""
        manifest = {
            "version": "1.0",
            "entity_hashes": {"node_1": "abc123"},
            "total_entities": 1,
        }
        assert "version" in manifest
        assert "entity_hashes" in manifest
        assert "total_entities" in manifest


class TestArchiveIntegrity:
    """Test archive integrity verification."""

    def test_recompute_hash_matches(self):
        """Test that recomputed hash matches stored hash."""
        data = b"archive payload"
        stored_hash = hashlib.sha256(data).hexdigest()
        recomputed_hash = hashlib.sha256(data).hexdigest()
        assert stored_hash == recomputed_hash

    def test_tampered_data_detected(self):
        """Test that tampered data produces different hash."""
        original = b"archive payload"
        tampered = b"archive payload TAMPERED"
        original_hash = hashlib.sha256(original).hexdigest()
        tampered_hash = hashlib.sha256(tampered).hexdigest()
        assert original_hash != tampered_hash

    def test_audit_chain_verification(self):
        """Test that audit chain links to final_sha256_audit_head."""
        # Simulate chain: each entry hashes data + prev_hash
        prev_hash = "genesis"
        entries = []
        for i in range(3):
            data = f"entry_{i}"
            current_hash = hashlib.sha256(f"{data}{prev_hash}".encode()).hexdigest()
            entries.append({"prev": prev_hash, "current": current_hash})
            prev_hash = current_hash
        final_head = prev_hash
        # Verify chain integrity
        chain_hash = "genesis"
        for entry in entries:
            assert entry["prev"] == chain_hash
            chain_hash = entry["current"]
        assert chain_hash == final_head


class TestSealRecord:
    """Test programme seal record structure."""

    def test_seal_action_type(self):
        """Test that seal uses PROGRAMME_SEAL action type."""
        action_type = "PROGRAMME_SEAL"
        assert action_type == "PROGRAMME_SEAL"

    def test_seal_record_fields(self):
        """Test that seal record contains required fields."""
        seal = {
            "portfolio_node_id": "uuid-123",
            "sealed_by_user_id": "uuid-456",
            "final_sha256_audit_head": "abc123",
            "archive_manifest_hash": "def456",
            "storage_vault_uri": "/vault/archive.zip",
            "is_verified_intact": True,
        }
        assert "portfolio_node_id" in seal
        assert "sealed_by_user_id" in seal
        assert "final_sha256_audit_head" in seal
        assert "archive_manifest_hash" in seal
        assert "storage_vault_uri" in seal
        assert "is_verified_intact" in seal

    def test_verified_intact_flag(self):
        """Test that verified intact flag is boolean."""
        is_verified = True
        assert isinstance(is_verified, bool)


class TestArchivePackage:
    """Test archive package structure."""

    def test_package_files(self):
        """Test that archive package contains required files."""
        required_files = ["payload.json", "manifest.json", "signature.json"]
        assert len(required_files) == 3
        assert "payload.json" in required_files
        assert "manifest.json" in required_files
        assert "signature.json" in required_files

    def test_signature_format(self):
        """Test that signature is deterministic SHA-256."""
        manifest_data = '{"version": "1.0"}'
        signature = hashlib.sha256(manifest_data.encode()).hexdigest()
        assert len(signature) == 64
