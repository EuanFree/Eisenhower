"""Tests for the lock_manager module.

Generated test suite covering 2 functions and 0 classes.
"""
import pytest

from app.services.lock_manager import (check_path_lock, get_active_locks)

class TestCheck_path_lock:
    """Test the check_path_lock function."""

    def test_check_path_lock_exists(self):
        """Verify check_path_lock is callable."""
        assert callable(check_path_lock)


class TestGet_active_locks:
    """Test the get_active_locks function."""

    def test_get_active_locks_exists(self):
        """Verify get_active_locks is callable."""
        assert callable(get_active_locks)

