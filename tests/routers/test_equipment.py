"""Tests for the equipment module.

Generated test suite covering 4 functions and 0 classes.
"""
import pytest

from app.routers.equipment import (recalibrate_equipment, create_downtime_window, get_calibration_status, list_maintenance_windows)

class TestRecalibrate_equipment:
    """Test the recalibrate_equipment function."""

    def test_recalibrate_equipment_exists(self):
        """Verify recalibrate_equipment is callable."""
        assert callable(recalibrate_equipment)


class TestCreate_downtime_window:
    """Test the create_downtime_window function."""

    def test_create_downtime_window_exists(self):
        """Verify create_downtime_window is callable."""
        assert callable(create_downtime_window)


class TestGet_calibration_status:
    """Test the get_calibration_status function."""

    def test_get_calibration_status_exists(self):
        """Verify get_calibration_status is callable."""
        assert callable(get_calibration_status)


class TestList_maintenance_windows:
    """Test the list_maintenance_windows function."""

    def test_list_maintenance_windows_exists(self):
        """Verify list_maintenance_windows is callable."""
        assert callable(list_maintenance_windows)

