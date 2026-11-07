"""Costing API router for the Cost Breakdown Structure (CBS) module.

This router provides endpoints for managing the financial side of the
portfolio management system.  It covers three areas:

1. **Cost Element Management** — CRUD operations for the CBS taxonomy
   (the catalogue of cost types: labour, materials, subcontract, ODC).

2. **Indirect Rate Structure Management** — CRUD operations for FPRA
   (Forward Pricing Rate Agreement) rate structures that define the
   burdening cascade for each fiscal year.

3. **Cost Queries** — Endpoints to retrieve task-level cost breakdowns
   and multi-tier CBS financial rollups across the WBS hierarchy.

Authentication
~~~~~~~~~~~~~~

All endpoints require a valid JWT token via the ``get_current_user``
dependency.  Only authenticated users can access costing data.

URL Structure
~~~~~~~~~~~~~

All endpoints are mounted under ``/api/v1/costing``:

- ``GET    /elements`` — List all cost elements.
- ``POST   /elements`` — Create a new cost element.
- ``GET    /elements/{id}`` — Get a single cost element.
- ``PUT    /elements/{id}`` — Update a cost element.
- ``DELETE /elements/{id}`` — Delete a cost element.
- ``GET    /rates`` — List all indirect rate structures.
- ``POST   /rates`` — Create a new indirect rate structure.
- ``GET    /rates/{id}`` — Get a single rate structure.
- ``PUT    /rates/{id}`` — Update a rate structure.
- ``GET    /tasks/{id}/cost-breakdown`` — Get task cost breakdown.
- ``GET    /projects/{id}/cbs-rollup`` — Get multi-tier CBS rollup.
"""

from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.utils.auth import get_current_user
from app.models.models import User, CostElement, IndirectRateStructure
from app.schemas.schemas import (
    CostElementCreate, CostElementUpdate, CostElementResponse,
    IndirectRateCreate, IndirectRateUpdate, IndirectRateResponse,
    TaskCostBreakdownResponse, CBSCBSRollupResponse,
)
from app.services.costing import calculate_task_burden, cbs_rollup

router = APIRouter()


# ============================================================================
# Cost Element CRUD
# ============================================================================

@router.get("/elements", response_model=List[CostElementResponse])
def list_cost_elements(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all cost elements in the CBS taxonomy.

    Returns the complete catalogue of cost types defined in the system,
    such as LABOR_DIRECT, SUBCONTRACT, MATERIAL_RAW, and ODC_TRAVEL.

    Parameters
    ----------
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    list[CostElementResponse]
        All cost elements ordered by code.
    """
    elements = db.query(CostElement).order_by(CostElement.code).all()
    return elements


@router.post("/elements", response_model=CostElementResponse, status_code=201)
def create_cost_element(
    data: CostElementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new cost element in the CBS taxonomy.

    Parameters
    ----------
    data : CostElementCreate
        The cost element data (code, name, category).
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    CostElementResponse
        The newly created cost element.

    Raises
    ------
    HTTPException
        409 if a cost element with the same code already exists.
    """
    existing = db.query(CostElement).filter(CostElement.code == data.code).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Cost element with code '{data.code}' already exists",
        )

    element = CostElement(
        code=data.code,
        name=data.name,
        category=data.category,
    )
    db.add(element)
    db.commit()
    db.refresh(element)
    return element


