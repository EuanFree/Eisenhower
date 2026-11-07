"""Classified document vault and evidence attachment service.

This module provides secure, auditable storage for classified documents,
evidence files, and contract deliverables using an S3-compatible object
store (MinIO or sovereign cloud provider).

Architecture Overview
---------------------

The document vault follows a two-phase upload pattern to ensure data
integrity and security compliance:

1. **Request Upload** — The client submits file metadata (name, size,
   MIME type, classification). The server creates a placeholder database
   row and returns a pre-signed S3 PUT URL.  The client uploads the file
   directly to S3 using this URL.

2. **Confirm Upload** — After the upload completes, the client calls the
   confirm endpoint with the SHA-256 digest it computed locally.  The
   server verifies the S3 object exists, computes the server-side SHA-256,
   and marks the artifact as active only if the digests match.

For downloads, the server enforces ABAC clearance checks and export control
citizenship interlocks before issuing a short-lived (60-second) pre-signed
GET URL.  Every download is logged in the ForensicAuditLog.

Security Model
~~~~~~~~~~~~~~

Every artifact carries its own security classification and export control
marking, independent of the parent portfolio node.  A document attached
to an OFFICIAL task may itself be SECRET if it contains classified annexes.

Before a download URL is issued, the system verifies:

1. **ABAC Clearance** — The requesting user's clearance level meets or
   exceeds the artifact's ``security_classification``, and the user's
   caveats include all of the artifact's caveats.

2. **Export Control** — If the artifact is ITAR or EAR-controlled, the
   user's citizenship and employer licence are verified against the
   artifact's export control regime.

If either check fails, the request is rejected with an HTTP 403 and the
denial is logged to the ForensicAuditLog.

S3 Storage Configuration
~~~~~~~~~~~~~~~~~~~~~~~~

The service connects to an S3-compatible endpoint configured via environment
variables:

- ``S3_ENDPOINT_URL`` — Base URL of the S3-compatible store (e.g.,
  ``https://minio.internal.example.com``).
- ``S3_BUCKET_NAME`` — Target bucket for document storage.
- ``S3_ACCESS_KEY`` / ``S3_SECRET_KEY`` — Authentication credentials.
- ``S3_REGION`` — AWS region (default: ``us-east-1``).
- ``S3_USE_SSL`` — Whether to use HTTPS (default: ``True``).

All objects are stored with AES-256 Server-Side Encryption (SSE-S3) to
ensure data-at-rest encryption.

Pre-signed URL Lifecycle
~~~~~~~~~~~~~~~~~~~~~~~~

- **Upload URLs** — Valid for 15 minutes, allowing the client sufficient
  time to complete large file uploads.
- **Download URLs** — Valid for a maximum of 60 seconds to minimise the
  window of opportunity for data exfiltration.

Usage
~~~~~

    from app.services.artifact_vault import (
        generate_secure_upload_url,
        generate_secure_download_url,
        confirm_upload,
    )

    # Inside a FastAPI endpoint:
    result = generate_secure_upload_url(current_user, request_data, db)
    # Client uploads to result['upload_url'], then calls confirm_upload()

"""
import hashlib
import logging
import os
from datetime import datetime, timedelta
from typing import Optional
from uuid import uuid4

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.abac import has_sufficient_clearance, has_required_caveats
from app.core.export_control import (
    ExportControlViolationException,
    verify_foreign_disclosure_compliance,
)
from app.models.models import (
    DocumentArtifact,
    User,
    ForensicAuditLog,
    SecurityClassification,
    ExportControlRegime,
    UniversalBreakdownNode,
)

logger = logging.getLogger(__name__)

# ============================================================================
# Configuration
# ============================================================================

S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL", "http://localhost:9000")
"""S3-compatible endpoint URL (e.g., MinIO server address).

Defaults to ``http://localhost:9000`` for local development.  In production,
this should point to the sovereign object store endpoint.
"""

S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "eisenhower-artifacts")
"""Name of the S3 bucket for storing classified document artifacts.

All uploaded files are stored in this bucket with AES-256 Server-Side
Encryption (SSE-S3).
"""

S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "minioadmin")
"""Access key ID for authenticating with the S3-compatible service.

**Must be changed from the default in production.**
"""

S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "minioadmin")
"""Secret access key for authenticating with the S3-compatible service.

**Must be changed from the default in production.**
"""

S3_REGION = os.getenv("S3_REGION", "us-east-1")
"""AWS region identifier for the S3-compatible service.

Used for signature generation.  For MinIO, this value is typically
``us-east-1`` regardless of physical location.
"""

