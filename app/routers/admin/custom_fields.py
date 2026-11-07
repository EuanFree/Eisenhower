"""Admin router for Custom Field Definition CRUD operations.

This module provides the API endpoints for managing custom field definitions
in the portfolio management system.  Only users with PMO_DIRECTOR or
SYSTEM_ADMIN roles can create, update, or delete field definitions.

Endpoints
~~~~~~~~~

- **GET /custom-fields** — List definitions (filterable by target_entity).
- **POST /custom-fields** — Create a new definition.
- **GET /custom-fields/{id}** — Get a single definition.
- **PUT /custom-fields/{id}** — Update an existing definition.
- **DELETE /custom-fields/{id}** — Soft-deactivate a definition.

Access Control
~~~~~~~~~~~~~~

All endpoints require JWT authentication.  Create, update, and delete
operations require the SYSTEM_ADMIN role.  List and get operations are
available to all authenticated users.

Usage
~~~~~

.. code-block:: python

    from app.routers.admin.custom_fields import router

    app.include_router(router, prefix="/api/v1/admin")

See Also
--------
- :mod:`app.models.custom_fields` — CustomFieldDefinition model.
- :mod:`app.schemas.custom_fields` — Pydantic schemas.
- :mod:`app.services.custom_field_engine` — Validation engine.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.custom_fields import CustomFieldDefinition
from app.schemas.custom_fields import (
    CustomFieldDefinitionCreate,
    CustomFieldDefinitionUpdate,
    CustomFieldDefinitionResponse,
    CustomFieldDefinitionListResponse,
)
from app.utils.auth import get_current_user
from app.models.models import User, UserRole


router = APIRouter()


# ============================================================================
# Role Check Helper
# ============================================================================

def _require_admin(user: User) -> None:
    """Check that the user has SYSTEM_ADMIN role.

    Args:
        user: The authenticated user.

    Raises:
        HTTPException: If the user is not an admin.
    """
    role = user.role
    if hasattr(role, "value"):
        role = role.value
    if role != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only SYSTEM_ADMIN users can modify custom field definitions.",
        )


# ============================================================================
# List Custom Fields
# ============================================================================

@router.get(
    "/custom-fields",
    response_model=CustomFieldDefinitionListResponse,
    summary="List custom field definitions",
    description=(
        "List all custom field definitions, optionally filtered by target "
        "entity type.  Returns both active and inactive definitions."
    ),
)
async def list_custom_fields(
    target_entity: Optional[str] = Query(
        None,
        description="Filter by target entity: WORK_ITEM, RESOURCE, FACILITY, CDRL",
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CustomFieldDefinitionListResponse:
    """List custom field definitions.

    Args:
        target_entity: Optional filter by entity type.
        db: Database session.
        user: Authenticated user.

    Returns:
        List of custom field definitions with total count.
    """
    query = db.query(CustomFieldDefinition)

    if target_entity is not None:
        query = query.filter(CustomFieldDefinition.target_entity == target_entity)

    fields = query.order_by(CustomFieldDefinition.created_at.desc()).all()

    return CustomFieldDefinitionListResponse(
        fields=[
            CustomFieldDefinitionResponse.model_validate(f)
            for f in fields
        ],
        total=len(fields),
    )


# ============================================================================
# Get Custom Field
# ============================================================================

@router.get(
    "/custom-fields/{field_id}",
    response_model=CustomFieldDefinitionResponse,
    summary="Get custom field definition",
    description="Retrieve a single custom field definition by ID.",
)
async def get_custom_field(
    field_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CustomFieldDefinitionResponse:
    """Get a single custom field definition.

    Args:
        field_id: The field definition UUID.
        db: Database session.
        user: Authenticated user.

    Returns:
        The custom field definition.

    Raises:
        HTTPException: If the field is not found.
    """
    field = db.query(CustomFieldDefinition).filter(
        CustomFieldDefinition.id == field_id
    ).first()

    if field is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Custom field definition '{field_id}' not found.",
        )

    return CustomFieldDefinitionResponse.model_validate(field)


# ============================================================================
# Create Custom Field
# ============================================================================

@router.post(
    "/custom-fields",
    response_model=CustomFieldDefinitionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create custom field definition",
    description=(
        "Create a new custom field definition.  Requires SYSTEM_ADMIN role. "
        "The field_key must be unique and start with 'cf_'."
    ),
)
async def create_custom_field(
    data: CustomFieldDefinitionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CustomFieldDefinitionResponse:
    """Create a new custom field definition.

    Args:
        data: The field definition data.
        db: Database session.
        user: Authenticated user.

    Returns:
        The created field definition.

    Raises:
        HTTPException: If the user is not an admin or the key already exists.
    """
    _require_admin(user)

    # Check for duplicate field_key
    existing = db.query(CustomFieldDefinition).filter(
        CustomFieldDefinition.field_key == data.field_key
    ).first()

    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Custom field key '{data.field_key}' already exists.",
        )

    field = CustomFieldDefinition(
        field_key=data.field_key,
        display_label=data.display_label,
        target_entity=data.target_entity,
        applicable_tiers=data.applicable_tiers,
        data_type=data.data_type,
        enum_options=data.enum_options,
        validation_rules=data.validation_rules,
        default_value=data.default_value,
        is_mandatory=data.is_mandatory,
        read_clearance_level=data.read_clearance_level,
        write_clearance_level=data.write_clearance_level,
        required_roles=data.required_roles,
    )

    db.add(field)
    db.commit()
    db.refresh(field)

    return CustomFieldDefinitionResponse.model_validate(field)


# ============================================================================
# Update Custom Field
# ============================================================================

@router.put(
    "/custom-fields/{field_id}",
    response_model=CustomFieldDefinitionResponse,
    summary="Update custom field definition",
    description=(
        "Update an existing custom field definition.  Requires SYSTEM_ADMIN "
        "role.  Only the provided fields will be updated."
    ),
)
async def update_custom_field(
    field_id: str,
    data: CustomFieldDefinitionUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CustomFieldDefinitionResponse:
    """Update a custom field definition.

    Args:
        field_id: The field definition UUID.
        data: The fields to update.
        db: Database session.
        user: Authenticated user.

    Returns:
        The updated field definition.

    Raises:
        HTTPException: If the field is not found or user is not admin.
    """
    _require_admin(user)

    field = db.query(CustomFieldDefinition).filter(
        CustomFieldDefinition.id == field_id
    ).first()

    if field is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Custom field definition '{field_id}' not found.",
        )

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(field, key, value)

    db.commit()
    db.refresh(field)

    return CustomFieldDefinitionResponse.model_validate(field)


# ============================================================================
# Delete Custom Field (Soft Deactivate)
# ============================================================================

@router.delete(
    "/custom-fields/{field_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete custom field definition",
    description=(
        "Soft-deactivate a custom field definition.  Requires SYSTEM_ADMIN "
        "role.  The field is not physically deleted; its is_active flag is "
        "set to False."
    ),
)
async def delete_custom_field(
    field_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """Soft-deactivate a custom field definition.

    Args:
        field_id: The field definition UUID.
        db: Database session.
        user: Authenticated user.

    Raises:
        HTTPException: If the field is not found or user is not admin.
    """
    _require_admin(user)

    field = db.query(CustomFieldDefinition).filter(
        CustomFieldDefinition.id == field_id
    ).first()

    if field is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Custom field definition '{field_id}' not found.",
        )

    field.is_active = False
    db.commit()
