"""Merkle tree synchronization router for offline multi-site reconciliation.

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
    curl -H "Authorization: Bearer $TOKEN" \
         "http://localhost:8000/api/v1/merkle-sync/manifest?root_node_id=$UUID"

    # Ingest remote delta pack
    curl -H "Authorization: Bearer $TOKEN" \
         -F "file=@remote.merklepack" \
         "http://localhost:8000/api/v1/merkle-sync/reconcile-delta"

"""
import hashlib
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.models import User
from pydantic import BaseModel, Field
from typing import Optional

from app.schemas.schemas import (
    MerkleManifestResponse,
    MerkleComparisonResponse,
    MerkleDeltaExportResponse,
    MerkleReconcileResponse,
)
from app.services.merkle_sync import (
    MerkleSyncService,
    MerkleManifest,
    MerkleReconciliationEngine,
    ThreeWayReconciliationResult,
    MerkleMergeStaging,
    CCBMergeCommit,
)


# ---------------------------------------------------------------------------
# Pydantic schemas for CCB arbitration endpoints
# ---------------------------------------------------------------------------


class CCBResolveRequest(BaseModel):
    resolution: str = Field(..., description="KEEP_LOCAL, ACCEPT_REMOTE, or SYNTHESIZE")
    synthesized_state: Optional[dict] = Field(None, description="Required if resolution is SYNTHESIZE")


class CCBSignRequest(BaseModel):
    officer_number: int = Field(..., ge=1, le=2, description="Officer number (1 or 2)")


class CCBCommitRequest(BaseModel):
    entry_ids: list[str] = Field(..., description="List of staging entry IDs to commit")


router = APIRouter()


@router.get("/manifest", response_model=MerkleManifestResponse)
async def get_merkle_manifest(
    root_node_id: UUID,
    site_id: str = "",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate the current Merkle tree manifest for a programme sub-tree.

    This endpoint traverses the entire sub-tree rooted at the given
    PortfolioNode, computing SHA-256 leaf hashes for every node,
    dependency link, and resource assignment.  It then recursively
    combines hashes upward along the ltree hierarchy to produce a
    single root Merkle digest.

    The root hash can be compared with a manifest from another site
    to determine if the two instances are in perfect sync (identical
    root hashes) or have diverged.

    Parameters
    ----------
    root_node_id : UUID
        The root PortfolioNode whose sub-tree should be included in
        the manifest.
    site_id : str
        Optional identifier of the local site (e.g., 'Warton').
    db : AsyncSession
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    MerkleManifestResponse
        Complete manifest with root hash, entity counts, and the
        full Merkle tree structure.

    Raises
    ------
    HTTPException
        404 if the root node is not found.
        403 if the user lacks clearance to access the root node.
    """
    service = MerkleSyncService(
        db=db,
        user_id=current_user.id,
        site_id=site_id,
    )

    try:
        manifest = await service.generate_subsystem_merkle_tree(root_node_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return MerkleManifestResponse(**manifest.to_dict())


@router.post("/reconcile-delta", response_model=MerkleReconcileResponse)
async def reconcile_delta_pack(
    file: UploadFile = File(..., description="The .merklepack file to ingest"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ingest an offline .merklepack bundle with three-way version tracking.

    This endpoint accepts a ``.merklepack`` file (ZIP archive) containing
    divergent records from a remote air-gapped site.  It verifies the
    embedded SHA-256 signature, then resolves each mutation using
    three-way version tracking:

    1. **Forward Mutation** — If the incoming ``version_id`` is greater
       than the local version and parentage is unchanged, the mutation
       is applied directly.

    2. **Conflict Staging** — If both local and incoming branches were
       mutated concurrently, the conflict is staged into an isolated
       SandboxScenario for the Lead Systems Engineer to review.

    3. **Parentage Change** — If the incoming node's ltree path differs
       from the local path, the conflict is staged into a SandboxScenario.

    Parameters
    ----------
    file : UploadFile
        The ``.merklepack`` ZIP archive to ingest.
    db : AsyncSession
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    MerkleReconcileResponse
        Detailed result with counts of applied mutations, staged
        conflicts, sandbox scenario IDs, and any errors.

    Raises
    ------
    HTTPException
        400 if the file is not a valid .merklepack archive.
        403 if the user lacks clearance to perform reconciliation.
    """
    if not file.filename.endswith(".merklepack"):
        raise HTTPException(
            status_code=400,
            detail="File must be a .merklepack archive.",
        )

    delta_pack_bytes = await file.read()
    if not delta_pack_bytes:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty.",
        )

    service = MerkleSyncService(
        db=db,
        user_id=current_user.id,
    )

    result = await service.ingest_merkle_delta_pack(
        delta_pack_bytes,
        user_id=current_user.id,
    )

    return MerkleReconcileResponse(**result.to_dict())


