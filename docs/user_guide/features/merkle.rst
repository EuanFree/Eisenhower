Data Synchronisation
====================


Synchronise data across multiple sites using Merkle tree verification to ensure data integrity.

merkle_sync
~~~~~~~~~~~


Merkle tree synchronization router for offline multi-site reconciliation.

This module provides the API endpoints for synchronising disconnected
air-gapped instances of the Eisenhower Portfolio Manager using
cryptographic Merkle trees.

Endpoints
---------

All endpoints are JWT-authenticated and require the caller to have
sufficient clearance to access the target programme sub-tree.

**GET /api/v1/merkle-sync/manifest**
   Generate and return the current Merkle tree manifest for a programme
   sub-tree.  The root hash can be compared with a manifest from another
   site to determine if the two instances are in sync.

**POST /api/v1/merkle-sync/reconcile-delta**
   Ingest an offline ``.merklepack`` bundle and reconcile it with the
   local database using three-way version tracking.  Conflicts are
   staged into isolated SandboxScenarios for review.

**POST /api/v1/merkle-sync/compare**
   Compare a remote Merkle manifest against the local state and return
   a detailed divergence report.

**POST /api/v1/merkle-sync/export-delta**
   Export only the divergent records as a signed ``.merklepack`` file
   for transfer to another air-gapped site.

Usage
~~~~~

.. code-block:: bash

   # Generate local manifest
   curl -H "Authorization: Bearer $TOKEN"          "http://localhost:8000/api/v1/merkle-sync/manifest?root_node_id=$UUID"

   # Ingest remote delta pack
   curl -H "Authorization: Bearer $TOKEN"          -F "file=@remote.merklepack"          "http://localhost:8000/api/v1/merkle-sync/reconcile-delta"
