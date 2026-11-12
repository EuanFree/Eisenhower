"""Admin security router for session management, spillage remediation, and SBOM.

This module provides the administrative security endpoints required by
UK MOD JSP 440 / JSP 604 and US DoD IL5/IL6 guidelines:

1. **Heartbeat** — Client-side session keep-alive to prevent inactivity
   timeout (``POST /api/v1/auth/heartbeat``).

2. **Spillage Purge** — Multi-signature emergency data redaction for
   classified spillage events (``POST /api/v1/admin/security/spillage/purge``).

3. **Audit Certificates** — Historic spillage redaction certificates for
   external security accreditation boards
   (``GET /api/v1/admin/security/spillage/audit-certificates``).

4. **SBOM Download** — Download the active signed CycloneDX SBOM manifest
   (``GET /api/v1/admin/security/sbom``).

5. **Vulnerability Report** — Returns active CVE matches, affected libraries,
   CVSS scores, and mitigation guidance
   (``GET /api/v1/admin/security/vulnerability-report``).

Session Heartbeat
~~~~~~~~~~~~~~~~~

In a SCIF environment, an unattended terminal is a security risk.  The
client sends periodic heartbeat pings to keep the session alive.  If
the elapsed time since the last heartbeat exceeds 900 seconds (15
minutes), the session is invalidated and the client receives HTTP 401
with header ``X-Session-Terminated: INACTIVITY_TIMEOUT``.

Spillage Purge
~~~~~~~~~~~~~~

When classified data is accidentally disclosed to an unauthorized system
or personnel, the contaminated content must be surgically redacted.
This endpoint requires multi-signature authorization from two Superusers
with clearance at or above SECRET.

Usage
~~~~~

.. code-block:: python

    # Heartbeat — keep session alive
    POST /api/v1/auth/heartbeat

    # Execute spillage purge
    POST /api/v1/admin/security/spillage/purge
    {
        "incident_ticket_ref": "INC-2026-0042",
        "search_terms": ["CLASSIFIED_PROGRAM_NAME"],
        "purging_user_ids": [1, 2]
    }

    # Retrieve audit certificates
    GET /api/v1/admin/security/spillage/audit-certificates
"""
import json
from typing import Any, Dict, List, Optional
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.utils.auth import require_admin
from app.models.models import User
from app.core.session import (
    session_manager,
    INACTIVITY_TIMEOUT_SECONDS,
    INACTIVITY_WARNING_SECONDS,
)
from app.services.spillage_remediation import (
    execute_emergency_spillage_purge,
    get_spillage_audit_certificates,
    verify_purge_authorization,
)
from app.services.cve_triage import (
    CVETriage,
    CVETriageError,
    VulnerabilityMatch,
)


router = APIRouter()
"""FastAPI router for admin security endpoints.

Provides session heartbeat, spillage purge, and audit certificate
endpoints for classified operational environments.
"""


@router.get("/system-config", summary="Get system configuration settings")
def get_system_config():
    """Return active SCIF idle timeout and session settings."""
    return {
        "SCIF_IDLE_TIMEOUT_SECONDS": 180,
        "SESSION_TIMEOUT_MINUTES": 15,
        "INACTIVITY_TIMEOUT_SECONDS": INACTIVITY_TIMEOUT_SECONDS,
        "INACTIVITY_WARNING_SECONDS": INACTIVITY_WARNING_SECONDS,
    }


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------

class HeartbeatRequest(BaseModel):
    """Request body for the session heartbeat endpoint.

    Parameters
    ----------
    token_jti : str
        JWT token JTI (JWT ID) identifying the session to keep alive.
    """
    token_jti: str = Field(
        ...,
        description="JWT token JTI identifying the session.",
    )


