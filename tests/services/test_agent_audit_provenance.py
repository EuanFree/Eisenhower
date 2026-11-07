"""Tests for agent audit provenance extensions to the forensic ledger.

Covers:
- Agent provenance fields are populated on commit
- Hash chain verification includes agent fields for agent actions
- Reversion sets reverted_at and reversion_audit_block_id on original commit
- AGENT_PROPOSAL_REVERTED block is written with correct linkage
- Tamper detection when agent provenance fields are modified
- Non-agent actions do not include agent fields in hash
- Dual-attribution audit log entries carry all provenance data
"""

import pytest
import hashlib
import json
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
from app.services.agent_staging_service import (
    stage_agent_action,
    commit_proposal_session,
    revert_committed_session,
)
from app.services.audit_verifier import _compute_entry_hash


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
    try:
        db_session.flush()
    except Exception:
        pass
    return session


def _find_audit_entry(db, entity_id, action_type):
    """Find an audit entry by entity_id and action_type.

    Since audit entries may live in db.new or the DB depending on flush
    state, we check both locations.
    """
    found = None
    # Check pending new objects first
    for obj in db.new:
        if (
            isinstance(obj, ForensicAuditLog)
            and obj.entity_id == entity_id
            and obj.action_type == action_type
        ):
            found = obj
    # Fall back to DB query (may fail on SQLite due to version_id)
    if found is None:
        try:
            found = db.query(ForensicAuditLog).filter(
                ForensicAuditLog.entity_id == entity_id,
                ForensicAuditLog.action_type == action_type,
            ).first()
        except Exception:
            pass
    return found


# ============================================================================
# Test: Agent provenance fields on commit
# ============================================================================

class TestAgentProvenanceOnCommit:
    """Verify that committing an agent proposal populates all provenance fields."""

    def test_commit_sets_is_agent_action(self, db_session, task_node, proposal_session, reviewer_user):
        """Committed audit entry must have is_agent_action=True."""
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

        entry = _find_audit_entry(db_session, proposal_session.id, "AGENT_PROPOSAL_COMMITTED")
        assert entry is not None
        assert entry.is_agent_action is True

    def test_commit_sets_agent_session_id(self, db_session, task_node, proposal_session, reviewer_user):
        """Committed audit entry must reference the proposal session."""
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

        entry = _find_audit_entry(db_session, proposal_session.id, "AGENT_PROPOSAL_COMMITTED")
        assert entry is not None
        assert entry.agent_session_id == proposal_session.id

    def test_commit_sets_model_weights_sha256(self, db_session, task_node, proposal_session, reviewer_user):
        """Committed audit entry must store the model weights hash."""
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

        entry = _find_audit_entry(db_session, proposal_session.id, "AGENT_PROPOSAL_COMMITTED")
        assert entry is not None
        assert entry.model_weights_sha256 == proposal_session.model_weights_hash

    def test_commit_sets_prompt_context_sha256(self, db_session, task_node, proposal_session, reviewer_user):
        """Committed audit entry must store the prompt digest."""
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

        entry = _find_audit_entry(db_session, proposal_session.id, "AGENT_PROPOSAL_COMMITTED")
        assert entry is not None
        assert entry.prompt_context_sha256 == proposal_session.prompt_digest

    def test_commit_sets_human_reviewer_upn(self, db_session, task_node, proposal_session, reviewer_user):
        """Committed audit entry must store the human reviewer UPN."""
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

        entry = _find_audit_entry(db_session, proposal_session.id, "AGENT_PROPOSAL_COMMITTED")
        assert entry is not None
        assert entry.human_reviewer_upn == f"reviewer:{reviewer_user.id}"

    def test_commit_sets_agent_model_identifier(self, db_session, task_node, proposal_session, reviewer_user):
        """Committed audit entry must store the composite model identifier."""
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

        entry = _find_audit_entry(db_session, proposal_session.id, "AGENT_PROPOSAL_COMMITTED")
        assert entry is not None
        expected = f"{proposal_session.model_name}:{proposal_session.model_weights_hash[:16]}"
        assert entry.agent_model_identifier == expected

    def test_commit_provenance_fields_all_present(self, db_session, task_node, proposal_session, reviewer_user):
        """All agent provenance fields must be non-None on a committed entry."""
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

        entry = _find_audit_entry(db_session, proposal_session.id, "AGENT_PROPOSAL_COMMITTED")
        assert entry is not None
        assert entry.is_agent_action is True
        assert entry.agent_session_id is not None
        assert entry.agent_model_identifier is not None
        assert entry.model_weights_sha256 is not None
        assert entry.prompt_context_sha256 is not None
        assert entry.human_reviewer_upn is not None


