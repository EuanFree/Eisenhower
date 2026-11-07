"""Custom Field Validation and Masking Engine.

This module provides the server-side validation and security masking layer
for custom field values stored in the ``custom_attributes`` JSONB column
of portfolio management entities.

Validation Pipeline
~~~~~~~~~~~~~~~~~~~

When a user creates or updates an entity, the :func:`validate_and_sanitize_custom_fields`
function performs these checks in order:

1. **Field Discovery** — Loads active :class:`CustomFieldDefinition` records
   matching the entity type and tier.
2. **Write Clearance Gate** — Drops any field where the user's clearance
   is below the field's ``write_clearance_level``.
3. **Role Gate** — Drops any field where the user lacks a required role.
4. **Type Validation** — Validates the submitted value against the declared
   data type (STRING, INTEGER, DECIMAL, BOOLEAN, DATE, SINGLE_ENUM, MULTI_ENUM, CURRENCY).
5. **Constraint Validation** — Checks ``min``, ``max``, and ``regex_pattern``
   rules from the field definition.
6. **Mandatory Check** — Rejects with HTTP 422 if an active mandatory field
   is missing from the input.

Masking Pipeline
~~~~~~~~~~~~~~~~

When returning entity data to a user, :func:`mask_custom_fields_for_user`
replaces field values with ``'[RESTRICTED]'`` for any field where the
caller's clearance is below the ``read_clearance_level``.

Usage
~~~~~

.. code-block:: python

    from app.services.custom_field_engine import (
        validate_and_sanitize_custom_fields,
        mask_custom_fields_for_user,
    )

    # On create/update
    sanitized = validate_and_sanitize_custom_fields(
        entity_type="WORK_ITEM",
        tier="WP",
        input_fields=data.custom_attributes or {},
        user_context=user,
        db=db,
    )

    # On read
    masked = mask_custom_fields_for_user(
        entity_type="WORK_ITEM",
        custom_attributes=node.custom_attributes or {},
        user_context=user,
        db=db,
    )

See Also
--------
- :mod:`app.models.custom_fields` — CustomFieldDefinition model.
- :mod:`app.schemas.custom_fields` — Pydantic schemas.
- :mod:`app.routers.admin.custom_fields` — Admin CRUD endpoints.
"""

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.custom_fields import CustomFieldDefinition
from app.models.models import User
from app.core.abac import CLEARANCE_LEVELS


# ============================================================================
# Clearance Level Mapping
# ============================================================================

CLEARANCE_RANKS = {
    "OFFICIAL": 1,
    "OFFICIAL_SENSITIVE": 2,
    "SECRET": 3,
    "TOP_SECRET": 4,
}


def _user_clearance_rank(user: User) -> int:
    """Get the numeric rank of a user's clearance level.

    Args:
        user: The authenticated user.

    Returns:
        Integer rank (higher = more clearance).
    """
    clearance = getattr(user, "clearance_level", None)
    if clearance is None:
        return 0
    if hasattr(clearance, "value"):
        clearance = clearance.value
    return CLEARANCE_RANKS.get(str(clearance), 0)


def _user_roles(user: User) -> set:
    """Get the set of effective roles for a user.

    Args:
        user: The authenticated user.

    Returns:
        Set of role strings.
    """
    role = getattr(user, "role", None)
    if role is None:
        return {"USER"}
    if hasattr(role, "value"):
        role = role.value
    roles = {str(role).upper(), "USER"}
    # Check for delegated roles in custom_attributes
    custom_attrs = getattr(user, "custom_attributes", None) or {}
    delegated = custom_attrs.get("delegated_roles", [])
    roles.update(str(r).upper() for r in delegated)
    return roles


# ============================================================================
# Field Discovery
# ============================================================================

