Document Vault
==============


Store and retrieve project documents in a secure vault with version control and access restrictions.

artifacts
~~~~~~~~~


API router for the classified document vault and evidence attachment service.

This module exposes the endpoints for uploading, confirming, and downloading
classified documents through the S3-compatible object store.  All endpoints
require JWT authentication and enforce ABAC clearance checks and export
control interlocks.

Endpoints
---------

POST /api/v1/artifacts/request-upload
   Prepare artifact metadata and emit a pre-signed S3 PUT URL for upload.

POST /api/v1/artifacts/confirm-upload
   Validate S3 object existence, verify SHA-256 digest, and mark artifact
   as active and available for download.

GET /api/v1/artifacts/{artifact_id}/download-url
   Emit an authenticated pre-signed S3 GET URL valid for 60 seconds.

GET /api/v1/artifacts/
   List all artifacts accessible to the current user based on clearance.

Security Considerations
-----------------------

- All endpoints require a valid JWT token via the ``get_current_user`` dependency.
- Upload requests are validated against the user's clearance level — a user
  cannot upload a document classified above their clearance.
- Download URLs are only issued after ABAC clearance and export control checks
  pass.  URLs expire after 60 seconds to minimise data exfiltration risk.
- Every download is logged in the ForensicAuditLog with the user's identity
  and the artifact's classification marking.

Usage
~~~~~

   # Request an upload URL:
   POST /api/v1/artifacts/request-upload
   {
   "file_name": "safety-report.pdf",
   "file_size_bytes": 1048576,
   "mime_type": "application/pdf",
   "security_classification": "SECRET",
   "export_control_regime": "ITAR"
   }

   # After uploading to the returned URL, confirm:
   POST /api/v1/artifacts/confirm-upload
   {
   "artifact_id": "uuid...",
   "sha256_checksum": "abc123..."
   }

   # Request a download URL:
   GET /api/v1/artifacts/{artifact_id}/download-url

What You Can Do
~~~~~~~~~~~~~~~

**Viewing Information**

* **View**: Generate a pre-signed download URL.
* **View**: List accessible artifacts.

**Creating New Items**

* **Create**: Request a pre-signed upload URL.
* **Create**: Confirm a completed upload.
