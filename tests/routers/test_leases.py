"""Tests for the leases module.

Generated test suite covering 5 functions and 0 classes.
"""
import pytest

from app.routers.leases import (checkout_subtree, heartbeat_lease, checkin_lease, force_break_lease, get_lease_info)

class TestCheckout_subtree:
    """Test the checkout_subtree function."""

    def test_checkout_subtree_exists(self):
        """Verify checkout_subtree is callable."""
        assert callable(checkout_subtree)


class TestHeartbeat_lease:
    """Test the heartbeat_lease function."""

    def test_heartbeat_lease_exists(self):
        """Verify heartbeat_lease is callable."""
        assert callable(heartbeat_lease)


class TestCheckin_lease:
    """Test the checkin_lease function."""

    def test_checkin_lease_exists(self):
        """Verify checkin_lease is callable."""
        assert callable(checkin_lease)


class TestForce_break_lease:
    """Test the force_break_lease function."""

    def test_force_break_lease_exists(self):
        """Verify force_break_lease is callable."""
        assert callable(force_break_lease)


class TestGet_lease_info:
    """Test the get_lease_info function."""

    def test_get_lease_info_exists(self):
        """Verify get_lease_info is callable."""
        assert callable(get_lease_info)

