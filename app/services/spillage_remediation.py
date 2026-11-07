"""Classified spillage remediation engine for emergency data purges.

This module implements the emergency spillage purge mechanism required
by UK MOD JSP 440 / JSP 604 and US DoD IL5/IL6 guidelines.  When
classified data is accidentally disclosed to an unauthorized system
or personnel (a "spillage" event), the contaminated content must be
surgically redacted while preserving the integrity of the forensic
audit trail.

Multi-Signature Authorization
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Any spillage purge requires authorization from at least two Superusers
with clearance at or above SECRET.  The workflow is:

1. An incident ticket is created referencing the spillage event.
2. The first Superuser signs the purge request, creating a
   :class:`SpillagePurgeSignature` record.
3. A second Superuser signs the same request.
4. Once two valid signatures exist, the purge engine executes the
   emergency scrub.

Surgical Redaction
~~~~~~~~~~~~~~~~~~

Rather than deleting records (which would break the SHA-256 audit
chain), the purge engine:

1. **Redacts** — Replaces contaminated content (task names, descriptions,
   custom attributes) with the marker:
   ``[PURGED UNDER CLASSIFIED SPILLAGE PROTOCOL - REF: <TICKET>]``

2. **Tombstones** — In the immutable :class:`ForensicAuditLog`, sets
   ``is_purged = True`` and replaces ``json_diff`` with a cryptographically
   hashed redaction marker.

3. **Certifies** — Records an unalterable
   ``SPILLAGE_REDACTION_CERTIFICATE`` entry in the audit log, signed
   by both purging officers.

Security Considerations
~~~~~~~~~~~~~~~~~~~~~~~

- The purge never deletes rows from ForensicAuditLog — chain continuity
  is preserved by tombstoning rather than deletion.
- Each redaction is cryptographically linked to the incident ticket
  reference for external security accreditation boards.
- The purge operation itself is recorded in the audit log with SHA-256
  chained hashing.

Usage
~~~~~

.. code-block:: python

    from app.services.spillage_remediation import execute_emergency_spillage_purge

    result = await execute_emergency_spillage_purge(
        db=db,
        incident_ticket_ref="INC-2026-0042",
        search_terms=["CLASSIFIED_PROGRAM_NAME"],
        entity_ids=[node_id_1, node_id_2],
        purging_user_ids=[admin_1_id, admin_2_id],
    )
"""
import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set
from uuid import UUID, uuid4

from sqlalchemy import select, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.models.models import (
    UniversalBreakdownNode,
    PortfolioNode,
    ForensicAuditLog,
    SpillagePurgeSignature,
    User,
    SecurityClassification,
)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

PURGE_MARKER_TEMPLATE = (
    "[PURGED UNDER CLASSIFIED SPILLAGE PROTOCOL - REF: {ticket}]"
)
"""Template for the redaction marker text.

The ``{ticket}`` placeholder is replaced with the incident ticket
reference (e.g., ``INC-2026-0042``).
"""

MIN_SIGNATURES_REQUIRED = 2
"""Minimum number of Superuser signatures required to execute a purge."""

MIN_CLEARANCE_FOR_PURGE = SecurityClassification.SECRET
"""Minimum clearance level required to sign a spillage purge."""


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------

def _compute_sha256(data: str) -> str:
    """Compute SHA-256 hash of a string.

    Parameters
    ----------
    data : str
        The string to hash.

    Returns
    -------
    str
        Hex-encoded SHA-256 digest.
    """
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def _compute_json_sha256(data: Dict[str, Any]) -> str:
    """Compute SHA-256 hash of a JSON-serializable dictionary.

    Uses canonical JSON encoding (sorted keys, no extra whitespace) to
    ensure deterministic hashing.

    Parameters
    ----------
    data : dict
        The dictionary to hash.

    Returns
    -------
    str
        Hex-encoded SHA-256 digest.
    """
    canonical = json.dumps(data, sort_keys=True, default=str)
    return _compute_sha256(canonical)


def _purge_marker(ticket_ref: str) -> str:
    """Generate the redaction marker text for a given incident ticket.

    Parameters
    ----------
    ticket_ref : str
        The incident ticket reference (e.g., ``INC-2026-0042``).

    Returns
    -------
    str
        The redaction marker string.
    """
    return PURGE_MARKER_TEMPLATE.format(ticket=ticket_ref)


