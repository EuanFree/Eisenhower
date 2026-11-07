"""Tests for the auth module.

Generated test suite covering 3 functions and 0 classes.
"""
import pytest

from app.routers.auth import (register, login, get_current_user_info)

class TestRegister:
    """Test the register function."""

    def test_register_exists(self):
        """Verify register is callable."""
        assert callable(register)


class TestLogin:
    """Test the login function."""

    def test_login_exists(self):
        """Verify login is callable."""
        assert callable(login)


class TestGet_current_user_info:
    """Test the get_current_user_info function."""

    def test_get_current_user_info_exists(self):
        """Verify get_current_user_info is callable."""
        assert callable(get_current_user_info)

