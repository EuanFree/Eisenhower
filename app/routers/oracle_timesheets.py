"""Oracle timesheet and ERP export API router.

This module provides the REST API endpoints for the timesheet pre-population
engine and Oracle ERP export staging service.  It bridges the Eisenhower
Portfolio Manager's internal scheduling system with Oracle EBS cost accounting.

Endpoints Overview
~~~~~~~~~~~~~~~~~~

The router is mounted at ``/api/v1/timesheets/oracle`` and provides:

- **GET /prepopulate** — Pre-populate a user's weekly timesheet from active
  CPM assignments.  Returns scheduled hours for each working day so the user
  can confirm or adjust rather than entering from scratch.

- **POST /batches/create** — Close an approved weekly period and generate
  an export batch.  This creates a TimesheetOracleExportBatch record and
  prepares the staging payload.

- **GET /batches/{id}/download** — Stream the formatted Oracle staging
  payload (CSV) for a given batch.  Classified task names are automatically
  replaced with sanitised cost-code identifiers.

- **GET /batches/{id}** — Get the details of an export batch including
  status, period, and record count.

- **GET /coherence-audit** — Inspect flagged divergence batches by running
  a coherence audit on a given timesheet batch.  Detects labor-progress
  divergences and ACWP/PV cost overruns.

- **POST /{id}/justify** — Submit a CAM technical variance narrative to
  clear a billing hold on a held timesheet batch.

Authentication
~~~~~~~~~~~~~~

All endpoints require a valid JWT token.  The authenticated user's identity
is used to determine which timesheet data to return and to record audit
trail entries.

Data Sanitization
~~~~~~~~~~~~~~~~~

When generating Oracle staging payloads, classified task names (SECRET or
higher) are automatically replaced with their Oracle cost-code identifiers.
This prevents classified information from leaking into the ERP system.

For example, a task named "CLASSIFIED AVIONICS INTEGRATION" with Oracle
task number "10.02.01" will appear in the export as "Task 10.02.01".

Coherence Audit
~~~~~~~~~~~~~~~

The coherence audit endpoints enforce statutory allowable cost billing gates
for defence programmes.  When divergences are detected on TCIF or single-source
work packages, timesheet line items are placed in HELD_FOR_CAM_JUSTIFICATION
status until the CAM submits an attested variance justification.

Dependencies
~~~~~~~~~~~~

These endpoints require a live PostgreSQL instance to query ResourceAssignments,
PortfolioNodes, and OracleProjectMappings.
"""

from datetime import date, timezone, datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.schemas import (
    BatchCreateRequest,
    BatchCreateResponse,
    TimesheetOracleExportBatchResponse,
    TimesheetPrepopulateResponse,
)
from app.services.oracle_gateway import (
    create_export_batch,
    generate_oracle_staging_payload,
    prepopulate_timesheet_from_schedule,
)
from app.utils.auth import get_current_user
from app.models.models import User, TimesheetOracleExportBatch

router = APIRouter()


