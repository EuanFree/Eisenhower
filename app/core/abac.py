"""Attribute-Based Access Control (ABAC) for classified node access.

This module implements an Attribute-Based Access Control (ABAC) system that enforces
security clearance policies on hierarchical nodes within the Eisenhower Portfolio
Management System. It is designed for defence and government projects where information
compartmentalisation is mandatory.

Core Concepts
~~~~~~~~~~~~~

**Security Classification Levels**

Nodes are assigned a security classification from a predefined hierarchy:

- ``OFFICIAL`` (Level 0) — Unrestricted public information.
- ``OFFICIAL_SENSITIVE`` (Level 1) — Sensitive but unclassified information.
- ``SECRET`` (Level 2) — Classified information requiring appropriate clearance.
- ``TOP_SECRET`` (Level 3) — Highest classification level requiring top-secret clearance.

A user can access a node only if their clearance level is greater than or equal to
the node's classification level.

**Caveats**

In addition to clearance levels, nodes may have caveats (e.g., ``NOFORN``,
``ORCON``, ``TS//SI``) that further restrict access. A user must possess ALL
caveats assigned to a node to gain access. Caveats are checked as a subset:
the node's caveats must be a subset of the user's caveats.

**Ghost-Node Masking**

When a user lacks clearance for a parent node but has clearance for some
descendant nodes, the system preserves the tree hierarchy by returning a
masked "ghost" representation of the classified node. The ghost node retains
structural information (ID, path, parent reference) but replaces all sensitive
data with ``[RESTRICTED]``. This ensures the tree structure remains navigable
while preventing unauthorized data disclosure.

Architecture
~~~~~~~~~~~~~

The module provides three layers of functionality:

1. **Clearance Checks** — Low-level functions for comparing clearance levels
   and caveats between users and nodes.

2. **Node Visibility** — Higher-level functions that combine clearance and
   caveat checks to determine overall node visibility.

3. **ABAC Filtering** — Batch processing functions that apply ABAC rules to
   entire node trees, creating ghost nodes where needed.

4. **FastAPI Dependencies** — Ready-to-use dependency injectors for
   enforcing ABAC rules in API endpoints.

Usage
~~~~~

The primary entry point for filtering node trees is :func:`apply_abac_filtering`.
For individual node checks, use :func:`is_node_visible`.

For FastAPI endpoints, use the dependency functions:

.. code-block:: python

    @router.get("/nodes/{node_id}")
    def get_node(
        node_id: str,
        user_clearance: SecurityClassification = Depends(get_user_clearance),
        db: Session = Depends(get_db),
    ):
        node = db.query(UniversalBreakdownNode).get(node_id)
        return check_node_access(node, user_clearance[0], user_clearance[1])

Security Considerations
~~~~~~~~~~~~~~~~~~~~~~~

- This module enforces access control at the application level. Database-level
  row security should also be implemented for defence-in-depth.
- Ghost nodes reveal the existence of classified content. For systems requiring
  complete deniability, consider filtering out classified nodes entirely.
- Caveat checking is case-sensitive. Ensure caveats are normalised at the
  data entry level.
"""
from typing import Any, Dict, List, Optional, Set

from app.models.models import SecurityClassification, UniversalBreakdownNode


# ============================================================================
# Clearance level hierarchy
# ============================================================================

CLEARANCE_LEVELS: Dict[SecurityClassification, int] = {
    SecurityClassification.OFFICIAL: 0,
    SecurityClassification.OFFICIAL_SENSITIVE: 1,
    SecurityClassification.SECRET: 2,
    SecurityClassification.TOP_SECRET: 3,
}
"""Mapping of security classification levels to numeric hierarchy values.

This dictionary defines the ordering of security classifications from lowest
(OFFICIAL = 0) to highest (TOP_SECRET = 3). Clearance checks compare these
numeric values to determine if a user's clearance is sufficient for a node's
classification.

The numeric values allow simple integer comparison: a user can access a node
if their clearance level number is greater than or equal to the node's
classification number.

Example
~~~~~~~

.. code-block:: python

    # A TOP_SECRET user (level 3) can access a SECRET node (level 2)
    user_level = CLEARANCE_LEVELS[SecurityClassification.TOP_SECRET]   # 3
    node_level = CLEARANCE_LEVELS[SecurityClassification.SECRET]       # 2
    has_access = user_level >= node_level  # True
"""


