Notifications
=============


Configure alerts and webhook notifications to stay informed about project changes.

Notifications
~~~~~~~~~~~~~


API router for notification webhook management and dispatch.

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
   curl -X POST http://localhost:8000/api/v1/notifications/webhooks \
   -H "Authorization: Bearer <token>" \
   -H "Content-Type: application/json" \
   -d '{
   "portfolio_node_id": "uuid",
   "channel_name": "Project Alpha Ops",
   "webhook_url": "https://outlook.office.com/webhook/...",
   "max_permitted_classification": "OFFICIAL"
   }'

   # Send a test notification
   curl -X POST http://localhost:8000/api/v1/notifications/webhooks/{id}/test \
   -H "Authorization: Bearer <token>"
