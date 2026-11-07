"""Tests for the agent staging service.

Covers:
- Staging does not mutate live production tables
- Committing applies forward mutations and updates live state
- Reverting restores original timestamps and float values with zero rounding error
- Lease validation blocks staging on leased nodes
- Session status transitions (PENDING_REVIEW → ACCEPTED_COMMITTED → REVERTED)
- Dual-attribution forensic audit log entries on commit and revert
- Sequence ordering for multi-step mutations

Note: Tests use an in-memory SQLite database.  PortfolioNode objects are
added to the session but not flushed to avoid version_id mapper conflicts
on SQLite.  The service finds them via the identity map, matching the
pattern used in copilot_actions tests.
"""

import pytest
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.models import (
    PortfolioNode,
    ForensicAuditLog,
    SecurityClassification,
    User,
)
from app.models.agent_staging import (
    AgentProposalSession,
    AgentStagedMutation,
    AgentProposalStatus,
)
from app.models.leases import SubTreeCheckOut
from app.services.agent_staging_service import (
    stage_agent_action,
    commit_proposal_session,
    revert_committed_session,
    _is_node_locked_by_lease,
    _capture_node_state,
)


# ============================================================================
# Fixtures
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
    session.close()
    Base.metadata.drop_all(engine)


@pytest.fixture
def reviewer_user(db_session):
    """Create a test user for review operations."""
    user = User(
        username="reviewer1",
        email="reviewer@example.com",
        hashed_password="hashed",
        full_name="Test Reviewer",
        role="ADMIN",
        is_active=True,
        clearance_level=SecurityClassification.SECRET,
        caveats=[],
    )
    db_session.add(user)
    db_session.flush()
    return user


@pytest.fixture
def programme_node(db_session):
    """Create a programme root node (identity map only, no flush)."""
    now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    node = PortfolioNode(
        id=uuid4(),
        code="PROG-001",
        name="Test Programme",
        tree_type="WBS",
        security_classification=SecurityClassification.OFFICIAL,
        caveats=[],
        path="1",
        delivery_mode="WATERFALL",
        planned_start_date=now,
        planned_end_date=now + timedelta(days=365),
        percent_complete=0.0,
        is_active=True,
        custom_attributes={},
    )
    db_session.add(node)
    return node


@pytest.fixture
def task_node(db_session):
    """Create a task node with known dates and progress (identity map only)."""
    now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    node = PortfolioNode(
        id=uuid4(),
        code="WP-101",
        name="Test Work Package",
        tree_type="WBS",
        security_classification=SecurityClassification.OFFICIAL,
        caveats=[],
        path="1.2",
        delivery_mode="WATERFALL",
        planned_start_date=now + timedelta(days=10),
        planned_end_date=now + timedelta(days=40),
        percent_complete=25.5,
        is_active=True,
        custom_attributes={},
    )
    db_session.add(node)
    return node


@pytest.fixture
def proposal_session(db_session, programme_node):
    """Create a pending proposal session."""
    session = AgentProposalSession(
        id=uuid4(),
        programme_id=programme_node.id,
        agent_identifier="agent:autonomous-cpm-leveler",
        model_name="llama3-70b-instruct-q4",
        model_weights_hash="a" * 64,
        prompt_digest="b" * 64,
        status=AgentProposalStatus.PENDING_REVIEW,
    )
    db_session.add(session)
    # Flush the session (no version_id conflict on this model)
    try:
        db_session.flush()
    except Exception:
        pass
    return session


def _get_node(db, node_id):
    """Look up a PortfolioNode by ID, checking identity map first."""
    node = db.get(PortfolioNode, node_id)
    if node is None:
        for obj in db.identity_map.get(PortfolioNode, {}).values():
            if obj.id == node_id:
                return obj
    return node


# ============================================================================
# Test: Staging does not mutate live tables
# ============================================================================

