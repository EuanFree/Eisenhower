"""Tests for the application configuration module.

This module tests the Settings class and its environment variable loading.
It verifies that default values are correct and that environment variables
can override the defaults.
"""
import os
import pytest
from app.config import Settings


class TestSettingsDefaults:
    """Test that Settings loads correct default values."""

    def test_app_name_default(self):
        """Test that the default app name is correct."""
        settings = Settings()
        assert settings.APP_NAME == "Eisenhower Portfolio Manager"

    def test_debug_default_is_false(self):
        """Test that debug mode is disabled by default."""
        settings = Settings()
        assert settings.DEBUG is False

    def test_secret_key_default(self):
        """Test that the default secret key is set (should be changed in production)."""
        settings = Settings()
        assert settings.SECRET_KEY is not None
        assert len(settings.SECRET_KEY) > 0

    def test_token_expiry_default(self):
        """Test that the default token expiry is 24 hours (1440 minutes)."""
        settings = Settings()
        assert settings.ACCESS_TOKEN_EXPIRE_MINUTES == 1440

    def test_database_url_default(self, monkeypatch):
        """Test that the default database URL points to localhost."""
        # Restore the default DATABASE_URL (conftest.py overrides it to SQLite for tests)
        monkeypatch.delenv("DATABASE_URL", raising=False)
        settings = Settings()
        assert "postgresql" in settings.DATABASE_URL
        assert "localhost" in settings.DATABASE_URL

    def test_cors_origins_default(self):
        """Test that CORS allows all origins by default."""
        settings = Settings()
        assert settings.ALLOWED_ORIGINS == "*"


class TestSettingsEnvironmentOverride:
    """Test that environment variables override default settings."""

    def test_override_app_name(self, monkeypatch):
        """Test that APP_NAME can be overridden via environment variable."""
        monkeypatch.setenv("APP_NAME", "Custom App")
        settings = Settings()
        assert settings.APP_NAME == "Custom App"

    def test_override_debug(self, monkeypatch):
        """Test that DEBUG can be overridden via environment variable."""
        monkeypatch.setenv("DEBUG", "true")
        settings = Settings()
        assert settings.DEBUG is True

    def test_override_secret_key(self, monkeypatch):
        """Test that SECRET_KEY can be overridden via environment variable."""
        monkeypatch.setenv("SECRET_KEY", "my-very-secret-key")
        settings = Settings()
        assert settings.SECRET_KEY == "my-very-secret-key"

    def test_override_database_url(self, monkeypatch):
        """Test that DATABASE_URL can be overridden via environment variable."""
        monkeypatch.setenv("DATABASE_URL", "postgresql://test:test@dbhost/testdb")
        settings = Settings()
        assert settings.DATABASE_URL == "postgresql://test:test@dbhost/testdb"

    def test_override_token_expiry(self, monkeypatch):
        """Test that ACCESS_TOKEN_EXPIRE_MINUTES can be overridden."""
        monkeypatch.setenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
        settings = Settings()
        assert settings.ACCESS_TOKEN_EXPIRE_MINUTES == 30

    def test_override_cors_origins(self, monkeypatch):
        """Test that ALLOWED_ORIGINS can be overridden."""
        monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:8080")
        settings = Settings()
        assert settings.ALLOWED_ORIGINS == "http://localhost:3000,http://localhost:8080"


class TestSettingsModuleLevel:
    """Test the module-level settings singleton."""

    def test_settings_singleton_exists(self):
        """Test that the module-level settings object is a Settings instance."""
        from app.config import settings
        assert isinstance(settings, Settings)

    def test_settings_singleton_has_required_fields(self):
        """Test that the settings singleton has all required fields."""
        from app.config import settings
        assert hasattr(settings, "APP_NAME")
        assert hasattr(settings, "DEBUG")
        assert hasattr(settings, "SECRET_KEY")
        assert hasattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES")
        assert hasattr(settings, "DATABASE_URL")
        assert hasattr(settings, "ALLOWED_ORIGINS")
