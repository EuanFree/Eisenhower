"""Pydantic schemas for the schedule quarantine buffer API.

This module defines the request and response schemas for the quarantine
endpoints that handle incoming schedule file uploads, automated integrity
validation, remediation actions, and commit-to-master operations.

Schema Naming Convention
------------------------
- ``...Request`` — Input schemas for POST/PUT endpoints.
- ``...Response`` — Output schemas returned by GET/POST endpoints.
- ``...Item`` — Individual issue or action items within a larger response.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Any
from uuid import UUID
from datetime import datetime


class QuarantineUploadRequest(BaseModel):
    """Request payload for uploading a schedule file into quarantine.

    Attributes
    ----------
    target_project_id : UUID
        The root PortfolioNode into which this schedule will be merged
        after remediation.
    file_format : str
        Format of the uploaded file: 'PRIMAVERA_P6_XER' or 'MS_PROJECT_XML'.
    source_filename : str
        Original filename of the uploaded schedule file.
    """
    target_project_id: UUID = Field(
        ...,
        description="Root project PortfolioNode into which this schedule will be merged.",
    )
    file_format: str = Field(
        ...,
        description="File format: 'PRIMAVERA_P6_XER' or 'MS_PROJECT_XML'.",
    )
    source_filename: str = Field(
        ...,
        description="Original filename of the uploaded schedule file.",
    )


class CycleIssueItem(BaseModel):
    """A detected circular dependency cycle.

    Attributes
    ----------
    cycle_id : str
        Unique identifier for this cycle (auto-generated).
    nodes : List[str]
        List of node IDs forming the circular dependency chain.
    edges : List[dict]
        List of dependency edges forming the cycle.
    minimal_feedback_edges : List[dict]
        Minimal set of edges whose removal would break this cycle.
    """
    cycle_id: str = Field(..., description="Unique identifier for this cycle.")
    nodes: List[str] = Field(
        ...,
        description="Node IDs forming the circular dependency chain.",
    )
    edges: List[dict] = Field(
        ...,
        description="Dependency edges forming the cycle.",
    )
    minimal_feedback_edges: List[dict] = Field(
        ...,
        description="Minimal edges whose removal would break this cycle.",
    )


class DanglingNodeItem(BaseModel):
    """A detected dangling activity node.

    Attributes
    ----------
    node_id : str
        ID of the dangling node.
    node_code : str
        WBS code of the dangling node.
    node_name : str
        Name/title of the dangling node.
    issue_type : str
        Type of dangling issue: 'MISSING_PREDECESSOR' or 'MISSING_SUCCESSOR'.
    in_degree : int
        Number of incoming edges (predecessors).
    out_degree : int
        Number of outgoing edges (successors).
    """
    node_id: str = Field(..., description="ID of the dangling node.")
    node_code: str = Field(..., description="WBS code of the dangling node.")
    node_name: str = Field(..., description="Name/title of the dangling node.")
    issue_type: str = Field(
        ...,
        description="'MISSING_PREDECESSOR' or 'MISSING_SUCCESSOR'.",
    )
    in_degree: int = Field(..., description="Number of incoming edges.")
    out_degree: int = Field(..., description="Number of outgoing edges.")


class CalendarDiscrepancyItem(BaseModel):
    """A detected calendar definition discrepancy.

    Attributes
    ----------
    imported_calendar_code : str
        Calendar code from the imported file.
    issue_type : str
        Type of discrepancy: 'UNMAPPED_SHIFT_CODE' or 'UNALIGNED_EXCEPTION'.
    description : str
        Human-readable description of the discrepancy.
    suggested_mapping : Optional[str]
        Suggested sovereign calendar code to map to.
    """
    imported_calendar_code: str = Field(
        ...,
        description="Calendar code from the imported file.",
    )
    issue_type: str = Field(
        ...,
        description="'UNMAPPED_SHIFT_CODE' or 'UNALIGNED_EXCEPTION'.",
    )
    description: str = Field(
        ...,
        description="Human-readable description of the discrepancy.",
    )
    suggested_mapping: Optional[str] = Field(
        None,
        description="Suggested sovereign calendar code to map to.",
    )


class QuarantineIssuesResponse(BaseModel):
    """Response containing all detected quarantine issues.

    Attributes
    ----------
    batch_id : UUID
        ID of the quarantine batch.
    validation_status : str
        Current validation status of the batch.
    cycle_count : int
        Number of circular dependency cycles detected.
    dangling_node_count : int
        Number of dangling nodes detected.
    out_of_sequence_count : int
        Number of out-of-sequence activities detected.
    cycles : List[CycleIssueItem]
        Detailed cycle information.
    dangling_nodes : List[DanglingNodeItem]
        Detailed dangling node information.
    calendar_discrepancies : List[CalendarDiscrepancyItem]
        Detailed calendar discrepancy information.
    """
    batch_id: UUID = Field(..., description="ID of the quarantine batch.")
    validation_status: str = Field(
        ...,
        description="Current validation status of the batch.",
    )
    cycle_count: int = Field(..., description="Number of cycles detected.")
    dangling_node_count: int = Field(
        ...,
        description="Number of dangling nodes detected.",
    )
    out_of_sequence_count: int = Field(
        ...,
        description="Number of out-of-sequence activities detected.",
    )
    cycles: List[CycleIssueItem] = Field(
        default_factory=list,
        description="Detailed cycle information.",
    )
    dangling_nodes: List[DanglingNodeItem] = Field(
        default_factory=list,
        description="Detailed dangling node information.",
    )
    calendar_discrepancies: List[CalendarDiscrepancyItem] = Field(
        default_factory=list,
        description="Detailed calendar discrepancy information.",
    )


class RemediationActionItem(BaseModel):
    """A single remediation action to apply.

    Attributes
    ----------
    action_type : str
        Type of action: 'DELETE_EDGE', 'ANCHOR_DANGLING', 'REMAP_CALENDAR'.
    target_id : str
        ID of the node or edge to act upon.
    parameters : dict
        Additional parameters for the action (e.g., anchor_parent_id,
        target_calendar_id).
    """
    action_type: str = Field(
        ...,
        description="'DELETE_EDGE', 'ANCHOR_DANGLING', or 'REMAP_CALENDAR'.",
    )
    target_id: str = Field(
        ...,
        description="ID of the node or edge to act upon.",
    )
    parameters: dict = Field(
        default_factory=dict,
        description="Additional parameters for the action.",
    )


class QuarantineRemediateRequest(BaseModel):
    """Request payload for applying remediation actions.

    Attributes
    ----------
    resolved_actions : List[RemediationActionItem]
        List of remediation actions to apply.
    """
    resolved_actions: List[RemediationActionItem] = Field(
        ...,
        description="List of remediation actions to apply.",
    )


class QuarantineRemediateResponse(BaseModel):
    """Response after applying remediation actions.

    Attributes
    ----------
    batch_id : UUID
        ID of the quarantine batch.
    validation_status : str
        Updated validation status (REMEDIATED if all issues resolved).
    remaining_cycles : int
        Number of cycles remaining after remediation.
    remaining_dangling : int
        Number of dangling nodes remaining after remediation.
    is_ready_to_commit : bool
        Whether the batch is ready to be committed to master.
    """
    batch_id: UUID = Field(..., description="ID of the quarantine batch.")
    validation_status: str = Field(
        ...,
        description="Updated validation status.",
    )
    remaining_cycles: int = Field(
        ...,
        description="Cycles remaining after remediation.",
    )
    remaining_dangling: int = Field(
        ...,
        description="Dangling nodes remaining after remediation.",
    )
    is_ready_to_commit: bool = Field(
        ...,
        description="Whether the batch is ready to commit.",
    )


class QuarantineCommitResponse(BaseModel):
    """Response after committing a quarantine batch to master.

    Attributes
    ----------
    batch_id : UUID
        ID of the committed batch.
    nodes_merged : int
        Number of nodes merged into the master schedule.
    edges_merged : int
        Number of dependency edges merged.
    audit_log_id : UUID
        ID of the ForensicAuditLog entry recording the merge.
    """
    batch_id: UUID = Field(..., description="ID of the committed batch.")
    nodes_merged: int = Field(
        ...,
        description="Number of nodes merged into master.",
    )
    edges_merged: int = Field(
        ...,
        description="Number of dependency edges merged.",
    )
    audit_log_id: UUID = Field(
        ...,
        description="ForensicAuditLog entry recording the merge.",
    )


class QuarantineBatchResponse(BaseModel):
    """Response representing a quarantine batch summary.

    Attributes
    ----------
    id : UUID
        Batch ID.
    source_filename : str
        Original filename.
    file_format : str
        File format.
    target_project_id : UUID
        Target project ID.
    validation_status : str
        Current validation status.
    cycle_count : int
        Number of cycles detected.
    dangling_node_count : int
        Number of dangling nodes detected.
    out_of_sequence_count : int
        Number of out-of-sequence activities.
    created_at : datetime
        When the batch was created.
    """
    id: UUID = Field(..., description="Batch ID.")
    source_filename: str = Field(..., description="Original filename.")
    file_format: str = Field(..., description="File format.")
    target_project_id: UUID = Field(..., description="Target project ID.")
    validation_status: str = Field(..., description="Current validation status.")
    cycle_count: int = Field(..., description="Number of cycles detected.")
    dangling_node_count: int = Field(
        ...,
        description="Number of dangling nodes detected.",
    )
    out_of_sequence_count: int = Field(
        ...,
        description="Number of out-of-sequence activities.",
    )
    created_at: datetime = Field(..., description="When the batch was created.")


class QuarantineAutoDecoupleResponse(BaseModel):
    """Response after automatically decoupling cycles in a quarantine batch.

    Attributes
    ----------
    batch_id : UUID
        ID of the quarantine batch.
    cycles_broken : int
        Number of cycles broken by the decoupling process.
    edges_severed : int
        Number of dependency edges severed.
    milestones_created : int
        Number of verification milestones created.
    remaining_cycles : int
        Number of cycles remaining after decoupling.
    validation_status : str
        Updated validation status of the batch.
    is_ready_to_commit : bool
        Whether the batch is ready to be committed to master.
    decoupling_details : dict
        Detailed information about the decoupling actions taken.
    """
    batch_id: UUID = Field(..., description="ID of the quarantine batch.")
    cycles_broken: int = Field(
        ...,
        description="Number of cycles broken.",
    )
    edges_severed: int = Field(
        ...,
        description="Number of dependency edges severed.",
    )
    milestones_created: int = Field(
        ...,
        description="Number of verification milestones created.",
    )
    remaining_cycles: int = Field(
        ...,
        description="Cycles remaining after decoupling.",
    )
    validation_status: str = Field(
        ...,
        description="Updated validation status.",
    )
    is_ready_to_commit: bool = Field(
        ...,
        description="Whether the batch is ready to commit.",
    )
    decoupling_details: dict = Field(
        default_factory=dict,
        description="Detailed decoupling action information.",
    )
