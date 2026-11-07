"""Display-related models for the Eisenhower Portfolio Manager.

This module contains models for user-facing display configuration that are
stored server-side in PostgreSQL.  In SCIF (Sensitive Compartmented Information
Facility) environments, browser storage is prohibited, so all display
preferences must persist on the server and be fetched via API on each login.

Models
~~~~~~

- :class:`GanttViewPreset` — Customised Gantt grid view layouts that users can
  save, share, and export for air-gapped transport.  Each preset stores the
  complete column configuration, filter tokens, density tier, split-pane ratio,
  and Gantt-specific settings (zoom level, baseline visibility, etc.) as a
  validated JSONB payload conforming to the ``.ppmview.json`` specification.

Sharing Model
~~~~~~~~~~~~~

Presets support three sharing scopes:

- **PRIVATE** — Only the owner can see and use the preset.
- **PROJECT_SHARED** — Any user with access to the associated project can see
  the preset.  Useful for team-wide standard views (e.g., "CAM Cost Audit").
- **SYSTEM_GLOBAL** — Visible to all users regardless of project membership.
  Typically created by administrators for organisation-wide standards.

A preset with ``project_id = NULL`` is a global system preset that applies
across all projects.  A preset with a specific ``project_id`` is scoped to
that project's WBS hierarchy.

Security
~~~~~~~~

Each preset carries a ``classification`` marking (OFFICIAL, SECRET, TOP_SECRET).
Users must have clearance >= the preset's classification to access it.  This
prevents a SECRET-scoped view from being discovered by an OFFICIAL-cleared
user, even if the view itself contains no classified data.

The ``config_payload`` JSONB field is validated against the Master Column
Catalogue on create and update to ensure all column field names are recognised
and the split_ratio is within the valid range (0.1 to 0.9).
"""

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Text,
    Enum as SAEnum, Index, Numeric, Uuid
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from uuid import uuid4


def _utc_now():
    """Return the current UTC time as a timezone-aware datetime."""
    return datetime.now(timezone.utc)

from app.database import Base
import enum


# ============================================================================
# Enums
# ============================================================================


class SharingScope(str, enum.Enum):
    """Visibility scope for view presets.

    Determines which users can discover and apply a saved preset.

    Values
    ------
    PRIVATE : str
        Only the owner can see and use the preset.  Not listed in shared
        preset queries.
    PROJECT_SHARED : str
        Any user with access to the associated project (via ABAC clearance)
        can see and apply the preset.  Ideal for team-standard views.
    SYSTEM_GLOBAL : str
        Visible to all authenticated users regardless of project membership.
        Typically used for organisation-wide standard views created by
        administrators.
    """
    PRIVATE = "PRIVATE"
    PROJECT_SHARED = "PROJECT_SHARED"
    SYSTEM_GLOBAL = "SYSTEM_GLOBAL"


class PresetClassification(str, enum.Enum):
    """Security classification of a view preset.

    A preset's classification indicates the highest classification of data
    that the view may expose.  Users must have clearance >= this level to
    access the preset.

    Values
    ------
    OFFICIAL : str
        Unrestricted internal data.  Default classification for new presets.
    SECRET : str
        Classified data requiring SECRET clearance.
    TOP_SECRET : str
        Highest classification; requires TOP_SECRET clearance.
    """
    OFFICIAL = "OFFICIAL"
    SECRET = "SECRET"
    TOP_SECRET = "TOP_SECRET"


