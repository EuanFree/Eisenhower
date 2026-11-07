"""Unit tests for the V&V signoff verification service.

This module tests the calibration interlock enforcement in
``app/services/verification`` that prevents V&V test cases from being
signed off as PASSED when assigned equipment has expired calibration.

Tests cover:

- **Valid Signoff** — Verifies that test cases with properly calibrated
  equipment can be signed off.
- **Expired Calibration Rejection** — Verifies that test cases with
  expired equipment calibration are rejected.
- **No Tracking Passes** — Verifies that equipment without calibration
  tracking allows signoff by default.
- **Missing Test Case** — Verifies that non-existent test cases are
  handled gracefully.

All tests use in-memory SQLite via the shared ``conftest.py`` fixtures.
"""
import pytest
from datetime import date, datetime, timedelta
from uuid import uuid4

from app.models.models import (
    ResourceNode,
    PortfolioNode,
    VerificationTestCase,
    ResourceAssignment,
    AssignmentStatus,
    SecurityClassification,
    MaintenanceDowntimeWindow,
    MaintenanceType,
)
from app.services.verification import verify_test_case_signoff


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def test_task(db_session):
    """Create a test PortfolioNode representing a test execution task.

    Returns
    -------
    PortfolioNode
        A task node with OFFICIAL classification.
    """
    task = PortfolioNode(
        code="TASK-VVC-001",
        name="V&V Test Execution",
        tree_type="WBS",
        security_classification=SecurityClassification.OFFICIAL,
        caveats=[],
        path="1.1",
        delivery_mode="WATERFALL",
        planned_start_date=datetime(2026, 3, 1),
        planned_end_date=datetime(2026, 3, 31),
        percent_complete=0.0,
        is_active=True,
    )
    db_session.add(task)
    db_session.commit()
    return task


@pytest.fixture
def test_equipment_calibrated(db_session):
    """Create a calibrated ASSET resource.

    Returns
    -------
    ResourceNode
        An equipment resource with valid calibration.
    """
    equip = ResourceNode(
        code="RIG-001",
        name="Calibrated Test Rig",
        tree_type="RBS",
        security_classification=SecurityClassification.OFFICIAL,
        caveats=[],
        path="1",
        resource_type="ASSET",
        standard_hourly_rate=500.0,
        is_generic_placeholder=False,
        is_active=True,
        serial_number="RIG-SN-001",
        calibration_interval_days=365,
        last_calibration_date=date(2026, 1, 1),
        next_calibration_due=date(2027, 1, 1),
        is_out_of_service=False,
    )
    db_session.add(equip)
    db_session.commit()
    return equip


@pytest.fixture
def test_equipment_expired(db_session):
    """Create an ASSET resource with expired calibration.

    Returns
    -------
    ResourceNode
        An equipment resource with expired calibration.
    """
    equip = ResourceNode(
        code="RIG-EXP",
        name="Expired Test Rig",
        tree_type="RBS",
        security_classification=SecurityClassification.OFFICIAL,
        caveats=[],
        path="2",
        resource_type="ASSET",
        standard_hourly_rate=500.0,
        is_generic_placeholder=False,
        is_active=True,
        serial_number="RIG-SN-EXP",
        calibration_interval_days=365,
        last_calibration_date=date(2025, 1, 1),
        next_calibration_due=date(2026, 1, 1),
        is_out_of_service=False,
    )
    db_session.add(equip)
    db_session.commit()
    return equip


@pytest.fixture
def test_equipment_no_tracking(db_session):
    """Create an ASSET resource without calibration tracking.

    Returns
    -------
    ResourceNode
        An equipment resource with no calibration dates.
    """
    equip = ResourceNode(
        code="RIG-NOTRACK",
        name="Untracked Test Rig",
        tree_type="RBS",
        security_classification=SecurityClassification.OFFICIAL,
        caveats=[],
        path="3",
        resource_type="ASSET",
        standard_hourly_rate=200.0,
        is_generic_placeholder=False,
        is_active=True,
        serial_number=None,
        calibration_interval_days=None,
        last_calibration_date=None,
        next_calibration_due=None,
        is_out_of_service=False,
    )
    db_session.add(equip)
    db_session.commit()
    return equip


@pytest.fixture
def test_vvc(db_session, test_task):
    """Create a VerificationTestCase linked to the test task.

    Returns
    -------
    VerificationTestCase
        A V&V test case in NOT_RUN status.
    """
    vvc = VerificationTestCase(
        portfolio_node_id=test_task.id,
        test_identifier="VVC-001",
        title="Functional Test",
        standard_reference="DO-178C Level A",
        is_mandatory=True,
        status="NOT_RUN",
    )
    db_session.add(vvc)
    db_session.commit()
    return vvc


@pytest.fixture
def test_assignment(db_session, test_task, test_equipment_calibrated):
    """Create a ResourceAssignment linking equipment to the task.

    Returns
    -------
    ResourceAssignment
        A confirmed resource assignment.
    """
    assignment = ResourceAssignment(
        portfolio_node_id=test_task.id,
        resource_node_id=test_equipment_calibrated.id,
        allocated_units=1.0,
        planned_hours=40.0,
        rate_snapshot=500.0,
        status=AssignmentStatus.CONFIRMED,
    )
    db_session.add(assignment)
    db_session.commit()
    return assignment


