"""Template catalog API router.

This module provides REST endpoints for managing structural templates
and resource crew templates, as well as for snapshotting existing WBS
sub-trees as templates and instantiating templates into the live
operational schedule.

Endpoints
---------

Structural Templates
~~~~~~~~~~~~~~~~~~~~

- ``GET /api/v1/templates`` — List all structural templates.
- ``POST /api/v1/templates`` — Create a new structural template.
- ``GET /api/v1/templates/{id}`` — Get a single template.
- ``PUT /api/v1/templates/{id}`` — Update a template.
- ``DELETE /api/v1/templates/{id}`` — Delete a template.
- ``POST /api/v1/templates/snapshot`` — Snapshot an existing WBS sub-tree as a template.
- ``POST /api/v1/templates/instantiate`` — Instantiate a template into the live schedule.

Resource Crew Templates
~~~~~~~~~~~~~~~~~~~~~~~

- ``GET /api/v1/templates/crew`` — List all crew templates.
- ``POST /api/v1/templates/crew`` — Create a new crew template.
- ``GET /api/v1/templates/crew/{id}`` — Get a single crew template with members.
- ``PUT /api/v1/templates/crew/{id}`` — Update a crew template.
- ``DELETE /api/v1/templates/crew/{id}`` — Delete a crew template.

Crew Template Members
~~~~~~~~~~~~~~~~~~~~~

- ``POST /api/v1/templates/crew/{id}/members`` — Add a role to a crew template.
- ``PUT /api/v1/templates/crew/{id}/members/{member_id}`` — Update a crew member role.
- ``DELETE /api/v1/templates/crew/{id}/members/{member_id}`` — Remove a crew member role.

Security
~~~~~~~~

All endpoints require JWT authentication via the ``get_current_user``
dependency.  Template operations are available to all authenticated
users; deletion may require Admin/Manager role in production.

"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import (
    StructuralTemplate,
    ResourceCrewTemplate,
    ResourceCrewTemplateMember,
    TemplateTier,
    ResourceType,
    ProficiencyLevel,
    SecurityClassification,
)
from app.schemas.schemas import (
    StructuralTemplateCreate,
    StructuralTemplateUpdate,
    StructuralTemplateResponse,
    StructuralTemplateListResponse,
    ResourceCrewTemplateCreate,
    ResourceCrewTemplateUpdate,
    ResourceCrewTemplateResponse,
    ResourceCrewTemplateWithMembersResponse,
    ResourceCrewTemplateMemberCreate,
    ResourceCrewTemplateMemberUpdate,
    ResourceCrewTemplateMemberResponse,
    TemplateSnapshotRequest,
    TemplateSnapshotResponse,
    TemplateInstantiateRequest,
    TemplateInstantiateResponse,
)
from app.utils.auth import get_current_user
from app.models.models import User
from app.services.templating import (
    snapshot_node_as_template,
    instantiate_template,
    create_crew_template_with_members,
    instantiate_crew_template,
)

router = APIRouter(prefix="/v1/templates", tags=["Templates - Catalog & Instantiation"])


# ============================================================================
# Structural Templates
# ============================================================================

@router.get(
    "/",
    response_model=StructuralTemplateListResponse,
    summary="List all structural templates",
    description="Returns a paginated list of all structural templates, "
                "optionally filtered by tier and active status.",
)
def list_templates(
    tier: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StructuralTemplateListResponse:
    """List all structural templates.

    Parameters
    ----------
    tier : str or None
        Filter by template tier (PROGRAMME, PROJECT, WORK_PACKAGE, TASK_COLLECTION).
    is_active : bool or None
        Filter by active status.
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    StructuralTemplateListResponse
        List of templates with total count.
    """
    query = db.query(StructuralTemplate)

    if tier:
        query = query.filter(StructuralTemplate.tier == tier)

    if is_active is not None:
        query = query.filter(StructuralTemplate.is_active == is_active)

    templates = query.order_by(StructuralTemplate.created_at.desc()).all()

    return StructuralTemplateListResponse(
        templates=[
            StructuralTemplateResponse(
                id=str(t.id),
                code=t.code,
                name=t.name,
                description=t.description,
                tier=t.tier,
                revision_version=t.revision_version,
                is_active=t.is_active,
                created_at=t.created_at.isoformat() if t.created_at else "",
                updated_at=t.updated_at.isoformat() if t.updated_at else "",
            )
            for t in templates
        ],
        total_count=len(templates),
    )


@router.post(
    "/",
    response_model=StructuralTemplateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new structural template",
    description="Creates a new structural template with the provided graph payload.",
)
def create_template(
    body: StructuralTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StructuralTemplateResponse:
    """Create a new structural template.

    Parameters
    ----------
    body : StructuralTemplateCreate
        Template creation data.
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    StructuralTemplateResponse
        The newly created template.
    """
    template = StructuralTemplate(
        code=body.code,
        name=body.name,
        description=body.description,
        tier=body.tier,
        template_graph_payload=body.template_graph_payload,
        is_active=True,
    )

    db.add(template)
    db.flush()

    return StructuralTemplateResponse(
        id=str(template.id),
        code=template.code,
        name=template.name,
        description=template.description,
        tier=template.tier,
        revision_version=template.revision_version,
        is_active=template.is_active,
        created_at=template.created_at.isoformat() if template.created_at else "",
        updated_at=template.updated_at.isoformat() if template.updated_at else "",
    )


@router.get(
    "/{template_id}",
    response_model=StructuralTemplateResponse,
    summary="Get a single structural template",
    description="Returns the details of a specific structural template.",
)
def get_template(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StructuralTemplateResponse:
    """Get a single structural template.

    Parameters
    ----------
    template_id : str
        UUID of the template.
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    StructuralTemplateResponse
        Template details.
    """
    template = db.query(StructuralTemplate).filter(
        StructuralTemplate.id == UUID(template_id)
    ).first()

    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with ID {template_id} not found.",
        )

    return StructuralTemplateResponse(
        id=str(template.id),
        code=template.code,
        name=template.name,
        description=template.description,
        tier=template.tier,
        revision_version=template.revision_version,
        is_active=template.is_active,
        created_at=template.created_at.isoformat() if template.created_at else "",
        updated_at=template.updated_at.isoformat() if template.updated_at else "",
    )


@router.put(
    "/{template_id}",
    response_model=StructuralTemplateResponse,
    summary="Update a structural template",
    description="Partially updates a structural template. Only provided fields are changed.",
)
def update_template(
    template_id: str,
    body: StructuralTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StructuralTemplateResponse:
    """Update a structural template.

    Parameters
    ----------
    template_id : str
        UUID of the template.
    body : StructuralTemplateUpdate
        Fields to update.
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    StructuralTemplateResponse
        Updated template details.
    """
    template = db.query(StructuralTemplate).filter(
        StructuralTemplate.id == UUID(template_id)
    ).first()

    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with ID {template_id} not found.",
        )

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(template, key, value)

    # Increment revision version if graph payload changed
    if "template_graph_payload" in update_data:
        template.revision_version += 1

    db.flush()

    return StructuralTemplateResponse(
        id=str(template.id),
        code=template.code,
        name=template.name,
        description=template.description,
        tier=template.tier,
        revision_version=template.revision_version,
        is_active=template.is_active,
        created_at=template.created_at.isoformat() if template.created_at else "",
        updated_at=template.updated_at.isoformat() if template.updated_at else "",
    )


@router.delete(
    "/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a structural template",
    description="Permanently deletes a structural template.",
)
def delete_template(
    template_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a structural template.

    Parameters
    ----------
    template_id : str
        UUID of the template.
    db : Session
        Database session.
    current_user : User
        Authenticated user.
    """
    template = db.query(StructuralTemplate).filter(
        StructuralTemplate.id == UUID(template_id)
    ).first()

    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template with ID {template_id} not found.",
        )

    db.delete(template)
    db.commit()


