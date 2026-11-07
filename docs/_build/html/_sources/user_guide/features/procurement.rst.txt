Procurement Tracking
====================


Track supply chain activities, purchase orders, and delivery milestones for procured items.

procurement
~~~~~~~~~~~


Procurement tracking API router.

This module provides endpoints for managing supply chain procurement items
and binding them as hard early-start constraints to WBS tasks.

Procurement Workflow
~~~~~~~~~~~~~~~~~~~~

1. **Register a procurement item** — When a component is identified as a
   procurement requirement, create a ``ProcurementItem`` record with the
   part number, supplier CAGE code, and initial forecast delivery date.

2. **Link to a WBS task** — Bind the procurement item to a ``PortfolioNode``
   task using ``TaskProcurementConstraint``.  The task cannot start before
   the procurement item's forecast delivery date.

3. **Update lifecycle stage** — As the procurement progresses through the
   pipeline (REQUISITION → RFQ_ISSUED → PO_PLACED → IN_MANUFACTURE →
   CUSTOMS_TRANSIT → DELIVERED_STORES → ACCEPTED_INSPECTED), update the
   lifecycle stage and forecast delivery date.  The CPM schedule is
   automatically re-evaluated to reflect any date changes.

Endpoints
~~~~~~~~~

- ``POST /items`` — Register a new procurement line item.
- ``GET /items`` — List all procurement items with optional filtering.
- ``GET /items/{id}`` — Get a single procurement item.
- ``PUT /items/{id}`` — Update a procurement item.
- ``PUT /items/{id}/status`` — Update lifecycle stage and forecast date,
  automatically updating affected schedule start dates.
- ``DELETE /items/{id}`` — Delete a procurement item.
- ``POST /tasks/{task_id}/link-part`` — Bind a procurement item to a WBS task.
- ``GET /tasks/{task_id}/constraints`` — List procurement constraints on a task.
- ``DELETE /tasks/{task_id}/constraints/{constraint_id}`` — Remove a constraint.

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: List procurement items with optional filtering.
* **View**: Get a single procurement item by ID.
* **View**: List all procurement constraints on a specific task.

**Creating New Items**

* **Create**: Register a new procurement line item.
* **Create**: Bind a procurement item to a WBS task as a hard early-start constraint.

**Updating Information**

* **Update**: Update a procurement item.
* **Update**: Update procurement lifecycle stage and forecast arrival date.

**Removing Items**

* **Delete**: Delete a procurement item.
* **Delete**: Remove a procurement constraint from a task.
