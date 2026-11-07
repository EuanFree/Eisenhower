"""Tests for the exceptions module.

Generated test suite covering 0 functions and 2 classes.
"""
import pytest

from app.core.exceptions import (ConflictException, LockedException)

class TestConflictException:
    """Test the ConflictException class."""

    def test_conflictexception_exists(self):
        """Verify ConflictException can be imported."""
        assert ConflictException is not None


class TestLockedException:
    """Test the LockedException class."""

    def test_lockedexception_exists(self):
        """Verify LockedException can be imported."""
        assert LockedException is not None

