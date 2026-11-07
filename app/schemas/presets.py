"""Pydantic schemas for multi-view preset CRUD operations.

This module defines the request and response schemas for the ViewPreset
API endpoints at ``/api/v1/presets``.  ViewPreset extends the preset
concept beyond Gantt views to cover all primary application views
(WBS_GANTT, DAILY_COCKPIT, SRA_RISK, FACILITY_CHAMBER, EVM_REPORTING).

Schema Naming Convention
~~~~~~~~~~~~~~~~~~~~~~~~

- ``ViewPresetCreate`` — Required fields for creating a new preset.
- ``ViewPresetUpdate`` — Partial update; all fields optional.
- ``ViewPresetResponse`` — Full preset data returned to the client.
- ``ViewPresetListResponse`` — List of presets with total count.
- ``ViewPresetImportResponse`` — Result of importing a .ppmview.json file.
- ``PPMViewExport`` — Export format for .ppmview.json file download.

Validation Rules
~~~~~~~~~~~~~~~~

1. **Name**: Preset names must be between 1 and 120 characters.
2. **Config payload**: Must be a valid JSON object.  For WBS_GANTT presets,
   column fields are validated against the Master Column Catalogue.
3. **Layout schema version**: Defaults to '1.2.0' for new presets.
4. **Classification**: Users cannot create presets with a classification
   higher than their own clearance.

Security Considerations
~~~~~~~~~~~~~~~~~~~~~~~

The ``classification`` field is validated against the requesting user's
clearance level.  A user cannot create or update a preset to raise its
classification above their own clearance.  Presets with a classification
above the user's clearance are excluded from list queries.
"""

from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime

from app.models.display import (
    MASTER_COLUMN_CATALOGUE,
    SharingScope,
    PresetClassification,
    ViewType,
)


# ============================================================================
# Config Payload Validation (WBS_GANTT presets)
# ============================================================================


class ViewPresetColumnConfig(BaseModel):
    """Configuration for a single column in a WBS_GANTT preset.

    Attributes
    ----------
    field : str
        The data field name (must exist in the Master Column Catalogue).
    label : str
        Human-readable column header text.
    width : int
        Column width in pixels (50–800).
    visible : bool
        Whether the column is visible in the default view.
    frozen : bool
        Whether the column is frozen (pinned) during horizontal scroll.
    """
    field: str = Field(..., description="Data field name from the Master Column Catalogue")
    label: str = Field(..., min_length=1, max_length=100, description="Column header text")
    width: int = Field(120, ge=50, le=800, description="Column width in pixels")
    visible: bool = Field(True, description="Whether the column is visible by default")
    frozen: bool = Field(False, description="Whether the column is pinned during scroll")

    @field_validator("field")
    @classmethod
    def field_must_be_in_catalogue(cls, v: str) -> str:
        """Validate that the column field exists in the Master Column Catalogue.

        Parameters
        ----------
        v : str
            The field name to validate.

        Returns
        -------
        str
            The validated field name.

        Raises
        ------
        ValueError
            If the field name is not found in the Master Column Catalogue.
        """
        if v not in MASTER_COLUMN_CATALOGUE:
            raise ValueError(
                f"Column field '{v}' is not in the Master Column Catalogue. "
                f"Valid fields are: {', '.join(MASTER_COLUMN_CATALOGUE)}"
            )
        return v


class ViewPresetSortConfig(BaseModel):
    """Sort configuration for a WBS_GANTT preset.

    Attributes
    ----------
    field : str
        The data field to sort by (must exist in the Master Column Catalogue).
    direction : str
        Sort direction: 'asc' for ascending, 'desc' for descending.
    """
    field: str = Field("planned_start_date", description="Field to sort by")
    direction: str = Field("asc", pattern="^(asc|desc)$", description="Sort direction")

    @field_validator("field")
    @classmethod
    def field_must_be_in_catalogue(cls, v: str) -> str:
        """Validate that the sort field exists in the Master Column Catalogue."""
        if v not in MASTER_COLUMN_CATALOGUE:
            raise ValueError(f"Sort field '{v}' is not in the Master Column Catalogue.")
        return v


