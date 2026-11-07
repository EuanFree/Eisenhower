"""Relative T0 integer working-day scheduling engine.

This module provides the calculation engine for pre-contract planning
scenarios where the Authority to Proceed (ATP) date is not yet known.
Instead of absolute calendar dates, tasks are scheduled using integer
working-day offsets from a T0 anchor point.

How It Works
------------

When ``is_relative_t0_mode`` is True on a :class:`PortfolioNode`:

1. **Pre-ATP Mode** (``atp_anchor_date`` is NULL):
   All forward/backward passes operate purely on integer day arithmetic.
   Display representations format as ``T0 + Xd`` (e.g., "T0 + 45d").

2. **Post-ATP Mode** (``atp_anchor_date`` is set):
   Using the project's assigned working calendar, exact calendar dates
   are computed from relative offsets:

   .. math::

      \\text{Date} = \\text{add\\_working\\_days}(\\text{atp\\_anchor\\_date}, \\text{relative\\_day\\_offset})

   The project display seamlessly flips to calendar mode while retaining
   the underlying relative integrity.

Key Functions
-------------

- :func:`convert_relative_to_absolute` — Converts a relative day offset
  to an absolute calendar date using the project calendar.
- :func:`convert_absolute_to_relative` — Converts an absolute date back
  to a relative day offset from the ATP anchor.
- :func:`format_relative_date` — Formats a relative offset for display
  (e.g., "T0 + 45d").
- :func:`resolve_node_dates` — Returns the effective start/finish dates
  for a node, resolving relative offsets if applicable.
"""
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import Optional, Tuple
from uuid import UUID
from datetime import date, datetime, timedelta

from app.models.models import PortfolioNode, WorkingCalendar
from app.services.cpm_engine import add_working_days, calculate_working_day_difference


def format_relative_day(offset: Optional[int]) -> str:
    """Format a relative day offset for display.

    Parameters
    ----------
    offset : int or None
        The working-day offset from T0.

    Returns
    -------
    str
        Human-readable string (e.g., 'T0 + 45d', 'T0', 'T0 - 10d').

    Examples
    --------

    >>> format_relative_day(0)
    'T0'
    >>> format_relative_day(45)
    'T0 + 45d'
    >>> format_relative_day(-10)
    'T0 - 10d'
    >>> format_relative_day(None)
    'N/A'
    """
    if offset is None:
        return "N/A"
    if offset == 0:
        return "T0"
    sign = "+" if offset > 0 else "-"
    return f"T0 {sign} {abs(offset)}d"


def convert_relative_to_absolute(
    anchor_date: date,
    day_offset: int,
    calendar: Optional[WorkingCalendar] = None,
) -> date:
    """Convert a relative working-day offset to an absolute calendar date.

    Uses the project's working calendar to skip weekends and statutory
    holidays when computing the absolute date.

    Parameters
    ----------
    anchor_date : date
        The ATP anchor date (T0).
    day_offset : int
        The working-day offset from T0 (can be negative for backward
        scheduling).
    calendar : WorkingCalendar or None
        The working calendar to use for date arithmetic.  If None,
        falls back to a simple Mon-Fri weekday calendar.

    Returns
    -------
    date
        The absolute calendar date corresponding to the offset.

    Examples
    --------

    >>> anchor = date(2026, 11, 2)  # Monday
    >>> convert_relative_to_absolute(anchor, 0)
    datetime.date(2026, 11, 2)
    >>> convert_relative_to_absolute(anchor, 1)  # Next working day
    datetime.date(2026, 11, 3)
    """
    if day_offset == 0:
        return anchor_date

    # Use the CPM engine's calendar-aware date arithmetic
    if day_offset > 0:
        return add_working_days(anchor_date, day_offset, calendar)
    else:
        # Negative offset: subtract working days
        from app.services.cpm_engine import subtract_working_days
        return subtract_working_days(anchor_date, abs(day_offset), calendar)


def convert_absolute_to_relative(
    target_date: date,
    anchor_date: date,
    calendar: Optional[WorkingCalendar] = None,
) -> int:
    """Convert an absolute calendar date to a relative working-day offset.

    Parameters
    ----------
    target_date : date
        The absolute calendar date to convert.
    anchor_date : date
        The ATP anchor date (T0).
    calendar : WorkingCalendar or None
        The working calendar to use for date arithmetic.

    Returns
    -------
    int
        The working-day offset from T0.  Positive if target is after
        anchor, negative if before.

    Examples
    --------

    >>> anchor = date(2026, 11, 2)  # Monday
    >>> convert_absolute_to_relative(date(2026, 11, 6), anchor)
    4  # Mon-Fri = 4 working days
    """
    return calculate_working_day_difference(anchor_date, target_date, calendar)


