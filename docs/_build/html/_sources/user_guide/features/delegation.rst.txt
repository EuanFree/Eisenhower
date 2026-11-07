Delegation Management
=====================


Delegate tasks and responsibilities to team members. Track delegation status and handover progress.

Delegation
~~~~~~~~~~


Delegation of sign-off authority API router.

This module exposes REST endpoints for managing temporary delegation
of sign-off authority when line managers are unavailable.

Endpoints
---------

Delegation Management
~~~~~~~~~~~~~~~~~~~~~
- ``POST /api/v1/delegation`` — Create a new delegation record.
- ``GET /api/v1/delegation/my-delegations`` — Get current user's delegations.
- ``GET /api/v1/delegation/active`` — Get current user's active delegation.
- ``POST /api/v1/delegation/{id}/revoke`` — Revoke an active delegation.
- ``GET /api/v1/delegation/coverage`` — Check delegation coverage for a date range.
- ``GET /api/v1/delegation/upcoming`` — Get delegations starting soon.
- ``GET /api/v1/delegation/expiring`` — Get delegations expiring soon.
- ``GET /api/v1/delegation/{user_id}/delegatee`` — Resolve who holds authority for a user.

Admin Endpoints
~~~~~~~~~~~~~~~
- ``GET /api/v1/delegation/admin/all`` — List all delegations (admin only).
- ``GET /api/v1/delegation/admin/needs-delegation`` — Find line managers without delegation.

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: Get the current user's delegations.
* **View**: Get the current user's active delegation, if any.
* **View**: Check if the current user has delegation covering a date range.
* **View**: Get delegations starting within the next N days.
* **View**: Get active delegations expiring within the next N days.
* **View**: Resolve who holds sign-off authority for a user on a given date.
* **View**: List all delegations in the system (admin only).
* **View**: Find line managers who have approved leave but no delegation coverage.

**Creating New Items**

* **Create**: Create a new delegation record.
* **Create**: Revoke an active delegation.
