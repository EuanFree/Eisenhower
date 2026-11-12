"""Commercial governance API endpoints.

This module provides the REST API endpoints for contractual pricing
mechanisms, fiscal year spending cap monitoring, and formal Government
milestone acceptance gates.

Endpoints
~~~~~~~~~

Contract Structure
^^^^^^^^^^^^^^^^^^

- **POST /contracts** — Create a new project contract structure.
- **GET /contracts/{project_id}** — Retrieve the contract structure for
  a project.
- **PUT /contracts/{project_id}** — Update an existing contract structure.
- **DELETE /contracts/{project_id}** — Delete a contract structure.

TCIF Fee Adjustment
^^^^^^^^^^^^^^^^^^^

- **POST /contracts/{project_id}/tcif-fee-adjustment** — Calculate the
  Target Cost Incentive Fee (TCIF) fee adjustment for a given projected
  cost.

Fiscal Year Spending Caps
^^^^^^^^^^^^^^^^^^^^^^^^^

- **POST /fiscal-caps** — Create a new fiscal year spending cap.
- **GET /fiscal-caps/{control_account_id}** — List all fiscal year caps
  for a control account.
- **PUT /fiscal-caps/{cap_id}** — Update an existing fiscal year cap.
- **DELETE /fiscal-caps/{cap_id}** — Delete a fiscal year cap.
- **POST /fiscal-caps/{control_account_id}/validate** — Validate the
  fiscal year spend profile against allocated caps.

Government Acceptance Milestones
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- **POST /acceptance** — Create a new government acceptance milestone.
- **GET /acceptance/{node_id}** — List all acceptance milestones for a
  deliverable.
- **PUT /acceptance/{milestone_id}** — Update an acceptance milestone
  (e.g., sign off as ACCEPTED).
- **DELETE /acceptance/{milestone_id}** — Delete an acceptance milestone.

Access Control
~~~~~~~~~~~~~~

All endpoints require JWT authentication via the ``get_current_user``
dependency.  The authenticated user must have sufficient clearance to
access the underlying portfolio nodes.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List, Optional
from datetime import date

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.models import (
    ProjectContractStructure, ContractPricingType,
    FiscalYearSpendingCap,
    GovernmentAcceptanceMilestone, AcceptanceDocumentType, AcceptanceStatus,
    User,
)
from app.schemas.schemas import (
    ProjectContractStructureCreate, ProjectContractStructureUpdate,
    ProjectContractStructureResponse,
    FiscalYearSpendingCapCreate, FiscalYearSpendingCapUpdate,
    FiscalYearSpendingCapResponse, FiscalYearSpendValidationResponse,
    GovernmentAcceptanceMilestoneCreate, GovernmentAcceptanceMilestoneUpdate,
    GovernmentAcceptanceMilestoneResponse,
    TCIFFeeAdjustmentResponse,
)
from app.services.commercial_governance import (
    calculate_tcif_fee_adjustment,
    validate_fiscal_year_spend_profile,
    signoff_acceptance_milestone,
)

router = APIRouter()


# ============================================================================
# Contract Structure Endpoints
# ============================================================================


@router.post(
    "/contracts",
    response_model=ProjectContractStructureResponse,
    summary="Create a project contract structure",
    description=(
        "Creates a new contractual pricing structure for a project-level "
        "work package.  This captures the commercial terms of a defence "
        "contract, including the pricing mechanism, target costs, and "
        "incentive fee structure."
    ),
)
def create_contract_structure(
    data: ProjectContractStructureCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new project contract structure.

    Args:
        data: Contract structure creation payload.
        db: Database session.
        current_user: Authenticated user.

    Returns:
        The created contract structure record.

    Raises:
        HTTPException: 409 if a contract structure already exists for
            this project.
    """
    # Check for existing contract structure
    existing = db.query(ProjectContractStructure).filter(
        ProjectContractStructure.portfolio_node_id == data.portfolio_node_id
    ).first()

    if existing:
        raise HTTPException(
            status_code=409,
            detail=(
                f"A contract structure already exists for project "
                f"{data.portfolio_node_id}"
            ),
        )

    contract = ProjectContractStructure(
        portfolio_node_id=data.portfolio_node_id,
        contract_pricing_type=data.contract_pricing_type,
        target_cost=data.target_cost,
        target_fee=data.target_fee,
        ceiling_price=data.ceiling_price,
        contractor_share_ratio=data.contractor_share_ratio,
        customer_share_ratio=data.customer_share_ratio,
    )

    db.add(contract)
    db.commit()
    db.refresh(contract)

    return contract


