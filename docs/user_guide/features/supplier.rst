Supplier Portal
===============


External suppliers use this portal to submit deliverables and communicate with contract managers.

supplier_portal
~~~~~~~~~~~~~~~


Supplier Portal API router — Isolated subcontractor boundary tenant.

This module provides the REST API endpoints for the isolated supplier
portal.  External tier-1/tier-2 subcontractors use these endpoints to
manage their contractual work packages, log progress, submit deliverables,
and upload schedule updates — all without exposure to the prime master
schedule, EVM cost rates, or sibling work packages.

Security Model
~~~~~~~~~~~~~~

Every endpoint enforces the Subcontractor ABAC filter:

1. The user must have ``is_subcontractor_user == True``.
2. The user's ``assigned_vendor_cage`` must match the node's
   ``vendor_cage_code`` in ``custom_attributes``.
3. All returned data has prime EVM cost fields replaced with
   ``'[RESTRICTED]'``.
4. Parent programme hierarchy paths are truncated to show only the
   boundary node and below.

Endpoints
~~~~~~~~~

- ``GET /tasks`` — Returns the filtered subset of contractual boundary
  work packages assigned to the supplier's CAGE code.
- ``POST /tasks/{id}/progress`` — Allows suppliers to log progress
  percentage, remaining duration, and notes.
- ``GET /cdrl`` — Returns the deliverable in-tray with statutory
  countdown clocks and customer status dispositions.
- ``POST /cdrl/{id}/submit`` — Allows suppliers to attach SDRL documents
  directly into the DocumentArtifact vault with automated metadata
  sanitization.
- ``POST /schedule/upload`` — Uploads monthly .xer or .xml schedule
  updates, triggering the automated delta-validation engine.
- ``GET /profile`` — Returns the supplier's profile information.

Data Isolation
~~~~~~~~~~~~~~

Subcontractors can never see:

- Parent programme roots or sibling work packages.
- Prime contractor EVM cost rates (BAC, PV, EV, AC).
- ODAC permissions or internal security caveats.
- Tasks assigned to other vendor CAGE codes.
- Full ltree paths above the boundary node.

Usage
~~~~~

.. code-block:: python

   # Get tasks for a subcontractor
   GET /api/v1/supplier-portal/tasks

   # Log progress on a task
   POST /api/v1/supplier-portal/tasks/{task_id}/progress
   {
   "percent_complete": 45.0,
   "remaining_duration_days": 12.0,
   "notes": "Integration testing in progress"
   }

   # Submit a CDRL deliverable
   POST /api/v1/supplier-portal/cdrl/{cdrl_id}/submit
   {
   "file_name": "radar_test_report.pdf",
   "file_size_bytes": 2048000,
   "mime_type": "application/pdf",
   "sha256_checksum": "abc123...",
   "s3_object_key": "supplier/3K9X2/cdrl/abc123.pdf"
   }

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: Return the filtered subset of contractual boundary work packages.
* **View**: Return the deliverable in-tray for the subcontractor.
* **View**: Return the supplier's profile information.

**Creating New Items**

* **Create**: Log progress percentage, remaining duration, and notes.
* **Create**: Submit an SDRL document into the DocumentArtifact vault.
