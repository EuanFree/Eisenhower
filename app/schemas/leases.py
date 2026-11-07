"""Pydantic schemas for the sub-tree check-out lease API.

This module defines the request and response schemas for the check-out
lease lifecycle endpoints that manage exclusive write reservations on
ltree sub-trees.

Schema Naming Convention
------------------------
- ``...Request`` — Input schemas for POST endpoints.
- ``...Response`` — Output schemas returned by endpoints.
"""
from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import datetime


class CheckOutRequest(BaseModel):
    """Request payload for checking out a sub-tree.

    Attributes
    ----------
    node_id : UUID
        The root node of the sub-tree to check out.
    check_out_note : str or None
        Optional note explaining the purpose of the check-out
        (e.g., 'Drafting Month 11 Progress').
    """
    check_out_note: Optional[str] = Field(
        None,
        description="Optional note explaining the purpose of the check-out.",
        max_length=255,
    )


class CheckOutResponse(BaseModel):
    """Response after successfully checking out a sub-tree.

    Attributes
    ----------
    lease_id : UUID
        ID of the created lease record.
    lease_token : UUID
        Unique session token for heartbeat/check-in operations.
    ltree_scope_path : str
        The ltree path scope of the checked-out sub-tree.
    leased_at : datetime
        When the lease was acquired.
    expires_at : datetime
        When the lease will expire (120 minutes from leased_at).
    """
    lease_id: UUID = Field(..., description="ID of the created lease record.")
    lease_token: UUID = Field(
        ...,
        description="Unique session token for heartbeat/check-in.",
    )
    ltree_scope_path: str = Field(
        ...,
        description="Ltree path scope of the checked-out sub-tree.",
    )
    leased_at: datetime = Field(..., description="When the lease was acquired.")
    expires_at: datetime = Field(
        ...,
        description="When the lease will expire.",
    )


class HeartbeatResponse(BaseModel):
    """Response after extending a lease via heartbeat.

    Attributes
    ----------
    lease_token : UUID
        The lease token that was extended.
    new_expires_at : datetime
        The updated expiry timestamp.
    """
    lease_token: UUID = Field(..., description="The lease token extended.")
    new_expires_at: datetime = Field(
        ...,
        description="Updated expiry timestamp.",
    )


class CheckInResponse(BaseModel):
    """Response after checking in (releasing) a lease.

    Attributes
    ----------
    lease_token : UUID
        The lease token that was released.
    released_at : datetime
        When the lease was released.
    """
    lease_token: UUID = Field(..., description="The lease token released.")
    released_at: datetime = Field(..., description="When the lease was released.")


class ForceBreakResponse(BaseModel):
    """Response after force-breaking an abandoned lease.

    Attributes
    ----------
    lease_token : UUID
        The lease token that was broken.
    broken_at : datetime
        When the lease was force-broken.
    original_leased_by : str
        UPN of the user who originally held the lease.
    """
    lease_token: UUID = Field(..., description="The lease token broken.")
    broken_at: datetime = Field(..., description="When the lease was force-broken.")
    original_leased_by: str = Field(
        ...,
        description="UPN of the user who originally held the lease.",
    )


class LeaseInfoResponse(BaseModel):
    """Response representing an active lease's details.

    Attributes
    ----------
    lease_id : UUID
        Lease record ID.
    lease_token : UUID
        Session token.
    root_node_id : UUID
        Root node that was checked out.
    ltree_scope_path : str
        Ltree path scope.
    leased_by_user_id : UUID
        User who holds the lease.
    leased_by_user : str
        UPN of the user who holds the lease.
    leased_at : datetime
        When the lease was acquired.
    expires_at : datetime
        When the lease expires.
    check_out_note : str or None
        Optional note.
    is_active : bool
        Whether the lease is active.
    """
    lease_id: UUID = Field(..., description="Lease record ID.")
    lease_token: UUID = Field(..., description="Session token.")
    root_node_id: UUID = Field(..., description="Root node checked out.")
    ltree_scope_path: str = Field(..., description="Ltree path scope.")
    leased_by_user_id: UUID = Field(..., description="User who holds the lease.")
    leased_by_user: str = Field(..., description="UPN of the lease holder.")
    leased_at: datetime = Field(..., description="When the lease was acquired.")
    expires_at: datetime = Field(..., description="When the lease expires.")
    check_out_note: Optional[str] = Field(
        None,
        description="Optional note.",
    )
    is_active: bool = Field(..., description="Whether the lease is active.")
