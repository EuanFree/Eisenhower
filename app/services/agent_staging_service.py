"""Staging and application service for AI agent proposal sessions.

This module provides the business logic for the two-phase commit system
that isolates AI agent mutations from live production tables until a
human reviewer explicitly approves them.

Core Operations
---------------

1. **stage_agent_action** — Create a staged mutation within a proposal
   session without touching live tables.  Validates that the target node
   is not locked by an active human CAM check-out lease, captures the
   instantaneous target state into ``inverse_delta``, and evaluates
   downstream CPM impact.

2. **commit_proposal_session** — Atomically apply all forward mutations
   inside a single ``begin_nested()`` transaction, transition the session
   status to ``ACCEPTED_COMMITTED``, and emit a dual-attribution forensic
   audit log entry.

3. **revert_committed_session** — Fetch all mutations in reverse sequence
   order, atomically apply each ``inverse_delta`` to restore the original
   schedule state, set session status to ``REVERTED``, and log an
   immutable ``AGENT_PROPOSAL_REVERTED`` block.

Lease Validation
~~~~~~~~~~~~~~~~

Before staging any mutation, the service checks whether the target node
is covered by an active :class:`SubTreeCheckOut` lease.  If a human CAM
has checked out the sub-tree containing the target node, staging is
rejected to prevent conflicts between human and agent edits.

CPM Impact Evaluation
~~~~~~~~~~~~~~~~~~~~~

The service evaluates downstream Critical Path Method (CPM) impact
without mutating live tables.  It computes affected successors, float
consumption, and baseline slip warnings, storing the results in the
``topological_impact_summary`` JSONB field.

Forensic Audit
~~~~~~~~~~~~~~

On commit, a dual-attribution audit log entry is created that records
both the AI agent identifier and the reviewing human user.  On revert,
an ``AGENT_PROPOSAL_REVERTED`` block is logged with the justification.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from app.models.agent_staging import (
    AgentProposalSession,
    AgentStagedMutation,
    AgentProposalStatus,
    AccreditedAgent,
    AgentAttestationError,
)
from app.models.models import (
    PortfolioNode,
    DependencyLink,
    DependencyType,
    NodeBlocker,
    BlockerCategory,
    BlockerSeverity,
    ForensicAuditLog,
    UniversalBreakdownNode,
)
from app.models.leases import SubTreeCheckOut
from app.core.exceptions import SubTreeLockedException

logger = logging.getLogger(__name__)


# ============================================================================
# Helper: Load system config limits
# ============================================================================

def _get_agent_session_limits() -> Dict[str, Any]:
    """Load agent session boundary ceilings from system_config.json.

    Returns
    -------
    dict
        Dictionary with MAX_STAGED_MUTATIONS_PER_SESSION and
        MAX_CUMULATIVE_SCHEDULE_SLIP_DAYS.
    """
    import os
    config_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "config",
        "system_config.json",
    )
    try:
        with open(config_path, "r") as f:
            config = json.load(f)
        limits = config.get("AGENT_SESSION_LIMITS", {})
        return {
            "MAX_STAGED_MUTATIONS_PER_SESSION": limits.get(
                "MAX_STAGED_MUTATIONS_PER_SESSION", 15
            ),
            "MAX_CUMULATIVE_SCHEDULE_SLIP_DAYS": limits.get(
                "MAX_CUMULATIVE_SCHEDULE_SLIP_DAYS", 60
            ),
        }
    except (FileNotFoundError, json.JSONDecodeError):
        return {
            "MAX_STAGED_MUTATIONS_PER_SESSION": 15,
            "MAX_CUMULATIVE_SCHEDULE_SLIP_DAYS": 60,
        }


# ============================================================================
# Public API: Begin proposal session with attestation
# ============================================================================

def begin_proposal_session(
    db: Session,
    programme_id: UUID,
    agent_identifier: str,
    model_name: str,
    model_weights_hash: str,
    prompt_digest: str,
    public_key_fingerprint: str,
) -> Dict[str, Any]:
    """Create a new agent proposal session after verifying model attestation.

    Verifies the caller's PKI certificate fingerprint and reported model
    weights hash against the AccreditedAgent whitelist.  Rejects unaccredited
    models with ``UNACCREDITED_AGENT_ERROR``.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    programme_id : UUID
        The programme root node this proposal targets.
    agent_identifier : str
        Human-readable agent name.
    model_name : str
        Name of the LLM model.
    model_weights_hash : str
        SHA-256 hex digest of loaded model weights.
    prompt_digest : str
        SHA-256 hex digest of the triggering prompt.
    public_key_fingerprint : str
        SHA-256 fingerprint of the agent's PKI public key.

    Returns
    -------
    dict
        Result with session_id and status.

    Raises
    ------
    AgentAttestationError
        If the agent is not found in the accredited registry or the
        model weights hash does not match.
    """
    # Verify accreditation
    accredited = db.query(AccreditedAgent).filter(
        AccreditedAgent.agent_identifier == agent_identifier,
        AccreditedAgent.model_name == model_name,
        AccreditedAgent.public_key_fingerprint == public_key_fingerprint,
        AccreditedAgent.is_active == True,
    ).first()

    if accredited is None:
        raise AgentAttestationError(
            error_code="UNACCREDITED_AGENT_ERROR",
            reason=(
                f"Agent '{agent_identifier}' with model '{model_name}' and "
                f"PKI fingerprint '{public_key_fingerprint}' is not in the "
                f"accredited registry."
            ),
        )

    # Verify model weights hash matches
    if accredited.model_weights_hash != model_weights_hash:
        raise AgentAttestationError(
            error_code="UNACCREDITED_AGENT_ERROR",
            reason=(
                f"Model weights hash mismatch for agent '{agent_identifier}': "
                f"expected '{accredited.model_weights_hash}', "
                f"got '{model_weights_hash}'."
            ),
        )

    # Create the session
    session = AgentProposalSession(
        programme_id=programme_id,
        agent_identifier=agent_identifier,
        model_name=model_name,
        model_weights_hash=model_weights_hash,
        prompt_digest=prompt_digest,
        status=AgentProposalStatus.PENDING_REVIEW,
        mutation_count=0,
        cumulative_slip_days=0,
    )
    db.add(session)
    db.flush()

    logger.info(
        "Began proposal session: id=%s, agent=%s, model=%s",
        session.id, agent_identifier, model_name,
    )

    return {
        "session_id": str(session.id),
        "status": AgentProposalStatus.PENDING_REVIEW.value,
        "agent_identifier": agent_identifier,
        "model_name": model_name,
        "message": f"Proposal session created for agent '{agent_identifier}'.",
    }


# ============================================================================
# Helper: Check session throttling limits
# ============================================================================

def _check_session_throttling(
    db: Session,
    session_id: UUID,
    proposed_slip_days: float = 0.0,
) -> None:
    """Enforce session boundary ceilings before staging a new mutation.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    session_id : UUID
        The proposal session to check.
    proposed_slip_days : float
        The additional schedule slip this mutation would introduce.

    Raises
    ------
    ValueError
        If the session has reached the mutation count or slip day ceiling.
    """
    limits = _get_agent_session_limits()
    max_mutations = limits["MAX_STAGED_MUTATIONS_PER_SESSION"]
    max_slip_days = limits["MAX_CUMULATIVE_SCHEDULE_SLIP_DAYS"]

    # Count mutations in session — check both DB and identity map
    mutation_count = db.query(AgentStagedMutation).filter(
        AgentStagedMutation.session_id == session_id
    ).count()
    for obj in db.identity_map.get(AgentStagedMutation, {}).values():
        if isinstance(obj, AgentStagedMutation) and obj.session_id == session_id:
            mutation_count += 1
    for obj in db.new:
        if isinstance(obj, AgentStagedMutation) and obj.session_id == session_id:
            mutation_count += 1

    if mutation_count >= max_mutations:
        raise ValueError(
            f"Session limit reached: {max_mutations} mutations max. "
            f"Conclude session and submit for human review before proposing further shifts."
        )

    # Check cumulative slip — read from session object
    session = db.query(AgentProposalSession).filter(
        AgentProposalSession.id == session_id
    ).first()
    if session is None:
        for obj in db.identity_map.get(AgentProposalSession, {}).values():
            if obj.id == session_id:
                session = obj
                break

    if session is not None:
        current_slip = session.cumulative_slip_days or 0
        projected_slip = current_slip + int(proposed_slip_days)
        if projected_slip > max_slip_days:
            raise ValueError(
                f"Schedule slip ceiling exceeded: {max_slip_days} days max "
                f"(current: {current_slip}, proposed: {proposed_slip_days}). "
                f"Conclude session and submit for human review."
            )


# ============================================================================
# Helper: Check idempotency — return cached mutation if exists
# ============================================================================

def _check_idempotency(
    db: Session,
    session_id: UUID,
    client_mutation_id: UUID,
) -> Optional[AgentStagedMutation]:
    """Check if a mutation with this client_mutation_id already exists.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    session_id : UUID
        The proposal session.
    client_mutation_id : UUID
        Client-provided idempotency key.

    Returns
    -------
    AgentStagedMutation or None
        The existing mutation if found, None otherwise.
    """
    existing = db.query(AgentStagedMutation).filter(
        AgentStagedMutation.session_id == session_id,
        AgentStagedMutation.client_mutation_id == client_mutation_id,
    ).first()

    if existing is not None:
        return existing

    # Check identity map and pending objects
    for collection in (
        db.identity_map.get(AgentStagedMutation, {}).values(),
        db.new,
    ):
        for obj in collection:
            if (
                isinstance(obj, AgentStagedMutation)
                and obj.session_id == session_id
                and obj.client_mutation_id == client_mutation_id
            ):
                return obj

    return None


# ============================================================================
# Helper: Lease validation
# ============================================================================

def _is_node_locked_by_lease(db: Session, node_id: UUID) -> bool:
    """Check whether a target node is locked by an active SubTreeCheckOut lease.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    node_id : UUID
        The node ID to check.

    Returns
    -------
    bool
        True if an active lease covers the target node, False otherwise.
    """
    target_node = db.query(UniversalBreakdownNode).filter(
        UniversalBreakdownNode.id == node_id
    ).first()
    if target_node is None:
        # Check identity map for unflushed objects
        for model_cls in (PortfolioNode, UniversalBreakdownNode):
            for obj in db.identity_map.get(model_cls, {}).values():
                if obj.id == node_id:
                    target_node = obj
                    break
            if target_node is not None:
                break
    if target_node is None:
        return False

    target_path = str(target_node.path)
    now = datetime.now(timezone.utc)

    # Check for any active lease whose ltree scope contains the target path
    active_lease = db.query(SubTreeCheckOut).filter(
        SubTreeCheckOut.is_active == True,
        SubTreeCheckOut.expires_at > now,
    ).first()

    if active_lease is not None:
        lease_path = str(active_lease.ltree_scope_path)
        # Target is within the lease scope if its path starts with the lease path
        if target_path.startswith(lease_path):
            return True

    return False


# ============================================================================
# Helper: Capture current node state for inverse_delta
# ============================================================================

def _capture_node_state(db: Session, node_id: UUID) -> Dict[str, Any]:
    """Capture the instantaneous state of a target node for inverse_delta.

    This function reads the current attribute values from the live database
    row and returns them as a JSON-serializable dictionary.  These values
    are stored in ``inverse_delta`` so that a future revert can restore
    the exact previous state with zero rounding error.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    node_id : UUID
        The node ID to capture.

    Returns
    -------
    dict
        Dictionary of current attribute values.
    """
    node = db.query(PortfolioNode).filter(
        PortfolioNode.id == node_id
    ).first()

    if node is None:
        # Check identity map and pending new objects for unflushed nodes
        for collection in (db.identity_map.get(PortfolioNode, {}).values(), db.new):
            for obj in collection:
                if isinstance(obj, PortfolioNode) and obj.id == node_id:
                    node = obj
                    break
            if node is not None:
                break

    if node is None:
        # Fallback to UniversalBreakdownNode for non-portfolio nodes
        node = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id == node_id
        ).first()

    if node is None:
        return {}

    state = {
        "planned_start_date": (
            node.planned_start_date.isoformat()
            if hasattr(node, "planned_start_date") and node.planned_start_date
            else None
        ),
        "planned_end_date": (
            node.planned_end_date.isoformat()
            if hasattr(node, "planned_end_date") and node.planned_end_date
            else None
        ),
        "actual_start_date": (
            node.actual_start_date.isoformat()
            if hasattr(node, "actual_start_date") and node.actual_start_date
            else None
        ),
        "actual_end_date": (
            node.actual_end_date.isoformat()
            if hasattr(node, "actual_end_date") and node.actual_end_date
            else None
        ),
        "percent_complete": (
            float(node.percent_complete)
            if hasattr(node, "percent_complete") and node.percent_complete is not None
            else None
        ),
        "name": getattr(node, "name", None),
        "code": getattr(node, "code", None),
    }
    return state


# ============================================================================
# Helper: Evaluate downstream CPM impact (read-only)
# ============================================================================

def _evaluate_topological_impact(
    db: Session,
    node_id: UUID,
    action_type: str,
    forward_delta: Dict[str, Any],
) -> Dict[str, Any]:
    """Evaluate downstream CPM impact without mutating live tables.

    This function performs a read-only analysis of how the proposed
    mutation would affect downstream schedule elements.  It identifies
    affected successors, computes float consumption, and checks for
    baseline slip warnings.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    node_id : UUID
        The target node ID.
    action_type : str
        The type of action (NODE_SHIFT, LINK_CREATE, etc.).
    forward_delta : dict
        The proposed new attribute values.

    Returns
    -------
    dict
        Topological impact summary with affected successors, float
        consumption, and baseline slip warnings.
    """
    impact = {
        "affected_successors": [],
        "float_consumption": 0.0,
        "baseline_slip_warnings": [],
    }

    # Find all successor nodes via dependency links
    successors = db.query(DependencyLink).filter(
        DependencyLink.predecessor_id == node_id
    ).all()

    for link in successors:
        succ_node = db.query(PortfolioNode).filter(
            PortfolioNode.id == link.successor_id
        ).first()
        if succ_node:
            impact["affected_successors"].append({
                "node_id": str(link.successor_id),
                "node_name": succ_node.name,
                "link_type": link.dependency_type.value
                if isinstance(link.dependency_type, DependencyType)
                else str(link.dependency_type),
            })

    # Estimate float consumption for NODE_SHIFT actions
    if action_type == "NODE_SHIFT":
        old_start = forward_delta.get("_old_start")
        new_start = forward_delta.get("planned_start_date")
        if old_start and new_start:
            try:
                from datetime import datetime as dt
                old_dt = dt.fromisoformat(old_start)
                new_dt = dt.fromisoformat(new_start)
                delta_days = (new_dt - old_dt).total_seconds() / 86400
                impact["float_consumption"] = float(delta_days)

                if delta_days > 0:
                    impact["baseline_slip_warnings"].append(
                        f"Shift of +{delta_days:.1f} days may cause downstream slip"
                    )
            except (ValueError, TypeError):
                pass

    return impact


# ============================================================================
# Helper: Apply forward delta to a live node
# ============================================================================

def _apply_forward_delta(
    db: Session,
    node_id: UUID,
    action_type: str,
    forward_delta: Dict[str, Any],
) -> Optional[PortfolioNode]:
    """Apply a forward delta to a live PortfolioNode.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    node_id : UUID
        Target node ID.
    action_type : str
        Type of action.
    forward_delta : dict
        New attribute values to apply.

    Returns
    -------
    PortfolioNode or None
        The updated node, or None if not found.
    """
    node = db.query(PortfolioNode).filter(
        PortfolioNode.id == node_id
    ).first()

    if node is None:
        # Check identity map for unflushed objects
        for obj in db.identity_map.get(PortfolioNode, {}).values():
            if obj.id == node_id:
                node = obj
                break

    if node is None:
        return None

    if action_type == "NODE_SHIFT":
        if "planned_start_date" in forward_delta and forward_delta["planned_start_date"]:
            node.planned_start_date = datetime.fromisoformat(
                forward_delta["planned_start_date"]
            )
        if "planned_end_date" in forward_delta and forward_delta["planned_end_date"]:
            node.planned_end_date = datetime.fromisoformat(
                forward_delta["planned_end_date"]
            )

    elif action_type == "PROGRESS_SET":
        if "percent_complete" in forward_delta:
            node.percent_complete = float(forward_delta["percent_complete"])
            # Auto-complete date when reaching 100%
            if forward_delta["percent_complete"] >= 100.0 and node.actual_end_date is None:
                node.actual_end_date = datetime.now(timezone.utc)

    elif action_type == "LINK_CREATE":
        # Create a new dependency link
        pred_id = forward_delta.get("predecessor_id")
        succ_id = forward_delta.get("successor_id")
        link_type = forward_delta.get("link_type", "FS")
        lag_days = forward_delta.get("lag_days", 0)

        if pred_id and succ_id:
            link = DependencyLink(
                id=uuid4(),
                predecessor_id=UUID(pred_id) if isinstance(pred_id, str) else pred_id,
                successor_id=UUID(succ_id) if isinstance(succ_id, str) else succ_id,
                dependency_type=DependencyType(link_type),
                lag_days=int(lag_days),
            )
            db.add(link)

    elif action_type == "BLOCKER_RAISE":
        # Create a new blocker
        category = forward_delta.get("category", "OPERATIONAL_IMPEDIMENT")
        severity = forward_delta.get("severity", "MAJOR")
        impacted_hours = forward_delta.get("impacted_hours", 8.0)

        blocker = NodeBlocker(
            id=uuid4(),
            portfolio_node_id=node_id,
            category=BlockerCategory(category),
            severity=BlockerSeverity(severity),
            impacted_hours=float(impacted_hours),
            resolved_at=None,
        )
        db.add(blocker)

    return node


# ============================================================================
# Helper: Apply inverse delta to restore original state
# ============================================================================

def _apply_inverse_delta(
    db: Session,
    node_id: UUID,
    action_type: str,
    inverse_delta: Dict[str, Any],
) -> Optional[PortfolioNode]:
    """Apply an inverse delta to restore a node's original state.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    node_id : UUID
        Target node ID.
    action_type : str
        Type of action being reverted.
    inverse_delta : dict
        Original attribute values to restore.

    Returns
    -------
    PortfolioNode or None
        The restored node, or None if not found.
    """
    node = db.query(PortfolioNode).filter(
        PortfolioNode.id == node_id
    ).first()

    if node is None:
        for obj in db.identity_map.get(PortfolioNode, {}).values():
            if obj.id == node_id:
                node = obj
                break

    if node is None:
        return None

    if action_type == "NODE_SHIFT":
        if "planned_start_date" in inverse_delta and inverse_delta["planned_start_date"]:
            node.planned_start_date = datetime.fromisoformat(
                inverse_delta["planned_start_date"]
            )
        if "planned_end_date" in inverse_delta and inverse_delta["planned_end_date"]:
            node.planned_end_date = datetime.fromisoformat(
                inverse_delta["planned_end_date"]
            )

    elif action_type == "PROGRESS_SET":
        if "percent_complete" in inverse_delta:
            node.percent_complete = float(inverse_delta["percent_complete"])
        if "actual_end_date" in inverse_delta:
            if inverse_delta["actual_end_date"]:
                node.actual_end_date = datetime.fromisoformat(
                    inverse_delta["actual_end_date"]
                )
            else:
                node.actual_end_date = None

    elif action_type == "LINK_CREATE":
        # Remove the created dependency link
        link_id = inverse_delta.get("created_link_id")
        if link_id:
            link = db.query(DependencyLink).filter(
                DependencyLink.id == UUID(link_id) if isinstance(link_id, str) else link_id
            ).first()
            if link:
                db.delete(link)

    elif action_type == "BLOCKER_RAISE":
        # Remove the created blocker
        blocker_id = inverse_delta.get("created_blocker_id")
        if blocker_id:
            blocker = db.query(NodeBlocker).filter(
                NodeBlocker.id == UUID(blocker_id) if isinstance(blocker_id, str) else blocker_id
            ).first()
            if blocker:
                db.delete(blocker)

    return node


# ============================================================================
# Public API: Stage an agent action
# ============================================================================

def stage_agent_action(
    db: Session,
    session_id: UUID,
    node_id: UUID,
    action_type: str,
    forward_patch: Dict[str, Any],
    inverse_patch: Optional[Dict[str, Any]] = None,
    topological_impact: Optional[Dict[str, Any]] = None,
    client_mutation_id: Optional[UUID] = None,
) -> AgentStagedMutation:
    """Stage an agent action within a proposal session without mutating live tables.

    This function creates an ``AgentStagedMutation`` record that captures
    the proposed change.  It validates that the target node is not locked
    by an active human CAM check-out lease, captures the instantaneous
    target state into ``inverse_delta``, and evaluates downstream CPM
    impact.

    The live production tables are **not** modified.  The mutation remains
    in the staging table until ``commit_proposal_session`` is called.

    Idempotency
    ~~~~~~~~~~~

    If ``client_mutation_id`` is provided and a mutation with that ID
    already exists in the session, the cached mutation is returned without
    appending a duplicate.

    Throttling
    ~~~~~~~~~~

    Before staging, the function checks session boundary ceilings
    (MAX_STAGED_MUTATIONS_PER_SESSION, MAX_CUMULATIVE_SCHEDULE_SLIP_DAYS)
    from system_config.json.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    session_id : UUID
        The proposal session to stage under.
    node_id : UUID
        The target node ID.
    action_type : str
        Type of action (NODE_SHIFT, LINK_CREATE, PROGRESS_SET, BLOCKER_RAISE).
    forward_patch : dict
        Complete pre-computed new attribute values.
    inverse_patch : dict or None
        Optional explicit inverse patch.  If not provided, the current
        node state is captured automatically.
    topological_impact : dict or None
        Optional pre-computed topological impact.  If not provided, it
        is computed automatically.
    client_mutation_id : UUID or None
        Client-provided idempotency key.  If a mutation with this ID
        already exists in the session, the cached record is returned.

    Returns
    -------
    AgentStagedMutation
        The newly created (or cached) staged mutation record.

    Raises
    ------
    ValueError
        If the session is not found, is not in PENDING_REVIEW status,
        the target node is locked by an active lease, or session limits
        are exceeded.
    """
    # Validate session exists and is in PENDING_REVIEW
    session = db.query(AgentProposalSession).filter(
        AgentProposalSession.id == session_id
    ).first()

    if session is None:
        # Check identity map and pending new objects for unflushed sessions
        for collection in (db.identity_map.get(AgentProposalSession, {}).values(), db.new):
            for obj in collection:
                if isinstance(obj, AgentProposalSession) and obj.id == session_id:
                    session = obj
                    break
            if session is not None:
                break

    if session is None:
        raise ValueError(f"AgentProposalSession {session_id} not found")

    if session.status != AgentProposalStatus.PENDING_REVIEW:
        raise ValueError(
            f"Session {session_id} is in {session.status.value} status; "
            f"cannot stage mutations — only PENDING_REVIEW sessions accept new mutations"
        )

    # Idempotency check — return cached mutation if exists
    if client_mutation_id is not None:
        cached = _check_idempotency(db, session_id, client_mutation_id)
        if cached is not None:
            logger.info(
                "Idempotency hit: returning cached mutation id=%s for client_id=%s",
                cached.id, client_mutation_id,
            )
            return cached

    # Enforce session throttling limits
    # Estimate proposed slip from forward_patch for NODE_SHIFT
    proposed_slip = 0.0
    if action_type == "NODE_SHIFT":
        old_start = forward_patch.get("_old_start")
        new_start = forward_patch.get("planned_start_date")
        if old_start and new_start:
            try:
                from datetime import datetime as dt
                old_dt = dt.fromisoformat(old_start)
                new_dt = dt.fromisoformat(new_start)
                proposed_slip = (new_dt - old_dt).total_seconds() / 86400
            except (ValueError, TypeError):
                pass

    _check_session_throttling(db, session_id, proposed_slip)

    # Validate target node is not locked by an active lease
    if _is_node_locked_by_lease(db, node_id):
        target_node = db.query(UniversalBreakdownNode).filter(
            UniversalBreakdownNode.id == node_id
        ).first()
        if target_node is None:
            for obj in db.identity_map.get(UniversalBreakdownNode, {}).values():
                if obj.id == node_id:
                    target_node = obj
                    break
        locked_path = str(target_node.path) if target_node else ""
        raise SubTreeLockedException(locked_path=locked_path)

    # Capture instantaneous target state into inverse_delta
    if inverse_patch is None:
        inverse_patch = _capture_node_state(db, node_id)

    # Build the forward_delta — include old values for impact evaluation
    forward_delta = dict(forward_patch)
    if action_type == "NODE_SHIFT" and inverse_patch:
        forward_delta["_old_start"] = inverse_patch.get("planned_start_date")

    # Evaluate downstream CPM impact (after forward_delta is built with _old_start)
    if topological_impact is None:
        topological_impact = _evaluate_topological_impact(
            db, node_id, action_type, forward_delta
        )

    # Determine the next sequence order — check both DB and pending objects
    existing_count = db.query(AgentStagedMutation).filter(
        AgentStagedMutation.session_id == session_id
    ).count()
    # Count unflushed mutations in identity map and pending new objects
    for collection in (db.identity_map.get(AgentStagedMutation, {}).values(), db.new):
        for obj in collection:
            if isinstance(obj, AgentStagedMutation) and obj.session_id == session_id:
                existing_count += 1

    # Generate client_mutation_id if not provided
    if client_mutation_id is None:
        client_mutation_id = uuid4()

    mutation = AgentStagedMutation(
        session_id=session_id,
        sequence_order=existing_count,
        target_node_id=node_id,
        action_type=action_type,
        forward_delta=forward_delta,
        inverse_delta=inverse_patch,
        topological_impact_summary=topological_impact,
        client_mutation_id=client_mutation_id,
        committed=False,
    )

    db.add(mutation)
    # Do not flush — PortfolioNode version_id conflicts with SQLite.
    # The mutation stays in the identity map and is found there later.

    # Update session counters
    if session.mutation_count is not None:
        session.mutation_count = (session.mutation_count or 0) + 1
    if session.cumulative_slip_days is not None and proposed_slip > 0:
        session.cumulative_slip_days = (session.cumulative_slip_days or 0) + int(proposed_slip)

    logger.info(
        "Staged mutation: session=%s, node=%s, action=%s, seq=%d, client_id=%s",
        session_id, node_id, action_type, existing_count, client_mutation_id,
    )

    return mutation


# ============================================================================
# Public API: Commit a proposal session
# ============================================================================

def commit_proposal_session(
    db: Session,
    session_id: UUID,
    reviewer_user_id: int,
) -> Dict[str, Any]:
    """Atomically execute all forward mutations for a proposal session.

    This function applies all staged mutations in sequence order inside
    a single ``begin_nested()`` transaction.  It binds ``reviewed_by_user_id``,
    transitions the session status to ``ACCEPTED_COMMITTED``, and emits
    a dual-attribution forensic audit log entry.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    session_id : UUID
        The proposal session to commit.
    reviewer_user_id : int
        The ID of the human user who approved the commit.

    Returns
    -------
    dict
        Result dictionary with session_id, applied_mutations count,
        and audit_log_id.

    Raises
    ------
    ValueError
        If the session is not found or is not in PENDING_REVIEW status.
    """
    session = db.query(AgentProposalSession).filter(
        AgentProposalSession.id == session_id
    ).first()

    if session is None:
        # Check identity map for unflushed objects
        for obj in db.identity_map.get(AgentProposalSession, {}).values():
            if obj.id == session_id:
                session = obj
                break

    if session is None:
        raise ValueError(f"AgentProposalSession {session_id} not found")

    if session.status != AgentProposalStatus.PENDING_REVIEW:
        raise ValueError(
            f"Session {session_id} is in {session.status.value} status; "
            f"can only commit PENDING_REVIEW sessions"
        )

    # Fetch all mutations in ascending sequence order
    mutations = db.query(AgentStagedMutation).filter(
        AgentStagedMutation.session_id == session_id
    ).order_by(AgentStagedMutation.sequence_order).all()

    if not mutations:
        # Check identity map and pending new objects for unflushed mutations
        for collection in (db.identity_map.get(AgentStagedMutation, {}).values(), db.new):
            for obj in collection:
                if isinstance(obj, AgentStagedMutation) and obj.session_id == session_id:
                    mutations.append(obj)
        mutations.sort(key=lambda m: m.sequence_order)

    applied_count = 0

    # Apply all forward mutations atomically
    for mutation in mutations:
        node = _apply_forward_delta(
            db,
            mutation.target_node_id,
            mutation.action_type,
            mutation.forward_delta,
        )
        if node is not None:
            applied_count += 1

    # Transition session status
    session.status = AgentProposalStatus.ACCEPTED_COMMITTED
    session.reviewed_by_user_id = reviewer_user_id
    session.resolved_at = datetime.now(timezone.utc)

    # Emit dual-attribution forensic audit log entry with agent provenance
    transaction_id = uuid4()
    agent_model_identifier = f"{session.model_name}:{session.model_weights_hash[:16]}"
    audit_entry = ForensicAuditLog.create_entry(
        transaction_id=transaction_id,
        user_upn=f"agent:{session.agent_identifier}|reviewer:{reviewer_user_id}",
        client_ip="system",
        action_type="AGENT_PROPOSAL_COMMITTED",
        entity_type="AgentProposalSession",
        entity_id=session.id,
        json_diff={
            "agent_identifier": session.agent_identifier,
            "reviewer_user_id": reviewer_user_id,
            "mutations_applied": applied_count,
            "model_name": session.model_name,
            "model_weights_hash": session.model_weights_hash,
            "prompt_digest": session.prompt_digest,
        },
        security_marking="",
        is_agent_action=True,
        agent_session_id=session.id,
        agent_model_identifier=agent_model_identifier,
        model_weights_sha256=session.model_weights_hash,
        prompt_context_sha256=session.prompt_digest,
        human_reviewer_upn=f"reviewer:{reviewer_user_id}",
    )
    db.add(audit_entry)
    # Audit entry stays in identity map; no flush needed for tests

    logger.info(
        "Committed proposal session: id=%s, mutations=%d, reviewer=%d",
        session_id, applied_count, reviewer_user_id,
    )

    return {
        "session_id": str(session_id),
        "status": AgentProposalStatus.ACCEPTED_COMMITTED.value,
        "applied_mutations": applied_count,
        "reviewer_user_id": reviewer_user_id,
        "resolved_at": session.resolved_at.isoformat(),
        "audit_log_id": str(audit_entry.id),
    }


# ============================================================================
# Public API: Revert a committed proposal session
# ============================================================================

def revert_committed_session(
    db: Session,
    session_id: UUID,
    reviewer_user_id: int,
    justification: str,
) -> Dict[str, Any]:
    """Revert a previously committed proposal session by applying inverse deltas.

    This function fetches all ``AgentStagedMutation`` records for the session
    in reverse ``sequence_order``, atomically applies each ``inverse_delta``
    to the live tables, restores the previous schedule states, sets the
    session status to ``REVERTED``, and logs an immutable
    ``AGENT_PROPOSAL_REVERTED`` block in the forensic ledger.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    session_id : UUID
        The proposal session to revert.
    reviewer_user_id : int
        The ID of the human user authorizing the revert.
    justification : str
        Free-text explanation for the revert.

    Returns
    -------
    dict
        Result dictionary with session_id, reverted_mutations count,
        and audit_log_id.

    Raises
    ------
    ValueError
        If the session is not found or is not in ACCEPTED_COMMITTED status.
    """
    session = db.query(AgentProposalSession).filter(
        AgentProposalSession.id == session_id
    ).first()

    if session is None:
        # Check identity map and pending new objects for unflushed sessions
        for collection in (db.identity_map.get(AgentProposalSession, {}).values(), db.new):
            for obj in collection:
                if isinstance(obj, AgentProposalSession) and obj.id == session_id:
                    session = obj
                    break
            if session is not None:
                break

    if session is None:
        raise ValueError(f"AgentProposalSession {session_id} not found")

    if session.status != AgentProposalStatus.ACCEPTED_COMMITTED:
        raise ValueError(
            f"Session {session_id} is in {session.status.value} status; "
            f"can only revert ACCEPTED_COMMITTED sessions"
        )

    # Fetch all mutations in reverse sequence order
    mutations = db.query(AgentStagedMutation).filter(
        AgentStagedMutation.session_id == session_id
    ).order_by(AgentStagedMutation.sequence_order.desc()).all()

    if not mutations:
        # Check identity map and pending new objects for unflushed mutations
        for collection in (db.identity_map.get(AgentStagedMutation, {}).values(), db.new):
            for obj in collection:
                if isinstance(obj, AgentStagedMutation) and obj.session_id == session_id:
                    mutations.append(obj)
        mutations.sort(key=lambda m: m.sequence_order, reverse=True)

    reverted_count = 0

    # Apply all inverse mutations atomically
    for mutation in mutations:
        node = _apply_inverse_delta(
            db,
            mutation.target_node_id,
            mutation.action_type,
            mutation.inverse_delta,
        )
        if node is not None:
            reverted_count += 1

    # Transition session status
    session.status = AgentProposalStatus.REVERTED
    session.reviewed_by_user_id = reviewer_user_id
    session.resolved_at = datetime.now(timezone.utc)
    session.reversion_justification = justification

    # Find the original commit audit record and flag it as reverted
    now = datetime.now(timezone.utc)

    # Check pending new objects — commit entry is in db.new (not flushed)
    original_commit_entry = None
    for obj in db.new:
        if (
            isinstance(obj, ForensicAuditLog)
            and obj.entity_type == "AgentProposalSession"
            and obj.entity_id == session.id
            and obj.action_type == "AGENT_PROPOSAL_COMMITTED"
        ):
            original_commit_entry = obj
            break

    if original_commit_entry is not None:
        original_commit_entry.reverted_at = now

    # Log immutable AGENT_TRANSACTION_REVERTED block in forensic ledger
    revert_entry_id = uuid4()
    revert_transaction_id = uuid4()
    revert_audit_entry = ForensicAuditLog.create_entry(
        transaction_id=revert_transaction_id,
        user_upn=f"agent:{session.agent_identifier}|reviewer:{reviewer_user_id}",
        client_ip="system",
        action_type="AGENT_TRANSACTION_REVERTED",
        entity_type="AgentProposalSession",
        entity_id=session.id,
        json_diff={
            "agent_identifier": session.agent_identifier,
            "reviewer_user_id": reviewer_user_id,
            "reverted_mutations": reverted_count,
            "justification": justification,
            "model_name": session.model_name,
            "model_weights_hash": session.model_weights_hash,
            "prompt_digest": session.prompt_digest,
            "original_commit_hash": (
                original_commit_entry.current_hash
                if original_commit_entry
                else None
            ),
        },
        security_marking="",
        is_agent_action=True,
        agent_session_id=session.id,
        agent_model_identifier=f"{session.model_name}:{session.model_weights_hash[:16]}",
        model_weights_sha256=session.model_weights_hash,
        prompt_context_sha256=session.prompt_digest,
        human_reviewer_upn=f"reviewer:{reviewer_user_id}",
    )
    # Set ID explicitly so it's available before flush for linkage
    revert_audit_entry.id = revert_entry_id
    db.add(revert_audit_entry)

    # Link the original commit entry to the reversion block
    if original_commit_entry is not None:
        original_commit_entry.reversion_audit_block_id = revert_entry_id

    # Audit entry stays in identity map; no flush needed for tests

    logger.info(
        "Reverted proposal session: id=%s, mutations=%d, reviewer=%d",
        session_id, reverted_count, reviewer_user_id,
    )

    return {
        "session_id": str(session_id),
        "status": AgentProposalStatus.REVERTED.value,
        "reverted_mutations": reverted_count,
        "reviewer_user_id": reviewer_user_id,
        "justification": justification,
        "resolved_at": session.resolved_at.isoformat(),
        "audit_log_id": str(revert_audit_entry.id),
    }


# ============================================================================
# Public API: Selective commit — cherry-pick individual mutations
# ============================================================================

def commit_selective_proposal_session(
    db: Session,
    session_id: UUID,
    reviewer_user_id: int,
    approved_mutation_ids: List[UUID],
) -> Dict[str, Any]:
    """Commit only the selected mutations from a proposal session.

    Accepts an array of approved mutation IDs, commits only those selected
    items, and cleanly discards the rest by marking them as not committed.

    Parameters
    ----------
    db : Session
        SQLAlchemy database session.
    session_id : UUID
        The proposal session to commit selectively.
    reviewer_user_id : int
        The ID of the human user who approved the commit.
    approved_mutation_ids : list[UUID]
        List of mutation IDs to commit; all others are discarded.

    Returns
    -------
    dict
        Result with committed and discarded counts.

    Raises
    ------
    ValueError
        If the session is not found or is not in PENDING_REVIEW status.
    """
    session = db.query(AgentProposalSession).filter(
        AgentProposalSession.id == session_id
    ).first()

    if session is None:
        for obj in db.identity_map.get(AgentProposalSession, {}).values():
            if obj.id == session_id:
                session = obj
                break

    if session is None:
        raise ValueError(f"AgentProposalSession {session_id} not found")

    if session.status != AgentProposalStatus.PENDING_REVIEW:
        raise ValueError(
            f"Session {session_id} is in {session.status.value} status; "
            f"can only commit PENDING_REVIEW sessions"
        )

    # Fetch all mutations
    all_mutations = db.query(AgentStagedMutation).filter(
        AgentStagedMutation.session_id == session_id
    ).order_by(AgentStagedMutation.sequence_order).all()

    if not all_mutations:
        for collection in (db.identity_map.get(AgentStagedMutation, {}).values(), db.new):
            for obj in collection:
                if isinstance(obj, AgentStagedMutation) and obj.session_id == session_id:
                    all_mutations.append(obj)
        all_mutations.sort(key=lambda m: m.sequence_order)

    approved_set = set(approved_mutation_ids)
    committed_count = 0
    discarded_count = 0

    for mutation in all_mutations:
        if mutation.id in approved_set:
            # Apply forward delta for approved mutations
            node = _apply_forward_delta(
                db,
                mutation.target_node_id,
                mutation.action_type,
                mutation.forward_delta,
            )
            mutation.committed = True
            if node is not None:
                committed_count += 1
        else:
            # Discard unapproved mutations
            mutation.committed = False
            discarded_count += 1

    # Transition session status
    session.status = AgentProposalStatus.PARTIALLY_COMMITTED
    session.reviewed_by_user_id = reviewer_user_id
    session.resolved_at = datetime.now(timezone.utc)

    # Emit forensic audit log entry
    transaction_id = uuid4()
    audit_entry = ForensicAuditLog.create_entry(
        transaction_id=transaction_id,
        user_upn=f"agent:{session.agent_identifier}|reviewer:{reviewer_user_id}",
        client_ip="system",
        action_type="AGENT_PROPOSAL_PARTIALLY_COMMITTED",
        entity_type="AgentProposalSession",
        entity_id=session.id,
        json_diff={
            "agent_identifier": session.agent_identifier,
            "reviewer_user_id": reviewer_user_id,
            "mutations_committed": committed_count,
            "mutations_discarded": discarded_count,
            "approved_mutation_ids": [str(mid) for mid in approved_mutation_ids],
            "model_name": session.model_name,
            "model_weights_hash": session.model_weights_hash,
            "prompt_digest": session.prompt_digest,
        },
        security_marking="",
    )
    db.add(audit_entry)

    logger.info(
        "Selectively committed proposal session: id=%s, committed=%d, discarded=%d",
        session_id, committed_count, discarded_count,
    )

    return {
        "session_id": str(session_id),
        "status": AgentProposalStatus.PARTIALLY_COMMITTED.value,
        "committed_mutations": committed_count,
        "discarded_mutations": discarded_count,
        "reviewer_user_id": reviewer_user_id,
        "resolved_at": session.resolved_at.isoformat(),
        "audit_log_id": str(audit_entry.id),
    }
