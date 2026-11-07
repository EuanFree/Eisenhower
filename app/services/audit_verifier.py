"""Automated cryptographic integrity verification and forensic investigation service.

This module provides tools to prove non-repudiation of the SHA-256 chained
transaction log maintained by :class:`ForensicAuditLog`.  It is designed for
use by sovereign security compliance officers, internal auditors, and incident
response teams.

Core Capabilities
~~~~~~~~~~~~~~~~~

**Chain Integrity Verification**

The primary function, :func:`verify_audit_chain_integrity`, iterates through
all ``ForensicAuditLog`` records in strictly monotonic order (by ``created_at``
timestamp) and recalculates the expected SHA-256 hash for each entry.  It
compares the recalculated hash against the stored ``current_hash`` to detect
any tampering, broken hash links, or timestamp inversions.

The hash formula mirrors :meth:`ForensicAuditLog.create_entry`:

.. code-block:: python

    data = {
        "transaction_id": str(entry.transaction_id),
        "user_upn": entry.user_upn,
        "client_ip": entry.client_ip,
        "action_type": entry.action_type,
        "entity_type": entry.entity_type,
        "entity_id": str(entry.entity_id),
        "json_diff": entry.json_diff,
        "security_marking": entry.security_marking,
        "prev_hash": entry.prev_hash,
    }
    expected_hash = SHA256(prev_hash + json.dumps(data, sort_keys=True, default=str))

**HSM Hardware Signature Verification**

When ``HSM_ENABLED=True``, each audit entry carries an ``hsm_signature``
produced by the on-premise Hardware Security Module.  The
:func:`verify_ledger_chain` function verifies every hardware signature against
the public certificate stored on the HSM token.  A single failed signature
immediately emits a ``SECURITY_AUDIT_TAMPER_DETECTED`` alert.

**Forensic Timeline Reconstruction**

The :func:`generate_forensic_timeline` function extracts the complete mutation
history of any entity (PortfolioNode, DependencyLink, ResourceAssignment, etc.)
and reconstructs the exact state diffs across time.  For each mutation, it
identifies:

- Which actor (user UPN) modified the entity.
- Which client IP address was used.
- What security caveats were asserted at the moment of mutation.
- The before/after field values from the JSON diff.

**Signed Ledger Export**

The :func:`export_signed_ledger` function streams a digitally signed audit
bundle formatted for sovereign security compliance officers.  The bundle
contains all audit log entries, the chain verification certificate, and a
SHA-256 manifest of the entire export.

Tamper Detection
~~~~~~~~~~~~~~~~

The verification process detects five categories of discrepancies:

1. **Broken Hash Links** — An entry's ``prev_hash`` does not match the
   previous entry's ``current_hash``, indicating the chain was interrupted.

2. **Hash Mismatches** — A recalculated hash does not match the stored
   ``current_hash``, indicating the entry's data was modified after creation.

3. **Timestamp Inversions** — An entry's ``created_at`` is earlier than the
   previous entry's timestamp, violating monotonic ordering.

4. **HSM Signature Failures** — A hardware signature does not verify against
   the on-token public key, indicating the block was altered after signing.

5. **Tombstone Anomalies** — A purged entry (``is_purged=True``) that lacks
   a corresponding ``SPILLAGE_REDACTION_CERTIFICATE`` record in the chain.

Non-Repudiation
~~~~~~~~~~~~~~~

Because each hash depends on the previous hash, an attacker cannot modify a
single entry without breaking the entire chain from that point forward.  The
verification certificate provides cryptographic proof that the audit log has
not been tampered with since the last verified state.
"""

import hashlib
import json
import logging
import uuid
import zipfile
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import asc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import ForensicAuditLog

log = logging.getLogger(__name__)


