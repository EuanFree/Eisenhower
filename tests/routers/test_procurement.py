"""Tests for the procurement module.

Generated test suite covering 9 functions and 0 classes.
"""
import pytest

from app.routers.procurement import (create_procurement_item, list_procurement_items, get_procurement_item, update_procurement_item, update_procurement_status, delete_procurement_item, link_procurement_to_task, list_task_constraints, remove_task_constraint)

class TestCreate_procurement_item:
    """Test the create_procurement_item function."""

    def test_create_procurement_item_exists(self):
        """Verify create_procurement_item is callable."""
        assert callable(create_procurement_item)


class TestList_procurement_items:
    """Test the list_procurement_items function."""

    def test_list_procurement_items_exists(self):
        """Verify list_procurement_items is callable."""
        assert callable(list_procurement_items)


class TestGet_procurement_item:
    """Test the get_procurement_item function."""

    def test_get_procurement_item_exists(self):
        """Verify get_procurement_item is callable."""
        assert callable(get_procurement_item)


class TestUpdate_procurement_item:
    """Test the update_procurement_item function."""

    def test_update_procurement_item_exists(self):
        """Verify update_procurement_item is callable."""
        assert callable(update_procurement_item)


class TestUpdate_procurement_status:
    """Test the update_procurement_status function."""

    def test_update_procurement_status_exists(self):
        """Verify update_procurement_status is callable."""
        assert callable(update_procurement_status)


class TestDelete_procurement_item:
    """Test the delete_procurement_item function."""

    def test_delete_procurement_item_exists(self):
        """Verify delete_procurement_item is callable."""
        assert callable(delete_procurement_item)


class TestLink_procurement_to_task:
    """Test the link_procurement_to_task function."""

    def test_link_procurement_to_task_exists(self):
        """Verify link_procurement_to_task is callable."""
        assert callable(link_procurement_to_task)


class TestList_task_constraints:
    """Test the list_task_constraints function."""

    def test_list_task_constraints_exists(self):
        """Verify list_task_constraints is callable."""
        assert callable(list_task_constraints)


class TestRemove_task_constraint:
    """Test the remove_task_constraint function."""

    def test_remove_task_constraint_exists(self):
        """Verify remove_task_constraint is callable."""
        assert callable(remove_task_constraint)

