"""Schedule clash detection and resource leveling router.

Provides endpoints for:

- **Listing active clashes** — Retrieve unresolved schedule conflicts
  detected by the clash daemon, filtered by severity.
- **Running a portfolio sweep** — Trigger a new audit pass to detect
  resource overallocations, clearance lapses, facility collisions,
  negative float slips, and predecessor violations.
- **Computing a leveling proposal** — Run the Burgess-Killebrew
  heuristic to propose date shifts that resolve overallocations
  without extending the critical path.
- **Applying leveling** — Commit signed-off leveling shifts to the
  database in an atomic transaction.

Sub-Tree Locking
~~~~~~~~~~~~~~~~

The ``POST /apply-leveling`` endpoint acquires a sub-tree lock before
committing date shifts.  This prevents concurrent mutations from
interfering with the leveling process.  If a lock is already held,
HTTP 423 (Locked) is returned.

All endpoints require JWT authentication.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional
from uuid import UUID
import asyncio

from app.database import get_db
from app.models.models import User, ClashSeverity, UniversalBreakdownNode, LockOperationType
from app.schemas.schemas import (
    ClashIssueResponse, ClashListResponse, SweepResultResponse,
    LevelingShiftResponse, LevelingProposalResponse, LevelingApplyResponse, LevelingApplyRequest,
)
from app.services.clash_daemon import run_portfolio_sweep, get_active_clashes, resolve_clash
from app.services.leveling import compute_leveling_proposal, apply_leveling
from app.services.lock_manager import acquire_subtree_lock
from app.utils.auth import get_current_user

router = APIRouter(prefix="/v1/schedule/clashes", tags=["Schedule Clashes"])


@router.get(
    "/",
    response_model=ClashListResponse,
    summary="List active schedule clashes",
    description=(
        "Returns all unresolved schedule clashes detected by the clash daemon. "
        "Optionally filter by severity level.  Clashes are ordered by severity "
        "(CRITICAL first) and then by creation time (newest first)."
    ),
)
def list_clashes(
    severity: Optional[str] = Query(
        None,
        description="Filter by severity: CRITICAL, MAJOR, or ADVISORY",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List active (unresolved) schedule clashes, optionally filtered by severity."""
    # Parse severity filter
    severity_enum = None
    if severity:
        try:
            severity_enum = ClashSeverity(severity.upper())
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid severity '{severity}'. Must be one of: CRITICAL, MAJOR, ADVISORY",
            )

    clashes = get_active_clashes(db, severity=severity_enum)

    # Count by severity
    by_severity = {"CRITICAL": 0, "MAJOR": 0, "ADVISORY": 0}
    for c in clashes:
        by_severity[c.severity.value] = by_severity.get(c.severity.value, 0) + 1

    # Serialize clashes
    clash_list = []
    for c in clashes:
        clash_list.append(ClashIssueResponse(
            id=str(c.id),
            sweep_run_id=str(c.sweep_run_id),
            category=c.category,
            severity=c.severity,
            portfolio_node_id=str(c.portfolio_node_id),
            conflicting_node_id=str(c.conflicting_node_id) if c.conflicting_node_id else None,
            conflicting_resource_id=str(c.conflicting_resource_id) if c.conflicting_resource_id else None,
            conflict_window_start=c.conflict_window_start,
            conflict_window_end=c.conflict_window_end,
            title=c.title,
            description=c.description,
            recommended_action=c.recommended_action,
            is_resolved=c.is_resolved,
            created_at=c.created_at,
        ))

    return ClashListResponse(
        total_clashes=len(clash_list),
        by_severity=by_severity,
        clashes=clash_list,
    )