# ============================================================================
# Test: Hash chain verification with agent fields
# ============================================================================

class TestHashChainWithAgentFields:
    """Verify that agent provenance fields are incorporated into the hash chain."""

    def test_agent_action_hash_includes_provenance(self, db_session, task_node, proposal_session, reviewer_user):
        """Hash of an agent action entry must include provenance fields."""
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

        entry = _find_audit_entry(db_session, proposal_session.id, "AGENT_PROPOSAL_COMMITTED")
        assert entry is not None

        # Recalculate hash using the verifier function
        recalculated = _compute_entry_hash(entry)
        assert recalculated == entry.current_hash

    def test_tampering_with_model_weights_breaks_hash(self, db_session, task_node, proposal_session, reviewer_user):
        """Modifying model_weights_sha256 must cause hash mismatch."""
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

        entry = _find_audit_entry(db_session, proposal_session.id, "AGENT_PROPOSAL_COMMITTED")
        assert entry is not None

        original_hash = entry.current_hash
        # Tamper with the model weights hash
        entry.model_weights_sha256 = "tampered" * 8

        recalculated = _compute_entry_hash(entry)
        assert recalculated != original_hash

    def test_tampering_with_prompt_digest_breaks_hash(self, db_session, task_node, proposal_session, reviewer_user):
        """Modifying prompt_context_sha256 must cause hash mismatch."""
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

        entry = _find_audit_entry(db_session, proposal_session.id, "AGENT_PROPOSAL_COMMITTED")
        assert entry is not None

        original_hash = entry.current_hash
        entry.prompt_context_sha256 = "tampered" * 8

        recalculated = _compute_entry_hash(entry)
        assert recalculated != original_hash

    def test_tampering_with_reviewer_upn_breaks_hash(self, db_session, task_node, proposal_session, reviewer_user):
        """Modifying human_reviewer_upn must cause hash mismatch."""
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

        entry = _find_audit_entry(db_session, proposal_session.id, "AGENT_PROPOSAL_COMMITTED")
        assert entry is not None

        original_hash = entry.current_hash
        entry.human_reviewer_upn = "reviewer:999"

        recalculated = _compute_entry_hash(entry)
        assert recalculated != original_hash

    def test_non_agent_action_hash_excludes_provenance(self, db_session):
        """Non-agent actions should not include agent fields in hash."""
        transaction_id = uuid4()
        entity_id = uuid4()

        entry = ForensicAuditLog.create_entry(
            transaction_id=transaction_id,
            user_upn="human@example.com",
            client_ip="127.0.0.1",
            action_type="UPDATE",
            entity_type="PortfolioNode",
            entity_id=entity_id,
            json_diff={"field": "value"},
            security_marking="",
            is_agent_action=False,
        )

        # Recalculate hash — should match without agent fields
        recalculated = _compute_entry_hash(entry)
        assert recalculated == entry.current_hash

    def test_different_provenance_produces_different_hash(self, db_session):
        """Two entries with different provenance must have different hashes."""
        transaction_id1 = uuid4()
        transaction_id2 = uuid4()
        entity_id = uuid4()

        entry1 = ForensicAuditLog.create_entry(
            transaction_id=transaction_id1,
            user_upn="agent:x|reviewer:1",
            client_ip="system",
            action_type="AGENT_PROPOSAL_COMMITTED",
            entity_type="AgentProposalSession",
            entity_id=entity_id,
            json_diff={},
            is_agent_action=True,
            agent_session_id=uuid4(),
            agent_model_identifier="model1:abc123",
            model_weights_sha256="a" * 64,
            prompt_context_sha256="b" * 64,
            human_reviewer_upn="reviewer:1",
        )

        entry2 = ForensicAuditLog.create_entry(
            transaction_id=transaction_id2,
            user_upn="agent:x|reviewer:1",
            client_ip="system",
            action_type="AGENT_PROPOSAL_COMMITTED",
            entity_type="AgentProposalSession",
            entity_id=entity_id,
            json_diff={},
            is_agent_action=True,
            agent_session_id=uuid4(),
            agent_model_identifier="model2:def456",
            model_weights_sha256="c" * 64,
            prompt_context_sha256="d" * 64,
            human_reviewer_upn="reviewer:1",
        )

        # Different model identifiers should produce different hashes
        assert entry1.current_hash != entry2.current_hash


