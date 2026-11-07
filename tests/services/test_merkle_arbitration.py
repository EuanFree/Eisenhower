"""Integration tests for the Merkle DAG conflict arbitration workbench.

Validates 3-way Merkle reconciliation, detection of contradictory schedule
links, CCB conflict staging, resolution, dual-officer commit verification,
and the complete arbitration workflow.
"""
import hashlib
import pytest
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from app.services.merkle_sync import (
    MerkleLeaf,
    MerkleBranch,
    MerkleManifest,
    MerkleMergeStatus,
    MerkleMergeStaging,
    ConflictField,
    ThreeWayReconciliationResult,
    CCBMergeCommit,
    MerkleReconciliationEngine,
)


# ============================================================================
# Helpers — Build synthetic Merkle manifests for testing
# ============================================================================


def _make_leaf(
    entity_type: str,
    entity_id: str,
    hash_digest: str,
    version_id: int = 1,
    path: str = "1.1",
    metadata: Optional[Dict[str, Any]] = None,
) -> MerkleLeaf:
    """Create a synthetic MerkleLeaf for testing."""
    return MerkleLeaf(
        entity_type=entity_type,
        entity_id=entity_id,
        hash_digest=hash_digest,
        version_id=version_id,
        path=path,
        metadata=metadata or {},
    )


def _make_branch(
    path: str,
    children: Optional[List] = None,
    leaf_count: int = 0,
    entity_count: int = 0,
) -> MerkleBranch:
    """Create a synthetic MerkleBranch for testing."""
    child_hashes = []
    for child in children or []:
        if isinstance(child, MerkleLeaf):
            child_hashes.append(child.hash_digest)
        elif isinstance(child, MerkleBranch):
            child_hashes.append(child.hash_digest)
    hash_digest = (
        hashlib.sha256("|".join(sorted(child_hashes)).encode()).hexdigest()
        if child_hashes
        else hashlib.sha256(b"").hexdigest()
    )
    return MerkleBranch(
        path=path,
        hash_digest=hash_digest,
        children=children or [],
        leaf_count=leaf_count,
        entity_count=entity_count,
    )


def _make_manifest(
    root_hash: str,
    tree: Optional[MerkleBranch] = None,
    root_node_id: str = "root-uuid",
    root_path: str = "1",
    node_count: int = 0,
    dependency_count: int = 0,
    assignment_count: int = 0,
    site_id: str = "",
) -> MerkleManifest:
    """Create a synthetic MerkleManifest for testing."""
    return MerkleManifest(
        root_node_id=root_node_id,
        root_path=root_path,
        root_hash=root_hash,
        generated_at="2026-01-01T00:00:00+00:00",
        node_count=node_count,
        dependency_count=dependency_count,
        assignment_count=assignment_count,
        tree=tree or _make_branch("1"),
        site_id=site_id,
    )


# ============================================================================
# Tests: Common Ancestor Computation
# ============================================================================


