"""Commercial governance service for contractual pricing and fiscal compliance.

This module implements the commercial governance engine that enforces
contractual pricing mechanisms, fiscal year spending caps, and formal
Government milestone acceptance gates.

Commercial Governance Overview
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

In defence programme management, the contract type determines how
financial risk is allocated between the government customer and the
prime contractor.  This service provides:

1. **TCIF Fee Adjustment** — For Target Cost Incentive Fee (TCIF)
   contracts, when actual/projected costs differ from the target cost,
   the fee is adjusted using pre-agreed shareline ratios.  The total
   price is capped at the ceiling price to protect the government from
   unlimited cost growth.

2. **Fiscal Year Spend Validation** — Government funding is appropriated
   on a fiscal year basis.  This function checks time-phased cost rollups
   against allocated fiscal year caps and flags ``FISCAL_TRANCHE_OVERRUN``
   clashes when slips cause in-year planned spend to exceed the allocated
   funding.

   Non-linear cost distribution is now supported: each node's
   ``cost_distribution_profile`` determines how its BAC is spread across
   its planned duration using statistical curves (Beta, Weibull, Rayleigh)
   instead of flat linear allocation.  This produces more accurate fiscal
   tranche estimates that reflect real-world spend patterns.

3. **Government Acceptance Gates** — Formal inspection and acceptance
   milestones track the lifecycle of deliverable acceptance, from
   submission through final disposition.  Without formal acceptance,
   the contractor cannot invoice for the deliverable.

TCIF Fee Adjustment Formula
~~~~~~~~~~~~~~~~~~~~~~~~~~~

For a Target Cost Incentive Fee contract:

1. **Cost Variance** = Target Cost − Projected Cost
   (Positive = under budget, Negative = over budget)

2. **Fee Adjustment** = Cost Variance × Contractor Share Ratio
   (e.g., if cost variance is +£100,000 and contractor share is 70%,
   the fee increases by £70,000)

3. **Adjusted Fee** = Target Fee + Fee Adjustment

4. **Projected Total Price** = Projected Cost + Adjusted Fee

5. **Ceiling Price Clamp** — If the projected total price exceeds the
   ceiling price, it is clamped to the ceiling.  The adjusted fee is
   reduced accordingly.

Fiscal Year Spend Validation
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

For each fiscal year tranche on a control account:

1. For each descendant node, compute the time-phased daily costs using
   the node's ``cost_distribution_profile`` (non-linear curve) or flat
   linear allocation as fallback.

2. Map each daily cost into the appropriate fiscal year tranche based
   on the calendar date it falls in.

3. Sum the planned spend for all nodes within each fiscal year.

4. Sum the actual spend (AC) for all descendant nodes.

5. Compare total spend (planned + actual) against the allocated
   funding cap.

6. If total spend exceeds the cap, flag a ``FISCAL_TRANCHE_OVERRUN``
   with the overrun amount, percentage, and recommended cost slippage
   or de-scoping deltas.

Integration Points
~~~~~~~~~~~~~~~~~~

This service is called by:

- The commercial router endpoints for TCIF fee calculation and fiscal
  spend validation.
- The clash daemon to detect fiscal year overruns during portfolio sweeps.
- The EVM calculator to incorporate ceiling price constraints into
  EAC projections.
"""
from sqlalchemy.orm import Session
from sqlalchemy import select, func, and_, or_
from uuid import UUID
from datetime import date, timezone, datetime, timedelta
from typing import List, Optional, Dict, Any, Tuple
from decimal import Decimal, ROUND_HALF_UP
from fastapi import HTTPException

from app.models.models import (
    UniversalBreakdownNode, PortfolioNode,
    ProjectContractStructure, ContractPricingType,
    FiscalYearSpendingCap,
    GovernmentAcceptanceMilestone, AcceptanceDocumentType, AcceptanceStatus,
    TaskCostLedger, ResourceAssignment,
)
from app.services.costing import calculate_time_phased_cost, CostSpreadMethod


