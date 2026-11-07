"""Tests for the copilot_actions module.

Covers:
- Pydantic schema validation for all four tool argument types
- Argument boundary guards (delta_days range, percent range, self-loop rejection)
- SQL and shell injection rejection in blocker descriptions
- ToolRegistry dispatch and tool definition generation
- Command reversibility: each executor captures oldValue/newValue pairs
- Integration with llm_provider ToolDefinition format

Note: Tests use an in-memory SQLite database.  The ltree extension is not
required for these tests as they operate directly on PortfolioNode,
DependencyLink, and NodeBlocker models without invoking the CPM engine.
"""

import asyncio
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
    NodeBlocker,
    BlockerCategory,
    BlockerSeverity,
    SecurityClassification,
)
from app.services.copilot_actions import (
    get_tool_registry,
    reset_tool_registry,
    ToolRegistry,
    ShiftTaskDatesArgs,
    CreatePrecedenceLinkArgs,
    UpdateProgressPercentageArgs,
    FlagOperationalBlockerArgs,
    ActionDispatchPayload,
)
from pydantic import ValidationError


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture(autouse=True)
def reset_registry():
    """Reset the singleton tool registry before each test."""
    reset_tool_registry()
    yield
    reset_tool_registry()


@pytest.fixture
def db_session():
    """Create a fresh in-memory SQLite database session.

    Note: Uses autoflush=False to avoid triggering version_id mapper
    conflicts on SQLite when PortfolioNode objects are added.
    """
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
def registry():
    """Return a fresh tool registry."""
    return get_tool_registry()


def _make_node(db, name="Test Task", start_days=0, end_days=30):
    """Create a PortfolioNode for testing.

    Note: PortfolioNode uses version_id_col which conflicts with SQLite
    during flush.  We add the node to the session without committing,
    so it lives only in the identity map.  db.get() will find it there
    before querying the database.  The caller must not trigger a flush
    on PortfolioNode (DependencyLink and NodeBlocker flush fine).
    """
    now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    node = PortfolioNode(
        id=uuid4(),
        code=f"WBS-{name.replace(' ', '-')}",
        name=name,
        tree_type="WBS",
        security_classification=SecurityClassification.OFFICIAL,
        caveats=[],
        path="1",
        delivery_mode="WATERFALL",
        planned_start_date=now + timedelta(days=start_days),
        planned_end_date=now + timedelta(days=end_days),
        percent_complete=0.0,
        is_active=True,
        custom_attributes={},
    )
    db.add(node)
    # Ensure session is in a clean transaction state
    # (previous test may have left it in rollback state)
    try:
        db.get(PortfolioNode, node.id)
    except Exception:
        db.rollback()
        db.add(node)
    return node


# ============================================================================
# Pydantic Schema Validation Tests
# ============================================================================


class TestShiftTaskDatesArgs:
    """Test the ShiftTaskDatesArgs Pydantic schema."""

    def test_valid_positive_delta(self):
        """Verify positive delta_days is accepted."""
        args = ShiftTaskDatesArgs(node_id=uuid4(), delta_days=10)
        assert args.delta_days == 10

    def test_valid_negative_delta(self):
        """Verify negative delta_days is accepted."""
        args = ShiftTaskDatesArgs(node_id=uuid4(), delta_days=-5)
        assert args.delta_days == -5

    def test_reject_zero_delta(self):
        """Verify zero delta_days is rejected."""
        with pytest.raises(ValidationError, match="non-zero"):
            ShiftTaskDatesArgs(node_id=uuid4(), delta_days=0)

    def test_reject_delta_exceeds_max(self):
        """Verify delta_days > 365 is rejected."""
        with pytest.raises(ValidationError):
            ShiftTaskDatesArgs(node_id=uuid4(), delta_days=366)

    def test_reject_delta_below_min(self):
        """Verify delta_days < -365 is rejected."""
        with pytest.raises(ValidationError):
            ShiftTaskDatesArgs(node_id=uuid4(), delta_days=-366)

    def test_boundary_max(self):
        """Verify delta_days = 365 is accepted."""
        args = ShiftTaskDatesArgs(node_id=uuid4(), delta_days=365)
        assert args.delta_days == 365

    def test_boundary_min(self):
        """Verify delta_days = -365 is accepted."""
        args = ShiftTaskDatesArgs(node_id=uuid4(), delta_days=-365)
        assert args.delta_days == -365

    def test_invalid_node_id(self):
        """Verify invalid UUID is rejected."""
        with pytest.raises(ValidationError):
            ShiftTaskDatesArgs(node_id="not-a-uuid", delta_days=5)