class TestCommonAncestorComputation:
    """Test computation of the common ancestor hash."""

    def test_identical_manifests_return_root_hash(self):
        """If both manifests are identical, ancestor hash equals root hash."""
        shared_hash = "abc123"
        tree = _make_branch("1")
        tree.hash_digest = shared_hash
        manifest = _make_manifest(shared_hash, tree)

        engine = MerkleReconciliationEngine(db=None)
        result = engine.compute_common_ancestor_hash(manifest, manifest)
        assert result == shared_hash

    def test_divergent_manifests_find_common_branch(self):
        """If manifests diverge, find the deepest common branch."""
        # Create a shared child branch
        shared_child = _make_branch("1.1")
        shared_child_hash = shared_child.hash_digest

        # Local tree has shared child + different child
        local_child2 = _make_branch("1.2")
        local_child2_leaves = [
            _make_leaf("node", "local-only", "local-hash-1")
        ]
        local_child2 = _make_branch("1.2", local_child2_leaves, 1, 1)

        local_tree = _make_branch("1", [shared_child, local_child2])

        # Remote tree has shared child + different child
        remote_child3 = _make_branch("1.3")
        remote_child3_leaves = [
            _make_leaf("node", "remote-only", "remote-hash-1")
        ]
        remote_child3 = _make_branch("1.3", remote_child3_leaves, 1, 1)

        remote_tree = _make_branch("1", [shared_child, remote_child3])

        local_manifest = _make_manifest(local_tree.hash_digest, local_tree)
        remote_manifest = _make_manifest(remote_tree.hash_digest, remote_tree)

        engine = MerkleReconciliationEngine(db=None)
        result = engine.compute_common_ancestor_hash(local_manifest, remote_manifest)

        # Should find the shared child as the common ancestor
        assert result == shared_child_hash

    def test_no_common_ancestor_returns_empty_hash(self):
        """If no common branch exists, return empty hash."""
        local_tree = _make_branch("1", [
            _make_leaf("node", "a", "hash-a"),
        ])
        remote_tree = _make_branch("1", [
            _make_leaf("node", "b", "hash-b"),
        ])

        local_manifest = _make_manifest(local_tree.hash_digest, local_tree)
        remote_manifest = _make_manifest(remote_tree.hash_digest, remote_tree)

        engine = MerkleReconciliationEngine(db=None)
        result = engine.compute_common_ancestor_hash(local_manifest, remote_manifest)

        # No common branch — should return empty hash
        assert result == hashlib.sha256(b"").hexdigest()


# ============================================================================
# Tests: 3-Way Reconciliation
# ============================================================================


