"""Sub-tree lock manager for concurrent mutation prevention.

This module provides the core locking protocol that prevents concurrent
mutations while long-running schedule operations (CPM recalculation,
heuristic leveling, baseline freeze, airgap import) are running on an
ltree sub-tree.

Locking Protocol
~~~~~~~~~~~~~~~~

1. **Acquire** — Before a long-running operation begins, the service
   layer calls ``acquire_subtree_lock()`` with the root ltree path,
   operation type, and user ID.

2. **Check overlap** — The lock manager queries for existing active
   locks whose paths overlap with the requested path using ltree
   containment operators:

   - **Child lock**: ``existing_lock.root_path <@ new_path`` — an
     ancestor of the requested path is already locked.
   - **Ancestor lock**: ``existing_lock.root_path @> new_path`` — a
     descendant of the requested path is already locked.

3. **Block or proceed** — If an active, non-expired lock exists,
   ``LockedException`` (HTTP 423) is raised.  Otherwise, a new
   ``SubTreeLock`` record is inserted with a TTL-based ``expires_at``
   timestamp.

4. **Execute** — The operation runs within the context manager's
   ``with`` block.

5. **Release** — On exit (success or exception), the lock record is
   removed in a ``finally`` block, guaranteeing cleanup even if the
   operation fails.

TTL Safety Cutoff
~~~~~~~~~~~~~~~~~

Every lock has an ``expires_at`` timestamp (default 30 seconds from
acquisition).  If a worker crashes or the application restarts before
the lock is released, the lock automatically expires.  Expired locks
are silently cleaned up during the overlap check.

Usage
~~~~~

    from app.services.lock_manager import acquire_subtree_lock, check_path_lock

    # Wrap a long-running operation:
    async with acquire_subtree_lock(db, root_path, LockOperationType.CPM_RECALCULATION, user_id):
        result = calculate_cpm(db, project_id)

    # Check before a normal entity update:
    check_path_lock(db, node.path)
    # ... safe to proceed with the update ...
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import AsyncGenerator, Optional

from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session

from app.models.models import SubTreeLock, LockOperationType, User
from app.core.exceptions import LockedException
import logging

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _clean_expired_locks(db: Session) -> int:
    """Remove expired lock records from the database.

    Expired locks are locks whose ``expires_at`` timestamp is in the
    past.  They are left behind when a worker crashes or the application
    restarts without releasing the lock.

    Parameters
    ----------
    db : Session
        Active SQLAlchemy database session.

    Returns
    -------
    int
        Number of expired locks removed.
    """
    now = datetime.now(timezone.utc)
    result = db.execute(
        sa_text(
            "DELETE FROM sub_tree_locks WHERE expires_at < :now"
        ),
        {"now": now},
    )
    # Use flush instead of commit to avoid interfering with outer transactions
    # (e.g., nested SAVEPOINTs in baseline_engine.freeze_baseline_atomic)
    db.flush()
    return result.rowcount


def _find_overlapping_lock(
    db: Session,
    path: str,
) -> Optional[SubTreeLock]:
    """Check for an active lock that overlaps with the given ltree path.

    Two locks overlap if one is an ancestor or descendant of the other.
    This function uses string-based path prefix matching for cross-database
    compatibility (PostgreSQL and SQLite).  In production with PostgreSQL,
    native ltree operators (``<@`` and ``@>``) can be used instead.

    Parameters
    ----------
    db : Session
        Active SQLAlchemy database session.
    path : str
        The ltree path to check (e.g., ``'1.2.3'``).

    Returns
    -------
    SubTreeLock or None
        The first active overlapping lock found, or None if no conflict.
    """
    now = datetime.now(timezone.utc)

    # Clean expired locks first
    _clean_expired_locks(db)

    # Query all active (non-expired) locks
    active_locks = db.query(SubTreeLock).filter(
        SubTreeLock.expires_at > now
    ).all()

    # Check each active lock for path overlap
    for lock in active_locks:
        lock_path = lock.root_path

        # Exact match
        if lock_path == path:
            return lock

        # Ancestor lock: existing_lock.root_path is a prefix of new_path
        # e.g., lock_path='1.2' and path='1.2.3' → overlap
        if path.startswith(lock_path + "."):
            return lock

        # Child lock: new_path is a prefix of existing_lock.root_path
        # e.g., path='1.2' and lock_path='1.2.3' → overlap
        if lock_path.startswith(path + "."):
            return lock

    return None


def _get_remaining_seconds(lock: SubTreeLock) -> int:
    """Calculate remaining seconds until a lock expires.

    Parameters
    ----------
    lock : SubTreeLock
        The lock record.

    Returns
    -------
    int
        Seconds remaining (minimum 0).
    """
    now = datetime.now(timezone.utc)
    delta = lock.expires_at - now
    return max(0, int(delta.total_seconds()))


def _get_user_display_name(db: Session, user_id: int) -> str:
    """Look up the display name for a user by ID.

    Parameters
    ----------
    db : Session
        Active SQLAlchemy database session.
    user_id : int
        The user's primary key.

    Returns
    -------
    str
        The user's email, full name, or username, or 'unknown' if not found.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        return "unknown"
    return getattr(user, 'email', None) or \
           getattr(user, 'full_name', None) or \
           getattr(user, 'username', None) or \
           "unknown"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


