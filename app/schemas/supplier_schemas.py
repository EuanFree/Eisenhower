"""Supplier Portal API schemas.

This module defines the Pydantic request and response schemas for the
isolated subcontractor supplier portal.  These schemas ensure that
external vendors receive only the data fields they are authorised to
see, with all prime contractor EVM cost rates and classified hierarchy
information redacted.

Schema Naming Convention
~~~~~~~~~~~~~~~~~~~~~~~~

- ``SupplierTaskResponse`` — A task node returned to a subcontractor
  with all prime-sensitive fields masked.
- ``SupplierProgressUpdate`` — Request body for logging progress.
- ``SupplierCDRLSubmission`` — Request body for submitting SDRL documents.

Security Considerations
~~~~~~~~~~~~~~~~~~~~~~~

All response schemas exclude the following fields that must never be
visible to subcontractors:

- ``bac_cost``, ``planned_value``, ``earned_value``, ``actual_cost``
- ``odac_permissions``
- Full ltree path (truncated to boundary node + descendant)
- Any cost rate information in ``custom_attributes``
"""
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, date
from uuid import UUID


# ============================================================================
# Supplier Task Schemas
# ============================================================================

class SupplierTaskResponse(BaseModel):
    """Task node returned to a subcontractor with prime data masked.

    This is the primary response schema for ``GET /tasks``.  It includes
    only the fields a subcontractor needs to track their contractual
    work packages: identity, schedule dates, progress, and blockers.

    All EVM cost data is replaced with ``'[RESTRICTED]'``.  The ltree
    path is truncated to show only the boundary node and below.

    Attributes
    ----------
    id : UUID
        Unique node identifier.
    code : str
        Work package code (e.g., ``'WP-101'``).
    name : str
        Task name (or ``'[RESTRICTED]'`` if classification exceeds user clearance).
    path : str
        Truncated ltree path showing only boundary node + descendant.
    path_masked : bool
        True if the full parent hierarchy has been hidden.
    security_classification : str
        Node classification level.
    delivery_mode : Optional[str]
        Delivery methodology (WATERFALL, AGILE, HYBRID).
    planned_start_date : Optional[date]
        Planned start date.
    planned_end_date : Optional[date]
        Planned end date.
    actual_start_date : Optional[date]
        Actual start date (if work has begun).
    actual_end_date : Optional[date]
        Actual end date (if work is complete).
    percent_complete : float
        Physical percent complete (0–100).
    total_float : Optional[int]
        Total float in days (None if CPM not yet calculated).
    is_critical : bool
        True if the task is on the critical path (TF ≤ 0).
    has_active_blocker : bool
        True if the task has unresolved blockers.
    blockers_count : int
        Number of active blockers on this task.
    vendor_cage_code : Optional[str]
        NATO/CAGE code of the vendor assigned to this work package.
    linked_cdrl_code : Optional[str]
        CDRL sequence number if a deliverable is linked.
    vv_test_summary : Optional[Dict[str, int]]
        V&V test case summary: ``{"passed": N, "total": M}``.
    version_id : int
        Optimistic concurrency version number.
    """
    id: UUID
    code: str
    name: str
    path: str
    path_masked: bool = False
    security_classification: str
    delivery_mode: Optional[str] = None
    planned_start_date: Optional[date] = None
    planned_end_date: Optional[date] = None
    actual_start_date: Optional[date] = None
    actual_end_date: Optional[date] = None
    percent_complete: float = 0.0
    total_float: Optional[int] = None
    is_critical: bool = False
    has_active_blocker: bool = False
    blockers_count: int = 0
    vendor_cage_code: Optional[str] = None
    linked_cdrl_code: Optional[str] = None
    vv_test_summary: Optional[Dict[str, int]] = None
    version_id: int = 1

    model_config = ConfigDict(from_attributes=True)


class SupplierTaskListResponse(BaseModel):
    """Response for ``GET /tasks`` — list of accessible tasks.

    Attributes
    ----------
    tasks : list of SupplierTaskResponse
        Masked task nodes accessible to the subcontractor.
    total_count : int
        Total number of accessible tasks.
    vendor_cage_code : str
        The CAGE code of the requesting vendor.
    """
    tasks: List[SupplierTaskResponse]
    total_count: int
    vendor_cage_code: str


# ============================================================================
# Progress Update Schemas
# ============================================================================

class SupplierProgressUpdate(BaseModel):
    """Request body for ``POST /tasks/{id}/progress``.

    Subcontractors use this to log physical progress, update remaining
    duration estimates, and add status notes.

    Attributes
    ----------
    percent_complete : float
        New physical percent complete (0–100).  Must not decrease.
    remaining_duration_days : Optional[float]
        Updated estimate of remaining work days.
    notes : Optional[str]
        Status notes or comments from the subcontractor.
    hours_logged_today : Optional[float]
        Direct labor hours logged for today.
    forecast_finish_date : Optional[date]
        Updated forecast of when the task will be physically complete.
    """
    percent_complete: float = Field(..., ge=0.0, le=100.0)
    remaining_duration_days: Optional[float] = Field(None, ge=0.0)
    notes: Optional[str] = Field(None, max_length=2000)
    hours_logged_today: Optional[float] = Field(None, ge=0.0)
    forecast_finish_date: Optional[date] = None


