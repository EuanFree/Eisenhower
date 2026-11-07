"""Tests for the security module.

Generated test suite covering 4 functions and 0 classes.
"""
import pytest

from app.utils.security import (verify_password, get_password_hash, create_access_token, decode_access_token)

class TestVerify_password:
    """Test the verify_password function."""

    def test_verify_password_exists(self):
        """Verify verify_password is callable."""
        assert callable(verify_password)


class TestGet_password_hash:
    """Test the get_password_hash function."""

    def test_get_password_hash_exists(self):
        """Verify get_password_hash is callable."""
        assert callable(get_password_hash)


class TestCreate_access_token:
    """Test the create_access_token function."""

    def test_create_access_token_exists(self):
        """Verify create_access_token is callable."""
        assert callable(create_access_token)


class TestDecode_access_token:
    """Test the decode_access_token function."""

    def test_decode_access_token_exists(self):
        """Verify decode_access_token is callable."""
        assert callable(decode_access_token)

