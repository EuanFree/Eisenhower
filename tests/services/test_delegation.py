"""Tests for the delegation module.

Generated test suite covering 9 functions and 0 classes.
"""
import pytest

from app.services.delegation import (create_delegation, revoke_delegation, get_active_delegation, get_delegatee_for_date, check_delegation_coverage, get_delegations_for_user, get_upcoming_delegations, get_expiring_delegations, check_leave_needs_delegation)

class TestCreate_delegation:
    """Test the create_delegation function."""

    def test_create_delegation_exists(self):
        """Verify create_delegation is callable."""
        assert callable(create_delegation)


class TestRevoke_delegation:
    """Test the revoke_delegation function."""

    def test_revoke_delegation_exists(self):
        """Verify revoke_delegation is callable."""
        assert callable(revoke_delegation)


class TestGet_active_delegation:
    """Test the get_active_delegation function."""

    def test_get_active_delegation_exists(self):
        """Verify get_active_delegation is callable."""
        assert callable(get_active_delegation)


class TestGet_delegatee_for_date:
    """Test the get_delegatee_for_date function."""

    def test_get_delegatee_for_date_exists(self):
        """Verify get_delegatee_for_date is callable."""
        assert callable(get_delegatee_for_date)


class TestCheck_delegation_coverage:
    """Test the check_delegation_coverage function."""

    def test_check_delegation_coverage_exists(self):
        """Verify check_delegation_coverage is callable."""
        assert callable(check_delegation_coverage)


class TestGet_delegations_for_user:
    """Test the get_delegations_for_user function."""

    def test_get_delegations_for_user_exists(self):
        """Verify get_delegations_for_user is callable."""
        assert callable(get_delegations_for_user)


class TestGet_upcoming_delegations:
    """Test the get_upcoming_delegations function."""

    def test_get_upcoming_delegations_exists(self):
        """Verify get_upcoming_delegations is callable."""
        assert callable(get_upcoming_delegations)


class TestGet_expiring_delegations:
    """Test the get_expiring_delegations function."""

    def test_get_expiring_delegations_exists(self):
        """Verify get_expiring_delegations is callable."""
        assert callable(get_expiring_delegations)


class TestCheck_leave_needs_delegation:
    """Test the check_leave_needs_delegation function."""

    def test_check_leave_needs_delegation_exists(self):
        """Verify check_leave_needs_delegation is callable."""
        assert callable(check_leave_needs_delegation)

