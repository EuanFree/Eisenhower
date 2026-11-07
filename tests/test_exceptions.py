"""Tests for the concurrency control and locking exceptions module.

This module tests the HTTP exceptions used for optimistic concurrency
control (HTTP 409 Conflict) and sub-tree locking (HTTP 423 Locked)
that prevent mid-air collisions during multi-user editing.
"""
import pytest
from uuid import uuid4

from app.core.exceptions import (
    ConflictException,
    LockedException,
)


class TestConflictException:
    """Test the HTTP 409 Conflict exception for concurrent modifications."""

    def test_http_status_is_409(self):
        """Test that the exception raises HTTP 409 Conflict."""
        exc = ConflictException(
            entity_id=str(uuid4()),
            expected_version=4,
            current_database_version=5,
        )
        assert exc.status_code == 409

    def test_error_code_is_concurrent_modification(self):
        """Test that the error code is CONCURRENT_MODIFICATION_CONFLICT."""
        exc = ConflictException(
            entity_id=str(uuid4()),
            expected_version=4,
            current_database_version=5,
        )
        assert "CONCURRENT_MODIFICATION_CONFLICT" in str(exc.detail)

    def test_detail_contains_entity_id(self):
        """Test that the detail contains the entity ID."""
        entity_id = str(uuid4())
        exc = ConflictException(
            entity_id=entity_id,
            expected_version=4,
            current_database_version=5,
        )
        assert entity_id in str(exc.detail)

    def test_detail_contains_version_info(self):
        """Test that the detail contains version information."""
        exc = ConflictException(
            entity_id=str(uuid4()),
            expected_version=4,
            current_database_version=5,
        )
        detail_str = str(exc.detail)
        assert "expected_version" in detail_str or "4" in detail_str

    def test_with_conflicting_user(self):
        """Test that conflicting user UPN is included."""
        exc = ConflictException(
            entity_id=str(uuid4()),
            expected_version=4,
            current_database_version=5,
            conflicting_user_upn="j.smith@defence.local",
        )
        assert "j.smith@defence.local" in str(exc.detail)

    def test_with_current_state(self):
        """Test that current state is included in detail."""
        current_state = {"name": "Modified Task", "planned_start_date": "2026-01-15"}
        exc = ConflictException(
            entity_id=str(uuid4()),
            expected_version=4,
            current_database_version=5,
            current_state=current_state,
        )
        assert "Modified Task" in str(exc.detail)

    def test_default_message(self):
        """Test that a default message is provided."""
        exc = ConflictException(
            entity_id=str(uuid4()),
            expected_version=4,
            current_database_version=5,
        )
        assert exc.detail is not None
        assert len(str(exc.detail)) > 0


class TestLockedException:
    """Test the HTTP 423 Locked exception for sub-tree locks."""

    def test_http_status_is_423(self):
        """Test that the exception raises HTTP 423 Locked."""
        exc = LockedException(
            operation_type="CPM_RECALCULATION",
            locked_by_user="admin@test.com",
            remaining_seconds=25,
            locked_path="1.2.3",
        )
        assert exc.status_code == 423

    def test_error_code_is_sub_tree_locked(self):
        """Test that the error code is SUB_TREE_LOCKED."""
        exc = LockedException(
            operation_type="CPM_RECALCULATION",
            locked_by_user="admin@test.com",
            remaining_seconds=25,
            locked_path="1.2.3",
        )
        assert "SUB_TREE_LOCKED" in str(exc.detail)

    def test_detail_contains_operation_type(self):
        """Test that the detail contains the operation type."""
        exc = LockedException(
            operation_type="BASELINE_FREEZE",
            locked_by_user="admin@test.com",
            remaining_seconds=25,
            locked_path="1.2.3",
        )
        assert "BASELINE_FREEZE" in str(exc.detail)

    def test_detail_contains_remaining_seconds(self):
        """Test that the detail contains remaining seconds."""
        exc = LockedException(
            operation_type="CPM_RECALCULATION",
            locked_by_user="admin@test.com",
            remaining_seconds=25,
            locked_path="1.2.3",
        )
        assert "25" in str(exc.detail)

    def test_detail_contains_locked_by_user(self):
        """Test that the detail contains the locking user."""
        exc = LockedException(
            operation_type="CPM_RECALCULATION",
            locked_by_user="j.smith@defence.local",
            remaining_seconds=25,
            locked_path="1.2.3",
        )
        assert "j.smith@defence.local" in str(exc.detail)

    def test_with_locked_path(self):
        """Test that locked path is included in detail."""
        exc = LockedException(
            operation_type="CPM_RECALCULATION",
            locked_by_user="admin@test.com",
            remaining_seconds=25,
            locked_path="1.2.3",
        )
        assert "1.2.3" in str(exc.detail)

    def test_default_message(self):
        """Test that a default message is provided."""
        exc = LockedException(
            operation_type="CPM_RECALCULATION",
            locked_by_user="admin@test.com",
            remaining_seconds=25,
            locked_path="1.2.3",
        )
        assert exc.detail is not None
        assert len(str(exc.detail)) > 0