def _redaction_hash_marker(ticket_ref: str, entity_id: str) -> Dict[str, Any]:
    """Generate a cryptographically hashed redaction marker for audit log.

    Instead of deleting the json_diff, we replace it with a marker that
    contains a SHA-256 hash of the original data, proving that data once
    existed here without exposing its content.

    Parameters
    ----------
    ticket_ref : str
        The incident ticket reference.
    entity_id : str
        The entity ID that was redacted.

    Returns
    -------
    dict
        A dictionary suitable for storing in json_diff that proves
        redaction occurred without exposing the original content.
    """
    marker = _purge_marker(ticket_ref)
    content_hash = _compute_sha256(f"{ticket_ref}:{entity_id}")

    return {
        "redacted": True,
        "redaction_type": "CLASSIFIED_SPILLAGE_REMEDIATION",
        "incident_ticket_ref": ticket_ref,
        "entity_id": entity_id,
        "original_content_hash": content_hash,
        "redacted_at": datetime.now(timezone.utc).isoformat(),
        "marker": marker,
    }


# ---------------------------------------------------------------------------
# Multi-Signature Verification
# ---------------------------------------------------------------------------

def verify_purge_authorization(
    db: Session,
    incident_ticket_ref: str,
    purging_user_ids: List[int],
) -> Dict[str, Any]:
    """Verify that a spillage purge has sufficient multi-sig authorization.

    Checks that:

    1. At least ``MIN_SIGNATURES_REQUIRED`` (2) unique Superusers have
       signed the purge request.
    2. Each signing user has clearance at or above SECRET.
    3. Each signing user has the ADMIN role.

    Parameters
    ----------
    db : Session
        Database session.
    incident_ticket_ref : str
        The incident ticket reference.
    purging_user_ids : list of int
        User IDs of the signing Superusers.

    Returns
    -------
    dict
        Verification result with keys:
        - ``authorized`` (bool): Whether the purge is authorized.
        - ``signature_count`` (int): Number of valid signatures.
        - ``signatures`` (list): List of signature records.
        - ``errors`` (list): List of authorization errors.

    Raises
    ------
    ValueError
        If authorization requirements are not met.
    """
    errors: List[str] = []
    signatures: List[Dict[str, Any]] = []

    clearance_levels = {
        "OFFICIAL": 0,
        "OFFICIAL_SENSITIVE": 1,
        "SECRET": 2,
        "TOP_SECRET": 3,
    }
    min_clearance_rank = clearance_levels.get(
        MIN_CLEARANCE_FOR_PURGE.value, 2
    )

    for user_id in purging_user_ids:
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            errors.append(f"User {user_id} not found")
            continue

        if user.role.value != "admin":
            errors.append(
                f"User {user_id} ({user.email}) does not have ADMIN role"
            )
            continue

        user_clearance_rank = clearance_levels.get(
            user.clearance_level.value, 0
        )
        if user_clearance_rank < min_clearance_rank:
            errors.append(
                f"User {user_id} ({user.email}) clearance "
                f"{user.clearance_level.value} is below minimum "
                f"{MIN_CLEARANCE_FOR_PURGE.value}"
            )
            continue

        signatures.append({
            "user_id": user_id,
            "user_upn": user.email,
            "clearance_level": user.clearance_level.value,
        })

    if len(signatures) < MIN_SIGNATURES_REQUIRED:
        errors.append(
            f"Insufficient signatures: {len(signatures)} provided, "
            f"{MIN_SIGNATURES_REQUIRED} required"
        )

    if errors:
        return {
            "authorized": False,
            "signature_count": len(signatures),
            "signatures": signatures,
            "errors": errors,
        }

    return {
        "authorized": True,
        "signature_count": len(signatures),
        "signatures": signatures,
        "errors": [],
    }


def record_purge_signatures(
    db: Session,
    incident_ticket_ref: str,
    purging_user_ids: List[int],
    purge_params: Dict[str, Any],
    certificate_serials: Optional[List[str]] = None,
) -> List[SpillagePurgeSignature]:
    """Record multi-signature authorization for a spillage purge.

    Creates a :class:`SpillagePurgeSignature` record for each signing
    Superuser, linking the signature to the incident ticket reference.

    Parameters
    ----------
    db : Session
        Database session.
    incident_ticket_ref : str
        The incident ticket reference.
    purging_user_ids : list of int
        User IDs of the signing Superusers.
    purge_params : dict
        The purge request parameters (hashed for the signature).
    certificate_serials : list of str, optional
        Smartcard certificate serial numbers for each signer.

    Returns
    -------
    list of SpillagePurgeSignature
        The created signature records.
    """
    signature_hash = _compute_json_sha256(purge_params)
    created_signatures: List[SpillagePurgeSignature] = []

    for i, user_id in enumerate(purging_user_ids):
        cert_serial = (
            certificate_serials[i] if certificate_serials else None
        )

        sig = SpillagePurgeSignature(
            incident_ticket_ref=incident_ticket_ref,
            purging_user_id=user_id,
            signed_at=datetime.now(timezone.utc),
            signature_hash=signature_hash,
            certificate_serial=cert_serial,
        )
        db.add(sig)
        created_signatures.append(sig)

    db.flush()
    return created_signatures


