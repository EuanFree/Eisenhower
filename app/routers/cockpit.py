"""My Daily Cockpit — personal landing page API endpoints.

Provides quick-access endpoints for the authenticated user's daily workflow:
summary metrics, focus queue ordered by CPM priority, claimable placeholder
tasks, quick progress updates, and atomic blocker creation.
"""
from datetime import datetime, timezone, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from app.database import get_db
from app.models.models import (
    User, PortfolioNode, ResourceNode, ResourceAssignment,
    NodeBlocker, ForensicAuditLog, BlockerCategory, BlockerSeverity,
    AssignmentStatus, ExportControlRegime,
)
from app.schemas.schemas import (
    CockpitSummaryResponse,
    FocusQueueResponse, FocusQueueTaskResponse,
    ClaimableTasksResponse, ClaimableTaskResponse,
    ProgressUpdateRequest, ProgressUpdateResponse,
    BlockerCreateRequest, BlockerCreateResponse,
)
from app.utils.auth import get_current_user
from app.core.abac import is_node_visible
from app.core.export_control import verify_export_control_compliance as verify_foreign_disclosure_compliance

router = APIRouter(prefix="/v1/cockpit", tags=["Cockpit - Daily Landing Page"])


# ============================================================================
# Helper: find all portfolio nodes the user is assigned to via ResourceAssignment
# ============================================================================

def _get_assigned_node_ids(db: Session, user: User) -> list:
    """Return a list of PortfolioNode IDs where the user is assigned.

    Matches the user's email/username against ResourceNode code or name,
    then returns the portfolio_node_id from ResourceAssignment.
    """
    assigned = (
        db.query(ResourceAssignment.portfolio_node_id)
        .join(ResourceNode, ResourceAssignment.resource_node_id == ResourceNode.id)
        .filter(
            ResourceAssignment.status == AssignmentStatus.CONFIRMED,
            or_(
                ResourceNode.code == user.username,
                ResourceNode.code == user.email,
                ResourceNode.name == user.full_name,
            ),
        )
        .all()
    )
    return [a.portfolio_node_id for a in assigned]


def _get_accessible_project_root_ids(db: Session, user: User) -> list:
    """Return root PortfolioNode IDs the user has access to.

    A user has access to projects where they are assigned to at least one
    node, or where they have sufficient clearance on the root node.
    """
    assigned_ids = _get_assigned_node_ids(db, user)
    if not assigned_ids:
        return []

    # Get the assigned nodes to find their tree roots via ltree path
    nodes = db.query(PortfolioNode).filter(PortfolioNode.id.in_(assigned_ids)).all()
    root_paths = set()
    for node in nodes:
        # The root is the first segment of the ltree path
        if node.path:
            root_path = node.path.split(".")[0]
            root_paths.add(root_path)

    # Find all root nodes matching those paths
    root_nodes = db.query(PortfolioNode).filter(
        PortfolioNode.path.in_(list(root_paths))
    ).all()
    return [n.id for n in root_nodes]


# ============================================================================
# GET /summary — Key metrics for the current user
# ============================================================================

