"""Lightweight preview schemas for hover summary cards.

This module defines Pydantic response models used exclusively by the
preview endpoints (``/api/v1/previews/*``).  These schemas are designed
to return just enough data for the hover inspector modals to display
a contextual summary — without loading heavy sub-tree payloads, deep
relationship graphs, or large JSONB attributes.

Design Principles
-----------------

1. **Minimal Fields** — Each schema includes only the fields the hover
   card actually displays.  No custom_attributes, no full dependency
   lists, no baseline snapshots.

2. **ABAC Masking** — If the requesting user lacks clearance for a node,
   the sensitive fields (name, code, custom_attributes) are replaced
   with ``'[RESTRICTED]'`` and ``is_masked`` is set to ``True``.

3. **No Eager Loading** — The router queries use targeted ``select()``
   statements that fetch only the columns needed, avoiding N+1 queries
   and relationship cascade loading.

Schema Reference
~~~~~~~~~~~~~~~~

- :class:`TaskHoverPreview` — Summary of a PortfolioNode for task hover
  cards: code, name, dates, progress, float, blockers, CDRL, V&V.

- :class:`ResourceHoverPreview` — Summary of a ResourceNode for resource
  hover cards: type, location, allocation, top skills.

- :class:`LocationHoverPreview` — Summary of a LocationNode for location
  hover cards: tier, SCIF status, contained asset count.
"""
from typing import List, Optional
from pydantic import BaseModel, Field


# ============================================================================
# Task Hover Preview
# ============================================================================


class AssignedResourceItem(BaseModel):
    """A single resource assigned to a task, shown in the hover card.

    Attributes
    ----------
    name : str
        Human-readable name or code of the assigned resource.
    allocation_percent : float
        Percentage of the resource's capacity allocated to this task
        (e.g., 50.0 for 50% FTE).
    """

    name: str = Field(..., description="Name or code of the assigned resource")
    allocation_percent: float = Field(
        ..., description="Allocation percentage (0.0–100.0)"
    )


class VVTestSummary(BaseModel):
    """Verification & Validation test case summary for a task.

    Attributes
    ----------
    passed : int
        Number of mandatory V&V test cases that are PASSED or WAIVED.
    total : int
        Total number of mandatory V&V test cases linked to the task.
    """

    passed: int = Field(
        ..., description="Number of mandatory V&V tests passed or waived"
    )
    total: int = Field(
        ..., description="Total number of mandatory V&V test cases"
    )


class TaskHoverPreview(BaseModel):
    """Lightweight preview of a PortfolioNode for hover summary cards.

    This schema is returned by ``GET /api/v1/previews/tasks/{id}`` and
    provides just enough context for the hover modal to display a task
    summary without loading the full WBS sub-tree.

    If the requesting user lacks clearance for this node, the ``name``,
    ``code``, and related fields will be masked as ``'[RESTRICTED]'``
    and ``is_masked`` will be ``True``.

    Attributes
    ----------
    id : str
        UUID of the portfolio node.
    code : str
        WBS code (e.g., 'WP-101').  Masked if unauthorized.
    name : str
        Task name.  Masked if unauthorized.
    security_classification : str or None
        Security classification level.  Masked if unauthorized.
    caveats : list of str or None
        Security caveats (e.g., ['UK_EYES_ONLY']).  Masked if unauthorized.
    delivery_mode : str or None
        Delivery methodology (WATERFALL, AGILE, HYBRID).
    planned_start : str or None
        ISO-formatted planned start date.
    planned_finish : str or None
        ISO-formatted planned finish date.
    percent_complete : float
        Physical progress percentage (0.0–100.0).
    total_float : int or None
        Total float in days.  ``None`` if CPM has not been calculated.
    is_critical : bool
        Whether the task is on the critical path (TF ≤ 0).
    assigned_resources : list of AssignedResourceItem
        Resources currently assigned to this task with allocation %.
    active_blockers_count : int
        Number of unresolved blockers on this task.
    linked_cdrl_code : str or None
        CDRL sequence number if a deliverable is linked (e.g., 'CDRL-A004').
    vv_test_summary : VVTestSummary or None
        V&V test pass/total counts if the task requires V&V signoff.
    is_masked : bool
        ``True`` if the user lacks clearance and fields are redacted.
    """

    id: str = Field(..., description="UUID of the portfolio node")
    code: str = Field(..., description="WBS code (e.g., 'WP-101')")
    name: str = Field(..., description="Task name")
    security_classification: Optional[str] = Field(
        None, description="Security classification level"
    )
    caveats: Optional[List[str]] = Field(
        None, description="Security caveats"
    )
    delivery_mode: Optional[str] = Field(
        None, description="Delivery methodology"
    )
    planned_start: Optional[str] = Field(
        None, description="ISO-formatted planned start date"
    )
    planned_finish: Optional[str] = Field(
        None, description="ISO-formatted planned finish date"
    )
    percent_complete: float = Field(
        ..., description="Physical progress percentage (0.0–100.0)"
    )
    total_float: Optional[int] = Field(
        None, description="Total float in days (CPM result)"
    )
    is_critical: bool = Field(
        False, description="Whether the task is on the critical path"
    )
    assigned_resources: List[AssignedResourceItem] = Field(
        default_factory=list,
        description="Resources assigned to this task",
    )
    active_blockers_count: int = Field(
        0, description="Number of unresolved blockers"
    )
    linked_cdrl_code: Optional[str] = Field(
        None, description="Linked CDRL sequence number"
    )
    vv_test_summary: Optional[VVTestSummary] = Field(
        None, description="V&V test pass/total summary"
    )
    is_masked: bool = Field(
        False, description="True if fields are redacted due to clearance"
    )