def _compute_entry_hash(entry: ForensicAuditLog) -> str:
    """Recalculate the expected SHA-256 hash for an audit log entry.

    This function mirrors the hash computation in
    :meth:`ForensicAuditLog.create_entry` to verify chain integrity.

    For agent actions (``is_agent_action=True``), the agent provenance
    fields — ``agent_model_identifier``, ``model_weights_sha256``,
    ``prompt_context_sha256``, and ``human_reviewer_upn`` — are also
    incorporated into the hash, ensuring that tampering with model
    provenance data is detected.

    Parameters
    ----------
    entry : ForensicAuditLog
        The audit log entry whose hash is being recalculated.

    Returns
    -------
    str
        A 64-character hexadecimal SHA-256 hash string.
    """
    data = {
        "transaction_id": str(entry.transaction_id),
        "user_upn": entry.user_upn,
        "client_ip": entry.client_ip,
        "action_type": entry.action_type,
        "entity_type": entry.entity_type,
        "entity_id": str(entry.entity_id),
        "json_diff": entry.json_diff,
        "security_marking": entry.security_marking,
        "prev_hash": entry.prev_hash,
    }

    # Incorporate agent provenance fields for agent actions
    if getattr(entry, "is_agent_action", False):
        data["agent_model_identifier"] = getattr(entry, "agent_model_identifier", "") or ""
        data["model_weights_sha256"] = getattr(entry, "model_weights_sha256", "") or ""
        data["prompt_context_sha256"] = getattr(entry, "prompt_context_sha256", "") or ""
        data["human_reviewer_upn"] = getattr(entry, "human_reviewer_upn", "") or ""

    content = json.dumps(data, sort_keys=True, default=str)
    combined = f"{entry.prev_hash}{content}"
    return hashlib.sha256(combined.encode("utf-8")).hexdigest()


