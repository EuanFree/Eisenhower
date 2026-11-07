Sandbox Scenarios
=================


Test what-if scenarios in an isolated sandbox without affecting the live project data.

sandboxes
~~~~~~~~~


Sandbox scenario API router for What-If schedule planning.

This module provides the REST API endpoints for creating, comparing,
and merging sandbox scenarios.  Sandbox scenarios allow planners to
explore "What-If" questions without affecting the live operational
schedule.

Endpoints
~~~~~~~~~

- **POST /api/v1/sandboxes/fork** — Creates a new isolated scenario
  branch by cloning a live WBS sub-tree.
- **GET /api/v1/sandboxes/{id}/diff** — Returns the three-way comparison
  payload (sandbox vs live vs baseline) for UI diff inspection.
- **POST /api/v1/sandboxes/{id}/merge** — Merges selected scenario
  changes into the live operational schedule.

Authentication
~~~~~~~~~~~~~~

All endpoints require a valid JWT token.  The authenticated user's
identity is used for audit logging and access control.

Security
~~~~~~~~

ABAC clearance checks are applied when forking: the user must have
sufficient clearance to access the root node being forked.  The merge
endpoint records a ``SANDBOX_MERGE`` entry in the ForensicAuditLog.

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: Compute three-way diff for a sandbox scenario.

**Creating New Items**

* **Create**: Fork a live WBS sub-tree into an isolated sandbox scenario.
* **Create**: Merge sandbox changes into the live operational schedule.