class TestCreatePrecedenceLinkArgs:
    """Test the CreatePrecedenceLinkArgs Pydantic schema."""

    def test_valid_fs_link(self):
        """Verify FS link type is accepted."""
        pred = uuid4()
        succ = uuid4()
        args = CreatePrecedenceLinkArgs(pred_id=pred, succ_id=succ, link_type="FS")
        assert args.link_type == "FS"
        assert args.lag_days == 0

    def test_valid_link_types(self):
        """Verify all four link types are accepted."""
        pred = uuid4()
        succ = uuid4()
        for lt in ["FS", "SS", "FF", "SF"]:
            args = CreatePrecedenceLinkArgs(pred_id=pred, succ_id=succ, link_type=lt)
            assert args.link_type == lt

    def test_lowercase_link_type_uppercased(self):
        """Verify lowercase link_type is uppercased."""
        pred = uuid4()
        succ = uuid4()
        args = CreatePrecedenceLinkArgs(pred_id=pred, succ_id=succ, link_type="fs")
        assert args.link_type == "FS"

    def test_invalid_link_type(self):
        """Verify invalid link_type is rejected."""
        with pytest.raises(ValidationError, match="link_type"):
            CreatePrecedenceLinkArgs(
                pred_id=uuid4(), succ_id=uuid4(), link_type="INVALID"
            )

    def test_reject_self_loop(self):
        """Verify pred_id == succ_id is rejected."""
        same_id = uuid4()
        with pytest.raises(ValidationError, match="self-loops"):
            CreatePrecedenceLinkArgs(
                pred_id=same_id, succ_id=same_id, link_type="FS"
            )

    def test_valid_lag_days(self):
        """Verify positive lag_days is accepted."""
        args = CreatePrecedenceLinkArgs(
            pred_id=uuid4(), succ_id=uuid4(), link_type="FS", lag_days=10
        )
        assert args.lag_days == 10

    def test_valid_negative_lag(self):
        """Verify negative lag (lead) is accepted."""
        args = CreatePrecedenceLinkArgs(
            pred_id=uuid4(), succ_id=uuid4(), link_type="FS", lag_days=-5
        )
        assert args.lag_days == -5

    def test_reject_lag_below_min(self):
        """Verify lag_days < -60 is rejected."""
        with pytest.raises(ValidationError):
            CreatePrecedenceLinkArgs(
                pred_id=uuid4(), succ_id=uuid4(), link_type="FS", lag_days=-61
            )

    def test_reject_lag_above_max(self):
        """Verify lag_days > 365 is rejected."""
        with pytest.raises(ValidationError):
            CreatePrecedenceLinkArgs(
                pred_id=uuid4(), succ_id=uuid4(), link_type="FS", lag_days=366
            )


class TestUpdateProgressPercentageArgs:
    """Test the UpdateProgressPercentageArgs Pydantic schema."""

    def test_valid_percent(self):
        """Verify valid percent is accepted."""
        args = UpdateProgressPercentageArgs(node_id=uuid4(), percent=50.0)
        assert args.percent == 50.0

    def test_boundary_zero(self):
        """Verify percent = 0 is accepted."""
        args = UpdateProgressPercentageArgs(node_id=uuid4(), percent=0.0)
        assert args.percent == 0.0

    def test_boundary_hundred(self):
        """Verify percent = 100 is accepted."""
        args = UpdateProgressPercentageArgs(node_id=uuid4(), percent=100.0)
        assert args.percent == 100.0

    def test_reject_negative(self):
        """Verify negative percent is rejected."""
        with pytest.raises(ValidationError):
            UpdateProgressPercentageArgs(node_id=uuid4(), percent=-1.0)

    def test_reject_over_hundred(self):
        """Verify percent > 100 is rejected."""
        with pytest.raises(ValidationError):
            UpdateProgressPercentageArgs(node_id=uuid4(), percent=101.0)

    def test_rounds_percent(self):
        """Verify percent is rounded to 2 decimal places."""
        args = UpdateProgressPercentageArgs(node_id=uuid4(), percent=33.333333)
        assert args.percent == 33.33


