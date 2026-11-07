Audit Trail
===========


View the immutable audit trail of all data changes. Verify chain integrity and investigate modifications.

audit
~~~~~


Audit integrity verification and forensic investigation router.

This module exposes three endpoints for proving non-repudiation of the
SHA-256 chained forensic audit log:

1. **POST /verify-integrity** — Runs a full-chain verification sweep that
   recalculates every entry's hash and compares it against the stored value.
   Returns an audit certificate suitable for sovereign security compliance
   boards.

2. **GET /entities/{entity_id}/history** — Returns the complete chronological
   forensic timeline for any entity (PortfolioNode, DependencyLink,
   ResourceAssignment, etc.), showing who modified what, from which IP, and
   under which security caveats.

3. **GET /export-signed-ledger** — Streams a digitally signed ZIP archive
   containing the full audit ledger, verification certificate, SHA-256
   manifest, and signature file.

Access Control
~~~~~~~~~~~~~~

All endpoints require JWT authentication via :func:`get_current_user`.
These are administrative endpoints intended for use by security compliance
officers and internal auditors.

Endpoints
~~~~~~~~~

- ``POST /api/v1/audit/verify-integrity`` — Full-chain verification sweep.
- ``GET /api/v1/audit/entities/{entity_id}/history`` — Entity forensic timeline.
- ``GET /api/v1/audit/export-signed-ledger`` — Signed audit bundle download.
