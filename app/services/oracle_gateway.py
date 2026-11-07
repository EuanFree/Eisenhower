"""Oracle ERP gateway service for timesheet pre-population and export staging.

This module provides the bridge between the Eisenhower Portfolio Manager's
internal scheduling system and Oracle EBS (Enterprise Business Suite) for
timesheet and cost accounting workflows.

Two Core Functions
------------------

1. **Timesheet Pre-Population** — When a user opens their weekly timesheet,
   the system inspects active CPM (Critical Path Method) assignments and
   auto-populates scheduled hours so the user can confirm or adjust rather
   than entering from scratch.

2. **Oracle Staging Payload Generation** — When a timesheet period is closed,
   approved timesheet lines are formatted into Oracle EBS staging format
   (PA_TRANSACTION_INTERFACE_ALL schema / OTL CSV).  Classified task names
   are automatically replaced with sanitised cost-code identifiers to prevent
   classified information from leaking into the ERP system.

Timesheet Pre-Population Algorithm
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The algorithm works as follows:

1. Find the ResourceNode corresponding to the authenticated user by matching
   the user's username, email, or full_name against the resource's code/name.

2. Query all active ResourceAssignments for that resource where the assigned
   PortfolioNode's planned dates overlap with the requested timesheet period.

3. For each assignment, distribute the planned hours across the working days
   within the period, respecting the allocated_units (e.g., 0.5 = half-day).

4. Look up the OracleProjectMapping for each portfolio node to obtain the
   Oracle cost code (project number, task number, expenditure org, type).

5. Return the pre-populated line items so the frontend can display them
   in the timesheet grid.

Oracle Staging Payload Format
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The staging payload follows the Oracle EBS PA_TRANSACTION_INTERFACE_ALL
table structure, which is the standard interface for loading project
transactions into Oracle Projects.  The CSV format includes:

- TRANSACTION_ID — Unique transaction identifier.
- ORGANIZATION_ID — Organisation identifier.
- PROJECT_ID — Oracle project number.
- TASK_ID — Oracle task number.
- EXPENDITURE_TYPE — Cost category (e.g., 'Direct Labor').
- TRANSACTION_DATE — Date the work was performed.
- TRANSACTION_STATUS — Status of the transaction (PENDING).
- BILLABLE_FLAG — Whether the transaction is billable (Y).
- CREATION_DATE — Timestamp of record creation.
- CREATED_BY — User who created the record.
- RESOURCE_ID — Resource identifier (user).
- NAME — Resource name.
- DESCRIPTION — Description of work (sanitised for classified tasks).
- TRANSACTION_AMOUNT — Hours worked.
- EXCHANGE_RATE — Currency exchange rate (1.0 for domestic).
- EXCHANGE_RATE_TYPE — Exchange rate type.
- EXCHANGE_RATE_DATE — Date of exchange rate.
- ATTRIBUTE_CATEGORY — Global attribute category.
- GLOBAL_ATTRIBUTE_CATEGORY — Additional attribute category.
- BATCH_SOURCE_NAME — Source system identifier.

Data Sanitization
~~~~~~~~~~~~~~~~~

Before generating the staging payload, classified task names are replaced
with their Oracle cost-code identifiers.  For example, a task named
"CLASSIFIED AVIONICS INTEGRATION" with Oracle task number "10.02.01"
will appear in the export as "Task 10.02.01" to prevent classified
information from entering the ERP system.

Dependencies
~~~~~~~~~~~~

This service requires a live PostgreSQL instance to query the PortfolioNode
tree, ResourceAssignments, and OracleProjectMappings.
"""

from datetime import date, timezone, datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Optional, Tuple
from uuid import UUID, uuid4

from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.models.models import (
    ForensicAuditLog,
    OracleProjectMapping,
    PortfolioNode,
    ResourceAssignment,
    ResourceNode,
    SecurityClassification,
    TimesheetOracleExportBatch,
    User,
)


# ============================================================================
# Security classification helpers
# ============================================================================

_SECURITY_RANK = {
    SecurityClassification.OFFICIAL: 0,
    SecurityClassification.OFFICIAL_SENSITIVE: 1,
    SecurityClassification.SECRET: 2,
    SecurityClassification.TOP_SECRET: 3,
}


def _is_workday(d: date) -> bool:
    """Return True if the given date is a working day (Mon–Fri).

    Parameters
    ----------
    d : date
        The date to check.

    Returns
    -------
    bool
        True if the date is Monday through Friday.
    """
    return d.weekday() < 5


