"""Equipment calibration and maintenance API router.

This module provides JWT-authenticated endpoints for managing the
calibration lifecycle of physical test equipment (ResourceNode ASSETs)
and scheduling maintenance downtime windows.

Endpoints
~~~~~~~~~

* **POST /recalibrate** — Record a completed calibration event, updating
  the equipment's calibration dates and linking the certificate artifact.
* **POST /downtime-windows** — Schedule a maintenance downtime window,
  marking the resource as out of service during the window.
* **GET /{resource_id}/calibration-status** — Query the current calibration
  status of an equipment resource, including expiry countdown and active
  maintenance windows.
* **GET /{resource_id}/maintenance-windows** — List all maintenance windows
  for a resource within a date range.

Access Control
~~~~~~~~~~~~~~

All endpoints require a valid JWT token via the ``get_current_user``
dependency.  The authenticated user must have sufficient clearance to
access the target resource node.

Usage
~~~~~

.. code-block:: bash

    # Record a calibration event
    curl -X POST http://localhost:8000/api/v1/equipment/recalibrate \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{
        "resource_id": "uuid",
        "calibration_date": "2026-10-24",
        "interval_days": 365
      }'

    # Schedule maintenance downtime
    curl -X POST http://localhost:8000/api/v1/equipment/downtime-windows \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{
        "resource_id": "uuid",
        "downtime_start": "2026-11-01T08:00:00Z",
        "downtime_end": "2026-11-03T17:00:00Z",
        "maintenance_type": "SCHEDULED_RECALIBRATION",
        "work_order_reference": "WO-2026-001",
        "technician_name": "J. Smith"
      }'
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, date, timedelta
from uuid import UUID
from typing import Optional

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.models import User, ResourceNode, MaintenanceType
from app.schemas.schemas import (
    CalibrationRecordRequest,
    CalibrationRecordResponse,
    MaintenanceWindowCreate,
    MaintenanceWindowResponse,
    EquipmentCalibrationStatus,
)
from app.services.calibration_interlock import (
    record_calibration,
    schedule_maintenance_window,
    get_active_maintenance_windows,
)
from app.core.abac import has_sufficient_clearance

router = APIRouter()


@router.post("/recalibrate", response_model=CalibrationRecordResponse)
def recalibrate_equipment(
    request: CalibrationRecordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Record a completed calibration event for an equipment resource.

    Updates the resource's calibration tracking fields:

    - Sets ``last_calibration_date`` to the calibration date.
    - Sets ``calibration_interval_days`` to the provided interval.
    - Calculates and sets ``next_calibration_due`` as
      ``calibration_date + interval_days``.
    - Links the calibration certificate artifact if provided.
    - Sets ``is_out_of_service`` to False.

    Parameters
    ----------
    request : CalibrationRecordRequest
        The calibration event data: resource_id, calibration_date,
        interval_days, and optional certificate_vault_id.
    current_user : User
        The authenticated user recording the calibration.
    db : Session
        Active database session.

    Returns
    -------
    CalibrationRecordResponse
        The updated calibration status of the resource.

    Raises
    ------
    HTTPException
        404 if the resource is not found.
        403 if the user lacks clearance to access the resource.
        400 if the calibration interval is invalid.
    """
    from uuid import UUID as UUIDType

    resource_id = UUIDType(request.resource_id)

    # Load the resource
    resource = db.query(ResourceNode).filter(
        ResourceNode.id == resource_id
    ).first()

    if resource is None:
        raise HTTPException(
            status_code=404,
            detail=f"Resource {request.resource_id} not found",
        )

    # Check user clearance
    if not has_sufficient_clearance(current_user, resource):
        raise HTTPException(
            status_code=403,
            detail="Insufficient clearance to access this resource",
        )

    # Parse calibration date
    cal_date = date.fromisoformat(request.calibration_date)

    # Record the calibration
    updated_resource = record_calibration(
        resource_id=resource_id,
        calibration_date=cal_date,
        interval_days=request.interval_days,
        certificate_vault_id=(
            UUIDType(request.certificate_vault_id)
            if request.certificate_vault_id else None
        ),
        user_id=current_user.id,
        db=db,
    )

    return CalibrationRecordResponse(
        resource_id=str(updated_resource.id),
        resource_code=updated_resource.code,
        serial_number=updated_resource.serial_number,
        last_calibration_date=str(updated_resource.last_calibration_date),
        next_calibration_due=str(updated_resource.next_calibration_due),
        calibration_interval_days=updated_resource.calibration_interval_days,
        certificate_vault_id=str(
            updated_resource.calibration_certificate_vault_id
        ) if updated_resource.calibration_certificate_vault_id else None,
    )


