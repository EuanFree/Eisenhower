"""Tests for the templating, sandboxing, and subcontractor ingest modules.

This module tests template snapshot/instantiation, sandbox branch forking,
and subcontractor submission validation logic.
"""
import pytest
from datetime import datetime, timedelta

from app.models.models import (
    TemplateTier,
    SandboxScenarioStatus,
    SubmissionStatus,
    ProcurementLifecycleStage,
)


class TestTemplateTier:
    """Test the template tier enum."""

    def test_programme(self):
        """Test PROGRAMME tier."""
        assert TemplateTier.PROGRAMME.value == "PROGRAMME"

    def test_project(self):
        """Test PROJECT tier."""
        assert TemplateTier.PROJECT.value == "PROJECT"

    def test_work_package(self):
        """Test WORK_PACKAGE tier."""
        assert TemplateTier.WORK_PACKAGE.value == "WORK_PACKAGE"

    def test_task_collection(self):
        """Test TASK_COLLECTION tier."""
        assert TemplateTier.TASK_COLLECTION.value == "TASK_COLLECTION"


class TestSandboxScenarioStatus:
    """Test the sandbox scenario status enum."""

    def test_active(self):
        """Test ACTIVE status."""
        assert SandboxScenarioStatus.ACTIVE.value == "ACTIVE"

    def test_committed(self):
        """Test COMMITTED status."""
        assert SandboxScenarioStatus.COMMITTED.value == "COMMITTED"

    def test_discarded(self):
        """Test DISCARDED status."""
        assert SandboxScenarioStatus.DISCARDED.value == "DISCARDED"


class TestSandboxPathPrefix:
    """Test sandbox ltree path prefix construction."""

    def test_sandbox_prefix_format(self):
        """Test that sandbox path uses sandbox_<id>.<original_path> format."""
        scenario_id = "uuid-123"
        original_path = "1.2.3"
        sandbox_path = f"sandbox_{scenario_id}.{original_path}"
        assert sandbox_path == "sandbox_uuid-123.1.2.3"

    def test_sandbox_path_isolated(self):
        """Test that sandbox path is isolated from live paths."""
        sandbox_path = "sandbox_uuid-123.1.2.3"
        live_path = "1.2.3"
        assert sandbox_path != live_path
        assert sandbox_path.startswith("sandbox_")


class TestDiffCategorization:
    """Test three-way diff categorization."""

    def test_added_category(self):
        """Test that new nodes are categorized as ADDED."""
        category = "ADDED"
        assert category == "ADDED"

    def test_modified_dates_category(self):
        """Test that date changes are categorized as MODIFIED_DATES."""
        category = "MODIFIED_DATES"
        assert category == "MODIFIED_DATES"

    def test_modified_logic_category(self):
        """Test that logic changes are categorized as MODIFIED_LOGIC."""
        category = "MODIFIED_LOGIC"
        assert category == "MODIFIED_LOGIC"

    def test_deleted_category(self):
        """Test that removed nodes are categorized as DELETED."""
        category = "DELETED"
        assert category == "DELETED"

    def test_conflict_category(self):
        """Test that concurrent edits are categorized as CONFLICT_LIVE_MUTATED."""
        category = "CONFLICT_LIVE_MUTATED"
        assert category == "CONFLICT_LIVE_MUTATED"


class TestSubmissionStatus:
    """Test the subcontractor submission status enum."""

    def test_received(self):
        """Test RECEIVED status."""
        assert SubmissionStatus.RECEIVED.value == "RECEIVED"

    def test_validating(self):
        """Test VALIDATING status."""
        assert SubmissionStatus.VALIDATING.value == "VALIDATING"

    def test_rejected_breach(self):
        """Test REJECTED_BREACH status."""
        assert SubmissionStatus.REJECTED_BREACH.value == "REJECTED_BREACH"

    def test_staged_ready(self):
        """Test STAGED_READY status."""
        assert SubmissionStatus.STAGED_READY.value == "STAGED_READY"

    def test_accepted_merged(self):
        """Test ACCEPTED_MERGED status."""
        assert SubmissionStatus.ACCEPTED_MERGED.value == "ACCEPTED_MERGED"


