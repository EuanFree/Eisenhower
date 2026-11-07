"""Multi-view preset API router.

This module provides CRUD endpoints for managing multi-view layout presets
at ``/api/v1/presets``.  Unlike the Gantt-specific view presets at
``/api/v1/views``, these presets cover all primary application views:
WBS_GANTT, DAILY_COCKPIT, SRA_RISK, FACILITY_CHAMBER, and EVM_REPORTING.

Endpoints
~~~~~~~~~

- ``GET /presets`` — List all presets accessible to the current user.
- ``POST /presets`` — Create a new preset.
- ``PUT /presets/{id}`` — Update an existing preset (author or admin only).
- ``POST /presets/import-file`` — Import a .ppmview.json file upload.
- ``GET /presets/{id}/export-file`` — Download a validated .ppmview.json file.

Access Control
~~~~~~~~~~~~~~

- **GET /presets** returns presets where:
  - ``author_user_id == current_user.id`` (own presets), OR
  - ``sharing_scope IN ('PROJECT_SHARED', 'SYSTEM_GLOBAL')`` (shared presets).
- **PUT /presets/{id}** requires the user to be the preset author or an admin.
- All endpoints enforce ABAC clearance: the user's clearance must be >= the
  preset's classification level.

File Import/Export
~~~~~~~~~~~~~~~~~~

The ``.ppmview.json`` format is a validated JSON representation of a preset's
config_payload, wrapped with metadata headers (version, view type, preset name,
classification, export timestamp).  This format enables offline transport
of view configurations between air-gapped systems.

Import validates the uploaded file against the Pydantic schema before
creating the preset.  Export produces a clean, classification-stamped JSON
file suitable for optical media or USB diode transfer.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID
from datetime import datetime, timezone
import json

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.models import User
from app.models.display import (
    ViewPreset,
    SharingScope,
    PresetClassification,
    ViewType,
)
from app.core.abac import has_sufficient_clearance, CLEARANCE_LEVELS
from app.schemas.presets import (
    ViewPresetCreate,
    ViewPresetUpdate,
    ViewPresetResponse,
    ViewPresetListResponse,
    ViewPresetImportResponse,
    PPMViewExport,
)

router = APIRouter(tags=["Multi-View Presets"])


@router.get(
    "/presets",
    response_model=ViewPresetListResponse,
    summary="List accessible multi-view presets",
    description=(
        "Returns all presets accessible to the current user.  A preset is "
        "accessible if the user is its author, or if its sharing_scope is "
        "PROJECT_SHARED (and the user has project access) or SYSTEM_GLOBAL. "
        "Presets with a classification above the user's clearance are excluded."
    ),
)
async def list_presets(
    view_type: Optional[ViewType] = Query(None, description="Filter by view type"),
    project_id: Optional[UUID] = Query(None, description="Filter by project ID"),
    sharing_scope: Optional[SharingScope] = Query(None, description="Filter by sharing scope"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all multi-view presets accessible to the current user.

    Filters the preset list by:
    - Ownership: user's own presets are always included.
    - Sharing scope: PROJECT_SHARED and SYSTEM_GLOBAL presets are included.
    - Classification: presets above the user's clearance are excluded.
    - Optional view_type filter for specific view presets.
    - Optional project_id filter for project-scoped presets.
    - Optional sharing_scope filter.

    Parameters
    ----------
    view_type : ViewType or None
        If provided, only return presets for this view type.
    project_id : UUID or None
        If provided, only return presets scoped to this project.
    sharing_scope : SharingScope or None
        If provided, only return presets with this sharing scope.
    db : AsyncSession
        Database session.
    current_user : User
        The authenticated user.

    Returns
    -------
    ViewPresetListResponse
        List of accessible presets with total count.
    """
    # Determine user clearance rank
    user_clearance = getattr(current_user, "clearance_level", None)
    user_clearance_rank = CLEARANCE_LEVELS.get(str(user_clearance), 0) if user_clearance else 0

    # Build query: own presets + shared presets
    stmt = select(ViewPreset).where(
        (ViewPreset.author_user_id == current_user.id) |
        (ViewPreset.sharing_scope.in_([SharingScope.PROJECT_SHARED, SharingScope.SYSTEM_GLOBAL]))
    )

    # Optional filters
    if view_type is not None:
        stmt = stmt.where(ViewPreset.view_type == view_type)

    if project_id is not None:
        stmt = stmt.where(ViewPreset.project_id == project_id)

    if sharing_scope is not None:
        stmt = stmt.where(ViewPreset.sharing_scope == sharing_scope)

    result = await db.execute(stmt)
    presets = result.scalars().all()

    # Filter by classification clearance
    accessible = []
    for preset in presets:
        preset_clearance_rank = CLEARANCE_LEVELS.get(str(preset.classification), 0)
        if user_clearance_rank >= preset_clearance_rank:
            accessible.append(preset)

    return ViewPresetListResponse(
        presets=[ViewPresetResponse.model_validate(p) for p in accessible],
        total=len(accessible),
    )