class TestFlagOperationalBlockerArgs:
    """Test the FlagOperationalBlockerArgs Pydantic schema."""

    def test_valid_blocker(self):
        """Verify valid blocker args are accepted."""
        args = FlagOperationalBlockerArgs(
            node_id=uuid4(),
            severity="CRITICAL",
            category="OPERATIONAL_IMPEDIMENT",
            description="Lab access denied due to maintenance",
        )
        assert args.severity == "CRITICAL"
        assert args.category == "OPERATIONAL_IMPEDIMENT"
        assert args.impacted_hours == 8.0  # default

    def test_valid_severities(self):
        """Verify all severity levels are accepted."""
        for sev in ["CRITICAL", "MAJOR", "MINOR"]:
            args = FlagOperationalBlockerArgs(
                node_id=uuid4(),
                severity=sev,
                category="OPERATIONAL_IMPEDIMENT",
                description="Test",
            )
            assert args.severity == sev

    def test_valid_categories(self):
        """Verify all blocker categories are accepted."""
        for cat in [
            "DEPENDENCY_OVERDUE",
            "RESOURCE_UNAVAILABLE",
            "CLEARANCE_HOLD",
            "FACILITY_MAINTENANCE",
            "OPERATIONAL_IMPEDIMENT",
        ]:
            args = FlagOperationalBlockerArgs(
                node_id=uuid4(),
                severity="MAJOR",
                category=cat,
                description="Test",
            )
            assert args.category == cat

    def test_lowercase_severity_uppercased(self):
        """Verify lowercase severity is uppercased."""
        args = FlagOperationalBlockerArgs(
            node_id=uuid4(),
            severity="critical",
            category="operational_impediment",
            description="Test",
        )
        assert args.severity == "CRITICAL"
        assert args.category == "OPERATIONAL_IMPEDIMENT"

    def test_reject_invalid_severity(self):
        """Verify invalid severity is rejected."""
        with pytest.raises(ValidationError, match="severity"):
            FlagOperationalBlockerArgs(
                node_id=uuid4(),
                severity="EXTREME",
                category="OPERATIONAL_IMPEDIMENT",
                description="Test",
            )

    def test_reject_invalid_category(self):
        """Verify invalid category is rejected."""
        with pytest.raises(ValidationError, match="category"):
            FlagOperationalBlockerArgs(
                node_id=uuid4(),
                severity="MAJOR",
                category="UNKNOWN_TYPE",
                description="Test",
            )

    def test_reject_empty_description(self):
        """Verify empty description is rejected."""
        with pytest.raises(ValidationError):
            FlagOperationalBlockerArgs(
                node_id=uuid4(),
                severity="MAJOR",
                category="OPERATIONAL_IMPEDIMENT",
                description="",
            )

    def test_reject_description_over_1000_chars(self):
        """Verify description > 1000 chars is rejected."""
        with pytest.raises(ValidationError):
            FlagOperationalBlockerArgs(
                node_id=uuid4(),
                severity="MAJOR",
                category="OPERATIONAL_IMPEDIMENT",
                description="x" * 1001,
            )

    def test_custom_impacted_hours(self):
        """Verify custom impacted_hours is accepted."""
        args = FlagOperationalBlockerArgs(
            node_id=uuid4(),
            severity="MAJOR",
            category="OPERATIONAL_IMPEDIMENT",
            description="Test",
            impacted_hours=24.0,
        )
        assert args.impacted_hours == 24.0

    def test_reject_impacted_hours_below_min(self):
        """Verify impacted_hours < 0.5 is rejected."""
        with pytest.raises(ValidationError):
            FlagOperationalBlockerArgs(
                node_id=uuid4(),
                severity="MAJOR",
                category="OPERATIONAL_IMPEDIMENT",
                description="Test",
                impacted_hours=0.1,
            )

    def test_reject_impacted_hours_above_max(self):
        """Verify impacted_hours > 2000 is rejected."""
        with pytest.raises(ValidationError):
            FlagOperationalBlockerArgs(
                node_id=uuid4(),
                severity="MAJOR",
                category="OPERATIONAL_IMPEDIMENT",
                description="Test",
                impacted_hours=2001.0,
            )