def _get_workdays_in_range(start: date, end: date) -> List[date]:
    """Return a list of working days between start and end (inclusive).

    Parameters
    ----------
    start : date
        The start date of the range.
    end : date
        The end date of the range.

    Returns
    -------
    list[date]
        List of dates that fall on Monday through Friday.
    """
    days = []
    current = start
    while current <= end:
        if _is_workday(current):
            days.append(current)
        current += timedelta(days=1)
    return days


def _find_resource_node_for_user(
    db: Session,
    user: User,
) -> Optional[ResourceNode]:
    """Find the ResourceNode corresponding to a User.

    Matches the user's username, email, or full_name against the
    ResourceNode's code and name fields.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    user : User
        The authenticated user.

    Returns
    -------
    ResourceNode or None
        The matching resource node, or None if not found.
    """
    search_terms = []
    if user.username:
        search_terms.append(user.username)
    if user.email:
        search_terms.append(user.email)
    if user.full_name:
        search_terms.append(user.full_name)

    if not search_terms:
        return None

    for term in search_terms:
        resource = (
            db.query(ResourceNode)
            .filter(
                ResourceNode.is_active == True,
                (
                    ResourceNode.code.ilike(f"%{term}%")
                    | ResourceNode.name.ilike(f"%{term}%")
                ),
            )
            .first()
        )
        if resource:
            return resource

    return None


def _get_oracle_mapping(
    db: Session,
    portfolio_node_id: UUID,
) -> Optional[OracleProjectMapping]:
    """Look up the Oracle EBS project mapping for a portfolio node.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    portfolio_node_id : UUID
        The portfolio node to look up.

    Returns
    -------
    OracleProjectMapping or None
        The mapping record, or None if not configured.
    """
    return (
        db.query(OracleProjectMapping)
        .filter(OracleProjectMapping.portfolio_node_id == portfolio_node_id)
        .first()
    )


def _sanitize_task_description(
    node: PortfolioNode,
    mapping: Optional[OracleProjectMapping],
) -> str:
    """Generate a sanitised task description for Oracle export.

    For classified tasks (SECRET or higher), replace the task name
    with the Oracle cost-code identifier to prevent classified
    information from entering the ERP system.

    For unclassified tasks, return the task name with the Oracle
    task number appended for traceability.

    Parameters
    ----------
    node : PortfolioNode
        The portfolio node being exported.
    mapping : OracleProjectMapping or None
        The Oracle project mapping for this node.

    Returns
    -------
    str
        The sanitised description string.
    """
    is_classified = _SECURITY_RANK.get(
        node.security_classification, 0
    ) >= _SECURITY_RANK[SecurityClassification.SECRET]

    if is_classified:
        # Replace classified name with cost-code identifier
        task_num = mapping.oracle_task_number if mapping else "UNKNOWN"
        return f"Task {task_num}"
    else:
        # Safe to include task name
        name = node.name or "Unnamed Task"
        if mapping:
            return f"{name} ({mapping.oracle_task_number})"
        return name


# ============================================================================
# Timesheet Pre-Population
# ============================================================================


