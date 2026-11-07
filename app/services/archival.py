"""Programme archival and WORM cold-storage sealing service.

This module provides the long-term programme closeout workflow for the
Eisenhower Portfolio Manager.  When a defence programme reaches its end
of life, it must be formally closed out and sealed for tamper-evident
long-term storage.

Sealing Process
---------------

1. **Deactivate** — All nodes in the programme's ltree sub-tree are set
   to ``is_active = False``, placing the programme into a permanent
   read-only state.

2. **Export** — All relational data (nodes, dependencies, assignments,
   baselines, audit logs, artifacts) is exported into a self-contained
   JSON archive package.

3. **Checksum** — An exhaustive SHA-256 manifest is generated, recording
   the hash of every archived entity and file.

4. **Sign** — The manifest is cryptographically signed using a local
   private key or HSM certificate (placeholder for production HSM).

5. **Seal** — A :class:`ProgrammeArchiveSeal` record is created, linking
   the cryptographic head of the audit ledger to the archive manifest
   hash and the cold-storage vault URI.

Integrity Verification
----------------------

At any future date, ``verify_archive_integrity()`` re-computes hashes
across the archived dataset, validates the embedded signature, and
confirms that the audit log chain links directly to the seal's
``final_sha256_audit_head``.  If any link in the chain is broken, the
archive is flagged as tampered.

Security Considerations
-----------------------

- The seal record uses ``ondelete="RESTRICT"`` on both foreign keys,
  preventing accidental deletion of the sealed programme or the sealing
  user while the seal exists.

- The ``portfolio_node_id`` is unique — only one seal may exist per
  programme root.

- The SHA-256 audit chain ensures that any modification to past audit
  entries breaks the hash chain for all subsequent entries.
"""
import hashlib
import json
import os
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID, uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import (
    UniversalBreakdownNode,
    PortfolioNode,
    DependencyLink,
    ResourceAssignment,
    NodeBlocker,
    ForensicAuditLog,
    PortfolioBaseline,
    BaselineNodeSnapshot,
    DocumentArtifact,
    ProgrammeArchiveSeal,
    User,
)


# ============================================================================
# Archive Package Structure
# ============================================================================


