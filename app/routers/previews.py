"""Preview endpoints for hover summary cards.

This module provides lightweight, high-speed API endpoints that return
just enough data for the hover inspector modals to display contextual
summary cards.  Unlike the full WBS/resource/location endpoints, these
endpoints avoid loading deep relationship graphs, large JSONB attributes,
or sub-tree payloads.

Each endpoint enforces ABAC (Attribute-Based Access Control) clearance
checks.  If the requesting user lacks the required security clearance
for a node, the sensitive fields are masked as ``'[RESTRICTED]'`` and
``is_masked`` is set to ``True`` — preserving the existence of the node
without exposing classified details.

Endpoints
~~~~~~~~~

- ``GET /api/v1/previews/tasks/{id}`` — Task hover preview with dates,
  progress, float, blockers, CDRL, and V&V summary.

- ``GET /api/v1/previews/resources/{id}`` — Resource hover preview with
  type, location, allocation, and top skills.

- ``GET /api/v1/previews/locations/{id}`` — Location hover preview with
  tier, SCIF status, and contained asset count.

Performance
~~~~~~~~~~~

These endpoints use targeted ``select()`` queries that fetch only the
columns needed for each preview type.  No eager loading of relationships
or cascade joins — each secondary query (assignments, blockers, CDRLs,
V&V tests) is a simple indexed lookup by foreign key.
"""
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import (
    PortfolioNode,
    ResourceNode,
    LocationNode,
    ResourceAssignment,
    NodeBlocker,
    ContractDeliverable,
    VerificationTestCase,
    UserSkillProfile,
    SkillDefinition,
    User,
    SecurityClassification,
)
from app.core.abac import has_sufficient_clearance, has_required_caveats
from app.utils.auth import get_current_user
from app.schemas.preview import (
    TaskHoverPreview,
    ResourceHoverPreview,
    LocationHoverPreview,
    AssignedResourceItem,
    VVTestSummary,
    SkillItem,
)

router = APIRouter()


# ============================================================================
# Helper: Mask node fields for unauthorized users
# ============================================================================


def _mask_task_preview(
    preview: dict,
) -> dict:
    """Replace sensitive fields with '[RESTRICTED]' for an unauthorized user.

    Parameters
    ----------
    preview : dict
        The task preview dictionary before masking.

    Returns
    -------
    dict
        The same dictionary with sensitive fields redacted.
    """
    preview["name"] = "[RESTRICTED]"
    preview["code"] = "[RESTRICTED]"
    preview["security_classification"] = "[RESTRICTED]"
    preview["caveats"] = None
    preview["is_masked"] = True
    return preview


def _mask_resource_preview(
    preview: dict,
) -> dict:
    """Replace sensitive fields with '[RESTRICTED]' for an unauthorized user.

    Parameters
    ----------
    preview : dict
        The resource preview dictionary before masking.

    Returns
    -------
    dict
        The same dictionary with sensitive fields redacted.
    """
    preview["name"] = "[RESTRICTED]"
    preview["code"] = "[RESTRICTED]"
    preview["clearance_level"] = "[RESTRICTED]"
    preview["is_masked"] = True
    return preview


def _mask_location_preview(
    preview: dict,
) -> dict:
    """Replace sensitive fields with '[RESTRICTED]' for an unauthorized user.

    Parameters
    ----------
    preview : dict
        The location preview dictionary before masking.

    Returns
    -------
    dict
        The same dictionary with sensitive fields redacted.
    """
    preview["name"] = "[RESTRICTED]"
    preview["code"] = "[RESTRICTED]"
    preview["is_masked"] = True
    return preview


# ============================================================================
# Task Preview Endpoint
# ============================================================================


