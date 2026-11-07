"""Session lifecycle management for SCIF inactivity timeouts.

This module enforces strict session lifecycle rules required by UK MOD
JSP 440 / JSP 604 and US DoD IL5/IL6 guidelines for classified
operational environments.

Inactivity Timeout Policy
~~~~~~~~~~~~~~~~~~~~~~~~~

In a SCIF (Sensitive Compartmented Information Facility), an unattended
terminal poses a severe security risk.  This module enforces a strict
**15-minute inactivity window**:

1. Every authenticated request updates the session's last-activity
   timestamp in an in-memory store (or Redis in production).

2. The client sends periodic heartbeat pings via
   ``POST /api/v1/auth/heartbeat`` to keep the session alive.

3. If the elapsed time since the last heartbeat exceeds 900 seconds
   (15 minutes), the session is invalidated and the client receives
   HTTP 401 with header ``X-Session-Terminated: INACTIVITY_TIMEOUT``.

Session Store
~~~~~~~~~~~~~

In development, sessions are stored in a simple in-memory dictionary.
In production, this should be backed by Redis for distributed session
state across multiple application servers.

Each session record tracks:

- **user_id** — The authenticated user's ID.
- **last_activity** — Timestamp of the last heartbeat or request.
- **token_jti** — JWT token JTI (JWT ID) for token revocation.
- **user_upn** — User Principal Name for audit logging.

Usage
~~~~~

.. code-block:: python

    from app.core.session import SessionManager

    session_mgr = SessionManager()

    # Register a session after successful authentication
    session_mgr.register_session(user_id=1, token_jti="abc123", user_upn="user@defence.local")

    # Touch the session on each request
    session_mgr.touch_session(token_jti="abc123")

    # Check session validity before processing a request
    is_valid, reason = session_mgr.check_session(token_jti="abc123")
    if not is_valid:
        raise HTTPException(status_code=401, detail=reason)
"""
import time
import threading
from typing import Dict, Optional, Tuple

from fastapi import HTTPException, status


# Maximum inactivity window in seconds (15 minutes)
INACTIVITY_TIMEOUT_SECONDS = 900

# Warning threshold — frontend shows countdown at this point
INACTIVITY_WARNING_SECONDS = 840  # 14 minutes


