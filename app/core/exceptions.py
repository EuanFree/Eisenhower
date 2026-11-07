"""Optimistic concurrency control, sub-tree locking, and conflict handling.

This module provides the custom exception types and FastAPI exception handlers
that detect, report, and manage mid-air collisions when multiple users edit
the same database rows concurrently. It also blocks mutations while
long-running schedule operations (such as CPM recalculation or resource
leveling) are in progress on a sub-tree.

The module addresses two distinct concurrency problems:

1. **Optimistic Concurrency Conflicts** — When two users independently load
   the same entity, make changes, and attempt to save, the second save will
   fail because the entity's version has changed. This is detected via
   SQLAlchemy's mapper versioning and handled by translating the
   ``StaleDataError`` into a structured HTTP 409 Conflict response.

2. **Sub-Tree Locking** — When a long-running operation (CPM recalculation,
   resource leveling, baseline freeze, airgap import) begins, it acquires
   a database-level lock on the affected ltree sub-tree. Any concurrent
   mutation request targeting a node within the locked sub-tree is blocked
   with an HTTP 423 Locked response.

Optimistic Concurrency Control
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

SQLAlchemy's mapper versioning is configured via the ``version_id_col``
parameter on models such as :class:`UniversalBreakdownNode`,
:class:`DependencyLink`, and :class:`ResourceAssignment`. This mechanism
works as follows:

1. When an entity is loaded, SQLAlchemy records its current ``version_id``.
2. On ``commit()``, SQLAlchemy includes ``WHERE version_id = <old_version>``
   in the UPDATE statement.
3. If another session has already incremented the version, the UPDATE affects
   zero rows, and SQLAlchemy raises ``StaleDataError``.
4. The :func:`stale_data_exception_handler` catches this error and returns
   a structured HTTP 409 response with conflict details.

The frontend uses this structured response to display a conflict resolution
dialog that offers the user three strategies:

1. **Overwrite (Force Take)** — Re-submit the changes using the latest
   ``version_id``, effectively overwriting the other user's changes.
2. **Discard & Reload** — Abandon local changes and reload the current
   database state.
3. **Keep Both / Fork** — Create a parallel branch or sandbox to preserve
   both sets of changes for later reconciliation.

Sub-Tree Locking Protocol
~~~~~~~~~~~~~~~~~~~~~~~~~

When a long-running operation begins, it acquires a lock on the affected
ltree sub-tree. The lock includes:

- **Operation type** — Identifies the blocking operation (e.g.,
  ``CPM_RECALCULATION``, ``RESOURCE_LEVELING``, ``BASELINE_FREEZE``).
- **Lock owner** — User principal name of the user who initiated the operation.
- **Time-to-live (TTL)** — Estimated seconds remaining before the lock
  expires, providing a safety cutoff to prevent indefinite locks.
- **Locked path** — The ltree path of the root node being locked.

If another request tries to mutate a node within the locked sub-tree,
:class:`LockedException` (HTTP 423) is raised with full details about
the blocking operation, allowing the frontend to inform the user and
provide a retry mechanism.

See :class:`LockedException` and ``app/services/lock_manager.py`` for
the complete locking protocol implementation.

Exception Hierarchy
~~~~~~~~~~~~~~~~~~~

- :class:`ConflictException` (HTTP 409) — Concurrent modification conflict.
- :class:`LockedException` (HTTP 423) — Sub-tree locked by long-running operation.

Exception Handlers
~~~~~~~~~~~~~~~~~~

- :func:`stale_data_exception_handler` — Translates SQLAlchemy's
  ``StaleDataError`` into HTTP 409 responses.

Usage
~~~~~

Register the exception handler in your FastAPI app:

.. code-block:: python

    from fastapi import FastAPI
    from sqlalchemy.orm.exc import StaleDataError
    from app.core.exceptions import stale_data_exception_handler

    app = FastAPI()
    app.add_exception_handler(StaleDataError, stale_data_exception_handler)

Then raise exceptions as needed:

.. code-block:: python

    from app.core.exceptions import ConflictException, LockedException

    # On concurrent modification
    raise ConflictException(
        entity_id=str(node.id),
        expected_version=old_version,
        current_database_version=new_version,
        conflicting_user_upn="user@example.com",
    )

    # On locked sub-tree
    raise LockedException(
        operation_type="CPM_RECALCULATION",
        locked_by_user="user@example.com",
        remaining_seconds=45,
        locked_path="1.2.3",
    )
"""

from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm.exc import StaleDataError
import logging

logger = logging.getLogger(__name__)


