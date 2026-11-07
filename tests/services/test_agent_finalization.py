"""Tests for idempotency fencing, model attestation, session throttling, and selective commit.

Covers:
- Idempotency: duplicate client_mutation_id returns cached mutation
- Model attestation: unaccredited agents are rejected
- Session throttling: mutation count and slip day ceilings
- Selective commit: cherry-pick individual mutations
- AccreditedAgent model: PKI fingerprint computation
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
    SecurityClassification,
    User,
)
from app.models.agent_staging import (
    AgentProposalSession,
    AgentStagedMutation,
    AgentProposalStatus,
    AccreditedAgent,
    AgentAttestationError,
)
from app.services.agent_staging_service import (
    stage_agent_action,
    commit_proposal_session,
    commit_selective_proposal_session,
    begin_proposal_session,
    _check_idempotency,
    _check_session_throttling,
    _get_agent_session_limits,
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
    """Create a programme root node."""
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
    """Create a task node with known dates."""
    now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    node = PortfolioNode(
        id=uuid4(),
        code="TASK-001",
        name="Test Task",
        tree_type="WBS",
        security_classification=SecurityClassification.OFFICIAL,
        caveats=[],
        path="1.2",
        delivery_mode="WATERFALL",
        planned_start_date=now,
        planned_end_date=now + timedelta(days=10),
        percent_complete=0.0,
        is_active=True,
        custom_attributes={},
    )
    db_session.add(node)
    return node


@pytest.fixture
def proposal_session(db_session, programme_node):
    """Create a PENDING_REVIEW proposal session."""
    session = AgentProposalSession(
        id=uuid4(),
        programme_id=programme_node.id,
        agent_identifier="agent:test",
        model_name="test-model",
        model_weights_hash="a" * 64,
        prompt_digest="b" * 64,
        status=AgentProposalStatus.PENDING_REVIEW,
        mutation_count=0,
        cumulative_slip_days=0,
    )
    db_session.add(session)
    db_session.flush()
    return session


@pytest.fixture
def accredited_agent(db_session, reviewer_user):
    """Create an accredited agent record."""
    agent = AccreditedAgent(
        agent_identifier="agent:test",
        public_key_fingerprint="pk" * 32,
        model_name="test-model",
        model_weights_hash="a" * 64,
        accredited_by_user_id=reviewer_user.id,
        is_active=True,
    )
    db_session.add(agent)
    db_session.flush()
    return agent


# ============================================================================
# Tests: System config limits
# ============================================================================

class TestSystemConfigLimits:
    """Verify system_config.json limits are loaded correctly."""

    def test_default_limits(self):
        limits = _get_agent_session_limits()
        assert limits["MAX_STAGED_MUTATIONS_PER_SESSION"] == 15
        assert limits["MAX_CUMULATIVE_SCHEDULE_SLIP_DAYS"] == 60

    def test_limits_are_integers(self):
        limits = _get_agent_session_limits()
        assert isinstance(limits["MAX_STAGED_MUTATIONS_PER_SESSION"], int)
        assert isinstance(limits["MAX_CUMULATIVE_SCHEDULE_SLIP_DAYS"], int)


# ============================================================================
# Tests: Idempotency fencing
# ============================================================================

class TestIdempotencyFencing:
    """Verify client_mutation_id prevents duplicate staging."""

    def test_duplicate_client_mutation_id_returns_cached(self, db_session, proposal_session, task_node):
        client_id = uuid4()
        now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        new_start = (now + timedelta(days=5)).isoformat()
        new_end = (now + timedelta(days=15)).isoformat()

        mutation1 = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="NODE_SHIFT",
            forward_patch={"planned_start_date": new_start, "planned_end_date": new_end},
            client_mutation_id=client_id,
        )

        mutation2 = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="NODE_SHIFT",
            forward_patch={"planned_start_date": new_start, "planned_end_date": new_end},
            client_mutation_id=client_id,
        )

        assert mutation1.id == mutation2.id
        assert mutation1.client_mutation_id == client_id

    def test_different_client_mutation_id_creates_new(self, db_session, proposal_session, task_node):
        client_id_1 = uuid4()
        client_id_2 = uuid4()
        now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        new_start = (now + timedelta(days=5)).isoformat()
        new_end = (now + timedelta(days=15)).isoformat()

        mutation1 = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="NODE_SHIFT",
            forward_patch={"planned_start_date": new_start, "planned_end_date": new_end},
            client_mutation_id=client_id_1,
        )

        new_start2 = (now + timedelta(days=10)).isoformat()
        new_end2 = (now + timedelta(days=20)).isoformat()

        mutation2 = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="NODE_SHIFT",
            forward_patch={"planned_start_date": new_start2, "planned_end_date": new_end2},
            client_mutation_id=client_id_2,
        )

        # Mutations are not flushed, so IDs may be None; compare by client_mutation_id and sequence
        assert mutation1.client_mutation_id == client_id_1
        assert mutation2.client_mutation_id == client_id_2
        assert mutation1.sequence_order != mutation2.sequence_order

    def test_no_client_mutation_id_generates_one(self, db_session, proposal_session, task_node):
        now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        new_start = (now + timedelta(days=5)).isoformat()
        new_end = (now + timedelta(days=15)).isoformat()

        mutation = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="NODE_SHIFT",
            forward_patch={"planned_start_date": new_start, "planned_end_date": new_end},
        )

        assert mutation.client_mutation_id is not None


# ============================================================================
# Tests: Model attestation
# ============================================================================

class TestModelAttestation:
    """Verify accredited agent handshake."""

    def test_begin_session_with_accredited_agent(self, db_session, programme_node, accredited_agent):
        result = begin_proposal_session(
            db=db_session,
            programme_id=programme_node.id,
            agent_identifier="agent:test",
            model_name="test-model",
            model_weights_hash="a" * 64,
            prompt_digest="b" * 64,
            public_key_fingerprint="pk" * 32,
        )

        assert result["status"] == AgentProposalStatus.PENDING_REVIEW.value
        assert "session_id" in result

    def test_begin_session_rejects_unaccredited_agent(self, db_session, programme_node):
        with pytest.raises(AgentAttestationError) as exc_info:
            begin_proposal_session(
                db=db_session,
                programme_id=programme_node.id,
                agent_identifier="agent:unknown",
                model_name="unknown-model",
                model_weights_hash="x" * 64,
                prompt_digest="b" * 64,
                public_key_fingerprint="pk" * 32,
            )

        assert exc_info.value.error_code == "UNACCREDITED_AGENT_ERROR"

    def test_begin_session_rejects_wrong_weights_hash(self, db_session, programme_node, accredited_agent):
        with pytest.raises(AgentAttestationError) as exc_info:
            begin_proposal_session(
                db=db_session,
                programme_id=programme_node.id,
                agent_identifier="agent:test",
                model_name="test-model",
                model_weights_hash="x" * 64,
                prompt_digest="b" * 64,
                public_key_fingerprint="pk" * 32,
            )

        assert exc_info.value.error_code == "UNACCREDITED_AGENT_ERROR"
        assert "mismatch" in exc_info.value.reason.lower()

    def test_begin_session_rejects_inactive_accreditation(self, db_session, programme_node, accredited_agent):
        accredited_agent.is_active = False
        db_session.flush()

        with pytest.raises(AgentAttestationError) as exc_info:
            begin_proposal_session(
                db=db_session,
                programme_id=programme_node.id,
                agent_identifier="agent:test",
                model_name="test-model",
                model_weights_hash="a" * 64,
                prompt_digest="b" * 64,
                public_key_fingerprint="pk" * 32,
            )

        assert exc_info.value.error_code == "UNACCREDITED_AGENT_ERROR"


# ============================================================================
# Tests: AccreditedAgent model
# ============================================================================

class TestAccreditedAgentModel:
    """Verify AccreditedAgent model behavior."""

    def test_compute_pk_fingerprint(self):
        pem = "-----BEGIN PUBLIC KEY-----\nMIIBIjANBg...\n-----END PUBLIC KEY-----"
        fingerprint = AccreditedAgent.compute_pk_fingerprint(pem)
        assert len(fingerprint) == 64  # SHA-256 hex digest
        assert fingerprint == AccreditedAgent.compute_pk_fingerprint(pem)

    def test_compute_pk_fingerprint_different_keys(self):
        pem1 = "KEY-A"
        pem2 = "KEY-B"
        fp1 = AccreditedAgent.compute_pk_fingerprint(pem1)
        fp2 = AccreditedAgent.compute_pk_fingerprint(pem2)
        assert fp1 != fp2


# ============================================================================
# Tests: Session throttling
# ============================================================================

class TestSessionThrottling:
    """Verify session boundary ceilings."""

    def test_mutation_count_limit(self, db_session, proposal_session, task_node):
        now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        # Stage 15 mutations (the default limit)
        for i in range(15):
            client_id = uuid4()
            new_start = (now + timedelta(days=i + 1)).isoformat()
            new_end = (now + timedelta(days=i + 2)).isoformat()
            stage_agent_action(
                db=db_session,
                session_id=proposal_session.id,
                node_id=task_node.id,
                action_type="NODE_SHIFT",
                forward_patch={"planned_start_date": new_start, "planned_end_date": new_end},
                client_mutation_id=client_id,
            )

        # The 16th mutation should be rejected
        client_id = uuid4()
        with pytest.raises(ValueError) as exc_info:
            stage_agent_action(
                db=db_session,
                session_id=proposal_session.id,
                node_id=task_node.id,
                action_type="NODE_SHIFT",
                forward_patch={
                    "planned_start_date": (now + timedelta(days=16)).isoformat(),
                    "planned_end_date": (now + timedelta(days=17)).isoformat(),
                },
                client_mutation_id=client_id,
            )

        assert "Session limit reached" in str(exc_info.value)
        assert "Conclude session" in str(exc_info.value)

    def test_slip_day_ceiling_check(self, db_session, proposal_session):
        # Manually set cumulative_slip_days near the limit
        proposal_session.cumulative_slip_days = 55
        db_session.flush()

        # A proposed slip of 10 days should exceed the 60-day ceiling
        with pytest.raises(ValueError) as exc_info:
            _check_session_throttling(db_session, proposal_session.id, proposed_slip_days=10)

        assert "Schedule slip ceiling exceeded" in str(exc_info.value)

    def test_slip_day_within_limit(self, db_session, proposal_session):
        proposal_session.cumulative_slip_days = 10
        db_session.flush()

        # 20 days slip should be fine (10 + 20 = 30 < 60)
        _check_session_throttling(db_session, proposal_session.id, proposed_slip_days=20)


# ============================================================================
# Tests: Selective commit
# ============================================================================

class TestSelectiveCommit:
    """Verify cherry-pick individual mutations."""

    def test_selective_commits_only_approved(self, db_session, proposal_session, task_node, reviewer_user):
        now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

        # Stage two mutations and flush so IDs are assigned
        client_id_1 = uuid4()
        client_id_2 = uuid4()

        mutation1 = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="NODE_SHIFT",
            forward_patch={
                "planned_start_date": (now + timedelta(days=5)).isoformat(),
                "planned_end_date": (now + timedelta(days=15)).isoformat(),
            },
            client_mutation_id=client_id_1,
        )

        mutation2 = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="PROGRESS_SET",
            forward_patch={"percent_complete": 50.0},
            client_mutation_id=client_id_2,
        )

        # Flush mutations so they get IDs for selective commit
        db_session.flush()

        # Commit only mutation1
        result = commit_selective_proposal_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
            approved_mutation_ids=[mutation1.id],
        )

        assert result["status"] == AgentProposalStatus.PARTIALLY_COMMITTED.value
        assert result["committed_mutations"] == 1
        assert result["discarded_mutations"] == 1

    def test_selective_commit_updates_session_status(self, db_session, proposal_session, task_node, reviewer_user):
        now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        client_id = uuid4()

        mutation = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="NODE_SHIFT",
            forward_patch={
                "planned_start_date": (now + timedelta(days=5)).isoformat(),
                "planned_end_date": (now + timedelta(days=15)).isoformat(),
            },
            client_mutation_id=client_id,
        )

        commit_selective_proposal_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
            approved_mutation_ids=[mutation.id],
        )

        assert proposal_session.status == AgentProposalStatus.PARTIALLY_COMMITTED

    def test_selective_commit_rejects_non_pending(self, db_session, proposal_session, reviewer_user):
        proposal_session.status = AgentProposalStatus.ACCEPTED_COMMITTED
        db_session.flush()

        with pytest.raises(ValueError) as exc_info:
            commit_selective_proposal_session(
                db=db_session,
                session_id=proposal_session.id,
                reviewer_user_id=reviewer_user.id,
                approved_mutation_ids=[],
            )

        assert "can only commit PENDING_REVIEW" in str(exc_info.value)

    def test_selective_commit_marks_committed_flag(self, db_session, proposal_session, task_node, reviewer_user):
        now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        client_id_1 = uuid4()
        client_id_2 = uuid4()

        mutation1 = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="NODE_SHIFT",
            forward_patch={
                "planned_start_date": (now + timedelta(days=5)).isoformat(),
                "planned_end_date": (now + timedelta(days=15)).isoformat(),
            },
            client_mutation_id=client_id_1,
        )

        mutation2 = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="PROGRESS_SET",
            forward_patch={"percent_complete": 50.0},
            client_mutation_id=client_id_2,
        )

        # Flush so mutations get IDs
        db_session.flush()

        commit_selective_proposal_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
            approved_mutation_ids=[mutation1.id],
        )

        assert mutation1.committed is True
        assert mutation2.committed is False


# ============================================================================
# Tests: Idempotency helper
# ============================================================================

class TestIdempotencyHelper:
    """Verify _check_idempotency helper function."""

    def test_check_idempotency_finds_existing(self, db_session, proposal_session, task_node):
        client_id = uuid4()
        now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

        stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="NODE_SHIFT",
            forward_patch={
                "planned_start_date": (now + timedelta(days=5)).isoformat(),
                "planned_end_date": (now + timedelta(days=15)).isoformat(),
            },
            client_mutation_id=client_id,
        )

        cached = _check_idempotency(db_session, proposal_session.id, client_id)
        assert cached is not None
        assert cached.client_mutation_id == client_id

    def test_check_idempotency_returns_none_for_missing(self, db_session, proposal_session):
        client_id = uuid4()
        cached = _check_idempotency(db_session, proposal_session.id, client_id)
        assert cached is None