def _serialize_node_for_archive(node: Any) -> Dict[str, Any]:
    """Serialize a PortfolioNode for archive export.

    Parameters
    ----------
    node : PortfolioNode
        The node instance to serialize.

    Returns
    -------
    dict
        Flat dictionary of node data suitable for JSON serialization.
    """
    data = {
        "id": str(node.id),
        "parent_id": str(node.parent_id) if node.parent_id else None,
        "tree_type": node.tree_type.value if node.tree_type else None,
        "code": node.code,
        "name": node.name,
        "path": node.path,
        "security_classification": node.security_classification.value if node.security_classification else None,
        "caveats": node.caveats or [],
        "odac_permissions": node.odac_permissions or {},
        "custom_attributes": node.custom_attributes or {},
        "is_active": node.is_active,
        "created_at": node.created_at.isoformat() if node.created_at else None,
        "updated_at": node.updated_at.isoformat() if node.updated_at else None,
        "version_id": getattr(node, "version_id", None),
    }
    # PortfolioNode-specific fields
    if hasattr(node, "delivery_mode"):
        data["delivery_mode"] = node.delivery_mode.value if node.delivery_mode else None
        data["planned_start_date"] = node.planned_start_date.isoformat() if node.planned_start_date else None
        data["planned_end_date"] = node.planned_end_date.isoformat() if node.planned_end_date else None
        data["actual_start_date"] = node.actual_start_date.isoformat() if node.actual_start_date else None
        data["actual_end_date"] = node.actual_end_date.isoformat() if node.actual_end_date else None
        data["percent_complete"] = node.percent_complete
        data["pv"] = float(node.pv) if node.pv else None
        data["ev"] = float(node.ev) if node.ev else None
        data["ac"] = float(node.ac) if node.ac else None
        data["evm_technique"] = node.evm_technique.value if hasattr(node, "evm_technique") and node.evm_technique else None
        data["bac_cost"] = float(node.bac_cost) if hasattr(node, "bac_cost") and node.bac_cost else None
        data["planned_value"] = float(node.planned_value) if hasattr(node, "planned_value") and node.planned_value else None
        data["earned_value"] = float(node.earned_value) if hasattr(node, "earned_value") and node.earned_value else None
        data["actual_cost"] = float(node.actual_cost) if hasattr(node, "actual_cost") and node.actual_cost else None
        data["requires_vv_signoff"] = node.requires_vv_signoff if hasattr(node, "requires_vv_signoff") else None
        data["currency_code"] = node.currency_code if hasattr(node, "currency_code") else None
        data["contract_exchange_rate_id"] = str(node.contract_exchange_rate_id) if hasattr(node, "contract_exchange_rate_id") and node.contract_exchange_rate_id else None
        data["calendar_id"] = str(node.calendar_id) if hasattr(node, "calendar_id") and node.calendar_id else None
        data["export_control_regime"] = node.export_control_regime.value if hasattr(node, "export_control_regime") and node.export_control_regime else None
        data["eccn_or_usml_category"] = node.eccn_or_usml_category if hasattr(node, "eccn_or_usml_category") else None
        data["authorized_nationalities"] = node.authorized_nationalities if hasattr(node, "authorized_nationalities") else None
        data["taa_mla_reference"] = node.taa_mla_reference if hasattr(node, "taa_mla_reference") else None
        data["is_sandbox_branch"] = node.is_sandbox_branch if hasattr(node, "is_sandbox_branch") else None
        data["sandbox_scenario_id"] = str(node.sandbox_scenario_id) if hasattr(node, "sandbox_scenario_id") and node.sandbox_scenario_id else None
        data["origin_node_id"] = str(node.origin_node_id) if hasattr(node, "origin_node_id") and node.origin_node_id else None
    return data


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


# ============================================================================
# Archive Export
# ============================================================================


