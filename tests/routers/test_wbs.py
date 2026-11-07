"""Tests for the wbs module.

Generated test suite covering 8 functions and 0 classes.
"""
import pytest

from app.routers.wbs import (get_wbs_tree, list_wbs_nodes, get_wbs_node, create_wbs_node, update_wbs_node, delete_wbs_node, get_descendants, batch_rollback)

class TestGet_wbs_tree:
    """Test the get_wbs_tree function."""

    def test_get_wbs_tree_exists(self):
        """Verify get_wbs_tree is callable."""
        assert callable(get_wbs_tree)


class TestList_wbs_nodes:
    """Test the list_wbs_nodes function."""

    def test_list_wbs_nodes_exists(self):
        """Verify list_wbs_nodes is callable."""
        assert callable(list_wbs_nodes)


class TestGet_wbs_node:
    """Test the get_wbs_node function."""

    def test_get_wbs_node_exists(self):
        """Verify get_wbs_node is callable."""
        assert callable(get_wbs_node)


class TestCreate_wbs_node:
    """Test the create_wbs_node function."""

    def test_create_wbs_node_exists(self):
        """Verify create_wbs_node is callable."""
        assert callable(create_wbs_node)


class TestUpdate_wbs_node:
    """Test the update_wbs_node function."""

    def test_update_wbs_node_exists(self):
        """Verify update_wbs_node is callable."""
        assert callable(update_wbs_node)


class TestDelete_wbs_node:
    """Test the delete_wbs_node function."""

    def test_delete_wbs_node_exists(self):
        """Verify delete_wbs_node is callable."""
        assert callable(delete_wbs_node)


class TestGet_descendants:
    """Test the get_descendants function."""

    def test_get_descendants_exists(self):
        """Verify get_descendants is callable."""
        assert callable(get_descendants)


class TestBatch_rollback:
    """Test the batch_rollback function."""

    def test_batch_rollback_exists(self):
        """Verify batch_rollback is callable."""
        assert callable(batch_rollback)

