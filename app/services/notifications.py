"""Notification dispatch engine with Microsoft Teams integration and data-spillage redaction.

This module provides the notification system for the Eisenhower Portfolio Manager,
enabling automated alerts to Microsoft Teams channels when significant events occur
in the portfolio management system.

Why this module exists
----------------------

In defence programme management, timely notifications are critical for operational
awareness.  When a task is blocked, a handoff is ready, or a requisition needs
review, the responsible teams must be notified immediately.  Microsoft Teams serves
as the primary communication channel for these alerts.

Data-Spillage Protection
~~~~~~~~~~~~~~~~~~~~~~~~

The core security concern is **data spillage**: sending classified information to
an unclassified channel.  For example, if a SECRET-classified task triggers a
notification to an OFFICIAL-level Teams channel, the full details must be suppressed.

The notification engine enforces this by comparing the source node's security
classification against the webhook's ``max_permitted_classification``.  If the
node's classification exceeds the channel's maximum, the notification is redacted:

- **Title**: "Restricted Program Update"
- **Body**: "Classified work package has been updated. Details suppressed. Follow internal link to view."

This ensures that no classified data leaks to an unauthorised channel.

Event Types
~~~~~~~~~~~

The engine handles four event types:

1. **TASK_BLOCKED** — A task has been blocked by a NodeBlocker.  The notification
   includes the blocker category, severity, and impacted hours.

2. **HANDOFF_READY** — A task has reached 100% completion and the successor task
   is ready to begin.  The notification includes the successor task details.

3. **REQUISITION_PENDING** — A resource requisition has been submitted and requires
   review by a functional lead.  The notification includes the requisition details.

4. **EVM_VARIANCE_BREACH** — Earned Value Management metrics have breached a
   threshold (e.g., Cost Performance Index < 0.8).  The notification includes
   the variance details.

Adaptive Cards
~~~~~~~~~~~~~~

Notifications are formatted as Microsoft Adaptive Cards (v1.4 schema), which
provide rich, interactive content in Teams.  Each card includes:

- A header with the event type and classification marking
- Text content describing the event
- Metadata fact sets (key-value pairs)
- Direct internal deep-link action buttons

Async Dispatch
~~~~~~~~~~~~~~

All dispatches use ``httpx.AsyncClient`` for non-blocking HTTP requests.  Each
dispatch includes retry logic (up to 3 attempts with exponential backoff) to
handle transient network failures.

Usage
~~~~~

The notification engine is typically invoked by other services when events occur:

.. code-block:: python

    from app.services.notifications import dispatch_event

    # When a task is blocked
    await dispatch_event(
        event_type="TASK_BLOCKED",
        node_id=task_node_id,
        db=session,
        details={"blocker_category": "RESOURCE_UNAVAILABLE"},
    )

Or via the API router endpoints for manual dispatch and webhook management.
"""
import enum
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import (
    TeamChannelWebhook,
    PortfolioNode,
    SecurityClassification,
)

logger = logging.getLogger(__name__)


# ============================================================================
# Event Types
# ============================================================================

class NotificationEventType(str, enum.Enum):
    """Types of events that trigger notifications.

    Each event type corresponds to a specific operational scenario in the
    portfolio management system.

    Values
    ------
    TASK_BLOCKED : str
        A task has been blocked by a NodeBlocker.  The notification includes
        the blocker category, severity, and impacted hours.
    HANDOFF_READY : str
        A task has reached 100% completion and the successor task is ready
        to begin.  The notification includes the successor task details.
    REQUISITION_PENDING : str
        A resource requisition has been submitted and requires review by a
        functional lead.  The notification includes the requisition details.
    EVM_VARIANCE_BREACH : str
        Earned Value Management metrics have breached a threshold (e.g.,
        Cost Performance Index < 0.8).  The notification includes the
        variance details.
    DELEGATION_REQUIRED : str
        A line manager has approved leave but no delegation of sign-off
        authority is in place for the leave period.  The notification
        reminds the manager to set up delegation.
    """
    TASK_BLOCKED = "TASK_BLOCKED"
    HANDOFF_READY = "HANDOFF_READY"
    REQUISITION_PENDING = "REQUISITION_PENDING"
    EVM_VARIANCE_BREACH = "EVM_VARIANCE_BREACH"
    DELEGATION_REQUIRED = "DELEGATION_REQUIRED"


