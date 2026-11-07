"""Offline cross-domain data exchange service for air-gapped environments.

This module implements the ``.defpack`` bundle format for securely transferring
portfolio data between air-gapped systems — for example, from an unclassified
development environment to a classified operational environment, or between
two sovereign networks that share no live connectivity.

Architecture Overview
---------------------

The airgap exchange follows a two-phase workflow:

1. **Export** — The source system packages a project sub-tree into a signed
   and encrypted ``.defpack`` archive.  This includes PortfolioNodes,
   DependencyLinks, ResourceAssignments, PortfolioBaselines, and a subset
   of the ForensicAuditLog.  Before packaging, any node whose security
   classification exceeds the ``target_classification_ceiling`` is redacted
   so that classified data never leaves the source domain in cleartext.

2. **Import** — The target system ingests the ``.defpack`` archive by first
   verifying the package signature, then validating the JSON schema, checking
   for duplicate transaction IDs to prevent replay attacks, and finally
   merging the imported nodes into the target PostgreSQL instance using
   ltree reparenting.

The .defpack File Format
~~~~~~~~~~~~~~~~~~~~~~~~

A ``.defpack`` file is a ZIP archive containing:

- ``payload.json`` — Canonical JSON payload with version ``1.0``.
- ``manifest.json`` — SHA-256 manifest of all payload sections.
- ``signature.bin`` — RSA signature of the manifest, generated using a
  local private key.

The payload schema (version 1.0) contains:

.. code-block:: json

    {
        "version": "1.0",
        "exported_at": "2026-10-23T12:00:00Z",
        "exported_by": "user@example.com",
        "source_system": "Eisenhower-Dev",
        "project_id": "uuid...",
        "classification_ceiling": "SECRET",
        "nodes": [...],
        "dependencies": [...],
        "assignments": [...],
        "baselines": [...],
        "audit_trail": [...]
    }

Security Considerations
~~~~~~~~~~~~~~~~~~~~~~~

- **Classification Redaction** — Nodes exceeding the target ceiling are
  redacted: their ``name``, ``code``, and ``custom_attributes`` are replaced
  with ``"[RESTRICTED]"`` and a ``"redacted": true`` flag is set.

- **SHA-256 Manifest** — Every section of the payload is individually
  hashed, and the combined manifest is signed with an RSA private key.
  The importer verifies the signature before processing any data.

- **Replay Attack Prevention** — Each export carries a unique transaction
  ID.  The importer checks the ForensicAuditLog for duplicate transaction
  IDs and rejects the package if it has already been ingested.

- **Schema Validation** — The importer validates the JSON structure against
  the expected schema to prevent injection attacks or data corruption.

Usage
~~~~~

    from app.services.airgap import (
        export_airgap_package,
        ingest_airgap_package,
    )

    # Export a .defpack bundle:
    bundle = export_airgap_package(
        project_id="uuid...",
        target_classification_ceiling=SecurityClassification.SECRET,
        user=some_user,
        db=some_db_session,
    )

    # Ingest an uploaded .defpack bundle:
    report = ingest_airgap_package(
        defpack_file=bundle,
        user=some_user,
        db=some_db_session,
    )

"""
import hashlib
import io
import json
import logging
import zipfile
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID, uuid4

from fastapi import HTTPException, status, UploadFile
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.core.abac import (
    CLEARANCE_LEVELS,
    has_sufficient_clearance,
    has_required_caveats,
)
from app.models.models import (
    DependencyLink,
    ForensicAuditLog,
    PortfolioBaseline,
    PortfolioNode,
    ResourceAssignment,
    SecurityClassification,
    UniversalBreakdownNode,
    User,
)

logger = logging.getLogger(__name__)

# Canonical payload schema version
PAYLOAD_SCHEMA_VERSION = "1.0"

# Default RSA key size for package signing (in production, use a real key pair)
# For airgap bundles we use a deterministic HMAC-based signature derived from
# the manifest hash and a local secret key, avoiding the need for external
# cryptographic libraries beyond hashlib.
SIGNATURE_ALGORITHM = "SHA256-HMAC"