# ============================================================================
# V&V Signoff Verification Tests
# ============================================================================


class TestVerifyTestCaseSignoff:
    """Tests for verify_test_case_signoff()."""

    def test_valid_signoff_with_calibrated_equipment(
        self, db_session, test_vvc, test_task, test_equipment_calibrated, test_assignment
    ):
        """Should allow signoff when equipment calibration is valid."""
        is_allowed, reason = verify_test_case_signoff(
            test_vvc.id,
            execution_date=date(2026, 3, 15),
            db=db_session,
        )
        assert is_allowed is True
        assert reason is None

    def test_reject_signoff_expired_calibration(
        self, db_session, test_vvc, test_task, test_equipment_expired
    ):
        """Should reject signoff when equipment calibration is expired."""
        # Assign expired equipment to the task
        assignment = ResourceAssignment(
            portfolio_node_id=test_task.id,
            resource_node_id=test_equipment_expired.id,
            allocated_units=1.0,
            planned_hours=40.0,
            rate_snapshot=500.0,
            status=AssignmentStatus.CONFIRMED,
        )
        db_session.add(assignment)
        db_session.commit()

        is_allowed, reason = verify_test_case_signoff(
            test_vvc.id,
            execution_date=date(2026, 3, 15),
            db=db_session,
        )
        assert is_allowed is False
        assert "Calibration expired" in reason

    def test_allow_signoff_no_calibration_tracking(
        self, db_session, test_vvc, test_task, test_equipment_no_tracking
    ):
        """Should allow signoff when equipment has no calibration tracking."""
        assignment = ResourceAssignment(
            portfolio_node_id=test_task.id,
            resource_node_id=test_equipment_no_tracking.id,
            allocated_units=1.0,
            planned_hours=40.0,
            rate_snapshot=200.0,
            status=AssignmentStatus.CONFIRMED,
        )
        db_session.add(assignment)
        db_session.commit()

        is_allowed, reason = verify_test_case_signoff(
            test_vvc.id,
            execution_date=date(2026, 3, 15),
            db=db_session,
        )
        assert is_allowed is True
        assert reason is None

    def test_allow_signoff_no_assigned_equipment(
        self, db_session, test_vvc
    ):
        """Should allow signoff when no ASSET equipment is assigned."""
        is_allowed, reason = verify_test_case_signoff(
            test_vvc.id,
            execution_date=date(2026, 3, 15),
            db=db_session,
        )
        assert is_allowed is True
        assert reason is None

    def test_reject_signoff_nonexistent_vvc(self, db_session):
        """Should reject signoff for non-existent test case."""
        fake_id = uuid4()
        is_allowed, reason = verify_test_case_signoff(
            fake_id,
            execution_date=date(2026, 3, 15),
            db=db_session,
        )
        assert is_allowed is False
        assert "not found" in reason

    def test_default_execution_date_is_today(
        self, db_session, test_vvc, test_task, test_equipment_calibrated, test_assignment
    ):
        """Should default execution_date to today when not specified."""
        is_allowed, reason = verify_test_case_signoff(
            test_vvc.id,
            db=db_session,
        )
        assert is_allowed is True
        assert reason is None

    def test_reject_signoff_multiple_equipment_one_expired(
        self, db_session, test_vvc, test_task, test_equipment_calibrated, test_equipment_expired
    ):
        """Should reject signoff if any assigned equipment has expired calibration."""
        # Assign both calibrated and expired equipment
        assignment1 = ResourceAssignment(
            portfolio_node_id=test_task.id,
            resource_node_id=test_equipment_calibrated.id,
            allocated_units=0.5,
            planned_hours=20.0,
            rate_snapshot=500.0,
            status=AssignmentStatus.CONFIRMED,
        )
        assignment2 = ResourceAssignment(
            portfolio_node_id=test_task.id,
            resource_node_id=test_equipment_expired.id,
            allocated_units=0.5,
            planned_hours=20.0,
            rate_snapshot=500.0,
            status=AssignmentStatus.CONFIRMED,
        )
        db_session.add(assignment1)
        db_session.add(assignment2)
        db_session.commit()

        is_allowed, reason = verify_test_case_signoff(
            test_vvc.id,
            execution_date=date(2026, 3, 15),
            db=db_session,
        )
        assert is_allowed is False
        assert "Calibration expired" in reason

    def test_allow_signoff_person_resource_only(
        self, db_session, test_vvc, test_task
    ):
        """Should allow signoff when only PERSON resources are assigned."""
        person = ResourceNode(
            code="ENG-001",
            name="Test Engineer",
            tree_type="RBS",
            security_classification=SecurityClassification.OFFICIAL,
            caveats=[],
            path="4",
            resource_type="PERSON",
            standard_hourly_rate=100.0,
            is_generic_placeholder=False,
            is_active=True,
        )
        db_session.add(person)
        db_session.commit()

        assignment = ResourceAssignment(
            portfolio_node_id=test_task.id,
            resource_node_id=person.id,
            allocated_units=1.0,
            planned_hours=40.0,
            rate_snapshot=100.0,
            status=AssignmentStatus.CONFIRMED,
        )
        db_session.add(assignment)
        db_session.commit()

        is_allowed, reason = verify_test_case_signoff(
            test_vvc.id,
            execution_date=date(2026, 3, 15),
            db=db_session,
        )
        assert is_allowed is True
        assert reason is None
