"""Tests for the previews module.

Generated test suite covering 3 functions and 0 classes.
"""
import pytest

from app.routers.previews import (get_task_preview, get_resource_preview, get_location_preview)

class TestGet_task_preview:
    """Test the get_task_preview function."""

    def test_get_task_preview_exists(self):
        """Verify get_task_preview is callable."""
        assert callable(get_task_preview)


class TestGet_resource_preview:
    """Test the get_resource_preview function."""

    def test_get_resource_preview_exists(self):
        """Verify get_resource_preview is callable."""
        assert callable(get_resource_preview)


class TestGet_location_preview:
    """Test the get_location_preview function."""

    def test_get_location_preview_exists(self):
        """Verify get_location_preview is callable."""
        assert callable(get_location_preview)

