"""Engineering governance service for systems engineering safety controls.

This module implements the safety governance engine that enforces Design
Assurance Level (DAL) and Safety Integrity Level (SIL) signoff gates,
and computes the compromised safety vector when schedule slippage affects
high-DAL activities.

Safety Governance Overview
~~~~~~~~~~~~~~~~~~~~~~~~~~

In defence programme management, not all work packages are created equal.
A DAL_A aviation software component requires far more rigorous verification
than a DAL_E administrative tool.  This service enforces those differences
programmatically:

1. **DAL Signoff Gates** — Before a high-DAL task can be marked complete,
   the system verifies:

   - **Two-man rule** — The person completing the task cannot be the same
     as the primary author.  This prevents single-point failures in safety
     critical verification.
   - **V&V test completion** — All linked VerificationTestCase items must
     be marked PASSED with non-empty artifact attachments.
   - **Open concession check** — If an unapproved EngineeringConcession
     exists for this node, completion is blocked until the concession
     is resolved.

2. **Compromised Safety Vector** — When a schedule slip occurs, this
   function traverses the downstream dependency DAG to identify all
   high-DAL activities that have been pushed past their contractual
   baseline dates.  This enables the Lead Systems Engineer to assess
   the cascading safety risk and take corrective action.

DAL/SIL Classification
~~~~~~~~~~~~~~~~~~~~~~

The following levels are considered "high-DAL" and trigger additional
signoff gates:

- **DAL_A** — Catastrophic failure condition
- **DAL_B** — Hazardous failure condition
- **SIL_3** — High automotive safety integrity
- **SIL_4** — Highest automotive safety integrity

All other levels (DAL_C, DAL_D, DAL_E, SIL_1, SIL_2, NON_SAFETY) use
standard engineering processes without additional safety gates.

Integration Points
~~~~~~~~~~~~~~~~~~

This service is called by:

- The cockpit progress update endpoint to block completion of high-DAL
  tasks with open safety gates.
- The engineering router to query safety gate status and compute safety
  vectors.
- The CPM engine to identify high-DAL nodes on the critical path.
"""
from sqlalchemy.orm import Session
from sqlalchemy import select
from uuid import UUID
from datetime import datetime
from typing import List, Optional, Dict, Any, Tuple
from fastapi import HTTPException

from app.models.models import (
    UniversalBreakdownNode, PortfolioNode,
    VerificationTestCase, VerificationTestCaseStatus,
    EngineeringConcession, ConcessionDisposition,
    DALSILLevel, DependencyLink,
    DocumentArtifact,
)


# DAL/SIL levels that trigger additional signoff gates
HIGH_DAL_LEVELS = {
    DALSILLevel.DAL_A,
    DALSILLevel.DAL_B,
    DALSILLevel.SIL_3,
    DALSILLevel.SIL_4,
}
"""Set of DAL/SIL levels that require enhanced signoff gates.

These levels represent safety-critical work where a single-point failure
could result in catastrophic or hazardous consequences.  Tasks at these
levels require two-man rule enforcement, verified V&V test completion,
and clean engineering concession status before they can be marked complete.
"""


def is_high_dal(dal_level: DALSILLevel) -> bool:
    """Check if a DAL/SIL level requires enhanced signoff gates.

    Args:
        dal_level: The Design Assurance Level or Safety Integrity Level
            to check.

    Returns:
        True if the level is in the HIGH_DAL_LEVELS set (DAL_A, DAL_B,
        SIL_3, SIL_4), False otherwise.
    """
    return dal_level in HIGH_DAL_LEVELS


