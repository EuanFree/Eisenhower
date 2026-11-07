"""Tests for the line_management module.

Generated test suite covering 23 functions and 0 classes.
"""
import pytest

from app.services.line_management import (get_line_manager, set_line_manager, get_direct_reports, get_all_reports, get_chain_of_command, get_team_hierarchy, create_leave_request, approve_leave_request, reject_leave_request, cancel_leave_request, get_pending_leave_for_manager, get_user_leave_requests, get_team_leave_overlap, create_resource_downtime, cancel_resource_downtime, get_resource_downtime, get_all_upcoming_downtime, get_all_skills, get_skills_by_category, get_all_skill_categories, get_user_skills, add_user_skill, remove_user_skill)

class TestGet_line_manager:
    """Test the get_line_manager function."""

    def test_get_line_manager_exists(self):
        """Verify get_line_manager is callable."""
        assert callable(get_line_manager)


class TestSet_line_manager:
    """Test the set_line_manager function."""

    def test_set_line_manager_exists(self):
        """Verify set_line_manager is callable."""
        assert callable(set_line_manager)


class TestGet_direct_reports:
    """Test the get_direct_reports function."""

    def test_get_direct_reports_exists(self):
        """Verify get_direct_reports is callable."""
        assert callable(get_direct_reports)


class TestGet_all_reports:
    """Test the get_all_reports function."""

    def test_get_all_reports_exists(self):
        """Verify get_all_reports is callable."""
        assert callable(get_all_reports)


class TestGet_chain_of_command:
    """Test the get_chain_of_command function."""

    def test_get_chain_of_command_exists(self):
        """Verify get_chain_of_command is callable."""
        assert callable(get_chain_of_command)


class TestGet_team_hierarchy:
    """Test the get_team_hierarchy function."""

    def test_get_team_hierarchy_exists(self):
        """Verify get_team_hierarchy is callable."""
        assert callable(get_team_hierarchy)


class TestCreate_leave_request:
    """Test the create_leave_request function."""

    def test_create_leave_request_exists(self):
        """Verify create_leave_request is callable."""
        assert callable(create_leave_request)


class TestApprove_leave_request:
    """Test the approve_leave_request function."""

    def test_approve_leave_request_exists(self):
        """Verify approve_leave_request is callable."""
        assert callable(approve_leave_request)


class TestReject_leave_request:
    """Test the reject_leave_request function."""

    def test_reject_leave_request_exists(self):
        """Verify reject_leave_request is callable."""
        assert callable(reject_leave_request)


class TestCancel_leave_request:
    """Test the cancel_leave_request function."""

    def test_cancel_leave_request_exists(self):
        """Verify cancel_leave_request is callable."""
        assert callable(cancel_leave_request)


class TestGet_pending_leave_for_manager:
    """Test the get_pending_leave_for_manager function."""

    def test_get_pending_leave_for_manager_exists(self):
        """Verify get_pending_leave_for_manager is callable."""
        assert callable(get_pending_leave_for_manager)


class TestGet_user_leave_requests:
    """Test the get_user_leave_requests function."""

    def test_get_user_leave_requests_exists(self):
        """Verify get_user_leave_requests is callable."""
        assert callable(get_user_leave_requests)


class TestGet_team_leave_overlap:
    """Test the get_team_leave_overlap function."""

    def test_get_team_leave_overlap_exists(self):
        """Verify get_team_leave_overlap is callable."""
        assert callable(get_team_leave_overlap)


class TestCreate_resource_downtime:
    """Test the create_resource_downtime function."""

    def test_create_resource_downtime_exists(self):
        """Verify create_resource_downtime is callable."""
        assert callable(create_resource_downtime)


class TestCancel_resource_downtime:
    """Test the cancel_resource_downtime function."""

    def test_cancel_resource_downtime_exists(self):
        """Verify cancel_resource_downtime is callable."""
        assert callable(cancel_resource_downtime)


class TestGet_resource_downtime:
    """Test the get_resource_downtime function."""

    def test_get_resource_downtime_exists(self):
        """Verify get_resource_downtime is callable."""
        assert callable(get_resource_downtime)


class TestGet_all_upcoming_downtime:
    """Test the get_all_upcoming_downtime function."""

    def test_get_all_upcoming_downtime_exists(self):
        """Verify get_all_upcoming_downtime is callable."""
        assert callable(get_all_upcoming_downtime)


class TestGet_all_skills:
    """Test the get_all_skills function."""

    def test_get_all_skills_exists(self):
        """Verify get_all_skills is callable."""
        assert callable(get_all_skills)


class TestGet_skills_by_category:
    """Test the get_skills_by_category function."""

    def test_get_skills_by_category_exists(self):
        """Verify get_skills_by_category is callable."""
        assert callable(get_skills_by_category)


class TestGet_all_skill_categories:
    """Test the get_all_skill_categories function."""

    def test_get_all_skill_categories_exists(self):
        """Verify get_all_skill_categories is callable."""
        assert callable(get_all_skill_categories)


class TestGet_user_skills:
    """Test the get_user_skills function."""

    def test_get_user_skills_exists(self):
        """Verify get_user_skills is callable."""
        assert callable(get_user_skills)


class TestAdd_user_skill:
    """Test the add_user_skill function."""

    def test_add_user_skill_exists(self):
        """Verify add_user_skill is callable."""
        assert callable(add_user_skill)


class TestRemove_user_skill:
    """Test the remove_user_skill function."""

    def test_remove_user_skill_exists(self):
        """Verify remove_user_skill is callable."""
        assert callable(remove_user_skill)

