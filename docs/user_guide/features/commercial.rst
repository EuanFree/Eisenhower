Commercial Governance
=====================


Manage contracts, fiscal caps, and commercial acceptance processes.

commercial
~~~~~~~~~~


Commercial governance API endpoints.

This module provides the REST API endpoints for contractual pricing
mechanisms, fiscal year spending cap monitoring, and formal Government
milestone acceptance gates.

Endpoints
~~~~~~~~~

Contract Structure
^^^^^^^^^^^^^^^^^^

- **POST /contracts** — Create a new project contract structure.
- **GET /contracts/{project_id}** — Retrieve the contract structure for
  a project.
- **PUT /contracts/{project_id}** — Update an existing contract structure.
- **DELETE /contracts/{project_id}** — Delete a contract structure.

TCIF Fee Adjustment
^^^^^^^^^^^^^^^^^^^

- **POST /contracts/{project_id}/tcif-fee-adjustment** — Calculate the
  Target Cost Incentive Fee (TCIF) fee adjustment for a given projected
  cost.

Fiscal Year Spending Caps
^^^^^^^^^^^^^^^^^^^^^^^^^

- **POST /fiscal-caps** — Create a new fiscal year spending cap.
- **GET /fiscal-caps/{control_account_id}** — List all fiscal year caps
  for a control account.
- **PUT /fiscal-caps/{cap_id}** — Update an existing fiscal year cap.
- **DELETE /fiscal-caps/{cap_id}** — Delete a fiscal year cap.
- **POST /fiscal-caps/{control_account_id}/validate** — Validate the
  fiscal year spend profile against allocated caps.

Government Acceptance Milestones
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- **POST /acceptance** — Create a new government acceptance milestone.
- **GET /acceptance/{node_id}** — List all acceptance milestones for a
  deliverable.
- **PUT /acceptance/{milestone_id}** — Update an acceptance milestone
  (e.g., sign off as ACCEPTED).
- **DELETE /acceptance/{milestone_id}** — Delete an acceptance milestone.

Access Control
~~~~~~~~~~~~~~

All endpoints require JWT authentication via the ``get_current_user``
dependency.  The authenticated user must have sufficient clearance to
access the underlying portfolio nodes.

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: Get project contract structure.
* **View**: List fiscal year spending caps.
* **View**: List acceptance milestones.

**Creating New Items**

* **Create**: Create a project contract structure.
* **Create**: Calculate TCIF fee adjustment.
* **Create**: Create fiscal year spending cap.
* **Create**: Validate fiscal year spend profile.
* **Create**: Create government acceptance milestone.

**Updating Information**

* **Update**: Update project contract structure.
* **Update**: Update fiscal year spending cap.
* **Update**: Update acceptance milestone.

**Removing Items**

* **Delete**: Delete project contract structure.
* **Delete**: Delete fiscal year spending cap.
* **Delete**: Delete acceptance milestone.
