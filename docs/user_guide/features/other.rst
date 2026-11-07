Other Features
==============


Additional features and utilities.

cdrl
~~~~


Contract Deliverables (CDRL/SDRL) and Verification & Validation (V&V) API router.

This module provides the API endpoints for managing contract deliverables
and V&V test cases within the Eisenhower Portfolio Manager.

Contract Deliverables
---------------------

In defence contracting, every contract specifies a set of formal deliverables
(CDRLs — Contract Data Requirements List, or SDRLs — Supplier Data Requirements
List) that must be produced, submitted, reviewed, and accepted.  Each deliverable
follows a lifecycle from DRAFTING through SUBMITTED, UNDER_REVIEW, and finally
ACCEPTED (or REJECTED).

The review window is a critical tracking metric: once a deliverable is submitted,
the contracting authority has a defined number of days to review it.  These
endpoints expose countdown queries so programme managers can see which reviews
are approaching their deadline.

Verification & Validation
-------------------------

V&V test cases provide objective, physical completion gates.  Before a work
package can be marked as 100% complete, all mandatory test cases must be in
either PASSED or WAIVED status.  The V&V gate check endpoint is used by the
progress update flow to enforce this interlock.

Billing Milestone Interlock
---------------------------

Billing milestones linked to CDRLs cannot transition to complete while the
CDRL status is REJECTED or UNDER_REVIEW.  This check is performed in the
V&V gate check endpoint.

Endpoints
~~~~~~~~~

CDRL Operations:
   GET    /api/v1/cdrl/ — List all deliverables with optional filtering.
   POST   /api/v1/cdrl/ — Create a new deliverable.
   GET    /api/v1/cdrl/{id} — Get a single deliverable.
   PUT    /api/v1/cdrl/{id} — Update a deliverable (status transitions, submission).
   DELETE /api/v1/cdrl/{id} — Delete a deliverable.
   GET    /api/v1/cdrl/countdown — List deliverables with review deadlines approaching.

V&V Test Case Operations:
   GET    /api/v1/cdrl/node/{node_id}/vv-tests — List V&V test cases for a node.
   POST   /api/v1/cdrl/node/{node_id}/vv-tests — Create a V&V test case.
   PUT    /api/v1/cdrl/vv-tests/{id} — Update a V&V test case status.
   DELETE /api/v1/cdrl/vv-tests/{id} — Delete a V&V test case.

V&V Gate Check:
   GET    /api/v1/cdrl/node/{node_id}/vv-gate-check — Check if a node can complete.

Comments
~~~~~~~~


Comments router for task-level discussion threads.

This module provides REST endpoints for creating, reading, updating, and
deleting comments attached to tasks within the portfolio management system.
Comments allow team members to discuss task details, share updates, and
maintain an audit trail of decisions.

.. warning::
   This router uses the legacy relational data model (Task, Project, Portfolio)
   and is **not imported** by the main FastAPI application.  It is retained for
   reference only.  The current system uses the unified
   :class:`~app.models.models.UniversalBreakdownNode` tree structure with the
   WBS router (:mod:`app.routers.wbs`).

Endpoints
---------

+------------------------+------------------------------------------+
| Method                 | Description                              |
+========================+==========================================+
| ``GET /comments/``     | List comments with optional filters.     |
+------------------------+------------------------------------------+
| ``POST /comments/``    | Create a new comment on a task.          |
+------------------------+------------------------------------------+
| ``GET /comments/{id}`` | Get a single comment by ID.              |
+------------------------+------------------------------------------+
| ``PUT /comments/{id}`` | Update a comment (author only).          |
+------------------------+------------------------------------------+
| ``DELETE /comments/{id}`` | Delete a comment (author or admin).  |
+------------------------+------------------------------------------+
| ``GET /comments/task/{id}`` | Get all comments for a task.       |
+------------------------+------------------------------------------+

Access Control
~~~~~~~~~~~~~~

Comments are accessible only to users who have membership in the portfolio
that contains the task's project.  Only the comment author may edit or
delete their own comments; administrators may delete any comment.

db_health
~~~~~~~~~


Database health and maintenance API router.