def has_sufficient_clearance(
    user_clearance: SecurityClassification,
    node_classification: SecurityClassification,
) -> bool:
    """Check if a user's clearance level is sufficient to access a classified node.

    This function performs the fundamental clearance comparison that underpins
    all ABAC decisions in the system. It converts both the user's clearance
    level and the node's classification into numeric values using the
    :data:`CLEARANCE_LEVELS` mapping, then compares them numerically.

    The clearance model follows a simple hierarchy: higher clearance levels
    grant access to lower-classified content. For example, a user with
    ``TOP_SECRET`` clearance (level 3) can access nodes classified as
    ``SECRET`` (level 2), ``OFFICIAL_SENSITIVE`` (level 1), or ``OFFICIAL``
    (level 0).

    Process Flow
    ~~~~~~~~~~~~

    1. Look up the numeric value for ``user_clearance`` in :data:`CLEARANCE_LEVELS`.
       If the clearance level is not found, default to ``0`` (OFFICIAL).
    2. Look up the numeric value for ``node_classification`` in :data:`CLEARANCE_LEVELS`.
       If the classification is not found, default to ``0`` (OFFICIAL).
    3. Return ``True`` if user level >= node level, otherwise ``False``.

    Args:
        user_clearance: The security clearance level of the authenticated user,
            represented as a :class:`SecurityClassification` enum value.
            Valid values are ``OFFICIAL``, ``OFFICIAL_SENSITIVE``, ``SECRET``,
            and ``TOP_SECRET``.
        node_classification: The security classification of the target node,
            represented as a :class:`SecurityClassification` enum value.
            This indicates the minimum clearance required to access the node.

    Returns:
        ``True`` if the user's clearance level is greater than or equal to
        the node's classification level, indicating the user has sufficient
        clearance to access the node. Returns ``False`` if the user's
        clearance is below the required level.

    Example
    ~~~~~~~

    .. code-block:: python

        from app.models.models import SecurityClassification
        from app.core.abac import has_sufficient_clearance

        # TOP_SECRET user accessing a SECRET node
        result = has_sufficient_clearance(
            SecurityClassification.TOP_SECRET,
            SecurityClassification.SECRET,
        )
        print(result)  # True

        # OFFICIAL user accessing a SECRET node
        result = has_sufficient_clearance(
            SecurityClassification.OFFICIAL,
            SecurityClassification.SECRET,
        )
        print(result)  # False
    """
    def _enum_level(val: Any) -> int:
        if val in CLEARANCE_LEVELS:
            return CLEARANCE_LEVELS[val]
        if isinstance(val, str):
            try:
                return CLEARANCE_LEVELS[SecurityClassification(val)]
            except ValueError:
                return 0
        return 0

    user_level = _enum_level(user_clearance)
    node_level = _enum_level(node_classification)
    return user_level >= node_level


def has_required_caveats(
    user_caveats: Optional[List[str]],
    node_caveats: Optional[List[str]],
) -> bool:
    """Check if a user possesses all the security caveats required to access a node.

    Security caveats are additional restrictions beyond the basic clearance level.
    Common caveats include:

    - ``NOFORN`` — Not releasable to foreign nationals.
    - ``ORCON`` — Originator-controlled distribution.
    - ``TS//SI`` — Top Secret/Sensitive Compartmented Information.
    - ``TS//SCI`` — Top Secret/Special Compartmented Information.
    - ``REL TO`` — Releasable only to specific countries or agencies.

    This function implements a subset check: the node's caveats must be a
    complete subset of the user's caveats. In other words, the user must hold
    EVERY caveat that the node requires. Having extra caveats beyond what the
    node requires does not cause a failure — it only matters that all required
    caveats are present.

    Process Flow
    ~~~~~~~~~~~~

    1. If ``node_caveats`` is ``None`` or empty, return ``True`` immediately.
       A node with no caveats imposes no additional restrictions beyond
       the clearance level check.
    2. If ``user_caveats`` is ``None`` or empty but the node requires caveats,
       return ``False`` — the user cannot satisfy any caveat requirement.
    3. Convert both lists to sets for efficient subset comparison.
    4. Return ``True`` if node caveats are a subset of user caveats,
       otherwise ``False``.

    Edge Cases
    ~~~~~~~~~~

    - **Empty node caveats**: Treated as "no additional restrictions"; any
      user with sufficient clearance passes this check.
    - **Empty user caveats**: If the node requires any caveats, a user with
      no caveats fails the check. If the node has no caveats, the user passes.
    - **Case sensitivity**: Caveat comparison is case-sensitive. ``NOFORN``
      and ``noforn`` are treated as different caveats. Ensure data entry
      normalises caveat strings to a consistent case.

    Args:
        user_caveats: A list of caveat strings that the authenticated user
            holds, or ``None`` if the user has no caveats. Each string
            represents a specific security caveat (e.g., ``"NOFORN"``).
        node_caveats: A list of caveat strings required to access the target
            node, or ``None`` if the node has no caveat requirements.
            Each string represents a specific security caveat that must be
            held by the accessing user.

    Returns:
        ``True`` if the user holds all caveats required by the node, meaning
        the node's caveat set is a subset of the user's caveat set. Returns
        ``False`` if the user is missing one or more required caveats.

    Example
    ~~~~~~~

    .. code-block:: python

        from app.core.abac import has_required_caveats

        # User has NOFORN and ORCON; node requires NOFORN only
        result = has_required_caveats(
            user_caveats=["NOFORN", "ORCON"],
            node_caveats=["NOFORN"],
        )
        print(result)  # True

        # User has NOFORN; node requires NOFORN and ORCON
        result = has_required_caveats(
            user_caveats=["NOFORN"],
            node_caveats=["NOFORN", "ORCON"],
        )
        print(result)  # False — user missing ORCON

        # Node has no caveats; user has no caveats
        result = has_required_caveats(
            user_caveats=[],
            node_caveats=[],
        )
        print(result)  # True — no restrictions
    """
    def _norm_caveats(c: Any) -> List[str]:
        if not c:
            return []
        if isinstance(c, list):
            return c
        if isinstance(c, str):
            stripped = c.strip("{}")
            return [x.strip(' "') for x in stripped.split(",") if x.strip(' "')]
        return list(c)

    node_caveats_list = _norm_caveats(node_caveats)
    user_caveats_list = _norm_caveats(user_caveats)

    # If node has no caveats, anyone with sufficient clearance can access
    if not node_caveats_list:
        return True

    # If user has no caveats but node requires some, deny access
    if not user_caveats_list:
        return False

    # Check if node caveats are a subset of user caveats
    user_caveat_set: Set[str] = set(user_caveats_list)
    node_caveat_set: Set[str] = set(node_caveats_list)
    return node_caveat_set.issubset(user_caveat_set)