class SessionManager:
    """Manages authenticated session lifecycle with inactivity timeout.

    In a SCIF environment, an unattended terminal is a security risk.
    This class enforces a strict 15-minute inactivity window by tracking
    the last activity timestamp for each session and invalidating tokens
    that exceed the timeout.

    The session store is thread-safe and can be backed by an in-memory
    dictionary (development) or Redis (production).

    Attributes
    ----------
    sessions : dict
        In-memory session store mapping token JTI to session data.
    _lock : threading.Lock
        Thread safety lock for session store mutations.
    """

    def __init__(self):
        """Initialize the session manager with an empty in-memory store."""
        self.sessions: Dict[str, Dict] = {}
        self._lock = threading.Lock()

    def register_session(
        self,
        user_id: int,
        token_jti: str,
        user_upn: str,
    ) -> None:
        """Register a new authenticated session.

        Called after successful authentication to create a session record
        that tracks the user's activity timestamps.

        Parameters
        ----------
        user_id : int
            The authenticated user's database ID.
        token_jti : str
            JWT token JTI (JWT ID) used as the session key.
        user_upn : str
            User Principal Name for audit logging.
        """
        with self._lock:
            self.sessions[token_jti] = {
                "user_id": user_id,
                "last_activity": time.time(),
                "token_jti": token_jti,
                "user_upn": user_upn,
            }

    def touch_session(self, token_jti: str) -> bool:
        """Update the last-activity timestamp for an active session.

        Called on each authenticated request to keep the session alive.
        If the session has already expired, it is removed and ``False``
        is returned.

        Parameters
        ----------
        token_jti : str
            JWT token JTI identifying the session.

        Returns
        -------
        bool
            ``True`` if the session is still valid and was touched;
            ``False`` if the session has expired and was removed.
        """
        with self._lock:
            session = self.sessions.get(token_jti)
            if session is None:
                return False

            elapsed = time.time() - session["last_activity"]
            if elapsed > INACTIVITY_TIMEOUT_SECONDS:
                # Session has expired — remove it
                del self.sessions[token_jti]
                return False

            session["last_activity"] = time.time()
            return True

    def check_session(
        self, token_jti: str
    ) -> Tuple[bool, Optional[str]]:
        """Check whether a session is still valid.

        Verifies that the session exists and has not exceeded the
        inactivity timeout.  If the session has expired, it is removed
        from the store.

        Parameters
        ----------
        token_jti : str
            JWT token JTI identifying the session.

        Returns
        -------
        tuple of (bool, str or None)
            A tuple of ``(is_valid, reason)``.  If ``is_valid`` is
            ``True``, ``reason`` is ``None``.  If ``is_valid`` is
            ``False``, ``reason`` explains why the session was rejected
            (e.g., ``"INACTIVITY_TIMEOUT"`` or ``"SESSION_NOT_FOUND"``).
        """
        with self._lock:
            session = self.sessions.get(token_jti)
            if session is None:
                return False, "SESSION_NOT_FOUND"

            elapsed = time.time() - session["last_activity"]
            if elapsed > INACTIVITY_TIMEOUT_SECONDS:
                # Session has expired — remove it
                del self.sessions[token_jti]
                return False, "INACTIVITY_TIMEOUT"

            return True, None

    def invalidate_session(self, token_jti: str) -> bool:
        """Immediately invalidate a session.

        Used for explicit logout or emergency session revocation.

        Parameters
        ----------
        token_jti : str
            JWT token JTI to invalidate.

        Returns
        -------
        bool
            ``True`` if the session was found and invalidated;
            ``False`` if the session did not exist.
        """
        with self._lock:
            if token_jti in self.sessions:
                del self.sessions[token_jti]
                return True
            return False

    def get_session_info(self, token_jti: str) -> Optional[Dict]:
        """Retrieve session information without modifying timestamps.

        Parameters
        ----------
        token_jti : str
            JWT token JTI identifying the session.

        Returns
        -------
        dict or None
            Session data dictionary or ``None`` if not found.
        """
        with self._lock:
            session = self.sessions.get(token_jti)
            if session is None:
                return None

            elapsed = time.time() - session["last_activity"]
            return {
                "user_id": session["user_id"],
                "user_upn": session["user_upn"],
                "last_activity": session["last_activity"],
                "elapsed_seconds": int(elapsed),
                "remaining_seconds": max(
                    0, INACTIVITY_TIMEOUT_SECONDS - int(elapsed)
                ),
                "is_warning_zone": elapsed > INACTIVITY_WARNING_SECONDS,
            }

    def cleanup_expired_sessions(self) -> int:
        """Remove all expired sessions from the store.

        This method should be called periodically (e.g., every 5 minutes)
        to clean up sessions that have exceeded the inactivity timeout.

        Returns
        -------
        int
            Number of expired sessions removed.
        """
        now = time.time()
        removed = 0
        with self._lock:
            expired_keys = [
                jti
                for jti, session in self.sessions.items()
                if now - session["last_activity"] > INACTIVITY_TIMEOUT_SECONDS
            ]
            for jti in expired_keys:
                del self.sessions[jti]
                removed += 1
        return removed

    def get_active_session_count(self) -> int:
        """Return the number of currently active sessions.

        Returns
        -------
        int
            Number of active sessions in the store.
        """
        with self._lock:
            return len(self.sessions)


# Global session manager singleton
session_manager = SessionManager()
"""Global session manager instance.

This singleton is shared across all request handlers to provide
consistent session lifecycle management.  In production with multiple
application servers, replace this with a Redis-backed implementation.
"""


def check_session_activity(token_jti: str) -> None:
    """FastAPI-compatible session check that raises HTTPException on timeout.

    This is a convenience function that can be used as a FastAPI dependency
    to enforce session activity on every request.

    Parameters
    ----------
    token_jti : str
        JWT token JTI identifying the session.

    Raises
    ------
    HTTPException
        401 with ``X-Session-Terminated: INACTIVITY_TIMEOUT`` header if
        the session has expired due to inactivity.
    """
    is_valid, reason = session_manager.check_session(token_jti)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Session terminated: {reason}",
            headers={"X-Session-Terminated": reason},
        )


def touch_current_session(token_jti: str) -> None:
    """Update the last-activity timestamp for the current session.

    Call this on every authenticated request to keep the session alive.

    Parameters
    ----------
    token_jti : str
        JWT token JTI identifying the session.
    """
    session_manager.touch_session(token_jti)
