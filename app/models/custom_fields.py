"""Custom Field Definition Registry.

This module provides the database model for dynamically defined custom fields
that extend the core portfolio management entities (Work Items, Resources,
Facilities, and CDRLs) without requiring schema migrations.

Custom Field Architecture
~~~~~~~~~~~~~~~~~~~~~~~~~

Each custom field is defined by a :class:`CustomFieldDefinition` record that
specifies the field's key, display label, data type, validation rules, and
security clearance requirements. The actual field values are stored in the
``custom_attributes`` JSONB column on the target entity (e.g.,
UniversalBreakdownNode, ResourceNode, LocationNode).

This approach allows PMO administrators to add new tracking fields at runtime
without deploying code changes, while still enforcing type validation, regex
constraints, and security clearance gates.

Storage
~~~~~~~

Custom field values are stored in the ``custom_attributes`` JSONB column on
each entity. A GIN index with ``jsonb_path_ops`` is maintained on this column
for fast querying.

Example::

    {
        "cf_radar_frequency_ghz": 12.5,
        "cf_test_operator_certified": true,
        "cf_delivery_priority": "HIGH"
    }

Security
~~~~~~~~

Each custom field has independent read and write clearance levels. A user
cannot read a field's value if their clearance is below the field's
``read_clearance_level``, and cannot write if below ``write_clearance_level``.
Role-based access control is also enforced via the ``required_roles`` array.

Usage
~~~~~

In a FastAPI endpoint::

    from app.services.custom_field_engine import validate_and_sanitize_custom_fields

    @router.post("/wbs")
    async def create_work_item(data: WorkItemCreate, user: User = Depends(get_current_user)):
        sanitized = validate_and_sanitize_custom_fields(
            entity_type="WORK_ITEM",
            tier=data.tier,
            input_fields=data.custom_attributes or {},
            user_context=user,
        )
        # sanitized fields are safe to persist

See Also
--------
- :mod:`app.services.custom_field_engine` — Validation and masking engine.
- :mod:`app.schemas.custom_fields` — Pydantic schemas for CRUD operations.
- :mod:`app.routers.admin.custom_fields` — Admin CRUD endpoints.
"""

from typing import Optional, List

from sqlalchemy import String, Boolean, DateTime, Index, func
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.models.models import Base


# ============================================================================
# Enumerations
# ============================================================================

class CustomFieldTargetEntity:
    """Target entity types for custom field definitions."""
    WORK_ITEM = "WORK_ITEM"
    RESOURCE = "RESOURCE"
    FACILITY = "FACILITY"
    CDRL = "CDRL"


class CustomFieldDataType:
    """Supported data types for custom field values."""
    STRING = "STRING"
    INTEGER = "INTEGER"
    DECIMAL = "DECIMAL"
    BOOLEAN = "BOOLEAN"
    DATE = "DATE"
    SINGLE_ENUM = "SINGLE_ENUM"
    MULTI_ENUM = "MULTI_ENUM"
    CURRENCY = "CURRENCY"


class CustomFieldClearanceLevel:
    """Security clearance levels for custom field access."""
    OFFICIAL = "OFFICIAL"
    SECRET = "SECRET"
    TOP_SECRET = "TOP_SECRET"


# ============================================================================
# Custom Field Definition Model
# ============================================================================

class CustomFieldDefinition(Base):
    """Dynamic custom field definition for extending core entities.

    Each record defines a new field that can be attached to Work Items,
    Resources, Facilities, or CDRLs. The field's value is stored in the
    ``custom_attributes`` JSONB column of the target entity.

    Attributes
    ----------
    id : UUID
        Primary key.
    field_key : str
        Unique alphanumeric slug with ``cf_`` prefix (e.g., ``cf_radar_freq``).
        Used as the JSONB key in ``custom_attributes``.
    display_label : str
        Human-readable label shown in the UI (e.g., "Radar Frequency (GHz)").
    target_entity : str
        Entity type this field applies to: WORK_ITEM, RESOURCE, FACILITY, or CDRL.
    applicable_tiers : list of str or None
        If WORK_ITEM, restricts which WBS tiers this field applies to
        (e.g., ``['WP', 'TASK']``).  None means all tiers.
    data_type : str
        Data type: STRING, INTEGER, DECIMAL, BOOLEAN, DATE, SINGLE_ENUM,
        MULTI_ENUM, or CURRENCY.
    enum_options : list of str or None
        For SINGLE_ENUM and MULTI_ENUM types, the list of valid options.
    validation_rules : dict or None
        JSONB validation rules: ``min``, ``max``, ``regex_pattern``.
    default_value : any or None
        Default value for new entities.
    is_mandatory : bool
        If True, the field must have a value when creating/updating the entity.
    read_clearance_level : str
        Minimum clearance to read this field's value.
    write_clearance_level : str
        Minimum clearance to write this field's value.
    required_roles : list of str
        Roles required to edit this field (default: ``['USER']``).
    is_active : bool
        If False, the field is soft-deactivated but not deleted.
    created_at : datetime
        Timestamp when the field definition was created.
    """

    __tablename__ = "custom_field_definitions"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(__import__('uuid').uuid4()),
    )

    field_key: Mapped[str] = mapped_column(
        String(64),
        unique=True,
        nullable=False,
        comment="Alphanumeric slug with cf_ prefix, e.g. cf_radar_freq",
    )

    display_label: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        comment="Human-readable label shown in the UI",
    )

    target_entity: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        comment="WORK_ITEM, RESOURCE, FACILITY, or CDRL",
    )

    applicable_tiers: Mapped[Optional[List[str]]] = mapped_column(
        ARRAY(String),
        nullable=True,
        comment="WBS tiers this field applies to, e.g. ['WP', 'TASK']",
    )

    data_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        comment="STRING, INTEGER, DECIMAL, BOOLEAN, DATE, SINGLE_ENUM, MULTI_ENUM, CURRENCY",
    )

    enum_options: Mapped[Optional[list]] = mapped_column(
        JSONB,
        nullable=True,
        comment="Array of string values for SINGLE_ENUM or MULTI_ENUM",
    )

    validation_rules: Mapped[Optional[dict]] = mapped_column(
        JSONB,
        nullable=True,
        comment="JSONB: {min, max, regex_pattern}",
    )

    default_value: Mapped[Optional[any]] = mapped_column(
        JSONB,
        nullable=True,
        comment="Default value for new entities",
    )

    is_mandatory: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    read_clearance_level: Mapped[str] = mapped_column(
        String(32),
        default=CustomFieldClearanceLevel.OFFICIAL,
        nullable=False,
        comment="Minimum clearance to read this field",
    )

    write_clearance_level: Mapped[str] = mapped_column(
        String(32),
        default=CustomFieldClearanceLevel.OFFICIAL,
        nullable=False,
        comment="Minimum clearance to write this field",
    )

    required_roles: Mapped[List[str]] = mapped_column(
        ARRAY(String),
        default=lambda: ["USER"],
        comment="Roles required to edit this field",
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    created_at: Mapped[DateTime] = mapped_column(
        DateTime,
        default=func.now(),
        nullable=False,
        comment="Timestamp when the field was created",
    )

    __table_args__ = (
        Index("idx_custom_fields_target_entity", "target_entity"),
        Index("idx_custom_fields_active", "is_active"),
    )

    def __repr__(self) -> str:
        return f"<CustomFieldDefinition({self.field_key}, {self.display_label})>"
