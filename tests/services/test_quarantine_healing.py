"""Tests for the schedule quarantine healing and auto-decoupling features.

This test suite validates the cycle detection, edge flexibility classification,
and automated decoupling heuristics in the schedule quarantine service.

Coverage
--------
- Edge flexibility classification (soft links, hard constraints, lag)
- 3-node circular dependency cycle detection and decoupling
- 5-node circular dependency cycle detection and decoupling
- Mixed flexibility edge prioritization during decoupling
- Verification milestone creation and re-anchoring
- Graph acyclicity verification after decoupling
- Batch status transition to REMEDIATED when cycles are broken
"""
import pytest
from uuid import uuid4
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.models import (
    QuarantineBatch,
    QuarantineFileFormat,
    QuarantineValidationStatus,
    User,
    UserRole,
    SecurityClassification,
)
from app.services.schedule_quarantine import (
    ScheduleQuarantineService,
    auto_decouple_cycles,
    evaluate_quarantine_integrity,
)


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
def test_user(db_session):
    """Create a test user."""
    user = User(
        username="test_user",
        email="test@example.com",
        hashed_password="hashed",
        role=UserRole.ADMIN,
        clearance_level=SecurityClassification.TOP_SECRET,
        caveats=["UK_EYES_ONLY"],
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def create_quarantine_batch(db_session, test_user):
    """Factory to create a quarantine batch with given payload."""
    def _create(tasks, dependencies, calendars=None):
        # Use a dummy UUID for uploaded_by_user_id since User.id is Integer
        # but QuarantineBatch expects UUID — SQLite skips FK constraints
        dummy_user_uuid = uuid4()
        batch = QuarantineBatch(
            id=uuid4(),
            uploaded_by_user_id=dummy_user_uuid,
            source_filename="test_schedule.xer",
            file_format=QuarantineFileFormat.PRIMAVERA_P6_XER,
            target_project_id=uuid4(),
            validation_status=QuarantineValidationStatus.PENDING,
            quarantine_payload={
                "tasks": tasks,
                "dependencies": dependencies,
                "calendars": calendars or [],
            },
        )
        db_session.add(batch)
        db_session.commit()
        return batch
    return _create


class TestEdgeFlexibilityClassification:
    """Test the edge flexibility classification logic."""

    def test_soft_link_with_lag_is_most_flexible(self):
        """Soft links with lag > 0 should have flexibility_score 0."""
        edge_data = {
            "dependency_type": "FS",
            "lag_days": 5,
            "is_soft_link": True,
        }
        result = ScheduleQuarantineService._classify_edge_flexibility(
            edge_data, "A", "B"
        )
        assert result["flexibility_score"] == 0
        assert result["is_soft_link"] is True
        assert result["lag_days"] == 5

    def test_soft_link_without_lag(self):
        """Soft links with lag == 0 should have flexibility_score 1."""
        edge_data = {
            "dependency_type": "FS",
            "lag_days": 0,
            "is_soft_link": True,
        }
        result = ScheduleQuarantineService._classify_edge_flexibility(
            edge_data, "A", "B"
        )
        assert result["flexibility_score"] == 1

    def test_hard_fs_link(self):
        """Hard FS links should have flexibility_score 2."""
        edge_data = {
            "dependency_type": "FS",
            "lag_days": 0,
            "is_soft_link": False,
        }
        result = ScheduleQuarantineService._classify_edge_flexibility(
            edge_data, "A", "B"
        )
        assert result["flexibility_score"] == 2

    def test_hard_ff_link(self):
        """Hard FF links should have flexibility_score 3."""
        edge_data = {
            "dependency_type": "FF",
            "lag_days": 0,
            "is_soft_link": False,
        }
        result = ScheduleQuarantineService._classify_edge_flexibility(
            edge_data, "A", "B"
        )
        assert result["flexibility_score"] == 3

    def test_hard_ss_link(self):
        """Hard SS links should have flexibility_score 3."""
        edge_data = {
            "dependency_type": "SS",
            "lag_days": 0,
            "is_soft_link": False,
        }
        result = ScheduleQuarantineService._classify_edge_flexibility(
            edge_data, "A", "B"
        )
        assert result["flexibility_score"] == 3

    def test_default_edge_type_is_fs(self):
        """Missing dependency_type should default to FS."""
        edge_data = {}
        result = ScheduleQuarantineService._classify_edge_flexibility(
            edge_data, "A", "B"
        )
        assert result["edge_type"] == "FS"
        assert result["flexibility_score"] == 2


class TestThreeNodeCycleDetection:
    """Test cycle detection for 3-node circular subgraphs."""

    def test_detect_3_node_cycle(self, db_session, test_user, create_quarantine_batch):
        """A 3-node cycle A->B->C->A should be detected."""
        tasks = [
            {"id": "A", "code": "1.1", "name": "Task A", "duration_days": 10},
            {"id": "B", "code": "1.2", "name": "Task B", "duration_days": 10},
            {"id": "C", "code": "1.3", "name": "Task C", "duration_days": 10},
        ]
        dependencies = [
            {"predecessor_id": "A", "successor_id": "B", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "B", "successor_id": "C", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "C", "successor_id": "A", "dependency_type": "FS", "lag_days": 0},
        ]
        batch = create_quarantine_batch(tasks, dependencies)

        result = evaluate_quarantine_integrity(db_session, batch.id)
        assert result["cycle_count"] >= 1
        assert len(result["cycles"]) >= 1

        # Verify the cycle contains all 3 nodes
        cycle = result["cycles"][0]
        cycle_nodes = set(cycle["nodes"])
        assert "A" in cycle_nodes
        assert "B" in cycle_nodes
        assert "C" in cycle_nodes

    def test_3_node_cycle_edge_classification(self, db_session, test_user, create_quarantine_batch):
        """Cycle edges should be classified by flexibility."""
        tasks = [
            {"id": "A", "code": "1.1", "name": "Task A", "duration_days": 10},
            {"id": "B", "code": "1.2", "name": "Task B", "duration_days": 10},
            {"id": "C", "code": "1.3", "name": "Task C", "duration_days": 10},
        ]
        # C->A is a soft link with lag, should be preferred for removal
        dependencies = [
            {"predecessor_id": "A", "successor_id": "B", "dependency_type": "FS", "lag_days": 0, "is_soft_link": False},
            {"predecessor_id": "B", "successor_id": "C", "dependency_type": "FS", "lag_days": 0, "is_soft_link": False},
            {"predecessor_id": "C", "successor_id": "A", "dependency_type": "FS", "lag_days": 5, "is_soft_link": True},
        ]
        batch = create_quarantine_batch(tasks, dependencies)

        result = evaluate_quarantine_integrity(db_session, batch.id)
        cycle = result["cycles"][0]

        # The minimal feedback edge should be the soft link C->A
        minimal_edge = cycle["minimal_feedback_edges"][0]
        assert minimal_edge["source"] == "C"
        assert minimal_edge["target"] == "A"
        assert minimal_edge["flexibility_score"] == 0


class TestThreeNodeCycleDecoupling:
    """Test auto-decoupling for 3-node circular subgraphs."""

    def test_decouple_3_node_cycle(self, db_session, test_user, create_quarantine_batch):
        """Auto-decoupling should break a 3-node cycle."""
        tasks = [
            {"id": "A", "code": "1.1", "name": "Task A", "duration_days": 10},
            {"id": "B", "code": "1.2", "name": "Task B", "duration_days": 10},
            {"id": "C", "code": "1.3", "name": "Task C", "duration_days": 10},
        ]
        dependencies = [
            {"predecessor_id": "A", "successor_id": "B", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "B", "successor_id": "C", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "C", "successor_id": "A", "dependency_type": "FS", "lag_days": 0},
        ]
        batch = create_quarantine_batch(tasks, dependencies)

        result = auto_decouple_cycles(db_session, batch.id)

        assert result["cycles_broken"] >= 1
        assert result["edges_severed"] >= 1
        assert result["milestones_created"] >= 1
        assert result["remaining_cycles"] == 0

    def test_decouple_prefers_soft_link(self, db_session, test_user, create_quarantine_batch):
        """Auto-decoupling should sever the soft link first."""
        tasks = [
            {"id": "A", "code": "1.1", "name": "Task A", "duration_days": 10},
            {"id": "B", "code": "1.2", "name": "Task B", "duration_days": 10},
            {"id": "C", "code": "1.3", "name": "Task C", "duration_days": 10},
        ]
        dependencies = [
            {"predecessor_id": "A", "successor_id": "B", "dependency_type": "FS", "lag_days": 0, "is_soft_link": False},
            {"predecessor_id": "B", "successor_id": "C", "dependency_type": "FS", "lag_days": 0, "is_soft_link": False},
            {"predecessor_id": "C", "successor_id": "A", "dependency_type": "FS", "lag_days": 5, "is_soft_link": True},
        ]
        batch = create_quarantine_batch(tasks, dependencies)

        result = auto_decouple_cycles(db_session, batch.id)

        # The soft link C->A should be severed
        severed = result["decoupling_details"]["edges_severed"]
        assert len(severed) >= 1
        severed_pairs = {(e["source"], e["target"]) for e in severed}
        assert ("C", "A") in severed_pairs

    def test_decouple_creates_verification_milestone(self, db_session, test_user, create_quarantine_batch):
        """Auto-decoupling should create a verification milestone."""
        tasks = [
            {"id": "A", "code": "1.1", "name": "Task A", "duration_days": 10},
            {"id": "B", "code": "1.2", "name": "Task B", "duration_days": 10},
            {"id": "C", "code": "1.3", "name": "Task C", "duration_days": 10},
        ]
        dependencies = [
            {"predecessor_id": "A", "successor_id": "B", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "B", "successor_id": "C", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "C", "successor_id": "A", "dependency_type": "FS", "lag_days": 0},
        ]
        batch = create_quarantine_batch(tasks, dependencies)

        result = auto_decouple_cycles(db_session, batch.id)

        milestones = result["decoupling_details"]["milestones_created"]
        assert len(milestones) >= 1
        # Milestone should have _complete suffix
        milestone_id = milestones[0]["milestone_id"]
        assert milestone_id.endswith("_complete")

    def test_decouple_updates_batch_status(self, db_session, test_user, create_quarantine_batch):
        """Batch status should be updated after decoupling."""
        tasks = [
            {"id": "A", "code": "1.1", "name": "Task A", "duration_days": 10},
            {"id": "B", "code": "1.2", "name": "Task B", "duration_days": 10},
            {"id": "C", "code": "1.3", "name": "Task C", "duration_days": 10},
        ]
        dependencies = [
            {"predecessor_id": "A", "successor_id": "B", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "B", "successor_id": "C", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "C", "successor_id": "A", "dependency_type": "FS", "lag_days": 0},
        ]
        batch = create_quarantine_batch(tasks, dependencies)

        result = auto_decouple_cycles(db_session, batch.id)

        db_session.refresh(batch)
        assert batch.cycle_count == 0
        # Status may be REMEDIATED or QUARANTINED_HAS_ISSUES depending on dangling nodes
        assert batch.validation_status in (
            QuarantineValidationStatus.REMEDIATED,
            QuarantineValidationStatus.QUARANTINED_HAS_ISSUES,
        )


class TestFiveNodeCycleDetection:
    """Test cycle detection for 5-node circular subgraphs."""

    def test_detect_5_node_cycle(self, db_session, test_user, create_quarantine_batch):
        """A 5-node cycle A->B->C->D->E->A should be detected."""
        tasks = [
            {"id": "A", "code": "1.1", "name": "Task A", "duration_days": 10},
            {"id": "B", "code": "1.2", "name": "Task B", "duration_days": 10},
            {"id": "C", "code": "1.3", "name": "Task C", "duration_days": 10},
            {"id": "D", "code": "1.4", "name": "Task D", "duration_days": 10},
            {"id": "E", "code": "1.5", "name": "Task E", "duration_days": 10},
        ]
        dependencies = [
            {"predecessor_id": "A", "successor_id": "B", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "B", "successor_id": "C", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "C", "successor_id": "D", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "D", "successor_id": "E", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "E", "successor_id": "A", "dependency_type": "FS", "lag_days": 0},
        ]
        batch = create_quarantine_batch(tasks, dependencies)

        result = evaluate_quarantine_integrity(db_session, batch.id)
        assert result["cycle_count"] >= 1
        assert len(result["cycles"]) >= 1

        # Verify the cycle contains all 5 nodes
        cycle = result["cycles"][0]
        cycle_nodes = set(cycle["nodes"])
        assert "A" in cycle_nodes
        assert "B" in cycle_nodes
        assert "C" in cycle_nodes
        assert "D" in cycle_nodes
        assert "E" in cycle_nodes


class TestFiveNodeCycleDecoupling:
    """Test auto-decoupling for 5-node circular subgraphs."""

    def test_decouple_5_node_cycle(self, db_session, test_user, create_quarantine_batch):
        """Auto-decoupling should break a 5-node cycle."""
        tasks = [
            {"id": "A", "code": "1.1", "name": "Task A", "duration_days": 10},
            {"id": "B", "code": "1.2", "name": "Task B", "duration_days": 10},
            {"id": "C", "code": "1.3", "name": "Task C", "duration_days": 10},
            {"id": "D", "code": "1.4", "name": "Task D", "duration_days": 10},
            {"id": "E", "code": "1.5", "name": "Task E", "duration_days": 10},
        ]
        dependencies = [
            {"predecessor_id": "A", "successor_id": "B", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "B", "successor_id": "C", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "C", "successor_id": "D", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "D", "successor_id": "E", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "E", "successor_id": "A", "dependency_type": "FS", "lag_days": 0},
        ]
        batch = create_quarantine_batch(tasks, dependencies)

        result = auto_decouple_cycles(db_session, batch.id)

        assert result["cycles_broken"] >= 1
        assert result["edges_severed"] >= 1
        assert result["remaining_cycles"] == 0

    def test_decouple_5_node_prefers_soft_link(self, db_session, test_user, create_quarantine_batch):
        """Auto-decoupling should sever the soft link in a 5-node cycle."""
        tasks = [
            {"id": "A", "code": "1.1", "name": "Task A", "duration_days": 10},
            {"id": "B", "code": "1.2", "name": "Task B", "duration_days": 10},
            {"id": "C", "code": "1.3", "name": "Task C", "duration_days": 10},
            {"id": "D", "code": "1.4", "name": "Task D", "duration_days": 10},
            {"id": "E", "code": "1.5", "name": "Task E", "duration_days": 10},
        ]
        # D->E is a soft link, should be preferred for removal
        dependencies = [
            {"predecessor_id": "A", "successor_id": "B", "dependency_type": "FS", "lag_days": 0, "is_soft_link": False},
            {"predecessor_id": "B", "successor_id": "C", "dependency_type": "FS", "lag_days": 0, "is_soft_link": False},
            {"predecessor_id": "C", "successor_id": "D", "dependency_type": "FS", "lag_days": 0, "is_soft_link": False},
            {"predecessor_id": "D", "successor_id": "E", "dependency_type": "FS", "lag_days": 3, "is_soft_link": True},
            {"predecessor_id": "E", "successor_id": "A", "dependency_type": "FS", "lag_days": 0, "is_soft_link": False},
        ]
        batch = create_quarantine_batch(tasks, dependencies)

        result = auto_decouple_cycles(db_session, batch.id)

        severed = result["decoupling_details"]["edges_severed"]
        severed_pairs = {(e["source"], e["target"]) for e in severed}
        assert ("D", "E") in severed_pairs

    def test_decouple_5_node_creates_milestone(self, db_session, test_user, create_quarantine_batch):
        """Auto-decoupling should create a verification milestone for 5-node cycle."""
        tasks = [
            {"id": "A", "code": "1.1", "name": "Task A", "duration_days": 10},
            {"id": "B", "code": "1.2", "name": "Task B", "duration_days": 10},
            {"id": "C", "code": "1.3", "name": "Task C", "duration_days": 10},
            {"id": "D", "code": "1.4", "name": "Task D", "duration_days": 10},
            {"id": "E", "code": "1.5", "name": "Task E", "duration_days": 10},
        ]
        dependencies = [
            {"predecessor_id": "A", "successor_id": "B", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "B", "successor_id": "C", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "C", "successor_id": "D", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "D", "successor_id": "E", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "E", "successor_id": "A", "dependency_type": "FS", "lag_days": 0},
        ]
        batch = create_quarantine_batch(tasks, dependencies)

        result = auto_decouple_cycles(db_session, batch.id)

        milestones = result["decoupling_details"]["milestones_created"]
        assert len(milestones) >= 1


class TestMultipleCycleDecoupling:
    """Test decoupling when multiple cycles exist."""

    def test_decouple_multiple_cycles(self, db_session, test_user, create_quarantine_batch):
        """Two overlapping cycles should both be broken."""
        tasks = [
            {"id": "A", "code": "1.1", "name": "Task A", "duration_days": 10},
            {"id": "B", "code": "1.2", "name": "Task B", "duration_days": 10},
            {"id": "C", "code": "1.3", "name": "Task C", "duration_days": 10},
            {"id": "D", "code": "1.4", "name": "Task D", "duration_days": 10},
        ]
        # Cycle 1: A->B->C->A
        # Cycle 2: C->D->A->C (overlapping via A and C)
        dependencies = [
            {"predecessor_id": "A", "successor_id": "B", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "B", "successor_id": "C", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "C", "successor_id": "A", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "C", "successor_id": "D", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "D", "successor_id": "A", "dependency_type": "FS", "lag_days": 0},
        ]
        batch = create_quarantine_batch(tasks, dependencies)

        result = auto_decouple_cycles(db_session, batch.id)

        assert result["remaining_cycles"] == 0
        assert result["edges_severed"] >= 1


class TestNoCycleCase:
    """Test behavior when no cycles exist."""

    def test_no_cycle_batch(self, db_session, test_user, create_quarantine_batch):
        """A DAG with no cycles should report zero cycles."""
        tasks = [
            {"id": "A", "code": "1.1", "name": "Task A", "duration_days": 10},
            {"id": "B", "code": "1.2", "name": "Task B", "duration_days": 10},
            {"id": "C", "code": "1.3", "name": "Task C", "duration_days": 10},
        ]
        dependencies = [
            {"predecessor_id": "A", "successor_id": "B", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "B", "successor_id": "C", "dependency_type": "FS", "lag_days": 0},
        ]
        batch = create_quarantine_batch(tasks, dependencies)

        result = evaluate_quarantine_integrity(db_session, batch.id)
        assert result["cycle_count"] == 0

    def test_decouple_no_cycle_batch(self, db_session, test_user, create_quarantine_batch):
        """Auto-decoupling on a DAG should make no changes."""
        tasks = [
            {"id": "A", "code": "1.1", "name": "Task A", "duration_days": 10},
            {"id": "B", "code": "1.2", "name": "Task B", "duration_days": 10},
            {"id": "C", "code": "1.3", "name": "Task C", "duration_days": 10},
        ]
        dependencies = [
            {"predecessor_id": "A", "successor_id": "B", "dependency_type": "FS", "lag_days": 0},
            {"predecessor_id": "B", "successor_id": "C", "dependency_type": "FS", "lag_days": 0},
        ]
        batch = create_quarantine_batch(tasks, dependencies)

        result = auto_decouple_cycles(db_session, batch.id)

        assert result["cycles_broken"] == 0
        assert result["edges_severed"] == 0
        assert result["milestones_created"] == 0
        assert result["remaining_cycles"] == 0


class TestBatchNotFound:
    """Test error handling for missing batches."""

    def test_decouple_nonexistent_batch(self, db_session):
        """Auto-decoupling a nonexistent batch should raise ValueError."""
        with pytest.raises(ValueError, match="not found"):
            auto_decouple_cycles(db_session, uuid4())
