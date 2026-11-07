"""Currency exchange rate management API endpoints.

This module provides the REST API for managing foreign currency exchange
rates and performing currency conversions in the Eisenhower Portfolio Manager.

Why Currency Endpoints?
~~~~~~~~~~~~~~~~~~~~~~~

International defence programmes involve multi-currency procurement.  These
endpoints allow financial managers to:

- **Maintain Exchange Rates** — Record contractual fixed rates, floating
  spot rates, and forward hedge rates with effective date ranges.

- **Test Conversions** — Validate that the correct rate is being applied
  for a given currency pair and valuation date.

- **Analyse FX Variance** — Separate standard Cost Variance from currency
  fluctuation impact for accurate financial reporting.

API Endpoints
~~~~~~~~~~~~~

All endpoints are mounted under ``/api/v1/currency``:

- **POST /rates** — Create a new exchange rate record.
- **GET /rates** — List all exchange rates (with optional filtering).
- **GET /rates/{id}** — Get a specific exchange rate.
- **PUT /rates/{id}** — Update an existing exchange rate.
- **DELETE /rates/{id}** — Delete an exchange rate record.
- **POST /convert** — Convert an amount between currencies.
- **GET /tasks/{task_id}/fx-variance** — Analyse currency variance for a task.

Authentication
~~~~~~~~~~~~~~

All endpoints require a valid JWT token via the ``Authorization`` header.
Only authenticated users can access currency data.
"""

from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.schemas import (
    CurrencyExchangeRateCreate,
    CurrencyExchangeRateUpdate,
    CurrencyExchangeRateResponse,
    CurrencyExchangeRateListResponse,
    CurrencyConvertRequest,
    CurrencyConvertResponse,
    CurrencyVarianceResponse,
)
from app.utils.auth import get_current_user
from app.models.models import CurrencyExchangeRate, ExchangeRateType, User
from app.services.currency import convert_currency, compute_currency_variance

router = APIRouter()


