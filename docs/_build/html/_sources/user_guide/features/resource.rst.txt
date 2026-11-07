Resource Management
===================


Manage people, facilities, and equipment. Assign resources to tasks and track availability.

Resources - RBS
~~~~~~~~~~~~~~~


Resource creation router with permission-governed authorization.

This router provides endpoints for creating new Resource nodes in the
Resource Breakdown Structure (RBS).  Resources represent people, equipment,
and facilities that can be assigned to work packages.

Authorization
~~~~~~~~~~~~~

Resource creation requires the ``RESOURCE_MANAGER`` or ``DEPT_HEAD`` role.
The legacy ``ADMIN`` role maps to both, so administrators can create
resources without explicit delegation.

Creation Flow
~~~~~~~~~~~~~

1. **Role Check** — Verifies the user has RESOURCE_MANAGER or DEPT_HEAD
   authority via :func:`verify_resource_creation_authority`.
2. **Validation** — Pydantic schema validates resource type, calibration
   expiry (mandatory for EQUIPMENT), and other constraints.
3. **Creation** — Inserts the ResourceNode record atomically.
4. **Audit** — Records a ``ForensicAuditLog`` entry with action type
   ``ENTITY_CREATED``.

Endpoints
~~~~~~~~~

- ``POST /`` — Create a new resource with full validation and audit logging.

See Also
--------
- :mod:`app.core.permissions` — Authorization gates.
- :mod:`app.schemas.authoring` — ResourceCreate schema.
