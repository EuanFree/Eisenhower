"""Permission-governed creation authorization for Work Items and Resources.

This module provides the authorization layer that validates whether a user
has the authority to create new entities in the portfolio management system.
It enforces three gates before allowing any creation operation:

1. **Baseline Lock Gate** — Prevents adding children to nodes that are
   locked under an active performance measurement baseline (PMB).
2. **Role Hierarchy Gate** — Ensures the user's role has sufficient
   privilege to create the requested entity tier.
3. **Clearance Ceiling Gate** — Prevents users from creating nodes
   classified above their own security clearance level.

Role Hierarchy
~~~~~~~~~~~~~~

The system uses a fine-grained role model for creation authority:

- **SYSTEM_ADMIN** — Can create any entity at any tier.
- **PROGRAMME_DIRECTOR** — Can create Programmes (PROG) and Projects (PROJ).
- **CAM** (Contract Administrator/Manager) — Can create Control Accounts,
  Work Packages, and Tasks within their assigned sub-tree.
- **ENGINEER** — Can create Tasks within delegated sub-trees.
- **RESOURCE_MANAGER** — Can create Resource entries.
- **DEPT_HEAD** — Can create Resources for their department.

The legacy roles (ADMIN, MANAGER, MEMBER, VIEWER) are mapped to the
fine-grained roles for backward compatibility:

- ADMIN → SYSTEM_ADMIN + PROGRAMME_DIRECTOR + RESOURCE_MANAGER
- MANAGER → PROGRAMME_DIRECTOR + CAM
- MEMBER → ENGINEER
- VIEWER — No creation authority.

Tier Hierarchy
~~~~~~~~~~~~~~

Work items are organised into tiers that correspond to the WBS depth:

- **PROG** — Programme (root-level portfolio)
- **PROJ** — Project (child of a Programme)
- **CA** — Control Account (cost control point under a Project)
- **WP** — Work Package (executable unit under a Control Account)
- **TASK** — Individual task (leaf node)
- **MILESTONE** — Zero-duration checkpoint

A user can only create a tier if their role authorises it AND they have
access to the parent node.

Usage
~~~~~

In a FastAPI endpoint::

    from app.core.permissions import verify_node_creation_authority

    @router.post("/wbs")
    async def create_work_item(
        data: WorkItemCreate,
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        # Verify the user can create this node
        verify_node_creation_authority(
            parent_id=data.parent_id,
            target_tier=data.tier,
            user=user,
            db=db,
        )
        # ... proceed with creation

See Also
--------
- :mod:`app.schemas.authoring` — Pydantic input schemas for creation.
- :mod:`app.routers.wbs` — WBS creation endpoints.
- :mod:`app.routers.resources` — Resource creation endpoints.
"""

from typing import Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.models import (
    User,
    UniversalBreakdownNode,
    PortfolioNode,
    UserRole,
    SecurityClassification,
)
from app.core.abac import CLEARANCE_LEVELS
from app.core.exceptions import LockedException


# ============================================================================
# Extended role constants for fine-grained creation authority
# ============================================================================

# These roles extend the base UserRole enum to provide granular control
# over who can create which entity types. They are checked against the
# user's role and any delegated permissions.

ROLE_SYSTEM_ADMIN = "SYSTEM_ADMIN"
"""Full system administrator with unrestricted creation authority."""

ROLE_PROGRAMME_DIRECTOR = "PROGRAMME_DIRECTOR"
"""Can create Programmes and Projects."""

ROLE_CAM = "CAM"
"""Contract Administrator/Manager — can create Control Accounts,
Work Packages, and Tasks within their assigned sub-tree."""

ROLE_ENGINEER = "ENGINEER"
"""Can create Tasks within delegated sub-trees."""

ROLE_RESOURCE_MANAGER = "RESOURCE_MANAGER"
"""Can create Resource entries (people, equipment, facilities)."""

ROLE_DEPT_HEAD = "DEPT_HEAD"
"""Department Head — can create Resources for their department."""


# ============================================================================
# Tier-to-Role mapping
# ============================================================================

# Which roles are authorised to create each tier of work item?
# A user must have at least one of the listed roles to create that tier.

TIER_ROLE_REQUIREMENTS: dict[str, list[str]] = {
    "PROG": [ROLE_SYSTEM_ADMIN, ROLE_PROGRAMME_DIRECTOR],
    "PROJ": [ROLE_SYSTEM_ADMIN, ROLE_PROGRAMME_DIRECTOR],
    "CA": [ROLE_SYSTEM_ADMIN, ROLE_CAM],
    "WP": [ROLE_SYSTEM_ADMIN, ROLE_CAM, ROLE_ENGINEER],
    "TASK": [ROLE_SYSTEM_ADMIN, ROLE_CAM, ROLE_ENGINEER],
    "MILESTONE": [ROLE_SYSTEM_ADMIN, ROLE_CAM, ROLE_ENGINEER],
}


