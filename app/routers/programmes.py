"""Programme closeout and cold-storage archival endpoints.

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
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.models import (
    UniversalBreakdownNode,
    ProgrammeArchiveSeal,
    User,
)
from app.schemas.schemas import (
    ProgrammeSealRequest,
    ProgrammeSealResponse,
    ArchiveVerifyRequest,
    ArchiveVerifyResponse,
    ProgrammeArchiveSealResponse,
)
from app.services.archival import (
    seal_programme_for_cold_storage,
    verify_archive_integrity,
)

router = APIRouter()


@router.post(
    "/{programme_id}/seal",
    response_model=ProgrammeSealResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Seal programme for cold storage",
    description=(
        "Execute programme closeout and initiate cold-storage package "
        "generation.  This endpoint deactivates all nodes in the programme "
        "sub-tree, exports all programme data, generates a SHA-256 manifest, "
        "and creates a tamper-evident ProgrammeArchiveSeal record."
    ),
)
async def seal_programme(
    programme_id: UUID,
    request: ProgrammeSealRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Seal a programme for WORM cold-storage archival.

    Parameters
    ----------
    programme_id : UUID
        UUID of the Programme root node to seal.
    request : ProgrammeSealRequest
        Optional storage_vault_uri override.
    db : AsyncSession
        Database session.
    current_user : User
        Authenticated user initiating the closeout.

    Returns
    -------
    ProgrammeSealResponse
        Details of the newly created seal record.

    Raises
    ------
    HTTPException
        404 if the programme root is not found.
        400 if the programme is already sealed or is not a WBS node.
    """
    # Check that the programme root exists
    result = await db.execute(
        select(UniversalBreakdownNode).where(UniversalBreakdownNode.id == programme_id)
    )
    root_node = result.scalar_one_or_none()
    if root_node is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Programme root node {programme_id} not found",
        )

    # Check that it's a WBS node
    if root_node.tree_type and root_node.tree_type.value != "WBS":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Node {programme_id} is not a WBS node (tree_type={root_node.tree_type})",
        )

    # Check that it's not already sealed
    result = await db.execute(
        select(ProgrammeArchiveSeal).where(
            ProgrammeArchiveSeal.portfolio_node_id == programme_id
        )
    )
    existing_seal = result.scalar_one_or_none()
    if existing_seal is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Programme {programme_id} is already sealed (seal_id={existing_seal.id})",
        )

    try:
        seal = await seal_programme_for_cold_storage(
            programme_id=programme_id,
            user_id=current_user.id,
            db=db,
            storage_vault_uri=request.storage_vault_uri,
        )

        # Count deactivated nodes
        root_path = root_node.path
        result = await db.execute(
            select(UniversalBreakdownNode).where(
                UniversalBreakdownNode.path.like(f"{root_path}%")
            )
        )
        nodes_deactivated = len(result.scalars().all())

        return ProgrammeSealResponse(
            seal_id=str(seal.id),
            programme_id=str(programme_id),
            programme_code=root_node.code or "",
            programme_name=root_node.name or "",
            sealed_at=seal.sealed_at.isoformat() if seal.sealed_at else "",
            sealed_by_user=current_user.email or current_user.username or "",
            nodes_deactivated=nodes_deactivated,
            archive_manifest_hash=seal.archive_manifest_hash,
            final_sha256_audit_head=seal.final_sha256_audit_head,
            storage_vault_uri=seal.storage_vault_uri,
            audit_log_id=str(seal.id),  # audit_log_id is the seal's own ID
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post(
    "/archive/verify",
    response_model=ArchiveVerifyResponse,
    summary="Verify archive integrity",
    description=(
        "Upload an archive manifest to verify tamper-evident data integrity "
        "against the historic audit ledger.  Re-computes hashes across the "
        "archived dataset, validates the embedded signature, and confirms "
        "that the audit log chain links to the seal's head."
    ),
)
async def verify_archive(
    request: ArchiveVerifyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Verify the tamper-evident integrity of an archive package.

    Parameters
    ----------
    request : ArchiveVerifyRequest
        Archive file path to verify.
    db : AsyncSession
        Database session.
    current_user : User
        Authenticated user requesting verification.

    Returns
    -------
    ArchiveVerifyResponse
        Verification report with integrity status and any errors.

    Raises
    ------
    HTTPException
        400 if the archive file path is invalid.
    """
    try:
        report = await verify_archive_integrity(
            archive_file_path=request.archive_file_path,
            db=db,
        )

        return ArchiveVerifyResponse(
            archive_path=report["archive_path"],
            verified_at=report.get("verified_at", ""),
            intact=report["intact"],
            payload_hash_valid=report["payload_hash_valid"],
            signature_valid=report["signature_valid"],
            audit_chain_valid=report.get("audit_chain_valid"),
            entity_counts={k: v for k, v in report.get("entity_counts", {}).items()},
            errors=report.get("errors", []),
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Archive verification failed: {e}",
        )


@router.get(
    "/{programme_id}/seal",
    response_model=ProgrammeArchiveSealResponse,
    summary="Get programme seal record",
    description=(
        "Retrieve the seal record for a programme, if one exists.  Returns "
        "the cryptographic hashes, storage vault URI, and verification status."
    ),
)
async def get_programme_seal(
    programme_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve the seal record for a programme.

    Parameters
    ----------
    programme_id : UUID
        UUID of the Programme root node.
    db : AsyncSession
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    ProgrammeArchiveSealResponse
        Seal record details.

    Raises
    ------
    HTTPException
        404 if no seal record exists for this programme.
    """
    result = await db.execute(
        select(ProgrammeArchiveSeal).where(
            ProgrammeArchiveSeal.portfolio_node_id == programme_id
        )
    )
    seal = result.scalar_one_or_none()
    if seal is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No seal record found for programme {programme_id}",
        )

    return ProgrammeArchiveSealResponse(
        id=str(seal.id),
        portfolio_node_id=str(seal.portfolio_node_id),
        sealed_at=seal.sealed_at.isoformat() if seal.sealed_at else "",
        sealed_by_user_id=str(seal.sealed_by_user_id),
        final_sha256_audit_head=seal.final_sha256_audit_head,
        archive_manifest_hash=seal.archive_manifest_hash,
        storage_vault_uri=seal.storage_vault_uri,
        is_verified_intact=seal.is_verified_intact,
    )
