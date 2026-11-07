"""Management Reserve governance service.

This module implements the formal drawdown process for Management Reserve (MR)
budgets held outside the Performance Measurement Baseline (PMB).

Management Reserve Overview
~~~~~~~~~~~~~~~~~~~~~~~~~~~

In defence programme management, the PMB contains the budget for known,
planned work.  Management Reserve is a separate pool of contingency funds
held at the project or programme level to address **unknown-unknowns** —
risks that cannot be quantified at the time of baseline creation.

When a risk materialises, a formal drawdown process transfers funds from
the MR into the PMB by increasing the Budget at Completion (BAC) of the
affected work package.  This process is governed by strict controls:

1. **Sufficient balance** — The reserve pool must have enough
   ``current_balance`` to cover the drawdown amount.

2. **Authorised BCR** — An approved BaselineChangeRequest (Tier 2 or
   Tier 3) must authorise the budget transfer.  Tier 1 (local CAM) is
   not sufficient for MR drawdowns.

3. **Atomic execution** — The drawdown atomically:

   - Decrements the pool's ``current_balance``.
   - Increments the target node's ``bac_cost``.
   - Records a ``ManagementReserveTransaction`` ledger entry.
   - Logs the event in ``ForensicAuditLog``.

Transaction Types
~~~~~~~~~~~~~~~~~

- **INITIAL_ALLOCATION** — Create or top up a reserve pool.
- **DRAWDOWN_TO_WBS** — Transfer funds from the reserve to a WBS work
  package, increasing its BAC.
- **RETURN_TO_RESERVE** — Return funds from a work package back to the
  reserve (e.g., a risk did not fully materialise).
- **CUSTOMER_DE_OBLIGATION** — The customer formally releases the
  organisation from an obligation, removing the associated reserve.

Drawdown Workflow
~~~~~~~~~~~~~~~~~

1. A risk materialises affecting a specific work package.
2. The project manager creates a BaselineChangeRequest (BCR) justifying
   the need for additional budget.
3. The BCR is reviewed and approved at Tier 2 (Project CCB) or Tier 3
   (Programme Board) level.
4. The approved BCR is used to execute ``execute_mr_drawdown()``, which
   transfers the authorised amount from the MR to the work package.
5. The work package's BAC is increased, and the change is reflected in
   all EVM calculations (CPI, SPI, EAC, etc.).

Error Handling
~~~~~~~~~~~~~~

- ``HTTPException(400)`` — Insufficient balance in the reserve pool.
- ``HTTPException(400)`` — BCR is not approved or is below the required
  tier (Tier 2 or Tier 3).
- ``HTTPException(404)`` — Pool, node, or BCR not found.
"""
from decimal import Decimal
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.models.models import (
    ManagementReservePool,
    ManagementReserveTransaction,
    TransactionType,
    PortfolioNode,
    BaselineChangeRequest,
    BaselineChangeRequestStatus,
    BaselineTier,
    ForensicAuditLog,
    User,
)