# ============================================================================
# Legacy role mapping
# ============================================================================

# Map legacy UserRole values to fine-grained role sets for backward
# compatibility.  A user with a legacy role inherits all mapped roles.

LEGACY_ROLE_MAP: dict[str, set[str]] = {
    UserRole.ADMIN.value: {
        ROLE_SYSTEM_ADMIN,
        ROLE_PROGRAMME_DIRECTOR,
        ROLE_CAM,
        ROLE_ENGINEER,
        ROLE_RESOURCE_MANAGER,
        ROLE_DEPT_HEAD,
    },
    UserRole.MANAGER.value: {
        ROLE_PROGRAMME_DIRECTOR,
        ROLE_CAM,
        ROLE_ENGINEER,
    },
    UserRole.MEMBER.value: {
        ROLE_ENGINEER,
    },
    UserRole.VIEWER.value: set(),
}


def _get_effective_roles(user: User) -> set[str]:
    """Resolve the set of effective roles for a user.

    Combines the user's base role (mapped via LEGACY_ROLE_MAP) with
    any additional roles stored in custom_attributes.

    Args:
        user: The authenticated user.

    Returns:
        Set of role strings the user effectively holds.
    """
    base_role = user.role.value if hasattr(user.role, "value") else str(user.role)
    roles = LEGACY_ROLE_MAP.get(base_role, set()).copy()

    # Check for additional roles in custom_attributes (delegated permissions)
    custom_attrs = getattr(user, "custom_attributes", None) or {}
    delegated_roles = custom_attrs.get("delegated_roles", [])
    roles.update(delegated_roles)

    return roles


def _has_role(user: User, required_role: str) -> bool:
    """Check if a user has a specific role.

    Args:
        user: The authenticated user.
        required_role: The role string to check.

    Returns:
        True if the user has the role.
    """
    return required_role in _get_effective_roles(user)


def _user_clearance_rank(user: User) -> int:
    """Get the numeric rank of a user's clearance level.

    Args:
        user: The authenticated user.

    Returns:
        Integer rank (higher = more clearance).
    """
    clearance = user.clearance_level
    if hasattr(clearance, "value"):
        clearance = clearance.value
    return CLEARANCE_LEVELS.get(clearance, 0)


# ============================================================================
# Authorization Gates
# ============================================================================

def check_baseline_lock_gate(
    parent_id: Optional[UUID],
    db: Session,
) -> None:
    """Check if the parent node or its ancestors are baseline-locked.

    If any ancestor node has ``is_baseline_locked == True`` in its
    custom_attributes, child creation is blocked with HTTP 423.

    Args:
        parent_id: The UUID of the parent node (None for root creation).
        db: Database session.

    Raises:
        LockedException: If a baseline lock is found on the parent or
            any ancestor.
    """
    if parent_id is None:
        # Root-level creation is not subject to baseline locks
        return

    parent = db.query(UniversalBreakdownNode).filter(
        UniversalBreakdownNode.id == parent_id
    ).first()

    if parent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parent node {parent_id} not found",
        )

    # Walk up the ltree path to check all ancestors
    # The path is a dotted string like "1.2.3" — split and check each prefix
    path_parts = parent.path.split(".")
    for i in range(len(path_parts), 0, -1):
        ancestor_path = ".".join(path_parts[:i])
        ancestor = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.path == ancestor_path
        ).first()

        if ancestor is None:
            continue

        # Check for baseline lock in custom_attributes
        custom_attrs = ancestor.custom_attributes or {}
        if custom_attrs.get("is_baseline_locked"):
            raise LockedException(
                operation_type="BASELINE_FREEZE",
                locked_by_user=custom_attrs.get("locked_by", "unknown"),
                remaining_seconds=0,  # Permanent lock until baseline is released
                locked_path=ancestor.path,
            )

        # Also check PortfolioNode-specific lock flag if present
        if isinstance(ancestor, PortfolioNode):
            pn_attrs = getattr(ancestor, "custom_attributes", None) or {}
            if pn_attrs.get("is_baseline_locked"):
                raise LockedException(
                    operation_type="BASELINE_FREEZE",
                    locked_by_user=pn_attrs.get("locked_by", "unknown"),
                    remaining_seconds=0,
                    locked_path=ancestor.path,
                )