class TestThreeWayReconciliation:
    """Test 3-way reconciliation logic."""

    def test_auto_merge_only_local_changed(self):
        """If only local changed from ancestor, auto-merge."""
        ancestor_leaf = _make_leaf("node", "node-1", "ancestor-hash")
        local_leaf = _make_leaf("node", "node-1", "local-hash")
        remote_leaf = _make_leaf("node", "node-1", "ancestor-hash")

        ancestor_tree = _make_branch("1", [ancestor_leaf], 1, 1)
        local_tree = _make_branch("1", [local_leaf], 1, 1)
        remote_tree = _make_branch("1", [remote_leaf], 1, 1)

        ancestor_manifest = _make_manifest(ancestor_tree.hash_digest, ancestor_tree)
        local_manifest = _make_manifest(local_tree.hash_digest, local_tree)
        remote_manifest = _make_manifest(remote_tree.hash_digest, remote_tree)

        engine = MerkleReconciliationEngine(db=None)
        result = engine.reconcile_three_way(
            local_manifest, remote_manifest, ancestor_manifest
        )

        assert result.auto_merged_count >= 1
        assert result.conflicts_staged == 0

    def test_auto_merge_only_remote_changed(self):
        """If only remote changed from ancestor, auto-merge."""
        ancestor_leaf = _make_leaf("node", "node-1", "ancestor-hash")
        local_leaf = _make_leaf("node", "node-1", "ancestor-hash")
        remote_leaf = _make_leaf("node", "node-1", "remote-hash")

        ancestor_tree = _make_branch("1", [ancestor_leaf], 1, 1)
        local_tree = _make_branch("1", [local_leaf], 1, 1)
        remote_tree = _make_branch("1", [remote_leaf], 1, 1)

        ancestor_manifest = _make_manifest(ancestor_tree.hash_digest, ancestor_tree)
        local_manifest = _make_manifest(local_tree.hash_digest, local_tree)
        remote_manifest = _make_manifest(remote_tree.hash_digest, remote_tree)

        engine = MerkleReconciliationEngine(db=None)
        result = engine.reconcile_three_way(
            local_manifest, remote_manifest, ancestor_manifest
        )

        assert result.auto_merged_count >= 1
        assert result.conflicts_staged == 0

    def test_conflict_both_changed_differently(self):
        """If both sides changed differently, stage for CCB arbitration."""
        ancestor_leaf = _make_leaf(
            "node", "node-1", "ancestor-hash",
            metadata={"code": "WP-001", "updated_at": "2026-01-01"},
        )
        local_leaf = _make_leaf(
            "node", "node-1", "local-hash",
            metadata={"code": "WP-001", "updated_at": "2026-01-02"},
        )
        remote_leaf = _make_leaf(
            "node", "node-1", "remote-hash",
            metadata={"code": "WP-001", "updated_at": "2026-01-03"},
        )

        ancestor_tree = _make_branch("1", [ancestor_leaf], 1, 1)
        local_tree = _make_branch("1", [local_leaf], 1, 1)
        remote_tree = _make_branch("1", [remote_leaf], 1, 1)

        ancestor_manifest = _make_manifest(ancestor_tree.hash_digest, ancestor_tree)
        local_manifest = _make_manifest(local_tree.hash_digest, local_tree)
        remote_manifest = _make_manifest(remote_tree.hash_digest, remote_tree)

        engine = MerkleReconciliationEngine(db=None)
        result = engine.reconcile_three_way(
            local_manifest, remote_manifest, ancestor_manifest
        )

        assert result.conflicts_staged >= 1
        entry = result.staging_entries[0]
        assert entry.status == MerkleMergeStatus.REQUIRES_CCB_ARBITRATION
        assert entry.entity_id == "node-1"

    def test_auto_merge_both_changed_identically(self):
        """If both sides changed identically, auto-merge."""
        ancestor_leaf = _make_leaf("node", "node-1", "ancestor-hash")
        same_leaf = _make_leaf("node", "node-1", "same-new-hash")

        ancestor_tree = _make_branch("1", [ancestor_leaf], 1, 1)
        local_tree = _make_branch("1", [same_leaf], 1, 1)
        remote_tree = _make_branch("1", [same_leaf], 1, 1)

        ancestor_manifest = _make_manifest(ancestor_tree.hash_digest, ancestor_tree)
        local_manifest = _make_manifest(local_tree.hash_digest, local_tree)
        remote_manifest = _make_manifest(remote_tree.hash_digest, remote_tree)

        engine = MerkleReconciliationEngine(db=None)
        result = engine.reconcile_three_way(
            local_manifest, remote_manifest, ancestor_manifest
        )

        assert result.auto_merged_count >= 1
        assert result.conflicts_staged == 0

    def test_new_remote_entity_auto_merged(self):
        """A new entity only in remote manifest is auto-merged."""
        local_tree = _make_branch("1", [
            _make_leaf("node", "node-1", "hash-1"),
        ], 1, 1)
        remote_tree = _make_branch("1", [
            _make_leaf("node", "node-1", "hash-1"),
            _make_leaf("node", "node-new", "hash-new"),
        ], 2, 2)

        local_manifest = _make_manifest(local_tree.hash_digest, local_tree)
        remote_manifest = _make_manifest(remote_tree.hash_digest, remote_tree)

        engine = MerkleReconciliationEngine(db=None)
        result = engine.reconcile_three_way(local_manifest, remote_manifest)

        # New remote entity should be auto-merged
        assert result.auto_merged_count >= 1
        assert result.conflicts_staged == 0


# ============================================================================
# Tests: Contradictory Dependency Links
# ============================================================================


