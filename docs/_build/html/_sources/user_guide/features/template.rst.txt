Templates
=========


Create and reuse project templates to standardise project setup across the organisation.

Templates - Catalog & Instantiation
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


Template catalog API router.

This module provides REST endpoints for managing structural templates
and resource crew templates, as well as for snapshotting existing WBS
sub-trees as templates and instantiating templates into the live
operational schedule.

Endpoints
---------

Structural Templates
~~~~~~~~~~~~~~~~~~~~

- ``GET /api/v1/templates`` — List all structural templates.
- ``POST /api/v1/templates`` — Create a new structural template.
- ``GET /api/v1/templates/{id}`` — Get a single template.
- ``PUT /api/v1/templates/{id}`` — Update a template.
- ``DELETE /api/v1/templates/{id}`` — Delete a template.
- ``POST /api/v1/templates/snapshot`` — Snapshot an existing WBS sub-tree as a template.
- ``POST /api/v1/templates/instantiate`` — Instantiate a template into the live schedule.

Resource Crew Templates
~~~~~~~~~~~~~~~~~~~~~~~

- ``GET /api/v1/templates/crew`` — List all crew templates.
- ``POST /api/v1/templates/crew`` — Create a new crew template.
- ``GET /api/v1/templates/crew/{id}`` — Get a single crew template with members.
- ``PUT /api/v1/templates/crew/{id}`` — Update a crew template.
- ``DELETE /api/v1/templates/crew/{id}`` — Delete a crew template.

Crew Template Members
~~~~~~~~~~~~~~~~~~~~~

- ``POST /api/v1/templates/crew/{id}/members`` — Add a role to a crew template.
- ``PUT /api/v1/templates/crew/{id}/members/{member_id}`` — Update a crew member role.
- ``DELETE /api/v1/templates/crew/{id}/members/{member_id}`` — Remove a crew member role.

Security
~~~~~~~~

All endpoints require JWT authentication via the ``get_current_user``
dependency.  Template operations are available to all authenticated
users; deletion may require Admin/Manager role in production.

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: List all structural templates.
* **View**: Get a single structural template.
* **View**: List all resource crew templates.
* **View**: Get a crew template with its member roles.

**Creating New Items**

* **Create**: Create a new structural template.
* **Create**: Snapshot an existing WBS sub-tree as a template.
* **Create**: Instantiate a template into the live schedule.
* **Create**: Create a new resource crew template.
* **Create**: Add a role to a crew template.

**Updating Information**

* **Update**: Update a structural template.
* **Update**: Update a crew template.
* **Update**: Update a crew member role.

**Removing Items**

* **Delete**: Delete a structural template.
* **Delete**: Delete a crew template.
* **Delete**: Remove a crew member role.
