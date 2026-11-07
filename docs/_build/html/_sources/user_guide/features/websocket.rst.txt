Real-Time Collaboration
=======================


See live updates from other users working on the same project data.

WebSocket
~~~~~~~~~


WebSocket endpoint for real-time project collaboration.

This module provides the WebSocket endpoint that clients connect to for
real-time presence tracking and cache invalidation.

Endpoint
~~~~~~~~

``GET /ws/projects/{project_id}``

The client connects using a WebSocket URL with a JWT token in the query
string:

.. code-block:: text

   ws://localhost:8000/ws/projects/{project_id}?token={jwt_token}

Authentication
~~~~~~~~~~~~~~

The JWT token is extracted from the ``token`` query parameter and validated
using the same ``decode_access_token`` function used by HTTP endpoints.
If the token is invalid or expired, the connection is closed with code
1008 (Policy Violation).

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
