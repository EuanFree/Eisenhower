"""Real-time user presence and viewport cache invalidation via WebSockets.

This module manages the server-side WebSocket infrastructure that enables
real-time collaboration features across the Eisenhower Portfolio Manager.

Core Capabilities
~~~~~~~~~~~~~~~~~

1. **Connection Management** — Active WebSocket connections are partitioned
   by ``project_id`` so that broadcast messages reach only the users
   viewing the same schedule.

2. **User Focus Tracking** — Each connected client periodically emits a
   heartbeat message containing the user's current focus state:

   - ``user_id`` — The authenticated user's primary key.
   - ``user_upn`` — The user's principal name (email).
   - ``node_id`` — The WBS node currently being inspected or edited.
   - ``active_pane`` — The UI pane in focus (e.g., 'GANTT', 'WBS_TABLE',
     'DRILL_DOWN', 'COCKPIT').
   - ``last_heartbeat`` — Timestamp of the last heartbeat.

3. **Broadcast Invalidation** — When a mutation succeeds (date shift,
   progress bump, blocker creation, etc.), the API layer calls
   ``broadcast_node_mutated()`` to send a lightweight message to all
   connected clients in the affected project:

   .. code-block:: json

       {
           "event": "NODE_MUTATED",
           "node_id": "<uuid>",
           "path": "prog_a.proj_1.wp_2",
           "updated_fields": ["planned_start_date", "total_float"],
           "new_version_id": 6,
           "actor_upn": "e.evans@defence.local"
       }

4. **Presence State** — When a user's focus changes, the server broadcasts
   a ``USER_FOCUS_CHANGED`` event to all other project viewers, enabling
   live presence avatars in the WBS table and Gantt chart.

Heartbeat Protocol
~~~~~~~~~~~~~~~~~~

Clients send a ``HEARTBEAT`` message every 15 seconds.  If no heartbeat
is received within 30 seconds, the connection is considered stale and
the user's presence indicator is removed.

Message Types
~~~~~~~~~~~~~

**Client → Server:**

- ``HEARTBEAT`` — Updates the user's focus state.
- ``SUBSCRIBE`` — Explicitly subscribe to a project channel (sent on
  initial connect).
- ``UNSUBSCRIBE`` — Leave a project channel.

**Server → Client:**

- ``USER_FOCUS_CHANGED`` — A colleague's focus position updated.
- ``NODE_MUTATED`` — A node was modified; update the local cache.
- ``NODE_CREATED`` — A new node was added to the tree.
- ``NODE_DELETED`` — A node was removed from the tree.
- ``BLOCKER_CREATED`` — A new blocker was logged.
- ``BLOCKER_RESOLVED`` — A blocker was resolved.
- ``WELCOME`` — Sent on initial connect with current presence state.

Security
~~~~~~~~

Every WebSocket connection is authenticated via a JWT token passed in the
query string (``?token=...``).  The token is validated using the same
``get_current_user`` dependency used by HTTP endpoints.

Unauthorized connections are immediately closed with code 1008
(Policy Violation).
"""

import asyncio
import json
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Set

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

import logging

logger = logging.getLogger(__name__)


# ============================================================================
# Message Types
# ============================================================================


class ClientMessageType(str, Enum):
    """Message types sent from the client to the server."""

    HEARTBEAT = "HEARTBEAT"
    SUBSCRIBE = "SUBSCRIBE"
    UNSUBSCRIBE = "UNSUBSCRIBE"
    CELL_FOCUSED = "CELL_FOCUSED"
    CELL_BLURRED = "CELL_BLURRED"


class ServerMessageType(str, Enum):
    """Message types sent from the server to the client."""

    WELCOME = "WELCOME"
    USER_FOCUS_CHANGED = "USER_FOCUS_CHANGED"
    NODE_MUTATED = "NODE_MUTATED"
    NODE_CREATED = "NODE_CREATED"
    NODE_DELETED = "NODE_DELETED"
    BLOCKER_CREATED = "BLOCKER_CREATED"
    BLOCKER_RESOLVED = "BLOCKER_RESOLVED"
    CELL_FOCUSED = "CELL_FOCUSED"
    CELL_BLURRED = "CELL_BLURRED"
    SOFT_LOCK_WARNING = "SOFT_LOCK_WARNING"
    ERROR = "ERROR"


# ============================================================================
# Data Structures
# ============================================================================


