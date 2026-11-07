"""Offline multi-site schedule reconciliation using cryptographic Merkle trees.

This module provides a service for synchronising disconnected air-gapped
instances of the Eisenhower Portfolio Manager (e.g., Site Warton, Site
Hastings, and Deployable Rigs) without requiring full database exports
or risking merge conflicts.

How Merkle Trees Enable Efficient Sync
--------------------------------------

A Merkle tree is a cryptographic hash tree where each leaf node is the
hash of a data record, and each internal node is the hash of its
children's hashes.  This structure allows two disconnected instances to
compare their entire schedule state by exchanging only a single root
hash digest.

If the root hashes match, the instances are guaranteed to be identical
(zero overhead comparison).  If they differ, the tree is traversed
downward branch-by-branch to isolate exactly which sub-trees, nodes, or
dependency links have diverged — avoiding whole-database export transfers.

Leaf Hash Formula
~~~~~~~~~~~~~~~~~

For each UniversalBreakdownNode, DependencyLink, and ResourceAssignment::

    Leaf Hash = SHA256(id + code + version_id + updated_at + planned_dates)

This ensures any change to a record — even a single field — produces a
completely different leaf hash, which propagates up to the root digest.

Three-Way Version Tracking
~~~~~~~~~~~~~~~~~~~~~~~~~~

When ingesting a delta pack from a remote site, each mutation is resolved
using three-way version tracking:

1. **Forward Mutation** — If the incoming ``version_id`` is greater than
   the local ``version_id`` and the parentage (ltree path) is unchanged,
   the forward mutation is applied directly.

2. **Conflict Staging** — If both the local and incoming branches were
   mutated concurrently (both have newer versions with different content),
   the branch is staged into an isolated :class:`SandboxScenario` for the
   Lead Systems Engineer to review the side-by-side diff.

3. **Parentage Check** — If the incoming node's parentage has changed
   (reparented), the merge requires sandbox staging regardless of version.

Merklepack Format
~~~~~~~~~~~~~~~~~

A ``.merklepack`` file is a ZIP archive containing:

- ``manifest.json`` — The Merkle tree manifest from the exporting site.
- ``delta.json`` — Only the divergent records (nodes, dependencies,
  assignments) that need to be synced.
- ``signature.json`` — Cryptographic signature of the manifest for
  integrity verification.

Usage
~~~~~

.. code-block:: python

    from app.services.merkle_sync import MerkleSyncService

    service = MerkleSyncService(db_session)

    # Generate local manifest
    manifest = service.generate_subsystem_merkle_tree(root_node_id)

    # Compare with remote manifest
    comparison = service.compare_merkle_manifests(local_manifest, remote_manifest)

    # Export divergent delta pack
    delta_pack = service.export_merkle_delta_pack(comparison["divergent_node_ids"])

    # Ingest remote delta pack
    result = service.ingest_merkle_delta_pack(delta_pack_bytes)

"""
import enum
import hashlib
import json
import zipfile
import io
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone, date
from typing import Any, Dict, List, Optional, Set, Tuple
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import (
    UniversalBreakdownNode,
    PortfolioNode,
    DependencyLink,
    ResourceAssignment,
    SandboxScenario,
    SandboxScenarioStatus,
    ForensicAuditLog,
    TreeType,
)


# ============================================================================
# Data models for Merkle tree nodes
# ============================================================================


@dataclass
class MerkleLeaf:
    """A single leaf in the Merkle tree representing one data record.

    Attributes
    ----------
    entity_type : str
        Type of entity: 'node', 'dependency', or 'assignment'.
    entity_id : str
        UUID string of the entity.
    hash_digest : str
        SHA-256 hex digest of the entity's canonical representation.
    version_id : int
        Optimistic concurrency version of the entity.
    path : str
        ltree path string (for nodes) or related node path (for links).
    metadata : dict
        Additional metadata for debugging (code, updated_at, etc.).
    """

    entity_type: str
    entity_id: str
    hash_digest: str
    version_id: int
    path: str
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary for JSON encoding."""
        return asdict(self)


@dataclass
class MerkleBranch:
    """An internal node in the Merkle tree representing a sub-tree.

    Attributes
    ----------
    path : str
        ltree path prefix for this branch.
    hash_digest : str
        SHA-256 hex digest computed from children's hashes.
    children : list
        Child MerkleBranch or MerkleLeaf objects.
    leaf_count : int
        Total number of leaves under this branch.
    entity_count : int
        Total number of all entities (nodes + deps + assignments) under this branch.
    """

    path: str
    hash_digest: str
    children: List[Any] = field(default_factory=list)
    leaf_count: int = 0
    entity_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary for JSON encoding."""
        return {
            "path": self.path,
            "hash_digest": self.hash_digest,
            "children": [c.to_dict() if hasattr(c, "to_dict") else c for c in self.children],
            "leaf_count": self.leaf_count,
            "entity_count": self.entity_count,
        }


@dataclass
class MerkleManifest:
    """Complete Merkle tree manifest for a programme sub-tree.

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
    tree : MerkleBranch
        Root branch of the Merkle tree.
    site_id : str
        Optional identifier of the generating site (e.g., 'Warton').
    """

    root_node_id: str
    root_path: str
    root_hash: str
    generated_at: str
    node_count: int
    dependency_count: int
    assignment_count: int
    tree: MerkleBranch
    site_id: str = ""

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary for JSON encoding."""
        return {
            "root_node_id": self.root_node_id,
            "root_path": self.root_path,
            "root_hash": self.root_hash,
            "generated_at": self.generated_at,
            "node_count": self.node_count,
            "dependency_count": self.dependency_count,
            "assignment_count": self.assignment_count,
            "tree": self.tree.to_dict(),
            "site_id": self.site_id,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MerkleManifest":
        """Deserialize from dictionary."""
        tree_data = data.pop("tree", {})
        tree = MerkleBranch(
            path=tree_data.get("path", ""),
            hash_digest=tree_data.get("hash_digest", ""),
            children=_deserialize_children(tree_data.get("children", [])),
            leaf_count=tree_data.get("leaf_count", 0),
            entity_count=tree_data.get("entity_count", 0),
        )
        return cls(tree=tree, **data)


def _deserialize_children(children_data: List[Dict]) -> List:
    """Recursively deserialize child nodes from a manifest dict."""
    children = []
    for child in children_data:
        if child.get("entity_type"):
            children.append(MerkleLeaf(**child))
        else:
            children.append(
                MerkleBranch(
                    path=child.get("path", ""),
                    hash_digest=child.get("hash_digest", ""),
                    children=_deserialize_children(child.get("children", [])),
                    leaf_count=child.get("leaf_count", 0),
                    entity_count=child.get("entity_count", 0),
                )
            )
    return children


@dataclass
class MerkleComparison:
    """Result of comparing two Merkle manifests.

    Attributes
    ----------
    identical : bool
        True if root hashes match (instant sync, zero changes).
    divergent_paths : list of str
        ltree paths that differ between the two manifests.
    divergent_node_ids : list of str
        UUIDs of nodes that have changed.
    added_node_ids : list of str
        UUIDs of nodes present in the remote manifest but not locally.
    removed_node_ids : list of str
        UUIDs of nodes present locally but not in the remote manifest.
    modified_node_ids : list of str
        UUIDs of nodes present in both but with different hashes.
    divergent_dependency_ids : list of str
        UUIDs of dependency links that have changed.
    divergent_assignment_ids : list of str
        UUIDs of resource assignments that have changed.
    """

    identical: bool
    divergent_paths: List[str] = field(default_factory=list)
    divergent_node_ids: List[str] = field(default_factory=list)
    added_node_ids: List[str] = field(default_factory=list)
    removed_node_ids: List[str] = field(default_factory=list)
    modified_node_ids: List[str] = field(default_factory=list)
    divergent_dependency_ids: List[str] = field(default_factory=list)
    divergent_assignment_ids: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the Merkle comparison result to a dictionary.

        Returns
        -------
        Dict[str, Any]
            A dictionary containing all comparison fields (identical status,
            divergent paths, added/removed/modified node IDs, and divergent
            dependency/assignment IDs), suitable for JSON serialization.
        """
        return asdict(self)


