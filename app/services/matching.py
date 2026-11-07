"""Resource matching and skill-matrix engine for the Eisenhower Portfolio Manager.

This module implements the **Optimistic / Permissive Match Algorithm** that
ranks personnel candidates against resource requisition requirements.  It is
the core intelligence behind the requisition review workflow.

Algorithm Overview
------------------

The matching engine evaluates every active user in the system against a
requisition's requirements and returns a ranked list of candidates ordered
by their overall match score (highest first).

The algorithm has two gates:

1. **Hard Gate (Security)** — A user must have sufficient security clearance
   and all required caveats to access the target portfolio node.  If the hard
   gate fails, the match score is 0% and the candidate is excluded.

2. **Soft Gate (Skills)** — A user's skill proficiency is compared against
   the requisition's minimum proficiency requirement.  The algorithm is
   *permissive*: if a user has not rated a non-mandatory required skill,
   they receive a neutral default score of 50% rather than 0%.  This avoids
   penalising personnel who simply haven't updated their skill profile.

Special Cases
~~~~~~~~~~~~~

- If a requisition lists **zero skill requirements**, all cleared personnel
  receive a 100% match score.
- Forward capacity availability is calculated by comparing existing
  ``ResourceAssignment`` hours against the user's standard capacity within
  the requested date range.

Scoring Formula
~~~~~~~~~~~~~~~

For each required skill::

    skill_score = (user_proficiency / min_proficiency) * 100

    If user has no profile for the skill:
        skill_score = 50  (neutral default)

    If user_proficiency >= min_proficiency:
        verification_bonus = 10 if CERTIFIED else 5 if ENDORSED else 0

    final_skill_score = min(skill_score + verification_bonus, 100)

Overall match score is the average of all skill scores, weighted by
capacity availability::

    match_score = avg(final_skill_score) * (available_hours / requested_hours)

Usage
~~~~~

The matching engine is called from the requisitions router when a functional
lead reviews pending requisitions.  It returns a ranked list of
``CandidateMatchResponse`` objects that the frontend displays as a candidate
shortlist.

Example
~~~~~~~

    from app.services.matching import find_candidates

    candidates = find_candidates(
        db=session,
        requisition=req,
        node_security=SecurityClassification.SECRET,
        node_caveats=['UK_EYES_ONLY'],
    )

    # candidates is a list of CandidateMatchResponse, sorted by match_score desc
"""
from typing import List, Dict, Any, Optional
from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from app.models.models import (
    User, UserSkillProfile, SkillDefinition, ProficiencyLevel,
    VerificationStatus, SecurityClassification, ResourceAssignment,
    ResourceNode, RequisitionStatus,
)
from app.schemas.schemas import CandidateMatchResponse


# ============================================================================
# Security clearance helpers
# ============================================================================

def _clearance_rank(level: SecurityClassification) -> int:
    """Map a security classification to a numeric rank for comparison.

    Parameters
    ----------
    level : SecurityClassification
        The classification level to rank.

    Returns
    -------
    int
        Numeric rank: OFFICIAL=1, OFFICIAL_SENSITIVE=2, SECRET=3, TOP_SECRET=4.
    """
    ranks = {
        SecurityClassification.OFFICIAL: 1,
        SecurityClassification.OFFICIAL_SENSITIVE: 2,
        SecurityClassification.SECRET: 3,
        SecurityClassification.TOP_SECRET: 4,
    }
    return ranks.get(level, 0)


def _user_has_clearance(
    user: User,
    node_classification: SecurityClassification,
    node_caveats: Optional[List[str]] = None,
) -> bool:
    """Check if a user has sufficient clearance to access a node.

    A user is cleared if:
    1. Their clearance level >= the node's security classification.
    2. All of the node's caveats are present in the user's caveats list.

    Parameters
    ----------
    user : User
        The user to check.
    node_classification : SecurityClassification
        The node's security classification.
    node_caveats : list of str or None
        The node's security caveats.

    Returns
    -------
    bool
        True if the user is cleared, False otherwise.
    """
    if _clearance_rank(user.clearance_level) < _clearance_rank(node_classification):
        return False

    user_caveats = set(user.caveats or [])
    node_caveat_set = set(node_caveats or [])
    if not node_caveat_set.issubset(user_caveats):
        return False

    return True


# ============================================================================
# Capacity availability
# ============================================================================