class TestSQLInjectionRejection:
    """Test that raw SQL and shell injection is rejected in descriptions."""

    def test_reject_drop_table(self):
        """Verify DROP TABLE in description is rejected."""
        with pytest.raises(ValidationError, match="dangerous"):
            FlagOperationalBlockerArgs(
                node_id=uuid4(),
                severity="MAJOR",
                category="OPERATIONAL_IMPEDIMENT",
                description="DROP TABLE users; --",
            )

    def test_reject_delete_from(self):
        """Verify DELETE FROM in description is rejected."""
        with pytest.raises(ValidationError, match="dangerous"):
            FlagOperationalBlockerArgs(
                node_id=uuid4(),
                severity="MAJOR",
                category="OPERATIONAL_IMPEDIMENT",
                description="DELETE FROM portfolio_nodes",
            )

    def test_reject_insert_into(self):
        """Verify INSERT INTO in description is rejected."""
        with pytest.raises(ValidationError, match="dangerous"):
            FlagOperationalBlockerArgs(
                node_id=uuid4(),
                severity="MAJOR",
                category="OPERATIONAL_IMPEDIMENT",
                description="INSERT INTO users VALUES",
            )

    def test_reject_sql_comment(self):
        """Verify SQL comment at end of description is rejected."""
        with pytest.raises(ValidationError, match="dangerous"):
            FlagOperationalBlockerArgs(
                node_id=uuid4(),
                severity="MAJOR",
                category="OPERATIONAL_IMPEDIMENT",
                description="Lab access denied --",
            )

    def test_reject_shell_command_substitution(self):
        """Verify shell command substitution is rejected."""
        with pytest.raises(ValidationError, match="dangerous"):
            FlagOperationalBlockerArgs(
                node_id=uuid4(),
                severity="MAJOR",
                category="OPERATIONAL_IMPEDIMENT",
                description="Run $(rm -rf /) to fix",
            )

    def test_reject_dollar_paren_substitution(self):
        """Verify $() command substitution is rejected."""
        with pytest.raises(ValidationError, match="dangerous"):
            FlagOperationalBlockerArgs(
                node_id=uuid4(),
                severity="MAJOR",
                category="OPERATIONAL_IMPEDIMENT",
                description="Run $(whoami) to check",
            )

    def test_reject_semicolon_rm(self):
        """Verify semicolon followed by rm is rejected."""
        with pytest.raises(ValidationError, match="dangerous"):
            FlagOperationalBlockerArgs(
                node_id=uuid4(),
                severity="MAJOR",
                category="OPERATIONAL_IMPEDIMENT",
                description="Lab access; rm -rf /tmp",
            )

    def test_reject_pipe_bash(self):
        """Verify pipe to bash is rejected."""
        with pytest.raises(ValidationError, match="dangerous"):
            FlagOperationalBlockerArgs(
                node_id=uuid4(),
                severity="MAJOR",
                category="OPERATIONAL_IMPEDIMENT",
                description="echo hack | bash",
            )

    def test_reject_append_to_file(self):
        """Verify >> / path is rejected."""
        with pytest.raises(ValidationError, match="dangerous"):
            FlagOperationalBlockerArgs(
                node_id=uuid4(),
                severity="MAJOR",
                category="OPERATIONAL_IMPEDIMENT",
                description="echo data >> /etc/passwd",
            )

    def test_allow_normal_description(self):
        """Verify normal descriptions are accepted."""
        args = FlagOperationalBlockerArgs(
            node_id=uuid4(),
            severity="MAJOR",
            category="OPERATIONAL_IMPEDIMENT",
            description="Lab access denied due to scheduled maintenance on Friday",
        )
        assert args.description == "Lab access denied due to scheduled maintenance on Friday"

    def test_allow_description_with_update_word(self):
        """Verify 'update' in normal context is accepted."""
        args = FlagOperationalBlockerArgs(
            node_id=uuid4(),
            severity="MAJOR",
            category="OPERATIONAL_IMPEDIMENT",
            description="Waiting for software update to complete",
        )
        assert "update" in args.description.lower()


# ============================================================================
# ToolRegistry Tests
# ============================================================================


