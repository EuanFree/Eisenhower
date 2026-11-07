"""Tests for the airgap module.

Generated test suite covering 2 functions and 0 classes.
"""
import pytest

from app.services.airgap import (export_airgap_package, ingest_airgap_package)

class TestExport_airgap_package:
    """Test the export_airgap_package function."""

    def test_export_airgap_package_exists(self):
        """Verify export_airgap_package is callable."""
        assert callable(export_airgap_package)


class TestIngest_airgap_package:
    """Test the ingest_airgap_package function."""

    def test_ingest_airgap_package_exists(self):
        """Verify ingest_airgap_package is callable."""
        assert callable(ingest_airgap_package)