@dataclass
class CellFocusState:
    """Tracks sub-cell focus within a WBS grid cell.

    When a user double-clicks a cell to edit it, the client sends a
    ``CELL_FOCUSED`` message.  The server broadcasts this to all other
    viewers so they can render a colored focus border and a compact
    avatar chip on that cell.

    Attributes
    ----------
    user_id : int
        The authenticated user's primary key.
    user_upn : str
        The user's principal name (email address).
    node_id : str
        The UUID of the WBS node containing the cell.
    column_key : str
        The column identifier (e.g., 'planned_start_date',
        'percent_complete').
    display_color : str
        Hex color string for the focus border, derived from the user's
        ID for consistency.
    project_id : str or None
        The project this cell focus belongs to (set by the manager).
    """

    user_id: int
    user_upn: str
    node_id: str
    column_key: str
    display_color: str = "#38BDF8"
    project_id: Optional[str] = None


@dataclass
class UserFocusState:
    """Tracks the current focus position of a connected user.

    This record is updated every time the client sends a ``HEARTBEAT``
    message.  It is used to render live presence avatars in the WBS
    table and Gantt chart, showing which colleagues are inspecting
    which tasks.

    Attributes
    ----------
    user_id : int
        The authenticated user's primary key.
    user_upn : str
        The user's principal name (email address).
    node_id : str or None
        The UUID of the WBS node currently being inspected or edited.
        ``None`` means the user is not focused on a specific node.
    active_pane : str or None
        The UI pane currently in focus (e.g., 'GANTT', 'WBS_TABLE',
        'DRILL_DOWN', 'COCKPIT').
    last_heartbeat : float
        Unix timestamp of the last heartbeat received.  Used to detect
        stale connections.
    project_id : str
        The UUID of the project this focus state belongs to.
    cell_focus : CellFocusState or None
        The currently focused cell, or ``None`` if the user is not
        editing a specific cell.
    """

    user_id: int
    user_upn: str
    node_id: Optional[str] = None
    active_pane: Optional[str] = None
    last_heartbeat: float = field(default_factory=time.time)
    project_id: Optional[str] = None
    cell_focus: Optional[CellFocusState] = None


@dataclass
class WebSocketConnection:
    """Represents an active WebSocket connection from a client.

    Each connection is tied to an authenticated user and can subscribe
    to multiple project channels.  The connection manager uses this
    record to route broadcast messages and track presence.

    Attributes
    ----------
    websocket : WebSocket
        The underlying FastAPI WebSocket object.
    user_id : int
        The authenticated user's primary key.
    user_upn : str
        The user's principal name (email address).
    project_ids : Set[str]
        Set of project UUIDs this connection is subscribed to.
    focus_state : UserFocusState or None
        The current focus state of this user, or ``None`` if not set.
    last_heartbeat : float
        Unix timestamp of the last heartbeat received.
    """

    websocket: WebSocket
    user_id: int
    user_upn: str
    project_ids: Set[str] = field(default_factory=set)
    focus_state: Optional[UserFocusState] = None
    last_heartbeat: float = field(default_factory=time.time)


# ============================================================================
# Connection Manager
# ============================================================================


