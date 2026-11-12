"""Pydantic schemas for API request and response validation.

This module defines all data contracts between the API and its clients.
Each schema specifies the exact shape of data that an endpoint accepts
(incoming requests) or returns (outgoing responses).

Why Pydantic schemas?
~~~~~~~~~~~~~~~~~~~~~

Pydantic provides automatic validation and serialization of API data.
When a client sends a request, Pydantic validates the payload against
the corresponding schema and rejects invalid data with clear error
messages.  When the API returns a response, Pydantic serialises the
data to JSON, ensuring only the declared fields are exposed.

Schema Organisation
~~~~~~~~~~~~~~~~~~~

The schemas are organised into groups that mirror the application's
domain model:

- **User Schemas** — User account creation, updates, and responses.
- **UBN Schemas** — Base schemas shared by all breakdown node types.
- **Portfolio Node Schemas** — WBS-specific create/update/response schemas.
- **Resource Node Schemas** — RBS-specific schemas.
- **Location Node Schemas** — LBS-specific schemas.
- **Display Settings Schemas** — Server-side display profile schemas.
- **CPM Schedule Schemas** — Critical Path Method calculation results.
- **Cockpit Schemas** — Daily Cockpit dashboard data.

Naming Convention
~~~~~~~~~~~~~~~~~

- ``*Base`` — Shared fields used by both create and update schemas.
- ``*Create`` — Fields required to create a new resource.
- ``*Update`` — All fields optional; only sent fields are updated.
- ``*Response`` — Fields returned to the client (includes id, timestamps).

Security Note
~~~~~~~~~~~~~

Response schemas never expose sensitive fields such as ``hashed_password``.
The ``UserResponse`` schema includes only safe fields: id, username, email,
full_name, role, clearance_level, caveats, is_active, and created_at.
"""
from pydantic import BaseModel, ConfigDict, Field, field_validator
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from uuid import UUID
from app.models.models import (
    UserRole, TreeType, SecurityClassification,
    DeliveryMode, ResourceType, LocationTier,
    Density, Theme, ColorAccessibility,
    ProficiencyLevel, VerificationStatus, RequisitionStatus,
    ClashCategory, ClashSeverity,
    BaselineTier, BaselineChangeRequestStatus,
    CDRLStatus, VerificationTestCaseStatus,
    ExportBatchStatus,
    CostElementCategory,
    ExportControlRegime,
    TemplateTier,
    EVMTechnique,
    ProcurementLifecycleStage,
    TransactionType,
    DALSILLevel, EngineeringBaselineTier,
    ConcessionType, ConcessionDisposition, SafetySignificance,
    ContractPricingType, AcceptanceDocumentType, AcceptanceStatus,
    ClearanceType, MaterialType, LotStatus,
)


# ==================== User Schemas ====================

class UserBase(BaseModel):
    """Base schema shared by user creation and response models.

    Contains the core fields that identify a user and define their
    security clearance for Attribute-Based Access Control (ABAC).
    """
    username: str = Field(..., min_length=3, max_length=50)
    email: str
    full_name: Optional[str] = None
    role: UserRole = UserRole.MEMBER
    clearance_level: SecurityClassification = SecurityClassification.OFFICIAL
    caveats: Optional[List[str]] = None
    primary_citizenship: Optional[str] = Field(None, min_length=2, max_length=2)
    dual_citizenships: Optional[List[str]] = None
    employer_legal_entity: Optional[str] = Field(None, max_length=200)
    is_subcontractor_user: bool = False
    assigned_vendor_cage: Optional[str] = Field(None, max_length=32)


class UserCreate(UserBase):
    """Schema for creating a new user account.

    Extends :class:`UserBase` with a required password field.
    The password must be at least 8 characters long.
    """
    password: str = Field(..., min_length=8)


class UserUpdate(BaseModel):
    """Schema for updating an existing user account.

    All fields are optional.  Only the fields included in the request
    body will be updated; omitted fields remain unchanged.
    """
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    clearance_level: Optional[SecurityClassification] = None
    caveats: Optional[List[str]] = None
    primary_citizenship: Optional[str] = Field(None, min_length=2, max_length=2)
    dual_citizenships: Optional[List[str]] = None
    employer_legal_entity: Optional[str] = Field(None, max_length=200)
    is_subcontractor_user: Optional[bool] = None
    assigned_vendor_cage: Optional[str] = Field(None, max_length=32)


class UserResponse(UserBase):
    """Schema for user data returned in API responses.

    Extends :class:`UserBase` with server-generated fields: id, is_active,
    and created_at.  Note that ``hashed_password`` is never included.
    """
    id: int
    is_active: bool
    created_at: datetime
    is_subcontractor_user: bool = False
    assigned_vendor_cage: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("caveats", mode="before")
    @classmethod
    def normalize_caveats(cls, v):
        """Normalize caveats from DB string format to list."""
        if v is None:
            return None
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            stripped = v.strip("{}")
            if not stripped:
                return []
            return [x.strip(' "') for x in stripped.split(",") if x.strip(' "')]
        return list(v) if v else []


# ==================== Universal Breakdown Node Schemas ====================

class UBNBase(BaseModel):
    """Base schema shared by all breakdown node types.

    Contains the common fields that every node in the unified tree
    (WBS, RBS, LBS) possesses: identity, path, security classification,
    and extensibility attributes.
    """
    tree_type: TreeType
    code: str = Field(..., max_length=100)
    name: str = Field(..., max_length=200)
    path: str
    security_classification: SecurityClassification = SecurityClassification.OFFICIAL
    caveats: Optional[List[str]] = None
    odac_permissions: Optional[Dict[str, Any]] = None
    custom_attributes: Optional[Dict[str, Any]] = None
    is_active: bool = True
    export_control_regime: ExportControlRegime = ExportControlRegime.NOT_CONTROLLED
    eccn_or_usml_category: Optional[str] = Field(None, max_length=100)
    authorized_nationalities: Optional[List[str]] = None
    taa_mla_reference: Optional[str] = Field(None, max_length=200)


class UBNCreate(UBNBase):
    """Schema for creating a new breakdown node.

    Extends :class:`UBNBase` with an optional ``parent_id``.  If omitted,
    the node is created as a root node.
    """
    parent_id: Optional[UUID] = None


class UBNUpdate(BaseModel):
    """Schema for updating an existing breakdown node.

    All fields are optional.  Only the fields included in the request
    body will be updated; omitted fields remain unchanged.
    
    The ``version_id`` field supports optimistic concurrency control:
    include it to ensure the update only succeeds if no other user has
    modified the node since you last read it.  If the version mismatch,
    the server returns HTTP 409 Conflict.
    """
    code: Optional[str] = None
    name: Optional[str] = None
    path: Optional[str] = None
    security_classification: Optional[SecurityClassification] = None
    caveats: Optional[List[str]] = None
    odac_permissions: Optional[Dict[str, Any]] = None
    custom_attributes: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    export_control_regime: Optional[ExportControlRegime] = None
    eccn_or_usml_category: Optional[str] = Field(None, max_length=100)
    authorized_nationalities: Optional[List[str]] = None
    taa_mla_reference: Optional[str] = Field(None, max_length=200)
    version_id: Optional[int] = None


class UBNResponse(UBNBase):
    """Schema for breakdown node data returned in API responses.

    Extends :class:`UBNBase` with server-generated fields: id, parent_id,
    created_at, updated_at, and version_id for optimistic concurrency.
    """
    id: UUID
    parent_id: Optional[UUID] = None
    version_id: int = 1
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==================== Portfolio Node Schemas ====================

class PortfolioNodeCreate(UBNCreate):
    """Create a Portfolio (WBS) node."""
    delivery_mode: Optional[DeliveryMode] = None
    planned_start_date: Optional[datetime] = None
    planned_end_date: Optional[datetime] = None
    duration_days: Optional[float] = None
    lag_days: Optional[float] = 0.0
    percent_complete: float = 0.0
    pv: Optional[float] = None
    ev: Optional[float] = None
    ac: Optional[float] = None
    evm_technique: Optional[str] = None
    bac_cost: Optional[float] = None
    planned_value: Optional[float] = None
    earned_value: Optional[float] = None
    actual_cost: Optional[float] = None
    requires_vv_signoff: bool = False
    calendar_id: Optional[UUID] = None
    currency_code: str = "GBP"
    contract_exchange_rate_id: Optional[UUID] = None
    baseline_effort_days: Optional[float] = None


class PortfolioNodeUpdate(UBNUpdate):
    """Update a Portfolio (WBS) node."""
    delivery_mode: Optional[DeliveryMode] = None
    planned_start_date: Optional[datetime] = None
    planned_end_date: Optional[datetime] = None
    duration_days: Optional[float] = None
    lag_days: Optional[float] = None
    actual_start_date: Optional[datetime] = None
    actual_end_date: Optional[datetime] = None
    percent_complete: Optional[float] = None
    pv: Optional[float] = None
    ev: Optional[float] = None
    ac: Optional[float] = None
    evm_technique: Optional[str] = None
    bac_cost: Optional[float] = None
    planned_value: Optional[float] = None
    earned_value: Optional[float] = None
    actual_cost: Optional[float] = None
    requires_vv_signoff: Optional[bool] = None
    calendar_id: Optional[UUID] = None
    currency_code: Optional[str] = None
    contract_exchange_rate_id: Optional[UUID] = None
    baseline_effort_days: Optional[float] = None


class PortfolioNodeResponse(UBNResponse):
    """Response for a Portfolio (WBS) node."""
    delivery_mode: Optional[DeliveryMode] = None
    planned_start_date: Optional[datetime] = None
    planned_end_date: Optional[datetime] = None
    duration_days: Optional[float] = None
    lag_days: Optional[float] = 0.0
    actual_start_date: Optional[datetime] = None
    actual_end_date: Optional[datetime] = None
    percent_complete: float
    pv: Optional[float] = None
    ev: Optional[float] = None
    ac: Optional[float] = None
    evm_technique: Optional[str] = None
    bac_cost: Optional[float] = None
    planned_value: Optional[float] = None
    earned_value: Optional[float] = None
    actual_cost: Optional[float] = None
    requires_vv_signoff: bool = False
    calendar_id: Optional[UUID] = None
    currency_code: str = "GBP"
    contract_exchange_rate_id: Optional[UUID] = None
    is_relative_t0_mode: bool = False
    relative_start_day_offset: Optional[int] = None
    relative_finish_day_offset: Optional[int] = None
    atp_anchor_date: Optional[date] = None
    cost_distribution_profile: Optional[str] = None
    baseline_effort_days: Optional[float] = None
    agile_actual_effort_days: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


# ==================== Resource Node Schemas ====================

class ResourceNodeCreate(UBNCreate):
    """Create a Resource (RBS) node."""
    resource_type: ResourceType
    standard_hourly_rate: Optional[float] = None
    is_generic_placeholder: bool = False
    current_location_id: Optional[UUID] = None


class ResourceNodeUpdate(UBNUpdate):
    """Update a Resource (RBS) node."""
    resource_type: Optional[ResourceType] = None
    standard_hourly_rate: Optional[float] = None
    is_generic_placeholder: Optional[bool] = None
    current_location_id: Optional[UUID] = None


class ResourceNodeResponse(UBNResponse):
    """Response for a Resource (RBS) node."""
    resource_type: ResourceType
    standard_hourly_rate: Optional[float] = None
    is_generic_placeholder: bool
    current_location_id: Optional[UUID] = None

    model_config = ConfigDict(from_attributes=True)


# ==================== Location Node Schemas ====================

class LocationNodeCreate(UBNCreate):
    """Create a Location (LBS) node."""
    tier: LocationTier
    is_scif_or_tempest: bool = False
    escort_required: bool = False


class LocationNodeUpdate(UBNUpdate):
    """Update a Location (LBS) node."""
    tier: Optional[LocationTier] = None
    is_scif_or_tempest: Optional[bool] = None
    escort_required: Optional[bool] = None


class LocationNodeResponse(UBNResponse):
    """Response for a Location (LBS) node."""
    tier: LocationTier
    is_scif_or_tempest: bool
    escort_required: bool

    model_config = ConfigDict(from_attributes=True)


# ==================== Display Settings Schemas ====================

class DisplaySettingsBase(BaseModel):
    """Base schema for user display settings.

    Contains all fields that define a user's visual preferences:
    density, scale, theme, color accessibility, font customization,
    work item defaults, and custom view state.
    """
    profile_name: str = Field(default="DEFAULT", max_length=50)
    is_active_default: bool = True
    density: Density = Density.BALANCED
    scale_factor: float = Field(default=1.0, ge=0.80, le=1.50)
    row_height_px: int = Field(default=36, ge=20, le=100)
    theme: Theme = Theme.SCIF_DARK
    color_accessibility: ColorAccessibility = ColorAccessibility.STANDARD_RAG
    # Font customization
    font_family: Optional[str] = Field(default="Inter", max_length=50)
    font_size: Optional[int] = Field(default=16, ge=12, le=24)
    # Work item defaults
    default_duration_days: Optional[int] = Field(default=None, ge=1, le=3650)
    default_delivery_mode: Optional[str] = Field(default=None, max_length=20)
    default_scheduling_mode: Optional[str] = Field(default=None, max_length=10)
    view_state_overrides: Optional[Dict[str, Any]] = None


class DisplaySettingsUpdate(BaseModel):
    """Schema for partially updating display settings.

    All fields are optional.  Only the fields included in the request
    will be merged into the existing profile.  Validation constraints
    are enforced: scale_factor must be 0.80–1.50, row_height_px must
    be 20–100, font_size must be 12–24.
    """
    profile_name: Optional[str] = Field(None, max_length=50)
    is_active_default: Optional[bool] = None
    density: Optional[Density] = None
    scale_factor: Optional[float] = Field(None, ge=0.80, le=1.50)
    row_height_px: Optional[int] = Field(None, ge=20, le=100)
    theme: Optional[Theme] = None
    color_accessibility: Optional[ColorAccessibility] = None
    # Font customization
    font_family: Optional[str] = Field(None, max_length=50)
    font_size: Optional[int] = Field(None, ge=12, le=24)
    # Work item defaults
    default_duration_days: Optional[int] = Field(None, ge=1, le=3650)
    default_delivery_mode: Optional[str] = Field(None, max_length=20)
    default_scheduling_mode: Optional[str] = Field(None, max_length=10)
    view_state_overrides: Optional[Dict[str, Any]] = None


class DisplaySettingsResponse(DisplaySettingsBase):
    """Schema for display settings returned in API responses.

    Extends :class:`DisplaySettingsBase` with server-generated fields:
    id, user_id, created_at, and updated_at.
    """
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==================== CPM Schedule Schemas ====================

class ScheduleActivityResponse(BaseModel):
    """Per-activity schedule metrics returned by CPM calculation.

    Contains the forward and backward pass results for a single
    PortfolioNode: early/late start/finish, total float, free float,
    and critical path status.
    """
    node_id: str
    code: str
    name: str
    duration_days: int
    early_start: str
    early_finish: str
    late_start: str
    late_finish: str
    total_float: int
    free_float: int
    is_critical: bool


class DCMAFlagResponse(BaseModel):
    """A single DCMA 14-Point integrity check flag.

    The DCMA (Defense Contract Management Agency) 14-Point checklist
    is a standard set of integrity checks for project schedules.
    Each flag indicates a potential issue found during the check.
    """
    point: int
    node_id: Optional[str] = None
    message: str
    severity: str


class CPMResultResponse(BaseModel):
    """Full CPM recalculation result returned by the schedule endpoint.

    Contains the complete schedule calculation results: per-activity
    metrics, critical path information, and any DCMA integrity flags.
    """
    project_id: str
    total_activities: int
    total_dependencies: int
    project_duration_days: int
    critical_path_length: int
    critical_path_codes: List[str]
    schedule: List[ScheduleActivityResponse]
    dcma_flags: List[DCMAFlagResponse]
    calculated_at: str


# ==================== Cockpit Schemas ====================

class CockpitSummaryResponse(BaseModel):
    """Key metrics for the user's Daily Cockpit landing page.

    Provides a quick overview of the user's workload: active tasks,
    planned hours, upcoming deadlines, and blocked items.
    """
    active_sprint_task_count: int
    total_planned_hours_this_week: float
    tasks_due_within_48h: int
    tasks_blocked_count: int


class FocusQueueTaskResponse(BaseModel):
    """A single task in the user's focus queue.

    Tasks are ordered by critical path status (critical first) then
    by due date (earliest first), so the most urgent items appear
    at the top.
    """
    node_id: str
    code: str
    name: str
    percent_complete: float
    planned_start_date: Optional[datetime] = None
    planned_end_date: Optional[datetime] = None
    is_critical_path: bool = False
    total_float_days: Optional[int] = None
    security_classification: Optional[SecurityClassification] = None
    is_masked: bool = False


class FocusQueueResponse(BaseModel):
    """User's focus queue ordered by CPM critical path and due date.

    Wraps a list of :class:`FocusQueueTaskResponse` objects.
    """
    tasks: List[FocusQueueTaskResponse]


class ClaimableTaskResponse(BaseModel):
    """A task assigned to a generic placeholder, available for claiming.

    These are tasks where the assigned resource is a generic placeholder
    (e.g., 'Test Engineer (TBC)').  Users with sufficient clearance can
    claim these tasks from their Daily Cockpit.
    """
    node_id: str
    code: str
    name: str
    placeholder_resource_id: str
    placeholder_resource_name: str
    allocated_units: float
    planned_hours: float
    security_classification: Optional[SecurityClassification] = None


class ClaimableTasksResponse(BaseModel):
    """List of claimable tasks within user's accessible projects.

    Wraps a list of :class:`ClaimableTaskResponse` objects.
    """
    tasks: List[ClaimableTaskResponse]


class ProgressUpdateRequest(BaseModel):
    """Request body for a quick progress update.

    Allows the user to quickly advance a task's progress by +5%, +10%,
    or mark it as complete, optionally logging hours worked.
    """
    progress_type: str = Field(..., description="One of: +5, +10, complete")
    logged_hours: Optional[float] = Field(None, ge=0, description="Optional hours logged with this update")


class ProgressUpdateResponse(BaseModel):
    """Response after a quick progress update.

    Confirms the previous and new completion percentages and any
    logged hours.
    """
    node_id: str
    code: str
    name: str
    previous_percent_complete: float
    new_percent_complete: float
    logged_hours: Optional[float] = None
    updated_at: datetime


class BlockerCreateRequest(BaseModel):
    """Request body for creating a new blocker on a task.

    Used by the Daily Cockpit to report impediments that are preventing
    a task from progressing.
    """
    category: str = Field(..., description="Blocker category: DEPENDENCY_OVERDUE, RESOURCE_UNAVAILABLE, CLEARANCE_HOLD, FACILITY_MAINTENANCE, OPERATIONAL_IMPEDIMENT")
    severity: str = Field(..., description="Blocker severity: CRITICAL, MAJOR, MINOR")
    impacted_hours: float = Field(..., ge=0, description="Estimated hours impacted by this blocker")
    description: Optional[str] = Field(None, description="Optional description of the blocker")


class BlockerCreateResponse(BaseModel):
    """Response after creating a blocker.

    Confirms the blocker was created and includes the audit log ID
    for forensic traceability.
    """
    blocker_id: str
    node_id: str
    category: str
    severity: str
    impacted_hours: float
    created_at: datetime
    audit_log_id: Optional[str] = None


# ==================== Skill Matrix Schemas ====================

class SkillCategoryBase(BaseModel):
    """Base schema for skill categories.

    A skill category groups related skills (e.g., 'AVIONICS' contains
    radar, flight control, and communications skills).
    """
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None


class SkillCategoryCreate(SkillCategoryBase):
    """Schema for creating a new skill category."""
    pass


class SkillCategoryUpdate(BaseModel):
    """Schema for updating an existing skill category.

    All fields are optional; only sent fields are updated.
    """
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None


class SkillCategoryResponse(SkillCategoryBase):
    """Schema for skill category data returned in API responses."""
    id: int

    model_config = ConfigDict(from_attributes=True)


class SkillDefinitionBase(BaseModel):
    """Base schema for skill definitions.

    A skill definition represents a discrete capability (e.g., 'RF Hardware
    Design') within a category.
    """
    category_id: int
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None


class SkillDefinitionCreate(SkillDefinitionBase):
    """Schema for creating a new skill definition."""
    pass


class SkillDefinitionUpdate(BaseModel):
    """Schema for updating an existing skill definition.

    All fields are optional; only sent fields are updated.
    """
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None


class SkillDefinitionResponse(SkillDefinitionBase):
    """Schema for skill definition data returned in API responses."""
    id: int
    category: Optional[SkillCategoryResponse] = None

    model_config = ConfigDict(from_attributes=True)


class UserSkillProfileBase(BaseModel):
    """Base schema for user skill profiles.

    A user skill profile records a user's proficiency in a specific skill,
    along with how that proficiency has been verified.
    """
    skill_id: int
    proficiency_level: ProficiencyLevel = ProficiencyLevel.NOVICE
    verification_status: VerificationStatus = VerificationStatus.SELF_ATTESTED
    certificate_expiry: Optional[date] = None


class UserSkillProfileCreate(UserSkillProfileBase):
    """Schema for creating a new user skill profile."""
    pass


class UserSkillProfileUpdate(BaseModel):
    """Schema for updating an existing user skill profile.

    All fields are optional; only sent fields are updated.
    """
    proficiency_level: Optional[ProficiencyLevel] = None
    verification_status: Optional[VerificationStatus] = None
    certificate_expiry: Optional[date] = None


class UserSkillProfileResponse(UserSkillProfileBase):
    """Schema for user skill profile data returned in API responses."""
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    skill: Optional[SkillDefinitionResponse] = None

    model_config = ConfigDict(from_attributes=True)


# ==================== Requisition Schemas ====================

class RequisitionCreate(BaseModel):
    """Schema for submitting a new resource requisition request.

    A requisition requests allocation of a resource to a portfolio node
    (task or work package).  It specifies what is needed (skills, hours,
    dates) and optionally targets a specific resource.
    """
    portfolio_node_id: UUID
    target_resource_id: Optional[UUID] = None
    required_skill_id: Optional[int] = None
    min_proficiency: ProficiencyLevel = ProficiencyLevel.NOVICE
    requested_hours: float = Field(..., gt=0)
    start_date: date
    end_date: date
    notes: Optional[str] = None