class ConflictException(HTTPException):
    """Exception raised when a concurrent modification conflict is detected.

    This exception is triggered when two or more users attempt to modify
    the same database entity simultaneously. It extends FastAPI's
    ``HTTPException`` with a structured JSON payload that provides the
    frontend with all the information needed to display a conflict
    resolution dialog.

    The exception uses HTTP status code 409 (Conflict), which allows HTTP
    clients and intermediaries to distinguish it from other error types
    such as 400 (Bad Request) or 500 (Internal Server Error).

    The structured payload includes:

    - **entity_id**: The UUID of the entity that was modified concurrently.
    - **expected_version**: The version number the client expected based on
      its local copy.
    - **current_database_version**: The version number currently stored in
      the database (higher than expected).
    - **conflicting_user_upn**: The user principal name (UPN) of the user
      who made the conflicting change, if available from the audit log.
    - **current_state**: A snapshot of the current database state for the
      entity, enabling the frontend to show a side-by-side diff.
    - **message**: A human-readable error message for display to the user.

    Frontend Integration
    ~~~~~~~~~~~~~~~~~~~~

    The frontend catches this exception and displays a
    ``ConflictResolutionModal`` that offers three resolution strategies:

    1. **Overwrite (Force Take)** — Re-submit the user's changes using the
       latest ``version_id``, effectively overwriting the other user's
       changes. This should be used with caution.
    2. **Discard & Reload** — Abandon the user's local changes and reload
       the current database state. This is the safest option.
    3. **Keep Both / Fork** — Create a parallel branch or sandbox to
       preserve both sets of changes for later manual reconciliation.

    Attributes:
        entity_id: The UUID of the entity that was concurrently modified.
            This is used by the frontend to identify which entity has the
            conflict and to fetch the latest state for comparison.
        expected_version: The ``version_id`` the client expected based on
            its local copy of the entity. This is the version number that
            was loaded when the user started editing.
        current_database_version: The ``version_id`` currently stored in
            the database. This is always higher than ``expected_version``
            when a conflict occurs.
        conflicting_user_upn: The user principal name (UPN) of the user
            who made the conflicting change. If the audit log does not
            contain this information, it defaults to ``"unknown"``.
        current_state: A dictionary containing a snapshot of the current
            database state for the entity. This allows the frontend to
            display a side-by-side diff between the user's local changes
            and the current database state.

    Example:
        .. code-block:: python

            from app.core.exceptions import ConflictException

            raise ConflictException(
                entity_id="550e8400-e29b-41d4-a716-446655440000",
                expected_version=3,
                current_database_version=5,
                conflicting_user_upn="john.doe@example.com",
                current_state={"name": "Updated Name", "status": "active"},
            )
    """

    def __init__(
        self,
        entity_id: str,
        expected_version: int,
        current_database_version: int,
        conflicting_user_upn: str = "unknown",
        current_state: dict | None = None,
    ):
        """Initialise a concurrent modification conflict exception.

        Args:
            entity_id: The UUID of the entity that was concurrently modified.
                This identifies which database row has the version conflict.
            expected_version: The ``version_id`` the client expected based on
                its local copy. This is the version number that was loaded
                when the user started editing.
            current_database_version: The ``version_id`` currently stored in
                the database. This will be higher than ``expected_version``
                when a conflict is detected.
            conflicting_user_upn: The user principal name (UPN) of the user
                who made the conflicting change. Defaults to ``"unknown"``
                if the audit log does not provide this information.
            current_state: A dictionary containing a snapshot of the current
                database state for the entity. Defaults to an empty dictionary
                if not provided. Used by the frontend for side-by-side diff.
        """
        detail = {
            "error_code": "CONCURRENT_MODIFICATION_CONFLICT",
            "entity_id": entity_id,
            "expected_version": expected_version,
            "current_database_version": current_database_version,
            "conflicting_user_upn": conflicting_user_upn,
            "current_state": current_state or {},
            "message": (
                f"This record was modified by another user "
                f"({conflicting_user_upn}) while you were editing."
            ),
        }
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
        )


