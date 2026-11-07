"""Calibration lifecycle interlock service.

This module enforces strict calibration tracking for physical test equipment
(ResourceNode ASSETs) and prevents schedule violations caused by using
expired or under-maintenance equipment.

Core Functions
~~~~~~~~~~~~~~

The service provides three categories of interlocks:

1. **Calibration Expiry Checks** — Verifies that an equipment resource's
   calibration is valid for a given date range.  If the ``next_calibration_due``
   date falls before the task's planned end date, the equipment is considered
   expired for that task.

2. **Maintenance Window Checks** — Queries active :class:`MaintenanceDowntimeWindow`
   records to determine if a resource is unavailable during a requested period.
   The CPM forward pass uses this to push Early Start dates forward.

3. **Recalibration Recording** — Records a completed calibration event,
   updates the equipment's calibration dates, links the calibration certificate
   artifact, and recalculates the next calibration due date.

CPM Integration
~~~~~~~~~~~~~~~

The CPM engine (:func:`app.services.cpm_engine.forward_pass`) calls
:func:`get_active_maintenance_windows` for each assigned equipment resource
and treats the returned windows as non-working calendar exceptions.  This
ensures that tasks depending on calibrated equipment are automatically
rescheduled around maintenance periods.

V&V Integration
~~~~~~~~~~~~~~~

The verification service (:func:`app.services.verification.verify_test_case_signoff`)
calls :func:`check_calibration_valid_for_date` before allowing a
VerificationTestCase to be signed off as PASSED.  If the assigned test rig's
calibration was expired on the date of execution, the signoff is rejected.

Usage
~~~~~

.. code-block:: python

    from app.services.calibration_interlock import (
        check_calibration_valid_for_date,
        get_active_maintenance_windows,
        record_calibration,
    )

    # Check if equipment is calibrated for a task's duration
    is_valid, reason = check_calibration_valid_for_date(
        resource_id, task_start, task_end, db
    )

    # Get maintenance windows for CPM scheduling
    windows = get_active_maintenance_windows(resource_id, start, end, db)

    # Record a new calibration event
    record_calibration(resource_id, cal_date, interval_days, cert_id, user_id, db)
"""
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import Session
from datetime import datetime, timezone, date, timedelta
from uuid import UUID
from typing import Optional, List, Tuple

from app.models.models import (
    ResourceNode,
    MaintenanceDowntimeWindow,
    MaintenanceType,
)


# ============================================================================
# Calibration Expiry Checks
# ============================================================================


def check_calibration_valid_for_date(
    resource_id: UUID,
    task_start: date,
    task_end: date,
    db: Session,
) -> Tuple[bool, Optional[str]]:
    """Check if a resource's calibration is valid for a given date range.

    Verifies that the equipment resource's ``next_calibration_due`` date
    is on or after the task's planned end date.  If the calibration expires
    before the task completes, the equipment is considered invalid for
    that task.

    Parameters
    ----------
    resource_id : UUID
        The UUID of the ResourceNode to check.
    task_start : date
        The task's planned start date.
    task_end : date
        The task's planned end date.
    db : Session
        Active database session.

    Returns
    -------
    Tuple[bool, Optional[str]]
        A tuple of (is_valid, reason).  If ``is_valid`` is True,
        ``reason`` is None.  If False, ``reason`` explains why the
        calibration is invalid (e.g., "Calibration expires 2026-06-15,
        task ends 2026-07-01").

        If the resource has no calibration tracking configured
        (``calibration_interval_days`` is None), it is considered valid
        by default — the check only applies to tracked equipment.
    """
    resource = db.execute(
        select(ResourceNode).where(ResourceNode.id == resource_id)
    ).scalar_one_or_none()

    if resource is None:
        return False, f"Resource {resource_id} not found"

    # If no calibration tracking is configured, consider it valid
    if resource.next_calibration_due is None:
        return True, None

    if resource.next_calibration_due < task_end:
        return (
            False,
            f"Calibration expires {resource.next_calibration_due}, "
            f"task ends {task_end}",
        )

    # Check if resource is out of service
    if resource.is_out_of_service:
        return False, f"Resource {resource.code} is currently out of service"

    return True, None


