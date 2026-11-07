"""Tests for the authoring module.

Generated test suite covering 0 functions and 4 classes.
"""
import pytest

from app.schemas.authoring import (WorkItemCreate, ResourceCreate, WorkItemCreatedResponse, ResourceCreatedResponse)

class TestWorkItemCreate:
    """Test the WorkItemCreate class."""

    def test_workitemcreate_exists(self):
        """Verify WorkItemCreate can be imported."""
        assert WorkItemCreate is not None


class TestResourceCreate:
    """Test the ResourceCreate class."""

    def test_resourcecreate_exists(self):
        """Verify ResourceCreate can be imported."""
        assert ResourceCreate is not None


class TestWorkItemCreatedResponse:
    """Test the WorkItemCreatedResponse class."""

    def test_workitemcreatedresponse_exists(self):
        """Verify WorkItemCreatedResponse can be imported."""
        assert WorkItemCreatedResponse is not None


class TestResourceCreatedResponse:
    """Test the ResourceCreatedResponse class."""

    def test_resourcecreatedresponse_exists(self):
        """Verify ResourceCreatedResponse can be imported."""
        assert ResourceCreatedResponse is not None