def is_node_visible(
    user_clearance: SecurityClassification,
    user_caveats: Optional[List[str]],
    node: UniversalBreakdownNode,
) -> bool:
    """Determine if a node is fully visible to a user based on ABAC rules.

    This is the primary visibility check function that combines both clearance
    level and caveat checks into a single decision. A node is considered
    visible only when BOTH conditions are met:

    1. The user's clearance level is greater than or equal to the node's
       security classification (checked via :func:`has_sufficient_clearance`).
    2. The user holds all caveats required by the node (checked via
       :func:`has_required_caveats`).

    If either check fails, the node is not visible to the user. This function
    uses short-circuit evaluation: if the clearance check fails, the caveat
    check is not performed, as there is no need to continue.

    Process Flow
    ~~~~~~~~~~~~

    1. Call :func:`has_sufficient_clearance` with the user's clearance and
       the node's security classification.
    2. If clearance is insufficient, return ``False`` immediately.
    3. Call :func:`has_required_caveats` with the user's caveats and the
       node's caveats.
    4. If caveats are insufficient, return ``False``.
    5. If both checks pass, return ``True``.

    This function is used by :func:`apply_abac_filtering` to determine
    whether each node in a tree should be returned as a full node, a ghost
    node, or excluded entirely.

    Args:
        user_clearance: The security clearance level of the authenticated user,
            represented as a :class:`SecurityClassification` enum value.
            This determines the maximum classification level the user can access.
        user_caveats: A list of caveat strings that the authenticated user
            holds, or ``None`` if the user has no caveats. These are compared
            against the node's required caveats.
        node: The :class:`UniversalBreakdownNode` instance to check visibility for.
            This object contains the node's security classification and caveat
            requirements that are compared against the user's credentials.

    Returns:
        ``True`` if the node is fully visible to the user, meaning the user
        has both sufficient clearance level and all required caveats. Returns
        ``False`` if the user lacks either the required clearance level or
        one or more required caveats.

    Example
    ~~~~~~~

    .. code-block:: python

        from app.models.models import SecurityClassification, UniversalBreakdownNode
        from app.core.abac import is_node_visible

        # Create a mock node classified as SECRET with NOFORN caveat
        node = UniversalBreakdownNode(
            security_classification=SecurityClassification.SECRET,
            caveats=["NOFORN"],
        )

        # TOP_SECRET user with NOFORN caveat — should see the node
        result = is_node_visible(
            user_clearance=SecurityClassification.TOP_SECRET,
            user_caveats=["NOFORN"],
            node=node,
        )
        print(result)  # True

        # SECRET user without NOFORN caveat — should NOT see the node
        result = is_node_visible(
            user_clearance=SecurityClassification.SECRET,
            user_caveats=[],
            node=node,
        )
        print(result)  # False — missing NOFORN caveat
    """
    # Check clearance level first — short-circuit if insufficient
    if not has_sufficient_clearance(user_clearance, node.security_classification):
        return False

    # Check caveats — only reached if clearance is sufficient
    if not has_required_caveats(user_caveats, node.caveats):
        return False

    return True


# ============================================================================
# Ghost-Node masking for hierarchy preservation
# ============================================================================