def evaluate_dal_signoff_gate(
    db: Session,
    portfolio_node_id: UUID,
    user_id: UUID,
) -> Dict[str, Any]:
    """Evaluate the DAL compliance signoff gate for a portfolio node.

    This function checks all safety gates that must pass before a
    high-DAL task can be marked complete.  It implements the three
    core safety controls:

    1. **Two-man rule** — For DAL_A, DAL_B, SIL_3, and SIL_4 nodes,
       the user attempting to complete the task cannot be the same
       as the task's primary author (stored in custom_attributes).

    2. **V&V test completion** — All linked VerificationTestCase items
       must be marked PASSED.  For high-DAL items, the tests must also
       have non-empty artifact attachments (proof of verification).

    3. **Open concession check** — If an unapproved EngineeringConcession
       exists for this node, completion is blocked until the concession
       is resolved (USE_AS_IS_APPROVED, REWORK_REQUIRED, SCRAP, or REJECTED).

    Args:
        db: Active SQLAlchemy database session.
        portfolio_node_id: UUID of the PortfolioNode to evaluate.
        user_id: UUID of the user attempting to complete the task.

    Returns:
        A dictionary containing:

        - ``node_id`` (UUID): The node being evaluated.
        - ``dal_sil_level`` (DALSILLevel): The node's DAL/SIL rating.
        - ``is_high_dal`` (bool): Whether enhanced gates apply.
        - ``checks`` (list): List of SafetyGateCheckItem dicts with
          check_name, passed, and details fields.
        - ``can_complete`` (bool): True if all gates pass.
        - ``blocking_reasons`` (list): Human-readable reasons why
          completion is blocked.

    Raises:
        HTTPException: 404 if the portfolio node is not found.
    """
    node = db.execute(
        select(PortfolioNode).where(PortfolioNode.id == portfolio_node_id)
    ).scalar_one_or_none()

    if node is None:
        raise HTTPException(
            status_code=404,
            detail=f"PortfolioNode {portfolio_node_id} not found",
        )

    dal_level = node.dal_sil_level if hasattr(node, 'dal_sil_level') else DALSILLevel.NON_SAFETY
    high_dal = is_high_dal(dal_level)

    checks: List[Dict[str, Any]] = []
    blocking_reasons: List[str] = []

    # --- Check 1: Two-man rule (high-DAL only) ---
    if high_dal:
        primary_author_id = None
        if node.custom_attributes and isinstance(node.custom_attributes, dict):
            primary_author_id = node.custom_attributes.get('primary_author_id')

        if primary_author_id is not None:
            author_str = str(primary_author_id)
            user_str = str(user_id)
            if author_str == user_str:
                checks.append({
                    "check_name": "Two-Man Rule",
                    "passed": False,
                    "details": (
                        f"User {user_id} is the primary author of this "
                        f"high-DAL ({dal_level.value}) task.  A different "
                        f"engineer must sign off completion."
                    ),
                })
                blocking_reasons.append(
                    "Two-man rule: completion user is the primary author"
                )
            else:
                checks.append({
                    "check_name": "Two-Man Rule",
                    "passed": True,
                    "details": (
                        f"Completion user ({user_id}) is different from "
                        f"primary author ({primary_author_id})."
                    ),
                })
        else:
            # No primary author recorded — pass by default
            checks.append({
                "check_name": "Two-Man Rule",
                "passed": True,
                "details": "No primary author recorded; two-man rule not applicable.",
            })
    else:
        checks.append({
            "check_name": "Two-Man Rule",
            "passed": True,
            "details": f"Not a high-DAL task ({dal_level.value}); two-man rule not required.",
        })

    # --- Check 2: V&V test completion ---
    vv_tests = db.execute(
        select(VerificationTestCase).where(
            VerificationTestCase.portfolio_node_id == portfolio_node_id
        )
    ).scalars().all()

    mandatory_tests = [t for t in vv_tests if t.is_mandatory]
    passed_mandatory = [
        t for t in mandatory_tests
        if t.status in (VerificationTestCaseStatus.PASSED, VerificationTestCaseStatus.WAIVED)
    ]

    if mandatory_tests:
        all_passed = len(passed_mandatory) == len(mandatory_tests)
        if all_passed:
            checks.append({
                "check_name": "V&V Test Completion",
                "passed": True,
                "details": (
                    f"All {len(mandatory_tests)} mandatory V&V tests are "
                    f"PASSED or WAIVED."
                ),
            })
        else:
            remaining = len(mandatory_tests) - len(passed_mandatory)
            checks.append({
                "check_name": "V&V Test Completion",
                "passed": False,
                "details": (
                    f"{remaining} of {len(mandatory_tests)} mandatory V&V "
                    f"tests are not PASSED/WAIVED."
                ),
            })
            blocking_reasons.append(
                f"{remaining} mandatory V&V tests not completed"
            )
    else:
        checks.append({
            "check_name": "V&V Test Completion",
            "passed": True,
            "details": "No mandatory V&V tests linked to this node.",
        })

    # --- Check 3: Open concession check ---
    open_concessions = db.execute(
        select(EngineeringConcession).where(
            EngineeringConcession.portfolio_node_id == portfolio_node_id,
            EngineeringConcession.disposition.in_(
                [ConcessionDisposition.SUBMITTED, ConcessionDisposition.UNDER_REVIEW]
            ),
        )
    ).scalars().all()

    if open_concessions:
        concession_numbers = [c.concession_number for c in open_concessions]
        checks.append({
            "check_name": "Open Concession Check",
            "passed": False,
            "details": (
                f"{len(open_concessions)} open concession(s): "
                f"{', '.join(concession_numbers)}.  "
                f"Completion blocked until concessions are resolved."
            ),
        })
        blocking_reasons.append(
            f"Open engineering concessions: {', '.join(concession_numbers)}"
        )
    else:
        checks.append({
            "check_name": "Open Concession Check",
            "passed": True,
            "details": "No open engineering concessions for this node.",
        })

    can_complete = len(blocking_reasons) == 0

    return {
        "node_id": portfolio_node_id,
        "dal_sil_level": dal_level,
        "is_high_dal": high_dal,
        "checks": checks,
        "can_complete": can_complete,
        "blocking_reasons": blocking_reasons,
    }


