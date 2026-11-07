Dashboard
=========


View aggregated project statistics, summaries, and activity feeds.

Dashboards
~~~~~~~~~~


Dashboard API router.

This module provides CRUD endpoints for managing dashboards and their widgets
at ``/api/v1/dashboards``.  Dashboards are user-created collections of
draggable widgets that display performance indicators on a free-form canvas.

Endpoints
~~~~~~~~~

- ``GET /dashboards`` — List all dashboards accessible to the current user.
- ``POST /dashboards`` — Create a new dashboard.
- ``GET /dashboards/{id}`` — Get a dashboard with its widgets.
- ``PUT /dashboards/{id}`` — Update a dashboard (owner or admin only).
- ``DELETE /dashboards/{id}`` — Delete a dashboard (owner or admin only).
- ``POST /dashboards/{id}/widgets`` — Add a widget to a dashboard.
- ``PUT /dashboards/{id}/widgets/{widget_id}`` — Update a widget.
- ``DELETE /dashboards/{id}/widgets/{widget_id}`` — Delete a widget.
- ``GET /dashboards/{id}/data`` — Fetch data for all widgets in one call.
- ``GET /dashboards/sql-builder/allowed-tables`` — List allowed tables for SQL builder.
- ``POST /dashboards/sql-builder/execute`` — Execute a validated SQL query.

Access Control
~~~~~~~~~~~~~~

- **GET /dashboards** returns dashboards where:
  - ``owner_user_id == current_user.id`` (own dashboards), OR
  - ``sharing_scope IN ('PROJECT_SHARED', 'SYSTEM_GLOBAL')`` (shared dashboards).
- **PUT /dashboards/{id}** requires the user to be the dashboard owner or an admin.
- All endpoints enforce classification: the user's clearance must be >= the
  dashboard's classification level.
