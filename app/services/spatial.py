"""Spatial location tracking and asset custody management service.

This module provides the core business logic for tracking physical asset
movements, enforcing security clearance interlocks during relocations,
and querying the inventory of assets contained within a location hierarchy.

In defence programme management, the physical custody chain of classified
equipment must be rigorously tracked.  This service ensures that every
move is audited, that clearance rules are enforced at move time, and that
programme managers can answer the question "what equipment is in this room?"
with a complete, recursive inventory.

Core Operations
~~~~~~~~~~~~~~~

1. **Asset Relocation** — ``relocate_asset()`` moves an asset from one
   location to another with full clearance validation and audit logging.

2. **Location Inventory** — ``get_contained_assets()`` recursively finds
   all assets within a location and its sub-locations using ltree path
   containment.

3. **Custody History** — ``get_asset_custody_history()`` returns the
   complete chronological movement trail for an asset.

Clearance Interlocks
~~~~~~~~~~~~~~~~~~~~

Before any move is permitted, the system enforces two security checks:

1. **User Clearance** — The moving user must have a clearance level at or
   above the target location's ``security_classification``.  An OFFICIAL
   user cannot move an asset into a SECRET-rated SCIF.

2. **Asset Classification** — The asset's own ``security_classification``
   must not exceed the target location's rating.  A SECRET asset cannot
   be placed in an OFFICIAL storage bay.

If either check fails, the move is rejected with an ``HTTPException``
(status 403) and the reason is logged.

Integration with ForensicAuditLog
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Every successful relocation creates an entry in the :class:`ForensicAuditLog`
with action type ``ASSET_RELOCATE``.  This provides a tamper-evident audit
trail: if anyone modifies a past audit entry, the SHA-256 hash chain breaks
for all subsequent entries.

Usage Examples
~~~~~~~~~~~~~~

Relocate an asset::

    from app.services.spatial import relocate_asset

    result = await relocate_asset(
        resource_id="asset-uuid",
        target_location_id="room-uuid",
        user_id=42,
        reason="Move test bench to integration bay for Phase 2",
        db=session,
    )

Query location inventory::

    from app.services.spatial import get_contained_assets

    inventory = await get_contained_assets(
        location_id="facility-uuid",
        db=session,
    )
    # Returns all assets in the facility and all sub-locations

Get custody history::

    from app.services.spatial import get_asset_custody_history

    history = await get_asset_custody_history(
        resource_id="asset-uuid",
        db=session,
    )
    # Returns chronological list of all moves
"""
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import (
    AssetLocationLedger,
    ForensicAuditLog,
    LocationNode,
    ResourceNode,
    SecurityClassification,
    UniversalBreakdownNode,
    User,
)
from app.core.abac import CLEARANCE_LEVELS, has_sufficient_clearance


# ============================================================================
# Asset Relocation
# ============================================================================


