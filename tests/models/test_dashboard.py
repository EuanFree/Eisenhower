"""Tests for the dashboard module.

Generated test suite covering 0 functions and 4 classes.
"""
import pytest

from app.models.dashboard import (WidgetType, DataSourceType, Dashboard, DashboardWidget)

class TestWidgetType:
    """Test the WidgetType class."""

    def test_widgettype_exists(self):
        """Verify WidgetType can be imported."""
        assert WidgetType is not None


class TestDataSourceType:
    """Test the DataSourceType class."""

    def test_datasourcetype_exists(self):
        """Verify DataSourceType can be imported."""
        assert DataSourceType is not None


class TestDashboard:
    """Test the Dashboard class."""

    def test_dashboard_exists(self):
        """Verify Dashboard can be imported."""
        assert Dashboard is not None


class TestDashboardWidget:
    """Test the DashboardWidget class."""

    def test_dashboardwidget_exists(self):
        """Verify DashboardWidget can be imported."""
        assert DashboardWidget is not None

