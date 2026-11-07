"""Tests for the baselines module.

Generated test suite covering 7 functions and 0 classes.
"""
import pytest

from app.routers.baselines import (freeze_baseline_endpoint, compare_baseline_endpoint, list_baselines_endpoint, create_bcr_endpoint, list_bcrs_endpoint, get_bcr_endpoint, update_bcr_endpoint)

class TestFreeze_baseline_endpoint:
    """Test the freeze_baseline_endpoint function."""

    def test_freeze_baseline_endpoint_exists(self):
        """Verify freeze_baseline_endpoint is callable."""
        assert callable(freeze_baseline_endpoint)


class TestCompare_baseline_endpoint:
    """Test the compare_baseline_endpoint function."""

    def test_compare_baseline_endpoint_exists(self):
        """Verify compare_baseline_endpoint is callable."""
        assert callable(compare_baseline_endpoint)


class TestList_baselines_endpoint:
    """Test the list_baselines_endpoint function."""

    def test_list_baselines_endpoint_exists(self):
        """Verify list_baselines_endpoint is callable."""
        assert callable(list_baselines_endpoint)


class TestCreate_bcr_endpoint:
    """Test the create_bcr_endpoint function."""

    def test_create_bcr_endpoint_exists(self):
        """Verify create_bcr_endpoint is callable."""
        assert callable(create_bcr_endpoint)


class TestList_bcrs_endpoint:
    """Test the list_bcrs_endpoint function."""

    def test_list_bcrs_endpoint_exists(self):
        """Verify list_bcrs_endpoint is callable."""
        assert callable(list_bcrs_endpoint)


class TestGet_bcr_endpoint:
    """Test the get_bcr_endpoint function."""

    def test_get_bcr_endpoint_exists(self):
        """Verify get_bcr_endpoint is callable."""
        assert callable(get_bcr_endpoint)


class TestUpdate_bcr_endpoint:
    """Test the update_bcr_endpoint function."""

    def test_update_bcr_endpoint_exists(self):
        """Verify update_bcr_endpoint is callable."""
        assert callable(update_bcr_endpoint)