class ViewPresetGanttSettings(BaseModel):
    """Gantt chart-specific display settings for WBS_GANTT presets.

    Attributes
    ----------
    zoom_level : str
        Timeline zoom level: 'DAYS', 'WEEKS', or 'MONTHS'.
    show_baselines : bool
        Whether to display baseline comparison bars (B0 and B_curr).
    show_drop_line : bool
        Whether to display the jagged status-date drop line.
    show_dependencies : bool
        Whether to display PDM dependency bezier curves.
    show_presence : bool
        Whether to display colleague presence avatars.
    """
    zoom_level: str = Field("WEEKS", pattern="^(DAYS|WEEKS|MONTHS)$", description="Timeline zoom level")
    show_baselines: bool = Field(True, description="Show baseline comparison bars")
    show_drop_line: bool = Field(True, description="Show jagged status-date drop line")
    show_dependencies: bool = Field(True, description="Show PDM dependency curves")
    show_presence: bool = Field(True, description="Show colleague presence avatars")


class ViewPresetConfigPayload(BaseModel):
    """Complete view configuration payload for WBS_GANTT presets.

    This schema validates the config_payload JSONB structure for
    WBS_GANTT view presets.  For other view types, the config_payload
    is a free-form dict validated at the application layer.

    Attributes
    ----------
    columns : list[ViewPresetColumnConfig]
        Ordered list of column configurations.
    sort : ViewPresetSortConfig
        Primary sort field and direction.
    density : str
        Row density tier: 'ULTRA_DENSE', 'BALANCED', or 'COMFORT'.
    split_ratio : float
        Split-pane ratio (0.1 to 0.9) — upper pane occupies this fraction.
    filter_tokens : str
        Tokenized filter string (e.g., 'is:critical float:<5d').
    filter_mode : str
        Filter visualization mode: 'FILTER' (hide non-matching) or 'DIM' (25% opacity).
    gantt : ViewPresetGanttSettings
        Gantt chart-specific display settings.
    """
    columns: List[ViewPresetColumnConfig] = Field(
        ...,
        min_length=1,
        description="Ordered list of column configurations"
    )
    sort: ViewPresetSortConfig = Field(
        default_factory=lambda: ViewPresetSortConfig(),
        description="Primary sort configuration"
    )
    density: str = Field(
        "BALANCED",
        pattern="^(ULTRA_DENSE|BALANCED|COMFORT)$",
        description="Row density tier"
    )
    split_ratio: float = Field(
        0.6,
        ge=0.1,
        le=0.9,
        description="Split-pane ratio (0.1 to 0.9)"
    )
    filter_tokens: str = Field(
        "",
        max_length=500,
        description="Tokenized filter string"
    )
    filter_mode: str = Field(
        "FILTER",
        pattern="^(FILTER|DIM)$",
        description="Filter visualization mode"
    )
    gantt: ViewPresetGanttSettings = Field(
        default_factory=lambda: ViewPresetGanttSettings(),
        description="Gantt chart-specific settings"
    )


# ============================================================================
# CRUD Schemas
# ============================================================================


class ViewPresetCreate(BaseModel):
    """Request schema for creating a new multi-view preset.

    Attributes
    ----------
    view_type : ViewType
        The view type this preset applies to (WBS_GANTT, DAILY_COCKPIT, etc.).
    name : str
        Human-readable preset name (1–120 characters).
    description : str or None
        Optional description of the preset's purpose.
    project_id : UUID or None
        Foreign key to PortfolioNode.  If None, the preset is global.
    sharing_scope : SharingScope
        Visibility scope (PRIVATE, PROJECT_SHARED, SYSTEM_GLOBAL).
    classification : PresetClassification
        Security classification of the preset.
    config_payload : dict
        The complete view configuration as a JSON-serialisable dictionary.
        For WBS_GANTT presets, this is validated against the full schema.
    """
    view_type: ViewType = Field(..., description="View type this preset applies to")
    name: str = Field(..., min_length=1, max_length=120, description="Preset name")
    description: Optional[str] = Field(None, description="Optional description")
    project_id: Optional[UUID] = Field(None, description="Project scope (None = global)")
    sharing_scope: SharingScope = Field(
        SharingScope.PRIVATE,
        description="Visibility scope"
    )
    classification: PresetClassification = Field(
        PresetClassification.OFFICIAL,
        description="Security classification"
    )
    config_payload: Dict[str, Any] = Field(
        ...,
        description="Complete view configuration as JSON-serialisable dict"
    )


