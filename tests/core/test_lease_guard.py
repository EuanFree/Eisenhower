"""Tests for the lease_guard module.

Generated test suite covering 3 functions and 0 classes.
"""
import pytest

from app.core.lease_guard import (get_active_lease_for_path, verify_subtree_write_permission, verify_subtree_read_permission)

class TestGet_active_lease_for_path:
    """Test the get_active_lease_for_path function."""

    def test_get_active_lease_for_path_exists(self):
        """Verify get_active_lease_for_path is callable."""
        assert callable(get_active_lease_for_path)


class TestVerify_subtree_write_permission:
    """Test the verify_subtree_write_permission function."""

    def test_verify_subtree_write_permission_exists(self):
        """Verify verify_subtree_write_permission is callable."""
        assert callable(verify_subtree_write_permission)


class TestVerify_subtree_read_permission:
    """Test the verify_subtree_read_permission function."""

    def test_verify_subtree_read_permission_exists(self):
        """Verify verify_subtree_read_permission is callable."""
        assert callable(verify_subtree_read_permission)