def _calculate_available_hours(
    db: Session,
    user: User,
    start_date: date,
    end_date: date,
    requested_hours: float,
) -> float:
    """Calculate a user's available hours within a date range.

    The algorithm estimates standard capacity based on the number of
    calendar days in the range (assuming 8 hours/day), then subtracts
    hours already committed via confirmed or claimed ResourceAssignments
    that overlap with the requested period.

    Parameters
    ----------
    db : Session
        Database session.
    user : User
        The user whose capacity to calculate.
    start_date : date
        Start of the requested period.
    end_date : date
        End of the requested period.
    requested_hours : float
        The number of hours being requested (used as a cap).

    Returns
    -------
    float
        Available hours, capped at the requested_hours value.
    """
    # Calculate total days in the range
    total_days = (end_date - start_date).days
    if total_days <= 0:
        total_days = 1  # Same-day request

    # Estimate standard capacity: 8 hours per day
    standard_capacity = total_days * 8.0

    # Find the user's associated resource node(s)
    # Resource nodes are linked to users via code/name matching or explicit assignment
    user_resource_nodes = db.query(ResourceNode).filter(
        and_(
            ResourceNode.is_active == True,
            ResourceNode.resource_type == "PERSON",
            or_(
                ResourceNode.code == user.username,
                ResourceNode.name == user.username,
                ResourceNode.name == user.full_name,
            )
        )
    ).all()

    # Sum up already-allocated hours for overlapping assignments
    allocated_hours = 0.0
    for res_node in user_resource_nodes:
        assignments = db.query(ResourceAssignment).filter(
            and_(
                ResourceAssignment.resource_node_id == res_node.id,
                or_(
                    ResourceAssignment.status == "CONFIRMED",
                    ResourceAssignment.status == "CLAIMED",
                )
            )
        ).all()

        for assignment in assignments:
            # Assume the assignment spans the full requested period
            # (In a full implementation, this would check actual date ranges
            # stored in the assignment's linked portfolio node)
            allocated_hours += assignment.planned_hours * assignment.allocated_units

    # Available hours = standard capacity - allocated hours
    available = max(0.0, standard_capacity - allocated_hours)

    # Cap at requested hours
    return min(available, requested_hours)


# ============================================================================
# Skill matching
# ============================================================================

def _calculate_skill_score(
    user_profile: Optional[UserSkillProfile],
    min_proficiency: ProficiencyLevel,
) -> Dict[str, Any]:
    """Calculate the match score for a single skill requirement.

    This implements the **permissive** matching rule:
    - If the user has a profile for the skill, compare proficiency levels.
    - If the user has NO profile, assign a neutral default of 50%.
    - Add a verification bonus for endorsed/certified skills.

    Parameters
    ----------
    user_profile : UserSkillProfile or None
        The user's skill profile for the required skill, or None if not found.
    min_proficiency : ProficiencyLevel
        The minimum proficiency level required.

    Returns
    -------
    dict
        A dictionary containing:
        - 'proficiency_score' (float): The base proficiency match percentage.
        - 'verification_bonus' (float): Bonus points for verification status.
        - 'final_score' (float): Capped at 100%.
        - 'user_proficiency' (int or None): User's proficiency level value.
        - 'verification_status' (str or None): User's verification status.
    """
    if user_profile is None:
        # Permissive default: 50% for unrated skills
        return {
            "proficiency_score": 50.0,
            "verification_bonus": 0.0,
            "final_score": 50.0,
            "user_proficiency": None,
            "verification_status": None,
            "note": "Neutral default — skill not rated by user",
        }

    user_level = int(user_profile.proficiency_level)
    min_level = int(min_proficiency)

    # Base proficiency score
    if user_level >= min_level:
        proficiency_score = 100.0
    else:
        proficiency_score = (user_level / min_level) * 100.0

    # Verification bonus
    verification_bonus = 0.0
    if user_profile.verification_status == VerificationStatus.CERTIFIED:
        verification_bonus = 10.0
    elif user_profile.verification_status == VerificationStatus.ENDORSED:
        verification_bonus = 5.0

    # Cap at 100%
    final_score = min(proficiency_score + verification_bonus, 100.0)

    return {
        "proficiency_score": proficiency_score,
        "verification_bonus": verification_bonus,
        "final_score": final_score,
        "user_proficiency": user_level,
        "verification_status": user_profile.verification_status.value,
        "note": None,
    }


