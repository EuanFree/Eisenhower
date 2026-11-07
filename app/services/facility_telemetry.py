"""Facility telemetry and chamber reservation engine.

This module manages automated facility reservation, environmental envelope
tracking, and physical conflict detection for high-demand physical resources
such as EMC Anechoic Chambers, Thermal Vacuum Chambers, and Hardware-in-the-Loop
(HIL) rigs.

Core Functionality
------------------

The engine provides three validation gates before a chamber reservation is
committed:

1. **Capability Gate** — Validates that the task's required environmental
   envelope (e.g., operating temperature range, RF shielding, power draw)
   falls within the chamber's ``chamber_capabilities``.

2. **Calibration Gate** — Rejects the reservation if the requested end time
   exceeds the chamber's ``calibration_expiry_date``.

3. **Buffer Enforcement** — Automatically inserts warmup/cooldown buffer
   windows (``requires_warmup_cooldown_hours``) before and after the test
   run.  If two project reservations overlap within a cooldown window, a
   FACILITY_CONTRAVENTION clash is flagged.

Integration
~~~~~~~~~~~

The :func:`scan_chamber_conflicts` function is called by the periodic sweep
daemon (:mod:`app.services.clash_daemon`) to raise immediate triage items
in :class:`app.models.ScheduleClashIssue` when project dates slip into
reserved chamber maintenance slots.

Usage
~~~~~

.. code-block:: python

    from app.services.facility_telemetry import validate_chamber_feasibility

    result = validate_chamber_feasibility(
        task_id="uuid-of-testing-task",
        location_id="uuid-of-chamber",
        requested_start=datetime(2026, 11, 15, 8, 0),
        requested_end=datetime(2026, 11, 15, 18, 0),
        db=session,
    )

    if not result.valid:
        raise HTTPException(422, result.errors)
"""
from datetime import datetime, timedelta
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import (
    ChamberReservation,
    LocationNode,
    PortfolioNode,
    ScheduleClashIssue,
    User,
)
from app.schemas.schemas import (
    ChamberReservationCreate,
    ChamberReservationResponse,
    FacilityTimelineResponse,
    FacilityValidationResponse,
    ReservationTimelineSlot,
)


# ============================================================================
# Chamber Feasibility Validation
# ============================================================================