class HeartbeatResponse(BaseModel):
    """Response from the session heartbeat endpoint.

    Attributes
    ----------
    status : str
        Session status (``ACTIVE`` or ``EXPIRED``).
    remaining_seconds : int
        Seconds remaining until inactivity timeout.
    is_warning_zone : bool
        Whether the session is in the warning zone (14–15 minutes).
    """
    status: str
    remaining_seconds: int
    is_warning_zone: bool


class SpillagePurgeRequest(BaseModel):
    """Request body for the emergency spillage purge endpoint.

    Parameters
    ----------
    incident_ticket_ref : str
        Security incident ticket reference authorizing the purge.
    search_terms : list of str, optional
        Text patterns to search for in node names and codes.
    entity_ids : list of str, optional
        Specific entity UUIDs to redact.
    purging_user_ids : list of int
        User IDs of the two signing Superusers.
    certificate_serials : list of str, optional
        Smartcard certificate serial numbers for each signer.
    """
    incident_ticket_ref: str = Field(
        ...,
        description="Security incident ticket reference.",
    )
    search_terms: Optional[List[str]] = Field(
        None,
        description="Text patterns to search for in contaminated content.",
    )
    entity_ids: Optional[List[str]] = Field(
        None,
        description="Specific entity UUIDs to redact.",
    )
    purging_user_ids: List[int] = Field(
        ...,
        min_length=2,
        description="User IDs of the two signing Superusers.",
    )
    certificate_serials: Optional[List[str]] = Field(
        None,
        description="Smartcard certificate serial numbers for each signer.",
    )


class SpillagePurgeResponse(BaseModel):
    """Response from the emergency spillage purge endpoint.

    Attributes
    ----------
    incident_ticket_ref : str
        The incident ticket reference.
    redacted_nodes : list of str
        UUIDs of nodes that were redacted.
    redacted_node_count : int
        Number of nodes redacted.
    tombstoned_audit_count : int
        Number of audit entries tombstoned.
    certificate_id : str
        UUID of the redaction certificate audit entry.
    purging_officers : list of str
        UPNs of the purging officers.
    timestamp : str
        ISO timestamp of the purge.
    """
    incident_ticket_ref: str
    redacted_nodes: List[str]
    redacted_node_count: int
    tombstoned_audit_count: int
    certificate_id: str
    purging_officers: List[str]
    timestamp: str


class AuditCertificateResponse(BaseModel):
    """Response model for a single spillage redaction certificate.

    Attributes
    ----------
    id : str
        Certificate audit entry ID.
    incident_ticket_ref : str
        Incident ticket reference.
    purging_officers : list of str
        UPNs of purging officers.
    redacted_node_count : int
        Number of nodes redacted.
    tombstoned_audit_count : int
        Number of audit entries tombstoned.
    signed_at : str
        ISO timestamp of the certificate.
    certificate_hash : str
        SHA-256 hash of the certificate.
    created_at : str or None
        ISO timestamp when the certificate was created.
    """
    id: str
    incident_ticket_ref: str
    purging_officers: List[str]
    redacted_node_count: int
    tombstoned_audit_count: int
    signed_at: str
    certificate_hash: str
    created_at: Optional[str]


class AuditCertificatesListResponse(BaseModel):
    """Response model for the list of spillage redaction certificates.

    Attributes
    ----------
    certificates : list of AuditCertificateResponse
        List of certificate records.
    total_count : int
        Total number of certificates.
    """
    certificates: List[AuditCertificateResponse]
    total_count: int


# ---------------------------------------------------------------------------
# Heartbeat Endpoint
# ---------------------------------------------------------------------------

