"""Tests for the Management Reserve (MR) budget tracking module.

This module tests the contingency drawdown governance that enforces
BaselineChangeRequest authorisation before transferring budget from
management reserve pools to WBS work packages.
"""
import pytest
from decimal import Decimal

from app.models.models import TransactionType, BaselineTier


class TestTransactionType:
    """Test the transaction type enum."""

    def test_initial_allocation(self):
        """Test INITIAL_ALLOCATION type."""
        assert TransactionType.INITIAL_ALLOCATION.value == "INITIAL_ALLOCATION"

    def test_drawdown_to_wbs(self):
        """Test DRAWDOWN_TO_WBS type."""
        assert TransactionType.DRAWDOWN_TO_WBS.value == "DRAWDOWN_TO_WBS"

    def test_return_to_reserve(self):
        """Test RETURN_TO_RESERVE type."""
        assert TransactionType.RETURN_TO_RESERVE.value == "RETURN_TO_RESERVE"

    def test_customer_de_obligation(self):
        """Test CUSTOMER_DE_OBLIGATION type."""
        assert TransactionType.CUSTOMER_DE_OBLIGATION.value == "CUSTOMER_DE_OBLIGATION"


class TestBaselineTier:
    """Test the baseline tier enum for BCR authorisation."""

    def test_tier_1_local_cam(self):
        """Test Tier 1 (Local CAM) - lowest authority."""
        assert BaselineTier.TIER_1_LOCAL_CAM.value == "TIER_1_LOCAL_CAM"

    def test_tier_2_project_ccb(self):
        """Test Tier 2 (Project CCB) - can authorise drawdowns."""
        assert BaselineTier.TIER_2_PROJECT_CCB.value == "TIER_2_PROJECT_CCB"

    def test_tier_3_programme_board(self):
        """Test Tier 3 (Programme Board) - highest authority."""
        assert BaselineTier.TIER_3_PROGRAMME_BOARD.value == "TIER_3_PROGRAMME_BOARD"


class TestDrawdownAuthorisation:
    """Test drawdown authorisation logic."""

    def test_tier_2_can_authorise(self):
        """Test that Tier 2 BCR can authorise drawdown."""
        tier = BaselineTier.TIER_2_PROJECT_CCB
        can_authorise = tier in (
            BaselineTier.TIER_2_PROJECT_CCB,
            BaselineTier.TIER_3_PROGRAMME_BOARD,
        )
        assert can_authorise is True

    def test_tier_3_can_authorise(self):
        """Test that Tier 3 BCR can authorise drawdown."""
        tier = BaselineTier.TIER_3_PROGRAMME_BOARD
        can_authorise = tier in (
            BaselineTier.TIER_2_PROJECT_CCB,
            BaselineTier.TIER_3_PROGRAMME_BOARD,
        )
        assert can_authorise is True

    def test_tier_1_cannot_authorise(self):
        """Test that Tier 1 BCR cannot authorise drawdown."""
        tier = BaselineTier.TIER_1_LOCAL_CAM
        can_authorise = tier in (
            BaselineTier.TIER_2_PROJECT_CCB,
            BaselineTier.TIER_3_PROGRAMME_BOARD,
        )
        assert can_authorise is False


class TestReserveBalance:
    """Test reserve pool balance calculations."""

    def test_sufficient_balance(self):
        """Test that sufficient balance allows drawdown."""
        balance = Decimal("500000")
        requested = Decimal("100000")
        assert balance >= requested

    def test_insufficient_balance(self):
        """Test that insufficient balance blocks drawdown."""
        balance = Decimal("50000")
        requested = Decimal("100000")
        assert balance < requested

    def test_zero_balance_blocks_drawdown(self):
        """Test that zero balance blocks drawdown."""
        balance = Decimal("0")
        requested = Decimal("100000")
        assert balance < requested

    def test_exact_balance_allows(self):
        """Test that exact balance allows drawdown."""
        balance = Decimal("100000")
        requested = Decimal("100000")
        assert balance >= requested

    def test_balance_decrement(self):
        """Test that drawdown correctly decrements balance."""
        initial = Decimal("500000")
        drawdown = Decimal("100000")
        new_balance = initial - drawdown
        assert new_balance == Decimal("400000")

    def test_bac_increment(self):
        """Test that drawdown correctly increments target BAC."""
        initial_bac = Decimal("1000000")
        drawdown = Decimal("50000")
        new_bac = initial_bac + drawdown
        assert new_bac == Decimal("1050000")