This module exposes the ``/api/v1/admin/db-health`` endpoint for querying
database health metrics and triggering maintenance tasks. It provides
administrators with visibility into replication lag, index fragmentation,
table bloat, and WAL archiving status.

Endpoints
~~~~~~~~~

- **GET /api/v1/admin/db-health** — Returns current database health metrics
  without running maintenance.
- **POST /api/v1/admin/db-health/run-maintenance** — Triggers a full
  maintenance run (VACUUM ANALYZE, re-index) and returns the results.

Security
~~~~~~~~

All endpoints require JWT authentication. In production, these endpoints
should be accessible only to administrators with clearance ≥ SECRET.

The maintenance tasks require superuser privileges on the PostgreSQL
database. In a Patroni HA cluster, maintenance should be run only on
the primary node.

facilities
~~~~~~~~~~


Facility reservation and timeline API endpoints.

This router provides endpoints for managing chamber reservations and
viewing facility timelines.  It is the primary interface for booking
high-demand physical resources (EMC Anechoic Chambers, Thermal Vacuum
Chambers, HIL rigs) and checking their availability.

Endpoints
~~~~~~~~~

- **POST /reservations** — Create a new chamber reservation with full
  validation (capability gate, calibration gate, buffer enforcement).
- **GET /locations/{id}/timeline** — Retrieve the time-phased reservation
  timeline for a facility, including buffer/cooldown slots.

Security
~~~~~~~~

All endpoints require JWT authentication via :func:`app.utils.auth.get_current_user`.
The authenticated user's clearance level is checked against the facility's
security classification before returning reservation data.

Line Management
~~~~~~~~~~~~~~~


Line management, leave booking, and resource downtime API router.

This module exposes REST endpoints for:

1. **Line Management** — Setting and querying reporting relationships.
2. **Leave Requests** — Submitting, approving, rejecting, and cancelling leave.
3. **Leave Impact Assessment** — Checking team overlap and delivery risk.
4. **Resource Downtime** — Scheduling and managing physical resource offline periods.
5. **Skills Management** — Querying and managing user skill profiles.

Endpoints
---------

Line Management
~~~~~~~~~~~~~~~
- ``GET /api/v1/line-management/my-manager`` — Get current user's line manager.
- ``GET /api/v1/line-management/my-reports`` — Get direct reports of current user.
- ``GET /api/v1/line-management/all-reports`` — Get all direct and indirect reports.
- ``GET /api/v1/line-management/chain-of-command`` — Get full chain of command.
- ``GET /api/v1/line-management/hierarchy`` — Get nested team hierarchy tree.
- ``PUT /api/v1/line-management/set-manager/{user_id}`` — Set a user's line manager (admin).

Leave Requests
~~~~~~~~~~~~~~
- ``POST /api/v1/leave/requests`` — Submit a new leave request.
- ``GET /api/v1/leave/my-requests`` — Get current user's leave requests.
- ``GET /api/v1/leave/pending`` — Get pending requests for current user's reports.
- ``POST /api/v1/leave/{id}/approve`` — Approve a pending leave request.
- ``POST /api/v1/leave/{id}/reject`` — Reject a pending leave request.
- ``POST /api/v1/leave/{id}/cancel`` — Cancel own pending leave request.
- ``GET /api/v1/leave/overlap-assessment`` — Assess team leave overlap risk.

Resource Downtime
~~~~~~~~~~~~~~~~~
- ``POST /api/v1/downtime`` — Schedule resource offline period.
- ``GET /api/v1/downtime`` — List upcoming downtime records.
- ``GET /api/v1/downtime/{resource_id}`` — Get downtime for a specific resource.
- ``DELETE /api/v1/downtime/{id}`` — Cancel a scheduled downtime.

Skills
~~~~~~
- ``GET /api/v1/skills`` — List all skill definitions.
- ``GET /api/v1/skills/categories`` — List all skill categories.
- ``GET /api/v1/skills/my-skills`` — Get current user's skill profiles.
- ``POST /api/v1/skills/add`` — Add or update a skill for current user.
- ``DELETE /api/v1/skills/{skill_id}`` — Remove a skill from current user.

Milestones
~~~~~~~~~~


Milestones router for project milestone tracking.

