"""Tests for the supplier_abac module.

Generated test suite covering 7 functions and 0 classes.
"""
import pytest

from app.core.supplier_abac import (is_subcontractor_user, get_subcontractor_boundary_nodes, check_node_access, filter_subcontractor_tasks, mask_prime_data, mask_parent_hierarchy, get_subcontractor_accessible_nodes)

class TestIs_subcontractor_user:
    """Test the is_subcontractor_user function."""

    def test_is_subcontractor_user_exists(self):
        """Verify is_subcontractor_user is callable."""
        assert callable(is_subcontractor_user)


class TestGet_subcontractor_boundary_nodes:
    """Test the get_subcontractor_boundary_nodes function."""

    def test_get_subcontractor_boundary_nodes_exists(self):
        """Verify get_subcontractor_boundary_nodes is callable."""
        assert callable(get_subcontractor_boundary_nodes)


class TestCheck_node_access:
    """Test the check_node_access function."""

    def test_check_node_access_exists(self):
        """Verify check_node_access is callable."""
        assert callable(check_node_access)


class TestFilter_subcontractor_tasks:
    """Test the filter_subcontractor_tasks function."""

    def test_filter_subcontractor_tasks_exists(self):
        """Verify filter_subcontractor_tasks is callable."""
        assert callable(filter_subcontractor_tasks)


class TestMask_prime_data:
    """Test the mask_prime_data function."""

    def test_mask_prime_data_exists(self):
        """Verify mask_prime_data is callable."""
        assert callable(mask_prime_data)


class TestMask_parent_hierarchy:
    """Test the mask_parent_hierarchy function."""

    def test_mask_parent_hierarchy_exists(self):
        """Verify mask_parent_hierarchy is callable."""
        assert callable(mask_parent_hierarchy)


class TestGet_subcontractor_accessible_nodes:
    """Test the get_subcontractor_accessible_nodes function."""

    def test_get_subcontractor_accessible_nodes_exists(self):
        """Verify get_subcontractor_accessible_nodes is callable."""
        assert callable(get_subcontractor_accessible_nodes)

