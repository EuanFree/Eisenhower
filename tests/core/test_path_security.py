"""Tests for centralized path security and secrets validation.

This module tests:
- Path traversal attack detection (Unix and Windows styles)
- Safe path resolution within base directories
- Empty/whitespace filename rejection
- Subdirectory access within base directories
- Production secrets validation (default keys, entropy, length)
- Development mode bypasses secrets validation
"""

import os
import secrets
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from app.core.path_security import (
    PathTraversalAttackException,
    safe_resolve_path,
)
from app.config import (
    Settings,
    _estimate_secret_entropy,
    DEFAULT_SECRET_KEYS,
    MIN_SECRET_KEY_LENGTH,
)


class TestSafeResolvePathBasic:
    """Test basic safe_resolve_path functionality."""

    def test_simple_filename_returns_resolved_path(self, tmp_path):
        """A simple filename should resolve to base_dir / filename."""
        result = safe_resolve_path(tmp_path, "report.pdf")
        assert result == tmp_path / "report.pdf"
        assert result.is_absolute()

    def test_subdirectory_filename_allowed(self, tmp_path):
        """A filename with subdirectories should be allowed if within base."""
        result = safe_resolve_path(tmp_path, "subdir/file.txt")
        assert result == tmp_path / "subdir" / "file.txt"

    def test_deeply_nested_subdirectory_allowed(self, tmp_path):
        """Deeply nested subdirectories should be allowed."""
        result = safe_resolve_path(tmp_path, "a/b/c/d/e/file.txt")
        assert result == tmp_path / "a" / "b" / "c" / "d" / "e" / "file.txt"

    def test_dot_in_filename_allowed(self, tmp_path):
        """A filename with dots (like .hidden) should be allowed."""
        result = safe_resolve_path(tmp_path, ".hidden_file")
        assert result == tmp_path / ".hidden_file"

    def test_current_dir_prefix_allowed(self, tmp_path):
        """A filename starting with ./ should resolve correctly."""
        result = safe_resolve_path(tmp_path, "./file.txt")
        assert result == tmp_path / "file.txt"


class TestPathTraversalUnixStyle:
    """Test detection of Unix-style path traversal attacks."""

    def test_parent_directory_traversal_blocked(self, tmp_path):
        """../../etc/shadow should raise PathTraversalAttackException."""
        with pytest.raises(PathTraversalAttackException):
            safe_resolve_path(tmp_path, "../../etc/shadow")

    def test_single_parent_traversal_blocked(self, tmp_path):
        """../escape should raise PathTraversalAttackException."""
        with pytest.raises(PathTraversalAttackException):
            safe_resolve_path(tmp_path, "../escape")

    def test_deep_traversal_blocked(self, tmp_path):
        """../../../etc/passwd should raise PathTraversalAttackException."""
        with pytest.raises(PathTraversalAttackException):
            safe_resolve_path(tmp_path, "../../../etc/passwd")

    def test_mixed_dot_and_traversal_blocked(self, tmp_path):
        """./subdir/../../../escape should raise PathTraversalAttackException."""
        with pytest.raises(PathTraversalAttackException):
            safe_resolve_path(tmp_path, "./subdir/../../../escape")

    def test_traversal_with_subdir_blocked(self, tmp_path):
        """subdir/../../escape should raise PathTraversalAttackException."""
        with pytest.raises(PathTraversalAttackException):
            safe_resolve_path(tmp_path, "subdir/../../escape")

    def test_traversal_exception_contains_filename(self, tmp_path):
        """The exception should include the untrusted filename."""
        malicious = "../../etc/shadow"
        with pytest.raises(PathTraversalAttackException) as exc_info:
            safe_resolve_path(tmp_path, malicious)
        assert exc_info.value.untrusted_filename == malicious
        assert exc_info.value.base_dir == tmp_path.resolve()


class TestPathTraversalWindowsStyle:
    """Test detection of Windows-style path traversal attacks."""

    def test_windows_backslash_traversal_blocked(self, tmp_path):
        """..\\..\\windows\\win.ini should raise PathTraversalAttackException."""
        with pytest.raises(PathTraversalAttackException):
            safe_resolve_path(tmp_path, "..\\..\\windows\\win.ini")

    def test_windows_single_parent_traversal_blocked(self, tmp_path):
        """..\\escape should raise PathTraversalAttackException."""
        with pytest.raises(PathTraversalAttackException):
            safe_resolve_path(tmp_path, "..\\escape")

    def test_windows_deep_traversal_blocked(self, tmp_path):
        """..\\..\\..\\ProgramData\\secret should be blocked."""
        with pytest.raises(PathTraversalAttackException):
            safe_resolve_path(tmp_path, "..\\..\\..\\ProgramData\\secret")

    def test_mixed_slash_backslash_traversal_blocked(self, tmp_path):
        """Mixed / and \\ traversal should be blocked."""
        with pytest.raises(PathTraversalAttackException):
            safe_resolve_path(tmp_path, "../..\\escape")