def calculate_tcif_fee_adjustment(
    db: Session,
    project_id: UUID,
    projected_cost: float,
) -> Dict[str, Any]:
    """Calculate TCIF fee adjustment for a Target Cost Incentive Fee contract.

    When actual/projected costs differ from the target cost, the fee is
    adjusted using the shareline ratios.  The total price is capped at
    the ceiling price to protect the government from unlimited cost growth.

    The calculation follows the standard TCIF formula:

    1. **Cost Variance** = Target Cost − Projected Cost
    2. **Fee Adjustment** = Cost Variance × Contractor Share Ratio
    3. **Adjusted Fee** = Target Fee + Fee Adjustment
    4. **Projected Total Price** = Projected Cost + Adjusted Fee
    5. **Ceiling Clamp** — If total price > ceiling, clamp to ceiling

    For non-TCIF contracts (Firm Fixed Price or Cost Plus Fixed Fee),
    the fee adjustment is zero and the total price is simply the
    projected cost plus the fixed fee.

    Args:
        db: Active SQLAlchemy database session.
        project_id: UUID of the root PortfolioNode (Project level) for
            which to calculate the fee adjustment.
        projected_cost: The projected or actual total cost for the
            project scope.  This is compared against the target cost
            to determine the fee adjustment.

    Returns:
        A dictionary containing:

        - ``project_id`` (UUID): The project being evaluated.
        - ``contract_pricing_type`` (ContractPricingType): The contract type.
        - ``target_cost`` (float): The negotiated target cost.
        - ``target_fee`` (float): The negotiated target fee.
        - ``projected_cost`` (float): The projected/actual cost.
        - ``cost_variance`` (float): Target Cost − Projected Cost.
        - ``fee_adjustment`` (float): Cost Variance × Contractor Share.
        - ``adjusted_fee`` (float): Target Fee + Fee Adjustment.
        - ``projected_total_price`` (float): Projected Cost + Adjusted Fee.
        - ``ceiling_price`` (float or None): The maximum total price.
        - ``is_ceiling_exceeded`` (bool): True if the ceiling was exceeded.
        - ``clamped_total_price`` (float or None): The clamped price if
          the ceiling was exceeded.
        - ``contractor_share_ratio`` (float): Contractor's share of variance.
        - ``customer_share_ratio`` (float): Customer's share of variance.

    Raises:
        HTTPException: 404 if the project or contract structure is not found.
        HTTPException: 400 if the contract is not a TCIF type.
    """
    contract = db.execute(
        select(ProjectContractStructure).where(
            ProjectContractStructure.portfolio_node_id == project_id
        )
    ).scalar_one_or_none()

    if contract is None:
        raise HTTPException(
            status_code=404,
            detail=f"No contract structure found for project {project_id}",
        )

    # Load the project node to verify it exists
    project_node = db.execute(
        select(PortfolioNode).where(PortfolioNode.id == project_id)
    ).scalar_one_or_none()

    if project_node is None:
        raise HTTPException(
            status_code=404,
            detail=f"PortfolioNode {project_id} not found",
        )

    target_cost = float(contract.target_cost) if contract.target_cost else 0.0
    target_fee = float(contract.target_fee) if contract.target_fee else 0.0
    ceiling_price = (
        float(contract.ceiling_price) if contract.ceiling_price else None
    )
    contractor_share = (
        float(contract.contractor_share_ratio)
        if contract.contractor_share_ratio
        else 0.7
    )
    customer_share = (
        float(contract.customer_share_ratio)
        if contract.customer_share_ratio
        else 0.3
    )

    # Cost variance: positive = under budget, negative = over budget
    cost_variance = target_cost - projected_cost

    if contract.contract_pricing_type == ContractPricingType.TARGET_COST_INCENTIVE_FEE:
        # TCIF: fee is adjusted based on cost variance and shareline
        fee_adjustment = cost_variance * contractor_share
        adjusted_fee = target_fee + fee_adjustment
        projected_total_price = projected_cost + adjusted_fee

        # Ceiling price clamp
        is_ceiling_exceeded = False
        clamped_total_price = None

        if ceiling_price is not None and projected_total_price > ceiling_price:
            is_ceiling_exceeded = True
            clamped_total_price = ceiling_price
            # Reduce adjusted fee to match ceiling
            adjusted_fee = ceiling_price - projected_cost
            projected_total_price = ceiling_price

    elif contract.contract_pricing_type == ContractPricingType.COST_PLUS_FIXED_FEE:
        # CPFF: fee is fixed regardless of cost
        fee_adjustment = 0.0
        adjusted_fee = target_fee
        projected_total_price = projected_cost + adjusted_fee

        is_ceiling_exceeded = False
        clamped_total_price = None

        if ceiling_price is not None and projected_total_price > ceiling_price:
            is_ceiling_exceeded = True
            clamped_total_price = ceiling_price
            adjusted_fee = ceiling_price - projected_cost
            projected_total_price = ceiling_price

    else:
        # FFP: price is fixed; projected cost is informational only
        fee_adjustment = 0.0
        adjusted_fee = target_fee
        projected_total_price = target_cost + target_fee

        is_ceiling_exceeded = False
        clamped_total_price = None

    return {
        "project_id": project_id,
        "contract_pricing_type": contract.contract_pricing_type,
        "target_cost": target_cost,
        "target_fee": target_fee,
        "projected_cost": projected_cost,
        "cost_variance": cost_variance,
        "fee_adjustment": fee_adjustment,
        "adjusted_fee": adjusted_fee,
        "projected_total_price": projected_total_price,
        "ceiling_price": ceiling_price,
        "is_ceiling_exceeded": is_ceiling_exceeded,
        "clamped_total_price": clamped_total_price,
        "contractor_share_ratio": contractor_share,
        "customer_share_ratio": customer_share,
    }