@asynccontextmanager
async def acquire_subtree_lock(
    db: Session,
    root_path: str,
    operation_type: LockOperationType,
    user_id: int,
    ttl_seconds: int = 30,
) -> AsyncGenerator[None, None]:
    """Async context manager that acquires and releases a sub-tree lock.

    This is the primary entry point for long-running operations that need
    to prevent concurrent mutations on an ltree sub-tree.  The lock is
    held for the duration of the ``with`` block and automatically released
    on exit, even if an exception occurs.

    How it works
    ~~~~~~~~~~~~

    1. Checks for overlapping locks using path prefix matching.
    2. If an active, non-expired lock exists, raises ``LockedException``
       (HTTP 423) with details about the blocking operation.
    3. If no conflict, inserts a new ``SubTreeLock`` record with a TTL.
    4. Yields to execute the critical operation.
    5. Removes the lock record on exit (guaranteed in a ``finally`` block).

    Parameters
    ----------
    db : Session
        Active SQLAlchemy database session.
    root_path : str
        The ltree path of the root node being locked (e.g., ``'1.2'``).
    operation_type : LockOperationType
        The type of operation acquiring the lock (CPM_RECALCULATION,
        RESOURCE_LEVELING, BASELINE_FREEZE, AIRGAP_IMPORT).
    user_id : int
        The ID of the user initiating the operation.
    ttl_seconds : int, optional
        Time-to-live in seconds.  If the lock is not released within this
        window, it is considered expired.  Default is 30 seconds.

    Yields
    ------
    None
        The context manager yields control to the caller's operation.

    Raises
    ------
    LockedException
        If an active, non-expired lock already covers the requested path.

    Examples
    --------

    Wrap a CPM recalculation::

        from app.services.lock_manager import acquire_subtree_lock
        from app.models.models import LockOperationType

        async with acquire_subtree_lock(
            db, root_path, LockOperationType.CPM_RECALCULATION, user_id
        ):
            result = calculate_cpm(db, project_id)

    Wrap a baseline freeze::

        async with acquire_subtree_lock(
            db, root_path, LockOperationType.BASELINE_FREEZE, user_id,
            ttl_seconds=60,  # longer TTL for large baselines
        ):
            freeze_baseline(db, root_node_id, baseline_code, bcr_ref)
    """
    lock_record: Optional[SubTreeLock] = None

    try:
        # Check for overlapping locks
        conflicting_lock = _find_overlapping_lock(db, root_path)

        if conflicting_lock is not None:
            locked_by_user = _get_user_display_name(db, conflicting_lock.locked_by_user_id)
            remaining = _get_remaining_seconds(conflicting_lock)

            raise LockedException(
                operation_type=conflicting_lock.operation_type.value,
                locked_by_user=locked_by_user,
                remaining_seconds=remaining,
                locked_path=conflicting_lock.root_path,
            )

        # No conflict — insert the lock record
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
        lock_record = SubTreeLock(
            root_path=root_path,
            operation_type=operation_type,
            locked_by_user_id=user_id,
            acquired_at=datetime.now(timezone.utc),
            expires_at=expires_at,
        )
        db.add(lock_record)
        db.commit()

        logger.info(
            "Sub-tree lock acquired: path=%s, operation=%s, user=%d, ttl=%ds",
            root_path, operation_type.value, user_id, ttl_seconds,
        )

        # Yield to execute the critical operation
        yield

    finally:
        # Always release the lock, even if the operation failed
        if lock_record is not None:
            try:
                db.delete(lock_record)
                db.commit()
                logger.info(
                    "Sub-tree lock released: path=%s, operation=%s",
                    root_path, operation_type.value,
                )
            except Exception:
                logger.warning(
                    "Failed to release sub-tree lock for path=%s (may already be expired)",
                    root_path,
                    exc_info=True,
                )


def check_path_lock(
    db: Session,
    path: str,
) -> None:
    """Check if a given ltree path is currently locked.

    This function is called before normal entity updates (e.g.,
    ``PATCH /api/v1/wbs/{id}``) to ensure the node is not inside a
    sub-tree that is being operated on by a long-running process.

    Parameters
    ----------
    db : Session
        Active SQLAlchemy database session.
    path : str
        The ltree path of the node being updated.

    Raises
    ------
    LockedException
        If an active lock covers the given path.  The exception includes
        the operation type, the user holding the lock, and the estimated
        remaining seconds.

    Examples
    --------

    In a WBS update endpoint::

        from app.services.lock_manager import check_path_lock

        node = db.query(PortfolioNode).filter(PortfolioNode.id == node_id).first()
        check_path_lock(db, node.path)
        # ... safe to proceed with the update ...
    """
    # Clean expired locks first
    _clean_expired_locks(db)

    conflicting_lock = _find_overlapping_lock(db, path)

    if conflicting_lock is not None:
        locked_by_user = _get_user_display_name(db, conflicting_lock.locked_by_user_id)
        remaining = _get_remaining_seconds(conflicting_lock)

        raise LockedException(
            operation_type=conflicting_lock.operation_type.value,
            locked_by_user=locked_by_user,
            remaining_seconds=remaining,
            locked_path=conflicting_lock.root_path,
        )


def get_active_locks(
    db: Session,
) -> list[SubTreeLock]:
    """Return all currently active (non-expired) sub-tree locks.

    This function is useful for monitoring and debugging: it shows
    which operations are currently holding locks and how long they
    have been running.

    Parameters
    ----------
    db : Session
        Active SQLAlchemy database session.

    Returns
    -------
    list[SubTreeLock]
        List of active lock records, ordered by acquisition time
        (newest first).
    """
    # Clean expired locks first
    _clean_expired_locks(db)

    now = datetime.now(timezone.utc)
    return db.query(SubTreeLock).filter(
        SubTreeLock.expires_at > now
    ).order_by(
        SubTreeLock.acquired_at.desc()
    ).all()
