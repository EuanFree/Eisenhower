"""Tests for the schedule module.

Generated test suite covering 4 functions and 0 classes.
"""
import pytest

from app.routers.schedule import (recalculate_cpm, run_monte_carlo, export_xer, export_msp_xml_endpoint)

class TestRecalculate_cpm:
    """Test the recalculate_cpm function."""

    def test_recalculate_cpm_exists(self):
        """Verify recalculate_cpm is callable."""
        assert callable(recalculate_cpm)


class TestRun_monte_carlo:
    """Test the run_monte_carlo function."""

    def test_run_monte_carlo_exists(self):
        """Verify run_monte_carlo is callable."""
        assert callable(run_monte_carlo)


class TestExport_xer:
    """Test the export_xer function."""

    def test_export_xer_exists(self):
        """Verify export_xer is callable."""
        assert callable(export_xer)


class TestExport_msp_xml_endpoint:
    """Test the export_msp_xml_endpoint function."""

    def test_export_msp_xml_endpoint_exists(self):
        """Verify export_msp_xml_endpoint is callable."""
        assert callable(export_msp_xml_endpoint)

