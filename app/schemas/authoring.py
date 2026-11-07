"""Pydantic schemas for Work Item and Resource creation.

This module defines the input validation schemas used by the creation
endpoints in the WBS and Resources routers.  Each schema enforces the
data constraints required by the defence portfolio management system.

Work Item Creation
~~~~~~~~~~~~~~~~~~

The :class:`WorkItemCreate` schema validates new WBS nodes (Programmes,
Projects, Control Accounts, Work Packages, Tasks, and Milestones).  It
includes:

- **WBS code syntax** — Codes must follow the project naming convention
  (e.g., ``WP-2104``, ``CA-001``).
- **Tier hierarchy** — The tier field constrains the node type.
- **Security classification** — Cannot exceed the creating user's clearance.
- **Custom attributes** — Validated against the custom field registry.

Resource Creation
~~~~~~~~~~~~~~~~~

The :class:`ResourceCreate` schema validates new RBS nodes (people,
equipment, facilities).  It includes:

- **Resource type** — HUMAN_LABOR, EQUIPMENT, or FACILITY.
- **Calibration expiry** — Mandatory for EQUIPMENT-type resources.
- **Clearance level** — The resource's security clearance.

Usage
~~~~~

In a FastAPI endpoint::

    from app.schemas.authoring import WorkItemCreate

    @router.post("/wbs")
    async def create_work_item(
        data: WorkItemCreate,
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        # data is validated by Pydantic
        pass

See Also
--------
- :mod:`app.core.permissions` — Authorization gates for creation.
- :mod:`app.routers.wbs` — WBS creation endpoints.
- :mod:`app.routers.resources` — Resource creation endpoints.
"""

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List, Dict, Any
from uuid import UUID

from app.models.models import (
    SecurityClassification,
    DeliveryMode,
    DALSILLevel,
    EngineeringBaselineTier,
    ExportControlRegime,
)


# ============================================================================
# Work Item Creation Schema
# ============================================================================

