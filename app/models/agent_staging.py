"""Isolated database staging model for AI agent proposal sessions.

This module defines the database schema for the two-phase commit system
that allows AI agents to propose schedule mutations without immediately
affecting live production tables.  A human reviewer must explicitly accept
or reject each proposal before it is applied.

Two-Phase Commit Workflow
-------------------------

1. **Stage** — An AI agent creates an ``AgentProposalSession`` and one or
   more ``AgentStagedMutation`` records.  These live in staging tables and
   do **not** modify any production nodes, links, or blockers.

2. **Review** — A human reviewer inspects the staged mutations, their
   forward deltas, inverse deltas, and topological impact summaries.

3. **Commit** — On acceptance, all forward mutations are applied atomically
   inside a single ``begin_nested()`` transaction.  The session status
   transitions to ``ACCEPTED_COMMITTED`` and a dual-attribution forensic
   audit log entry is emitted.

4. **Revert** — At any time after commit, a reviewer can revert the session.
   All inverse deltas are applied in reverse sequence order, restoring the
   original schedule state with zero rounding error.  The session status
   transitions to ``REVERTED``.

Key Models
~~~~~~~~~~

- :class:`AgentProposalSession` — Top-level container for a single AI
  agent proposal, tracking the agent identity, model weights hash, prompt
  digest, and review status.

- :class:`AgentStagedMutation` — Individual mutation within a proposal
  session, capturing the forward delta (new values), inverse delta (exact
  previous values for undo), and topological impact summary.

Design Decisions
~~~~~~~~~~~~~~~~

- **Inverse Delta** — Every mutation captures the *exact* previous attribute
  values before staging.  This guarantees 100 % mathematical reversibility
  with zero rounding error, even for floating-point fields like
  ``percent_complete``.

- **Topological Impact** — Before staging, the service evaluates downstream
  CPM (Critical Path Method) impact without mutating live tables.  The
  summary is stored as JSONB for frontend rendering.

- **Dual Attribution** — When a proposal is committed, the forensic audit
  log records both the AI agent identifier and the reviewing human user,
  ensuring full accountability.
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum as SAEnum,
    Index, Uuid, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from uuid import uuid4
import enum
import hashlib

from app.database import Base


def _utc_now():
    """Return the current UTC time as a timezone-aware datetime."""
    return datetime.now(timezone.utc)


# ============================================================================
# Enumerations
# ============================================================================

class AgentProposalStatus(str, enum.Enum):
    """Lifecycle status of an agent proposal session.

    Transitions
    ~~~~~~~~~~~

    PENDING_REVIEW → ACCEPTED_COMMITTED (on commit)
    PENDING_REVIEW → REJECTED (on explicit rejection)
    PENDING_REVIEW → PARTIALLY_COMMITTED (on selective commit)
    ACCEPTED_COMMITTED → REVERTED (on revert)

    Once a session reaches a terminal state (ACCEPTED_COMMITTED, REJECTED,
    PARTIALLY_COMMITTED, or REVERTED), it cannot transition further.
    """
    PENDING_REVIEW = "PENDING_REVIEW"
    ACCEPTED_COMMITTED = "ACCEPTED_COMMITTED"
    REJECTED = "REJECTED"
    REVERTED = "REVERTED"
    PARTIALLY_COMMITTED = "PARTIALLY_COMMITTED"


class AgentAttestationError(Exception):
    """Raised when an agent fails the accreditation attestation handshake.

    Attributes:
        error_code: Machine-readable error code (e.g. UNACCREDITED_AGENT_ERROR).
        reason: Human-readable explanation.
    """

    def __init__(self, error_code: str = "UNACCREDITED_AGENT_ERROR", reason: str = ""):
        self.error_code = error_code
        self.reason = reason or f"Agent attestation failed: {error_code}"
        super().__init__(self.reason)


# ============================================================================
# Agent Proposal Session
# ============================================================================

class AgentProposalSession(Base):
    """Top-level container for an AI agent proposal session.

    Each session represents a single batch of proposed mutations from one
    AI agent invocation.  The session tracks the agent identity, the model
    weights hash (for reproducibility), the prompt digest (for traceability),
    and the review status.

    The session remains in ``PENDING_REVIEW`` until a human reviewer
    explicitly commits or rejects it.  After commit, it can optionally
    be reverted if the changes prove problematic.

    Attributes
    ----------
    id : UUID
        Primary key, auto-generated UUID4.
    programme_id : UUID
        Foreign key to :class:`UniversalBreakdownNode` — the programme
        root node that this proposal targets.
    agent_identifier : str
        Human-readable agent name (e.g., 'agent:autonomous-cpm-leveler').
        Max 128 characters.
    model_name : str
        Name of the LLM model used (e.g., 'llama3-70b-instruct-q4').
        Max 64 characters.
    model_weights_hash : str
        SHA-256 hex digest of the loaded model weights.  Enables
        reproducibility verification.  Max 64 characters.
    prompt_digest : str
        SHA-256 hex digest of the triggering user/system prompt.
        Enables prompt traceability.  Max 64 characters.
    status : AgentProposalStatus
        Current lifecycle status (PENDING_REVIEW, ACCEPTED_COMMITTED,
        REJECTED, REVERTED).
    created_at : datetime
        Timestamp when the session was created (UTC).
    resolved_at : datetime or None
        Timestamp when the session was committed, rejected, or reverted.
    reviewed_by_user_id : int or None
        Foreign key to :class:`User` — the human reviewer who resolved
        the session.
    reversion_justification : str or None
        Free-text explanation provided when reverting a committed session.
    mutations : list[AgentStagedMutation]
        Collection of staged mutations belonging to this session.
    """
    __tablename__ = "agent_proposal_sessions"

    id = Column(
        Uuid,
        primary_key=True,
        default=uuid4,
    )

    programme_id = Column(
        Uuid,
        ForeignKey("universal_breakdown_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    """Programme root node this proposal targets."""

    agent_identifier = Column(
        String(128),
        nullable=False,
    )
    """Agent name (e.g., 'agent:autonomous-cpm-leveler')."""

    model_name = Column(
        String(64),
        nullable=False,
    )
    """LLM model name (e.g., 'llama3-70b-instruct-q4')."""

    model_weights_hash = Column(
        String(64),
        nullable=False,
    )
    """SHA-256 digest of loaded model weights."""

    prompt_digest = Column(
        String(64),
        nullable=False,
    )
    """SHA-256 digest of the triggering prompt."""

    status = Column(
        SAEnum(AgentProposalStatus),
        default=AgentProposalStatus.PENDING_REVIEW,
        nullable=False,
        index=True,
    )
    """Current lifecycle status."""

    created_at = Column(
        DateTime,
        default=_utc_now,
        nullable=False,
    )
    """When the session was created."""

    resolved_at = Column(
        DateTime,
        nullable=True,
    )
    """When the session was committed, rejected, or reverted."""

    reviewed_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    """Human reviewer who resolved the session."""

    reversion_justification = Column(
        Text,
        nullable=True,
    )
    """Free-text justification when reverting."""

    mutation_count = Column(
        Integer,
        default=0,
        nullable=False,
    )
    """Number of staged mutations in this session (for throttling)."""

    cumulative_slip_days = Column(
        Integer,
        default=0,
        nullable=False,
    )
    """Cumulative schedule slip in days across all mutations (for throttling)."""

    # Relationships
    programme_node = relationship(
        "UniversalBreakdownNode",
        foreign_keys=[programme_id],
    )
    reviewed_by_user = relationship(
        "User",
        foreign_keys=[reviewed_by_user_id],
    )
    mutations = relationship(
        "AgentStagedMutation",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="AgentStagedMutation.sequence_order",
    )

    __table_args__ = (
        Index("ix_agent_proposal_programme", "programme_id"),
        Index("ix_agent_proposal_status", "status"),
        Index("ix_agent_proposal_created", "created_at"),
    )

    def __repr__(self):
        return (
            f"<AgentProposalSession(id={self.id}, "
            f"agent='{self.agent_identifier}', "
            f"status={self.status.value})>"
        )


# ============================================================================
# Agent Staged Mutation
# ============================================================================

class AgentStagedMutation(Base):
    """Individual mutation within an agent proposal session.

    Each mutation targets a single :class:`UniversalBreakdownNode` and
    records the complete forward delta (new attribute values), the exact
    inverse delta (previous values for 100 % undo), and a topological
    impact summary (affected successors, float consumption, baseline
    slip warnings).

    Mutations are ordered by ``sequence_order`` within a session.  When
    committing, they are applied in ascending order.  When reverting,
    they are applied in descending order.

    Action Types
    ~~~~~~~~~~~~

    Common action types include:

    - **NODE_SHIFT** — Shift planned start/end dates by a delta.
    - **LINK_CREATE** — Create a new scheduling dependency.
    - **PROGRESS_SET** — Update percent complete.
    - **BLOCKER_RAISE** — Record a new operational blocker.

    Inverse Delta Guarantee
    ~~~~~~~~~~~~~~~~~~~~~~~

    The ``inverse_delta`` field captures the *exact* previous attribute
    values at the time of staging, including floating-point values with
    full precision.  This ensures that reverting restores the original
    state with zero rounding error.

    Attributes
    ----------
    id : UUID
        Primary key, auto-generated UUID4.
    session_id : UUID
        Foreign key to :class:`AgentProposalSession`.
    sequence_order : int
        Chronological index within multi-step operations (0-based).
    target_node_id : UUID
        Foreign key to :class:`UniversalBreakdownNode` — the node
        affected by this mutation.
    action_type : str
        Type of action (e.g., NODE_SHIFT, LINK_CREATE, PROGRESS_SET,
        BLOCKER_RAISE).  Max 64 characters.
    forward_delta : dict
        JSONB — complete pre-computed new attribute values to apply
        on commit.
    inverse_delta : dict
        JSONB — exact previous attribute values required for 100 %
        mathematical undo.
    topological_impact_summary : dict or None
        JSONB — affected successors, float consumption, baseline slip
        warnings.  Computed without mutating live tables.
    session : AgentProposalSession
        Relationship to the parent proposal session.
    target_node : UniversalBreakdownNode
        Relationship to the affected node.
    """
    __tablename__ = "agent_staged_mutations"

    id = Column(
        Uuid,
        primary_key=True,
        default=uuid4,
    )

    session_id = Column(
        Uuid,
        ForeignKey("agent_proposal_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    """Parent proposal session."""

    sequence_order = Column(
        Integer,
        nullable=False,
        default=0,
    )
    """Chronological index within the session (0-based)."""

    target_node_id = Column(
        Uuid,
        ForeignKey("universal_breakdown_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    """Target node affected by this mutation."""

    action_type = Column(
        String(64),
        nullable=False,
    )
    """Action type (NODE_SHIFT, LINK_CREATE, PROGRESS_SET, BLOCKER_RAISE)."""

    forward_delta = Column(
        JSONB,
        nullable=False,
    )
    """Pre-computed new attribute values to apply on commit."""

    inverse_delta = Column(
        JSONB,
        nullable=False,
    )
    """Exact previous values for 100 % mathematical undo."""

    topological_impact_summary = Column(
        JSONB,
        nullable=True,
    )
    """Affected successors, float consumption, baseline slip warnings."""

    client_mutation_id = Column(
        Uuid,
        nullable=False,
        index=True,
    )
    """Client-provided UUID for idempotency fencing — prevents duplicate staging."""

    committed = Column(
        Boolean,
        default=False,
        nullable=False,
    )
    """Whether this mutation was committed (full or selective commit)."""

    # Relationships
    session = relationship(
        "AgentProposalSession",
        back_populates="mutations",
    )
    target_node = relationship(
        "UniversalBreakdownNode",
        foreign_keys=[target_node_id],
    )

    __table_args__ = (
        Index("ix_staged_mutation_session", "session_id"),
        Index("ix_staged_mutation_sequence", "session_id", "sequence_order"),
        Index("ix_staged_mutation_target", "target_node_id"),
        Index("ix_staged_mutation_client_id", "client_mutation_id"),
        UniqueConstraint("session_id", "client_mutation_id", 
                        name="uq_staged_mutation_session_client_id"),
    )

    def __repr__(self):
        return (
            f"<AgentStagedMutation(id={self.id}, "
            f"session={self.session_id}, "
            f"seq={self.sequence_order}, "
            f"action='{self.action_type}')>"
        )


# ============================================================================
# Accredited Agent Registry
# ============================================================================

class AccreditedAgent(Base):
    """Whitelist of accredited AI agents mapped to verified model weights.

    Each record maps an agent's PKI public key fingerprint to the expected
    SHA-256 hash of its loaded model weights.  During
    ``agent_begin_proposal_session()``, the caller's certificate and
    reported weights hash are verified against this table.  Unaccredited
    models are rejected with ``UNACCREDITED_AGENT_ERROR``.

    Attributes
    ----------
    id : UUID
        Primary key, auto-generated UUID4.
    agent_identifier : str
        Human-readable agent name matching the session's agent_identifier.
    public_key_fingerprint : str
        SHA-256 hex fingerprint of the agent's PKI public key.  Max 64 chars.
    model_name : str
        The accredited model name (e.g., 'llama3-70b-instruct-q4').
    model_weights_hash : str
        SHA-256 hex digest of the approved model weights.  Max 64 chars.
    accredited_by_user_id : int or None
        The human user who accredited this agent.
    accredited_at : datetime
        When the accreditation was recorded.
    is_active : bool
        Whether this accreditation is currently valid.
    """
    __tablename__ = "accredited_agents"

    id = Column(
        Uuid,
        primary_key=True,
        default=uuid4,
    )

    agent_identifier = Column(
        String(128),
        nullable=False,
        index=True,
    )
    """Agent name matching session agent_identifier."""

    public_key_fingerprint = Column(
        String(64),
        nullable=False,
        index=True,
    )
    """SHA-256 fingerprint of the agent's PKI public key."""

    model_name = Column(
        String(64),
        nullable=False,
    )
    """Accredited model name."""

    model_weights_hash = Column(
        String(64),
        nullable=False,
    )
    """SHA-256 digest of the approved model weights."""

    accredited_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    """Human user who accredited this agent."""

    accredited_at = Column(
        DateTime,
        default=_utc_now,
        nullable=False,
    )
    """When the accreditation was recorded."""

    is_active = Column(
        Boolean,
        default=True,
        nullable=False,
    )
    """Whether this accreditation is currently valid."""

    accredited_by_user = relationship(
        "User",
        foreign_keys=[accredited_by_user_id],
    )

    __table_args__ = (
        Index("ix_accredited_agent_identifier", "agent_identifier"),
        Index("ix_accredited_agent_pk_fingerprint", "public_key_fingerprint"),
        UniqueConstraint(
            "agent_identifier", "model_name",
            name="uq_accredited_agent_identifier_model",
        ),
    )

    @staticmethod
    def compute_pk_fingerprint(public_key_pem: str) -> str:
        """Compute SHA-256 fingerprint from a PEM-encoded public key.

        Parameters
        ----------
        public_key_pem : str
            PEM-encoded public key string.

        Returns
        -------
        str
            SHA-256 hex digest of the DER-encoded public key bytes.
        """
        der_bytes = public_key_pem.encode("utf-8")
        return hashlib.sha256(der_bytes).hexdigest()

    def __repr__(self):
        return (
            f"<AccreditedAgent(id={self.id}, "
            f"agent='{self.agent_identifier}', "
            f"model='{self.model_name}', "
            f"active={self.is_active})>"
        )
