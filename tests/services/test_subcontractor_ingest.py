"""Tests for the subcontractor_ingest module.

Generated test suite covering 4 functions and 2 classes.
"""
import pytest

from app.services.subcontractor_ingest import (parse_external_schedule, validate_against_contractual_boundary, generate_staging_diff, merge_submission_to_live)
from app.services.subcontractor_ingest import (ParsedTask, ParsedDependency)

class TestParse_external_schedule:
    """Test the parse_external_schedule function."""

    def test_parse_external_schedule_exists(self):
        """Verify parse_external_schedule is callable."""
        assert callable(parse_external_schedule)


class TestValidate_against_contractual_boundary:
    """Test the validate_against_contractual_boundary function."""

    def test_validate_against_contractual_boundary_exists(self):
        """Verify validate_against_contractual_boundary is callable."""
        assert callable(validate_against_contractual_boundary)


class TestGenerate_staging_diff:
    """Test the generate_staging_diff function."""

    def test_generate_staging_diff_exists(self):
        """Verify generate_staging_diff is callable."""
        assert callable(generate_staging_diff)


class TestMerge_submission_to_live:
    """Test the merge_submission_to_live function."""

    def test_merge_submission_to_live_exists(self):
        """Verify merge_submission_to_live is callable."""
        assert callable(merge_submission_to_live)


class TestParsedTask:
    """Test the ParsedTask class."""

    def test_parsedtask_exists(self):
        """Verify ParsedTask can be imported."""
        assert ParsedTask is not None


class TestParsedDependency:
    """Test the ParsedDependency class."""

    def test_parseddependency_exists(self):
        """Verify ParsedDependency can be imported."""
        assert ParsedDependency is not None