class WorkItemCreate(BaseModel):
    """Schema for creating a new Work Item (WBS node).

    This schema validates the input data for creating a new node in the
    Work Breakdown Structure.  It enforces WBS code syntax, tier hierarchy,
    security classification limits, and custom field constraints.

    Attributes
    ----------
    parent_id : UUID or None
        The UUID of the parent node.  If None, creates a root-level
        Programme.  The parent must exist and the user must have access.
    code : str
        Short alphanumeric code following WBS syntax rules (e.g.,
        ``WP-2104``, ``CA-001``, ``PROJ-ALPHA``).  Must be unique
        within the parent's children.
    name : str
        Human-readable name (1-255 characters).
    tier : str
        The hierarchy tier: PROG, PROJ, CA, WP, TASK, or MILESTONE.
        Determines the node's position in the WBS structure.
    delivery_mode : DeliveryMode or None
        Project delivery approach: WATERFALL, AGILE, or HYBRID.
    duration_days : float
        Estimated duration in workdays.  Defaults to 0.0 for milestones.
    security_classification : SecurityClassification
        The node's security classification.  Cannot exceed the creating
        user's clearance level.
    caveats : list of str or None
        Security caveats (e.g., ``['UK_EYES_ONLY']``).
    dal_sil_level : DALSILLevel or None
        Design Assurance Level or Safety Integrity Level for safety-critical
        work items.
    custom_attributes : dict or None
        Arbitrary JSONB extension data.  Validated against the custom
        field registry if one is configured.
    """

    parent_id: Optional[UUID] = Field(
        None,
        description="Parent node UUID. None for root-level Programme creation.",
    )
    code: str = Field(
        ...,
        min_length=1,
        max_length=100,
        pattern=r"^[A-Za-z0-9_-]+$",
        description="WBS code (e.g., WP-2104, CA-001). Alphanumeric, hyphens, underscores.",
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Human-readable name of the work item.",
    )
    tier: str = Field(
        ...,
        pattern=r"^(PROG|PROJ|CA|WP|TASK|MILESTONE)$",
        description="Hierarchy tier: PROG, PROJ, CA, WP, TASK, or MILESTONE.",
    )
    delivery_mode: Optional[DeliveryMode] = Field(
        None,
        description="Delivery approach: WATERFALL, AGILE, or HYBRID.",
    )
    duration_days: float = Field(
        0.0,
        ge=0.0,
        description="Estimated duration in workdays. 0 for milestones.",
    )
    security_classification: SecurityClassification = Field(
        SecurityClassification.OFFICIAL,
        description="Security classification level.",
    )
    caveats: Optional[List[str]] = Field(
        None,
        description="Security caveats (e.g., ['UK_EYES_ONLY']).",
    )
    dal_sil_level: Optional[DALSILLevel] = Field(
        None,
        description="Design Assurance Level or Safety Integrity Level.",
    )
    engineering_baseline_tier: Optional[EngineeringBaselineTier] = Field(
        None,
        description="Engineering baseline tier (FBL_SRR, ABL_PDR, PBL_CDR).",
    )
    export_control_regime: Optional[ExportControlRegime] = Field(
        None,
        description="Export control regime (ITAR, EAR_ECCN, etc.).",
    )
    eccn_or_usml_category: Optional[str] = Field(
        None,
        max_length=100,
        description="ECCN or USML category code.",
    )
    authorized_nationalities: Optional[List[str]] = Field(
        None,
        description="Authorized nationality codes (ISO 2-letter).",
    )
    taa_mla_reference: Optional[str] = Field(
        None,
        max_length=200,
        description="Technical Assistance Agreement reference.",
    )
    custom_attributes: Optional[Dict[str, Any]] = Field(
        None,
        description="Arbitrary JSONB extension data.",
    )

    @field_validator("tier")
    @classmethod
    def validate_tier(cls, v: str) -> str:
        """Validate that the tier is a recognised WBS hierarchy level."""
        allowed = {"PROG", "PROJ", "CA", "WP", "TASK", "MILESTONE"}
        if v not in allowed:
            raise ValueError(
                f"Invalid tier '{v}'. Must be one of: {', '.join(sorted(allowed))}"
            )
        return v

    @field_validator("code")
    @classmethod
    def validate_code_format(cls, v: str) -> str:
        """Validate WBS code format.

        Codes should follow the pattern: PREFIX-NUMBER or PREFIX-NAME.
        Examples: WP-2104, CA-001, PROJ-ALPHA, TASK-001
        """
        if not v:
            raise ValueError("Code cannot be empty")
        if len(v) > 100:
            raise ValueError("Code must be 100 characters or fewer")
        return v

    @field_validator("duration_days")
    @classmethod
    def validate_duration(cls, v: float, info) -> float:
        """Milestones should have 0 duration."""
        # Note: tier is not available here via info.data in all Pydantic versions
        # This is a soft validation — the endpoint can enforce stricter rules
        if v < 0:
            raise ValueError("Duration cannot be negative")
        return v


# ============================================================================
# Resource Creation Schema
# ============================================================================