@router.post("/rates", response_model=CurrencyExchangeRateResponse)
def create_exchange_rate(
    data: CurrencyExchangeRateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new currency exchange rate record.

    Exchange rate records define the conversion factor between two currencies
    for a specific time period.  For contractual fixed rates, the
    effective_end_date is typically NULL, meaning the rate remains valid
    indefinitely.

    Parameters
    ----------
    data : CurrencyExchangeRateCreate
        The exchange rate data including currency pair, rate type,
        exchange rate value, and effective date range.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    CurrencyExchangeRateResponse
        The created exchange rate record.

    Raises
    ------
    HTTPException
        400 if the rate type is invalid.
    """
    # Validate rate type
    try:
        rate_type = ExchangeRateType(data.rate_type.upper())
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid rate type: {data.rate_type}. "
                   f"Must be one of: CONTRACTUAL_FIXED, FLOATING_SPOT, FORWARD_HEDGE",
        )

    # Parse dates
    try:
        start_date = date.fromisoformat(data.effective_start_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid effective_start_date format")

    end_date = None
    if data.effective_end_date is not None:
        try:
            end_date = date.fromisoformat(data.effective_end_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid effective_end_date format")

    # Create the record
    rate = CurrencyExchangeRate(
        base_currency=data.base_currency.upper(),
        target_currency=data.target_currency.upper(),
        rate_type=rate_type,
        exchange_rate=data.exchange_rate,
        effective_start_date=start_date,
        effective_end_date=end_date,
    )

    db.add(rate)
    db.commit()
    db.refresh(rate)

    return CurrencyExchangeRateResponse(
        id=str(rate.id),
        base_currency=rate.base_currency,
        target_currency=rate.target_currency,
        rate_type=rate.rate_type.value,
        exchange_rate=float(rate.exchange_rate),
        effective_start_date=rate.effective_start_date.isoformat(),
        effective_end_date=rate.effective_end_date.isoformat() if rate.effective_end_date else None,
    )


@router.get("/rates", response_model=CurrencyExchangeRateListResponse)
def list_exchange_rates(
    base_currency: Optional[str] = Query(None, description="Filter by base currency"),
    target_currency: Optional[str] = Query(None, description="Filter by target currency"),
    rate_type: Optional[str] = Query(None, description="Filter by rate type"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all currency exchange rate records.

    Optionally filter by base currency, target currency, or rate type.

    Parameters
    ----------
    base_currency : str or None
        Filter by base currency code (e.g., 'GBP').
    target_currency : str or None
        Filter by target currency code (e.g., 'USD').
    rate_type : str or None
        Filter by rate type (CONTRACTUAL_FIXED, FLOATING_SPOT, FORWARD_HEDGE).
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    CurrencyExchangeRateListResponse
        List of exchange rate records matching the filters.
    """
    from sqlalchemy import select

    query = select(CurrencyExchangeRate)

    if base_currency is not None:
        query = query.where(CurrencyExchangeRate.base_currency == base_currency.upper())
    if target_currency is not None:
        query = query.where(CurrencyExchangeRate.target_currency == target_currency.upper())
    if rate_type is not None:
        try:
            query = query.where(CurrencyExchangeRate.rate_type == ExchangeRateType(rate_type.upper()))
        except ValueError:
            pass  # Invalid rate type — return empty list

    query = query.order_by(CurrencyExchangeRate.base_currency, CurrencyExchangeRate.effective_start_date.desc())

    result = db.execute(query).scalars().all()

    rates = []
    for rate in result:
        rates.append(CurrencyExchangeRateResponse(
            id=str(rate.id),
            base_currency=rate.base_currency,
            target_currency=rate.target_currency,
            rate_type=rate.rate_type.value,
            exchange_rate=float(rate.exchange_rate),
            effective_start_date=rate.effective_start_date.isoformat(),
            effective_end_date=rate.effective_end_date.isoformat() if rate.effective_end_date else None,
        ))

    return CurrencyExchangeRateListResponse(rates=rates, total_rates=len(rates))


@router.get("/rates/{rate_id}", response_model=CurrencyExchangeRateResponse)
def get_exchange_rate(
    rate_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific currency exchange rate record.

    Parameters
    ----------
    rate_id : str
        UUID of the exchange rate record.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    CurrencyExchangeRateResponse
        The exchange rate record.

    Raises
    ------
    HTTPException
        404 if the rate record is not found.
    """
    try:
        uid = UUID(rate_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rate ID format")

    rate = db.get(CurrencyExchangeRate, uid)
    if rate is None:
        raise HTTPException(status_code=404, detail="Exchange rate not found")

    return CurrencyExchangeRateResponse(
        id=str(rate.id),
        base_currency=rate.base_currency,
        target_currency=rate.target_currency,
        rate_type=rate.rate_type.value,
        exchange_rate=float(rate.exchange_rate),
        effective_start_date=rate.effective_start_date.isoformat(),
        effective_end_date=rate.effective_end_date.isoformat() if rate.effective_end_date else None,
    )


@router.put("/rates/{rate_id}", response_model=CurrencyExchangeRateResponse)
def update_exchange_rate(
    rate_id: str,
    data: CurrencyExchangeRateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing currency exchange rate record.

    Only the fields provided in the request body will be updated;
    omitted fields remain unchanged.

    Parameters
    ----------
    rate_id : str
        UUID of the exchange rate record to update.
    data : CurrencyExchangeRateUpdate
        The fields to update.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    CurrencyExchangeRateResponse
        The updated exchange rate record.

    Raises
    ------
    HTTPException
        404 if the rate record is not found.
        400 if the rate type is invalid.
    """
    try:
        uid = UUID(rate_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rate ID format")

    rate = db.get(CurrencyExchangeRate, uid)
    if rate is None:
        raise HTTPException(status_code=404, detail="Exchange rate not found")

    # Update fields
    if data.rate_type is not None:
        try:
            rate.rate_type = ExchangeRateType(data.rate_type.upper())
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid rate type: {data.rate_type}",
            )

    if data.exchange_rate is not None:
        rate.exchange_rate = data.exchange_rate

    if data.effective_start_date is not None:
        try:
            rate.effective_start_date = date.fromisoformat(data.effective_start_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid effective_start_date format")

    if data.effective_end_date is not None:
        try:
            rate.effective_end_date = date.fromisoformat(data.effective_end_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid effective_end_date format")

    db.commit()
    db.refresh(rate)

    return CurrencyExchangeRateResponse(
        id=str(rate.id),
        base_currency=rate.base_currency,
        target_currency=rate.target_currency,
        rate_type=rate.rate_type.value,
        exchange_rate=float(rate.exchange_rate),
        effective_start_date=rate.effective_start_date.isoformat(),
        effective_end_date=rate.effective_end_date.isoformat() if rate.effective_end_date else None,
    )


@router.delete("/rates/{rate_id}")
def delete_exchange_rate(
    rate_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a currency exchange rate record.

    Parameters
    ----------
    rate_id : str
        UUID of the exchange rate record to delete.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    dict
        Confirmation message.

    Raises
    ------
    HTTPException
        404 if the rate record is not found.
    """
    try:
        uid = UUID(rate_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid rate ID format")

    rate = db.get(CurrencyExchangeRate, uid)
    if rate is None:
        raise HTTPException(status_code=404, detail="Exchange rate not found")

    db.delete(rate)
    db.commit()

    return {"message": f"Exchange rate {rate_id} deleted"}


@router.post("/convert", response_model=CurrencyConvertResponse)
def convert_amount(
    data: CurrencyConvertRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Convert an amount from one currency to another.

    This endpoint resolves the applicable exchange rate effective on
    the given valuation date and computes the converted amount.

    The rate resolution algorithm:

    1. **Same Currency** — If from_currency == to_currency, return
       the amount unchanged with a rate of 1.0.

    2. **Direct Rate** — Look for a CurrencyExchangeRate record where
       base_currency == from_currency and target_currency == to_currency.

    3. **Inverse Rate** — If no direct rate exists, look for the reverse
       pair and invert the rate.

    4. **Rate Type Preference** — If multiple rates match, prefer:
       CONTRACTUAL_FIXED > FORWARD_HEDGE > FLOATING_SPOT.

    Parameters
    ----------
    data : CurrencyConvertRequest
        The conversion request including amount, currency pair,
        valuation date, and optional rate type filter.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    CurrencyConvertResponse
        The conversion result including the converted amount,
        exchange rate used, and rate type.

    Raises
    ------
    HTTPException
        400 if the valuation date format is invalid.
        404 if no applicable exchange rate is found.
    """
    # Parse valuation date
    try:
        valuation_date = date.fromisoformat(data.valuation_date)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid valuation_date format. Use YYYY-MM-DD.",
        )

    try:
        result = convert_currency(
            amount=data.amount,
            from_currency=data.from_currency,
            to_currency=data.to_currency,
            valuation_date=valuation_date,
            rate_type=data.rate_type,
            db=db,
        )
        return CurrencyConvertResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/tasks/{task_id}/fx-variance", response_model=CurrencyVarianceResponse)
def get_fx_variance(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Analyse currency variance for a task.

    This endpoint separates standard Cost Variance (CV) from currency
    fluctuation impact (FX Variance), allowing programme managers to
    distinguish between genuine cost overruns and currency-driven variances.

    The algorithm:

    1. Look up the task's currency and linked exchange rate.
    2. Find the project root's base currency.
    3. If the task's currency differs from the base currency:
       a. Resolve the baseline rate (from the task's contract_exchange_rate_id).
       b. Resolve the actual rate (current spot rate on today's date).
       c. Compute FX Variance = (Rate_actual - Rate_baseline) × Direct.
    4. Compute standard CV = EV - AC from the task's EVM fields.

    Parameters
    ----------
    task_id : str
        UUID of the PortfolioNode to analyse.
    db : Session
        Database session (injected).
    current_user : User
        Authenticated user (injected).

    Returns
    -------
    CurrencyVarianceResponse
        The variance analysis including baseline rate, actual rate,
        cost variance, FX variance, and total variance.

    Raises
    ------
    HTTPException
        404 if the task is not found.
    """
    try:
        uid = UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid task ID format")

    try:
        result = compute_currency_variance(task_id=uid, db=db)
        return CurrencyVarianceResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