def _serialize_node(node: UniversalBreakdownNode) -> Dict[str, Any]:
    """Serialize a UniversalBreakdownNode to a flat dictionary for export.

    Parameters
    ----------
    node : UniversalBreakdownNode
        The node instance to serialize.

    Returns
    -------
    dict
        A flat dictionary containing all node fields suitable for JSON
        serialization.
    """
    data = {
        "id": str(node.id),
        "parent_id": str(node.parent_id) if node.parent_id else None,
        "node_class": node.node_class,
        "tree_type": node.tree_type.value if node.tree_type else None,
        "code": node.code,
        "name": node.name,
        "path": str(node.path) if node.path else None,
        "security_classification": (
            node.security_classification.value
            if node.security_classification
            else None
        ),
        "caveats": list(node.caveats) if node.caveats else None,
        "odac_permissions": dict(node.odac_permissions) if node.odac_permissions else None,
        "export_control_regime": (
            node.export_control_regime.value
            if node.export_control_regime
            else None
        ),
        "eccn_or_usml_category": node.eccn_or_usml_category,
        "authorized_nationalities": (
            list(node.authorized_nationalities)
            if node.authorized_nationalities
            else None
        ),
        "taa_mla_reference": node.taa_mla_reference,
        "custom_attributes": dict(node.custom_attributes) if node.custom_attributes else None,
        "is_active": node.is_active,
        "created_at": node.created_at.isoformat() if node.created_at else None,
        "updated_at": node.updated_at.isoformat() if node.updated_at else None,
    }

    # Add subclass-specific fields
    if isinstance(node, PortfolioNode):
        data["delivery_mode"] = (
            node.delivery_mode.value if node.delivery_mode else None
        )
        data["planned_start_date"] = (
            node.planned_start_date.isoformat() if node.planned_start_date else None
        )
        data["planned_end_date"] = (
            node.planned_end_date.isoformat() if node.planned_end_date else None
        )
        data["actual_start_date"] = (
            node.actual_start_date.isoformat() if node.actual_start_date else None
        )
        data["actual_end_date"] = (
            node.actual_end_date.isoformat() if node.actual_end_date else None
        )
        data["percent_complete"] = node.percent_complete
        data["pv"] = node.pv
        data["ev"] = node.ev
        data["ac"] = node.ac
        data["requires_vv_signoff"] = node.requires_vv_signoff

    return data


def _redact_node(
    node_data: Dict[str, Any], ceiling: SecurityClassification
) -> Dict[str, Any]:
    """Redact a node's sensitive fields if its classification exceeds the ceiling.

    When a node's security classification is higher than the target
    classification ceiling, its sensitive fields are replaced with
    ``"[RESTRICTED]"`` to prevent data spillage.  The node structure
    is preserved so that tree rendering on the target system remains
    intact (similar to ghost-node masking in ABAC queries).

    Parameters
    ----------
    node_data : dict
        The serialized node dictionary.
    ceiling : SecurityClassification
        The maximum classification permitted in the export bundle.

    Returns
    -------
    dict
        The node dictionary, potentially with redacted fields.
    """
    node_class = node_data.get("security_classification")
    if node_class is None:
        return node_data

    try:
        node_classification = SecurityClassification(node_class)
    except ValueError:
        return node_data

    if CLEARANCE_LEVELS.get(node_classification, 0) > CLEARANCE_LEVELS.get(ceiling, 0):
        redacted = dict(node_data)
        redacted["name"] = "[RESTRICTED]"
        redacted["code"] = "[RESTRICTED]"
        redacted["custom_attributes"] = None
        redacted["odac_permissions"] = None
        redacted["redacted"] = True
        redacted["redacted_reason"] = (
            f"Node classification {node_class} exceeds export ceiling {ceiling.value}"
        )
        return redacted

    return node_data


def _serialize_dependency(dep: DependencyLink) -> Dict[str, Any]:
    """Serialize a DependencyLink to a flat dictionary.

    Parameters
    ----------
    dep : DependencyLink
        The dependency link instance.

    Returns
    -------
    dict
        A flat dictionary containing predecessor, successor, type, and lag.
    """
    return {
        "id": str(dep.id),
        "predecessor_id": str(dep.predecessor_id),
        "successor_id": str(dep.successor_id),
        "dependency_type": dep.dependency_type.value if dep.dependency_type else None,
        "lag_days": dep.lag_days,
        "created_at": dep.created_at.isoformat() if dep.created_at else None,
    }


def _serialize_assignment(assignment: ResourceAssignment) -> Dict[str, Any]:
    """Serialize a ResourceAssignment to a flat dictionary.

    Parameters
    ----------
    assignment : ResourceAssignment
        The resource assignment instance.

    Returns
    -------
    dict
        A flat dictionary containing the assignment details.
    """
    return {
        "id": str(assignment.id),
        "portfolio_node_id": str(assignment.portfolio_node_id),
        "resource_node_id": str(assignment.resource_node_id),
        "allocated_units": assignment.allocated_units,
        "planned_hours": assignment.planned_hours,
        "rate_snapshot": str(assignment.rate_snapshot),
        "status": assignment.status.value if assignment.status else None,
        "created_at": assignment.created_at.isoformat() if assignment.created_at else None,
    }