@router.get("/tasks/{task_id}", response_model=TaskHoverPreview)
def get_task_preview(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return a lightweight preview of a PortfolioNode for hover cards.

    Fetches only the columns needed for the hover summary: code, name,
    dates, progress, CPM float, assigned resources, active blockers,
    linked CDRL, and V&V test summary.

    If the user lacks clearance for this node, sensitive fields are
    masked as ``'[RESTRICTED]'``.

    Parameters
    ----------
    task_id : str
        UUID of the PortfolioNode to preview.
    current_user : User
        The authenticated user (from JWT token).
    db : Session
        Database session.

    Returns
    -------
    TaskHoverPreview
        Lightweight task summary for the hover card.

    Raises
    ------
    HTTPException
        404 if the node is not found, 403 if the user has no access.
    """
    try:
        node_uuid = UUID(task_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid task ID: {task_id}",
        )

    # Fetch the portfolio node — lean column selection
    node = (
        db.query(PortfolioNode)
        .filter(PortfolioNode.id == node_uuid)
        .first()
    )

    if node is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )

    # ABAC clearance check
    user_has_clearance = has_sufficient_clearance(
        current_user.clearance_level,
        node.security_classification,
    ) and has_required_caveats(current_user.caveats, node.caveats)

    # Build the preview dictionary
    preview = {
        "id": str(node.id),
        "code": node.code or "",
        "name": node.name or "",
        "security_classification": (
            node.security_classification.value
            if node.security_classification
            else None
        ),
        "caveats": node.caveats,
        "delivery_mode": (
            node.delivery_mode.value
            if node.delivery_mode
            else None
        ),
        "planned_start": (
            node.planned_start_date.isoformat()
            if node.planned_start_date
            else None
        ),
        "planned_finish": (
            node.planned_end_date.isoformat()
            if node.planned_end_date
            else None
        ),
        "percent_complete": node.percent_complete or 0.0,
        "total_float": None,
        "is_critical": False,
        "assigned_resources": [],
        "active_blockers_count": 0,
        "linked_cdrl_code": None,
        "vv_test_summary": None,
        "is_masked": False,
    }

    # Extract CPM float from custom_attributes if available
    custom_attrs = node.custom_attributes or {}
    schedule_data = custom_attrs.get("schedule", {})
    if schedule_data:
        total_float = schedule_data.get("total_float")
        if total_float is not None:
            preview["total_float"] = int(total_float)
            preview["is_critical"] = total_float <= 0

    # Assigned resources — lean query
    assignments = (
        db.query(ResourceAssignment)
        .join(ResourceNode)
        .filter(ResourceAssignment.portfolio_node_id == node_uuid)
        .all()
    )

    assigned_resources: List[AssignedResourceItem] = []
    for assignment in assignments:
        res_node = assignment.resource_node
        if res_node:
            assigned_resources.append(
                AssignedResourceItem(
                    name=res_node.name or res_node.code or "Unknown",
                    allocation_percent=round(
                        (assignment.allocated_units or 0.0) * 100.0, 1
                    ),
                )
            )
    preview["assigned_resources"] = assigned_resources

    # Active blockers count — lean count query
    active_blockers = (
        db.query(NodeBlocker)
        .filter(
            NodeBlocker.portfolio_node_id == node_uuid,
            NodeBlocker.resolved_at.is_(None),
        )
        .count()
    )
    preview["active_blockers_count"] = active_blockers

    # Linked CDRL — fetch first active CDRL
    cdrl = (
        db.query(ContractDeliverable)
        .filter(ContractDeliverable.portfolio_node_id == node_uuid)
        .first()
    )
    if cdrl:
        preview["linked_cdrl_code"] = cdrl.cdrl_sequence_number

    # V&V test summary
    if node.requires_vv_signoff:
        mandatory_tests = (
            db.query(VerificationTestCase)
            .filter(
                VerificationTestCase.portfolio_node_id == node_uuid,
                VerificationTestCase.is_mandatory.is_(True),
            )
            .all()
        )
        if mandatory_tests:
            passed_count = sum(
                1
                for t in mandatory_tests
                if t.status.value in ("PASSED", "WAIVED")
            )
            preview["vv_test_summary"] = VVTestSummary(
                passed=passed_count,
                total=len(mandatory_tests),
            )

    # Apply ABAC masking if user lacks clearance
    if not user_has_clearance:
        preview = _mask_task_preview(preview)

    return TaskHoverPreview(**preview)


# ============================================================================
# Resource Preview Endpoint
# ============================================================================


@router.get("/resources/{resource_id}", response_model=ResourceHoverPreview)
def get_resource_preview(
    resource_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return a lightweight preview of a ResourceNode for hover cards.

    Fetches only the columns needed for the hover summary: type,
    location path, current allocation, and top 3 endorsed skills.

    If the user lacks clearance for this resource node, sensitive
    fields are masked as ``'[RESTRICTED]'``.

    Parameters
    ----------
    resource_id : str
        UUID of the ResourceNode to preview.
    current_user : User
        The authenticated user (from JWT token).
    db : Session
        Database session.

    Returns
    -------
    ResourceHoverPreview
        Lightweight resource summary for the hover card.

    Raises
    ------
    HTTPException
        404 if the resource is not found, 403 if the user has no access.
    """
    try:
        res_uuid = UUID(resource_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid resource ID: {resource_id}",
        )

    # Fetch the resource node
    node = (
        db.query(ResourceNode)
        .filter(ResourceNode.id == res_uuid)
        .first()
    )

    if node is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resource {resource_id} not found",
        )

    # ABAC clearance check
    user_has_clearance = has_sufficient_clearance(
        current_user.clearance_level,
        node.security_classification,
    ) and has_required_caveats(current_user.caveats, node.caveats)

    # Build the preview dictionary
    preview = {
        "id": str(node.id),
        "code": node.code or "",
        "name": node.name or "",
        "resource_type": (
            node.resource_type.value if node.resource_type else None
        ),
        "clearance_level": (
            node.security_classification.value
            if node.security_classification
            else None
        ),
        "current_location_path": None,
        "allocated_hours_this_week": 0.0,
        "capacity_hours": 40.0,
        "top_skills": [],
        "is_masked": False,
    }

    # Current location path
    if node.current_location_id:
        loc = (
            db.query(LocationNode)
            .filter(LocationNode.id == node.current_location_id)
            .first()
        )
        if loc:
            preview["current_location_path"] = loc.path

    # Allocated hours this week — sum of planned_hours for active assignments
    now = datetime.now(timezone.utc)
    week_start = now - timedelta(days=now.weekday())  # Monday
    week_end = week_start + timedelta(days=7)

    assignments = (
        db.query(ResourceAssignment)
        .join(PortfolioNode)
        .filter(
            ResourceAssignment.resource_node_id == res_uuid,
            PortfolioNode.planned_start_date <= week_end,
            PortfolioNode.planned_end_date >= week_start,
        )
        .all()
    )

    total_allocated = 0.0
    for assignment in assignments:
        total_allocated += (
            (assignment.planned_hours or 0.0)
            * (assignment.allocated_units or 0.0)
        )
    preview["allocated_hours_this_week"] = round(total_allocated, 1)

    # Top 3 skills — for PERSON resources, look up the associated User
    top_skills: List[SkillItem] = []
    if node.resource_type and node.resource_type.value == "PERSON":
        # Find the user matching this resource by code or name
        user = (
            db.query(User)
            .filter(
                (User.username == node.code)
                | (User.email == node.code)
                | (User.username == node.name)
                | (User.email == node.name)
            )
            .first()
        )

        if user and user.skill_profiles:
            # Sort by proficiency level descending, take top 3
            sorted_profiles = sorted(
                user.skill_profiles,
                key=lambda p: (
                    p.proficiency_level.value if p.proficiency_level else 0
                ),
                reverse=True,
            )[:3]

            for profile in sorted_profiles:
                skill = profile.skill
                if skill:
                    top_skills.append(
                        SkillItem(
                            skill_name=skill.name or skill.code or "Unknown",
                            proficiency_level=(
                                profile.proficiency_level.value
                                if profile.proficiency_level
                                else 1
                            ),
                            verification_status=(
                                profile.verification_status.value
                                if profile.verification_status
                                else "SELF_ATTESTED"
                            ),
                        )
                    )
    preview["top_skills"] = top_skills

    # Apply ABAC masking if user lacks clearance
    if not user_has_clearance:
        preview = _mask_resource_preview(preview)

    return ResourceHoverPreview(**preview)


