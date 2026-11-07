Data Export
===========


Export project data to various formats including Excel, Primavera P6, and Microsoft Project.

export
~~~~~~


Export API Router.

This module provides API endpoints for exporting GUI views to PNG images
and PowerPoint slides, and for generating template-based reports in
Word and PowerPoint formats.

Endpoints
~~~~~~~~~

- ``POST /api/v1/export/view`` — Export a GUI view to PNG or PowerPoint.
- ``POST /api/v1/export/report`` — Generate a template-based report.
- ``GET /api/v1/export/templates`` — List available report templates.
- ``GET /api/v1/export/view-types`` — List supported view types.

Security
~~~~~~~~

All endpoints require JWT authentication.  The caller must have sufficient
clearance to access the data being exported.  Classification markings are
automatically applied to exported documents.

Usage
~~~~~

   # Export a view to PNG
   POST /api/v1/export/view
   {
   "view_type": "dashboard",
   "format": "png",
   "project_id": "uuid"
   }

   # Generate a Word report
   POST /api/v1/export/report
   {
   "template_type": "programme_status",
   "format": "docx",
   "project_id": "uuid"
   }

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: List available report templates.
* **View**: List supported view types for export.

**Creating New Items**

* **Create**: Export a GUI view to PNG or PowerPoint format.
* **Create**: Generate a template-based report in Word or PowerPoint format.