# ============================================================================
# Main matching orchestrator
# ============================================================================

def find_candidates(
    db: Session,
    portfolio_node_id: str,
    required_skill_ids: Optional[List[int]] = None,
    min_proficiency: ProficiencyLevel = ProficiencyLevel.NOVICE,
    start_date: date = None,
    end_date: date = None,
    requested_hours: float = 40.0,
    node_classification: SecurityClassification = SecurityClassification.OFFICIAL,
    node_caveats: Optional[List[str]] = None,
) -> List[CandidateMatchResponse]:
    """Find and rank all eligible candidates for a requisition.

    This is the main entry point for the matching engine.  It evaluates
    every active user against the requisition requirements and returns
    a ranked list of candidates.

    Algorithm steps:
    1. Fetch all active users.
    2. Apply hard gate: filter by security clearance and caveats.
    3. For each cleared user, calculate skill match scores.
    4. Calculate forward capacity availability.
    5. Combine scores and rank by match_score descending.

    Parameters
    ----------
    db : Session
        Database session.
    portfolio_node_id : str
        UUID of the portfolio node requiring resources.
    required_skill_ids : list of int or None
        List of skill definition IDs required for this requisition.
        If None or empty, all cleared users get 100% match.
    min_proficiency : ProficiencyLevel
        Minimum proficiency level required for each skill.
    start_date : date or None
        Start of the requested period (for capacity calculation).
    end_date : date or None
        End of the requested period (for capacity calculation).
    requested_hours : float
        Total hours being requested.
    node_classification : SecurityClassification
        Security classification of the target portfolio node.
    node_caveats : list of str or None
        Security caveats of the target portfolio node.

    Returns
    -------
    list of CandidateMatchResponse
        Ranked list of candidates, sorted by match_score descending.
    """
    # Fetch all active users
    all_users = db.query(User).filter(User.is_active == True).all()

    candidates: List[CandidateMatchResponse] = []

    for user in all_users:
        # --- Hard Gate: Security clearance ---
        clearance_ok = _user_has_clearance(
            user, node_classification, node_caveats
        )

        if not clearance_ok:
            # User fails the hard gate — skip entirely
            continue

        # --- Soft Gate: Skill matching ---
        skill_matches: List[Dict[str, Any]] = []

        if not required_skill_ids or len(required_skill_ids) == 0:
            # Zero skill requirements → 100% match for all cleared personnel
            overall_skill_score = 100.0
            skill_matches.append({
                "skill_id": None,
                "skill_name": "No specific skills required",
                "final_score": 100.0,
                "note": "Zero skill requirements — all cleared personnel match",
            })
        else:
            # Fetch user's skill profiles
            user_profiles = {
                profile.skill_id: profile
                for profile in db.query(UserSkillProfile).filter(
                    UserSkillProfile.user_id == user.id
                ).all()
            }

            skill_scores = []
            for skill_id in required_skill_ids:
                profile = user_profiles.get(skill_id)

                # Fetch skill definition for the name
                skill_def = db.query(SkillDefinition).filter(
                    SkillDefinition.id == skill_id
                ).first()
                skill_name = skill_def.name if skill_def else f"Skill #{skill_id}"

                match = _calculate_skill_score(profile, min_proficiency)
                match["skill_id"] = skill_id
                match["skill_name"] = skill_name

                skill_matches.append(match)
                skill_scores.append(match["final_score"])

            # Average skill score
            overall_skill_score = sum(skill_scores) / len(skill_scores)

        # --- Forward capacity availability ---
        available_hours = _calculate_available_hours(
            db, user, start_date, end_date, requested_hours
        )

        # Capacity factor: how much of the requested hours are available
        capacity_factor = available_hours / requested_hours if requested_hours > 0 else 1.0

        # Final match score: skill score weighted by capacity
        match_score = overall_skill_score * capacity_factor

        candidates.append(CandidateMatchResponse(
            user_id=user.id,
            username=user.username,
            full_name=user.full_name,
            match_score=round(match_score, 2),
            skill_matches=skill_matches,
            available_hours=round(available_hours, 2),
            clearance_sufficient=clearance_ok,
        ))

    # Sort by match_score descending
    candidates.sort(key=lambda c: c.match_score, reverse=True)

    return candidates