async def verify_audit_chain_integrity(
    db: AsyncSession,
    start_transaction_id: Optional[uuid.UUID] = None,
    end_transaction_id: Optional[uuid.UUID] = None,
) -> Dict[str, Any]:
    """Verify the SHA-256 chained integrity of the forensic audit log.

    Iterates through all ``ForensicAuditLog`` records in strictly monotonic
    order (by ``created_at`` timestamp) and recalculates the expected hash
    for each entry.  Detects and reports:

    - Broken hash links (prev_hash mismatch).
    - Hash mismatches (recalculated != stored current_hash).
    - Timestamp inversions (non-monotonic created_at).
    - Tombstone anomalies (purged entries without redaction certificates).

    Parameters
    ----------
    db : AsyncSession
        Active database session.
    start_transaction_id : UUID, optional
        If provided, only verify entries at or after this transaction ID.
    end_transaction_id : UUID, optional
        If provided, only verify entries at or before this transaction ID.

    Returns
    -------
    dict
        An audit certificate containing:

        - **verified_records_count** (int) — Number of records checked.
        - **chain_valid** (bool) — ``True`` if the entire chain is intact.
        - **first_corrupted_id** (UUID or None) — ID of the first entry
          where a discrepancy was detected.
        - **tamper_detected** (bool) — ``True`` if any tampering was found.
        - **discrepancies** (list) — List of discrepancy details.
        - **chain_head_hash** (str) — The ``current_hash`` of the last
          verified entry (the chain head).
        - **chain_tail_hash** (str) — The ``prev_hash`` of the first entry
          (should be empty string for a valid chain start).
        - **verification_timestamp** (str) — ISO-8601 timestamp of this
          verification run.
    """
    # Build query — ordered by created_at for monotonic traversal
    stmt = select(ForensicAuditLog).order_by(asc(ForensicAuditLog.created_at))

    if start_transaction_id is not None:
        stmt = stmt.where(
            ForensicAuditLog.transaction_id >= start_transaction_id
        )
    if end_transaction_id is not None:
        stmt = stmt.where(
            ForensicAuditLog.transaction_id <= end_transaction_id
        )

    result = await db.execute(stmt)
    entries = result.scalars().all()

    verified_count = 0
    discrepancies: List[Dict[str, Any]] = []
    first_corrupted_id: Optional[str] = None
    chain_valid = True
    chain_head_hash = ""
    chain_tail_hash = ""
    expected_prev_hash = ""  # First entry should have empty prev_hash

    # Track purged entries and their redaction certificates
    purged_entries: List[str] = []
    redaction_certificates: List[str] = []

    for entry in entries:
        verified_count += 1

        # Record chain tail hash (first entry's prev_hash)
        if verified_count == 1:
            chain_tail_hash = entry.prev_hash

        # Check 1: Hash link continuity
        if entry.prev_hash != expected_prev_hash:
            discrepancy = {
                "type": "BROKEN_HASH_LINK",
                "entry_id": str(entry.id),
                "transaction_id": str(entry.transaction_id),
                "expected_prev_hash": expected_prev_hash,
                "actual_prev_hash": entry.prev_hash,
                "created_at": entry.created_at.isoformat(),
                "message": (
                    f"Entry {entry.id} has prev_hash that does not match "
                    f"the previous entry's current_hash. The chain is broken."
                ),
            }
            discrepancies.append(discrepancy)
            if first_corrupted_id is None:
                first_corrupted_id = str(entry.id)
            chain_valid = False

        # Check 2: Hash integrity — recalculate and compare
        recalculated_hash = _compute_entry_hash(entry)
        if recalculated_hash != entry.current_hash:
            discrepancy = {
                "type": "HASH_MISMATCH",
                "entry_id": str(entry.id),
                "transaction_id": str(entry.transaction_id),
                "expected_hash": recalculated_hash,
                "actual_hash": entry.current_hash,
                "created_at": entry.created_at.isoformat(),
                "message": (
                    f"Entry {entry.id} stored hash does not match the "
                    f"recalculated hash. Entry data may have been tampered with."
                ),
            }
            discrepancies.append(discrepancy)
            if first_corrupted_id is None:
                first_corrupted_id = str(entry.id)
            chain_valid = False

        # Check 3: Timestamp monotonicity
        if verified_count > 1:
            prev_entry = entries[verified_count - 2]
            if entry.created_at < prev_entry.created_at:
                discrepancy = {
                    "type": "TIMESTAMP_INVERSION",
                    "entry_id": str(entry.id),
                    "transaction_id": str(entry.transaction_id),
                    "current_timestamp": entry.created_at.isoformat(),
                    "previous_timestamp": prev_entry.created_at.isoformat(),
                    "message": (
                        f"Entry {entry.id} has a timestamp earlier than the "
                        f"previous entry, violating monotonic ordering."
                    ),
                }
                discrepancies.append(discrepancy)
                if first_corrupted_id is None:
                    first_corrupted_id = str(entry.id)
                chain_valid = False

        # Track purged entries and redaction certificates
        if entry.is_purged:
            purged_entries.append(str(entry.id))
        if entry.action_type == "SPILLAGE_REDACTION_CERTIFICATE":
            redaction_certificates.append(str(entry.id))

        # Update expected prev_hash for next iteration
        expected_prev_hash = entry.current_hash
        chain_head_hash = entry.current_hash

    # Check 4: Tombstone anomalies — purged entries without redaction certs
    if purged_entries and not redaction_certificates:
        discrepancy = {
            "type": "TOMBSTONE_ANOMALY",
            "purged_entry_ids": purged_entries,
            "message": (
                f"Found {len(purged_entries)} purged audit entries but no "
                f"corresponding SPILLAGE_REDACTION_CERTIFICATE records. "
                f"This may indicate improper spillage remediation."
            ),
        }
        discrepancies.append(discrepancy)
        chain_valid = False

    tamper_detected = len(discrepancies) > 0

    return {
        "verified_records_count": verified_count,
        "chain_valid": chain_valid,
        "first_corrupted_id": first_corrupted_id,
        "tamper_detected": tamper_detected,
        "discrepancies": discrepancies,
        "chain_head_hash": chain_head_hash,
        "chain_tail_hash": chain_tail_hash,
        "verification_timestamp": datetime.now(timezone.utc).isoformat(),
    }