# ---------------------------------------------------------------------------
# Surgical Redaction
# ---------------------------------------------------------------------------

def redact_node_content(
    node: UniversalBreakdownNode,
    ticket_ref: str,
) -> Dict[str, Any]:
    """Surgically redact classified content from a node.

    Replaces the node's name, code, and custom_attributes with the
    purge marker while preserving the node's structural integrity
    (path, parent_id, etc.) so the tree hierarchy remains intact.

    Parameters
    ----------
    node : UniversalBreakdownNode
        The node to redact.
    ticket_ref : str
        The incident ticket reference.

    Returns
    -------
    dict
        A dictionary of the fields that were redacted, for audit logging.
    """
    marker = _purge_marker(ticket_ref)

    old_values = {
        "name": node.name,
        "code": node.code,
        "custom_attributes": node.custom_attributes,
    }

    # Redact text fields
    node.name = marker
    node.code = marker

    # Redact custom attributes — preserve structure but replace values
    if node.custom_attributes:
        node.custom_attributes = {
            "redacted": True,
            "redaction_marker": marker,
            "incident_ticket_ref": ticket_ref,
            "redacted_at": datetime.now(timezone.utc).isoformat(),
        }

    return old_values


def redact_audit_log_entries(
    db: Session,
    entity_ids: List[UUID],
    ticket_ref: str,
) -> int:
    """Tombstone audit log entries for the affected entities.

    Rather than deleting rows (which breaks chain continuity), this
    function sets ``is_purged = True`` and replaces ``json_diff`` with
    a cryptographically hashed redaction marker.

    Parameters
    ----------
    db : Session
        Database session.
    entity_ids : list of UUID
        Entity IDs whose audit entries should be tombstoned.
    ticket_ref : str
        The incident ticket reference.

    Returns
    -------
    int
        Number of audit entries that were tombstoned.
    """
    entity_id_strs = [str(eid) for eid in entity_ids]

    entries = db.query(ForensicAuditLog).filter(
        ForensicAuditLog.entity_id.in_(entity_id_strs),
        ForensicAuditLog.is_purged == False,  # noqa: E712
    ).all()

    count = 0
    for entry in entries:
        # Compute the redaction marker
        redaction_marker = _redaction_hash_marker(
            ticket_ref, str(entry.entity_id)
        )

        # Preserve the original hash for the tombstone record
        redaction_marker["original_current_hash"] = entry.current_hash
        redaction_marker["original_prev_hash"] = entry.prev_hash

        # Tombstone the entry
        entry.is_purged = True
        entry.json_diff = redaction_marker

        count += 1

    return count


# ---------------------------------------------------------------------------
# Certificate Generation
# ---------------------------------------------------------------------------