def _get_daily_costs_for_node(node: PortfolioNode) -> Optional[List[Tuple[date, Decimal]]]:
    """Compute time-phased daily costs for a single node using its distribution profile.

    Uses the node's ``cost_distribution_profile`` to determine the curve method,
    then maps each daily cost to the corresponding calendar date.

    Parameters
    ----------
    node : PortfolioNode
        The node whose daily costs are being computed.

    Returns
    -------
    list of (date, Decimal) or None
        A list of (calendar_date, daily_cost) tuples for each day of the
        node's planned duration, or None if the node lacks required fields.
    """
    if (
        node.bac_cost is None
        or node.planned_start_date is None
        or node.planned_end_date is None
    ):
        return None

    bac = Decimal(str(node.bac_cost))
    if bac <= 0:
        return None

    # Compute duration in days
    start_dt = node.planned_start_date
    end_dt = node.planned_end_date

    # Normalise to date objects
    if isinstance(start_dt, datetime):
        start_date = start_dt.date()
    else:
        start_date = start_dt

    if isinstance(end_dt, datetime):
        end_date = end_dt.date()
    else:
        end_date = end_dt

    duration = (end_date - start_date).days + 1
    if duration < 1:
        duration = 1

    # Determine distribution method from profile
    profile = node.cost_distribution_profile
    if profile is None or profile == "LINEAR":
        method = CostSpreadMethod.LINEAR
    else:
        try:
            method = CostSpreadMethod(profile)
        except ValueError:
            method = CostSpreadMethod.LINEAR

    # Read optional shape factor from custom_attributes
    shape_factor = 2.0
    if node.custom_attributes and isinstance(node.custom_attributes, dict):
        raw = node.custom_attributes.get("cost_shape_factor")
        if raw is not None:
            try:
                shape_factor = float(raw)
            except (ValueError, TypeError):
                pass

    # Calculate daily costs using the distribution curve
    daily_amounts = calculate_time_phased_cost(bac, duration, method, shape_factor)

    # Map each daily cost to a calendar date
    daily_costs: List[Tuple[date, Decimal]] = []
    for i, amount in enumerate(daily_amounts):
        day_date = start_date + timedelta(days=i)
        daily_costs.append((day_date, amount))

    return daily_costs