class ViewType(str, enum.Enum):
    """View type discriminator for multi-view presets.

    A ViewPreset can store the complete layout configuration for any
    of the primary application views.  The ``view_type`` field determines
    which view component will consume the preset's config_payload.

    Values
    ------
    WBS_GANTT : str
        The master WBS grid and Gantt chart view.  Config includes column
        layout, filter tokens, density, split-pane ratio, and Gantt toggles.
    DAILY_COCKPIT : str
        The individual contributor Daily Cockpit landing page.  Config
        includes metric card layout, focus queue sort order, and timesheet
        period defaults.
    SRA_RISK : str
        The Monte Carlo Schedule Risk Analysis dashboard.  Config includes
        iteration count, distribution type, and chart visibility toggles.
    FACILITY_CHAMBER : str
        The physical facility and chamber scheduling view.  Config includes
        timeline zoom level, facility filter tokens, and reservation defaults.
    EVM_REPORTING : str
        The EVM and IPMR reporting workbench.  Config includes reporting
        period defaults, format card layout, and scope tree state.
    """
    WBS_GANTT = "WBS_GANTT"
    DAILY_COCKPIT = "DAILY_COCKPIT"
    SRA_RISK = "SRA_RISK"
    FACILITY_CHAMBER = "FACILITY_CHAMBER"
    EVM_REPORTING = "EVM_REPORTING"
    DASHBOARD = "DASHBOARD"


# ============================================================================
# Master Column Catalogue
# ============================================================================

# The definitive list of column fields that may appear in a Gantt view preset.
# Validation ensures that config_payload.columns only references fields from
# this catalogue, preventing typos or injection of arbitrary field names.
MASTER_COLUMN_CATALOGUE = [
    # Core identification
    "code",
    "name",
    "delivery_mode",
    "security_classification",
    "caveats",
    # Schedule dates
    "planned_start_date",
    "planned_end_date",
    "actual_start_date",
    "actual_end_date",
    # CPM metrics
    "early_start",
    "early_finish",
    "late_start",
    "late_finish",
    "total_float",
    "free_float",
    "is_critical",
    # Progress
    "percent_complete",
    "physical_percent",
    # EVM metrics
    "bac_cost",
    "planned_value",
    "earned_value",
    "actual_cost",
    "cv",
    "sv",
    "cpi",
    "spi",
    "eac",
    "vac",
    # Resource & assignment
    "assigned_resources",
    "allocated_units",
    "planned_hours",
    # Blockers & impediments
    "active_blockers",
    "blocker_severity",
    # Engineering governance
    "dal_sil_level",
    "engineering_baseline_tier",
    # Procurement
    "procurement_status",
    "forecast_delivery_date",
    # Baseline comparison
    "baseline_b0_start",
    "baseline_b0_finish",
    "baseline_bcurr_start",
    "baseline_bcurr_finish",
    # Presence & collaboration
    "presence_users",
    # Versioning
    "version_id",
    "updated_at",
    "updated_by",
]


# ============================================================================
# GanttViewPreset Model
# ============================================================================