async def _export_programme_data(
    db: AsyncSession,
    root_node_id: UUID,
) -> Dict[str, Any]:
    """Export all programme data into a self-contained archive payload.

    Parameters
    ----------
    db : AsyncSession
        Database session.
    root_node_id : UUID
        UUID of the Programme root node.

    Returns
    -------
    dict
        Archive payload containing all programme data sections.
    """
    root_path = None
    result = await db.execute(
        select(UniversalBreakdownNode).where(UniversalBreakdownNode.id == root_node_id)
    )
    root_node = result.scalar_one_or_none()
    if root_node is None:
        raise ValueError(f"Programme root node {root_node_id} not found")
    root_path = root_node.path

    # Export all nodes in the sub-tree
    result = await db.execute(
        select(UniversalBreakdownNode).where(
            UniversalBreakdownNode.path.like(f"{root_path}%")
        )
    )
    all_nodes = result.scalars().all()
    nodes = [_serialize_node_for_archive(n) for n in all_nodes]

    # Export dependency links within the sub-tree
    node_ids = [n.id for n in all_nodes]
    result = await db.execute(
        select(DependencyLink).where(
            DependencyLink.predecessor_id.in_(node_ids)
        )
    )
    dependencies = []
    for dep in result.scalars().all():
        dependencies.append({
            "id": str(dep.id),
            "predecessor_id": str(dep.predecessor_id),
            "successor_id": str(dep.successor_id),
            "dependency_type": dep.dependency_type.value if dep.dependency_type else None,
            "lag_days": dep.lag_days,
        })

    # Export resource assignments
    result = await db.execute(
        select(ResourceAssignment).where(
            ResourceAssignment.portfolio_node_id.in_(node_ids)
        )
    )
    assignments = []
    for ra in result.scalars().all():
        assignments.append({
            "id": str(ra.id),
            "portfolio_node_id": str(ra.portfolio_node_id),
            "resource_node_id": str(ra.resource_node_id),
            "allocated_units": ra.allocated_units,
            "planned_hours": ra.planned_hours,
            "rate_snapshot": float(ra.rate_snapshot) if ra.rate_snapshot else None,
            "status": ra.status.value if ra.status else None,
        })

    # Export blockers
    result = await db.execute(
        select(NodeBlocker).where(
            NodeBlocker.portfolio_node_id.in_(node_ids)
        )
    )
    blockers = []
    for nb in result.scalars().all():
        blockers.append({
            "id": str(nb.id),
            "portfolio_node_id": str(nb.portfolio_node_id),
            "category": nb.category.value if nb.category else None,
            "severity": nb.severity.value if nb.severity else None,
            "impacted_hours": nb.impacted_hours,
            "resolved_at": nb.resolved_at.isoformat() if nb.resolved_at else None,
        })

    # Export baselines
    result = await db.execute(
        select(PortfolioBaseline).where(
            PortfolioBaseline.root_portfolio_node_id == root_node_id
        )
    )
    baselines = []
    for bl in result.scalars().all():
        baselines.append({
            "id": str(bl.id),
            "root_portfolio_node_id": str(bl.root_portfolio_node_id),
            "baseline_code": bl.baseline_code,
            "name": bl.name,
            "frozen_at": bl.frozen_at.isoformat() if bl.frozen_at else None,
            "frozen_by_user_id": str(bl.frozen_by_user_id),
            "bcr_reference": bl.bcr_reference,
            "is_active_target": bl.is_active_target,
        })

    # Export baseline snapshots
    baseline_ids = [bl.id for bl in result.scalars().all()] if baselines else []
    snapshots = []
    if baseline_ids:
        result = await db.execute(
            select(BaselineNodeSnapshot).where(
                BaselineNodeSnapshot.baseline_id.in_(baseline_ids)
            )
        )
        for snap in result.scalars().all():
            snapshots.append({
                "id": str(snap.id),
                "baseline_id": str(snap.baseline_id),
                "portfolio_node_id": str(snap.portfolio_node_id),
                "path": snap.path,
                "code": snap.code,
                "planned_start_date": snap.planned_start_date.isoformat() if snap.planned_start_date else None,
                "planned_end_date": snap.planned_end_date.isoformat() if snap.planned_end_date else None,
            })

    # Export audit log entries for this programme
    result = await db.execute(
        select(ForensicAuditLog).where(
            ForensicAuditLog.entity_id.in_(node_ids)
        ).order_by(ForensicAuditLog.created_at)
    )
    audit_entries = []
    for entry in result.scalars().all():
        audit_entries.append({
            "id": str(entry.id),
            "transaction_id": str(entry.transaction_id),
            "user_upn": entry.user_upn,
            "action_type": entry.action_type,
            "entity_type": entry.entity_type,
            "entity_id": str(entry.entity_id),
            "prev_hash": entry.prev_hash,
            "current_hash": entry.current_hash,
            "security_marking": entry.security_marking,
            "created_at": entry.created_at.isoformat() if entry.created_at else None,
        })

    # Export document artifacts
    result = await db.execute(
        select(DocumentArtifact).where(
            DocumentArtifact.portfolio_node_id.in_(node_ids)
        )
    )
    artifacts = []
    for art in result.scalars().all():
        artifacts.append({
            "id": str(art.id),
            "portfolio_node_id": str(art.portfolio_node_id),
            "file_name": art.file_name,
            "file_size_bytes": art.file_size_bytes,
            "sha256_checksum": art.sha256_checksum,
            "security_classification": art.security_classification.value if art.security_classification else None,
            "s3_object_key": art.s3_object_key,
        })

    return {
        "version": "1.0",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "root_node_id": str(root_node_id),
        "root_path": root_path,
        "nodes": nodes,
        "dependencies": dependencies,
        "assignments": assignments,
        "blockers": blockers,
        "baselines": baselines,
        "baseline_snapshots": snapshots,
        "audit_log": audit_entries,
        "artifacts": artifacts,
    }


