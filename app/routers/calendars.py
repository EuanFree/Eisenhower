"""Project and resource calendar management API router.

This module provides the REST API endpoints for managing working calendars
and calendar exceptions.  Calendars define the standard working pattern
(working days, hours per day, jurisdiction) for projects and resources.
Calendar exceptions override the standard pattern for specific dates
(statutory holidays, planned maintenance, overtime surge periods).

Endpoints
~~~~~~~~~

- **GET /** — List all working calendars.
- **POST /** — Create a new working calendar.
- **GET /{id}** — Get a single calendar.
- **PUT /{id}** — Update a calendar.
- **DELETE /{id}** — Delete a calendar.
- **GET /{id}/exceptions** — List exceptions for a calendar.
- **POST /{id}/exceptions** — Create a new exception.
- **PUT /{id}/exceptions/{exc_id}** — Update an exception.
- **DELETE /{id}/exceptions/{exc_id}** — Delete an exception.
- **GET /{id}/working-days** — Calculate working hours across a date range.

Security
~~~~~~~~

All endpoints require JWT authentication via the ``get_current_user``
dependency.

Usage Examples
~~~~~~~~~~~~~~

Create a UK standard calendar::

    POST /api/v1/calendars/
    {
        "code": "CAL_UK_STANDARD",
        "name": "UK Standard Working Calendar",
        "jurisdiction": "UK",
        "standard_hours_per_day": 7.50,
        "working_days_mask": 31
    }

Add a statutory holiday::

    POST /api/v1/calendars/{calendar_id}/exceptions
    {
        "exception_date": "2026-05-04",
        "exception_type": "STATUTORY_HOLIDAY",
        "working_hours_override": 0.00,
        "description": "UK Spring Bank Holiday"
    }

Query working hours for a date range::

    GET /api/v1/calendars/{calendar_id}/working-days?start_date=2026-01-01&end_date=2026-01-31
"""
from datetime import date as date_type
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.models import (
    CalendarException, CalendarExceptionType, CalendarJurisdiction,
    ResourceNode, ResourceWorkPattern, User, WorkPatternTemplate,
    WorkingCalendar,
)
from app.schemas.schemas import (
    CalendarExceptionCreate,
    CalendarExceptionListResponse,
    CalendarExceptionResponse,
    CalendarExceptionUpdate,
    ResourceEffectivePatternResponse,
    ResourceWorkPatternCreate,
    ResourceWorkPatternListResponse,
    ResourceWorkPatternResponse,
    WorkingCalendarCreate,
    WorkingCalendarListResponse,
    WorkingCalendarResponse,
    WorkingCalendarUpdate,
    WorkingDaysResponse,
    WorkPatternDayResponse,
    WorkPatternTemplateCreate,
    WorkPatternTemplateListResponse,
    WorkPatternTemplateResponse,
    WorkPatternTemplateUpdate,
)
from app.services.cpm_engine import (
    _is_working_day_with_calendar,
    _get_exception_set,
)
from decimal import Decimal

router = APIRouter()


# ============================================================================
# Working Calendar CRUD
# ============================================================================