@router.get("/summary", response_model=CockpitSummaryResponse)
def get_cockpit_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return key metrics for the user's Daily Cockpit landing page.

    Metrics include:
    - Active sprint task count (assigned, not complete)
    - Total planned hours this week (from ResourceAssignment)
    - Tasks due within 48 hours
    - Tasks where the user is an owner/assignee and are blocked
    """
    assigned_ids = _get_assigned_node_ids(db, current_user)

    # 1. Active sprint task count — assigned tasks not yet complete
    active_count = 0
    if assigned_ids:
        active_count = (
            db.query(PortfolioNode)
            .filter(
                PortfolioNode.id.in_(assigned_ids),
                PortfolioNode.is_active == True,
                PortfolioNode.percent_complete < 100.0,
            )
            .count()
        )

    # 2. Total planned hours this week
    now = datetime.now(timezone.utc)
    # Monday of current week
    start_of_week = now - timedelta(days=now.weekday())
    start_of_week = start_of_week.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_week = start_of_week + timedelta(days=7)

    total_planned_hours = 0.0
    if assigned_ids:
        assignments = (
            db.query(ResourceAssignment)
            .join(PortfolioNode, ResourceAssignment.portfolio_node_id == PortfolioNode.id)
            .join(ResourceNode, ResourceAssignment.resource_node_id == ResourceNode.id)
            .filter(
                ResourceAssignment.portfolio_node_id.in_(assigned_ids),
                ResourceAssignment.status == AssignmentStatus.CONFIRMED,
                or_(
                    ResourceNode.code == current_user.username,
                    ResourceNode.code == current_user.email,
                    ResourceNode.name == current_user.full_name,
                ),
                # Tasks planned for this week
                or_(
                    and_(
                        PortfolioNode.planned_start_date != None,
                        PortfolioNode.planned_start_date < end_of_week,
                        PortfolioNode.planned_start_date >= start_of_week,
                    ),
                    and_(
                        PortfolioNode.planned_end_date != None,
                        PortfolioNode.planned_end_date > start_of_week,
                        PortfolioNode.planned_end_date <= end_of_week,
                    ),
                ),
            )
            .all()
        )
        total_planned_hours = sum(a.planned_hours for a in assignments)

    # 3. Tasks due within 48 hours
    cutoff_48h = now + timedelta(hours=48)
    tasks_due_48h = 0
    if assigned_ids:
        tasks_due_48h = (
            db.query(PortfolioNode)
            .filter(
                PortfolioNode.id.in_(assigned_ids),
                PortfolioNode.is_active == True,
                PortfolioNode.percent_complete < 100.0,
                PortfolioNode.planned_end_date != None,
                PortfolioNode.planned_end_date <= cutoff_48h,
                PortfolioNode.planned_end_date >= now,
            )
            .count()
        )

    # 4. Blocked tasks — user is assigned and has unresolved blockers
    blocked_count = 0
    if assigned_ids:
        blocked_count = (
            db.query(PortfolioNode)
            .join(NodeBlocker, NodeBlocker.portfolio_node_id == PortfolioNode.id)
            .filter(
                PortfolioNode.id.in_(assigned_ids),
                NodeBlocker.resolved_at == None,
            )
            .distinct()
            .count()
        )

    return CockpitSummaryResponse(
        active_sprint_task_count=active_count,
        total_planned_hours_this_week=round(total_planned_hours, 2),
        tasks_due_within_48h=tasks_due_48h,
        tasks_blocked_count=blocked_count,
    )


# ============================================================================
# GET /focus-queue — User's tasks ordered by CPM critical path & due date
# ============================================================================

@router.get("/focus-queue", response_model=FocusQueueResponse)
def get_focus_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the user's active, in-progress, and upcoming assigned tasks.

    Ordered by CPM critical path status (critical first) then by due date
    (earliest first).  Only includes tasks the user has clearance to see.
    """
    assigned_ids = _get_assigned_node_ids(db, current_user)

    if not assigned_ids:
        return FocusQueueResponse(tasks=[])

    # Fetch assigned nodes that are active and not complete
    nodes = (
        db.query(PortfolioNode)
        .filter(
            PortfolioNode.id.in_(assigned_ids),
            PortfolioNode.is_active == True,
            PortfolioNode.percent_complete < 100.0,
        )
        .order_by(
            PortfolioNode.planned_end_date.asc().nulls_last(),
        )
        .all()
    )

    # Filter by ABAC clearance and build response
    task_responses: list[FocusQueueTaskResponse] = []
    for node in nodes:
        if not is_node_visible(current_user.clearance_level, current_user.caveats, node):
            continue

        # Extract CPM schedule data from custom_attributes if available
        custom = node.custom_attributes or {}
        schedule = custom.get("schedule", {})
        is_critical = schedule.get("is_critical", False)
        total_float = schedule.get("total_float")

        task_responses.append(FocusQueueTaskResponse(
            node_id=str(node.id),
            code=node.code,
            name=node.name,
            percent_complete=node.percent_complete,
            planned_start_date=node.planned_start_date,
            planned_end_date=node.planned_end_date,
            is_critical_path=is_critical,
            total_float_days=total_float,
            security_classification=node.security_classification,
            is_masked=False,
        ))

    # Sort: critical path first, then by planned_end_date
    task_responses.sort(key=lambda t: (not t.is_critical_path, t.planned_end_date or datetime.max))

    return FocusQueueResponse(tasks=task_responses)


