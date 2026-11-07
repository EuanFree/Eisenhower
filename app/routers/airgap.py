"""API router for the offline cross-domain data exchange (airgap) module.

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

"""
from typing import Optional
import asyncio

from fastapi import APIRouter, Depends, File, Form, HTTPException, status, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import User, SecurityClassification, UniversalBreakdownNode, LockOperationType
from app.schemas.schemas import (
    AirgapExportRequest,
    AirgapExportResponse,
    AirgapImportResponse,
)
from app.services.airgap import (
    export_airgap_package,
    ingest_airgap_package,
)
from app.services.lock_manager import acquire_subtree_lock
from app.utils.auth import get_current_user

router = APIRouter()


@router.post(
    "/export",
    response_model=AirgapExportResponse,
    summary="Export a project as a .defpack bundle",
    description=(
        "Generate a signed and encrypted ``.defpack`` bundle for a project "
        "sub-tree.  The bundle includes PortfolioNodes, DependencyLinks, "
        "ResourceAssignments, PortfolioBaselines, and relevant ForensicAuditLog "
        "entries.  Before packaging, any node whose classification exceeds the "
        "target ceiling is redacted to prevent data spillage.\n\n"
        "The resulting ``.defpack`` file is a ZIP archive containing:\n"
        "- ``payload.json`` — Canonical JSON with version 1.0.\n"
        "- ``manifest.json`` — SHA-256 hashes of each payload section.\n"
        "- ``signature.bin`` — Signature of the manifest for integrity verification.\n\n"
        "The bundle is streamed as a file download with the appropriate "
        "Content-Disposition header."
    ),
)
def export_bundle(
    request: AirgapExportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Generate and stream a .defpack bundle for download.

    This endpoint extracts the entire project sub-tree, redacts any nodes
    exceeding the classification ceiling, and packages everything into a
    signed ``.defpack`` ZIP archive.  The archive is returned as a file
    download with the appropriate MIME type and Content-Disposition header.

    Parameters
    ----------
    request : AirgapExportRequest
        The project ID and classification ceiling for the export.
    current_user : User
        The authenticated user initiating the export.
    db : Session
        Active SQLAlchemy database session.

    Returns
    -------
    Response
        A streaming response containing the ``.defpack`` ZIP archive with
        ``application/zip`` content type and a ``Content-Disposition`` header
        for file download.

    Raises
    ------
    HTTPException
        If the project node is not found, the user lacks clearance, or the
        export fails for any other reason.
    """
    # Verify user clearance meets the ceiling
    user_clearance = getattr(current_user, "clearance_level", SecurityClassification.OFFICIAL)
    from app.core.abac import CLEARANCE_LEVELS

    if CLEARANCE_LEVELS.get(user_clearance, 0) < CLEARANCE_LEVELS.get(request.classification_ceiling, 0):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"User clearance {user_clearance.value} insufficient for "
                f"export ceiling {request.classification_ceiling.value}"
            ),
        )

    # Generate the bundle
    archive_bytes = export_airgap_package(
        project_id=request.project_id,
        target_classification_ceiling=request.classification_ceiling,
        user=current_user,
        db=db,
    )

    # Stream the bundle as a file download
    filename = f"defpack_{request.project_id[:8]}.defpack"
    return Response(
        content=archive_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(archive_bytes)),
        },
    )


@router.post(
    "/import",
    response_model=AirgapImportResponse,
    summary="Import a .defpack bundle",
    description=(
        "Ingest an uploaded ``.defpack`` file into the target air-gapped "
        "PostgreSQL instance.  The import process performs:\n\n"
        "1. **Signature Verification** — Verifies the package signature "
        "against the manifest.\n"
        "2. **Schema Validation** — Validates the JSON structure against "
        "the expected schema.\n"
        "3. **Replay Attack Prevention** — Checks for duplicate transaction "
        "IDs.\n"
        "4. **Classification Check** — Verifies the importer's clearance.\n"
        "5. **Node Merge** — Creates new records with reparented ltree paths.\n"
        "6. **Audit Logging** — Records an ``AIRGAP_INGEST`` entry.\n\n"
        "Returns an import validation report indicating success or rejection."
    ),
)
def import_bundle(
    defpack_file: UploadFile = File(
        ...,
        description="The .defpack ZIP archive to import.",
    ),
    parent_node_id: Optional[str] = Form(
        None,
        description=(
            "UUID of the parent node under which to reparent the imported "
            "tree.  If omitted, the imported tree becomes a new root."
        ),
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AirgapImportResponse:
    """Ingest an uploaded .defpack file and return an import validation report.

    This endpoint accepts a ``.defpack`` ZIP archive uploaded via multipart
    form data.  It performs a multi-stage validation and merge process:
    signature verification, schema validation, replay attack detection,
    classification check, and node merge with ltree reparenting.

    Parameters
    ----------
    defpack_file : UploadFile
        The uploaded ``.defpack`` ZIP archive.
    parent_node_id : str or None
        UUID of the parent node under which to reparent the imported tree.
        If omitted, the imported tree becomes a new root.
    current_user : User
        The authenticated user initiating the import.
    db : Session
        Active SQLAlchemy database session.

    Returns
    -------
    AirgapImportResponse
        An import validation report containing the status, counts of
        imported entities, and any warnings or errors.

    Raises
    ------
    HTTPException
        If the file is not a valid ``.defpack`` archive, the signature
        verification fails, or the user lacks clearance.
    """
    # Validate file extension
    if not defpack_file.filename or not defpack_file.filename.endswith(".defpack"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must have a .defpack extension",
        )

    # Read the file bytes
    file_bytes = defpack_file.file.read()

    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )

    # Determine the lock path based on parent_node_id
    lock_path = "root"  # default: lock the entire tree
    if parent_node_id:
        parent_node = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id == parent_node_id
        ).first()
        if parent_node:
            lock_path = parent_node.path

    # Perform the import within a sub-tree lock
    loop = asyncio.new_event_loop()
    try:
        report = loop.run_until_complete(
            _import_with_lock(
                db, lock_path, file_bytes, parent_node_id, current_user.id
            )
        )
    finally:
        loop.close()

    return AirgapImportResponse(**report)


async def _import_with_lock(
    db: Session,
    lock_path: str,
    file_bytes: bytes,
    parent_node_id: Optional[str],
    user_id: int,
) -> dict:
    """Ingest airgap package within a sub-tree lock.

    Parameters
    ----------
    db : Session
        Database session.
    lock_path : str
        Ltree path to lock (parent node path or "root").
    file_bytes : bytes
        The .defpack file content.
    parent_node_id : str or None
        UUID of the parent node for reparenting.
    user_id : int
        ID of the user initiating the import.

    Returns
    -------
    dict
        Import validation report.
    """
    async with acquire_subtree_lock(
        db, lock_path, LockOperationType.AIRGAP_IMPORT, user_id, ttl_seconds=120
    ):
        report = ingest_airgap_package(
            defpack_file=file_bytes,
            parent_node_id=parent_node_id,
            user_id=user_id,
            db=db,
        )
        return report
