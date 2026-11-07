"""API router for the classified document vault and evidence attachment service.

This module exposes the endpoints for uploading, confirming, and downloading
classified documents through the S3-compatible object store.  All endpoints
require JWT authentication and enforce ABAC clearance checks and export
control interlocks.

Endpoints
---------

POST /api/v1/artifacts/request-upload
    Prepare artifact metadata and emit a pre-signed S3 PUT URL for upload.

POST /api/v1/artifacts/confirm-upload
    Validate S3 object existence, verify SHA-256 digest, and mark artifact
    as active and available for download.

GET /api/v1/artifacts/{artifact_id}/download-url
    Emit an authenticated pre-signed S3 GET URL valid for 60 seconds.

GET /api/v1/artifacts/
    List all artifacts accessible to the current user based on clearance.

Security Considerations
-----------------------

- All endpoints require a valid JWT token via the ``get_current_user`` dependency.
- Upload requests are validated against the user's clearance level — a user
  cannot upload a document classified above their clearance.
- Download URLs are only issued after ABAC clearance and export control checks
  pass.  URLs expire after 60 seconds to minimise data exfiltration risk.
- Every download is logged in the ForensicAuditLog with the user's identity
  and the artifact's classification marking.

Usage
~~~~~

    # Request an upload URL:
    POST /api/v1/artifacts/request-upload
    {
        "file_name": "safety-report.pdf",
        "file_size_bytes": 1048576,
        "mime_type": "application/pdf",
        "security_classification": "SECRET",
        "export_control_regime": "ITAR"
    }

    # After uploading to the returned URL, confirm:
    POST /api/v1/artifacts/confirm-upload
    {
        "artifact_id": "uuid...",
        "sha256_checksum": "abc123..."
    }

    # Request a download URL:
    GET /api/v1/artifacts/{artifact_id}/download-url

"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.models import User, SecurityClassification, ExportControlRegime
from app.schemas.schemas import (
    ArtifactUploadRequest,
    ArtifactUploadResponse,
    ArtifactConfirmUploadRequest,
    ArtifactConfirmUploadResponse,
    ArtifactDownloadResponse,
    ArtifactResponse,
    ArtifactListResponse,
    ExternalRepositoryArtifactCreate,
    ExternalRepositoryArtifactResponse,
    ExternalRepositoryArtifactListResponse,
    WindchillWebhookPayload,
    GitWebhookPayload,
)
from app.services.artifact_vault import (
    generate_secure_upload_url,
    confirm_upload,
    generate_secure_download_url,
    list_artifacts,
)
from app.services.artifact_linking_service import (
    link_artifact,
    ingest_windchill_webhook,
    ingest_git_webhook,
    get_node_artifacts,
)

router = APIRouter()


@router.post(
    "/request-upload",
    response_model=ArtifactUploadResponse,
    summary="Request a pre-signed upload URL",
    description=(
        "Prepare artifact metadata and emit a pre-signed S3 PUT URL for "
        "uploading a classified document. The client uploads the file directly "
        "to S3 using the returned URL, then calls /confirm-upload to verify "
        "integrity and activate the artifact."
    ),
)
def request_upload(
    request: ArtifactUploadRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ArtifactUploadResponse:
    """Request a pre-signed S3 PUT URL for uploading a classified document.

    This endpoint creates a placeholder database row and returns a pre-signed
    URL that the client can use to upload the file directly to the S3-compatible
    object store.  After the upload completes, the client must call
    ``/confirm-upload`` to verify the SHA-256 digest and activate the artifact.

    Parameters
    ----------
    request : ArtifactUploadRequest
        File metadata including name, size, MIME type, classification, and
        optional portfolio node / CDRL linkage.
    current_user : User
        The authenticated user requesting the upload.
    db : Session
        Active SQLAlchemy database session.

    Returns
    -------
    ArtifactUploadResponse
        The artifact ID, pre-signed upload URL, S3 object key, and expiry time.

    Raises
    ------
    HTTPException
        If the user lacks clearance to upload at the requested classification
        level or if S3 is unavailable.
    """
    result = generate_secure_upload_url(
        user=current_user,
        file_name=request.file_name,
        file_size_bytes=request.file_size_bytes,
        mime_type=request.mime_type,
        portfolio_node_id=request.portfolio_node_id,
        cdrl_id=request.cdrl_id,
        security_classification=request.security_classification,
        caveats=request.caveats,
        export_control_regime=request.export_control_regime,
        db=db,
    )

    return ArtifactUploadResponse(**result)


@router.post(
    "/confirm-upload",
    response_model=ArtifactConfirmUploadResponse,
    summary="Confirm a completed upload",
    description=(
        "Validate that the S3 object exists, verify the SHA-256 digest "
        "matches the client-provided value, and mark the artifact as active "
        "and available for download."
    ),
)
def confirm_upload_endpoint(
    request: ArtifactConfirmUploadRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ArtifactConfirmUploadResponse:
    """Confirm a completed upload by verifying the S3 object and SHA-256 digest.

    After the client uploads the file to the pre-signed URL returned by
    ``/request-upload``, it calls this endpoint to confirm the upload.
    The server verifies the S3 object exists, computes the server-side
    SHA-256 digest, and compares it against the client-provided value.
    Only if they match is the artifact marked as active.

    Parameters
    ----------
    request : ArtifactConfirmUploadRequest
        The artifact ID and SHA-256 hex digest computed by the client.
    current_user : User
        The authenticated user confirming the upload.
    db : Session
        Active SQLAlchemy database session.

    Returns
    -------
    ArtifactConfirmUploadResponse
        Confirmation that the upload was verified and the artifact is active.

    Raises
    ------
    HTTPException
        If the artifact is not found, the S3 object does not exist, or
        the SHA-256 digests do not match.
    """
    result = confirm_upload(
        artifact_id=request.artifact_id,
        client_sha256=request.sha256_checksum,
        db=db,
    )

    return ArtifactConfirmUploadResponse(**result)


@router.get(
    "/{artifact_id}/download-url",
    response_model=ArtifactDownloadResponse,
    summary="Generate a pre-signed download URL",
    description=(
        "Emit an authenticated pre-signed S3 GET URL valid for a maximum "
        "of 60 seconds. Enforces ABAC clearance checks and export control "
        "citizenship interlocks before issuing the URL."
    ),
)
def download_url(
    artifact_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ArtifactDownloadResponse:
    """Generate a pre-signed S3 GET URL for downloading a classified document.

    Before issuing a download URL, the system enforces:

    1. **ABAC Clearance** — User clearance >= artifact classification AND
       user caveats include all artifact caveats.
    2. **Export Control** — If the artifact is ITAR/EAR-controlled, the
       user's citizenship and employer licence are verified.

    The returned URL is valid for 60 seconds.  Every download is logged
    in the ForensicAuditLog.

    Parameters
    ----------
    artifact_id : str
        UUID of the artifact to download.
    current_user : User
        The authenticated user requesting the download.
    db : Session
        Active SQLAlchemy database session.

    Returns
    -------
    ArtifactDownloadResponse
        The artifact metadata, pre-signed download URL, and expiry time.

    Raises
    ------
    HTTPException
        If the artifact is not found, not active, or the user fails
        clearance/export control checks.
    """
    result = generate_secure_download_url(
        user=current_user,
        artifact_id=artifact_id,
        db=db,
    )

    return ArtifactDownloadResponse(**result)


@router.get(
    "/",
    response_model=ArtifactListResponse,
    summary="List accessible artifacts",
    description=(
        "List all document artifacts accessible to the current user based "
        "on their security clearance and caveat matching. Optionally filter "
        "by portfolio node or CDRL."
    ),
)
def list_artifacts_endpoint(
    portfolio_node_id: Optional[str] = None,
    cdrl_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ArtifactListResponse:
    """List document artifacts accessible to the current user.

    Returns only artifacts whose security classification and caveats
    are within the user's clearance level.

    Parameters
    ----------
    portfolio_node_id : str or None
        Filter by attached portfolio node.
    cdrl_id : str or None
        Filter by linked CDRL.
    current_user : User
        The authenticated user requesting the list.
    db : Session
        Active SQLAlchemy database session.

    Returns
    -------
    ArtifactListResponse
        List of accessible artifacts and total count.
    """
    result = list_artifacts(
        user=current_user,
        portfolio_node_id=portfolio_node_id,
        cdrl_id=cdrl_id,
        db=db,
    )

    return ArtifactListResponse(**result)


# ============================================================================
# External Repository Artifact Linking Endpoints
# ============================================================================


@router.post(
    "/link",
    response_model=dict,
    summary="Link an external repository artifact to a WBS node",
    description=(
        "Manually or programmatically attach an external artifact "
        "(Windchill, Git, DOORS) to a WBS node.  If the artifact is "
        "already in a terminal lifecycle state and drives_progress is True, "
        "the task's physical progress is advanced immediately."
    ),
)
def link_repository_artifact(
    request: ExternalRepositoryArtifactCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Link an external repository artifact to a WBS node."""
    try:
        artifact = link_artifact(
            db=db,
            portfolio_node_id=request.portfolio_node_id,
            repository_type=request.repository_type,
            external_identifier=request.external_identifier,
            title=request.title,
            version_revision=request.version_revision,
            lifecycle_state=request.lifecycle_state,
            verification_hash=request.verification_hash,
            drives_progress=request.drives_progress,
            milestone_weight_step_id=request.milestone_weight_step_id,
            external_url=request.external_url,
            extra_metadata=request.extra_metadata,
        )
        return {
            "id": str(artifact.id),
            "portfolio_node_id": str(artifact.portfolio_node_id),
            "repository_type": artifact.repository_type.value,
            "external_identifier": artifact.external_identifier,
            "title": artifact.title,
            "lifecycle_state": artifact.lifecycle_state.value,
            "message": "Artifact linked successfully",
        }
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )


