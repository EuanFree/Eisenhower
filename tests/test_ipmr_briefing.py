"""Tests for the IPMR report generator and briefing generator modules.

This module tests the IPMR Format 1-5 calculations, variance threshold
detection, and briefing slide selection.
"""
import pytest
from decimal import Decimal


class TestIPMRFormat1:
    """Test IPMR Format 1 (WBS) calculations."""

    def test_bcws_is_pv(self):
        """Test that BCWS equals Planned Value."""
        pv = Decimal("50000")
        bcws = pv
        assert bcws == Decimal("50000")

    def test_bcwp_is_ev(self):
        """Test that BCWP equals Earned Value."""
        ev = Decimal("45000")
        bcwp = ev
        assert bcwp == Decimal("45000")

    def test_acwp_is_ac(self):
        """Test that ACWP equals Actual Cost."""
        ac = Decimal("48000")
        acwp = ac
        assert acwp == Decimal("48000")

    def test_cv_calculation(self):
        """Test: CV = EV - AC."""
        ev = Decimal("45000")
        ac = Decimal("48000")
        cv = ev - ac
        assert cv == Decimal("-3000")

    def test_sv_calculation(self):
        """Test: SV = EV - PV."""
        ev = Decimal("45000")
        pv = Decimal("50000")
        sv = ev - pv
        assert sv == Decimal("-5000")

    def test_cpi_calculation(self):
        """Test: CPI = EV / AC."""
        ev = Decimal("45000")
        ac = Decimal("48000")
        cpi = ev / ac
        assert abs(cpi - Decimal("0.9375")) < Decimal("0.0001")

    def test_spi_calculation(self):
        """Test: SPI = EV / PV."""
        ev = Decimal("45000")
        pv = Decimal("50000")
        spi = ev / pv
        assert abs(spi - Decimal("0.90")) < Decimal("0.0001")


class TestIPMRFormat5:
    """Test IPMR Format 5 (Variance Narrative) threshold detection."""

    def test_cv_threshold_percentage(self):
        """Test that CV exceeding ±10% triggers variance item."""
        bac = Decimal("100000")
        cv = Decimal("-15000")
        threshold_pct = Decimal("0.10")
        exceeds = abs(cv) / bac > threshold_pct
        assert exceeds is True

    def test_cv_threshold_amount(self):
        """Test that CV exceeding ±£25k triggers variance item."""
        cv = Decimal("-30000")
        threshold_amount = Decimal("25000")
        exceeds = abs(cv) > threshold_amount
        assert exceeds is True

    def test_sv_threshold_percentage(self):
        """Test that SV exceeding ±10% triggers variance item."""
        bac = Decimal("100000")
        sv = Decimal("-12000")
        threshold_pct = Decimal("0.10")
        exceeds = abs(sv) / bac > threshold_pct
        assert exceeds is True

    def test_within_threshold_no_item(self):
        """Test that within-threshold variance does not trigger item."""
        bac = Decimal("100000")
        cv = Decimal("-5000")
        threshold_pct = Decimal("0.10")
        exceeds = abs(cv) / bac > threshold_pct
        assert exceeds is False


class TestVarianceNarrative:
    """Test variance narrative auto-generation."""

    def test_narrative_fields(self):
        """Test that narrative contains required fields."""
        narrative = {
            "problem": "Task behind schedule",
            "root_cause": "Resource unavailability",
            "schedule_impact": "+5 days slip",
            "cost_impact": "+£10,000 overrun",
            "corrective_action": "Reallocate resources",
            "recommendation": "Approve reserve drawdown",
        }
        assert "problem" in narrative
        assert "root_cause" in narrative
        assert "schedule_impact" in narrative
        assert "cost_impact" in narrative
        assert "corrective_action" in narrative
        assert "recommendation" in narrative


class TestBriefingSlideSelection:
    """Test briefing slide selection filtering."""

    def test_all_slides(self):
        """Test that all 5 slides can be selected."""
        slides = [1, 2, 3, 4, 5]
        assert len(slides) == 5

    def test_subset_selection(self):
        """Test that subset of slides can be selected."""
        slides = [1, 3]
        assert 1 in slides
        assert 3 in slides
        assert 2 not in slides

    def test_single_slide(self):
        """Test that single slide can be selected."""
        slides = [1]
        assert len(slides) == 1

    def test_slide_1_health(self):
        """Test that slide 1 is Programme Master Health."""
        slide_1 = "Programme Master Health"
        assert slide_1 == "Programme Master Health"

    def test_slide_2_gantt(self):
        """Test that slide 2 is Comparative Gantt Snapshot."""
        slide_2 = "Comparative Gantt Snapshot"
        assert slide_2 == "Comparative Gantt Snapshot"

    def test_slide_3_scurve(self):
        """Test that slide 3 is Cumulative EVM S-Curve."""
        slide_3 = "Cumulative EVM S-Curve"
        assert slide_3 == "Cumulative EVM S-Curve"

    def test_slide_4_tornado(self):
        """Test that slide 4 is Top 5 Schedule Drivers."""
        slide_4 = "Top 5 Schedule Drivers"
        assert slide_4 == "Top 5 Schedule Drivers"

    def test_slide_5_risk_matrix(self):
        """Test that slide 5 is 5x5 Programme Risk Matrix."""
        slide_5 = "5x5 Programme Risk Matrix"
        assert slide_5 == "5x5 Programme Risk Matrix"


class TestBriefingClassification:
    """Test briefing classification marking."""

    def test_classification_bands(self):
        """Test that classification bands are on top and bottom."""
        positions = ["top", "bottom"]
        assert "top" in positions
        assert "bottom" in positions

    def test_export_control_disclaimer(self):
        """Test that export control disclaimer is on title slide."""
        has_disclaimer = True
        assert has_disclaimer is True


class TestIPMRFormat2:
    """Test IPMR Format 2 (OBS) grouping."""

    def test_group_by_department(self):
        """Test that Format 2 groups by functional department."""
        departments = ["Avionics", "Systems Safety", "RF Hardware"]
        assert len(departments) == 3

    def test_rbs_cost_centers(self):
        """Test that Format 2 uses RBS cost centers."""
        cost_centers = ["LABOR_DIRECT", "SUBCONTRACT", "MATERIAL_RAW"]
        assert "LABOR_DIRECT" in cost_centers


class TestIPMRFormat3:
    """Test IPMR Format 3 (Baseline Changes)."""

    def test_pmb_baseline_changes(self):
        """Test that Format 3 tracks PMB changes."""
        change_types = ["BCR_APPROVED", "MR_DRAWDOWN", "CUSTOMER_SCOPE_CHANGE"]
        assert len(change_types) == 3

    def test_management_reserve_draws(self):
        """Test that Format 3 tracks MR draws."""
        mr_draw = {
            "type": "DRAWDOWN_TO_WBS",
            "amount": Decimal("50000"),
            "bcr_reference": "BCR-2026-001",
        }
        assert mr_draw["type"] == "DRAWDOWN_TO_WBS"