@router.get("/elements/{element_id}", response_model=CostElementResponse)
def get_cost_element(
    element_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single cost element by ID.

    Parameters
    ----------
    element_id : UUID
        The cost element UUID.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    CostElementResponse
        The cost element details.

    Raises
    ------
    HTTPException
        404 if the cost element is not found.
    """
    element = db.get(CostElement, element_id)
    if element is None:
        raise HTTPException(status_code=404, detail="Cost element not found")
    return element


@router.put("/elements/{element_id}", response_model=CostElementResponse)
def update_cost_element(
    element_id: UUID,
    data: CostElementUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing cost element.

    Only the fields included in the request body will be updated;
    omitted fields remain unchanged.

    Parameters
    ----------
    element_id : UUID
        The cost element UUID.
    data : CostElementUpdate
        The fields to update.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    CostElementResponse
        The updated cost element.

    Raises
    ------
    HTTPException
        404 if the cost element is not found.
    """
    element = db.get(CostElement, element_id)
    if element is None:
        raise HTTPException(status_code=404, detail="Cost element not found")

    update_data = data.exclude_unset()
    for field, value in update_data.items():
        setattr(element, field, value)

    db.commit()
    db.refresh(element)
    return element


@router.delete("/elements/{element_id}", status_code=204)
def delete_cost_element(
    element_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a cost element.

    Note: Deletion will fail if the cost element is referenced by any
    TaskCostLedger entries (foreign key RESTRICT constraint).

    Parameters
    ----------
    element_id : UUID
        The cost element UUID.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Raises
    ------
    HTTPException
        404 if the cost element is not found.
    """
    element = db.get(CostElement, element_id)
    if element is None:
        raise HTTPException(status_code=404, detail="Cost element not found")

    db.delete(element)
    db.commit()


# ============================================================================
# Indirect Rate Structure CRUD
# ============================================================================

@router.get("/rates", response_model=List[IndirectRateResponse])
def list_indirect_rates(
    fiscal_year: Optional[int] = Query(None, description="Filter by fiscal year"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all indirect rate structures (FPRA records).

    Optionally filter by fiscal year.

    Parameters
    ----------
    fiscal_year : int or None
        Optional filter to return only rates for a specific year.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    list[IndirectRateResponse]
        Rate structures ordered by fiscal year descending.
    """
    query = db.query(IndirectRateStructure).order_by(IndirectRateStructure.fiscal_year.desc())
    if fiscal_year is not None:
        query = query.filter(IndirectRateStructure.fiscal_year == fiscal_year)
    return query.all()


@router.post("/rates", response_model=IndirectRateResponse, status_code=201)
def create_indirect_rate(
    data: IndirectRateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new FPRA indirect rate structure.

    Parameters
    ----------
    data : IndirectRateCreate
        The rate structure data (fiscal year, rates).
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    IndirectRateResponse
        The newly created rate structure.
    """
    rate = IndirectRateStructure(
        fiscal_year=data.fiscal_year,
        currency_code=data.currency_code,
        fringe_rate_percent=data.fringe_rate_percent,
        overhead_rate_percent=data.overhead_rate_percent,
        ga_rate_percent=data.ga_rate_percent,
        fee_profit_percent=data.fee_profit_percent,
    )
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return rate


@router.get("/rates/{rate_id}", response_model=IndirectRateResponse)
def get_indirect_rate(
    rate_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single indirect rate structure by ID.

    Parameters
    ----------
    rate_id : UUID
        The rate structure UUID.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    IndirectRateResponse
        The rate structure details.

    Raises
    ------
    HTTPException
        404 if the rate structure is not found.
    """
    rate = db.get(IndirectRateStructure, rate_id)
    if rate is None:
        raise HTTPException(status_code=404, detail="Indirect rate structure not found")
    return rate


@router.put("/rates/{rate_id}", response_model=IndirectRateResponse)
def update_indirect_rate(
    rate_id: UUID,
    data: IndirectRateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing indirect rate structure.

    Only the fields included in the request body will be updated.

    Parameters
    ----------
    rate_id : UUID
        The rate structure UUID.
    data : IndirectRateUpdate
        The fields to update.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    IndirectRateResponse
        The updated rate structure.

    Raises
    ------
    HTTPException
        404 if the rate structure is not found.
    """
    rate = db.get(IndirectRateStructure, rate_id)
    if rate is None:
        raise HTTPException(status_code=404, detail="Indirect rate structure not found")

    update_data = data.exclude_unset()
    for field, value in update_data.items():
        setattr(rate, field, value)

    db.commit()
    db.refresh(rate)
    return rate


# ============================================================================
# Cost Query Endpoints
# ============================================================================

@router.get("/tasks/{task_id}/cost-breakdown", response_model=TaskCostBreakdownResponse)
def get_task_cost_breakdown(
    task_id: UUID,
    fiscal_year: int = Query(..., description="Fiscal year for the cost calculation"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the unburdened vs. burdened cost tiers for a single task.

    Reads all ResourceAssignment records for the task, calculates direct
    labour costs, applies the FPRA burdening cascade, and returns the
    complete cost breakdown.

    The results are persisted in the TaskCostLedger table for fast
    subsequent access without re-calculation.

    Parameters
    ----------
    task_id : UUID
        The portfolio node (task) UUID.
    fiscal_year : int
        The fiscal year for the FPRA rate lookup.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    TaskCostBreakdownResponse
        The complete cost breakdown with ledger entries, totals,
        and burden difference.

    Raises
    ------
    HTTPException
        404 if the task is not found.
        400 if no FPRA rate structure exists for the fiscal year.
    """
    try:
        result = calculate_task_burden(task_id, fiscal_year, db)
        db.commit()
        return result
    except ValueError as e:
        if "not found" in str(e):
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/projects/{project_id}/cbs-rollup", response_model=CBSCBSRollupResponse)
def get_cbs_rollup(
    project_id: UUID,
    fiscal_year: int = Query(..., description="Fiscal year for the rollup"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the multi-tier CBS financial rollup across cost elements.

    Aggregates TaskCostLedger entries from all descendants of the given
    root node, grouping costs by WBS hierarchy level and by cost element
    category.

    The rollup shows the complete financial picture from the programme
    root down to individual tasks, with costs broken down by category
    at each level.

    Parameters
    ----------
    project_id : UUID
        The root portfolio node (project/programme) UUID.
    fiscal_year : int
        The fiscal year for the rollup.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    CBSCBSRollupResponse
        The multi-tier CBS rollup with hierarchical levels,
        category breakdowns, and grand totals.

    Raises
    ------
    HTTPException
        404 if the project is not found.
        400 if no FPRA rate structure exists for the fiscal year.
    """
    try:
        result = cbs_rollup(project_id, fiscal_year, db)
        return result
    except ValueError as e:
        if "not found" in str(e):
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
