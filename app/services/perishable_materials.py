"""Perishable material shelf-life validation and out-time tracking engine.

This module provides services for managing perishable materials used in
defence manufacturing and testing, including prepreg composites, structural
adhesives, chemical sealants, and pyrotechnics.

Shelf-Life Validation
---------------------

Perishable materials have strict shelf-life requirements.  Once removed from
cold storage, they must be used within a defined out-time window or they
degrade and become unusable.  This module:

1. **Tracks cold storage expiry** — Materials must be used before the
   cold storage expiry date, even if never thawed.

2. **Monitors out-time** — Once thawed, materials have a limited window
   (maximum_out_time_hours) before they degrade.  The system automatically
   marks lots as EXPIRED_SCRAP when out-time is exceeded.

3. **Generates blockers** — If an assembly task is delayed past the
   out-time or expiration of its allocated material lot, an active
   blocker is generated on the work package.

Out-Time Telemetry
------------------

The system supports telemetry logging for materials that are returned to
cold storage and retrieved again.  Each retrieval adds to the accumulated
out-time, and the system validates that the total does not exceed the
maximum allowed out-time.

Usage
-----

.. code-block:: python

    from app.services.perishable_materials import (
        validate_perishable_shelf_life,
        log_thaw_event,
        log_return_to_storage,
    )

    # Validate all lots for a task
    expired = await validate_perishable_shelf_life(db, task_id)

    # Log a thaw event
    await log_thaw_event(db, lot_id, user_id)

    # Log return to cold storage
    await log_return_to_storage(db, lot_id, hours_out, user_id)
"""
from sqlalchemy import select, update, insert
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date, timezone, datetime, timedelta
from decimal import Decimal
from uuid import UUID, uuid4
from typing import Optional, List, Dict, Any

from app.models.models import (
    PerishableMaterialLot,
    PortfolioNode,
    NodeBlocker,
    User,
    LotStatus,
    MaterialType,
    BlockerCategory,
    BlockerSeverity,
    ForensicAuditLog,
)


