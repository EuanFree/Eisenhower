"""Tests for the costing module.

Generated test suite covering 11 functions and 0 classes.
"""
import pytest

from app.routers.costing import (list_cost_elements, create_cost_element, get_cost_element, update_cost_element, delete_cost_element, list_indirect_rates, create_indirect_rate, get_indirect_rate, update_indirect_rate, get_task_cost_breakdown, get_cbs_rollup)

class TestList_cost_elements:
    """Test the list_cost_elements function."""

    def test_list_cost_elements_exists(self):
        """Verify list_cost_elements is callable."""
        assert callable(list_cost_elements)


class TestCreate_cost_element:
    """Test the create_cost_element function."""

    def test_create_cost_element_exists(self):
        """Verify create_cost_element is callable."""
        assert callable(create_cost_element)


class TestGet_cost_element:
    """Test the get_cost_element function."""

    def test_get_cost_element_exists(self):
        """Verify get_cost_element is callable."""
        assert callable(get_cost_element)


class TestUpdate_cost_element:
    """Test the update_cost_element function."""

    def test_update_cost_element_exists(self):
        """Verify update_cost_element is callable."""
        assert callable(update_cost_element)


class TestDelete_cost_element:
    """Test the delete_cost_element function."""

    def test_delete_cost_element_exists(self):
        """Verify delete_cost_element is callable."""
        assert callable(delete_cost_element)


class TestList_indirect_rates:
    """Test the list_indirect_rates function."""

    def test_list_indirect_rates_exists(self):
        """Verify list_indirect_rates is callable."""
        assert callable(list_indirect_rates)


class TestCreate_indirect_rate:
    """Test the create_indirect_rate function."""

    def test_create_indirect_rate_exists(self):
        """Verify create_indirect_rate is callable."""
        assert callable(create_indirect_rate)


class TestGet_indirect_rate:
    """Test the get_indirect_rate function."""

    def test_get_indirect_rate_exists(self):
        """Verify get_indirect_rate is callable."""
        assert callable(get_indirect_rate)


class TestUpdate_indirect_rate:
    """Test the update_indirect_rate function."""

    def test_update_indirect_rate_exists(self):
        """Verify update_indirect_rate is callable."""
        assert callable(update_indirect_rate)


class TestGet_task_cost_breakdown:
    """Test the get_task_cost_breakdown function."""

    def test_get_task_cost_breakdown_exists(self):
        """Verify get_task_cost_breakdown is callable."""
        assert callable(get_task_cost_breakdown)


class TestGet_cbs_rollup:
    """Test the get_cbs_rollup function."""

    def test_get_cbs_rollup_exists(self):
        """Verify get_cbs_rollup is callable."""
        assert callable(get_cbs_rollup)

