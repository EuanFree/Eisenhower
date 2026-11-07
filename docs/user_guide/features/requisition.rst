Resource Requisitions
=====================


Request resources for your projects. Submit requisitions, track approval status, and manage allocations.

requisitions
~~~~~~~~~~~~


Requisitions API router for the Eisenhower Portfolio Manager.

This module provides the REST endpoints for the resource requisition workflow.
It allows project managers to request resources, functional leads to review
pending requisitions, and approvers to atomically approve requisitions by
creating confirmed ResourceAssignments.

Endpoints Overview
------------------

The router exposes three endpoints under ``/api/v1/requisitions``:

1. **POST /** — Submit a new resource requisition.
   A project manager uses this to request personnel for a task.  The
   requisition specifies skills, hours, dates, and optionally targets
   a specific resource.

2. **GET /inbox** — Fetch pending requisitions for review.
   A functional lead uses this to see all requisitions awaiting their
   review.  The response includes candidate matches from the matching
   engine to help with decision-making.

3. **POST /{id}/approve** — Approve or reject a requisition.
   An approver uses this to finalise a requisition.  Approval atomically
   creates a confirmed ResourceAssignment linking the resource to the
   portfolio node.  Rejection records the reason for audit trail.

Authentication
~~~~~~~~~~~~~~

All endpoints require a valid JWT token.  The authenticated user's identity
is used to populate the ``requested_by_user_id`` field on new requisitions
and the ``approver_user_id`` field on approvals.

Atomic Approval
~~~~~~~~~~~~~~~

When a requisition is approved, the following operations occur within a
single database transaction:

1. The requisition status is updated to APPROVED.
2. A new ResourceAssignment is created with status CONFIRMED.
3. The approver_user_id is set to the current user.

If any step fails, the entire transaction is rolled back, ensuring
data consistency.

Usage
~~~~~

   # Submit a requisition
   POST /api/v1/requisitions
   {
   "portfolio_node_id": "550e8400-e29b-41d4-a716-446655440000",
   "required_skill_id": 5,
   "min_proficiency": "COMPETENT",
   "requested_hours": 80.0,
   "start_date": "2026-11-01",
   "end_date": "2026-11-30",
   "notes": "Need RF engineer for antenna testing phase"
   }

   # View pending requisitions
   GET /api/v1/requisitions/inbox

   # Approve a requisition
   POST /api/v1/requisitions/{id}/approve
   {
   "status": "APPROVED",
   "target_resource_id": "660e8400-e29b-41d4-a716-446655440001"
   }

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: Fetch all pending requisitions for functional lead review.
* **View**: Get ranked candidate matches for a requisition.

**Creating New Items**

* **Create**: Submit a new resource requisition request.
* **Create**: Approve or reject a resource requisition.