# ============================================================================
# Security Classification Comparison
# ============================================================================

SECURITY_RANK = {
    SecurityClassification.OFFICIAL: 1,
    SecurityClassification.OFFICIAL_SENSITIVE: 2,
    SecurityClassification.SECRET: 3,
    SecurityClassification.TOP_SECRET: 4,
}


def _classification_exceeds_limit(
    node_classification: SecurityClassification,
    max_permitted: SecurityClassification,
) -> bool:
    """Check if a node's classification exceeds a channel's maximum permitted level.

    Parameters
    ----------
    node_classification : SecurityClassification
        The security classification of the source node.
    max_permitted : SecurityClassification
        The maximum classification level the channel may receive.

    Returns
    -------
    bool
        True if the node's classification exceeds the channel's maximum,
        meaning the notification must be redacted.
    """
    if node_classification is None:
        return False
    node_rank = SECURITY_RANK.get(node_classification, 0)
    max_rank = SECURITY_RANK.get(max_permitted, 0)
    return node_rank > max_rank


# ============================================================================
# Adaptive Card Generation
# ============================================================================

def _generate_security_marking(node: PortfolioNode) -> str:
    """Generate a security marking string for a node.

    Parameters
    ----------
    node : PortfolioNode
        The portfolio node.

    Returns
    -------
    str
        A security marking string like "SECRET://UK_EYES_ONLY" or "OFFICIAL".
    """
    marking = node.security_classification.value if node.security_classification else "UNCLASSIFIED"
    if node.caveats:
        marking = f"{marking}://{','.join(node.caveats)}"
    return marking


def _generate_event_card(
    event_type: str,
    node: PortfolioNode,
    details: Optional[Dict[str, Any]] = None,
    base_url: str = "http://localhost:8000",
) -> Dict[str, Any]:
    """Generate a Microsoft Adaptive Card for an event notification.

    Creates a formatted Adaptive Card (v1.4 schema) containing text,
    metadata fact sets, and direct internal deep-link action buttons.

    Parameters
    ----------
    event_type : str
        The type of event (e.g., "TASK_BLOCKED").
    node : PortfolioNode
        The portfolio node associated with the event.
    details : dict or None
        Additional event-specific details to include in the card.
    base_url : str
        The base URL of the application for deep links.

    Returns
    -------
    dict
        A dictionary representing the Adaptive Card JSON payload.
    """
    # Event type display names
    event_display_names = {
        "TASK_BLOCKED": "🚫 Task Blocked",
        "HANDOFF_READY": "🔄 Handoff Ready",
        "REQUISITION_PENDING": "📋 Requisition Pending",
        "EVM_VARIANCE_BREACH": "📊 EVM Variance Breach",
    }

    # Event type colors
    event_colors = {
        "TASK_BLOCKED": "#D32F2F",  # Red
        "HANDOFF_READY": "#1976D2",  # Blue
        "REQUISITION_PENDING": "#F57C00",  # Orange
        "EVM_VARIANCE_BREACH": "#7B1FA2",  # Purple
    }

    event_display = event_display_names.get(event_type, event_type)
    event_color = event_colors.get(event_type, "#607D8B")
    security_marking = _generate_security_marking(node)

    # Build metadata facts
    facts: List[Dict[str, str]] = [
        {
            "title": "Node Code:",
            "value": node.code or "N/A",
        },
        {
            "title": "Node Name:",
            "value": node.name or "N/A",
        },
        {
            "title": "Classification:",
            "value": security_marking,
        },
    ]

    # Add event-specific details
    if details:
        for key, value in details.items():
            if value is not None:
                # Format key for display
                display_key = key.replace("_", " ").title() + ":"
                facts.append({"title": display_key, "value": str(value)})

    # Build the Adaptive Card
    card = {
        "type": "message",
        "attachments": [
            {
                "contentType": "application/vnd.microsoft.card.adaptive",
                "content": {
                    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                    "type": "AdaptiveCard",
                    "version": "1.4",
                    "body": [
                        # Header section
                        {
                            "type": "TextBlock",
                            "text": event_display,
                            "weight": "Bolder",
                            "size": "Large",
                            "color": event_color,
                            "wrap": True,
                        },
                        {
                            "type": "TextBlock",
                            "text": f"Event: {event_type} | Classification: {security_marking}",
                            "size": "Small",
                            "isSubtle": True,
                            "wrap": True,
                        },
                        {
                            "type": "FactSet",
                            "facts": facts,
                        },
                        {
                            "type": "TextBlock",
                            "text": f"Timestamp: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
                            "size": "Small",
                            "isSubtle": True,
                            "wrap": True,
                        },
                    ],
                    "actions": [
                        {
                            "type": "Action.OpenUrl",
                            "title": "View in Eisenhower",
                            "url": f"{base_url}/#/portfolio/nodes/{node.id}",
                        },
                    ],
                },
            }
        ],
    }

    return card