@router.get("/prepopulate", response_model=TimesheetPrepopulateResponse)
def get_prepopulated_timesheet(
    period_start: str = Query(
        ...,
        description="Start date of the timesheet period (ISO format, e.g. 2024-01-15)",
    ),
    period_end: str = Query(
        ...,
        description="End date of the timesheet period (ISO format, e.g. 2024-01-21)",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pre-populate the authenticated user's weekly timesheet from active CPM assignments.

    When a user opens their weekly timesheet, this endpoint inspects their
    active ResourceAssignments and auto-populates scheduled hours for each
    working day within the requested period.

    The algorithm:

    1. Finds the ResourceNode corresponding to the authenticated user.
    2. Queries all active ResourceAssignments for that resource.
    3. Filters to assignments whose portfolio node dates overlap the period.
    4. Distributes planned hours across working days (Mon–Fri).
    5. Looks up Oracle cost codes for each portfolio node.
    6. Returns the pre-populated line items.

    Parameters
    ----------
    period_start : str
        Start date of the timesheet period in ISO format (YYYY-MM-DD).
    period_end : str
        End date of the timesheet period in ISO format (YYYY-MM-DD).
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    TimesheetPrepopulateResponse
        Pre-populated timesheet with scheduled line items.

    Raises
    ------
    HTTPException
        400 if dates are invalid or period_start > period_end.
        404 if the user is not found.
        500 if a database error occurs.
    """
    try:
        start = date.fromisoformat(period_start)
        end = date.fromisoformat(period_end)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid date format. Use ISO format (YYYY-MM-DD).",
        )

    if start > end:
        raise HTTPException(
            status_code=400,
            detail="period_start must be before or equal to period_end.",
        )

    try:
        result = prepopulate_timesheet_from_schedule(
            db=db,
            user_id=current_user.id,
            period_start=start,
            period_end=end,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error pre-populating timesheet: {str(e)}",
        )


@router.post("/batches/create", response_model=BatchCreateResponse)
def create_timesheet_batch(
    request: BatchCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Close an approved weekly period and generate an Oracle export batch.

    When a weekly timesheet period is closed, this endpoint creates a
    TimesheetOracleExportBatch record.  The batch groups all approved
    timesheet lines for the period and prepares them for export to
    Oracle EBS.

    The batch reference is auto-generated in the format:
    ``TS-{YEAR}-W{WEEK}-{RANDOM}`` (e.g., ``TS-2024-W42-A3F1``).

    Parameters
    ----------
    request : BatchCreateRequest
        Request body containing period_start and period_end dates.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    BatchCreateResponse
        Details of the newly created export batch.

    Raises
    ------
    HTTPException
        400 if dates are invalid or period_start > period_end.
        409 if a batch already exists for the same period.
        500 if a database error occurs.
    """
    try:
        start = date.fromisoformat(request.period_start)
        end = date.fromisoformat(request.period_end)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid date format. Use ISO format (YYYY-MM-DD).",
        )

    if start > end:
        raise HTTPException(
            status_code=400,
            detail="period_start must be before or equal to period_end.",
        )

    # Check for existing batch for the same period
    existing = (
        db.query(TimesheetOracleExportBatch)
        .filter(
            TimesheetOracleExportBatch.period_start_date == start,
            TimesheetOracleExportBatch.period_end_date == end,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"A batch already exists for this period: {existing.batch_reference}",
        )

    try:
        # Generate line items for the batch
        # In a full implementation, this would query a timesheet_lines table
        # For now, we derive from ResourceAssignments
        from app.services.oracle_gateway import (
            _get_workdays_in_range,
            _get_oracle_mapping,
            _sanitize_task_description,
        )
        from app.models.models import (
            ResourceAssignment,
            PortfolioNode,
            ResourceNode,
        )
        from uuid import uuid4 as _uuid4
        from decimal import Decimal

        assignments = db.query(ResourceAssignment).all()
        line_items = []
        workdays = _get_workdays_in_range(start, end)
        now = datetime.now(timezone.utc)
        batch_source = f"EISENHOWER_BATCH_CREATE"

        STANDARD_DAILY_HOURS = 8.0

        for assignment in assignments:
            node = (
                db.query(PortfolioNode)
                .filter(PortfolioNode.id == assignment.portfolio_node_id)
                .first()
            )
            if node is None:
                continue

            mapping = _get_oracle_mapping(db, assignment.portfolio_node_id)
            if mapping is None:
                continue

            resource = (
                db.query(ResourceNode)
                .filter(ResourceNode.id == assignment.resource_node_id)
                .first()
            )

            # Check overlap with node dates
            if node.planned_start_date and node.planned_end_date:
                node_start = (
                    node.planned_start_date.date()
                    if hasattr(node.planned_start_date, "date")
                    else node.planned_start_date
                )
                node_end = (
                    node.planned_end_date.date()
                    if hasattr(node.planned_end_date, "date")
                    else node.planned_end_date
                )
                filtered_days = [d for d in workdays if node_start <= d <= node_end]
            else:
                filtered_days = workdays

            if not filtered_days:
                continue

            # Calculate daily hours
            allocated_units = assignment.allocated_units or 0.0
            daily_hours = STANDARD_DAILY_HOURS * allocated_units

            if assignment.planned_hours and assignment.planned_hours > 0:
                if node.planned_start_date and node.planned_end_date:
                    all_node_workdays = _get_workdays_in_range(node_start, node_end)
                else:
                    all_node_workdays = filtered_days
                if all_node_workdays:
                    daily_hours = assignment.planned_hours / len(all_node_workdays)

            for workday in filtered_days:
                transaction_id = str(_uuid4())
                sanitized_desc = _sanitize_task_description(node, mapping)

                row = {
                    "TRANSACTION_ID": transaction_id,
                    "ORGANIZATION_ID": mapping.oracle_expenditure_org_name,
                    "PROJECT_ID": mapping.oracle_project_number,
                    "TASK_ID": mapping.oracle_task_number,
                    "EXPENDITURE_TYPE": mapping.oracle_expenditure_type,
                    "TRANSACTION_DATE": workday.isoformat(),
                    "TRANSACTION_STATUS": "PENDING",
                    "BILLABLE_FLAG": "Y",
                    "CREATION_DATE": now.isoformat(),
                    "CREATED_BY": resource.code if resource else "SYSTEM",
                    "RESOURCE_ID": str(resource.id) if resource else "",
                    "NAME": resource.name if resource else "Unknown",
                    "DESCRIPTION": sanitized_desc,
                    "TRANSACTION_AMOUNT": str(round(daily_hours, 2)),
                    "EXCHANGE_RATE": "1.0",
                    "EXCHANGE_RATE_TYPE": "Corporate",
                    "EXCHANGE_RATE_DATE": workday.isoformat(),
                    "ATTRIBUTE_CATEGORY": "TIMESHEET",
                    "GLOBAL_ATTRIBUTE_CATEGORY": "EISENHOWER",
                    "BATCH_SOURCE_NAME": batch_source,
                }
                line_items.append(row)

        # Create the batch
        batch = create_export_batch(
            db=db,
            period_start=start,
            period_end=end,
            user_id=current_user.id,
            line_items=line_items,
        )

        return {
            "batch_id": str(batch.id),
            "batch_reference": batch.batch_reference,
            "period_start": batch.period_start_date.isoformat(),
            "period_end": batch.period_end_date.isoformat(),
            "status": batch.status,
            "total_hours": float(batch.total_hours),
            "record_count": batch.record_count,
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error creating export batch: {str(e)}",
        )


@router.get("/batches/{batch_id}/download")
def download_oracle_staging_payload(
    batch_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download the Oracle EBS staging payload for a given export batch.

    This endpoint generates and streams the CSV-formatted staging payload
    for Oracle EBS PA_TRANSACTION_INTERFACE_ALL schema.  Classified task
    names are automatically replaced with sanitised cost-code identifiers.

    The payload is streamed as a CSV file with the filename:
    ``oracle_staging_{batch_reference}.csv``.

    Parameters
    ----------
    batch_id : str
        The UUID of the export batch to download.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    StreamingResponse
        CSV file stream with appropriate headers for download.

    Raises
    ------
    HTTPException
        404 if the batch is not found.
        400 if the batch_id is not a valid UUID.
        500 if payload generation fails.
    """
    try:
        batch_uuid = UUID(batch_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid batch_id. Must be a valid UUID.",
        )

    # Check batch exists
    batch = (
        db.query(TimesheetOracleExportBatch)
        .filter(TimesheetOracleExportBatch.id == batch_uuid)
        .first()
    )
    if batch is None:
        raise HTTPException(
            status_code=404,
            detail=f"Export batch {batch_id} not found.",
        )

    try:
        csv_content, line_items = generate_oracle_staging_payload(
            db=db,
            batch_id=batch_uuid,
        )

        filename = f"oracle_staging_{batch.batch_reference}.csv"

        return StreamingResponse(
            iter([csv_content]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
            },
        )

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generating staging payload: {str(e)}",
        )


@router.get("/batches/{batch_id}", response_model=TimesheetOracleExportBatchResponse)
def get_export_batch(
    batch_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the details of an Oracle export batch.

    Returns the batch metadata including status, period dates, total hours,
    and record count.

    Parameters
    ----------
    batch_id : str
        The UUID of the export batch.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    TimesheetOracleExportBatchResponse
        Batch details including status and metadata.

    Raises
    ------
    HTTPException
        404 if the batch is not found.
        400 if the batch_id is not a valid UUID.
    """
    try:
        batch_uuid = UUID(batch_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid batch_id. Must be a valid UUID.",
        )

    batch = (
        db.query(TimesheetOracleExportBatch)
        .filter(TimesheetOracleExportBatch.id == batch_uuid)
        .first()
    )
    if batch is None:
        raise HTTPException(
            status_code=404,
            detail=f"Export batch {batch_id} not found.",
        )

    return {
        "id": str(batch.id),
        "batch_reference": batch.batch_reference,
        "period_start": batch.period_start_date.isoformat(),
        "period_end": batch.period_end_date.isoformat(),
        "status": batch.status,
        "total_hours": float(batch.total_hours),
        "record_count": batch.record_count,
        "created_at": batch.created_at.isoformat() if batch.created_at else "",
        "updated_at": batch.updated_at.isoformat() if batch.updated_at else "",
    }


# ============================================================================
# Coherence Audit Endpoints
# ============================================================================

class JustifyRequestBody:
    """Pydantic-like request body for CAM justification."""
    def __init__(self, narrative: str):
        self.narrative = narrative


from pydantic import BaseModel, Field

class JustifyRequest(BaseModel):
    """Request body for submitting CAM variance justification."""
    narrative: str = Field(
        ...,
        min_length=50,
        description=(
            "The variance justification narrative following IPMR Format 5 "
            "variance narrative structure. Minimum 50 characters."
        ),
    )


@router.get("/coherence-audit", summary="Coherence audit for timesheet batch")
def get_coherence_audit(
    batch_id: str = Query(
        ...,
        description="The UUID of the timesheet export batch to audit.",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Inspect flagged divergence batches by running a coherence audit.

    This endpoint runs the time-to-progress coherence detector against
    a given timesheet export batch.  It checks for:

    1. **LABOR_PROGRESS_DIVERGENCE** — Labor burn > 15% with 0% physical progress.
    2. **ACWP_PV_DIVERGENCE** — ACWP exceeds PV by ≥ 20% without earned value delivery.

    For TCIF or single-source work packages, divergent line items are
    placed in HELD_FOR_CAM_JUSTIFICATION status.

    Parameters
    ----------
    batch_id : str
        The UUID of the timesheet export batch to audit.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    dict
        Audit result with divergences, held lines, and summary statistics.

    Raises
    ------
    HTTPException
        400 if batch_id is not a valid UUID.
        404 if the batch is not found.
        500 if audit fails.
    """
    try:
        batch_uuid = UUID(batch_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid batch_id. Must be a valid UUID.",
        )

    try:
        from app.services.timesheet_coherence import audit_timesheet_coherence

        result = audit_timesheet_coherence(
            db=db,
            timesheet_batch_id=batch_uuid,
        )
        return result

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error running coherence audit: {str(e)}",
        )


@router.post("/{batch_id}/justify", summary="Submit CAM variance justification")
def justify_timesheet_batch(
    batch_id: str,
    request: JustifyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a CAM technical variance narrative to clear a billing hold.

    When divergences are detected on TCIF or single-source defense work
    packages, timesheet line items are placed in HELD_FOR_CAM_JUSTIFICATION
    status.  This endpoint allows the Contracting Activity Manager (CAM)
    to submit an attested variance justification following the IPMR Format 5
    variance narrative structure.

    Once justified, the billing hold is cleared and export to Oracle Projects
    is permitted.

    Parameters
    ----------
    batch_id : str
        The UUID of the held timesheet batch.
    request : JustifyRequest
        Request body containing the variance justification narrative.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected, assumed to be the CAM).

    Returns
    -------
    dict
        Justification result with status and clearance confirmation.

    Raises
    ------
    HTTPException
        400 if batch_id is invalid or narrative is too short.
        404 if the batch is not found.
        500 if justification submission fails.
    """
    try:
        batch_uuid = UUID(batch_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid batch_id. Must be a valid UUID.",
        )

    try:
        from app.services.timesheet_coherence import submit_cam_justification

        result = submit_cam_justification(
            db=db,
            timesheet_batch_id=batch_uuid,
            narrative=request.narrative,
            cam_user_id=current_user.id,
        )
        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error submitting CAM justification: {str(e)}",
        )
