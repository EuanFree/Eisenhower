"""CoPilot chat API router — streaming AI chat with MCP tool integration.

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
"""
import asyncio
import json
from datetime import timedelta
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import User
from app.utils.auth import get_current_user
from app.services.llm_provider import (
    ChatMessage,
    ChatChunk,
    ToolCall as LLMToolCall,
    ToolDefinition,
    create_provider,
)
from app.services.copilot_context import (
    CopilotContext,
    build_system_prompt,
    build_context_from_request,
)

router = APIRouter(
    prefix="/api/v1/copilot",
    tags=["CoPilot - AI Chat"],
)


# ============================================================================
# Request/Response models
# ============================================================================


class ChatRequest(BaseModel):
    """Request body for the chat endpoint."""
    message: str = Field(..., min_length=1, max_length=4000, description="User message")
    context: Dict[str, Any] = Field(
        default_factory=dict,
        description="Current UI context (view, project, node, etc.)",
    )
    conversation_history: List[Dict[str, str]] = Field(
        default_factory=list,
        description="Previous messages in the conversation",
    )


class ToolInfoResponse(BaseModel):
    """Response model for a single tool."""
    name: str
    description: str
    parameters: Dict[str, Any]


class ToolsListResponse(BaseModel):
    """Response model for the tools list endpoint."""
    tools: List[ToolInfoResponse]
    count: int


# ============================================================================
# Active streaming sessions tracking
# ============================================================================


active_sessions: Dict[str, asyncio.Event] = {}
"""Track active streaming sessions for the /stop endpoint.

Keys are user IDs, values are asyncio.Event objects that signal
when streaming should stop.
"""


# ============================================================================
# Helper: get MCP tool definitions
# ============================================================================


def _get_mcp_tool_definitions() -> List[ToolDefinition]:
    """Extract tool definitions from the MCP server for LLM function calling.

    Returns
    -------
    list[ToolDefinition]
        List of tool definitions with name, description, and parameters.
    """
    from app.services.mcp_server import mcp

    tools = []
    # Access the internal tool registry of the MCP server
    if hasattr(mcp, "_tool_registry"):
        for tool_name, tool_obj in mcp._tool_registry.items():
            # Extract parameter schema from the tool's function signature
            params = _extract_tool_parameters(tool_obj)
            tools.append(ToolDefinition(
                name=tool_name,
                description=getattr(tool_obj, "description", ""),
                parameters=params,
            ))
    return tools


def _extract_tool_parameters(tool_obj: Any) -> Dict[str, Any]:
    """Extract parameter schema from an MCP tool object.

    Parameters
    ----------
    tool_obj : any
        The MCP tool object.

    Returns
    -------
    dict
        JSON Schema representation of the tool's parameters.
    """
    func = getattr(tool_obj, "fn", None) or getattr(tool_obj, "func", None)
    if func is None:
        return {"type": "object", "properties": {}}

    import inspect
    sig = inspect.signature(func)
    properties = {}
    required = []

    for param_name, param in sig.parameters.items():
        if param_name == "auth_token":
            # Skip auth_token — it's injected by the CoPilot, not the LLM
            continue
        param_type = "string"
        if param.annotation != inspect.Parameter.empty:
            ann = param.annotation
            if hasattr(ann, "__origin__"):
                if ann.__origin__ is list or ann.__origin__ is List:
                    param_type = "array"
                elif ann.__origin__ is dict or ann.__origin__ is Dict:
                    param_type = "object"
            elif ann in (int, float):
                param_type = "number"
            elif ann is bool:
                param_type = "boolean"

        prop: Dict[str, Any] = {"type": param_type}
        if param.default == inspect.Parameter.empty:
            required.append(param_name)
        else:
            prop["default"] = param.default

        properties[param_name] = prop

    schema: Dict[str, Any] = {"type": "object", "properties": properties}
    if required:
        schema["required"] = required
    return schema