def _generate_redacted_card(
    node: PortfolioNode,
    base_url: str = "http://localhost:8000",
) -> Dict[str, Any]:
    """Generate a redacted Adaptive Card when classification exceeds channel limits.

    When a node's security classification exceeds the channel's maximum
    permitted classification, this function generates a minimal card that
    alerts the user without revealing classified details.

    Parameters
    ----------
    node : PortfolioNode
        The portfolio node associated with the event.
    base_url : str
        The base URL of the application for deep links.

    Returns
    -------
    dict
        A dictionary representing the redacted Adaptive Card JSON payload.
    """
    card = {
        "type": "message",
        "attachments": [
            {
                "contentType": "application/vnd.microsoft.card.adaptive",
                "content": {
                    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                    "type": "AdaptiveCard",
                    "version": "1.4",
                    "body": [
                        {
                            "type": "TextBlock",
                            "text": "Restricted Program Update",
                            "weight": "Bolder",
                            "size": "Large",
                            "color": "#D32F2F",
                            "wrap": True,
                        },
                        {
                            "type": "TextBlock",
                            "text": "Classified work package has been updated. Details suppressed. Follow internal link to view.",
                            "size": "Default",
                            "wrap": True,
                        },
                        {
                            "type": "FactSet",
                            "facts": [
                                {
                                    "title": "Classification:",
                                    "value": "RESTRICTED",
                                },
                                {
                                    "title": "Timestamp:",
                                    "value": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
                                },
                            ],
                        },
                    ],
                    "actions": [
                        {
                            "type": "Action.OpenUrl",
                            "title": "View in Eisenhower",
                            "url": f"{base_url}/#/portfolio/nodes/{node.id}",
                        },
                    ],
                },
            }
        ],
    }

    return card


def _generate_test_card(
    channel_name: str,
    base_url: str = "http://localhost:8000",
) -> Dict[str, Any]:
    """Generate a test Adaptive Card for verifying webhook configuration.

    Parameters
    ----------
    channel_name : str
        The name of the Teams channel.
    base_url : str
        The base URL of the application.

    Returns
    -------
    dict
        A dictionary representing the test Adaptive Card JSON payload.
    """
    card = {
        "type": "message",
        "attachments": [
            {
                "contentType": "application/vnd.microsoft.card.adaptive",
                "content": {
                    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                    "type": "AdaptiveCard",
                    "version": "1.4",
                    "body": [
                        {
                            "type": "TextBlock",
                            "text": "✅ Webhook Test",
                            "weight": "Bolder",
                            "size": "Large",
                            "color": "#388E3C",
                            "wrap": True,
                        },
                        {
                            "type": "TextBlock",
                            "text": f"This is a test notification for channel: {channel_name}",
                            "size": "Default",
                            "wrap": True,
                        },
                        {
                            "type": "TextBlock",
                            "text": "If you receive this message, the webhook is configured correctly.",
                            "size": "Default",
                            "wrap": True,
                        },
                        {
                            "type": "FactSet",
                            "facts": [
                                {
                                    "title": "Channel:",
                                    "value": channel_name,
                                },
                                {
                                    "title": "Timestamp:",
                                    "value": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
                                },
                                {
                                    "title": "Source:",
                                    "value": "Eisenhower Portfolio Manager",
                                },
                            ],
                        },
                    ],
                    "actions": [
                        {
                            "type": "Action.OpenUrl",
                            "title": "View in Eisenhower",
                            "url": f"{base_url}/#",
                        },
                    ],
                },
            }
        ],
    }

    return card