async def stale_data_exception_handler(
    request: Request,
    exc: StaleDataError,
) -> JSONResponse:
    """FastAPI exception handler that translates SQLAlchemy StaleDataError into HTTP 409.

    When SQLAlchemy's mapper versioning detects that a row's ``version_id`` has
    changed since it was loaded into the current session, it raises
    ``StaleDataError`` on ``commit()``. This async exception handler intercepts
    that error and converts it into a structured HTTP 409 (Conflict) JSON
    response that the frontend can use to display a conflict resolution dialog.

    Process Flow
    ~~~~~~~~~~~~

    1. Log the conflict at WARNING level with full exception details for
       debugging and audit purposes.
    2. Extract the entity ID from the request URL path by scanning for a
       UUID pattern (36 characters with 4 hyphens).
    3. Construct a structured JSON response with:

       - ``error_code``: Fixed string ``"CONCURRENT_MODIFICATION_CONFLICT"``
         for frontend error handling.
       - ``entity_id``: The UUID extracted from the URL path, or ``"unknown"``
         if not found.
       - ``expected_version`` / ``current_database_version``: Set to ``None``
         as these are not directly available from the StaleDataError exception.
       - ``conflicting_user_upn``: Set to ``"unknown"`` as the user information
         is not available at this level.
       - ``current_state``: Empty dictionary as the current state is not
         available at this level.
       - ``message``: Human-readable error message for the user.
    4. Return the JSON response with HTTP 409 status code.

    Limitations
    ~~~~~~~~~~~

    This handler cannot extract the exact version numbers or the conflicting
    user's identity from the ``StaleDataError`` exception alone. These fields
    are set to ``None`` / ``"unknown"``. For more detailed conflict information,
    use :class:`ConflictException` directly in your code where you have access
    to the version and user context.

    Args:
        request: The incoming FastAPI :class:`Request` object. This provides
            access to the request URL, from which the entity ID is extracted.
            The URL path is expected to contain the entity UUID (e.g.,
            ``/api/nodes/550e8400-e29b-41d4-a716-446655440000``).
        exc: The SQLAlchemy :class:`StaleDataError` exception instance that
            was raised during the database commit. This indicates that the
            row's version has changed since it was loaded.

    Returns:
        A :class:`JSONResponse` object with HTTP status code 409 (Conflict)
        and a structured JSON body containing conflict details. The frontend
        uses this response to display the conflict resolution modal.

    Example:
        Registering the handler in your FastAPI app:

        .. code-block:: python

            from fastapi import FastAPI
            from sqlalchemy.orm.exc import StaleDataError
            from app.core.exceptions import stale_data_exception_handler

            app = FastAPI()
            app.add_exception_handler(StaleDataError, stale_data_exception_handler)
    """
    logger.warning(
        "Concurrent modification conflict detected: %s",
        str(exc),
        exc_info=exc,
    )

    # Try to extract entity info from the request path
    # The path typically contains the entity UUID
    path_parts = request.url.path.split("/")
    entity_id = "unknown"
    for part in path_parts:
        # UUIDs in paths look like: 550e8400-e29b-41d4-a716-446655440000
        if len(part) == 36 and part.count("-") == 4:
            entity_id = part
            break

    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={
            "error_code": "CONCURRENT_MODIFICATION_CONFLICT",
            "entity_id": entity_id,
            "expected_version": None,
            "current_database_version": None,
            "conflicting_user_upn": "unknown",
            "current_state": {},
            "message": (
                "This record was modified by another user while you were "
                "editing. Please reload and re-apply your changes."
            ),
        },
    )


class SubTreeLockedException(Exception):
    """Raised when a mutation targets a node locked under a CAM checkout lease.

    This exception is used by the MCP error recovery envelope to signal
    that a sub-tree is locked and the agent should not retry the mutation.

    Attributes:
        locked_path: The ltree path of the locked sub-tree root.
        locked_by_user: The user principal who holds the lease.
    """

    def __init__(self, locked_path: str = "", locked_by_user: str = ""):
        self.locked_path = locked_path
        self.locked_by_user = locked_by_user
        super().__init__(
            f"Sub-tree '{locked_path}' is locked under CAM checkout lease "
            f"held by {locked_by_user or 'unknown'}."
        )


class CycleDetectedException(Exception):
    """Raised when a proposed dependency link would create a closed loop.

    This exception is used by the MCP error recovery envelope to signal
    that the agent should inspect quarantine cycles or query predecessors
    before retrying.

    Attributes:
        target_node_id: The node that would complete the cycle.
        cycle_path: The list of node IDs forming the detected cycle.
    """

    def __init__(self, target_node_id: str = "", cycle_path: list | None = None):
        self.target_node_id = target_node_id
        self.cycle_path = cycle_path or []
        super().__init__(
            f"Proposed link creates a closed loop involving node {target_node_id}."
        )


class ClearanceCeilingExceeded(Exception):
    """Raised when a node's classification exceeds the caller's token clearance.

    This exception is used by the MCP error recovery envelope to signal
    that the agent must halt inspection of this sub-tree branch.

    Attributes:
        node_classification: The classification level of the restricted node.
        user_clearance: The clearance level of the calling user.
    """

    def __init__(
        self,
        node_classification: str = "",
        user_clearance: str = "",
    ):
        self.node_classification = node_classification
        self.user_clearance = user_clearance
        super().__init__(
            f"Node classification '{node_classification}' exceeds token "
            f"clearance '{user_clearance}'."
        )


