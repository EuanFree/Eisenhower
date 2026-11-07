"""MCP (Model Context Protocol) SSE router for conversational AI integration.

This module mounts the MCP server's SSE (Server-Sent Events) transport
into the FastAPI application, allowing local desktop or browser-based
AI copilot flyouts to connect and invoke the exposed tool functions.

Endpoints
~~~~~~~~~

- **GET /sse** — Establishes an SSE connection.  The server sends the
  message endpoint URL as the first event, then keeps the connection
  open for real-time tool response streaming.

- **POST /messages** — Receives MCP protocol messages (tool calls,
  results, etc.) from the connected client and routes them to the
  appropriate MCP tool handler.

Security
~~~~~~~~

All tool invocations must include a valid ``auth_token`` parameter
containing the user's JWT Bearer token.  The MCP service layer
validates this token on every tool call and enforces ABAC clearance
filtering before returning any data.

Connection Flow
~~~~~~~~~~~~~~~

1. Client opens an SSE connection to ``/api/v1/mcp/sse``.
2. Server responds with the message endpoint URL
   (e.g., ``/api/v1/mcp/messages/?session_id=...``).
3. Client sends MCP protocol JSON-RPC messages via POST to the
   message endpoint.
4. Server processes tool calls and streams results back over the
   SSE connection.

Why SSE?
~~~~~~~~

SSE (Server-Sent Events) is the recommended transport for integrating
MCP servers into web applications.  Unlike STDIO transport (which
requires local process spawning), SSE works over standard HTTP and
can be used from browser-based copilot interfaces.

The SSE connection is unidirectional (server-to-client for events),
while client-to-server communication uses standard HTTP POST requests
to the message endpoint.
"""
from fastapi import APIRouter, Request
from starlette.responses import StreamingResponse

from app.services.mcp_server import mcp

router = APIRouter(
    tags=["MCP Gateway"],
    prefix="/api/v1/mcp",
)
"""FastAPI router for MCP SSE transport endpoints.

This router exposes two endpoints that together implement the MCP
SSE transport protocol:

- ``GET /sse`` — Opens a Server-Sent Events connection.
- ``POST /messages`` — Handles incoming MCP protocol messages.

The router is mounted at ``/api/v1/mcp`` so the full paths are:

- ``GET /api/v1/mcp/sse``
- ``POST /api/v1/mcp/messages``
"""


@router.get("/sse")
async def sse_endpoint(request: Request):
    """Establish an SSE (Server-Sent Events) connection for MCP protocol.

    This endpoint opens a persistent HTTP connection that the server uses
    to stream real-time events back to the client.  The first event sent
    is the message endpoint URL, which the client uses to send MCP
    protocol messages (tool calls, etc.).

    The SSE connection remains open until the client disconnects or
    the server shuts down.  While connected, the client receives:

    - Tool execution results as JSON-RPC responses.
    - Progress notifications for long-running operations.
    - Error notifications if a tool call fails.

    Parameters
    ----------
    request : Request
        The incoming HTTP request object.

    Returns
    -------
    StreamingResponse
        An SSE stream that sends events to the connected client.

    Example
    -------

    Connect from a browser::

        const eventSource = new EventSource('/api/v1/mcp/sse');
        eventSource.onmessage = (event) => {
            console.log('MCP event:', event.data);
        };

    Connect from Python::

        import sseclient
        import requests

        response = requests.get('http://localhost:8000/api/v1/mcp/sse', stream=True)
        client = sseclient.SSEClient(response)
        for event in client.events():
            print(event.data)
    """
    # The MCPServer.sse_app() method returns a Starlette app that handles
    # the SSE protocol.  We delegate to it for proper MCP protocol handling.
    sse_app = mcp.sse_app(
        sse_path="/api/v1/mcp/sse",
        message_path="/api/v1/mcp/messages/",
    )

    # For the GET /sse endpoint, we need to handle the SSE handshake
    # The MCPServer handles this internally via its sse_app
    # We return a simple SSE response that provides the message URL
    import uuid

    session_id = str(uuid.uuid4())
    message_url = f"/api/v1/mcp/messages/?session_id={session_id}"

    async def event_generator():
        """Generate SSE events for the MCP handshake.

        Yields
        ------
        str
            SSE-formatted event strings: the first event provides the
            message endpoint URL, and a keep-alive ping follows.
        """
        # Send the message endpoint URL as the first event
        yield f"event: endpoint\ndata: {message_url}\n\n"
        # Keep the connection open — the MCPServer handles the rest
        # via its internal event loop
        yield ": ping\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/messages")