@router.get(
    "/",
    response_model=WorkingCalendarListResponse,
    summary="List all working calendars",
    description="Returns all configured working calendars with their exception counts.",
)
async def list_calendars(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all working calendars.

    Returns every calendar in the system, including the number of exceptions
    (holidays, maintenance windows, etc.) defined for each one.
    """
    calendars = db.query(WorkingCalendar).order_by(WorkingCalendar.is_default.desc(), WorkingCalendar.code).all()
    result = []
    for cal in calendars:
        exc_count = db.query(CalendarException).filter(
            CalendarException.calendar_id == cal.id
        ).count()
        result.append(WorkingCalendarResponse(
            id=str(cal.id),
            code=cal.code,
            name=cal.name,
            jurisdiction=cal.jurisdiction.value if hasattr(cal.jurisdiction, 'value') else cal.jurisdiction,
            standard_hours_per_day=float(cal.standard_hours_per_day),
            working_days_mask=cal.working_days_mask,
            is_default=cal.is_default,
            exception_count=exc_count,
        ))
    return WorkingCalendarListResponse(calendars=result, total_calendars=len(result))


@router.post(
    "/",
    response_model=WorkingCalendarResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new working calendar",
    description=(
        "Create a new working calendar defining the standard working pattern. "
        "If ``is_default`` is True, any existing default calendar will be "
        "cleared so only one default exists at a time."
    ),
)
async def create_calendar(
    request: WorkingCalendarCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new working calendar.

    Validates that the code is unique and that setting ``is_default`` does
    not create multiple default calendars.
    """
    # Check unique code
    existing = db.query(WorkingCalendar).filter(WorkingCalendar.code == request.code).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Calendar code '{request.code}' already exists",
        )

    # Validate jurisdiction
    try:
        jurisdiction = CalendarJurisdiction(request.jurisdiction)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid jurisdiction: {request.jurisdiction}. Must be one of: {[j.value for j in CalendarJurisdiction]}",
        )

    # If setting as default, clear any existing default
    if request.is_default:
        db.query(WorkingCalendar).filter(
            WorkingCalendar.is_default == True  # noqa: E712
        ).update({"is_default": False})

    cal = WorkingCalendar(
        code=request.code,
        name=request.name,
        jurisdiction=jurisdiction,
        standard_hours_per_day=Decimal(str(request.standard_hours_per_day)),
        working_days_mask=request.working_days_mask,
        is_default=request.is_default,
    )
    db.add(cal)
    db.commit()
    db.refresh(cal)

    return WorkingCalendarResponse(
        id=str(cal.id),
        code=cal.code,
        name=cal.name,
        jurisdiction=cal.jurisdiction.value if hasattr(cal.jurisdiction, 'value') else cal.jurisdiction,
        standard_hours_per_day=float(cal.standard_hours_per_day),
        working_days_mask=cal.working_days_mask,
        is_default=cal.is_default,
        exception_count=0,
    )


@router.get(
    "/{calendar_id}",
    response_model=WorkingCalendarResponse,
    summary="Get a single working calendar",
)
async def get_calendar(
    calendar_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single working calendar by ID."""
    from uuid import UUID as PyUUID
    cal = db.query(WorkingCalendar).filter(WorkingCalendar.id == PyUUID(calendar_id)).first()
    if cal is None:
        raise HTTPException(status_code=404, detail="Calendar not found")

    exc_count = db.query(CalendarException).filter(
        CalendarException.calendar_id == cal.id
    ).count()

    return WorkingCalendarResponse(
        id=str(cal.id),
        code=cal.code,
        name=cal.name,
        jurisdiction=cal.jurisdiction.value if hasattr(cal.jurisdiction, 'value') else cal.jurisdiction,
        standard_hours_per_day=float(cal.standard_hours_per_day),
        working_days_mask=cal.working_days_mask,
        is_default=cal.is_default,
        exception_count=exc_count,
    )


@router.put(
    "/{calendar_id}",
    response_model=WorkingCalendarResponse,
    summary="Update a working calendar",
)
async def update_calendar(
    calendar_id: str,
    request: WorkingCalendarUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Partially update a working calendar.

    Only the fields provided in the request body are updated; omitted
    fields remain unchanged.
    """
    from uuid import UUID as PyUUID
    cal = db.query(WorkingCalendar).filter(WorkingCalendar.id == PyUUID(calendar_id)).first()
    if cal is None:
        raise HTTPException(status_code=404, detail="Calendar not found")

    update_data = request.dict(exclude_unset=True)
    if "jurisdiction" in update_data and update_data["jurisdiction"] is not None:
        try:
            update_data["jurisdiction"] = CalendarJurisdiction(update_data["jurisdiction"])
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid jurisdiction: {update_data['jurisdiction']}",
            )
    if "standard_hours_per_day" in update_data and update_data["standard_hours_per_day"] is not None:
        update_data["standard_hours_per_day"] = Decimal(str(update_data["standard_hours_per_day"]))

    # If setting as default, clear any existing default
    if update_data.get("is_default") is True:
        db.query(WorkingCalendar).filter(
            WorkingCalendar.is_default == True,  # noqa: E712
            WorkingCalendar.id != cal.id,
        ).update({"is_default": False})

    for key, value in update_data.items():
        setattr(cal, key, value)

    db.commit()
    db.refresh(cal)

    exc_count = db.query(CalendarException).filter(
        CalendarException.calendar_id == cal.id
    ).count()

    return WorkingCalendarResponse(
        id=str(cal.id),
        code=cal.code,
        name=cal.name,
        jurisdiction=cal.jurisdiction.value if hasattr(cal.jurisdiction, 'value') else cal.jurisdiction,
        standard_hours_per_day=float(cal.standard_hours_per_day),
        working_days_mask=cal.working_days_mask,
        is_default=cal.is_default,
        exception_count=exc_count,
    )


