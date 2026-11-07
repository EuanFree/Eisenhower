"""Tests for the export_msp module.

Generated test suite covering 1 functions and 0 classes.
"""
import pytest

from app.services.export_msp import (export_to_msp_xml)

class TestExport_to_msp_xml:
    """Test the export_to_msp_xml function."""

    def test_export_to_msp_xml_exists(self):
        """Verify export_to_msp_xml is callable."""
        assert callable(export_to_msp_xml)