class TestStagingIsolation:
    """Verify that staging mutations does not affect live production data."""

    def test_staging_does_not_change_node_dates(self, db_session, task_node, proposal_session):
        """Staging a NODE_SHIFT must not modify the node's planned dates."""
        original_start = task_node.planned_start_date
        original_end = task_node.planned_end_date

        new_start = (original_start + timedelta(days=5)).isoformat()
        new_end = (original_end + timedelta(days=5)).isoformat()

        mutation = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="NODE_SHIFT",
            forward_patch={
                "planned_start_date": new_start,
                "planned_end_date": new_end,
            },
        )

        # Node in identity map must be unchanged (staging does not mutate)
        assert task_node.planned_start_date == original_start
        assert task_node.planned_end_date == original_end

        # Mutation record must exist in staging
        assert mutation is not None
        assert mutation.session_id == proposal_session.id
        assert mutation.action_type == "NODE_SHIFT"

    def test_staging_does_not_change_node_progress(self, db_session, task_node, proposal_session):
        """Staging a PROGRESS_SET must not modify the node's percent_complete."""
        original_percent = task_node.percent_complete

        mutation = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="PROGRESS_SET",
            forward_patch={"percent_complete": 75.0},
        )

        assert task_node.percent_complete == original_percent
        assert mutation is not None

    def test_staging_captures_inverse_delta(self, db_session, task_node, proposal_session):
        """Staging must capture the current node state in inverse_delta."""
        original_start = task_node.planned_start_date.isoformat()
        original_end = task_node.planned_end_date.isoformat()
        original_percent = task_node.percent_complete

        mutation = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="NODE_SHIFT",
            forward_patch={
                "planned_start_date": (task_node.planned_start_date + timedelta(days=5)).isoformat(),
                "planned_end_date": (task_node.planned_end_date + timedelta(days=5)).isoformat(),
            },
        )

        assert mutation.inverse_delta["planned_start_date"] == original_start
        assert mutation.inverse_delta["planned_end_date"] == original_end
        assert mutation.inverse_delta["percent_complete"] == original_percent

    def test_staging_records_topological_impact(self, db_session, task_node, proposal_session):
        """Staging must compute and store topological impact summary."""
        mutation = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="NODE_SHIFT",
            forward_patch={
                "planned_start_date": (task_node.planned_start_date + timedelta(days=5)).isoformat(),
                "planned_end_date": (task_node.planned_end_date + timedelta(days=5)).isoformat(),
            },
        )

        assert mutation.topological_impact_summary is not None
        assert "affected_successors" in mutation.topological_impact_summary
        assert "float_consumption" in mutation.topological_impact_summary
        assert "baseline_slip_warnings" in mutation.topological_impact_summary

    def test_staging_assigns_sequence_order(self, db_session, task_node, proposal_session):
        """Multiple staged mutations must have ascending sequence_order."""
        now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

        m1 = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="NODE_SHIFT",
            forward_patch={
                "planned_start_date": (now + timedelta(days=1)).isoformat(),
                "planned_end_date": (now + timedelta(days=2)).isoformat(),
            },
        )
        m2 = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="PROGRESS_SET",
            forward_patch={"percent_complete": 50.0},
        )

        assert m1.sequence_order == 0
        assert m2.sequence_order == 1


# ============================================================================
# Test: Committing applies forward mutations
# ============================================================================