async def relocate_asset(
    resource_id: str,
    target_location_id: str,
    user_id: int,
    reason: str,
    db: Session,
    task_id: Optional[str] = None,
    authorized_by_user_id: Optional[int] = None,
    notes: Optional[str] = None,
) -> AssetLocationLedger:
    """Relocate a physical asset to a new location with clearance validation.

    This is the primary entry point for recording a physical asset move.
    It performs the following steps atomically:

    1. **Validate the asset** — Confirm the ResourceNode exists and is
       an ASSET or EQUIPMENT type.

    2. **Validate the target location** — Confirm the LocationNode exists
       and is active.

    3. **Clearance interlock: User vs Location** — Ensure the moving user's
       clearance level is at or above the target location's classification.

    4. **Clearance interlock: Asset vs Location** — Ensure the asset's
       classification does not exceed the target location's rating.

    5. **Execute the move** — Atomically update ``ResourceNode.current_location_id``
       and create an ``AssetLocationLedger`` entry.

    6. **Audit log** — Record the move in ``ForensicAuditLog`` with SHA-256
       chained hash.

    Clearance Rules
    ~~~~~~~~~~~~~~~

    - A user with OFFICIAL clearance cannot move an asset into a SECRET location.
    - A SECRET asset cannot be placed in an OFFICIAL-rated storage bay.
    - The user must have clearance >= the target location's classification.

    Parameters
    ----------
    resource_id : str
        UUID of the ResourceNode (asset/equipment) being moved.
    target_location_id : str
        UUID of the LocationNode the asset is being moved to.
    user_id : int
        ID of the user performing the move.
    reason : str
        Human-readable explanation of why the asset is being moved.
    db : Session
        Active database session.
    task_id : str or None
        Optional UUID of the PortfolioNode associated with this move.
    authorized_by_user_id : int or None
        Optional user ID of a supervisor who authorised the move.
    notes : str or None
        Additional free-text notes about the move.

    Returns
    -------
    AssetLocationLedger
        The newly created ledger entry recording this move.

    Raises
    ------
    HTTPException(404)
        If the resource, target location, or user is not found.
    HTTPException(403)
        If the user lacks clearance for the target location or the asset's
        classification exceeds the location's rating.
    HTTPException(400)
        If the resource is not an ASSET or EQUIPMENT type.
    """

    # 1. Validate the asset exists
    resource = db.execute(
        select(ResourceNode).where(ResourceNode.id == UUID(resource_id))
    ).scalar_one_or_none()

    if resource is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resource {resource_id} not found",
        )

    # Check resource type is ASSET or EQUIPMENT
    resource_type_str = resource.resource_type.value if resource.resource_type else ""
    if resource_type_str not in ("ASSET", "EQUIPMENT"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Resource type '{resource_type_str}' cannot be relocated; only ASSET or EQUIPMENT types are supported",
        )

    # 2. Validate the target location exists and is active
    target_location = db.execute(
        select(LocationNode).where(LocationNode.id == UUID(target_location_id))
    ).scalar_one_or_none()

    if target_location is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Target location {target_location_id} not found",
        )

    if not target_location.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Target location {target_location_id} is not active",
        )

    # 3. Validate the user exists
    user = db.execute(
        select(User).where(User.id == user_id)
    ).scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found",
        )

    # 4. Clearance interlock: User vs Target Location
    #    The moving user must have clearance >= the target location's classification
    user_clearance = (
        user.clearance_level
        if user.clearance_level
        else SecurityClassification.OFFICIAL
    )
    location_clearance = (
        target_location.security_classification
        if target_location.security_classification
        else SecurityClassification.OFFICIAL
    )

    if not has_sufficient_clearance(user_clearance, location_clearance):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"User clearance ({user_clearance.value}) is insufficient to move asset "
                f"into location classified {location_clearance.value}. "
                f"Required: {location_clearance.value} or higher."
            ),
        )

    # 5. Clearance interlock: Asset vs Target Location
    #    The asset's classification must not exceed the location's rating
    asset_clearance = (
        resource.security_classification
        if resource.security_classification
        else SecurityClassification.OFFICIAL
    )

    # Asset clearance must not exceed location rating
    asset_level = CLEARANCE_LEVELS.get(asset_clearance, 0)
    location_level = CLEARANCE_LEVELS.get(location_clearance, 0)
    if asset_level > location_level:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Asset classification ({asset_clearance.value}) exceeds target location "
                f"rating ({location_clearance.value}). "
                f"A {asset_clearance.value} asset cannot be placed in a {location_clearance.value} location."
            ),
        )

    # 6. Execute the move atomically
    # Capture the previous location before updating
    previous_location_id = resource.current_location_id

    # Update the resource's current location
    resource.current_location_id = UUID(target_location_id)

    # Create the immutable ledger entry
    ledger_entry = AssetLocationLedger(
        resource_node_id=UUID(resource_id),
        from_location_id=previous_location_id,
        to_location_id=UUID(target_location_id),
        moved_by_user_id=user_id,
        authorized_by_user_id=authorized_by_user_id,
        associated_task_id=UUID(task_id) if task_id else None,
        movement_reason=reason,
        notes=notes,
    )

    db.add(ledger_entry)

    # 7. Record in ForensicAuditLog
    audit_entry = ForensicAuditLog.create_entry(
        user_upn=user.username or f"user:{user_id}",
        client_ip=None,
        action_type="ASSET_RELOCATE",
        entity_type="ResourceNode",
        entity_id=UUID(resource_id),
        json_diff={
            "resource_id": str(resource_id),
            "resource_name": resource.name,
            "from_location_id": str(previous_location_id) if previous_location_id else None,
            "to_location_id": target_location_id,
            "reason": reason,
        },
        security_marking=asset_clearance.value,
        db_session=db,
    )

    db.add(audit_entry)
    db.commit()
    db.refresh(ledger_entry)

    return ledger_entry