@router.post(
    "/webhook/windchill",
    response_model=dict,
    summary="Ingest a Windchill REST event webhook payload",
    description=(
        "Process Windchill LifeCycle change events and update the "
        "corresponding artifact link.  When an artifact transitions to "
        "RELEASED or APPROVED and drives_progress is True, the linked "
        "task's physical progress is automatically advanced."
    ),
)
def windchill_webhook(
    payload: WindchillWebhookPayload,
    db: Session = Depends(get_db),
) -> dict:
    """Ingest a Windchill REST event webhook payload."""
    artifact = ingest_windchill_webhook(
        db=db,
        event_type=payload.event_type,
        object_type=payload.object_type,
        object_id=payload.object_id,
        part_number=payload.part_number,
        title=payload.title,
        revision=payload.revision,
        lifecycle_state=payload.lifecycle_state,
        owner=payload.owner,
        timestamp=payload.timestamp,
        verification_hash=payload.verification_hash,
    )
    if artifact is None:
        return {"message": "No matching artifact found, no action taken"}
    return {
        "id": str(artifact.id),
        "external_identifier": artifact.external_identifier,
        "lifecycle_state": artifact.lifecycle_state.value,
        "message": "Windchill event processed successfully",
    }


@router.post(
    "/webhook/git",
    response_model=dict,
    summary="Ingest a Git release/tag push webhook payload",
    description=(
        "Process Git release and tag push payloads.  Tagged releases "
        "are marked as RELEASED; branch pushes are marked as DRAFT."
    ),
)
def git_webhook(
    payload: GitWebhookPayload,
    db: Session = Depends(get_db),
) -> dict:
    """Ingest a Git release/tag push webhook payload."""
    artifact = ingest_git_webhook(
        db=db,
        event_type=payload.event_type,
        repository_url=payload.repository_url,
        repository_name=payload.repository_name,
        commit_hash=payload.commit_hash,
        tag_name=payload.tag_name,
        branch=payload.branch,
        message=payload.message,
        author=payload.author,
        timestamp=payload.timestamp,
    )
    if artifact is None:
        return {"message": "No matching artifact found, no action taken"}
    return {
        "id": str(artifact.id),
        "external_identifier": artifact.external_identifier,
        "lifecycle_state": artifact.lifecycle_state.value,
        "message": "Git event processed successfully",
    }


@router.get(
    "/node/{node_id}",
    response_model=ExternalRepositoryArtifactListResponse,
    summary="Retrieve all linked repository artifacts for a WBS node",
    description=(
        "Return all external repository artifacts linked to the given "
        "WBS node, including their current lifecycle states and any "
        "earned value contribution from progress-driving artifacts."
    ),
)
def get_artifacts_for_node(
    node_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExternalRepositoryArtifactListResponse:
    """Retrieve all linked repository artifacts for a WBS node."""
    result = get_node_artifacts(db=db, node_id=node_id)
    return ExternalRepositoryArtifactListResponse(**result)
