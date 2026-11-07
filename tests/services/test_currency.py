"""Tests for the currency module.

Generated test suite covering 4 functions and 0 classes.
"""
import pytest

from app.services.currency import (resolve_exchange_rate, convert_currency, compute_currency_variance, convert_ledger_to_base_currency)

class TestResolve_exchange_rate:
    """Test the resolve_exchange_rate function."""

    def test_resolve_exchange_rate_exists(self):
        """Verify resolve_exchange_rate is callable."""
        assert callable(resolve_exchange_rate)


class TestConvert_currency:
    """Test the convert_currency function."""

    def test_convert_currency_exists(self):
        """Verify convert_currency is callable."""
        assert callable(convert_currency)


class TestCompute_currency_variance:
    """Test the compute_currency_variance function."""

    def test_compute_currency_variance_exists(self):
        """Verify compute_currency_variance is callable."""
        assert callable(compute_currency_variance)


class TestConvert_ledger_to_base_currency:
    """Test the convert_ledger_to_base_currency function."""

    def test_convert_ledger_to_base_currency_exists(self):
        """Verify convert_ledger_to_base_currency is callable."""
        assert callable(convert_ledger_to_base_currency)