class RequisitionUpdate(BaseModel):
    """Schema for updating a requisition (e.g., during review).

    Used by approvers to set status, rejection reason, or notes.
    """
    status: Optional[RequisitionStatus] = None
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None


class RequisitionResponse(BaseModel):
    """Schema for requisition data returned in API responses.

    Includes full requisition details plus the requester and approver
    information for traceability.
    """
    id: UUID
    portfolio_node_id: UUID
    requested_by_user_id: int
    target_resource_id: Optional[UUID] = None
    required_skill_id: Optional[int] = None
    min_proficiency: ProficiencyLevel
    requested_hours: float
    start_date: date
    end_date: date
    status: RequisitionStatus
    approver_user_id: Optional[int] = None
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CandidateMatchResponse(BaseModel):
    """A ranked candidate match returned by the matching engine.

    When a requisition is submitted or reviewed, the matching engine
    ranks all eligible candidates by skill match percentage and
    forward capacity availability.

    Attributes
    ----------
    user_id : int
        The candidate's user ID.
    username : str
        The candidate's login name.
    full_name : str or None
        The candidate's human-readable name.
    match_score : float
        Overall match percentage (0-100).  100 means a perfect match.
    skill_matches : list of dict
        Detailed breakdown of how each required skill matched,
        including the user's proficiency and verification status.
    available_hours : float
        Hours the candidate has available within the requested
        date range, after accounting for existing assignments.
    clearance_sufficient : bool
        Whether the candidate has sufficient security clearance
        for the target portfolio node.
    """
    user_id: int
    username: str
    full_name: Optional[str] = None
    match_score: float
    skill_matches: List[Dict[str, Any]]
    available_hours: float
    clearance_sufficient: bool


# ==================== Schedule Clash Schemas ====================

class LevelingShiftResponse(BaseModel):
    """A proposed date shift for a single portfolio node.

    Returned by the leveling engine in Proposal Mode — the shift
    has not yet been committed to the database.

    Attributes
    ----------
    node_id : str
        UUID of the portfolio node being shifted.
    code : str
        Human-readable code of the node.
    name : str
        Human-readable name of the node.
    original_start : str
        ISO-format datetime of the current planned start.
    original_finish : str
        ISO-format datetime of the current planned finish.
    proposed_start : str
        ISO-format datetime of the proposed new start.
    proposed_finish : str
        ISO-format datetime of the proposed new finish.
    consumed_float_days : int
        Days of Total Float consumed by this shift.
    milestone_breach : bool
        True if the shift would cause a milestone to be missed.
    reason : str
        Explanation of why this shift is proposed.
    """
    node_id: str
    code: str
    name: str
    original_start: str
    original_finish: str
    proposed_start: str
    proposed_finish: str
    consumed_float_days: int
    milestone_breach: bool
    reason: str


class LevelingProposalResponse(BaseModel):
    """Response from the resource leveling proposal endpoint.

    Contains the list of proposed shifts and summary statistics
    so the programme manager can review before signing off.

    Attributes
    ----------
    project_id : str
        UUID of the project being leveled.
    total_shifts : int
        Number of nodes proposed for date shifts.
    shifts : list
        Detailed shift proposals.
    overallocation_windows : int
        Number of resource overallocation windows detected.
    milestone_breaches : int
        Number of shifts that would breach a milestone.
    computed_at : str
        ISO-format timestamp when the proposal was computed.
    message : str or None
        Optional message (e.g., "No overallocations detected").
    """
    project_id: str
    total_shifts: int
    shifts: List[LevelingShiftResponse]
    overallocation_windows: int
    milestone_breaches: int
    computed_at: str
    message: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class LevelingApplyResponse(BaseModel):
    """Response from the apply-leveling endpoint.

    Confirms which shifts were successfully applied and which
    failed, with details for each.

    Attributes
    ----------
    project_id : str
        UUID of the project where leveling was applied.
    applied : int
        Number of shifts successfully committed.
    failed : int
        Number of shifts that failed validation.
    details : list of dict
        Per-shift result details.
    applied_at : str
        ISO-format timestamp when leveling was applied.
    """
    project_id: str
    applied: int
    failed: int
    details: List[Dict[str, Any]]
    applied_at: str


class ClashIssueResponse(BaseModel):
    """A schedule clash issue detected by the audit engine.

    Attributes
    ----------
    id : str
        UUID of this clash issue.
    sweep_run_id : str
        UUID grouping clashes from a single audit sweep.
    category : ClashCategory
        Type of scheduling conflict.
    severity : ClashSeverity
        Urgency level (CRITICAL, MAJOR, ADVISORY).
    portfolio_node_id : str
        Primary node affected by this clash.
    conflicting_node_id : str or None
        Second node involved in the clash.
    conflicting_resource_id : str or None
        Resource involved in the clash.
    conflict_window_start : date
        When the conflict window begins.
    conflict_window_end : date
        When the conflict window ends.
    title : str
        Short summary of the clash.
    description : str
        Detailed explanation of the clash.
    recommended_action : str
        Suggested resolution strategy.
    is_resolved : bool
        Whether this clash has been resolved.
    created_at : datetime
        When this clash was detected.
    """
    id: str
    sweep_run_id: str
    category: ClashCategory
    severity: ClashSeverity
    portfolio_node_id: str
    conflicting_node_id: Optional[str] = None
    conflicting_resource_id: Optional[str] = None
    conflict_window_start: date
    conflict_window_end: date
    title: str
    description: str
    recommended_action: str
    is_resolved: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ClashListResponse(BaseModel):
    """Response listing active schedule clashes.

    Attributes
    ----------
    total_clashes : int
        Total number of active (unresolved) clashes.
    by_severity : dict
        Breakdown of clash counts by severity level.
    clashes : list
        Detailed clash issue records.
    """
    total_clashes: int
    by_severity: Dict[str, int]
    clashes: List[ClashIssueResponse]


class SweepResultResponse(BaseModel):
    """Response from running a portfolio clash sweep.

    Attributes
    ----------
    sweep_run_id : str
        UUID identifying this sweep run.
    total_clashes : int
        Total clashes discovered.
    by_severity : dict
        Clash counts by severity.
    by_category : dict
        Clash counts by category.
    clash_ids : list of str
        UUIDs of all clash issues created.
    completed_at : str
        ISO-format timestamp when the sweep completed.
    """
    sweep_run_id: str
    total_clashes: int
    by_severity: Dict[str, int]
    by_category: Dict[str, int]
    clash_ids: List[str]
    completed_at: str


class LevelingApplyRequest(BaseModel):
    """Request body for applying a leveling proposal.

    The client sends back the shifts it wants to commit,
    filtered from the original proposal.

    Attributes
    ----------
    shifts : list of dict
        Shifts to apply, each containing node_id,
        proposed_start, and proposed_finish.
    """
    shifts: List[Dict[str, str]]


# ==================== Baseline Schemas ====================

class BaselineFreezeRequest(BaseModel):
    """Request body for freezing a new Performance Measurement Baseline.

    The client specifies the root portfolio node to freeze, a baseline
    code (e.g., 'B0_CONTRACT'), and an optional BCR reference.

    Attributes
    ----------
    root_node_id : UUID
        The root PortfolioNode whose sub-tree will be frozen.
    baseline_code : str
        Short code identifying this baseline (e.g., 'B0_CONTRACT').
    name : str
        Human-readable name for the baseline.
    bcr_reference : str or None
        Reference to the BCR that led to this baseline (if any).
    """
    root_node_id: UUID
    baseline_code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=255)
    bcr_reference: Optional[str] = None


class BaselineNodeSnapshotResponse(BaseModel):
    """A single node snapshot within a frozen baseline.

    Represents the state of one PortfolioNode at the time the baseline
    was frozen, used for variance comparison against the live node.

    Attributes
    ----------
    id : UUID
        Unique identifier for this snapshot.
    portfolio_node_id : UUID
        The live PortfolioNode that was snapshotted.
    path : str or None
        The ltree path at freeze time.
    code : str or None
        The WBS code at freeze time.
    planned_start_date : date or None
        The planned start date at freeze time.
    planned_end_date : date or None
        The planned end date at freeze time.
    duration_days : int or None
        The duration in days at freeze time.
    total_float : int or None
        The total float from CPM at freeze time.
    budgeted_cost_bac : float or None
        The Budget at Completion at freeze time.
    custom_attributes : dict or None
        Full custom attributes JSONB snapshot.
    """
    id: UUID
    portfolio_node_id: Optional[UUID] = None
    path: Optional[str] = None
    code: Optional[str] = None
    planned_start_date: Optional[date] = None
    planned_end_date: Optional[date] = None
    duration_days: Optional[int] = None
    total_float: Optional[int] = None
    budgeted_cost_bac: Optional[float] = None
    custom_attributes: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(from_attributes=True)


class BaselineResponse(BaseModel):
    """Schema for baseline data returned in API responses.

    Includes the baseline metadata and optionally the list of
    snapshotted nodes.

    Attributes
    ----------
    id : UUID
        Unique identifier for this baseline.
    root_portfolio_node_id : UUID
        The root PortfolioNode whose sub-tree was frozen.
    baseline_code : str
        Short code identifying this baseline.
    name : str
        Human-readable name for the baseline.
    frozen_at : datetime
        Timestamp when the baseline was frozen.
    frozen_by_user_id : UUID or None
        The user who initiated the freeze.
    bcr_reference : str or None
        Reference to the BCR that led to this baseline.
    is_active_target : bool
        Whether this is the current active baseline.
    snapshot_count : int
        Number of nodes snapshotted in this baseline.
    """
    id: UUID
    root_portfolio_node_id: UUID
    baseline_code: str
    name: str
    frozen_at: datetime
    frozen_by_user_id: Optional[UUID] = None
    bcr_reference: Optional[str] = None
    is_active_target: bool
    snapshot_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class BaselineFreezeResponse(BaseModel):
    """Response after successfully freezing a new baseline.

    Confirms the baseline was created and returns the baseline
    details along with the number of snapshotted nodes.

    Attributes
    ----------
    baseline : BaselineResponse
        The newly created baseline.
    snapshots_created : int
        Number of node snapshots created.
    """
    baseline: BaselineResponse
    snapshots_created: int


class BaselineVarianceNodeResponse(BaseModel):
    """Variance comparison for a single node against the baseline.

    Shows how the live node has drifted from its frozen baseline
    snapshot, including schedule variance, cost variance, and
    scope drift classification.

    Attributes
    ----------
    node_id : UUID
        The live portfolio node's ID.
    code : str
        The node's WBS code.
    name : str
        The node's name.
    start_variance_days : int or None
        Days the start date has shifted from baseline
        (positive = slipped later, negative = started earlier).
    finish_variance_days : int or None
        Days the finish date has shifted from baseline.
    bac_variance : float or None
        Difference in Budget at Completion
        (positive = over budget, negative = under budget).
    critical_path_migrated : bool
        True if the node's critical path status changed
        since the baseline was frozen.
    scope_drift : str
        Classification of scope change: UNCHANGED, MODIFIED,
        ADDED_SCOPE, or DELETED_SCOPE.
    baseline_start : date or None
        The planned start date from the baseline snapshot.
    baseline_finish : date or None
        The planned finish date from the baseline snapshot.
    live_start : date or None
        The current planned start date on the live node.
    live_finish : date or None
        The current planned finish date on the live node.
    """
    node_id: UUID
    code: str
    name: str
    start_variance_days: Optional[int] = None
    finish_variance_days: Optional[int] = None
    bac_variance: Optional[float] = None
    critical_path_migrated: bool = False
    scope_drift: str = "UNCHANGED"
    baseline_start: Optional[date] = None
    baseline_finish: Optional[date] = None
    live_start: Optional[date] = None
    live_finish: Optional[date] = None


class BaselineVarianceResponse(BaseModel):
    """Side-by-side variance comparison between live WBS and a baseline.

    Returns aggregate variance statistics and per-node variance
    details so the UI can display a complete picture of how the
    project has drifted from its approved baseline.

    Attributes
    ----------
    baseline_id : UUID
        The baseline being compared against.
    baseline_code : str
        Short code of the baseline.
    root_node_id : UUID
        The root portfolio node.
    total_nodes_compared : int
        Number of nodes compared.
    nodes_with_variance : int
        Number of nodes that have any variance.
    total_start_variance_days : int
        Sum of all start variances (project-level slip).
    total_finish_variance_days : int
        Sum of all finish variances.
    total_bac_variance : float
        Sum of all BAC variances (total cost variance).
    nodes_added : int
        Number of nodes in live tree but not in baseline.
    nodes_deleted : int
        Number of nodes in baseline but not in live tree.
    node_variances : list
        Per-node variance details.
    compared_at : str
        ISO-format timestamp when the comparison was computed.
    """
    baseline_id: UUID
    baseline_code: str
    root_node_id: UUID
    total_nodes_compared: int
    nodes_with_variance: int
    total_start_variance_days: int
    total_finish_variance_days: int
    total_bac_variance: float
    nodes_added: int
    nodes_deleted: int
    node_variances: List[BaselineVarianceNodeResponse]
    compared_at: str


# ==================== Baseline Change Request Schemas ====================

class BCRCreate(BaseModel):
    """Schema for creating a new Baseline Change Request.

    A BCR is a formal request to change an approved baseline.
    It must include a justification, tier, and impact assessment.

    Attributes
    ----------
    bcr_number : str
        Unique, human-readable BCR number (e.g., 'BCR-2024-001').
    title : str
        Short title describing the proposed change.
    justification : str
        Detailed justification for why the change is needed.
    tier : BaselineTier
        The governance tier required for this BCR.
    cost_delta_amount : float or None
        Estimated change in total cost.
    schedule_finish_slip_days : int or None
        Estimated slip in finish date (days).
    contingency_reserve_requested : float or None
        Additional contingency reserve requested.
    """
    bcr_number: str = Field(..., min_length=1, max_length=50)
    title: str = Field(..., min_length=1, max_length=255)
    justification: str = Field(..., min_length=1)
    tier: BaselineTier
    cost_delta_amount: Optional[float] = None
    schedule_finish_slip_days: Optional[int] = None
    contingency_reserve_requested: Optional[float] = None


class BCRUpdate(BaseModel):
    """Schema for updating a Baseline Change Request.

    Used to change the status (approve/reject) and record
    the approver's decision.

    Attributes
    ----------
    status : BaselineChangeRequestStatus or None
        New status for the BCR.
    rejection_reason : str or None
        If rejected, the reason for rejection.
    """
    status: Optional[BaselineChangeRequestStatus] = None
    rejection_reason: Optional[str] = None


class BCRResponse(BaseModel):
    """Schema for BCR data returned in API responses.

    Includes full BCR details plus the creator and approver
    information for traceability.

    Attributes
    ----------
    id : UUID
        Unique identifier for this BCR.
    bcr_number : str
        Unique, human-readable BCR number.
    title : str
        Short title describing the proposed change.
    justification : str
        Detailed justification for the change.
    tier : BaselineTier
        The governance tier required.
    status : BaselineChangeRequestStatus
        Current lifecycle status.
    cost_delta_amount : float or None
        Estimated change in total cost.
    schedule_finish_slip_days : int or None
        Estimated slip in finish date.
    contingency_reserve_requested : float or None
        Additional contingency reserve requested.
    created_by_user_id : UUID or None
        The user who created this BCR.
    approver_user_id : UUID or None
        The user who approved or rejected this BCR.
    rejection_reason : str or None
        If rejected, the reason for rejection.
    created_at : datetime
        When this BCR was created.
    updated_at : datetime
        When this BCR was last modified.
    """
    id: UUID
    bcr_number: str
    title: str
    justification: str
    tier: BaselineTier
    status: BaselineChangeRequestStatus
    cost_delta_amount: Optional[float] = None
    schedule_finish_slip_days: Optional[int] = None
    contingency_reserve_requested: Optional[float] = None
    created_by_user_id: Optional[UUID] = None
    approver_user_id: Optional[UUID] = None
    rejection_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ==================== Notification & Webhook Schemas ====================

class WebhookCreate(BaseModel):
    """Schema for creating a new Teams channel webhook configuration.

    Registers a Microsoft Teams incoming webhook URL for a specific
    portfolio node.  Notifications for that node and its descendants
    will be dispatched to this channel.

    Attributes
    ----------
    portfolio_node_id : UUID
        The portfolio node this webhook is associated with.
    channel_name : str
        Human-readable name of the Teams channel.
    webhook_url : str
        The full Microsoft Teams incoming webhook URL.
    max_permitted_classification : SecurityClassification
        The highest classification level this channel may receive.
    """
    portfolio_node_id: UUID
    channel_name: str = Field(..., min_length=1, max_length=255)
    webhook_url: str = Field(..., min_length=1, max_length=2048)
    max_permitted_classification: SecurityClassification = SecurityClassification.OFFICIAL


class WebhookUpdate(BaseModel):
    """Schema for updating an existing webhook configuration.

    All fields are optional; only the fields included in the request
    will be updated.

    Attributes
    ----------
    channel_name : str or None
        Updated channel name.
    webhook_url : str or None
        Updated webhook URL.
    max_permitted_classification : SecurityClassification or None
        Updated maximum classification level.
    is_active : bool or None
        Whether this webhook is active.
    """
    channel_name: Optional[str] = None
    webhook_url: Optional[str] = None
    max_permitted_classification: Optional[SecurityClassification] = None
    is_active: Optional[bool] = None


class WebhookResponse(BaseModel):
    """Schema for webhook data returned in API responses.

    The webhook_url is masked for security, showing only the last 4
    characters to prevent accidental exposure of the full URL.

    Attributes
    ----------
    id : UUID
        Unique identifier for this webhook.
    portfolio_node_id : UUID
        The associated portfolio node.
    channel_name : str
        Human-readable channel name.
    webhook_url_masked : str
        Masked webhook URL (e.g., 'https://...abcd').
    max_permitted_classification : SecurityClassification
        Maximum classification level permitted.
    is_active : bool
        Whether this webhook is currently active.
    created_at : datetime
        When this webhook was created.
    updated_at : datetime
        When this webhook was last modified.
    """
    id: UUID
    portfolio_node_id: UUID
    channel_name: str
    webhook_url_masked: str
    max_permitted_classification: SecurityClassification
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NotificationEventResponse(BaseModel):
    """Schema for a notification dispatch result.

    Returned when a notification is dispatched, indicating whether
    the content was sent in full or redacted due to classification
    constraints.

    Attributes
    ----------
    event_type : str
        The type of event that triggered this notification.
    webhook_id : UUID
        The webhook to which the notification was dispatched.
    channel_name : str
        The Teams channel that received the notification.
    was_redacted : bool
        Whether the content was redacted due to classification mismatch.
    status : str
        Dispatch status: 'sent', 'redacted_and_sent', or 'error'.
    message : str
        A human-readable status message.
    """
    event_type: str
    webhook_id: UUID
    channel_name: str
    was_redacted: bool
    status: str
    message: str


class NotificationTestResponse(BaseModel):
    """Schema for a test notification dispatch result.

    Returned when a test Adaptive Card is sent to verify a webhook
    configuration is working correctly.

    Attributes
    ----------
    webhook_id : UUID
        The webhook that was tested.
    channel_name : str
        The Teams channel that received the test card.
    status : str
        Dispatch status: 'sent' or 'error'.
    message : str
        A human-readable status message.
    """
    webhook_id: UUID
    channel_name: str
    status: str
    message: str


class WebhookListResponse(BaseModel):
    """Schema for a list of webhooks.

    Attributes
    ----------
    webhooks : list[WebhookResponse]
        The list of webhook configurations.
    total : int
        Total number of webhooks.
    """
    webhooks: List[WebhookResponse]
    total: int


class NotificationDispatchResponse(BaseModel):
    """Schema for a multi-webhook dispatch result.

    When an event triggers notifications to multiple webhooks,
    this schema returns the result for each webhook.

    Attributes
    ----------
    event_type : str
        The type of event dispatched.
    results : list[NotificationEventResponse]
        The dispatch result for each webhook.
    total_sent : int
        Number of notifications successfully sent.
    total_redacted : int
        Number of notifications sent in redacted form.
    total_failed : int
        Number of notifications that failed to send.
    """
    event_type: str
    results: List[NotificationEventResponse]
    total_sent: int
    total_redacted: int
    total_failed: int


# ==================== Contract Deliverable (CDRL) Schemas ====================

class CDRLCreate(BaseModel):
    """Schema for creating a new Contract Deliverable.

    Registers a CDRL or SDRL linked to a portfolio node.  The deliverable
    begins in DRAFTING status and must be explicitly submitted to start
    the review workflow.

    Attributes
    ----------
    portfolio_node_id : UUID
        The portfolio node this deliverable is associated with.
    cdrl_sequence_number : str
        The deliverable sequence number (e.g., 'CDRL-A004').
    title : str
        Human-readable title of the deliverable.
    did_reference : str
        The Data Item Description standard reference.
    revision : str
        The revision label (default 'Rev A').
    contractual_due_date : date
        The contractually required submission date.
    review_window_days : int
        Days allowed for review after submission (default 30).
    """
    portfolio_node_id: UUID
    cdrl_sequence_number: str = Field(..., min_length=1, max_length=50)
    title: str = Field(..., min_length=1, max_length=255)
    did_reference: str = Field(..., min_length=1, max_length=100)
    revision: str = "Rev A"
    contractual_due_date: date
    review_window_days: int = Field(default=30, ge=1, le=365)


class CDRLUpdate(BaseModel):
    """Schema for updating an existing Contract Deliverable.

    All fields are optional.  Updating the status to SUBMITTED will
    automatically calculate the review_deadline_date.

    Attributes
    ----------
    title : str or None
        Updated title.
    revision : str or None
        Updated revision label.
    status : CDRLStatus or None
        Updated lifecycle status.
    actual_submission_date : date or None
        Date the deliverable was submitted.
    review_window_days : int or None
        Updated review window in days.
    """
    title: Optional[str] = None
    revision: Optional[str] = None
    status: Optional[CDRLStatus] = None
    actual_submission_date: Optional[date] = None
    review_window_days: Optional[int] = None


