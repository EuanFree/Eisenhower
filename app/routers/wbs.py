"""WBS (Work Breakdown Structure) router with ABAC filtering.

Provides endpoints for querying and managing the portfolio/project tree
using ltree hierarchical queries. All tree retrieval queries apply
Attribute-Based Access Control (ABAC) filtering with ghost-node masking
to preserve tree structure when users lack clearance for certain nodes.

Batch Rollback / Undo
~~~~~~~~~~~~~~~~~~~~~

The ``POST /batch-rollback`` endpoint supports client-side Undo/Redo by
atomically reverting a set of field-level mutations in a single database
transaction.  Each revert operation is checked against the node's
``version_id`` for optimistic concurrency.  A ForensicAuditLog entry is
written with SHA-256 chained hashing, linking the rollback to the original
mutation's transaction ID.  If a project ID is provided, CPM recalculation
is triggered after the rollback completes.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text as sa_text
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4
from datetime import datetime, timezone

from app.database import get_db
from app.models.models import (
    User, UniversalBreakdownNode, PortfolioNode, TreeType, SecurityClassification,
    ForensicAuditLog, DependencyLink, DependencyType, ResourceAssignment, ResourceNode,
    AssignmentStatus, NodeBlocker,
)
from app.services.cpm_engine import add_working_days as _add_workdays
from app.schemas.schemas import (
    UBNCreate, UBNUpdate, PortfolioNodeCreate, PortfolioNodeUpdate,
    BatchRollbackRequest, BatchRollbackResponse, RevertOperationResult
)
from app.schemas.authoring import (
    WorkItemCreate,
    WorkItemCreatedResponse,
)
from app.core.permissions import verify_node_creation_authority
from app.utils.auth import get_current_user
from app.core.abac import (
    apply_abac_filtering,
    is_node_visible,
    node_to_dict,
    create_ghost_node,
)
from app.core.exceptions import ConflictException
from app.services.lock_manager import check_path_lock

router = APIRouter(prefix="/v1/wbs", tags=["WBS - Work Breakdown Structure"])


def _get_user_clearance_info(user: User) -> tuple:
    """Extract clearance level and caveats from user."""
    return user.clearance_level, user.caveats


def _compute_planned_end_date(start_date, duration_days, lag_days):
    """Compute planned_end_date from start_date + duration + lag (all in workdays).
    
    If start_date is None or duration_days is None/0, returns None.
    Lag defaults to 0 if None.
    """
    if not start_date or not duration_days or duration_days <= 0:
        return None
    lag = (lag_days or 0)
    total_workdays = duration_days + lag
    # add_working_days adds N workdays to the start date
    # For a 1-day task: start + 0 = start (same day)
    # For a 5-day task: start + 4 = end (5 working days inclusive)
    end = _add_workdays(start_date, total_workdays - 1)
    return end


def _query_subtree(db: Session, root_id: UUID) -> List[UniversalBreakdownNode]:
    """Query all nodes in a subtree using ltree path containment.
    
    Uses the ltree <@ operator to find all descendants of a root node.
    
    Args:
        db: Database session
        root_id: UUID of the root node
        
    Returns:
        List of all nodes in the subtree
    """
    # First get the root node's path
    root = db.query(UniversalBreakdownNode).filter(
        UniversalBreakdownNode.id == root_id
    ).first()
    
    if not root:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node {root_id} not found"
        )
    
    # Query all descendants using ltree path containment
    result = db.execute(
        sa_text(
            "SELECT ubn.*, pn.delivery_mode, pn.planned_start_date, "
            "pn.planned_end_date, pn.actual_start_date, pn.actual_end_date, "
            "pn.percent_complete, pn.pv, pn.ev, pn.ac, "
            "pn.duration_days, pn.lag_days, pn.evm_technique, "
            "pn.bac_cost, pn.planned_value, pn.earned_value, pn.actual_cost, "
            "pn.requires_vv_signoff, pn.calendar_id, "
            "pn.currency_code, pn.contract_exchange_rate_id, "
            "pn.is_relative_t0_mode, pn.relative_start_day_offset, "
            "pn.relative_finish_day_offset, pn.atp_anchor_date, "
            "pn.cost_distribution_profile, "
            "pn.baseline_effort_days, pn.agile_actual_effort_days "
            "FROM universal_breakdown_nodes ubn "
            "LEFT JOIN portfolio_nodes pn ON ubn.id = pn.id "
            "WHERE ubn.path <@ :root_path "
            "ORDER BY ubn.path"
        ),
        {"root_path": root.path},
    )
    
    columns = list(result.keys())
    rows = result.fetchall()
    
    nodes: List[UniversalBreakdownNode] = []
    for row in rows:
        row_dict = dict(zip(columns, row))
        # Determine node class and create appropriate object
        node_class = row_dict.get("node_class")
        
        if node_class == "PortfolioNode":
            node = PortfolioNode()
        else:
            node = UniversalBreakdownNode()
        
        for key, value in row_dict.items():
            if hasattr(node, key):
                setattr(node, key, value)
        
        nodes.append(node)
    
    return nodes


def _build_children_map(nodes: List[UniversalBreakdownNode]) -> Dict[Optional[str], List[UniversalBreakdownNode]]:
    """Build a map of parent_id to children nodes.
    
    Args:
        nodes: List of nodes
        
    Returns:
        Dictionary mapping parent_id string to list of child nodes
    """
    children_map: Dict[Optional[str], List[UniversalBreakdownNode]] = {}
    for node in nodes:
        parent_key = str(node.parent_id) if node.parent_id else None
        if parent_key not in children_map:
            children_map[parent_key] = []
        children_map[parent_key].append(node)
    return children_map


def _has_visible_descendants(
    node: UniversalBreakdownNode,
    children_map: Dict[Optional[str], List[UniversalBreakdownNode]],
    user_clearance: SecurityClassification,
    user_caveats: Optional[List[str]],
) -> bool:
    """Check if a node has any visible descendants.
    
    Args:
        node: The node to check
        children_map: Map of parent_id to children
        user_clearance: User's clearance level
        user_caveats: User's caveats
        
    Returns:
        True if any descendant is visible to the user
    """
    node_key = str(node.id)
    if node_key not in children_map:
        return False
    
    for child in children_map[node_key]:
        if is_node_visible(user_clearance, user_caveats, child):
            return True
        if _has_visible_descendants(child, children_map, user_clearance, user_caveats):
            return True
    return False


def _build_tree_structure(
    nodes: List[UniversalBreakdownNode],
    user_clearance: SecurityClassification,
    user_caveats: Optional[List[str]],
) -> List[Dict[str, Any]]:
    """Build a tree structure with ABAC filtering and ghost-node masking.
    
    Args:
        nodes: List of nodes from the database
        user_clearance: User's clearance level
        user_caveats: User's caveats
        
    Returns:
        List of node dictionaries representing the filtered tree
    """
    children_map = _build_children_map(nodes)
    
    result: List[Dict[str, Any]] = []
    
    for node in nodes:
        if is_node_visible(user_clearance, user_caveats, node):
            # Full visibility - include complete node data
            node_dict = node_to_dict(node)
            # Add children recursively
            node_key = str(node.id)
            if node_key in children_map:
                node_dict["children"] = _build_tree_structure(
                    children_map[node_key],
                    user_clearance,
                    user_caveats,
                )
            else:
                node_dict["children"] = []
            result.append(node_dict)
        elif _has_visible_descendants(node, children_map, user_clearance, user_caveats):
            # Partial visibility - create ghost node with visible descendants
            ghost = create_ghost_node(node)
            node_key = str(node.id)
            if node_key in children_map:
                ghost["children"] = _build_tree_structure(
                    children_map[node_key],
                    user_clearance,
                    user_caveats,
                )
            else:
                ghost["children"] = []
            result.append(ghost)
        # Else: no visibility - exclude from results entirely
    
    return result


@router.get("/projects", summary="List all root projects and programmes")
def list_wbs_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve all top-level root WBS programmes/projects."""
    user_clearance, user_caveats = _get_user_clearance_info(current_user)
    root_nodes = (
        db.query(UniversalBreakdownNode)
        .filter(
            UniversalBreakdownNode.tree_type == TreeType.WBS,
            UniversalBreakdownNode.parent_id == None,
            UniversalBreakdownNode.is_active == True,
        )
        .order_by(UniversalBreakdownNode.path.asc(), UniversalBreakdownNode.code.asc())
        .all()
    )
    filtered = apply_abac_filtering(root_nodes, user_clearance, user_caveats)
    
    results = []
    for n in filtered:
        node_path = n.get("path") or ""
        node_id_str = str(n.get("id"))
        
        # Count total active nodes in this tree
        count = 1
        active_blockers_count = 0
        if node_path:
            count = (
                db.query(UniversalBreakdownNode)
                .filter(
                    UniversalBreakdownNode.path.op("<@")(sa_text(f"'{node_path}'")),
                    UniversalBreakdownNode.is_active == True,
                )
                .count()
            )
            
            # Count active blockers in this subtree
            subtree_node_ids = [
                row[0] for row in db.query(UniversalBreakdownNode.id).filter(
                    UniversalBreakdownNode.path.op("<@")(sa_text(f"'{node_path}'")),
                    UniversalBreakdownNode.is_active == True,
                ).all()
            ]
            if subtree_node_ids:
                active_blockers_count = (
                    db.query(NodeBlocker)
                    .filter(
                        NodeBlocker.portfolio_node_id.in_(subtree_node_ids),
                        NodeBlocker.resolved_at == None,
                    )
                    .count()
                )
            
        results.append({
            "id": node_id_str,
            "code": n.get("code") or "",
            "name": n.get("name") or "",
            "path": node_path,
            "security_classification": n.get("security_classification") or "OFFICIAL",
            "caveats": n.get("caveats") or [],
            "delivery_mode": n.get("delivery_mode") or "HYBRID",
            "planned_start_date": n.get("planned_start_date"),
            "planned_end_date": n.get("planned_end_date"),
            "percent_complete": n.get("percent_complete") or 0.0,
            "node_count": count,
            "active_blockers_count": active_blockers_count,
            "custom_attributes": n.get("custom_attributes") or {},
        })
    return results