def create_ghost_node(
    node: UniversalBreakdownNode,
) -> Dict[str, Any]:
    """Create a masked 'ghost' representation of a classified node for hierarchy preservation.

    When a user lacks the security clearance to view a node's content but has
    clearance to view some of its descendant nodes, the system cannot simply
    remove the classified node from the tree — doing so would break the
    hierarchical structure and make descendant nodes appear as orphans.

    Instead, this function creates a "ghost" node that preserves the structural
    information (ID, parent reference, tree path, and type) while replacing
    all sensitive content with the placeholder string ``[RESTRICTED]``. The
    ghost node includes an ``is_masked: True`` flag so the frontend can render
    it differently (e.g., greyed out with a lock icon).

    Fields Preserved in Ghost Nodes
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    The following fields are preserved to maintain tree structure:

    - ``id`` — Unique identifier for the node.
    - ``parent_id`` — Reference to the parent node, or ``None`` for root nodes.
    - ``tree_type`` — Type of the tree (WBS, RBS, LBS, etc.).
    - ``path`` — Hierarchical path string for tree navigation.
    - ``is_active`` — Whether the node is active (structural, not sensitive).
    - ``created_at`` / ``updated_at`` — Timestamps (metadata, not content).

    Fields Masked in Ghost Nodes
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~

    The following fields are replaced with ``[RESTRICTED]``:

    - ``code`` — Node code/identifier.
    - ``name`` — Human-readable node name.
    - ``security_classification`` — Classification level.
    - ``caveats`` — Security caveats.
    - ``custom_attributes`` — Any custom attributes.
    - All node-specific fields (delivery mode, dates, percent complete, etc.).

    Process Flow
    ~~~~~~~~~~~~

    1. Create a base dictionary with structural fields from the node.
    2. Replace all sensitive content fields with ``[RESTRICTED]``.
    3. Set ``is_masked`` to ``True`` to flag this as a ghost node.
    4. Check for node-specific fields using ``hasattr`` and mask them if present.
       This handles different node types (portfolio, resource, location) that
       have additional fields beyond the base UniversalBreakdownNode.
    5. Return the ghost dictionary.

    Args:
        node: The :class:`UniversalBreakdownNode` instance to mask. This node
            exists in the database and has sensitive content that the current
            user is not authorised to view, but its descendants may be visible.

    Returns:
        A dictionary representing the masked ghost node. The dictionary contains
        the same keys as a full node representation (from :func:`node_to_dict`),
        but all sensitive values are replaced with ``[RESTRICTED]``. The key
        ``is_masked`` is set to ``True`` to indicate this is a ghost node.

    Example
    ~~~~~~~

    .. code-block:: python

        from app.models.models import UniversalBreakdownNode
        from app.core.abac import create_ghost_node

        # Create a mock classified node
        node = UniversalBreakdownNode(
            id="abc123",
            code="A1.2",
            name="Classified Subsystem",
            path="1.A1.A1.2",
        )

        ghost = create_ghost_node(node)
        print(ghost["code"])       # "[RESTRICTED]"
        print(ghost["name"])       # "[RESTRICTED]"
        print(ghost["id"])         # "abc123" (preserved)
        print(ghost["is_masked"])  # True
    """
    # Get the base attributes from the node
    ghost: Dict[str, Any] = {
        "id": str(node.id),
        "parent_id": str(node.parent_id) if node.parent_id else None,
        "tree_type": (node.tree_type.value if hasattr(node.tree_type, "value") else str(node.tree_type)) if node.tree_type else None,
        "code": "[RESTRICTED]",
        "name": "[RESTRICTED]",
        "path": node.path,  # Keep path for tree structure
        "security_classification": "[RESTRICTED]",
        "caveats": "[RESTRICTED]",
        "odac_permissions": None,
        "custom_attributes": "[RESTRICTED]",
        "is_active": node.is_active,
        "is_masked": True,  # Flag indicating this is a masked node
        "created_at": (node.created_at.isoformat() if hasattr(node.created_at, "isoformat") else str(node.created_at)) if node.created_at else None,
        "updated_at": (node.updated_at.isoformat() if hasattr(node.updated_at, "isoformat") else str(node.updated_at)) if node.updated_at else None,
    }

    # Add node-specific fields if they exist (for different node types)
    if hasattr(node, 'delivery_mode'):
        ghost["delivery_mode"] = "[RESTRICTED]"
    if hasattr(node, 'planned_start_date'):
        ghost["planned_start_date"] = "[RESTRICTED]"
    if hasattr(node, 'planned_end_date'):
        ghost["planned_end_date"] = "[RESTRICTED]"
    if hasattr(node, 'percent_complete'):
        ghost["percent_complete"] = "[RESTRICTED]"
    if hasattr(node, 'resource_type'):
        ghost["resource_type"] = "[RESTRICTED]"
    if hasattr(node, 'tier'):
        ghost["tier"] = "[RESTRICTED]"

    return ghost