class TestCommitProposalSession:
    """Verify that committing a proposal session applies all forward mutations."""

    def test_commit_updates_live_node_dates(self, db_session, task_node, proposal_session, reviewer_user):
        """Committing must update the node's planned dates to the forward delta values."""
        original_start = task_node.planned_start_date
        original_end = task_node.planned_end_date

        new_start = original_start + timedelta(days=10)
        new_end = original_end + timedelta(days=10)

        stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="NODE_SHIFT",
            forward_patch={
                "planned_start_date": new_start.isoformat(),
                "planned_end_date": new_end.isoformat(),
            },
        )

        result = commit_proposal_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
        )

        # Node in identity map must reflect the forward delta
        assert task_node.planned_start_date == new_start
        assert task_node.planned_end_date == new_end

        assert result["status"] == AgentProposalStatus.ACCEPTED_COMMITTED.value
        assert result["applied_mutations"] == 1

    def test_commit_updates_live_node_progress(self, db_session, task_node, proposal_session, reviewer_user):
        """Committing must update the node's percent_complete."""
        stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="PROGRESS_SET",
            forward_patch={"percent_complete": 80.0},
        )

        commit_proposal_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
        )

        assert task_node.percent_complete == 80.0

    def test_commit_sets_session_status(self, db_session, task_node, proposal_session, reviewer_user):
        """Committing must transition session status to ACCEPTED_COMMITTED."""
        stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="PROGRESS_SET",
            forward_patch={"percent_complete": 50.0},
        )

        commit_proposal_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
        )

        assert proposal_session.status == AgentProposalStatus.ACCEPTED_COMMITTED
        assert proposal_session.reviewed_by_user_id == reviewer_user.id
        assert proposal_session.resolved_at is not None

    def test_commit_creates_audit_log(self, db_session, task_node, proposal_session, reviewer_user):
        """Committing must emit a dual-attribution forensic audit log entry."""
        stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="PROGRESS_SET",
            forward_patch={"percent_complete": 50.0},
        )

        result = commit_proposal_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
        )

        # Audit entry is in db.new (not flushed on SQLite); check both DB and pending
        audit_entries = db_session.query(ForensicAuditLog).filter(
            ForensicAuditLog.action_type == "AGENT_PROPOSAL_COMMITTED",
            ForensicAuditLog.entity_id == proposal_session.id,
        ).all()
        # Also check pending new objects
        for obj in db_session.new:
            if isinstance(obj, ForensicAuditLog) and obj.action_type == "AGENT_PROPOSAL_COMMITTED" and obj.entity_id == proposal_session.id:
                audit_entries.append(obj)

        assert len(audit_entries) == 1
        entry = audit_entries[0]
        assert "agent:agent:autonomous-cpm-leveler" in entry.user_upn
        assert f"reviewer:{reviewer_user.id}" in entry.user_upn
        assert result["audit_log_id"] == str(entry.id)

    def test_commit_rejects_non_pending_session(self, db_session, proposal_session, reviewer_user):
        """Cannot commit a session that is not in PENDING_REVIEW."""
        proposal_session.status = AgentProposalStatus.REJECTED

        with pytest.raises(ValueError, match="REJECTED"):
            commit_proposal_session(
                db=db_session,
                session_id=proposal_session.id,
                reviewer_user_id=reviewer_user.id,
            )

    def test_commit_applies_multiple_mutations(self, db_session, task_node, proposal_session, reviewer_user):
        """Committing must apply all staged mutations in sequence order."""
        now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

        stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="NODE_SHIFT",
            forward_patch={
                "planned_start_date": (now + timedelta(days=20)).isoformat(),
                "planned_end_date": (now + timedelta(days=50)).isoformat(),
            },
        )
        stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="PROGRESS_SET",
            forward_patch={"percent_complete": 60.0},
        )

        result = commit_proposal_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
        )

        assert task_node.planned_start_date == now + timedelta(days=20)
        assert task_node.planned_end_date == now + timedelta(days=50)
        assert task_node.percent_complete == 60.0
        assert result["applied_mutations"] == 2


# ============================================================================
# Test: Reverting restores original state
# ============================================================================

