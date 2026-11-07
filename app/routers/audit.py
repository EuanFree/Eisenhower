"""Audit integrity verification and forensic investigation router.

This module exposes three endpoints for proving non-repudiation of the
SHA-256 chained forensic audit log:

1. **POST /verify-integrity** — Runs a full-chain verification sweep that
   recalculates every entry's hash and compares it against the stored value.
   Returns an audit certificate suitable for sovereign security compliance
   boards.

2. **GET /entities/{entity_id}/history** — Returns the complete chronological
   forensic timeline for any entity (PortfolioNode, DependencyLink,
   ResourceAssignment, etc.), showing who modified what, from which IP, and
   under which security caveats.

3. **GET /export-signed-ledger** — Streams a digitally signed ZIP archive
   containing the full audit ledger, verification certificate, SHA-256
   manifest, and signature file.

Access Control
~~~~~~~~~~~~~~

All endpoints require JWT authentication via :func:`get_current_user`.
These are administrative endpoints intended for use by security compliance
officers and internal auditors.

Endpoints
~~~~~~~~~

- ``POST /api/v1/audit/verify-integrity`` — Full-chain verification sweep.
- ``GET /api/v1/audit/entities/{entity_id}/history`` — Entity forensic timeline.
- ``GET /api/v1/audit/export-signed-ledger`` — Signed audit bundle download.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.schemas import (
    AuditChainDiscrepancy,
    AuditChainVerificationResponse,
    AuditLedgerExportResponse,
    ForensicTimelineEvent,
    ForensicTimelineResponse,
)
from app.services.audit_verifier import (
    export_signed_ledger,
    generate_forensic_timeline,
    verify_audit_chain_integrity,
)
from app.utils.auth import get_current_user
from app.models.models import User

router = APIRouter()


@router.post(
    "/verify-integrity",
    response_model=AuditChainVerificationResponse,
    summary="Verify full audit chain integrity",
    description=(
        "Runs a complete SHA-256 chain integrity verification sweep across "
        "all ForensicAuditLog records.  Recalculates every entry's hash and "
        "compares it against the stored value.  Detects broken hash links, "
        "hash mismatches, timestamp inversions, and tombstone anomalies.  "
        "Returns an audit certificate suitable for sovereign security "
        "compliance boards."
    ),
)
async def verify_integrity(
    start_transaction_id: Optional[str] = Query(
        None,
        description=(
            "If provided, only verify entries at or after this transaction ID."
        ),
    ),
    end_transaction_id: Optional[str] = Query(
        None,
        description=(
            "If provided, only verify entries at or before this transaction ID."
        ),
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AuditChainVerificationResponse:
    """Execute a full-chain SHA-256 integrity verification sweep.

    Parameters
    ----------
    start_transaction_id : str or None
        Optional lower bound for the verification range.
    end_transaction_id : str or None
        Optional upper bound for the verification range.
    db : AsyncSession
        Database session injected by FastAPI.
    current_user : User
        Authenticated user injected by FastAPI.

    Returns
    -------
    AuditChainVerificationResponse
        The audit certificate with chain validity status and any discrepancies.
    """
    start_id = None
    end_id = None

    if start_transaction_id is not None:
        try:
            start_id = uuid.UUID(start_transaction_id)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid UUID format for start_transaction_id: {start_transaction_id}",
            )

    if end_transaction_id is not None:
        try:
            end_id = uuid.UUID(end_transaction_id)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid UUID format for end_transaction_id: {end_transaction_id}",
            )

    result = await verify_audit_chain_integrity(
        db, start_transaction_id=start_id, end_transaction_id=end_id
    )

    # Convert raw discrepancy dicts to Pydantic models
    discrepancies = []
    for disc in result.get("discrepancies", []):
        disc_type = disc.get("type", "UNKNOWN")
        disc_entry_id = disc.get("entry_id")
        disc_transaction_id = disc.get("transaction_id")
        disc_message = disc.get("message", "")

        # Build details dict from remaining fields
        details = {
            k: v for k, v in disc.items()
            if k not in ("type", "entry_id", "transaction_id", "message")
        }

        discrepancies.append(AuditChainDiscrepancy(
            type=disc_type,
            entry_id=disc_entry_id,
            transaction_id=disc_transaction_id,
            message=disc_message,
            details=details if details else None,
        ))

    return AuditChainVerificationResponse(
        verified_records_count=result["verified_records_count"],
        chain_valid=result["chain_valid"],
        first_corrupted_id=result["first_corrupted_id"],
        tamper_detected=result["tamper_detected"],
        discrepancies=discrepancies,
        chain_head_hash=result["chain_head_hash"],
        chain_tail_hash=result["chain_tail_hash"],
        verification_timestamp=result["verification_timestamp"],
    )


@router.get(
    "/entities/{entity_id}/history",
    response_model=ForensicTimelineResponse,
    summary="Get forensic mutation timeline for an entity",
    description=(
        "Returns the complete chronological forensic timeline for the given "
        "entity ID.  Reconstructs the exact state diffs across time, "
        "identifying which actor modified fields, which client IP was used, "
        "and which security caveats were asserted at each mutation."
    ),
)
async def get_entity_history(
    entity_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ForensicTimelineResponse:
    """Retrieve the forensic mutation timeline for a specific entity.

    Parameters
    ----------
    entity_id : str
        UUID of the entity whose mutation history is being queried.
    db : AsyncSession
        Database session injected by FastAPI.
    current_user : User
        Authenticated user injected by FastAPI.

    Returns
    -------
    ForensicTimelineResponse
        The complete forensic timeline with all mutation events.
    """
    try:
        entity_uuid = uuid.UUID(entity_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid UUID format for entity_id: {entity_id}",
        )

    result = await generate_forensic_timeline(db, entity_uuid)

    # Convert raw timeline dicts to Pydantic models
    timeline_events = []
    for event in result.get("timeline", []):
        timeline_events.append(ForensicTimelineEvent(
            entry_id=event["entry_id"],
            transaction_id=event["transaction_id"],
            user_upn=event["user_upn"],
            client_ip=event.get("client_ip"),
            action_type=event["action_type"],
            entity_type=event["entity_type"],
            json_diff=event.get("json_diff"),
            security_marking=event.get("security_marking"),
            prev_hash=event["prev_hash"],
            current_hash=event["current_hash"],
            is_purged=event.get("is_purged", False),
            created_at=event["created_at"],
        ))

    return ForensicTimelineResponse(
        entity_id=result["entity_id"],
        total_mutations=result["total_mutations"],
        timeline=timeline_events,
        first_mutation_at=result.get("first_mutation_at"),
        last_mutation_at=result.get("last_mutation_at"),
        unique_actors=result.get("unique_actors", []),
        unique_ips=result.get("unique_ips", []),
    )


@router.get(
    "/export-signed-ledger",
    summary="Export digitally signed audit ledger bundle",
    description=(
        "Streams a digitally signed ZIP archive containing the full audit "
        "ledger, chain verification certificate, SHA-256 manifest, and "
        "signature file.  Formatted for submission to sovereign security "
        "compliance officers."
    ),
)
async def export_ledger(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Generate and stream a signed audit ledger export bundle.

    Parameters
    ----------
    db : AsyncSession
        Database session injected by FastAPI.
    current_user : User
        Authenticated user injected by FastAPI.

    Returns
    -------
    StreamingResponse
        ZIP archive stream with appropriate MIME headers.
    """
    zip_bytes, bundle_id = await export_signed_ledger(db)

    return StreamingResponse(
        iter([zip_bytes]),
        media_type="application/zip",
        headers={
            "Content-Disposition": (
                f"attachment; filename=audit-ledger-{bundle_id}.zip"
            ),
        },
    )