@router.post(
    "/heartbeat",
    response_model=HeartbeatResponse,
    summary="Session heartbeat — keep session alive",
    description=(
        "Updates the last-activity timestamp for the current session. "
        "If the session has exceeded the 15-minute inactivity timeout, "
        "the token is invalidated and HTTP 401 is returned."
    ),
)
def heartbeat(
    request: HeartbeatRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Session heartbeat endpoint.

    Touches the session timestamp to keep it alive.  If the elapsed
    time since the last heartbeat exceeds 900 seconds (15 minutes),
    the session is invalidated.

    Parameters
    ----------
    request : HeartbeatRequest
        The heartbeat request containing the token JTI.
    current_user : User
        The authenticated admin user.
    db : Session
        Database session.

    Returns
    -------
    HeartbeatResponse
        Session status with remaining time and warning zone flag.

    Raises
    ------
    HTTPException
        401 if the session has expired due to inactivity.
    """
    token_jti = request.token_jti

    # Check if the session is still valid
    is_valid, reason = session_manager.check_session(token_jti)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Session terminated: {reason}",
            headers={"X-Session-Terminated": reason},
        )

    # Touch the session to update last-activity timestamp
    session_manager.touch_session(token_jti)

    # Get session info for the response
    session_info = session_manager.get_session_info(token_jti)

    return HeartbeatResponse(
        status="ACTIVE",
        remaining_seconds=session_info["remaining_seconds"] if session_info else 0,
        is_warning_zone=session_info["is_warning_zone"] if session_info else False,
    )


# ---------------------------------------------------------------------------
# Spillage Purge Endpoint
# ---------------------------------------------------------------------------

@router.post(
    "/spillage/purge",
    response_model=SpillagePurgeResponse,
    summary="Execute emergency classified spillage purge",
    description=(
        "Surgically redacts contaminated content from nodes matching "
        "the provided search terms or entity IDs.  Requires multi-signature "
        "authorization from two Superusers with clearance ≥ SECRET. "
        "Records a SPILLAGE_REDACTION_CERTIFICATE in the immutable audit log."
    ),
)
def spillage_purge(
    request: SpillagePurgeRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Execute an emergency classified spillage purge.

    Redacts contaminated content from nodes while preserving the
    integrity of the forensic audit trail.  Requires authorization
    from two Superusers with clearance at or above SECRET.

    Parameters
    ----------
    request : SpillagePurgeRequest
        The purge request with incident ticket, search terms or entity
        IDs, and purging user IDs.
    current_user : User
        The authenticated admin user.
    db : Session
        Database session.

    Returns
    -------
    SpillagePurgeResponse
        Purge result with redacted node count, tombstoned audit count,
        and certificate ID.

    Raises
    ------
    HTTPException
        400 if the request is invalid.
        403 if multi-signature authorization is not met.
        500 if an unexpected error occurs during the purge.
    """
    # Convert entity_ids from strings to UUIDs
    entity_ids = None
    if request.entity_ids:
        from uuid import UUID
        entity_ids = [UUID(eid) for eid in request.entity_ids]

    try:
        result = execute_emergency_spillage_purge(
            db=db,
            incident_ticket_ref=request.incident_ticket_ref,
            search_terms=request.search_terms,
            entity_ids=entity_ids,
            purging_user_ids=request.purging_user_ids,
            certificate_serials=request.certificate_serials,
        )

        return SpillagePurgeResponse(
            incident_ticket_ref=result["incident_ticket_ref"],
            redacted_nodes=result["redacted_nodes"],
            redacted_node_count=result["redacted_node_count"],
            tombstoned_audit_count=result["tombstoned_audit_count"],
            certificate_id=result["certificate_id"],
            purging_officers=result["purging_officers"],
            timestamp=result["timestamp"],
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e),
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Spillage purge failed: {str(e)}",
        )


# ---------------------------------------------------------------------------
# Audit Certificates Endpoint
# ---------------------------------------------------------------------------