class TestRevertCommittedSession:
    """Verify that reverting restores original timestamps and float values."""

    def test_revert_restores_original_dates(
        self, db_session, task_node, proposal_session, reviewer_user
    ):
        """Reverting must restore the original planned dates with zero error."""
        original_start = task_node.planned_start_date
        original_end = task_node.planned_end_date

        stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="NODE_SHIFT",
            forward_patch={
                "planned_start_date": (original_start + timedelta(days=15)).isoformat(),
                "planned_end_date": (original_end + timedelta(days=15)).isoformat(),
            },
        )

        commit_proposal_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
        )

        # Verify dates were changed
        assert task_node.planned_start_date == original_start + timedelta(days=15)
        assert task_node.planned_end_date == original_end + timedelta(days=15)

        # Revert
        result = revert_committed_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
            justification="Dates caused downstream conflicts",
        )

        # Verify dates are restored to exact originals
        assert task_node.planned_start_date == original_start
        assert task_node.planned_end_date == original_end
        assert result["status"] == AgentProposalStatus.REVERTED.value

    def test_revert_restores_original_float_with_zero_rounding_error(
        self, db_session, task_node, proposal_session, reviewer_user
    ):
        """Reverting must restore percent_complete with zero rounding error."""
        original_percent = 25.5  # task_node fixture value

        stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="PROGRESS_SET",
            forward_patch={"percent_complete": 75.0},
        )

        commit_proposal_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
        )

        assert task_node.percent_complete == 75.0

        # Revert
        revert_committed_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
            justification="Progress was incorrect",
        )

        # Verify float is restored with zero rounding error
        assert task_node.percent_complete == original_percent
        assert abs(task_node.percent_complete - original_percent) == 0.0

    def test_revert_sets_session_status(self, db_session, task_node, proposal_session, reviewer_user):
        """Reverting must transition session status to REVERTED."""
        stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="PROGRESS_SET",
            forward_patch={"percent_complete": 50.0},
        )

        commit_proposal_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
        )

        revert_committed_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
            justification="Test revert",
        )

        assert proposal_session.status == AgentProposalStatus.REVERTED
        assert proposal_session.reversion_justification == "Test revert"

    def test_revert_creates_audit_log(self, db_session, task_node, proposal_session, reviewer_user):
        """Reverting must log an AGENT_TRANSACTION_REVERTED block."""
        stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="PROGRESS_SET",
            forward_patch={"percent_complete": 50.0},
        )

        commit_proposal_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
        )

        result = revert_committed_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
            justification="Audit test",
        )

        # Audit entry is in db.new (not flushed on SQLite); check both DB and pending
        audit_entries = db_session.query(ForensicAuditLog).filter(
            ForensicAuditLog.action_type == "AGENT_TRANSACTION_REVERTED",
            ForensicAuditLog.entity_id == proposal_session.id,
        ).all()
        for obj in db_session.new:
            if isinstance(obj, ForensicAuditLog) and obj.action_type == "AGENT_TRANSACTION_REVERTED" and obj.entity_id == proposal_session.id:
                audit_entries.append(obj)

        assert len(audit_entries) == 1
        entry = audit_entries[0]
        assert "agent:agent:autonomous-cpm-leveler" in entry.user_upn
        assert result["audit_log_id"] == str(entry.id)

    def test_revert_rejects_non_committed_session(self, db_session, proposal_session, reviewer_user):
        """Cannot revert a session that is not in ACCEPTED_COMMITTED."""
        with pytest.raises(ValueError, match="PENDING_REVIEW"):
            revert_committed_session(
                db=db_session,
                session_id=proposal_session.id,
                reviewer_user_id=reviewer_user.id,
                justification="Should fail",
            )

    def test_revert_restores_multiple_mutations(
        self, db_session, task_node, proposal_session, reviewer_user
    ):
        """Reverting must restore all mutations applied in a session."""
        original_start = task_node.planned_start_date
        original_end = task_node.planned_end_date
        original_percent = task_node.percent_complete

        now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

        stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="NODE_SHIFT",
            forward_patch={
                "planned_start_date": (now + timedelta(days=20)).isoformat(),
                "planned_end_date": (now + timedelta(days=50)).isoformat(),
            },
        )
        stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="PROGRESS_SET",
            forward_patch={"percent_complete": 90.0},
        )

        commit_proposal_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
        )

        result = revert_committed_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
            justification="Full revert test",
        )

        assert task_node.planned_start_date == original_start
        assert task_node.planned_end_date == original_end
        assert task_node.percent_complete == original_percent
        assert result["reverted_mutations"] == 2


# ============================================================================
# Test: Lease validation
# ============================================================================

class TestLeaseValidation:
    """Verify that staging is blocked when a node is under lease."""

    def test_staging_blocked_by_active_lease(
        self, db_session, task_node, proposal_session, reviewer_user
    ):
        """Cannot stage a mutation on a node covered by an active lease."""
        lease = SubTreeCheckOut(
            root_node_id=task_node.id,
            ltree_scope_path=str(task_node.path),
            leased_by_user_id=reviewer_user.id,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
            is_active=True,
        )
        db_session.add(lease)
        db_session.flush()

        # The lease guard may raise SubTreeLockedException or our service raises ValueError
        with pytest.raises((ValueError, Exception), match="(locked|SubTreeLocked)"):
            stage_agent_action(
                db=db_session,
                session_id=proposal_session.id,
                node_id=task_node.id,
                action_type="PROGRESS_SET",
                forward_patch={"percent_complete": 50.0},
            )

    def test_staging_allowed_when_no_lease(self, db_session, task_node, proposal_session):
        """Staging must succeed when no active lease exists."""
        mutation = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="PROGRESS_SET",
            forward_patch={"percent_complete": 50.0},
        )
        assert mutation is not None

    def test_staging_allowed_when_lease_expired(self, db_session, task_node, proposal_session, reviewer_user):
        """Staging must succeed when a lease has expired."""
        lease = SubTreeCheckOut(
            root_node_id=task_node.id,
            ltree_scope_path=str(task_node.path),
            leased_by_user_id=reviewer_user.id,
            expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
            is_active=True,
        )
        db_session.add(lease)
        db_session.flush()

        mutation = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="PROGRESS_SET",
            forward_patch={"percent_complete": 50.0},
        )
        assert mutation is not None


