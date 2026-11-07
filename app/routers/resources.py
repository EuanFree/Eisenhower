"""Resource creation router with permission-governed authorization.

This router provides endpoints for creating new Resource nodes in the
Resource Breakdown Structure (RBS).  Resources represent people, equipment,
and facilities that can be assigned to work packages.

Authorization
~~~~~~~~~~~~~

Resource creation requires the ``RESOURCE_MANAGER`` or ``DEPT_HEAD`` role.
The legacy ``ADMIN`` role maps to both, so administrators can create
resources without explicit delegation.

Creation Flow
~~~~~~~~~~~~~

1. **Role Check** — Verifies the user has RESOURCE_MANAGER or DEPT_HEAD
   authority via :func:`verify_resource_creation_authority`.
2. **Validation** — Pydantic schema validates resource type, calibration
   expiry (mandatory for EQUIPMENT), and other constraints.
3. **Creation** — Inserts the ResourceNode record atomically.
4. **Audit** — Records a ``ForensicAuditLog`` entry with action type
   ``ENTITY_CREATED``.

Workforce Forecasting
~~~~~~~~~~~~~~~~~~~~~

- ``GET /workforce-forecast`` — Returns time-phased demand vs. capacity
  vectors and pipeline gap warnings for a programme over a 36-month
  horizon.

Endpoints
~~~~~~~~~

- ``POST /`` — Create a new resource with full validation and audit logging.
- ``GET /workforce-forecast`` — Workforce demand forecast and pipeline gaps.

See Also
--------
- :mod:`app.core.permissions` — Authorization gates.
- :mod:`app.schemas.authoring` — ResourceCreate schema.
- :mod:`app.services.workforce_forecaster` — Demand forecasting engine.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from uuid import UUID, uuid4
from typing import Optional

from app.database import get_db
from app.models.models import (
    User,
    ResourceNode,
    TreeType,
    ForensicAuditLog,
)
from app.schemas.authoring import (
    ResourceCreate,
    ResourceCreatedResponse,
)
from app.core.permissions import verify_resource_creation_authority
from app.utils.auth import get_current_user

router = APIRouter(prefix="/v1/resources", tags=["Resources - RBS"])


@router.get(
    "/",
    summary="List resources for assignment / autocomplete",
)
async def list_resources(
    search: Optional[str] = Query(None, description="Filter by code or name substring"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List active ResourceNode records for assignment pickers and autocomplete."""
    query = db.query(ResourceNode).filter(ResourceNode.is_active == True)
    if search:
        like = f"%{search}%"
        query = query.filter(
            (ResourceNode.code.ilike(like)) | (ResourceNode.name.ilike(like))
        )
    rows = query.order_by(ResourceNode.name.asc()).limit(200).all()
    return {
        "resources": [
            {
                "id": str(r.id),
                "code": r.code,
                "name": r.name,
                "resource_type": r.resource_type,
            }
            for r in rows
        ]
    }


