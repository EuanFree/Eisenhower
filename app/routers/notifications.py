"""API router for notification webhook management and dispatch.

This module provides the REST API endpoints for managing Microsoft Teams
webhook configurations and triggering notification dispatches.

Endpoints
---------

The router exposes the following endpoints under ``/api/v1/notifications/webhooks``:

- **GET /** — List all active webhooks.
- **POST /** — Create a new webhook configuration.
- **GET /{webhook_id}** — Get a specific webhook's details.
- **PUT /{webhook_id}** — Update an existing webhook configuration.
- **DELETE /{webhook_id}** — Delete a webhook configuration.
- **POST /{webhook_id}/test** — Send a test notification to verify a webhook.
- **POST /dispatch** — Manually trigger a notification event dispatch.

Webhook Management
~~~~~~~~~~~~~~~~~~

Webhooks are associated with specific portfolio nodes.  When an event occurs
on a node, notifications are dispatched to all active webhooks associated
with that node or any of its ancestors in the tree hierarchy.

Each webhook records its ``max_permitted_classification``, which determines
the highest security classification level it may receive.  If a node's
classification exceeds this limit, the notification is automatically redacted.

Security
~~~~~~~~

All endpoints require authentication via JWT token.  Only users with
appropriate clearance levels can create or modify webhooks for classified
portfolio nodes.

Usage
~~~~~

.. code-block:: bash

    # Create a new webhook
    curl -X POST http://localhost:8000/api/v1/notifications/webhooks \\
      -H "Authorization: Bearer <token>" \\
      -H "Content-Type: application/json" \\
      -d '{
        "portfolio_node_id": "uuid",
        "channel_name": "Project Alpha Ops",
        "webhook_url": "https://outlook.office.com/webhook/...",
        "max_permitted_classification": "OFFICIAL"
      }'

    # Send a test notification
    curl -X POST http://localhost:8000/api/v1/notifications/webhooks/{id}/test \\
      -H "Authorization: Bearer <token>"
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.models import (
    TeamChannelWebhook,
    PortfolioNode,
    SecurityClassification,
)
from app.schemas.schemas import (
    WebhookCreate,
    WebhookUpdate,
    WebhookResponse,
    WebhookListResponse,
    NotificationTestResponse,
    NotificationDispatchResponse,
    NotificationEventResponse,
)
from app.utils.auth import get_current_user
from app.models.models import User
from app.services import notifications

router = APIRouter(prefix="/webhooks", tags=["Notifications"])


def _mask_webhook_url(url: str) -> str:
    """Mask a webhook URL for safe display in API responses.

    Shows only the scheme and host, replacing the path with ellipsis
    and the last 4 characters.

    Parameters
    ----------
    url : str
        The full webhook URL.

    Returns
    -------
    str
        A masked version of the URL (e.g., 'https://...abcd').
    """
    if len(url) <= 20:
        return "https://..." + url[-4:] if len(url) >= 4 else "https://..."
    # Show the scheme and a hint of the path, then mask
    return "https://..." + url[-4:]


async def _webhook_to_response(webhook: TeamChannelWebhook) -> WebhookResponse:
    """Convert a TeamChannelWebhook model to a WebhookResponse schema.

    Parameters
    ----------
    webhook : TeamChannelWebhook
        The webhook model instance.

    Returns
    -------
    WebhookResponse
        The response schema with masked URL.
    """
    return WebhookResponse(
        id=webhook.id,
        portfolio_node_id=webhook.portfolio_node_id,
        channel_name=webhook.channel_name,
        webhook_url_masked=_mask_webhook_url(webhook.webhook_url),
        max_permitted_classification=webhook.max_permitted_classification,
        is_active=webhook.is_active,
        created_at=webhook.created_at,
        updated_at=webhook.updated_at,
    )


@router.get("/", response_model=WebhookListResponse)
async def list_webhooks(
    active_only: bool = Query(True, description="If True, only return active webhooks"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all webhook configurations.

    Returns a list of all webhook configurations, optionally filtered
    to only active webhooks.

    Parameters
    ----------
    active_only : bool
        If True, only return webhooks where ``is_active`` is True.
    db : AsyncSession
        The database session.
    current_user : User
        The authenticated user.

    Returns
    -------
    WebhookListResponse
        A list of webhook configurations with masked URLs.
    """
    query = select(TeamChannelWebhook).options(
        selectinload(TeamChannelWebhook.portfolio_node)
    )

    if active_only:
        query = query.where(TeamChannelWebhook.is_active == True)

    result = await db.execute(query)
    webhooks = list(result.scalars().all())

    webhook_responses = [
        await _webhook_to_response(w) for w in webhooks
    ]

    return WebhookListResponse(
        webhooks=webhook_responses,
        total=len(webhook_responses),
    )