def apply_abac_filtering(
    nodes: List[UniversalBreakdownNode],
    user_clearance: SecurityClassification,
    user_caveats: Optional[List[str]],
) -> List[Any]:
    """Apply ABAC filtering to an entire list of nodes, producing a visibility-aware result.

    This is the main entry point for filtering node trees based on a user's
    security credentials. It processes a flat list of nodes and returns a
    filtered list where each node is represented according to the user's
    access level:

    - **Full visibility**: If the user has sufficient clearance and all required
      caveats, the node is returned as a complete dictionary with all fields.
    - **Partial visibility (ghost node)**: If the user lacks access to the node
      but has access to at least one descendant, a masked "ghost" representation
      is returned to preserve the tree structure.
    - **No visibility**: If the user has no access to the node or any of its
      descendants, the node is excluded from the results entirely.

    Process Flow
    ~~~~~~~~~~~~

    1. **Build children map**: Construct a dictionary mapping each parent ID to
       its list of child nodes. This enables efficient traversal of the tree
       hierarchy without additional database queries.

    2. **Define descendant visibility check**: Create a nested recursive function
       ``has_visible_descendants`` that determines whether a node has any
       visible descendants (direct children or deeper descendants).

    3. **Process each node**: Iterate through the input node list and apply the
       filtering logic:

       a. Check if the node is fully visible using :func:`is_node_visible`.
          If yes, convert it to a dictionary using :func:`node_to_dict` and
          add to results.

       b. If not fully visible, check if the node has any visible descendants
          using ``has_visible_descendants``. If yes, create a ghost node using
          :func:`create_ghost_node` and add to results.

       c. If neither condition is met, exclude the node from results.

    4. Return the filtered list of node dictionaries.

    Performance Considerations
    ~~~~~~~~~~~~~~~~~~~~~~~~~~

    - The children map is built once and reused for all descendant checks.
    - The ``has_visible_descendants`` function uses short-circuit evaluation:
      it returns ``True`` as soon as it finds the first visible descendant,
      avoiding unnecessary traversal.
    - For very large trees (thousands of nodes), consider caching results
      or using database-level filtering to reduce the initial node list.

    Args:
        nodes: A list of :class:`UniversalBreakdownNode` instances to filter.
            This should represent a complete tree or subtree, including all
            ancestor and descendant relationships. The list is typically
            retrieved from the database via a query that fetches all nodes
            under a specific root.
        user_clearance: The security clearance level of the authenticated user,
            represented as a :class:`SecurityClassification` enum value.
            This determines the maximum classification level the user can access.
        user_caveats: A list of caveat strings that the authenticated user
            holds, or ``None`` if the user has no caveats. These are compared
            against each node's required caveats.

    Returns:
        A list of dictionaries, where each dictionary represents a node.
        The list contains only nodes that are either fully visible to the
        user or have visible descendants (returned as ghost nodes). Nodes
        that are completely invisible to the user are excluded. Each
        dictionary has an ``is_masked`` key: ``False`` for full nodes,
        ``True`` for ghost nodes.

    Example
    ~~~~~~~

    .. code-block:: python

        from app.models.models import SecurityClassification
        from app.core.abac import apply_abac_filtering

        # Assume we have a tree of nodes fetched from the database
        nodes = db.query(UniversalBreakdownNode).all()

        # Filter for a SECRET user with NOFORN caveat
        filtered = apply_abac_filtering(
            nodes=nodes,
            user_clearance=SecurityClassification.SECRET,
            user_caveats=["NOFORN"],
        )

        for node in filtered:
            if node["is_masked"]:
                print(f"Ghost node: {node['id']}")
            else:
                print(f"Visible node: {node['name']}")
    """
    # Build a map of parent_id to children for determining visibility
    children_map: Dict[Optional[str], List[UniversalBreakdownNode]] = {}
    for node in nodes:
        parent_key = str(node.parent_id) if node.parent_id else None
        if parent_key not in children_map:
            children_map[parent_key] = []
        children_map[parent_key].append(node)

    # Determine which nodes have visible descendants
    def has_visible_descendants(node: UniversalBreakdownNode) -> bool:
        """Recursively check if a node has any visible descendants.

        This nested function has access to the closure variables
        ``children_map``, ``user_clearance``, and ``user_caveats``.

        Args:
            node: The node to check for visible descendants.

        Returns:
            ``True`` if the node has at least one visible descendant
            (direct child or deeper), ``False`` otherwise.
        """
        node_key = str(node.id)
        if node_key not in children_map:
            return False

        for child in children_map[node_key]:
            if is_node_visible(user_clearance, user_caveats, child):
                return True
            if has_visible_descendants(child):
                return True
        return False

    # Process each node and build the filtered result list
    result: List[Any] = []
    for node in nodes:
        if is_node_visible(user_clearance, user_caveats, node):
            # Full visibility — convert node to complete dictionary
            result.append(node_to_dict(node))
        elif has_visible_descendants(node):
            # Partial visibility — create ghost node to preserve structure
            result.append(create_ghost_node(node))
        # Else: no visibility — exclude from results entirely

    return result