class CDRLResponse(BaseModel):
    """Schema for CDRL data returned in API responses.

    Attributes
    ----------
    id : UUID
        Unique identifier for this deliverable.
    portfolio_node_id : UUID
        The associated portfolio node.
    cdrl_sequence_number : str
        The deliverable sequence number.
    title : str
        Human-readable title.
    did_reference : str
        Data Item Description reference.
    revision : str
        Current revision label.
    status : CDRLStatus
        Current lifecycle status.
    contractual_due_date : date
        Contractual submission deadline.
    actual_submission_date : date or None
        Actual submission date.
    review_window_days : int
        Review window in days.
    review_deadline_date : date or None
        Calculated review deadline.
    days_until_review_deadline : int or None
        Remaining days until the review deadline (negative if overdue).
    created_at : datetime
        When this deliverable was created.
    updated_at : datetime
        When this deliverable was last modified.
    """
    id: UUID
    portfolio_node_id: UUID
    cdrl_sequence_number: str
    title: str
    did_reference: str
    revision: str
    status: CDRLStatus
    contractual_due_date: date
    actual_submission_date: Optional[date] = None
    review_window_days: int
    review_deadline_date: Optional[date] = None
    days_until_review_deadline: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CDRLListResponse(BaseModel):
    """Schema for a list of CDRLs.

    Attributes
    ----------
    deliverables : list[CDRLResponse]
        The list of deliverables.
    total : int
        Total number of deliverables.
    """
    deliverables: List[CDRLResponse]
    total: int


# ==================== Verification Test Case (V&V) Schemas ====================

class VVCCreate(BaseModel):
    """Schema for creating a new Verification & Validation test case.

    Registers a V&V test case linked to a portfolio node.  The test case
    begins in NOT_RUN status and must be explicitly marked as PASSED,
    FAILED, or WAIVED.

    Attributes
    ----------
    portfolio_node_id : UUID
        The portfolio node this test case is associated with.
    test_identifier : str
        Unique test case identifier (e.g., 'ATP-AVIONICS-09').
    title : str
        Human-readable title of the test case.
    standard_reference : str
        The standard or specification validated by this test.
    is_mandatory : bool
        Whether this test must pass for completion (default True).
    """
    portfolio_node_id: UUID
    test_identifier: str = Field(..., min_length=1, max_length=100)
    title: str = Field(..., min_length=1, max_length=255)
    standard_reference: str = Field(..., min_length=1, max_length=255)
    is_mandatory: bool = True


class VVCUpdate(BaseModel):
    """Schema for updating an existing V&V test case.

    All fields are optional.  The most common update is changing the
    status from NOT_RUN to PASSED, FAILED, or WAIVED.

    Attributes
    ----------
    title : str or None
        Updated title.
    status : VerificationTestCaseStatus or None
        Updated test case status.
    is_mandatory : bool or None
        Whether this test is mandatory.
    """
    title: Optional[str] = None
    status: Optional[VerificationTestCaseStatus] = None
    is_mandatory: Optional[bool] = None


class VVCResponse(BaseModel):
    """Schema for V&V test case data returned in API responses.

    Attributes
    ----------
    id : UUID
        Unique identifier for this test case.
    portfolio_node_id : UUID
        The associated portfolio node.
    test_identifier : str
        Test case identifier.
    title : str
        Human-readable title.
    standard_reference : str
        Standard or specification reference.
    is_mandatory : bool
        Whether this test is mandatory for completion.
    status : VerificationTestCaseStatus
        Current test case status.
    created_at : datetime
        When this test case was created.
    updated_at : datetime
        When this test case was last modified.
    """
    id: UUID
    portfolio_node_id: UUID
    test_identifier: str
    title: str
    standard_reference: str
    is_mandatory: bool
    status: VerificationTestCaseStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class VVCListResponse(BaseModel):
    """Schema for a list of V&V test cases.

    Attributes
    ----------
    test_cases : list[VVCResponse]
        The list of test cases.
    total : int
        Total number of test cases.
    mandatory_count : int
        Number of mandatory test cases.
    passed_count : int
        Number of test cases in PASSED or WAIVED status.
    can_complete : bool
        Whether all mandatory test cases are PASSED or WAIVED.
    """
    test_cases: List[VVCResponse]
    total: int
    mandatory_count: int
    passed_count: int
    can_complete: bool


class VVCGateCheckResponse(BaseModel):
    """Schema for a V&V gate check result.

    Returned when checking whether a node can be marked complete.
    Used by the progress update endpoint to enforce the V&V interlock.

    Attributes
    ----------
    node_id : UUID
        The portfolio node being checked.
    requires_vv_signoff : bool
        Whether V&V signoff is required for this node.
    can_complete : bool
        Whether the node is allowed to transition to 100% complete.
    blocking_tests : list[VVCResponse]
        Mandatory test cases that are not yet PASSED or WAIVED.
    message : str
        Human-readable explanation of the result.
    """
    node_id: UUID
    requires_vv_signoff: bool
    can_complete: bool
    blocking_tests: List[VVCResponse]
    message: str


# ==================== Schedule Risk Analysis (SRA) Schemas ====================

class MonteCarloRequest(BaseModel):
    """Schema for triggering a Monte Carlo SRA simulation.

    Attributes
    ----------
    iterations : int
        Number of Monte Carlo iterations to run (default 2000, max 50000).
    seed : int or None
        Optional random seed for reproducible results.
    """
    iterations: int = Field(default=2000, ge=100, le=50000)
    seed: Optional[int] = None


class CriticalityIndexResponse(BaseModel):
    """Schema for a single activity's criticality index result.

    Attributes
    ----------
    node_id : str
        The portfolio node UUID.
    code : str
        The node's WBS code (e.g., 'WP-101').
    name : str
        The node's human-readable name.
    criticality_index : float
        Fraction of iterations (0.0–1.0) in which this activity was
        on the critical path.
    """
    node_id: str
    code: str
    name: str
    criticality_index: float


class DistributionPointResponse(BaseModel):
    """Schema for a single point on the cumulative distribution curve.

    Used by the frontend to plot the SRA probability curve.

    Attributes
    ----------
    percentile : float
        The percentile value (e.g., 50.0 for P50).
    date : str
        The ISO-formatted date at this percentile.
    """
    percentile: float
    date: str


class ProjectDurationStatsResponse(BaseModel):
    """Schema for project duration statistics from the simulation.

    Attributes
    ----------
    min_finish : str
        Earliest project finish date across all iterations (ISO string).
    max_finish : str
        Latest project finish date across all iterations (ISO string).
    mean_finish_ordinal : float
        Mean of finish date ordinals (for reference).
    std_finish_ordinal : float
        Standard deviation of finish date ordinals.
    """
    min_finish: str
    max_finish: str
    mean_finish_ordinal: float
    std_finish_ordinal: float


class MonteCarloResultResponse(BaseModel):
    """Schema for the complete Monte Carlo SRA simulation result.

    This is the primary response returned by the monte-carlo endpoint.
    It contains percentile completion dates, per-activity criticality
    indices, and distribution points for UI curve plotting.

    Attributes
    ----------
    project_id : str
        The root portfolio node UUID.
    iterations : int
        Number of iterations that were actually run.
    seed : int or None
        Random seed used (if provided).
    percentiles : dict
        Dictionary with P50, P80, P90 finish dates (ISO strings).
    criticality_indices : list[CriticalityIndexResponse]
        Per-activity criticality indices, sorted descending.
    distribution_points : list[DistributionPointResponse]
        Subsampled distribution points for UI curve plotting (~50 points).
    project_duration_stats : ProjectDurationStatsResponse
        Summary statistics of project finish dates.
    calculated_at : str
        ISO timestamp of when the simulation completed.
    """
    project_id: str
    iterations: int
    seed: Optional[int] = None
    percentiles: Dict[str, str]
    criticality_indices: List[CriticalityIndexResponse]
    distribution_points: List[DistributionPointResponse]
    project_duration_stats: ProjectDurationStatsResponse
    calculated_at: str


# ==================== Schedule Export Schemas ====================

class ExportRequest(BaseModel):
    """Schema for schedule export query parameters.

    Both the Primavera P6 (.xer) and Microsoft Project (.xml) export
    endpoints accept the same sanitization options.  These options
    control whether classified data is redacted and whether commercial
    rate information is masked before the file is generated.

    Attributes
    ----------
    redact_classified_descriptions : bool
        If True, replace names and codes of nodes classified SECRET or
        higher with ``[RESTRICTED]`` in the exported file.
    mask_commercial_labor_rates : bool
        If True, set all resource hourly rates to ``0.00`` in the
        exported file to prevent proprietary rate leaks.
    """
    redact_classified_descriptions: bool = False
    mask_commercial_labor_rates: bool = False


# ==================== Oracle ERP Integration Schemas ====================

class OracleProjectMappingCreate(BaseModel):
    """Schema for creating an Oracle EBS project mapping for a portfolio node.

    This maps an internal WBS node to the Oracle cost accounting structure
    so that timesheet hours can be correctly charged to the right project.

    Attributes
    ----------
    portfolio_node_id : str
        The UUID of the portfolio node to map.
    oracle_project_number : str
        The Oracle EBS project number (e.g., 'PRJ-10492').
    oracle_task_number : str
        The Oracle EBS task number within the project (e.g., '10.02.01').
    oracle_expenditure_org_name : str
        The Oracle expenditure organisation name.
    oracle_expenditure_type : str
        The Oracle expenditure type (default 'Direct Labor').
    """
    portfolio_node_id: str
    oracle_project_number: str = Field(..., min_length=1, max_length=50)
    oracle_task_number: str = Field(..., min_length=1, max_length=50)
    oracle_expenditure_org_name: str = Field(..., min_length=1, max_length=100)
    oracle_expenditure_type: str = Field(default="Direct Labor", min_length=1, max_length=100)


class OracleProjectMappingUpdate(BaseModel):
    """Schema for updating an existing Oracle EBS project mapping.

    All fields are optional; only the fields included in the request
    will be updated.

    Attributes
    ----------
    oracle_project_number : str or None
        Updated Oracle project number.
    oracle_task_number : str or None
        Updated Oracle task number.
    oracle_expenditure_org_name : str or None
        Updated expenditure organisation name.
    oracle_expenditure_type : str or None
        Updated expenditure type.
    """
    oracle_project_number: Optional[str] = Field(None, min_length=1, max_length=50)
    oracle_task_number: Optional[str] = Field(None, min_length=1, max_length=50)
    oracle_expenditure_org_name: Optional[str] = Field(None, min_length=1, max_length=100)
    oracle_expenditure_type: Optional[str] = Field(None, min_length=1, max_length=100)


class OracleProjectMappingResponse(BaseModel):
    """Schema for an Oracle EBS project mapping returned in API responses.

    Attributes
    ----------
    id : str
        Unique identifier for this mapping.
    portfolio_node_id : str
        The portfolio node UUID.
    oracle_project_number : str
        The Oracle project number.
    oracle_task_number : str
        The Oracle task number.
    oracle_expenditure_org_name : str
        The Oracle expenditure organisation.
    oracle_expenditure_type : str
        The Oracle expenditure type.
    created_at : str
        ISO timestamp of creation.
    updated_at : str
        ISO timestamp of last update.
    """
    id: str
    portfolio_node_id: str
    oracle_project_number: str
    oracle_task_number: str
    oracle_expenditure_org_name: str
    oracle_expenditure_type: str
    created_at: str
    updated_at: str


class TimesheetLineItem(BaseModel):
    """A single timesheet line item representing hours worked on a task.

    This is the atomic unit of a timesheet: one person, one task,
    one date, with a number of hours and optional description.

    Attributes
    ----------
    portfolio_node_id : str
        The portfolio node (task) the hours were worked on.
    oracle_project_number : str
        The Oracle project number for cost charging.
    oracle_task_number : str
        The Oracle task number for cost charging.
    oracle_expenditure_org_name : str
        The Oracle expenditure organisation.
    oracle_expenditure_type : str
        The Oracle expenditure type.
    work_date : str
        The date the work was performed (ISO format).
    hours : float
        Number of hours worked on this task on this date.
    description : str or None
        Optional description of the work performed.
    user_id : str
        The UUID of the user who performed the work.
    user_name : str
        Human-readable name of the user.
    """
    portfolio_node_id: str
    oracle_project_number: str
    oracle_task_number: str
    oracle_expenditure_org_name: str
    oracle_expenditure_type: str
    work_date: str
    hours: float
    description: Optional[str] = None
    user_id: str
    user_name: str


class TimesheetPrepopulateResponse(BaseModel):
    """Schema for the timesheet pre-population response.

    When a user opens their weekly timesheet, this endpoint returns
    scheduled hours derived from active CPM assignments so the user
    can simply confirm or adjust rather than entering from scratch.

    Attributes
    ----------
    user_id : str
        The authenticated user's UUID.
    period_start : str
        Start date of the timesheet period (ISO format).
    period_end : str
        End date of the timesheet period (ISO format).
    scheduled_lines : list[TimesheetLineItem]
        Pre-populated line items based on active assignments.
    """
    user_id: str
    period_start: str
    period_end: str
    scheduled_lines: List[TimesheetLineItem]


class BatchCreateRequest(BaseModel):
    """Schema for creating a new Oracle export batch.

    When a weekly timesheet period is closed, this request creates
    an export batch containing all approved timesheet lines for
    that period.

    Attributes
    ----------
    period_start : str
        Start date of the timesheet period (ISO format).
    period_end : str
        End date of the timesheet period (ISO format).
    """
    period_start: str
    period_end: str


class BatchCreateResponse(BaseModel):
    """Schema for the response after creating an export batch.

    Attributes
    ----------
    batch_id : str
        The UUID of the newly created batch.
    batch_reference : str
        Human-readable batch reference (e.g., 'TS-2024-W42-001').
    period_start : str
        Start date of the period.
    period_end : str
        End date of the period.
    status : ExportBatchStatus
        Current status (always READY_FOR_EXPORT on creation).
    total_hours : float
        Total hours in the batch.
    record_count : int
        Number of timesheet lines in the batch.
    """
    batch_id: str
    batch_reference: str
    period_start: str
    period_end: str
    status: ExportBatchStatus
    total_hours: float
    record_count: int


class TimesheetOracleExportBatchResponse(BaseModel):
    """Schema for an Oracle export batch returned in API responses.

    Attributes
    ----------
    id : str
        Unique batch identifier.
    batch_reference : str
        Human-readable batch reference.
    period_start : str
        Start date of the timesheet period.
    period_end : str
        End date of the timesheet period.
    status : ExportBatchStatus
        Current lifecycle status.
    total_hours : float
        Total hours in the batch.
    record_count : int
        Number of records in the batch.
    created_at : str
        ISO timestamp of batch creation.
    updated_at : str
        ISO timestamp of last update.
    """
    id: str
    batch_reference: str
    period_start: str
    period_end: str
    status: ExportBatchStatus
    total_hours: float
    record_count: int
    created_at: str
    updated_at: str


# ==================== Cost Breakdown Structure (CBS) Schemas ====================

class CostElementCreate(BaseModel):
    """Schema for creating a new cost element in the CBS taxonomy.

    Attributes
    ----------
    code : str
        Short machine-readable code (e.g., 'LABOR_DIRECT').
    name : str
        Human-readable name for reports and UI.
    category : CostElementCategory
        Top-level category (LABOR, MATERIAL, SUBCONTRACT, ODC).
    """
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    category: CostElementCategory


class CostElementUpdate(BaseModel):
    """Schema for updating an existing cost element.

    All fields are optional; only the fields included will be updated.

    Attributes
    ----------
    name : str or None
        Updated human-readable name.
    category : CostElementCategory or None
        Updated category.
    """
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    category: Optional[CostElementCategory] = None


class CostElementResponse(BaseModel):
    """Schema for a cost element returned in API responses.

    Attributes
    ----------
    id : str
        Unique identifier.
    code : str
        Machine-readable code.
    name : str
        Human-readable name.
    category : CostElementCategory
        Top-level category.
    created_at : str
        ISO timestamp of creation.
    """
    id: str
    code: str
    name: str
    category: CostElementCategory
    created_at: str


class IndirectRateCreate(BaseModel):
    """Schema for creating a new FPRA indirect rate structure.

    Attributes
    ----------
    fiscal_year : int
        Fiscal year these rates apply to (e.g., 2026).
    currency_code : str
        Three-letter ISO 4217 currency code (default 'GBP').
    fringe_rate_percent : float
        Fringe benefit rate percentage (e.g., 35.0 for 35%).
    overhead_rate_percent : float
        Overhead rate percentage (e.g., 50.0 for 50%).
    ga_rate_percent : float
        General & Administrative rate percentage (e.g., 12.0 for 12%).
    fee_profit_percent : float
        Fee / profit margin percentage (e.g., 10.0 for 10%).
    """
    fiscal_year: int = Field(..., ge=2000, le=2100)
    currency_code: str = Field(default="GBP", min_length=3, max_length=3)
    fringe_rate_percent: float = Field(default=0, ge=0, le=100)
    overhead_rate_percent: float = Field(default=0, ge=0, le=100)
    ga_rate_percent: float = Field(default=0, ge=0, le=100)
    fee_profit_percent: float = Field(default=0, ge=0, le=100)


class IndirectRateUpdate(BaseModel):
    """Schema for updating an existing FPRA indirect rate structure.

    All fields are optional.

    Attributes
    ----------
    fringe_rate_percent : float or None
        Updated fringe rate.
    overhead_rate_percent : float or None
        Updated overhead rate.
    ga_rate_percent : float or None
        Updated G&A rate.
    fee_profit_percent : float or None
        Updated fee / profit rate.
    """
    fringe_rate_percent: Optional[float] = Field(None, ge=0, le=100)
    overhead_rate_percent: Optional[float] = Field(None, ge=0, le=100)
    ga_rate_percent: Optional[float] = Field(None, ge=0, le=100)
    fee_profit_percent: Optional[float] = Field(None, ge=0, le=100)


class IndirectRateResponse(BaseModel):
    """Schema for an FPRA indirect rate structure returned in API responses.

    Attributes
    ----------
    id : str
        Unique identifier.
    fiscal_year : int
        Fiscal year.
    currency_code : str
        Currency code.
    fringe_rate_percent : float
        Fringe benefit rate.
    overhead_rate_percent : float
        Overhead rate.
    ga_rate_percent : float
        G&A rate.
    fee_profit_percent : float
        Fee / profit rate.
    created_at : str
        ISO timestamp of creation.
    """
    id: str
    fiscal_year: int
    currency_code: str
    fringe_rate_percent: float
    overhead_rate_percent: float
    ga_rate_percent: float
    fee_profit_percent: float
    created_at: str


class TaskCostLedgerEntry(BaseModel):
    """A single cost ledger line for a task, showing one cost element's contribution.

    Attributes
    ----------
    cost_element_code : str
        The cost element code (e.g., 'LABOR_DIRECT').
    cost_element_name : str
        Human-readable cost element name.
    category : CostElementCategory
        Top-level category.
    direct_unburdened_amount : float
        Raw cost before indirect rates.
    fully_burdened_amount : float
        Cost after the full FPRA burdening cascade.
    """
    cost_element_code: str
    cost_element_name: str
    category: CostElementCategory
    direct_unburdened_amount: float
    fully_burdened_amount: float


class TaskCostBreakdownResponse(BaseModel):
    """Schema for a task's complete cost breakdown.

    Returns the unburdened vs. burdened cost tiers for a single task,
    broken down by cost element category.

    Attributes
    ----------
    task_id : str
        The portfolio node UUID.
    task_name : str
        Human-readable task name.
    fiscal_year : int
        Fiscal year of the cost data.
    currency_code : str
        Currency code.
    ledger_entries : list[TaskCostLedgerEntry]
        Individual cost element breakdown lines.
    total_direct : float
        Sum of all direct (unburdened) amounts.
    total_burdened : float
        Sum of all fully-burdened amounts.
    burden_difference : float
        The difference between total_burdened and total_direct
        (the total indirect cost added).
    """
    task_id: str
    task_name: str
    fiscal_year: int
    currency_code: str
    ledger_entries: List[TaskCostLedgerEntry]
    total_direct: float
    total_burdened: float
    burden_difference: float


class CBSCategoryRollup(BaseModel):
    """A single category row in the CBS financial rollup.

    Attributes
    ----------
    category : CostElementCategory
        The cost element category.
    total_direct : float
        Total direct (unburdened) cost for this category.
    total_burdened : float
        Total fully-burdened cost for this category.
    percentage_of_total : float
        This category's share of the total burdened cost (0–100%).
    """
    category: CostElementCategory
    total_direct: float
    total_burdened: float
    percentage_of_total: float


class CBSLevelRollup(BaseModel):
    """A single hierarchy level in the multi-tier CBS rollup.

    Represents one WBS level (Programme, Project, Work Package, etc.)
    with its aggregated cost totals.

    Attributes
    ----------
    node_id : str
        The portfolio node UUID at this level.
    node_name : str
        Human-readable name.
    node_code : str
        WBS code (e.g., 'WP-101').
    outline_level : int
        Depth in the WBS tree (1 = root).
    total_direct : float
        Total direct cost rolled up from all descendants.
    total_burdened : float
        Total burdened cost rolled up from all descendants.
    category_breakdown : list[CBSCategoryRollup]
        Cost breakdown by category at this level.
    """
    node_id: str
    node_name: str
    node_code: str
    outline_level: int
    total_direct: float
    total_burdened: float
    category_breakdown: List[CBSCategoryRollup]


class CBSCBSRollupResponse(BaseModel):
    """Schema for the multi-tier CBS financial rollup response.

    Returns the complete financial picture across all WBS levels,
    from the programme root down to individual tasks, with costs
    broken down by category at each level.

    Attributes
    ----------
    project_id : str
        The root portfolio node UUID.
    project_name : str
        Human-readable project name.
    fiscal_year : int
        Fiscal year of the rollup.
    currency_code : str
        Currency code.
    levels : list[CBSLevelRollup]
        Hierarchical rollup from root to leaf levels.
    grand_total_direct : float
        Grand total of all direct costs.
    grand_total_burdened : float
        Grand total of all fully-burdened costs.
    """
    project_id: str
    project_name: str
    fiscal_year: int
    currency_code: str
    levels: List[CBSLevelRollup]
    grand_total_direct: float
    grand_total_burdened: float


# ==================== Template Catalog Schemas ====================