async def _generate_archive_manifest(
    archive_data: Dict[str, Any],
) -> Dict[str, str]:
    """Generate a SHA-256 manifest of all archived entities.

    Parameters
    ----------
    archive_data : dict
        The complete archive payload.

    Returns
    -------
    dict
        Mapping of entity type to SHA-256 hash.
    """
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "archive_version": archive_data.get("version", "1.0"),
        "root_node_id": archive_data.get("root_node_id"),
        "entity_hashes": {},
    }

    # Hash each section
    for section in ["nodes", "dependencies", "assignments", "blockers",
                     "baselines", "baseline_snapshots", "audit_log", "artifacts"]:
        data = archive_data.get(section, [])
        manifest["entity_hashes"][section] = _compute_json_sha256(data)
        manifest["entity_hashes"][f"{section}_count"] = str(len(data))

    # Hash individual nodes
    for node in archive_data.get("nodes", []):
        node_id = node.get("id", "")
        manifest["entity_hashes"][f"node_{node_id}"] = _compute_json_sha256(node)

    # Hash individual audit entries (preserving chain order)
    for i, entry in enumerate(archive_data.get("audit_log", [])):
        manifest["entity_hashes"][f"audit_{i}_{entry.get('id', '')}"] = _compute_json_sha256(entry)

    # Overall manifest hash
    manifest["overall_hash"] = _compute_json_sha256(manifest["entity_hashes"])

    return manifest


def _sign_manifest(
    manifest: Dict[str, str],
    private_key_path: Optional[str] = None,
) -> Dict[str, str]:
    """Cryptographically sign the archive manifest.

    In production, this would use an HSM or local private key to create
    an RSA signature.  For now, it uses a deterministic SHA-256 hash
    as a placeholder signature.

    Parameters
    ----------
    manifest : dict
        The archive manifest to sign.
    private_key_path : str or None
        Path to the private key file (unused in placeholder mode).

    Returns
    -------
    dict
        Signature metadata.
    """
    # Placeholder: deterministic hash-based "signature"
    # In production, replace with RSA/ECDSA signing via HSM
    canonical = json.dumps(manifest, sort_keys=True, default=str)
    signature_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    return {
        "algorithm": "SHA-256-HMAC",
        "signature": signature_hash,
        "signed_at": datetime.now(timezone.utc).isoformat(),
        "note": "Placeholder signature — replace with HSM RSA signing in production",
    }


# ============================================================================
# Seal Programme
# ============================================================================


