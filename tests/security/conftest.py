"""Pytest configuration for the security test suite.

Provides shared fixtures and configuration for DAST and fuzzing tests.
"""

import pytest


def pytest_collection_modifyitems(config, items):
    """Add markers to security tests for better organization.
    
    Marks all tests in tests/security/ with the 'security' marker.
    """
    for item in items:
        item.add_marker(pytest.mark.security)
