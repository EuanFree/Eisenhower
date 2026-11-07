"""Currency exchange rate service for international defence supply chains.

This module provides the core currency conversion and variance analysis
engine for the Eisenhower Portfolio Manager.  It handles:

- **Exchange Rate Resolution** — Finding the applicable exchange rate
  for a given currency pair and valuation date, respecting effective
  date ranges and rate type preferences.

- **Currency Conversion** — Converting amounts between currencies using
  the resolved exchange rate, with support for direct and inverse
  conversion paths.

- **FX Variance Analysis** — Separating standard Cost Variance (CV) from
  currency fluctuation impact (FX Variance), allowing programme managers
  to distinguish between genuine cost overruns and currency-driven variances.

Why Currency Management?
~~~~~~~~~~~~~~~~~~~~~~~~

International defence programmes frequently involve multi-currency
procurement.  A UK-based programme may source avionics from the US
(priced in USD), radar components from France (priced in EUR), and
software from Canada (priced in CAD).  Without proper currency management:

- Financial rollups mix currencies, producing meaningless totals.
- Budget variances conflate genuine cost overruns with currency movements.
- Contractual fixed rates are not respected, leading to incorrect reporting.

The CurrencyExchangeRate table stores exchange rates with effective date
ranges, allowing the system to always know which rate applied at any
point in time.  For contractual fixed rates, the rate is locked at
contract signing and never changes.

Rate Resolution Algorithm
~~~~~~~~~~~~~~~~~~~~~~~~~

When converting an amount, the system resolves the applicable rate as follows:

1. **Same Currency** — If from_currency == to_currency, return the amount
   unchanged with a rate of 1.0.

2. **Direct Rate** — Look for a CurrencyExchangeRate record where:
   - base_currency == from_currency
   - target_currency == to_currency
   - effective_start_date <= valuation_date
   - effective_end_date >= valuation_date (or NULL)

3. **Inverse Rate** — If no direct rate exists, look for the reverse pair:
   - base_currency == to_currency
   - target_currency == from_currency
   - Then invert the rate: 1 / exchange_rate

4. **Rate Type Preference** — If multiple rates match, prefer in order:
   CONTRACTUAL_FIXED > FORWARD_HEDGE > FLOATING_SPOT

5. **No Rate Found** — Raise ValueError if no applicable rate exists.

FX Variance Calculation
~~~~~~~~~~~~~~~~~~~~~~~

The system separates standard Cost Variance from currency fluctuation impact:

- **CV (Cost Variance)** = EV - AC  (standard EVM cost performance)
- **FX Variance** = (Rate_actual - Rate_baseline) × Direct

For example, if a task is priced at $100,000 USD:

- Baseline rate: 1 GBP = 1.27 USD (task costs £78,740 at baseline)
- Actual rate: 1 GBP = 1.25 USD (task now costs £80,000 at actual)
- FX Variance = (1.25 - 1.27) × £78,740 = -£1,575 (adverse currency impact)

This allows programme managers to see that the task itself is on budget,
but currency movements have increased the cost in base currency terms.

Integration with CBS Rollup
~~~~~~~~~~~~~~~~~~~~~~~~~~~

The CBS (Cost Breakdown Structure) rollup in costing.py uses this module
to convert foreign-currency items into the project's base currency before
aggregating costs.  This ensures the financial rollup is expressed in a
single currency.
"""

from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Optional, Tuple
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import (
    CurrencyExchangeRate,
    ExchangeRateType,
    PortfolioNode,
    TaskCostLedger,
    CostElement,
    ResourceAssignment,
    ResourceNode,
)


# Priority order for rate type preference (lower = higher priority)
_RATE_TYPE_PRIORITY = {
    ExchangeRateType.CONTRACTUAL_FIXED: 0,
    ExchangeRateType.FORWARD_HEDGE: 1,
    ExchangeRateType.FLOATING_SPOT: 2,
}