def resolve_node_dates(
    node: PortfolioNode,
    calendar: Optional[WorkingCalendar] = None,
) -> Tuple[Optional[date], Optional[date]]:
    """Resolve the effective start and finish dates for a node.

    If the node is in relative T0 mode with an ATP anchor date, converts
    relative offsets to absolute dates.  Otherwise, returns the node's
    planned dates directly.

    Parameters
    ----------
    node : PortfolioNode
        The portfolio node to resolve dates for.
    calendar : WorkingCalendar or None
        The working calendar for date arithmetic.

    Returns
    -------
    Tuple[date or None, date or None]
        (effective_start_date, effective_finish_date).  Returns None
        for dates that cannot be resolved.
    """
    if node.is_relative_t0_mode and node.atp_anchor_date:
        # Post-ATP mode: convert relative offsets to absolute dates
        start_date = None
        finish_date = None

        if node.relative_start_day_offset is not None:
            start_date = convert_relative_to_absolute(
                node.atp_anchor_date,
                node.relative_start_day_offset,
                calendar,
            )

        if node.relative_finish_day_offset is not None:
            finish_date = convert_relative_to_absolute(
                node.atp_anchor_date,
                node.relative_finish_day_offset,
                calendar,
            )

        return start_date, finish_date

    # Standard mode: use planned dates directly
    start_date = None
    finish_date = None

    if node.planned_start_date:
        if isinstance(node.planned_start_date, datetime):
            start_date = node.planned_start_date.date()
        else:
            start_date = node.planned_start_date

    if node.planned_end_date:
        if isinstance(node.planned_end_date, datetime):
            finish_date = node.planned_end_date.date()
        else:
            finish_date = node.planned_end_date

    return start_date, finish_date


def get_node_display_dates(
    node: PortfolioNode,
) -> Tuple[str, str]:
    """Get display strings for a node's start and finish dates.

    Returns human-readable strings appropriate for the node's scheduling
    mode.  In relative T0 mode without an ATP anchor, returns "T0 + Xd"
    format.  Otherwise, returns ISO-formatted dates.

    Parameters
    ----------
    node : PortfolioNode
        The portfolio node.

    Returns
    -------
    Tuple[str, str]
        (start_display, finish_display) strings.
    """
    if node.is_relative_t0_mode:
        start_display = format_relative_day(node.relative_start_day_offset)
        finish_display = format_relative_day(node.relative_finish_day_offset)
        return start_display, finish_display

    # Standard mode
    start_display = (
        node.planned_start_date.strftime("%Y-%m-%d")
        if node.planned_start_date
        else "N/A"
    )
    finish_display = (
        node.planned_end_date.strftime("%Y-%m-%d")
        if node.planned_end_date
        else "N/A"
    )
    return start_display, finish_display


def set_atp_anchor_date(
    db: Session,
    root_node_id: UUID,
    anchor_date: date,
) -> int:
    """Set the ATP anchor date for a project and all its relative-mode descendants.

    When the Authority to Proceed date is known, this function sets the
    ``atp_anchor_date`` on the root node and all descendant nodes that
    are in relative T0 mode.  This triggers the conversion from relative
    offsets to absolute calendar dates.

    Parameters
    ----------
    db : Session
        Active database session.
    root_node_id : UUID
        The root project node.
    anchor_date : date
        The ATP anchor date.

    Returns
    -------
    int
        Number of nodes updated.

    Notes
    -----
    This function sets only the ``atp_anchor_date`` field.  The actual
    date resolution is done lazily by :func:`resolve_node_dates` when
    the node is queried.  This keeps the database writes minimal and
    allows the relative offsets to be adjusted independently.
    """
    root_node = db.get(PortfolioNode, root_node_id)
    if root_node is None:
        return 0

    root_path = root_node.path
    if not root_path:
        return 0

    # Update all descendants in relative T0 mode
    updated_count = 0

    # Load all descendants
    descendants = db.execute(
        select(PortfolioNode).where(
            PortfolioNode.path.like(f"{root_path}.%"),
            PortfolioNode.is_relative_t0_mode == True,
        )
    ).all()

    # Set anchor on root
    root_node.atp_anchor_date = anchor_date
    updated_count = 1

    # Set anchor on all descendants
    for desc_row in descendants:
        desc = desc_row[0] if isinstance(desc_row, tuple) else desc_row
        desc.atp_anchor_date = anchor_date
        updated_count += 1

    db.commit()
    return updated_count


def clear_atp_anchor_date(
    db: Session,
    root_node_id: UUID,
) -> int:
    """Clear the ATP anchor date, reverting to pure relative mode.

    Parameters
    ----------
    db : Session
        Active database session.
    root_node_id : UUID
        The root project node.

    Returns
    -------
    int
        Number of nodes updated.
    """
    root_node = db.get(PortfolioNode, root_node_id)
    if root_node is None:
        return 0

    root_path = root_node.path
    if not root_path:
        return 0

    updated_count = 0

    # Clear anchor on root
    root_node.atp_anchor_date = None
    updated_count = 1

    # Clear anchor on all descendants
    descendants = db.execute(
        select(PortfolioNode).where(
            PortfolioNode.path.like(f"{root_path}.%"),
            PortfolioNode.is_relative_t0_mode == True,
        )
    ).all()

    for desc_row in descendants:
        desc = desc_row[0] if isinstance(desc_row, tuple) else desc
        desc.atp_anchor_date = None
        updated_count += 1

    db.commit()
    return updated_count
