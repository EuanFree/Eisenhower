"""Tests for the display_settings module.

Generated test suite covering 2 functions and 0 classes.
"""
import pytest

from app.routers.display_settings import (get_display_settings, update_display_settings)

class TestGet_display_settings:
    """Test the get_display_settings function."""

    def test_get_display_settings_exists(self):
        """Verify get_display_settings is callable."""
        assert callable(get_display_settings)


class TestUpdate_display_settings:
    """Test the update_display_settings function."""

    def test_update_display_settings_exists(self):
        """Verify update_display_settings is callable."""
        assert callable(update_display_settings)

