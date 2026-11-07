"""Pydantic schemas for Custom Field Definition CRUD operations.

This module defines the request and response schemas used by the admin
endpoints to manage custom field definitions.  Each schema enforces the
data constraints required by the custom field registry.

Custom Field Definition
~~~~~~~~~~~~~~~~~~~~~~~

The :class:`CustomFieldDefinitionCreate` schema validates new field
definitions.  It enforces:

- **Field key syntax** — Must start with ``cf_`` and be alphanumeric.
- **Data type** — Must be one of the supported types.
- **Enum options** — Required for SINGLE_ENUM and MULTI_ENUM types.
- **Validation rules** — Optional min/max/regex constraints.
- **Clearance levels** — Read and write clearance must be valid levels.

Usage
~~~~~

.. code-block:: python

    from app.schemas.custom_fields import CustomFieldDefinitionCreate

    @router.post("/custom-fields")
    async def create_field(data: CustomFieldDefinitionCreate, ...):
        # data is validated by Pydantic
        pass

See Also
--------
- :mod:`app.models.custom_fields` — CustomFieldDefinition model.
- :mod:`app.services.custom_field_engine` — Validation engine.
- :mod:`app.routers.admin.custom_fields` — Admin CRUD endpoints.
"""

from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime


# ============================================================================
# Supported Constants
# ============================================================================

VALID_DATA_TYPES = [
    "STRING", "INTEGER", "DECIMAL", "BOOLEAN", "DATE",
    "SINGLE_ENUM", "MULTI_ENUM", "CURRENCY",
]

VALID_TARGET_ENTITIES = ["WORK_ITEM", "RESOURCE", "FACILITY", "CDRL"]

VALID_CLEARANCE_LEVELS = ["OFFICIAL", "SECRET", "TOP_SECRET"]

VALID_TIERS = ["PROG", "PROJ", "CA", "WP", "TASK", "MILESTONE"]


# ============================================================================
# Custom Field Definition Schemas
# ============================================================================