This module provides REST endpoints for creating, reading, updating, and
deleting milestones associated with projects.  Milestones represent key
date-driven checkpoints in a project schedule, such as design reviews,
contractual delivery dates, or phase gate approvals.

.. warning::
   This router uses the legacy relational data model (Milestone, Project,
   Portfolio) and is **not imported** by the main FastAPI application.  It is
   retained for reference only.  The current system uses the unified
   :class:`~app.models.models.UniversalBreakdownNode` tree structure with
   milestone weight steps managed by the EVM router
   (:mod:`app.routers.evm`).

Endpoints
---------

+--------------------------------+------------------------------------------+
| Method                         | Description                              |
+================================+==========================================+
| ``GET /milestones/``           | List milestones with optional filters.   |
+--------------------------------+------------------------------------------+
| ``POST /milestones/``          | Create a new milestone.                  |
+--------------------------------+------------------------------------------+
| ``GET /milestones/{id}``       | Get a single milestone by ID.            |
+--------------------------------+------------------------------------------+
| ``PUT /milestones/{id}``       | Update a milestone.                      |
+--------------------------------+------------------------------------------+
| ``DELETE /milestones/{id}``    | Delete a milestone.                      |
+--------------------------------+------------------------------------------+
| ``GET /milestones/project/{id}`` | Get all milestones for a project.      |
+--------------------------------+------------------------------------------+

Access Control
~~~~~~~~~~~~~~

Milestones are accessible only to users who have membership in the portfolio
that contains the milestone's project.  Viewers cannot create, update, or
delete milestones.

dev: mock fixtures
~~~~~~~~~~~~~~~~~~


Developer mock fixtures — reproducible test scenarios for UI integration.

This module provides seed data scenarios that populate the database with
realistic, defence-domain test data for rapid frontend development and
integration testing.  Each scenario is a self-contained programme with
50+ nodes, PDM dependency links, 3-point Monte Carlo estimates, resource
assignments, simulated clashes, and baseline snapshots.

Scenarios are designed to exercise every UI component in the HMI catalog:

- **Gantt chart**: Multi-level WBS with planned/actual dates, progress,
  blockers, cross-hatch shading, and baseline comparisons.
- **Jagged drop line**: Mix of ahead, on-track, behind, and complete tasks.
- **Daily cockpit**: Active sprint load, blocked items, urgent tasks,
  focus queue, and claimable placeholder tasks.
- **Clash triage**: Resource double-bookings, clearance lapses, and
  facility collisions with proposed leveling shifts.
- **Display settings**: Server-side profile hydration on login.

Available Scenarios
~~~~~~~~~~~~~~~~~~~

1. **avionics-radar** — Avionics radar development programme with 50 nodes
   spanning requirements, design, development, integration, and test phases.
   Includes PDM links (FS/SS/FF/SF), 3-point estimates, resource assignments,
   and simulated clashes.

2. **minimal** — Small 10-node scenario for quick smoke testing of the
   Gantt chart and basic cockpit views.

Usage
~~~~~

In development environments, call::

   GET /api/v1/dev/fixtures/avionics-radar

This clears and repopulates the database with the scenario data, returning
a summary of what was seeded.  The endpoint is **only available when
``ENVIRONMENT != 'production'``** to prevent accidental data loss.

Security Warning
~~~~~~~~~~~~~~~~

This endpoint is **DANGEROUS** — it clears existing data.  It is gated
behind the ``ENVIRONMENT`` setting and will **not load** in production.
Never expose this endpoint in a production deployment.

Portfolios
~~~~~~~~~~


Portfolios router for top-level programme container management.

This module provides REST endpoints for creating, reading, updating, and
deleting portfolios, as well as managing portfolio membership.  Portfolios
are the highest-level containers in the legacy data model, grouping related
projects under a common governance structure.

.. warning::
   This router uses the legacy relational data model (Portfolio, PortfolioMember)
   and is **not imported** by the main FastAPI application.  It is retained for
   reference only.  The current system uses the unified
   :class:`~app.models.models.UniversalBreakdownNode` tree structure with the
   WBS router (:mod:`app.routers.wbs`).

Endpoints
---------