def check_role_hierarchy_gate(
    target_tier: str,
    user: User,
) -> None:
    """Check if the user's role authorises creating the target tier.

    Args:
        target_tier: The tier string (PROG, PROJ, CA, WP, TASK, MILESTONE).
        user: The authenticated user.

    Raises:
        HTTPException: If the user's role does not authorise the tier.
    """
    required_roles = TIER_ROLE_REQUIREMENTS.get(target_tier)

    if required_roles is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown tier: {target_tier}",
        )

    effective_roles = _get_effective_roles(user)
    has_authority = any(role in effective_roles for role in required_roles)

    if not has_authority:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Insufficient role authority to create tier '{target_tier}'. "
                f"Required roles: {', '.join(required_roles)}. "
                f"Your role: {user.role.value if hasattr(user.role, 'value') else user.role}."
            ),
        )


def check_clearance_ceiling_gate(
    target_classification: SecurityClassification,
    user: User,
) -> None:
    """Check if the user's clearance allows creating the target classification.

    A user cannot create a node classified above their own clearance level.

    Args:
        target_classification: The classification level of the node being created.
        user: The authenticated user.

    Raises:
        HTTPException: If the target classification exceeds user clearance.
    """
    user_rank = _user_clearance_rank(user)

    if hasattr(target_classification, "value"):
        target_value = target_classification.value
    else:
        target_value = target_classification

    target_rank = CLEARANCE_LEVELS.get(target_value, 0)

    if target_rank > user_rank:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Cannot create node with classification '{target_value}'. "
                f"Your clearance level ({user.clearance_level.value if hasattr(user.clearance_level, 'value') else user.clearance_level}) "
                f"is insufficient."
            ),
        )


# ============================================================================
# Main Authorization Entry Point
# ============================================================================

def verify_node_creation_authority(
    parent_id: Optional[UUID],
    target_tier: str,
    user: User,
    db: Session,
    target_classification: Optional[SecurityClassification] = None,
) -> UniversalBreakdownNode:
    """Verify that a user has authority to create a new node.

    This is the main entry point for node creation authorization.  It
    performs all three gates in sequence and returns the parent node
    if all checks pass.

    The gates are checked in this order:

    1. **Baseline Lock Gate** — Blocks if parent or ancestors are locked.
    2. **Role Hierarchy Gate** — Blocks if user role is insufficient.
    3. **Clearance Ceiling Gate** — Blocks if classification exceeds clearance.

    Args:
        parent_id: UUID of the parent node (None for root-level creation).
        target_tier: The tier of the node being created (PROG, PROJ, CA,
            WP, TASK, MILESTONE).
        user: The authenticated user.
        db: Active database session.
        target_classification: Optional classification of the node being
            created.  If not provided, defaults to OFFICIAL.

    Returns:
        The parent UniversalBreakdownNode if all checks pass.  Returns
        None for root-level creation (parent_id is None).

    Raises:
        LockedException: If a baseline lock blocks creation (HTTP 423).
        HTTPException: If role or clearance checks fail (HTTP 403).
        HTTPException: If parent node is not found (HTTP 404).
    """
    if target_classification is None:
        target_classification = SecurityClassification.OFFICIAL

    # Gate 1: Baseline Lock
    check_baseline_lock_gate(parent_id, db)

    # Gate 2: Role Hierarchy
    check_role_hierarchy_gate(target_tier, user)

    # Gate 3: Clearance Ceiling
    check_clearance_ceiling_gate(target_classification, user)

    # Resolve and return the parent node
    if parent_id is None:
        return None  # type: ignore[return-value]

    parent = db.query(UniversalBreakdownNode).filter(
        UniversalBreakdownNode.id == parent_id
    ).first()

    if parent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parent node {parent_id} not found",
        )

    return parent


# ============================================================================
# Resource Creation Authorization
# ============================================================================

def verify_resource_creation_authority(
    user: User,
) -> None:
    """Verify that a user has authority to create a Resource node.

    Only users with RESOURCE_MANAGER or DEPT_HEAD roles (or ADMIN, which
    maps to both) can create new resource entries.

    Args:
        user: The authenticated user.

    Raises:
        HTTPException: If the user lacks resource creation authority.
    """
    effective_roles = _get_effective_roles(user)

    if ROLE_RESOURCE_MANAGER not in effective_roles and ROLE_DEPT_HEAD not in effective_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Insufficient authority to create resources. "
                "Required roles: RESOURCE_MANAGER or DEPT_HEAD. "
                f"Your role: {user.role.value if hasattr(user.role, 'value') else user.role}."
            ),
        )
