Schedule Management
===================


Plan and track project timelines using the Critical Path Method. Set dependencies between tasks, identify critical paths, and analyse schedule risk with Monte Carlo simulations.

Schedule Clashes
~~~~~~~~~~~~~~~~


Schedule clash detection and resource leveling router.

Provides endpoints for:

- **Listing active clashes** — Retrieve unresolved schedule conflicts
  detected by the clash daemon, filtered by severity.
- **Running a portfolio sweep** — Trigger a new audit pass to detect
  resource overallocations, clearance lapses, facility collisions,
  negative float slips, and predecessor violations.
- **Computing a leveling proposal** — Run the Burgess-Killebrew
  heuristic to propose date shifts that resolve overallocations
  without extending the critical path.
- **Applying leveling** — Commit signed-off leveling shifts to the
  database in an atomic transaction.

Sub-Tree Locking
~~~~~~~~~~~~~~~~

The ``POST /apply-leveling`` endpoint acquires a sub-tree lock before
committing date shifts.  This prevents concurrent mutations from
interfering with the leveling process.  If a lock is already held,
HTTP 423 (Locked) is returned.

All endpoints require JWT authentication.

Schedule
~~~~~~~~


Schedule recalculation and export router.

Provides the CPM (Critical Path Method) recalculation endpoint, Monte Carlo
Schedule Risk Analysis, and schedule export endpoints for Primavera P6 (.xer)
and Microsoft Project (.xml) formats.  Export endpoints support defence export
sanitization options to redact classified data and mask commercial rates.

Sub-Tree Locking
~~~~~~~~~~~~~~~~

The CPM recalculation endpoint acquires a sub-tree lock before running the
forward and backward passes.  This prevents concurrent mutations (e.g., a
user editing node dates) from corrupting the calculation.  If a lock is
already held, HTTP 423 (Locked) is returned.

schedule_quarantine
~~~~~~~~~~~~~~~~~~~


Schedule quarantine buffer API router.

This module provides the REST API endpoints for the schedule quarantine
buffer system. Incoming schedule files (.xer or .xml) are uploaded into
a quarantine staging area where automated integrity checks run before
any data is merged into the active master schedule.

Endpoints
---------
- ``POST /upload`` — Upload a schedule file into quarantine staging.
- ``GET /{id}/issues`` — Return detected cycles, dangling activities,
  and calendar clashes.
- ``POST /{id}/remediate`` — Submit graph healing choices.
- ``POST /{id}/commit`` — Merge sanitized batch into active schedule.

Security
--------
All endpoints require JWT authentication via the ``get_current_user``
dependency. The uploading user must have sufficient clearance to access
the target project.

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: List active schedule clashes.
* **View**: Export project schedule to Primavera P6 .xer format.
* **View**: Export project schedule to Microsoft Project XML format.
* **View**: Return detected quarantine issues for a batch.

**Creating New Items**

* **Create**: Run a portfolio clash sweep.
* **Create**: Compute resource leveling proposal.
* **Create**: Apply signed-off leveling shifts.
* **Create**: Mark a clash as resolved.
* **Create**: Recalculate CPM schedule for a project.
* **Create**: Run Monte Carlo Schedule Risk Analysis.
* **Create**: Upload a schedule file into quarantine staging.
* **Create**: Submit graph healing choices for a quarantine batch.
* **Create**: Merge a sanitized quarantine batch into the active master schedule.
