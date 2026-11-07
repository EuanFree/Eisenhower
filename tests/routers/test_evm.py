"""Tests for the evm module.

Generated test suite covering 9 functions and 0 classes.
"""
import pytest

from app.routers.evm import (get_s_curve_data, get_evm_rollup, get_task_cost_breakdown, recalculate_task_ev, list_milestone_steps, create_milestone_step, update_milestone_step, delete_milestone_step, verify_milestone)

class TestGet_s_curve_data:
    """Test the get_s_curve_data function."""

    def test_get_s_curve_data_exists(self):
        """Verify get_s_curve_data is callable."""
        assert callable(get_s_curve_data)


class TestGet_evm_rollup:
    """Test the get_evm_rollup function."""

    def test_get_evm_rollup_exists(self):
        """Verify get_evm_rollup is callable."""
        assert callable(get_evm_rollup)


class TestGet_task_cost_breakdown:
    """Test the get_task_cost_breakdown function."""

    def test_get_task_cost_breakdown_exists(self):
        """Verify get_task_cost_breakdown is callable."""
        assert callable(get_task_cost_breakdown)


class TestRecalculate_task_ev:
    """Test the recalculate_task_ev function."""

    def test_recalculate_task_ev_exists(self):
        """Verify recalculate_task_ev is callable."""
        assert callable(recalculate_task_ev)


class TestList_milestone_steps:
    """Test the list_milestone_steps function."""

    def test_list_milestone_steps_exists(self):
        """Verify list_milestone_steps is callable."""
        assert callable(list_milestone_steps)


class TestCreate_milestone_step:
    """Test the create_milestone_step function."""

    def test_create_milestone_step_exists(self):
        """Verify create_milestone_step is callable."""
        assert callable(create_milestone_step)


class TestUpdate_milestone_step:
    """Test the update_milestone_step function."""

    def test_update_milestone_step_exists(self):
        """Verify update_milestone_step is callable."""
        assert callable(update_milestone_step)


class TestDelete_milestone_step:
    """Test the delete_milestone_step function."""

    def test_delete_milestone_step_exists(self):
        """Verify delete_milestone_step is callable."""
        assert callable(delete_milestone_step)


class TestVerify_milestone:
    """Test the verify_milestone function."""

    def test_verify_milestone_exists(self):
        """Verify verify_milestone is callable."""
        assert callable(verify_milestone)