async def _execute_mcp_tool(
    tool_name: str,
    arguments: Dict[str, Any],
    auth_token: str,
) -> str:
    """Execute an MCP tool by name and return the result as a string.

    Parameters
    ----------
    tool_name : str
        Name of the MCP tool to execute.
    arguments : dict
        Tool arguments from the LLM.
    auth_token : str
        User's JWT token for authentication.

    Returns
    -------
    str
        JSON string of the tool result.

    Raises
    ------
    ValueError
        If the tool is not found or execution fails.
    """
    from app.services.mcp_server import mcp

    # Get the tool function from the MCP server
    tool_obj = None
    if hasattr(mcp, "_tool_registry"):
        tool_obj = mcp._tool_registry.get(tool_name)

    if tool_obj is None:
        return json.dumps({"error": f"Tool '{tool_name}' not found"})

    func = getattr(tool_obj, "fn", None) or getattr(tool_obj, "func", None)
    if func is None:
        return json.dumps({"error": f"Tool '{tool_name}' has no callable function"})

    # Inject auth_token into arguments
    arguments["auth_token"] = auth_token

    try:
        result = func(**arguments)
        return json.dumps(result, default=str)
    except Exception as e:
        return json.dumps({"error": str(e)})


# ============================================================================
# SSE event formatting
# ============================================================================


def _format_sse_event(event_type: str, data: Any) -> str:
    """Format a data payload as an SSE event.

    Parameters
    ----------
    event_type : str
        Event type (e.g., "token", "tool_call", "error", "done").
    data : any
        Data payload (will be JSON-serialized).

    Returns
    -------
    str
        Formatted SSE event string.
    """
    data_str = json.dumps(data, default=str)
    return f"event: {event_type}\ndata: {data_str}\n\n"


# ============================================================================
# Endpoints
# ============================================================================


