"""Tests for the users module.

Generated test suite covering 5 functions and 0 classes.
"""
import pytest

from app.routers.users import (list_users, get_user, update_user, delete_user, change_password)

class TestList_users:
    """Test the list_users function."""

    def test_list_users_exists(self):
        """Verify list_users is callable."""
        assert callable(list_users)


class TestGet_user:
    """Test the get_user function."""

    def test_get_user_exists(self):
        """Verify get_user is callable."""
        assert callable(get_user)


class TestUpdate_user:
    """Test the update_user function."""

    def test_update_user_exists(self):
        """Verify update_user is callable."""
        assert callable(update_user)


class TestDelete_user:
    """Test the delete_user function."""

    def test_delete_user_exists(self):
        """Verify delete_user is callable."""
        assert callable(delete_user)


class TestChange_password:
    """Test the change_password function."""

    def test_change_password_exists(self):
        """Verify change_password is callable."""
        assert callable(change_password)

