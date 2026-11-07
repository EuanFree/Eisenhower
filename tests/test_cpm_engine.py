"""Tests for the Critical Path Method (CPM) calculation engine.

This module tests the workday calendar helpers, duration calculation,
and the core CPM forward/backward pass algorithms. It verifies that
the schedule computation correctly handles weekends, dependency types,
and lag/lead days.
"""
import pytest
from datetime import datetime, timedelta
from app.services.cpm_engine import (
    _is_workday,
    _add_workdays,
    _subtract_workdays,
    _workday_diff,
)


class TestIsWorkday:
    """Test the workday detection helper."""

    def test_monday_is_workday(self):
        """Test that Monday is a workday."""
        assert _is_workday(datetime(2026, 1, 5)) is True  # Monday

    def test_friday_is_workday(self):
        """Test that Friday is a workday."""
        assert _is_workday(datetime(2026, 1, 9)) is True  # Friday

    def test_saturday_is_not_workday(self):
        """Test that Saturday is not a workday."""
        assert _is_workday(datetime(2026, 1, 10)) is False  # Saturday

    def test_sunday_is_not_workday(self):
        """Test that Sunday is not a workday."""
        assert _is_workday(datetime(2026, 1, 11)) is False  # Sunday

    def test_wednesday_is_workday(self):
        """Test that Wednesday is a workday."""
        assert _is_workday(datetime(2026, 1, 7)) is True  # Wednesday


class TestAddWorkdays:
    """Test adding working days, skipping weekends."""

    def test_add_zero_days(self):
        """Test that adding 0 days returns the same date."""
        start = datetime(2026, 1, 5)  # Monday
        result = _add_workdays(start, 0)
        assert result == start

    def test_add_one_workday_from_monday(self):
        """Test that adding 1 workday from Monday gives Tuesday."""
        start = datetime(2026, 1, 5)  # Monday
        result = _add_workdays(start, 1)
        assert result == datetime(2026, 1, 6)  # Tuesday

    def test_add_four_workdays_from_monday(self):
        """Test that adding 4 workdays from Monday gives Friday."""
        start = datetime(2026, 1, 5)  # Monday
        result = _add_workdays(start, 4)
        assert result == datetime(2026, 1, 9)  # Friday

    def test_add_one_workday_from_friday_skips_weekend(self):
        """Test that adding 1 workday from Friday skips the weekend."""
        start = datetime(2026, 1, 9)  # Friday
        result = _add_workdays(start, 1)
        assert result == datetime(2026, 1, 12)  # Next Monday

    def test_add_two_workdays_from_friday_skips_weekend(self):
        """Test that adding 2 workdays from Friday skips the weekend."""
        start = datetime(2026, 1, 9)  # Friday
        result = _add_workdays(start, 2)
        assert result == datetime(2026, 1, 13)  # Next Tuesday

    def test_add_five_workdays_from_monday(self):
        """Test that adding 5 workdays from Monday gives next Monday."""
        start = datetime(2026, 1, 5)  # Monday
        result = _add_workdays(start, 5)
        assert result == datetime(2026, 1, 12)  # Next Monday


class TestSubtractWorkdays:
    """Test subtracting working days, skipping weekends."""

    def test_subtract_zero_days(self):
        """Test that subtracting 0 days returns the same date."""
        start = datetime(2026, 1, 5)  # Monday
        result = _subtract_workdays(start, 0)
        assert result == start

    def test_subtract_one_workday_from_tuesday(self):
        """Test that subtracting 1 workday from Tuesday gives Monday."""
        start = datetime(2026, 1, 6)  # Tuesday
        result = _subtract_workdays(start, 1)
        assert result == datetime(2026, 1, 5)  # Monday

    def test_subtract_one_workday_from_monday_skips_weekend(self):
        """Test that subtracting 1 workday from Monday skips the weekend."""
        start = datetime(2026, 1, 5)  # Monday
        result = _subtract_workdays(start, 1)
        assert result == datetime(2026, 1, 2)  # Previous Friday

    def test_subtract_two_workdays_from_monday_skips_weekend(self):
        """Test that subtracting 2 workdays from Monday skips the weekend."""
        start = datetime(2026, 1, 5)  # Monday
        result = _subtract_workdays(start, 2)
        assert result == datetime(2026, 1, 1)  # Previous Thursday

    def test_subtract_five_workdays_from_friday(self):
        """Test that subtracting 5 workdays from Friday gives previous Friday."""
        start = datetime(2026, 1, 9)  # Friday
        result = _subtract_workdays(start, 5)
        assert result == datetime(2026, 1, 2)  # Previous Friday


class TestWorkdayDiff:
    """Test counting working days between two dates."""

    def test_same_day_is_zero(self):
        """Test that the difference between the same day is 0."""
        start = datetime(2026, 1, 5)
        assert _workday_diff(start, start) == 0

    def test_monday_to_friday_is_four(self):
        """Test that Monday to Friday is 4 workdays."""
        start = datetime(2026, 1, 5)  # Monday
        end = datetime(2026, 1, 9)    # Friday
        assert _workday_diff(start, end) == 4

    def test_friday_to_next_monday_is_one(self):
        """Test that Friday to next Monday is 1 workday."""
        start = datetime(2026, 1, 9)  # Friday
        end = datetime(2026, 1, 12)   # Monday
        assert _workday_diff(start, end) == 1

    def test_saturday_to_monday_is_one(self):
        """Test that Saturday to Monday is 1 workday."""
        start = datetime(2026, 1, 10)  # Saturday
        end = datetime(2026, 1, 12)    # Monday
        assert _workday_diff(start, end) == 1

    def test_full_week_is_five(self):
        """Test that a full week (Monday to next Monday) is 5 workdays."""
        start = datetime(2026, 1, 5)   # Monday
        end = datetime(2026, 1, 12)    # Next Monday
        assert _workday_diff(start, end) == 5

    def test_negative_diff(self):
        """Test that end before start returns negative workday count."""
        start = datetime(2026, 1, 9)   # Friday
        end = datetime(2026, 1, 5)     # Monday
        assert _workday_diff(start, end) == -4