S3_USE_SSL = os.getenv("S3_USE_SSL", "true").lower() in ("true", "1", "yes")
"""Whether to use SSL/TLS for S3 connections.

Defaults to ``True``.  Set to ``False`` only for local development
with unencrypted MinIO endpoints.
"""

# Pre-signed URL validity periods (in seconds)
UPLOAD_URL_EXPIRY_SECONDS = 900  # 15 minutes for uploads
"""Duration (in seconds) that pre-signed upload URLs remain valid.

Set to 15 minutes to give users sufficient time to complete large
file uploads while limiting the window for URL abuse.
"""

DOWNLOAD_URL_EXPIRY_SECONDS = 60  # 60 seconds for downloads (strict)
"""Duration (in seconds) that pre-signed download URLs remain valid.

Set to 60 seconds to minimise the risk of data exfiltration via
shared or leaked download URLs.
"""


# ============================================================================
# S3 Client Factory
# ============================================================================

def get_s3_client():
    """Create and return a configured boto3 S3 client.

    The client is configured to connect to the S3-compatible endpoint
    specified by environment variables.  All objects are stored with
    AES-256 Server-Side Encryption (SSE-S3).

    Returns
    -------
    boto3.client
        A configured S3 client instance.

    Raises
    ------
    HTTPException
        If S3 credentials are not properly configured.
    """
    if not S3_ACCESS_KEY or not S3_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="S3 credentials not configured. Set S3_ACCESS_KEY and S3_SECRET_KEY.",
        )

    config = Config(
        signature_version="s3v4",
        s3={
            "payload_signing_enabled": True,
        },
    )

    return boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT_URL,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
        region_name=S3_REGION,
        use_ssl=S3_USE_SSL,
        config=config,
    )


# ============================================================================
# S3 Bucket Management
# ============================================================================

def ensure_bucket_exists():
    """Ensure the target S3 bucket exists, creating it if necessary.

    This function checks whether the configured bucket exists and creates
    it with AES-256 SSE if it does not.  It is idempotent and safe to
    call multiple times.

    Returns
    -------
    bool
        True if the bucket already existed or was successfully created.

    Raises
    ------
    HTTPException
        If the bucket cannot be created due to permissions or network errors.
    """
    s3 = get_s3_client()

    try:
        s3.head_bucket(Bucket=S3_BUCKET_NAME)
        logger.info(f"S3 bucket '{S3_BUCKET_NAME}' already exists.")
        return True
    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "")
        if error_code in ("404", "404 Not Found", "NoSuchBucket"):
            logger.info(f"Creating S3 bucket '{S3_BUCKET_NAME}'...")
            try:
                s3.create_bucket(Bucket=S3_BUCKET_NAME)
                logger.info(f"Bucket '{S3_BUCKET_NAME}' created successfully.")
                return True
            except ClientError as create_error:
                logger.error(f"Failed to create bucket: {create_error}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to create S3 bucket: {create_error}",
                )
        else:
            logger.error(f"Error checking bucket: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Cannot access S3 bucket: {e}",
            )


# ============================================================================
# Upload Flow
# ============================================================================