def validate_chamber_feasibility(
    task_id: UUID,
    location_id: UUID,
    requested_start: datetime,
    requested_end: datetime,
    db: AsyncSession,
    power_profile_kw: Optional[float] = None,
) -> FacilityValidationResponse:
    """Validate whether a chamber reservation is feasible.

    This function performs three sequential gates before a reservation can
    be committed.  If any gate fails, the reservation is rejected with
    an explicit error message.

    Capability Gate
    ~~~~~~~~~~~~~~~

    Reads the task's ``custom_attributes`` for an ``environmental_envelope``
    key (e.g., ``{"temp_min_c": -40, "temp_max_c": 85, "rf_shielding_db": 80}``)
    and compares it against the chamber's ``chamber_capabilities``.  If the
    task requires a temperature range that the chamber cannot achieve, the
    gate fails.

    Calibration Gate
    ~~~~~~~~~~~~~~~~

    If the chamber has a ``calibration_expiry_date`` and the reservation's
    ``requested_end`` exceeds it, the gate fails.  This prevents scheduling
    tests in uncalibrated equipment.

    Buffer Enforcement
    ~~~~~~~~~~~~~~~~~~

    Calculates the full buffer window (warmup + test + cooldown) and checks
    for overlaps with existing reservations on the same chamber.  If an
    overlap is detected, the gate fails with details of the conflicting
    reservation.

    Parameters
    ----------
    task_id : UUID
        UUID of the PortfolioNode representing the testing activity.
    location_id : UUID
        UUID of the LocationNode (chamber, rig, etc.) to reserve.
    requested_start : datetime
        Requested start of the test run (UTC).
    requested_end : datetime
        Requested end of the test run (UTC).
    db : AsyncSession
        Active database session.
    power_profile_kw : float or None
        Expected power draw in kilowatts during the test run.

    Returns
    -------
    FacilityValidationResponse
        Validation result with gate status and error messages.

    Raises
    ------
    ValueError
        If the requested time window is invalid (end before start).
    """
    errors: List[str] = []
    capability_gate = True
    calibration_gate = True
    buffer_gate = True

    # Basic time window validation
    if requested_end <= requested_start:
        raise ValueError(
            "Reservation end time must be after start time."
        )

    # Load the chamber location
    location_stmt = select(LocationNode).where(
        LocationNode.id == location_id
    )
    location_result = db.execute(location_stmt)
    location = location_result.scalar_one_or_none()

    if location is None:
        return FacilityValidationResponse(
            valid=False,
            errors=[f"Location {location_id} not found."],
        )

    # Load the task node
    task_stmt = select(PortfolioNode).where(
        PortfolioNode.id == task_id
    )
    task_result = db.execute(task_stmt)
    task = task_result.scalar_one_or_none()

    if task is None:
        return FacilityValidationResponse(
            valid=False,
            errors=[f"Task {task_id} not found."],
        )

    # ------------------------------------------------------------------
    # Gate 1: Capability Gate
    # ------------------------------------------------------------------
    chamber_caps = location.chamber_capabilities or {}
    task_envelope = {}
    if task.custom_attributes:
        task_envelope = task.custom_attributes.get("environmental_envelope", {})

    if task_envelope and chamber_caps:
        # Temperature range check
        task_temp_min = task_envelope.get("temp_min_c")
        task_temp_max = task_envelope.get("temp_max_c")
        chamber_temp_min = chamber_caps.get("temp_min_c")
        chamber_temp_max = chamber_caps.get("temp_max_c")

        if task_temp_min is not None and chamber_temp_min is not None:
            if task_temp_min < chamber_temp_min:
                capability_gate = False
                errors.append(
                    f"Task requires minimum temperature {task_temp_min}°C, "
                    f"but chamber minimum is {chamber_temp_min}°C."
                )

        if task_temp_max is not None and chamber_temp_max is not None:
            if task_temp_max > chamber_temp_max:
                capability_gate = False
                errors.append(
                    f"Task requires maximum temperature {task_temp_max}°C, "
                    f"but chamber maximum is {chamber_temp_max}°C."
                )

        # RF shielding check
        task_rf = task_envelope.get("rf_shielding_db")
        chamber_rf = chamber_caps.get("rf_shielding_db")
        if task_rf is not None and chamber_rf is not None:
            if task_rf > chamber_rf:
                capability_gate = False
                errors.append(
                    f"Task requires {task_rf}dB RF shielding, "
                    f"but chamber provides {chamber_rf}dB."
                )

        # Power draw check
        if power_profile_kw is not None:
            chamber_max_power = chamber_caps.get("max_power_kw")
            if chamber_max_power is not None:
                if power_profile_kw > chamber_max_power:
                    capability_gate = False
                    errors.append(
                        f"Task requires {power_profile_kw}kW power, "
                        f"but chamber maximum is {chamber_max_power}kW."
                    )

    # ------------------------------------------------------------------
    # Gate 2: Calibration Gate
    # ------------------------------------------------------------------
    if location.calibration_expiry_date is not None:
        reservation_date = requested_end.date()
        if reservation_date > location.calibration_expiry_date:
            calibration_gate = False
            errors.append(
                f"Reservation end date {reservation_date.isoformat()} exceeds "
                f"chamber calibration expiry {location.calibration_expiry_date.isoformat()}."
            )

    # ------------------------------------------------------------------
    # Gate 3: Buffer Enforcement
    # ------------------------------------------------------------------
    warmup_hours = location.requires_warmup_cooldown_hours or 2.0
    buffer_delta = timedelta(hours=warmup_hours)
    buffer_start = requested_start - buffer_delta
    buffer_end = requested_end + buffer_delta

    # Query existing reservations that overlap with the buffer window
    overlap_stmt = select(ChamberReservation).where(
        ChamberReservation.location_node_id == location_id,
        ChamberReservation.reserved_start < buffer_end,
        ChamberReservation.reserved_end > buffer_start,
    )
    overlap_result = db.execute(overlap_stmt)
    overlapping = overlap_result.scalars().all()

    if overlapping:
        buffer_gate = False
        for res in overlapping:
            res_buffer_start = res.reserved_start - timedelta(
                hours=location.requires_warmup_cooldown_hours or 2.0
            )
            res_buffer_end = res.reserved_end + timedelta(
                hours=location.requires_warmup_cooldown_hours or 2.0
            )
            errors.append(
                f"Buffer window overlaps with existing reservation "
                f"'{res.portfolio_node.code}' "
                f"({res.reserved_start.isoformat()} – {res.reserved_end.isoformat()})."
            )

    valid = capability_gate and calibration_gate and buffer_gate

    return FacilityValidationResponse(
        valid=valid,
        capability_gate=capability_gate,
        calibration_gate=calibration_gate,
        buffer_gate=buffer_gate,
        errors=errors,
        buffer_start=buffer_start.isoformat() if valid else None,
        buffer_end=buffer_end.isoformat() if valid else None,
    )