class StructuralTemplateCreate(BaseModel):
    """Schema for creating a new structural template.

    Attributes
    ----------
    code : str
        Unique template code.
    name : str
        Human-readable name.
    description : str or None
        Optional description.
    tier : TemplateTier
        Hierarchy tier.
    template_graph_payload : dict
        Serialised graph payload.
    """
    code: str = Field(..., min_length=3, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    tier: TemplateTier
    template_graph_payload: Dict[str, Any]


class StructuralTemplateUpdate(BaseModel):
    """Schema for updating an existing structural template.

    All fields are optional for partial updates.

    Attributes
    ----------
    name : str or None
        Updated name.
    description : str or None
        Updated description.
    template_graph_payload : dict or None
        Updated graph payload.
    is_active : bool or None
        Updated active status.
    """
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    template_graph_payload: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class StructuralTemplateResponse(BaseModel):
    """Schema for a structural template returned in API responses.

    Attributes
    ----------
    id : str
        Unique identifier.
    code : str
        Template code.
    name : str
        Template name.
    description : str or None
        Template description.
    tier : TemplateTier
        Hierarchy tier.
    revision_version : int
        Current revision number.
    is_active : bool
        Whether the template is active.
    created_at : str
        ISO timestamp of creation.
    updated_at : str
        ISO timestamp of last update.
    """
    id: str
    code: str
    name: str
    description: Optional[str] = None
    tier: TemplateTier
    revision_version: int
    is_active: bool
    created_at: str
    updated_at: str


class StructuralTemplateListResponse(BaseModel):
    """Schema for listing structural templates.

    Attributes
    ----------
    templates : list[StructuralTemplateResponse]
        List of templates.
    total_count : int
        Total number of templates.
    """
    templates: List[StructuralTemplateResponse]
    total_count: int


class ResourceCrewTemplateCreate(BaseModel):
    """Schema for creating a new resource crew template.

    Attributes
    ----------
    code : str
        Unique crew template code.
    name : str
        Human-readable name.
    description : str or None
        Optional description.
    """
    code: str = Field(..., min_length=3, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None


class ResourceCrewTemplateUpdate(BaseModel):
    """Schema for updating an existing resource crew template.

    All fields are optional.

    Attributes
    ----------
    name : str or None
        Updated name.
    description : str or None
        Updated description.
    is_active : bool or None
        Updated active status.
    """
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    is_active: Optional[bool] = None


class ResourceCrewTemplateResponse(BaseModel):
    """Schema for a resource crew template returned in API responses.

    Attributes
    ----------
    id : str
        Unique identifier.
    code : str
        Crew template code.
    name : str
        Crew template name.
    description : str or None
        Description.
    is_active : bool
        Whether the crew template is active.
    created_at : str
        ISO timestamp of creation.
    updated_at : str
        ISO timestamp of last update.
    """
    id: str
    code: str
    name: str
    description: Optional[str] = None
    is_active: bool
    created_at: str
    updated_at: str


class ResourceCrewTemplateMemberCreate(BaseModel):
    """Schema for adding a role to a resource crew template.

    Attributes
    ----------
    role_name : str
        Human-readable role name.
    resource_type : ResourceType
        Type of resource required.
    required_skill_id : str or None
        UUID of the required skill definition.
    min_proficiency : ProficiencyLevel
        Minimum proficiency level.
    min_clearance : SecurityClassification
        Minimum security clearance.
    default_allocation_fraction : float
        Default allocation fraction (0.0–1.0).
    """
    role_name: str = Field(..., min_length=1, max_length=200)
    resource_type: ResourceType
    required_skill_id: Optional[str] = None
    min_proficiency: ProficiencyLevel = ProficiencyLevel.NOVICE
    min_clearance: SecurityClassification = SecurityClassification.OFFICIAL
    default_allocation_fraction: float = Field(1.0, ge=0.0, le=1.0)


class ResourceCrewTemplateMemberUpdate(BaseModel):
    """Schema for updating a crew template member role.

    All fields are optional.

    Attributes
    ----------
    role_name : str or None
        Updated role name.
    resource_type : ResourceType or None
        Updated resource type.
    required_skill_id : str or None
        Updated skill requirement.
    min_proficiency : ProficiencyLevel or None
        Updated minimum proficiency.
    min_clearance : SecurityClassification or None
        Updated minimum clearance.
    default_allocation_fraction : float or None
        Updated allocation fraction.
    """
    role_name: Optional[str] = Field(None, min_length=1, max_length=200)
    resource_type: Optional[ResourceType] = None
    required_skill_id: Optional[str] = None
    min_proficiency: Optional[ProficiencyLevel] = None
    min_clearance: Optional[SecurityClassification] = None
    default_allocation_fraction: Optional[float] = Field(None, ge=0.0, le=1.0)


class ResourceCrewTemplateMemberResponse(BaseModel):
    """Schema for a crew template member role in API responses.

    Attributes
    ----------
    id : str
        Unique identifier.
    crew_template_id : str
        Parent crew template UUID.
    role_name : str
        Role name.
    resource_type : ResourceType
        Resource type.
    required_skill_id : str or None
        Required skill UUID.
    min_proficiency : ProficiencyLevel
        Minimum proficiency.
    min_clearance : SecurityClassification
        Minimum clearance.
    default_allocation_fraction : float
        Default allocation fraction.
    created_at : str
        ISO timestamp of creation.
    updated_at : str
        ISO timestamp of last update.
    """
    id: str
    crew_template_id: str
    role_name: str
    resource_type: ResourceType
    required_skill_id: Optional[str] = None
    min_proficiency: ProficiencyLevel
    min_clearance: SecurityClassification
    default_allocation_fraction: float
    created_at: str
    updated_at: str


class ResourceCrewTemplateWithMembersResponse(BaseModel):
    """Schema for a crew template including its member roles.

    Attributes
    ----------
    id : str
        Unique identifier.
    code : str
        Crew template code.
    name : str
        Crew template name.
    description : str or None
        Description.
    is_active : bool
        Whether the crew template is active.
    members : list[ResourceCrewTemplateMemberResponse]
        List of role definitions in this crew.
    created_at : str
        ISO timestamp of creation.
    updated_at : str
        ISO timestamp of last update.
    """
    id: str
    code: str
    name: str
    description: Optional[str] = None
    is_active: bool
    members: List[ResourceCrewTemplateMemberResponse]
    created_at: str
    updated_at: str


class TemplateSnapshotRequest(BaseModel):
    """Schema for requesting a snapshot of an existing WBS sub-tree as a template.

    Attributes
    ----------
    node_id : str
        UUID of the root PortfolioNode to snapshot.
    code : str
        Unique template code for the new template.
    name : str
        Human-readable name for the template.
    description : str or None
        Optional description.
    tier : TemplateTier
        Hierarchy tier for the template.
    """
    node_id: str
    code: str = Field(..., min_length=3, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    tier: TemplateTier


class TemplateSnapshotResponse(BaseModel):
    """Schema for the response after successfully creating a template snapshot.

    Attributes
    ----------
    template_id : str
        UUID of the newly created template.
    code : str
        Template code.
    node_count : int
        Number of nodes captured in the snapshot.
    dependency_count : int
        Number of dependency links captured.
    """
    template_id: str
    code: str
    node_count: int
    dependency_count: int


class TemplateInstantiateRequest(BaseModel):
    """Schema for instantiating a template into the live schedule.

    Attributes
    ----------
    template_id : str
        UUID of the template to instantiate.
    parent_node_id : str or None
        UUID of the parent node under which to stamp the template.
        If None, creates a new root node.
    anchor_date : str
        ISO date string (YYYY-MM-DD) serving as T₀ for scheduling.
    anchor_type : str
        'START_DATE' for forward scheduling or 'FINISH_DATE' for
        backward scheduling from a target milestone.
    code_prefix : str
        Prefix applied to all generated node codes (e.g., 'PROJ-002-').
    """
    template_id: str
    parent_node_id: Optional[str] = None
    anchor_date: str
    anchor_type: str = Field("START_DATE", pattern="^(START_DATE|FINISH_DATE)$")
    code_prefix: str = Field(..., min_length=1, max_length=20)


class TemplateInstantiateResponse(BaseModel):
    """Schema for the response after instantiating a template.

    Attributes
    ----------
    root_node_id : str
        UUID of the newly created root node.
    node_count : int
        Number of nodes created.
    dependency_count : int
        Number of dependency links created.
    placeholder_resource_count : int
        Number of generic placeholder resources created.
    """
    root_node_id: str
    node_count: int
    dependency_count: int
    placeholder_resource_count: int


# ==================== Document Artifact Vault Schemas ====================


class ArtifactUploadRequest(BaseModel):
    """Schema for requesting a pre-signed upload URL.

    The client submits metadata about the file it intends to upload.
    The server validates the user's write access, creates a placeholder
    database row, and returns a pre-signed S3 PUT URL.

    Attributes
    ----------
    file_name : str
        Original filename of the document.
    file_size_bytes : int
        Expected file size in bytes (used for S3 Content-Length validation).
    mime_type : str
        MIME type of the file (e.g., 'application/pdf').
    portfolio_node_id : str or None
        UUID of the portfolio node this document is attached to.
    cdrl_id : str or None
        UUID of the CDRL this document fulfils.
    security_classification : SecurityClassification
        Security marking of the document.
    caveats : list[str] or None
        Additional caveat markings.
    export_control_regime : ExportControlRegime
        Export control regime applicable to this document.
    """
    file_name: str = Field(..., min_length=1, max_length=500)
    file_size_bytes: int = Field(..., ge=0)
    mime_type: str = Field(..., min_length=1, max_length=200)
    portfolio_node_id: Optional[str] = None
    cdrl_id: Optional[str] = None
    security_classification: SecurityClassification
    caveats: Optional[List[str]] = None
    export_control_regime: ExportControlRegime = ExportControlRegime.NOT_CONTROLLED


class ArtifactUploadResponse(BaseModel):
    """Schema for the response after requesting an upload URL.

    Returns the pre-signed S3 PUT URL and the artifact metadata so the
    client can complete the upload and then confirm it.

    Attributes
    ----------
    artifact_id : str
        UUID of the newly created artifact record.
    upload_url : str
        Pre-signed S3 PUT URL valid for the upload window.
    s3_object_key : str
        The S3 object key the client must upload to.
    expires_in_seconds : int
        How long the pre-signed URL remains valid.
    """
    artifact_id: str
    upload_url: str
    s3_object_key: str
    expires_in_seconds: int


class ArtifactConfirmUploadRequest(BaseModel):
    """Schema for confirming a completed upload.

    After the client uploads the file to S3, it calls this endpoint
    to verify the S3 object exists and the SHA-256 digest matches.

    Attributes
    ----------
    artifact_id : str
        UUID of the artifact record created during request-upload.
    sha256_checksum : str
        SHA-256 hex digest computed by the client over the uploaded bytes.
    """
    artifact_id: str
    sha256_checksum: str = Field(..., min_length=64, max_length=64)


class ArtifactConfirmUploadResponse(BaseModel):
    """Schema for the response after confirming an upload.

    Attributes
    ----------
    artifact_id : str
        UUID of the confirmed artifact.
    sha256_verified : bool
        Whether the SHA-256 checksum was verified against the S3 object.
    is_active : bool
        Whether the artifact is now available for download.
    """
    artifact_id: str
    sha256_verified: bool
    is_active: bool


class ArtifactDownloadResponse(BaseModel):
    """Schema for the response when requesting a download URL.

    Returns a short-lived pre-signed S3 GET URL that the client can
    use to download the file directly from the object store.

    Attributes
    ----------
    artifact_id : str
        UUID of the artifact.
    file_name : str
        Original filename for the client to save as.
    mime_type : str
        MIME type of the file.
    download_url : str
        Pre-signed S3 GET URL valid for a maximum of 60 seconds.
    expires_in_seconds : int
        How long the pre-signed URL remains valid.
    security_classification : SecurityClassification
        Security marking of the document (for client-side display).
    """
    artifact_id: str
    file_name: str
    mime_type: str
    download_url: str
    expires_in_seconds: int
    security_classification: SecurityClassification


class ArtifactResponse(BaseModel):
    """Schema for a document artifact returned in API responses.

    Attributes
    ----------
    id : str
        Unique identifier.
    file_name : str
        Original filename.
    file_size_bytes : int
        File size in bytes.
    mime_type : str
        MIME type.
    security_classification : SecurityClassification
        Security marking.
    caveats : list[str] or None
        Caveat markings.
    export_control_regime : ExportControlRegime
        Export control regime.
    is_active : bool
        Whether the artifact is available for download.
    portfolio_node_id : str or None
        Attached portfolio node UUID.
    cdrl_id : str or None
        Linked CDRL UUID.
    uploaded_by_user_id : str
        UUID of the uploading user.
    created_at : str
        ISO timestamp of creation.
    """
    id: str
    file_name: str
    file_size_bytes: int
    mime_type: str
    security_classification: SecurityClassification
    caveats: Optional[List[str]] = None
    export_control_regime: ExportControlRegime
    is_active: bool
    portfolio_node_id: Optional[str] = None
    cdrl_id: Optional[str] = None
    uploaded_by_user_id: str
    created_at: str


class ArtifactListResponse(BaseModel):
    """Schema for listing document artifacts.

    Attributes
    ----------
    artifacts : list[ArtifactResponse]
        List of artifact records.
    total_count : int
        Total number of artifacts matching the query.
    """
    artifacts: List[ArtifactResponse]
    total_count: int


# ==================== Airgap Data Exchange Schemas ====================


class AirgapExportRequest(BaseModel):
    """Schema for requesting a .defpack export bundle.

    The client specifies the project to export and the maximum
    classification ceiling for the target domain.  Nodes classified
    above this ceiling will be redacted in the bundle.

    Attributes
    ----------
    project_id : str
        UUID of the root PortfolioNode to export.
    classification_ceiling : SecurityClassification
        Maximum classification level permitted in the export bundle.
        Nodes exceeding this level will have their sensitive fields
        replaced with ``"[RESTRICTED]"``.
    """
    project_id: str = Field(..., min_length=1)
    classification_ceiling: SecurityClassification


class AirgapExportResponse(BaseModel):
    """Schema for the response after generating a .defpack export.

    Returns metadata about the generated bundle.  The actual bundle
    bytes are streamed as a file download.

    Attributes
    ----------
    transaction_id : str
        Unique transaction ID for this export (used for replay detection).
    node_count : int
        Number of nodes included in the bundle.
    dependency_count : int
        Number of dependency links included.
    assignment_count : int
        Number of resource assignments included.
    baseline_count : int
        Number of baselines included.
    archive_size_bytes : int
        Size of the .defpack ZIP archive in bytes.
    classification_ceiling : str
        The classification ceiling applied to the export.
    """
    transaction_id: str
    node_count: int
    dependency_count: int
    assignment_count: int
    baseline_count: int
    archive_size_bytes: int
    classification_ceiling: str


class AirgapImportResponse(BaseModel):
    """Schema for the import validation report returned after ingesting a .defpack.

    The report indicates whether the import succeeded or was rejected,
    along with counts of imported entities and any warnings or errors.

    Attributes
    ----------
    status : str
        "success" if the import completed, "rejected" if validation failed.
    transaction_id : str or None
        The transaction ID from the payload (None if parsing failed).
    nodes_imported : int
        Number of PortfolioNode records created.
    dependencies_imported : int
        Number of DependencyLink records created.
    assignments_imported : int
        Number of ResourceAssignment records created.
    baselines_imported : int
        Number of PortfolioBaseline records created.
    warnings : list[str]
        Non-fatal warnings encountered during import (e.g., redacted nodes).
    errors : list[str]
        Error messages if the import was rejected.
    """
    status: str
    transaction_id: Optional[str] = None
    nodes_imported: int = 0
    dependencies_imported: int = 0
    assignments_imported: int = 0
    baselines_imported: int = 0
    warnings: List[str] = []
    errors: List[str] = []


# ==================== Sandbox Scenario Schemas ====================

class SandboxForkRequest(BaseModel):
    """Schema for creating a new sandbox scenario by forking a live sub-tree.

    The client specifies the root node to fork and a name for the scenario.

    Attributes
    ----------
    root_node_id : str
        UUID of the live PortfolioNode to fork as the sandbox root.
    scenario_name : str
        Human-readable name for the sandbox scenario.
    description : str or None
        Optional description of the scenario's purpose.
    """
    root_node_id: str = Field(..., min_length=1)
    scenario_name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None


class SandboxForkResponse(BaseModel):
    """Schema for the response after forking a sandbox scenario.

    Returns the newly created sandbox scenario and the count of cloned nodes.

    Attributes
    ----------
    scenario_id : str
        UUID of the newly created SandboxScenario.
    scenario_name : str
        Name of the sandbox scenario.
    root_node_id : str
        UUID of the live node that was forked.
    sandbox_root_id : str
        UUID of the new sandbox root node (clone of the live root).
    nodes_cloned : int
        Number of nodes cloned from the live sub-tree.
    dependencies_cloned : int
        Number of dependency links cloned.
    """
    scenario_id: str
    scenario_name: str
    root_node_id: str
    sandbox_root_id: str
    nodes_cloned: int
    dependencies_cloned: int


class SandboxScenarioResponse(BaseModel):
    """Schema for a sandbox scenario returned in API responses.

    Attributes
    ----------
    id : str
        UUID of the sandbox scenario.
    root_portfolio_node_id : str
        UUID of the live node that was forked.
    name : str
        Name of the scenario.
    description : str or None
        Description of the scenario.
    created_by_user_id : int
        ID of the user who created the sandbox.
    status : str
        Current status (ACTIVE, COMMITTED, DISCARDED).
    created_at : str
        ISO timestamp of creation.
    updated_at : str
        ISO timestamp of last update.
    """
    id: str
    root_portfolio_node_id: str
    name: str
    description: Optional[str] = None
    created_by_user_id: int
    status: str
    created_at: str
    updated_at: str


class SandboxDiffEntry(BaseModel):
    """A single entity diff entry comparing sandbox vs live vs baseline.

    Each entry describes how a node has changed between the sandbox branch,
    the current live schedule, and the frozen baseline snapshot.

    Attributes
    ----------
    node_id : str
        UUID of the sandbox node.
    origin_node_id : str or None
        UUID of the live node this sandbox node was cloned from.
    category : str
        Change category: ADDED, MODIFIED_DATES, MODIFIED_LOGIC, DELETED,
        or CONFLICT_LIVE_MUTATED.
    field_diffs : dict
        Dictionary of field-level differences between sandbox and live.
    live_node_exists : bool
        Whether the corresponding live node still exists.
    baseline_node_exists : bool
        Whether a baseline snapshot exists for this node.
    """
    node_id: str
    origin_node_id: Optional[str] = None
    category: str
    field_diffs: Dict[str, Any] = {}
    live_node_exists: bool
    baseline_node_exists: bool


class SandboxDiffResponse(BaseModel):
    """Schema for the three-way diff comparison result.

    Returns a list of diff entries categorising each node's changes
    between the sandbox, live, and baseline.

    Attributes
    ----------
    scenario_id : str
        UUID of the sandbox scenario.
    scenario_name : str
        Name of the sandbox scenario.
    diff_entries : list[SandboxDiffEntry]
        List of per-node diff entries.
    summary : dict
        Summary counts by category (e.g., {'ADDED': 3, 'MODIFIED_DATES': 5}).
    """
    scenario_id: str
    scenario_name: str
    diff_entries: List[SandboxDiffEntry]
    summary: Dict[str, int]


class SandboxMergeRequest(BaseModel):
    """Schema for merging a sandbox scenario back to the live schedule.

    The client can optionally specify which nodes to cherry-pick.
    If no nodes are specified, all changes from the sandbox are merged.

    Attributes
    ----------
    cherry_picked_node_ids : list[str] or None
        Optional list of sandbox node UUIDs to merge.  If None, all
        sandbox nodes are merged.
    """
    cherry_picked_node_ids: Optional[List[str]] = None


class SandboxMergeResponse(BaseModel):
    """Schema for the response after merging a sandbox to live.

    Returns the merge results including counts of updated, added, and
    deleted nodes.

    Attributes
    ----------
    scenario_id : str
        UUID of the sandbox scenario that was merged.
    nodes_updated : int
        Number of live nodes updated with sandbox changes.
    nodes_added : int
        Number of new live nodes created from sandbox additions.
    nodes_deleted : int
        Number of live nodes deleted (if sandbox had deletions).
    dependencies_updated : int
        Number of dependency links updated.
    cpm_recalculated : bool
        Whether CPM was recalculated after the merge.
    """
    scenario_id: str
    nodes_updated: int
    nodes_added: int
    nodes_deleted: int
    dependencies_updated: int
    cpm_recalculated: bool


# ==================== EVM Milestone Weight Step Schemas ====================

class MilestoneWeightStepCreate(BaseModel):
    """Schema for creating a new milestone weight step.

    Used when defining the weighted milestone checkpoints for a task
    using the MILESTONE_WEIGHTS EVM technique.

    Attributes
    ----------
    step_name : str
        Human-readable name of the milestone (e.g., 'PDR Complete').
    weight_fraction : float
        Weight as a fraction of the total (0.0 to 1.0).  All steps for
        a node must sum to 1.0.
    target_date : date or None
        Planned target date for this milestone checkpoint.
    """
    step_name: str = Field(..., min_length=1, max_length=200)
    weight_fraction: float = Field(..., ge=0.0, le=1.0)
    target_date: Optional[date] = None


class MilestoneWeightStepUpdate(BaseModel):
    """Schema for updating an existing milestone weight step.

    All fields are optional.  Notably, ``is_verified_passed`` can be
    set to True to verify a milestone as complete, which triggers
    EV recalculation for the parent task.

    Attributes
    ----------
    step_name : str or None
        Updated name of the milestone.
    weight_fraction : float or None
        Updated weight fraction.
    target_date : date or None
        Updated target date.
    is_verified_passed : bool or None
        Whether this milestone has been verified as complete.
    verified_by_user_id : int or None
        ID of the user verifying this milestone.
    """
    step_name: Optional[str] = Field(None, min_length=1, max_length=200)
    weight_fraction: Optional[float] = Field(None, ge=0.0, le=1.0)
    target_date: Optional[date] = None
    is_verified_passed: Optional[bool] = None
    verified_by_user_id: Optional[int] = None


class MilestoneWeightStepResponse(BaseModel):
    """Schema for a milestone weight step returned in API responses.

    Attributes
    ----------
    id : str
        UUID of the milestone step.
    portfolio_node_id : str
        UUID of the parent PortfolioNode.
    step_name : str
        Name of the milestone.
    weight_fraction : float
        Weight fraction (0.0 to 1.0).
    target_date : date or None
        Planned target date.
    is_verified_passed : bool
        Whether this milestone has been verified.
    verified_at : datetime or None
        When the milestone was verified.
    verified_by_user_id : int or None
        ID of the verifying user.
    """
    id: str
    portfolio_node_id: str
    step_name: str
    weight_fraction: float
    target_date: Optional[date] = None
    is_verified_passed: bool
    verified_at: Optional[datetime] = None
    verified_by_user_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class MilestoneWeightStepListResponse(BaseModel):
    """Schema for listing all milestone weight steps of a task.

    Includes summary fields for quick EV calculation.

    Attributes
    ----------
    steps : list[MilestoneWeightStepResponse]
        List of milestone steps.
    total_weight : float
        Sum of all weight fractions (should equal 1.0).
    verified_weight : float
        Sum of weight fractions for verified steps (used for EV calculation).
    earned_value_fraction : float
        The fraction of BAC that has been earned (0.0 to 1.0).
    """
    steps: List[MilestoneWeightStepResponse]
    total_weight: float
    verified_weight: float
    earned_value_fraction: float


# ==================== EVM Calculation Schemas ====================

class EVMTaskBreakdownResponse(BaseModel):
    """Schema for a single task's EVM breakdown.

    Returns the complete EVM picture for a task, including the technique
    used, all core values, and derived variances and indices.

    Attributes
    ----------
    node_id : str
        UUID of the PortfolioNode.
    code : str
        Work package code (e.g., 'WP-101').
    name : str
        Name of the work package.
    evm_technique : str
        EVM technique used (PERCENT_COMPLETE, ZERO_100, etc.).
    bac_cost : float or None
        Budget at Completion.
    planned_value : float or None
        Planned Value (PV).
    earned_value : float or None
        Earned Value (EV).
    actual_cost : float or None
        Actual Cost (AC).
    cost_variance : float or None
        CV = EV - AC (positive = under budget).
    schedule_variance : float or None
        SV = EV - PV (positive = ahead of schedule).
    cpi : float or None
        Cost Performance Index = EV / AC.
    spi : float or None
        Schedule Performance Index = EV / PV.
    eac : float or None
        Estimate at Completion = BAC / CPI.
    percent_complete : float
        Progress percentage.
    """
    node_id: str
    code: str
    name: str
    evm_technique: str
    bac_cost: Optional[float] = None
    planned_value: Optional[float] = None
    earned_value: Optional[float] = None
    actual_cost: Optional[float] = None
    cost_variance: Optional[float] = None
    schedule_variance: Optional[float] = None
    cpi: Optional[float] = None
    spi: Optional[float] = None
    eac: Optional[float] = None
    percent_complete: float


class EVMSCurvePoint(BaseModel):
    """A single time-phased data point for S-Curve charting.

    Attributes
    ----------
    period_date : str
        ISO date string for the period (e.g., '2026-01-15').
    planned_value : float
        Cumulative PV at this date.
    earned_value : float
        Cumulative EV at this date.
    actual_cost : float
        Cumulative AC at this date.
    """
    period_date: str
    planned_value: float
    earned_value: float
    actual_cost: float


class EVMSCurveResponse(BaseModel):
    """Schema for S-Curve data returned for a project.

    Returns time-phased periodic data points for charting cumulative
    S-Curves showing Planned Value, Earned Value, and Actual Cost
    over the project timeline.

    Attributes
    ----------
    project_id : str
        UUID of the root project node.
    project_name : str
        Name of the project.
    start_date : str
        Project start date (ISO format).
    end_date : str
        Project end date (ISO format).
    total_bac : float
        Total Budget at Completion for the project.
    total_pv : float
        Total Planned Value.
    total_ev : float
        Total Earned Value.
    total_ac : float
        Total Actual Cost.
    curve_points : list[EVMSCurvePoint]
        Time-phased data points for S-Curve charting.
    """
    project_id: str
    project_name: str
    start_date: str
    end_date: str
    total_bac: float
    total_pv: float
    total_ev: float
    total_ac: float
    curve_points: List[EVMSCurvePoint]


class EVMRollupResponse(BaseModel):
    """Schema for hierarchical EVM rollup at a specific WBS level.

    Attributes
    ----------
    node_id : str
        UUID of the rollup node.
    code : str
        Work package code.
    name : str
        Name of the work package.
    level : int
        WBS depth level (1 = Programme, 2 = Project, etc.).
    bac_cost : float
        Rolled-up Budget at Completion.
    planned_value : float
        Rolled-up Planned Value.
    earned_value : float
        Rolled-up Earned Value.
    actual_cost : float
        Rolled-up Actual Cost.
    cost_variance : float
        CV = EV - AC.
    schedule_variance : float
        SV = EV - PV.
    cpi : float or None
        Cost Performance Index.
    spi : float or None
        Schedule Performance Index.
    eac : float or None
        Estimate at Completion.
    child_count : int
        Number of child nodes contributing to this rollup.
    """
    node_id: str
    code: str
    name: str
    level: int
    bac_cost: float
    planned_value: float
    earned_value: float
    actual_cost: float
    cost_variance: float
    schedule_variance: float
    cpi: Optional[float] = None
    spi: Optional[float] = None
    eac: Optional[float] = None
    child_count: int


class EVMRollupListResponse(BaseModel):
    """Schema for multi-level EVM rollup across the WBS hierarchy.

    Returns rollup data at each level of the WBS hierarchy, from
    Programme down to individual tasks.

    Attributes
    ----------
    root_node_id : str
        UUID of the root node.
    levels : list[EVMRollupResponse]
        Rollup data at each WBS level.
    """
    root_node_id: str
    levels: List[EVMRollupResponse]


# ==================== Procurement Tracking Schemas ====================

class ProcurementItemCreate(BaseModel):
    """Schema for registering a new procurement line item.

    Used when a component is first identified as a procurement requirement.
    The item starts in the REQUISITION lifecycle stage by default.

    Attributes
    ----------
    part_number : str
        Manufacturer or internal part number.
    description : str or None
        Human-readable description of the component.
    supplier_cage_code : str
        NATO CAGE code of the supplier.
    portfolio_node_id : str or None
        UUID of the work package ordering this item.
    purchase_order_reference : str or None
        External purchase order number.
    contractual_delivery_date : date or None
        Contractually agreed delivery date.
    forecast_delivery_date : date or None
        Current best-estimate delivery date.
    is_long_lead_item : bool
        Whether this item has a long lead time (6+ months).
    """
    part_number: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    supplier_cage_code: str = Field(..., min_length=1, max_length=20)
    portfolio_node_id: Optional[str] = None
    purchase_order_reference: Optional[str] = Field(None, max_length=100)
    contractual_delivery_date: Optional[date] = None
    forecast_delivery_date: Optional[date] = None
    is_long_lead_item: bool = True


class ProcurementItemUpdate(BaseModel):
    """Schema for updating an existing procurement item.

    All fields are optional.  Typically used to advance the lifecycle
    stage and update forecast delivery dates as the procurement progresses.

    Attributes
    ----------
    lifecycle_stage : ProcurementLifecycleStage or None
        New lifecycle stage.
    purchase_order_reference : str or None
        Updated purchase order reference.
    contractual_delivery_date : date or None
        Updated contractual delivery date.
    forecast_delivery_date : date or None
        Updated forecast delivery date.
    actual_arrival_date : date or None
        Date the item arrived at the facility.
    description : str or None
        Updated description.
    is_long_lead_item : bool or None
        Updated long-lead flag.
    """
    lifecycle_stage: Optional[ProcurementLifecycleStage] = None
    purchase_order_reference: Optional[str] = Field(None, max_length=100)
    contractual_delivery_date: Optional[date] = None
    forecast_delivery_date: Optional[date] = None
    actual_arrival_date: Optional[date] = None
    description: Optional[str] = Field(None, max_length=500)
    is_long_lead_item: Optional[bool] = None


class ProcurementItemResponse(BaseModel):
    """Schema for a procurement item returned in API responses.

    Attributes
    ----------
    id : str
        UUID of the procurement item.
    part_number : str
        Part number.
    description : str or None
        Component description.
    supplier_cage_code : str
        NATO CAGE code.
    lifecycle_stage : ProcurementLifecycleStage
        Current lifecycle stage.
    portfolio_node_id : str or None
        Parent work package UUID.
    purchase_order_reference : str or None
        Purchase order number.
    contractual_delivery_date : date or None
        Contractual delivery date.
    forecast_delivery_date : date or None
        Forecast delivery date.
    actual_arrival_date : date or None
        Actual arrival date.
    is_long_lead_item : bool
        Long-lead item flag.
    """
    id: str
    part_number: str
    description: Optional[str] = None
    supplier_cage_code: str
    lifecycle_stage: ProcurementLifecycleStage
    portfolio_node_id: Optional[str] = None
    purchase_order_reference: Optional[str] = None
    contractual_delivery_date: Optional[date] = None
    forecast_delivery_date: Optional[date] = None
    actual_arrival_date: Optional[date] = None
    is_long_lead_item: bool

    model_config = ConfigDict(from_attributes=True)


class TaskProcurementConstraintCreate(BaseModel):
    """Schema for binding a procurement item to a WBS task.

    Creates a hard early-start constraint: the task cannot start before
    the procurement item's forecast delivery date.

    Attributes
    ----------
    procurement_item_id : str
        UUID of the procurement item creating the constraint.
    required_on_site_date : date
        Latest date the component must arrive to avoid delay.
    """
    procurement_item_id: str = Field(..., min_length=1)
    required_on_site_date: date


class TaskProcurementConstraintResponse(BaseModel):
    """Schema for a task procurement constraint returned in API responses.

    Attributes
    ----------
    id : str
        UUID of the constraint.
    portfolio_node_id : str
        UUID of the constrained task.
    procurement_item_id : str
        UUID of the procurement item.
    required_on_site_date : date
        Required on-site date.
    procurement_item : ProcurementItemResponse or None
        Nested procurement item details.
    """
    id: str
    portfolio_node_id: str
    procurement_item_id: str
    required_on_site_date: date
    procurement_item: Optional[ProcurementItemResponse] = None

    model_config = ConfigDict(from_attributes=True)


class ProcurementListResponse(BaseModel):
    """Schema for listing procurement items.

    Attributes
    ----------
    items : list[ProcurementItemResponse]
        List of procurement items.
    total_count : int
        Total number of items.
    """
    items: List[ProcurementItemResponse]
    total_count: int


class ProcurementConstraintImpact(BaseModel):
    """Schema for reporting procurement constraint impact on a task schedule.

    Returned when a procurement item's forecast delivery date affects
    the CPM early-start calculation.

    Attributes
    ----------
    task_id : str
        UUID of the constrained task.
    task_code : str
        Work package code.
    task_name : str
        Task name.
    procurement_item_id : str
        UUID of the constraining procurement item.
    part_number : str
        Part number of the constraining item.
    forecast_delivery_date : date or None
        Forecast delivery date of the item.
    required_on_site_date : date
        Required on-site date for this constraint.
    is_delaying : bool
        Whether the forecast date exceeds the required date.
    delay_days : int
        Number of days the task is delayed by this constraint (0 if not delaying).
    """
    task_id: str
    task_code: str
    task_name: str
    procurement_item_id: str
    part_number: str
    forecast_delivery_date: Optional[date] = None
    required_on_site_date: date
    is_delaying: bool
    delay_days: int


# ==================== Management Reserve Schemas ====================

class ReservePoolCreate(BaseModel):
    """Schema for creating a new Management Reserve pool.

    Used when a project or programme is initialised with a contingency
    reserve outside the Performance Measurement Baseline (PMB).

    Attributes
    ----------
    portfolio_node_id : str
        UUID of the root Project/Programme node owning this reserve.
    total_initial_budget : float
        Initial budget allocated to the reserve pool.
    currency_code : str
        3-letter ISO currency code (default 'GBP').
    """
    portfolio_node_id: str = Field(..., min_length=1)
    total_initial_budget: float = Field(..., gt=0)
    currency_code: str = Field("GBP", min_length=3, max_length=3)


class ReservePoolResponse(BaseModel):
    """Schema for a Management Reserve pool returned in API responses.

    Attributes
    ----------
    id : str
        UUID of the reserve pool.
    portfolio_node_id : str
        UUID of the owning project/programme node.
    total_initial_budget : float
        Total initial budget allocated.
    current_balance : float
        Current available balance after all transactions.
    currency_code : str
        3-letter ISO currency code.
    created_at : datetime
        Timestamp when the pool was created.
    updated_at : datetime
        Timestamp when the pool was last modified.
    """
    id: str
    portfolio_node_id: str
    total_initial_budget: float
    current_balance: float
    currency_code: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReserveDrawdownRequest(BaseModel):
    """Schema for executing a Management Reserve drawdown.

    A drawdown transfers funds from the reserve pool to a specific
    work package, increasing its Budget at Completion (BAC).

    The drawdown requires:

    1. **Sufficient balance** — The pool must have enough current_balance.
    2. **Authorised BCR** — An approved BaselineChangeRequest (Tier 2 or
       Tier 3) must authorise the budget transfer.
    3. **Justification** — A human-readable explanation of the drawdown.

    Attributes
    ----------
    pool_id : str
        UUID of the reserve pool to draw from.
    target_node_id : str
        UUID of the work package receiving the budget.
    amount : float
        Monetary amount to draw down from the reserve.
    bcr_id : str or None
        UUID of the approved BaselineChangeRequest authorising this
        drawdown (required for DRAWDOWN_TO_WBS).
    risk_item_id : str or None
        Optional reference to a risk item triggering this drawdown.
    justification : str
        Explanation of why this drawdown is being executed.
    """
    pool_id: str = Field(..., min_length=1)
    target_node_id: str = Field(..., min_length=1)
    amount: float = Field(..., gt=0)
    bcr_id: Optional[str] = None
    risk_item_id: Optional[str] = None
    justification: str = Field(..., min_length=1, max_length=2000)


class ReserveDrawdownResponse(BaseModel):
    """Schema for the result of a Management Reserve drawdown.

    Attributes
    ----------
    transaction_id : str
        UUID of the created transaction ledger entry.
    pool_id : str
        UUID of the reserve pool.
    remaining_balance : float
        Updated pool balance after the drawdown.
    target_node_id : str
        UUID of the work package that received the budget.
    target_node_new_bac : float
        Updated BAC of the target node after the drawdown.
    amount : float
        Amount drawn down.
    transaction_timestamp : datetime
        Timestamp when the transaction was executed.
    """
    transaction_id: str
    pool_id: str
    remaining_balance: float
    target_node_id: str
    target_node_new_bac: float
    amount: float
    transaction_timestamp: datetime


class ReserveTransactionResponse(BaseModel):
    """Schema for a single Management Reserve transaction.

    Attributes
    ----------
    id : str
        UUID of the transaction.
    pool_id : str
        UUID of the reserve pool.
    transaction_type : TransactionType
        Type of transaction (allocation, drawdown, return, de-obligation).
    amount : float
        Monetary amount.
    target_portfolio_node_id : str
        UUID of the affected work package.
    bcr_id : str or None
        UUID of the authorising BCR (if any).
    risk_item_id : str or None
        UUID of the triggering risk item (if any).
    justification : str
        Explanation of the transaction.
    authorized_by_user_id : int
        ID of the user who authorised the transaction.
    transaction_timestamp : datetime
        Timestamp when the transaction was executed.
    """
    id: str
    pool_id: str
    transaction_type: TransactionType
    amount: float
    target_portfolio_node_id: str
    bcr_id: Optional[str] = None
    risk_item_id: Optional[str] = None
    justification: str
    authorized_by_user_id: int
    transaction_timestamp: datetime

    model_config = ConfigDict(from_attributes=True)


class ReserveStatusResponse(BaseModel):
    """Schema for the reserve status summary of a project.

    Returns the initial pool amount, current balance, total drawn down,
    and a list of active transactions.

    Attributes
    ----------
    pool : ReservePoolResponse or None
        The reserve pool for this project (None if no pool exists).
    total_drawn_down : float
        Total amount drawn down from the reserve.
    total_returned : float
        Total amount returned to the reserve.
    transactions : list[ReserveTransactionResponse]
        List of all transactions for this pool, ordered by timestamp.
    """
    pool: Optional[ReservePoolResponse] = None
    total_drawn_down: float = 0.0
    total_returned: float = 0.0
    transactions: List[ReserveTransactionResponse] = []


# ============================================================================
# Spatial Location Tracking & Asset Custody Schemas
# ============================================================================


class AssetRelocateRequest(BaseModel):
    """Request to relocate a physical asset to a new location.

    In defence programme management, moving classified equipment requires
    a formal record of the move, including who moved it, why, and where
    to.  This schema captures the minimum information needed to execute
    and audit a physical asset relocation.

    Clearance Interlocks
    ~~~~~~~~~~~~~~~~~~~~

    Before the move is executed, the system verifies:

    1. The target location exists and is active.
    2. The moving user has clearance >= the target location's classification.
    3. The asset's classification does not exceed the target location's rating.

    Attributes
    ----------
    resource_id : str
        UUID of the ResourceNode (asset/equipment) being moved.
    target_location_id : str
        UUID of the LocationNode the asset is being moved to.
    reason : str
        Human-readable explanation of why the asset is being moved.
        Required for audit compliance.
    task_id : str or None
        Optional UUID of the PortfolioNode (work package) associated
        with this move.  Links the physical move to a scheduled task.
    authorized_by_user_id : int or None
        Optional user ID of a supervisor who authorised the move.
        Required for high-value or classified assets.
    notes : str or None
        Additional free-text notes about the move.
    """

    resource_id: str = Field(..., min_length=1)
    target_location_id: str = Field(..., min_length=1)
    reason: str = Field(..., min_length=1, max_length=500)
    task_id: Optional[str] = None
    authorized_by_user_id: Optional[int] = None
    notes: Optional[str] = None


class AssetRelocateResponse(BaseModel):
    """Response confirming a successful asset relocation.

    Attributes
    ----------
    ledger_id : str
        UUID of the newly created AssetLocationLedger entry.
    resource_id : str
        UUID of the relocated asset.
    from_location_id : str or None
        Previous location (None if this was the first recorded location).
    to_location_id : str
        New location UUID.
    movement_timestamp : datetime
        Timestamp when the move was recorded.
    """

    ledger_id: str
    resource_id: str
    from_location_id: Optional[str] = None
    to_location_id: str
    movement_timestamp: datetime

    model_config = ConfigDict(from_attributes=True)


class AssetCustodyEntry(BaseModel):
    """A single entry in an asset's custody/movement history.

    Attributes
    ----------
    id : str
        UUID of the ledger entry.
    from_location_id : str or None
        Location the asset moved from (None for initial commissioning).
    to_location_id : str
        Location the asset moved to.
    from_location_name : str or None
        Human-readable name of the source location.
    to_location_name : str
        Human-readable name of the destination location.
    moved_by_user_id : int
        ID of the user who moved the asset.
    authorized_by_user_id : int or None
        ID of the authorising supervisor (if any).
    associated_task_id : str or None
        UUID of the associated work package (if any).
    movement_timestamp : datetime
        When the move occurred.
    movement_reason : str
        Why the asset was moved.
    notes : str or None
        Additional notes.
    """

    id: str
    from_location_id: Optional[str] = None
    to_location_id: str
    from_location_name: Optional[str] = None
    to_location_name: str
    moved_by_user_id: int
    authorized_by_user_id: Optional[int] = None
    associated_task_id: Optional[str] = None
    movement_timestamp: datetime
    movement_reason: str
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AssetCustodyHistoryResponse(BaseModel):
    """Chronological custody history for a single asset.

    Returns all location changes for the asset, ordered from oldest
    to newest, forming a complete chain of custody trail.

    Attributes
    ----------
    resource_id : str
        UUID of the asset.
    resource_name : str
        Name of the asset.
    current_location_id : str or None
        UUID of the asset's current location.
    current_location_name : str or None
        Name of the asset's current location.
    entries : list[AssetCustodyEntry]
        Chronological list of all location changes.
    total_moves : int
        Total number of recorded moves.
    """

    resource_id: str
    resource_name: str
    current_location_id: Optional[str] = None
    current_location_name: Optional[str] = None
    entries: List[AssetCustodyEntry] = []
    total_moves: int = 0


class LocationInventoryItem(BaseModel):
    """A single asset/equipment item in a location's inventory.

    Attributes
    ----------
    resource_id : str
        UUID of the resource node.
    name : str
        Name of the asset or equipment.
    code : str
        Asset code or identifier.
    resource_type : str
        Type of resource (ASSET, EQUIPMENT, etc.).
    security_classification : str or None
        Security classification of the asset.
    standard_hourly_rate : float or None
        Hourly rate (if applicable).
    is_generic_placeholder : bool
        Whether this is a generic placeholder resource.
    """

    resource_id: str
    name: str
    code: str
    resource_type: str
    security_classification: Optional[str] = None
    standard_hourly_rate: Optional[float] = None
    is_generic_placeholder: bool = False

    model_config = ConfigDict(from_attributes=True)


class LocationInventoryResponse(BaseModel):
    """Complete inventory of assets within a location and its sub-locations.

    Uses the ltree subpath operator to recursively find all assets
    located within a facility, zone, room, container, or sub-container.

    Attributes
    ----------
    location_id : str
        UUID of the queried location.
    location_name : str
        Name of the queried location.
    tier : str
        Location tier (SITE, FACILITY, ZONE, ROOM, etc.).
    assets : list[LocationInventoryItem]
        List of all assets currently in this location or its sub-locations.
    total_assets : int
        Total number of assets in the inventory.
    """

    location_id: str
    location_name: str
    tier: str
    assets: List[LocationInventoryItem] = []
    total_assets: int = 0


# ============================================================================
# Project & Resource Calendar Schemas
# ============================================================================


class WorkingCalendarCreate(BaseModel):
    """Request to create a new working calendar.

    A working calendar defines the standard working pattern for a project
    or resource: which days are working days, how many hours per day,
    and which jurisdiction's statutory holidays apply.

    Attributes
    ----------
    code : str
        Unique code for the calendar (e.g., 'CAL_UK_STANDARD').
    name : str
        Human-readable name (e.g., 'UK Standard Working Calendar').
    jurisdiction : str
        Jurisdiction for statutory holidays (UK, US, CA, CUSTOM).
    standard_hours_per_day : float
        Number of working hours per standard day (default 7.50).
    working_days_mask : int
        Bitmask of working days (Mon=1, Tue=2, Wed=4, Thu=8, Fri=16,
        Sat=32, Sun=64).  Standard Mon–Fri = 31.
    is_default : bool
        Whether this is the default calendar (default False).
    """

    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    jurisdiction: str = Field(..., min_length=1)
    standard_hours_per_day: float = 7.50
    working_days_mask: int = 31
    is_default: bool = False


class WorkingCalendarUpdate(BaseModel):
    """Partial update for an existing working calendar.

    Only the fields provided will be updated; omitted fields remain
    unchanged.  This allows targeted updates (e.g., changing the
    default flag without modifying the working pattern).

    Attributes
    ----------
    name : str or None
        Updated human-readable name.
    jurisdiction : str or None
        Updated jurisdiction.
    standard_hours_per_day : float or None
        Updated hours per day.
    working_days_mask : int or None
        Updated working days bitmask.
    is_default : bool or None
        Updated default flag.
    """

    name: Optional[str] = None
    jurisdiction: Optional[str] = None
    standard_hours_per_day: Optional[float] = None
    working_days_mask: Optional[int] = None
    is_default: Optional[bool] = None


class WorkingCalendarResponse(BaseModel):
    """Response schema for a working calendar.

    Attributes
    ----------
    id : str
        UUID of the calendar.
    code : str
        Unique code for the calendar.
    name : str
        Human-readable name.
    jurisdiction : str
        Jurisdiction for statutory holidays.
    standard_hours_per_day : float
        Hours per standard working day.
    working_days_mask : int
        Bitmask of working days.
    is_default : bool
        Whether this is the default calendar.
    exception_count : int
        Number of calendar exceptions (holidays, maintenance, etc.)
        currently defined for this calendar.
    """

    id: str
    code: str
    name: str
    jurisdiction: str
    standard_hours_per_day: float
    working_days_mask: int
    is_default: bool
    exception_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class CalendarExceptionCreate(BaseModel):
    """Request to create a new calendar exception.

    A calendar exception overrides the standard working pattern for
    a specific date.  For example, a statutory holiday sets working
    hours to 0.00, while an overtime surge period increases hours.

    Attributes
    ----------
    calendar_id : str
        UUID of the parent WorkingCalendar.
    exception_date : str
        ISO date string (YYYY-MM-DD) for the exception.
    exception_type : str
        Type of exception (STATUTORY_HOLIDAY, PLANNED_MAINTENANCE,
        OVERTIME_SURGE).
    working_hours_override : float
        Number of working hours on this date.  0.00 = non-working day.
    description : str
        Human-readable description of the exception.
    """

    calendar_id: str = Field(..., min_length=1)
    exception_date: str = Field(..., min_length=1)
    exception_type: str = Field(..., min_length=1)
    working_hours_override: float = 0.00
    description: str = Field(..., min_length=1, max_length=500)


class CalendarExceptionUpdate(BaseModel):
    """Partial update for an existing calendar exception.

    Only the fields provided will be updated.

    Attributes
    ----------
    exception_date : str or None
        Updated date.
    exception_type : str or None
        Updated type.
    working_hours_override : float or None
        Updated hours override.
    description : str or None
        Updated description.
    """

    exception_date: Optional[str] = None
    exception_type: Optional[str] = None
    working_hours_override: Optional[float] = None
    description: Optional[str] = None


class CalendarExceptionResponse(BaseModel):
    """Response schema for a calendar exception.

    Attributes
    ----------
    id : str
        UUID of the exception.
    calendar_id : str
        UUID of the parent calendar.
    exception_date : str
        ISO date string for the exception.
    exception_type : str
        Type of exception.
    working_hours_override : float
        Working hours on this date.
    description : str
        Human-readable description.
    """

    id: str
    calendar_id: str
    exception_date: str
    exception_type: str
    working_hours_override: float
    description: str

    model_config = ConfigDict(from_attributes=True)


class CalendarExceptionListResponse(BaseModel):
    """List of calendar exceptions for a calendar.

    Attributes
    ----------
    calendar_id : str
        UUID of the parent calendar.
    exceptions : list[CalendarExceptionResponse]
        List of exceptions sorted by date.
    total_exceptions : int
        Total number of exceptions.
    """

    calendar_id: str
    exceptions: List[CalendarExceptionResponse] = []
    total_exceptions: int = 0


class WorkingDaysResponse(BaseModel):
    """Calculated working hours across a date range for a calendar.

    This endpoint is useful for capacity planning: given a start and
    end date, it returns the total number of working hours available
    under the specified calendar, accounting for statutory holidays,
    planned maintenance, and overtime surge periods.

    Attributes
    ----------
    calendar_id : str
        UUID of the calendar.
    start_date : str
        ISO date string for the range start.
    end_date : str
        ISO date string for the range end.
    total_working_days : int
        Number of working days in the range.
    total_working_hours : float
        Total working hours in the range (sum of hours per working day,
        accounting for exceptions).
    standard_hours_per_day : float
        Calendar's standard hours per day.
    exceptions_in_range : list[CalendarExceptionResponse]
        Calendar exceptions that fall within the queried range.
    """

    calendar_id: str
    start_date: str
    end_date: str
    total_working_days: int = 0
    total_working_hours: float = 0.0
    standard_hours_per_day: float = 7.50
    exceptions_in_range: List[CalendarExceptionResponse] = []


class WorkingCalendarListResponse(BaseModel):
    """List of all working calendars.

    Attributes
    ----------
    calendars : list[WorkingCalendarResponse]
        List of all calendars.
    total_calendars : int
        Total number of calendars.
    """

    calendars: List[WorkingCalendarResponse] = []
    total_calendars: int = 0


# ============================================================================
# Foreign Currency Exchange Rate Schemas
# ============================================================================


class CurrencyExchangeRateCreate(BaseModel):
    """Request to create a new currency exchange rate record.

    An exchange rate record defines the conversion factor between two
    currencies for a specific time period.  For contractual fixed rates,
    the effective_end_date is typically NULL, meaning the rate remains
    valid indefinitely.

    Attributes
    ----------
    base_currency : str
        The base currency code (3-letter ISO, e.g., 'GBP').
    target_currency : str
        The target currency code (3-letter ISO, e.g., 'USD').
    rate_type : str
        The type of rate (CONTRACTUAL_FIXED, FLOATING_SPOT, FORWARD_HEDGE).
    exchange_rate : float
        The exchange rate value (e.g., 1.270000 for GBP/USD).
    effective_start_date : str
        ISO date string (YYYY-MM-DD) when the rate becomes valid.
    effective_end_date : str or None
        ISO date string when the rate expires.  NULL for permanent rates.
    """

    base_currency: str = Field(..., min_length=3, max_length=3)
    target_currency: str = Field(..., min_length=3, max_length=3)
    rate_type: str = Field(..., min_length=1)
    exchange_rate: float = Field(..., gt=0)
    effective_start_date: str = Field(..., min_length=1)
    effective_end_date: Optional[str] = None


class CurrencyExchangeRateUpdate(BaseModel):
    """Partial update for an existing currency exchange rate record.

    Only the fields provided will be updated; omitted fields remain
    unchanged.  This allows targeted updates (e.g., extending the
    effective end date without changing the rate).

    Attributes
    ----------
    rate_type : str or None
        Updated rate type.
    exchange_rate : float or None
        Updated exchange rate value.
    effective_start_date : str or None
        Updated start date.
    effective_end_date : str or None
        Updated end date.
    """

    rate_type: Optional[str] = None
    exchange_rate: Optional[float] = None
    effective_start_date: Optional[str] = None
    effective_end_date: Optional[str] = None


class CurrencyExchangeRateResponse(BaseModel):
    """Response schema for a currency exchange rate record.

    Attributes
    ----------
    id : str
        UUID of the exchange rate record.
    base_currency : str
        Base currency code.
    target_currency : str
        Target currency code.
    rate_type : str
        Type of rate.
    exchange_rate : float
        Exchange rate value.
    effective_start_date : str
        ISO date string when the rate becomes valid.
    effective_end_date : str or None
        ISO date string when the rate expires.
    """

    id: str
    base_currency: str
    target_currency: str
    rate_type: str
    exchange_rate: float
    effective_start_date: str
    effective_end_date: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class CurrencyExchangeRateListResponse(BaseModel):
    """List of currency exchange rate records.

    Attributes
    ----------
    rates : list[CurrencyExchangeRateResponse]
        List of exchange rate records.
    total_rates : int
        Total number of records.
    """

    rates: List[CurrencyExchangeRateResponse] = []
    total_rates: int = 0


class CurrencyConvertRequest(BaseModel):
    """Request to convert an amount from one currency to another.

    This endpoint resolves the applicable exchange rate effective on
    the given valuation date and computes the converted amount.

    Attributes
    ----------
    amount : float
        The amount to convert.
    from_currency : str
        Source currency code (3-letter ISO).
    to_currency : str
        Target currency code (3-letter ISO).
    valuation_date : str
        ISO date string (YYYY-MM-DD) for which to resolve the rate.
    rate_type : str or None
        Optional filter for rate type.  If not specified, the system
        prefers CONTRACTUAL_FIXED, then FORWARD_HEDGE, then FLOATING_SPOT.
    """

    amount: float = Field(..., gt=0)
    from_currency: str = Field(..., min_length=3, max_length=3)
    to_currency: str = Field(..., min_length=3, max_length=3)
    valuation_date: str = Field(..., min_length=1)
    rate_type: Optional[str] = None


class CurrencyConvertResponse(BaseModel):
    """Result of a currency conversion calculation.

    Attributes
    ----------
    original_amount : float
        The original amount before conversion.
    from_currency : str
        Source currency code.
    to_currency : str
        Target currency code.
    converted_amount : float
        The amount after conversion.
    exchange_rate_used : float
        The exchange rate applied for this conversion.
    rate_type : str
        The type of rate used (CONTRACTUAL_FIXED, FLOATING_SPOT, FORWARD_HEDGE).
    rate_id : str or None
        UUID of the CurrencyExchangeRate record used, if applicable.
    valuation_date : str
        The date for which the rate was resolved.
    """

    original_amount: float
    from_currency: str
    to_currency: str
    converted_amount: float
    exchange_rate_used: float
    rate_type: str
    rate_id: Optional[str] = None
    valuation_date: str


class CurrencyVarianceResponse(BaseModel):
    """Currency variance analysis for a task.

    This separates standard Cost Variance (CV) from currency fluctuation
    impact (FX Variance), allowing programme managers to distinguish
    between genuine cost overruns and currency-driven variances.

    Attributes
    ----------
    task_id : str
        UUID of the task.
    task_name : str
        Name of the task.
    task_currency : str
        The currency in which the task is priced.
    base_currency : str
        The project's base currency.
    baseline_rate : float or None
        The exchange rate at baseline (contract signing).
    actual_rate : float or None
        The current exchange rate.
    direct_cost_local : float
        Direct cost in the task's local currency.
    direct_cost_base : float
        Direct cost converted to the project's base currency.
    cost_variance : float
        Standard Cost Variance (EV - AC) in base currency.
    fx_variance : float
        Currency fluctuation impact:
        (Rate_actual - Rate_baseline) × Direct.
    total_variance : float
        Combined variance: CV + FX Variance.
    """

    task_id: str
    task_name: str
    task_currency: str
    base_currency: str
    baseline_rate: Optional[float] = None
    actual_rate: Optional[float] = None
    direct_cost_local: float = 0.0
    direct_cost_base: float = 0.0
    cost_variance: float = 0.0
    fx_variance: float = 0.0
    total_variance: float = 0.0


# ==================== Batch Rollback / Undo Schemas ====================

class RevertOperation(BaseModel):
    """A single field-level revert operation within a batch rollback.

    Each operation targets one field on one node and restores it to a
    previous value.  The ``expected_version`` field ensures optimistic
    concurrency: the revert only succeeds if the node's current version
    matches the expected value, preventing mid-air collisions.

    Attributes
    ----------
    node_id : str
        UUID of the node whose field is being reverted.
    field : str
        The name of the field to revert (e.g., 'planned_start_date',
        'percent_complete').
    revert_to : Any
        The value to restore the field to.  This is the value the field
        held before the original mutation.
    expected_version : int
        The version_id the node is expected to have.  If the database
        version differs, the revert is rejected with HTTP 409.
    """

    node_id: str = Field(..., min_length=1)
    field: str = Field(..., min_length=1)
    revert_to: Any
    expected_version: int


class BatchRollbackRequest(BaseModel):
    """Request to atomically revert a set of mutations.

    This payload is produced by the client-side Undo/Redo stack.  It
    references the original mutation's ``transaction_id`` so that the
    forensic audit log can link the revert to the original action.

    Attributes
    ----------
    transaction_id : str
        UUID of the original mutation transaction.  This links the
        rollback to the original ForensicAuditLog entry.
    revert_operations : list[RevertOperation]
        List of field-level revert operations to apply atomically.
    project_id : str or None
        Optional UUID of the project root node.  When provided, a CPM
        recalculation is triggered after the rollback completes.
    """

    transaction_id: str = Field(..., min_length=1)
    revert_operations: List[RevertOperation] = Field(..., min_length=1)
    project_id: Optional[str] = None


class RevertOperationResult(BaseModel):
    """Result of a single revert operation.

    Attributes
    ----------
    node_id : str
        UUID of the reverted node.
    field : str
        The field that was reverted.
    old_value : Any
        The value the field held before the revert.
    new_value : Any
        The value the field was restored to.
    version_id : int
        The new version_id of the node after the revert.
    success : bool
        Whether the revert succeeded.
    error : str or None
        Error message if the revert failed.
    """

    node_id: str
    field: str
    old_value: Any
    new_value: Any
    version_id: int
    success: bool
    error: Optional[str] = None


class BatchRollbackResponse(BaseModel):
    """Response after a batch rollback operation.

    Attributes
    ----------
    transaction_id : str
        The original transaction ID that was reverted.
    rollback_audit_id : str
        UUID of the new ForensicAuditLog entry recording this rollback.
    operations_count : int
        Total number of revert operations requested.
    operations_succeeded : int
        Number of revert operations that succeeded.
    operations_failed : int
        Number of revert operations that failed.
    results : list[RevertOperationResult]
        Per-operation results with old/new values and version IDs.
    cpm_recalculated : bool
        Whether a CPM recalculation was triggered after the rollback.
    cpm_result : dict or None
        CPM recalculation results if triggered, otherwise None.
    """

    transaction_id: str
    rollback_audit_id: str
    operations_count: int
    operations_succeeded: int
    operations_failed: int
    results: List[RevertOperationResult]
    cpm_recalculated: bool = False
    cpm_result: Optional[Dict[str, Any]] = None


# ==================== Subcontractor Submission Schemas ====================


class SubcontractorSubmissionCreate(BaseModel):
    """Schema for creating a new subcontractor schedule submission.

    This is the payload sent when a subcontractor uploads a schedule file
    for integration into the prime contractor's master programme.

    Attributes
    ----------
    vendor_cage_code : str
        NATO/CAGE code of the submitting vendor (e.g., '4Y9K2').
    subcontract_reference : str
        Subcontract reference number (e.g., 'SC-RADAR-2026-09').
    target_wbs_root_id : str
        UUID of the integration boundary work package in the prime WBS.
    submitted_filename : str
        Original filename of the uploaded schedule file.
    format : str
        File format: 'PRIMAVERA_XER' or 'MS_PROJECT_XML'.
    """

    vendor_cage_code: str = Field(..., min_length=1, max_length=20)
    subcontract_reference: str = Field(..., min_length=1, max_length=100)
    target_wbs_root_id: str = Field(..., min_length=1)
    submitted_filename: str = Field(..., min_length=1, max_length=500)
    format: str = Field(..., min_length=1)


class BoundaryBreach(BaseModel):
    """A single boundary breach found during validation.

    When a subcontractor's submitted schedule violates a contractual
    boundary gate, a ``BoundaryBreach`` record is created describing
    the violation.

    Attributes
    ----------
    breach_type : str
        The type of breach (e.g., 'CRITICAL_MILESTONE_BREACH',
        'LOGIC_TAMPERING', 'NEGATIVE_FLOAT_INFLATION').
    severity : str
        Severity level: 'CRITICAL', 'MAJOR', or 'ADVISORY'.
    task_id : str or None
        UUID of the affected task, if applicable.
    task_name : str or None
        Name of the affected task, if applicable.
    description : str
        Human-readable description of the breach.
    """

    breach_type: str
    severity: str
    task_id: Optional[str] = None
    task_name: Optional[str] = None
    description: str


class ValidationReport(BaseModel):
    """Automated validation report for a subcontractor submission.

    This report is generated after parsing and validating the submitted
    schedule file.  It contains the compliance score, list of boundary
    breaches, and summary statistics.

    Attributes
    ----------
    compliance_score : float
        Overall compliance score (0–100%).  A score of 100% means no
        breaches were found.  Critical breaches typically reduce the
        score to 0%.
    total_tasks : int
        Number of tasks extracted from the submitted file.
    total_dependencies : int
        Number of predecessor/successor links extracted.
    boundary_breaches : list[BoundaryBreach]
        List of contractual boundary breaches found during validation.
    has_critical_breaches : bool
        True if any CRITICAL-severity breaches were found.
    validation_status : str
        Overall validation status: 'PASSED', 'FAILED', or 'WARNINGS'.
    """

    compliance_score: float = 100.0
    total_tasks: int = 0
    total_dependencies: int = 0
    boundary_breaches: List[BoundaryBreach] = []
    has_critical_breaches: bool = False
    validation_status: str = "PASSED"


class StagingDiffTask(BaseModel):
    """A single task entry in the staging diff.

    When a submission is staged, the system compares the proposed
    schedule against the live WBS and identifies tasks that would
    be unchanged, shifted, or newly critical.

    Attributes
    ----------
    task_id : str
        UUID of the task.
    task_name : str
        Name of the task.
    category : str
        Category: 'UNCHANGED', 'SHIFTED', or 'NEWLY_CRITICAL'.
    original_start : str or None
        Original planned start date (ISO format).
    proposed_start : str or None
        Proposed start date after merge (ISO format).
    original_finish : str or None
        Original planned finish date (ISO format).
    proposed_finish : str or None
        Proposed finish date after merge (ISO format).
    float_variance_days : float
        Change in total float (days).  Positive means more float;
        negative means less float (more constrained).
    """

    task_id: str
    task_name: str
    category: str
    original_start: Optional[str] = None
    proposed_start: Optional[str] = None
    original_finish: Optional[str] = None
    proposed_finish: Optional[str] = None
    float_variance_days: float = 0.0


class StagingDiff(BaseModel):
    """Staging diff showing the impact of merging a submission.

    This is generated by ephemerally injecting the subcontractor's
    proposed DAG into a cloned sandbox branch and running CPM to
    calculate the resulting float impact on prime contractual
    delivery dates.

    Attributes
    ----------
    unchanged_tasks : list[StagingDiffTask]
        Tasks that would not change if the submission is merged.
    shifted_tasks : list[StagingDiffTask]
        Tasks whose dates would shift as a result of the merge.
    newly_critical_paths : list[StagingDiffTask]
        Tasks that would become newly critical (TF ≤ 0) after merge.
    total_float_variance_days : float
        Aggregate float variance across all affected tasks.
    """

    unchanged_tasks: List[StagingDiffTask] = []
    shifted_tasks: List[StagingDiffTask] = []
    newly_critical_paths: List[StagingDiffTask] = []
    total_float_variance_days: float = 0.0


class SubcontractorSubmissionResponse(BaseModel):
    """Response schema for a subcontractor submission.

    Attributes
    ----------
    id : str
        UUID of the submission.
    vendor_cage_code : str
        NATO/CAGE code of the submitting vendor.
    subcontract_reference : str
        Subcontract reference number.
    target_wbs_root_id : str
        UUID of the integration boundary work package.
    submitted_filename : str
        Original filename of the uploaded schedule file.
    format : str
        File format (PRIMAVERA_XER or MS_PROJECT_XML).
    status : str
        Current lifecycle status.
    submitted_at : str
        ISO timestamp when the submission was received.
    submission_report : dict or None
        Full validation and staging diff report (if available).
    validation_report : ValidationReport or None
        Summary validation report (if validation has run).
    staging_diff : StagingDiff or None
        Staging diff showing merge impact (if staging has run).
    """

    id: str
    vendor_cage_code: str
    subcontract_reference: str
    target_wbs_root_id: str
    submitted_filename: str
    format: str
    status: str
    submitted_at: str
    submission_report: Optional[Dict[str, Any]] = None
    validation_report: Optional[ValidationReport] = None
    staging_diff: Optional[StagingDiff] = None

    model_config = ConfigDict(from_attributes=True)


class SubmissionListResponse(BaseModel):
    """List of subcontractor submissions.

    Attributes
    ----------
    submissions : list[SubcontractorSubmissionResponse]
        List of submission records.
    total_count : int
        Total number of submissions.
    """

    submissions: List[SubcontractorSubmissionResponse] = []
    total_count: int = 0


class SubmissionMergeResponse(BaseModel):
    """Response after approving and merging a submission.

    Attributes
    ----------
    submission_id : str
        UUID of the merged submission.
    merged_tasks_count : int
        Number of tasks merged into the live WBS.
    merged_dependencies_count : int
        Number of dependency links created.
    audit_log_id : str
        UUID of the ForensicAuditLog entry recording the merge.
    cpm_recalculated : bool
        Whether CPM was recalculated after the merge.
    message : str
        Human-readable summary of the merge result.
    """

    submission_id: str
    merged_tasks_count: int
    merged_dependencies_count: int
    audit_log_id: str
    cpm_recalculated: bool
    message: str


# ==================== Programme Archive Seal Schemas ====================


class ProgrammeSealRequest(BaseModel):
    """Request to seal a programme for WORM cold-storage archival.

    Attributes
    ----------
    storage_vault_uri : str or None
        Optional path or URI to the cold-storage volume.  If not
        provided, a default path is auto-generated from the programme
        code and current date.
    """

    storage_vault_uri: Optional[str] = None


class ProgrammeSealResponse(BaseModel):
    """Response after sealing a programme for cold storage.

    Attributes
    ----------
    seal_id : str
        UUID of the newly created seal record.
    programme_id : str
        UUID of the sealed programme root node.
    programme_code : str
        Code of the sealed programme (e.g., 'WP-101').
    programme_name : str
        Name of the sealed programme.
    sealed_at : str
        ISO timestamp when the seal was created.
    sealed_by_user : str
        Email/UPN of the user who initiated the closeout.
    nodes_deactivated : int
        Number of nodes set to is_active=False.
    archive_manifest_hash : str
        SHA-256 hash of the complete exported programme dataset.
    final_sha256_audit_head : str
        SHA-256 hash of the last ForensicAuditLog entry at sealing.
    storage_vault_uri : str
        Path or URI to the offline cold-storage volume.
    audit_log_id : str
        UUID of the ForensicAuditLog entry recording the seal.
    """

    seal_id: str
    programme_id: str
    programme_code: str
    programme_name: str
    sealed_at: str
    sealed_by_user: str
    nodes_deactivated: int
    archive_manifest_hash: str
    final_sha256_audit_head: str
    storage_vault_uri: str
    audit_log_id: str


class ArchiveVerifyRequest(BaseModel):
    """Request to verify the integrity of an archive package.

    Attributes
    ----------
    archive_file_path : str
        Path to the archive ZIP file on the server's filesystem.
        In production, this would be replaced with a file upload
        or S3 object key.
    """

    archive_file_path: str = Field(..., min_length=1)


class ArchiveVerifyResponse(BaseModel):
    """Response from archive integrity verification.

    Attributes
    ----------
    archive_path : str
        Path to the archive file that was verified.
    verified_at : str
        ISO timestamp when verification was performed.
    intact : bool
        Overall integrity status — True if all checks passed.
    payload_hash_valid : bool
        Whether the payload entity hashes match the manifest.
    signature_valid : bool
        Whether the cryptographic signature is valid.
    audit_chain_valid : bool or None
        Whether the audit log chain links to the seal's head.
        None if no database session was available for verification.
    entity_counts : dict
        Count of each entity type in the archive.
    errors : list[str]
        List of any errors or warnings found during verification.
    """

    archive_path: str
    verified_at: str
    intact: bool
    payload_hash_valid: bool
    signature_valid: bool
    audit_chain_valid: Optional[bool] = None
    entity_counts: Dict[str, int] = {}
    errors: List[str] = []


class ProgrammeArchiveSealResponse(BaseModel):
    """Response schema for a ProgrammeArchiveSeal record.

    Attributes
    ----------
    id : str
        UUID of the seal record.
    portfolio_node_id : str
        UUID of the sealed programme root node.
    sealed_at : str
        ISO timestamp when the seal was created.
    sealed_by_user_id : str
        UUID of the user who initiated the closeout.
    final_sha256_audit_head : str
        SHA-256 hash of the last audit log entry at sealing.
    archive_manifest_hash : str
        SHA-256 hash of the complete exported programme dataset.
    storage_vault_uri : str
        Path or URI to the offline cold-storage volume.
    is_verified_intact : bool
        Whether the archive has been verified as intact.
    """

    id: str
    portfolio_node_id: str
    sealed_at: str
    sealed_by_user_id: str
    final_sha256_audit_head: str
    archive_manifest_hash: str
    storage_vault_uri: str
    is_verified_intact: bool

    model_config = ConfigDict(from_attributes=True)


# ==================== Facility Telemetry & Chamber Reservation Schemas ====================


class ChamberReservationCreate(BaseModel):
    """Request schema for creating a chamber reservation.

    Attributes
    ----------
    location_node_id : str
        UUID of the LocationNode (chamber, rig, etc.) to reserve.
    portfolio_node_id : str
        UUID of the PortfolioNode representing the testing activity.
    reserved_start : str
        ISO 8601 datetime for the start of the reservation (UTC).
    reserved_end : str
        ISO 8601 datetime for the end of the reservation (UTC).
    setup_teardown_hours : float
        Additional hours for setup and teardown (default 1.0).
    power_profile_kw : float or None
        Expected power draw in kilowatts during the test run.
    test_operator_user_id : str
        UUID of the User designated as the test operator.
    """

    location_node_id: str = Field(..., min_length=1)
    portfolio_node_id: str = Field(..., min_length=1)
    reserved_start: str = Field(..., min_length=1)
    reserved_end: str = Field(..., min_length=1)
    setup_teardown_hours: float = 1.0
    power_profile_kw: Optional[float] = None
    test_operator_user_id: str = Field(..., min_length=1)


class ChamberReservationResponse(BaseModel):
    """Response schema for a ChamberReservation record.

    Attributes
    ----------
    id : str
        UUID of the reservation.
    location_node_id : str
        UUID of the reserved location.
    portfolio_node_id : str
        UUID of the testing activity.
    reserved_start : str
        ISO 8601 start datetime (UTC).
    reserved_end : str
        ISO 8601 end datetime (UTC).
    setup_teardown_hours : float
        Setup and teardown buffer hours.
    power_profile_kw : float or None
        Expected power draw in kilowatts.
    test_operator_user_id : str
        UUID of the test operator.
    buffer_start : str
        ISO 8601 datetime including warmup buffer before the test.
    buffer_end : str
        ISO 8601 datetime including cooldown buffer after the test.
    location_code : str
        Code of the reserved location (e.g., 'LAB-EMC-01').
    location_name : str
        Name of the reserved location.
    """

    id: str
    location_node_id: str
    portfolio_node_id: str
    reserved_start: str
    reserved_end: str
    setup_teardown_hours: float
    power_profile_kw: Optional[float] = None
    test_operator_user_id: str
    buffer_start: str
    buffer_end: str
    location_code: str
    location_name: str

    model_config = ConfigDict(from_attributes=True)


class ReservationTimelineSlot(BaseModel):
    """A single time-phased reservation slot for Gantt/calendar display.

    Attributes
    ----------
    reservation_id : str
        UUID of the reservation.
    portfolio_node_id : str
        UUID of the testing activity.
    portfolio_node_code : str
        Code of the testing activity (e.g., 'WP-101').
    portfolio_node_name : str
        Name of the testing activity.
    reserved_start : str
        ISO 8601 start datetime (UTC).
    reserved_end : str
        ISO 8601 end datetime (UTC).
    buffer_start : str
        ISO 8601 datetime including warmup buffer.
    buffer_end : str
        ISO 8601 datetime including cooldown buffer.
    test_operator_name : str or None
        Name of the test operator.
    slot_type : str
        Type of slot: 'reservation' or 'buffer'.
    """

    reservation_id: str
    portfolio_node_id: str
    portfolio_node_code: str
    portfolio_node_name: str
    reserved_start: str
    reserved_end: str
    buffer_start: str
    buffer_end: str
    test_operator_name: Optional[str] = None
    slot_type: str = "reservation"


class FacilityTimelineResponse(BaseModel):
    """Response schema for a facility's time-phased reservation timeline.

    Attributes
    ----------
    location_id : str
        UUID of the location.
    location_code : str
        Code of the location (e.g., 'LAB-EMC-01').
    location_name : str
        Name of the location.
    chamber_capabilities : dict or None
        Environmental envelope of the chamber.
    calibration_expiry_date : str or None
        Date when the chamber calibration expires.
    warmup_cooldown_hours : float
        Hours of buffer required before and after test runs.
    reservations : list[ReservationTimelineSlot]
        List of reservation slots sorted by start time.
    buffer_slots : list[ReservationTimelineSlot]
        List of buffer/cooldown slots for visual display.
    """

    location_id: str
    location_code: str
    location_name: str
    chamber_capabilities: Optional[Dict[str, Any]] = None
    calibration_expiry_date: Optional[str] = None
    warmup_cooldown_hours: float = 2.0
    reservations: List[ReservationTimelineSlot] = []
    buffer_slots: List[ReservationTimelineSlot] = []


class FacilityValidationResponse(BaseModel):
    """Response from chamber feasibility validation.

    Attributes
    ----------
    valid : bool
        Whether the reservation passed all validation gates.
    capability_gate : bool
        Whether the task's environmental envelope fits the chamber.
    calibration_gate : bool
        Whether the reservation is within the calibration window.
    buffer_gate : bool
        Whether the buffer windows do not conflict with existing
        reservations.
    errors : list[str]
        List of validation error messages.
    buffer_start : str or None
        Calculated buffer start (including warmup).
    buffer_end : str or None
        Calculated buffer end (including cooldown).
    """

    valid: bool
    capability_gate: bool = True
    calibration_gate: bool = True
    buffer_gate: bool = True
    errors: List[str] = []
    buffer_start: Optional[str] = None
    buffer_end: Optional[str] = None


# ==================== Merkle Sync Schemas ====================


class MerkleManifestResponse(BaseModel):
    """Response schema for a Merkle tree manifest.

    Attributes
    ----------
    root_node_id : str
        UUID of the root PortfolioNode this manifest covers.
    root_path : str
        ltree path of the root node.
    root_hash : str
        Top-level Merkle root hash for instant equality comparison.
    generated_at : str
        ISO-8601 timestamp when the manifest was generated.
    node_count : int
        Total number of UniversalBreakdownNode records.
    dependency_count : int
        Total number of DependencyLink records.
    assignment_count : int
        Total number of ResourceAssignment records.
    tree : dict
        Full Merkle tree structure as a nested dictionary.
    site_id : str
        Identifier of the generating site (e.g., 'Warton').
    """

    root_node_id: str
    root_path: str
    root_hash: str
    generated_at: str
    node_count: int
    dependency_count: int
    assignment_count: int
    tree: Dict[str, Any]
    site_id: str = ""


class MerkleComparisonResponse(BaseModel):
    """Response schema for a Merkle manifest comparison.

    Attributes
    ----------
    identical : bool
        True if root hashes match (instant sync, zero changes).
    divergent_paths : list[str]
        ltree paths that differ between the two manifests.
    divergent_node_ids : list[str]
        UUIDs of nodes that have changed.
    added_node_ids : list[str]
        UUIDs of nodes present in the remote manifest but not locally.
    removed_node_ids : list[str]
        UUIDs of nodes present locally but not in the remote manifest.
    modified_node_ids : list[str]
        UUIDs of nodes present in both but with different hashes.
    divergent_dependency_ids : list[str]
        UUIDs of dependency links that have changed.
    divergent_assignment_ids : list[str]
        UUIDs of resource assignments that have changed.
    """

    identical: bool
    divergent_paths: List[str] = []
    divergent_node_ids: List[str] = []
    added_node_ids: List[str] = []
    removed_node_ids: List[str] = []
    modified_node_ids: List[str] = []
    divergent_dependency_ids: List[str] = []
    divergent_assignment_ids: List[str] = []


class MerkleDeltaExportResponse(BaseModel):
    """Response after exporting a Merkle delta pack.

    Attributes
    ----------
    node_count : int
        Number of nodes included in the delta pack.
    dependency_count : int
        Number of dependency links included.
    assignment_count : int
        Number of resource assignments included.
    pack_size_bytes : int
        Size of the .merklepack ZIP archive in bytes.
    signature : str
        SHA-256 signature of the delta payload.
    """

    node_count: int
    dependency_count: int
    assignment_count: int
    pack_size_bytes: int
    signature: str


class MerkleReconcileResponse(BaseModel):
    """Response after ingesting a Merkle delta pack.

    Attributes
    ----------
    status : str
        Overall status: 'SUCCESS', 'PARTIAL', 'CONFLICT', or 'ERROR'.
    applied_mutations : int
        Number of forward mutations successfully applied.
    staged_conflicts : int
        Number of conflicts staged into sandbox scenarios.
    sandbox_scenario_ids : list[str]
        UUIDs of sandbox scenarios created for conflict resolution.
    skipped_entities : list[dict]
        Entities that were skipped due to version conflicts.
    errors : list[str]
        Any errors encountered during ingestion.
    """

    status: str
    applied_mutations: int = 0
    staged_conflicts: int = 0
    sandbox_scenario_ids: List[str] = []
    skipped_entities: List[Dict[str, Any]] = []
    errors: List[str] = []


# ==================== Audit Verification Schemas ====================


class AuditChainDiscrepancy(BaseModel):
    """A single discrepancy detected during chain integrity verification.

    Attributes
    ----------
    type : str
        Category of discrepancy: BROKEN_HASH_LINK, HASH_MISMATCH,
        TIMESTAMP_INVERSION, or TOMBSTONE_ANOMALY.
    entry_id : str or None
        UUID of the audit log entry where the discrepancy was found.
    transaction_id : str or None
        Transaction ID associated with the discrepancy.
    message : str
        Human-readable description of the discrepancy.
    details : dict or None
        Additional context (e.g., expected vs actual hash values).
    """

    type: str
    entry_id: Optional[str] = None
    transaction_id: Optional[str] = None
    message: str
    details: Optional[Dict[str, Any]] = None


class AuditChainVerificationResponse(BaseModel):
    """Response from a full-chain SHA-256 integrity verification sweep.

    This certificate provides cryptographic proof that the forensic audit
    log has not been tampered with.  It is suitable for submission to
    sovereign security compliance boards.

    Attributes
    ----------
    verified_records_count : int
        Number of audit log records checked.
    chain_valid : bool
        True if the entire hash chain is intact with no discrepancies.
    first_corrupted_id : str or None
        UUID of the first entry where tampering was detected.
    tamper_detected : bool
        True if any discrepancy was found in the chain.
    discrepancies : list[AuditChainDiscrepancy]
        Detailed list of all discrepancies found.
    chain_head_hash : str
        The current_hash of the last verified entry (the chain head).
    chain_tail_hash : str
        The prev_hash of the first entry (should be empty for a valid
        chain start).
    verification_timestamp : str
        ISO-8601 timestamp when this verification was performed.
    """

    verified_records_count: int = 0
    chain_valid: bool = True
    first_corrupted_id: Optional[str] = None
    tamper_detected: bool = False
    discrepancies: List[AuditChainDiscrepancy] = []
    chain_head_hash: str = ""
    chain_tail_hash: str = ""
    verification_timestamp: str


class ForensicTimelineEvent(BaseModel):
    """A single mutation event in a forensic timeline.

    Attributes
    ----------
    entry_id : str
        UUID of the audit log entry.
    transaction_id : str
        Transaction ID that groups related audit entries.
    user_upn : str
        User Principal Name of the actor who performed the mutation.
    client_ip : str or None
        IP address of the client at the time of mutation.
    action_type : str
        Type of action: INSERT, UPDATE, DELETE, REPARENT, etc.
    entity_type : str
        Class name of the entity that was modified.
    json_diff : dict or None
        Before/after field values of the mutation.
    security_marking : str or None
        Security classification and caveats asserted at the time.
    prev_hash : str
        SHA-256 hash of the previous audit entry.
    current_hash : str
        SHA-256 hash of this entry's data + prev_hash.
    is_purged : bool
        True if this entry was purged under spillage protocol.
    created_at : str
        ISO-8601 timestamp of the mutation.
    """

    entry_id: str
    transaction_id: str
    user_upn: str
    client_ip: Optional[str] = None
    action_type: str
    entity_type: str
    json_diff: Optional[Dict[str, Any]] = None
    security_marking: Optional[str] = None
    prev_hash: str
    current_hash: str
    is_purged: bool = False
    created_at: str


class ForensicTimelineResponse(BaseModel):
    """Complete forensic mutation timeline for a single entity.

    This response reconstructs the exact state diffs across time,
    identifying which actor modified fields, which client IP was used,
    and which security caveats were asserted at each mutation.

    Attributes
    ----------
    entity_id : str
        UUID of the entity whose timeline is returned.
    total_mutations : int
        Total number of audit entries for this entity.
    timeline : list[ForensicTimelineEvent]
        Chronological list of mutation events.
    first_mutation_at : str or None
        ISO-8601 timestamp of the first mutation.
    last_mutation_at : str or None
        ISO-8601 timestamp of the most recent mutation.
    unique_actors : list[str]
        Distinct user UPNs who modified this entity.
    unique_ips : list[str]
        Distinct client IPs used to modify this entity.
    """

    entity_id: str
    total_mutations: int = 0
    timeline: List[ForensicTimelineEvent] = []
    first_mutation_at: Optional[str] = None
    last_mutation_at: Optional[str] = None
    unique_actors: List[str] = []
    unique_ips: List[str] = []


class AuditLedgerExportResponse(BaseModel):
    """Response after generating a signed audit ledger export bundle.

    Attributes
    ----------
    bundle_id : str
        UUID identifying this export bundle.
    total_entries : int
        Number of audit log entries included in the bundle.
    chain_valid : bool
        True if the chain was valid at the time of export.
    chain_head_hash : str
        The current_hash of the last entry in the exported chain.
    export_timestamp : str
        ISO-8601 timestamp when the export was generated.
    bundle_size_bytes : int
        Size of the ZIP archive in bytes.
    """

    bundle_id: str
    total_entries: int = 0
    chain_valid: bool = True
    chain_head_hash: str = ""
    export_timestamp: str
    bundle_size_bytes: int = 0


# ==================== Calibration & Maintenance Schemas ====================


class CalibrationRecordRequest(BaseModel):
    """Request to record a completed calibration event.

    Attributes
    ----------
    resource_id : str
        UUID of the ResourceNode being calibrated.
    calibration_date : str
        ISO-8601 date when the calibration was completed.
    interval_days : int
        Number of days until the next calibration is due
        (e.g., 180 for semi-annual, 365 for annual).
    certificate_vault_id : str or None
        Optional UUID of the calibration certificate
        DocumentArtifact in the vault.
    """

    resource_id: str
    calibration_date: str
    interval_days: int
    certificate_vault_id: Optional[str] = None

    @field_validator("interval_days")
    @classmethod
    def validate_interval(cls, v):
        """Validate that the calibration interval is a positive number.

        Args
        ----\n        v : int or float
            The calibration interval in days.

        Returns
        -------
        int or float
            The validated interval value.

        Raises
        ------
        ValueError
            If the interval is zero or negative.
        """
        if v <= 0:
            raise ValueError("Calibration interval must be positive")
        if v > 3650:
            raise ValueError("Calibration interval exceeds 10 years")
        return v


class CalibrationRecordResponse(BaseModel):
    """Response after recording a calibration event.

    Attributes
    ----------
    resource_id : str
        UUID of the calibrated resource.
    resource_code : str
        Code of the calibrated resource.
    serial_number : str or None
        Serial number of the equipment.
    last_calibration_date : str
        ISO-8601 date of the calibration just recorded.
    next_calibration_due : str
        ISO-8601 date when the next calibration is due.
    calibration_interval_days : int
        Days between calibration events.
    certificate_vault_id : str or None
        UUID of the linked calibration certificate.
    """

    resource_id: str
    resource_code: str
    serial_number: Optional[str] = None
    last_calibration_date: str
    next_calibration_due: str
    calibration_interval_days: int
    certificate_vault_id: Optional[str] = None


class MaintenanceWindowCreate(BaseModel):
    """Request to schedule a maintenance downtime window.

    Attributes
    ----------
    resource_id : str
        UUID of the ResourceNode undergoing maintenance.
    downtime_start : str
        ISO-8601 datetime when maintenance begins (UTC).
    downtime_end : str
        ISO-8601 datetime when maintenance ends (UTC).
    maintenance_type : str
        Type of maintenance: SCHEDULED_RECALIBRATION,
        UNSCHEDULED_REPAIR, or ANNUAL_OVERHAUL.
    work_order_reference : str
        Work order or maintenance ticket reference number.
    technician_name : str
        Name of the technician or contractor performing the work.
    """

    resource_id: str
    downtime_start: str
    downtime_end: str
    maintenance_type: str
    work_order_reference: str
    technician_name: str


class MaintenanceWindowResponse(BaseModel):
    """Response for a maintenance downtime window.

    Attributes
    ----------
    id : str
        UUID of the maintenance window.
    resource_id : str
        UUID of the resource undergoing maintenance.
    resource_code : str
        Code of the resource.
    downtime_start : str
        ISO-8601 start datetime (UTC).
    downtime_end : str
        ISO-8601 end datetime (UTC).
    maintenance_type : str
        Category of maintenance.
    work_order_reference : str
        Work order reference number.
    technician_name : str
        Name of the technician.
    """

    id: str
    resource_id: str
    resource_code: str
    downtime_start: str
    downtime_end: str
    maintenance_type: str
    work_order_reference: str
    technician_name: str


class EquipmentCalibrationStatus(BaseModel):
    """Response showing the calibration status of an equipment resource.

    Attributes
    ----------
    resource_id : str
        UUID of the resource.
    resource_code : str
        Code of the resource.
    serial_number : str or None
        Serial number of the equipment.
    resource_type : str
        Type of resource (PERSON, FACILITY, ASSET).
    is_out_of_service : bool
        Whether the resource is currently out of service.
    calibration_interval_days : int or None
        Days between required calibrations.
    last_calibration_date : str or None
        ISO-8601 date of the last calibration.
    next_calibration_due : str or None
        ISO-8601 date when next calibration is due.
    calibration_valid : bool
        True if the calibration is currently valid (not expired).
    days_until_expiry : int or None
        Number of days until calibration expires (negative if expired).
    certificate_vault_id : str or None
        UUID of the linked calibration certificate.
    active_maintenance_windows : list[MaintenanceWindowResponse]
        List of upcoming maintenance windows.
    """

    resource_id: str
    resource_code: str
    serial_number: Optional[str] = None
    resource_type: str
    is_out_of_service: bool = False
    calibration_interval_days: Optional[int] = None
    last_calibration_date: Optional[str] = None
    next_calibration_due: Optional[str] = None
    calibration_valid: bool = True
    days_until_expiry: Optional[int] = None
    certificate_vault_id: Optional[str] = None
    active_maintenance_windows: List[MaintenanceWindowResponse] = []


# ==================== Engineering Governance Schemas ====================


class EngineeringConcessionCreate(BaseModel):
    """Schema for creating a new engineering concession record.

    In defence programme management, any deviation from the approved
    design baseline must be formally documented.  This schema captures
    the minimum information needed to initiate a concession request.
    """
    concession_number: str = Field(..., min_length=1, max_length=64)
    concession_type: ConcessionType
    portfolio_node_id: UUID
    serial_number_affected: Optional[str] = Field(None, max_length=128)
    safety_significance: SafetySignificance
    lead_systems_engineer_user_id: UUID


class EngineeringConcessionUpdate(BaseModel):
    """Schema for updating an existing engineering concession.

    All fields are optional.  Only the fields included in the request
    body will be updated; omitted fields remain unchanged.
    """
    disposition: Optional[ConcessionDisposition] = None
    safety_significance: Optional[SafetySignificance] = None
    lead_systems_engineer_user_id: Optional[UUID] = None
    customer_qac_signoff_ref: Optional[str] = Field(None, max_length=128)


class EngineeringConcessionResponse(BaseModel):
    """Schema for returning an engineering concession record.

    Includes all fields plus computed metadata about the affected
    work package and reviewing engineer.
    """
    id: UUID
    concession_number: str
    concession_type: ConcessionType
    portfolio_node_id: UUID
    serial_number_affected: Optional[str] = None
    disposition: ConcessionDisposition
    safety_significance: SafetySignificance
    lead_systems_engineer_user_id: UUID
    customer_qac_signoff_ref: Optional[str] = None
    approved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EngineeringConcessionListResponse(BaseModel):
    """Schema for returning a list of engineering concessions."""
    concessions: List[EngineeringConcessionResponse]
    count: int


class SafetyGateCheckItem(BaseModel):
    """Single checklist item in the DAL safety gate status response."""
    check_name: str
    passed: bool
    details: Optional[str] = None


class SafetyGateStatusResponse(BaseModel):
    """Schema for the DAL compliance safety gate status endpoint.

    Returns a comprehensive checklist of all safety gates that must
    pass before a high-DAL task can be marked complete.  This includes
    two-man rule verification, V&V test completion, and open concession
    checks.
    """
    node_id: UUID
    dal_sil_level: DALSILLevel
    is_high_dal: bool
    checks: List[SafetyGateCheckItem]
    can_complete: bool
    blocking_reasons: List[str] = []


class SafetyVectorNode(BaseModel):
    """Single node in the compromised safety vector analysis."""
    node_id: UUID
    code: str
    name: str
    dal_sil_level: DALSILLevel
    baseline_finish: Optional[str] = None
    current_finish: Optional[str] = None
    slip_days: int
    is_downstream_critical: bool


class SafetyVectorResponse(BaseModel):
    """Schema for the compromised safety vector analysis response.

    When a schedule slip occurs, this analysis traverses the downstream
    dependency DAG to identify all high-DAL activities that have been
    pushed past their contractual baseline dates.  This enables the
    Lead Systems Engineer to assess the cascading safety risk.
    """
    root_node_id: UUID
    slip_days: int
    affected_nodes: List[SafetyVectorNode]
    critical_path_impact: bool
    summary: str


# ==================== Commercial Governance Schemas ====================


class ProjectContractStructureCreate(BaseModel):
    """Schema for creating a new project contract structure.

    Captures the commercial terms of a defence contract, including
    the pricing mechanism, target costs, and incentive fee structure.
    """
    portfolio_node_id: UUID
    contract_pricing_type: ContractPricingType
    target_cost: Optional[float] = Field(None, ge=0)
    target_fee: Optional[float] = Field(None, ge=0)
    ceiling_price: Optional[float] = Field(None, ge=0)
    contractor_share_ratio: Optional[float] = Field(None, ge=0, le=1)
    customer_share_ratio: Optional[float] = Field(None, ge=0, le=1)


class ProjectContractStructureUpdate(BaseModel):
    """Schema for updating an existing project contract structure.

    All fields are optional.  Only the fields included in the request
    body will be updated; omitted fields remain unchanged.
    """
    contract_pricing_type: Optional[ContractPricingType] = None
    target_cost: Optional[float] = Field(None, ge=0)
    target_fee: Optional[float] = Field(None, ge=0)
    ceiling_price: Optional[float] = Field(None, ge=0)
    contractor_share_ratio: Optional[float] = Field(None, ge=0, le=1)
    customer_share_ratio: Optional[float] = Field(None, ge=0, le=1)


class ProjectContractStructureResponse(BaseModel):
    """Schema for returning a project contract structure record.

    Includes all contract terms plus computed metadata about the
    associated project node.
    """
    id: UUID
    portfolio_node_id: UUID
    contract_pricing_type: ContractPricingType
    target_cost: Optional[float] = None
    target_fee: Optional[float] = None
    ceiling_price: Optional[float] = None
    contractor_share_ratio: Optional[float] = None
    customer_share_ratio: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FiscalYearSpendingCapCreate(BaseModel):
    """Schema for creating a new fiscal year spending cap.

    Defines the maximum funding that can be spent on a control
    account during a specific fiscal year tranche.
    """
    portfolio_node_id: UUID
    fiscal_year: str = Field(..., min_length=1, max_length=16)
    fy_start_date: date
    fy_end_date: date
    allocated_funding_cap: float = Field(..., gt=0)

    @field_validator('fy_end_date')
    @classmethod
    def end_after_start(cls, v, info):
        """Ensure fiscal year end date is after start date."""
        if 'data' in info and info.data and info.data.get('fy_start_date'):
            if v <= info.data['fy_start_date']:
                raise ValueError('fy_end_date must be after fy_start_date')
        return v


class FiscalYearSpendingCapUpdate(BaseModel):
    """Schema for updating an existing fiscal year spending cap.

    All fields are optional.  Only the fields included in the request
    body will be updated; omitted fields remain unchanged.
    """
    allocated_funding_cap: Optional[float] = Field(None, gt=0)
    fy_start_date: Optional[date] = None
    fy_end_date: Optional[date] = None


class FiscalYearSpendingCapResponse(BaseModel):
    """Schema for returning a fiscal year spending cap record.

    Includes the cap details plus computed spend-to-cap ratio.
    """
    id: UUID
    portfolio_node_id: UUID
    fiscal_year: str
    fy_start_date: date
    fy_end_date: date
    allocated_funding_cap: float
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FiscalYearSpendValidationResponse(BaseModel):
    """Schema for fiscal year spend profile validation results.

    Returns whether the planned spend for a control account exceeds
    the allocated fiscal year cap, and details of any overrun.
    """
    portfolio_node_id: UUID
    fiscal_year: str
    allocated_funding_cap: float
    planned_spend: float
    actual_spend: float
    total_spend: float
    overrun_amount: float
    is_overrun: bool
    overrun_percentage: float


class GovernmentAcceptanceMilestoneCreate(BaseModel):
    """Schema for creating a new government acceptance milestone.

    Records the formal inspection and acceptance process for a
    defence deliverable.
    """
    portfolio_node_id: UUID
    acceptance_document_type: AcceptanceDocumentType
    receipt_reference_number: Optional[str] = Field(None, max_length=128)
    qar_inspector_name: Optional[str] = Field(None, max_length=256)


class GovernmentAcceptanceMilestoneUpdate(BaseModel):
    """Schema for updating an existing government acceptance milestone.

    All fields are optional.  Updating the status to ACCEPTED
    automatically sets the signed_off_at timestamp.
    """
    acceptance_document_type: Optional[AcceptanceDocumentType] = None
    receipt_reference_number: Optional[str] = Field(None, max_length=128)
    qar_inspector_name: Optional[str] = Field(None, max_length=256)
    status: Optional[AcceptanceStatus] = None


class GovernmentAcceptanceMilestoneResponse(BaseModel):
    """Schema for returning a government acceptance milestone record.

    Includes the acceptance details and signoff status.
    """
    id: UUID
    portfolio_node_id: UUID
    acceptance_document_type: AcceptanceDocumentType
    receipt_reference_number: Optional[str] = None
    qar_inspector_name: Optional[str] = None
    status: AcceptanceStatus
    signed_off_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TCIFFeeAdjustmentResponse(BaseModel):
    """Schema for TCIF fee adjustment calculation results.

    When actual/projected costs differ from the target cost, the
    fee is adjusted using the shareline ratios.  This response
    shows the full calculation breakdown.
    """
    project_id: UUID
    contract_pricing_type: ContractPricingType
    target_cost: float
    target_fee: float
    projected_cost: float
    cost_variance: float
    fee_adjustment: float
    adjusted_fee: float
    projected_total_price: float
    ceiling_price: Optional[float] = None
    is_ceiling_exceeded: bool
    clamped_total_price: Optional[float] = None
    contractor_share_ratio: float
    customer_share_ratio: float


# ==================== Perishable Material Schemas ====================


class PerishableMaterialLotCreate(BaseModel):
    """Schema for creating a new perishable material lot.

    Records a material lot with cold storage expiry and out-time
    limits for shelf-life tracking.
    """
    lot_number: str = Field(..., min_length=1, max_length=64)
    part_number: str = Field(..., min_length=1, max_length=64)
    material_type: MaterialType
    cold_storage_expiry: date
    maximum_out_time_hours: float = Field(..., gt=0, le=9999.99)
    allocated_task_id: Optional[UUID] = None


class PerishableMaterialLotUpdate(BaseModel):
    """Schema for updating an existing perishable material lot.

    All fields are optional.  Only the fields included in the request
    body will be updated; omitted fields remain unchanged.
    """
    allocated_task_id: Optional[UUID] = None
    cold_storage_expiry: Optional[date] = None
    maximum_out_time_hours: Optional[float] = Field(None, gt=0, le=9999.99)


class PerishableMaterialLotResponse(BaseModel):
    """Schema for returning a perishable material lot record.

    Includes all lot details plus computed shelf-life remaining.
    """
    id: UUID
    lot_number: str
    part_number: str
    material_type: MaterialType
    allocated_task_id: Optional[UUID] = None
    cold_storage_expiry: date
    thawed_timestamp: Optional[datetime] = None
    maximum_out_time_hours: float
    accumulated_out_time_hours: float
    lot_status: LotStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ThawEventRequest(BaseModel):
    """Schema for logging a thaw event.

    When a material is removed from cold storage, this records
    the thaw timestamp and transitions the lot to THAWED_IN_USE.
    """
    pass  # User ID is extracted from JWT; lot ID from path


class ReturnToStorageRequest(BaseModel):
    """Schema for logging return to cold storage.

    Adds the out-time hours to the accumulated total and validates
    that the total does not exceed the maximum allowed.
    """
    hours_out: float = Field(..., gt=0)


class LotStatusResponse(BaseModel):
    """Schema for returning detailed lot status information.

    Includes shelf-life remaining, out-time remaining, and
    allocation status.
    """
    lot_id: UUID
    lot_number: str
    part_number: str
    material_type: MaterialType
    lot_status: LotStatus
    cold_storage_expiry: date
    days_until_cold_expiry: Optional[int] = None
    thawed_at: Optional[datetime] = None
    accumulated_out_time_hours: float
    maximum_out_time_hours: float
    remaining_out_time_hours: float
    allocated_task_id: Optional[UUID] = None
    allocated_task_code: Optional[str] = None


class ClearanceStatusResponse(BaseModel):
    """Schema for returning user clearance status.

    Includes clearance type, expiry date, and computed status
    for display in the UI.
    """
    user_id: int
    clearance_type: Optional[str] = None
    clearance_expiry: Optional[date] = None
    days_until_expiry: Optional[int] = None
    is_expired: bool
    is_expiring_soon: bool
    status: str  # 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED'


# ============================================================================
# Work Pattern Template Schemas
# ============================================================================


class WorkPatternDayCreate(BaseModel):
    """Schema for creating a per-day-of-week work pattern definition.

    Defines the working hours, start time, and end time for a single
    day within a work pattern template.

    Attributes
    ----------
    day_of_week : int
        Day of the week (0=Monday, 6=Sunday).
    hours : float
        Number of working hours (0.0 = non-working day).
    start_time : str or None
        Start time in HH:MM format (e.g., "09:00").
    end_time : str or None
        End time in HH:MM format (e.g., "17:00").
    """
    day_of_week: int = Field(..., ge=0, le=6)
    hours: float = Field(..., ge=0, le=24)
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class WorkPatternDayResponse(BaseModel):
    """Schema for returning a per-day-of-week work pattern definition.

    Attributes
    ----------
    id : str
        UUID of the day definition.
    day_of_week : int
        Day of the week (0=Monday, 6=Sunday).
    hours : float
        Number of working hours.
    start_time : str or None
        Start time in HH:MM format.
    end_time : str or None
        End time in HH:MM format.
    """
    id: str
    day_of_week: int
    hours: float
    start_time: Optional[str] = None
    end_time: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class WorkPatternTemplateCreate(BaseModel):
    """Schema for creating a new work pattern template.

    A work pattern template defines a reusable working schedule that
    can be applied to any number of resources.  It includes a name,
    category, and per-day-of-week hour definitions.

    Attributes
    ----------
    code : str
        Unique machine-readable code (e.g., 'WP_STANDARD').
    name : str
        Human-readable name (e.g., 'Standard Office Hours').
    description : str or None
        Detailed description of the pattern.
    category : str
        Category classification (STANDARD, SHIFT, PART_TIME, OVERTIME, CUSTOM).
    is_default : bool
        Whether this is the default template for its category.
    days : list[WorkPatternDayCreate]
        Per-day-of-week definitions (should include all 7 days).
    """
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    category: str = Field(default="CUSTOM")
    is_default: bool = False
    days: List[WorkPatternDayCreate] = []


class WorkPatternTemplateUpdate(BaseModel):
    """Schema for updating an existing work pattern template.

    All fields are optional.  Only the fields included in the request
    body will be updated; omitted fields remain unchanged.

    Attributes
    ----------
    name : str or None
        Updated name.
    description : str or None
        Updated description.
    category : str or None
        Updated category.
    is_default : bool or None
        Updated default flag.
    is_active : bool or None
        Updated active flag.
    days : list[WorkPatternDayCreate] or None
        Updated per-day definitions (replaces all existing days).
    """
    name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    category: Optional[str] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None
    days: Optional[List[WorkPatternDayCreate]] = None


class WorkPatternTemplateResponse(BaseModel):
    """Schema for returning a work pattern template.

    Attributes
    ----------
    id : str
        UUID of the template.
    code : str
        Machine-readable code.
    name : str
        Human-readable name.
    description : str or None
        Detailed description.
    category : str
        Category classification.
    version : int
        Version number.
    is_default : bool
        Whether this is the default for its category.
    is_active : bool
        Whether this template can be applied to new resources.
    days : list[WorkPatternDayResponse]
        Per-day-of-week definitions.
    resource_count : int
        Number of resources currently using this template.
    created_at : datetime
        Creation timestamp.
    updated_at : datetime
        Last modification timestamp.
    """
    id: str
    code: str
    name: str
    description: Optional[str] = None
    category: str
    version: int
    is_default: bool
    is_active: bool
    days: List[WorkPatternDayResponse] = []
    resource_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WorkPatternTemplateListResponse(BaseModel):
    """Schema for returning a list of work pattern templates.

    Attributes
    ----------
    templates : list[WorkPatternTemplateResponse]
        List of all templates.
    total_templates : int
        Total number of templates.
    defaults : dict
        Map of category to default template ID.
    """
    templates: List[WorkPatternTemplateResponse] = []
    total_templates: int = 0
    defaults: Dict[str, str] = {}


class ResourceWorkPatternCreate(BaseModel):
    """Schema for assigning a work pattern template to a resource.

    Links a resource to a work pattern template with an effective
    date range and optional per-day hour overrides.

    Attributes
    ----------
    resource_node_id : str
        UUID of the resource node to assign the pattern to.
    template_id : str
        UUID of the work pattern template.
    effective_from : str
        ISO date string (YYYY-MM-DD) when the pattern becomes active.
    effective_to : str or None
        ISO date string when the pattern expires.  NULL means ongoing.
    override_hours : dict or None
        Per-day hour overrides (keys are day_of_week 0-6, values are hours).
    priority : int
        Priority for resolving overlapping assignments (higher wins).
    notes : str or None
        Free-text notes explaining the assignment.
    """
    resource_node_id: str = Field(..., min_length=1)
    template_id: str = Field(..., min_length=1)
    effective_from: str = Field(..., min_length=1)
    effective_to: Optional[str] = None
    override_hours: Optional[Dict[str, float]] = None
    priority: int = Field(default=0)
    notes: Optional[str] = Field(None, max_length=1000)


class ResourceWorkPatternResponse(BaseModel):
    """Schema for returning a resource work pattern assignment.

    Attributes
    ----------
    id : str
        UUID of the assignment.
    resource_node_id : str
        UUID of the resource node.
    resource_name : str
        Name of the resource.
    template_id : str
        UUID of the work pattern template.
    template_name : str
        Name of the template.
    effective_from : str
        ISO date when the pattern becomes active.
    effective_to : str or None
        ISO date when the pattern expires.
    override_hours : dict or None
        Per-day hour overrides.
    priority : int
        Priority for resolving overlaps.
    notes : str or None
        Assignment notes.
    created_at : datetime
        Creation timestamp.
    """
    id: str
    resource_node_id: str
    resource_name: str
    template_id: str
    template_name: str
    effective_from: str
    effective_to: Optional[str] = None
    override_hours: Optional[Dict[str, float]] = None
    priority: int
    notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ResourceWorkPatternListResponse(BaseModel):
    """Schema for returning a list of resource work pattern assignments.

    Attributes
    ----------
    assignments : list[ResourceWorkPatternResponse]
        List of all assignments.
    total_assignments : int
        Total number of assignments.
    """
    assignments: List[ResourceWorkPatternResponse] = []
    total_assignments: int = 0


class ResourceEffectivePatternResponse(BaseModel):
    """Schema for returning the effective work pattern for a resource.

    Combines the template's per-day hours with any resource-specific
    overrides to produce the actual working hours for each day.

    Attributes
    ----------
    resource_node_id : str
        UUID of the resource.
    resource_name : str
        Name of the resource.
    template_id : str or None
        UUID of the applied template (if any).
    template_name : str or None
        Name of the applied template.
    effective_days : list[dict]
        Per-day effective hours (day_of_week, hours, start_time, end_time).
    weekly_hours : float
        Total working hours per week.
    """
    resource_node_id: str
    resource_name: str
    template_id: Optional[str] = None
    template_name: Optional[str] = None
    effective_days: List[Dict[str, Any]] = []
    weekly_hours: float = 0.0


# ==================== External Repository Artifact Linking Schemas ====================


class ExternalRepositoryArtifactCreate(BaseModel):
    """Schema for linking an external repository artifact to a WBS node.

    Attributes
    ----------
    portfolio_node_id : str
        UUID of the WBS node to link the artifact to.
    repository_type : str
        Type of external repository (WINDCHILL, GIT, DOORS).
    external_identifier : str
        Unique identifier in the external system.
    title : str
        Human-readable title of the artifact.
    version_revision : str or None
        Version or revision string.
    lifecycle_state : str
        Current lifecycle state (DRAFT, IN_REVIEW, RELEASED, APPROVED, OBSOLETE).
    verification_hash : str or None
        SHA-256 hash of the artifact content.
    drives_progress : bool
        Whether transitioning to RELEASED/APPROVED advances task progress.
    milestone_weight_step_id : str or None
        UUID of the milestone weight step to apply when driving progress.
    external_url : str or None
        Deep link to the external repository viewer.
    extra_metadata : dict or None
        Additional JSON metadata from the external system.
    """
    portfolio_node_id: str = Field(..., min_length=1)
    repository_type: str = Field(..., min_length=1)
    external_identifier: str = Field(..., min_length=1, max_length=500)
    title: str = Field(..., min_length=1, max_length=500)
    version_revision: Optional[str] = Field(None, max_length=100)
    lifecycle_state: str = Field(default="DRAFT")
    verification_hash: Optional[str] = Field(None, max_length=64)
    drives_progress: bool = False
    milestone_weight_step_id: Optional[str] = None
    external_url: Optional[str] = Field(None, max_length=1000)
    extra_metadata: Optional[Dict[str, Any]] = None


class ExternalRepositoryArtifactResponse(BaseModel):
    """Schema for returning an external repository artifact link.

    Attributes
    ----------
    id : str
        UUID of the artifact link.
    portfolio_node_id : str
        UUID of the linked WBS node.
    repository_type : str
        Type of external repository.
    external_identifier : str
        External system identifier.
    title : str
        Artifact title.
    version_revision : str or None
        Version or revision.
    lifecycle_state : str
        Current lifecycle state.
    verification_hash : str or None
        SHA-256 verification hash.
    drives_progress : bool
        Whether this artifact drives task progress.
    milestone_weight_step_id : str or None
        Linked milestone weight step UUID.
    milestone_weight : float or None
        Weight fraction contributed by this artifact (if drives_progress).
    external_url : str or None
        Deep link to external viewer.
    extra_metadata : dict or None
        Additional metadata.
    created_at : datetime
        Creation timestamp.
    updated_at : datetime
        Last update timestamp.
    """
    id: str
    portfolio_node_id: str
    repository_type: str
    external_identifier: str
    title: str
    version_revision: Optional[str] = None
    lifecycle_state: str
    verification_hash: Optional[str] = None
    drives_progress: bool
    milestone_weight_step_id: Optional[str] = None
    milestone_weight: Optional[float] = None
    external_url: Optional[str] = None
    extra_metadata: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ExternalRepositoryArtifactListResponse(BaseModel):
    """Schema for listing external repository artifacts for a node.

    Attributes
    ----------
    artifacts : list[ExternalRepositoryArtifactResponse]
        List of linked artifacts.
    total_count : int
        Total number of linked artifacts.
    total_progress_contribution : float
        Sum of milestone weights from progress-driving artifacts.
    """
    artifacts: List[ExternalRepositoryArtifactResponse] = []
    total_count: int = 0
    total_progress_contribution: float = 0.0


class WindchillWebhookPayload(BaseModel):
    """Schema for Windchill REST event webhook payloads.

    Attributes
    ----------
    event_type : str
        Type of event (e.g., 'LifeCycleChange', 'DocumentCreated').
    object_type : str
        Windchill object type (e.g., 'WTDocument', 'WTPart').
    object_id : str
        External identifier of the Windchill object.
    part_number : str or None
        Part number or document number.
    title : str
        Title of the object.
    revision : str or None
        Revision letter (e.g., 'A', 'B').
    lifecycle_state : str
        Current lifecycle state name.
    owner : str or None
        Owner of the object.
    timestamp : str
        ISO timestamp of the event.
    verification_hash : str or None
        SHA-256 hash of the document content.
    """
    event_type: str
    object_type: str
    object_id: str
    part_number: Optional[str] = None
    title: str
    revision: Optional[str] = None
    lifecycle_state: str
    owner: Optional[str] = None
    timestamp: str
    verification_hash: Optional[str] = None


class GitWebhookPayload(BaseModel):
    """Schema for Git release/tag push webhook payloads.

    Attributes
    ----------
    event_type : str
        Type of event (e.g., 'push', 'release').
    repository_url : str
        URL of the Git repository.
    repository_name : str
        Name of the repository.
    commit_hash : str
        SHA-1 commit hash.
    tag_name : str or None
        Tag name if this is a tagged push.
    branch : str or None
        Branch name if this is a branch push.
    message : str or None
        Commit message.
    author : str or None
        Author of the commit.
    timestamp : str
        ISO timestamp of the event.
    """
    event_type: str
    repository_url: str
    repository_name: str
    commit_hash: str
    tag_name: Optional[str] = None
    branch: Optional[str] = None
    message: Optional[str] = None
    author: Optional[str] = None
    timestamp: str
