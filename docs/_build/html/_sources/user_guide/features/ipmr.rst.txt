IPMR Reports
============


Generate Integrated Program Management Report (IPMR) documents for programme oversight.

ipmr_reports
~~~~~~~~~~~~


IPMR/CPR EVM Report Export Router.

This module provides the API endpoints for generating and exporting
statutory Earned Value Management (EVM) reports compliant with the
Integrated Program Management Report (IPMR) / Cost Performance Report
(CPR) Formats 1 through 5.

Endpoints
~~~~~~~~~

All endpoints are JWT-authenticated and require the caller to have
sufficient clearance to access the programme data.

- **GET /ipmr/format1**: Emits Format 1 WBS spreadsheet for the selected
  reporting month.  Returns BCWS (PV), BCWP (EV), and ACWP (AC) data
  for each WBS element with derived variances and indices.

- **GET /ipmr/format5**: Emits variance narrative report pre-populated
  with active blocker logs.  Auto-extracts tasks exceeding predefined
  variance thresholds and generates Problem/Cause, Impact, and
  Corrective Action Plan narratives.

Export Formats
~~~~~~~~~~~~~~

Reports can be exported in two formats:

- **XLSX** (default): OpenPyXL-formatted spreadsheet with defence table
  styling, locked header bands, and formula integrity.

- **PDF**: Hardened PDF export with embedded vector styles for
  executive submission.

Usage
~~~~~

   # Generate Format 1 report as Excel
   GET /api/v1/reports/evm/ipmr/format1?project_id={uuid}&reporting_period=2026-10&status_date=2026-10-24

   # Generate Format 5 report as PDF
   GET /api/v1/reports/evm/ipmr/format5?project_id={uuid}&reporting_period=2026-10&status_date=2026-10-24&export_format=pdf

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: Generate and export IPMR Format 1 WBS time-phased matrix report.
* **View**: Generate and export IPMR Format 5 Variance Analysis Narrative report.
