Cost Management
===============


Plan and track project costs. Set budgets, record actual costs, and roll up cost data across the project hierarchy.

costing
~~~~~~~


Costing API router for the Cost Breakdown Structure (CBS) module.

This router provides endpoints for managing the financial side of the
portfolio management system.  It covers three areas:

1. **Cost Element Management** — CRUD operations for the CBS taxonomy
   (the catalogue of cost types: labour, materials, subcontract, ODC).

2. **Indirect Rate Structure Management** — CRUD operations for FPRA
   (Forward Pricing Rate Agreement) rate structures that define the
   burdening cascade for each fiscal year.

3. **Cost Queries** — Endpoints to retrieve task-level cost breakdowns
   and multi-tier CBS financial rollups across the WBS hierarchy.

Authentication
~~~~~~~~~~~~~~

All endpoints require a valid JWT token via the ``get_current_user``
dependency.  Only authenticated users can access costing data.

URL Structure
~~~~~~~~~~~~~

All endpoints are mounted under ``/api/v1/costing``:

- ``GET    /elements`` — List all cost elements.
- ``POST   /elements`` — Create a new cost element.
- ``GET    /elements/{id}`` — Get a single cost element.
- ``PUT    /elements/{id}`` — Update a cost element.
- ``DELETE /elements/{id}`` — Delete a cost element.
- ``GET    /rates`` — List all indirect rate structures.
- ``POST   /rates`` — Create a new indirect rate structure.
- ``GET    /rates/{id}`` — Get a single rate structure.
- ``PUT    /rates/{id}`` — Update a rate structure.
- ``GET    /tasks/{id}/cost-breakdown`` — Get task cost breakdown.
- ``GET    /projects/{id}/cbs-rollup`` — Get multi-tier CBS rollup.

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: List all cost elements in the CBS taxonomy.
* **View**: Get a single cost element by ID.
* **View**: List all indirect rate structures (FPRA records).
* **View**: Get a single indirect rate structure by ID.
* **View**: Return the unburdened vs. burdened cost tiers for a single task.
* **View**: Return the multi-tier CBS financial rollup across cost elements.

**Creating New Items**

* **Create**: Create a new cost element in the CBS taxonomy.
* **Create**: Create a new FPRA indirect rate structure.

**Updating Information**

* **Update**: Update an existing cost element.
* **Update**: Update an existing indirect rate structure.

**Removing Items**

* **Delete**: Delete a cost element.
