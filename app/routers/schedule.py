"""Schedule recalculation and export router.

Provides the CPM (Critical Path Method) recalculation endpoint, Monte Carlo
Schedule Risk Analysis, and schedule export endpoints for Primavera P6 (.xer)
and Microsoft Project (.xml) formats.  Export endpoints support defence export
sanitization options to redact classified data and mask commercial rates.

Sub-Tree Locking
~~~~~~~~~~~~~~~~

The CPM recalculation endpoint acquires a sub-tree lock before running the
forward and backward passes.  This prevents concurrent mutations (e.g., a
user editing node dates) from corrupting the calculation.  If a lock is
already held, HTTP 423 (Locked) is returned.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from uuid import UUID
import asyncio

from app.database import get_db
from app.models.models import User, UniversalBreakdownNode, LockOperationType
from app.schemas.schemas import (
    CPMResultResponse,
    MonteCarloRequest,
    MonteCarloResultResponse,
)
from app.services.cpm_engine import calculate_cpm
from app.services.monte_carlo import run_schedule_simulation
from app.services.export_p6 import export_to_xer
from app.services.export_msp import export_to_msp_xml
from app.services.lock_manager import acquire_subtree_lock, check_path_lock
from app.utils.auth import get_current_user

router = APIRouter(prefix="/v1/schedule", tags=["Schedule"])


@router.get(
    "/{project_id}/recalculate-cpm",
    response_model=CPMResultResponse,
    summary="Recalculate CPM schedule for a project (GET)",
)
@router.post(
    "/{project_id}/recalculate-cpm",
    response_model=CPMResultResponse,
    summary="Recalculate CPM schedule for a project",
    description=(
        "Builds a Directed Acyclic Graph from PortfolioNode records and "
        "DependencyLink edges, performs forward and backward passes to compute "
        "ES/EF/LS/LF, identifies the critical path, runs DCMA 14-Point integrity "
        "checks, and updates node custom_attributes with the calculated metrics.\n\n"
        "This endpoint acquires a sub-tree lock before calculation to prevent "
        "concurrent mutations.  If another operation is already running on this "
        "sub-tree, HTTP 423 (Locked) is returned."
    ),
)
def recalculate_cpm(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Recalculate the full CPM schedule for the given project root node.
    
    Acquires a sub-tree lock on the project's ltree path before running
    the forward and backward passes to prevent concurrent mutations.
    """
    # Find the root node to get its ltree path
    root_node = db.query(UniversalBreakdownNode).filter(
        UniversalBreakdownNode.id == project_id
    ).first()
    
    if not root_node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project node {project_id} not found",
        )
    
    root_path = root_node.path
    
    try:
        # Acquire sub-tree lock and run CPM
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(
                _run_cpm_with_lock(db, root_path, project_id, current_user.id)
            )
        finally:
            loop.close()
        
        # Re-run calculate_cpm to get the result (lock was held during the above)
        result = calculate_cpm(db, project_id)
        return result
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"CPM calculation failed: {str(exc)}",
        )


async def _run_cpm_with_lock(
    db: Session,
    root_path: str,
    project_id: UUID,
    user_id: int,
) -> None:
    """Run CPM calculation within a sub-tree lock.
    
    Parameters
    ----------
    db : Session
        Database session.
    root_path : str
        Ltree path of the project root.
    project_id : UUID
        UUID of the project root node.
    user_id : int
        ID of the user initiating the calculation.
    """
    async with acquire_subtree_lock(
        db, root_path, LockOperationType.CPM_RECALCULATION, user_id, ttl_seconds=60
    ):
        calculate_cpm(db, project_id)


@router.post(
    "/{project_id}/monte-carlo",
    response_model=MonteCarloResultResponse,
    summary="Run Monte Carlo Schedule Risk Analysis",
    description=(
        "Runs a stochastic Monte Carlo simulation to analyse schedule risk. "
        "For each iteration, activity durations are sampled from Beta-PERT or "
        "Triangular distributions, then a forward and backward pass determines "
        "the project finish date and critical path for that iteration.  The "
        "result includes P50/P80/P90 completion date percentiles, per-activity "
        "Criticality Indices, and distribution points for UI curve plotting."
    ),
)
def run_monte_carlo(
    project_id: UUID,
    request: MonteCarloRequest = MonteCarloRequest(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trigger a Monte Carlo SRA simulation and return the results."""
    try:
        result = run_schedule_simulation(
            db, project_id, iterations=request.iterations, seed=request.seed
        )
        return result
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Monte Carlo simulation failed: {str(exc)}",
        )


@router.get(
    "/{project_id}/export/xer",
    summary="Export project schedule to Primavera P6 .xer format",
    description=(
        "Serialises the live PortfolioNode WBS, activities, DependencyLink "
        "precedence records, and working calendars into the Primavera P6 .xer "
        "batch text format.  Supports defence export sanitization options to "
        "redact classified node names/codes and mask commercial labor rates. "
        "An entry is written to ForensicAuditLog to record the export event."
    ),
)
def export_xer(
    project_id: UUID,
    redact_classified_descriptions: bool = Query(
        False,
        description="If True, redact names/codes of nodes classified SECRET or higher",
    ),
    mask_commercial_labor_rates: bool = Query(
        False,
        description="If True, set all resource rates to 0.00 in the export",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Export the project schedule as a Primavera P6 .xer file."""
    try:
        user_upn = current_user.email or current_user.username or "system"
        xer_content = export_to_xer(
            db,
            project_id,
            user_upn=user_upn,
            redact_classified_descriptions=redact_classified_descriptions,
            mask_commercial_labor_rates=mask_commercial_labor_rates,
        )
        return Response(
            content=xer_content,
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": (
                    f"attachment; filename=project-{project_id}.xer"
                ),
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"XER export failed: {str(exc)}",
        )


@router.get(
    "/{project_id}/export/msp-xml",
    summary="Export project schedule to Microsoft Project XML format",
    description=(
        "Serialises the live PortfolioNode WBS, activities, DependencyLink "
        "precedence records, and resource assignments into the standard "
        "Microsoft Project XML schema.  Supports defence export sanitization "
        "options to redact classified node names/codes and mask commercial "
        "labor rates.  An entry is written to ForensicAuditLog to record "
        "the export event."
    ),
)
def export_msp_xml_endpoint(
    project_id: UUID,
    redact_classified_descriptions: bool = Query(
        False,
        description="If True, redact names/codes of nodes classified SECRET or higher",
    ),
    mask_commercial_labor_rates: bool = Query(
        False,
        description="If True, set all resource rates to 0.00 in the export",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Export the project schedule as a Microsoft Project XML file."""
    try:
        user_upn = current_user.email or current_user.username or "system"
        msp_xml = export_to_msp_xml(
            db,
            project_id,
            user_upn=user_upn,
            redact_classified_descriptions=redact_classified_descriptions,
            mask_commercial_labor_rates=mask_commercial_labor_rates,
        )
        return Response(
            content=msp_xml,
            media_type="application/xml",
            headers={
                "Content-Disposition": (
                    f"attachment; filename=project-{project_id}.xml"
                ),
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"MS Project XML export failed: {str(exc)}",
        )