class WebSocketConnectionManager:
    """Manages active WebSocket connections and broadcasts messages.

    This is the central hub for all real-time collaboration features.
    It maintains two indexes:

    1. ``connections`` — Maps ``user_id`` to the active ``WebSocketConnection``.
       Only one active connection per user is allowed at a time.

    2. ``project_subscribers`` — Maps ``project_id`` to a set of
       ``user_id`` values that are subscribed to that project's channel.

    When a mutation occurs (e.g., a node's dates are updated), the API
    layer calls ``broadcast_node_mutated()`` to notify all subscribers
    of the affected project.  The frontend then silently patches its
    local Zustand cache with the incoming fields.

    Heartbeat Handling
    ~~~~~~~~~~~~~~~~~~

    Clients send ``HEARTBEAT`` messages every 15 seconds.  The manager
    updates the user's ``focus_state`` and broadcasts ``USER_FOCUS_CHANGED``
    to all other project viewers.  If no heartbeat is received within
    30 seconds, the connection is considered stale during the next
    cleanup pass.

    Usage
    ~~~~~

        manager = WebSocketConnectionManager()

        # In the WebSocket endpoint:
        await manager.connect(websocket, user_id, user_upn)
        await manager.subscribe(connection, project_id)

        try:
            while True:
                data = await websocket.receive_text()
                message = json.loads(data)
                await manager.handle_message(connection, message)
        except WebSocketDisconnect:
            await manager.disconnect(connection)

        # In an API mutation endpoint:
        await manager.broadcast_node_mutated(
            project_id=project_id,
            node_id=node.id,
            path=node.path,
            updated_fields=["planned_start_date"],
            new_version_id=node.version_id,
            actor_upn=current_user.email,
        )
    """

    # Deterministic color palette for cell focus borders — matches frontend
    CELL_FOCUS_COLORS = [
        "#38BDF8",  # sky-400
        "#34D399",  # emerald-400
        "#FBBF24",  # amber-400
        "#F87171",  # red-400
        "#C084FC",  # purple-400
        "#FB923C",  # orange-400
        "#2DD4BF",  # teal-400
        "#F472B6",  # pink-400
        "#818CF8",  # indigo-400
        "#A78BFA",  # violet-400
    ]

    def __init__(self):
        """Initialize the WebSocket presence manager.

        Sets up the in-memory data structures that track active WebSocket
        connections and project channel subscriptions. A background cleanup
        task is lazily started on the first connection to periodically
        disconnect stale clients that have not sent a heartbeat within
        the timeout window.

        Attributes
        ----------
        _connections : Dict[int, WebSocketConnection]
            Maps user IDs to their active WebSocket connection records.
        _project_subscribers : Dict[str, Set[int]]
            Maps project IDs to the set of user IDs subscribed to that
            project's channel.
        _cell_focus_map : Dict[str, Dict[str, CellFocusState]]
            Maps ``project_id`` → ``(node_id:column_key)`` → CellFocusState.
            Used for soft-lock collision detection: if User B attempts to
            edit a cell already focused by User A, a SOFT_LOCK_WARNING is
            sent instead.
        _cleanup_task : Optional[asyncio.Task]
            Background asyncio task that periodically scans for and
            removes stale connections.
        _heartbeat_timeout : float
            Seconds of inactivity before a connection is considered stale
            (default ``30.0``).
        _cleanup_interval : float
            Seconds between each stale-connection scan (default ``10.0``).
        """
        # user_id → WebSocketConnection
        self._connections: Dict[int, WebSocketConnection] = {}
        # project_id → set of user_ids
        self._project_subscribers: Dict[str, Set[int]] = {}
        # project_id → (node_id:column_key) → CellFocusState
        self._cell_focus_map: Dict[str, Dict[str, CellFocusState]] = {}
        # Background task for stale connection cleanup
        self._cleanup_task: Optional[asyncio.Task] = None
        # Heartbeat interval (seconds) — connections without a heartbeat
        # beyond this threshold are considered stale
        self._heartbeat_timeout: float = 30.0
        # Cleanup interval (seconds) — how often to scan for stale connections
        self._cleanup_interval: float = 10.0

    @staticmethod
    def _get_user_color(user_id: int) -> str:
        """Return a deterministic display color for a user.

        Parameters
        ----------
        user_id : int
            The authenticated user's primary key.

        Returns
        -------
        str
            Hex color string for the focus border.
        """
        return WebSocketConnectionManager.CELL_FOCUS_COLORS[
            user_id % len(WebSocketConnectionManager.CELL_FOCUS_COLORS)
        ]

    @staticmethod
    def _cell_key(node_id: str, column_key: str) -> str:
        """Build a composite key for a cell.

        Parameters
        ----------
        node_id : str
            The UUID of the WBS node.
        column_key : str
            The column identifier.

        Returns
        -------
        str
            Composite key ``node_id:column_key``.
        """
        return f"{node_id}:{column_key}"

    @property
    def connection_count(self) -> int:
        """Return the number of active WebSocket connections."""
        return len(self._connections)

    @property
    def project_channel_count(self) -> int:
        """Return the number of active project channels."""
        return len(self._project_subscribers)

    async def connect(
        self,
        websocket: WebSocket,
        user_id: int,
        user_upn: str,
    ) -> WebSocketConnection:
        """Accept a new WebSocket connection and register the user.

        When a client connects, this method creates a new
        ``WebSocketConnection`` record and stores it in the connections
        dictionary.  If the user already has an active connection, the
        old one is silently replaced (e.g., page refresh scenario).

        Parameters
        ----------
        websocket : WebSocket
            The accepted FastAPI WebSocket object.
        user_id : int
            The authenticated user's primary key.
        user_upn : str
            The user's principal name (email address).

        Returns
        -------
        WebSocketConnection
            The newly created connection record.

        Notes
        -----
        If the user already has an active connection, it is disconnected
        and removed before the new connection is registered.
        """
        # Replace any existing connection for this user
        if user_id in self._connections:
            old_connection = self._connections[user_id]
            await self._remove_connection(old_connection, notify=False)

        connection = WebSocketConnection(
            websocket=websocket,
            user_id=user_id,
            user_upn=user_upn,
        )
        self._connections[user_id] = connection

        logger.info(
            "WebSocket connected: user_id=%s, upn=%s, total=%d",
            user_id, user_upn, self.connection_count,
        )

        # Start cleanup task if not already running
        if self._cleanup_task is None or self._cleanup_task.done():
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())

        return connection

    async def subscribe(
        self,
        connection: WebSocketConnection,
        project_id: str,
    ) -> None:
        """Subscribe a connection to a project channel.

        When a user opens a project's schedule view, they subscribe to
        that project's channel.  All broadcast messages for that project
        (node mutations, blocker events, etc.) will be sent to this
        connection.

        Parameters
        ----------
        connection : WebSocketConnection
            The active WebSocket connection.
        project_id : str
            The UUID of the project to subscribe to.
        """
        connection.project_ids.add(project_id)

        if project_id not in self._project_subscribers:
            self._project_subscribers[project_id] = set()
        self._project_subscribers[project_id].add(connection.user_id)

        logger.info(
            "Subscribed user_id=%s to project=%s",
            connection.user_id, project_id,
        )

        # Send welcome message with current presence state
        await self._send_welcome(connection, project_id)

    async def unsubscribe(
        self,
        connection: WebSocketConnection,
        project_id: str,
    ) -> None:
        """Unsubscribe a connection from a project channel.

        When a user navigates away from a project's schedule view, they
        unsubscribe to stop receiving broadcast messages for that project.

        Parameters
        ----------
        connection : WebSocketConnection
            The active WebSocket connection.
        project_id : str
            The UUID of the project to unsubscribe from.
        """
        connection.project_ids.discard(project_id)

        if project_id in self._project_subscribers:
            self._project_subscribers[project_id].discard(connection.user_id)
            # Remove empty channels
            if not self._project_subscribers[project_id]:
                del self._project_subscribers[project_id]

        logger.info(
            "Unsubscribed user_id=%s from project=%s",
            connection.user_id, project_id,
        )

    async def disconnect(
        self,
        connection: WebSocketConnection,
    ) -> None:
        """Handle WebSocket disconnection and clean up state.

        When a client disconnects (browser close, navigation away, or
        network failure), this method removes the connection from all
        project channels and notifies other users that the presence
        indicator should be removed.

        Parameters
        ----------
        connection : WebSocketConnection
            The disconnected WebSocket connection.
        """
        await self._remove_connection(connection, notify=True)

    async def handle_message(
        self,
        connection: WebSocketConnection,
        message: Dict[str, Any],
    ) -> None:
        """Route an incoming client message to the appropriate handler.

        The client sends JSON messages with a ``type`` field indicating
        the message type.  This method dispatches to the correct handler
        based on the type.

        Parameters
        ----------
        connection : WebSocketConnection
            The active WebSocket connection.
        message : dict
            Parsed JSON message from the client.

        Raises
        ------
        ValueError
            If the message type is unrecognized.
        """
        msg_type = message.get("type")

        if msg_type == ClientMessageType.HEARTBEAT:
            await self._handle_heartbeat(connection, message)
        elif msg_type == ClientMessageType.SUBSCRIBE:
            project_id = message.get("project_id")
            if project_id:
                await self.subscribe(connection, project_id)
        elif msg_type == ClientMessageType.UNSUBSCRIBE:
            project_id = message.get("project_id")
            if project_id:
                await self.unsubscribe(connection, project_id)
        elif msg_type == ClientMessageType.CELL_FOCUSED:
            await self._handle_cell_focused(connection, message)
        elif msg_type == ClientMessageType.CELL_BLURRED:
            await self._handle_cell_blurred(connection, message)
        else:
            logger.warning(
                "Unknown message type: %s from user_id=%s",
                msg_type, connection.user_id,
            )

    # -----------------------------------------------------------------------
    # Cell focus public API
    # -----------------------------------------------------------------------

    def get_cell_focus_for_project(
        self,
        project_id: str,
    ) -> Dict[str, CellFocusState]:
        """Return all active cell focus states for a project.

        Parameters
        ----------
        project_id : str
            The UUID of the project.

        Returns
        -------
        Dict[str, CellFocusState]
            Maps ``node_id:column_key`` → CellFocusState for all users
            currently editing cells in this project.
        """
        return self._cell_focus_map.get(project_id, {})

    def check_cell_collision(
        self,
        project_id: str,
        node_id: str,
        column_key: str,
        requesting_user_id: int,
    ) -> Optional[CellFocusState]:
        """Check whether a cell is already focused by another user.

        This is the soft-lock collision resolver.  If the requested cell
        is already held by a different user, the holder's CellFocusState
        is returned so the caller can emit a SOFT_LOCK_WARNING.

        Parameters
        ----------
        project_id : str
            The UUID of the project.
        node_id : str
            The UUID of the WBS node.
        column_key : str
            The column identifier.
        requesting_user_id : int
            The user attempting to edit the cell.

        Returns
        -------
        CellFocusState or None
            The holder's focus state if the cell is locked by another
            user, or ``None`` if the cell is free.
        """
        cell_map = self._cell_focus_map.get(project_id, {})
        key = self._cell_key(node_id, column_key)
        holder = cell_map.get(key)
        if holder and holder.user_id != requesting_user_id:
            return holder
        return None

    async def broadcast_cell_focused(
        self,
        project_id: str,
        cell_focus: CellFocusState,
    ) -> None:
        """Broadcast a CELL_FOCUSED event to all project subscribers.

        Parameters
        ----------
        project_id : str
            The UUID of the project.
        cell_focus : CellFocusState
            The cell focus state to broadcast.
        """
        payload = {
            "event": ServerMessageType.CELL_FOCUSED,
            "user_id": cell_focus.user_id,
            "user_upn": cell_focus.user_upn,
            "node_id": cell_focus.node_id,
            "column_key": cell_focus.column_key,
            "display_color": cell_focus.display_color,
        }
        await self._broadcast_to_project(
            project_id, payload, exclude_user_id=cell_focus.user_id,
        )

    async def broadcast_cell_blurred(
        self,
        project_id: str,
        user_id: int,
        node_id: str,
        column_key: str,
    ) -> None:
        """Broadcast a CELL_BLURRED event to all project subscribers.

        Parameters
        ----------
        project_id : str
            The UUID of the project.
        user_id : int
            The user who blurred the cell.
        node_id : str
            The UUID of the WBS node.
        column_key : str
            The column identifier.
        """
        payload = {
            "event": ServerMessageType.CELL_BLURRED,
            "user_id": user_id,
            "node_id": node_id,
            "column_key": column_key,
        }
        await self._broadcast_to_project(
            project_id, payload, exclude_user_id=user_id,
        )

    async def send_soft_lock_warning(
        self,
        connection: WebSocketConnection,
        holder: CellFocusState,
    ) -> None:
        """Send a SOFT_LOCK_WARNING to a single connection.

        When a user attempts to edit a cell already focused by a
        colleague, this warning is sent so the frontend can display
        a toast: 'Cell actively edited by <colleague>'.

        Parameters
        ----------
        connection : WebSocketConnection
            The connection to send the warning to.
        holder : CellFocusState
            The colleague who currently holds the cell focus.
        """
        payload = {
            "event": ServerMessageType.SOFT_LOCK_WARNING,
            "holder_user_id": holder.user_id,
            "holder_upn": holder.user_upn,
            "node_id": holder.node_id,
            "column_key": holder.column_key,
        }
        await self._send_to_connection(connection, payload)

    async def broadcast_node_mutated(
        self,
        project_id: str,
        node_id: str,
        path: str,
        updated_fields: List[str],
        new_version_id: int,
        actor_upn: str,
    ) -> None:
        """Broadcast a NODE_MUTATED event to all subscribers of a project.

        This is the primary cache invalidation mechanism.  When a mutation
        succeeds (date shift, progress bump, blocker creation, etc.), the
        API layer calls this method to notify all connected clients in the
        affected project.

        The frontend receives this event and:

        1. If the node is **not** currently being edited by the local user,
           silently updates the local Zustand cache with the incoming fields.
        2. If the local user **is** currently editing that node, displays
           a non-blocking toast warning: "Colleague modified this row just
           now", highlighting the conflict resolution tool.

        Parameters
        ----------
        project_id : str
            The UUID of the project containing the mutated node.
        node_id : str
            The UUID of the mutated node.
        path : str
            The ltree path of the mutated node (e.g., '1.2.3').
        updated_fields : List[str]
            List of field names that were updated (e.g.,
            ['planned_start_date', 'total_float']).
        new_version_id : int
            The new version_id of the node after the mutation.
        actor_upn : str
            The principal name of the user who performed the mutation.
        """
        payload = {
            "event": ServerMessageType.NODE_MUTATED,
            "node_id": node_id,
            "path": path,
            "updated_fields": updated_fields,
            "new_version_id": new_version_id,
            "actor_upn": actor_upn,
        }

        await self._broadcast_to_project(project_id, payload)

    async def broadcast_node_created(
        self,
        project_id: str,
        node_id: str,
        path: str,
        parent_id: Optional[str],
        actor_upn: str,
    ) -> None:
        """Broadcast a NODE_CREATED event to all subscribers of a project.

        Parameters
        ----------
        project_id : str
            The UUID of the project containing the new node.
        node_id : str
            The UUID of the newly created node.
        path : str
            The ltree path of the new node.
        parent_id : str or None
            The UUID of the parent node, or None for root nodes.
        actor_upn : str
            The principal name of the user who created the node.
        """
        payload = {
            "event": ServerMessageType.NODE_CREATED,
            "node_id": node_id,
            "path": path,
            "parent_id": parent_id,
            "actor_upn": actor_upn,
        }

        await self._broadcast_to_project(project_id, payload)

    async def broadcast_node_deleted(
        self,
        project_id: str,
        node_id: str,
        path: str,
        actor_upn: str,
    ) -> None:
        """Broadcast a NODE_DELETED event to all subscribers of a project.

        Parameters
        ----------
        project_id : str
            The UUID of the project from which the node was deleted.
        node_id : str
            The UUID of the deleted node.
        path : str
            The ltree path of the deleted node.
        actor_upn : str
            The principal name of the user who deleted the node.
        """
        payload = {
            "event": ServerMessageType.NODE_DELETED,
            "node_id": node_id,
            "path": path,
            "actor_upn": actor_upn,
        }

        await self._broadcast_to_project(project_id, payload)

    async def broadcast_blocker_created(
        self,
        project_id: str,
        node_id: str,
        blocker_id: str,
        category: str,
        severity: str,
        actor_upn: str,
    ) -> None:
        """Broadcast a BLOCKER_CREATED event to all subscribers of a project.

        Parameters
        ----------
        project_id : str
            The UUID of the project containing the affected node.
        node_id : str
            The UUID of the node that now has a blocker.
        blocker_id : str
            The UUID of the newly created blocker.
        category : str
            The blocker category (e.g., 'DEPENDENCY_OVERDUE').
        severity : str
            The blocker severity (e.g., 'CRITICAL').
        actor_upn : str
            The principal name of the user who created the blocker.
        """
        payload = {
            "event": ServerMessageType.BLOCKER_CREATED,
            "node_id": node_id,
            "blocker_id": blocker_id,
            "category": category,
            "severity": severity,
            "actor_upn": actor_upn,
        }

        await self._broadcast_to_project(project_id, payload)

    async def broadcast_blocker_resolved(
        self,
        project_id: str,
        node_id: str,
        blocker_id: str,
        actor_upn: str,
    ) -> None:
        """Broadcast a BLOCKER_RESOLVED event to all subscribers of a project.

        Parameters
        ----------
        project_id : str
            The UUID of the project containing the affected node.
        node_id : str
            The UUID of the node whose blocker was resolved.
        blocker_id : str
            The UUID of the resolved blocker.
        actor_upn : str
            The principal name of the user who resolved the blocker.
        """
        payload = {
            "event": ServerMessageType.BLOCKER_RESOLVED,
            "node_id": node_id,
            "blocker_id": blocker_id,
            "actor_upn": actor_upn,
        }

        await self._broadcast_to_project(project_id, payload)

    def get_project_presence(
        self,
        project_id: str,
    ) -> List[Dict[str, Any]]:
        """Return the current presence state for all users in a project.

        This method is used when a new client connects to send them the
        current presence state so they can immediately render colleague
        avatars without waiting for the next heartbeat.

        Parameters
        ----------
        project_id : str
            The UUID of the project.

        Returns
        -------
        List[dict]
            List of presence records, each containing:

            - ``user_id`` — The user's primary key.
            - ``user_upn`` — The user's principal name.
            - ``node_id`` — The node currently being inspected.
            - ``active_pane`` — The UI pane in focus.
            - ``last_heartbeat`` — Timestamp of the last heartbeat.
        """
        subscriber_ids = self._project_subscribers.get(project_id, set())
        presence = []

        for user_id in subscriber_ids:
            connection = self._connections.get(user_id)
            if connection and connection.focus_state:
                fs = connection.focus_state
                presence.append({
                    "user_id": fs.user_id,
                    "user_upn": fs.user_upn,
                    "node_id": fs.node_id,
                    "active_pane": fs.active_pane,
                    "last_heartbeat": fs.last_heartbeat,
                })

        return presence

    # -----------------------------------------------------------------------
    # Internal methods
    # -----------------------------------------------------------------------

    async def _handle_heartbeat(
        self,
        connection: WebSocketConnection,
        message: Dict[str, Any],
    ) -> None:
        """Process a HEARTBEAT message and update the user's focus state.

        When a heartbeat arrives, the user's focus state is updated and
        a ``USER_FOCUS_CHANGED`` event is broadcast to all other project
        viewers.  This enables live presence avatars that move as
        colleagues navigate the schedule.

        Parameters
        ----------
        connection : WebSocketConnection
            The active WebSocket connection.
        message : dict
            The heartbeat message containing focus state data.
        """
        connection.last_heartbeat = time.time()

        # Update focus state
        old_node_id = (
            connection.focus_state.node_id
            if connection.focus_state
            else None
        )

        focus_state = UserFocusState(
            user_id=connection.user_id,
            user_upn=connection.user_upn,
            node_id=message.get("node_id"),
            active_pane=message.get("active_pane"),
            last_heartbeat=connection.last_heartbeat,
            cell_focus=connection.focus_state.cell_focus
            if connection.focus_state
            else None,
        )
        connection.focus_state = focus_state

        # Broadcast focus change to all projects this user is subscribed to
        for project_id in connection.project_ids:
            # Only broadcast if the node actually changed
            if old_node_id != focus_state.node_id:
                payload = {
                    "event": ServerMessageType.USER_FOCUS_CHANGED,
                    "user_id": connection.user_id,
                    "user_upn": connection.user_upn,
                    "node_id": focus_state.node_id,
                    "active_pane": focus_state.active_pane,
                }
                await self._broadcast_to_project(
                    project_id, payload, exclude_user_id=connection.user_id,
                )

    async def _handle_cell_focused(
        self,
        connection: WebSocketConnection,
        message: Dict[str, Any],
    ) -> None:
        """Process a CELL_FOCUSED message.

        When a user double-clicks a cell to edit it, the client sends
        this message.  The server checks for a soft-lock collision: if
        another user already holds this cell, a SOFT_LOCK_WARNING is
        sent back.  Otherwise, the cell focus is recorded and broadcast
        to all other project viewers.

        Parameters
        ----------
        connection : WebSocketConnection
            The active WebSocket connection.
        message : dict
            The CELL_FOCUSED message containing project_id, node_id,
            column_key, and optional display_color.
        """
        project_id = message.get("project_id")
        node_id = message.get("node_id")
        column_key = message.get("column_key")

        if not all([project_id, node_id, column_key]):
            logger.warning(
                "Incomplete CELL_FOCUSED from user_id=%s: %s",
                connection.user_id, message,
            )
            return

        # Check for soft-lock collision
        holder = self.check_cell_collision(
            project_id, node_id, column_key, connection.user_id,
        )
        if holder:
            await self.send_soft_lock_warning(connection, holder)
            return

        # Record cell focus
        display_color = message.get(
            "display_color",
            self._get_user_color(connection.user_id),
        )
        cell_focus = CellFocusState(
            user_id=connection.user_id,
            user_upn=connection.user_upn,
            node_id=node_id,
            column_key=column_key,
            display_color=display_color,
            project_id=project_id,
        )

        # Store in cell focus map
        if project_id not in self._cell_focus_map:
            self._cell_focus_map[project_id] = {}
        key = self._cell_key(node_id, column_key)
        self._cell_focus_map[project_id][key] = cell_focus

        # Update connection focus state
        if connection.focus_state:
            connection.focus_state.cell_focus = cell_focus

        # Publish via Redis pub/sub channel (simulated — in production,
        # this would use redis.publish(f"presence:{project_id}", payload))
        logger.debug(
            "Redis pub/sub presence:%s — CELL_FOCUSED user_id=%s %s",
            project_id, connection.user_id, key,
        )

        # Broadcast to other viewers
        await self.broadcast_cell_focused(project_id, cell_focus)

    async def _handle_cell_blurred(
        self,
        connection: WebSocketConnection,
        message: Dict[str, Any],
    ) -> None:
        """Process a CELL_BLURRED message.

        When a user finishes editing a cell (commit, revert, or escape),
        the client sends this message.  The server removes the cell focus
        record and broadcasts the blur to all other project viewers.

        Parameters
        ----------
        connection : WebSocketConnection
            The active WebSocket connection.
        message : dict
            The CELL_BLURRED message containing project_id, node_id,
            and column_key.
        """
        project_id = message.get("project_id")
        node_id = message.get("node_id")
        column_key = message.get("column_key")

        if not all([project_id, node_id, column_key]):
            logger.warning(
                "Incomplete CELL_BLURRED from user_id=%s: %s",
                connection.user_id, message,
            )
            return

        # Remove from cell focus map
        if project_id in self._cell_focus_map:
            key = self._cell_key(node_id, column_key)
            self._cell_focus_map[project_id].pop(key, None)
            # Clean up empty project entries
            if not self._cell_focus_map[project_id]:
                del self._cell_focus_map[project_id]

        # Clear cell focus on connection
        if connection.focus_state:
            connection.focus_state.cell_focus = None

        # Broadcast blur to other viewers
        await self.broadcast_cell_blurred(
            project_id, connection.user_id, node_id, column_key,
        )

    async def _send_welcome(
        self,
        connection: WebSocketConnection,
        project_id: str,
    ) -> None:
        """Send a WELCOME message with current presence state on subscribe.

        When a user subscribes to a project channel, they receive a
        ``WELCOME`` message containing the current presence state of all
        other users in that project.  This allows the frontend to
        immediately render colleague avatars.

        Parameters
        ----------
        connection : WebSocketConnection
            The active WebSocket connection.
        project_id : str
            The project the user subscribed to.
        """
        presence = self.get_project_presence(project_id)

        payload = {
            "event": ServerMessageType.WELCOME,
            "project_id": project_id,
            "presence": presence,
        }

        await self._send_to_connection(connection, payload)

    async def _broadcast_to_project(
        self,
        project_id: str,
        payload: Dict[str, Any],
        exclude_user_id: Optional[int] = None,
    ) -> None:
        """Broadcast a message to all subscribers of a project channel.

        Parameters
        ----------
        project_id : str
            The UUID of the project channel.
        payload : dict
            The message payload to broadcast.
        exclude_user_id : int or None
            If set, exclude this user from the broadcast (e.g., the user
            who triggered the mutation doesn't need to receive their own
            change back).
        """
        subscriber_ids = self._project_subscribers.get(project_id, set())
        message_json = json.dumps(payload)

        for user_id in subscriber_ids:
            if user_id == exclude_user_id:
                continue

            connection = self._connections.get(user_id)
            if connection and project_id in connection.project_ids:
                await self._send_to_connection(connection, payload)

    async def _send_to_connection(
        self,
        connection: WebSocketConnection,
        payload: Dict[str, Any],
    ) -> None:
        """Send a JSON message to a single WebSocket connection.

        Parameters
        ----------
        connection : WebSocketConnection
            The target WebSocket connection.
        payload : dict
            The message payload to send.
        """
        try:
            await connection.websocket.send_text(json.dumps(payload))
        except Exception as e:
            logger.warning(
                "Failed to send message to user_id=%s: %s",
                connection.user_id, e,
            )

    async def _remove_connection(
        self,
        connection: WebSocketConnection,
        notify: bool = True,
    ) -> None:
        """Remove a connection and clean up all subscriptions.

        Parameters
        ----------
        connection : WebSocketConnection
            The connection to remove.
        notify : bool
            If True, broadcast a USER_FOCUS_CHANGED event with node_id=None
            to signal that this user has left.
        """
        user_id = connection.user_id

        # Clear any cell focus held by this user
        if connection.focus_state and connection.focus_state.cell_focus:
            cf = connection.focus_state.cell_focus
            project_id = cf.project_id
            if project_id:
                await self.broadcast_cell_blurred(
                    project_id, user_id, cf.node_id, cf.column_key,
                )
                if project_id in self._cell_focus_map:
                    key = self._cell_key(cf.node_id, cf.column_key)
                    self._cell_focus_map[project_id].pop(key, None)
                    if not self._cell_focus_map[project_id]:
                        del self._cell_focus_map[project_id]

        # Notify other users about the departure
        if notify and connection.focus_state:
            for project_id in connection.project_ids:
                payload = {
                    "event": ServerMessageType.USER_FOCUS_CHANGED,
                    "user_id": user_id,
                    "user_upn": connection.user_upn,
                    "node_id": None,
                    "active_pane": None,
                }
                await self._broadcast_to_project(
                    project_id, payload, exclude_user_id=user_id,
                )

        # Remove from all project channels
        for project_id in connection.project_ids:
            if project_id in self._project_subscribers:
                self._project_subscribers[project_id].discard(user_id)
                if not self._project_subscribers[project_id]:
                    del self._project_subscribers[project_id]

        # Remove from connections dict
        self._connections.pop(user_id, None)

        logger.info(
            "WebSocket disconnected: user_id=%s, total=%d",
            user_id, self.connection_count,
        )

    async def _cleanup_loop(self) -> None:
        """Background task that periodically removes stale connections.

        Runs every ``_cleanup_interval`` seconds.  Any connection without
        a heartbeat within ``_heartbeat_timeout`` seconds is considered
        stale and is disconnected.

        This prevents zombie connections from lingering after a browser
        crash or network failure.
        """
        while True:
            await asyncio.sleep(self._cleanup_interval)
            now = time.time()

            stale_user_ids = [
                user_id
                for user_id, conn in self._connections.items()
                if (now - conn.last_heartbeat) > self._heartbeat_timeout
            ]

            for user_id in stale_user_ids:
                connection = self._connections.get(user_id)
                if connection:
                    logger.warning(
                        "Removing stale connection: user_id=%s, "
                        "last_heartbeat=%.1fs ago",
                        user_id, now - connection.last_heartbeat,
                    )
                    await self._remove_connection(connection, notify=True)


# Global singleton — shared across all WebSocket endpoints
manager = WebSocketConnectionManager()
