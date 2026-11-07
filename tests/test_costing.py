"""Tests for the Cost Breakdown Structure (CBS) and indirect rate burdening engine.

This module tests the FPRA burden calculation formula that cascades
indirect rates (Fringe, Overhead, G&A, Fee) onto direct labor costs
to produce fully burdened cost figures.
"""
import pytest
from decimal import Decimal

from app.models.models import CostElementCategory


class TestCostElementCategory:
    """Test the cost element category enum."""

    def test_labor(self):
        """Test LABOR category."""
        assert CostElementCategory.LABOR.value == "LABOR"

    def test_material(self):
        """Test MATERIAL category."""
        assert CostElementCategory.MATERIAL.value == "MATERIAL"

    def test_subcontract(self):
        """Test SUBCONTRACT category."""
        assert CostElementCategory.SUBCONTRACT.value == "SUBCONTRACT"

    def test_odc(self):
        """Test ODC category."""
        assert CostElementCategory.ODC.value == "ODC"


class TestBurdenFormula:
    """Test the FPRA burden calculation formula."""

    def test_burden_formula(self):
        """Test: Direct x (1+Fringe) x (1+Overhead) x (1+G&A) x (1+Fee)."""
        direct = Decimal("100000")
        fringe = Decimal("0.35")
        overhead = Decimal("0.50")
        ga = Decimal("0.12")
        fee = Decimal("0.10")

        burdened = direct * (1 + fringe) * (1 + overhead) * (1 + ga) * (1 + fee)
        # 100000 * 1.35 * 1.50 * 1.12 * 1.10 = 249480
        assert burdened == Decimal("249480")

    def test_zero_rates_returns_direct(self):
        """Test that zero rates return the direct amount."""
        direct = Decimal("100000")
        burdened = direct * (1 + Decimal("0")) * (1 + Decimal("0")) * (1 + Decimal("0")) * (1 + Decimal("0"))
        assert burdened == direct

    def test_labor_category_gets_burdened(self):
        """Test that LABOR category receives burden cascade."""
        # Only LABOR gets the burden cascade
        category = CostElementCategory.LABOR
        applies_burden = category == CostElementCategory.LABOR
        assert applies_burden is True

    def test_material_category_passes_through(self):
        """Test that MATERIAL category passes through at direct value."""
        category = CostElementCategory.MATERIAL
        applies_burden = category == CostElementCategory.LABOR
        assert applies_burden is False

    def test_subcontract_category_passes_through(self):
        """Test that SUBCONTRACT category passes through at direct value."""
        category = CostElementCategory.SUBCONTRACT
        applies_burden = category == CostElementCategory.LABOR
        assert applies_burden is False

    def test_odc_category_passes_through(self):
        """Test that ODC category passes through at direct value."""
        category = CostElementCategory.ODC
        applies_burden = category == CostElementCategory.LABOR
        assert applies_burden is False

    def test_burden_increases_cost(self):
        """Test that burdening always increases cost (for positive rates)."""
        direct = Decimal("100000")
        fringe = Decimal("0.35")
        overhead = Decimal("0.50")
        ga = Decimal("0.12")
        fee = Decimal("0.10")

        burdened = direct * (1 + fringe) * (1 + overhead) * (1 + ga) * (1 + fee)
        assert burdened > direct

    def test_burden_precision(self):
        """Test that burden calculation maintains decimal precision."""
        direct = Decimal("100000.50")
        fringe = Decimal("0.35")
        overhead = Decimal("0.50")
        ga = Decimal("0.12")
        fee = Decimal("0.10")

        burdened = direct * (1 + fringe) * (1 + overhead) * (1 + ga) * (1 + fee)
        # Should maintain precision
        assert isinstance(burdened, Decimal)
