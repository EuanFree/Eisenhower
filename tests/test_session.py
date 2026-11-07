"""Tests for the session lifecycle management module.

This module tests the SCIF inactivity timeout enforcement that ensures
sessions are automatically invalidated after 15 minutes of inactivity,
matching UK MOD JSP 440 and US DoD IL5/IL6 session management guidelines.
"""
import pytest
import time

from app.core.session import SessionManager, INACTIVITY_TIMEOUT_SECONDS


class TestSessionManager:
    """Test the session manager lifecycle."""

    def test_default_timeout_is_900_seconds(self):
        """Test that the default inactivity timeout is 900 seconds (15 min)."""
        assert INACTIVITY_TIMEOUT_SECONDS == 900

    def test_register_session(self):
        """Test that a new session is registered correctly."""
        manager = SessionManager()
        manager.register_session(1, "token-123", "admin@test.com")
        assert "token-123" in manager.sessions

    def test_register_session_stores_user_data(self):
        """Test that register_session stores user_id and user_upn."""
        manager = SessionManager()
        manager.register_session(42, "token-abc", "user@test.com")
        session = manager.sessions["token-abc"]
        assert session["user_id"] == 42
        assert session["user_upn"] == "user@test.com"

    def test_touch_session_updates_timestamp(self):
        """Test that touching a session updates the last activity time."""
        manager = SessionManager()
        manager.register_session(1, "token-123", "admin@test.com")
        old_time = manager.sessions["token-123"]["last_activity"]
        time.sleep(0.1)
        manager.touch_session("token-123")
        assert manager.sessions["token-123"]["last_activity"] > old_time

    def test_touch_unknown_session_returns_false(self):
        """Test that touching an unknown session returns False."""
        manager = SessionManager()
        result = manager.touch_session("nonexistent-id")
        assert result is False

    def test_check_session_active(self):
        """Test that an active session returns (True, None)."""
        manager = SessionManager()
        manager.register_session(1, "token-123", "admin@test.com")
        is_valid, reason = manager.check_session("token-123")
        assert is_valid is True
        assert reason is None

    def test_check_session_inactive_timeout(self):
        """Test that an expired session returns (False, 'INACTIVITY_TIMEOUT')."""
        manager = SessionManager()
        manager.register_session(1, "token-123", "admin@test.com")
        # Manually expire the session
        manager.sessions["token-123"]["last_activity"] = time.time() - 901
        is_valid, reason = manager.check_session("token-123")
        assert is_valid is False
        assert reason == "INACTIVITY_TIMEOUT"

    def test_check_unknown_session_returns_not_found(self):
        """Test that checking an unknown session returns SESSION_NOT_FOUND."""
        manager = SessionManager()
        is_valid, reason = manager.check_session("nonexistent-id")
        assert is_valid is False
        assert reason == "SESSION_NOT_FOUND"

    def test_invalidate_session(self):
        """Test that invalidating a session removes it."""
        manager = SessionManager()
        manager.register_session(1, "token-123", "admin@test.com")
        manager.invalidate_session("token-123")
        assert "token-123" not in manager.sessions

    def test_invalidate_unknown_session_returns_false(self):
        """Test that invalidating an unknown session returns False."""
        manager = SessionManager()
        result = manager.invalidate_session("nonexistent-id")
        assert result is False

    def test_cleanup_expired_sessions(self):
        """Test that cleanup removes expired sessions."""
        manager = SessionManager()
        manager.register_session(1, "token-123", "admin@test.com")
        manager.sessions["token-123"]["last_activity"] = time.time() - 901
        manager.cleanup_expired_sessions()
        assert "token-123" not in manager.sessions

    def test_get_session_info(self):
        """Test that session info returns correct user data."""
        manager = SessionManager()
        manager.register_session(42, "token-123", "admin@test.com")
        info = manager.get_session_info("token-123")
        assert info is not None
        assert info["user_id"] == 42
        assert info["user_upn"] == "admin@test.com"

    def test_get_session_info_remaining_seconds(self):
        """Test that session info includes remaining_seconds."""
        manager = SessionManager()
        manager.register_session(1, "token-123", "admin@test.com")
        info = manager.get_session_info("token-123")
        assert "remaining_seconds" in info
        assert info["remaining_seconds"] > 0

    def test_multiple_sessions(self):
        """Test that multiple sessions can coexist."""
        manager = SessionManager()
        manager.register_session(1, "token-1", "user1@test.com")
        manager.register_session(2, "token-2", "user2@test.com")
        assert len(manager.sessions) == 2

    def test_touch_expired_session_removes_it(self):
        """Test that touching an expired session removes it and returns False."""
        manager = SessionManager()
        manager.register_session(1, "token-123", "admin@test.com")
        manager.sessions["token-123"]["last_activity"] = time.time() - 901
        result = manager.touch_session("token-123")
        assert result is False
        assert "token-123" not in manager.sessions