class TestContradictoryLinks:
    """Test detection of contradictory schedule links."""

    def test_reverse_direction_conflict(self):
        """Detect when local has X->Y and remote has Y->X."""
        local_dep = _make_leaf(
            "dependency", "dep-1", "hash-local",
            metadata={
                "predecessor_id": "node-a",
                "successor_id": "node-b",
                "dependency_type": "FS",
            },
        )
        remote_dep = _make_leaf(
            "dependency", "dep-2", "hash-remote",
            metadata={
                "predecessor_id": "node-b",
                "successor_id": "node-a",
                "dependency_type": "FS",
            },
        )

        local_tree = _make_branch("1", [local_dep], 1, 1)
        remote_tree = _make_branch("1", [remote_dep], 1, 1)

        local_manifest = _make_manifest(
            local_tree.hash_digest, local_tree,
            dependency_count=1,
        )
        remote_manifest = _make_manifest(
            remote_tree.hash_digest, remote_tree,
            dependency_count=1,
        )

        engine = MerkleReconciliationEngine(db=None)
        result = engine.reconcile_three_way(local_manifest, remote_manifest)

        # Should detect contradictory link
        assert result.conflicts_staged >= 1
        link_conflict = None
        for entry in result.staging_entries:
            if entry.conflict_type == "CONTRADICTORY_LINK":
                link_conflict = entry
                break
        assert link_conflict is not None

    def test_different_dependency_type_conflict(self):
        """Detect when both sides change dependency type differently."""
        ancestor_dep = _make_leaf(
            "dependency", "dep-1", "hash-anc",
            metadata={
                "predecessor_id": "node-a",
                "successor_id": "node-b",
                "dependency_type": "FS",
            },
        )
        local_dep = _make_leaf(
            "dependency", "dep-1", "hash-local",
            metadata={
                "predecessor_id": "node-a",
                "successor_id": "node-b",
                "dependency_type": "FF",
            },
        )
        remote_dep = _make_leaf(
            "dependency", "dep-1", "hash-remote",
            metadata={
                "predecessor_id": "node-a",
                "successor_id": "node-b",
                "dependency_type": "SS",
            },
        )

        ancestor_tree = _make_branch("1", [ancestor_dep], 1, 1)
        local_tree = _make_branch("1", [local_dep], 1, 1)
        remote_tree = _make_branch("1", [remote_dep], 1, 1)

        ancestor_manifest = _make_manifest(
            ancestor_tree.hash_digest, ancestor_tree,
            dependency_count=1,
        )
        local_manifest = _make_manifest(
            local_tree.hash_digest, local_tree,
            dependency_count=1,
        )
        remote_manifest = _make_manifest(
            remote_tree.hash_digest, remote_tree,
            dependency_count=1,
        )

        engine = MerkleReconciliationEngine(db=None)
        result = engine.reconcile_three_way(
            local_manifest, remote_manifest, ancestor_manifest
        )

        # Should detect contradictory link (different types)
        link_conflict = None
        for entry in result.staging_entries:
            if entry.conflict_type == "CONTRADICTORY_LINK":
                link_conflict = entry
                break
        assert link_conflict is not None

    def test_no_conflict_same_dependency_type(self):
        """No conflict if both sides keep the same dependency type."""
        dep = _make_leaf(
            "dependency", "dep-1", "hash-1",
            metadata={
                "predecessor_id": "node-a",
                "successor_id": "node-b",
                "dependency_type": "FS",
            },
        )

        tree = _make_branch("1", [dep], 1, 1)
        local_manifest = _make_manifest(tree.hash_digest, tree, dependency_count=1)
        remote_manifest = _make_manifest(tree.hash_digest, tree, dependency_count=1)

        engine = MerkleReconciliationEngine(db=None)
        result = engine.reconcile_three_way(local_manifest, remote_manifest)

        assert result.conflicts_staged == 0


# ============================================================================
# Tests: Conflict Resolution
# ============================================================================