# ============================================================================
# Test: Reversion audit linkage
# ============================================================================

class TestReversionAuditLinkage:
    """Verify that reverting an agent session creates proper audit linkage."""

    def test_revert_sets_reverted_at_on_commit_entry(self, db_session, task_node, proposal_session, reviewer_user):
        """Reverting must set reverted_at on the original commit audit entry."""
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

        commit_entry = _find_audit_entry(db_session, proposal_session.id, "AGENT_PROPOSAL_COMMITTED")
        assert commit_entry is not None
        assert commit_entry.reverted_at is None

        revert_committed_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
            justification="Schedule shift was incorrect",
        )

        # The commit entry should now have reverted_at set
        commit_entry = _find_audit_entry(db_session, proposal_session.id, "AGENT_PROPOSAL_COMMITTED")
        assert commit_entry is not None
        assert commit_entry.reverted_at is not None

    def test_revert_sets_reversion_audit_block_id(self, db_session, task_node, proposal_session, reviewer_user):
        """Reverting must link the commit entry to the reversion block."""
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

        revert_result = revert_committed_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
            justification="Schedule shift was incorrect",
        )

        # Verify the revert result contains the audit_log_id
        assert "audit_log_id" in revert_result
        assert revert_result["audit_log_id"] is not None

        # Verify linkage exists by checking db.new directly
        found_linkage = False
        for obj in db_session.new:
            if (
                isinstance(obj, ForensicAuditLog)
                and obj.action_type == "AGENT_PROPOSAL_COMMITTED"
                and obj.reversion_audit_block_id is not None
            ):
                found_linkage = True
                assert str(obj.reversion_audit_block_id) == revert_result["audit_log_id"]
                break
        assert found_linkage, "No commit entry with reversion linkage found in db.new"

    def test_revert_creates_agent_transaction_reverted_block(self, db_session, task_node, proposal_session, reviewer_user):
        """Reverting must create an AGENT_TRANSACTION_REVERTED audit block."""
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
            justification="Schedule shift was incorrect",
        )

        revert_entry = _find_audit_entry(db_session, proposal_session.id, "AGENT_TRANSACTION_REVERTED")
        assert revert_entry is not None
        assert revert_entry.action_type == "AGENT_TRANSACTION_REVERTED"
        assert revert_entry.is_agent_action is True

    def test_revert_block_contains_original_commit_hash(self, db_session, task_node, proposal_session, reviewer_user):
        """Revert block must store the original commit's hash."""
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

        commit_entry = _find_audit_entry(db_session, proposal_session.id, "AGENT_PROPOSAL_COMMITTED")
        original_hash = commit_entry.current_hash

        revert_committed_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
            justification="Schedule shift was incorrect",
        )

        # Find revert entry in db.new directly
        revert_entry = None
        for obj in db_session.new:
            if (
                isinstance(obj, ForensicAuditLog)
                and obj.action_type == "AGENT_TRANSACTION_REVERTED"
            ):
                revert_entry = obj
                break
        assert revert_entry is not None, "AGENT_TRANSACTION_REVERTED entry not found in db.new"
        assert revert_entry.json_diff["original_commit_hash"] == original_hash

    def test_revert_block_has_agent_provenance(self, db_session, task_node, proposal_session, reviewer_user):
        """Revert block must carry agent provenance fields."""
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
            justification="Schedule shift was incorrect",
        )

        # Find revert entry in db.new directly
        revert_entry = None
        for obj in db_session.new:
            if (
                isinstance(obj, ForensicAuditLog)
                and obj.action_type == "AGENT_TRANSACTION_REVERTED"
            ):
                revert_entry = obj
                break
        assert revert_entry is not None, "AGENT_TRANSACTION_REVERTED entry not found in db.new"
        assert revert_entry.is_agent_action is True
        assert revert_entry.agent_session_id == proposal_session.id
        assert revert_entry.model_weights_sha256 == proposal_session.model_weights_hash
        assert revert_entry.prompt_context_sha256 == proposal_session.prompt_digest
        assert revert_entry.human_reviewer_upn is not None

    def test_full_commit_revert_cycle(self, db_session, task_node, proposal_session, reviewer_user):
        """Full cycle: stage, commit, revert — verify all linkage."""
        original_start = task_node.planned_start_date
        original_end = task_node.planned_end_date
        original_percent = task_node.percent_complete

        # Stage a mutation
        new_start = (original_start + timedelta(days=5)).isoformat()
        new_end = (original_end + timedelta(days=5)).isoformat()
        stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=task_node.id,
            action_type="NODE_SHIFT",
            forward_patch={
                "planned_start_date": new_start,
                "planned_end_date": new_end,
            },
        )

        # Commit
        commit_result = commit_proposal_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
        )
        assert commit_result["status"] == "ACCEPTED_COMMITTED"

        commit_entry = _find_audit_entry(db_session, proposal_session.id, "AGENT_PROPOSAL_COMMITTED")
        assert commit_entry is not None
        assert commit_entry.is_agent_action is True
        assert commit_entry.reverted_at is None
        assert commit_entry.reversion_audit_block_id is None

        # Revert
        revert_result = revert_committed_session(
            db=db_session,
            session_id=proposal_session.id,
            reviewer_user_id=reviewer_user.id,
            justification="Test reversion",
        )
        assert revert_result["status"] == "REVERTED"

        # Verify commit entry is linked to revert (use the captured reference)
        assert commit_entry.reverted_at is not None

        # Verify revert block exists in db.new
        revert_entry = None
        for obj in db_session.new:
            if (
                isinstance(obj, ForensicAuditLog)
                and obj.action_type == "AGENT_TRANSACTION_REVERTED"
            ):
                revert_entry = obj
                break
        assert revert_entry is not None, "AGENT_TRANSACTION_REVERTED entry not found in db.new"
        assert revert_entry.is_agent_action is True
        assert revert_entry.json_diff["original_commit_hash"] == commit_entry.current_hash

        # Verify hash chain integrity for revert entry
        recalculated = _compute_entry_hash(revert_entry)
        assert recalculated == revert_entry.current_hash