async def validate_perishable_shelf_life(
    db: AsyncSession,
    task_id: Optional[UUID] = None,
) -> List[Dict[str, Any]]:
    """Validate shelf-life for all perishable material lots.

    Checks all active material lots for expiry conditions:

    1. **Cold storage expiry** — The cold_storage_expiry date has passed.
    2. **Out-time exceeded** — The accumulated_out_time_hours exceeds
       maximum_out_time_hours.
    3. **Task delay** — An allocated task's planned_end_date extends
       past the lot's usable window.

    For each expired lot, the function:

    - Marks the lot as EXPIRED_SCRAP.
    - Generates an active NodeBlocker on the allocated task.
    - Records a ForensicAuditLog entry.

    Parameters
    ----------
    db : AsyncSession
        Active database session.
    task_id : UUID or None
        Optional task to scope validation.  If None, validates all
        active lots.

    Returns
    -------
    list[dict]
        List of expired lot records, each containing:

        - ``lot_id`` (UUID): The expired lot.
        - ``lot_number`` (str): The lot number.
        - ``part_number`` (str): The part number.
        - ``material_type`` (str): The material type.
        - ``expiry_reason`` (str): Why the lot expired
          ('COLD_STORAGE_EXPIRED', 'OUT_TIME_EXCEEDED',
          'TASK_DELAYED_PAST_EXPIRY').
        - ``allocated_task_id`` (UUID or None): The allocated task.
        - ``blocker_created`` (bool): Whether a blocker was created.

    Examples
    --------

    Validate all lots:

    >>> expired = await validate_perishable_shelf_life(db)
    >>> for lot in expired:
    ...     print(f"Expired: {lot['lot_number']} - {lot['expiry_reason']}")

    Validate lots for a specific task:

    >>> expired = await validate_perishable_shelf_life(db, task_id)
    """
    expired_lots = []
    today = date.today()
    now = datetime.now(timezone.utc)

    # Query active lots
    stmt = select(PerishableMaterialLot).where(
        PerishableMaterialLot.lot_status.in_([
            LotStatus.IN_COLD_STORAGE,
            LotStatus.THAWED_IN_USE,
        ])
    )

    if task_id is not None:
        stmt = stmt.where(PerishableMaterialLot.allocated_task_id == task_id)

    result = await db.execute(stmt)
    lots = result.scalars().all()

    for lot in lots:
        expiry_reason = None

        # Check cold storage expiry
        if lot.cold_storage_expiry and lot.cold_storage_expiry < today:
            expiry_reason = "COLD_STORAGE_EXPIRED"

        # Check out-time exceeded
        if expiry_reason is None and lot.thawed_timestamp is not None:
            max_out = float(lot.maximum_out_time_hours)
            acc_out = float(lot.accumulated_out_time_hours)
            if acc_out >= max_out:
                expiry_reason = "OUT_TIME_EXCEEDED"

        # Check task delay past expiry
        if expiry_reason is None and lot.allocated_task_id is not None:
            task_result = await db.execute(
                select(PortfolioNode).where(
                    PortfolioNode.id == lot.allocated_task_id
                )
            )
            task = task_result.scalar_one_or_none()
            if task and task.planned_end_date:
                # Calculate the usable window end
                if lot.thawed_timestamp is not None:
                    max_out = float(lot.maximum_out_time_hours)
                    usable_end = lot.thawed_timestamp + timedelta(
                        hours=max_out
                    )
                    if task.planned_end_date > usable_end.date():
                        expiry_reason = "TASK_DELAYED_PAST_EXPIRY"
                elif lot.cold_storage_expiry:
                    if task.planned_end_date > lot.cold_storage_expiry:
                        expiry_reason = "TASK_DELAYED_PAST_EXPIRY"

        if expiry_reason is not None:
            # Mark as expired
            lot.lot_status = LotStatus.EXPIRED_SCRAP
            lot.updated_at = now

            # Create blocker on allocated task
            blocker_created = False
            if lot.allocated_task_id is not None:
                try:
                    blocker = NodeBlocker(
                        id=uuid4(),
                        portfolio_node_id=lot.allocated_task_id,
                        category=BlockerCategory.OPERATIONAL_IMPEDIMENT,
                        severity=BlockerSeverity.CRITICAL,
                        title=f"Perishable material expired: {lot.lot_number}",
                        description=(
                            f"Material lot {lot.lot_number} ({lot.part_number}) "
                            f"has expired: {expiry_reason}. "
                            f"Material type: {lot.material_type.value}. "
                            f"Task cannot proceed until a replacement lot is allocated."
                        ),
                        impacted_hours=0.0,
                        resolved_at=None,
                    )
                    db.add(blocker)
                    blocker_created = True
                except Exception:
                    pass  # Blocker creation failure doesn't prevent expiry marking

            # Record audit log
            try:
                audit_entry = ForensicAuditLog(
                    transaction_id=uuid4(),
                    user_upn="system",
                    client_ip=None,
                    action_type="UPDATE",
                    entity_type="PerishableMaterialLot",
                    entity_id=lot.id,
                    json_diff={
                        "expiry_reason": expiry_reason,
                        "lot_number": lot.lot_number,
                        "previous_status": "THAWED_IN_USE" if lot.thawed_timestamp else "IN_COLD_STORAGE",
                        "new_status": "EXPIRED_SCRAP",
                    },
                    security_marking="SYSTEM",
                )
                # Compute hash
                audit_entry.compute_hash()
                db.add(audit_entry)
            except Exception:
                pass  # Audit log failure doesn't prevent expiry marking

            expired_lots.append({
                "lot_id": lot.id,
                "lot_number": lot.lot_number,
                "part_number": lot.part_number,
                "material_type": lot.material_type.value,
                "expiry_reason": expiry_reason,
                "allocated_task_id": lot.allocated_task_id,
                "blocker_created": blocker_created,
            })

    return expired_lots