def prepopulate_timesheet_from_schedule(
    db: Session,
    user_id: UUID,
    period_start: date,
    period_end: date,
) -> Dict[str, any]:
    """Pre-populate a user's weekly timesheet from active CPM assignments.

    This function inspects the user's active ResourceAssignments and
    distributes planned hours across the working days within the
    requested period.  The result is a list of timesheet line items
    ready to be displayed in the frontend timesheet grid.

    Algorithm
    ---------

    1. Find the ResourceNode for the authenticated user.
    2. Query all active ResourceAssignments for that resource.
    3. Filter to assignments whose portfolio node dates overlap the period.
    4. For each assignment, distribute hours across workdays in the period.
    5. Look up Oracle cost codes for each portfolio node.
    6. Return the pre-populated line items.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    user_id : UUID
        The authenticated user's UUID.
    period_start : date
        Start date of the timesheet period.
    period_end : date
        End date of the timesheet period.

    Returns
    -------
    dict
        A dictionary containing:
        - user_id: the user's UUID as a string
        - period_start: ISO-formatted start date
        - period_end: ISO-formatted end date
        - scheduled_lines: list of timesheet line item dicts

    Raises
    ------
    ValueError
        If the user is not found or has no corresponding ResourceNode.
    """
    # Find the user
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise ValueError(f"User {user_id} not found")

    # Find the resource node for this user
    resource_node = _find_resource_node_for_user(db, user)
    if resource_node is None:
        # Return empty timesheet if no resource node found
        return {
            "user_id": str(user_id),
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "scheduled_lines": [],
        }

    # Get all active assignments for this resource
    assignments = (
        db.query(ResourceAssignment)
        .filter(
            ResourceAssignment.resource_node_id == resource_node.id,
            ResourceAssignment.status.in_(
                ["CONFIRMED", "CLAIMED"]
            ),
        )
        .all()
    )

    # Get workdays in the period
    workdays = _get_workdays_in_range(period_start, period_end)
    if not workdays:
        return {
            "user_id": str(user_id),
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "scheduled_lines": [],
        }

    # Standard daily hours (8 hours per day)
    STANDARD_DAILY_HOURS = 8.0

    scheduled_lines: List[Dict[str, any]] = []

    for assignment in assignments:
        # Get the portfolio node
        node = (
            db.query(PortfolioNode)
            .filter(PortfolioNode.id == assignment.portfolio_node_id)
            .first()
        )
        if node is None:
            continue

        # Check if the node's planned dates overlap with the period
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
        else:
            # No dates set — include all workdays in period
            node_start = period_start
            node_end = period_end

        # Find overlapping workdays
        overlap_days = [
            d for d in workdays
            if node_start <= d <= node_end
        ]

        if not overlap_days:
            continue

        # Get Oracle mapping for this node
        mapping = _get_oracle_mapping(db, assignment.portfolio_node_id)

        # Calculate daily hours based on allocation
        allocated_units = assignment.allocated_units or 0.0
        daily_hours = STANDARD_DAILY_HOURS * allocated_units

        # If we have planned_hours, distribute them across overlap days
        if assignment.planned_hours and assignment.planned_hours > 0:
            # Distribute planned hours proportionally across overlap days
            total_planned = assignment.planned_hours
            # Calculate total workdays in the node's full planned period
            all_node_workdays = _get_workdays_in_range(node_start, node_end)
            if all_node_workdays:
                daily_hours = total_planned / len(all_node_workdays)
            else:
                daily_hours = total_planned / max(len(overlap_days), 1)

        # Create a line item for each overlap day
        for workday in overlap_days:
            line = {
                "portfolio_node_id": str(assignment.portfolio_node_id),
                "oracle_project_number": mapping.oracle_project_number if mapping else "",
                "oracle_task_number": mapping.oracle_task_number if mapping else "",
                "oracle_expenditure_org_name": mapping.oracle_expenditure_org_name if mapping else "",
                "oracle_expenditure_type": mapping.oracle_expenditure_type if mapping else "Direct Labor",
                "work_date": workday.isoformat(),
                "hours": round(daily_hours, 2),
                "description": _sanitize_task_description(node, mapping),
                "user_id": str(user_id),
                "user_name": user.full_name or user.username,
            }
            scheduled_lines.append(line)

    return {
        "user_id": str(user_id),
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "scheduled_lines": scheduled_lines,
    }


# ============================================================================
# Oracle Staging Payload Generation
# ============================================================================


