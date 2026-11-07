Programme Management
====================


Manage programme lifecycle from initiation through closeout. Archive completed programmes for long-term storage.

programmes
~~~~~~~~~~


Programme closeout and cold-storage archival endpoints.

This module provides the API endpoints for long-term programme closeout
and tamper-evident WORM (Write-Once-Read-Many) cold-storage sealing.

When a defence programme reaches its end of life, it must be formally
closed out and sealed for long-term archival.  The sealing process:

1. Deactivates all nodes in the programme sub-tree.
2. Exports all programme data into a self-contained archive package.
3. Generates a SHA-256 manifest of all archived entities.
4. Creates a ProgrammeArchiveSeal record linking the audit chain head
   to the archive manifest hash.

At any future date, the archive integrity can be verified by re-computing
hashes and confirming the audit log chain links to the seal's head.

Endpoints
---------

POST /api/v1/programmes/{programme_id}/seal
   Seal a programme for WORM cold-storage archival.

POST /api/v1/programmes/archive/verify
   Verify the tamper-evident integrity of an archive package.

GET /api/v1/programmes/{programme_id}/seal
   Retrieve the seal record for a programme (if one exists).