def check_calibration_valid_on_date(
    resource_id: UUID,
    execution_date: date,
    db: Session,
) -> Tuple[bool, Optional[str]]:
    """Check if a resource's calibration was valid on a specific date.

    Used by the V&V verification service to ensure that test results
    obtained on a given date were produced with properly calibrated
    equipment.

    Parameters
    ----------
    resource_id : UUID
        The UUID of the ResourceNode to check.
    execution_date : date
        The date when the test was executed.
    db : Session
        Active database session.

    Returns
    -------
    Tuple[bool, Optional[str]]
        A tuple of (is_valid, reason).  If the resource's calibration
        was valid on the execution date, returns (True, None).
        Otherwise returns (False, reason_string).
    """
    resource = db.execute(
        select(ResourceNode).where(ResourceNode.id == resource_id)
    ).scalar_one_or_none()

    if resource is None:
        return False, f"Resource {resource_id} not found"

    # If no calibration tracking, consider it valid
    if resource.next_calibration_due is None:
        return True, None

    # Calibration must be valid on the execution date
    if resource.next_calibration_due < execution_date:
        return (
            False,
            f"Calibration expired {resource.next_calibration_due}, "
            f"test executed {execution_date}",
        )

    # Check if resource was out of service on the execution date
    if resource.is_out_of_service:
        # Check if there was an active maintenance window on the execution date
        result = db.execute(
            select(MaintenanceDowntimeWindow).where(
                and_(
                    MaintenanceDowntimeWindow.resource_node_id == resource_id,
                    MaintenanceDowntimeWindow.downtime_start <= datetime.combine(
                        execution_date, datetime.min.time()
                    ),
                    MaintenanceDowntimeWindow.downtime_end >= datetime.combine(
                        execution_date, datetime.max.time()
                    ),
                )
            )
        ).scalar_one_or_none()

        if result:
            return (
                False,
                f"Resource was under maintenance on {execution_date} "
                f"(work order: {result.work_order_reference})",
            )

    return True, None


# ============================================================================
# Maintenance Window Queries
# ============================================================================


def get_active_maintenance_windows(
    resource_id: UUID,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = None,
) -> List[MaintenanceDowntimeWindow]:
    """Get active maintenance windows for a resource within a date range.

    Returns all maintenance windows that overlap with the specified date
    range.  If no date range is specified, returns all future maintenance
    windows (from today onwards).

    Parameters
    ----------
    resource_id : UUID
        The UUID of the ResourceNode to query.
    start_date : date, optional
        Start of the query range.  If None, defaults to today.
    end_date : date, optional
        End of the query range.  If None, returns all windows starting
        from start_date.
    db : Session, optional
        Active database session.

    Returns
    -------
    List[MaintenanceDowntimeWindow]
        List of maintenance windows overlapping the query range,
        ordered by downtime_start ascending.

        Each window represents a period when the resource is unavailable
        for assignment.  The CPM engine uses these to push Early Start
        dates forward when a task's planned start falls within a
        maintenance window.
    """
    if start_date is None:
        start_date = date.today()

    if end_date is None:
        # Default to 1 year from start if no end specified
        end_date = start_date + timedelta(days=365)

    # Find windows that overlap with the date range
    # A window overlaps if: window.start <= range.end AND window.end >= range.start
    stmt = select(MaintenanceDowntimeWindow).where(
        and_(
            MaintenanceDowntimeWindow.resource_node_id == resource_id,
            MaintenanceDowntimeWindow.downtime_start <= datetime.combine(
                end_date, datetime.max.time()
            ),
            MaintenanceDowntimeWindow.downtime_end >= datetime.combine(
                start_date, datetime.min.time()
            ),
        )
    ).order_by(MaintenanceDowntimeWindow.downtime_start)

    return db.execute(stmt).scalars().all()