# ============================================================================
# Location Inventory
# ============================================================================


async def get_contained_assets(
    location_id: str,
    db: Session,
) -> dict:
    """Recursively find all assets within a location and its sub-locations.

    Uses the PostgreSQL ltree subpath operator (``<@``) to find all
    LocationNodes that are descendants of the queried location, then
    finds all ResourceNodes whose ``current_location_id`` points to
    any of those locations.

    For example, if the queried location is a FACILITY, this will return
    all assets in the facility itself, plus all assets in every ZONE,
    ROOM, CONTAINER, and SUB_CONTAINER within that facility.

    Cross-Database Compatibility
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    On PostgreSQL, this uses the native ltree ``@>`` containment operator.
    On SQLite (for testing), it falls back to string-based prefix matching
    on the ``path`` column.

    Parameters
    ----------
    location_id : str
        UUID of the LocationNode to query.
    db : Session
        Active database session.

    Returns
    -------
    dict
        A dictionary containing:

        - ``location_id`` (str): UUID of the queried location.
        - ``location_name`` (str): Name of the queried location.
        - ``tier`` (str): Location tier (SITE, FACILITY, ZONE, etc.).
        - ``assets`` (list[dict]): List of asset dictionaries, each with
          ``resource_id``, ``name``, ``code``, ``resource_type``,
          ``security_classification``, ``standard_hourly_rate``,
          and ``is_generic_placeholder``.
        - ``total_assets`` (int): Total number of assets found.

    Raises
    ------
    HTTPException(404)
        If the location is not found.
    """

    # 1. Validate the location exists
    location = db.execute(
        select(LocationNode).where(LocationNode.id == UUID(location_id))
    ).scalar_one_or_none()

    if location is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Location {location_id} not found",
        )

    # 2. Find all descendant locations (including the location itself)
    #    Using string-based path prefix matching for cross-database compatibility
    location_path = location.path or ""
    descendant_locations = db.execute(
        select(LocationNode).where(
            LocationNode.path.like(f"{location_path}.%")
            | (LocationNode.id == UUID(location_id))
        )
    ).all()

    # Collect all location IDs (including the root)
    location_ids = [UUID(location_id)]
    for row in descendant_locations:
        if hasattr(row, "__iter__") and not isinstance(row, LocationNode):
            row = row[0]
        location_ids.append(row.id)

    # 3. Find all resources currently located in any of these locations
    assets = db.execute(
        select(ResourceNode).where(
            ResourceNode.current_location_id.in_(location_ids)
        )
    ).all()

    # Build the asset list
    asset_list = []
    for asset in assets:
        if hasattr(asset, "__iter__") and not isinstance(asset, ResourceNode):
            asset = asset[0]

        asset_list.append({
            "resource_id": str(asset.id),
            "name": asset.name or "",
            "code": asset.code or "",
            "resource_type": asset.resource_type.value if asset.resource_type else "",
            "security_classification": (
                asset.security_classification.value
                if asset.security_classification
                else None
            ),
            "standard_hourly_rate": asset.standard_hourly_rate,
            "is_generic_placeholder": asset.is_generic_placeholder,
        })

    return {
        "location_id": str(location.id),
        "location_name": location.name or "",
        "tier": location.tier.value if location.tier else "",
        "assets": asset_list,
        "total_assets": len(asset_list),
    }


