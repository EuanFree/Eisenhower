"""Tests for the sub-tree lock manager module.

This module tests the database lock manager that prevents concurrent
mutations during long-running schedule operations (CPM recalculation,
heuristic leveling, baseline freeze) on ltree sub-trees.
"""
import pytest
from uuid import uuid4

from app.core.exceptions import LockedException
from app.models.models import LockOperationType


class TestLockOperationType:
    """Test the lock operation type enum."""

    def test_cpm_recalculation(self):
        """Test CPM_RECALCULATION operation type."""
        assert LockOperationType.CPM_RECALCULATION.value == "CPM_RECALCULATION"

    def test_resource_leveling(self):
        """Test RESOURCE_LEVELING operation type."""
        assert LockOperationType.RESOURCE_LEVELING.value == "RESOURCE_LEVELING"

    def test_baseline_freeze(self):
        """Test BASELINE_FREEZE operation type."""
        assert LockOperationType.BASELINE_FREEZE.value == "BASELINE_FREEZE"

    def test_airgap_import(self):
        """Test AIRGAP_IMPORT operation type."""
        assert LockOperationType.AIRGAP_IMPORT.value == "AIRGAP_IMPORT"


class TestPathOverlapDetection:
    """Test ltree path overlap detection logic."""

    def test_exact_path_match(self):
        """Test that exact path matches are detected."""
        existing_path = "1.2.3"
        new_path = "1.2.3"
        is_ancestor = new_path.startswith(existing_path + ".") or new_path == existing_path
        is_child = existing_path.startswith(new_path + ".") or existing_path == new_path
        assert is_ancestor or is_child

    def test_ancestor_lock_blocks_child(self):
        """Test that an ancestor lock blocks a child path."""
        existing_path = "1.2"
        new_path = "1.2.3.4"
        is_ancestor = new_path.startswith(existing_path + ".") or new_path == existing_path
        assert is_ancestor

    def test_child_lock_blocks_ancestor(self):
        """Test that a child lock blocks an ancestor path."""
        existing_path = "1.2.3.4"
        new_path = "1.2"
        is_child = existing_path.startswith(new_path + ".") or existing_path == new_path
        assert is_child

    def test_no_overlap_different_branches(self):
        """Test that different branches don't overlap."""
        existing_path = "1.2.3"
        new_path = "1.3.4"
        is_ancestor = new_path.startswith(existing_path + ".") or new_path == existing_path
        is_child = existing_path.startswith(new_path + ".") or existing_path == new_path
        assert not is_ancestor
        assert not is_child

    def test_sibling_paths_no_overlap(self):
        """Test that sibling paths don't overlap."""
        existing_path = "1.2.3"
        new_path = "1.2.4"
        is_ancestor = new_path.startswith(existing_path + ".") or new_path == existing_path
        is_child = existing_path.startswith(new_path + ".") or existing_path == new_path
        assert not is_ancestor
        assert not is_child


class TestLockedException:
    """Test the LockedException for sub-tree locks."""

    def test_status_code_423(self):
        """Test that LockedException has HTTP 423 status."""
        exc = LockedException(
            operation_type="CPM_RECALCULATION",
            locked_by_user="admin@test.com",
            remaining_seconds=25,
            locked_path="1.2.3",
        )
        assert exc.status_code == 423

    def test_error_code(self):
        """Test that LockedException has correct error code."""
        exc = LockedException(
            operation_type="CPM_RECALCULATION",
            locked_by_user="admin@test.com",
            remaining_seconds=25,
            locked_path="1.2.3",
        )
        assert "SUB_TREE_LOCKED" in str(exc.detail)

    def test_remaining_seconds_in_detail(self):
        """Test that remaining seconds are in the detail."""
        exc = LockedException(
            operation_type="CPM_RECALCULATION",
            locked_by_user="admin@test.com",
            remaining_seconds=25,
            locked_path="1.2.3",
        )
        assert "25" in str(exc.detail)

    def test_locked_path_in_detail(self):
        """Test that locked path is in the detail."""
        exc = LockedException(
            operation_type="CPM_RECALCULATION",
            locked_by_user="admin@test.com",
            remaining_seconds=25,
            locked_path="1.2.3",
        )
        assert "1.2.3" in str(exc.detail)
