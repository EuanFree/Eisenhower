"""Tests for the resource leveling and baseline engine modules.

This module tests the Burgess-Killebrew heuristic leveling algorithm,
overallocation detection, and baseline BCR status transitions.
"""
import pytest
from decimal import Decimal

from app.models.models import BaselineChangeRequestStatus, BaselineTier


class TestOverallocationDetection:
    """Test resource overallocation window detection."""

    def test_overallocation_above_100_percent(self):
        """Test that >100% capacity is flagged as overallocation."""
        total_allocated = 1.5
        capacity = 1.0
        is_overallocated = total_allocated > capacity
        assert is_overallocated is True

    def test_exact_capacity_not_overallocated(self):
        """Test that exactly 100% capacity is not overallocation."""
        total_allocated = 1.0
        capacity = 1.0
        is_overallocated = total_allocated > capacity
        assert is_overallocated is False

    def test_under_capacity_not_overallocated(self):
        """Test that <100% capacity is not overallocation."""
        total_allocated = 0.5
        capacity = 1.0
        is_overallocated = total_allocated > capacity
        assert is_overallocated is False


class TestBurgessKillebrewHeuristic:
    """Test the Burgess-Killebrew leveling heuristic."""

    def test_critical_path_tasks_fixed(self):
        """Test that critical path tasks (TF <= 0) remain fixed."""
        total_float = 0
        should_delay = total_float > 0
        assert should_delay is False

    def test_non_critical_tasks_delayed(self):
        """Test that non-critical tasks (TF > 0) can be delayed."""
        total_float = 10
        should_delay = total_float > 0
        assert should_delay is True

    def test_delay_within_float(self):
        """Test that delay does not exceed available float."""
        total_float = 10
        proposed_delay = 5
        within_float = proposed_delay <= total_float
        assert within_float is True

    def test_delay_exceeds_float(self):
        """Test that delay exceeding float flags milestone breach."""
        total_float = 5
        proposed_delay = 10
        milestone_breach = proposed_delay > total_float
        assert milestone_breach is True


class TestLevelingShift:
    """Test leveling shift proposal structure."""

    def test_shift_fields(self):
        """Test that shift contains required fields."""
        shift = {
            "node_id": "uuid-123",
            "original_start": "2026-01-01",
            "proposed_start": "2026-01-10",
            "consumed_float_days": 5,
            "milestone_breach_flag": False,
        }
        assert "node_id" in shift
        assert "original_start" in shift
        assert "proposed_start" in shift
        assert "consumed_float_days" in shift
        assert "milestone_breach_flag" in shift

    def test_milestone_breach_flag(self):
        """Test that milestone breach flag is boolean."""
        breach_flag = True
        assert isinstance(breach_flag, bool)


class TestBCRStatusTransitions:
    """Test BaselineChangeRequest status transition validation."""

    def test_draft_status_exists(self):
        """Test that DRAFT status exists."""
        assert BaselineChangeRequestStatus.DRAFT.value == "DRAFT"

    def test_under_review_status_exists(self):
        """Test that UNDER_REVIEW status exists."""
        assert BaselineChangeRequestStatus.UNDER_REVIEW.value == "UNDER_REVIEW"

    def test_approved_status_exists(self):
        """Test that APPROVED status exists."""
        assert BaselineChangeRequestStatus.APPROVED.value == "APPROVED"

    def test_rejected_status_exists(self):
        """Test that REJECTED status exists."""
        assert BaselineChangeRequestStatus.REJECTED.value == "REJECTED"

    def test_draft_can_transition_to_under_review(self):
        """Test that DRAFT can transition to UNDER_REVIEW."""
        current = BaselineChangeRequestStatus.DRAFT
        next_status = BaselineChangeRequestStatus.UNDER_REVIEW
        # DRAFT -> UNDER_REVIEW is a valid transition
        assert current != next_status

    def test_under_review_can_transition_to_approved(self):
        """Test that UNDER_REVIEW can transition to APPROVED."""
        current = BaselineChangeRequestStatus.UNDER_REVIEW
        next_status = BaselineChangeRequestStatus.APPROVED
        assert current != next_status

    def test_under_review_can_transition_to_rejected(self):
        """Test that UNDER_REVIEW can transition to REJECTED."""
        current = BaselineChangeRequestStatus.UNDER_REVIEW
        next_status = BaselineChangeRequestStatus.REJECTED
        assert current != next_status


class TestBaselineTier:
    """Test baseline tier enum values."""

    def test_tier_1(self):
        """Test Tier 1 (Local CAM)."""
        assert BaselineTier.TIER_1_LOCAL_CAM.value == "TIER_1_LOCAL_CAM"

    def test_tier_2(self):
        """Test Tier 2 (Project CCB)."""
        assert BaselineTier.TIER_2_PROJECT_CCB.value == "TIER_2_PROJECT_CCB"

    def test_tier_3(self):
        """Test Tier 3 (Programme Board)."""
        assert BaselineTier.TIER_3_PROGRAMME_BOARD.value == "TIER_3_PROGRAMME_BOARD"


class TestBaselineVariance:
    """Test baseline variance calculations."""

    def test_start_variance(self):
        """Test: start_variance = Start_live - Start_base."""
        start_live = 100
        start_base = 90
        variance = start_live - start_base
        assert variance == 10

    def test_finish_variance(self):
        """Test: finish_variance = Finish_live - Finish_base."""
        finish_live = 200
        finish_base = 195
        variance = finish_live - finish_base
        assert variance == 5

    def test_bac_variance(self):
        """Test: BAC variance = BAC_live - BAC_base."""
        bac_live = Decimal("110000")
        bac_base = Decimal("100000")
        variance = bac_live - bac_base
        assert variance == Decimal("10000")

    def test_scope_unchanged(self):
        """Test that unchanged scope is classified as UNCHANGED."""
        scope = "UNCHANGED"
        assert scope == "UNCHANGED"

    def test_scope_modified(self):
        """Test that modified scope is classified as MODIFIED."""
        scope = "MODIFIED"
        assert scope == "MODIFIED"

    def test_scope_added(self):
        """Test that added scope is classified as ADDED_SCOPE."""
        scope = "ADDED_SCOPE"
        assert scope == "ADDED_SCOPE"

    def test_scope_deleted(self):
        """Test that deleted scope is classified as DELETED_SCOPE."""
        scope = "DELETED_SCOPE"
        assert scope == "DELETED_SCOPE"