async def log_thaw_event(
    db: AsyncSession,
    lot_id: UUID,
    user_id: int,
) -> Dict[str, Any]:
    """Log a thaw event for a perishable material lot.

    When a material is removed from cold storage for use, this function
    records the thaw timestamp and transitions the lot status to
    THAWED_IN_USE.

    Parameters
    ----------
    db : AsyncSession
        Active database session.
    lot_id : UUID
        The material lot being thawed.
    user_id : int
        The user performing the thaw.

    Returns
    -------
    dict
        Result containing:

        - ``lot_id`` (UUID): The lot ID.
        - ``lot_number`` (str): The lot number.
        - ``thawed_at`` (datetime): When the lot was thawed.
        - ``maximum_out_time_hours`` (float): The out-time limit.
        - ``status`` (str): 'THAWED_IN_USE'.

    Raises
    ------
    ValueError
        If the lot is already thawed, expired, or consumed.
        If the lot's cold storage expiry has already passed.
    """
    result = await db.execute(
        select(PerishableMaterialLot).where(PerishableMaterialLot.id == lot_id)
    )
    lot = result.scalar_one_or_none()

    if lot is None:
        raise ValueError(f"Material lot {lot_id} not found")

    if lot.lot_status == LotStatus.EXPIRED_SCRAP:
        raise ValueError(f"Material lot {lot.lot_number} is expired and cannot be thawed")

    if lot.lot_status == LotStatus.CONSUMED:
        raise ValueError(f"Material lot {lot.lot_number} is already consumed")

    if lot.lot_status == LotStatus.THAWED_IN_USE:
        raise ValueError(f"Material lot {lot.lot_number} is already thawed")

    if lot.cold_storage_expiry and lot.cold_storage_expiry < date.today():
        # Mark as expired
        lot.lot_status = LotStatus.EXPIRED_SCRAP
        raise ValueError(
            f"Material lot {lot.lot_number} has expired in cold storage"
        )

    # Record thaw event
    now = datetime.now(timezone.utc)
    lot.thawed_timestamp = now
    lot.lot_status = LotStatus.THAWED_IN_USE
    lot.updated_at = now

    return {
        "lot_id": lot.id,
        "lot_number": lot.lot_number,
        "thawed_at": now,
        "maximum_out_time_hours": float(lot.maximum_out_time_hours),
        "status": "THAWED_IN_USE",
    }


async def log_return_to_storage(
    db: AsyncSession,
    lot_id: UUID,
    hours_out: float,
    user_id: int,
) -> Dict[str, Any]:
    """Log return of a thawed material to cold storage.

    When a material is temporarily returned to cold storage after being
    thawed, this function adds the out-time to the accumulated total
    and validates that the total does not exceed the maximum allowed.

    Parameters
    ----------
    db : AsyncSession
        Active database session.
    lot_id : UUID
        The material lot being returned to storage.
    hours_out : float
        Number of hours the material was out of cold storage during
        this session.
    user_id : int
        The user performing the return.

    Returns
    -------
    dict
        Result containing:

        - ``lot_id`` (UUID): The lot ID.
        - ``lot_number`` (str): The lot number.
        - ``accumulated_out_time_hours`` (float): Total out-time.
        - ``maximum_out_time_hours`` (float): The out-time limit.
        - ``remaining_out_time_hours`` (float): Remaining out-time.
        - ``status`` (str): Current lot status.

    Raises
    ------
    ValueError
        If the lot is not currently thawed.
        If adding hours_out would exceed the maximum out-time.
    """
    result = await db.execute(
        select(PerishableMaterialLot).where(PerishableMaterialLot.id == lot_id)
    )
    lot = result.scalar_one_or_none()

    if lot is None:
        raise ValueError(f"Material lot {lot_id} not found")

    if lot.lot_status != LotStatus.THAWED_IN_USE:
        raise ValueError(
            f"Material lot {lot.lot_number} is not currently thawed "
            f"(status: {lot.lot_status.value})"
        )

    # Calculate new accumulated out-time
    current_acc = float(lot.accumulated_out_time_hours)
    max_out = float(lot.maximum_out_time_hours)
    new_acc = current_acc + hours_out

    if new_acc > max_out:
        # Mark as expired
        lot.lot_status = LotStatus.EXPIRED_SCRAP
        lot.accumulated_out_time_hours = Decimal(str(new_acc))
        lot.updated_at = datetime.now(timezone.utc)

        return {
            "lot_id": lot.id,
            "lot_number": lot.lot_number,
            "accumulated_out_time_hours": new_acc,
            "maximum_out_time_hours": max_out,
            "remaining_out_time_hours": 0.0,
            "status": "EXPIRED_SCRAP",
            "warning": "Out-time exceeded, lot marked as expired",
        }

    # Update accumulated out-time
    lot.accumulated_out_time_hours = Decimal(str(new_acc))
    lot.updated_at = datetime.now(timezone.utc)

    remaining = max_out - new_acc

    return {
        "lot_id": lot.id,
        "lot_number": lot.lot_number,
        "accumulated_out_time_hours": new_acc,
        "maximum_out_time_hours": max_out,
        "remaining_out_time_hours": remaining,
        "status": lot.lot_status.value,
    }


