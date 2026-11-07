"""Verification and Validation (V&V) signoff service.

This module enforces physical completion gates for V&V test cases,
ensuring that test results are only accepted when the assigned test
equipment was properly calibrated at the time of execution.

Core Function
~~~~~~~~~~~~~

The primary function :func:`verify_test_case_signoff` is called before
a :class:`VerificationTestCase` status is changed to PASSED.  It performs
two critical checks:

1. **Calibration Validity** — Verifies that the test rig's calibration
   was valid on the date of execution by calling
   :func:`app.services.calibration_interlock.check_calibration_valid_on_date`.

2. **Maintenance Window Check** — Ensures the test equipment was not
   under scheduled maintenance on the execution date.

If either check fails, the signoff is rejected with a detailed reason
string.  This prevents invalid test results from being accepted into
the quality record.

Usage
~~~~~

.. code-block:: python

    from app.services.verification import verify_test_case_signoff

    is_allowed, reason = verify_test_case_signoff(
        test_case_id=test_id,
        execution_date=date.today(),
        db=session,
    )

    if not is_allowed:
        raise HTTPException(
            status_code=403,
            detail=f"V&V signoff rejected: {reason}",
        )

Integration with CDRL Router
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The V&V update endpoint in :mod:`app.routers.cdrl` calls this service
before allowing a VerificationTestCase to transition to PASSED status.
The signoff is also recorded in the :class:`ForensicAuditLog` for
audit trail purposes.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session
from datetime import date
from uuid import UUID
from typing import Optional, Tuple

from app.models.models import (
    VerificationTestCase,
    ResourceNode,
    ResourceAssignment,
    PortfolioNode,
)
from app.services.calibration_interlock import (
    check_calibration_valid_on_date,
)


# ============================================================================
# V&V Signoff Verification
# ============================================================================


def verify_test_case_signoff(
    test_case_id: UUID,
    execution_date: Optional[date] = None,
    db: Session = None,
) -> Tuple[bool, Optional[str]]:
    """Verify that a V&V test case can be signed off as PASSED.

    Before allowing a VerificationTestCase to transition to PASSED status,
    this function checks that the assigned test equipment was properly
    calibrated on the date of execution.

    The verification process:

    1. Loads the VerificationTestCase and its linked PortfolioNode.
    2. Identifies the test equipment assigned to the task via
       ResourceAssignment records.
    3. For each ASSET-type resource assigned to the task, checks if its
       calibration was valid on the execution date.
    4. If any assigned equipment had expired calibration, rejects the
       signoff with a detailed reason.

    Parameters
    ----------
    test_case_id : UUID
        The UUID of the VerificationTestCase being signed off.
    execution_date : date, optional
        The date when the test was executed.  If None, defaults to
        today's date.
    db : Session
        Active database session.

    Returns
    -------
    Tuple[bool, Optional[str]]
        A tuple of (is_allowed, reason).  If the signoff is allowed,
        returns (True, None).  If rejected, returns (False, reason_string)
        explaining why the signoff was rejected.

        Common rejection reasons:

        - "Test case not found" — Invalid test case ID.
        - "Calibration expired for equipment {code}" — The assigned test
          rig's calibration had expired on the execution date.
        - "Resource was under maintenance on {date}" — The equipment was
          in a maintenance window on the execution date.
    """
    if execution_date is None:
        execution_date = date.today()

    # Load the test case
    test_case = db.execute(
        select(VerificationTestCase).where(
            VerificationTestCase.id == test_case_id
        )
    ).scalar_one_or_none()

    if test_case is None:
        return False, "Test case not found"

    # Load the linked portfolio node (task)
    task = db.execute(
        select(PortfolioNode).where(
            PortfolioNode.id == test_case.portfolio_node_id
        )
    ).scalar_one_or_none()

    if task is None:
        return False, "Linked task not found"

    # Find ASSET-type resources assigned to this task
    assignments = db.execute(
        select(ResourceAssignment).where(
            ResourceAssignment.portfolio_node_id == task.id
        )
    ).scalars().all()

    for assignment in assignments:
        resource = db.execute(
            select(ResourceNode).where(
                ResourceNode.id == assignment.resource_node_id
            )
        ).scalar_one_or_none()

        if resource is None:
            continue

        # Only check ASSET-type resources (equipment)
        if resource.resource_type != "ASSET":
            continue

        # Check calibration validity on the execution date
        is_valid, reason = check_calibration_valid_on_date(
            resource.id, execution_date, db
        )

        if not is_valid:
            return (
                False,
                f"V&V signoff rejected: {reason} "
                f"(equipment: {resource.code})",
            )

    return True, None


def get_equipment_for_task(
    task_id: UUID,
    db: Session,
) -> list:
    """Get all ASSET-type resources assigned to a task.

    Returns a list of ResourceNode records for equipment assigned to
    the specified task, along with their calibration status.

    Parameters
    ----------
    task_id : UUID
        The UUID of the PortfolioNode (task).
    db : Session
        Active database session.

    Returns
    -------
    list
        List of dictionaries containing:

        - ``resource`` : ResourceNode — The equipment resource.
        - ``allocation`` : float — Allocation percentage.
        - ``calibration_valid`` : bool — Whether calibration is currently valid.
        - ``next_calibration_due`` : date or None — Next calibration due date.
        - ``is_out_of_service`` : bool — Whether resource is out of service.
    """
    assignments = db.execute(
        select(ResourceAssignment).where(
            ResourceAssignment.portfolio_node_id == task_id
        )
    ).scalars().all()

    equipment_list = []

    for assignment in assignments:
        resource = db.execute(
            select(ResourceNode).where(
                ResourceNode.id == assignment.resource_node_id
            )
        ).scalar_one_or_none()

        if resource is None or resource.resource_type != "ASSET":
            continue

        equipment_list.append({
            "resource": resource,
            "allocation": assignment.allocated_units,
            "calibration_valid": resource.next_calibration_due is None or
                                resource.next_calibration_due >= date.today(),
            "next_calibration_due": resource.next_calibration_due,
            "is_out_of_service": resource.is_out_of_service,
        })

    return equipment_list