def resolve_exchange_rate(
    db: Session,
    from_currency: str,
    to_currency: str,
    valuation_date: date,
    rate_type: Optional[ExchangeRateType] = None,
) -> Tuple[Decimal, str, Optional[str]]:
    """Resolve the applicable exchange rate for a currency pair on a given date.

    This function finds the best-matching CurrencyExchangeRate record for
    converting from one currency to another on a specific valuation date.

    Resolution Algorithm
    ~~~~~~~~~~~~~~~~~~~~

    1. **Same Currency** — If from_currency == to_currency, return rate 1.0.

    2. **Direct Rate** — Look for a record where:
       - base_currency == from_currency
       - target_currency == to_currency
       - effective_start_date <= valuation_date
       - effective_end_date >= valuation_date (or NULL)

    3. **Inverse Rate** — If no direct rate, look for the reverse pair
       and invert the rate.

    4. **Rate Type Preference** — If multiple rates match, prefer:
       CONTRACTUAL_FIXED > FORWARD_HEDGE > FLOATING_SPOT

    Parameters
    ----------
    db : Session
        Active SQLAlchemy database session.
    from_currency : str
        Source currency code (3-letter ISO).
    to_currency : str
        Target currency code (3-letter ISO).
    valuation_date : date
        The date for which to resolve the rate.
    rate_type : ExchangeRateType or None
        Optional filter for a specific rate type.  If not specified,
        the system uses its preference order.

    Returns
    -------
    tuple[Decimal, str, Optional[str]]
        A tuple containing:

        - ``exchange_rate`` (Decimal): The exchange rate to apply.
        - ``rate_type`` (str): The type of rate used.
        - ``rate_id`` (str or None): UUID of the rate record used, if any.

    Raises
    ------
    ValueError
        If no applicable exchange rate is found for the given pair and date.
    """
    # Same currency — no conversion needed
    if from_currency.upper() == to_currency.upper():
        return Decimal("1.0"), "SAME_CURRENCY", None

    from_cur = from_currency.upper()
    to_cur = to_currency.upper()

    # Build query for direct rate: from_currency -> to_currency
    direct_query = (
        select(CurrencyExchangeRate)
        .where(
            CurrencyExchangeRate.base_currency == from_cur,
            CurrencyExchangeRate.target_currency == to_cur,
            CurrencyExchangeRate.effective_start_date <= valuation_date,
        )
    )

    # Add rate type filter if specified
    if rate_type is not None:
        direct_query = direct_query.where(
            CurrencyExchangeRate.rate_type == rate_type
        )

    direct_result = db.execute(direct_query).scalars().all()

    # Filter by effective_end_date
    direct_rates = [
        r for r in direct_result
        if r.effective_end_date is None or r.effective_end_date >= valuation_date
    ]

    # Sort by rate type preference
    direct_rates.sort(key=lambda r: _RATE_TYPE_PRIORITY.get(r.rate_type, 99))

    if direct_rates:
        rate = direct_rates[0]
        return (
            Decimal(str(rate.exchange_rate)),
            rate.rate_type.value,
            str(rate.id),
        )

    # Try inverse rate: to_currency -> from_currency
    inverse_query = (
        select(CurrencyExchangeRate)
        .where(
            CurrencyExchangeRate.base_currency == to_cur,
            CurrencyExchangeRate.target_currency == from_cur,
            CurrencyExchangeRate.effective_start_date <= valuation_date,
        )
    )

    if rate_type is not None:
        inverse_query = inverse_query.where(
            CurrencyExchangeRate.rate_type == rate_type
        )

    inverse_result = db.execute(inverse_query).scalars().all()

    inverse_rates = [
        r for r in inverse_result
        if r.effective_end_date is None or r.effective_end_date >= valuation_date
    ]

    inverse_rates.sort(key=lambda r: _RATE_TYPE_PRIORITY.get(r.rate_type, 99))

    if inverse_rates:
        rate = inverse_rates[0]
        # Invert the rate
        inverted_rate = Decimal("1") / Decimal(str(rate.exchange_rate))
        return (
            inverted_rate,
            rate.rate_type.value,
            str(rate.id),
        )

    raise ValueError(
        f"No exchange rate found for {from_cur}/{to_cur} on {valuation_date}. "
        f"Please add a CurrencyExchangeRate record for this pair."
    )


