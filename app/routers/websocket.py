"""WebSocket endpoint for real-time project collaboration.

This module provides the WebSocket endpoint that clients connect to for
real-time presence tracking and cache invalidation.

Endpoint
~~~~~~~~

``GET /ws/projects/{project_id}``

The client connects using a WebSocket URL with a JWT token in the query
string.  In production, use **WSS** (secure WebSocket) instead of WS:

.. code-block:: text

    wss://localhost:8080/ws/projects/{project_id}?token={jwt_token}

Authentication
~~~~~~~~~~~~~~

The JWT token is extracted from the ``token`` query parameter and validated
using the same ``decode_access_token`` function used by HTTP endpoints.
If the token is invalid or expired, the connection is closed with code
1008 (Policy Violation).

Security
~~~~~~~~

- **WSS (Secure WebSocket)** — In production, all WebSocket connections
  must use WSS (WebSocket over TLS).  The Nginx reverse proxy handles
  TLS termination and forwards the connection to the backend.
- **JWT Authentication** — Every WebSocket connection requires a valid
  JWT token.  Tokens are validated on connection establishment.
- **Rate Limiting** — WebSocket connections are rate-limited to 5/second
  per client IP via Nginx.

Message Protocol
~~~~~~~~~~~~~~~~

Once connected, the client subscribes to the project channel by sending
a ``SUBSCRIBE`` message.  The server then sends a ``WELCOME`` message
containing the current presence state of all other users in the project.

The client should send ``HEARTBEAT`` messages every 15 seconds to maintain
the connection and update its focus state.  If no heartbeat is received
within 30 seconds, the connection is considered stale.

Example Client Flow
~~~~~~~~~~~~~~~~~~~

1. Connect: ``new WebSocket('/ws/projects/{id}?token={token}')``
2. Subscribe: ``ws.send(JSON.stringify({type: 'SUBSCRIBE', project_id: id}))``
3. Receive ``WELCOME`` with current presence state.
4. Send ``HEARTBEAT`` every 15 seconds with current focus state.
5. Handle incoming events (``NODE_MUTATED``, ``USER_FOCUS_CHANGED``, etc.).
6. On disconnect, send ``UNSUBSCRIBE`` or let the server detect stale state.
"""

import json
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.utils.security import decode_access_token
from app.models.models import User
from app.services.ws_presence import manager

import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["WebSocket"],
)


@router.websocket("/ws/projects/{project_id}")
async def project_websocket(
    websocket: WebSocket,
    project_id: str,
    token: Optional[str] = Query(None, description="JWT access token"),
):
    """WebSocket endpoint for real-time project collaboration.

    When a client connects, the JWT token is validated and the user is
    registered in the connection manager.  The client then subscribes
    to the project channel and receives real-time events:

    - **USER_FOCUS_CHANGED** — A colleague's focus position updated.
    - **NODE_MUTATED** — A node was modified; update the local cache.
    - **NODE_CREATED** — A new node was added to the tree.
    - **NODE_DELETED** — A node was removed from the tree.
    - **BLOCKER_CREATED** — A new blocker was logged.
    - **BLOCKER_RESOLVED** — A blocker was resolved.

    Parameters
    ----------
    websocket : WebSocket
        The incoming WebSocket connection.
    project_id : str
        The UUID of the project the client wants to collaborate on.
    token : str or None
        JWT access token passed in the query string.

    Raises
    ------
    WebSocketDisconnect
        If the token is invalid or the user is not found, the connection
        is closed with code 1008 (Policy Violation).
    """
    # Authenticate the user via JWT token
    if not token:
        await websocket.close(code=1008, reason="Missing authentication token")
        return

    try:
        payload = decode_access_token(token)
        user_upn: str = payload.get("sub")
        if not user_upn:
            await websocket.close(code=1008, reason="Invalid token payload")
            return
    except Exception as e:
        logger.warning("WebSocket auth failed: %s", e)
        await websocket.close(code=1008, reason="Invalid or expired token")
        return

    # Accept the WebSocket connection
    await websocket.accept()

    # Look up the user in the database
    db: Session = next(get_db())
    try:
        user = db.query(User).filter(User.email == user_upn).first()
        if not user:
            # Also try username
            user = db.query(User).filter(User.username == user_upn).first()

        if not user:
            await websocket.close(
                code=1008, reason="User not found for token"
            )
            return

        user_id = user.id
        user_upn = user.email or user.username
    finally:
        db.close()

    # Register the connection with the manager
    connection = await manager.connect(websocket, user_id, user_upn)

    logger.info(
        "WebSocket accepted: user=%s, project=%s",
        user_upn, project_id,
    )

    try:
        while True:
            # Receive raw text message from the client
            data = await websocket.receive_text()

            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                logger.warning(
                    "Invalid JSON from user_id=%s: %s",
                    user_id, data[:100],
                )
                continue

            # Handle SUBSCRIBE on first message if not already subscribed
            msg_type = message.get("type")
            if msg_type == "SUBSCRIBE":
                sub_project_id = message.get("project_id")
                if sub_project_id and sub_project_id not in connection.project_ids:
                    await manager.subscribe(connection, sub_project_id)
            else:
                # Route the message through the connection manager
                await manager.handle_message(connection, message)

    except WebSocketDisconnect:
        logger.info(
            "WebSocket disconnected: user=%s, project=%s",
            user_upn, project_id,
        )
    except Exception as e:
        logger.error(
            "WebSocket error for user=%s: %s",
            user_upn, e,
            exc_info=True,
        )
    finally:
        # Clean up the connection on disconnect
        await manager.disconnect(connection)
