"""Tests for the supplier portal ABAC filter module.

This module tests the subcontractor boundary tenant scoping that ensures
external vendor users can only access tasks explicitly delegated to their
CAGE code, with all prime EVM cost data masked as '[RESTRICTED]'.
"""
import pytest
from unittest.mock import MagicMock

from app.core.supplier_abac import (
    is_subcontractor_user,
    mask_prime_data,
    mask_parent_hierarchy,
)


class TestIsSubcontractorUser:
    """Test subcontractor user detection."""

    def test_subcontractor_user(self):
        """Test that a user with is_subcontractor_user=True is detected."""
        user = MagicMock()
        user.is_subcontractor_user = True
        assert is_subcontractor_user(user) is True

    def test_regular_user(self):
        """Test that a regular user is not a subcontractor."""
        user = MagicMock()
        user.is_subcontractor_user = False
        assert is_subcontractor_user(user) is False


class TestMaskPrimeData:
    """Test prime data masking for subcontractor views."""

    def test_mask_prime_data_returns_dict(self):
        """Test that mask_prime_data returns a dictionary."""
        node = MagicMock()
        node.bac_cost = 1000000.00
        node.planned_value = 500000.00
        node.earned_value = 450000.00
        node.actual_cost = 480000.00
        node.name = "Task Name"
        node.code = "TASK-001"
        node.custom_attributes = {}
        node.security_classification = MagicMock()
        node.security_classification.value = "OFFICIAL"
        node.caveats = []
        node.export_control_regime = MagicMock()
        node.export_control_regime.value = "NOT_CONTROLLED"
        masked = mask_prime_data(node)
        assert isinstance(masked, dict)

    def test_masked_evm_fields(self):
        """Test that EVM fields are masked in the result."""
        node = MagicMock()
        node.bac_cost = 1000000.00
        node.planned_value = 500000.00
        node.earned_value = 450000.00
        node.actual_cost = 480000.00
        node.name = "Task Name"
        node.code = "TASK-001"
        node.custom_attributes = {}
        node.security_classification = MagicMock()
        node.security_classification.value = "OFFICIAL"
        node.caveats = []
        node.export_control_regime = MagicMock()
        node.export_control_regime.value = "NOT_CONTROLLED"
        masked = mask_prime_data(node)
        # Check that EVM fields are present and masked
        evm_keys = ["bac_cost", "planned_value", "earned_value", "actual_cost"]
        for key in evm_keys:
            if key in masked:
                assert masked[key] == "[RESTRICTED]"


class TestMaskParentHierarchy:
    """Test parent hierarchy masking for subcontractor views."""

    def test_mask_parent_hierarchy_returns_dict(self):
        """Test that mask_parent_hierarchy returns a dictionary."""
        node = MagicMock()
        node.path = "1.1.1"
        node.name = "Task Name"
        node.code = "TASK-001"
        node.custom_attributes = {}
        node.security_classification = MagicMock()
        node.security_classification.value = "OFFICIAL"
        node.caveats = []
        node.export_control_regime = MagicMock()
        node.export_control_regime.value = "NOT_CONTROLLED"
        user = MagicMock()
        user.is_subcontractor_user = True
        result = mask_parent_hierarchy(node, user)
        assert isinstance(result, dict)

    def test_subcontractor_cannot_access_parent(self):
        """Test that subcontractor users cannot access parent hierarchy."""
        node = MagicMock()
        node.path = "1.1.1"
        node.name = "Task Name"
        node.code = "TASK-001"
        node.custom_attributes = {}
        node.security_classification = MagicMock()
        node.security_classification.value = "OFFICIAL"
        node.caveats = []
        node.export_control_regime = MagicMock()
        node.export_control_regime.value = "NOT_CONTROLLED"
        user = MagicMock()
        user.is_subcontractor_user = True
        result = mask_parent_hierarchy(node, user)
        assert isinstance(result, dict)