class CustomFieldDefinitionCreate(BaseModel):
    """Schema for creating a new custom field definition.

    Attributes
    ----------
    field_key : str
        Unique alphanumeric slug with ``cf_`` prefix (e.g., ``cf_radar_freq``).
    display_label : str
        Human-readable label shown in the UI.
    target_entity : str
        Entity type: WORK_ITEM, RESOURCE, FACILITY, or CDRL.
    applicable_tiers : list of str or None
        WBS tiers this field applies to (e.g., ``['WP', 'TASK']``).
    data_type : str
        Data type: STRING, INTEGER, DECIMAL, BOOLEAN, DATE, SINGLE_ENUM,
        MULTI_ENUM, or CURRENCY.
    enum_options : list of str or None
        Valid options for SINGLE_ENUM and MULTI_ENUM types.
    validation_rules : dict or None
        JSONB validation rules: ``min``, ``max``, ``regex_pattern``.
    default_value : any or None
        Default value for new entities.
    is_mandatory : bool
        If True, the field must have a value on entity creation.
    read_clearance_level : str
        Minimum clearance to read this field.
    write_clearance_level : str
        Minimum clearance to write this field.
    required_roles : list of str
        Roles required to edit this field.
    """

    field_key: str = Field(
        ...,
        min_length=4,
        max_length=64,
        pattern=r"^cf_[a-zA-Z0-9_]+$",
        description="Alphanumeric slug with cf_ prefix",
    )
    display_label: str = Field(
        ...,
        min_length=1,
        max_length=128,
        description="Human-readable label",
    )
    target_entity: str = Field(
        ...,
        description="WORK_ITEM, RESOURCE, FACILITY, or CDRL",
    )
    applicable_tiers: Optional[List[str]] = Field(
        None,
        description="WBS tiers this field applies to",
    )
    data_type: str = Field(
        ...,
        description="STRING, INTEGER, DECIMAL, BOOLEAN, DATE, SINGLE_ENUM, MULTI_ENUM, CURRENCY",
    )
    enum_options: Optional[List[str]] = Field(
        None,
        description="Valid options for enum types",
    )
    validation_rules: Optional[Dict[str, Any]] = Field(
        None,
        description="JSONB: {min, max, regex_pattern}",
    )
    default_value: Optional[Any] = Field(
        None,
        description="Default value for new entities",
    )
    is_mandatory: bool = Field(
        False,
        description="If True, field must have a value on creation",
    )
    read_clearance_level: str = Field(
        "OFFICIAL",
        description="Minimum clearance to read",
    )
    write_clearance_level: str = Field(
        "OFFICIAL",
        description="Minimum clearance to write",
    )
    required_roles: List[str] = Field(
        default_factory=lambda: ["USER"],
        description="Roles required to edit",
    )

    @field_validator("target_entity")
    @classmethod
    def validate_target_entity(cls, v: str) -> str:
        """Validate that the target entity is one of the allowed values.

        Args
        ----\n        v : str
            The target entity value to validate.

        Returns
        -------
        str
            The validated target entity value.

        Raises
        ------
        ValueError
            If the value is not in ``VALID_TARGET_ENTITIES``.
        """
        if v not in VALID_TARGET_ENTITIES:
            raise ValueError(f"target_entity must be one of {VALID_TARGET_ENTITIES}, got '{v}'")
        return v

    @field_validator("data_type")
    @classmethod
    def validate_data_type(cls, v: str) -> str:
        """Validate that the data type is one of the allowed values.

        Args
        ----\n        v : str
            The data type value to validate.

        Returns
        -------
        str
            The validated data type value.

        Raises
        ------
        ValueError
            If the value is not in ``VALID_DATA_TYPES``.
        """
        if v not in VALID_DATA_TYPES:
            raise ValueError(f"data_type must be one of {VALID_DATA_TYPES}, got '{v}'")
        return v

    @field_validator("read_clearance_level", "write_clearance_level")
    @classmethod
    def validate_clearance_level(cls, v: str) -> str:
        """Validate that the clearance level is one of the allowed values.

        Args
        ----\n        v : str
            The clearance level value to validate.

        Returns
        -------
        str
            The validated clearance level value.

        Raises
        ------
        ValueError
            If the value is not in ``VALID_CLEARANCE_LEVELS``.
        """
        if v not in VALID_CLEARANCE_LEVELS:
            raise ValueError(f"Clearance level must be one of {VALID_CLEARANCE_LEVELS}, got '{v}'")
        return v

    @field_validator("applicable_tiers")
    @classmethod
    def validate_tiers(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        """Validate that each applicable tier is one of the allowed values.

        Args
        ----\n        v : List[str] or None
            The list of tier values to validate.

        Returns
        -------
        List[str] or None
            The validated list of tier values.

        Raises
        ------
        ValueError
            If any tier is not in ``VALID_TIERS``.
        """
        if v is not None:
            for tier in v:
                if tier not in VALID_TIERS:
                    raise ValueError(f"Tier must be one of {VALID_TIERS}, got '{tier}'")
        return v

    @field_validator("enum_options")
    @classmethod
    def validate_enum_options(cls, v: Optional[List[str]], info) -> Optional[List[str]]:
        """Validate that enum_options is provided for enum data types.

        Args
        ----\n        v : List[str] or None
            The enum options to validate.
        info : ValidationInfo
            Pydantic validation info containing the field data.

        Returns
        -------
        List[str] or None
            The validated enum options.

        Raises
        ------
        ValueError
            If the data type is ``SINGLE_ENUM`` or ``MULTI_ENUM`` but no
            enum_options are provided.
        """
        data_type = info.data.get("data_type")
        if data_type in ("SINGLE_ENUM", "MULTI_ENUM") and v is None:
            raise ValueError(f"enum_options is required for {data_type} data type")
        return v


class CustomFieldDefinitionUpdate(BaseModel):
    """Schema for updating an existing custom field definition.

    All fields are optional.  Only the provided fields will be updated.

    Attributes
    ----------
    display_label : str or None
        Updated human-readable label.
    applicable_tiers : list of str or None
        Updated WBS tier restrictions.
    enum_options : list of str or None
        Updated enum options.
    validation_rules : dict or None
        Updated validation rules.
    default_value : any or None
        Updated default value.
    is_mandatory : bool or None
        Updated mandatory flag.
    read_clearance_level : str or None
        Updated read clearance level.
    write_clearance_level : str or None
        Updated write clearance level.
    required_roles : list of str or None
        Updated required roles.
    is_active : bool or None
        Updated active status.
    """

    display_label: Optional[str] = Field(None, min_length=1, max_length=128)
    applicable_tiers: Optional[List[str]] = None
    enum_options: Optional[List[str]] = None
    validation_rules: Optional[Dict[str, Any]] = None
    default_value: Optional[Any] = None
    is_mandatory: Optional[bool] = None
    read_clearance_level: Optional[str] = None
    write_clearance_level: Optional[str] = None
    required_roles: Optional[List[str]] = None
    is_active: Optional[bool] = None

    @field_validator("read_clearance_level", "write_clearance_level")
    @classmethod
    def validate_clearance_level(cls, v: Optional[str]) -> Optional[str]:
        """Validate that the clearance level (if provided) is allowed.

        Args
        ----\n        v : str or None
            The clearance level value to validate.

        Returns
        -------
        str or None
            The validated clearance level value.

        Raises
        ------
        ValueError
            If the value is not ``None`` and not in ``VALID_CLEARANCE_LEVELS``.
        """
        if v is not None and v not in VALID_CLEARANCE_LEVELS:
            raise ValueError(f"Clearance level must be one of {VALID_CLEARANCE_LEVELS}, got '{v}'")
        return v

    @field_validator("applicable_tiers")
    @classmethod
    def validate_tiers(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        """Validate that each applicable tier (if provided) is allowed.

        Args
        ----\n        v : List[str] or None
            The list of tier values to validate.

        Returns
        -------
        List[str] or None
            The validated list of tier values.

        Raises
        ------
        ValueError
            If any tier is not in ``VALID_TIERS``.
        """
        if v is not None:
            for tier in v:
                if tier not in VALID_TIERS:
                    raise ValueError(f"Tier must be one of {VALID_TIERS}, got '{tier}'")
        return v


class CustomFieldDefinitionResponse(BaseModel):
    """Schema for returning a custom field definition.

    Attributes
    ----------
    id : str
        Field definition UUID.
    field_key : str
        Alphanumeric slug with ``cf_`` prefix.
    display_label : str
        Human-readable label.
    target_entity : str
        Entity type this field applies to.
    applicable_tiers : list of str or None
        WBS tier restrictions.
    data_type : str
        Data type string.
    enum_options : list of str or None
        Valid enum options.
    validation_rules : dict or None
        Validation rules.
    default_value : any or None
        Default value.
    is_mandatory : bool
        Whether the field is mandatory.
    read_clearance_level : str
        Minimum read clearance.
    write_clearance_level : str
        Minimum write clearance.
    required_roles : list of str
        Required roles.
    is_active : bool
        Whether the field is active.
    created_at : datetime
        Creation timestamp.
    """

    id: str
    field_key: str
    display_label: str
    target_entity: str
    applicable_tiers: Optional[List[str]]
    data_type: str
    enum_options: Optional[List[str]]
    validation_rules: Optional[Dict[str, Any]]
    default_value: Optional[Any]
    is_mandatory: bool
    read_clearance_level: str
    write_clearance_level: str
    required_roles: List[str]
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CustomFieldDefinitionListResponse(BaseModel):
    """Schema for listing custom field definitions.

    Attributes
    ----------
    fields : list of CustomFieldDefinitionResponse
        List of field definitions.
    total : int
        Total number of definitions returned.
    """

    fields: List[CustomFieldDefinitionResponse]
    total: int