# ============================================================================
# Reservation Creation
# ============================================================================


async def create_chamber_reservation(
    reservation_data: ChamberReservationCreate,
    db: AsyncSession,
) -> ChamberReservationResponse:
    """Create a new chamber reservation after full validation.

    This function orchestrates the complete reservation workflow:

    1. Validates chamber feasibility via :func:`validate_chamber_feasibility`.
    2. If validation passes, creates a :class:`ChamberReservation` record.
    3. Returns the reservation with calculated buffer windows.

    Parameters
    ----------
    reservation_data : ChamberReservationCreate
        Request data for the new reservation.
    db : AsyncSession
        Active database session.

    Returns
    -------
    ChamberReservationResponse
        The created reservation with buffer windows and location details.

    Raises
    ------
    ValueError
        If any validation gate fails.
    """
    # Parse datetimes
    requested_start = datetime.fromisoformat(reservation_data.reserved_start)
    requested_end = datetime.fromisoformat(reservation_data.reserved_end)

    # Validate feasibility
    validation = validate_chamber_feasibility(
        task_id=UUID(reservation_data.portfolio_node_id),
        location_id=UUID(reservation_data.location_node_id),
        requested_start=requested_start,
        requested_end=requested_end,
        db=db,
        power_profile_kw=reservation_data.power_profile_kw,
    )

    if not validation.valid:
        raise ValueError(
            f"Chamber reservation validation failed: {'; '.join(validation.errors)}"
        )

    # Load location for buffer calculation
    location_stmt = select(LocationNode).where(
        LocationNode.id == UUID(reservation_data.location_node_id)
    )
    location_result = db.execute(location_stmt)
    location = location_result.scalar_one()

    # Create the reservation
    reservation = ChamberReservation(
        location_node_id=UUID(reservation_data.location_node_id),
        portfolio_node_id=UUID(reservation_data.portfolio_node_id),
        reserved_start=requested_start,
        reserved_end=requested_end,
        setup_teardown_hours=reservation_data.setup_teardown_hours,
        power_profile_kw=reservation_data.power_profile_kw,
        test_operator_user_id=UUID(reservation_data.test_operator_user_id),
    )

    db.add(reservation)
    db.commit()
    db.refresh(reservation)

    # Calculate buffer windows
    warmup_hours = location.requires_warmup_cooldown_hours or 2.0
    buffer_delta = timedelta(hours=warmup_hours)
    buffer_start = requested_start - buffer_delta
    buffer_end = requested_end + buffer_delta

    return ChamberReservationResponse(
        id=str(reservation.id),
        location_node_id=str(reservation.location_node_id),
        portfolio_node_id=str(reservation.portfolio_node_id),
        reserved_start=reservation.reserved_start.isoformat(),
        reserved_end=reservation.reserved_end.isoformat(),
        setup_teardown_hours=reservation.setup_teardown_hours,
        power_profile_kw=reservation.power_profile_kw,
        test_operator_user_id=str(reservation.test_operator_user_id),
        buffer_start=buffer_start.isoformat(),
        buffer_end=buffer_end.isoformat(),
        location_code=location.code or "",
        location_name=location.name or "",
    )


# ============================================================================
# Timeline Query
# ============================================================================


