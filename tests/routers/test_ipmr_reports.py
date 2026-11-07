"""Tests for the ipmr_reports module.

Generated test suite covering 2 functions and 0 classes.
"""
import pytest

from app.routers.ipmr_reports import (generate_format1, generate_format5)

class TestGenerate_format1:
    """Test the generate_format1 function."""

    def test_generate_format1_exists(self):
        """Verify generate_format1 is callable."""
        assert callable(generate_format1)


class TestGenerate_format5:
    """Test the generate_format5 function."""

    def test_generate_format5_exists(self):
        """Verify generate_format5 is callable."""
        assert callable(generate_format5)