# ============================================================================
# Asset Custody History
# ============================================================================


async def get_asset_custody_history(
    resource_id: str,
    db: Session,
) -> dict:
    """Return the complete chronological custody history for an asset.

    Retrieves all ``AssetLocationLedger`` entries for the specified asset,
    ordered from oldest to newest.  This forms a complete chain of custody
    trail showing where the asset has been at all times.

    Each entry includes the source and destination location names for
    human-readable display.

    Parameters
    ----------
    resource_id : str
        UUID of the ResourceNode whose custody history is requested.
    db : Session
        Active database session.

    Returns
    -------
    dict
        A dictionary containing:

        - ``resource_id`` (str): UUID of the asset.
        - ``resource_name`` (str): Name of the asset.
        - ``current_location_id`` (str or None): Current location UUID.
        - ``current_location_name`` (str or None): Current location name.
        - ``entries`` (list[dict]): Chronological list of custody entries,
          each with ``id``, ``from_location_id``, ``to_location_id``,
          ``from_location_name``, ``to_location_name``, ``moved_by_user_id``,
          ``authorized_by_user_id``, ``associated_task_id``,
          ``movement_timestamp``, ``movement_reason``, and ``notes``.
        - ``total_moves`` (int): Total number of recorded moves.

    Raises
    ------
    HTTPException(404)
        If the resource is not found.
    """

    # 1. Validate the resource exists
    resource = db.execute(
        select(ResourceNode).where(ResourceNode.id == UUID(resource_id))
    ).scalar_one_or_none()

    if resource is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resource {resource_id} not found",
        )

    # 2. Get current location name
    current_location_name = None
    if resource.current_location_id:
        current_location = db.execute(
            select(LocationNode).where(
                LocationNode.id == resource.current_location_id
            )
        ).scalar_one_or_none()
        if current_location:
            current_location_name = current_location.name

    # 3. Get all ledger entries ordered by timestamp
    entries = db.execute(
        select(AssetLocationLedger)
        .where(AssetLocationLedger.resource_node_id == UUID(resource_id))
        .order_by(AssetLocationLedger.movement_timestamp.asc())
    ).all()

    # Build the entry list with location names
    entry_list = []
    for entry in entries:
        from_location_name = None
        to_location_name = ""

        if entry.from_location_id:
            from_loc = db.execute(
                select(LocationNode).where(
                    LocationNode.id == entry.from_location_id
                )
            ).scalar_one_or_none()
            if from_loc:
                from_location_name = from_loc.name

        if entry.to_location_id:
            to_loc = db.execute(
                select(LocationNode).where(
                    LocationNode.id == entry.to_location_id
                )
            ).scalar_one_or_none()
            if to_loc:
                to_location_name = to_loc.name or ""

        entry_list.append({
            "id": str(entry.id),
            "from_location_id": str(entry.from_location_id) if entry.from_location_id else None,
            "to_location_id": str(entry.to_location_id),
            "from_location_name": from_location_name,
            "to_location_name": to_location_name,
            "moved_by_user_id": entry.moved_by_user_id,
            "authorized_by_user_id": entry.authorized_by_user_id,
            "associated_task_id": (
                str(entry.associated_task_id) if entry.associated_task_id else None
            ),
            "movement_timestamp": entry.movement_timestamp,
            "movement_reason": entry.movement_reason,
            "notes": entry.notes,
        })

    return {
        "resource_id": str(resource.id),
        "resource_name": resource.name or "",
        "current_location_id": (
            str(resource.current_location_id) if resource.current_location_id else None
        ),
        "current_location_name": current_location_name,
        "entries": entry_list,
        "total_moves": len(entry_list),
    }