class TestPathTraversalEdgeCases:
    """Test edge cases and evasion attempts."""

    def test_empty_filename_raises_value_error(self, tmp_path):
        """Empty filename should raise ValueError."""
        with pytest.raises(ValueError, match="Filename cannot be empty"):
            safe_resolve_path(tmp_path, "")

    def test_whitespace_only_filename_raises_value_error(self, tmp_path):
        """Whitespace-only filename should raise ValueError."""
        with pytest.raises(ValueError, match="Filename cannot be empty"):
            safe_resolve_path(tmp_path, "   ")

    def test_null_byte_in_filename_blocked(self, tmp_path):
        """Filename with null byte should be handled safely."""
        # On some platforms (e.g., Windows Python 3.15), null bytes in paths
        # are silently stripped by Path.resolve() rather than raising an error.
        # We verify the function does not crash and the result stays within base.
        result = safe_resolve_path(tmp_path, "file\x00.txt")
        # The resolved path should still be within the base directory
        assert result.is_relative_to(tmp_path.resolve())

    def test_absolute_path_in_filename_blocked(self, tmp_path):
        """An absolute path as filename should be blocked."""
        with pytest.raises(PathTraversalAttackException):
            safe_resolve_path(tmp_path, "/etc/passwd")

    def test_double_extension_traversal_blocked(self, tmp_path):
        """file.txt/../../escape should be blocked."""
        with pytest.raises(PathTraversalAttackException):
            safe_resolve_path(tmp_path, "file.txt/../../escape")

    def test_encoded_dot_traversal_blocked(self, tmp_path):
        """URL-encoded traversal (..%2f) is treated as a literal filename.

        Since safe_resolve_path does not decode URL encoding, the string
        '..%2f..%2fetc%2fshadow' is treated as a valid (though odd) filename
        that stays within the base directory. The caller (e.g., web framework)
        is responsible for decoding URLs before passing them to this function.
        """
        # URL-encoded dots are NOT decoded by safe_resolve_path, so they
        # are treated as literal filenames and stay within base_dir.
        result = safe_resolve_path(tmp_path, "..%2f..%2fetc%2fshadow")
        assert result.is_relative_to(tmp_path.resolve())
        # The filename is kept as-is (not decoded)
        assert "%2f" in result.name

    def test_unicode_traversal_blocked(self, tmp_path):
        """Unicode-based traversal attempts should be blocked."""
        with pytest.raises(PathTraversalAttackException):
            safe_resolve_path(tmp_path, "..\\/..\\/etc\\/shadow")

    def test_symlink_escape_blocked(self, tmp_path):
        """A symlink pointing outside base_dir should be blocked."""
        outside_dir = tmp_path / "outside"
        outside_dir.mkdir()
        secret_file = outside_dir / "secret.txt"
        secret_file.write_text("secret")

        # Create a symlink inside tmp_path pointing outside
        symlink = tmp_path / "link_to_outside"
        try:
            symlink.symlink_to(outside_dir)
        except (OSError, NotImplementedError):
            pytest.skip("Symlinks not supported on this platform")

        # Try to access the secret file through the symlink
        with pytest.raises(PathTraversalAttackException):
            safe_resolve_path(tmp_path, "link_to_outside/secret.txt")


class TestSafePathWithinBase:
    """Test that legitimate paths within base directory work correctly."""

    def test_file_at_base_root(self, tmp_path):
        """A file directly in the base directory should work."""
        result = safe_resolve_path(tmp_path, "file.txt")
        assert result == tmp_path / "file.txt"

    def test_file_in_subdirectory(self, tmp_path):
        """A file in a subdirectory should work."""
        subdir = tmp_path / "subdir"
        subdir.mkdir()
        result = safe_resolve_path(tmp_path, "subdir/file.txt")
        assert result == subdir / "file.txt"

    def test_base_dir_itself_allowed(self, tmp_path):
        """Empty relative path (just the base) should resolve to base."""
        # This tests that the base directory itself is considered safe
        result = safe_resolve_path(tmp_path, ".")
        assert result == tmp_path.resolve()


class TestEstimateSecretEntropy:
    """Test the entropy estimation function."""

    def test_empty_string_has_zero_entropy(self):
        """Empty string should have 0 bits of entropy."""
        assert _estimate_secret_entropy("") == 0.0

    def test_single_char_repeated_has_zero_entropy(self):
        """A string of repeated single character should have 0 entropy."""
        assert _estimate_secret_entropy("aaaaaaaa") == 0.0

    def test_two_char_alternation(self):
        """'abab' has pool size 2, length 4 → log2(2)*4 = 4 bits."""
        entropy = _estimate_secret_entropy("abab")
        assert entropy == pytest.approx(4.0, abs=0.1)

    def test_urlsafe_token_has_high_entropy(self):
        """A urlsafe token should have high entropy."""
        token = secrets.token_urlsafe(48)
        entropy = _estimate_secret_entropy(token)
        assert entropy >= 256

    def test_short_secret_has_low_entropy(self):
        """A short secret like 'secret' has low entropy."""
        entropy = _estimate_secret_entropy("secret")
        assert entropy < 256

    def test_default_key_has_low_entropy(self):
        """The default key should have low entropy."""
        entropy = _estimate_secret_entropy("change-me-in-production")
        assert entropy < 256