def node_to_dict(node: UniversalBreakdownNode) -> Dict[str, Any]:
    """Convert a UniversalBreakdownNode ORM instance to a serializable dictionary.

    This function transforms a SQLAlchemy ORM model instance into a plain Python
    dictionary that can be serialised to JSON for API responses. It handles the
    polymorphic nature of the UniversalBreakdownNode model, which serves as a
    base class for different node types (portfolio, resource, location, etc.).

    The function uses ``hasattr`` checks to safely access node-specific fields
    that may not exist on all node types. This ensures the function works
    correctly regardless of the specific subclass of the node.

    Fields Included
    ~~~~~~~~~~~~~~~

    **Base fields** (always present):

    - ``id`` — Unique node identifier as a string.
    - ``parent_id`` — Parent node identifier as a string, or ``None`` for roots.
    - ``version_id`` — Version number for optimistic locking (defaults to 1).
    - ``tree_type`` — Type of tree (WBS, RBS, LBS, etc.) as a string value.
    - ``code`` — Node code/identifier string.
    - ``name`` — Human-readable node name.
    - ``path`` — Hierarchical path string for tree navigation.
    - ``security_classification`` — Classification level as a string value.
    - ``caveats`` — List of security caveat strings.
    - ``odac_permissions`` — Object-level access control permissions dictionary.
    - ``custom_attributes`` — Dictionary of custom key-value attributes.
    - ``is_active`` — Boolean indicating if the node is active.
    - ``is_masked`` — Always ``False`` for full nodes (``True`` for ghost nodes).
    - ``created_at`` — ISO 8601 timestamp string, or ``None``.
    - ``updated_at`` — ISO 8601 timestamp string, or ``None``.

    **Conditional fields** (present only if the node type has them):

    - ``delivery_mode`` — Delivery mode enum value (portfolio nodes).
    - ``planned_start_date`` — ISO 8601 planned start date (portfolio nodes).
    - ``planned_end_date`` — ISO 8601 planned end date (portfolio nodes).
    - ``actual_start_date`` — ISO 8601 actual start date (portfolio nodes).
    - ``actual_end_date`` — ISO 8601 actual end date (portfolio nodes).
    - ``percent_complete`` — Float percentage of completion (portfolio nodes).
    - ``pv`` — Planned Value for EVM calculations (portfolio nodes).
    - ``ev`` — Earned Value for EVM calculations (portfolio nodes).
    - ``ac`` — Actual Cost for EVM calculations (portfolio nodes).
    - ``resource_type`` — Resource type enum value (resource nodes).
    - ``standard_hourly_rate`` — Hourly rate for cost calculations (resource nodes).
    - ``is_generic_placeholder`` — Boolean for placeholder resources (resource nodes).
    - ``current_location_id`` — Current location reference (resource nodes).
    - ``tier`` — Location tier enum value (location nodes).
    - ``is_scif_or_tempest`` — Boolean for SCIF/TEMpest facilities (location nodes).
    - ``escort_required`` — Boolean for escort requirements (location nodes).

    Process Flow
    ~~~~~~~~~~~~

    1. Create a base dictionary with all common fields from the node.
    2. Convert enum values to their string representations using ``.value``.
    3. Convert datetime objects to ISO 8601 strings using ``.isoformat()``.
    4. Convert UUID fields to strings using ``str()``.
    5. Check for node-specific fields using ``hasattr`` and add them if present.
    6. Return the complete dictionary.

    Args:
        node: The :class:`UniversalBreakdownNode` ORM instance to convert.
            This can be any subclass of UniversalBreakdownNode (e.g.,
            PortfolioNode, ResourceNode, LocationNode). The function handles
            all subclasses by checking for the presence of type-specific fields.

    Returns:
        A dictionary containing all fields of the node, suitable for JSON
        serialisation and API responses. All enum values are converted to
        strings, all datetime objects are converted to ISO 8601 strings,
        and all UUID objects are converted to strings. The ``is_masked``
        key is always set to ``False`` for full node representations.

    Example
    ~~~~~~~

    .. code-block:: python

        from app.models.models import UniversalBreakdownNode
        from app.core.abac import node_to_dict

        # Convert a portfolio node to dictionary
        node = db.query(UniversalBreakdownNode).get(node_id)
        node_dict = node_to_dict(node)

        print(node_dict["name"])        # "Project Alpha"
        print(node_dict["is_masked"])   # False
        print(node_dict["percent_complete"])  # 75.5
    """
    def _val(v: Any) -> Any:
        if v is None:
            return None
        return v.value if hasattr(v, "value") else v

    def _iso(v: Any) -> Any:
        if v is None:
            return None
        return v.isoformat() if hasattr(v, "isoformat") else str(v)

    def _norm_caveats(c: Any) -> List[str]:
        if not c:
            return []
        if isinstance(c, list):
            return c
        if isinstance(c, str):
            stripped = c.strip("{}")
            return [x.strip(' "') for x in stripped.split(",") if x.strip(' "')]
        return list(c)

    node_dict: Dict[str, Any] = {
        "id": str(node.id),
        "parent_id": str(node.parent_id) if node.parent_id else None,
        "version_id": getattr(node, "version_id", 1),
        "tree_type": _val(node.tree_type),
        "code": node.code,
        "name": node.name,
        "path": node.path,
        "security_classification": _val(node.security_classification),
        "caveats": _norm_caveats(node.caveats),
        "odac_permissions": node.odac_permissions,
        "custom_attributes": node.custom_attributes,
        "is_active": node.is_active,
        "is_masked": False,  # Flag indicating this is not a masked node
        "created_at": _iso(node.created_at),
        "updated_at": _iso(node.updated_at),
    }

    # Add node-specific fields if they exist (for different node types)
    if hasattr(node, 'delivery_mode'):
        node_dict["delivery_mode"] = _val(node.delivery_mode)
    if hasattr(node, 'planned_start_date'):
        node_dict["planned_start_date"] = _iso(node.planned_start_date)
    if hasattr(node, 'planned_end_date'):
        node_dict["planned_end_date"] = _iso(node.planned_end_date)
    if hasattr(node, 'actual_start_date'):
        node_dict["actual_start_date"] = _iso(node.actual_start_date)
    if hasattr(node, 'actual_end_date'):
        node_dict["actual_end_date"] = _iso(node.actual_end_date)
    if hasattr(node, 'percent_complete'):
        node_dict["percent_complete"] = node.percent_complete
    if hasattr(node, 'pv'):
        node_dict["pv"] = node.pv
    if hasattr(node, 'ev'):
        node_dict["ev"] = node.ev
    if hasattr(node, 'ac'):
        node_dict["ac"] = node.ac
    if hasattr(node, 'resource_type'):
        node_dict["resource_type"] = _val(node.resource_type)
    if hasattr(node, 'standard_hourly_rate'):
        node_dict["standard_hourly_rate"] = node.standard_hourly_rate
    if hasattr(node, 'is_generic_placeholder'):
        node_dict["is_generic_placeholder"] = node.is_generic_placeholder
    if hasattr(node, 'current_location_id'):
        node_dict["current_location_id"] = str(node.current_location_id) if node.current_location_id else None
    if hasattr(node, 'tier'):
        node_dict["tier"] = _val(node.tier)
    if hasattr(node, 'is_scif_or_tempest'):
        node_dict["is_scif_or_tempest"] = node.is_scif_or_tempest
    if hasattr(node, 'escort_required'):
        node_dict["escort_required"] = node.escort_required

    # Extract CPM schedule metrics from custom_attributes.schedule if present
    custom_attrs = node.custom_attributes if isinstance(node.custom_attributes, dict) else {}
    schedule_attrs = custom_attrs.get("schedule", {}) if isinstance(custom_attrs.get("schedule"), dict) else {}
    node_dict["early_start"] = schedule_attrs.get("early_start", getattr(node, "early_start", None)) or node_dict.get("planned_start_date")
    node_dict["early_finish"] = schedule_attrs.get("early_finish", getattr(node, "early_finish", None)) or node_dict.get("planned_end_date")
    node_dict["late_start"] = schedule_attrs.get("late_start", getattr(node, "late_start", None)) or node_dict.get("planned_start_date")
    node_dict["late_finish"] = schedule_attrs.get("late_finish", getattr(node, "late_finish", None)) or node_dict.get("planned_end_date")
    node_dict["total_float"] = schedule_attrs.get("total_float", getattr(node, "total_float", None))
    node_dict["free_float"] = schedule_attrs.get("free_float", getattr(node, "free_float", None))
    node_dict["is_critical"] = schedule_attrs.get("is_critical", getattr(node, "is_critical", None))
    node_dict["blockers"] = custom_attrs.get("blockers", getattr(node, "blockers", []))

    return node_dict