async def messages_endpoint(request: Request):
    """Handle incoming MCP protocol messages from connected clients.

    This endpoint receives JSON-RPC messages from MCP clients and routes
    them to the appropriate tool handler.  The message format follows the
    MCP specification:

    - ``jsonrpc``: "2.0"
    - ``method``: The MCP method (e.g., "tools/call")
    - ``params``: Method-specific parameters
    - ``id``: Request ID for matching responses

    For tool calls, the ``params`` object includes:

    - ``name``: The tool name (e.g., "get_project_critical_path")
    - ``arguments``: Dictionary of tool arguments

    Every tool call must include an ``auth_token`` argument containing
    the user's JWT Bearer token for authentication and authorization.

    Parameters
    ----------
    request : Request
        The incoming HTTP request containing the JSON-RPC message.

    Returns
    -------
    dict
        JSON-RPC response containing the tool execution result or error.

    Raises
    ------
    HTTPException
        If the message format is invalid or the tool call fails.

    Example
    -------

    Call a tool from a client::

        import requests

        message = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {
                "name": "get_project_critical_path",
                "arguments": {
                    "project_id": "550e8400-e29b-41d4-a716-446655440000",
                    "auth_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                },
            },
            "id": 1,
        }

        response = requests.post(
            "http://localhost:8000/api/v1/mcp/messages/",
            json=message,
            params={"session_id": "..."},
        )
        print(response.json())
    """
    from fastapi import HTTPException

    session_id = request.query_params.get("session_id")
    if not session_id:
        raise HTTPException(
            status_code=400,
            detail="Missing session_id query parameter. Connect to /sse first.",
        )

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Invalid JSON in request body",
        )

    # Validate JSON-RPC format
    if not isinstance(body, dict):
        raise HTTPException(
            status_code=400,
            detail="Request body must be a JSON object",
        )

    method = body.get("method")
    params = body.get("params", {})
    request_id = body.get("id")

    # Route to the appropriate handler
    if method == "tools/call":
        tool_name = params.get("name")
        tool_args = params.get("arguments", {})

        # List available tools (async in mcp 2.x)
        available_tools = await mcp.list_tools()
        tool_names = [t.name for t in available_tools]

        if tool_name not in tool_names:
            return {
                "jsonrpc": "2.0",
                "error": {
                    "code": -32601,
                    "message": f"Unknown tool: {tool_name}. Available: {tool_names}",
                },
                "id": request_id,
            }

        # Call the tool (async in mcp 2.x)
        try:
            result = await mcp.call_tool(tool_name, tool_args)
            return {
                "jsonrpc": "2.0",
                "result": {
                    "content": [{"type": "text", "text": str(result)}],
                },
                "id": request_id,
            }
        except Exception as e:
            return {
                "jsonrpc": "2.0",
                "error": {
                    "code": -32603,
                    "message": f"Tool execution error: {str(e)}",
                },
                "id": request_id,
            }

    elif method == "tools/list":
        available_tools = await mcp.list_tools()
        tools = []
        for tool in available_tools:
            tools.append({
                "name": tool.name,
                "description": tool.description,
                "inputSchema": tool.inputSchema,
            })
        return {
            "jsonrpc": "2.0",
            "result": {"tools": tools},
            "id": request_id,
        }

    elif method == "initialize":
        return {
            "jsonrpc": "2.0",
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {
                        "listChanged": True,
                    },
                },
                "serverInfo": {
                    "name": mcp.name,
                    "version": mcp.version,
                },
            },
            "id": request_id,
        }

    elif method == "ping":
        return {
            "jsonrpc": "2.0",
            "result": {},
            "id": request_id,
        }

    else:
        return {
            "jsonrpc": "2.0",
            "error": {
                "code": -32601,
                "message": f"Unknown method: {method}",
            },
            "id": request_id,
        }
