"""Asynchronous agent event bus for schedule-triggered webhooks and SSE streams.

This module provides a pub/sub dispatcher that allows registered external
agents to receive critical schedule triggers in real time.  Three event
types are supported:

- **CRITICAL_STOPPAGE_RAISED** — Dispatched when critical path tasks
  (total float ≤ 0) incur a stoppage.

- **LABOR_PROGRESS_DIVERGENCE_DETECTED** — Dispatched when timesheets
  exceed planned burn without corresponding physical progress.

- **DIODE_INGEST_STAGED** — Dispatched when a new ``.merklepack`` or
  schedule file arrives via the diode ingest pipeline.

Delivery Channels
-----------------

1. **Webhook POST callbacks** — Each subscriber registers one or more
   HTTP URLs.  On dispatch, the bus fires ``POST`` requests concurrently
   with the event payload as JSON.

2. **SSE (Server-Sent Events) streams** — Clients connect to
   ``/api/v1/agents/event-stream`` and receive a continuous stream of
   newline-delimited event messages.  The bus pushes to all active SSE
   connections in-memory.

Thread Safety
~~~~~~~~~~~~~

All internal state is protected by an ``asyncio.Lock``.  The bus is
safe to use from multiple FastAPI background tasks concurrently.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set

import httpx

logger = logging.getLogger(__name__)


# ============================================================================
# Event Types
# ============================================================================

class AgentEventType(str, Enum):
    """Critical schedule trigger event types."""
    CRITICAL_STOPPAGE_RAISED = "CRITICAL_STOPPAGE_RAISED"
    """Critical path task (TF ≤ 0) has incurred a stoppage."""

    LABOR_PROGRESS_DIVERGENCE_DETECTED = "LABOR_PROGRESS_DIVERGENCE_DETECTED"
    """Timesheets exceed planned burn without physical progress."""

    DIODE_INGEST_STAGED = "DIODE_INGEST_STAGED"
    """A new .merklepack or schedule file arrived via diode."""


# ============================================================================
# Event Payload
# ============================================================================

@dataclass
class AgentEvent:
    """A single event dispatched by the agent event bus.

    Attributes
    ----------
    event_id : str
        Unique identifier for this event instance.
    event_type : AgentEventType
        The type of schedule trigger.
    payload : dict
        Arbitrary JSON-serializable context data.
    timestamp : datetime
        UTC timestamp when the event was created.
    source : str
        Human-readable origin (e.g., 'cpm_engine', 'timesheet_daemon').
    """
    event_type: AgentEventType
    payload: Dict[str, Any]
    source: str = ""
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the event to a plain dictionary."""
        return {
            "event_id": self.event_id,
            "event_type": self.event_type.value,
            "payload": self.payload,
            "source": self.source,
            "timestamp": self.timestamp.isoformat(),
        }

    def to_sse(self) -> str:
        """Format the event as an SSE message string.

        Returns
        -------
        str
            Newline-delimited SSE fields ending with a blank line.
        """
        import json
        data = json.dumps(self.to_dict())
        lines = [
            f"id: {self.event_id}",
            f"event: {self.event_type.value}",
            f"data: {data}",
            "",
            "",
        ]
        return "\n".join(lines)


# ============================================================================
# Subscriber
# ============================================================================

@dataclass
class WebhookSubscriber:
    """A webhook-based subscriber that receives POST callbacks.

    Attributes
    ----------
    subscriber_id : str
        Stable identifier for this subscriber.
    urls : list[str]
        HTTP endpoints to POST event payloads to.
    event_types : set[AgentEventType]
        Filter — only receive these event types (empty = all).
    secret : str
        Optional HMAC secret for payload signing.
    """
    subscriber_id: str
    urls: List[str]
    event_types: Set[AgentEventType] = field(default_factory=set)
    secret: str = ""


# ============================================================================
# SSE Connection Manager
# ============================================================================

class SSEConnectionManager:
    """Manages active SSE client connections.

    Each connection is an ``asyncio.Queue`` that receives formatted SSE
    strings.  When a client disconnects, its queue is removed.
    """

    def __init__(self) -> None:
        self._connections: Dict[str, asyncio.Queue] = {}
        self._lock = asyncio.Lock()

    async def add(self, connection_id: str) -> asyncio.Queue:
        """Register a new SSE connection and return its queue."""
        async with self._lock:
            queue: asyncio.Queue = asyncio.Queue(maxsize=256)
            self._connections[connection_id] = queue
            return queue

    async def remove(self, connection_id: str) -> None:
        """Remove a disconnected SSE connection."""
        async with self._lock:
            self._connections.pop(connection_id, None)

    async def broadcast(self, sse_message: str) -> None:
        """Push an SSE message to all active connections.

        Silently skips full queues to avoid blocking the dispatch loop.
        """
        async with self._lock:
            queues = list(self._connections.values())
        for queue in queues:
            try:
                queue.put_nowait(sse_message)
            except asyncio.QueueFull:
                logger.warning("SSE queue full — dropping event")

    @property
    def connection_count(self) -> int:
        return len(self._connections)


# ============================================================================
# Agent EventBus
# ============================================================================