async def consume_lot(
    db: AsyncSession,
    lot_id: UUID,
    user_id: int,
) -> Dict[str, Any]:
    """Mark a material lot as fully consumed.

    When a material lot is fully used in production, this function
    transitions the lot status to CONSUMED, closing the lot.

    Parameters
    ----------
    db : AsyncSession
        Active database session.
    lot_id : UUID
        The material lot being consumed.
    user_id : int
        The user confirming consumption.

    Returns
    -------
    dict
        Result containing:

        - ``lot_id`` (UUID): The lot ID.
        - ``lot_number`` (str): The lot number.
        - ``status`` (str): 'CONSUMED'.
        - ``consumed_at`` (datetime): When the lot was consumed.

    Raises
    ------
    ValueError
        If the lot is expired or already consumed.
    """
    result = await db.execute(
        select(PerishableMaterialLot).where(PerishableMaterialLot.id == lot_id)
    )
    lot = result.scalar_one_or_none()

    if lot is None:
        raise ValueError(f"Material lot {lot_id} not found")

    if lot.lot_status == LotStatus.EXPIRED_SCRAP:
        raise ValueError(f"Material lot {lot.lot_number} is expired")

    if lot.lot_status == LotStatus.CONSUMED:
        raise ValueError(f"Material lot {lot.lot_number} is already consumed")

    now = datetime.now(timezone.utc)
    lot.lot_status = LotStatus.CONSUMED
    lot.updated_at = now

    return {
        "lot_id": lot.id,
        "lot_number": lot.lot_number,
        "status": "CONSUMED",
        "consumed_at": now,
    }