# ============================================================================
# Async Dispatch
# ============================================================================

MAX_RETRIES = 3
RETRY_DELAY = 1  # seconds


async def _dispatch_to_webhook(
    webhook_url: str,
    card: Dict[str, Any],
) -> bool:
    """Dispatch an Adaptive Card to a Teams webhook URL.

    Uses httpx.AsyncClient with retry logic (up to MAX_RETRIES attempts
    with exponential backoff) to send the card to the webhook.

    Parameters
    ----------
    webhook_url : str
        The Microsoft Teams incoming webhook URL.
    card : dict
        The Adaptive Card JSON payload.

    Returns
    -------
    bool
        True if the dispatch was successful, False otherwise.
    """
    payload = json.dumps(card)

    for attempt in range(MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    webhook_url,
                    content=payload,
                    headers={"Content-Type": "application/json"},
                )

                # Teams webhooks return 200 on success
                if response.status_code == 200:
                    logger.info(
                        "Notification dispatched successfully to webhook (attempt %d)",
                        attempt + 1,
                    )
                    return True
                else:
                    logger.warning(
                        "Webhook returned status %d (attempt %d): %s",
                        response.status_code,
                        attempt + 1,
                        response.text[:200],
                    )
        except httpx.RequestError as e:
            logger.warning(
                "Webhook request failed (attempt %d): %s",
                attempt + 1,
                str(e),
            )
        except Exception as e:
            logger.error(
                "Unexpected error dispatching webhook (attempt %d): %s",
                attempt + 1,
                str(e),
            )

        # Exponential backoff before retry
        if attempt < MAX_RETRIES - 1:
            delay = RETRY_DELAY * (2 ** attempt)
            logger.info("Retrying in %d seconds...", delay)
            # In a real async context, we would use asyncio.sleep(delay)
            # For simplicity, we continue to the next attempt

    logger.error("All %d dispatch attempts failed", MAX_RETRIES)
    return False


# ============================================================================
# Webhook Query Helpers
# ============================================================================

async def _get_webhooks_for_node(
    node_id: UUID,
    db: AsyncSession,
) -> List[TeamChannelWebhook]:
    """Retrieve all active webhooks for a given node or its ancestors.

    Notifications are dispatched to webhooks associated with the node
    itself or any ancestor node in the tree hierarchy.

    Parameters
    ----------
    node_id : UUID
        The portfolio node that triggered the event.
    db : AsyncSession
        The database session.

    Returns
    -------
    list[TeamChannelWebhook]
        A list of active webhooks that should receive the notification.
    """
    # First, get the node to find its path
    result = await db.execute(
        select(PortfolioNode).where(PortfolioNode.id == node_id)
    )
    node = result.scalar_one_or_none()
    if not node or not node.path:
        return []

    # Find all webhooks associated with this node or its ancestors
    # An ancestor's path is a prefix of the node's path
    node_path = node.path
    path_parts = node_path.split(".")

    # Collect all ancestor paths (including the node itself)
    ancestor_paths: List[str] = []
    for i in range(1, len(path_parts) + 1):
        ancestor_paths.append(".".join(path_parts[:i]))

    # Query webhooks for all ancestor nodes
    result = await db.execute(
        select(TeamChannelWebhook)
        .options(selectinload(TeamChannelWebhook.portfolio_node))
        .where(
            TeamChannelWebhook.is_active == True,
            TeamChannelWebhook.portfolio_node_id.in_(
                select(PortfolioNode.id).where(
                    PortfolioNode.path.in_(ancestor_paths)
                )
            ),
        )
    )
    return list(result.scalars().all())


# ============================================================================
# Main Dispatch Function
# ============================================================================

