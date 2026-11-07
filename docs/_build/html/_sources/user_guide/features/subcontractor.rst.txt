Subcontractor Management
========================


Manage subcontractor schedules and submissions. Ingest and reconcile subcontractor data.

subcontractors
~~~~~~~~~~~~~~


Subcontractor schedule submission API router.

This module provides the REST API endpoints for the subcontractor
schedule ingest pipeline.  It allows defence subcontractors to submit
schedule updates (Primavera P6 .xer or MS Project .xml) for integration
into the prime contractor's master programme.

The ingest pipeline ensures that external schedule data is validated
against contractual boundary gates before being merged into the live
WBS.  This prevents milestone slippage, logic tampering, and negative
float inflation from subcontractor submissions.

Endpoints
~~~~~~~~~

- ``POST /submissions/upload`` — Upload a schedule file and trigger
  automated validation against contractual boundary gates.
- ``GET /submissions/{id}/validation-report`` — Retrieve the automated
  compliance score and boundary breach report for a submission.
- ``POST /submissions/{id}/approve-merge`` — Approve a validated
  submission and merge it into the live WBS.
- ``GET /submissions`` — List all submissions with optional filtering.
- ``GET /submissions/{id}`` — Get a single submission by ID.
- ``POST /submissions/{id}/staging-diff`` — Generate the staging diff
  showing the impact of merging the submission.

Workflow
~~~~~~~~

1. A subcontractor (or prime contractor on their behalf) uploads a
   schedule file via ``POST /submissions/upload``.

2. The system parses the file, extracts tasks and dependencies, and
   runs automated DCMA checks against the contractual boundary gates.

3. The validation report is retrieved via
   ``GET /submissions/{id}/validation-report``.  If critical breaches
   are found, the submission is rejected and cannot be merged.

4. If validation passes, the staging diff is generated via
   ``POST /submissions/{id}/staging-diff`` to show the impact on
   the prime schedule.

5. A human reviewer examines the staging diff and approves the merge
   via ``POST /submissions/{id}/approve-merge``.

6. The merge is recorded in the ForensicAuditLog with action type
   ``SUBCONTRACTOR_MERGE``.

Security
~~~~~~~~

All endpoints require JWT authentication.  The submitting user must
have sufficient security clearance to access the target WBS node
(checked via ABAC).  Submissions can only be merged by users with
Manager or Admin role.

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: Retrieve the automated validation report for a submission.
* **View**: List all subcontractor submissions with optional filtering.
* **View**: Get a single submission by ID.

**Creating New Items**

* **Create**: Upload a subcontractor schedule file and trigger automated validation.
* **Create**: Approve a validated submission and merge it into the live WBS.
* **Create**: Generate the staging diff for a submission.