# ============================================================================
# FastAPI dependency for ABAC checks
# ============================================================================

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import User
from app.utils.auth import get_current_user


def get_user_clearance(
    current_user: User = Depends(get_current_user),
) -> tuple:
    """Extract the authenticated user's clearance information for ABAC checks.

    This FastAPI dependency injector automatically retrieves the current
    authenticated user via :func:`app.utils.auth.get_current_user` and
    extracts their security clearance level and caveat list.

    It is designed to be used as a dependency in other ABAC-related
    dependencies, providing a convenient way to access the user's
    security credentials without repeating the authentication logic.

    Process Flow
    ~~~~~~~~~~~~

    1. FastAPI calls :func:`app.utils.auth.get_current_user` to authenticate
       the user from the JWT token in the request.
    2. Extract the ``clearance_level`` attribute from the User model.
    3. Extract the ``caveats`` attribute from the User model.
    4. Return both values as a tuple.

    Usage
    ~~~~~

    This function is typically used as a sub-dependency in other ABAC
    checks, such as :func:`require_clearance`.

    .. code-block:: python

        @router.get("/classified-data")
        def get_data(
            clearance_info: tuple = Depends(get_user_clearance),
        ):
            user_clearance, user_caveats = clearance_info
            # Use clearance_info for ABAC checks

    Args:
        current_user: The authenticated :class:`app.models.models.User` instance,
            automatically injected by FastAPI via the
            :func:`app.utils.auth.get_current_user` dependency. This user
            must have a valid JWT token and sufficient clearance to access
            the endpoint.

    Returns:
        A tuple of two elements:

        - ``SecurityClassification``: The user's security clearance level.
        - ``Optional[List[str]]``: A list of caveat strings the user holds,
          or ``None`` if the user has no caveats.

    Raises:
        HTTPException: If the user is not authenticated (raised by the
            underlying :func:`app.utils.auth.get_current_user` dependency).
    """
    return current_user.clearance_level, current_user.caveats