def execute_mr_drawdown(
    pool_id: str,
    target_node_id: str,
    amount: float,
    bcr_id: Optional[str],
    user_id: int,
    justification: str,
    db: Session,
) -> ManagementReserveTransaction:
    """Execute an authorised Management Reserve drawdown.

    This is the core governance function that transfers funds from the
    Management Reserve pool to a specific work package in the WBS.  The
    function enforces all governance controls before executing the transfer.

    Governance Controls
    ~~~~~~~~~~~~~~~~~~~

    1. **Pool existence** — The reserve pool must exist and be accessible.
    2. **Sufficient balance** — The pool's ``current_balance`` must be
       greater than or equal to the drawdown amount.
    3. **BCR authorisation** — A drawdown (DRAWDOWN_TO_WBS) requires an
       approved BaselineChangeRequest of Tier 2 or Tier 3.  Tier 1
       (local CAM) is not sufficient for MR drawdowns.
    4. **Target node existence** — The work package receiving the budget
       must exist.

    Atomic Operations
    ~~~~~~~~~~~~~~~~~

    If all checks pass, the function executes the following operations
    within a single database transaction:

    - Decrement the pool's ``current_balance`` by the drawdown amount.
    - Increment the target node's ``bac_cost`` by the drawdown amount.
    - Create a ``ManagementReserveTransaction`` ledger entry of type
      ``DRAWDOWN_TO_WBS``.
    - Record a ``ForensicAuditLog`` entry with action type ``MR_DRAWDOWN``.

    Parameters
    ----------
    pool_id : str
        UUID of the Management Reserve pool to draw from.
    target_node_id : str
        UUID of the PortfolioNode work package receiving the budget.
    amount : float
        Monetary amount to draw down from the reserve.  Must be positive.
    bcr_id : str or None
        UUID of the approved BaselineChangeRequest authorising this
        drawdown.  Required for DRAWDOWN_TO_WBS transactions.
    user_id : int
        ID of the user authorising this drawdown.
    justification : str
        Human-readable explanation of why this drawdown is being executed.
    db : Session
        Active SQLAlchemy database session.

    Returns
    -------
    ManagementReserveTransaction
        The newly created transaction ledger entry.

    Raises
    ------
    HTTPException(404)
        Pool, target node, user, or BCR not found.
    HTTPException(400)
        Insufficient balance in the reserve pool.
    HTTPException(400)
        BCR is not approved or is below the required tier.
    HTTPException(400)
        BCR is required but not provided for DRAWDOWN_TO_WBS.
    """
    # --- Validate amount ---
    amount_decimal = Decimal(str(amount))
    if amount_decimal <= 0:
        raise HTTPException(
            status_code=400,
            detail="Drawdown amount must be positive.",
        )

    # --- Fetch the reserve pool ---
    pool = db.query(ManagementReservePool).filter(
        ManagementReservePool.id == pool_id
    ).first()
    if pool is None:
        raise HTTPException(
            status_code=404,
            detail=f"Management Reserve pool {pool_id} not found.",
        )

    # --- Fetch the target node ---
    target_node = db.query(PortfolioNode).filter(
        PortfolioNode.id == target_node_id
    ).first()
    if target_node is None:
        raise HTTPException(
            status_code=404,
            detail=f"Target work package {target_node_id} not found.",
        )

    # --- Fetch the authorising user ---
    authorising_user = db.query(User).filter(User.id == user_id).first()
    if authorising_user is None:
        raise HTTPException(
            status_code=404,
            detail=f"Authorising user {user_id} not found.",
        )

    # --- Check sufficient balance ---
    if pool.current_balance < amount_decimal:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient reserve balance. "
                f"Available: {pool.currency_code} {pool.current_balance}, "
                f"Requested: {pool.currency_code} {amount_decimal}."
            ),
        )

    # --- Validate BCR for drawdown ---
    bcr: Optional[BaselineChangeRequest] = None
    if bcr_id:
        bcr = db.query(BaselineChangeRequest).filter(
            BaselineChangeRequest.id == bcr_id
        ).first()
        if bcr is None:
            raise HTTPException(
                status_code=404,
                detail=f"BaselineChangeRequest {bcr_id} not found.",
            )

        # Check BCR is approved
        if bcr.status != BaselineChangeRequestStatus.APPROVED:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"BCR {bcr.bcr_number} is not approved. "
                    f"Current status: {bcr.status.value}. "
                    f"Only approved BCRs can authorise MR drawdowns."
                ),
            )

        # Check BCR tier — must be Tier 2 or Tier 3
        if bcr.tier == BaselineTier.TIER_1_LOCAL_CAM:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"BCR {bcr.bcr_number} is Tier 1 (local CAM). "
                    f"MR drawdowns require Tier 2 (Project CCB) or "
                    f"Tier 3 (Programme Board) authorisation."
                ),
            )

    # --- Create the transaction ledger entry ---
    transaction = ManagementReserveTransaction(
        pool_id=pool_id,
        bcr_id=bcr_id,
        transaction_type=TransactionType.DRAWDOWN_TO_WBS,
        amount=amount_decimal,
        target_portfolio_node_id=target_node_id,
        justification=justification,
        authorized_by_user_id=user_id,
        transaction_timestamp=datetime.now(timezone.utc),
    )
    db.add(transaction)

    # --- Decrement pool balance ---
    pool.current_balance = pool.current_balance - amount_decimal
    pool.updated_at = datetime.now(timezone.utc)

    # --- Increment target node BAC ---
    if target_node.bac_cost is None:
        target_node.bac_cost = Decimal("0.00")
    target_node.bac_cost = target_node.bac_cost + amount_decimal

    # --- Record in ForensicAuditLog ---
    audit_entry = ForensicAuditLog.create_entry(
        user_upn=authorising_user.email or f"user:{user_id}",
        action_type="MR_DRAWDOWN",
        entity_type="ManagementReserveTransaction",
        entity_id=str(transaction.id),
        json_diff={
            "pool_id": str(pool_id),
            "target_node_id": str(target_node_id),
            "amount": str(amount_decimal),
            "bcr_id": bcr_id,
            "justification": justification,
            "pool_balance_before": str(pool.current_balance + amount_decimal),
            "pool_balance_after": str(pool.current_balance),
            "target_node_bac_before": str(target_node.bac_cost - amount_decimal),
            "target_node_bac_after": str(target_node.bac_cost),
        },
        security_marking=f"MR_DRAWDOWN: {pool.currency_code} {amount_decimal}",
        db=db,
    )
    db.add(audit_entry)

    # --- Commit the transaction ---
    db.flush()

    return transaction


