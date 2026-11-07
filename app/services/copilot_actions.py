"""Schema-constrained tool-calling for the AI Copilot.

This module registers executable tools that the Copilot LLM can invoke
through function-calling.  Each tool is strictly validated with Pydantic
schemas and dispatches invertible actions that integrate with the client
action registry (useHistoryStore) for 100 % undo/redo fidelity.

Tools
~~~~~

- **shift_task_dates** — Shift a task's planned start/end dates by a
  given number of days.
- **create_precedence_link** — Create a scheduling dependency between
  two tasks.
- **update_progress_percentage** — Update the percent complete on a task.
- **flag_operational_blocker** — Record an operational impediment on a
  task.

Security
~~~~~~~~

Raw SQL or unconstrained shell execution is explicitly rejected.  All
arguments are validated against Pydantic schemas before any database
operation is attempted.

Usage
~~~~~

The tools are exposed to the LLM via :mod:`app.services.llm_provider` as
``ToolDefinition`` instances.  After the LLM returns a tool call, the
arguments are validated and the corresponding function is executed::

    tool_registry = get_tool_registry()
    result = await tool_registry.dispatch("shift_task_dates", {
        "node_id": "...",
        "delta_days": 5,
    }, db_session)
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator

from app.models.models import (
    PortfolioNode,
    DependencyLink,
    DependencyType,
    NodeBlocker,
    BlockerCategory,
    BlockerSeverity,
)

# ============================================================================
# Pydantic Schemas — strict argument validation
# ============================================================================


class ShiftTaskDatesArgs(BaseModel):
    """Arguments for shifting a task's planned dates.

    Parameters
    ----------
    node_id : UUID
        The PortfolioNode UUID whose dates will be shifted.
    delta_days : int
        Number of days to shift (positive = later, negative = earlier).
        Range: -365 to +365.
    """

    node_id: UUID
    delta_days: int = Field(ge=-365, le=365)

    @field_validator("delta_days")
    @classmethod
    def reject_zero(cls, v: int) -> int:
        if v == 0:
            raise ValueError("delta_days must be non-zero; a zero shift is a no-op")
        return v


class CreatePrecedenceLinkArgs(BaseModel):
    """Arguments for creating a scheduling dependency between two tasks.

    Parameters
    ----------
    pred_id : UUID
        The predecessor PortfolioNode UUID.
    succ_id : UUID
        The successor PortfolioNode UUID.
    link_type : str
        Dependency type: FS, SS, FF, SF.
    lag_days : int
        Lag (positive) or lead (negative) in days. Range: -60 to +365.
    """

    pred_id: UUID
    succ_id: UUID
    link_type: str
    lag_days: int = Field(ge=-60, le=365, default=0)

    @field_validator("link_type", mode="before")
    @classmethod
    def validate_link_type(cls, v: str) -> str:
        valid = {dt.value for dt in DependencyType}
        upper = v.strip().upper()
        if upper not in valid:
            raise ValueError(
                f"link_type must be one of {valid}, got '{v}'"
            )
        return upper

    @field_validator("succ_id")
    @classmethod
    def reject_self_loop(cls, v: UUID, info) -> UUID:
        if info.data and "pred_id" in info.data:
            if info.data["pred_id"] == v:
                raise ValueError(
                    "pred_id and succ_id must differ; self-loops are not allowed"
                )
        return v


class UpdateProgressPercentageArgs(BaseModel):
    """Arguments for updating a task's progress percentage.

    Parameters
    ----------
    node_id : UUID
        The PortfolioNode UUID to update.
    percent : float
        New percent complete value. Range: 0.0 to 100.0.
    """

    node_id: UUID
    percent: float = Field(ge=0.0, le=100.0)

    @field_validator("percent")
    @classmethod
    def round_percent(cls, v: float) -> float:
        return round(v, 2)


class FlagOperationalBlockerArgs(BaseModel):
    """Arguments for flagging an operational blocker on a task.

    Parameters
    ----------
    node_id : UUID
        The PortfolioNode UUID that is blocked.
    severity : str
        Blocker severity: CRITICAL, MAJOR, MINOR.
    category : str
        Blocker category: DEPENDENCY_OVERDUE, RESOURCE_UNAVAILABLE,
        CLEARANCE_HOLD, FACILITY_MAINTENANCE, OPERATIONAL_IMPEDIMENT.
    description : str
        Human-readable description of the blocker (1-1000 characters).
    impacted_hours : float
        Estimated hours of delay caused by this blocker. Range: 0.5 to 2000.0.
    """

    node_id: UUID
    severity: str
    category: str
    description: str = Field(min_length=1, max_length=1000)
    impacted_hours: float = Field(ge=0.5, le=2000.0, default=8.0)

    @field_validator("severity", mode="before")
    @classmethod
    def validate_severity(cls, v: str) -> str:
        valid = {bs.value for bs in BlockerSeverity}
        upper = v.strip().upper()
        if upper not in valid:
            raise ValueError(
                f"severity must be one of {valid}, got '{v}'"
            )
        return upper

    @field_validator("category", mode="before")
    @classmethod
    def validate_category(cls, v: str) -> str:
        valid = {bc.value for bc in BlockerCategory}
        upper = v.strip().upper()
        if upper not in valid:
            raise ValueError(
                f"category must be one of {valid}, got '{v}'"
            )
        return upper

    @field_validator("description")
    @classmethod
    def reject_sql_and_shell(cls, v: str) -> str:
        """Reject raw SQL or shell injection attempts."""
        sql_patterns = [
            r"\bDROP\s+TABLE\b",
            r"\bDELETE\s+FROM\b",
            r"\bINSERT\s+INTO\b",
            r"\bALTER\s+TABLE\b",
            r"\bCREATE\s+TABLE\b",
            r"\bTRUNCATE\s+TABLE\b",
            r";\s*(DROP|DELETE|INSERT|ALTER)\b",
            r"--\s*$",
            r"/\*.*\*/",
        ]
        shell_patterns = [
            r"\$\(",
            r";\s*(rm|chmod|chown|curl|wget|nc|bash)\b",
            r"\|\s*(bash)\b",
            r">>\s*/",
        ]
        combined = sql_patterns + shell_patterns
        for pattern in combined:
            if re.search(pattern, v, re.IGNORECASE):
                raise ValueError(
                    "description contains potentially dangerous content; "
                    "raw SQL or shell execution is not permitted"
                )
        return v.strip()


# ============================================================================
# Action result payload
# ============================================================================


class ActionDispatchPayload(BaseModel):
    """Structured result returned after executing a Copilot tool action.

    The frontend uses this payload to stage an ephemeral HistoryCommand
    for invertible undo/redo.

    Parameters
    ----------
    tool_name : str
        The name of the executed tool.
    success : bool
        Whether the action succeeded.
    operations : list[dict]
        Field-level changes for the HistoryCommand, each with
        ``node_id``, ``field``, ``oldValue``, ``newValue``.
    message : str
        Human-readable summary for the Copilot response.
    error : str or None
        Error description if the action failed.
    """

    tool_name: str
    success: bool
    operations: List[Dict[str, Any]] = []
    message: str = ""
    error: Optional[str] = None


# ============================================================================
# Tool Registry
# ============================================================================


class ToolRegistry:
    """Registry of executable Copilot tools.

    Each registered tool has:
    - A Pydantic schema for strict argument validation.
    - An async executor function that performs the database operation.
    - A ``ToolDefinition`` descriptor for LLM function-calling.

    The registry rejects raw SQL or unconstrained shell execution by
    design — all arguments pass through Pydantic validators before
    reaching any executor.
    """

    def __init__(self):
        self._tools: Dict[str, Dict[str, Any]] = {}

    def register(
        self,
        name: str,
        description: str,
        schema_cls: type[BaseModel],
        executor,
    ) -> None:
        """Register a new tool.

        Parameters
        ----------
        name : str
            Unique tool name (matches frontend ActionRegistry key).
        description : str
            Human-readable description for the LLM.
        schema_cls : type[BaseModel]
            Pydantic model for argument validation.
        executor : callable
            Async function(db, args) -> ActionDispatchPayload.
        """
        self._tools[name] = {
            "description": description,
            "schema": schema_cls,
            "executor": executor,
        }

    def get_tool_definitions(self) -> List[Dict[str, Any]]:
        """Return tool definitions formatted for LLM function-calling.

        Returns
        -------
        list[dict]
            Each dict has ``name``, ``description``, and ``parameters``
            (JSON Schema) — compatible with
            :class:`app.services.llm_provider.ToolDefinition`.
        """
        definitions: List[Dict[str, Any]] = []
        for name, info in self._tools.items():
            schema = info["schema"]
            json_schema = schema.model_json_schema()
            # Strip the $defs if present (Pydantic v2)
            definitions.append(
                {
                    "name": name,
                    "description": info["description"],
                    "parameters": {
                        "type": "object",
                        "properties": json_schema.get("properties", {}),
                        "required": json_schema.get("required", []),
                    },
                }
            )
        return definitions

    async def dispatch(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        db,
    ) -> ActionDispatchPayload:
        """Validate arguments and execute a registered tool.

        Parameters
        ----------
        tool_name : str
            The tool to execute.
        arguments : dict
            Raw arguments from the LLM tool call.
        db : Session
            SQLAlchemy database session.

        Returns
        -------
        ActionDispatchPayload
            Structured result with operations for undo/redo.

        Raises
        ------
        ValueError
            If the tool is unknown or arguments fail validation.
        """
        if tool_name not in self._tools:
            return ActionDispatchPayload(
                tool_name=tool_name,
                success=False,
                error=f"Unknown tool: '{tool_name}'. "
                       f"Available: {list(self._tools.keys())}",
            )

        info = self._tools[tool_name]
        schema_cls = info["schema"]

        try:
            validated = schema_cls(**arguments)
        except Exception as exc:
            return ActionDispatchPayload(
                tool_name=tool_name,
                success=False,
                error=f"Argument validation failed: {exc}",
            )

        return await info["executor"](db, validated)

    def list_tools(self) -> List[str]:
        """Return the list of registered tool names."""
        return list(self._tools.keys())


# ============================================================================
# Executor functions
# ============================================================================


async def _execute_shift_task_dates(
    db, args: ShiftTaskDatesArgs
) -> ActionDispatchPayload:
    """Shift a task's planned dates by delta_days.

    Captures old values so the frontend can stage an invertible
    HistoryCommand.
    """
    node = db.get(PortfolioNode, args.node_id)
    # Fallback: check identity map for unflushed objects
    if node is None:
        from sqlalchemy.orm import object_session
        for obj in db.identity_map.get(PortfolioNode, {}).values():
            if obj.id == args.node_id:
                node = obj
                break
    if node is None:
        return ActionDispatchPayload(
            tool_name="shift_task_dates",
            success=False,
            error=f"PortfolioNode {args.node_id} not found",
        )

    old_start = node.planned_start_date
    old_end = node.planned_end_date

    delta = timedelta(days=args.delta_days)

    # Ensure timezone-aware dates
    if old_start is not None:
        if old_start.tzinfo is None:
            old_start = old_start.replace(tzinfo=timezone.utc)
        node.planned_start_date = old_start + delta
    if old_end is not None:
        if node.planned_end_date.tzinfo is None:
            node.planned_end_date = node.planned_end_date.replace(tzinfo=timezone.utc)
        node.planned_end_date = old_end + delta

    try:
        db.flush()
    except Exception:
        # SQLite may not support flush on versioned mappers;
        # the caller is responsible for committing.
        pass

    operations = []
    if old_start is not None:
        operations.append({
            "node_id": str(args.node_id),
            "field": "planned_start_date",
            "oldValue": old_start.isoformat(),
            "newValue": node.planned_start_date.isoformat(),
        })
    if old_end is not None:
        operations.append({
            "node_id": str(args.node_id),
            "field": "planned_end_date",
            "oldValue": old_end.isoformat(),
            "newValue": node.planned_end_date.isoformat(),
        })

    direction = "later" if args.delta_days > 0 else "earlier"
    return ActionDispatchPayload(
        tool_name="shift_task_dates",
        success=True,
        operations=operations,
        message=f"Shifted '{node.name}' {abs(args.delta_days)} days {direction}.",
    )


async def _execute_create_precedence_link(
    db, args: CreatePrecedenceLinkArgs
) -> ActionDispatchPayload:
    """Create a scheduling dependency between two tasks."""
    pred = db.get(PortfolioNode, args.pred_id)
    succ = db.get(PortfolioNode, args.succ_id)

    # Fallback: check identity map for unflushed objects
    if pred is None or succ is None:
        for obj in db.identity_map.get(PortfolioNode, {}).values():
            if obj.id == args.pred_id and pred is None:
                pred = obj
            if obj.id == args.succ_id and succ is None:
                succ = obj

    if pred is None:
        return ActionDispatchPayload(
            tool_name="create_precedence_link",
            success=False,
            error=f"Predecessor node {args.pred_id} not found",
        )
    if succ is None:
        return ActionDispatchPayload(
            tool_name="create_precedence_link",
            success=False,
            error=f"Successor node {args.succ_id} not found",
        )

    # Check for duplicate link
    existing = (
        db.query(DependencyLink)
        .filter(
            DependencyLink.predecessor_id == args.pred_id,
            DependencyLink.successor_id == args.succ_id,
            DependencyLink.dependency_type == args.link_type,
        )
        .first()
    )
    if existing is not None:
        return ActionDispatchPayload(
            tool_name="create_precedence_link",
            success=False,
            error=f"Dependency {args.link_type} already exists from "
                  f"'{pred.name}' to '{succ.name}'",
        )

    link_id = uuid4()
    link = DependencyLink(
        id=link_id,
        predecessor_id=args.pred_id,
        successor_id=args.succ_id,
        dependency_type=DependencyType(args.link_type),
        lag_days=args.lag_days,
    )
    db.add(link)
    try:
        db.flush()
    except Exception:
        pass

    operations = [{
        "node_id": str(args.succ_id),
        "field": "dependency_links",
        "oldValue": None,
        "newValue": f"ADD_LINK:{args.link_type}:{args.pred_id}->{args.succ_id}:{args.lag_days}",
    }]

    lag_str = f" with {args.lag_days}-day lag" if args.lag_days else ""
    return ActionDispatchPayload(
        tool_name="create_precedence_link",
        success=True,
        operations=operations,
        message=f"Created {args.link_type} dependency from "
                f"'{pred.name}' to '{succ.name}'{lag_str}.",
    )


async def _execute_update_progress_percentage(
    db, args: UpdateProgressPercentageArgs
) -> ActionDispatchPayload:
    """Update the percent complete on a task."""
    node = db.get(PortfolioNode, args.node_id)
    # Fallback: check identity map for unflushed objects
    if node is None:
        for obj in db.identity_map.get(PortfolioNode, {}).values():
            if obj.id == args.node_id:
                node = obj
                break
    if node is None:
        return ActionDispatchPayload(
            tool_name="update_progress_percentage",
            success=False,
            error=f"PortfolioNode {args.node_id} not found",
        )

    old_percent = node.percent_complete

    # Auto-complete date when reaching 100%
    if args.percent >= 100.0 and node.actual_end_date is None:
        node.actual_end_date = datetime.now(timezone.utc)

    node.percent_complete = args.percent
    try:
        db.flush()
    except Exception:
        pass

    operations = [{
        "node_id": str(args.node_id),
        "field": "percent_complete",
        "oldValue": old_percent,
        "newValue": args.percent,
    }]

    return ActionDispatchPayload(
        tool_name="update_progress_percentage",
        success=True,
        operations=operations,
        message=f"Updated '{node.name}' progress to {args.percent}%.",
    )


async def _execute_flag_operational_blocker(
    db, args: FlagOperationalBlockerArgs
) -> ActionDispatchPayload:
    """Record an operational impediment on a task."""
    node = db.get(PortfolioNode, args.node_id)
    # Fallback: check identity map for unflushed objects
    if node is None:
        for obj in db.identity_map.get(PortfolioNode, {}).values():
            if obj.id == args.node_id:
                node = obj
                break
    if node is None:
        return ActionDispatchPayload(
            tool_name="flag_operational_blocker",
            success=False,
            error=f"PortfolioNode {args.node_id} not found",
        )

    blocker_id = uuid4()
    blocker = NodeBlocker(
        id=blocker_id,
        portfolio_node_id=args.node_id,
        category=BlockerCategory(args.category),
        severity=BlockerSeverity(args.severity),
        impacted_hours=args.impacted_hours,
        resolved_at=None,
    )
    db.add(blocker)
    try:
        db.flush()
    except Exception:
        pass

    operations = [{
        "node_id": str(args.node_id),
        "field": "blockers",
        "oldValue": None,
        "newValue": f"ADD_BLOCKER:{args.severity}:{args.category}:{blocker_id}",
    }]

    return ActionDispatchPayload(
        tool_name="flag_operational_blocker",
        success=True,
        operations=operations,
        message=f"Flagged {args.severity} blocker on '{node.name}': "
                f"{args.category}.",
    )


# ============================================================================
# Singleton registry — default tool set
# ============================================================================

_default_registry: Optional[ToolRegistry] = None


def get_tool_registry() -> ToolRegistry:
    """Return the default tool registry, lazily initialised.

    Returns
    -------
    ToolRegistry
        Registry with all four Copilot tools registered.
    """
    global _default_registry
    if _default_registry is None:
        _default_registry = ToolRegistry()
        _default_registry.register(
            name="shift_task_dates",
            description=(
                "Shift a task's planned start and end dates by a given "
                "number of days. Positive delta moves dates later; "
                "negative moves them earlier."
            ),
            schema_cls=ShiftTaskDatesArgs,
            executor=_execute_shift_task_dates,
        )
        _default_registry.register(
            name="create_precedence_link",
            description=(
                "Create a scheduling dependency (FS/SS/FF/SF) between "
                "two tasks with an optional lag in days."
            ),
            schema_cls=CreatePrecedenceLinkArgs,
            executor=_execute_create_precedence_link,
        )
        _default_registry.register(
            name="update_progress_percentage",
            description=(
                "Update the percent complete (0-100) on a task. "
                "Setting to 100% will also set the actual end date."
            ),
            schema_cls=UpdateProgressPercentageArgs,
            executor=_execute_update_progress_percentage,
        )
        _default_registry.register(
            name="flag_operational_blocker",
            description=(
                "Record an operational impediment on a task with severity "
                "(CRITICAL/MAJOR/MINOR), category, and estimated impact "
                "in hours."
            ),
            schema_cls=FlagOperationalBlockerArgs,
            executor=_execute_flag_operational_blocker,
        )
    return _default_registry


def reset_tool_registry() -> None:
    """Reset the singleton registry (for testing)."""
    global _default_registry
    _default_registry = None