@router.delete(
    "/{calendar_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a working calendar",
    description="Deletes the calendar and all associated exceptions (cascade).",
)
async def delete_calendar(
    calendar_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a working calendar.

    All associated CalendarException records are automatically deleted
    via cascade.
    """
    from uuid import UUID as PyUUID
    cal = db.query(WorkingCalendar).filter(WorkingCalendar.id == PyUUID(calendar_id)).first()
    if cal is None:
        raise HTTPException(status_code=404, detail="Calendar not found")

    db.delete(cal)
    db.commit()


# ============================================================================
# Calendar Exception CRUD
# ============================================================================


@router.get(
    "/{calendar_id}/exceptions",
    response_model=CalendarExceptionListResponse,
    summary="List exceptions for a calendar",
)
async def list_exceptions(
    calendar_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all calendar exceptions for a given calendar, sorted by date."""
    from uuid import UUID as PyUUID
    cal_uuid = PyUUID(calendar_id)
    cal = db.query(WorkingCalendar).filter(WorkingCalendar.id == cal_uuid).first()
    if cal is None:
        raise HTTPException(status_code=404, detail="Calendar not found")

    exceptions = (
        db.query(CalendarException)
        .filter(CalendarException.calendar_id == cal_uuid)
        .order_by(CalendarException.exception_date)
        .all()
    )

    exc_list = []
    for exc in exceptions:
        exc_list.append(CalendarExceptionResponse(
            id=str(exc.id),
            calendar_id=str(exc.calendar_id),
            exception_date=exc.exception_date.isoformat(),
            exception_type=exc.exception_type.value if hasattr(exc.exception_type, 'value') else exc.exception_type,
            working_hours_override=float(exc.working_hours_override),
            description=exc.description,
        ))

    return CalendarExceptionListResponse(
        calendar_id=calendar_id,
        exceptions=exc_list,
        total_exceptions=len(exc_list),
    )


@router.post(
    "/{calendar_id}/exceptions",
    response_model=CalendarExceptionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a calendar exception",
)
async def create_exception(
    calendar_id: str,
    request: CalendarExceptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new calendar exception (holiday, maintenance, overtime).

    Validates that the calendar exists and that the exception type is valid.
    Duplicate dates for the same calendar are rejected.
    """
    from uuid import UUID as PyUUID
    cal_uuid = PyUUID(calendar_id)
    cal = db.query(WorkingCalendar).filter(WorkingCalendar.id == cal_uuid).first()
    if cal is None:
        raise HTTPException(status_code=404, detail="Calendar not found")

    # Validate exception type
    try:
        exc_type = CalendarExceptionType(request.exception_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid exception type: {request.exception_type}",
        )

    # Parse date
    try:
        exc_date = date_type.fromisoformat(request.exception_date)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid date format: {request.exception_date}. Use YYYY-MM-DD.",
        )

    # Check for duplicate date
    existing = (
        db.query(CalendarException)
        .filter(
            CalendarException.calendar_id == cal_uuid,
            CalendarException.exception_date == exc_date,
        )
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Exception already exists for date {exc_date.isoformat()}",
        )

    exc = CalendarException(
        calendar_id=cal_uuid,
        exception_date=exc_date,
        exception_type=exc_type,
        working_hours_override=Decimal(str(request.working_hours_override)),
        description=request.description,
    )
    db.add(exc)
    db.commit()
    db.refresh(exc)

    return CalendarExceptionResponse(
        id=str(exc.id),
        calendar_id=str(exc.calendar_id),
        exception_date=exc.exception_date.isoformat(),
        exception_type=exc.exception_type.value if hasattr(exc.exception_type, 'value') else exc.exception_type,
        working_hours_override=float(exc.working_hours_override),
        description=exc.description,
    )


@router.put(
    "/{calendar_id}/exceptions/{exception_id}",
    response_model=CalendarExceptionResponse,
    summary="Update a calendar exception",
)
async def update_exception(
    calendar_id: str,
    exception_id: str,
    request: CalendarExceptionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Partially update a calendar exception."""
    from uuid import UUID as PyUUID
    exc = (
        db.query(CalendarException)
        .filter(
            CalendarException.id == PyUUID(exception_id),
            CalendarException.calendar_id == PyUUID(calendar_id),
        )
        .first()
    )
    if exc is None:
        raise HTTPException(status_code=404, detail="Exception not found")

    update_data = request.dict(exclude_unset=True)
    if "exception_type" in update_data and update_data["exception_type"] is not None:
        try:
            update_data["exception_type"] = CalendarExceptionType(update_data["exception_type"])
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid exception type: {update_data['exception_type']}",
            )
    if "exception_date" in update_data and update_data["exception_date"] is not None:
        try:
            update_data["exception_date"] = date_type.fromisoformat(update_data["exception_date"])
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid date format: {update_data['exception_date']}",
            )
    if "working_hours_override" in update_data and update_data["working_hours_override"] is not None:
        update_data["working_hours_override"] = Decimal(str(update_data["working_hours_override"]))

    for key, value in update_data.items():
        setattr(exc, key, value)

    db.commit()
    db.refresh(exc)

    return CalendarExceptionResponse(
        id=str(exc.id),
        calendar_id=str(exc.calendar_id),
        exception_date=exc.exception_date.isoformat(),
        exception_type=exc.exception_type.value if hasattr(exc.exception_type, 'value') else exc.exception_type,
        working_hours_override=float(exc.working_hours_override),
        description=exc.description,
    )