def convert_currency(
    amount: float,
    from_currency: str,
    to_currency: str,
    valuation_date: date,
    rate_type: Optional[str] = None,
    db: Optional[Session] = None,
) -> Dict:
    """Convert an amount from one currency to another.

    This is the primary entry point for currency conversion.  It resolves
    the applicable exchange rate and computes the converted amount.

    Parameters
    ----------
    amount : float
        The amount to convert.
    from_currency : str
        Source currency code (3-letter ISO).
    to_currency : str
        Target currency code (3-letter ISO).
    valuation_date : date
        The date for which to resolve the rate.
    rate_type : str or None
        Optional filter for rate type.  If not specified, the system
        prefers CONTRACTUAL_FIXED > FORWARD_HEDGE > FLOATING_SPOT.
    db : Session or None
        Active SQLAlchemy database session.  Required for rate lookup.

    Returns
    -------
    dict
        A dictionary containing:

        - ``original_amount`` (float): The original amount.
        - ``from_currency`` (str): Source currency code.
        - ``to_currency`` (str): Target currency code.
        - ``converted_amount`` (float): The converted amount.
        - ``exchange_rate_used`` (float): The rate applied.
        - ``rate_type`` (str): The type of rate used.
        - ``rate_id`` (str or None): UUID of the rate record.
        - ``valuation_date`` (str): ISO date string.

    Raises
    ------
    ValueError
        If no applicable exchange rate is found or if db is None.
    """
    if db is None:
        raise ValueError("Database session is required for currency conversion")

    # Parse rate type if provided
    rt = None
    if rate_type is not None:
        try:
            rt = ExchangeRateType(rate_type.upper())
        except ValueError:
            raise ValueError(
                f"Invalid rate type: {rate_type}. "
                f"Must be one of: CONTRACTUAL_FIXED, FLOATING_SPOT, FORWARD_HEDGE"
            )

    # Resolve the exchange rate
    exchange_rate, resolved_type, rate_id = resolve_exchange_rate(
        db, from_currency, to_currency, valuation_date, rt
    )

    # Compute the converted amount
    amount_decimal = Decimal(str(amount))
    converted = amount_decimal * exchange_rate

    # Round to 2 decimal places
    converted = converted.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    rate_rounded = exchange_rate.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)

    return {
        "original_amount": amount,
        "from_currency": from_currency.upper(),
        "to_currency": to_currency.upper(),
        "converted_amount": float(converted),
        "exchange_rate_used": float(rate_rounded),
        "rate_type": resolved_type,
        "rate_id": rate_id,
        "valuation_date": valuation_date.isoformat(),
    }


def compute_currency_variance(
    task_id: UUID,
    db: Session,
) -> Dict:
    """Compute currency variance analysis for a task.

    This function separates standard Cost Variance (CV) from currency
    fluctuation impact (FX Variance), allowing programme managers to
    distinguish between genuine cost overruns and currency-driven variances.

    The algorithm:

    1. Look up the task's PortfolioNode to determine its currency and
       linked exchange rate.
    2. Find the project root's base currency by walking up the ltree path.
    3. If the task's currency differs from the base currency:
       a. Resolve the baseline rate (from the task's contract_exchange_rate_id).
       b. Resolve the actual rate (current spot rate on today's date).
       c. Compute FX Variance = (Rate_actual - Rate_baseline) × Direct.
    4. Compute standard CV = EV - AC from the task's EVM fields.
    5. Return both variances separately.

    Parameters
    ----------
    task_id : UUID
        The UUID of the PortfolioNode to analyse.
    db : Session
        Active SQLAlchemy database session.

    Returns
    -------
    dict
        A dictionary containing:

        - ``task_id`` (str): UUID of the task.
        - ``task_name`` (str): Name of the task.
        - ``task_currency`` (str): The task's currency code.
        - ``base_currency`` (str): The project's base currency.
        - ``baseline_rate`` (float or None): Exchange rate at baseline.
        - ``actual_rate`` (float or None): Current exchange rate.
        - ``direct_cost_local`` (float): Direct cost in task's currency.
        - ``direct_cost_base`` (float): Direct cost in base currency.
        - ``cost_variance`` (float): Standard CV (EV - AC).
        - ``fx_variance`` (float): Currency fluctuation impact.
        - ``total_variance`` (float): Combined variance.

    Raises
    ------
    ValueError
        If the task is not found.
    """
    # Step 1: Look up the task
    task_node = db.get(PortfolioNode, task_id)
    if task_node is None:
        raise ValueError(f"PortfolioNode {task_id} not found")

    task_currency = task_node.currency_code or "GBP"
    task_name = task_node.name or "Unknown"

    # Step 2: Find the project root's base currency
    # Walk up the ltree path to find the root node
    base_currency = task_currency  # Default to task's own currency
    if task_node.path:
        # Get the root node (first segment of the path)
        root_segment = task_node.path.split(".")[0]
        root_query = select(PortfolioNode).where(
            PortfolioNode.path == root_segment
        )
        root_node = db.execute(root_query).scalars().first()
        if root_node is not None:
            base_currency = root_node.currency_code or "GBP"

    # Step 3: Compute direct cost in local currency
    # Sum TaskCostLedger entries for this task
    ledger_query = select(TaskCostLedger).where(
        TaskCostLedger.portfolio_node_id == task_id
    )
    ledgers = db.execute(ledger_query).scalars().all()

    direct_cost_local = Decimal("0")
    for ledger in ledgers:
        direct_cost_local += Decimal(str(ledger.direct_unburdened_amount))

    # Step 4: Convert to base currency if needed
    baseline_rate = None
    actual_rate = None
    direct_cost_base = direct_cost_local

    if task_currency.upper() != base_currency.upper():
        # Resolve baseline rate from the task's contract exchange rate
        if task_node.contract_exchange_rate_id is not None:
            baseline_rate_record = db.get(
                CurrencyExchangeRate, task_node.contract_exchange_rate_id
            )
            if baseline_rate_record is not None:
                baseline_rate = float(
                    Decimal(str(baseline_rate_record.exchange_rate)).quantize(
                        Decimal("0.000001"), rounding=ROUND_HALF_UP
                    )
                )

        # Resolve actual rate (current spot rate)
        try:
            actual_rate_val, _, _ = resolve_exchange_rate(
                db, task_currency, base_currency, date.today()
            )
            actual_rate = float(
                actual_rate_val.quantize(
                    Decimal("0.000001"), rounding=ROUND_HALF_UP
                )
            )
        except ValueError:
            # No current rate available — use baseline rate as fallback
            actual_rate = baseline_rate

        # Convert direct cost to base currency
        if actual_rate is not None:
            direct_cost_base = direct_cost_local * Decimal(str(actual_rate))
            direct_cost_base = direct_cost_base.quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )

    # Step 5: Compute standard CV (EV - AC)
    earned_value = Decimal(str(task_node.earned_value)) if task_node.earned_value else Decimal("0")
    actual_cost = Decimal(str(task_node.actual_cost)) if task_node.actual_cost else Decimal("0")
    cost_variance = earned_value - actual_cost

    # Step 6: Compute FX Variance
    # FX Variance = (Rate_actual - Rate_baseline) × Direct
    fx_variance = Decimal("0")
    if baseline_rate is not None and actual_rate is not None:
        fx_variance = (
            Decimal(str(actual_rate)) - Decimal(str(baseline_rate))
        ) * direct_cost_local
        fx_variance = fx_variance.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    # Total variance
    total_variance = cost_variance + fx_variance

    return {
        "task_id": str(task_id),
        "task_name": task_name,
        "task_currency": task_currency.upper(),
        "base_currency": base_currency.upper(),
        "baseline_rate": baseline_rate,
        "actual_rate": actual_rate,
        "direct_cost_local": float(
            direct_cost_local.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        ),
        "direct_cost_base": float(
            direct_cost_base.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        ),
        "cost_variance": float(
            cost_variance.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        ),
        "fx_variance": float(
            fx_variance.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        ),
        "total_variance": float(
            total_variance.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        ),
    }


