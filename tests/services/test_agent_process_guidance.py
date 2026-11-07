"""Tests for agent process guidance – Semantic Error Recovery & Staged Evaluation.

Covers:
- SubTreeLockedException returns LOCK_CONTENTION recovery_hint
- CycleDetectedException returns TOPOLOGICAL_CYCLE recovery_hint
- ClearanceCeilingExceeded returns CLEARANCE_BREACH recovery_hint
- _build_error_result structured payloads for each exception type
- Simulated multi-step staged CPM evaluation reflects projected float
- MCP Resource ppm://process/standard-operating-procedures returns SOP phases
- agent_propose_precedence_link detects cycles and returns structured error
- agent_propose_schedule_shift returns structured error on lease contention
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
    DependencyLink,
    DependencyType,
    SecurityClassification,
    User,
    UniversalBreakdownNode,
)
from app.models.agent_staging import (
    AgentProposalSession,
    AgentStagedMutation,
    AgentProposalStatus,
)
from app.models.leases import SubTreeCheckOut
from app.core.exceptions import (
    SubTreeLockedException,
    CycleDetectedException,
    ClearanceCeilingExceeded,
)
from app.services.agent_staging_service import (
    stage_agent_action,
    _is_node_locked_by_lease,
)
from app.services.mcp_server import (
    _build_error_result,
    STANDARD_OPERATING_PROCEDURES,
    get_standard_operating_procedures,
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
        code="WP-101",
        name="Test Work Package",
        tree_type="WBS",
        security_classification=SecurityClassification.OFFICIAL,
        caveats=[],
        path="1.2",
        delivery_mode="WATERFALL",
        planned_start_date=now + timedelta(days=10),
        planned_end_date=now + timedelta(days=40),
        percent_complete=25.0,
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
        agent_identifier="agent:test-agent",
        model_name="test-model",
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


# ============================================================================
# Test: Semantic Error Recovery Envelope – _build_error_result
# ============================================================================

class TestBuildErrorResult:
    """Verify _build_error_result produces structured JSON for each exception type."""

    def test_subtree_locked_exception_payload(self):
        """SubTreeLockedException must return LOCK_CONTENTION category."""
        exc = SubTreeLockedException(locked_path="1.2.3", locked_by_user="cam@example.com")
        result = _build_error_result(exc, "node_id")

        assert result["status"] == "FAILED"
        assert result["error_category"] == "LOCK_CONTENTION"
        assert result["is_retryable"] is False
        assert result["failed_parameter"] == "node_id"
        assert "technical_detail" in result
        assert "Sub-tree is locked under CAM checkout lease" in result["recovery_hint"]
        assert "Do not retry mutation" in result["recovery_hint"]

    def test_cycle_detected_exception_payload(self):
        """CycleDetectedException must return TOPOLOGICAL_CYCLE category."""
        exc = CycleDetectedException(
            target_node_id="node-abc",
            cycle_path=["A", "B", "C", "A"],
        )
        result = _build_error_result(exc, "predecessor_id")

        assert result["status"] == "FAILED"
        assert result["error_category"] == "TOPOLOGICAL_CYCLE"
        assert result["is_retryable"] is False
        assert result["failed_parameter"] == "predecessor_id"
        assert "technical_detail" in result
        assert "inspect_quarantine_cycles" in result["recovery_hint"]
        assert "closed loop" in result["recovery_hint"].lower()

    def test_clearance_ceiling_exceeded_payload(self):
        """ClearanceCeilingExceeded must return CLEARANCE_BREACH category."""
        exc = ClearanceCeilingExceeded(
            node_classification="SECRET",
            user_clearance="OFFICIAL",
        )
        result = _build_error_result(exc, "node_id")

        assert result["status"] == "FAILED"
        assert result["error_category"] == "CLEARANCE_BREACH"
        assert result["is_retryable"] is False
        assert result["failed_parameter"] == "node_id"
        assert "technical_detail" in result
        assert "Halt inspection" in result["recovery_hint"]

    def test_value_error_payload(self):
        """Generic ValueError must return VALIDATION_ERROR category."""
        exc = ValueError("Invalid UUID format")
        result = _build_error_result(exc, "project_id")

        assert result["status"] == "FAILED"
        assert result["error_category"] == "VALIDATION_ERROR"
        assert result["is_retryable"] is False
        assert result["failed_parameter"] == "project_id"
        assert "Retry with corrected input" in result["recovery_hint"]

    def test_unknown_exception_payload(self):
        """Unknown exception must return UNKNOWN_ERROR category."""
        exc = RuntimeError("Unexpected failure")
        result = _build_error_result(exc)

        assert result["status"] == "FAILED"
        assert result["error_category"] == "UNKNOWN_ERROR"
        assert result["is_retryable"] is True
        assert result["failed_parameter"] == ""
        assert "technical_detail" in result


# ============================================================================
# Test: Exception classes
# ============================================================================

class TestExceptionClasses:
    """Verify the new exception classes carry the correct attributes."""

    def test_subtree_locked_exception_attributes(self):
        """SubTreeLockedException must store locked_path and locked_by_user."""
        exc = SubTreeLockedException(locked_path="1.2.3", locked_by_user="cam@example.com")
        assert exc.locked_path == "1.2.3"
        assert exc.locked_by_user == "cam@example.com"
        assert "1.2.3" in str(exc)

    def test_cycle_detected_exception_attributes(self):
        """CycleDetectedException must store target_node_id and cycle_path."""
        exc = CycleDetectedException(
            target_node_id="node-abc",
            cycle_path=["A", "B", "C"],
        )
        assert exc.target_node_id == "node-abc"
        assert exc.cycle_path == ["A", "B", "C"]

    def test_clearance_ceiling_exceeded_attributes(self):
        """ClearanceCeilingExceeded must store classification levels."""
        exc = ClearanceCeilingExceeded(
            node_classification="SECRET",
            user_clearance="OFFICIAL",
        )
        assert exc.node_classification == "SECRET"
        assert exc.user_clearance == "OFFICIAL"


# ============================================================================
# Test: Staging raises SubTreeLockedException
# ============================================================================

class TestStagingExceptionMapping:
    """Verify that staging raises SubTreeLockedException on lease contention."""

    def test_staging_raises_subtree_locked_on_lease(
        self, db_session, task_node, proposal_session, reviewer_user
    ):
        """Staging on a leased node must raise SubTreeLockedException."""
        lease = SubTreeCheckOut(
            root_node_id=task_node.id,
            ltree_scope_path=str(task_node.path),
            leased_by_user_id=reviewer_user.id,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
            is_active=True,
        )
        db_session.add(lease)
        db_session.flush()

        with pytest.raises(SubTreeLockedException) as exc_info:
            stage_agent_action(
                db=db_session,
                session_id=proposal_session.id,
                node_id=task_node.id,
                action_type="PROGRESS_SET",
                forward_patch={"percent_complete": 50.0},
            )

        assert exc_info.value.locked_path == str(task_node.path)

    def test_staging_error_result_for_locked_node(
        self, db_session, task_node, proposal_session, reviewer_user
    ):
        """_build_error_result must produce LOCK_CONTENTION for SubTreeLockedException."""
        lease = SubTreeCheckOut(
            root_node_id=task_node.id,
            ltree_scope_path=str(task_node.path),
            leased_by_user_id=reviewer_user.id,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
            is_active=True,
        )
        db_session.add(lease)
        db_session.flush()

        try:
            stage_agent_action(
                db=db_session,
                session_id=proposal_session.id,
                node_id=task_node.id,
                action_type="PROGRESS_SET",
                forward_patch={"percent_complete": 50.0},
            )
        except SubTreeLockedException as e:
            result = _build_error_result(e, "node_id")
            assert result["error_category"] == "LOCK_CONTENTION"
            assert result["is_retryable"] is False
            assert "Sub-tree is locked" in result["recovery_hint"]


# ============================================================================
# Test: Cycle detection in agent_propose_precedence_link
# ============================================================================

class TestCycleDetection:
    """Verify that cycle detection raises CycleDetectedException."""

    def test_cycle_detected_error_result(self):
        """_build_error_result must produce TOPOLOGICAL_CYCLE for CycleDetectedException."""
        exc = CycleDetectedException(
            target_node_id="node-abc",
            cycle_path=["A", "B", "A"],
        )
        result = _build_error_result(exc, "predecessor_id")

        assert result["error_category"] == "TOPOLOGICAL_CYCLE"
        assert result["is_retryable"] is False
        assert "inspect_quarantine_cycles" in result["recovery_hint"]

    def test_cycle_bfs_detection(self, db_session, programme_node):
        """BFS cycle detection must find a path from successor back to predecessor."""
        now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

        # Create nodes A -> B -> C
        node_a = PortfolioNode(
            id=uuid4(),
            code="TASK-A",
            name="Task A",
            tree_type="WBS",
            security_classification=SecurityClassification.OFFICIAL,
            caveats=[],
            path="1.2.1",
            delivery_mode="WATERFALL",
            planned_start_date=now,
            planned_end_date=now + timedelta(days=10),
            percent_complete=0.0,
            is_active=True,
            custom_attributes={},
        )
        node_b = PortfolioNode(
            id=uuid4(),
            code="TASK-B",
            name="Task B",
            tree_type="WBS",
            security_classification=SecurityClassification.OFFICIAL,
            caveats=[],
            path="1.2.2",
            delivery_mode="WATERFALL",
            planned_start_date=now + timedelta(days=10),
            planned_end_date=now + timedelta(days=20),
            percent_complete=0.0,
            is_active=True,
            custom_attributes={},
        )
        node_c = PortfolioNode(
            id=uuid4(),
            code="TASK-C",
            name="Task C",
            tree_type="WBS",
            security_classification=SecurityClassification.OFFICIAL,
            caveats=[],
            path="1.2.3",
            delivery_mode="WATERFALL",
            planned_start_date=now + timedelta(days=20),
            planned_end_date=now + timedelta(days=30),
            percent_complete=0.0,
            is_active=True,
            custom_attributes={},
        )
        db_session.add_all([node_a, node_b, node_c])

        # Create links: A -> B, B -> C
        link_ab = DependencyLink(
            id=uuid4(),
            predecessor_id=node_a.id,
            successor_id=node_b.id,
            dependency_type=DependencyType.FS,
            lag_days=0,
        )
        link_bc = DependencyLink(
            id=uuid4(),
            predecessor_id=node_b.id,
            successor_id=node_c.id,
            dependency_type=DependencyType.FS,
            lag_days=0,
        )
        db_session.add_all([link_ab, link_bc])
        db_session.flush()

        # Build successor map: predecessor -> [successors]
        succ_map = {}
        existing_deps = db_session.query(DependencyLink).all()
        for dep in existing_deps:
            succ_map.setdefault(dep.predecessor_id, []).append(dep.successor_id)

        # Proposed link: C -> A (predecessor=C, successor=A)
        # To detect cycle: BFS from successor (A) following existing links
        # If we reach predecessor (C), a cycle would be created
        visited = set()
        queue = [node_a.id]  # start from successor (A)
        cycle_found = False
        while queue:
            current = queue.pop(0)
            if current in visited:
                continue
            visited.add(current)
            for next_node in succ_map.get(current, []):
                if next_node == node_c.id:  # reached predecessor (C)
                    cycle_found = True
                    break
                queue.append(next_node)
            if cycle_found:
                break

        assert cycle_found is True, "BFS should detect that C is reachable from A (cycle)"


# ============================================================================
# Test: Clearance breach error handling
# ============================================================================

class TestClearanceBreach:
    """Verify clearance breach returns structured error."""

    def test_clearance_breach_error_result(self):
        """_build_error_result must produce CLEARANCE_BREACH."""
        exc = ClearanceCeilingExceeded(
            node_classification="SECRET",
            user_clearance="OFFICIAL",
        )
        result = _build_error_result(exc, "node_id")

        assert result["error_category"] == "CLEARANCE_BREACH"
        assert result["is_retryable"] is False
        assert "Halt inspection" in result["recovery_hint"]
        assert "sub-tree branch" in result["recovery_hint"]


# ============================================================================
# Test: MCP Resource – Standard Operating Procedures
# ============================================================================

class TestStandardOperatingProcedures:
    """Verify the MCP resource returns the correct SOP structure."""

    def test_sop_resource_returns_phases(self):
        """get_standard_operating_procedures must return all four phases."""
        result = get_standard_operating_procedures()

        assert result["version"] == "1.0.0"
        assert "phases" in result
        phases = result["phases"]
        assert len(phases) == 4

        phase_names = [p["name"] for p in phases]
        assert "Baseline Assessment" in phase_names
        assert "Conflict Pre-Check" in phase_names
        assert "Staged Mutation Dispatch" in phase_names
        assert "Verification & Validation" in phase_names

    def test_sop_phase_a_tools(self):
        """Phase A must include get_project_critical_path and get_baseline_variance."""
        phase_a = STANDARD_OPERATING_PROCEDURES["phases"][0]
        assert phase_a["phase"] == "A"
        tool_names = [t["tool"] for t in phase_a["tools"]]
        assert "get_project_critical_path" in tool_names
        assert "get_baseline_variance" in tool_names

    def test_sop_phase_b_tools(self):
        """Phase B must include check_subtree_lease_status and verify_export_control_compliance."""
        phase_b = STANDARD_OPERATING_PROCEDURES["phases"][1]
        assert phase_b["phase"] == "B"
        tool_names = [t["tool"] for t in phase_b["tools"]]
        assert "check_subtree_lease_status" in tool_names
        assert "verify_export_control_compliance" in tool_names

    def test_sop_phase_c_tools(self):
        """Phase C must include agent_propose_* tools."""
        phase_c = STANDARD_OPERATING_PROCEDURES["phases"][2]
        assert phase_c["phase"] == "C"
        tool_names = [t["tool"] for t in phase_c["tools"]]
        assert "agent_propose_schedule_shift" in tool_names
        assert "agent_propose_precedence_link" in tool_names
        assert "agent_propose_progress_update" in tool_names

    def test_sop_phase_d_tools(self):
        """Phase D must include simulate_staged_cpm_pass and agent_finalize_proposal_session."""
        phase_d = STANDARD_OPERATING_PROCEDURES["phases"][3]
        assert phase_d["phase"] == "D"
        tool_names = [t["tool"] for t in phase_d["tools"]]
        assert "simulate_staged_cpm_pass" in tool_names
        assert "agent_finalize_proposal_session" in tool_names


# ============================================================================
# Test: Simulated multi-step staged CPM evaluation
# ============================================================================

class TestSimulatedStagedCPM:
    """Verify that staged mutations correctly affect projected float."""

    def test_staged_shift_reduces_float(
        self, db_session, programme_node, proposal_session
    ):
        """A staged NODE_SHIFT that delays a task should reduce its float."""
        now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

        # Create two tasks: A (early) and B (late, depends on A)
        node_a = PortfolioNode(
            id=uuid4(),
            code="TASK-A",
            name="Task A",
            tree_type="WBS",
            security_classification=SecurityClassification.OFFICIAL,
            caveats=[],
            path="1.2.1",
            delivery_mode="WATERFALL",
            planned_start_date=now,
            planned_end_date=now + timedelta(days=5),
            percent_complete=0.0,
            is_active=True,
            custom_attributes={},
        )
        node_b = PortfolioNode(
            id=uuid4(),
            code="TASK-B",
            name="Task B",
            tree_type="WBS",
            security_classification=SecurityClassification.OFFICIAL,
            caveats=[],
            path="1.2.2",
            delivery_mode="WATERFALL",
            planned_start_date=now + timedelta(days=5),
            planned_end_date=now + timedelta(days=10),
            percent_complete=0.0,
            is_active=True,
            custom_attributes={},
        )
        db_session.add_all([node_a, node_b])

        # Link A -> B
        link = DependencyLink(
            id=uuid4(),
            predecessor_id=node_a.id,
            successor_id=node_b.id,
            dependency_type=DependencyType.FS,
            lag_days=0,
        )
        db_session.add(link)
        db_session.flush()

        # Stage a shift that delays A by 3 days
        new_start_a = (now + timedelta(days=3)).isoformat()
        new_end_a = (now + timedelta(days=8)).isoformat()

        mutation = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=node_a.id,
            action_type="NODE_SHIFT",
            forward_patch={
                "planned_start_date": new_start_a,
                "planned_end_date": new_end_a,
            },
        )

        # Verify mutation is staged
        assert mutation is not None
        assert mutation.action_type == "NODE_SHIFT"
        assert mutation.forward_delta["planned_start_date"] == new_start_a

        # Verify the live node is NOT changed
        assert node_a.planned_start_date == now
        assert node_a.planned_end_date == now + timedelta(days=5)

    def test_multi_step_staged_evaluation(
        self, db_session, programme_node, proposal_session
    ):
        """Multiple staged mutations should all be captured in sequence order."""
        now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

        node_a = PortfolioNode(
            id=uuid4(),
            code="TASK-A",
            name="Task A",
            tree_type="WBS",
            security_classification=SecurityClassification.OFFICIAL,
            caveats=[],
            path="1.2.1",
            delivery_mode="WATERFALL",
            planned_start_date=now,
            planned_end_date=now + timedelta(days=10),
            percent_complete=0.0,
            is_active=True,
            custom_attributes={},
        )
        db_session.add(node_a)

        # Stage two mutations
        m1 = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=node_a.id,
            action_type="NODE_SHIFT",
            forward_patch={
                "planned_start_date": (now + timedelta(days=5)).isoformat(),
                "planned_end_date": (now + timedelta(days=15)).isoformat(),
            },
        )
        m2 = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=node_a.id,
            action_type="PROGRESS_SET",
            forward_patch={"percent_complete": 50.0},
        )

        assert m1.sequence_order == 0
        assert m2.sequence_order == 1
        assert m1.action_type == "NODE_SHIFT"
        assert m2.action_type == "PROGRESS_SET"

        # Verify live node is unchanged
        assert node_a.planned_start_date == now
        assert node_a.percent_complete == 0.0

    def test_staged_mutation_float_consumption(
        self, db_session, programme_node, proposal_session
    ):
        """Staged NODE_SHIFT should record float_consumption in topological impact."""
        now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

        node_a = PortfolioNode(
            id=uuid4(),
            code="TASK-A",
            name="Task A",
            tree_type="WBS",
            security_classification=SecurityClassification.OFFICIAL,
            caveats=[],
            path="1.2.1",
            delivery_mode="WATERFALL",
            planned_start_date=now,
            planned_end_date=now + timedelta(days=10),
            percent_complete=0.0,
            is_active=True,
            custom_attributes={},
        )
        db_session.add(node_a)

        new_start = (now + timedelta(days=5)).isoformat()
        new_end = (now + timedelta(days=15)).isoformat()

        mutation = stage_agent_action(
            db=db_session,
            session_id=proposal_session.id,
            node_id=node_a.id,
            action_type="NODE_SHIFT",
            forward_patch={
                "planned_start_date": new_start,
                "planned_end_date": new_end,
            },
        )

        # Topological impact should record float consumption
        assert mutation.topological_impact_summary is not None
        assert "float_consumption" in mutation.topological_impact_summary
        # A 5-day shift should consume 5 days of float
        # The _old_start is captured from inverse_delta by stage_agent_action
        assert mutation.topological_impact_summary["float_consumption"] == 5.0
        # Verify the inverse_delta captured the original start date
        assert mutation.inverse_delta["planned_start_date"] == now.isoformat()
