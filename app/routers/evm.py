"""EVM (Earned Value Management) API router.

This module provides the REST API endpoints for ANSI/EIA-748 Earned Value
Management.  It enables programme managers to:

- View S-Curve data for charting cumulative PV, EV, and AC over time.
- Inspect task-level EVM breakdowns with variances and performance indices.
- Manage milestone weight steps for the MILESTONE_WEIGHTS EVM technique.
- Verify milestone checkpoints, triggering automatic EV recalculation.

S-Curve Charting
~~~~~~~~~~~~~~~~

The S-Curve endpoint returns time-phased data points that the frontend
can plot as cumulative curves.  Three lines are typically shown:

- **Planned Value (PV)** — The baseline schedule in monetary terms.
- **Earned Value (EV)** — The actual work performed in budgeted terms.
- **Actual Cost (AC)** — The real cost incurred.

The gap between PV and EV shows schedule variance, while the gap between
EV and AC shows cost variance.

Milestone Weight Steps
~~~~~~~~~~~~~~~~~~~~~~

For tasks using the MILESTONE_WEIGHTS EVM technique, milestone steps
define the checkpoints at which EV is earned.  Each step has a weight
fraction, and the sum of all weights must equal 1.000.

When a milestone is verified as passed, the task's EV is automatically
recalculated based on the sum of verified weights.

Authentication
~~~~~~~~~~~~~~

All endpoints require JWT authentication via the ``get_current_user``
dependency.  Users must have appropriate clearance to access the
portfolio nodes they query.

Endpoints
~~~~~~~~~

- ``GET /projects/{id}/s-curve-data`` — S-Curve charting data.
- ``GET /projects/{id}/evm-rollup`` — Hierarchical EVM rollup.
- ``GET /tasks/{id}/cost-breakdown`` — Task-level EVM breakdown.
- ``POST /tasks/{id}/calculate-ev`` — Recalculate EV for a task.
- ``GET /tasks/{id}/milestone-steps`` — List milestone weight steps.
- ``POST /tasks/{id}/milestone-steps`` — Create a milestone step.
- ``PUT /tasks/{id}/milestone-steps/{step_id}`` — Update a milestone step.
- ``DELETE /tasks/{id}/milestone-steps/{step_id}`` — Delete a milestone step.
- ``POST /tasks/{id}/milestone-steps/{step_id}/verify`` — Verify a milestone.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.models import User, PortfolioNode, MilestoneWeightStep, EVMTechnique
from app.schemas.schemas import (
    MilestoneWeightStepCreate,
    MilestoneWeightStepUpdate,
    MilestoneWeightStepResponse,
    MilestoneWeightStepListResponse,
    EVMTaskBreakdownResponse,
    EVMSCurveResponse,
    EVMRollupResponse,
    EVMRollupListResponse,
)
from app.services.evm_calculator import (
    calculate_task_earned_value,
    evm_rollup,
    generate_s_curve_data,
    validate_milestone_weights,
    verify_milestone_step,
)

router = APIRouter()


# ============================================================================
# S-Curve and Rollup Endpoints
# ============================================================================

@router.get("/projects/{project_id}/s-curve-data")
def get_s_curve_data(
    project_id: str,
    period_days: int = Query(7, ge=1, le=30, description="Days between data points"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve time-phased S-Curve data for a project.

    Returns cumulative Planned Value, Earned Value, and Actual Cost
    data points over the project timeline.  The frontend uses these
    points to chart the classic EVM S-Curve.

    Parameters
    ----------
    project_id : str
        UUID of the root project PortfolioNode.
    period_days : int
        Number of days between data points (default 7 for weekly).
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    dict
        S-Curve data with project metadata and time-phased curve points.

    Raises
    ------
    HTTPException
        404 if the project is not found.
        500 if S-Curve generation fails.
    """
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    node = db.query(PortfolioNode).filter(PortfolioNode.id == project_uuid).first()
    if node is None:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        result = generate_s_curve_data(project_uuid, db, period_days)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate S-Curve data: {str(e)}")