def _load_active_fields(
    db: Session,
    entity_type: str,
    tier: Optional[str] = None,
) -> List[CustomFieldDefinition]:
    """Load active custom field definitions for an entity type and tier.

    Args:
        db: Database session.
        entity_type: Entity type (WORK_ITEM, RESOURCE, FACILITY, CDRL).
        tier: Optional WBS tier filter (PROG, PROJ, CA, WP, TASK, MILESTONE).

    Returns:
        List of active CustomFieldDefinition records.
    """
    stmt = select(CustomFieldDefinition).where(
        CustomFieldDefinition.target_entity == entity_type,
        CustomFieldDefinition.is_active == True,
    )

    # Filter by applicable_tiers if specified
    fields = db.execute(stmt).scalars().all()

    if tier is not None:
        fields = [
            f for f in fields
            if f.applicable_tiers is None or tier in f.applicable_tiers
        ]

    return fields


# ============================================================================
# Type Validation
# ============================================================================

def _validate_type(field_key: str, data_type: str, value: Any, enum_options: Optional[list] = None) -> Any:
    """Validate and coerce a value against its declared data type.

    Args:
        field_key: The custom field key (for error messages).
        data_type: Declared data type string.
        value: The submitted value.
        enum_options: Optional list of valid enum options.

    Returns:
        The coerced value.

    Raises:
        HTTPException: If the value does not match the declared type.
    """
    if value is None:
        return None

    if data_type == "STRING":
        if not isinstance(value, str):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Field '{field_key}' expects a string value, got {type(value).__name__}.",
            )
        return value

    if data_type == "INTEGER":
        try:
            return int(value)
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Field '{field_key}' expects an integer value, got '{value}'.",
            )

    if data_type == "DECIMAL":
        try:
            return float(Decimal(str(value)))
        except (InvalidOperation, ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Field '{field_key}' expects a decimal value, got '{value}'.",
            )

    if data_type == "CURRENCY":
        try:
            return float(Decimal(str(value)))
        except (InvalidOperation, ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Field '{field_key}' expects a currency value, got '{value}'.",
            )

    if data_type == "BOOLEAN":
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            if value.lower() in ("true", "1", "yes"):
                return True
            if value.lower() in ("false", "0", "no"):
                return False
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Field '{field_key}' expects a boolean value, got '{value}'.",
        )

    if data_type == "DATE":
        if isinstance(value, date):
            return value.isoformat()
        if isinstance(value, str):
            try:
                datetime.strptime(value, "%Y-%m-%d")
                return value
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Field '{field_key}' expects a date (YYYY-MM-DD), got '{value}'.",
                )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Field '{field_key}' expects a date value, got '{value}'.",
        )

    if data_type == "SINGLE_ENUM":
        if enum_options is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Field '{field_key}' is SINGLE_ENUM but has no enum_options defined.",
            )
        if value not in enum_options:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Field '{field_key}' must be one of {enum_options}, got '{value}'.",
            )
        return value

    if data_type == "MULTI_ENUM":
        if enum_options is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Field '{field_key}' is MULTI_ENUM but has no enum_options defined.",
            )
        if not isinstance(value, list):
            value = [value]
        invalid = [v for v in value if v not in enum_options]
        if invalid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Field '{field_key}' contains invalid options: {invalid}. Valid: {enum_options}.",
            )
        return value

    # Unknown type — pass through
    return value


def _validate_constraints(field_key: str, validation_rules: Optional[dict], value: Any) -> None:
    """Validate a value against min/max/regex constraints.

    Args:
        field_key: The custom field key (for error messages).
        validation_rules: JSONB validation rules from the field definition.
        value: The value to validate.

    Raises:
        HTTPException: If the value violates any constraint.
    """
    if validation_rules is None or value is None:
        return

    # Numeric bounds
    if isinstance(value, (int, float)):
        min_val = validation_rules.get("min")
        max_val = validation_rules.get("max")
        if min_val is not None and value < min_val:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Field '{field_key}' value {value} is below minimum {min_val}.",
            )
        if max_val is not None and value > max_val:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Field '{field_key}' value {value} exceeds maximum {max_val}.",
            )

    # Regex pattern
    regex_pattern = validation_rules.get("regex_pattern")
    if regex_pattern is not None and isinstance(value, str):
        if not re.match(regex_pattern, value):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Field '{field_key}' value '{value}' does not match pattern '{regex_pattern}'.",
            )