class SupplierProgressResponse(BaseModel):
    """Response after a successful progress update.

    Attributes
    ----------
    task_id : UUID
        Updated task identifier.
    previous_percent_complete : float
        Progress before this update.
    new_percent_complete : float
        Progress after this update.
    updated_at : datetime
        Timestamp of the update.
    message : str
        Confirmation message.
    """
    task_id: UUID
    previous_percent_complete: float
    new_percent_complete: float
    updated_at: datetime
    message: str


# ============================================================================
# CDRL / SDRL Submission Schemas
# ============================================================================

class SupplierCDRLSubmission(BaseModel):
    """Request body for ``POST /cdrl/{id}/submit``.

    Subcontractors use this to submit SDRL (Subcontract Data Requirements
    List) documents.  The submission triggers automated metadata
    sanitization and malware scanning.

    Attributes
    ----------
    cdrl_id : UUID
        ID of the ContractDeliverable being submitted.
    file_name : str
        Name of the submitted file.
    file_size_bytes : int
        Size of the file in bytes.
    mime_type : str
        MIME type of the submitted file.
    sha256_checksum : str
        SHA-256 cryptographic digest of the file payload.
    s3_object_key : str
        S3 object key where the file is stored.
    submission_notes : Optional[str]
        Notes from the subcontractor regarding the submission.
    """
    cdrl_id: UUID
    file_name: str = Field(..., max_length=500)
    file_size_bytes: int = Field(..., gt=0)
    mime_type: str = Field(..., max_length=100)
    sha256_checksum: str = Field(..., min_length=64, max_length=64)
    s3_object_key: str = Field(..., max_length=1000)
    submission_notes: Optional[str] = Field(None, max_length=2000)


class SupplierCDRLResponse(BaseModel):
    """Response after a successful CDRL submission.

    Attributes
    ----------
    cdrl_id : UUID
        Deliverable identifier.
    cdrl_sequence_number : str
        CDRL sequence number (e.g., ``'CDRL-A004'``).
    title : str
        Deliverable title.
    previous_status : str
        Status before submission.
    new_status : str
        Status after submission (typically ``'SUBMITTED'``).
    submitted_at : datetime
        Timestamp of the submission.
    message : str
        Confirmation message.
    """
    cdrl_id: UUID
    cdrl_sequence_number: str
    title: str
    previous_status: str
    new_status: str
    submitted_at: datetime
    message: str


class SupplierCDRLItem(BaseModel):
    """CDRL item in the deliverable in-tray.

    Attributes
    ----------
    id : UUID
        Deliverable identifier.
    cdrl_sequence_number : str
        CDRL/SDRL sequence number.
    title : str
        Deliverable title.
    did_reference : Optional[str]
        DID reference (e.g., ``'DI-MGMT-81861'``).
    revision : str
        Current revision (e.g., ``'Rev A'``).
    status : str
        Current status (DRAFTING, SUBMITTED, UNDER_REVIEW, etc.).
    contractual_due_date : Optional[date]
        Contractual due date.
    actual_submission_date : Optional[date]
        Date the deliverable was submitted.
    review_deadline_date : Optional[date]
        Deadline for customer review.
    days_until_review_deadline : Optional[int]
        Remaining days until review deadline (negative = overdue).
    """
    id: UUID
    cdrl_sequence_number: str
    title: str
    did_reference: Optional[str] = None
    revision: str = "Rev A"
    status: str
    contractual_due_date: Optional[date] = None
    actual_submission_date: Optional[date] = None
    review_deadline_date: Optional[date] = None
    days_until_review_deadline: Optional[int] = None


class SupplierCDRLListResponse(BaseModel):
    """Response for ``GET /cdrl`` — list of deliverable items.

    Attributes
    ----------
    deliverables : list of SupplierCDRLItem
        CDRL items assigned to the subcontractor's work packages.
    total_count : int
        Total number of deliverables.
    """
    deliverables: List[SupplierCDRLItem]
    total_count: int


# ============================================================================
# Schedule Upload Schemas
# ============================================================================

class SupplierScheduleUploadResponse(BaseModel):
    """Response after uploading a schedule file (.xer or .xml).

    The upload triggers the automated subcontractor ingest pipeline,
    which validates the schedule against contractual boundary gates.

    Attributes
    ----------
    submission_id : UUID
        ID of the created SubcontractorSubmission record.
    status : str
        Initial status (RECEIVED or VALIDATING).
    message : str
        Confirmation message.
    """
    submission_id: UUID
    status: str
    message: str


# ============================================================================
# Supplier Profile Schema
# ============================================================================

class SupplierProfileResponse(BaseModel):
    """Supplier profile information returned on portal login.

    Attributes
    ----------
    user_id : int
        User account ID.
    username : str
        Login username.
    full_name : Optional[str]
        Display name.
    vendor_cage_code : str
        NATO/CAGE code of the vendor organisation.
    employer_legal_entity : Optional[str]
        Legal entity name.
    clearance_level : str
        Security clearance level.
    caveats : Optional[List[str]]
        Security caveats.
    """
    user_id: int
    username: str
    full_name: Optional[str] = None
    vendor_cage_code: str
    employer_legal_entity: Optional[str] = None
    clearance_level: str
    caveats: Optional[List[str]] = None