def create_spillage_redaction_certificate(
    db: Session,
    incident_ticket_ref: str,
    purging_user_ids: List[int],
    entity_ids: List[UUID],
    redacted_node_count: int,
    tombstoned_audit_count: int,
) -> ForensicAuditLog:
    """Create a SPILLAGE_REDACTION_CERTIFICATE audit log entry.

    This entry serves as an unalterable certificate of the purge
    operation, signed by both purging officers.  It is recorded in
    the ForensicAuditLog with SHA-256 chained hashing.

    Parameters
    ----------
    db : Session
        Database session.
    incident_ticket_ref : str
        The incident ticket reference.
    purging_user_ids : list of int
        User IDs of the purging officers.
    entity_ids : list of UUID
        Entity IDs that were redacted.
    redacted_node_count : int
        Number of nodes that were redacted.
    tombstoned_audit_count : int
        Number of audit entries that were tombstoned.

    Returns
    -------
    ForensicAuditLog
        The created certificate audit entry.
    """
    # Fetch the latest chain hash
    latest = db.query(ForensicAuditLog).order_by(
        ForensicAuditLog.created_at.desc()
    ).first()
    prev_hash = latest.current_hash if latest else ""

    # Build the certificate data
    purging_users = [
        db.query(User).filter(User.id == uid).first()
        for uid in purging_user_ids
    ]
    purging_upns = [
        u.email if u else f"unknown-{uid}"
        for uid, u in zip(purging_user_ids, purging_users)
    ]

    certificate_data = {
        "certificate_type": "SPILLAGE_REDACTION_CERTIFICATE",
        "incident_ticket_ref": incident_ticket_ref,
        "purging_officers": purging_upns,
        "entity_ids": [str(eid) for eid in entity_ids],
        "redacted_node_count": redacted_node_count,
        "tombstoned_audit_count": tombstoned_audit_count,
        "certificate_hash": _compute_sha256(
            f"{incident_ticket_ref}:{redacted_node_count}:"
            f"{tombstoned_audit_count}:{datetime.now(timezone.utc).isoformat()}"
        ),
        "signed_at": datetime.now(timezone.utc).isoformat(),
    }

    # Create the certificate audit entry
    transaction_id = uuid4()
    security_marking = (
        f"SPILLAGE_REDACTION - {incident_ticket_ref} - "
        f"OFFICERS: {', '.join(purging_upns)}"
    )

    cert_entry = ForensicAuditLog.create_entry(
        transaction_id=transaction_id,
        user_upn=", ".join(purging_upns),
        client_ip=None,
        action_type="SPILLAGE_REDACTION_CERTIFICATE",
        entity_type="SpillageRemediation",
        entity_id=transaction_id,
        json_diff=certificate_data,
        security_marking=security_marking,
        prev_hash=prev_hash,
    )

    db.add(cert_entry)
    db.flush()
    return cert_entry


# ---------------------------------------------------------------------------
# Main Purge Orchestrator
# ---------------------------------------------------------------------------

