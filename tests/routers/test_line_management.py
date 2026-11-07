"""Tests for the line_management module.

Generated test suite covering 22 functions and 0 classes.
"""
import pytest

from app.routers.line_management import (get_my_line_manager, get_my_direct_reports, get_all_my_reports, get_my_chain_of_command, get_team_hierarchy, set_user_line_manager, submit_leave_request, get_my_leave_requests, get_pending_leave_requests, approve_leave, reject_leave, cancel_leave, assess_leave_overlap, schedule_downtime, list_upcoming_downtime, get_resource_downtime, cancel_downtime, list_all_skills, list_skill_categories, get_my_skills, add_skill, remove_skill)

class TestGet_my_line_manager:
    """Test the get_my_line_manager function."""

    def test_get_my_line_manager_exists(self):
        """Verify get_my_line_manager is callable."""
        assert callable(get_my_line_manager)


class TestGet_my_direct_reports:
    """Test the get_my_direct_reports function."""

    def test_get_my_direct_reports_exists(self):
        """Verify get_my_direct_reports is callable."""
        assert callable(get_my_direct_reports)


class TestGet_all_my_reports:
    """Test the get_all_my_reports function."""

    def test_get_all_my_reports_exists(self):
        """Verify get_all_my_reports is callable."""
        assert callable(get_all_my_reports)


class TestGet_my_chain_of_command:
    """Test the get_my_chain_of_command function."""

    def test_get_my_chain_of_command_exists(self):
        """Verify get_my_chain_of_command is callable."""
        assert callable(get_my_chain_of_command)


class TestGet_team_hierarchy:
    """Test the get_team_hierarchy function."""

    def test_get_team_hierarchy_exists(self):
        """Verify get_team_hierarchy is callable."""
        assert callable(get_team_hierarchy)


class TestSet_user_line_manager:
    """Test the set_user_line_manager function."""

    def test_set_user_line_manager_exists(self):
        """Verify set_user_line_manager is callable."""
        assert callable(set_user_line_manager)


class TestSubmit_leave_request:
    """Test the submit_leave_request function."""

    def test_submit_leave_request_exists(self):
        """Verify submit_leave_request is callable."""
        assert callable(submit_leave_request)


class TestGet_my_leave_requests:
    """Test the get_my_leave_requests function."""

    def test_get_my_leave_requests_exists(self):
        """Verify get_my_leave_requests is callable."""
        assert callable(get_my_leave_requests)


class TestGet_pending_leave_requests:
    """Test the get_pending_leave_requests function."""

    def test_get_pending_leave_requests_exists(self):
        """Verify get_pending_leave_requests is callable."""
        assert callable(get_pending_leave_requests)


class TestApprove_leave:
    """Test the approve_leave function."""

    def test_approve_leave_exists(self):
        """Verify approve_leave is callable."""
        assert callable(approve_leave)


class TestReject_leave:
    """Test the reject_leave function."""

    def test_reject_leave_exists(self):
        """Verify reject_leave is callable."""
        assert callable(reject_leave)


class TestCancel_leave:
    """Test the cancel_leave function."""

    def test_cancel_leave_exists(self):
        """Verify cancel_leave is callable."""
        assert callable(cancel_leave)


class TestAssess_leave_overlap:
    """Test the assess_leave_overlap function."""

    def test_assess_leave_overlap_exists(self):
        """Verify assess_leave_overlap is callable."""
        assert callable(assess_leave_overlap)


class TestSchedule_downtime:
    """Test the schedule_downtime function."""

    def test_schedule_downtime_exists(self):
        """Verify schedule_downtime is callable."""
        assert callable(schedule_downtime)


class TestList_upcoming_downtime:
    """Test the list_upcoming_downtime function."""

    def test_list_upcoming_downtime_exists(self):
        """Verify list_upcoming_downtime is callable."""
        assert callable(list_upcoming_downtime)


class TestGet_resource_downtime:
    """Test the get_resource_downtime function."""

    def test_get_resource_downtime_exists(self):
        """Verify get_resource_downtime is callable."""
        assert callable(get_resource_downtime)


class TestCancel_downtime:
    """Test the cancel_downtime function."""

    def test_cancel_downtime_exists(self):
        """Verify cancel_downtime is callable."""
        assert callable(cancel_downtime)


class TestList_all_skills:
    """Test the list_all_skills function."""

    def test_list_all_skills_exists(self):
        """Verify list_all_skills is callable."""
        assert callable(list_all_skills)


class TestList_skill_categories:
    """Test the list_skill_categories function."""

    def test_list_skill_categories_exists(self):
        """Verify list_skill_categories is callable."""
        assert callable(list_skill_categories)


class TestGet_my_skills:
    """Test the get_my_skills function."""

    def test_get_my_skills_exists(self):
        """Verify get_my_skills is callable."""
        assert callable(get_my_skills)


class TestAdd_skill:
    """Test the add_skill function."""

    def test_add_skill_exists(self):
        """Verify add_skill is callable."""
        assert callable(add_skill)


class TestRemove_skill:
    """Test the remove_skill function."""

    def test_remove_skill_exists(self):
        """Verify remove_skill is callable."""
        assert callable(remove_skill)