@router.delete(
    "/{calendar_id}/exceptions/{exception_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a calendar exception",
)
async def delete_exception(
    calendar_id: str,
    exception_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a calendar exception."""
    from uuid import UUID as PyUUID
    exc = (
        db.query(CalendarException)
        .filter(
            CalendarException.id == PyUUID(exception_id),
            CalendarException.calendar_id == PyUUID(calendar_id),
        )
        .first()
    )
    if exc is None:
        raise HTTPException(status_code=404, detail="Exception not found")

    db.delete(exc)
    db.commit()


# ============================================================================
# Working Days Calculation
# ============================================================================


@router.get(
    "/{calendar_id}/working-days",
    response_model=WorkingDaysResponse,
    summary="Calculate working hours across a date range",
    description=(
        "Given a start and end date, returns the total number of working "
        "days and hours available under the specified calendar, accounting "
        "for statutory holidays, planned maintenance, and overtime surge periods."
    ),
)
async def get_working_days(
    calendar_id: str,
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Calculate working hours for a date range.

    Iterates through each day in the range, checking the calendar's working
    days mask and exception records to determine the total working hours.
    """
    from uuid import UUID as PyUUID
    from datetime import datetime as dt

    cal = db.query(WorkingCalendar).filter(WorkingCalendar.id == PyUUID(calendar_id)).first()
    if cal is None:
        raise HTTPException(status_code=404, detail="Calendar not found")

    try:
        start = date_type.fromisoformat(start_date)
        end = date_type.fromisoformat(end_date)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid date format. Use YYYY-MM-DD.",
        )

    if start > end:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="start_date must be before or equal to end_date.",
        )

    exception_map = _get_exception_set(db, cal.id)
    standard_hours = float(cal.standard_hours_per_day)

    total_working_days = 0
    total_working_hours = 0.0
    exceptions_in_range = []

    current = start
    while current <= end:
        # Check if this day is a working day per the mask
        dt_current = dt(current.year, current.month, current.day)
        is_working = _is_working_day_with_calendar(dt_current, cal, exception_map)

        if is_working:
            total_working_days += 1
            # Check for exception override
            if current in exception_map:
                hours = float(exception_map[current])
                total_working_hours += hours
            else:
                total_working_hours += standard_hours

        # Collect exceptions in range
        if current in exception_map:
            exc = (
                db.query(CalendarException)
                .filter(
                    CalendarException.calendar_id == cal.id,
                    CalendarException.exception_date == current,
                )
                .first()
            )
            if exc is not None:
                exceptions_in_range.append(CalendarExceptionResponse(
                    id=str(exc.id),
                    calendar_id=str(exc.calendar_id),
                    exception_date=exc.exception_date.isoformat(),
                    exception_type=exc.exception_type.value if hasattr(exc.exception_type, 'value') else exc.exception_type,
                    working_hours_override=float(exc.working_hours_override),
                    description=exc.description,
                ))

        current += __import__('datetime').timedelta(days=1)

    return WorkingDaysResponse(
        calendar_id=calendar_id,
        start_date=start_date,
        end_date=end_date,
        total_working_days=total_working_days,
        total_working_hours=total_working_hours,
        standard_hours_per_day=standard_hours,
        exceptions_in_range=exceptions_in_range,
    )


