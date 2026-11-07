"""Tests for the airgap module.

Generated test suite covering 2 functions and 0 classes.
"""
import pytest

from app.routers.airgap import (export_bundle, import_bundle)

class TestExport_bundle:
    """Test the export_bundle function."""

    def test_export_bundle_exists(self):
        """Verify export_bundle is callable."""
        assert callable(export_bundle)


class TestImport_bundle:
    """Test the import_bundle function."""

    def test_import_bundle_exists(self):
        """Verify import_bundle is callable."""
        assert callable(import_bundle)