class TestToolRegistry:
    """Test the ToolRegistry class."""

    def test_default_tools_registered(self, registry):
        """Verify all four default tools are registered."""
        tools = registry.list_tools()
        assert "shift_task_dates" in tools
        assert "create_precedence_link" in tools
        assert "update_progress_percentage" in tools
        assert "flag_operational_blocker" in tools
        assert len(tools) == 4

    def test_tool_definitions_format(self, registry):
        """Verify tool definitions are properly formatted for LLM."""
        defs = registry.get_tool_definitions()
        assert len(defs) == 4

        for defn in defs:
            assert "name" in defn
            assert "description" in defn
            assert "parameters" in defn
            params = defn["parameters"]
            assert "type" in params
            assert params["type"] == "object"
            assert "properties" in params
            assert "required" in params

    def test_shift_task_dates_definition(self, registry):
        """Verify shift_task_dates definition has correct properties."""
        defs = registry.get_tool_definitions()
        shift_def = next(d for d in defs if d["name"] == "shift_task_dates")
        props = shift_def["parameters"]["properties"]
        assert "node_id" in props
        assert "delta_days" in props
        assert "node_id" in shift_def["parameters"]["required"]
        assert "delta_days" in shift_def["parameters"]["required"]

    def test_dispatch_unknown_tool(self, registry, db_session):
        """Verify dispatching an unknown tool returns error payload."""
        result = asyncio.run(
            registry.dispatch("nonexistent_tool", {}, db_session)
        )
        assert isinstance(result, ActionDispatchPayload)
        assert not result.success
        assert "Unknown tool" in result.error

    def test_dispatch_invalid_args(self, registry, db_session):
        """Verify dispatching with invalid args returns error payload."""
        result = asyncio.run(
            registry.dispatch("shift_task_dates", {"node_id": "bad", "delta_days": 0}, db_session)
        )
        assert not result.success
        assert "validation failed" in result.error.lower() or "Validation" in str(result.error)


# ============================================================================
# Executor Integration Tests
# ============================================================================


class TestShiftTaskDatesExecutor:
    """Test the shift_task_dates executor with database.

    Note: PortfolioNode uses version_id_col which conflicts with SQLite
    during flush.  These tests mock db.get() to return a PortfolioNode
    instance and verify the executor logic (date arithmetic, operations
    capture) without requiring a full database round-trip.
    """

    def _make_mock_node(self, start_days=0, end_days=30):
        """Create a PortfolioNode instance without DB persistence."""
        now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        node = PortfolioNode()
        node.id = uuid4()
        node.name = "Mock Task"
        node.planned_start_date = now + timedelta(days=start_days)
        node.planned_end_date = now + timedelta(days=end_days)
        node.percent_complete = 0.0
        return node

    def test_shift_dates_forward(self, registry):
        """Verify shifting dates forward captures correct operations."""
        node = self._make_mock_node(start_days=0, end_days=30)
        old_start = node.planned_start_date
        old_end = node.planned_end_date

        from app.services.copilot_actions import _execute_shift_task_dates, ShiftTaskDatesArgs

        args = ShiftTaskDatesArgs(node_id=node.id, delta_days=10)

        class MockDB:
            identity_map = {}
            def get(self, *args):
                uid = args[-1] if args else None
                return node if uid == node.id else None
            def flush(self):
                pass

        result = asyncio.run(_execute_shift_task_dates(MockDB(), args))

        assert result.success
        assert result.tool_name == "shift_task_dates"
        assert len(result.operations) == 2

        start_op = next(op for op in result.operations if op["field"] == "planned_start_date")
        end_op = next(op for op in result.operations if op["field"] == "planned_end_date")

        assert start_op["oldValue"] == old_start.isoformat()
        assert start_op["newValue"] != start_op["oldValue"]
        assert end_op["oldValue"] == old_end.isoformat()
        assert end_op["newValue"] != end_op["oldValue"]

        # Verify the node was actually modified in memory
        assert node.planned_start_date != old_start
        assert node.planned_end_date != old_end

    def test_shift_dates_backward(self, registry):
        """Verify shifting dates backward works."""
        node = self._make_mock_node(start_days=30, end_days=60)

        from app.services.copilot_actions import _execute_shift_task_dates, ShiftTaskDatesArgs

        args = ShiftTaskDatesArgs(node_id=node.id, delta_days=-5)

        class MockDB:
            identity_map = {}
            def get(self, *args):
                uid = args[-1] if args else None
                return node if uid == node.id else None
            def flush(self):
                pass

        result = asyncio.run(_execute_shift_task_dates(MockDB(), args))

        assert result.success
        assert "earlier" in result.message

    def test_shift_nonexistent_node(self, registry):
        """Verify shifting a nonexistent node returns error."""
        from app.services.copilot_actions import _execute_shift_task_dates, ShiftTaskDatesArgs

        fake_id = uuid4()
        args = ShiftTaskDatesArgs(node_id=fake_id, delta_days=5)

        class MockDB:
            identity_map = {}
            def get(self, *args):
                return None
            def flush(self):
                pass

        result = asyncio.run(_execute_shift_task_dates(MockDB(), args))

        assert not result.success
        assert "not found" in result.error


