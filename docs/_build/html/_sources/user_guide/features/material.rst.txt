Materials Management
====================


Track perishable materials and their clearance lifecycle.

materials
~~~~~~~~~


Perishable materials and clearance lifecycle API router.

This module provides JWT-authenticated endpoints for managing perishable
material lots and monitoring personnel clearance lifecycle status.

Endpoints
~~~~~~~~~

Perishable Material Lots
------------------------

- **POST /** — Create a new material lot record.
- **GET /** — List material lots with optional filtering by status,
  material type, or part number.
- **GET /{id}** — Get a single material lot by ID.
- **PUT /{id}** — Update a material lot (e.g., reassign to a different task).
- **DELETE /{id}** — Delete a material lot (only if not yet thawed).

Thaw / Out-Time Telemetry
~~~~~~~~~~~~~~~~~~~~~~~~~

- **POST /{id}/thaw** — Log a thaw event, transitioning the lot to
  THAWED_IN_USE.
- **POST /{id}/return-to-storage** — Log return to cold storage,
  adding out-time hours to the accumulated total.
- **POST /{id}/consume** — Mark a lot as fully consumed.
- **GET /{id}/status** — Get detailed lot status with shelf-life
  remaining and out-time remaining.

Clearance Lifecycle
~~~~~~~~~~~~~~~~~~~

- **GET /clearance/{user_id}/status** — Get a user's clearance status
  (type, expiry, days remaining).

Access Control
~~~~~~~~~~~~~~

All endpoints require JWT authentication via the ``get_current_user``
dependency.  Only active users can create or modify material lots.