@router.get("/projects/{project_id}/evm-rollup")
def get_evm_rollup(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve hierarchical EVM rollup for a project.

    Aggregates PV, EV, and AC values at each level of the WBS hierarchy,
    from Programme down to individual tasks.  Each level includes
    computed variances and performance indices.

    Parameters
    ----------
    project_id : str
        UUID of the root project PortfolioNode.
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    dict
        Hierarchical rollup data with one entry per WBS level.

    Raises
    ------
    HTTPException
        404 if the project is not found.
        500 if rollup computation fails.
    """
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    node = db.query(PortfolioNode).filter(PortfolioNode.id == project_uuid).first()
    if node is None:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        rollup_data = evm_rollup(project_uuid, db)
        return {
            "root_node_id": project_id,
            "levels": rollup_data,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compute EVM rollup: {str(e)}")


# ============================================================================
# Task-Level EVM Endpoints
# ============================================================================

@router.get("/tasks/{task_id}/cost-breakdown")
def get_task_cost_breakdown(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve the complete EVM breakdown for a single task.

    Returns all EVM values (BAC, PV, EV, AC), the assigned EVM technique,
    and derived variances and performance indices (CV, SV, CPI, SPI, EAC).

    Parameters
    ----------
    task_id : str
        UUID of the PortfolioNode task.
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    dict
        Complete EVM breakdown for the task.

    Raises
    ------
    HTTPException
        404 if the task is not found.
    """
    try:
        task_uuid = UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid task ID format")

    node = db.query(PortfolioNode).filter(PortfolioNode.id == task_uuid).first()
    if node is None:
        raise HTTPException(status_code=404, detail="Task not found")

    result = calculate_task_earned_value(task_uuid, db)
    db.commit()

    return {
        "node_id": str(node.id),
        "code": node.code,
        "name": node.name,
        "evm_technique": result["evm_technique"],
        "bac_cost": result["bac_cost"],
        "planned_value": result["planned_value"],
        "earned_value": result["earned_value"],
        "actual_cost": result["actual_cost"],
        "cost_variance": result["cost_variance"],
        "schedule_variance": result["schedule_variance"],
        "cpi": result["cpi"],
        "spi": result["spi"],
        "eac": result["eac"],
        "percent_complete": node.percent_complete,
    }


@router.post("/tasks/{task_id}/calculate-ev")
def recalculate_task_ev(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Recalculate Earned Value for a task using its assigned EVM technique.

    Triggers a fresh EV calculation based on the task's current state
    (dates, progress, milestone verifications) and the assigned EVM
    technique.  The result is persisted to the database.

    Parameters
    ----------
    task_id : str
        UUID of the PortfolioNode task.
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    dict
        Updated EVM values after recalculation.

    Raises
    ------
    HTTPException
        404 if the task is not found.
        500 if calculation fails.
    """
    try:
        task_uuid = UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid task ID format")

    node = db.query(PortfolioNode).filter(PortfolioNode.id == task_uuid).first()
    if node is None:
        raise HTTPException(status_code=404, detail="Task not found")

    try:
        result = calculate_task_earned_value(task_uuid, db)
        db.commit()
        return result
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to calculate EV: {str(e)}")


# ============================================================================
# Milestone Weight Step Endpoints
# ============================================================================

@router.get("/tasks/{task_id}/milestone-steps")
def list_milestone_steps(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all milestone weight steps for a task.

    Returns the complete set of milestone checkpoints, including their
    weight fractions, verification status, and summary statistics.

    Parameters
    ----------
    task_id : str
        UUID of the PortfolioNode task.
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    dict
        Milestone steps with summary statistics (total_weight,
        verified_weight, earned_value_fraction).

    Raises
    ------
    HTTPException
        404 if the task is not found.
    """
    try:
        task_uuid = UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid task ID format")

    node = db.query(PortfolioNode).filter(PortfolioNode.id == task_uuid).first()
    if node is None:
        raise HTTPException(status_code=404, detail="Task not found")

    steps = db.query(MilestoneWeightStep).filter(
        MilestoneWeightStep.portfolio_node_id == task_uuid
    ).order_by(MilestoneWeightStep.target_date).all()

    total_weight = sum(float(step.weight_fraction) for step in steps)
    verified_weight = sum(
        float(step.weight_fraction)
        for step in steps
        if step.is_verified_passed
    )

    step_responses = []
    for step in steps:
        step_responses.append({
            "id": str(step.id),
            "portfolio_node_id": str(step.portfolio_node_id),
            "step_name": step.step_name,
            "weight_fraction": float(step.weight_fraction),
            "target_date": step.target_date.isoformat() if step.target_date else None,
            "is_verified_passed": step.is_verified_passed,
            "verified_at": step.verified_at.isoformat() if step.verified_at else None,
            "verified_by_user_id": step.verified_by_user_id,
        })

    return {
        "steps": step_responses,
        "total_weight": round(total_weight, 3),
        "verified_weight": round(verified_weight, 3),
        "earned_value_fraction": round(verified_weight, 3),
    }


@router.post("/tasks/{task_id}/milestone-steps", status_code=201)
def create_milestone_step(
    task_id: str,
    step_data: MilestoneWeightStepCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new milestone weight step for a task.

    Adds a new checkpoint to the task's milestone weight definition.
    After creation, the system validates that all weights sum to 1.000.

    Parameters
    ----------
    task_id : str
        UUID of the PortfolioNode task.
    step_data : MilestoneWeightStepCreate
        Milestone step data (name, weight, target date).
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    dict
        The newly created milestone step.

    Raises
    ------
    HTTPException
        404 if the task is not found.
        400 if milestone weights don't sum to 1.0 after creation.
    """
    try:
        task_uuid = UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid task ID format")

    node = db.query(PortfolioNode).filter(PortfolioNode.id == task_uuid).first()
    if node is None:
        raise HTTPException(status_code=404, detail="Task not found")

    step = MilestoneWeightStep(
        portfolio_node_id=task_uuid,
        step_name=step_data.step_name,
        weight_fraction=step_data.weight_fraction,
        target_date=step_data.target_date,
    )

    db.add(step)
    db.flush()

    # Validate weights sum to 1.0
    is_valid, message = validate_milestone_weights(task_uuid, db)
    if not is_valid:
        db.rollback()
        raise HTTPException(status_code=400, detail=message)

    db.commit()
    db.refresh(step)

    return {
        "id": str(step.id),
        "portfolio_node_id": str(step.portfolio_node_id),
        "step_name": step.step_name,
        "weight_fraction": float(step.weight_fraction),
        "target_date": step.target_date.isoformat() if step.target_date else None,
        "is_verified_passed": step.is_verified_passed,
        "verified_at": None,
        "verified_by_user_id": None,
    }


@router.put("/tasks/{task_id}/milestone-steps/{step_id}")
def update_milestone_step(
    task_id: str,
    step_id: str,
    step_data: MilestoneWeightStepUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing milestone weight step.

    Partially updates the milestone step.  If ``is_verified_passed``
    is set to True, the step is verified and EV is recalculated.

    Parameters
    ----------
    task_id : str
        UUID of the PortfolioNode task.
    step_id : str
        UUID of the MilestoneWeightStep to update.
    step_data : MilestoneWeightStepUpdate
        Fields to update.
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    dict
        The updated milestone step.

    Raises
    ------
    HTTPException
        404 if the step is not found.
        400 if weight update causes invalid total.
    """
    try:
        task_uuid = UUID(task_id)
        step_uuid = UUID(step_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    step = db.query(MilestoneWeightStep).filter(
        MilestoneWeightStep.id == step_uuid,
        MilestoneWeightStep.portfolio_node_id == task_uuid,
    ).first()

    if step is None:
        raise HTTPException(status_code=404, detail="Milestone step not found")

    # Update fields
    if step_data.step_name is not None:
        step.step_name = step_data.step_name
    if step_data.weight_fraction is not None:
        step.weight_fraction = step_data.weight_fraction
    if step_data.target_date is not None:
        step.target_date = step_data.target_date

    # Handle verification
    if step_data.is_verified_passed is True:
        from datetime import datetime, timezone
        step.is_verified_passed = True
        step.verified_at = datetime.now(timezone.utc)
        step.verified_by_user_id = step_data.verified_by_user_id or current_user.id

        # Recalculate EV if using MILESTONE_WEIGHTS
        node = db.query(PortfolioNode).filter(PortfolioNode.id == task_uuid).first()
        if node and node.evm_technique == EVMTechnique.MILESTONE_WEIGHTS:
            calculate_task_earned_value(task_uuid, db)

    # Validate weights
    is_valid, message = validate_milestone_weights(task_uuid, db)
    if not is_valid:
        db.rollback()
        raise HTTPException(status_code=400, detail=message)

    db.commit()
    db.refresh(step)

    return {
        "id": str(step.id),
        "portfolio_node_id": str(step.portfolio_node_id),
        "step_name": step.step_name,
        "weight_fraction": float(step.weight_fraction),
        "target_date": step.target_date.isoformat() if step.target_date else None,
        "is_verified_passed": step.is_verified_passed,
        "verified_at": step.verified_at.isoformat() if step.verified_at else None,
        "verified_by_user_id": step.verified_by_user_id,
    }


@router.delete("/tasks/{task_id}/milestone-steps/{step_id}")
def delete_milestone_step(
    task_id: str,
    step_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a milestone weight step.

    Removes a milestone checkpoint from the task's definition.
    Note: deleting a step will likely cause the weight sum to
    deviate from 1.000, which may affect EV calculation.

    Parameters
    ----------
    task_id : str
        UUID of the PortfolioNode task.
    step_id : str
        UUID of the MilestoneWeightStep to delete.
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    dict
        Confirmation of deletion.

    Raises
    ------
    HTTPException
        404 if the step is not found.
    """
    try:
        task_uuid = UUID(task_id)
        step_uuid = UUID(step_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    step = db.query(MilestoneWeightStep).filter(
        MilestoneWeightStep.id == step_uuid,
        MilestoneWeightStep.portfolio_node_id == task_uuid,
    ).first()

    if step is None:
        raise HTTPException(status_code=404, detail="Milestone step not found")

    db.delete(step)
    db.commit()

    return {"deleted": True, "step_id": step_id}


@router.post("/tasks/{task_id}/milestone-steps/{step_id}/verify")
def verify_milestone(
    task_id: str,
    step_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Verify a milestone step as passed.

    Marks the milestone as verified, records the verification timestamp
    and user, and automatically recalculates the task's Earned Value
    if it uses the MILESTONE_WEIGHTS technique.

    Parameters
    ----------
    task_id : str
        UUID of the PortfolioNode task.
    step_id : str
        UUID of the MilestoneWeightStep to verify.
    db : Session
        Database session.
    current_user : User
        Authenticated user performing the verification.

    Returns
    -------
    dict
        Updated milestone step data and recalculated EV.

    Raises
    ------
    HTTPException
        404 if the step is not found.
        500 if verification fails.
    """
    try:
        task_uuid = UUID(task_id)
        step_uuid = UUID(step_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    step = db.query(MilestoneWeightStep).filter(
        MilestoneWeightStep.id == step_uuid,
        MilestoneWeightStep.portfolio_node_id == task_uuid,
    ).first()

    if step is None:
        raise HTTPException(status_code=404, detail="Milestone step not found")

    try:
        result = verify_milestone_step(step_uuid, current_user.id, db)
        db.commit()
        return result
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to verify milestone: {str(e)}")


@router.get("/data", summary="EVM data overview with key metrics")
def get_evm_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return high-level EVM metrics across all projects."""
    nodes = db.query(PortfolioNode).all()
    total_tasks = len(nodes)
    total_bac = 0.0
    total_ev = 0.0
    total_ac = 0.0
    total_pv = 0.0
    for n in nodes:
        total_bac += float(n.bac_cost or 0)
        total_ev += float(n.earned_value or 0)
        total_ac += float(n.actual_cost or 0)
        total_pv += float(n.planned_value or 0)

    cpi = round(total_ev / total_ac, 3) if total_ac else 0
    spi = round(total_ev / total_pv, 3) if total_pv else 0
    eac = round(total_bac / cpi, 2) if cpi else total_bac

    return {
        "total_tasks": total_tasks,
        "budget_at_completion": total_bac,
        "earned_value": total_ev,
        "actual_cost": total_ac,
        "planned_value": total_pv,
        "cost_performance_index": cpi,
        "schedule_performance_index": spi,
        "estimate_at_completion": eac,
        "variance_at_completion": round(total_bac - eac, 2) if cpi else 0,
        "cost_variance": round(total_ev - total_ac, 2),
        "schedule_variance": round(total_ev - total_pv, 2),
    }