# ============================================================================
# GET /claimable-tasks — Tasks assigned to generic placeholder resources
# ============================================================================

@router.get("/claimable-tasks", response_model=ClaimableTasksResponse)
def get_claimable_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return tasks assigned to generic placeholder resources.

    These are tasks within projects the user has access to, where the
    assigned resource is a generic placeholder (is_generic_placeholder=True).
    Filtered by matching user clearance.
    """
    # Find all claimable assignments — generic placeholder resources
    claimable = (
        db.query(ResourceAssignment)
        .join(ResourceNode, ResourceAssignment.resource_node_id == ResourceNode.id)
        .join(PortfolioNode, ResourceAssignment.portfolio_node_id == PortfolioNode.id)
        .filter(
            ResourceNode.is_generic_placeholder == True,
            ResourceAssignment.status == AssignmentStatus.CLAIMED,
            PortfolioNode.is_active == True,
        )
        .all()
    )

    task_responses: list[ClaimableTaskResponse] = []
    for assignment in claimable:
        node = assignment.portfolio_node
        resource = assignment.resource_node

        # Check user clearance
        if not is_node_visible(current_user.clearance_level, current_user.caveats, node):
            continue

        task_responses.append(ClaimableTaskResponse(
            node_id=str(node.id),
            code=node.code,
            name=node.name,
            placeholder_resource_id=str(resource.id),
            placeholder_resource_name=resource.name,
            allocated_units=assignment.allocated_units,
            planned_hours=assignment.planned_hours,
            security_classification=node.security_classification,
        ))

    return ClaimableTasksResponse(tasks=task_responses)


# ============================================================================
# POST /claimable-tasks/{node_id}/claim — Claim a placeholder-assigned task
# ============================================================================

@router.post("/claimable-tasks/{node_id}/claim", response_model=dict)
def claim_task(
    node_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Claim a task currently assigned to a generic placeholder resource.

    When a task is assigned to a generic placeholder (e.g., "Test Engineer
    TBC"), any cleared user can claim it.  This endpoint replaces the
    placeholder assignment with a confirmed assignment to the requesting user.

    Before allowing the claim, the endpoint verifies:

    1. The user has sufficient security clearance for the node (ABAC).
    2. The user passes export control compliance checks (nationality and
       employer licence) if the node is export-controlled.

    If export control checks fail, an HTTP 403 is returned and a
    ForensicAuditLog entry is created with marking EXPORT_CONTROL_DENIAL.

    Parameters
    ----------
    node_id : str
        The UUID of the PortfolioNode to claim.
    db : Session
        Database session.
    current_user : User
        The authenticated user claiming the task.

    Returns
    -------
    dict
        Confirmation message with the node code and assignment details.

    Raises
    ------
    HTTPException
        404 if the node is not found.
        403 if the user lacks clearance or export control compliance.
        400 if the node has no claimable placeholder assignment.
    """
    from uuid import UUID as PyUUID

    try:
        node_uuid = PyUUID(node_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid node ID format",
        )

    node = db.query(PortfolioNode).filter(PortfolioNode.id == node_uuid).first()
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {node_id} not found",
        )

    # Check user clearance (ABAC)
    if not is_node_visible(current_user.clearance_level, current_user.caveats, node):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient clearance to claim this task",
        )

    # Export control compliance check — raises HTTP 403 if denied
    verify_foreign_disclosure_compliance(current_user, node, db)

    # Find the placeholder assignment for this node
    placeholder_assignment = (
        db.query(ResourceAssignment)
        .join(ResourceNode, ResourceAssignment.resource_node_id == ResourceNode.id)
        .filter(
            ResourceAssignment.portfolio_node_id == node_uuid,
            ResourceNode.is_generic_placeholder == True,
            ResourceAssignment.status == AssignmentStatus.CLAIMED,
        )
        .first()
    )

    if not placeholder_assignment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No claimable placeholder assignment found for this task",
        )

    # Find or create a ResourceNode for the claiming user
    user_resource = (
        db.query(ResourceNode)
        .filter(
            ResourceNode.name == current_user.full_name,
            ResourceNode.resource_type == "PERSON",
        )
        .first()
    )

    if not user_resource:
        # Create a ResourceNode for the user if one doesn't exist
        user_resource = ResourceNode(
            code=current_user.username,
            name=current_user.full_name or current_user.username,
            tree_type="RBS",
            path=str(current_user.id),
            resource_type="PERSON",
            is_generic_placeholder=False,
            security_classification=current_user.clearance_level,
        )
        db.add(user_resource)
        db.flush()

    # Update the assignment to point to the user's resource and confirm it
    placeholder_assignment.resource_node_id = user_resource.id
    placeholder_assignment.status = AssignmentStatus.CONFIRMED

    db.commit()

    return {
        "message": f"Task {node.code} claimed successfully",
        "node_id": str(node.id),
        "node_code": node.code,
        "assigned_to": current_user.username,
    }