class TestConflictResolution:
    """Test conflict resolution and CCB sign-off flow."""

    def _create_engine_with_conflict(self) -> MerkleReconciliationEngine:
        """Create an engine with a pre-staged conflict for testing."""
        ancestor_leaf = _make_leaf(
            "node", "node-1", "ancestor-hash",
            metadata={"code": "WP-001", "updated_at": "2026-01-01"},
        )
        local_leaf = _make_leaf(
            "node", "node-1", "local-hash",
            metadata={"code": "WP-001", "updated_at": "2026-01-02"},
        )
        remote_leaf = _make_leaf(
            "node", "node-1", "remote-hash",
            metadata={"code": "WP-001", "updated_at": "2026-01-03"},
        )

        ancestor_tree = _make_branch("1", [ancestor_leaf], 1, 1)
        local_tree = _make_branch("1", [local_leaf], 1, 1)
        remote_tree = _make_branch("1", [remote_leaf], 1, 1)

        ancestor_manifest = _make_manifest(ancestor_tree.hash_digest, ancestor_tree)
        local_manifest = _make_manifest(local_tree.hash_digest, local_tree)
        remote_manifest = _make_manifest(remote_tree.hash_digest, remote_tree)

        engine = MerkleReconciliationEngine(db=None)
        engine.reconcile_three_way(
            local_manifest, remote_manifest, ancestor_manifest
        )
        return engine

    def test_resolve_keep_local(self):
        """Test resolving a conflict by keeping local state."""
        engine = self._create_engine_with_conflict()
        entry = engine.get_staging_entries()[0]

        resolved = engine.resolve_conflict(entry.id, "KEEP_LOCAL")
        assert resolved.status == MerkleMergeStatus.RESOLVED_KEEP_LOCAL
        assert resolved.resolution == "KEEP_LOCAL"

    def test_resolve_accept_remote(self):
        """Test resolving a conflict by accepting remote state."""
        engine = self._create_engine_with_conflict()
        entry = engine.get_staging_entries()[0]

        resolved = engine.resolve_conflict(entry.id, "ACCEPT_REMOTE")
        assert resolved.status == MerkleMergeStatus.RESOLVED_ACCEPT_REMOTE
        assert resolved.resolution == "ACCEPT_REMOTE"

    def test_resolve_synthesize(self):
        """Test resolving a conflict with synthesized state."""
        engine = self._create_engine_with_conflict()
        entry = engine.get_staging_entries()[0]

        synth_state = {"code": "WP-001", "updated_at": "2026-01-04"}
        resolved = engine.resolve_conflict(
            entry.id, "SYNTHESIZE", synth_state
        )
        assert resolved.status == MerkleMergeStatus.RESOLVED_SYNTHESIZED
        assert resolved.resolution == "SYNTHESIZE"
        assert resolved.synthesized_state == synth_state

    def test_resolve_invalid_resolution(self):
        """Test that invalid resolution raises ValueError."""
        engine = self._create_engine_with_conflict()
        entry = engine.get_staging_entries()[0]

        with pytest.raises(ValueError, match="Invalid resolution"):
            engine.resolve_conflict(entry.id, "INVALID")

    def test_resolve_missing_entry(self):
        """Test that resolving a missing entry raises ValueError."""
        engine = self._create_engine_with_conflict()

        with pytest.raises(ValueError, match="not found"):
            engine.resolve_conflict("nonexistent-id", "KEEP_LOCAL")

    def test_synthesize_without_state_raises(self):
        """Test that SYNTHESIZE without state raises ValueError."""
        engine = self._create_engine_with_conflict()
        entry = engine.get_staging_entries()[0]

        with pytest.raises(ValueError, match="requires synthesized_state"):
            engine.resolve_conflict(entry.id, "SYNTHESIZE")


# ============================================================================
# Tests: Dual-Officer Quorum Sign-Off
# ============================================================================