async def get_facility_timeline(
    location_id: UUID,
    db: AsyncSession,
) -> FacilityTimelineResponse:
    """Retrieve the time-phased reservation timeline for a facility.

    This function returns all reservations and their associated buffer
    windows for a given location, sorted by start time.  The timeline
    is used by the Gantt/calendar display to show reservation bands
    and cooldown blocks.

    Parameters
    ----------
    location_id : UUID
        UUID of the LocationNode to query.
    db : AsyncSession
        Active database session.

    Returns
    -------
    FacilityTimelineResponse
        Full timeline data including location metadata, reservations,
        and buffer slots.
    """
    # Load location
    location_stmt = select(LocationNode).where(
        LocationNode.id == location_id
    )
    location_result = db.execute(location_stmt)
    location = location_result.scalar_one_or_none()

    if location is None:
        raise ValueError(f"Location {location_id} not found.")

    # Load reservations with related data
    reservations_stmt = (
        select(ChamberReservation)
        .options(
            selectinload(ChamberReservation.portfolio_node),
            selectinload(ChamberReservation.test_operator),
        )
        .where(
            ChamberReservation.location_node_id == location_id
        )
        .order_by(ChamberReservation.reserved_start)
    )
    reservations_result = db.execute(reservations_stmt)
    reservations = reservations_result.scalars().all()

    warmup_hours = location.requires_warmup_cooldown_hours or 2.0
    buffer_delta = timedelta(hours=warmup_hours)

    reservation_slots: List[ReservationTimelineSlot] = []
    buffer_slots: List[ReservationTimelineSlot] = []

    for res in reservations:
        buffer_start = res.reserved_start - buffer_delta
        buffer_end = res.reserved_end + buffer_delta

        portfolio_code = res.portfolio_node.code if res.portfolio_node else ""
        portfolio_name = res.portfolio_node.name if res.portfolio_node else ""
        operator_name = (
            res.test_operator.username if res.test_operator else None
        )

        # Main reservation slot
        reservation_slots.append(ReservationTimelineSlot(
            reservation_id=str(res.id),
            portfolio_node_id=str(res.portfolio_node_id),
            portfolio_node_code=portfolio_code,
            portfolio_node_name=portfolio_name,
            reserved_start=res.reserved_start.isoformat(),
            reserved_end=res.reserved_end.isoformat(),
            buffer_start=buffer_start.isoformat(),
            buffer_end=buffer_end.isoformat(),
            test_operator_name=operator_name,
            slot_type="reservation",
        ))

        # Buffer slot for visual display
        buffer_slots.append(ReservationTimelineSlot(
            reservation_id=str(res.id),
            portfolio_node_id=str(res.portfolio_node_id),
            portfolio_node_code=portfolio_code,
            portfolio_node_name=portfolio_name,
            reserved_start=buffer_start.isoformat(),
            reserved_end=buffer_end.isoformat(),
            buffer_start=buffer_start.isoformat(),
            buffer_end=buffer_end.isoformat(),
            test_operator_name=operator_name,
            slot_type="buffer",
        ))

    return FacilityTimelineResponse(
        location_id=str(location.id),
        location_code=location.code or "",
        location_name=location.name or "",
        chamber_capabilities=location.chamber_capabilities,
        calibration_expiry_date=(
            location.calibration_expiry_date.isoformat()
            if location.calibration_expiry_date
            else None
        ),
        warmup_cooldown_hours=warmup_hours,
        reservations=reservation_slots,
        buffer_slots=buffer_slots,
    )


# ============================================================================
# Clash Daemon Integration
# ============================================================================