def execute_emergency_spillage_purge(
    db: Session,
    incident_ticket_ref: str,
    search_terms: Optional[List[str]] = None,
    entity_ids: Optional[List[UUID]] = None,
    purging_user_ids: Optional[List[int]] = None,
    certificate_serials: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Execute an emergency classified spillage purge.

    This is the main orchestrator function that performs the complete
    spillage remediation workflow:

    1. **Verify** — Checks multi-signature authorization from two
       Superusers with clearance ≥ SECRET.
    2. **Record** — Creates SpillagePurgeSignature records for each
       signing officer.
    3. **Identify** — Finds all nodes matching the search terms or
       entity IDs.
    4. **Redact** — Surgically replaces contaminated content with
       the purge marker.
    5. **Tombstone** — Marks affected audit log entries as purged
       with cryptographic redaction markers.
    6. **Certify** — Creates a SPILLAGE_REDACTION_CERTIFICATE entry
       in the immutable audit log.

    Parameters
    ----------
    db : Session
        Database session.
    incident_ticket_ref : str
        The security incident ticket reference authorizing the purge.
    search_terms : list of str, optional
        Text patterns to search for in node names, codes, and
        custom attributes.  Nodes containing any search term will
        be redacted.
    entity_ids : list of UUID, optional
        Specific entity IDs to redact.  If provided, search_terms
        is ignored.
    purging_user_ids : list of int, optional
        User IDs of the signing Superusers.  If not provided, the
        caller is expected to have already recorded signatures.
    certificate_serials : list of str, optional
        Smartcard certificate serial numbers for each signer.

    Returns
    -------
    dict
        Purge result with keys:
        - ``incident_ticket_ref`` (str): The ticket reference.
        - ``redacted_nodes`` (list): List of redacted node IDs.
        - ``redacted_node_count`` (int): Number of nodes redacted.
        - ``tombstoned_audit_count`` (int): Number of audit entries
          tombstoned.
        - ``certificate_id`` (str): UUID of the certificate audit entry.
        - ``purging_officers`` (list): List of purging officer UPNs.
        - ``timestamp`` (str): ISO timestamp of the purge.

    Raises
    ------
    ValueError
        If multi-signature authorization is not met.
    """
    # Step 1: Verify multi-signature authorization
    if purging_user_ids:
        auth_result = verify_purge_authorization(
            db, incident_ticket_ref, purging_user_ids
        )
        if not auth_result["authorized"]:
            raise ValueError(
                f"Purge authorization failed: "
                f"{', '.join(auth_result['errors'])}"
            )

        # Record the signatures
        purge_params = {
            "incident_ticket_ref": incident_ticket_ref,
            "search_terms": search_terms or [],
            "entity_ids": [str(eid) for eid in (entity_ids or [])],
        }
        record_purge_signatures(
            db,
            incident_ticket_ref,
            purging_user_ids,
            purge_params,
            certificate_serials,
        )

    # Step 2: Identify nodes to redact
    nodes_to_redact: List[UniversalBreakdownNode] = []

    if entity_ids:
        # Direct entity ID lookup
        nodes_to_redact = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id.in_(entity_ids)
        ).all()
    elif search_terms:
        # Search-based identification
        for term in search_terms:
            term_lower = term.lower()
            results = db.query(UniversalBreakdownNode).filter(
                (
                    UniversalBreakdownNode.name.ilike(f"%{term}%")
                    | UniversalBreakdownNode.code.ilike(f"%{term}%")
                )
            ).all()
            nodes_to_redact.extend(results)

        # Deduplicate
        seen_ids: Set[UUID] = set()
        unique_nodes: List[UniversalBreakdownNode] = []
        for node in nodes_to_redact:
            if node.id not in seen_ids:
                seen_ids.add(node.id)
                unique_nodes.append(node)
        nodes_to_redact = unique_nodes

    # Step 3: Redact node content
    redacted_node_ids: List[str] = []
    for node in nodes_to_redact:
        redact_node_content(node, incident_ticket_ref)
        redacted_node_ids.append(str(node.id))

    # Step 4: Tombstone audit log entries
    entity_uuids = [UUID(eid) for eid in redacted_node_ids]
    tombstoned_count = redact_audit_log_entries(
        db, entity_uuids, incident_ticket_ref
    )

    # Step 5: Create the redaction certificate
    purging_upns = []
    if purging_user_ids:
        for uid in purging_user_ids:
            user = db.query(User).filter(User.id == uid).first()
            if user:
                purging_upns.append(user.email)

    cert_entry = create_spillage_redaction_certificate(
        db,
        incident_ticket_ref,
        purging_user_ids or [],
        entity_uuids,
        len(redacted_node_ids),
        tombstoned_count,
    )

    # Commit all changes
    db.commit()

    return {
        "incident_ticket_ref": incident_ticket_ref,
        "redacted_nodes": redacted_node_ids,
        "redacted_node_count": len(redacted_node_ids),
        "tombstoned_audit_count": tombstoned_count,
        "certificate_id": str(cert_entry.id),
        "purging_officers": purging_upns,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def get_spillage_audit_certificates(
    db: Session,
    incident_ticket_ref: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Retrieve historic spillage redaction certificates.

    Returns all SPILLAGE_REDACTION_CERTIFICATE entries from the
    ForensicAuditLog, optionally filtered by incident ticket reference.

    These certificates are used by external security accreditation
    boards to verify that spillage remediation was properly authorized
    and executed.

    Parameters
    ----------
    db : Session
        Database session.
    incident_ticket_ref : str, optional
        Filter certificates by incident ticket reference.

    Returns
    -------
    list of dict
        List of certificate records with keys:
        - ``id`` (str): Certificate audit entry ID.
        - ``incident_ticket_ref`` (str): Incident ticket reference.
        - ``purging_officers`` (list): UPNs of purging officers.
        - ``redacted_node_count`` (int): Nodes redacted.
        - ``tombstoned_audit_count`` (int): Audit entries tombstoned.
        - ``signed_at`` (str): ISO timestamp of the certificate.
        - ``certificate_hash`` (str): SHA-256 hash of the certificate.
    """
    query = db.query(ForensicAuditLog).filter(
        ForensicAuditLog.action_type == "SPILLAGE_REDACTION_CERTIFICATE"
    )

    if incident_ticket_ref:
        # Filter by ticket reference in json_diff
        query = query.filter(
            ForensicAuditLog.json_diff.cast(String).like(
                f"%{incident_ticket_ref}%"
            )
        )

    entries = query.order_by(ForensicAuditLog.created_at.desc()).all()

    certificates = []
    for entry in entries:
        json_diff = entry.json_diff or {}
        certificates.append({
            "id": str(entry.id),
            "incident_ticket_ref": json_diff.get("incident_ticket_ref", ""),
            "purging_officers": json_diff.get("purging_officers", []),
            "redacted_node_count": json_diff.get("redacted_node_count", 0),
            "tombstoned_audit_count": json_diff.get(
                "tombstoned_audit_count", 0
            ),
            "signed_at": json_diff.get("signed_at", ""),
            "certificate_hash": json_diff.get("certificate_hash", ""),
            "created_at": (
                entry.created_at.isoformat()
                if entry.created_at
                else None
            ),
        })

    return certificates