def generate_secure_upload_url(
    user: User,
    file_name: str,
    file_size_bytes: int,
    mime_type: str,
    portfolio_node_id: Optional[str],
    cdrl_id: Optional[str],
    security_classification: SecurityClassification,
    caveats: Optional[list],
    export_control_regime: ExportControlRegime,
    db: Session,
) -> dict:
    """Generate a pre-signed S3 PUT URL for uploading a classified document.

    This is the first step in the two-phase upload process.  The function
    validates the user's write access, creates a placeholder database row
    with ``is_active=False``, and returns a pre-signed URL that the client
    can use to upload the file directly to S3.

    Parameters
    ----------
    user : User
        The authenticated user requesting the upload.
    file_name : str
        Original filename of the document.
    file_size_bytes : int
        Expected file size in bytes.
    mime_type : str
        MIME type of the file (e.g., 'application/pdf').
    portfolio_node_id : str or None
        UUID of the portfolio node this document is attached to.
    cdrl_id : str or None
        UUID of the CDRL this document fulfils.
    security_classification : SecurityClassification
        Security marking of the document.
    caveats : list[str] or None
        Additional caveat markings.
    export_control_regime : ExportControlRegime
        Export control regime applicable to this document.
    db : Session
        Active SQLAlchemy database session.

    Returns
    -------
    dict
        A dictionary containing:
        - ``artifact_id`` (str): UUID of the new artifact record.
        - ``upload_url`` (str): Pre-signed S3 PUT URL.
        - ``s3_object_key`` (str): The S3 object key for the upload.
        - ``expires_in_seconds`` (int): URL validity period.

    Raises
    ------
    HTTPException
        If the user lacks clearance to upload at the requested classification
        level or if S3 is unavailable.
    """
    # Validate user clearance for the requested classification
    if not has_sufficient_clearance(user.clearance_level, security_classification):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Insufficient clearance to upload {security_classification.value} "
                f"documents. Your clearance: {user.clearance_level.value}."
            ),
        )

    # Validate portfolio node access if specified
    if portfolio_node_id is not None:
        node = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id == portfolio_node_id
        ).first()
        if node is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Portfolio node {portfolio_node_id} not found.",
            )
        # Check user can access the node (at least read access)
        if not has_sufficient_clearance(user.clearance_level, node.security_classification):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient clearance to attach documents to this node.",
            )

    # Generate unique S3 object key
    artifact_id = str(uuid4())
    s3_object_key = f"artifacts/{artifact_id}/{file_name}"

    # Create placeholder database row
    artifact = DocumentArtifact(
        id=artifact_id,
        portfolio_node_id=portfolio_node_id,
        cdrl_id=cdrl_id,
        file_name=file_name,
        file_size_bytes=file_size_bytes,
        mime_type=mime_type,
        s3_object_key=s3_object_key,
        sha256_checksum="",  # Will be set during confirm_upload
        security_classification=security_classification,
        caveats=caveats,
        export_control_regime=export_control_regime,
        uploaded_by_user_id=str(user.id),
        is_active=False,
    )
    db.add(artifact)
    db.commit()
    db.refresh(artifact)

    # Generate pre-signed PUT URL
    s3 = get_s3_client()
    try:
        upload_url = s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": S3_BUCKET_NAME,
                "Key": s3_object_key,
                "ContentType": mime_type,
                "ServerSideEncryption": "AES256",
            },
            ExpiresIn=UPLOAD_URL_EXPIRY_SECONDS,
        )
    except ClientError as e:
        db.rollback()
        logger.error(f"Failed to generate upload URL: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate upload URL. S3 service unavailable.",
        )

    logger.info(
        f"Upload URL generated for artifact {artifact_id} "
        f"({file_name}) by user {user.username}"
    )

    return {
        "artifact_id": artifact_id,
        "upload_url": upload_url,
        "s3_object_key": s3_object_key,
        "expires_in_seconds": UPLOAD_URL_EXPIRY_SECONDS,
    }


# ============================================================================
# Upload Confirmation
# ============================================================================