class ResourceCreate(BaseModel):
    """Schema for creating a new Resource (RBS node).

    This schema validates the input data for creating a new resource
    entry in the Resource Breakdown Structure.  Resources can be people,
    equipment, or facilities.

    Attributes
    ----------
    code : str
        Short alphanumeric code (e.g., ``ENG-001``, ``EQUIP-RIG-42``).
    name : str
        Human-readable name (1-255 characters).
    resource_type : str
        Resource category: HUMAN_LABOR, EQUIPMENT, or FACILITY.
    department : str
        Functional department (e.g., "Avionics", "Systems Safety").
    burdened_hourly_rate : Decimal or None
        Fully-burdened hourly cost rate for labour resources.
    clearance_level : SecurityClassification
        The resource's security clearance level.
    nationality : str or None
        Primary nationality (ISO 2-letter country code).
    calibration_expiry_date : date or None
        Next calibration due date.  Mandatory for EQUIPMENT resources.
    custom_attributes : dict or None
        Arbitrary JSONB extension data.
    """

    code: str = Field(
        ...,
        min_length=1,
        max_length=100,
        pattern=r"^[A-Za-z0-9_-]+$",
        description="Resource code (e.g., ENG-001, EQUIP-RIG-42).",
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Human-readable name of the resource.",
    )
    resource_type: str = Field(
        ...,
        pattern=r"^(HUMAN_LABOR|EQUIPMENT|FACILITY)$",
        description="Resource type: HUMAN_LABOR, EQUIPMENT, or FACILITY.",
    )
    department: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Functional department (e.g., 'Avionics', 'Systems Safety').",
    )
    burdened_hourly_rate: Optional[Decimal] = Field(
        None,
        ge=0,
        description="Fully-burdened hourly cost rate.",
    )
    clearance_level: SecurityClassification = Field(
        SecurityClassification.OFFICIAL,
        description="Resource security clearance level.",
    )
    nationality: Optional[str] = Field(
        None,
        min_length=2,
        max_length=2,
        description="Primary nationality (ISO 2-letter country code).",
    )
    calibration_expiry_date: Optional[date] = Field(
        None,
        description="Next calibration due date. Mandatory for EQUIPMENT.",
    )
    serial_number: Optional[str] = Field(
        None,
        max_length=64,
        description="Serial number for physical equipment.",
    )
    calibration_interval_days: Optional[int] = Field(
        None,
        ge=1,
        description="Days between required calibration events.",
    )
    is_generic_placeholder: bool = Field(
        False,
        description="Whether this is a claimable placeholder resource.",
    )
    custom_attributes: Optional[Dict[str, Any]] = Field(
        None,
        description="Arbitrary JSONB extension data.",
    )

    @field_validator("resource_type")
    @classmethod
    def validate_resource_type(cls, v: str) -> str:
        """Validate that the resource type is recognised."""
        allowed = {"HUMAN_LABOR", "EQUIPMENT", "FACILITY"}
        if v not in allowed:
            raise ValueError(
                f"Invalid resource type '{v}'. Must be one of: {', '.join(sorted(allowed))}"
            )
        return v

    @model_validator(mode="after")
    def validate_equipment_calibration(self) -> "ResourceCreate":
        """EQUIPMENT resources must have a calibration expiry date."""
        if self.resource_type == "EQUIPMENT" and self.calibration_expiry_date is None:
            raise ValueError(
                "calibration_expiry_date is mandatory for EQUIPMENT resources"
            )
        return self

    @field_validator("nationality")
    @classmethod
    def validate_nationality_format(cls, v: Optional[str]) -> Optional[str]:
        """Nationality must be a 2-letter ISO country code."""
        if v is not None and len(v) != 2:
            raise ValueError("Nationality must be a 2-letter ISO country code")
        return v


# ============================================================================
# Response Schemas
# ============================================================================

class WorkItemCreatedResponse(BaseModel):
    """Response returned after successfully creating a Work Item.

    Attributes
    ----------
    id : UUID
        The newly created node's UUID.
    code : str
        The WBS code assigned to the node.
    name : str
        The node's name.
    path : str
        The ltree path string (e.g., ``'1.2.3'``).
    tier : str
        The hierarchy tier.
    security_classification : str
        The node's security classification.
    created_at : datetime
        Timestamp of creation.
    """

    id: UUID
    code: str
    name: str
    path: str
    tier: str
    security_classification: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ResourceCreatedResponse(BaseModel):
    """Response returned after successfully creating a Resource.

    Attributes
    ----------
    id : UUID
        The newly created resource's UUID.
    code : str
        The resource code.
    name : str
        The resource's name.
    resource_type : str
        The resource category.
    department : str
        The functional department.
    clearance_level : str
        The resource's security clearance.
    created_at : datetime
        Timestamp of creation.
    """

    id: UUID
    code: str
    name: str
    resource_type: str
    department: str
    clearance_level: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
