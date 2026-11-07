Equipment Management
====================


Track equipment calibration schedules and maintenance requirements.

equipment
~~~~~~~~~


Equipment calibration and maintenance API router.

This module provides JWT-authenticated endpoints for managing the
calibration lifecycle of physical test equipment (ResourceNode ASSETs)
and scheduling maintenance downtime windows.

Endpoints
~~~~~~~~~

* **POST /recalibrate** — Record a completed calibration event, updating
  the equipment's calibration dates and linking the certificate artifact.
* **POST /downtime-windows** — Schedule a maintenance downtime window,
  marking the resource as out of service during the window.
* **GET /{resource_id}/calibration-status** — Query the current calibration
  status of an equipment resource, including expiry countdown and active
  maintenance windows.
* **GET /{resource_id}/maintenance-windows** — List all maintenance windows
  for a resource within a date range.

Access Control
~~~~~~~~~~~~~~

All endpoints require a valid JWT token via the ``get_current_user``
dependency.  The authenticated user must have sufficient clearance to
access the target resource node.

Usage
~~~~~

.. code-block:: bash

   # Record a calibration event
   curl -X POST http://localhost:8000/api/v1/equipment/recalibrate       -H "Authorization: Bearer $TOKEN"       -H "Content-Type: application/json"       -d '{
   "resource_id": "uuid",
   "calibration_date": "2026-10-24",
   "interval_days": 365
   }'

   # Schedule maintenance downtime
   curl -X POST http://localhost:8000/api/v1/equipment/downtime-windows       -H "Authorization: Bearer $TOKEN"       -H "Content-Type: application/json"       -d '{
   "resource_id": "uuid",
   "downtime_start": "2026-11-01T08:00:00Z",
   "downtime_end": "2026-11-03T17:00:00Z",
   "maintenance_type": "SCHEDULED_RECALIBRATION",
   "work_order_reference": "WO-2026-001",
   "technician_name": "J. Smith"
   }'

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: Query the current calibration status of an equipment resource.
* **View**: List maintenance windows for a resource within a date range.

**Creating New Items**

* **Create**: Record a completed calibration event for an equipment resource.
* **Create**: Schedule a maintenance downtime window for a resource.