+-----------------------------------+------------------------------------------+
| Method                            | Description                              |
+===================================+==========================================+
| ``GET /portfolios/``              | List accessible portfolios.              |
+-----------------------------------+------------------------------------------+
| ``POST /portfolios/``             | Create a new portfolio.                  |
+-----------------------------------+------------------------------------------+
| ``GET /portfolios/{id}``          | Get a single portfolio by ID.            |
+-----------------------------------+------------------------------------------+
| ``PUT /portfolios/{id}``          | Update a portfolio.                      |
+-----------------------------------+------------------------------------------+
| ``DELETE /portfolios/{id}``       | Delete a portfolio.                      |
+-----------------------------------+------------------------------------------+
| ``GET /portfolios/{id}/members``  | List portfolio members.                  |
+-----------------------------------+------------------------------------------+
| ``POST /portfolios/{id}/members`` | Add a member to a portfolio.             |
+-----------------------------------+------------------------------------------+
| ``PUT /portfolios/{id}/members/{mid}`` | Update a member's role.            |
+-----------------------------------+------------------------------------------+
| ``DELETE /portfolios/{id}/members/{mid}`` | Remove a member.                |
+-----------------------------------+------------------------------------------+

Access Control
~~~~~~~~~~~~~~

Portfolios are accessible to their owner and all members.  Only the owner
or members with edit roles can modify portfolio settings or manage membership.

Projects
~~~~~~~~


Projects router for mid-level project container management.

This module provides REST endpoints for creating, reading, updating, and
deleting projects within portfolios.  Projects sit between portfolios and
tasks in the legacy hierarchy, representing discrete work efforts with their
own managers, statuses, and priorities.

.. warning::
   This router uses the legacy relational data model (Project, Portfolio)
   and is **not imported** by the main FastAPI application.  It is retained
   for reference only.  The current system uses the unified
   :class:`~app.models.models.UniversalBreakdownNode` tree structure with the
   WBS router (:mod:`app.routers.wbs`).

Endpoints
---------

+---------------------------+------------------------------------------+
| Method                    | Description                              |
+===========================+==========================================+
| ``GET /projects/``        | List accessible projects.                |
+---------------------------+------------------------------------------+
| ``POST /projects/``       | Create a new project.                    |
+---------------------------+------------------------------------------+
| ``GET /projects/{id}``    | Get a single project by ID.              |
+---------------------------+------------------------------------------+
| ``PUT /projects/{id}``    | Update a project.                        |
+---------------------------+------------------------------------------+
| ``DELETE /projects/{id}`` | Delete a project.                        |
+---------------------------+------------------------------------------+
| ``GET /projects/{id}/stats`` | Get project statistics (task counts). |
+---------------------------+------------------------------------------+

Access Control
~~~~~~~~~~~~~~

Projects are accessible to users who have membership in the containing
portfolio.  Only the portfolio owner, project manager, or non-viewer members
can edit projects.

Tasks
~~~~~


Tasks router for work item management within projects.

This module provides REST endpoints for creating, reading, updating, and
deleting tasks within projects.  Tasks are the lowest-level work items in
the legacy data model, representing individual units of work with assignees,
priorities, statuses, and due dates.

.. warning::
   This router uses the legacy relational data model (Task, Project, Portfolio)
   and is **not imported** by the main FastAPI application.  It is retained for
   reference only.  The current system uses the unified
   :class:`~app.models.models.UniversalBreakdownNode` tree structure with the
   WBS router (:mod:`app.routers.wbs`).

Endpoints
---------

+------------------------+------------------------------------------+
| Method                 | Description                              |
+========================+==========================================+
| ``GET /tasks/``        | List tasks with various filters.         |
+------------------------+------------------------------------------+
| ``POST /tasks/``       | Create a new task.                       |
+------------------------+------------------------------------------+
| ``GET /tasks/{id}``    | Get a single task by ID.                 |
+------------------------+------------------------------------------+
| ``PUT /tasks/{id}``    | Update a task.                           |
+------------------------+------------------------------------------+
| ``DELETE /tasks/{id}`` | Delete a task.                           |
+------------------------+------------------------------------------+

Access Control
~~~~~~~~~~~~~~

Tasks are accessible to users who have membership in the portfolio containing
the task's project, or to the task's direct assignee.  Only the portfolio
owner, project manager, or non-viewer members can create, update, or delete
tasks.

