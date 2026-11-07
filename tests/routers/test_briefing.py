"""Tests for the briefing module.

Generated test suite covering 1 functions and 0 classes.
"""
import pytest

from app.routers.briefing import (generate_briefing_deck)

class TestGenerate_briefing_deck:
    """Test the generate_briefing_deck function."""

    def test_generate_briefing_deck_exists(self):
        """Verify generate_briefing_deck is callable."""
        assert callable(generate_briefing_deck)