@router.post(
    "/sweep/{project_id}",
    response_model=SweepResultResponse,
    summary="Run a portfolio clash sweep",
    description=(
        "Triggers a new audit pass over the specified project, detecting: "
        "resource overallocations, security clearance lapses, SCIF facility "
        "collisions, negative float slips, and predecessor violations. "
        "All discovered clashes are persisted with a unique sweep_run_id."
    ),
)
def trigger_sweep(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Run a complete portfolio sweep and persist discovered clashes."""
    try:
        result = run_portfolio_sweep(db, project_id)
        return result
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sweep failed: {str(exc)}",
        )


@router.post(
    "/leveling-proposal/{project_id}",
    response_model=LevelingProposalResponse,
    summary="Compute resource leveling proposal",
    description=(
        "Runs the Burgess-Killebrew heuristic leveling algorithm on the "
        "specified project.  Identifies time windows where total allocated "
        "resource units exceed 100% capacity, then proposes date shifts for "
        "non-critical tasks within their float window.\n\n"
        "This operates in **Proposal Mode**: no changes are committed to the "
        "database.  Review the proposal and call ``POST /apply-leveling`` to "
        "commit the shifts."
    ),
)
def compute_leveling(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Compute and return a proposed resource leveling plan."""
    try:
        result = compute_leveling_proposal(db, project_id)

        # Parse shifts into response model
        shifts = []
        for s in result.get("shifts", []):
            shifts.append(LevelingShiftResponse(
                node_id=s["node_id"],
                code=s["code"],
                name=s["name"],
                original_start=s["original_start"],
                original_finish=s["original_finish"],
                proposed_start=s["proposed_start"],
                proposed_finish=s["proposed_finish"],
                consumed_float_days=s["consumed_float_days"],
                milestone_breach=s["milestone_breach"],
                reason=s["reason"],
            ))

        return {
            "project_id": result["project_id"],
            "total_shifts": result["total_shifts"],
            "shifts": shifts,
            "overallocation_windows": result["overallocation_windows"],
            "milestone_breaches": result["milestone_breaches"],
            "computed_at": result["computed_at"],
            "message": result.get("message"),
        }
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Leveling computation failed: {str(exc)}",
        )


@router.post(
    "/apply-leveling/{project_id}",
    response_model=LevelingApplyResponse,
    summary="Apply signed-off leveling shifts",
    description=(
        "Commits the leveling shifts returned by ``POST /leveling-proposal`` "
        "to the database in a single atomic transaction.  Each shift updates "
        "the ``planned_start_date`` and ``planned_end_date`` of the target node.\n\n"
        "This endpoint acquires a sub-tree lock before applying shifts to "
        "prevent concurrent mutations.  If another operation is already "
        "running on this sub-tree, HTTP 423 (Locked) is returned.\n\n"
        "Only shifts that pass validation (node exists, node is under the "
        "project root) are applied.  Failed shifts are reported in the response."
    ),
)
def apply_leveling_endpoint(
    project_id: UUID,
    request: LevelingApplyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Commit signed-off leveling shifts to the database within a sub-tree lock."""
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
        # Acquire sub-tree lock and apply leveling
        loop = asyncio.new_event_loop()
        try:
            result = loop.run_until_complete(
                _apply_leveling_with_lock(
                    db, root_path, project_id, request.shifts, current_user.id
                )
            )
        finally:
            loop.close()

        return result
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to apply leveling: {str(exc)}",
        )


async def _apply_leveling_with_lock(
    db: Session,
    root_path: str,
    project_id: UUID,
    shifts: list,
    user_id: int,
) -> dict:
    """Apply leveling shifts within a sub-tree lock.

    Parameters
    ----------
    db : Session
        Database session.
    root_path : str
        Ltree path of the project root.
    project_id : UUID
        UUID of the project root node.
    shifts : list
        List of leveling shift dicts.
    user_id : int
        ID of the user initiating the leveling.

    Returns
    -------
    dict
        The leveling apply result.
    """
    async with acquire_subtree_lock(
        db, root_path, LockOperationType.RESOURCE_LEVELING, user_id, ttl_seconds=60
    ):
        result = apply_leveling(db, project_id, shifts)
        return result


@router.post(
    "/resolve/{clash_id}",
    summary="Mark a clash as resolved",
    description=(
        "Marks the specified clash issue as resolved.  The record is retained "
        "for historical analysis but will no longer appear in the active clashes list."
    ),
)
def resolve_clash_endpoint(
    clash_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a clash issue as resolved."""
    success = resolve_clash(db, clash_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Clash issue {clash_id} not found",
        )
    return {"clash_id": str(clash_id), "resolved": True}
