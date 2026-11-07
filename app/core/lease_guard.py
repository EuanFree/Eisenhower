"""Lease interlock middleware for exclusive sub-tree check-out reservations.

This module provides FastAPI dependencies that enforce exclusive write
permissions on ltree sub-trees that have been checked out by another user.
It implements a reservation-based locking system where users with Contract
Administrator Manager (CAM) authority or higher can check out sub-trees
to prevent concurrent modifications.

Concept Overview
~~~~~~~~~~~~~~~~

In enterprise portfolio management, multiple users often work on the same
schedule data simultaneously. To prevent conflicting changes, the system
supports exclusive check-out leases on sub-trees. When a user checks out
a sub-tree (e.g., a Work Package), other users cannot modify nodes within
that sub-tree until the lease expires or is released.

How It Works
~~~~~~~~~~~~

1. A user with CAM or higher authority checks out a sub-tree by creating
   a :class:`SubTreeCheckOut` record that specifies:

   - The ltree path scope of the sub-tree being checked out.
   - The user ID of the person holding the lease.
   - An expiration time after which the lease automatically expires.
   - An optional note explaining the reason for the check-out.

2. This module intercepts all write operations (PUT, PATCH, DELETE) via
   FastAPI dependencies and checks whether the target node's ltree path
   falls within any active lease scope.

3. If the node is covered by an active lease held by a different user,
   the write is rejected with HTTP 423 (Locked) and a detailed message
   indicating who holds the lease and when it expires.

4. Read operations are never blocked by leases. The read permission
   dependency returns the active lease (if any) so the frontend can
   display a "checked out by" indicator on the node.

Lease Scope Matching
~~~~~~~~~~~~~~~~~~~~

A lease covers a node if the node's ltree path starts with the lease's
scope path. For example:

- Lease scope ``prog_a.proj_1`` covers node ``prog_a.proj_1.wp_04``.
- Lease scope ``prog_a.proj_1`` covers node ``prog_a.proj_1`` (exact match).
- Lease scope ``prog_a.proj_1`` does NOT cover node ``prog_a.proj_2``.

The matching uses string-based prefix comparison for cross-database
compatibility. In production with PostgreSQL, native ltree containment
operators (``@>``) can be used for better performance.

Module Structure
~~~~~~~~~~~~~~~~

- :func:`get_active_lease_for_path` — Query active leases covering a given
  ltree path.
- :func:`verify_subtree_write_permission` — FastAPI dependency for write
  endpoints; raises HTTP 423 if the target node is under another user's
  exclusive lease.
- :func:`verify_subtree_read_permission` — FastAPI dependency for read
  endpoints; returns the active lease (if any) for UI display.

Usage
~~~~~

Add the write permission dependency to any endpoint that modifies nodes:

.. code-block:: python

    from uuid import UUID
    from app.core.lease_guard import verify_subtree_write_permission

    @router.put("/nodes/{node_id}")
    def update_node(
        node_id: UUID,
        data: NodeUpdate,
        lease_check: None = Depends(verify_subtree_write_permission),
    ):
        # If we reach here, the write is permitted
        ...

Add the read permission dependency to any endpoint that reads nodes:

.. code-block:: python

    from app.core.lease_guard import verify_subtree_read_permission

    @router.get("/nodes/{node_id}")
    def get_node(
        node_id: UUID,
        lease: SubTreeCheckOut = Depends(verify_subtree_read_permission),
    ):
        node = fetch_node(node_id)
        return {
            "node": node,
            "checked_out_by": lease.leased_by_user_id if lease else None,
        }

Error Responses
~~~~~~~~~~~~~~~

When a write is blocked by an active lease, the response includes:

- **status_code**: 423 (Locked)
- **error_code**: ``"SUB_TREE_CHECKED_OUT"``
- **leased_by_user**: UPN of the user holding the lease.
- **leased_by_user_id**: UUID of the user holding the lease.
- **expires_at**: ISO-8601 timestamp of lease expiry.
- **ltree_scope_path**: The ltree path of the leased sub-tree.
- **check_out_note**: Optional note from the user who checked out the sub-tree.
- **message**: Human-readable explanation for the user.
"""
from fastapi import HTTPException, status, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import Optional
from uuid import UUID
from datetime import datetime, timezone

from app.database import get_db
from app.models.leases import SubTreeCheckOut
from app.models.models import UniversalBreakdownNode, PortfolioNode
from app.utils.auth import get_current_user
from app.models.models import User


