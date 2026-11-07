"""Procurement tracking API router.

This module provides endpoints for managing supply chain procurement items
and binding them as hard early-start constraints to WBS tasks.

Procurement Workflow
~~~~~~~~~~~~~~~~~~~~

1. **Register a procurement item** — When a component is identified as a
   procurement requirement, create a ``ProcurementItem`` record with the
   part number, supplier CAGE code, and initial forecast delivery date.

2. **Link to a WBS task** — Bind the procurement item to a ``PortfolioNode``
   task using ``TaskProcurementConstraint``.  The task cannot start before
   the procurement item's forecast delivery date.

3. **Update lifecycle stage** — As the procurement progresses through the
   pipeline (REQUISITION → RFQ_ISSUED → PO_PLACED → IN_MANUFACTURE →
   CUSTOMS_TRANSIT → DELIVERED_STORES → ACCEPTED_INSPECTED), update the
   lifecycle stage and forecast delivery date.  The CPM schedule is
   automatically re-evaluated to reflect any date changes.

Endpoints
~~~~~~~~~

- ``POST /items`` — Register a new procurement line item.
- ``GET /items`` — List all procurement items with optional filtering.
- ``GET /items/{id}`` — Get a single procurement item.
- ``PUT /items/{id}`` — Update a procurement item.
- ``PUT /items/{id}/status`` — Update lifecycle stage and forecast date,
  automatically updating affected schedule start dates.
- ``DELETE /items/{id}`` — Delete a procurement item.
- ``POST /tasks/{task_id}/link-part`` — Bind a procurement item to a WBS task.
- ``GET /tasks/{task_id}/constraints`` — List procurement constraints on a task.
- ``DELETE /tasks/{task_id}/constraints/{constraint_id}`` — Remove a constraint.
"""
from datetime import date as date_type
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import (
    ProcurementItem, ProcurementLifecycleStage,
    TaskProcurementConstraint, PortfolioNode,
)
from app.schemas.schemas import (
    ProcurementItemCreate, ProcurementItemUpdate, ProcurementItemResponse,
    ProcurementListResponse,
    TaskProcurementConstraintCreate, TaskProcurementConstraintResponse,
)
from app.utils.auth import get_current_user
from app.models.models import User

router = APIRouter()