@router.post("/downtime-windows", response_model=MaintenanceWindowResponse)
def create_downtime_window(
    request: MaintenanceWindowCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Schedule a maintenance downtime window for a resource.

    Creates a new :class:`MaintenanceDowntimeWindow` record and marks
    the resource as out of service if the window starts now or in the
    past.

    Parameters
    ----------
    request : MaintenanceWindowCreate
        The maintenance window data: resource_id, downtime_start,
        downtime_end, maintenance_type, work_order_reference,
        and technician_name.
    current_user : User
        The authenticated user scheduling the maintenance.
    db : Session
        Active database session.

    Returns
    -------
    MaintenanceWindowResponse
        The created maintenance window record.

    Raises
    ------
    HTTPException
        404 if the resource is not found.
        403 if the user lacks clearance to access the resource.
        400 if the maintenance window overlaps an existing window.
    """
    from uuid import UUID as UUIDType

    resource_id = UUIDType(request.resource_id)

    # Load the resource
    resource = db.query(ResourceNode).filter(
        ResourceNode.id == resource_id
    ).first()

    if resource is None:
        raise HTTPException(
            status_code=404,
            detail=f"Resource {request.resource_id} not found",
        )

    # Check user clearance
    if not has_sufficient_clearance(current_user, resource):
        raise HTTPException(
            status_code=403,
            detail="Insufficient clearance to access this resource",
        )

    # Parse maintenance type
    try:
        maint_type = MaintenanceType(request.maintenance_type)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid maintenance type: {request.maintenance_type}. "
                   f"Must be one of: {[m.value for m in MaintenanceType]}",
        )

    # Parse datetimes
    try:
        downtime_start = datetime.fromisoformat(
            request.downtime_start.replace("Z", "+00:00")
        )
        downtime_end = datetime.fromisoformat(
            request.downtime_end.replace("Z", "+00:00")
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid datetime format: {e}",
        )

    # Schedule the maintenance window
    try:
        window = schedule_maintenance_window(
            resource_id=resource_id,
            downtime_start=downtime_start,
            downtime_end=downtime_end,
            maintenance_type=maint_type,
            work_order_reference=request.work_order_reference,
            technician_name=request.technician_name,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )

    return MaintenanceWindowResponse(
        id=str(window.id),
        resource_id=str(window.resource_node_id),
        resource_code=resource.code,
        downtime_start=window.downtime_start.isoformat(),
        downtime_end=window.downtime_end.isoformat(),
        maintenance_type=window.maintenance_type.value,
        work_order_reference=window.work_order_reference,
        technician_name=window.technician_name,
    )


@router.get("/{resource_id}/calibration-status",
            response_model=EquipmentCalibrationStatus)
def get_calibration_status(
    resource_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Query the current calibration status of an equipment resource.

    Returns the resource's calibration tracking fields, whether the
    calibration is currently valid, days until expiry, and any active
    maintenance windows.

    Parameters
    ----------
    resource_id : str
        UUID of the ResourceNode to query.
    current_user : User
        The authenticated user querying the status.
    db : Session
        Active database session.

    Returns
    -------
    EquipmentCalibrationStatus
        Full calibration status including expiry countdown and
        maintenance windows.

    Raises
    ------
    HTTPException
        404 if the resource is not found.
        403 if the user lacks clearance to access the resource.
    """
    from uuid import UUID as UUIDType

    try:
        res_id = UUIDType(resource_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid UUID: {resource_id}",
        )

    # Load the resource
    resource = db.query(ResourceNode).filter(
        ResourceNode.id == res_id
    ).first()

    if resource is None:
        raise HTTPException(
            status_code=404,
            detail=f"Resource {resource_id} not found",
        )

    # Check user clearance
    if not has_sufficient_clearance(current_user, resource):
        raise HTTPException(
            status_code=403,
            detail="Insufficient clearance to access this resource",
        )

    # Calculate calibration validity
    calibration_valid = True
    days_until_expiry = None

    if resource.next_calibration_due is not None:
        today = date.today()
        if resource.next_calibration_due < today:
            calibration_valid = False
        days_until_expiry = (
            resource.next_calibration_due - today
        ).days

    # Get active maintenance windows
    windows = get_active_maintenance_windows(
        res_id,
        start_date=date.today(),
        end_date=None,
        db=db,
    )

    window_responses = []
    for w in windows:
        window_responses.append(MaintenanceWindowResponse(
            id=str(w.id),
            resource_id=str(w.resource_node_id),
            resource_code=resource.code,
            downtime_start=w.downtime_start.isoformat(),
            downtime_end=w.downtime_end.isoformat(),
            maintenance_type=w.maintenance_type.value,
            work_order_reference=w.work_order_reference,
            technician_name=w.technician_name,
        ))

    return EquipmentCalibrationStatus(
        resource_id=str(resource.id),
        resource_code=resource.code,
        serial_number=resource.serial_number,
        resource_type=resource.resource_type.value,
        is_out_of_service=resource.is_out_of_service,
        calibration_interval_days=resource.calibration_interval_days,
        last_calibration_date=(
            str(resource.last_calibration_date)
            if resource.last_calibration_date else None
        ),
        next_calibration_due=(
            str(resource.next_calibration_due)
            if resource.next_calibration_due else None
        ),
        calibration_valid=calibration_valid,
        days_until_expiry=days_until_expiry,
        certificate_vault_id=(
            str(resource.calibration_certificate_vault_id)
            if resource.calibration_certificate_vault_id else None
        ),
        active_maintenance_windows=window_responses,
    )


@router.get("/{resource_id}/maintenance-windows")
def list_maintenance_windows(
    resource_id: str,
    start_date: Optional[str] = Query(
        None, description="Start date (ISO-8601)"
    ),
    end_date: Optional[str] = Query(
        None, description="End date (ISO-8601)"
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List maintenance windows for a resource within a date range.

    Parameters
    ----------
    resource_id : str
        UUID of the ResourceNode to query.
    start_date : str, optional
        Start of the query range (ISO-8601 date).
    end_date : str, optional
        End of the query range (ISO-8601 date).
    current_user : User
        The authenticated user querying the windows.
    db : Session
        Active database session.

    Returns
    -------
    dict
        Dictionary with ``windows`` (list of MaintenanceWindowResponse)
        and ``total_count``.

    Raises
    ------
    HTTPException
        404 if the resource is not found.
        403 if the user lacks clearance to access the resource.
    """
    from uuid import UUID as UUIDType

    try:
        res_id = UUIDType(resource_id)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid UUID: {resource_id}",
        )

    # Load the resource
    resource = db.query(ResourceNode).filter(
        ResourceNode.id == res_id
    ).first()

    if resource is None:
        raise HTTPException(
            status_code=404,
            detail=f"Resource {resource_id} not found",
        )

    # Check user clearance
    if not has_sufficient_clearance(current_user, resource):
        raise HTTPException(
            status_code=403,
            detail="Insufficient clearance to access this resource",
        )

    # Parse dates
    query_start = None
    query_end = None

    if start_date:
        try:
            query_start = date.fromisoformat(start_date)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid start_date format: {start_date}",
            )

    if end_date:
        try:
            query_end = date.fromisoformat(end_date)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid end_date format: {end_date}",
            )

    # Get maintenance windows
    windows = get_active_maintenance_windows(
        res_id,
        start_date=query_start,
        end_date=query_end,
        db=db,
    )

    window_responses = []
    for w in windows:
        window_responses.append(MaintenanceWindowResponse(
            id=str(w.id),
            resource_id=str(w.resource_node_id),
            resource_code=resource.code,
            downtime_start=w.downtime_start.isoformat(),
            downtime_end=w.downtime_end.isoformat(),
            maintenance_type=w.maintenance_type.value,
            work_order_reference=w.work_order_reference,
            technician_name=w.technician_name,
        ))

    return {
        "resource_id": str(resource.id),
        "resource_code": resource.code,
        "windows": window_responses,
        "total_count": len(window_responses),
    }