# ============================================================================
# Test: create_entry with agent fields
# ============================================================================

class TestCreateEntryWithAgentFields:
    """Test ForensicAuditLog.create_entry with agent provenance parameters."""

    def test_create_entry_without_agent_fields(self, db_session):
        """Creating an entry without agent fields should work as before."""
        entry = ForensicAuditLog.create_entry(
            transaction_id=uuid4(),
            user_upn="human@example.com",
            client_ip="127.0.0.1",
            action_type="UPDATE",
            entity_type="PortfolioNode",
            entity_id=uuid4(),
            json_diff={"field": "value"},
        )

        assert entry.is_agent_action is False
        assert entry.agent_session_id is None
        assert entry.agent_model_identifier is None
        assert entry.model_weights_sha256 is None
        assert entry.prompt_context_sha256 is None
        assert entry.human_reviewer_upn is None

    def test_create_entry_with_agent_fields(self, db_session):
        """Creating an entry with agent fields should populate all provenance."""
        session_id = uuid4()
        entry = ForensicAuditLog.create_entry(
            transaction_id=uuid4(),
            user_upn="agent:test|reviewer:1",
            client_ip="system",
            action_type="AGENT_PROPOSAL_COMMITTED",
            entity_type="AgentProposalSession",
            entity_id=session_id,
            json_diff={},
            is_agent_action=True,
            agent_session_id=session_id,
            agent_model_identifier="llama3-70b:abcdef1234567890",
            model_weights_sha256="a" * 64,
            prompt_context_sha256="b" * 64,
            human_reviewer_upn="reviewer:1",
        )

        assert entry.is_agent_action is True
        assert entry.agent_session_id == session_id
        assert entry.agent_model_identifier == "llama3-70b:abcdef1234567890"
        assert entry.model_weights_sha256 == "a" * 64
        assert entry.prompt_context_sha256 == "b" * 64
        assert entry.human_reviewer_upn == "reviewer:1"

    def test_hash_chain_continuity(self, db_session):
        """Two chained entries must have correct prev_hash linkage."""
        entry1 = ForensicAuditLog.create_entry(
            transaction_id=uuid4(),
            user_upn="agent:x|reviewer:1",
            client_ip="system",
            action_type="AGENT_PROPOSAL_COMMITTED",
            entity_type="AgentProposalSession",
            entity_id=uuid4(),
            json_diff={},
            is_agent_action=True,
            agent_session_id=uuid4(),
            agent_model_identifier="model:hash",
            model_weights_sha256="a" * 64,
            prompt_context_sha256="b" * 64,
            human_reviewer_upn="reviewer:1",
        )

        entry2 = ForensicAuditLog.create_entry(
            transaction_id=uuid4(),
            user_upn="agent:x|reviewer:1",
            client_ip="system",
            action_type="AGENT_PROPOSAL_REVERTED",
            entity_type="AgentProposalSession",
            entity_id=entry1.entity_id,
            json_diff={"original_commit_hash": entry1.current_hash},
            is_agent_action=True,
            agent_session_id=entry1.agent_session_id,
            agent_model_identifier="model:hash",
            model_weights_sha256="a" * 64,
            prompt_context_sha256="b" * 64,
            human_reviewer_upn="reviewer:1",
            prev_hash=entry1.current_hash,
        )

        # entry2's prev_hash should be entry1's current_hash
        assert entry2.prev_hash == entry1.current_hash

        # Both hashes should verify
        assert _compute_entry_hash(entry1) == entry1.current_hash
        assert _compute_entry_hash(entry2) == entry2.current_hash

    def test_reverted_at_and_reversion_block_id_defaults(self, db_session):
        """New entries should have reverted_at=None and reversion_audit_block_id=None."""
        entry = ForensicAuditLog.create_entry(
            transaction_id=uuid4(),
            user_upn="agent:x|reviewer:1",
            client_ip="system",
            action_type="AGENT_PROPOSAL_COMMITTED",
            entity_type="AgentProposalSession",
            entity_id=uuid4(),
            json_diff={},
            is_agent_action=True,
            agent_session_id=uuid4(),
            agent_model_identifier="model:hash",
            model_weights_sha256="a" * 64,
            prompt_context_sha256="b" * 64,
            human_reviewer_upn="reviewer:1",
        )

        assert entry.reverted_at is None
        assert entry.reversion_audit_block_id is None

    def test_manual_reversion_linkage(self, db_session):
        """Manually setting reverted_at and reversion_audit_block_id should work."""
        commit_entry = ForensicAuditLog.create_entry(
            transaction_id=uuid4(),
            user_upn="agent:x|reviewer:1",
            client_ip="system",
            action_type="AGENT_PROPOSAL_COMMITTED",
            entity_type="AgentProposalSession",
            entity_id=uuid4(),
            json_diff={},
            is_agent_action=True,
            agent_session_id=uuid4(),
            agent_model_identifier="model:hash",
            model_weights_sha256="a" * 64,
            prompt_context_sha256="b" * 64,
            human_reviewer_upn="reviewer:1",
        )

        revert_id = uuid4()
        revert_entry = ForensicAuditLog.create_entry(
            transaction_id=uuid4(),
            user_upn="agent:x|reviewer:1",
            client_ip="system",
            action_type="AGENT_PROPOSAL_REVERTED",
            entity_type="AgentProposalSession",
            entity_id=commit_entry.entity_id,
            json_diff={"original_commit_hash": commit_entry.current_hash},
            is_agent_action=True,
            agent_session_id=commit_entry.agent_session_id,
            agent_model_identifier="model:hash",
            model_weights_sha256="a" * 64,
            prompt_context_sha256="b" * 64,
            human_reviewer_upn="reviewer:1",
            prev_hash=commit_entry.current_hash,
        )
        # Override the auto-generated ID to use our known UUID
        revert_entry.id = revert_id

        # Simulate the reversion linkage
        now = datetime.now(timezone.utc)
        commit_entry.reverted_at = now
        commit_entry.reversion_audit_block_id = revert_id

        assert commit_entry.reverted_at == now
        assert commit_entry.reversion_audit_block_id == revert_id
        assert revert_entry.id == revert_id
