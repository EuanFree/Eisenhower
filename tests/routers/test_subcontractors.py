"""Tests for the subcontractors module.

Generated test suite covering 6 functions and 0 classes.
"""
import pytest

from app.routers.subcontractors import (upload_submission, get_validation_report, approve_and_merge_submission, generate_staging_diff_endpoint, list_submissions, get_submission)

class TestUpload_submission:
    """Test the upload_submission function."""

    def test_upload_submission_exists(self):
        """Verify upload_submission is callable."""
        assert callable(upload_submission)


class TestGet_validation_report:
    """Test the get_validation_report function."""

    def test_get_validation_report_exists(self):
        """Verify get_validation_report is callable."""
        assert callable(get_validation_report)


class TestApprove_and_merge_submission:
    """Test the approve_and_merge_submission function."""

    def test_approve_and_merge_submission_exists(self):
        """Verify approve_and_merge_submission is callable."""
        assert callable(approve_and_merge_submission)


class TestGenerate_staging_diff_endpoint:
    """Test the generate_staging_diff_endpoint function."""

    def test_generate_staging_diff_endpoint_exists(self):
        """Verify generate_staging_diff_endpoint is callable."""
        assert callable(generate_staging_diff_endpoint)


class TestList_submissions:
    """Test the list_submissions function."""

    def test_list_submissions_exists(self):
        """Verify list_submissions is callable."""
        assert callable(list_submissions)


class TestGet_submission:
    """Test the get_submission function."""

    def test_get_submission_exists(self):
        """Verify get_submission is callable."""
        assert callable(get_submission)

