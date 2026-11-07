AI Assistant (MCP)
==================


Use the AI assistant to query project data and perform actions through natural language.

MCP Gateway
~~~~~~~~~~~


MCP (Model Context Protocol) SSE router for conversational AI integration.

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