class LockedException(HTTPException):
    """Exception raised when a sub-tree is locked by a long-running operation.

    When a long-running schedule operation (such as CPM recalculation,
    resource leveling, baseline freeze, or airgap import) is in progress
    on an ltree sub-tree, this exception blocks any concurrent mutation
    request that targets a node within the locked sub-tree.

    The exception uses HTTP status code 423 (Locked), which tells the
    frontend that the resource is temporarily unavailable due to an
    active operation. The user should wait for the operation to complete
    and then retry their request.

    The structured payload includes:

    - **operation_type**: Identifies the type of operation holding the lock
      (e.g., ``"CPM_RECALCULATION"``, ``"RESOURCE_LEVELING"``,
      ``"BASELINE_FREEZE"``, ``"AIRGAP_IMPORT"``).
    - **locked_by_user**: The user principal name (UPN) of the user who
      initiated the blocking operation.
    - **remaining_seconds**: Estimated seconds remaining before the lock
      expires (TTL safety cutoff). This helps the frontend decide whether
      to show a progress spinner or a retry button.
    - **locked_path**: The ltree path of the root node being locked
      (e.g., ``"1.2.3"``).
    - **message**: A human-readable error message for display to the user.

    Lock Types
    ~~~~~~~~~~

    The following operations can acquire sub-tree locks:

    - **CPM_RECALCULATION** — Critical Path Method schedule recalculation.
      This traverses the entire dependency network and updates early/late
      start/finish dates for all affected nodes.
    - **RESOURCE_LEVELING** — Resource constraint resolution. This adjusts
      task schedules to eliminate resource over-allocation.
    - **BASELINE_FREEZE** — PMB baseline snapshot creation. This captures
      the current schedule state as a baseline for variance tracking.
    - **AIRGAP_IMPORT** — Air-gapped data import. This ingests schedule
      data from an air-gapped environment via secure file transfer.

    Frontend Integration
    ~~~~~~~~~~~~~~~~~~~~

    The frontend catches this exception and displays a notification that
    includes:

    1. The operation type and who initiated it.
    2. An estimated wait time based on ``remaining_seconds``.
    3. A retry button that becomes available after the estimated wait time.
    4. Optionally, a link to the operation status page where the user can
       monitor progress.

    Attributes:
        operation_type: The type of operation holding the lock. Common values
            include ``"CPM_RECALCULATION"``, ``"RESOURCE_LEVELING"``,
            ``"BASELINE_FREEZE"``, and ``"AIRGAP_IMPORT"``. This helps the
            frontend provide context-specific messaging to the user.
        locked_by_user: The user principal name (UPN) of the user who
            initiated the blocking operation. This allows the frontend to
            show who is performing the operation.
        remaining_seconds: Estimated seconds remaining before the lock
            expires. This is a time-to-live (TTL) safety cutoff that prevents
            indefinite locks. The frontend uses this to show a countdown or
            decide when to enable a retry button.
        locked_path: The ltree path of the root node being locked. This
            identifies which sub-tree is affected and allows the frontend to
            visually indicate the locked area (e.g., greyed out nodes).

    Example:
        .. code-block:: python

            from app.core.exceptions import LockedException

            raise LockedException(
                operation_type="CPM_RECALCULATION",
                locked_by_user="john.doe@example.com",
                remaining_seconds=45,
                locked_path="1.2.3",
            )
    """

    def __init__(
        self,
        operation_type: str,
        locked_by_user: str,
        remaining_seconds: int,
        locked_path: str,
    ):
        """Initialise a sub-tree locked exception.

        Args:
            operation_type: The type of operation holding the lock. Common
                values include ``"CPM_RECALCULATION"``, ``"RESOURCE_LEVELING"``,
                ``"BASELINE_FREEZE"``, and ``"AIRGAP_IMPORT"``.
            locked_by_user: The user principal name (UPN) of the user who
                initiated the blocking operation. This identifies who is
                performing the long-running operation.
            remaining_seconds: Estimated seconds remaining before the lock
                expires. This is a time-to-live (TTL) safety cutoff that
                prevents indefinite locks. Used by the frontend to show
                estimated wait time.
            locked_path: The ltree path of the root node being locked
                (e.g., ``"1.2.3"``). This identifies which sub-tree is
                affected by the lock.
        """
        detail = {
            "error_code": "SUB_TREE_LOCKED",
            "operation_type": operation_type,
            "locked_by_user": locked_by_user,
            "remaining_seconds": remaining_seconds,
            "locked_path": locked_path,
            "message": (
                f"Schedule operation '{operation_type}' in progress by "
                f"{locked_by_user} on sub-tree '{locked_path}'. "
                f"Please retry in ~{remaining_seconds} seconds."
            ),
        }
        super().__init__(
            status_code=status.HTTP_423_LOCKED,
            detail=detail,
        )