async def seal_programme_for_cold_storage(
    programme_id: UUID,
    user_id: UUID,
    db: AsyncSession,
    storage_vault_uri: Optional[str] = None,
) -> ProgrammeArchiveSeal:
    """Seal a programme for WORM cold-storage archival.

    This is the main entry point for programme closeout.  It performs
    the complete sealing workflow:

    1. Validates that the programme root exists and is not already sealed.
    2. Deactivates all nodes in the programme sub-tree.
    3. Exports all programme data into a self-contained archive.
    4. Generates a SHA-256 manifest of all archived entities.
    5. Signs the manifest (placeholder signature).
    6. Creates a ``ProgrammeArchiveSeal`` record linking the audit chain
       head to the archive manifest hash.
    7. Records a ``PROGRAMME_SEAL`` entry in the ForensicAuditLog.

    Parameters
    ----------
    programme_id : UUID
        UUID of the Programme root node to seal.
    user_id : UUID
        UUID of the user initiating the closeout.
    db : AsyncSession
        Database session.
    storage_vault_uri : str or None
        Path or URI to the cold-storage volume.  If not provided, a
        default path is generated.

    Returns
    -------
    ProgrammeArchiveSeal
        The newly created seal record.

    Raises
    ------
    ValueError
        If the programme root is not found, is already sealed, or is not
        a WBS node.
    """
    # Check that the programme root exists
    result = await db.execute(
        select(UniversalBreakdownNode).where(UniversalBreakdownNode.id == programme_id)
    )
    root_node = result.scalar_one_or_none()
    if root_node is None:
        raise ValueError(f"Programme root node {programme_id} not found")

    # Check that it's a WBS node
    if root_node.tree_type and root_node.tree_type.value != "WBS":
        raise ValueError(f"Node {programme_id} is not a WBS node (tree_type={root_node.tree_type})")

    # Check that it's not already sealed
    result = await db.execute(
        select(ProgrammeArchiveSeal).where(
            ProgrammeArchiveSeal.portfolio_node_id == programme_id
        )
    )
    existing_seal = result.scalar_one_or_none()
    if existing_seal is not None:
        raise ValueError(f"Programme {programme_id} is already sealed (seal_id={existing_seal.id})")

    # Verify the user exists
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    sealing_user = result.scalar_one_or_none()
    if sealing_user is None:
        raise ValueError(f"User {user_id} not found")

    root_path = root_node.path

    # Step 1: Deactivate all nodes in the sub-tree
    result = await db.execute(
        select(UniversalBreakdownNode).where(
            UniversalBreakdownNode.path.like(f"{root_path}%")
        )
    )
    all_nodes = result.scalars().all()
    for node in all_nodes:
        node.is_active = False

    await db.commit()

    # Step 2: Export all programme data
    archive_data = await _export_programme_data(db, programme_id)

    # Step 3: Generate SHA-256 manifest
    manifest = await _generate_archive_manifest(archive_data)

    # Step 4: Sign the manifest
    signature = _sign_manifest(manifest)

    # Step 5: Compute the archive manifest hash
    archive_manifest_json = json.dumps({**manifest, **signature}, sort_keys=True, default=str)
    archive_manifest_hash = _compute_sha256(archive_manifest_json)

    # Step 6: Get the current audit chain head
    result = await db.execute(
        select(ForensicAuditLog)
        .order_by(ForensicAuditLog.created_at.desc())
        .limit(1)
    )
    last_audit = result.scalar_one_or_none()
    final_sha256_audit_head = last_audit.current_hash if last_audit else "GENESIS"

    # Step 7: Generate storage vault URI if not provided
    if storage_vault_uri is None:
        code = root_node.code or "UNKNOWN"
        date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        storage_vault_uri = f"/vault/programmes/{code}/{date_str}/"

    # Step 8: Create the seal record
    seal = ProgrammeArchiveSeal(
        id=uuid4(),
        portfolio_node_id=programme_id,
        sealed_by_user_id=user_id,
        final_sha256_audit_head=final_sha256_audit_head,
        archive_manifest_hash=archive_manifest_hash,
        storage_vault_uri=storage_vault_uri,
        is_verified_intact=False,
    )
    db.add(seal)

    # Step 9: Write ForensicAuditLog entry
    audit_entry = ForensicAuditLog.create_entry(
        transaction_id=str(uuid4()),
        user_upn=sealing_user.email or "system",
        client_ip=None,
        action_type="PROGRAMME_SEAL",
        entity_type="ProgrammeArchiveSeal",
        entity_id=seal.id,
        json_diff={
            "programme_id": str(programme_id),
            "programme_code": root_node.code,
            "programme_name": root_node.name,
            "root_path": root_path,
            "nodes_deactivated": len(all_nodes),
            "archive_manifest_hash": archive_manifest_hash,
            "final_audit_head": final_sha256_audit_head,
            "storage_vault_uri": storage_vault_uri,
            "manifest": manifest,
            "signature": signature,
        },
        prev_hash=final_sha256_audit_head,
    )
    db.add(audit_entry)

    await db.commit()

    return seal


