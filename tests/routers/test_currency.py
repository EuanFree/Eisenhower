"""Tests for the currency module.

Generated test suite covering 7 functions and 0 classes.
"""
import pytest

from app.routers.currency import (create_exchange_rate, list_exchange_rates, get_exchange_rate, update_exchange_rate, delete_exchange_rate, convert_amount, get_fx_variance)

class TestCreate_exchange_rate:
    """Test the create_exchange_rate function."""

    def test_create_exchange_rate_exists(self):
        """Verify create_exchange_rate is callable."""
        assert callable(create_exchange_rate)


class TestList_exchange_rates:
    """Test the list_exchange_rates function."""

    def test_list_exchange_rates_exists(self):
        """Verify list_exchange_rates is callable."""
        assert callable(list_exchange_rates)


class TestGet_exchange_rate:
    """Test the get_exchange_rate function."""

    def test_get_exchange_rate_exists(self):
        """Verify get_exchange_rate is callable."""
        assert callable(get_exchange_rate)


class TestUpdate_exchange_rate:
    """Test the update_exchange_rate function."""

    def test_update_exchange_rate_exists(self):
        """Verify update_exchange_rate is callable."""
        assert callable(update_exchange_rate)


class TestDelete_exchange_rate:
    """Test the delete_exchange_rate function."""

    def test_delete_exchange_rate_exists(self):
        """Verify delete_exchange_rate is callable."""
        assert callable(delete_exchange_rate)


class TestConvert_amount:
    """Test the convert_amount function."""

    def test_convert_amount_exists(self):
        """Verify convert_amount is callable."""
        assert callable(convert_amount)


class TestGet_fx_variance:
    """Test the get_fx_variance function."""

    def test_get_fx_variance_exists(self):
        """Verify get_fx_variance is callable."""
        assert callable(get_fx_variance)