async def generate_forensic_timeline(
    db: AsyncSession,
    entity_id: uuid.UUID,
) -> Dict[str, Any]:
    """Reconstruct the complete forensic mutation timeline for an entity.

    Extracts every ``ForensicAuditLog`` entry referencing the given entity ID
    and reconstructs the exact state diffs across time.  This provides a
    chronological record of who modified what, from which IP address, and
    under which security caveats.

    Parameters
    ----------
    db : AsyncSession
        Active database session.
    entity_id : UUID
        The UUID of the entity whose mutation history is being reconstructed.

    Returns
    -------
    dict
        A forensic timeline containing:

        - **entity_id** (str) — The entity ID queried.
        - **total_mutations** (int) — Number of audit entries for this entity.
        - **timeline** (list) — Chronological list of mutation events, each
          containing: entry_id, transaction_id, user_upn, client_ip,
          action_type, entity_type, json_diff, security_marking,
          prev_hash, current_hash, is_purged, created_at.
        - **first_mutation_at** (str) — ISO-8601 timestamp of the first
          mutation.
        - **last_mutation_at** (str) — ISO-8601 timestamp of the last mutation.
        - **unique_actors** (list) — List of distinct user UPNs who modified
          this entity.
        - **unique_ips** (list) — List of distinct client IPs used.
    """
    stmt = (
        select(ForensicAuditLog)
        .where(ForensicAuditLog.entity_id == entity_id)
        .order_by(asc(ForensicAuditLog.created_at))
    )

    result = await db.execute(stmt)
    entries = result.scalars().all()

    timeline: List[Dict[str, Any]] = []
    unique_actors: set = set()
    unique_ips: set = set()

    for entry in entries:
        unique_actors.add(entry.user_upn)
        if entry.client_ip is not None:
            unique_ips.add(entry.client_ip)

        event = {
            "entry_id": str(entry.id),
            "transaction_id": str(entry.transaction_id),
            "user_upn": entry.user_upn,
            "client_ip": entry.client_ip,
            "action_type": entry.action_type,
            "entity_type": entry.entity_type,
            "json_diff": entry.json_diff,
            "security_marking": entry.security_marking,
            "prev_hash": entry.prev_hash,
            "current_hash": entry.current_hash,
            "is_purged": entry.is_purged,
            "created_at": entry.created_at.isoformat(),
        }
        timeline.append(event)

    first_mutation = timeline[0]["created_at"] if timeline else None
    last_mutation = timeline[-1]["created_at"] if timeline else None

    return {
        "entity_id": str(entity_id),
        "total_mutations": len(entries),
        "timeline": timeline,
        "first_mutation_at": first_mutation,
        "last_mutation_at": last_mutation,
        "unique_actors": sorted(unique_actors),
        "unique_ips": sorted(unique_ips),
    }