def convert_ledger_to_base_currency(
    ledger: TaskCostLedger,
    base_currency: str,
    valuation_date: date,
    db: Session,
) -> Tuple[Decimal, Decimal]:
    """Convert a TaskCostLedger entry to the project's base currency.

    This helper function is used by the CBS rollup to convert foreign-currency
    ledger entries into the project's base currency before aggregation.

    Parameters
    ----------
    ledger : TaskCostLedger
        The ledger entry to convert.
    base_currency : str
        The project's base currency code.
    valuation_date : date
        The date for which to resolve the exchange rate.
    db : Session
        Active SQLAlchemy database session.

    Returns
    -------
    tuple[Decimal, Decimal]
        A tuple of (direct_amount_base, burdened_amount_base) converted
        to the base currency.
    """
    # Get the portfolio node's currency
    node = db.get(PortfolioNode, ledger.portfolio_node_id)
    if node is None:
        return (
            Decimal(str(ledger.direct_unburdened_amount)),
            Decimal(str(ledger.fully_burdened_amount)),
        )

    node_currency = node.currency_code or "GBP"

    # If same currency, no conversion needed
    if node_currency.upper() == base_currency.upper():
        return (
            Decimal(str(ledger.direct_unburdened_amount)),
            Decimal(str(ledger.fully_burdened_amount)),
        )

    # Resolve the exchange rate
    try:
        exchange_rate, _, _ = resolve_exchange_rate(
            db, node_currency, base_currency, valuation_date
        )
    except ValueError:
        # No rate found — return original amounts
        return (
            Decimal(str(ledger.direct_unburdened_amount)),
            Decimal(str(ledger.fully_burdened_amount)),
        )

    # Convert amounts
    direct_base = Decimal(str(ledger.direct_unburdened_amount)) * exchange_rate
    burdened_base = Decimal(str(ledger.fully_burdened_amount)) * exchange_rate

    # Round to 2 decimal places
    direct_base = direct_base.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    burdened_base = burdened_base.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    return (direct_base, burdened_base)