@router.post("/compare", response_model=MerkleComparisonResponse)
async def compare_manifests(
    root_node_id: UUID = Form(..., description="Root node UUID for comparison"),
    remote_manifest_json: str = Form(..., description="Remote Merkle manifest as JSON string"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Compare a remote Merkle manifest against the local state.

    This endpoint generates a fresh local manifest for the specified
    root node, then compares it against the remote manifest provided
    as a JSON string.  It returns a detailed divergence report
    identifying exactly which nodes, dependencies, and assignments
    differ between the two instances.

    Parameters
    ----------
    root_node_id : UUID
        The root PortfolioNode for comparison.
    remote_manifest_json : str
        The remote Merkle manifest as a JSON-encoded string.
    db : AsyncSession
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    MerkleComparisonResponse
        Detailed comparison with lists of added, removed, modified,
        and divergent entities.

    Raises
    ------
    HTTPException
        400 if the remote manifest is not valid JSON.
        404 if the root node is not found.
    """
    import json

    try:
        remote_data = json.loads(remote_manifest_json)
        remote_manifest = MerkleManifest.from_dict(remote_data)
    except (json.JSONDecodeError, KeyError) as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid remote manifest: {str(e)}",
        )

    service = MerkleSyncService(
        db=db,
        user_id=current_user.id,
    )

    try:
        local_manifest = await service.generate_subsystem_merkle_tree(root_node_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    comparison = service.compare_merkle_manifests(local_manifest, remote_manifest)
    return MerkleComparisonResponse(**comparison.to_dict())


@router.post("/export-delta", response_model=MerkleDeltaExportResponse)
async def export_delta_pack(
    root_node_id: UUID = Form(..., description="Root node UUID for delta export"),
    remote_manifest_json: str = Form(..., description="Remote Merkle manifest as JSON string"),
    site_id: str = Form("", description="Local site identifier"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export only the divergent records as a signed .merklepack file.

    This endpoint compares the local state against a remote manifest,
    identifies all divergent records, and packages them into a
    cryptographically signed ``.merklepack`` archive for transfer
    to another air-gapped site.

    Parameters
    ----------
    root_node_id : UUID
        The root PortfolioNode for delta export.
    remote_manifest_json : str
        The remote Merkle manifest as a JSON-encoded string.
    site_id : str
        Optional identifier of the local site.
    db : AsyncSession
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    MerkleDeltaExportResponse
        Metadata about the exported delta pack (counts, size, signature).

    Raises
    ------
    HTTPException
        400 if the remote manifest is not valid JSON.
        404 if the root node is not found.
    """
    import json

    try:
        remote_data = json.loads(remote_manifest_json)
        remote_manifest = MerkleManifest.from_dict(remote_data)
    except (json.JSONDecodeError, KeyError) as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid remote manifest: {str(e)}",
        )

    service = MerkleSyncService(
        db=db,
        user_id=current_user.id,
        site_id=site_id,
    )

    try:
        local_manifest = await service.generate_subsystem_merkle_tree(root_node_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    comparison = service.compare_merkle_manifests(local_manifest, remote_manifest)

    if comparison.identical:
        raise HTTPException(
            status_code=400,
            detail="Local and remote manifests are identical — no delta to export.",
        )

    delta_pack = await service.export_merkle_delta_pack(
        divergent_node_ids=comparison.divergent_node_ids,
        divergent_dependency_ids=comparison.divergent_dependency_ids,
        divergent_assignment_ids=comparison.divergent_assignment_ids,
    )

    return MerkleDeltaExportResponse(
        node_count=len(comparison.divergent_node_ids),
        dependency_count=len(comparison.divergent_dependency_ids),
        assignment_count=len(comparison.divergent_assignment_ids),
        pack_size_bytes=len(delta_pack),
        signature=hashlib.sha256(delta_pack).hexdigest(),
    )


# ============================================================================
# CCB Arbitration Endpoints
# ============================================================================

# In-memory store for reconciliation engines keyed by session ID
_reconciliation_engines: dict = {}


@router.get("/ccb-staging")
async def get_ccb_staging(
    session_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all staged Merkle merge conflicts requiring CCB arbitration.

    Returns the reconciliation result including auto-merged count,
    conflicts staged, and all staging entries with their current status.

    Parameters
    ----------
    session_id : str or None
        Optional session ID to filter by reconciliation session.
    db : AsyncSession
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    dict
        Reconciliation result with staging entries.
    """
    # If no session provided, return empty result
    if session_id and session_id in _reconciliation_engines:
        engine = _reconciliation_engines[session_id]
        entries = engine.get_staging_entries()
        return {
            "ancestor_hash": "",
            "auto_merged_count": 0,
            "conflicts_staged": len(entries),
            "staging_entries": [e.to_dict() for e in entries],
            "divergent_paths": [],
            "errors": [],
        }

    return {
        "ancestor_hash": "",
        "auto_merged_count": 0,
        "conflicts_staged": 0,
        "staging_entries": [],
        "divergent_paths": [],
        "errors": [],
    }


@router.post("/reconcile-three-way")
async def reconcile_three_way(
    root_node_id: str = Form(..., description="Root node UUID for reconciliation"),
    remote_manifest_json: str = Form(..., description="Remote Merkle manifest as JSON string"),
    site_id: str = Form("", description="Local site identifier"),
    remote_site_id: str = Form("", description="Remote site identifier"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Perform 3-way reconciliation between local and remote manifests.

    Computes the common ancestor, auto-merges non-conflicting branches,
    and quarantines conflicts for CCB arbitration.

    Parameters
    ----------
    root_node_id : str
        Root node UUID for reconciliation.
    remote_manifest_json : str
        Remote Merkle manifest as JSON string.
    site_id : str
        Local site identifier.
    remote_site_id : str
        Remote site identifier.
    db : AsyncSession
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    dict
        Three-way reconciliation result.
    """
    import json as json_mod
    from uuid import UUID as PyUUID

    try:
        remote_data = json_mod.loads(remote_manifest_json)
        remote_manifest = MerkleManifest.from_dict(remote_data)
    except (json_mod.JSONDecodeError, KeyError) as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid remote manifest: {str(e)}",
        )

    service = MerkleSyncService(
        db=db,
        user_id=current_user.id,
        site_id=site_id,
    )

    try:
        local_manifest = await service.generate_subsystem_merkle_tree(
            PyUUID(root_node_id)
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Create reconciliation engine
    engine = MerkleReconciliationEngine(
        db=db,
        local_site_id=site_id,
        remote_site_id=remote_site_id,
    )

    result = engine.reconcile_three_way(local_manifest, remote_manifest)

    # Store engine for later CCB operations
    session_id = str(uuid.uuid4())
    _reconciliation_engines[session_id] = engine

    return {
        **result.to_dict(),
        "session_id": session_id,
    }


@router.post("/ccb-resolve/{entry_id}")
async def resolve_ccb_conflict(
    entry_id: str,
    request: CCBResolveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resolve a single CCB conflict entry.

    Parameters
    ----------
    entry_id : str
        The ID of the staging entry to resolve.
    request : CCBResolveRequest
        Resolution choice and optional synthesized state.
    db : AsyncSession
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    dict
        Updated staging entry.
    """
    # Find the engine containing this entry
    engine = None
    for eng in _reconciliation_engines.values():
        entry = eng.get_staging_entry(entry_id)
        if entry is not None:
            engine = eng
            break

    if engine is None:
        raise HTTPException(
            status_code=404,
            detail=f"Staging entry {entry_id} not found",
        )

    try:
        resolved = engine.resolve_conflict(
            entry_id,
            request.resolution,
            request.synthesized_state,
        )
        return resolved.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/ccb-sign/{entry_id}")
async def sign_ccb_entry(
    entry_id: str,
    request: CCBSignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Stage a CCB officer signature on a resolved conflict entry.

    Parameters
    ----------
    entry_id : str
        The ID of the staging entry.
    request : CCBSignRequest
        Officer number for the signature.
    db : AsyncSession
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    dict
        Updated staging entry.
    """
    engine = None
    for eng in _reconciliation_engines.values():
        entry = eng.get_staging_entry(entry_id)
        if entry is not None:
            engine = eng
            break

    if engine is None:
        raise HTTPException(
            status_code=404,
            detail=f"Staging entry {entry_id} not found",
        )

    try:
        # Generate a simple signature token
        import hashlib as hl
        signature = hl.sha256(
            f"{current_user.id}:{entry_id}:{request.officer_number}".encode()
        ).hexdigest()

        signed = engine.stage_ccb_signature(
            entry_id,
            request.officer_number,
            current_user.id,
            signature,
        )
        return signed.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/ccb-commit")
async def commit_ccb_merge(
    request: CCBCommitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Commit resolved and signed CCB entries.

    Validates dual-officer signatures and applies the resolved changes
    in an atomic database transaction.

    Parameters
    ----------
    request : CCBCommitRequest
        List of staging entry IDs to commit.
    db : AsyncSession
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    dict
        List of merge commit records.
    """
    engine = None
    for eng in _reconciliation_engines.values():
        for entry_id in request.entry_ids:
            entry = eng.get_staging_entry(entry_id)
            if entry is not None:
                engine = eng
                break
        if engine is not None:
            break

    if engine is None:
        raise HTTPException(
            status_code=404,
            detail="No staging entries found",
        )

    try:
        commits = engine.commit_resolved_entries(request.entry_ids)

        # Log forensic audit entries
        from app.models.models import ForensicAuditLog
        import uuid as uuid_mod

        for commit in commits:
            audit_entry = ForensicAuditLog.create_entry(
                transaction_id=commit.commit_id,
                user_upn=f"user-{current_user.id}",
                client_ip=None,
                action_type="MERKLE_CCB_MERGE_COMMITTED",
                entity_type="MerkleSync",
                entity_id=commit.reconciliation_id,
                json_diff={
                    "resolution": "committed",
                    "officer_1": commit.officer_1_user_id,
                    "officer_2": commit.officer_2_user_id,
                    "audit_block_hash": commit.audit_block_hash,
                },
            )
            db.add(audit_entry)

        await db.commit()

        return {
            "commits": [c.to_dict() for c in commits],
            "entries_committed": len(commits),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


