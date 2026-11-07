Check-Out Leases
================


Check out sections of the project tree for exclusive editing to prevent conflicts.

leases
~~~~~~


Check-out lease lifecycle API router.

This module provides the endpoints for managing exclusive sub-tree check-out
reservations.  When a user with CAM or higher authority checks out a sub-tree,
no other user can modify nodes within that scope until the lease is released
or expires.

Endpoints
~~~~~~~~~

- ``POST /checkout/{node_id}`` — Acquire an exclusive lease on a sub-tree.
- ``POST /heartbeat/{lease_token}`` — Extend an active lease by 60 minutes.
- ``POST /checkin/{lease_token}`` — Release a lease and publish changes.
- ``POST /force-break/{lease_token}`` — Admin override to break abandoned leases.
- ``GET /{lease_token}`` — Get details of a specific lease.

Authorization
~~~~~~~~~~~~~

All endpoints require JWT authentication.  The checkout endpoint requires
CAM or higher authority on the target path.  The force-break endpoint
requires PROGRAMME_DIRECTOR or SYSTEM_ADMIN role.

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: Get details of a specific lease.

**Creating New Items**

* **Create**: Acquire an exclusive lease on a sub-tree.
* **Create**: Extend an active lease by 60 minutes.
* **Create**: Release a lease and publish staged changes.
* **Create**: Administrative override to break an abandoned lease.
