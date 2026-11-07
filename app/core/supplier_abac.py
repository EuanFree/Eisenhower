"""Supplier Portal ABAC Filter — Subcontractor boundary isolation.

This module enforces strict data isolation for external tier-1/tier-2
subcontractor users.  Subcontractors operate in a bounded tenant: they
can only see and mutate the specific work packages delegated to their
vendor CAGE code, with all parent programme hierarchies, sibling work
packages, and prime EVM cost rates completely masked.

Security Model
~~~~~~~~~~~~~~

A subcontractor user is identified by:

1. ``User.is_subcontractor_user == True`` — marks the account as external.
2. ``User.assigned_vendor_cage`` — the NATO/CAGE code of their vendor
   organisation (e.g., ``"3K9X2"``).

The filter works in two stages:

**Stage 1: Boundary Node Check**
A node is visible if its ``id`` matches an explicitly delegated boundary
node stored in the node's ``custom_attributes`` under the key
``"delegated_boundary"``.

**Stage 2: Vendor CAGE Code Match**
A node is visible if its ``custom_attributes`` contains a
``"vendor_cage_code"`` field matching the user's ``assigned_vendor_cage``.

All other nodes — including parent programme roots, sibling work packages,
and any node containing EVM cost data — are either excluded or returned
with sensitive fields redacted to ``'[RESTRICTED]'``.

Usage
~~~~~

.. code-block:: python

    from app.core.supplier_abac import filter_subcontractor_tasks, mask_prime_data

    # Get only the tasks this subcontractor can see
    visible_tasks = filter_subcontractor_tasks(db, user, all_tasks)

    # Mask EVM cost rates before returning to the supplier
    safe_task = mask_prime_data(task)

Key Functions
~~~~~~~~~~~~~

- :func:`is_subcontractor_user` — Quick check whether a user is external.
- :func:`filter_subcontractor_tasks` — Filter a list of nodes to only those
  the subcontractor can access.
- :func:`mask_prime_data` — Redact EVM cost rates and classified fields
  from a node before returning it to a subcontractor.
- :func:`get_subcontractor_boundary_nodes` — Query all nodes delegated to
  a specific vendor CAGE code.
- :func:`check_node_access` — Single-node access check for mutation endpoints.
"""
from sqlalchemy.orm import Session
from sqlalchemy import select
from typing import List, Optional, Dict, Any
from uuid import UUID

from app.models.models import (
    User,
    UniversalBreakdownNode,
    PortfolioNode,
)
from app.core.abac import (
    has_sufficient_clearance,
    has_required_caveats,
    node_to_dict,
)


def is_subcontractor_user(user: User) -> bool:
    """Check whether a user is an external subcontractor.

    Parameters
    ----------
    user : User
        The user to check.

    Returns
    -------
    bool
        True if the user is marked as a subcontractor tenant.
    """
    return bool(user.is_subcontractor_user)


def get_subcontractor_boundary_nodes(
    db: Session,
    vendor_cage_code: str,
) -> List[UniversalBreakdownNode]:
    """Query all nodes delegated to a specific vendor CAGE code.

    Searches for nodes whose ``custom_attributes`` contain a matching
    ``"vendor_cage_code"`` field.  This is the primary mechanism for
    determining which work packages a subcontractor can access.

    Parameters
    ----------
    db : Session
        Active database session.
    vendor_cage_code : str
        NATO/CAGE code of the vendor organisation.

    Returns
    -------
    list of UniversalBreakdownNode
        All nodes assigned to this vendor CAGE code.
    """
    # Query nodes where custom_attributes->>'vendor_cage_code' matches
    # Note: JSONB containment requires PostgreSQL; for SQLite fallback,
    # we load all active WBS nodes and filter in Python.
    stmt = select(UniversalBreakdownNode).where(
        UniversalBreakdownNode.is_active == True,
    )
    nodes = db.execute(stmt).scalars().all()

    result: List[UniversalBreakdownNode] = []
    for node in nodes:
        attrs = node.custom_attributes or {}
        node_cage = attrs.get("vendor_cage_code", "")
        if str(node_cage) == str(vendor_cage_code):
            result.append(node)

    return result


def check_node_access(
    user: User,
    node: UniversalBreakdownNode,
) -> bool:
    """Check whether a subcontractor user can access a specific node.

    For prime (non-subcontractor) users, this delegates to the standard
    ABAC clearance check.  For subcontractor users, the node must match
    either:

    1. The vendor CAGE code in ``custom_attributes.vendor_cage_code``.
    2. An explicit boundary delegation in ``custom_attributes.delegated_boundary``.

    Additionally, the user must have sufficient security clearance for
    the node's classification.

    Parameters
    ----------
    user : User
        The requesting user.
    node : UniversalBreakdownNode
        The node being accessed.

    Returns
    -------
    bool
        True if the user is authorised to access this node.
    """
    # Standard clearance check applies to everyone
    if not has_sufficient_clearance(user.clearance_level, node.security_classification):
        return False

    if not has_required_caveats(user.caveats, node.caveats):
        return False

    # Subcontractors face additional restrictions
    if is_subcontractor_user(user):
        if not user.assigned_vendor_cage:
            return False

        attrs = node.custom_attributes or {}

        # Check vendor CAGE code match
        node_cage = attrs.get("vendor_cage_code", "")
        if str(node_cage) == str(user.assigned_vendor_cage):
            return True

        # Check explicit boundary delegation
        delegated = attrs.get("delegated_boundary", [])
        if isinstance(delegated, list):
            if user.assigned_vendor_cage in [str(d) for d in delegated]:
                return True

        # Also check if this node's ID is in the user's delegated list
        # stored in custom_attributes
        delegated_ids = attrs.get("delegated_to_cages", [])
        if isinstance(delegated_ids, list):
            if user.assigned_vendor_cage in [str(d) for d in delegated_ids]:
                return True

        return False

    # Prime users pass the subcontractor gate
    return True


