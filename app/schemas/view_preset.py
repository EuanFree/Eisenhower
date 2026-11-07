"""Pydantic schemas for Gantt view preset CRUD operations.

This module defines the request and response schemas for the Gantt view
preset API endpoints.  All schemas validate the ``config_payload`` JSONB
against the Master Column Catalogue to ensure column field names are
recognised and structural constraints (split_ratio, density) are respected.

Schema Naming Convention
~~~~~~~~~~~~~~~~~~~~~~~~

- ``GanttViewPresetCreate`` — Required fields for creating a new preset.
- ``GanttViewPresetUpdate`` — Partial update; all fields optional.
- ``GanttViewPresetResponse`` — Full preset data returned to the client.
- ``GanttViewPresetListResponse`` — Paginated list of presets.
- ``GanttViewPresetImportResponse`` — Result of importing a .ppmview.json file.

Validation Rules
~~~~~~~~~~~~~~~~

1. **Column fields**: Every entry in ``config_payload.columns`` must have a
   ``field`` value that exists in the Master Column Catalogue.  Unknown fields
   are rejected with a 422 Unprocessable Entity error.

2. **Split ratio**: The ``split_ratio`` value must be between 0.1 and 0.9
   (inclusive).  Values outside this range produce unusable split-pane layouts.

3. **Density**: The ``density`` value must be one of: ULTRA_DENSE, BALANCED,
   COMFORT.  Invalid values are rejected.

4. **Filter tokens**: The ``filter_tokens`` string must not exceed 500 characters.

5. **Name**: Preset names must be between 1 and 100 characters.

Security Considerations
~~~~~~~~~~~~~~~~~~~~~~~

The ``classification`` field on the preset is validated against the requesting
user's clearance level.  A user cannot create a preset with a classification
higher than their own clearance.  Similarly, a user cannot update an existing
preset to raise its classification above their clearance.
"""

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime

from app.models.display import (
    MASTER_COLUMN_CATALOGUE,
    SharingScope,
    PresetClassification,
)


# ============================================================================
# Column Configuration Validation
# ============================================================================


class ColumnConfig(BaseModel):
    """Configuration for a single Gantt grid column.

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


class SortConfig(BaseModel):
    """Sort configuration for the Gantt grid.

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
            raise ValueError(
                f"Sort field '{v}' is not in the Master Column Catalogue."
            )
        return v