class AgentEventBus:
    """Asynchronous pub/sub dispatcher for agent schedule events.

    This is the central event hub.  External agents register as webhook
    subscribers, and SSE clients connect through the managed connection
    pool.  When ``dispatch()`` is called, all matching subscribers and
    SSE connections receive the event concurrently.

    Usage
    -----
    >>> bus = AgentEventBus()
    >>> bus.add_webhook_subscriber("my-agent", ["https://example.com/hook"])
    >>> await bus.dispatch(AgentEventType.CRITICAL_STOPPAGE_RAISED,
    ...                    {"node_id": "…"}, source="cpm_engine")
    """

    def __init__(self) -> None:
        self._webhooks: Dict[str, WebhookSubscriber] = {}
        self._sse_manager = SSEConnectionManager()
        self._lock = asyncio.Lock()
        self._http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(10.0),
            limits=httpx.Limits(max_connections=50),
        )

    # ------------------------------------------------------------------
    # Webhook subscriber management
    # ------------------------------------------------------------------

    async def add_webhook_subscriber(
        self,
        subscriber_id: str,
        urls: List[str],
        event_types: Optional[Set[AgentEventType]] = None,
        secret: str = "",
    ) -> None:
        """Register a new webhook subscriber.

        Parameters
        ----------
        subscriber_id : str
            Stable identifier for this subscriber.
        urls : list[str]
            HTTP endpoints to POST to.
        event_types : set[AgentEventType] or None
            Filter — only receive these types.  ``None`` means all.
        secret : str
            Optional HMAC secret.
        """
        async with self._lock:
            subscriber = WebhookSubscriber(
                subscriber_id=subscriber_id,
                urls=urls,
                event_types=event_types or set(),
                secret=secret,
            )
            self._webhooks[subscriber_id] = subscriber

    async def remove_webhook_subscriber(self, subscriber_id: str) -> None:
        """Unregister a webhook subscriber."""
        async with self._lock:
            self._webhooks.pop(subscriber_id, None)

    async def list_subscribers(self) -> List[Dict[str, Any]]:
        """Return a summary of all registered webhook subscribers."""
        async with self._lock:
            subscribers = list(self._webhooks.values())
        return [
            {
                "subscriber_id": sub.subscriber_id,
                "urls": sub.urls,
                "event_types": [et.value for et in sub.event_types],
            }
            for sub in subscribers
        ]

    # ------------------------------------------------------------------
    # SSE connection management
    # ------------------------------------------------------------------

    @property
    def sse_manager(self) -> SSEConnectionManager:
        """Access the underlying SSE connection manager."""
        return self._sse_manager

    # ------------------------------------------------------------------
    # Event dispatch
    # ------------------------------------------------------------------

    async def dispatch(
        self,
        event_type: AgentEventType,
        payload: Dict[str, Any],
        source: str = "",
    ) -> AgentEvent:
        """Dispatch an event to all matching subscribers and SSE clients.

        Parameters
        ----------
        event_type : AgentEventType
            The type of schedule trigger.
        payload : dict
            Arbitrary JSON-serializable context data.
        source : str
            Human-readable origin component.

        Returns
        -------
        AgentEvent
            The created event object.
        """
        event = AgentEvent(
            event_type=event_type,
            payload=payload,
            source=source,
        )

        # 1. Webhook POST callbacks
        webhook_tasks = []
        async with self._lock:
            subscribers = list(self._webhooks.values())

        for subscriber in subscribers:
            # Check event type filter
            if subscriber.event_types and event_type not in subscriber.event_types:
                continue
            for url in subscriber.urls:
                webhook_tasks.append(
                    self._post_webhook(url, event, subscriber.secret)
                )

        # 2. SSE broadcast
        sse_message = event.to_sse()
        await self._sse_manager.broadcast(sse_message)

        # Fire webhooks concurrently
        if webhook_tasks:
            results = await asyncio.gather(*webhook_tasks, return_exceptions=True)
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    logger.error("Webhook dispatch failed: %s", result)

        logger.info(
            "Dispatched event %s (%s) to %d webhooks and %d SSE connections",
            event.event_id,
            event_type.value,
            len(webhook_tasks),
            self._sse_manager.connection_count,
        )

        return event

    async def _post_webhook(
        self, url: str, event: AgentEvent, secret: str = ""
    ) -> httpx.Response:
        """Send a single webhook POST callback."""
        headers = {"Content-Type": "application/json"}
        if secret:
            import hmac
            import hashlib
            import json
            message = json.dumps(event.to_dict(), sort_keys=True)
            signature = hmac.new(
                secret.encode("utf-8"),
                message.encode("utf-8"),
                hashlib.sha256,
            ).hexdigest()
            headers["X-Event-Signature"] = signature

        try:
            response = await self._http_client.post(
                url,
                json=event.to_dict(),
                headers=headers,
            )
            response.raise_for_status()
            return response
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Webhook HTTP error %s for %s: %s",
                exc.response.status_code,
                url,
                exc.response.text,
            )
            raise
        except Exception as exc:
            logger.error("Webhook delivery failed for %s: %s", url, exc)
            raise

    async def close(self) -> None:
        """Clean up the HTTP client."""
        await self._http_client.aclose()


# ============================================================================
# Module-level singleton
# ============================================================================

_bus_instance: Optional[AgentEventBus] = None


def get_event_bus() -> AgentEventBus:
    """Return the global agent event bus singleton.

    Creates the instance lazily on first call.

    Returns
    -------
    AgentEventBus
        The shared event bus instance.
    """
    global _bus_instance
    if _bus_instance is None:
        _bus_instance = AgentEventBus()
    return _bus_instance


def reset_event_bus() -> None:
    """Reset the global event bus singleton (primarily for testing)."""
    global _bus_instance
    _bus_instance = None
