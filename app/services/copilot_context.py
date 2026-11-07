"""CoPilot context builder for system prompt generation.

This module constructs the system prompt sent to the LLM, injecting
the current user's context (active view, project, selected node) so
the CoPilot can provide relevant, context-aware responses.

The system prompt includes:
- Role definition (Eisenhower CoPilot assistant)
- Current user context (project, view, selected node)
- Available tools summary
- Security reminders (clearance-aware responses)
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class CopilotContext:
    """Context information about the user's current state.

    This data is sent from the frontend with each chat message and
    used to build the system prompt for the LLM.

    Attributes
    ----------
    view_type : str
        The active workspace view (e.g., "DASHBOARD", "GANTT", "COCKPIT").
    project_id : str, optional
        The currently open project ID.
    project_name : str, optional
        The currently open project name.
    node_id : str, optional
        The currently selected node ID.
    node_name : str, optional
        The currently selected node name.
    dashboard_id : str, optional
        The currently open dashboard ID.
    selected_items : list[str]
        List of selected item IDs (nodes, tasks, etc.).
    user_clearance : str
        The user's security clearance level.
    """
    view_type: str = ""
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    node_id: Optional[str] = None
    node_name: Optional[str] = None
    dashboard_id: Optional[str] = None
    selected_items: List[str] = field(default_factory=list)
    user_clearance: str = "OFFICIAL"


def build_system_prompt(
    context: CopilotContext,
    tool_names: Optional[List[str]] = None,
) -> str:
    """Build the system prompt for the CoPilot LLM.

    Constructs a comprehensive system prompt that includes the role
    definition, current user context, available tools, and security
    reminders.

    Parameters
    ----------
    context : CopilotContext
        The current user context (view, project, node, etc.).
    tool_names : list[str], optional
        List of available tool names for the tools summary.

    Returns
    -------
    str
        The complete system prompt string.
    """
    parts = []

    # Role definition
    parts.append(_build_role_section())

    # Current context
    context_section = _build_context_section(context)
    if context_section:
        parts.append(context_section)

    # Available tools
    if tool_names:
        parts.append(_build_tools_section(tool_names))

    # Security reminders
    parts.append(_build_security_section(context))

    return "\n\n".join(parts)


def _build_role_section() -> str:
    """Build the role definition section of the system prompt."""
    return (
        "You are the Eisenhower CoPilot, an AI assistant embedded in the "
        "Eisenhower Portfolio Manager — an enterprise defence programme "
        "management system. Your role is to help programme managers, team "
        "leads, and schedule analysts by answering questions, running "
        "analysis, and providing insights about project data.\n"
        "\n"
        "You have access to tools that can query the system's database "
        "for real-time data. Use these tools to provide accurate, data-"
        "driven answers rather than speculation.\n"
        "\n"
        "When responding:\n"
        "- Be concise and direct.\n"
        "- Use markdown formatting for readability (bold, lists, tables).\n"
        "- When presenting data, summarize key findings first, then provide "
        "details.\n"
        "- If a tool call fails or returns no data, explain this clearly "
        "to the user.\n"
        "- If the user's question requires parameters you don't have "
        "(e.g., project ID), ask the user for the missing information."
    )


def _build_context_section(context: CopilotContext) -> str:
    """Build the current context section of the system prompt."""
    context_parts = []

    if context.view_type:
        context_parts.append(f"Current view: {context.view_type}")

    if context.project_id:
        project_desc = context.project_name or context.project_id
        context_parts.append(f"Current project: {project_desc} (ID: {context.project_id})")

    if context.node_id:
        node_desc = context.node_name or context.node_id
        context_parts.append(f"Selected node: {node_desc} (ID: {context.node_id})")

    if context.dashboard_id:
        context_parts.append(f"Current dashboard: {context.dashboard_id}")

    if context.selected_items:
        items = ", ".join(context.selected_items[:5])
        if len(context.selected_items) > 5:
            items += f" (+{len(context.selected_items) - 5} more)"
        context_parts.append(f"Selected items: {items}")

    if not context_parts:
        return ""

    return (
        "## Current User Context\n\n"
        "The user is currently working with the following context. "
        "Use this information to pre-fill tool parameters when appropriate, "
        "but always confirm with the user if the context seems incorrect.\n\n"
        + "\n".join(f"- {p}" for p in context_parts)
    )


def _build_tools_section(tool_names: List[str]) -> str:
    """Build the available tools section of the system prompt."""
    return (
        "## Available Tools\n\n"
        "You have access to the following tools. Use them to answer the "
        "user's questions with real data:\n\n"
        + "\n".join(f"- `{name}`" for name in tool_names)
        + "\n\n"
        "When you need data, call the appropriate tool. You can call "
        "multiple tools in sequence if needed to build a complete answer."
    )


def _build_security_section(context: CopilotContext) -> str:
    """Build the security reminders section of the system prompt."""
    return (
        "## Security Guidelines\n\n"
        "- You operate under the user's security clearance level: "
        f"{context.user_clearance}.\n"
        "- Never disclose information that exceeds the user's clearance.\n"
        "- If a tool returns a clearance error, inform the user that they "
        "lack the required clearance for that data.\n"
        "- Do not attempt to bypass security controls.\n"
        "- When discussing classified projects, be mindful of the context "
        "and avoid unnecessary repetition of sensitive identifiers."
    )


def build_context_from_request(
    request_data: Dict[str, Any],
    user_clearance: str = "OFFICIAL",
) -> CopilotContext:
    """Build a CopilotContext from the frontend request data.

    The frontend sends context information with each chat message.
    This function extracts and normalizes that data into a CopilotContext.

    Parameters
    ----------
    request_data : dict
        The request body from the frontend, containing a 'context' field.
    user_clearance : str
        The user's clearance level from the JWT token.

    Returns
    -------
    CopilotContext
        The normalized context object.
    """
    ctx = request_data.get("context", {})
    return CopilotContext(
        view_type=ctx.get("view_type", ""),
        project_id=ctx.get("project_id"),
        project_name=ctx.get("project_name"),
        node_id=ctx.get("node_id"),
        node_name=ctx.get("node_name"),
        dashboard_id=ctx.get("dashboard_id"),
        selected_items=ctx.get("selected_items", []),
        user_clearance=user_clearance,
    )
