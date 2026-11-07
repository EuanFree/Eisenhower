"""Perishable materials and clearance lifecycle API router.

This module provides JWT-authenticated endpoints for managing perishable
material lots and monitoring personnel clearance lifecycle status.

Endpoints
~~~~~~~~~

Perishable Material Lots
------------------------

- **POST /** — Create a new material lot record.
- **GET /** — List material lots with optional filtering by status,
  material type, or part number.
- **GET /{id}** — Get a single material lot by ID.
- **PUT /{id}** — Update a material lot (e.g., reassign to a different task).
- **DELETE /{id}** — Delete a material lot (only if not yet thawed).

Thaw / Out-Time Telemetry
~~~~~~~~~~~~~~~~~~~~~~~~~

- **POST /{id}/thaw** — Log a thaw event, transitioning the lot to
  THAWED_IN_USE.
- **POST /{id}/return-to-storage** — Log return to cold storage,
  adding out-time hours to the accumulated total.
- **POST /{id}/consume** — Mark a lot as fully consumed.
- **GET /{id}/status** — Get detailed lot status with shelf-life
  remaining and out-time remaining.

Clearance Lifecycle
~~~~~~~~~~~~~~~~~~~

- **GET /clearance/{user_id}/status** — Get a user's clearance status
  (type, expiry, days remaining).

Access Control
~~~~~~~~~~~~~~

All endpoints require JWT authentication via the ``get_current_user``
dependency.  Only active users can create or modify material lots.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional, List
from datetime import date

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.models import User, PerishableMaterialLot, LotStatus, MaterialType
from app.schemas.schemas import (
    PerishableMaterialLotCreate,
    PerishableMaterialLotUpdate,
    PerishableMaterialLotResponse,
    ReturnToStorageRequest,
    LotStatusResponse,
    ClearanceStatusResponse,
)
from app.services.perishable_materials import (
    log_thaw_event,
    log_return_to_storage,
    consume_lot,
    get_lot_status,
    allocate_lot_to_task,
    validate_perishable_shelf_life,
)
from app.services.clearance_lifecycle import get_clearance_status


router = APIRouter()


# ============================================================================
# Perishable Material Lot CRUD
# ============================================================================


@router.post("/", response_model=PerishableMaterialLotResponse)
async def create_material_lot(
    data: PerishableMaterialLotCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new perishable material lot record.

    Registers a material lot with cold storage expiry and out-time
    limits.  The lot starts in IN_COLD_STORAGE status.

    Parameters
    ----------
    data : PerishableMaterialLotCreate
        Lot details: lot number, part number, material type,
        cold storage expiry, and maximum out-time hours.
    db : Session
        Active database session.
    current_user : User
        Authenticated user creating the lot.

    Returns
    -------
    PerishableMaterialLotResponse
        The created lot record.

    Raises
    ------
    HTTPException
        409 if a lot with the same lot_number already exists.
    """
    # Check for duplicate lot number
    existing = db.query(PerishableMaterialLot).filter(
        PerishableMaterialLot.lot_number == data.lot_number
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Material lot '{data.lot_number}' already exists",
        )

    lot = PerishableMaterialLot(
        lot_number=data.lot_number,
        part_number=data.part_number,
        material_type=data.material_type,
        cold_storage_expiry=data.cold_storage_expiry,
        maximum_out_time_hours=data.maximum_out_time_hours,
        allocated_task_id=data.allocated_task_id,
        lot_status=LotStatus.IN_COLD_STORAGE,
    )
    db.add(lot)
    db.commit()
    db.refresh(lot)
    return lot