# ============================================================================
# Archive Package File Generation
# ============================================================================


async def generate_archive_package(
    db: AsyncSession,
    programme_id: UUID,
    output_dir: str = "/tmp/archives",
) -> str:
    """Generate a self-contained archive package file for a programme.

    Creates a ZIP archive containing:
    - ``payload.json``: The complete programme data export.
    - ``manifest.json``: The SHA-256 manifest of all entities.
    - ``signature.json``: The cryptographic signature metadata.

    Parameters
    ----------
    db : AsyncSession
        Database session.
    programme_id : UUID
        UUID of the Programme root node.
    output_dir : str
        Directory to write the archive file.

    Returns
    -------
    str
        Full path to the generated archive ZIP file.
    """
    os.makedirs(output_dir, exist_ok=True)

    archive_data = await _export_programme_data(db, programme_id)
    manifest = await _generate_archive_manifest(archive_data)
    signature = _sign_manifest(manifest)

    code = archive_data.get("root_node_id", "unknown")[:8]
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    filename = f"programme_archive_{code}_{date_str}.zip"
    filepath = os.path.join(output_dir, filename)

    with zipfile.ZipFile(filepath, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "payload.json",
            json.dumps(archive_data, indent=2, default=str)
        )
        zf.writestr(
            "manifest.json",
            json.dumps(manifest, indent=2, default=str)
        )
        zf.writestr(
            "signature.json",
            json.dumps(signature, indent=2, default=str)
        )

    return filepath


# ============================================================================
# Integrity Verification
# ============================================================================