class ViewPresetUpdate(BaseModel):
    """Request schema for partially updating an existing preset.

    All fields are optional.  Only the provided fields are updated.

    Attributes
    ----------
    name : str or None
        Updated preset name.
    description : str or None
        Updated description.
    sharing_scope : SharingScope or None
        Updated visibility scope.
    classification : PresetClassification or None
        Updated security classification.
    config_payload : dict or None
        Updated view configuration.
    """
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    description: Optional[str] = Field(None)
    sharing_scope: Optional[SharingScope] = Field(None)
    classification: Optional[PresetClassification] = Field(None)
    config_payload: Optional[Dict[str, Any]] = Field(None)


class ViewPresetResponse(BaseModel):
    """Response schema for a single multi-view preset.

    Attributes
    ----------
    id : UUID
        Unique preset identifier.
    view_type : ViewType
        The view type this preset applies to.
    name : str
        Human-readable preset name.
    description : str or None
        Optional description.
    author_user_id : UUID
        ID of the user who created the preset.
    project_id : UUID or None
        Associated project ID (None for global presets).
    sharing_scope : SharingScope
        Visibility scope.
    classification : PresetClassification
        Security classification.
    layout_schema_version : str
        Version string of the config payload schema.
    config_payload : dict
        The complete view configuration as a dictionary.
    created_at : datetime
        Timestamp when the preset was created.
    updated_at : datetime
        Timestamp when the preset was last modified.
    """
    id: UUID
    view_type: ViewType
    name: str
    description: Optional[str]
    author_user_id: UUID
    project_id: Optional[UUID]
    sharing_scope: SharingScope
    classification: PresetClassification
    layout_schema_version: str
    config_payload: Dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ViewPresetListResponse(BaseModel):
    """Response schema for a list of multi-view presets.

    Attributes
    ----------
    presets : list[ViewPresetResponse]
        List of accessible presets.
    total : int
        Total number of accessible presets.
    """
    presets: List[ViewPresetResponse]
    total: int


class ViewPresetImportResponse(BaseModel):
    """Response schema for .ppmview.json file import.

    Attributes
    ----------
    success : bool
        Whether the import succeeded.
    preset_id : UUID or None
        ID of the created preset (if successful).
    errors : list[str]
        List of validation errors (if import failed).
    message : str
        Human-readable status message.
    """
    success: bool
    preset_id: Optional[UUID] = None
    errors: List[str] = Field(default_factory=list)
    message: str


# ============================================================================
# Export Configuration
# ============================================================================


class PPMViewExport(BaseModel):
    """Export format for .ppmview.json file download.

    This schema produces a clean, validated JSON representation of the
    preset's config_payload, suitable for offline air-gapped transport.
    The exported file includes metadata headers for classification,
    view type, and source identification.

    Attributes
    ----------
    version : str
        Schema version of the .ppmview.json format.
    view_type : str
        The view type this preset applies to.
    preset_name : str
        Name of the exported preset.
    classification : str
        Security classification marking.
    export_timestamp : str
        ISO-8601 timestamp of the export.
    config : dict
        The complete validated config_payload.
    """
    version: str = Field("1.2.0", description="Schema version")
    view_type: str = Field(..., description="View type discriminator")
    preset_name: str = Field(..., description="Name of the exported preset")
    classification: str = Field(..., description="Security classification")
    export_timestamp: str = Field(..., description="ISO-8601 export timestamp")
    config: Dict[str, Any] = Field(..., description="Validated config payload")