# ============================================================================
# Test: Session validation
# ============================================================================

class TestSessionValidation:
    """Verify session existence and status checks."""

    def test_staging_fails_for_missing_session(self, db_session, task_node):
        """Staging must fail if the session doesn't exist."""
        fake_id = uuid4()
        with pytest.raises(ValueError, match="not found"):
            stage_agent_action(
                db=db_session,
                session_id=fake_id,
                node_id=task_node.id,
                action_type="PROGRESS_SET",
                forward_patch={"percent_complete": 50.0},
            )

    def test_staging_fails_for_committed_session(
        self, db_session, task_node, proposal_session, reviewer_user
    ):
        """Cannot stage mutations on an already committed session."""
        stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="PROGRESS_SET",
            forward_patch={"percent_complete": 50.0},
        )
        commit_proposal_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
        )

        with pytest.raises(ValueError, match="ACCEPTED_COMMITTED"):
            stage_agent_action(
                db=db_session,
                session_id=proposal_session.id,
                node_id=task_node.id,
                action_type="PROGRESS_SET",
                forward_patch={"percent_complete": 90.0},
            )

    def test_commit_fails_for_missing_session(self, db_session, reviewer_user):
        """Committing must fail if the session doesn't exist."""
        fake_id = uuid4()
        with pytest.raises(ValueError, match="not found"):
            commit_proposal_session(
                db=db_session,
                session_id=fake_id,
                reviewer_user_id=reviewer_user.id,
            )

    def test_revert_fails_for_missing_session(self, db_session, reviewer_user):
        """Reverting must fail if the session doesn't exist."""
        fake_id = uuid4()
        with pytest.raises(ValueError, match="not found"):
            revert_committed_session(
                db=db_session,
                session_id=fake_id,
                reviewer_user_id=reviewer_user.id,
                justification="Should fail",
            )


# ============================================================================
# Test: Helper functions
# ============================================================================

class TestHelperFunctions:
    """Verify internal helper functions."""

    def test_capture_node_state(self, db_session, task_node):
        """_capture_node_state must return the current node attributes."""
        state = _capture_node_state(db_session, task_node.id)

        # Node is in db.new (identity map), so state should be captured
        assert state.get("planned_start_date") == task_node.planned_start_date.isoformat()
        assert state.get("planned_end_date") == task_node.planned_end_date.isoformat()
        assert state.get("percent_complete") == task_node.percent_complete
        assert state.get("name") == task_node.name

    def test_capture_node_state_missing_node(self, db_session):
        """_capture_node_state must return empty dict for missing node."""
        fake_id = uuid4()
        state = _capture_node_state(db_session, fake_id)
        assert state == {}

    def test_is_node_locked_by_lease_no_lease(self, db_session, task_node):
        """_is_node_locked_by_lease must return False when no lease exists."""
        assert _is_node_locked_by_lease(db_session, task_node.id) is False

    def test_is_node_locked_by_lease_with_lease(self, db_session, task_node, reviewer_user):
        """_is_node_locked_by_lease must return True when an active lease exists."""
        lease = SubTreeCheckOut(
            root_node_id=task_node.id,
            ltree_scope_path=str(task_node.path),
            leased_by_user_id=reviewer_user.id,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
            is_active=True,
        )
        db_session.add(lease)
        db_session.flush()

        assert _is_node_locked_by_lease(db_session, task_node.id) is True