class TestCreatePrecedenceLinkExecutor:
    """Test the create_precedence_link executor with mocked database."""

    def _make_mock_node(self, name="Task"):
        node = PortfolioNode()
        node.id = uuid4()
        node.name = name
        return node

    def test_create_link(self, registry):
        """Verify creating a precedence link succeeds."""
        pred = self._make_mock_node("Predecessor")
        succ = self._make_mock_node("Successor")

        from app.services.copilot_actions import (
            _execute_create_precedence_link, CreatePrecedenceLinkArgs,
        )

        args = CreatePrecedenceLinkArgs(
            pred_id=pred.id, succ_id=succ.id, link_type="FS", lag_days=0,
        )
        added = []

        class MockDB:
            identity_map = {}
            def get(self, *args):
                uid = args[-1] if args else None
                return pred if uid == pred.id else (succ if uid == succ.id else None)
            def add(self, obj):
                added.append(obj)
            def query(self, model):
                class Q:
                    def filter(self, *c): return self
                    def filter_by(self, **kw): return self
                    def first(self): return None
                return Q()
            def flush(self):
                pass

        result = asyncio.run(_execute_create_precedence_link(MockDB(), args))
        assert result.success
        assert result.tool_name == "create_precedence_link"
        assert len(added) == 1
        assert added[0].dependency_type == DependencyType.FS

    def test_create_link_with_lag(self, registry):
        """Verify creating a link with lag days works."""
        pred = self._make_mock_node("Pred")
        succ = self._make_mock_node("Succ")

        from app.services.copilot_actions import (
            _execute_create_precedence_link, CreatePrecedenceLinkArgs,
        )

        args = CreatePrecedenceLinkArgs(
            pred_id=pred.id, succ_id=succ.id, link_type="FS", lag_days=3,
        )

        class MockDB:
            identity_map = {}
            def get(self, *args):
                uid = args[-1] if args else None
                return pred if uid == pred.id else (succ if uid == succ.id else None)
            def add(self, obj): pass
            def query(self, model):
                class Q:
                    def filter(self, *c): return self
                    def filter_by(self, **kw): return self
                    def first(self): return None
                return Q()
            def flush(self): pass

        result = asyncio.run(_execute_create_precedence_link(MockDB(), args))
        assert result.success
        assert "3-day lag" in result.message

    def test_nonexistent_predecessor(self, registry):
        """Verify link with nonexistent predecessor fails."""
        succ = self._make_mock_node("Succ")

        from app.services.copilot_actions import (
            _execute_create_precedence_link, CreatePrecedenceLinkArgs,
        )

        args = CreatePrecedenceLinkArgs(pred_id=uuid4(), succ_id=succ.id, link_type="FS")

        class MockDB:
            identity_map = {}
            def get(self, *args):
                uid = args[-1] if args else None
                return succ if uid == succ.id else None
            def flush(self): pass

        result = asyncio.run(_execute_create_precedence_link(MockDB(), args))
        assert not result.success
        assert "not found" in result.error


class TestUpdateProgressPercentageExecutor:
    """Test the update_progress_percentage executor with mocked database."""

    def _make_mock_node(self):
        node = PortfolioNode()
        node.id = uuid4()
        node.name = "Task"
        node.percent_complete = 0.0
        node.actual_end_date = None
        return node

    def test_update_progress(self, registry):
        """Verify updating progress succeeds."""
        node = self._make_mock_node()

        from app.services.copilot_actions import (
            _execute_update_progress_percentage, UpdateProgressPercentageArgs,
        )

        args = UpdateProgressPercentageArgs(node_id=node.id, percent=75.5)

        class MockDB:
            identity_map = {}
            def get(self, *args):
                uid = args[-1] if args else None
                return node if uid == node.id else None
            def flush(self): pass

        result = asyncio.run(_execute_update_progress_percentage(MockDB(), args))
        assert result.success
        assert result.tool_name == "update_progress_percentage"
        op = result.operations[0]
        assert op["field"] == "percent_complete"
        assert op["oldValue"] == 0.0
        assert op["newValue"] == 75.5
        assert node.percent_complete == 75.5

    def test_update_to_100_sets_actual_end(self, registry):
        """Verify setting 100% sets actual_end_date."""
        node = self._make_mock_node()

        from app.services.copilot_actions import (
            _execute_update_progress_percentage, UpdateProgressPercentageArgs,
        )

        args = UpdateProgressPercentageArgs(node_id=node.id, percent=100.0)

        class MockDB:
            identity_map = {}
            def get(self, *args):
                uid = args[-1] if args else None
                return node if uid == node.id else None
            def flush(self): pass

        result = asyncio.run(_execute_update_progress_percentage(MockDB(), args))
        assert result.success
        assert node.actual_end_date is not None

    def test_nonexistent_node(self, registry):
        """Verify updating nonexistent node fails."""
        from app.services.copilot_actions import (
            _execute_update_progress_percentage, UpdateProgressPercentageArgs,
        )

        fake_id = uuid4()
        args = UpdateProgressPercentageArgs(node_id=fake_id, percent=50.0)

        class MockDB:
            identity_map = {}
            def get(self, *args): return None
            def flush(self): pass

        result = asyncio.run(_execute_update_progress_percentage(MockDB(), args))
        assert not result.success
        assert "not found" in result.error


