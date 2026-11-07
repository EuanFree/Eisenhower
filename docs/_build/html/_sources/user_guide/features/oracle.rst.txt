Oracle Integration
==================


Integrate with Oracle ERP for timesheet and financial data.

oracle_timesheets
~~~~~~~~~~~~~~~~~


Oracle timesheet and ERP export API router.

This module provides the REST API endpoints for the timesheet pre-population
engine and Oracle ERP export staging service.  It bridges the Eisenhower
Portfolio Manager's internal scheduling system with Oracle EBS cost accounting.

Endpoints Overview
~~~~~~~~~~~~~~~~~~

The router is mounted at ``/api/v1/timesheets/oracle`` and provides:

- **GET /prepopulate** — Pre-populate a user's weekly timesheet from active
  CPM assignments.  Returns scheduled hours for each working day so the user
  can confirm or adjust rather than entering from scratch.

- **POST /batches/create** — Close an approved weekly period and generate
  an export batch.  This creates a TimesheetOracleExportBatch record and
  prepares the staging payload.

- **GET /batches/{id}/download** — Stream the formatted Oracle staging
  payload (CSV) for a given batch.  Classified task names are automatically
  replaced with sanitised cost-code identifiers.

- **GET /batches/{id}** — Get the details of an export batch including
  status, period, and record count.

Authentication
~~~~~~~~~~~~~~

All endpoints require a valid JWT token.  The authenticated user's identity
is used to determine which timesheet data to return and to record audit
trail entries.

Data Sanitization
~~~~~~~~~~~~~~~~~

When generating Oracle staging payloads, classified task names (SECRET or
higher) are automatically replaced with their Oracle cost-code identifiers.
This prevents classified information from leaking into the ERP system.

For example, a task named "CLASSIFIED AVIONICS INTEGRATION" with Oracle
task number "10.02.01" will appear in the export as "Task 10.02.01".

Dependencies
~~~~~~~~~~~~

These endpoints require a live PostgreSQL instance to query ResourceAssignments,
PortfolioNodes, and OracleProjectMappings.

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: Pre-populate the authenticated user's weekly timesheet from active CPM assignments.
* **View**: Download the Oracle EBS staging payload for a given export batch.
* **View**: Get the details of an Oracle export batch.

**Creating New Items**

* **Create**: Close an approved weekly period and generate an Oracle export batch.