@router.post("/items", response_model=ProcurementItemResponse)
def create_procurement_item(
    item: ProcurementItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Register a new procurement line item.

    Creates a new ``ProcurementItem`` record tracking a component through
    the supply chain.  The item starts in the REQUISITION lifecycle stage
    by default.

    Parameters
    ----------
    item : ProcurementItemCreate
        Procurement item data including part number, supplier CAGE code,
        and optional forecast delivery date.
    current_user : User
        Authenticated user creating the item.
    db : Session
        Database session.

    Returns
    -------
    ProcurementItemResponse
        The created procurement item.

    Raises
    ------
    HTTPException
        409 if a procurement item with the same part_number already exists.
    """
    # Check for duplicate part number
    existing = db.query(ProcurementItem).filter(
        ProcurementItem.part_number == item.part_number
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Procurement item with part number '{item.part_number}' already exists",
        )

    db_item = ProcurementItem(
        part_number=item.part_number,
        description=item.description,
        supplier_cage_code=item.supplier_cage_code,
        portfolio_node_id=UUID(item.portfolio_node_id) if item.portfolio_node_id else None,
        purchase_order_reference=item.purchase_order_reference,
        contractual_delivery_date=item.contractual_delivery_date,
        forecast_delivery_date=item.forecast_delivery_date,
        is_long_lead_item=item.is_long_lead_item,
    )

    db.add(db_item)
    db.commit()
    db.refresh(db_item)

    return db_item


@router.get("/items", response_model=ProcurementListResponse)
def list_procurement_items(
    lifecycle_stage: Optional[ProcurementLifecycleStage] = Query(None),
    is_long_lead: Optional[bool] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List procurement items with optional filtering.

    Parameters
    ----------
    lifecycle_stage : ProcurementLifecycleStage or None
        Filter by current lifecycle stage.
    is_long_lead : bool or None
        Filter by long-lead item flag.
    current_user : User
        Authenticated user.
    db : Session
        Database session.

    Returns
    -------
    ProcurementListResponse
        List of procurement items matching the filters.
    """
    query = db.query(ProcurementItem)

    if lifecycle_stage is not None:
        query = query.filter(ProcurementItem.lifecycle_stage == lifecycle_stage)

    if is_long_lead is not None:
        query = query.filter(ProcurementItem.is_long_lead_item == is_long_lead)

    items = query.all()
    return ProcurementListResponse(
        items=items,
        total_count=len(items),
    )


@router.get("/items/{item_id}", response_model=ProcurementItemResponse)
def get_procurement_item(
    item_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a single procurement item by ID.

    Parameters
    ----------
    item_id : UUID
        UUID of the procurement item.
    current_user : User
        Authenticated user.
    db : Session
        Database session.

    Returns
    -------
    ProcurementItemResponse
        The procurement item.

    Raises
    ------
    HTTPException
        404 if the item is not found.
    """
    item = db.query(ProcurementItem).filter(ProcurementItem.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Procurement item not found")
    return item


@router.put("/items/{item_id}", response_model=ProcurementItemResponse)
def update_procurement_item(
    item_id: UUID,
    update_data: ProcurementItemUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a procurement item.

    All fields are optional.  Typically used to update forecast delivery
    dates, purchase order references, or descriptions.

    Parameters
    ----------
    item_id : UUID
        UUID of the procurement item.
    update_data : ProcurementItemUpdate
        Fields to update.
    current_user : User
        Authenticated user.
    db : Session
        Database session.

    Returns
    -------
    ProcurementItemResponse
        The updated procurement item.

    Raises
    ------
    HTTPException
        404 if the item is not found.
    """
    item = db.query(ProcurementItem).filter(ProcurementItem.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Procurement item not found")

    update_dict = update_data.model_dump(exclude_unset=True)
    for key, value in update_dict.items():
        setattr(item, key, value)

    db.commit()
    db.refresh(item)
    return item


@router.put("/items/{item_id}/status", response_model=ProcurementItemResponse)
def update_procurement_status(
    item_id: UUID,
    lifecycle_stage: ProcurementLifecycleStage,
    forecast_delivery_date: Optional[date_type] = None,
    actual_arrival_date: Optional[date_type] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update procurement lifecycle stage and forecast arrival date.

    Advances the procurement item through the lifecycle pipeline and
    optionally updates the forecast delivery date.  When the forecast
    date changes, affected CPM schedule start dates are automatically
    updated on the next ``recalculate-cpm`` call.

    Parameters
    ----------
    item_id : UUID
        UUID of the procurement item.
    lifecycle_stage : ProcurementLifecycleStage
        New lifecycle stage.
    forecast_delivery_date : date or None
        Updated forecast delivery date.
    actual_arrival_date : date or None
        Actual arrival date (typically set when stage is DELIVERED_STORES).
    current_user : User
        Authenticated user.
    db : Session
        Database session.

    Returns
    -------
    ProcurementItemResponse
        The updated procurement item.

    Raises
    ------
    HTTPException
        404 if the item is not found.
        400 if the lifecycle stage transition is invalid.
    """
    item = db.query(ProcurementItem).filter(ProcurementItem.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Procurement item not found")

    # Validate lifecycle stage progression
    stage_order = [
        ProcurementLifecycleStage.REQUISITION,
        ProcurementLifecycleStage.RFQ_ISSUED,
        ProcurementLifecycleStage.PO_PLACED,
        ProcurementLifecycleStage.IN_MANUFACTURE,
        ProcurementLifecycleStage.CUSTOMS_TRANSIT,
        ProcurementLifecycleStage.DELIVERED_STORES,
        ProcurementLifecycleStage.ACCEPTED_INSPECTED,
    ]

    current_index = stage_order.index(item.lifecycle_stage)
    new_index = stage_order.index(lifecycle_stage)

    if new_index < current_index:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot regress from '{item.lifecycle_stage.value}' to '{lifecycle_stage.value}'. "
                   f"Procurement lifecycle stages can only advance forward.",
        )

    item.lifecycle_stage = lifecycle_stage

    if forecast_delivery_date is not None:
        item.forecast_delivery_date = forecast_delivery_date

    if actual_arrival_date is not None:
        item.actual_arrival_date = actual_arrival_date

    # Auto-set actual_arrival_date when transitioning to DELIVERED_STORES
    if lifecycle_stage == ProcurementLifecycleStage.DELIVERED_STORES and actual_arrival_date is None:
        from datetime import date as date_today
        item.actual_arrival_date = date_today.today()

    db.commit()
    db.refresh(item)
    return item


@router.delete("/items/{item_id}")
def delete_procurement_item(
    item_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a procurement item.

    Also removes any associated ``TaskProcurementConstraint`` records
    via cascade delete.

    Parameters
    ----------
    item_id : UUID
        UUID of the procurement item.
    current_user : User
        Authenticated user.
    db : Session
        Database session.

    Returns
    -------
    dict
        Confirmation message.

    Raises
    ------
    HTTPException
        404 if the item is not found.
    """
    item = db.query(ProcurementItem).filter(ProcurementItem.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Procurement item not found")

    db.delete(item)
    db.commit()
    return {"message": f"Procurement item '{item.part_number}' deleted"}


@router.post("/tasks/{task_id}/link-part", response_model=TaskProcurementConstraintResponse)
def link_procurement_to_task(
    task_id: UUID,
    constraint: TaskProcurementConstraintCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bind a procurement item to a WBS task as a hard early-start constraint.

    Creates a ``TaskProcurementConstraint`` linking a procurement item to
    a ``PortfolioNode`` task.  The task cannot start before the procurement
    item's forecast delivery date — this is enforced during the CPM forward
    pass.

    Parameters
    ----------
    task_id : UUID
        UUID of the PortfolioNode task to constrain.
    constraint : TaskProcurementConstraintCreate
        Procurement item ID and required-on-site date.
    current_user : User
        Authenticated user.
    db : Session
        Database session.

    Returns
    -------
    TaskProcurementConstraintResponse
        The created constraint with nested procurement item details.

    Raises
    ------
    HTTPException
        404 if the task or procurement item is not found.
        409 if this constraint already exists.
    """
    # Verify task exists
    task = db.query(PortfolioNode).filter(PortfolioNode.id == task_id).first()
    if task is None:
        raise HTTPException(status_code=404, detail="PortfolioNode task not found")

    # Verify procurement item exists
    item = db.query(ProcurementItem).filter(
        ProcurementItem.id == UUID(constraint.procurement_item_id)
    ).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Procurement item not found")

    # Check for duplicate constraint
    existing = db.query(TaskProcurementConstraint).filter(
        TaskProcurementConstraint.portfolio_node_id == task_id,
        TaskProcurementConstraint.procurement_item_id == UUID(constraint.procurement_item_id),
    ).first()
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail=f"Task '{task.code}' is already constrained by part '{item.part_number}'",
        )

    db_constraint = TaskProcurementConstraint(
        portfolio_node_id=task_id,
        procurement_item_id=UUID(constraint.procurement_item_id),
        required_on_site_date=constraint.required_on_site_date,
    )

    db.add(db_constraint)
    db.commit()
    db.refresh(db_constraint)

    return TaskProcurementConstraintResponse(
        id=str(db_constraint.id),
        portfolio_node_id=str(db_constraint.portfolio_node_id),
        procurement_item_id=str(db_constraint.procurement_item_id),
        required_on_site_date=db_constraint.required_on_site_date,
        procurement_item=ProcurementItemResponse.model_validate(item),
    )


@router.get("/tasks/{task_id}/constraints", response_model=list[TaskProcurementConstraintResponse])
def list_task_constraints(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all procurement constraints on a specific task.

    Parameters
    ----------
    task_id : UUID
        UUID of the PortfolioNode task.
    current_user : User
        Authenticated user.
    db : Session
        Database session.

    Returns
    -------
    list[TaskProcurementConstraintResponse]
        List of procurement constraints with nested item details.

    Raises
    ------
    HTTPException
        404 if the task is not found.
    """
    task = db.query(PortfolioNode).filter(PortfolioNode.id == task_id).first()
    if task is None:
        raise HTTPException(status_code=404, detail="PortfolioNode task not found")

    constraints = (
        db.query(TaskProcurementConstraint)
        .join(ProcurementItem)
        .filter(TaskProcurementConstraint.portfolio_node_id == task_id)
        .all()
    )

    result = []
    for c in constraints:
        result.append(TaskProcurementConstraintResponse(
            id=str(c.id),
            portfolio_node_id=str(c.portfolio_node_id),
            procurement_item_id=str(c.procurement_item_id),
            required_on_site_date=c.required_on_site_date,
            procurement_item=ProcurementItemResponse.model_validate(c.procurement_item),
        ))

    return result


@router.delete("/tasks/{task_id}/constraints/{constraint_id}")
def remove_task_constraint(
    task_id: UUID,
    constraint_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a procurement constraint from a task.

    Parameters
    ----------
    task_id : UUID
        UUID of the PortfolioNode task.
    constraint_id : UUID
        UUID of the constraint to remove.
    current_user : User
        Authenticated user.
    db : Session
        Database session.

    Returns
    -------
    dict
        Confirmation message.

    Raises
    ------
    HTTPException
        404 if the constraint is not found.
    """
    constraint = (
        db.query(TaskProcurementConstraint)
        .filter(
            TaskProcurementConstraint.id == constraint_id,
            TaskProcurementConstraint.portfolio_node_id == task_id,
        )
        .first()
    )
    if constraint is None:
        raise HTTPException(
            status_code=404,
            detail="Constraint not found for this task",
        )

    db.delete(constraint)
    db.commit()
    return {"message": "Procurement constraint removed"}