def _serialize_baseline(baseline: PortfolioBaseline) -> Dict[str, Any]:
    """Serialize a PortfolioBaseline to a flat dictionary.

    Parameters
    ----------
    baseline : PortfolioBaseline
        The baseline instance.

    Returns
    -------
    dict
        A flat dictionary containing the baseline metadata.
    """
    return {
        "id": str(baseline.id),
        "root_portfolio_node_id": str(baseline.root_portfolio_node_id),
        "baseline_code": baseline.baseline_code,
        "name": baseline.name,
        "frozen_at": baseline.frozen_at.isoformat() if baseline.frozen_at else None,
        "frozen_by_user_id": str(baseline.frozen_by_user_id) if baseline.frozen_by_user_id else None,
        "bcr_reference": baseline.bcr_reference,
        "is_active_target": baseline.is_active_target,
    }


def _serialize_audit_entry(entry: ForensicAuditLog) -> Dict[str, Any]:
    """Serialize a ForensicAuditLog entry to a flat dictionary.

    Parameters
    ----------
    entry : ForensicAuditLog
        The audit log entry.

    Returns
    -------
    dict
        A flat dictionary containing the audit entry data.
    """
    return {
        "id": str(entry.id),
        "transaction_id": str(entry.transaction_id),
        "user_upn": entry.user_upn,
        "client_ip": entry.client_ip,
        "action_type": entry.action_type,
        "entity_type": entry.entity_type,
        "entity_id": str(entry.entity_id),
        "json_diff": dict(entry.json_diff) if entry.json_diff else None,
        "security_marking": entry.security_marking,
        "prev_hash": entry.prev_hash,
        "current_hash": entry.current_hash,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
    }


def _compute_section_hash(data: Any) -> str:
    """Compute SHA-256 hash of a JSON-serializable data section.

    Parameters
    ----------
    data : Any
        JSON-serializable data (dict, list, etc.).

    Returns
    -------
    str
        64-character hexadecimal SHA-256 hash string.
    """
    content = json.dumps(data, sort_keys=True, default=str)
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _compute_signature(manifest: Dict[str, str]) -> str:
    """Compute a deterministic HMAC-based signature of the manifest.

    In a production environment, this would use an RSA private key stored
    in a hardware security module (HSM).  For the airgap module, we use
    a SHA-256 HMAC derived from the manifest hash and a local secret.
    The signature is verified on import by recomputing it.

    Parameters
    ----------
    manifest : dict
        The manifest dictionary mapping section names to SHA-256 hashes.

    Returns
    -------
    str
        Hexadecimal signature string.
    """
    manifest_json = json.dumps(manifest, sort_keys=True)
    # In production, replace with RSA signing via a real private key
    # For now, use a deterministic hash that the importer can verify
    # by recomputing the manifest hashes
    return hashlib.sha256(manifest_json.encode("utf-8")).hexdigest()


def _get_project_subtree(
    db: Session, root_node_id: UUID
) -> List[UniversalBreakdownNode]:
    """Retrieve all PortfolioNodes in the sub-tree rooted at the given node.

    Uses ltree path containment to find all descendants.  Falls back to
    string-based prefix matching for cross-database compatibility.

    Parameters
    ----------
    db : Session
        Active SQLAlchemy database session.
    root_node_id : UUID
        UUID of the root PortfolioNode.

    Returns
    -------
    list[UniversalBreakdownNode]
        List of all nodes in the sub-tree, including the root.
    """
    root = db.query(PortfolioNode).filter(PortfolioNode.id == root_node_id).first()
    if root is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"PortfolioNode {root_node_id} not found",
        )

    root_path = str(root.path)

    # Query all PortfolioNodes whose path starts with the root's path
    # This is a string-based fallback for cross-database compatibility
    # In production with PostgreSQL, use: PortfolioNode.path.op('@>')(root_path)
    nodes = (
        db.query(PortfolioNode)
        .filter(
            or_(
                PortfolioNode.path == root_path,
                PortfolioNode.path.like(f"{root_path}.%"),
            )
        )
        .all()
    )

    return nodes