# ============================================================================
# Work Pattern Templates
# ============================================================================


@router.get(
    "/work-patterns/",
    response_model=WorkPatternTemplateListResponse,
    summary="List all work pattern templates",
    description="Returns all work pattern templates, optionally filtered by category.",
)
async def list_work_patterns(
    category: Optional[str] = Query(None, description="Filter by category"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all work pattern templates."""
    from app.services.work_patterns import WorkPatternService
    service = WorkPatternService()
    templates = service.list_templates(db, category=category)

    result = []
    defaults = {}
    for tpl in templates:
        days = sorted(tpl.days, key=lambda d: d.day_of_week) if tpl.days else []
        resource_count = len(tpl.resource_assignments) if tpl.resource_assignments else 0
        if tpl.is_default:
            defaults[tpl.category] = str(tpl.id)
        result.append(WorkPatternTemplateResponse(
            id=str(tpl.id),
            code=tpl.code,
            name=tpl.name,
            description=tpl.description,
            category=tpl.category.value if hasattr(tpl.category, 'value') else tpl.category,
            version=tpl.version,
            is_default=tpl.is_default,
            is_active=tpl.is_active,
            days=[WorkPatternDayResponse(
                id=str(d.id),
                day_of_week=d.day_of_week,
                hours=float(d.hours),
                start_time=d.start_time.strftime("%H:%M") if d.start_time else None,
                end_time=d.end_time.strftime("%H:%M") if d.end_time else None,
            ) for d in days],
            resource_count=resource_count,
            created_at=tpl.created_at,
            updated_at=tpl.updated_at,
        ))

    return WorkPatternTemplateListResponse(
        templates=result,
        total_calendars=len(result),
        defaults=defaults,
    )


@router.post(
    "/work-patterns/",
    response_model=WorkPatternTemplateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new work pattern template",
    description="Creates a reusable work pattern template with per-day-of-week definitions.",
)
async def create_work_pattern(
    data: WorkPatternTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new work pattern template."""
    from app.services.work_patterns import WorkPatternService
    service = WorkPatternService()
    try:
        template = service.create_template(
            db=db,
            code=data.code,
            name=data.name,
            description=data.description,
            category=data.category,
            days=[{
                "day_of_week": d.day_of_week,
                "hours": d.hours,
                "start_time": d.start_time,
                "end_time": d.end_time,
            } for d in data.days],
            is_default=data.is_default,
            user_id=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    days = sorted(template.days, key=lambda d: d.day_of_week) if template.days else []
    return WorkPatternTemplateResponse(
        id=str(template.id),
        code=template.code,
        name=template.name,
        description=template.description,
        category=template.category.value if hasattr(template.category, 'value') else template.category,
        version=template.version,
        is_default=template.is_default,
        is_active=template.is_active,
        days=[WorkPatternDayResponse(
            id=str(d.id),
            day_of_week=d.day_of_week,
            hours=float(d.hours),
            start_time=d.start_time.strftime("%H:%M") if d.start_time else None,
            end_time=d.end_time.strftime("%H:%M") if d.end_time else None,
        ) for d in days],
        resource_count=0,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


@router.get(
    "/work-patterns/{template_id}",
    response_model=WorkPatternTemplateResponse,
    summary="Get a single work pattern template",
)
async def get_work_pattern(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single work pattern template."""
    from app.services.work_patterns import WorkPatternService
    from uuid import UUID as PyUUID
    service = WorkPatternService()
    template = service.get_template(db, PyUUID(template_id))
    if not template:
        raise HTTPException(status_code=404, detail="Work pattern template not found")

    days = sorted(template.days, key=lambda d: d.day_of_week) if template.days else []
    return WorkPatternTemplateResponse(
        id=str(template.id),
        code=template.code,
        name=template.name,
        description=template.description,
        category=template.category.value if hasattr(template.category, 'value') else template.category,
        version=template.version,
        is_default=template.is_default,
        is_active=template.is_active,
        days=[WorkPatternDayResponse(
            id=str(d.id),
            day_of_week=d.day_of_week,
            hours=float(d.hours),
            start_time=d.start_time.strftime("%H:%M") if d.start_time else None,
            end_time=d.end_time.strftime("%H:%M") if d.end_time else None,
        ) for d in days],
        resource_count=len(template.resource_assignments) if template.resource_assignments else 0,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


@router.put(
    "/work-patterns/{template_id}",
    response_model=WorkPatternTemplateResponse,
    summary="Update a work pattern template",
)
async def update_work_pattern(
    template_id: str,
    data: WorkPatternTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a work pattern template."""
    from app.services.work_patterns import WorkPatternService
    from uuid import UUID as PyUUID
    service = WorkPatternService()
    try:
        template = service.update_template(
            db=db,
            template_id=PyUUID(template_id),
            name=data.name,
            description=data.description,
            category=data.category,
            is_default=data.is_default,
            is_active=data.is_active,
            days=[{
                "day_of_week": d.day_of_week,
                "hours": d.hours,
                "start_time": d.start_time,
                "end_time": d.end_time,
            } for d in data.days] if data.days is not None else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    days = sorted(template.days, key=lambda d: d.day_of_week) if template.days else []
    return WorkPatternTemplateResponse(
        id=str(template.id),
        code=template.code,
        name=template.name,
        description=template.description,
        category=template.category.value if hasattr(template.category, 'value') else template.category,
        version=template.version,
        is_default=template.is_default,
        is_active=template.is_active,
        days=[WorkPatternDayResponse(
            id=str(d.id),
            day_of_week=d.day_of_week,
            hours=float(d.hours),
            start_time=d.start_time.strftime("%H:%M") if d.start_time else None,
            end_time=d.end_time.strftime("%H:%M") if d.end_time else None,
        ) for d in days],
        resource_count=len(template.resource_assignments) if template.resource_assignments else 0,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


@router.delete(
    "/work-patterns/{template_id}",
    summary="Deactivate a work pattern template",
)
async def delete_work_pattern(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deactivate a work pattern template."""
    from app.services.work_patterns import WorkPatternService
    from uuid import UUID as PyUUID
    service = WorkPatternService()
    try:
        service.delete_template(db, PyUUID(template_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"message": "Template deactivated"}


@router.post(
    "/work-patterns/{template_id}/set-default",
    response_model=WorkPatternTemplateResponse,
    summary="Set a template as the default for its category",
)
async def set_default_work_pattern(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set a template as the default for its category."""
    from app.services.work_patterns import WorkPatternService
    from uuid import UUID as PyUUID
    service = WorkPatternService()
    try:
        template = service.set_default_template(db, PyUUID(template_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    days = sorted(template.days, key=lambda d: d.day_of_week) if template.days else []
    return WorkPatternTemplateResponse(
        id=str(template.id),
        code=template.code,
        name=template.name,
        description=template.description,
        category=template.category.value if hasattr(template.category, 'value') else template.category,
        version=template.version,
        is_default=template.is_default,
        is_active=template.is_active,
        days=[WorkPatternDayResponse(
            id=str(d.id),
            day_of_week=d.day_of_week,
            hours=float(d.hours),
            start_time=d.start_time.strftime("%H:%M") if d.start_time else None,
            end_time=d.end_time.strftime("%H:%M") if d.end_time else None,
        ) for d in days],
        resource_count=len(template.resource_assignments) if template.resource_assignments else 0,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


# ============================================================================
# Resource Work Pattern Assignments
# ============================================================================


@router.post(
    "/work-patterns/assignments/",
    response_model=ResourceWorkPatternResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Assign a work pattern to a resource",
)
async def assign_work_pattern(
    data: ResourceWorkPatternCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Assign a work pattern template to a resource."""
    from app.services.work_patterns import WorkPatternService
    from uuid import UUID as PyUUID
    from datetime import date as date_type
    service = WorkPatternService()
    try:
        assignment = service.assign_pattern_to_resource(
            db=db,
            resource_node_id=PyUUID(data.resource_node_id),
            template_id=PyUUID(data.template_id),
            effective_from=date_type.fromisoformat(data.effective_from),
            effective_to=date_type.fromisoformat(data.effective_to) if data.effective_to else None,
            override_hours=data.override_hours,
            priority=data.priority,
            notes=data.notes,
            user_id=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    template = db.query(WorkPatternTemplate).filter(WorkPatternTemplate.id == assignment.template_id).first()
    resource = db.query(ResourceNode).filter(ResourceNode.id == assignment.resource_node_id).first()
    return ResourceWorkPatternResponse(
        id=str(assignment.id),
        resource_node_id=str(assignment.resource_node_id),
        resource_name=resource.name if resource else "Unknown",
        template_id=str(assignment.template_id),
        template_name=template.name if template else "Unknown",
        effective_from=assignment.effective_from.isoformat(),
        effective_to=assignment.effective_to.isoformat() if assignment.effective_to else None,
        override_hours=assignment.override_hours_json,
        priority=assignment.priority,
        notes=assignment.notes,
        created_at=assignment.created_at,
    )


@router.get(
    "/work-patterns/assignments/",
    response_model=ResourceWorkPatternListResponse,
    summary="List resource work pattern assignments",
)
async def list_resource_assignments(
    resource_node_id: Optional[str] = Query(None, description="Filter by resource"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List resource work pattern assignments."""
    from app.services.work_patterns import WorkPatternService
    from uuid import UUID as PyUUID
    service = WorkPatternService()

    if resource_node_id:
        assignments = service.get_resource_assignments(db, PyUUID(resource_node_id))
    else:
        assignments = db.query(ResourceWorkPattern).order_by(ResourceWorkPattern.created_at.desc()).all()

    result = []
    for a in assignments:
        template = db.query(WorkPatternTemplate).filter(WorkPatternTemplate.id == a.template_id).first()
        resource = db.query(ResourceNode).filter(ResourceNode.id == a.resource_node_id).first()
        result.append(ResourceWorkPatternResponse(
            id=str(a.id),
            resource_node_id=str(a.resource_node_id),
            resource_name=resource.name if resource else "Unknown",
            template_id=str(a.template_id),
            template_name=template.name if template else "Unknown",
            effective_from=a.effective_from.isoformat(),
            effective_to=a.effective_to.isoformat() if a.effective_to else None,
            override_hours=a.override_hours_json,
            priority=a.priority,
            notes=a.notes,
            created_at=a.created_at,
        ))

    return ResourceWorkPatternListResponse(assignments=result, total_assignments=len(result))


@router.delete(
    "/work-patterns/assignments/{assignment_id}",
    summary="Remove a work pattern assignment from a resource",
)
async def remove_work_pattern(
    assignment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a work pattern assignment."""
    from app.services.work_patterns import WorkPatternService
    from uuid import UUID as PyUUID
    service = WorkPatternService()
    try:
        service.remove_pattern_from_resource(db, PyUUID(assignment_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"message": "Assignment removed"}


@router.get(
    "/work-patterns/resources/{resource_node_id}/effective",
    response_model=ResourceEffectivePatternResponse,
    summary="Get the effective work pattern for a resource",
)
async def get_resource_effective_pattern(
    resource_node_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the effective work pattern for a resource."""
    from app.services.work_patterns import WorkPatternService
    from uuid import UUID as PyUUID
    service = WorkPatternService()
    try:
        effective = service.get_resource_effective_pattern(db, PyUUID(resource_node_id))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return ResourceEffectivePatternResponse(
        resource_node_id=effective["resource_node_id"],
        resource_name=effective["resource_name"],
        template_id=effective["template_id"],
        template_name=effective["template_name"],
        effective_days=effective["effective_days"],
        weekly_hours=effective["weekly_hours"],
    )


@router.post(
    "/work-patterns/resources/{resource_node_id}/apply-default",
    response_model=ResourceWorkPatternResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Apply the default work pattern for a category to a resource",
)
async def apply_default_pattern(
    resource_node_id: str,
    category: str = Query("STANDARD", description="Category of the default pattern"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply the default work pattern for a category to a resource."""
    from app.services.work_patterns import WorkPatternService
    from uuid import UUID as PyUUID
    service = WorkPatternService()
    assignment = service.apply_default_pattern_to_resource(
        db=db,
        resource_node_id=PyUUID(resource_node_id),
        category=category,
        user_id=current_user.id,
    )
    if not assignment:
        raise HTTPException(status_code=404, detail=f"No default template found for category '{category}'")

    template = db.query(WorkPatternTemplate).filter(WorkPatternTemplate.id == assignment.template_id).first()
    resource = db.query(ResourceNode).filter(ResourceNode.id == assignment.resource_node_id).first()
    return ResourceWorkPatternResponse(
        id=str(assignment.id),
        resource_node_id=str(assignment.resource_node_id),
        resource_name=resource.name if resource else "Unknown",
        template_id=str(assignment.template_id),
        template_name=template.name if template else "Unknown",
        effective_from=assignment.effective_from.isoformat(),
        effective_to=assignment.effective_to.isoformat() if assignment.effective_to else None,
        override_hours=assignment.override_hours_json,
        priority=assignment.priority,
        notes=assignment.notes,
        created_at=assignment.created_at,
    )
