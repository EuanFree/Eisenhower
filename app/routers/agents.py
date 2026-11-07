"""API endpoints for AI agent proposal sessions.

Provides endpoints for:
- Listing pending proposal sessions
- Fetching session details with mutations
- Full commit of a proposal session
- Selective (cherry-pick) commit of individual mutations
- Reverting a committed session
"""
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.agent_staging_service import (
    commit_proposal_session,
    commit_selective_proposal_session,
    revert_committed_session,
)
from app.models.agent_staging import (
    AgentProposalSession,
    AgentStagedMutation,
    AgentProposalStatus,
)

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


class SelectiveCommitRequest(BaseModel):
    """Request body for selective commit."""
    approved_mutation_ids: List[str] = Field(
        ...,
        description="List of mutation IDs to commit; others are discarded.",
    )


class RevertRequest(BaseModel):
    """Request body for reverting a committed session."""
    justification: str = Field(
        ...,
        description="Free-text explanation for the revert.",
    )


@router.get("/sessions")
def list_sessions(
    status: Optional[str] = Query(None, description="Filter by status"),
    db: Session = Depends(get_db),
):
    """List agent proposal sessions, optionally filtered by status.

    If no status is provided, returns all sessions.
    """
    query = db.query(AgentProposalSession)

    if status:
        try:
            status_enum = AgentProposalStatus(status)
            query = query.filter(AgentProposalSession.status == status_enum)
        except ValueError:
            pass  # Invalid status filter — return all

    sessions = query.order_by(AgentProposalSession.created_at.desc()).all()

    return [
        {
            "session_id": str(s.id),
            "programme_id": str(s.programme_id),
            "agent_identifier": s.agent_identifier,
            "model_name": s.model_name,
            "status": s.status.value,
            "mutation_count": len(s.mutations) if s.mutations else 0,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in sessions
    ]


@router.get("/sessions/{session_id}")
def get_session_details(
    session_id: str,
    db: Session = Depends(get_db),
):
    """Fetch a proposal session with all its mutations."""
    try:
        session_uuid = UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    session = db.query(AgentProposalSession).filter(
        AgentProposalSession.id == session_uuid,
    ).first()

    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    mutations = []
    for m in session.mutations or []:
        mutations.append({
            "mutation_id": str(m.id),
            "client_mutation_id": str(m.client_mutation_id),
            "sequence_order": m.sequence_order,
            "target_node_id": str(m.target_node_id),
            "action_type": m.action_type,
            "forward_delta": m.forward_delta,
            "inverse_delta": m.inverse_delta,
            "topological_impact_summary": m.topological_impact_summary,
            "committed": m.committed,
        })

    return {
        "session_id": str(session.id),
        "programme_id": str(session.programme_id),
        "agent_identifier": session.agent_identifier,
        "model_name": session.model_name,
        "model_weights_hash": session.model_weights_hash,
        "prompt_digest": session.prompt_digest,
        "status": session.status.value,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "resolved_at": session.resolved_at.isoformat() if session.resolved_at else None,
        "reviewed_by_user_id": session.reviewed_by_user_id,
        "reversion_justification": session.reversion_justification,
        "mutations": mutations,
    }


@router.post("/sessions/{session_id}/commit")
def commit_session(
    session_id: str,
    reviewer_user_id: int = Query(..., description="ID of the reviewing user"),
    db: Session = Depends(get_db),
):
    """Commit all mutations in a proposal session."""
    try:
        session_uuid = UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    try:
        result = commit_proposal_session(
            db=db,
            session_id=session_uuid,
            reviewer_user_id=reviewer_user_id,
        )
        db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sessions/{session_id}/commit-selective")
def commit_selective_session(
    session_id: str,
    request: SelectiveCommitRequest,
    reviewer_user_id: int = Query(..., description="ID of the reviewing user"),
    db: Session = Depends(get_db),
):
    """Commit only selected mutations from a proposal session.

    Accepts an array of approved mutation IDs, commits only those selected
    items, and cleanly discards the rest.
    """
    try:
        session_uuid = UUID(session_id)
        mutation_uuids = [UUID(mid) for mid in request.approved_mutation_ids]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID in request")

    try:
        result = commit_selective_proposal_session(
            db=db,
            session_id=session_uuid,
            reviewer_user_id=reviewer_user_id,
            approved_mutation_ids=mutation_uuids,
        )
        db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sessions/{session_id}/reject")
def reject_session(
    session_id: str,
    db: Session = Depends(get_db),
):
    """Reject a pending proposal session, discarding all staged mutations."""
    try:
        session_uuid = UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    session = db.query(AgentProposalSession).filter(
        AgentProposalSession.id == session_uuid,
    ).first()

    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status != AgentProposalStatus.PENDING_REVIEW:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reject session with status {session.status.value}",
        )

    from datetime import datetime, timezone

    session.status = AgentProposalStatus.REJECTED
    session.resolved_at = datetime.now(timezone.utc)

    # Delete all staged mutations
    for mutation in session.mutations or []:
        db.delete(mutation)

    db.commit()

    return {
        "session_id": str(session.id),
        "status": session.status.value,
        "message": "Proposal session rejected and mutations discarded.",
    }


@router.post("/sessions/{session_id}/revert")
def revert_session(
    session_id: str,
    request: RevertRequest,
    reviewer_user_id: int = Query(..., description="ID of the reviewing user"),
    db: Session = Depends(get_db),
):
    """Revert a previously committed proposal session."""
    try:
        session_uuid = UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    try:
        result = revert_committed_session(
            db=db,
            session_id=session_uuid,
            reviewer_user_id=reviewer_user_id,
            justification=request.justification,
        )
        db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