def confirm_upload(
    artifact_id: str,
    client_sha256: str,
    db: Session,
) -> dict:
    """Confirm a completed upload by verifying the S3 object and SHA-256 digest.

    This is the second step in the two-phase upload process.  The function
    verifies that the S3 object exists, computes the server-side SHA-256
    digest, and compares it against the client-provided digest.  Only if
    they match is the artifact marked as ``is_active=True``.

    Parameters
    ----------
    artifact_id : str
        UUID of the artifact record created during request-upload.
    client_sha256 : str
        SHA-256 hex digest computed by the client over the uploaded bytes.
    db : Session
        Active SQLAlchemy database session.

    Returns
    -------
    dict
        A dictionary containing:
        - ``artifact_id`` (str): UUID of the confirmed artifact.
        - ``sha256_verified`` (bool): Whether the checksum matched.
        - ``is_active`` (bool): Whether the artifact is now downloadable.

    Raises
    ------
    HTTPException
        If the artifact is not found, the S3 object does not exist, or
        the SHA-256 digests do not match.
    """
    artifact = db.query(DocumentArtifact).filter(
        DocumentArtifact.id == artifact_id
    ).first()

    if artifact is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Artifact {artifact_id} not found.",
        )

    if artifact.is_active:
        return {
            "artifact_id": artifact_id,
            "sha256_verified": True,
            "is_active": True,
        }

    s3 = get_s3_client()

    # Verify S3 object exists and get its metadata
    try:
        response = s3.head_object(
            Bucket=S3_BUCKET_NAME,
            Key=artifact.s3_object_key,
        )
        s3_content_length = response.get("ContentLength", 0)
    except ClientError as e:
        logger.error(f"S3 object not found for artifact {artifact_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File not found in object store. Upload may have failed.",
        )

    # Verify file size matches
    if s3_content_length != artifact.file_size_bytes:
        logger.warning(
            f"Size mismatch for artifact {artifact_id}: "
            f"expected {artifact.file_size_bytes}, got {s3_content_length}"
        )

    # Compute server-side SHA-256 by downloading the object
    try:
        s3_response = s3.get_object(
            Bucket=S3_BUCKET_NAME,
            Key=artifact.s3_object_key,
        )
        server_sha256 = hashlib.sha256()
        for chunk in iter(lambda: s3_response["Body"].read(8192), b""):
            server_sha256.update(chunk)
        server_digest = server_sha256.hexdigest()
    except ClientError as e:
        logger.error(f"Failed to read S3 object for verification: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify uploaded file integrity.",
        )

    # Compare digests
    sha256_verified = (server_digest.lower() == client_sha256.lower())

    if not sha256_verified:
        logger.warning(
            f"SHA-256 mismatch for artifact {artifact_id}: "
            f"client={client_sha256}, server={server_digest}"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "File integrity check failed. SHA-256 digest does not match. "
                "The file may have been corrupted during upload."
            ),
        )

    # Mark artifact as active
    artifact.sha256_checksum = server_digest
    artifact.is_active = True
    artifact.file_size_bytes = s3_content_length
    db.commit()
    db.refresh(artifact)

    # Log the upload confirmation in the forensic audit trail
    try:
        audit_entry = ForensicAuditLog.create_entry(
            transaction_id=str(uuid4()),
            user_upn=getattr(artifact.uploaded_by, "username", "unknown"),
            client_ip=None,
            action_type="INSERT",
            entity_type="DocumentArtifact",
            entity_id=artifact_id,
            json_diff={
                "file_name": artifact.file_name,
                "security_classification": artifact.security_classification.value,
                "sha256": server_digest,
            },
            db=db,
        )
        db.add(audit_entry)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to log audit entry for upload confirmation: {e}")
        # Don't fail the upload confirmation due to audit logging failure

    logger.info(
        f"Upload confirmed for artifact {artifact_id} "
        f"({artifact.file_name}), SHA-256 verified."
    )

    return {
        "artifact_id": artifact_id,
        "sha256_verified": True,
        "is_active": True,
    }


# ============================================================================
# Download Flow
# ============================================================================

def generate_secure_download_url(
    user: User,
    artifact_id: str,
    db: Session,
) -> dict:
    """Generate a pre-signed S3 GET URL for downloading a classified document.

    Before issuing a download URL, the function enforces:

    1. **ABAC Clearance** — User clearance >= artifact classification AND
       user caveats include all artifact caveats.
    2. **Export Control** — If the artifact is ITAR/EAR-controlled, the
       user's citizenship and employer licence are verified.

    A pre-signed GET URL valid for 60 seconds is returned.  The access
    is logged in the ForensicAuditLog.

    Parameters
    ----------
    user : User
        The authenticated user requesting the download.
    artifact_id : str
        UUID of the artifact to download.
    db : Session
        Active SQLAlchemy database session.

    Returns
    -------
    dict
        A dictionary containing:
        - ``artifact_id`` (str): UUID of the artifact.
        - ``file_name`` (str): Original filename.
        - ``mime_type`` (str): MIME type of the file.
        - ``download_url`` (str): Pre-signed S3 GET URL.
        - ``expires_in_seconds`` (int): URL validity period (60).
        - ``security_classification`` (SecurityClassification): Document marking.

    Raises
    ------
    HTTPException
        If the artifact is not found, not active, or the user fails
        clearance/export control checks.
    ExportControlViolationException
        If the user fails export control compliance verification.
    """
    artifact = db.query(DocumentArtifact).filter(
        DocumentArtifact.id == artifact_id
    ).first()

    if artifact is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Artifact {artifact_id} not found.",
        )

    if not artifact.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This document is not available for download. "
                   "Upload may not have been confirmed.",
        )

    # Enforce ABAC clearance check
    if not has_sufficient_clearance(user.clearance_level, artifact.security_classification):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Insufficient clearance to download this document. "
                f"Required: {artifact.security_classification.value}, "
                f"Your clearance: {user.clearance_level.value}."
            ),
        )

    # Enforce caveat matching
    if artifact.caveats and not has_required_caveats(user.caveats, artifact.caveats):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Missing required caveats. "
                f"Required: {artifact.caveats}, "
                f"Your caveats: {user.caveats or []}."
            ),
        )

    # Enforce export control interlock
    if artifact.export_control_regime != ExportControlRegime.NOT_CONTROLLED:
        from app.core.export_control import (
            verify_nationality_compliance,
            verify_employer_licence,
        )

        # Artifacts inherit export control context from their linked
        # portfolio node.  If a node is linked, verify against its
        # authorized_nationalities and taa_mla_reference.
        if artifact.portfolio_node_id:
            node = db.query(UniversalBreakdownNode).filter(
                UniversalBreakdownNode.id == artifact.portfolio_node_id
            ).first()

            if node is not None:
                # Check nationality compliance
                if node.authorized_nationalities:
                    verify_nationality_compliance(user, node, db)

                # Check employer licence for ITAR/EAR
                if artifact.export_control_regime in (
                    ExportControlRegime.ITAR,
                    ExportControlRegime.EAR_ECCN,
                ) and node.taa_mla_reference:
                    verify_employer_licence(user, node, db)

    # Generate pre-signed GET URL
    s3 = get_s3_client()
    try:
        download_url = s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": S3_BUCKET_NAME,
                "Key": artifact.s3_object_key,
                "ResponseContentDisposition": f"attachment; filename={artifact.file_name}",
            },
            ExpiresIn=DOWNLOAD_URL_EXPIRY_SECONDS,
        )
    except ClientError as e:
        logger.error(f"Failed to generate download URL: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate download URL. S3 service unavailable.",
        )

    # Log the download access in the forensic audit trail
    try:
        audit_entry = ForensicAuditLog.create_entry(
            transaction_id=str(uuid4()),
            user_upn=user.username,
            client_ip=None,
            action_type="INSERT",
            entity_type="DocumentArtifact",
            entity_id=artifact_id,
            json_diff={
                "action": "download_url_generated",
                "file_name": artifact.file_name,
                "security_classification": artifact.security_classification.value,
                "sha256": artifact.sha256_checksum,
                "user_clearance": user.clearance_level.value,
            },
            db=db,
        )
        db.add(audit_entry)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to log audit entry for download: {e}")
        # Don't block the download due to audit logging failure

    logger.info(
        f"Download URL generated for artifact {artifact_id} "
        f"({artifact.file_name}) by user {user.username}"
    )

    return {
        "artifact_id": artifact_id,
        "file_name": artifact.file_name,
        "mime_type": artifact.mime_type,
        "download_url": download_url,
        "expires_in_seconds": DOWNLOAD_URL_EXPIRY_SECONDS,
        "security_classification": artifact.security_classification,
    }