def generate_oracle_staging_payload(
    db: Session,
    batch_id: UUID,
) -> Tuple[str, List[Dict[str, any]]]:
    """Generate an Oracle EBS staging payload for an export batch.

    Formats approved timesheet lines into Oracle EBS
    PA_TRANSACTION_INTERFACE_ALL schema / OTL CSV format.
    Classified task names are automatically replaced with
    sanitised cost-code identifiers.

    The payload is returned as a CSV string along with a list
    of line item dictionaries for audit purposes.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    batch_id : UUID
        The UUID of the export batch.

    Returns
    -------
    tuple
        A 2-tuple of:
        - csv_content: the CSV-formatted staging payload string
        - line_items: list of line item dicts for audit logging

    Raises
    ------
    ValueError
        If the batch is not found.
    """
    # Find the batch
    batch = (
        db.query(TimesheetOracleExportBatch)
        .filter(TimesheetOracleExportBatch.id == batch_id)
        .first()
    )
    if batch is None:
        raise ValueError(f"Export batch {batch_id} not found")

    # CSV header matching PA_TRANSACTION_INTERFACE_ALL columns
    csv_header = [
        "TRANSACTION_ID",
        "ORGANIZATION_ID",
        "PROJECT_ID",
        "TASK_ID",
        "EXPENDITURE_TYPE",
        "TRANSACTION_DATE",
        "TRANSACTION_STATUS",
        "BILLABLE_FLAG",
        "CREATION_DATE",
        "CREATED_BY",
        "RESOURCE_ID",
        "NAME",
        "DESCRIPTION",
        "TRANSACTION_AMOUNT",
        "EXCHANGE_RATE",
        "EXCHANGE_RATE_TYPE",
        "EXCHANGE_RATE_DATE",
        "ATTRIBUTE_CATEGORY",
        "GLOBAL_ATTRIBUTE_CATEGORY",
        "BATCH_SOURCE_NAME",
    ]

    # Collect all portfolio nodes referenced in this batch's period
    # In a real implementation, timesheet lines would be stored in a
    # separate table.  For now, we derive them from ResourceAssignments
    # within the batch's period.
    assignments = db.query(ResourceAssignment).all()

    line_items: List[Dict[str, any]] = []
    csv_rows: List[str] = []

    now = datetime.now(timezone.utc)
    batch_source = f"EISENHOWER_{batch.batch_reference}"

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
            # Skip nodes without Oracle mapping
            continue

        # Get the resource node
        resource = (
            db.query(ResourceNode)
            .filter(ResourceNode.id == assignment.resource_node_id)
            .first()
        )

        # Generate work days within the batch period
        workdays = _get_workdays_in_range(
            batch.period_start_date, batch.period_end_date
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
            workdays = [d for d in workdays if node_start <= d <= node_end]

        if not workdays:
            continue

        # Calculate daily hours
        STANDARD_DAILY_HOURS = 8.0
        allocated_units = assignment.allocated_units or 0.0
        daily_hours = STANDARD_DAILY_HOURS * allocated_units

        if assignment.planned_hours and assignment.planned_hours > 0:
            all_node_workdays = _get_workdays_in_range(
                node_start if node.planned_start_date else batch.period_start_date,
                node_end if node.planned_end_date else batch.period_end_date,
            )
            if all_node_workdays:
                daily_hours = assignment.planned_hours / len(all_node_workdays)

        for workday in workdays:
            transaction_id = str(uuid4())
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
                "RESOURCE_ID": resource.id if resource else "",
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

            # Format as CSV row
            csv_row = ",".join(
                f'"{row[col]}"' for col in csv_header
            )
            csv_rows.append(csv_row)

    # Build CSV content
    csv_header_line = ",".join(f'"{col}"' for col in csv_header)
    csv_content = csv_header_line + "\n" + "\n".join(csv_rows) + "\n"

    # Record forensic audit log entry
    try:
        audit_entry = ForensicAuditLog.create_entry(
            db=db,
            user_upn="system",
            client_ip=None,
            action_type="EXPORT",
            entity_type="TimesheetOracleExportBatch",
            entity_id=batch_id,
            json_diff={
                "batch_reference": batch.batch_reference,
                "record_count": len(line_items),
                "total_hours": sum(
                    float(item["TRANSACTION_AMOUNT"])
                    for item in line_items
                ),
            },
        )
        db.add(audit_entry)
        db.commit()
    except Exception:
        # Don't fail the export if audit logging fails
        db.rollback()

    return csv_content, line_items


def create_export_batch(
    db: Session,
    period_start: date,
    period_end: date,
    user_id: UUID,
    line_items: List[Dict[str, any]],
) -> TimesheetOracleExportBatch:
    """Create a new Oracle export batch for a closed timesheet period.

    This function creates a new TimesheetOracleExportBatch record
    and calculates the total hours and record count from the
    provided line items.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    period_start : date
        Start date of the timesheet period.
    period_end : date
        End date of the timesheet period.
    user_id : UUID
        The user who created the batch.
    line_items : list
        List of timesheet line item dictionaries.

    Returns
    -------
    TimesheetOracleExportBatch
        The newly created export batch record.
    """
    # Generate batch reference
    week_num = period_start.isocalendar()[1]
    year = period_start.year
    batch_ref = f"TS-{year}-W{week_num:02d}-{uuid4().hex[:4].upper()}"

    # Calculate totals
    total_hours = sum(
        float(item.get("TRANSACTION_AMOUNT", 0))
        for item in line_items
    )
    record_count = len(line_items)

    batch = TimesheetOracleExportBatch(
        batch_reference=batch_ref,
        period_start_date=period_start,
        period_end_date=period_end,
        total_hours=Decimal(str(round(total_hours, 2))),
        record_count=record_count,
    )

    db.add(batch)
    db.commit()
    db.refresh(batch)

    return batch
