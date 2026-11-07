"""Facility reservation and timeline API endpoints.

This router provides endpoints for managing chamber reservations and
viewing facility timelines.  It is the primary interface for booking
high-demand physical resources (EMC Anechoic Chambers, Thermal Vacuum
Chambers, HIL rigs) and checking their availability.

Endpoints
~~~~~~~~~

- **POST /reservations** — Create a new chamber reservation with full
  validation (capability gate, calibration gate, buffer enforcement).
- **GET /locations/{id}/timeline** — Retrieve the time-phased reservation
  timeline for a facility, including buffer/cooldown slots.

Security
~~~~~~~~

All endpoints require JWT authentication via :func:`app.utils.auth.get_current_user`.
The authenticated user's clearance level is checked against the facility's
security classification before returning reservation data.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.schemas import (
    ChamberReservationCreate,
    ChamberReservationResponse,
    FacilityTimelineResponse,
    FacilityValidationResponse,
)
from app.services.facility_telemetry import (
    create_chamber_reservation,
    get_facility_timeline,
    validate_chamber_feasibility,
)
from app.utils.auth import get_current_user
from app.models.models import User

router = APIRouter()


@router.post(
    "/reservations",
    response_model=ChamberReservationResponse,
    summary="Create a chamber reservation",
    description=(
        "Create a new reservation for a high-demand physical resource "
        "(e.g., EMC Anechoic Chamber, Thermal Vacuum Chamber).  Before "
        "committing, the reservation is validated through three gates:\n\n"
        "1. **Capability Gate** — The task's environmental envelope must "
        "fit within the chamber's capabilities.\n"
        "2. **Calibration Gate** — The reservation must not exceed the "
        "chamber's calibration expiry date.\n"
        "3. **Buffer Enforcement** — Warmup/cooldown buffer windows are "
        "checked against existing reservations.\n\n"
        "If any gate fails, HTTP 422 is returned with explicit error "
        "messages."
    ),
)
async def create_reservation(
    reservation_data: ChamberReservationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChamberReservationResponse:
    """Create a new chamber reservation.

    This endpoint validates the reservation through all three gates
    (capability, calibration, buffer) before committing it to the
    database.  If validation passes, a :class:`ChamberReservation`
    record is created and returned with calculated buffer windows.

    Parameters
    ----------
    reservation_data : ChamberReservationCreate
        Request body with location, task, time window, and operator.
    db : Session
        Database session injected by FastAPI.
    current_user : User
        Authenticated user creating the reservation.

    Returns
    -------
    ChamberReservationResponse
        The created reservation with buffer windows and location details.

    Raises
    ------
    HTTPException
        422 if any validation gate fails, with error details in the
        response body.
    """
    try:
        reservation = await create_chamber_reservation(
            reservation_data=reservation_data,
            db=db,
        )
        return reservation
    except ValueError as e:
        error_msg = str(e)
        raise HTTPException(
            status_code=422,
            detail=error_msg,
        )


@router.get(
    "/locations/{location_id}/timeline",
    response_model=FacilityTimelineResponse,
    summary="Get facility reservation timeline",
    description=(
        "Retrieve the time-phased reservation timeline for a facility.  "
        "Returns all reservations and their associated buffer/cooldown "
        "windows, sorted by start time.  The timeline is used by the "
        "Gantt/calendar display to show reservation bands and cooldown "
        "blocks.\n\n"
        "The response includes:\n"
        "- Location metadata (code, name, chamber capabilities)\n"
        "- Calibration expiry date\n"
        "- Warmup/cooldown buffer hours\n"
        "- List of reservation slots\n"
        "- List of buffer slots for visual display"
    ),
)
async def get_timeline(
    location_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FacilityTimelineResponse:
    """Get the reservation timeline for a facility.

    This endpoint returns all reservations and buffer windows for a
    given location, sorted by start time.  It is used by the frontend
    Gantt/calendar view to display facility availability.

    Parameters
    ----------
    location_id : str
        UUID of the LocationNode to query.
    db : Session
        Database session injected by FastAPI.
    current_user : User
        Authenticated user requesting the timeline.

    Returns
    -------
    FacilityTimelineResponse
        Full timeline data including location metadata, reservations,
        and buffer slots.

    Raises
    ------
    HTTPException
        404 if the location is not found.
    """
    try:
        timeline = await get_facility_timeline(
            location_id=UUID(location_id),
            db=db,
        )
        return timeline
    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e),
        )


@router.post(
    "/validate",
    response_model=FacilityValidationResponse,
    summary="Validate chamber feasibility",
    description=(
        "Validate whether a chamber reservation is feasible without "
        "creating the reservation.  This is a dry-run endpoint that "
        "runs all three validation gates (capability, calibration, "
        "buffer) and returns the result.\n\n"
        "Use this endpoint to check availability before committing "
        "a reservation."
    ),
)
async def validate_reservation(
    location_node_id: str = Query(..., description="UUID of the chamber location"),
    portfolio_node_id: str = Query(..., description="UUID of the testing task"),
    reserved_start: str = Query(..., description="ISO 8601 start datetime (UTC)"),
    reserved_end: str = Query(..., description="ISO 8601 end datetime (UTC)"),
    power_profile_kw: Optional[float] = Query(
        None,
        description="Expected power draw in kilowatts",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FacilityValidationResponse:
    """Validate chamber feasibility without creating a reservation.

    This endpoint performs a dry-run validation of all three gates
    (capability, calibration, buffer) and returns the result without
    committing any data to the database.

    Parameters
    ----------
    location_node_id : str
        UUID of the LocationNode (chamber, rig, etc.).
    portfolio_node_id : str
        UUID of the PortfolioNode representing the testing activity.
    reserved_start : str
        ISO 8601 start datetime (UTC).
    reserved_end : str
        ISO 8601 end datetime (UTC).
    power_profile_kw : float or None
        Expected power draw in kilowatts.
    db : Session
        Database session injected by FastAPI.
    current_user : User
        Authenticated user requesting validation.

    Returns
    -------
    FacilityValidationResponse
        Validation result with gate status and error messages.
    """
    requested_start = datetime.fromisoformat(reserved_start)
    requested_end = datetime.fromisoformat(reserved_end)

    validation = validate_chamber_feasibility(
        task_id=UUID(portfolio_node_id),
        location_id=UUID(location_node_id),
        requested_start=requested_start,
        requested_end=requested_end,
        db=db,
        power_profile_kw=power_profile_kw,
    )

    return validation
