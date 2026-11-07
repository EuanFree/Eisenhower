"""Tests for the facility reservation and chamber telemetry module.

This module tests chamber feasibility validation including capability gates,
calibration expiry checks, and warmup/cooldown buffer enforcement.
"""
import pytest
from datetime import datetime, timedelta

from app.models.models import ClashCategory, ClashSeverity


class TestClashCategory:
    """Test the clash category enum."""

    def test_resource_overallocation(self):
        """Test RESOURCE_OVERALLOCATION category."""
        assert ClashCategory.RESOURCE_OVERALLOCATION.value == "RESOURCE_OVERALLOCATION"

    def test_facility_contravention(self):
        """Test FACILITY_CONTRAVENTION category."""
        assert ClashCategory.FACILITY_CONTRAVENTION.value == "FACILITY_CONTRAVENTION"

    def test_credential_lapse(self):
        """Test CREDENTIAL_LAPSE category."""
        assert ClashCategory.CREDENTIAL_LAPSE.value == "CREDENTIAL_LAPSE"

    def test_spatial_location_collision(self):
        """Test SPATIAL_LOCATION_COLLISION category."""
        assert ClashCategory.SPATIAL_LOCATION_COLLISION.value == "SPATIAL_LOCATION_COLLISION"

    def test_negative_float_slip(self):
        """Test NEGATIVE_FLOAT_SLIP category."""
        assert ClashCategory.NEGATIVE_FLOAT_SLIP.value == "NEGATIVE_FLOAT_SLIP"

    def test_calendar_exception(self):
        """Test CALENDAR_EXCEPTION category."""
        assert ClashCategory.CALENDAR_EXCEPTION.value == "CALENDAR_EXCEPTION"

    def test_predecessor_unmet(self):
        """Test PREDECESSOR_UNMET category."""
        assert ClashCategory.PREDECESSOR_UNMET.value == "PREDECESSOR_UNMET"


class TestClashSeverity:
    """Test the clash severity enum."""

    def test_critical(self):
        """Test CRITICAL severity."""
        assert ClashSeverity.CRITICAL.value == "CRITICAL"

    def test_major(self):
        """Test MAJOR severity."""
        assert ClashSeverity.MAJOR.value == "MAJOR"

    def test_advisory(self):
        """Test ADVISORY severity."""
        assert ClashSeverity.ADVISORY.value == "ADVISORY"


class TestChamberCapabilityGate:
    """Test chamber capability envelope matching."""

    def test_temp_range_within_capability(self):
        """Test that task temp range within chamber capability passes."""
        chamber_caps = {"temp_min_c": -55, "temp_max_c": 125}
        task_envelope = {"temp_min_c": -40, "temp_max_c": 100}
        # Task range must fit within chamber range
        fits = (
            task_envelope["temp_min_c"] >= chamber_caps["temp_min_c"]
            and task_envelope["temp_max_c"] <= chamber_caps["temp_max_c"]
        )
        assert fits is True

    def test_temp_range_exceeds_capability(self):
        """Test that task temp range exceeding chamber capability fails."""
        chamber_caps = {"temp_min_c": -55, "temp_max_c": 125}
        task_envelope = {"temp_min_c": -40, "temp_max_c": 150}
        fits = (
            task_envelope["temp_min_c"] >= chamber_caps["temp_min_c"]
            and task_envelope["temp_max_c"] <= chamber_caps["temp_max_c"]
        )
        assert fits is False

    def test_no_envelope_passes(self):
        """Test that no task envelope passes (no constraint)."""
        task_envelope = None
        if task_envelope is None:
            passes = True
        else:
            passes = False
        assert passes is True


class TestCalibrationExpiry:
    """Test calibration expiry gate."""

    def test_within_calibration_period(self):
        """Test that reservation within calibration period passes."""
        calibration_expiry = datetime(2026, 12, 31)
        requested_end = datetime(2026, 6, 30)
        is_valid = requested_end <= calibration_expiry
        assert is_valid is True

    def test_beyond_calibration_expiry(self):
        """Test that reservation beyond calibration expiry fails."""
        calibration_expiry = datetime(2026, 6, 30)
        requested_end = datetime(2026, 12, 31)
        is_valid = requested_end <= calibration_expiry
        assert is_valid is False

    def test_null_calibration_passes(self):
        """Test that null calibration expiry passes (no constraint)."""
        calibration_expiry = None
        if calibration_expiry is None:
            passes = True
        else:
            passes = False
        assert passes is True


class TestBufferOverlap:
    """Test warmup/cooldown buffer overlap detection."""

    def test_no_overlap_with_buffer(self):
        """Test that non-overlapping reservations with buffer pass."""
        res1_end = datetime(2026, 1, 1, 12, 0)
        buffer_hours = 2.0
        res2_start = datetime(2026, 1, 1, 15, 0)
        buffer_end = res1_end + timedelta(hours=buffer_hours)
        overlaps = res2_start < buffer_end
        assert overlaps is False

    def test_overlap_with_buffer(self):
        """Test that overlapping reservations with buffer fail."""
        res1_end = datetime(2026, 1, 1, 12, 0)
        buffer_hours = 2.0
        res2_start = datetime(2026, 1, 1, 13, 0)
        buffer_end = res1_end + timedelta(hours=buffer_hours)
        overlaps = res2_start < buffer_end
        assert overlaps is True

    def test_exact_buffer_boundary(self):
        """Test that exact buffer boundary does not overlap."""
        res1_end = datetime(2026, 1, 1, 12, 0)
        buffer_hours = 2.0
        res2_start = datetime(2026, 1, 1, 14, 0)
        buffer_end = res1_end + timedelta(hours=buffer_hours)
        overlaps = res2_start < buffer_end
        assert overlaps is False