class GanttViewPreset(Base):
    """Customised Gantt grid view preset for server-side persistence.

    Allows users to save, share, and export complete Gantt view configurations
    including column layout, filter tokens, density tier, split-pane ratio,
    and Gantt-specific settings.  Presets are stored as validated JSONB
    conforming to the ``.ppmview.json`` specification.

    Why presets?
    ~~~~~~~~~~~~

    In operational environments, users frequently switch between different
    analytical views of the same schedule:

    - A **CAM (Contracting Officer's Representative)** view focused on EVM
      metrics (BAC, PV, EV, AC, CPI, SPI).
    - A **Lead Systems Engineer** view focused on critical path, float
      absorption, and DAL/SIL safety levels.
    - A **Project Manager** view focused on blockers, resource allocation,
      and milestone tracking.

    Instead of manually reconfiguring columns, filters, and density each
    time, users save these configurations as named presets that can be
    instantly applied.  Shared presets enable team-wide standardisation.

    The ``.ppmview.json`` export format allows presets to be transported
    between air-gapped systems via optical media or USB diode, enabling
    consistent view configurations across disconnected sites.

    Validation
    ~~~~~~~~~~

    On create and update, the ``config_payload`` JSONB is validated against
    the Master Column Catalogue:

    - All ``column.fields`` must exist in the catalogue.
    - ``split_ratio`` must be between 0.1 and 0.9.
    - ``density`` must be a valid Density enum value.
    - ``filter_tokens`` must be a valid string.

    Attributes
    ----------
    id : UUID
        Unique identifier for the preset.
    name : str
        Human-readable preset name (e.g., "CAM Cost Audit", "Critical Safety Review").
    description : str or None
        Optional description of the preset's purpose.
    project_id : UUID or None
        Foreign key to PortfolioNode.  If NULL, the preset is global and
        applies across all projects.
    owner_user_id : UUID
        Foreign key to User — the user who created the preset.
    sharing_scope : SharingScope
        Visibility scope (PRIVATE, PROJECT_SHARED, SYSTEM_GLOBAL).
    classification : PresetClassification
        Security classification of the preset.
    config_payload : dict
        JSONB payload containing the complete view configuration.  Must
        conform to the .ppmview.json specification.
    created_at : datetime
        Timestamp when the preset was created.
    updated_at : datetime
        Timestamp when the preset was last modified.

    Config Payload Schema (.ppmview.json)
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    The config_payload JSONB object has the following structure::

        {
            "columns": [
                {
                    "field": "code",
                    "label": "Task Code",
                    "width": 120,
                    "visible": true,
                    "frozen": true
                },
                {
                    "field": "name",
                    "label": "Name & Title",
                    "width": 300,
                    "visible": true
                }
            ],
            "sort": {
                "field": "planned_start_date",
                "direction": "asc"
            },
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

    Indexes
    -------
    ix_gantt_view_presets_name : Name index for quick lookup by preset name.
    ix_gantt_view_presets_owner : Owner index for filtering by user.
    ix_gantt_view_presets_project : Project index for project-scoped queries.
    """
    __tablename__ = "gantt_view_presets"

    id = Column(
        Uuid,
        primary_key=True,
        default=uuid4,
        index=True,
    )
    name = Column(
        String(100),
        nullable=False,
        index=True,
    )
    description = Column(Text, nullable=True)

    # Project scoping — NULL means global system preset
    project_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Owner
    owner_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Sharing & classification
    sharing_scope = Column(
        SAEnum(SharingScope),
        default=SharingScope.PRIVATE,
        nullable=False,
    )
    classification = Column(
        SAEnum(PresetClassification),
        default=PresetClassification.OFFICIAL,
        nullable=False,
    )

    # Validated JSONB configuration payload
    config_payload = Column(
        JSONB,
        nullable=False,
    )

    # Timestamps
    created_at = Column(
        DateTime,
        default=_utc_now,
        nullable=False,
    )
    updated_at = Column(
        DateTime,
        default=_utc_now,
        onupdate=_utc_now,
        nullable=False,
    )

    # Relationships
    project = relationship("PortfolioNode", backref="view_presets")
    owner = relationship("User", backref="gantt_view_presets")

    __table_args__ = (
        Index("ix_gantt_view_presets_owner", "owner_user_id"),
        Index("ix_gantt_view_presets_project", "project_id"),
        Index("ix_gantt_view_presets_scope", "sharing_scope"),
    )


# ============================================================================
# ViewPreset Model (Multi-View Presets)
# ============================================================================