class TestDualOfficerSignOff:
    """Test dual-officer quorum sign-off verification."""

    def _create_resolved_entry(self):
        """Create an engine with a resolved entry ready for signing."""
        engine = MerkleReconciliationEngine(db=None)
        engine.reconcile_three_way(
            _make_manifest("h1", _make_branch("1", [
                _make_leaf("node", "n1", "local-h", metadata={"code": "WP-1", "x": "a"}),
            ], 1, 1)),
            _make_manifest("h2", _make_branch("1", [
                _make_leaf("node", "n1", "remote-h", metadata={"code": "WP-1", "x": "b"}),
            ], 1, 1)),
        )
        entry = engine.get_staging_entries()[0]
        engine.resolve_conflict(entry.id, "KEEP_LOCAL")
        return engine, entry

    def test_sign_officer_1(self):
        """Test Officer 1 signing a resolved entry."""
        engine, entry = self._create_resolved_entry()

        signed = engine.stage_ccb_signature(
            entry.id, officer_number=1, user_id=100, signature="sig-1"
        )
        assert signed.officer_1_user_id == 100
        assert signed.officer_1_signature == "sig-1"

    def test_sign_officer_2(self):
        """Test Officer 2 signing a resolved entry."""
        engine, entry = self._create_resolved_entry()

        signed = engine.stage_ccb_signature(
            entry.id, officer_number=2, user_id=200, signature="sig-2"
        )
        assert signed.officer_2_user_id == 200
        assert signed.officer_2_signature == "sig-2"

    def test_both_officers_ready_for_commit(self):
        """Test that both signatures make entry ready for commit."""
        engine, entry = self._create_resolved_entry()

        engine.stage_ccb_signature(
            entry.id, officer_number=1, user_id=100, signature="sig-1"
        )
        engine.stage_ccb_signature(
            entry.id, officer_number=2, user_id=200, signature="sig-2"
        )

        assert engine.is_ready_for_commit(entry.id)

    def test_same_officer_cannot_sign_twice(self):
        """Test that the same officer cannot sign twice."""
        engine, entry = self._create_resolved_entry()

        engine.stage_ccb_signature(
            entry.id, officer_number=1, user_id=100, signature="sig-1"
        )

        with pytest.raises(ValueError, match="already signed"):
            engine.stage_ccb_signature(
                entry.id, officer_number=1, user_id=100, signature="sig-1-again"
            )

    def test_cannot_sign_unresolved_entry(self):
        """Test that an unresolved entry cannot be signed."""
        engine = MerkleReconciliationEngine(db=None)
        engine.reconcile_three_way(
            _make_manifest("h1", _make_branch("1", [
                _make_leaf("node", "n1", "local-h", metadata={"code": "WP-1", "x": "a"}),
            ], 1, 1)),
            _make_manifest("h2", _make_branch("1", [
                _make_leaf("node", "n1", "remote-h", metadata={"code": "WP-1", "x": "b"}),
            ], 1, 1)),
        )
        entry = engine.get_staging_entries()[0]

        with pytest.raises(ValueError, match="must be resolved"):
            engine.stage_ccb_signature(
                entry.id, officer_number=1, user_id=100, signature="sig"
            )

    def test_same_user_cannot_be_both_officers(self):
        """Test that the same user cannot be both officers."""
        engine, entry = self._create_resolved_entry()

        engine.stage_ccb_signature(
            entry.id, officer_number=1, user_id=100, signature="sig-1"
        )
        engine.stage_ccb_signature(
            entry.id, officer_number=2, user_id=100, signature="sig-2"
        )

        # Same user for both — should NOT be ready
        assert not engine.is_ready_for_commit(entry.id)

    def test_invalid_officer_number(self):
        """Test that invalid officer number raises ValueError."""
        engine, entry = self._create_resolved_entry()

        with pytest.raises(ValueError, match="Officer number must be 1 or 2"):
            engine.stage_ccb_signature(
                entry.id, officer_number=3, user_id=100, signature="sig"
            )


# ============================================================================
# Tests: Merge Commit
# ============================================================================


