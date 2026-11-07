"""Sandbox scenario API router for What-If schedule planning.

This module provides the REST API endpoints for creating, comparing,
and merging sandbox scenarios.  Sandbox scenarios allow planners to
explore "What-If" questions without affecting the live operational
schedule.

Endpoints
~~~~~~~~~

- **POST /api/v1/sandboxes/fork** — Creates a new isolated scenario
  branch by cloning a live WBS sub-tree.
- **GET /api/v1/sandboxes/{id}/diff** — Returns the three-way comparison
  payload (sandbox vs live vs baseline) for UI diff inspection.
- **POST /api/v1/sandboxes/{id}/merge** — Merges selected scenario
  changes into the live operational schedule.

Authentication
~~~~~~~~~~~~~~

All endpoints require a valid JWT token.  The authenticated user's
identity is used for audit logging and access control.

Security
~~~~~~~~

ABAC clearance checks are applied when forking: the user must have
sufficient clearance to access the root node being forked.  The merge
endpoint records a ``SANDBOX_MERGE`` entry in the ForensicAuditLog.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.models import User, SandboxScenario, SandboxScenarioStatus
from app.schemas.schemas import (
    SandboxForkRequest,
    SandboxForkResponse,
    SandboxScenarioResponse,
    SandboxDiffResponse,
    SandboxDiffEntry,
    SandboxMergeRequest,
    SandboxMergeResponse,
)
from app.services.sandboxing import (
    fork_sandbox_branch,
    compute_three_way_diff,
    merge_sandbox_to_live,
)

router = APIRouter()


@router.post(
    "/v1/sandboxes/fork",
    response_model=SandboxForkResponse,
    summary="Fork a live WBS sub-tree into an isolated sandbox scenario",
    description=(
        "Creates a new sandbox scenario by cloning the entire WBS sub-tree "
        "rooted at the specified node.  The cloned nodes are marked as "
        "sandbox branches with sandbox-prefixed ltree paths, so they are "
        "completely isolated from the live operational schedule.  "
        "Dependency links within the sub-tree are also cloned."
    ),
)
def fork_sandbox(
    request: SandboxForkRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new isolated sandbox scenario by forking a live sub-tree.

    Parameters
    ----------
    request : SandboxForkRequest
        Contains the root node ID to fork and the scenario name.
    current_user : User
        The authenticated user creating the sandbox.
    db : Session
        Database session.

    Returns
    -------
    SandboxForkResponse
        Details of the newly created sandbox scenario.

    Raises
    ------
    HTTPException
        404 if the root node is not found.
        400 if the root node is already a sandbox branch.
    """
    try:
        result = fork_sandbox_branch(
            root_node_id=request.root_node_id,
            user_id=current_user.id,
            scenario_name=request.scenario_name,
            description=request.description,
            db=db,
        )
        db.commit()
        return SandboxForkResponse(**result)
    except ValueError as e:
        msg = str(e)
        if "not found" in msg:
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fork sandbox: {str(e)}",
        )


@router.get(
    "/v1/sandboxes/{scenario_id}/diff",
    response_model=SandboxDiffResponse,
    summary="Compute three-way diff for a sandbox scenario",
    description=(
        "Compares the sandbox branch against the current live schedule "
        "and the frozen baseline snapshot.  Each node is categorised as "
        "ADDED, MODIFIED_DATES, MODIFIED_LOGIC, DELETED, or "
        "CONFLICT_LIVE_MUTATED."
    ),
)
def get_sandbox_diff(
    scenario_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the three-way comparison payload for a sandbox scenario.

    Parameters
    ----------
    scenario_id : str
        UUID of the sandbox scenario to diff.
    current_user : User
        The authenticated user requesting the diff.
    db : Session
        Database session.

    Returns
    -------
    SandboxDiffResponse
        Three-way diff with per-node entries and summary counts.

    Raises
    ------
    HTTPException
        404 if the sandbox scenario is not found.
    """
    try:
        result = compute_three_way_diff(
            sandbox_scenario_id=scenario_id,
            db=db,
        )

        # Convert diff entries to Pydantic models
        diff_entries = [SandboxDiffEntry(**entry) for entry in result["diff_entries"]]

        return SandboxDiffResponse(
            scenario_id=result["scenario_id"],
            scenario_name=result["scenario_name"],
            diff_entries=diff_entries,
            summary=result["summary"],
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to compute diff: {str(e)}",
        )


@router.post(
    "/v1/sandboxes/{scenario_id}/merge",
    response_model=SandboxMergeResponse,
    summary="Merge sandbox changes into the live operational schedule",
    description=(
        "Applies approved changes from the sandbox back to live PortfolioNode "
        "records in a single atomic transaction.  Optionally supports cherry-picking "
        "specific nodes.  After merge, CPM is recalculated and a SANDBOX_MERGE "
        "entry is recorded in the ForensicAuditLog.  The scenario status is set "
        "to COMMITTED."
    ),
)
def merge_sandbox(
    scenario_id: str,
    request: Optional[SandboxMergeRequest] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Merge selected sandbox changes into the live schedule.

    Parameters
    ----------
    scenario_id : str
        UUID of the sandbox scenario to merge.
    request : SandboxMergeRequest or None
        Optional cherry-pick list.  If omitted, all sandbox nodes are merged.
    current_user : User
        The authenticated user performing the merge.
    db : Session
        Database session.

    Returns
    -------
    SandboxMergeResponse
        Merge results with counts of updated, added, and deleted nodes.

    Raises
    ------
    HTTPException
        404 if the sandbox scenario is not found.
        400 if the scenario is not in ACTIVE status.
    """
    cherry_picked = None
    if request and request.cherry_picked_node_ids:
        cherry_picked = request.cherry_picked_node_ids

    try:
        result = merge_sandbox_to_live(
            sandbox_scenario_id=scenario_id,
            cherry_picked_node_ids=cherry_picked,
            user_id=current_user.id,
            db=db,
        )
        db.commit()
        return SandboxMergeResponse(**result)
    except ValueError as e:
        db.rollback()
        msg = str(e)
        if "not found" in msg:
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to merge sandbox: {str(e)}",
        )