async def verify_archive_integrity(
    archive_file_path: str,
    db: Optional[AsyncSession] = None,
) -> Dict[str, Any]:
    """Verify the tamper-evident integrity of an archive package.

    Re-computes hashes across the archived dataset, validates the
    embedded signature, and (if a database session is provided) verifies
    that the audit log chain links directly to the seal's
    ``final_sha256_audit_head``.

    Parameters
    ----------
    archive_file_path : str
        Path to the archive ZIP file.
    db : AsyncSession or None
        Optional database session for audit chain verification.

    Returns
    -------
    dict
        Verification report with the following keys:

        - ``archive_path`` (str): Path to the archive file.
        - ``intact`` (bool): Overall integrity status.
        - ``payload_hash_valid`` (bool): Whether payload hashes match.
        - ``signature_valid`` (bool): Whether the signature is valid.
        - ``audit_chain_valid`` (bool or None): Whether the audit chain
          links to the seal's head (None if no DB session provided).
        - ``entity_counts`` (dict): Count of each entity type.
        - ``errors`` (list[str]): List of any errors found.
    """
    report = {
        "archive_path": archive_file_path,
        "verified_at": datetime.now(timezone.utc).isoformat(),
        "intact": True,
        "payload_hash_valid": False,
        "signature_valid": False,
        "audit_chain_valid": None,
        "entity_counts": {},
        "errors": [],
    }

    if not os.path.exists(archive_file_path):
        report["intact"] = False
        report["errors"].append(f"Archive file not found: {archive_file_path}")
        return report

    try:
        with zipfile.ZipFile(archive_file_path, "r") as zf:
            # Read payload
            try:
                payload_str = zf.read("payload.json").decode("utf-8")
                payload = json.loads(payload_str)
            except (KeyError, json.JSONDecodeError) as e:
                report["intact"] = False
                report["errors"].append(f"Failed to read payload.json: {e}")
                return report

            # Read manifest
            try:
                manifest_str = zf.read("manifest.json").decode("utf-8")
                manifest = json.loads(manifest_str)
            except (KeyError, json.JSONDecodeError) as e:
                report["intact"] = False
                report["errors"].append(f"Failed to read manifest.json: {e}")
                return report

            # Read signature
            try:
                signature_str = zf.read("signature.json").decode("utf-8")
                signature = json.loads(signature_str)
            except (KeyError, json.JSONDecodeError) as e:
                report["intact"] = False
                report["errors"].append(f"Failed to read signature.json: {e}")
                return report

            # Verify entity hashes
            entity_hashes = manifest.get("entity_hashes", {})
            for section in ["nodes", "dependencies", "assignments", "blockers",
                            "baselines", "baseline_snapshots", "audit_log", "artifacts"]:
                data = payload.get(section, [])
                expected_hash = entity_hashes.get(section)
                actual_hash = _compute_json_sha256(data)
                if expected_hash and expected_hash != actual_hash:
                    report["intact"] = False
                    report["errors"].append(
                        f"Hash mismatch for '{section}': expected {expected_hash[:16]}..., got {actual_hash[:16]}..."
                    )
                report["entity_counts"][section] = len(data)

            # Verify overall manifest hash
            expected_overall = entity_hashes.get("overall_hash")
            actual_overall = _compute_json_sha256(entity_hashes)
            if expected_overall and expected_overall != actual_overall:
                report["intact"] = False
                report["errors"].append(
                    f"Overall manifest hash mismatch: expected {expected_overall[:16]}..., got {actual_overall[:16]}..."
                )

            report["payload_hash_valid"] = len([e for e in report["errors"] if "Hash mismatch" in e]) == 0

            # Verify signature
            canonical = json.dumps(manifest, sort_keys=True, default=str)
            expected_sig = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
            actual_sig = signature.get("signature", "")
            if expected_sig == actual_sig:
                report["signature_valid"] = True
            else:
                report["intact"] = False
                report["errors"].append("Signature verification failed")

            # Verify individual node hashes
            for node in payload.get("nodes", []):
                node_id = node.get("id", "")
                key = f"node_{node_id}"
                expected = entity_hashes.get(key)
                if expected:
                    actual = _compute_json_sha256(node)
                    if expected != actual:
                        report["intact"] = False
                        report["errors"].append(f"Node hash mismatch: {node_id}")

            # Verify audit chain integrity
            audit_entries = payload.get("audit_log", [])
            for i in range(1, len(audit_entries)):
                prev_entry = audit_entries[i - 1]
                curr_entry = audit_entries[i]
                if curr_entry.get("prev_hash") != prev_entry.get("current_hash"):
                    report["intact"] = False
                    report["errors"].append(
                        f"Audit chain broken at entry {i}: prev_hash mismatch"
                    )

            # Database audit chain verification
            if db is not None:
                root_node_id = payload.get("root_node_id")
                if root_node_id:
                    result = await db.execute(
                        select(ProgrammeArchiveSeal).where(
                            ProgrammeArchiveSeal.portfolio_node_id == root_node_id
                        )
                    )
                    seal = result.scalar_one_or_none()
                    if seal is not None:
                        # Check that the last audit entry's hash matches the seal's head
                        if audit_entries:
                            last_entry_hash = audit_entries[-1].get("current_hash")
                            if last_entry_hash == seal.final_sha256_audit_head:
                                report["audit_chain_valid"] = True
                            else:
                                report["intact"] = False
                                report["audit_chain_valid"] = False
                                report["errors"].append(
                                    f"Audit chain head mismatch: archive={last_entry_hash[:16]}..., seal={seal.final_sha256_audit_head[:16]}..."
                                )
                        # Update verification status
                        seal.is_verified_intact = report["intact"]
                        await db.commit()
                    else:
                        report["audit_chain_valid"] = None
                        report["errors"].append("No seal record found for this programme")

    except zipfile.BadZipFile as e:
        report["intact"] = False
        report["errors"].append(f"Invalid ZIP archive: {e}")
    except Exception as e:
        report["intact"] = False
        report["errors"].append(f"Verification error: {e}")

    return report