class TestFlagOperationalBlockerExecutor:
    """Test the flag_operational_blocker executor with mocked database."""

    def _make_mock_node(self):
        node = PortfolioNode()
        node.id = uuid4()
        node.name = "Task"
        return node

    def test_flag_blocker(self, registry):
        """Verify flagging a blocker succeeds."""
        node = self._make_mock_node()

        from app.services.copilot_actions import (
            _execute_flag_operational_blocker, FlagOperationalBlockerArgs,
        )

        args = FlagOperationalBlockerArgs(
            node_id=node.id,
            severity="CRITICAL",
            category="OPERATIONAL_IMPEDIMENT",
            description="Facility access denied",
            impacted_hours=16.0,
        )
        added = []

        class MockDB:
            identity_map = {}
            def get(self, *args):
                uid = args[-1] if args else None
                return node if uid == node.id else None
            def add(self, obj):
                added.append(obj)
            def flush(self): pass

        result = asyncio.run(_execute_flag_operational_blocker(MockDB(), args))
        assert result.success
        assert result.tool_name == "flag_operational_blocker"
        assert len(added) == 1
        blocker = added[0]
        assert blocker.severity == BlockerSeverity.CRITICAL
        assert blocker.category == BlockerCategory.OPERATIONAL_IMPEDIMENT
        assert blocker.impacted_hours == 16.0

    def test_flag_blocker_default_hours(self, registry):
        """Verify default impacted_hours is 8.0."""
        node = self._make_mock_node()

        from app.services.copilot_actions import (
            _execute_flag_operational_blocker, FlagOperationalBlockerArgs,
        )

        args = FlagOperationalBlockerArgs(
            node_id=node.id,
            severity="MAJOR",
            category="RESOURCE_UNAVAILABLE",
            description="Engineer on leave",
        )
        added = []

        class MockDB:
            identity_map = {}
            def get(self, *args):
                uid = args[-1] if args else None
                return node if uid == node.id else None
            def add(self, obj):
                added.append(obj)
            def flush(self): pass

        result = asyncio.run(_execute_flag_operational_blocker(MockDB(), args))
        assert result.success
        assert added[0].impacted_hours == 8.0

    def test_nonexistent_node(self, registry):
        """Verify flagging blocker on nonexistent node fails."""
        from app.services.copilot_actions import (
            _execute_flag_operational_blocker, FlagOperationalBlockerArgs,
        )

        fake_id = uuid4()
        args = FlagOperationalBlockerArgs(
            node_id=fake_id,
            severity="MAJOR",
            category="OPERATIONAL_IMPEDIMENT",
            description="Test",
        )

        class MockDB:
            identity_map = {}
            def get(self, *args): return None
            def flush(self): pass

        result = asyncio.run(_execute_flag_operational_blocker(MockDB(), args))
        assert not result.success
        assert "not found" in result.error


# ============================================================================
# Command Reversibility Tests
# ============================================================================