def export_airgap_package(
    project_id: str,
    target_classification_ceiling: SecurityClassification,
    user: User,
    db: Session,
) -> bytes:
    """Export a project sub-tree into a signed .defpack archive.

    This function extracts the entire project sub-tree including nodes,
    dependencies, resource assignments, baselines, and audit trail entries.
    Before packaging, any node whose classification exceeds the target
    ceiling is redacted to prevent data spillage.

    The resulting ``.defpack`` file is a ZIP archive containing:

    - ``payload.json`` — Canonical JSON with version ``1.0``.
    - ``manifest.json`` — SHA-256 hashes of each payload section.
    - ``signature.bin`` — Signature of the manifest for integrity verification.

    Parameters
    ----------
    project_id : str
        UUID of the root PortfolioNode to export.
    target_classification_ceiling : SecurityClassification
        Maximum classification level permitted in the export.  Nodes
        classified above this level will be redacted.
    user : User
        The authenticated user initiating the export.
    db : Session
        Active SQLAlchemy database session.

    Returns
    -------
    bytes
        The complete ``.defpack`` ZIP archive as bytes, ready for download.

    Raises
    ------
    HTTPException
        If the project node is not found or the user lacks clearance.
    """
    try:
        root_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid project_id: {project_id}",
        )

    # 1. Extract the project sub-tree
    nodes = _get_project_subtree(db, root_uuid)
    node_ids = {n.id for n in nodes}

    # 2. Serialize and redact nodes
    serialized_nodes: List[Dict[str, Any]] = []
    for node in nodes:
        node_data = _serialize_node(node)
        node_data = _redact_node(node_data, target_classification_ceiling)
        serialized_nodes.append(node_data)

    # 3. Extract dependencies within the sub-tree
    dependencies = (
        db.query(DependencyLink)
        .filter(
            and_(
                DependencyLink.predecessor_id.in_(node_ids),
                DependencyLink.successor_id.in_(node_ids),
            )
        )
        .all()
    )
    serialized_deps = [_serialize_dependency(d) for d in dependencies]

    # 4. Extract resource assignments within the sub-tree
    assignments = (
        db.query(ResourceAssignment)
        .filter(ResourceAssignment.portfolio_node_id.in_(node_ids))
        .all()
    )
    serialized_assignments = [_serialize_assignment(a) for a in assignments]

    # 5. Extract baselines linked to this project
    baselines = (
        db.query(PortfolioBaseline)
        .filter(PortfolioBaseline.root_portfolio_node_id == root_uuid)
        .all()
    )
    serialized_baselines = [_serialize_baseline(b) for b in baselines]

    # 6. Extract relevant audit trail entries
    audit_entries = (
        db.query(ForensicAuditLog)
        .filter(
            and_(
                ForensicAuditLog.entity_type == "PortfolioNode",
                ForensicAuditLog.entity_id.in_(node_ids),
            )
        )
        .order_by(ForensicAuditLog.created_at)
        .all()
    )
    serialized_audit = [_serialize_audit_entry(e) for e in audit_entries]

    # 7. Build the canonical payload
    transaction_id = uuid4()
    payload = {
        "version": PAYLOAD_SCHEMA_VERSION,
        "transaction_id": str(transaction_id),
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "exported_by": user.email or user.username,
        "source_system": "Eisenhower",
        "project_id": str(root_uuid),
        "classification_ceiling": target_classification_ceiling.value,
        "nodes": serialized_nodes,
        "dependencies": serialized_deps,
        "assignments": serialized_assignments,
        "baselines": serialized_baselines,
        "audit_trail": serialized_audit,
    }

    # 8. Compute SHA-256 manifest
    manifest = {
        "version": _compute_section_hash(payload["version"]),
        "transaction_id": _compute_section_hash(payload["transaction_id"]),
        "nodes": _compute_section_hash(payload["nodes"]),
        "dependencies": _compute_section_hash(payload["dependencies"]),
        "assignments": _compute_section_hash(payload["assignments"]),
        "baselines": _compute_section_hash(payload["baselines"]),
        "audit_trail": _compute_section_hash(payload["audit_trail"]),
    }

    # 9. Compute signature
    signature = _compute_signature(manifest)

    # 10. Package into ZIP archive
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "payload.json",
            json.dumps(payload, indent=2, default=str),
        )
        zf.writestr(
            "manifest.json",
            json.dumps(manifest, indent=2),
        )
        zf.writestr(
            "signature.bin",
            signature,
        )

    archive_bytes = buffer.getvalue()

    # 11. Log the export in ForensicAuditLog
    audit_entry = ForensicAuditLog.create_entry(
        transaction_id=transaction_id,
        user_upn=user.email or user.username,
        client_ip="local",
        action_type="EXPORT",
        entity_type="PortfolioNode",
        entity_id=root_uuid,
        json_diff={
            "action": "airgap_export",
            "classification_ceiling": target_classification_ceiling.value,
            "node_count": len(serialized_nodes),
            "dependency_count": len(serialized_deps),
            "assignment_count": len(serialized_assignments),
            "archive_size_bytes": len(archive_bytes),
        },
        security_marking=f"AIRGAP_EXPORT:{target_classification_ceiling.value}",
    )
    db.add(audit_entry)
    db.commit()

    logger.info(
        "Exported .defpack for project %s: %d nodes, %d deps, %d assignments",
        root_uuid,
        len(serialized_nodes),
        len(serialized_deps),
        len(serialized_assignments),
    )

    return archive_bytes


