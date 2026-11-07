"""Dashboard models for the Eisenhower Portfolio Manager.

This module contains models for user-created dashboards with draggable widgets.
Dashboards are persisted to PostgreSQL with sharing capabilities following the
same pattern as ViewPreset.

Models
~~~~~~

- :class:`Dashboard` — Named dashboard container with layout configuration.
- :class:`DashboardWidget` — Individual widget within a dashboard with data
  source and display configuration.

Sharing Model
~~~~~~~~~~~~~

Dashboards reuse the SharingScope and PresetClassification enums from
``app.models.display`` for consistency with the existing preset system.

- **PRIVATE** — Only the owner can see and edit the dashboard.
- **PROJECT_SHARED** — Any user with access to the associated project can see
  the dashboard.
- **SYSTEM_GLOBAL** — Visible to all authenticated users.

Security
~~~~~~~~

Each dashboard carries a ``classification`` marking. Users must have clearance
>= the dashboard's classification to access it.
"""

from sqlalchemy import (
    Column, String, DateTime, ForeignKey, Text, Integer,
    Enum as SAEnum, Index, Uuid
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from uuid import uuid4


def _utc_now():
    """Return the current UTC time as a timezone-aware datetime."""
    return datetime.now(timezone.utc)

from app.database import Base
from app.models.display import SharingScope, PresetClassification
import enum


# ============================================================================
# Enums
# ============================================================================


class WidgetType(str, enum.Enum):
    """Type of visualization widget.

    Values
    ------
    COLUMN_CHART : str
        Grouped or stacked bar/column charts.
    LINE_CHART : str
        Time-series or trend line charts.
    AREA_CHART : str
        Filled area charts for cumulative data.
    GAUGE : str
        Single-value KPI with circular gauge visualization.
    BURNDOWN : str
        Sprint/project burndown with actual vs ideal lines.
    SCATTER : str
        Two-dimensional data point distribution.
    NUMBER_CARD : str
        Large single-value display with trend indicator.
    TABLE : str
        Tabular data display with sorting.
    """
    COLUMN_CHART = "COLUMN_CHART"
    LINE_CHART = "LINE_CHART"
    AREA_CHART = "AREA_CHART"
    GAUGE = "GAUGE"
    BURNDOWN = "BURNDOWN"
    SCATTER = "SCATTER"
    NUMBER_CARD = "NUMBER_CARD"
    TABLE = "TABLE"


class DataSourceType(str, enum.Enum):
    """Data source type for a widget.

    Values
    ------
    ENDPOINT : str
        Widget binds to an existing GET API endpoint and extracts data
        via a JSON path.
    SQL_QUERY : str
        Widget defines a restricted SQL query executed by the SQL builder
        service.
    """
    ENDPOINT = "ENDPOINT"
    SQL_QUERY = "SQL_QUERY"


# ============================================================================
# Dashboard Model
# ============================================================================


class Dashboard(Base):
    """User-created dashboard with layout configuration.

    A dashboard is a named container holding multiple widgets arranged on a
    free-form canvas. The complete layout (widget positions, sizes, canvas
    dimensions) is stored as JSONB in ``layout_config``.

    Attributes
    ----------
    id : UUID
        Primary key, auto-generated UUID4.
    name : str
        Human-readable dashboard name (max 120 characters).
    description : str
        Optional description of the dashboard's purpose.
    owner_user_id : UUID
        User who created the dashboard.
    project_id : UUID
        Associated project for PROJECT_SHARED dashboards. NULL for global
        dashboards.
    sharing_scope : SharingScope
        Visibility scope (PRIVATE, PROJECT_SHARED, SYSTEM_GLOBAL).
    classification : PresetClassification
        Security classification level.
    layout_config : dict
        JSONB payload storing canvas dimensions and widget positions/sizes.
    created_at : datetime
        Creation timestamp (UTC).
    updated_at : datetime
        Last modification timestamp (UTC).
    widgets : list[DashboardWidget]
        Cascade-deleted relationship to widget instances.
    """
    __tablename__ = "dashboards"

    id = Column(Uuid, primary_key=True, default=uuid4)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    project_id = Column(Uuid, ForeignKey("portfolio_nodes.id"), nullable=True)
    sharing_scope = Column(SAEnum(SharingScope), nullable=False, default=SharingScope.PRIVATE)
    classification = Column(SAEnum(PresetClassification), nullable=False, default=PresetClassification.OFFICIAL)
    layout_config = Column(JSONB, nullable=True, default=dict)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    widgets = relationship("DashboardWidget", back_populates="dashboard", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_dashboards_owner_user_id", "owner_user_id"),
        Index("ix_dashboards_project_id", "project_id"),
        Index("ix_dashboards_sharing_scope", "sharing_scope"),
    )


# ============================================================================
# DashboardWidget Model
# ============================================================================


class DashboardWidget(Base):
    """Individual widget within a dashboard.

    Each widget defines its visualization type, data source configuration,
    display options, and canvas position. The widget is rendered by the
    frontend using the appropriate chart component.

    Attributes
    ----------
    id : UUID
        Primary key, auto-generated UUID4.
    dashboard_id : UUID
        Foreign key to the parent dashboard (CASCADE delete).
    widget_type : WidgetType
        Visualization type (COLUMN_CHART, LINE_CHART, etc.).
    title : str
        Human-readable widget title displayed in the header.
    data_source_type : DataSourceType
        How the widget fetches data (ENDPOINT or SQL_QUERY).
    data_source_config : dict
        JSONB payload with endpoint URL + JSON path, or SQL query + params.
    display_config : dict
        JSONB payload with colors, axes, aggregation, chart options.
    position : dict
        JSONB payload with {x, y, width, height} for canvas positioning.
    created_at : datetime
        Creation timestamp (UTC).
    updated_at : datetime
        Last modification timestamp (UTC).
    dashboard : Dashboard
        Back-reference to the parent dashboard.
    """
    __tablename__ = "dashboard_widgets"

    id = Column(Uuid, primary_key=True, default=uuid4)
    dashboard_id = Column(Uuid, ForeignKey("dashboards.id", ondelete="CASCADE"), nullable=False)
    widget_type = Column(SAEnum(WidgetType), nullable=False)
    title = Column(String(120), nullable=False, default="Untitled Widget")
    data_source_type = Column(SAEnum(DataSourceType), nullable=False)
    data_source_config = Column(JSONB, nullable=True, default=dict)
    display_config = Column(JSONB, nullable=True, default=dict)
    position = Column(JSONB, nullable=True, default=dict)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    dashboard = relationship("Dashboard", back_populates="widgets")

    __table_args__ = (
        Index("ix_dashboard_widgets_dashboard_id", "dashboard_id"),
    )
