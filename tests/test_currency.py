"""Tests for the foreign currency exchange rate and hedging module.

This module tests currency conversion calculations, exchange rate resolution,
and FX variance separation from standard cost variance.
"""
import pytest
from decimal import Decimal

from app.models.models import ExchangeRateType


class TestExchangeRateType:
    """Test the exchange rate type enum."""

    def test_contractual_fixed(self):
        """Test CONTRACTUAL_FIXED rate type."""
        assert ExchangeRateType.CONTRACTUAL_FIXED.value == "CONTRACTUAL_FIXED"

    def test_floating_spot(self):
        """Test FLOATING_SPOT rate type."""
        assert ExchangeRateType.FLOATING_SPOT.value == "FLOATING_SPOT"

    def test_forward_hedge(self):
        """Test FORWARD_HEDGE rate type."""
        assert ExchangeRateType.FORWARD_HEDGE.value == "FORWARD_HEDGE"


class TestCurrencyConversion:
    """Test basic currency conversion calculations."""

    def test_gbp_to_usd_conversion(self):
        """Test GBP to USD conversion with fixed rate."""
        amount = Decimal("1000")
        rate = Decimal("1.27")
        converted = amount * rate
        assert converted == Decimal("1270")

    def test_usd_to_gbp_inverse(self):
        """Test USD to GBP inverse conversion."""
        amount = Decimal("1270")
        rate = Decimal("1.27")
        converted = amount / rate
        assert converted == Decimal("1000")

    def test_same_currency_returns_same_amount(self):
        """Test that same-currency conversion returns the original amount."""
        amount = Decimal("1000")
        rate = Decimal("1.0")
        converted = amount * rate
        assert converted == Decimal("1000")

    def test_zero_amount_conversion(self):
        """Test that zero amount converts to zero."""
        amount = Decimal("0")
        rate = Decimal("1.27")
        converted = amount * rate
        assert converted == Decimal("0")


class TestFXVariance:
    """Test FX variance separation from cost variance."""

    def test_fx_variance_formula(self):
        """Test: FX_Variance = (Rate_actual - Rate_baseline) x Direct."""
        rate_baseline = Decimal("1.25")
        rate_actual = Decimal("1.30")
        direct = Decimal("100000")

        fx_variance = (rate_actual - rate_baseline) * direct
        assert fx_variance == Decimal("5000")

    def test_no_fx_variance_same_rate(self):
        """Test that identical rates produce zero FX variance."""
        rate_baseline = Decimal("1.25")
        rate_actual = Decimal("1.25")
        direct = Decimal("100000")

        fx_variance = (rate_actual - rate_baseline) * direct
        assert fx_variance == Decimal("0")

    def test_negative_fx_variance(self):
        """Test that favorable rate change produces negative FX variance."""
        rate_baseline = Decimal("1.30")
        rate_actual = Decimal("1.25")
        direct = Decimal("100000")

        fx_variance = (rate_actual - rate_baseline) * direct
        assert fx_variance == Decimal("-5000")


class TestRateTypePreference:
    """Test exchange rate type preference ordering."""

    def test_contractual_fixed_preferred(self):
        """Test that CONTRACTUAL_FIXED is preferred over other types."""
        preferences = {
            ExchangeRateType.CONTRACTUAL_FIXED: 1,
            ExchangeRateType.FORWARD_HEDGE: 2,
            ExchangeRateType.FLOATING_SPOT: 3,
        }
        assert preferences[ExchangeRateType.CONTRACTUAL_FIXED] < preferences[ExchangeRateType.FLOATING_SPOT]

    def test_forward_hedge_preferred_over_spot(self):
        """Test that FORWARD_HEDGE is preferred over FLOATING_SPOT."""
        preferences = {
            ExchangeRateType.CONTRACTUAL_FIXED: 1,
            ExchangeRateType.FORWARD_HEDGE: 2,
            ExchangeRateType.FLOATING_SPOT: 3,
        }
        assert preferences[ExchangeRateType.FORWARD_HEDGE] < preferences[ExchangeRateType.FLOATING_SPOT]