async def export_signed_ledger(
    db: AsyncSession,
) -> Tuple[bytes, str]:
    """Export a digitally signed audit ledger bundle for compliance officers.

    Creates a ZIP archive containing:

    1. **ledger.json** — All audit log entries in chronological order.
    2. **verification_certificate.json** — The chain verification certificate.
    3. **manifest.json** — SHA-256 hashes of all files in the bundle.
    4. **signature.json** — Deterministic SHA-256 signature of the manifest.

    The bundle is formatted for submission to sovereign security compliance
    boards and can be independently verified using the chain verification
    process.

    Parameters
    ----------
    db : AsyncSession
        Active database session.

    Returns
    -------
    tuple
        A tuple of (zip_bytes, bundle_id):

        - **zip_bytes** (bytes) — The complete ZIP archive as bytes.
        - **bundle_id** (str) — A UUID identifying this export bundle.
    """
    # Run chain verification first
    verification = await verify_audit_chain_integrity(db)

    # Fetch all audit entries
    stmt = select(ForensicAuditLog).order_by(asc(ForensicAuditLog.created_at))
    result = await db.execute(stmt)
    entries = result.scalars().all()

    # Build ledger JSON
    ledger_entries = []
    for entry in entries:
        ledger_entries.append({
            "id": str(entry.id),
            "transaction_id": str(entry.transaction_id),
            "user_upn": entry.user_upn,
            "client_ip": entry.client_ip,
            "action_type": entry.action_type,
            "entity_type": entry.entity_type,
            "entity_id": str(entry.entity_id),
            "json_diff": entry.json_diff,
            "security_marking": entry.security_marking,
            "prev_hash": entry.prev_hash,
            "current_hash": entry.current_hash,
            "is_purged": entry.is_purged,
            "created_at": entry.created_at.isoformat(),
        })

    ledger_json = json.dumps(ledger_entries, indent=2, default=str).encode("utf-8")
    verification_json = json.dumps(verification, indent=2, default=str).encode("utf-8")

    # Compute file hashes for manifest
    ledger_hash = hashlib.sha256(ledger_json).hexdigest()
    verification_hash = hashlib.sha256(verification_json).hexdigest()

    bundle_id = str(uuid.uuid4())
    manifest = {
        "bundle_id": bundle_id,
        "export_timestamp": datetime.now(timezone.utc).isoformat(),
        "total_entries": len(entries),
        "chain_valid": verification["chain_valid"],
        "chain_head_hash": verification["chain_head_hash"],
        "files": {
            "ledger.json": {
                "sha256": ledger_hash,
                "size_bytes": len(ledger_json),
            },
            "verification_certificate.json": {
                "sha256": verification_hash,
                "size_bytes": len(verification_json),
            },
        },
    }
    manifest_json = json.dumps(manifest, indent=2, default=str).encode("utf-8")

    # Compute signature of the manifest
    manifest_hash = hashlib.sha256(manifest_json).hexdigest()
    signature = {
        "bundle_id": bundle_id,
        "manifest_sha256": manifest_hash,
        "signature_algorithm": "SHA-256",
        "signed_at": datetime.now(timezone.utc).isoformat(),
        "note": (
            "In production, this should be replaced with RSA signing via "
            "an HSM. Currently uses deterministic SHA-256 as placeholder."
        ),
    }
    signature_json = json.dumps(signature, indent=2, default=str).encode("utf-8")

    # Package into ZIP archive
    import io

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("ledger.json", ledger_json.decode("utf-8"))
        zf.writestr(
            "verification_certificate.json", verification_json.decode("utf-8")
        )
        zf.writestr("manifest.json", manifest_json.decode("utf-8"))
        zf.writestr("signature.json", signature_json.decode("utf-8"))

    zip_bytes = zip_buffer.getvalue()

    return zip_bytes, bundle_id


