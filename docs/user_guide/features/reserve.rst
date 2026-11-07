Management Reserves
===================


Track and govern management reserve budgets. Request drawdowns and monitor remaining reserves.

reserves
~~~~~~~~


Management Reserve API router.

This module provides endpoints for managing Management Reserve (MR) budget
pools and executing formal drawdown transactions.

Management Reserve Workflow
~~~~~~~~~~~~~~~~~~~~~~~~~~~

1. **Create a reserve pool** — When a project or programme is initialised,
   create a Management Reserve pool with an initial contingency budget.
   The pool is held outside the Performance Measurement Baseline (PMB).

2. **Check reserve status** — At any time, query the reserve status to see
   the current balance, total amounts drawn down and returned, and the full
   transaction history.

3. **Execute a drawdown** — When a risk materialises, execute a formal
   drawdown to transfer funds from the reserve to a specific work package.
   This requires an approved BaselineChangeRequest (Tier 2 or Tier 3) and
   atomically updates the pool balance, the work package's BAC, and the
   forensic audit log.

Endpoints
~~~~~~~~~

- ``GET /projects/{project_id}/reserve-status`` — Returns the reserve pool
  details, current balance, total drawn down, and transaction history.
- ``POST /pool`` — Creates a new Management Reserve pool for a project.
- ``POST /drawdown`` — Executes an authorised reserve drawdown, transferring
  funds from the reserve to a work package.

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: Get the current status of a project's Management Reserve.

**Creating New Items**

* **Create**: Create a new Management Reserve pool for a project.
* **Create**: Execute an authorised Management Reserve drawdown.