# ============================================================================
# POST /tasks/{node_id}/progress — Quick progress update
# ============================================================================

@router.post("/tasks/{node_id}/progress", response_model=ProgressUpdateResponse)
def update_task_progress(
    node_id: str,
    progress_data: ProgressUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Allow quick updates: +5%, +10%, or completion, with optional hour logs.

    Validates the node exists, the user is assigned, and the progress_type
    is one of the allowed values.
    """
    from uuid import UUID as PyUUID

    try:
        node_uuid = PyUUID(node_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid node ID format",
        )

    node = db.query(PortfolioNode).filter(PortfolioNode.id == node_uuid).first()
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {node_id} not found",
        )

    # Check user clearance
    if not is_node_visible(current_user.clearance_level, current_user.caveats, node):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient clearance to update this task",
        )

    # Check user is assigned to this node
    assigned_ids = _get_assigned_node_ids(db, current_user)
    if node_uuid not in assigned_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not assigned to this task",
        )

    previous_percent = node.percent_complete

    # Calculate new progress based on type
    if progress_data.progress_type == "+5":
        new_percent = min(previous_percent + 5.0, 100.0)
    elif progress_data.progress_type == "+10":
        new_percent = min(previous_percent + 10.0, 100.0)
    elif progress_data.progress_type == "complete":
        new_percent = 100.0
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid progress_type: {progress_data.progress_type}. Must be '+5', '+10', or 'complete'.",
        )

    # V&V completion gate interlock
    # If the node requires V&V signoff, reject setting percent_complete = 100.0
    # unless all mandatory VerificationTestCase items are PASSED or WAIVED.
    if new_percent >= 100.0 and getattr(node, "requires_vv_signoff", False):
        from app.models.models import VerificationTestCase, VerificationTestCaseStatus
        blocking_tests = (
            db.query(VerificationTestCase)
            .filter(
                VerificationTestCase.portfolio_node_id == node_uuid,
                VerificationTestCase.is_mandatory == True,
                VerificationTestCase.status.notin_(
                    [VerificationTestCaseStatus.PASSED, VerificationTestCaseStatus.WAIVED]
                ),
            )
            .all()
        )
        if blocking_tests:
            test_ids = [tc.test_identifier for tc in blocking_tests]
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot complete: {len(blocking_tests)} mandatory V&V test case(s) "
                    f"are not yet PASSED or WAIVED: {', '.join(test_ids)}"
                ),
            )

    # CDRL billing milestone interlock
    # Billing milestones linked to CDRLs cannot transition to complete while
    # CDRL status is REJECTED or UNDER_REVIEW.
    if new_percent >= 100.0:
        from app.models.models import ContractDeliverable, CDRLStatus
        blocking_cdrls = (
            db.query(ContractDeliverable)
            .filter(
                ContractDeliverable.portfolio_node_id == node_uuid,
                ContractDeliverable.status.in_(
                    [CDRLStatus.REJECTED, CDRLStatus.UNDER_REVIEW]
                ),
            )
            .all()
        )
        if blocking_cdrls:
            cdrl_names = [d.cdrl_sequence_number for d in blocking_cdrls]
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot complete: CDRL(s) {', '.join(cdrl_names)} are REJECTED or "
                    f"UNDER_REVIEW — cannot complete billing milestone"
                ),
            )

    # Update the node
    node.percent_complete = new_percent

    # Log hours if provided — store in custom_attributes
    if progress_data.logged_hours is not None:
        custom = node.custom_attributes or {}
        hour_logs = custom.get("hour_logs", [])
        hour_logs.append({
            "user_id": current_user.id,
            "hours": progress_data.logged_hours,
            "logged_at": datetime.now(timezone.utc).isoformat(),
        })
        custom["hour_logs"] = hour_logs
        node.custom_attributes = custom

    # If completed, set actual end date
    if new_percent >= 100.0 and not node.actual_end_date:
        node.actual_end_date = datetime.now(timezone.utc)

    db.commit()
    db.refresh(node)

    return ProgressUpdateResponse(
        node_id=str(node.id),
        code=node.code,
        name=node.name,
        previous_percent_complete=previous_percent,
        new_percent_complete=new_percent,
        logged_hours=progress_data.logged_hours,
        updated_at=node.updated_at or datetime.now(timezone.utc),
    )


# ============================================================================
# POST /tasks/{node_id}/blocker — Atomic blocker creation
# ============================================================================

@router.post("/tasks/{node_id}/blocker", response_model=BlockerCreateResponse)
def create_task_blocker(
    node_id: str,
    blocker_data: BlockerCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Atomically create a NodeBlocker entry, update task status, and record ForensicAuditLog.

    This endpoint performs three operations in a single transaction:
    1. Creates a NodeBlocker record
    2. Updates the task's custom_attributes to reflect blocked status
    3. Records a ForensicAuditLog entry for the blocker creation
    """
    from uuid import UUID as PyUUID

    try:
        node_uuid = PyUUID(node_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid node ID format",
        )

    node = db.query(PortfolioNode).filter(PortfolioNode.id == node_uuid).first()
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {node_id} not found",
        )

    # Check user clearance
    if not is_node_visible(current_user.clearance_level, current_user.caveats, node):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient clearance to block this task",
        )

    # Validate category and severity enums
    try:
        category = BlockerCategory(blocker_data.category)
    except ValueError:
        valid = ", ".join(c.value for c in BlockerCategory)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid category: {blocker_data.category}. Must be one of: {valid}",
        )

    try:
        severity = BlockerSeverity(blocker_data.severity)
    except ValueError:
        valid = ", ".join(s.value for s in BlockerSeverity)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid severity: {blocker_data.severity}. Must be one of: {valid}",
        )

    transaction_id = uuid4()

    # 1. Create the NodeBlocker
    blocker = NodeBlocker(
        portfolio_node_id=node_uuid,
        category=category,
        severity=severity,
        impacted_hours=blocker_data.impacted_hours,
        resolved_at=None,
    )
    db.add(blocker)

    # 2. Update task custom_attributes to mark as blocked
    custom = node.custom_attributes or {}
    blockers_list = custom.get("active_blockers", [])
    blockers_list.append({
        "blocker_id": str(blocker.id) if blocker.id else "pending",
        "category": blocker_data.category,
        "severity": blocker_data.severity,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "description": blocker_data.description,
    })
    custom["active_blockers"] = blockers_list
    custom["is_blocked"] = True
    node.custom_attributes = custom

    db.flush()  # Ensure blocker.id is populated

    # 3. Record ForensicAuditLog entry for the blocker creation
    # Get the latest chain hash
    last_audit = db.query(ForensicAuditLog).order_by(
        ForensicAuditLog.created_at.desc()
    ).first()
    prev_hash = last_audit.current_hash if last_audit else ""

    audit_entry = ForensicAuditLog.create_entry(
        transaction_id=transaction_id,
        user_upn=current_user.email or current_user.username,
        client_ip=None,
        action_type="UPDATE",
        entity_type="PortfolioNode",
        entity_id=node_uuid,
        json_diff={
            "action": "blocker_created",
            "blocker_id": str(blocker.id),
            "category": blocker_data.category,
            "severity": blocker_data.severity,
            "impacted_hours": blocker_data.impacted_hours,
            "description": blocker_data.description,
        },
        security_marking=node.security_classification.value if node.security_classification else "",
        prev_hash=prev_hash,
    )
    db.add(audit_entry)

    db.commit()
    db.refresh(blocker)

    return BlockerCreateResponse(
        blocker_id=str(blocker.id),
        node_id=str(node.id),
        category=blocker_data.category,
        severity=blocker_data.severity,
        impacted_hours=blocker_data.impacted_hours,
        created_at=blocker.created_at or datetime.now(timezone.utc),
        audit_log_id=str(audit_entry.id),
    )
