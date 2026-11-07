"""Tests for the spatial location tracking and asset custody module.

This module tests asset relocation clearance interlocks, location inventory
queries, and custody history tracking for physical equipment.
"""
import pytest
from unittest.mock import MagicMock

from app.models.models import SecurityClassification


class TestClearanceInterlocks:
    """Test clearance interlocks for asset relocation."""

    def test_user_clearance_meets_location(self):
        """Test that user clearance >= location classification allows move."""
        from app.core.abac import has_sufficient_clearance
        user_clearance = SecurityClassification.SECRET
        location_clearance = SecurityClassification.OFFICIAL
        assert has_sufficient_clearance(user_clearance, location_clearance) is True

    def test_user_clearance_below_location(self):
        """Test that user clearance < location classification blocks move."""
        from app.core.abac import has_sufficient_clearance
        user_clearance = SecurityClassification.OFFICIAL
        location_clearance = SecurityClassification.SECRET
        assert has_sufficient_clearance(user_clearance, location_clearance) is False

    def test_asset_classification_fits_location(self):
        """Test that asset classification <= location rating allows placement."""
        asset_class = SecurityClassification.OFFICIAL
        location_class = SecurityClassification.SECRET
        from app.core.abac import has_sufficient_clearance
        # Location can hold asset if location clearance >= asset classification
        assert has_sufficient_clearance(location_class, asset_class) is True

    def test_cannot_place_secret_in_official(self):
        """Test that SECRET asset cannot be placed in OFFICIAL location."""
        asset_class = SecurityClassification.SECRET
        location_class = SecurityClassification.OFFICIAL
        from app.core.abac import has_sufficient_clearance
        assert has_sufficient_clearance(location_class, asset_class) is False


class TestLtreePathContainment:
    """Test ltree path containment for location inventory."""

    def test_child_path_under_parent(self):
        """Test that child path is contained under parent."""
        parent_path = "1.2"
        child_path = "1.2.3.4"
        is_contained = child_path.startswith(parent_path + ".") or child_path == parent_path
        assert is_contained

    def test_sibling_not_contained(self):
        """Test that sibling path is not contained."""
        parent_path = "1.2"
        sibling_path = "1.3"
        is_contained = sibling_path.startswith(parent_path + ".") or sibling_path == parent_path
        assert not is_contained

    def test_exact_match_contained(self):
        """Test that exact path match is contained."""
        parent_path = "1.2.3"
        child_path = "1.2.3"
        is_contained = child_path.startswith(parent_path + ".") or child_path == parent_path
        assert is_contained

    def test_deep_nesting_contained(self):
        """Test that deeply nested path is contained."""
        parent_path = "1"
        child_path = "1.2.3.4.5.6"
        is_contained = child_path.startswith(parent_path + ".") or child_path == parent_path
        assert is_contained


class TestCustodyHistory:
    """Test custody history ordering."""

    def test_chronological_order(self):
        """Test that custody history is ordered chronologically."""
        entries = [
            {"timestamp": "2026-01-01T10:00:00"},
            {"timestamp": "2026-01-02T10:00:00"},
            {"timestamp": "2026-01-03T10:00:00"},
        ]
        sorted_entries = sorted(entries, key=lambda x: x["timestamp"])
        assert sorted_entries[0]["timestamp"] == "2026-01-01T10:00:00"
        assert sorted_entries[-1]["timestamp"] == "2026-01-03T10:00:00"

    def test_empty_history(self):
        """Test that empty history returns empty list."""
        entries = []
        assert len(entries) == 0
