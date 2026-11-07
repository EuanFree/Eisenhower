"""Exclusive sub-tree check-out lease models.

This module defines the database schema for the check-out reservation
lease system that prevents concurrent edits on the same ltree sub-tree.

Check-Out Lease System
----------------------

In defence programme management, multiple CAMs (Contracting Authority
Managers) may work on different parts of the same programme simultaneously.
The check-out lease system ensures that when one user checks out a sub-tree
(e.g., a Work Package), no other user can modify nodes within that sub-tree
until the lease is released or expires.

The lease is time-bound (default 120 minutes) with automatic heartbeat
renewal.  If a user's session crashes or the browser is closed, the lease
auto-expires, preventing permanent deadlocks.

Key Model
~~~~~~~~~

- :class:`SubTreeCheckOut` — Records an exclusive lease on an ltree
  sub-tree scope, tracking the leasing user, session token, and expiry.

Indexes
~~~~~~~

A GIN index on ``ltree_scope_path`` enables fast containment queries
to determine whether a target node lies within any active lease scope.
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Index,
    UniqueConstraint, Uuid
)
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta, timezone
from uuid import uuid4


def _utc_now():
    """Return the current UTC time as a timezone-aware datetime."""
    return datetime.now(timezone.utc)

from app.database import Base


class SubTreeCheckOut(Base):
    """Exclusive check-out lease on an ltree sub-tree scope.

    When a user with CAM or higher authority checks out a sub-tree,
    this record is created.  All write operations on nodes within the
    leased scope are blocked for other users until the lease is
    explicitly checked in or expires.

    Lease Lifecycle
    ~~~~~~~~~~~~~~~

    1. **Acquire** — ``POST /checkout/{node_id}`` creates a new lease
       record with a 120-minute TTL and a unique session token.
    2. **Heartbeat** — ``POST /heartbeat/{lease_token}`` extends the
       lease by 60 minutes, keeping it alive while the user is actively
       editing.
    3. **Check In** — ``POST /checkin/{lease_token}`` releases the
       lease, publishes staged changes, and commits the audit log.
    4. **Force Break** — ``POST /force-break/{lease_token}`` is an
       administrative override that breaks abandoned leases (requires
       PROGRAMME_DIRECTOR or SYSTEM_ADMIN).

    Auto-Expiry
    ~~~~~~~~~~~

    If ``expires_at`` passes without a heartbeat renewal, the lease
    is considered expired.  The lease guard middleware checks
    ``expires_at > NOW()`` before blocking writes.  Expired leases
    are cleaned up lazily on the next write attempt.

    Attributes
    ----------
    id : UUID
        Primary key, auto-generated UUID4.
    root_node_id : UUID
        Foreign key to the root :class:`UniversalBreakdownNode` that
        was checked out.  The lease covers this node and all descendants.
    ltree_scope_path : str
        The ltree path of the checked-out sub-tree at the time of
        checkout (e.g., ``'prog_a.proj_1.ca_04'``).  Stored as a
        string for cross-database compatibility.
    leased_by_user_id : UUID
        Foreign key to the :class:`User` who acquired the lease.
    lease_token : UUID
        Unique session token returned to the client.  Used for
        heartbeat, check-in, and force-break operations.
    leased_at : datetime
        When the lease was acquired (UTC now).
    expires_at : datetime
        When the lease expires (UTC now + 120 minutes, extended by
        heartbeats).
    check_out_note : str or None
        Optional note explaining the purpose of the check-out
        (e.g., 'Drafting Month 11 Progress').
    is_active : bool
        Whether the lease is currently active.  Set to False on
        check-in or force-break.
    """
    __tablename__ = "sub_tree_check_outs"

    id = Column(
        Uuid,
        primary_key=True,
        default=uuid4,
    )

    root_node_id = Column(
        Uuid,
        ForeignKey("universal_breakdown_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    """Root node that was checked out."""

    ltree_scope_path = Column(
        String(512),
        nullable=False,
        index=True,
    )
    """Ltree path scope of the checked-out sub-tree."""

    leased_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    """User who acquired the lease."""

    lease_token = Column(
        Uuid,
        nullable=False,
        unique=True,
        default=uuid4,
        index=True,
    )
    """Unique session token for heartbeat/check-in operations."""

    leased_at = Column(
        DateTime,
        default=_utc_now,
        nullable=False,
    )
    """When the lease was acquired."""

    expires_at = Column(
        DateTime,
        nullable=False,
        index=True,
    )
    """When the lease expires (auto-renewed by heartbeats)."""

    check_out_note = Column(
        String(255),
        nullable=True,
    )
    """Optional note explaining the purpose of the check-out."""

    is_active = Column(
        Boolean,
        default=True,
        nullable=False,
    )
    """Whether the lease is currently active."""

    # Relationships
    leased_by_user = relationship(
        "User",
        foreign_keys=[leased_by_user_id],
    )
    root_node = relationship(
        "UniversalBreakdownNode",
        foreign_keys=[root_node_id],
    )

    __table_args__ = (
        # GIN index for fast ltree path containment queries (uses pg_trgm for varchar)
        Index("ix_checkout_ltree_path_gin", "ltree_scope_path", postgresql_using="gin", postgresql_ops={"ltree_scope_path": "gin_trgm_ops"}),
        Index("ix_checkout_active_expires", "is_active", "expires_at"),
        Index("ix_checkout_user", "leased_by_user_id"),
    )

    def __repr__(self):
        return (
            f"<SubTreeCheckOut(id={self.id}, "
            f"path='{self.ltree_scope_path}', "
            f"user={self.leased_by_user_id}, "
            f"active={self.is_active})>"
        )