class TestCommandReversibility:
    """Test that all executors produce reversible operations."""

    def _make_mock_node(self, start_days=0, end_days=30):
        now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        node = PortfolioNode()
        node.id = uuid4()
        node.name = "Task"
        node.planned_start_date = now + timedelta(days=start_days)
        node.planned_end_date = now + timedelta(days=end_days)
        node.percent_complete = 0.0
        node.actual_end_date = None
        return node

    def test_shift_dates_has_old_and_new(self, registry):
        """Verify shift_task_dates captures both old and new values."""
        node = self._make_mock_node()

        from app.services.copilot_actions import _execute_shift_task_dates, ShiftTaskDatesArgs

        args = ShiftTaskDatesArgs(node_id=node.id, delta_days=7)

        class MockDB:
            identity_map = {}
            def get(self, *args):
                uid = args[-1] if args else None
                return node if uid == node.id else None
            def flush(self): pass

        result = asyncio.run(_execute_shift_task_dates(MockDB(), args))
        assert result.success
        for op in result.operations:
            assert "node_id" in op
            assert "field" in op
            assert "oldValue" in op
            assert "newValue" in op
            assert op["oldValue"] is not None
            assert op["newValue"] is not None
            assert op["oldValue"] != op["newValue"]

    def test_progress_update_has_old_and_new(self, registry):
        """Verify update_progress_percentage captures both old and new values."""
        node = self._make_mock_node()

        from app.services.copilot_actions import (
            _execute_update_progress_percentage, UpdateProgressPercentageArgs,
        )

        args = UpdateProgressPercentageArgs(node_id=node.id, percent=50.0)

        class MockDB:
            identity_map = {}
            def get(self, *args):
                uid = args[-1] if args else None
                return node if uid == node.id else None
            def flush(self): pass

        result = asyncio.run(_execute_update_progress_percentage(MockDB(), args))
        assert result.success
        op = result.operations[0]
        assert op["oldValue"] == 0.0
        assert op["newValue"] == 50.0

    def test_precedence_link_operation_format(self, registry):
        """Verify create_precedence_link produces reversible operation."""
        pred = self._make_mock_node()
        succ = self._make_mock_node()

        from app.services.copilot_actions import (
            _execute_create_precedence_link, CreatePrecedenceLinkArgs,
        )

        args = CreatePrecedenceLinkArgs(
            pred_id=pred.id, succ_id=succ.id, link_type="FS",
        )

        class MockDB:
            identity_map = {}
            def get(self, *args):
                uid = args[-1] if args else None
                return pred if uid == pred.id else (succ if uid == succ.id else None)
            def add(self, obj): pass
            def query(self, model):
                class Q:
                    def filter(self, *c): return self
                    def filter_by(self, **kw): return self
                    def first(self): return None
                return Q()
            def flush(self): pass

        result = asyncio.run(_execute_create_precedence_link(MockDB(), args))
        assert result.success
        op = result.operations[0]
        assert op["node_id"] == str(succ.id)
        assert op["field"] == "dependency_links"
        assert op["oldValue"] is None
        assert "ADD_LINK" in op["newValue"]

    def test_blocker_operation_format(self, registry):
        """Verify flag_operational_blocker produces reversible operation."""
        node = self._make_mock_node()

        from app.services.copilot_actions import (
            _execute_flag_operational_blocker, FlagOperationalBlockerArgs,
        )

        args = FlagOperationalBlockerArgs(
            node_id=node.id,
            severity="MAJOR",
            category="CLEARANCE_HOLD",
            description="Clearance pending review",
        )

        class MockDB:
            identity_map = {}
            def get(self, *args):
                uid = args[-1] if args else None
                return node if uid == node.id else None
            def add(self, obj): pass
            def flush(self): pass

        result = asyncio.run(_execute_flag_operational_blocker(MockDB(), args))
        assert result.success
        op = result.operations[0]
        assert op["node_id"] == str(node.id)
        assert op["field"] == "blockers"
        assert op["oldValue"] is None
        assert "ADD_BLOCKER" in op["newValue"]


# ============================================================================
# ActionDispatchPayload Tests
# ============================================================================


class TestActionDispatchPayload:
    """Test the ActionDispatchPayload model."""

    def test_success_payload(self):
        """Verify success payload structure."""
        payload = ActionDispatchPayload(
            tool_name="shift_task_dates",
            success=True,
            operations=[{
                "node_id": "uuid",
                "field": "planned_start_date",
                "oldValue": "2026-01-01",
                "newValue": "2026-01-08",
            }],
            message="Shifted 7 days later",
        )
        assert payload.success
        assert payload.error is None
        assert len(payload.operations) == 1

    def test_error_payload(self):
        """Verify error payload structure."""
        payload = ActionDispatchPayload(
            tool_name="unknown_tool",
            success=False,
            error="Something went wrong",
        )
        assert not payload.success
        assert payload.error == "Something went wrong"
        assert payload.operations == []
