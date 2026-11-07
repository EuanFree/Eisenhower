"""Spatial location tracking and asset custody API router.

This module provides the REST API endpoints for managing physical asset
locations, querying location inventories, and retrieving custody history.

It is the web-facing layer for the spatial tracking system, sitting on top
of :mod:`app.services.spatial`.  All endpoints require JWT authentication.

Endpoints
~~~~~~~~~

- **POST /relocate** — Execute an asset relocation with clearance validation.
- **GET /locations/{id}/inventory** — Query all assets in a location and
  its sub-locations.
- **GET /assets/{id}/custody-history** — Retrieve the complete movement
  trail for an asset.

Security
~~~~~~~~

All endpoints require:

1. **JWT Authentication** — The user must provide a valid JWT token.
2. **Clearance Validation** — The ``relocate`` endpoint enforces that the
   user has sufficient clearance for the target location and that the asset's
   classification does not exceed the location's rating.

Usage Examples
~~~~~~~~~~~~~~

Relocate an asset::

    POST /api/v1/spatial/relocate
    {
        "resource_id": "asset-uuid",
        "target_location_id": "room-uuid",
        "reason": "Move test bench to integration bay"
    }

Query location inventory::

    GET /api/v1/spatial/locations/{location_id}/inventory

Get custody history::

    GET /api/v1/spatial/assets/{asset_id}/custody-history
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.utils.auth import get_current_user
from app.models.models import User
from app.schemas.schemas import (
    AssetRelocateRequest,
    AssetRelocateResponse,
    AssetCustodyHistoryResponse,
    LocationInventoryResponse,
)
from app.services.spatial import (
    relocate_asset,
    get_contained_assets,
    get_asset_custody_history,
)

router = APIRouter()


@router.post(
    "/relocate",
    response_model=AssetRelocateResponse,
    status_code=status.HTTP_200_OK,
    summary="Relocate a physical asset to a new location",
    description=(
        "Execute an asset relocation with full security clearance validation. "
        "Before the move is permitted, the system checks:\n\n"
        "1. The target location exists and is active.\n"
        "2. The moving user has clearance >= the target location's classification.\n"
        "3. The asset's classification does not exceed the target location's rating.\n\n"
        "The move is recorded in both AssetLocationLedger (custody chain) and "
        "ForensicAuditLog (tamper-evident audit trail)."
    ),
)
async def relocate_asset_endpoint(
    request: AssetRelocateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Execute an asset relocation with clearance validation.

    This endpoint moves a physical asset (ResourceNode with type ASSET or
    EQUIPMENT) from its current location to a new location.  The move is
    subject to two clearance interlocks:

    1. **User vs Location** — The moving user must have clearance at or
       above the target location's security classification.

    2. **Asset vs Location** — The asset's own classification must not
       exceed the target location's rating.

    Parameters
    ----------
    request : AssetRelocateRequest
        The relocation request containing resource ID, target location ID,
        reason, and optional task ID and authorisation details.
    current_user : User
        The authenticated user performing the move (injected by FastAPI).
    db : Session
        Database session (injected by FastAPI).

    Returns
    -------
    AssetRelocateResponse
        Confirmation of the move, including the ledger entry ID and timestamp.

    Raises
    ------
    HTTPException(404)
        If the resource, target location, or user is not found.
    HTTPException(403)
        If the user lacks clearance or the asset's classification exceeds
        the location's rating.
    HTTPException(400)
        If the resource is not an ASSET or EQUIPMENT type.
    """
    ledger_entry = await relocate_asset(
        resource_id=request.resource_id,
        target_location_id=request.target_location_id,
        user_id=current_user.id,
        reason=request.reason,
        db=db,
        task_id=request.task_id,
        authorized_by_user_id=request.authorized_by_user_id,
        notes=request.notes,
    )

    return AssetRelocateResponse(
        ledger_id=str(ledger_entry.id),
        resource_id=str(ledger_entry.resource_node_id),
        from_location_id=(
            str(ledger_entry.from_location_id)
            if ledger_entry.from_location_id
            else None
        ),
        to_location_id=str(ledger_entry.to_location_id),
        movement_timestamp=ledger_entry.movement_timestamp,
    )


@router.get(
    "/locations/{location_id}/inventory",
    response_model=LocationInventoryResponse,
    summary="Get all assets in a location and its sub-locations",
    description=(
        "Recursively find all physical assets and equipment currently located "
        "within a given facility, zone, room, container, or sub-container. "
        "Uses the ltree subpath operator to traverse the location hierarchy."
    ),
)
async def get_location_inventory_endpoint(
    location_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all physical equipment currently within a spatial sub-tree.

    This endpoint queries the location hierarchy to find all assets located
    within the specified location and any of its sub-locations.  For example,
    querying a FACILITY will return assets in the facility itself, plus all
    assets in every ZONE, ROOM, CONTAINER, and SUB_CONTAINER within it.

    Parameters
    ----------
    location_id : str
        UUID of the LocationNode to query.
    current_user : User
        The authenticated user (injected by FastAPI).
    db : Session
        Database session (injected by FastAPI).

    Returns
    -------
    LocationInventoryResponse
        Complete inventory including location details, list of assets,
        and total asset count.

    Raises
    ------
    HTTPException(404)
        If the location is not found.
    """
    inventory = await get_contained_assets(
        location_id=location_id,
        db=db,
    )

    return LocationInventoryResponse(**inventory)


@router.get(
    "/assets/{resource_id}/custody-history",
    response_model=AssetCustodyHistoryResponse,
    summary="Get the complete custody history for an asset",
    description=(
        "Return the chronological movement trail for a physical asset, "
        "showing every location change from initial commissioning to the "
        "present.  Each entry includes source and destination location names, "
        "the user who moved the asset, and the reason for the move."
    ),
)
async def get_asset_custody_history_endpoint(
    resource_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the chronological movement trail for an asset.

    This endpoint retrieves all AssetLocationLedger entries for the specified
    asset, ordered from oldest to newest.  It forms a complete chain of
    custody trail showing where the asset has been at all times.

    Parameters
    ----------
    resource_id : str
        UUID of the ResourceNode whose custody history is requested.
    current_user : User
        The authenticated user (injected by FastAPI).
    db : Session
        Database session (injected by FastAPI).

    Returns
    -------
    AssetCustodyHistoryResponse
        Complete custody history including current location, chronological
        list of all moves, and total move count.

    Raises
    ------
    HTTPException(404)
        If the resource is not found.
    """
    history = await get_asset_custody_history(
        resource_id=resource_id,
        db=db,
    )

    return AssetCustodyHistoryResponse(**history)