def get_active_lease_for_path(
    db: Session,
    node_path: str,
) -> Optional[SubTreeCheckOut]:
    """Query for an active lease covering the given ltree path.

    A lease covers a node if the node's path starts with the lease's
    scope path (i.e., the node is the lease root or a descendant).
    Only active, non-expired leases are considered.

    Parameters
    ----------
    db : Session
        Active database session.
    node_path : str
        The ltree path of the target node (e.g., 'prog_a.proj_1.wp_04').

    Returns
    -------
    SubTreeCheckOut or None
        The active lease record if one exists, or None if the path
        is not currently leased.

    Notes
    -----
    Uses string-based prefix matching for cross-database compatibility.
    In production with PostgreSQL, native ltree containment operators
    (``@>``) can be used for better performance.
    """
    now = datetime.now(timezone.utc)

    # Find active, non-expired leases where the node path is within scope
    leases = db.execute(
        select(SubTreeCheckOut).where(
            SubTreeCheckOut.is_active == True,
            SubTreeCheckOut.expires_at > now,
        )
    ).all()

    for lease_row in leases:
        lease = lease_row[0] if isinstance(lease_row, tuple) else lease_row
        # Check if node_path starts with the lease's scope path
        # e.g., lease scope 'prog_a.proj_1' covers 'prog_a.proj_1.wp_04'
        if node_path.startswith(lease.ltree_scope_path + ".") or node_path == lease.ltree_scope_path:
            return lease

    return None


def verify_subtree_write_permission(
    node_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """FastAPI dependency to verify write permission against active leases.

    This dependency should be added to any PUT, PATCH, or DELETE endpoint
    that modifies a :class:`UniversalBreakdownNode`.  It checks whether
    the target node's ltree path falls within any active check-out lease
    held by a different user.

    Authorization Flow
    ~~~~~~~~~~~~~~~~~~

    1. Load the target node and resolve its ltree path.
    2. Query for active, non-expired leases covering that path.
    3. If a lease exists and ``leased_by_user_id != current_user.id``,
       raise HTTP 423 with details about the blocking lease.
    4. If no lease exists or the current user holds the lease, allow
       the write to proceed.

    Parameters
    ----------
    node_id : UUID
        The UUID of the node being modified.
    current_user : User
        The authenticated user making the request (injected by
        :func:`get_current_user`).
    db : Session
        Active database session (injected by :func:`get_db`).

    Raises
    ------
    HTTPException
        HTTP 423 (Locked) if the node is under an active lease held
        by another user.  The detail payload includes:

        - ``error_code``: 'SUB_TREE_CHECKED_OUT'
        - ``leased_by_user``: UPN of the user holding the lease
        - ``expires_at``: ISO-8601 timestamp of lease expiry
        - ``message``: Human-readable explanation

    Examples
    --------

    Use in a FastAPI endpoint::

        @router.put("/nodes/{node_id}")
        def update_node(
            node_id: UUID,
            data: NodeUpdate,
            lease_check: None = Depends(verify_subtree_write_permission),
        ):
            ...
    """
    # Load the target node
    node = db.get(UniversalBreakdownNode, node_id)
    if node is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node {node_id} not found.",
        )

    node_path = node.path
    if not node_path:
        # Root nodes without a path cannot be leased
        return

    # Check for active leases
    lease = get_active_lease_for_path(db, node_path)
    if lease is None:
        # No active lease — write is allowed
        return

    # Lease exists — check if current user holds it
    if lease.leased_by_user_id == current_user.id:
        # Current user holds the lease — write is allowed
        return

    # Another user holds the lease — reject the write
    leased_by_user = db.get(User, lease.leased_by_user_id)
    leased_by_upn = leased_by_user.email if leased_by_user else "unknown"

    raise HTTPException(
        status_code=status.HTTP_423_LOCKED,
        detail={
            "error_code": "SUB_TREE_CHECKED_OUT",
            "leased_by_user": leased_by_upn,
            "leased_by_user_id": str(lease.leased_by_user_id),
            "expires_at": lease.expires_at.isoformat() if lease.expires_at else None,
            "ltree_scope_path": lease.ltree_scope_path,
            "check_out_note": lease.check_out_note,
            "message": (
                f"This sub-tree is currently checked out by CAM "
                f"{leased_by_upn} until {lease.expires_at.strftime('%Y-%m-%d %H:%M')}."
            ),
        },
    )


def verify_subtree_read_permission(
    node_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Optional[SubTreeCheckOut]:
    """FastAPI dependency to check read permission against active leases.

    Unlike write permission, read access is never blocked by a lease.
    This dependency returns the active lease (if any) so the frontend
    can display a "checked out by" indicator on the node.

    Parameters
    ----------
    node_id : UUID
        The UUID of the node being read.
    current_user : User
        The authenticated user making the request.
    db : Session
        Active database session.

    Returns
    -------
    SubTreeCheckOut or None
        The active lease record if one exists, or None.
    """
    node = db.get(UniversalBreakdownNode, node_id)
    if node is None or not node.path:
        return None

    return get_active_lease_for_path(db, node.path)