class TestMergeCommit:
    """Test CCB merge commit with dual-officer verification."""

    def test_commit_with_dual_signatures(self):
        """Test committing an entry with both officer signatures."""
        engine, entry = self._create_resolved_and_signed()

        commits = engine.commit_resolved_entries([entry.id])

        assert len(commits) == 1
        commit = commits[0]
        assert commit.officer_1_user_id == 100
        assert commit.officer_2_user_id == 200
        assert len(commit.audit_block_hash) == 64  # SHA-256 hex

        # Entry should be marked as committed
        updated = engine.get_staging_entry(entry.id)
        assert updated.status == MerkleMergeStatus.MERGE_COMMITTED
        assert updated.resolved_at is not None

    def test_commit_without_dual_signatures_fails(self):
        """Test that commit fails without dual signatures."""
        engine, entry = self._create_resolved_entry()

        # Only one signature
        engine.stage_ccb_signature(
            entry.id, officer_number=1, user_id=100, signature="sig-1"
        )

        with pytest.raises(ValueError, match="missing dual-officer"):
            engine.commit_resolved_entries([entry.id])

    def test_commit_missing_entry_fails(self):
        """Test that committing a missing entry fails."""
        engine, _ = self._create_resolved_entry()

        with pytest.raises(ValueError, match="not found"):
            engine.commit_resolved_entries(["nonexistent-id"])

    def test_commit_multiple_entries(self):
        """Test committing multiple entries at once."""
        engine = MerkleReconciliationEngine(db=None)
        engine.reconcile_three_way(
            _make_manifest("h1", _make_branch("1", [
                _make_leaf("node", "n1", "local-h1", metadata={"code": "WP-1", "x": "a"}),
                _make_leaf("node", "n2", "local-h2", metadata={"code": "WP-2", "y": "a"}),
            ], 2, 2)),
            _make_manifest("h2", _make_branch("1", [
                _make_leaf("node", "n1", "remote-h1", metadata={"code": "WP-1", "x": "b"}),
                _make_leaf("node", "n2", "remote-h2", metadata={"code": "WP-2", "y": "b"}),
            ], 2, 2)),
        )

        entries = engine.get_staging_entries()
        assert len(entries) == 2

        # Resolve and sign both
        for entry in entries:
            engine.resolve_conflict(entry.id, "KEEP_LOCAL")
            engine.stage_ccb_signature(
                entry.id, officer_number=1, user_id=100, signature="sig-1"
            )
            engine.stage_ccb_signature(
                entry.id, officer_number=2, user_id=200, signature="sig-2"
            )

        commits = engine.commit_resolved_entries([e.id for e in entries])
        assert len(commits) == 2

    def test_ccb_merge_commit_serialization(self):
        """Test CCBMergeCommit serialization."""
        commit = CCBMergeCommit(
            reconciliation_id="rec-1",
            entries_committed=1,
            officer_1_user_id=100,
            officer_1_signature="sig-1",
            officer_2_user_id=200,
            officer_2_signature="sig-2",
            audit_block_hash="abc123",
        )

        data = commit.to_dict()
        assert data["reconciliation_id"] == "rec-1"
        assert data["entries_committed"] == 1
        assert data["officer_1_user_id"] == 100
        assert data["audit_block_hash"] == "abc123"

    def test_merkle_merge_staging_serialization(self):
        """Test MerkleMergeStaging serialization."""
        entry = MerkleMergeStaging(
            entity_type="node",
            entity_id="node-1",
            entity_code="WP-001",
            conflict_type="CONCURRENT_EDIT",
            ancestor_state={"hash": "anc"},
            local_state={"hash": "local"},
            remote_state={"hash": "remote"},
            conflicting_fields=[
                ConflictField(
                    field_name="updated_at",
                    ancestor_value="2026-01-01",
                    local_value="2026-01-02",
                    remote_value="2026-01-03",
                )
            ],
        )

        data = entry.to_dict()
        assert data["entity_type"] == "node"
        assert data["entity_id"] == "node-1"
        assert data["status"] == "REQUIRES_CCB_ARBITRATION"
        assert len(data["conflicting_fields"]) == 1
        assert data["conflicting_fields"][0]["field_name"] == "updated_at"

    def test_three_way_result_serialization(self):
        """Test ThreeWayReconciliationResult serialization."""
        result = ThreeWayReconciliationResult(
            ancestor_hash="abc123",
            auto_merged_count=5,
            conflicts_staged=2,
            staging_entries=[],
            divergent_paths=["1.1", "1.2"],
            errors=[],
        )

        data = result.to_dict()
        assert data["ancestor_hash"] == "abc123"
        assert data["auto_merged_count"] == 5
        assert data["conflicts_staged"] == 2
        assert data["divergent_paths"] == ["1.1", "1.2"]

    # Helper methods
    def _create_resolved_entry(self):
        """Create an engine with a resolved entry."""
        engine = MerkleReconciliationEngine(db=None)
        engine.reconcile_three_way(
            _make_manifest("h1", _make_branch("1", [
                _make_leaf("node", "n1", "local-h", metadata={"code": "WP-1", "x": "a"}),
            ], 1, 1)),
            _make_manifest("h2", _make_branch("1", [
                _make_leaf("node", "n1", "remote-h", metadata={"code": "WP-1", "x": "b"}),
            ], 1, 1)),
        )
        entry = engine.get_staging_entries()[0]
        engine.resolve_conflict(entry.id, "KEEP_LOCAL")
        return engine, entry

    def _create_resolved_and_signed(self):
        """Create an engine with a resolved and signed entry."""
        engine, entry = self._create_resolved_entry()
        engine.stage_ccb_signature(
            entry.id, officer_number=1, user_id=100, signature="sig-1"
        )
        engine.stage_ccb_signature(
            entry.id, officer_number=2, user_id=200, signature="sig-2"
        )
        return engine, entry


