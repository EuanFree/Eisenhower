"""Tests for the evm_calculator module.

Generated test suite covering 7 functions and 0 classes.
"""
import pytest

from app.services.evm_calculator import (calculate_task_earned_value, compute_evm_variances, evm_rollup, compute_subtree_evm, generate_s_curve_data, validate_milestone_weights, verify_milestone_step)

class TestCalculate_task_earned_value:
    """Test the calculate_task_earned_value function."""

    def test_calculate_task_earned_value_exists(self):
        """Verify calculate_task_earned_value is callable."""
        assert callable(calculate_task_earned_value)


class TestCompute_evm_variances:
    """Test the compute_evm_variances function."""

    def test_compute_evm_variances_exists(self):
        """Verify compute_evm_variances is callable."""
        assert callable(compute_evm_variances)


class TestEvm_rollup:
    """Test the evm_rollup function."""

    def test_evm_rollup_exists(self):
        """Verify evm_rollup is callable."""
        assert callable(evm_rollup)


class TestCompute_subtree_evm:
    """Test the compute_subtree_evm function."""

    def test_compute_subtree_evm_exists(self):
        """Verify compute_subtree_evm is callable."""
        assert callable(compute_subtree_evm)


class TestGenerate_s_curve_data:
    """Test the generate_s_curve_data function."""

    def test_generate_s_curve_data_exists(self):
        """Verify generate_s_curve_data is callable."""
        assert callable(generate_s_curve_data)


class TestValidate_milestone_weights:
    """Test the validate_milestone_weights function."""

    def test_validate_milestone_weights_exists(self):
        """Verify validate_milestone_weights is callable."""
        assert callable(validate_milestone_weights)


class TestVerify_milestone_step:
    """Test the verify_milestone_step function."""

    def test_verify_milestone_step_exists(self):
        """Verify verify_milestone_step is callable."""
        assert callable(verify_milestone_step)