class ViewPreset(Base):
    """Multi-view layout preset for server-side persistence.

    Extends the preset concept beyond Gantt views to cover all primary
    application views.  A ``ViewPreset`` stores the complete layout
    configuration for a specific view type (WBS_GANTT, DAILY_COCKPIT,
    SRA_RISK, FACILITY_CHAMBER, EVM_REPORTING) as a validated JSONB
    payload.

    Why multi-view presets?
    ~~~~~~~~~~~~~~~~~~~~~~~

    Each view in the application has its own customisation surface:

    - **WBS_GANTT**: Column layout, filter tokens, density, Gantt toggles.
    - **DAILY_COCKPIT**: Metric card order, focus queue sort, timesheet period.
    - **SRA_RISK**: Iteration count, distribution type, chart visibility.
    - **FACILITY_CHAMBER**: Timeline zoom, facility filters, reservation defaults.
    - **EVM_REPORTING**: Reporting period defaults, format card layout.

    The ``view_type`` discriminator ensures each preset is consumed only
    by the correct view component.  A user can maintain separate presets
    for each view type, and share them across teams.

    The ``layout_schema_version`` field tracks the version of the config
    payload schema, allowing backward-compatible evolution of the preset
    format.  Current version is ``'1.2.0'``.

    Validation
    ~~~~~~~~~~

    The ``config_payload`` JSONB is validated on create and update via
    Pydantic schemas in ``app/schemas/presets.py``.  Validation ensures
    that column fields (for WBS_GANTT presets) exist in the Master Column
    Catalogue and that structural constraints are respected.

    A GIN index on ``config_payload`` enables efficient JSONB queries
    (e.g., finding all presets with a specific filter token).

    Attributes
    ----------
    id : UUID
        Unique identifier for the preset.
    view_type : ViewType
        Discriminator indicating which view consumes this preset.
    name : str
        Human-readable preset name (e.g., "CAM Cost Audit", "Critical Safety Review").
    description : str or None
        Optional description of the preset's purpose.
    author_user_id : UUID
        Foreign key to User — the user who created the preset.
    project_id : UUID or None
        Foreign key to PortfolioNode.  If NULL, the preset is global.
    sharing_scope : SharingScope
        Visibility scope (PRIVATE, PROJECT_SHARED, SYSTEM_GLOBAL).
    classification : PresetClassification
        Security classification of the preset.
    layout_schema_version : str
        Version string of the config payload schema (default '1.2.0').
    config_payload : dict
        JSONB payload containing the complete view configuration.
    created_at : datetime
        Timestamp when the preset was created.
    updated_at : datetime
        Timestamp when the preset was last modified.

    Indexes
    -------
    ix_view_presets_name : Name index for quick lookup by preset name.
    ix_view_presets_view_type : View type index for filtering by view.
    ix_view_presets_author : Author index for filtering by user.
    ix_view_presets_config_gin : GIN index on config_payload for JSONB queries.
    """
    __tablename__ = "view_presets"

    id = Column(
        Uuid,
        primary_key=True,
        default=uuid4,
        index=True,
    )

    # View type discriminator
    view_type = Column(
        SAEnum(ViewType),
        nullable=False,
    )

    name = Column(
        String(120),
        nullable=False,
    )
    description = Column(Text, nullable=True)

    # Author
    author_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Project scoping — NULL means global system preset
    project_id = Column(
        Uuid,
        ForeignKey("portfolio_nodes.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Sharing & classification
    sharing_scope = Column(
        SAEnum(SharingScope),
        default=SharingScope.PRIVATE,
        nullable=False,
    )
    classification = Column(
        SAEnum(PresetClassification),
        default=PresetClassification.OFFICIAL,
        nullable=False,
    )

    # Schema version tracking for backward-compatible evolution
    layout_schema_version = Column(
        String(10),
        default="1.2.0",
        nullable=False,
    )

    # Validated JSONB configuration payload
    config_payload = Column(
        JSONB,
        nullable=False,
    )

    # Timestamps
    created_at = Column(
        DateTime,
        default=_utc_now,
        nullable=False,
    )
    updated_at = Column(
        DateTime,
        default=_utc_now,
        onupdate=_utc_now,
        nullable=False,
    )

    # Relationships
    project = relationship("PortfolioNode", backref="view_presets_multi")
    author = relationship("User", backref="view_presets_multi")

    __table_args__ = (
        Index("ix_view_presets_name", "name"),
        Index("ix_view_presets_view_type", "view_type"),
        Index("ix_view_presets_author", "author_user_id"),
        Index("ix_view_presets_config_gin", "config_payload", postgresql_using="gin"),
    )