async def get_lot_status(
    db: AsyncSession,
    lot_id: UUID,
) -> Dict[str, Any]:
    """Get the current status of a material lot.

    Returns detailed status information for a material lot, including
    shelf-life remaining, out-time remaining, and allocation status.

    Parameters
    ----------
    db : AsyncSession
        Active database session.
    lot_id : UUID
        The material lot to query.

    Returns
    -------
    dict
        Lot status containing:

        - ``lot_id`` (UUID): The lot ID.
        - ``lot_number`` (str): The lot number.
        - ``part_number`` (str): The part number.
        - ``material_type`` (str): The material type.
        - ``lot_status`` (str): Current status.
        - ``cold_storage_expiry`` (date): Cold storage expiry date.
        - ``days_until_cold_expiry`` (int or None): Days until cold
          storage expiry.
        - ``thawed_at`` (datetime or None): When the lot was thawed.
        - ``accumulated_out_time_hours`` (float): Total out-time.
        - ``maximum_out_time_hours`` (float): Maximum out-time.
        - ``remaining_out_time_hours`` (float): Remaining out-time.
        - ``allocated_task_id`` (UUID or None): Allocated task.
        - ``allocated_task_code`` (str or None): Allocated task code.
    """
    result = await db.execute(
        select(PerishableMaterialLot).where(PerishableMaterialLot.id == lot_id)
    )
    lot = result.scalar_one_or_none()

    if lot is None:
        return {"error": f"Material lot {lot_id} not found"}

    today = date.today()
    days_until_cold = None
    if lot.cold_storage_expiry:
        days_until_cold = (lot.cold_storage_expiry - today).days

    remaining_out = 0.0
    if lot.lot_status == LotStatus.THAWED_IN_USE:
        max_out = float(lot.maximum_out_time_hours)
        acc_out = float(lot.accumulated_out_time_hours)
        remaining_out = max(0.0, max_out - acc_out)

    # Get allocated task code
    task_code = None
    if lot.allocated_task_id:
        task_result = await db.execute(
            select(PortfolioNode.code).where(
                PortfolioNode.id == lot.allocated_task_id
            )
        )
        task_code = task_result.scalar_one_or_none()

    return {
        "lot_id": lot.id,
        "lot_number": lot.lot_number,
        "part_number": lot.part_number,
        "material_type": lot.material_type.value,
        "lot_status": lot.lot_status.value,
        "cold_storage_expiry": lot.cold_storage_expiry,
        "days_until_cold_expiry": days_until_cold,
        "thawed_at": lot.thawed_timestamp,
        "accumulated_out_time_hours": float(lot.accumulated_out_time_hours),
        "maximum_out_time_hours": float(lot.maximum_out_time_hours),
        "remaining_out_time_hours": remaining_out,
        "allocated_task_id": lot.allocated_task_id,
        "allocated_task_code": task_code,
    }


async def allocate_lot_to_task(
    db: AsyncSession,
    lot_id: UUID,
    task_id: UUID,
    user_id: int,
) -> Dict[str, Any]:
    """Allocate a material lot to an assembly task.

    Links a perishable material lot to a specific assembly task,
    ensuring the lot is not already allocated and is not expired.

    Parameters
    ----------
    db : AsyncSession
        Active database session.
    lot_id : UUID
        The material lot to allocate.
    task_id : UUID
        The assembly task to allocate to.
    user_id : int
        The user performing the allocation.

    Returns
    -------
    dict
        Result containing:

        - ``lot_id`` (UUID): The lot ID.
        - ``lot_number`` (str): The lot number.
        - ``allocated_task_id`` (UUID): The task ID.
        - ``allocated_task_code`` (str): The task code.

    Raises
    ------
    ValueError
        If the lot is expired, consumed, or already allocated to
        a different task.
    """
    result = await db.execute(
        select(PerishableMaterialLot).where(PerishableMaterialLot.id == lot_id)
    )
    lot = result.scalar_one_or_none()

    if lot is None:
        raise ValueError(f"Material lot {lot_id} not found")

    if lot.lot_status == LotStatus.EXPIRED_SCRAP:
        raise ValueError(f"Material lot {lot.lot_number} is expired")

    if lot.lot_status == LotStatus.CONSUMED:
        raise ValueError(f"Material lot {lot.lot_number} is already consumed")

    if lot.allocated_task_id is not None and lot.allocated_task_id != task_id:
        raise ValueError(
            f"Material lot {lot.lot_number} is already allocated to "
            f"another task"
        )

    # Verify task exists
    task_result = await db.execute(
        select(PortfolioNode).where(PortfolioNode.id == task_id)
    )
    task = task_result.scalar_one_or_none()
    if task is None:
        raise ValueError(f"Task {task_id} not found")

    lot.allocated_task_id = task_id
    lot.updated_at = datetime.now(timezone.utc)

    return {
        "lot_id": lot.id,
        "lot_number": lot.lot_number,
        "allocated_task_id": task_id,
        "allocated_task_code": task.code,
    }