def get_maintenance_window_for_date(
    resource_id: UUID,
    check_date: date,
    db: Session,
) -> Optional[MaintenanceDowntimeWindow]:
    """Check if a resource is under maintenance on a specific date.

    Parameters
    ----------
    resource_id : UUID
        The UUID of the ResourceNode to check.
    check_date : date
        The date to check for maintenance windows.
    db : Session
        Active database session.

    Returns
    -------
    MaintenanceDowntimeWindow or None
        The maintenance window active on the check date, or None if
        the resource is available on that date.
    """
    stmt = select(MaintenanceDowntimeWindow).where(
        and_(
            MaintenanceDowntimeWindow.resource_node_id == resource_id,
            MaintenanceDowntimeWindow.downtime_start <= datetime.combine(
                check_date, datetime.max.time()
            ),
            MaintenanceDowntimeWindow.downtime_end >= datetime.combine(
                check_date, datetime.min.time()
            ),
        )
    )

    return db.execute(stmt).scalar_one_or_none()


def is_resource_available_on_date(
    resource_id: UUID,
    check_date: date,
    db: Session,
) -> Tuple[bool, Optional[str]]:
    """Check if a resource is available for assignment on a specific date.

    Considers both the ``is_out_of_service`` flag and active maintenance
    windows.

    Parameters
    ----------
    resource_id : UUID
        The UUID of the ResourceNode to check.
    check_date : date
        The date to check availability for.
    db : Session
        Active database session.

    Returns
    -------
    Tuple[bool, Optional[str]]
        A tuple of (is_available, reason).  If the resource is available,
        returns (True, None).  If unavailable, returns (False, reason_string)
        explaining why (out of service or under maintenance).
    """
    resource = db.execute(
        select(ResourceNode).where(ResourceNode.id == resource_id)
    ).scalar_one_or_none()

    if resource is None:
        return False, f"Resource {resource_id} not found"

    if resource.is_out_of_service:
        return False, f"Resource {resource.code} is out of service"

    window = get_maintenance_window_for_date(resource_id, check_date, db)
    if window:
        return (
            False,
            f"Resource under maintenance on {check_date} "
            f"(work order: {window.work_order_reference})",
        )

    return True, None


# ============================================================================
# Recalibration Recording
# ============================================================================


def record_calibration(
    resource_id: UUID,
    calibration_date: date,
    interval_days: int,
    certificate_vault_id: Optional[UUID] = None,
    user_id: Optional[UUID] = None,
    db: Session = None,
) -> ResourceNode:
    """Record a completed calibration event for an equipment resource.

    Updates the resource's calibration tracking fields:

    - Sets ``last_calibration_date`` to the calibration date.
    - Sets ``calibration_interval_days`` to the provided interval.
    - Calculates and sets ``next_calibration_due`` as
      ``calibration_date + interval_days``.
    - Links the calibration certificate artifact if provided.
    - Sets ``is_out_of_service`` to False (equipment is back in service
      after recalibration).

    Parameters
    ----------
    resource_id : UUID
        The UUID of the ResourceNode being calibrated.
    calibration_date : date
        The date when the calibration was completed.
    interval_days : int
        Number of days until the next calibration is due.
    certificate_vault_id : UUID, optional
        Foreign key to the calibration certificate DocumentArtifact.
    user_id : UUID, optional
        ID of the user recording the calibration (for audit trail).
    db : Session
        Active database session.

    Returns
    -------
    ResourceNode
        The updated resource node with new calibration dates.

    Raises
    ------
    ValueError
        If the resource is not found or is not an ASSET-type resource.
    """
    resource = db.execute(
        select(ResourceNode).where(ResourceNode.id == resource_id)
    ).scalar_one_or_none()

    if resource is None:
        raise ValueError(f"Resource {resource_id} not found")

    # Update calibration tracking fields
    resource.last_calibration_date = calibration_date
    resource.calibration_interval_days = interval_days
    resource.next_calibration_due = calibration_date + timedelta(
        days=interval_days
    )
    resource.is_out_of_service = False

    if certificate_vault_id is not None:
        resource.calibration_certificate_vault_id = certificate_vault_id

    db.commit()
    db.refresh(resource)

    return resource


# ============================================================================
# Maintenance Window Management
# ============================================================================