def require_clearance(
    min_clearance: SecurityClassification,
    user_clearance: SecurityClassification,
    user_caveats: Optional[List[str]] = Depends(get_user_clearance),
):
    """FastAPI dependency that enforces a minimum security clearance level.

    This dependency can be injected into any FastAPI endpoint to ensure
    that the requesting user has at least the specified minimum clearance
    level before the endpoint logic is executed. If the user's clearance
    is insufficient, the request is rejected with an HTTP 403 Forbidden
    response.

    Note that this function checks only the clearance level, not caveats.
    For full ABAC checks including caveats, use :func:`check_node_access`
    instead.

    Process Flow
    ~~~~~~~~~~~~

    1. Compare the user's clearance level against the minimum required
       clearance using :func:`has_sufficient_clearance`.
    2. If the user's clearance is sufficient, the dependency passes and
       the endpoint continues execution.
    3. If the user's clearance is insufficient, raise an HTTP 403 error
       with a descriptive message.

    Usage
    ~~~~~

    .. code-block:: python

        from app.models.models import SecurityClassification
        from app.core.abac import require_clearance

        @router.get("/secret-data")
        def get_secret_data(
            _=Depends(require_clearance(SecurityClassification.SECRET)),
        ):
            return {"data": "classified"}

    Args:
        min_clearance: The minimum :class:`SecurityClassification` level
            required to access the protected resource. Users with a clearance
            level equal to or higher than this value will be granted access.
        user_clearance: The authenticated user's :class:`SecurityClassification`
            level, automatically injected by FastAPI. This is compared against
            ``min_clearance`` to determine access.
        user_caveats: The authenticated user's list of caveat strings,
            automatically injected by FastAPI via :func:`get_user_clearance`.
            Note: caveats are not checked by this function; only the clearance
            level is enforced.

    Raises:
        HTTPException: If the user's clearance level is below the minimum
            required level. The exception has status code 403 (Forbidden)
            and the detail message "Insufficient security clearance for
            this resource".
    """
    if not has_sufficient_clearance(user_clearance, min_clearance):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient security clearance for this resource"
        )


def check_node_access(
    node: UniversalBreakdownNode,
    user_clearance: SecurityClassification,
    user_caveats: Optional[List[str]],
) -> UniversalBreakdownNode:
    """FastAPI dependency that checks access to a specific node using full ABAC rules.

    This dependency performs a complete ABAC check on a single node, including
    both clearance level and caveat verification. It is designed to be used
    after fetching a node from the database, ensuring that the requesting
    user has full access to the node before the endpoint returns its data.

    Unlike :func:`require_clearance`, which checks only the clearance level,
    this function checks both clearance and caveats via :func:`is_node_visible`.

    Process Flow
    ~~~~~~~~~~~~

    1. Call :func:`is_node_visible` with the user's clearance, caveats, and
       the target node.
    2. If the node is visible to the user, return the node object unchanged.
       The endpoint can then safely access and return the node's data.
    3. If the node is not visible to the user, raise an HTTP 403 error.

    Usage
    ~~~~~

    .. code-block:: python

        from app.core.abac import check_node_access

        @router.get("/nodes/{node_id}")
        def get_node(
            node_id: str,
            node: UniversalBreakdownNode = Depends(check_node_access),
            db: Session = Depends(get_db),
        ):
            return node

    Args:
        node: The :class:`UniversalBreakdownNode` instance to check access for.
            This node is typically fetched from the database using the node ID
            from the request path. Its security classification and caveats are
            compared against the user's credentials.
        user_clearance: The authenticated user's :class:`SecurityClassification`
            level. This is compared against the node's security classification
            to determine if the user has sufficient clearance.
        user_caveats: A list of caveat strings that the authenticated user
            holds, or ``None`` if the user has no caveats. These are compared
            against the node's required caveats.

    Returns:
        The original :class:`UniversalBreakdownNode` instance if access is
        granted. The node is returned unchanged, allowing the endpoint to
        proceed with normal processing.

    Raises:
        HTTPException: If the user lacks access to the node (either insufficient
            clearance level or missing required caveats). The exception has
            status code 403 (Forbidden) and the detail message "Insufficient
            security clearance for this resource".
    """
    if not is_node_visible(user_clearance, user_caveats, node):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient security clearance for this resource"
        )
    return node