@router.post(
    "/",
    response_model=ResourceCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new Resource",
    description=(
        "Create a new Resource node (person, equipment, or facility) "
        "in the Resource Breakdown Structure.\n\n"
        "Authorization: Requires RESOURCE_MANAGER or DEPT_HEAD role.\n\n"
        "Validation:\n"
        "- EQUIPMENT resources must have a calibration_expiry_date.\n"
        "- Nationality must be a 2-letter ISO country code.\n"
        "- Resource type must be HUMAN_LABOR, EQUIPMENT, or FACILITY.\n\n"
        "On success, a ForensicAuditLog entry is written with "
        "action_type='ENTITY_CREATED'."
    ),
)
async def create_resource(
    data: ResourceCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new Resource with permission-governed authorization.

    Validates that the user has RESOURCE_MANAGER or DEPT_HEAD authority,
    creates the ResourceNode record, and records a ForensicAuditLog entry.

    Args:
        data: The validated ResourceCreate payload.
        current_user: The authenticated user.
        db: Database session.

    Returns:
        ResourceCreatedResponse with the new resource's id, code, name,
        type, department, clearance level, and creation timestamp.

    Raises:
        HTTPException: 403 if the user lacks resource creation authority.
    """
    # Step 1: Verify resource creation authority
    verify_resource_creation_authority(current_user)

    # Step 2: Generate ltree path for the RBS tree
    # Resources are organized under a root RBS node
    # Path format: rbs.<department_slug>.<code>
    dept_slug = data.department.lower().replace(" ", "_").replace("-", "_")
    sanitized_code = data.code.replace(".", "_")
    new_path = f"rbs.{dept_slug}.{sanitized_code}"

    # Step 3: Create the ResourceNode
    now = datetime.now(timezone.utc)
    new_node_id = uuid4()

    new_node = ResourceNode(
        id=new_node_id,
        parent_id=None,  # Resources are root-level in RBS; hierarchy is via path
        tree_type=TreeType.RBS,
        code=data.code,
        name=data.name,
        path=new_path,
        security_classification=data.clearance_level,
        caveats=None,
        custom_attributes=data.custom_attributes or {},
        is_active=True,
        is_generic_placeholder=data.is_generic_placeholder,
        created_at=now,
        updated_at=now,
    )

    # Set resource-specific fields
    if data.resource_type == "HUMAN_LABOR":
        new_node.resource_type = "PERSON"
        new_node.standard_hourly_rate = float(data.burdened_hourly_rate) if data.burdened_hourly_rate else None
    elif data.resource_type == "EQUIPMENT":
        new_node.resource_type = "ASSET"
        new_node.serial_number = data.serial_number
        new_node.calibration_interval_days = data.calibration_interval_days
        new_node.next_calibration_due = data.calibration_expiry_date
    elif data.resource_type == "FACILITY":
        new_node.resource_type = "FACILITY"
    else:
        # Fallback — should not reach here due to Pydantic validation
        new_node.resource_type = "PERSON"

    db.add(new_node)
    db.flush()

    # Step 4: Write ForensicAuditLog entry
    latest_audit = (
        db.query(ForensicAuditLog)
        .order_by(ForensicAuditLog.created_at.desc())
        .first()
    )
    prev_hash = latest_audit.current_hash if latest_audit else ""

    audit_entry = ForensicAuditLog.create_entry(
        transaction_id=uuid4(),
        user_upn=getattr(current_user, "email", "unknown"),
        client_ip="unknown",
        action_type="ENTITY_CREATED",
        entity_type="ResourceNode",
        entity_id=new_node_id,
        json_diff={
            "code": data.code,
            "name": data.name,
            "resource_type": data.resource_type,
            "department": data.department,
            "clearance_level": data.clearance_level.value
            if hasattr(data.clearance_level, "value")
            else str(data.clearance_level),
            "path": new_path,
        },
        security_marking=f"ENTITY_CREATED by {getattr(current_user, 'email', 'unknown')}",
        prev_hash=prev_hash,
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(new_node)

    return ResourceCreatedResponse(
        id=new_node.id,
        code=new_node.code,
        name=new_node.name,
        resource_type=data.resource_type,
        department=data.department,
        clearance_level=new_node.security_classification.value
        if hasattr(new_node.security_classification, "value")
        else str(new_node.security_classification),
        created_at=new_node.created_at,
    )


@router.get(
    "/workforce-forecast",
    summary="Workforce demand forecast and pipeline gap analysis",
    description=(
        "Returns time-phased workforce demand vs. capacity vectors and "
        "pipeline gap warnings for a programme over a configurable planning "
        "horizon (default 36 months).\n\n"
        "The forecast is based on CPM schedule data (Early Start, Early Finish, "
        "Late Start, Late Finish) and aggregates monthly required labor hours "
        "grouped by:\n\n"
        "- **Skill Tags** (e.g., AVIONICS_EMC, OPTICS_TEST)\n"
        "- **Security Clearance Tiers** (BPSS, SC, DV, NATO_SECRET)\n"
        "- **Safety Accreditations** (DAL_A through DAL_E)\n\n"
        "Pipeline deficits are identified by comparing demand against active "
        "headcount, factoring in clearance vetting lead times (DV=270 days, "
        "SC=90 days) and known retirement/contract expiry dates."
    ),
)
async def get_workforce_forecast(
    programme_id: UUID = Query(
        ...,
        description="The root PortfolioNode UUID for the programme to forecast.",
    ),
    horizon_months: int = Query(
        36,
        ge=1,
        le=120,
        description="Planning horizon in months (default 36, max 120).",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get workforce demand forecast and pipeline gap warnings.

    Computes a time-phased demand vector from CPM schedule data and
    evaluates pipeline deficits against active workforce capacity.

    Parameters
    ----------
    programme_id : UUID
        The root programme node ID.
    horizon_months : int
        Planning horizon in months (1-120).
    current_user : User
        The authenticated user.
    db : Session
        Database session.

    Returns
    -------
    dict
        Contains demand vectors, capacity vectors, and pipeline gap warnings.
    """
    from app.services.workforce_forecaster import (
        compute_workforce_demand_vector,
        evaluate_pipeline_deficits,
    )

    # Compute the demand vector
    demand_vector = compute_workforce_demand_vector(
        db, programme_id, horizon_months=horizon_months
    )

    # Evaluate pipeline deficits
    deficits = evaluate_pipeline_deficits(db, demand_vector)

    return {
        "programme_id": demand_vector["programme_id"],
        "horizon_months": demand_vector["horizon_months"],
        "calculated_at": demand_vector["calculated_at"],
        "cpm_summary": demand_vector.get("cpm_summary", {}),
        "demand_vectors": {
            "by_month": demand_vector.get("demand_by_month", {}),
            "by_skill": demand_vector.get("demand_by_skill", {}),
            "by_clearance": demand_vector.get("demand_by_clearance", {}),
            "by_safety": demand_vector.get("demand_by_safety", {}),
        },
        "pipeline_gaps": deficits,
        "gap_summary": {
            "total_gaps": len(deficits),
            "critical": sum(1 for d in deficits if d.get("severity") == "CRITICAL"),
            "warning": sum(1 for d in deficits if d.get("severity") == "WARNING"),
            "info": sum(1 for d in deficits if d.get("severity") == "INFO"),
            "action_required": sum(1 for d in deficits if d.get("is_deficit")),
        },
    }