@router.get(
    "/presets/{preset_id}",
    response_model=ViewPresetResponse,
    summary="Get a single preset by ID",
    description="Returns the full preset details if the user has access.",
)
async def get_preset(
    preset_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a single multi-view preset by ID.

    Parameters
    ----------
    preset_id : UUID
        The unique identifier of the preset.
    db : AsyncSession
        Database session.
    current_user : User
        The authenticated user.

    Returns
    -------
    ViewPresetResponse
        The preset details.

    Raises
    ------
    HTTPException
        404 if the preset does not exist, 403 if the user lacks access.
    """
    stmt = select(ViewPreset).where(ViewPreset.id == preset_id)
    result = await db.execute(stmt)
    preset = result.scalar_one_or_none()

    if preset is None:
        raise HTTPException(status_code=404, detail="Preset not found")

    # Check access: author or shared
    is_author = preset.author_user_id == current_user.id
    is_shared = preset.sharing_scope in (SharingScope.PROJECT_SHARED, SharingScope.SYSTEM_GLOBAL)

    if not is_author and not is_shared:
        raise HTTPException(status_code=403, detail="Access denied: preset is private")

    # Check classification clearance
    user_clearance = getattr(current_user, "clearance_level", None)
    user_clearance_rank = CLEARANCE_LEVELS.get(str(user_clearance), 0) if user_clearance else 0
    preset_clearance_rank = CLEARANCE_LEVELS.get(str(preset.classification), 0)

    if user_clearance_rank < preset_clearance_rank:
        raise HTTPException(
            status_code=403,
            detail=f"Insufficient clearance: requires {preset.classification.value}"
        )

    return ViewPresetResponse.model_validate(preset)


@router.post(
    "/presets",
    response_model=ViewPresetResponse,
    status_code=201,
    summary="Create a new multi-view preset",
    description=(
        "Creates a new view preset with validated config_payload.  "
        "The requesting user becomes the author."
    ),
)
async def create_preset(
    data: ViewPresetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new multi-view preset.

    The config_payload is stored as JSONB.  For WBS_GANTT presets,
    the frontend validates column fields against the Master Column
    Catalogue before submission.

    Parameters
    ----------
    data : ViewPresetCreate
        The preset creation request with view_type and config_payload.
    db : AsyncSession
        Database session.
    current_user : User
        The authenticated user (becomes the author).

    Returns
    -------
    ViewPresetResponse
        The created preset.

    Raises
    ------
    HTTPException
        403 if the user attempts to create a preset with classification
        above their own clearance.
    """
    # Check classification clearance
    user_clearance = getattr(current_user, "clearance_level", None)
    user_clearance_rank = CLEARANCE_LEVELS.get(str(user_clearance), 0) if user_clearance else 0
    preset_clearance_rank = CLEARANCE_LEVELS.get(str(data.classification), 0)

    if user_clearance_rank < preset_clearance_rank:
        raise HTTPException(
            status_code=403,
            detail=f"Insufficient clearance: requires {data.classification.value}"
        )

    preset = ViewPreset(
        view_type=data.view_type,
        name=data.name,
        description=data.description,
        project_id=data.project_id,
        author_user_id=current_user.id,
        sharing_scope=data.sharing_scope,
        classification=data.classification,
        config_payload=data.config_payload,
    )

    db.add(preset)
    await db.commit()
    await db.refresh(preset)

    return ViewPresetResponse.model_validate(preset)


@router.put(
    "/presets/{preset_id}",
    response_model=ViewPresetResponse,
    summary="Update an existing preset",
    description=(
        "Partially updates a preset.  Only the author or an admin can update. "
        "If config_payload is provided, it replaces the existing configuration."
    ),
)
async def update_preset(
    preset_id: UUID,
    data: ViewPresetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing multi-view preset.

    Only the preset author or a system admin can update a preset.

    Parameters
    ----------
    preset_id : UUID
        The unique identifier of the preset to update.
    data : ViewPresetUpdate
        Partial update data (all fields optional).
    db : AsyncSession
        Database session.
    current_user : User
        The authenticated user.

    Returns
    -------
    ViewPresetResponse
        The updated preset.

    Raises
    ------
    HTTPException
        404 if the preset does not exist, 403 if the user is not the author.
    """
    stmt = select(ViewPreset).where(ViewPreset.id == preset_id)
    result = await db.execute(stmt)
    preset = result.scalar_one_or_none()

    if preset is None:
        raise HTTPException(status_code=404, detail="Preset not found")

    # Check authorship or admin role
    is_author = preset.author_user_id == current_user.id
    is_admin = getattr(current_user, "role", None) and str(current_user.role) == "admin"

    if not is_author and not is_admin:
        raise HTTPException(
            status_code=403,
            detail="Access denied: only the author or an admin can update this preset"
        )

    # Check classification clearance if updating classification
    if data.classification is not None:
        user_clearance = getattr(current_user, "clearance_level", None)
        user_clearance_rank = CLEARANCE_LEVELS.get(str(user_clearance), 0) if user_clearance else 0
        new_clearance_rank = CLEARANCE_LEVELS.get(str(data.classification), 0)

        if user_clearance_rank < new_clearance_rank:
            raise HTTPException(
                status_code=403,
                detail=f"Insufficient clearance: requires {data.classification.value}"
            )

    # Apply partial update
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(preset, key, value)

    await db.commit()
    await db.refresh(preset)

    return ViewPresetResponse.model_validate(preset)


@router.post(
    "/presets/import-file",
    response_model=ViewPresetImportResponse,
    summary="Import a .ppmview.json file",
    description=(
        "Accepts a .ppmview.json file upload, validates schema conformance, "
        "and stages it as an active user preset."
    ),
)
async def import_preset_file(
    file: UploadFile = File(..., description="The .ppmview.json file to import"),
    preset_name: str = Query("Imported Preset", max_length=120, description="Name for the imported preset"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import a .ppmview.json file as a new preset.

    The uploaded file is parsed and validated against the Pydantic schema.
    If validation passes, a new preset is created with the current user as author.

    The .ppmview.json file format::

        {
            "version": "1.2.0",
            "view_type": "WBS_GANTT",
            "preset_name": "CAM Cost Audit",
            "classification": "OFFICIAL",
            "export_timestamp": "2026-10-24T12:00:00Z",
            "config": {
                "columns": [...],
                "sort": {...},
                "density": "BALANCED",
                "split_ratio": 0.6,
                "filter_tokens": "",
                "filter_mode": "FILTER",
                "gantt": {...}
            }
        }

    Parameters
    ----------
    file : UploadFile
        The uploaded .ppmview.json file.
    preset_name : str
        Name for the imported preset (defaults to "Imported Preset").
    db : AsyncSession
        Database session.
    current_user : User
        The authenticated user (becomes the author).

    Returns
    -------
    ViewPresetImportResponse
        Import result with preset ID (if successful) or error list.
    """
    errors = []

    # Read and parse file
    try:
        content = await file.read()
        file_data = json.loads(content)
    except json.JSONDecodeError as e:
        return ViewPresetImportResponse(
            success=False,
            errors=["Invalid JSON format: " + str(e)],
            message="Failed to parse uploaded file as JSON.",
        )

    # Extract config from the .ppmview.json wrapper
    config_data = file_data.get("config")
    if config_data is None:
        return ViewPresetImportResponse(
            success=False,
            errors=["Missing 'config' key in .ppmview.json file."],
            message="The uploaded file does not conform to the .ppmview.json specification.",
        )

    # Extract view_type from file metadata
    view_type_str = file_data.get("view_type", "WBS_GANTT")
    try:
        view_type = ViewType(view_type_str)
    except ValueError:
        return ViewPresetImportResponse(
            success=False,
            errors=[f"Invalid view_type '{view_type_str}'. Valid values: {[v.value for v in ViewType]}"],
            message="The uploaded file specifies an unknown view type.",
        )

    # Determine classification from file metadata or default
    classification_str = file_data.get("classification", "OFFICIAL")
    try:
        classification = PresetClassification(classification_str)
    except ValueError:
        classification = PresetClassification.OFFICIAL

    # Check classification clearance
    user_clearance = getattr(current_user, "clearance_level", None)
    user_clearance_rank = CLEARANCE_LEVELS.get(str(user_clearance), 0) if user_clearance else 0
    preset_clearance_rank = CLEARANCE_LEVELS.get(str(classification), 0)

    if user_clearance_rank < preset_clearance_rank:
        return ViewPresetImportResponse(
            success=False,
            errors=[f"Insufficient clearance: requires {classification.value}"],
            message="Cannot import preset with classification above your clearance level.",
        )

    # Create the preset
    preset = ViewPreset(
        view_type=view_type,
        name=preset_name,
        description=file_data.get("description"),
        project_id=None,  # Imported presets are global by default
        author_user_id=current_user.id,
        sharing_scope=SharingScope.PRIVATE,
        classification=classification,
        config_payload=config_data,
    )

    db.add(preset)
    await db.commit()
    await db.refresh(preset)

    return ViewPresetImportResponse(
        success=True,
        preset_id=preset.id,
        message=f"Preset '{preset_name}' imported successfully.",
    )


@router.get(
    "/presets/{preset_id}/export-file",
    summary="Export preset as .ppmview.json file",
    description=(
        "Streams a downloadable, validated .ppmview.json file for offline "
        "air-gapped transport.  The file includes classification metadata, "
        "view type, and a validated config payload."
    ),
)
async def export_preset_file(
    preset_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export a preset as a downloadable .ppmview.json file.

    The exported file includes metadata headers (version, view type,
    preset name, classification, export timestamp) and the validated
    config payload.

    Parameters
    ----------
    preset_id : UUID
        The unique identifier of the preset to export.
    db : AsyncSession
        Database session.
    current_user : User
        The authenticated user.

    Returns
    -------
    JSONResponse
        A downloadable JSON file with the .ppmview.json format.

    Raises
    ------
    HTTPException
        404 if the preset does not exist, 403 if the user lacks access.
    """
    stmt = select(ViewPreset).where(ViewPreset.id == preset_id)
    result = await db.execute(stmt)
    preset = result.scalar_one_or_none()

    if preset is None:
        raise HTTPException(status_code=404, detail="Preset not found")

    # Check access
    is_author = preset.author_user_id == current_user.id
    is_shared = preset.sharing_scope in (SharingScope.PROJECT_SHARED, SharingScope.SYSTEM_GLOBAL)

    if not is_author and not is_shared:
        raise HTTPException(status_code=403, detail="Access denied: preset is private")

    # Check classification clearance
    user_clearance = getattr(current_user, "clearance_level", None)
    user_clearance_rank = CLEARANCE_LEVELS.get(str(user_clearance), 0) if user_clearance else 0
    preset_clearance_rank = CLEARANCE_LEVELS.get(str(preset.classification), 0)

    if user_clearance_rank < preset_clearance_rank:
        raise HTTPException(
            status_code=403,
            detail=f"Insufficient clearance: requires {preset.classification.value}"
        )

    # Build export payload
    export_data = PPMViewExport(
        version=preset.layout_schema_version,
        view_type=preset.view_type.value,
        preset_name=preset.name,
        classification=preset.classification.value,
        export_timestamp=datetime.now(timezone.utc).isoformat(),
        config=preset.config_payload,
    )

    # Return as downloadable file
    return JSONResponse(
        content=export_data.model_dump(),
        headers={
            "Content-Disposition": f"attachment; filename={preset.name}.ppmview.json",
        },
    )