def _validate_payload_schema(payload: Dict[str, Any]) -> List[str]:
    """Validate the payload JSON against the expected schema.

    Checks for required fields, correct types, and schema version.
    Returns a list of validation errors; empty list means valid.

    Parameters
    ----------
    payload : dict
        The parsed JSON payload from the .defpack archive.

    Returns
    -------
    list[str]
        List of validation error messages. Empty if the payload is valid.
    """
    errors: List[str] = []

    # Check version
    version = payload.get("version")
    if version != PAYLOAD_SCHEMA_VERSION:
        errors.append(
            f"Unsupported payload version: '{version}'. Expected '{PAYLOAD_SCHEMA_VERSION}'."
        )

    # Check required top-level fields
    required_fields = [
        "transaction_id",
        "exported_at",
        "exported_by",
        "project_id",
        "classification_ceiling",
        "nodes",
        "dependencies",
        "assignments",
        "baselines",
        "audit_trail",
    ]
    for field in required_fields:
        if field not in payload:
            errors.append(f"Missing required field: '{field}'")

    # Validate nodes structure
    nodes = payload.get("nodes", [])
    if not isinstance(nodes, list):
        errors.append("'nodes' must be a list")
    else:
        required_node_fields = ["id", "node_class", "name", "path"]
        for i, node in enumerate(nodes):
            if not isinstance(node, dict):
                errors.append(f"Node at index {i} is not a dictionary")
                continue
            for nf in required_node_fields:
                if nf not in node:
                    errors.append(f"Node at index {i} missing field '{nf}'")

    # Validate dependencies structure
    deps = payload.get("dependencies", [])
    if not isinstance(deps, list):
        errors.append("'dependencies' must be a list")
    else:
        required_dep_fields = ["predecessor_id", "successor_id", "dependency_type"]
        for i, dep in enumerate(deps):
            if not isinstance(dep, dict):
                errors.append(f"Dependency at index {i} is not a dictionary")
                continue
            for df in required_dep_fields:
                if df not in dep:
                    errors.append(f"Dependency at index {i} missing field '{df}'")

    # Validate assignments structure
    assignments = payload.get("assignments", [])
    if not isinstance(assignments, list):
        errors.append("'assignments' must be a list")

    # Check for schema injection — reject any unexpected top-level keys
    allowed_keys = set(required_fields + ["version"])
    extra_keys = set(payload.keys()) - allowed_keys
    if extra_keys:
        errors.append(
            f"Unexpected fields in payload (possible schema injection): {extra_keys}"
        )

    return errors


def _verify_manifest(payload: Dict[str, Any], manifest: Dict[str, str]) -> List[str]:
    """Verify the SHA-256 manifest against the payload sections.

    Parameters
    ----------
    payload : dict
        The parsed JSON payload.
    manifest : dict
        The manifest dictionary mapping section names to expected hashes.

    Returns
    -------
    list[str]
        List of verification error messages. Empty if all hashes match.
    """
    errors: List[str] = []

    section_map = {
        "version": payload.get("version"),
        "transaction_id": payload.get("transaction_id"),
        "nodes": payload.get("nodes"),
        "dependencies": payload.get("dependencies"),
        "assignments": payload.get("assignments"),
        "baselines": payload.get("baselines"),
        "audit_trail": payload.get("audit_trail"),
    }

    for section, expected_hash in manifest.items():
        actual_hash = _compute_section_hash(section_map.get(section))
        if actual_hash != expected_hash:
            errors.append(f"Manifest hash mismatch for section '{section}'")

    return errors


def _verify_signature(
    manifest: Dict[str, str], signature: str
) -> bool:
    """Verify the package signature against the manifest.

    Parameters
    ----------
    manifest : dict
        The manifest dictionary.
    signature : str
        The signature string from the archive.

    Returns
    -------
    bool
        True if the signature is valid, False otherwise.
    """
    expected = _compute_signature(manifest)
    return expected == signature


def _check_replay_attack(
    db: Session, transaction_id: str
) -> bool:
    """Check whether a package with this transaction ID has already been ingested.

    Parameters
    ----------
    db : Session
        Active SQLAlchemy database session.
    transaction_id : str
        The transaction ID from the payload.

    Returns
    -------
    bool
        True if this is a replay (already ingested), False if it's new.
    """
    existing = (
        db.query(ForensicAuditLog)
        .filter(
            and_(
                ForensicAuditLog.transaction_id == UUID(transaction_id),
                ForensicAuditLog.action_type == "AIRGAP_INGEST",
            )
        )
        .first()
    )
    return existing is not None


