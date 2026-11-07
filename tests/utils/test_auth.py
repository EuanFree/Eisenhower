"""Tests for the auth module.

Generated test suite covering 6 functions and 0 classes.
"""
import pytest

from app.utils.auth import (load_crl_cache, is_certificate_revoked, get_pki_authenticated_user, get_current_user, require_admin, require_manager)

class TestLoad_crl_cache:
    """Test the load_crl_cache function."""

    def test_load_crl_cache_exists(self):
        """Verify load_crl_cache is callable."""
        assert callable(load_crl_cache)


class TestIs_certificate_revoked:
    """Test the is_certificate_revoked function."""

    def test_is_certificate_revoked_exists(self):
        """Verify is_certificate_revoked is callable."""
        assert callable(is_certificate_revoked)


class TestGet_pki_authenticated_user:
    """Test the get_pki_authenticated_user function."""

    def test_get_pki_authenticated_user_exists(self):
        """Verify get_pki_authenticated_user is callable."""
        assert callable(get_pki_authenticated_user)


class TestGet_current_user:
    """Test the get_current_user function."""

    def test_get_current_user_exists(self):
        """Verify get_current_user is callable."""
        assert callable(get_current_user)


class TestRequire_admin:
    """Test the require_admin function."""

    def test_require_admin_exists(self):
        """Verify require_admin is callable."""
        assert callable(require_admin)


class TestRequire_manager:
    """Test the require_manager function."""

    def test_require_manager_exists(self):
        """Verify require_manager is callable."""
        assert callable(require_manager)

