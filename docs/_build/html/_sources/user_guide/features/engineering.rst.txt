Engineering Governance
======================


Manage engineering concessions, design assurance levels, and gate reviews.

engineering
~~~~~~~~~~~


Engineering governance API router.

This module provides the REST API endpoints for systems engineering
safety governance, including the technical concessions ledger and
DAL/SIL signoff gate evaluation.

Endpoints
~~~~~~~~~

- **POST /concessions** — Create a new engineering concession record.
- **GET /concessions** — List concessions with optional filtering by
  node, disposition, or safety significance.
- **GET /concessions/{id}** — Get a single concession record.
- **PUT /concessions/{id}** — Update an existing concession (e.g.,
  change disposition, assign engineer).
- **DELETE /concessions/{id}** — Delete a concession record.
- **GET /tasks/{id}/safety-gate-status** — Evaluate the DAL compliance
  checklist for a task and return gating statuses.
- **POST /tasks/{id}/safety-vector** — Compute the compromised safety
  vector for a given schedule slip.

Access Control
~~~~~~~~~~~~~~

All endpoints require JWT authentication.  Concession creation and
update require the user to be a Lead Systems Engineer or Admin.
Safety gate evaluation is available to all cleared users.

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: List engineering concessions with optional filtering.
* **View**: Get a single engineering concession record.
* **View**: Evaluate the DAL compliance safety gate status for a task.

**Creating New Items**

* **Create**: Create a new engineering concession record.
* **Create**: Compute the compromised safety vector for a schedule slip.

**Updating Information**

* **Update**: Update an existing engineering concession.

**Removing Items**

* **Delete**: Delete an engineering concession record.
