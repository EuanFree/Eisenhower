"""Tests for the copilot_context module.

Generated test suite covering 2 functions and 1 classes.
"""
import pytest

from app.services.copilot_context import (build_system_prompt, build_context_from_request)
from app.services.copilot_context import (CopilotContext)

class TestBuild_system_prompt:
    """Test the build_system_prompt function."""

    def test_build_system_prompt_exists(self):
        """Verify build_system_prompt is callable."""
        assert callable(build_system_prompt)


class TestBuild_context_from_request:
    """Test the build_context_from_request function."""

    def test_build_context_from_request_exists(self):
        """Verify build_context_from_request is callable."""
        assert callable(build_context_from_request)


class TestCopilotContext:
    """Test the CopilotContext class."""

    def test_copilotcontext_exists(self):
        """Verify CopilotContext can be imported."""
        assert CopilotContext is not None