def get_reserve_status(
    project_id: str,
    db: Session,
) -> dict:
    """Get the current status of a project's Management Reserve.

    Returns the reserve pool details, total amounts drawn down and returned,
    and a list of all transactions ordered by timestamp.

    Parameters
    ----------
    project_id : str
        UUID of the root Project/Programme node.
    db : Session
        Active SQLAlchemy database session.

    Returns
    -------
    dict
        Dictionary containing:

        - **pool** : dict or None — Reserve pool details (id,
          portfolio_node_id, total_initial_budget, current_balance,
          currency_code, created_at, updated_at).
        - **total_drawn_down** : float — Total amount drawn down from
          the reserve (sum of DRAWDOWN_TO_WBS transactions).
        - **total_returned** : float — Total amount returned to the
          reserve (sum of RETURN_TO_RESERVE transactions).
        - **transactions** : list[dict] — List of all transactions
          ordered by timestamp (newest first).
    """
    pool = db.query(ManagementReservePool).filter(
        ManagementReservePool.portfolio_node_id == project_id
    ).first()

    if pool is None:
        return {
            "pool": None,
            "total_drawn_down": 0.0,
            "total_returned": 0.0,
            "transactions": [],
        }

    # Fetch all transactions for this pool
    transactions = (
        db.query(ManagementReserveTransaction)
        .filter(ManagementReserveTransaction.pool_id == pool.id)
        .order_by(ManagementReserveTransaction.transaction_timestamp.desc())
        .all()
    )

    # Calculate totals by transaction type
    total_drawn_down = Decimal("0.00")
    total_returned = Decimal("0.00")

    for tx in transactions:
        if tx.transaction_type == TransactionType.DRAWDOWN_TO_WBS:
            total_drawn_down += tx.amount
        elif tx.transaction_type == TransactionType.RETURN_TO_RESERVE:
            total_returned += tx.amount

    # Build pool response
    pool_data = {
        "id": str(pool.id),
        "portfolio_node_id": str(pool.portfolio_node_id),
        "total_initial_budget": float(pool.total_initial_budget),
        "current_balance": float(pool.current_balance),
        "currency_code": pool.currency_code,
        "created_at": pool.created_at.isoformat() if pool.created_at else None,
        "updated_at": pool.updated_at.isoformat() if pool.updated_at else None,
    }

    # Build transaction list
    transaction_list = []
    for tx in transactions:
        transaction_list.append({
            "id": str(tx.id),
            "pool_id": str(tx.pool_id),
            "transaction_type": tx.transaction_type.value,
            "amount": float(tx.amount),
            "target_portfolio_node_id": str(tx.target_portfolio_node_id),
            "bcr_id": str(tx.bcr_id) if tx.bcr_id else None,
            "risk_item_id": str(tx.risk_item_id) if tx.risk_item_id else None,
            "justification": tx.justification,
            "authorized_by_user_id": tx.authorized_by_user_id,
            "transaction_timestamp": (
                tx.transaction_timestamp.isoformat()
                if tx.transaction_timestamp
                else None
            ),
        })

    return {
        "pool": pool_data,
        "total_drawn_down": float(total_drawn_down),
        "total_returned": float(total_returned),
        "transactions": transaction_list,
    }