# ============================================================================
# Main Validation Entry Point
# ============================================================================

def validate_and_sanitize_custom_fields(
    entity_type: str,
    input_fields: Dict[str, Any],
    user_context: User,
    db: Session,
    tier: Optional[str] = None,
) -> Dict[str, Any]:
    """Validate and sanitize custom field values for an entity.

    This is the main entry point for custom field validation on create/update.
    It loads active field definitions, enforces write clearance and role gates,
    validates data types and constraints, and checks mandatory fields.

    Args:
        entity_type: Entity type (WORK_ITEM, RESOURCE, FACILITY, CDRL).
        input_fields: Dictionary of submitted custom field values.
        user_context: The authenticated user.
        db: Active database session.
        tier: Optional WBS tier for WORK_ITEM entities.

    Returns:
        Sanitized dictionary of custom field values ready to persist.

    Raises:
        HTTPException: If validation fails (HTTP 422).
    """
    active_fields = _load_active_fields(db, entity_type, tier)
    field_map = {f.field_key: f for f in active_fields}

    user_rank = _user_clearance_rank(user_context)
    user_roles = _user_roles(user_context)

    sanitized: Dict[str, Any] = {}

    # Process submitted fields
    for field_key, value in input_fields.items():
        field_def = field_map.get(field_key)

        if field_def is None:
            # Unknown field — pass through silently (may be legacy data)
            sanitized[field_key] = value
            continue

        # Write clearance gate
        write_rank = CLEARANCE_RANKS.get(field_def.write_clearance_level, 0)
        if user_rank < write_rank:
            # User cannot write this field — drop it
            continue

        # Role gate
        required_roles = set(field_def.required_roles or ["USER"])
        if not required_roles.intersection(user_roles):
            # User lacks required role — drop it
            continue

        # Type validation
        coerced = _validate_type(
            field_key,
            field_def.data_type,
            value,
            field_def.enum_options,
        )

        # Constraint validation
        _validate_constraints(field_key, field_def.validation_rules, coerced)

        sanitized[field_key] = coerced

    # Mandatory field check
    for field_def in active_fields:
        if field_def.is_mandatory and field_def.field_key not in sanitized:
            # Check if the user has clearance to see this field
            read_rank = CLEARANCE_RANKS.get(field_def.read_clearance_level, 0)
            if user_rank >= read_rank:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        f"Mandatory field '{field_def.field_key}' "
                        f"({field_def.display_label}) is missing."
                    ),
                )
            else:
                # Apply default value if available
                if field_def.default_value is not None:
                    sanitized[field_def.field_key] = field_def.default_value

    return sanitized


# ============================================================================
# Masking Entry Point
# ============================================================================

def mask_custom_fields_for_user(
    entity_type: str,
    custom_attributes: Dict[str, Any],
    user_context: User,
    db: Session,
    tier: Optional[str] = None,
) -> Dict[str, Any]:
    """Mask custom field values the user is not cleared to read.

    Replaces field values with ``'[RESTRICTED]'`` for any field where
    the caller's clearance is below the ``read_clearance_level``.

    Args:
        entity_type: Entity type (WORK_ITEM, RESOURCE, FACILITY, CDRL).
        custom_attributes: The entity's custom_attributes JSONB dict.
        user_context: The authenticated user.
        db: Active database session.
        tier: Optional WBS tier for WORK_ITEM entities.

    Returns:
        Dictionary with masked values where the user lacks clearance.
    """
    if not custom_attributes:
        return {}

    active_fields = _load_active_fields(db, entity_type, tier)
    field_map = {f.field_key: f for f in active_fields}

    user_rank = _user_clearance_rank(user_context)

    masked = dict(custom_attributes)

    for field_key, value in masked.items():
        field_def = field_map.get(field_key)
        if field_def is None:
            continue

        read_rank = CLEARANCE_RANKS.get(field_def.read_clearance_level, 0)
        if user_rank < read_rank:
            masked[field_key] = "[RESTRICTED]"

    return masked
