Working Calendars
=================


Define working calendars that control which days are considered working days for schedule calculations.

calendars
~~~~~~~~~


Project and resource calendar management API router.

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