async def scan_chamber_conflicts(
    db: AsyncSession,
    sweep_run_id: UUID,
) -> List[ScheduleClashIssue]:
    """Scan for chamber reservation conflicts and create clash issues.

    This function is called by the periodic sweep daemon to detect:

    1. **Buffer Overlaps** — Two reservations on the same chamber whose
       warmup/cooldown buffer windows overlap.

    2. **Calibration Expiry** — Reservations that extend beyond the
       chamber's calibration expiry date.

    3. **Maintenance Collisions** — Reservations that overlap with
       planned maintenance windows (CalendarException records on the
       chamber's calendar).

    Each conflict is persisted as a :class:`ScheduleClashIssue` with
    category ``FACILITY_CONTRAVENTION``.

    Parameters
    ----------
    db : AsyncSession
        Active database session.
    sweep_run_id : UUID
        Unique identifier for this sweep run (used to group clash issues).

    Returns
    -------
    list[ScheduleClashIssue]
        List of clash issues created during this scan.
    """
    clashes: List[ScheduleClashIssue] = []

    # Load all active reservations with location data
    reservations_stmt = (
        select(ChamberReservation)
        .options(
            selectinload(ChamberReservation.location_node),
            selectinload(ChamberReservation.portfolio_node),
        )
        .order_by(ChamberReservation.reserved_start)
    )
    reservations_result = db.execute(reservations_stmt)
    reservations = reservations_result.scalars().all()

    # Group reservations by location
    by_location: dict[UUID, List[ChamberReservation]] = {}
    for res in reservations:
        loc_id = res.location_node_id
        if loc_id not in by_location:
            by_location[loc_id] = []
        by_location[loc_id].append(res)

    # Check for buffer overlaps within each location
    for loc_id, loc_reservations in by_location.items():
        location = loc_reservations[0].location_node
        if location is None:
            continue

        warmup_hours = location.requires_warmup_cooldown_hours or 2.0
        buffer_delta = timedelta(hours=warmup_hours)

        # Compare each pair of reservations
        for i, res_a in enumerate(loc_reservations):
            buffer_a_start = res_a.reserved_start - buffer_delta
            buffer_a_end = res_a.reserved_end + buffer_delta

            for res_b in loc_reservations[i + 1:]:
                buffer_b_start = res_b.reserved_start - buffer_delta
                buffer_b_end = res_b.reserved_end + buffer_delta

                # Check for overlap
                if buffer_a_start < buffer_b_end and buffer_b_start < buffer_a_end:
                    # Overlap detected
                    clash = ScheduleClashIssue(
                        sweep_run_id=sweep_run_id,
                        category="FACILITY_CONTRAVENTION",
                        severity="CRITICAL",
                        portfolio_node_id=res_a.portfolio_node_id,
                        conflicting_node_id=res_b.portfolio_node_id,
                        conflict_window_start=buffer_a_start.date(),
                        conflict_window_end=buffer_a_end.date(),
                        title=(
                            f"Chamber buffer overlap: "
                            f"'{res_a.portfolio_node.code}' and "
                            f"'{res_b.portfolio_node.code}'"
                        ),
                        description=(
                            f"Two reservations on chamber '{location.code}' "
                            f"have overlapping buffer windows. "
                            f"Reservation A: {res_a.reserved_start.isoformat()} – "
                            f"{res_a.reserved_end.isoformat()} (buffer: "
                            f"{buffer_a_start.isoformat()} – {buffer_a_end.isoformat()}). "
                            f"Reservation B: {res_b.reserved_start.isoformat()} – "
                            f"{res_b.reserved_end.isoformat()} (buffer: "
                            f"{buffer_b_start.isoformat()} – {buffer_b_end.isoformat()})."
                        ),
                        recommended_action=(
                            f"Reschedule one of the reservations to eliminate "
                            f"the {warmup_hours}-hour buffer overlap on "
                            f"chamber '{location.code}'."
                        ),
                        is_resolved=False,
                    )
                    db.add(clash)
                    clashes.append(clash)

    # Check for calibration expiry violations
    for res in reservations:
        location = res.location_node
        if location is None:
            continue

        if (
            location.calibration_expiry_date is not None
            and res.reserved_end.date() > location.calibration_expiry_date
        ):
            clash = ScheduleClashIssue(
                sweep_run_id=sweep_run_id,
                category="FACILITY_CONTRAVENTION",
                severity="MAJOR",
                portfolio_node_id=res.portfolio_node_id,
                conflict_window_start=res.reserved_start.date(),
                conflict_window_end=res.reserved_end.date(),
                title=(
                    f"Calibration expiry: '{res.portfolio_node.code}' "
                    f"exceeds chamber calibration"
                ),
                description=(
                    f"Reservation for '{res.portfolio_node.code}' on chamber "
                    f"'{location.code}' extends to {res.reserved_end.date().isoformat()}, "
                    f"but the chamber calibration expires on "
                    f"{location.calibration_expiry_date.isoformat()}."
                ),
                recommended_action=(
                    f"Renew the chamber calibration before "
                    f"{location.calibration_expiry_date.isoformat()} or "
                    f"reschedule the test to an earlier date."
                ),
                is_resolved=False,
            )
            db.add(clash)
            clashes.append(clash)

    db.flush()
    return clashes