# ============================================================================
# Resource Hover Preview
# ============================================================================


class SkillItem(BaseModel):
    """A single skill entry for a resource's top skills list.

    Attributes
    ----------
    skill_name : str
        Name of the skill (e.g., 'Systems Safety Assessment').
    proficiency_level : int
        Proficiency rating (1–5: Novice to Master).
    verification_status : str
        How the proficiency was verified
        (SELF_ATTESTED, ENDORSED, CERTIFIED).
    """

    skill_name: str = Field(..., description="Name of the skill")
    proficiency_level: int = Field(
        ..., description="Proficiency rating (1–5)"
    )
    verification_status: str = Field(
        ..., description="Verification status of the proficiency claim"
    )


class ResourceHoverPreview(BaseModel):
    """Lightweight preview of a ResourceNode for hover summary cards.

    This schema is returned by ``GET /api/v1/previews/resources/{id}``
    and provides a quick overview of a resource's type, location,
    current allocation, and top skills.

    If the requesting user lacks clearance for this resource node,
    sensitive fields will be masked as ``'[RESTRICTED]'``.

    Attributes
    ----------
    id : str
        UUID of the resource node.
    code : str
        Resource code (e.g., 'ENG-001').  Masked if unauthorized.
    name : str
        Resource name.  Masked if unauthorized.
    resource_type : str or None
        Type of resource (PERSON, FACILITY, ASSET).
    clearance_level : str or None
        Security clearance level of the resource.  Masked if unauthorized.
    current_location_path : str or None
        ltree path of the current physical location.
    allocated_hours_this_week : float
        Total hours allocated across all active assignments this week.
    capacity_hours : float
        Standard weekly capacity hours for this resource.
    top_skills : list of SkillItem
        Top 3 endorsed skills ranked by proficiency level.
    is_masked : bool
        ``True`` if the user lacks clearance and fields are redacted.
    """

    id: str = Field(..., description="UUID of the resource node")
    code: str = Field(..., description="Resource code")
    name: str = Field(..., description="Resource name")
    resource_type: Optional[str] = Field(
        None, description="Type of resource (PERSON, FACILITY, ASSET)"
    )
    clearance_level: Optional[str] = Field(
        None, description="Security clearance level"
    )
    current_location_path: Optional[str] = Field(
        None, description="ltree path of current physical location"
    )
    allocated_hours_this_week: float = Field(
        0.0, description="Hours allocated this week"
    )
    capacity_hours: float = Field(
        40.0, description="Standard weekly capacity hours"
    )
    top_skills: List[SkillItem] = Field(
        default_factory=list,
        description="Top 3 endorsed skills",
    )
    is_masked: bool = Field(
        False, description="True if fields are redacted due to clearance"
    )


# ============================================================================
# Location Hover Preview
# ============================================================================


class LocationHoverPreview(BaseModel):
    """Lightweight preview of a LocationNode for hover summary cards.

    This schema is returned by ``GET /api/v1/previews/locations/{id}``
    and provides a quick overview of a physical location's tier,
    security status, and contained asset count.

    If the requesting user lacks clearance for this location node,
    sensitive fields will be masked as ``'[RESTRICTED]'``.

    Attributes
    ----------
    id : str
        UUID of the location node.
    code : str
        Location code (e.g., 'SITE-WARTON').  Masked if unauthorized.
    name : str
        Location name.  Masked if unauthorized.
    tier : str or None
        Hierarchy tier (SITE, FACILITY, ZONE, ROOM, CONTAINER, SUB_CONTAINER).
    path : str or None
        ltree path in the location hierarchy.
    is_scif_or_tempest : bool
        Whether this is a SCIF or TEMPEST-rated facility.
    escort_required : bool
        Whether visitors require an escort.
    contained_assets_count : int
        Number of physical assets currently located here or in sub-locations.
    is_masked : bool
        ``True`` if the user lacks clearance and fields are redacted.
    """

    id: str = Field(..., description="UUID of the location node")
    code: str = Field(..., description="Location code")
    name: str = Field(..., description="Location name")
    tier: Optional[str] = Field(
        None, description="Hierarchy tier (SITE, FACILITY, ZONE, etc.)"
    )
    path: Optional[str] = Field(
        None, description="ltree path in the location hierarchy"
    )
    is_scif_or_tempest: bool = Field(
        False, description="Whether this is a SCIF or TEMPEST facility"
    )
    escort_required: bool = Field(
        False, description="Whether visitors require an escort"
    )
    contained_assets_count: int = Field(
        0, description="Number of assets in this location and sub-locations"
    )
    is_masked: bool = Field(
        False, description="True if fields are redacted due to clearance"
    )