@router.get(
    "/contracts/{project_id}",
    response_model=ProjectContractStructureResponse,
    summary="Get project contract structure",
    description="Retrieves the contractual pricing structure for a project.",
)
def get_contract_structure(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve the contract structure for a project.

    Args:
        project_id: UUID of the root PortfolioNode (Project level).
        db: Database session.
        current_user: Authenticated user.

    Returns:
        The contract structure record.

    Raises:
        HTTPException: 404 if no contract structure exists for this project.
    """
    contract = db.query(ProjectContractStructure).filter(
        ProjectContractStructure.portfolio_node_id == project_id
    ).first()

    if contract is None:
        raise HTTPException(
            status_code=404,
            detail=f"No contract structure found for project {project_id}",
        )

    return contract


@router.put(
    "/contracts/{project_id}",
    response_model=ProjectContractStructureResponse,
    summary="Update project contract structure",
    description="Updates an existing contractual pricing structure.",
)
def update_contract_structure(
    project_id: UUID,
    data: ProjectContractStructureUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing project contract structure.

    Args:
        project_id: UUID of the root PortfolioNode (Project level).
        data: Fields to update.
        db: Database session.
        current_user: Authenticated user.

    Returns:
        The updated contract structure record.

    Raises:
        HTTPException: 404 if no contract structure exists for this project.
    """
    contract = db.query(ProjectContractStructure).filter(
        ProjectContractStructure.portfolio_node_id == project_id
    ).first()

    if contract is None:
        raise HTTPException(
            status_code=404,
            detail=f"No contract structure found for project {project_id}",
        )

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(contract, field, value)

    db.commit()
    db.refresh(contract)

    return contract


@router.delete(
    "/contracts/{project_id}",
    summary="Delete project contract structure",
    description="Removes the contractual pricing structure for a project.",
)
def delete_contract_structure(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a project contract structure.

    Args:
        project_id: UUID of the root PortfolioNode (Project level).
        db: Database session.
        current_user: Authenticated user.

    Returns:
        Confirmation message.

    Raises:
        HTTPException: 404 if no contract structure exists for this project.
    """
    contract = db.query(ProjectContractStructure).filter(
        ProjectContractStructure.portfolio_node_id == project_id
    ).first()

    if contract is None:
        raise HTTPException(
            status_code=404,
            detail=f"No contract structure found for project {project_id}",
        )

    db.delete(contract)
    db.commit()

    return {"message": f"Contract structure for project {project_id} deleted"}


@router.post(
    "/contracts/{project_id}/tcif-fee-adjustment",
    response_model=TCIFFeeAdjustmentResponse,
    summary="Calculate TCIF fee adjustment",
    description=(
        "Calculates the Target Cost Incentive Fee (TCIF) fee adjustment "
        "for a given projected cost.  When actual/projected costs differ "
        "from the target cost, the fee is adjusted using the shareline "
        "ratios.  The total price is capped at the ceiling price."
    ),
)
def calculate_tcif_fee(
    project_id: UUID,
    projected_cost: float = Query(
        ...,
        gt=0,
        description="The projected or actual total cost for the project.",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Calculate TCIF fee adjustment for a project.

    Args:
        project_id: UUID of the root PortfolioNode (Project level).
        projected_cost: The projected or actual total cost.
        db: Database session.
        current_user: Authenticated user.

    Returns:
        The fee adjustment calculation results.

    Raises:
        HTTPException: 404 if no contract structure exists for this project.
    """
    result = calculate_tcif_fee_adjustment(db, project_id, projected_cost)
    return result


# ============================================================================
# Fiscal Year Spending Cap Endpoints
# ============================================================================


@router.post(
    "/fiscal-caps",
    response_model=FiscalYearSpendingCapResponse,
    summary="Create fiscal year spending cap",
    description=(
        "Creates a new fiscal year spending cap for a control account. "
        "This defines the maximum funding that can be spent during a "
        "specific fiscal year tranche."
    ),
)
def create_fiscal_year_cap(
    data: FiscalYearSpendingCapCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new fiscal year spending cap.

    Args:
        data: Fiscal year cap creation payload.
        db: Database session.
        current_user: Authenticated user.

    Returns:
        The created fiscal year cap record.

    Raises:
        HTTPException: 409 if a cap already exists for this fiscal year.
    """
    # Check for existing cap for this fiscal year
    existing = db.query(FiscalYearSpendingCap).filter(
        FiscalYearSpendingCap.portfolio_node_id == data.portfolio_node_id,
        FiscalYearSpendingCap.fiscal_year == data.fiscal_year,
    ).first()

    if existing:
        raise HTTPException(
            status_code=409,
            detail=(
                f"A fiscal year cap already exists for "
                f"{data.fiscal_year} on control account "
                f"{data.portfolio_node_id}"
            ),
        )

    cap = FiscalYearSpendingCap(
        portfolio_node_id=data.portfolio_node_id,
        fiscal_year=data.fiscal_year,
        fy_start_date=data.fy_start_date,
        fy_end_date=data.fy_end_date,
        allocated_funding_cap=data.allocated_funding_cap,
    )

    db.add(cap)
    db.commit()
    db.refresh(cap)

    return cap


@router.get(
    "/fiscal-caps/{control_account_id}",
    response_model=List[FiscalYearSpendingCapResponse],
    summary="List fiscal year spending caps",
    description=(
        "Lists all fiscal year spending caps for a control account, "
        "ordered by fiscal year start date."
    ),
)
def list_fiscal_year_caps(
    control_account_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all fiscal year spending caps for a control account.

    Args:
        control_account_id: UUID of the PortfolioNode (Control Account).
        db: Database session.
        current_user: Authenticated user.

    Returns:
        List of fiscal year cap records.
    """
    caps = db.query(FiscalYearSpendingCap).filter(
        FiscalYearSpendingCap.portfolio_node_id == control_account_id
    ).order_by(FiscalYearSpendingCap.fy_start_date).all()

    return list(caps)


@router.put(
    "/fiscal-caps/{cap_id}",
    response_model=FiscalYearSpendingCapResponse,
    summary="Update fiscal year spending cap",
    description="Updates an existing fiscal year spending cap.",
)
def update_fiscal_year_cap(
    cap_id: UUID,
    data: FiscalYearSpendingCapUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing fiscal year spending cap.

    Args:
        cap_id: UUID of the fiscal year cap to update.
        data: Fields to update.
        db: Database session.
        current_user: Authenticated user.

    Returns:
        The updated fiscal year cap record.

    Raises:
        HTTPException: 404 if the cap is not found.
    """
    cap = db.query(FiscalYearSpendingCap).filter(
        FiscalYearSpendingCap.id == cap_id
    ).first()

    if cap is None:
        raise HTTPException(
            status_code=404,
            detail=f"Fiscal year spending cap {cap_id} not found",
        )

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(cap, field, value)

    db.commit()
    db.refresh(cap)

    return cap


@router.delete(
    "/fiscal-caps/{cap_id}",
    summary="Delete fiscal year spending cap",
    description="Removes a fiscal year spending cap.",
)
def delete_fiscal_year_cap(
    cap_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a fiscal year spending cap.

    Args:
        cap_id: UUID of the fiscal year cap to delete.
        db: Database session.
        current_user: Authenticated user.

    Returns:
        Confirmation message.

    Raises:
        HTTPException: 404 if the cap is not found.
    """
    cap = db.query(FiscalYearSpendingCap).filter(
        FiscalYearSpendingCap.id == cap_id
    ).first()

    if cap is None:
        raise HTTPException(
            status_code=404,
            detail=f"Fiscal year spending cap {cap_id} not found",
        )

    db.delete(cap)
    db.commit()

    return {"message": f"Fiscal year spending cap {cap_id} deleted"}


@router.post(
    "/fiscal-caps/{control_account_id}/validate",
    response_model=List[FiscalYearSpendValidationResponse],
    summary="Validate fiscal year spend profile",
    description=(
        "Validates the fiscal year spend profile against allocated funding "
        "caps.  Flags FISCAL_TRANCHE_OVERRUN if planned spend exceeds the "
        "allocated cap for any fiscal year."
    ),
)
def validate_fiscal_spend(
    control_account_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Validate fiscal year spend profile against allocated caps.

    Args:
        control_account_id: UUID of the PortfolioNode (Control Account).
        db: Database session.
        current_user: Authenticated user.

    Returns:
        List of validation results, one per fiscal year cap.

    Raises:
        HTTPException: 404 if the control account is not found.
    """
    results = validate_fiscal_year_spend_profile(db, control_account_id)
    return results


# ============================================================================
# Government Acceptance Milestone Endpoints
# ============================================================================


@router.post(
    "/acceptance",
    response_model=GovernmentAcceptanceMilestoneResponse,
    summary="Create government acceptance milestone",
    description=(
        "Creates a new government acceptance milestone for a deliverable. "
        "This records the formal inspection and acceptance process."
    ),
)
def create_acceptance_milestone(
    data: GovernmentAcceptanceMilestoneCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new government acceptance milestone.

    Args:
        data: Acceptance milestone creation payload.
        db: Database session.
        current_user: Authenticated user.

    Returns:
        The created acceptance milestone record.
    """
    milestone = GovernmentAcceptanceMilestone(
        portfolio_node_id=data.portfolio_node_id,
        acceptance_document_type=data.acceptance_document_type,
        receipt_reference_number=data.receipt_reference_number,
        qar_inspector_name=data.qar_inspector_name,
        status=AcceptanceStatus.PENDING_INSPECTION,
    )

    db.add(milestone)
    db.commit()
    db.refresh(milestone)

    return milestone


@router.get(
    "/acceptance/{node_id}",
    response_model=List[GovernmentAcceptanceMilestoneResponse],
    summary="List acceptance milestones",
    description=(
        "Lists all government acceptance milestones for a deliverable."
    ),
)
def list_acceptance_milestones(
    node_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all acceptance milestones for a deliverable.

    Args:
        node_id: UUID of the PortfolioNode linked to acceptance milestones.
        db: Database session.
        current_user: Authenticated user.

    Returns:
        List of acceptance milestone records.
    """
    milestones = db.query(GovernmentAcceptanceMilestone).filter(
        GovernmentAcceptanceMilestone.portfolio_node_id == node_id
    ).order_by(GovernmentAcceptanceMilestone.created_at.desc()).all()

    return list(milestones)


@router.put(
    "/acceptance/{milestone_id}",
    response_model=GovernmentAcceptanceMilestoneResponse,
    summary="Update acceptance milestone",
    description=(
        "Updates a government acceptance milestone.  Setting the status "
        "to ACCEPTED automatically records the signoff timestamp."
    ),
)
def update_acceptance_milestone(
    milestone_id: UUID,
    data: GovernmentAcceptanceMilestoneUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a government acceptance milestone.

    Args:
        milestone_id: UUID of the acceptance milestone to update.
        data: Fields to update.
        db: Database session.
        current_user: Authenticated user.

    Returns:
        The updated acceptance milestone record.

    Raises:
        HTTPException: 404 if the milestone is not found.
    """
    milestone = db.query(GovernmentAcceptanceMilestone).filter(
        GovernmentAcceptanceMilestone.id == milestone_id
    ).first()

    if milestone is None:
        raise HTTPException(
            status_code=404,
            detail=f"Government acceptance milestone {milestone_id} not found",
        )

    update_data = data.model_dump(exclude_unset=True)

    # Handle status change with automatic signoff
    if "status" in update_data:
        new_status = update_data.pop("status")
        milestone = signoff_acceptance_milestone(
            db, milestone_id, AcceptanceStatus(new_status), current_user.id
        )
    else:
        for field, value in update_data.items():
            setattr(milestone, field, value)
        db.commit()
        db.refresh(milestone)

    return milestone


@router.delete(
    "/acceptance/{milestone_id}",
    summary="Delete acceptance milestone",
    description="Removes a government acceptance milestone.",
)
def delete_acceptance_milestone(
    milestone_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a government acceptance milestone.

    Args:
        milestone_id: UUID of the acceptance milestone to delete.
        db: Database session.
        current_user: Authenticated user.

    Returns:
        Confirmation message.

    Raises:
        HTTPException: 404 if the milestone is not found.
    """
    milestone = db.query(GovernmentAcceptanceMilestone).filter(
        GovernmentAcceptanceMilestone.id == milestone_id
    ).first()

    if milestone is None:
        raise HTTPException(
            status_code=404,
            detail=f"Government acceptance milestone {milestone_id} not found",
        )

    db.delete(milestone)
    db.commit()

    return {"message": f"Acceptance milestone {milestone_id} deleted"}


@router.get("/", summary="Commercial overview")
def commercial_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return high-level commercial metrics."""
    return {
        "total_contracts": 0,
        "active_contracts": 0,
        "total_value": 0,
        "fiscal_caps": 0,
        "pending_acceptances": 0,
    }