class GanttSettings(BaseModel):
    """Gantt chart-specific display settings.

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
    zoom_level: str = Field(
        "WEEKS",
        pattern="^(DAYS|WEEKS|MONTHS)$",
        description="Timeline zoom level"
    )
    show_baselines: bool = Field(True, description="Show baseline comparison bars")
    show_drop_line: bool = Field(True, description="Show jagged status-date drop line")
    show_dependencies: bool = Field(True, description="Show PDM dependency curves")
    show_presence: bool = Field(True, description="Show colleague presence avatars")


class ConfigPayload(BaseModel):
    """Complete Gantt view configuration payload (.ppmview.json specification).

    This schema validates the entire config_payload JSONB structure.
    It ensures column fields are valid, split_ratio is within bounds,
    and density is a recognised tier.

    Attributes
    ----------
    columns : list[ColumnConfig]
        Ordered list of column configurations.
    sort : SortConfig
        Primary sort field and direction.
    density : str
        Row density tier: 'ULTRA_DENSE', 'BALANCED', or 'COMFORT'.
    split_ratio : float
        Split-pane ratio (0.1 to 0.9) — upper pane occupies this fraction.
    filter_tokens : str
        Tokenized filter string (e.g., 'is:critical float:<5d').
    filter_mode : str
        Filter visualization mode: 'FILTER' (hide non-matching) or 'DIM' (25% opacity).
    gantt : GanttSettings
        Gantt chart-specific display settings.
    """
    columns: List[ColumnConfig] = Field(
        ...,
        min_length=1,
        description="Ordered list of column configurations"
    )
    sort: SortConfig = Field(
        default_factory=lambda: SortConfig(),
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
    gantt: GanttSettings = Field(
        default_factory=lambda: GanttSettings(),
        description="Gantt chart-specific settings"
    )

    @model_validator(mode="after")
    def check_columns_not_empty(self):
        """Ensure at least one column is visible."""
        visible = [c for c in self.columns if c.visible]
        if not visible:
            raise ValueError("At least one column must be visible")
        return self


# ============================================================================
# CRUD Schemas
# ============================================================================


class GanttViewPresetCreate(BaseModel):
    """Request schema for creating a new Gantt view preset.

    Attributes
    ----------
    name : str
        Human-readable preset name (1–100 characters).
    description : str or None
        Optional description of the preset's purpose.
    project_id : UUID or None
        Foreign key to PortfolioNode.  If None, the preset is global.
    sharing_scope : SharingScope
        Visibility scope (PRIVATE, PROJECT_SHARED, SYSTEM_GLOBAL).
    classification : PresetClassification
        Security classification of the preset.
    config_payload : ConfigPayload
        The complete view configuration (validated against the .ppmview.json spec).
    """
    name: str = Field(..., min_length=1, max_length=100, description="Preset name")
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
    config_payload: ConfigPayload = Field(
        ...,
        description="Complete view configuration"
    )


class GanttViewPresetUpdate(BaseModel):
    """Request schema for partially updating an existing preset.

    All fields are optional.  Only the provided fields are updated.
    The config_payload is fully validated if provided.

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
    config_payload : ConfigPayload or None
        Updated view configuration (fully validated if provided).
    """
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None)
    sharing_scope: Optional[SharingScope] = Field(None)
    classification: Optional[PresetClassification] = Field(None)
    config_payload: Optional[ConfigPayload] = Field(None)


class GanttViewPresetResponse(BaseModel):
    """Response schema for a single Gantt view preset.

    Attributes
    ----------
    id : UUID
        Unique preset identifier.
    name : str
        Human-readable preset name.
    description : str or None
        Optional description.
    project_id : UUID or None
        Associated project ID (None for global presets).
    owner_user_id : UUID
        ID of the user who created the preset.
    sharing_scope : SharingScope
        Visibility scope.
    classification : PresetClassification
        Security classification.
    config_payload : dict
        The complete view configuration as a dictionary.
    created_at : datetime
        Timestamp when the preset was created.
    updated_at : datetime
        Timestamp when the preset was last modified.

    Config Payload Structure
    ~~~~~~~~~~~~~~~~~~~~~~~~

    The config_payload dictionary conforms to the .ppmview.json specification::

        {
            "columns": [
                {"field": "code", "label": "Task Code", "width": 120, "visible": true, "frozen": true},
                {"field": "name", "label": "Name & Title", "width": 300, "visible": true}
            ],
            "sort": {"field": "planned_start_date", "direction": "asc"},
            "density": "BALANCED",
            "split_ratio": 0.6,
            "filter_tokens": "is:critical float:<5d",
            "filter_mode": "DIM",
            "gantt": {
                "zoom_level": "WEEKS",
                "show_baselines": true,
                "show_drop_line": true,
                "show_dependencies": true,
                "show_presence": true
            }
        }

    Validation
    ~~~~~~~~~~

    - All column ``field`` values are guaranteed to exist in the Master Column Catalogue.
    - ``split_ratio`` is between 0.1 and 0.9.
    - ``density`` is one of ULTRA_DENSE, BALANCED, COMFORT.
    - At least one column is visible.
    """
    id: UUID
    name: str
    description: Optional[str]
    project_id: Optional[UUID]
    owner_user_id: UUID
    sharing_scope: SharingScope
    classification: PresetClassification
    config_payload: Dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GanttViewPresetListResponse(BaseModel):
    """Response schema for a list of Gantt view presets.

    Attributes
    ----------
    presets : list[GanttViewPresetResponse]
        List of accessible presets.
    total : int
        Total number of accessible presets.
    """
    presets: List[GanttViewPresetResponse]
    total: int


class GanttViewPresetImportResponse(BaseModel):
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
    The exported file includes metadata headers for classification and
    source identification.

    Attributes
    ----------
    version : str
        Schema version of the .ppmview.json format.
    preset_name : str
        Name of the exported preset.
    classification : str
        Security classification marking.
    export_timestamp : str
        ISO-8601 timestamp of the export.
    config : dict
        The complete validated config_payload.
    """
    version: str = Field("1.0", description="Schema version")
    preset_name: str = Field(..., description="Name of the exported preset")
    classification: str = Field(..., description="Security classification")
    export_timestamp: str = Field(..., description="ISO-8601 export timestamp")
    config: Dict[str, Any] = Field(..., description="Validated config payload")