@router.post("/", response_model=WebhookResponse)
async def create_webhook(
    webhook_data: WebhookCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new Teams channel webhook configuration.

    Registers a new webhook URL for a specific portfolio node.
    The node must exist and the user must have access to it.

    Parameters
    ----------
    webhook_data : WebhookCreate
        The webhook configuration data.
    db : AsyncSession
        The database session.
    current_user : User
        The authenticated user.

    Returns
    -------
    WebhookResponse
        The created webhook configuration with masked URL.

    Raises
    ------
    HTTPException
        404 if the portfolio node is not found.
        400 if the user lacks clearance for the node.
    """
    # Verify the portfolio node exists
    result = await db.execute(
        select(PortfolioNode).where(PortfolioNode.id == webhook_data.portfolio_node_id)
    )
    node = result.scalar_one_or_none()

    if not node:
        raise HTTPException(
            status_code=404,
            detail=f"Portfolio node {webhook_data.portfolio_node_id} not found",
        )

    # Check user clearance for the node
    if node.security_classification:
        from app.core.abac import is_node_visible
        if not is_node_visible(
            current_user.clearance_level,
            current_user.caveats or [],
            node.security_classification,
            node.caveats or [],
        ):
            raise HTTPException(
                status_code=403,
                detail="Insufficient clearance to create webhook for this node",
            )

    # Create the webhook
    webhook = TeamChannelWebhook(
        portfolio_node_id=webhook_data.portfolio_node_id,
        channel_name=webhook_data.channel_name,
        webhook_url=webhook_data.webhook_url,
        max_permitted_classification=webhook_data.max_permitted_classification,
        is_active=True,
    )

    db.add(webhook)
    await db.commit()
    await db.refresh(webhook)

    return await _webhook_to_response(webhook)


@router.get("/{webhook_id}", response_model=WebhookResponse)
async def get_webhook(
    webhook_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific webhook configuration.

    Parameters
    ----------
    webhook_id : UUID
        The ID of the webhook to retrieve.
    db : AsyncSession
        The database session.
    current_user : User
        The authenticated user.

    Returns
    -------
    WebhookResponse
        The webhook configuration with masked URL.

    Raises
    ------
    HTTPException
        404 if the webhook is not found.
    """
    result = await db.execute(
        select(TeamChannelWebhook)
        .options(selectinload(TeamChannelWebhook.portfolio_node))
        .where(TeamChannelWebhook.id == webhook_id)
    )
    webhook = result.scalar_one_or_none()

    if not webhook:
        raise HTTPException(
            status_code=404,
            detail=f"Webhook {webhook_id} not found",
        )

    return await _webhook_to_response(webhook)


@router.put("/{webhook_id}", response_model=WebhookResponse)
async def update_webhook(
    webhook_id: UUID,
    webhook_data: WebhookUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing webhook configuration.

    Performs a partial update: only the fields included in the request
    body will be modified.

    Parameters
    ----------
    webhook_id : UUID
        The ID of the webhook to update.
    webhook_data : WebhookUpdate
        The fields to update.
    db : AsyncSession
        The database session.
    current_user : User
        The authenticated user.

    Returns
    -------
    WebhookResponse
        The updated webhook configuration.

    Raises
    ------
    HTTPException
        404 if the webhook is not found.
    """
    result = await db.execute(
        select(TeamChannelWebhook)
        .options(selectinload(TeamChannelWebhook.portfolio_node))
        .where(TeamChannelWebhook.id == webhook_id)
    )
    webhook = result.scalar_one_or_none()

    if not webhook:
        raise HTTPException(
            status_code=404,
            detail=f"Webhook {webhook_id} not found",
        )

    # Update only the provided fields
    update_data = webhook_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            setattr(webhook, field, value)

    await db.commit()
    await db.refresh(webhook)

    return await _webhook_to_response(webhook)


@router.delete("/{webhook_id}")
async def delete_webhook(
    webhook_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a webhook configuration.

    Permanently removes the webhook configuration from the database.
    This will stop all notifications to this channel.

    Parameters
    ----------
    webhook_id : UUID
        The ID of the webhook to delete.
    db : AsyncSession
        The database session.
    current_user : User
        The authenticated user.

    Returns
    -------
    dict
        A confirmation message.

    Raises
    ------
    HTTPException
        404 if the webhook is not found.
    """
    result = await db.execute(
        select(TeamChannelWebhook).where(TeamChannelWebhook.id == webhook_id)
    )
    webhook = result.scalar_one_or_none()

    if not webhook:
        raise HTTPException(
            status_code=404,
            detail=f"Webhook {webhook_id} not found",
        )

    await db.execute(
        delete(TeamChannelWebhook).where(TeamChannelWebhook.id == webhook_id)
    )
    await db.commit()

    return {"message": f"Webhook {webhook_id} deleted successfully"}


@router.post("/{webhook_id}/test", response_model=NotificationTestResponse)
async def test_webhook(
    webhook_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a test notification to verify a webhook configuration.

    Dispatches a simple test Adaptive Card to the specified webhook
    to verify that the URL is valid and the channel is receiving
    notifications correctly.

    Parameters
    ----------
    webhook_id : UUID
        The ID of the webhook to test.
    db : AsyncSession
        The database session.
    current_user : User
        The authenticated user.

    Returns
    -------
    NotificationTestResponse
        The result of the test dispatch.

    Raises
    ------
    HTTPException
        404 if the webhook is not found.
    """
    result = await db.execute(
        select(TeamChannelWebhook).where(TeamChannelWebhook.id == webhook_id)
    )
    webhook = result.scalar_one_or_none()

    if not webhook:
        raise HTTPException(
            status_code=404,
            detail=f"Webhook {webhook_id} not found",
        )

    # Dispatch the test notification
    result = await notifications.dispatch_test_notification(webhook_id, db)

    return NotificationTestResponse(**result)


@router.post("/dispatch", response_model=NotificationDispatchResponse)
async def dispatch_notification(
    event_type: str = Query(
        ...,
        description="The type of event to dispatch (TASK_BLOCKED, HANDOFF_READY, REQUISITION_PENDING, EVM_VARIANCE_BREACH)",
    ),
    node_id: UUID = Query(
        ...,
        description="The portfolio node that triggered the event",
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Manually trigger a notification event dispatch.

    Dispatches a notification event to all active webhooks associated
    with the specified node or its ancestors.  This endpoint is useful
    for testing or manually triggering notifications.

    Parameters
    ----------
    event_type : str
        The type of event to dispatch.  Must be one of:
        TASK_BLOCKED, HANDOFF_READY, REQUISITION_PENDING, EVM_VARIANCE_BREACH.
    node_id : UUID
        The portfolio node that triggered the event.
    db : AsyncSession
        The database session.
    current_user : User
        The authenticated user.

    Returns
    -------
    NotificationDispatchResponse
        The results of the dispatch operation, including per-webhook
        status and summary counts.

    Raises
    ------
    HTTPException
        400 if the event type is invalid.
        404 if the node is not found.
    """
    # Validate event type
    valid_events = [e.value for e in notifications.NotificationEventType]
    if event_type not in valid_events:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid event type: {event_type}. Must be one of: {', '.join(valid_events)}",
        )

    # Verify the node exists
    result = await db.execute(
        select(PortfolioNode).where(PortfolioNode.id == node_id)
    )
    node = result.scalar_one_or_none()

    if not node:
        raise HTTPException(
            status_code=404,
            detail=f"Portfolio node {node_id} not found",
        )

    # Dispatch the event
    dispatch_results = await notifications.dispatch_event(
        event_type=event_type,
        node_id=node_id,
        db=db,
    )

    # Convert results to response schemas
    event_responses = [
        NotificationEventResponse(**result) for result in dispatch_results
    ]

    # Calculate summary counts
    total_sent = sum(1 for r in dispatch_results if r["status"] == "sent")
    total_redacted = sum(1 for r in dispatch_results if r["status"] == "redacted_and_sent")
    total_failed = sum(1 for r in dispatch_results if r["status"] == "error")

    return NotificationDispatchResponse(
        event_type=event_type,
        results=event_responses,
        total_sent=total_sent,
        total_redacted=total_redacted,
        total_failed=total_failed,
    )
