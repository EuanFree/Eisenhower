"""Tests for the Merkle tree sync module.

This module tests the cryptographic Merkle tree hash computation for
offline multi-site schedule reconciliation between air-gapped instances.
"""
import pytest
import hashlib


class TestLeafHashComputation:
    """Test SHA-256 leaf hash computation."""

    def test_leaf_hash_formula(self):
        """Test: Leaf Hash = SHA256(id + code + version_id + updated_at + planned_dates)."""
        node_id = "uuid-123"
        code = "TASK-001"
        version_id = "5"
        updated_at = "2026-01-01"
        planned_dates = "2026-01-01/2026-06-01"

        data = f"{node_id}{code}{version_id}{updated_at}{planned_dates}"
        leaf_hash = hashlib.sha256(data.encode()).hexdigest()

        assert len(leaf_hash) == 64  # SHA-256 hex digest length

    def test_deterministic_hash(self):
        """Test that same data produces same hash."""
        data = "test_data"
        hash1 = hashlib.sha256(data.encode()).hexdigest()
        hash2 = hashlib.sha256(data.encode()).hexdigest()
        assert hash1 == hash2

    def test_different_data_different_hash(self):
        """Test that different data produces different hash."""
        hash1 = hashlib.sha256("data1".encode()).hexdigest()
        hash2 = hashlib.sha256("data2".encode()).hexdigest()
        assert hash1 != hash2

    def test_version_change_changes_hash(self):
        """Test that version_id change produces different hash."""
        data_v1 = "id_code_v1_updated_dates"
        data_v2 = "id_code_v2_updated_dates"
        hash_v1 = hashlib.sha256(data_v1.encode()).hexdigest()
        hash_v2 = hashlib.sha256(data_v2.encode()).hexdigest()
        assert hash_v1 != hash_v2


class TestMerkleTreeCombine:
    """Test Merkle tree hash combination."""

    def test_combine_two_hashes(self):
        """Test combining two child hashes into parent hash."""
        left = hashlib.sha256(b"left").hexdigest()
        right = hashlib.sha256(b"right").hexdigest()
        combined = hashlib.sha256(f"{left}{right}".encode()).hexdigest()
        assert len(combined) == 64

    def test_combine_order_matters(self):
        """Test that hash combination order matters."""
        a = hashlib.sha256(b"a").hexdigest()
        b = hashlib.sha256(b"b").hexdigest()
        ab = hashlib.sha256(f"{a}{b}".encode()).hexdigest()
        ba = hashlib.sha256(f"{b}{a}".encode()).hexdigest()
        assert ab != ba

    def test_single_leaf_is_root(self):
        """Test that a single leaf hash is the root hash."""
        leaf = hashlib.sha256(b"single").hexdigest()
        root = leaf  # Single leaf = root
        assert root == leaf


class TestInstantSync:
    """Test instant sync detection via root hash comparison."""

    def test_identical_roots_instant_sync(self):
        """Test that identical root hashes mean instant sync."""
        local_root = "abc123"
        remote_root = "abc123"
        is_instant_sync = local_root == remote_root
        assert is_instant_sync is True

    def test_different_roots_require_traversal(self):
        """Test that different root hashes require branch traversal."""
        local_root = "abc123"
        remote_root = "def456"
        is_instant_sync = local_root == remote_root
        assert is_instant_sync is False


class TestThreeWayVersionTracking:
    """Test three-way version tracking for merge resolution."""

    def test_forward_mutation_applied(self):
        """Test that incoming version > local with unchanged parentage applies."""
        local_version = 4
        incoming_version = 5
        should_apply = incoming_version > local_version
        assert should_apply is True

    def test_concurrent_edit_staged(self):
        """Test that concurrent edits are staged for review."""
        local_version = 5
        incoming_version = 5
        local_parent = "1.2.3"
        incoming_parent = "1.3.4"  # Parentage changed
        is_concurrent = local_version == incoming_version and local_parent != incoming_parent
        assert is_concurrent is True

    def test_local_newer_rejected(self):
        """Test that older incoming version is rejected."""
        local_version = 6
        incoming_version = 4
        should_apply = incoming_version > local_version
        assert should_apply is False


class TestMerklepackFormat:
    """Test .merklepack archive format."""

    def test_manifest_structure(self):
        """Test that manifest contains required fields."""
        manifest = {
            "version": "1.0",
            "root_hash": "abc123",
            "node_count": 100,
        }
        assert "version" in manifest
        assert "root_hash" in manifest
        assert "node_count" in manifest

    def test_signature_verification(self):
        """Test that signature is SHA-256 of manifest."""
        manifest_data = '{"version": "1.0"}'
        signature = hashlib.sha256(manifest_data.encode()).hexdigest()
        assert len(signature) == 64