@router.get("/tree/{node_id}")
def get_wbs_tree(
    node_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve the WBS tree rooted at the specified node, with ABAC filtering.
    
    Returns the full subtree with proper hierarchy preservation. Nodes that
    the user lacks clearance for will be masked as ghost nodes if they have
    visible descendants, or completely hidden if they have no visible descendants.
    
    Args:
        node_id: UUID of the root node of the tree to retrieve, or 'default'
        db: Database session
        current_user: Authenticated user
        
    Returns:
        List of nodes forming the tree structure
    """
    user_clearance, user_caveats = _get_user_clearance_info(current_user)

    target_uuid: Optional[UUID] = None
    if node_id and node_id != "default":
        try:
            target_uuid = UUID(node_id)
        except ValueError:
            target_uuid = None

    if target_uuid is None:
        root_node = (
            db.query(UniversalBreakdownNode)
            .filter(
                UniversalBreakdownNode.tree_type == TreeType.WBS,
                UniversalBreakdownNode.parent_id == None,
                UniversalBreakdownNode.is_active == True,
            )
            .order_by(UniversalBreakdownNode.path.asc())
            .first()
        )
        if not root_node:
            return {
                "root_id": None,
                "root": None,
                "children": [],
                "tree": [],
                "total_nodes": 0,
                "visible_nodes": 0,
            }
        target_uuid = root_node.id

    # Query the full subtree
    nodes = _query_subtree(db, target_uuid)

    # Apply ABAC filtering and build tree structure
    filtered_tree = _build_tree_structure(nodes, user_clearance, user_caveats)
    flat_filtered = apply_abac_filtering(nodes, user_clearance, user_caveats)

    root_dict = filtered_tree[0] if filtered_tree else (flat_filtered[0] if flat_filtered else None)
    children_list = flat_filtered[1:] if len(flat_filtered) > 1 else []

    node_uuids = [n.id for n in nodes if n.id is not None]
    dependencies_list: List[Dict[str, Any]] = []
    if node_uuids:
        dep_rows = (
            db.query(DependencyLink)
            .filter(
                DependencyLink.predecessor_id.in_(node_uuids),
                DependencyLink.successor_id.in_(node_uuids),
            )
            .all()
        )
        for dep in dep_rows:
            dep_type_val = (
                dep.dependency_type.value
                if hasattr(dep.dependency_type, "value")
                else str(dep.dependency_type)
            )
            dependencies_list.append(
                {
                    "id": str(dep.id),
                    "predecessor_id": str(dep.predecessor_id),
                    "successor_id": str(dep.successor_id),
                    "dependency_type": dep_type_val,
                    "lag_days": dep.lag_days or 0,
                }
            )

    assignments_list: List[Dict[str, Any]] = []
    if node_uuids:
        assignment_rows = (
            db.query(ResourceAssignment)
            .filter(ResourceAssignment.portfolio_node_id.in_(node_uuids))
            .all()
        )
        for a in assignment_rows:
            resource = db.query(ResourceNode).filter(ResourceNode.id == a.resource_node_id).first()
            assignments_list.append(
                {
                    "id": str(a.id),
                    "portfolio_node_id": str(a.portfolio_node_id),
                    "resource_node_id": str(a.resource_node_id),
                    "resource_code": resource.code if resource else None,
                    "resource_name": resource.name if resource else None,
                    "allocated_units": a.allocated_units,
                }
            )

    return {
        "root_id": str(target_uuid),
        "root": root_dict,
        "children": children_list,
        "tree": filtered_tree,
        "dependencies": dependencies_list,
        "resource_assignments": assignments_list,
        "total_nodes": len(nodes),
        "visible_nodes": len(filtered_tree),
    }


@router.get("/dependencies")
def list_wbs_dependencies(
    root_id: Optional[str] = Query(None, description="Optional root node ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List dependency links for a WBS subtree (or all WBS dependencies)."""
    query = db.query(DependencyLink)
    if root_id and root_id != "default":
        try:
            target_uuid = UUID(root_id)
            nodes = _query_subtree(db, target_uuid)
            node_uuids = [n.id for n in nodes if n.id is not None]
            if node_uuids:
                query = query.filter(
                    DependencyLink.predecessor_id.in_(node_uuids),
                    DependencyLink.successor_id.in_(node_uuids),
                )
        except Exception:
            pass

    dep_rows = query.all()
    return {
        "dependencies": [
            {
                "id": str(dep.id),
                "predecessor_id": str(dep.predecessor_id),
                "successor_id": str(dep.successor_id),
                "dependency_type": (
                    dep.dependency_type.value
                    if hasattr(dep.dependency_type, "value")
                    else str(dep.dependency_type)
                ),
                "lag_days": dep.lag_days or 0,
            }
            for dep in dep_rows
        ]
    }


@router.post("/dependencies", status_code=status.HTTP_201_CREATED)
def create_wbs_dependency(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a dependency link between two WBS nodes."""
    pred_id = UUID(str(payload["predecessor_id"]))
    succ_id = UUID(str(payload["successor_id"]))
    if pred_id == succ_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A task cannot depend on itself",
        )
    dep_type_str = str(payload.get("dependency_type", "FS")).upper()
    try:
        dep_type = DependencyType(dep_type_str)
    except ValueError:
        dep_type = DependencyType.FS

    lag_days = int(payload.get("lag_days", 0) or 0)

    existing = (
        db.query(DependencyLink)
        .filter(
            DependencyLink.predecessor_id == pred_id,
            DependencyLink.successor_id == succ_id,
        )
        .first()
    )
    if existing:
        existing.dependency_type = dep_type
        existing.lag_days = lag_days
        db.commit()
        db.refresh(existing)
        link = existing
    else:
        link = DependencyLink(
            predecessor_id=pred_id,
            successor_id=succ_id,
            dependency_type=dep_type,
            lag_days=lag_days,
        )
        db.add(link)
        db.commit()
        db.refresh(link)

    return {
        "id": str(link.id),
        "predecessor_id": str(link.predecessor_id),
        "successor_id": str(link.successor_id),
        "dependency_type": (
            link.dependency_type.value
            if hasattr(link.dependency_type, "value")
            else str(link.dependency_type)
        ),
        "lag_days": link.lag_days or 0,
    }


@router.delete("/dependencies/{dependency_id}")
def delete_wbs_dependency(
    dependency_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a dependency link by ID."""
    dep = db.query(DependencyLink).filter(DependencyLink.id == dependency_id).first()
    if not dep:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dependency {dependency_id} not found",
        )
    db.delete(dep)
    db.commit()
    return {"deleted": True, "id": str(dependency_id)}


@router.get("/resource-assignments")
def list_wbs_resource_assignments(
    root_id: Optional[str] = Query(None, description="Optional root node ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List resource assignments for a WBS subtree (or all assignments)."""
    query = db.query(ResourceAssignment)
    if root_id and root_id != "default":
        try:
            target_uuid = UUID(root_id)
            nodes = _query_subtree(db, target_uuid)
            node_uuids = [n.id for n in nodes if n.id is not None]
            if node_uuids:
                query = query.filter(ResourceAssignment.portfolio_node_id.in_(node_uuids))
        except Exception:
            pass

    rows = query.all()
    result = []
    for a in rows:
        resource = db.query(ResourceNode).filter(ResourceNode.id == a.resource_node_id).first()
        result.append(
            {
                "id": str(a.id),
                "portfolio_node_id": str(a.portfolio_node_id),
                "resource_node_id": str(a.resource_node_id),
                "resource_code": resource.code if resource else None,
                "resource_name": resource.name if resource else None,
                "allocated_units": a.allocated_units,
            }
        )
    return {"resource_assignments": result}


@router.post("/resource-assignments", status_code=status.HTTP_201_CREATED)
def create_wbs_resource_assignment(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Assign a resource to a WBS node (creates or updates allocation)."""
    node_id = UUID(str(payload["portfolio_node_id"]))
    resource_id = UUID(str(payload["resource_node_id"]))
    allocated_units = float(payload.get("allocated_units", 1.0) or 1.0)

    resource = db.query(ResourceNode).filter(ResourceNode.id == resource_id).first()
    if not resource:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resource {resource_id} not found",
        )

    existing = (
        db.query(ResourceAssignment)
        .filter(
            ResourceAssignment.portfolio_node_id == node_id,
            ResourceAssignment.resource_node_id == resource_id,
        )
        .first()
    )
    if existing:
        existing.allocated_units = allocated_units
        db.commit()
        db.refresh(existing)
        assignment = existing
    else:
        assignment = ResourceAssignment(
            portfolio_node_id=node_id,
            resource_node_id=resource_id,
            allocated_units=allocated_units,
            planned_hours=float(payload.get("planned_hours", 0.0) or 0.0),
            rate_snapshot=resource.standard_hourly_rate or 0,
            status=AssignmentStatus.CONFIRMED,
        )
        db.add(assignment)
        db.commit()
        db.refresh(assignment)

    return {
        "id": str(assignment.id),
        "portfolio_node_id": str(assignment.portfolio_node_id),
        "resource_node_id": str(assignment.resource_node_id),
        "resource_code": resource.code,
        "resource_name": resource.name,
        "allocated_units": assignment.allocated_units,
    }


@router.delete("/resource-assignments/{assignment_id}")
def delete_wbs_resource_assignment(
    assignment_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a resource assignment by ID."""
    assignment = db.query(ResourceAssignment).filter(ResourceAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resource assignment {assignment_id} not found",
        )
    db.delete(assignment)
    db.commit()
    return {"deleted": True, "id": str(assignment_id)}


@router.get("/nodes")
def list_wbs_nodes(
    tree_type: Optional[TreeType] = Query(None, description="Filter by tree type"),
    parent_id: Optional[UUID] = Query(None, description="Filter by parent node"),
    root: Optional[str] = Query(None, description="ltree path prefix for lazy sub-tree fetch (e.g. 'prog_a.proj_1')"),
    depth: Optional[int] = Query(None, ge=1, le=10, description="Maximum depth levels to return from root path (1 = immediate children only)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List WBS nodes with optional filtering, applying ABAC rules.

    Supports lazy sub-tree fetching for virtualized table expansion:
    when ``root`` is an ltree path prefix and ``depth`` is set, only the
    specified number of hierarchy levels beneath that path are returned,
    avoiding a full recursive tree pull.

    Args:
        tree_type: Optional filter by tree type (WBS, RBS, LBS)
        parent_id: Optional filter by parent node ID
        root: Optional ltree path prefix for lazy sub-tree fetch
        depth: Maximum depth levels to return from root path (1 = immediate children)
        db: Database session
        current_user: Authenticated user

    Returns:
        List of visible nodes matching the filter criteria
    """
    user_clearance, user_caveats = _get_user_clearance_info(current_user)

    query = db.query(UniversalBreakdownNode)

    if tree_type:
        query = query.filter(UniversalBreakdownNode.tree_type == tree_type)

    if parent_id:
        query = query.filter(UniversalBreakdownNode.parent_id == parent_id)

    # Lazy sub-tree fetch: filter by ltree path prefix with depth limit
    if root is not None:
        # Calculate the expected path depth for the root prefix
        root_depth = len(root.split('.'))
        nodes = query.all()

        # Filter to nodes whose path starts with the root prefix
        # and respect the depth limit
        filtered: List[UniversalBreakdownNode] = []
        for node in nodes:
            if node.path is None:
                continue
            node_parts = node.path.split('.')
            # Check if this node is a descendant of the root path
            if len(node_parts) >= root_depth and node_parts[:root_depth] == root.split('.'):
                # Calculate depth relative to root
                relative_depth = len(node_parts) - root_depth
                if depth is None or relative_depth <= depth:
                    # Don't return the root node itself, only its descendants
                    if relative_depth > 0:
                        filtered.append(node)
        nodes = filtered

    if root is None and parent_id is None and tree_type is None:
        nodes = query.all()

    # Apply ABAC filtering
    filtered_nodes = apply_abac_filtering(nodes, user_clearance, user_caveats)

    return {"nodes": filtered_nodes, "count": len(filtered_nodes)}


@router.get("/nodes/{node_id}")
def get_wbs_node(
    node_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve a single WBS node, checking ABAC access.
    
    Args:
        node_id: UUID of the node to retrieve
        db: Database session
        current_user: Authenticated user
        
    Returns:
        Node data if accessible, otherwise 403 Forbidden
    """
    user_clearance, user_caveats = _get_user_clearance_info(current_user)
    
    node = db.query(UniversalBreakdownNode).filter(
        UniversalBreakdownNode.id == node_id
    ).first()
    
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node {node_id} not found"
        )
    
    # Check ABAC access
    if not is_node_visible(user_clearance, user_caveats, node):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient security clearance for this resource"
        )
    
    return node_to_dict(node)


@router.post("/nodes", status_code=status.HTTP_201_CREATED)
def create_wbs_node(
    node_data: PortfolioNodeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new WBS node in the tree.
    
    Args:
        node_data: Node creation data
        db: Database session
        current_user: Authenticated user
        
    Returns:
        Created node data
    """
    # If parent_id is provided, verify it exists
    parent_path = None
    if node_data.parent_id:
        parent = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id == node_data.parent_id
        ).first()
        
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent node {node_data.parent_id} not found"
            )
        
        parent_path = f"{parent.path}.{node_data.path.split('.')[-1]}" if node_data.path else None
    
    # Auto-compute end date from start + duration + lag if not explicitly provided
    planned_end = node_data.planned_end_date
    if not planned_end and node_data.planned_start_date and node_data.duration_days:
        planned_end = _compute_planned_end_date(
            node_data.planned_start_date, node_data.duration_days, getattr(node_data, 'lag_days', None)
        )

    # Create the new node
    new_node = PortfolioNode(
        tree_type=node_data.tree_type,
        code=node_data.code,
        name=node_data.name,
        path=node_data.path,
        parent_id=node_data.parent_id,
        security_classification=node_data.security_classification,
        caveats=node_data.caveats,
        odac_permissions=node_data.odac_permissions,
        custom_attributes=node_data.custom_attributes,
        is_active=node_data.is_active,
        delivery_mode=node_data.delivery_mode,
        planned_start_date=node_data.planned_start_date,
        planned_end_date=planned_end,
        duration_days=node_data.duration_days,
        lag_days=getattr(node_data, 'lag_days', 0),
        percent_complete=node_data.percent_complete,
        pv=node_data.pv,
        ev=node_data.ev,
        ac=node_data.ac,
    )
    
    db.add(new_node)

    # Hybrid delivery: sync effort tracking on create too
    _sync_hybrid_effort(db, new_node, {})

    db.commit()
    db.refresh(new_node)

    return node_to_dict(new_node)


@router.put("/nodes/{node_id}")
def update_wbs_node(
    node_id: UUID,
    node_update: PortfolioNodeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing WBS node with optimistic concurrency control.
    
    This endpoint supports version-based conflict detection.  If the
    client includes ``version_id`` in the request body, the server
    verifies that the database row still has that version before
    applying the update.  If another user has already modified the
    node, SQLAlchemy raises ``StaleDataError`` which is caught by
    the global exception handler and returned as HTTP 409 Conflict.
    
    Args:
        node_id: UUID of the node to update
        node_update: Update data, optionally including version_id
        db: Database session
        current_user: Authenticated user
        
    Returns:
        Updated node data including the new version_id
        
    Raises:
        HTTPException: 404 if node not found, 403 if clearance
            insufficient, 409 if concurrent modification detected
    """
    user_clearance, user_caveats = _get_user_clearance_info(current_user)
    
    node = db.query(PortfolioNode).filter(
        PortfolioNode.id == node_id
    ).first()
    
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node {node_id} not found"
        )
    
    # Check ABAC access
    if not is_node_visible(user_clearance, user_caveats, node):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient security clearance for this resource"
        )

    # Check if this node is under an active sub-tree lock
    check_path_lock(db, node.path)

    # Extract version_id from update data for explicit conflict check
    expected_version = node_update.version_id
    if expected_version is not None and expected_version != node.version_id:
        # Fetch current state for the conflict payload
        current_state = node_to_dict(node)
        raise ConflictException(
            entity_id=str(node_id),
            expected_version=expected_version,
            current_database_version=node.version_id,
            conflicting_user_upn=getattr(current_user, 'email', 'unknown'),
            current_state=current_state,
        )
    
    # Apply updates (exclude version_id — SQLAlchemy manages it)
    update_data = node_update.model_dump(exclude_unset=True, exclude={"version_id"})
    for key, value in update_data.items():
        setattr(node, key, value)

    # Auto-compute end date from start + duration + lag if duration or start changed
    if node.planned_start_date and node.duration_days:
        computed_end = _compute_planned_end_date(
            node.planned_start_date, node.duration_days, getattr(node, 'lag_days', None)
        )
        # Only auto-set if end date wasn't explicitly provided in this update
        if 'planned_end_date' not in update_data and computed_end:
            node.planned_end_date = computed_end

    # Hybrid delivery: capture baseline effort when a Waterfall node first gets Agile children
    _sync_hybrid_effort(db, node, update_data)

    db.commit()
    db.refresh(node)

    return node_to_dict(node)


def _sync_hybrid_effort(db: Session, node: PortfolioNode, update_data: dict) -> None:
    """Synchronize baseline_effort_days and agile_actual_effort_days for hybrid delivery tracking.

    When a Waterfall (or Hybrid) node has Agile children, preserve the original
    estimate in ``baseline_effort_days`` and compute the sum of Agile child
    durations in ``agile_actual_effort_days``.
    """
    from app.models.models import DeliveryMode

    # Only relevant for non-Agile parents
    if node.delivery_mode == DeliveryMode.AGILE:
        node.agile_actual_effort_days = None
        return

    # Find direct children that are Agile
    child_path_prefix = node.path + "."
    children = db.query(PortfolioNode).join(
        UniversalBreakdownNode, PortfolioNode.id == UniversalBreakdownNode.id
    ).filter(
        UniversalBreakdownNode.path.startswith(child_path_prefix),
        UniversalBreakdownNode.depth == node.depth + 1,
        PortfolioNode.delivery_mode == DeliveryMode.AGILE,
    ).all()

    if children:
        # Capture baseline from duration_days if not already set
        if node.baseline_effort_days is None and node.duration_days is not None:
            node.baseline_effort_days = node.duration_days

        # Sum Agile child durations
        total_agile = sum(
            child.duration_days or 0.0
            for child in children
        )
        node.agile_actual_effort_days = total_agile if total_agile > 0 else None
    else:
        # No Agile children — clear the computed field but keep baseline
        node.agile_actual_effort_days = None


@router.delete("/nodes/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_wbs_node(
    node_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a WBS node and all its descendants.
    
    Args:
        node_id: UUID of the node to delete
        db: Database session
        current_user: Authenticated user
        
    Raises:
        HTTPException: If node not found or insufficient clearance
    """
    user_clearance, user_caveats = _get_user_clearance_info(current_user)
    
    node = db.query(UniversalBreakdownNode).filter(
        UniversalBreakdownNode.id == node_id
    ).first()
    
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node {node_id} not found"
        )
    
    # Check ABAC access
    if not is_node_visible(user_clearance, user_caveats, node):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient security clearance for this resource"
        )

    # Check if this node is under an active sub-tree lock
    check_path_lock(db, node.path)

    # Delete the node (cascade will handle children)
    db.delete(node)
    db.commit()


@router.get("/nodes/{node_id}/descendants")
def get_descendants(
    node_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all descendants of a node with ABAC filtering.
    
    Args:
        node_id: UUID of the ancestor node
        db: Database session
        current_user: Authenticated user
        
    Returns:
        List of visible descendants
    """
    user_clearance, user_caveats = _get_user_clearance_info(current_user)
    
    # Query all descendants
    nodes = _query_subtree(db, node_id)
    
    # Remove the root node itself
    descendants = [n for n in nodes if n.id != node_id]
    
    # Apply ABAC filtering
    filtered = apply_abac_filtering(descendants, user_clearance, user_caveats)
    
    return filtered


@router.post("/batch-rollback")
def batch_rollback(
    rollback_request: BatchRollbackRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Atomically revert a batch of field-level mutations (Undo operation).

    This endpoint supports the client-side Undo/Redo stack by reverting
    multiple field changes in a single atomic database transaction.  Each
    revert operation is validated against the node's ``version_id`` for
    optimistic concurrency control.

    The rollback is recorded in the ForensicAuditLog with action type
    ``UNDO_REVERT``.  The SHA-256 hash chain is maintained by linking
    the new entry's ``prev_hash`` to the latest audit entry's
    ``current_hash``.  The ``json_diff`` field records both the reverted
    state and a pointer to the original ``transaction_id``.

    If a ``project_id`` is provided in the request, a CPM recalculation
    is triggered after the rollback completes so that float and critical
    path flags immediately reflect the restored state.

    Parameters
    ----------
    rollback_request : BatchRollbackRequest
        The undo batch payload containing revert operations.
    db : Session
        Database session.
    current_user : User
        Authenticated user requesting the rollback.

    Returns
    -------
    BatchRollbackResponse
        Per-operation results, audit log ID, and optional CPM results.

    Raises
    ------
    HTTPException
        404 if a node is not found, 403 if clearance is insufficient,
        409 if a version conflict is detected.
    """
    user_clearance, user_caveats = _get_user_clearance_info(current_user)

    # Collect unique node IDs from all revert operations
    node_ids = list({op.node_id for op in rollback_request.revert_operations})

    # Load all nodes in a single query
    nodes_by_id: Dict[str, UniversalBreakdownNode] = {}
    for nid in node_ids:
        node = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id == nid
        ).first()

        if not node:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Node {nid} not found",
            )

        # Check ABAC access — the user must be able to see the node
        if not is_node_visible(user_clearance, user_caveats, node):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient security clearance for node {nid}",
            )

        nodes_by_id[nid] = node

    # Group revert operations by node for efficient processing
    ops_by_node: Dict[str, List] = {}
    for op in rollback_request.revert_operations:
        ops_by_node.setdefault(op.node_id, []).append(op)

    # Track per-operation results
    results: List[RevertOperationResult] = []
    all_diffs: Dict[str, Any] = {}  # For the audit log json_diff

    # Begin atomic transaction — all reverts succeed or none do
    try:
        for node_id, ops in ops_by_node.items():
            node = nodes_by_id[node_id]

            node_diff: Dict[str, Any] = {
                "node_id": node_id,
                "reverts": [],
            }

            for op in ops:
                # Optimistic concurrency check
                if op.expected_version != node.version_id:
                    raise ConflictException(
                        entity_id=node_id,
                        expected_version=op.expected_version,
                        current_database_version=node.version_id,
                        conflicting_user_upn=getattr(current_user, "email", "unknown"),
                        current_state=node_to_dict(node),
                    )

                # Read the current value before reverting
                old_value = getattr(node, op.field, None)

                # Apply the revert
                setattr(node, op.field, op.revert_to)

                # SQLAlchemy's version_id_col automatically increments
                # version_id on commit, so we don't manually touch it.

                node_diff["reverts"].append({
                    "field": op.field,
                    "old_value": old_value,
                    "reverted_to": op.revert_to,
                })

            all_diffs[node_id] = node_diff

        # Commit all revert operations atomically
        db.commit()

        # Build per-operation results after successful commit
        for node_id, ops in ops_by_node.items():
            node = nodes_by_id[node_id]
            # Refresh to get the updated version_id
            db.refresh(node)

            for op in ops:
                old_value = all_diffs[node_id]["reverts"][
                    next(
                        i
                        for i, r in enumerate(all_diffs[node_id]["reverts"])
                        if r["field"] == op.field
                    )
                ]["old_value"]

                results.append(
                    RevertOperationResult(
                        node_id=node_id,
                        field=op.field,
                        old_value=old_value,
                        new_value=op.revert_to,
                        version_id=node.version_id,
                        success=True,
                        error=None,
                    )
                )

    except (ConflictException, HTTPException):
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch rollback failed: {str(e)}",
        )

    # Write ForensicAuditLog entry with SHA-256 chained hash
    rollback_transaction_id = uuid4()

    # Fetch the latest audit entry's current_hash for chain linkage
    latest_audit = (
        db.query(ForensicAuditLog)
        .order_by(ForensicAuditLog.created_at.desc())
        .first()
    )
    prev_hash = latest_audit.current_hash if latest_audit else ""

    audit_entry = ForensicAuditLog.create_entry(
        transaction_id=rollback_transaction_id,
        user_upn=getattr(current_user, "email", "unknown"),
        client_ip="unknown",
        action_type="UNDO_REVERT",
        entity_type="UniversalBreakdownNode",
        entity_id=uuid4(),  # synthetic ID for the batch operation
        json_diff={
            "original_transaction_id": rollback_request.transaction_id,
            "reverted_nodes": all_diffs,
            "operations_count": len(rollback_request.revert_operations),
        },
        security_marking=f"UNDO_REVERT by {getattr(current_user, 'email', 'unknown')}",
        prev_hash=prev_hash,
    )
    db.add(audit_entry)
    db.commit()

    # Build response
    succeeded = sum(1 for r in results if r.success)
    failed = sum(1 for r in results if not r.success)

    response = BatchRollbackResponse(
        transaction_id=rollback_request.transaction_id,
        rollback_audit_id=str(audit_entry.id),
        operations_count=len(rollback_request.revert_operations),
        operations_succeeded=succeeded,
        operations_failed=failed,
        results=results,
        cpm_recalculated=False,
        cpm_result=None,
    )

    # Trigger CPM recalculation if project_id is provided
    if rollback_request.project_id:
        try:
            from app.services.cpm_engine import calculate_cpm

            project_uuid = UUID(rollback_request.project_id)
            cpm_result = calculate_cpm(db, project_uuid)

            response.cpm_recalculated = True
            response.cpm_result = cpm_result
        except Exception as e:
            # CPM failure doesn't undo the rollback — just report it
            response.cpm_result = {"error": str(e)}

    return response


@router.post(
    "/",
    response_model=WorkItemCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new Work Item",
    description=(
        "Create a new WBS node (Programme, Project, Control Account, "
        "Work Package, Task, or Milestone) with permission-governed "
        "authorization.\n\n"
        "The endpoint performs three authorization gates before creating "
        "the node:\n\n"
        "1. **Baseline Lock Gate** — Blocks if the parent or any ancestor "
        "is locked under an active baseline freeze (HTTP 423).\n"
        "2. **Role Hierarchy Gate** — Blocks if the user's role does not "
        "authorise the target tier (HTTP 403).\n"
        "3. **Clearance Ceiling Gate** — Blocks if the target classification "
        "exceeds the user's clearance (HTTP 403).\n\n"
        "On success, the new node's ltree path is generated as "
        "``parent.path + '.' + sanitized_code``, and a ForensicAuditLog "
        "entry is written with action_type='ENTITY_CREATED'."
    ),
)
async def create_work_item(
    data: WorkItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new Work Item with permission-governed authorization.

    Validates creation permissions, generates the ltree path, writes the
    node atomically, and records a ForensicAuditLog entry.

    Args:
        data: The validated WorkItemCreate payload.
        current_user: The authenticated user.
        db: Database session.

    Returns:
        WorkItemCreatedResponse with the new node's id, code, name, path,
        tier, classification, and creation timestamp.

    Raises:
        HTTPException: 403 if authorization fails, 404 if parent not found,
            423 if baseline-locked.
    """
    # Step 1: Verify creation authority (three gates)
    parent = verify_node_creation_authority(
        parent_id=data.parent_id,
        target_tier=data.tier,
        user=current_user,
        db=db,
        target_classification=data.security_classification,
    )

    # Step 2: Generate ltree path
    if parent is None:
        # Root-level Programme — path is a new UUID-based segment
        new_path = str(uuid4())[:8]
    else:
        # Sanitize code for ltree: replace dots with underscores
        sanitized_code = data.code.replace(".", "_")
        new_path = f"{parent.path}.{sanitized_code}"

    # Step 3: Create the PortfolioNode (WBS node)
    now = datetime.now(timezone.utc)
    new_node_id = uuid4()

    # Compute planned dates from start + duration + lag
    planned_start = getattr(data, 'planned_start', None)
    planned_duration = getattr(data, 'duration_days', 0) or 0
    planned_lag = getattr(data, 'lag_days', 0) or 0
    planned_finish = getattr(data, 'planned_finish', None)

    # Auto-compute finish date if not provided
    if not planned_finish and planned_start and planned_duration and planned_duration > 0:
        # Convert string dates to datetime for _compute_planned_end_date
        if isinstance(planned_start, str):
            start_dt = datetime.fromisoformat(planned_start)
        else:
            start_dt = planned_start
        planned_finish_dt = _compute_planned_end_date(start_dt, int(planned_duration), int(planned_lag))
        if planned_finish_dt:
            planned_finish = planned_finish_dt.strftime('%Y-%m-%d') if isinstance(planned_finish_dt, datetime) else str(planned_finish_dt)[:10]

    new_node = PortfolioNode(
        id=new_node_id,
        parent_id=data.parent_id,
        tree_type=TreeType.WBS,
        code=data.code,
        name=data.name,
        path=new_path,
        security_classification=data.security_classification,
        caveats=data.caveats,
        custom_attributes=data.custom_attributes or {},
        is_active=True,
        delivery_mode=data.delivery_mode,
        planned_start_date=planned_start,
        planned_end_date=planned_finish,
        duration_days=int(planned_duration) if planned_duration else None,
        lag_days=int(planned_lag) if planned_lag else 0,
        percent_complete=0.0,
        dal_sil_level=data.dal_sil_level,
        engineering_baseline_tier=data.engineering_baseline_tier,
        export_control_regime=data.export_control_regime,
        eccn_or_usml_category=data.eccn_or_usml_category,
        authorized_nationalities=data.authorized_nationalities,
        taa_mla_reference=data.taa_mla_reference,
        created_at=now,
        updated_at=now,
    )

    db.add(new_node)
    db.flush()

    # Step 4: Write ForensicAuditLog entry
    latest_audit = (
        db.query(ForensicAuditLog)
        .order_by(ForensicAuditLog.created_at.desc())
        .first()
    )
    prev_hash = latest_audit.current_hash if latest_audit else ""

    audit_entry = ForensicAuditLog.create_entry(
        transaction_id=uuid4(),
        user_upn=getattr(current_user, "email", "unknown"),
        client_ip="unknown",
        action_type="ENTITY_CREATED",
        entity_type="PortfolioNode",
        entity_id=new_node_id,
        json_diff={
            "code": data.code,
            "name": data.name,
            "tier": data.tier,
            "path": new_path,
            "parent_id": str(data.parent_id) if data.parent_id else None,
            "security_classification": data.security_classification.value
            if hasattr(data.security_classification, "value")
            else str(data.security_classification),
        },
        security_marking=f"ENTITY_CREATED by {getattr(current_user, 'email', 'unknown')}",
        prev_hash=prev_hash,
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(new_node)

    return WorkItemCreatedResponse(
        id=new_node.id,
        code=new_node.code,
        name=new_node.name,
        path=new_node.path,
        tier=data.tier,
        security_classification=new_node.security_classification.value
        if hasattr(new_node.security_classification, "value")
        else str(new_node.security_classification),
        created_at=new_node.created_at,
    )
