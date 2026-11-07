"""Tests for the export module.

Generated test suite covering 4 functions and 0 classes.
"""
import pytest

from app.routers.export import (export_view, generate_report, list_templates, list_view_types)

class TestExport_view:
    """Test the export_view function."""

    def test_export_view_exists(self):
        """Verify export_view is callable."""
        assert callable(export_view)


class TestGenerate_report:
    """Test the generate_report function."""

    def test_generate_report_exists(self):
        """Verify generate_report is callable."""
        assert callable(generate_report)


class TestList_templates:
    """Test the list_templates function."""

    def test_list_templates_exists(self):
        """Verify list_templates is callable."""
        assert callable(list_templates)


class TestList_view_types:
    """Test the list_view_types function."""

    def test_list_view_types_exists(self):
        """Verify list_view_types is callable."""
        assert callable(list_view_types)