# ============================================================================
# Tests: Conflict Field Detection
# ============================================================================


class TestConflictFieldDetection:
    """Test field-level conflict detection."""

    def test_conflicting_fields_identified(self):
        """Test that conflicting fields are properly identified."""
        ancestor_leaf = _make_leaf(
            "node", "node-1", "ancestor-hash",
            metadata={
                "code": "WP-001",
                "updated_at": "2026-01-01",
                "planned_start": "2026-02-01",
            },
        )
        local_leaf = _make_leaf(
            "node", "node-1", "local-hash",
            metadata={
                "code": "WP-001",
                "updated_at": "2026-01-02",
                "planned_start": "2026-02-15",
            },
        )
        remote_leaf = _make_leaf(
            "node", "node-1", "remote-hash",
            metadata={
                "code": "WP-001",
                "updated_at": "2026-01-03",
                "planned_start": "2026-03-01",
            },
        )

        ancestor_tree = _make_branch("1", [ancestor_leaf], 1, 1)
        local_tree = _make_branch("1", [local_leaf], 1, 1)
        remote_tree = _make_branch("1", [remote_leaf], 1, 1)

        ancestor_manifest = _make_manifest(ancestor_tree.hash_digest, ancestor_tree)
        local_manifest = _make_manifest(local_tree.hash_digest, local_tree)
        remote_manifest = _make_manifest(remote_tree.hash_digest, remote_tree)

        engine = MerkleReconciliationEngine(db=None)
        result = engine.reconcile_three_way(
            local_manifest, remote_manifest, ancestor_manifest
        )

        entry = result.staging_entries[0]
        # Both updated_at and planned_start should be conflicting
        field_names = [cf.field_name for cf in entry.conflicting_fields]
        assert "updated_at" in field_names
        assert "planned_start" in field_names
        # code should NOT be conflicting (same on both sides)
        assert "code" not in field_names

    def test_no_conflict_single_side_changed(self):
        """Test no conflict when only one side changed a field."""
        ancestor_leaf = _make_leaf(
            "node", "node-1", "ancestor-hash",
            metadata={"code": "WP-001", "updated_at": "2026-01-01"},
        )
        local_leaf = _make_leaf(
            "node", "node-1", "local-hash",
            metadata={"code": "WP-001", "updated_at": "2026-01-02"},
        )
        remote_leaf = _make_leaf(
            "node", "node-1", "ancestor-hash",
            metadata={"code": "WP-001", "updated_at": "2026-01-01"},
        )

        ancestor_tree = _make_branch("1", [ancestor_leaf], 1, 1)
        local_tree = _make_branch("1", [local_leaf], 1, 1)
        remote_tree = _make_branch("1", [remote_leaf], 1, 1)

        ancestor_manifest = _make_manifest(ancestor_tree.hash_digest, ancestor_tree)
        local_manifest = _make_manifest(local_tree.hash_digest, local_tree)
        remote_manifest = _make_manifest(remote_tree.hash_digest, remote_tree)

        engine = MerkleReconciliationEngine(db=None)
        result = engine.reconcile_three_way(
            local_manifest, remote_manifest, ancestor_manifest
        )

        # Only local changed — should be auto-merged, no conflict
        assert result.conflicts_staged == 0