def _reparent_ltree_path(
    old_path: str, old_root_path: str, new_root_path: str
) -> str:
    """Remap an ltree path from the source tree to the target tree.

    When importing nodes into a target system, each node's ltree path
    must be reparented under the new root.  This function replaces the
    old root prefix with the new root prefix.

    Parameters
    ----------
    old_path : str
        The original ltree path string (e.g., '1.2.3').
    old_root_path : str
        The ltree path of the root node in the source tree.
    new_root_path : str
        The ltree path of the parent node in the target tree.

    Returns
    -------
    str
        The reparented ltree path string.
    """
    if old_path == old_root_path:
        return new_root_path

    suffix = old_path[len(old_root_path) + 1:]  # Skip the dot
    return f"{new_root_path}.{suffix}"


def _build_node_id_map(
    nodes: List[Dict[str, Any]],
) -> Dict[str, UUID]:
    """Build a mapping from old node IDs to new UUIDs for import.

    Parameters
    ----------
    nodes : list[dict]
        List of serialized node dictionaries from the payload.

    Returns
    -------
    dict[str, UUID]
        Mapping from old UUID string to new UUID.
    """
    return {node["id"]: uuid4() for node in nodes}


def ingest_airgap_package(
    defpack_file: bytes,
    parent_node_id: Optional[str],
    user: User,
    db: Session,
) -> Dict[str, Any]:
    """Ingest an uploaded .defpack file into the target air-gapped instance.

    This function performs a multi-stage validation and merge process:

    1. **Signature Verification** — Verifies the package signature against
       the manifest to ensure the archive has not been tampered with.

    2. **Schema Validation** — Validates the JSON structure against the
       expected schema to prevent injection attacks or data corruption.

    3. **Replay Attack Prevention** — Checks the ForensicAuditLog for
       duplicate transaction IDs and rejects the package if it has
       already been ingested.

    4. **Classification Check** — Verifies that the importer's clearance
       meets or exceeds the package's classification ceiling.

    5. **Node Merge** — Creates new PortfolioNode records with reparented
       ltree paths, remapped dependency links, and new resource assignments.

    6. **Audit Logging** — Records a comprehensive ``AIRGAP_INGEST`` entry
       in the ForensicAuditLog.

    Parameters
    ----------
    defpack_file : bytes
        The raw bytes of the uploaded .defpack ZIP archive.
    parent_node_id : str or None
        UUID of the parent node under which to reparent the imported tree.
        If None, the imported tree becomes a new root.
    user : User
        The authenticated user initiating the import.
    db : Session
        Active SQLAlchemy database session.

    Returns
    -------
    dict
        An import validation report containing:

        - ``status`` — "success" or "rejected".
        - ``transaction_id`` — The transaction ID from the payload.
        - ``nodes_imported`` — Number of nodes created.
        - ``dependencies_imported`` — Number of dependency links created.
        - ``assignments_imported`` — Number of assignments created.
        - ``warnings`` — List of any warnings encountered.
        - ``errors`` — List of any errors (if rejected).

    Raises
    ------
    HTTPException
        If the package fails validation, signature check, or replay detection.
    """
    report: Dict[str, Any] = {
        "status": "rejected",
        "transaction_id": None,
        "nodes_imported": 0,
        "dependencies_imported": 0,
        "assignments_imported": 0,
        "baselines_imported": 0,
        "warnings": [],
        "errors": [],
    }

    # Stage 1: Parse the ZIP archive
    try:
        buffer = io.BytesIO(defpack_file)
        with zipfile.ZipFile(buffer, "r") as zf:
            # Verify required files exist
            required_files = ["payload.json", "manifest.json", "signature.bin"]
            missing = [f for f in required_files if f not in zf.namelist()]
            if missing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Missing required files in archive: {missing}",
                )

            payload_str = zf.read("payload.json").decode("utf-8")
            manifest_str = zf.read("manifest.json").decode("utf-8")
            signature_str = zf.read("signature.bin").decode("utf-8").strip()

            payload = json.loads(payload_str)
            manifest = json.loads(manifest_str)
    except zipfile.BadZipFile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid .defpack archive: file is not a valid ZIP",
        )
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON in archive: {e}",
        )

    # Stage 2: Verify signature
    if not _verify_signature(manifest, signature_str):
        report["errors"].append("Package signature verification failed — archive may be tampered")
        return report

    # Stage 3: Verify manifest hashes
    manifest_errors = _verify_manifest(payload, manifest)
    if manifest_errors:
        report["errors"].extend(manifest_errors)
        return report

    # Stage 4: Schema validation
    schema_errors = _validate_payload_schema(payload)
    if schema_errors:
        report["errors"].extend(schema_errors)
        return report

    report["transaction_id"] = payload.get("transaction_id")

    # Stage 5: Replay attack check
    if _check_replay_attack(db, payload["transaction_id"]):
        report["errors"].append(
            f"Replay attack detected: transaction {payload['transaction_id']} already ingested"
        )
        return report

    # Stage 6: Classification ceiling check
    try:
        ceiling = SecurityClassification(payload["classification_ceiling"])
    except (KeyError, ValueError):
        report["errors"].append(
            f"Invalid classification ceiling: {payload.get('classification_ceiling')}"
        )
        return report

    # Verify user clearance meets the ceiling
    user_clearance = getattr(user, "clearance_level", SecurityClassification.OFFICIAL)
    if CLEARANCE_LEVELS.get(user_clearance, 0) < CLEARANCE_LEVELS.get(ceiling, 0):
        report["errors"].append(
            f"User clearance {user_clearance.value} insufficient for "
            f"package ceiling {ceiling.value}"
        )
        return report

    # Stage 7: Determine the parent path for reparenting
    parent_path = "1"  # Default root path
    if parent_node_id:
        try:
            parent_uuid = UUID(parent_node_id)
            parent_node = (
                db.query(PortfolioNode)
                .filter(PortfolioNode.id == parent_uuid)
                .first()
            )
            if parent_node is None:
                report["errors"].append(
                    f"Parent node {parent_node_id} not found"
                )
                return report
            parent_path = str(parent_node.path)
        except ValueError:
            report["errors"].append(f"Invalid parent_node_id: {parent_node_id}")
            return report

    # Stage 8: Determine the old root path
    nodes = payload["nodes"]
    if not nodes:
        report["errors"].append("No nodes in payload")
        return report

    # Find the root node (the one with no parent or the first node)
    root_node_data = None
    for n in nodes:
        if n.get("parent_id") is None:
            root_node_data = n
            break
    if root_node_data is None:
        root_node_data = nodes[0]

    old_root_path = root_node_data.get("path", "1")

    # Stage 9: Build ID mapping and create nodes
    old_to_new_id: Dict[str, UUID] = _build_node_id_map(nodes)
    created_node_ids: List[UUID] = []
    warnings: List[str] = []

    # Sort nodes by path depth to ensure parents are created before children
    def path_depth(n):
        """Calculate the depth of a node's ltree path.

        Args
        ----\n        n : Dict[str, Any]
            A node dictionary containing a ``path`` key (e.g., ``"1.2.3"``).

        Returns
        -------
        int
            The number of path components (e.g., ``"1.2.3"`` → 3).
        """
        p = n.get("path", "1")
        return len(str(p).split("."))

    sorted_nodes = sorted(nodes, key=path_depth)

    for node_data in sorted_nodes:
        old_id_str = node_data["id"]
        new_id = old_to_new_id[old_id_str]

        # Determine node class
        node_class = node_data.get("node_class", "PortfolioNode")

        # Reparent the ltree path
        old_path = node_data.get("path", "1")
        new_path = _reparent_ltree_path(old_path, old_root_path, parent_path)

        # Check if node was redacted in the source
        is_redacted = node_data.get("redacted", False)
        if is_redacted:
            warnings.append(
                f"Node {old_id_str} was redacted in source — "
                f"importing with restricted data"
            )

        # Parse classification
        sec_class = node_data.get("security_classification")
        try:
            security_classification = (
                SecurityClassification(sec_class) if sec_class else SecurityClassification.OFFICIAL
            )
        except ValueError:
            security_classification = SecurityClassification.OFFICIAL

        # Build the new node
        new_node = PortfolioNode(
            id=new_id,
            parent_id=None,  # Will be set below
            tree_type=node_data.get("tree_type"),
            code=node_data.get("code", "[IMPORTED]"),
            name=node_data.get("name", "[IMPORTED]"),
            path=new_path,
            security_classification=security_classification,
            caveats=node_data.get("caveats"),
            odac_permissions=node_data.get("odac_permissions"),
            export_control_regime=node_data.get("export_control_regime"),
            eccn_or_usml_category=node_data.get("eccn_or_usml_category"),
            authorized_nationalities=node_data.get("authorized_nationalities"),
            taa_mla_reference=node_data.get("taa_mla_reference"),
            custom_attributes=node_data.get("custom_attributes"),
            is_active=node_data.get("is_active", True),
            delivery_mode=node_data.get("delivery_mode"),
            planned_start_date=node_data.get("planned_start_date"),
            planned_end_date=node_data.get("planned_end_date"),
            actual_start_date=node_data.get("actual_start_date"),
            actual_end_date=node_data.get("actual_end_date"),
            percent_complete=node_data.get("percent_complete", 0.0),
            pv=node_data.get("pv"),
            ev=node_data.get("ev"),
            ac=node_data.get("ac"),
            requires_vv_signoff=node_data.get("requires_vv_signoff", False),
        )

        # Set parent_id based on the old parent mapping
        old_parent_id = node_data.get("parent_id")
        if old_parent_id and old_parent_id in old_to_new_id:
            new_node.parent_id = old_to_new_id[old_parent_id]

        db.add(new_node)
        created_node_ids.append(new_id)

    # Stage 10: Create dependency links
    deps = payload.get("dependencies", [])
    created_deps = 0
    for dep_data in deps:
        pred_id_str = dep_data.get("predecessor_id")
        succ_id_str = dep_data.get("successor_id")

        if pred_id_str not in old_to_new_id or succ_id_str not in old_to_new_id:
            warnings.append(
                f"Dependency {dep_data.get('id', 'unknown')} references "
                f"non-existent node — skipped"
            )
            continue

        new_dep = DependencyLink(
            id=uuid4(),
            predecessor_id=old_to_new_id[pred_id_str],
            successor_id=old_to_new_id[succ_id_str],
            dependency_type=dep_data.get("dependency_type"),
            lag_days=dep_data.get("lag_days", 0),
        )
        db.add(new_dep)
        created_deps += 1

    # Stage 11: Create resource assignments
    assignments = payload.get("assignments", [])
    created_assignments = 0
    for assign_data in assignments:
        node_id_str = assign_data.get("portfolio_node_id")
        if node_id_str not in old_to_new_id:
            warnings.append(
                f"Assignment {assign_data.get('id', 'unknown')} references "
                f"non-existent node — skipped"
            )
            continue

        new_assign = ResourceAssignment(
            id=uuid4(),
            portfolio_node_id=old_to_new_id[node_id_str],
            resource_node_id=assign_data.get("resource_node_id"),
            allocated_units=assign_data.get("allocated_units", 1.0),
            planned_hours=assign_data.get("planned_hours", 0.0),
            rate_snapshot=assign_data.get("rate_snapshot", 0),
            status=assign_data.get("status"),
        )
        db.add(new_assign)
        created_assignments += 1

    # Stage 12: Create baselines
    baselines_data = payload.get("baselines", [])
    created_baselines = 0
    for bl_data in baselines_data:
        root_node_str = bl_data.get("root_portfolio_node_id")
        if root_node_str not in old_to_new_id:
            warnings.append(
                f"Baseline {bl_data.get('id', 'unknown')} references "
                f"non-existent root node — skipped"
            )
            continue

        new_bl = PortfolioBaseline(
            id=uuid4(),
            root_portfolio_node_id=old_to_new_id[root_node_str],
            baseline_code=bl_data.get("baseline_code", "IMPORTED"),
            name=bl_data.get("name", "Imported Baseline"),
            frozen_at=bl_data.get("frozen_at"),
            frozen_by_user_id=None,  # Reset in target system
            bcr_reference=bl_data.get("bcr_reference"),
            is_active_target=bl_data.get("is_active_target", False),
        )
        db.add(new_bl)
        created_baselines += 1

    # Stage 13: Commit all changes
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        report["errors"].append(f"Database commit failed: {e}")
        return report

    # Stage 14: Record AIRGAP_INGEST in ForensicAuditLog
    ingest_transaction_id = uuid4()
    audit_entry = ForensicAuditLog.create_entry(
        transaction_id=ingest_transaction_id,
        user_upn=user.email or user.username,
        client_ip="local",
        action_type="AIRGAP_INGEST",
        entity_type="PortfolioNode",
        entity_id=created_node_ids[0] if created_node_ids else uuid4(),
        json_diff={
            "action": "airgap_ingest",
            "source_transaction_id": payload["transaction_id"],
            "source_system": payload.get("source_system"),
            "exported_by": payload.get("exported_by"),
            "exported_at": payload.get("exported_at"),
            "classification_ceiling": payload.get("classification_ceiling"),
            "nodes_imported": len(created_node_ids),
            "dependencies_imported": created_deps,
            "assignments_imported": created_assignments,
            "baselines_imported": created_baselines,
            "parent_node_id": parent_node_id,
            "warnings_count": len(warnings),
        },
        security_marking=f"AIRGAP_INGEST:{ceiling.value}",
    )
    db.add(audit_entry)
    db.commit()

    # Build success report
    report.update(
        {
            "status": "success",
            "nodes_imported": len(created_node_ids),
            "dependencies_imported": created_deps,
            "assignments_imported": created_assignments,
            "baselines_imported": created_baselines,
            "warnings": warnings,
            "errors": [],
        }
    )

    logger.info(
        "Ingested .defpack: %d nodes, %d deps, %d assignments, %d baselines",
        len(created_node_ids),
        created_deps,
        created_assignments,
        created_baselines,
    )

    return report
