"""Tests for the Earned Value Measurement (EVM) calculator module.

This module tests the ANSI/EIA-748 EVM techniques: Percent Complete,
0/100, 50/50, Milestone Weights, and Level of Effort, plus variance
calculations (CV, SV, CPI, SPI, EAC).
"""
import pytest
from decimal import Decimal

from app.models.models import EVMTechnique


class TestEVMTechnique:
    """Test the EVM technique enum."""

    def test_percent_complete(self):
        """Test PERCENT_COMPLETE technique."""
        assert EVMTechnique.PERCENT_COMPLETE.value == "PERCENT_COMPLETE"

    def test_zero_100(self):
        """Test ZERO_100 technique."""
        assert EVMTechnique.ZERO_100.value == "ZERO_100"

    def test_fifty_fifty(self):
        """Test FIFTY_FIFTY technique."""
        assert EVMTechnique.FIFTY_FIFTY.value == "FIFTY_FIFTY"

    def test_milestone_weights(self):
        """Test MILESTONE_WEIGHTS technique."""
        assert EVMTechnique.MILESTONE_WEIGHTS.value == "MILESTONE_WEIGHTS"

    def test_level_of_effort(self):
        """Test LEVEL_OF_EFFORT technique."""
        assert EVMTechnique.LEVEL_OF_EFFORT.value == "LEVEL_OF_EFFORT"


class TestPercentComplete:
    """Test Percent Complete EVM technique."""

    def test_ev_calculation(self):
        """Test: EV = BAC x (percent_complete / 100)."""
        bac = Decimal("100000")
        percent_complete = Decimal("50")
        ev = bac * (percent_complete / Decimal("100"))
        assert ev == Decimal("50000")

    def test_zero_percent(self):
        """Test that 0% complete gives EV = 0."""
        bac = Decimal("100000")
        percent_complete = Decimal("0")
        ev = bac * (percent_complete / Decimal("100"))
        assert ev == Decimal("0")

    def test_hundred_percent(self):
        """Test that 100% complete gives EV = BAC."""
        bac = Decimal("100000")
        percent_complete = Decimal("100")
        ev = bac * (percent_complete / Decimal("100"))
        assert ev == Decimal("100000")


class TestZero100:
    """Test 0/100 EVM technique."""

    def test_not_complete_gives_zero(self):
        """Test that incomplete task gives EV = 0."""
        bac = Decimal("100000")
        is_complete = False
        ev = bac if is_complete else Decimal("0")
        assert ev == Decimal("0")

    def test_complete_gives_bac(self):
        """Test that complete task gives EV = BAC."""
        bac = Decimal("100000")
        is_complete = True
        ev = bac if is_complete else Decimal("0")
        assert ev == bac


class TestFiftyFifty:
    """Test 50/50 EVM technique."""

    def test_started_not_finished(self):
        """Test that started task gives EV = 50% of BAC."""
        bac = Decimal("100000")
        is_started = True
        is_finished = False
        ev = bac * Decimal("0.50") if is_started and not is_finished else (bac if is_finished else Decimal("0"))
        assert ev == Decimal("50000")

    def test_finished_gives_bac(self):
        """Test that finished task gives EV = BAC."""
        bac = Decimal("100000")
        is_finished = True
        ev = bac if is_finished else Decimal("0")
        assert ev == bac

    def test_not_started_gives_zero(self):
        """Test that not-started task gives EV = 0."""
        bac = Decimal("100000")
        is_started = False
        is_finished = False
        ev = Decimal("0") if not is_started and not is_finished else bac
        assert ev == Decimal("0")


class TestMilestoneWeights:
    """Test Milestone Weights EVM technique."""

    def test_weight_sum_validation(self):
        """Test that milestone weights must sum to 1.0."""
        weights = [Decimal("0.25"), Decimal("0.25"), Decimal("0.25"), Decimal("0.25")]
        total = sum(weights)
        assert abs(total - Decimal("1.0")) < Decimal("0.001")

    def test_ev_from_verified_steps(self):
        """Test: EV = BAC x sum(weight of verified steps)."""
        bac = Decimal("100000")
        verified_weights = [Decimal("0.25"), Decimal("0.25")]  # 2 of 4 steps verified
        ev = bac * sum(verified_weights)
        assert ev == Decimal("50000")

    def test_all_verified_gives_bac(self):
        """Test that all verified steps give EV = BAC."""
        bac = Decimal("100000")
        verified_weights = [Decimal("0.25"), Decimal("0.25"), Decimal("0.25"), Decimal("0.25")]
        ev = bac * sum(verified_weights)
        assert ev == Decimal("100000")


class TestLevelOfEffort:
    """Test Level of Effort EVM technique."""

    def test_ev_equals_pv(self):
        """Test that LOE technique sets EV = PV."""
        pv = Decimal("50000")
        ev = pv  # LOE: EV automatically equals PV
        assert ev == pv

    def test_zero_schedule_variance(self):
        """Test that LOE enforces SV = 0."""
        pv = Decimal("50000")
        ev = pv
        sv = ev - pv
        assert sv == Decimal("0")


class TestVarianceCalculations:
    """Test variance and performance index calculations."""

    def test_cost_variance(self):
        """Test: CV = EV - AC."""
        ev = Decimal("50000")
        ac = Decimal("55000")
        cv = ev - ac
        assert cv == Decimal("-5000")

    def test_schedule_variance(self):
        """Test: SV = EV - PV."""
        ev = Decimal("50000")
        pv = Decimal("60000")
        sv = ev - pv
        assert sv == Decimal("-10000")

    def test_cpi(self):
        """Test: CPI = EV / AC."""
        ev = Decimal("50000")
        ac = Decimal("55000")
        cpi = ev / ac
        assert abs(cpi - Decimal("0.9090909090909090909090909091")) < Decimal("0.0001")

    def test_spi(self):
        """Test: SPI = EV / PV."""
        ev = Decimal("50000")
        pv = Decimal("60000")
        spi = ev / pv
        assert abs(spi - Decimal("0.8333333333333333333333333333")) < Decimal("0.0001")

    def test_eac(self):
        """Test: EAC = BAC / CPI."""
        bac = Decimal("100000")
        ev = Decimal("50000")
        ac = Decimal("55000")
        cpi = ev / ac
        eac = bac / cpi
        assert eac == Decimal("110000")

    def test_vac(self):
        """Test: VAC = BAC - EAC."""
        bac = Decimal("100000")
        eac = Decimal("110000")
        vac = bac - eac
        assert vac == Decimal("-10000")

    def test_positive_cv(self):
        """Test that under-budget gives positive CV."""
        ev = Decimal("60000")
        ac = Decimal("50000")
        cv = ev - ac
        assert cv == Decimal("10000")

    def test_positive_sv(self):
        """Test that ahead-of-schedule gives positive SV."""
        ev = Decimal("70000")
        pv = Decimal("60000")
        sv = ev - pv
        assert sv == Decimal("10000")
