"""Management Reserve API router.

This module provides endpoints for managing Management Reserve (MR) budget
pools and executing formal drawdown transactions.

Management Reserve Workflow
~~~~~~~~~~~~~~~~~~~~~~~~~~~

1. **Create a reserve pool** — When a project or programme is initialised,
   create a Management Reserve pool with an initial contingency budget.
   The pool is held outside the Performance Measurement Baseline (PMB).

2. **Check reserve status** — At any time, query the reserve status to see
   the current balance, total amounts drawn down and returned, and the full
   transaction history.

3. **Execute a drawdown** — When a risk materialises, execute a formal
   drawdown to transfer funds from the reserve to a specific work package.
   This requires an approved BaselineChangeRequest (Tier 2 or Tier 3) and
   atomically updates the pool balance, the work package's BAC, and the
   forensic audit log.

Endpoints
~~~~~~~~~

- ``GET /projects/{project_id}/reserve-status`` — Returns the reserve pool
  details, current balance, total drawn down, and transaction history.
- ``POST /pool`` — Creates a new Management Reserve pool for a project.
- ``POST /drawdown`` — Executes an authorised reserve drawdown, transferring
  funds from the reserve to a work package.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import User
from app.schemas.schemas import (
    ReservePoolCreate,
    ReservePoolResponse,
    ReserveDrawdownRequest,
    ReserveDrawdownResponse,
    ReserveStatusResponse,
    ReserveTransactionResponse,
)
from app.services.reserve_governance import (
    execute_mr_drawdown,
    get_reserve_status,
    create_reserve_pool,
)
from app.utils.auth import get_current_user

router = APIRouter()


@router.get(
    "/projects/{project_id}/reserve-status",
    response_model=ReserveStatusResponse,
)
def reserve_status(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current status of a project's Management Reserve.

    Returns the reserve pool details (if one exists), the total amounts
    drawn down and returned, and a list of all transactions ordered by
    timestamp (newest first).

    If no reserve pool exists for the project, the response returns
    ``pool: null`` with zero totals and an empty transaction list.

    Parameters
    ----------
    project_id : str
        UUID of the root Project/Programme node.
    current_user : User
        Authenticated user (JWT required).
    db : Session
        Database session.

    Returns
    -------
    ReserveStatusResponse
        Reserve pool details, totals, and transaction history.
    """
    status = get_reserve_status(project_id, db)
    return status


@router.post("/pool", response_model=ReservePoolResponse)
def create_pool(
    pool_data: ReservePoolCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new Management Reserve pool for a project.

    Initialises a reserve pool with the specified budget.  An
    INITIAL_ALLOCATION transaction is automatically recorded, and the
    event is logged in the ForensicAuditLog.

    Only one reserve pool can exist per project.  Attempting to create
    a second pool for the same project will return HTTP 400.

    Parameters
    ----------
    pool_data : ReservePoolCreate
        Pool creation data including portfolio_node_id,
        total_initial_budget, and currency_code.
    current_user : User
        Authenticated user authorising the pool creation.
    db : Session
        Database session.

    Returns
    -------
    ReservePoolResponse
        The newly created reserve pool.

    Raises
    ------
    HTTPException(400)
        A reserve pool already exists for this project.
    HTTPException(404)
        The target portfolio node was not found.
    """
    pool = create_reserve_pool(
        portfolio_node_id=pool_data.portfolio_node_id,
        total_initial_budget=pool_data.total_initial_budget,
        currency_code=pool_data.currency_code,
        user_id=current_user.id,
        db=db,
    )
    db.flush()
    return {
        "id": str(pool.id),
        "portfolio_node_id": str(pool.portfolio_node_id),
        "total_initial_budget": float(pool.total_initial_budget),
        "current_balance": float(pool.current_balance),
        "currency_code": pool.currency_code,
        "created_at": pool.created_at,
        "updated_at": pool.updated_at,
    }


@router.post("/drawdown", response_model=ReserveDrawdownResponse)
def drawdown(
    drawdown_data: ReserveDrawdownRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Execute an authorised Management Reserve drawdown.

    Transfers funds from the reserve pool to a specific work package,
    increasing its Budget at Completion (BAC).  The drawdown enforces
    all governance controls:

    1. **Sufficient balance** — The pool must have enough current_balance.
    2. **BCR authorisation** — If a BCR is provided, it must be approved
       and of Tier 2 or Tier 3.
    3. **Atomic execution** — Pool balance, target node BAC, transaction
       ledger, and ForensicAuditLog are all updated in a single transaction.

    Parameters
    ----------
    drawdown_data : ReserveDrawdownRequest
        Drawdown data including pool_id, target_node_id, amount,
        optional bcr_id, and justification.
    current_user : User
        Authenticated user authorising the drawdown.
    db : Session
        Database session.

    Returns
    -------
    ReserveDrawdownResponse
        Transaction details including the new pool balance and
        updated target node BAC.

    Raises
    ------
    HTTPException(404)
        Pool, target node, user, or BCR not found.
    HTTPException(400)
        Insufficient balance in the reserve pool.
    HTTPException(400)
        BCR is not approved or is below the required tier.
    """
    transaction = execute_mr_drawdown(
        pool_id=drawdown_data.pool_id,
        target_node_id=drawdown_data.target_node_id,
        amount=drawdown_data.amount,
        bcr_id=drawdown_data.bcr_id,
        user_id=current_user.id,
        justification=drawdown_data.justification,
        db=db,
    )
    db.flush()

    # Fetch updated pool and target node for the response
    from app.models.models import ManagementReservePool, PortfolioNode

    pool = db.query(ManagementReservePool).filter(
        ManagementReservePool.id == drawdown_data.pool_id
    ).first()
    target_node = db.query(PortfolioNode).filter(
        PortfolioNode.id == drawdown_data.target_node_id
    ).first()

    return {
        "transaction_id": str(transaction.id),
        "pool_id": str(transaction.pool_id),
        "remaining_balance": float(pool.current_balance) if pool else 0.0,
        "target_node_id": str(transaction.target_portfolio_node_id),
        "target_node_new_bac": (
            float(target_node.bac_cost)
            if target_node and target_node.bac_cost is not None
            else 0.0
        ),
        "amount": float(transaction.amount),
        "transaction_timestamp": transaction.transaction_timestamp,
    }