@router.post("/chat")
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stream a chat completion with MCP tool support.

    This endpoint accepts a user message, builds a system prompt with
    the current context, calls the LLM with MCP tools as function
    calling tools, and streams tokens back via SSE.

    The LLM can request tool calls, which are executed synchronously
    and the results are fed back to the LLM for the final response.
    """
    from starlette.responses import StreamingResponse

    # Create stop event for this session
    user_id = str(current_user.id)
    stop_event = asyncio.Event()
    active_sessions[user_id] = stop_event

    try:
        # Build context
        context = build_context_from_request(
            request.model_dump(),
            user_clearance=current_user.clearance_level.value
            if hasattr(current_user.clearance_level, "value")
            else str(current_user.clearance_level or "OFFICIAL"),
        )

        # Get tool definitions
        tool_definitions = _get_mcp_tool_definitions()
        tool_names = [t.name for t in tool_definitions]

        # Build system prompt
        system_prompt = build_system_prompt(context, tool_names)

        # Build message history
        messages: List[ChatMessage] = [
            ChatMessage(role="system", content=system_prompt),
        ]

        # Add conversation history (limit to last 20 messages to stay within token limits)
        history = request.conversation_history[-20:]
        for msg in history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("system", "user", "assistant"):
                messages.append(ChatMessage(role=role, content=content))

        # Add current user message
        messages.append(ChatMessage(role="user", content=request.message))

        # Get LLM provider
        try:
            provider = create_provider()
        except ValueError as e:
            return StreamingResponse(
                _format_sse_event("error", {
                    "message": "LLM provider not configured. "
                               "Set COPILOT_PROVIDER, COPILOT_API_KEY, and COPILOT_MODEL environment variables.",
                    "detail": str(e),
                }),
                media_type="text/event-stream",
            )

        # Get auth token for MCP tool calls
        from app.utils.security import create_access_token
        auth_token = create_access_token(
            data={"sub": str(current_user.id)},
            expires_delta=timedelta(minutes=60),
        )

        async def event_generator():
            """Generate SSE events for the chat response."""
            # Signal that streaming has started
            yield _format_sse_event("start", {
                "provider": provider.provider_name,
                "model": provider.model_name,
            })

            # Track tool calls in this turn
            turn_tool_calls: List[Dict[str, Any]] = []

            # Call LLM — it may return tool calls
            completion = await provider.chat_completion(
                messages=messages,
                tools=tool_definitions if tool_definitions else None,
            )

            if completion.tool_calls:
                # Execute each tool call
                for tool_call in completion.tool_calls:
                    # Send tool call start event
                    yield _format_sse_event("tool_call_start", {
                        "id": tool_call.id,
                        "name": tool_call.name,
                        "arguments": tool_call.arguments,
                    })

                    # Check if user stopped
                    if stop_event.is_set():
                        yield _format_sse_event("done", {"reason": "stopped"})
                        return

                    # Execute the tool
                    try:
                        result = await asyncio.wait_for(
                            asyncio.to_thread(
                                _execute_mcp_tool,
                                tool_call.name,
                                tool_call.arguments,
                                auth_token,
                            ),
                            timeout=10.0,
                        )
                    except asyncio.TimeoutError:
                        result = json.dumps({"error": "Tool execution timed out after 10 seconds"})
                    except Exception as e:
                        result = json.dumps({"error": str(e)})

                    # Send tool call result event
                    yield _format_sse_event("tool_call_end", {
                        "id": tool_call.id,
                        "name": tool_call.name,
                        "result": result,
                    })

                    turn_tool_calls.append({
                        "name": tool_call.name,
                        "arguments": tool_call.arguments,
                        "result": result,
                    })

                # Build a follow-up message with tool results
                tool_messages: List[ChatMessage] = []
                for tc in completion.tool_calls:
                    tool_messages.append(ChatMessage(
                        role="assistant",
                        content=json.dumps({
                            "tool_call": tc.name,
                            "arguments": tc.arguments,
                        }),
                    ))
                    # Find the corresponding result
                    for trc in turn_tool_calls:
                        if trc["name"] == tc.name:
                            tool_messages.append(ChatMessage(
                                role="user",
                                content=trc["result"],
                            ))
                            break

                # Stream the final response with tool context
                final_messages = messages + tool_messages
                async for chunk in provider.chat(
                    messages=final_messages,
                    tools=None,  # No more tool calls in final response
                ):
                    if stop_event.is_set():
                        yield _format_sse_event("done", {"reason": "stopped"})
                        return
                    if chunk.content:
                        yield _format_sse_event("token", chunk.content)
                    if chunk.finish_reason:
                        yield _format_sse_event("done", {"reason": chunk.finish_reason})
                        return

            elif completion.content:
                # No tool calls — stream the content directly
                for char in completion.content:
                    if stop_event.is_set():
                        yield _format_sse_event("done", {"reason": "stopped"})
                        return
                    yield _format_sse_event("token", char)
                yield _format_sse_event("done", {"reason": completion.finish_reason or "stop"})
            else:
                # Empty response
                yield _format_sse_event("token", "I couldn't generate a response. Please try again.")
                yield _format_sse_event("done", {"reason": "empty"})

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    finally:
        # Clean up stop event
        active_sessions.pop(user_id, None)


@router.post("/stop")
async def stop_streaming(
    current_user: User = Depends(get_current_user),
):
    """Stop the current streaming response for the user.

    This endpoint signals the active streaming session to stop
    generating tokens.
    """
    user_id = str(current_user.id)
    stop_event = active_sessions.get(user_id)

    if stop_event:
        stop_event.set()
        return {"status": "stopped"}
    else:
        return {"status": "no_active_stream"}


@router.get("/tools", response_model=ToolsListResponse)
async def list_tools():
    """List all available MCP tools with their descriptions and parameters.

    This endpoint is used by the frontend to display available tools
    in the CoPilot UI.
    """
    tool_definitions = _get_mcp_tool_definitions()
    tools = [
        ToolInfoResponse(
            name=td.name,
            description=td.description,
            parameters=td.parameters,
        )
        for td in tool_definitions
    ]
    return ToolsListResponse(tools=tools, count=len(tools))


@router.get("/provider-info")
async def get_provider_info(
    current_user: User = Depends(get_current_user),
):
    """Get information about the configured LLM provider.

    Returns the provider name, model name, and whether the provider
    is properly configured.
    """
    try:
        provider = create_provider()
        return {
            "configured": True,
            "provider": provider.provider_name,
            "model": provider.model_name,
        }
    except ValueError as e:
        return {
            "configured": False,
            "error": str(e),
        }