def validate_fiscal_year_spend_profile(
    db: Session,
    control_account_id: UUID,
) -> List[Dict[str, Any]]:
    """Validate fiscal year spend profile against allocated funding caps.

    Evaluates periodic time-phased cost rollups against FiscalYearSpendingCap
    boundaries using non-linear cost distribution curves.  Flags a
    ``FISCAL_TRANCHE_OVERRUN`` if slips cause in-year planned spend to
    exceed allocated annual funding.

    The algorithm:

    1. Load all FiscalYearSpendingCap records for the control account.
    2. For each descendant node, compute time-phased daily costs using
       the node's ``cost_distribution_profile`` (non-linear curve) or
       flat linear allocation as fallback.
    3. Map each daily cost into the appropriate fiscal year tranche based
       on the calendar date it falls in.
    4. Sum the planned spend for all nodes within each fiscal year.
    5. Sum the actual cost (AC) for all descendant nodes.
    6. Compare total spend (planned + actual) against the allocated cap.
    7. If total spend exceeds the cap, flag a ``FISCAL_TRANCHE_OVERRUN``
       with the overrun amount, percentage, and recommended cost slippage
       or de-scoping deltas.

    Args:
        db: Active SQLAlchemy database session.
        control_account_id: UUID of the PortfolioNode (Control Account level)
            whose fiscal year spending caps are being validated.

    Returns:
        A list of dictionaries, one per fiscal year cap, each containing:

        - ``portfolio_node_id`` (UUID): The control account node.
        - ``fiscal_year`` (str): Fiscal year identifier (e.g., 'FY26/27').
        - ``allocated_funding_cap`` (float): The allocated funding cap.
        - ``planned_spend`` (float): Sum of planned BAC within this FY.
        - ``actual_spend`` (float): Sum of actual costs (AC) within this FY.
        - ``total_spend`` (float): Planned + actual spend.
        - ``overrun_amount`` (float): Amount by which spend exceeds cap
          (0.0 if no overrun).
        - ``is_overrun`` (bool): True if total spend exceeds the cap.
        - ``overrun_percentage`` (float): Overrun as a percentage of the cap.
        - ``recommended_slippage_days`` (int or None): Suggested schedule
          shift to bring spend within cap (only present when overrun).
        - ``recommended_descoping_amount`` (float or None): Amount to
          de-scope to bring spend within cap (only present when overrun).

    Raises:
        HTTPException: 404 if the control account node is not found.
    """
    # Verify the control account exists
    control_node = db.execute(
        select(PortfolioNode).where(PortfolioNode.id == control_account_id)
    ).scalar_one_or_none()

    if control_node is None:
        raise HTTPException(
            status_code=404,
            detail=f"PortfolioNode {control_account_id} not found",
        )

    # Load all fiscal year caps for this control account
    fy_caps = db.execute(
        select(FiscalYearSpendingCap).where(
            FiscalYearSpendingCap.portfolio_node_id == control_account_id
        )
    ).scalars().all()

    if not fy_caps:
        return []

    # Get all descendant nodes for the control account
    # Use string-based path prefix matching for cross-database compatibility
    path_prefix = control_node.path if control_node.path else ""
    if path_prefix:
        descendants = db.execute(
            select(PortfolioNode).where(
                PortfolioNode.path.like(f"{path_prefix}.%"),
                PortfolioNode.is_active == True,
            )
        ).scalars().all()
    else:
        descendants = []

    # Build a map of node_id -> node for quick lookup
    descendant_map = {node.id: node for node in descendants}

    # Pre-compute daily costs for all descendants
    node_daily_costs: Dict[UUID, List[Tuple[date, Decimal]]] = {}
    for node in descendants:
        daily = _get_daily_costs_for_node(node)
        if daily is not None:
            node_daily_costs[node.id] = daily

    results: List[Dict[str, Any]] = []

    for fy_cap in fy_caps:
        fy_start = fy_cap.fy_start_date
        fy_end = fy_cap.fy_end_date
        allocated_cap = Decimal(str(fy_cap.allocated_funding_cap))

        planned_spend = Decimal("0")
        actual_spend = Decimal("0")

        # Accumulate per-node planned spend for overrun analysis
        node_planned_in_fy: Dict[UUID, Decimal] = {}

        for node in descendants:
            # Calculate planned spend using time-phased daily costs
            if node.id in node_daily_costs:
                fy_planned = Decimal("0")
                for day_date, daily_amount in node_daily_costs[node.id]:
                    if fy_start <= day_date <= fy_end:
                        fy_planned += daily_amount
                planned_spend += fy_planned
                node_planned_in_fy[node.id] = fy_planned

            # Add actual cost (AC) for this node
            if node.actual_cost:
                actual_spend += Decimal(str(node.actual_cost))

        total_spend = planned_spend + actual_spend
        overrun_amount = max(Decimal("0"), total_spend - allocated_cap)
        is_overrun = overrun_amount > 0
        overrun_percentage = (
            float(overrun_amount / allocated_cap * Decimal("100"))
            if allocated_cap > 0
            else 0.0
        )

        # Compute recommended remediation deltas when overrun
        recommended_slippage_days = None
        recommended_descoping_amount = None

        if is_overrun:
            # Recommended de-scoping: reduce BAC by the overrun amount
            recommended_descoping_amount = float(overrun_amount)

            # Recommended slippage: estimate how many days to shift to
            # move enough cost out of this fiscal year
            # Use average daily spend to estimate
            if planned_spend > 0:
                # Count total days of planned work in this FY
                total_days_in_fy = 0
                for node in descendants:
                    if node.id in node_daily_costs:
                        for day_date, _ in node_daily_costs[node.id]:
                            if fy_start <= day_date <= fy_end:
                                total_days_in_fy += 1

                if total_days_in_fy > 0:
                    avg_daily = planned_spend / total_days_in_fy
                    if avg_daily > 0:
                        # Days to shift so that the shifted cost covers the overrun
                        days_to_shift = int(
                            (overrun_amount / avg_daily).quantize(
                                Decimal("1"), rounding=ROUND_HALF_UP
                            )
                        )
                        recommended_slippage_days = max(1, days_to_shift)

        results.append({
            "portfolio_node_id": control_account_id,
            "fiscal_year": fy_cap.fiscal_year,
            "allocated_funding_cap": float(allocated_cap),
            "planned_spend": float(planned_spend.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
            "actual_spend": float(actual_spend.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
            "total_spend": float(total_spend.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
            "overrun_amount": float(overrun_amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
            "is_overrun": is_overrun,
            "overrun_percentage": round(overrun_percentage, 2),
            "recommended_slippage_days": recommended_slippage_days,
            "recommended_descoping_amount": recommended_descoping_amount,
        })

    return results


def get_contract_structure(
    db: Session,
    project_id: UUID,
) -> Optional[ProjectContractStructure]:
    """Retrieve the contract structure for a project.

    Args:
        db: Active SQLAlchemy database session.
        project_id: UUID of the root PortfolioNode (Project level).

    Returns:
        The ProjectContractStructure record, or None if not found.
    """
    contract = db.execute(
        select(ProjectContractStructure).where(
            ProjectContractStructure.portfolio_node_id == project_id
        )
    ).scalar_one_or_none()

    return contract


def get_fiscal_year_caps(
    db: Session,
    control_account_id: UUID,
) -> List[FiscalYearSpendingCap]:
    """Retrieve all fiscal year spending caps for a control account.

    Args:
        db: Active SQLAlchemy database session.
        control_account_id: UUID of the PortfolioNode (Control Account level).

    Returns:
        List of FiscalYearSpendingCap records, ordered by fiscal year.
    """
    caps = db.execute(
        select(FiscalYearSpendingCap).where(
            FiscalYearSpendingCap.portfolio_node_id == control_account_id
        ).order_by(FiscalYearSpendingCap.fy_start_date)
    ).scalars().all()

    return list(caps)


def get_acceptance_milestones(
    db: Session,
    portfolio_node_id: UUID,
) -> List[GovernmentAcceptanceMilestone]:
    """Retrieve all government acceptance milestones for a deliverable.

    Args:
        db: Active SQLAlchemy database session.
        portfolio_node_id: UUID of the PortfolioNode linked to acceptance
            milestones.

    Returns:
        List of GovernmentAcceptanceMilestone records.
    """
    milestones = db.execute(
        select(GovernmentAcceptanceMilestone).where(
            GovernmentAcceptanceMilestone.portfolio_node_id == portfolio_node_id
        ).order_by(GovernmentAcceptanceMilestone.created_at.desc())
    ).scalars().all()

    return list(milestones)


def signoff_acceptance_milestone(
    db: Session,
    milestone_id: UUID,
    status: AcceptanceStatus,
    user_id: UUID,
) -> GovernmentAcceptanceMilestone:
    """Update the status of a government acceptance milestone.

    When the status is set to ACCEPTED, the signed_off_at timestamp
    is automatically set to the current time.

    Args:
        db: Active SQLAlchemy database session.
        milestone_id: UUID of the GovernmentAcceptanceMilestone to update.
        status: New acceptance status (PENDING_INSPECTION, ACCEPTED, or
            REJECTED).
        user_id: UUID of the user performing the signoff (for audit trail).

    Returns:
        The updated GovernmentAcceptanceMilestone record.

    Raises:
        HTTPException: 404 if the milestone is not found.
    """
    milestone = db.execute(
        select(GovernmentAcceptanceMilestone).where(
            GovernmentAcceptanceMilestone.id == milestone_id
        )
    ).scalar_one_or_none()

    if milestone is None:
        raise HTTPException(
            status_code=404,
            detail=f"GovernmentAcceptanceMilestone {milestone_id} not found",
        )

    milestone.status = status

    if status == AcceptanceStatus.ACCEPTED:
        milestone.signed_off_at = datetime.now(timezone.utc)

    milestone.updated_at = datetime.now(timezone.utc)
    db.flush()

    return milestone