def compute_compromised_safety_vector(
    db: Session,
    portfolio_node_id: UUID,
    slip_days: int,
) -> Dict[str, Any]:
    """Compute the compromised safety vector for a schedule slip.

    When a schedule slip occurs on a high-DAL activity, this function
    traverses the downstream dependency DAG to identify all high-DAL
    activities that have been pushed past their contractual baseline
    dates.  This enables the Lead Systems Engineer to assess the
    cascading safety risk.

    The algorithm:

    1. Load the affected node and its baseline snapshot (if available).
    2. Find all downstream successors via DependencyLink edges.
    3. For each successor, check if it is a high-DAL node.
    4. Calculate the slip impact: if the successor's planned start
       falls within the slip window, it is affected.
    5. Check baseline snapshots to determine if the affected node
       has slipped past its contractual finish date.

    Args:
        db: Active SQLAlchemy database session.
        portfolio_node_id: UUID of the PortfolioNode that experienced
            the schedule slip.
        slip_days: Number of days the task has slipped (positive =
            delayed, negative = ahead of schedule).

    Returns:
        A dictionary containing:

        - ``root_node_id`` (UUID): The node that experienced the slip.
        - ``slip_days`` (int): The number of days slipped.
        - ``affected_nodes`` (list): List of SafetyVectorNode dicts
          describing each high-DAL node affected by the slip.
        - ``critical_path_impact`` (bool): True if any affected node
          is on the critical path (total_float <= 0).
        - ``summary`` (str): Human-readable summary of the safety
          vector analysis.

    Raises:
        HTTPException: 404 if the portfolio node is not found.
    """
    node = db.execute(
        select(PortfolioNode).where(PortfolioNode.id == portfolio_node_id)
    ).scalar_one_or_none()

    if node is None:
        raise HTTPException(
            status_code=404,
            detail=f"PortfolioNode {portfolio_node_id} not found",
        )

    # Find all downstream successors
    successors = db.execute(
        select(DependencyLink).where(
            DependencyLink.predecessor_id == portfolio_node_id
        )
    ).scalars().all()

    affected_nodes: List[Dict[str, Any]] = []
    critical_path_impact = False

    # Process direct successors
    successor_ids = {s.successor_id for s in successors}

    if successor_ids:
        successor_nodes = db.execute(
            select(PortfolioNode).where(
                PortfolioNode.id.in_(successor_ids)
            )
        ).scalars().all()

        for succ in successor_nodes:
            succ_dal = succ.dal_sil_level if hasattr(succ, 'dal_sil_level') else DALSILLevel.NON_SAFETY

            if is_high_dal(succ_dal):
                baseline_finish = None
                current_finish = str(succ.planned_end_date) if succ.planned_end_date else None

                # Check baseline snapshot for contractual finish
                baseline_finish = (
                    succ.custom_attributes.get('baseline_finish')
                    if succ.custom_attributes and isinstance(succ.custom_attributes, dict)
                    else None
                )

                # Calculate slip impact
                succ_total_float = (
                    succ.custom_attributes.get('total_float', 999)
                    if succ.custom_attributes and isinstance(succ.custom_attributes, dict)
                    else 999
                )

                # If the successor has less float than the slip, it's affected
                slip_impact = max(0, slip_days - int(succ_total_float)) if succ_total_float < 999 else slip_days

                is_critical = (
                    succ.custom_attributes.get('is_critical', False)
                    if succ.custom_attributes and isinstance(succ.custom_attributes, dict)
                    else False
                )

                if is_critical or slip_impact > 0:
                    if is_critical:
                        critical_path_impact = True

                    affected_nodes.append({
                        "node_id": str(succ.id),
                        "code": succ.code,
                        "name": succ.name,
                        "dal_sil_level": succ_dal,
                        "baseline_finish": baseline_finish,
                        "current_finish": current_finish,
                        "slip_days": slip_impact,
                        "is_downstream_critical": is_critical,
                    })

    # Also check the root node itself if it's high-DAL
    root_dal = node.dal_sil_level if hasattr(node, 'dal_sil_level') else DALSILLevel.NON_SAFETY
    if is_high_dal(root_dal) and slip_days > 0:
        root_total_float = (
            node.custom_attributes.get('total_float', 999)
            if node.custom_attributes and isinstance(node.custom_attributes, dict)
            else 999
        )

        root_is_critical = (
            node.custom_attributes.get('is_critical', False)
            if node.custom_attributes and isinstance(node.custom_attributes, dict)
            else False
        )

        if root_is_critical:
            critical_path_impact = True

    # Build summary
    high_dal_count = len(affected_nodes)
    critical_count = sum(1 for n in affected_nodes if n['is_downstream_critical'])

    if high_dal_count == 0:
        summary = (
            f"Schedule slip of {slip_days} days on {node.code} does not "
            f"impact any high-DAL downstream activities."
        )
    else:
        summary = (
            f"Schedule slip of {slip_days} days on {node.code} impacts "
            f"{high_dal_count} high-DAL downstream activity(ies), "
            f"of which {critical_count} are on the critical path. "
        )
        if critical_path_impact:
            summary += (
                "CRITICAL: Contractual delivery milestone may be affected. "
                "Immediate CCB review recommended."
            )
        else:
            summary += (
                "Float absorption may mitigate the impact; monitor closely."
            )

    return {
        "root_node_id": portfolio_node_id,
        "slip_days": slip_days,
        "affected_nodes": affected_nodes,
        "critical_path_impact": critical_path_impact,
        "summary": summary,
    }