@router.get("/", response_model=List[PerishableMaterialLotResponse])
async def list_material_lots(
    lot_status: Optional[LotStatus] = Query(None, description="Filter by lot status"),
    material_type: Optional[MaterialType] = Query(None, description="Filter by material type"),
    part_number: Optional[str] = Query(None, description="Filter by part number"),
    allocated_task_id: Optional[UUID] = Query(None, description="Filter by allocated task"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List material lots with optional filtering.

    Returns all material lots matching the specified filters.
    Useful for inventory management and shelf-life monitoring.

    Parameters
    ----------
    lot_status : LotStatus or None
        Filter by current lifecycle status.
    material_type : MaterialType or None
        Filter by material type (PREPREG, ADHESIVE, SEALANT, PYRO).
    part_number : str or None
        Filter by part number (exact match).
    allocated_task_id : UUID or None
        Filter by allocated task ID.
    db : Session
        Active database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    list[PerishableMaterialLotResponse]
        Matching material lots.
    """
    query = db.query(PerishableMaterialLot)

    if lot_status is not None:
        query = query.filter(PerishableMaterialLot.lot_status == lot_status)
    if material_type is not None:
        query = query.filter(PerishableMaterialLot.material_type == material_type)
    if part_number is not None:
        query = query.filter(PerishableMaterialLot.part_number == part_number)
    if allocated_task_id is not None:
        query = query.filter(PerishableMaterialLot.allocated_task_id == allocated_task_id)

    return query.order_by(PerishableMaterialLot.cold_storage_expiry.asc()).all()


@router.get("/{lot_id}", response_model=PerishableMaterialLotResponse)
async def get_material_lot(
    lot_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single material lot by ID.

    Parameters
    ----------
    lot_id : UUID
        The material lot ID.
    db : Session
        Active database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    PerishableMaterialLotResponse
        The material lot record.

    Raises
    ------
    HTTPException
        404 if the lot is not found.
    """
    lot = db.query(PerishableMaterialLot).filter(
        PerishableMaterialLot.id == lot_id
    ).first()
    if lot is None:
        raise HTTPException(status_code=404, detail="Material lot not found")
    return lot


@router.put("/{lot_id}", response_model=PerishableMaterialLotResponse)
async def update_material_lot(
    lot_id: UUID,
    data: PerishableMaterialLotUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a material lot record.

    Allows reassignment to a different task or updating the cold
    storage expiry date.  All fields are optional.

    Parameters
    ----------
    lot_id : UUID
        The material lot ID.
    data : PerishableMaterialLotUpdate
        Fields to update.
    db : Session
        Active database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    PerishableMaterialLotResponse
        The updated lot record.

    Raises
    ------
    HTTPException
        404 if the lot is not found.
    """
    lot = db.query(PerishableMaterialLot).filter(
        PerishableMaterialLot.id == lot_id
    ).first()
    if lot is None:
        raise HTTPException(status_code=404, detail="Material lot not found")

    if data.allocated_task_id is not None:
        lot.allocated_task_id = data.allocated_task_id
    if data.cold_storage_expiry is not None:
        lot.cold_storage_expiry = data.cold_storage_expiry
    if data.maximum_out_time_hours is not None:
        lot.maximum_out_time_hours = data.maximum_out_time_hours

    db.commit()
    db.refresh(lot)
    return lot


@router.delete("/{lot_id}")
async def delete_material_lot(
    lot_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a material lot record.

    Only lots in IN_COLD_STORAGE status can be deleted.  Thawed,
    expired, or consumed lots cannot be deleted to preserve audit
    trail integrity.

    Parameters
    ----------
    lot_id : UUID
        The material lot ID.
    db : Session
        Active database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    dict
        Confirmation message.

    Raises
    ------
    HTTPException
        404 if the lot is not found.
        400 if the lot cannot be deleted (already thawed/expired/consumed).
    """
    lot = db.query(PerishableMaterialLot).filter(
        PerishableMaterialLot.id == lot_id
    ).first()
    if lot is None:
        raise HTTPException(status_code=404, detail="Material lot not found")

    if lot.lot_status != LotStatus.IN_COLD_STORAGE:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot delete lot '{lot.lot_number}' with status "
                f"{lot.lot_status.value}.  Only lots in cold storage "
                f"can be deleted."
            ),
        )

    db.delete(lot)
    db.commit()
    return {"message": f"Material lot '{lot.lot_number}' deleted"}


# ============================================================================
# Thaw / Out-Time Telemetry
# ============================================================================


@router.post("/{lot_id}/thaw")
async def thaw_material_lot(
    lot_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log a thaw event for a material lot.

    When a material is removed from cold storage for use, this
    records the thaw timestamp and transitions the lot to
    THAWED_IN_USE status.

    Parameters
    ----------
    lot_id : UUID
        The material lot being thawed.
    db : Session
        Active database session.
    current_user : User
        Authenticated user performing the thaw.

    Returns
    -------
    dict
        Thaw event result with timestamp and out-time limit.

    Raises
    ------
    HTTPException
        400 if the lot is already thawed, expired, or consumed.
        404 if the lot is not found.
    """
    try:
        result = await log_thaw_event(db, lot_id, current_user.id)
        db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{lot_id}/return-to-storage")
async def return_to_storage(
    lot_id: UUID,
    data: ReturnToStorageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log return of a thawed material to cold storage.

    Adds the out-time hours to the accumulated total and validates
    that the total does not exceed the maximum allowed.

    Parameters
    ----------
    lot_id : UUID
        The material lot being returned.
    data : ReturnToStorageRequest
        Number of hours the material was out of cold storage.
    db : Session
        Active database session.
    current_user : User
        Authenticated user performing the return.

    Returns
    -------
    dict
        Updated out-time totals and remaining out-time.

    Raises
    ------
    HTTPException
        400 if the lot is not thawed or out-time would be exceeded.
        404 if the lot is not found.
    """
    try:
        result = await log_return_to_storage(
            db, lot_id, data.hours_out, current_user.id
        )
        db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{lot_id}/consume")
async def consume_material_lot(
    lot_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a material lot as fully consumed.

    When a material lot is fully used in production, this transitions
    the lot to CONSUMED status, closing the lot.

    Parameters
    ----------
    lot_id : UUID
        The material lot being consumed.
    db : Session
        Active database session.
    current_user : User
        Authenticated user confirming consumption.

    Returns
    -------
    dict
        Confirmation with consumption timestamp.

    Raises
    ------
    HTTPException
        400 if the lot is expired or already consumed.
        404 if the lot is not found.
    """
    try:
        result = await consume_lot(db, lot_id, current_user.id)
        db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/{lot_id}/status", response_model=LotStatusResponse)
async def get_lot_status_endpoint(
    lot_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get detailed status of a material lot.

    Returns shelf-life remaining, out-time remaining, and allocation
    status for display in the UI.

    Parameters
    ----------
    lot_id : UUID
        The material lot ID.
    db : Session
        Active database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    LotStatusResponse
        Detailed lot status with computed remaining times.

    Raises
    ------
    HTTPException
        404 if the lot is not found.
    """
    result = await get_lot_status(db, lot_id)
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


# ============================================================================
# Shelf-Life Validation
# ============================================================================


@router.post("/validate-shelf-life")
async def validate_shelf_life(
    task_id: Optional[UUID] = Query(None, description="Scope to a specific task"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Validate shelf-life for all perishable material lots.

    Checks all active material lots for expiry conditions and
    automatically marks expired lots as EXPIRED_SCRAP.

    Parameters
    ----------
    task_id : UUID or None
        Optional task to scope validation.  If None, validates
        all active lots.
    db : Session
        Active database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    dict
        List of expired lots and actions taken.
    """
    expired = await validate_perishable_shelf_life(db, task_id)
    db.commit()
    return {
        "expired_lots": expired,
        "count": len(expired),
    }


# ============================================================================
# Clearance Lifecycle
# ============================================================================


@router.get("/clearance/{user_id}/status", response_model=ClearanceStatusResponse)
async def get_clearance_status_endpoint(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the clearance status of a user.

    Returns the user's clearance type, expiry date, and computed
    status (ACTIVE, EXPIRING_SOON, or EXPIRED).

    Parameters
    ----------
    user_id : int
        The user's ID.
    db : Session
        Active database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    ClearanceStatusResponse
        Clearance status with days until expiry.
    """
    result = await get_clearance_status(db, user_id)
    return result
