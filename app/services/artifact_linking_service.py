"""Artifact Linking Service — External repository artifact integration engine.

This module provides the business logic for linking external repository
artifacts (Windchill, Git, DOORS) to WBS nodes and automatically advancing
task progress when artifacts reach terminal lifecycle states.

Core Functions
--------------

link_artifact
    Manually or programmatically attach an external artifact to a WBS node.

ingest_windchill_webhook
    Process Windchill REST event payloads and update artifact lifecycle state.

ingest_git_webhook
    Process Git release/tag push payloads and create or update artifact links.

get_node_artifacts
    Retrieve all linked repository artifacts for a given WBS node.

_advance_progress
    Internal: Advance a task's physical progress when an artifact transitions
    to RELEASED or APPROVED, recording the change in ForensicAuditLog.
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4, UUID

from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.models.models import (
    PortfolioNode,
    MilestoneWeightStep,
    ForensicAuditLog,
    ExternalRepositoryArtifact,
    ExternalRepositoryType,
    ArtifactLifecycleState,
)

logger = logging.getLogger(__name__)


# ============================================================================
# Lifecycle state mapping — Windchill state names to our enum
# ============================================================================

WINDCHILL_STATE_MAP = {
    "INWORK": ArtifactLifecycleState.DRAFT,
    "IN_REVIEW": ArtifactLifecycleState.IN_REVIEW,
    "UNDER_REVIEW": ArtifactLifecycleState.IN_REVIEW,
    "RELEASED": ArtifactLifecycleState.RELEASED,
    "NORMAL": ArtifactLifecycleState.RELEASED,
    "APPROVED": ArtifactLifecycleState.APPROVED,
    "OBSOLETE": ArtifactLifecycleState.OBSOLETE,
    "RETIRE": ArtifactLifecycleState.OBSOLETE,
}


def link_artifact(
    db: Session,
    portfolio_node_id: str,
    repository_type: str,
    external_identifier: str,
    title: str,
    version_revision: Optional[str] = None,
    lifecycle_state: str = "DRAFT",
    verification_hash: Optional[str] = None,
    drives_progress: bool = False,
    milestone_weight_step_id: Optional[str] = None,
    external_url: Optional[str] = None,
    extra_metadata: Optional[dict] = None,
) -> ExternalRepositoryArtifact:
    """Link an external repository artifact to a WBS node.

    Parameters
    ----------
    db : Session
        Active database session.
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
        Current lifecycle state.
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

    Returns
    -------
    ExternalRepositoryArtifact
        The created or updated artifact link record.

    Raises
    ------
    ValueError
        If the portfolio node is not found or the repository type is invalid.
    """
    # Validate portfolio node exists
    node = db.query(PortfolioNode).filter(
        PortfolioNode.id == UUID(portfolio_node_id)
    ).first()
    if node is None:
        raise ValueError(f"PortfolioNode {portfolio_node_id} not found")

    # Parse repository type
    try:
        repo_type = ExternalRepositoryType(repository_type.upper())
    except ValueError:
        raise ValueError(f"Invalid repository type: {repository_type}")

    # Parse lifecycle state
    try:
        state = ArtifactLifecycleState(lifecycle_state.upper())
    except ValueError:
        raise ValueError(f"Invalid lifecycle state: {lifecycle_state}")

    # Check for existing artifact with same external identifier
    existing = db.query(ExternalRepositoryArtifact).filter(
        and_(
            ExternalRepositoryArtifact.portfolio_node_id == UUID(portfolio_node_id),
            ExternalRepositoryArtifact.repository_type == repo_type,
            ExternalRepositoryArtifact.external_identifier == external_identifier,
        )
    ).first()

    if existing:
        # Update existing record
        existing.title = title
        existing.version_revision = version_revision
        existing.lifecycle_state = state
        existing.verification_hash = verification_hash
        existing.drives_progress = drives_progress
        existing.milestone_weight_step_id = (
            UUID(milestone_weight_step_id) if milestone_weight_step_id else None
        )
        existing.external_url = external_url
        existing.extra_metadata = extra_metadata
        db.flush()
        artifact = existing
    else:
        # Create new record
        artifact = ExternalRepositoryArtifact(
            portfolio_node_id=UUID(portfolio_node_id),
            repository_type=repo_type,
            external_identifier=external_identifier,
            title=title,
            version_revision=version_revision,
            lifecycle_state=state,
            verification_hash=verification_hash,
            drives_progress=drives_progress,
            milestone_weight_step_id=(
                UUID(milestone_weight_step_id) if milestone_weight_step_id else None
            ),
            external_url=external_url,
            extra_metadata=extra_metadata,
        )
        db.add(artifact)
        db.flush()

    # If the artifact is already in a terminal state and drives progress,
    # advance progress immediately
    if state in (ArtifactLifecycleState.RELEASED, ArtifactLifecycleState.APPROVED):
        if drives_progress and milestone_weight_step_id:
            db.flush()
            _advance_progress(
                db=db,
                artifact=artifact,
                portfolio_node=node,
                milestone_weight_step_id=UUID(milestone_weight_step_id),
            )

    db.flush()
    return artifact


def ingest_windchill_webhook(
    db: Session,
    event_type: str,
    object_type: str,
    object_id: str,
    part_number: Optional[str] = None,
    title: str = "",
    revision: Optional[str] = None,
    lifecycle_state: str = "INWORK",
    owner: Optional[str] = None,
    timestamp: str = "",
    verification_hash: Optional[str] = None,
    portfolio_node_id: Optional[str] = None,
) -> Optional[ExternalRepositoryArtifact]:
    """Process a Windchill REST event webhook payload.

    When a Windchill object changes lifecycle state, this function updates
    the corresponding artifact link record.  If the object transitions to
    RELEASED or APPROVED and drives_progress is True, the linked task's
    physical progress is automatically advanced.

    Parameters
    ----------
    db : Session
        Active database session.
    event_type : str
        Type of Windchill event (e.g., 'LifeCycleChange').
    object_type : str
        Windchill object type (e.g., 'WTDocument', 'WTPart').
    object_id : str
        External identifier of the Windchill object.
    part_number : str or None
        Part number or document number.
    title : str
        Title of the object.
    revision : str or None
        Revision letter.
    lifecycle_state : str
        Current lifecycle state name from Windchill.
    owner : str or None
        Owner of the object.
    timestamp : str
        ISO timestamp of the event.
    verification_hash : str or None
        SHA-256 hash of the document content.
    portfolio_node_id : str or None
        If provided, link to this specific node.  Otherwise, search by
        external_identifier across all nodes.

    Returns
    -------
    ExternalRepositoryArtifact or None
        The updated artifact link, or None if no matching artifact was found.
    """
    # Map Windchill state to our enum
    state_key = lifecycle_state.upper().replace(" ", "_")
    new_state = WINDCHILL_STATE_MAP.get(state_key, ArtifactLifecycleState.DRAFT)

    # Build external identifier from part_number or object_id
    external_id = part_number or object_id

    # Find existing artifact
    query = db.query(ExternalRepositoryArtifact).filter(
        and_(
            ExternalRepositoryArtifact.repository_type == ExternalRepositoryType.WINDCHILL,
            ExternalRepositoryArtifact.external_identifier == external_id,
        )
    )

    if portfolio_node_id:
        query = query.filter(
            ExternalRepositoryArtifact.portfolio_node_id == UUID(portfolio_node_id)
        )

    artifact = query.first()

    if artifact is None:
        # If portfolio_node_id is provided, create a new link
        if portfolio_node_id:
            node = db.query(PortfolioNode).filter(
                PortfolioNode.id == UUID(portfolio_node_id)
            ).first()
            if node is None:
                logger.warning(
                    "Windchill webhook: PortfolioNode %s not found", portfolio_node_id
                )
                return None

            artifact = ExternalRepositoryArtifact(
                portfolio_node_id=UUID(portfolio_node_id),
                repository_type=ExternalRepositoryType.WINDCHILL,
                external_identifier=external_id,
                title=title or external_id,
                version_revision=revision,
                lifecycle_state=new_state,
                verification_hash=verification_hash,
                drives_progress=False,
                extra_metadata={
                    "object_type": object_type,
                    "event_type": event_type,
                    "owner": owner,
                    "windchill_object_id": object_id,
                },
            )
            db.add(artifact)
            db.flush()
        else:
            logger.info(
                "Windchill webhook: No artifact found for %s, skipping", external_id
            )
            return None
    else:
        # Update lifecycle state
        old_state = artifact.lifecycle_state
        artifact.lifecycle_state = new_state
        artifact.version_revision = revision or artifact.version_revision
        artifact.title = title or artifact.title
        artifact.verification_hash = verification_hash or artifact.verification_hash
        if artifact.extra_metadata is None:
            artifact.extra_metadata = {}
        artifact.extra_metadata["object_type"] = object_type
        artifact.extra_metadata["last_event"] = event_type
        artifact.extra_metadata["windchill_object_id"] = object_id

    # Check for progress-driving transition
    if new_state in (ArtifactLifecycleState.RELEASED, ArtifactLifecycleState.APPROVED):
        if artifact.drives_progress and artifact.milestone_weight_step_id:
            # Flush artifact changes first, then refresh node for progress update
            db.flush()
            node = db.query(PortfolioNode).get(artifact.portfolio_node_id)
            if node is not None:
                _advance_progress(
                    db=db,
                    artifact=artifact,
                    portfolio_node=node,
                    milestone_weight_step_id=artifact.milestone_weight_step_id,
                )

    db.flush()
    return artifact


def ingest_git_webhook(
    db: Session,
    event_type: str,
    repository_url: str,
    repository_name: str,
    commit_hash: str,
    tag_name: Optional[str] = None,
    branch: Optional[str] = None,
    message: Optional[str] = None,
    author: Optional[str] = None,
    timestamp: str = "",
    portfolio_node_id: Optional[str] = None,
) -> Optional[ExternalRepositoryArtifact]:
    """Process a Git release/tag push webhook payload.

    Parameters
    ----------
    db : Session
        Active database session.
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
    portfolio_node_id : str or None
        If provided, link to this specific node.

    Returns
    -------
    ExternalRepositoryArtifact or None
        The created or updated artifact link.
    """
    # Determine external identifier: tag_name > commit_hash
    external_id = tag_name or commit_hash[:12]
    title = f"{repository_name}: {tag_name or commit_hash[:8]}"
    lifecycle = (
        ArtifactLifecycleState.RELEASED if tag_name else ArtifactLifecycleState.DRAFT
    )

    # Build external URL
    if tag_name:
        external_url = f"{repository_url}/-/tags/{tag_name}"
    else:
        external_url = f"{repository_url}/-/commit/{commit_hash}"

    # Find existing artifact for this node + repo
    query = db.query(ExternalRepositoryArtifact).filter(
        ExternalRepositoryArtifact.repository_type == ExternalRepositoryType.GIT,
    )

    if portfolio_node_id:
        query = query.filter(
            ExternalRepositoryArtifact.portfolio_node_id == UUID(portfolio_node_id)
        )

    # For tagged releases, check by tag name
    if tag_name:
        query = query.filter(
            ExternalRepositoryArtifact.external_identifier == external_id
        )
    else:
        # For branch pushes, match by repo name prefix
        query = query.filter(
            ExternalRepositoryArtifact.external_identifier.like(f"{repository_name}%")
        )

    artifact = query.first()

    if artifact is None and portfolio_node_id:
        node = db.query(PortfolioNode).filter(
            PortfolioNode.id == UUID(portfolio_node_id)
        ).first()
        if node is None:
            logger.warning("Git webhook: PortfolioNode %s not found", portfolio_node_id)
            return None

        artifact = ExternalRepositoryArtifact(
            portfolio_node_id=UUID(portfolio_node_id),
            repository_type=ExternalRepositoryType.GIT,
            external_identifier=external_id,
            title=title,
            version_revision=tag_name,
            lifecycle_state=lifecycle,
            verification_hash=commit_hash,
            drives_progress=False,
            external_url=external_url,
            extra_metadata={
                "repository_url": repository_url,
                "repository_name": repository_name,
                "commit_hash": commit_hash,
                "branch": branch,
                "author": author,
                "message": message,
            },
        )
        db.add(artifact)
        db.flush()
    elif artifact is not None:
        artifact.title = title
        artifact.version_revision = tag_name or artifact.version_revision
        artifact.lifecycle_state = lifecycle
        artifact.verification_hash = commit_hash
        artifact.external_url = external_url
        if artifact.extra_metadata is None:
            artifact.extra_metadata = {}
        artifact.extra_metadata["commit_hash"] = commit_hash
        artifact.extra_metadata["repository_url"] = repository_url

    # If tagged release and drives progress
    if lifecycle == ArtifactLifecycleState.RELEASED and artifact.drives_progress:
        if artifact.milestone_weight_step_id:
            db.flush()
            node = db.query(PortfolioNode).get(artifact.portfolio_node_id)
            if node is not None:
                _advance_progress(
                    db=db,
                    artifact=artifact,
                    portfolio_node=node,
                    milestone_weight_step_id=artifact.milestone_weight_step_id,
                )

    db.flush()
    return artifact


def get_node_artifacts(
    db: Session,
    node_id: str,
) -> dict:
    """Retrieve all linked repository artifacts for a WBS node.

    Parameters
    ----------
    db : Session
        Active database session.
    node_id : str
        UUID of the WBS node.

    Returns
    -------
    dict
        Dictionary containing:
        - artifacts: list of artifact dicts with milestone_weight
        - total_count: number of artifacts
        - total_progress_contribution: sum of milestone weights
    """
    artifacts = (
        db.query(ExternalRepositoryArtifact)
        .filter(ExternalRepositoryArtifact.portfolio_node_id == UUID(node_id))
        .all()
    )

    result = []
    total_contribution = 0.0

    for art in artifacts:
        milestone_weight = None
        if art.drives_progress and art.milestone_weight_step_id:
            mws = (
                db.query(MilestoneWeightStep)
                .filter(MilestoneWeightStep.id == art.milestone_weight_step_id)
                .first()
            )
            if mws:
                milestone_weight = float(mws.weight_fraction)
                if art.lifecycle_state in (
                    ArtifactLifecycleState.RELEASED,
                    ArtifactLifecycleState.APPROVED,
                ):
                    total_contribution += milestone_weight

        result.append({
            "id": str(art.id),
            "portfolio_node_id": str(art.portfolio_node_id),
            "repository_type": art.repository_type.value,
            "external_identifier": art.external_identifier,
            "title": art.title,
            "version_revision": art.version_revision,
            "lifecycle_state": art.lifecycle_state.value,
            "verification_hash": art.verification_hash,
            "drives_progress": art.drives_progress,
            "milestone_weight_step_id": (
                str(art.milestone_weight_step_id) if art.milestone_weight_step_id else None
            ),
            "milestone_weight": milestone_weight,
            "external_url": art.external_url,
            "extra_metadata": art.extra_metadata,
            "created_at": art.created_at.isoformat() if art.created_at else None,
            "updated_at": art.updated_at.isoformat() if art.updated_at else None,
        })

    return {
        "artifacts": result,
        "total_count": len(result),
        "total_progress_contribution": round(total_contribution, 3),
    }


def _advance_progress(
    db: Session,
    artifact: ExternalRepositoryArtifact,
    portfolio_node: PortfolioNode,
    milestone_weight_step_id: UUID,
) -> None:
    """Advance a task's physical progress when an artifact reaches terminal state.

    This function:
    1. Looks up the milestone weight step
    2. Advances the node's percent_complete by the weight fraction
    3. Marks the milestone step as verified
    4. Records the change in ForensicAuditLog with the artifact's SHA-256 hash

    Parameters
    ----------
    db : Session
        Active database session.
    artifact : ExternalRepositoryArtifact
        The artifact that triggered the progress update.
    portfolio_node : PortfolioNode
        The WBS node whose progress is being advanced.
    milestone_weight_step_id : UUID
        The milestone weight step to apply.
    """
    mws = (
        db.query(MilestoneWeightStep)
        .filter(MilestoneWeightStep.id == milestone_weight_step_id)
        .first()
    )
    if mws is None:
        logger.warning(
            "Artifact %s: MilestoneWeightStep %s not found, skipping progress update",
            artifact.id,
            milestone_weight_step_id,
        )
        return

    weight = float(mws.weight_fraction)
    old_percent = portfolio_node.percent_complete
    new_percent = min(100.0, old_percent + weight * 100.0)

    # Only update if there's a meaningful change
    if abs(new_percent - old_percent) < 0.01:
        logger.info(
            "Artifact %s: Progress already at target (%.1f%%), skipping",
            artifact.id,
            old_percent,
        )
        return

    # Update physical progress
    portfolio_node.percent_complete = new_percent

    # Mark milestone step as verified
    if not mws.is_verified_passed:
        mws.is_verified_passed = True
        mws.verified_at = datetime.now(timezone.utc)

    # Record forensic audit log
    transaction_id = uuid4()
    json_diff = {
        "old_percent_complete": old_percent,
        "new_percent_complete": new_percent,
        "milestone_weight": weight,
        "artifact_id": str(artifact.id),
        "artifact_external_id": artifact.external_identifier,
        "artifact_verification_hash": artifact.verification_hash or "N/A",
        "trigger": "ARTIFACT_LIFECYCLE_TRANSITION",
    }

    audit_entry = ForensicAuditLog.create_entry(
        transaction_id=transaction_id,
        user_upn="system:artifact_linking_service",
        client_ip="127.0.0.1",
        action_type="UPDATE",
        entity_type="PortfolioNode",
        entity_id=portfolio_node.id,
        json_diff=json_diff,
        security_marking="",
    )
    db.add(audit_entry)

    logger.info(
        "Artifact %s (%s): Advanced node %s progress from %.1f%% to %.1f%% "
        "(milestone weight: %.3f, hash: %s)",
        artifact.id,
        artifact.external_identifier,
        portfolio_node.id,
        old_percent,
        new_percent,
        weight,
        artifact.verification_hash or "N/A",
    )
