Earned Value Management
=======================


Track project performance using Earned Value Management metrics. Monitor cost and schedule variance, and forecast final costs.

evm
~~~


EVM (Earned Value Management) API router.

This module provides the REST API endpoints for ANSI/EIA-748 Earned Value
Management.  It enables programme managers to:

- View S-Curve data for charting cumulative PV, EV, and AC over time.
- Inspect task-level EVM breakdowns with variances and performance indices.
- Manage milestone weight steps for the MILESTONE_WEIGHTS EVM technique.
- Verify milestone checkpoints, triggering automatic EV recalculation.

S-Curve Charting
~~~~~~~~~~~~~~~~

The S-Curve endpoint returns time-phased data points that the frontend
can plot as cumulative curves.  Three lines are typically shown:

- **Planned Value (PV)** — The baseline schedule in monetary terms.
- **Earned Value (EV)** — The actual work performed in budgeted terms.
- **Actual Cost (AC)** — The real cost incurred.

The gap between PV and EV shows schedule variance, while the gap between
EV and AC shows cost variance.

Milestone Weight Steps
~~~~~~~~~~~~~~~~~~~~~~

For tasks using the MILESTONE_WEIGHTS EVM technique, milestone steps
define the checkpoints at which EV is earned.  Each step has a weight
fraction, and the sum of all weights must equal 1.000.

When a milestone is verified as passed, the task's EV is automatically
recalculated based on the sum of verified weights.

Authentication
~~~~~~~~~~~~~~

All endpoints require JWT authentication via the ``get_current_user``
dependency.  Users must have appropriate clearance to access the
portfolio nodes they query.

Endpoints
~~~~~~~~~

- ``GET /projects/{id}/s-curve-data`` — S-Curve charting data.
- ``GET /projects/{id}/evm-rollup`` — Hierarchical EVM rollup.
- ``GET /tasks/{id}/cost-breakdown`` — Task-level EVM breakdown.
- ``POST /tasks/{id}/calculate-ev`` — Recalculate EV for a task.
- ``GET /tasks/{id}/milestone-steps`` — List milestone weight steps.
- ``POST /tasks/{id}/milestone-steps`` — Create a milestone step.
- ``PUT /tasks/{id}/milestone-steps/{step_id}`` — Update a milestone step.
- ``DELETE /tasks/{id}/milestone-steps/{step_id}`` — Delete a milestone step.
- ``POST /tasks/{id}/milestone-steps/{step_id}/verify`` — Verify a milestone.

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: Retrieve time-phased S-Curve data for a project.
* **View**: Retrieve hierarchical EVM rollup for a project.
* **View**: Retrieve the complete EVM breakdown for a single task.
* **View**: List all milestone weight steps for a task.

**Creating New Items**

* **Create**: Recalculate Earned Value for a task using its assigned EVM technique.
* **Create**: Create a new milestone weight step for a task.
* **Create**: Verify a milestone step as passed.

**Updating Information**

* **Update**: Update an existing milestone weight step.

**Removing Items**

* **Delete**: Delete a milestone weight step.