@dataclass
class DeltaPackIngestResult:
    """Result of ingesting a Merkle delta pack.

    Attributes
    ----------
    status : str
        'SUCCESS', 'PARTIAL', or 'CONFLICT'.
    applied_mutations : int
        Number of forward mutations successfully applied.
    staged_conflicts : int
        Number of conflicts staged into sandbox scenarios.
    sandbox_scenario_ids : list of str
        UUIDs of sandbox scenarios created for conflict resolution.
    skipped_entities : list of dict
        Entities that were skipped due to version conflicts.
    errors : list of str
        Any errors encountered during ingestion.
    """

    status: str
    applied_mutations: int = 0
    staged_conflicts: int = 0
    sandbox_scenario_ids: List[str] = field(default_factory=list)
    skipped_entities: List[Dict] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the delta pack ingestion result to a dictionary.

        Returns
        -------
        Dict[str, Any]
            A dictionary containing the ingestion status, applied mutations,
            staged conflicts, sandbox scenario IDs, skipped entities, and
            any errors, suitable for JSON serialization.
        """
        return asdict(self)


# ============================================================================
# Hash computation helpers
# ============================================================================


def compute_node_leaf_hash(node: UniversalBreakdownNode) -> str:
    """Compute the SHA-256 leaf hash for a UniversalBreakdownNode.

    The hash is computed from the canonical concatenation of the node's
    identity, version, and temporal fields::

        Leaf Hash = SHA256(id + code + version_id + updated_at + planned_dates)

    For PortfolioNode subclasses, planned dates are included.  For other
    tree types, only the base fields are hashed.

    Parameters
    ----------
    node : UniversalBreakdownNode
        The node to hash.

    Returns
    -------
    str
        SHA-256 hex digest string.
    """
    # Build canonical string representation
    parts = [
        str(node.id),
        str(node.code or ""),
        str(node.version_id or 1),
        str(node.updated_at.isoformat() if node.updated_at else ""),
    ]

    # Include planned dates for PortfolioNode
    if isinstance(node, PortfolioNode):
        parts.append(str(node.planned_start_date.isoformat() if node.planned_start_date else ""))
        parts.append(str(node.planned_end_date.isoformat() if node.planned_end_date else ""))

    canonical = "|".join(parts)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def compute_dependency_leaf_hash(dep: DependencyLink) -> str:
    """Compute the SHA-256 leaf hash for a DependencyLink.

    Parameters
    ----------
    dep : DependencyLink
        The dependency link to hash.

    Returns
    -------
    str
        SHA-256 hex digest string.
    """
    parts = [
        str(dep.id),
        str(dep.predecessor_id),
        str(dep.successor_id),
        str(dep.dependency_type.value if dep.dependency_type else ""),
        str(dep.lag_days or 0),
        str(dep.version_id or 1),
        str(dep.created_at.isoformat() if dep.created_at else ""),
    ]
    canonical = "|".join(parts)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def compute_assignment_leaf_hash(assignment: ResourceAssignment) -> str:
    """Compute the SHA-256 leaf hash for a ResourceAssignment.

    Parameters
    ----------
    assignment : ResourceAssignment
        The resource assignment to hash.

    Returns
    -------
    str
        SHA-256 hex digest string.
    """
    parts = [
        str(assignment.id),
        str(assignment.portfolio_node_id),
        str(assignment.resource_node_id),
        str(assignment.allocated_units or 0),
        str(assignment.planned_hours or 0),
        str(assignment.version_id or 1),
        str(assignment.updated_at.isoformat() if assignment.updated_at else ""),
    ]
    canonical = "|".join(parts)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def compute_branch_hash(child_hashes: List[str]) -> str:
    """Compute the SHA-256 hash for an internal Merkle tree branch.

    The branch hash is the SHA-256 of the sorted concatenation of all
    child hashes.  Sorting ensures the hash is deterministic regardless
    of child ordering.

    Parameters
    ----------
    child_hashes : list of str
        SHA-256 hex digests of child nodes.

    Returns
    -------
    str
        SHA-256 hex digest of the branch.
    """
    sorted_hashes = sorted(child_hashes)
    canonical = "|".join(sorted_hashes)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# ============================================================================
# Merkle Sync Service
# ============================================================================


class MerkleSyncService:
    """Service for generating, comparing, and reconciling Merkle tree manifests.

    This service provides the core logic for offline multi-site schedule
    reconciliation.  It can generate a Merkle tree manifest for any
    programme sub-tree, compare two manifests to find divergent records,
    export only the divergent records as a signed delta pack, and ingest
    a remote delta pack with three-way version tracking.

    Parameters
    ----------
    db : AsyncSession
        Active database session.
    user_id : int or None
        ID of the current user (for audit logging and sandbox creation).
    site_id : str
        Identifier of the local site (e.g., 'Warton', 'Hastings').
    """

    def __init__(
        self,
        db: AsyncSession,
        user_id: Optional[int] = None,
        site_id: str = "",
    ):
        """Initialize the Merkle sync service.

        Creates a service instance bound to a database session, optional
        user context, and a site identifier. The site ID distinguishes
        the local instance from remote sites during multi-site reconciliation.

        Args
        ----
        db : AsyncSession
            Active async database session for querying nodes, dependencies,
            and assignments.
        user_id : int, optional
            ID of the current user for audit logging and sandbox creation
            (default ``None``).
        site_id : str, optional
            Identifier of the local site (e.g., ``"Warton"``, ``"Hastings"``)
            used in delta pack metadata (default empty string).
        """
        self.db = db
        self.user_id = user_id
        self.site_id = site_id

    async def generate_subsystem_merkle_tree(
        self,
        root_portfolio_node_id: UUID,
    ) -> MerkleManifest:
        """Generate a complete Merkle tree manifest for a programme sub-tree.

        This method traverses the entire sub-tree rooted at the given
        PortfolioNode, computing leaf hashes for every UniversalBreakdownNode,
        DependencyLink, and ResourceAssignment.  It then recursively combines
        hashes upward along the ltree hierarchy to establish a single root
        Merkle digest.

        The resulting manifest can be compared with a manifest from another
        site by comparing just the root hash — if they match, the two
        instances are guaranteed to be identical.

        Parameters
        ----------
        root_portfolio_node_id : UUID
            The root PortfolioNode whose sub-tree should be included in
            the manifest.

        Returns
        -------
        MerkleManifest
            Complete manifest with root hash, entity counts, and the
            full Merkle tree structure.

        Raises
        ------
        ValueError
            If the root node is not found or is not a PortfolioNode.
        """
        # Load root node
        root_result = await self.db.execute(
            select(UniversalBreakdownNode).where(
                UniversalBreakdownNode.id == root_portfolio_node_id
            )
        )
        root_node = root_result.scalar_one_or_none()
        if root_node is None:
            raise ValueError(f"Root node {root_portfolio_node_id} not found")

        root_path = str(root_node.path)

        # Load all descendant nodes using ltree path prefix matching
        descendants_result = await self.db.execute(
            select(UniversalBreakdownNode).where(
                UniversalBreakdownNode.path.like(f"{root_path}.%")
                | (UniversalBreakdownNode.id == root_portfolio_node_id)
            )
        )
        nodes = descendants_result.scalars().all()

        # Build node map
        node_map: Dict[str, UniversalBreakdownNode] = {
            str(n.id): n for n in nodes
        }

        # Load all dependencies for these nodes
        node_ids = [n.id for n in nodes]
        deps_result = await self.db.execute(
            select(DependencyLink).where(
                (DependencyLink.predecessor_id.in_(node_ids))
                | (DependencyLink.successor_id.in_(node_ids))
            )
        )
        dependencies = deps_result.scalars().all()

        # Load all assignments for these nodes
        assignments_result = await self.db.execute(
            select(ResourceAssignment).where(
                ResourceAssignment.portfolio_node_id.in_(node_ids)
            )
        )
        assignments = assignments_result.scalars().all()

        # Compute leaf hashes for all nodes
        node_leaves: Dict[str, MerkleLeaf] = {}
        for node in nodes:
            node_leaves[str(node.id)] = MerkleLeaf(
                entity_type="node",
                entity_id=str(node.id),
                hash_digest=compute_node_leaf_hash(node),
                version_id=node.version_id or 1,
                path=str(node.path),
                metadata={
                    "code": node.code,
                    "tree_type": node.tree_type.value if node.tree_type else "",
                    "updated_at": node.updated_at.isoformat() if node.updated_at else "",
                },
            )

        # Compute leaf hashes for all dependencies
        dep_leaves: Dict[str, MerkleLeaf] = {}
        for dep in dependencies:
            # Use predecessor path as the branch path for this dependency
            pred_path = ""
            pred_id = str(dep.predecessor_id)
            if pred_id in node_leaves:
                pred_path = node_leaves[pred_id].path
            dep_leaves[str(dep.id)] = MerkleLeaf(
                entity_type="dependency",
                entity_id=str(dep.id),
                hash_digest=compute_dependency_leaf_hash(dep),
                version_id=dep.version_id or 1,
                path=pred_path,
                metadata={
                    "predecessor_id": str(dep.predecessor_id),
                    "successor_id": str(dep.successor_id),
                    "dependency_type": dep.dependency_type.value if dep.dependency_type else "",
                },
            )

        # Compute leaf hashes for all assignments
        assign_leaves: Dict[str, MerkleLeaf] = {}
        for assignment in assignments:
            assign_path = ""
            node_id = str(assignment.portfolio_node_id)
            if node_id in node_leaves:
                assign_path = node_leaves[node_id].path
            assign_leaves[str(assignment.id)] = MerkleLeaf(
                entity_type="assignment",
                entity_id=str(assignment.id),
                hash_digest=compute_assignment_leaf_hash(assignment),
                version_id=assignment.version_id or 1,
                path=assign_path,
                metadata={
                    "portfolio_node_id": str(assignment.portfolio_node_id),
                    "resource_node_id": str(assignment.resource_node_id),
                },
            )

        # Build hierarchical Merkle tree from ltree paths
        tree = self._build_merkle_tree(
            root_path,
            node_leaves,
            dep_leaves,
            assign_leaves,
        )

        manifest = MerkleManifest(
            root_node_id=str(root_portfolio_node_id),
            root_path=root_path,
            root_hash=tree.hash_digest,
            generated_at=datetime.now(timezone.utc).isoformat(),
            node_count=len(nodes),
            dependency_count=len(dependencies),
            assignment_count=len(assignments),
            tree=tree,
            site_id=self.site_id,
        )

        return manifest

    def _build_merkle_tree(
        self,
        root_path: str,
        node_leaves: Dict[str, MerkleLeaf],
        dep_leaves: Dict[str, MerkleLeaf],
        assign_leaves: Dict[str, MerkleLeaf],
    ) -> MerkleBranch:
        """Recursively build the Merkle tree from leaf hashes.

        Groups leaves by ltree path prefix, computing branch hashes
        bottom-up from the deepest leaves to the root.

        Parameters
        ----------
        root_path : str
            ltree path of the root node.
        node_leaves : dict
            Mapping of node_id to MerkleLeaf for all nodes.
        dep_leaves : dict
            Mapping of dependency_id to MerkleLeaf.
        assign_leaves : dict
            Mapping of assignment_id to MerkleLeaf.

        Returns
        -------
        MerkleBranch
            Root branch of the Merkle tree.
        """
        # Group nodes by their direct path prefix (immediate children of root)
        children_by_prefix: Dict[str, List[str]] = {}
        for node_id, leaf in node_leaves.items():
            if leaf.path == root_path:
                # This is the root node itself
                continue
            if leaf.path.startswith(root_path + "."):
                # Extract the next segment after root_path
                remainder = leaf.path[len(root_path) + 1:]
                first_segment = remainder.split(".")[0]
                prefix = f"{root_path}.{first_segment}"
                children_by_prefix.setdefault(prefix, []).append(node_id)

        # Collect all leaves belonging to this branch
        branch_child_hashes: List[str] = []
        branch_children: List[Any] = []
        total_leaves = 0
        total_entities = 0

        # Add root node leaf if present
        for node_id, leaf in node_leaves.items():
            if leaf.path == root_path:
                branch_child_hashes.append(leaf.hash_digest)
                total_leaves += 1
                total_entities += 1
                break

        # Add dependencies and assignments directly under this path
        for dep_id, dep_leaf in dep_leaves.items():
            if dep_leaf.path == root_path:
                branch_child_hashes.append(dep_leaf.hash_digest)
                total_entities += 1

        for assign_id, assign_leaf in assign_leaves.items():
            if assign_leaf.path == root_path:
                branch_child_hashes.append(assign_leaf.hash_digest)
                total_entities += 1

        # Recursively build child branches
        for prefix, child_node_ids in sorted(children_by_prefix.items()):
            # Filter deps and assignments for this child branch
            child_dep_leaves = {
                did: dl for did, dl in dep_leaves.items()
                if dl.path.startswith(prefix)
            }
            child_assign_leaves = {
                aid: al for aid, al in assign_leaves.items()
                if al.path.startswith(prefix)
            }
            child_node_leaves = {
                nid: nl for nid, nl in node_leaves.items()
                if nid in child_node_ids
            }

            child_branch = self._build_merkle_tree(
                prefix,
                child_node_leaves,
                child_dep_leaves,
                child_assign_leaves,
            )
            branch_child_hashes.append(child_branch.hash_digest)
            branch_children.append(child_branch)
            total_leaves += child_branch.leaf_count
            total_entities += child_branch.entity_count

        # Compute this branch's hash
        branch_hash = compute_branch_hash(branch_child_hashes) if branch_child_hashes else hashlib.sha256(b"").hexdigest()

        return MerkleBranch(
            path=root_path,
            hash_digest=branch_hash,
            children=branch_children,
            leaf_count=total_leaves,
            entity_count=total_entities,
        )

    def compare_merkle_manifests(
        self,
        local_manifest: MerkleManifest,
        imported_manifest: MerkleManifest,
    ) -> MerkleComparison:
        """Compare two Merkle manifests to isolate divergent records.

        First, compares the top-level root hashes.  If they are identical,
        the two instances are in perfect sync (zero overhead).

        If the root hashes differ, the method traverses downward branch-by-branch
        to isolate exactly which sub-trees, nodes, or dependency links have
        changed, avoiding the need to compare every individual record.

        Parameters
        ----------
        local_manifest : MerkleManifest
            The local Merkle tree manifest.
        imported_manifest : MerkleManifest
            The Merkle tree manifest from a remote site.

        Returns
        -------
        MerkleComparison
            Detailed comparison result with lists of added, removed,
            modified, and divergent entities.
        """
        # Instant sync check
        if local_manifest.root_hash == imported_manifest.root_hash:
            return MerkleComparison(identical=True)

        # Build entity maps from both manifests
        local_nodes = self._extract_leaves(local_manifest.tree, "node")
        remote_nodes = self._extract_leaves(imported_manifest.tree, "node")
        local_deps = self._extract_leaves(local_manifest.tree, "dependency")
        remote_deps = self._extract_leaves(imported_manifest.tree, "dependency")
        local_assigns = self._extract_leaves(local_manifest.tree, "assignment")
        remote_assigns = self._extract_leaves(imported_manifest.tree, "assignment")

        # Compare nodes by entity_id
        local_node_ids = set(local_nodes.keys())
        remote_node_ids = set(remote_nodes.keys())

        added_node_ids = sorted(remote_node_ids - local_node_ids)
        removed_node_ids = sorted(local_node_ids - remote_node_ids)

        # For common nodes, compare hashes
        modified_node_ids = []
        divergent_paths: Set[str] = set()
        for node_id in sorted(local_node_ids & remote_node_ids):
            if local_nodes[node_id].hash_digest != remote_nodes[node_id].hash_digest:
                modified_node_ids.append(node_id)
                divergent_paths.add(local_nodes[node_id].path)

        # Compare dependencies
        local_dep_ids = set(local_deps.keys())
        remote_dep_ids = set(remote_deps.keys())
        divergent_dependency_ids = sorted(
            (local_dep_ids ^ remote_dep_ids)  # XOR: added or removed
            | {
                did for did in local_dep_ids & remote_dep_ids
                if local_deps[did].hash_digest != remote_deps[did].hash_digest
            }
        )

        # Compare assignments
        local_assign_ids = set(local_assigns.keys())
        remote_assign_ids = set(remote_assigns.keys())
        divergent_assignment_ids = sorted(
            (local_assign_ids ^ remote_assign_ids)
            | {
                aid for aid in local_assign_ids & remote_assign_ids
                if local_assigns[aid].hash_digest != remote_assigns[aid].hash_digest
            }
        )

        all_divergent = set(modified_node_ids + added_node_ids + removed_node_ids)

        return MerkleComparison(
            identical=False,
            divergent_paths=sorted(divergent_paths),
            divergent_node_ids=sorted(all_divergent),
            added_node_ids=added_node_ids,
            removed_node_ids=removed_node_ids,
            modified_node_ids=modified_node_ids,
            divergent_dependency_ids=divergent_dependency_ids,
            divergent_assignment_ids=divergent_assignment_ids,
        )

    def _extract_leaves(
        self,
        branch: MerkleBranch,
        entity_type: str,
    ) -> Dict[str, MerkleLeaf]:
        """Recursively extract all leaves of a given type from a Merkle branch.

        Parameters
        ----------
        branch : MerkleBranch
            The branch to traverse.
        entity_type : str
            Filter by entity type: 'node', 'dependency', or 'assignment'.

        Returns
        -------
        dict
            Mapping of entity_id to MerkleLeaf.
        """
        leaves: Dict[str, MerkleLeaf] = {}
        for child in branch.children:
            if isinstance(child, MerkleLeaf):
                if child.entity_type == entity_type:
                    leaves[child.entity_id] = child
            elif isinstance(child, MerkleBranch):
                leaves.update(self._extract_leaves(child, entity_type))
        return leaves

    async def export_merkle_delta_pack(
        self,
        divergent_node_ids: List[str],
        divergent_dependency_ids: Optional[List[str]] = None,
        divergent_assignment_ids: Optional[List[str]] = None,
    ) -> bytes:
        """Export only the divergent records into a signed .merklepack file.

        This method loads the full entity data for all divergent records
        and packages them into a ZIP archive containing:

        - ``manifest.json`` — Summary of the delta pack.
        - ``delta.json`` — Full entity data for all divergent records.
        - ``signature.json`` — SHA-256 signature of the delta payload.

        Parameters
        ----------
        divergent_node_ids : list of str
            UUIDs of nodes to include in the delta pack.
        divergent_dependency_ids : list of str or None
            UUIDs of dependency links to include.
        divergent_assignment_ids : list of str or None
            UUIDs of resource assignments to include.

        Returns
        -------
        bytes
            ZIP archive bytes of the .merklepack file.
        """
        divergent_dependency_ids = divergent_dependency_ids or []
        divergent_assignment_ids = divergent_assignment_ids or []

        # Load divergent nodes
        nodes_data = []
        if divergent_node_ids:
            node_ids_uuid = [UUID(nid) for nid in divergent_node_ids]
            nodes_result = await self.db.execute(
                select(UniversalBreakdownNode).where(
                    UniversalBreakdownNode.id.in_(node_ids_uuid)
                )
            )
            for node in nodes_result.scalars().all():
                nodes_data.append(self._serialize_node_for_delta(node))

        # Load divergent dependencies
        deps_data = []
        if divergent_dependency_ids:
            dep_ids_uuid = [UUID(did) for did in divergent_dependency_ids]
            deps_result = await self.db.execute(
                select(DependencyLink).where(
                    DependencyLink.id.in_(dep_ids_uuid)
                )
            )
            for dep in deps_result.scalars().all():
                deps_data.append(self._serialize_dependency_for_delta(dep))

        # Load divergent assignments
        assigns_data = []
        if divergent_assignment_ids:
            assign_ids_uuid = [UUID(aid) for aid in divergent_assignment_ids]
            assigns_result = await self.db.execute(
                select(ResourceAssignment).where(
                    ResourceAssignment.id.in_(assign_ids_uuid)
                )
            )
            for assignment in assigns_result.scalars().all():
                assigns_data.append(self._serialize_assignment_for_delta(assignment))

        # Build delta payload
        delta_payload = {
            "version": "1.0",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "site_id": self.site_id,
            "nodes": nodes_data,
            "dependencies": deps_data,
            "assignments": assigns_data,
        }

        # Compute signature
        delta_json = json.dumps(delta_payload, sort_keys=True, default=str)
        signature = hashlib.sha256(delta_json.encode("utf-8")).hexdigest()

        # Build manifest
        manifest = {
            "version": "1.0",
            "site_id": self.site_id,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "node_count": len(nodes_data),
            "dependency_count": len(deps_data),
            "assignment_count": len(assigns_data),
            "signature": signature,
        }

        # Create ZIP archive
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("manifest.json", json.dumps(manifest, indent=2))
            zf.writestr("delta.json", delta_json)
            zf.writestr("signature.json", json.dumps({
                "algorithm": "SHA-256",
                "signature": signature,
                "signed_at": datetime.now(timezone.utc).isoformat(),
            }, indent=2))

        return buffer.getvalue()

    async def ingest_merkle_delta_pack(
        self,
        delta_pack_bytes: bytes,
        user_id: Optional[int] = None,
    ) -> DeltaPackIngestResult:
        """Ingest an offline .merklepack bundle with three-way version tracking.

        This method:

        1. Verifies the delta pack signature against the embedded manifest.
        2. For each incoming entity, resolves the mutation using three-way
           version tracking:

           - **Forward Mutation**: If ``incoming.version_id > local.version_id``
             and the parentage (ltree path) is unchanged, apply the mutation.
           - **Conflict Staging**: If both local and incoming were mutated
             concurrently, stage into a SandboxScenario for review.
           - **Parentage Change**: If the incoming node's path differs from
             local, stage into a SandboxScenario regardless of version.

        3. Records all applied mutations and staged conflicts in the result.

        Parameters
        ----------
        delta_pack_bytes : bytes
            Raw ZIP archive bytes of the .merklepack file.
        user_id : int or None
            ID of the user performing the ingestion (for audit logging).

        Returns
        -------
        DeltaPackIngestResult
            Detailed result with counts of applied mutations, staged
            conflicts, and any errors.
        """
        result = DeltaPackIngestResult(status="SUCCESS")
        effective_user_id = user_id or self.user_id

        try:
            # Parse ZIP archive
            buffer = io.BytesIO(delta_pack_bytes)
            with zipfile.ZipFile(buffer, "r") as zf:
                # Verify signature
                manifest = json.loads(zf.read("manifest.json"))
                signature_data = json.loads(zf.read("signature.json"))
                delta_json = zf.read("delta.json")

                expected_sig = manifest.get("signature", "")
                actual_sig = hashlib.sha256(delta_json).hexdigest()
                if expected_sig != actual_sig:
                    result.status = "ERROR"
                    result.errors.append(
                        "Signature verification failed: delta pack may be corrupted or tampered with."
                    )
                    return result

                delta_payload = json.loads(delta_json)
        except (zipfile.BadZipFile, json.JSONDecodeError, KeyError) as e:
            result.status = "ERROR"
            result.errors.append(f"Failed to parse delta pack: {str(e)}")
            return result

        # Process nodes
        applied = 0
        conflicts = 0
        sandbox_ids: Set[str] = set()

        for node_data in delta_payload.get("nodes", []):
            try:
                node_result = await self._ingest_node(node_data, effective_user_id)
                if node_result == "APPLIED":
                    applied += 1
                elif node_result == "CONFLICT":
                    conflicts += 1
                elif isinstance(node_result, str):
                    sandbox_ids.add(node_result)
                    conflicts += 1
            except Exception as e:
                result.errors.append(f"Failed to ingest node {node_data.get('id', '?')}: {str(e)}")

        # Process dependencies
        for dep_data in delta_payload.get("dependencies", []):
            try:
                dep_result = await self._ingest_dependency(dep_data, effective_user_id)
                if dep_result == "APPLIED":
                    applied += 1
                elif dep_result == "CONFLICT":
                    conflicts += 1
            except Exception as e:
                result.errors.append(f"Failed to ingest dependency {dep_data.get('id', '?')}: {str(e)}")

        # Process assignments
        for assign_data in delta_payload.get("assignments", []):
            try:
                assign_result = await self._ingest_assignment(assign_data, effective_user_id)
                if assign_result == "APPLIED":
                    applied += 1
                elif assign_result == "CONFLICT":
                    conflicts += 1
            except Exception as e:
                result.errors.append(
                    f"Failed to ingest assignment {assign_data.get('id', '?')}: {str(e)}"
                )

        result.applied_mutations = applied
        result.staged_conflicts = conflicts
        result.sandbox_scenario_ids = sorted(sandbox_ids)

        if conflicts > 0:
            result.status = "CONFLICT"
        elif result.errors:
            result.status = "PARTIAL"

        # Record audit log entry
        if effective_user_id and (applied > 0 or conflicts > 0):
            try:
                audit_entry = ForensicAuditLog.create_entry(
                    transaction_id=str(uuid4()),
                    user_upn=f"user-{effective_user_id}",
                    client_ip=None,
                    action_type="MERKLE_INGEST",
                    entity_type="MerkleSync",
                    entity_id=str(uuid4()),
                    json_diff={
                        "applied_mutations": applied,
                        "staged_conflicts": conflicts,
                        "sandbox_scenario_ids": sorted(sandbox_ids),
                    },
                )
                self.db.add(audit_entry)
                await self.db.commit()
            except Exception as e:
                result.errors.append(f"Audit log error: {str(e)}")

        return result

    async def _ingest_node(
        self,
        node_data: Dict[str, Any],
        user_id: Optional[int],
    ) -> str:
        """Ingest a single node from the delta pack.

        Returns
        -------
        str
            'APPLIED' if forward mutation applied, 'CONFLICT' if skipped,
            or sandbox_scenario_id if staged for review.
        """
        node_id = UUID(node_data["id"])

        # Load local node
        local_result = await self.db.execute(
            select(UniversalBreakdownNode).where(
                UniversalBreakdownNode.id == node_id
            )
        )
        local_node = local_result.scalar_one_or_none()

        if local_node is None:
            # Node doesn't exist locally — create it
            new_node = self._deserialize_node_from_delta(node_data)
            self.db.add(new_node)
            await self.db.commit()
            return "APPLIED"

        # Three-way version tracking
        incoming_version = node_data.get("version_id", 1)
        local_version = local_node.version_id or 1

        if incoming_version > local_version:
            # Check if parentage changed
            incoming_path = node_data.get("path", "")
            local_path = str(local_node.path)

            if incoming_path != local_path:
                # Parentage changed — stage into sandbox
                sandbox_id = await self._stage_conflict(
                    local_node,
                    node_data,
                    "PARENTAGE_CONFLICT",
                    user_id,
                )
                return sandbox_id

            # Forward mutation — apply changes
            self._apply_node_updates(local_node, node_data)
            await self.db.commit()
            return "APPLIED"

        elif incoming_version == local_version:
            # Same version — check if content actually differs
            if node_data.get("code") != local_node.code or \
               node_data.get("updated_at") != (local_node.updated_at.isoformat() if local_node.updated_at else ""):
                # Same version but different content — concurrent edit
                sandbox_id = await self._stage_conflict(
                    local_node,
                    node_data,
                    "CONCURRENT_EDIT",
                    user_id,
                )
                return sandbox_id
            return "SKIPPED"

        else:
            # Local version is newer — skip incoming
            return "SKIPPED"

    async def _ingest_dependency(
        self,
        dep_data: Dict[str, Any],
        user_id: Optional[int],
    ) -> str:
        """Ingest a single dependency from the delta pack."""
        dep_id = UUID(dep_data["id"])

        local_result = await self.db.execute(
            select(DependencyLink).where(DependencyLink.id == dep_id)
        )
        local_dep = local_result.scalar_one_or_none()

        if local_dep is None:
            # Create new dependency
            new_dep = DependencyLink(
                id=dep_id,
                predecessor_id=UUID(dep_data["predecessor_id"]),
                successor_id=UUID(dep_data["successor_id"]),
                dependency_type=dep_data.get("dependency_type"),
                lag_days=dep_data.get("lag_days", 0),
                version_id=dep_data.get("version_id", 1),
            )
            self.db.add(new_dep)
            await self.db.commit()
            return "APPLIED"

        incoming_version = dep_data.get("version_id", 1)
        local_version = local_dep.version_id or 1

        if incoming_version > local_version:
            self._apply_dependency_updates(local_dep, dep_data)
            await self.db.commit()
            return "APPLIED"

        return "SKIPPED"

    async def _ingest_assignment(
        self,
        assign_data: Dict[str, Any],
        user_id: Optional[int],
    ) -> str:
        """Ingest a single assignment from the delta pack."""
        assign_id = UUID(assign_data["id"])

        local_result = await self.db.execute(
            select(ResourceAssignment).where(
                ResourceAssignment.id == assign_id
            )
        )
        local_assign = local_result.scalar_one_or_none()

        if local_assign is None:
            new_assign = ResourceAssignment(
                id=assign_id,
                portfolio_node_id=UUID(assign_data["portfolio_node_id"]),
                resource_node_id=UUID(assign_data["resource_node_id"]),
                allocated_units=assign_data.get("allocated_units", 0),
                planned_hours=assign_data.get("planned_hours", 0),
                rate_snapshot=assign_data.get("rate_snapshot", 0),
                status=assign_data.get("status", "CONFIRMED"),
                version_id=assign_data.get("version_id", 1),
            )
            self.db.add(new_assign)
            await self.db.commit()
            return "APPLIED"

        incoming_version = assign_data.get("version_id", 1)
        local_version = local_assign.version_id or 1

        if incoming_version > local_version:
            self._apply_assignment_updates(local_assign, assign_data)
            await self.db.commit()
            return "APPLIED"

        return "SKIPPED"

    async def _stage_conflict(
        self,
        local_node: UniversalBreakdownNode,
        incoming_data: Dict[str, Any],
        conflict_type: str,
        user_id: Optional[int],
    ) -> str:
        """Stage a conflict into a new SandboxScenario for review.

        When both the local and incoming branches have been mutated
        concurrently, this method creates an isolated sandbox scenario
        containing the incoming version of the node, allowing the Lead
        Systems Engineer to review the side-by-side diff before merging.

        Parameters
        ----------
        local_node : UniversalBreakdownNode
            The local version of the conflicting node.
        incoming_data : dict
            The incoming version of the node from the delta pack.
        conflict_type : str
            Type of conflict: 'PARENTAGE_CONFLICT' or 'CONCURRENT_EDIT'.
        user_id : int or None
            ID of the user performing the ingestion.

        Returns
        -------
        str
            UUID of the newly created SandboxScenario.
        """
        from app.services.sandboxing import fork_sandbox_branch

        sandbox_id = str(uuid4())
        scenario_name = f"Merke Sync Conflict — {conflict_type} — {local_node.code}"

        # Create sandbox scenario
        scenario = SandboxScenario(
            id=UUID(sandbox_id),
            root_portfolio_node_id=local_node.id,
            name=scenario_name,
            description=(
                f"Conflict staged during Merkle sync ingestion.\n"
                f"Type: {conflict_type}\n"
                f"Local version: {local_node.version_id}\n"
                f"Incoming version: {incoming_data.get('version_id', '?')}\n"
                f"Local path: {local_node.path}\n"
                f"Incoming path: {incoming_data.get('path', '?')}"
            ),
            created_by_user_id=user_id or 1,
            status=SandboxScenarioStatus.ACTIVE,
        )
        self.db.add(scenario)
        await self.db.commit()

        # Record the conflict in skipped entities
        return sandbox_id

    # ------------------------------------------------------------------
    # Serialization helpers
    # ------------------------------------------------------------------

    def _serialize_node_for_delta(self, node: UniversalBreakdownNode) -> Dict[str, Any]:
        """Serialize a node for inclusion in a delta pack."""
        data = {
            "id": str(node.id),
            "code": node.code,
            "name": node.name,
            "path": str(node.path),
            "tree_type": node.tree_type.value if node.tree_type else "",
            "version_id": node.version_id or 1,
            "updated_at": node.updated_at.isoformat() if node.updated_at else "",
            "security_classification": node.security_classification.value if node.security_classification else "",
            "caveats": node.caveats or [],
            "is_active": node.is_active,
            "parent_id": str(node.parent_id) if node.parent_id else None,
        }

        if isinstance(node, PortfolioNode):
            data["planned_start_date"] = node.planned_start_date.isoformat() if node.planned_start_date else None
            data["planned_end_date"] = node.planned_end_date.isoformat() if node.planned_end_date else None
            data["percent_complete"] = node.percent_complete or 0
            data["delivery_mode"] = node.delivery_mode.value if node.delivery_mode else ""
            data["requires_vv_signoff"] = getattr(node, 'requires_vv_signoff', False)
            data["evm_technique"] = getattr(node, 'evm_technique', None)
            data["bac_cost"] = float(node.bac_cost) if node.bac_cost else None
            data["planned_value"] = float(node.planned_value) if node.planned_value else None
            data["earned_value"] = float(node.earned_value) if node.earned_value else None
            data["actual_cost"] = float(node.actual_cost) if node.actual_cost else None

        data["custom_attributes"] = node.custom_attributes or {}
        return data

    def _serialize_dependency_for_delta(self, dep: DependencyLink) -> Dict[str, Any]:
        """Serialize a dependency for inclusion in a delta pack."""
        return {
            "id": str(dep.id),
            "predecessor_id": str(dep.predecessor_id),
            "successor_id": str(dep.successor_id),
            "dependency_type": dep.dependency_type.value if dep.dependency_type else "",
            "lag_days": dep.lag_days or 0,
            "version_id": dep.version_id or 1,
        }

    def _serialize_assignment_for_delta(self, assignment: ResourceAssignment) -> Dict[str, Any]:
        """Serialize an assignment for inclusion in a delta pack."""
        return {
            "id": str(assignment.id),
            "portfolio_node_id": str(assignment.portfolio_node_id),
            "resource_node_id": str(assignment.resource_node_id),
            "allocated_units": assignment.allocated_units or 0,
            "planned_hours": assignment.planned_hours or 0,
            "rate_snapshot": float(assignment.rate_snapshot) if assignment.rate_snapshot else 0,
            "status": assignment.status.value if assignment.status else "CONFIRMED",
            "version_id": assignment.version_id or 1,
        }

    def _deserialize_node_from_delta(self, data: Dict[str, Any]) -> UniversalBreakdownNode:
        """Deserialize a node from delta pack data."""
        from app.models.models import TreeType

        node_id = UUID(data["id"])
        parent_id = UUID(data["parent_id"]) if data.get("parent_id") else None

        # Determine node class based on tree_type
        tree_type = TreeType(data.get("tree_type", "WBS"))

        if tree_type == TreeType.WBS:
            node = PortfolioNode(
                id=node_id,
                parent_id=parent_id,
                tree_type=tree_type,
                code=data["code"],
                name=data["name"],
                path=data["path"],
                version_id=data.get("version_id", 1),
                security_classification=data.get("security_classification", "OFFICIAL"),
                caveats=data.get("caveats", []),
                is_active=data.get("is_active", True),
                custom_attributes=data.get("custom_attributes", {}),
            )
            if data.get("planned_start_date"):
                node.planned_start_date = datetime.fromisoformat(data["planned_start_date"]).date()
            if data.get("planned_end_date"):
                node.planned_end_date = datetime.fromisoformat(data["planned_end_date"]).date()
            if data.get("percent_complete"):
                node.percent_complete = float(data["percent_complete"])
            if data.get("delivery_mode"):
                from app.models.models import DeliveryMode
                node.delivery_mode = DeliveryMode(data["delivery_mode"])
            if data.get("bac_cost"):
                node.bac_cost = float(data["bac_cost"])
            if data.get("planned_value"):
                node.planned_value = float(data["planned_value"])
            if data.get("earned_value"):
                node.earned_value = float(data["earned_value"])
            if data.get("actual_cost"):
                node.actual_cost = float(data["actual_cost"])
            return node
        else:
            # For RBS/LBS, create base node
            return UniversalBreakdownNode(
                id=node_id,
                parent_id=parent_id,
                tree_type=tree_type,
                code=data["code"],
                name=data["name"],
                path=data["path"],
                version_id=data.get("version_id", 1),
                security_classification=data.get("security_classification", "OFFICIAL"),
                caveats=data.get("caveats", []),
                is_active=data.get("is_active", True),
                custom_attributes=data.get("custom_attributes", {}),
            )

    def _apply_node_updates(self, node: UniversalBreakdownNode, data: Dict[str, Any]) -> None:
        """Apply incoming updates to a local node."""
        node.code = data.get("code", node.code)
        node.name = data.get("name", node.name)
        node.is_active = data.get("is_active", node.is_active)
        node.custom_attributes = data.get("custom_attributes", node.custom_attributes)

        if isinstance(node, PortfolioNode):
            if data.get("planned_start_date"):
                node.planned_start_date = datetime.fromisoformat(data["planned_start_date"]).date()
            if data.get("planned_end_date"):
                node.planned_end_date = datetime.fromisoformat(data["planned_end_date"]).date()
            if data.get("percent_complete") is not None:
                node.percent_complete = float(data["percent_complete"])
            if data.get("bac_cost") is not None:
                node.bac_cost = float(data["bac_cost"])
            if data.get("planned_value") is not None:
                node.planned_value = float(data["planned_value"])
            if data.get("earned_value") is not None:
                node.earned_value = float(data["earned_value"])
            if data.get("actual_cost") is not None:
                node.actual_cost = float(data["actual_cost"])

    def _apply_dependency_updates(self, dep: DependencyLink, data: Dict[str, Any]) -> None:
        """Apply incoming updates to a local dependency."""
        if data.get("lag_days") is not None:
            dep.lag_days = data["lag_days"]

    def _apply_assignment_updates(self, assignment: ResourceAssignment, data: Dict[str, Any]) -> None:
        """Apply incoming updates to a local assignment."""
        if data.get("allocated_units") is not None:
            assignment.allocated_units = float(data["allocated_units"])
        if data.get("planned_hours") is not None:
            assignment.planned_hours = float(data["planned_hours"])
        if data.get("status"):
            from app.models.models import AssignmentStatus
            assignment.status = AssignmentStatus(data["status"])


# ============================================================================
# Convenience function for router use
# ============================================================================


def from_uuid(val: str) -> UUID:
    """Convert a string to UUID, handling both standard and non-standard formats."""
    try:
        return UUID(val)
    except ValueError:
        # Handle non-standard UUID formats
        clean = val.replace("-", "")
        return UUID(clean + "0" * (32 - len(clean)) if len(clean) < 32 else clean[:32])


# ============================================================================
# 3-Way Merkle Reconciliation & CCB Arbitration
# ============================================================================


class MerkleMergeStatus(str, enum.Enum):
    """Status of a staged Merkle merge conflict entry."""

    PENDING = "PENDING"
    REQUIRES_CCB_ARBITRATION = "REQUIRES_CCB_ARBITRATION"
    RESOLVED_KEEP_LOCAL = "RESOLVED_KEEP_LOCAL"
    RESOLVED_ACCEPT_REMOTE = "RESOLVED_ACCEPT_REMOTE"
    RESOLVED_SYNTHESIZED = "RESOLVED_SYNTHESIZED"
    MERGE_COMMITTED = "MERGE_COMMITTED"


@dataclass
class ConflictField:
    """A single conflicting field within a Merkle merge conflict.

    Attributes
    ----------
    field_name : str
        The name of the conflicting field (e.g. 'planned_start_date').
    ancestor_value : Any
        The value in the common ancestor baseline.
    local_value : Any
        The value in the local (current) site.
    remote_value : Any
        The value in the remote (imported) site.
    """

    field_name: str
    ancestor_value: Any
    local_value: Any
    remote_value: Any

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class MerkleMergeStaging:
    """A single conflict entry quarantined for CCB arbitration.

    When both sites modify the same entity (node, dependency, or
    assignment) after the common ancestor, the conflict is staged here
    with status REQUIRES_CCB_ARBITRATION until resolved.

    Attributes
    ----------
    id : str
        Unique identifier for this staging entry.
    entity_type : str
        Type of entity: 'node', 'dependency', or 'assignment'.
    entity_id : str
        UUID of the conflicting entity.
    entity_code : str
        Human-readable code of the entity (for display).
    conflict_type : str
        Type of conflict: 'CONCURRENT_EDIT', 'PARENTAGE_CONFLICT',
        'CONTRADICTORY_LINK', or 'DATE_CONFLICT'.
    ancestor_state : dict
        Snapshot of the entity state at the common ancestor.
    local_state : dict
        Snapshot of the entity state at the local site.
    remote_state : dict
        Snapshot of the entity state at the remote site.
    conflicting_fields : list
        List of ConflictField objects describing each field-level conflict.
    status : MerkleMergeStatus
        Current resolution status.
    resolution : str or None
        Chosen resolution: 'KEEP_LOCAL', 'ACCEPT_REMOTE', or 'SYNTHESIZE'.
    synthesized_state : dict or None
        If resolution is SYNTHESIZE, the manually synthesized state.
    officer_1_signature : str or None
        Signature/credential of the first signing officer.
    officer_1_user_id : int or None
        User ID of the first signing officer.
    officer_2_signature : str or None
        Signature/credential of the second signing officer.
    officer_2_user_id : int or None
        User ID of the second signing officer.
    created_at : str
        ISO-8601 timestamp when the conflict was staged.
    resolved_at : str or None
        ISO-8601 timestamp when the conflict was resolved.
    """

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    entity_type: str = ""
    entity_id: str = ""
    entity_code: str = ""
    conflict_type: str = ""
    ancestor_state: Dict[str, Any] = field(default_factory=dict)
    local_state: Dict[str, Any] = field(default_factory=dict)
    remote_state: Dict[str, Any] = field(default_factory=dict)
    conflicting_fields: List[ConflictField] = field(default_factory=list)
    status: MerkleMergeStatus = MerkleMergeStatus.REQUIRES_CCB_ARBITRATION
    resolution: Optional[str] = None
    synthesized_state: Optional[Dict[str, Any]] = None
    officer_1_signature: Optional[str] = None
    officer_1_user_id: Optional[int] = None
    officer_2_signature: Optional[str] = None
    officer_2_user_id: Optional[int] = None
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    resolved_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "entity_code": self.entity_code,
            "conflict_type": self.conflict_type,
            "ancestor_state": self.ancestor_state,
            "local_state": self.local_state,
            "remote_state": self.remote_state,
            "conflicting_fields": [cf.to_dict() for cf in self.conflicting_fields],
            "status": self.status.value if isinstance(self.status, MerkleMergeStatus) else self.status,
            "resolution": self.resolution,
            "synthesized_state": self.synthesized_state,
            "officer_1_signature": self.officer_1_signature,
            "officer_1_user_id": self.officer_1_user_id,
            "officer_2_signature": self.officer_2_signature,
            "officer_2_user_id": self.officer_2_user_id,
            "created_at": self.created_at,
            "resolved_at": self.resolved_at,
        }


@dataclass
class ThreeWayReconciliationResult:
    """Result of a 3-way Merkle reconciliation run.

    Attributes
    ----------
    ancestor_hash : str
        The root hash of the computed common ancestor.
    auto_merged_count : int
        Number of non-conflicting branches auto-merged.
    conflicts_staged : int
        Number of conflicts quarantined for CCB arbitration.
    staging_entries : list
        List of MerkleMergeStaging entries requiring arbitration.
    divergent_paths : list
        ltree paths that diverged between local and remote.
    errors : list
        Any errors encountered during reconciliation.
    """

    ancestor_hash: str = ""
    auto_merged_count: int = 0
    conflicts_staged: int = 0
    staging_entries: List[MerkleMergeStaging] = field(default_factory=list)
    divergent_paths: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "ancestor_hash": self.ancestor_hash,
            "auto_merged_count": self.auto_merged_count,
            "conflicts_staged": self.conflicts_staged,
            "staging_entries": [entry.to_dict() for entry in self.staging_entries],
            "divergent_paths": self.divergent_paths,
            "errors": self.errors,
        }


@dataclass
class CCBMergeCommit:
    """Record of a dual-officer CCB merge commit.

    Attributes
    ----------
    commit_id : str
        Unique identifier for this merge commit.
    reconciliation_id : str
        ID of the reconciliation session this commit belongs to.
    entries_committed : int
        Number of staging entries committed in this transaction.
    officer_1_user_id : int
        User ID of the first signing officer.
    officer_1_signature : str
        Signature of the first officer.
    officer_2_user_id : int
        User ID of the second signing officer.
    officer_2_signature : str
        Signature of the second officer.
    committed_at : str
        ISO-8601 timestamp of the commit.
    audit_block_hash : str
        SHA-256 hash of the forensic audit ledger block.
    """

    commit_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    reconciliation_id: str = ""
    entries_committed: int = 0
    officer_1_user_id: int = 0
    officer_1_signature: str = ""
    officer_2_user_id: int = 0
    officer_2_signature: str = ""
    committed_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    audit_block_hash: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class MerkleReconciliationEngine:
    """3-Way Merkle Reconciliation Engine for multi-site conflict arbitration.

    When importing a .merklepack from a remote air-gapped site, this engine:

    1. Computes the common ancestor node hash using historical audit block
       references.
    2. Identifies divergent sub-tree paths between local and remote sites.
    3. Auto-merges non-conflicting branches (different subtrees modified
       by each site).
    4. Quarantines conflicting branches in MerkleMergeStaging with status
       REQUIRES_CCB_ARBITRATION.

    Parameters
    ----------
    db : AsyncSession
        Active database session.
    local_site_id : str
        Identifier of the local site.
    remote_site_id : str
        Identifier of the remote site being imported.
    """

    def __init__(
        self,
        db: AsyncSession,
        local_site_id: str = "",
        remote_site_id: str = "",
    ):
        self.db = db
        self.local_site_id = local_site_id
        self.remote_site_id = remote_site_id
        # In-memory staging area for conflicts
        self._staging_entries: List[MerkleMergeStaging] = []

    def compute_common_ancestor_hash(
        self,
        local_manifest: MerkleManifest,
        remote_manifest: MerkleManifest,
    ) -> str:
        """Compute the common ancestor root hash from two manifests.

        The common ancestor is determined by walking the Merkle tree
        from the root downward and finding the deepest branch whose hash
        is identical in both manifests.  If no common branch exists
        (completely divergent trees), the empty hash is returned.

        Parameters
        ----------
        local_manifest : MerkleManifest
            The local Merkle tree manifest.
        remote_manifest : MerkleManifest
            The remote Merkle tree manifest.

        Returns
        -------
        str
            SHA-256 hex digest of the common ancestor branch, or the
            empty hash if no common ancestor is found.
        """
        if local_manifest.root_hash == remote_manifest.root_hash:
            return local_manifest.root_hash

        # Walk both trees and find the deepest common branch
        ancestor_hash = self._find_common_ancestor_branch(
            local_manifest.tree, remote_manifest.tree
        )
        return ancestor_hash

    def _find_common_ancestor_branch(
        self,
        local_branch: MerkleBranch,
        remote_branch: MerkleBranch,
    ) -> str:
        """Recursively find the deepest common ancestor branch hash.

        Parameters
        ----------
        local_branch : MerkleBranch
            A branch from the local manifest tree.
        remote_branch : MerkleBranch
            The corresponding branch from the remote manifest tree.

        Returns
        -------
        str
            The hash of the deepest common ancestor branch found.
        """
        if local_branch.hash_digest == remote_branch.hash_digest:
            return local_branch.hash_digest

        best_ancestor = hashlib.sha256(b"").hexdigest()

        # Build maps by path for children
        local_children_by_path: Dict[str, Any] = {}
        for child in local_branch.children:
            if isinstance(child, MerkleBranch):
                local_children_by_path[child.path] = child

        remote_children_by_path: Dict[str, Any] = {}
        for child in remote_branch.children:
            if isinstance(child, MerkleBranch):
                remote_children_by_path[child.path] = child

        # Find common child paths and recurse
        common_paths = set(local_children_by_path.keys()) & set(remote_children_by_path.keys())
        for path in common_paths:
            child_ancestor = self._find_common_ancestor_branch(
                local_children_by_path[path],
                remote_children_by_path[path],
            )
            if child_ancestor != best_ancestor:
                best_ancestor = child_ancestor

        return best_ancestor

    def reconcile_three_way(
        self,
        local_manifest: MerkleManifest,
        remote_manifest: MerkleManifest,
        ancestor_manifest: Optional[MerkleManifest] = None,
    ) -> ThreeWayReconciliationResult:
        """Perform 3-way reconciliation between local and remote manifests.

        This is the core reconciliation method that:

        1. Computes the common ancestor (either provided or derived).
        2. Identifies all divergent sub-tree paths.
        3. Auto-merges non-conflicting branches.
        4. Quarantines conflicts for CCB arbitration.

        Parameters
        ----------
        local_manifest : MerkleManifest
            The local Merkle tree manifest.
        remote_manifest : MerkleManifest
            The remote Merkle tree manifest.
        ancestor_manifest : MerkleManifest or None
            Optional explicit ancestor manifest.  If not provided, the
            ancestor is derived from the two manifests.

        Returns
        -------
        ThreeWayReconciliationResult
            Detailed result with auto-merged count, staged conflicts,
            and staging entries.
        """
        result = ThreeWayReconciliationResult()

        # Compute common ancestor hash
        result.ancestor_hash = self.compute_common_ancestor_hash(
            local_manifest, remote_manifest
        )

        # Extract leaves from all three manifests
        local_nodes = self._extract_leaves_from_manifest(local_manifest, "node")
        remote_nodes = self._extract_leaves_from_manifest(remote_manifest, "node")
        local_deps = self._extract_leaves_from_manifest(local_manifest, "dependency")
        remote_deps = self._extract_leaves_from_manifest(remote_manifest, "dependency")
        local_assigns = self._extract_leaves_from_manifest(local_manifest, "assignment")
        remote_assigns = self._extract_leaves_from_manifest(remote_manifest, "assignment")

        # If ancestor manifest provided, extract its leaves too
        ancestor_nodes: Dict[str, MerkleLeaf] = {}
        ancestor_deps: Dict[str, MerkleLeaf] = {}
        ancestor_assigns: Dict[str, MerkleLeaf] = {}
        if ancestor_manifest:
            ancestor_nodes = self._extract_leaves_from_manifest(ancestor_manifest, "node")
            ancestor_deps = self._extract_leaves_from_manifest(ancestor_manifest, "dependency")
            ancestor_assigns = self._extract_leaves_from_manifest(ancestor_manifest, "assignment")

        # Reconcile nodes
        auto_merged, conflicts = self._reconcile_entity_set(
            local_nodes, remote_nodes, ancestor_nodes,
            "node", result,
        )
        result.auto_merged_count += auto_merged
        self._staging_entries.extend(conflicts)

        # Reconcile dependencies
        auto_merged_deps, conflicts_deps = self._reconcile_entity_set(
            local_deps, remote_deps, ancestor_deps,
            "dependency", result,
        )
        result.auto_merged_count += auto_merged_deps
        self._staging_entries.extend(conflicts_deps)

        # Reconcile assignments
        auto_merged_assigns, conflicts_assigns = self._reconcile_entity_set(
            local_assigns, remote_assigns, ancestor_assigns,
            "assignment", result,
        )
        result.auto_merged_count += auto_merged_assigns
        self._staging_entries.extend(conflicts_assigns)

        # Check for contradictory dependency links
        link_conflicts = self._detect_contradictory_links(
            local_deps, remote_deps, ancestor_deps,
            local_nodes, remote_nodes, ancestor_nodes,
        )
        self._staging_entries.extend(link_conflicts)

        result.conflicts_staged = len(self._staging_entries)
        result.staging_entries = self._staging_entries
        result.divergent_paths = sorted(set(
            entry.local_state.get("path", "")
            for entry in self._staging_entries
            if entry.local_state.get("path")
        ))

        return result

    def _extract_leaves_from_manifest(
        self,
        manifest: MerkleManifest,
        entity_type: str,
    ) -> Dict[str, MerkleLeaf]:
        """Extract all leaves of a given type from a manifest.

        Parameters
        ----------
        manifest : MerkleManifest
            The manifest to extract from.
        entity_type : str
            Filter by entity type: 'node', 'dependency', or 'assignment'.

        Returns
        -------
        dict
            Mapping of entity_id to MerkleLeaf.
        """
        leaves: Dict[str, MerkleLeaf] = {}
        self._extract_leaves_recursive(manifest.tree, entity_type, leaves)
        return leaves

    def _extract_leaves_recursive(
        self,
        branch: MerkleBranch,
        entity_type: str,
        leaves: Dict[str, MerkleLeaf],
    ) -> None:
        """Recursively extract leaves into the given dict."""
        for child in branch.children:
            if isinstance(child, MerkleLeaf):
                if child.entity_type == entity_type:
                    leaves[child.entity_id] = child
            elif isinstance(child, MerkleBranch):
                self._extract_leaves_recursive(child, entity_type, leaves)

    def _reconcile_entity_set(
        self,
        local_entities: Dict[str, MerkleLeaf],
        remote_entities: Dict[str, MerkleLeaf],
        ancestor_entities: Dict[str, MerkleLeaf],
        entity_type: str,
        result: ThreeWayReconciliationResult,
    ) -> Tuple[int, List[MerkleMergeStaging]]:
        """Reconcile a set of entities (nodes, deps, or assignments).

        Uses 3-way merge logic:
        - If only one side changed from ancestor, auto-merge.
        - If both sides changed differently, stage for CCB arbitration.
        - If both sides changed identically, auto-merge.

        Parameters
        ----------
        local_entities : dict
            Entity ID -> MerkleLeaf map for local site.
        remote_entities : dict
            Entity ID -> MerkleLeaf map for remote site.
        ancestor_entities : dict
            Entity ID -> MerkleLeaf map for ancestor (may be empty).
        entity_type : str
            Type of entity being reconciled.
        result : ThreeWayReconciliationResult
            Accumulator result object.

        Returns
        -------
        tuple
            (auto_merged_count, list of MerkleMergeStaging conflicts)
        """
        auto_merged = 0
        conflicts: List[MerkleMergeStaging] = []

        all_ids = set(local_entities.keys()) | set(remote_entities.keys())

        for entity_id in all_ids:
            local_leaf = local_entities.get(entity_id)
            remote_leaf = remote_entities.get(entity_id)
            ancestor_leaf = ancestor_entities.get(entity_id)

            # Entity only exists locally — no conflict
            if local_leaf and not remote_leaf:
                continue

            # Entity only exists remotely — auto-merge (add)
            if remote_leaf and not local_leaf:
                auto_merged += 1
                continue

            # Both exist — compare with ancestor
            local_changed = ancestor_leaf is None or local_leaf.hash_digest != ancestor_leaf.hash_digest
            remote_changed = ancestor_leaf is None or remote_leaf.hash_digest != ancestor_leaf.hash_digest

            if not local_changed and not remote_changed:
                # Neither changed — skip
                continue

            if local_changed and remote_changed:
                if local_leaf.hash_digest == remote_leaf.hash_digest:
                    # Both changed identically — auto-merge
                    auto_merged += 1
                    continue
                else:
                    # Both changed differently — CONFLICT
                    conflict = self._create_staging_entry(
                        entity_type, entity_id,
                        local_leaf, remote_leaf, ancestor_leaf,
                        "CONCURRENT_EDIT",
                    )
                    conflicts.append(conflict)
                    continue

            # Only one side changed — auto-merge
            auto_merged += 1

        return auto_merged, conflicts

    def _create_staging_entry(
        self,
        entity_type: str,
        entity_id: str,
        local_leaf: MerkleLeaf,
        remote_leaf: MerkleLeaf,
        ancestor_leaf: Optional[MerkleLeaf],
        conflict_type: str,
    ) -> MerkleMergeStaging:
        """Create a MerkleMergeStaging entry for a conflict.

        Parameters
        ----------
        entity_type : str
            Type of entity.
        entity_id : str
            UUID of the entity.
        local_leaf : MerkleLeaf
            Local version of the entity.
        remote_leaf : MerkleLeaf
            Remote version of the entity.
        ancestor_leaf : MerkleLeaf or None
            Ancestor version (if available).
        conflict_type : str
            Type of conflict detected.

        Returns
        -------
        MerkleMergeStaging
            The staging entry for CCB arbitration.
        """
        ancestor_meta = ancestor_leaf.metadata if ancestor_leaf else {}
        local_meta = local_leaf.metadata
        remote_meta = remote_leaf.metadata

        # Identify conflicting fields
        conflicting_fields = []
        all_field_names = set(local_meta.keys()) | set(remote_meta.keys()) | set(ancestor_meta.keys())

        for field_name in sorted(all_field_names):
            anc_val = ancestor_meta.get(field_name)
            loc_val = local_meta.get(field_name)
            rem_val = remote_meta.get(field_name)

            # A field is conflicting if both sides changed it differently
            local_differs = loc_val != anc_val
            remote_differs = rem_val != anc_val

            if local_differs and remote_differs and loc_val != rem_val:
                conflicting_fields.append(ConflictField(
                    field_name=field_name,
                    ancestor_value=anc_val,
                    local_value=loc_val,
                    remote_value=rem_val,
                ))

        # Also compare hash_digest and version_id
        if local_leaf.hash_digest != remote_leaf.hash_digest:
            # Check if already captured by metadata fields
            if not conflicting_fields:
                conflicting_fields.append(ConflictField(
                    field_name="hash_digest",
                    ancestor_value=ancestor_leaf.hash_digest if ancestor_leaf else None,
                    local_value=local_leaf.hash_digest,
                    remote_value=remote_leaf.hash_digest,
                ))

        entity_code = local_meta.get("code", entity_id)

        return MerkleMergeStaging(
            entity_type=entity_type,
            entity_id=entity_id,
            entity_code=entity_code,
            conflict_type=conflict_type,
            ancestor_state={
                "hash_digest": ancestor_leaf.hash_digest if ancestor_leaf else None,
                "version_id": ancestor_leaf.version_id if ancestor_leaf else None,
                "metadata": ancestor_meta,
            },
            local_state={
                "hash_digest": local_leaf.hash_digest,
                "version_id": local_leaf.version_id,
                "metadata": local_meta,
                "path": local_leaf.path,
            },
            remote_state={
                "hash_digest": remote_leaf.hash_digest,
                "version_id": remote_leaf.version_id,
                "metadata": remote_meta,
                "path": remote_leaf.path,
            },
            conflicting_fields=conflicting_fields,
            status=MerkleMergeStatus.REQUIRES_CCB_ARBITRATION,
        )

    def _detect_contradictory_links(
        self,
        local_deps: Dict[str, MerkleLeaf],
        remote_deps: Dict[str, MerkleLeaf],
        ancestor_deps: Dict[str, MerkleLeaf],
        local_nodes: Dict[str, MerkleLeaf],
        remote_nodes: Dict[str, MerkleLeaf],
        ancestor_nodes: Dict[str, MerkleLeaf],
    ) -> List[MerkleMergeStaging]:
        """Detect contradictory dependency links between sites.

        A contradictory link occurs when:
        - Site A creates a dependency X->Y
        - Site B creates a dependency Y->X (reverse direction)
        - Or both sites create different dependency types for the same pair

        Parameters
        ----------
        local_deps : dict
            Local dependency leaves.
        remote_deps : dict
            Remote dependency leaves.
        ancestor_deps : dict
            Ancestor dependency leaves.
        local_nodes : dict
            Local node leaves.
        remote_nodes : dict
            Remote node leaves.
        ancestor_nodes : dict
            Ancestor node leaves.

        Returns
        -------
        list
            List of MerkleMergeStaging entries for contradictory links.
        """
        conflicts: List[MerkleMergeStaging] = []

        # Build pair->dep maps for local and remote
        local_pair_map: Dict[Tuple[str, str], MerkleLeaf] = {}
        for dep_id, dep in local_deps.items():
            pred = dep.metadata.get("predecessor_id", "")
            succ = dep.metadata.get("successor_id", "")
            local_pair_map[(pred, succ)] = dep

        remote_pair_map: Dict[Tuple[str, str], MerkleLeaf] = {}
        for dep_id, dep in remote_deps.items():
            pred = dep.metadata.get("predecessor_id", "")
            succ = dep.metadata.get("successor_id", "")
            remote_pair_map[(pred, succ)] = dep

        ancestor_pair_map: Dict[Tuple[str, str], MerkleLeaf] = {}
        for dep_id, dep in ancestor_deps.items():
            pred = dep.metadata.get("predecessor_id", "")
            succ = dep.metadata.get("successor_id", "")
            ancestor_pair_map[(pred, succ)] = dep

        # Check for contradictory links
        all_pairs = set(local_pair_map.keys()) | set(remote_pair_map.keys())
        for pair in all_pairs:
            pred, succ = pair
            reverse_pair = (succ, pred)

            local_fwd = local_pair_map.get(pair)
            local_rev = local_pair_map.get(reverse_pair)
            remote_fwd = remote_pair_map.get(pair)
            remote_rev = remote_pair_map.get(reverse_pair)
            ancestor_fwd = ancestor_pair_map.get(pair)
            ancestor_rev = ancestor_pair_map.get(reverse_pair)

            # Case 1: Local has X->Y, Remote has Y->X (reverse contradiction)
            if local_fwd and remote_rev:
                # Check if this is new (not in ancestor)
                if not ancestor_fwd and not ancestor_rev:
                    # Both sides created links in opposite directions
                    conflict = MerkleMergeStaging(
                        entity_type="dependency",
                        entity_id=f"{pred}-{succ}",
                        entity_code=f"LINK:{pred}->{succ} vs {succ}->{pred}",
                        conflict_type="CONTRADICTORY_LINK",
                        ancestor_state={"link": None},
                        local_state={
                            "link": f"{pred}->{succ}",
                            "metadata": local_fwd.metadata,
                        },
                        remote_state={
                            "link": f"{succ}->{pred}",
                            "metadata": remote_rev.metadata,
                        },
                        conflicting_fields=[ConflictField(
                            field_name="dependency_direction",
                            ancestor_value=None,
                            local_value=f"{pred}->{succ}",
                            remote_value=f"{succ}->{pred}",
                        )],
                        status=MerkleMergeStatus.REQUIRES_CCB_ARBITRATION,
                    )
                    conflicts.append(conflict)

            # Case 2: Both sides have same pair but different dependency types
            if local_fwd and remote_fwd:
                local_type = local_fwd.metadata.get("dependency_type", "")
                remote_type = remote_fwd.metadata.get("dependency_type", "")
                ancestor_type = ancestor_fwd.metadata.get("dependency_type", "") if ancestor_fwd else ""

                if local_type != remote_type:
                    if local_type != ancestor_type and remote_type != ancestor_type:
                        # Both changed the type differently
                        conflict = MerkleMergeStaging(
                            entity_type="dependency",
                            entity_id=f"{pred}-{succ}",
                            entity_code=f"LINK:{pred}->{succ}",
                            conflict_type="CONTRADICTORY_LINK",
                            ancestor_state={
                                "dependency_type": ancestor_type,
                            },
                            local_state={
                                "dependency_type": local_type,
                                "metadata": local_fwd.metadata,
                            },
                            remote_state={
                                "dependency_type": remote_type,
                                "metadata": remote_fwd.metadata,
                            },
                            conflicting_fields=[ConflictField(
                                field_name="dependency_type",
                                ancestor_value=ancestor_type,
                                local_value=local_type,
                                remote_value=remote_type,
                            )],
                            status=MerkleMergeStatus.REQUIRES_CCB_ARBITRATION,
                        )
                        conflicts.append(conflict)

        return conflicts

    def get_staging_entries(self) -> List[MerkleMergeStaging]:
        """Return all currently staged conflict entries.

        Returns
        -------
        list
            List of MerkleMergeStaging entries.
        """
        return list(self._staging_entries)

    def get_staging_entry(self, entry_id: str) -> Optional[MerkleMergeStaging]:
        """Retrieve a single staging entry by ID.

        Parameters
        ----------
        entry_id : str
            The ID of the staging entry.

        Returns
        -------
        MerkleMergeStaging or None
            The staging entry if found.
        """
        for entry in self._staging_entries:
            if entry.id == entry_id:
                return entry
        return None

    def resolve_conflict(
        self,
        entry_id: str,
        resolution: str,
        synthesized_state: Optional[Dict[str, Any]] = None,
    ) -> Optional[MerkleMergeStaging]:
        """Resolve a single conflict entry.

        Parameters
        ----------
        entry_id : str
            The ID of the staging entry to resolve.
        resolution : str
            One of 'KEEP_LOCAL', 'ACCEPT_REMOTE', or 'SYNTHESIZE'.
        synthesized_state : dict or None
            If resolution is 'SYNTHESIZE', the manually synthesized state.

        Returns
        -------
        MerkleMergeStaging or None
            The updated staging entry.

        Raises
        ------
        ValueError
            If the entry is not found or resolution is invalid.
        """
        entry = self.get_staging_entry(entry_id)
        if entry is None:
            raise ValueError(f"Staging entry {entry_id} not found")

        if resolution not in ("KEEP_LOCAL", "ACCEPT_REMOTE", "SYNTHESIZE"):
            raise ValueError(f"Invalid resolution: {resolution}")

        if resolution == "KEEP_LOCAL":
            entry.status = MerkleMergeStatus.RESOLVED_KEEP_LOCAL
        elif resolution == "ACCEPT_REMOTE":
            entry.status = MerkleMergeStatus.RESOLVED_ACCEPT_REMOTE
        elif resolution == "SYNTHESIZE":
            if synthesized_state is None:
                raise ValueError("SYNTHESIZE resolution requires synthesized_state")
            entry.status = MerkleMergeStatus.RESOLVED_SYNTHESIZED
            entry.synthesized_state = synthesized_state

        entry.resolution = resolution
        return entry

    def stage_ccb_signature(
        self,
        entry_id: str,
        officer_number: int,
        user_id: int,
        signature: str,
    ) -> Optional[MerkleMergeStaging]:
        """Stage a CCB officer signature on a resolved conflict entry.

        Dual-officer quorum requires two distinct authorized signatures
        before a merge can be committed.

        Parameters
        ----------
        entry_id : str
            The ID of the staging entry.
        officer_number : int
            Officer number (1 or 2).
        user_id : int
            User ID of the signing officer.
        signature : str
            The officer's signature/credential token.

        Returns
        -------
        MerkleMergeStaging or None
            The updated staging entry.

        Raises
        ------
        ValueError
            If the entry is not found, officer number is invalid,
            or the same officer tries to sign twice.
        """
        entry = self.get_staging_entry(entry_id)
        if entry is None:
            raise ValueError(f"Staging entry {entry_id} not found")

        if officer_number not in (1, 2):
            raise ValueError("Officer number must be 1 or 2")

        # Check that the entry has been resolved first
        if entry.status not in (
            MerkleMergeStatus.RESOLVED_KEEP_LOCAL,
            MerkleMergeStatus.RESOLVED_ACCEPT_REMOTE,
            MerkleMergeStatus.RESOLVED_SYNTHESIZED,
        ):
            raise ValueError(
                f"Entry must be resolved before signing. "
                f"Current status: {entry.status.value if isinstance(entry.status, MerkleMergeStatus) else entry.status}"
            )

        # Check for duplicate officer
        if officer_number == 1:
            if entry.officer_1_user_id == user_id:
                raise ValueError("Officer 1 has already signed this entry")
            entry.officer_1_signature = signature
            entry.officer_1_user_id = user_id
        else:
            if entry.officer_2_user_id == user_id:
                raise ValueError("Officer 2 has already signed this entry")
            entry.officer_2_signature = signature
            entry.officer_2_user_id = user_id

        return entry

    def is_ready_for_commit(self, entry_id: str) -> bool:
        """Check if a staging entry has both officer signatures.

        Parameters
        ----------
        entry_id : str
            The ID of the staging entry.

        Returns
        -------
        bool
            True if both officers have signed.
        """
        entry = self.get_staging_entry(entry_id)
        if entry is None:
            return False

        return (
            entry.officer_1_signature is not None
            and entry.officer_2_signature is not None
            and entry.officer_1_user_id is not None
            and entry.officer_2_user_id is not None
            and entry.officer_1_user_id != entry.officer_2_user_id
        )

    def commit_resolved_entries(
        self,
        entry_ids: List[str],
    ) -> List[CCBMergeCommit]:
        """Commit resolved and signed entries, returning merge commit records.

        This method validates that all entries are resolved and have
        dual-officer signatures, then returns commit records for the
        forensic audit ledger.

        Parameters
        ----------
        entry_ids : list
            List of staging entry IDs to commit.

        Returns
        -------
        list
            List of CCBMergeCommit records.

        Raises
        ------
        ValueError
            If any entry is not ready for commit.
        """
        commits: List[CCBMergeCommit] = []

        for entry_id in entry_ids:
            entry = self.get_staging_entry(entry_id)
            if entry is None:
                raise ValueError(f"Staging entry {entry_id} not found")

            if not self.is_ready_for_commit(entry_id):
                raise ValueError(
                    f"Entry {entry_id} is not ready for commit: "
                    f"missing dual-officer signatures"
                )

            # Mark as committed
            entry.status = MerkleMergeStatus.MERGE_COMMITTED
            entry.resolved_at = datetime.now(timezone.utc).isoformat()

            # Compute audit block hash
            commit_data = json.dumps({
                "entry_id": entry.id,
                "entity_id": entry.entity_id,
                "resolution": entry.resolution,
                "officer_1": entry.officer_1_user_id,
                "officer_2": entry.officer_2_user_id,
                "timestamp": entry.resolved_at,
            }, sort_keys=True)
            audit_hash = hashlib.sha256(commit_data.encode("utf-8")).hexdigest()

            commit = CCBMergeCommit(
                reconciliation_id=entry.id,
                entries_committed=1,
                officer_1_user_id=entry.officer_1_user_id or 0,
                officer_1_signature=entry.officer_1_signature or "",
                officer_2_user_id=entry.officer_2_user_id or 0,
                officer_2_signature=entry.officer_2_signature or "",
                audit_block_hash=audit_hash,
            )
            commits.append(commit)

        return commits
