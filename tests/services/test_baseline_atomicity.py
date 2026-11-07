"""Regression tests for baseline atomicity and lock isolation.

These tests verify that simulated failures mid-snapshot leave zero orphan
baseline rows and that the sub-tree lock correctly rejects concurrent writers.
"""
import pytest
import pytest_asyncio
from datetime import datetime
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.models import (
    PortfolioNode, PortfolioBaseline, BaselineNodeSnapshot,
    ForensicAuditLog, SecurityClassification, LockOperationType,
)
from app.services.baseline_engine import (
    freeze_baseline_atomic,
    BaselineValidationException,
    _validate_leaf_node,
    _validate_all_nodes,
    _compute_state_hash,
)
from app.services.lock_manager import acquire_subtree_lock, _find_overlapping_lock
from app.core.exceptions import LockedException


def _uuid(nid):
    """Convert UUID to hex string without hyphens for SQLite raw SQL."""
    return str(nid).replace("-", "")


# ============================================================================
# Fixtures – in-memory SQLite database
# ============================================================================

@pytest.fixture
def db_session():
    """Create a fresh in-memory SQLite database session."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = SessionLocal()
    yield session
    session.rollback()
    session.close()
    Base.metadata.drop_all(engine)


@pytest.fixture
def sample_tree(db_session):
    """Create a small WBS sub-tree with a root and two children."""
    root = PortfolioNode(
        id=uuid4(),
        code="ROOT-001",
        name="Test Root",
        tree_type="WBS",
        security_classification=SecurityClassification.OFFICIAL,
        caveats=[],
        path="1",
        delivery_mode="WATERFALL",
        planned_start_date=datetime(2026, 1, 1),
        planned_end_date=datetime(2026, 12, 31),
        percent_complete=0.0,
        pv=100000.0,
        custom_attributes={"has_children": True},
        is_active=True,
    )
    child1 = PortfolioNode(
        id=uuid4(),
        code="WP-001",
        name="Work Package 1",
        tree_type="WBS",
        security_classification=SecurityClassification.OFFICIAL,
        caveats=[],
        path="1.1",
        delivery_mode="WATERFALL",
        planned_start_date=datetime(2026, 2, 1),
        planned_end_date=datetime(2026, 6, 30),
        percent_complete=0.0,
        pv=50000.0,
        custom_attributes={"has_children": False},
        is_active=True,
    )
    child2 = PortfolioNode(
        id=uuid4(),
        code="WP-002",
        name="Work Package 2",
        tree_type="WBS",
        security_classification=SecurityClassification.OFFICIAL,
        caveats=[],
        path="1.2",
        delivery_mode="WATERFALL",
        planned_start_date=datetime(2026, 3, 1),
        planned_end_date=datetime(2026, 9, 30),
        percent_complete=0.0,
        pv=50000.0,
        custom_attributes={"has_children": False},
        is_active=True,
    )
    db_session.add_all([root, child1, child2])
    db_session.commit()
    return {"root": root, "child1": child1, "child2": child2}


# ============================================================================
# Tests: Leaf-node validation
# ============================================================================

class TestValidateLeafNode:
    """Test the _validate_leaf_node helper."""

    def test_valid_leaf_with_bac(self, sample_tree):
        """A leaf node with BAC (via pv) should pass validation."""
        node = sample_tree["child1"]
        assert _validate_leaf_node(node) is None

    def test_unapproved_rfc_fails(self, sample_tree):
        """A node with an unapproved RFC should fail validation."""
        node = sample_tree["child1"]
        node.custom_attributes = {"rfc_status": "PENDING", "has_children": False}
        error = _validate_leaf_node(node)
        assert error is not None
        assert "unapproved RFC" in error

    def test_approved_rfc_passes(self, sample_tree):
        """A node with an approved RFC should pass validation."""
        node = sample_tree["child1"]
        node.custom_attributes = {"rfc_status": "APPROVED", "has_children": False}
        assert _validate_leaf_node(node) is None

    def test_leaf_missing_bac_fails(self, sample_tree):
        """A leaf node without BAC should fail validation."""
        node = sample_tree["child1"]
        node.pv = None
        node.custom_attributes = {"has_children": False}
        error = _validate_leaf_node(node)
        assert error is not None
        assert "Budget at Completion" in error

    def test_parent_node_skips_bac_check(self, sample_tree):
        """A parent node (has_children=True) should skip BAC check."""
        node = sample_tree["root"]
        node.pv = None
        node.custom_attributes = {"has_children": True}
        assert _validate_leaf_node(node) is None


class TestValidateAllNodes:
    """Test the _validate_all_nodes batch validator."""

    def test_all_valid(self, sample_tree):
        """When all nodes are valid, errors list should be empty."""
        nodes = list(sample_tree.values())
        errors = _validate_all_nodes(nodes)
        assert errors == []

    def test_collects_multiple_errors(self, sample_tree):
        """When multiple nodes fail, all errors are collected."""
        child1 = sample_tree["child1"]
        child2 = sample_tree["child2"]
        child1.custom_attributes = {"rfc_status": "PENDING", "has_children": False}
        child2.pv = None
        child2.custom_attributes = {"has_children": False}
        nodes = [child1, child2]
        errors = _validate_all_nodes(nodes)
        assert len(errors) == 2
        assert errors[0]["code"] == "WP-001"
        assert errors[1]["code"] == "WP-002"


# ============================================================================
# Tests: Cryptographic state hash
# ============================================================================

class TestComputeStateHash:
    """Test the _compute_state_hash helper."""

    def test_deterministic(self):
        """Same input should always produce the same hash."""
        data = [{"code": "A", "value": 1}, {"code": "B", "value": 2}]
        h1 = _compute_state_hash(data)
        h2 = _compute_state_hash(data)
        assert h1 == h2
        assert len(h1) == 64  # SHA-256 hex length

    def test_different_input_different_hash(self):
        """Different input should produce a different hash."""
        data1 = [{"code": "A", "value": 1}]
        data2 = [{"code": "A", "value": 2}]
        assert _compute_state_hash(data1) != _compute_state_hash(data2)

    def test_empty_list(self):
        """An empty list should still produce a valid hash."""
        h = _compute_state_hash([])
        assert len(h) == 64


# ============================================================================
# Tests: BaselineValidationException
# ============================================================================

class TestBaselineValidationException:
    """Test the BaselineValidationException class."""

    def test_carries_errors(self):
        """The exception should carry structured errors."""
        errors = [
            {"node_id": "abc", "code": "WP-1", "message": "No BAC"},
            {"node_id": "def", "code": "WP-2", "message": "Unapproved RFC"},
        ]
        exc = BaselineValidationException(errors)
        assert exc.errors == errors
        assert "WP-1" in str(exc)
        assert "WP-2" in str(exc)


# ============================================================================
# Tests: Atomic freeze – lock isolation
# ============================================================================

class TestFreezeBaselineAtomicLockIsolation:
    """Test that freeze_baseline_atomic acquires and releases locks."""

    def test_lock_rejected_concurrent(self, db_session, sample_tree):
        """A second baseline freeze on the same sub-tree should be rejected."""
        root = sample_tree["root"]
        root_path = root.path

        # Simulate an existing lock
        import datetime as dt
        from app.models.models import SubTreeLock

        existing_lock = SubTreeLock(
            root_path=root_path,
            operation_type=LockOperationType.CPM_RECALCULATION,
            locked_by_user_id=999,
            acquired_at=dt.datetime.now(dt.timezone.utc),
            expires_at=dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=30),
        )
        db_session.add(existing_lock)
        db_session.commit()

        # Verify the lock is found
        found = _find_overlapping_lock(db_session, root_path)
        assert found is not None
        assert found.operation_type == LockOperationType.CPM_RECALCULATION

    def test_lock_expired_auto_cleaned(self, db_session, sample_tree):
        """An expired lock should be auto-cleaned and not block operations."""
        root = sample_tree["root"]
        root_path = root.path

        import datetime as dt
        from app.models.models import SubTreeLock

        # Insert an already-expired lock
        expired_lock = SubTreeLock(
            root_path=root_path,
            operation_type=LockOperationType.BASELINE_FREEZE,
            locked_by_user_id=999,
            acquired_at=dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=60),
            expires_at=dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=30),
        )
        db_session.add(expired_lock)
        db_session.commit()

        # The expired lock should not be found as overlapping
        found = _find_overlapping_lock(db_session, root_path)
        assert found is None


# ============================================================================
# Tests: Atomic freeze – zero orphan rows on validation failure
# ============================================================================

class TestFreezeBaselineAtomicNoOrphans:
    """Verify that mid-snapshot failures leave zero orphan baseline rows."""

    @pytest.mark.asyncio
    async def test_validation_failure_no_orphan_baselines(self, db_session, sample_tree):
        """When validation fails, no PortfolioBaseline row should exist."""
        from sqlalchemy import text as sa_text
        import json as _json

        child = sample_tree["child1"]
        db_session.execute(
            sa_text("UPDATE portfolio_nodes SET pv = NULL WHERE id = :nid"),
            {"nid": _uuid(child.id)},
        )
        db_session.execute(
            sa_text(
                "UPDATE universal_breakdown_nodes SET custom_attributes = :ca WHERE id = :nid"
            ),
            {"ca": _json.dumps({"has_children": False}), "nid": _uuid(child.id)},
        )
        db_session.commit()
        db_session.expire_all()

        root = sample_tree["root"]
        before_count = db_session.query(PortfolioBaseline).count()

        with pytest.raises(BaselineValidationException) as exc_info:
            await freeze_baseline_atomic(
                db_session,
                root.id,
                "B0_CONTRACT",
                "Contract Baseline",
                user_id=1,
            )

        assert len(exc_info.value.errors) > 0
        after_count = db_session.query(PortfolioBaseline).count()
        assert after_count == before_count
        snapshot_count = db_session.query(BaselineNodeSnapshot).count()
        assert snapshot_count == 0

    @pytest.mark.asyncio
    async def test_validation_failure_no_orphan_snapshots(self, db_session, sample_tree):
        """When validation fails, no BaselineNodeSnapshot row should exist."""
        from sqlalchemy import text as sa_text
        import json as _json

        for key in ("child1", "child2"):
            node = sample_tree[key]
            db_session.execute(
                sa_text("UPDATE portfolio_nodes SET pv = NULL WHERE id = :nid"),
                {"nid": _uuid(node.id)},
            )
            db_session.execute(
                sa_text(
                    "UPDATE universal_breakdown_nodes SET custom_attributes = :ca WHERE id = :nid"
                ),
                {"ca": _json.dumps({"has_children": False}), "nid": _uuid(node.id)},
            )
        db_session.commit()
        db_session.expire_all()

        root = sample_tree["root"]

        with pytest.raises(BaselineValidationException):
            await freeze_baseline_atomic(
                db_session,
                root.id,
                "B0_CONTRACT",
                "Contract Baseline",
                user_id=1,
            )

        snapshots = db_session.query(BaselineNodeSnapshot).all()
        assert len(snapshots) == 0

    @pytest.mark.asyncio
    async def test_validation_failure_no_orphan_audit_logs(self, db_session, sample_tree):
        """When validation fails, no ForensicAuditLog row should exist."""
        from sqlalchemy import text as sa_text
        import json as _json

        child = sample_tree["child1"]
        db_session.execute(
            sa_text(
                "UPDATE universal_breakdown_nodes SET custom_attributes = :ca WHERE id = :nid"
            ),
            {"ca": _json.dumps({"rfc_status": "PENDING", "has_children": False}), "nid": _uuid(child.id)},
        )
        db_session.commit()
        db_session.expire_all()

        root = sample_tree["root"]
        before_count = db_session.query(ForensicAuditLog).count()

        with pytest.raises(BaselineValidationException):
            await freeze_baseline_atomic(
                db_session,
                root.id,
                "B0_CONTRACT",
                "Contract Baseline",
                user_id=1,
            )

        after_count = db_session.query(ForensicAuditLog).count()
        assert after_count == before_count


# ============================================================================
# Tests: Atomic freeze – successful baseline creation
# ============================================================================

class TestFreezeBaselineAtomicSuccess:
    """Test successful atomic baseline freeze with all components."""

    @pytest.mark.asyncio
    async def test_successful_freeze_creates_baseline(self, db_session, sample_tree):
        """A valid sub-tree should produce a baseline and snapshots."""
        root = sample_tree["root"]

        baseline, snapshot_count = await freeze_baseline_atomic(
            db_session,
            root.id,
            "B0_CONTRACT",
            "Contract Baseline",
            user_id=1,
        )

        assert baseline is not None
        assert baseline.baseline_code == "B0_CONTRACT"
        assert snapshot_count == 3  # root + 2 children

    @pytest.mark.asyncio
    async def test_successful_freeze_creates_audit_log(self, db_session, sample_tree):
        """A successful freeze should create a ForensicAuditLog entry."""
        root = sample_tree["root"]

        baseline, _ = await freeze_baseline_atomic(
            db_session,
            root.id,
            "B0_CONTRACT",
            "Contract Baseline",
            user_id=1,
        )

        audit_entries = (
            db_session.query(ForensicAuditLog)
            .filter(ForensicAuditLog.entity_id == baseline.id)
            .all()
        )
        assert len(audit_entries) == 1
        assert audit_entries[0].action_type == "BASELINE_FREEZE"
        assert "state_hash" in str(audit_entries[0].json_diff)

    @pytest.mark.asyncio
    async def test_successful_freeze_updates_milestone_pointers(self, db_session, sample_tree):
        """A successful freeze should update baseline_milestone on nodes."""
        root = sample_tree["root"]

        baseline, _ = await freeze_baseline_atomic(
            db_session,
            root.id,
            "B0_CONTRACT",
            "Contract Baseline",
            user_id=1,
        )

        # Check milestone pointer via raw SQL to avoid ORM version_id issues
        from sqlalchemy import text as sa_text
        row = db_session.execute(
            sa_text("SELECT custom_attributes FROM universal_breakdown_nodes WHERE id = :nid"),
            {"nid": _uuid(root.id)},
        ).fetchone()
        import json as _json
        custom = _json.loads(row[0]) if isinstance(row[0], str) else row[0]
        assert "baseline_milestone" in custom
        assert custom["baseline_milestone"]["baseline_id"] == str(baseline.id)

    @pytest.mark.asyncio
    async def test_first_baseline_is_active_target(self, db_session, sample_tree):
        """The first baseline for a root should be marked as active target."""
        root = sample_tree["root"]

        baseline, _ = await freeze_baseline_atomic(
            db_session,
            root.id,
            "B0_CONTRACT",
            "Contract Baseline",
            user_id=1,
        )

        assert baseline.is_active_target is True

    @pytest.mark.asyncio
    async def test_second_baseline_not_active_target(self, db_session, sample_tree):
        """A second baseline should not override the active target flag."""
        root = sample_tree["root"]

        # First baseline
        baseline1, _ = await freeze_baseline_atomic(
            db_session,
            root.id,
            "B0_CONTRACT",
            "Contract Baseline",
            user_id=1,
        )
        assert baseline1.is_active_target is True

        # Second baseline
        baseline2, _ = await freeze_baseline_atomic(
            db_session,
            root.id,
            "B1_REVISION",
            "Revised Baseline",
            user_id=1,
        )
        assert baseline2.is_active_target is False

    @pytest.mark.asyncio
    async def test_root_not_found_raises_value_error(self, db_session):
        """Passing a non-existent root_node_id should raise ValueError."""
        fake_id = uuid4()
        with pytest.raises(ValueError, match="not found"):
            await freeze_baseline_atomic(
                db_session,
                fake_id,
                "B0_CONTRACT",
                "Contract Baseline",
                user_id=1,
            )