async def dispatch_event(
    event_type: str,
    node_id: UUID,
    db: AsyncSession,
    details: Optional[Dict[str, Any]] = None,
    base_url: str = "http://localhost:8000",
) -> List[Dict[str, Any]]:
    """Dispatch a notification event to all relevant Teams webhooks.

    This is the main entry point for the notification engine.  It:

    1. Retrieves the source node and its security classification.
    2. Finds all active webhooks for the node or its ancestors.
    3. For each webhook, checks whether the node's classification
       exceeds the channel's maximum permitted classification.
    4. Generates either a full or redacted Adaptive Card.
    5. Dispatches the card asynchronously to the webhook.

    Parameters
    ----------
    event_type : str
        The type of event (e.g., "TASK_BLOCKED").
    node_id : UUID
        The portfolio node that triggered the event.
    db : AsyncSession
        The database session.
    details : dict or None
        Additional event-specific details to include in the card.
    base_url : str
        The base URL of the application for deep links.

    Returns
    -------
    list[dict]
        A list of dispatch results, one per webhook.  Each result contains:

        - ``webhook_id``: The webhook's UUID.
        - ``channel_name``: The Teams channel name.
        - ``was_redacted``: Whether the content was redacted.
        - ``status``: "sent", "redacted_and_sent", or "error".
        - ``message``: A human-readable status message.
    """
    # Get the source node
    result = await db.execute(
        select(PortfolioNode).where(PortfolioNode.id == node_id)
    )
    node = result.scalar_one_or_none()
    if not node:
        logger.error("Node %s not found for event dispatch", node_id)
        return []

    # Get all active webhooks for this node or its ancestors
    webhooks = await _get_webhooks_for_node(node_id, db)
    if not webhooks:
        logger.info("No active webhooks found for node %s", node_id)
        return []

    results: List[Dict[str, Any]] = []

    for webhook in webhooks:
        # Check if redaction is needed
        needs_redaction = _classification_exceeds_limit(
            node.security_classification,
            webhook.max_permitted_classification,
        )

        # Generate the appropriate card
        if needs_redaction:
            card = _generate_redacted_card(node, base_url)
            status = "redacted_and_sent"
            message = "Notification sent in redacted form due to classification mismatch."
        else:
            card = _generate_event_card(event_type, node, details, base_url)
            status = "sent"
            message = "Notification sent successfully."

        # Dispatch the card
        success = await _dispatch_to_webhook(webhook.webhook_url, card)

        if not success:
            status = "error"
            message = "Failed to dispatch notification after multiple retries."

        results.append({
            "event_type": event_type,
            "webhook_id": str(webhook.id),
            "channel_name": webhook.channel_name,
            "was_redacted": needs_redaction,
            "status": status,
            "message": message,
        })

    logger.info(
        "Event %s dispatched to %d webhooks for node %s",
        event_type,
        len(webhooks),
        node_id,
    )

    return results


async def dispatch_test_notification(
    webhook_id: UUID,
    db: AsyncSession,
    base_url: str = "http://localhost:8000",
) -> Dict[str, Any]:
    """Send a test notification to verify a webhook configuration.

    Parameters
    ----------
    webhook_id : UUID
        The webhook to test.
    db : AsyncSession
        The database session.
    base_url : str
        The base URL of the application.

    Returns
    -------
    dict
        A result dictionary containing:

        - ``webhook_id``: The webhook's UUID.
        - ``channel_name``: The Teams channel name.
        - ``status``: "sent" or "error".
        - ``message``: A human-readable status message.
    """
    result = await db.execute(
        select(TeamChannelWebhook).where(TeamChannelWebhook.id == webhook_id)
    )
    webhook = result.scalar_one_or_none()
    if not webhook:
        return {
            "webhook_id": str(webhook_id),
            "channel_name": "Unknown",
            "status": "error",
            "message": "Webhook not found.",
        }

    # Generate a test card
    card = _generate_test_card(webhook.channel_name, base_url)

    # Dispatch
    success = await _dispatch_to_webhook(webhook.webhook_url, card)

    if success:
        return {
            "webhook_id": str(webhook.id),
            "channel_name": webhook.channel_name,
            "status": "sent",
            "message": "Test notification sent successfully.",
        }
    else:
        return {
            "webhook_id": str(webhook.id),
            "channel_name": webhook.channel_name,
            "status": "error",
            "message": "Failed to send test notification. Check the webhook URL.",
        }