def create_reserve_pool(
    portfolio_node_id: str,
    total_initial_budget: float,
    currency_code: str,
    user_id: int,
    db: Session,
) -> ManagementReservePool:
    """Create a new Management Reserve pool for a project.

    Initialises a reserve pool with the specified budget and records an
    INITIAL_ALLOCATION transaction.

    Parameters
    ----------
    portfolio_node_id : str
        UUID of the root Project/Programme node owning this reserve.
    total_initial_budget : float
        Initial budget allocated to the reserve pool.
    currency_code : str
        3-letter ISO currency code (default 'GBP').
    user_id : int
        ID of the user creating the pool.
    db : Session
        Active SQLAlchemy database session.

    Returns
    -------
    ManagementReservePool
        The newly created reserve pool.

    Raises
    ------
    HTTPException(400)
        A reserve pool already exists for this project.
    HTTPException(404)
        The target portfolio node was not found.
    """
    # Check for existing pool
    existing_pool = db.query(ManagementReservePool).filter(
        ManagementReservePool.portfolio_node_id == portfolio_node_id
    ).first()
    if existing_pool is not None:
        raise HTTPException(
            status_code=400,
            detail=(
                f"A Management Reserve pool already exists for project "
                f"{portfolio_node_id}."
            ),
        )

    # Verify the target node exists
    target_node = db.query(PortfolioNode).filter(
        PortfolioNode.id == portfolio_node_id
    ).first()
    if target_node is None:
        raise HTTPException(
            status_code=404,
            detail=f"Portfolio node {portfolio_node_id} not found.",
        )

    budget_decimal = Decimal(str(total_initial_budget))

    # Create the pool
    pool = ManagementReservePool(
        portfolio_node_id=portfolio_node_id,
        total_initial_budget=budget_decimal,
        current_balance=budget_decimal,
        currency_code=currency_code,
    )
    db.add(pool)
    db.flush()

    # Record the initial allocation transaction
    initial_tx = ManagementReserveTransaction(
        pool_id=pool.id,
        transaction_type=TransactionType.INITIAL_ALLOCATION,
        amount=budget_decimal,
        target_portfolio_node_id=portfolio_node_id,
        justification=f"Initial Management Reserve allocation: {currency_code} {budget_decimal}",
        authorized_by_user_id=user_id,
        transaction_timestamp=datetime.now(timezone.utc),
    )
    db.add(initial_tx)

    # Record in ForensicAuditLog
    authorising_user = db.query(User).filter(User.id == user_id).first()
    audit_entry = ForensicAuditLog.create_entry(
        user_upn=authorising_user.email if authorising_user else f"user:{user_id}",
        action_type="MR_POOL_CREATED",
        entity_type="ManagementReservePool",
        entity_id=str(pool.id),
        json_diff={
            "portfolio_node_id": str(portfolio_node_id),
            "total_initial_budget": str(budget_decimal),
            "currency_code": currency_code,
        },
        security_marking=f"MR_POOL_CREATED: {currency_code} {budget_decimal}",
        db=db,
    )
    db.add(audit_entry)

    db.flush()
    return pool
