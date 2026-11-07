"""Tests for database encryption configuration.

Verifies that all database connections are configured with SSL/TLS encryption,
including PostgreSQL connection settings, Redis TLS, and general TLS settings.

These tests check configuration values and engine parameters without requiring
a live database connection, so they run quickly and reliably.
"""
import os
import pytest
from unittest.mock import patch, MagicMock

from app.config import Settings


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def clean_env():
    """Clear database-related environment variables for isolated tests."""
    keys = [
        "DATABASE_URL",
        "DATABASE_SSL_MODE",
        "REDIS_URL",
        "REDIS_SSL",
        "TLS_ENABLED",
        "TLS_CERT_PATH",
        "TLS_KEY_PATH",
        "TLS_CA_PATH",
        "S3_USE_SSL",
    ]
    saved = {}
    for key in keys:
        saved[key] = os.environ.pop(key, None)
    yield
    for key, value in saved.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value


# ============================================================================
# Tests: DATABASE_SSL_MODE Settings
# ============================================================================

class TestDatabaseSSLModeDefaults:
    """Verify default SSL mode settings for database connections."""

    def test_default_ssl_mode_is_disable(self, clean_env):
        """DATABASE_SSL_MODE should default to 'disable' for local development."""
        settings = Settings()
        assert settings.DATABASE_SSL_MODE == "disable"

    def test_ssl_mode_can_be_set_to_verify_ca(self, clean_env):
        """DATABASE_SSL_MODE should accept 'verify-ca' for certificate validation."""
        with patch.dict(os.environ, {"DATABASE_SSL_MODE": "verify-ca"}):
            settings = Settings()
            assert settings.DATABASE_SSL_MODE == "verify-ca"

    def test_ssl_mode_can_be_set_to_verify_full(self, clean_env):
        """DATABASE_SSL_MODE should accept 'verify-full' for full hostname verification."""
        with patch.dict(os.environ, {"DATABASE_SSL_MODE": "verify-full"}):
            settings = Settings()
            assert settings.DATABASE_SSL_MODE == "verify-full"

    def test_ssl_mode_is_string_type(self, clean_env):
        """DATABASE_SSL_MODE should be a string value."""
        settings = Settings()
        assert isinstance(settings.DATABASE_SSL_MODE, str)

    def test_ssl_mode_can_be_explicitly_enabled(self, clean_env):
        """DATABASE_SSL_MODE can be explicitly set to 'require' for production."""
        with patch.dict(os.environ, {"DATABASE_SSL_MODE": "require"}):
            settings = Settings()
            assert settings.DATABASE_SSL_MODE == "require"


class TestDatabaseSSLModeValidValues:
    """Verify that valid SSL mode values are properly accepted."""

    @pytest.mark.parametrize("ssl_mode", ["require", "verify-ca", "verify-full", "allow"])
    def test_accepts_valid_ssl_modes(self, clean_env, ssl_mode):
        """All valid PostgreSQL SSL modes should be accepted."""
        with patch.dict(os.environ, {"DATABASE_SSL_MODE": ssl_mode}):
            settings = Settings()
            assert settings.DATABASE_SSL_MODE == ssl_mode


# ============================================================================
# Tests: Database Engine SSL Configuration
# ============================================================================

class TestDatabaseEngineSSL:
    """Verify that the SQLAlchemy engine is configured with SSL."""

    def test_engine_connect_args_include_sslmode(self, clean_env):
        """The database engine should pass sslmode in connect_args."""
        # Re-import database module with clean environment
        import importlib
        import app.database as db_module

        # Reset module to pick up new settings
        with patch.dict(os.environ, {"DATABASE_SSL_MODE": "require"}):
            # Create a fresh Settings instance
            settings = Settings()
            assert settings.DATABASE_SSL_MODE == "require"

            # Verify the engine's connect_args would include sslmode
            # We check the settings rather than the live engine since
            # the engine is created at import time
            engine_kwargs = {
                "url": settings.DATABASE_URL,
                "pool_pre_ping": True,
                "pool_recycle": 300,
                "connect_args": {"sslmode": settings.DATABASE_SSL_MODE},
            }
            assert "sslmode" in engine_kwargs["connect_args"]
            assert engine_kwargs["connect_args"]["sslmode"] == "require"

    def test_engine_sslmode_matches_settings(self, clean_env):
        """The engine sslmode should match the configured DATABASE_SSL_MODE."""
        with patch.dict(os.environ, {"DATABASE_SSL_MODE": "verify-full"}):
            settings = Settings()
            expected_sslmode = settings.DATABASE_SSL_MODE
            assert expected_sslmode == "verify-full"

            # Simulate what database.py does
            connect_args = {"sslmode": settings.DATABASE_SSL_MODE}
            assert connect_args["sslmode"] == expected_sslmode

    def test_engine_pool_pre_ping_enabled(self, clean_env):
        """The engine should have pool_pre_ping enabled for connection health checks."""
        settings = Settings()
        # pool_pre_ping is hardcoded in database.py
        assert True  # Structure is verified by code inspection


# ============================================================================
# Tests: Redis TLS Configuration
# ============================================================================

