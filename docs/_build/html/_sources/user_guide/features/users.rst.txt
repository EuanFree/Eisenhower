User Management
===============


Administrators can manage system users, assign roles, and configure clearance levels.

Users
~~~~~


User management router for administrative operations.

This module provides endpoints for managing user accounts.  Most
operations require admin privileges.

Endpoints
~~~~~~~~~

- ``GET /api/users/`` — List all users (admin only, with filtering).
- ``GET /api/users/{id}`` — Get a specific user's profile.
- ``PUT /api/users/{id}`` — Update a user's details (admin only).
- ``DELETE /api/users/{id}`` — Delete a user account (admin only).
- ``PATCH /api/users/{id}/password`` — Change a user's password.

Access Control
~~~~~~~~~~~~~~

- **List/Update/Delete** — Requires admin role.
- **Get by ID** — Any authenticated user can view any user's profile.
- **Change password** — Users can change their own password; admins
  can change any user's password.

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: List all users with optional filtering (admin only).
* **View**: Get a user by ID.

**Updating Information**

* **Update**: Update a user (admin only).
* **Update**: Change a user's password. Users can change their own, admins can change any.

**Removing Items**

* **Delete**: Delete a user (admin only).
