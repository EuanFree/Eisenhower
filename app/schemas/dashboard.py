"""Pydantic schemas for dashboard CRUD operations.

This module defines the request and response schemas for the Dashboard API
endpoints at ``/api/v1/dashboards``.  Dashboards are user-created collections
of widgets that display performance indicators on a free-form canvas.

Schema Naming Convention
~~~~~~~~~~~~~~~~~~~~~~~~

- ``DashboardCreate`` — Required fields for creating a new dashboard.
- ``DashboardUpdate`` — Partial update; all fields optional.
- ``DashboardResponse`` — Full dashboard data returned to the client.
- ``DashboardListResponse`` — List of dashboards with total count.
- ``DashboardWidgetCreate`` — Required fields for creating a widget.
- ``DashboardWidgetUpdate`` — Partial update; all fields optional.
- ``DashboardWidgetResponse`` — Full widget data returned to the client.
- ``SqlQueryRequest`` — SQL query execution request for the builder.
- ``SqlQueryResponse`` — Result of a validated SQL query execution.
- ``AllowedTable`` — Metadata about an allowed table for the SQL builder.
- ``AllowedColumn`` — Metadata about an allowed column within a table.

Validation Rules
~~~~~~~~~~~~~~~~

1. **Name**: Dashboard names must be between 1 and 120 characters.
2. **Widget title**: Must be between 1 and 120 characters.
3. **Data source config**: Must be a valid JSON object.
4. **Classification**: Users cannot create dashboards with a classification
   higher than their own clearance.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime

from app.models.display import SharingScope, PresetClassification
from app.models.dashboard import WidgetType, DataSourceType


# ============================================================================
# Dashboard Schemas
# ============================================================================


class DashboardCreate(BaseModel):
    """Request schema for creating a new dashboard.

    Attributes
    ----------
    name : str
        Human-readable dashboard name (1–120 characters).
    description : str
        Optional description of the dashboard's purpose.
    project_id : UUID
        Optional project association for PROJECT_SHARED dashboards.
    sharing_scope : SharingScope
        Visibility scope (default: PRIVATE).
    classification : PresetClassification
        Security classification (default: OFFICIAL).
    """
    name: str = Field(..., min_length=1, max_length=120, description="Dashboard name")
    description: Optional[str] = Field(None, description="Dashboard description")
    project_id: Optional[UUID] = Field(None, description="Associated project ID")
    sharing_scope: SharingScope = Field(SharingScope.PRIVATE, description="Visibility scope")
    classification: PresetClassification = Field(PresetClassification.OFFICIAL, description="Security classification")


class DashboardUpdate(BaseModel):
    """Request schema for partially updating a dashboard.

    All fields are optional. Only provided fields will be updated.

    Attributes
    ----------
    name : str
        New dashboard name.
    description : str
        New description.
    project_id : UUID
        New project association.
    sharing_scope : SharingScope
        New visibility scope.
    classification : PresetClassification
        New security classification.
    layout_config : dict
        New layout configuration (widget positions, canvas dimensions).
    """
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    description: Optional[str] = None
    project_id: Optional[UUID] = None
    sharing_scope: Optional[SharingScope] = None
    classification: Optional[PresetClassification] = None
    layout_config: Optional[Dict[str, Any]] = None


class DashboardWidgetResponse(BaseModel):
    """Response schema for a single widget within a dashboard.

    Attributes
    ----------
    id : UUID
        Widget unique identifier.
    dashboard_id : UUID
        Parent dashboard identifier.
    widget_type : WidgetType
        Visualization type.
    title : str
        Widget display title.
    data_source_type : DataSourceType
        Data source method (ENDPOINT or SQL_QUERY).
    data_source_config : dict
        Data source configuration payload.
    display_config : dict
        Display options payload.
    position : dict
        Canvas position {x, y, width, height}.
    created_at : datetime
        Creation timestamp.
    updated_at : datetime
        Last modification timestamp.
    """
    id: UUID
    dashboard_id: UUID
    widget_type: WidgetType
    title: str
    data_source_type: DataSourceType
    data_source_config: Optional[Dict[str, Any]] = None
    display_config: Optional[Dict[str, Any]] = None
    position: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DashboardResponse(BaseModel):
    """Response schema for a full dashboard with its widgets.

    Attributes
    ----------
    id : UUID
        Dashboard unique identifier.
    name : str
        Dashboard name.
    description : str
        Dashboard description.
    owner_user_id : UUID
        Owner user identifier.
    project_id : UUID
        Associated project identifier (nullable).
    sharing_scope : SharingScope
        Visibility scope.
    classification : PresetClassification
        Security classification.
    layout_config : dict
        Layout configuration payload.
    widgets : list[DashboardWidgetResponse]
        List of widgets in this dashboard.
    created_at : datetime
        Creation timestamp.
    updated_at : datetime
        Last modification timestamp.
    """
    id: UUID
    name: str
    description: Optional[str] = None
    owner_user_id: UUID
    project_id: Optional[UUID] = None
    sharing_scope: SharingScope
    classification: PresetClassification
    layout_config: Optional[Dict[str, Any]] = None
    widgets: List[DashboardWidgetResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DashboardListResponse(BaseModel):
    """Response schema for listing dashboards.

    Attributes
    ----------
    items : list[DashboardResponse]
        List of accessible dashboards.
    total : int
        Total number of accessible dashboards.
    """
    items: List[DashboardResponse]
    total: int


# ============================================================================
# Widget Schemas
# ============================================================================


class DashboardWidgetCreate(BaseModel):
    """Request schema for creating a new widget.

    Attributes
    ----------
    widget_type : WidgetType
        Visualization type.
    title : str
        Widget display title.
    data_source_type : DataSourceType
        Data source method.
    data_source_config : dict
        Data source configuration.
    display_config : dict
        Display options.
    position : dict
        Initial canvas position.
    """
    widget_type: WidgetType = Field(..., description="Widget visualization type")
    title: str = Field("Untitled Widget", min_length=1, max_length=120)
    data_source_type: DataSourceType = Field(..., description="Data source method")
    data_source_config: Optional[Dict[str, Any]] = Field(None, description="Data source config")
    display_config: Optional[Dict[str, Any]] = Field(None, description="Display options")
    position: Optional[Dict[str, Any]] = Field(None, description="Canvas position {x, y, width, height}")


class DashboardWidgetUpdate(BaseModel):
    """Request schema for partially updating a widget.

    All fields are optional. Only provided fields will be updated.

    Attributes
    ----------
    widget_type : WidgetType
        New visualization type.
    title : str
        New display title.
    data_source_type : DataSourceType
        New data source method.
    data_source_config : dict
        New data source configuration.
    display_config : dict
        New display options.
    position : dict
        New canvas position.
    """
    widget_type: Optional[WidgetType] = None
    title: Optional[str] = Field(None, min_length=1, max_length=120)
    data_source_type: Optional[DataSourceType] = None
    data_source_config: Optional[Dict[str, Any]] = None
    display_config: Optional[Dict[str, Any]] = None
    position: Optional[Dict[str, Any]] = None


# ============================================================================
# SQL Builder Schemas
# ============================================================================


class SqlQueryRequest(BaseModel):
    """Request schema for executing a validated SQL query.

    Attributes
    ----------
    sql : str
        SQL query string (SELECT only, validated against allowlist).
    params : dict
        Parameterized values for the query.
    """
    sql: str = Field(..., min_length=1, description="SQL query string")
    params: Optional[Dict[str, Any]] = Field(None, description="Query parameters")


class SqlQueryResponse(BaseModel):
    """Response schema for a SQL query execution result.

    Attributes
    ----------
    rows : list[dict]
        Query result rows as list of dictionaries.
    row_count : int
        Number of rows returned.
    columns : list[str]
        Column names from the result set.
    """
    rows: List[Dict[str, Any]] = []
    row_count: int = 0
    columns: List[str] = []


class AllowedColumn(BaseModel):
    """Metadata about an allowed column for the SQL builder.

    Attributes
    ----------
    name : str
        Column name.
    type : str
        Database column type (e.g., 'VARCHAR', 'INTEGER').
    """
    name: str
    type: str


class AllowedTable(BaseModel):
    """Metadata about an allowed table for the SQL builder.

    Attributes
    ----------
    name : str
        Table name.
    columns : list[AllowedColumn]
        List of allowed columns for this table.
    """
    name: str
    columns: List[AllowedColumn] = []
