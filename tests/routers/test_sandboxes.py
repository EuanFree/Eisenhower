"""Tests for the sandboxes module.

Generated test suite covering 3 functions and 0 classes.
"""
import pytest

from app.routers.sandboxes import (fork_sandbox, get_sandbox_diff, merge_sandbox)

class TestFork_sandbox:
    """Test the fork_sandbox function."""

    def test_fork_sandbox_exists(self):
        """Verify fork_sandbox is callable."""
        assert callable(fork_sandbox)


class TestGet_sandbox_diff:
    """Test the get_sandbox_diff function."""

    def test_get_sandbox_diff_exists(self):
        """Verify get_sandbox_diff is callable."""
        assert callable(get_sandbox_diff)


class TestMerge_sandbox:
    """Test the merge_sandbox function."""

    def test_merge_sandbox_exists(self):
        """Verify merge_sandbox is callable."""
        assert callable(merge_sandbox)