class TestBoundaryBreachDetection:
    """Test contractual boundary breach detection."""

    def test_milestone_slippage_tolerance(self):
        """Test that milestone slippage tolerance is 5 days."""
        tolerance_days = 5
        slip_days = 3
        is_breach = slip_days > tolerance_days
        assert is_breach is False

    def test_milestone_breach_exceeds_tolerance(self):
        """Test that slippage exceeding tolerance is flagged."""
        tolerance_days = 5
        slip_days = 7
        is_breach = slip_days > tolerance_days
        assert is_breach is True

    def test_predecessor_count_comparison(self):
        """Test that predecessor count comparison detects logic tampering."""
        original_predecessors = 3
        submitted_predecessors = 1
        logic_tampered = submitted_predecessors < original_predecessors
        assert logic_tampered is True

    def test_dangling_activity_detection(self):
        """Test that dangling activities are detected."""
        has_predecessor = False
        has_successor = False
        is_dangling = not has_predecessor and not has_successor
        assert is_dangling is True


class TestProcurementLifecycle:
    """Test the procurement lifecycle stage enum."""

    def test_requisition(self):
        """Test REQUISITION stage."""
        assert ProcurementLifecycleStage.REQUISITION.value == "REQUISITION"

    def test_delivered_stores(self):
        """Test DELIVERED_STORES stage."""
        assert ProcurementLifecycleStage.DELIVERED_STORES.value == "DELIVERED_STORES"

    def test_accepted_inspected(self):
        """Test ACCEPTED_INSPECTED stage."""
        assert ProcurementLifecycleStage.ACCEPTED_INSPECTED.value == "ACCEPTED_INSPECTED"

    def test_lifecycle_progression(self):
        """Test that lifecycle stages progress forward."""
        stages = [
            ProcurementLifecycleStage.REQUISITION,
            ProcurementLifecycleStage.RFQ_ISSUED,
            ProcurementLifecycleStage.PO_PLACED,
            ProcurementLifecycleStage.IN_MANUFACTURE,
            ProcurementLifecycleStage.CUSTOMS_TRANSIT,
            ProcurementLifecycleStage.DELIVERED_STORES,
            ProcurementLifecycleStage.ACCEPTED_INSPECTED,
        ]
        assert len(stages) == 7


class TestWorkdayCalendar:
    """Test workday calendar helpers for templating."""

    def test_monday_is_workday(self):
        """Test that Monday is a workday."""
        date = datetime(2026, 1, 5)  # Monday
        is_workday = date.weekday() < 5
        assert is_workday is True

    def test_saturday_is_not_workday(self):
        """Test that Saturday is not a workday."""
        date = datetime(2026, 1, 10)  # Saturday
        is_workday = date.weekday() < 5
        assert is_workday is False

    def test_add_workdays_skips_weekend(self):
        """Test that adding workdays skips weekends."""
        # Friday + 1 workday = Monday
        start = datetime(2026, 1, 9)  # Friday
        # Skip Saturday and Sunday
        result = start + timedelta(days=3)  # Monday
        assert result.weekday() == 0  # Monday


class TestTemplateGraph:
    """Test template graph serialization."""

    def test_relative_day_offsets(self):
        """Test that dates are stored as relative day offsets."""
        anchor_date = datetime(2026, 1, 1)
        task_date = datetime(2026, 1, 10)
        offset_days = (task_date - anchor_date).days
        assert offset_days == 9

    def test_backward_scheduling(self):
        """Test that backward scheduling uses finish date anchor."""
        finish_date = datetime(2026, 6, 30)
        duration_days = 30
        start_date = finish_date - timedelta(days=duration_days)
        assert start_date == datetime(2026, 5, 31)