def filter_subcontractor_tasks(
    db: Session,
    user: User,
    nodes: Optional[List[UniversalBreakdownNode]] = None,
) -> List[UniversalBreakdownNode]:
    """Filter a list of nodes to only those accessible by a subcontractor.

    If ``nodes`` is None, queries all active WBS nodes from the database.

    Parameters
    ----------
    db : Session
        Active database session.
    user : User
        The subcontractor user.
    nodes : list of UniversalBreakdownNode or None
        Pre-fetched nodes to filter.  If None, all active nodes are loaded.

    Returns
    -------
    list of UniversalBreakdownNode
        Only the nodes the subcontractor can access.
    """
    if not is_subcontractor_user(user):
        return nodes or []

    if not user.assigned_vendor_cage:
        return []

    # Load nodes if not provided
    if nodes is None:
        boundary_nodes = get_subcontractor_boundary_nodes(db, user.assigned_vendor_cage)
        nodes = boundary_nodes

    # Filter by access check
    accessible: List[UniversalBreakdownNode] = []
    for node in nodes:
        if check_node_access(user, node):
            accessible.append(node)

    return accessible


def mask_prime_data(node: UniversalBreakdownNode) -> Dict[str, Any]:
    """Redact EVM cost rates and classified fields for subcontractor viewing.

    Subcontractors must never see prime contractor EVM cost data, including:

    - ``bac_cost`` — Budget at Completion
    - ``planned_value`` — Planned Value (PV)
    - ``earned_value`` — Earned Value (EV)
    - ``actual_cost`` — Actual Cost (AC)
    - ``pv``, ``ev``, ``ac`` — legacy EVM fields on PortfolioNode
    - ``odac_permissions`` — Owner-Delegated Access Control dictionary
    - Any ``custom_attributes`` containing cost rate information

    The node's core identity (code, name, path) is preserved so the
    subcontractor can reference it, but all financial data is replaced
    with ``'[RESTRICTED]'``.

    Parameters
    ----------
    node : UniversalBreakdownNode
        The node to mask.

    Returns
    -------
    dict
        A dictionary representation of the node with all prime-sensitive
        fields redacted.
    """
    data = node_to_dict(node)

    # Redact EVM cost fields
    evm_fields = [
        "bac_cost", "planned_value", "earned_value", "actual_cost",
        "pv", "ev", "ac",
    ]
    for field in evm_fields:
        if field in data:
            data[field] = "[RESTRICTED]"

    # Redact ODAC permissions
    data["odac_permissions"] = "[RESTRICTED]"

    # Redact cost-related custom attributes
    if data.get("custom_attributes"):
        attrs = dict(data["custom_attributes"])
        cost_keys = [
            "hourly_rate", "burdened_rate", "cost_per_unit",
            "total_cost", "budget", "rate_snapshot",
        ]
        for key in cost_keys:
            if key in attrs:
                attrs[key] = "[RESTRICTED]"
        data["custom_attributes"] = attrs

    return data


def mask_parent_hierarchy(
    node: UniversalBreakdownNode,
    user: User,
) -> Dict[str, Any]:
    """Mask parent programme hierarchy for subcontractor viewing.

    When a subcontractor queries a node, they must not see the full
    parent programme hierarchy.  This function returns a minimal
    representation of the node's path that reveals only the boundary
    node and below.

    Parameters
    ----------
    node : UniversalBreakdownNode
        The node being viewed.
    user : User
        The subcontractor user.

    Returns
    -------
    dict
        A dictionary with the node's path truncated to only show
        the boundary node and its descendants.
    """
    if not is_subcontractor_user(user):
        return node_to_dict(node)

    data = mask_prime_data(node)

    # Truncate the path to hide parent hierarchy
    if data.get("path"):
        path_parts = data["path"].split(".")
        # Keep only the last 2 levels (boundary node + current)
        if len(path_parts) > 2:
            data["path"] = ".".join(path_parts[-2:])
        data["path_masked"] = True

    return data


def get_subcontractor_accessible_nodes(
    db: Session,
    user: User,
) -> List[Dict[str, Any]]:
    """Get all nodes accessible to a subcontractor, with prime data masked.

    This is the primary entry point for the supplier portal's
    ``GET /tasks`` endpoint.  It returns a list of node dictionaries
    that are safe for subcontractor viewing.

    Parameters
    ----------
    db : Session
        Active database session.
    user : User
        The authenticated subcontractor user.

    Returns
    -------
    list of dict
        Masked node dictionaries safe for subcontractor viewing.
    """
    if not is_subcontractor_user(user):
        return []

    # Get boundary nodes for this vendor
    boundary_nodes = get_subcontractor_boundary_nodes(db, user.assigned_vendor_cage or "")

    # Also check for delegated boundary nodes
    stmt = select(UniversalBreakdownNode).where(
        UniversalBreakdownNode.is_active == True,
    )
    all_nodes = db.execute(stmt).scalars().all()

    # Combine boundary nodes with any nodes whose path is under a boundary
    accessible_ids = {n.id for n in boundary_nodes}
    boundary_paths = [n.path for n in boundary_nodes]

    for node in all_nodes:
        if node.id in accessible_ids:
            continue
        # Check if this node is a descendant of a boundary node
        for bpath in boundary_paths:
            if node.path.startswith(bpath + "."):
                accessible_ids.add(node.id)
                break

    # Build the result list with masking
    result: List[Dict[str, Any]] = []
    for node in all_nodes:
        if node.id in accessible_ids and check_node_access(user, node):
            masked = mask_parent_hierarchy(node, user)
            result.append(masked)

    return result