def schedule_maintenance_window(
    resource_id: UUID,
    downtime_start: datetime,
    downtime_end: datetime,
    maintenance_type: MaintenanceType,
    work_order_reference: str,
    technician_name: str,
    db: Session,
) -> MaintenanceDowntimeWindow:
    """Schedule a new maintenance downtime window for a resource.

    Creates a new :class:`MaintenanceDowntimeWindow` record and sets
    the resource's ``is_out_of_service`` flag to True if the maintenance
    window starts in the future or is currently active.

    Parameters
    ----------
    resource_id : UUID
        The UUID of the ResourceNode undergoing maintenance.
    downtime_start : datetime
        Start of the maintenance window (timezone-aware, UTC).
    downtime_end : datetime
        End of the maintenance window (timezone-aware, UTC).
    maintenance_type : MaintenanceType
        Category of maintenance (SCHEDULED_RECALIBRATION,
        UNSCHEDULED_REPAIR, or ANNUAL_OVERHAUL).
    work_order_reference : str
        Work order or maintenance ticket reference number.
    technician_name : str
        Name of the technician or contractor performing the work.
    db : Session
        Active database session.

    Returns
    -------
    MaintenanceDowntimeWindow
        The newly created maintenance window record.

    Raises
    ------
    ValueError
        If the resource is not found or if the downtime window is invalid
        (end before start).
    """
    resource = db.execute(
        select(ResourceNode).where(ResourceNode.id == resource_id)
    ).scalar_one_or_none()

    if resource is None:
        raise ValueError(f"Resource {resource_id} not found")

    if downtime_end <= downtime_start:
        raise ValueError(
            "Maintenance window end must be after start"
        )

    # Check for overlapping maintenance windows
    existing = db.execute(
        select(MaintenanceDowntimeWindow).where(
            and_(
                MaintenanceDowntimeWindow.resource_node_id == resource_id,
                MaintenanceDowntimeWindow.downtime_start < downtime_end,
                MaintenanceDowntimeWindow.downtime_end > downtime_start,
            )
        )
    ).scalar_one_or_none()

    if existing:
        raise ValueError(
            f"Overlapping maintenance window exists "
            f"(work order: {existing.work_order_reference})"
        )

    window = MaintenanceDowntimeWindow(
        resource_node_id=resource_id,
        downtime_start=downtime_start,
        downtime_end=downtime_end,
        maintenance_type=maintenance_type,
        work_order_reference=work_order_reference,
        technician_name=technician_name,
    )

    db.add(window)

    # Mark resource as out of service if window starts in the future or now
    now = datetime.now(timezone.utc)
    if downtime_start <= now:
        resource.is_out_of_service = True

    db.commit()
    db.refresh(window)

    return window


def complete_maintenance_window(
    window_id: UUID,
    db: Session,
) -> MaintenanceDowntimeWindow:
    """Mark a maintenance window as complete and bring resource back online.

    Updates the resource's ``is_out_of_service`` flag to False if no other
    active maintenance windows exist for the resource.

    Parameters
    ----------
    window_id : UUID
        The UUID of the MaintenanceDowntimeWindow to complete.
    db : Session
        Active database session.

    Returns
    -------
    MaintenanceDowntimeWindow
        The completed maintenance window record.

    Raises
    ------
    ValueError
        If the maintenance window is not found.
    """
    window = db.execute(
        select(MaintenanceDowntimeWindow).where(
            MaintenanceDowntimeWindow.id == window_id
        )
    ).scalar_one_or_none()

    if window is None:
        raise ValueError(f"Maintenance window {window_id} not found")

    resource = db.execute(
        select(ResourceNode).where(
            ResourceNode.id == window.resource_node_id
        )
    ).scalar_one_or_none()

    if resource:
        # Check if there are other active maintenance windows
        now = datetime.now(timezone.utc)
        active_count = db.execute(
            select(MaintenanceDowntimeWindow).where(
                and_(
                    MaintenanceDowntimeWindow.resource_node_id == window.resource_node_id,
                    MaintenanceDowntimeWindow.id != window_id,
                    MaintenanceDowntimeWindow.downtime_end > now,
                )
            )
        ).scalars().all()

        if not active_count:
            resource.is_out_of_service = False

    db.commit()
    db.refresh(window)

    return window