# ============================================================================
# Snapshot & Instantiate
# ============================================================================

@router.post(
    "/snapshot",
    response_model=TemplateSnapshotResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Snapshot an existing WBS sub-tree as a template",
    description="Extracts an active WBS sub-tree, normalises dates to relative "
                "day offsets, and saves the result as a new StructuralTemplate.",
)
def snapshot_tree(
    body: TemplateSnapshotRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TemplateSnapshotResponse:
    """Snapshot an existing WBS sub-tree as a template.

    This captures the current state of a WBS sub-tree, including all
    nodes, dependencies, and deliverables, and saves it as a reusable
    template.  All absolute dates are converted to relative day offsets
    from the earliest planned start date.

    Parameters
    ----------
    body : TemplateSnapshotRequest
        Snapshot request data.
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    TemplateSnapshotResponse
        Details of the newly created template.
    """
    template = snapshot_node_as_template(
        node_id=body.node_id,
        code=body.code,
        name=body.name,
        tier=body.tier,
        description=body.description,
        db=db,
        user_upn=current_user.email or current_user.username,
    )

    graph = template.template_graph_payload
    return TemplateSnapshotResponse(
        template_id=str(template.id),
        code=template.code,
        node_count=len(graph.get("nodes", [])),
        dependency_count=len(graph.get("dependencies", [])),
    )


@router.post(
    "/instantiate",
    response_model=TemplateInstantiateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Instantiate a template into the live schedule",
    description="Stamps out a template into the live operational schedule, "
                "creating new PortfolioNode records with correctly nested "
                "ltree paths and remapped dependency links.",
)
def instantiate(
    body: TemplateInstantiateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TemplateInstantiateResponse:
    """Instantiate a template into the live schedule.

    Creates new PortfolioNode records from a template, computing absolute
    dates from relative offsets and the provided anchor date.  Supports
    both forward scheduling (START_DATE) and backward scheduling
    (FINISH_DATE).

    Parameters
    ----------
    body : TemplateInstantiateRequest
        Instantiation request data.
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    TemplateInstantiateResponse
        Details of the instantiated sub-tree.
    """
    result = instantiate_template(
        template_id=body.template_id,
        parent_node_id=body.parent_node_id,
        anchor_date=body.anchor_date,
        anchor_type=body.anchor_type,
        code_prefix=body.code_prefix,
        db=db,
    )

    return TemplateInstantiateResponse(
        root_node_id=result["root_node_id"],
        node_count=result["node_count"],
        dependency_count=result["dependency_count"],
        placeholder_resource_count=result["placeholder_resource_count"],
    )


# ============================================================================
# Resource Crew Templates
# ============================================================================

@router.get(
    "/crew",
    response_model=List[ResourceCrewTemplateResponse],
    summary="List all resource crew templates",
    description="Returns a list of all resource crew templates.",
)
def list_crew_templates(
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[ResourceCrewTemplateResponse]:
    """List all resource crew templates.

    Parameters
    ----------
    is_active : bool or None
        Filter by active status.
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    list[ResourceCrewTemplateResponse]
        List of crew templates.
    """
    query = db.query(ResourceCrewTemplate)

    if is_active is not None:
        query = query.filter(ResourceCrewTemplate.is_active == is_active)

    crews = query.order_by(ResourceCrewTemplate.created_at.desc()).all()

    return [
        ResourceCrewTemplateResponse(
            id=str(c.id),
            code=c.code,
            name=c.name,
            description=c.description,
            is_active=c.is_active,
            created_at=c.created_at.isoformat() if c.created_at else "",
            updated_at=c.updated_at.isoformat() if c.updated_at else "",
        )
        for c in crews
    ]


@router.post(
    "/crew",
    response_model=ResourceCrewTemplateWithMembersResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new resource crew template",
    description="Creates a new crew template, optionally with member roles.",
)
def create_crew_template(
    body: ResourceCrewTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResourceCrewTemplateWithMembersResponse:
    """Create a new resource crew template.

    Parameters
    ----------
    body : ResourceCrewTemplateCreate
        Crew template creation data.
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    ResourceCrewTemplateWithMembersResponse
        The newly created crew template.
    """
    crew = ResourceCrewTemplate(
        code=body.code,
        name=body.name,
        description=body.description,
        is_active=True,
    )

    db.add(crew)
    db.flush()

    return ResourceCrewTemplateWithMembersResponse(
        id=str(crew.id),
        code=crew.code,
        name=crew.name,
        description=crew.description,
        is_active=crew.is_active,
        members=[],
        created_at=crew.created_at.isoformat() if crew.created_at else "",
        updated_at=crew.updated_at.isoformat() if crew.updated_at else "",
    )


@router.get(
    "/crew/{crew_id}",
    response_model=ResourceCrewTemplateWithMembersResponse,
    summary="Get a crew template with its member roles",
    description="Returns a crew template including all its role definitions.",
)
def get_crew_template(
    crew_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResourceCrewTemplateWithMembersResponse:
    """Get a crew template with its member roles.

    Parameters
    ----------
    crew_id : str
        UUID of the crew template.
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    ResourceCrewTemplateWithMembersResponse
        Crew template with member roles.
    """
    crew = db.query(ResourceCrewTemplate).filter(
        ResourceCrewTemplate.id == UUID(crew_id)
    ).first()

    if crew is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Crew template with ID {crew_id} not found.",
        )

    return ResourceCrewTemplateWithMembersResponse(
        id=str(crew.id),
        code=crew.code,
        name=crew.name,
        description=crew.description,
        is_active=crew.is_active,
        members=[
            ResourceCrewTemplateMemberResponse(
                id=str(m.id),
                crew_template_id=str(m.crew_template_id),
                role_name=m.role_name,
                resource_type=m.resource_type,
                required_skill_id=str(m.required_skill_id) if m.required_skill_id else None,
                min_proficiency=m.min_proficiency,
                min_clearance=m.min_clearance,
                default_allocation_fraction=float(m.default_allocation_fraction),
                created_at=m.created_at.isoformat() if m.created_at else "",
                updated_at=m.updated_at.isoformat() if m.updated_at else "",
            )
            for m in crew.members
        ],
        created_at=crew.created_at.isoformat() if crew.created_at else "",
        updated_at=crew.updated_at.isoformat() if crew.updated_at else "",
    )


@router.put(
    "/crew/{crew_id}",
    response_model=ResourceCrewTemplateResponse,
    summary="Update a crew template",
    description="Partially updates a crew template's metadata.",
)
def update_crew_template(
    crew_id: str,
    body: ResourceCrewTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResourceCrewTemplateResponse:
    """Update a crew template.

    Parameters
    ----------
    crew_id : str
        UUID of the crew template.
    body : ResourceCrewTemplateUpdate
        Fields to update.
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    ResourceCrewTemplateResponse
        Updated crew template.
    """
    crew = db.query(ResourceCrewTemplate).filter(
        ResourceCrewTemplate.id == UUID(crew_id)
    ).first()

    if crew is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Crew template with ID {crew_id} not found.",
        )

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(crew, key, value)

    db.flush()

    return ResourceCrewTemplateResponse(
        id=str(crew.id),
        code=crew.code,
        name=crew.name,
        description=crew.description,
        is_active=crew.is_active,
        created_at=crew.created_at.isoformat() if crew.created_at else "",
        updated_at=crew.updated_at.isoformat() if crew.updated_at else "",
    )


@router.delete(
    "/crew/{crew_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a crew template",
    description="Permanently deletes a crew template and all its member roles.",
)
def delete_crew_template(
    crew_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a crew template.

    Parameters
    ----------
    crew_id : str
        UUID of the crew template.
    db : Session
        Database session.
    current_user : User
        Authenticated user.
    """
    crew = db.query(ResourceCrewTemplate).filter(
        ResourceCrewTemplate.id == UUID(crew_id)
    ).first()

    if crew is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Crew template with ID {crew_id} not found.",
        )

    db.delete(crew)
    db.commit()


# ============================================================================
# Crew Template Members
# ============================================================================

@router.post(
    "/crew/{crew_id}/members",
    response_model=ResourceCrewTemplateMemberResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a role to a crew template",
    description="Adds a new role definition to an existing crew template.",
)
def add_crew_member(
    crew_id: str,
    body: ResourceCrewTemplateMemberCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResourceCrewTemplateMemberResponse:
    """Add a role to a crew template.

    Parameters
    ----------
    crew_id : str
        UUID of the crew template.
    body : ResourceCrewTemplateMemberCreate
        Role definition data.
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    ResourceCrewTemplateMemberResponse
        The newly created member role.
    """
    crew = db.query(ResourceCrewTemplate).filter(
        ResourceCrewTemplate.id == UUID(crew_id)
    ).first()

    if crew is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Crew template with ID {crew_id} not found.",
        )

    member = ResourceCrewTemplateMember(
        crew_template_id=crew.id,
        role_name=body.role_name,
        resource_type=body.resource_type,
        required_skill_id=UUID(body.required_skill_id) if body.required_skill_id else None,
        min_proficiency=body.min_proficiency,
        min_clearance=body.min_clearance,
        default_allocation_fraction=body.default_allocation_fraction,
    )

    db.add(member)
    db.flush()

    return ResourceCrewTemplateMemberResponse(
        id=str(member.id),
        crew_template_id=str(member.crew_template_id),
        role_name=member.role_name,
        resource_type=member.resource_type,
        required_skill_id=str(member.required_skill_id) if member.required_skill_id else None,
        min_proficiency=member.min_proficiency,
        min_clearance=member.min_clearance,
        default_allocation_fraction=float(member.default_allocation_fraction),
        created_at=member.created_at.isoformat() if member.created_at else "",
        updated_at=member.updated_at.isoformat() if member.updated_at else "",
    )


@router.put(
    "/crew/{crew_id}/members/{member_id}",
    response_model=ResourceCrewTemplateMemberResponse,
    summary="Update a crew member role",
    description="Partially updates a role definition within a crew template.",
)
def update_crew_member(
    crew_id: str,
    member_id: str,
    body: ResourceCrewTemplateMemberUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ResourceCrewTemplateMemberResponse:
    """Update a crew member role.

    Parameters
    ----------
    crew_id : str
        UUID of the crew template.
    member_id : str
        UUID of the member role.
    body : ResourceCrewTemplateMemberUpdate
        Fields to update.
    db : Session
        Database session.
    current_user : User
        Authenticated user.

    Returns
    -------
    ResourceCrewTemplateMemberResponse
        Updated member role.
    """
    member = db.query(ResourceCrewTemplateMember).filter(
        ResourceCrewTemplateMember.id == UUID(member_id),
        ResourceCrewTemplateMember.crew_template_id == UUID(crew_id),
    ).first()

    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member with ID {member_id} not found in crew {crew_id}.",
        )

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(member, key, value)

    db.flush()

    return ResourceCrewTemplateMemberResponse(
        id=str(member.id),
        crew_template_id=str(member.crew_template_id),
        role_name=member.role_name,
        resource_type=member.resource_type,
        required_skill_id=str(member.required_skill_id) if member.required_skill_id else None,
        min_proficiency=member.min_proficiency,
        min_clearance=member.min_clearance,
        default_allocation_fraction=float(member.default_allocation_fraction),
        created_at=member.created_at.isoformat() if member.created_at else "",
        updated_at=member.updated_at.isoformat() if member.updated_at else "",
    )


@router.delete(
    "/crew/{crew_id}/members/{member_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a crew member role",
    description="Removes a role definition from a crew template.",
)
def delete_crew_member(
    crew_id: str,
    member_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Remove a crew member role.

    Parameters
    ----------
    crew_id : str
        UUID of the crew template.
    member_id : str
        UUID of the member role.
    db : Session
        Database session.
    current_user : User
        Authenticated user.
    """
    member = db.query(ResourceCrewTemplateMember).filter(
        ResourceCrewTemplateMember.id == UUID(member_id),
        ResourceCrewTemplateMember.crew_template_id == UUID(crew_id),
    ).first()

    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Member with ID {member_id} not found in crew {crew_id}.",
        )

    db.delete(member)
    db.commit()
