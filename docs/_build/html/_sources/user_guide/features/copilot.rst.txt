CoPilot AI
==========


Chat with the CoPilot AI assistant to get help with project management tasks and data queries.

CoPilot - AI Chat
~~~~~~~~~~~~~~~~~


CoPilot chat API router — streaming AI chat with MCP tool integration.

This module provides the backend endpoints for the CoPilot chat feature.
It connects the frontend chat UI to LLM backends (OpenAI, Anthropic, or
OpenAI-compatible endpoints) and enables the LLM to invoke MCP tools for
real-time data access.

Endpoints
~~~~~~~~~

- **POST /chat** — Streaming chat endpoint using Server-Sent Events (SSE).
  Accepts a message, context, and conversation history. Returns streamed
  tokens and tool call events.

- **POST /stop** — Stop the current streaming response.

- **GET /tools** — List available MCP tools with descriptions.

Chat Flow
~~~~~~~~~

1. Frontend sends a POST request with the user's message and context.
2. Backend validates the JWT token and builds a system prompt with context.
3. The LLM is called with MCP tools as function calling tools.
4. When the LLM requests a tool call, the corresponding MCP tool is executed.
5. Tokens are streamed back to the frontend via SSE.

Security
~~~~~~~~

All requests require a valid JWT token. The user's clearance level is
passed to MCP tools for ABAC enforcement. Tool results are already
filtered by clearance, so no additional security layer is needed.