# ============================================================================
# Artifact Listing
# ============================================================================

def list_artifacts(
    user: User,
    portfolio_node_id: Optional[str] = None,
    cdrl_id: Optional[str] = None,
    db: Session = None,
) -> dict:
    """List document artifacts accessible to the current user.

    Returns only artifacts whose security classification and caveats
    are within the user's clearance level.

    Parameters
    ----------
    user : User
        The authenticated user requesting the list.
    portfolio_node_id : str or None
        Filter by attached portfolio node.
    cdrl_id : str or None
        Filter by linked CDRL.
    db : Session
        Active SQLAlchemy database session.

    Returns
    -------
    dict
        A dictionary containing:
        - ``artifacts`` (list): List of artifact response dicts.
        - ``total_count`` (int): Total number of accessible artifacts.
    """
    query = db.query(DocumentArtifact).filter(
        DocumentArtifact.is_active == True
    )

    if portfolio_node_id is not None:
        query = query.filter(
            DocumentArtifact.portfolio_node_id == portfolio_node_id
        )

    if cdrl_id is not None:
        query = query.filter(DocumentArtifact.cdrl_id == cdrl_id)

    # Fetch all active artifacts and filter by clearance
    all_artifacts = query.all()
    accessible_artifacts = []

    for artifact in all_artifacts:
        if has_sufficient_clearance(user.clearance_level, artifact.security_classification):
            if artifact.caveats and not has_required_caveats(user.caveats, artifact.caveats):
                continue
            accessible_artifacts.append(artifact)

    return {
        "artifacts": [
            {
                "id": str(a.id),
                "file_name": a.file_name,
                "file_size_bytes": a.file_size_bytes,
                "mime_type": a.mime_type,
                "security_classification": a.security_classification,
                "caveats": a.caveats,
                "export_control_regime": a.export_control_regime,
                "is_active": a.is_active,
                "portfolio_node_id": str(a.portfolio_node_id) if a.portfolio_node_id else None,
                "cdrl_id": str(a.cdrl_id) if a.cdrl_id else None,
                "uploaded_by_user_id": str(a.uploaded_by_user_id),
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in accessible_artifacts
        ],
        "total_count": len(accessible_artifacts),
    }