custom_fields
~~~~~~~~~~~~~


Admin router for Custom Field Definition CRUD operations.

This module provides the API endpoints for managing custom field definitions
in the portfolio management system.  Only users with PMO_DIRECTOR or
SYSTEM_ADMIN roles can create, update, or delete field definitions.

Endpoints
~~~~~~~~~

- **GET /custom-fields** — List definitions (filterable by target_entity).
- **POST /custom-fields** — Create a new definition.
- **GET /custom-fields/{id}** — Get a single definition.
- **PUT /custom-fields/{id}** — Update an existing definition.
- **DELETE /custom-fields/{id}** — Soft-deactivate a definition.

Access Control
~~~~~~~~~~~~~~

All endpoints require JWT authentication.  Create, update, and delete
operations require the SYSTEM_ADMIN role.  List and get operations are
available to all authenticated users.

Usage
~~~~~

.. code-block:: python

   from app.routers.admin.custom_fields import router

   app.include_router(router, prefix="/api/v1/admin")

See Also
--------
- :mod:`app.models.custom_fields` — CustomFieldDefinition model.
- :mod:`app.schemas.custom_fields` — Pydantic schemas.
- :mod:`app.services.custom_field_engine` — Validation engine.

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: List all contract deliverables with optional filtering.
* **View**: Get a single contract deliverable by ID.
* **View**: List deliverables with review deadlines approaching or overdue.
* **View**: List all V&V test cases for a portfolio node.
* **View**: Check whether a portfolio node can be marked as 100% complete.
* **View**: List comments with optional filters.
* **View**: Get a comment by ID.
* **View**: Get all comments for a specific task.
* **View**: Get the current user's direct line manager.
* **View**: Get all users who report directly to the current user.
* **View**: Get all direct and indirect reports of the current user.
* **View**: Get the full chain of command from the current user upward.
* **View**: Get the nested team hierarchy tree rooted at the current user.
* **View**: List milestones with optional filters.
* **View**: Get a milestone by ID.
* **View**: Get all milestones for a specific project.
* **View**: Load a reproducible test scenario into the database.
* **View**: List available test scenarios.
* **View**: Return a mock Gantt chart payload for UI testing.
* **View**: Return a mock jagged drop line payload for UI testing.
* **View**: Return a mock Daily Cockpit summary payload for UI testing.
* **View**: Return a mock clash triage payload for UI testing.
* **View**: Return a mock display settings payload for UI testing.
* **View**: Return the HMI Component Catalog JSON Schema manifest.
* **View**: List portfolios accessible to the current user.
* **View**: Get a portfolio by ID.
* **View**: List all members of a portfolio.
* **View**: Get statistics for a portfolio.
* **View**: List projects accessible to the current user, optionally filtered by portfolio.
* **View**: Get a project by ID.
* **View**: Get statistics for a project.
* **View**: List tasks with various filters.
* **View**: Get a task by ID.
* **View**: Get all subtasks of a task.
* **View**: Get task update history (basic - returns key timestamps).

**Creating New Items**

* **Create**: Create a new Contract Deliverable.
* **Create**: Create a new V&V test case for a portfolio node.
* **Create**: Create a new comment on a task.
* **Create**: Create a new milestone.
* **Create**: Create a new portfolio.
* **Create**: Add a member to a portfolio.
* **Create**: Create a new project within a portfolio.
* **Create**: Create a new task.

**Updating Information**

* **Update**: Update an existing contract deliverable.
* **Update**: Update an existing V&V test case.
* **Update**: Update a comment (only the author can edit).
* **Update**: Set or change a user's direct line manager (admin only).
* **Update**: Update a milestone.
* **Update**: Update a portfolio.
* **Update**: Update a portfolio member's role.
* **Update**: Update a project.
* **Update**: Update a task.

**Removing Items**

* **Delete**: Delete a contract deliverable.
* **Delete**: Delete a V&V test case.
* **Delete**: Delete a comment (author or admin).
* **Delete**: Delete a milestone.
* **Delete**: Delete a portfolio (owner only).
* **Delete**: Remove a member from a portfolio.
* **Delete**: Delete a project.
* **Delete**: Delete a task and its subtasks.