@router.get(
    "/spillage/audit-certificates",
    response_model=AuditCertificatesListResponse,
    summary="Retrieve historic spillage redaction certificates",
    description=(
        "Returns all SPILLAGE_REDACTION_CERTIFICATE entries from the "
        "ForensicAuditLog, optionally filtered by incident ticket reference. "
        "Used by external security accreditation boards to verify that "
        "spillage remediation was properly authorized and executed."
    ),
)
def spillage_audit_certificates(
    incident_ticket_ref: Optional[str] = None,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Retrieve historic spillage redaction certificates.

    Returns all SPILLAGE_REDACTION_CERTIFICATE entries from the
    ForensicAuditLog, optionally filtered by incident ticket reference.

    Parameters
    ----------
    incident_ticket_ref : str, optional
        Filter certificates by incident ticket reference.
    current_user : User
        The authenticated admin user.
    db : Session
        Database session.

    Returns
    -------
    AuditCertificatesListResponse
        List of certificate records with total count.
    """
    certificates = get_spillage_audit_certificates(
        db, incident_ticket_ref
    )

    return AuditCertificatesListResponse(
        certificates=[
            AuditCertificateResponse(**cert) for cert in certificates
        ],
        total_count=len(certificates),
    )


# ---------------------------------------------------------------------------
# SBOM / Vulnerability Report — Pydantic Schemas
# ---------------------------------------------------------------------------

SBOM_OUTPUT_PATH = Path("dist/sbom/cyclonedx.json")


class SBOMManifestResponse(BaseModel):
    """Response model for the SBOM manifest download endpoint.

    Attributes
    ----------
    bom_format : str
        SBOM format identifier (``CycloneDX``).
    spec_version : str
        CycloneDX specification version.
    component_count : int
        Total number of components in the manifest.
    timestamp : str
        Manifest generation timestamp.
    signed : bool
        Whether the manifest has been cryptographically signed.
    signature_path : str or None
        Path to the detached signature file, if signed.
    """

    bom_format: str
    spec_version: str
    component_count: int
    timestamp: str
    signed: bool
    signature_path: Optional[str]


class VulnerabilityMatchResponse(BaseModel):
    """Response model for a single vulnerability match.

    Attributes
    ----------
    cve_id : str
        CVE identifier.
    component_name : str
        Affected component name.
    component_version : str
        Affected component version.
    component_type : str
        Component type.
    cvss_score : float
        CVSS base score.
    severity : str
        Severity rating.
    description : str
        Vulnerability description.
    mitigation : str
        Mitigation guidance.
    cpe_match : str
        Matching CPE string.
    """

    cve_id: str
    component_name: str
    component_version: str
    component_type: str
    cvss_score: float
    severity: str
    description: str
    mitigation: str
    cpe_match: str


class VulnerabilitySummaryResponse(BaseModel):
    """Response model for the vulnerability summary.

    Attributes
    ----------
    total_matches : int
        Total number of vulnerability matches.
    critical_count : int
        Number of critical vulnerabilities.
    high_count : int
        Number of high-severity vulnerabilities.
    medium_count : int
        Number of medium-severity vulnerabilities.
    low_count : int
        Number of low-severity vulnerabilities.
    affected_components : list of str
        List of affected component identifiers.
    has_critical : bool
        Whether any critical vulnerability is present.
    critical_cves : list of str
        List of critical CVE IDs.
    """

    total_matches: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    affected_components: List[str]
    has_critical: bool
    critical_cves: List[str]


class VulnerabilityReportResponse(BaseModel):
    """Response model for the full vulnerability report.

    Attributes
    ----------
    summary : VulnerabilitySummaryResponse
        Vulnerability summary statistics.
    matches : list of VulnerabilityMatchResponse
        Detailed vulnerability match records.
    critical_alert : bool
        Whether a critical alert banner should be displayed.
    last_ingest_time : str or None
        Timestamp of the last CVE feed ingestion.
    cve_database_count : int
        Total number of CVEs in the ingested database.
    """

    summary: VulnerabilitySummaryResponse
    matches: List[VulnerabilityMatchResponse]
    critical_alert: bool
    last_ingest_time: Optional[str]
    cve_database_count: int


# ---------------------------------------------------------------------------
# SBOM Download Endpoint
# ---------------------------------------------------------------------------

@router.get(
    "/sbom",
    response_model=SBOMManifestResponse,
    summary="Download active signed CycloneDX SBOM manifest",
    description=(
        "Returns the active CycloneDX v1.5 Software Bill of Materials "
        "manifest.  If the manifest has been signed, the signature path "
        "is included.  The full JSON manifest is returned in the response body."
    ),
)
def download_sbom(
    current_user: User = Depends(require_admin),
):
    """Download the active signed CycloneDX SBOM manifest.

    Returns the SBOM manifest metadata and the full JSON document.
    If the manifest file does not exist, returns HTTP 404.

    Parameters
    ----------
    current_user : User
        The authenticated admin user.

    Returns
    -------
    SBOMManifestResponse
        SBOM manifest metadata.

    Raises
    ------
    HTTPException
        404 if the SBOM manifest has not been generated yet.
    """
    sbom_path = SBOM_OUTPUT_PATH
    if not sbom_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="SBOM manifest not found. Run the SBOM generator first.",
        )

    try:
        with open(sbom_path, "r", encoding="utf-8") as f:
            sbom_data = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read SBOM manifest: {str(e)}",
        )

    # Check for signature file
    sig_path = sbom_path.with_suffix(".json.sig")
    signed = sig_path.is_file()

    metadata = sbom_data.get("metadata", {})
    components = sbom_data.get("components", [])

    return SBOMManifestResponse(
        bom_format=sbom_data.get("bomFormat", "CycloneDX"),
        spec_version=sbom_data.get("specVersion", "1.5"),
        component_count=len(components),
        timestamp=metadata.get("timestamp", ""),
        signed=signed,
        signature_path=str(sig_path) if signed else None,
    )


# ---------------------------------------------------------------------------
# Vulnerability Report Endpoint
# ---------------------------------------------------------------------------

@router.get(
    "/vulnerability-report",
    response_model=VulnerabilityReportResponse,
    summary="Get active CVE vulnerability report",
    description=(
        "Returns active CVE matches against the current SBOM, including "
        "affected libraries, CVSS scores, and mitigation guidance.  If any "
        "CRITICAL vulnerability (CVSS >= 9.0) is detected, an administrative "
        "banner alert is raised across the platform."
    ),
)
def vulnerability_report(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get the active CVE vulnerability report.

    Matches ingested CVE definitions against the current SBOM components,
    filters out dev-only dependencies, and returns a detailed report with
    CVSS scores and mitigation guidance.

    Parameters
    ----------
    current_user : User
        The authenticated admin user.
    db : Session
        Database session.

    Returns
    -------
    VulnerabilityReportResponse
        Full vulnerability report with summary and match details.
    """
    triage = CVETriage()

    # Load SBOM components
    sbom_components = []
    sbom_path = SBOM_OUTPUT_PATH
    if sbom_path.is_file():
        try:
            with open(sbom_path, "r", encoding="utf-8") as f:
                sbom_data = json.load(f)
            sbom_components = sbom_data.get("components", [])
        except (json.JSONDecodeError, OSError):
            pass

    # Match vulnerabilities
    matches = triage.match_vulnerabilities_against_sbom(sbom_components)

    # Build summary
    summary_data = triage.get_vulnerability_summary(matches)

    # Check for critical alert
    critical_alert = triage.has_critical_vulnerabilities(matches)

    # Build response
    match_responses = [
        VulnerabilityMatchResponse(
            cve_id=m.cve_id,
            component_name=m.component_name,
            component_version=m.component_version,
            component_type=m.component_type,
            cvss_score=m.cvss_score,
            severity=m.severity,
            description=m.description,
            mitigation=m.mitigation,
            cpe_match=m.cpe_match,
        )
        for m in matches
    ]

    return VulnerabilityReportResponse(
        summary=VulnerabilitySummaryResponse(**summary_data),
        matches=match_responses,
        critical_alert=critical_alert,
        last_ingest_time=triage._last_ingest_time.isoformat() if triage._last_ingest_time else None,
        cve_database_count=triage.cve_count,
    )
