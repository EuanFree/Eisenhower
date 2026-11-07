Air-Gap Data Exchange
=====================


Securely transfer data between air-gapped environments using encrypted data packages.

airgap
~~~~~~


API router for the offline cross-domain data exchange (airgap) module.

This module exposes the endpoints for exporting and importing ``.defpack``
bundles between air-gapped systems.  These endpoints enable secure data
transfer between sovereign networks that share no live connectivity — for
example, from an unclassified development environment to a classified
operational environment.

Endpoints
---------

POST /api/v1/airgap/export
   Generate a signed and encrypted ``.defpack`` bundle for a project
   sub-tree.  Nodes classified above the target ceiling are redacted.
   The bundle is streamed as a file download.

POST /api/v1/airgap/import
   Ingest an uploaded ``.defpack`` file into the target air-gapped
   PostgreSQL instance.  Performs signature verification, schema
   validation, replay attack detection, and ltree reparenting.
   Returns an import validation report.

Sub-Tree Locking
~~~~~~~~~~~~~~~~

The ``POST /import`` endpoint acquires a sub-tree lock before merging
imported nodes into the target database.  This prevents concurrent
mutations from interfering with the ltree reparenting process.
If a lock is already held, HTTP 423 (Locked) is returned.

Security Considerations
-----------------------

- Both endpoints require a valid JWT token via the ``get_current_user``
  dependency.
- The export endpoint enforces that the user's clearance meets or exceeds
  the requested classification ceiling.
- The import endpoint verifies the package signature, validates the JSON
  schema, checks for duplicate transaction IDs (replay attack prevention),
  and verifies the importer's clearance.
- Every export and import is logged in the ForensicAuditLog with the
  user's identity and the classification marking.

Usage
~~~~~

   # Export a .defpack bundle:
   POST /api/v1/airgap/export
   {
   "project_id": "uuid...",
   "classification_ceiling": "SECRET"
   }

   # Import an uploaded .defpack bundle:
   POST /api/v1/airgap/import
   (multipart form with .defpack file and optional parent_node_id)

What You Can Do
~~~~~~~~~~~~~~~

**Creating New Items**

* **Create**: Export a project as a .defpack bundle.
* **Create**: Import a .defpack bundle.