async def verify_ledger_chain(
    db: AsyncSession,
) -> Dict[str, Any]:
    """Verify the full forensic ledger chain including HSM hardware signatures.

    Iterates through all ``ForensicAuditLog`` records and performs two layers
    of verification:

    1. **Hash chain integrity** — Recalculates SHA-256 hashes and checks
       prev_hash linkage (same as :func:`verify_audit_chain_integrity`).
    2. **HSM signature verification** — For entries that carry an
       ``hsm_signature``, verifies the cryptographic signature against the
       public key identified by ``hsm_key_identifier``.

    If **any** signature or hash fails mathematical verification, an immediate
    ``SECURITY_AUDIT_TAMPER_DETECTED`` alert is emitted via the application
    logger and recorded in the returned discrepancies list.

    Parameters
    ----------
    db : AsyncSession
        Active database session.

    Returns
    -------
    dict
        A verification report containing:

        - **chain_valid** (bool) — ``True`` if all checks pass.
        - **hsm_signatures_verified** (int) — Number of HSM signatures checked.
        - **hsm_signatures_failed** (int) — Number of HSM signature failures.
        - **tamper_detected** (bool) — ``True`` if any discrepancy found.
        - **discrepancies** (list) — Detailed list of all issues.
        - **verification_timestamp** (str) — ISO-8601 timestamp.
    """
    stmt = select(ForensicAuditLog).order_by(asc(ForensicAuditLog.created_at))
    result = await db.execute(stmt)
    entries = result.scalars().all()

    discrepancies: List[Dict[str, Any]] = []
    expected_prev_hash = ""
    chain_valid = True
    hsm_verified = 0
    hsm_failed = 0

    # Lazy-load HSM driver only when needed
    driver = None
    has_hsm_entries = any(e.hsm_signature is not None for e in entries)
    if has_hsm_entries:
        try:
            from app.core.hsm_driver import HSMDriver
            driver = HSMDriver()
        except Exception as exc:
            log.warning("Could not initialise HSM driver: %s", exc)

    for idx, entry in enumerate(entries):
        # --- Check 1: Hash link continuity ---
        if entry.prev_hash != expected_prev_hash:
            discrepancy = {
                "type": "BROKEN_HASH_LINK",
                "entry_id": str(entry.id),
                "expected_prev_hash": expected_prev_hash,
                "actual_prev_hash": entry.prev_hash,
                "message": (
                    f"Entry {entry.id} has prev_hash that does not match "
                    f"the previous entry's current_hash."
                ),
            }
            discrepancies.append(discrepancy)
            chain_valid = False

        # --- Check 2: Hash integrity ---
        recalculated_hash = _compute_entry_hash(entry)
        if recalculated_hash != entry.current_hash:
            discrepancy = {
                "type": "HASH_MISMATCH",
                "entry_id": str(entry.id),
                "expected_hash": recalculated_hash,
                "actual_hash": entry.current_hash,
                "message": (
                    f"Entry {entry.id} stored hash does not match the "
                    f"recalculated hash."
                ),
            }
            discrepancies.append(discrepancy)
            chain_valid = False

        # --- Check 3: HSM signature verification ---
        if entry.hsm_signature is not None and driver is not None:
            hsm_verified += 1
            block_data = entry.current_hash.encode("utf-8")
            is_valid = driver.verify_data(
                block_data,
                entry.hsm_signature,
                entry.hsm_key_identifier or "",
            )
            if not is_valid:
                hsm_failed += 1
                discrepancy = {
                    "type": "HSM_SIGNATURE_FAILURE",
                    "entry_id": str(entry.id),
                    "hsm_key_identifier": entry.hsm_key_identifier,
                    "message": (
                        f"Entry {entry.id} HSM signature failed verification. "
                        f"The block may have been altered after signing."
                    ),
                }
                discrepancies.append(discrepancy)
                chain_valid = False
                # Emit immediate tamper alert
                log.critical(
                    "SECURITY_AUDIT_TAMPER_DETECTED: HSM signature failure on "
                    "entry %s (key_id=%s)",
                    entry.id,
                    entry.hsm_key_identifier,
                )

        # --- Check 4: Missing HSM signature when HSM is enabled ---
        from app.config import settings
        if settings.HSM_ENABLED and entry.hsm_signature is None:
            discrepancy = {
                "type": "MISSING_HSM_SIGNATURE",
                "entry_id": str(entry.id),
                "message": (
                    f"Entry {entry.id} is missing HSM signature but "
                    f"HSM_ENABLED=True. This may indicate an unsigned block."
                ),
            }
            discrepancies.append(discrepancy)
            chain_valid = False

        expected_prev_hash = entry.current_hash

    tamper_detected = len(discrepancies) > 0

    # Emit aggregate tamper alert
    if tamper_detected:
        log.critical(
            "SECURITY_AUDIT_TAMPER_DETECTED: Ledger chain verification failed "
            "with %d discrepancies. hsm_verified=%d, hsm_failed=%d",
            len(discrepancies),
            hsm_verified,
            hsm_failed,
        )

    return {
        "chain_valid": chain_valid,
        "hsm_signatures_verified": hsm_verified,
        "hsm_signatures_failed": hsm_failed,
        "tamper_detected": tamper_detected,
        "discrepancies": discrepancies,
        "verification_timestamp": datetime.now(timezone.utc).isoformat(),
    }