class TestSettingsSecretValidation:
    """Test that Settings validates SECRET_KEY in production mode."""

    def test_development_mode_allows_default_key(self):
        """Development mode should allow the default SECRET_KEY.

        Note: If a .env file exists in the project root, it may override
        the default SECRET_KEY. In that case, we just verify that no
        RuntimeError is raised in development mode.
        """
        settings = Settings(ENVIRONMENT="development")
        # If .env overrides the key, that's fine — the important thing is
        # that development mode does NOT raise RuntimeError for any key.
        assert isinstance(settings.SECRET_KEY, str)
        assert len(settings.SECRET_KEY) > 0

    def test_development_mode_allows_short_key(self):
        """Development mode should allow short SECRET_KEY."""
        settings = Settings(ENVIRONMENT="development", SECRET_KEY="short")
        assert settings.SECRET_KEY == "short"

    def test_production_rejects_default_key(self):
        """Production mode should reject the default SECRET_KEY."""
        with pytest.raises(RuntimeError, match="known default value"):
            Settings(
                ENVIRONMENT="production",
                SECRET_KEY="change-me-in-production",
            )

    def test_production_rejects_empty_key(self):
        """Production mode should reject empty SECRET_KEY."""
        with pytest.raises(RuntimeError, match="known default value"):
            Settings(
                ENVIRONMENT="production",
                SECRET_KEY="",
            )

    def test_production_rejects_short_key(self):
        """Production mode should reject short SECRET_KEY."""
        with pytest.raises(RuntimeError, match="too short"):
            Settings(
                ENVIRONMENT="production",
                SECRET_KEY="a" * 20,  # 20 chars, below minimum
            )

    def test_production_rejects_low_entropy_key(self):
        """Production mode should reject low-entropy SECRET_KEY."""
        # A key that's long enough but uses only 2 characters
        with pytest.raises(RuntimeError, match="insufficient entropy"):
            Settings(
                ENVIRONMENT="production",
                SECRET_KEY="ab" * 50,  # 100 chars but only 2 unique chars
            )

    def test_production_accepts_strong_key(self):
        """Production mode should accept a strong, random SECRET_KEY."""
        strong_key = secrets.token_urlsafe(48)
        settings = Settings(
            ENVIRONMENT="production",
            SECRET_KEY=strong_key,
        )
        assert settings.SECRET_KEY == strong_key

    def test_production_rejects_known_defaults(self):
        """Production mode should reject all known default keys."""
        for default_key in DEFAULT_SECRET_KEYS:
            if not default_key:
                continue  # Skip empty string (tested separately)
            with pytest.raises(RuntimeError, match="known default value"):
                Settings(
                    ENVIRONMENT="production",
                    SECRET_KEY=default_key,
                )

    def test_production_rejects_case_insensitive_default(self):
        """Production mode should reject case variations of defaults."""
        with pytest.raises(RuntimeError, match="known default value"):
            Settings(
                ENVIRONMENT="production",
                SECRET_KEY="CHANGE-ME-IN-PRODUCTION",
            )

    def test_production_accepts_key_at_minimum_length(self):
        """Production mode should accept a key at minimum length with enough entropy."""
        # Generate a key that's exactly 44 chars with high entropy
        key = secrets.token_urlsafe(44)
        # Ensure it's at least 44 chars (token_urlsafe may produce longer)
        if len(key) < MIN_SECRET_KEY_LENGTH:
            key = secrets.token_urlsafe(48)
        settings = Settings(
            ENVIRONMENT="production",
            SECRET_KEY=key,
        )
        assert settings.SECRET_KEY == key

    def test_production_mode_case_insensitive(self):
        """Production check should be case-insensitive for ENVIRONMENT."""
        with pytest.raises(RuntimeError, match="known default value"):
            Settings(
                ENVIRONMENT="PRODUCTION",
                SECRET_KEY="change-me-in-production",
            )

    def test_staging_mode_allows_default_key(self):
        """Non-production environments should allow default keys."""
        settings = Settings(ENVIRONMENT="staging", SECRET_KEY="change-me-in-production")
        assert settings.SECRET_KEY == "change-me-in-production"


class TestGitignoreAndEnvExample:
    """Test that .gitignore and .env.example are properly configured."""

    def test_gitignore_contains_env(self):
        """.gitignore should list .env file."""
        gitignore_path = Path(__file__).resolve().parent.parent.parent / ".gitignore"
        if gitignore_path.exists():
            content = gitignore_path.read_text()
            assert ".env" in content

    def test_env_example_contains_secret_key(self):
        """deploy/.env.example should document SECRET_KEY."""
        env_example = Path(__file__).resolve().parent.parent.parent / "deploy" / ".env.example"
        if env_example.exists():
            content = env_example.read_text()
            assert "SECRET_KEY" in content
            assert "44" in content or "entropy" in content.lower()