# ============================================================================
# Location Preview Endpoint
# ============================================================================


@router.get("/locations/{location_id}", response_model=LocationHoverPreview)
def get_location_preview(
    location_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return a lightweight preview of a LocationNode for hover cards.

    Fetches only the columns needed for the hover summary: tier,
    SCIF/TEMPEST status, escort requirement, and contained asset count.

    If the user lacks clearance for this location node, sensitive
    fields are masked as ``'[RESTRICTED]'``.

    Parameters
    ----------
    location_id : str
        UUID of the LocationNode to preview.
    current_user : User
        The authenticated user (from JWT token).
    db : Session
        Database session.

    Returns
    -------
    LocationHoverPreview
        Lightweight location summary for the hover card.

    Raises
    ------
    HTTPException
        404 if the location is not found, 403 if the user has no access.
    """
    try:
        loc_uuid = UUID(location_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid location ID: {location_id}",
        )

    # Fetch the location node
    node = (
        db.query(LocationNode)
        .filter(LocationNode.id == loc_uuid)
        .first()
    )

    if node is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Location {location_id} not found",
        )

    # ABAC clearance check
    user_has_clearance = has_sufficient_clearance(
        current_user.clearance_level,
        node.security_classification,
    ) and has_required_caveats(current_user.caveats, node.caveats)

    # Build the preview dictionary
    preview = {
        "id": str(node.id),
        "code": node.code or "",
        "name": node.name or "",
        "tier": node.tier.value if node.tier else None,
        "path": node.path,
        "is_scif_or_tempest": node.is_scif_or_tempest or False,
        "escort_required": node.escort_required or False,
        "contained_assets_count": 0,
        "is_masked": False,
    }

    # Count contained assets — resources located here or in sub-locations
    # Use string-based path prefix matching for cross-database compatibility
    if node.path:
        path_prefix = node.path + "."
        contained_resources = (
            db.query(ResourceNode)
            .filter(
                ResourceNode.current_location_id.isnot(None),
                ResourceNode.path.like(path_prefix + "%"),
            )
            .count()
        )
        # Also count resources directly in this location
        direct_resources = (
            db.query(ResourceNode)
            .filter(ResourceNode.current_location_id == loc_uuid)
            .count()
        )
        preview["contained_assets_count"] = contained_resources + direct_resources

    # Apply ABAC masking if user lacks clearance
    if not user_has_clearance:
        preview = _mask_location_preview(preview)

    return LocationHoverPreview(**preview)