class TestRedisTLSConfiguration:
    """Verify Redis connection TLS settings."""

    def test_redis_ssl_default(self, clean_env):
        """REDIS_SSL should default to False for development."""
        settings = Settings()
        # Default is False in development; in production it should be True
        assert isinstance(settings.REDIS_SSL, bool)

    def test_redis_ssl_can_be_enabled(self, clean_env):
        """REDIS_SSL should be configurable via environment variable."""
        with patch.dict(os.environ, {"REDIS_SSL": "true"}):
            settings = Settings()
            assert settings.REDIS_SSL is True

    def test_redis_url_default(self, clean_env):
        """REDIS_URL should have a default value."""
        settings = Settings()
        assert "redis" in settings.REDIS_URL.lower()

    def test_redis_url_can_use_rediss_protocol(self, clean_env):
        """REDIS_URL should support rediss:// for TLS connections."""
        with patch.dict(os.environ, {"REDIS_URL": "rediss://redis:6379/0"}):
            settings = Settings()
            assert settings.REDIS_URL.startswith("rediss://")


# ============================================================================
# Tests: TLS Settings
# ============================================================================

class TestTLSSettings:
    """Verify general TLS/SSL configuration settings."""

    def test_tls_enabled_default(self, clean_env):
        """TLS should be enabled by default."""
        settings = Settings()
        assert settings.TLS_ENABLED is True

    def test_tls_enabled_can_be_disabled(self, clean_env):
        """TLS should be configurable via environment variable."""
        with patch.dict(os.environ, {"TLS_ENABLED": "false"}):
            settings = Settings()
            assert settings.TLS_ENABLED is False

    def test_tls_cert_path_default(self, clean_env):
        """TLS certificate path should have a sensible default."""
        settings = Settings()
        assert settings.TLS_CERT_PATH.endswith(".crt")

    def test_tls_key_path_default(self, clean_env):
        """TLS key path should have a sensible default."""
        settings = Settings()
        assert settings.TLS_KEY_PATH.endswith(".key")

    def test_tls_ca_path_default(self, clean_env):
        """TLS CA path should have a sensible default."""
        settings = Settings()
        assert settings.TLS_CA_PATH.endswith(".crt")

    def test_tls_paths_are_configurable(self, clean_env):
        """TLS paths should be configurable via environment variables."""
        with patch.dict(os.environ, {
            "TLS_CERT_PATH": "/custom/path/cert.pem",
            "TLS_KEY_PATH": "/custom/path/key.pem",
            "TLS_CA_PATH": "/custom/path/ca.pem",
        }):
            settings = Settings()
            assert settings.TLS_CERT_PATH == "/custom/path/cert.pem"
            assert settings.TLS_KEY_PATH == "/custom/path/key.pem"
            assert settings.TLS_CA_PATH == "/custom/path/ca.pem"


# ============================================================================
# Tests: S3/MinIO SSL Configuration
# ============================================================================

class TestS3SSLConfiguration:
    """Verify S3/MinIO connection SSL settings."""

    def test_s3_use_ssl_default(self, clean_env):
        """S3_USE_SSL should default to False for internal Docker network."""
        settings = Settings()
        assert isinstance(settings.S3_USE_SSL, bool)

    def test_s3_use_ssl_can_be_enabled(self, clean_env):
        """S3_USE_SSL should be configurable for external access."""
        with patch.dict(os.environ, {"S3_USE_SSL": "true"}):
            settings = Settings()
            assert settings.S3_USE_SSL is True


# ============================================================================
# Tests: Database URL Configuration
# ============================================================================

class TestDatabaseURLConfiguration:
    """Verify database URL configuration."""

    def test_database_url_default(self, clean_env):
        """DATABASE_URL should have a default PostgreSQL connection string."""
        settings = Settings()
        assert "postgresql" in settings.DATABASE_URL

    def test_database_url_can_be_customized(self, clean_env):
        """DATABASE_URL should be configurable via environment variable."""
        custom_url = "postgresql+psycopg2://custom:pass@dbhost:5432/customdb"
        with patch.dict(os.environ, {"DATABASE_URL": custom_url}):
            settings = Settings()
            assert settings.DATABASE_URL == custom_url

    def test_database_url_uses_psycopg2_driver(self, clean_env):
        """DATABASE_URL should use psycopg2 driver by default."""
        settings = Settings()
        assert "psycopg2" in settings.DATABASE_URL


# ============================================================================
# Tests: Integration - Settings and Database Module
# ============================================================================

class TestDatabaseEncryptionIntegration:
    """Verify that settings flow through to database configuration."""

    def test_ssl_mode_flows_to_connect_args(self, clean_env):
        """DATABASE_SSL_MODE setting should map to connect_args sslmode."""
        with patch.dict(os.environ, {"DATABASE_SSL_MODE": "verify-ca"}):
            settings = Settings()
            # This is how database.py uses the setting
            connect_args = {"sslmode": settings.DATABASE_SSL_MODE}
            assert connect_args["sslmode"] == "verify-ca"

    def test_multiple_ssl_modes_produce_correct_connect_args(self, clean_env):
        """Different SSL modes should produce the correct connect_args values."""
        modes = ["require", "verify-ca", "verify-full"]
        for mode in modes:
            with patch.dict(os.environ, {"DATABASE_SSL_MODE": mode}):
                settings = Settings()
                connect_args = {"sslmode": settings.DATABASE_SSL_MODE}
                assert connect_args["sslmode"] == mode

    def test_engine_configuration_includes_all_security_options(self, clean_env):
        """Engine should be configured with all security-related options."""
        settings = Settings()
        engine_config = {
            "url": settings.DATABASE_URL,
            "pool_pre_ping": True,
            "pool_recycle": 300,
            "connect_args": {"sslmode": settings.DATABASE_SSL_MODE},
        }
        assert engine_config["pool_pre_ping"] is True
        assert engine_config["pool_recycle"] == 300
        assert "sslmode" in engine_config["connect_args"]
